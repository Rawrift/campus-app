// BUS DE MEZCLA Y CONTROL DE VOCES.
//
// Cadena maestra:
//   buses -> sumador -> compresor de pegamento -> limitador -> saturador suave -> maestro
//
//   * compresor de pegamento: ratio bajo, ataque medio. Une la mezcla y reduce la
//     diferencia entre un impacto solo y 200 a la vez.
//   * limitador: ratio 20:1, rodilla 0, ataque 1 ms. Es el que impide que una explosion
//     con 300 impactos se pase de 0 dBFS.
//   * saturador (tanh): ultima red de seguridad. Matematicamente |tanh(x)| < 1, asi que
//     la salida NO PUEDE recortar digitalmente aunque el limitador se vea desbordado.
//     Lo que antes era un recorte duro (armonicos impares agresivos) pasa a ser
//     compresion suave.

import { curvaTanh, rampa, sujetar } from './util.js';
import { generarImpulso, ESPACIOS } from './impulso.js';

export class Mezcla {
  constructor(ctx, opciones = {}) {
    this.ctx = ctx;
    this.opciones = opciones;
    const conLimitador = opciones.limitador !== false;

    this.maestro = ctx.createGain();
    this.maestro.gain.value = opciones.volumen ?? 0.9;
    this.maestro.connect(ctx.destination);

    // Filtro de escala de tiempo: en camara lenta el mundo se oye mas oscuro y cerrado.
    // No es realismo estricto, es la convencion cinematografica, y ademas tapa el hecho
    // de que la reverberacion por convolucion no puede estirarse.
    this.filtroTiempo = ctx.createBiquadFilter();
    this.filtroTiempo.type = 'lowpass';
    this.filtroTiempo.frequency.value = 20000;
    this.filtroTiempo.Q.value = 0.5;
    this.filtroTiempo.connect(this.maestro);

    this.sumador = ctx.createGain();
    this.sumador.gain.value = 1;

    if (conLimitador) {
      this.compresor = ctx.createDynamicsCompressor();
      this.compresor.threshold.value = -20;
      this.compresor.knee.value = 14;
      this.compresor.ratio.value = 3.2;
      this.compresor.attack.value = 0.006;
      this.compresor.release.value = 0.18;

      this.limitador = ctx.createDynamicsCompressor();
      this.limitador.threshold.value = -3.5;
      this.limitador.knee.value = 0;
      this.limitador.ratio.value = 20;
      this.limitador.attack.value = 0.001;
      this.limitador.release.value = 0.09;

      this.saturador = ctx.createWaveShaper();
      this.saturador.curve = curvaTanh(1.25);
      this.saturador.oversample = '4x';

      this.sumador.connect(this.compresor);
      this.compresor.connect(this.limitador);
      this.limitador.connect(this.saturador);
      this.saturador.connect(this.filtroTiempo);
    } else {
      // Modo de verificacion: cadena maestra desnuda, para demostrar por comparacion
      // cuanto trabajo hace realmente el limitador.
      this.sumador.connect(this.filtroTiempo);
    }

    // --- Sub-buses -------------------------------------------------------------------
    this.bus = {};
    for (const nombre of ['impactos', 'continuo', 'ambiente', 'armas', 'interfaz']) {
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(this.sumador);
      this.bus[nombre] = g;
    }
    this.bus.armas.gain.value = 0.9;
    this.bus.ambiente.gain.value = 0.55;
    this.bus.interfaz.gain.value = 0.5;

    // --- Reverberacion por convolucion ------------------------------------------------
    // Dos convolvers en paralelo con ganancias cruzadas: el cambio de espacio es una
    // rampa de 1.5 s entre ambos, nunca un corte.
    this.envio = ctx.createGain();
    this.envio.gain.value = 1;

    this.espacios = {};
    this.retorno = ctx.createGain();
    this.retorno.gain.value = 1;
    this.retorno.connect(this.sumador);

    for (const nombre of Object.keys(ESPACIOS)) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = generarImpulso(ctx, ESPACIOS[nombre]);
      const g = ctx.createGain();
      g.gain.value = 0;
      this.envio.connect(conv);
      conv.connect(g);
      g.connect(this.retorno);
      this.espacios[nombre] = { conv, ganancia: g };
    }
    this.espacioActual = null;

    // --- Control de voces --------------------------------------------------------------
    this.maxVoces = opciones.maxVoces ?? 48;
    this.voces = [];
    this.fusion = new Map();
    this.ventanaFusion = opciones.ventanaFusion ?? 0.045; // s
    this.rejillaFusion = opciones.rejillaFusion ?? 2.5;   // m
    this.estadisticas = { creadas: 0, fusionadas: 0, descartadas: 0, robadas: 0, pico: 0 };
  }

  /** Cambia de espacio con fundido cruzado. */
  espacio(nombre, t, duracion = 1.5) {
    if (!this.espacios[nombre]) nombre = 'exterior';
    for (const [n, e] of Object.entries(this.espacios)) {
      rampa(e.ganancia.gain, t, n === nombre ? 1 : 0, duracion);
    }
    this.espacioActual = nombre;
  }

  /**
   * Politica de agrupacion de eventos. Devuelve el factor de ganancia que corresponde a
   * este evento, o null si hay que descartarlo.
   *
   * Dos impactos del mismo par de materiales, a menos de `rejillaFusion` metros y dentro
   * de `ventanaFusion` segundos, son perceptualmente UNO SOLO con mas cuerpo. Sumarlos a
   * pleno nivel no los hace mas fuertes: satura el bus y emborrona el transitorio.
   * Se aplica la ley de suma incoherente: N fuentes identicas -> +10*log10(N) dB, es
   * decir cada copia adicional entra con 1/sqrt(n).
   */
  agrupar(clave, posicion, t) {
    const r = this.rejillaFusion;
    const gx = posicion ? Math.round(posicion[0] / r) : 0;
    const gy = posicion ? Math.round(posicion[1] / r) : 0;
    const gz = posicion ? Math.round(posicion[2] / r) : 0;
    const k = `${clave}@${gx},${gy},${gz}`;
    const e = this.fusion.get(k);
    if (!e || t - e.t > this.ventanaFusion) {
      this.fusion.set(k, { t, n: 1 });
      return 1;
    }
    e.n++;
    e.t = Math.max(e.t, t);
    if (e.n > 7) { this.estadisticas.descartadas++; return null; }
    this.estadisticas.fusionadas++;
    // 1/sqrt(n) con una ligera desviacion para que no suene a eco identico.
    return 1 / Math.sqrt(e.n);
  }

  /** Limpia entradas viejas del mapa de fusion (evita que crezca sin fin). */
  podar(t) {
    for (const [k, e] of this.fusion) {
      if (t - e.t > this.ventanaFusion * 8) this.fusion.delete(k);
    }
    const vivas = [];
    for (const v of this.voces) { if (v.fin > t) vivas.push(v); }
    this.voces = vivas;
  }

  /**
   * Registra una voz. Si se supera el techo de polifonia se roba la voz mas antigua y
   * mas floja: se le aplica un fundido de 15 ms (nunca un corte) y se libera el hueco.
   */
  registrar(voz) {
    this.estadisticas.creadas++;
    this.voces.push(voz);
    if (this.voces.length > this.estadisticas.pico) this.estadisticas.pico = this.voces.length;
    if (this.voces.length <= this.maxVoces) return;

    // Solo se roban voces ROBABLES (eventos puntuales). Un fuego, un motor o el ambiente
    // no pueden desaparecer porque alguien haya volado un muro: se cortaria un sonido que
    // el jugador esta oyendo de forma sostenida, que es mucho mas delator que perder un
    // cascote entre doscientos.
    const candidatas = this.voces.filter((v) => v.robable !== false && v !== voz && v.viva);
    if (!candidatas.length) return;
    // Menor prioridad primero (nivel mas bajo); a igual prioridad, la mas antigua.
    candidatas.sort((a, b) => (a.prioridad - b.prioridad) || (a.inicio - b.inicio));
    const sobra = this.voces.length - this.maxVoces;
    for (let i = 0; i < sobra && i < candidatas.length; i++) {
      candidatas[i].silenciar();
      this.estadisticas.robadas++;
    }
    this.voces = this.voces.filter((v) => v.viva !== false);
  }

  volumen(v, t) { rampa(this.maestro.gain, t, sujetar(v, 0, 1.5), 0.05); }
}
