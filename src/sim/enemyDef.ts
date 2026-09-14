/** Enemy content types, shared by the data table and the spawner. */

import type { StatTable } from './stats';
import type { StatusDef } from './status';
import type { DamageType } from './stats';

export type CombatRole = 'swarm' | 'melee' | 'ranged' | 'tank' | 'support' | 'assassin' | 'summoner' | 'elite';
export type EnemyFamily = 'kept' | 'beast' | 'hollow' | 'abbey';

/** Visual parameters for the procedural enemy mesh builder (§3, §19 silhouette). */
export interface EnemyVisual {
  /** Base body plan. Each has a distinct silhouette from the ARPG camera. */
  readonly build: 'gaunt' | 'heavy' | 'hunched' | 'quadruped' | 'wisp' | 'tall' | 'armoured';
  readonly scale: number;
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
  /** 0..1, adds rags/robes that flutter. */
  readonly cloth?: number;
  /** Held weapon shape, if any. */
  readonly weapon?: 'cleaver' | 'sword' | 'shield_sword' | 'maul' | 'censer' | 'claws' | 'staff' | 'bell';
  /** Emissive glow strength, for the supernatural families. */
  readonly glow?: number;
}

export interface EnemyAttack {
  readonly id: string;
  readonly name: string;
  /** Seconds of telegraph before damage lands. This is the player's read (§23). */
  readonly windup: number;
  readonly strike: number;
  readonly recover: number;
  readonly cooldown: number;
  /** Range at which the AI will choose this attack. */
  readonly range: number;
  readonly damage: readonly [number, number];
  readonly damageType: DamageType;
  readonly shape:
    | { kind: 'arc'; radius: number; halfAngle: number }
    | { kind: 'line'; length: number; width: number }
    | { kind: 'projectile'; speed: number; count: number; spread: number; radius: number }
    | { kind: 'ground'; radius: number; delay: number; lingerDuration?: number; lingerDps?: number }
    | { kind: 'self_aoe'; radius: number }
    | { kind: 'leap'; distance: number; radius: number };
  readonly staggerPower?: number;
  readonly knockback?: number;
  readonly applies?: Omit<StatusDef, 'sourceId'>;
  /** Relative chance the AI picks this attack when several are in range. */
  readonly weight: number;
  /** Only usable below this fraction of the enemy's health (boss phases). */
  readonly belowHealth?: number;
  /** Only usable at or above this fraction. */
  readonly aboveHealth?: number;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly family: EnemyFamily;
  readonly role: CombatRole;
  readonly level: number;
  readonly stats: StatTable;
  readonly radius: number;
  readonly height: number;
  readonly attacks: readonly EnemyAttack[];

  // --- AI tuning (§21) ---------------------------------------------------
  readonly aggroRange: number;
  /** Distance from its spawn point past which it gives up and returns. */
  readonly leashRange: number;
  /** Preferred distance to hold from the target. Ranged units keep their spacing. */
  readonly preferredRange: number;
  /** How strongly it dodges sideways rather than beelining (0 = straight line). */
  readonly strafe: number;
  /** Seconds of hesitation after spotting the player, before committing. */
  readonly alertTime: number;
  /** Below this health fraction it may flee (0 disables). */
  readonly fleeBelow: number;

  // --- Rewards -----------------------------------------------------------
  readonly xp: number;
  readonly dropChance: number;
  readonly dropRolls: number;
  readonly rarityBonus?: number;

  readonly visual: EnemyVisual;
  /** Shown when the player first meets one, for environmental storytelling. */
  readonly note?: string;
  readonly isBoss?: boolean;
  /** Boss only: health fractions at which the phase advances. */
  readonly phaseThresholds?: readonly number[];
}
