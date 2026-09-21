#!/usr/bin/env node
// Comprueba el determinismo ENTRE CARGAS: ejecuta el mismo guión dos veces, en dos páginas
// independientes, y compara la huella del estado físico. Es la garantía que de verdad importa
// para el juicio A/B: que la misma versión y la misma semilla den el mismo resultado.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const guion = process.argv[2] || 'guiones/regresion.mjs';
const huellas = [];
for (const n of [1, 2]) {
  const salida = `/tmp/determinismo-${n}`;
  execFileSync('node', ['tools/jugar.mjs', 'juego/dist', guion, salida], { stdio: 'pipe' });
  const inf = JSON.parse(fs.readFileSync(salida + '/informe.json', 'utf8'));
  huellas.push(inf.huellaTorre);
  console.log(`  ejecución ${n}: huella ${inf.huellaTorre}`);
}
const igual = huellas[0] === huellas[1] && huellas[0] != null;
console.log(igual ? '\n OK  dos cargas independientes con la misma semilla dan el mismo estado'
                  : `\n MAL divergen: ${huellas[0]} vs ${huellas[1]}`);
process.exit(igual ? 0 : 1);
