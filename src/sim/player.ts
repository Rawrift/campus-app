/**
 * The player controller.
 *
 * Owns the player's actor, progression, bags and gear, and turns intent
 * ("move here", "use skill 2 aimed there") into committed actions with real
 * wind-up and recovery. The renderer and UI read from it; neither writes to it
 * except through the `request*` methods (§37).
 */

import { Actor } from './entity';
import { Progression } from './progression';
import { Inventory, Equipment, baseOf } from './inventory';
import { EffectRuntime } from './effects';
import { SkillInstance } from './ability';
import { applyShape, skillDuration, skillPacket, UNARMED, type CombatShape, type WeaponProfile } from './combat';
import { findPath } from './pathfind';
import { ARCHETYPES } from '@/data/archetypes.data';
import { ITEM_BASES } from '@/data/items.data';
import { SKILLS } from '@/data/skills.data';
import { generateItem } from './loot';
import { clamp, dist, angleDelta } from '@/core/math';
import { Rng } from '@/core/rng';
import type { SimWorld, GroundItem } from './world';
import type { ArchetypeId } from './ability';
import type { ItemInstance, EquipSlot } from './items';

/** Consumables are intentionally simple in the slice: one healing draught. */
export interface PotionState {
  count: number;
  max: number;
  cooldown: number;
}

export class PlayerController {
  readonly actor: Actor;
  readonly progression: Progression;
  readonly inventory = new Inventory();
  readonly equipment = new Equipment();
  readonly effects: EffectRuntime;
  readonly rng: Rng;

  /** Current click-to-move path, in world points. */
  private path: { x: number; y: number }[] = [];
  private destination: { x: number; y: number } | null = null;
  /** An enemy the player clicked — they will walk into range then attack. */
  private pursuit: number | null = null;
  private pursuitSkill: string | null = null;

  /** The action currently committed to. */
  private activeSkill: SkillInstance | null = null;
  private phase: 'windup' | 'strike' | 'recover' | null = null;
  private phaseTimer = 0;
  private aimX = 0;
  private aimY = 0;
  /** Set when the committed action was a designated heavy attack (§14). */
  private heavy = false;

  potion: PotionState = { count: 3, max: 5, cooldown: 0 };
  gold = 0;
  /** Seconds since the player last dealt or took damage — drives Grit decay. */
  outOfCombat = 0;

  constructor(
    readonly world: SimWorld,
    readonly archetypeId: ArchetypeId,
    seed: number | string = 'player',
  ) {
    const arch = ARCHETYPES.get(archetypeId);
    this.rng = new Rng(seed);
    this.progression = new Progression(archetypeId);
    this.actor = new Actor();
    this.actor.faction = 'player';
    this.actor.name = arch.name;
    this.actor.defId = archetypeId;
    this.actor.radius = 0.4;
    this.actor.height = 1.8 * arch.body.scale;
    this.actor.staggerThreshold = 140;
    this.effects = new EffectRuntime(world);

    this.progression.applyBaseStats(this.actor.stats);
    this.grantStartingGear();
    this.recomputeStats();
    this.actor.health = this.actor.maxHealth;
    this.actor.resource = archetypeId === 'ironbound' ? 0 : this.actor.maxResource;
  }

  // --- Setup -------------------------------------------------------------

  private grantStartingGear(): void {
    const arch = ARCHETYPES.get(this.archetypeId);
    for (const baseId of arch.startingGear) {
      const base = ITEM_BASES.find(baseId);
      if (!base) continue;
      // Starting kit is deliberately Blank: the first Marked drop should feel
      // like an event, which it cannot if the player begins in magic gear.
      const item = generateItem(this.rng, { itemLevel: 1, slots: [base.slot] });
      if (!item) continue;
      const forced: ItemInstance = {
        ...item, baseId, rarity: 'blank', affixes: [], effectIds: [], name: base.name,
      };
      this.equipment.equip(forced);
    }
  }

  /** Rebuilds every derived stat from archetype + level + gear. */
  recomputeStats(): void {
    const before = this.actor.healthFraction;
    this.progression.applyBaseStats(this.actor.stats);
    this.equipment.applyTo(this.actor.stats);
    this.effects.setActive(this.equipment.activeEffectIds);

    // Preserve the *fraction* of health across a gear change, so equipping a
    // +health item does not act as a free heal and unequipping cannot kill.
    this.actor.health = clamp(
      Math.round(this.actor.maxHealth * before), 1, this.actor.maxHealth,
    );
    this.actor.resource = clamp(this.actor.resource, 0, this.actor.maxResource);

    for (const skill of this.progression.skills.values()) {
      skill.resetMods();
      skill.mods.areaScale = 1 + this.actor.stats.get('areaSize');
    }
  }

  /** The weapon profile used by every weapon-scaling skill. */
  get weapon(): WeaponProfile {
    const base = this.equipment.weapon;
    if (!base?.damage) return UNARMED;
    return {
      min: base.damage.min, max: base.damage.max, type: base.damage.type,
      reach: base.reach ?? 1.8, speed: base.speed ?? 1.0,
    };
  }

  /** Where the player last clicked to move — the renderer draws a marker there. */
  get moveTarget(): { x: number; y: number } | null {
    return this.destination;
  }

  get busy(): boolean {
    return this.phase !== null;
  }

  get currentSkillId(): string | null {
    return this.activeSkill?.def.id ?? null;
  }

  get actionProgress(): { phase: string; t: number } | null {
    if (!this.phase || !this.activeSkill) return null;
    return { phase: this.phase, t: this.phaseTimer };
  }

  // --- Intent ------------------------------------------------------------

  /** Left click on the ground: walk there. */
  requestMove(x: number, y: number): void {
    if (!this.actor.alive) return;
    this.pursuit = null;
    this.pursuitSkill = null;
    this.destination = { x, y };

    // Short hops skip pathfinding entirely so the character responds instantly
    // to small corrections, which is most clicks in a fight.
    if (dist(this.actor.x, this.actor.y, x, y) < 3 &&
        this.world.grid.lineOfSight(this.actor.x, this.actor.y, x, y)) {
      this.path = [{ x, y }];
      return;
    }
    const path = findPath(this.world.grid, this.actor.x, this.actor.y, x, y);
    this.path = path.length > 0 ? path : [this.world.grid.nearestWalkable(x, y)];
  }

  /** Left click on an enemy: close to reach, then use the primary skill. */
  requestAttack(targetId: number, skillId?: string): void {
    if (!this.actor.alive) return;
    this.pursuit = targetId;
    this.pursuitSkill = skillId ?? this.primarySkillId;
    this.destination = null;
    this.path = [];
  }

  /** Bound skill use, aimed at a world point. */
  requestSkill(skillId: string, aimX: number, aimY: number): boolean {
    if (!this.actor.alive || this.busy) return false;
    const skill = this.progression.skills.get(skillId);
    if (!skill) return false;
    return this.beginSkill(skill, aimX, aimY);
  }

  get primarySkillId(): string | null {
    // The first skill the archetype ever learns is always its no-cost basic.
    const arch = ARCHETYPES.get(this.archetypeId);
    const first = arch.startingSkills[0];
    return first && this.progression.knows(first) ? first : (this.progression.bar[0] ?? null);
  }

  usePotion(): boolean {
    if (this.potion.count <= 0 || this.potion.cooldown > 0 || !this.actor.alive) return false;
    this.potion.count--;
    this.potion.cooldown = 8;
    const amount = Math.round(this.actor.maxHealth * 0.4) + 10;
    this.world.heal(this.actor, amount);
    this.world.events.emit('NOTIFY', { text: `Draught (${this.potion.count} left)`, tone: 'good' });
    return true;
  }

  stop(): void {
    this.path = [];
    this.destination = null;
    this.pursuit = null;
    this.actor.inputX = this.actor.inputY = 0;
  }

  // --- Skill execution ---------------------------------------------------

  private beginSkill(skill: SkillInstance, aimX: number, aimY: number): boolean {
    const actor = this.actor;
    if (!skill.ready) return false;
    const cost = skill.cost;
    if (cost > 0 && actor.resource < cost) {
      this.world.events.emit('NOTIFY', {
        text: `Not enough ${ARCHETYPES.get(this.archetypeId).resource.name}`, tone: 'bad',
      });
      return false;
    }

    // Soft targeting (§9): nudge the aim onto a nearby enemy that is roughly in
    // the direction the player pointed. This is what stops melee whiffing past
    // a target the player is obviously swinging at.
    const corrected = this.softTarget(aimX, aimY, skill);
    this.aimX = corrected.x;
    this.aimY = corrected.y;

    if (cost > 0) {
      actor.resource -= cost;
      this.world.events.emit('RESOURCE_SPENT', { actorId: actor.id, amount: cost });
    }
    skill.trigger();

    this.activeSkill = skill;
    this.heavy = (skill.def.staggerPower ?? 0) >= 40;
    const timing = skillDuration(actor, skill);
    this.phase = 'windup';
    this.phaseTimer = timing.windup;
    actor.action = 'windup';
    actor.snapFacing(this.aimX, this.aimY);
    this.path = [];
    this.destination = null;

    this.world.events.emit('SKILL_USED', { skillId: skill.def.id, actorId: actor.id });
    this.effects.fire('ON_CAST', { world: this.world, owner: actor, skillTags: skill.def.tags });
    return true;
  }

  /**
   * Snaps the aim onto the best nearby hostile, if one is close to the pointed
   * direction. Melee gets a generous cone; ranged only a light correction.
   */
  private softTarget(aimX: number, aimY: number, skill: SkillInstance): { x: number; y: number } {
    const isMelee = skill.def.tags.includes('melee');
    const searchRadius = isMelee ? Math.max(this.weapon.reach, 2.6) : 3.0;
    const maxAngle = isMelee ? 0.7 : 0.25;

    const pointed = Math.atan2(aimY - this.actor.y, aimX - this.actor.x);
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;

    for (const a of this.world.actorsInRadius(this.actor.x, this.actor.y, searchRadius + 2, {
      hostileTo: 'player', excludeId: this.actor.id,
    })) {
      const toTarget = Math.atan2(a.y - this.actor.y, a.x - this.actor.x);
      const angle = Math.abs(angleDelta(pointed, toTarget));
      if (angle > maxAngle) continue;
      const d = dist(this.actor.x, this.actor.y, a.x, a.y);
      const score = angle * 2 + d * 0.1;
      if (score < bestScore) { bestScore = score; best = { x: a.x, y: a.y }; }
    }
    return best ?? { x: aimX, y: aimY };
  }

  /** Fires the actual effect at the end of the wind-up. */
  private strike(): void {
    const skill = this.activeSkill;
    if (!skill) return;
    const actor = this.actor;
    const def = skill.def;

    // Self-buffs apply to the caster and are done.
    if (def.shape.kind === 'buff') {
      const source = `skill:${def.id}`;
      actor.stats.removeBySource(source);
      actor.stats.addModifiers((def.selfMods ?? []).map((m) => ({ ...m, source })));
      this.world.applyStatus(actor, {
        kind: 'fortify', label: def.name, duration: def.selfBuffDuration ?? 6,
        colour: def.colour,
      }, actor.id);
      // Remove the modifiers when the marker status expires.
      const expiry = this.world.time + (def.selfBuffDuration ?? 6);
      this.buffExpiries.set(source, expiry);
      return;
    }

    if (def.shape.kind === 'summon') {
      this.pendingSummons.push({
        enemyId: def.shape.enemyId, count: def.shape.count, duration: def.shape.duration,
        x: actor.x, y: actor.y,
      });
      return;
    }

    const packet = skillPacket(actor, skill, this.weapon, this.world.rng);
    if (!packet) return;

    // Apply ON_CAST projectile modifiers (§18).
    const castMods = this.effects.castModifiers(def.tags);
    let shape = toCombatShape(def.shape);
    if (shape.kind === 'projectile') {
      shape = {
        ...shape,
        count: shape.count + castMods.extraProjectiles + skill.mods.extraProjectiles,
        pierce: shape.pierce + castMods.extraPierce + skill.mods.extraPierce,
      };
    }
    const scaledPacket = castMods.damageScale === 1
      ? packet
      : { ...packet, coefficient: (packet.coefficient ?? 1) * castMods.damageScale };

    const lifeOnHit = actor.stats.get('lifeOnHit');

    applyShape(
      {
        world: this.world, caster: actor,
        aimX: this.aimX, aimY: this.aimY,
        packet: scaledPacket,
        applies: def.applies,
        colour: def.colour,
        kind: def.id,
        executeAt: def.executeThreshold,
        executeMult: def.executeMultiplier,
        healOnHit: (def.healOnHit ?? 0) + lifeOnHit,
        resourceOnHit: def.resourceOnHit,
        onHit: (target, killed, crit) => this.onHitTarget(target, killed, crit),
      },
      shape,
      skill.mods.areaScale,
    );

    // Ward discharge rides the next attack, per the effect's own description.
    this.effects.tryDischargeWard(actor);
  }

  private onHitTarget(target: import('./entity').Actor, killed: boolean, crit: boolean): void {
    const actor = this.actor;
    this.outOfCombat = 0;

    const arch = ARCHETYPES.get(this.archetypeId);
    if (arch.resource.gainOnHit > 0) {
      actor.resource = clamp(actor.resource + arch.resource.gainOnHit, 0, actor.maxResource);
    }

    this.effects.fire('ON_HIT', { world: this.world, owner: actor, target, heavy: this.heavy });
    if (crit) this.effects.fire('ON_CRIT', { world: this.world, owner: actor, target });
    if (killed) {
      const lok = actor.stats.get('lifeOnKill');
      if (lok > 0) this.world.heal(actor, lok);
      this.effects.fire('ON_KILL', { world: this.world, owner: actor, target });
    }
  }

  /** Called by the zone when the player takes damage. */
  onDamaged(amount: number, staggered: boolean): void {
    this.outOfCombat = 0;
    const arch = ARCHETYPES.get(this.archetypeId);
    if (arch.resource.gainOnDamageTaken > 0) {
      this.actor.resource = clamp(
        this.actor.resource + amount * arch.resource.gainOnDamageTaken, 0, this.actor.maxResource,
      );
    }
    this.effects.fire('ON_DAMAGE_TAKEN', { world: this.world, owner: this.actor, damage: amount });
    if (staggered) {
      this.effects.fire('ON_DAMAGE_TAKEN', { world: this.world, owner: this.actor, damage: amount });
      // Being staggered cancels whatever was committed.
      this.phase = null;
      this.activeSkill = null;
    }
    if (this.actor.healthFraction <= 0.33) {
      this.effects.fire('ON_LOW_HEALTH', { world: this.world, owner: this.actor });
    }
  }

  /** Summon requests produced by skills; drained by the zone each tick. */
  readonly pendingSummons: { enemyId: string; count: number; duration: number; x: number; y: number }[] = [];
  private buffExpiries = new Map<string, number>();

  // --- Per-step update ---------------------------------------------------

  update(dt: number): void {
    const actor = this.actor;
    if (!actor.alive) return;

    this.outOfCombat += dt;
    this.potion.cooldown = Math.max(0, this.potion.cooldown - dt);
    this.progression.tickCooldowns(dt);
    this.effects.tick(dt, actor);

    // Expire skill self-buffs whose marker status has run out.
    for (const [source, at] of this.buffExpiries) {
      if (this.world.time >= at) {
        actor.stats.removeBySource(source);
        this.buffExpiries.delete(source);
      }
    }

    this.regenerate(dt);

    if (this.phase) {
      this.tickAction(dt);
      actor.integrate(dt, 40, 30);
      return;
    }

    this.followPath(dt);
    actor.integrate(dt, 40, 30);
    actor.action = actor.speed > 0.35 ? 'moving' : 'idle';
  }

  private regenerate(dt: number): void {
    const arch = ARCHETYPES.get(this.archetypeId);
    const actor = this.actor;
    const regen = arch.resource.regen + actor.stats.get('resourceRegen');

    if (arch.resource.decay > 0 && this.outOfCombat > 2.5) {
      // Grit bleeds away once you stop fighting, which is what stops the
      // Ironbound walking into every encounter with a full bar.
      actor.resource = Math.max(0, actor.resource - arch.resource.decay * dt);
    } else if (regen > 0) {
      actor.resource = clamp(actor.resource + regen * dt, 0, actor.maxResource);
    }
  }

  private tickAction(dt: number): void {
    const actor = this.actor;
    const skill = this.activeSkill;
    if (!skill || !this.phase) return;

    this.phaseTimer -= dt;
    const timing = skillDuration(actor, skill);

    if (this.phase === 'windup') {
      actor.action = 'windup';
      if (this.phaseTimer <= 0) {
        this.phase = 'strike';
        this.phaseTimer = timing.strike;
        actor.action = 'strike';
        this.strike();
      }
      return;
    }
    if (this.phase === 'strike') {
      actor.action = 'strike';
      if (this.phaseTimer <= 0) {
        this.phase = 'recover';
        this.phaseTimer = timing.recover;
        actor.action = 'recover';
      }
      return;
    }
    actor.action = 'recover';
    if (this.phaseTimer <= 0) {
      this.phase = null;
      this.activeSkill = null;
      actor.action = 'idle';
    }
  }

  private followPath(dt: number): void {
    const actor = this.actor;

    // Pursuing an enemy: walk into reach, then swing.
    if (this.pursuit !== null) {
      const target = this.world.get(this.pursuit);
      if (!target?.alive) {
        this.pursuit = null;
      } else {
        const skillId = this.pursuitSkill ?? this.primarySkillId;
        const skill = skillId ? this.progression.skills.get(skillId) : null;
        const reach = skill && !skill.def.tags.includes('melee')
          ? 8
          : Math.max(this.weapon.reach, 1.8) * 0.85;
        const d = dist(actor.x, actor.y, target.x, target.y) - target.radius;

        if (d <= reach) {
          actor.inputX = actor.inputY = 0;
          actor.faceTowards(target.x, target.y, dt, 14);
          if (skill) this.beginSkill(skill, target.x, target.y);
          return;
        }
        this.steerTowards(target.x, target.y, dt);
        return;
      }
    }

    if (this.path.length === 0) {
      actor.inputX = actor.inputY = 0;
      return;
    }

    const next = this.path[0]!;
    const d = dist(actor.x, actor.y, next.x, next.y);
    if (d < 0.35) {
      this.path.shift();
      if (this.path.length === 0) {
        actor.inputX = actor.inputY = 0;
        this.destination = null;
        return;
      }
    }
    this.steerTowards(next.x, next.y, dt);
  }

  private steerTowards(x: number, y: number, dt: number): void {
    const actor = this.actor;
    let dx = x - actor.x;
    let dy = y - actor.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    actor.inputX = dx;
    actor.inputY = dy;
    actor.faceTowards(x, y, dt, 16);
  }

  // --- Inventory -------------------------------------------------------

  /** Attempts to pick a ground item up. Returns false when the bag is full. */
  tryPickUp(ground: GroundItem): boolean {
    if (!this.inventory.hasRoomFor(ground.item)) {
      this.world.events.emit('NOTIFY', { text: 'Your bag is full.', tone: 'bad' });
      return false;
    }
    this.inventory.add(ground.item);
    this.world.pickUp(ground);
    this.world.events.emit('ITEM_PICKED', { item: ground.item });
    return true;
  }

  /** Equips from the bag, returning displaced items to the bag or the floor. */
  equipFromInventory(uid: number): boolean {
    const item = this.inventory.getItem(uid);
    if (!item) return false;
    const check = this.equipment.canEquip(item, this.actor.stats, this.progression.level);
    if (!check.ok) {
      this.world.events.emit('NOTIFY', { text: check.reason ?? 'You cannot use that.', tone: 'bad' });
      return false;
    }

    this.inventory.remove(uid);
    const { slot, displaced } = this.equipment.equip(item);
    for (const old of displaced) {
      if (!this.inventory.add(old)) this.world.dropItem(old, this.actor.x, this.actor.y);
    }
    this.recomputeStats();
    this.world.events.emit('ITEM_EQUIPPED', { item, slot });
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const item = this.equipment.get(slot);
    if (!item) return false;
    if (!this.inventory.hasRoomFor(item)) {
      this.world.events.emit('NOTIFY', { text: 'No room to unequip.', tone: 'bad' });
      return false;
    }
    this.equipment.unequip(slot);
    this.inventory.add(item);
    this.recomputeStats();
    this.world.events.emit('ITEM_UNEQUIPPED', { item, slot });
    return true;
  }

  dropFromInventory(uid: number): boolean {
    const item = this.inventory.remove(uid);
    if (!item) return false;
    this.world.dropItem(item, this.actor.x, this.actor.y);
    return true;
  }

  sellFromInventory(uid: number): boolean {
    const item = this.inventory.remove(uid);
    if (!item) return false;
    this.gold += item.value;
    this.world.events.emit('ITEM_SOLD', { item, value: item.value });
    return true;
  }

  // --- Progression ------------------------------------------------------

  grantXp(amount: number): void {
    const levels = this.progression.addXp(amount);
    this.world.events.emit('XP_GAINED', { amount, total: this.progression.xp });
    if (levels > 0) {
      this.recomputeStats();
      // Levelling restores you fully. It is a reward, and it also gives the
      // difficulty curve a natural breathing point (§47).
      this.actor.health = this.actor.maxHealth;
      this.world.events.emit('LEVEL_UP', {
        level: this.progression.level,
        skillPoints: this.progression.skillPoints,
      });
      // Auto-learn anything newly available that the player has points for.
      for (const id of this.progression.availableToLearn()) {
        if (this.progression.skillPoints <= 0) break;
        if (this.progression.spendPoint(id)) {
          this.world.events.emit('SKILL_LEARNED', { skillId: id, rank: 1 });
        }
      }
    }
  }

  /** Convenience for the skill screen. */
  skillDefs(): { id: string; rank: number; known: boolean; available: boolean }[] {
    const arch = this.archetypeId;
    return SKILLS.filter((s) => s.archetype === arch).map((s) => ({
      id: s.id,
      rank: this.progression.ranks.get(s.id) ?? 0,
      known: this.progression.knows(s.id),
      available: s.requiredLevel <= this.progression.level,
    }));
  }

  /** Human-readable summary used by the debug overlay (§55). */
  debugLine(): string {
    const a = this.actor;
    return [
      `${a.name} L${this.progression.level}`,
      `hp ${Math.round(a.health)}/${a.maxHealth}`,
      `res ${Math.round(a.resource)}/${a.maxResource}`,
      `ap ${a.stats.get('attackPower').toFixed(1)}`,
      `arm ${a.stats.get('armour').toFixed(0)}`,
      `act ${a.action}`,
    ].join('  ');
  }
}

/** Bridges the declarative skill shape to the combat shape union. */
function toCombatShape(shape: SkillInstance['def']['shape']): CombatShape {
  switch (shape.kind) {
    case 'melee_arc': return { kind: 'melee_arc', radius: shape.radius, halfAngle: shape.halfAngle, maxTargets: shape.maxTargets };
    case 'melee_line': return { kind: 'melee_line', length: shape.length, width: shape.width };
    case 'projectile': return { kind: 'projectile', speed: shape.speed, count: shape.count, spread: shape.spread, pierce: shape.pierce, radius: shape.radius, lifetime: shape.lifetime };
    case 'ground_aoe': return { kind: 'ground_aoe', radius: shape.radius, range: shape.range, delay: shape.delay, lingerDuration: shape.lingerDuration, lingerDps: shape.lingerDps };
    case 'self_aoe': return { kind: 'self_aoe', radius: shape.radius };
    case 'dash': return { kind: 'dash', distance: shape.distance, damageRadius: shape.damageRadius };
    case 'curse': return { kind: 'curse', range: shape.range, radius: shape.radius };
    case 'chain': return { kind: 'chain', range: shape.range, jumps: shape.jumps, jumpRange: shape.jumpRange };
    default: return { kind: 'self_aoe', radius: 1 };
  }
}

export { baseOf };
