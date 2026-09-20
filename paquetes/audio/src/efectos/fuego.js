// FUEGO. Dos capas con comportamiento muy distinto:
//   - RUGIDO: ruido marron por paso bajo resonante, con deriva lenta. Es la combustion.
//   - CREPITAR: impulsos dispersos. Se sirven desde un buffer pregenerado en bucle con
//     velocidad variable, en vez de programar cada chasquido: cuesta un nodo en lugar de
//     cientos, y suena igual de irregular.
// La intensidad mueve las dos capas en sentidos distintos: una hoguera pequena crepita
// mucho y ruge poco; un incendio ruge y el crepitar se pierde dentro.

import { abrirVoz } from '../nucleo/voz.js';
import { rampa, rampaFrec, entrar, salir, sujetar } from '../nucleo/util.js';

export function crearFuego(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = motor.ahora();

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 1e6,
    prioridad: 0.5, bus: 'continuo', envioReverb: 0.9,
  });
  voz.ganancia.gain.value = 0;

  const rugido = R.fuente('marron', 1);
  const lpRugido = ctx.createBiquadFilter();
  lpRugido.type = 'lowpass'; lpRugido.frequency.value = 420; lpRugido.Q.value = 3.2;
  const gRugido = ctx.createGain(); gRugido.gain.value = 0.7;
  rugido.connect(lpRugido); lpRugido.connect(gRugido); gRugido.connect(voz.entrada);

  const soplo = R.fuente('rosa', 1);
  const bpSoplo = ctx.createBiquadFilter();
  bpSoplo.type = 'bandpass'; bpSoplo.frequency.value = 1100; bpSoplo.Q.value = 0.8;
  const gSoplo = ctx.createGain(); gSoplo.gain.value = 0.18;
  soplo.connect(bpSoplo); bpSoplo.connect(gSoplo); gSoplo.connect(voz.entrada);

  const crep = R.fuente('crepitar', 1);
  const hpCrep = ctx.createBiquadFilter();
  hpCrep.type = 'highpass'; hpCrep.frequency.value = 900; hpCrep.Q.value = 0.6;
  const gCrep = ctx.createGain(); gCrep.gain.value = 0.3;
  crep.connect(hpCrep); hpCrep.connect(gCrep); gCrep.connect(voz.entrada);

  // Respiracion: el fuego late. El LFO de ruido lento modula la frecuencia del paso bajo
  // del rugido y su ganancia.
  const lfo = R.fuente('lento', 1.4);
  const gLfoF = ctx.createGain(); gLfoF.gain.value = 130;
  lfo.connect(gLfoF); gLfoF.connect(lpRugido.frequency);
  const gLfoA = ctx.createGain(); gLfoA.gain.value = 0.22;
  lfo.connect(gLfoA); gLfoA.connect(gRugido.gain);

  voz.fuente(rugido, t0 + 1e6);
  voz.fuente(soplo, t0 + 1e6);
  voz.fuente(crep, t0 + 1e6);
  voz.fuente(lfo, t0 + 1e6);

  const estado = { intensidad: 0 };

  function aplicar(o, t, suave = 0.25) {
    const esc = motor.escala;
    const I = sujetar(o.intensidad ?? estado.intensidad, 0, 1);
    estado.intensidad = I;

    rampa(rugido.playbackRate, t, sujetar(0.55 + I * 0.55, 0.1, 4) * esc, suave);
    rampa(crep.playbackRate, t, sujetar(0.6 + I * 0.9, 0.1, 4) * esc, suave);
    rampa(soplo.playbackRate, t, sujetar(0.7 + I * 0.6, 0.1, 4) * esc, suave);

    rampaFrec(lpRugido.frequency, t, sujetar((190 + 520 * I) * esc, 60, 6000), suave);
    rampa(gRugido.gain, t, 0.25 + 0.75 * I, suave);
    rampa(gSoplo.gain, t, 0.05 + 0.26 * I, suave);
    rampaFrec(bpSoplo.frequency, t, sujetar((700 + 900 * I) * esc, 200, 9000), suave);
    // El crepitar domina cuando el fuego es pequeno.
    rampa(gCrep.gain, t, sujetar(0.42 - 0.22 * I, 0.05, 0.5), suave);
    rampaFrec(hpCrep.frequency, t, sujetar(1100 * esc, 200, 8000), suave);

    const nivel = I <= 0.01 ? 0 : sujetar(0.10 + 0.34 * Math.pow(I, 0.8), 0, 0.46) * (o.ganancia ?? 1);
    if (nivel <= 0) rampa(voz.ganancia.gain, t, 0, 0.5);
    else entrar(voz.ganancia, t, nivel, suave);

    if (o.posicion && voz.cadena) voz.cadena.mover(o.posicion, t);
  }

  aplicar(opciones, t0, 0.3);

  return {
    tipo: 'fuego', voz, estado,
    actualizar(o) { aplicar(o, motor.ahora(), 0.3); },
    reescalar() { aplicar({}, motor.ahora(), 0.3); },
    parar(cuando) {
      const t = cuando ?? motor.ahora();
      const tf = salir(voz.ganancia, t, 0.7);   // el fuego se apaga, no se corta
      voz.fin = tf;
      for (const n of [rugido, soplo, crep, lfo]) { try { n.stop(tf + 0.05); } catch { /* ya */ } }
    },
  };
}
