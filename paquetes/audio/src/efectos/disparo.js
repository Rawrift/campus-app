// DISPAROS. Un disparo son tres sucesos casi simultaneos que el oido separa:
//   - el CHASQUIDO del frente de presion (microsegundos, banda ancha),
//   - el FOGONAZO, expansion de gases (ruido con paso bajo que se desploma),
//   - la MECANICA del arma (corredera, percutor: impactos metalicos pequenos, desfasados).
// Mas la cola de la sala, que es lo que da la escala del espacio.

import { abrirVoz } from '../nucleo/voz.js';
import { golpe, sobre, sujetar } from '../nucleo/util.js';

export const ARMAS = {
  pistola:  { nivel: 0.62, fc: 4200, sub: 128, durCuerpo: 0.075, cola: 0.20, mec: 2, mecF: 2400, chasq: 0.85, brillo: 1.0 },
  escopeta: { nivel: 0.92, fc: 2400, sub: 72,  durCuerpo: 0.155, cola: 0.42, mec: 3, mecF: 1500, chasq: 0.75, brillo: 0.8 },
  rifle:    { nivel: 0.88, fc: 5600, sub: 96,  durCuerpo: 0.095, cola: 0.52, mec: 2, mecF: 3100, chasq: 1.0,  brillo: 1.25 },
  subfusil: { nivel: 0.58, fc: 4600, sub: 140, durCuerpo: 0.055, cola: 0.16, mec: 2, mecF: 2900, chasq: 0.8,  brillo: 1.05 },
  laser:    { nivel: 0.5,  fc: 6000, sub: 220, durCuerpo: 0.10,  cola: 0.22, mec: 0, mecF: 0,    chasq: 0.2,  brillo: 1.4, energia: true },
};

export function sintetizarDisparo(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = opciones.cuando ?? motor.ahora();
  const esc = motor.escala;
  const A = ARMAS[String(opciones.arma || 'pistola').toLowerCase()] || ARMAS.pistola;
  const nivel = A.nivel * (opciones.ganancia ?? 1);

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: (A.cola + 0.5) / esc,
    prioridad: 8, bus: 'armas', envioReverb: 1.15,
  });
  let tFin = t0;

  if (A.energia) {
    // Arma de energia: barrido descendente + zumbido, sin polvora.
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3200 * esc, t0);
    osc.frequency.exponentialRampToValueAtTime(240 * esc, t0 + 0.13 / esc);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200 * esc; lp.Q.value = 6;
    lp.frequency.exponentialRampToValueAtTime(600 * esc, t0 + 0.16 / esc);
    const g = ctx.createGain();
    osc.connect(lp); lp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * 0.8, 0.0015 / esc, 0.16 / esc);
    voz.fuente(osc, p + 0.02); tFin = Math.max(tFin, p);

    const src = R.fuente('blanco', 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400 * esc; bp.Q.value = 2.5;
    bp.frequency.exponentialRampToValueAtTime(700 * esc, t0 + 0.14 / esc);
    const g2 = ctx.createGain();
    src.connect(bp); bp.connect(g2); g2.connect(voz.entrada);
    const p2 = golpe(g2, t0, nivel * 0.4, 0.001 / esc, 0.13 / esc);
    voz.fuente(src, p2 + 0.02); tFin = Math.max(tFin, p2);
    voz.fin = tFin;
    return { voz, fin: tFin };
  }

  // Chasquido ------------------------------------------------------------------------------
  {
    const src = R.fuente('blanco', 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = sujetar(2600 * A.brillo, 800, 9000) * esc; hp.Q.value = 0.8;
    const g = ctx.createGain();
    src.connect(hp); hp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * A.chasq, 0.0007 / esc, 0.009 / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  // Fogonazo -------------------------------------------------------------------------------
  {
    const src = R.fuente('marron', 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2.0;
    lp.frequency.setValueAtTime(A.fc * esc, t0);
    lp.frequency.exponentialRampToValueAtTime(sujetar(A.fc * 0.12, 120, 3000) * esc, t0 + A.durCuerpo / esc);
    const g = ctx.createGain();
    src.connect(lp); lp.connect(g); g.connect(voz.entrada);
    const p = sobre(g, t0, nivel, 0.0015 / esc, 0.004 / esc, A.durCuerpo / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  // Sub -------------------------------------------------------------------------------------
  {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(A.sub * 2.1 * esc, t0);
    osc.frequency.exponentialRampToValueAtTime(A.sub * 0.55 * esc, t0 + A.durCuerpo * 2.2 / esc);
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * 0.55, 0.002 / esc, A.durCuerpo * 2.4 / esc);
    voz.fuente(osc, p + 0.02); tFin = Math.max(tFin, p);
  }

  // Cola de la sala ---------------------------------------------------------------------------
  {
    const src = R.fuente('rosa', 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800 * esc; lp.Q.value = 0.7;
    lp.frequency.exponentialRampToValueAtTime(420 * esc, t0 + A.cola / esc);
    const g = ctx.createGain();
    src.connect(lp); lp.connect(g); g.connect(voz.entrada);
    const p = sobre(g, t0 + 0.006 / esc, nivel * 0.22, 0.012 / esc, 0.01 / esc, A.cola / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  // Mecanica -----------------------------------------------------------------------------------
  for (let k = 0; k < A.mec; k++) {
    const dt = (0.035 + k * 0.045 + R.azar() * 0.03) / esc;
    const f = A.mecF * (0.7 + R.azar() * 0.7) * esc;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0 + dt, nivel * 0.09, 0.0012 / esc, 0.03 / esc);
    const src = R.fuente('blanco', 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * 1.3; bp.Q.value = 1.6;
    const g2 = ctx.createGain();
    src.connect(bp); bp.connect(g2); g2.connect(voz.entrada);
    const p2 = golpe(g2, t0 + dt, nivel * 0.07, 0.001 / esc, 0.012 / esc);
    voz.fuente(osc, p + 0.02); voz.fuente(src, p2 + 0.02);
    tFin = Math.max(tFin, p, p2);
  }

  voz.fin = tFin;
  return { voz, fin: tFin };
}
