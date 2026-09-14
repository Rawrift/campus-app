/**
 * Builds the level mesh from the navigation grid.
 *
 * Everything is merged into a handful of geometries rather than one mesh per
 * tile: a 86x82 outdoor zone is ~7000 tiles, and at one draw call each the
 * frame budget would be gone before a single character was drawn (§39).
 *
 * Wall faces are only emitted where a wall touches walkable ground, so the
 * interior of a solid rock mass costs nothing.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { NavGrid, Tile } from '@/sim/world';
import { material } from './materials';
import type { Ambience } from '@/world/zoneDef';


interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newBuffers(): Buffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

/**
 * Large-scale ground mottling, baked into vertex colours.
 *
 * A floor's geometric normal never varies, so lighting alone cannot break up a
 * large flat surface — every square metre shades identically and the eye reads
 * a plane. Tinting the mesh itself with slow noise gives the ground patches of
 * drier and wetter earth at a scale the texture cannot reach, which is what
 * stops a courtyard looking like poured concrete.
 */
function groundTint(x: number, z: number, rng: Rng): number {
  void rng;
  const a = Math.sin(x * 0.21) * Math.cos(z * 0.17);
  const b = Math.sin((x + z) * 0.078 + 1.7);
  const c = Math.sin(x * 0.043 - z * 0.061);
  return 0.78 + (a * 0.09 + b * 0.14 + c * 0.16);
}

/**
 * Appends one quad, wound to face the supplied normal.
 *
 * The triangle order is derived rather than trusted. Writing four corners out
 * by hand in the wrong rotational direction is easy and the result is silent:
 * with `side: FrontSide` the quad is back-face culled, so an entire terrain
 * layer simply stops drawing and the background shows through where it should
 * be. That does not look like a missing mesh, it looks like a flat untextured
 * floor -- which is exactly how every ground surface in the game rendered
 * until this was found. Deriving the winding here means no call site can
 * reintroduce it.
 */
function quad(
  b: Buffers,
  a: [number, number, number], bb: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  normal: [number, number, number],
  uvScale = 1, uOffset = 0, vOffset = 0,
  tints: [number, number, number, number] = [1, 1, 1, 1],
  vScale = uvScale,
): void {
  const base = b.positions.length / 3;
  for (const p of [a, bb, c, d]) b.positions.push(p[0], p[1], p[2]);
  for (let i = 0; i < 4; i++) b.normals.push(normal[0], normal[1], normal[2]);
  for (const t of tints) b.colors.push(t, t, t);
  b.uvs.push(
    uOffset, vOffset,
    uOffset + uvScale, vOffset,
    uOffset + uvScale, vOffset + vScale,
    uOffset, vOffset + vScale,
  );
  if (faces(a, bb, c, normal)) {
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

/** Whether (a, b, c) in that order winds counter-clockwise seen from `normal`. */
export function faces(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  normal: readonly [number, number, number],
): boolean {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return nx * normal[0] + ny * normal[1] + nz * normal[2] >= 0;
}

/**
 * How many world tiles one texture repeat spans.
 *
 * At 1 tile per repeat the 256px texture covers about 20 screen pixels at the
 * game's camera distance, so every surface detail falls below a pixel and the
 * ground renders as flat grey. Spreading each repeat over 4 tiles puts the
 * grain, gravel and mortar joints at a size the player can actually see.
 */
const TILES_PER_TEXTURE = 4;

function toGeometry(b: Buffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geo.setIndex(b.indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface TerrainResult {
  group: THREE.Group;
  dispose(): void;
}

/**
 * @param grid the zone's navigation grid
 * @param ambience colour and interior/exterior settings for this zone
 */
export function buildTerrain(grid: NavGrid, ambience: Ambience, seed: number): TerrainResult {
  const group = new THREE.Group();
  const rng = new Rng(seed);
  const WALL_HEIGHT = ambience.wallHeight;

  const floorB = newBuffers();
  const pathB = newBuffers();
  const mireB = newBuffers();
  const wallTopB = newBuffers();
  const wallSideB = newBuffers();
  const surroundB = newBuffers();

  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const tile = grid.get(tx, ty);
      const x0 = tx;
      const x1 = tx + 1;
      const z0 = ty;
      const z1 = ty + 1;

      if (tile === Tile.Floor || tile === Tile.Path || tile === Tile.Mire) {
        // The floor is one continuous surface. Jittering each tile's height
        // independently opens a hairline crack along every shared edge, and a
        // regular grid of cracks is far more visible than a perfectly flat
        // floor is boring; the relief map and the vertex mottling are what
        // stop it reading as a table. Only the mire steps down, and it does so
        // as a whole.
        const h = tile === Tile.Mire ? -0.06 : 0;
        const target = tile === Tile.Path ? pathB : tile === Tile.Mire ? mireB : floorB;
        const u = 1 / TILES_PER_TEXTURE;
        quad(
          target,
          [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1],
          [0, 1, 0], u, tx * u, ty * u,
          [
            groundTint(x0, z0, rng), groundTint(x1, z0, rng),
            groundTint(x1, z1, rng), groundTint(x0, z1, rng),
          ],
        );
        continue;
      }

      if (tile === Tile.Void) {
        /*
         * Terrain beyond the playable area.
         *
         * Outdoors this has to exist: the boundary is a low bank, not a
         * three-metre wall, so the camera looks straight over it. Without
         * ground out there the world visibly ends in flat black holes. It is
         * emitted at the same height as the floor so there is no seam to hide,
         * with a darker, rougher material so it still reads as off-limits.
         *
         * Interiors skip it — the ossuary is underground, and blackness beyond
         * its walls is correct.
         */
        if (ambience.interior) continue;
        const u = 1 / TILES_PER_TEXTURE;
        quad(
          surroundB,
          [x0, -0.05, z0], [x1, -0.05, z0], [x1, -0.05, z1], [x0, -0.05, z1],
          [0, 1, 0], u, tx * u, ty * u,
          [
            groundTint(x0, z0, rng), groundTint(x1, z0, rng),
            groundTint(x1, z1, rng), groundTint(x0, z1, rng),
          ],
        );
        continue;
      }

      if (tile !== Tile.Wall && tile !== Tile.Prop) continue;

      // Wall top, only when it is visible from above (always, at this camera).
      const u = 1 / TILES_PER_TEXTURE;
      quad(
        wallTopB,
        [x0, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z1], [x0, WALL_HEIGHT, z1],
        [0, 1, 0], u, tx * u, ty * u,
      );

      // Sides, only where they face walkable ground.
      const faces: [number, number, [number, number, number][], [number, number, number]][] = [
        [0, -1, [[x0, 0, z0], [x0, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z0], [x1, 0, z0]], [0, 0, -1]],
        [0, 1, [[x1, 0, z1], [x1, WALL_HEIGHT, z1], [x0, WALL_HEIGHT, z1], [x0, 0, z1]], [0, 0, 1]],
        [-1, 0, [[x0, 0, z1], [x0, WALL_HEIGHT, z1], [x0, WALL_HEIGHT, z0], [x0, 0, z0]], [-1, 0, 0]],
        [1, 0, [[x1, 0, z0], [x1, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z1], [x1, 0, z1]], [1, 0, 0]],
      ];
      for (const [dx, dy, corners, normal] of faces) {
        if (!grid.walkable(tx + dx, ty + dy)) continue;
        // A wall face is one tile wide but WALL_HEIGHT tall. The corner order
        // here runs bottom-left, top-left, top-right, bottom-right, so U ends
        // up along the face's *height* and V along its width; giving both the
        // same scale stretches the stonework by WALL_HEIGHT and the masonry
        // reads as tall vertical planks. Scaling each axis by the length it
        // actually spans keeps the courses square.
        const uw = 1 / TILES_PER_TEXTURE;
        const along = normal[0] !== 0 ? ty : tx;
        quad(
          wallSideB,
          corners[0]!, corners[1]!, corners[2]!, corners[3]!,
          normal,
          uw * WALL_HEIGHT, 0, (along % TILES_PER_TEXTURE) * uw,
          [1, 1, 1, 1], uw,
        );
      }
    }
  }

  const repeat = 1;
  const add = (b: Buffers, mat: THREE.Material, receive = true) => {
    if (b.positions.length === 0) return;
    const mesh = new THREE.Mesh(toGeometry(b), mat);
    mesh.receiveShadow = receive;
    mesh.castShadow = false;
    group.add(mesh);
  };

  // A floor's geometric normal never varies, so its relief map is the only
  // thing that makes light reveal a surface there. It is pushed harder than on
  // props, which already have form to catch the light.
  const groundMat = material(ambience.interior ? 'stone' : 'ground', ambience.groundColour, seed,
    { repeat, normalScale: 1.6, vertexColors: true });
  const pathMat = material(ambience.interior ? 'stone' : 'ground',
    new THREE.Color(ambience.groundColour).multiplyScalar(0.86).getHex(), seed + 1,
    { repeat, normalScale: 1.5, vertexColors: true });
  // Standing water is glossier than the bank around it, but at roughness 0.35
  // it mirrors the sky gradient out of the environment map and every mire tile
  // turns into a pale blue rectangle -- a plastic surface, which §5 rules out.
  // 0.62 still catches a wet sheen off the torches without reflecting the sky.
  const mireMat = material('ground',
    new THREE.Color(ambience.groundColour).lerp(new THREE.Color(0x1d231c), 0.72).getHex(), seed + 2,
    { repeat, roughness: 0.62, vertexColors: true });
  const wallMat = material('stone', ambience.wallColour, seed + 3,
    { repeat, normalScale: 1.2, vertexColors: true });
  const wallTopMat = material('stone',
    new THREE.Color(ambience.wallColour).multiplyScalar(0.72).getHex(), seed + 4,
    { repeat, vertexColors: true });

  const surroundMat = material('ground',
    new THREE.Color(ambience.groundColour).multiplyScalar(0.52).getHex(), seed + 5,
    { repeat, normalScale: 1.3, vertexColors: true });

  add(surroundB, surroundMat);
  add(floorB, groundMat);
  add(pathB, pathMat);
  add(mireB, mireMat);
  add(wallSideB, wallMat);
  add(wallTopB, wallTopMat);

  // Walls need to cast shadows, which is most of what makes an interior read
  // as architecture rather than as a flat maze (§28).
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (mesh.material === wallMat || mesh.material === wallTopMat) mesh.castShadow = true;
  }

  return {
    group,
    dispose() {
      group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    },
  };
}
