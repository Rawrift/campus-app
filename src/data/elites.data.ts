/**
 * Elite modifiers (§22).
 *
 * The rule here: an elite must change *how the fight is played*, not just how
 * long it takes. Each modifier therefore alters behaviour or adds a mechanic,
 * and each carries a distinct silhouette cue the renderer reads (`visual`), so
 * the player can tell what they are walking into before it reaches them.
 */

import { Registry } from '@/core/registry';
import type { StatTable } from '@/sim/stats';
import type { StatusDef } from '@/sim/status';

export interface EliteModifier {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Multiplies/adds to the base enemy stats. */
  readonly stats: StatTable;
  /** Visual cue the renderer applies — never colour alone (§22). */
  readonly visual: {
    /** Extra geometry attached to the silhouette. */
    readonly crest?: 'spines' | 'plates' | 'boils' | 'halo' | 'hooks' | 'core';
    readonly tint: number;
    readonly glow?: number;
    /** Particle aura kind. */
    readonly aura?: 'embers' | 'flies' | 'motes' | 'smoke' | 'sparks';
  };
  /** Behaviour switches consumed by `ai.ts` and `combat.ts`. */
  readonly behaviour?: {
    /** Speeds up after each hit it lands, to a cap. */
    readonly frenzyPerHit?: number;
    readonly frenzyCap?: number;
    /** Heals for this fraction of damage dealt. */
    readonly leech?: number;
    /** Explodes on death. */
    readonly deathBlast?: { radius: number; damage: number; type: 'fire' | 'poison' | 'shadow' };
    /** Applies this status to whatever it hits. */
    readonly onHitStatus?: Omit<StatusDef, 'sourceId'>;
    /** Grants nearby allies a damage reduction aura. */
    readonly wardAura?: { radius: number; reduction: number };
    /** Leaves a damaging trail behind it. */
    readonly trail?: { radius: number; dps: number; duration: number };
  };
  /** Relative chance of being rolled. */
  readonly weight: number;
  /** Cannot be combined with these. */
  readonly excludes?: readonly string[];
}

export const ELITE_MODIFIERS = new Registry<EliteModifier>('eliteModifiers', [
  {
    id: 'elite_ravenous',
    name: 'Ravenous',
    description: 'Every blow it lands makes it faster. Do not let it start.',
    stats: { maxHealth: 60, attackPower: 3, moveSpeed: 0.4 },
    visual: { crest: 'spines', tint: 0xa8322a, aura: 'sparks' },
    behaviour: { frenzyPerHit: 0.12, frenzyCap: 0.6 },
    weight: 100,
  },
  {
    id: 'elite_shelled',
    name: 'Shelled',
    description: 'Layered in scavenged plate. Physical weapons find very little to bite.',
    stats: { maxHealth: 120, armour: 40, res_physical: 0.3, staggerResist: 120, moveSpeed: -0.6 },
    visual: { crest: 'plates', tint: 0x6e6a5e },
    weight: 90,
    excludes: ['elite_wisped'],
  },
  {
    id: 'elite_plagueborne',
    name: 'Plagueborne',
    description: 'It is rotting faster than it is dying, and it wants to share.',
    stats: { maxHealth: 70, res_poison: 0.6 },
    visual: { crest: 'boils', tint: 0x6f8a3a, aura: 'flies' },
    behaviour: {
      onHitStatus: { kind: 'poison', label: 'Plagued', duration: 6, dps: 4, damageType: 'poison', maxStacks: 5, colour: 0x6f8a3a },
      deathBlast: { radius: 3.2, damage: 22, type: 'poison' },
    },
    weight: 85,
  },
  {
    id: 'elite_warding',
    name: 'Warding',
    description: 'It is protecting the others. Everything near it takes less.',
    stats: { maxHealth: 80, armour: 12 },
    visual: { crest: 'halo', tint: 0x8fa8c4, glow: 0.6, aura: 'motes' },
    behaviour: { wardAura: { radius: 6.5, reduction: 0.45 } },
    weight: 70,
  },
  {
    id: 'elite_thirsting',
    name: 'Thirsting',
    description: 'What it takes from you, it keeps.',
    stats: { maxHealth: 70, attackPower: 4 },
    visual: { crest: 'hooks', tint: 0x7d2f4a, aura: 'smoke' },
    behaviour: { leech: 0.5 },
    weight: 80,
  },
  {
    id: 'elite_cindercored',
    name: 'Cinder-Cored',
    description: 'There is a fire inside it, and killing it will let the fire out.',
    stats: { maxHealth: 60, res_fire: 0.75, res_frost: -0.3 },
    visual: { crest: 'core', tint: 0xd2762c, glow: 1.0, aura: 'embers' },
    behaviour: {
      deathBlast: { radius: 4.0, damage: 34, type: 'fire' },
      trail: { radius: 1.2, dps: 6, duration: 3 },
    },
    weight: 75,
  },
  {
    id: 'elite_wisped',
    name: 'Wisp-Ridden',
    description: 'Something is wearing it. Blades pass through more of it than they should.',
    stats: { maxHealth: 50, res_physical: 0.45, res_shadow: 0.5, moveSpeed: 0.8 },
    visual: { crest: 'core', tint: 0x8a7fa0, glow: 0.8, aura: 'motes' },
    behaviour: { onHitStatus: { kind: 'weaken', label: 'Unsteady', duration: 4, mods: [{ stat: 'attackSpeed', pct: -0.2 }], colour: 0x6a5a7d } },
    weight: 60,
    excludes: ['elite_shelled'],
  },
]);

/** Base multipliers applied to any enemy promoted to elite, before modifiers. */
export const ELITE_BASE: StatTable = {
  maxHealth: 90,
  attackPower: 3,
  armour: 6,
  staggerResist: 60,
};

/** Elites are worth substantially more, in XP and in loot. */
export const ELITE_REWARD = {
  xpMultiplier: 4.5,
  dropChanceBonus: 0.55,
  extraRolls: 2,
  rarityBonus: 1.6,
} as const;
