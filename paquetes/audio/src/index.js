// MOTOR DE AUDIO PROCEDURAL — FRAGUA
//
// Todo el sonido del juego se sintetiza en tiempo real con WebAudio. No hay ni una sola
// muestra grabada, ni se descarga ningun archivo de audio: los unicos "datos" son los
// buffers de ruido y las respuestas al impulso, y ambos se calculan en JS al arrancar.
//
// Uso:
//   const audio = new MotorAudio();
//   await audio.iniciar();                    // llamar tras un gesto del usuario
//   audio.escucha({ posicion, orientacion });
//   audio.impacto({ material:'metal', materialB:'hormigon', momento: 420, posicion });

import { Mezcla } from './nucleo/mezcla.js';
import { BancoRuido } from './nucleo/ruido.js';
import { colocarOyente, ejesDesdeCuaternion } from './nucleo/espacial.js';
import { rampa, rampaFrec, sujetar } from './nucleo/util.js';
import { parDeMateriales, MATERIALES } from './materiales.js';

import { sintetizarImpacto } from './efectos/impacto.js';
import { sintetizarExplosion } from './efectos/explosion.js';
import { sintetizarDisparo, ARMAS } from './efectos/disparo.js';
import { sintetizarPaso } from './efectos/paso.js';
import { sintetizarInterfaz, SONIDOS_INTERFAZ } from './efectos/interfaz.js';
import { sintetizarRotura } from './efectos/rotura.js';
import { crearFriccion } from './efectos/friccion.js';
import { crearMotor } from './efectos/motor.js';
import { crearFuego } from './efectos/fuego.js';
import { crearManipulador } from './efectos/manipulador.js';

export class MotorAudio {
  /**
   * @param {object} opciones
   * @param {BaseAudioContext} [opciones.contexto] contexto ya existente (para render offline)
   * @param {boolean} [opciones.limitador=true]    false desactiva compresor+limitador+saturador
   * @param {number}  [opciones.maxVoces=48]       techo de polifonia
   * @param {number}  [opciones.volumen=0.9]
   * @param {boolean} [opciones.hrtf=true]
   * @param {number}  [opciones.semilla]           semilla del generador pseudoaleatorio
   */
  constructor(opciones = {}) {
    this.opciones = opciones;
    this.ctx = opciones.contexto || null;   // perezoso: no se crea hasta iniciar()
    this.mezcla = null;
    this.ruido = null;
    this.hrtf = opciones.hrtf !== false;
    this.escala = 1;                        // escala de tiempo (1 = normal)
    this.iniciado = false;
    this._relojVirtual = null;
    this._continuos = new Map();            // id -> { tipo, actualizar, parar, reescalar }
    this._manipulador = null;
    this._ambiente = null;
    this._ultimaPoda = 0;

    this.oyente = { posicion: [0, 0, 0], frente: [0, 0, -1], arriba: [0, 1, 0] };

    if (this.ctx) this._construir();
  }

  // ---------------------------------------------------------------- ciclo de vida ----

  /** Crea el contexto (si hace falta) y lo reanuda. Llamar tras un gesto del usuario. */
  async iniciar() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) throw new Error('WebAudio no esta disponible en este entorno.');
      this.ctx = new AC({ latencyHint: this.opciones.latencia || 'interactive' });
      this._construir();
    }
    if (this.ctx.state === 'suspended' && this.ctx.resume) await this.ctx.resume();
    this.iniciado = true;
    if (!this._ambiente) this._ambiente = crearAmbienteDiferido(this);
    return this;
  }

  _construir() {
    this.ruido = new BancoRuido(this.ctx, this.opciones.semilla ?? 20260920);
    this.mezcla = new Mezcla(this.ctx, this.opciones);
    this.mezcla.espacio('exterior', 0, 0.001);
  }

  /** Suspende el audio (pestana en segundo plano). */
  async pausar() { if (this.ctx && this.ctx.suspend) await this.ctx.suspend(); }
  async reanudar() { if (this.ctx && this.ctx.resume) await this.ctx.resume(); }

  /** Libera todo. */
  async detener() {
    for (const [, c] of this._continuos) { try { c.parar(); } catch { /* */ } }
    this._continuos.clear();
    if (this._manipulador) { this._manipulador.parar(); this._manipulador = null; }
    if (this._ambiente) { this._ambiente.parar(); }
    if (this.ctx && this.ctx.close && !this.opciones.contexto) await this.ctx.close();
    this.iniciado = false;
  }

  /** Instante actual del reloj de audio. */
  ahora() { return this._relojVirtual !== null ? this._relojVirtual : (this.ctx ? this.ctx.currentTime : 0); }

  /** Solo para render offline: fija el reloj de programacion. */
  fijarReloj(t) { this._relojVirtual = t; }

  volumen(v) { if (this.mezcla) this.mezcla.volumen(v, this.ahora()); return this; }

  // ------------------------------------------------------------------- escucha -------

  /**
   * Actualiza el oyente.
   * @param {object} o
   * @param {number[]} o.posicion [x,y,z]
   * @param {object|number[]} [o.orientacion] {frente,arriba} | {x,y,z,w} | [fx,fy,fz]
   */
  escucha(o = {}) {
    if (!this.ctx) return this;
    if (o.posicion) this.oyente.posicion = [o.posicion[0] || 0, o.posicion[1] || 0, o.posicion[2] || 0];
    const or = o.orientacion;
    if (or) {
      if (Array.isArray(or)) this.oyente.frente = [or[0] || 0, or[1] || 0, or[2] || -1];
      else if (or.frente) {
        this.oyente.frente = [or.frente[0] || 0, or.frente[1] || 0, or.frente[2] || -1];
        if (or.arriba) this.oyente.arriba = [or.arriba[0] || 0, or.arriba[1] || 1, or.arriba[2] || 0];
      } else if (typeof or.w === 'number') {
        const e = ejesDesdeCuaternion(or);
        this.oyente.frente = e.frente;
        this.oyente.arriba = e.arriba;
      }
    }
    colocarOyente(this.ctx.listener, this.oyente.posicion, this.oyente.frente, this.oyente.arriba, this.ahora());
    return this;
  }

  distanciaAlOyente(p) {
    if (!p) return 0;
    const o = this.oyente.posicion;
    const dx = (p[0] || 0) - o[0], dy = (p[1] || 0) - o[1], dz = (p[2] || 0) - o[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // -------------------------------------------------------------- escala de tiempo ----

  /**
   * Camara lenta. 1 = normal, 0.2 = cinco veces mas lento.
   * Baja el tono y alarga las colas de todo lo nuevo, reajusta las voces continuas y
   * cierra el filtro maestro (convencion cinematografica del "bullet time").
   */
  escalaTiempo(e) {
    const nueva = sujetar(Number(e) || 1, 0.05, 4);
    this.escala = nueva;
    if (!this.mezcla) return this;
    const t = this.ahora();
    // La transicion de la propia escala tambien es una rampa: cambiarla de golpe produce
    // un salto de tono audible en las voces continuas.
    rampaFrec(this.mezcla.filtroTiempo.frequency,
      t, sujetar(20000 * Math.pow(nueva, 0.85), 700, 20000), 0.25);
    rampa(this.mezcla.filtroTiempo.Q, t, nueva < 0.6 ? 1.1 : 0.5, 0.25);
    for (const [, c] of this._continuos) { if (c.reescalar) c.reescalar(); }
    if (this._manipulador) this._manipulador.reescalar();
    if (this._ambiente) this._ambiente.reescalar();
    return this;
  }

  // ---------------------------------------------------------------------- eventos -----

  /**
   * Impacto entre dos cuerpos.
   * @param {object} o
   * @param {string} o.material   material del cuerpo que golpea
   * @param {string} [o.materialB] material de la superficie golpeada
   * @param {number} o.momento    momento lineal del impacto (kg*m/s). Determina el timbre.
   * @param {number[]} [o.posicion]
   * @param {number} [o.oclusion] 0..1
   * @param {number} [o.cuando]   instante absoluto (por defecto, ya)
   */
  impacto(o = {}) {
    if (!this._listo()) return null;
    this._mantenimiento();
    return sintetizarImpacto(this, o);
  }

  /** Explosion. `potencia` ~1 es una granada; ~8 es un barril de combustible. */
  explosion(o = {}) {
    if (!this._listo()) return null;
    this._mantenimiento();
    return sintetizarExplosion(this, o);
  }

  /** Disparo. Armas: pistola, escopeta, rifle, subfusil, laser. */
  disparo(o = {}) {
    if (!this._listo()) return null;
    this._mantenimiento();
    return sintetizarDisparo(this, o);
  }

  /** Paso. `superficie` es el material del suelo; `correr` cambia ritmo y energia. */
  paso(o = {}) {
    if (!this._listo()) return null;
    this._mantenimiento();
    return sintetizarPaso(this, o);
  }

  /** Rotura de un cuerpo fragil. */
  rotura(o = {}) {
    if (!this._listo()) return null;
    this._mantenimiento();
    return sintetizarRotura(this, o);
  }

  /** Sonido de interfaz: hover, click, abrir, cerrar, error, aceptar. */
  interfaz(nombre, o = {}) {
    if (!this._listo()) return null;
    return sintetizarInterfaz(this, nombre, o);
  }

  // ------------------------------------------------------------------- continuos ------

  /**
   * Friccion continua de un objeto. Llamar cada vez que cambien los parametros.
   * Con `velocidad <= 0` o con `null` como segundo argumento, se para.
   */
  friccion(id, o) {
    if (!this._listo()) return null;
    return this._continuo('friccion', id, o, crearFriccion,
      (x) => x === null || x === undefined || (x.velocidad !== undefined && x.velocidad <= 0));
  }

  /** Fuego continuo sobre un cuerpo. `intensidad <= 0` lo apaga. */
  fuego(id, o) {
    if (!this._listo()) return null;
    return this._continuo('fuego', id, o, crearFuego,
      (x) => x === null || x === undefined || (x.intensidad !== undefined && x.intensidad <= 0));
  }

  /** Motor de combustion. `rpm <= 0` lo apaga. */
  motor(id, o) {
    if (!this._listo()) return null;
    return this._continuo('motor', id, o, crearMotor,
      (x) => x === null || x === undefined || (x.rpm !== undefined && x.rpm <= 0));
  }

  /** Zumbido del manipulador fisico. `tension: 0` lo apaga. */
  manipulador(o = {}) {
    if (!this._listo()) return null;
    const apagar = o === null || (o.tension !== undefined && o.tension <= 0);
    if (!this._manipulador) {
      if (apagar) return null;
      this._manipulador = crearManipulador(this, o);
      return this._manipulador;
    }
    this._manipulador.actualizar(o || {});
    return this._manipulador;
  }

  /** Cambia el espacio: 'exterior' | 'interior_nave' | 'interior_pequeno'. */
  ambiente(nombre, duracion = 1.5) {
    if (!this._listo()) return null;
    if (!this._ambiente) this._ambiente = crearAmbienteDiferido(this);
    this._ambiente.cambiar(nombre, duracion);
    return this._ambiente;
  }

  /** Para un continuo por id. */
  parar(id) {
    const c = this._continuos.get(id);
    if (c) { c.parar(); this._continuos.delete(id); }
    return this;
  }

  _continuo(tipo, id, o, crear, esApagar) {
    const clave = `${tipo}:${id}`;
    const actual = this._continuos.get(clave);
    if (esApagar(o)) {
      if (actual) { actual.parar(); this._continuos.delete(clave); }
      return null;
    }
    if (!actual) {
      const nuevo = crear(this, o || {});
      this._continuos.set(clave, nuevo);
      return nuevo;
    }
    actual.actualizar(o || {});
    return actual;
  }

  _listo() { return !!(this.ctx && this.mezcla); }

  _mantenimiento() {
    const t = this.ahora();
    if (t - this._ultimaPoda > 0.25) { this.mezcla.podar(t); this._ultimaPoda = t; }
  }

  /** Estadisticas de mezcla, utiles para el HUD de depuracion del juego. */
  get estadisticas() {
    return this.mezcla
      ? { ...this.mezcla.estadisticas, activas: this.mezcla.voces.length, escala: this.escala }
      : null;
  }
}

function crearAmbienteDiferido(motor) {
  // Import circular evitado: ambiente.js solo necesita `motor`, y este modulo ya existe.
  const { crearAmbiente } = ambienteMod;
  return crearAmbiente(motor);
}

import * as ambienteMod from './efectos/ambiente.js';

export { MATERIALES, parDeMateriales, ARMAS, SONIDOS_INTERFAZ };
export default MotorAudio;
