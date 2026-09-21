// Densidad de textura constante en espacio de mundo.
//
// El problema que resuelve: una BoxGeometry da UV de 0..1 en cada cara, sea la cara de 0,4 m
// o de 26 m. Si se usa el mismo material en las dos, la textura sale 65 veces más estirada en
// una que en otra. En la nave eso convertía el hormigón en manchas de camuflaje: la variación
// de baja frecuencia de la receta, pensada para teselas de 1-2 m, se estiraba a 4,3 m.
//
// La solución correcta NO es ajustar `texture.repeat` por superficie (obligaría a duplicar
// texturas por cada tamaño distinto), sino reescribir los UV de la geometría según sus
// dimensiones reales. Así una sola textura sirve a todo el mapa con densidad uniforme.

/**
 * Reescribe los UV de una BoxGeometry para que la textura tenga la misma densidad en todas
 * las caras, expresada en metros por tesela.
 *
 * Orden de las caras en BoxGeometry: +X, -X, +Y, -Y, +Z, -Z (4 vértices cada una).
 * Cada cara se mapea con las dos dimensiones que realmente la definen.
 */
export function uvMundo(geo, metrosPorTesela = 2) {
  const p = geo.parameters;
  if (!p || p.width === undefined) return geo;   // no es una caja: se deja como está
  const { width: w, height: h, depth: d } = p;
  const k = 1 / metrosPorTesela;
  const uv = geo.attributes.uv;
  // Dimensiones (u, v) de cada una de las 6 caras, en el mismo orden que las genera Three.
  const caras = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let cara = 0; cara < 6; cara++) {
    const [su, sv] = caras[cara];
    for (let i = 0; i < 4; i++) {
      const idx = cara * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su * k, uv.getY(idx) * sv * k);
    }
  }
  uv.needsUpdate = true;
  // El mapa de oclusión usa el segundo juego de UV: debe acompañar al primero o la oclusión
  // aparece aplicada a una escala distinta que el resto, que es un artefacto muy visible.
  geo.setAttribute('uv2', uv.clone());
  return geo;
}

/** Igual para planos, que sólo tienen una cara. */
export function uvPlano(geo, metrosPorTesela = 2) {
  const p = geo.parameters;
  if (!p || p.width === undefined) return geo;
  const k = 1 / metrosPorTesela;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * p.width * k, uv.getY(i) * p.height * k);
  }
  uv.needsUpdate = true;
  geo.setAttribute('uv2', uv.clone());
  return geo;
}
