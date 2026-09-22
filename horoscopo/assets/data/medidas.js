/* SIESTA · Horóscopo — Medidas de los assets
 *
 * Generado midiendo los archivos, no estimado a ojo. Los tres valores por
 * signo son la caja de tinta real de cada pieza, ya recortada.
 *
 * `factor` es lo que normaliza los lockups. No se pueden escalar por ancho
 * ni por alto: en LEO el elemento más ancho del bloque es "HORÓSCOPO", y en
 * CAPRICORNIO es el nombre. Escalando por el borde, "HORÓSCOPO" cambiaría de
 * tamaño entre signos. El factor es ancho-del-archivo / ancho-de-la-banda-
 * HORÓSCOPO, así que multiplicando un ancho objetivo por él, esa línea mide
 * lo mismo en los doce y cada nombre conserva el cuerpo con que fue
 * diseñado: LEO grande, CAPRICORNIO chico.
 *
 * Si se reemplaza un asset, hay que volver a medirlo.
 */

export const MEDIDAS = {
  aries:        {
    glifo:  { w: 400, h: 322 },
    lockup: { w: 680, h: 590, factor: 1.3992 },
    figura: { w: 820, h: 976 },
  },
  tauro:        {
    glifo:  { w: 400, h: 363 },
    lockup: { w: 680, h: 546, factor: 1.3307 },
    figura: { w: 820, h: 1025 },
  },
  geminis:      {
    glifo:  { w: 400, h: 420 },
    lockup: { w: 680, h: 466, factor: 1.3992 },
    figura: { w: 820, h: 913 },
  },
  cancer:       {
    glifo:  { w: 400, h: 344 },
    lockup: { w: 680, h: 511, factor: 1.3052 },
    figura: { w: 820, h: 933 },
  },
  leo:          {
    glifo:  { w: 400, h: 452 },
    lockup: { w: 680, h: 633, factor: 1.1545 },
    figura: { w: 820, h: 1000 },
  },
  virgo:        {
    glifo:  { w: 400, h: 367 },
    lockup: { w: 680, h: 590, factor: 1.2057 },
    figura: { w: 820, h: 1017 },
  },
  libra:        {
    glifo:  { w: 400, h: 302 },
    lockup: { w: 680, h: 583, factor: 1.25 },
    figura: { w: 820, h: 992 },
  },
  escorpio:     {
    glifo:  { w: 400, h: 315 },
    lockup: { w: 680, h: 529, factor: 1.4316 },
    figura: { w: 820, h: 1054 },
  },
  sagitario:    {
    glifo:  { w: 400, h: 398 },
    lockup: { w: 680, h: 489, factor: 1.5145 },
    figura: { w: 820, h: 1079 },
  },
  capricornio:  {
    glifo:  { w: 400, h: 354 },
    lockup: { w: 680, h: 359, factor: 1.5385 },
    figura: { w: 820, h: 1036 },
  },
  acuario:      {
    glifo:  { w: 400, h: 205 },
    lockup: { w: 680, h: 454, factor: 1.3573 },
    figura: { w: 820, h: 1060 },
  },
  piscis:       {
    glifo:  { w: 400, h: 427 },
    lockup: { w: 680, h: 576, factor: 1.2569 },
    figura: { w: 820, h: 1051 },
  },
};

/** Ancho de la banda HORÓSCOPO en la pieza, en unidades de contenedor. */
export const BANDA_CQW = 30;
