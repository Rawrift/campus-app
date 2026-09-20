// window.__JUEGO — contrato de automatización (ver API_AUTOMATIZACION.md).
// No es un "modo demo": el juego se comporta igual con o sin estos ganchos.
export function instalarApi(juego) {
  const { bucle, fisica, jugador, manipulador, render, hud, azar } = juego;
  const errores = [];
  const seguro = (fn) => (...a) => { try { return fn(...a); } catch (e) { errores.push(String(e)); return null; } };

  const api = {
    listo: juego.listo,
    version: '0.1.0',

    entrada: seguro((mapa) => { Object.assign(jugador.entrada, mapa); }),
    mirarRelativo: seguro((dx, dy) => jugador.mirar(dx, dy)),
    mirarA: seguro((x, y, z) => {
      const o = jugador.posicionOjos();
      const dx = x - o[0], dy = y - o[1], dz = z - o[2];
      jugador.guiñada = Math.atan2(-dx, -dz);
      jugador.cabeceo = Math.atan2(dy, Math.hypot(dx, dz));
    }),
    teletransportar: seguro((pos, yaw, pitch) => jugador.teletransportar(pos, yaw ?? null, pitch ?? null)),
    noclip: seguro((on) => jugador.fijarNoclip(!!on)),

    camaraLibre: seguro((on) => { juego.camaraLibre = !!on; jugador.controlaCamara = !on; }),
    fijarCamara: seguro((pos, mira, fov) => {
      juego.camaraLibre = true;
      jugador.controlaCamara = false;
      const c = render.camara;
      c.position.set(pos[0], pos[1], pos[2]);
      c.lookAt(mira[0], mira[1], mira[2]);
      if (fov) { c.fov = fov; c.updateProjectionMatrix(); }
    }),

    generar: seguro((idProp, pos) => juego.generar(idProp, pos)),
    explotar: seguro((pos, potencia, radio) => fisica.explotar(pos, potencia ?? 9000, radio ?? 12).length),
    eliminar: seguro((id) => fisica.eliminar(id)),
    limpiarEscena: seguro(() => fisica.limpiar({ conservarProtegidos: true })),
    escalaTiempo: seguro((x) => { bucle.escalaTiempo = Math.max(0.02, Math.min(3, x)); }),
    hud: seguro((v) => hud.mostrar(!!v)),

    escenario: seguro((nombre) => juego.escenario(nombre)),
    semilla: seguro((n) => azar.reiniciar(n)),

    determinista: {
      activar: seguro((semilla) => { azar.reiniciar(semilla ?? 1); bucle.activarDeterminista(); }),
      avanzar: seguro((n) => bucle.avanzar(n ?? 1)),
      renderizar: seguro(() => bucle.renderizar()),
      desactivar: seguro(() => bucle.desactivarDeterminista()),
    },

    resetStats: seguro(() => { bucle.reiniciarMedidas(); juego.medidor.reset(); }),
    stats: seguro(() => {
      const f = fisica.estadisticas(), r = render.estadisticas(), b = bucle.medidas(), m = juego.medidor.leer();
      return {
        fps: m.fps, frameMs: m.frameMs, p95FrameMs: m.p95,
        drawCalls: r.drawCalls, triangles: r.triangulos, programas: r.programas,
        entidades: f.cuerpos, cuerpos: f.cuerpos, cuerposActivos: f.cuerposActivos,
        restricciones: f.restricciones, particulas: 0,
        lucesConcedidas: r.concedidas, lucesDenegadas: r.denegadas,
        jsHeapMB: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0,
        tiempoFisicaMs: b.msSimMedio, tiempoRenderMs: b.msDibujoMedio,
        pasos: b.pasosTotales, fugados: fisica.fugados || 0,
      };
    }),
    registroErrores: () => errores.slice(),
  };
  window.__JUEGO = api;
  return api;
}

/** Medidor de fotogramas realmente presentados, independiente del bucle. */
export class Medidor {
  constructor() { this.reset(); this._ultimo = 0; }
  reset() { this.dts = []; this._ultimo = 0; }
  marcar(t) { if (this._ultimo) this.dts.push(t - this._ultimo); this._ultimo = t; if (this.dts.length > 600) this.dts.shift(); }
  leer() {
    if (!this.dts.length) return { fps: 0, frameMs: 0, p95: 0 };
    const s = this.dts.reduce((a, b) => a + b, 0), o = this.dts.slice().sort((a, b) => a - b);
    return { fps: 1000 / (s / this.dts.length), frameMs: s / this.dts.length, p95: o[Math.floor(o.length * 0.95)] };
  }
}
