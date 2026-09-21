// EQUIPO DEL JUGADOR: manipulador, herramienta multiuso y armas.
//
// Todo lo que el jugador "lleva" vive aquí y comparte una interfaz mínima (primario,
// secundario, recargar, actualizar), para que el HUD y los menús no tengan que conocer cada
// caso. Las armas transmiten IMPULSO FÍSICO real: en un sandbox, disparar es otra forma de
// empujar cosas, no un contador de daño.

import { sucesos } from '../nucleo/sucesos.js';
import { material } from '../fisica/materiales.js';

// ---------------------------------------------------------------------------------------
// Herramienta multiuso
// ---------------------------------------------------------------------------------------
export const MODOS = [
  { id:'soldar',    nombre:'Soldar',        ayuda:'Une dos objetos rígidamente. Apunta al primero y luego al segundo.' },
  { id:'eje',       nombre:'Eje',           ayuda:'Bisagra libre entre dos objetos.' },
  { id:'motor',     nombre:'Motor',         ayuda:'Bisagra motorizada. Se activa y desactiva con la tecla de uso.' },
  { id:'muelle',    nombre:'Muelle',        ayuda:'Muelle amortiguado entre dos objetos.' },
  { id:'cuerda',    nombre:'Cuerda',        ayuda:'Limita la distancia máxima entre dos objetos.' },
  { id:'propulsor', nombre:'Propulsor',     ayuda:'Empuje continuo conmutable sobre un objeto.' },
  { id:'peso',      nombre:'Peso',          ayuda:'Multiplica o divide la masa del objeto.' },
  { id:'duplicar',  nombre:'Duplicar',      ayuda:'Copia el objeto apuntado.' },
  { id:'eliminar',  nombre:'Eliminar',      ayuda:'Borra el objeto apuntado.' },
];

export class Herramienta {
  constructor(juego) {
    this.juego = juego;
    this.id = 'herramienta';
    this.nombre = 'Herramienta';
    this.modo = 'soldar';
    this.primerPunto = null;     // { id, punto } del primer objeto seleccionado
    this.propulsores = new Map();
    this.motores = new Map();
  }

  get modoActual() { return MODOS.find(m => m.id === this.modo) || MODOS[0]; }
  get descripcion() { return this.modoActual.nombre; }

  fijarModo(id) {
    if (!MODOS.some(m => m.id === id)) return false;
    this.modo = id; this.primerPunto = null;
    this.juego.hud.avisar(`Herramienta: ${this.modoActual.nombre}`);
    return true;
  }

  cancelar() { this.primerPunto = null; }

  primario() {
    const f = this.juego.fisica;
    const h = this.juego.manipulador.apuntado();
    if (!h || h.id == null) { this.juego.hud.avisar('Apunta a un objeto'); return; }
    const ent = f.entidades.get(h.id);
    if (!ent) return;

    switch (this.modo) {
      case 'eliminar':
        if (ent.meta.protegido) { this.juego.hud.avisar('No se puede borrar el escenario'); return; }
        f.eliminar(h.id); this.juego.hud.avisar('Objeto eliminado'); return;

      case 'duplicar': {
        if (ent.meta.protegido) { this.juego.hud.avisar('No se puede duplicar el escenario'); return; }
        const t = ent.cuerpo.translation();
        const id = this.juego.generarDesde(ent, [t.x, t.y + 1.2, t.z]);
        if (id != null) this.juego.hud.avisar('Duplicado');
        return;
      }

      case 'peso': {
        if (!ent.cuerpo.isDynamic()) return;
        const nueva = ent.masa * 2;
        ent.masa = nueva; ent.colisionador.setMass(nueva);
        this.juego.hud.avisar(`Masa: ${nueva.toFixed(0)} kg`);
        return;
      }

      case 'propulsor': {
        if (!ent.cuerpo.isDynamic()) return;
        if (this.propulsores.has(h.id)) {
          this.propulsores.delete(h.id);
          this.juego.hud.avisar('Propulsor retirado');
        } else {
          this.propulsores.set(h.id, { fuerza: Math.max(60, ent.masa * 14), activo: true });
          this.juego.hud.avisar('Propulsor colocado · tecla F para conmutar');
        }
        return;
      }
    }

    // Modos de dos puntos: soldar, eje, motor, muelle, cuerda.
    if (!this.primerPunto) {
      this.primerPunto = { id: h.id, punto: h.punto };
      this.juego.hud.avisar(`${this.modoActual.nombre}: ahora el segundo objeto`);
      return;
    }
    if (this.primerPunto.id === h.id) { this.juego.hud.avisar('Elige un objeto distinto'); return; }

    const a = f.entidades.get(this.primerPunto.id);
    if (!a) { this.primerPunto = null; return; }
    const anclaA = this._local(a, this.primerPunto.punto);
    const anclaB = this._local(ent, h.punto);

    let id = null;
    if (this.modo === 'soldar') id = f.soldar(a.id, ent.id, anclaA, anclaB);
    else if (this.modo === 'eje' || this.modo === 'motor') id = f.eje(a.id, ent.id, anclaA, anclaB, [0,1,0]);
    else if (this.modo === 'muelle') {
      const d = Math.hypot(h.punto[0]-this.primerPunto.punto[0], h.punto[1]-this.primerPunto.punto[1], h.punto[2]-this.primerPunto.punto[2]);
      id = f.muelle(a.id, ent.id, anclaA, anclaB, Math.max(0.5, d), 90, 6);
    } else if (this.modo === 'cuerda') {
      const d = Math.hypot(h.punto[0]-this.primerPunto.punto[0], h.punto[1]-this.primerPunto.punto[1], h.punto[2]-this.primerPunto.punto[2]);
      id = f.cuerda(a.id, ent.id, anclaA, anclaB, Math.max(0.4, d));
    }

    if (id != null && this.modo === 'motor') {
      f.motorizar(id, 7, Math.max(200, (a.masa + ent.masa) * 12));
      this.motores.set(id, { activo: true, velocidad: 7 });
    }
    this.juego.hud.avisar(id != null ? `${this.modoActual.nombre} aplicado` : 'No se pudo unir');
    sucesos.emitir('herramienta:union', { modo: this.modo, a: a.id, b: ent.id, id });
    this.primerPunto = null;
  }

  /** Clic derecho: cancela la selección en curso, o retira uniones del objeto apuntado. */
  secundario() {
    if (this.primerPunto) { this.primerPunto = null; this.juego.hud.avisar('Selección cancelada'); return; }
    const f = this.juego.fisica;
    const h = this.juego.manipulador.apuntado();
    if (!h || h.id == null) return;
    let n = 0;
    for (const [rid, r] of [...f.restricciones]) {
      if (r.a === h.id || r.b === h.id) { f.quitarRestriccion(rid); this.motores.delete(rid); n++; }
    }
    this.propulsores.delete(h.id);
    this.juego.hud.avisar(n ? `${n} uniones retiradas` : 'Sin uniones');
  }

  /** Convierte un punto del mundo a coordenadas locales del cuerpo. */
  _local(ent, puntoMundo) {
    const t = ent.cuerpo.translation(), r = ent.cuerpo.rotation();
    const dx = puntoMundo[0]-t.x, dy = puntoMundo[1]-t.y, dz = puntoMundo[2]-t.z;
    // Rotación inversa del cuaternión.
    const ix = -r.x, iy = -r.y, iz = -r.z, iw = r.w;
    const tx =  iw*dx + iy*dz - iz*dy;
    const ty =  iw*dy + iz*dx - ix*dz;
    const tz =  iw*dz + ix*dy - iy*dx;
    const tw = -ix*dx - iy*dy - iz*dz;
    return [ tx*iw + tw*-ix + ty*-iz - tz*-iy,
             ty*iw + tw*-iy + tz*-ix - tx*-iz,
             tz*iw + tw*-iz + tx*-iy - ty*-ix ];
  }

  /** Conmuta propulsores y motores. Es la tecla de "usar". */
  conmutar() {
    let n = 0;
    for (const p of this.propulsores.values()) { p.activo = !p.activo; n++; }
    for (const [rid, m] of this.motores) {
      m.activo = !m.activo;
      this.juego.fisica.motorizar(rid, m.activo ? m.velocidad : 0, 4000);
      n++;
    }
    this.juego.hud.avisar(n ? `${n} mecanismos conmutados` : 'Nada que conmutar');
  }

  actualizar(dt) {
    const f = this.juego.fisica;
    for (const [id, p] of [...this.propulsores]) {
      const e = f.entidades.get(id);
      if (!e) { this.propulsores.delete(id); continue; }
      if (!p.activo || e.congelado) continue;
      f.impulso(id, [0, p.fuerza * dt, 0]);
    }
  }
}

// ---------------------------------------------------------------------------------------
// Armas
// ---------------------------------------------------------------------------------------
export const ARMAS = {
  pistola:     { nombre:'Pistola',       cadencia:0.16, perdigones:1,  impulso:180,  dispersion:0.004, alcance:180, retroceso:0.9 },
  escopeta:    { nombre:'Escopeta',      cadencia:0.85, perdigones:9,  impulso:130,  dispersion:0.055, alcance:60,  retroceso:3.4 },
  fusil:       { nombre:'Fusil',         cadencia:0.09, perdigones:1,  impulso:150,  dispersion:0.010, alcance:220, retroceso:0.7 },
  lanzacohetes:{ nombre:'Lanzacohetes',  cadencia:1.30, perdigones:0,  impulso:0,    dispersion:0,     alcance:300, retroceso:5.0,
                 explosivo:{ potencia:16000, radio:11 } },
};

export class Arma {
  constructor(juego, id) {
    this.juego = juego;
    this.id = id;
    this.def = ARMAS[id];
    this.nombre = this.def.nombre;
    this.descripcion = this.def.nombre;
    this.tEspera = 0;
  }

  primario() {
    if (this.tEspera > 0) return;
    this.tEspera = this.def.cadencia;
    const j = this.juego.jugador;
    const f = this.juego.fisica;
    const origen = j.posicionOjos();
    const dir = j.direccion();

    if (this.def.explosivo) {
      // Cohete: impacto instantáneo por raycast y explosión en el punto de impacto. Es un
      // sandbox: lo que importa es la onda expansiva, no la balística del proyectil.
      const h = f.rayo(origen, dir, this.def.alcance);
      const p = h ? h.punto : [origen[0]+dir[0]*this.def.alcance, origen[1]+dir[1]*this.def.alcance, origen[2]+dir[2]*this.def.alcance];
      f.explotar(p, this.def.explosivo.potencia, this.def.explosivo.radio);
      sucesos.emitir('explosion:visual', { posicion: p, radio: this.def.explosivo.radio });
    } else {
      for (let i = 0; i < this.def.perdigones; i++) {
        const d = this._disperso(dir, this.def.dispersion);
        const h = f.rayo(origen, d, this.def.alcance);
        if (!h) continue;
        if (h.id != null) {
          const e = f.entidades.get(h.id);
          if (e && e.cuerpo.isDynamic() && !e.congelado) {
            f.impulso(h.id, [d[0]*this.def.impulso, d[1]*this.def.impulso, d[2]*this.def.impulso], h.punto);
            const m = material(e.material);
            sucesos.emitir('impacto', { idA:h.id, idB:null, materialA:e.material, materialB:'acero',
              momento: this.def.impulso, velocidadRelativa: 40, posicion: h.punto, contactoMaterial:{friccion:0.5, restitucion:0.2} });
            if (this.def.impulso > m.umbralRotura * 0.4) {
              sucesos.emitir('rotura', { id:h.id, material:e.material, momento:this.def.impulso, posicion:h.punto });
            }
          }
        }
        sucesos.emitir('disparo:impacto', { posicion: h.punto, normal: h.normal });
      }
    }
    // Retroceso: la cámara sube y el jugador lo nota.
    j.cabeceo = Math.min(Math.PI/2 - 0.01, j.cabeceo + this.def.retroceso * 0.012);
    sucesos.emitir('disparo', { arma: this.id, posicion: origen });
  }

  secundario() { /* sin modo alternativo por ahora */ }

  _disperso(d, k) {
    if (!k) return d;
    const a = this.juego.azar;
    const x = d[0] + a.simetrico(k), y = d[1] + a.simetrico(k), z = d[2] + a.simetrico(k);
    const l = Math.hypot(x, y, z) || 1;
    return [x/l, y/l, z/l];
  }

  actualizar(dt) { if (this.tEspera > 0) this.tEspera -= dt; }
}
