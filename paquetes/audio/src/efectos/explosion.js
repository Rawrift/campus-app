// EXPLOSION. Cinco capas con tiempos muy distintos, que es lo que la hace grande:
//   1. CHASQUIDO   (0-8 ms)     frente de onda. Banda ancha, brevisimo.
//   2. CUERPO      (0-400 ms)   ruido con paso bajo que se desploma: la bola de fuego.
//   3. SUB         (0-1.2 s)    barrido descendente 75 -> 28 Hz. El golpe en el pecho.
//   4. METRALLA    (30-900 ms)  impactos reales, pasados por la MISMA agrupacion de voces
//                               que el resto del motor. Son los que ponen a prueba el
//                               limitador y por eso NO se sintetizan aparte.
//   5. RETUMBO     (0.1-3 s)    cola grave que llega por reflexion, con ataque lento.
// La potencia no es solo volumen: baja la frecuencia del sub, alarga el retumbo y
// multiplica la metralla.

import { abrirVoz } from '../nucleo/voz.js';
import { golpe, sobre, sujetar } from '../nucleo/util.js';

export function sintetizarExplosion(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = opciones.cuando ?? motor.ahora();
  const esc = motor.escala;
  const P = sujetar(Number(opciones.potencia) || 1, 0.05, 20);
  const pos = opciones.posicion || [0, 0, 0];
  const nivel = sujetar(0.42 * Math.pow(P, 0.3), 0.08, 1.0) * (opciones.ganancia ?? 1);

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 3.5 / esc,
    prioridad: 10, bus: 'armas', envioReverb: 1.3,
  });
  let tFin = t0;

  // 1. Chasquido -------------------------------------------------------------------------
  {
    const src = R.fuente('blanco', 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400 * esc; hp.Q.value = 0.7;
    const g = ctx.createGain();
    src.connect(hp); hp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * 0.85, 0.0008 / esc, 0.012 / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  // 2. Cuerpo ----------------------------------------------------------------------------
  {
    const src = R.fuente('marron', 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.6;
    const dur = sujetar(0.22 + 0.22 * Math.log10(1 + P * 9), 0.12, 0.8) / esc;
    lp.frequency.setValueAtTime(sujetar(2600 / Math.pow(P, 0.2), 500, 8000) * esc, t0);
    lp.frequency.exponentialRampToValueAtTime(sujetar(110 / Math.pow(P, 0.25), 45, 500) * esc, t0 + dur);
    const g = ctx.createGain();
    src.connect(lp); lp.connect(g); g.connect(voz.entrada);
    const p = sobre(g, t0, nivel * 1.0, 0.0025 / esc, 0.012 / esc, dur);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  // 3. Sub --------------------------------------------------------------------------------
  {
    const f1 = sujetar(78 / Math.pow(P, 0.22), 26, 140) * esc;
    const f2 = sujetar(f1 * 0.38, 16, 90);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(f1 * 1.7, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.03 / esc);
    osc.frequency.exponentialRampToValueAtTime(f2, t0 + sujetar(0.55 * Math.pow(P, 0.2), 0.2, 1.4) / esc);
    const g = ctx.createGain();
    osc.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0, nivel * 0.95, 0.004 / esc, sujetar(0.55 * Math.pow(P, 0.28), 0.2, 1.6) / esc);
    voz.fuente(osc, p + 0.02); tFin = Math.max(tFin, p);
  }

  // 5. Retumbo ----------------------------------------------------------------------------
  {
    const src = R.fuente('marron', 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = sujetar(220 / Math.pow(P, 0.15), 70, 600) * esc; lp.Q.value = 0.8;
    const g = ctx.createGain();
    src.connect(lp); lp.connect(g); g.connect(voz.entrada);
    // Ataque LENTO: el retumbo llega despues, por reflexion en el terreno.
    const p = sobre(g, t0 + 0.05 / esc, nivel * 0.34, 0.09 / esc, 0.05 / esc,
      sujetar(1.1 * Math.pow(P, 0.3), 0.5, 3.0) / esc);
    voz.fuente(src, p + 0.02); tFin = Math.max(tFin, p);
  }

  voz.fin = tFin;

  // 4. Metralla ----------------------------------------------------------------------------
  // Pasa por motor.impacto() -> agrupacion + techo de polifonia + limitador. Es el caso
  // real de "explosion con 300 impactos" del pliego.
  const n = Math.round(sujetar(10 + P * 22, 6, 90) * (opciones.metralla ?? 1));
  const mats = opciones.materialesMetralla || ['hormigon', 'metal', 'grava', 'vidrio'];
  for (let k = 0; k < n; k++) {
    const dt = (0.02 + Math.pow(R.azar(), 1.7) * sujetar(0.55 + P * 0.16, 0.3, 1.4)) / esc;
    const r = 1.2 + R.azar() * (3 + P * 1.8);
    const ang = R.azar() * Math.PI * 2;
    const p = [pos[0] + Math.cos(ang) * r, pos[1] + R.azar() * r * 0.6, pos[2] + Math.sin(ang) * r];
    motor.impacto({
      material: mats[Math.floor(R.azar() * mats.length)],
      materialB: opciones.superficie || 'hormigon',
      momento: sujetar(6 + R.azar() * 55 * P, 2, 900),
      posicion: p,
      oclusion: opciones.oclusion || 0,
      cuando: t0 + dt,
      ganancia: 0.55,
      rebotes: false,
    });
  }

  return { voz, fin: tFin, metralla: n };
}
