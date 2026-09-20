// MANIPULADOR FISICO (la "physgun"). Zumbido de tension.
//
// Requisito de diseno: un objeto de 400 kg tiene que SONAR distinto de uno de 5 kg.
//   - La masa baja el tono fundamental (mas inercia = mas lento = mas grave).
//   - La masa aumenta el batido: dos osciladores desafinados producen un pulso cuya
//     frecuencia de batido cae con la masa -> se oye el esfuerzo.
//   - La tension abre el filtro y sube la modulacion en anillo (chispa energetica).

import { abrirVoz } from '../nucleo/voz.js';
import { rampa, rampaFrec, entrar, salir, sujetar } from '../nucleo/util.js';

export function crearManipulador(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = motor.ahora();

  // No es un sonido del mundo: acompana al jugador. Va sin panner, pero con envio de
  // reverberacion para que no quede pegado a la cara.
  const voz = abrirVoz(motor, {
    cuando: t0, duracion: 1e6, espacial: false, bus: 'continuo',
    envioReverb: 0.10, prioridad: 2.0,
  });
  voz.ganancia.gain.value = 0;

  const a = ctx.createOscillator(); a.type = 'sawtooth';
  const b = ctx.createOscillator(); b.type = 'sawtooth';
  const c = ctx.createOscillator(); c.type = 'triangle';
  const gA = ctx.createGain(); gA.gain.value = 0.30;
  const gB = ctx.createGain(); gB.gain.value = 0.30;
  const gC = ctx.createGain(); gC.gain.value = 0.40;

  // Modulacion en anillo: da el timbre "de energia" sin recurrir a una muestra.
  const anillo = ctx.createOscillator(); anillo.type = 'sine'; anillo.frequency.value = 73;
  const gAnillo = ctx.createGain(); gAnillo.gain.value = 0;
  const mezclaAnillo = ctx.createGain(); mezclaAnillo.gain.value = 0;
  anillo.connect(gAnillo.gain);

  const suma = ctx.createGain(); suma.gain.value = 1;
  a.connect(gA); b.connect(gB); c.connect(gC);
  gA.connect(suma); gB.connect(suma); gC.connect(suma);
  suma.connect(gAnillo); gAnillo.connect(mezclaAnillo); mezclaAnillo.connect(voz.entrada);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 5.5;
  suma.connect(lp); lp.connect(voz.entrada);

  const aire = R.fuente('rosa', 1);
  const bpAire = ctx.createBiquadFilter();
  bpAire.type = 'bandpass'; bpAire.frequency.value = 2600; bpAire.Q.value = 1.4;
  const gAire = ctx.createGain(); gAire.gain.value = 0;
  aire.connect(bpAire); bpAire.connect(gAire); gAire.connect(voz.entrada);

  for (const o of [a, b, c, anillo]) voz.fuente(o, t0 + 1e6);
  voz.fuente(aire, t0 + 1e6);

  const estado = { tension: 0, masa: 10 };

  function aplicar(o, t, suave = 0.08) {
    const esc = motor.escala;
    const tension = sujetar(o.tension ?? estado.tension, 0, 1);
    const masa = sujetar(o.masa ?? estado.masa, 0.1, 5000);
    estado.tension = tension; estado.masa = masa;

    // Tono inversamente ligado a la masa: 5 kg -> ~155 Hz, 400 kg -> ~52 Hz.
    const f = sujetar(118 / Math.pow(masa / 10, 0.28), 26, 340) * esc;
    // Batido: rapido y nervioso con poca masa, lento y pesado con mucha.
    const batido = sujetar(7.5 / Math.pow(masa / 10, 0.35), 0.5, 14) * esc;

    rampaFrec(a.frequency, t, f, suave);
    rampaFrec(b.frequency, t, f + batido, suave);
    rampaFrec(c.frequency, t, f * 2.01, suave);
    rampaFrec(anillo.frequency, t, sujetar((47 + 120 * tension) * esc, 10, 900), suave);

    rampaFrec(lp.frequency, t, sujetar(f * (2.4 + 9 * tension), 60, 9000), suave);
    rampa(lp.Q, t, 3.5 + 7 * tension, suave);
    rampa(mezclaAnillo.gain, t, 0.10 + 0.35 * tension, suave);
    rampa(gAire.gain, t, 0.02 + 0.10 * tension, suave);
    rampaFrec(bpAire.frequency, t, sujetar((1800 + 2600 * tension) * esc, 300, 12000), suave);

    const nivel = tension <= 0.005 ? 0 : sujetar(0.07 + 0.22 * Math.pow(tension, 0.75), 0, 0.32)
      * (o.ganancia ?? 1);
    if (nivel <= 0) rampa(voz.ganancia.gain, t, 0, 0.18);
    else entrar(voz.ganancia, t, nivel, suave);
  }

  aplicar(opciones, t0, 0.05);

  return {
    tipo: 'manipulador', voz, estado,
    actualizar(o) { aplicar(o, motor.ahora(), 0.08); },
    reescalar() { aplicar({}, motor.ahora(), 0.12); },
    parar(cuando) {
      const t = cuando ?? motor.ahora();
      const tf = salir(voz.ganancia, t, 0.12);
      voz.fin = tf;
      for (const n of [a, b, c, anillo, aire]) { try { n.stop(tf + 0.05); } catch { /* ya */ } }
    },
  };
}
