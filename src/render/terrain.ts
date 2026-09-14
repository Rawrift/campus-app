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

const WALL_HEIGHT = 3.0;

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function newBuffers(): Buffers {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/** Appends one quad. Winding is counter-clockwise seen from the normal. */
function quad(
  b: Buffers,
  a: [number, number, number], bb: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  normal: [number, number, number],
  uvScale = 1, uOffset = 0, vOffset = 0,
): void {
  const base = b.positions.length / 3;
  for (const p of [a, bb, c, d]) b.positions.push(p[0], p[1], p[2]);
  for (let i = 0; i < 4; i++) b.normals.push(normal[0], normal[1], normal[2]);
  b.uvs.push(
    uOffset, vOffset,
    uOffset + uvScale, vOffset,
    uOffset + uvScale, vOffset + uvScale,
    uOffset, vOffset + uvScale,
  );
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function toGeometry(b: Buffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
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

  const floorB = newBuffers();
  const pathB = newBuffers();
  const mireB = newBuffers();
  const wallTopB = newBuffers();
  const wallSideB = newBuffers();

  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const tile = grid.get(tx, ty);
      const x0 = tx;
      const x1 = tx + 1;
      const z0 = ty;
      const z1 = ty + 1;

      if (tile === Tile.Floor || tile === Tile.Path || tile === Tile.Mire) {
        // A little per-tile height variation so the ground is not a table.
        const h = tile === Tile.Mire ? -0.06 : rng.range(-0.018, 0.018);
        const target = tile === Tile.Path ? pathB : tile === Tile.Mire ? mireB : floorB;
        quad(
          target,
          [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1],
          [0, 1, 0], 1, tx % 4, ty % 4,
        );
        continue;
      }

      if (tile !== Tile.Wall && tile !== Tile.Prop) continue;

      // Wall top, only when it is visible from above (always, at this camera).
      quad(
        wallTopB,
        [x0, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z0], [x1, WALL_HEIGHT, z1], [x0, WALL_HEIGHT, z1],
        [0, 1, 0], 1, tx % 4, ty % 4,
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
        quad(
          wallSideB,
          corners[0]!, corners[1]!, corners[2]!, corners[3]!,
          normal, 1, tx % 4, 0,
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

  const groundMat = material(ambience.interior ? 'stone' : 'ground', ambience.groundColour, seed, { repeat });
  const pathMat = material(ambience.interior ? 'stone' : 'ground',
    new THREE.Color(ambience.groundColour).multiplyScalar(0.86).getHex(), seed + 1, { repeat });
  const mireMat = material('ground',
    new THREE.Color(ambience.groundColour).lerp(new THREE.Color(0x2a3028), 0.6).getHex(), seed + 2,
    { repeat, roughness: 0.35 });
  const wallMat = material('stone', ambience.wallColour, seed + 3, { repeat });
  const wallTopMat = material('stone',
    new THREE.Color(ambience.wallColour).multiplyScalar(0.72).getHex(), seed + 4, { repeat });

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
