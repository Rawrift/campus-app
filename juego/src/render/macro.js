// ROTURA DEL TESELADO.
//
// Diagnóstico de un crítico independiente mirando el interior: "el muro es una foto repetida,
// no arquitectura. La misma placa se repite en cuadrícula, las mismas manchas oscuras, las
// mismas piedras en la misma posición. El ojo detecta el patrón en medio segundo."
//
// La textura en sí está bien; lo que delata es que se repite IDÉNTICA. La solución estándar
// en producción no es una textura más grande, sino modular lo repetido con variación de
// frecuencia mucho más baja, ligada a la POSICIÓN EN EL MUNDO y no a la UV. Así dos teselas
// contiguas ya no son iguales aunque compartan textura.
//
// Se añade además oscurecimiento progresivo hacia el suelo, que es donde se acumula la
// suciedad en cualquier nave real, y que el crítico también echaba en falta.

const RUIDO_GLSL = /* glsl */`
  vec3 fraguaHash3(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123)*2.0-1.0;
  }
  float fraguaRuido(vec3 p){
    vec3 i = floor(p), f = fract(p);
    vec3 u = f*f*(3.0-2.0*f);
    return mix(mix(mix(dot(fraguaHash3(i+vec3(0,0,0)),f-vec3(0,0,0)),
                       dot(fraguaHash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                   mix(dot(fraguaHash3(i+vec3(0,1,0)),f-vec3(0,1,0)),
                       dot(fraguaHash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
               mix(mix(dot(fraguaHash3(i+vec3(0,0,1)),f-vec3(0,0,1)),
                       dot(fraguaHash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                   mix(dot(fraguaHash3(i+vec3(0,1,1)),f-vec3(0,1,1)),
                       dot(fraguaHash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
  }
  float fraguaFbm(vec3 p){
    return fraguaRuido(p)*0.55 + fraguaRuido(p*2.13)*0.28 + fraguaRuido(p*4.31)*0.17;
  }
`;

/**
 * @param material   MeshStandardMaterial a parchear (se modifica in situ)
 * @param escala     metros del rasgo macro. 18-40 m funciona bien: por debajo compite con la
 *                   propia textura, por encima no rompe nada.
 * @param fuerza     0..1, cuánto modula el color
 * @param suciedadSuelo  altura en metros sobre la que se acumula suciedad hacia abajo (0 = no)
 */
export function romperTeselado(material, { escala = 26, fuerza = 0.34, suciedadSuelo = 0,
                                           rugosidadExtra = 0.18 } = {}) {
  if (material.userData.macroAplicado) return material;
  material.userData.macroAplicado = true;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMacroEscala = { value: escala };
    shader.uniforms.uMacroFuerza = { value: fuerza };
    shader.uniforms.uSuciedadSuelo = { value: suciedadSuelo };
    shader.uniforms.uMacroRug = { value: rugosidadExtra };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFraguaMundo;')
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vFraguaMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vFraguaMundo;\nuniform float uMacroEscala;\nuniform float uMacroFuerza;\nuniform float uSuciedadSuelo;\nuniform float uMacroRug;\n' + RUIDO_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        {
          // Variación macro ligada a la posición en el mundo: dos teselas contiguas dejan de
          // ser idénticas aunque compartan textura.
          float m  = fraguaFbm(vFraguaMundo / uMacroEscala);
          float m2 = fraguaFbm(vFraguaMundo / (uMacroEscala * 0.31) + 17.0);
          float v  = m * 0.7 + m2 * 0.3;
          diffuseColor.rgb *= (1.0 + v * uMacroFuerza);
          // Tinte ligeramente más frío en las zonas oscurecidas: la suciedad no es sólo gris.
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.94, 0.97, 1.03), max(0.0, -v) * 0.6);

          if (uSuciedadSuelo > 0.0) {
            float h = clamp(vFraguaMundo.y / uSuciedadSuelo, 0.0, 1.0);
            float sucio = pow(1.0 - h, 2.2) * (0.55 + 0.45 * fraguaFbm(vFraguaMundo * 0.7));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.42, 0.40, 0.37), clamp(sucio, 0.0, 0.8));
          }
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + fraguaFbm(vFraguaMundo / (uMacroEscala*0.5)) * uMacroRug, 0.04, 1.0);
      `);
  };
  material.needsUpdate = true;
  return material;
}
