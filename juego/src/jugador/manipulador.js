// EL MANIPULADOR — la "physgun". Es el verbo central del juego y lo primero que hay que
// clavar: si agarrar y mover un objeto no se siente perfecto, nada de lo demás importa.
//
// Decisión clave: el objeto NO se teletransporta a la mano. Se conduce con un controlador
// proporcional-derivativo hacia el punto objetivo, aplicando fuerzas reales. Por eso un bidón
// de 250 kg llega despacio y con inercia, un palé de 30 kg va obediente, y al soltar el objeto
// conserva la velocidad que llevaba: se puede lanzar.

import { sucesos } from '../nucleo/sucesos.js';

export class Manipulador {
  constructor(mundoFisico, jugador) {
    this.fisica = mundoFisico;
    this.jugador = jugador;

    this.agarrado = null;         // id de entidad
    this.distancia = 4;
    this.distanciaMin = 1.6;
    this.distanciaMax = 14;
    this.alcance = 42;

    // Rigidez y amortiguación del muelle virtual. Ajustadas para que el objeto parezca
    // sujeto por un campo de fuerza, no clavado a la cámara.
    this.rigidez = 26;
    this.amortiguacion = 9.5;
    this.parRigidez = 12;
    this.parAmortiguacion = 4.5;

    this.rotando = false;         // E mantenido: el ratón rota el objeto en vez de la vista
    this.rotFina = false;
    this.tension = 0;             // 0..1, para el sonido y el efecto del haz
    this.masaAgarrada = 0;
  }

  apuntado() {
    const o = this.jugador.posicionOjos();
    const d = this.jugador.direccion();
    return this.fisica.rayo(o, d, this.alcance);
  }

  agarrar() {
    if (this.agarrado != null) return true;
    const h = this.apuntado();
    if (!h || h.id == null) return false;
    const e = this.fisica.entidades.get(h.id);
    if (!e || !e.cuerpo.isDynamic() || e.meta.noAgarrable) return false;

    this.agarrado = h.id;
    this.distancia = Math.max(this.distanciaMin, Math.min(this.distanciaMax, h.distancia));
    this.masaAgarrada = e.masa;
    // Mientras está agarrado no debe dormirse ni el solver lo tratará como estático.
    e.cuerpo.setLinearDamping(2.2);
    e.cuerpo.setAngularDamping(3.0);
    e.cuerpo.wakeUp();
    sucesos.emitir('manipulador:agarre', { id: h.id, masa: e.masa, posicion: h.punto });
    return true;
  }

  soltar({ lanzar = 0 } = {}) {
    if (this.agarrado == null) return;
    const e = this.fisica.entidades.get(this.agarrado);
    if (e) {
      e.cuerpo.setLinearDamping(0.04);
      e.cuerpo.setAngularDamping(0.16);
      if (lanzar > 0) {
        const d = this.jugador.direccion();
        // El impulso de lanzamiento escala con la masa: lanzar un bidón cuesta más que un palé,
        // pero no tanto como para que sea inútil.
        const f = lanzar * Math.pow(e.masa, 0.62) * 2.6;
        this.fisica.impulso(e.id, [d[0] * f, d[1] * f + f * 0.12, d[2] * f]);
      }
      sucesos.emitir('manipulador:suelta', { id: e.id, masa: e.masa, lanzar });
    }
    this.agarrado = null;
    this.tension = 0;
    this.masaAgarrada = 0;
  }

  /** Clic derecho: congela el objeto en el aire. Es la herramienta de construcción básica. */
  congelar() {
    if (this.agarrado == null) {
      const h = this.apuntado();
      if (!h || h.id == null) return false;
      this.fisica.congelar(h.id, true);
      sucesos.emitir('manipulador:congela', { id: h.id, posicion: h.punto });
      return true;
    }
    const id = this.agarrado;
    this.soltar();
    this.fisica.congelar(id, true);
    const e = this.fisica.entidades.get(id);
    sucesos.emitir('manipulador:congela', { id, posicion: e ? [e.cuerpo.translation().x, e.cuerpo.translation().y, e.cuerpo.translation().z] : null });
    return true;
  }

  descongelarTodo() {
    let n = 0;
    for (const e of this.fisica.entidades.values()) {
      if (e.congelado && !e.meta.protegido) { this.fisica.congelar(e.id, false); n++; }
    }
    sucesos.emitir('manipulador:descongela', { n });
    return n;
  }

  acercar(delta) {
    this.distancia = Math.max(this.distanciaMin, Math.min(this.distanciaMax, this.distancia + delta));
  }

  /** Cuando `rotando` está activo, el ratón gira el objeto en vez de la vista. */
  rotar(dx, dy) {
    if (this.agarrado == null) return;
    const e = this.fisica.entidades.get(this.agarrado); if (!e) return;
    const k = this.rotFina ? 0.0016 : 0.0075;
    const q = e.cuerpo.rotation();
    // Giro alrededor de los ejes de la cámara, que es lo intuitivo.
    const sy = Math.sin(this.jugador.guiñada), cy = Math.cos(this.jugador.guiñada);
    const ejeVert = [0, 1, 0];
    const ejeLat  = [cy, 0, -sy];
    const r1 = quatDeEje(ejeVert, -dx * k);
    const r2 = quatDeEje(ejeLat,  -dy * k);
    let nq = mulQuat(r1, [q.x, q.y, q.z, q.w]);
    nq = mulQuat(r2, nq);
    e.cuerpo.setRotation({ x: nq[0], y: nq[1], z: nq[2], w: nq[3] }, true);
    e.cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  actualizar(dt) {
    if (this.agarrado == null) { this.tension = 0; return; }
    const e = this.fisica.entidades.get(this.agarrado);
    if (!e || e.congelado) { this.agarrado = null; this.tension = 0; return; }

    const o = this.jugador.posicionOjos();
    const d = this.jugador.direccion();
    const objetivo = [o[0] + d[0] * this.distancia,
                      o[1] + d[1] * this.distancia,
                      o[2] + d[2] * this.distancia];

    const p = e.cuerpo.translation();
    const v = e.cuerpo.linvel();
    const ex = objetivo[0] - p.x, ey = objetivo[1] - p.y, ez = objetivo[2] - p.z;

    // Controlador PD: fuerza proporcional al error menos amortiguación proporcional a la
    // velocidad. La fuerza se escala con la masa para que objetos ligeros y pesados respondan
    // con la misma "mano", pero el pesado conserva su inercia y llega más tarde.
    const m = e.masa;
    const fx = (ex * this.rigidez - v.x * this.amortiguacion) * m;
    const fy = (ey * this.rigidez - v.y * this.amortiguacion) * m + (-this.fisica.mundo.gravity.y * m);
    const fz = (ez * this.rigidez - v.z * this.amortiguacion) * m;

    // Techo de fuerza: sin esto, un objeto atrapado entre geometría acumula fuerza infinita
    // y sale disparado al liberarse, o desestabiliza el solver.
    const maxF = m * 190;
    const mag = Math.hypot(fx, fy, fz);
    const k = mag > maxF ? maxF / mag : 1;

    e.cuerpo.applyImpulse({ x: fx * k * dt, y: fy * k * dt, z: fz * k * dt }, true);

    // Frenado angular suave para que no gire como una peonza mientras lo llevas.
    const av = e.cuerpo.angvel();
    e.cuerpo.applyTorqueImpulse({
      x: -av.x * this.parAmortiguacion * m * dt * 0.02,
      y: -av.y * this.parAmortiguacion * m * dt * 0.02,
      z: -av.z * this.parAmortiguacion * m * dt * 0.02 }, true);

    // La tensión alimenta el sonido y el grosor del haz: cuanto más cuesta, más "sufre".
    const err = Math.hypot(ex, ey, ez);
    this.tension = Math.min(1, err / 2.2 + Math.min(1, m / 400) * 0.35);
    this.masaAgarrada = m;
  }

  /** Punto donde debe dibujarse el extremo del haz. */
  puntoHaz() {
    if (this.agarrado == null) return null;
    const e = this.fisica.entidades.get(this.agarrado); if (!e) return null;
    const t = e.cuerpo.translation();
    return [t.x, t.y, t.z];
  }
}

function quatDeEje(eje, ang) {
  const s = Math.sin(ang / 2);
  return [eje[0] * s, eje[1] * s, eje[2] * s, Math.cos(ang / 2)];
}
function mulQuat(a, b) {
  return [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
  ];
}
