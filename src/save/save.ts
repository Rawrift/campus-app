/**
 * Save and load (§35).
 *
 * Rules this format follows:
 *  - Everything is addressed by **stable string ID** (`baseId`, `affixId`,
 *    `skillId`, `zoneId`), never by array index or object reference, so adding
 *    or reordering content in a later patch cannot corrupt an existing save.
 *  - Derived values (max health, armour, damage) are **not** stored. They are
 *    recomputed from archetype + level + gear on load, so a balance change
 *    applies to existing characters instead of being frozen into the file.
 *  - Unknown content degrades rather than throwing: an item whose base was
 *    removed is dropped with a warning and the rest of the character loads.
 */

import { ITEM_BASES } from '@/data/items.data';
import { AFFIXES } from '@/data/affixes.data';
import { SKILLS } from '@/data/skills.data';
import { ARCHETYPES } from '@/data/archetypes.data';
import { SPECIAL_EFFECTS } from '@/data/effects.data';
import { EQUIP_SLOTS, setUidCounter, type EquipSlot, type ItemInstance, type Rarity, type RolledAffix } from '@/sim/items';
import type { PlayerController } from '@/sim/player';
import type { ZoneRuntime } from '@/world/zoneRuntime';
import type { ArchetypeId } from '@/sim/ability';

export const SAVE_VERSION = 3;
export const SAVE_KEY_PREFIX = 'ossuan.save.';

export interface SavedItem {
  uid: number;
  baseId: string;
  itemLevel: number;
  rarity: Rarity;
  affixes: RolledAffix[];
  effectIds: string[];
  name: string;
  seed: number;
  value: number;
  gridX: number | null;
  gridY: number | null;
}

export interface SaveFile {
  version: number;
  createdAt: number;
  savedAt: number;
  seed: string;
  character: {
    archetypeId: ArchetypeId;
    level: number;
    xp: number;
    skillPoints: number;
    ranks: [string, number][];
    bar: (string | null)[];
    gold: number;
    potions: number;
    health: number;
    resource: number;
  };
  inventory: SavedItem[];
  stash: SavedItem[];
  equipment: [EquipSlot, SavedItem][];
  world: {
    zoneId: string;
    x: number;
    y: number;
    visited: string[];
    consumed: string[];
    clearedGroups: string[];
  };
  /** Free-form counters the run summary shows. */
  stats: {
    kills: number;
    deaths: number;
    playtime: number;
    bossDefeated: boolean;
  };
}

function serialiseItem(item: ItemInstance): SavedItem {
  return {
    uid: item.uid,
    baseId: item.baseId,
    itemLevel: item.itemLevel,
    rarity: item.rarity,
    affixes: item.affixes.map((a) => ({ ...a })),
    effectIds: [...item.effectIds],
    name: item.name,
    seed: item.seed,
    value: item.value,
    gridX: item.gridX ?? null,
    gridY: item.gridY ?? null,
  };
}

/** Rebuilds an item, discarding content that no longer exists. */
function deserialiseItem(saved: SavedItem): ItemInstance | null {
  if (!ITEM_BASES.has(saved.baseId)) {
    console.warn(`[save] dropping item with unknown base "${saved.baseId}"`);
    return null;
  }
  const affixes = saved.affixes.filter((a) => {
    if (AFFIXES.has(a.affixId)) return true;
    console.warn(`[save] dropping unknown affix "${a.affixId}"`);
    return false;
  });
  const effectIds = saved.effectIds.filter((id) => {
    if (SPECIAL_EFFECTS.has(id)) return true;
    console.warn(`[save] dropping unknown effect "${id}"`);
    return false;
  });
  return {
    uid: saved.uid,
    baseId: saved.baseId,
    itemLevel: saved.itemLevel,
    rarity: saved.rarity,
    affixes,
    effectIds,
    name: saved.name,
    seed: saved.seed,
    value: saved.value,
    gridX: saved.gridX,
    gridY: saved.gridY,
  };
}

export interface SaveContext {
  player: PlayerController;
  zones: ZoneRuntime;
  zoneId: string;
  seed: string;
  stash: ItemInstance[];
  stats: SaveFile['stats'];
  createdAt?: number;
}

export function createSave(ctx: SaveContext): SaveFile {
  const { player, zones } = ctx;
  return {
    version: SAVE_VERSION,
    createdAt: ctx.createdAt ?? Date.now(),
    savedAt: Date.now(),
    seed: ctx.seed,
    character: {
      archetypeId: player.archetypeId,
      level: player.progression.level,
      xp: player.progression.xp,
      skillPoints: player.progression.skillPoints,
      ranks: [...player.progression.ranks.entries()],
      bar: [...player.progression.bar],
      gold: player.gold,
      potions: player.potion.count,
      health: player.actor.health,
      resource: player.actor.resource,
    },
    inventory: player.inventory.all.map(serialiseItem),
    stash: ctx.stash.map(serialiseItem),
    equipment: player.equipment.entries.map(([slot, item]) => [slot, serialiseItem(item)]),
    world: {
      zoneId: ctx.zoneId,
      x: player.actor.x,
      y: player.actor.y,
      visited: [...zones.visited],
      consumed: [...zones.consumed],
      clearedGroups: [...zones.clearedGroups],
    },
    stats: { ...ctx.stats },
  };
}

/**
 * Migrates an older save forward. Each step is additive and total, so a v1 file
 * walks v1 → v2 → v3 rather than needing a bespoke path per version pair.
 */
export function migrate(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<SaveFile> & { version?: number };
  if (typeof data.version !== 'number') return null;
  if (data.version > SAVE_VERSION) {
    console.warn(`[save] file is from a newer version (${data.version}); refusing to load`);
    return null;
  }

  let file = data as SaveFile;
  if (file.version < 2) {
    // v1 had no stash and no run statistics.
    file = { ...file, stash: file.stash ?? [], stats: file.stats ?? { kills: 0, deaths: 0, playtime: 0, bossDefeated: false } };
    file.version = 2;
  }
  if (file.version < 3) {
    // v2 stored no action-bar bindings; rebuild them from known skills.
    const known = (file.character?.ranks ?? []).map(([id]) => id);
    file = {
      ...file,
      character: { ...file.character, bar: file.character?.bar ?? known.slice(0, 5) },
    };
    file.version = 3;
  }
  return file;
}

export interface LoadResult {
  file: SaveFile;
  warnings: string[];
}

/** Applies a save file onto a freshly constructed player and zone runtime. */
export function applySave(file: SaveFile, player: PlayerController, zones: ZoneRuntime): LoadResult {
  const warnings: string[] = [];
  const prog = player.progression;

  if (!ARCHETYPES.has(file.character.archetypeId)) {
    warnings.push(`unknown archetype "${file.character.archetypeId}"`);
  }

  prog.level = Math.max(1, file.character.level);
  prog.xp = Math.max(0, file.character.xp);
  prog.skillPoints = Math.max(0, file.character.skillPoints);
  prog.ranks.clear();
  prog.skills.clear();
  for (const [skillId, rank] of file.character.ranks) {
    const def = SKILLS.find(skillId);
    if (!def) { warnings.push(`unknown skill "${skillId}"`); continue; }
    prog.ranks.set(skillId, rank);
    prog.learn(skillId);
    const instance = prog.skills.get(skillId);
    if (instance) instance.rank = rank;
  }
  prog.bar = file.character.bar.map((id) => (id && SKILLS.has(id) ? id : null));
  // Guarantee the basic attack is always reachable, even from an odd save.
  if (!prog.bar.some((id) => id !== null)) {
    prog.bar[0] = prog.skills.keys().next().value ?? null;
  }

  player.gold = file.character.gold;
  player.potion.count = file.character.potions;

  // --- Items ------------------------------------------------------------
  player.inventory.clear();
  player.equipment.clear();
  let maxUid = 1;

  for (const saved of file.inventory) {
    const item = deserialiseItem(saved);
    if (!item) { warnings.push(`dropped inventory item "${saved.name}"`); continue; }
    maxUid = Math.max(maxUid, item.uid + 1);
    // Try the stored grid position first; fall back to first-fit so a change
    // to the grid size never loses a character's belongings.
    const gx = item.gridX;
    const gy = item.gridY;
    const placed = gx !== null && gx !== undefined && gy !== null && gy !== undefined
      && player.inventory.place(item, gx, gy);
    if (!placed) {
      if (!player.inventory.add(item)) warnings.push(`no room for "${item.name}"`);
    }
  }

  for (const [slot, saved] of file.equipment) {
    if (!EQUIP_SLOTS.includes(slot)) { warnings.push(`unknown slot "${slot}"`); continue; }
    const item = deserialiseItem(saved);
    if (!item) { warnings.push(`dropped equipped item "${saved.name}"`); continue; }
    maxUid = Math.max(maxUid, item.uid + 1);
    player.equipment.equip(item);
  }
  setUidCounter(maxUid);

  player.recomputeStats();
  player.actor.health = Math.min(Math.max(1, file.character.health), player.actor.maxHealth);
  player.actor.resource = Math.min(Math.max(0, file.character.resource), player.actor.maxResource);

  // --- World progress ---------------------------------------------------
  zones.visited.clear();
  zones.consumed.clear();
  zones.clearedGroups.clear();
  for (const z of file.world.visited) zones.visited.add(z);
  for (const c of file.world.consumed) zones.consumed.add(c);
  for (const g of file.world.clearedGroups) zones.clearedGroups.add(g);

  return { file, warnings };
}

/** Restores stash contents separately, since the stash outlives any one zone. */
export function loadStash(file: SaveFile): ItemInstance[] {
  return file.stash
    .map(deserialiseItem)
    .filter((i): i is ItemInstance => i !== null);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Abstracted so tests can use an in-memory store instead of localStorage. */
export interface SaveStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStorage implements SaveStorage {
  private map = new Map<string, string>();
  read(key: string): string | null { return this.map.get(key) ?? null; }
  write(key: string, value: string): void { this.map.set(key, value); }
  remove(key: string): void { this.map.delete(key); }
  keys(): string[] { return [...this.map.keys()]; }
}

export class BrowserStorage implements SaveStorage {
  read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  write(key: string, value: string): void {
    try { localStorage.setItem(key, value); }
    catch (err) { console.error('[save] could not write:', err); }
  }
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  keys(): string[] {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(SAVE_KEY_PREFIX)); }
    catch { return []; }
  }
}

export function writeSave(storage: SaveStorage, slot: string, file: SaveFile): void {
  storage.write(SAVE_KEY_PREFIX + slot, JSON.stringify(file));
}

export function readSave(storage: SaveStorage, slot: string): SaveFile | null {
  const raw = storage.read(SAVE_KEY_PREFIX + slot);
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error(`[save] slot "${slot}" is corrupt:`, err);
    return null;
  }
}

export function listSaves(storage: SaveStorage): { slot: string; file: SaveFile }[] {
  const out: { slot: string; file: SaveFile }[] = [];
  for (const key of storage.keys()) {
    if (!key.startsWith(SAVE_KEY_PREFIX)) continue;
    const slot = key.slice(SAVE_KEY_PREFIX.length);
    const file = readSave(storage, slot);
    if (file) out.push({ slot, file });
  }
  return out.sort((a, b) => b.file.savedAt - a.file.savedAt);
}

export function deleteSave(storage: SaveStorage, slot: string): void {
  storage.remove(SAVE_KEY_PREFIX + slot);
}
