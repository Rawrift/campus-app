// Generacion PROCEDURAL de respuestas al impulso para el ConvolverNode.
// Cero archivos, cero descargas: el IR se calcula en JS al arrancar el motor.
//
// Estructura de cada IR (la de una sala real):
//   1. Reflexiones tempranas: ecos discretos, pocos, con retardo y ganancia que dependen
//      de la geometria. Son las que dan la SENSACION DE TAMANO.
//   2. Cola difusa: ruido con decaimiento exponencial, filtrado por bandas (las agudas
//      decaen mas rapido porque el aire y los materiales las absorben).
//   3. Coloracion modal: en una nave metalica cerrada hay modos propios que resuenan.

import { crearPrng } from './util.js';

/**
 * @param {BaseAudioContext} ctx
 * @param {object} cfg
 * @param {number} cfg.duracion  longitud del IR en segundos
 * @param {number} cfg.rt60      tiempo de reverberacion nominal
 * @param {number} cfg.predelay  retardo antes de la primera reflexion
 * @param {Array}  cfg.tempranas [ [retardo, ganancia], ... ]
 * @param {number} cfg.amortiguacionAgudos  0..1, cuanto mas alto antes mueren los agudos
 * @param {number} cfg.difusion  0..1, densidad de la cola
 * @param {Array}  cfg.modos     [ [frecuencia, ganancia, rt60], ... ] resonancias de la sala
 * @param {number} cfg.semilla
 */
export function generarImpulso(ctx, cfg) {
  const {
    duracion = 2.0, rt60 = 1.2, predelay = 0.006,
    tempranas = [], amortiguacionAgudos = 0.5, difusion = 1.0,
    modos = [], semilla = 1234, anchura = 1.0, graveExtra = 0.0,
  } = cfg;

  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * duracion));
  const buf = ctx.createBuffer(2, n, sr);
  const prng = crearPrng(semilla);

  // Constante de decaimiento para el RT60 pedido: e^(-a*rt60) = 10^(-3) -> a = 6.908/rt60
  const alfa = 6.9078 / Math.max(rt60, 0.02);

  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const desvio = c === 0 ? 1.0 : 1.0 + 0.013 * anthropicSpread(prng);

    // --- 2. Cola difusa -------------------------------------------------------------
    // Ruido con decaimiento exponencial. La densidad crece con el tiempo (al principio
    // las reflexiones son discretas y se van "espesando"): eso es lo que lo hace creible.
    const iPre = Math.floor(predelay * sr * desvio);
    let lp = 0, lp2 = 0, hp = 0, prev = 0;
    for (let i = iPre; i < n; i++) {
      const t = (i - iPre) / sr;
      const env = Math.exp(-alfa * t * desvio);
      // Densidad creciente: al principio solo 1 de cada k muestras lleva energia.
      // Una sala real alcanza densidad difusa en unas pocas decenas de milisegundos. Si
      // esta rampa es larga, la reverberacion "hincha" despues del golpe y el conjunto
      // pierde el ataque: el pico deja de estar en el impacto y pasa a estar 100 ms
      // despues, que es exactamente lo contrario de transmitir masa.
      const madurez = Math.min(1, t / Math.min(0.06, 0.010 + 0.015 / difusion));
      const disparo = prng() < (0.06 + 0.94 * madurez) * difusion ? 1 : 0;
      let v = (prng() * 2 - 1) * disparo * env;

      // Amortiguacion progresiva de agudos: paso bajo de 1 polo cuyo coeficiente depende
      // del tiempo -> las altas frecuencias mueren antes que las bajas, como en la realidad.
      const k = 1 - Math.min(0.97, amortiguacionAgudos * (0.25 + 0.75 * Math.min(1, t / rt60)));
      lp += (v - lp) * Math.max(0.02, k);
      lp2 += (lp - lp2) * Math.max(0.02, k);
      v = lp2;

      // Paso alto suave: quita el DC y la acumulacion de graves del ruido filtrado.
      hp = 0.995 * (hp + v - prev); prev = v;
      d[i] += hp * (1 - graveExtra) + v * graveExtra;
    }

    // --- 1. Reflexiones tempranas ---------------------------------------------------
    for (const [retardo, gan] of tempranas) {
      const jitter = 1 + (prng() - 0.5) * 0.06;
      const i0 = Math.floor((predelay + retardo * jitter) * sr * desvio);
      if (i0 >= n - 8) continue;
      // Cada reflexion es un impulso corto filtrado, no una delta: una delta pura suena
      // a "clic" digital y produce una raya vertical artificial en el espectrograma.
      const ancho = Math.floor(sr * 0.0015);
      for (let i = 0; i < ancho && i0 + i < n; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / ancho);
        d[i0 + i] += gan * w * (prng() * 2 - 1) * 1.6;
      }
    }

    // --- 3. Coloracion modal ---------------------------------------------------------
    for (const [frec, gan, mrt] of modos) {
      const ma = 6.9078 / Math.max(mrt, 0.05);
      const fase = prng() * Math.PI * 2;
      const fj = frec * (1 + (prng() - 0.5) * 0.02);
      for (let i = iPre; i < n; i++) {
        const t = (i - iPre) / sr;
        const e = Math.exp(-ma * t);
        if (e < 1e-4) break;
        d[i] += gan * e * Math.sin(2 * Math.PI * fj * t + fase);
      }
    }

    // Rampa de entrada y de salida: garantiza que el IR empieza y acaba en cero exacto,
    // sin el que la convolucion introduce un clic en cada evento.
    const rampaIn = Math.floor(sr * 0.0008);
    for (let i = 0; i < rampaIn && i < n; i++) d[i] *= i / rampaIn;
    const rampaOut = Math.floor(sr * 0.05);
    for (let i = 0; i < rampaOut; i++) {
      const j = n - 1 - i;
      if (j >= 0) d[j] *= i / rampaOut;
    }
  }

  normalizarEnergia(buf);
  return buf;
}

function anthropicSpread(prng) { return prng() * 2 - 1; }

/**
 * Normaliza por la NORMA L2 del impulso, que es la ganancia real de la convolucion.
 *
 * Normalizar por RMS es un error clasico y caro: el RMS divide por la longitud, asi que
 * un impulso de 3.2 s con el mismo RMS que uno de 1.1 s tiene casi el doble de norma L2 y
 * suena mucho mas fuerte. Con RMS = 0.02 sobre 1.1 s estereo la norma L2 sale 6.5, es
 * decir +16 dB de ganancia de convolucion: la reverberacion tapaba el sonido directo y el
 * pico del impacto se desplazaba 100 ms despues del golpe, destruyendo el ataque.
 *
 * Con norma L2 fija, dos salas de RT60 muy distinto entran al mismo nivel y el equilibrio
 * seco/mojado queda donde debe estar: en la ganancia de envio de cada voz.
 */
function normalizarEnergia(buf) {
  let suma = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) suma += d[i] * d[i];
  }
  const l2 = Math.sqrt(suma);
  if (l2 < 1e-9) return;
  const g = 0.70 / l2;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

/** Presets de espacio del juego. */
export const ESPACIOS = {
  // Nave industrial cerrada: larga, metalica, con modos propios audibles.
  interior_nave: {
    duracion: 3.2, rt60: 2.1, predelay: 0.011, difusion: 0.85,
    amortiguacionAgudos: 0.30, graveExtra: 0.12, semilla: 77001,
    tempranas: [
      [0.013, 0.55], [0.021, 0.42], [0.029, 0.38], [0.041, 0.30],
      [0.056, 0.26], [0.071, 0.21], [0.094, 0.17], [0.118, 0.13],
      [0.149, 0.10], [0.183, 0.08],
    ],
    modos: [
      [47, 0.030, 1.8], [78, 0.024, 1.5], [123, 0.018, 1.2],
      [196, 0.012, 0.9], [311, 0.008, 0.7],
    ],
  },
  // Exterior abierto: casi nada de cola, un par de reflexiones lejanas y aire.
  exterior: {
    duracion: 1.1, rt60: 0.42, predelay: 0.018, difusion: 0.35,
    amortiguacionAgudos: 0.72, graveExtra: 0.0, semilla: 77002,
    tempranas: [
      [0.037, 0.30], [0.089, 0.20], [0.164, 0.13], [0.255, 0.08],
    ],
    modos: [],
  },
  // Espacio pequeno y seco (interior de vehiculo, pasillo). Disponible para el juego.
  interior_pequeno: {
    duracion: 0.9, rt60: 0.36, predelay: 0.004, difusion: 0.95,
    amortiguacionAgudos: 0.55, graveExtra: 0.06, semilla: 77003,
    tempranas: [[0.005, 0.5], [0.009, 0.4], [0.014, 0.33], [0.022, 0.25], [0.031, 0.18]],
    modos: [[92, 0.02, 0.4], [147, 0.014, 0.3]],
  },
};
