import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/campus-app/gauntlet/tech/babylon-havok';
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p.endsWith('/'))p+='index.html';
 fs.readFile(path.join(root,p),(e,d)=>{ if(e){r.writeHead(404).end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); r.end(d);});});
await new Promise(r=>srv.listen(9350,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--force-device-scale-factor=1']});
const ctx=await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PERR',String(e).slice(0,300)));
await page.goto('http://127.0.0.1:9350/',{waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:120000});
await page.evaluate(()=>window.__BENCH.ready);
await page.evaluate(()=>window.__BENCH.setCamera(1));
await page.waitForTimeout(6000);
console.log('renderList', await page.evaluate(()=>window.__DBG.csm.getShadowMap().renderList.length));
async function shot(n,fn){ if(fn) await page.evaluate(fn); await page.waitForTimeout(7000); await page.screenshot({path:'/tmp/dbg_'+n+'.png'}); console.log('shot',n); }
// mostrar el shadow map en un plano delante de la camara
await shot('S1_showmap', ()=>{
  const {scene,csm,camera} = window.__DBG;
  const B = csm.getShadowMap();
  const p = scene.getMeshByName('dbgplane') || (()=>{
    const BJS = camera.constructor;
    const mesh = scene.meshes.find(m=>m.name==='skybox');
    return null;
  })();
  const plane = scene.getMeshByName('slab').clone('dbgclone');
  return 'n/a';
});
await shot('S2_autoclear', ()=>{ window.__DBG.scene.autoClear = true; });
await shot('S3_pcf', ()=>{ const c=window.__DBG.csm; c.useExponentialShadowMap=false; c.usePercentageCloserFiltering=true; c.filteringQuality=2; });
await b.close(); srv.close();
