/**
 * Object pooling (§39).
 *
 * Projectiles, damage numbers, blood decals and particle bursts are created and
 * destroyed constantly; allocating them per hit produces GC hitches that are
 * very visible in a game whose whole appeal is moment-to-moment impact.
 */

export class Pool<T> {
  private free: T[] = [];
  private live = new Set<T>();

  constructor(
    private factory: () => T,
    private reset: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.live.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.live.delete(item)) return; // double-release guard
    this.reset(item);
    this.free.push(item);
  }

  releaseAll(): void {
    for (const item of [...this.live]) this.release(item);
  }

  get activeCount(): number {
    return this.live.size;
  }

  get pooledCount(): number {
    return this.free.length;
  }

  forEachActive(fn: (item: T) => void): void {
    for (const item of this.live) fn(item);
  }
}
