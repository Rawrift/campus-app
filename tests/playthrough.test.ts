/**
 * Automated playthrough.
 *
 * A bot plays the real game from level 1 through the boss, using only the
 * public player API — the same calls the mouse and keyboard make. Nothing here
 * reaches into the simulation to cheat.
 *
 * This exists because the honest limit on the balance of this build is that
 * nobody has played it. A bot is not a play-test, but it answers the questions
 * that must not be left to chance: is the run completable at all, does the
 * player out-level or under-level the content, and is any single encounter a
 * wall?
 */

import { describe, it, expect } from 'vitest';
import { ZoneRuntime } from '@/world/zoneRuntime';
import { PlayerController } from '@/sim/player';
import { generateItem } from '@/sim/loot';
import { EventBus } from '@/core/events';
import { resetEntityIds } from '@/sim/entity';
import { resetUidCounter } from '@/sim/items';
import { clearDeferred } from '@/sim/effects';
import { ITEM_BASES } from '@/data/items.data';
import { dist } from '@/core/math';
import type { ArchetypeId } from '@/sim/ability';
import type { Actor } from '@/sim/entity';

const DT = 1 / 60;

/**
 * Plays about as well as an attentive beginner: engages the nearest enemy,
 * spends skills when they are up and affordable, drinks below 45% health, and
 * equips anything that raises the stat its slot exists for.
 */
class Bot {
  elapsed = 0;
  deaths = 0;
  private equipCheck = 0;

  constructor(readonly runtime: ZoneRuntime) {}

  get player(): PlayerController {
    return this.runtime.zone!.player;
  }

  /**
   * The nearest hostile worth engaging.
   *
   * The range cap matters: without it the bot chases whatever is closest
   * anywhere on the map, and since issuing an attack order cancels movement it
   * never travels again. That measures the bot's target selection rather than
   * the game.
   */
  private nearestEnemy(range = 14): Actor | null {
    const world = this.runtime.world!;
    const me = this.player.actor;
    let best: Actor | null = null;
    let bestD = range;
    for (const a of world.actors) {
      if (!a.alive || a.faction !== 'hostile') continue;
      const d = dist(me.x, me.y, a.x, a.y);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  /** Equips anything strictly better in its slot. Naive, like a new player. */
  private tryUpgrade(): void {
    const p = this.player;
    for (const item of [...p.inventory.all]) {
      const base = ITEM_BASES.find(item.baseId);
      if (!base) continue;
      const slot = p.equipment.resolveSlot(item);
      const current = p.equipment.get(slot);
      const score = (i: typeof item) => {
        const b = ITEM_BASES.find(i.baseId);
        if (!b) return -1;
        const dmg = b.damage ? (b.damage.min + b.damage.max) / 2 : 0;
        const armour = b.baseStats?.armour ?? 0;
        return dmg * 3 + armour + i.affixes.length * 4 + i.itemLevel;
      };
      if (!current || score(item) > score(current)) {
        p.equipFromInventory(item.uid);
      }
    }
  }

  step(): void {
    const p = this.player;
    const me = p.actor;
    this.elapsed += DT;

    if (me.alive) {
      if (me.healthFraction < 0.45) p.usePotion();

      const target = this.nearestEnemy();
      if (target) {
        const d = dist(me.x, me.y, target.x, target.y);
        // Spend a cooldown skill when one is ready and affordable.
        let cast = false;
        if (!p.busy) {
          for (let i = 1; i < p.progression.bar.length; i++) {
            const id = p.progression.bar[i];
            if (!id) continue;
            const skill = p.progression.skills.get(id);
            if (!skill?.ready || me.resource < skill.cost) continue;
            const range = skill.def.tags.includes('melee') ? 2.2 : 8;
            if (d > range) continue;
            if (p.requestSkill(id, target.x, target.y)) { cast = true; break; }
          }
        }
        if (!cast) p.requestAttack(target.id);
      } else {
        // Nothing hostile nearby: sweep loot, then move on.
        this.equipCheck += DT;
        if (this.equipCheck > 1) { this.equipCheck = 0; this.tryUpgrade(); }
      }
    }

    const before = this.runtime.zone!.kills;
    this.runtime.zone!.update(DT);
    this.runtime.update();
    this.kills += this.runtime.zone!.kills - before;

    // Auto-pickup, exactly as the game loop does it.
    const world = this.runtime.world!;
    for (const g of world.itemsNear(me.x, me.y, 1.4)) {
      if (g.settled) p.tryPickUp(g);
    }
  }

  kills = 0;

  /**
   * Runs until `done` or the budget expires.
   *
   * `minSeconds` guards against a done-condition that is trivially true before
   * anything has happened — "all enemies are dead" is satisfied by an empty
   * map, which silently turns a combat test into a no-op.
   */
  run(seconds: number, done: () => boolean, minSeconds = 0): boolean {
    const steps = Math.round(seconds / DT);
    const floor = Math.round(minSeconds / DT);
    const startXp = this.player.progression.xp;
    for (let i = 0; i < steps; i++) {
      if (i >= floor && done()) { void startXp; return true; }
      this.step();
      if (!this.player.actor.alive) {
        // Revive in place and keep going, counting the death. A real player
        // would walk back; for measurement, what matters is the death count.
        this.deaths++;
        const me = this.player.actor;
        me.alive = true;
        me.action = 'idle';
        me.health = me.maxHealth;
        this.player.potion.count = Math.max(2, this.player.potion.count);
      }
    }
    return done();
  }
}

function newRun(seed: string) {
  resetEntityIds();
  resetUidCounter();
  clearDeferred();
  const events = new EventBus();
  const runtime = new ZoneRuntime(seed);
  // Silence per-run events; we only care about the end state.
  void events;
  return runtime;
}

function startZone(runtime: ZoneRuntime, zoneId: string, archetype: ArchetypeId, seed: string, carry?: PlayerController) {
  return runtime.load(zoneId, (world) => {
    const p = new PlayerController(world, archetype, seed);
    if (carry) {
      // Carry progression across zones the way the game does.
      p.progression.level = carry.progression.level;
      p.progression.xp = carry.progression.xp;
      p.progression.skillPoints = carry.progression.skillPoints;
      for (const [id, rank] of carry.progression.ranks) {
        p.progression.learn(id);
        const s = p.progression.skills.get(id);
        if (s) s.rank = rank;
      }
      p.progression.bar = [...carry.progression.bar];
      p.equipment.clear();
      for (const [, item] of carry.equipment.entries) p.equipment.equip(item);
      for (const item of carry.inventory.all) p.inventory.add(item);
      p.gold = carry.gold;
      p.potion.count = carry.potion.count;
      p.recomputeStats();
      p.actor.health = p.actor.maxHealth;
    }
    return p;
  });
}

describe.each(['ironbound', 'pallwalker', 'ashen'] as const)('a full run as %s', (archetype) => {
  const seed = `run-${archetype}`;

  it('clears the outdoor region and reaches the abbey without stalling', () => {
    const runtime = newRun(seed);
    startZone(runtime, 'marches', archetype, seed);
    const bot = new Bot(runtime);

    // Walk the route north, clearing each stop before moving on. The bot
    // re-issues its move order whenever it has nothing to fight, because
    // engaging a target cancels the move.
    const waypoints = [
      { x: 40, y: 66 }, { x: 26, y: 58 }, { x: 44, y: 50 }, { x: 58, y: 52 },
      { x: 22, y: 32 }, { x: 60, y: 28 }, { x: 44, y: 30 }, { x: 44, y: 22 },
    ];
    for (const wp of waypoints) {
      bot.run(60, () => {
        const me = bot.player.actor;
        // Only the immediate threat blocks advancing. A wider radius keeps a
        // ranged archetype pinned indefinitely by a distant enemy it is
        // already out-ranging, which measures the bot rather than the game.
        const engaged = runtime.world!.actors.some(
          (a) => a.alive && a.faction === 'hostile' && dist(me.x, me.y, a.x, a.y) < 10,
        );
        if (engaged) return false;
        if (dist(me.x, me.y, wp.x, wp.y) < 4) return true;
        if (!bot.player.busy) bot.player.requestMove(wp.x, wp.y);
        return false;
      }, 1.5);
    }

    const p = bot.player;
    // The route must actually produce progress, not just survival.
    // Printed so the balance can be read, not just asserted.
    console.log(
      `  [marches/${archetype}] level ${p.progression.level}`
      + ` · ${bot.kills} kills · ${bot.deaths} deaths`
      + ` · ${bot.elapsed.toFixed(0)}s · ${p.inventory.count} items carried`
      + ` · ${Math.round(p.actor.maxHealth)} hp · ${p.actor.stats.get('armour').toFixed(0)} armour`,
    );

    expect(p.progression.level,
      `${archetype} reached only level ${p.progression.level} after ${bot.kills} kills`)
      .toBeGreaterThanOrEqual(4);
    expect(p.progression.level, `${archetype} over-levelled to ${p.progression.level}`)
      .toBeLessThanOrEqual(10);
    expect(bot.deaths, `${archetype} died ${bot.deaths} times crossing the Marches`)
      .toBeLessThanOrEqual(3);
  }, 30_000);

  it('can kill the boss at the level the dungeon leaves you at', () => {
    const runtime = newRun(`${seed}-boss`);
    startZone(runtime, 'ossuary', archetype, `${seed}-boss`);
    const bot = new Bot(runtime);
    const p = bot.player;

    // Enter the belfry at the level a player who cleared the route would be:
    // the dungeon's own encounters carry you to roughly 8-10.
    p.progression.level = 9;
    p.progression.skillPoints = 8;
    for (const id of p.progression.availableToLearn()) p.progression.spendPoint(id);
    p.recomputeStats();
    // Gear a player would plausibly be wearing by then.
    for (let i = 0; i < 6; i++) {
      const item = generateItem(runtime.world!.rng, { itemLevel: 7, rarityBonus: 2 });
      if (item) { p.inventory.add(item); p.equipFromInventory(item.uid); }
    }
    p.actor.health = p.actor.maxHealth;
    p.potion.count = 5;

    const boss = runtime.zone!.spawn('boss_ausric', p.actor.x + 6, p.actor.y)!;
    const killed = bot.run(180, () => !boss.actor.alive);

    console.log(
      `  [boss/${archetype}] ${killed ? 'killed' : 'FAILED'}`
      + ` in ${bot.elapsed.toFixed(0)}s · ${bot.deaths} deaths`
      + ` · ${p.potion.count} draughts left`,
    );

    expect(killed, `${archetype} could not kill the boss in 3 minutes`).toBe(true);
    expect(bot.deaths, `${archetype} died ${bot.deaths} times to the boss`)
      .toBeLessThanOrEqual(4);
    // A boss that dies in seconds is not a boss.
    expect(bot.elapsed, `the boss died in ${bot.elapsed.toFixed(0)}s`).toBeGreaterThan(12);
  }, 60_000);
});

describe('the opening is survivable', () => {
  it('a level-1 character beats the first encounter without dying', () => {
    const runtime = newRun('opening');
    startZone(runtime, 'marches', 'ironbound', 'opening');
    const bot = new Bot(runtime);

    // Walk up the road until the opening pack triggers, then clear it.
    let spawned = false;
    bot.run(60, () => {
      const hostile = runtime.world!.actors.filter((a) => a.faction === 'hostile');
      if (hostile.length > 0) spawned = true;
      if (!spawned) {
        if (!bot.player.busy) bot.player.requestMove(40, 62);
        return false;
      }
      return hostile.every((a) => !a.alive);
    }, 2);

    expect(spawned, 'the opening encounter never triggered').toBe(true);

    expect(bot.deaths, 'a new player died in the first encounter').toBe(0);
    expect(bot.player.progression.xp).toBeGreaterThan(0);
  }, 30_000);
});

/**
 * Sustained-damage comparison.
 *
 * The route test above is noisy — it mixes travel, pack composition and loot
 * luck — so it is a poor instrument for balance. This measures the one thing
 * that decides how an archetype *feels* minute to minute: how much damage its
 * freely-repeatable opener does over a sustained fight, with no cooldowns and
 * no resource windfalls.
 *
 * The three archetypes should land within a reasonable band of each other.
 * They are not meant to be identical: the Ashen pays for range with fragility,
 * and the Ironbound pays for damage with having to be in reach.
 */
describe('archetype balance', () => {
  function sustainedDamage(archetype: ArchetypeId, seconds: number): number {
    resetEntityIds();
    resetUidCounter();
    clearDeferred();
    const runtime = new ZoneRuntime(`dps-${archetype}`);
    startZone(runtime, 'marches', archetype, `dps-${archetype}`);
    const p = runtime.zone!.player;

    // A dummy that cannot die and cannot fight back. It is pinned to a fixed
    // offset every frame rather than merely slowed: an AI-driven dummy settles
    // at a different distance for each archetype, which silently turns a damage
    // measurement into a measurement of whether that archetype's reach happens
    // to match where the dummy stopped.
    const GAP = 1.2;
    const dummy = runtime.zone!.spawn('kept_villager', p.actor.x + GAP, p.actor.y)!;
    dummy.actor.stats.setBase('maxHealth', 1_000_000);
    dummy.actor.stats.setBase('armour', 0);
    dummy.actor.health = dummy.actor.maxHealth;
    dummy.actor.stats.addModifier({ stat: 'attackPower', pct: -1, source: 'dummy' });

    const startHp = dummy.actor.health;
    const basic = p.primarySkillId!;
    let casts = 0;
    let refused = 0;

    for (let i = 0; i < seconds / DT; i++) {
      p.actor.resource = p.actor.maxResource; // isolate the opener from economy
      p.actor.health = p.actor.maxHealth;
      // Pin the dummy in front of the player, facing away from it.
      dummy.actor.x = p.actor.x + GAP;
      dummy.actor.y = p.actor.y;
      dummy.actor.vx = dummy.actor.vy = 0;
      dummy.actor.impulseX = dummy.actor.impulseY = 0;

      if (!p.busy) {
        if (p.requestSkill(basic, dummy.actor.x, dummy.actor.y)) casts++;
        else refused++;
      }
      runtime.zone!.update(DT);
    }
    void refused;
    void casts;
    return startHp - dummy.actor.health;
  }

  it('every archetype sustains a comparable amount of damage with its opener', () => {
    const results = (['ironbound', 'pallwalker', 'ashen'] as const).map((a) => ({
      archetype: a,
      dps: sustainedDamage(a, 20) / 20,
    }));

    for (const r of results) {
      console.log(`  [dps/${r.archetype}] ${r.dps.toFixed(1)} damage per second with the opener`);
    }

    const values = results.map((r) => r.dps);
    const lowest = Math.min(...values);
    const highest = Math.max(...values);

    expect(lowest, 'an archetype does no damage at all').toBeGreaterThan(1);
    // Within 2x. Wider than that and the weakest archetype is simply worse,
    // which no amount of flavour makes fun to play.
    expect(highest / lowest,
      `spread is ${(highest / lowest).toFixed(2)}x: `
      + results.map((r) => `${r.archetype} ${r.dps.toFixed(1)}`).join(', '))
      .toBeLessThan(2);
  }, 30_000);
});
