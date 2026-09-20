import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const root = path.resolve(process.argv[2]);
const out = process.argv[3] || '/tmp/smoke';
const camList = (process.argv[4]||'0').split(',').map(Number);
fs.mkdirSync(out,{recursive:true});
const PORT = 9700+Math.floor(Math.random()*200);
const srv = http.createServer((req,rep)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  const f=path.join(root,p); fs.readFile(f,(e,d)=>{ if(e){rep.writeHead(404).end('404');return;}
  rep.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); rep.end(d); }); });
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--js-flags=--expose-gc','--enable-precise-memory-info','--force-device-scale-factor=1']});
const ctx = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page = await ctx.newPage();
page.on('console', m=>console.log('['+m.type()+']', m.text().slice(0,500)));
page.on('pageerror', e=>console.log('[pageerror]', String(e).slice(0,1200)));
const t0=Date.now();
try {
  await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:120000});
  await page.evaluate(()=>window.__BENCH.ready);
  console.log('READY in', Date.now()-t0,'ms');
  for (const c of camList) {
    await page.evaluate(i=>window.__BENCH.setCamera(i), c);
    await page.waitForTimeout(2500);
    await page.screenshot({path: path.join(out,`cam${c}.png`)});
    await page.evaluate(()=>window.__BENCH.resetStats());
    await page.waitForTimeout(3000);
    console.log('cam'+c, JSON.stringify(await page.evaluate(()=>window.__BENCH.stats())));
  }
} catch(e){ console.log('FAIL', String(e).slice(0,800)); await page.screenshot({path:path.join(out,'fail.png')}).catch(()=>{}); }
await browser.close(); srv.close();
