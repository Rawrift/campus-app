// ---------------------------------------------------------------------------
// Generacion PROCEDURAL de texturas PBR (albedo / normal / ORM) en CPU.
// ORM: R = ambient occlusion, G = roughness, B = metallic  (packing de Babylon
// PBRMaterial.metallicTexture con useRoughnessFromMetallicTextureGreen +
// useMetallnessFromMetallicTextureBlue + useAmbientOcclusionFromMetallicTextureRed)
// ---------------------------------------------------------------------------
import { RawTexture, Texture, Constants } from '@babylonjs/core';
import { fbm, ridged, worley, vnoise, clamp01, smoothstep, lerp, hash2i } from './noise.js';

const W = (a, b) => ((a % b) + b) % b;

function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = W(y - 1, size) * size, yp = W(y + 1, size) * size, yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = W(x - 1, size), xp = W(x + 1, size);
      const dx = (h[yc + xm] - h[yc + xp]) * strength;
      const dy = (h[ym + x] - h[yp + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yc + x) * 4;
      out[i] = (dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// oclusion de cavidad barata: altura menos altura suavizada
function cavityAO(h, size, radius, amount) {
  const blur = new Float32Array(size * size);
  const tmp = new Float32Array(size * size);
  const r = radius | 0;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) {
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += h[yc + W(x + k, size)];
      tmp[yc + x] = s * inv;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[W(y + k, size) * size + x];
      blur[y * size + x] = s * inv;
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < ao.length; i++) ao[i] = clamp01(1 + (h[i] - blur[i]) * amount);
  return ao;
}

/**
 * fn(u, v) -> [r, g, b, height, rough, metal, ao]  (todo 0..1, color en sRGB)
 */
export function makeMaps(scene, name, size, fn, opts = {}) {
  const px = size * size;
  const alb = new Uint8Array(px * 4);
  const orm = new Uint8Array(px * 4);
  const hgt = new Float32Array(px);
  const rgh = new Float32Array(px);
  const met = new Float32Array(px);
  const aoc = new Float32Array(px);
  const o = [0, 0, 0, 0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      fn(x / size, v, o, x, y);
      const i = y * size + x, j = i * 4;
      alb[j] = clamp01(o[0]) * 255; alb[j + 1] = clamp01(o[1]) * 255;
      alb[j + 2] = clamp01(o[2]) * 255; alb[j + 3] = 255;
      hgt[i] = o[3]; rgh[i] = o[4]; met[i] = o[5]; aoc[i] = o[6];
    }
  }
  const cav = cavityAO(hgt, size, opts.aoRadius ?? 3, opts.aoAmount ?? 2.2);
  for (let i = 0; i < px; i++) {
    const j = i * 4;
    orm[j] = clamp01(aoc[i] * cav[i]) * 255;
    orm[j + 1] = clamp01(rgh[i]) * 255;
    orm[j + 2] = clamp01(met[i]) * 255;
    orm[j + 3] = 255;
  }
  const nrm = normalFromHeight(hgt, size, opts.normalStrength ?? 12);

  const mk = (data, tname, gamma) => {
    const t = RawTexture.CreateRGBATexture(data, size, size, scene, true, false,
      Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    t.name = name + '_' + tname;
    t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.gammaSpace = gamma;
    t.anisotropicFilteringLevel = 4;
    return t;
  };
  return { albedo: mk(alb, 'alb', true), normal: mk(nrm, 'nrm', false), orm: mk(orm, 'orm', false) };
}

export function makeAlphaTexture(scene, name, size, fn) {
  const data = new Uint8Array(size * size * 4);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, o);
    const j = (y * size + x) * 4;
    data[j] = clamp01(o[0]) * 255; data[j + 1] = clamp01(o[1]) * 255;
    data[j + 2] = clamp01(o[2]) * 255; data[j + 3] = clamp01(o[3]) * 255;
  }
  const t = RawTexture.CreateRGBATexture(data, size, size, scene, true, false,
    Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  t.name = name;
  t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.hasAlpha = true;
  return t;
}

// ======================= RECETAS DE MATERIAL =============================

// Hormigon exterior sucio, arido visible, manchas de aceite y grietas.
export function recipeConcreteExt(u, v, o) {
  const x = u * 8, y = v * 8;
  const grit = fbm(x * 12, y * 12, 96, 11, 4);
  const agg = 1 - smoothstep(0.02, 0.22, worley(x * 10, y * 10, 80, 3));
  const macro = fbm(x, y, 8, 5, 5);
  const stain = smoothstep(0.52, 0.78, fbm(x * 1.6, y * 1.6, 13, 23, 4));
  const crackRaw = ridged(x * 2.2, y * 2.2, 18, 41, 4);
  const crack = smoothstep(0.80, 0.97, crackRaw);
  let h = grit * 0.35 + agg * 0.28 + macro * 0.4 - crack * 0.9;
  const base = 0.30 + macro * 0.16 + grit * 0.10 + agg * 0.12;
  let r = base * 1.02, g = base * 1.0, b = base * 0.95;
  // manchas de aceite/humedad
  r = lerp(r, r * 0.42, stain); g = lerp(g, g * 0.44, stain); b = lerp(b, b * 0.52, stain);
  // arido claro
  r += agg * 0.06; g += agg * 0.055; b += agg * 0.05;
  r *= (1 - crack * 0.6); g *= (1 - crack * 0.6); b *= (1 - crack * 0.6);
  o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  o[4] = clamp01(0.86 - stain * 0.30 + grit * 0.10 - agg * 0.06);
  o[5] = 0.0;
  o[6] = clamp01(1 - crack * 0.55 - stain * 0.12);
}

// Muro de hormigon encofrado: vetas verticales, juntas, coqueras.
export function recipeConcreteWall(u, v, o) {
  const x = u * 6, y = v * 6;
  const grit = fbm(x * 16, y * 16, 96, 71, 4);
  const macro = fbm(x * 1.2, y * 1.2, 8, 17, 5);
  const streak = fbm(x * 5, y * 0.35, 48, 29, 4);           // chorretones verticales
  const drip = smoothstep(0.55, 0.85, streak) * smoothstep(0.1, 0.6, v);
  const holes = 1 - smoothstep(0.0, 0.06, worley(x * 14, y * 14, 96, 53));
  const seamY = Math.abs(((v * 3) % 1) - 0.5);
  const seam = 1 - smoothstep(0.0, 0.035, seamY);
  let h = grit * 0.3 + macro * 0.45 - holes * 0.8 - seam * 0.55;
  const base = 0.40 + macro * 0.17 + grit * 0.08;
  let r = base, g = base * 0.985, b = base * 0.945;
  r = lerp(r, r * 0.55, drip * 0.8); g = lerp(g, g * 0.56, drip * 0.8); b = lerp(b, b * 0.60, drip * 0.8);
  const rust = smoothstep(0.72, 0.95, fbm(x * 3, y * 3, 24, 88, 4)) * 0.6;
  r = lerp(r, 0.32, rust); g = lerp(g, 0.17, rust); b = lerp(b, 0.09, rust);
  r *= (1 - seam * 0.35); g *= (1 - seam * 0.35); b *= (1 - seam * 0.35);
  o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  o[4] = clamp01(0.88 - drip * 0.22 + grit * 0.06);
  o[5] = 0.0;
  o[6] = clamp01(1 - holes * 0.7 - seam * 0.4);
}

// Hormigon pulido interior: mas liso, brillo, juntas de dilatacion, marcas de rueda.
export function recipeConcretePolished(u, v, o) {
  const x = u * 4, y = v * 4;
  const grit = fbm(x * 20, y * 20, 128, 5, 3);
  const macro = fbm(x * 1.1, y * 1.1, 8, 91, 5);
  const swirl = fbm(x * 3 + macro * 2, y * 3 + macro * 2, 24, 44, 4);
  const jx = Math.abs(((u * 2) % 1) - 0.5), jy = Math.abs(((v * 2) % 1) - 0.5);
  const joint = Math.max(1 - smoothstep(0.0, 0.012, jx), 1 - smoothstep(0.0, 0.012, jy));
  const dirt = smoothstep(0.45, 0.85, fbm(x * 2.2, y * 2.2, 16, 63, 4));
  let h = grit * 0.16 + macro * 0.22 - joint * 1.0;
  const base = 0.33 + macro * 0.13 + swirl * 0.07 + grit * 0.04;
  let r = base, g = base * 0.99, b = base * 0.96;
  r = lerp(r, r * 0.55, dirt * 0.7); g = lerp(g, g * 0.55, dirt * 0.7); b = lerp(b, b * 0.58, dirt * 0.7);
  r *= (1 - joint * 0.55); g *= (1 - joint * 0.55); b *= (1 - joint * 0.55);
  o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  o[4] = clamp01(0.30 + swirl * 0.22 + dirt * 0.34 + joint * 0.5);
  o[5] = 0.0;
  o[6] = clamp01(1 - joint * 0.6 - dirt * 0.1);
}

// Metal pintado con desgaste: la pintura salta y aparece acero desnudo (metallic 1).
export function recipePaintedMetal(u, v, o) {
  const x = u * 4, y = v * 4;
  const brush = fbm(x * 40, y * 3, 128, 13, 3);
  const macro = fbm(x * 2, y * 2, 16, 37, 5);
  const chipMask = smoothstep(0.60, 0.74, fbm(x * 6, y * 6, 48, 77, 5));
  const scratch = smoothstep(0.88, 0.99, ridged(x * 9, y * 9, 72, 21, 3));
  const wear = clamp01(chipMask + scratch * 0.8);
  const dirt = smoothstep(0.5, 0.9, fbm(x * 3, y * 1.2, 24, 9, 4));
  let h = macro * 0.25 + brush * 0.1 - chipMask * 0.45 - scratch * 0.3;
  // pintura base (gris azulado industrial, se tinta con albedoColor)
  let pr = 0.62 + macro * 0.1, pg = 0.64 + macro * 0.1, pb = 0.66 + macro * 0.1;
  pr *= 1 - dirt * 0.35; pg *= 1 - dirt * 0.35; pb *= 1 - dirt * 0.38;
  // metal expuesto
  const mr = 0.52 + brush * 0.18, mg = 0.53 + brush * 0.18, mb = 0.55 + brush * 0.18;
  o[0] = lerp(pr, mr, wear); o[1] = lerp(pg, mg, wear); o[2] = lerp(pb, mb, wear);
  o[3] = h;
  o[4] = clamp01(lerp(0.42 + dirt * 0.22 + macro * 0.08, 0.32 + brush * 0.25, wear));
  o[5] = clamp01(wear * 0.95 + 0.03);
  o[6] = clamp01(1 - chipMask * 0.25);
}

// Chapa grecada (contenedores): nervios verticales marcados + pintura desgastada.
export function recipeCorrugated(u, v, o) {
  recipePaintedMetal(u, v, o);
  const rib = Math.cos(u * Math.PI * 2 * 8);
  const ribS = Math.sign(rib) * Math.pow(Math.abs(rib), 0.45);
  o[3] = o[3] * 0.35 + ribS * 0.85;
  const shade = 0.82 + ribS * 0.18;
  o[0] *= shade; o[1] *= shade; o[2] *= shade;
  o[6] = clamp01(o[6] * (0.80 + 0.2 * (ribS * 0.5 + 0.5)));
}

// Metal oxidado (bidones): costra de oxido, metallic variable.
export function recipeRust(u, v, o) {
  const x = u * 4, y = v * 4;
  const macro = fbm(x * 2.2, y * 2.2, 16, 101, 5);
  const fine = fbm(x * 18, y * 18, 128, 55, 4);
  const flake = 1 - smoothstep(0.02, 0.2, worley(x * 12, y * 12, 96, 31));
  const rustMask = clamp01(smoothstep(0.35, 0.72, macro) + flake * 0.35);
  const deep = smoothstep(0.65, 0.95, macro);
  let h = fine * 0.35 + macro * 0.35 + flake * 0.35 - deep * 0.4;
  // acero pintado que queda
  let pr = 0.30 + macro * 0.12, pg = 0.32 + macro * 0.12, pb = 0.33 + macro * 0.12;
  // oxido
  const rr = lerp(0.45, 0.24, deep) + fine * 0.14;
  const rg = lerp(0.20, 0.10, deep) + fine * 0.07;
  const rb = lerp(0.075, 0.045, deep) + fine * 0.03;
  o[0] = lerp(pr, rr, rustMask); o[1] = lerp(pg, rg, rustMask); o[2] = lerp(pb, rb, rustMask);
  o[3] = h;
  o[4] = clamp01(lerp(0.45 + fine * 0.15, 0.93 - fine * 0.08, rustMask));
  o[5] = clamp01(lerp(0.92, 0.05, rustMask));
  o[6] = clamp01(1 - flake * 0.4 - deep * 0.25);
}

// Madera: vetas, nudos, canto desgastado.
export function recipeWood(u, v, o) {
  const x = u * 3, y = v * 3;
  const warp = fbm(x * 2.5, y * 0.7, 24, 5, 4) * 1.6;
  const rings = Math.abs(Math.sin((y * 5.5 + warp) * Math.PI * 2.2));
  const grain = fbm(x * 3, y * 42, 96, 67, 3);
  const knotD = worley(x * 1.4, y * 1.4, 12, 19);
  const knot = 1 - smoothstep(0.0, 0.18, knotD);
  const dirt = smoothstep(0.48, 0.9, fbm(x * 2, y * 2, 16, 83, 4));
  const t = clamp01(rings * 0.72 + grain * 0.28);
  let r = lerp(0.46, 0.235, t), g = lerp(0.33, 0.145, t), b = lerp(0.195, 0.082, t);
  r = lerp(r, 0.14, knot * 0.85); g = lerp(g, 0.085, knot * 0.85); b = lerp(b, 0.05, knot * 0.85);
  r *= 1 - dirt * 0.3; g *= 1 - dirt * 0.3; b *= 1 - dirt * 0.28;
  o[0] = r; o[1] = g; o[2] = b;
  o[3] = (1 - t) * 0.35 + grain * 0.25 - knot * 0.55;
  o[4] = clamp01(0.58 + t * 0.22 + dirt * 0.14 - knot * 0.1);
  o[5] = 0.0;
  o[6] = clamp01(1 - knot * 0.5 - dirt * 0.15);
}

// Goma de neumatico: negro muy rugoso con microrelieve.
export function recipeRubber(u, v, o) {
  const x = u * 6, y = v * 6;
  const micro = fbm(x * 26, y * 26, 96, 7, 3);
  const macro = fbm(x * 4, y * 4, 24, 43, 4);
  const b = 0.030 + micro * 0.022 + macro * 0.012;
  o[0] = b; o[1] = b * 1.02; o[2] = b * 1.06;
  o[3] = micro * 0.5 + macro * 0.3;
  o[4] = clamp01(0.86 + micro * 0.12);
  o[5] = 0.0;
  o[6] = clamp01(0.85 + macro * 0.15);
}

// Plastico industrial: piel de naranja, algo sucio.
export function recipePlastic(u, v, o) {
  const x = u * 4, y = v * 4;
  const peel = fbm(x * 30, y * 30, 128, 61, 3);
  const macro = fbm(x * 2, y * 2, 16, 23, 4);
  const dirt = smoothstep(0.55, 0.95, fbm(x * 3.5, y * 3.5, 24, 95, 4));
  const base = 0.72 + macro * 0.12;
  o[0] = base * (1 - dirt * 0.4); o[1] = base * (1 - dirt * 0.4); o[2] = base * (1 - dirt * 0.36);
  o[3] = peel * 0.35 + macro * 0.15;
  o[4] = clamp01(0.33 + peel * 0.16 + dirt * 0.3);
  o[5] = 0.0;
  o[6] = clamp01(1 - dirt * 0.15);
}

// Acero mecanizado (esferas): metal puro con microrayado.
export function recipeSteel(u, v, o) {
  const x = u * 3, y = v * 3;
  const micro = fbm(x * 50, y * 50, 128, 3, 3);
  const scr = smoothstep(0.9, 1.0, ridged(x * 12, y * 12, 96, 71, 3));
  const macro = fbm(x * 2, y * 2, 16, 29, 4);
  const b = 0.55 + micro * 0.10 + macro * 0.06;
  o[0] = b; o[1] = b * 1.005; o[2] = b * 1.02;
  o[3] = micro * 0.25 + scr * 0.4;
  o[4] = clamp01(0.18 + macro * 0.16 + scr * 0.3);
  o[5] = 0.97;
  o[6] = 1.0;
}

// Grava / tierra para montones y piedras.
export function recipeGravel(u, v, o) {
  const x = u * 5, y = v * 5;
  const cell = worley(x * 7, y * 7, 40, 13);
  const stone = 1 - smoothstep(0.0, 0.3, cell);
  const grit = fbm(x * 20, y * 20, 128, 87, 4);
  const macro = fbm(x * 2, y * 2, 16, 33, 4);
  const tone = 0.20 + stone * 0.18 + grit * 0.09 + macro * 0.08;
  o[0] = tone * 1.05; o[1] = tone * 0.99; o[2] = tone * 0.90;
  o[3] = stone * 0.7 + grit * 0.3;
  o[4] = clamp01(0.82 + grit * 0.14);
  o[5] = 0.0;
  o[6] = clamp01(0.55 + stone * 0.45);
}
