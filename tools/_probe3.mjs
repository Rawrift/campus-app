import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/campus-app/gauntlet/tech/babylon-havok';
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p.endsWith('/'))p+='index.html';
 fs.readFile(path.join(root,p),(e,d)=>{ if(e){r.writeHead(404).end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'}); r.end(d);});});
await new Promise(r=>srv.listen(9348,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--force-device-scale-factor=1']});
const ctx=await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PERR',String(e).slice(0,200)));
await page.goto('http://127.0.0.1:9348/',{waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__BENCH && window.__BENCH.ready',null,{timeout:120000});
await page.evaluate(()=>window.__BENCH.ready);
await page.evaluate(()=>window.__BENCH.setCamera(1));
await page.waitForTimeout(8000);
async function shot(n,fn){ if(fn) await page.evaluate(fn); await page.waitForTimeout(7000); await page.screenshot({path:'/tmp/dbg_'+n+'.png'}); console.log('shot',n); }
await shot('Q1_zerobias', ()=>{const c=window.__DBG.csm; c.bias=0; c.normalBias=0; c.darkness=0;});
await shot('Q2_cam0', ()=>{window.__BENCH.setCamera(0);});
await b.close(); srv.close();
