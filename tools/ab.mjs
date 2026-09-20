#!/usr/bin/env node
// Prepara un juicio A/B CIEGO: copia dos imágenes como A.png/B.png en orden aleatorio,
// genera un montaje lado a lado, y guarda el mapeo en un fichero SEPARADO que el crítico no ve.
// uso: node tools/ab.mjs <img1> <img2> <outDir> [claveSecretaDir]
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const [i1, i2, outDirArg, keyDirArg] = process.argv.slice(2);
const outDir = path.resolve(outDirArg);
const keyDir = path.resolve(keyDirArg || path.join(outDir, '..', '_claves'));
fs.mkdirSync(outDir, {recursive:true}); fs.mkdirSync(keyDir, {recursive:true});

const flip = Math.random() < 0.5;
const A = flip ? i2 : i1, B = flip ? i1 : i2;
fs.copyFileSync(A, path.join(outDir,'A.png'));
fs.copyFileSync(B, path.join(outDir,'B.png'));
const key = { A: path.resolve(A), B: path.resolve(B), createdAt: new Date().toISOString() };
const keyFile = path.join(keyDir, path.basename(outDir)+'.clave.json');
fs.writeFileSync(keyFile, JSON.stringify(key,null,2));

const a64 = fs.readFileSync(A).toString('base64');
const b64 = fs.readFileSync(B).toString('base64');
const html = `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#0b0b0d;font:600 22px system-ui;color:#fff;display:flex;flex-direction:column}
.row{display:flex;gap:4px}.c{flex:1;position:relative}
img{width:100%;display:block}
.l{position:absolute;top:10px;left:10px;background:#000c;padding:6px 16px;border-radius:6px;letter-spacing:2px}
</style><div class=row>
<div class=c><img src="data:image/png;base64,${a64}"><div class=l>A</div></div>
<div class=c><img src="data:image/png;base64,${b64}"><div class=l>B</div></div>
</div>`;
const tmp = path.join(outDir,'_sbs.html'); fs.writeFileSync(tmp, html);
const br = await chromium.launch({executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const pg = await br.newPage({viewport:{width:2600,height:740}});
await pg.goto('file://'+tmp); await pg.waitForTimeout(500);
await pg.screenshot({path: path.join(outDir,'AB.png'), fullPage:true});
await br.close(); fs.unlinkSync(tmp);
console.log(JSON.stringify({outDir, ab: path.join(outDir,'AB.png'), keyFile}, null, 1));
