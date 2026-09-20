// Procedural HDR sky -> RGBM cubemap -> prefiltered env atlas (IBL).
import * as pc from 'playcanvas/profiler';
import { fbm, clamp01, lerp, smoothstep } from './noise.js';

export const SUN_DIR = (() => {
    const d = new pc.Vec3(0.50, 0.40, 0.765);
    d.normalize();
    return d;
})();

const ZENITH = [0.085, 0.175, 0.385];
const HORIZON = [0.60, 0.665, 0.760];
const SUNCOL = [1.0, 0.845, 0.615];
const GROUND = [0.105, 0.098, 0.088];

function skyRadiance(dx, dy, dz, cloud) {
    const cosT = dx * SUN_DIR.x + dy * SUN_DIR.y + dz * SUN_DIR.z;
    let r, g, b;
    if (dy >= 0) {
        const t = Math.pow(1 - dy, 3.0);
        r = lerp(ZENITH[0], HORIZON[0], t);
        g = lerp(ZENITH[1], HORIZON[1], t);
        b = lerp(ZENITH[2], HORIZON[2], t);
        // clouds: bright cumulus banding, denser near the horizon
        const cAmt = clamp01(smoothstep(0.50, 0.80, cloud)) * (0.30 + 0.70 * Math.pow(1 - dy, 1.3));
        const cl = 0.80 + 0.55 * cloud;
        r = lerp(r, cl * 1.00, cAmt); g = lerp(g, cl * 0.99, cAmt); b = lerp(b, cl * 0.98, cAmt);
        // forward scattering halo around the sun
        const c = Math.max(cosT, 0);
        const glow = Math.pow(c, 7) * 0.55 + Math.pow(c, 40) * 1.4 + Math.pow(c, 300) * 3.0;
        r += SUNCOL[0] * glow; g += SUNCOL[1] * glow; b += SUNCOL[2] * glow;
        // sun disc
        if (cosT > 0.99965) { r += 90; g += 76; b += 55; }
    } else {
        const t = clamp01(-dy * 3.0);
        const hz = 1 - t;
        r = lerp(GROUND[0], HORIZON[0] * 0.75, hz * hz);
        g = lerp(GROUND[1], HORIZON[1] * 0.75, hz * hz);
        b = lerp(GROUND[2], HORIZON[2] * 0.75, hz * hz);
        const c = Math.max(cosT, 0);
        const bounce = Math.pow(c, 6) * 0.12 * hz;
        r += SUNCOL[0] * bounce; g += SUNCOL[1] * bounce; b += SUNCOL[2] * bounce;
    }
    return [r, g, b];
}

const FACE_DIR = [
    (a, b) => [1, -b, -a],
    (a, b) => [-1, -b, a],
    (a, b) => [a, 1, b],
    (a, b) => [a, -1, -b],
    (a, b) => [a, -b, 1],
    (a, b) => [-a, -b, -1]
];

export function buildSky(device, size = 256) {
    const cloudField = fbm(size * 2, 7, 7, 5, 4242);
    const cloudField2 = fbm(size * 2, 19, 19, 4, 909);
    const CS = size * 2;
    const sampleCloud = (dx, dy, dz) => {
        // cheap spherical lookup: project onto a lat/long grid
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const u = (Math.atan2(dz, dx) / (Math.PI * 2) + 0.5);
        const v = Math.acos(clamp01(dy / len) * 0.999) / Math.PI;
        const x = ((u * CS) | 0) % CS, y = ((v * CS) | 0) % CS;
        const i = y * CS + x;
        return cloudField[i] * 0.72 + cloudField2[i] * 0.28;
    };

    const levels = [];
    for (let f = 0; f < 6; f++) {
        const data = new Uint8Array(size * size * 4);
        const dirFn = FACE_DIR[f];
        for (let y = 0; y < size; y++) {
            const b = 2 * ((y + 0.5) / size) - 1;
            for (let x = 0; x < size; x++) {
                const a = 2 * ((x + 0.5) / size) - 1;
                const d = dirFn(a, b);
                const inv = 1 / Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
                const dx = d[0] * inv, dy = d[1] * inv, dz = d[2] * inv;
                const c = skyRadiance(dx, dy, dz, sampleCloud(dx, dy, dz));
                // RGBM encode, range 8
                let r = c[0] / 8, g = c[1] / 8, bl = c[2] / 8;
                let m = Math.max(Math.max(r, g), Math.max(bl, 1e-5));
                m = Math.min(1, m);
                m = Math.ceil(m * 255) / 255;
                const j = (y * size + x) * 4;
                data[j] = clamp01(r / m) * 255;
                data[j + 1] = clamp01(g / m) * 255;
                data[j + 2] = clamp01(bl / m) * 255;
                data[j + 3] = m * 255;
            }
        }
        levels.push(data);
    }

    const cube = new pc.Texture(device, {
        name: 'proceduralSky',
        cubemap: true,
        width: size,
        height: size,
        format: pc.PIXELFORMAT_RGBA8,
        type: pc.TEXTURETYPE_RGBM,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        levels: [levels]
    });
    cube.upload();
    return cube;
}

export function applyEnvironment(app, cube) {
    const scene = app.scene;
    scene.skybox = cube;
    let atlas = null;
    try {
        const src = pc.EnvLighting.generateLightingSource(cube, { size: 128 });
        atlas = pc.EnvLighting.generateAtlas(src, {
            size: 256,
            numReflectionSamples: 256,
            numAmbientSamples: 512
        });
        scene.envAtlas = atlas;
        src.destroy();
    } catch (e) {
        console.warn('[env] prefilter failed, falling back to flat ambient', e);
        scene.ambientLight = new pc.Color(0.16, 0.19, 0.25);
        scene.ambientLuminance = 12000;
    }
    scene.skyboxIntensity = 1.0;
    scene.skyboxMip = 0;
    return atlas;
}
