import {
  Engine, Scene, UniversalCamera, Vector3, Color3, Color4, Quaternion,
  DirectionalLight, SpotLight, PointLight, ShadowGenerator,
  DefaultRenderingPipeline, SSAO2RenderingPipeline, ImageProcessingConfiguration,
  HavokPlugin, PhysicsMotionType, SceneInstrumentation, RenderTargetTexture,
  MeshBuilder, Light, Constants, StandardMaterial,
} from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import { buildMaterials } from './materials.js';
import { buildWorld } from './world.js';
import { buildSkybox, buildEnvironment, makeCloudField } from './sky.js';
import { PropWorld, initialLayout } from './props.js';
import { buildRagdollProtos, spawnRagdoll } from './ragdoll.js';
import { buildChain, buildSign } from './linkage.js';
import { buildVFX } from './vfx.js';
import { mulberry32 } from './noise.js';
import { PhysicsBody, PhysicsShapeBox } from '@babylonjs/core';
import { TransformNode } from '@babylonjs/core';

const CAMS = [
  [[34, 12, 34], [0, 4, 0]],
  [[0, 1.7, 26], [0, 3, 0]],
  [[2, 1.7, 6], [-6, 2.5, -6]],
  [[-4, 1.2, 10], [-4.5, 0.8, 8]],
  [[10, 3, 12], [4, 1, 6]],
  [[-28, 6, -20], [0, 5, 0]],
];

let resolveReady;
const readyPromise = new Promise((r) => { resolveReady = r; });
window.__BENCH = {
  ready: readyPromise, loadTimeMs: 0,
  setCamera: () => {}, phase: async () => {}, resetStats: () => {},
  stats: () => ({ fps: 0, frameMs: 0, p95FrameMs: 0, drawCalls: 0, triangles: 0, programs: 0, bodies: 0, activeBodies: 0, jsHeapMB: 0 }),
};

async function boot() {
  const canvas = document.getElementById('c');
  const engine = new Engine(canvas, false, {
    preserveDrawingBuffer: false, stencil: false, antialias: false,
    deterministicLockstep: true, lockstepMaxSteps: 8, timeStep: 1 / 60,
    powerPreference: 'high-performance', doNotHandleContextLost: true,
    failIfMajorPerformanceCaveat: false,
  }, false);
  engine.setHardwareScalingLevel(1);
  engine.enableOfflineSupport = false;

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);
  scene.skipPointerMovePicking = true;
  scene.constantlyUpdateMeshUnderPointer = false;
  scene.autoClearDepthAndStencil = true;

  scene.blockMaterialDirtyMechanism = true;

  const camera = new UniversalCamera('cam', new Vector3(34, 12, 34), scene);
  camera.fov = (55 * Math.PI) / 180;
  camera.fovMode = UniversalCamera.FOVMODE_VERTICAL_FIXED;
  camera.minZ = 0.1; camera.maxZ = 500;
  camera.inputs.clear();
  camera.setTarget(new Vector3(0, 4, 0));
  scene.activeCamera = camera;

  // ---------------- fisica ----------------
  const wasmUrl = new URL('./HavokPhysics.wasm', import.meta.url).href;
  const res = await fetch(wasmUrl);
  const wasmBinary = new Uint8Array(await res.arrayBuffer());
  const hk = await HavokPhysics({ wasmBinary });
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  const physicsEngine = scene.getPhysicsEngine();
  physicsEngine.setTimeStep(1 / 60);

  // ---------------- cielo / IBL ----------------
  const sunDir = new Vector3(-0.84, 0.40, 0.37).normalize();
  const field = makeCloudField();
  const { cube: envCube, skyCube } = buildEnvironment(scene, sunDir, field, 320, 48);
  scene.environmentTexture = envCube;
  scene.environmentIntensity = 0.80;
  const sky = buildSkybox(scene, sunDir, skyCube);

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0031;
  scene.fogColor = new Color3(0.50, 0.495, 0.49);

  // ---------------- luces ----------------
  const sun = new DirectionalLight('sun', sunDir.scale(-1), scene);
  sun.intensity = 6.2;
  sun.diffuse = new Color3(1.0, 0.855, 0.66);
  sun.specular = new Color3(1.0, 0.92, 0.80);

  const fireLight = new PointLight('fireL', new Vector3(11.2, 1.25, 17.0), scene);
  fireLight.diffuse = new Color3(1.0, 0.46, 0.15);
  fireLight.specular = new Color3(1.0, 0.5, 0.2);
  fireLight.intensity = 22; fireLight.range = 16;

  // NOTA: CascadedShadowGenerator NO funciona en este contenedor (SwiftShader
  // solo devuelve sombra de la cascada 0; las capas >0 del texture array salen
  // vacias). Se usa un unico mapa de sombras ortografico de alta resolucion
  // ajustado a mano al recinto, que da 3,5 cm/texel y si funciona.
  // 1) El calculo automatico de extents de Babylon da un volumen inservible con
  //    mallas fusionadas + freezeWorldMatrix -> se fija a mano.
  // 2) Un shadow map de 2048 se queda VACIO en SwiftShader (sin error). 1024 si
  //    funciona. Idem CascadedShadowGenerator: solo la cascada 0 produce sombra.
  const SUN_DIST = 80;
  sun.position = new Vector3(0, 4, 0).subtract(sunDir.scale(-SUN_DIST));
  sun.autoUpdateExtends = false;
  sun.autoCalcShadowZBounds = false;
  sun.orthoLeft = -38; sun.orthoRight = 38;
  sun.orthoBottom = -38; sun.orthoTop = 38;
  sun.shadowMinZ = 8; sun.shadowMaxZ = 168;

  const csm = new ShadowGenerator(1024, sun);
  csm.usePercentageCloserFiltering = true;
  csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  csm.bias = 0.0011;
  csm.normalBias = 0.055;
  csm.darkness = 0.0;
  csm.transparencyShadow = false;
  csm.forceBackFacesOnly = false;

  // ---------------- materiales y mundo ----------------
  const M = buildMaterials(scene);
  const colliders = [];
  const world = buildWorld(scene, M, colliders);

  const spots = [];
  for (const [lx, ly, lz] of world.interiorLampPos) {
    const sp = new SpotLight('sp', new Vector3(lx, ly - 0.05, lz), new Vector3(0, -1, 0), 1.7, 2.2, scene);
    sp.diffuse = new Color3(1.0, 0.74, 0.46);
    sp.specular = new Color3(1.0, 0.82, 0.60);
    sp.intensity = 48; sp.range = 17;
    sp.shadowEnabled = false;
    spots.push(sp);
  }
  for (const m of world.casters) csm.addShadowCaster(m, false);
  for (const m of world.receivers) m.receiveShadows = true;

  // colliders estaticos
  for (const c of colliders) {
    const t = new TransformNode('sc', scene);
    t.position.set(c.x, c.y, c.z);
    if (c.ry) t.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), c.ry);
    const b = new PhysicsBody(t, PhysicsMotionType.STATIC, false, scene);
    const sh = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(c.w, c.h, c.d), scene);
    sh.material = { friction: 0.75, restitution: 0.08 };
    b.shape = sh;
  }

  // ---------------- props dinamicos ----------------
  const PW = new PropWorld(scene, M, csm);
  const rnd = mulberry32(4242);
  const L = initialLayout(rnd);
  for (const k in L) PW.addBatch(k, L[k]);

  buildChain(scene, M, csm, PW.singles, -3.6, 6.95, -0.6, 13);
  buildSign(scene, M, csm, PW.singles, 0, 7.62, 8.62);

  const rdProtos = buildRagdollProtos(scene, M, csm);

  // ---------------- VFX ----------------
  const V = buildVFX(scene, sunDir);
  for (const z of [-6, -2, 2, 6]) V.mkShaft(new Vector3(-12.0, 5.55, z), 2.4, 12.0, 0.75);
  V.mkShaft(new Vector3(0, 5.6, 8.2), 9.0, 14.0, 0.34);
  // bidon que humea
  {
    const b = MeshBuilder.CreateCylinder('fireBarrel', { height: 1.0, diameter: 0.62, tessellation: 16 }, scene);
    b.position.set(11.2, 0.5, 17.0);
    b.material = M.rust;
    b.freezeWorldMatrix(); b.isPickable = false;
    csm.addShadowCaster(b, false);
  }

  // ---------------- post proceso ----------------
  // Tone mapping aplicado DENTRO de los materiales (no por post-proceso):
  // evita el render target half-float, que en SwiftShader es carisimo, y evita
  // el clipping de altas luces antes del tone mapping.
  const ipc = scene.imageProcessingConfiguration;
  ipc.applyByPostProcess = false;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ipc.exposure = 1.05;
  ipc.contrast = 1.32;
  ipc.vignetteEnabled = false;

  const pipe = new DefaultRenderingPipeline('def', false, scene, [camera]);
  pipe.samples = 1;
  pipe.fxaaEnabled = false;
  pipe.imageProcessingEnabled = false;
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.80;
  pipe.bloomWeight = 0.55;
  pipe.bloomKernel = 26;
  pipe.bloomScale = 0.35;
  scene.imageProcessingConfiguration.applyByPostProcess = false;

  // ---------------- instrumentacion ----------------
  const inst = new SceneInstrumentation(scene);
  inst.captureFrameTime = false;
  let frames = 0, tStart = performance.now(), times = [], lastT = performance.now();
  scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    times.push(now - lastT);
    lastT = now;
    frames++;
  });

  const stepPhysics = (n) => { for (let i = 0; i < n; i++) physicsEngine._step(1 / 60); };

  // ---------------- API de banco ----------------
  let phaseSeq = Promise.resolve();
  const rndP = mulberry32(99001);
  const RP = (a, b) => a + (b - a) * rndP();

  function spawnProps(count) {
    const kinds = ['crate', 'barrel', 'tire', 'crateS', 'beam', 'drumB', 'sphere'];
    const buckets = {};
    for (const k of kinds) buckets[k] = [];
    for (let i = 0; i < count; i++) {
      const k = kinds[i % kinds.length];
      buckets[k].push([RP(-13, 13), 12 + RP(0, 9), RP(-9.5, 10.5), RP(0, 3.1), RP(0, 3.1), RP(0, 3.1)]);
    }
    for (const k of kinds) PW.addBatch(k, buckets[k]);
  }
  function spawnRagdolls(n, cy) {
    for (let i = 0; i < n; i++) {
      spawnRagdoll(scene, rdProtos, RP(-9, 9), cy + RP(0, 2.2), RP(-6.5, 6.5), RP(0, 6.28), PW.singles);
    }
  }
  function doExplosion(cx, cy, cz) {
    const c = new Vector3(cx, cy, cz);
    const hot = PW.explode(c, 12, 45000);
    V.blastAt(c);
    for (let i = 0; i < Math.min(hot.length, 10); i++) V.burst(hot[i], 26);
    V.burst(c, 90);
  }

  const impactWatch = [];
  scene.onBeforeRenderObservable.add(() => {
    sky.position.copyFrom(camera.globalPosition);
    PW.sanitize();
  });

  window.__BENCH = {
    ready: readyPromise,
    loadTimeMs: 0,
    setCamera(i) {
      const c = CAMS[Math.max(0, Math.min(5, i | 0))];
      camera.position.set(c[0][0], c[0][1], c[0][2]);
      camera.setTarget(new Vector3(c[1][0], c[1][1], c[1][2]));
    },
    phase(name) {
      phaseSeq = phaseSeq.then(async () => {
        try {
          if (name === 'props') { spawnProps(300); }
          else if (name === 'explosion') { doExplosion(0, 1, 0); }
          else if (name === 'ragdoll') { spawnRagdolls(8, 6); }
          else if (name === 'chaos') {
            spawnProps(224);
            spawnRagdolls(8, 7.5);
            doExplosion(0, 1, 0);
            setTimeout(() => { try { doExplosion(-6.5, 1.2, -3); } catch (e) {} }, 700);
            setTimeout(() => { try { doExplosion(6.0, 1.2, 4.5); } catch (e) {} }, 1600);
          }
        } catch (e) { console.warn('phase error', e); }
      });
      return phaseSeq;
    },
    resetStats() { frames = 0; times = []; tStart = performance.now(); lastT = performance.now(); },
    stats() {
      const elapsed = (performance.now() - tStart) / 1000;
      const sorted = times.slice().sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      let dc = 0;
      try { dc = inst.drawCallsCounter.current; } catch (e) { dc = engine._drawCalls ? engine._drawCalls.current : 0; }
      let programs = 0;
      try { programs = Object.keys(engine._compiledEffects || {}).length; } catch (e) {}
      return {
        fps: elapsed > 0 ? frames / elapsed : 0,
        frameMs: avg,
        p95FrameMs: p95,
        drawCalls: dc,
        triangles: Math.round(scene.getActiveIndices() / 3),
        programs,
        bodies: PW.bodyCount,
        activeBodies: PW.countActive(),
        jsHeapMB: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0,
      };
    },
  };

  if (location.hash.includes('smdbg')) {
    const q = MeshBuilder.CreatePlane('smdbg', { size: 2.0 }, scene);
    const qm = new StandardMaterial('smdbgm', scene);
    qm.emissiveTexture = csm.getShadowMap();
    qm.disableLighting = true;
    qm.emissiveColor = new Color3(1, 1, 1);
    q.material = qm; q.applyFog = false; q.isPickable = false;
    scene.onBeforeRenderObservable.add(() => {
      q.position.copyFrom(camera.position).addInPlace(camera.getDirection(new Vector3(0, 0, 1)).scale(2.0));
      q.rotation.copyFrom(camera.rotation);
    });
  }

  window.__DBG = { scene, engine, camera, csm, sun, spots, fireLight, pipe, PW, V, M, world };

  // ---------------- preparacion ----------------
  scene.blockMaterialDirtyMechanism = false;
  await scene.whenReadyAsync();
  stepPhysics(150);

  // precompilado de shaders recorriendo las camaras
  for (let i = 0; i < 6; i++) {
    window.__BENCH.setCamera(i);
    scene.render();
    scene.render();
  }
  window.__BENCH.setCamera(0);
  scene.render();
  stepPhysics(40);

  engine.runRenderLoop(() => { scene.render(); });
  window.addEventListener('resize', () => engine.resize());

  window.__BENCH.loadTimeMs = performance.now();
  const boot = document.getElementById('boot');
  if (boot) boot.classList.add('gone');
  resolveReady();
}

boot().catch((e) => {
  console.error('BOOT FAIL', e);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'ERROR: ' + (e && e.message ? e.message : String(e));
  resolveReady();
});
