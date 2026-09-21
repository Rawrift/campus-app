// CONSOLIDACIÓN DE GEOMETRÍA ESTÁTICA.
//
// El mundo se construye con cientos de mallas sueltas (tramos de valla, vigas, nervios de
// contenedor, escombros, tuberías...). Medido con el juego en marcha: **1.980 draw calls para
// 36.000 triángulos**, o sea 18 triángulos por llamada, y cada malla se vuelve a dibujar en el
// pase de sombra. A 60 fps eso son 119.000 llamadas por segundo, muy por encima de lo que un
// navegador sostiene: el jugador informó de 13 fps en Chrome sobre una GPU real.
//
// Aquí se fusionan todas las mallas estáticas que comparten material en una sola malla por
// material y por REGIÓN del mapa. Se conserva la partición espacial a propósito: una única
// malla gigante ahorra llamadas pero anula el descarte por frustum, así que dejar de dibujar
// media ciudad sale más caro que las pocas llamadas extra.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const LADO_REGION = 90;   // metros

/**
 * Normaliza los atributos para que mergeGeometries no falle. Dos trampas conocidas:
 * geometría indexada mezclada con no indexada, y juegos de atributos distintos (nuestras
 * cajas llevan uv2 por el mapa de oclusión, los cilindros creados a pelo no).
 */
function normalizar(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'uv2'].includes(k)) g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv.clone());
  g.morphAttributes = {};
  return g;
}

/**
 * @param raiz   grupo que contiene las mallas estáticas
 * @returns { antes, despues, regiones }
 */
export function consolidarEstaticos(raiz) {
  const candidatas = [];
  raiz.traverse((o) => {
    if (o.isMesh && !o.userData.noFusionar) candidatas.push(o);
  });

  // Agrupar por (material, región). La clave de región usa el centro de la malla en el mundo.
  const grupos = new Map();
  const v = new THREE.Vector3();
  for (const m of candidatas) {
    m.updateWorldMatrix(true, false);
    m.geometry.computeBoundingSphere();
    v.copy(m.geometry.boundingSphere.center).applyMatrix4(m.matrixWorld);
    const rx = Math.floor(v.x / LADO_REGION), rz = Math.floor(v.z / LADO_REGION);
    const clave = `${m.material.uuid}|${rx}|${rz}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: m.material, mallas: [] });
    grupos.get(clave).mallas.push(m);
  }

  let creadas = 0;
  for (const { material, mallas } of grupos.values()) {
    // Un grupo de una sola malla no gana nada al fusionarse y pierde su volumen ajustado.
    if (mallas.length < 2) continue;
    const geos = [];
    for (const m of mallas) {
      const g = normalizar(m.geometry);
      g.applyMatrix4(m.matrixWorld);
      geos.push(g);
    }
    let fusionada = null;
    try { fusionada = mergeGeometries(geos, false); } catch (e) { fusionada = null; }
    geos.forEach((g) => g.dispose());
    if (!fusionada) continue;        // si falla, se dejan las mallas originales: nada se pierde

    const nueva = new THREE.Mesh(fusionada, material);
    nueva.castShadow = mallas.some((m) => m.castShadow);
    nueva.receiveShadow = mallas.some((m) => m.receiveShadow);
    nueva.matrixAutoUpdate = false;
    nueva.userData.fusionada = true;
    raiz.add(nueva);
    creadas++;

    for (const m of mallas) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
  return { antes: candidatas.length, despues: candidatas.length - contarRetiradas(candidatas) + creadas,
           regiones: grupos.size, creadas };
}

function contarRetiradas(mallas) {
  let n = 0;
  for (const m of mallas) if (!m.parent) n++;
  return n;
}
