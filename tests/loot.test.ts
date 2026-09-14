import { describe, it, expect, beforeEach } from 'vitest';
import { Rng } from '@/core/rng';
import { generateItem, rollRarity, rollDrop, affixAllowed } from '@/sim/loot';
import { ITEM_BASES } from '@/data/items.data';
import { AFFIXES } from '@/data/affixes.data';
import { RARITY, resetUidCounter, type Rarity } from '@/sim/items';

beforeEach(() => resetUidCounter());

describe('determinism', () => {
  it('produces identical items from identical seeds', () => {
    const a = generateItem(new Rng('ossuan-42'), { itemLevel: 6 });
    const b = generateItem(new Rng('ossuan-42'), { itemLevel: 6 });
    expect(a).toBeTruthy();
    expect({ ...a!, uid: 0 }).toEqual({ ...b!, uid: 0 });
  });

  it('produces different items from different seeds', () => {
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) {
      names.add(generateItem(new Rng(i), { itemLevel: 8 })!.name);
    }
    expect(names.size).toBeGreaterThan(10);
  });
});

describe('rarity distribution', () => {
  it('follows the intended steep curve over a large sample', () => {
    const rng = new Rng('rarity');
    const counts: Record<Rarity, number> = { blank: 0, marked: 0, haunted: 0, reliquary: 0 };
    const N = 200_000;
    for (let i = 0; i < N; i++) counts[rollRarity(rng)]++;

    // Ordering must hold strictly: each tier rarer than the last.
    expect(counts.blank).toBeGreaterThan(counts.marked);
    expect(counts.marked).toBeGreaterThan(counts.haunted);
    expect(counts.haunted).toBeGreaterThan(counts.reliquary);

    // Reliquaries are the "maybe the next one" tier - keep them near 0.5%.
    const reliquaryPct = (counts.reliquary / N) * 100;
    expect(reliquaryPct).toBeGreaterThan(0.2);
    expect(reliquaryPct).toBeLessThan(1.0);
  });

  it('respects a guaranteed minimum rarity', () => {
    const rng = new Rng('boss');
    for (let i = 0; i < 500; i++) {
      const r = rollRarity(rng, 0, 'haunted');
      expect(['haunted', 'reliquary']).toContain(r);
    }
  });

  it('rarity bonus increases the share of non-blank drops', () => {
    const count = (bonus: number) => {
      const rng = new Rng('bonus');
      let good = 0;
      for (let i = 0; i < 20_000; i++) if (rollRarity(rng, bonus) !== 'blank') good++;
      return good;
    };
    expect(count(3)).toBeGreaterThan(count(0));
  });
});

describe('affix rules', () => {
  it('never rolls two affixes from the same group on one item', () => {
    const rng = new Rng('groups');
    for (let i = 0; i < 3000; i++) {
      const item = generateItem(rng, { itemLevel: 10, rarityBonus: 50 });
      if (!item) continue;
      const groups = item.affixes.map((a) => AFFIXES.get(a.affixId).group);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it('never rolls an affix above the item level gate', () => {
    const rng = new Rng('levels');
    for (let lvl = 1; lvl <= 10; lvl++) {
      for (let i = 0; i < 400; i++) {
        const item = generateItem(rng, { itemLevel: lvl, rarityBonus: 50 });
        if (!item) continue;
        for (const a of item.affixes) {
          const tier = AFFIXES.get(a.affixId).tiers[a.tierIndex]!;
          expect(tier.minLevel).toBeLessThanOrEqual(lvl);
        }
      }
    }
  });

  it('keeps every rolled value inside its declared tier range', () => {
    const rng = new Rng('ranges');
    for (let i = 0; i < 4000; i++) {
      const item = generateItem(rng, { itemLevel: 10, rarityBonus: 50 });
      if (!item) continue;
      for (const a of item.affixes) {
        const def = AFFIXES.get(a.affixId);
        const tier = def.tiers[a.tierIndex]!;
        // Flat affixes are rounded to integers, so allow the rounding slack.
        expect(a.value).toBeGreaterThanOrEqual(Math.floor(tier.min));
        expect(a.value).toBeLessThanOrEqual(Math.ceil(tier.max));
      }
    }
  });

  it('respects slot and category restrictions', () => {
    const rng = new Rng('slots');
    for (let i = 0; i < 3000; i++) {
      const item = generateItem(rng, { itemLevel: 10, rarityBonus: 50 });
      if (!item) continue;
      const base = ITEM_BASES.get(item.baseId);
      for (const a of item.affixes) {
        const def = AFFIXES.get(a.affixId);
        if (def.slots) expect(def.slots).toContain(base.slot);
        if (def.categories) expect(def.categories).toContain(base.category);
      }
    }
  });

  it('affixAllowed rejects a group already present', () => {
    const base = ITEM_BASES.get('wpn_sword_1');
    expect(affixAllowed('pre_physical', base, 10, new Set())).toBe(true);
    expect(affixAllowed('pre_physical', base, 10, new Set(['dmg_physical']))).toBe(false);
  });
});

describe('affix counts per rarity', () => {
  it('matches the rarity definition', () => {
    const rng = new Rng('counts');
    for (let i = 0; i < 5000; i++) {
      const item = generateItem(rng, { itemLevel: 10, rarityBonus: 80 });
      if (!item) continue;
      const def = RARITY[item.rarity];
      // A base may run out of legal affixes, so the count is an upper bound.
      expect(item.affixes.length).toBeLessThanOrEqual(def.maxAffixes);
    }
  });

  it('gives every reliquary exactly one special effect', () => {
    const rng = new Rng('reliquary');
    let seen = 0;
    for (let i = 0; i < 40_000 && seen < 25; i++) {
      const item = generateItem(rng, { itemLevel: 10 });
      if (item?.rarity === 'reliquary') {
        seen++;
        expect(item.effectIds.length).toBe(1);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('base selection', () => {
  it('never rolls a base above the drop item level', () => {
    const rng = new Rng('bases');
    for (let lvl = 1; lvl <= 10; lvl++) {
      for (let i = 0; i < 300; i++) {
        const item = generateItem(rng, { itemLevel: lvl });
        if (!item) continue;
        expect(ITEM_BASES.get(item.baseId).minItemLevel).toBeLessThanOrEqual(lvl);
      }
    }
  });

  it('rollDrop respects drop chance', () => {
    const rng = new Rng('drops');
    let total = 0;
    for (let i = 0; i < 10_000; i++) total += rollDrop(rng, { itemLevel: 5, dropChance: 0.25 }).length;
    expect(total / 10_000).toBeGreaterThan(0.2);
    expect(total / 10_000).toBeLessThan(0.3);
  });
});

describe('value', () => {
  it('scales monotonically with rarity for the same base', () => {
    const rng = new Rng('value');
    const best: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const item = generateItem(rng, { itemLevel: 8, rarityBonus: 20 });
      if (item?.baseId !== 'wpn_sword_1') continue;
      best[item.rarity] = Math.max(best[item.rarity] ?? 0, item.value);
    }
    if (best.blank && best.marked) expect(best.marked).toBeGreaterThan(best.blank);
    if (best.marked && best.haunted) expect(best.haunted).toBeGreaterThan(best.marked);
  });
});
