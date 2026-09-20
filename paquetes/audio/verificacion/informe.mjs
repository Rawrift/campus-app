#!/usr/bin/env node
// Genera la tabla de metricas en Markdown a partir de verificacion/salida/metricas.json
// y la inyecta en LEEME.md entre los marcadores TABLA:INICIO / TABLA:FIN.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, 'salida');
const LEEME = path.join(AQUI, '..', 'LEEME.md');

const meta = JSON.parse(fs.readFileSync(path.join(SALIDA, 'metricas.json'), 'utf8'));
const n = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));

const grupos = new Map();
for (const c of meta.casos) {
  const g = c.grupo || 'Otros';
  if (!grupos.has(g)) grupos.set(g, []);
  grupos.get(g).push(c);
}

let md = '';
for (const [g, casos] of grupos) {
  md += `\n### ${g}\n\n`;
  md += '| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |\n';
  md += '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|\n';
  for (const c of casos) {
    const m = c.metricas;
    md += `| \`${c.id}\` | ${n(m.duracionActiva, 2)} s | ${n(m.picoDbfs)} | ${n(m.rmsDbfs)} | `
      + `${n(m.crestaDb)} | ${m.centroideHz.toFixed(0)} | ${m.t40 === null ? '—' : n(m.t40, 2) + ' s'} | `
      + `${n(m.graveRel)} | ${n(m.agudoRel)} | ${m.transitorios} | ${m.recorte ? `**sí (${m.muestrasRecortadas})**` : 'no'} |\n`;
  }
}

// Resumen de control de voces de los casos densos
const dens = meta.casos.filter((c) => c.id.startsWith('densidad_'));
if (dens.length) {
  md += '\n### Control de voces en el caso denso\n\n';
  md += '| caso | voces creadas | fusionadas | descartadas | robadas | pico simultáneo | pico dBFS | recorte |\n|---|--:|--:|--:|--:|--:|--:|:-:|\n';
  for (const c of dens) {
    const e = c.estadisticas || {};
    md += `| \`${c.id}\` | ${e.creadas ?? '—'} | ${e.fusionadas ?? '—'} | ${e.descartadas ?? '—'} | `
      + `${e.robadas ?? '—'} | ${e.pico ?? '—'} | ${n(c.metricas.picoDbfs)} | ${c.metricas.recorte ? `**sí (${c.metricas.muestrasRecortadas})**` : 'no'} |\n`;
  }
}

md += `\n_Generado por \`verificacion/informe.mjs\` el ${new Date(meta.generado).toISOString().slice(0, 10)} · `
  + `${meta.casos.length} casos · ${meta.sr} Hz._\n`;

// --- Comprobaciones automaticas -------------------------------------------------------
const por = (id) => (meta.casos.find((c) => c.id === id) || {}).metricas;
const masa = ['masa_005', 'masa_050', 'masa_200', 'masa_800'].map(por);
const mono = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? v > a[i - 1] : v < a[i - 1]));
const chk = [];
if (masa.every(Boolean)) {
  chk.push(['centroide espectral decrece con el momento', mono(masa.map((x) => x.centroideHz), -1),
    masa.map((x) => x.centroideHz.toFixed(0) + ' Hz').join(' > ')]);
  chk.push(['decaimiento a −40 dB crece con el momento', mono(masa.map((x) => x.t40), 1),
    masa.map((x) => x.t40.toFixed(2) + ' s').join(' < ')]);
  chk.push(['energía < 250 Hz crece con el momento', mono(masa.map((x) => x.graveRel), 1),
    masa.map((x) => x.graveRel.toFixed(1) + ' dB').join(' < ')]);
  chk.push(['energía > 4 kHz decrece con el momento', mono(masa.map((x) => x.agudoRel), -1),
    masa.map((x) => x.agudoRel.toFixed(1) + ' dB').join(' > ')]);
}
const conLim = por('densidad_200_con_limitador'), sinLim = por('densidad_200_sin_limitador');
if (conLim && sinLim) {
  chk.push(['200 impactos en 300 ms NO recortan con la cadena completa', !conLim.recorte,
    `pico ${conLim.picoDbfs.toFixed(1)} dBFS`]);
  chk.push(['el limitador actúa: la cadena desnuda SÍ recorta', sinLim.recorte,
    `pico ${sinLim.picoDbfs.toFixed(1)} dBFS, ${sinLim.muestrasRecortadas} muestras recortadas`]);
}
const esperados = new Set(['densidad_200_sin_limitador', 'densidad_200_sin_agrupacion']);
const recortan = meta.casos.filter((c) => c.metricas.recorte && !esperados.has(c.id)).map((c) => c.id);
chk.push(['ningún otro caso recorta', recortan.length === 0, recortan.join(', ') || 'ninguno']);

md += '\n### Comprobaciones automáticas\n\n| comprobación | resultado | evidencia |\n|---|:-:|---|\n';
for (const [t, ok, ev] of chk) md += `| ${t} | ${ok ? '✅' : '❌'} | ${ev} |\n`;
const fallos = chk.filter(([, ok]) => !ok).length;
console.log(chk.map(([t, ok, ev]) => `${ok ? 'OK  ' : 'FALLO'} ${t}  (${ev})`).join('\n'));

let leeme = fs.readFileSync(LEEME, 'utf8');
const A = '<!-- TABLA:INICIO -->', B = '<!-- TABLA:FIN -->';
const i = leeme.indexOf(A), j = leeme.indexOf(B);
if (i < 0 || j < 0) { console.error('Faltan los marcadores TABLA en LEEME.md'); process.exit(1); }
leeme = leeme.slice(0, i + A.length) + '\n' + md + '\n' + leeme.slice(j);
fs.writeFileSync(LEEME, leeme);
fs.writeFileSync(path.join(SALIDA, 'METRICAS.md'), md);
console.log(`\nTabla de ${meta.casos.length} casos inyectada en LEEME.md y escrita en salida/METRICAS.md`);
if (fallos) { console.error(`${fallos} comprobacion(es) fallidas`); process.exitCode = 1; }
