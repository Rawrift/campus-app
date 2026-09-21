// MENÚS: objetos (Q), modos de herramienta (X), ayuda (F1) y menú principal (Esc).
// Todo el texto en español. Se generan desde datos, nunca con literales repetidos.

import { ayudaAgrupada } from './controles.js';

const CATEGORIAS = [
  { id:'construccion', nombre:'Construcción', props:['caja_madera','caja_grande','tablon','viga','placa_vidrio','bloque'] },
  { id:'chatarra',     nombre:'Chatarra',     props:['bidon','neumatico','pale','ordenador'] },
  { id:'explosivos',   nombre:'Explosivos',   props:['bidon_gasolina','barril_explosivo'] },
  { id:'pesados',      nombre:'Pesados',      props:['esfera_acero','yunque','hormigonera'] },
];

export class Menus {
  constructor(raiz, juego) {
    this.raiz = raiz;
    this.juego = juego;
    this.abierto = null;
    raiz.innerHTML = `
      <div class="capa" id="m-objetos" hidden>
        <div class="panel">
          <h2>Objetos</h2>
          <div class="cats" id="m-cats"></div>
          <div class="rejilla" id="m-rejilla"></div>
          <p class="pie">Haz clic para generar · suelta <b>Q</b> para cerrar</p>
        </div>
      </div>
      <div class="capa" id="m-herramienta" hidden>
        <div class="panel estrecho">
          <h2>Herramienta</h2>
          <div class="lista" id="m-modos"></div>
          <p class="pie">Haz clic para elegir · suelta <b>X</b> para cerrar</p>
        </div>
      </div>
      <div class="capa" id="m-ayuda" hidden>
        <div class="panel ancho">
          <h2>Controles</h2>
          <div class="ayuda-cols" id="m-ayuda-cols"></div>
          <p class="pie">Pulsa <b>F1</b> o <b>Esc</b> para cerrar</p>
        </div>
      </div>
      <div class="capa oscura" id="m-principal" hidden>
        <div class="panel estrecho centrado">
          <h1 class="marca">FRAGUA</h1>
          <button class="btn" data-accion="seguir">Seguir jugando</button>
          <button class="btn" data-accion="ayuda">Controles</button>
          <div class="calidad">
            <span>Calidad</span>
            <div class="segmentos" id="m-calidad"></div>
          </div>
          <button class="btn sutil" data-accion="reiniciar">Reiniciar escena</button>
        </div>
      </div>`;
    this._montarObjetos();
    this._montarModos();
    this._montarAyuda();
    this._montarPrincipal();
  }

  _q(id) { return this.raiz.querySelector('#' + id); }

  _montarObjetos() {
    const cats = this._q('m-cats');
    const rej = this._q('m-rejilla');
    this.categoria = CATEGORIAS[0].id;
    const pintar = () => {
      cats.innerHTML = '';
      for (const c of CATEGORIAS) {
        const b = document.createElement('button');
        b.className = 'cat' + (c.id === this.categoria ? ' activa' : '');
        b.textContent = c.nombre;
        b.onclick = () => { this.categoria = c.id; pintar(); };
        cats.appendChild(b);
      }
      const c = CATEGORIAS.find(x => x.id === this.categoria);
      rej.innerHTML = '';
      for (const p of c.props) {
        const def = this.juego.propDef(p);
        if (!def) continue;
        const b = document.createElement('button');
        b.className = 'celda';
        b.innerHTML = `<span class="ico" style="--c:${def.color || '#8a7a63'}"></span>
                       <span class="nom">${def.nombre}</span>
                       <span class="masa">${def.masaAprox} kg</span>`;
        b.onclick = () => { this.juego.generar(p); };
        rej.appendChild(b);
      }
    };
    pintar();
  }

  _montarModos() {
    const l = this._q('m-modos');
    l.innerHTML = '';
    for (const m of this.juego.modosHerramienta()) {
      const b = document.createElement('button');
      b.className = 'fila';
      b.innerHTML = `<b>${m.nombre}</b><span>${m.ayuda}</span>`;
      b.onclick = () => { this.juego.fijarModoHerramienta(m.id); this.cerrar(); };
      l.appendChild(b);
    }
  }

  _montarAyuda() {
    const cols = this._q('m-ayuda-cols');
    cols.innerHTML = '';
    for (const [grupo, filas] of ayudaAgrupada()) {
      const d = document.createElement('div');
      d.className = 'ayuda-grupo';
      d.innerHTML = `<h3>${grupo}</h3>` + filas.map(f =>
        `<div class="ayuda-fila"><kbd>${f.teclas}</kbd><span>${f.etiqueta}${f.nota ? ' <i>('+f.nota+')</i>' : ''}</span></div>`
      ).join('');
      cols.appendChild(d);
    }
  }

  _montarPrincipal() {
    const p = this._q('m-principal');
    p.querySelectorAll('[data-accion]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.accion;
        if (a === 'seguir') this.cerrar();
        else if (a === 'ayuda') this.abrir('ayuda');
        else if (a === 'reiniciar') { this.juego.escenario('inicio'); this.cerrar(); }
      };
    });
    const seg = this._q('m-calidad');
    for (const c of ['bajo','medio','alto','ultra']) {
      const b = document.createElement('button');
      b.textContent = c[0].toUpperCase() + c.slice(1);
      b.className = 'seg' + (this.juego.render.nombreCalidad === c ? ' activa' : '');
      b.onclick = () => {
        this.juego.render.fijarCalidad(c);
        seg.querySelectorAll('.seg').forEach(x => x.classList.remove('activa'));
        b.classList.add('activa');
        this.juego.hud.avisar(`Calidad: ${b.textContent}`);
      };
      seg.appendChild(b);
    }
  }

  abrir(cual) {
    this.cerrar();
    const id = { objetos:'m-objetos', herramienta:'m-herramienta', ayuda:'m-ayuda', principal:'m-principal' }[cual];
    if (!id) return;
    this._q(id).hidden = false;
    this.abierto = cual;
    this.raiz.style.pointerEvents = 'auto';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  cerrar() {
    for (const id of ['m-objetos','m-herramienta','m-ayuda','m-principal']) this._q(id).hidden = true;
    this.abierto = null;
    this.raiz.style.pointerEvents = 'none';
  }

  alternar(cual) { this.abierto === cual ? this.cerrar() : this.abrir(cual); }
  get hayMenu() { return this.abierto !== null; }
}
