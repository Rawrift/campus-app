import { chromium } from 'playwright';
const SETS = {
  'A_dawn_swiftshader': ['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-webgpu-adapter=swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'],
  'B_vulkan_only':      ['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-dev-shm-usage'],
  'C_headful_xvfb_like':['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU,VulkanFromANGLE','--use-webgpu-adapter=swiftshader','--disable-dev-shm-usage','--disable-gpu-sandbox'],
};
for (const [n,args] of Object.entries(SETS)) {
  let b;
  try {
    b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args, headless:true });
    const p = await b.newPage();
    const r = await p.evaluate(async () => {
      if (!navigator.gpu) return {gpu:false};
      try { const a = await navigator.gpu.requestAdapter(); if(!a) return {gpu:true, adapter:false};
        const d = await a.requestDevice();
        return {gpu:true, adapter:true, device:!!d, info: a.info ? {...a.info} : null, limits:{maxBufSize:a.limits.maxBufferSize}};
      } catch(e){ return {gpu:true, err:String(e)}; }
    });
    console.log('###',n,JSON.stringify(r));
    await b.close();
  } catch(e){ console.log('###',n,'FAIL',String(e).slice(0,200)); if(b) await b.close().catch(()=>{}); }
}
