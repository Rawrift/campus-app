// @fragua/materiales — biblioteca de materiales PBR procedurales.
// Sin dependencias de ningun motor 3D: la salida son ImageBitmap/Canvas y datos.
//
//   import { crearMaterial, MATERIALES } from './src/index.js';
//   const m = await crearMaterial('hormigon_rugoso', { resolucion: 1024, semilla: 7, escala: 2 });
//   m.albedo, m.normal, m.rugosidad, m.metalico, m.oclusion, m.altura   // teselables
//   m.fisica.densidad, m.fisica.friccion, ...

import { Motor } from './motor.js';
import { MATERIALES, CALCOMANIAS, NOMBRES, NOMBRES_CALCOMANIAS } from './catalogo.js';
import { FISICA, fisicaDe, masaDe } from './fisica.js';

export { MATERIALES, CALCOMANIAS, NOMBRES, NOMBRES_CALCOMANIAS, FISICA, fisicaDe, masaDe };

let motor = null;
function obtenerMotor (opciones) {
  if (!motor) motor = new Motor(opciones);
  return motor;
}

/** Semilla entera -> desplazamiento no entero del campo de ruido. Determinista. */
function semillaA2 (semilla) {
  let h = (semilla >>> 0) || 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  const a = (h >>> 0) / 4294967296;
  let g = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
  g = Math.imul(g ^ (g >>> 15), 2246822507) >>> 0;
  const b = (g >>> 0) / 4294967296;
  return [a * 617.31 + 0.137, b * 431.77 + 0.913];
}

function normalizarResolucion (r) {
  const n = Math.max(64, Math.min(4096, Math.round(r || 1024)));
  return 1 << Math.round(Math.log2(n));       // potencia de dos: mipmaps limpios
}

/**
 * Genera un material del catalogo.
 * @param {string} nombre     clave del catalogo (ver NOMBRES)
 * @param {object} [opts]
 * @param {number} [opts.resolucion=1024]  lado en pixeles (potencia de 2)
 * @param {number} [opts.semilla=0]        determinista: misma semilla, misma imagen
 * @param {number} [opts.escala=1]         repeticiones del patron dentro del tile (entero)
 * @param {string} [opts.formato]          'bitmap' (por defecto) o 'canvas'
 * @param {object} [opts.uniformes]        sobrescribe uniformes de la receta (p. ej. uPintura)
 * @param {number} [opts.relieve]          altura pico-a-pico en metros
 */
export async function crearMaterial (nombre, opts = {}) {
  const meta = MATERIALES[nombre];
  if (!meta) throw new Error(`[materiales] material desconocido: "${nombre}". Disponibles: ${NOMBRES.join(', ')}`);

  const resolucion = normalizarResolucion(opts.resolucion ?? 1024);
  const escala = Math.max(1, Math.round(opts.escala ?? meta.escala ?? 1));
  const semilla = opts.semilla ?? 0;
  const [semX, semY] = semillaA2(semilla);

  const m = obtenerMotor(opts.motor);
  m.iniciar();
  // el detalle mas fino se atenua cuando un texel deja de resolverlo
  const uMicro = Math.max(0.25, Math.min(1, resolucion / (1024 * escala)));

  const cfg = {
    resolucion, escala, semX, semY,
    tamano: meta.tamano,
    relieve: opts.relieve ?? meta.relieve,
    aoRadio: meta.aoRadio, aoFuerza: meta.aoFuerza, curvGanancia: meta.curvGan,
    suciedad: meta.suciedad, borde: meta.borde, bordeColor: meta.bordeColor,
    formato: opts.formato || 'bitmap',
    uniformes: { ...meta.uniformes, ...(opts.uniformes || {}), uMicro }
  };

  const mapas = m.generarMaterial(nombre, meta.receta, cfg);

  return {
    nombre, etiqueta: meta.etiqueta, grupo: meta.grupo,
    resolucion, semilla, escala,
    ...mapas,
    fisica: fisicaDe(nombre),
    ajustes: { tamano: meta.tamano, relieve: cfg.relieve, teselable: true }
  };
}

/**
 * Genera una calcomania RGBA (impactos, quemaduras, manchas...).
 * Devuelve { color, normal, ard } donde `ard` empaqueta (oclusion, rugosidad, metalico)
 * en R,G,B y repite el alfa de la calcomania en A.
 */
export async function crearCalcomania (nombre, opts = {}) {
  const meta = CALCOMANIAS[nombre];
  if (!meta) throw new Error(`[materiales] calcomania desconocida: "${nombre}". Disponibles: ${NOMBRES_CALCOMANIAS.join(', ')}`);

  const resolucion = normalizarResolucion(opts.resolucion ?? meta.resolucion);
  const semilla = opts.semilla ?? 0;
  const [semX, semY] = semillaA2(semilla);
  const m = obtenerMotor(opts.motor);
  m.iniciar();

  const cfg = {
    resolucion, escala: 1, semX, semY,
    relieve: opts.relieve ?? meta.relieve,
    formato: opts.formato || 'bitmap',
    uniformes: { ...(opts.uniformes || {}), uMicro: Math.max(0.25, Math.min(1, resolucion / 512)) }
  };
  const mapas = m.generarCalco(nombre, meta.receta, cfg);
  return { nombre, etiqueta: meta.etiqueta, resolucion, semilla, ...mapas };
}

/** Genera todo el catalogo reutilizando los mismos buffers. */
export async function crearBiblioteca (opts = {}) {
  const salida = new Map();
  for (const nombre of NOMBRES) salida.set(nombre, await crearMaterial(nombre, opts));
  return salida;
}

export async function crearCalcomanias (opts = {}) {
  const salida = new Map();
  for (const nombre of NOMBRES_CALCOMANIAS) salida.set(nombre, await crearCalcomania(nombre, opts));
  return salida;
}

export function listarMateriales () {
  return NOMBRES.map(n => ({ nombre: n, etiqueta: MATERIALES[n].etiqueta, grupo: MATERIALES[n].grupo }));
}
export function listarCalcomanias () {
  return NOMBRES_CALCOMANIAS.map(n => ({ nombre: n, etiqueta: CALCOMANIAS[n].etiqueta }));
}

/** Estadisticas de generacion (para depuracion y presupuesto de carga). */
export function estadisticas () {
  return motor ? { ...motor.estadisticas } : { materiales: 0, msGenerado: 0 };
}

/** Libera el contexto WebGL2 y todos los buffers. */
export function liberar () {
  if (motor) { motor.liberar(); motor = null; }
}
