import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/campus-app/gauntlet/tech/babylon-havok';
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p.endsWith('/'))p+='index.html';
 fs.readFile(path.join(root,p),(e,d)=>{ if(e){r.writeHead(404).end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); r.end(d);});});
await new Promise(r=>srv.listen(9349,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--force-device-scale-factor=1']});
const ctx=await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PERR',String(e).slice(0,300)));
await page.goto('http://127.0.0.1:9349/',{waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:120000});
await page.evaluate(()=>window.__BENCH.ready);
await page.evaluate(()=>window.__BENCH.setCamera(1));
await page.waitForTimeout(8000);
const r = await page.evaluate(()=>{
  const {scene,csm,sun} = window.__DBG;
  const sm = csm.getShadowMap();
  let ready=0,total=0,names=[];
  for (const m of sm.renderList) {
    const ti = !!(m.hasThinInstances);
    for (const sub of (m.subMeshes||[])) {
      total++;
      let ok=false; try{ ok = csm.isReady(sub, ti, false); }catch(e){ ok='ERR:'+e.message; }
      if(ok===true) ready++; else if(names.length<6) names.push(m.name+' ti='+ti+' -> '+ok);
    }
  }
  return {renderList: sm.renderList.length, total, ready, notReady: names,
    size:[sm.getRenderWidth(), sm.getRenderHeight()],
    ortho:[sun.orthoLeft,sun.orthoRight,sun.orthoBottom,sun.orthoTop,sun.shadowMinZ,sun.shadowMaxZ],
    pos: sun.position.asArray(), filter: csm.filter };
});
console.log(JSON.stringify(r,null,1));
await b.close(); srv.close();
