/**
 * The three playable archetypes (§10).
 *
 * None maps onto a Diablo class: the Ironbound is an oath-bound line-holder
 * rather than a rage berserker, the Pallwalker is a corpse-reader whose poison
 * comes from their trade, and the Ashen is a memory-addict whose power is a
 * chemical dependency, not a scholarly discipline.
 */

import { Registry } from '@/core/registry';
import type { StatTable } from '@/sim/stats';
import type { ArchetypeId } from '@/sim/ability';

export interface ResourceDef {
  readonly name: string;
  /** Flat regeneration per second. */
  readonly regen: number;
  /** Resource gained per landed hit — the Ironbound's whole economy. */
  readonly gainOnHit: number;
  /** Resource gained per point of damage absorbed. */
  readonly gainOnDamageTaken: number;
  /** Decays towards 0 out of combat at this rate. */
  readonly decay: number;
  readonly colour: number;
}

/** Body proportions fed to the procedural character builder (§3). */
export interface BodySpec {
  /** Overall scale; 1.0 is roughly 1.8 m. */
  readonly scale: number;
  readonly shoulderWidth: number;
  readonly torsoDepth: number;
  readonly limbThickness: number;
  /** Skin/undertone base colour. */
  readonly skin: number;
  readonly hair: number;
  readonly clothPrimary: number;
  readonly clothSecondary: number;
}

export interface ArchetypeDef {
  readonly id: ArchetypeId;
  readonly name: string;
  readonly title: string;
  readonly blurb: string;
  readonly baseStats: StatTable;
  /** Added to base stats every level (§46 stat growth). */
  readonly perLevel: StatTable;
  readonly resource: ResourceDef;
  readonly body: BodySpec;
  /** Base ids granted at character creation. */
  readonly startingGear: readonly string[];
  /** Skills known at level 1 and bound to the action bar by default. */
  readonly startingSkills: readonly string[];
}

export const ARCHETYPES = new Registry<ArchetypeDef>('archetypes', [
  {
    id: 'ironbound',
    name: 'Ironbound',
    title: 'of the Sealed Oath',
    blurb:
      'The Marcher levy swore on iron so that nothing could read them after death. '
      + 'The order is gone; the oath is not, and neither are you.',
    baseStats: {
      maxHealth: 60, healthRegen: 0.6,
      maxResource: 60, resourceRegen: 0,
      armour: 6, attackPower: 6, spellPower: 0,
      attackSpeed: 1.0, moveSpeed: 4.4,
      critChance: 0.05, critDamage: 1.5,
      staggerResist: 20, staggerPower: 10,
      might: 12, finesse: 7, resolve: 11, insight: 5,
    },
    perLevel: {
      maxHealth: 12, armour: 1.4, attackPower: 2.2,
      might: 2.2, resolve: 2.0, finesse: 0.8, insight: 0.5,
    },
    resource: {
      name: 'Grit', regen: -1.2, gainOnHit: 4, gainOnDamageTaken: 0.35,
      decay: 1.2, colour: 0xc27a35,
    },
    body: {
      scale: 1.04, shoulderWidth: 1.18, torsoDepth: 1.1, limbThickness: 1.12,
      skin: 0x9c7c62, hair: 0x2e2620, clothPrimary: 0x4a4239, clothSecondary: 0x6b4a30,
    },
    startingGear: ['wpn_sword_0', 'shd_0', 'arm_chest_leather', 'arm_feet_leather'],
    startingSkills: ['iron_sweep'],
  },
  {
    id: 'pallwalker',
    name: 'Pallwalker',
    title: 'of the Unburied Roads',
    blurb:
      'Somebody has to walk out to where the dead fell and find out who they were. '
      + 'The trade teaches you poisons, quiet feet, and how a body comes apart.',
    baseStats: {
      maxHealth: 46, healthRegen: 0.5,
      maxResource: 80, resourceRegen: 6,
      armour: 3, attackPower: 5, spellPower: 2,
      attackSpeed: 1.15, moveSpeed: 4.9,
      critChance: 0.10, critDamage: 1.6,
      staggerResist: 8, staggerPower: 4,
      might: 7, finesse: 13, resolve: 7, insight: 8,
    },
    perLevel: {
      maxHealth: 8, armour: 0.8, attackPower: 1.8,
      finesse: 2.4, might: 1.0, resolve: 1.0, insight: 1.1,
    },
    resource: {
      name: 'Breath', regen: 6, gainOnHit: 0.5, gainOnDamageTaken: 0,
      decay: 0, colour: 0x8fae7c,
    },
    body: {
      scale: 0.99, shoulderWidth: 1.0, torsoDepth: 0.95, limbThickness: 0.95,
      skin: 0x8d6f57, hair: 0x1f1a16, clothPrimary: 0x3a4038, clothSecondary: 0x5a4a36,
    },
    startingGear: ['wpn_dagger_0', 'arm_chest_leather', 'arm_hands_leather', 'arm_feet_leather'],
    startingSkills: ['pall_flurry', 'pall_dart'],
  },
  {
    id: 'ashen',
    name: 'Ashen',
    title: 'of the Burnt Glass',
    blurb:
      'Burn grave-glass, breathe what comes off it, and for a while you know things '
      + 'you have no right to know. It is not free. Look at your hands.',
    baseStats: {
      maxHealth: 40, healthRegen: 0.4,
      maxResource: 70, resourceRegen: 3.2,
      armour: 2, attackPower: 3, spellPower: 8,
      attackSpeed: 1.0, moveSpeed: 4.3,
      critChance: 0.05, critDamage: 1.55,
      staggerResist: 5, staggerPower: 2,
      might: 5, finesse: 8, resolve: 6, insight: 14,
    },
    perLevel: {
      maxHealth: 7, armour: 0.5, spellPower: 3.0,
      insight: 2.6, finesse: 1.1, resolve: 0.9, might: 0.6,
    },
    resource: {
      name: 'Ember', regen: 3.2, gainOnHit: 0, gainOnDamageTaken: 0,
      decay: 0, colour: 0xd2762c,
    },
    body: {
      scale: 0.97, shoulderWidth: 0.94, torsoDepth: 0.92, limbThickness: 0.9,
      skin: 0xa08872, hair: 0x4a4038, clothPrimary: 0x453c3a, clothSecondary: 0x6a3f2c,
    },
    startingGear: ['wpn_stave_0', 'arm_chest_cloth', 'arm_legs_cloth', 'arm_feet_leather'],
    startingSkills: ['ash_bolt'],
  },
]);
