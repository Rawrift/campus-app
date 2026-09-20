import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildScene } from './scene.js';
import { PhysWorld } from './physics.js';
import { makeDust, makeSmoke, Sparks, Blast, Shockwave } from './vfx.js';

/* ------------------------------------------------------ final colour grade */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.30 },
    uSat: { value: 1.05 },
    uVig: { value: 0.50 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uShadowTint: { value: new THREE.Vector3(-0.004, 0.002, 0.014) },
    uHiTint: { value: new THREE.Vector3(0.016, 0.006, -0.012) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uContrast; uniform float uSat; uniform float uVig;
    uniform vec3 uShadowTint; uniform vec3 uHiTint; uniform vec2 uTexel;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // cheap directional edge softening (1 extra tap pair) to take the worst aliasing off
      vec3 n = texture2D(tDiffuse, vUv + uTexel * vec2( 0.6, -0.6)).rgb;
      vec3 m = texture2D(tDiffuse, vUv + uTexel * vec2(-0.6,  0.6)).rgb;
      float edge = clamp(length(n - m) * 2.4, 0.0, 1.0);
      c = mix(c, (c + n + m) / 3.0, edge * 0.85);
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      // split tone: cool shadows, warm highlights
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l));
      c += uHiTint * smoothstep(0.42, 1.0, l);
      // filmic S curve around a 0.46 pivot, keeps blacks dense
      c = clamp((c - 0.46) * uContrast + 0.46, 0.0, 1.4);
      c = c * c * (3.0 - 2.0 * c) * 0.22 + c * 0.78;
      l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat);
      vec2 d = vUv - 0.5;
      float v = 1.0 - uVig * dot(d, d) * 1.85;
      c *= v;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

const CAMS = [
  { p: [34, 12, 34], t: [0, 4, 0] },
  { p: [0, 1.7, 26], t: [0, 3, 0] },
  { p: [2, 1.7, 6], t: [-6, 2.5, -6] },
  { p: [-4, 1.2, 10], t: [-4.5, 0.8, 8] },
  { p: [10, 3, 12], t: [4, 1, 6] },
  { p: [-28, 6, -20], t: [0, 5, 0] },
];

let renderer, composer, camera, scene, phys, sceneData;
let dust, smoke, sparks, blast, shock, fxaaPass, bloomPass;
let stats = { n: 0, sum: 0, cpu: 0, frames: [], at: 0 };
let lastT = 0, elapsed = 0;
let readyResolve;
const readyPromise = new Promise((r) => { readyResolve = r; });

window.__BENCH = {
  ready: readyPromise,
  loadTimeMs: 0,
  setCamera(i) { applyCamera(i | 0); },
  phase(name) { return runPhase(String(name)); },
  resetStats() { stats.n = 0; stats.sum = 0; stats.cpu = 0; stats.frames.length = 0; stats.at = performance.now(); renderer.info.reset(); },
  stats() {
    const f = stats.frames.slice().sort((a, b) => a - b);
    const p95 = f.length ? f[Math.min(f.length - 1, Math.floor(f.length * 0.95))] : Math.max(1, performance.now() - stats.at);
    // if no frame completed inside the window, report the window itself as a lower bound
    // instead of a misleading 0
    const avg = stats.n ? stats.sum / stats.n : Math.max(1, performance.now() - stats.at);
    const mem = (performance.memory && performance.memory.usedJSHeapSize) ? performance.memory.usedJSHeapSize / 1e6 : 0;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      frameMs: avg,
      p95FrameMs: p95,
      cpuFrameMs: stats.n ? stats.cpu / stats.n : lastCpuMs,
      drawCalls: lastDraw.calls,
      triangles: lastDraw.tris,
      programs: renderer.info.programs ? renderer.info.programs.length : 0,
      bodies: phys ? phys.dynamicCount : 0,
      activeBodies: phys ? (phys.activeBodies || 0) : 0,
      jsHeapMB: mem,
    };
  },
};
const lastDraw = { calls: 0, tris: 0 };
let lastCpuMs = 0;

function applyCamera(i) {
  const c = CAMS[Math.max(0, Math.min(5, i))];
  camera.position.set(c.p[0], c.p[1], c.p[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(c.t[0], c.t[1], c.t[2]);
  camera.updateMatrixWorld(true);
}

/* --------------------------------------------------------------- lighting probe
   Approximates the radiance a dust mote receives, so particles agree with the
   lights that actually exist in the scene. */
function makeLightProbe(sunDir, lights) {
  const winZ = [[-6.7, -4.1], [-3.1, -0.5], [0.5, 3.1], [4.1, 6.7]];
  return function (x, y, z, out) {
    // ambient skylight, bluish, weaker deep inside
    const openness = Math.max(0, 1 - (Math.abs(x) / 13)) * 0.5 + Math.max(0, (z + 8) / 16) * 0.5;
    let r = 0.045 + 0.10 * openness, g = 0.055 + 0.115 * openness, b = 0.075 + 0.14 * openness;
    // sun through the +X window band
    const tx = (11.7 - x) / sunDir.x;
    if (tx > 0) {
      const hy = y + sunDir.y * tx, hz = z + sunDir.z * tx;
      if (hy > 4.35 && hy < 6.25) {
        for (const [a, bz] of winZ) {
          if (hz > a && hz < bz) { r += 1.55; g += 1.22; b += 0.82; break; }
        }
      }
    }
    // sun through the gate
    const tz = (7.7 - z) / sunDir.z;
    if (tz > 0) {
      const hx = x + sunDir.x * tz, hy = y + sunDir.y * tz;
      if (hy > 0 && hy < 5.9 && Math.abs(hx) < 4.9) { r += 0.95; g += 0.78; b += 0.55; }
    }
    // local lamps
    for (const l of lights) {
      const dx = x - l.position.x, dy = y - l.position.y, dz = z - l.position.z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.6;
      const k = Math.min(3.2, (l.intensity / 120) * 5.5 / d2);
      r += k * 1.0; g += k * 0.82; b += k * 0.58;
    }
    const s = 0.16;
    out.setRGB(Math.min(2.4, r * s), Math.min(2.4, g * s), Math.min(2.4, b * s));
  };
}

/* ------------------------------------------------------------------- phases */
let phaseState = { props: false, explosion: false, ragdoll: false, chaos: false };
const pending = [];

function doExplosion(x, y, z, power) {
  const p = power === undefined ? 1 : power;
  phys.explode(x, y, z, 12, 45000 * p);
  blast.burst(x, y + 0.4, z, 200, 1.1 * p);
  sparks.emit(x, y + 0.5, z, 1.4, 150);
  shock.fire(x, Math.max(0.12, y - 0.75), z);
  flash.position.set(x, y + 1.2, z);
  flash.intensity = 1500 * p;
}

async function runPhase(name) {
  try {
    if (name === 'props') {
      if (!phaseState.props) { phaseState.props = true; phys.rainProps(300, 0, 0.5, 21, 13.5, 12, 5.5, -2.5); }
    } else if (name === 'explosion') {
      phaseState.explosion = true;
      doExplosion(0, 1, 0, 1);
    } else if (name === 'ragdoll') {
      if (!phaseState.ragdoll) { phaseState.ragdoll = true; phys.dropRagdolls(8, 6); }
    } else if (name === 'chaos') {
      if (!phaseState.chaos) {
        phaseState.chaos = true;
        let guard = 0;
        while (phys.dynamicCount < 615 && guard++ < 12) {
          phys.rainProps(80, 0, 0.5, 22, 14, 13, 7, -3);
        }
        phys.dropRagdolls(8, 7.2);
        doExplosion(-5.5, 1.2, 2.0, 1);
        pending.push({ t: elapsed + 1.5, fn: () => doExplosion(6.0, 1.2, -2.5, 1) });
        pending.push({ t: elapsed + 3.0, fn: () => doExplosion(0, 1.4, 5.0, 1) });
      }
    }
  } catch (e) {
    console.warn('phase error', e);
  }
  return true;
}

/* --------------------------------------------------------------------- boot */
let flash;

async function boot() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.48;
  renderer.info.autoReset = false;

  sceneData = buildScene(renderer);
  scene = sceneData.scene;

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
  applyCamera(0);

  // explosion flash light
  flash = new THREE.PointLight(0xffb070, 0, 40, 2);
  flash.position.set(0, 2, 0);
  scene.add(flash);

  /* ---- VFX ---- */
  const probe = makeLightProbe(sceneData.sunDir, sceneData.interiorLights);
  dust = makeDust(480, sceneData.sprites.dot, probe);
  scene.add(dust);
  smoke = makeSmoke(150, sceneData.sprites.smoke, { x: 15.6, y: 1.0, z: -6.2 }, 0xffe3bb);
  scene.add(smoke);
  sparks = new Sparks(360, sceneData.sprites.dot);
  scene.add(sparks.points);
  blast = new Blast(420, sceneData.sprites.smoke);
  scene.add(blast.points);
  shock = new Shockwave(scene);

  // burning drum that feeds the smoke column
  {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.92, 16, 1),
      sceneData.M.rust
    );
    drum.position.set(15.6, 0.46, -6.2);
    drum.castShadow = true; drum.receiveShadow = true;
    scene.add(drum);
    const ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16, 1),
      new THREE.MeshStandardMaterial({ color: 0x220a02, emissive: new THREE.Color(0xff5a12), emissiveIntensity: 5, roughness: 0.8 })
    );
    ember.position.set(15.6, 0.93, -6.2);
    scene.add(ember);
    const fl = new THREE.PointLight(0xff7a28, 55, 14, 2);
    fl.position.set(15.6, 1.25, -6.2);
    scene.add(fl);
    sceneData.fireLight = fl;
  }

  /* ---- physics ---- */
  await RAPIER.init();
  phys = new PhysWorld(RAPIER, sceneData, scene, (x, y, z, s) => sparks.emit(x, y, z, s));
  phys.buildInitialProps();
  phys.buildChain(-3.4, 7.30, 2.2, 12);
  phys.buildSign(0, 6.62, 8.55, scene);
  phys.addRagdoll(-2.2, 1.35, 3.6, 0.4, 0, 0.2);

  // settle: 220 fixed steps so pyramids, chain, sign and ragdoll come to rest
  for (let i = 0; i < 220; i++) phys.world.step();
  phys.sync();

  /* ---- post ---- */
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(400, 225), 0.26, 0.58, 2.30);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(GradeShader);
  fxaaPass.material.uniforms.uTexel.value.set(1 / window.innerWidth, 1 / window.innerHeight);
  composer.addPass(fxaaPass);

  // compile everything up front so the first measured frames are not stalls
  renderer.compile(scene, camera);
  for (let i = 0; i < 6; i++) { applyCamera(i); composer.render(); }
  applyCamera(0);

  window.addEventListener('resize', onResize);
  lastT = performance.now();
  requestAnimationFrame(loop);

  window.__DBG = { THREE, renderer, composer, scene, camera, sceneData, phys, dust, smoke, sparks, blast };
  window.__BENCH.loadTimeMs = performance.now();
  window.__BENCH.counts = Object.assign({}, sceneData.counts, {
    dynamicBodies: phys.dynamicCount, chainLinks: phys.chainLinks, ragdolls: phys.ragdollCount,
  });
  readyResolve();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  if (fxaaPass) fxaaPass.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const wall = now - lastT;
  let dt = wall / 1000;
  lastT = now;
  if (dt > 0.3) dt = 0.3;
  elapsed += dt;

  for (let i = pending.length - 1; i >= 0; i--) {
    if (elapsed >= pending[i].t) { const fn = pending[i].fn; pending.splice(i, 1); fn(); }
  }

  phys.step(dt);
  phys.sync();

  dust.material.uniforms.uTime.value = elapsed;
  smoke.material.uniforms.uTime.value = elapsed;
  sparks.update(dt);
  blast.update(dt);
  shock.update(dt);
  if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 2600);
  if (sceneData.fireLight) sceneData.fireLight.intensity = 24 + Math.sin(elapsed * 11.3) * 5 + Math.sin(elapsed * 4.1) * 3;

  renderer.info.reset();
  composer.render();
  lastDraw.calls = renderer.info.render.calls;
  lastDraw.tris = renderer.info.render.triangles;

  const ft = wall;                 // wall-clock interval between presented frames
  lastCpuMs = performance.now() - now;
  stats.n++; stats.sum += ft; stats.cpu += lastCpuMs;
  if (stats.frames.length < 4000) stats.frames.push(ft);
}

boot().catch((e) => {
  console.error('boot failed', e);
  readyResolve();
});
