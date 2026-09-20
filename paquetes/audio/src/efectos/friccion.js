// FRICCION CONTINUA (raspado, arrastre, deslizamiento).
//
// Modelo stick-slip: la friccion no es ruido blanco con un filtro. Es una sucesion muy
// rapida de micro-adherencias y micro-deslizamientos. Eso produce:
//   - una textura granular cuya TASA de grano crece con la velocidad (playbackRate),
//   - resonancias del cuerpo arrastrado excitadas continuamente (banco de paso banda),
//   - en metales, un chillido de banda muy estrecha que aparece a velocidad alta.
// Todo parametro se mueve con rampas: acelerar un arrastre nunca produce un salto.

import { material as buscarMaterial } from '../materiales.js';
import { abrirVoz } from '../nucleo/voz.js';
import { rampa, rampaFrec, entrar, salir, sujetar } from '../nucleo/util.js';

export function crearFriccion(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = motor.ahora();

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 1e6,
    prioridad: 0.6, bus: 'continuo', envioReverb: 0.8,
  });
  voz.ganancia.gain.value = 0;

  const src = R.fuente('grano', 1);
  const bandas = [];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 * (i + 1);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = 1 / (i + 1);
    src.connect(bp); bp.connect(g); g.connect(voz.entrada);
    bandas.push({ bp, g });
  }

  // Capa de chillido: paso banda de Q muy alto. Solo asoma con materiales duros y
  // velocidad alta, que es cuando aparece en la realidad.
  const chillido = ctx.createBiquadFilter();
  chillido.type = 'bandpass'; chillido.frequency.value = 3000; chillido.Q.value = 22;
  const gChillido = ctx.createGain(); gChillido.gain.value = 0;
  src.connect(chillido); chillido.connect(gChillido); gChillido.connect(voz.entrada);

  // Cuerpo grave del arrastre (el peso que roza).
  const grave = ctx.createBiquadFilter();
  grave.type = 'lowpass'; grave.frequency.value = 220; grave.Q.value = 1.1;
  const gGrave = ctx.createGain(); gGrave.gain.value = 0.5;
  src.connect(grave); grave.connect(gGrave); gGrave.connect(voz.entrada);

  // Deriva lenta: sin ella el arrastre suena a bucle sintetico.
  const lfo = R.fuente('lento', 1);
  const gLfo = ctx.createGain(); gLfo.gain.value = 0.28;
  lfo.connect(gLfo); gLfo.connect(voz.ganancia.gain);

  voz.fuente(src, t0 + 1e6);
  voz.fuente(lfo, t0 + 1e6);

  const estado = { velocidad: 0, material: 'metal', nivel: 0 };

  function aplicar(o, t, suave = 0.07) {
    const esc = motor.escala;
    const M = buscarMaterial(o.material || estado.material);
    estado.material = o.material || estado.material;
    const v = sujetar(o.velocidad ?? estado.velocidad, 0, 40);
    estado.velocidad = v;

    // Tasa de grano: proporcional a la velocidad de deslizamiento.
    rampa(src.playbackRate, t, sujetar(0.25 + v * 0.42, 0.1, 9) * esc, suave);

    const base = M.f0 * (0.9 + 0.55 * Math.min(1, v / 8)) * esc;
    const razones = M.modos.slice(0, 3);
    for (let i = 0; i < bandas.length; i++) {
      const f = sujetar(base * (razones[i] ?? (i + 1) * 1.8), 60, 15000);
      rampaFrec(bandas[i].bp.frequency, t, f, suave);
      rampa(bandas[i].bp.Q, t, sujetar(1.5 + M.resonancia * 7, 0.7, 18), suave);
      rampa(bandas[i].g.gain, t, (M.ganancias[i] ?? 0.2) / (1 + i * 0.6), suave);
    }

    rampaFrec(grave.frequency, t, sujetar(M.f0 * 0.5 * esc, 40, 900), suave);
    rampa(gGrave.gain, t, 0.25 + M.grave * 0.5, suave);

    // El chillido necesita dureza, resonancia y velocidad a la vez.
    const disp = M.dureza * M.resonancia * sujetar((v - 2.2) / 7, 0, 1);
    rampaFrec(chillido.frequency, t, sujetar((1800 + v * 320) * esc, 300, 12000), suave * 2);
    rampa(chillido.Q, t, 14 + 22 * M.resonancia, suave);
    rampa(gChillido.gain, t, sujetar(disp * 0.55, 0, 0.6), suave * 2);

    // Nivel: crece con la velocidad pero se satura (ley de potencia, no lineal).
    const nivel = sujetar(0.10 + 0.34 * Math.pow(v / 6, 0.7), 0, 0.55) * (o.ganancia ?? 1);
    estado.nivel = nivel;
    if (v <= 0.02) rampa(voz.ganancia.gain, t, 0, 0.12);
    else entrar(voz.ganancia, t, nivel, suave);

    if (o.posicion && voz.cadena) voz.cadena.mover(o.posicion, t);
  }

  aplicar(opciones, t0, 0.05);

  return {
    tipo: 'friccion', voz, estado,
    actualizar(o) { aplicar(o, motor.ahora(), 0.07); },
    reescalar() { aplicar({}, motor.ahora(), 0.12); },
    parar(cuando) {
      const t = cuando ?? motor.ahora();
      const tf = salir(voz.ganancia, t, 0.09);
      voz.fin = tf;
      try { src.stop(tf + 0.02); lfo.stop(tf + 0.02); } catch { /* ya parada */ }
    },
  };
}
