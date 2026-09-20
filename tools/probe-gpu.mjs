import { chromium } from 'playwright';

const FLAGSETS = {
  'swiftshader-webgpu': [
    '--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
    '--enable-features=Vulkan','--enable-unsafe-webgpu','--disable-dev-shm-usage'
  ],
  'swiftshader-gl-only': [
    '--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'
  ],
};

for (const [name, args] of Object.entries(FLAGSETS)) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
    const page = await browser.newPage();
    const res = await page.evaluate(async () => {
      const out = { webgl2: null, webgpu: null, ext: [] };
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        out.webgl2 = {
          vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxSamples: gl.getParameter(gl.MAX_SAMPLES),
          drawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
        };
        out.ext = gl.getSupportedExtensions().filter(e=>/float|aniso|compress|s3tc|etc|astc|depth/i.test(e));
      }
      if (navigator.gpu) {
        try {
          const ad = await navigator.gpu.requestAdapter();
          if (ad) {
            const info = ad.info || (ad.requestAdapterInfo ? await ad.requestAdapterInfo() : {});
            out.webgpu = { ok: true, vendor: info.vendor, architecture: info.architecture, description: info.description,
                           features: [...ad.features].slice(0,12) };
          } else out.webgpu = { ok:false, reason:'no adapter' };
        } catch(e) { out.webgpu = { ok:false, reason: String(e) }; }
      } else out.webgpu = { ok:false, reason:'navigator.gpu undefined' };
      return out;
    });
    console.log('###', name, JSON.stringify(res, null, 1));
    await browser.close();
  } catch (e) {
    console.log('###', name, 'LAUNCH FAIL', String(e).slice(0,300));
    if (browser) await browser.close().catch(()=>{});
  }
}
