// Servidor estatico + Chromium para las pruebas locales del paquete.
//   node herramientas/servir.mjs <raizServida> <rutaPagina> [flag]
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const pagina = process.argv[3] || '/herramientas/prueba.html';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
               '.css':'text/css', '.json':'application/json', '.png':'image/png' };

const srv = http.createServer((req, rep) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (e, d) => {
    if (e) { rep.writeHead(404).end('404 ' + p); return; }
    rep.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    rep.end(d);
  });
});
await new Promise(r => srv.listen(9871, '127.0.0.1', r));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
         '--disable-dev-shm-usage'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
pg.on('console', m => console.log('[' + m.type() + '] ' + m.text()));
pg.on('pageerror', e => console.log('[pageerror] ' + e));
await pg.goto('http://127.0.0.1:9871' + pagina, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction('window.__DONE===true', null, { timeout: 600000 })
  .catch(e => console.log('TIMEOUT ' + String(e).slice(0, 200)));
const errs = await pg.evaluate(() => window.__ERR || []).catch(() => []);
if (errs.length) console.log('\n=== ERRORES ===\n' + errs.join('\n'));
await b.close(); srv.close();
