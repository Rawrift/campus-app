const { chromium } = require('/home/user/campus-app/node_modules/playwright');
const fs = require('fs');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8791/index.html';
  const out = process.argv[3] || '/home/user/campus-app/gauntlet/tech/godot-probe/shots/shot.png';
  const waitMs = parseInt(process.argv[4] || '25000', 10);
  const t0 = Date.now();
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--disable-dev-shm-usage', '--enable-features=SharedArrayBuffer']
  });
  const ctx = await browser.newContext({ viewport: { width: +(process.env.VW||1280), height: +(process.env.VH||720) } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push('[console.' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => logs.push('[reqfail] ' + r.url() + ' ' + (r.failure() || {}).errorText));

  const tNav = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const loadMs = Date.now() - tNav;

  const env = await page.evaluate(() => ({
    crossOriginIsolated: self.crossOriginIsolated,
    hasSAB: typeof SharedArrayBuffer !== 'undefined',
    gpu: typeof navigator.gpu,
    ua: navigator.userAgent
  }));

  let ready = null;
  try {
    await page.waitForFunction('window.__godot_ready === true', { timeout: waitMs });
    ready = Date.now() - tNav;
  } catch (e) { logs.push('[timeout] __godot_ready never set within ' + waitMs + 'ms'); }

  // let physics run / frames accumulate
  await page.waitForTimeout(parseInt(process.argv[5] || '6000', 10));

  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    let webgl = null;
    try {
      const g = c && (c.getContext('webgl2', {preserveDrawingBuffer:true}) || null);
      if (g) webgl = { version: g.getParameter(g.VERSION), renderer: g.getParameter(g.RENDERER) };
    } catch (e) {}
    return {
      canvas: c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null,
      readyMs: window.__godot_ready_ms || null,
      firstFramesMs: window.__godot_first_frames || null,
      frames: window.__godot_frames || null,
      fps: window.__godot_fps || null,
      webgl
    };
  });

  fs.mkdirSync(require('path').dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  const total = Date.now() - t0;
  console.log(JSON.stringify({ loadMs, readyMs_fromNav: ready, totalMs: total, env, stats }, null, 2));
  console.log('--- browser logs ---');
  console.log(logs.slice(0, 60).join('\n'));
  await browser.close();
})();
