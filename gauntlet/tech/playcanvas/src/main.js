import * as pc from 'playcanvas/profiler';
import { buildMaterials } from './textures.js';
import { buildSky, applyEnvironment, SUN_DIR } from './sky.js';
import { buildWorld } from './world.js';
import { Props } from './props.js';
import { Vfx } from './vfx.js';
import { mulberry32 } from './noise.js';

const CAMS = [
    [[34, 12, 34], [0, 4, 0]],
    [[0, 1.7, 26], [0, 3, 0]],
    [[2, 1.7, 6], [-6, 2.5, -6]],
    [[-4, 1.2, 10], [-4.5, 0.8, 8]],
    [[10, 3, 12], [4, 1, 6]],
    [[-28, 6, -20], [0, 5, 0]]
];

const statusEl = () => document.getElementById('status');
function status(t) { const e = statusEl(); if (e) e.textContent = t; }

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function waitFrames(n) { for (let i = 0; i < n; i++) await nextFrame(); }

function loadAmmo() {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = './ammo/ammo.wasm.js';
        s.onload = () => {
            const factory = window.Ammo;
            factory({ locateFile: (p) => './ammo/' + p }).then((lib) => {
                window.Ammo = lib;
                resolve(lib);
            }).catch(reject);
        };
        s.onerror = () => reject(new Error('failed to load ammo.wasm.js'));
        document.head.appendChild(s);
    });
}

async function boot() {
    const canvas = document.getElementById('app');
    status('loading physics…');
    await loadAmmo();

    status('creating device…');
    const device = await pc.createGraphicsDevice(canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        alpha: false,
        depth: true,
        stencil: false,
        preferWebGl2: true,
        powerPreference: 'high-performance'
    });
    device.maxPixelRatio = 1;

    const app = new pc.Application(canvas, { graphicsDevice: device });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_FIXED, 1280, 720);
    app.systems.rigidbody.onLibraryLoaded();
    app.systems.rigidbody.fixedTimeStep = 1 / 60;
    app.systems.rigidbody.maxSubSteps = 5;

    // ------------------------------------------------------------- scene
    const scene = app.scene;
    scene.fog.type = pc.FOG_EXP2;
    scene.fog.color = new pc.Color(0.485, 0.545, 0.635);
    scene.fog.density = 0.0068;
    scene.exposure = 1.0;
    scene.lighting.cells = new pc.Vec3(14, 6, 14);
    scene.lighting.maxLightsPerCell = 24;
    scene.lighting.shadowsEnabled = false;
    scene.lighting.cookiesEnabled = false;

    status('building sky / IBL…');
    const sky = buildSky(device, 256);
    applyEnvironment(app, sky);

    status('generating materials…');
    const t0 = performance.now();
    const { materials: M, textures: T } = buildMaterials(device);
    console.log('[gen] materials', (performance.now() - t0).toFixed(0), 'ms');

    status('building world…');
    const world = buildWorld(app, M, device);
    console.log('[gen] world tris ~', world.triangleEstimate | 0,
        'fence', world.fenceSegments, 'lamps', world.lampCount, 'debris', world.debrisCount);

    // --------------------------------------------------------------- sun
    const sun = new pc.Entity('sun');
    sun.addComponent('light', {
        type: 'directional',
        color: new pc.Color(1.0, 0.945, 0.86),
        intensity: 3.1,
        castShadows: true,
        shadowResolution: 2048,
        numCascades: 3,
        cascadeDistribution: 0.4,
        shadowDistance: 105,
        shadowType: pc.SHADOW_PCF3_32F,
        shadowBias: 0.028,
        normalOffsetBias: 0.045,
        shadowIntensity: 0.94
    });
    sun.setPosition(SUN_DIR.x * 60, SUN_DIR.y * 60, SUN_DIR.z * 60);
    sun.lookAt(0, 0, 0);
    app.root.addChild(sun);

    // ------------------------------------------------------------ camera
    const camera = new pc.Entity('camera');
    camera.addComponent('camera', {
        fov: 55,
        horizontalFov: false,
        nearClip: 0.1,
        farClip: 500,
        clearColor: new pc.Color(0.42, 0.50, 0.60),
        toneMapping: pc.TONEMAP_ACES,
        gammaCorrection: pc.GAMMA_SRGB
    });
    app.root.addChild(camera);

    let cameraFrame = null;
    try {
        cameraFrame = new pc.CameraFrame(app, camera.camera);
        cameraFrame.rendering.toneMapping = pc.TONEMAP_ACES;
        cameraFrame.rendering.samples = 1;
        cameraFrame.rendering.sharpness = 0.35;
        cameraFrame.bloom.intensity = 0.030;
        cameraFrame.bloom.blurLevel = 12;
        cameraFrame.vignette.intensity = 0.42;
        cameraFrame.vignette.inner = 0.42;
        cameraFrame.vignette.outer = 1.32;
        cameraFrame.vignette.curvature = 0.62;
        cameraFrame.ssao.type = pc.SSAOTYPE_LIGHTING;
        cameraFrame.ssao.intensity = 0.55;
        cameraFrame.ssao.radius = 12;
        cameraFrame.ssao.samples = 8;
        cameraFrame.ssao.power = 5;
        cameraFrame.ssao.minAngle = 12;
        cameraFrame.ssao.scale = 0.5;
        cameraFrame.ssao.blurEnabled = true;
        cameraFrame.grading.enabled = true;
        cameraFrame.grading.contrast = 1.06;
        cameraFrame.grading.saturation = 1.07;
        cameraFrame.grading.brightness = 1.0;
        cameraFrame.update();
    } catch (e) {
        console.warn('[post] CameraFrame unavailable', e);
        cameraFrame = null;
    }

    function setCamera(i) {
        const c = CAMS[Math.max(0, Math.min(5, i | 0))];
        camera.setPosition(c[0][0], c[0][1], c[0][2]);
        camera.lookAt(c[1][0], c[1][1], c[1][2]);
    }
    setCamera(0);

    // ------------------------------------------------------------ props
    status('populating physics…');
    const props = new Props(app, M, device);
    props.buildInitialSet();
    props.buildChain(new pc.Vec3(-2.0, 7.32, 1.6), 12);
    props.buildSign(new pc.Vec3(-8.2, 5.05, 8.72));
    props.buildRagdoll(new pc.Vec3(-1.4, 1.35, 4.6), 34, 1);

    // close-up dressing for camera 3 (material detail shot)
    const q0 = new pc.Quat();
    props.spawnDrum(new pc.Vec3(-3.55, 0.47, 8.15), q0.clone().setFromEulerAngles(0, 24, 0), 0);
    props.spawnCrate(new pc.Vec3(-4.35, 0.41, 7.30), q0.clone().setFromEulerAngles(0, 12, 0), 0);
    props.spawnCrate(new pc.Vec3(-4.35, 1.22, 7.32), q0.clone().setFromEulerAngles(0, 27, 0), 1);
    props.spawnTyre(new pc.Vec3(-4.9, 0.16, 8.45), q0.clone().setFromEulerAngles(0, 40, 0));
    props.spawnTyre(new pc.Vec3(-4.75, 0.46, 8.50), q0.clone().setFromEulerAngles(0, 95, 0));

    const vfx = new Vfx(app, T);
    props.onImpact = (pos, s) => vfx.sparkAt(pos, s);

    app.systems.on('postUpdate', () => props.update());

    // ------------------------------------------------------------ stats
    let frames = 0, accMs = 0, samples = [], lastT = performance.now();
    app.on('postrender', () => {
        const now = performance.now();
        const dt = now - lastT;
        lastT = now;
        if (dt > 0 && dt < 5000) { frames++; accMs += dt; samples.push(dt); }
        if (samples.length > 4000) samples.shift();
    });
    function resetStats() { frames = 0; accMs = 0; samples = []; lastT = performance.now(); }
    function stats() {
        const s = samples.slice().sort((a, b) => a - b);
        const p95 = s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0;
        const mem = performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0;
        const sh = app.stats.shaders || {};
        return {
            fps: accMs > 0 ? (frames * 1000) / accMs : 0,
            frameMs: frames > 0 ? accMs / frames : 0,
            p95FrameMs: p95,
            drawCalls: app.stats.drawCalls.total | 0,
            triangles: app.stats.frame.triangles | 0,
            programs: (sh.linked ?? sh.vsCompiled ?? 0) | 0,
            bodies: props.bodyCount,
            activeBodies: props.activeCount(),
            jsHeapMB: mem
        };
    }

    // ------------------------------------------------------------ phases
    const rnd = mulberry32(31337);
    const R = (a, b) => a + rnd() * (b - a);

    function spawnPropRain(n) {
        const q = new pc.Quat();
        for (let i = 0; i < n; i++) {
            q.setFromEulerAngles(R(0, 360), R(0, 360), R(0, 360));
            props.spawnRandomProp(new pc.Vec3(R(-15, 15), R(12, 24), R(3.5, 22)), q);
        }
    }
    function spawnRagdolls(n) {
        for (let i = 0; i < n; i++) {
            props.buildRagdoll(new pc.Vec3(R(-6, 9), R(5.6, 6.6), R(-3, 7)), R(0, 360), i);
        }
    }
    function blast(center, radius, impulse) {
        props.explode(center, radius, impulse);
        vfx.blastAt(center);
        for (let k = 0; k < 3; k++) {
            vfx.sparkAt(new pc.Vec3(center.x + R(-2, 2), center.y + R(0, 1.5), center.z + R(-2, 2)), 1);
        }
    }

    const timers = [];
    async function phase(name) {
        try {
            switch (name) {
                case 'idle':
                    break;
                case 'props':
                    spawnPropRain(300);
                    break;
                case 'explosion':
                    blast(new pc.Vec3(0, 1, 0), 12, 45000);
                    break;
                case 'ragdoll':
                    spawnRagdolls(8);
                    break;
                case 'chaos': {
                    const need = Math.max(0, 620 - props.bodyCount - 88);
                    spawnPropRain(need);
                    spawnRagdolls(8);
                    blast(new pc.Vec3(0, 1.2, 0), 12, 45000);
                    timers.push(setTimeout(() => blast(new pc.Vec3(4.5, 1.6, 11.5), 11, 42000), 2600));
                    timers.push(setTimeout(() => blast(new pc.Vec3(-7.5, 1.6, 13.5), 11, 42000), 5200));
                    break;
                }
                default:
                    break;
            }
        } catch (e) {
            console.warn('[phase] ' + name + ' failed', e);
        }
        await nextFrame();
    }

    // ------------------------------------------------------------- start
    app.start();
    status('warming shaders…');
    for (let i = 0; i < 6; i++) { setCamera(i); await waitFrames(3); }
    setCamera(0);
    await waitFrames(10);
    resetStats();

    const loadTimeMs = performance.now();
    const bench = {
        ready: Promise.resolve(),
        loadTimeMs,
        setCamera,
        phase,
        resetStats,
        stats,
        _app: app
    };
    window.__BENCH = bench;
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.remove();
    console.log('[bench] ready in', loadTimeMs.toFixed(0), 'ms; bodies', props.bodyCount,
        'joints', props.joints.length, 'tris', world.triangleEstimate | 0);
}

boot().catch((e) => {
    console.error('[boot] fatal', e);
    status('FATAL: ' + (e && e.message ? e.message : String(e)));
});
