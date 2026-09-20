// Propiedades fisicas por material. Las leen TODOS los sistemas del juego
// (masa, friccion, fuego, electricidad, rotura, audio de impacto).
//
//  densidad       kg/m3 reales -> la masa sale de densidad * volumen
//  friccion       coeficiente de rozamiento dinamico aproximado
//  restitucion    0 = no rebota, 1 = rebote elastico
//  dureza         0..1  resistencia a la abolladura / penetracion
//  inflamabilidad 0..1  0 = incombustible, 1 = prende de inmediato
//  conductividad  0..1  electrica (y termica, aproximada)
//  fragilidad     0..1  0 = se deforma sin romper, 1 = estalla en fragmentos
//  sonidoImpacto  parametros para sintetizar el golpe en WebAudio:
//                 tipo (familia), frecuencia (Hz del modo fundamental),
//                 decaimiento (s), brillo (0..1 contenido de armonicos),
//                 ruido (0..1 componente no tonal)
//  rotura         como se comporta al superar el umbral de impulso

const s = (tipo, frecuencia, decaimiento, brillo, ruido) =>
  ({ tipo, frecuencia, decaimiento, brillo, ruido });

export const FISICA = {
  hormigon_liso:        { densidad: 2350, friccion: 0.72, restitucion: 0.12, dureza: 0.78,
                          inflamabilidad: 0.00, conductividad: 0.02, fragilidad: 0.55,
                          rotura: 'desconchar', sonidoImpacto: s('hormigon', 180, 0.16, 0.22, 0.72) },
  hormigon_rugoso:      { densidad: 2320, friccion: 0.88, restitucion: 0.10, dureza: 0.76,
                          inflamabilidad: 0.00, conductividad: 0.02, fragilidad: 0.58,
                          rotura: 'desconchar', sonidoImpacto: s('hormigon', 172, 0.15, 0.20, 0.78) },
  hormigon_desconchado: { densidad: 2280, friccion: 0.90, restitucion: 0.09, dureza: 0.62,
                          inflamabilidad: 0.00, conductividad: 0.03, fragilidad: 0.70,
                          rotura: 'fragmentar', sonidoImpacto: s('hormigon', 158, 0.14, 0.24, 0.80) },
  asfalto:              { densidad: 2240, friccion: 0.95, restitucion: 0.06, dureza: 0.48,
                          inflamabilidad: 0.18, conductividad: 0.01, fragilidad: 0.30,
                          rotura: 'agrietar',  sonidoImpacto: s('sordo', 120, 0.10, 0.10, 0.88) },
  asfalto_mojado:       { densidad: 2260, friccion: 0.42, restitucion: 0.05, dureza: 0.48,
                          inflamabilidad: 0.04, conductividad: 0.25, fragilidad: 0.30,
                          rotura: 'agrietar',  sonidoImpacto: s('sordo', 112, 0.09, 0.08, 0.92) },

  metal_pintado:        { densidad: 7800, friccion: 0.45, restitucion: 0.34, dureza: 0.88,
                          inflamabilidad: 0.05, conductividad: 0.86, fragilidad: 0.10,
                          rotura: 'abollar',   sonidoImpacto: s('metal', 620, 0.70, 0.78, 0.18) },
  metal_oxidado:        { densidad: 7650, friccion: 0.68, restitucion: 0.22, dureza: 0.66,
                          inflamabilidad: 0.00, conductividad: 0.40, fragilidad: 0.34,
                          rotura: 'abollar',   sonidoImpacto: s('metal', 480, 0.38, 0.52, 0.42) },
  acero_cepillado:      { densidad: 7850, friccion: 0.38, restitucion: 0.42, dureza: 0.94,
                          inflamabilidad: 0.00, conductividad: 0.96, fragilidad: 0.08,
                          rotura: 'abollar',   sonidoImpacto: s('metal', 780, 0.95, 0.90, 0.10) },
  chapa_ondulada:       { densidad: 7200, friccion: 0.50, restitucion: 0.30, dureza: 0.70,
                          inflamabilidad: 0.00, conductividad: 0.80, fragilidad: 0.14,
                          rotura: 'abollar',   sonidoImpacto: s('chapa', 340, 1.20, 0.95, 0.24) },
  aluminio_rayado:      { densidad: 2700, friccion: 0.42, restitucion: 0.36, dureza: 0.62,
                          inflamabilidad: 0.02, conductividad: 0.92, fragilidad: 0.12,
                          rotura: 'abollar',   sonidoImpacto: s('metal', 900, 0.55, 0.82, 0.16) },
  oxido_fuerte:         { densidad: 5300, friccion: 0.82, restitucion: 0.10, dureza: 0.34,
                          inflamabilidad: 0.00, conductividad: 0.08, fragilidad: 0.62,
                          rotura: 'desmenuzar',sonidoImpacto: s('sordo', 260, 0.16, 0.30, 0.74) },
  pintura_desgastada:   { densidad: 7750, friccion: 0.52, restitucion: 0.30, dureza: 0.82,
                          inflamabilidad: 0.08, conductividad: 0.70, fragilidad: 0.14,
                          rotura: 'abollar',   sonidoImpacto: s('metal', 560, 0.58, 0.70, 0.26) },

  madera_tabla:         { densidad:  520, friccion: 0.58, restitucion: 0.28, dureza: 0.40,
                          inflamabilidad: 0.78, conductividad: 0.02, fragilidad: 0.42,
                          rotura: 'astillar',  sonidoImpacto: s('madera', 300, 0.24, 0.42, 0.46) },
  madera_contrachapado: { densidad:  600, friccion: 0.54, restitucion: 0.24, dureza: 0.36,
                          inflamabilidad: 0.82, conductividad: 0.02, fragilidad: 0.52,
                          rotura: 'delaminar', sonidoImpacto: s('madera', 380, 0.18, 0.50, 0.52) },
  madera_pale:          { densidad:  470, friccion: 0.72, restitucion: 0.22, dureza: 0.30,
                          inflamabilidad: 0.88, conductividad: 0.02, fragilidad: 0.56,
                          rotura: 'astillar',  sonidoImpacto: s('madera', 260, 0.20, 0.38, 0.58) },

  vidrio_sucio:         { densidad: 2500, friccion: 0.28, restitucion: 0.30, dureza: 0.86,
                          inflamabilidad: 0.00, conductividad: 0.01, fragilidad: 0.98,
                          rotura: 'estallar',  sonidoImpacto: s('vidrio', 1450, 0.42, 0.96, 0.22) },
  goma:                 { densidad: 1150, friccion: 1.15, restitucion: 0.78, dureza: 0.18,
                          inflamabilidad: 0.62, conductividad: 0.00, fragilidad: 0.04,
                          rotura: 'deformar',  sonidoImpacto: s('goma', 90, 0.08, 0.06, 0.66) },
  plastico:             { densidad:  980, friccion: 0.40, restitucion: 0.46, dureza: 0.44,
                          inflamabilidad: 0.70, conductividad: 0.00, fragilidad: 0.48,
                          rotura: 'fundir',    sonidoImpacto: s('plastico', 700, 0.14, 0.60, 0.40) },
  lona:                 { densidad:  420, friccion: 0.66, restitucion: 0.08, dureza: 0.08,
                          inflamabilidad: 0.74, conductividad: 0.00, fragilidad: 0.20,
                          rotura: 'rasgar',    sonidoImpacto: s('tela', 150, 0.06, 0.12, 0.94) },
  carton:               { densidad:  180, friccion: 0.60, restitucion: 0.12, dureza: 0.06,
                          inflamabilidad: 0.92, conductividad: 0.00, fragilidad: 0.30,
                          rotura: 'aplastar',  sonidoImpacto: s('carton', 220, 0.07, 0.24, 0.86) },

  tierra:               { densidad: 1550, friccion: 0.92, restitucion: 0.04, dureza: 0.14,
                          inflamabilidad: 0.06, conductividad: 0.10, fragilidad: 0.10,
                          rotura: 'desmenuzar',sonidoImpacto: s('sordo', 95, 0.07, 0.05, 0.96) },
  grava:                { densidad: 1700, friccion: 0.98, restitucion: 0.12, dureza: 0.60,
                          inflamabilidad: 0.00, conductividad: 0.02, fragilidad: 0.20,
                          rotura: 'dispersar', sonidoImpacto: s('grava', 320, 0.09, 0.40, 0.90) },
  ladrillo:             { densidad: 1900, friccion: 0.80, restitucion: 0.14, dureza: 0.66,
                          inflamabilidad: 0.00, conductividad: 0.02, fragilidad: 0.68,
                          rotura: 'fragmentar',sonidoImpacto: s('ceramica', 420, 0.20, 0.55, 0.58) },
  yeso:                 { densidad:  950, friccion: 0.70, restitucion: 0.08, dureza: 0.22,
                          inflamabilidad: 0.04, conductividad: 0.02, fragilidad: 0.86,
                          rotura: 'pulverizar',sonidoImpacto: s('yeso', 280, 0.10, 0.28, 0.82) }
};

/** Propiedades fisicas de un material del catalogo. Devuelve una copia. */
export function fisicaDe (nombre) {
  const f = FISICA[nombre];
  if (!f) throw new Error(`[materiales] material desconocido: ${nombre}`);
  return { ...f, sonidoImpacto: { ...f.sonidoImpacto } };
}

/** Masa en kg de un volumen dado (m3) para un material. */
export function masaDe (nombre, volumenM3) {
  return FISICA[nombre].densidad * volumenM3;
}
