// PASOS. Un paso no es un golpe: son DOS sucesos (talon y punta) con un raspado corto en
// medio. Correr acorta la separacion, sube la energia y anade el rozamiento de la suela.
// La superficie se sintetiza con el mismo motor de impacto, con masa baja, para que un
// paso sobre metal comparta timbre con un objeto golpeando ese mismo metal.

import { abrirVoz } from '../nucleo/voz.js';
import { material as buscarMaterial } from '../materiales.js';
import { golpe, sujetar } from '../nucleo/util.js';

export function sintetizarPaso(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = opciones.cuando ?? motor.ahora();
  const esc = motor.escala;
  const correr = !!opciones.correr;
  const M = buscarMaterial(opciones.superficie || 'hormigon');
  const nivel = (correr ? 0.34 : 0.19) * (opciones.ganancia ?? 1);

  // Talon: impacto real con masa de pierna (~momento 18 andando, 45 corriendo).
  const r1 = motor.impacto({
    material: 'goma',
    materialB: opciones.superficie || 'hormigon',
    momento: correr ? 46 : 17,
    posicion: opciones.posicion,
    oclusion: opciones.oclusion,
    cuando: t0,
    ganancia: nivel * 3.0,
    rebotes: false,
    agrupar: false,
    bus: 'impactos',
  });

  // Punta + raspado de suela.
  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 0.4 / esc,
    prioridad: 1.2, bus: 'impactos', envioReverb: 0.9,
  });
  const dtPunta = (correr ? 0.038 : 0.072) * (0.85 + R.azar() * 0.3) / esc;

  {
    const src = R.fuente(M.ruido > 0.7 ? 'grano' : 'blanco', 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = sujetar(M.ruidoFc * (correr ? 1.15 : 0.9), 200, 12000) * esc;
    bp.Q.value = 0.8 + M.resonancia * 1.6;
    const g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(voz.entrada);
    const dur = (correr ? 0.045 : 0.075) * (1 + M.ruido) / esc;
    const p = golpe(g, t0 + dtPunta, nivel * (0.35 + 0.45 * M.ruido), 0.004 / esc, dur);
    voz.fuente(src, p + 0.02);
    voz.fin = p;
  }

  // Raspado de la suela al despegar (solo andando; corriendo no da tiempo).
  if (!correr && M.dureza > 0.3) {
    const src = R.fuente('grano', 0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = sujetar(M.ruidoFc * 1.4, 400, 13000) * esc; bp.Q.value = 1.3;
    const g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(voz.entrada);
    const p = golpe(g, t0 + dtPunta + 0.03 / esc, nivel * 0.14, 0.012 / esc, 0.05 / esc);
    voz.fuente(src, p + 0.02);
    voz.fin = Math.max(voz.fin, p);
  }

  return { voz, fin: Math.max(voz.fin, r1 ? r1.fin : 0) };
}
