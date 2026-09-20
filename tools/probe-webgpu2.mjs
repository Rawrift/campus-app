import { chromium } from 'playwright';
const BINS = {
  'pw-chromium-1194': '/opt/pw-browsers/chromium',
  'pw-headless-shell': '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
};
const FLAGS = {
  'sin-flags': ['--no-sandbox'],
  'swiftshader-gl': ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'],
  'webgpu-forzado': ['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader'],
};
for (const [bn, bin] of Object.entries(BINS)) {
  for (const [fn, args] of Object.entries(FLAGS)) {
    let b;
    try {
      b = await chromium.launch({ executablePath: bin, args });
      const p = await b.newPage();
      const v = await p.evaluate(() => navigator.userAgent);
      const r = await p.evaluate(async () => {
        const out = { tipo: typeof navigator.gpu, hayGpu: !!navigator.gpu };
        if (!navigator.gpu) return out;
        try {
          const a = await navigator.gpu.requestAdapter();
          out.adaptador = !!a;
          if (a) { const d = await a.requestDevice(); out.dispositivo = !!d;
            out.info = a.info ? {vendor:a.info.vendor, arch:a.info.architecture, desc:a.info.description} : null; }
        } catch (e) { out.error = String(e).slice(0,160); }
        // ¿se puede crear un contexto webgpu en un canvas?
        try { const c=document.createElement('canvas'); out.ctx = !!c.getContext('webgpu'); } catch(e){ out.ctx='err'; }
        return out;
      });
      console.log(`### ${bn} | ${fn} | ${v.match(/Chrome\/[\d.]+/)?.[0]} :: ${JSON.stringify(r)}`);
      await b.close();
    } catch (e) { console.log(`### ${bn} | ${fn} :: LANZAMIENTO FALLIDO ${String(e).slice(0,120)}`); if(b) await b.close().catch(()=>{}); }
  }
}
