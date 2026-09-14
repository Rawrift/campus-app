/**
 * Procedural props (§42, §59).
 *
 * One builder per prop kind, all parameterised by a variant seed so that twenty
 * gravestones in a churchyard are twenty different gravestones. Nothing here is
 * loaded from a file.
 *
 * Several of these exist purely for environmental storytelling — a table still
 * laid for a meal, bodies laid out under sheets, a cart loaded and pointed at a
 * gate it never went through. They carry the narrative the brief asks for
 * without a single line of forced exposition (§58, §59).
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { TAU } from '@/core/math';
import { material, emissive } from '../materials';
import type { PropKind } from '@/world/zoneDef';

type Builder = (rng: Rng, g: THREE.Group) => void;

const stone = (rng: Rng, tint = 0x6a665e) => material('stone', tint, rng.int(0, 999));
const wood = (rng: Rng, tint = 0x55432c) => material('wood', tint, rng.int(0, 999));
const iron = (rng: Rng, tint = 0x5a554d) => material('iron', tint, rng.int(0, 999));
const cloth = (rng: Rng, tint = 0x6a6154) => material('cloth', tint, rng.int(0, 999));
const bone = (rng: Rng) => material('bone', 0xbfb08a, rng.int(0, 999));

function box(g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cyl(g: THREE.Group, rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** A flame: emissive card cluster. Cheap, and reads correctly in the dark. */
function flame(g: THREE.Group, y: number, scale = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.09 * scale, 0.26 * scale, 6),
    emissive(0xffa244, 0.85),
  );
  m.position.y = y;
  m.name = 'flame';
  g.add(m);
  return m;
}

const BUILDERS: Partial<Record<PropKind, Builder>> = {
  // --- graves and bones ---------------------------------------------------
  gravestone: (rng, g) => {
    const h = rng.range(0.5, 0.95);
    const slab = box(g, rng.range(0.3, 0.48), h, 0.09, stone(rng, 0x6e6a60), 0, h / 2);
    // Every one of them leans. A perfectly upright graveyard reads as new.
    slab.rotation.z = rng.range(-0.16, 0.16);
    slab.rotation.x = rng.range(-0.1, 0.1);
    if (rng.chance(0.4)) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 10, 1, false, 0, Math.PI), stone(rng, 0x6e6a60));
      top.rotation.z = Math.PI / 2;
      top.rotation.y = Math.PI / 2;
      top.position.y = h;
      slab.add(top);
    }
  },
  grave_cross: (rng, g) => {
    const mat = rng.chance(0.5) ? wood(rng, 0x47392a) : stone(rng);
    const h = rng.range(0.6, 0.9);
    const post = box(g, 0.07, h, 0.07, mat, 0, h / 2);
    box(g, 0.34, 0.07, 0.06, mat, 0, h * 0.74);
    post.rotation.z = rng.range(-0.2, 0.2);
  },
  bones: (rng, g) => {
    const mat = bone(rng);
    for (let i = 0; i < rng.int(3, 7); i++) {
      const b = cyl(g, 0.024, 0.03, rng.range(0.14, 0.3), mat,
        rng.range(-0.22, 0.22), 0.03, rng.range(-0.22, 0.22), 5);
      b.rotation.set(Math.PI / 2, rng.range(0, TAU), rng.range(-0.4, 0.4));
    }
  },
  skull_pile: (rng, g) => {
    const mat = bone(rng);
    for (let i = 0; i < rng.int(4, 9); i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.075, 0.1), 7, 6), mat);
      s.position.set(rng.range(-0.28, 0.28), 0.08 + Math.abs(rng.range(0, 0.22)), rng.range(-0.28, 0.28));
      s.rotation.set(rng.range(0, TAU), rng.range(0, TAU), 0);
      s.castShadow = true;
      g.add(s);
    }
  },
  ossuary_niche: (rng, g) => {
    // Stacked bones in a wall alcove — the ossuary's defining detail.
    const mat = bone(rng);
    box(g, 0.5, 0.55, 0.16, stone(rng, 0x59554d), 0, 0.5);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const b = cyl(g, 0.028, 0.03, 0.2, mat, -0.15 + i * 0.1, 0.34 + row * 0.13, 0.02, 5);
        b.rotation.z = Math.PI / 2;
      }
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), mat);
    skull.position.set(0, 0.76, 0.02);
    g.add(skull);
  },

  // --- containers ---------------------------------------------------------
  barrel: (rng, g) => {
    const m = cyl(g, 0.21, 0.24, 0.62, wood(rng, 0x4f3f28), 0, 0.31, 0, 10);
    m.scale.set(1, 1, 1);
    for (const y of [0.12, 0.5]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.016, 5, 12), iron(rng));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      g.add(hoop);
    }
  },
  crate: (rng, g) => {
    const s = rng.range(0.36, 0.52);
    const m = box(g, s, s * 0.9, s, wood(rng, 0x5a462c), 0, s * 0.45);
    m.rotation.y = rng.range(-0.3, 0.3);
    box(g, s * 1.02, 0.04, s * 0.12, wood(rng, 0x3f3120), 0, s * 0.7);
  },
  sack: (rng, g) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.17, 0.24), 8, 7), cloth(rng, 0x726348));
    m.scale.set(1, 1.25, 1);
    m.position.y = 0.2;
    m.castShadow = true;
    g.add(m);
    cyl(g, 0.06, 0.09, 0.1, cloth(rng, 0x5e5240), 0, 0.42, 0, 6);
  },
  basket: (rng, g) => {
    cyl(g, 0.19, 0.14, 0.26, wood(rng, 0x6b5838), 0, 0.13, 0, 9);
  },

  // --- vehicles -----------------------------------------------------------
  cart: (rng, g) => {
    const w = wood(rng, 0x4e3d27);
    box(g, 0.8, 0.12, 1.35, w, 0, 0.46);
    box(g, 0.78, 0.3, 0.07, w, 0, 0.62, -0.64);
    for (const side of [-1, 1]) {
      box(g, 0.05, 0.24, 1.3, w, side * 0.4, 0.6);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 14), w);
      wheel.position.set(side * 0.46, 0.34, 0.1);
      wheel.rotation.y = Math.PI / 2;
      wheel.castShadow = true;
      g.add(wheel);
    }
    box(g, 0.07, 0.07, 1.0, w, 0, 0.42, 1.1);
  },
  cart_wrecked: (rng, g) => {
    const w = wood(rng, 0x3f3222);
    const bed = box(g, 0.8, 0.12, 1.2, w, 0, 0.3);
    bed.rotation.set(rng.range(0.2, 0.5), rng.range(0, TAU), rng.range(-0.3, 0.3));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 14), w);
    wheel.position.set(rng.range(-0.8, 0.8), 0.06, rng.range(-0.6, 0.6));
    wheel.rotation.x = Math.PI / 2 + rng.range(-0.3, 0.3);
    g.add(wheel);
    for (let i = 0; i < 5; i++) {
      const plank = box(g, 0.08, 0.05, rng.range(0.3, 0.8), w,
        rng.range(-0.7, 0.7), 0.03, rng.range(-0.7, 0.7));
      plank.rotation.y = rng.range(0, TAU);
    }
  },
  wheel: (rng, g) => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 14), wood(rng, 0x44351f));
    wheel.position.set(0, 0.06, 0);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
  },

  // --- furniture ----------------------------------------------------------
  table: (rng, g) => {
    const w = wood(rng, 0x4d3c26);
    box(g, 1.1, 0.07, 0.66, w, 0, 0.7);
    for (const [x, z] of [[-0.48, -0.26], [0.48, -0.26], [-0.48, 0.26], [0.48, 0.26]] as const) {
      box(g, 0.07, 0.66, 0.07, w, x, 0.35, z);
    }
  },
  table_set: (rng, g) => {
    BUILDERS.table!(rng, g);
    // The detail that does the storytelling: the meal is still on it.
    const pot = material('stone', 0x7a6a58, rng.int(0, 999));
    for (let i = 0; i < 4; i++) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 5, 0, TAU, 0, Math.PI / 2), pot);
      bowl.rotation.x = Math.PI;
      bowl.position.set(-0.36 + i * 0.24, 0.76, i % 2 === 0 ? -0.16 : 0.16);
      g.add(bowl);
    }
    const jug = cyl(g, 0.05, 0.07, 0.17, pot, 0, 0.81, 0, 7);
    jug.castShadow = true;
  },
  chair: (rng, g) => {
    const w = wood(rng, 0x4d3c26);
    box(g, 0.36, 0.05, 0.36, w, 0, 0.44);
    box(g, 0.36, 0.42, 0.05, w, 0, 0.66, -0.16);
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]] as const) {
      box(g, 0.045, 0.42, 0.045, w, x, 0.22, z);
    }
  },
  bed: (rng, g) => {
    const w = wood(rng, 0x453522);
    box(g, 0.82, 0.14, 1.8, w, 0, 0.26);
    box(g, 0.78, 0.12, 1.7, cloth(rng, 0x6b6152), 0, 0.38);
    box(g, 0.82, 0.44, 0.07, w, 0, 0.5, -0.9);
    const pillow = box(g, 0.5, 0.1, 0.3, cloth(rng, 0x7a7263), 0, 0.48, -0.66);
    pillow.rotation.x = 0.1;
  },
  bench: (rng, g) => {
    const w = wood(rng, 0x4a3a24);
    box(g, 2.2, 0.08, 0.38, w, 0, 0.44);
    box(g, 2.2, 0.36, 0.06, w, 0, 0.64, -0.17);
    for (const x of [-0.9, 0.9]) box(g, 0.08, 0.44, 0.34, w, x, 0.22);
  },

  // --- bodies -------------------------------------------------------------
  corpse: (rng, g) => {
    const skin = material('skin', 0x8a7460, rng.int(0, 999));
    const rag = cloth(rng, 0x4f4739);
    const torso = box(g, 0.32, 0.16, 0.62, rag, 0, 0.09);
    torso.rotation.y = rng.range(-0.3, 0.3);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin);
    head.position.set(rng.range(-0.1, 0.1), 0.1, -0.42);
    g.add(head);
    for (const side of [-1, 1]) {
      const arm = cyl(g, 0.04, 0.035, 0.44, skin, side * 0.22, 0.07, rng.range(-0.1, 0.1), 5);
      arm.rotation.set(Math.PI / 2, 0, side * rng.range(0.2, 0.7));
      const leg = cyl(g, 0.055, 0.045, 0.52, rag, side * 0.1, 0.07, 0.5, 5);
      leg.rotation.set(Math.PI / 2, 0, side * rng.range(0, 0.3));
    }
  },
  corpse_covered: (rng, g) => {
    // Under a sheet, laid out properly. Somebody cared, and then stopped.
    const sheet = cloth(rng, 0x6a6458);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), sheet);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.2;
    body.scale.set(1, 1, 0.7);
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), sheet);
    head.position.set(-0.68, 0.16, 0);
    g.add(head);
  },
  animal_corpse: (rng, g) => {
    const hide = material('leather', 0x4a3a2c, rng.int(0, 999));
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.6, 4, 8), hide);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.24;
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 4; i++) {
      const leg = cyl(g, 0.04, 0.03, 0.4, hide, rng.range(-0.3, 0.3), 0.36, rng.range(-0.25, 0.25), 5);
      leg.rotation.set(rng.range(-1.4, -0.9), 0, rng.range(-0.4, 0.4));
    }
  },

  // --- light and ritual ---------------------------------------------------
  torch: (rng, g) => {
    cyl(g, 0.028, 0.034, 1.5, wood(rng, 0x3f3122), 0, 0.75, 0, 6);
    const head = cyl(g, 0.06, 0.045, 0.16, iron(rng, 0x413c35), 0, 1.54, 0, 6);
    head.castShadow = true;
    flame(g, 1.68, 1);
  },
  brazier: (rng, g) => {
    const m = iron(rng, 0x4a443c);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const leg = cyl(g, 0.025, 0.03, 0.7, m, Math.cos(a) * 0.17, 0.35, Math.sin(a) * 0.17, 5);
      leg.rotation.x = Math.cos(a) * 0.2;
      leg.rotation.z = -Math.sin(a) * 0.2;
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.17, 0.22, 10, 1, true), m);
    bowl.position.y = 0.78;
    bowl.castShadow = true;
    g.add(bowl);
    // Coals under the flame, so the light has a visible source.
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, Math.PI / 2), emissive(0xd2521c, 0.9));
    coals.position.y = 0.8;
    g.add(coals);
    flame(g, 1.0, 1.5);
  },
  candles: (rng, g) => {
    const wax = material('cloth', 0xd8cfae, rng.int(0, 999));
    for (let i = 0; i < rng.int(3, 6); i++) {
      const h = rng.range(0.1, 0.26);
      const x = rng.range(-0.16, 0.16);
      const z = rng.range(-0.16, 0.16);
      cyl(g, 0.022, 0.026, h, wax, x, h / 2, z, 6);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), emissive(0xffc27a, 0.95));
      fl.position.set(x, h + 0.03, z);
      fl.name = 'flame';
      g.add(fl);
    }
  },
  lantern: (rng, g) => {
    cyl(g, 0.02, 0.02, 0.9, iron(rng), 0, 0.45, 0, 5);
    const cage = box(g, 0.16, 0.2, 0.16, iron(rng, 0x4a443c), 0, 0.98);
    cage.castShadow = true;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), emissive(0xffb35c, 0.95));
    core.position.y = 0.98;
    core.name = 'flame';
    g.add(core);
  },
  altar: (rng, g) => {
    const s = stone(rng, 0x625d54);
    box(g, 1.15, 0.2, 0.68, s, 0, 0.1);
    box(g, 0.85, 0.62, 0.5, s, 0, 0.5);
    box(g, 1.25, 0.14, 0.78, s, 0, 0.87);
    // Old stains in the top surface. Never explained.
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), emissive(0x3a1410, 0.5, THREE.NormalBlending));
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.945;
    g.add(stain);
  },
  shrine: (rng, g) => {
    const s = stone(rng, 0x5e594f);
    box(g, 0.7, 0.16, 0.7, s, 0, 0.08);
    cyl(g, 0.2, 0.26, 0.9, s, 0, 0.6, 0, 8);
    const niche = box(g, 0.42, 0.5, 0.34, s, 0, 1.28);
    niche.castShadow = true;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7), emissive(0xc8a349, 0.8));
    glow.position.y = 1.28;
    glow.name = 'flame';
    g.add(glow);
  },
  ritual_mark: (rng, g) => {
    // Drawn flat on the ground, additively blended so it glows faintly.
    const ash = emissive(0x6a5238, 0.3, THREE.NormalBlending);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 20), ash);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rng.range(0, 1);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.3), ash);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = -a;
      bar.position.set(Math.cos(a) * 0.34, 0.021, Math.sin(a) * 0.34);
      g.add(bar);
    }
  },

  // --- structures ---------------------------------------------------------
  well: (rng, g) => {
    const s = stone(rng, 0x676258);
    cyl(g, 0.62, 0.66, 0.72, s, 0, 0.36, 0, 12);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0x05050a }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.73;
    g.add(hole);
    for (const side of [-1, 1]) box(g, 0.1, 1.3, 0.1, wood(rng), side * 0.55, 1.3);
    box(g, 1.35, 0.1, 0.1, wood(rng), 0, 1.92);
    box(g, 1.5, 0.08, 0.9, wood(rng, 0x3f3122), 0, 2.02).rotation.x = 0.1;
  },
  fence: (rng, g) => {
    const w = wood(rng, 0x4a3a26);
    for (let i = 0; i < 3; i++) box(g, 0.07, 0.9, 0.07, w, -0.7 + i * 0.7, 0.45);
    for (const y of [0.3, 0.68]) box(g, 1.5, 0.05, 0.05, w, 0, y);
  },
  fence_broken: (rng, g) => {
    const w = wood(rng, 0x453524);
    const p1 = box(g, 0.07, 0.8, 0.07, w, -0.6, 0.4);
    p1.rotation.z = rng.range(-0.4, 0.4);
    const p2 = box(g, 0.07, rng.range(0.25, 0.5), 0.07, w, 0.55, 0.2);
    p2.rotation.z = rng.range(-0.5, 0.5);
    const rail = box(g, 0.9, 0.05, 0.05, w, -0.2, 0.55);
    rail.rotation.z = rng.range(-0.35, 0.1);
  },
  gate: (rng, g) => {
    const w = wood(rng, 0x3f3122);
    for (const side of [-1, 1]) box(g, 0.22, 2.8, 0.22, w, side * 1.5, 1.4);
    box(g, 3.2, 0.26, 0.26, w, 0, 2.7);
    for (let i = 0; i < 6; i++) box(g, 0.16, 2.2, 0.1, w, -1.2 + i * 0.48, 1.1);
    box(g, 2.9, 0.12, 0.14, iron(rng), 0, 1.6);
  },
  barricade: (rng, g) => {
    const w = wood(rng, 0x453524);
    for (let i = 0; i < 6; i++) {
      const plank = box(g, rng.range(0.9, 1.5), 0.1, 0.08, w,
        rng.range(-0.2, 0.2), 0.2 + i * 0.18, rng.range(-0.15, 0.15));
      plank.rotation.z = rng.range(-0.5, 0.5);
      plank.rotation.y = rng.range(-0.3, 0.3);
    }
    box(g, 0.1, 1.2, 0.1, w, -0.55, 0.6).rotation.z = 0.3;
    box(g, 0.1, 1.2, 0.1, w, 0.55, 0.6).rotation.z = -0.3;
  },
  ladder: (rng, g) => {
    const w = wood(rng, 0x4a3a26);
    for (const side of [-0.2, 0.2]) box(g, 0.07, 2.4, 0.07, w, side, 1.2);
    for (let i = 0; i < 7; i++) box(g, 0.48, 0.05, 0.05, w, 0, 0.25 + i * 0.32);
  },

  // --- vegetation and terrain --------------------------------------------
  tree_dead: (rng, g) => {
    const w = wood(rng, 0x3d3226);
    const h = rng.range(2.6, 4.4);
    const trunk = cyl(g, 0.12, 0.26, h, w, 0, h / 2, 0, 7);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    // Bare branches, each a tapered cylinder at a random elevation.
    for (let i = 0; i < rng.int(4, 8); i++) {
      const a = rng.range(0, TAU);
      const y = rng.range(h * 0.45, h * 0.95);
      const len = rng.range(0.5, 1.4);
      const br = cyl(g, 0.025, 0.06, len, w, Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, 5);
      br.rotation.set(Math.cos(a) * 0.9, -a, Math.sin(a) * 0.9 + rng.range(0.3, 0.9));
      br.position.x += Math.cos(a) * len * 0.35;
      br.position.z += Math.sin(a) * len * 0.35;
    }
  },
  tree_sick: (rng, g) => {
    BUILDERS.tree_dead!(rng, g);
    // Sparse, sickly foliage: desaturated, never green enough to look healthy.
    // Clumps hug the upper trunk rather than floating free, and are flattened
    // and irregular so they read as foliage instead of as rocks in mid-air.
    const leaf = material('cloth', 0x3f4630, rng.int(0, 999), {
      transparent: true, opacity: 0.92, side: THREE.DoubleSide, flatShading: true,
    });
    const clumps = rng.int(4, 8);
    for (let i = 0; i < clumps; i++) {
      const a = (i / clumps) * TAU + rng.range(-0.4, 0.4);
      const spread = rng.range(0.25, 0.75);
      const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(0.3, 0.52), 0), leaf);
      clump.position.set(
        Math.cos(a) * spread,
        rng.range(2.1, 3.2),
        Math.sin(a) * spread,
      );
      clump.rotation.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
      clump.scale.set(rng.range(1.0, 1.5), rng.range(0.5, 0.75), rng.range(1.0, 1.5));
      clump.castShadow = true;
      g.add(clump);
    }
  },
  stump: (rng, g) => {
    const h = rng.range(0.22, 0.45);
    cyl(g, rng.range(0.22, 0.34), rng.range(0.28, 0.4), h, wood(rng, 0x453722), 0, h / 2, 0, 9);
  },
  bush_dead: (rng, g) => {
    const w = wood(rng, 0x3c3125);
    for (let i = 0; i < rng.int(5, 10); i++) {
      const a = rng.range(0, TAU);
      const br = cyl(g, 0.012, 0.022, rng.range(0.3, 0.65), w, 0, 0.2, 0, 4);
      br.rotation.set(rng.range(0.4, 1.1), a, rng.range(-0.4, 0.4));
    }
  },
  reeds: (rng, g) => {
    const mat = material('cloth', 0x5e6140, rng.int(0, 999), { side: THREE.DoubleSide });
    for (let i = 0; i < rng.int(6, 14); i++) {
      const h = rng.range(0.5, 1.1);
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.035, h), mat);
      blade.position.set(rng.range(-0.3, 0.3), h / 2, rng.range(-0.3, 0.3));
      blade.rotation.set(rng.range(-0.2, 0.2), rng.range(0, TAU), rng.range(-0.3, 0.3));
      g.add(blade);
    }
  },
  rock: (rng, g) => {
    const r = rng.range(0.22, 0.6);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone(rng, 0x605c54));
    m.position.y = r * 0.55;
    m.rotation.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
    m.scale.set(1, rng.range(0.6, 0.9), rng.range(0.8, 1.2));
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  },
  rubble: (rng, g) => {
    const s = stone(rng, 0x585349);
    for (let i = 0; i < rng.int(4, 9); i++) {
      const r = rng.range(0.07, 0.2);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), s);
      m.position.set(rng.range(-0.4, 0.4), r * 0.6, rng.range(-0.4, 0.4));
      m.rotation.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
      m.castShadow = true;
      g.add(m);
    }
  },
  pit: (rng, g) => {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.7, 1.2), 12), new THREE.MeshBasicMaterial({ color: 0x04040a }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.02;
    g.add(hole);
  },

  // --- architecture -------------------------------------------------------
  pillar: (rng, g) => {
    const s = stone(rng, 0x635e55);
    box(g, 0.72, 0.2, 0.72, s, 0, 0.1);
    cyl(g, 0.24, 0.28, 3.2, s, 0, 1.8, 0, 10);
    box(g, 0.7, 0.22, 0.7, s, 0, 3.5);
  },
  pillar_broken: (rng, g) => {
    const s = stone(rng, 0x5c574e);
    box(g, 0.72, 0.2, 0.72, s, 0, 0.1);
    const h = rng.range(0.9, 1.9);
    const shaft = cyl(g, 0.25, 0.28, h, s, 0, 0.2 + h / 2, 0, 10);
    shaft.rotation.z = rng.range(-0.06, 0.06);
    // The fallen top section, lying beside it.
    const fallen = cyl(g, 0.24, 0.26, rng.range(0.6, 1.3), s, rng.range(0.6, 1.2), 0.26, rng.range(-0.6, 0.6), 10);
    fallen.rotation.set(Math.PI / 2, 0, rng.range(0, TAU));
  },
  arch: (rng, g) => {
    const s = stone(rng, 0x615c53);
    for (const side of [-1, 1]) cyl(g, 0.22, 0.26, 2.6, s, side * 1.1, 1.3, 0, 9);
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 6, 14, Math.PI), s);
    top.position.y = 2.6;
    top.castShadow = true;
    g.add(top);
  },
  house: (rng, g) => {
    const w = wood(rng, 0x4c3c27);
    const plaster = material('stone', 0x736a58, rng.int(0, 999));
    box(g, 3.4, 2.3, 3.0, plaster, 0, 1.15);
    // Exposed timber framing — the period cue that sells the setting.
    for (const x of [-1.6, 1.6]) box(g, 0.14, 2.3, 0.14, w, x, 1.15, 1.45);
    box(g, 3.4, 0.14, 0.14, w, 0, 2.2, 1.45);
    box(g, 3.4, 0.14, 0.14, w, 0, 1.1, 1.45);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.5, 4), wood(rng, 0x3a2e1e));
    roof.position.y = 3.0;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // A dark doorway and shuttered window.
    const dark = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.5), dark);
    door.position.set(0, 0.75, 1.52);
    g.add(door);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), dark);
    win.position.set(1.05, 1.5, 1.52);
    g.add(win);
  },
  house_burnt: (rng, g) => {
    const charred = material('wood', 0x2a231c, rng.int(0, 999));
    const plaster = material('stone', 0x4a443a, rng.int(0, 999));
    // Two standing walls and a collapsed corner: legible as a ruin from above.
    box(g, 3.2, rng.range(1.2, 2.0), 0.22, plaster, 0, 0.9, -1.4);
    box(g, 0.22, rng.range(0.8, 1.7), 2.8, plaster, -1.5, 0.7, 0);
    for (let i = 0; i < 7; i++) {
      const beam = box(g, 0.16, 0.16, rng.range(1.0, 2.6), charred,
        rng.range(-1.4, 1.4), rng.range(0.1, 1.3), rng.range(-1.2, 1.2));
      beam.rotation.set(rng.range(-0.7, 0.7), rng.range(0, TAU), rng.range(-0.9, 0.9));
    }
    for (let i = 0; i < 6; i++) {
      const r = rng.range(0.1, 0.26);
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), plaster);
      chunk.position.set(rng.range(-1.8, 1.8), r * 0.6, rng.range(-1.6, 1.6));
      g.add(chunk);
    }
  },
  hut: (rng, g) => {
    const w = wood(rng, 0x483a26);
    cyl(g, 1.1, 1.25, 1.7, material('stone', 0x6a604e, rng.int(0, 999)), 0, 0.85, 0, 8);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 8), w);
    roof.position.y = 2.2;
    roof.castShadow = true;
    g.add(roof);
  },
  chapel: (rng, g) => {
    const s = stone(rng, 0x6b6458);
    box(g, 5.0, 4.2, 7.0, s, 0, 2.1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.0, 2.2, 4), stone(rng, 0x4e4940));
    roof.position.y = 5.3;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 1.5;
    roof.castShadow = true;
    g.add(roof);
    // The tower — the landmark that tells the player where they are going.
    box(g, 1.9, 7.2, 1.9, s, 0, 3.6, -4.0);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), stone(rng, 0x4e4940));
    spire.position.set(0, 8.4, -4.0);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
    const dark = new THREE.MeshBasicMaterial({ color: 0x08080c });
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), dark);
    arch.position.set(0, 1.3, 3.53);
    g.add(arch);
  },

  // --- bells --------------------------------------------------------------
  bell: (rng, g) => {
    // Tarnished bronze, and no emissive: a bell that glows with no fire in it
    // reads as treasure rather than as the thing the abbey rang for the dead.
    const brass = material('darksteel', 0x6a5526, rng.int(0, 999), {
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.92, 1.3, 14, 1, true), brass);
    body.position.y = 1.5;
    body.castShadow = true;
    body.name = 'bellBody';
    g.add(body);
    cyl(g, 0.12, 0.12, 0.3, brass, 0, 2.25, 0, 8);
    const clapper = cyl(g, 0.09, 0.12, 0.5, iron(rng, 0x4a443c), 0, 1.0, 0, 7);
    clapper.name = 'clapper';
    for (const side of [-1, 1]) box(g, 0.2, 2.6, 0.2, wood(rng, 0x3a2e1e), side * 1.2, 1.3);
    box(g, 2.8, 0.24, 0.24, wood(rng, 0x3a2e1e), 0, 2.5);
  },
  bell_broken: (rng, g) => {
    const brass = material('darksteel', 0x5e4c24, rng.int(0, 999), { side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.92, 1.3, 14, 1, true), brass);
    body.position.y = 0.62;
    // Toppled and half-buried. The crack is on the inside (see the zone note).
    body.rotation.set(Math.PI / 2 + rng.range(-0.2, 0.2), 0, rng.range(0, TAU));
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 4; i++) {
      const shard = box(g, rng.range(0.14, 0.3), 0.04, rng.range(0.14, 0.3), brass,
        rng.range(-1.2, 1.2), 0.04, rng.range(-1.2, 1.2));
      shard.rotation.set(rng.range(-0.4, 0.4), rng.range(0, TAU), rng.range(-0.4, 0.4));
    }
  },
  bell_rope: (rng, g) => {
    const rope = material('cloth', 0x6e6248, rng.int(0, 999));
    // Cut at head height, from below. That detail is the story.
    cyl(g, 0.03, 0.028, 2.2, rope, 0, 2.5, 0, 6);
    const frayed = cyl(g, 0.035, 0.02, 0.14, rope, 0, 1.35, 0, 6);
    frayed.rotation.z = 0.2;
  },
  banner: (rng, g) => {
    const fabric = material('cloth', 0x5a3a32, rng.int(0, 999), { side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const cloth1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.8, 1, 4), fabric);
    cloth1.position.y = 1.3;
    cloth1.name = 'banner';
    g.add(cloth1);
    box(g, 0.9, 0.06, 0.06, wood(rng, 0x3f3122), 0, 2.2);
  },

  // --- workshop -----------------------------------------------------------
  anvil: (rng, g) => {
    const m = iron(rng, 0x45403a);
    box(g, 0.3, 0.4, 0.4, wood(rng, 0x3f3122), 0, 0.2);
    box(g, 0.28, 0.16, 0.7, m, 0, 0.48);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 7), m);
    horn.position.set(0, 0.48, 0.5);
    horn.rotation.x = Math.PI / 2;
    g.add(horn);
  },
  forge: (rng, g) => {
    const s = stone(rng, 0x55504a);
    box(g, 1.3, 0.9, 1.0, s, 0, 0.45);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.6), emissive(0xff5a1c, 0.95));
    coals.position.y = 0.94;
    coals.name = 'flame';
    g.add(coals);
    cyl(g, 0.24, 0.3, 2.2, s, 0, 2.0, -0.3, 8);
  },
  stall: (rng, g) => {
    const w = wood(rng, 0x503f28);
    box(g, 1.9, 0.1, 0.9, w, 0, 0.9);
    for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]] as const) {
      box(g, 0.08, 0.9, 0.08, w, x, 0.45, z);
    }
    for (const x of [-0.85, 0.85]) box(g, 0.08, 1.1, 0.08, w, x, 1.5, -0.35);
    const awning = box(g, 2.1, 0.06, 1.2, material('cloth', 0x6a4a38, rng.int(0, 999)), 0, 2.0, 0);
    awning.rotation.x = 0.22;
  },
  hay: (rng, g) => {
    const m = material('cloth', 0x8a7a48, rng.int(0, 999));
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 10), m);
    bale.rotation.z = Math.PI / 2;
    bale.position.y = 0.4;
    bale.castShadow = true;
    g.add(bale);
  },

  // --- ground detail ------------------------------------------------------
  pebble: (rng, g) => {
    const count = rng.int(1, 3);
    const mat = stone(rng, 0x6a6459);
    for (let i = 0; i < count; i++) {
      const r = rng.range(0.022, 0.055);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      m.position.set(rng.range(-0.16, 0.16), r * 0.45, rng.range(-0.16, 0.16));
      m.rotation.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
      m.scale.y = rng.range(0.45, 0.8);
      m.castShadow = true;
      g.add(m);
    }
  },
  tuft: (rng, g) => {
    // Dead, desaturated grass: blades of two lengths so it is not a fan.
    const mat = material('cloth', rng.chance(0.5) ? 0x53553a : 0x4a4632, rng.int(0, 999), {
      side: THREE.DoubleSide,
    });
    const blades = rng.int(4, 9);
    for (let i = 0; i < blades; i++) {
      const h = rng.range(0.06, 0.17);
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.022, h), mat);
      blade.position.set(rng.range(-0.07, 0.07), h * 0.48, rng.range(-0.07, 0.07));
      blade.rotation.set(rng.range(-0.35, 0.35), rng.range(0, TAU), rng.range(-0.4, 0.4));
      g.add(blade);
    }
  },
  twig: (rng, g) => {
    const mat = wood(rng, 0x3d3226);
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const len = rng.range(0.08, 0.20);
      const m = cyl(g, 0.010, 0.014, len, mat,
        rng.range(-0.12, 0.12), 0.012, rng.range(-0.12, 0.12), 5);
      m.rotation.set(Math.PI / 2 + rng.range(-0.2, 0.2), rng.range(0, TAU), rng.range(-0.3, 0.3));
    }
  },
  shard: (rng, g) => {
    // Broken stone and bone chips — the interior equivalent of gravel.
    const mat = rng.chance(0.4) ? bone(rng) : stone(rng, 0x5e584d);
    for (let i = 0; i < rng.int(2, 4); i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(rng.range(0.022, 0.048)), mat);
      m.position.set(rng.range(-0.15, 0.15), 0.022, rng.range(-0.15, 0.15));
      m.rotation.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
      m.castShadow = true;
      g.add(m);
    }
  },

  stairs_down: (rng, g) => {
    const s = stone(rng, 0x585349);
    // Steps descending into a dark mouth — the visual promise of "down".
    for (let i = 0; i < 6; i++) {
      box(g, 2.2, 0.18, 0.4, s, 0, -i * 0.18, i * 0.4);
    }
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshBasicMaterial({ color: 0x04040a }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.set(0, -1.05, 1.4);
    g.add(dark);
    for (const side of [-1, 1]) box(g, 0.24, 1.2, 2.6, s, side * 1.2, 0.3, 1.2);
  },
  bridge: (rng, g) => {
    const w = wood(rng, 0x4a3a26);
    for (let i = 0; i < 8; i++) box(g, 2.0, 0.08, 0.3, w, 0, 0.1, -1.2 + i * 0.35);
    for (const side of [-1, 1]) {
      box(g, 0.1, 0.1, 2.8, w, side * 0.95, 0.6);
      for (let i = 0; i < 4; i++) box(g, 0.08, 0.5, 0.08, w, side * 0.95, 0.35, -1.0 + i * 0.7);
    }
  },
};

const cache = new Map<string, THREE.Group>();

/**
 * Builds (and caches) a prop. Identical kind+variant pairs share one template
 * which the scene then clones, so a graveyard of forty stones costs four
 * geometry builds, not forty.
 */
export function buildProp(kind: PropKind, variant: number): THREE.Group {
  const key = `${kind}:${variant % 8}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const g = new THREE.Group();
  const builder = BUILDERS[kind];
  if (builder) {
    builder(new Rng(`${kind}-${variant % 8}`), g);
  } else {
    // An unknown prop becomes a visible grey marker rather than nothing, so a
    // content mistake is obvious in play instead of silently invisible.
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), material('stone', 0x888888, 1));
    m.position.y = 0.3;
    g.add(m);
    console.warn(`[props] no builder for "${kind}"`);
  }
  cache.set(key, g);
  return g;
}

export function disposeProps(): void {
  for (const g of cache.values()) {
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
  cache.clear();
}
