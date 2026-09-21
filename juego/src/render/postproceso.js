// Postprocesado. Contiene la OCLUSIÓN AMBIENTAL, que dos críticos independientes señalaron
// como el delta dominante del interior:
//
//   "la luz no está ocluida. La zona bajo el altillo, que debería ser la más oscura de la
//    nave, brilla casi igual que el suelo abierto; las esquinas pared-suelo no se oscurecen;
//    ninguna pila de cajas tiene contacto oscuro en su base, parecen calcomanías apoyadas."
//
// Es un diagnóstico correcto y la causa no eran las sombras: el tejado es opaco, así que el
// interior no recibe sol y queda bañado por luz ambiental uniforme. Sin AO, esa ambiental
// llega igual al rincón que al centro de la nave, y nada parece posado. La solución correcta
// es oclusión ambiental, no más sombras.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Gradación final: curva S suave, viñeta y grano. Un solo pase, barato. */
const GradacionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVinneta: { value: 0.34 },
    uContraste: { value: 1.06 },
    uGrano: { value: 0.016 },
    uTiempo: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVinneta, uContraste, uGrano, uTiempo;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // Curva S alrededor del gris medio: da densidad a los negros sin aplastar las luces.
      c.rgb = clamp((c.rgb - 0.5) * uContraste + 0.5, 0.0, 1.0);
      // Viñeta suave: centra la mirada y quita la sensación de render plano.
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVinneta * dot(d, d) * 1.7;
      // Grano tenue: rompe el banding de los degradados del cielo.
      float n = fract(sin(dot(vUv * vec2(1.0 + uTiempo * 0.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * uGrano;
      gl_FragColor = c;
    }`,
};

export class Postproceso {
  /**
   * @param nivel 'ninguno' | 'ao' | 'completo'
   */
  constructor(renderizador, escena, camara, { nivel = 'completo', ancho = 1280, alto = 720 } = {}) {
    this.r = renderizador; this.escena = escena; this.camara = camara;
    this.nivel = nivel;
    this.activo = nivel !== 'ninguno';
    if (!this.activo) return;

    this.composer = new EffectComposer(renderizador);
    this.composer.addPass(new RenderPass(escena, camara));

    this.gtao = new GTAOPass(escena, camara, ancho, alto);
    // Radio en metros: el contacto que interesa es el de una caja con el suelo y el de una
    // esquina de nave, no la oclusión de todo el edificio.
    this.gtao.output = GTAOPass.OUTPUT.Default;
    // 8 muestras en vez de 12: la diferencia perceptual es mínima y el pase de AO es uno de
    // los más caros del fotograma.
    this.gtao.updateGtaoMaterial({
      radius: 0.85, distanceExponent: 1.4, thickness: 1.0,
      scale: 1.3, samples: 8, screenSpaceRadius: false,
    });
    this.gtao.blendIntensity = 1.0;
    this.composer.addPass(this.gtao);

    if (nivel === 'completo') {
      this.gradacion = new ShaderPass(GradacionShader);
      this.composer.addPass(this.gradacion);
    }
    this.composer.addPass(new OutputPass());
    this.redimensionar(ancho, alto);
  }

  redimensionar(ancho, alto) {
    if (!this.activo) return;
    this.composer.setSize(ancho, alto);
    this.gtao?.setSize(ancho, alto);
  }

  fijarNivel(nivel) { this.nivel = nivel; this.activo = nivel !== 'ninguno'; }

  dibujar() {
    if (!this.activo) { this.r.render(this.escena, this.camara); return; }
    this.composer.render();
  }
}
