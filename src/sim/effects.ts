/**
 * Runtime for reliquary special effects (§14).
 *
 * The player controller calls these hooks explicitly rather than the effects
 * subscribing to the global bus, because effects need the *caster's* context
 * (their spell power, their position) and because explicit calls keep the whole
 * thing testable without a running game.
 */

import { SPECIAL_EFFECTS } from '@/data/effects.data';
import type { EffectHook, SpecialEffectDef } from './items';
import type { Actor } from './entity';
import type { SimWorld } from './world';
import { clamp } from '@/core/math';

export interface EffectContext {
  readonly world: SimWorld;
  readonly owner: Actor;
  /** The actor the hook concerns (the thing hit, or killed). */
  readonly target?: Actor;
  readonly damage?: number;
  /** True when the triggering attack was a designated heavy attack. */
  readonly heavy?: boolean;
  /** Set on ON_CAST so projectile modifiers can be read back by the caster. */
  readonly skillTags?: readonly string[];
}

/** Per-skill modifiers that ON_CAST effects contribute (§18). */
export interface CastModifiers {
  extraProjectiles: number;
  extraPierce: number;
  damageScale: number;
}

export class EffectRuntime {
  /** effectId → seconds until it may fire again. */
  private cooldowns = new Map<string, number>();
  private active: SpecialEffectDef[] = [];
  /** Ward charges accumulated by `fx_ward_charge`. */
  wardCharges = 0;
  /** Kill-speed stacks from `fx_thirst`. */
  private thirstStacks = 0;
  private thirstRemaining = 0;

  constructor(private world: SimWorld) {}

  /** Replaces the active effect set — called whenever equipment changes. */
  setActive(effectIds: readonly string[]): void {
    this.active = effectIds
      .map((id) => SPECIAL_EFFECTS.find(id))
      .filter((d): d is SpecialEffectDef => !!d);
  }

  get activeDefs(): readonly SpecialEffectDef[] {
    return this.active;
  }

  has(id: string): boolean {
    return this.active.some((d) => d.id === id);
  }

  tick(dt: number, owner: Actor): void {
    for (const [id, t] of this.cooldowns) {
      if (t > 0) this.cooldowns.set(id, Math.max(0, t - dt));
    }
    if (this.thirstRemaining > 0) {
      this.thirstRemaining -= dt;
      if (this.thirstRemaining <= 0) {
        this.thirstStacks = 0;
        owner.stats.removeBySource('fx_thirst');
      }
    }
  }

  private ready(def: SpecialEffectDef): boolean {
    if ((this.cooldowns.get(def.id) ?? 0) > 0) return false;
    if (def.chance !== undefined && def.chance < 1 && !this.world.rng.chance(def.chance)) return false;
    return true;
  }

  private consume(def: SpecialEffectDef): void {
    if (def.cooldown) this.cooldowns.set(def.id, def.cooldown);
  }

  /** Accumulates ON_CAST modifiers for a skill about to be used. */
  castModifiers(tags: readonly string[]): CastModifiers {
    const mods: CastModifiers = { extraProjectiles: 0, extraPierce: 0, damageScale: 1 };
    for (const def of this.active) {
      if (def.hook !== 'ON_CAST') continue;
      const p = def.params ?? {};
      if (def.id === 'fx_pierce' && tags.includes('projectile')) {
        mods.extraPierce += p.extraPierce ?? 1;
      }
      if (def.id === 'fx_split' && tags.includes('projectile')) {
        mods.extraProjectiles += p.extraProjectiles ?? 1;
        mods.damageScale *= p.damageScale ?? 0.75;
      }
    }
    return mods;
  }

  /** Runs every effect bound to a hook. */
  fire(hook: EffectHook, ctx: EffectContext): void {
    for (const def of this.active) {
      if (def.hook !== hook) continue;
      if (!this.ready(def)) continue;
      if (this.run(def, ctx)) this.consume(def);
    }
  }

  /** Returns true when the effect actually did something. */
  private run(def: SpecialEffectDef, ctx: EffectContext): boolean {
    const { world, owner, target } = ctx;
    const p = def.params ?? {};

    switch (def.id) {
      case 'fx_pyre_burst': {
        if (!target || !target.hasStatus('burn')) return false;
        const spell = owner.stats.get('spellPower');
        world.spawnGround({
          x: target.x, y: target.y, radius: p.radius ?? 2.6,
          delay: 0.1, duration: 0, dps: 0, damageType: 'fire',
          ownerId: owner.id, faction: owner.faction, tickAccumulator: 0,
          colour: 0xe08a33, kind: 'fx_pyre_burst',
          burst: {
            amounts: { fire: (p.damage ?? 14) * (1 + spell * (p.scaleWithSpell ?? 0.5) / 100) },
            staggerPower: 15, knockback: 1.5, tag: 'fx_pyre_burst',
          },
        } as never);
        return true;
      }

      case 'fx_crit_ember': {
        owner.resource = clamp(owner.resource + (p.resource ?? 5), 0, owner.maxResource);
        return true;
      }

      case 'fx_ward_charge': {
        this.wardCharges = Math.min(p.maxCharges ?? 3, this.wardCharges + 1);
        return true;
      }

      case 'fx_bone_shrapnel': {
        if (p.heavyOnly && !ctx.heavy) return false;
        if (!target) return false;
        const attack = owner.stats.get('attackPower');
        world.spawnGround({
          x: target.x, y: target.y, radius: p.radius ?? 2.2,
          delay: 0.05, duration: 0, dps: 0, damageType: 'physical',
          ownerId: owner.id, faction: owner.faction, tickAccumulator: 0,
          colour: 0xc8b98a, kind: 'fx_bone_shrapnel',
          burst: {
            amounts: { physical: (p.damage ?? 9) * (1 + attack / 150) },
            staggerPower: 8, tag: 'fx_bone_shrapnel',
          },
        } as never);
        return true;
      }

      case 'fx_last_breath': {
        if (owner.healthFraction > (p.threshold ?? 0.33)) return false;
        owner.stats.removeBySource('fx_last_breath');
        owner.stats.addModifier({
          stat: 'damageTaken', pct: -(p.reduction ?? 0.35), source: 'fx_last_breath',
        });
        // Scheduled removal via a self-expiring status keeps the bookkeeping in
        // one place rather than inventing a second timer system.
        world.applyStatus(owner, {
          kind: 'fortify', label: 'Hardened', duration: p.duration ?? 5,
          mods: [{ stat: 'damageTaken', pct: 0 }], colour: 0xc8a349,
        }, owner.id);
        setTimeoutLike(world, p.duration ?? 5, () => owner.stats.removeBySource('fx_last_breath'));
        world.events.emit('NOTIFY', { text: 'Hardened.', tone: 'good' });
        return true;
      }

      case 'fx_miasma': {
        if (!target || !target.hasStatus('poison')) return false;
        world.spawnGround({
          x: target.x, y: target.y, radius: p.radius ?? 2.4,
          delay: 0, duration: p.duration ?? 5, dps: p.dps ?? 7, damageType: 'poison',
          ownerId: owner.id, faction: owner.faction, tickAccumulator: 0,
          applies: { kind: 'poison', label: 'Miasma', duration: 3, dps: 2, damageType: 'poison', colour: 0x6f8a3a },
          colour: 0x6f8a3a, kind: 'fx_miasma',
        } as never);
        return true;
      }

      case 'fx_thirst': {
        const max = p.maxStacks ?? 2;
        this.thirstStacks = Math.min(max, this.thirstStacks + 1);
        this.thirstRemaining = p.duration ?? 4;
        const amount = (p.amount ?? 0.12) * this.thirstStacks;
        owner.stats.removeBySource('fx_thirst');
        owner.stats.addModifiers([
          { stat: 'moveSpeed', pct: amount, source: 'fx_thirst' },
          { stat: 'attackSpeed', flat: amount, source: 'fx_thirst' },
        ]);
        return true;
      }

      case 'fx_retort': {
        world.spawnGround({
          x: owner.x, y: owner.y, radius: p.radius ?? 2.8,
          delay: 0, duration: 0.1, dps: 0, damageType: 'shadow',
          ownerId: owner.id, faction: owner.faction, tickAccumulator: 0,
          applies: {
            kind: 'weaken', label: 'Blinded', duration: p.weakenDuration ?? 4,
            mods: [{ stat: 'attackPower', pct: -0.35 }], colour: 0x8b8377,
          },
          colour: 0x8b8377, kind: 'fx_retort',
          burst: { amounts: { shadow: 1 }, tag: 'fx_retort' },
        } as never);
        return true;
      }

      default:
        return false;
    }
  }

  /**
   * Discharges accumulated ward charges as a shockwave. Called by the player
   * controller on the next attack once the charges are full.
   */
  tryDischargeWard(owner: Actor): boolean {
    const def = this.active.find((d) => d.id === 'fx_ward_charge');
    if (!def) return false;
    const max = def.params?.maxCharges ?? 3;
    if (this.wardCharges < max) return false;
    this.wardCharges = 0;

    this.world.spawnGround({
      x: owner.x, y: owner.y, radius: def.params?.radius ?? 3.0,
      delay: 0, duration: 0.1, dps: 0, damageType: 'physical',
      ownerId: owner.id, faction: owner.faction, tickAccumulator: 0,
      colour: 0x8fa8c4, kind: 'fx_ward_discharge',
      burst: {
        amounts: { physical: def.params?.damage ?? 20 },
        staggerPower: def.params?.stagger ?? 45, knockback: 4, tag: 'fx_ward',
      },
    } as never);
    this.world.events.emit('NOTIFY', { text: 'Ward discharged.', tone: 'good' });
    return true;
  }

  reset(): void {
    this.cooldowns.clear();
    this.wardCharges = 0;
    this.thirstStacks = 0;
    this.thirstRemaining = 0;
  }
}

/**
 * Defers a callback by simulated seconds.
 *
 * Implemented on top of the world's ground-effect list rather than `setTimeout`
 * so that it obeys hit-stop and pausing, and so it still works in headless
 * tests that step the world manually.
 */
const deferred: { world: SimWorld; at: number; fn: () => void }[] = [];
function setTimeoutLike(world: SimWorld, seconds: number, fn: () => void): void {
  deferred.push({ world, at: world.time + seconds, fn });
}

/** Called once per world step by the game loop. */
export function tickDeferred(world: SimWorld): void {
  for (let i = deferred.length - 1; i >= 0; i--) {
    const d = deferred[i]!;
    if (d.world !== world) continue;
    if (world.time >= d.at) {
      deferred.splice(i, 1);
      try { d.fn(); } catch (err) { console.error('[effects] deferred threw:', err); }
    }
  }
}

export function clearDeferred(): void {
  deferred.length = 0;
}
