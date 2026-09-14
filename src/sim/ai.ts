/**
 * Enemy AI (§21).
 *
 * A finite state machine per enemy, plus steering that combines "move towards
 * my preferred range" with "get out of my neighbours' way". The separation term
 * is the reason a pack surrounds the player instead of forming a conga line
 * into their weapon, which §21 explicitly asks for.
 */

import { StateMachine } from '@/core/fsm';
import { clamp, damp, dist, normalise } from '@/core/math';
import type { Rng } from '@/core/rng';
import type { Actor } from './entity';
import type { EnemyAttack, EnemyDef } from './enemyDef';
import type { SimWorld } from './world';
import { applyShape, enemyPacket, type CombatShape } from './combat';
import { ELITE_MODIFIERS, type EliteModifier } from '@/data/elites.data';

export interface AiContext {
  actor: Actor;
  def: EnemyDef;
  world: SimWorld;
  rng: Rng;
  /** Where it was spawned — leashing returns it here. */
  homeX: number;
  homeY: number;
  target: Actor | null;
  /** The attack currently being executed, if any. */
  current: EnemyAttack | null;
  /** Remaining seconds in the current attack phase. */
  phaseTimer: number;
  phase: 'windup' | 'strike' | 'recover' | null;
  /** Cooldowns keyed by attack id. */
  cooldowns: Map<string, number>;
  /** Wander target while patrolling. */
  patrolX: number;
  patrolY: number;
  /** Elite modifiers applied to this actor. */
  elites: EliteModifier[];
  /** Ravenous stacking speed bonus. */
  frenzy: number;
  /** Boss phase index, 0-based. */
  bossPhase: number;
  /** Seconds until the trail modifier drops its next patch. */
  trailTimer: number;
  /** Seconds since it last had line of sight to its target. */
  sinceSeen: number;
  /** Whether this actor is a player summon (inverts hostility, follows player). */
  summonOwnerId: number | null;
  summonLife: number;
}

const ATTACK_SHAPES: Record<string, (a: EnemyAttack) => CombatShape> = {
  arc: (a) => ({ kind: 'melee_arc', ...(a.shape as { radius: number; halfAngle: number }) }),
  line: (a) => ({ kind: 'melee_line', ...(a.shape as { length: number; width: number }) }),
  self_aoe: (a) => ({ kind: 'self_aoe', ...(a.shape as { radius: number }) }),
  leap: (a) => ({ kind: 'leap', ...(a.shape as { distance: number; radius: number }) }),
  projectile: (a) => {
    const s = a.shape as { speed: number; count: number; spread: number; radius: number };
    return { kind: 'projectile', ...s, pierce: 0, lifetime: 3.0 };
  },
  ground: (a) => {
    const s = a.shape as { radius: number; delay: number; lingerDuration?: number; lingerDps?: number };
    return { kind: 'ground_aoe', radius: s.radius, range: a.range, delay: s.delay, lingerDuration: s.lingerDuration, lingerDps: s.lingerDps };
  },
};

export class EnemyController {
  readonly fsm: StateMachine<AiContext>;
  readonly ctx: AiContext;

  constructor(actor: Actor, def: EnemyDef, world: SimWorld, rng: Rng, elites: EliteModifier[] = []) {
    this.ctx = {
      actor, def, world, rng,
      homeX: actor.x, homeY: actor.y,
      target: null, current: null, phaseTimer: 0, phase: null,
      cooldowns: new Map(),
      patrolX: actor.x, patrolY: actor.y,
      elites, frenzy: 0, bossPhase: 0, trailTimer: 0, sinceSeen: 99,
      summonOwnerId: null, summonLife: 0,
    };
    this.fsm = buildStateMachine(this.ctx, this);
    this.fsm.transition('idle');
  }

  get actor(): Actor {
    return this.ctx.actor;
  }

  get def(): EnemyDef {
    return this.ctx.def;
  }

  get state(): string {
    return this.fsm.currentName;
  }

  update(dt: number): void {
    const { ctx } = this;
    const actor = ctx.actor;
    if (!actor.alive) {
      if (this.fsm.currentName !== 'dead') this.fsm.transition('dead');
      return;
    }

    for (const [id, t] of ctx.cooldowns) {
      if (t > 0) ctx.cooldowns.set(id, Math.max(0, t - dt));
    }

    if (ctx.summonLife > 0) {
      ctx.summonLife -= dt;
      if (ctx.summonLife <= 0) {
        ctx.world.killActor(actor, null);
        return;
      }
    }

    this.updateBossPhase();
    this.updateEliteBehaviour(dt);

    // A staggered enemy loses whatever it was doing — that is the payoff for
    // landing a heavy hit (§8).
    if (actor.action === 'staggered') {
      ctx.current = null;
      ctx.phase = null;
      actor.inputX = actor.inputY = 0;
      return;
    }

    this.fsm.update(dt);
    actor.integrate(dt, 26, 22);
  }

  /** Advances boss phases and announces them (§23). */
  private updateBossPhase(): void {
    const { ctx } = this;
    const { actor, def } = ctx;
    if (!def.isBoss || !def.phaseThresholds) return;
    const frac = actor.healthFraction;
    let phase = 0;
    for (const threshold of def.phaseThresholds) {
      if (frac <= threshold) phase++;
    }
    if (phase !== ctx.bossPhase) {
      ctx.bossPhase = phase;
      // Each phase makes the boss faster and shortens its recoveries, which is
      // how "increased pressure" is expressed without inflating its health.
      actor.stats.removeBySource('bossPhase');
      actor.stats.addModifiers([
        { stat: 'moveSpeed', pct: phase * 0.16, source: 'bossPhase' },
        { stat: 'attackSpeed', flat: phase * 0.12, source: 'bossPhase' },
        { stat: 'attackPower', pct: phase * 0.12, source: 'bossPhase' },
      ]);
      ctx.world.events.emit('BOSS_PHASE', { bossId: def.id, phase: phase + 1 });
    }
  }

  private updateEliteBehaviour(dt: number): void {
    const { ctx } = this;
    const actor = ctx.actor;
    for (const mod of ctx.elites) {
      const b = mod.behaviour;
      if (!b) continue;

      if (b.trail) {
        ctx.trailTimer -= dt;
        if (ctx.trailTimer <= 0 && actor.speed > 0.6) {
          ctx.trailTimer = 0.35;
          ctx.world.spawnGround({
            x: actor.x, y: actor.y, radius: b.trail.radius,
            delay: 0, duration: b.trail.duration, dps: b.trail.dps,
            damageType: 'fire', ownerId: actor.id, faction: actor.faction,
            tickAccumulator: 0, colour: mod.visual.tint, kind: 'elite_trail',
          } as never);
        }
      }

      if (b.wardAura) {
        // Re-applied every tick rather than tracked, so it disappears the
        // instant the warden dies — which is the tell that makes it worth
        // killing first.
        for (const ally of ctx.world.actorsInRadius(actor.x, actor.y, b.wardAura.radius)) {
          if (ally.faction !== actor.faction || ally.id === actor.id) continue;
          ally.stats.removeBySource('wardAura');
          ally.stats.addModifier({
            stat: 'damageTaken', pct: -b.wardAura.reduction, source: 'wardAura',
          });
        }
      }
    }

    if (ctx.frenzy > 0) {
      actor.stats.removeBySource('frenzy');
      actor.stats.addModifiers([
        { stat: 'attackSpeed', flat: ctx.frenzy * 0.5, source: 'frenzy' },
        { stat: 'moveSpeed', pct: ctx.frenzy * 0.5, source: 'frenzy' },
      ]);
    }
  }

  /** Called by the world when this enemy lands a hit, for leech/frenzy. */
  onLandedHit(damage: number): void {
    const { ctx } = this;
    const actor = ctx.actor;
    for (const mod of ctx.elites) {
      const b = mod.behaviour;
      if (!b) continue;
      if (b.frenzyPerHit) {
        ctx.frenzy = Math.min(b.frenzyCap ?? 0.6, ctx.frenzy + b.frenzyPerHit);
      }
      if (b.leech) ctx.world.heal(actor, damage * b.leech);
      if (b.onHitStatus && ctx.target) {
        ctx.world.applyStatus(ctx.target, b.onHitStatus, actor.id);
      }
    }
  }

  /** Called when this enemy dies, for the death-blast modifiers. */
  onDeath(): void {
    const { ctx } = this;
    const actor = ctx.actor;
    for (const mod of ctx.elites) {
      const blast = mod.behaviour?.deathBlast;
      if (!blast) continue;
      ctx.world.spawnGround({
        x: actor.x, y: actor.y, radius: blast.radius,
        delay: 0.55, duration: 0, dps: 0, damageType: blast.type,
        ownerId: actor.id, faction: actor.faction, tickAccumulator: 0,
        colour: mod.visual.tint, kind: 'elite_blast',
        burst: {
          amounts: { [blast.type]: blast.damage },
          staggerPower: 30, knockback: 3,
          tag: 'elite_blast',
        },
      } as never);
    }
    // Ward auras must not outlive their warden.
    for (const ally of ctx.world.actorsInRadius(actor.x, actor.y, 12)) {
      ally.stats.removeBySource('wardAura');
    }
  }
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

/**
 * Produces a movement direction that heads for `preferredRange` from the target
 * while pushing away from crowded neighbours and sliding along walls.
 */
function steer(ctx: AiContext, targetX: number, targetY: number, preferred: number, strafeAmount: number): void {
  const { actor, world } = ctx;
  const d = dist(actor.x, actor.y, targetX, targetY);
  let dx = targetX - actor.x;
  let dy = targetY - actor.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  // Approach, hold, or back off depending on which side of the band we are on.
  let wantX: number;
  let wantY: number;
  if (d > preferred * 1.15) {
    wantX = dx; wantY = dy;
  } else if (d < preferred * 0.72) {
    wantX = -dx; wantY = -dy;
  } else {
    wantX = 0; wantY = 0;
  }

  // Strafe: a consistent per-actor orbit direction, so a group spreads around
  // the target rather than oscillating in place.
  if (strafeAmount > 0) {
    const side = (actor.id % 2 === 0) ? 1 : -1;
    wantX += -dy * side * strafeAmount;
    wantY += dx * side * strafeAmount;
  }

  // Separation from nearby allies.
  let sepX = 0;
  let sepY = 0;
  for (const other of world.actorsInRadius(actor.x, actor.y, actor.radius * 3.2)) {
    if (other.id === actor.id || other.faction !== actor.faction) continue;
    const ox = actor.x - other.x;
    const oy = actor.y - other.y;
    const od = Math.hypot(ox, oy) || 0.001;
    const push = clamp(1 - od / (actor.radius * 3.2), 0, 1);
    sepX += (ox / od) * push;
    sepY += (oy / od) * push;
  }
  wantX += sepX * 0.9;
  wantY += sepY * 0.9;

  // Obstacle avoidance: if the direct step is blocked, try sliding along each
  // axis before giving up, which prevents enemies grinding into wall corners.
  const probe = 0.6;
  if (!world.grid.worldWalkable(actor.x + wantX * probe, actor.y + wantY * probe)) {
    const slideX = world.grid.worldWalkable(actor.x + wantX * probe, actor.y);
    const slideY = world.grid.worldWalkable(actor.x, actor.y + wantY * probe);
    if (slideX && !slideY) wantY = 0;
    else if (slideY && !slideX) wantX = 0;
    else { wantX = -dy; wantY = dx; }
  }

  const n = normalise({ x: wantX, y: wantY });
  actor.inputX = n.x;
  actor.inputY = n.y;
}

// ---------------------------------------------------------------------------
// Attack selection and execution
// ---------------------------------------------------------------------------

/** Chooses an attack that is off cooldown, in range, and legal for the phase. */
function selectAttack(ctx: AiContext, distance: number): EnemyAttack | null {
  const { actor, def, rng } = ctx;
  const frac = actor.healthFraction;
  const usable = def.attacks.filter((a) => {
    if ((ctx.cooldowns.get(a.id) ?? 0) > 0) return false;
    if (distance > a.range + (ctx.target?.radius ?? 0)) return false;
    if (a.belowHealth !== undefined && frac > a.belowHealth) return false;
    if (a.aboveHealth !== undefined && frac < a.aboveHealth) return false;
    return true;
  });
  if (usable.length === 0) return null;
  return rng.weighted(usable, (a) => a.weight) ?? usable[0]!;
}

function beginAttack(ctx: AiContext, attack: EnemyAttack): void {
  const { actor } = ctx;
  const speed = Math.max(0.4, actor.stats.get('attackSpeed'));
  ctx.current = attack;
  ctx.phase = 'windup';
  ctx.phaseTimer = attack.windup / speed;
  actor.action = 'windup';
  actor.inputX = actor.inputY = 0;
  if (ctx.target) actor.snapFacing(ctx.target.x, ctx.target.y);
}

/** Runs the windup → strike → recover cycle. Returns true while still busy. */
function tickAttack(ctx: AiContext, dt: number, controller: EnemyController): boolean {
  if (!ctx.current || !ctx.phase) return false;
  const { actor, world, def } = ctx;
  const speed = Math.max(0.4, actor.stats.get('attackSpeed'));
  const attack = ctx.current;

  ctx.phaseTimer -= dt;

  // During wind-up the enemy keeps turning slowly, so a telegraph can still be
  // dodged by circling but not by simply walking sideways.
  if (ctx.phase === 'windup') {
    if (ctx.target) actor.faceTowards(ctx.target.x, ctx.target.y, dt, 3.2);
    actor.action = 'windup';
    if (ctx.phaseTimer <= 0) {
      ctx.phase = 'strike';
      ctx.phaseTimer = attack.strike / speed;
      actor.action = 'strike';

      const aim = ctx.target ?? actor;
      const builder = ATTACK_SHAPES[attack.shape.kind];
      if (builder) {
        const result = applyShape(
          {
            world, caster: actor,
            aimX: aim.x, aimY: aim.y,
            packet: enemyPacket(actor, attack, world.rng),
            applies: attack.applies,
            colour: 0xb5432a,
            kind: `enemy_${attack.id}`,
            onHit: (_t, _killed) => controller.onLandedHit(
              (attack.damage[0] + attack.damage[1]) * 0.5,
            ),
          },
          builder(attack),
        );
        // The Bone-Gleaner's "Glean" has no damage; it raises something instead.
        if (attack.id === 'raise') summonForGleaner(ctx);
        void result;
      }
      ctx.cooldowns.set(attack.id, attack.cooldown);
      world.events.emit('FX_HIT', {
        x: actor.x, y: actor.y, z: actor.height * 0.6,
        kind: `telegraph_${attack.id}`, amount: 0, crit: false,
      });
    }
    return true;
  }

  if (ctx.phase === 'strike') {
    actor.action = 'strike';
    if (ctx.phaseTimer <= 0) {
      ctx.phase = 'recover';
      ctx.phaseTimer = attack.recover / speed;
      actor.action = 'recover';
    }
    return true;
  }

  // recover
  actor.action = 'recover';
  if (ctx.phaseTimer <= 0) {
    ctx.phase = null;
    ctx.current = null;
    actor.action = 'idle';
    void def;
    return false;
  }
  return true;
}

/** The Bone-Gleaner raises a Hollowed near itself. Kept small deliberately. */
function summonForGleaner(ctx: AiContext): void {
  ctx.world.events.emit('FX_HIT', {
    x: ctx.actor.x, y: ctx.actor.y, z: 0, kind: 'glean', amount: 0, crit: false,
  });
  // The actual spawn is performed by the zone controller, which owns the
  // enemy factory; it listens for this marker on the context.
  ctx.pendingSummon = (ctx.pendingSummon ?? 0) + 1;
}

// Augment the context type with the summon marker without widening the public
// interface used by every other state.
declare module './ai' {
  interface AiContext {
    pendingSummon?: number;
  }
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function buildStateMachine(ctx: AiContext, controller: EnemyController): StateMachine<AiContext> {
  const fsm = new StateMachine<AiContext>(ctx);

  const acquire = (): Actor | null => {
    const { actor, def, world } = ctx;
    const found = world.nearest(actor.x, actor.y, def.aggroRange, {
      hostileTo: actor.faction,
      excludeId: actor.id,
      requireLineOfSight: true,
    });
    return found;
  };

  fsm.add({
    name: 'idle',
    enter: () => { ctx.actor.action = 'idle'; ctx.actor.inputX = ctx.actor.inputY = 0; },
    update: (_c, _dt) => {
      const t = acquire();
      if (t) { ctx.target = t; return 'alert'; }
      // Occasionally wander, so a still map does not look like a diorama.
      if (fsm.timeInState > 3 + ctx.rng.range(0, 4)) return 'patrol';
    },
  });

  fsm.add({
    name: 'patrol',
    enter: () => {
      const r = ctx.rng.range(2, 5);
      const a = ctx.rng.range(0, Math.PI * 2);
      const spot = ctx.world.grid.nearestWalkable(
        ctx.homeX + Math.cos(a) * r, ctx.homeY + Math.sin(a) * r,
      );
      ctx.patrolX = spot.x;
      ctx.patrolY = spot.y;
    },
    update: (_c, dt) => {
      const t = acquire();
      if (t) { ctx.target = t; return 'alert'; }
      const { actor } = ctx;
      steer(ctx, ctx.patrolX, ctx.patrolY, 0.3, 0);
      actor.faceTowards(actor.x + actor.inputX, actor.y + actor.inputY, dt, 6);
      actor.action = actor.speed > 0.3 ? 'moving' : 'idle';
      if (dist(actor.x, actor.y, ctx.patrolX, ctx.patrolY) < 0.6 || fsm.timeInState > 8) return 'idle';
    },
  });

  // A deliberate hesitation after spotting the player. It reads as the thing
  // noticing you, and it gives the player a beat to choose their opening (§23).
  fsm.add({
    name: 'alert',
    enter: () => { ctx.actor.action = 'idle'; ctx.actor.inputX = ctx.actor.inputY = 0; },
    update: (_c, dt) => {
      if (!ctx.target?.alive) { ctx.target = null; return 'idle'; }
      ctx.actor.faceTowards(ctx.target.x, ctx.target.y, dt, 8);
      if (fsm.timeInState >= ctx.def.alertTime) return 'chase';
    },
  });

  fsm.add({
    name: 'chase',
    update: (_c, dt) => {
      const { actor, def, world } = ctx;
      if (!ctx.target?.alive) { ctx.target = null; return 'idle'; }

      if (dist(actor.x, actor.y, ctx.homeX, ctx.homeY) > def.leashRange) return 'leash';
      if (def.fleeBelow > 0 && actor.healthFraction < def.fleeBelow) return 'flee';

      const seen = world.grid.lineOfSight(actor.x, actor.y, ctx.target.x, ctx.target.y);
      ctx.sinceSeen = seen ? 0 : ctx.sinceSeen + dt;
      // Give up after a while out of sight, rather than tracking through walls.
      if (ctx.sinceSeen > 4) { ctx.target = null; return 'idle'; }

      const d = dist(actor.x, actor.y, ctx.target.x, ctx.target.y);
      const attack = seen ? selectAttack(ctx, d) : null;
      if (attack) { beginAttack(ctx, attack); return 'attack'; }

      steer(ctx, ctx.target.x, ctx.target.y, def.preferredRange, def.strafe);
      actor.faceTowards(ctx.target.x, ctx.target.y, dt, 7);
      actor.action = actor.speed > 0.3 ? 'moving' : 'idle';
    },
  });

  fsm.add({
    name: 'attack',
    update: (_c, dt) => {
      if (!tickAttack(ctx, dt, controller)) {
        return ctx.target?.alive ? 'reposition' : 'idle';
      }
    },
  });

  // A short deliberate spacing beat after attacking. Without it, melee enemies
  // stand inside the player and chain-swing, which reads as unfair rather than
  // aggressive.
  fsm.add({
    name: 'reposition',
    update: (_c, dt) => {
      const { actor, def } = ctx;
      if (!ctx.target?.alive) { ctx.target = null; return 'idle'; }
      if (def.fleeBelow > 0 && actor.healthFraction < def.fleeBelow) return 'flee';

      steer(ctx, ctx.target.x, ctx.target.y, def.preferredRange * 1.25, def.strafe + 0.35);
      actor.faceTowards(ctx.target.x, ctx.target.y, dt, 6);
      actor.action = actor.speed > 0.3 ? 'moving' : 'idle';

      const wait = ctx.def.role === 'swarm' ? 0.18 : 0.45;
      if (fsm.timeInState > wait) return 'chase';
    },
  });

  fsm.add({
    name: 'flee',
    update: (_c, dt) => {
      const { actor, def } = ctx;
      if (!ctx.target?.alive) { ctx.target = null; return 'idle'; }
      // Run directly away, and stop fleeing once at a safe distance or healed.
      const away = { x: actor.x * 2 - ctx.target.x, y: actor.y * 2 - ctx.target.y };
      steer(ctx, away.x, away.y, 0.3, 0.2);
      actor.faceTowards(away.x, away.y, dt, 8);
      actor.action = 'moving';

      const d = dist(actor.x, actor.y, ctx.target.x, ctx.target.y);
      if (d > def.aggroRange * 1.2 || actor.healthFraction > def.fleeBelow + 0.2) return 'chase';
    },
  });

  fsm.add({
    name: 'leash',
    enter: () => { ctx.target = null; },
    update: (_c, dt) => {
      const { actor } = ctx;
      steer(ctx, ctx.homeX, ctx.homeY, 0.4, 0);
      actor.faceTowards(ctx.homeX, ctx.homeY, dt, 8);
      actor.action = 'moving';
      // Leashing heals it back up, so a player cannot whittle an enemy down by
      // kiting it in and out of its leash radius.
      actor.health = Math.min(actor.maxHealth, actor.health + actor.maxHealth * 0.25 * dt);
      if (dist(actor.x, actor.y, ctx.homeX, ctx.homeY) < 1.2) return 'idle';
    },
  });

  fsm.add({
    name: 'dead',
    enter: () => { ctx.actor.inputX = ctx.actor.inputY = 0; },
  });

  return fsm;
}

/** Rolls elite modifiers for an enemy, respecting exclusions. */
export function rollEliteModifiers(rng: Rng, count: number): EliteModifier[] {
  const chosen: EliteModifier[] = [];
  const excluded = new Set<string>();
  for (let i = 0; i < count; i++) {
    const pool = ELITE_MODIFIERS.filter(
      (m) => !excluded.has(m.id) && !chosen.includes(m),
    );
    const pick = rng.weighted(pool, (m) => m.weight);
    if (!pick) break;
    chosen.push(pick);
    excluded.add(pick.id);
    for (const ex of pick.excludes ?? []) excluded.add(ex);
  }
  return chosen;
}

export { damp };
