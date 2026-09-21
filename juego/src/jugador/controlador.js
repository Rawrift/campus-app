// Controlador del jugador en primera persona.
//
// Usa el controlador cinemático de personaje de Rapier para el desplazamiento (subir escalones,
// deslizarse por pendientes, no quedarse enganchado) pero la SENSACIÓN es toda nuestra:
// aceleración, inercia, control en el aire y empuje a los cuerpos dinámicos. Un FPS se juzga en
// los tres primeros segundos por cómo se mueve.

import RAPIER from '@dimforge/rapier3d-compat';
import { sucesos } from '../nucleo/sucesos.js';

const ALTURA_OJOS = 1.68;
const ALTURA_OJOS_AGACHADO = 1.05;
const RADIO = 0.35;
const MEDIA_ALTURA = 0.52;            // cápsula: 0.52*2 + 0.35*2 = 1.74 m de alto
const MEDIA_ALTURA_AGACHADO = 0.20;

export class Jugador {
  constructor(mundoFisico, camara) {
    this.fisica = mundoFisico;
    this.camara = camara;

    this.posicion = { x: 0, y: 2, z: 14 };
    this.velocidad = { x: 0, y: 0, z: 0 };
    this.guiñada = Math.PI;             // mirando a -Z
    this.cabeceo = 0;

    this.enSuelo = false;
    this.agachado = false;
    this.noclip = false;
    // Cuando el observador toma el control (capturas, modo foto, arnés de pruebas), el jugador
    // sigue simulándose con normalidad pero deja de escribir en la cámara.
    this.controlaCamara = true;
    this.tiempoSinSuelo = 0;
    this.balanceo = 0;

    this.entrada = { adelante:false, atras:false, izquierda:false, derecha:false,
                     saltar:false, correr:false, agachar:false };

    // Parámetros de sensación. Están juntos a propósito: es la mesa de mezclas del movimiento.
    this.ajustes = {
      velocidadAndar: 4.3, velocidadCorrer: 7.4, velocidadAgachado: 2.0,
      aceleracionSuelo: 62, aceleracionAire: 11, frenadaSuelo: 14,
      impulsoSalto: 6.2, gravedad: -22,      // más que la real: saltar con 9.81 se siente flotante
      empujeCuerpos: 3.2, sensibilidad: 0.0022,
      coyote: 0.12,                          // margen para saltar justo tras salir del borde
    };

    const d = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.posicion.x, this.posicion.y, this.posicion.z);
    this.cuerpo = this.fisica.mundo.createRigidBody(d);
    const cd = RAPIER.ColliderDesc.capsule(MEDIA_ALTURA, RADIO);
    cd.setFriction(0.0);      // la fricción del jugador la gestionamos nosotros, no el solver
    this.colisionador = this.fisica.mundo.createCollider(cd, this.cuerpo);
    // Los rayos de puntería salen de los ojos, que están dentro de esta cápsula: sin esto
    // todo lo que el jugador apunta se lo apunta a sí mismo.
    this.fisica.ignorar(this.colisionador);

    this.controlador = this.fisica.mundo.createCharacterController(0.02);
    this.controlador.setUp({ x: 0, y: 1, z: 0 });
    this.controlador.enableAutostep(0.45, 0.25, true);   // sube bordillos y escalones
    this.controlador.enableSnapToGround(0.35);           // no despega al bajar rampas
    this.controlador.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.controlador.setMinSlopeSlideAngle(38 * Math.PI / 180);
    this.controlador.setApplyImpulsesToDynamicBodies(true);
    this.controlador.setCharacterMass(82);
  }

  mirar(dx, dy) {
    this.guiñada -= dx * this.ajustes.sensibilidad;
    this.cabeceo -= dy * this.ajustes.sensibilidad;
    const lim = Math.PI / 2 - 0.01;
    this.cabeceo = Math.max(-lim, Math.min(lim, this.cabeceo));
  }

  teletransportar(pos, guiñada = null, cabeceo = null) {
    this.posicion = { x: pos[0], y: pos[1], z: pos[2] };
    this.velocidad = { x: 0, y: 0, z: 0 };
    this.cuerpo.setNextKinematicTranslation(this.posicion);
    this.cuerpo.setTranslation(this.posicion, true);
    if (guiñada !== null) this.guiñada = guiñada;
    if (cabeceo !== null) this.cabeceo = cabeceo;
  }

  /** Dirección a la que mira, en coordenadas del mundo. */
  direccion() {
    const cp = Math.cos(this.cabeceo), sp = Math.sin(this.cabeceo);
    return [-Math.sin(this.guiñada) * cp, sp, -Math.cos(this.guiñada) * cp];
  }

  posicionOjos() {
    const h = this.agachado ? ALTURA_OJOS_AGACHADO : ALTURA_OJOS;
    return [this.posicion.x, this.posicion.y - (MEDIA_ALTURA + RADIO) + h, this.posicion.z];
  }

  actualizar(dt) {
    const a = this.ajustes;
    const e = this.entrada;

    // --- agacharse: cambia la cápsula, no sólo la cámara -----------------------------------
    const quiereAgachado = e.agachar && !this.noclip;
    if (quiereAgachado !== this.agachado) {
      // Al levantarse hay que comprobar que hay hueco encima, o el jugador se incrusta.
      if (!quiereAgachado) {
        const techo = this.fisica.rayo([this.posicion.x, this.posicion.y, this.posicion.z], [0,1,0], 1.5);
        if (techo && techo.distancia < 1.25) { /* sigue agachado */ }
        else this._fijarAltura(false);
      } else this._fijarAltura(true);
    }

    // --- vector de entrada relativo a la mirada --------------------------------------------
    let ix = (e.derecha ? 1 : 0) - (e.izquierda ? 1 : 0);
    let iz = (e.atras ? 1 : 0) - (e.adelante ? 1 : 0);
    const len = Math.hypot(ix, iz);
    if (len > 1e-4) { ix /= len; iz /= len; }
    const sy = Math.sin(this.guiñada), cy = Math.cos(this.guiñada);
    const dx = ix * cy - iz * sy;
    const dz = -ix * sy - iz * cy;

    if (this.noclip) return this._actualizarNoclip(dt, dx, dz, e);

    const vMax = this.agachado ? a.velocidadAgachado
               : (e.correr ? a.velocidadCorrer : a.velocidadAndar);
    const acel = this.enSuelo ? a.aceleracionSuelo : a.aceleracionAire;

    // Aceleración hacia la velocidad deseada, con frenada sólo en el suelo: en el aire
    // conservas inercia, que es lo que hace que saltar se sienta bien.
    const objetivoX = dx * vMax, objetivoZ = dz * vMax;
    this.velocidad.x += (objetivoX - this.velocidad.x) * Math.min(1, acel * dt / Math.max(vMax, 0.001));
    this.velocidad.z += (objetivoZ - this.velocidad.z) * Math.min(1, acel * dt / Math.max(vMax, 0.001));
    if (this.enSuelo && len < 1e-4) {
      const f = Math.max(0, 1 - a.frenadaSuelo * dt);
      this.velocidad.x *= f; this.velocidad.z *= f;
    }

    // --- salto, con margen de indulgencia --------------------------------------------------
    this.tiempoSinSuelo = this.enSuelo ? 0 : this.tiempoSinSuelo + dt;
    if (e.saltar && this.tiempoSinSuelo < a.coyote && this.velocidad.y <= 0.1) {
      this.velocidad.y = a.impulsoSalto;
      this.tiempoSinSuelo = a.coyote;
      sucesos.emitir('jugador:salto', { posicion: this.posicionOjos() });
    }
    this.velocidad.y += a.gravedad * dt;
    if (this.velocidad.y < -60) this.velocidad.y = -60;

    // --- desplazamiento resuelto por Rapier -------------------------------------------------
    const desea = { x: this.velocidad.x * dt, y: this.velocidad.y * dt, z: this.velocidad.z * dt };
    this.controlador.computeColliderMovement(this.colisionador, desea);
    const mov = this.controlador.computedMovement();
    const estabaEnSuelo = this.enSuelo;
    this.enSuelo = this.controlador.computedGrounded();

    this.posicion.x += mov.x; this.posicion.y += mov.y; this.posicion.z += mov.z;
    this.cuerpo.setNextKinematicTranslation(this.posicion);

    // Si el movimiento vertical fue frenado, la velocidad debe reflejarlo o se acumula.
    if (this.enSuelo && this.velocidad.y < 0) {
      if (!estabaEnSuelo && this.velocidad.y < -7) {
        sucesos.emitir('jugador:aterrizaje', { velocidad: -this.velocidad.y, posicion: this.posicionOjos() });
      }
      this.velocidad.y = 0;
    } else if (Math.abs(mov.y) < Math.abs(desea.y) * 0.4 && this.velocidad.y > 0) {
      this.velocidad.y = 0;   // golpe de cabeza contra un techo
    }

    this._empujarCuerpos(dt);
    this._balanceo(dt, Math.hypot(this.velocidad.x, this.velocidad.z), vMax);
    this._aplicarCamara();
  }

  _fijarAltura(agachado) {
    this.agachado = agachado;
    this.fisica.dejarDeIgnorar(this.colisionador);
    this.fisica.mundo.removeCollider(this.colisionador, false);
    const cd = RAPIER.ColliderDesc.capsule(agachado ? MEDIA_ALTURA_AGACHADO : MEDIA_ALTURA, RADIO);
    cd.setFriction(0.0);
    this.colisionador = this.fisica.mundo.createCollider(cd, this.cuerpo);
    // Se recrea el colisionador, así que hay que volver a excluirlo de las consultas.
    this.fisica.ignorar(this.colisionador);
  }

  /**
   * Empuja los cuerpos dinámicos al caminar, con fuerza inversa a su masa. Sin esto el jugador
   * atraviesa el mundo como un fantasma y se rompe la ilusión de estar dentro de la física.
   * Rapier ya aplica impulsos con setApplyImpulsesToDynamicBodies, pero son demasiado tímidos
   * para que un bidón se mueva al empujarlo con el cuerpo.
   */
  _empujarCuerpos(dt) {
    const v = Math.hypot(this.velocidad.x, this.velocidad.z);
    if (v < 0.4) return;
    const d = this.direccion();
    const hit = this.fisica.rayo(
      [this.posicion.x, this.posicion.y, this.posicion.z],
      [this.velocidad.x / v, 0, this.velocidad.z / v], RADIO + 0.35);
    if (!hit || hit.id == null) return;
    const ent = this.fisica.entidades.get(hit.id);
    if (!ent || ent.congelado || !ent.cuerpo.isDynamic()) return;
    const f = this.ajustes.empujeCuerpos * Math.min(ent.masa, 220) * dt;
    this.fisica.impulso(hit.id, [this.velocidad.x / v * f, 0, this.velocidad.z / v * f]);
  }

  _balanceo(dt, v, vMax) {
    // Balanceo sutil al andar. Mucho marea; nada se siente rígido.
    const objetivo = this.enSuelo ? Math.min(1, v / Math.max(vMax, 0.01)) : 0;
    this.balanceo += (objetivo - this.balanceo) * Math.min(1, 8 * dt);
    this._fase = (this._fase || 0) + dt * (this.enSuelo ? v * 1.7 : 0);
  }

  _actualizarNoclip(dt, _dx, _dz, e) {
    // Se vuela hacia donde se mira, con desplazamiento lateral independiente de la mirada.
    // Es lo cómodo para construir: apuntas a un sitio y avanzas hacia él.
    const v = e.correr ? 26 : 10;
    const [mx, my, mz] = this.direccion();
    const adelante = (e.adelante ? 1 : 0) - (e.atras ? 1 : 0);
    const lateral  = (e.derecha ? 1 : 0) - (e.izquierda ? 1 : 0);
    const vertical = (e.saltar ? 1 : 0) - (e.agachar ? 1 : 0);
    const sy = Math.sin(this.guiñada), cy = Math.cos(this.guiñada);

    this.velocidad.x = (mx * adelante + cy * lateral) * v;
    this.velocidad.y = (my * adelante + vertical) * v;
    this.velocidad.z = (mz * adelante - sy * lateral) * v;

    this.posicion.x += this.velocidad.x * dt;
    this.posicion.y += this.velocidad.y * dt;
    this.posicion.z += this.velocidad.z * dt;
    this.cuerpo.setNextKinematicTranslation(this.posicion);
    this.enSuelo = false;
    this.balanceo = 0;
    this._aplicarCamara();
  }

  _aplicarCamara() {
    if (!this.controlaCamara) return;
    const [ox, oy, oz] = this.posicionOjos();
    const b = this.balanceo;
    const f = this._fase || 0;
    this.camara.position.set(
      ox + Math.cos(f) * 0.022 * b,
      oy + Math.abs(Math.sin(f)) * 0.030 * b,
      oz);
    this.camara.rotation.set(this.cabeceo, this.guiñada, Math.sin(f) * 0.006 * b, 'YXZ');
  }

  fijarNoclip(si) {
    this.noclip = si;
    this.colisionador.setEnabled(!si);
    if (!si) this.velocidad.y = 0;
  }
}
