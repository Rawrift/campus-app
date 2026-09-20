// Bus de sucesos mínimo. Es lo que permite que los sistemas se crucen sin conocerse:
// la física emite un impacto, y el audio, las partículas, las calcomanías y el fuego
// reaccionan sin que la física sepa que existen. De ahí sale el comportamiento emergente.
export class Sucesos {
  constructor() { this._oyentes = new Map(); }
  en(tipo, fn) {
    if (!this._oyentes.has(tipo)) this._oyentes.set(tipo, new Set());
    this._oyentes.get(tipo).add(fn);
    return () => this._oyentes.get(tipo)?.delete(fn);
  }
  emitir(tipo, datos) {
    const s = this._oyentes.get(tipo);
    if (!s) return;
    // Un oyente que falla no puede tumbar a los demás ni al bucle.
    for (const fn of s) { try { fn(datos); } catch (e) { console.error('[sucesos]', tipo, e); } }
  }
  limpiar() { this._oyentes.clear(); }
}
export const sucesos = new Sucesos();
