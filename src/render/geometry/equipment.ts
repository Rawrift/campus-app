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
import { band, loft, shell } from './loft';
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

/**
 * An armour lame: a curved, tapered plate.
 *
 * Real armour is built from overlapping plates, and it is the *overlap* that
 * reads at distance — a stack of four of these says "armour" where a single
 * smooth surface says "shape". Used for faulds, pauldrons and greaves.
 */
function lame(width: number, height: number, depth: number, curve = 0.35): THREE.BufferGeometry {
  return loft([
    { y: -height * 0.5, width: width * 0.46, depth: depth * 0.5, roundness: 4.5, offsetZ: -curve * depth * 0.5 },
    { y: -height * 0.1, width: width * 0.50, depth: depth * 0.56, roundness: 4.5 },
    { y:  height * 0.3, width: width * 0.49, depth: depth * 0.54, roundness: 4.5 },
    { y:  height * 0.5, width: width * 0.45, depth: depth * 0.48, roundness: 4.0, offsetZ: -curve * depth * 0.3 },
  ], { radialSegments: 12, smoothSteps: 2 });
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
    // A hood: a cowl with a real rim and an opening for the face, plus a
    // gathered drape at the back of the neck.
    const cowl = new THREE.Mesh(shell(0.135 + bulk * 0.045, {
      arc: Math.PI * 0.66, sweep: Math.PI * 1.55, thickness: 0.014,
      segments: 14, scaleX: 1.12, scaleY: 1.26, scaleZ: 1.2,
    }), mat);
    cowl.rotation.y = -Math.PI * 0.775;
    cowl.position.y = 0.012;
    g.add(cowl);

    const drape = new THREE.Mesh(loft([
      { y:  0.04, width: 0.10, depth: 0.045, roundness: 3 },
      { y: -0.06, width: 0.115, depth: 0.05, roundness: 3 },
      { y: -0.16, width: 0.09, depth: 0.04, roundness: 2.6 },
    ], { radialSegments: 10, smoothSteps: 3 }), mat);
    drape.position.set(0, -0.02, -0.10);
    drape.rotation.x = -0.28;
    g.add(drape);
  } else {
    // A skull cap that grows into a full helm as the tier rises. Built as a
    // shell so the rim has thickness and catches an edge highlight.
    const radius = 0.125 + bulk * 0.03;
    const cap = new THREE.Mesh(shell(radius, {
      arc: Math.PI * (0.52 + bulk * 0.12), thickness: 0.013, segments: 16,
      scaleX: 1.1, scaleY: 1.18 + bulk * 0.2, scaleZ: 1.14,
    }), mat);
    cap.position.y = 0.008;
    g.add(cap);

    // A brow band: the strongest single read on a helmet at distance.
    const brow = new THREE.Mesh(loft([
      { y: -0.012, width: radius * 1.11, depth: radius * 1.16, roundness: 2.6 },
      { y:  0.016, width: radius * 1.13, depth: radius * 1.18, roundness: 2.6 },
    ], { radialSegments: 16, smooth: false, capStart: false, capEnd: false }), mat);
    brow.position.y = -0.008;
    g.add(brow);

    if (spec.tier >= 1) {
      // Nasal bar and cheek plates — why a helm reads as a helm, not a bowl.
      const nasal = new THREE.Mesh(band(0.15, 0.030, 0.016, { curve: 0.012, taper: 0.7 }), mat);
      nasal.position.set(0, -0.048, radius * 1.12);
      g.add(nasal);
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(lame(0.055, 0.105, 0.05, 0.5), mat);
        cheek.position.set(side * (radius * 0.86), -0.056, radius * 0.42);
        cheek.rotation.set(0.12, side * 0.5, side * 0.16);
        g.add(cheek);
      }
    }
    if (spec.tier >= 2) {
      // A crest: the single strongest silhouette cue in the whole kit.
      const crest = new THREE.Mesh(loft([
        { y: -0.15, width: 0.012, depth: 0.016, roundness: 1.6 },
        { y: -0.02, width: 0.014, depth: 0.052, roundness: 1.5 },
        { y:  0.09, width: 0.013, depth: 0.040, roundness: 1.5 },
        { y:  0.15, width: 0.010, depth: 0.018, roundness: 1.6 },
      ], { radialSegments: 8, smoothSteps: 3 }), accentMat(seed));
      crest.rotation.x = Math.PI / 2;
      crest.position.set(0, radius * 1.02, -0.01);
      g.add(crest);
      for (let i = 0; i < 3; i++) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), accentMat(seed));
        stud.position.set(0, -0.012, radius * 0.9 - i * 0.055);
        g.add(stud);
      }
    }
  }
  void rng;
  return g;
}

export function buildTorso(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 1);
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.4;
  // Sits a little proud of the body underneath, so it reads as worn over it.
  const pad = 0.016 + bulk * 0.022;

  if (spec.material === 'cloth') {
    // A robe: follows the torso, then falls open and wide past the hips.
    const robe = new THREE.Mesh(loft([
      { y:  0.24, width: 0.175 + pad, depth: 0.105 + pad, roundness: 3.2 },
      { y:  0.10, width: 0.196 + pad, depth: 0.126 + pad, roundness: 3.3 },
      { y: -0.08, width: 0.172 + pad, depth: 0.118 + pad, roundness: 3.2 },
      { y: -0.26, width: 0.168 + pad, depth: 0.120 + pad, roundness: 3.0 },
      { y: -0.52, width: 0.228, depth: 0.176, roundness: 2.8 },
      { y: -0.74, width: 0.268, depth: 0.212, roundness: 2.6 },
    ], { radialSegments: 16, smoothSteps: 3, capEnd: false }), mat);
    g.add(robe);
    // A sash, which gives the robe a waist instead of a straight fall.
    const sash = new THREE.Mesh(loft([
      { y: -0.10, width: 0.176 + pad, depth: 0.124 + pad, roundness: 3.2 },
      { y: -0.19, width: 0.180 + pad, depth: 0.128 + pad, roundness: 3.2 },
    ], { radialSegments: 14, smooth: false, capStart: false, capEnd: false }),
      material('cloth', 0x5a4636, seed + 12));
    g.add(sash);
  } else {
    // A cuirass: a fitted shell with a raised centre ridge down the sternum.
    const cuirass = new THREE.Mesh(loft([
      { y:  0.25, width: 0.172 + pad, depth: 0.100 + pad, roundness: 3.3 },
      { y:  0.15, width: 0.196 + pad, depth: 0.122 + pad, roundness: 3.4 },
      { y:  0.02, width: 0.190 + pad, depth: 0.130 + pad, roundness: 3.4 },
      { y: -0.14, width: 0.166 + pad, depth: 0.114 + pad, roundness: 3.2 },
      { y: -0.26, width: 0.150 + pad, depth: 0.102 + pad, roundness: 3.1 },
    ], { radialSegments: 16, smoothSteps: 3, capEnd: false }), mat);
    g.add(cuirass);

    if (spec.tier >= 1) {
      const ridge = new THREE.Mesh(loft([
        { y: -0.22, width: 0.016, depth: 0.014, roundness: 2 },
        { y:  0.00, width: 0.022, depth: 0.026, roundness: 2 },
        { y:  0.20, width: 0.016, depth: 0.016, roundness: 2 },
      ], { radialSegments: 8, smoothSteps: 3 }), mat);
      ridge.position.z = 0.128 + pad;
      g.add(ridge);
    }

    // Overlapping fauld lames below the waist.
    const bands = spec.tier === 2 ? 4 : spec.tier === 1 ? 3 : 2;
    for (let i = 0; i < bands; i++) {
      const plate = new THREE.Mesh(
        lame((0.30 + bulk * 0.10) - i * 0.012, 0.085, 0.22 + bulk * 0.06, 0.4), mat,
      );
      plate.position.set(0, -0.30 - i * 0.062, 0.006);
      plate.rotation.x = 0.05 + i * 0.03;
      g.add(plate);
    }

    if (spec.tier === 0) {
      // Tier 0 is scavenged: an off-centre plate lashed on with a strap.
      const patch = new THREE.Mesh(
        lame(0.16, 0.16, 0.10, 0.6), material('iron', 0x5e574e, seed + 9),
      );
      patch.position.set(-0.075, 0.03, 0.118 + pad);
      patch.rotation.set(0.1, 0, rng.range(-0.24, 0.24));
      g.add(patch);
      for (const [y, rot] of [[-0.02, 0.24], [-0.13, -0.16]] as const) {
        const strap = new THREE.Mesh(
          band(0.46, 0.044, 0.016, { curve: 0.02 }),
          material('leather', 0x4a3626, seed + 10),
        );
        strap.position.set(0, y, 0.104 + pad);
        strap.rotation.z = Math.PI / 2 + rot;
        g.add(strap);
      }
    }
  }

  if (spec.tier >= 2) {
    // A single engraved medallion. One accent, not a light show (§4).
    const medal = new THREE.Mesh(loft([
      { y: 0, width: 0.052, depth: 0.052, roundness: 2 },
      { y: 0.012, width: 0.044, depth: 0.044, roundness: 2 },
    ], { radialSegments: 14, smooth: false }), accentMat(seed));
    medal.rotation.x = -Math.PI / 2;
    medal.position.set(0, 0.10, 0.136 + pad);
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
  // which is why §2 calls out "hombros claramente reconocibles". Built as a
  // domed cap with overlapping lames hanging from it.
  const radius = 0.10 + bulk * 0.085;
  const cap = new THREE.Mesh(shell(radius, {
    arc: Math.PI * 0.56, thickness: 0.013, segments: 14,
    scaleX: 1.24, scaleY: 0.92, scaleZ: 1.12,
  }), mat);
  g.add(cap);

  const lames = spec.tier === 2 ? 3 : spec.tier === 1 ? 2 : 1;
  for (let i = 0; i < lames; i++) {
    const plate = new THREE.Mesh(
      lame(radius * (2.0 - i * 0.18), radius * 0.56, radius * 1.7, 0.46), mat,
    );
    plate.position.set(side * radius * 0.10, -radius * (0.52 + i * 0.40), 0);
    plate.rotation.z = side * (0.10 + i * 0.06);
    g.add(plate);
  }

  const spikes = spec.spikes ?? 0;
  if (spikes > 0.2) {
    const count = Math.round(1 + spikes * 3);
    for (let i = 0; i < count; i++) {
      const spike = new THREE.Mesh(loft([
        { y: 0, width: 0.020, depth: 0.020, roundness: 2.2 },
        { y: 0.05 + spikes * 0.05, width: 0.011, depth: 0.011, roundness: 2 },
        { y: 0.10 + spikes * 0.11, width: 0.002, depth: 0.002, roundness: 2 },
      ], { radialSegments: 7, smoothSteps: 2 }), mat);
      spike.position.set(
        side * (radius * 0.52), radius * 0.62,
        (i - (count - 1) / 2) * (radius * 0.48),
      );
      spike.rotation.z = side * -0.55;
      spike.rotation.x = rng.range(-0.14, 0.14);
      g.add(spike);
    }
  }
  return g;
}

export function buildGlove(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;

  // §3 asks for hands big enough to read a weapon against.
  const hand = new THREE.Mesh(loft([
    { y:  0.010, width: 0.036 + bulk * 0.010, depth: 0.026, roundness: 3.0 },
    { y: -0.045, width: 0.042 + bulk * 0.012, depth: 0.029, roundness: 3.2 },
    { y: -0.100, width: 0.037 + bulk * 0.010, depth: 0.025, roundness: 3.0 },
  ], { radialSegments: 10, smoothSteps: 3, domeEnd: true }), mat);
  g.add(hand);

  if (spec.tier >= 1) {
    // A flared cuff that covers the wrist.
    const cuff = new THREE.Mesh(loft([
      { y: 0.020, width: 0.036 + bulk * 0.012, depth: 0.032, roundness: 2.8 },
      { y: 0.075, width: 0.046 + bulk * 0.016, depth: 0.040, roundness: 2.8 },
      { y: 0.115, width: 0.043 + bulk * 0.014, depth: 0.038, roundness: 2.8 },
    ], { radialSegments: 12, smoothSteps: 2, capStart: false }), mat);
    g.add(cuff);
  }
  if (spec.tier >= 2) {
    for (let i = 0; i < 3; i++) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.011, 7, 6), accentMat(seed));
      knuckle.position.set((i - 1) * 0.024, -0.035, 0.026);
      g.add(knuckle);
    }
  }
  return g;
}

export function buildBelt(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(seed + 3);
  const mat = matFor(spec, seed);

  const belt = new THREE.Mesh(loft([
    { y: -0.048, width: 0.148, depth: 0.112, roundness: 3.1 },
    { y:  0.000, width: 0.154, depth: 0.118, roundness: 3.1 },
    { y:  0.048, width: 0.148, depth: 0.112, roundness: 3.1 },
  ], { radialSegments: 16, smoothSteps: 2, capStart: false, capEnd: false }), mat);
  g.add(belt);

  const buckle = new THREE.Mesh(roughBox(0.062, 0.058, 0.020, rng, 0.05), accentMat(seed));
  buckle.position.z = 0.122;
  g.add(buckle);

  if (spec.tier >= 1) {
    // Hanging pouches, which read as "equipped for a long walk".
    for (const side of [-1, 1]) {
      const pouch = new THREE.Mesh(loft([
        { y:  0.010, width: 0.032, depth: 0.024, roundness: 3 },
        { y: -0.050, width: 0.040, depth: 0.030, roundness: 3.2 },
        { y: -0.095, width: 0.033, depth: 0.025, roundness: 3 },
      ], { radialSegments: 10, smoothSteps: 3, domeEnd: true }),
        material('leather', 0x4a3626, seed + 4));
      pouch.position.set(side * 0.128, -0.040, 0.040);
      pouch.rotation.z = side * 0.16;
      g.add(pouch);
    }
  }
  return g;
}

export function buildLegPiece(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;
  const pad = 0.012 + bulk * 0.014;

  const thigh = new THREE.Mesh(loft([
    { y:  0.090, width: 0.083 + pad, depth: 0.081 + pad, roundness: 2.9 },
    { y: -0.010, width: 0.080 + pad, depth: 0.078 + pad, roundness: 2.8 },
    { y: -0.130, width: 0.068 + pad, depth: 0.066 + pad, roundness: 2.7 },
  ], { radialSegments: 12, smoothSteps: 3, capStart: false, capEnd: false }), mat);
  g.add(thigh);

  if (spec.tier >= 1) {
    // A domed knee cop — the piece that makes greaves read as plate.
    const knee = new THREE.Mesh(shell(0.062 + bulk * 0.016, {
      arc: Math.PI * 0.6, thickness: 0.011, segments: 12, scaleZ: 1.1,
    }), mat);
    knee.position.set(0, -0.168, 0.012);
    knee.rotation.x = Math.PI * 0.52;
    g.add(knee);
  }
  return g;
}

export function buildBoot(spec: VisualSpec, seed: number): THREE.Group {
  const g = new THREE.Group();
  const mat = matFor(spec, seed);
  const bulk = spec.bulk ?? 0.3;

  // §2 asks explicitly for visible boots. Foot swept along Z with an arch.
  const foot = new THREE.Mesh(loft([
    { y: -0.105, width: 0.044 + bulk * 0.008, depth: 0.034, roundness: 3.2 },
    { y: -0.030, width: 0.052 + bulk * 0.010, depth: 0.042, roundness: 3.4 },
    { y:  0.055, width: 0.050 + bulk * 0.010, depth: 0.034, roundness: 3.4 },
    { y:  0.120, width: 0.038 + bulk * 0.008, depth: 0.024, roundness: 3.0 },
  ], { radialSegments: 10, smoothSteps: 3, domeEnd: true }), mat);
  foot.rotation.x = Math.PI / 2;
  foot.position.set(0, -0.030, 0.014);
  g.add(foot);

  // A flared shaft up the ankle.
  const shaft = new THREE.Mesh(loft([
    { y: 0.010, width: 0.048 + bulk * 0.010, depth: 0.044 + bulk * 0.010, roundness: 2.8 },
    { y: 0.110, width: 0.056 + bulk * 0.014, depth: 0.050 + bulk * 0.012, roundness: 2.8 },
    { y: 0.185, width: 0.062 + bulk * 0.018, depth: 0.054 + bulk * 0.014, roundness: 2.7 },
  ], { radialSegments: 12, smoothSteps: 3, capStart: false }), mat);
  g.add(shaft);

  if (spec.tier >= 2) {
    const plate = new THREE.Mesh(lame(0.075, 0.055, 0.06, 0.5), accentMat(seed));
    plate.position.set(0, 0.020, 0.058);
    plate.rotation.x = 0.6;
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

  /** A wrapped grip: slightly barrelled, so the hand has something to hold. */
  const grip = (len: number, r = 0.017) => {
    const m = new THREE.Mesh(loft([
      { y: -len * 0.5, width: r * 1.15, depth: r * 0.95, roundness: 2.6 },
      { y: 0, width: r, depth: r * 0.84, roundness: 2.6 },
      { y: len * 0.5, width: r * 1.12, depth: r * 0.92, roundness: 2.6 },
    ], { radialSegments: 10, smoothSteps: 3 }), leather);
    m.position.y = len / 2 - 0.055;
    return m;
  };

  /**
   * A blade.
   *
   * The cross-section is the whole point: a superellipse exponent below 2 gives
   * a lens, and near 1 a diamond, which is exactly what a blade's section is.
   * A box cannot do this, and it is the difference between a sword and a plank.
   */
  const blade = (
    len: number, halfWidth: number, thickness: number, ricasso: number, taper: number,
  ) => {
    const sections = [
      { y: 0, width: thickness * 1.1, depth: halfWidth * ricasso, roundness: 1.5 },
      { y: len * 0.12, width: thickness, depth: halfWidth, roundness: 1.35 },
      { y: len * 0.55, width: thickness * 0.9, depth: halfWidth * 0.95, roundness: 1.3 },
      { y: len * 0.84, width: thickness * 0.7, depth: halfWidth * taper, roundness: 1.3 },
      { y: len, width: thickness * 0.16, depth: halfWidth * 0.12, roundness: 1.4 },
    ];
    return new THREE.Mesh(loft(sections, { radialSegments: 12, smoothSteps: 4 }), mat);
  };

  switch (category) {
    case 'sword': {
      g.add(grip(0.185));
      // A crossguard that tapers to its tips and curves slightly forward.
      const guard = new THREE.Mesh(loft([
        { y: -0.115 - bulk * 0.04, width: 0.010, depth: 0.012, roundness: 2 },
        { y: -0.05, width: 0.016, depth: 0.024, roundness: 2.4, offsetZ: 0.006 },
        { y:  0.00, width: 0.020, depth: 0.030, roundness: 2.6, offsetZ: 0.008 },
        { y:  0.05, width: 0.016, depth: 0.024, roundness: 2.4, offsetZ: 0.006 },
        { y:  0.115 + bulk * 0.04, width: 0.010, depth: 0.012, roundness: 2 },
      ], { radialSegments: 10, smoothSteps: 3 }), mat);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.145;
      g.add(guard);

      const b = blade(length, 0.036 + bulk * 0.016, 0.010 + bulk * 0.004, 0.82, 0.7);
      b.position.y = 0.155;
      g.add(b);

      const pommel = new THREE.Mesh(loft([
        { y: -0.024, width: 0.014, depth: 0.014, roundness: 2.4 },
        { y:  0.000, width: 0.026, depth: 0.024, roundness: 2.6 },
        { y:  0.022, width: 0.016, depth: 0.015, roundness: 2.4 },
      ], { radialSegments: 10, smoothSteps: 3 }), mat);
      pommel.position.y = -0.072;
      g.add(pommel);
      break;
    }

    case 'axe': {
      const haft = new THREE.Mesh(loft([
        { y: -0.10, width: 0.018, depth: 0.014, roundness: 2.8 },
        { y:  0.14, width: 0.020, depth: 0.015, roundness: 2.8 },
        { y:  0.38, width: 0.017, depth: 0.013, roundness: 2.8 },
      ], { radialSegments: 10, smoothSteps: 3 }), wood);
      g.add(haft);

      // A bearded head: a socket, a thin web, and a flared cutting edge that
      // drops below the haft. Unmistakable in silhouette.
      const head = new THREE.Mesh(loft([
        { y: -0.075, width: 0.014, depth: 0.030, roundness: 1.8, offsetZ: 0.062 + bulk * 0.045 },
        { y: -0.020, width: 0.011, depth: 0.052, roundness: 1.6, offsetZ: 0.070 + bulk * 0.052 },
        { y:  0.045, width: 0.010, depth: 0.060, roundness: 1.5, offsetZ: 0.066 + bulk * 0.050 },
        { y:  0.100, width: 0.013, depth: 0.034, roundness: 1.7, offsetZ: 0.052 + bulk * 0.038 },
      ], { radialSegments: 12, smoothSteps: 4 }), mat);
      head.position.y = 0.31;
      g.add(head);

      // The socket that binds it to the haft.
      const socket = new THREE.Mesh(loft([
        { y: -0.045, width: 0.026, depth: 0.024, roundness: 3 },
        { y:  0.045, width: 0.028, depth: 0.026, roundness: 3 },
      ], { radialSegments: 10, smooth: false }), mat);
      socket.position.y = 0.31;
      g.add(socket);

      if ((spec.spikes ?? 0) > 0.2) {
        const spike = new THREE.Mesh(loft([
          { y: 0, width: 0.016, depth: 0.016, roundness: 2.2 },
          { y: 0.09, width: 0.003, depth: 0.003, roundness: 2 },
        ], { radialSegments: 7, smoothSteps: 2 }), mat);
        spike.position.set(0, 0.31, -0.045);
        spike.rotation.x = -Math.PI / 2;
        g.add(spike);
      }
      break;
    }

    case 'mace': {
      const haft = new THREE.Mesh(loft([
        { y: -0.10, width: 0.019, depth: 0.019, roundness: 2.6 },
        { y:  0.12, width: 0.020, depth: 0.020, roundness: 2.6 },
        { y:  0.30, width: 0.018, depth: 0.018, roundness: 2.6 },
      ], { radialSegments: 10, smoothSteps: 3 }), wood);
      g.add(haft);

      const core = new THREE.Mesh(loft([
        { y: -0.085, width: 0.030, depth: 0.030, roundness: 2.6 },
        { y: -0.030, width: 0.046 + bulk * 0.016, depth: 0.046 + bulk * 0.016, roundness: 2.8 },
        { y:  0.035, width: 0.046 + bulk * 0.016, depth: 0.046 + bulk * 0.016, roundness: 2.8 },
        { y:  0.085, width: 0.028, depth: 0.028, roundness: 2.6 },
      ], { radialSegments: 12, smoothSteps: 3 }), mat);
      core.position.y = 0.335;
      g.add(core);

      // Flanges: tapered blades set around the head, which is what makes a
      // mace read as a mace rather than as a stick with a ball on it.
      const flanges = 5 + Math.round((spec.spikes ?? 0.4) * 3);
      for (let i = 0; i < flanges; i++) {
        const a = (i / flanges) * Math.PI * 2;
        const flange = new THREE.Mesh(loft([
          { y: -0.072, width: 0.010, depth: 0.018, roundness: 1.8 },
          { y:  0.000, width: 0.011, depth: 0.038 + bulk * 0.018, roundness: 1.5 },
          { y:  0.072, width: 0.010, depth: 0.016, roundness: 1.8 },
        ], { radialSegments: 10, smoothSteps: 3 }), mat);
        flange.position.set(
          Math.cos(a) * (0.048 + bulk * 0.018), 0.335, Math.sin(a) * (0.048 + bulk * 0.018),
        );
        flange.rotation.y = -a;
        g.add(flange);
      }
      break;
    }

    case 'dagger': {
      g.add(grip(0.115, 0.013));
      const guard = new THREE.Mesh(loft([
        { y: -0.048, width: 0.008, depth: 0.009, roundness: 2 },
        { y:  0.000, width: 0.013, depth: 0.018, roundness: 2.4 },
        { y:  0.048, width: 0.008, depth: 0.009, roundness: 2 },
      ], { radialSegments: 8, smoothSteps: 3 }), mat);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.082;
      g.add(guard);
      const b = blade(length * 0.62, 0.020, 0.007, 0.8, 0.55);
      b.position.y = 0.090;
      g.add(b);
      break;
    }

    case 'polearm': {
      const shaft = new THREE.Mesh(loft([
        { y: -0.26, width: 0.016, depth: 0.016, roundness: 2.6 },
        { y:  length * 0.4, width: 0.018, depth: 0.018, roundness: 2.6 },
        { y:  length - 0.16, width: 0.015, depth: 0.015, roundness: 2.6 },
      ], { radialSegments: 10, smoothSteps: 3 }), wood);
      g.add(shaft);
      // A glaive head: a long curved blade with a back hook.
      const head = new THREE.Mesh(loft([
        { y: 0.00, width: 0.010, depth: 0.024, roundness: 1.7 },
        { y: 0.11, width: 0.009, depth: 0.044, roundness: 1.4, offsetZ: 0.012 },
        { y: 0.24, width: 0.008, depth: 0.036, roundness: 1.4, offsetZ: 0.022 },
        { y: 0.33, width: 0.002, depth: 0.004, roundness: 1.5, offsetZ: 0.026 },
      ], { radialSegments: 10, smoothSteps: 4 }), mat);
      head.position.y = length - 0.17;
      g.add(head);
      const hook = new THREE.Mesh(loft([
        { y: 0.00, width: 0.008, depth: 0.020, roundness: 1.8 },
        { y: 0.07, width: 0.006, depth: 0.012, roundness: 1.8, offsetZ: -0.020 },
        { y: 0.11, width: 0.002, depth: 0.003, roundness: 2, offsetZ: -0.036 },
      ], { radialSegments: 8, smoothSteps: 3 }), mat);
      hook.position.set(0, length - 0.21, -0.022);
      g.add(hook);
      break;
    }

    case 'crossbow': {
      const stock = new THREE.Mesh(loft([
        { y: -0.14, width: 0.024, depth: 0.020, roundness: 3.2 },
        { y: -0.02, width: 0.022, depth: 0.030, roundness: 3.4 },
        { y:  0.16, width: 0.019, depth: 0.026, roundness: 3.2 },
        { y:  0.30, width: 0.016, depth: 0.020, roundness: 3.0 },
      ], { radialSegments: 10, smoothSteps: 3 }), wood);
      g.add(stock);
      // Recurved limbs, swept across the stock.
      for (const side of [-1, 1]) {
        const limb = new THREE.Mesh(loft([
          { y: 0.00, width: 0.013, depth: 0.016, roundness: 2.4 },
          { y: 0.11, width: 0.010, depth: 0.012, roundness: 2.2, offsetZ: -0.018 },
          { y: 0.20 + bulk * 0.05, width: 0.006, depth: 0.008, roundness: 2.2, offsetZ: -0.052 },
        ], { radialSegments: 8, smoothSteps: 3 }), mat);
        limb.position.set(0, 0.27, 0);
        limb.rotation.z = side * Math.PI * 0.5;
        limb.rotation.y = side * 0.1;
        g.add(limb);
      }
      const string = new THREE.Mesh(loft([
        { y: -0.24 - bulk * 0.05, width: 0.0035, depth: 0.0035, roundness: 2 },
        { y:  0.24 + bulk * 0.05, width: 0.0035, depth: 0.0035, roundness: 2 },
      ], { radialSegments: 6, smooth: false }), leather);
      string.rotation.z = Math.PI / 2;
      string.position.set(0, 0.225, -0.050);
      g.add(string);
      break;
    }

    case 'stave': {
      const shaft = new THREE.Mesh(loft([
        { y: -0.30, width: 0.016, depth: 0.016, roundness: 2.6 },
        { y: -0.05, width: 0.019, depth: 0.019, roundness: 2.5, offsetX: 0.006 },
        { y:  length * 0.5, width: 0.017, depth: 0.017, roundness: 2.5 },
        { y:  length - 0.30, width: 0.021, depth: 0.021, roundness: 2.4, offsetX: -0.005 },
      ], { radialSegments: 10, smoothSteps: 4 }), wood);
      g.add(shaft);

      // A cage of ribs holding something, rather than a gem on a stick.
      const cage = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.0075, 5, 12, Math.PI), mat);
        rib.rotation.y = a;
        rib.rotation.x = Math.PI / 2;
        cage.add(rib);
      }
      cage.position.y = length - 0.26;
      g.add(cage);

      const coreMat = material('bone', 0xd0a060, seed + 33, {
        emissive: 0xd2762c, emissiveIntensity: (spec.accent ?? 0.4) * 1.6,
      });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.036, 1), coreMat);
      core.position.y = length - 0.26;
      core.name = 'staveCore';
      g.add(core);
      break;
    }

    case 'shield': {
      // Built in the plane of the forearm: a dished, curved face rather than a
      // flat board, so light rakes across it.
      const size = 0.26 + bulk * 0.20;
      const face = new THREE.Mesh(shell(size * 1.15, {
        arc: Math.PI * 0.42, thickness: 0.018, segments: 16,
        scaleX: 1.0, scaleY: 1.0, scaleZ: 1.22,
      }), mat);
      face.rotation.x = -Math.PI / 2;
      g.add(face);

      // An iron rim around the edge.
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.93, 0.016, 6, 22),
        material('iron', 0x57524a, seed + 41),
      );
      rim.scale.z = 1.2;
      g.add(rim);

      const boss = new THREE.Mesh(loft([
        { y: 0.000, width: 0.052, depth: 0.052, roundness: 2.6 },
        { y: 0.030, width: 0.040, depth: 0.040, roundness: 2.4 },
        { y: 0.052, width: 0.016, depth: 0.016, roundness: 2.2 },
      ], { radialSegments: 12, smoothSteps: 3, domeEnd: true }), mat);
      boss.position.z = 0.032;
      boss.rotation.x = Math.PI / 2;
      g.add(boss);

      if (spec.tier >= 2) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.014, 7, 6), accentMat(seed));
          stud.position.set(Math.cos(a) * size * 0.62, Math.sin(a) * size * 0.62, 0.026);
          g.add(stud);
        }
      }
      break;
    }
  }

  void rng;
  for (const child of g.children) child.castShadow = true;
  return g;
}
