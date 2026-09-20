// Ciclo de vida de una voz. Toda fuente sonora del motor pasa por aqui, de modo que el
// limitador de polifonia y el robo de voces valen para TODOS los efectos por igual.

import { cadenaEspacial } from './espacial.js';
import { salir } from './util.js';

export function abrirVoz(motor, opciones = {}) {
  const ctx = motor.ctx;
  const t0 = opciones.cuando ?? motor.ahora();

  const ganancia = ctx.createGain();
  ganancia.gain.value = 1;

  let cadena = null;
  if (opciones.espacial === false) {
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = opciones.pan ?? 0;
      ganancia.connect(pan);
      pan.connect(motor.mezcla.bus[opciones.bus || 'interfaz']);
    } else {
      ganancia.connect(motor.mezcla.bus[opciones.bus || 'interfaz']);
    }
    if (opciones.envioReverb) {
      const e = ctx.createGain();
      e.gain.value = opciones.envioReverb;
      ganancia.connect(e);
      e.connect(motor.mezcla.envio);
    }
  } else {
    cadena = cadenaEspacial(motor, { ...opciones, cuando: t0 });
    ganancia.connect(cadena.entrada);
  }

  const fuentes = [];
  const voz = {
    entrada: ganancia,
    ganancia,
    cadena,
    inicio: t0,
    fin: t0 + (opciones.duracion ?? 1),
    prioridad: opciones.prioridad ?? 1,
    // Una voz continua (duracion enorme) nunca se roba: cortarla se oye.
    robable: opciones.robable ?? ((opciones.duracion ?? 1) < 100),
    viva: true,

    /** Registra una fuente y programa su parada. Nunca se para sin rampa previa. */
    fuente(nodo, tParada) {
      fuentes.push({ nodo, tParada });
      if (typeof nodo.start === 'function') {
        try { nodo.start(t0, opciones.desfase || 0); } catch { nodo.start(t0); }
      }
      if (typeof nodo.stop === 'function') nodo.stop(tParada);
      if (tParada > voz.fin) voz.fin = tParada;
      return nodo;
    },

    /**
     * Igual que `fuente`, pero arrancando el nodo ANTES del ataque. Como la ganancia de
     * la capa ya vale cero hasta su envolvente, no se oye nada; lo que se consigue es que
     * cada oscilador llegue a t0 con una FASE distinta. Sin esto, todos los modos de un
     * impacto arrancan en fase 0 y sus amplitudes se suman de forma coherente en el
     * ataque: el pico crece con el numero de modos en vez de con la energia del golpe.
     */
    fuenteEn(nodo, tInicio, tParada) {
      fuentes.push({ nodo, tParada });
      const ti = Math.max(0, tInicio);
      if (typeof nodo.start === 'function') { try { nodo.start(ti); } catch { /* ya */ } }
      if (typeof nodo.stop === 'function') nodo.stop(tParada);
      if (tParada > voz.fin) voz.fin = tParada;
      return nodo;
    },

    /** Silencia la voz con un fundido corto (robo de voz). */
    silenciar() {
      if (!voz.viva) return;
      voz.viva = false;
      const t = Math.max(motor.ahora(), voz.inicio);
      const tf = salir(ganancia, t, 0.015);
      for (const f of fuentes) {
        if (typeof f.nodo.stop === 'function' && tf < f.tParada) {
          try { f.nodo.stop(tf); } catch { /* ya parada */ }
        }
      }
      voz.fin = tf;
    },
  };

  motor.mezcla.registrar(voz);
  return voz;
}
