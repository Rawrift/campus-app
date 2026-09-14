import { describe, it, expect } from 'vitest';
import { makeRig } from './helpers';
import {
  applySave, createSave, listSaves, loadStash, MemoryStorage, migrate,
  readSave, writeSave, SAVE_VERSION, type SaveFile,
} from '@/save/save';
import { ZoneRuntime } from '@/world/zoneRuntime';
import { PlayerController } from '@/sim/player';
import { generateItem } from '@/sim/loot';
import { Rng } from '@/core/rng';

function seedCharacter() {
  const rig = makeRig('pallwalker', 'save-src');
  rig.player.grantXp(2500);
  rig.player.gold = 742;
  rig.player.potion.count = 4;

  const rng = new Rng('gear');
  for (let i = 0; i < 5; i++) {
    const item = generateItem(rng, { itemLevel: 6, rarityBonus: 4 });
    if (item) rig.player.inventory.add(item);
  }
  const weapon = generateItem(rng, { itemLevel: 6, slots: ['mainHand'], rarityBonus: 20 })!;
  rig.player.inventory.add(weapon);
  rig.player.equipFromInventory(weapon.uid);

  const zones = new ZoneRuntime('save-src');
  zones.visited.add('grestwick');
  zones.visited.add('marches');
  zones.consumed.add('marches_chest_1');
  zones.clearedGroups.add('marches:hamlet');

  return { rig, zones, weapon };
}

describe('round trip', () => {
  it('restores level, XP, gold, skills and the action bar', () => {
    const { rig, zones } = seedCharacter();
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 'save-src', stash: [],
      stats: { kills: 12, deaths: 1, playtime: 300, bossDefeated: false },
    });

    const fresh = makeRig('pallwalker', 'save-dst');
    const freshZones = new ZoneRuntime('save-dst');
    const { warnings } = applySave(file, fresh.player, freshZones);

    expect(warnings).toEqual([]);
    expect(fresh.player.progression.level).toBe(rig.player.progression.level);
    expect(fresh.player.progression.xp).toBe(rig.player.progression.xp);
    expect(fresh.player.gold).toBe(742);
    expect(fresh.player.potion.count).toBe(4);
    expect([...fresh.player.progression.ranks.entries()].sort())
      .toEqual([...rig.player.progression.ranks.entries()].sort());
    expect(fresh.player.progression.bar).toEqual(rig.player.progression.bar);
  });

  it('restores every item with its affixes and grid position intact', () => {
    const { rig, zones } = seedCharacter();
    const before = rig.player.inventory.all
      .map((i) => `${i.name}@${i.gridX},${i.gridY}:${i.affixes.map((a) => `${a.affixId}=${a.value}`).join(',')}`)
      .sort();

    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });

    const fresh = makeRig('pallwalker', 'dst2');
    applySave(file, fresh.player, new ZoneRuntime('dst2'));

    const after = fresh.player.inventory.all
      .map((i) => `${i.name}@${i.gridX},${i.gridY}:${i.affixes.map((a) => `${a.affixId}=${a.value}`).join(',')}`)
      .sort();
    expect(after).toEqual(before);
  });

  it('restores equipment and therefore the derived stats', () => {
    const { rig, zones, weapon } = seedCharacter();
    const armourBefore = rig.player.actor.stats.get('armour');
    const apBefore = rig.player.actor.stats.get('attackPower');

    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });

    const fresh = makeRig('pallwalker', 'dst3');
    applySave(file, fresh.player, new ZoneRuntime('dst3'));

    expect(fresh.player.equipment.get('mainHand')?.baseId).toBe(weapon.baseId);
    expect(fresh.player.actor.stats.get('armour')).toBeCloseTo(armourBefore, 4);
    expect(fresh.player.actor.stats.get('attackPower')).toBeCloseTo(apBefore, 4);
  });

  it('restores world progression so chests stay looted', () => {
    const { rig, zones } = seedCharacter();
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });

    const freshZones = new ZoneRuntime('dst4');
    applySave(file, makeRig('pallwalker', 'dst4').player, freshZones);

    expect(freshZones.visited.has('marches')).toBe(true);
    expect(freshZones.consumed.has('marches_chest_1')).toBe(true);
    expect(freshZones.clearedGroups.has('marches:hamlet')).toBe(true);
  });

  it('survives a full JSON serialise/parse cycle through storage', () => {
    const { rig, zones } = seedCharacter();
    const storage = new MemoryStorage();
    const file = createSave({
      player: rig.player, zones, zoneId: 'ossuary', seed: 's', stash: [],
      stats: { kills: 40, deaths: 2, playtime: 900, bossDefeated: true },
    });
    writeSave(storage, 'slot1', file);

    const read = readSave(storage, 'slot1');
    expect(read).not.toBeNull();
    expect(read!.world.zoneId).toBe('ossuary');
    expect(read!.stats.bossDefeated).toBe(true);
    expect(read!.inventory.length).toBe(file.inventory.length);
  });

  it('lists saves newest first', () => {
    const { rig, zones } = seedCharacter();
    const storage = new MemoryStorage();
    const base = {
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    };
    const older = createSave(base);
    older.savedAt = 1000;
    const newer = createSave(base);
    newer.savedAt = 2000;
    writeSave(storage, 'a', older);
    writeSave(storage, 'b', newer);

    expect(listSaves(storage).map((s) => s.slot)).toEqual(['b', 'a']);
  });
});

describe('robustness', () => {
  it('refuses a file from a newer version rather than mangling it', () => {
    expect(migrate({ version: SAVE_VERSION + 5 })).toBeNull();
  });

  it('rejects nonsense instead of throwing', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('nope')).toBeNull();
    expect(migrate({})).toBeNull();
  });

  it('returns null for a corrupt slot without throwing', () => {
    const storage = new MemoryStorage();
    storage.write('ossuan.save.bad', '{not json');
    expect(readSave(storage, 'bad')).toBeNull();
  });

  it('migrates a v1 file forward, filling in what it lacked', () => {
    const { rig, zones } = seedCharacter();
    const current = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });
    // Strip the fields v1 did not have.
    const v1 = JSON.parse(JSON.stringify(current)) as Partial<SaveFile>;
    v1.version = 1;
    delete v1.stash;
    delete v1.stats;
    delete (v1.character as { bar?: unknown }).bar;

    const migrated = migrate(v1);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(SAVE_VERSION);
    expect(migrated!.stash).toEqual([]);
    expect(migrated!.stats.kills).toBe(0);
    expect(Array.isArray(migrated!.character.bar)).toBe(true);
  });

  it('drops items whose content was removed, and loads everything else', () => {
    const { rig, zones } = seedCharacter();
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });
    const goodCount = file.inventory.length;

    // Simulate a patch that removed a base and an affix.
    file.inventory.push({
      ...file.inventory[0]!, uid: 90210, baseId: 'wpn_removed_in_patch',
    });
    if (file.inventory[0]!.affixes.length > 0) {
      file.inventory[0]!.affixes.push({
        affixId: 'affix_removed', kind: 'prefix', tierIndex: 0, value: 1, label: 'Gone',
      });
    }

    const fresh = makeRig('pallwalker', 'dst5');
    const { warnings } = applySave(file, fresh.player, new ZoneRuntime('dst5'));

    expect(warnings.length).toBeGreaterThan(0);
    expect(fresh.player.inventory.count).toBe(goodCount);
    expect(fresh.player.actor.alive).toBe(true);
  });

  it('never restores health above the recomputed maximum', () => {
    const { rig, zones } = seedCharacter();
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: [],
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });
    file.character.health = 999_999;

    const fresh = makeRig('pallwalker', 'dst6');
    applySave(file, fresh.player, new ZoneRuntime('dst6'));
    expect(fresh.player.actor.health).toBe(fresh.player.actor.maxHealth);
  });

  it('round-trips the stash separately from the bag', () => {
    const { rig, zones } = seedCharacter();
    const stashed = [generateItem(new Rng('st'), { itemLevel: 8, rarityBonus: 9 })!];
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 's', stash: stashed,
      stats: { kills: 0, deaths: 0, playtime: 0, bossDefeated: false },
    });
    const restored = loadStash(file);
    expect(restored.length).toBe(1);
    expect(restored[0]!.name).toBe(stashed[0]!.name);
  });
});

describe('a save taken mid-run reproduces the character exactly', () => {
  it('matches level, gear, stats and bag contents after a reload', () => {
    const rig = makeRig('ironbound', 'midrun');
    rig.zone.spawnGroup([{ defId: 'kept_villager', count: 3 }], 24, 20, 2);
    rig.player.requestMove(24, 20);
    rig.run(20);
    rig.player.grantXp(800);

    const zones = new ZoneRuntime('midrun');
    const file = createSave({
      player: rig.player, zones, zoneId: 'marches', seed: 'midrun', stash: [],
      stats: { kills: rig.zone.kills, deaths: 0, playtime: 20, bossDefeated: false },
    });

    const fresh = new PlayerController(rig.world, 'ironbound', 'midrun');
    applySave(file, fresh, new ZoneRuntime('midrun'));

    expect(fresh.progression.level).toBe(rig.player.progression.level);
    expect(fresh.actor.maxHealth).toBe(rig.player.actor.maxHealth);
    expect(fresh.actor.stats.get('attackPower')).toBeCloseTo(rig.player.actor.stats.get('attackPower'), 4);
    expect(fresh.inventory.count).toBe(rig.player.inventory.count);
  });
});

describe('equipment modifiers do not leak', () => {
  it('swapping gear repeatedly does not inflate stats', () => {
    const rig = makeRig('ironbound', 'leak');
    const rng = new Rng('leak');

    // Measure the naked baseline: the character starts in its archetype's kit.
    for (const [slot] of rig.player.equipment.entries) rig.player.equipment.unequip(slot);
    rig.player.recomputeStats();
    const baseline = rig.player.actor.maxHealth;

    // Equip and replace the same slot many times. Without the `item:` namespace
    // clear, each swap would leave the previous item's modifiers applied.
    for (let i = 0; i < 20; i++) {
      const item = generateItem(rng, { itemLevel: 1, slots: ['chest'] })!;
      rig.player.inventory.add(item);
      rig.player.equipFromInventory(item.uid);
    }
    const equipped = rig.player.equipment.get('chest')!;

    // Unequip everything: health must return to exactly the naked baseline.
    for (const [slot] of rig.player.equipment.entries) rig.player.equipment.unequip(slot);
    rig.player.recomputeStats();
    expect(rig.player.actor.maxHealth).toBe(baseline);

    // Re-equip just that one chest: the result must match a fresh character
    // wearing only that chest, not an accumulated total.
    rig.player.equipment.equip(equipped);
    rig.player.recomputeStats();
    const withOne = rig.player.actor.maxHealth;

    const control = makeRig('ironbound', 'leak2');
    for (const [slot] of control.player.equipment.entries) control.player.equipment.unequip(slot);
    control.player.equipment.equip(equipped);
    control.player.recomputeStats();
    expect(withOne).toBe(control.player.actor.maxHealth);
  });
});
