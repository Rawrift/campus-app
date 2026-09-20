// AMBIENTE. Lecho sonoro continuo del espacio, mas el cambio de reverberacion.
//
//   exterior      -> viento de banda ancha con rafagas, y un fondo grave lejano.
//   interior_nave -> zumbido de maquinaria (50 Hz y armonicos), zumbido electrico de
//                    fluorescente, y aire de ventilacion.
//
// El cambio de ambiente es un fundido cruzado de 1.5 s en las capas Y en los convolvers,
// nunca un corte.

import { abrirVoz } from '../nucleo/voz.js';
import { rampa, rampaFrec, sujetar } from '../nucleo/util.js';

export function crearAmbiente(motor) {
  const ctx = motor.ctx;
  const R = motor.ruido;
  const t0 = motor.ahora();
  const capas = {};

  // --- Exterior -----------------------------------------------------------------------
  {
    const voz = abrirVoz(motor, {
      cuando: t0, duracion: 1e6, espacial: false, bus: 'ambiente',
      envioReverb: 0.25, prioridad: 3.0,
    });
    voz.ganancia.gain.value = 0;

    const viento = R.fuente('rosa', 0.85);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.55;
    const g = ctx.createGain(); g.gain.value = 0.55;
    viento.connect(bp); bp.connect(g); g.connect(voz.entrada);

    // Rafagas: el LFO lento mueve a la vez la frecuencia y el nivel. Sin esto el viento
    // es ruido rosa y se nota a la primera.
    const lfo = R.fuente('lento', 0.7);
    const gF = ctx.createGain(); gF.gain.value = 340;
    lfo.connect(gF); gF.connect(bp.frequency);
    const gA = ctx.createGain(); gA.gain.value = 0.34;
    lfo.connect(gA); gA.connect(g.gain);

    const fondo = R.fuente('marron', 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 0.8;
    const gFondo = ctx.createGain(); gFondo.gain.value = 0.35;
    fondo.connect(lp); lp.connect(gFondo); gFondo.connect(voz.entrada);

    const silbido = R.fuente('blanco', 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 4200; hp.Q.value = 0.6;
    const gSil = ctx.createGain(); gSil.gain.value = 0.05;
    silbido.connect(hp); hp.connect(gSil); gSil.connect(voz.entrada);

    for (const n of [viento, lfo, fondo, silbido]) voz.fuente(n, t0 + 1e6);
    capas.exterior = { voz, nodos: { bp, lp, hp }, fuentes: [viento, lfo, fondo, silbido], nivel: 0.30 };
  }

  // --- Interior de nave ----------------------------------------------------------------
  {
    const voz = abrirVoz(motor, {
      cuando: t0, duracion: 1e6, espacial: false, bus: 'ambiente',
      envioReverb: 0.45, prioridad: 3.0,
    });
    voz.ganancia.gain.value = 0;

    // Maquinaria: fundamental de red y armonicos pares, muy filtrados.
    const arm = [];
    for (const [f, a] of [[49.5, 0.50], [99, 0.26], [148.5, 0.12], [198, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a;
      o.connect(g); g.connect(voz.entrada);
      arm.push({ o, g, f });
      voz.fuente(o, t0 + 1e6);
    }

    // Zumbido electrico: diente de sierra a 100 Hz con paso alto -> fluorescente.
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 100;
    const hpBuzz = ctx.createBiquadFilter();
    hpBuzz.type = 'highpass'; hpBuzz.frequency.value = 1600; hpBuzz.Q.value = 0.7;
    const gBuzz = ctx.createGain(); gBuzz.gain.value = 0.020;
    buzz.connect(hpBuzz); hpBuzz.connect(gBuzz); gBuzz.connect(voz.entrada);
    voz.fuente(buzz, t0 + 1e6);

    // Ventilacion.
    const aire = R.fuente('rosa', 0.7);
    const bpAire = ctx.createBiquadFilter();
    bpAire.type = 'bandpass'; bpAire.frequency.value = 340; bpAire.Q.value = 0.7;
    const gAire = ctx.createGain(); gAire.gain.value = 0.30;
    aire.connect(bpAire); bpAire.connect(gAire); gAire.connect(voz.entrada);
    voz.fuente(aire, t0 + 1e6);

    const lfo = R.fuente('lento', 0.4);
    const gL = ctx.createGain(); gL.gain.value = 0.10;
    lfo.connect(gL); gL.connect(gAire.gain);
    voz.fuente(lfo, t0 + 1e6);

    capas.interior_nave = { voz, arm, buzz, nodos: { hpBuzz, bpAire }, nivel: 0.34 };
  }

  let actual = null;

  function reescalar(t) {
    const esc = motor.escala;
    const c = capas.interior_nave;
    for (const a of c.arm) rampaFrec(a.o.frequency, t, a.f * esc, 0.25);
    rampaFrec(c.buzz.frequency, t, 100 * esc, 0.25);
    rampaFrec(c.nodos.hpBuzz.frequency, t, sujetar(1600 * esc, 200, 12000), 0.25);
    rampaFrec(c.nodos.bpAire.frequency, t, sujetar(340 * esc, 60, 6000), 0.25);
    const e = capas.exterior;
    rampaFrec(e.nodos.lp.frequency, t, sujetar(130 * esc, 30, 1500), 0.25);
    rampaFrec(e.nodos.hp.frequency, t, sujetar(4200 * esc, 400, 16000), 0.25);
    for (const f of e.fuentes) rampa(f.playbackRate, t, sujetar(f.playbackRate.value, 0.05, 4), 0.25);
  }

  return {
    tipo: 'ambiente', capas,
    get actual() { return actual; },
    cambiar(nombre, duracion = 1.5) {
      const t = motor.ahora();
      if (!capas[nombre]) nombre = 'exterior';
      for (const [n, c] of Object.entries(capas)) {
        rampa(c.voz.ganancia.gain, t, n === nombre ? c.nivel : 0, duracion);
      }
      motor.mezcla.espacio(nombre, t, duracion);
      actual = nombre;
      reescalar(t);
    },
    reescalar() { reescalar(motor.ahora()); },
    parar(cuando) {
      const t = cuando ?? motor.ahora();
      for (const c of Object.values(capas)) rampa(c.voz.ganancia.gain, t, 0, 0.5);
    },
  };
}
