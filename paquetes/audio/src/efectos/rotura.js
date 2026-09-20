// ROTURA. Tres fases con firma temporal propia:
//   1. FRACTURA  (0-30 ms)  el material cede: transitorio duro y ancho.
//   2. RACIMO    (20-500 ms) los fragmentos se separan. Densidad DECRECIENTE en el tiempo
//                            (proceso de Poisson con tasa que cae): al principio muchos
//                            fragmentos juntos, luego espaciados. Es lo que distingue una
//                            rotura de un ruido blanco filtrado.
//   3. ASENTAMIENTO (0.2-1.5 s) los trozos caen al suelo: impactos reales agrupados.

import { parDeMateriales, material as buscarMaterial } from '../materiales.js';
import { abrirVoz } from '../nucleo/voz.js';
import { golpe, sujetar } from '../nucleo/util.js';

export function sintetizarRotura(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = opciones.cuando ?? motor.ahora();
  const esc = motor.escala;
  const nombreMat = opciones.material || 'vidrio';
  const M = buscarMaterial(nombreMat);
  const par = parDeMateriales(nombreMat, nombreMat);
  const P = sujetar(Number(opciones.potencia) || 1, 0.05, 12);
  const pos = opciones.posicion || [0, 0, 0];
  const nivel = sujetar(0.40 * Math.pow(P, 0.3), 0.08, 0.95) * (opciones.ganancia ?? 1);

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 1.8 / esc,
    prioridad: 6, bus: 'impactos', envioReverb: 1.0,
  });
  let tFin = t0;

  // 1. Fractura -----------------------------------------------------------------------------
  {
    const src = R.fuente('blanco', 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = sujetar(M.ruidoFc * 1.1, 300, 13000) * esc;
    bp.Q.value = 0.55;
    const g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * 0.9, 0.0012 / esc, sujetar(0.012 + 0.03 / M.dureza, 0.01, 0.12) / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);

    // Crujido grave de la pieza al partirse.
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const fg = sujetar(M.f0 * 0.3, 30, 400) * esc;
    osc.frequency.setValueAtTime(fg * 1.8, t0);
    osc.frequency.exponentialRampToValueAtTime(fg, t0 + 0.06 / esc);
    const g2 = ctx.createGain();
    osc.connect(g2); g2.connect(voz.entrada);
    const p2 = golpe(g2, t0, nivel * 0.5 * M.grave, 0.003 / esc, sujetar(0.10 + 0.2 * M.grave, 0.05, 0.5) / esc);
    voz.fuente(osc, p2 + 0.02); tFin = Math.max(tFin, p2);
  }

  // 2. Racimo de fragmentos -------------------------------------------------------------------
  // Tasa de Poisson decreciente: lambda(t) = lambda0 * exp(-t/tau).
  const n = Math.round(sujetar((M.astillas > 0.3 ? 34 : 16) * Math.pow(P, 0.45), 6, 70));
  const tau = sujetar(0.16 + 0.12 * P, 0.1, 0.55);
  const banda = M.astillas > 0.3 ? [1800, 9500] : [260, 2600];
  let t = 0;
  for (let k = 0; k < n; k++) {
    // Espaciado creciente: el intervalo medio crece a medida que avanza el proceso.
    t += -Math.log(1 - R.azar() * 0.999) * (tau / n) * (1 + 4.5 * (k / n));
    const dt = t / esc;
    if (dt > 1.4 / esc) break;
    const f = sujetar(banda[0] + R.azar() * (banda[1] - banda[0]), 80, 16000) * esc;
    const amp = nivel * 0.16 * Math.pow(1 - k / (n + 3), 0.8) * (0.4 + R.azar() * 0.8);
    if (amp < 0.006) continue;

    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const dec = sujetar(par.t60 * (0.05 + R.azar() * 0.22), 0.012, 0.6) / esc;
    const p = golpe(g, t0 + dt, amp, 0.0015 / esc, dec);
    voz.fuente(osc, p + 0.02);
    tFin = Math.max(tFin, p);

    // Uno de cada tres fragmentos lleva su propio ruido de fractura.
    if (k % 3 === 0) {
      const src = R.fuente('blanco', 1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f * 1.2; bp.Q.value = 1.4;
      const g2 = ctx.createGain();
      src.connect(bp); bp.connect(g2); g2.connect(voz.entrada);
      const p2 = golpe(g2, t0 + dt, amp * 0.7, 0.0012 / esc, 0.009 / esc);
      voz.fuente(src, p2 + 0.02);
      tFin = Math.max(tFin, p2);
    }
  }

  voz.fin = tFin;

  // 3. Asentamiento ------------------------------------------------------------------------------
  const nCaidas = Math.round(sujetar(3 + P * 2.2, 2, 14));
  for (let k = 0; k < nCaidas; k++) {
    const dt = (0.12 + Math.pow(R.azar(), 1.4) * (0.5 + 0.35 * P)) / esc;
    const r = 0.5 + R.azar() * 2.2;
    const ang = R.azar() * Math.PI * 2;
    motor.impacto({
      material: nombreMat,
      materialB: opciones.superficie || 'hormigon',
      momento: sujetar(2 + R.azar() * 22 * P, 1, 200),
      posicion: [pos[0] + Math.cos(ang) * r, pos[1], pos[2] + Math.sin(ang) * r],
      oclusion: opciones.oclusion || 0,
      cuando: t0 + dt,
      ganancia: 0.5,
      rebotes: false,
    });
  }

  return { voz, fin: tFin, fragmentos: n };
}
