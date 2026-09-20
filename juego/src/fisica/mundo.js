// Mundo físico sobre Rapier3D. El bucle manda: aquí NUNCA se decide el paso de tiempo,
// se recibe. Es lo que permite el modo determinista.
//
// Responsabilidades: registro de cuerpos con su material, emisión de sucesos de impacto con
// el momento real del choque (de ahí salen sonido, chispas, calcomanías y roturas), y
// creación de restricciones.

import RAPIER from '@dimforge/rapier3d-compat';
import { PASO } from '../nucleo/bucle.js';
import { sucesos } from '../nucleo/sucesos.js';
import { material, contacto as contactoMat, masaDe } from './materiales.js';

export const GRAVEDAD = -9.81;

/** Umbral por debajo del cual un choque no genera suceso. Evita ahogar el bus en roces. */
const MOMENTO_MINIMO = 12;   // kg·m/s

let listo = false;
export async function iniciarRapier() {
  if (!listo) { await RAPIER.init(); listo = true; }
  return RAPIER;
}

export class MundoFisico {
  constructor() {
    this.rapier = RAPIER;
    this.mundo = new RAPIER.World({ x: 0, y: GRAVEDAD, z: 0 });
    // Paso fijo declarado también en Rapier, por si algún subsistema lo consulta.
    this.mundo.timestep = PASO;
    // Con pilas de cientos de cuerpos, 4 iteraciones dejan penetraciones que el solver
    // resuelve expulsando cuerpos a través del suelo. Medido: 8 iteraciones reducen mucho las
    // fugas a cambio de un coste asumible.
    this.mundo.numSolverIterations = 8;
    this.colas = new RAPIER.EventQueue(true);

    /** id -> { cuerpo, colisionador, material, volumen, roto, congelado, meta } */
    this.entidades = new Map();
    this._siguienteId = 1;
    this._porColisionador = new Map();   // handle de colisionador -> id de entidad
    this.restricciones = new Map();
    this._siguienteRestriccion = 1;

    this.limiteCuerpos = 1200;           // techo duro: el sandbox debe sobrevivir al caos
    this._ordenCreacion = [];            // para reciclar lo más viejo al llegar al techo

    // Rapier no construye su índice espacial hasta el primer step(). Hasta entonces CUALQUIER
    // raycast devuelve "nada", en silencio. Eso rompería el manipulador, la herramienta, las
    // armas y la oclusión de las explosiones si se consulta antes de simular (por ejemplo al
    // montar un escenario). Se marca sucio al crear o destruir y se reconstruye bajo demanda.
    this._consultasSucias = true;

    // Velocidades absurdas atraviesan geometría fina entre dos pasos. Medido: con explosiones
    // de 22 kN varios cuerpos se colaban por un suelo de 1 m de grosor.
    this.velocidadMaxima = 90;           // m/s
    this.umbralCCD = 22;                 // por encima de esto se activa CCD en ese cuerpo
    this._contadorCCD = 0;

    // Red de seguridad de límites del mundo. No enmascara el problema anterior: con 8
    // iteraciones del solver, impulsos acotados y CCD, las fugas son ya raras. Pero en un
    // sandbox el jugador VA a construir pilas patológicas, y ningún motor rígido garantiza
    // cero expulsiones. Todo juego de este género tiene este plano: lo que sale del mundo se
    // retira y se avisa, en vez de acumular cuerpos cayendo eternamente.
    this.limites = { yMinimo: -25, radio: 400 };
    this.pielContacto = 0.01;   // 1 cm: medido mejor que 0 y que 5 cm, que empeora mucho
  }

  /**
   * Reconstruye el índice espacial sin avanzar la simulación: un paso de timestep 0 deja las
   * posiciones intactas pero repuebla la fase amplia. Es la única vía en esta versión de
   * Rapier, que no expone updateSceneQueries().
   */
  _asegurarConsultas() {
    if (!this._consultasSucias) return;
    const dt = this.mundo.timestep;
    this.mundo.timestep = 0;
    this.mundo.step();
    this.mundo.timestep = dt;
    this._consultasSucias = false;
  }

  // --- creación ---------------------------------------------------------------------------
  /**
   * @param descripcion.tipo 'dinamico' | 'fijo' | 'cinematico'
   * @param descripcion.forma { clase:'caja'|'esfera'|'cilindro'|'capsula'|'malla', ... }
   * @param descripcion.material id de la tabla de materiales
   * @param descripcion.relleno factor de relleno para la masa (ver materiales.js)
   */
  crear({ tipo = 'dinamico', pos = [0, 0, 0], rot = null, forma, material: idMat = 'hormigon',
          relleno = 1, velocidad = null, meta = {} }) {
    if (tipo === 'dinamico') this._hacerSitio();

    const dcuerpo = tipo === 'dinamico' ? RAPIER.RigidBodyDesc.dynamic()
                  : tipo === 'cinematico' ? RAPIER.RigidBodyDesc.kinematicPositionBased()
                  : RAPIER.RigidBodyDesc.fixed();
    dcuerpo.setTranslation(pos[0], pos[1], pos[2]);
    if (rot) dcuerpo.setRotation({ x: rot[0], y: rot[1], z: rot[2], w: rot[3] });
    // Sin amortiguación el sandbox acumula energía y nunca se duerme nada.
    dcuerpo.setLinearDamping(0.04).setAngularDamping(0.16);
    dcuerpo.setCcdEnabled(forma.ccd === true);
    const cuerpo = this.mundo.createRigidBody(dcuerpo);

    const { desc, volumen } = this._descriptorForma(forma);
    const m = material(idMat);
    const masa = Math.max(0.05, masaDe(idMat, volumen, relleno));
    desc.setDensity(0);                 // la masa se fija explícitamente, no por densidad
    desc.setMass(masa);
    desc.setFriction(m.friccion);
    desc.setRestitution(m.restitucion);
    desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
    desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    // Piel de contacto: margen que el solver mantiene entre superficies. Sin ella, en pilas
    // muy comprimidas los contactos penetran tanto que el solver resuelve al lado equivocado
    // y expulsa cuerpos a través del suelo. Se midió que ni el grosor del suelo ni el CCD lo
    // evitan, porque no es atravesamiento por velocidad sino penetración profunda.
    if (desc.setContactSkin) desc.setContactSkin(this.pielContacto);
    const colisionador = this.mundo.createCollider(desc, cuerpo);

    if (velocidad) cuerpo.setLinvel({ x: velocidad[0], y: velocidad[1], z: velocidad[2] }, true);

    const id = this._siguienteId++;
    const ent = { id, cuerpo, colisionador, material: idMat, volumen, masa, relleno,
                  roto: false, congelado: false, salud: 1, calor: 0, meta };
    this.entidades.set(id, ent);
    this._porColisionador.set(colisionador.handle, id);
    this._consultasSucias = true;
    if (tipo === 'dinamico') this._ordenCreacion.push(id);
    return ent;
  }

  _descriptorForma(f) {
    switch (f.clase) {
      case 'caja': {
        const [x, y, z] = f.medias;
        return { desc: RAPIER.ColliderDesc.cuboid(x, y, z), volumen: 8 * x * y * z };
      }
      case 'esfera':
        return { desc: RAPIER.ColliderDesc.ball(f.radio), volumen: 4 / 3 * Math.PI * f.radio ** 3 };
      case 'cilindro':
        return { desc: RAPIER.ColliderDesc.cylinder(f.mediaAltura, f.radio),
                 volumen: Math.PI * f.radio ** 2 * f.mediaAltura * 2 };
      case 'capsula':
        return { desc: RAPIER.ColliderDesc.capsule(f.mediaAltura, f.radio),
                 volumen: Math.PI * f.radio ** 2 * (f.mediaAltura * 2 + 4 / 3 * f.radio) };
      case 'malla':
        return { desc: RAPIER.ColliderDesc.trimesh(f.vertices, f.indices), volumen: f.volumen ?? 1 };
      case 'cascoConvexo': {
        const d = RAPIER.ColliderDesc.convexHull(f.puntos);
        if (!d) throw new Error('casco convexo inválido');
        return { desc: d, volumen: f.volumen ?? 1 };
      }
      default: throw new Error('forma desconocida: ' + f.clase);
    }
  }

  /** Al llegar al techo de cuerpos, recicla los más viejos que no estén congelados ni protegidos. */
  _hacerSitio() {
    if (this._ordenCreacion.length < this.limiteCuerpos) return;
    let quitados = 0;
    while (this._ordenCreacion.length && quitados < 24) {
      const id = this._ordenCreacion.shift();
      const e = this.entidades.get(id);
      if (!e) continue;
      if (e.congelado || e.meta.protegido) { this._ordenCreacion.push(id); if (++quitados > 200) break; continue; }
      this.eliminar(id); quitados++;
    }
    sucesos.emitir('limite:reciclado', { quitados });
  }

  eliminar(id) {
    const e = this.entidades.get(id);
    if (!e) return false;
    this._porColisionador.delete(e.colisionador.handle);
    for (const [rid, r] of this.restricciones) if (r.a === id || r.b === id) this.quitarRestriccion(rid);
    this.mundo.removeRigidBody(e.cuerpo);
    this.entidades.delete(id);
    this._consultasSucias = true;
    sucesos.emitir('entidad:eliminada', { id });
    return true;
  }

  // --- restricciones ----------------------------------------------------------------------
  _anclar(idA, idB, crear, tipo) {
    const a = this.entidades.get(idA), b = this.entidades.get(idB);
    if (!a || !b) return null;
    const j = this.mundo.createImpulseJoint(crear(), a.cuerpo, b.cuerpo, true);
    const id = this._siguienteRestriccion++;
    this.restricciones.set(id, { id, tipo, a: idA, b: idB, junta: j });
    return id;
  }
  soldar(idA, idB, anclaA, anclaB) {
    return this._anclar(idA, idB, () => RAPIER.JointData.fixed(
      { x: anclaA[0], y: anclaA[1], z: anclaA[2] }, { x: 0, y: 0, z: 0, w: 1 },
      { x: anclaB[0], y: anclaB[1], z: anclaB[2] }, { x: 0, y: 0, z: 0, w: 1 }), 'soldadura');
  }
  eje(idA, idB, anclaA, anclaB, ejeLocal = [0, 1, 0]) {
    return this._anclar(idA, idB, () => RAPIER.JointData.revolute(
      { x: anclaA[0], y: anclaA[1], z: anclaA[2] }, { x: anclaB[0], y: anclaB[1], z: anclaB[2] },
      { x: ejeLocal[0], y: ejeLocal[1], z: ejeLocal[2] }), 'eje');
  }
  cuerda(idA, idB, anclaA, anclaB, longitud) {
    return this._anclar(idA, idB, () => RAPIER.JointData.rope(longitud,
      { x: anclaA[0], y: anclaA[1], z: anclaA[2] }, { x: anclaB[0], y: anclaB[1], z: anclaB[2] }), 'cuerda');
  }
  muelle(idA, idB, anclaA, anclaB, reposo, rigidez, amortiguacion) {
    return this._anclar(idA, idB, () => RAPIER.JointData.spring(reposo, rigidez, amortiguacion,
      { x: anclaA[0], y: anclaA[1], z: anclaA[2] }, { x: anclaB[0], y: anclaB[1], z: anclaB[2] }), 'muelle');
  }
  /** Motor sobre un eje: par y velocidad objetivo. Lo usa la herramienta 'motor'. */
  motorizar(idRestriccion, velocidadObjetivo, fuerzaMax) {
    const r = this.restricciones.get(idRestriccion);
    if (!r || r.tipo !== 'eje') return false;
    r.junta.configureMotorVelocity(velocidadObjetivo, fuerzaMax);
    r.motor = { velocidadObjetivo, fuerzaMax };
    return true;
  }
  quitarRestriccion(id) {
    const r = this.restricciones.get(id);
    if (!r) return false;
    this.mundo.removeImpulseJoint(r.junta, true);
    this.restricciones.delete(id);
    return true;
  }

  // --- utilidades -------------------------------------------------------------------------
  congelar(id, si = true) {
    const e = this.entidades.get(id); if (!e) return;
    e.congelado = si;
    e.cuerpo.setBodyType(si ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
  }

  impulso(id, v, punto = null) {
    const e = this.entidades.get(id); if (!e || e.congelado) return;
    const [x, y, z] = this._acotarImpulso(e, v);
    const vec = { x, y, z };
    if (punto) e.cuerpo.applyImpulseAtPoint(vec, { x: punto[0], y: punto[1], z: punto[2] }, true);
    else e.cuerpo.applyImpulse(vec, true);
  }

  /**
   * Acota un impulso para que no pueda producir un salto de velocidad absurdo.
   * Sin esto, una explosión cercana imparte miles de m/s a una caja ligera y el cuerpo
   * atraviesa el suelo entre dos pasos, por muy gruesa que sea la geometría. Y además es lo
   * físicamente razonable: una deflagración no acelera un palé a Mach 15.
   * Activa CCD de inmediato si el golpe es fuerte, sin esperar a la revisión periódica.
   */
  _acotarImpulso(e, v) {
    const masa = e.masa || 1;
    const mag = Math.hypot(v[0], v[1], v[2]);
    if (mag <= 1e-6) return v;
    const deltaV = mag / masa;
    if (deltaV > this.umbralCCD && !e._ccd) { e.cuerpo.enableCcd(true); e._ccd = true; }
    if (deltaV <= this.velocidadMaxima) return v;
    const k = (this.velocidadMaxima * masa) / mag;
    return [v[0] * k, v[1] * k, v[2] * k];
  }

  /**
   * Explosión: impulso radial con caída cuadrática y oclusión por raycast, para que un muro
   * proteja de verdad. Devuelve los ids afectados.
   */
  explotar(centro, potencia, radio) {
    this._asegurarConsultas();   // sin esto la oclusión sería siempre falsa
    const c = { x: centro[0], y: centro[1], z: centro[2] };
    const afectados = [];
    for (const e of this.entidades.values()) {
      if (e.congelado || !e.cuerpo.isDynamic()) continue;
      const p = e.cuerpo.translation();
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radio * radio) continue;
      const d = Math.max(0.6, Math.sqrt(d2));
      // Caída cuadrática: el objeto pegado a la carga sale disparado, el lejano se menea.
      let f = potencia / (d * d);
      const oclusion = this._ocluido(c, p, e.colisionador.handle);
      if (oclusion) f *= 0.25;
      const inv = 1 / d;
      const [ix, iy, iz] = this._acotarImpulso(e, [dx * inv * f, (dy * inv + 0.35) * f, dz * inv * f]);
      e.cuerpo.applyImpulse({ x: ix, y: iy, z: iz }, true);
      e.calor = Math.min(1, e.calor + f / 1800);
      afectados.push(e.id);
    }
    sucesos.emitir('explosion', { centro, potencia, radio, afectados: afectados.length });
    return afectados;
  }

  _ocluido(desde, hasta, handlePropio) {
    const dx = hasta.x - desde.x, dy = hasta.y - desde.y, dz = hasta.z - desde.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const rayo = new RAPIER.Ray(desde, { x: dx / len, y: dy / len, z: dz / len });
    const golpe = this.mundo.castRay(rayo, len - 0.3, true, undefined, undefined, undefined, undefined,
      (col) => col.handle !== handlePropio);
    return !!golpe;
  }

  /** Raycast general. Devuelve { id, punto, normal, distancia } o null. */
  rayo(origen, direccion, alcance = 100, excluir = null) {
    this._asegurarConsultas();
    const r = new RAPIER.Ray({ x: origen[0], y: origen[1], z: origen[2] },
                             { x: direccion[0], y: direccion[1], z: direccion[2] });
    const g = this.mundo.castRayAndGetNormal(r, alcance, true, undefined, undefined, undefined, undefined,
      (col) => (excluir == null ? true : this._porColisionador.get(col.handle) !== excluir));
    if (!g) return null;
    const p = r.pointAt(g.timeOfImpact);
    return { id: this._porColisionador.get(g.collider.handle) ?? null,
             punto: [p.x, p.y, p.z], normal: [g.normal.x, g.normal.y, g.normal.z],
             distancia: g.timeOfImpact };
  }

  // --- paso -------------------------------------------------------------------------------
  paso() {
    this._limitarVelocidades();
    this.mundo.step(this.colas);
    this._consultasSucias = false;   // el propio paso deja el índice al día
    this._procesarContactos();
    this._recogerFugados();
  }

  /** Retira lo que ha salido del mundo. Devuelve cuántos, para poder vigilarlo. */
  _recogerFugados() {
    const { yMinimo, radio } = this.limites;
    const r2 = radio * radio;
    let n = 0;
    for (const e of this.entidades.values()) {
      if (!e.cuerpo.isDynamic()) continue;
      const t = e.cuerpo.translation();
      const fuera = !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)
                 || t.y < yMinimo || (t.x * t.x + t.z * t.z) > r2;
      if (fuera) { this.eliminar(e.id); n++; }
    }
    if (n) { this.fugados = (this.fugados || 0) + n; sucesos.emitir('mundo:fugados', { n, total: this.fugados }); }
    return n;
  }

  /**
   * Evita el atravesamiento a alta velocidad. Dos medidas complementarias: un techo duro de
   * velocidad (nada en este juego necesita ir a 200 m/s) y CCD activado solo en los cuerpos
   * que van rápido, que es donde compensa pagarlo. Revisar CCD cada 4 pasos basta y ahorra
   * recorrer todos los cuerpos en cada uno.
   */
  _limitarVelocidades() {
    const revisarCCD = (this._contadorCCD++ & 3) === 0;
    const vmax = this.velocidadMaxima, vmax2 = vmax * vmax;
    for (const e of this.entidades.values()) {
      if (e.congelado || !e.cuerpo.isDynamic() || e.cuerpo.isSleeping()) continue;
      const v = e.cuerpo.linvel();
      const s2 = v.x * v.x + v.y * v.y + v.z * v.z;
      if (s2 > vmax2) {
        const k = vmax / Math.sqrt(s2);
        e.cuerpo.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
      if (revisarCCD) {
        const rapido = s2 > this.umbralCCD * this.umbralCCD;
        if (rapido !== !!e._ccd) { e.cuerpo.enableCcd(rapido); e._ccd = rapido; }
      }
    }
  }

  /**
   * Convierte contactos de Rapier en sucesos con MOMENTO REAL, que es lo que necesita el resto
   * del juego: el audio para elegir timbre y volumen, los VFX para chispas, la destrucción
   * para decidir si algo se rompe. Sin esto, todos los golpes sonarían igual.
   */
  _procesarContactos() {
    this.colas.drainCollisionEvents((h1, h2, empezado) => {
      if (!empezado) return;
      const idA = this._porColisionador.get(h1), idB = this._porColisionador.get(h2);
      const a = idA != null ? this.entidades.get(idA) : null;
      const b = idB != null ? this.entidades.get(idB) : null;
      if (!a && !b) return;

      const va = a ? a.cuerpo.linvel() : { x: 0, y: 0, z: 0 };
      const vb = b ? b.cuerpo.linvel() : { x: 0, y: 0, z: 0 };
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
      // Masa reducida: dos cuerpos ligeros chocando no equivalen a uno pesado contra el suelo.
      const ma = a && a.cuerpo.isDynamic() ? a.masa : Infinity;
      const mb = b && b.cuerpo.isDynamic() ? b.masa : Infinity;
      const mRed = (ma === Infinity) ? mb : (mb === Infinity) ? ma : (ma * mb) / (ma + mb);
      const momento = mRed * rel;
      if (!(momento > MOMENTO_MINIMO)) return;

      const ref = a || b;
      const p = ref.cuerpo.translation();
      const matA = a ? a.material : 'hormigon';
      const matB = b ? b.material : 'hormigon';
      sucesos.emitir('impacto', {
        idA, idB, materialA: matA, materialB: matB,
        momento, velocidadRelativa: rel, posicion: [p.x, p.y, p.z],
        contactoMaterial: contactoMat(matA, matB),
      });

      // La rotura emerge de las propiedades, no de una lista de objetos rompibles.
      for (const e of [a, b]) {
        if (!e || e.roto) continue;
        const m = material(e.material);
        if (momento > m.umbralRotura) {
          e.roto = true;
          sucesos.emitir('rotura', { id: e.id, material: e.material, momento, posicion: [p.x, p.y, p.z] });
        }
      }
    });
    this.colas.clear();
  }

  estadisticas() {
    let activos = 0, dinamicos = 0;
    for (const e of this.entidades.values()) {
      if (e.cuerpo.isDynamic()) { dinamicos++; if (!e.cuerpo.isSleeping()) activos++; }
    }
    return { cuerpos: this.entidades.size, dinamicos, cuerposActivos: activos,
             restricciones: this.restricciones.size };
  }

  limpiar({ conservarProtegidos = true } = {}) {
    for (const id of [...this.entidades.keys()]) {
      const e = this.entidades.get(id);
      if (conservarProtegidos && e?.meta.protegido) continue;
      this.eliminar(id);
    }
    this._ordenCreacion.length = 0;
  }
}
