// INTERFAZ. Sonidos no diegeticos: sin panner, sin absorcion de aire, envio minimo de
// reverberacion. Deben ser cortos, limpios y nunca tapar la accion. Todos con rampas de
// 1.5 ms como minimo: un clic de UI con corte instantaneo produce un chasquido audible
// justo en el rango en que el oido es mas sensible.

import { abrirVoz } from '../nucleo/voz.js';
import { golpe, sujetar } from '../nucleo/util.js';

const SONIDOS = {
  hover:  { notas: [[1180, 0.055, 0.30]], nivel: 0.22, tipo: 'sine',     ruido: 0.05, pan: 0 },
  click:  { notas: [[880, 0.045, 1.0], [1760, 0.070, 0.45]], nivel: 0.36, tipo: 'sine', ruido: 0.18, pan: 0 },
  abrir:  { notas: [[520, 0.10, 0.7], [780, 0.12, 0.6], [1040, 0.16, 0.5]], nivel: 0.30, tipo: 'triangle', ruido: 0.08, escalonado: 0.035, pan: -0.12 },
  cerrar: { notas: [[1040, 0.09, 0.6], [780, 0.10, 0.6], [520, 0.15, 0.7]], nivel: 0.30, tipo: 'triangle', ruido: 0.08, escalonado: 0.035, pan: 0.12 },
  error:  { notas: [[233, 0.26, 1.0], [220, 0.26, 0.85], [466, 0.16, 0.3]], nivel: 0.34, tipo: 'sawtooth', ruido: 0.05, pan: 0, filtro: 900 },
  aceptar:{ notas: [[660, 0.08, 0.7], [990, 0.16, 0.7]], nivel: 0.30, tipo: 'sine', ruido: 0.06, escalonado: 0.05, pan: 0 },
};

export function sintetizarInterfaz(motor, nombre, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = opciones.cuando ?? motor.ahora();
  const S = SONIDOS[String(nombre || 'click').toLowerCase()] || SONIDOS.click;
  // La interfaz NO se ralentiza con la camara lenta: sigue siendo del jugador, no del mundo.
  const nivel = S.nivel * (opciones.ganancia ?? 1);

  const voz = abrirVoz(motor, {
    cuando: t0, duracion: 0.5, espacial: false, bus: 'interfaz',
    pan: S.pan ?? 0, envioReverb: 0.06, prioridad: 5,
  });
  let tFin = t0;

  let filtro = null;
  if (S.filtro) {
    filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass'; filtro.frequency.value = S.filtro; filtro.Q.value = 3;
    filtro.connect(voz.entrada);
  }
  const destino = filtro || voz.entrada;

  S.notas.forEach(([f, dur, amp], i) => {
    const dt = (S.escalonado || 0) * i;
    const osc = ctx.createOscillator();
    osc.type = S.tipo;
    osc.frequency.value = f;
    const g = ctx.createGain();
    osc.connect(g); g.connect(destino);
    const p = golpe(g, t0 + dt, nivel * amp, 0.0035, dur);
    voz.fuente(osc, p + 0.02);
    tFin = Math.max(tFin, p);
  });

  if (S.ruido > 0) {
    const src = R.fuente('blanco', 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2600; hp.Q.value = 0.7;
    const g = ctx.createGain();
    src.connect(hp); hp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * S.ruido, 0.0018, 0.012);
    voz.fuente(src, p + 0.02);
    tFin = Math.max(tFin, p);
  }

  voz.fin = tFin;
  return { voz, fin: tFin };
}

export const SONIDOS_INTERFAZ = Object.keys(SONIDOS);
