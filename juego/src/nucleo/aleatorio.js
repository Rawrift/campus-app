// PRNG determinista con semilla. Requisito duro del proyecto: ningún sistema puede usar
// Math.random() directamente, porque entonces dos ejecuciones con la misma semilla divergen
// y el juicio A/B deja de poder distinguir el efecto de un cambio del efecto del azar.

/** Mezclador de semilla (splitmix32): reparte bien incluso con semillas pequeñas y consecutivas. */
function mezclar(a) {
  return function () {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

export class Azar {
  constructor(semilla = 1) { this.semilla = semilla >>> 0; this._f = mezclar(this.semilla); }

  /** Reinicia la secuencia. Misma semilla -> misma secuencia, siempre. */
  reiniciar(semilla = this.semilla) { this.semilla = semilla >>> 0; this._f = mezclar(this.semilla); }

  /** [0,1) */
  real() { return this._f(); }
  /** [min,max) */
  entre(min, max) { return min + this._f() * (max - min); }
  /** entero en [min,max] */
  entero(min, max) { return Math.floor(min + this._f() * (max - min + 1)); }
  /** -d..+d */
  simetrico(d = 1) { return (this._f() * 2 - 1) * d; }
  /** true con probabilidad p */
  suerte(p = 0.5) { return this._f() < p; }
  /** elige un elemento */
  elegir(lista) { return lista[Math.floor(this._f() * lista.length)]; }
  /** baraja in situ (Fisher-Yates) */
  barajar(lista) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(this._f() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }
  /** vector unitario uniforme sobre la esfera (no sesgado hacia los polos) */
  direccion() {
    const z = this._f() * 2 - 1;
    const a = this._f() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  }
  /** deriva un generador hijo independiente pero reproducible */
  derivar(etiqueta = 0) { return new Azar((this.semilla ^ Math.imul(etiqueta + 1, 0x9e3779b9)) >>> 0); }
}

/** Generador global del juego. Los subsistemas derivan el suyo para no interferirse entre sí. */
export const azar = new Azar(1);
