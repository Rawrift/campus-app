/**
 * Stats, attributes and the modifier stack (§11, §36).
 *
 * Design rule for this project: numbers stay small and legible. A level-1 hit
 * should read as "8", a level-10 hit as "40-60". Every multiplier here is
 * additive-percentage rather than compounding, because compounding multipliers
 * are what turn ARPG numbers into telephone numbers by the second act.
 */

import { clamp } from '@/core/math';

/** The four primary attributes. Named for the fiction rather than for D&D. */
export const ATTRIBUTES = ['might', 'finesse', 'resolve', 'insight'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const DAMAGE_TYPES = ['physical', 'fire', 'frost', 'lightning', 'poison', 'shadow'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Every numeric stat an actor can have. Kept flat so modifiers are uniform. */
export const STATS = [
  'maxHealth', 'healthRegen',
  'maxResource', 'resourceRegen',
  'armour',
  'attackPower', 'spellPower',
  'attackSpeed', 'moveSpeed',
  'critChance', 'critDamage',
  'lifeOnKill', 'lifeOnHit',
  'staggerResist', 'staggerPower',
  'areaSize', 'projectileSpeed', 'damageTaken',
  ...ATTRIBUTES,
  ...DAMAGE_TYPES.map((t) => `res_${t}` as const),
  ...DAMAGE_TYPES.map((t) => `dmg_${t}` as const),
] as const;
export type StatKey = (typeof STATS)[number];

export type StatTable = Partial<Record<StatKey, number>>;

/** Flat adds first, then a single additive percentage bucket. */
export interface Modifier {
  readonly stat: StatKey;
  readonly flat?: number;
  /** Additive percentage, expressed as 0.15 for "+15%". */
  readonly pct?: number;
  /** Where it came from, so the character sheet can explain a number. */
  readonly source?: string;
}

/**
 * Defaults are 0 for additive stats, but multiplier-style stats must default to
 * their identity value. Getting this wrong is silent and severe: a
 * `damageTaken` default of 0 is clamped up to the 0.1 floor, which would make
 * every actor in the game take a tenth of all incoming damage.
 */
const MULTIPLIER_IDENTITIES: Partial<Record<StatKey, number>> = {
  damageTaken: 1,
  critDamage: 1.5,
  attackSpeed: 1,
  moveSpeed: 4,
};

const BASE_DEFAULTS: Record<StatKey, number> = {
  ...Object.fromEntries(STATS.map((s) => [s, 0])),
  ...MULTIPLIER_IDENTITIES,
} as Record<StatKey, number>;

/**
 * Holds base values plus a list of modifiers and caches the resolved totals.
 * Recomputes lazily, because equipping an item touches a dozen stats at once
 * and we do not want a dozen full recomputes.
 */
export class StatBlock {
  private base: Record<StatKey, number>;
  private mods: Modifier[] = [];
  private cache: Record<StatKey, number> | null = null;

  constructor(base: StatTable = {}) {
    this.base = { ...BASE_DEFAULTS, ...base } as Record<StatKey, number>;
  }

  setBase(stat: StatKey, value: number): void {
    this.base[stat] = value;
    this.cache = null;
  }

  addBase(stat: StatKey, delta: number): void {
    this.base[stat] += delta;
    this.cache = null;
  }

  getBase(stat: StatKey): number {
    return this.base[stat];
  }

  addModifier(mod: Modifier): void {
    this.mods.push(mod);
    this.cache = null;
  }

  addModifiers(mods: readonly Modifier[]): void {
    if (mods.length === 0) return;
    this.mods.push(...mods);
    this.cache = null;
  }

  /** Removes every modifier contributed by a source (i.e. an unequipped item). */
  removeBySource(source: string): void {
    const before = this.mods.length;
    this.mods = this.mods.filter((m) => m.source !== source);
    if (this.mods.length !== before) this.cache = null;
  }

  /**
   * Removes every modifier whose source begins with `prefix`.
   *
   * Equipment needs this: removing only the sources of *currently* equipped
   * items leaves an unequipped item's modifiers applied forever, so stats climb
   * with every gear swap. Clearing the whole `item:` namespace before
   * re-applying is the only version that cannot leak.
   */
  removeByPrefix(prefix: string): void {
    const before = this.mods.length;
    this.mods = this.mods.filter((m) => !m.source?.startsWith(prefix));
    if (this.mods.length !== before) this.cache = null;
  }

  clearModifiers(): void {
    this.mods = [];
    this.cache = null;
  }

  /** Forces the next `get` to recompute. Call after mutating attributes. */
  invalidate(): void {
    this.cache = null;
  }

  get(stat: StatKey): number {
    if (!this.cache) this.resolve();
    return this.cache![stat];
  }

  /** All resolved stats — used by the character sheet and by save files. */
  snapshot(): Record<StatKey, number> {
    if (!this.cache) this.resolve();
    return { ...this.cache! };
  }

  private resolve(): void {
    const flat: Record<string, number> = {};
    const pct: Record<string, number> = {};
    for (const m of this.mods) {
      if (m.flat) flat[m.stat] = (flat[m.stat] ?? 0) + m.flat;
      if (m.pct) pct[m.stat] = (pct[m.stat] ?? 0) + m.pct;
    }

    const out = {} as Record<StatKey, number>;
    for (const stat of STATS) {
      out[stat] = (this.base[stat] + (flat[stat] ?? 0)) * (1 + (pct[stat] ?? 0));
    }

    // Attributes feed derived stats. This is the one place the conversion
    // lives, so re-balancing it is a single edit (§36).
    out.maxHealth += out.resolve * 6;
    out.maxResource += out.insight * 2;
    out.attackPower += out.might * 1.5;
    out.spellPower += out.insight * 1.5;
    out.critChance += out.finesse * 0.0025;
    out.attackSpeed += out.finesse * 0.004;
    out.staggerResist += out.resolve * 0.5;

    // Clamps that keep the game readable and prevent degenerate builds.
    out.attackSpeed = clamp(out.attackSpeed, 0.4, 2.5);
    out.moveSpeed = clamp(out.moveSpeed, 0.5, 12);
    out.critChance = clamp(out.critChance, 0, 0.75);
    out.critDamage = Math.max(1.1, out.critDamage);
    out.damageTaken = clamp(out.damageTaken, 0.1, 3);
    for (const t of DAMAGE_TYPES) {
      // 75% resistance cap — the classic ARPG guard against immunity stacking.
      out[`res_${t}`] = clamp(out[`res_${t}`], -1, 0.75);
    }
    out.maxHealth = Math.max(1, Math.round(out.maxHealth));
    out.maxResource = Math.max(0, Math.round(out.maxResource));
    out.armour = Math.max(0, out.armour);

    this.cache = out;
  }
}

/**
 * Armour → physical damage reduction.
 *
 * Scaling by the *attacker's* level means a set of armour that felt strong at
 * level 2 gradually stops carrying you, which is the pressure that makes new
 * loot desirable (§12) without inflating the raw numbers.
 */
export function armourReduction(armour: number, attackerLevel: number): number {
  if (armour <= 0) return 0;
  const k = 24 + attackerLevel * 12;
  return clamp(armour / (armour + k), 0, 0.8);
}

/** Resistance is already a fraction; this only enforces the floor and cap. */
export function resistanceReduction(resistance: number): number {
  return clamp(resistance, -1, 0.75);
}
