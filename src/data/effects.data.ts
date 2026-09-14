/**
 * Reliquary special effects (§14).
 *
 * The rule this table follows: none of these may be expressible as a stat line.
 * If an effect could be written "+30% damage" it belongs in `affixes.data.ts`
 * instead. Each one here changes *what the player does*, not how big a number is.
 */

import { Registry } from '@/core/registry';
import type { SpecialEffectDef } from '@/sim/items';

export const SPECIAL_EFFECTS = new Registry<SpecialEffectDef>('specialEffects', [
  {
    id: 'fx_pyre_burst',
    hook: 'ON_KILL',
    text: 'Enemies that die while burning erupt, scorching everything nearby.',
    params: { radius: 2.6, damage: 14, scaleWithSpell: 0.5 },
  },
  {
    id: 'fx_crit_ember',
    hook: 'ON_CRIT',
    text: 'Critical hits return 5 resource.',
    params: { resource: 5 },
    cooldown: 0.3,
  },
  {
    id: 'fx_ward_charge',
    hook: 'ON_BLOCK',
    text: 'Blocking stores a ward. At 3 wards your next attack discharges them as a shockwave.',
    params: { maxCharges: 3, radius: 3.0, damage: 20, stagger: 45 },
  },
  {
    id: 'fx_bone_shrapnel',
    hook: 'ON_HIT',
    text: 'Heavy attacks shed bone fragments that cut everything around the impact.',
    chance: 1,
    params: { radius: 2.2, damage: 9, heavyOnly: 1 },
  },
  {
    id: 'fx_last_breath',
    hook: 'ON_LOW_HEALTH',
    text: 'Falling below a third of your health hardens you: 35% less damage taken for 5 seconds.',
    cooldown: 25,
    params: { threshold: 0.33, reduction: 0.35, duration: 5 },
  },
  {
    id: 'fx_pierce',
    hook: 'ON_CAST',
    text: 'Your projectiles pass through the first enemy they strike.',
    params: { extraPierce: 1 },
  },
  {
    id: 'fx_miasma',
    hook: 'ON_KILL',
    text: 'Poisoned enemies burst into a lingering cloud where they fall.',
    params: { radius: 2.4, duration: 5, dps: 7 },
  },
  {
    id: 'fx_thirst',
    hook: 'ON_KILL',
    text: 'Each kill quickens you: +12% movement and attack speed for 4 seconds, stacking twice.',
    params: { duration: 4, maxStacks: 2, amount: 0.12 },
  },
  {
    id: 'fx_retort',
    hook: 'ON_DAMAGE_TAKEN',
    text: 'Being staggered releases a burst of ash that blinds the attacker.',
    chance: 1,
    cooldown: 6,
    params: { radius: 2.8, weakenDuration: 4 },
  },
  {
    id: 'fx_split',
    hook: 'ON_CAST',
    text: 'Your projectile skills fire one additional projectile, at reduced damage.',
    params: { extraProjectiles: 1, damageScale: 0.72 },
  },
]);

/** Which effects may roll on which slot — keeps a shield effect off a ring. */
export const EFFECT_SLOT_POOL: Record<string, string[]> = {
  mainHand: ['fx_bone_shrapnel', 'fx_crit_ember', 'fx_pierce', 'fx_split', 'fx_thirst'],
  offHand: ['fx_ward_charge', 'fx_retort', 'fx_last_breath'],
  chest: ['fx_last_breath', 'fx_retort'],
  head: ['fx_crit_ember', 'fx_pyre_burst'],
  hands: ['fx_bone_shrapnel', 'fx_crit_ember'],
  feet: ['fx_thirst'],
  shoulders: ['fx_retort', 'fx_ward_charge'],
  belt: ['fx_last_breath', 'fx_miasma'],
  legs: ['fx_thirst', 'fx_last_breath'],
  cloak: ['fx_miasma', 'fx_thirst'],
  amulet: ['fx_pyre_burst', 'fx_miasma', 'fx_split', 'fx_pierce'],
  ring1: ['fx_crit_ember', 'fx_pyre_burst', 'fx_pierce', 'fx_thirst'],
  ring2: ['fx_crit_ember', 'fx_pyre_burst', 'fx_pierce', 'fx_thirst'],
};
