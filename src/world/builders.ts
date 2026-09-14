/**
 * Level construction primitives.
 *
 * Zones are *authored* (§27: "procedural no debe utilizarse como excusa para
 * diseño mediocre") but written as composed carving operations rather than
 * hand-typed tile arrays, because a 90x90 tile array is unreadable and
 * unrevisable. The same primitives are what a room-and-connector generator
 * would call later, so the architecture for §27 is already in place.
 */

import { NavGrid, Tile } from '@/sim/world';
import type { Rng } from '@/core/rng';

export interface Rect {
  x: number; y: number; w: number; h: number;
}

export function fillRect(grid: NavGrid, r: Rect, tile: Tile): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) grid.set(x, y, tile);
  }
}

/** Carves a room: floor inside, walls on the perimeter. */
export function carveRoom(grid: NavGrid, r: Rect, floor: Tile = Tile.Floor): void {
  fillRect(grid, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, Tile.Wall);
  fillRect(grid, r, floor);
}

/** Carves an L-shaped corridor between two points. */
export function carveCorridor(
  grid: NavGrid, x0: number, y0: number, x1: number, y1: number,
  width = 2, floor: Tile = Tile.Floor, horizontalFirst = true,
): void {
  const half = Math.floor(width / 2);
  const hSeg = (xa: number, xb: number, y: number) => {
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
      for (let d = -half; d <= half; d++) {
        if (grid.get(x, y + d) !== Tile.Floor) grid.set(x, y + d, floor);
      }
    }
  };
  const vSeg = (ya: number, yb: number, x: number) => {
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) {
      for (let d = -half; d <= half; d++) {
        if (grid.get(x + d, y) !== Tile.Floor) grid.set(x + d, y, floor);
      }
    }
  };
  if (horizontalFirst) { hSeg(x0, x1, y0); vSeg(y0, y1, x1); }
  else { vSeg(y0, y1, x0); hSeg(x0, x1, y1); }
}

/** Surrounds every walkable tile that touches the void with a wall. */
export function encloseWalls(grid: NavGrid): void {
  const additions: [number, number][] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y) !== Tile.Void) continue;
      let touchesFloor = false;
      for (let dy = -1; dy <= 1 && !touchesFloor; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (grid.walkable(x + dx, y + dy)) { touchesFloor = true; break; }
        }
      }
      if (touchesFloor) additions.push([x, y]);
    }
  }
  for (const [x, y] of additions) grid.set(x, y, Tile.Wall);
}

/** An organic blob of floor, for clearings and caves. */
export function carveBlob(
  grid: NavGrid, cx: number, cy: number, radius: number, rng: Rng, floor: Tile = Tile.Floor,
): void {
  // Sum of a few offset circles reads as irregular without a noise function.
  const lobes = 3 + Math.floor(rng.next() * 3);
  const centres: [number, number, number][] = [[cx, cy, radius]];
  for (let i = 0; i < lobes; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(radius * 0.3, radius * 0.7);
    centres.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, radius * rng.range(0.5, 0.85)]);
  }
  const maxR = radius * 1.8;
  for (let y = Math.floor(cy - maxR); y <= Math.ceil(cy + maxR); y++) {
    for (let x = Math.floor(cx - maxR); x <= Math.ceil(cx + maxR); x++) {
      for (const [ox, oy, orad] of centres) {
        if ((x - ox) ** 2 + (y - oy) ** 2 <= orad * orad) {
          grid.set(x, y, floor);
          break;
        }
      }
    }
  }
}

/** A winding road between two points, used for the outdoor region. */
export function carveRoad(
  grid: NavGrid, x0: number, y0: number, x1: number, y1: number,
  rng: Rng, width = 3,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Sine wander plus jitter, so the road has character but always connects.
    const wobble = Math.sin(t * Math.PI * 2.2) * 4 + rng.range(-1.2, 1.2);
    const nx = x0 + (x1 - x0) * t;
    const ny = y0 + (y1 - y0) * t;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    points.push({ x: nx + (-dy / len) * wobble, y: ny + (dx / len) * wobble });
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segs = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      stamp(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, width * 0.5, Tile.Path);
    }
  }
  return points;
}

/** Paints a filled circle of tiles. */
export function stamp(grid: NavGrid, cx: number, cy: number, radius: number, tile: Tile): void {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) grid.set(x, y, tile);
    }
  }
}

/**
 * Punches a doorway through a wall at (x, y), clearing `width` tiles along the
 * given axis. Zones use this instead of leaving gaps, so walls can be built
 * solid first and opened deliberately.
 */
export function carveDoor(grid: NavGrid, x: number, y: number, axis: 'h' | 'v', width = 2): void {
  for (let i = 0; i < width; i++) {
    if (axis === 'h') grid.set(x + i, y, Tile.Floor);
    else grid.set(x, y + i, Tile.Floor);
  }
}

/** Verifies every walkable tile is reachable from a start point (§53). */
export function reachableTiles(grid: NavGrid, sx: number, sy: number): Set<number> {
  const seen = new Set<number>();
  const start = Math.floor(sy) * grid.width + Math.floor(sx);
  if (!grid.walkable(Math.floor(sx), Math.floor(sy))) return seen;
  const stack = [start];
  seen.add(start);
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.walkable(nx, ny)) continue;
      const nIndex = ny * grid.width + nx;
      if (seen.has(nIndex)) continue;
      seen.add(nIndex);
      stack.push(nIndex);
    }
  }
  return seen;
}

/** Counts walkable tiles, for the connectivity assertion in the zone tests. */
export function countWalkable(grid: NavGrid): number {
  let n = 0;
  for (let i = 0; i < grid.tiles.length; i++) {
    const t = grid.tiles[i] as Tile;
    if (t === Tile.Floor || t === Tile.Path || t === Tile.Mire) n++;
  }
  return n;
}
