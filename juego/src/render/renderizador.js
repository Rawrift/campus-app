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
import { Postproceso } from './postproceso.js';

export const CALIDADES = {
  bajo:  { escala: 0.6, sombras: 1024, luces: 3, sombrasPunto: 0, anisotropia: 1, radioSombra: 20, post: 'ninguno' },
  medio: { escala: 0.8, sombras: 2048, luces: 4, sombrasPunto: 0, anisotropia: 4, radioSombra: 24, post: 'ao' },
  alto:  { escala: 1.0, sombras: 2048, luces: 6, sombrasPunto: 1, anisotropia: 8, radioSombra: 26, post: 'completo' },
  ultra: { escala: 1.0, sombras: 4096, luces: 8, sombrasPunto: 2, anisotropia: 16, radioSombra: 30, post: 'completo' },
};

// Tope de densidad de píxeles. En una pantalla HiDPI, devicePixelRatio 2 significa CUATRO
// veces los píxeles a sombrear, y este juego está limitado por relleno, no por geometría.
// Por encima de 1.5 la ganancia visual es marginal y el coste se dispara.
const DPR_MAXIMO = 1.5;

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
    // Escalado adaptativo: se ajusta solo según el rendimiento REAL de la máquina del jugador.
    // Es la palanca más honesta que existe: baja el coste de relleno sin tocar la dirección
    // artística, y evita tener que adivinar la potencia del equipo de antemano.
    this.escalaAdaptativa = 1;
    this.adaptativo = true;
    this._historial = [];
    this._ultimoAjuste = 0;
    this.redimensionar();

    this.post = new Postproceso(this.renderizador, this.escena, this.camara, {
      nivel: this.ajustes.post, ancho: this._tam.ancho, alto: this._tam.alto,
    });
  }

  _configurarSombraSol() {
    const s = this.sol.shadow;
    s.mapSize.set(this.ajustes.sombras, this.ajustes.sombras);
    const c = s.camera;
    // Volumen CEÑIDO alrededor del jugador, no del mapa entero.
    //
    // Antes cubría +-70 m: con un mapa de 3072 eso son 4,6 cm por téxel, y a esa resolución
    // la sombra no llega al punto de contacto. Un crítico independiente lo describió como
    // "nada está posado, las cajas flotan". A +-26 m el téxel baja a 1,7 cm y el contacto
    // aparece. Lo que queda fuera del volumen no proyecta, pero a esa distancia no se nota.
    const R = this.ajustes.radioSombra;
    c.left = -R; c.right = R; c.top = R; c.bottom = -R;
    c.near = 1; c.far = 300;
    c.updateProjectionMatrix();
    // El sesgo debe ser lo menor posible que no produzca acné: un sesgo alto es exactamente
    // lo que despega la sombra del objeto y lo hace flotar.
    s.bias = -0.00035;
    s.normalBias = 0.012;
  }

  /**
   * Coloca el sol respecto al observador para que el volumen de sombra, ahora ceñido, lo siga.
   * Se ancla a una rejilla del tamaño de un téxel de sombra: si el volumen se desplaza de
   * forma continua, los bordes de sombra hierven al moverse la cámara.
   */
  orientarSol(direccion, centro) {
    const d = direccion;
    const R = this.ajustes.radioSombra;
    const texel = (R * 2) / this.ajustes.sombras;
    const cx = Math.round(centro.x / texel) * texel;
    const cz = Math.round(centro.z / texel) * texel;
    this.sol.position.set(cx + d.x * 140, d.y * 140 + 60, cz + d.z * 140);
    this.sol.target.position.set(cx, 0, cz);
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
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO) * this.ajustes.escala * this.escalaAdaptativa;
    this.renderizador.setPixelRatio(dpr);
    this.renderizador.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    this.post?.redimensionar(ancho * dpr, alto * dpr);
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
    if (this.post?.activo) this.post.dibujar();
    else this.renderizador.render(this.escena, this.camara);
  }

  /**
   * Ajusta la resolución interna buscando los 60 fps. Sube y baja con histéresis y espera
   * entre ajustes, para que no oscile ante un pico puntual.
   * @param msFotograma tiempo real del último fotograma
   */
  adaptar(msFotograma) {
    if (!this.adaptativo) return;
    const h = this._historial;
    h.push(msFotograma);
    if (h.length < 45) return;
    if (h.length > 45) h.shift();
    const ahora = performance.now();
    if (ahora - this._ultimoAjuste < 1200) return;

    const orden = h.slice().sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    const antes = this.escalaAdaptativa;

    if (mediana > 22 && this.escalaAdaptativa > 0.5) {
      this.escalaAdaptativa = Math.max(0.5, this.escalaAdaptativa - 0.12);
    } else if (mediana < 12 && this.escalaAdaptativa < 1) {
      this.escalaAdaptativa = Math.min(1, this.escalaAdaptativa + 0.08);
    }
    if (this.escalaAdaptativa !== antes) {
      this._ultimoAjuste = ahora;
      this._tam = { ancho: 0, alto: 0 };
      this.redimensionar();
      h.length = 0;
    }
  }

  estadisticas() {
    const i = this.renderizador.info;
    return {
      drawCalls: i.render.calls, triangulos: i.render.triangles,
      programas: i.programs?.length ?? 0, texturas: i.memory.textures,
      geometrias: i.memory.geometries, escalaAdaptativa: this.escalaAdaptativa,
      ...this.presupuestoLuces.estadisticas(),
    };
  }
}
