/**
 * Items, rarities, affixes and generated instances (§12, §13, §14).
 *
 * Fiction note: in Ossuan, objects retain the memory of the people who used
 * them. Rarity is therefore *how much memory an object is carrying*, which is
 * why the tiers are named BLANK → MARKED → HAUNTED → RELIQUARY rather than
 * common/magic/rare/unique.
 */

import type { Modifier, StatKey, DamageType } from './stats';

// ---------------------------------------------------------------------------
// Slots and categories
// ---------------------------------------------------------------------------

export const EQUIP_SLOTS = [
  'head', 'shoulders', 'chest', 'hands', 'belt', 'legs', 'feet',
  'cloak', 'mainHand', 'offHand', 'amulet', 'ring1', 'ring2',
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** Which visual module on the character rig an item drives (§3). */
export type VisualModule =
  | 'helmet' | 'shoulders' | 'torsoArmour' | 'gloves' | 'belt'
  | 'legs' | 'boots' | 'cloak' | 'mainHand' | 'offHand' | 'none';

export type WeaponCategory =
  | 'sword' | 'axe' | 'mace' | 'dagger' | 'polearm' | 'crossbow' | 'stave' | 'shield';
export type ArmourClass = 'cloth' | 'leather' | 'mail' | 'plate';
export type ItemCategory = WeaponCategory | ArmourClass | 'jewellery';

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

export const RARITIES = ['blank', 'marked', 'haunted', 'reliquary'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RarityDef {
  readonly id: Rarity;
  readonly label: string;
  /** Hex colour used by the UI, ground labels and the item beam. */
  readonly colour: number;
  readonly minAffixes: number;
  readonly maxAffixes: number;
  /** Multiplies base stats — a haunted sword is better *before* affixes too. */
  readonly statMultiplier: number;
  readonly valueMultiplier: number;
}

export const RARITY: Record<Rarity, RarityDef> = {
  blank: {
    id: 'blank', label: 'Blank', colour: 0xb9b2a6,
    minAffixes: 0, maxAffixes: 0, statMultiplier: 1, valueMultiplier: 1,
  },
  marked: {
    id: 'marked', label: 'Marked', colour: 0x6f93c4,
    minAffixes: 1, maxAffixes: 2, statMultiplier: 1.12, valueMultiplier: 3,
  },
  haunted: {
    id: 'haunted', label: 'Haunted', colour: 0xc8a349,
    minAffixes: 3, maxAffixes: 4, statMultiplier: 1.28, valueMultiplier: 9,
  },
  reliquary: {
    id: 'reliquary', label: 'Reliquary', colour: 0xa8582f,
    minAffixes: 2, maxAffixes: 3, statMultiplier: 1.4, valueMultiplier: 30,
  },
};

// ---------------------------------------------------------------------------
// Base items
// ---------------------------------------------------------------------------

/** Parameters the procedural mesh builder reads to construct the model (§4, §42). */
export interface VisualSpec {
  readonly module: VisualModule;
  /** 0 = improvised, 1 = professional, 2 = ancient/ceremonial (§4 tiers). */
  readonly tier: 0 | 1 | 2;
  /** Drives material choice: rusted iron, boiled leather, coarse cloth… */
  readonly material: 'cloth' | 'leather' | 'iron' | 'steel' | 'darksteel' | 'bone' | 'wood';
  /** Silhouette knobs, 0..1, so two mail chests can still look different. */
  readonly bulk?: number;
  readonly spikes?: number;
  readonly length?: number;
  readonly accent?: number;
}

export interface ItemBase {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipSlot;
  readonly category: ItemCategory;
  /** Inventory footprint in grid cells (§15). */
  readonly grid: readonly [number, number];
  /** Lowest item level this base may generate at. */
  readonly minItemLevel: number;
  /** Relative chance of being picked when a drop rolls this slot. */
  readonly weight: number;
  /** Level/attribute needed to equip. */
  readonly requirements?: Partial<Record<'level' | 'might' | 'finesse' | 'insight', number>>;
  /** Flat stats before rarity multiplier and affixes. */
  readonly baseStats?: Partial<Record<StatKey, number>>;
  /** Weapons only. */
  readonly damage?: { readonly min: number; readonly max: number; readonly type: DamageType };
  /** Seconds between swings at 1.0 attack speed. */
  readonly speed?: number;
  /** Melee reach in world units, measured from the wielder's centre. */
  readonly reach?: number;
  readonly twoHanded?: boolean;
  readonly blockChance?: number;
  readonly baseValue: number;
  readonly visual: VisualSpec;
  /** Flavour line shown at the bottom of the tooltip. */
  readonly flavour?: string;
}

// ---------------------------------------------------------------------------
// Affixes
// ---------------------------------------------------------------------------

export type AffixKind = 'prefix' | 'suffix';

export interface AffixTier {
  readonly minLevel: number;
  readonly weight: number;
  readonly min: number;
  readonly max: number;
  /** Shown in the name, e.g. "Gravewrought". */
  readonly label: string;
}

export interface AffixDef {
  readonly id: string;
  readonly kind: AffixKind;
  /** The stat it grants. */
  readonly stat: StatKey;
  /** `flat` adds a number, `pct` adds a fraction (0.1 = +10%). */
  readonly mode: 'flat' | 'pct';
  readonly tiers: readonly AffixTier[];
  /** Which slots may roll it. Empty means "any". */
  readonly slots?: readonly EquipSlot[];
  /** Categories this affix refuses (e.g. no "+armour" on a ring). */
  readonly categories?: readonly ItemCategory[];
  readonly tags: readonly string[];
  /** Affixes sharing a group cannot coexist on one item (§13 incompatibilities). */
  readonly group: string;
  /** How the value is rendered in the tooltip. */
  readonly format: (value: number) => string;
}

export interface RolledAffix {
  readonly affixId: string;
  readonly kind: AffixKind;
  readonly tierIndex: number;
  readonly value: number;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Special effects (§14) — gameplay-changing, not "+30% damage"
// ---------------------------------------------------------------------------

export type EffectHook =
  | 'ON_HIT' | 'ON_KILL' | 'ON_CRIT' | 'ON_BLOCK'
  | 'ON_DAMAGE_TAKEN' | 'ON_CAST' | 'ON_LOW_HEALTH' | 'ON_DODGE';

export interface SpecialEffectDef {
  readonly id: string;
  readonly hook: EffectHook;
  readonly text: string;
  /** Chance to fire when the hook triggers. */
  readonly chance?: number;
  /** Minimum seconds between activations. */
  readonly cooldown?: number;
  /** Free-form tuning payload consumed by `effects.ts`. */
  readonly params?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export interface ItemInstance {
  /** Unique per instance; used by the inventory and by save files. */
  uid: number;
  readonly baseId: string;
  readonly itemLevel: number;
  readonly rarity: Rarity;
  readonly affixes: RolledAffix[];
  readonly effectIds: string[];
  /** Generated display name, e.g. "Gravewrought Bill of the Tithe". */
  readonly name: string;
  /** The seed that produced it — lets QA reproduce any drop exactly (§13). */
  readonly seed: number;
  /** Cached sell value. */
  readonly value: number;
  /** Where it sits in the inventory grid; null while equipped or on the ground. */
  gridX?: number | null;
  gridY?: number | null;
}

let nextItemUid = 1;
export function nextUid(): number {
  return nextItemUid++;
}
export function setUidCounter(v: number): void {
  nextItemUid = Math.max(nextItemUid, v);
}
export function resetUidCounter(): void {
  nextItemUid = 1;
}

/** Builds the stat modifier list an equipped instance contributes (§11). */
export function itemModifiers(
  item: ItemInstance,
  base: ItemBase,
  affixLookup: (id: string) => AffixDef | undefined,
): Modifier[] {
  const source = `item:${item.uid}`;
  const mods: Modifier[] = [];
  const mult = RARITY[item.rarity].statMultiplier;

  for (const [stat, value] of Object.entries(base.baseStats ?? {}) as [StatKey, number][]) {
    if (!value) continue;
    // Base stats scale mildly with item level so a level-9 chest beats a level-1
    // one of the same base, without the numbers running away (§11).
    const scaled = value * mult * (1 + (item.itemLevel - 1) * 0.06);
    mods.push({ stat, flat: Math.round(scaled * 10) / 10, source });
  }

  for (const rolled of item.affixes) {
    const def = affixLookup(rolled.affixId);
    if (!def) continue; // affix removed in a later patch — degrade, don't crash
    mods.push(
      def.mode === 'flat'
        ? { stat: def.stat, flat: rolled.value, source }
        : { stat: def.stat, pct: rolled.value, source },
    );
  }
  return mods;
}
