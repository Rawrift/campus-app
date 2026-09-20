// Catalogo: metadatos de generacion de cada familia.
//
//   tamano       lado del tile en METROS (define la escala fisica del detalle)
//   relieve      altura pico-a-pico en METROS (controla la fuerza de la normal)
//   aoRadio      radio de muestreo de oclusion, en unidades de uv
//   aoFuerza     ganancia de la oclusion
//   curvGan      ganancia de curvatura para el desgaste de canto
//   suciedad     [rugosidadObjetivo, fuerza, umbral, quitaMetal]
//                 lo que se deposita en las CAVIDADES (suciedad, oxido, agua...)
//   borde        [rugosidadObjetivo, metalicoObjetivo, mezclaColor, ganancia]
//                 lo que pasa en los CANTOS convexos (pintura saltada, pulido)
//   bordeColor   color que asoma en el canto desgastado

import * as M from './recetas/mineral.js';
import * as Me from './recetas/metal.js';
import * as Ma from './recetas/madera.js';
import * as Si from './recetas/sintetico.js';
import * as Ca from './recetas/calcomanias.js';

const base = {
  tamano: 1.0, relieve: 0.012, escala: 1, aoRadio: 0.022, aoFuerza: 1.25,
  curvGan: 14, suciedad: [0.92, 0.85, 0.16, 0.85], borde: [0.35, 0.0, 0.0, 1.0],
  bordeColor: [0.5, 0.5, 0.5], uniformes: {}
};
const def = (o) => ({ ...base, ...o });

export const MATERIALES = {
  // ------------------------------------------------------------- minerales
  hormigon_liso: def({
    etiqueta: 'Hormigón liso', grupo: 'mineral', receta: M.hormigon_liso,
    tamano: 2.0, relieve: 0.010, aoRadio: 0.018, aoFuerza: 1.15, curvGan: 10,
    suciedad: [0.95, 0.80, 0.14, 0.0], borde: [0.55, 0.0, 0.18, 0.8],
    bordeColor: [0.68, 0.68, 0.665]
  }),
  hormigon_rugoso: def({
    etiqueta: 'Hormigón rugoso', grupo: 'mineral', receta: M.hormigon_rugoso,
    tamano: 1.6, relieve: 0.020, aoRadio: 0.026, aoFuerza: 1.55, curvGan: 16,
    suciedad: [0.97, 0.95, 0.12, 0.0], borde: [0.62, 0.0, 0.25, 1.1],
    bordeColor: [0.66, 0.645, 0.615]
  }),
  hormigon_desconchado: def({
    etiqueta: 'Hormigón desconchado', grupo: 'mineral', receta: M.hormigon_desconchado,
    tamano: 2.0, relieve: 0.034, aoRadio: 0.030, aoFuerza: 1.70, curvGan: 15,
    suciedad: [0.96, 1.0, 0.10, 0.0], borde: [0.60, 0.0, 0.22, 1.0],
    bordeColor: [0.70, 0.695, 0.68]
  }),
  asfalto: def({
    etiqueta: 'Asfalto', grupo: 'mineral', receta: M.asfalto,
    tamano: 1.4, relieve: 0.016, aoRadio: 0.022, aoFuerza: 1.65, curvGan: 18,
    suciedad: [0.98, 0.70, 0.18, 0.0], borde: [0.72, 0.0, 0.20, 1.2],
    bordeColor: [0.26, 0.255, 0.245]
  }),
  asfalto_mojado: def({
    etiqueta: 'Asfalto mojado', grupo: 'mineral', receta: M.asfalto_mojado,
    tamano: 1.4, relieve: 0.014, aoRadio: 0.022, aoFuerza: 1.30, curvGan: 18,
    // la "suciedad" es AGUA: rellena las cavidades y las deja casi especulares
    suciedad: [0.045, 1.0, 0.10, 0.0], borde: [0.62, 0.0, 0.10, 1.0],
    bordeColor: [0.20, 0.205, 0.215]
  }),
  ladrillo: def({
    etiqueta: 'Ladrillo', grupo: 'mineral', receta: M.ladrillo,
    tamano: 2.0, relieve: 0.024, aoRadio: 0.026, aoFuerza: 1.60, curvGan: 13,
    suciedad: [0.96, 1.0, 0.12, 0.0], borde: [0.68, 0.0, 0.30, 1.1],
    bordeColor: [0.60, 0.395, 0.290]
  }),
  yeso: def({
    etiqueta: 'Yeso', grupo: 'mineral', receta: M.yeso,
    tamano: 2.2, relieve: 0.009, aoRadio: 0.020, aoFuerza: 1.20, curvGan: 11,
    suciedad: [0.94, 0.85, 0.15, 0.0], borde: [0.72, 0.0, 0.25, 0.9],
    bordeColor: [0.80, 0.795, 0.775]
  }),
  tierra: def({
    etiqueta: 'Tierra', grupo: 'mineral', receta: M.tierra,
    tamano: 1.2, relieve: 0.030, aoRadio: 0.030, aoFuerza: 1.75, curvGan: 14,
    suciedad: [0.97, 0.80, 0.18, 0.0], borde: [0.90, 0.0, 0.22, 1.0],
    bordeColor: [0.42, 0.335, 0.225]
  }),
  grava: def({
    etiqueta: 'Grava', grupo: 'mineral', receta: M.grava,
    tamano: 1.0, relieve: 0.042, aoRadio: 0.034, aoFuerza: 2.00, curvGan: 16,
    suciedad: [0.98, 1.0, 0.14, 0.0], borde: [0.72, 0.0, 0.26, 1.2],
    bordeColor: [0.58, 0.555, 0.505]
  }),

  // ---------------------------------------------------------------- metal
  metal_pintado: def({
    etiqueta: 'Metal pintado', grupo: 'metal', receta: Me.metal_pintado,
    tamano: 1.2, relieve: 0.008, aoRadio: 0.018, aoFuerza: 1.10, curvGan: 20,
    suciedad: [0.88, 0.70, 0.20, 0.60], borde: [0.20, 1.0, 0.65, 1.6],
    bordeColor: [0.790, 0.795, 0.800],
    uniformes: { uPintura: [0.180, 0.325, 0.420] }        // azul industrial
  }),
  metal_oxidado: def({
    etiqueta: 'Metal oxidado', grupo: 'metal', receta: Me.metal_oxidado,
    tamano: 1.2, relieve: 0.014, aoRadio: 0.022, aoFuerza: 1.55, curvGan: 18,
    suciedad: [0.95, 0.75, 0.18, 0.85], borde: [0.26, 0.85, 0.45, 1.5],
    bordeColor: [0.760, 0.755, 0.750]
  }),
  acero_cepillado: def({
    etiqueta: 'Acero cepillado', grupo: 'metal', receta: Me.acero_cepillado,
    tamano: 0.8, relieve: 0.0035, aoRadio: 0.014, aoFuerza: 0.85, curvGan: 26,
    suciedad: [0.55, 0.45, 0.30, 0.20], borde: [0.11, 1.0, 0.30, 1.8],
    bordeColor: [0.880, 0.885, 0.895]
  }),
  chapa_ondulada: def({
    etiqueta: 'Chapa ondulada', grupo: 'metal', receta: Me.chapa_ondulada,
    tamano: 2.4, relieve: 0.055, aoRadio: 0.030, aoFuerza: 1.45, curvGan: 11,
    suciedad: [0.94, 0.95, 0.14, 0.80], borde: [0.24, 0.95, 0.35, 1.3],
    bordeColor: [0.850, 0.855, 0.860]
  }),
  aluminio_rayado: def({
    etiqueta: 'Aluminio rayado', grupo: 'metal', receta: Me.aluminio_rayado,
    tamano: 0.9, relieve: 0.0045, aoRadio: 0.014, aoFuerza: 0.90, curvGan: 24,
    suciedad: [0.60, 0.45, 0.28, 0.25], borde: [0.14, 1.0, 0.30, 1.7],
    bordeColor: [0.975, 0.978, 0.982]
  }),
  oxido_fuerte: def({
    etiqueta: 'Óxido fuerte', grupo: 'metal', receta: Me.oxido_fuerte,
    tamano: 1.0, relieve: 0.026, aoRadio: 0.028, aoFuerza: 1.85, curvGan: 16,
    suciedad: [0.98, 0.85, 0.16, 0.0], borde: [0.78, 0.0, 0.30, 1.2],
    bordeColor: [0.640, 0.360, 0.150]
  }),
  pintura_desgastada: def({
    etiqueta: 'Pintura desgastada', grupo: 'metal', receta: Me.pintura_desgastada,
    tamano: 1.2, relieve: 0.007, aoRadio: 0.018, aoFuerza: 1.15, curvGan: 22,
    suciedad: [0.90, 0.75, 0.18, 0.55], borde: [0.18, 1.0, 0.70, 1.7],
    bordeColor: [0.785, 0.790, 0.800],
    uniformes: { uPintura: [0.455, 0.165, 0.130] }        // rojo minio envejecido
  }),

  // --------------------------------------------------------------- madera
  madera_tabla: def({
    etiqueta: 'Madera (tabla)', grupo: 'madera', receta: Ma.madera_tabla,
    tamano: 1.6, relieve: 0.009, aoRadio: 0.018, aoFuerza: 1.30, curvGan: 15,
    suciedad: [0.92, 0.85, 0.16, 0.30], borde: [0.48, 0.0, 0.30, 1.2],
    bordeColor: [0.720, 0.575, 0.395]
  }),
  madera_contrachapado: def({
    etiqueta: 'Contrachapado', grupo: 'madera', receta: Ma.madera_contrachapado,
    tamano: 2.0, relieve: 0.006, aoRadio: 0.016, aoFuerza: 1.15, curvGan: 14,
    suciedad: [0.90, 0.70, 0.18, 0.0], borde: [0.46, 0.0, 0.28, 1.1],
    bordeColor: [0.760, 0.645, 0.460]
  }),
  madera_pale: def({
    etiqueta: 'Madera de palé', grupo: 'madera', receta: Ma.madera_pale,
    tamano: 1.4, relieve: 0.014, aoRadio: 0.022, aoFuerza: 1.55, curvGan: 16,
    suciedad: [0.96, 1.0, 0.14, 0.30], borde: [0.62, 0.0, 0.34, 1.3],
    bordeColor: [0.590, 0.560, 0.525]
  }),

  // ------------------------------------------------------------ sinteticos
  vidrio_sucio: def({
    etiqueta: 'Vidrio sucio', grupo: 'sintetico', receta: Si.vidrio_sucio,
    tamano: 1.6, relieve: 0.0022, aoRadio: 0.012, aoFuerza: 0.70, curvGan: 20,
    suciedad: [0.70, 0.55, 0.25, 0.0], borde: [0.05, 0.0, 0.10, 1.2],
    bordeColor: [0.10, 0.11, 0.11]
  }),
  goma: def({
    etiqueta: 'Goma', grupo: 'sintetico', receta: Si.goma,
    tamano: 0.7, relieve: 0.0055, aoRadio: 0.016, aoFuerza: 1.20, curvGan: 20,
    suciedad: [0.96, 0.70, 0.20, 0.0], borde: [0.58, 0.0, 0.22, 1.4],
    bordeColor: [0.120, 0.118, 0.115]
  }),
  plastico: def({
    etiqueta: 'Plástico', grupo: 'sintetico', receta: Si.plastico,
    tamano: 0.8, relieve: 0.0035, aoRadio: 0.014, aoFuerza: 0.95, curvGan: 22,
    suciedad: [0.72, 0.55, 0.24, 0.0], borde: [0.22, 0.0, 0.40, 1.5],
    bordeColor: [0.900, 0.900, 0.905],
    uniformes: { uPlastico: [0.560, 0.545, 0.500] }       // gris marfil industrial
  }),
  lona: def({
    etiqueta: 'Lona', grupo: 'sintetico', receta: Si.lona,
    tamano: 1.0, relieve: 0.0075, aoRadio: 0.016, aoFuerza: 1.60, curvGan: 15,
    suciedad: [0.94, 1.0, 0.12, 0.0], borde: [0.80, 0.0, 0.30, 1.2],
    bordeColor: [0.690, 0.680, 0.630],
    uniformes: { uLona: [0.235, 0.275, 0.185] }           // verde oliva
  }),
  carton: def({
    etiqueta: 'Cartón', grupo: 'sintetico', receta: Si.carton,
    tamano: 1.0, relieve: 0.0065, aoRadio: 0.018, aoFuerza: 1.35, curvGan: 16,
    suciedad: [0.96, 0.80, 0.18, 0.0], borde: [0.94, 0.0, 0.35, 1.3],
    bordeColor: [0.700, 0.630, 0.520]
  })
};

const baseCalco = { resolucion: 512, relieve: 0.9, escala: 1 };

export const CALCOMANIAS = {
  impacto_bala_metal:    { ...baseCalco, etiqueta: 'Impacto de bala (metal)',    receta: Ca.impacto_bala_metal, relieve: 1.1 },
  impacto_bala_hormigon: { ...baseCalco, etiqueta: 'Impacto de bala (hormigón)', receta: Ca.impacto_bala_hormigon, relieve: 1.3 },
  quemadura:             { ...baseCalco, etiqueta: 'Quemadura',                  receta: Ca.quemadura, relieve: 0.5 },
  grieta:                { ...baseCalco, etiqueta: 'Grieta',                     receta: Ca.grieta, relieve: 0.8 },
  mancha_aceite:         { ...baseCalco, etiqueta: 'Mancha de aceite',           receta: Ca.mancha_aceite, relieve: 0.3 },
  salpicadura_agua:      { ...baseCalco, etiqueta: 'Salpicadura de agua',        receta: Ca.salpicadura_agua, relieve: 0.4 },
  hollin:                { ...baseCalco, etiqueta: 'Hollín',                     receta: Ca.hollin, relieve: 0.25 }
};

export const NOMBRES = Object.keys(MATERIALES);
export const NOMBRES_CALCOMANIAS = Object.keys(CALCOMANIAS);
