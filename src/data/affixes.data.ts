/**
 * Affix table (§13).
 *
 * Every affix has level-gated tiers with their own weight and value range, so
 * the same "+health" affix rolls "of the Hale" (+6) at level 1 and "of Long
 * Vigil" (+55) at level 9. Tier weights fall off as the tier rises, which is
 * what makes a well-rolled item feel earned rather than issued.
 *
 * Naming follows the fiction: prefixes describe what was done to the object,
 * suffixes ("of the ...") describe whose memory clings to it.
 */

import { Registry } from '@/core/registry';
import type { AffixDef, AffixTier, EquipSlot, ItemCategory } from '@/sim/items';
import type { StatKey } from '@/sim/stats';

const WEAPONS: readonly ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'polearm', 'crossbow', 'stave'];
const ARMOURS: readonly ItemCategory[] = ['cloth', 'leather', 'mail', 'plate'];
const JEWELLERY: readonly ItemCategory[] = ['jewellery'];

/** Builds a tier ladder. Weight halves each step, values grow roughly 2.2x. */
function tiers(
  labels: readonly string[],
  startLevel: number,
  step: number,
  base: readonly [number, number],
  growth = 2.0,
): AffixTier[] {
  return labels.map((label, i) => ({
    label,
    minLevel: startLevel + i * step,
    weight: Math.max(4, Math.round(100 / Math.pow(1.9, i))),
    min: Math.round(base[0] * Math.pow(growth, i) * 100) / 100,
    max: Math.round(base[1] * Math.pow(growth, i) * 100) / 100,
  }));
}

const pctFmt = (suffix: string) => (v: number) => `+${(v * 100).toFixed(0)}% ${suffix}`;
const flatFmt = (suffix: string) => (v: number) => `+${v % 1 === 0 ? v : v.toFixed(1)} ${suffix}`;

function def(
  id: string,
  kind: 'prefix' | 'suffix',
  stat: StatKey,
  mode: 'flat' | 'pct',
  group: string,
  tags: string[],
  tierList: AffixTier[],
  format: (v: number) => string,
  scope?: { slots?: readonly EquipSlot[]; categories?: readonly ItemCategory[] },
): AffixDef {
  return { id, kind, stat, mode, group, tags, tiers: tierList, format, ...scope };
}

export const AFFIXES = new Registry<AffixDef>('affixes', [
  // ---- PREFIXES: offence -------------------------------------------------
  def('pre_physical', 'prefix', 'dmg_physical', 'pct', 'dmg_physical', ['damage', 'physical'],
    tiers(['Keen', 'Cruel', 'Flensing', 'Gravewrought'], 1, 3, [0.08, 0.14], 1.7),
    pctFmt('physical damage'), { categories: WEAPONS }),

  def('pre_fire', 'prefix', 'dmg_fire', 'pct', 'dmg_fire', ['damage', 'fire'],
    tiers(['Smouldering', 'Ember-Fed', 'Pyreborn'], 2, 3, [0.10, 0.18], 1.7),
    pctFmt('fire damage'), { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_frost', 'prefix', 'dmg_frost', 'pct', 'dmg_frost', ['damage', 'frost'],
    tiers(['Rimed', 'Hoarfrost', 'Deepwinter'], 2, 3, [0.10, 0.18], 1.7),
    pctFmt('frost damage'), { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_lightning', 'prefix', 'dmg_lightning', 'pct', 'dmg_lightning', ['damage', 'lightning'],
    tiers(['Storm-Touched', 'Fulgurant', 'Skyriven'], 3, 3, [0.10, 0.20], 1.7),
    pctFmt('lightning damage'), { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_poison', 'prefix', 'dmg_poison', 'pct', 'dmg_poison', ['damage', 'poison'],
    tiers(['Fevered', 'Septic', 'Blight-Cured'], 2, 3, [0.10, 0.18], 1.7),
    pctFmt('poison damage'), { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_shadow', 'prefix', 'dmg_shadow', 'pct', 'dmg_shadow', ['damage', 'shadow'],
    tiers(['Unlit', 'Sundering', 'Choir-Marked'], 4, 3, [0.10, 0.20], 1.7),
    pctFmt('shadow damage'), { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_attackpower', 'prefix', 'attackPower', 'flat', 'power', ['damage'],
    tiers(["Hale-Armed", "Butcher's", "Warden's", "Ironbound"], 1, 3, [3, 6]),
    flatFmt('attack power'), { categories: [...WEAPONS, ...ARMOURS, ...JEWELLERY] }),

  def('pre_spellpower', 'prefix', 'spellPower', 'flat', 'power', ['spell'],
    tiers(['Whispering', 'Murmuring', 'Cantoral'], 1, 3, [3, 6]),
    flatFmt('spell power'), { categories: ['stave', 'cloth', ...JEWELLERY] }),

  def('pre_crit', 'prefix', 'critChance', 'flat', 'crit', ['crit'],
    tiers(['Precise', 'Unerring', "Executioner's"], 2, 3, [0.02, 0.04], 1.6),
    (v) => `+${(v * 100).toFixed(1)}% critical chance`, { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_critdmg', 'prefix', 'critDamage', 'flat', 'critdmg', ['crit'],
    tiers(['Vicious', 'Savage', 'Ruinous'], 3, 3, [0.12, 0.22], 1.5),
    (v) => `+${(v * 100).toFixed(0)}% critical damage`, { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_attackspeed', 'prefix', 'attackSpeed', 'flat', 'speed', ['speed'],
    tiers(['Quickened', 'Restless', 'Fevermoved'], 2, 4, [0.05, 0.09], 1.5),
    (v) => `+${(v * 100).toFixed(0)}% attack speed`, { categories: [...WEAPONS, ...JEWELLERY] }),

  def('pre_armour', 'prefix', 'armour', 'flat', 'armour', ['defence'],
    tiers(['Banded', 'Reinforced', 'Bulwarked', 'Abbey-Forged'], 1, 3, [4, 8]),
    flatFmt('armour'), { categories: [...ARMOURS, 'shield'] }),

  def('pre_stagger', 'prefix', 'staggerPower', 'flat', 'stagger', ['stagger'],
    tiers(['Heavy', 'Crushing', 'Bell-Weighted'], 3, 4, [8, 16]),
    flatFmt('stagger power'), { categories: ['mace', 'axe', 'polearm'] }),

  // ---- SUFFIXES: defence and utility -------------------------------------
  def('suf_health', 'suffix', 'maxHealth', 'flat', 'health', ['defence', 'life'],
    tiers(['of the Hale', 'of Hard Winters', 'of Long Vigil', 'of the Unspent'], 1, 3, [8, 14]),
    flatFmt('maximum health')),

  def('suf_armour', 'suffix', 'armour', 'flat', 'armour', ['defence'],
    tiers(['of the Shell', 'of the Bulwark', 'of the Sealed Gate'], 1, 3, [5, 9]),
    flatFmt('armour'), { categories: [...ARMOURS, 'shield', ...JEWELLERY] }),

  def('suf_res_fire', 'suffix', 'res_fire', 'flat', 'res_fire', ['resist', 'fire'],
    tiers(['of Cinders', 'of the Banked Fire', 'of the Cold Hearth'], 2, 3, [0.05, 0.09], 1.6),
    pctFmt('fire resistance')),
  def('suf_res_frost', 'suffix', 'res_frost', 'flat', 'res_frost', ['resist', 'frost'],
    tiers(['of the Thaw', 'of Warm Blood', 'of the Long Summer'], 2, 3, [0.05, 0.09], 1.6),
    pctFmt('frost resistance')),
  def('suf_res_lightning', 'suffix', 'res_lightning', 'flat', 'res_lightning', ['resist', 'lightning'],
    tiers(['of Still Air', 'of the Dry Field', 'of the Quiet Sky'], 3, 3, [0.05, 0.09], 1.6),
    pctFmt('lightning resistance')),
  def('suf_res_poison', 'suffix', 'res_poison', 'flat', 'res_poison', ['resist', 'poison'],
    tiers(['of Clean Blood', 'of the Purge', 'of the Untainted'], 2, 3, [0.05, 0.09], 1.6),
    pctFmt('poison resistance')),
  def('suf_res_shadow', 'suffix', 'res_shadow', 'flat', 'res_shadow', ['resist', 'shadow'],
    tiers(['of the Lit Path', 'of the Kept Name', 'of the Unforgotten'], 4, 3, [0.05, 0.09], 1.6),
    pctFmt('shadow resistance')),

  def('suf_movespeed', 'suffix', 'moveSpeed', 'pct', 'movespeed', ['utility', 'speed'],
    tiers(['of the Long Road', 'of the Courier', 'of the Fleeing'], 2, 4, [0.04, 0.07], 1.4),
    pctFmt('movement speed'), { slots: ['feet', 'belt', 'cloak', 'ring1', 'ring2'] }),

  def('suf_lifeonkill', 'suffix', 'lifeOnKill', 'flat', 'leech', ['utility', 'life'],
    tiers(['of the Gleaning', 'of the Tithe', 'of the Red Harvest'], 3, 3, [2, 4]),
    flatFmt('health on kill')),

  def('suf_lifeonhit', 'suffix', 'lifeOnHit', 'flat', 'leech', ['utility', 'life'],
    tiers(['of Small Mercies', 'of the Slow Bleed'], 4, 4, [1, 2]),
    flatFmt('health on hit'), { categories: WEAPONS }),

  def('suf_resourceregen', 'suffix', 'resourceRegen', 'flat', 'regen', ['utility', 'resource'],
    tiers(['of the Deep Breath', 'of the Steady Lung', 'of the Tireless'], 2, 3, [0.6, 1.2]),
    (v) => `+${v.toFixed(1)} resource per second`),

  def('suf_healthregen', 'suffix', 'healthRegen', 'flat', 'regen', ['utility', 'life'],
    tiers(['of Mending', 'of the Knitting Bone'], 3, 4, [0.5, 1.0]),
    (v) => `+${v.toFixed(1)} health per second`),

  def('suf_might', 'suffix', 'might', 'flat', 'attr', ['attribute'],
    tiers(['of Might', 'of the Ox', 'of the Breaker'], 1, 3, [2, 4]),
    flatFmt('Might')),
  def('suf_finesse', 'suffix', 'finesse', 'flat', 'attr', ['attribute'],
    tiers(['of the Deft', 'of the Quick Hand', 'of the Whisper-Step'], 1, 3, [2, 4]),
    flatFmt('Finesse')),
  def('suf_resolve', 'suffix', 'resolve', 'flat', 'attr', ['attribute'],
    tiers(['of the Steadfast', 'of the Unmoved', 'of the Anchored'], 1, 3, [2, 4]),
    flatFmt('Resolve')),
  def('suf_insight', 'suffix', 'insight', 'flat', 'attr', ['attribute'],
    tiers(['of Insight', 'of the Open Eye', 'of the Listening'], 1, 3, [2, 4]),
    flatFmt('Insight')),

  def('suf_areasize', 'suffix', 'areaSize', 'pct', 'area', ['utility', 'area'],
    tiers(['of Reach', 'of the Wide Swing'], 4, 4, [0.08, 0.14], 1.5),
    pctFmt('area of effect'), { categories: ['stave', 'polearm', ...JEWELLERY] }),
]);

/** Convenience used by the generator and by tooltips. */
export function affixById(id: string): AffixDef | undefined {
  return AFFIXES.find(id);
}
