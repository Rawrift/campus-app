/**
 * Status effects: damage over time, slows, stacking debuffs, elite auras (§14, §22).
 *
 * Effects are data, not subclasses, so an item affix, a skill and an elite
 * modifier can all apply the same "burning" effect with different numbers.
 */

import type { DamageType } from './stats';
import type { Modifier } from './stats';

export type StatusKind =
  | 'bleed' | 'burn' | 'poison' | 'chill' | 'shock' | 'shadowrot'
  | 'haste' | 'fortify' | 'weaken' | 'root' | 'vulnerable';

export interface StatusDef {
  readonly kind: StatusKind;
  readonly label: string;
  /** Total duration in seconds. Refreshed rather than extended on reapply. */
  duration: number;
  /** Damage applied per tick, if any. */
  dps?: number;
  damageType?: DamageType;
  /** Stat modifiers applied while active. */
  mods?: Modifier[];
  /** How many independent instances may coexist. Beyond this, the weakest is replaced. */
  maxStacks?: number;
  /** Who applied it — used for kill attribution and "on kill" item effects. */
  sourceId?: number | null;
  /** Purely presentational tint hint for the renderer. */
  colour?: number;
}

export interface StatusInstance extends StatusDef {
  remaining: number;
  tickAccumulator: number;
  readonly uid: number;
}

let nextStatusUid = 1;

/** Half-second ticks: frequent enough to feel alive, cheap enough to ignore. */
export const STATUS_TICK = 0.5;

export function makeStatus(def: StatusDef): StatusInstance {
  return {
    ...def,
    remaining: def.duration,
    tickAccumulator: 0,
    uid: nextStatusUid++,
  };
}

/** Human-readable summary for tooltips and the debug overlay. */
export function describeStatus(s: StatusInstance): string {
  const secs = s.remaining.toFixed(1);
  return s.dps ? `${s.label} ${s.dps.toFixed(0)}/s (${secs}s)` : `${s.label} (${secs}s)`;
}
