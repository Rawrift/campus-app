/**
 * Enemy table (§19, §20).
 *
 * Three families that belong to the same disaster rather than a random
 * bestiary: THE KEPT (villagers and levy who breathed too much pale ash),
 * BEASTS (animals that ate what was in the ground), and the HOLLOW (what is
 * left standing when a body's memory has been taken out of it).
 *
 * Each has a distinct silhouette and a distinct job in a fight, so a mixed
 * group forces different answers (§20).
 */

import { Registry } from '@/core/registry';
import type { EnemyDef } from '@/sim/enemyDef';

export const ENEMIES = new Registry<EnemyDef>('enemies', [
  // ======================= THE KEPT =======================================
  {
    id: 'kept_villager', name: 'Ash-Bitten Villager',
    family: 'kept', role: 'swarm', level: 1,
    stats: {
      maxHealth: 22, armour: 2, attackPower: 2, moveSpeed: 4.2,
      attackSpeed: 1, res_shadow: 0.1, staggerResist: 4,
    },
    radius: 0.36, height: 1.7,
    attacks: [{
      id: 'claw', name: 'Clawing', windup: 0.32, strike: 0.09, recover: 0.30, cooldown: 1.1,
      range: 1.5, damage: [3, 5], damageType: 'physical',
      shape: { kind: 'arc', radius: 1.6, halfAngle: 0.8 },
      staggerPower: 8, weight: 1,
    }],
    aggroRange: 9, leashRange: 20, preferredRange: 1.1, strafe: 0.2, alertTime: 0.25, fleeBelow: 0,
    xp: 7, dropChance: 0.11, dropRolls: 1,
    visual: { build: 'hunched', scale: 0.95, primary: 0x8a7558, secondary: 0x5c4e40, accent: 0xa8936c, cloth: 0.6, weapon: 'claws' },
    note: 'They still walk the paths between their own houses.',
  },
  {
    id: 'kept_deserter', name: 'Marcher Deserter',
    family: 'kept', role: 'melee', level: 2,
    stats: {
      maxHealth: 46, armour: 9, attackPower: 5, moveSpeed: 3.9,
      attackSpeed: 1, res_physical: 0.1, staggerResist: 16,
    },
    radius: 0.44, height: 1.85,
    attacks: [
      {
        id: 'chop', name: 'Overhand Chop', windup: 0.46, strike: 0.10, recover: 0.38, cooldown: 1.8,
        range: 2.0, damage: [6, 10], damageType: 'physical',
        shape: { kind: 'arc', radius: 2.1, halfAngle: 0.7 },
        staggerPower: 22, knockback: 1.2, weight: 2,
      },
      {
        id: 'shove', name: 'Shield Shove', windup: 0.34, strike: 0.08, recover: 0.44, cooldown: 5,
        range: 1.8, damage: [3, 5], damageType: 'physical',
        shape: { kind: 'arc', radius: 1.9, halfAngle: 0.9 },
        staggerPower: 45, knockback: 4.5, weight: 1,
      },
    ],
    aggroRange: 10, leashRange: 22, preferredRange: 1.6, strafe: 0.35, alertTime: 0.45, fleeBelow: 0,
    xp: 16, dropChance: 0.19, dropRolls: 1,
    visual: { build: 'armoured', scale: 1.02, primary: 0x726757, secondary: 0x46423a, accent: 0x968257, weapon: 'shield_sword' },
    note: 'The levy broke before the abbey did. Some of them made it this far.',
  },
  {
    id: 'kept_chandler', name: 'Glass-Chandler',
    family: 'kept', role: 'ranged', level: 3,
    stats: {
      maxHealth: 34, armour: 3, attackPower: 3, spellPower: 8, moveSpeed: 3.6,
      res_fire: 0.35, staggerResist: 6,
    },
    radius: 0.38, height: 1.75,
    attacks: [{
      id: 'hurl', name: 'Burning Glass', windup: 0.58, strike: 0.08, recover: 0.42, cooldown: 2.6,
      range: 10, damage: [5, 9], damageType: 'fire',
      shape: { kind: 'projectile', speed: 11, count: 1, spread: 0, radius: 0.34 },
      applies: { kind: 'burn', label: 'Burning', duration: 3, dps: 2.5, damageType: 'fire', colour: 0xd2762c },
      staggerPower: 6, weight: 1,
    }],
    aggroRange: 12, leashRange: 24, preferredRange: 7.5, strafe: 0.8, alertTime: 0.4, fleeBelow: 0.2,
    xp: 22, dropChance: 0.22, dropRolls: 1,
    visual: { build: 'gaunt', scale: 0.98, primary: 0x6c5a3e, secondary: 0x453a2e, accent: 0xd2762c, cloth: 0.8, weapon: 'censer', glow: 0.4 },
    note: 'They made candles here. They found something better to burn.',
  },
  {
    id: 'kept_warden', name: 'Tallow Warden',
    family: 'kept', role: 'tank', level: 4,
    stats: {
      maxHealth: 105, armour: 22, attackPower: 8, moveSpeed: 3.0,
      attackSpeed: 0.8, res_physical: 0.2, staggerResist: 55,
    },
    radius: 0.58, height: 2.1,
    attacks: [
      {
        id: 'maul', name: 'Rendering Maul', windup: 0.72, strike: 0.14, recover: 0.55, cooldown: 2.6,
        range: 2.5, damage: [11, 18], damageType: 'physical',
        shape: { kind: 'arc', radius: 2.7, halfAngle: 0.85 },
        staggerPower: 70, knockback: 4.0, weight: 2,
      },
      {
        id: 'quake', name: 'Ground Break', windup: 0.85, strike: 0.16, recover: 0.6, cooldown: 8,
        range: 3.2, damage: [9, 14], damageType: 'physical',
        shape: { kind: 'self_aoe', radius: 3.6 },
        staggerPower: 80, knockback: 5.5, weight: 1,
      },
    ],
    aggroRange: 9, leashRange: 20, preferredRange: 2.0, strafe: 0.1, alertTime: 0.6, fleeBelow: 0,
    xp: 40, dropChance: 0.32, dropRolls: 1, rarityBonus: 0.4,
    visual: { build: 'heavy', scale: 1.22, primary: 0x665c4e, secondary: 0x3c3730, accent: 0xa3854c, weapon: 'maul' },
    note: 'Kept the ovens. Kept the doors. Still keeping something.',
  },
  {
    id: 'kept_flagellant', name: 'Choir-Sworn Flagellant',
    family: 'kept', role: 'assassin', level: 5,
    stats: {
      maxHealth: 38, armour: 4, attackPower: 11, moveSpeed: 5.8,
      attackSpeed: 1.4, critChance: 0.15, res_shadow: 0.2, staggerResist: 6,
    },
    radius: 0.36, height: 1.8,
    attacks: [
      {
        id: 'rend', name: 'Flensing Rush', windup: 0.24, strike: 0.08, recover: 0.24, cooldown: 1.0,
        range: 1.7, damage: [7, 11], damageType: 'physical',
        shape: { kind: 'arc', radius: 1.8, halfAngle: 0.75 },
        applies: { kind: 'bleed', label: 'Bleeding', duration: 4, dps: 2.5, damageType: 'physical', colour: 0x7d1c16 },
        staggerPower: 10, weight: 2,
      },
      {
        id: 'lunge', name: 'Sworn Lunge', windup: 0.40, strike: 0.16, recover: 0.35, cooldown: 6,
        range: 6.5, damage: [9, 14], damageType: 'physical',
        shape: { kind: 'leap', distance: 6.0, radius: 1.6 },
        staggerPower: 25, weight: 1,
      },
    ],
    aggroRange: 13, leashRange: 26, preferredRange: 1.3, strafe: 0.7, alertTime: 0.2, fleeBelow: 0,
    xp: 52, dropChance: 0.3, dropRolls: 1, rarityBonus: 0.3,
    visual: { build: 'gaunt', scale: 1.0, primary: 0x7a2e26, secondary: 0x3a2420, accent: 0xb5432a, cloth: 0.9, weapon: 'cleaver' },
    note: 'Nine cuts for nine bells. They have made rather more than nine.',
  },

  // ======================= BEASTS =========================================
  {
    id: 'beast_hound', name: 'Rot-Maddened Hound',
    family: 'beast', role: 'swarm', level: 2,
    stats: {
      maxHealth: 26, armour: 3, attackPower: 4, moveSpeed: 6.4,
      attackSpeed: 1.3, res_poison: 0.3, staggerResist: 5,
    },
    radius: 0.42, height: 0.95,
    attacks: [{
      id: 'bite', name: 'Bite', windup: 0.26, strike: 0.08, recover: 0.26, cooldown: 1.2,
      range: 1.6, damage: [4, 7], damageType: 'physical',
      shape: { kind: 'arc', radius: 1.7, halfAngle: 0.7 },
      applies: { kind: 'poison', label: 'Sickened', duration: 5, dps: 1.5, damageType: 'poison', colour: 0x6f8a3a },
      staggerPower: 9, weight: 1,
    }],
    aggroRange: 13, leashRange: 26, preferredRange: 1.2, strafe: 0.9, alertTime: 0.15, fleeBelow: 0,
    xp: 13, dropChance: 0.08, dropRolls: 1,
    visual: { build: 'quadruped', scale: 1.0, primary: 0x55413a, secondary: 0x332824, accent: 0x8a4e3a, weapon: 'claws' },
    note: 'They dug where they should not have.',
  },
  {
    id: 'beast_sow', name: 'Charnel Sow',
    family: 'beast', role: 'tank', level: 4,
    stats: {
      maxHealth: 88, armour: 14, attackPower: 9, moveSpeed: 3.4,
      attackSpeed: 0.9, res_poison: 0.4, res_physical: 0.1, staggerResist: 40,
    },
    radius: 0.62, height: 1.15,
    attacks: [
      {
        id: 'gore', name: 'Gore', windup: 0.44, strike: 0.10, recover: 0.40, cooldown: 1.8,
        range: 2.0, damage: [9, 15], damageType: 'physical',
        shape: { kind: 'arc', radius: 2.1, halfAngle: 0.7 },
        staggerPower: 40, knockback: 3.0, weight: 2,
      },
      {
        id: 'barrel', name: 'Barrelling Charge', windup: 0.70, strike: 0.30, recover: 0.55, cooldown: 9,
        range: 9, damage: [12, 19], damageType: 'physical',
        shape: { kind: 'leap', distance: 8.5, radius: 1.5 },
        staggerPower: 75, knockback: 6.5, weight: 1,
      },
    ],
    aggroRange: 10, leashRange: 22, preferredRange: 1.8, strafe: 0.05, alertTime: 0.5, fleeBelow: 0,
    xp: 38, dropChance: 0.2, dropRolls: 1,
    visual: { build: 'quadruped', scale: 1.45, primary: 0x624a40, secondary: 0x3a2e28, accent: 0x92503c, weapon: 'claws' },
  },

  // ======================= THE HOLLOW =====================================
  {
    id: 'hollow_walker', name: 'Hollowed',
    family: 'hollow', role: 'melee', level: 3,
    stats: {
      maxHealth: 58, armour: 7, attackPower: 6, moveSpeed: 2.9,
      attackSpeed: 0.85, res_shadow: 0.45, res_physical: 0.15, res_fire: -0.25,
      staggerResist: 30,
    },
    radius: 0.44, height: 1.9,
    attacks: [{
      id: 'grasp', name: 'Grasping Reach', windup: 0.52, strike: 0.12, recover: 0.40, cooldown: 1.9,
      range: 2.1, damage: [7, 12], damageType: 'shadow',
      shape: { kind: 'arc', radius: 2.2, halfAngle: 0.9 },
      applies: { kind: 'weaken', label: 'Grasped', duration: 3, mods: [{ stat: 'moveSpeed', pct: -0.3 }], colour: 0x6a5a7d },
      staggerPower: 25, weight: 1,
    }],
    aggroRange: 8, leashRange: 30, preferredRange: 1.6, strafe: 0.1, alertTime: 0.7, fleeBelow: 0,
    xp: 26, dropChance: 0.17, dropRolls: 1,
    visual: { build: 'tall', scale: 1.08, primary: 0x5c5a72, secondary: 0x32303f, accent: 0x8479a0, cloth: 0.7, glow: 0.25 },
    note: 'The body kept the habit of standing. Nothing else stayed.',
  },
  {
    id: 'hollow_wisp', name: 'Ash Wisp',
    family: 'hollow', role: 'ranged', level: 4,
    stats: {
      maxHealth: 30, armour: 0, spellPower: 12, moveSpeed: 4.6,
      res_physical: 0.4, res_shadow: 0.5, res_fire: -0.3, staggerResist: 2,
    },
    radius: 0.34, height: 1.5,
    attacks: [{
      id: 'mote', name: 'Cinder Mote', windup: 0.50, strike: 0.08, recover: 0.36, cooldown: 2.2,
      range: 11, damage: [6, 10], damageType: 'fire',
      shape: { kind: 'projectile', speed: 9, count: 2, spread: 0.18, radius: 0.3 },
      staggerPower: 4, weight: 1,
    }],
    aggroRange: 13, leashRange: 28, preferredRange: 8.5, strafe: 1.0, alertTime: 0.3, fleeBelow: 0.25,
    xp: 34, dropChance: 0.24, dropRolls: 1,
    visual: { build: 'wisp', scale: 0.9, primary: 0xa85c22, secondary: 0x5a3628, accent: 0xd89a52, glow: 1.0 },
  },
  {
    id: 'hollow_gleaner', name: 'Bone-Gleaner',
    family: 'hollow', role: 'summoner', level: 5,
    stats: {
      maxHealth: 64, armour: 6, spellPower: 10, moveSpeed: 3.2,
      res_shadow: 0.5, res_fire: -0.2, staggerResist: 18,
    },
    radius: 0.42, height: 1.95,
    attacks: [
      {
        id: 'raise', name: 'Glean', windup: 0.9, strike: 0.1, recover: 0.7, cooldown: 12,
        range: 12, damage: [0, 0], damageType: 'shadow',
        shape: { kind: 'ground', radius: 1.0, delay: 0.1 },
        weight: 3,
      },
      {
        id: 'lash', name: 'Wire Lash', windup: 0.46, strike: 0.1, recover: 0.34, cooldown: 2.4,
        range: 7, damage: [6, 10], damageType: 'shadow',
        shape: { kind: 'projectile', speed: 13, count: 1, spread: 0, radius: 0.3 },
        staggerPower: 10, weight: 1,
      },
    ],
    aggroRange: 12, leashRange: 26, preferredRange: 7, strafe: 0.5, alertTime: 0.5, fleeBelow: 0.3,
    xp: 58, dropChance: 0.34, dropRolls: 1, rarityBonus: 0.5,
    visual: { build: 'tall', scale: 1.05, primary: 0x635a78, secondary: 0x36313f, accent: 0x9d8f68, cloth: 0.85, weapon: 'staff', glow: 0.4 },
    note: 'It is sorting them. It seems to be looking for a particular one.',
  },

  // ======================= SUMMONS ========================================
  {
    id: 'sum_kindling', name: 'Hollow Kindling',
    family: 'hollow', role: 'melee', level: 1,
    stats: {
      maxHealth: 30, armour: 2, attackPower: 6, moveSpeed: 5.0,
      attackSpeed: 1.2, res_fire: 0.8, staggerResist: 100,
    },
    radius: 0.34, height: 1.6,
    attacks: [{
      id: 'burn_touch', name: 'Burning Touch', windup: 0.28, strike: 0.08, recover: 0.26, cooldown: 1.3,
      range: 1.6, damage: [5, 8], damageType: 'fire',
      shape: { kind: 'arc', radius: 1.7, halfAngle: 0.8 },
      applies: { kind: 'burn', label: 'Burning', duration: 3, dps: 2, damageType: 'fire', colour: 0xd2762c },
      staggerPower: 8, weight: 1,
    }],
    aggroRange: 14, leashRange: 40, preferredRange: 1.2, strafe: 0.4, alertTime: 0.05, fleeBelow: 0,
    xp: 0, dropChance: 0, dropRolls: 0,
    visual: { build: 'wisp', scale: 0.85, primary: 0xa86c28, secondary: 0x5a3e28, accent: 0xd8a459, glow: 0.9 },
  },

  // ======================= BOSS ===========================================
  {
    id: 'boss_ausric', name: 'Ausric, the Ninth Bell',
    family: 'abbey', role: 'elite', level: 10, isBoss: true,
    phaseThresholds: [0.66, 0.33],
    stats: {
      maxHealth: 900, armour: 26, attackPower: 16, spellPower: 20, moveSpeed: 3.4,
      attackSpeed: 0.9, res_physical: 0.15, res_shadow: 0.5, res_fire: 0.2,
      staggerResist: 400, critChance: 0.1,
    },
    radius: 0.85, height: 2.6,
    attacks: [
      // --- Phase 1: teach the two reads (a sweep and a slam) --------------
      {
        id: 'sweep', name: 'Bell-Sweep', windup: 0.78, strike: 0.16, recover: 0.52, cooldown: 3.2,
        range: 3.6, damage: [14, 22], damageType: 'physical',
        shape: { kind: 'arc', radius: 4.0, halfAngle: 1.3 },
        staggerPower: 80, knockback: 4.5, weight: 3,
      },
      {
        id: 'toll', name: 'The Toll', windup: 1.05, strike: 0.18, recover: 0.70, cooldown: 7,
        range: 4.4, damage: [18, 28], damageType: 'physical',
        shape: { kind: 'self_aoe', radius: 4.8 },
        staggerPower: 120, knockback: 7.0, weight: 2,
      },
      // --- Phase 2 onward: adds reach and ground denial -------------------
      {
        id: 'peal', name: 'Sundering Peal', windup: 1.15, strike: 0.2, recover: 0.6, cooldown: 9,
        range: 12, damage: [16, 24], damageType: 'shadow',
        shape: { kind: 'ground', radius: 3.2, delay: 0.9, lingerDuration: 4, lingerDps: 9 },
        applies: { kind: 'shadowrot', label: 'Unremembered', duration: 5, dps: 2, damageType: 'shadow', colour: 0x6a5a7d },
        weight: 3, belowHealth: 0.67,
      },
      {
        id: 'stride', name: 'Warden\'s Stride', windup: 0.62, strike: 0.34, recover: 0.5, cooldown: 8,
        range: 11, damage: [14, 20], damageType: 'physical',
        shape: { kind: 'leap', distance: 9.5, radius: 2.4 },
        staggerPower: 90, knockback: 5.0, weight: 2, belowHealth: 0.67,
      },
      // --- Phase 3: the pressure phase ------------------------------------
      {
        id: 'choir', name: 'The Latter Choir', windup: 1.35, strike: 0.25, recover: 0.75, cooldown: 13,
        range: 14, damage: [12, 18], damageType: 'shadow',
        shape: { kind: 'projectile', speed: 8, count: 9, spread: 1.5, radius: 0.4 },
        applies: { kind: 'shadowrot', label: 'Unremembered', duration: 5, dps: 3, damageType: 'shadow', colour: 0x6a5a7d },
        weight: 4, belowHealth: 0.34,
      },
      {
        id: 'ninth', name: 'Ring the Ninth', windup: 1.6, strike: 0.3, recover: 0.9, cooldown: 18,
        range: 6, damage: [26, 38], damageType: 'shadow',
        shape: { kind: 'self_aoe', radius: 7.0 },
        staggerPower: 200, knockback: 9.0, weight: 3, belowHealth: 0.34,
      },
    ],
    aggroRange: 16, leashRange: 999, preferredRange: 2.6, strafe: 0.25, alertTime: 0.8, fleeBelow: 0,
    xp: 900, dropChance: 1, dropRolls: 5, rarityBonus: 5,
    visual: { build: 'armoured', scale: 1.55, primary: 0x3e3a44, secondary: 0x211f26, accent: 0xa3853a, weapon: 'bell', glow: 0.5 },
    note: 'He rang the hours for forty years. Then he rang one that was not an hour.',
  },
]);

/** Every enemy that may be rolled by a normal spawner. */
export const SPAWNABLE = ENEMIES.filter((e) => !e.isBoss && e.id !== 'sum_kindling');
