import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/home/user/campus-app/gauntlet/tech/babylon-havok';
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm'};
const srv = http.createServer((req,rep)=>{let p=req.url.split('?')[0]; if(p.endsWith('/'))p+='index.html';
  fs.readFile(path.join(root,p),(e,d)=>{ if(e){rep.writeHead(404).end();return;}
    rep.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); rep.end(d);});});
await new Promise(r=>srv.listen(9346,'127.0.0.1',r));
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--force-device-scale-factor=1']});
const ctx = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page = await ctx.newPage();
page.on('pageerror',e=>console.log('PERR',String(e).slice(0,200)));
await page.goto('http://127.0.0.1:9346/',{waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:120000});
await page.evaluate(()=>window.__BENCH.ready);
await page.evaluate(()=>window.__BENCH.setCamera(0));
await page.waitForTimeout(15000);
async function m(tag, fn){
  if(fn) await page.evaluate(fn);
  await page.waitForTimeout(6000);
  await page.evaluate(()=>window.__BENCH.resetStats());
  await page.waitForTimeout(9000);
  const s = await page.evaluate(()=>window.__BENCH.stats());
  console.log(tag.padEnd(24),'fps',s.fps.toFixed(2),'ms',s.frameMs.toFixed(0),'dc',s.drawCalls,'prog',s.programs);
}
await m('A baseline');
await m('B sin pipeline', ()=>{window.__DBG.pipe.dispose();});
await m('C sin env(IBL)', ()=>{window.__DBG.scene.environmentTexture=null;});
await m('D sin sombras', ()=>{window.__DBG.csm.dispose();});
await m('E 1 luz', ()=>{const s=window.__DBG.scene; s.materials.forEach(m=>{if(m.maxSimultaneousLights!==undefined)m.maxSimultaneousLights=1;});});
await browser.close(); srv.close();
