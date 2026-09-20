// Renderizador. Concentra las decisiones que en el gauntlet decidieron si la imagen parecía
// un juego o una demo:
//
//  1. ESPACIO DE COLOR. El fallo que arruinaba la escena de pruebas era escribir reflectancias
//     lineales en texturas marcadas como sRGB: todo salía 8x oscuro y se compensaba con luces
//     brutales, lo que lavaba la imagen. Aquí se declara explícitamente qué textura es color
//     (sRGB) y cuál es dato (lineal). Ver `marcarTexturas`.
//  2. EXPOSICIÓN. ACES con exposición calibrada, no "a ojo".
//  3. NIEBLA CONTENIDA. Debe dar profundidad, no borrar la escena.

import * as THREE from 'three';
import { PresupuestoLuces } from './luces.js';

export const CALIDADES = {
  bajo:  { escala: 0.6, sombras: 1024, luces: 3, sombrasPunto: 0, anisotropia: 1, niebla: 1.0 },
  medio: { escala: 0.8, sombras: 2048, luces: 5, sombrasPunto: 1, anisotropia: 4, niebla: 1.0 },
  alto:  { escala: 1.0, sombras: 3072, luces: 6, sombrasPunto: 1, anisotropia: 8, niebla: 1.0 },
  ultra: { escala: 1.0, sombras: 4096, luces: 8, sombrasPunto: 2, anisotropia: 16, niebla: 1.0 },
};

export class Renderizador {
  constructor(lienzo, { calidad = 'alto' } = {}) {
    this.lienzo = lienzo;
    this.ajustes = { ...CALIDADES[calidad] };
    this.nombreCalidad = calidad;

    this.renderizador = new THREE.WebGLRenderer({
      canvas: lienzo, antialias: true, powerPreference: 'high-performance',
      stencil: false, alpha: false,
    });
    // Salida en sRGB: sin esto la imagen sale apagada y se compensa subiendo luces, que es
    // exactamente como se destroza una escena.
    this.renderizador.outputColorSpace = THREE.SRGBColorSpace;
    this.renderizador.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderizador.toneMappingExposure = 0.85;
    this.renderizador.shadowMap.enabled = true;
    this.renderizador.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft fue eliminado en r186
    this.renderizador.info.autoReset = false;

    this.escena = new THREE.Scene();

    this.camara = new THREE.PerspectiveCamera(75, 1, 0.1, 600);
    this.camara.position.set(0, 1.7, 0);

    // Niebla exponencial CONTENIDA. 0.0035 deja ver los 300 m del mapa con bruma creíble;
    // en el gauntlet, 0.0062 se comía el 80% del encuadre.
    this.escena.fog = new THREE.FogExp2(new THREE.Color(0.55, 0.46, 0.42), 0.0035);

    this.sol = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sol.castShadow = true;
    this._configurarSombraSol();
    this.escena.add(this.sol);
    this.escena.add(this.sol.target);

    // Relleno hemisférico tenue: evita que las sombras queden en negro absoluto sin necesidad
    // de subir la ambiental global, que aplanaría todo.
    this.relleno = new THREE.HemisphereLight(0x9ab4d8, 0x3a3128, 0.35);
    this.escena.add(this.relleno);

    this.presupuestoLuces = new PresupuestoLuces(this.escena, {
      max: this.ajustes.luces, sombrasMax: this.ajustes.sombrasPunto,
    });

    this._tam = { ancho: 0, alto: 0 };
    this.redimensionar();
  }

  _configurarSombraSol() {
    const s = this.sol.shadow;
    s.mapSize.set(this.ajustes.sombras, this.ajustes.sombras);
    const c = s.camera;
    // Volumen de sombra ajustado a la zona jugable: cuanto más ceñido, más resolución útil.
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70;
    c.near = 1; c.far = 260;
    c.updateProjectionMatrix();
    s.bias = -0.0012;
    s.normalBias = 0.035;
  }

  /** Coloca el sol respecto al jugador para que el volumen de sombra lo siga. */
  orientarSol(direccion, centro) {
    const d = direccion;
    this.sol.position.set(centro.x + d.x * 120, centro.y + d.y * 120 + 40, centro.z + d.z * 120);
    this.sol.target.position.set(centro.x, centro.y, centro.z);
    this.sol.target.updateMatrixWorld();
  }

  /**
   * Declara explícitamente el espacio de color de cada mapa. Es la línea que separa una
   * imagen correcta de una imagen mal expuesta: albedo y emisivo son COLOR (sRGB); normal,
   * rugosidad, metálico, oclusión y altura son DATOS (lineal). Confundirlos es el error que
   * arruinó la escena del gauntlet.
   */
  marcarTexturas(mapas) {
    const color = ['map', 'emissiveMap'];
    const dato = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'displacementMap', 'bumpMap'];
    for (const k of color) if (mapas[k]) { mapas[k].colorSpace = THREE.SRGBColorSpace; }
    for (const k of dato)  if (mapas[k]) { mapas[k].colorSpace = THREE.NoColorSpace; }
    for (const k of [...color, ...dato]) {
      const t = mapas[k]; if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.ajustes.anisotropia;
      t.needsUpdate = true;
    }
    return mapas;
  }

  redimensionar() {
    const ancho = this.lienzo.clientWidth || window.innerWidth;
    const alto = this.lienzo.clientHeight || window.innerHeight;
    if (ancho === this._tam.ancho && alto === this._tam.alto) return;
    this._tam = { ancho, alto };
    // El escalado de resolución es la palanca de rendimiento más honesta: baja el coste de
    // relleno sin tocar la dirección artística.
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.ajustes.escala;
    this.renderizador.setPixelRatio(dpr);
    this.renderizador.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  fijarCalidad(nombre) {
    if (!CALIDADES[nombre]) return false;
    this.nombreCalidad = nombre;
    this.ajustes = { ...CALIDADES[nombre] };
    this._configurarSombraSol();
    this._tam = { ancho: 0, alto: 0 };
    this.redimensionar();
    return true;
  }

  dibujar() {
    this.presupuestoLuces.resolver(this.camara.position);
    this.renderizador.info.reset();
    this.renderizador.render(this.escena, this.camara);
  }

  estadisticas() {
    const i = this.renderizador.info;
    return {
      drawCalls: i.render.calls, triangulos: i.render.triangles,
      programas: i.programs?.length ?? 0, texturas: i.memory.textures,
      geometrias: i.memory.geometries, ...this.presupuestoLuces.estadisticas(),
    };
  }
}
