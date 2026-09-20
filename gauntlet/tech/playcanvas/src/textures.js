// Procedural PBR texture set. Everything is generated in JS at load time:
// no image assets, no CDN, no copyrighted content.
import * as pc from 'playcanvas/profiler';
import { fbm, ridged, normalFromHeight, clamp01, lerp, smoothstep, mulberry32 } from './noise.js';

function makeTex(device, name, size, data, srgb, mipmaps = true) {
    const t = new pc.Texture(device, {
        name,
        width: size,
        height: size,
        format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
        mipmaps,
        minFilter: mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_REPEAT,
        anisotropy: 8
    });
    t.lock().set(data);
    t.unlock();
    return t;
}

// ---------------------------------------------------------------- generators
// Each returns { alb: Uint8Array RGBA (sRGB), height: Float32Array, orm: Uint8Array RGBA }
// orm := r = ambient occlusion, g = roughness, b = metalness

function genAsphalt(S, seed) {
    const grit = fbm(S, S / 4, S / 4, 2, seed + 1);        // fine aggregate
    const blotch = fbm(S, 4, 4, 4, seed + 2);              // large patches
    const mid = fbm(S, 16, 16, 3, seed + 3);
    const cracks = ridged(S, 6, 6, 3, seed + 4, 26);
    const tar = ridged(S, 3, 3, 2, seed + 5, 9);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const g = grit[i], b = blotch[i], m = mid[i];
        let v = 0.105 + (g - 0.5) * 0.14 + (b - 0.5) * 0.075 + (m - 0.5) * 0.05;
        let r = v * 1.0, gg = v * 0.99, bl = v * 1.06;
        // tar seams: darker, glossier
        const tv = clamp01(tar[i] * 0.9);
        r = lerp(r, 0.055, tv); gg = lerp(gg, 0.053, tv); bl = lerp(bl, 0.058, tv);
        // cracks: dark, deep
        const cv = cracks[i];
        r = lerp(r, 0.03, cv); gg = lerp(gg, 0.028, cv); bl = lerp(bl, 0.032, cv);
        const j = i * 4;
        alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(gg) * 255; alb[j + 2] = clamp01(bl) * 255; alb[j + 3] = 255;
        h[i] = g * 0.55 + m * 0.3 + b * 0.15 - cv * 0.9 - tv * 0.12;
        const ao = 1 - cv * 0.75 - (1 - g) * 0.12;
        const rough = clamp01(0.92 - tv * 0.30 + (g - 0.5) * 0.10 + (b - 0.5) * 0.06);
        orm[j] = clamp01(ao) * 255; orm[j + 1] = rough * 255; orm[j + 2] = 0; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genConcrete(S, seed) {
    const fine = fbm(S, S / 6, S / 6, 2, seed + 1);
    const mid = fbm(S, 12, 12, 4, seed + 2);
    const large = fbm(S, 3, 3, 3, seed + 3);
    const streak = fbm(S, 22, 2, 3, seed + 4);   // vertical dirt runs
    const pits = ridged(S, 40, 40, 1, seed + 5, 16);
    const chips = ridged(S, 7, 7, 2, seed + 6, 20);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const f = fine[i], m = mid[i], L = large[i], st = streak[i];
        let v = 0.335 + (m - 0.5) * 0.14 + (L - 0.5) * 0.10 + (f - 0.5) * 0.06;
        let r = v, g = v * 0.985, b = v * 0.955;
        // grime streaks (warm grey-brown)
        const sv = clamp01(smoothstep(0.55, 0.92, st) * (0.35 + L * 0.5));
        r = lerp(r, 0.135, sv); g = lerp(g, 0.128, sv); b = lerp(b, 0.112, sv);
        // spalled chips expose brighter aggregate
        const cv = chips[i] * 0.8;
        r = lerp(r, 0.46, cv); g = lerp(g, 0.45, cv); b = lerp(b, 0.43, cv);
        const p = pits[i];
        r = lerp(r, 0.17, p * 0.7); g = lerp(g, 0.165, p * 0.7); b = lerp(b, 0.16, p * 0.7);
        const j = i * 4;
        alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(g) * 255; alb[j + 2] = clamp01(b) * 255; alb[j + 3] = 255;
        h[i] = f * 0.35 + m * 0.4 + L * 0.25 - p * 0.8 - cv * 0.45;
        const ao = clamp01(1 - p * 0.55 - cv * 0.3 - sv * 0.12);
        const rough = clamp01(0.80 + (f - 0.5) * 0.14 + sv * 0.10 + p * 0.06);
        orm[j] = ao * 255; orm[j + 1] = rough * 255; orm[j + 2] = 0; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genPolishedFloor(S, seed) {
    const swirl = fbm(S, 48, 6, 3, seed + 1);     // buffing arcs
    const fine = fbm(S, S / 5, S / 5, 2, seed + 2);
    const stain = fbm(S, 4, 4, 4, seed + 3);
    const joints = new Float32Array(S * S);
    const oil = fbm(S, 8, 8, 3, seed + 5);
    // control joints every half texture
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = Math.min(Math.abs(x - S * 0.5), Math.abs(x - S * 0.5 - S), Math.abs(x - S * 0.5 + S));
            const dy = Math.min(Math.abs(y - S * 0.5), Math.abs(y - S * 0.5 - S), Math.abs(y - S * 0.5 + S));
            const d = Math.min(dx, dy);
            joints[y * S + x] = 1 - smoothstep(0.6, 2.6, d);
        }
    }
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const sw = swirl[i], f = fine[i], st = stain[i], jt = joints[i], ol = oil[i];
        let v = 0.255 + (st - 0.5) * 0.10 + (f - 0.5) * 0.045 + (sw - 0.5) * 0.03;
        let r = v * 1.01, g = v, b = v * 0.985;
        const oilv = clamp01(smoothstep(0.66, 0.86, ol));
        r = lerp(r, 0.055, oilv); g = lerp(g, 0.05, oilv); b = lerp(b, 0.05, oilv);
        r = lerp(r, 0.10, jt); g = lerp(g, 0.098, jt); b = lerp(b, 0.096, jt);
        const j = i * 4;
        alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(g) * 255; alb[j + 2] = clamp01(b) * 255; alb[j + 3] = 255;
        h[i] = f * 0.25 + sw * 0.2 + st * 0.15 - jt * 1.2;
        const ao = clamp01(1 - jt * 0.65 - (1 - st) * 0.06);
        const rough = clamp01(0.40 + (sw - 0.5) * 0.22 + (st - 0.5) * 0.18 - oilv * 0.20 + jt * 0.4);
        orm[j] = ao * 255; orm[j + 1] = rough * 255; orm[j + 2] = 0; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genPaintedMetal(S, seed, col) {
    const wear = fbm(S, 6, 6, 4, seed + 1);
    const fine = fbm(S, S / 4, S / 4, 2, seed + 2);
    const scratch = ridged(S, 60, 4, 2, seed + 3, 22);
    const dirt = fbm(S, 3, 3, 3, seed + 4);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const w = clamp01(smoothstep(0.60, 0.80, wear[i])), f = fine[i], sc = scratch[i], d = dirt[i];
        let r = col[0] * (0.90 + (f - 0.5) * 0.20 + (d - 0.5) * 0.14);
        let g = col[1] * (0.90 + (f - 0.5) * 0.20 + (d - 0.5) * 0.14);
        let b = col[2] * (0.90 + (f - 0.5) * 0.20 + (d - 0.5) * 0.14);
        // chipped paint -> bare steel
        r = lerp(r, 0.36, w); g = lerp(g, 0.355, w); b = lerp(b, 0.35, w);
        r = lerp(r, 0.46, sc * 0.5); g = lerp(g, 0.455, sc * 0.5); b = lerp(b, 0.45, sc * 0.5);
        const j = i * 4;
        alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(g) * 255; alb[j + 2] = clamp01(b) * 255; alb[j + 3] = 255;
        h[i] = f * 0.3 + wear[i] * 0.2 - w * 0.5 - sc * 0.25;
        const ao = clamp01(1 - w * 0.22);
        const rough = clamp01(lerp(0.52 + (f - 0.5) * 0.14, 0.34, w) - sc * 0.08 + (d - 0.5) * 0.08);
        const metal = clamp01(w * 0.92 + sc * 0.45 + 0.06);
        orm[j] = ao * 255; orm[j + 1] = rough * 255; orm[j + 2] = metal * 255; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genRust(S, seed) {
    const patch = fbm(S, 5, 5, 4, seed + 1);
    const flake = fbm(S, 26, 26, 3, seed + 2);
    const fine = fbm(S, S / 3, S / 3, 2, seed + 3);
    const drip = fbm(S, 26, 3, 3, seed + 4);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const p = patch[i], fl = flake[i], f = fine[i], dr = drip[i];
        const rustAmt = clamp01(smoothstep(0.40, 0.72, p * 0.75 + fl * 0.25) + smoothstep(0.72, 0.95, dr) * 0.45);
        // base painted steel (faded olive/blue drum)
        let r = 0.150 + (f - 0.5) * 0.06, g = 0.170 + (f - 0.5) * 0.06, b = 0.190 + (f - 0.5) * 0.06;
        // rust colours ramp from dark umber to bright orange
        const t = clamp01(fl * 0.7 + f * 0.3);
        const rr = lerp(0.215, 0.475, t), rg = lerp(0.082, 0.205, t), rb = lerp(0.032, 0.072, t);
        r = lerp(r, rr, rustAmt); g = lerp(g, rg, rustAmt); b = lerp(b, rb, rustAmt);
        const j = i * 4;
        alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(g) * 255; alb[j + 2] = clamp01(b) * 255; alb[j + 3] = 255;
        h[i] = f * 0.3 + fl * 0.45 * rustAmt + p * 0.25 - (1 - rustAmt) * 0.05;
        const ao = clamp01(1 - rustAmt * 0.28 - (1 - fl) * 0.08);
        const rough = clamp01(lerp(0.44 + (f - 0.5) * 0.10, 0.93, rustAmt));
        const metal = clamp01(lerp(0.95, 0.10, rustAmt));
        orm[j] = ao * 255; orm[j + 1] = rough * 255; orm[j + 2] = metal * 255; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genWood(S, seed) {
    const warp = fbm(S, 5, 5, 3, seed + 1);
    const fine = fbm(S, S / 3, 8, 2, seed + 2);
    const knotF = fbm(S, 3, 3, 2, seed + 3);
    const dirt = fbm(S, 4, 4, 3, seed + 4);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const i = y * S + x;
            // rings along X, warped
            const u = x / S;
            const ring = Math.sin((u * 26 + (warp[i] - 0.5) * 7.0) * Math.PI) * 0.5 + 0.5;
            const grain = clamp01(ring * 0.75 + fine[i] * 0.35);
            // plank seams every quarter of the texture along V
            const vv = (y / S) * 4;
            const seam = 1 - smoothstep(0.0, 0.035, Math.abs(vv - Math.round(vv)));
            const kn = clamp01(smoothstep(0.78, 0.94, knotF[i]));
            let r = lerp(0.245, 0.400, grain), g = lerp(0.138, 0.243, grain), b = lerp(0.061, 0.118, grain);
            r = lerp(r, 0.105, kn); g = lerp(g, 0.058, kn); b = lerp(b, 0.028, kn);
            const d = clamp01(smoothstep(0.55, 0.85, dirt[i]));
            r = lerp(r, 0.130, d * 0.55); g = lerp(g, 0.110, d * 0.55); b = lerp(b, 0.085, d * 0.55);
            r = lerp(r, 0.048, seam); g = lerp(g, 0.032, seam); b = lerp(b, 0.020, seam);
            const j = i * 4;
            alb[j] = clamp01(r) * 255; alb[j + 1] = clamp01(g) * 255; alb[j + 2] = clamp01(b) * 255; alb[j + 3] = 255;
            h[i] = grain * 0.55 + fine[i] * 0.2 - seam * 1.4 - kn * 0.3;
            const ao = clamp01(1 - seam * 0.8 - kn * 0.25);
            const rough = clamp01(0.74 + (1 - grain) * 0.14 + d * 0.08 + seam * 0.12);
            orm[j] = ao * 255; orm[j + 1] = rough * 255; orm[j + 2] = 0; orm[j + 3] = 255;
        }
    }
    return { alb, h, orm };
}

function genRubber(S, seed) {
    const peb = fbm(S, S / 4, S / 4, 3, seed + 1);
    const blk = fbm(S, 10, 10, 2, seed + 2);
    const dust = fbm(S, 5, 5, 3, seed + 3);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const p = peb[i], bk = blk[i], d = dust[i];
        let v = 0.0215 + (p - 0.5) * 0.016 + (bk - 0.5) * 0.010;
        v = lerp(v, 0.075, clamp01(smoothstep(0.62, 0.92, d)) * 0.7);  // road dust
        const j = i * 4;
        alb[j] = clamp01(v) * 255; alb[j + 1] = clamp01(v * 0.99) * 255; alb[j + 2] = clamp01(v * 0.97) * 255; alb[j + 3] = 255;
        h[i] = p * 0.7 + bk * 0.3;
        orm[j] = clamp01(1 - (1 - p) * 0.25) * 255;
        orm[j + 1] = clamp01(0.94 + (p - 0.5) * 0.08) * 255;
        orm[j + 2] = 0; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genSteel(S, seed) {
    const brush = ridged(S, 130, 5, 2, seed + 1, 8);
    const fine = fbm(S, S / 3, S / 3, 2, seed + 2);
    const smudge = fbm(S, 6, 6, 3, seed + 3);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const br = brush[i], f = fine[i], sm = smudge[i];
        let v = 0.545 + (f - 0.5) * 0.06 + (sm - 0.5) * 0.09 - br * 0.10;
        const j = i * 4;
        alb[j] = clamp01(v * 1.0) * 255; alb[j + 1] = clamp01(v * 0.995) * 255; alb[j + 2] = clamp01(v * 1.01) * 255; alb[j + 3] = 255;
        h[i] = f * 0.4 - br * 0.6;
        orm[j] = 255;
        orm[j + 1] = clamp01(0.235 + br * 0.30 + (sm - 0.5) * 0.16 + (f - 0.5) * 0.05) * 255;
        orm[j + 2] = clamp01(0.98 - br * 0.06) * 255;
        orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

function genPlastic(S, seed) {
    const fine = fbm(S, S / 3, S / 3, 2, seed + 1);
    const scuff = ridged(S, 30, 30, 2, seed + 2, 14);
    const blot = fbm(S, 5, 5, 3, seed + 3);
    const alb = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
        const f = fine[i], sc = scuff[i], bl = blot[i];
        let v = 0.80 + (f - 0.5) * 0.10 + (bl - 0.5) * 0.12;
        v = lerp(v, 0.55, sc * 0.6);
        const j = i * 4;
        alb[j] = clamp01(v) * 255; alb[j + 1] = clamp01(v) * 255; alb[j + 2] = clamp01(v) * 255; alb[j + 3] = 255;
        h[i] = f * 0.4 - sc * 0.4;
        orm[j] = clamp01(1 - sc * 0.15) * 255;
        orm[j + 1] = clamp01(0.36 + sc * 0.34 + (f - 0.5) * 0.12) * 255;
        orm[j + 2] = 0; orm[j + 3] = 255;
    }
    return { alb, h, orm };
}

// Chain-link panel: alpha-tested diamond wire mesh.
function genChainlink(S) {
    const alb = new Uint8Array(S * S * 4);
    const wire = 0.085 * S;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const a = ((x + y) % S) / S, b = ((x - y + S * 2) % S) / S;
            const da = Math.min(a, 1 - a) * S, db = Math.min(b, 1 - b) * S;
            const d = Math.min(da, db);
            const on = 1 - smoothstep(wire * 0.55, wire, d);
            const shade = 0.48 + 0.34 * (1 - clamp01(d / wire));
            const j = (y * S + x) * 4;
            alb[j] = shade * 255; alb[j + 1] = shade * 255; alb[j + 2] = shade * 1.02 * 255;
            alb[j + 3] = on * 255;
        }
    }
    return alb;
}

// -------------------------------------------------------------- vfx sprites
function radialSprite(S, pow, coreR, jitterSeed, warm) {
    const data = new Uint8Array(S * S * 4);
    const n = fbm(S, 8, 8, 3, jitterSeed);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
            let d = Math.sqrt(dx * dx + dy * dy) * 2;
            const i = y * S + x;
            d *= 0.80 + n[i] * 0.40;
            let a = clamp01(1 - d);
            a = Math.pow(a, pow);
            if (coreR > 0) a = clamp01(a + (1 - smoothstep(0, coreR, d)) * 0.6);
            const j = i * 4;
            const c = warm ? [255, 232, 196] : [235, 238, 245];
            data[j] = c[0]; data[j + 1] = c[1]; data[j + 2] = c[2];
            data[j + 3] = a * 255;
        }
    }
    return data;
}

function smokeSprite(S, seed) {
    const a1 = fbm(S, 5, 5, 4, seed);
    const a2 = fbm(S, 12, 12, 3, seed + 33);
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
            const d = Math.sqrt(dx * dx + dy * dy) * 2;
            const i = y * S + x;
            const puff = clamp01(1 - smoothstep(0.35, 1.0, d * (0.75 + a1[i] * 0.55)));
            const a = clamp01(puff * (0.55 + a2[i] * 0.7));
            const l = 0.60 + a1[i] * 0.30;
            const j = i * 4;
            data[j] = l * 255; data[j + 1] = l * 0.98 * 255; data[j + 2] = l * 0.96 * 255;
            data[j + 3] = a * 255;
        }
    }
    return data;
}

// ------------------------------------------------------------------- public
function applyMaps(m, alb, nrm, orm, tileMeters, device) {
    const t = 1 / tileMeters;
    m.diffuseMap = alb;
    m.normalMap = nrm;
    m.glossMap = orm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = 1;
    m.metalnessMap = orm; m.metalnessMapChannel = 'b'; m.useMetalness = true; m.metalness = 1;
    m.aoMap = orm; m.aoMapChannel = 'r'; m.aoIntensity = 1;
    for (const k of ['diffuseMapTiling', 'normalMapTiling', 'glossMapTiling', 'metalnessMapTiling', 'aoMapTiling']) {
        m[k] = new pc.Vec2(t, t);
    }
    m.occludeSpecular = pc.SPECOCC_AO;
}

export function buildMaterials(device, log) {
    const T = {};
    const M = {};
    const mk = (name, S, gen, tile, seed, extra) => {
        const t0 = performance.now();
        const g = gen(S, seed);
        const alb = makeTex(device, name + '_alb', S, g.alb, true);
        const nrm = makeTex(device, name + '_nrm', S, normalFromHeight(g.h, S, extra?.normalStrength ?? 3.0), false);
        const orm = makeTex(device, name + '_orm', S, g.orm, false);
        T[name] = { alb, nrm, orm };
        const m = new pc.StandardMaterial();
        m.name = name;
        applyMaps(m, alb, nrm, orm, tile, device);
        m.bumpiness = extra?.bumpiness ?? 1.0;
        if (extra?.apply) extra.apply(m);
        m.update();
        M[name] = m;
        if (log) log(`${name} ${S}px ${(performance.now() - t0).toFixed(0)}ms`);
        return m;
    };

    mk('asphalt', 512, genAsphalt, 7.0, 101, { normalStrength: 2.6, bumpiness: 1.0 });
    mk('concrete', 512, genConcrete, 4.5, 211, { normalStrength: 2.4, bumpiness: 1.0 });
    mk('floor', 512, genPolishedFloor, 6.0, 307, { normalStrength: 1.4, bumpiness: 0.8 });
    mk('wood', 512, genWood, 1.6, 409, { normalStrength: 2.2 });
    mk('metalPaint', 256, (S, s) => genPaintedMetal(S, s, [0.185, 0.225, 0.265]), 1.1, 503, { normalStrength: 1.8 });
    mk('metalPaintWarm', 256, (S, s) => genPaintedMetal(S, s, [0.315, 0.235, 0.105]), 1.1, 601, { normalStrength: 1.8 });
    mk('rust', 256, genRust, 1.0, 701, { normalStrength: 2.6 });
    mk('rubber', 256, genRubber, 0.55, 809, { normalStrength: 2.8 });
    mk('steel', 256, genSteel, 0.9, 907, { normalStrength: 1.2 });
    mk('plastic', 128, genPlastic, 1.0, 1009, { normalStrength: 1.4 });

    // ---- variants that share textures but differ in tint / response
    const tintOf = (base, name, col, tweak) => {
        const m = M[base].clone();
        m.name = name;
        m.diffuse = new pc.Color(col[0], col[1], col[2]);
        m.diffuseTint = true;
        if (tweak) tweak(m);
        m.update();
        M[name] = m;
        return m;
    };
    tintOf('wood', 'woodPale', [1.32, 1.24, 1.10]);
    tintOf('wood', 'woodDark', [0.62, 0.58, 0.56]);
    tintOf('plastic', 'plasticOrange', [1.00, 0.34, 0.06]);
    tintOf('plastic', 'plasticBlue', [0.10, 0.28, 0.72]);
    tintOf('plastic', 'plasticYellow', [0.95, 0.72, 0.06]);
    tintOf('metalPaint', 'metalPaintRed', [1.55, 0.55, 0.42]);
    tintOf('metalPaint', 'metalPaintGreen', [0.62, 1.30, 0.70]);

    // ---- wet asphalt (puddle surface)
    {
        const m = M.asphalt.clone();
        m.name = 'wet';
        m.diffuse = new pc.Color(0.30, 0.32, 0.36);
        m.diffuseTint = true;
        m.glossMap = null;
        m.gloss = 0.965;
        m.glossInvert = false;
        m.metalnessMap = null;
        m.metalness = 0.04;
        m.bumpiness = 0.14;
        m.normalMapTiling = new pc.Vec2(1 / 3.5, 1 / 3.5);
        m.update();
        M.wet = m;
    }

    // ---- glass
    {
        const m = new pc.StandardMaterial();
        m.name = 'glass';
        m.diffuse = new pc.Color(0.035, 0.045, 0.05);
        m.useMetalness = true;
        m.metalness = 0.0;
        m.gloss = 0.965;
        m.opacity = 0.19;
        m.blendType = pc.BLEND_NORMAL;
        m.depthWrite = false;
        m.cull = pc.CULLFACE_NONE;
        m.twoSidedLighting = true;
        m.refractionIndex = 1 / 1.5;
        m.useDynamicRefraction = false;
        m.opacityFadesSpecular = false;
        m.update();
        M.glass = m;
    }

    // ---- chain-link fence panel (alpha tested)
    {
        const S = 128;
        const tex = makeTex(device, 'chainlink', S, genChainlink(S), true);
        T.chainlink = { alb: tex };
        const m = new pc.StandardMaterial();
        m.name = 'chainlink';
        m.diffuseMap = tex;
        m.opacityMap = tex;
        m.opacityMapChannel = 'a';
        m.alphaTest = 0.45;
        m.cull = pc.CULLFACE_NONE;
        m.twoSidedLighting = true;
        m.useMetalness = true;
        m.metalness = 0.9;
        m.gloss = 0.55;
        m.diffuseMapTiling = new pc.Vec2(1 / 0.42, 1 / 0.42);
        m.opacityMapTiling = new pc.Vec2(1 / 0.42, 1 / 0.42);
        m.update();
        M.chainlink = m;
    }

    // ---- emissive lamp lens
    {
        const m = new pc.StandardMaterial();
        m.name = 'lamp';
        m.diffuse = new pc.Color(0.02, 0.02, 0.02);
        m.emissive = new pc.Color(1.0, 0.86, 0.62);
        m.emissiveIntensity = 14;
        m.useMetalness = true;
        m.metalness = 0;
        m.gloss = 0.85;
        m.update();
        M.lamp = m;
    }
    {
        const m = M.lamp.clone();
        m.name = 'lampCool';
        m.emissive = new pc.Color(0.78, 0.86, 1.0);
        m.emissiveIntensity = 10;
        m.update();
        M.lampCool = m;
    }

    // ---- vfx textures
    T.dust = makeTex(device, 'dustSprite', 64, radialSprite(64, 2.2, 0.18, 77, false), true, true);
    T.smoke = makeTex(device, 'smokeSprite', 128, smokeSprite(128, 991), true, true);
    T.spark = makeTex(device, 'sparkSprite', 32, radialSprite(32, 1.4, 0.45, 1313, true), true, true);

    return { materials: M, textures: T };
}
