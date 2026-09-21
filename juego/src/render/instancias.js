// DIBUJO INSTANCIADO DE PROPS DINÁMICOS.
//
// Cada prop tenía su propia malla: 248 objetos iniciales son 248 draw calls, y otras tantas
// en el pase de sombra. Con el mismo par (geometría, material) se dibujan todos de una sola
// llamada, que es exactamente el caso de un sandbox lleno de cajas y bidones iguales.
//
// La retirada usa intercambio con el último: mover el último ocupante al hueco que se libera
// evita compactar el buffer entero cada vez que algo se destruye, que en una explosión con
// cientos de bajas sería un coste absurdo.

import * as THREE from 'three';

const CAPACIDAD_INICIAL = 64;
const CAPACIDAD_MAXIMA = 4096;

export class GestorInstancias {
  constructor(escena) {
    this.escena = escena;
    this.lotes = new Map();          // clave -> lote
    this.deEntidad = new Map();      // id entidad -> { lote, indice }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._e = new THREE.Vector3(1, 1, 1);
  }

  _lote(clave, geometria, material) {
    let l = this.lotes.get(clave);
    if (l) return l;
    const malla = new THREE.InstancedMesh(geometria, material, CAPACIDAD_INICIAL);
    malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    malla.castShadow = true;
    malla.receiveShadow = true;
    malla.frustumCulled = false;   // el volumen de una malla instanciada no sigue a sus copias
    malla.count = 0;
    this.escena.add(malla);
    l = { clave, malla, geometria, material, capacidad: CAPACIDAD_INICIAL, ocupantes: [] };
    this.lotes.set(clave, l);
    return l;
  }

  _ampliar(lote) {
    const nueva = Math.min(CAPACIDAD_MAXIMA, lote.capacidad * 2);
    if (nueva === lote.capacidad) return false;
    const vieja = lote.malla;
    const malla = new THREE.InstancedMesh(lote.geometria, lote.material, nueva);
    malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    malla.castShadow = vieja.castShadow;
    malla.receiveShadow = vieja.receiveShadow;
    malla.frustumCulled = false;
    malla.count = vieja.count;
    malla.instanceMatrix.array.set(vieja.instanceMatrix.array);
    this.escena.remove(vieja);
    vieja.dispose();
    this.escena.add(malla);
    lote.malla = malla;
    lote.capacidad = nueva;
    return true;
  }

  /** Da de alta una entidad. Devuelve false si no cabe (tope de capacidad). */
  alta(idEntidad, clave, geometria, material) {
    if (this.deEntidad.has(idEntidad)) return true;
    const lote = this._lote(clave, geometria, material);
    if (lote.malla.count >= lote.capacidad && !this._ampliar(lote)) return false;
    const indice = lote.malla.count++;
    lote.ocupantes[indice] = idEntidad;
    this.deEntidad.set(idEntidad, { lote, indice });
    return true;
  }

  baja(idEntidad) {
    const ref = this.deEntidad.get(idEntidad);
    if (!ref) return false;
    const { lote, indice } = ref;
    const ultimo = lote.malla.count - 1;
    if (indice !== ultimo) {
      // Traslada el último ocupante al hueco, en vez de compactar todo el buffer.
      const m = new THREE.Matrix4();
      lote.malla.getMatrixAt(ultimo, m);
      lote.malla.setMatrixAt(indice, m);
      const movido = lote.ocupantes[ultimo];
      lote.ocupantes[indice] = movido;
      const refMovido = this.deEntidad.get(movido);
      if (refMovido) refMovido.indice = indice;
    }
    lote.malla.count = ultimo;
    lote.ocupantes.length = ultimo;
    lote.malla.instanceMatrix.needsUpdate = true;
    this.deEntidad.delete(idEntidad);
    return true;
  }

  /** Escribe la transformación de una entidad en su lote. */
  fijar(idEntidad, t, r) {
    const ref = this.deEntidad.get(idEntidad);
    if (!ref) return;
    this._p.set(t.x, t.y, t.z);
    this._q.set(r.x, r.y, r.z, r.w);
    this._m.compose(this._p, this._q, this._e);
    ref.lote.malla.setMatrixAt(ref.indice, this._m);
  }

  /** Marca los buffers como modificados. Una vez por fotograma, no por objeto. */
  confirmar() {
    for (const l of this.lotes.values()) l.malla.instanceMatrix.needsUpdate = true;
  }

  vaciar() {
    for (const l of this.lotes.values()) { this.escena.remove(l.malla); l.malla.dispose(); }
    this.lotes.clear();
    this.deEntidad.clear();
  }

  estadisticas() {
    let inst = 0;
    for (const l of this.lotes.values()) inst += l.malla.count;
    return { lotes: this.lotes.size, instancias: inst };
  }
}
