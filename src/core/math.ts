/** Small maths helpers shared by simulation and renderer. Pure, no deps. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp01((v - a) / (b - a));
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Framerate-independent exponential approach. `smoothing` is the fraction of
 * the gap still remaining after one second, so 0.001 is snappy and 0.3 is lazy.
 * Used by the camera (§6 "smoothing configurable") and by stat interpolation.
 */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(current, target, 1 - Math.pow(smoothing, dt));
}

/** Shortest signed angular difference, in radians, wrapped to [-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotates `from` towards `to` by at most `maxStep` radians. */
export function rotateTowards(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Moves a value towards a target by a fixed maximum step (no overshoot). */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** A simple 2-vector used all over the simulation. The sim is strictly 2D+height. */
export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function normalise(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** True when `point` lies within `radius` of the cone at `origin` facing `facing`. */
export function inCone(
  originX: number, originY: number, facing: number,
  pointX: number, pointY: number,
  radius: number, halfAngle: number,
): boolean {
  const dx = pointX - originX;
  const dy = pointY - originY;
  if (dx * dx + dy * dy > radius * radius) return false;
  return Math.abs(angleDelta(facing, Math.atan2(dy, dx))) <= halfAngle;
}
