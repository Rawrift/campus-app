// MATRIZ DE TIMBRES POR MATERIAL Y POR PAR DE MATERIALES.
//
// Modelo fisico simplificado pero honesto:
//  - Cada material es un RESONADOR MODAL: una serie de parciales con una razon de
//    frecuencia, una ganancia y un decaimiento propio. Las razones no son armonicas
//    (1,2,3...) sino las de los modos reales del solido:
//      * placa/lamina circular  -> 1, 2.76, 5.40, 8.93, 13.34  (metal, vidrio)
//      * barra libre-libre      -> 1, 2.57, 4.91, 7.99         (madera)
//      * bloque macizo amortiguado -> parciales bajos muy amortiguados (hormigon, goma)
//  - `dureza` controla el TIEMPO DE CONTACTO del golpe: un material duro comprime poco,
//    el contacto dura microsegundos y excita todo el espectro; uno blando alarga el
//    contacto y actua como filtro paso bajo mecanico.
//  - `ruido` y `ruidoFc` describen el transitorio de rozamiento/fractura superficial.
//
// El par (A,B) se combina: el mas RESONANTE aporta la cola modal, el mas BLANDO manda en
// el tiempo de contacto. Encima, `PARES` corrige casos con caracter propio reconocible.

export const MATERIALES = {
  metal: {
    nombre: 'metal',
    f0: 440, modos: [1, 2.76, 5.40, 8.93, 13.34, 18.6],
    ganancias: [1.0, 0.78, 0.56, 0.40, 0.26, 0.16],
    t60: 2.2, resonancia: 1.0, dureza: 0.95, densidad: 7800,
    inarmonia: 0.22, tc: 0.00035,
    ruido: 0.30, ruidoFc: 5200, ruidoQ: 0.9,
    repique: 0.75, astillas: 0.0, chirrido: 0.85, grave: 0.55,
  },
  acero: null, // alias, se resuelve abajo
  hormigon: {
    nombre: 'hormigon',
    f0: 190, modos: [1, 1.84, 2.72, 3.61, 5.10],
    ganancias: [1.0, 0.52, 0.30, 0.18, 0.10],
    t60: 0.115, resonancia: 0.30, dureza: 0.72, densidad: 2400,
    inarmonia: 0.55, tc: 0.0011,
    ruido: 0.95, ruidoFc: 1700, ruidoQ: 0.6,
    repique: 0.10, astillas: 0.18, chirrido: 0.35, grave: 0.95,
  },
  madera: {
    nombre: 'madera',
    f0: 300, modos: [1, 2.57, 4.91, 7.99, 11.2],
    ganancias: [1.0, 0.62, 0.34, 0.18, 0.09],
    t60: 0.26, resonancia: 0.55, dureza: 0.45, densidad: 650,
    inarmonia: 0.16, tc: 0.0016,
    ruido: 0.40, ruidoFc: 1300, ruidoQ: 0.8,
    repique: 0.12, astillas: 0.10, chirrido: 0.18, grave: 0.45,
  },
  vidrio: {
    nombre: 'vidrio',
    f0: 1180, modos: [1, 2.40, 4.12, 6.31, 9.24, 12.8],
    ganancias: [1.0, 0.80, 0.62, 0.46, 0.30, 0.20],
    t60: 1.15, resonancia: 0.95, dureza: 0.92, densidad: 2500,
    inarmonia: 0.30, tc: 0.0004,
    ruido: 0.34, ruidoFc: 7800, ruidoQ: 1.1,
    repique: 0.42, astillas: 1.0, chirrido: 0.55, grave: 0.20,
  },
  goma: {
    nombre: 'goma',
    f0: 105, modos: [1, 1.62, 2.44],
    ganancias: [1.0, 0.24, 0.08],
    t60: 0.055, resonancia: 0.12, dureza: 0.10, densidad: 1100,
    inarmonia: 0.5, tc: 0.0075,
    ruido: 0.28, ruidoFc: 420, ruidoQ: 0.5,
    repique: 0.0, astillas: 0.0, chirrido: 0.06, grave: 0.85,
  },
  plastico: {
    nombre: 'plastico',
    f0: 620, modos: [1, 2.14, 3.52, 5.30],
    ganancias: [1.0, 0.50, 0.26, 0.12],
    t60: 0.14, resonancia: 0.38, dureza: 0.55, densidad: 1200,
    inarmonia: 0.26, tc: 0.0013,
    ruido: 0.45, ruidoFc: 2900, ruidoQ: 0.7,
    repique: 0.20, astillas: 0.22, chirrido: 0.30, grave: 0.30,
  },
  carne: {
    nombre: 'carne',
    f0: 84, modos: [1, 1.5],
    ganancias: [1.0, 0.18],
    t60: 0.05, resonancia: 0.08, dureza: 0.08, densidad: 1050,
    inarmonia: 0.6, tc: 0.009,
    ruido: 0.85, ruidoFc: 300, ruidoQ: 0.5,
    repique: 0.0, astillas: 0.0, chirrido: 0.04, grave: 1.0,
  },
  grava: {
    nombre: 'grava',
    f0: 260, modos: [1, 1.9, 3.1],
    ganancias: [1.0, 0.35, 0.15],
    t60: 0.07, resonancia: 0.18, dureza: 0.6, densidad: 1600,
    inarmonia: 0.8, tc: 0.0012,
    ruido: 1.0, ruidoFc: 3400, ruidoQ: 0.45,
    repique: 0.45, astillas: 0.35, chirrido: 0.40, grave: 0.5,
  },
  tierra: {
    nombre: 'tierra',
    f0: 120, modos: [1, 1.7],
    ganancias: [1.0, 0.2],
    t60: 0.05, resonancia: 0.10, dureza: 0.25, densidad: 1500,
    inarmonia: 0.7, tc: 0.0045,
    ruido: 0.9, ruidoFc: 750, ruidoQ: 0.4,
    repique: 0.05, astillas: 0.0, chirrido: 0.10, grave: 0.9,
  },
  agua: {
    nombre: 'agua',
    f0: 480, modos: [1, 2.2],
    ganancias: [1.0, 0.3],
    t60: 0.10, resonancia: 0.22, dureza: 0.05, densidad: 1000,
    inarmonia: 0.4, tc: 0.006,
    ruido: 1.0, ruidoFc: 2200, ruidoQ: 0.4,
    repique: 0.30, astillas: 0.0, chirrido: 0.02, grave: 0.4,
  },
  nieve: {
    nombre: 'nieve',
    f0: 200, modos: [1, 1.8],
    ganancias: [1.0, 0.18],
    t60: 0.045, resonancia: 0.08, dureza: 0.15, densidad: 400,
    inarmonia: 0.7, tc: 0.006,
    ruido: 1.0, ruidoFc: 4800, ruidoQ: 0.35,
    repique: 0.0, astillas: 0.0, chirrido: 0.25, grave: 0.25,
  },
  hierba: {
    nombre: 'hierba',
    f0: 300, modos: [1, 2.0],
    ganancias: [1.0, 0.15],
    t60: 0.05, resonancia: 0.07, dureza: 0.2, densidad: 300,
    inarmonia: 0.8, tc: 0.005,
    ruido: 1.0, ruidoFc: 5600, ruidoQ: 0.3,
    repique: 0.0, astillas: 0.0, chirrido: 0.18, grave: 0.15,
  },
};

// Alias en espanol / sinonimos que el juego puede usar.
const ALIAS = {
  acero: 'metal', hierro: 'metal', aluminio: 'metal', chapa: 'metal',
  cemento: 'hormigon', piedra: 'hormigon', roca: 'hormigon', ladrillo: 'hormigon',
  cristal: 'vidrio', botella: 'vidrio',
  caucho: 'goma', neumatico: 'goma',
  pvc: 'plastico', polimero: 'plastico',
  organico: 'carne', cuerpo: 'carne',
  arena: 'tierra', barro: 'tierra', suelo: 'tierra',
  gravilla: 'grava', piedras: 'grava',
  cesped: 'hierba', hierbas: 'hierba',
};

export function material(nombre) {
  if (!nombre) return MATERIALES.hormigon;
  const n = String(nombre).toLowerCase();
  if (MATERIALES[n]) return MATERIALES[n];
  if (ALIAS[n] && MATERIALES[ALIAS[n]]) return MATERIALES[ALIAS[n]];
  return MATERIALES.hormigon;
}

/**
 * Correcciones por par. Cada entrada se aplica sobre la mezcla automatica y le da al par
 * su caracter reconocible. Las claves estan ordenadas alfabeticamente ("metal|hormigon"
 * y "hormigon|metal" son el mismo par).
 */
export const PARES = {
  // metal sobre hormigon: chirria y repica. Cola metalica larga, muchos microimpactos,
  // y un barrido de friccion en la banda 2-6 kHz.
  'hormigon|metal': { chirrido: 1.25, repique: 1.35, t60: 1.05, brillo: 1.15, ruido: 1.2 },
  // madera contra madera: seco, medio, nada de cola. El clasico "toc".
  'madera|madera': { t60: 0.55, brillo: 0.80, repique: 0.5, ruido: 0.75, grave: 0.9 },
  // vidrio contra cualquier cosa dura: se astilla.
  'hormigon|vidrio': { astillas: 1.5, t60: 0.75, brillo: 1.10 },
  'metal|vidrio': { astillas: 1.35, t60: 0.95, brillo: 1.25, repique: 1.2 },
  'vidrio|vidrio': { astillas: 1.8, t60: 1.05, brillo: 1.30, repique: 1.4 },
  'madera|vidrio': { astillas: 1.1, t60: 0.70, brillo: 0.95 },
  // goma: sordo. Absorbe todo lo que el otro material quisiera hacer sonar.
  'goma|metal': { t60: 0.22, brillo: 0.35, repique: 0.15, chirrido: 0.3, grave: 1.3 },
  'goma|hormigon': { t60: 0.55, brillo: 0.40, ruido: 0.8, grave: 1.25 },
  'goma|goma': { t60: 0.6, brillo: 0.30, grave: 1.2 },
  'goma|madera': { t60: 0.45, brillo: 0.45, grave: 1.15 },
  'goma|vidrio': { t60: 0.35, brillo: 0.5, astillas: 0.4 },
  // metal contra metal: repique brillante y largo, con batido entre modos.
  'metal|metal': { t60: 1.25, brillo: 1.30, repique: 1.5, chirrido: 0.9 },
  // madera sobre hormigon: golpe seco con cuerpo grave.
  'hormigon|madera': { t60: 0.70, brillo: 0.85, grave: 1.15, ruido: 1.1 },
  'hormigon|hormigon': { t60: 0.85, brillo: 0.75, ruido: 1.25, grave: 1.2, astillas: 1.2 },
  'madera|metal': { t60: 0.85, brillo: 1.05, repique: 0.9 },
  'carne|metal': { t60: 0.3, brillo: 0.5, grave: 1.3, ruido: 1.3 },
  'carne|hormigon': { t60: 0.4, brillo: 0.4, grave: 1.35, ruido: 1.4 },
  'grava|metal': { ruido: 1.35, repique: 1.3, brillo: 1.1, t60: 0.8 },
};

/**
 * Combina dos materiales en un descriptor de timbre listo para sintetizar.
 * @param {string} a material del objeto que golpea (aporta la resonancia dominante)
 * @param {string} b material de la superficie golpeada
 */
export function parDeMateriales(a, b) {
  const A = material(a);
  const B = material(b || a);

  // El material MAS resonante domina la cola modal; el otro la tine.
  const dominante = A.resonancia >= B.resonancia ? A : B;
  const secundario = dominante === A ? B : A;
  const w = dominante.resonancia / (dominante.resonancia + secundario.resonancia + 1e-6);

  // El material MAS BLANDO manda en el tiempo de contacto: un martillo de acero sobre
  // goma suena a goma porque el contacto dura 10 ms, no 0.3 ms.
  const tc = Math.max(A.tc, B.tc) * 0.85 + Math.min(A.tc, B.tc) * 0.15;
  const dureza = Math.min(A.dureza, B.dureza) * 0.7 + Math.max(A.dureza, B.dureza) * 0.3;

  const par = {
    nombre: `${A.nombre}+${B.nombre}`,
    f0: dominante.f0 * Math.pow(secundario.f0 / dominante.f0, 1 - w) ** 0.35,
    modos: dominante.modos.slice(),
    ganancias: dominante.ganancias.slice(),
    t60: dominante.t60 * w + secundario.t60 * (1 - w),
    inarmonia: dominante.inarmonia * w + secundario.inarmonia * (1 - w),
    tc, dureza,
    densidad: (A.densidad + B.densidad) / 2,
    ruido: Math.max(A.ruido, B.ruido) * 0.65 + Math.min(A.ruido, B.ruido) * 0.35,
    ruidoFc: Math.sqrt(A.ruidoFc * B.ruidoFc),
    ruidoQ: (A.ruidoQ + B.ruidoQ) / 2,
    repique: Math.max(A.repique, B.repique) * 0.7 + Math.min(A.repique, B.repique) * 0.3,
    astillas: Math.max(A.astillas, B.astillas),
    chirrido: Math.min(A.chirrido, B.chirrido) * 0.4 + Math.max(A.chirrido, B.chirrido) * 0.6,
    grave: (A.grave + B.grave) / 2,
    brillo: 1,
  };

  // Blend del f0: media geometrica ponderada, que es la correcta para frecuencias.
  par.f0 = Math.exp(Math.log(dominante.f0) * w + Math.log(secundario.f0) * (1 - w));

  const clave = [A.nombre, B.nombre].sort().join('|');
  const corr = PARES[clave];
  if (corr) {
    if (corr.t60) par.t60 *= corr.t60;
    if (corr.brillo) par.brillo *= corr.brillo;
    if (corr.repique) par.repique *= corr.repique;
    if (corr.chirrido) par.chirrido *= corr.chirrido;
    if (corr.astillas) par.astillas *= corr.astillas;
    if (corr.ruido) par.ruido *= corr.ruido;
    if (corr.grave) par.grave *= corr.grave;
  }
  par.clave = clave;
  return par;
}
