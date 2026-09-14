/**
 * Grid inventory and equipment (§15).
 *
 * The grid exists to make "what do I carry back?" a real decision, which is
 * half of why ARPG loot matters. It is deliberately generous enough (10x6) that
 * it does not become an admin job within the vertical slice.
 */

import { ITEM_BASES } from '@/data/items.data';
import {
  itemModifiers,
  type EquipSlot, type ItemBase, type ItemInstance,
} from './items';
import { AFFIXES } from '@/data/affixes.data';
import type { StatBlock } from './stats';

export const GRID_W = 10;
export const GRID_H = 6;

export function baseOf(item: ItemInstance): ItemBase {
  return ITEM_BASES.get(item.baseId);
}

export class Inventory {
  readonly width: number;
  readonly height: number;
  /** Cell → item uid, or 0 for empty. Row-major. */
  private cells: number[];
  private items = new Map<number, ItemInstance>();

  constructor(width = GRID_W, height = GRID_H) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(0);
  }

  get all(): ItemInstance[] {
    return [...this.items.values()];
  }

  get count(): number {
    return this.items.size;
  }

  getItem(uid: number): ItemInstance | undefined {
    return this.items.get(uid);
  }

  /** uid occupying a cell, or 0. */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.cells[y * this.width + x]!;
  }

  itemAt(x: number, y: number): ItemInstance | undefined {
    const uid = this.at(x, y);
    return uid > 0 ? this.items.get(uid) : undefined;
  }

  /** True when `item` fits at (x,y), optionally ignoring one item (for moves). */
  canPlace(item: ItemInstance, x: number, y: number, ignoreUid = 0): boolean {
    const [w, h] = baseOf(item).grid;
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const uid = this.cells[(y + dy) * this.width + (x + dx)]!;
        if (uid !== 0 && uid !== ignoreUid) return false;
      }
    }
    return true;
  }

  /**
   * Returns the single item blocking a placement, or null when the spot is free
   * or blocked by more than one item. Used for the classic "swap" drag (§15).
   */
  blockingItem(item: ItemInstance, x: number, y: number, ignoreUid = 0): ItemInstance | null {
    const [w, h] = baseOf(item).grid;
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return null;
    const found = new Set<number>();
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const uid = this.cells[(y + dy) * this.width + (x + dx)]!;
        if (uid !== 0 && uid !== ignoreUid) found.add(uid);
      }
    }
    if (found.size !== 1) return null;
    return this.items.get([...found][0]!) ?? null;
  }

  place(item: ItemInstance, x: number, y: number): boolean {
    if (!this.canPlace(item, x, y, item.uid)) return false;
    if (this.items.has(item.uid)) this.clearCells(item.uid);
    const [w, h] = baseOf(item).grid;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.cells[(y + dy) * this.width + (x + dx)] = item.uid;
      }
    }
    item.gridX = x;
    item.gridY = y;
    this.items.set(item.uid, item);
    return true;
  }

  /** First-fit placement, scanning left-to-right then top-to-bottom. */
  add(item: ItemInstance): boolean {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.canPlace(item, x, y, item.uid)) return this.place(item, x, y);
      }
    }
    return false;
  }

  remove(uid: number): ItemInstance | undefined {
    const item = this.items.get(uid);
    if (!item) return undefined;
    this.clearCells(uid);
    this.items.delete(uid);
    item.gridX = null;
    item.gridY = null;
    return item;
  }

  /** Free cells remaining — shown in the UI so a full bag is never a surprise. */
  get freeCells(): number {
    return this.cells.reduce((n, c) => n + (c === 0 ? 1 : 0), 0);
  }

  hasRoomFor(item: ItemInstance): boolean {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.canPlace(item, x, y, item.uid)) return true;
      }
    }
    return false;
  }

  clear(): void {
    this.cells.fill(0);
    this.items.clear();
  }

  private clearCells(uid: number): void {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === uid) this.cells[i] = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export interface EquipCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

export class Equipment {
  private slots = new Map<EquipSlot, ItemInstance>();

  get(slot: EquipSlot): ItemInstance | undefined {
    return this.slots.get(slot);
  }

  get entries(): [EquipSlot, ItemInstance][] {
    return [...this.slots.entries()];
  }

  get all(): ItemInstance[] {
    return [...this.slots.values()];
  }

  /** The base of whatever is in the main hand — combat reads this constantly. */
  get weapon(): ItemBase | undefined {
    const item = this.slots.get('mainHand');
    return item ? baseOf(item) : undefined;
  }

  get shield(): ItemBase | undefined {
    const item = this.slots.get('offHand');
    const base = item ? baseOf(item) : undefined;
    return base?.category === 'shield' ? base : undefined;
  }

  /** Checks level and attribute requirements before allowing an equip. */
  canEquip(item: ItemInstance, stats: StatBlock, level: number): EquipCheck {
    const req = baseOf(item).requirements;
    if (!req) return { ok: true };
    if (req.level && level < req.level) {
      return { ok: false, reason: `Requires level ${req.level}` };
    }
    for (const attr of ['might', 'finesse', 'insight'] as const) {
      const need = req[attr];
      if (need && stats.get(attr) < need) {
        const label = attr[0]!.toUpperCase() + attr.slice(1);
        return { ok: false, reason: `Requires ${need} ${label}` };
      }
    }
    return { ok: true };
  }

  /**
   * Resolves which slot an item actually goes into. Rings prefer the first free
   * ring slot; a two-handed weapon also claims the off hand.
   */
  resolveSlot(item: ItemInstance): EquipSlot {
    const base = baseOf(item);
    if (base.slot === 'ring1') {
      return this.slots.has('ring1') && !this.slots.has('ring2') ? 'ring2' : 'ring1';
    }
    return base.slot;
  }

  /**
   * Equips an item, returning every item that was displaced (which the caller
   * must put back into the inventory or drop).
   */
  equip(item: ItemInstance): { slot: EquipSlot; displaced: ItemInstance[] } {
    const base = baseOf(item);
    const slot = this.resolveSlot(item);
    const displaced: ItemInstance[] = [];

    const existing = this.slots.get(slot);
    if (existing) displaced.push(existing);

    // A two-hander cannot coexist with an off-hand, and vice versa.
    if (slot === 'mainHand' && base.twoHanded) {
      const off = this.slots.get('offHand');
      if (off) {
        displaced.push(off);
        this.slots.delete('offHand');
      }
    }
    if (slot === 'offHand') {
      const main = this.slots.get('mainHand');
      if (main && baseOf(main).twoHanded) {
        displaced.push(main);
        this.slots.delete('mainHand');
      }
    }

    this.slots.set(slot, item);
    return { slot, displaced };
  }

  unequip(slot: EquipSlot): ItemInstance | undefined {
    const item = this.slots.get(slot);
    if (item) this.slots.delete(slot);
    return item;
  }

  clear(): void {
    this.slots.clear();
  }

  /**
   * Rebuilds every equipment-derived stat modifier on an actor's StatBlock.
   * Called after any equip/unequip: cheaper and far less bug-prone than trying
   * to incrementally add and remove individual modifiers.
   */
  applyTo(stats: StatBlock): void {
    // Clear the entire `item:` namespace rather than the sources of the items
    // that happen to be equipped right now — an item that was just swapped out
    // is no longer in `this.all`, so a per-item removal would leave its
    // modifiers applied permanently.
    stats.removeByPrefix('item:');
    for (const item of this.all) {
      stats.addModifiers(itemModifiers(item, baseOf(item), (id) => AFFIXES.find(id)));
    }
    stats.invalidate();
  }

  /** Every special-effect id currently granted by worn gear (§14). */
  get activeEffectIds(): string[] {
    const out: string[] = [];
    for (const item of this.all) out.push(...item.effectIds);
    return out;
  }
}
