// ---------------------------------------------------------------------------
// Ruido procedural tileable (value noise + fbm + ridged + worley) 100% JS.
// Todo periodico para que las texturas no muestren costuras al repetirse.
// ---------------------------------------------------------------------------

export function hash2i(i, j, seed) {
  let n = (i * 374761393 + j * 668265263 + seed * 1013904223) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

const wrap = (a, b) => ((a % b) + b) % b;

export function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period);
  const y0 = wrap(yi, period), y1 = wrap(yi + 1, period);
  const a = hash2i(x0, y0, seed), b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed), d = hash2i(x1, y1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

export function fbm(x, y, period, seed, oct = 5, gain = 0.5) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, period * f, seed + i * 131);
    norm += amp; amp *= gain; f *= 2;
  }
  return s / norm;
}

export function ridged(x, y, period, seed, oct = 4, gain = 0.5) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, period * f, seed + i * 97) * 2 - 1);
    s += amp * n * n; norm += amp; amp *= gain; f *= 2;
  }
  return s / norm;
}

// Worley / celular tileable: devuelve distancia al punto mas cercano (0..~0.7)
export function worley(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 10;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = wrap(cx, period), wy = wrap(cy, period);
      const px = cx + hash2i(wx, wy, seed);
      const py = cy + hash2i(wx, wy, seed + 7919);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
