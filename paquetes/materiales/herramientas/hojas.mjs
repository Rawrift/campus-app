// Genera hojas de contacto 3x3 para verificar que no hay costuras.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const salida = path.resolve(process.argv[3] || '/tmp/teselado');
const mapa = process.argv[4] || 'albedo';
fs.mkdirSync(salida, { recursive: true });
const MIME={'.html':'text/html','.js':'text/javascript'};
const srv = http.createServer((q,r)=>{ let p=decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(root,p),(e,d)=>{ if(e){r.writeHead(404).end();return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'}); r.end(d); }); });
await new Promise(r=>srv.listen(9872,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const pg = await b.newPage();
pg.on('pageerror', e=>console.log('[pageerror] '+e));
await pg.goto(`http://127.0.0.1:9872/herramientas/teselado.html?mapa=${mapa}`);
await pg.waitForFunction('window.__DONE===true',null,{timeout:600000}).catch(e=>console.log('TIMEOUT'));
const hojas = await pg.evaluate(()=>window.__HOJAS||[]);
hojas.forEach((d,i)=>fs.writeFileSync(path.join(salida,`hoja${i}_${mapa}.png`),
  Buffer.from(d.split(',')[1],'base64')));
console.log(`${hojas.length} hojas en ${salida}`);
await b.close(); srv.close();
