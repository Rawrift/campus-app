// AUDIO POSICIONAL.
//
// Cadena por voz:
//   fuente -> filtroAire (paso bajo) -> filtroOclusion (paso bajo) -> panner HRTF -> bus
//                                    \-> envioReverb (ganancia segun distancia)
//
//  * filtroAire: la absorcion del aire es dependiente de la frecuencia. A 50 m ya no se
//    oyen los 12 kHz de un impacto. Se modela con un paso bajo cuya fc cae con la
//    distancia (aproximacion de la curva de absorcion atmosferica).
//  * filtroOclusion: un muro entre fuente y oyente no baja el volumen por igual en todas
//    las frecuencias; se lleva primero los agudos. Se modela con otro paso bajo mas una
//    atenuacion de banda ancha.
//  * envio a reverberacion: crece con la distancia (relacion directo/reverberado). De
//    cerca dominas el sonido directo; de lejos, la sala.

import { sujetar } from './util.js';

export const DISTANCIA_REF = 2.5;
export const DISTANCIA_MAX = 160;

/**
 * Construye la cadena espacial de una voz.
 * @returns {{entrada: AudioNode, panner: PannerNode, liberar: Function}}
 */
export function cadenaEspacial(motor, opciones = {}) {
  const ctx = motor.ctx;
  const { posicion = null, oclusion = 0, bus = 'impactos', envioReverb = 1, directividad = 0 } = opciones;

  const panner = ctx.createPanner();
  panner.panningModel = motor.hrtf ? 'HRTF' : 'equalpower';
  panner.distanceModel = 'inverse';
  panner.refDistance = DISTANCIA_REF;
  panner.maxDistance = DISTANCIA_MAX;
  panner.rolloffFactor = 1.1;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 1;

  const p = posicion || [0, 0, 0];
  fijar(panner.positionX, panner, 'setPosition', p);

  const distancia = motor.distanciaAlOyente(p);

  const filtroAire = ctx.createBiquadFilter();
  filtroAire.type = 'lowpass';
  filtroAire.frequency.value = fcAire(distancia);
  filtroAire.Q.value = 0.4;

  const filtroOclusion = ctx.createBiquadFilter();
  filtroOclusion.type = 'lowpass';
  const oc = sujetar(oclusion, 0, 1);
  filtroOclusion.frequency.value = 20000 * Math.pow(0.018, oc);
  filtroOclusion.Q.value = 0.5;

  const gananciaOclusion = ctx.createGain();
  gananciaOclusion.gain.value = 1 - 0.62 * oc;

  filtroAire.connect(filtroOclusion);
  filtroOclusion.connect(gananciaOclusion);
  gananciaOclusion.connect(panner);
  panner.connect(motor.mezcla.bus[bus] || motor.mezcla.bus.impactos);

  // Envio a reverberacion, pre-panner (mono) y ponderado por distancia y oclusion:
  // lo que esta tapado por un muro te llega casi solo por reverberacion.
  const envio = ctx.createGain();
  const relacion = sujetar(0.12 + 0.55 * Math.min(1, distancia / 28), 0, 0.85);
  envio.gain.value = envioReverb * (relacion + oc * 0.30);
  gananciaOclusion.connect(envio);
  envio.connect(motor.mezcla.envio);

  return {
    entrada: filtroAire,
    panner, filtroAire, filtroOclusion, envio, distancia,
    mover(nuevaPos, t) {
      fijar(panner.positionX, panner, 'setPosition', nuevaPos, t);
      const d = motor.distanciaAlOyente(nuevaPos);
      filtroAire.frequency.setTargetAtTime(fcAire(d), t, 0.05);
    },
  };
}

/** Frecuencia de corte del paso bajo de aire segun distancia (m). */
export function fcAire(d) {
  // ~20 kHz junto al oyente, ~3.5 kHz a 40 m, ~1.6 kHz a 120 m.
  return sujetar(20000 * Math.pow(0.5, Math.max(0, d) / 17), 900, 20000);
}

/** Compatibilidad: AudioParams modernos o la API antigua setPosition/setOrientation. */
export function fijar(param, nodo, metodoViejo, valores, t) {
  if (param && typeof param.setValueAtTime === 'function') {
    const nombres = metodoViejo === 'setPosition'
      ? ['positionX', 'positionY', 'positionZ']
      : ['orientationX', 'orientationY', 'orientationZ'];
    for (let i = 0; i < 3; i++) {
      const pr = nodo[nombres[i]];
      if (!pr) continue;
      const v = Number.isFinite(valores[i]) ? valores[i] : 0;
      if (t === undefined) pr.value = v;
      else { pr.cancelScheduledValues(t); pr.setValueAtTime(pr.value, t); pr.linearRampToValueAtTime(v, t + 0.03); }
    }
  } else if (typeof nodo[metodoViejo] === 'function') {
    nodo[metodoViejo](valores[0] || 0, valores[1] || 0, valores[2] || 0);
  }
}

/** Aplica posicion y orientacion al AudioListener (API moderna con reserva antigua). */
export function colocarOyente(listener, posicion, frente, arriba, t) {
  if (listener.positionX) {
    const set = (p, v) => {
      if (!p) return;
      if (t === undefined) p.value = v;
      else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + 0.02); }
    };
    set(listener.positionX, posicion[0]); set(listener.positionY, posicion[1]); set(listener.positionZ, posicion[2]);
    set(listener.forwardX, frente[0]); set(listener.forwardY, frente[1]); set(listener.forwardZ, frente[2]);
    set(listener.upX, arriba[0]); set(listener.upY, arriba[1]); set(listener.upZ, arriba[2]);
  } else {
    if (listener.setPosition) listener.setPosition(posicion[0], posicion[1], posicion[2]);
    if (listener.setOrientation) listener.setOrientation(frente[0], frente[1], frente[2], arriba[0], arriba[1], arriba[2]);
  }
}

/** Convierte un cuaternion {x,y,z,w} en vectores frente/arriba. */
export function ejesDesdeCuaternion(q) {
  const { x, y, z, w } = q;
  const frente = [
    -2 * (x * z + w * y),
    -2 * (y * z - w * x),
    -(1 - 2 * (x * x + y * y)),
  ];
  const arriba = [
    2 * (x * y - w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z + w * x),
  ];
  return { frente, arriba };
}
