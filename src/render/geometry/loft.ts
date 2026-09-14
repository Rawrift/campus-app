/**
 * Lofted mesh construction.
 *
 * The single most important geometry tool in the project. Everything organic —
 * torsos, limbs, necks, pauldrons, cloaks, tree trunks, bones — is built by
 * sweeping a cross-section along an axis and letting the section change shape
 * as it goes. That is what separates a body from a stack of cylinders.
 *
 * Cross-sections are **superellipses**, so one parameter moves continuously
 * from a circle to a rounded rectangle. A chest wants to be a rounded box, an
 * arm wants to be a near-circle, and a shin wants to be somewhere between: with
 * a superellipse that is one number rather than three different primitives.
 *
 *     |x/w|^n + |z/d|^n = 1        n = 2 → ellipse,  n → ∞ → rectangle
 */

import * as THREE from 'three';

export interface Section {
  /** Position along the sweep axis. */
  y: number;
  /** Half-extent across X. */
  width: number;
  /** Half-extent across Z. */
  depth: number;
  /** Superellipse exponent: 2 is an ellipse, 4 is soft-square, 8 is boxy. */
  roundness?: number;
  /** Lateral offset, for shapes that lean or curve (a hunched back, a horn). */
  offsetX?: number;
  offsetZ?: number;
  /** Rotation of this section about the sweep axis, in radians. */
  twist?: number;
}

/** A point on a superellipse of half-extents (w, d) at parameter `t`. */
function superPoint(t: number, w: number, d: number, n: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  if (n === 2) return [c * w, s * d];
  const e = 2 / n;
  return [
    Math.sign(c) * Math.pow(Math.abs(c), e) * w,
    Math.sign(s) * Math.pow(Math.abs(s), e) * d,
  ];
}

/** Catmull-Rom through four scalars — used to smooth the section list. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function at(list: Section[], i: number): Section {
  return list[Math.max(0, Math.min(list.length - 1, i))]!;
}

/**
 * Resamples a section list through a Catmull-Rom spline.
 *
 * Authoring six or seven key sections by hand and letting the spline produce
 * forty is what makes a limb read as muscle rather than as a taper: the bulges
 * and hollows between the keys come out curved instead of faceted.
 */
export function smoothSections(sections: Section[], stepsPerSpan = 4): Section[] {
  if (sections.length < 2) return sections;
  const out: Section[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const p0 = at(sections, i - 1);
    const p1 = at(sections, i);
    const p2 = at(sections, i + 1);
    const p3 = at(sections, i + 2);
    const steps = i === sections.length - 2 ? stepsPerSpan + 1 : stepsPerSpan;
    for (let s = 0; s < steps; s++) {
      const t = s / stepsPerSpan;
      out.push({
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        width: Math.max(0.001, catmull(p0.width, p1.width, p2.width, p3.width, t)),
        depth: Math.max(0.001, catmull(p0.depth, p1.depth, p2.depth, p3.depth, t)),
        roundness: catmull(
          p0.roundness ?? 2, p1.roundness ?? 2, p2.roundness ?? 2, p3.roundness ?? 2, t,
        ),
        offsetX: catmull(p0.offsetX ?? 0, p1.offsetX ?? 0, p2.offsetX ?? 0, p3.offsetX ?? 0, t),
        offsetZ: catmull(p0.offsetZ ?? 0, p1.offsetZ ?? 0, p2.offsetZ ?? 0, p3.offsetZ ?? 0, t),
        twist: catmull(p0.twist ?? 0, p1.twist ?? 0, p2.twist ?? 0, p3.twist ?? 0, t),
      });
    }
  }
  return out;
}

export interface LoftOptions {
  /** Points around each cross-section. 12-16 reads smooth at ARPG distance. */
  radialSegments?: number;
  /** Run the section list through the spline first. */
  smooth?: boolean;
  smoothSteps?: number;
  capStart?: boolean;
  capEnd?: boolean;
  /** Rounds the end caps into a dome instead of a flat disc. */
  domeStart?: boolean;
  domeEnd?: boolean;
}

/**
 * Sweeps a cross-section along Y, producing a closed, smooth-shaded mesh.
 *
 * UVs run around the section in U and along the sweep in V, so the procedural
 * material textures (leather grain, cloth weave, mail) follow the form rather
 * than projecting through it.
 */
export function loft(sections: Section[], opts: LoftOptions = {}): THREE.BufferGeometry {
  const radial = opts.radialSegments ?? 14;
  let list = opts.smooth === false ? sections : smoothSections(sections, opts.smoothSteps ?? 4);

  // Dome caps are built by appending sections that shrink along a quarter
  // circle, which turns a flat lid into a rounded end without a separate mesh.
  if (opts.domeStart) {
    const first = list[0]!;
    const span = Math.min(first.width, first.depth);
    const dome: Section[] = [];
    for (let i = 4; i >= 1; i--) {
      const a = (i / 5) * (Math.PI / 2);
      dome.push({
        ...first,
        y: first.y - Math.cos(a) * span * 0.85,
        width: first.width * Math.sin(a),
        depth: first.depth * Math.sin(a),
      });
    }
    list = [...dome.reverse(), ...list];
  }
  if (opts.domeEnd) {
    const last = list[list.length - 1]!;
    const span = Math.min(last.width, last.depth);
    for (let i = 1; i <= 4; i++) {
      const a = (i / 5) * (Math.PI / 2);
      list.push({
        ...last,
        y: last.y + Math.sin(a) * span * 0.85,
        width: last.width * Math.cos(a),
        depth: last.depth * Math.cos(a),
      });
    }
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < list.length; s++) {
    const sec = list[s]!;
    const n = sec.roundness ?? 2;
    const twist = sec.twist ?? 0;
    const v = s / (list.length - 1);
    for (let r = 0; r <= radial; r++) {
      const t = (r / radial) * Math.PI * 2;
      const [px, pz] = superPoint(t + twist, sec.width, sec.depth, n);
      positions.push(px + (sec.offsetX ?? 0), sec.y, pz + (sec.offsetZ ?? 0));
      uvs.push(r / radial, v);
    }
  }

  const ring = radial + 1;
  for (let s = 0; s < list.length - 1; s++) {
    for (let r = 0; r < radial; r++) {
      const a = s * ring + r;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Flat caps where a dome was not requested.
  const capAt = (sIndex: number, flip: boolean) => {
    const sec = list[sIndex]!;
    const centre = positions.length / 3;
    positions.push(sec.offsetX ?? 0, sec.y, sec.offsetZ ?? 0);
    uvs.push(0.5, 0.5);
    for (let r = 0; r < radial; r++) {
      const a = sIndex * ring + r;
      const b = a + 1;
      if (flip) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  };
  if ((opts.capStart ?? true) && !opts.domeStart) capAt(0, false);
  if ((opts.capEnd ?? true) && !opts.domeEnd) capAt(list.length - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A curved shell: a patch of a sphere-like surface, open on one side.
 *
 * Pauldrons, helmets, shield faces and ribcages are all this shape. Building
 * them as a shell rather than as a squashed sphere means the inside is hollow
 * and the rim has a real edge, which is what catches the light.
 */
export function shell(
  radius: number,
  opts: {
    /** How far around the sphere the shell reaches, in radians. */
    arc?: number;
    /** Sweep about the vertical axis. */
    sweep?: number;
    thickness?: number;
    segments?: number;
    /** Squash factors. */
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
  } = {},
): THREE.BufferGeometry {
  const arc = opts.arc ?? Math.PI * 0.55;
  const sweep = opts.sweep ?? Math.PI * 2;
  const seg = opts.segments ?? 14;
  const thickness = opts.thickness ?? radius * 0.13;
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;
  const sz = opts.scaleZ ?? 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rings = seg;
  const cols = Math.max(3, Math.round((seg * sweep) / (Math.PI * 2)) + 1);

  // Outer surface, then inner surface offset inwards, then a rim joining them.
  for (const [layer, r] of [[0, radius], [1, radius - thickness]] as const) {
    for (let i = 0; i <= rings; i++) {
      const phi = (i / rings) * arc;
      for (let j = 0; j < cols; j++) {
        const theta = (j / (cols - 1)) * sweep;
        positions.push(
          Math.sin(phi) * Math.cos(theta) * r * sx,
          Math.cos(phi) * r * sy,
          Math.sin(phi) * Math.sin(theta) * r * sz,
        );
        uvs.push(j / (cols - 1), i / rings);
      }
      void layer;
    }
  }

  const layerSize = (rings + 1) * cols;
  const quad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, b, d, c);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const o = i * cols + j;
      quad(o, o + cols, o + 1, o + cols + 1);
      const k = layerSize + o;
      // Inner surface wound the other way so it faces inward.
      quad(k + 1, k + cols + 1, k, k + cols);
    }
  }
  // Rim around the open bottom edge.
  for (let j = 0; j < cols - 1; j++) {
    const o = rings * cols + j;
    quad(o + 1, o, layerSize + o + 1, layerSize + o);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A tapered, slightly curved strap or band — belts, buckles, bindings, the
 * cross-straps that hold improvised armour together.
 */
export function band(
  length: number, width: number, thickness: number,
  opts: { curve?: number; segments?: number; taper?: number } = {},
): THREE.BufferGeometry {
  const seg = opts.segments ?? 8;
  const curve = opts.curve ?? 0;
  const taper = opts.taper ?? 1;
  const sections: Section[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    sections.push({
      y: (t - 0.5) * length,
      width: width * (1 - (1 - taper) * t) * 0.5,
      depth: thickness * 0.5,
      roundness: 5,
      offsetZ: Math.sin(t * Math.PI) * curve,
    });
  }
  return loft(sections, { radialSegments: 8, smooth: false });
}

/** Adds noise to every vertex, so nothing looks machine-made. */
export function roughen(
  geo: THREE.BufferGeometry, amount: number, seed = 1,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + rand() * amount,
      pos.getY(i) + rand() * amount,
      pos.getZ(i) + rand() * amount,
    );
  }
  geo.computeVertexNormals();
  return geo;
}
