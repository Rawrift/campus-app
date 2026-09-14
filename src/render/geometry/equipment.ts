/**
 * Procedural equipment meshes (§4).
 *
 * Every armour piece and weapon in the game is built here from its `VisualSpec`
 * — module, tier, material and a few silhouette knobs. This is what delivers
 * the brief's central visual requirement: equipping an item must change how the
 * character looks, not just their numbers.
 *
 * Tier drives the *shape*, not just the colour:
 *   tier 0 — improvised: straps, patches, a bit of bent plate over cloth
 *   tier 1 — professional: fitted plate, proper pauldrons, real construction
 *   tier 2 — ancient/ceremonial: taller, engraved, with a crest
 * Even tier 2 stays in the same dirty palette, because the brief is explicit
 * that a powerful object should read as *old and dangerous*, not as glowing.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { material, materialForSpec, MATERIAL_COLOURS, type MaterialKind } from '../materials';
import type { VisualSpec, WeaponCategory } from '@/sim/items';

/** Slightly irregular box: nothing in this world was machine-made. */
function roughBox(w: number, h: number, d: number, rng: Rng, jitter = 0.06): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + rng.range(-jitter, jitter) * w,
      pos.getY(i) + rng.range(-jitter, jitter) * h,
      pos.getZ(i) + rng.range(-jitter, jitter) * d,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function tierColour(spec: VisualSpec): number {
  const base = MATERIAL_COLOURS[spec.material] ?? 0x6b6660;
  // Higher tiers are darker and slightly cooler, never brighter.
  const c = new THREE.Color(base);
  if (spec.tier === 2) c.multiplyScalar(0.78).offsetHSL(0.02, 0.04, 0);
  else if (spec.tier === 0) c.multiplyScalar(0.9);
  return c.getHex();
}

function matFor(spec: VisualSpec, seed: number): THREE.MeshStandardMaterial {
  const kind: MaterialKind = materialForSpec(spec.material);
  return material(kind, tierColour(spec), seed + spec.tier * 31);
}

/** The warm brass accent used sparingly on tier-2 gear. */
function accentMat(seed: number): THREE.MeshStandardMaterial {
  return material('steel', 0x9a7d3c, seed + 501, { roughness: 0.6 });
}

// ---------------------------------------------------------------------------
// Armour modules
// ---------------------------------------------------------------------------

export function buildHelmet(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.4;

  if (spec.material === 'cloth') {
    // A hood: a cowl that reads as fabric from above, with a hanging point.
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.155 + bulk * 0.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    hood.position.y = 0.02;
    hood.scale.set(1.12, 1.2, 1.24);
    g.add(hood);
    const drape = new THREE.Mesh(roughBox(0.24, 0.16, 0.05, rng), mat);
    drape.position.set(0, -0.06, -0.14);
    drape.rotation.x = -0.25;
    g.add(drape);
  } else {
    // A skull cap that grows into a full helm as the tier rises.
    const height = 0.15 + bulk * 0.12 + spec.tier * 0.02;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.15 + bulk * 0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat,
    );
    cap.scale.set(1.1, height / 0.15, 1.16);
    g.add(cap);

    if (spec.tier >= 1) {
      // Nasal bar and cheek plates — the reason a helm reads at distance.
      const nasal = new THREE.Mesh(roughBox(0.032, 0.13, 0.03, rng), mat);
      nasal.position.set(0, -0.045, 0.155);
      g.add(nasal);
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(roughBox(0.045, 0.1, 0.09, rng), mat);
        cheek.position.set(side * 0.115, -0.05, 0.06);
        cheek.rotation.z = side * 0.15;
        g.add(cheek);
      }
    }
    if (spec.tier >= 2) {
      // A crest: the single strongest silhouette cue in the whole kit.
      const crest = new THREE.Mesh(roughBox(0.028, 0.1, 0.3, rng), accentMat(seed));
      crest.position.set(0, 0.13, -0.02);
      g.add(crest);
      for (let i = 0; i < 3; i++) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), accentMat(seed));
        stud.position.set(0, 0.05, 0.1 - i * 0.09);
        g.add(stud);
      }
    }
  }
  return g;
}

export function buildTorso(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 1);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.4;

  // The chest volume itself. Bulk is the whole difference between a robe and
  // a breastplate at ARPG camera distance.
  const chest = new THREE.Mesh(
    roughBox(0.42 + bulk * 0.18, 0.44, 0.26 + bulk * 0.12, rng, 0.05), mat,
  );
  chest.position.y = 0.02;
  g.add(chest);

  if (spec.material === 'cloth') {
    // Robes fall past the hips and move — the cloak animator also drives these.
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 0.46, 10, 1, true), mat,
    );
    skirt.position.y = -0.42;
    g.add(skirt);
  } else if (spec.tier >= 1) {
    // Overlapping plates across the abdomen.
    const bands = spec.tier === 2 ? 4 : 3;
    for (let i = 0; i < bands; i++) {
      const band = new THREE.Mesh(
        roughBox(0.4 + bulk * 0.16 - i * 0.02, 0.07, 0.24 + bulk * 0.1, rng, 0.03), mat,
      );
      band.position.y = -0.2 - i * 0.075;
      band.position.z = 0.01;
      g.add(band);
    }
  } else {
    // Tier 0: a couple of scavenged plates lashed on, deliberately asymmetric.
    const patch = new THREE.Mesh(roughBox(0.2, 0.18, 0.06, rng, 0.1), material('iron', 0x5e574e, seed + 9));
    patch.position.set(-0.09, 0.04, 0.15 + bulk * 0.06);
    patch.rotation.z = rng.range(-0.2, 0.2);
    g.add(patch);
    const strap = new THREE.Mesh(roughBox(0.5, 0.05, 0.3, rng, 0.03), material('leather', 0x4a3626, seed + 10));
    strap.position.y = -0.08;
    strap.rotation.z = 0.22;
    g.add(strap);
  }

  if (spec.tier >= 2) {
    // A single engraved medallion. One accent, not a light show (§4).
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), accentMat(seed));
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, 0.1, 0.2 + bulk * 0.06);
    g.add(medal);
  }
  return g;
}

export function buildShoulder(spec: VisualSpec, seed: number, side: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + side * 17);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.45;

  // Pauldrons are the single biggest silhouette lever on an ARPG character,
  // which is why §2 calls out "hombros claramente reconocibles".
  const scale = 0.14 + bulk * 0.14;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(scale, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.6), mat,
  );
  cap.scale.set(1.25, 0.85, 1.15);
  g.add(cap);

  if (spec.tier >= 1) {
    for (let i = 0; i < 2; i++) {
      const lame = new THREE.Mesh(
        new THREE.SphereGeometry(scale * (0.92 - i * 0.12), 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat,
      );
      lame.scale.set(1.2, 0.55, 1.1);
      lame.position.y = -scale * (0.42 + i * 0.34);
      g.add(lame);
    }
  }

  const spikes = spec.spikes ?? 0;
  if (spikes > 0.2) {
    const count = Math.round(1 + spikes * 3);
    for (let i = 0; i < count; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.1 + spikes * 0.1, 5), mat);
      spike.position.set(
        side * (scale * 0.5),
        scale * 0.5,
        (i - (count - 1) / 2) * 0.07,
      );
      spike.rotation.z = side * -0.5;
      spike.rotation.x = rng.range(-0.15, 0.15);
      g.add(spike);
    }
  }
  return g;
}

export function buildGlove(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 2);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;

  // §3 asks for hands big enough to read a weapon against.
  const hand = new THREE.Mesh(roughBox(0.1 + bulk * 0.04, 0.13, 0.08 + bulk * 0.03, rng, 0.08), mat);
  g.add(hand);
  if (spec.tier >= 1) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062 + bulk * 0.02, 0.055, 0.1, 8), mat);
    cuff.position.y = 0.1;
    g.add(cuff);
  }
  if (spec.tier >= 2) {
    const knuckle = new THREE.Mesh(roughBox(0.09, 0.03, 0.04, rng), accentMat(seed));
    knuckle.position.set(0, 0.035, 0.05);
    g.add(knuckle);
  }
  return g;
}

export function buildBelt(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 3);
  const mat = matFor(spec, seed);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.09, 12), mat);
  g.add(belt);
  const buckle = new THREE.Mesh(roughBox(0.08, 0.07, 0.04, rng), accentMat(seed));
  buckle.position.z = 0.21;
  g.add(buckle);
  if (spec.tier >= 1) {
    // Hanging pouches and straps, which read as "equipped for a long walk".
    for (const side of [-1, 1]) {
      const pouch = new THREE.Mesh(roughBox(0.09, 0.12, 0.07, rng, 0.1), material('leather', 0x4a3626, seed + 4));
      pouch.position.set(side * 0.19, -0.09, 0.05);
      g.add(pouch);
    }
  }
  return g;
}

export function buildLegPiece(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 5);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;
  const thigh = new THREE.Mesh(roughBox(0.15 + bulk * 0.06, 0.3, 0.15 + bulk * 0.05, rng, 0.05), mat);
  g.add(thigh);
  if (spec.tier >= 1) {
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075 + bulk * 0.02, 8, 6), mat);
    knee.position.set(0, -0.16, 0.03);
    g.add(knee);
  }
  return g;
}

export function buildBoot(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 6);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;

  // §2 asks explicitly for visible boots.
  const foot = new THREE.Mesh(roughBox(0.12 + bulk * 0.03, 0.09, 0.26 + bulk * 0.05, rng, 0.06), mat);
  foot.position.z = 0.04;
  g.add(foot);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075 + bulk * 0.02, 0.085, 0.2, 8), mat);
  shaft.position.y = 0.13;
  g.add(shaft);
  if (spec.tier >= 2) {
    const plate = new THREE.Mesh(roughBox(0.11, 0.06, 0.1, rng), accentMat(seed));
    plate.position.set(0, 0.02, 0.14);
    g.add(plate);
  }
  return g;
}

/**
 * Cloaks are built as a segmented chain so the animator can trail them behind
 * the character — §2 explicitly asks for "capas y telas con movimiento".
 */
export function buildCloak(spec: VisualSpec, seed: number): { group: THREE.Group; segments: THREE.Object3D[] } {
  const group = new THREE.Group();
  const rng = new Rng(seed + 7);
  const mat = matFor(spec, seed);
  const length = spec.length ?? 0.8;
  const segments: THREE.Object3D[] = [];

  let parent: THREE.Object3D = group;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = i === 0 ? 0 : -(length * 0.9) / count;
    const width = 0.42 - i * 0.02;
    const panel = new THREE.Mesh(
      roughBox(width, (length * 0.95) / count, 0.02, rng, 0.04), mat,
    );
    panel.position.y = -(length * 0.95) / count / 2;
    pivot.add(panel);
    parent.add(pivot);
    segments.push(pivot);
    parent = pivot;
  }
  group.position.z = -0.14;
  return { group, segments };
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/**
 * Weapons are built pointing along +Y from the grip at the origin, so the hand
 * bone can simply hold them without per-weapon offsets.
 *
 * §2 requires distinctive silhouettes: the categories differ in proportion and
 * head shape, not just in length.
 */
export function buildWeapon(category: WeaponCategory, spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 13);
  const mat = matFor(spec, seed);
  const wood = material('wood', 0x5a4630, seed + 21);
  const leather = material('leather', 0x3f2e21, seed + 22);
  const length = spec.length ?? 0.45;
  const bulk = spec.bulk ?? 0.35;

  const grip = (len: number, radius = 0.024) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, len, 7), leather);
    m.position.y = len / 2 - 0.06;
    return m;
  };

  switch (category) {
    case 'sword': {
      g.add(grip(0.2));
      const guard = new THREE.Mesh(roughBox(0.03 + bulk * 0.02, 0.025, 0.24 + bulk * 0.08, rng), mat);
      guard.position.y = 0.15;
      g.add(guard);
      // Tapered blade: two stacked boxes read better than a cone at this size.
      const blade = new THREE.Mesh(roughBox(0.022 + bulk * 0.012, length, 0.075 + bulk * 0.03, rng, 0.02), mat);
      blade.position.y = 0.16 + length / 2;
      g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04 + bulk * 0.015, 0.1, 4), mat);
      tip.position.y = 0.16 + length + 0.04;
      tip.rotation.y = Math.PI / 4;
      tip.scale.z = 0.5;
      g.add(tip);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 6), mat);
      pommel.position.y = -0.07;
      g.add(pommel);
      break;
    }

    case 'axe': {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.027, 0.44, 7), wood).translateY(0.14));
      // A bearded head, weighted to one side — unmistakable in silhouette.
      const head = new THREE.Mesh(roughBox(0.035, 0.2 + bulk * 0.1, 0.1, rng, 0.05), mat);
      head.position.set(0, 0.32, 0.1 + bulk * 0.05);
      g.add(head);
      const beard = new THREE.Mesh(roughBox(0.03, 0.16, 0.06, rng, 0.08), mat);
      beard.position.set(0, 0.25, 0.14 + bulk * 0.05);
      beard.rotation.x = -0.3;
      g.add(beard);
      if ((spec.spikes ?? 0) > 0.2) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), mat);
        spike.position.set(0, 0.32, -0.06);
        spike.rotation.x = -Math.PI / 2;
        g.add(spike);
      }
      break;
    }

    case 'mace': {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.4, 7), wood).translateY(0.12));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075 + bulk * 0.04, 0.075 + bulk * 0.04, 0.16, 8), mat);
      head.position.y = 0.34;
      g.add(head);
      // Flanges: the thing that makes a mace read as a mace, not a stick.
      const flanges = 5 + Math.round((spec.spikes ?? 0.4) * 3);
      for (let i = 0; i < flanges; i++) {
        const a = (i / flanges) * Math.PI * 2;
        const flange = new THREE.Mesh(roughBox(0.03, 0.15, 0.055 + bulk * 0.03, rng), mat);
        flange.position.set(Math.cos(a) * (0.08 + bulk * 0.03), 0.34, Math.sin(a) * (0.08 + bulk * 0.03));
        flange.rotation.y = -a;
        g.add(flange);
      }
      break;
    }

    case 'dagger': {
      g.add(grip(0.13, 0.019));
      const guard = new THREE.Mesh(roughBox(0.02, 0.018, 0.1, rng), mat);
      guard.position.y = 0.085;
      g.add(guard);
      const blade = new THREE.Mesh(roughBox(0.016, length * 0.6, 0.04, rng, 0.02), mat);
      blade.position.y = 0.09 + length * 0.3;
      g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.07, 4), mat);
      tip.position.y = 0.09 + length * 0.6 + 0.03;
      tip.rotation.y = Math.PI / 4;
      g.add(tip);
      break;
    }

    case 'polearm': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, length, 7), wood);
      shaft.position.y = length / 2 - 0.25;
      g.add(shaft);
      const head = new THREE.Mesh(roughBox(0.022, 0.3, 0.085, rng, 0.03), mat);
      head.position.set(0, length - 0.1, 0.03);
      g.add(head);
      const hook = new THREE.Mesh(roughBox(0.02, 0.1, 0.12, rng, 0.06), mat);
      hook.position.set(0, length - 0.2, -0.07);
      hook.rotation.x = 0.6;
      g.add(hook);
      break;
    }

    case 'crossbow': {
      const stock = new THREE.Mesh(roughBox(0.05, 0.42, 0.08, rng, 0.03), wood);
      stock.position.y = 0.1;
      g.add(stock);
      // The bow limbs, across the stock — instantly distinct from a bow.
      const limb = new THREE.Mesh(roughBox(0.46 + bulk * 0.1, 0.035, 0.035, rng), mat);
      limb.position.y = 0.28;
      g.add(limb);
      for (const side of [-1, 1]) {
        const tipL = new THREE.Mesh(roughBox(0.09, 0.03, 0.03, rng), mat);
        tipL.position.set(side * (0.24 + bulk * 0.05), 0.26, 0);
        tipL.rotation.z = side * 0.4;
        g.add(tipL);
      }
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.5, 4), leather);
      string.rotation.z = Math.PI / 2;
      string.position.y = 0.22;
      g.add(string);
      break;
    }

    case 'stave': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.028, length, 8), wood);
      shaft.position.y = length / 2 - 0.3;
      g.add(shaft);
      // The head: a cage holding something, rather than a gem on a stick.
      const cage = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 4, 10, Math.PI), mat);
        rib.rotation.y = a;
        rib.rotation.x = Math.PI / 2;
        cage.add(rib);
      }
      cage.position.y = length - 0.26;
      g.add(cage);
      const coreMat = material('bone', 0xd0a060, seed + 33, {
        emissive: 0xd2762c, emissiveIntensity: (spec.accent ?? 0.4) * 1.6,
      });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.042, 0), coreMat);
      core.position.y = length - 0.26;
      core.name = 'staveCore';
      g.add(core);
      break;
    }

    case 'shield': {
      // Shields are built in the plane of the forearm, not along +Y.
      const size = 0.3 + bulk * 0.22;
      const board = new THREE.Mesh(roughBox(size, size * 1.25, 0.04, rng, 0.03), mat);
      g.add(board);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
      boss.rotation.x = -Math.PI / 2;
      boss.position.z = 0.03;
      g.add(boss);
      // Iron rim: reads as reinforcement, and breaks up the flat face.
      const rimMat = material('iron', 0x57524a, seed + 41);
      for (const [w, h, x, y] of [
        [size, 0.035, 0, size * 0.6], [size, 0.035, 0, -size * 0.6],
        [0.035, size * 1.25, size * 0.48, 0], [0.035, size * 1.25, -size * 0.48, 0],
      ] as const) {
        const bar = new THREE.Mesh(roughBox(w, h, 0.05, rng), rimMat);
        bar.position.set(x, y, 0.01);
        g.add(bar);
      }
      if (spec.tier >= 2) {
        const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), accentMat(seed));
        emblem.rotation.x = Math.PI / 2;
        emblem.position.z = 0.04;
        g.add(emblem);
      }
      break;
    }
  }

  for (const child of g.children) child.castShadow = true;
  return g;
}
