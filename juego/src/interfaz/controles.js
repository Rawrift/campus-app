// TABLA DE CONTROLES — FUENTE ÚNICA.
//
// El jugador informó de que "las teclas hacen otras cosas de las que dice". La causa es
// estructural: la ayuda estaba escrita a mano en el HTML y las asignaciones en el código, así
// que al tocar una no se tocaba la otra. Aquí se declaran UNA vez: el juego se ata a esta
// tabla y la pantalla de ayuda se genera a partir de ella. No pueden volver a divergir.

export const ACCIONES = {
  // --- movimiento (estado continuo) ---
  adelante:   { teclas:['KeyW','ArrowUp'],    etiqueta:'Avanzar',            grupo:'Movimiento', continua:true },
  atras:      { teclas:['KeyS','ArrowDown'],  etiqueta:'Retroceder',         grupo:'Movimiento', continua:true },
  izquierda:  { teclas:['KeyA','ArrowLeft'],  etiqueta:'Izquierda',          grupo:'Movimiento', continua:true },
  derecha:    { teclas:['KeyD','ArrowRight'], etiqueta:'Derecha',            grupo:'Movimiento', continua:true },
  correr:     { teclas:['ShiftLeft','ShiftRight'], etiqueta:'Correr',        grupo:'Movimiento', continua:true },
  agachar:    { teclas:['ControlLeft','KeyC'],etiqueta:'Agacharse',          grupo:'Movimiento', continua:true },
  saltar:     { teclas:['Space'],             etiqueta:'Saltar',             grupo:'Movimiento', continua:true },
  volar:      { teclas:['KeyV'],              etiqueta:'Volar (noclip)',     grupo:'Movimiento' },

  // --- equipo ---
  ranura1:    { teclas:['Digit1'], etiqueta:'Manipulador',   grupo:'Equipo' },
  ranura2:    { teclas:['Digit2'], etiqueta:'Herramienta',   grupo:'Equipo' },
  ranura3:    { teclas:['Digit3'], etiqueta:'Pistola',       grupo:'Equipo' },
  ranura4:    { teclas:['Digit4'], etiqueta:'Escopeta',      grupo:'Equipo' },
  ranura5:    { teclas:['Digit5'], etiqueta:'Fusil',         grupo:'Equipo' },
  ranura6:    { teclas:['Digit6'], etiqueta:'Lanzacohetes',  grupo:'Equipo' },

  // --- menús ---
  menuObjetos:    { teclas:['KeyQ'],   etiqueta:'Menú de objetos',     grupo:'Menús', mantener:true },
  menuHerramienta:{ teclas:['KeyX'],   etiqueta:'Modos de herramienta',grupo:'Menús', mantener:true },
  ayuda:          { teclas:['F1'],     etiqueta:'Ayuda',               grupo:'Menús' },
  pausa:          { teclas:['Escape'], etiqueta:'Menú principal',      grupo:'Menús' },

  // --- acciones ---
  usar:        { teclas:['KeyF'], etiqueta:'Conmutar motores y propulsores', grupo:'Acciones' },
  descongelar: { teclas:['KeyR'], etiqueta:'Descongelar todo',               grupo:'Acciones' },
  camaraLenta: { teclas:['KeyT'], etiqueta:'Cámara lenta',                   grupo:'Acciones' },
  limpiar:     { teclas:['KeyZ'], etiqueta:'Vaciar objetos generados',       grupo:'Acciones' },
  ocultarHud:  { teclas:['KeyH'], etiqueta:'Ocultar interfaz',               grupo:'Acciones' },
};

/** Las del ratón se documentan aparte porque no son teclas. */
export const RATON = [
  { grupo:'Ratón', etiqueta:'Mirar',                       boton:'Mover el ratón' },
  { grupo:'Ratón', etiqueta:'Acción principal',            boton:'Clic izquierdo' },
  { grupo:'Ratón', etiqueta:'Acción secundaria',           boton:'Clic derecho' },
  { grupo:'Ratón', etiqueta:'Acercar o alejar lo agarrado',boton:'Rueda' },
  { grupo:'Ratón', etiqueta:'Rotar lo agarrado',           boton:'Mantener E y mover el ratón' },
];

/** Índice tecla -> acción, construido una vez. */
export const PORTECLA = (() => {
  const m = new Map();
  for (const [accion, def] of Object.entries(ACCIONES)) {
    for (const t of def.teclas) m.set(t, accion);
  }
  return m;
})();

/** Nombre legible de un código de tecla, en español. */
export function nombreTecla(code) {
  const especiales = {
    Space:'Espacio', ShiftLeft:'Shift', ShiftRight:'Shift', ControlLeft:'Ctrl', ControlRight:'Ctrl',
    Escape:'Esc', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', Tab:'Tab', F1:'F1',
  };
  if (especiales[code]) return especiales[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/**
 * Texto corto de las teclas de una acción, p. ej. "W / ↑".
 * Se eliminan duplicados: ShiftLeft y ShiftRight se llaman los dos "Shift", y mostrar
 * "Shift / Shift" queda mal y no informa de nada.
 */
export function teclasDe(accion) {
  const def = ACCIONES[accion];
  if (!def) return '';
  return [...new Set(def.teclas.map(nombreTecla))].join(' / ');
}

/** Genera la ayuda agrupada, para que la pantalla no repita literales. */
export function ayudaAgrupada() {
  const grupos = new Map();
  for (const [id, def] of Object.entries(ACCIONES)) {
    if (!grupos.has(def.grupo)) grupos.set(def.grupo, []);
    grupos.get(def.grupo).push({ teclas: teclasDe(id), etiqueta: def.etiqueta,
                                 nota: def.mantener ? 'mantener' : '' });
  }
  const raton = [];
  for (const r of RATON) raton.push({ teclas: r.boton, etiqueta: r.etiqueta, nota: '' });
  grupos.set('Ratón', raton);
  return grupos;
}

/** Todas las teclas que el juego consume, para poder impedir que el navegador las use. */
export const TECLAS_DEL_JUEGO = new Set([...PORTECLA.keys(), 'KeyE']);
