#!/usr/bin/env node
// Arnés de medición neutral. Sirve una carpeta estática, carga la escena,
// recorre cámaras y fases, captura PNG y recoge métricas.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --- GUARDA DE EXCLUSIVIDAD ---------------------------------------------------
// Bajo rasterizado por software, 4 núcleos y un navegador ajeno al 300% de CPU, las
// cifras no valen nada. Se detectó empíricamente: un stub que da 60 fps en exclusiva
// dio 32 con otro benchmark corriendo en paralelo. Medir así produce comparaciones
// falsas, que es peor que no medir. Por eso esto aborta en lugar de avisar.
function comprobarExclusividad({ forzar = false } = {}) {
  const nucleos = os.cpus().length;
  const carga = os.loadavg()[0];
  let ajenos = [];
  try {
    const ps = execSync('ps -eo pid,pcpu,comm --no-headers', { encoding: 'utf8' });
    ajenos = ps.split('\n')
      .map(l => l.trim().split(/\s+/))
      .filter(c => c.length >= 3 && /chrome|headless_shell/.test(c[2]) && Number(c[1]) > 25)
      .filter(c => Number(c[0]) !== process.pid);
  } catch {}
  const limpio = carga < nucleos * 0.7 && ajenos.length === 0;
  const informe = { nucleos, cargaMedia: +carga.toFixed(2),
    navegadoresAjenosActivos: ajenos.map(c => ({ pid: c[0], cpu: c[1] })), exclusivo: limpio };
  if (!limpio && !forzar) {
    console.error('\n✖ MEDICIÓN ABORTADA: el contenedor no está en exclusiva.');
    console.error('  ' + JSON.stringify(informe));
    console.error('  Las cifras saldrían falseadas. Espera a que terminen los demás procesos,');
    console.error('  o repite con BENCH_FORZAR=1 sabiendo que el resultado NO es comparable.\n');
    process.exit(2);
  }
  return informe;
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.ktx2':'image/ktx2', '.bin':'application/octet-stream', '.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json', '.hdr':'image/vnd.radiance', '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav', '.ttf':'font/ttf', '.woff2':'font/woff2' };

function serve(root, port) {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(path.resolve(root))) { rep.writeHead(403).end(); return; }
      if (p === '/favicon.ico') { rep.writeHead(204).end(); return; }
      fs.readFile(f, (e, data) => {
        if (e) { rep.writeHead(404).end('404 '+p); return; }
        rep.writeHead(200, {
          'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy':'same-origin',
          'Cross-Origin-Embedder-Policy':'require-corp',
          'Cache-Control':'no-store' });
        rep.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}

const args = process.argv.slice(2);
const root = path.resolve(args[0]);
const label = args[1] || path.basename(root);
const outDir = path.resolve(args[2] || `gauntlet/results/${label}`);
const PORT = 9000 + Math.floor(Math.random()*900);
const READY_TIMEOUT = Number(process.env.BENCH_READY_TIMEOUT || 240000);
const SETTLE = Number(process.env.BENCH_SETTLE || 2500);
const SAMPLE = Number(process.env.BENCH_SAMPLE || 4000);

fs.mkdirSync(outDir, { recursive: true });
const exclusividad = comprobarExclusividad({ forzar: process.env.BENCH_FORZAR === '1' });
const srv = await serve(root, PORT);
const report = { label, root, startedAt: new Date().toISOString(), exclusividad,
                 errors: [], cameras: [], phases: [] };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
         '--disable-dev-shm-usage','--js-flags=--expose-gc','--enable-precise-memory-info',
         '--disable-background-timer-throttling','--disable-renderer-backgrounding',
         '--force-device-scale-factor=1'],
});
const ctx = await browser.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
const page = await ctx.newPage();

// --- MEDIDOR DE FPS NEUTRAL ---------------------------------------------------
// No confiamos en el stats().fps de cada candidato: cada builder lo implementa a su
// manera y ya se detectó un caso que devolvía 1000/msCPU en lugar de FPS real, lo que
// invalida cualquier comparación. Aquí instalamos NUESTRO propio bucle rAF, idéntico
// para todos, que cuenta fotogramas realmente presentados por el navegador.
await page.addInitScript(() => {
  const M = { n: 0, dts: [], last: 0, activo: false };
  window.__ARNES = M;
  const tick = (t) => {
    if (M.activo) { if (M.last) M.dts.push(t - M.last); M.n++; }
    M.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__ARNES.reset = () => { M.n = 0; M.dts.length = 0; M.activo = true; };
  window.__ARNES.leer = () => {
    const d = M.dts.slice().sort((a, b) => a - b);
    const suma = M.dts.reduce((a, b) => a + b, 0);
    return {
      fotogramas: M.n,
      fpsReal: M.dts.length ? 1000 / (suma / M.dts.length) : 0,
      frameMsReal: M.dts.length ? suma / M.dts.length : 0,
      p95FrameMsReal: d.length ? d[Math.floor(d.length * 0.95)] : 0,
      peorFrameMs: d.length ? d[d.length - 1] : 0,
    };
  };
});
page.on('console', m => { if (m.type()==='error') report.errors.push('console: '+m.text().slice(0,400)); });
page.on('pageerror', e => report.errors.push('pageerror: '+String(e).slice(0,400)));

const t0 = Date.now();
try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForFunction('window.__BENCH && window.__BENCH.ready', null, { timeout: 60000 });
  await page.evaluate(() => window.__BENCH.ready, null);
  await page.waitForFunction('true', null, {timeout:1000}).catch(()=>{});
  report.readyWallMs = Date.now() - t0;
  report.loadTimeMs = await page.evaluate(() => window.__BENCH.loadTimeMs ?? null);
} catch (e) {
  report.fatal = 'ready failed: ' + String(e).slice(0, 600);
  fs.writeFileSync(path.join(outDir,'metrics.json'), JSON.stringify(report,null,2));
  await browser.close(); srv.close(); console.log(JSON.stringify(report,null,2)); process.exit(1);
}

async function sample(tag) {
  await page.evaluate(() => { window.__BENCH.resetStats(); window.__ARNES.reset(); });
  await page.waitForTimeout(SAMPLE);
  const declarado = await page.evaluate(() => window.__BENCH.stats());
  const medido = await page.evaluate(() => window.__ARNES.leer());
  // 'medido' manda. Lo que declara el candidato se conserva aparte, nunca mezclado.
  return { tag, ...medido, declarado };
}
async function shot(name) {
  await page.screenshot({ path: path.join(outDir, name+'.png') });
}

// --- Cámaras (estado idle) ---
for (let i=0;i<6;i++) {
  await page.evaluate(i => window.__BENCH.setCamera(i), i);
  await page.waitForTimeout(SETTLE);
  await shot(`cam${i}`);
  report.cameras.push(await sample(`cam${i}`));
  console.error(`[${label}] cam${i} ok`);
}

// --- Fases acumulativas ---
async function runPhase(name, waitMs, shots=1) {
  try {
    await page.evaluate(n => window.__BENCH.phase(n), name);
    for (let k=0;k<shots;k++) {
      await page.waitForTimeout(waitMs/shots);
      await shot(`phase_${name}${shots>1?'_'+k:''}`);
    }
    const s = await sample(`phase_${name}`);
    report.phases.push(s);
    console.error(`[${label}] fase ${name}: fpsReal=${s.fpsReal?.toFixed?.(2)} cuerpos=${s.declarado?.bodies}`);
  } catch(e) { report.phases.push({tag:'phase_'+name, error:String(e).slice(0,300)}); }
}
await page.evaluate(() => window.__BENCH.setCamera(0));
await page.waitForTimeout(1200);
await runPhase('props', 5000, 1);
await page.evaluate(() => window.__BENCH.setCamera(4));
await page.waitForTimeout(1200);
await runPhase('explosion', 2400, 3);
await runPhase('ragdoll', 4000, 1);
await page.evaluate(() => window.__BENCH.setCamera(0));
await page.waitForTimeout(800);
await runPhase('chaos', 9000, 2);

// estabilidad post-estrés
await page.waitForTimeout(3000);
report.postStress = await sample('post_stress');
await shot('post_stress');

report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outDir,'metrics.json'), JSON.stringify(report,null,2));
await browser.close(); srv.close();
console.log(JSON.stringify({label, loadTimeMs:report.loadTimeMs, readyWallMs:report.readyWallMs,
  cams:report.cameras.map(c=>({t:c.tag, fpsReal:+c.fpsReal?.toFixed(2), p95:+c.p95FrameMsReal?.toFixed(1),
    dc:c.declarado?.drawCalls, tri:c.declarado?.triangles})),
  phases:report.phases.map(p=>({t:p.tag, fpsReal:+p.fpsReal?.toFixed(2), p95:+p.p95FrameMsReal?.toFixed(1),
    bodies:p.declarado?.bodies, act:p.declarado?.activeBodies, err:p.error})),
  errors:report.errors.slice(0,5)}, null, 1));
