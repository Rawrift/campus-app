/**
 * A* on the navigation grid, used for the player's click-to-move (§9, §44).
 *
 * Enemies deliberately do *not* use this — they steer, because an ARPG pack
 * that paths perfectly around every corner reads as robotic, and the node
 * budget matters when thirty of them are active. The player, by contrast, must
 * be able to click across a room and have the character actually get there.
 */

import type { NavGrid } from './world';

interface Node {
  index: number;
  g: number;
  f: number;
  parent: number;
}

const MAX_NODES = 3000;

/** Straight-line (octile) heuristic — admissible for 8-way movement. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Finds a tile path from (sx, sy) to (gx, gy) in world coordinates.
 * Returns world-space waypoints (tile centres), already string-pulled, or an
 * empty array when no path exists within the node budget.
 */
export function findPath(
  grid: NavGrid, sx: number, sy: number, gx: number, gy: number,
): { x: number; y: number }[] {
  const startX = Math.floor(sx);
  const startY = Math.floor(sy);
  let goalX = Math.floor(gx);
  let goalY = Math.floor(gy);

  if (!grid.walkable(goalX, goalY)) {
    const spot = grid.nearestWalkable(gx, gy, 6);
    goalX = Math.floor(spot.x);
    goalY = Math.floor(spot.y);
    if (!grid.walkable(goalX, goalY)) return [];
  }
  if (startX === goalX && startY === goalY) return [];
  if (!grid.walkable(startX, startY)) return [];

  const w = grid.width;
  const startIndex = startY * w + startX;
  const goalIndex = goalY * w + goalX;

  const open: Node[] = [{ index: startIndex, g: 0, f: heuristic(startX, startY, goalX, goalY), parent: -1 }];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startIndex, 0]]);
  const closed = new Set<number>();
  let expanded = 0;

  while (open.length > 0 && expanded++ < MAX_NODES) {
    // Linear scan for the lowest f. The grids here are small enough that a
    // binary heap would cost more in complexity than it saves.
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestI]!.f) bestI = i;
    }
    const current = open.splice(bestI, 1)[0]!;
    if (current.index === goalIndex) {
      return reconstruct(cameFrom, current.index, w, grid);
    }
    closed.add(current.index);

    const cx = current.index % w;
    const cy = Math.floor(current.index / w);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.walkable(nx, ny)) continue;
        // No corner-cutting: a diagonal step needs both orthogonal neighbours
        // clear, otherwise the character clips through wall corners.
        if (dx !== 0 && dy !== 0 && (!grid.walkable(cx + dx, cy) || !grid.walkable(cx, cy + dy))) continue;

        const nIndex = ny * w + nx;
        if (closed.has(nIndex)) continue;

        const step = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1;
        const tentative = current.g + step;
        if (tentative >= (gScore.get(nIndex) ?? Infinity)) continue;

        cameFrom.set(nIndex, current.index);
        gScore.set(nIndex, tentative);
        const f = tentative + heuristic(nx, ny, goalX, goalY);
        const existing = open.find((n) => n.index === nIndex);
        if (existing) {
          existing.g = tentative;
          existing.f = f;
        } else {
          open.push({ index: nIndex, g: tentative, f, parent: current.index });
        }
      }
    }
  }
  return [];
}

function reconstruct(
  cameFrom: Map<number, number>, goal: number, w: number, grid: NavGrid,
): { x: number; y: number }[] {
  const tiles: number[] = [goal];
  let current = goal;
  let guard = 0;
  while (cameFrom.has(current) && guard++ < 4000) {
    current = cameFrom.get(current)!;
    tiles.push(current);
  }
  tiles.reverse();

  // String-pulling: drop any waypoint we can see past, so the character walks
  // in long straight lines instead of stair-stepping along the tile grid.
  const points = tiles.map((t) => ({ x: (t % w) + 0.5, y: Math.floor(t / w) + 0.5 }));
  const out: { x: number; y: number }[] = [];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!grid.lineOfSight(points[anchor]!.x, points[anchor]!.y, points[i]!.x, points[i]!.y)) {
      out.push(points[i - 1]!);
      anchor = i - 1;
    }
  }
  if (points.length > 1) out.push(points[points.length - 1]!);
  return out;
}
