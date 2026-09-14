/**
 * Procedural texture generation (§5, §41, §42).
 *
 * Blender is not available in the build environment and the project has a zero
 * budget, so there are no downloaded texture files at all. Every surface in the
 * game is painted into a `<canvas>` at boot from value noise and stroke
 * primitives, then uploaded as a `CanvasTexture`.
 *
 * The brief is explicit that materials must not look plastic (§5), so each
 * generator builds a roughness map alongside the albedo: scratches on metal are
 * both lighter *and* smoother than the surrounding surface, leather creases are
 * darker and rougher, and so on. That correlation is most of what separates a
 * believable surface from a tinted plane.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';

const SIZE = 256;

function makeCanvas(size = SIZE): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

/** Tileable value noise. Octaves are summed with halving amplitude. */
function valueNoise(rng: Rng, size: number, cells: number, octaves = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const n = cells * Math.pow(2, o);
    // Wrap the lattice so the texture tiles without a visible seam.
    const lattice = new Float32Array(n * n);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx) % n;
        const y0 = Math.floor(fy) % n;
        const x1 = (x0 + 1) % n;
        const y1 = (y0 + 1) % n;
        const tx = fx - Math.floor(fx);
        const ty = fy - Math.floor(fy);
        // Smoothstep the interpolation so cells do not read as a grid.
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);

        const a = lattice[y0 * n + x0]!;
        const b = lattice[y0 * n + x1]!;
        const c = lattice[y1 * n + x0]!;
        const d = lattice[y1 * n + x1]!;
        const top = a + (b - a) * sx;
        const bottom = c + (d - c) * sx;
        out[y * size + x] += (top + (bottom - top) * sy) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }

  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function toDataTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  // Roughness and normal data must not be colour-managed.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Aged metal: a dark base, broad rust blooms, and bright scratches along the
 * edges where a real blade or plate gets handled most.
 */
export function metalSurface(seed: number, base: number, rustAmount = 0.5): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();

  const c = new THREE.Color(base);
  const grain = valueNoise(rng, SIZE, 6, 4);
  const rust = valueNoise(new Rng(seed + 7), SIZE, 3, 3);

  const img = ctx.createImageData(SIZE, SIZE);
  const rimg = rctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = grain[i]!;
    const r = rust[i]!;
    // Rust appears where the noise is high, tinted towards oxide orange.
    const rusty = Math.max(0, (r - (1 - rustAmount)) * 2.2);
    const shade = 0.68 + g * 0.5;

    const rr = (c.r * shade * 255) * (1 - rusty) + 122 * rusty;
    const gg = (c.g * shade * 255) * (1 - rusty) + 62 * rusty;
    const bb = (c.b * shade * 255) * (1 - rusty) + 38 * rusty;

    img.data[i * 4] = rr;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = bb;
    img.data[i * 4 + 3] = 255;

    // Rust is much rougher than bare metal; bare metal varies with grain.
    const rough = 0.32 + g * 0.22 + rusty * 0.5;
    const v = Math.min(255, rough * 255);
    rimg.data[i * 4] = v;
    rimg.data[i * 4 + 1] = v;
    rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // Scratches: brighter and smoother than the surface around them.
  ctx.lineCap = 'round';
  rctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(6, 44);
    const w = rng.range(0.5, 1.6);
    ctx.strokeStyle = `rgba(255,255,255,${rng.range(0.05, 0.2)})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();

    rctx.strokeStyle = `rgba(0,0,0,${rng.range(0.15, 0.4)})`;
    rctx.lineWidth = w;
    rctx.beginPath();
    rctx.moveTo(x, y);
    rctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    rctx.stroke();
  }

  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Boiled leather: creases, grain, a greasy sheen where it has been worn. */
export function leatherSurface(seed: number, base: number): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();

  const c = new THREE.Color(base);
  const grain = valueNoise(rng, SIZE, 14, 4);
  const blotch = valueNoise(new Rng(seed + 3), SIZE, 4, 3);

  const img = ctx.createImageData(SIZE, SIZE);
  const rimg = rctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = grain[i]!;
    const b = blotch[i]!;
    const shade = 0.6 + g * 0.35 + b * 0.25;
    img.data[i * 4] = c.r * shade * 255;
    img.data[i * 4 + 1] = c.g * shade * 255;
    img.data[i * 4 + 2] = c.b * shade * 255;
    img.data[i * 4 + 3] = 255;

    // Worn patches (high blotch) are greasier, so smoother.
    const rough = 0.86 - b * 0.34 + g * 0.1;
    const v = Math.max(0, Math.min(255, rough * 255));
    rimg.data[i * 4] = v;
    rimg.data[i * 4 + 1] = v;
    rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // Creases and stitch lines.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    const a = rng.range(0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,0,0,${rng.range(0.08, 0.2)})`;
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 1; s <= 5; s++) {
      ctx.lineTo(
        x + Math.cos(a + Math.sin(s) * 0.4) * s * 9,
        y + Math.sin(a + Math.cos(s) * 0.4) * s * 9,
      );
    }
    ctx.stroke();
  }
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Coarse woven cloth: visible weft, dirt at the hem, uniformly rough. */
export function clothSurface(seed: number, base: number): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();
  const c = new THREE.Color(base);
  const dirt = valueNoise(rng, SIZE, 3, 3);

  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    // Explicit weave: alternating warp and weft brightness.
    const weave = (Math.sin(x * 1.6) * 0.5 + 0.5) * 0.09 + (Math.sin(y * 1.6) * 0.5 + 0.5) * 0.09;
    const d = dirt[i]!;
    const shade = 0.62 + weave + d * 0.3;
    img.data[i * 4] = c.r * shade * 255;
    img.data[i * 4 + 1] = c.g * shade * 255;
    img.data[i * 4 + 2] = c.b * shade * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  rctx.fillStyle = rgb(226, 226, 226);
  rctx.fillRect(0, 0, SIZE, SIZE);

  // Tears and repairs.
  for (let i = 0; i < 8; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = rng.range(1, 2.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-18, 18), y + rng.range(-18, 18));
    ctx.stroke();
  }
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Timber: directional grain, knots, water-darkened patches. */
export function woodSurface(seed: number, base: number): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();
  const c = new THREE.Color(base);
  const warp = valueNoise(rng, SIZE, 3, 3);
  const damp = valueNoise(new Rng(seed + 11), SIZE, 2, 2);

  const img = ctx.createImageData(SIZE, SIZE);
  const rimg = rctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    // Rings: a sine along one axis, displaced by noise so it is not a barcode.
    const rings = Math.sin((y + warp[i]! * 34) * 0.42) * 0.5 + 0.5;
    const d = damp[i]!;
    const shade = (0.55 + rings * 0.34) * (1 - d * 0.35);
    img.data[i * 4] = c.r * shade * 255;
    img.data[i * 4 + 1] = c.g * shade * 255;
    img.data[i * 4 + 2] = c.b * shade * 255;
    img.data[i * 4 + 3] = 255;

    const v = Math.min(255, (0.72 + rings * 0.14 + d * 0.12) * 255);
    rimg.data[i * 4] = v;
    rimg.data[i * 4 + 1] = v;
    rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
    void x;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // Knots.
  for (let i = 0; i < 5; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    const r = rng.range(4, 11);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(20,14,10,0.85)');
    grad.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Mortared stone: blocks, damp, moss in the joints, accumulated grime. */
export function stoneSurface(seed: number, base: number, mossAmount = 0.25): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();
  const c = new THREE.Color(base);
  const grain = valueNoise(rng, SIZE, 8, 4);
  const damp = valueNoise(new Rng(seed + 5), SIZE, 3, 3);

  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = grain[i]!;
    const d = damp[i]!;
    const moss = Math.max(0, (d - (1 - mossAmount)) * 2.4);
    const shade = 0.6 + g * 0.42;
    const rr = c.r * shade * 255 * (1 - moss) + 62 * moss;
    const gg = c.g * shade * 255 * (1 - moss) + 74 * moss;
    const bb = c.b * shade * 255 * (1 - moss) + 44 * moss;
    img.data[i * 4] = rr;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = bb;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Block joints, drawn as darker mortar lines with slight row offset.
  const blockH = 32;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2.5;
  for (let row = 0; row * blockH < SIZE; row++) {
    const y = row * blockH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
    const offset = (row % 2) * (blockH * 1.2);
    for (let x = offset; x < SIZE; x += blockH * 2.4) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + blockH);
      ctx.stroke();
    }
  }
  // Cracks.
  for (let i = 0; i < 14; i++) {
    let x = rng.range(0, SIZE);
    let y = rng.range(0, SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = rng.range(0.6, 1.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += rng.range(-10, 10);
      y += rng.range(-10, 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  rctx.fillStyle = rgb(216, 216, 216);
  rctx.fillRect(0, 0, SIZE, SIZE);
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Earth: mud, gravel, patchy dead vegetation. Used for outdoor ground. */
export function groundSurface(seed: number, base: number, vegetation = 0.2): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();
  const c = new THREE.Color(base);
  const coarse = valueNoise(rng, SIZE, 4, 4);
  const fine = valueNoise(new Rng(seed + 2), SIZE, 20, 2);

  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = coarse[i]!;
    const b = fine[i]!;
    const veg = Math.max(0, (a - (1 - vegetation)) * 2.0);
    const shade = 0.55 + a * 0.4 + b * 0.16;
    img.data[i * 4] = c.r * shade * 255 * (1 - veg) + 78 * veg;
    img.data[i * 4 + 1] = c.g * shade * 255 * (1 - veg) + 84 * veg;
    img.data[i * 4 + 2] = c.b * shade * 255 * (1 - veg) + 46 * veg;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Scattered gravel.
  for (let i = 0; i < 220; i++) {
    const x = rng.range(0, SIZE);
    const y = rng.range(0, SIZE);
    ctx.fillStyle = `rgba(${rng.int(60, 110)},${rng.int(56, 100)},${rng.int(48, 86)},0.6)`;
    ctx.beginPath();
    ctx.arc(x, y, rng.range(0.6, 2.2), 0, Math.PI * 2);
    ctx.fill();
  }

  rctx.fillStyle = rgb(240, 240, 240);
  rctx.fillRect(0, 0, SIZE, SIZE);
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Bone and old ivory, for the ossuary and the Ashen's gear. */
export function boneSurface(seed: number, base = 0xc8b98a): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas();
  const { canvas: rc, ctx: rctx } = makeCanvas();
  const c = new THREE.Color(base);
  const grain = valueNoise(rng, SIZE, 10, 4);
  const stain = valueNoise(new Rng(seed + 9), SIZE, 3, 3);

  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = grain[i]!;
    const s = stain[i]!;
    const shade = (0.72 + g * 0.3) * (1 - s * 0.42);
    img.data[i * 4] = c.r * shade * 255;
    img.data[i * 4 + 1] = c.g * shade * 255;
    img.data[i * 4 + 2] = c.b * shade * 255 * 0.94;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.fillStyle = rgb(160, 160, 160);
  rctx.fillRect(0, 0, SIZE, SIZE);
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** Skin, deliberately weathered: sun, dirt, and the odd old scar (§3). */
export function skinSurface(seed: number, base: number): SurfaceMaps {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas(128);
  const { canvas: rc, ctx: rctx } = makeCanvas(128);
  const c = new THREE.Color(base);
  const grain = valueNoise(rng, 128, 12, 3);
  const dirt = valueNoise(new Rng(seed + 4), 128, 3, 2);

  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const g = grain[i]!;
    const d = dirt[i]!;
    const shade = (0.82 + g * 0.2) * (1 - d * 0.3);
    img.data[i * 4] = c.r * shade * 255;
    img.data[i * 4 + 1] = c.g * shade * 255;
    img.data[i * 4 + 2] = c.b * shade * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  for (let i = 0; i < 4; i++) {
    const x = rng.range(0, 128);
    const y = rng.range(0, 128);
    ctx.strokeStyle = 'rgba(150,110,96,0.5)';
    ctx.lineWidth = rng.range(1, 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-14, 14), y + rng.range(-14, 14));
    ctx.stroke();
  }

  rctx.fillStyle = rgb(180, 180, 180);
  rctx.fillRect(0, 0, 128, 128);
  return { map: toTexture(canvas), roughnessMap: toDataTexture(rc) };
}

/** A soft radial sprite, reused by every particle and glow in the game. */
export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(64);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** An irregular splat used for blood decals and scorch marks (§30). */
export function splatSprite(seed: number, colour: string): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const { canvas, ctx } = makeCanvas(128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = colour;
  // A cluster of overlapping blobs reads as a splatter rather than a circle.
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.pow(rng.next(), 1.6) * 40;
    const r = rng.range(5, 22) * (1 - d / 70);
    ctx.globalAlpha = rng.range(0.4, 0.95);
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, Math.max(2, r), 0, Math.PI * 2);
    ctx.fill();
  }
  // A few flung droplets.
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(30, 58);
    ctx.globalAlpha = rng.range(0.3, 0.7);
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rng.range(1, 3.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
