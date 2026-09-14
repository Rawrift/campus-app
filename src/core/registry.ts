/**
 * Stable-ID registry (§35, §36).
 *
 * Content (items, skills, enemies, affixes) is addressed by string ID forever.
 * Saves store IDs, never object references or array indices, so reordering or
 * adding content in a later patch cannot corrupt an existing character.
 */

export interface Identified {
  readonly id: string;
}

export class Registry<T extends Identified> {
  private byId = new Map<string, T>();

  constructor(public readonly label: string, entries: readonly T[] = []) {
    for (const entry of entries) this.add(entry);
  }

  add(entry: T): T {
    if (this.byId.has(entry.id)) {
      throw new Error(`[${this.label}] duplicate id "${entry.id}"`);
    }
    this.byId.set(entry.id, entry);
    return entry;
  }

  /** Throws on a missing ID — content bugs should be loud, not silent. */
  get(id: string): T {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`[${this.label}] unknown id "${id}"`);
    return entry;
  }

  /** Non-throwing lookup, for save files that may reference removed content. */
  find(id: string): T | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get all(): T[] {
    return [...this.byId.values()];
  }

  filter(predicate: (entry: T) => boolean): T[] {
    return this.all.filter(predicate);
  }

  get size(): number {
    return this.byId.size;
  }
}
