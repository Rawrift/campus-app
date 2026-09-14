/**
 * Skill definitions and runtime instances (§17, §18).
 *
 * A skill is data. Its *shape* (arc, projectile, ground area, dash, buff) is
 * declared, not coded per skill, so a modifier can add projectiles or pierce to
 * any projectile skill without a bespoke variant existing (§18).
 */

import type { DamageType, StatKey } from './stats';
import type { StatusDef } from './status';

export type SkillTag =
  | 'melee' | 'ranged' | 'projectile' | 'aoe' | 'dot' | 'summon'
  | 'movement' | 'buff' | 'debuff' | 'channel'
  | 'physical' | 'fire' | 'frost' | 'lightning' | 'poison' | 'shadow';

export type ArchetypeId = 'ironbound' | 'pallwalker' | 'ashen';

/** How the skill delivers its effect. Each kind is implemented once. */
export type SkillShape =
  | { kind: 'melee_arc'; radius: number; halfAngle: number; maxTargets?: number }
  | { kind: 'melee_line'; length: number; width: number }
  | { kind: 'projectile'; speed: number; count: number; spread: number; pierce: number; radius: number; lifetime: number }
  | { kind: 'ground_aoe'; radius: number; range: number; delay: number; lingerDuration?: number; lingerDps?: number }
  | { kind: 'self_aoe'; radius: number }
  | { kind: 'dash'; distance: number; damageRadius?: number }
  | { kind: 'buff' }
  | { kind: 'curse'; range: number; radius?: number }
  | { kind: 'summon'; count: number; enemyId: string; duration: number }
  | { kind: 'chain'; range: number; jumps: number; jumpRange: number };

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Two-glyph label the HUD draws procedurally — no icon files (§42). */
  readonly icon: string;
  readonly archetype: ArchetypeId;
  readonly requiredLevel: number;
  readonly maxRank: number;

  readonly resourceCost: number;
  readonly cooldown: number;

  // --- Timing (§8: anticipation / impact / recovery) ----------------------
  /** Seconds of wind-up before the hit lands. Telegraphs the attack. */
  readonly windup: number;
  /** Seconds the active/strike phase lasts. */
  readonly strike: number;
  /** Seconds of recovery the player is committed to afterwards. */
  readonly recover: number;
  /** When true, attack speed scales the timings (weapon skills). */
  readonly scalesWithAttackSpeed: boolean;

  readonly animation: string;
  readonly tags: readonly SkillTag[];
  readonly shape: SkillShape;

  /** Damage is `coefficient * weapon damage`, or flat when `flat` is set. */
  readonly damage?: {
    readonly coefficient: number;
    readonly type: DamageType;
    /** Uses the equipped weapon's damage range when true, else `flat`. */
    readonly useWeapon: boolean;
    readonly flat?: readonly [number, number];
    /** Scales with spellPower instead of attackPower. */
    readonly spell?: boolean;
  };

  readonly staggerPower?: number;
  readonly knockback?: number;
  /** Status applied to things this skill hits. */
  readonly applies?: Omit<StatusDef, 'sourceId'>;
  /** Self-buff modifiers, for `buff` shapes. */
  readonly selfMods?: readonly { stat: StatKey; flat?: number; pct?: number }[];
  readonly selfBuffDuration?: number;
  /** Health restored on hit (used by the Ironbound execute). */
  readonly healOnHit?: number;
  /** Resource restored on hit (Ashen drain). */
  readonly resourceOnHit?: number;
  /** Bonus multiplier applied when the target is below this health fraction. */
  readonly executeThreshold?: number;
  readonly executeMultiplier?: number;

  /** Per-rank growth. Rank 1 is the base; each rank adds this fraction. */
  readonly rankDamageGrowth: number;
  readonly colour: number;
}

/** A skill as owned by an actor: rank, cooldown state, runtime modifiers. */
export class SkillInstance {
  cooldownRemaining = 0;
  rank = 1;

  /**
   * Runtime modifiers from items and passives (§18). Kept as a small mutable
   * record rather than a modifier list because skills read these every cast.
   */
  mods = {
    extraProjectiles: 0,
    extraPierce: 0,
    damageScale: 1,
    areaScale: 1,
    cooldownScale: 1,
    costScale: 1,
  };

  constructor(readonly def: SkillDef) {}

  get ready(): boolean {
    return this.cooldownRemaining <= 0;
  }

  get cooldownFraction(): number {
    const total = this.def.cooldown * this.mods.cooldownScale;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, this.cooldownRemaining / total));
  }

  /** Damage multiplier from rank and runtime modifiers combined. */
  get damageMultiplier(): number {
    return (1 + (this.rank - 1) * this.def.rankDamageGrowth) * this.mods.damageScale;
  }

  get cost(): number {
    return Math.max(0, Math.round(this.def.resourceCost * this.mods.costScale));
  }

  trigger(): void {
    this.cooldownRemaining = this.def.cooldown * this.mods.cooldownScale;
  }

  tick(dt: number): void {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    }
  }

  /** Resets runtime modifiers before equipment reapplies them. */
  resetMods(): void {
    this.mods = {
      extraProjectiles: 0, extraPierce: 0,
      damageScale: 1, areaScale: 1, cooldownScale: 1, costScale: 1,
    };
  }
}
