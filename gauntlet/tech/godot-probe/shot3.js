const { chromium } = require('/home/user/campus-app/node_modules/playwright');
(async () => {
  const [url, out, waitMs] = [process.argv[2], process.argv[3], parseInt(process.argv[4]||'10000',10)];
  const t0 = Date.now();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: +(process.env.VW||1280), height: +(process.env.VH||720) } })).newPage();
  const logs=[]; page.on('pageerror',e=>logs.push('[pageerror] '+e.message)); page.on('console',m=>logs.push('[c.'+m.type()+'] '+m.text()));
  const tNav = Date.now();
  await page.goto(url, { waitUntil:'load', timeout:60000 });
  await page.waitForFunction('window.__three_ready === true', { timeout: 30000 }).catch(()=>logs.push('[timeout] never ready'));
  const readyMs = Date.now() - tNav;
  await page.evaluate(()=>{ window.__three_frames=0; }); // reset counter window
  await page.evaluate(()=>{ window.__t0=performance.now(); });
  await page.waitForTimeout(waitMs);
  const stats = await page.evaluate(()=>({ frames: window.__three_frames, fpsWindow: Math.round(window.__three_frames/((performance.now()-window.__t0)/1000)), cumFps: window.__three_fps }));
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ readyMs, totalMs: Date.now()-t0, stats }, null, 2));
  console.log(logs.slice(0,20).join('\n'));
  await browser.close();
})();
