// Puente entre la biblioteca de materiales procedurales y Three.js.
//
// Aquí se aplica la lección más cara del gauntlet: el albedo es COLOR (sRGB) y el resto de
// mapas son DATOS (lineal). Confundirlos hace que todo salga 8x oscuro, lo que se compensa
// subiendo las luces, lo que lava la imagen. Ese único error arruinaba la escena de pruebas.

import * as THREE from 'three';
import { crearMaterial, FISICA } from '../../../paquetes/materiales/src/index.js';

/** Material del juego -> receta de la biblioteca. Un sitio, no repartido por el código. */
export const RECETA = {
  hormigon:      'hormigon_rugoso',
  hormigonLiso:  'hormigon_liso',
  hormigonViejo: 'hormigon_desconchado',
  asfalto:       'asfalto',
  asfaltoMojado: 'asfalto_mojado',
  acero:         'acero_cepillado',
  aluminio:      'aluminio_rayado',
  metalPintado:  'metal_pintado',
  hierroOx:      'metal_oxidado',
  oxido:         'oxido_fuerte',
  chapa:         'chapa_ondulada',
  madera:        'madera_tabla',
  contrachapado: 'madera_contrachapado',
  pale:          'madera_pale',
  vidrio:        'vidrio_sucio',
  goma:          'goma',
  plastico:      'plastico',
  tierra:        'tierra',
  grava:         'grava',
  ladrillo:      'ladrillo',
  yeso:          'yeso',
  lona:          'lona',
  carton:        'carton',
  pintura:       'pintura_desgastada',
};

export class BibliotecaMateriales {
  constructor(renderizador) {
    this.renderizador = renderizador;   // instancia de Renderizador (para marcarTexturas)
    this.cache = new Map();
    this.resolucion = 1024;
  }

  fijarResolucion(px) { this.resolucion = px; }

  /**
   * Devuelve un MeshStandardMaterial listo. `repeticion` controla cuántas veces se tesela
   * por metro: sin esto una pared de 24 m estira la textura y se ve como plástico.
   */
  async obtener(clave, { repeticion = [1, 1], semilla = 1, transparente = false,
                         rugosidadExtra = 0, tinte = null } = {}) {
    const id = `${clave}|${repeticion}|${semilla}|${transparente}|${rugosidadExtra}|${tinte}`;
    if (this.cache.has(id)) return this.cache.get(id);

    const receta = RECETA[clave] || clave;
    const m = await crearMaterial(receta, { resolucion: this.resolucion, semilla });

    const tex = (bitmap, esColor) => {
      if (!bitmap) return null;
      const t = new THREE.Texture(bitmap);
      t.colorSpace = esColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeticion[0], repeticion[1]);
      t.anisotropy = this.renderizador?.ajustes?.anisotropia ?? 4;
      t.needsUpdate = true;
      return t;
    };

    const mat = new THREE.MeshStandardMaterial({
      map:          tex(m.albedo, true),
      normalMap:    tex(m.normal, false),
      roughnessMap: tex(m.rugosidad, false),
      metalnessMap: tex(m.metalico, false),
      aoMap:        tex(m.oclusion, false),
      roughness: 1, metalness: 1,           // los mapas modulan estos valores
      transparent: transparente,
      opacity: transparente ? 0.28 : 1,
      side: THREE.FrontSide,
      envMapIntensity: 1.0,
    });
    if (tinte) mat.color.set(tinte);
    if (rugosidadExtra) mat.roughness = Math.min(1, 1 + rugosidadExtra);
    if (transparente) { mat.depthWrite = false; mat.metalness = 0.0; mat.roughness = 0.08; }

    mat.userData.fisica = FISICA?.[receta] ?? null;
    this.cache.set(id, mat);
    return mat;
  }

  liberar() {
    for (const m of this.cache.values()) {
      for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap']) m[k]?.dispose();
      m.dispose();
    }
    this.cache.clear();
  }
}
