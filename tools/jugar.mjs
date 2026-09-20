#!/usr/bin/env node
// Arnés de SESIÓN DE JUEGO: sirve el build, abre el juego en Chromium, ejecuta un guión
// (secuencia de acciones + capturas) y recoge métricas. Es el driver del bucle
// CONSTRUIR -> EJECUTAR -> CAPTURAR -> JUZGAR.
//
//   node tools/jugar.mjs <carpetaServida> <guion.mjs> <carpetaSalida>
//
// El guión es un módulo ESM que exporta { nombre, descripcion, async ejecutar(ctx) }.
// ctx = { page, ev, wait, shot, tecla, mantener, raton, mover, clic, rueda, stats, log }
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
 '.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg',
 '.webp':'image/webp','.bin':'application/octet-stream','.glb':'model/gltf-binary','.svg':'image/svg+xml',
 '.ktx2':'image/ktx2','.woff2':'font/woff2','.ttf':'font/ttf','.hdr':'image/vnd.radiance'};
function serve(root,port){return new Promise(r=>{const s=http.createServer((q,p)=>{
 let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/favicon.ico'){p.writeHead(204).end();return;}
 if(u.endsWith('/'))u+='index.html'; const f=path.join(root,u);
 if(!f.startsWith(path.resolve(root))){p.writeHead(403).end();return;}
 fs.readFile(f,(e,d)=>{ if(e){p.writeHead(404).end();return;}
  p.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream',
   'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
   'Cache-Control':'no-store'}); p.end(d); });
 }); s.listen(port,'127.0.0.1',()=>r(s));});}

const [rootArg, guionArg, outArg] = process.argv.slice(2);
const root = path.resolve(rootArg);
const outDir = path.resolve(outArg || 'gauntlet/sesiones/'+path.basename(guionArg,'.mjs'));
fs.mkdirSync(outDir,{recursive:true});
const PORT = 9500 + Math.floor(Math.random()*400);
const srv = await serve(root, PORT);

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
        '--disable-dev-shm-usage','--enable-precise-memory-info','--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling','--disable-renderer-backgrounding','--force-device-scale-factor=1']});
const W = Number(process.env.JUGAR_W || 1600), H = Number(process.env.JUGAR_H || 900);
const ctxB = await browser.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
const page = await ctxB.newPage();
const errores = [];
page.on('console', m => { if(m.type()==='error') errores.push(m.text().slice(0,300)); });
page.on('pageerror', e => errores.push('pageerror: '+String(e).slice(0,300)));

let nShot = 0;
const capturas = [];
const ctx = {
  page,
  ev: (fn, arg) => page.evaluate(fn, arg),
  wait: ms => page.waitForTimeout(ms),
  log: (...a) => console.error('   ·', ...a),
  async shot(nombre) {
    const f = String(nShot++).padStart(2,'0') + '_' + nombre + '.png';
    await page.screenshot({ path: path.join(outDir, f) });
    capturas.push(f); console.error('   📸', f); return f;
  },
  tecla: (code, ms=60) => page.keyboard.press(code, {delay:ms}),
  async mantener(code, ms) { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); },
  raton: (x,y) => page.mouse.move(x,y),
  async mover(dx, dy, pasos=12) {
    // movimiento relativo tipo puntero bloqueado
    await page.evaluate(([dx,dy,pasos])=>window.__JUEGO?.mirarRelativo?.(dx,dy,pasos), [dx,dy,pasos]);
  },
  async clic(boton='left', ms=80) { await page.mouse.down({button:boton}); await page.waitForTimeout(ms); await page.mouse.up({button:boton}); },
  rueda: (d) => page.mouse.wheel(0, d),
  stats: () => page.evaluate(() => window.__JUEGO?.stats?.() ?? null),
};

const informe = { guion: path.basename(guionArg), servido: root, iniciado: new Date().toISOString(), muestras: [] };
try {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForFunction('window.__JUEGO && window.__JUEGO.listo', null, { timeout: 90000 });
  await page.evaluate(() => window.__JUEGO.listo);
  informe.arranqueMs = Date.now() - t0;
  console.error(`▶ juego listo en ${informe.arranqueMs} ms`);
  const guion = (await import(pathToFileURL(path.resolve(guionArg)).href)).default;
  informe.nombre = guion.nombre; informe.descripcion = guion.descripcion;
  await guion.ejecutar(ctx, informe);
} catch (e) {
  informe.fatal = String(e).slice(0,1200);
  console.error('✖ FALLO:', informe.fatal);
}
informe.capturas = capturas;
informe.errores = errores.slice(0,25);
informe.terminado = new Date().toISOString();
fs.writeFileSync(path.join(outDir,'informe.json'), JSON.stringify(informe,null,2));
await browser.close(); srv.close();
console.log(JSON.stringify({ salida: outDir, arranqueMs: informe.arranqueMs,
  capturas: capturas.length, errores: errores.length, fatal: informe.fatal||null }, null, 1));
process.exit(informe.fatal ? 1 : 0);
