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
  // El valor POR DEFECTO del parametro rige para todo instante anterior al primer evento
  // programado. Un GainNode nace con gain=1, asi que una capa retardada (un repique a
  // t0+80 ms, una astilla, un rebote) sonaria a ganancia UNIDAD desde que arranca su
  // oscilador hasta que empieza su envolvente. Con veinte capas retardadas por impacto
  // eso son veinte osciladores a tope sumandose en fase: es lo que hacia que un solo
  // golpe pesado llegase a +20 dBFS y que el limitador bombease.
  p.value = 0;
  const atk = Math.max(ataque, RAMPA_MIN);
  const picoSeguro = Math.max(pico, 1e-6);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(picoSeguro, t0 + atk);
  const fin = t0 + atk + Math.max(t60, 0.005);
  p.exponentialRampToValueAtTime(picoSeguro * 0.001, fin);
  p.linearRampToValueAtTime(0, fin + 0.006);
  anotarSilencio(p, fin + 0.006);
  return fin + 0.012;
}

/**
 * Envolvente con meseta: ataque, sostenido y caida. Para explosiones y colas largas.
 */
export function sobre(ganancia, t0, pico, ataque, meseta, caida) {
  const p = ganancia.gain;
  // El valor POR DEFECTO del parametro rige para todo instante anterior al primer evento
  // programado. Un GainNode nace con gain=1, asi que una capa retardada (un repique a
  // t0+80 ms, una astilla, un rebote) sonaria a ganancia UNIDAD desde que arranca su
  // oscilador hasta que empieza su envolvente. Con veinte capas retardadas por impacto
  // eso son veinte osciladores a tope sumandose en fase: es lo que hacia que un solo
  // golpe pesado llegase a +20 dBFS y que el limitador bombease.
  p.value = 0;
  const atk = Math.max(ataque, RAMPA_MIN);
  const picoSeguro = Math.max(pico, 1e-6);
  p.cancelScheduledValues(t0);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(picoSeguro, t0 + atk);
  p.setValueAtTime(picoSeguro, t0 + atk + Math.max(meseta, 0));
  const fin = t0 + atk + Math.max(meseta, 0) + Math.max(caida, 0.005);
  p.exponentialRampToValueAtTime(picoSeguro * 0.001, fin);
  p.linearRampToValueAtTime(0, fin + 0.006);
  anotarSilencio(p, fin + 0.006);
  return fin + 0.012;
}

/** Fundido de entrada para voces continuas. */
export function entrar(ganancia, t0, destino, duracion = 0.08) {
  rampa(ganancia.gain, t0, Math.max(destino, 0), duracion);
}

/** Fundido de salida; devuelve el instante seguro de parada. */
export function salir(ganancia, t0, duracion = 0.1) {
  const d = Math.max(duracion, RAMPA_MIN);
  rampa(ganancia.gain, t0, 0, d);
  return t0 + d + 0.01;
}

/** Rampa lineal de un AudioParam sin saltos. */
export function rampa(param, t0, destino, duracion = 0.06) {
  const d = Math.max(duracion, RAMPA_MIN);
  const v = valorActual(param, t0);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(v, t0);
  param.linearRampToValueAtTime(destino, t0 + d);
  anotar(param, t0, v, t0 + d, destino);
}

/** Rampa exponencial, apropiada para frecuencias (la percepcion del tono es logaritmica). */
export function rampaFrec(param, t0, destino, duracion = 0.06) {
  const d = Math.max(duracion, RAMPA_MIN);
  const v = Math.max(valorActual(param, t0), 1e-3);
  const dst = Math.max(destino, 1e-3);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(v, t0);
  param.exponentialRampToValueAtTime(dst, t0 + d);
  anotar(param, t0, v, t0 + d, dst);
}

// --- Seguimiento del valor programado -------------------------------------------------
//
// `AudioParam.value` devuelve el valor en `currentTime`, no el ultimo valor PROGRAMADO.
// En un OfflineAudioContext currentTime vale 0 durante toda la fase de programacion, asi
// que leerlo haria que cada rampa arrancase desde el valor inicial y se perdiera la
// continuidad. En un contexto en vivo el problema es menor pero sigue existiendo (la
// lectura va un bloque por detras). Se lleva por tanto un registro propio del ultimo
// segmento programado por parametro, y se interpola dentro de el.

const SEGMENTO = new WeakMap();

function anotar(param, t0, v0, t1, v1) {
  SEGMENTO.set(param, { t0, v0, t1, v1 });
}

function valorActual(param, t) {
  const s = SEGMENTO.get(param);
  if (!s) return Number.isFinite(param.value) ? param.value : 0;
  if (t <= s.t0) return s.v0;
  if (t >= s.t1) return s.v1;
  const k = (t - s.t0) / Math.max(s.t1 - s.t0, 1e-9);
  return s.v0 + (s.v1 - s.v0) * k;
}

/** Permite a las envolventes percusivas registrar su estado final (silencio). */
export function anotarSilencio(param, t) { anotar(param, t, 0, t, 0); }
