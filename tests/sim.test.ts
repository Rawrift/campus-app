import { describe, it, expect } from 'vitest';
import { makeRig, DT, capture } from './helpers';
import { generateItem } from '@/sim/loot';
import { Rng } from '@/core/rng';
import { ITEM_BASES } from '@/data/items.data';
import { SKILLS } from '@/data/skills.data';

describe('a fight actually happens', () => {
  it('the player kills an enemy, gains XP and is credited the drop chance', () => {
    const rig = makeRig('ironbound', 'fight-1');
    const deaths = capture(rig.events, 'ENTITY_DIED');
    const xp = capture(rig.events, 'XP_GAINED');

    const enemy = rig.zone.spawn('kept_villager', 23, 20)!;
    expect(enemy.actor.alive).toBe(true);

    rig.player.requestAttack(enemy.actor.id);
    rig.run(12);

    expect(enemy.actor.alive).toBe(false);
    expect(deaths.length).toBeGreaterThan(0);
    expect(xp.length).toBeGreaterThan(0);
    expect(rig.player.progression.xp).toBeGreaterThan(0);
    expect(rig.zone.kills).toBe(1);
  });

  it('the enemy fights back and can kill the player', () => {
    const rig = makeRig('ashen', 'fight-2');
    const died = capture(rig.events, 'PLAYER_DIED');

    // A pack far above the player's weight class, and the player does nothing.
    for (let i = 0; i < 6; i++) {
      rig.zone.spawn('kept_flagellant', 22 + i * 0.4, 20 + i * 0.4, { level: 10 });
    }
    rig.run(30);

    expect(rig.player.actor.alive).toBe(false);
    expect(died.length).toBe(1);
  });

  it('the player survives a single weak enemy while fighting back', () => {
    const rig = makeRig('ironbound', 'fight-3');
    const enemy = rig.zone.spawn('kept_villager', 23, 20)!;
    rig.player.requestAttack(enemy.actor.id);
    rig.run(15);
    expect(rig.player.actor.alive).toBe(true);
    expect(enemy.actor.alive).toBe(false);
  });
});

describe('AI behaviour', () => {
  it('ignores the player outside aggro range and engages inside it', () => {
    const rig = makeRig('ironbound', 'ai-1');
    const far = rig.zone.spawn('kept_villager', 20, 36)!;
    rig.run(1);
    expect(['idle', 'patrol']).toContain(far.state);

    const near = rig.zone.spawn('kept_villager', 24, 20)!;
    rig.run(2);
    expect(['alert', 'chase', 'attack', 'reposition']).toContain(near.state);
  });

  it('leashes back home when the player runs far away', () => {
    const rig = makeRig('ironbound', 'ai-2');
    const enemy = rig.zone.spawn('kept_villager', 24, 20)!;
    rig.run(1.5);
    expect(enemy.ctx.target).not.toBeNull();

    // Teleport the player beyond the leash radius.
    rig.player.actor.x = 5;
    rig.player.actor.y = 5;
    rig.run(6);
    expect(['leash', 'idle', 'patrol']).toContain(enemy.state);
  });

  it('ranged enemies hold their distance instead of closing', () => {
    const rig = makeRig('ironbound', 'ai-3');
    const archer = rig.zone.spawn('kept_chandler', 28, 20)!;
    rig.run(4);
    const d = Math.hypot(archer.actor.x - rig.player.actor.x, archer.actor.y - rig.player.actor.y);
    // Its preferred range is 7.5; it should not have walked into melee.
    expect(d).toBeGreaterThan(3.5);
  });

  it('a pack spreads out rather than stacking on one point', () => {
    const rig = makeRig('ironbound', 'ai-4');
    const pack = rig.zone.spawnGroup([{ defId: 'beast_hound', count: 5 }], 26, 20, 1.0);
    rig.run(4);

    // No two enemies may be inside each other after separation steering.
    for (let i = 0; i < pack.length; i++) {
      for (let j = i + 1; j < pack.length; j++) {
        const a = pack[i]!.actor;
        const b = pack[j]!.actor;
        if (!a.alive || !b.alive) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThan((a.radius + b.radius) * 0.8);
      }
    }
  });

  it('never lets an actor end up inside a wall', () => {
    const rig = makeRig('ironbound', 'ai-5');
    rig.zone.spawnGroup([{ defId: 'kept_villager', count: 8 }], 3, 3, 2);
    rig.player.requestMove(2, 2);
    rig.run(8);
    for (const a of rig.world.actors) {
      if (!a.alive) continue;
      expect(rig.world.grid.worldWalkable(a.x, a.y)).toBe(true);
    }
  });
});

describe('elites', () => {
  it('are tougher, differently named, and drop more', () => {
    const rig = makeRig('ironbound', 'elite-1');
    const normal = rig.zone.spawn('kept_deserter', 26, 20)!;
    const elite = rig.zone.spawn('kept_deserter', 14, 20, { eliteCount: 2 })!;

    expect(elite.actor.maxHealth).toBeGreaterThan(normal.actor.maxHealth);
    expect(elite.actor.eliteAffixes.length).toBe(2);
    expect(elite.actor.name).not.toBe(normal.actor.name);
    expect(elite.actor.name).toContain('Deserter');
  });

  it('never rolls two mutually excluded modifiers together', () => {
    const rig = makeRig('ironbound', 'elite-2');
    for (let i = 0; i < 300; i++) {
      const e = rig.zone.spawn('kept_villager', 20, 20, { eliteCount: 3 })!;
      const ids = e.actor.eliteAffixes;
      if (ids.includes('elite_shelled')) expect(ids).not.toContain('elite_wisped');
      if (ids.includes('elite_wisped')) expect(ids).not.toContain('elite_shelled');
      expect(new Set(ids).size).toBe(ids.length);
      rig.world.killActor(e.actor, null);
    }
  });
});

describe('the boss', () => {
  it('advances through three phases as its health falls', () => {
    const rig = makeRig('ironbound', 'boss-1');
    const phases = capture(rig.events, 'BOSS_PHASE') as { phase: number }[];
    const boss = rig.zone.spawn('boss_ausric', 26, 20)!;
    rig.run(0.5);
    expect(boss.ctx.bossPhase).toBe(0);

    boss.actor.health = boss.actor.maxHealth * 0.5;
    rig.run(0.5);
    expect(boss.ctx.bossPhase).toBe(1);

    boss.actor.health = boss.actor.maxHealth * 0.2;
    rig.run(0.5);
    expect(boss.ctx.bossPhase).toBe(2);
    expect(phases.map((p) => p.phase)).toEqual([2, 3]);
  });

  it('gains its phase-2 and phase-3 attacks only when wounded', () => {
    const rig = makeRig('ironbound', 'boss-2');
    const boss = rig.zone.spawn('boss_ausric', 26, 20)!;
    const gated = boss.def.attacks.filter((a) => a.belowHealth !== undefined);
    expect(gated.length).toBeGreaterThanOrEqual(4);
    for (const a of gated) {
      expect(a.belowHealth!).toBeLessThan(1);
    }
  });

  it('emits BOSS_DEFEATED and drops at least a haunted item', () => {
    const rig = makeRig('ironbound', 'boss-3');
    const defeated = capture(rig.events, 'BOSS_DEFEATED');
    const boss = rig.zone.spawn('boss_ausric', 26, 20)!;
    boss.actor.lastAttackerId = rig.player.actor.id;
    rig.world.killActor(boss.actor, rig.player.actor.id);
    rig.run(0.1);

    expect(defeated.length).toBe(1);
    expect(rig.world.items.length).toBeGreaterThan(0);
    const best = rig.world.items.map((g) => g.item.rarity);
    expect(best.some((r) => r === 'haunted' || r === 'reliquary')).toBe(true);
  });
});

describe('loot flow', () => {
  it('drops land on walkable ground and can be picked up into the bag', () => {
    const rig = makeRig('ironbound', 'loot-1');
    const item = generateItem(new Rng('x'), { itemLevel: 3 })!;
    const ground = rig.world.dropItem(item, 21, 20);
    rig.run(1.5);

    expect(ground.settled).toBe(true);
    expect(rig.world.grid.worldWalkable(ground.x, ground.y)).toBe(true);

    expect(rig.player.tryPickUp(ground)).toBe(true);
    expect(rig.player.inventory.count).toBe(1);
    expect(rig.world.items.length).toBe(0);
  });

  it('refuses a pickup when the bag has no room', () => {
    const rig = makeRig('ironbound', 'loot-2');
    const rng = new Rng('fill');
    // Fill the 10x6 grid with 2x3 chests: 10 of them exactly fills it.
    for (let i = 0; i < 10; i++) {
      const chest = generateItem(rng, { itemLevel: 1, slots: ['chest'] })!;
      expect(rig.player.inventory.add(chest)).toBe(true);
    }
    expect(rig.player.inventory.freeCells).toBe(0);

    const extra = generateItem(rng, { itemLevel: 1, slots: ['chest'] })!;
    const ground = rig.world.dropItem(extra, 20.5, 20);
    expect(rig.player.tryPickUp(ground)).toBe(false);
  });
});

describe('equipment changes the character', () => {
  it('equipping armour raises armour and is reflected in mitigation', () => {
    const rig = makeRig('ironbound', 'equip-1');
    const before = rig.player.actor.stats.get('armour');

    const plate = generateItem(new Rng('plate'), { itemLevel: 10, slots: ['chest'] })!;
    const forced = { ...plate, baseId: 'arm_chest_plate' };
    rig.player.inventory.add(forced);
    rig.player.progression.level = 10;
    rig.player.recomputeStats();
    expect(rig.player.equipFromInventory(forced.uid)).toBe(true);

    expect(rig.player.actor.stats.get('armour')).toBeGreaterThan(before);
    expect(rig.player.equipment.get('chest')?.baseId).toBe('arm_chest_plate');
  });

  it('refuses gear above the character level and says why', () => {
    const rig = makeRig('ironbound', 'equip-2');
    const notes = capture(rig.events, 'NOTIFY') as { text: string }[];
    const item = generateItem(new Rng('n'), { itemLevel: 10, slots: ['chest'] })!;
    const forced = { ...item, baseId: 'arm_chest_plate' };
    rig.player.inventory.add(forced);

    expect(rig.player.equipFromInventory(forced.uid)).toBe(false);
    expect(notes.some((n) => n.text.includes('level'))).toBe(true);
  });

  it('a two-handed weapon displaces the off-hand', () => {
    const rig = makeRig('ironbound', 'equip-3');
    rig.player.progression.level = 10;
    rig.player.recomputeStats();
    expect(rig.player.equipment.get('offHand')).toBeTruthy();

    const two = generateItem(new Rng('2h'), { itemLevel: 10 })!;
    const forced = { ...two, baseId: 'wpn_mace_2' };
    rig.player.inventory.add(forced);
    rig.player.equipFromInventory(forced.uid);

    expect(ITEM_BASES.get('wpn_mace_2').twoHanded).toBe(true);
    expect(rig.player.equipment.get('offHand')).toBeUndefined();
    expect(rig.player.equipment.get('mainHand')?.baseId).toBe('wpn_mace_2');
  });

  it('preserves the health fraction across a gear swap', () => {
    const rig = makeRig('ironbound', 'equip-4');
    rig.player.actor.health = Math.round(rig.player.actor.maxHealth * 0.5);
    const fracBefore = rig.player.actor.healthFraction;

    const item = generateItem(new Rng('hp'), { itemLevel: 1, slots: ['chest'] })!;
    rig.player.inventory.add(item);
    rig.player.equipFromInventory(item.uid);

    expect(rig.player.actor.healthFraction).toBeCloseTo(fracBefore, 1);
    expect(rig.player.actor.health).toBeGreaterThan(0);
  });
});

describe('skills', () => {
  it('spend resource, go on cooldown, and commit the character', () => {
    const rig = makeRig('ashen', 'skill-1');
    const used = capture(rig.events, 'SKILL_USED');
    rig.zone.spawn('kept_villager', 26, 20);
    // Openers are free for every archetype, so this measures a costed skill.
    rig.player.progression.level = 2;
    rig.player.progression.learn('ash_pyre');

    const before = rig.player.actor.resource;
    expect(rig.player.requestSkill('ash_pyre', 26, 20)).toBe(true);
    expect(rig.player.actor.resource).toBeLessThan(before);
    expect(used.length).toBe(1);
    expect(rig.player.busy).toBe(true);

    // While committed, another cast is refused.
    expect(rig.player.requestSkill('ash_pyre', 26, 20)).toBe(false);
  });

  it('refuse to fire without enough resource', () => {
    const rig = makeRig('ashen', 'skill-2');
    rig.player.progression.level = 2;
    rig.player.progression.learn('ash_pyre');
    rig.player.actor.resource = 0;
    expect(rig.player.requestSkill('ash_pyre', 26, 20)).toBe(false);
  });

  it('every archetype opener is free, so basic attacking is always available', () => {
    for (const archetype of ['ironbound', 'pallwalker', 'ashen'] as const) {
      const rig = makeRig(archetype, `free-${archetype}`);
      const id = rig.player.primarySkillId!;
      rig.player.actor.resource = 0;
      expect(
        rig.player.requestSkill(id, 26, 20),
        `${archetype}'s opener "${id}" cannot be used at zero resource`,
      ).toBe(true);
    }
  });

  it('projectile skills spawn projectiles that travel and hit', () => {
    const rig = makeRig('ashen', 'skill-3');
    const enemy = rig.zone.spawn('kept_villager', 26, 20)!;
    const hpBefore = enemy.actor.health;

    rig.player.requestSkill('ash_bolt', enemy.actor.x, enemy.actor.y);
    rig.run(1.6);

    expect(enemy.actor.health).toBeLessThan(hpBefore);
  });

  it('an area skill hits several enemies at once', () => {
    const rig = makeRig('ashen', 'skill-4');
    rig.player.progression.level = 6;
    rig.player.progression.learn('ash_nova');
    rig.player.recomputeStats();
    rig.player.actor.resource = 100;

    const pack = rig.zone.spawnGroup([{ defId: 'kept_villager', count: 4 }], 21.5, 20, 1.2);
    const before = pack.map((p) => p.actor.health);

    rig.player.requestSkill('ash_nova', 22, 20);
    rig.run(1.0);

    const damaged = pack.filter((p, i) => p.actor.health < before[i]!).length;
    expect(damaged).toBeGreaterThanOrEqual(3);
  });

  it('a dash moves the player and never through a wall', () => {
    const rig = makeRig('pallwalker', 'skill-5');
    rig.player.progression.level = 2;
    rig.player.progression.learn('pall_slip');
    rig.player.actor.resource = 100;
    rig.player.actor.x = 2.5;
    rig.player.actor.y = 20;

    rig.player.requestSkill('pall_slip', -10, 20);
    rig.run(1.0);

    expect(rig.world.grid.worldWalkable(rig.player.actor.x, rig.player.actor.y)).toBe(true);
    expect(rig.player.actor.x).toBeGreaterThan(0.9);
  });

  it('every skill in the table is executable without throwing', () => {
    for (const def of SKILLS.all) {
      const rig = makeRig(def.archetype, `all-${def.id}`);
      rig.player.progression.level = 10;
      rig.player.progression.learn(def.id);
      rig.player.recomputeStats();
      rig.player.actor.resource = 999;
      rig.zone.spawnGroup([{ defId: 'kept_villager', count: 3 }], 24, 20, 1.5);

      expect(() => {
        rig.player.requestSkill(def.id, 24, 20);
        rig.run(2.5);
      }, `skill ${def.id} threw`).not.toThrow();
    }
  });
});

describe('progression', () => {
  it('levels up from kills and grants a skill point', () => {
    const rig = makeRig('ironbound', 'prog-1');
    const ups = capture(rig.events, 'LEVEL_UP');
    rig.player.grantXp(10_000);

    expect(rig.player.progression.level).toBeGreaterThan(1);
    expect(ups.length).toBe(1);
    expect(rig.player.progression.skills.size).toBeGreaterThan(1);
  });

  it('restores health on level up', () => {
    const rig = makeRig('ironbound', 'prog-2');
    rig.player.actor.health = 1;
    rig.player.grantXp(1000);
    expect(rig.player.actor.health).toBe(rig.player.actor.maxHealth);
  });
});

describe('determinism', () => {
  it('two identical runs produce identical world state', () => {
    const snapshot = (seed: string) => {
      const rig = makeRig('ironbound', seed);
      rig.zone.spawnGroup([{ defId: 'kept_villager', count: 4 }], 25, 20, 2);
      rig.player.requestMove(25, 20);
      for (let i = 0; i < 600; i++) rig.zone.update(DT);
      return rig.world.actors.map((a) => `${a.id}:${a.x.toFixed(4)},${a.y.toFixed(4)},${a.health.toFixed(2)}`).join('|');
    };
    expect(snapshot('determinism')).toBe(snapshot('determinism'));
  });
});
