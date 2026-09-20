// IMPACTO: sintesis modal + transitorio de contacto.
//
// El requisito duro es que la MASA cambie el TIMBRE, no solo el volumen. Lo consigue el
// encadenado de cuatro mapeos fisicos, todos derivados del mismo tamano implicito:
//
//   masa      = momento / velocidad tipica          (kg)
//   tam       = (masa / 10 kg)^(1/3)                 tamano lineal relativo
//
//   1. TONO      f0 ~ 1/tam           un objeto grande vibra mas grave (Kirchhoff: la
//                                     frecuencia de un modo es inversa a la longitud).
//   2. DECAIMIENTO t60 ~ tam^0.45     mas masa = mas energia almacenada por unidad de
//                                     perdida = cola mas larga.
//   3. ANCHO DE BANDA DEL GOLPE       el tiempo de contacto de Hertz crece con la masa;
//                                     un pulso de fuerza de duracion tc solo excita hasta
//                                     ~1/tc Hz. Por eso lo pesado suena SORDO aunque sea
//                                     mas fuerte, y lo ligero suena agudo y seco.
//   4. CONTENIDO GRAVE Y DENSIDAD DE TRANSITORIOS
//                                     el cuerpo grave crece con tam^0.75 y aparecen
//                                     microimpactos y rebotes que un objeto ligero no da.
//
// Ademas cada modo se excita SOLO en la medida en que el transitorio tiene energia a su
// frecuencia (factor 1/sqrt(1+(f/fc)^2)): asi el filtrado por masa es automatico y
// coherente, no un ecualizador pegado encima.

import { parDeMateriales } from '../materiales.js';
import { abrirVoz } from '../nucleo/voz.js';
import { golpe, sujetar } from '../nucleo/util.js';

/** Velocidad de impacto tipica asumida para deducir masa a partir del momento (m/s). */
const VELOCIDAD_TIPICA = 4;

export function sintetizarImpacto(motor, opciones = {}) {
  const ctx = motor.ctx;
  const t0 = opciones.cuando ?? motor.ahora();
  const esc = motor.escala;                 // escala de tiempo (camara lenta)
  const R = motor.ruido;

  const par = opciones.par || parDeMateriales(opciones.material, opciones.materialB);
  const momento = sujetar(Number(opciones.momento) || 40, 0.05, 50000);

  // --- Agrupacion de eventos proximos ------------------------------------------------
  let gFusion = 1;
  if (opciones.agrupar !== false) {
    gFusion = motor.mezcla.agrupar(par.clave, opciones.posicion, t0);
    if (gFusion === null) return null;
  }

  // --- Mapeos fisicos -----------------------------------------------------------------
  const masa = sujetar(momento / VELOCIDAD_TIPICA, 0.02, 12000);
  const tam = Math.pow(masa / 10, 1 / 3);

  const f0 = sujetar(par.f0 / Math.pow(tam, 0.95), 22, 7000) * esc;
  const t60 = sujetar(par.t60 * Math.pow(tam, 0.45), 0.012, 3.2) / esc;

  // Tiempo de contacto de Hertz -> ancho de banda de la excitacion.
  const tc = par.tc * Math.pow(tam, 0.6);
  const fcExc = sujetar((1 / tc) * par.brillo, 160, 16000) * esc;

  const nivel = sujetar(0.50 * Math.pow(momento / 100, 0.28), 0.05, 1.15) * gFusion
    * (opciones.ganancia ?? 1);

  // Nivel de detalle: con la mezcla saturada de voces se recortan los adornos antes de
  // que el limitador tenga que trabajar. Es mas barato y suena mejor.
  const carga = motor.mezcla.voces.length / motor.mezcla.maxVoces;
  const detalle = carga > 0.75 ? 0 : (carga > 0.45 ? 1 : 2);

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0,
    duracion: t60 + 0.3,
    prioridad: nivel,
    bus: opciones.bus || 'impactos',
  });
  let tFin = t0 + 0.05;
  // Suma de los picos de las capas que atacan A LA VEZ en t0. Se usa al final para
  // normalizar la voz: el pico de un impacto debe depender de la energia del golpe, no
  // de cuantas capas haya querido apilar el sintetizador.
  let picoCoherente = 0;

  // --- 1. Transitorio de contacto -----------------------------------------------------
  // Rafaga de ruido muy corta, limitada en banda por el tiempo de contacto. Es la "raya
  // vertical" del espectrograma: ancha en frecuencia, brevisima en el tiempo.
  {
    const durT = sujetar(tc * 9 + 0.0035, 0.0035, 0.09) / esc;
    const src = R.fuente(par.ruido > 0.7 ? 'grano' : 'blanco', 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = fcExc; lp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = sujetar(f0 * 0.35, 25, 900); hp.Q.value = 0.5;
    const pico = ctx.createBiquadFilter();
    pico.type = 'peaking';
    pico.frequency.value = sujetar(fcExc * 0.55, 120, 9000);
    pico.Q.value = 0.9; pico.gain.value = 4.5 * par.ruido;
    const g = ctx.createGain();
    src.connect(lp); lp.connect(hp); hp.connect(pico); pico.connect(g); g.connect(voz.entrada);

    // Caida del transitorio: un barrido descendente del paso bajo reproduce el
    // aplastamiento del contacto (la superficie se ablanda mientras dura el golpe).
    lp.frequency.setValueAtTime(fcExc, t0);
    lp.frequency.exponentialRampToValueAtTime(sujetar(fcExc * 0.22, 120, 16000), t0 + durT * 1.6);

    const picoT = nivel * (0.55 + 0.55 * par.ruido);
    picoCoherente += picoT;
    const p = golpe(g, t0, picoT, 0.0012 / esc, durT);
    voz.fuente(src, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  // --- 2. Banco modal ------------------------------------------------------------------
  // Cada modo es un oscilador con su propio decaimiento. Un banco de filtros con Q alto
  // daria un resultado parecido, pero el oscilador permite fijar el t60 exacto de cada
  // parcial y la ligera caida de tono de los metales golpeados fuerte.
  const nModos = Math.min(par.modos.length, detalle >= 1 ? par.modos.length : 3);
  for (let i = 0; i < nModos; i++) {
    const razon = par.modos[i];
    const jitter = 1 + (R.azar() - 0.5) * par.inarmonia * 0.22;
    const f = f0 * razon * jitter;
    if (f > 19000 || f < 12) continue;

    // Excitacion del modo: solo suena lo que el transitorio es capaz de mover.
    const acopleExc = 1 / Math.sqrt(1 + Math.pow(f / fcExc, 2.1));
    let g0 = par.ganancias[i] * acopleExc * Math.pow(par.brillo, i * 0.35);
    // Los modos altos de un objeto grande estan mas amortiguados (perdidas internas).
    g0 *= 1 / (1 + 0.20 * i * Math.pow(tam, 0.5));
    if (g0 < 0.004) continue;

    const t60i = sujetar(t60 / (1 + 0.85 * Math.pow(i, 0.85)), 0.01, 3.2);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    // Caida de tono por no linealidad: el modo arranca algo desafinado hacia arriba y
    // se asienta. Es lo que da el "bwoong" de una chapa golpeada.
    const glide = 1 + sujetar(par.repique * 0.020 * Math.pow(momento / 200, 0.3), 0, 0.05);
    osc.frequency.setValueAtTime(f * glide, t0);
    osc.frequency.exponentialRampToValueAtTime(f, t0 + sujetar(t60i * 0.25, 0.01, 0.12));

    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const picoM = nivel * g0 * 0.55;
    picoCoherente += picoM;
    const p = golpe(g, t0, picoM, 0.0018 / esc, t60i);
    // Pre-arranque aleatorio: decorrelaciona la fase de los modos.
    voz.fuenteEn(osc, t0 - R.azar() * 0.03, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  // --- 3. Cuerpo grave ------------------------------------------------------------------
  // El "peso". Crece con el tamano: es la diferencia entre un tintineo y un porrazo.
  {
    const fg = sujetar(f0 * 0.42, 18, 700);
    const gg = nivel * par.grave * sujetar(0.28 * Math.pow(tam, 0.75), 0.05, 1.0);
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = fg;
    osc.frequency.setValueAtTime(fg * 1.55, t0);
    osc.frequency.exponentialRampToValueAtTime(fg, t0 + 0.035 / esc);
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    picoCoherente += gg;
    const p = golpe(g, t0, gg, 0.003 / esc, sujetar(t60 * 0.85, 0.05, 1.2));
    voz.fuenteEn(osc, t0 - R.azar() * 0.02, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  // Sub-grave: solo para masas grandes. Un objeto de 5 kg no tiene con que generarlo.
  if (tam > 1.25 && detalle >= 1) {
    const fs = sujetar(f0 * 0.21, 16, 260);
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = fs;
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const picoS = nivel * 0.40 * par.grave * sujetar(tam - 1.1, 0, 1.6);
    picoCoherente += picoS;
    const p = golpe(g, t0, picoS, 0.006 / esc, sujetar(t60 * 1.1, 0.08, 1.6));
    voz.fuenteEn(osc, t0 - R.azar() * 0.02, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  // --- 4. Chirrido (par metal/hormigon, metal/metal, grava) --------------------------
  // Deslizamiento en el momento del golpe: barrido de banda estrecha sobre ruido.
  if (par.chirrido > 0.45 && detalle >= 1 && momento > 12) {
    const dur = sujetar(0.045 + 0.09 * par.chirrido * Math.pow(tam, 0.4), 0.03, 0.28) / esc;
    const src = R.fuente('grano', 1.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 7 + 6 * par.chirrido;
    const fA = sujetar(fcExc * 0.50, 300, 9000);
    const fB = sujetar(fA * (1.8 + R.azar() * 0.9), 400, 13000);
    bp.frequency.setValueAtTime(fA, t0);
    bp.frequency.exponentialRampToValueAtTime(fB, t0 + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(fA * 0.75, t0 + dur);
    const g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(voz.entrada);
    picoCoherente += nivel * 0.30 * par.chirrido;
    const p = golpe(g, t0 + 0.0015, nivel * 0.30 * par.chirrido, 0.004 / esc, dur);
    voz.fuente(src, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  // --- 5. Astillado (vidrio) -----------------------------------------------------------
  if (par.astillas > 0.25 && detalle >= 2) {
    const n = Math.min(12, Math.round(par.astillas * (2 + tam * 2.5)));
    for (let k = 0; k < n; k++) {
      const dt = (R.azar() * 0.075 + 0.004) / esc;
      const f = sujetar((2200 + R.azar() * 6500) / Math.pow(tam, 0.35), 700, 15000) * esc;
      if (f > fcExc * 2.2) continue;   // el contacto no puede excitar por encima de su banda
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = ctx.createGain();
      osc.connect(g); g.connect(voz.entrada);
      const p = golpe(g, t0 + dt, nivel * 0.10 * (1 - k / (n + 2)) * par.astillas,
        0.0015 / esc, (0.035 + R.azar() * 0.16) / esc);
      voz.fuente(osc, p + 0.02);
      tFin = Math.max(tFin, p);
    }
  }

  // --- 6. Repique y microimpactos ------------------------------------------------------
  // Densidad de transitorios creciente con la masa: un objeto pesado nunca da UN golpe,
  // da un golpe y un reasentamiento.
  if (detalle >= 1 && par.repique > 0.08) {
    const n = Math.min(10, Math.round(par.repique * (1.2 + tam * 2.4)));
    for (let k = 0; k < n; k++) {
      const dt = (0.012 + R.azar() * (0.05 + 0.13 * tam)) / esc;
      const f = f0 * (1 + R.azar() * 2.6) * (0.9 + R.azar() * 0.2);
      if (f > Math.min(17000, fcExc * 1.8)) continue;
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = ctx.createGain();
      osc.connect(g); g.connect(voz.entrada);
      const p = golpe(g, t0 + dt, nivel * 0.085 * par.repique * (1 - 0.6 * k / n),
        0.0018 / esc, sujetar(t60 * (0.10 + R.azar() * 0.28), 0.015, 0.8));
      voz.fuente(osc, p + 0.02);
      tFin = Math.max(tFin, p);
    }
  }

  // --- 7. Rebotes / reasentamiento (solo masas grandes) --------------------------------
  if (tam > 1.15 && detalle >= 1 && opciones.rebotes !== false) {
    const n = sujetar(Math.round(1 + tam * 0.9), 1, 4);
    let dt = (0.055 + R.azar() * 0.05) / esc;
    for (let k = 0; k < n; k++) {
      const amp = nivel * 0.30 * Math.pow(0.52, k + 1);
      if (amp < 0.012) break;
      const fr = f0 * (0.92 + R.azar() * 0.16);
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = fr;
      const g = ctx.createGain();
      osc.connect(g); g.connect(voz.entrada);
      const p = golpe(g, t0 + dt, amp, 0.002 / esc, sujetar(t60 * 0.45, 0.02, 1.0));

      // El rebote tambien lleva su propio transitorio de contacto, mas apagado.
      const src = R.fuente('blanco', 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = fcExc * 0.32; lp.Q.value = 0.6;
      const g2 = ctx.createGain();
      src.connect(lp); lp.connect(g2); g2.connect(voz.entrada);
      const p2 = golpe(g2, t0 + dt, amp * 0.8, 0.0015 / esc, 0.018 / esc);
      voz.fuente(src, p2 + 0.02);
      voz.fuente(osc, p + 0.02);

      tFin = Math.max(tFin, p, p2);
      dt += (0.05 + R.azar() * 0.09) / esc * Math.pow(0.78, k);
    }
  }

  // Normalizacion de pico coherente. El objetivo es que el pico de la voz siga a `nivel`
  // (que ya codifica el momento del impacto) y no al numero de capas apiladas. Solo
  // atenua; nunca amplifica.
  const objetivo = nivel * 1.35;
  if (picoCoherente > objetivo) {
    voz.ganancia.gain.value = sujetar(objetivo / picoCoherente, 0.12, 1);
  }

  voz.fin = tFin;
  return { voz, fin: tFin, f0, t60, fcExc, tam, masa, nivel, par, picoCoherente };
}
