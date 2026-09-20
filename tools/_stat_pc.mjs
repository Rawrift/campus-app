import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.png':'image/png'};
const root = path.resolve(process.argv[2]);
const PORT = 9750+Math.floor(Math.random()*200);
const srv = http.createServer((req,rep)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  if(p==='/favicon.ico'){rep.writeHead(204).end();return;}
  const f=path.join(root,p); fs.readFile(f,(e,d)=>{ if(e){rep.writeHead(404).end('404');return;}
  rep.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); rep.end(d); }); });
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--js-flags=--expose-gc','--enable-precise-memory-info','--force-device-scale-factor=1']});
const ctx = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page = await ctx.newPage();
page.on('console', m=>console.log('['+m.type()+']', m.text().slice(0,400)));
page.on('pageerror', e=>console.log('[pageerror]', String(e).slice(0,900)));
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:180000});
await page.evaluate(()=>window.__BENCH.ready);
for (const c of [0,2]) {
  await page.evaluate(i=>window.__BENCH.setCamera(i), c);
  await page.waitForTimeout(1500);
  await page.evaluate(()=>window.__BENCH.resetStats());
  await page.waitForTimeout(5000);
  console.log('cam'+c, JSON.stringify(await page.evaluate(()=>window.__BENCH.stats())));
  console.log('  timings', JSON.stringify(await page.evaluate(()=>{const f=window.__BENCH._app.stats.frame; return {update:f.updateTime,render:f.renderTime,shadow:f.shadowMapTime,fwd:f.forwardTime,phys:f.physicsTime,cull:f.cullTime};})));
}
await browser.close(); srv.close();
