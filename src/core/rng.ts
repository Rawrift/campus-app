/**
 * Deterministic pseudo-random number generation.
 *
 * Every system that rolls dice (loot, affixes, AI jitter, VFX scatter) takes an
 * `Rng` rather than touching `Math.random`. That keeps the whole simulation
 * reproducible from a seed, which is what makes the loot tests in
 * `tests/loot.test.ts` meaningful and what §13 asks for ("permitir seeds
 * reproducibles para debugging").
 */

/** Hashes an arbitrary string into a 32-bit seed, so seeds can be human-typed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 — small, fast, good enough distribution for gameplay, and trivial
 * to reimplement identically on a server if this ever becomes multiplayer (§49).
 */
export class Rng {
  private state: number;

  constructor(seed: number | string = Date.now()) {
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;
  }

  /** Current internal state — serialise this to resume an identical stream. */
  get seed(): number {
    return this.state;
  }

  set seed(value: number) {
    this.state = value >>> 0 || 1;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p` (clamped). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /**
   * Weighted pick. `weightOf` may return 0 to exclude an entry entirely, which
   * is how affix level-gating and incompatibilities are applied (§13).
   * Returns `undefined` when every candidate weighs 0 — callers must handle it
   * rather than receiving a silently wrong item.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w > 0) total += w;
    }
    if (total <= 0) return undefined;

    let roll = this.next() * total;
    for (const item of items) {
      const w = weightOf(item);
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /** Bell-ish roll: average of two uniforms, so mid values are commoner. */
  centred(min: number, max: number): number {
    return min + ((this.next() + this.next()) * 0.5) * (max - min);
  }

  /** A fresh independent stream, derived deterministically from this one. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }
}

/** Shared stream for cosmetic-only randomness (VFX scatter, idle jitter). */
export const cosmeticRng = new Rng(0xc0ffee);
