// TABLA DE MATERIALES SISTÉMICOS — única fuente de verdad del juego.
//
// Esta tabla no es "datos de física": la leen TODOS los sistemas (física, audio, VFX, fuego,
// electricidad, flotación, destrucción). Es lo que hace que las interacciones se crucen solas.
// Un bidón de gasolina junto a una hoguera explota porque su material es inflamable y tiene
// energía almacenada, no porque nadie escribiera ese caso.
//
// densidad      kg/m3 (el agua es 1000: por debajo flota)
// friccion      coeficiente de Coulomb
// restitucion   0 = plastilina, 1 = pelota perfecta
// dureza        0..1, resistencia a la deformación; alto = abolla poco y transmite el golpe
// fragilidad    0..1, probabilidad de fracturarse al superar el umbral de impulso
// inflamable    0..1, facilidad de prender
// conductividad 0..1, para el grafo eléctrico
// umbralRotura  impulso (N·s) por encima del cual el objeto se rompe si es frágil
// timbre        familia sonora para el motor de audio
// energia       MJ liberados si detona (0 = no explosivo)

export const MATERIALES = {
  hormigon:  { nombre:'hormigón',     densidad:2400, friccion:0.85, restitucion:0.10, dureza:0.85,
               fragilidad:0.25, inflamable:0.00, conductividad:0.02, umbralRotura:2600, timbre:'piedra',  energia:0 },
  ladrillo:  { nombre:'ladrillo',     densidad:1900, friccion:0.80, restitucion:0.08, dureza:0.70,
               fragilidad:0.45, inflamable:0.00, conductividad:0.02, umbralRotura:1500, timbre:'piedra',  energia:0 },
  acero:     { nombre:'acero',        densidad:7850, friccion:0.55, restitucion:0.35, dureza:0.95,
               fragilidad:0.02, inflamable:0.00, conductividad:1.00, umbralRotura:9000, timbre:'metal',   energia:0 },
  aluminio:  { nombre:'aluminio',     densidad:2700, friccion:0.50, restitucion:0.30, dureza:0.55,
               fragilidad:0.05, inflamable:0.00, conductividad:0.95, umbralRotura:3200, timbre:'metal',   energia:0 },
  hierroOx:  { nombre:'hierro oxidado',densidad:7200,friccion:0.70, restitucion:0.18, dureza:0.60,
               fragilidad:0.20, inflamable:0.00, conductividad:0.60, umbralRotura:2400, timbre:'metalSordo',energia:0 },
  madera:    { nombre:'madera',       densidad: 620, friccion:0.62, restitucion:0.22, dureza:0.35,
               fragilidad:0.35, inflamable:0.75, conductividad:0.01, umbralRotura: 900, timbre:'madera',  energia:0 },
  contrachapado:{nombre:'contrachapado',densidad:480,friccion:0.58, restitucion:0.20, dureza:0.25,
               fragilidad:0.55, inflamable:0.85, conductividad:0.01, umbralRotura: 520, timbre:'madera',  energia:0 },
  vidrio:    { nombre:'vidrio',       densidad:2500, friccion:0.40, restitucion:0.25, dureza:0.75,
               fragilidad:0.95, inflamable:0.00, conductividad:0.00, umbralRotura: 260, timbre:'vidrio',  energia:0 },
  goma:      { nombre:'goma',         densidad:1100, friccion:1.05, restitucion:0.72, dureza:0.15,
               fragilidad:0.05, inflamable:0.55, conductividad:0.00, umbralRotura:4000, timbre:'goma',    energia:0 },
  plastico:  { nombre:'plástico',     densidad: 950, friccion:0.45, restitucion:0.40, dureza:0.30,
               fragilidad:0.40, inflamable:0.60, conductividad:0.00, umbralRotura: 700, timbre:'plastico',energia:0 },
  carton:    { nombre:'cartón',       densidad: 180, friccion:0.55, restitucion:0.05, dureza:0.05,
               fragilidad:0.70, inflamable:0.95, conductividad:0.00, umbralRotura: 120, timbre:'carton',  energia:0 },
  tela:      { nombre:'lona',         densidad: 300, friccion:0.75, restitucion:0.02, dureza:0.05,
               fragilidad:0.30, inflamable:0.80, conductividad:0.00, umbralRotura: 200, timbre:'tela',    energia:0 },
  hielo:     { nombre:'hielo',        densidad: 917, friccion:0.06, restitucion:0.15, dureza:0.40,
               fragilidad:0.80, inflamable:0.00, conductividad:0.05, umbralRotura: 400, timbre:'vidrio',  energia:0 },
  // Explosivos: energía > 0. El sistema de calor los detona sin ningún caso especial escrito.
  gasolina:  { nombre:'bidón de gasolina',densidad:740,friccion:0.60,restitucion:0.15, dureza:0.30,
               fragilidad:0.50, inflamable:1.00, conductividad:0.30, umbralRotura: 600, timbre:'metalSordo',energia:14 },
  explosivo: { nombre:'explosivo',    densidad:1600, friccion:0.60, restitucion:0.10, dureza:0.35,
               fragilidad:0.40, inflamable:0.90, conductividad:0.05, umbralRotura: 800, timbre:'plastico',energia:32 },
};

/** Devuelve el material o hormigón si el nombre no existe, para que nada reviente por un typo. */
export function material(id) { return MATERIALES[id] || MATERIALES.hormigon; }

/**
 * Masa a partir del volumen y del FACTOR DE RELLENO.
 *
 * Cuidado con el error fácil: casi ningún objeto del mundo es macizo. Una caja de madera de
 * 0,8 m maciza pesaría 317 kg, que es absurdo; una caja real son tablas de 2 cm alrededor de
 * aire, y pesa unos 30 kg. Un bidón es chapa de 1 mm. Modelar todo como sólido rompe por
 * completo la sensación de peso, que es justo el pilar del juego.
 *
 * relleno = fracción del volumen que es material (1 = macizo).
 */
export function masaDe(id, volumenM3, relleno = 1) {
  return material(id).densidad * volumenM3 * relleno;
}

/** Masa de un objeto hueco a partir de su superficie y el espesor de pared. Más honesto aún. */
export function masaCascara(id, areaM2, espesorM) {
  return material(id).densidad * areaM2 * espesorM;
}

/** Factores de relleno típicos, para que los props no los inventen cada uno por su cuenta. */
export const RELLENO = {
  macizo: 1.0,
  cajaTablas: 0.09,   // caja de madera con tablas y huecos
  cajaCerrada: 0.16,  // caja cerrada de tablón
  bidon: 0.009,       // bidón de 200 L: chapa de ~1,2 mm sobre ~1,9 m2 -> unos 18 kg, no 100
  tuberia: 0.22,
  neumatico: 0.085,   // el neumático es sobre todo aire: la goma es una carcasa delgada
  chapa: 1.0,
  mueble: 0.30,
};

/**
 * Fricción y restitución del CONTACTO entre dos materiales.
 * Rapier combina por defecto con una media; aquí lo hacemos explícito porque el juego
 * necesita que goma-hormigón agarre y hielo-acero resbale, no un promedio insulso.
 */
export function contacto(idA, idB) {
  const a = material(idA), b = material(idB);
  return {
    friccion: Math.sqrt(a.friccion * b.friccion),          // media geométrica: un resbaladizo manda
    restitucion: Math.max(a.restitucion, b.restitucion) * 0.9, // el más elástico domina el rebote
  };
}

/** ¿Flota en agua? Emerge de la densidad, no de una lista de objetos flotantes. */
export function flota(id) { return material(id).densidad < 1000; }
