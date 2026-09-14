/**
 * Combat resolution: turns a skill or an enemy attack into effects in the world.
 *
 * Every offensive action in the game funnels through `applyShape`, so melee
 * arcs, thrusts, projectiles, ground areas, dashes and chains all share the same
 * damage, stagger, knockback and status paths. Adding a skill is data (§17);
 * adding a *kind* of skill is one new case here.
 */

import type { SimWorld } from './world';
import type { Actor } from './entity';
import type { SkillInstance } from './ability';
import type { EnemyAttack } from './enemyDef';
import type { DamagePacket } from './damage';
import type { DamageType } from './stats';
import type { StatusDef } from './status';
import { clamp, dist } from '@/core/math';

/** Where the weapon numbers come from for this particular swing. */
export interface WeaponProfile {
  readonly min: number;
  readonly max: number;
  readonly type: DamageType;
  readonly reach: number;
  readonly speed: number;
}

/** Bare-handed fallback so an unarmed character is weak, not broken. */
export const UNARMED: WeaponProfile = {
  min: 1, max: 3, type: 'physical', reach: 1.5, speed: 1.1,
};

export interface ShapeRequest {
  readonly world: SimWorld;
  readonly caster: Actor;
  /** World point the action is aimed at. */
  readonly aimX: number;
  readonly aimY: number;
  readonly packet: DamagePacket;
  readonly applies?: Omit<StatusDef, 'sourceId'>;
  readonly colour: number;
  readonly kind: string;
  /** Extra damage multiplier applied when the target is below `executeAt`. */
  readonly executeAt?: number;
  readonly executeMult?: number;
  readonly healOnHit?: number;
  readonly resourceOnHit?: number;
  /** Called for each actor actually hit — used by item effect hooks (§14). */
  readonly onHit?: (target: Actor, killed: boolean, crit: boolean) => void;
}

export interface ResolvedShape {
  readonly kind: string;
  readonly hits: number;
  readonly killed: number;
}

/** Builds the damage packet for a player skill from its definition. */
export function skillPacket(
  caster: Actor, skill: SkillInstance, weapon: WeaponProfile, rng: { range: (a: number, b: number) => number },
): DamagePacket | null {
  const d = skill.def.damage;
  if (!d) return null;

  const [lo, hi] = d.useWeapon ? [weapon.min, weapon.max] : (d.flat ?? [1, 2]);
  const rolled = rng.range(lo, hi);
  const power = d.spell ? caster.stats.get('spellPower') : caster.stats.get('attackPower');
  const type: DamageType = d.useWeapon && d.type === 'physical' ? weapon.type : d.type;

  return {
    amounts: { [type]: rolled * (1 + power / 100) },
    coefficient: d.coefficient * skill.damageMultiplier,
    staggerPower: skill.def.staggerPower ?? 0,
    knockback: skill.def.knockback ?? 0,
    tag: skill.def.id,
  };
}

/** Builds the damage packet for an enemy attack. */
export function enemyPacket(
  attacker: Actor, attack: EnemyAttack, rng: { range: (a: number, b: number) => number },
): DamagePacket {
  const [lo, hi] = attack.damage;
  const rolled = rng.range(lo, hi);
  const spell = attack.damageType !== 'physical';
  const power = spell ? attacker.stats.get('spellPower') : attacker.stats.get('attackPower');
  return {
    amounts: { [attack.damageType]: rolled * (1 + power / 100) },
    coefficient: 1,
    staggerPower: attack.staggerPower ?? 0,
    knockback: attack.knockback ?? 0,
    tag: attack.id,
  };
}

/** Applies an execute bonus, if the skill has one and the target qualifies. */
function withExecute(packet: DamagePacket, target: Actor, req: ShapeRequest): DamagePacket {
  if (!req.executeAt || !req.executeMult) return packet;
  if (target.healthFraction > req.executeAt) return packet;
  return { ...packet, coefficient: (packet.coefficient ?? 1) * req.executeMult };
}

/** Damages one actor and runs the shared post-hit bookkeeping. */
function hitOne(req: ShapeRequest, target: Actor, from?: { x: number; y: number }): boolean {
  const { world, caster } = req;
  const result = world.damage(caster, target, withExecute(req.packet, target, req), {
    knockbackFrom: from ?? { x: caster.x, y: caster.y },
  });

  if (req.applies && target.alive) world.applyStatus(target, req.applies, caster.id);
  if (req.healOnHit) world.heal(caster, req.healOnHit);
  if (req.resourceOnHit) {
    caster.resource = clamp(caster.resource + req.resourceOnHit, 0, caster.maxResource);
  }

  world.events.emit('FX_HIT', {
    x: target.x, y: target.y, z: target.height * 0.55,
    kind: req.kind, amount: result.total, crit: result.crit,
  });

  req.onHit?.(target, result.killed, result.crit);
  return result.killed;
}

// ---------------------------------------------------------------------------
// Shape dispatch
// ---------------------------------------------------------------------------

export type CombatShape =
  | { kind: 'melee_arc'; radius: number; halfAngle: number; maxTargets?: number }
  | { kind: 'melee_line'; length: number; width: number }
  | { kind: 'projectile'; speed: number; count: number; spread: number; pierce: number; radius: number; lifetime: number }
  | { kind: 'ground_aoe'; radius: number; range: number; delay: number; lingerDuration?: number; lingerDps?: number }
  | { kind: 'self_aoe'; radius: number }
  | { kind: 'dash'; distance: number; damageRadius?: number }
  | { kind: 'curse'; range: number; radius?: number }
  | { kind: 'chain'; range: number; jumps: number; jumpRange: number }
  | { kind: 'leap'; distance: number; radius: number };

/**
 * Executes a combat shape. `areaScale` widens every radius, which is how the
 * "+area of effect" affix and the Ashen's `areaSize` stat take effect without
 * each skill knowing about them (§18).
 */
export function applyShape(
  req: ShapeRequest, shape: CombatShape, areaScale = 1,
): ResolvedShape {
  const { world, caster } = req;
  const opts = { hostileTo: caster.faction, excludeId: caster.id } as const;
  let hits = 0;
  let killed = 0;

  const strike = (targets: Actor[], limit?: number, from?: { x: number; y: number }) => {
    const list = limit ? targets.slice(0, limit) : targets;
    for (const t of list) {
      hits++;
      if (hitOne(req, t, from)) killed++;
    }
  };

  switch (shape.kind) {
    case 'melee_arc': {
      const targets = world.actorsInArc(
        caster.x, caster.y, caster.facing, shape.radius * areaScale, shape.halfAngle, opts,
      );
      // Nearest first, so a capped cleave hits what the player is looking at.
      targets.sort((a, b) => dist(caster.x, caster.y, a.x, a.y) - dist(caster.x, caster.y, b.x, b.y));
      strike(targets, shape.maxTargets);
      break;
    }

    case 'melee_line': {
      strike(world.actorsInLine(
        caster.x, caster.y, caster.facing, shape.length * areaScale, shape.width * areaScale, opts,
      ));
      break;
    }

    case 'self_aoe': {
      strike(world.actorsInRadius(caster.x, caster.y, shape.radius * areaScale, opts));
      break;
    }

    case 'projectile': {
      const baseAngle = Math.atan2(req.aimY - caster.y, req.aimX - caster.x);
      const n = Math.max(1, shape.count);
      for (let i = 0; i < n; i++) {
        // Fan the volley symmetrically around the aim direction.
        const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        const angle = baseAngle + t * shape.spread;
        world.spawnProjectile({
          x: caster.x + Math.cos(angle) * (caster.radius + 0.25),
          y: caster.y + Math.sin(angle) * (caster.radius + 0.25),
          vx: Math.cos(angle) * shape.speed,
          vy: Math.sin(angle) * shape.speed,
          z: caster.height * 0.55,
          radius: shape.radius * areaScale,
          life: shape.lifetime,
          ownerId: caster.id,
          faction: caster.faction,
          packet: req.packet,
          pierce: shape.pierce,
          applies: req.applies,
          colour: req.colour,
          kind: req.kind,
        });
      }
      break;
    }

    case 'ground_aoe': {
      // Clamp the cast point to the skill's range, so a far click lands short
      // rather than silently failing.
      const d = dist(caster.x, caster.y, req.aimX, req.aimY);
      const scale = d > shape.range ? shape.range / d : 1;
      const gx = caster.x + (req.aimX - caster.x) * scale;
      const gy = caster.y + (req.aimY - caster.y) * scale;

      world.spawnGround({
        x: gx, y: gy,
        radius: shape.radius * areaScale,
        delay: shape.delay,
        duration: shape.lingerDuration ?? 0,
        dps: shape.lingerDps ?? 0,
        damageType: req.packet.amounts ? (Object.keys(req.packet.amounts)[0] as DamageType) : 'physical',
        ownerId: caster.id,
        faction: caster.faction,
        applies: req.applies,
        colour: req.colour,
        burst: req.packet,
        kind: req.kind,
      });
      break;
    }

    case 'curse': {
      const target = world.nearest(req.aimX, req.aimY, 2.0, opts)
        ?? world.nearest(caster.x, caster.y, shape.range, { ...opts, requireLineOfSight: true });
      if (!target) break;
      if (dist(caster.x, caster.y, target.x, target.y) > shape.range + target.radius) break;

      if (shape.radius) {
        strike(world.actorsInRadius(target.x, target.y, shape.radius * areaScale, opts));
      } else {
        hits++;
        if (hitOne(req, target)) killed++;
      }
      break;
    }

    case 'chain': {
      let current = world.nearest(req.aimX, req.aimY, 2.5, opts)
        ?? world.nearest(caster.x, caster.y, shape.range, { ...opts, requireLineOfSight: true });
      const struck = new Set<number>();
      let jumps = shape.jumps;
      while (current && jumps-- > 0) {
        struck.add(current.id);
        hits++;
        if (hitOne(req, current)) killed++;
        const from = current;
        current = world
          .actorsInRadius(from.x, from.y, shape.jumpRange, opts)
          .filter((a) => !struck.has(a.id))
          .sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y))[0] ?? null;
      }
      break;
    }

    case 'dash':
    case 'leap': {
      const distance = shape.kind === 'dash' ? shape.distance : shape.distance;
      const angle = Math.atan2(req.aimY - caster.y, req.aimX - caster.x);
      const wanted = Math.min(distance, dist(caster.x, caster.y, req.aimX, req.aimY) || distance);
      // Step along the path and stop at the first wall, so a dash never
      // teleports the player through geometry.
      let travelled = 0;
      const stepSize = 0.25;
      while (travelled + stepSize <= wanted) {
        const nx = caster.x + Math.cos(angle) * stepSize;
        const ny = caster.y + Math.sin(angle) * stepSize;
        if (!world.grid.worldWalkable(nx, ny)) break;
        caster.x = nx;
        caster.y = ny;
        travelled += stepSize;
      }
      caster.facing = angle;

      const radius = shape.kind === 'dash' ? shape.damageRadius : shape.radius;
      if (radius && req.packet.amounts) {
        strike(world.actorsInRadius(caster.x, caster.y, radius * areaScale, opts));
      }
      break;
    }
  }

  return { kind: shape.kind, hits, killed };
}

/**
 * Total seconds a skill's animation occupies, after attack-speed scaling.
 * Exposed so the UI can show a real cast time and the AI can plan around it.
 */
export function skillDuration(caster: Actor, skill: SkillInstance): { windup: number; strike: number; recover: number } {
  const def = skill.def;
  const scale = def.scalesWithAttackSpeed
    ? 1 / Math.max(0.35, caster.stats.get('attackSpeed'))
    : 1;
  return {
    windup: def.windup * scale,
    strike: def.strike * scale,
    recover: def.recover * scale,
  };
}
