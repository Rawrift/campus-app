/**
 * Zone content types.
 *
 * A zone is: a tile grid, a list of props (pure set dressing plus environmental
 * storytelling, §59), a list of interactables, spawn instructions, and the
 * atmosphere settings the renderer uses (§28).
 */

import type { NavGrid } from '@/sim/world';
import type { Rng } from '@/core/rng';

/** Every prop the procedural mesh library can build (§42 — all code-generated). */
export type PropKind =
  | 'gravestone' | 'grave_cross' | 'bones' | 'skull_pile' | 'ossuary_niche'
  | 'barrel' | 'crate' | 'sack' | 'basket'
  | 'cart' | 'cart_wrecked' | 'wheel'
  | 'table' | 'table_set' | 'chair' | 'bed' | 'bench'
  | 'corpse' | 'corpse_covered' | 'animal_corpse'
  | 'altar' | 'shrine' | 'candles' | 'brazier' | 'torch' | 'lantern'
  | 'well' | 'fence' | 'fence_broken' | 'gate'
  | 'tree_dead' | 'tree_sick' | 'stump' | 'bush_dead' | 'reeds'
  | 'rock' | 'rubble' | 'pillar' | 'pillar_broken' | 'arch'
  | 'bell' | 'bell_broken' | 'bell_rope'
  | 'banner' | 'ritual_mark' | 'barricade' | 'ladder'
  | 'anvil' | 'forge' | 'stall' | 'hay'
  | 'house' | 'house_burnt' | 'hut' | 'chapel'
  | 'stairs_down' | 'bridge' | 'pit';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Radians. */
  rotation: number;
  scale: number;
  /** Deterministic per-prop variation seed for the mesh builder. */
  variant: number;
  /** Emits light — the renderer attaches a point light. */
  light?: { colour: number; intensity: number; range: number; flicker?: number };
  /** Hover text, used sparingly for environmental storytelling. */
  note?: string;
}

export type InteractableKind =
  | 'chest' | 'stash' | 'vendor' | 'smith' | 'shrine' | 'exit' | 'lore' | 'lever';

export interface Interactable {
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  label: string;
  /** For exits: the zone to travel to and where to arrive. */
  targetZone?: string;
  targetX?: number;
  targetY?: number;
  /** For chests: how good the contents are. */
  lootRolls?: number;
  lootRarityBonus?: number;
  itemLevel?: number;
  /** One-shot interactables (chests, lore notes) record that they are spent. */
  used?: boolean;
  /** Long-form text for lore objects (§59 — optional, never blocking). */
  text?: string;
  radius?: number;
}

export interface SpawnInstruction {
  defId: string;
  x: number;
  y: number;
  count?: number;
  spread?: number;
  eliteCount?: number;
  level?: number;
  /** Only spawns once the player comes within this distance (§26 pacing). */
  triggerRadius?: number;
  /** Named group, so the dungeon can gate a door on "pack cleared". */
  group?: string;
}

/** Atmosphere settings consumed by the renderer (§28). */
export interface Ambience {
  /** Hemisphere/ambient light. */
  readonly ambientColour: number;
  readonly ambientIntensity: number;
  /** Key directional light — deliberately weak indoors. */
  readonly sunColour: number;
  readonly sunIntensity: number;
  readonly sunAngle: readonly [number, number];
  readonly fogColour: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly groundColour: number;
  readonly wallColour: number;
  /** Interior zones get no sky and a much tighter fog. */
  readonly interior: boolean;
  /**
   * Height of blocking geometry, in world units.
   *
   * Indoors this is real architecture and wants to be tall. Outdoors the same
   * value turns every field boundary into a wall that shadows the whole zone,
   * so the exterior regions use low banks and hedgerows instead.
   */
  readonly wallHeight: number;
  /** Drives the procedural ambient audio bed (§31). */
  readonly ambienceTrack: 'wind' | 'crypt' | 'village';
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly width: number;
  readonly height: number;
  readonly ambience: Ambience;
  /** Whether enemies may spawn here at all (the hub is safe-ish). */
  readonly hostile: boolean;
  /** Builds the tile grid. Must be deterministic given `rng`. */
  build(grid: NavGrid, rng: Rng): void;
  /** Produces props after the grid is built. */
  decorate(grid: NavGrid, rng: Rng): Prop[];
  interactables(): Interactable[];
  spawns(rng: Rng, grid: NavGrid): SpawnInstruction[];
  readonly playerStart: { readonly x: number; readonly y: number };
}

/** Scatters props on walkable tiles, avoiding the given exclusion points. */
export function scatter(
  grid: NavGrid, rng: Rng, kinds: PropKind[], count: number,
  area: { x: number; y: number; r: number },
  opts: { scaleMin?: number; scaleMax?: number; avoid?: { x: number; y: number; r: number }[] } = {},
): Prop[] {
  const out: Prop[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * area.r;
    const x = area.x + Math.cos(a) * d;
    const y = area.y + Math.sin(a) * d;
    if (!grid.worldWalkable(x, y)) continue;
    if (opts.avoid?.some((z) => (x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r)) continue;
    out.push({
      kind: rng.pick(kinds),
      x, y,
      rotation: rng.range(0, Math.PI * 2),
      scale: rng.range(opts.scaleMin ?? 0.85, opts.scaleMax ?? 1.15),
      variant: rng.int(0, 999),
    });
  }
  return out;
}

/** Places props along the inside face of walls — shelves, niches, banners. */
export function lineWalls(
  grid: NavGrid, rng: Rng, kinds: PropKind[], area: { x: number; y: number; r: number },
  chance = 0.12,
): Prop[] {
  const out: Prop[] = [];
  const r = Math.ceil(area.r);
  for (let y = Math.floor(area.y - r); y <= area.y + r; y++) {
    for (let x = Math.floor(area.x - r); x <= area.x + r; x++) {
      if (!grid.walkable(x, y)) continue;
      if ((x - area.x) ** 2 + (y - area.y) ** 2 > area.r * area.r) continue;
      // Only tiles that actually touch a wall, and only sometimes.
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const wall = dirs.find(([dx, dy]) => grid.opaque(x + dx, y + dy));
      if (!wall || !rng.chance(chance)) continue;
      out.push({
        kind: rng.pick(kinds),
        x: x + 0.5 + wall[0] * 0.34,
        y: y + 0.5 + wall[1] * 0.34,
        rotation: Math.atan2(-wall[1], -wall[0]),
        scale: rng.range(0.9, 1.1),
        variant: rng.int(0, 999),
      });
    }
  }
  return out;
}

/**
 * Finds the centre of the road at a given row.
 *
 * The road is carved with a deterministic wander, so hand-typing coordinates
 * along it is fragile — a tweak to the wander silently moves encounters off the
 * path. Zones therefore express intent ("on the road, at this height") and let
 * the geometry answer where that actually is.
 */
export function onRoad(grid: NavGrid, y: number, searchFrom = 0): { x: number; y: number } {
  const row = Math.floor(y);
  let best = -1;
  let bestDist = Infinity;
  for (let x = 0; x < grid.width; x++) {
    if (grid.get(x, row) !== 3 /* Tile.Path */) continue;
    const d = Math.abs(x - (searchFrom || grid.width / 2));
    if (d < bestDist) { bestDist = d; best = x; }
  }
  if (best < 0) {
    const spot = grid.nearestWalkable(searchFrom || grid.width / 2, y, 12);
    return { x: spot.x, y: spot.y };
  }
  return { x: best + 0.5, y: row + 0.5 };
}

/** Snaps an authored point onto walkable ground, preserving design intent. */
export function onGround(grid: NavGrid, x: number, y: number): { x: number; y: number } {
  return grid.worldWalkable(x, y) ? { x, y } : grid.nearestWalkable(x, y, 8);
}

/** A torch with its light, used everywhere the player needs a hot spot (§28). */
/*
 * Light intensities are in three.js's physical units, where a point light
 * contributes intensity / distance^2. A torch therefore needs an intensity in
 * the tens to be visible three metres away; the single-digit values that read
 * naturally to a human are effectively unlit.
 */
export function torch(x: number, y: number, variant = 0): Prop {
  return {
    kind: 'torch', x, y, rotation: 0, scale: 1, variant,
    light: { colour: 0xff9a44, intensity: 34, range: 13, flicker: 0.18 },
  };
}

export function brazier(x: number, y: number, variant = 0): Prop {
  return {
    kind: 'brazier', x, y, rotation: 0, scale: 1, variant,
    light: { colour: 0xffa855, intensity: 52, range: 17, flicker: 0.22 },
  };
}
