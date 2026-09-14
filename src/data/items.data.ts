/**
 * Base item table (§12).
 *
 * Names come from the Tallow Marches: a farming and candle-making region that
 * buried its dead under an abbey. Most tier-0 gear is repurposed farm and
 * tannery equipment, tier-1 is soldiers' kit from the Marcher levy, and tier-2
 * is abbey property — ceremonial, old, and not meant to be carried out.
 */

import { Registry } from '@/core/registry';
import type { ItemBase } from '@/sim/items';

export const ITEM_BASES = new Registry<ItemBase>('itemBases', [
  // ======================= WEAPONS: SWORD =================================
  {
    id: 'wpn_sword_0', name: 'Tithe-Cutter', slot: 'mainHand', category: 'sword',
    grid: [1, 3], minItemLevel: 1, weight: 100, baseValue: 12,
    damage: { min: 4, max: 7, type: 'physical' }, speed: 1.0, reach: 1.9,
    requirements: { level: 1 },
    visual: { module: 'mainHand', tier: 0, material: 'iron', length: 0.42, bulk: 0.3 },
    flavour: 'Bent from cutting things that were not grain.',
  },
  {
    id: 'wpn_sword_1', name: "Marcher's Arming Sword", slot: 'mainHand', category: 'sword',
    grid: [1, 3], minItemLevel: 4, weight: 80, baseValue: 48,
    damage: { min: 8, max: 14, type: 'physical' }, speed: 1.05, reach: 2.0,
    requirements: { level: 4, might: 12 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 0.5, bulk: 0.35 },
  },
  {
    id: 'wpn_sword_2', name: 'Choirsteel Longsword', slot: 'mainHand', category: 'sword',
    grid: [1, 4], minItemLevel: 8, weight: 40, baseValue: 160, twoHanded: false,
    damage: { min: 14, max: 23, type: 'physical' }, speed: 0.95, reach: 2.2,
    requirements: { level: 8, might: 20 },
    visual: { module: 'mainHand', tier: 2, material: 'darksteel', length: 0.62, bulk: 0.4, accent: 0.7 },
    flavour: 'It hums a half-tone flat. Nobody knows why.',
  },

  // ======================= WEAPONS: AXE ===================================
  {
    id: 'wpn_axe_0', name: 'Splitting Axe', slot: 'mainHand', category: 'axe',
    grid: [2, 3], minItemLevel: 1, weight: 100, baseValue: 14,
    damage: { min: 5, max: 10, type: 'physical' }, speed: 0.85, reach: 1.8,
    requirements: { level: 1, might: 10 },
    visual: { module: 'mainHand', tier: 0, material: 'iron', length: 0.38, bulk: 0.6 },
    flavour: 'Firewood, mostly.',
  },
  {
    id: 'wpn_axe_1', name: 'Bearded Waraxe', slot: 'mainHand', category: 'axe',
    grid: [2, 3], minItemLevel: 5, weight: 70, baseValue: 58,
    damage: { min: 11, max: 19, type: 'physical' }, speed: 0.8, reach: 1.9,
    requirements: { level: 5, might: 16 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 0.44, bulk: 0.75, spikes: 0.3 },
  },

  // ======================= WEAPONS: MACE ==================================
  {
    id: 'wpn_mace_0', name: 'Tallow Mallet', slot: 'mainHand', category: 'mace',
    grid: [2, 3], minItemLevel: 1, weight: 90, baseValue: 11,
    damage: { min: 5, max: 9, type: 'physical' }, speed: 0.8, reach: 1.8,
    requirements: { level: 1, might: 10 },
    visual: { module: 'mainHand', tier: 0, material: 'wood', length: 0.4, bulk: 0.7 },
  },
  {
    id: 'wpn_mace_1', name: 'Flanged Mace', slot: 'mainHand', category: 'mace',
    grid: [2, 3], minItemLevel: 5, weight: 70, baseValue: 60,
    damage: { min: 12, max: 18, type: 'physical' }, speed: 0.78, reach: 1.85,
    requirements: { level: 5, might: 17 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 0.42, bulk: 0.8, spikes: 0.5 },
  },
  {
    id: 'wpn_mace_2', name: 'Bell-Hammer of the Ninth', slot: 'mainHand', category: 'mace',
    grid: [2, 4], minItemLevel: 9, weight: 30, baseValue: 210, twoHanded: true,
    damage: { min: 20, max: 34, type: 'physical' }, speed: 0.62, reach: 2.1,
    requirements: { level: 9, might: 26 },
    baseStats: { staggerPower: 25 },
    visual: { module: 'mainHand', tier: 2, material: 'darksteel', length: 0.66, bulk: 1.0, accent: 0.8 },
    flavour: 'Used to ring the hours. Then used to stop them.',
  },

  // ======================= WEAPONS: DAGGER ================================
  {
    id: 'wpn_dagger_0', name: 'Flensing Knife', slot: 'mainHand', category: 'dagger',
    grid: [1, 2], minItemLevel: 1, weight: 100, baseValue: 10,
    damage: { min: 3, max: 5, type: 'physical' }, speed: 1.45, reach: 1.5,
    requirements: { level: 1 },
    baseStats: { critChance: 0.03 },
    visual: { module: 'mainHand', tier: 0, material: 'iron', length: 0.24, bulk: 0.2 },
  },
  {
    id: 'wpn_dagger_1', name: 'Ossuary Stiletto', slot: 'mainHand', category: 'dagger',
    grid: [1, 2], minItemLevel: 5, weight: 70, baseValue: 52,
    damage: { min: 6, max: 10, type: 'physical' }, speed: 1.5, reach: 1.55,
    requirements: { level: 5, finesse: 16 },
    baseStats: { critChance: 0.05, finesse: 2 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 0.28, bulk: 0.18 },
  },

  // ======================= WEAPONS: POLEARM ===============================
  {
    id: 'wpn_polearm_0', name: 'Harvest Bill', slot: 'mainHand', category: 'polearm',
    grid: [2, 4], minItemLevel: 2, weight: 80, baseValue: 22, twoHanded: true,
    damage: { min: 7, max: 12, type: 'physical' }, speed: 0.8, reach: 2.6,
    requirements: { level: 2, might: 12 },
    baseStats: { areaSize: 0.1 },
    visual: { module: 'mainHand', tier: 0, material: 'wood', length: 0.9, bulk: 0.35 },
  },
  {
    id: 'wpn_polearm_1', name: 'Abbey Glaive', slot: 'mainHand', category: 'polearm',
    grid: [2, 4], minItemLevel: 6, weight: 55, baseValue: 92, twoHanded: true,
    damage: { min: 14, max: 22, type: 'physical' }, speed: 0.75, reach: 2.8,
    requirements: { level: 6, might: 19 },
    baseStats: { areaSize: 0.15 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 1.0, bulk: 0.4, accent: 0.4 },
  },

  // ======================= WEAPONS: CROSSBOW ==============================
  {
    id: 'wpn_crossbow_0', name: 'Rook Crossbow', slot: 'mainHand', category: 'crossbow',
    grid: [2, 3], minItemLevel: 2, weight: 80, baseValue: 26, twoHanded: true,
    damage: { min: 6, max: 11, type: 'physical' }, speed: 0.75, reach: 12,
    requirements: { level: 2, finesse: 12 },
    visual: { module: 'mainHand', tier: 0, material: 'wood', length: 0.5, bulk: 0.45 },
    flavour: 'For crows on the seed rows.',
  },
  {
    id: 'wpn_crossbow_1', name: 'Windlass Crossbow', slot: 'mainHand', category: 'crossbow',
    grid: [2, 3], minItemLevel: 6, weight: 55, baseValue: 98, twoHanded: true,
    damage: { min: 13, max: 21, type: 'physical' }, speed: 0.68, reach: 14,
    requirements: { level: 6, finesse: 18 },
    baseStats: { critChance: 0.04 },
    visual: { module: 'mainHand', tier: 1, material: 'steel', length: 0.55, bulk: 0.5 },
  },

  // ======================= WEAPONS: STAVE =================================
  {
    id: 'wpn_stave_0', name: 'Censer-Rod', slot: 'mainHand', category: 'stave',
    grid: [1, 4], minItemLevel: 1, weight: 100, baseValue: 14, twoHanded: true,
    damage: { min: 3, max: 6, type: 'fire' }, speed: 1.0, reach: 9,
    requirements: { level: 1 },
    baseStats: { spellPower: 5, maxResource: 8 },
    visual: { module: 'mainHand', tier: 0, material: 'wood', length: 0.95, bulk: 0.2 },
  },
  {
    id: 'wpn_stave_1', name: 'Reliquary Stave', slot: 'mainHand', category: 'stave',
    grid: [1, 4], minItemLevel: 5, weight: 70, baseValue: 66, twoHanded: true,
    damage: { min: 7, max: 12, type: 'fire' }, speed: 1.0, reach: 10,
    requirements: { level: 5, insight: 16 },
    baseStats: { spellPower: 12, maxResource: 16, insight: 2 },
    visual: { module: 'mainHand', tier: 1, material: 'bone', length: 1.0, bulk: 0.25, accent: 0.5 },
  },
  {
    id: 'wpn_stave_2', name: 'Stave of the Latter Choir', slot: 'mainHand', category: 'stave',
    grid: [1, 4], minItemLevel: 9, weight: 30, baseValue: 220, twoHanded: true,
    damage: { min: 12, max: 20, type: 'shadow' }, speed: 1.0, reach: 11,
    requirements: { level: 9, insight: 24 },
    baseStats: { spellPower: 24, maxResource: 28, insight: 4 },
    visual: { module: 'mainHand', tier: 2, material: 'bone', length: 1.05, bulk: 0.3, accent: 0.9 },
    flavour: 'The grain of the wood runs the wrong way, towards the hand.',
  },

  // ======================= OFF-HAND: SHIELDS ==============================
  {
    id: 'shd_0', name: 'Plank Buckler', slot: 'offHand', category: 'shield',
    grid: [2, 2], minItemLevel: 1, weight: 100, baseValue: 12,
    blockChance: 0.14, requirements: { level: 1 },
    baseStats: { armour: 6, maxHealth: 5 },
    visual: { module: 'offHand', tier: 0, material: 'wood', bulk: 0.4 },
  },
  {
    id: 'shd_1', name: "Marcher's Kite", slot: 'offHand', category: 'shield',
    grid: [2, 3], minItemLevel: 5, weight: 70, baseValue: 62,
    blockChance: 0.22, requirements: { level: 5, might: 15 },
    baseStats: { armour: 16, maxHealth: 14, resolve: 2 },
    visual: { module: 'offHand', tier: 1, material: 'steel', bulk: 0.65 },
  },
  {
    id: 'shd_2', name: 'Bellbrass Aegis', slot: 'offHand', category: 'shield',
    grid: [2, 3], minItemLevel: 9, weight: 30, baseValue: 200,
    blockChance: 0.3, requirements: { level: 9, might: 22 },
    baseStats: { armour: 30, maxHealth: 30, resolve: 4, staggerResist: 20 },
    visual: { module: 'offHand', tier: 2, material: 'darksteel', bulk: 0.8, accent: 0.7 },
  },

  // ======================= ARMOUR: CHEST ==================================
  {
    id: 'arm_chest_cloth', name: 'Tallow-Stained Robe', slot: 'chest', category: 'cloth',
    grid: [2, 3], minItemLevel: 1, weight: 100, baseValue: 10,
    baseStats: { armour: 3, maxResource: 10, insight: 1 },
    visual: { module: 'torsoArmour', tier: 0, material: 'cloth', bulk: 0.25 },
  },
  {
    id: 'arm_chest_leather', name: 'Boiled Cuirass', slot: 'chest', category: 'leather',
    grid: [2, 3], minItemLevel: 2, weight: 100, baseValue: 20,
    baseStats: { armour: 9, finesse: 1 }, requirements: { level: 2 },
    visual: { module: 'torsoArmour', tier: 0, material: 'leather', bulk: 0.45 },
  },
  {
    id: 'arm_chest_mail', name: 'Riveted Hauberk', slot: 'chest', category: 'mail',
    grid: [2, 3], minItemLevel: 5, weight: 80, baseValue: 66,
    baseStats: { armour: 20, maxHealth: 12 }, requirements: { level: 5, might: 14 },
    visual: { module: 'torsoArmour', tier: 1, material: 'iron', bulk: 0.62 },
  },
  {
    id: 'arm_chest_plate', name: 'Marcher Breastplate', slot: 'chest', category: 'plate',
    grid: [2, 3], minItemLevel: 8, weight: 50, baseValue: 150,
    baseStats: { armour: 34, maxHealth: 26, resolve: 3, moveSpeed: -0.15 },
    requirements: { level: 8, might: 22 },
    visual: { module: 'torsoArmour', tier: 2, material: 'darksteel', bulk: 0.85, accent: 0.6 },
    flavour: 'Stamped with a bell and nine notches.',
  },

  // ======================= ARMOUR: HEAD ===================================
  {
    id: 'arm_head_cloth', name: 'Waxed Hood', slot: 'head', category: 'cloth',
    grid: [2, 2], minItemLevel: 1, weight: 100, baseValue: 6,
    baseStats: { armour: 2, insight: 1 },
    visual: { module: 'helmet', tier: 0, material: 'cloth', bulk: 0.2 },
  },
  {
    id: 'arm_head_leather', name: 'Tanner\'s Cap', slot: 'head', category: 'leather',
    grid: [2, 2], minItemLevel: 2, weight: 100, baseValue: 14,
    baseStats: { armour: 5, finesse: 1 },
    visual: { module: 'helmet', tier: 0, material: 'leather', bulk: 0.35 },
  },
  {
    id: 'arm_head_mail', name: 'Mail Coif', slot: 'head', category: 'mail',
    grid: [2, 2], minItemLevel: 5, weight: 80, baseValue: 44,
    baseStats: { armour: 12, maxHealth: 8 }, requirements: { level: 5 },
    visual: { module: 'helmet', tier: 1, material: 'iron', bulk: 0.5 },
  },
  {
    id: 'arm_head_plate', name: 'Marcher Helm', slot: 'head', category: 'plate',
    grid: [2, 2], minItemLevel: 8, weight: 50, baseValue: 110,
    baseStats: { armour: 20, maxHealth: 16, resolve: 2 }, requirements: { level: 8, might: 18 },
    visual: { module: 'helmet', tier: 2, material: 'darksteel', bulk: 0.7, accent: 0.5 },
  },

  // ======================= ARMOUR: SHOULDERS ==============================
  {
    id: 'arm_shoulders_leather', name: 'Strapped Pauldrons', slot: 'shoulders', category: 'leather',
    grid: [2, 2], minItemLevel: 2, weight: 100, baseValue: 16,
    baseStats: { armour: 5 },
    visual: { module: 'shoulders', tier: 0, material: 'leather', bulk: 0.45 },
  },
  {
    id: 'arm_shoulders_mail', name: 'Mail Spaulders', slot: 'shoulders', category: 'mail',
    grid: [2, 2], minItemLevel: 5, weight: 80, baseValue: 48,
    baseStats: { armour: 13, maxHealth: 6 }, requirements: { level: 5 },
    visual: { module: 'shoulders', tier: 1, material: 'iron', bulk: 0.65 },
  },
  {
    id: 'arm_shoulders_plate', name: 'Gravebrace Pauldrons', slot: 'shoulders', category: 'plate',
    grid: [2, 2], minItemLevel: 8, weight: 50, baseValue: 120,
    baseStats: { armour: 22, maxHealth: 14, staggerResist: 10 }, requirements: { level: 8, might: 20 },
    visual: { module: 'shoulders', tier: 2, material: 'darksteel', bulk: 0.9, spikes: 0.5, accent: 0.6 },
  },

  // ======================= ARMOUR: HANDS / BELT / LEGS / FEET =============
  {
    id: 'arm_hands_leather', name: "Tanner's Gloves", slot: 'hands', category: 'leather',
    grid: [2, 1], minItemLevel: 1, weight: 100, baseValue: 8,
    baseStats: { armour: 3, finesse: 1 },
    visual: { module: 'gloves', tier: 0, material: 'leather', bulk: 0.3 },
  },
  {
    id: 'arm_hands_mail', name: 'Mail Mitts', slot: 'hands', category: 'mail',
    grid: [2, 1], minItemLevel: 5, weight: 80, baseValue: 36,
    baseStats: { armour: 9, attackPower: 3 }, requirements: { level: 5 },
    visual: { module: 'gloves', tier: 1, material: 'iron', bulk: 0.45 },
  },
  {
    id: 'arm_hands_plate', name: 'Marcher Gauntlets', slot: 'hands', category: 'plate',
    grid: [2, 1], minItemLevel: 8, weight: 50, baseValue: 96,
    baseStats: { armour: 16, attackPower: 6, might: 2 }, requirements: { level: 8, might: 18 },
    visual: { module: 'gloves', tier: 2, material: 'darksteel', bulk: 0.6, accent: 0.5 },
  },
  {
    id: 'arm_belt_leather', name: 'Tool Belt', slot: 'belt', category: 'leather',
    grid: [2, 1], minItemLevel: 1, weight: 100, baseValue: 7,
    baseStats: { armour: 2, maxHealth: 4 },
    visual: { module: 'belt', tier: 0, material: 'leather', bulk: 0.3 },
  },
  {
    id: 'arm_belt_plate', name: 'Plated Warbelt', slot: 'belt', category: 'plate',
    grid: [2, 1], minItemLevel: 6, weight: 70, baseValue: 70,
    baseStats: { armour: 12, maxHealth: 14, resolve: 2 }, requirements: { level: 6 },
    visual: { module: 'belt', tier: 1, material: 'iron', bulk: 0.5, accent: 0.4 },
  },
  {
    id: 'arm_legs_cloth', name: 'Ash-Dusted Trousers', slot: 'legs', category: 'cloth',
    grid: [2, 2], minItemLevel: 1, weight: 100, baseValue: 8,
    baseStats: { armour: 2, maxResource: 6 },
    visual: { module: 'legs', tier: 0, material: 'cloth', bulk: 0.25 },
  },
  {
    id: 'arm_legs_leather', name: 'Leather Chausses', slot: 'legs', category: 'leather',
    grid: [2, 2], minItemLevel: 3, weight: 100, baseValue: 22,
    baseStats: { armour: 7, finesse: 1 },
    visual: { module: 'legs', tier: 0, material: 'leather', bulk: 0.4 },
  },
  {
    id: 'arm_legs_mail', name: 'Mail Leggings', slot: 'legs', category: 'mail',
    grid: [2, 2], minItemLevel: 6, weight: 75, baseValue: 58,
    baseStats: { armour: 16, maxHealth: 10 }, requirements: { level: 6 },
    visual: { module: 'legs', tier: 1, material: 'iron', bulk: 0.55 },
  },
  {
    id: 'arm_feet_leather', name: 'Field Boots', slot: 'feet', category: 'leather',
    grid: [2, 2], minItemLevel: 1, weight: 100, baseValue: 9,
    baseStats: { armour: 3, moveSpeed: 0.05 },
    visual: { module: 'boots', tier: 0, material: 'leather', bulk: 0.35 },
  },
  {
    id: 'arm_feet_plate', name: 'Marcher Sabatons', slot: 'feet', category: 'plate',
    grid: [2, 2], minItemLevel: 7, weight: 60, baseValue: 88,
    baseStats: { armour: 15, maxHealth: 10 }, requirements: { level: 7, might: 16 },
    visual: { module: 'boots', tier: 2, material: 'darksteel', bulk: 0.6, accent: 0.4 },
  },

  // ======================= CLOAK / JEWELLERY ==============================
  {
    id: 'arm_cloak_0', name: "Mourner's Pall", slot: 'cloak', category: 'cloth',
    grid: [2, 3], minItemLevel: 2, weight: 90, baseValue: 18,
    baseStats: { armour: 3, res_shadow: 0.04 },
    visual: { module: 'cloak', tier: 0, material: 'cloth', bulk: 0.3, length: 0.8 },
    flavour: 'Worn to a funeral that never finished.',
  },
  {
    id: 'arm_cloak_1', name: 'Oiled Travelling Cloak', slot: 'cloak', category: 'leather',
    grid: [2, 3], minItemLevel: 5, weight: 70, baseValue: 54,
    baseStats: { armour: 8, moveSpeed: 0.05, res_frost: 0.05 }, requirements: { level: 5 },
    visual: { module: 'cloak', tier: 1, material: 'leather', bulk: 0.35, length: 0.95 },
  },
  {
    id: 'jwl_amulet_0', name: 'Bone Charm', slot: 'amulet', category: 'jewellery',
    grid: [1, 1], minItemLevel: 2, weight: 60, baseValue: 30,
    baseStats: { maxHealth: 6 },
    visual: { module: 'none', tier: 0, material: 'bone' },
  },
  {
    id: 'jwl_amulet_1', name: 'Reliquary Pendant', slot: 'amulet', category: 'jewellery',
    grid: [1, 1], minItemLevel: 6, weight: 35, baseValue: 110,
    baseStats: { maxHealth: 14, insight: 2 }, requirements: { level: 6 },
    visual: { module: 'none', tier: 1, material: 'bone', accent: 0.6 },
  },
  {
    id: 'jwl_ring_0', name: 'Tarnished Band', slot: 'ring1', category: 'jewellery',
    grid: [1, 1], minItemLevel: 1, weight: 70, baseValue: 22,
    baseStats: { maxHealth: 4 },
    visual: { module: 'none', tier: 0, material: 'iron' },
  },
  {
    id: 'jwl_ring_1', name: 'Signet of the Tithe', slot: 'ring1', category: 'jewellery',
    grid: [1, 1], minItemLevel: 5, weight: 40, baseValue: 90,
    baseStats: { attackPower: 4, spellPower: 4 }, requirements: { level: 5 },
    visual: { module: 'none', tier: 1, material: 'steel', accent: 0.5 },
  },
]);

/** Rings occupy either ring slot; the inventory resolves which one is free. */
export const RING_BASE_IDS = ['jwl_ring_0', 'jwl_ring_1'];
