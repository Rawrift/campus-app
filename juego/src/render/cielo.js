// Cielo procedural y entorno para iluminación indirecta.
//
// Lección aprendida en el gauntlet: los metales parecían plástico blanco, y la causa real no
// era el material sino el ENTORNO. Un degradado liso no da nada que reflejar. Un metal sólo
// parece metal cuando refleja algo con estructura: horizonte, suelo oscuro, siluetas.

import * as THREE from 'three';

// La caja de cielo VIAJA CON LA CÁMARA. Antes era una caja de 2x2x2 fija en el origen: en
// cuanto la cámara se alejaba quedaba fuera de ella y, al dibujarse por la cara interior,
// desaparecía. Resultado: cielo negro en todo el mapa salvo en el centro.
// Como la caja se mueve pero NO rota, la posición local de cada vértice es ya la dirección
// de visión en coordenadas del mundo, que es lo que necesita el shader.
const VERTEX = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // z/w = 1: siempre al fondo
}`;

const FRAGMENT = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSol;          // dirección al sol
uniform vec3 uColorSol;
uniform vec3 uCenit;
uniform vec3 uHorizonte;
uniform vec3 uSuelo;
uniform float uTurbidez;

// Aproximación barata de dispersión: suficiente para un atardecer creíble y muy barata.
vec3 cielo(vec3 d) {
  float h = d.y;
  // Por debajo del horizonte: suelo oscuro. Es lo que da a los metales algo que reflejar
  // y lo que impide que un material brillante quede lavado por arriba y por abajo.
  if (h < 0.0) {
    float k = clamp(-h * 3.0, 0.0, 1.0);
    return mix(uHorizonte * 0.45, uSuelo, k);
  }
  float t = pow(1.0 - h, 3.0 + uTurbidez);
  vec3 base = mix(uCenit, uHorizonte, clamp(t, 0.0, 1.0));

  float cosSol = max(dot(d, uSol), 0.0);
  // Halo alrededor del sol (Mie) y disco solar.
  float mie = pow(cosSol, 14.0) * 0.55 + pow(cosSol, 4.0) * 0.12;
  float disco = smoothstep(0.9993, 0.9997, cosSol);
  base += uColorSol * mie;
  base += uColorSol * disco * 14.0;
  return base;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 c = cielo(d);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Cielo {
  constructor(renderizador, escena) {
    this.renderizador = renderizador;
    this.escena = escena;
    this.uniformes = {
      uSol:       { value: new THREE.Vector3(0.38, 0.22, -0.9).normalize() },
      uColorSol:  { value: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(2.2) },
      uCenit:     { value: new THREE.Color(0.10, 0.19, 0.36) },
      uHorizonte: { value: new THREE.Color(0.62, 0.48, 0.40) },
      uSuelo:     { value: new THREE.Color(0.045, 0.040, 0.038) },
      uTurbidez:  { value: 1.6 },
    };
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: this.uniformes,
      side: THREE.BackSide, depthWrite: false, depthTest: true, toneMapped: false,
    });
    this.malla = new THREE.Mesh(geo, mat);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = -1000;
    // Se recoloca sobre la cámara justo antes de dibujar, para que ésta esté siempre dentro.
    this.malla.onBeforeRender = (_r, _e, camara) => { this.malla.position.copy(camara.position); };
    escena.add(this.malla);

    this.pmrem = new THREE.PMREMGenerator(renderizador);
    this.pmrem.compileEquirectangularShader();
    this.objetivoEntorno = null;
  }

  /** Dirección del sol en coordenadas del mundo (hacia donde está el sol). */
  get direccionSol() { return this.uniformes.uSol.value; }

  /**
   * Hornea el cielo a un mapa de entorno para iluminación indirecta y reflejos.
   * Se hace una vez al cargar, y sólo se rehace si cambia la hora del día: es caro.
   */
  hornear() {
    const escenaCielo = new THREE.Scene();
    const copia = this.malla.clone();
    copia.onBeforeRender = () => {};
    copia.position.set(0, 0, 0);
    copia.material = this.malla.material.clone();
    copia.material.uniforms = this.uniformes;   // comparte uniformes, no los duplica
    copia.material.side = THREE.BackSide;
    escenaCielo.add(copia);
    if (this.objetivoEntorno) this.objetivoEntorno.dispose();
    this.objetivoEntorno = this.pmrem.fromScene(escenaCielo, 0.04);
    this.escena.environment = this.objetivoEntorno.texture;
    escenaCielo.remove(copia);
    copia.geometry.dispose(); copia.material.dispose();
    return this.objetivoEntorno.texture;
  }

  /**
   * Hora del día 0..24. Recoloca el sol y recalcula la paleta. Rehornea el entorno.
   *
   * CUIDADO con la hora que se elige: por debajo de cierta altura el sol deja de producir
   * sombras útiles y la escena queda iluminada solo por el relleno, que es plano y no ocluye
   * nada. Ocurrió: el juego estaba puesto a las 18:24 con amanecer a las 6 y ocaso a las 18,
   * o sea con el sol BAJO EL HORIZONTE, y un crítico lo detectó como "la luz no está ocluida,
   * las cajas no proyectan sombra". No era un problema de sesgo de sombra: no había sol.
   * `alturaSolar` queda expuesta para que el juego pueda comprobarlo.
   */
  fijarHora(hora) {
    const t = ((hora - 6) / 12) * Math.PI;      // 6h amanece, 18h anochece
    const alt = Math.sin(t), az = Math.cos(t);
    this.alturaSolar = alt;
    this.hora = hora;
    this.uniformes.uSol.value.set(az * 0.85, Math.max(-0.2, alt), -0.5).normalize();

    // Al ras del horizonte el sol enrojece y pierde fuerza: es lo que da el atardecer.
    const bajo = 1 - Math.min(1, Math.max(0, alt) * 2.2);
    this.uniformes.uColorSol.value
      .setRGB(1.0, 0.78 - bajo * 0.30, 0.58 - bajo * 0.40)
      .multiplyScalar(2.6 * Math.max(0.05, Math.min(1, alt * 1.6 + 0.25)));
    this.uniformes.uCenit.value.setRGB(0.09 + alt * 0.08, 0.17 + alt * 0.12, 0.34 + alt * 0.14);
    this.uniformes.uHorizonte.value.setRGB(0.55 + bajo * 0.25, 0.44 + bajo * 0.05, 0.40 - bajo * 0.12);
    this.hornear();
  }

  liberar() {
    this.malla.geometry.dispose(); this.malla.material.dispose();
    this.objetivoEntorno?.dispose(); this.pmrem.dispose();
  }
}
