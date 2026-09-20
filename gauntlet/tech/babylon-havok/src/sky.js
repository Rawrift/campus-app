// ---------------------------------------------------------------------------
// Cielo analitico procedural + IBL generado en runtime.
//  - Skybox: ShaderMaterial con dispersion Rayleigh/Mie aproximada, disco solar
//    y campo de nubes muestreado de una textura fbm tileable.
//  - IBL: el MISMO modelo evaluado en CPU -> cubemap RGBA8 (especular) y
//    armonicos esfericos calculados a partir de los datos float HDR (difusa).
// ---------------------------------------------------------------------------
import {
  Effect, ShaderMaterial, StandardMaterial, MeshBuilder, RawCubeTexture, RawTexture, Texture,
  Constants, Vector3, Vector4, Color3,
} from '@babylonjs/core';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { fbm, clamp01, smoothstep, lerp } from './noise.js';

const CLOUD_SIZE = 256;

export function makeCloudField() {
  const n = CLOUD_SIZE;
  const f = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x / n) * 8, v = (y / n) * 8;
      const w = fbm(u * 0.6, v * 0.6, 8, 991, 4) * 1.5;
      let c = fbm(u + w, v + w, 8, 401, 6, 0.55);
      c = clamp01((c - 0.47) * 2.15);
      f[y * n + x] = c;
    }
  }
  return f;
}

function cloudTexture(scene, field) {
  const n = CLOUD_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const c = clamp01(field[i]) * 255;
    data[i * 4] = c; data[i * 4 + 1] = c; data[i * 4 + 2] = c; data[i * 4 + 3] = 255;
  }
  const t = RawTexture.CreateRGBATexture(data, n, n, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.gammaSpace = false;
  t.name = 'cloudfield';
  return t;
}

function sampleField(field, x, y) {
  const n = CLOUD_SIZE;
  let fx = x * n, fy = y * n;
  fx -= Math.floor(fx / n) * n; fy -= Math.floor(fy / n) * n;
  const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
  const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
  const a = field[y0 * n + x0], b = field[y0 * n + x1];
  const c = field[y1 * n + x0], d = field[y1 * n + x1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

const ZEN = [0.072, 0.165, 0.430];
const HOR = [0.560, 0.545, 0.530];
const GND = [0.085, 0.080, 0.072];
const SUNC = [1.70, 0.92, 0.44];

// Radiancia lineal HDR del cielo para una direccion normalizada.
export function skyRadiance(dx, dy, dz, sun, field, out) {
  const up = dy > 0 ? dy : 0;
  const g = Math.pow(1 - up, 3.0);
  let r = lerp(ZEN[0], HOR[0], g), gg = lerp(ZEN[1], HOR[1], g), b = lerp(ZEN[2], HOR[2], g);
  const cosT = dx * sun.x + dy * sun.y + dz * sun.z;
  const c = cosT > 0 ? cosT : 0;
  const c2 = c * c, c4 = c2 * c2;
  const mie = c4 * c2 * 0.5 + Math.pow(c, 48) * 1.35;
  const k = mie * (0.35 + 0.95 * g);
  r += SUNC[0] * k; gg += SUNC[1] * k; b += SUNC[2] * k;

  // nubes
  if (dy > -0.02) {
    const inv = 1 / (Math.abs(dy) + 0.30);
    const cu = dx * inv * 0.26 + 0.31, cv = dz * inv * 0.26 + 0.17;
    const raw = sampleField(field, cu, cv);
    const cover = raw * smoothstep(0.0, 0.30, dy);
    if (cover > 0.001) {
      const lit = clamp01(0.30 + raw * 0.9 + c4 * 0.6);
      const cr = lerp(0.215, 0.92, lit) + SUNC[0] * c4 * 0.26;
      const cg = lerp(0.228, 0.885, lit) + SUNC[1] * c4 * 0.26;
      const cb = lerp(0.275, 0.855, lit) + SUNC[2] * c4 * 0.26;
      const m = clamp01(cover * 0.80);
      r = lerp(r, cr, m); gg = lerp(gg, cg, m); b = lerp(b, cb, m);
    }
  }

  // disco solar
  const disc = smoothstep(0.99855, 0.99955, cosT);
  if (disc > 0) { r += 34 * disc; gg += 25 * disc; b += 16 * disc; }
  const halo = Math.pow(Math.max(cosT, 0), 260) * 2.2;
  r += 2.4 * halo; gg += 1.7 * halo; b += 1.0 * halo;

  // por debajo del horizonte: suelo/bruma
  if (dy < 0.0) {
    const m = smoothstep(-0.22, 0.0, dy);
    r = lerp(GND[0], r, m); gg = lerp(GND[1], gg, m); b = lerp(GND[2], b, m);
  }
  out[0] = r; out[1] = gg; out[2] = b;
}

function faceDir(face, s, t, o) {
  switch (face) {
    case 0: o[0] = 1; o[1] = -t; o[2] = -s; break;
    case 1: o[0] = -1; o[1] = -t; o[2] = s; break;
    case 2: o[0] = s; o[1] = 1; o[2] = t; break;
    case 3: o[0] = s; o[1] = -1; o[2] = -t; break;
    case 4: o[0] = s; o[1] = -t; o[2] = 1; break;
    default: o[0] = -s; o[1] = -t; o[2] = -1; break;
  }
  const l = 1 / Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
  o[0] *= l; o[1] *= l; o[2] *= l;
}

// codificacion reinhard invertible: e = c/(1+0.5c)  ->  c = e/(1-0.5e)
const knee = (c) => c / (1 + 0.5 * c);

export function buildEnvironment(scene, sunDir, field, size = 320, shSize = 48) {
  const d = [0, 0, 0], rad = [0, 0, 0];
  // ---- cubemap RGBA8 para reflexiones especulares ----
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const t = (2 * (y + 0.5)) / size - 1;
      for (let x = 0; x < size; x++) {
        const s = (2 * (x + 0.5)) / size - 1;
        faceDir(f, s, t, d);
        skyRadiance(d[0], d[1], d[2], sunDir, field, rad);
        const i = (y * size + x) * 4;
        data[i] = Math.pow(clamp01(knee(rad[0])), 1 / 2.2) * 255;
        data[i + 1] = Math.pow(clamp01(knee(rad[1])), 1 / 2.2) * 255;
        data[i + 2] = Math.pow(clamp01(knee(rad[2])), 1 / 2.2) * 255;
        data[i + 3] = 255;
      }
    }
    faces.push(data);
  }
  const mkCube = (n) => {
    const c = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    c.name = n; c.gammaSpace = true; return c;
  };
  const cube = mkCube('procEnv');
  const skyCube = mkCube('procSky');
  skyCube.coordinatesMode = Texture.SKYBOX_MODE;
  skyCube.level = 1.05;

  // ---- armonicos esfericos a partir de datos float HDR reales ----
  const fFaces = {};
  const names = ['right', 'left', 'up', 'down', 'front', 'back'];
  for (let f = 0; f < 6; f++) {
    const arr = new Float32Array(shSize * shSize * 4);
    for (let y = 0; y < shSize; y++) {
      const t = (2 * (y + 0.5)) / shSize - 1;
      for (let x = 0; x < shSize; x++) {
        const s = (2 * (x + 0.5)) / shSize - 1;
        faceDir(f, s, t, d);
        skyRadiance(d[0], d[1], d[2], sunDir, field, rad);
        const i = (y * shSize + x) * 4;
        arr[i] = rad[0]; arr[i + 1] = rad[1]; arr[i + 2] = rad[2]; arr[i + 3] = 1;
      }
    }
    fFaces[names[f]] = arr;
  }
  const sp = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
    size: shSize, ...fFaces, format: 5, type: 1, gammaSpace: false,
  });
  if (sp) cube.sphericalPolynomial = sp;
  return { cube, skyCube };
}

export function buildSkybox(scene, sunDir, skyCube) {
  const mat = new StandardMaterial('skyMat', scene);
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.reflectionTexture = skyCube;
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.disableDepthWrite = false;
  const dome = MeshBuilder.CreateIcoSphere('skybox', { radius: 440, subdivisions: 3, flat: false }, scene);
  dome.material = mat;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.receiveShadows = false;
  dome.doNotSyncBoundingInfo = true;
  dome.alwaysSelectAsActiveMesh = true;
  return dome;
}
