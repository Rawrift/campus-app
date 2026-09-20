import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.wasm':'application/wasm' };
const root = process.argv[2];
const srv = http.createServer((req,rep)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  fs.readFile(f,(e,d)=>{ if(e){rep.writeHead(404).end();return;} rep.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); rep.end(d);});
});
await new Promise(r=>srv.listen(9412,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--enable-precise-memory-info'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
const page = await ctx.newPage();
page.on('console', m=>console.log('['+m.type()+']', m.text().slice(0,900)));
page.on('pageerror', e=>console.log('[pageerror]', String(e).slice(0,2000)));
await page.goto('http://127.0.0.1:9412/', {waitUntil:'domcontentloaded'});
const t0=Date.now();
try { await page.waitForFunction('window.__BENCH && window.__BENCH.loadTimeMs > 0', null, {timeout:120000}); console.log('READY in', Date.now()-t0,'ms'); }
catch(e){ console.log('NOT READY', String(e).slice(0,200)); }
console.log(await page.evaluate(()=>window.__BENCH && window.__BENCH.counts));
await b.close(); srv.close();
