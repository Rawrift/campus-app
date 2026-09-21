// ROTURA DEL TESELADO — versión barata.
//
// Qué resuelve: un crítico independiente detectó que "el muro es una foto repetida; la misma
// placa se repite en cuadrícula y el ojo detecta el patrón en medio segundo". La textura está
// bien; lo que delata es que se repite IDÉNTICA. Se corrige modulándola con variación de
// frecuencia mucho más baja ligada a la POSICIÓN EN EL MUNDO, no a la UV.
//
// POR QUÉ ESTA VERSIÓN: la primera implementación calculaba ese ruido en el sombreador con
// fBm de 3 octavas y hash por seno. Medido: 288 sin() POR FRAGMENTO, unos 600 millones de
// senos por fotograma a 1080p, aplicados al suelo de 320x320 m y a todos los muros. En una
// GPU real el juego caía a 13 fps. Ahora el ruido se hornea UNA vez a una textura teselable y
// se muestrea de forma triplanar: 3 lecturas de textura por fragmento en vez de 288 senos.

import * as THREE from 'three';

let texturaMacro = null;

/** Ruido de valor teselable con varias octavas, horneado a una textura una sola vez. */
function crearTexturaRuido(lado = 256) {
  if (texturaMacro) return texturaMacro;
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(lado, lado);
  const d = img.data;

  // Tabla de permutación con semilla fija: la textura debe ser idéntica en cada ejecución,
  // igual que todo lo demás del juego.
  let s = 1337;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const octava = (periodo) => {
    const v = new Float32Array(periodo * periodo);
    for (let i = 0; i < v.length; i++) v[i] = rnd();
    return { periodo, v };
  };
  // Periodos divisores del lado -> el resultado tesela sin costura por construcción.
  const octavas = [octava(4), octava(8), octava(16), octava(32)];
  const pesos = [0.5, 0.26, 0.15, 0.09];
  const suave = (t) => t * t * (3 - 2 * t);

  const muestra = (o, x, y) => {
    const { periodo: p, v } = o;
    const fx = x * p, fy = y * p;
    const x0 = Math.floor(fx) % p, y0 = Math.floor(fy) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const tx = suave(fx - Math.floor(fx)), ty = suave(fy - Math.floor(fy));
    const a = v[y0 * p + x0], b = v[y0 * p + x1], cc = v[y1 * p + x0], dd = v[y1 * p + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty;
  };

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const u = x / lado, w = y / lado;
      let n = 0;
      for (let i = 0; i < octavas.length; i++) n += muestra(octavas[i], u, w) * pesos[i];
      const i4 = (y * lado + x) * 4;
      const val = Math.max(0, Math.min(255, Math.round(n * 255)));
      // R = variación fina, G = sólo las dos octavas gruesas (para la suciedad, más suave).
      const grueso = muestra(octavas[0], u, w) * 0.65 + muestra(octavas[1], u, w) * 0.35;
      d[i4] = val;
      d[i4 + 1] = Math.round(grueso * 255);
      d[i4 + 2] = val;
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  texturaMacro = new THREE.CanvasTexture(c);
  texturaMacro.wrapS = texturaMacro.wrapT = THREE.RepeatWrapping;
  texturaMacro.colorSpace = THREE.NoColorSpace;
  texturaMacro.generateMipmaps = true;
  texturaMacro.minFilter = THREE.LinearMipmapLinearFilter;
  return texturaMacro;
}

/**
 * @param escala          metros del rasgo macro (18-40 funciona bien)
 * @param fuerza          0..1, cuánto modula el color
 * @param suciedadSuelo   altura en metros sobre la que se acumula suciedad hacia abajo
 */
export function romperTeselado(material, { escala = 26, fuerza = 0.34, suciedadSuelo = 0,
                                           rugosidadExtra = 0.18 } = {}) {
  if (material.userData.macroAplicado) return material;
  material.userData.macroAplicado = true;
  const tex = crearTexturaRuido();

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMacroTex = { value: tex };
    shader.uniforms.uMacroEscala = { value: escala };
    shader.uniforms.uMacroFuerza = { value: fuerza };
    shader.uniforms.uSuciedadSuelo = { value: suciedadSuelo };
    shader.uniforms.uMacroRug = { value: rugosidadExtra };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFraguaMundo;\nvarying vec3 vFraguaNormal;')
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vFraguaMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vFraguaNormal = normalize(mat3(modelMatrix) * objectNormal);');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec3 vFraguaMundo; varying vec3 vFraguaNormal;
        uniform sampler2D uMacroTex;
        uniform float uMacroEscala, uMacroFuerza, uSuciedadSuelo, uMacroRug;
        // Muestreo triplanar: la misma textura proyectada por los tres planos del mundo y
        // mezclada por la normal. Así una pared y un suelo reciben variación coherente sin
        // depender de sus UV, que es justo lo que hace falta para romper el patrón.
        vec2 fraguaMacro(float escala) {
          vec3 p = vFraguaMundo / escala;
          vec3 n = abs(normalize(vFraguaNormal));
          n /= max(n.x + n.y + n.z, 1e-4);
          vec4 a = texture2D(uMacroTex, p.yz);
          vec4 b = texture2D(uMacroTex, p.xz);
          vec4 c = texture2D(uMacroTex, p.xy);
          vec4 m = a * n.x + b * n.y + c * n.z;
          return vec2(m.r * 2.0 - 1.0, m.g * 2.0 - 1.0);
        }`)
      // La declaración va ANTES de <map_fragment>, que es donde se asigna: en el sombreador
      // de Three ese bloque precede a <roughnessmap_fragment>, así que declararla allí la
      // dejaría usada antes de existir y el shader no compilaría.
      .replace('#include <map_fragment>', /* glsl */`
        float fraguaRugMod = 0.0;
        #include <map_fragment>
        {
          vec2 mm = fraguaMacro(uMacroEscala);
          float v = mm.x * 0.7 + mm.y * 0.3;
          diffuseColor.rgb *= (1.0 + v * uMacroFuerza);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.94, 0.97, 1.03), max(0.0, -v) * 0.6);
          if (uSuciedadSuelo > 0.0) {
            float h = clamp(vFraguaMundo.y / uSuciedadSuelo, 0.0, 1.0);
            float sucio = pow(1.0 - h, 2.2) * (0.55 + 0.45 * (mm.y * 0.5 + 0.5));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.42, 0.40, 0.37), clamp(sucio, 0.0, 0.8));
          }
          // La rugosidad se modula con la MISMA muestra, sin un segundo muestreo.
          fraguaRugMod = v * uMacroRug;
        }`)
      .replace('#include <lights_physical_fragment>',
        'roughnessFactor = clamp(roughnessFactor + fraguaRugMod, 0.04, 1.0);\n#include <lights_physical_fragment>');
  };
  material.needsUpdate = true;
  return material;
}
