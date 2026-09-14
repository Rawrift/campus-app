/**
 * Loot generation (§12, §13).
 *
 * Everything is driven by a seeded `Rng`, so a drop is fully reproducible from
 * `(seed, itemLevel, context)`. `tests/loot.test.ts` leans on that to assert the
 * rarity distribution and affix ranges without running the game.
 */

import type { Rng } from '@/core/rng';
import { ITEM_BASES } from '@/data/items.data';
import { AFFIXES } from '@/data/affixes.data';
import { SPECIAL_EFFECTS, EFFECT_SLOT_POOL } from '@/data/effects.data';
import {
  RARITY, RARITIES, nextUid,
  type ItemBase, type ItemInstance, type Rarity, type RolledAffix, type EquipSlot,
} from './items';

/** Tunes how generous a particular drop is. Bosses and chests pass boosts. */
export interface LootContext {
  /** Item level of the drop — normally the monster's level. */
  readonly itemLevel: number;
  /** Multiplies the chance of each rarity above blank. */
  readonly rarityBonus?: number;
  /** Restricts the roll to these slots (used by targeted rewards). */
  readonly slots?: readonly EquipSlot[];
  /** Forces a minimum rarity, e.g. the boss always drops at least haunted. */
  readonly minRarity?: Rarity;
}

/**
 * Base rarity weights. Deliberately steep: the whole "maybe the next one" pull
 * of §12 depends on reliquaries being genuinely rare.
 */
const RARITY_WEIGHTS: Record<Rarity, number> = {
  blank: 1000,
  marked: 260,
  haunted: 52,
  reliquary: 6,
};

export function rollRarity(rng: Rng, bonus = 0, minRarity?: Rarity): Rarity {
  const minIndex = minRarity ? RARITIES.indexOf(minRarity) : 0;
  const picked = rng.weighted(RARITIES, (r) => {
    const index = RARITIES.indexOf(r);
    if (index < minIndex) return 0;
    const w = RARITY_WEIGHTS[r];
    // The bonus is applied multiplicatively to non-blank tiers only, so magic
    // find shifts the shape of the curve rather than just scaling it.
    return index === 0 ? w : w * (1 + bonus);
  });
  return picked ?? 'blank';
}

/** Picks a base item that may legally appear at this item level. */
export function rollBase(rng: Rng, ctx: LootContext): ItemBase | undefined {
  const candidates = ITEM_BASES.filter((b) => {
    if (b.minItemLevel > ctx.itemLevel) return false;
    if (ctx.slots && !ctx.slots.includes(b.slot)) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;

  return rng.weighted(candidates, (b) => {
    // Bases much lower than the drop level become progressively less likely, so
    // a level-9 kill mostly stops handing out tier-0 farm tools.
    const gap = ctx.itemLevel - b.minItemLevel;
    const decay = gap > 4 ? Math.pow(0.55, gap - 4) : 1;
    return b.weight * decay;
  });
}

/** True when an affix is legal on this base at this item level. */
export function affixAllowed(
  affixId: string, base: ItemBase, itemLevel: number, usedGroups: ReadonlySet<string>,
): boolean {
  const def = AFFIXES.find(affixId);
  if (!def) return false;
  if (usedGroups.has(def.group)) return false;
  if (def.slots && !def.slots.includes(base.slot)) return false;
  if (def.categories && !def.categories.includes(base.category)) return false;
  return def.tiers.some((t) => t.minLevel <= itemLevel);
}

/** Rolls one affix of the requested kind, respecting groups already used. */
function rollAffix(
  rng: Rng, base: ItemBase, itemLevel: number, kind: 'prefix' | 'suffix',
  usedGroups: Set<string>,
): RolledAffix | undefined {
  const pool = AFFIXES.filter(
    (a) => a.kind === kind && affixAllowed(a.id, base, itemLevel, usedGroups),
  );
  if (pool.length === 0) return undefined;

  const def = rng.weighted(pool, () => 1);
  if (!def) return undefined;

  // Among the tiers this item level unlocks, higher tiers are rarer.
  const eligible = def.tiers.filter((t) => t.minLevel <= itemLevel);
  const tier = rng.weighted(eligible, (t) => t.weight);
  if (!tier) return undefined;

  const tierIndex = def.tiers.indexOf(tier);
  const raw = rng.range(tier.min, tier.max);
  // Percent affixes keep 3 decimals; flat ones round to something readable.
  const value = def.mode === 'pct' || tier.max < 1
    ? Math.round(raw * 1000) / 1000
    : Math.round(raw);

  usedGroups.add(def.group);
  return { affixId: def.id, kind, tierIndex, value, label: tier.label };
}

/** Composes the display name from the base and its strongest affixes. */
function composeName(base: ItemBase, rarity: Rarity, affixes: readonly RolledAffix[]): string {
  if (rarity === 'blank') return base.name;
  const prefix = affixes.find((a) => a.kind === 'prefix');
  const suffix = affixes.find((a) => a.kind === 'suffix');
  let name = base.name;
  if (prefix) name = `${prefix.label} ${name}`;
  if (suffix) name = `${name} ${suffix.label}`;
  return name;
}

/**
 * Generates one complete item instance.
 * The `seed` is captured on the instance so QA can reproduce any drop (§55).
 */
export function generateItem(rng: Rng, ctx: LootContext): ItemInstance | null {
  const seed = rng.seed;
  const base = rollBase(rng, ctx);
  if (!base) return null;

  const rarity = rollRarity(rng, ctx.rarityBonus ?? 0, ctx.minRarity);
  const def = RARITY[rarity];

  const count = rng.int(def.minAffixes, def.maxAffixes);
  const usedGroups = new Set<string>();
  const affixes: RolledAffix[] = [];

  // Alternate prefix/suffix so items rarely end up with four prefixes.
  for (let i = 0; i < count; i++) {
    const kind = i % 2 === 0 ? 'prefix' : 'suffix';
    const rolled = rollAffix(rng, base, ctx.itemLevel, kind, usedGroups)
      ?? rollAffix(rng, base, ctx.itemLevel, kind === 'prefix' ? 'suffix' : 'prefix', usedGroups);
    if (rolled) affixes.push(rolled);
  }

  // Reliquaries carry a gameplay-changing effect — that is what defines them.
  const effectIds: string[] = [];
  if (rarity === 'reliquary') {
    const pool = (EFFECT_SLOT_POOL[base.slot] ?? []).filter((id) => SPECIAL_EFFECTS.has(id));
    if (pool.length > 0) effectIds.push(rng.pick(pool));
  }

  const affixValue = affixes.reduce((sum, a) => sum + (a.tierIndex + 1) * 12, 0);
  const value = Math.round(
    (base.baseValue + affixValue + ctx.itemLevel * 3) * def.valueMultiplier,
  );

  return {
    uid: nextUid(),
    baseId: base.id,
    itemLevel: ctx.itemLevel,
    rarity,
    affixes,
    effectIds,
    name: composeName(base, rarity, affixes),
    seed,
    value,
    gridX: null,
    gridY: null,
  };
}

/**
 * Rolls a whole drop for a slain enemy.
 * `dropChance` is per-enemy (see `enemies.data.ts`); elites and bosses raise
 * both the count and the rarity bonus rather than just dumping more junk (§16).
 */
export function rollDrop(
  rng: Rng,
  opts: {
    itemLevel: number;
    dropChance: number;
    rolls?: number;
    rarityBonus?: number;
    minRarity?: Rarity;
  },
): ItemInstance[] {
  const out: ItemInstance[] = [];
  const rolls = opts.rolls ?? 1;
  for (let i = 0; i < rolls; i++) {
    if (!rng.chance(opts.dropChance)) continue;
    const item = generateItem(rng, {
      itemLevel: opts.itemLevel,
      rarityBonus: opts.rarityBonus ?? 0,
      // Only the first roll honours a guaranteed minimum rarity.
      minRarity: i === 0 ? opts.minRarity : undefined,
    });
    if (item) out.push(item);
  }
  return out;
}
