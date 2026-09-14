/**
 * The single damage pipeline (§11 "Crear fórmulas centralizadas").
 *
 * Nothing in the game subtracts health directly; everything routes through
 * `resolveDamage` so that crits, resistances, armour, elite modifiers, "on hit"
 * item effects and the damage-number display all behave consistently and can be
 * unit-tested without a renderer (`tests/damage.test.ts`).
 */

import type { Rng } from '@/core/rng';
import { clamp } from '@/core/math';
import { armourReduction, resistanceReduction, type DamageType } from './stats';
import type { Actor } from './entity';

export interface DamagePacket {
  /** Pre-mitigation damage split by type. Most hits use a single type. */
  readonly amounts: Partial<Record<DamageType, number>>;
  /** Multiplies the whole packet — skill coefficients live here. */
  readonly coefficient?: number;
  /** Set for damage over time so it cannot crit or stagger. */
  readonly overTime?: boolean;
  /** Suppresses crit rolls (used by reflected and environmental damage). */
  readonly cannotCrit?: boolean;
  /** How hard this hit pushes the stagger meter (§8 physical reaction). */
  readonly staggerPower?: number;
  readonly knockback?: number;
  readonly tag?: string;
}

export interface DamageResult {
  /** Final damage actually applied to health. */
  readonly total: number;
  readonly byType: Partial<Record<DamageType, number>>;
  readonly crit: boolean;
  /** Damage that was prevented — shown in the debug overlay when tuning. */
  readonly mitigated: number;
  readonly killed: boolean;
  readonly staggered: boolean;
  readonly overTime: boolean;
  readonly dominantType: DamageType;
  readonly tag: string | null;
}

/**
 * Applies a packet from `attacker` (may be null for environment) to `target`.
 * Mutates `target.health`; the caller is responsible for emitting events, so
 * that this stays a pure-ish function that tests can call in a tight loop.
 */
export function resolveDamage(
  attacker: Actor | null,
  target: Actor,
  packet: DamagePacket,
  rng: Rng,
): DamageResult {
  const coeff = packet.coefficient ?? 1;
  const attackerLevel = attacker?.level ?? 1;

  // --- Crit roll -----------------------------------------------------------
  let crit = false;
  if (attacker && !packet.overTime && !packet.cannotCrit) {
    crit = rng.chance(attacker.stats.get('critChance'));
  }
  const critMult = crit ? (attacker?.stats.get('critDamage') ?? 1.5) : 1;

  // --- Per-type mitigation -------------------------------------------------
  const byType: Partial<Record<DamageType, number>> = {};
  let total = 0;
  let raw = 0;
  let dominantType: DamageType = 'physical';
  let dominantAmount = -1;

  for (const [key, baseAmount] of Object.entries(packet.amounts) as [DamageType, number][]) {
    if (!baseAmount) continue;

    // Attacker-side additive bonus for this damage type (+fire damage affixes).
    const typeBonus = attacker ? attacker.stats.get(`dmg_${key}`) : 0;
    let amount = baseAmount * coeff * (1 + typeBonus) * critMult;
    raw += amount;

    // Armour only ever reduces physical; elements go through resistances.
    // Keeping these separate is what makes elemental builds feel distinct
    // against heavily armoured enemies (§11).
    if (key === 'physical') {
      amount *= 1 - armourReduction(target.stats.get('armour'), attackerLevel);
    }
    amount *= 1 - resistanceReduction(target.stats.get(`res_${key}`));
    amount *= target.stats.get('damageTaken');

    amount = Math.max(0, amount);
    byType[key] = (byType[key] ?? 0) + amount;
    total += amount;

    if (amount > dominantAmount) {
      dominantAmount = amount;
      dominantType = key;
    }
  }

  // Round to whole numbers: legible damage text beats false precision (§33).
  total = total < 1 && total > 0 ? 1 : Math.round(total);

  // --- Stagger -------------------------------------------------------------
  let staggered = false;
  if (!packet.overTime && packet.staggerPower) {
    const staggerPower = attacker ? attacker.stats.get('staggerPower') : 0;
    const power = packet.staggerPower * (1 + staggerPower * 0.01);
    const resist = target.stats.get('staggerResist');
    target.staggerMeter += Math.max(0, power - resist * 0.1);
    if (target.staggerMeter >= target.staggerThreshold) {
      target.staggerMeter = 0;
      staggered = true;
    }
  }

  // --- Apply ---------------------------------------------------------------
  const before = target.health;
  target.health = clamp(target.health - total, 0, target.stats.get('maxHealth'));
  const killed = before > 0 && target.health <= 0;

  return {
    total,
    byType,
    crit,
    mitigated: Math.max(0, Math.round(raw - total)),
    killed,
    staggered,
    overTime: packet.overTime ?? false,
    dominantType,
    tag: packet.tag ?? null,
  };
}

/**
 * Rolls a weapon's damage range into a packet.
 * Attack power scales physical weapons; spell power scales casts. Both use the
 * same `/100` denominator so "+20 attack power" means the same thing everywhere.
 */
export function weaponPacket(
  attacker: Actor,
  min: number,
  max: number,
  type: DamageType,
  rng: Rng,
  opts: { coefficient?: number; spell?: boolean; staggerPower?: number; knockback?: number; tag?: string } = {},
): DamagePacket {
  const rolled = rng.range(min, max);
  const power = opts.spell ? attacker.stats.get('spellPower') : attacker.stats.get('attackPower');
  return {
    amounts: { [type]: rolled * (1 + power / 100) },
    coefficient: opts.coefficient ?? 1,
    staggerPower: opts.staggerPower ?? 0,
    knockback: opts.knockback ?? 0,
    tag: opts.tag,
  };
}

/** Healing shares the clamp logic so overheal never inflates the health bar. */
export function applyHeal(target: Actor, amount: number): number {
  const max = target.stats.get('maxHealth');
  const before = target.health;
  target.health = clamp(target.health + amount, 0, max);
  return Math.round(target.health - before);
}
