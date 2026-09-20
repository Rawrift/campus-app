#!/usr/bin/env node
// A/B/C/D ciego para N candidatos: baraja, copia como 1.png..N.png, monta rejilla, guarda clave aparte.
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const outDir = path.resolve(args[args.length-2]); const keyDir = path.resolve(args[args.length-1]);
const imgs = args.slice(0, -2);
fs.mkdirSync(outDir,{recursive:true}); fs.mkdirSync(keyDir,{recursive:true});
const letters = ['A','B','C','D','E','F'];
const order = imgs.map((p,i)=>({p,i})).sort(()=>Math.random()-0.5);
const key = {};
order.forEach((o,n)=>{ key[letters[n]] = path.resolve(o.p); fs.copyFileSync(o.p, path.join(outDir, letters[n]+'.png')); });
fs.writeFileSync(path.join(keyDir, path.basename(outDir)+'.clave.json'), JSON.stringify(key,null,2));
const cells = order.map((o,n)=>`<div class=c><img src="data:image/png;base64,${fs.readFileSync(o.p).toString('base64')}"><div class=l>${letters[n]}</div></div>`).join('');
const cols = Math.min(order.length, 2);
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#0b0b0d;font:700 26px system-ui;color:#fff}
.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:5px}.c{position:relative}img{width:100%;display:block}
.l{position:absolute;top:10px;left:10px;background:#000d;padding:6px 18px;border-radius:6px;letter-spacing:3px}</style><div class=g>${cells}</div>`;
const tmp=path.join(outDir,'_g.html'); fs.writeFileSync(tmp,html);
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const pg=await br.newPage({viewport:{width:2600,height:1480}});
await pg.goto('file://'+tmp); await pg.waitForTimeout(600);
await pg.screenshot({path:path.join(outDir,'GRID.png'),fullPage:true}); await br.close(); fs.unlinkSync(tmp);
console.log(JSON.stringify({outDir,grid:path.join(outDir,'GRID.png'),n:order.length},null,1));
