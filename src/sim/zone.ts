/**
 * Zone controller: owns the live encounter.
 *
 * Spawns and updates enemies, awards XP and loot on death, and applies elite
 * promotion. It is the only place that knows about both the player and the
 * enemies, which keeps `PlayerController` and `EnemyController` independent.
 */

import { Actor } from './entity';
import { SimWorld } from './world';
import { PlayerController } from './player';
import { EnemyController, rollEliteModifiers } from './ai';
import { tickDeferred } from './effects';
import { ENEMIES } from '@/data/enemies.data';
import { ELITE_BASE, ELITE_REWARD, type EliteModifier } from '@/data/elites.data';
import { rollDrop } from './loot';
import { xpForKill } from './progression';
import type { EnemyDef } from './enemyDef';
import type { StatKey } from './stats';
import type { Rng } from '@/core/rng';

export interface SpawnOptions {
  /** Number of elite modifiers to roll. 0 = a normal enemy. */
  eliteCount?: number;
  /** Overrides the def's level, for scaling a zone to the player. */
  level?: number;
  /** Marks this actor as a temporary player summon. */
  summonOwnerId?: number;
  summonDuration?: number;
  /** Pre-chosen modifiers, used to author a specific named elite. */
  modifiers?: EliteModifier[];
}

export class Zone {
  readonly enemies = new Map<number, EnemyController>();
  /** Emitted once when the boss is first engaged. */
  private bossEngaged = false;
  /** Totals surfaced by the debug overlay and the end-of-run summary. */
  kills = 0;

  constructor(
    readonly world: SimWorld,
    readonly player: PlayerController,
    readonly rng: Rng = world.rng,
  ) {
    world.add(player.actor);
    this.wireEvents();
  }

  private wireEvents(): void {
    this.world.events.on('ENTITY_DIED', ({ actor, killerId }) => {
      const controller = this.enemies.get(actor.id);
      if (!controller) {
        if (actor.id === this.player.actor.id) {
          this.world.events.emit('PLAYER_DIED', { level: this.player.progression.level });
        }
        return;
      }

      controller.onDeath();
      this.enemies.delete(actor.id);

      // Summons award nothing — otherwise the Ashen farms their own minions.
      if (controller.ctx.summonOwnerId !== null) return;
      if (killerId !== this.player.actor.id && actor.lastAttackerId !== this.player.actor.id) return;

      this.kills++;
      this.awardKill(controller.def, actor);
    });

    this.world.events.on('ENTITY_DAMAGED', ({ actor, result, sourceId }) => {
      if (actor.id === this.player.actor.id) {
        this.player.onDamaged(result.total, result.staggered);
        return;
      }
      // Feed the elite frenzy/leech hooks when an enemy is the *source*.
      const attacker = this.enemies.get(sourceId ?? -1);
      if (attacker) attacker.onLandedHit(result.total);
    });
  }

  private awardKill(def: EnemyDef, actor: Actor): void {
    const isElite = actor.eliteAffixes.length > 0;
    const xpBase = def.xp * (isElite ? ELITE_REWARD.xpMultiplier : 1);
    this.player.grantXp(xpForKill(actor.level, xpBase, this.player.progression.level));

    const items = rollDrop(this.rng, {
      itemLevel: Math.max(1, actor.level),
      dropChance: Math.min(1, def.dropChance + (isElite ? ELITE_REWARD.dropChanceBonus : 0)),
      rolls: def.dropRolls + (isElite ? ELITE_REWARD.extraRolls : 0),
      rarityBonus: (def.rarityBonus ?? 0) + (isElite ? ELITE_REWARD.rarityBonus : 0),
      minRarity: def.isBoss ? 'haunted' : undefined,
    });
    for (const item of items) this.world.dropItem(item, actor.x, actor.y);

    // A little coin from everything, so vendors are usable without grinding.
    this.player.gold += Math.round(def.xp * 0.4 * (isElite ? 4 : 1));

    if (def.isBoss) {
      this.world.events.emit('BOSS_DEFEATED', { bossId: def.id, name: def.name });
    }
  }

  // --- Spawning ----------------------------------------------------------

  spawn(defId: string, x: number, y: number, opts: SpawnOptions = {}): EnemyController | null {
    const def = ENEMIES.find(defId);
    if (!def) {
      console.warn(`[zone] unknown enemy "${defId}"`);
      return null;
    }

    const actor = new Actor(def.stats);
    const spot = this.world.grid.nearestWalkable(x, y);
    actor.x = spot.x;
    actor.y = spot.y;
    actor.prevX = actor.x;
    actor.prevY = actor.y;
    actor.facing = this.rng.range(0, Math.PI * 2);
    actor.radius = def.radius;
    actor.height = def.height;
    actor.name = def.name;
    actor.defId = def.id;
    actor.level = opts.level ?? def.level;
    actor.isBoss = def.isBoss ?? false;
    actor.faction = opts.summonOwnerId !== undefined ? 'player' : 'hostile';
    actor.staggerThreshold = 100;

    // Level scaling: an enemy spawned above its native level gains stats so a
    // late-dungeon villager is still a (small) threat (§47).
    const levelGap = actor.level - def.level;
    if (levelGap > 0) {
      const scale: [StatKey, number][] = [
        ['maxHealth', 0.18], ['attackPower', 0.12], ['spellPower', 0.12], ['armour', 0.1],
      ];
      for (const [stat, per] of scale) {
        actor.stats.addModifier({ stat, pct: per * levelGap, source: 'levelScale' });
      }
    }

    const modifiers = opts.modifiers
      ?? (opts.eliteCount ? rollEliteModifiers(this.rng, opts.eliteCount) : []);

    if (modifiers.length > 0) {
      actor.eliteAffixes = modifiers.map((m) => m.id);
      actor.name = `${modifiers.map((m) => m.name).join(' ')} ${def.name}`;
      for (const [stat, value] of Object.entries(ELITE_BASE) as [StatKey, number][]) {
        actor.stats.addModifier({ stat, flat: value, source: 'eliteBase' });
      }
      for (const mod of modifiers) {
        for (const [stat, value] of Object.entries(mod.stats) as [StatKey, number][]) {
          actor.stats.addModifier({ stat, flat: value, source: `elite:${mod.id}` });
        }
      }
      actor.radius *= 1.12;
      actor.height *= 1.12;
    }

    actor.stats.invalidate();
    actor.health = actor.maxHealth;
    actor.resource = actor.maxResource;

    const controller = new EnemyController(actor, def, this.world, this.rng, modifiers);
    if (opts.summonOwnerId !== undefined) {
      controller.ctx.summonOwnerId = opts.summonOwnerId;
      controller.ctx.summonLife = opts.summonDuration ?? 20;
    }

    this.world.add(actor);
    this.enemies.set(actor.id, controller);
    return controller;
  }

  /** Spawns a cluster around a point, spread so they do not stack. */
  spawnGroup(
    entries: { defId: string; count: number; eliteCount?: number }[],
    x: number, y: number, spread = 3,
  ): EnemyController[] {
    const out: EnemyController[] = [];
    for (const entry of entries) {
      for (let i = 0; i < entry.count; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(0.5, spread);
        const c = this.spawn(entry.defId, x + Math.cos(a) * r, y + Math.sin(a) * r, {
          eliteCount: entry.eliteCount ?? 0,
        });
        if (c) out.push(c);
      }
    }
    return out;
  }

  // --- Step --------------------------------------------------------------

  update(dt: number): void {
    this.player.update(dt);

    for (const controller of [...this.enemies.values()]) {
      controller.update(dt);

      // Drain the Bone-Gleaner's raise requests.
      const pending = controller.ctx.pendingSummon ?? 0;
      if (pending > 0) {
        controller.ctx.pendingSummon = 0;
        for (let i = 0; i < pending; i++) {
          const a = this.rng.range(0, Math.PI * 2);
          this.spawn('hollow_walker', controller.actor.x + Math.cos(a) * 2.2, controller.actor.y + Math.sin(a) * 2.2, {
            level: controller.actor.level,
          });
        }
      }

      if (controller.actor.isBoss && !this.bossEngaged && controller.ctx.target) {
        this.bossEngaged = true;
        this.world.events.emit('BOSS_STARTED', {
          bossId: controller.def.id, name: controller.def.name,
        });
      }
    }

    // Drain player summon requests.
    while (this.player.pendingSummons.length > 0) {
      const req = this.player.pendingSummons.shift()!;
      for (let i = 0; i < req.count; i++) {
        const a = (i / req.count) * Math.PI * 2;
        this.spawn(req.enemyId, req.x + Math.cos(a) * 1.6, req.y + Math.sin(a) * 1.6, {
          summonOwnerId: this.player.actor.id,
          summonDuration: req.duration,
          level: this.player.progression.level,
        });
      }
    }

    this.world.step(dt);
    tickDeferred(this.world);
    this.world.prune();
  }

  get liveEnemies(): number {
    let n = 0;
    for (const c of this.enemies.values()) {
      if (c.actor.alive && c.ctx.summonOwnerId === null) n++;
    }
    return n;
  }

  /** Removes every enemy — used by the debug "kill all" and on zone change. */
  clearEnemies(): void {
    for (const c of [...this.enemies.values()]) {
      this.world.killActor(c.actor, this.player.actor.id);
    }
  }
}
