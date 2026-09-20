// Tileable value-noise / fBm field generator. Pure JS, no assets.

export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function ihash(x, y, s) {
    let n = Math.imul(x, 1836311903) ^ Math.imul(y, 2971215073) ^ Math.imul(s, 1442695041);
    n = Math.imul(n ^ (n >>> 15), 2246822519);
    n = Math.imul(n ^ (n >>> 13), 3266489917);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Adds one octave of seamlessly tileable value noise into `out` (size*size floats).
 * cx/cy = lattice cells across the texture (must divide evenly for perfect tiling).
 */
export function valueOctave(out, size, cx, cy, seed, amp) {
    const lat = new Float32Array(cx * cy);
    for (let j = 0; j < cy; j++) {
        for (let i = 0; i < cx; i++) lat[j * cx + i] = ihash(i, j, seed);
    }
    const sx = cx / size, sy = cy / size;
    // precompute column interpolation data
    const i0a = new Int32Array(size), i1a = new Int32Array(size), txa = new Float32Array(size);
    for (let px = 0; px < size; px++) {
        const fx = px * sx; const b = Math.floor(fx);
        i0a[px] = ((b % cx) + cx) % cx; i1a[px] = (i0a[px] + 1) % cx; txa[px] = smooth(fx - b);
    }
    for (let py = 0; py < size; py++) {
        const fy = py * sy; const b = Math.floor(fy);
        const j0 = ((b % cy) + cy) % cy, j1 = (j0 + 1) % cy, ty = smooth(fy - b);
        const r0 = j0 * cx, r1 = j1 * cx, row = py * size;
        for (let px = 0; px < size; px++) {
            const i0 = i0a[px], i1 = i1a[px], tx = txa[px];
            const a = lat[r0 + i0], b2 = lat[r0 + i1], c = lat[r1 + i0], d = lat[r1 + i1];
            const top = a + (b2 - a) * tx, bot = c + (d - c) * tx;
            out[row + px] += (top + (bot - top) * ty) * amp;
        }
    }
}

/** fBm field normalised to 0..1. cx/cy = base frequency in cells. */
export function fbm(size, cx, cy, octaves, seed, gain = 0.5) {
    const out = new Float32Array(size * size);
    let amp = 1, total = 0, fx = cx, fy = cy;
    for (let o = 0; o < octaves; o++) {
        valueOctave(out, size, fx, fy, seed + o * 7919, amp);
        total += amp; amp *= gain; fx *= 2; fy *= 2;
        if (fx > size) fx = size; if (fy > size) fy = size;
    }
    const inv = 1 / total;
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return out;
}

/** Ridged field (thin veins) in 0..1, 1 = on the vein. */
export function ridged(size, cx, cy, octaves, seed, sharpness = 12) {
    const f = fbm(size, cx, cy, octaves, seed);
    const out = new Float32Array(size * size);
    for (let i = 0; i < f.length; i++) {
        const v = 1 - Math.abs(f[i] * 2 - 1);
        out[i] = Math.max(0, Math.min(1, (v - 1 + 1 / sharpness) * sharpness));
    }
    return out;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/**
 * Derives a tangent-space normal map (RGBA8, linear) from a height field.
 */
export function normalFromHeight(h, size, strength) {
    const out = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        const yn = ((y - 1) + size) % size, yp = (y + 1) % size;
        for (let x = 0; x < size; x++) {
            const xn = ((x - 1) + size) % size, xp = (x + 1) % size;
            const dx = (h[y * size + xp] - h[y * size + xn]) * strength;
            const dy = (h[yp * size + x] - h[yn * size + x]) * strength;
            let nx = -dx, ny = -dy, nz = 1;
            const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
            nx *= inv; ny *= inv; nz *= inv;
            const i = (y * size + x) * 4;
            out[i] = (nx * 0.5 + 0.5) * 255;
            out[i + 1] = (ny * 0.5 + 0.5) * 255;
            out[i + 2] = (nz * 0.5 + 0.5) * 255;
            out[i + 3] = 255;
        }
    }
    return out;
}
