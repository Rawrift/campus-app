import * as THREE from 'three';
import { Bucle, PASO } from './nucleo/bucle.js';
import { azar } from './nucleo/aleatorio.js';
import { sucesos } from './nucleo/sucesos.js';
import { iniciarRapier, MundoFisico } from './fisica/mundo.js';
import { RELLENO } from './fisica/materiales.js';
import { Renderizador } from './render/renderizador.js';
import { Cielo } from './render/cielo.js';
import { BibliotecaMateriales } from './render/materialesTres.js';
import { Mapa } from './mundo/mapa.js';
import { Jugador } from './jugador/controlador.js';
import { Manipulador } from './jugador/manipulador.js';
import { Hud } from './interfaz/hud.js';
import { instalarApi, Medidor } from './automatizacion/api.js';
import { consolidarEstaticos } from './render/consolidar.js';
import { GestorInstancias } from './render/instancias.js';

const PROPS = {
  caja_madera:  { forma:{clase:'caja', medias:[0.4,0.4,0.4]},               material:'madera',   relleno:RELLENO.cajaTablas, nombre:'Caja de madera' },
  caja_grande:  { forma:{clase:'caja', medias:[0.7,0.7,0.7]},               material:'madera',   relleno:RELLENO.cajaCerrada, nombre:'Caja grande' },
  bidon:        { forma:{clase:'cilindro', mediaAltura:0.45, radio:0.3},    material:'hierroOx', relleno:RELLENO.bidon, nombre:'Bidón' },
  bidon_gasolina:{forma:{clase:'cilindro', mediaAltura:0.45, radio:0.3},    material:'gasolina', relleno:RELLENO.bidon, nombre:'Bidón de gasolina' },
  neumatico:    { forma:{clase:'cilindro', mediaAltura:0.12, radio:0.35},   material:'goma',     relleno:RELLENO.neumatico, nombre:'Neumático' },
  bloque:       { forma:{clase:'caja', medias:[0.2,0.1,0.1]},               material:'hormigon', relleno:1, nombre:'Bloque de hormigón' },
  esfera_acero: { forma:{clase:'esfera', radio:0.18},                       material:'acero',    relleno:1, nombre:'Bola de acero' },
  viga:         { forma:{clase:'caja', medias:[1.6,0.12,0.12]},             material:'acero',    relleno:0.4, nombre:'Viga' },
  tablon:       { forma:{clase:'caja', medias:[1.2,0.04,0.15]},             material:'madera',   relleno:1, nombre:'Tablón' },
  placa_vidrio: { forma:{clase:'caja', medias:[0.6,0.5,0.02]},              material:'vidrio',   relleno:1, nombre:'Placa de vidrio' },
};

const GEO = new Map();
function geometriaDe(forma) {
  const k = JSON.stringify(forma);
  if (GEO.has(k)) return GEO.get(k);
  let g;
  if (forma.clase === 'caja') g = new THREE.BoxGeometry(forma.medias[0]*2, forma.medias[1]*2, forma.medias[2]*2);
  else if (forma.clase === 'esfera') g = new THREE.SphereGeometry(forma.radio, 20, 14);
  else if (forma.clase === 'cilindro') g = new THREE.CylinderGeometry(forma.radio, forma.radio, forma.mediaAltura*2, 18);
  else g = new THREE.BoxGeometry(1,1,1);
  GEO.set(k, g); return g;
}

class Juego {
  constructor(lienzo, raizHud) {
    this.lienzo = lienzo;
    this.render = new Renderizador(lienzo, { calidad: 'alto' });
    this.hud = new Hud(raizHud);
    this.medidor = new Medidor();
    this.camaraLibre = false;
    this.azar = azar;
    this.instancias = null;        // se crea al iniciar, cuando ya hay escena
    this._resolverListo = null;
    this.listo = new Promise(r => { this._resolverListo = r; });
  }

  async iniciar() {
    await iniciarRapier();
    this.fisica = new MundoFisico();
    this.bib = new BibliotecaMateriales(this.render);
    this.cielo = new Cielo(this.render.renderizador, this.render.escena);
    // 17:06. Sol bajo y cálido, sombras largas: la hora en la que un polígono industrial se
    // ve mejor. NO subir por encima de 17,6: a partir de ahí el sol se acerca al horizonte,
    // deja de proyectar sombras útiles y la escena se aplana.
    this.cielo.fijarHora(17.1);
    if (this.cielo.alturaSolar < 0.12) {
      console.warn('[fragua] sol demasiado bajo, la escena quedará sin sombras útiles');
    }
    // El color del sol se toma del cielo para que luz y fondo concuerden, pero NORMALIZADO:
    // el uniforme del cielo lleva un multiplicador de brillo para el disco solar que, usado
    // como color de luz, saturaba y quemaba la escena.
    const cs = this.cielo.uniformes.uColorSol.value.clone();
    const maxc = Math.max(cs.r, cs.g, cs.b) || 1;
    this.render.sol.color.copy(cs.multiplyScalar(1 / maxc));
    this.render.sol.intensity = 3.4;

    this.mapa = new Mapa(this.render.escena, this.fisica, this.bib);
    await this.mapa.construir();

    // Fusión de la geometría estática. Sin esto el mundo son cientos de mallas sueltas y el
    // navegador se ahoga en llamadas de dibujo antes de tocar un solo triángulo.
    const fus = consolidarEstaticos(this.mapa.raiz);
    console.info(`[fragua] geometría estática: ${fus.antes} mallas -> ${fus.creadas} fusionadas en ${fus.regiones} grupos`);

    this.instancias = new GestorInstancias(this.render.escena);

    this.jugador = new Jugador(this.fisica, this.render.camara);
    this.jugador.teletransportar([0, 2, 22], Math.PI, -0.05);
    this.manipulador = new Manipulador(this.fisica, this.jugador);

    const props = await this.mapa.poblar();
    for (const e of props) this._vincular(e);

    this.bucle = new Bucle({
      simular: (dt) => this.simular(dt),
      dibujar: () => this.dibujar(),
    });
    instalarApi(this);
    this._conectarEntrada();
    this._conectarSucesos();

    // Un par de pasos para asentar antes de mostrar nada: evita el primer fotograma con
    // los objetos flotando o interpenetrados.
    for (let i = 0; i < 12; i++) this.fisica.paso();
    this.sincronizar();
    this.dibujar();
    this.bucle.arrancar();
    this._resolverListo();
    return this;
  }

  _vincular(ent) {
    const forma = ent.meta.forma || this._formaDe(ent);
    const geo = geometriaDe(forma);
    const mat = this._materialDe(ent.material);
    // Todos los props con la misma forma y material comparten una sola llamada de dibujo.
    const clave = JSON.stringify(forma) + '|' + mat.uuid;
    this.instancias.alta(ent.id, clave, geo, mat);
    return null;
  }
  _formaDe(ent) {
    // Reconstruye la forma a partir del colisionador para poder dibujarlo.
    const c = ent.colisionador;
    const t = c.shape.type;
    if (t === 1) { const h = c.halfExtents(); return { clase:'caja', medias:[h.x,h.y,h.z] }; }
    if (t === 0) return { clase:'esfera', radio: c.radius() };
    return { clase:'cilindro', mediaAltura: c.halfHeight?.() ?? 0.4, radio: c.radius?.() ?? 0.3 };
  }
  _materialDe(idMat) {
    this._matCache ??= new Map();
    if (this._matCache.has(idMat)) return this._matCache.get(idMat);
    const m = this.mapa.materiales;
    const tabla = { madera: m.madera, hierroOx: m.oxido, gasolina: m.oxido, acero: m.acero,
                    goma: m.goma, hormigon: m.hormigonViejo, vidrio: m.vidrio, plastico: m.metalPintado };
    const mat = tabla[idMat] || m.hormigon;
    this._matCache.set(idMat, mat);
    return mat;
  }

  generar(idProp, pos = null) {
    const d = PROPS[idProp]; if (!d) return null;
    let p = pos;
    if (!p) {
      const o = this.jugador.posicionOjos(), dir = this.jugador.direccion();
      p = [o[0] + dir[0]*3.5, o[1] + dir[1]*3.5, o[2] + dir[2]*3.5];
    }
    const e = this.fisica.crear({ pos: p, forma: d.forma, material: d.material,
                                  relleno: d.relleno, meta: { prop: idProp } });
    this._vincular(e);
    this.hud.avisar(`Generado: ${d.nombre}`);
    return e.id;
  }

  async escenario(nombre) {
    this.fisica.limpiar({ conservarProtegidos: true });
    this.instancias.vaciar();
    const a = azar.derivar(99);
    if (nombre === 'torre') {
      for (let i = 0; i < 120; i++) {
        const n = Math.floor(i / 12);
        const e = this.fisica.crear({ pos: [(i % 12 - 5.5) * 0.85, 0.42 + n * 0.86, -4],
          forma: PROPS.caja_madera.forma, material: 'madera', relleno: RELLENO.cajaTablas, meta:{prop:'caja_madera'} });
        this._vincular(e);
      }
    } else if (nombre === 'caos') {
      for (let i = 0; i < 600; i++) {
        const k = a.elegir(['caja_madera','bidon','neumatico','bloque','esfera_acero']);
        const d = PROPS[k];
        const e = this.fisica.crear({ pos: [a.simetrico(16), 2 + a.real()*22, a.simetrico(16)],
          forma: d.forma, material: d.material, relleno: d.relleno, meta:{prop:k} });
        this._vincular(e);
      }
    } else {
      const props = await this.mapa.poblar();
      for (const e of props) this._vincular(e);
    }
    for (let i = 0; i < 8; i++) this.fisica.paso();
    this.sincronizar();
  }

  simular(dt) {
    this.jugador.actualizar(dt);
    this.manipulador.actualizar(dt);
    this.fisica.paso();
  }

  sincronizar() {
    if (!this.instancias) return;
    for (const id of [...this.instancias.deEntidad.keys()]) {
      const e = this.fisica.entidades.get(id);
      if (!e) { this.instancias.baja(id); continue; }
      this.instancias.fijar(id, e.cuerpo.translation(), e.cuerpo.rotation());
    }
    this.instancias.confirmar();
  }

  dibujar() {
    const t = performance.now();
    if (this._tAnterior) this.render.adaptar(t - this._tAnterior);
    this._tAnterior = t;
    this.medidor.marcar(t);
    this.sincronizar();
    this.mapa.pedirLuces(this.render.presupuestoLuces);
    this.render.orientarSol(this.cielo.direccionSol, this.render.camara.position);
    this.render.redimensionar();
    this.render.dibujar();
    this._actualizarHud();
  }

  _actualizarHud() {
    if (!this.hud.visible) return;
    const ahora = performance.now();
    if (ahora - (this._tHud || 0) < 220) return;   // por tiempo, no por nº de fotogramas:
    this._tHud = ahora;                            // a 1 fps un contador de 12 no refresca nunca
    const m = this.medidor.leer();
    this.hud.cifras({ entidades: this.fisica.entidades.size, fps: m.fps });
    const h = this.manipulador.apuntado();
    if (h && h.id != null) {
      const e = this.fisica.entidades.get(h.id);
      this.hud.apuntando(!!e && e.cuerpo.isDynamic());
      this.hud.objetivo(e && e.cuerpo.isDynamic()
        ? `${(PROPS[e.meta.prop]?.nombre) || 'Objeto'} · ${e.masa.toFixed(0)} kg${e.congelado ? ' · congelado' : ''}`
        : '');
    } else { this.hud.apuntando(false); this.hud.objetivo(''); }
  }

  _conectarSucesos() {
    sucesos.en('mundo:fugados', ({ n }) => { if (n > 2) this.hud.avisar(`${n} objetos salieron del mundo`); });
  }

  _conectarEntrada() {
    const e = this.jugador.entrada;
    const teclas = { KeyW:'adelante', KeyS:'atras', KeyA:'izquierda', KeyD:'derecha',
                     Space:'saltar', ShiftLeft:'correr', ControlLeft:'agachar' };
    addEventListener('keydown', ev => {
      if (teclas[ev.code]) { e[teclas[ev.code]] = true; ev.preventDefault(); }
      if (ev.code === 'KeyV') { this.jugador.fijarNoclip(!this.jugador.noclip); this.hud.avisar(this.jugador.noclip ? 'Noclip activado' : 'Noclip desactivado'); }
      if (ev.code === 'KeyE') this.manipulador.rotando = true;
      if (ev.code === 'KeyR') { const n = this.manipulador.descongelarTodo(); this.hud.avisar(`${n} objetos descongelados`); }
      if (ev.code === 'KeyT') { this.bucle.escalaTiempo = this.bucle.escalaTiempo < 1 ? 1 : 0.25;
                                this.hud.avisar(this.bucle.escalaTiempo < 1 ? 'Cámara lenta' : 'Velocidad normal'); }
      if (ev.code === 'KeyG') this.generar('caja_madera');
      if (ev.code === 'KeyB') this.generar('bidon_gasolina');
      if (ev.code === 'KeyN') this.generar('esfera_acero');
      if (ev.code === 'KeyH') this.hud.mostrar(!this.hud.visible);
    });
    addEventListener('keyup', ev => {
      if (teclas[ev.code]) e[teclas[ev.code]] = false;
      if (ev.code === 'KeyE') this.manipulador.rotando = false;
    });
    // Mirada: bloqueo de puntero si el navegador lo permite, y si no, arrastre.
    // Dentro de un iframe el bloqueo de puntero puede estar denegado, y sin alternativa el
    // juego quedaría injugable ahí. Con el arrastre funciona en cualquier contexto.
    this.arrastrando = false;
    this.bloqueoDisponible = true;
    this.lienzo.addEventListener('click', () => {
      if (document.pointerLockElement || !this.bloqueoDisponible) return;
      const r = this.lienzo.requestPointerLock?.();
      if (r && typeof r.catch === 'function') {
        r.catch(() => { this.bloqueoDisponible = false; this.hud.avisar('Arrastra con el ratón para mirar'); });
      }
    });
    addEventListener('pointerlockerror', () => {
      this.bloqueoDisponible = false;
      this.hud.avisar('Arrastra con el ratón para mirar');
    });

    const mirarCon = (dx, dy) => {
      if (this.manipulador.rotando && this.manipulador.agarrado != null) this.manipulador.rotar(dx, dy);
      else this.jugador.mirar(dx, dy);
    };
    addEventListener('mousemove', ev => {
      if (document.pointerLockElement) mirarCon(ev.movementX, ev.movementY);
      else if (this.arrastrando) mirarCon(ev.movementX, ev.movementY);
    });
    addEventListener('mousedown', ev => {
      const activo = document.pointerLockElement || !this.bloqueoDisponible;
      if (ev.button === 0) {
        if (!activo) return;
        this.arrastrando = !document.pointerLockElement;
        if (!this.manipulador.agarrar()) this.hud.avisar('Nada que agarrar');
      }
      if (ev.button === 2 && activo) this.manipulador.congelar();
    });
    addEventListener('mouseup', ev => {
      if (ev.button !== 0) return;
      this.arrastrando = false;
      this.manipulador.soltar({ lanzar: 0.9 });
    });
    addEventListener('wheel', ev => { this.manipulador.acercar(-Math.sign(ev.deltaY) * 0.55); }, { passive: true });
    addEventListener('contextmenu', ev => ev.preventDefault());
    addEventListener('resize', () => this.render.redimensionar());
  }
}

const lienzo = document.getElementById('lienzo');
const raizHud = document.getElementById('hud');
const juego = new Juego(lienzo, raizHud);
window.__FRAGUA = juego;
juego.iniciar().then(() => {
  document.getElementById('carga')?.remove();
}).catch(err => {
  console.error(err);
  const c = document.getElementById('carga');
  if (c) c.innerHTML = `<div class="err">Error al iniciar<br><code>${String(err).slice(0,300)}</code></div>`;
});
