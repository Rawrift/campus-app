/**
 * Entities and actors — the simulation's only mutable game objects.
 *
 * Deliberately free of any rendering concept. The renderer keeps its own view
 * objects keyed by `Actor.id` and reads position/state each frame (§37, §49).
 */

import { StatBlock, type StatTable } from './stats';
import { clamp, damp, rotateTowards, TAU } from '@/core/math';
import type { StatusInstance } from './status';

export type Faction = 'player' | 'hostile' | 'neutral';

/** What the actor is doing right now — gates movement and input (§8). */
export type ActionState =
  | 'idle' | 'moving' | 'windup' | 'strike' | 'recover'
  | 'casting' | 'staggered' | 'dodging' | 'dead';

let nextEntityId = 1;
export function resetEntityIds(): void {
  nextEntityId = 1;
}

export class Actor {
  readonly id = nextEntityId++;

  // --- Transform (simulation is 2D on the XZ plane; `height` is cosmetic) ---
  x = 0;
  y = 0;
  facing = 0;
  /** Current planar velocity, in world units per second. */
  vx = 0;
  vy = 0;
  /** Collision radius, also used for melee reach and for separation steering. */
  radius = 0.42;
  /** Visual height, used by the renderer to place health bars and hit sparks. */
  height = 1.8;

  // --- Vitals --------------------------------------------------------------
  readonly stats: StatBlock;
  health = 1;
  resource = 0;
  level = 1;
  alive = true;
  /** Seconds since death, so corpses can fade rather than pop (§8). */
  deadFor = 0;

  // --- Combat state --------------------------------------------------------
  faction: Faction = 'hostile';
  action: ActionState = 'idle';
  /** Seconds left in the current action phase. */
  actionTimer = 0;
  staggerMeter = 0;
  staggerThreshold = 100;
  statuses: StatusInstance[] = [];
  /** Externally applied impulse (knockback), decays quickly. */
  impulseX = 0;
  impulseY = 0;
  /** Set by the controller each tick: desired movement direction, length 0..1. */
  inputX = 0;
  inputY = 0;
  /** Target the actor is currently committed to, if any. */
  targetId: number | null = null;
  /** Who last damaged this actor — used for kill credit. */
  lastAttackerId: number | null = null;

  // --- Identity ------------------------------------------------------------
  name = 'actor';
  /** Content ID (enemy def, archetype) — stable across saves. */
  defId = '';
  /** Elite affix ids, empty for normal enemies. */
  eliteAffixes: string[] = [];
  isBoss = false;

  /** Interpolation snapshot: previous fixed-step position, for smooth render. */
  prevX = 0;
  prevY = 0;
  prevFacing = 0;

  constructor(base: StatTable = {}) {
    this.stats = new StatBlock(base);
    this.health = this.stats.get('maxHealth');
    this.resource = this.stats.get('maxResource');
  }

  get maxHealth(): number {
    return this.stats.get('maxHealth');
  }

  get healthFraction(): number {
    return clamp(this.health / Math.max(1, this.maxHealth), 0, 1);
  }

  get maxResource(): number {
    return this.stats.get('maxResource');
  }

  get resourceFraction(): number {
    const max = this.maxResource;
    return max <= 0 ? 0 : clamp(this.resource / max, 0, 1);
  }

  /** True while the actor cannot start a new action. */
  get busy(): boolean {
    return this.action === 'windup' || this.action === 'strike' ||
           this.action === 'recover' || this.action === 'casting' ||
           this.action === 'staggered' || this.action === 'dodging';
  }

  /** True while the actor may not move under its own power. */
  get rooted(): boolean {
    if (this.action === 'windup' || this.action === 'strike' || this.action === 'staggered') return true;
    return this.statuses.some((s) => s.kind === 'root');
  }

  hasStatus(kind: string): boolean {
    return this.statuses.some((s) => s.kind === kind);
  }

  /** Stores the pre-step transform so the renderer can interpolate. */
  snapshot(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevFacing = this.facing;
  }

  /**
   * Integrates movement with real acceleration and deceleration.
   *
   * This is the whole of §7 "no floaty / nunca debe parecer patinar": the actor
   * accelerates towards its input direction rather than snapping to it, and the
   * renderer drives the walk animation from actual speed, so the feet always
   * match the ground.
   */
  integrate(dt: number, accel = 38, friction = 26): void {
    const speed = this.stats.get('moveSpeed');
    const wantX = this.rooted ? 0 : this.inputX * speed;
    const wantY = this.rooted ? 0 : this.inputY * speed;

    // Accelerating and braking use different rates: quick to start, slightly
    // slower to stop, which is what reads as weight.
    const rate = (wantX === 0 && wantY === 0) ? friction : accel;
    this.vx += clamp(wantX - this.vx, -rate * dt, rate * dt);
    this.vy += clamp(wantY - this.vy, -rate * dt, rate * dt);

    this.x += (this.vx + this.impulseX) * dt;
    this.y += (this.vy + this.impulseY) * dt;

    // Knockback decays fast so it punctuates a hit without stealing control.
    this.impulseX = damp(this.impulseX, 0, 0.0001, dt);
    this.impulseY = damp(this.impulseY, 0, 0.0001, dt);
    if (Math.abs(this.impulseX) < 0.01) this.impulseX = 0;
    if (Math.abs(this.impulseY) < 0.01) this.impulseY = 0;
  }

  /** Current planar speed in units/second, including knockback. */
  get speed(): number {
    return Math.hypot(this.vx + this.impulseX, this.vy + this.impulseY);
  }

  /** Turns towards a world point at a limited rate (no instant snapping). */
  faceTowards(tx: number, ty: number, dt: number, turnRate = 12): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    if (dx * dx + dy * dy < 1e-6) return;
    this.facing = rotateTowards(this.facing, Math.atan2(dy, dx), turnRate * dt);
  }

  /** Instantly faces a point — used on attack commit, where snapping reads as intent. */
  snapFacing(tx: number, ty: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    if (dx * dx + dy * dy < 1e-6) return;
    this.facing = Math.atan2(dy, dx);
  }

  applyKnockback(fromX: number, fromY: number, force: number): void {
    if (force <= 0) return;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.impulseX += (dx / len) * force;
    this.impulseY += (dy / len) * force;
  }

  /** Wraps facing into [0, TAU) — keeps debug output readable. */
  normaliseFacing(): void {
    this.facing = ((this.facing % TAU) + TAU) % TAU;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.action = 'dead';
    this.vx = this.vy = 0;
    this.inputX = this.inputY = 0;
    this.statuses.length = 0;
  }
}
