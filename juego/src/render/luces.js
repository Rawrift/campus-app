// PRESUPUESTO DE LUCES DINÁMICAS.
//
// Riesgo conocido y medido del stack elegido: Three.js hace forward rendering y evalúa TODAS
// las luces por píxel; no hay clustered light culling. En el gauntlet se midió que pasar de 6
// a 11 luces puntuales hunde el fotograma. En un sandbox el jugador va a generar lámparas,
// fuegos y explosiones sin límite, así que sin esto el juego se degrada solo.
//
// Solución: un número FIJO de luces reales reutilizadas en anillo. Cada solicitante pide una
// luz con una prioridad; se conceden a los más prioritarios (cercanos e intensos) y al resto
// se le deniega, y debe conformarse con su emisivo y su charco de luz falso. El coste de
// render es constante pase lo que pase.

import * as THREE from 'three';

export class PresupuestoLuces {
  /** @param max número de PointLight reales. Medido: por encima de 6-8 el coste se dispara. */
  constructor(escena, { max = 6, sombrasMax = 1 } = {}) {
    this.max = max;
    this.escena = escena;
    this.luces = [];
    for (let i = 0; i < max; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 2);
      l.visible = false;
      l.castShadow = i < sombrasMax;      // las sombras puntuales son carísimas: casi ninguna
      if (l.castShadow) {
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.004;
        l.shadow.camera.near = 0.2;
      }
      escena.add(l);
      this.luces.push(l);
    }
    this.solicitudes = [];
    this.concedidas = 0;
    this.denegadas = 0;
  }

  /**
   * Pide una luz para este fotograma. No garantiza nada: si no entra en presupuesto, se
   * deniega y el llamante debe tener plan B (emisivo, calcomanía de charco de luz).
   * @returns true si se concedió
   */
  pedir({ posicion, color, intensidad, alcance = 24, prioridad = 0 }) {
    this.solicitudes.push({ posicion, color, intensidad, alcance, prioridad });
    return true;
  }

  /**
   * Resuelve el presupuesto. Se llama una vez por fotograma, después de que todos hayan pedido.
   * La prioridad efectiva combina la declarada con la intensidad y la cercanía a la cámara:
   * una explosión lejana importa menos que una lámpara al lado del jugador.
   */
  resolver(posicionCamara) {
    const cx = posicionCamara.x, cy = posicionCamara.y, cz = posicionCamara.z;
    for (const s of this.solicitudes) {
      const dx = s.posicion[0] - cx, dy = s.posicion[1] - cy, dz = s.posicion[2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      // Fuera de alcance no compite por presupuesto.
      s._peso = (d2 > (s.alcance + 30) ** 2) ? -1
              : s.prioridad * 1000 + s.intensidad * 40 - Math.sqrt(d2);
    }
    this.solicitudes.sort((a, b) => b._peso - a._peso);

    const n = Math.min(this.max, this.solicitudes.length);
    let usadas = 0;
    for (let i = 0; i < n; i++) {
      const s = this.solicitudes[i];
      if (s._peso < 0) break;
      const l = this.luces[usadas++];
      l.visible = true;
      l.position.set(s.posicion[0], s.posicion[1], s.posicion[2]);
      l.color.set(s.color);
      l.intensity = s.intensidad;
      l.distance = s.alcance;
    }
    for (let i = usadas; i < this.max; i++) { this.luces[i].visible = false; this.luces[i].intensity = 0; }

    this.concedidas = usadas;
    this.denegadas = Math.max(0, this.solicitudes.length - usadas);
    this.solicitudes.length = 0;
  }

  estadisticas() { return { max: this.max, concedidas: this.concedidas, denegadas: this.denegadas }; }
}
