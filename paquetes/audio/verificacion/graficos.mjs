#!/usr/bin/env node
// Genera un PNG (forma de onda + espectrograma + metricas) por cada WAV de salida/.
// Se dibuja con Canvas dentro de Chromium: no hay numpy ni matplotlib en este entorno.
//
//   node verificacion/graficos.mjs [filtro]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servir } from './servidor.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAQUETE = path.resolve(AQUI, '..');
const SALIDA = path.join(AQUI, 'salida');
const filtro = process.argv[2] || null;

const meta = JSON.parse(fs.readFileSync(path.join(SALIDA, 'metricas.json'), 'utf8'));
const porId = new Map(meta.casos.map((c) => [c.id, c]));

let wavs = fs.readdirSync(SALIDA).filter((f) => f.endsWith('.wav')).sort();
if (filtro) wavs = wavs.filter((f) => f.includes(filtro));

const { srv, puerto } = await servir(PAQUETE);
const navegador = await chromium.launch({ args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 760 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
await pagina.goto(`http://127.0.0.1:${puerto}/verificacion/graficos.html`);
await pagina.waitForFunction('globalThis.graficosListo === true', null, { timeout: 30000 });

console.log(`Dibujando ${wavs.length} gráficos...\n`);
for (const w of wavs) {
  const id = w.replace(/\.wav$/, '');
  const info = porId.get(id) || { id, etiqueta: id };
  const dataUrl = await pagina.evaluate(
    ([n, i]) => globalThis.generar(n, i), [w, { id, etiqueta: info.etiqueta, metricas: info.metricas }]
  );
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(SALIDA, `${id}.png`), png);
  console.log(`  ${id.padEnd(30)} ${(png.length / 1024).toFixed(0).padStart(4)} KiB`);
}

await navegador.close();
srv.close();
if (errores.length) { console.error('\nErrores:\n' + errores.join('\n')); process.exitCode = 1; }
console.log(`\n${wavs.length} PNG escritos en verificacion/salida/`);
