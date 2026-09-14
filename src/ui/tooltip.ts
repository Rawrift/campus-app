/**
 * Item and skill tooltips, with equipped-item comparison (§15).
 *
 * The comparison is the important part: an ARPG asks the player to make a
 * keep-or-drop decision dozens of times an hour, and doing that by memory is
 * miserable. Holding Shift shows the delta against what is currently worn.
 */

import { ITEM_BASES } from '@/data/items.data';
import { AFFIXES } from '@/data/affixes.data';
import { SPECIAL_EFFECTS } from '@/data/effects.data';
import { SKILLS } from '@/data/skills.data';
import { ARCHETYPES } from '@/data/archetypes.data';
import { RARITY, itemModifiers, type ItemInstance } from '@/sim/items';
import type { PlayerController } from '@/sim/player';
import type { StatKey } from '@/sim/stats';

const STAT_LABELS: Partial<Record<StatKey, string>> = {
  maxHealth: 'Health', healthRegen: 'Health regen',
  maxResource: 'Resource', resourceRegen: 'Resource regen',
  armour: 'Armour', attackPower: 'Attack power', spellPower: 'Spell power',
  attackSpeed: 'Attack speed', moveSpeed: 'Movement speed',
  critChance: 'Critical chance', critDamage: 'Critical damage',
  lifeOnKill: 'Health on kill', lifeOnHit: 'Health on hit',
  staggerResist: 'Stagger resistance', staggerPower: 'Stagger power',
  areaSize: 'Area of effect', damageTaken: 'Damage taken',
  might: 'Might', finesse: 'Finesse', resolve: 'Resolve', insight: 'Insight',
  res_physical: 'Physical resistance', res_fire: 'Fire resistance',
  res_frost: 'Frost resistance', res_lightning: 'Lightning resistance',
  res_poison: 'Poison resistance', res_shadow: 'Shadow resistance',
  dmg_physical: 'Physical damage', dmg_fire: 'Fire damage',
  dmg_frost: 'Frost damage', dmg_lightning: 'Lightning damage',
  dmg_poison: 'Poison damage', dmg_shadow: 'Shadow damage',
};

const PERCENT_STATS = new Set<StatKey>([
  'critChance', 'critDamage', 'moveSpeed', 'areaSize', 'damageTaken',
  'res_physical', 'res_fire', 'res_frost', 'res_lightning', 'res_poison', 'res_shadow',
  'dmg_physical', 'dmg_fire', 'dmg_frost', 'dmg_lightning', 'dmg_poison', 'dmg_shadow',
]);

function fmt(stat: StatKey, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

export class Tooltip {
  private el: HTMLDivElement;
  /** Set true while Shift is held, which switches on comparison. */
  compareMode = false;
  private current: { item?: ItemInstance; player?: PlayerController } | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    root.appendChild(this.el);
  }

  hide(): void {
    this.el.classList.remove('visible');
    this.current = null;
  }

  /** Re-renders in place when the Shift state changes. */
  refresh(): void {
    if (this.current?.item && this.current.player) {
      const rect = this.el.getBoundingClientRect();
      this.showItem(this.current.item, this.current.player, rect.left, rect.top, true);
    }
  }

  private position(x: number, y: number): void {
    this.el.classList.add('visible');
    // Measure, then flip if the tooltip would fall off the viewport.
    const rect = this.el.getBoundingClientRect();
    let left = x + 16;
    let top = y + 16;
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 16;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    this.el.style.left = `${Math.max(8, left)}px`;
    this.el.style.top = `${Math.max(8, top)}px`;
  }

  showItem(item: ItemInstance, player: PlayerController, x: number, y: number, keepPosition = false): void {
    const base = ITEM_BASES.find(item.baseId);
    if (!base) return;
    this.current = { item, player };
    const rarity = RARITY[item.rarity];
    const colour = `#${rarity.colour.toString(16).padStart(6, '0')}`;

    const lines: string[] = [];
    lines.push(`<h4 style="color:${colour}">${escapeHtml(item.name)}</h4>`);
    lines.push(`<div class="subtitle">${rarity.label} &middot; ${base.category} &middot; item level ${item.itemLevel}</div>`);

    if (base.damage) {
      const mult = rarity.statMultiplier;
      const lo = (base.damage.min * mult).toFixed(0);
      const hi = (base.damage.max * mult).toFixed(0);
      lines.push(`<div class="stat">${lo}&ndash;${hi} ${base.damage.type} damage</div>`);
      lines.push(`<div class="stat">${(base.speed ?? 1).toFixed(2)} attacks per second</div>`);
      if (base.twoHanded) lines.push('<div class="stat">Two-handed</div>');
    }
    if (base.blockChance) {
      lines.push(`<div class="stat">${(base.blockChance * 100).toFixed(0)}% chance to block</div>`);
    }

    // Base stats, scaled the same way the simulation scales them.
    const mods = itemModifiers(item, base, (id) => AFFIXES.find(id));
    const baseStatKeys = new Set(Object.keys(base.baseStats ?? {}) as StatKey[]);
    for (const mod of mods) {
      if (!baseStatKeys.has(mod.stat) || !mod.flat) continue;
      lines.push(`<div class="stat">${fmt(mod.stat, mod.flat)} ${STAT_LABELS[mod.stat] ?? mod.stat}</div>`);
    }

    for (const rolled of item.affixes) {
      const def = AFFIXES.find(rolled.affixId);
      if (!def) continue;
      lines.push(`<div class="affix">${escapeHtml(def.format(rolled.value))}</div>`);
    }

    for (const id of item.effectIds) {
      const fx = SPECIAL_EFFECTS.find(id);
      if (fx) lines.push(`<div class="special">${escapeHtml(fx.text)}</div>`);
    }

    const check = player.equipment.canEquip(item, player.actor.stats, player.progression.level);
    if (!check.ok) lines.push(`<div class="req">${escapeHtml(check.reason ?? 'Cannot equip')}</div>`);

    if (base.flavour) lines.push(`<div class="flavour">${escapeHtml(base.flavour)}</div>`);
    lines.push(`<div class="hint">Worth ${item.value} marks</div>`);

    if (this.compareMode) {
      lines.push(this.comparison(item, player));
    } else {
      lines.push('<div class="hint">Hold SHIFT to compare with equipped</div>');
    }

    this.el.innerHTML = lines.join('');
    if (!keepPosition) this.position(x, y);
    else this.el.classList.add('visible');
  }

  /**
   * Builds the stat delta against whatever occupies the same slot.
   * Computed by resolving both items' full modifier lists, so it accounts for
   * rarity multipliers and item-level scaling rather than comparing raw numbers.
   */
  private comparison(item: ItemInstance, player: PlayerController): string {
    const base = ITEM_BASES.find(item.baseId);
    if (!base) return '';
    const slot = player.equipment.resolveSlot(item);
    const equipped = player.equipment.get(slot);
    if (!equipped) {
      return '<div class="compare">Nothing equipped in that slot.</div>';
    }
    const equippedBase = ITEM_BASES.find(equipped.baseId);
    if (!equippedBase) return '';

    const totals = (i: ItemInstance, b: typeof base) => {
      const out = new Map<StatKey, number>();
      for (const mod of itemModifiers(i, b, (id) => AFFIXES.find(id))) {
        const current = out.get(mod.stat) ?? 0;
        out.set(mod.stat, current + (mod.flat ?? 0) + (mod.pct ?? 0));
      }
      return out;
    };

    const mine = totals(item, base);
    const theirs = totals(equipped, equippedBase);
    const keys = new Set<StatKey>([...mine.keys(), ...theirs.keys()]);

    const rows: string[] = [];
    for (const key of keys) {
      const delta = (mine.get(key) ?? 0) - (theirs.get(key) ?? 0);
      if (Math.abs(delta) < 0.005) continue;
      const cls = delta > 0 ? 'better' : 'worse';
      rows.push(`<div class="${cls}">${fmt(key, delta)} ${STAT_LABELS[key] ?? key}</div>`);
    }

    // Weapon damage is not a stat modifier, so compare it explicitly.
    if (base.damage && equippedBase.damage) {
      const avg = (b: typeof base, r: ItemInstance) =>
        ((b.damage!.min + b.damage!.max) / 2) * RARITY[r.rarity].statMultiplier;
      const delta = avg(base, item) - avg(equippedBase, equipped);
      if (Math.abs(delta) > 0.05) {
        rows.push(`<div class="${delta > 0 ? 'better' : 'worse'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)} average weapon damage</div>`);
      }
    }

    const header = `<div style="margin-bottom:4px">vs. <span style="color:#${RARITY[equipped.rarity].colour.toString(16).padStart(6, '0')}">${escapeHtml(equipped.name)}</span></div>`;
    return `<div class="compare">${header}${rows.length > 0 ? rows.join('') : '<div>Identical.</div>'}</div>`;
  }

  showSkill(skillId: string, player: PlayerController, x: number, y: number): void {
    const def = SKILLS.find(skillId);
    if (!def) return;
    this.current = null;
    const instance = player.progression.skills.get(skillId);
    const rank = player.progression.ranks.get(skillId) ?? 0;
    const resourceName = ARCHETYPES.get(player.archetypeId).resource.name;

    const lines: string[] = [];
    lines.push(`<h4 style="color:#${def.colour.toString(16).padStart(6, '0')}">${escapeHtml(def.name)}</h4>`);
    lines.push(`<div class="subtitle">${def.tags.join(' &middot; ')}</div>`);
    lines.push(`<div style="color:#9d9482;line-height:1.5">${escapeHtml(def.description)}</div>`);

    const meta: string[] = [];
    if (def.resourceCost > 0) meta.push(`${instance?.cost ?? def.resourceCost} ${resourceName}`);
    if (def.cooldown > 0) meta.push(`${def.cooldown}s cooldown`);
    meta.push(`${((def.windup + def.strike + def.recover) * 1000).toFixed(0)}ms commit`);
    if (rank > 0) meta.push(`Rank ${rank}/${def.maxRank}`);
    lines.push(`<div class="stat" style="margin-top:7px">${meta.join(' &middot; ')}</div>`);

    if (def.damage) {
      const mult = instance?.damageMultiplier ?? 1;
      const pct = (def.damage.coefficient * mult * 100).toFixed(0);
      lines.push(`<div class="stat">${pct}% ${def.damage.useWeapon ? 'weapon' : 'base'} ${def.damage.type} damage</div>`);
    }
    if (def.applies) {
      lines.push(`<div class="affix">Applies ${escapeHtml(def.applies.label)} for ${def.applies.duration}s</div>`);
    }
    if (rank === 0) {
      lines.push(`<div class="req">Requires level ${def.requiredLevel}</div>`);
    }
    this.el.innerHTML = lines.join('');
    this.position(x, y);
  }

  showText(title: string, body: string, x: number, y: number): void {
    this.current = null;
    this.el.innerHTML = `<h4>${escapeHtml(title)}</h4><div style="color:#9d9482;line-height:1.5">${escapeHtml(body)}</div>`;
    this.position(x, y);
  }
}

export { STAT_LABELS, PERCENT_STATS, fmt as formatStat, escapeHtml };
