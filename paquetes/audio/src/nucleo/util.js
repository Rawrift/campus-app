// Utilidades numericas y de envolventes. Regla transversal: NINGUN parametro de ganancia
// cambia de forma instantanea; todo ataque y todo corte pasa por una rampa.

export const TAU = Math.PI * 2;

/** Tiempo minimo de rampa (segundos). Por debajo de esto se oye un clic. */
export const RAMPA_MIN = 0.0015;

export function sujetar(v, min, max) { return v < min ? min : (v > max ? max : v); }
export function mezclar(a, b, t) { return a + (b - a) * t; }
export function dbALineal(db) { return Math.pow(10, db / 20); }
export function linealADb(l) { return 20 * Math.log10(Math.max(Math.abs(l), 1e-12)); }

/**
 * Generador pseudoaleatorio determinista (mulberry32). El motor lo usa para que la
 * verificacion sea reproducible: misma semilla -> mismo PCM -> mismas metricas.
 */
export function crearPrng(semilla = 0x9e3779b9) {
  let a = semilla >>> 0;
  return function prng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Curva de saturacion suave (tanh) para el WaveShaper del bus maestro. */
export function curvaTanh(cantidad = 1.6, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * cantidad) / Math.tanh(cantidad);
  }
  return c;
}

/** Curva de distorsion asimetrica suave, para dar "grano" a motores y disparos. */
export function curvaGrano(cantidad = 0.6, n = 1024) {
  const c = new Float32Array(n);
  const k = cantidad * 12 + 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

/**
 * Envolvente percusiva sin clics: silencio -> rampa lineal al pico -> caida exponencial
 * hasta -60 dB -> rampa lineal a cero. Devuelve el instante en que la voz puede pararse.
 *
 * Se usa rampa LINEAL para entrar y salir del cero (la exponencial no puede tocar cero) y
 * exponencial en medio porque es como decae la energia de un modo resonante real.
 */
export function golpe(ganancia, t0, pico, ataque, t60) {
  const p = ganancia.gain;
  const atk = Math.max(ataque, RAMPA_MIN);
  const picoSeguro = Math.max(pico, 1e-6);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(picoSeguro, t0 + atk);
  const fin = t0 + atk + Math.max(t60, 0.005);
  p.exponentialRampToValueAtTime(picoSeguro * 0.001, fin);
  p.linearRampToValueAtTime(0, fin + 0.006);
  return fin + 0.012;
}

/**
 * Envolvente con meseta: ataque, sostenido y caida. Para explosiones y colas largas.
 */
export function sobre(ganancia, t0, pico, ataque, meseta, caida) {
  const p = ganancia.gain;
  const atk = Math.max(ataque, RAMPA_MIN);
  const picoSeguro = Math.max(pico, 1e-6);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(picoSeguro, t0 + atk);
  p.setValueAtTime(picoSeguro, t0 + atk + Math.max(meseta, 0));
  const fin = t0 + atk + Math.max(meseta, 0) + Math.max(caida, 0.005);
  p.exponentialRampToValueAtTime(picoSeguro * 0.001, fin);
  p.linearRampToValueAtTime(0, fin + 0.006);
  return fin + 0.012;
}

/** Fundido de entrada para voces continuas. */
export function entrar(ganancia, t0, destino, duracion = 0.08) {
  const p = ganancia.gain;
  const v = valorActual(p, t0);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(v, t0);
  p.linearRampToValueAtTime(Math.max(destino, 0), t0 + Math.max(duracion, RAMPA_MIN));
}

/** Fundido de salida; devuelve el instante seguro de parada. */
export function salir(ganancia, t0, duracion = 0.1) {
  const p = ganancia.gain;
  const v = valorActual(p, t0);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(v, t0);
  p.linearRampToValueAtTime(0, t0 + Math.max(duracion, RAMPA_MIN));
  return t0 + Math.max(duracion, RAMPA_MIN) + 0.01;
}

/** Rampa generica de un AudioParam sin saltos. */
export function rampa(param, t0, destino, duracion = 0.06) {
  const v = valorActual(param, t0);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(v, t0);
  param.linearRampToValueAtTime(destino, t0 + Math.max(duracion, RAMPA_MIN));
}

/** Rampa exponencial, apropiada para frecuencias (la percepcion del tono es logaritmica). */
export function rampaFrec(param, t0, destino, duracion = 0.06) {
  const v = Math.max(valorActual(param, t0), 1e-3);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(v, t0);
  param.exponentialRampToValueAtTime(Math.max(destino, 1e-3), t0 + Math.max(duracion, RAMPA_MIN));
}

function valorActual(param, t0) {
  // En OfflineAudioContext `value` refleja el ultimo valor fijado; es suficiente como
  // punto de partida de la rampa y evita el salto a cero.
  const v = param.value;
  return Number.isFinite(v) ? v : 0;
}
