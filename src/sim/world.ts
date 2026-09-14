/**
 * The simulation world.
 *
 * Owns every actor, projectile, ground effect and dropped item, plus the
 * navigation grid. Imports nothing from `src/render/` — this whole file runs in
 * Node under vitest, which is what lets combat and AI be tested without a
 * browser (§37, §49, §54).
 */

import { Rng } from '@/core/rng';
import { bus, type EventBus } from '@/core/events';
import { clamp, dist, dist2, inCone } from '@/core/math';
import { Actor, type Faction } from './entity';
import { makeStatus, STATUS_TICK, type StatusDef, type StatusInstance } from './status';
import { resolveDamage, applyHeal, type DamagePacket, type DamageResult } from './damage';
import type { DamageType } from './stats';
import type { ItemInstance } from './items';

// ---------------------------------------------------------------------------
// Navigation grid
// ---------------------------------------------------------------------------

/** What occupies a tile. Drives both pathing and the renderer's geometry. */
export enum Tile {
  Void = 0,
  Floor = 1,
  Wall = 2,
  /** Walkable but visually distinct (road, flagstones, grass). */
  Path = 3,
  /** Blocks movement and sight but is scenery, not architecture. */
  Prop = 4,
  /** Walkable, blocks nothing, but marks water/mud for VFX and speed. */
  Mire = 5,
}

export const TILE_SIZE = 1.0;

export class NavGrid {
  readonly tiles: Uint8Array;

  constructor(readonly width: number, readonly height: number, fill: Tile = Tile.Void) {
    this.tiles = new Uint8Array(width * height).fill(fill);
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  get(tx: number, ty: number): Tile {
    if (!this.inBounds(tx, ty)) return Tile.Void;
    return this.tiles[ty * this.width + tx] as Tile;
  }

  set(tx: number, ty: number, tile: Tile): void {
    if (!this.inBounds(tx, ty)) return;
    this.tiles[ty * this.width + tx] = tile;
  }

  /** True when an actor may stand on this tile. */
  walkable(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t === Tile.Floor || t === Tile.Path || t === Tile.Mire;
  }

  /** True when the tile blocks line of sight (walls and props do). */
  opaque(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t === Tile.Wall || t === Tile.Prop || t === Tile.Void;
  }

  worldWalkable(x: number, y: number): boolean {
    return this.walkable(Math.floor(x), Math.floor(y));
  }

  /** Bresenham line-of-sight check between two world points (§21). */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let tx = Math.floor(x0);
    let ty = Math.floor(y0);
    const tx1 = Math.floor(x1);
    const ty1 = Math.floor(y1);
    const dx = Math.abs(tx1 - tx);
    const dy = Math.abs(ty1 - ty);
    const sx = tx < tx1 ? 1 : -1;
    const sy = ty < ty1 ? 1 : -1;
    let err = dx - dy;
    let guard = 0;

    while (guard++ < 512) {
      if (tx === tx1 && ty === ty1) return true;
      if (this.opaque(tx, ty) && !(tx === Math.floor(x0) && ty === Math.floor(y0))) return false;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; tx += sx; }
      if (e2 < dx) { err += dx; ty += sy; }
    }
    return false;
  }

  /** Nearest walkable world position to (x, y), searching outwards. */
  nearestWalkable(x: number, y: number, maxRadius = 8): { x: number; y: number } {
    if (this.worldWalkable(x, y)) return { x, y };
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.walkable(cx + dx, cy + dy)) {
            return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
          }
        }
      }
    }
    return { x, y };
  }
}

// ---------------------------------------------------------------------------
// Transient world objects
// ---------------------------------------------------------------------------

export interface Projectile {
  id: number;
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  /** Cosmetic height above the ground. */
  z: number;
  radius: number;
  life: number;
  ownerId: number;
  faction: Faction;
  packet: DamagePacket;
  /** Remaining targets it may pass through. */
  pierce: number;
  hitIds: Set<number>;
  applies?: Omit<StatusDef, 'sourceId'>;
  colour: number;
  /** Presentation hint: 'bolt' | 'dart' | 'mote' | 'shard'. */
  kind: string;
}

/** A lingering damaging area: burning ground, poison cloud, boss ripples. */
export interface GroundEffect {
  id: number;
  active: boolean;
  x: number; y: number;
  radius: number;
  /** Seconds until it becomes active (telegraph window, §23). */
  delay: number;
  /** Seconds it persists once active. */
  duration: number;
  dps: number;
  damageType: DamageType;
  ownerId: number;
  faction: Faction;
  tickAccumulator: number;
  applies?: Omit<StatusDef, 'sourceId'>;
  colour: number;
  /** One-shot burst damage applied the moment it activates. */
  burst?: DamagePacket;
  kind: string;
}

/** An item lying on the ground (§16). */
export interface GroundItem {
  item: ItemInstance;
  x: number; y: number;
  /** Cosmetic bounce state, driven by the sim so it is deterministic. */
  z: number;
  vz: number;
  vx: number; vy: number;
  settled: boolean;
  age: number;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

let nextTransientId = 1;

export interface WorldQueryOptions {
  /** Only return actors hostile to this faction. */
  readonly hostileTo?: Faction;
  readonly includeDead?: boolean;
  readonly excludeId?: number;
  readonly requireLineOfSight?: boolean;
}

export class SimWorld {
  readonly actors: Actor[] = [];
  readonly projectiles: Projectile[] = [];
  readonly ground: GroundEffect[] = [];
  readonly items: GroundItem[] = [];
  readonly rng: Rng;
  grid: NavGrid;
  /** Seconds of simulated time — status effects and cooldowns read this. */
  time = 0;

  /** Actors indexed by id for O(1) lookup during damage resolution. */
  private byId = new Map<number, Actor>();
  /** Coarse spatial hash, rebuilt each tick. Cell size ~ 4 world units. */
  private hash = new Map<number, Actor[]>();
  private readonly cellSize = 4;

  constructor(grid: NavGrid, seed: number | string = 'ossuan', readonly events: EventBus = bus) {
    this.grid = grid;
    this.rng = new Rng(seed);
  }

  // --- Actor lifecycle ---------------------------------------------------

  add(actor: Actor): Actor {
    this.actors.push(actor);
    this.byId.set(actor.id, actor);
    this.events.emit('ENTITY_SPAWNED', { actor });
    return actor;
  }

  get(id: number | null): Actor | undefined {
    return id === null ? undefined : this.byId.get(id);
  }

  /** Removes corpses that have finished fading, and dead transients. */
  prune(corpseLifetime = 12): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i]!;
      if (!a.alive && a.deadFor > corpseLifetime && a.faction !== 'player') {
        this.actors.splice(i, 1);
        this.byId.delete(a.id);
      }
    }
  }

  // --- Spatial queries ---------------------------------------------------

  private cellKey(x: number, y: number): number {
    // Pack two 16-bit cell coords into one number.
    const cx = Math.floor(x / this.cellSize) + 32768;
    const cy = Math.floor(y / this.cellSize) + 32768;
    return cx * 65536 + cy;
  }

  private rebuildHash(): void {
    this.hash.clear();
    for (const a of this.actors) {
      if (!a.alive) continue;
      const key = this.cellKey(a.x, a.y);
      let list = this.hash.get(key);
      if (!list) { list = []; this.hash.set(key, list); }
      list.push(a);
    }
  }

  /** Candidate actors within `radius` of a point, using the spatial hash. */
  private candidates(x: number, y: number, radius: number): Actor[] {
    const out: Actor[] = [];
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const list = this.hash.get(
          (cx + dx + 32768) * 65536 + (cy + dy + 32768),
        );
        if (list) out.push(...list);
      }
    }
    return out;
  }

  private passes(a: Actor, opts: WorldQueryOptions, x: number, y: number): boolean {
    if (!opts.includeDead && !a.alive) return false;
    if (opts.excludeId !== undefined && a.id === opts.excludeId) return false;
    if (opts.hostileTo && !isHostile(opts.hostileTo, a.faction)) return false;
    if (opts.requireLineOfSight && !this.grid.lineOfSight(x, y, a.x, a.y)) return false;
    return true;
  }

  actorsInRadius(x: number, y: number, radius: number, opts: WorldQueryOptions = {}): Actor[] {
    const out: Actor[] = [];
    for (const a of this.candidates(x, y, radius + 2)) {
      if (!this.passes(a, opts, x, y)) continue;
      // Include the target's own radius: a big enemy is hit by an edge clip.
      const reach = radius + a.radius;
      if (dist2(x, y, a.x, a.y) <= reach * reach) out.push(a);
    }
    return out;
  }

  /** Cone query used by every melee arc attack (§9 soft targeting). */
  actorsInArc(
    x: number, y: number, facing: number, radius: number, halfAngle: number,
    opts: WorldQueryOptions = {},
  ): Actor[] {
    const out: Actor[] = [];
    for (const a of this.candidates(x, y, radius + 2)) {
      if (!this.passes(a, opts, x, y)) continue;
      // Generous: a target counts if its body edge is inside the cone, which
      // stops hits from "missing" a target that visually overlaps the swing.
      const d = dist(x, y, a.x, a.y);
      if (d > radius + a.radius) continue;
      const widen = d > 0.001 ? Math.asin(clamp(a.radius / Math.max(d, a.radius), 0, 1)) : Math.PI;
      if (inCone(x, y, facing, a.x, a.y, radius + a.radius, halfAngle + widen)) out.push(a);
    }
    return out;
  }

  /** Rectangle-along-a-direction query, for thrusts and beams. */
  actorsInLine(
    x: number, y: number, facing: number, length: number, width: number,
    opts: WorldQueryOptions = {},
  ): Actor[] {
    const out: Actor[] = [];
    const dirX = Math.cos(facing);
    const dirY = Math.sin(facing);
    const half = width * 0.5;
    for (const a of this.candidates(x + dirX * length * 0.5, y + dirY * length * 0.5, length)) {
      if (!this.passes(a, opts, x, y)) continue;
      const rx = a.x - x;
      const ry = a.y - y;
      const along = rx * dirX + ry * dirY;
      if (along < -a.radius || along > length + a.radius) continue;
      const across = Math.abs(-rx * dirY + ry * dirX);
      if (across <= half + a.radius) out.push(a);
    }
    return out;
  }

  nearest(x: number, y: number, radius: number, opts: WorldQueryOptions = {}): Actor | null {
    let best: Actor | null = null;
    let bestD = Infinity;
    for (const a of this.candidates(x, y, radius + 2)) {
      if (!this.passes(a, opts, x, y)) continue;
      const d = dist2(x, y, a.x, a.y);
      if (d < bestD && d <= (radius + a.radius) ** 2) { bestD = d; best = a; }
    }
    return best;
  }

  // --- Damage ------------------------------------------------------------

  /**
   * The single entry point for hurting something. Resolves the packet, emits
   * events, applies knockback, and handles death. Nothing else may touch
   * `actor.health` directly.
   */
  damage(
    attacker: Actor | null, target: Actor, packet: DamagePacket,
    opts: { knockbackFrom?: { x: number; y: number } } = {},
  ): DamageResult {
    if (!target.alive) {
      return {
        total: 0, byType: {}, crit: false, mitigated: 0, killed: false,
        staggered: false, overTime: packet.overTime ?? false,
        dominantType: 'physical', tag: packet.tag ?? null,
      };
    }

    const result = resolveDamage(attacker, target, packet, this.rng);
    if (attacker) target.lastAttackerId = attacker.id;

    if (result.total > 0 || result.staggered) {
      this.events.emit('ENTITY_DAMAGED', {
        actor: target, result, sourceId: attacker?.id ?? null,
      });
    }

    if (packet.knockback && result.total > 0) {
      const from = opts.knockbackFrom ?? (attacker ? { x: attacker.x, y: attacker.y } : null);
      if (from) target.applyKnockback(from.x, from.y, packet.knockback);
    }

    if (result.staggered && target.alive) {
      target.action = 'staggered';
      target.actionTimer = 0.45;
      this.events.emit('ENTITY_STAGGERED', { actor: target, heavy: (packet.staggerPower ?? 0) > 60 });
    }

    if (result.killed) this.killActor(target, attacker?.id ?? null);
    return result;
  }

  killActor(actor: Actor, killerId: number | null): void {
    if (!actor.alive) return;
    actor.kill();
    this.events.emit('ENTITY_DIED', { actor, killerId });
  }

  heal(actor: Actor, amount: number): number {
    if (!actor.alive || amount <= 0) return 0;
    const healed = applyHeal(actor, amount);
    if (healed > 0) this.events.emit('ENTITY_HEALED', { actor, amount: healed });
    return healed;
  }

  // --- Status effects ----------------------------------------------------

  applyStatus(target: Actor, def: Omit<StatusDef, 'sourceId'>, sourceId: number | null): void {
    if (!target.alive) return;
    const existing = target.statuses.filter((s) => s.kind === def.kind);
    const maxStacks = def.maxStacks ?? 1;

    if (existing.length >= maxStacks) {
      // Refresh the weakest instead of stacking past the cap, so a long fight
      // against many attackers cannot produce unbounded DoT.
      let weakest = existing[0]!;
      for (const s of existing) if ((s.dps ?? 0) < (weakest.dps ?? 0)) weakest = s;
      weakest.remaining = Math.max(weakest.remaining, def.duration);
      if ((def.dps ?? 0) > (weakest.dps ?? 0)) weakest.dps = def.dps;
      return;
    }

    const instance = makeStatus({ ...def, sourceId });
    target.statuses.push(instance);
    if (instance.mods?.length) {
      target.stats.addModifiers(instance.mods.map((m) => ({ ...m, source: `status:${instance.uid}` })));
    }
  }

  removeStatus(target: Actor, instance: StatusInstance): void {
    const i = target.statuses.indexOf(instance);
    if (i < 0) return;
    target.statuses.splice(i, 1);
    if (instance.mods?.length) target.stats.removeBySource(`status:${instance.uid}`);
  }

  private tickStatuses(actor: Actor, dt: number): void {
    for (let i = actor.statuses.length - 1; i >= 0; i--) {
      const s = actor.statuses[i]!;
      s.remaining -= dt;
      if (s.dps) {
        s.tickAccumulator += dt;
        while (s.tickAccumulator >= STATUS_TICK) {
          s.tickAccumulator -= STATUS_TICK;
          const source = this.get(s.sourceId ?? null) ?? null;
          this.damage(source, actor, {
            amounts: { [s.damageType ?? 'physical']: s.dps * STATUS_TICK },
            overTime: true,
            tag: s.kind,
          });
          if (!actor.alive) return;
        }
      }
      if (s.remaining <= 0) this.removeStatus(actor, s);
    }
  }

  // --- Projectiles -------------------------------------------------------

  spawnProjectile(p: Omit<Projectile, 'id' | 'active' | 'hitIds'>): Projectile {
    // Reuse a dead slot rather than growing the array forever (§39).
    let proj = this.projectiles.find((q) => !q.active);
    if (!proj) {
      proj = { ...p, id: nextTransientId++, active: true, hitIds: new Set() };
      this.projectiles.push(proj);
      return proj;
    }
    Object.assign(proj, p);
    proj.active = true;
    proj.hitIds.clear();
    return proj;
  }

  private tickProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (!this.grid.worldWalkable(p.x, p.y)) { p.active = false; continue; }

      for (const a of this.actorsInRadius(p.x, p.y, p.radius, {
        hostileTo: p.faction, excludeId: p.ownerId,
      })) {
        if (p.hitIds.has(a.id)) continue;
        p.hitIds.add(a.id);
        const owner = this.get(p.ownerId) ?? null;
        this.damage(owner, a, p.packet, { knockbackFrom: { x: p.x, y: p.y } });
        if (p.applies) this.applyStatus(a, p.applies, p.ownerId);
        this.events.emit('FX_HIT', {
          x: p.x, y: p.y, z: p.z, kind: p.kind, amount: 0, crit: false,
        });
        if (p.pierce <= 0) { p.active = false; break; }
        p.pierce--;
      }
    }
  }

  // --- Ground effects ----------------------------------------------------

  spawnGround(g: Omit<GroundEffect, 'id' | 'active' | 'tickAccumulator'>): GroundEffect {
    let eff = this.ground.find((q) => !q.active);
    if (!eff) {
      eff = { ...g, id: nextTransientId++, active: true, tickAccumulator: 0 };
      this.ground.push(eff);
      return eff;
    }
    Object.assign(eff, g);
    eff.active = true;
    eff.tickAccumulator = 0;
    return eff;
  }

  private tickGround(dt: number): void {
    for (const g of this.ground) {
      if (!g.active) continue;

      if (g.delay > 0) {
        g.delay -= dt;
        if (g.delay > 0) continue;
        // Activation burst: the telegraph has expired, the hit lands now.
        if (g.burst) {
          const owner = this.get(g.ownerId) ?? null;
          for (const a of this.actorsInRadius(g.x, g.y, g.radius, { hostileTo: g.faction })) {
            this.damage(owner, a, g.burst, { knockbackFrom: { x: g.x, y: g.y } });
            if (g.applies) this.applyStatus(a, g.applies, g.ownerId);
          }
          this.events.emit('FX_HIT', {
            x: g.x, y: g.y, z: 0, kind: `${g.kind}_burst`, amount: 0, crit: false,
          });
        }
        if (g.duration <= 0) { g.active = false; continue; }
      }

      g.duration -= dt;
      if (g.duration <= 0) { g.active = false; continue; }

      if (g.dps > 0) {
        g.tickAccumulator += dt;
        while (g.tickAccumulator >= STATUS_TICK) {
          g.tickAccumulator -= STATUS_TICK;
          const owner = this.get(g.ownerId) ?? null;
          for (const a of this.actorsInRadius(g.x, g.y, g.radius, { hostileTo: g.faction })) {
            this.damage(owner, a, {
              amounts: { [g.damageType]: g.dps * STATUS_TICK },
              overTime: true, tag: g.kind,
            });
            if (g.applies) this.applyStatus(a, g.applies, g.ownerId);
          }
        }
      }
    }
  }

  // --- Ground items ------------------------------------------------------

  dropItem(item: ItemInstance, x: number, y: number): GroundItem {
    // A small deterministic scatter so a multi-drop does not stack into one pile.
    const angle = this.rng.range(0, Math.PI * 2);
    const force = this.rng.range(1.4, 2.6);
    const spot = this.grid.nearestWalkable(x, y);
    const ground: GroundItem = {
      item, x: spot.x, y: spot.y, z: 0.9,
      vz: 2.4, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force,
      settled: false, age: 0,
    };
    this.items.push(ground);
    this.events.emit('ITEM_DROPPED', { item, x: ground.x, y: ground.y });
    return ground;
  }

  private tickItems(dt: number): void {
    for (const g of this.items) {
      g.age += dt;
      if (g.settled) continue;
      // Cheap arc so loot lands with a little physicality (§16).
      g.vz -= 11 * dt;
      g.z += g.vz * dt;
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      if (this.grid.worldWalkable(nx, ny)) { g.x = nx; g.y = ny; }
      g.vx *= 0.88;
      g.vy *= 0.88;
      if (g.z <= 0) {
        g.z = 0;
        g.vz = 0;
        g.settled = true;
      }
    }
  }

  pickUp(ground: GroundItem): void {
    const i = this.items.indexOf(ground);
    if (i >= 0) this.items.splice(i, 1);
  }

  itemsNear(x: number, y: number, radius: number): GroundItem[] {
    return this.items.filter((g) => dist2(x, y, g.x, g.y) <= radius * radius);
  }

  // --- Collision ---------------------------------------------------------

  /**
   * Resolves actor-vs-wall and actor-vs-actor overlap.
   *
   * Actors push each other apart rather than blocking, which keeps a pack of
   * five enemies from forming a wall the player cannot get past, while still
   * stopping them occupying the same point (§21 "no deben simplemente correr
   * todos hacia el mismo punto").
   */
  private resolveCollisions(): void {
    for (const a of this.actors) {
      if (!a.alive) continue;
      this.clampToWalkable(a);
    }

    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i]!;
      if (!a.alive) continue;
      for (const b of this.candidates(a.x, a.y, a.radius + 1.2)) {
        if (b.id <= a.id || !b.alive) continue;
        const minDist = a.radius + b.radius;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 >= minDist * minDist || d2 < 1e-8) continue;

        const d = Math.sqrt(d2);
        const overlap = (minDist - d) * 0.5;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        // The player is heavier than most things, so pushing through a crowd
        // feels like shouldering rather than being batted around.
        const aWeight = a.faction === 'player' ? 0.25 : 1;
        const bWeight = b.faction === 'player' ? 0.25 : 1;
        a.x -= nx * overlap * aWeight;
        a.y -= ny * overlap * aWeight;
        b.x += nx * overlap * bWeight;
        b.y += ny * overlap * bWeight;
      }
    }

    for (const a of this.actors) {
      if (a.alive) this.clampToWalkable(a);
    }
  }

  /** Pushes an actor out of unwalkable tiles along each axis independently. */
  private clampToWalkable(a: Actor): void {
    const r = a.radius * 0.9;
    // Test the four cardinal edge points; nudging per-axis lets actors slide
    // along walls instead of sticking to them.
    if (!this.grid.worldWalkable(a.x + r, a.y)) a.x = Math.floor(a.x + r) - r - 0.001;
    if (!this.grid.worldWalkable(a.x - r, a.y)) a.x = Math.ceil(a.x - r) + r + 0.001;
    if (!this.grid.worldWalkable(a.x, a.y + r)) a.y = Math.floor(a.y + r) - r - 0.001;
    if (!this.grid.worldWalkable(a.x, a.y - r)) a.y = Math.ceil(a.y - r) + r + 0.001;

    if (!this.grid.worldWalkable(a.x, a.y)) {
      const spot = this.grid.nearestWalkable(a.x, a.y);
      a.x = spot.x;
      a.y = spot.y;
    }
  }

  // --- Main step ---------------------------------------------------------

  /**
   * Advances the world by one fixed step. Callers (the game loop, or a test)
   * drive actor logic themselves before calling this; `step` handles the parts
   * that are the world's responsibility.
   */
  step(dt: number): void {
    this.time += dt;
    this.rebuildHash();

    for (const a of this.actors) {
      if (!a.alive) { a.deadFor += dt; continue; }
      this.tickStatuses(a, dt);
      if (a.actionTimer > 0) {
        a.actionTimer -= dt;
        if (a.actionTimer <= 0 && a.action === 'staggered') a.action = 'idle';
      }
      // Passive regeneration.
      const hr = a.stats.get('healthRegen');
      if (hr > 0 && a.health < a.maxHealth) a.health = Math.min(a.maxHealth, a.health + hr * dt);
    }

    this.resolveCollisions();
    this.tickProjectiles(dt);
    this.tickGround(dt);
    this.tickItems(dt);
    this.rebuildHash();
  }

  /** Wipes transient state; used when travelling between zones. */
  clearTransients(): void {
    for (const p of this.projectiles) p.active = false;
    for (const g of this.ground) g.active = false;
    this.items.length = 0;
  }
}

/** Faction hostility table. Neutrals fight nobody. */
export function isHostile(a: Faction, b: Faction): boolean {
  if (a === 'neutral' || b === 'neutral') return false;
  return a !== b;
}
