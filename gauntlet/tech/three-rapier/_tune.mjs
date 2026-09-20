import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.wasm':'application/wasm' };
const root = '/home/user/campus-app/gauntlet/tech/three-rapier';
const out = process.argv[2] || '/tmp/tune';
const cams = (process.argv[3] || '0,2,5').split(',').map(Number);
const phase = process.argv[4] || '';
fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((req,rep)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/favicon.ico') { rep.writeHead(204).end(); return; }
  fs.readFile(path.join(root,p),(e,d)=>{ if(e){rep.writeHead(404).end();return;} rep.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); rep.end(d);});
});
await new Promise(r=>srv.listen(9413,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--enable-precise-memory-info','--force-device-scale-factor=1'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
const page = await ctx.newPage();
const errs=[];
page.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,300)); });
page.on('pageerror', e=>errs.push('PE '+String(e).slice(0,300)));
await page.goto('http://127.0.0.1:9413/', {waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__BENCH && window.__BENCH.loadTimeMs > 0', null, {timeout:120000});
if (phase) { await page.evaluate(p=>window.__BENCH.phase(p), phase); await page.waitForTimeout(4000); }
for (const i of cams) {
  await page.evaluate(i=>window.__BENCH.setCamera(i), i);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(out, `cam${i}.png`) });
}
await page.evaluate(()=>window.__BENCH.resetStats());
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(()=>window.__BENCH.stats())));
if (errs.length) console.log('ERRORS', errs.slice(0,6));
await b.close(); srv.close();
