// MOTOR DE COMBUSTION.
//
// Un motor es un tren de pulsos: cada explosion de un cilindro es un impulso. La
// frecuencia fundamental es rpm/60 * (cilindros/2) en un cuatro tiempos. Sobre esa
// fundamental hay:
//   - armonicos ricos (diente de sierra) filtrados por un paso bajo que abre con la carga,
//   - un sub sinusoidal que da el "par",
//   - ruido de admision/escape en banda ancha,
//   - resonancias fijas de la carcasa y el escape (formantes),
//   - saturacion suave, que es lo que convierte un zumbido en un motor.

import { abrirVoz } from '../nucleo/voz.js';
import { rampa, rampaFrec, entrar, salir, sujetar, curvaGrano } from '../nucleo/util.js';

export function crearMotor(motor, opciones = {}) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = motor.ahora();
  const cilindros = opciones.cilindros ?? 4;

  const voz = abrirVoz(motor, {
    ...opciones, cuando: t0, duracion: 1e6,
    prioridad: 0.7, bus: 'continuo', envioReverb: 0.6,
  });
  voz.ganancia.gain.value = 0;

  const sub = ctx.createOscillator(); sub.type = 'sine';
  const gSub = ctx.createGain(); gSub.gain.value = 0.55;
  const sierra = ctx.createOscillator(); sierra.type = 'sawtooth';
  const gSierra = ctx.createGain(); gSierra.gain.value = 0.35;
  const sierra2 = ctx.createOscillator(); sierra2.type = 'sawtooth'; sierra2.detune.value = 11;
  const gSierra2 = ctx.createGain(); gSierra2.gain.value = 0.22;
  const cuadrada = ctx.createOscillator(); cuadrada.type = 'square';
  const gCuadrada = ctx.createGain(); gCuadrada.gain.value = 0.12;

  const admision = R.fuente('rosa', 1);
  const gAdmision = ctx.createGain(); gAdmision.gain.value = 0.10;
  const bpAdmision = ctx.createBiquadFilter();
  bpAdmision.type = 'bandpass'; bpAdmision.frequency.value = 900; bpAdmision.Q.value = 1.1;

  const mezclador = ctx.createGain(); mezclador.gain.value = 1;
  sub.connect(gSub); gSub.connect(mezclador);
  sierra.connect(gSierra); gSierra.connect(mezclador);
  sierra2.connect(gSierra2); gSierra2.connect(mezclador);
  cuadrada.connect(gCuadrada); gCuadrada.connect(mezclador);
  admision.connect(bpAdmision); bpAdmision.connect(gAdmision); gAdmision.connect(mezclador);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.4;

  const grano = ctx.createWaveShaper();
  grano.curve = curvaGrano(0.55); grano.oversample = '2x';

  // Formantes: dos picos fijos que dan el cuerpo del bloque y del escape.
  const form1 = ctx.createBiquadFilter();
  form1.type = 'peaking'; form1.frequency.value = 190; form1.Q.value = 2.2; form1.gain.value = 8;
  const form2 = ctx.createBiquadFilter();
  form2.type = 'peaking'; form2.frequency.value = 620; form2.Q.value = 3.0; form2.gain.value = 5;

  mezclador.connect(lp); lp.connect(grano); grano.connect(form1); form1.connect(form2);
  form2.connect(voz.entrada);

  // Irregularidad de ralenti: sin ella el motor suena a sintetizador.
  const lfo = R.fuente('lento', 0.9);
  const gLfo = ctx.createGain(); gLfo.gain.value = 6;
  lfo.connect(gLfo); gLfo.connect(sub.detune);
  const gLfo2 = ctx.createGain(); gLfo2.gain.value = 22;
  lfo.connect(gLfo2); gLfo2.connect(sierra.detune);

  for (const o of [sub, sierra, sierra2, cuadrada]) voz.fuente(o, t0 + 1e6);
  voz.fuente(admision, t0 + 1e6);
  voz.fuente(lfo, t0 + 1e6);

  const estado = { rpm: 0, carga: 0 };

  function aplicar(o, t, suave = 0.12) {
    const esc = motor.escala;
    const rpm = sujetar(o.rpm ?? estado.rpm, 0, 12000);
    const carga = sujetar(o.carga ?? estado.carga, 0, 1);
    estado.rpm = rpm; estado.carga = carga;

    const f = sujetar((rpm / 60) * (cilindros / 2), 3, 400) * esc;
    rampaFrec(sub.frequency, t, sujetar(f * 0.5, 1.5, 300), suave);
    rampaFrec(sierra.frequency, t, f, suave);
    rampaFrec(sierra2.frequency, t, f * 1.005, suave);
    rampaFrec(cuadrada.frequency, t, f * 2, suave);

    // La carga abre el filtro: a plena carga se oyen los armonicos altos (rugido);
    // a carga cero el motor "ronronea" apagado aunque gire igual de rapido.
    rampaFrec(lp.frequency, t, sujetar(f * (5 + 26 * carga) + 160 * esc, 90, 12000), suave);
    rampa(lp.Q, t, 1.0 + 2.2 * carga, suave);
    rampa(gSierra.gain, t, 0.22 + 0.30 * carga, suave);
    rampa(gCuadrada.gain, t, 0.05 + 0.16 * carga, suave);
    rampa(gAdmision.gain, t, 0.05 + 0.22 * carga, suave);
    rampaFrec(bpAdmision.frequency, t, sujetar((600 + rpm * 0.25) * esc, 200, 9000), suave);
    rampaFrec(form1.frequency, t, sujetar(190 * esc, 40, 2000), suave);
    rampaFrec(form2.frequency, t, sujetar(620 * esc, 100, 6000), suave);

    const nivel = rpm < 40 ? 0 : sujetar(0.13 + 0.30 * carga + 0.10 * (rpm / 6000), 0, 0.52)
      * (o.ganancia ?? 1);
    if (nivel <= 0) rampa(voz.ganancia.gain, t, 0, 0.25);
    else entrar(voz.ganancia, t, nivel, suave);

    if (o.posicion && voz.cadena) voz.cadena.mover(o.posicion, t);
  }

  aplicar(opciones, t0, 0.06);

  return {
    tipo: 'motor', voz, estado,
    actualizar(o) { aplicar(o, motor.ahora(), 0.12); },
    reescalar() { aplicar({}, motor.ahora(), 0.15); },
    parar(cuando) {
      const t = cuando ?? motor.ahora();
      // Al parar, el motor baja de vueltas: no se corta, se apaga.
      rampaFrec(sierra.frequency, t, Math.max(3, sierra.frequency.value * 0.35), 0.5);
      rampaFrec(sub.frequency, t, Math.max(2, sub.frequency.value * 0.35), 0.5);
      const tf = salir(voz.ganancia, t + 0.15, 0.4);
      voz.fin = tf;
      for (const n of [sub, sierra, sierra2, cuadrada, admision, lfo]) {
        try { n.stop(tf + 0.05); } catch { /* ya parada */ }
      }
    },
  };
}
