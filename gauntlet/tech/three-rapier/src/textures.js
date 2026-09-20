// Procedural PBR texture library. No external assets.
// Every material produces: albedo (sRGB), tangent-space normal, ORM (R=ao, G=roughness, B=metalness).
import * as THREE from 'three';

/* ------------------------------------------------------------------ noise */
function h2(ix, iy, s) {
  let n = (ix * 1619 + iy * 31337 + s * 6971) | 0;
  n = (n << 13) ^ n;
  return 1.0 - (((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0);
}
function vnoise(x, y, p, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const X0 = ((x0 % p) + p) % p, Y0 = ((y0 % p) + p) % p;
  const X1 = (X0 + 1) % p, Y1 = (Y0 + 1) % p;
  const a = h2(X0, Y0, s), b = h2(X1, Y0, s), c = h2(X0, Y1, s), d = h2(X1, Y1, s);
  const i1 = a + (b - a) * ux, i2 = c + (d - c) * ux;
  return i1 + (i2 - i1) * uy;
}
function fbm(x, y, p, oct, s, gain) {
  gain = gain === undefined ? 0.5 : gain;
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, p * f, s + i * 131);
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}
function ridged(x, y, p, oct, s) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * (1 - Math.abs(vnoise(x * f, y * f, p * f, s + i * 57)));
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
// tileable worley (cell) noise -> distance to nearest feature point
function worley(x, y, cells, s) {
  const cx = Math.floor(x * cells), cy = Math.floor(y * cells);
  let best = 10;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j;
    const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
    const px = (gx + 0.5 + 0.45 * h2(wx, wy, s)) / cells;
    const py = (gy + 0.5 + 0.45 * h2(wx, wy, s + 999)) / cells;
    const dx = px - x, dy = py - y;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best) * cells;
}
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------- texture io */
function dataTex(data, size, srgb, aniso) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.channel = 0;
  t.needsUpdate = true;
  return t;
}

/**
 * shade(u, v, out) must fill out: r,g,b (0..1 linear-ish sRGB values), h (height 0..1),
 * ro (roughness 0..1), me (metalness 0..1), ao (0..1)
 */
export function buildMaterialMaps(size, shade, aniso, normalStrength) {
  const n = size * size;
  const alb = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const hgt = new Float32Array(n);
  const out = { r: 0, g: 0, b: 0, h: 0.5, ro: 0.8, me: 0, ao: 1 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      out.r = out.g = out.b = 0.5; out.h = 0.5; out.ro = 0.8; out.me = 0; out.ao = 1;
      shade(x / size, y / size, out, x, y);
      alb[i * 4] = clamp(out.r, 0, 1) * 255;
      alb[i * 4 + 1] = clamp(out.g, 0, 1) * 255;
      alb[i * 4 + 2] = clamp(out.b, 0, 1) * 255;
      alb[i * 4 + 3] = 255;
      orm[i * 4] = clamp(out.ao, 0, 1) * 255;
      orm[i * 4 + 1] = clamp(out.ro, 0, 1) * 255;
      orm[i * 4 + 2] = clamp(out.me, 0, 1) * 255;
      orm[i * 4 + 3] = 255;
      hgt[i] = out.h;
    }
  }
  // sobel -> tangent-space normal
  const nrm = new Uint8Array(n * 4);
  const st = (normalStrength === undefined ? 2.2 : normalStrength) * size / 256;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = ((x - 1) + size) % size, xp = (x + 1) % size;
      const dx = (hgt[y * size + xm] - hgt[y * size + xp]) * st;
      const dy = (hgt[ym * size + x] - hgt[yp * size + x]) * st;
      let nx = dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = y * size + x;
      nrm[i * 4] = (nx * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[i * 4 + 3] = 255;
    }
  }
  return {
    map: dataTex(alb, size, true, aniso),
    normalMap: dataTex(nrm, size, false, aniso),
    orm: dataTex(orm, size, false, aniso),
  };
}

/* ------------------------------------------------------------ generators */

export function asphaltMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    // aggregate stones
    const w = worley(u, v, 42, 11);
    const w2 = worley(u, v, 90, 77);
    const grain = fbm(u * 96, v * 96, 96, 4, 5);
    const macro = fbm(u * 6, v * 6, 6, 4, 23);
    const stone = smoothstep(0.55, 0.15, w) * 0.55 + smoothstep(0.6, 0.2, w2) * 0.25;
    // slab joints every 0.25 uv (4 m at repeat 1 -> handled by uv repeat)
    const jx = Math.abs(((u * 2) % 1) - 0.5) * 2, jz = Math.abs(((v * 2) % 1) - 0.5) * 2;
    const joint = Math.max(smoothstep(0.965, 1.0, jx), smoothstep(0.965, 1.0, jz));
    // cracks
    const cr = ridged(u * 5, v * 5, 5, 4, 91);
    const crack = smoothstep(0.86, 0.985, cr) * (0.6 + 0.4 * macro);
    let base = 0.088 + 0.052 * macro + 0.05 * grain + 0.055 * stone;
    base = mix(base, 0.030, joint * 0.9);
    base = mix(base, 0.024, crack * 0.85);
    const tint = 0.015 * fbm(u * 3, v * 3, 3, 3, 400);
    o.r = base + tint * 1.4; o.g = base + tint; o.b = base * 0.97 + tint * 0.5;
    o.h = 0.5 + stone * 0.30 + grain * 0.10 - joint * 0.45 - crack * 0.35;
    o.ro = clamp(0.94 - stone * 0.18 + grain * 0.05 - crack * 0.05, 0.35, 1);
    o.me = 0;
    o.ao = clamp(1 - joint * 0.55 - crack * 0.4 - smoothstep(0.45, 0.0, w) * 0.15, 0.25, 1);
  }, aniso, 2.6);
}

export function polishedConcreteMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    const macro = fbm(u * 4, v * 4, 4, 4, 17);
    const grain = fbm(u * 128, v * 128, 128, 3, 43);
    const stain = smoothstep(0.35, 0.85, fbm(u * 7, v * 7, 7, 4, 301));
    const w = worley(u, v, 64, 5);
    const pit = smoothstep(0.22, 0.0, w);
    // control joints every half
    const jx = Math.abs(((u * 2) % 1) - 0.5) * 2, jz = Math.abs(((v * 2) % 1) - 0.5) * 2;
    const joint = Math.max(smoothstep(0.978, 1.0, jx), smoothstep(0.978, 1.0, jz));
    const scuff = smoothstep(0.55, 0.95, ridged(u * 14, v * 3, 14, 3, 707));
    let base = 0.185 + 0.075 * macro + 0.035 * grain - 0.055 * stain - 0.05 * pit;
    base = mix(base, 0.075, joint);
    base = mix(base, base * 0.78, scuff * 0.5);
    o.r = base * 1.03; o.g = base; o.b = base * 0.95;
    o.h = 0.5 + grain * 0.06 - pit * 0.5 - joint * 0.5;
    o.ro = clamp(0.30 + 0.30 * stain + 0.22 * pit + 0.30 * joint + 0.10 * grain + 0.18 * scuff, 0.14, 1);
    o.me = 0;
    o.ao = clamp(1 - joint * 0.6 - pit * 0.5 - stain * 0.2, 0.3, 1);
  }, aniso, 1.6);
}

export function wallConcreteMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    const macro = fbm(u * 3, v * 3, 3, 4, 61);
    const grain = fbm(u * 110, v * 110, 110, 3, 71);
    const w = worley(u, v, 30, 9);
    const pit = smoothstep(0.30, 0.0, w) * 0.8;
    // formwork panel seams: horizontal every 0.25, vertical every 0.5
    const sh = smoothstep(0.985, 1.0, Math.abs(((v * 4) % 1) - 0.5) * 2);
    const sv = smoothstep(0.99, 1.0, Math.abs(((u * 2) % 1) - 0.5) * 2);
    const seam = Math.max(sh, sv);
    // tie holes
    const th = smoothstep(0.10, 0.03, Math.hypot(((u * 4) % 1) - 0.5, ((v * 4) % 1) - 0.5));
    // rain streaks from the top
    const streak = smoothstep(0.5, 0.95, fbm(u * 40, v * 2.0, 40, 3, 133)) * smoothstep(0.0, 0.55, v);
    let base = 0.30 + 0.10 * macro + 0.05 * grain - pit * 0.10 - seam * 0.12 - th * 0.22;
    base = mix(base, base * 0.62, streak * 0.75);
    const warm = 0.018 * macro;
    o.r = base + warm; o.g = base + warm * 0.7; o.b = base * 0.965;
    o.h = 0.5 + grain * 0.08 - pit * 0.55 - seam * 0.6 - th * 0.8;
    o.ro = clamp(0.82 + 0.12 * grain - 0.06 * streak + 0.06 * pit, 0.5, 1);
    o.me = 0;
    o.ao = clamp(1 - seam * 0.5 - pit * 0.45 - th * 0.6 - streak * 0.2, 0.25, 1);
  }, aniso, 2.2);
}

export function paintedMetalMaps(size, aniso, rgb) {
  const [pr, pg, pb] = rgb;
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 150, v * 150, 150, 3, 211);
    const macro = fbm(u * 5, v * 5, 5, 4, 19);
    // chipped paint (worley islands) + edge wear along uv borders
    const w = worley(u, v, 22, 31);
    const chip = smoothstep(0.42, 0.14, w) * smoothstep(0.35, 0.65, fbm(u * 9, v * 9, 9, 3, 55));
    const edge = Math.max(smoothstep(0.93, 1.0, Math.abs(u - 0.5) * 2), smoothstep(0.93, 1.0, Math.abs(v - 0.5) * 2));
    const wear = clamp(chip * 1.2 + edge * (0.55 + 0.45 * macro), 0, 1);
    const scratch = smoothstep(0.80, 0.99, ridged(u * 26, v * 6, 26, 3, 313));
    const rust = smoothstep(0.45, 0.95, fbm(u * 12, v * 12, 12, 4, 401)) * wear;
    const dirt = smoothstep(0.42, 0.9, fbm(u * 6, v * 6, 6, 4, 611));
    let r = pr * (0.82 + 0.28 * macro + 0.08 * grain);
    let g = pg * (0.82 + 0.28 * macro + 0.08 * grain);
    let b = pb * (0.82 + 0.28 * macro + 0.08 * grain);
    // bare metal under the paint
    r = mix(r, 0.36 + 0.06 * grain, wear); g = mix(g, 0.355 + 0.06 * grain, wear); b = mix(b, 0.35 + 0.06 * grain, wear);
    r = mix(r, 0.24, rust * 0.8); g = mix(g, 0.115, rust * 0.8); b = mix(b, 0.055, rust * 0.8);
    r *= (1 - dirt * 0.22); g *= (1 - dirt * 0.24); b *= (1 - dirt * 0.26);
    r = mix(r, r * 1.35, scratch * 0.5); g = mix(g, g * 1.35, scratch * 0.5); b = mix(b, b * 1.35, scratch * 0.5);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + grain * 0.05 - wear * 0.28 - scratch * 0.12;
    o.ro = clamp(0.42 + 0.10 * macro - wear * 0.14 + rust * 0.45 + dirt * 0.14 - scratch * 0.18, 0.12, 1);
    o.me = clamp(0.06 + wear * 0.9 - rust * 0.55 + scratch * 0.35, 0, 1);
    o.ao = clamp(1 - chip * 0.28 - dirt * 0.15, 0.4, 1);
  }, aniso, 1.8);
}

export function rustMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 140, v * 140, 140, 3, 5);
    const blot = fbm(u * 8, v * 8, 8, 5, 88);
    const blot2 = fbm(u * 20, v * 20, 20, 4, 188);
    const w = worley(u, v, 26, 44);
    const flake = smoothstep(0.40, 0.08, w);
    const heavy = smoothstep(0.30, 0.80, blot);
    // horizontal barrel ribs
    const rib = Math.pow(Math.max(0, Math.sin(v * Math.PI * 12)), 8);
    const t = clamp(heavy * 0.8 + flake * 0.45 + blot2 * 0.25, 0, 1);
    let r = mix(0.30, 0.42, t) * (0.75 + 0.45 * grain + 0.3 * blot2);
    let g = mix(0.135, 0.175, t) * (0.75 + 0.45 * grain + 0.3 * blot2);
    let b = mix(0.075, 0.065, t) * (0.75 + 0.5 * grain);
    // remaining olive paint patches
    const paint = smoothstep(0.62, 0.30, blot) * (1 - flake * 0.8);
    r = mix(r, 0.115, paint); g = mix(g, 0.145, paint); b = mix(b, 0.105, paint);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + grain * 0.10 + t * 0.22 - flake * 0.30 + rib * 0.30;
    o.ro = clamp(0.92 - paint * 0.30 + grain * 0.06 - t * 0.05, 0.28, 1);
    o.me = clamp(0.75 - t * 0.62 - paint * 0.55, 0, 1);
    o.ao = clamp(1 - flake * 0.35 - heavy * 0.2, 0.35, 1);
  }, aniso, 2.4);
}

export function woodMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    // planks along u; 4 planks per tile
    const pv = v * 4;
    const plankId = Math.floor(pv);
    const pf = pv - plankId;
    const gap = Math.max(smoothstep(0.035, 0.0, pf), smoothstep(0.965, 1.0, pf));
    const off = h2(plankId, 3, 17) * 0.5;
    // grain: stretched noise + rings
    const gx = u * 7 + off, gy = pv * 2.2;
    const ringn = fbm(gx * 2.0, gy * 9.0, 16, 4, 29 + plankId * 13);
    const rings = Math.abs(Math.sin((gx * 8.0 + ringn * 3.4) * Math.PI));
    const fine = fbm(u * 220, pv * 26, 220, 3, 71);
    // knot
    const kx = 0.18 + 0.64 * h2(plankId, 9, 5) * 0.5 + 0.25;
    const kd = Math.hypot((u - kx) * 3.2, (pf - 0.5));
    const knot = smoothstep(0.30, 0.05, kd);
    const tone = 0.55 + 0.45 * h2(plankId, 1, 3);
    let base = (0.17 + 0.13 * rings + 0.05 * fine) * (0.75 + 0.45 * tone);
    base = mix(base, base * 0.42, knot);
    const dirt = smoothstep(0.45, 0.9, fbm(u * 5, v * 5, 5, 4, 909));
    base *= (1 - dirt * 0.30);
    o.r = base * 1.0; o.g = base * 0.68; o.b = base * 0.40;
    o.h = 0.5 + rings * 0.16 + fine * 0.10 - gap * 0.65 - knot * 0.25;
    o.ro = clamp(0.72 + 0.16 * rings + 0.08 * fine + dirt * 0.12 - knot * 0.12, 0.45, 1);
    o.me = 0;
    o.ao = clamp(1 - gap * 0.75 - knot * 0.3 - dirt * 0.15, 0.25, 1);
  }, aniso, 2.0);
}

export function rubberMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 180, v * 180, 180, 3, 3);
    const macro = fbm(u * 10, v * 10, 10, 3, 33);
    // tread blocks across u (around the tyre)
    const tb = Math.abs(((u * 24) % 1) - 0.5) * 2;
    const tl = Math.abs(((v * 3 + (Math.floor(u * 24) % 2) * 0.5) % 1) - 0.5) * 2;
    const groove = Math.max(smoothstep(0.55, 0.95, tb), smoothstep(0.75, 0.98, tl));
    const side = smoothstep(0.30, 0.10, Math.abs(v - 0.5) * 2) ;
    const dust = smoothstep(0.5, 0.95, fbm(u * 6, v * 6, 6, 4, 77));
    let base = 0.019 + 0.014 * macro + 0.010 * grain;
    base = mix(base, base * 0.55, groove);
    base = mix(base, base + 0.030, dust * 0.7);
    o.r = base * 1.02; o.g = base; o.b = base * 0.98;
    o.h = 0.5 + 0.22 - groove * 0.45 + grain * 0.08 - side * 0.12;
    o.ro = clamp(0.93 + 0.06 * grain - 0.05 * macro + dust * 0.05, 0.6, 1);
    o.me = 0;
    o.ao = clamp(1 - groove * 0.55, 0.3, 1);
  }, aniso, 2.6);
}

export function plasticMaps(size, aniso, rgb) {
  const [pr, pg, pb] = rgb;
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 200, v * 200, 200, 3, 123);
    const macro = fbm(u * 9, v * 9, 9, 3, 45);
    const scuff = smoothstep(0.72, 0.98, ridged(u * 30, v * 8, 30, 3, 66));
    const dirt = smoothstep(0.5, 0.95, fbm(u * 7, v * 7, 7, 4, 89));
    const k = 0.86 + 0.20 * macro + 0.06 * grain;
    let r = pr * k, g = pg * k, b = pb * k;
    r = mix(r, r * 1.4 + 0.08, scuff * 0.6); g = mix(g, g * 1.4 + 0.08, scuff * 0.6); b = mix(b, b * 1.4 + 0.08, scuff * 0.6);
    r *= (1 - dirt * 0.25); g *= (1 - dirt * 0.25); b *= (1 - dirt * 0.25);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + grain * 0.05 - scuff * 0.10;
    o.ro = clamp(0.36 + 0.16 * macro + scuff * 0.3 + dirt * 0.2, 0.15, 1);
    o.me = 0;
    o.ao = clamp(1 - dirt * 0.12, 0.6, 1);
  }, aniso, 1.2);
}

export function corrugatedMaps(size, aniso, rgb) {
  const [pr, pg, pb] = rgb;
  return buildMaterialMaps(size, (u, v, o) => {
    const ribs = Math.sin(u * Math.PI * 2 * 10);
    const ribMask = ribs * 0.5 + 0.5;
    const grain = fbm(u * 160, v * 160, 160, 3, 9);
    const macro = fbm(u * 6, v * 6, 6, 4, 21);
    const rust = smoothstep(0.52, 0.95, fbm(u * 11, v * 11, 11, 4, 55));
    const streak = smoothstep(0.55, 0.95, fbm(u * 50, v * 2.2, 50, 3, 143)) * smoothstep(0, 0.7, v);
    const shade = 0.70 + 0.44 * ribMask;
    let r = pr * shade * (0.85 + 0.3 * macro + 0.06 * grain);
    let g = pg * shade * (0.85 + 0.3 * macro + 0.06 * grain);
    let b = pb * shade * (0.85 + 0.3 * macro + 0.06 * grain);
    r = mix(r, 0.26, rust * 0.75); g = mix(g, 0.12, rust * 0.75); b = mix(b, 0.055, rust * 0.75);
    r = mix(r, r * 0.6, streak * 0.55); g = mix(g, g * 0.6, streak * 0.55); b = mix(b, b * 0.6, streak * 0.55);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + ribs * 0.42 + grain * 0.05 + rust * 0.06;
    o.ro = clamp(0.44 + rust * 0.45 + streak * 0.12 + 0.08 * grain, 0.2, 1);
    o.me = clamp(0.82 - rust * 0.66, 0, 1);
    o.ao = clamp(1 - (1 - ribMask) * 0.28 - rust * 0.12, 0.4, 1);
  }, aniso, 3.0);
}

export function gratingMaps(size, aniso) {
  // mezzanine deck: steel checker plate
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 170, v * 170, 170, 3, 13);
    const macro = fbm(u * 8, v * 8, 8, 3, 63);
    const cx = ((u * 8) % 1) - 0.5, cy = ((v * 8) % 1) - 0.5;
    const rot = (Math.floor(u * 8) + Math.floor(v * 8)) % 2;
    const ax = rot ? cx * 0.7 + cy * 0.7 : cx * 0.7 - cy * 0.7;
    const ay = rot ? -cx * 0.7 + cy * 0.7 : cx * 0.7 + cy * 0.7;
    const bar = smoothstep(0.30, 0.16, Math.abs(ay)) * smoothstep(0.34, 0.24, Math.abs(ax));
    const rust = smoothstep(0.58, 0.95, fbm(u * 10, v * 10, 10, 4, 77));
    const dirt = smoothstep(0.4, 0.9, fbm(u * 5, v * 5, 5, 4, 177));
    let base = (0.10 + 0.05 * macro + 0.03 * grain) * (1 + bar * 0.7);
    let r = base, g = base * 0.98, b = base * 0.96;
    r = mix(r, 0.22, rust * 0.7); g = mix(g, 0.10, rust * 0.7); b = mix(b, 0.05, rust * 0.7);
    r *= 1 - dirt * 0.25; g *= 1 - dirt * 0.25; b *= 1 - dirt * 0.25;
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + bar * 0.45 + grain * 0.05;
    o.ro = clamp(0.48 + rust * 0.42 + dirt * 0.15 - bar * 0.08, 0.2, 1);
    o.me = clamp(0.85 - rust * 0.6 - dirt * 0.15, 0, 1);
    o.ao = clamp(1 - (1 - bar) * 0.22 - dirt * 0.15, 0.4, 1);
  }, aniso, 2.0);
}

/* --------------------------------------------------- alpha / misc sprites */
export function chainLinkAlpha(size) {
  const data = new Uint8Array(size * size * 4);
  const cells = 9;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const a = ((u + v) * cells) % 1;
      const b = ((u - v) * cells + 10) % 1;
      const da = Math.abs(a - 0.5) * 2, db = Math.abs(b - 0.5) * 2;
      const w = 0.80;
      const on = (da > w ? 1 : 0) + (db > w ? 1 : 0);
      const lit = 0.55 + 0.45 * (da > w ? 1 : 0);
      const i = (y * size + x) * 4;
      const g = Math.floor(150 * lit);
      data[i] = g; data[i + 1] = g; data[i + 2] = Math.floor(g * 1.03);
      data[i + 3] = on > 0 ? 255 : 0;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

export function softSprite(size, hardness, seed) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
    const d = Math.hypot(u, v) * 2;
    let a = Math.pow(clamp(1 - d, 0, 1), hardness);
    if (seed !== undefined) {
      const n = fbm(u * 6 + 3, v * 6 + 3, 12, 4, seed) * 0.5 + 0.5;
      a *= (0.35 + 0.95 * n);
    }
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = clamp(a, 0, 1) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// large-scale variation map used to break tiling on the ground
export function macroVariation(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const a = fbm(u * 4, v * 4, 4, 5, 991) * 0.5 + 0.5;
    const b = fbm(u * 9, v * 9, 9, 4, 1991) * 0.5 + 0.5;
    const c = smoothstep(0.35, 0.8, fbm(u * 2.0, v * 2.0, 2, 3, 2991) * 0.5 + 0.5);
    const i = (y * size + x) * 4;
    data[i] = a * 255; data[i + 1] = b * 255; data[i + 2] = c * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

export function puddleMaps(size, aniso) {
  return buildMaterialMaps(size, (u, v, o) => {
    const ripple = fbm(u * 26, v * 26, 26, 4, 501);
    const grain = fbm(u * 120, v * 120, 120, 3, 601);
    const film = smoothstep(0.30, 0.72, fbm(u * 5, v * 5, 5, 4, 701) * 0.5 + 0.5);
    let base = 0.020 + 0.012 * grain;
    o.r = base * 1.0; o.g = base * 1.05; o.b = base * 1.15;
    o.h = 0.5 + ripple * 0.10;
    o.ro = clamp(0.045 + film * 0.16 + Math.abs(ripple) * 0.07, 0.02, 0.45);
    o.me = 0.08;
    o.ao = 1;
  }, aniso, 0.6);
}

export function signMaps(size) {
  // hazard sign: diagonal stripes + block text bars, worn
  return buildMaterialMaps(size, (u, v, o) => {
    const grain = fbm(u * 150, v * 150, 150, 3, 313);
    const macro = fbm(u * 7, v * 7, 7, 3, 413);
    const stripe = ((u * 6 + v * 2.0) % 1) < 0.5 ? 1 : 0;
    const border = (u < 0.06 || u > 0.94 || v < 0.10 || v > 0.90) ? 1 : 0;
    const band = (v > 0.34 && v < 0.62) ? 1 : 0;
    const wear = smoothstep(0.55, 0.95, fbm(u * 13, v * 13, 13, 4, 513));
    let r, g, b;
    if (band && !border) { // dark text band
      const glyph = (Math.floor(u * 16) % 3 !== 0 && u > 0.12 && u < 0.88) ? 1 : 0;
      r = glyph ? 0.03 : 0.72; g = glyph ? 0.03 : 0.62; b = glyph ? 0.03 : 0.06;
    } else {
      r = stripe ? 0.70 : 0.045; g = stripe ? 0.55 : 0.045; b = stripe ? 0.04 : 0.045;
    }
    const k = 0.85 + 0.25 * macro + 0.07 * grain;
    r *= k; g *= k; b *= k;
    r = mix(r, 0.22, wear * 0.55); g = mix(g, 0.11, wear * 0.55); b = mix(b, 0.06, wear * 0.55);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + grain * 0.06 - wear * 0.2;
    o.ro = clamp(0.42 + wear * 0.45 + 0.1 * macro, 0.2, 1);
    o.me = clamp(0.1 + wear * 0.35, 0, 1);
    o.ao = 1 - wear * 0.15;
  }, 4, 1.4);
}
