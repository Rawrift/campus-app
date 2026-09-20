// HUD. Mínimo y limpio: la referencia de interfaz NO es Garry's Mod, es un juego moderno.
// Todo el texto en español.
export class Hud {
  constructor(raiz) {
    this.raiz = raiz;
    this.visible = true;
    raiz.innerHTML = `
      <div class="retic"><span class="p"></span></div>
      <div class="inf-izq">
        <div class="herr" id="hud-herramienta">Manipulador</div>
        <div class="sub" id="hud-modo"></div>
      </div>
      <div class="inf-der">
        <div class="lin"><b id="hud-ent">0</b> entidades</div>
        <div class="lin"><b id="hud-fps">0</b> fps</div>
      </div>
      <div class="aviso" id="hud-aviso"></div>
      <div class="objetivo" id="hud-objetivo"></div>`;
    this.q = id => raiz.querySelector('#' + id);
    this._avisoT = 0;
  }
  herramienta(nombre, modo = '') {
    this.q('hud-herramienta').textContent = nombre;
    this.q('hud-modo').textContent = modo;
  }
  objetivo(texto) {
    const e = this.q('hud-objetivo');
    e.textContent = texto || '';
    e.style.opacity = texto ? '1' : '0';
  }
  avisar(texto, ms = 2200) {
    const e = this.q('hud-aviso');
    e.textContent = texto; e.style.opacity = '1';
    clearTimeout(this._avisoT);
    this._avisoT = setTimeout(() => { e.style.opacity = '0'; }, ms);
  }
  cifras({ entidades, fps }) {
    this.q('hud-ent').textContent = entidades;
    this.q('hud-fps').textContent = Math.round(fps);
  }
  apuntando(si) { this.raiz.querySelector('.retic').classList.toggle('activa', !!si); }
  mostrar(si) { this.visible = si; this.raiz.style.display = si ? '' : 'none'; }
}
