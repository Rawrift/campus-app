// Bucle principal con PASO FIJO y acumulador, y modo determinista en el que el reloj se cede
// al arnés de pruebas. Es el corazón del requisito de reproducibilidad: la simulación nunca
// avanza con dt variable, así que la misma semilla y el mismo número de pasos dan el mismo
// estado, en una GPU rápida o bajo rasterizado por software a 1 fps.

export const PASO = 1 / 60;          // segundos de simulación por paso. Invariable.
const MAX_PASOS_POR_FOTOGRAMA = 5;   // techo anti "espiral de la muerte": si el equipo no da
                                     // más de sí, el juego va a cámara lenta en vez de colgarse.

export class Bucle {
  constructor({ simular, dibujar, alMedir }) {
    this.simular = simular;   // (paso, tiempoSim) => void   avanza la lógica un paso fijo
    this.dibujar = dibujar;   // (alfa) => void              dibuja interpolando entre pasos
    this.alMedir = alMedir || (() => {});

    this.acumulador = 0;
    this.tiempoSim = 0;       // tiempo de simulación acumulado (no el del navegador)
    this.pasosTotales = 0;
    this.escalaTiempo = 1;    // cámara lenta
    this.corriendo = false;
    this.determinista = false;

    this._ultimo = 0;
    this._raf = 0;
    this._medidas = { dibujos: 0, msSim: 0, msDibujo: 0, muestras: 0 };
  }

  arrancar() {
    if (this.corriendo || this.determinista) return;
    this.corriendo = true;
    this._ultimo = performance.now();
    const paso = (ahora) => {
      this._raf = requestAnimationFrame(paso);
      // Un dt enorme (pestaña en segundo plano, GC largo) no debe disparar 400 pasos de golpe.
      const dtReal = Math.min((ahora - this._ultimo) / 1000, 0.25);
      this._ultimo = ahora;
      this.acumulador += dtReal * this.escalaTiempo;

      const t0 = performance.now();
      let n = 0;
      while (this.acumulador >= PASO && n < MAX_PASOS_POR_FOTOGRAMA) {
        this.simular(PASO, this.tiempoSim);
        this.tiempoSim += PASO; this.pasosTotales++; this.acumulador -= PASO; n++;
      }
      if (n === MAX_PASOS_POR_FOTOGRAMA) this.acumulador = 0; // descarta el retraso, no lo arrastra
      const t1 = performance.now();

      this.dibujar(this.acumulador / PASO);
      const t2 = performance.now();

      const m = this._medidas;
      m.dibujos++; m.msSim += t1 - t0; m.msDibujo += t2 - t1; m.muestras++;
    };
    this._raf = requestAnimationFrame(paso);
  }

  parar() { this.corriendo = false; cancelAnimationFrame(this._raf); this._raf = 0; }

  // --- modo determinista: el arnés manda -------------------------------------------------
  activarDeterminista() { this.parar(); this.determinista = true; this.acumulador = 0; }
  desactivarDeterminista() { this.determinista = false; this.arrancar(); }

  /** Avanza exactamente n pasos de PASO segundos. No dibuja. */
  avanzar(n = 1) {
    for (let i = 0; i < n; i++) {
      this.simular(PASO, this.tiempoSim);
      this.tiempoSim += PASO; this.pasosTotales++;
    }
  }
  /** Dibuja exactamente un fotograma del estado actual, sin interpolación. */
  renderizar() { this.dibujar(0); }

  medidas() {
    const m = this._medidas;
    const r = { msSimMedio: m.muestras ? m.msSim / m.muestras : 0,
                msDibujoMedio: m.muestras ? m.msDibujo / m.muestras : 0,
                dibujos: m.dibujos, pasosTotales: this.pasosTotales, tiempoSim: this.tiempoSim };
    return r;
  }
  reiniciarMedidas() { this._medidas = { dibujos: 0, msSim: 0, msDibujo: 0, muestras: 0 }; }
}
