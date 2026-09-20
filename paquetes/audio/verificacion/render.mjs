#!/usr/bin/env node
// RENDER DE VERIFICACION.
//
// Sintetiza cada caso en un OfflineAudioContext REAL de Chromium (no una reimplementacion
// en Node: el mismo motor de audio, el mismo HRTF y el mismo DynamicsCompressor que oira
// el jugador), escribe el WAV y recoge las metricas objetivas.
//
//   node verificacion/render.mjs [filtro]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servir } from './servidor.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAQUETE = path.resolve(AQUI, '..');
const SALIDA = path.join(AQUI, 'salida');

const filtro = process.argv[2] || null;

fs.mkdirSync(SALIDA, { recursive: true });

const { srv, puerto } = await servir(PAQUETE);
const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const pagina = await navegador.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

await pagina.goto(`http://127.0.0.1:${puerto}/verificacion/banco.html`);
await pagina.waitForFunction('globalThis.bancoListo === true', null, { timeout: 30000 });
if (errores.length) { console.error('Errores al cargar:\n' + errores.join('\n')); process.exit(1); }

const lista = await pagina.evaluate('globalThis.listaCasos()');
const casos = filtro ? lista.filter((c) => c.id.includes(filtro)) : lista;
console.log(`Renderizando ${casos.length} casos en Chromium (OfflineAudioContext)...\n`);

const resultados = [];
for (const c of casos) {
  const t0 = Date.now();
  let r;
  try {
    r = await pagina.evaluate((id) => globalThis.renderizarCaso(id), c.id);
  } catch (e) {
    console.error(`  FALLO ${c.id}: ${e.message}`);
    errores.push(`${c.id}: ${e.message}`);
    continue;
  }
  const wav = Buffer.from(r.wav, 'base64');
  fs.writeFileSync(path.join(SALIDA, `${c.id}.wav`), wav);
  delete r.wav;
  resultados.push(r);
  const m = r.metricas;
  console.log(
    `  ${c.id.padEnd(30)} ${(wav.length / 1024).toFixed(0).padStart(5)} KiB  ` +
    `pico ${m.picoDbfs.toFixed(1).padStart(6)} dBFS  rms ${m.rmsDbfs.toFixed(1).padStart(6)}  ` +
    `cresta ${m.crestaDb.toFixed(1).padStart(5)}  centroide ${m.centroideHz.toFixed(0).padStart(5)} Hz  ` +
    `t40 ${(m.t40 === null ? '  —  ' : m.t40.toFixed(2) + 's').padStart(6)}  ` +
    `trans ${String(m.transitorios).padStart(3)}  ${m.recorte ? 'RECORTE!' : 'sin recorte'}` +
    `  (${Date.now() - t0} ms)`
  );
}

fs.writeFileSync(path.join(SALIDA, 'metricas.json'), JSON.stringify({
  generado: new Date().toISOString(),
  sr: 48000,
  casos: resultados,
}, null, 2));

await navegador.close();
srv.close();

const conRecorte = resultados.filter((r) => r.metricas.recorte && !r.id.includes('sin_limitador') && !r.id.includes('sin_agrupacion'));
console.log(`\n${resultados.length} WAV escritos en verificacion/salida/`);
if (conRecorte.length) {
  console.error(`RECORTE en cadena completa: ${conRecorte.map((r) => r.id).join(', ')}`);
  process.exitCode = 1;
}
if (errores.length) { console.error('\nErrores:\n' + errores.join('\n')); process.exitCode = 1; }
