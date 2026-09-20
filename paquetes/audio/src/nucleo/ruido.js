// Generadores de buffers de ruido. Se crean UNA vez por contexto y se reutilizan como
// fuentes en bucle: crear un AudioBuffer nuevo por cada impacto seria inasumible con 300
// eventos simultaneos.

import { crearPrng, sujetar } from './util.js';

/**
 * Banco de buffers compartidos. `ctx` es un AudioContext u OfflineAudioContext.
 */
export class BancoRuido {
  constructor(ctx, semilla = 20260920) {
    this.ctx = ctx;
    this.prng = crearPrng(semilla);
    this.blanco = this._blanco(2.0);
    this.rosa = this._rosa(2.0);
    this.marron = this._marron(3.0);
    this.crepitar = this._crepitar(4.0);
    this.grano = this._grano(2.0);
    this.lento = this._lento(8.0);
  }

  _buffer(segundos, canales = 1) {
    const sr = this.ctx.sampleRate;
    return this.ctx.createBuffer(canales, Math.max(1, Math.floor(sr * segundos)), sr);
  }

  /** Ruido blanco estereo decorrelacionado. */
  _blanco(seg) {
    const b = this._buffer(seg, 2);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = this.prng() * 2 - 1;
    }
    return b;
  }

  /** Ruido rosa (-3 dB/octava) por el filtro de Paul Kellet. */
  _rosa(seg) {
    const b = this._buffer(seg, 2);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = this.prng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      normalizar(d, 0.9);
    }
    return b;
  }

  /** Ruido marron (-6 dB/octava): la base de explosiones, viento y fuego. */
  _marron(seg) {
    const b = this._buffer(seg, 2);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let ultimo = 0;
      for (let i = 0; i < d.length; i++) {
        const w = this.prng() * 2 - 1;
        ultimo = (ultimo + 0.02 * w) / 1.02;
        d[i] = ultimo;
      }
      normalizar(d, 0.9);
    }
    return b;
  }

  /**
   * Buffer de crepitar: impulsos dispersos con caida exponencial muy corta. Reproducirlo
   * en bucle con playbackRate variable da un fuego creible sin programar cada chasquido.
   */
  _crepitar(seg) {
    const b = this._buffer(seg, 2);
    const sr = this.ctx.sampleRate;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const n = d.length;
      const chasquidos = Math.floor(seg * 90);
      for (let k = 0; k < chasquidos; k++) {
        const inicio = Math.floor(this.prng() * n);
        const dur = Math.floor(sr * (0.0008 + this.prng() * 0.006));
        const amp = Math.pow(this.prng(), 2.2) * 0.95 + 0.05;
        const frec = 900 + this.prng() * 4200;
        for (let i = 0; i < dur && inicio + i < n; i++) {
          const t = i / sr;
          const env = Math.exp(-t * (1 / (dur / sr)) * 5);
          d[inicio + i] += amp * env * Math.sin(2 * Math.PI * frec * t) * (this.prng() * 0.6 + 0.4);
        }
      }
      normalizar(d, 0.85);
    }
    return b;
  }

  /**
   * Ruido granular: ruido blanco modulado por una envolvente irregular de grano medio.
   * Es la textura base de la friccion (stick-slip).
   */
  _grano(seg) {
    const b = this._buffer(seg, 2);
    const sr = this.ctx.sampleRate;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let env = 0, objetivo = 0, cuenta = 0;
      for (let i = 0; i < d.length; i++) {
        if (cuenta-- <= 0) {
          objetivo = Math.pow(this.prng(), 1.8);
          cuenta = Math.floor(sr * (0.0015 + this.prng() * 0.012));
        }
        env += (objetivo - env) * 0.004;
        d[i] = (this.prng() * 2 - 1) * (0.25 + env * 0.95);
      }
      normalizar(d, 0.9);
    }
    return b;
  }

  /**
   * Ruido muy lento (paso bajo severo) para usar como LFO aleatorio: rafagas de viento,
   * deriva del motor, respiracion del fuego. Se conecta a un AudioParam via GainNode.
   */
  _lento(seg) {
    const b = this._buffer(seg, 1);
    const d = b.getChannelData(0);
    let a = 0, c = 0;
    for (let i = 0; i < d.length; i++) {
      const w = this.prng() * 2 - 1;
      a += (w - a) * 0.00035;
      c += (a - c) * 0.00035;
      d[i] = c;
    }
    normalizar(d, 1.0);
    return b;
  }

  /** Fuente en bucle lista para conectar. Siempre con offset aleatorio para no repetirse. */
  fuente(tipo = 'blanco', velocidad = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this[tipo] || this.blanco;
    s.loop = true;
    s.playbackRate.value = sujetar(velocidad, 0.02, 12);
    s.loopStart = 0;
    s.loopEnd = s.buffer.duration;
    return s;
  }

  /** Desplazamiento aleatorio dentro del buffer, para que dos voces no suenen iguales. */
  desfase(buffer) { return this.prng() * (buffer ? buffer.duration : 1); }

  azar() { return this.prng(); }
  entre(a, b) { return a + this.prng() * (b - a); }
}

function normalizar(d, objetivo) {
  let max = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > max) max = v; }
  if (max < 1e-9) return;
  const g = objetivo / max;
  for (let i = 0; i < d.length; i++) d[i] *= g;
}
