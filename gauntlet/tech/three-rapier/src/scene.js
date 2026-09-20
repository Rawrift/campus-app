import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as TEX from './textures.js';

/* ----------------------------------------------------------- deterministic rng */
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------- geometry utils */
// box with UVs expressed in metres so textures tile at world scale
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
  return g;
}
export function cylGeo(rt, rb, h, seg, uvScale) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
  const uv = g.attributes.uv;
  const s = uvScale === undefined ? 1 : uvScale;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * rt * s, uv.getY(i) * h * s);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function placed(geo, x, y, z, rx, ry, rz) {
  const g = geo.clone();
  _e.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

// a cylinder laid along a horizontal run: Y axis -> Z, then yaw. Euler XYZ applies the
// X rotation last, so the naive placed(..., PI/2, ang, 0) ignores the yaw entirely.
export function placedRail(geo, x, y, z, angY) {
  const g = geo.clone();
  g.rotateX(Math.PI / 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angY);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

// merge helper that tolerates mixed indexed / non-indexed inputs
export function mergeSafe(parts) {
  const list = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', n.attributes.position);
    out.setAttribute('normal', n.attributes.normal);
    out.setAttribute('uv', n.attributes.uv);
    return out;
  });
  return mergeGeometries(list, false);
}

function ibeamGeo(len, h, flange, tw, tf) {
  // I profile extruded along X
  const parts = [
    placed(boxGeo(len, tf, flange), 0, h / 2 - tf / 2, 0),
    placed(boxGeo(len, tf, flange), 0, -h / 2 + tf / 2, 0),
    placed(boxGeo(len, h - tf * 2, tw), 0, 0, 0),
  ];
  return mergeSafe(parts);
}

/* --------------------------------------------------------------- materials */
function applyMaps(mat, maps, tileMeters, opts) {
  const r = 1 / tileMeters;
  const map = maps.map.clone(); map.repeat.set(r, r); map.needsUpdate = true;
  const nrm = maps.normalMap.clone(); nrm.repeat.set(r, r); nrm.needsUpdate = true;
  const orm = maps.orm.clone(); orm.repeat.set(r, r); orm.needsUpdate = true;
  mat.map = map; mat.normalMap = nrm;
  mat.roughnessMap = orm;
  // AO is baked into the albedo; metalness only gets a map where the surface is
  // actually part metal, so dielectrics do one texture fetch less per pixel.
  if (opts && opts.metalMap) mat.metalnessMap = orm;
  mat.normalScale = new THREE.Vector2(opts && opts.ns !== undefined ? opts.ns : 1, opts && opts.ns !== undefined ? opts.ns : 1);
  return mat;
}
export function pbr(maps, tileMeters, params, opts) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 1 }, params || {}));
  return applyMaps(m, maps, tileMeters, opts);
}


/* Breaks up texture tiling with a low-frequency world-space variation map.
   One extra fetch, reused for albedo and roughness. */
function macroBreakup(mat, tex, scale, lo, hi, rlo, rhi) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: tex };
    sh.uniforms.uMScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPosM = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMacro;\nuniform float uMScale;\nvarying vec3 vWPosM;\nvec3 gMacro;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n'
        + 'gMacro = texture2D(uMacro, (vWPosM.xz + vWPosM.y * vec2(0.41, 0.77)) * uMScale).rgb;\n'
        + 'diffuseColor.rgb *= mix(' + lo.toFixed(3) + ', ' + hi.toFixed(3) + ', gMacro.r) * mix(0.84, 1.20, gMacro.g);\n'
        + 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16,1.02,0.86), gMacro.b * 0.75);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n'
        + 'roughnessFactor = clamp(roughnessFactor * mix(' + rlo.toFixed(3) + ', ' + rhi.toFixed(3) + ', gMacro.g) * mix(1.05, 0.82, gMacro.b), 0.04, 1.0);');
  };
  mat.customProgramCacheKey = () => 'macro' + scale.toFixed(4);
}

/* --------------------------------------------------------------- the build */
export function buildScene(renderer) {
  // software rasteriser: anisotropic filtering costs 8-16 taps per fetch. Trilinear only.
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const statics = [];           // collider descriptors for rapier
  const addBoxCollider = (w, h, d, x, y, z, ry) => statics.push({ hx: w / 2, hy: h / 2, hz: d / 2, p: [x, y, z], ry: ry || 0 });

  /* ---------------- textures ---------------- */
  const T = {
    asphalt: TEX.asphaltMaps(512, aniso),
    floor: TEX.polishedConcreteMaps(512, aniso),
    wall: TEX.wallConcreteMaps(512, aniso),
    steel: TEX.paintedMetalMaps(256, aniso, [0.30, 0.36, 0.40]),
    steelWarn: TEX.paintedMetalMaps(256, aniso, [0.62, 0.42, 0.06]),
    rust: TEX.rustMaps(256, aniso),
    wood: TEX.woodMaps(256, aniso),
    rubber: TEX.rubberMaps(256, aniso),
    plastic: TEX.plasticMaps(128, aniso, [0.38, 0.145, 0.055]),
    corr: TEX.corrugatedMaps(256, aniso, [0.34, 0.37, 0.36]),
    corrBlue: TEX.corrugatedMaps(256, aniso, [0.10, 0.22, 0.34]),
    grate: TEX.gratingMaps(256, aniso),
    puddle: TEX.puddleMaps(256, aniso),
    sign: TEX.signMaps(128),
  };
  const macro = TEX.macroVariation(256);
  const chain = TEX.chainLinkAlpha(256);
  const dot = TEX.softSprite(64, 2.0);
  const smokeSprite = TEX.softSprite(64, 1.35, 12);
  const stainSprite = TEX.softSprite(128, 1.1, 77);

  /* ---------------- materials ---------------- */
  const M = {};
  M.asphalt = pbr(T.asphalt, 3.2, { color: 0xffffff, metalness: 0, envMapIntensity: 0.85 }, { ns: 1.5 });
  M.floor = pbr(T.floor, 3.0, { color: 0xffffff, metalness: 0, envMapIntensity: 1.0 }, { ns: 1.5 });
  M.wall = pbr(T.wall, 2.2, { color: 0xffffff, metalness: 0, envMapIntensity: 0.9 }, { ns: 1.9 });
  M.steel = pbr(T.steel, 1.6, { color: 0xffffff, envMapIntensity: 1.1 }, { metalMap: true, ns: 0.9 });
  M.steelWarn = pbr(T.steelWarn, 1.2, { color: 0xffffff, envMapIntensity: 1.1 }, { metalMap: true, ns: 0.9 });
  M.rust = pbr(T.rust, 1.1, { color: 0xffffff, envMapIntensity: 1.0 }, { metalMap: true, ns: 1.1 });
  M.wood = pbr(T.wood, 1.0, { color: 0xffffff, metalness: 0, envMapIntensity: 0.85 }, { ns: 1.0 });
  M.rubber = pbr(T.rubber, 0.9, { color: 0xffffff, metalness: 0, envMapIntensity: 0.30 }, { ns: 1.2 });
  M.plastic = pbr(T.plastic, 0.7, { color: 0xffffff, metalness: 0, envMapIntensity: 1.0 }, { ns: 0.6 });
  M.corr = pbr(T.corr, 2.2, { color: 0xffffff, envMapIntensity: 1.0 }, { metalMap: true, ns: 1.2 });
  M.corrBlue = pbr(T.corrBlue, 2.2, { color: 0xffffff, envMapIntensity: 1.0 }, { metalMap: true, ns: 1.2 });
  M.grate = pbr(T.grate, 0.62, { color: 0xffffff, envMapIntensity: 1.0 }, { metalMap: true, ns: 1.0 });
  M.sign = pbr(T.sign, 2.4, { color: 0xffffff, envMapIntensity: 1.0 }, { metalMap: true, ns: 0.8 });
  M.puddle = pbr(T.puddle, 6.0, { color: 0xffffff, envMapIntensity: 2.6, transparent: true, depthWrite: false }, { ns: 0.35 });
  M.puddle.roughness = 1; M.puddle.metalness = 1;

  // bring every albedo into a plausible linear-reflectance range
  const tint = (m, k) => { m.color.setRGB(k, k, k); return m; };
  tint(M.asphalt, 0.185); tint(M.floor, 0.80); tint(M.wall, 0.56);
  tint(M.steel, 0.46); tint(M.steelWarn, 0.62); tint(M.rust, 0.52);
  tint(M.wood, 0.50); tint(M.rubber, 1.0); tint(M.plastic, 0.80);
  tint(M.corr, 0.50); tint(M.corrBlue, 0.52); tint(M.grate, 0.66); tint(M.sign, 0.72);

  M.glass = new THREE.MeshStandardMaterial({
    color: 0x5e7280, roughness: 0.055, metalness: 0.06, transparent: true, opacity: 0.16,
    envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false,
  });
  M.fence = new THREE.MeshStandardMaterial({
    map: (() => { const t = chain.clone(); t.repeat.set(1, 1); t.needsUpdate = true; return t; })(),
    alphaMap: (() => { const t = chain.clone(); t.repeat.set(1, 1); t.needsUpdate = true; return t; })(),
    alphaTest: 0.45, transparent: false, side: THREE.DoubleSide,
    roughness: 0.55, metalness: 0.85, color: 0xb9bec4, envMapIntensity: 1.0,
  });
  M.lamp = new THREE.MeshStandardMaterial({
    color: 0x1a1a18, roughness: 0.5, metalness: 0.4,
    emissive: new THREE.Color(0xffd7a0), emissiveIntensity: 3.2,
  });
  M.stain = new THREE.MeshBasicMaterial({
    map: stainSprite, transparent: true, opacity: 0.62, depthWrite: false, color: 0x131418,
    blending: THREE.NormalBlending,
  });

  // low-frequency break-up so nothing reads as a repeating tile
  macroBreakup(M.asphalt, macro, 0.016, 0.62, 1.55, 0.55, 1.18);
  macroBreakup(M.wall, macro.clone(), 0.115, 0.50, 1.55, 0.70, 1.28);
  macroBreakup(M.floor, macro.clone(), 0.052, 0.66, 1.40, 0.55, 1.25);
  macroBreakup(M.corr, macro.clone(), 0.050, 0.55, 1.42, 0.85, 1.22);

  /* ---------------- sky + IBL ---------------- */
  const sky = new Sky();
  sky.scale.setScalar(2000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4.4;
  su.rayleigh.value = 1.85;
  su.mieCoefficient.value = 0.013;
  su.mieDirectionalG.value = 0.86;
  const sunDir = new THREE.Vector3(-0.300, 0.400, 0.866).normalize();
  su.sunPosition.value.copy(sunDir);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const skyClone = new Sky();
  skyClone.scale.setScalar(20000);
  skyClone.material.uniforms.turbidity.value = su.turbidity.value;
  skyClone.material.uniforms.rayleigh.value = su.rayleigh.value;
  skyClone.material.uniforms.mieCoefficient.value = su.mieCoefficient.value;
  skyClone.material.uniforms.mieDirectionalG.value = su.mieDirectionalG.value;
  skyClone.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(skyClone);
  // ground bounce so the IBL is not blue-only
  const bounce = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.085, 0.072, 0.058), side: THREE.BackSide })
  );
  envScene.add(bounce);
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.50;
  // bake the sky dome into a cube map so the background costs one texture fetch
  const skyOnly = new THREE.Scene();
  skyOnly.add(sky);
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 6000, cubeRT);
  cubeCam.position.set(0, 6, 0);
  cubeCam.update(renderer, skyOnly);
  scene.background = cubeRT.texture;
  scene.backgroundIntensity = 0.48;
  skyClone.geometry.dispose(); skyClone.material.dispose();
  bounce.geometry.dispose(); bounce.material.dispose();
  pmrem.dispose();

  scene.fog = new THREE.FogExp2(0x76889c, 0.0036);

  /* ---------------- sun ---------------- */
  const sun = new THREE.DirectionalLight(0xffd39a, 7.4);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 55; sc.far = 210;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.085;
  sun.shadow.radius = 1.6;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x93b8e0, 0x403624, 0.42);
  scene.add(hemi);

  /* =================================================================== GROUND */
  {
    const g = new THREE.PlaneGeometry(160, 160, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 160, uv.getY(i) * 160);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.asphalt);
    mesh.receiveShadow = true;
    mesh.position.y = 0;
    scene.add(mesh);
  }
  // distant terrain beyond the 160 m pad, plus an industrial skyline for depth
  {
    const g = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1400, uv.getY(i) * 1400);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x3b382f, roughness: 0.97, metalness: 0.0, envMapIntensity: 0.6 });
    const far = new THREE.Mesh(g, m);
    far.position.y = -0.06;
    scene.add(far);
    const r = rng(5150);
    const blocks = [];
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = 135 + r() * 190;
      const w = 16 + r() * 46, h = 7 + r() * 26, dp = 14 + r() * 40;
      blocks.push(placed(boxGeo(w, h, dp), Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d, 0, r() * 3.14, 0));
      if (r() > 0.65) {
        const ch = 18 + r() * 30;
        blocks.push(placed(cylGeo(1.7, 2.4, ch, 10, 1), Math.cos(a) * d + (r() - 0.5) * 20, ch / 2, Math.sin(a) * d + (r() - 0.5) * 20));
      }
    }
    const bm0 = 1; const bm = new THREE.Mesh(mergeSafe(blocks), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.96, metalness: 0.1, envMapIntensity: 0.40 }));
    bm.name = 'skyline'; scene.add(bm);
  }
  // puddle / wet asphalt at (16,0,14)
  {
    const g = new THREE.PlaneGeometry(14, 10, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 10);
    g.rotateX(-Math.PI / 2);
    const m = M.puddle.clone();
    const am = TEX.softSprite(256, 0.38, 31);
    am.wrapS = am.wrapT = THREE.ClampToEdgeWrapping;
    am.repeat.set(1 / 14, 1 / 10); am.needsUpdate = true;
    m.alphaMap = am;
    m.transparent = true;
    m.depthWrite = false;
    m.map = null;                       // for a metal the albedo IS the reflectance tint
    m.color.setRGB(0.20, 0.22, 0.26);
    m.roughness = 0.04; m.metalness = 1.0;
    m.envMapIntensity = 1.15;
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(16, 0.016, 14);
    mesh.renderOrder = 4;
    scene.add(mesh);
    // damp halo: darkens and smooths the asphalt around the water
    const m2 = new THREE.MeshStandardMaterial({
      color: 0x1b1e22, roughness: 0.28, metalness: 0.35, transparent: true, opacity: 0.55,
      alphaMap: (() => { const t = TEX.softSprite(256, 0.55, 131); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / 14, 1 / 10); t.needsUpdate = true; return t; })(),
      depthWrite: false, envMapIntensity: 0.9,
    });
    const halo = new THREE.Mesh(g.clone(), m2);
    halo.scale.set(1.28, 1, 1.28);
    halo.position.set(16, 0.009, 14);
    halo.renderOrder = 3;
    scene.add(halo);
  }
  // oil stains
  {
    const r = rng(7788);
    const parts = [];
    for (let i = 0; i < 22; i++) {
      const s = 1.5 + r() * 3.2;
      const pg = new THREE.PlaneGeometry(s, s * (0.7 + r() * 0.6));
      pg.rotateX(-Math.PI / 2);
      parts.push(placed(pg, -28 + r() * 56, 0.012, -26 + r() * 52, 0, r() * 6.28, 0));
    }
    const mesh = new THREE.Mesh(mergeSafe(parts), M.stain);
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  /* ============================================================== WAREHOUSE */
  const W = 24, D = 16, H = 8, TKN = 0.35;
  const wallParts = [];
  const steelParts = [];
  const grateParts = [];
  const glassParts = [];

  // back wall (-Z) with 2 windows
  {
    const zc = -D / 2 + TKN / 2;
    // lower band
    wallParts.push(placed(boxGeo(W, 5.0, TKN), 0, 2.5, zc));
    // upper band
    wallParts.push(placed(boxGeo(W, 1.2, TKN), 0, 7.4, zc));
    // between 5.0 and 6.8: piers + 2 windows
    const segs = [[-12, -7.4], [-4.4, 4.4], [7.4, 12]];
    for (const [a, b] of segs) wallParts.push(placed(boxGeo(b - a, 1.8, TKN), (a + b) / 2, 5.9, zc));
    for (const cx of [-5.9, 5.9]) {
      glassParts.push(placed(boxGeo(3.0, 1.8, 0.05), cx, 5.9, zc));
      // frame
      steelParts.push(placed(boxGeo(3.1, 0.08, 0.14), cx, 5.9 + 0.89, zc));
      steelParts.push(placed(boxGeo(3.1, 0.08, 0.14), cx, 5.9 - 0.89, zc));
      steelParts.push(placed(boxGeo(0.08, 1.8, 0.14), cx, 5.9, zc));
    }
    addBoxCollider(W, H, TKN, 0, H / 2, zc);
  }
  // side walls (+-X) with 4 windows each
  for (const sx of [-1, 1]) {
    const xc = sx * (W / 2 - TKN / 2);
    wallParts.push(placed(boxGeo(TKN, 4.4, D), xc, 2.2, 0));
    wallParts.push(placed(boxGeo(TKN, 1.8, D), xc, 7.1, 0));
    // window band 4.4 .. 6.2
    const piers = [[-8, -6.7], [-4.1, -3.1], [-0.5, 0.5], [3.1, 4.1], [6.7, 8]];
    for (const [a, b] of piers) wallParts.push(placed(boxGeo(TKN, 1.8, b - a), xc, 5.3, (a + b) / 2));
    const wins = [[-6.7, -4.1], [-3.1, -0.5], [0.5, 3.1], [4.1, 6.7]];
    for (const [a, b] of wins) {
      const cz = (a + b) / 2;
      glassParts.push(placed(boxGeo(0.05, 1.8, b - a), xc, 5.3, cz));
      steelParts.push(placed(boxGeo(0.14, 0.08, b - a + 0.06), xc, 5.3 + 0.89, cz));
      steelParts.push(placed(boxGeo(0.14, 0.08, b - a + 0.06), xc, 5.3 - 0.89, cz));
      steelParts.push(placed(boxGeo(0.14, 1.8, 0.07), xc, 5.3, cz));
    }
    addBoxCollider(TKN, H, D, xc, H / 2, 0);
  }
  // front wall (+Z) with a 10 x 6 gate
  {
    const zc = D / 2 - TKN / 2;
    wallParts.push(placed(boxGeo(7, H, TKN), -8.5, H / 2, zc));
    wallParts.push(placed(boxGeo(7, H, TKN), 8.5, H / 2, zc));
    wallParts.push(placed(boxGeo(10, 2, TKN), 0, 7, zc));
    addBoxCollider(7, H, TKN, -8.5, H / 2, zc);
    addBoxCollider(7, H, TKN, 8.5, H / 2, zc);
    addBoxCollider(10, 2, TKN, 0, 7, zc);
    // gate jamb steel
    for (const sx of [-1, 1]) steelParts.push(placed(boxGeo(0.25, 6.1, 0.55), sx * 5.05, 3.05, zc));
    steelParts.push(placed(boxGeo(10.4, 0.28, 0.55), 0, 6.06, zc));
  }
  // roof deck
  {
    const roof = new THREE.Mesh(placed(boxGeo(25.2, 0.30, 17.2), 0, 8.15, 0), M.corr); roof.name = 'roof';
    roof.castShadow = true; roof.receiveShadow = true;
    scene.add(roof);
    addBoxCollider(25.2, 0.30, 17.2, 0, 8.15, 0);
    // parapet
    const pp = [];
    pp.push(placed(boxGeo(25.2, 0.55, 0.22), 0, 8.55, 8.5));
    pp.push(placed(boxGeo(25.2, 0.55, 0.22), 0, 8.55, -8.5));
    pp.push(placed(boxGeo(0.22, 0.55, 17.2), 12.5, 8.55, 0));
    pp.push(placed(boxGeo(0.22, 0.55, 17.2), -12.5, 8.55, 0));
    const ppm = new THREE.Mesh(mergeSafe(pp), M.steel); ppm.name = 'parapet';
    ppm.castShadow = true; ppm.receiveShadow = true; scene.add(ppm);
  }
  // 16 roof beams (I profile) + bracing
  {
    const beam = ibeamGeo(24.4, 0.52, 0.30, 0.05, 0.05);
    const parts = [];
    for (let i = 0; i < 13; i++) {
      const z = -7.2 + i * 1.2;
      parts.push(placed(beam, 0, 7.62, z));
    }
    const gird = ibeamGeo(16.6, 0.72, 0.36, 0.06, 0.06);
    for (const x of [-8, 0, 8]) parts.push(placed(gird, 0, 7.05, 0, 0, Math.PI / 2, 0).translate(x, 0, 0));
    // diagonal bracing rods
    const rod = cylGeo(0.035, 0.035, 1.55, 6, 1);
    for (let i = 0; i < 12; i++) {
      const z = -6.6 + i * 1.2;
      for (const x of [-10, -4, 4, 10]) {
        parts.push(placed(rod, x, 7.35, z, Math.PI / 2 * ((i % 2) ? 1 : -1) * 0.62, 0, 0));
      }
    }
    const m = new THREE.Mesh(mergeSafe(parts), M.steel);
    m.name = 'beams'; m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  // 4 interior pillars
  for (const px of [-6.5, 6.5]) for (const pz of [4.2, -1.0]) {
    wallParts.push(placed(boxGeo(0.55, H - 0.4, 0.55), px, (H - 0.4) / 2, pz));
    steelParts.push(placed(boxGeo(0.85, 0.10, 0.85), px, 0.05, pz));
    addBoxCollider(0.55, H, 0.55, px, H / 2, pz);
  }
  // mezzanine 24 x 5 at y = 4 on the -Z side
  {
    const zc = -5.3;
    grateParts.push(placed(boxGeo(23.2, 0.18, 4.9), 0, 3.91, zc));
    addBoxCollider(23.2, 0.18, 4.9, 0, 3.91, zc);
    // edge beam
    steelParts.push(placed(boxGeo(23.2, 0.42, 0.18), 0, 3.70, -2.94));
    // support columns
    for (const x of [-10.5, -5.25, 0, 5.25, 10.5]) {
      steelParts.push(placed(boxGeo(0.22, 3.82, 0.22), x, 1.91, -3.1));
      addBoxCollider(0.22, 3.82, 0.22, x, 1.91, -3.1);
    }
    // railing: posts + 2 rails + toe board, along z=-2.94 and both ends
    const runs = [
      { a: [-11.5, -2.94], b: [11.5, -2.94] },
      { a: [-11.5, -2.94], b: [-11.5, -7.6] },
      { a: [11.5, -2.94], b: [11.5, -7.6] },
    ];
    for (const run of runs) {
      const dx = run.b[0] - run.a[0], dz = run.b[1] - run.a[1];
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const n = Math.max(2, Math.round(len / 1.45));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        steelParts.push(placed(cylGeo(0.035, 0.035, 1.12, 8, 1), run.a[0] + dx * t, 4.56, run.a[1] + dz * t));
      }
      const cx = (run.a[0] + run.b[0]) / 2, cz = (run.a[1] + run.b[1]) / 2;
      for (const yy of [5.08, 4.45]) steelParts.push(placedRail(cylGeo(0.030, 0.030, len, 8, 1), cx, yy, cz, ang));
      steelParts.push(placed(boxGeo(len, 0.14, 0.04), cx, 4.07, cz, 0, ang - Math.PI / 2, 0));
    }
    // stair up to the mezzanine
    const sx = 10.2;
    for (let i = 0; i < 22; i++) {
      const y = 0.28 + i * 0.27;
      const z = 0.6 - i * 0.30;
      grateParts.push(placed(boxGeo(1.5, 0.05, 0.30), sx, y, z));
      steelParts.push(placed(boxGeo(0.06, 0.26, 0.05), sx - 0.7, y - 0.14, z));
      steelParts.push(placed(boxGeo(0.06, 0.26, 0.05), sx + 0.7, y - 0.14, z));
    }
    // stair stringers + handrail
    steelParts.push(placed(boxGeo(0.08, 0.34, 5.6), sx - 0.75, 2.0, -1.3, -0.73, 0, 0));
    steelParts.push(placed(boxGeo(0.08, 0.34, 5.6), sx + 0.75, 2.0, -1.3, -0.73, 0, 0));
    steelParts.push(placed(cylGeo(0.032, 0.032, 5.6, 8, 1), sx - 0.75, 3.0, -1.3, Math.PI / 2 - 0.73, 0, 0));
    steelParts.push(placed(cylGeo(0.032, 0.032, 5.6, 8, 1), sx + 0.75, 3.0, -1.3, Math.PI / 2 - 0.73, 0, 0));
  }
  // interior polished floor
  {
    const g = new THREE.PlaneGeometry(23.3, 15.3, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 23.3, uv.getY(i) * 15.3);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.floor);
    mesh.position.y = 0.02;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // loading apron outside the gate
    const g2 = new THREE.PlaneGeometry(12, 6, 1, 1);
    const uv2 = g2.attributes.uv;
    for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 12, uv2.getY(i) * 6);
    g2.rotateX(-Math.PI / 2);
    const mesh2 = new THREE.Mesh(g2, M.floor);
    mesh2.position.set(0, 0.018, 11.2);
    mesh2.receiveShadow = true;
    scene.add(mesh2);
  }

  /* ======================================================= EXTERIOR BUILDINGS */
  const corrParts = [], corrBlueParts = [], rustParts = [], woodParts = [], plasticParts = [], rubberParts = [];
  function container(len, hgt, dep, x, y, z, ry, blue) {
    const arr = blue ? corrBlueParts : corrParts;
    arr.push(placed(boxGeo(len, hgt, dep), x, y + hgt / 2, z, 0, ry, 0));
    // corner castings + door bars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * (len / 2 - 0.16), lz = sz * (dep / 2 - 0.16);
      const wx = x + lx * Math.cos(ry) + lz * Math.sin(ry);
      const wz = z - lx * Math.sin(ry) + lz * Math.cos(ry);
      steelParts.push(placed(boxGeo(0.30, hgt, 0.30), wx, y + hgt / 2, wz, 0, ry, 0));
    }
    addBoxCollider(len, hgt, dep, x, y + hgt / 2, z, ry);
  }
  container(12.19, 2.59, 2.44, -22.5, 0, 6.5, 0.21, false);
  container(6.06, 2.59, 2.44, 20.5, 0, -12.5, -0.12, true);
  container(6.06, 2.59, 2.44, 20.9, 2.59, -12.2, 0.05, false);
  // site office
  {
    const x = -16.5, z = -19.5, ry = 0.5;
    corrBlueParts.push(placed(boxGeo(5.4, 3.3, 3.6), x, 1.65, z, 0, ry, 0));
    corrParts.push(placed(boxGeo(5.9, 0.16, 4.1), x, 3.42, z, 0, ry, 0));
    steelParts.push(placed(boxGeo(1.0, 2.2, 0.10), x + 1.4 * Math.cos(ry), 1.1, z - 1.4 * Math.sin(ry) + 1.8 * Math.cos(ry), 0, ry, 0));
    glassParts.push(placed(boxGeo(1.6, 1.0, 0.06), x - 1.3 * Math.cos(ry), 2.0, z + 1.3 * Math.sin(ry) + 1.8 * Math.cos(ry), 0, ry, 0));
    addBoxCollider(5.4, 3.3, 3.6, x, 1.65, z, ry);
  }

  /* ============================================================ FENCE (>=40) */
  {
    const posts = [], panels = [];
    const R = 34, seg = 3.0;
    const sides = [
      { a: [-R, -R], b: [R, -R] }, { a: [R, -R], b: [R, R] },
      { a: [R, R], b: [-R, R] }, { a: [-R, R], b: [-R, -R] },
    ];
    let count = 0;
    for (const s of sides) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      const n = Math.round(len / seg);
      const ang = Math.atan2(dx, dz);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const mx = s.a[0] + dx * (t0 + t1) / 2, mz = s.a[1] + dz * (t0 + t1) / 2;
        // gate gap on the +Z side
        if (s.a[1] === R && Math.abs(mx) < 4.6) continue;
        const pg = new THREE.PlaneGeometry(len / n, 2.15);
        const puv = pg.attributes.uv;
        for (let k = 0; k < puv.count; k++) puv.setXY(k, puv.getX(k) * (len / n) * 1.1, puv.getY(k) * 2.15 * 1.1);
        panels.push(placed(pg, mx, 1.28, mz, 0, ang + Math.PI / 2, 0));
        count++;
      }
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = s.a[0] + dx * t, pz = s.a[1] + dz * t;
        if (s.a[1] === R && Math.abs(px) < 4.4) continue;
        posts.push(placed(cylGeo(0.055, 0.06, 2.55, 7, 1), px, 1.27, pz));
      }
      const cx = (s.a[0] + s.b[0]) / 2, cz = (s.a[1] + s.b[1]) / 2;
      posts.push(placedRail(cylGeo(0.04, 0.04, len, 7, 1), cx, 2.38, cz, ang));
      posts.push(placedRail(cylGeo(0.035, 0.035, len, 6, 1), cx, 0.18, cz, ang));
    }
    const pm = new THREE.Mesh(mergeSafe(posts), M.steel);
    pm.name = 'fencePosts'; pm.castShadow = true; scene.add(pm);
    const fm = new THREE.Mesh(mergeSafe(panels), M.fence);
    scene.add(fm);
    scene.userData.fenceSegments = count;
  }

  /* ============================================================ LAMPS (>=12) */
  const lampLights = [];
  {
    const parts = [], lens = [];
    const spots = [
      [-30, 20], [-30, 2], [-30, -16], [-12, 26], [6, 26], [24, 24],
      [30, 6], [30, -12], [16, -24], [-2, -26], [-20, -26], [28, 20],
      [-30, -30], [30, 30],
    ];
    for (const [x, z] of spots) {
      const dir = Math.atan2(-x, -z);
      parts.push(placed(cylGeo(0.20, 0.26, 0.35, 10, 1), x, 0.17, z));
      parts.push(placed(cylGeo(0.10, 0.135, 7.0, 10, 1), x, 3.6, z));
      // arm
      parts.push(placedRail(cylGeo(0.075, 0.075, 1.5, 8, 1), x + Math.sin(dir) * 0.62, 7.12, z + Math.cos(dir) * 0.62, dir));
      parts.push(placed(boxGeo(0.34, 0.16, 0.70), x + Math.sin(dir) * 1.32, 6.95, z + Math.cos(dir) * 1.32, 0, dir, 0));
      lens.push(placed(boxGeo(0.28, 0.04, 0.58), x + Math.sin(dir) * 1.32, 6.865, z + Math.cos(dir) * 1.32, 0, dir, 0));
      addBoxCollider(0.27, 7.0, 0.27, x, 3.5, z);
    }
    const pm = new THREE.Mesh(mergeSafe(parts), M.steel);
    pm.name = 'lamps'; pm.castShadow = true; pm.receiveShadow = true; scene.add(pm);
    const lm = new THREE.Mesh(mergeSafe(lens), M.lamp);
    scene.add(lm);
    scene.userData.lampCount = spots.length;
    // exterior lamps read through their emissive lenses + bloom; no analytic lights
    // (each extra point light is evaluated per pixel for the whole frame here)
  }

  /* ================================================ INTERIOR LOCAL LIGHTS (4) */
  const interiorLights = [];
  {
    const shades = [];
    const pts = [[-7.5, 6.55, 3.6], [7.5, 6.55, 3.6], [-7.5, 6.55, -3.6], [7.5, 6.55, -3.6]];
    const emis = [];
    for (const [x, y, z] of pts) {
      shades.push(placed(cylGeo(0.42, 0.16, 0.30, 12, 1), x, y + 0.20, z));
      shades.push(placed(cylGeo(0.035, 0.035, 0.85, 6, 1), x, y + 0.78, z));
      emis.push(placed(new THREE.SphereGeometry(0.17, 10, 8), x, y - 0.02, z));
      const l = new THREE.PointLight(0xffbe7a, 120, 25, 1.9);
      l.position.set(x, y - 0.08, z);
      scene.add(l);
      interiorLights.push(l);
    }
    const sm = new THREE.Mesh(mergeSafe(shades), M.steel);
    sm.name = 'shades'; sm.castShadow = true; scene.add(sm);
    const em = new THREE.Mesh(mergeSafe(emis), new THREE.MeshStandardMaterial({
      color: 0x120d06, emissive: new THREE.Color(0xffd7a2), emissiveIntensity: 6.5, roughness: 0.4, metalness: 0,
    }));
    scene.add(em);
    // work light on a tripod, warm, inside
    const tri = [];
    tri.push(placed(cylGeo(0.03, 0.03, 1.6, 6, 1), -9.0, 0.8, 6.0, 0.16, 0, 0.16));
    tri.push(placed(cylGeo(0.03, 0.03, 1.6, 6, 1), -9.0, 0.8, 6.0, -0.16, 0, -0.1));
    tri.push(placed(cylGeo(0.03, 0.03, 1.6, 6, 1), -9.0, 0.8, 6.0, 0.0, 0, 0.2));
    tri.push(placed(boxGeo(0.44, 0.26, 0.16), -9.0, 1.68, 6.05));
    const tm = new THREE.Mesh(mergeSafe(tri), M.steel);
    tm.name = 'tripod'; tm.castShadow = true; scene.add(tm);
    const tl = new THREE.Mesh(placed(boxGeo(0.38, 0.20, 0.03), -9.0, 1.68, 6.15), new THREE.MeshStandardMaterial({
      color: 0x1a1509, emissive: new THREE.Color(0xfff0d0), emissiveIntensity: 9, roughness: 0.3, metalness: 0,
    }));
    scene.add(tl);
    const wl = new THREE.PointLight(0xffd79c, 130, 28, 1.8);
    wl.position.set(-9.0, 1.72, 6.4);
    scene.add(wl);
    interiorLights.push(wl);

  }

  /* ================================================== DEBRIS / CLUTTER (>=60) */
  {
    const r = rng(20240918);
    let n = 0;
    const inBuilding = (x, z) => Math.abs(x) < 11 && Math.abs(z) < 7.2;
    const pick = () => {
      let x, z, tries = 0;
      do { x = -32 + r() * 64; z = -32 + r() * 64; tries++; } while (inBuilding(x, z) && tries < 20);
      return [x, z];
    };
    // planks
    for (let i = 0; i < 26; i++) {
      const [x, z] = pick();
      const L = 1.1 + r() * 2.4;
      woodParts.push(placed(boxGeo(L, 0.045, 0.16 + r() * 0.12), x, 0.03 + r() * 0.12, z, (r() - 0.5) * 0.15, r() * 6.28, (r() - 0.5) * 0.15));
    }
    // pallets
    for (let i = 0; i < 9; i++) {
      const [x, z] = pick();
      const ry = r() * 6.28, yy = 0.02;
      for (let k = 0; k < 6; k++) {
        const off = -0.5 + k * 0.2;
        woodParts.push(placed(boxGeo(1.2, 0.022, 0.12), x, yy + 0.12, z, 0, ry, 0).translate(Math.sin(ry + Math.PI / 2) * off, 0, Math.cos(ry + Math.PI / 2) * off));
      }
      for (const off of [-0.5, 0, 0.5]) {
        woodParts.push(placed(boxGeo(1.2, 0.09, 0.10), x, yy + 0.05, z, 0, ry, 0).translate(Math.sin(ry + Math.PI / 2) * off, 0, Math.cos(ry + Math.PI / 2) * off));
      }
      n++;
    }
    // concrete rubble
    for (let i = 0; i < 30; i++) {
      const [x, z] = pick();
      const s = 0.14 + r() * 0.34;
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.computeVertexNormals();
      const uvs = new Float32Array(g.attributes.position.count * 2);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) { uvs[k * 2] = pos.getX(k) * 1.4 + 0.5; uvs[k * 2 + 1] = pos.getZ(k) * 1.4 + 0.5; }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      wallParts.push(placed(g, x, s * 0.55, z, r() * 3, r() * 3, r() * 3));
    }
    // fallen drums
    for (let i = 0; i < 11; i++) {
      const [x, z] = pick();
      const lying = r() > 0.45;
      if (lying) rustParts.push(placed(cylGeo(0.295, 0.295, 0.88, 14, 1), x, 0.30, z, Math.PI / 2, r() * 6.28, 0));
      else rustParts.push(placed(cylGeo(0.295, 0.295, 0.88, 14, 1), x, 0.45, z, 0, r() * 6.28, 0));
    }
    // bricks
    for (let i = 0; i < 18; i++) {
      const [x, z] = pick();
      wallParts.push(placed(boxGeo(0.22, 0.10, 0.11), x, 0.055 + r() * 0.1, z, (r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3));
    }
    // traffic cones + plastic crates
    for (let i = 0; i < 10; i++) {
      const [x, z] = pick();
      plasticParts.push(placed(cylGeo(0.035, 0.24, 0.62, 10, 1), x, 0.32, z));
      plasticParts.push(placed(boxGeo(0.44, 0.03, 0.44), x, 0.015, z));
    }
    for (let i = 0; i < 8; i++) {
      const [x, z] = pick();
      plasticParts.push(placed(boxGeo(0.55, 0.34, 0.38), x, 0.17, z, 0, r() * 6.28, 0));
    }
    // scrap pipes
    for (let i = 0; i < 12; i++) {
      const [x, z] = pick();
      rustParts.push(placed(cylGeo(0.06, 0.06, 1.4 + r() * 1.8, 8, 1), x, 0.07, z, Math.PI / 2, r() * 6.28, 0));
    }
    // cable reels
    for (let i = 0; i < 3; i++) {
      const [x, z] = pick();
      woodParts.push(placed(cylGeo(0.62, 0.62, 0.06, 16, 1), x, 0.65, z, 0, 0, Math.PI / 2));
      woodParts.push(placed(cylGeo(0.62, 0.62, 0.06, 16, 1), x, 0.65, z, 0, 0, Math.PI / 2).translate(0.42, 0, 0));
      rustParts.push(placed(cylGeo(0.26, 0.26, 0.42, 12, 1), x + 0.21, 0.65, z, 0, 0, Math.PI / 2));
    }
    // tyre stacks near the building
    for (let i = 0; i < 4; i++) {
      const bx = 13.5 + r() * 3, bz = 8 + r() * 6;
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
        rubberParts.push(placed(new THREE.TorusGeometry(0.34, 0.14, 8, 14), bx, 0.16 + k * 0.28, bz, Math.PI / 2, 0, 0));
      }
    }
  }

  /* --------------------- merge static groups into few draw calls -------------- */
  function addMerged(parts, mat, cast, receive, name) {
    if (!parts.length) return null;
    const g = mergeSafe(parts);
    const m = new THREE.Mesh(g, mat);
    m.name = name || 'merged';
    m.castShadow = !!cast; m.receiveShadow = !!receive;
    scene.add(m);
    parts.length = 0;
    return m;
  }
  addMerged(wallParts, M.wall, true, true, 'wall');
  addMerged(steelParts, M.steel, true, true, 'steel');
  addMerged(grateParts, M.grate, true, true, 'grate');
  addMerged(corrParts, M.corr, true, true, 'corr');
  addMerged(corrBlueParts, M.corrBlue, true, true, 'corrBlue');
  addMerged(rustParts, M.rust, true, true, 'rust');
  addMerged(woodParts, M.wood, true, true, 'wood');
  addMerged(rubberParts, M.rubber, true, true, 'rubber');
  const plasticMesh = addMerged(plasticParts, M.plastic, true, true, 'plastic');
  if (plasticMesh) plasticMesh.material.side = THREE.DoubleSide;
  {
    const gm = new THREE.Mesh(mergeSafe(glassParts), M.glass);
    gm.renderOrder = 3;
    scene.add(gm);
    scene.userData.windowCount = glassParts.length;
  }

  /* ------------------------------------------------------------ light shafts */
  const shafts = [];
  {
    const shaftMat = (color, intensity) => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uInt: { value: intensity },
        uHalf: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: `varying vec3 vL; varying vec3 vW;
        void main(){ vL = position; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uInt; uniform vec3 uHalf;
        varying vec3 vL; varying vec3 vW;
        void main(){
          float t = clamp((vL.z / uHalf.z) * 0.5 + 0.5, 0.0, 1.0);
          float fade = pow(1.0 - t, 1.7);
          float ex = 1.0 - smoothstep(0.40, 1.0, abs(vL.x)/uHalf.x);
          float ey = 1.0 - smoothstep(0.40, 1.0, abs(vL.y)/uHalf.y);
          float a = fade * ex * ey * uInt;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    // light travels along -sunDir
    const ld = sunDir.clone().negate();
    const mkShaft = (px, py, pz, w, h, len, intensity) => {
      const g = new THREE.BoxGeometry(w, h, len);
      const mat = shaftMat(0xffe0b0, intensity);
      mat.uniforms.uHalf.value.set(w / 2, h / 2, len / 2);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(px, py, pz).addScaledVector(ld, len / 2);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ld);
      mesh.renderOrder = 8;
      mesh.frustumCulled = false;
      scene.add(mesh);
      shafts.push(mesh);
    };
    for (const cz of [-5.4, -1.8, 1.8, 5.4]) mkShaft(-11.6, 5.3, cz, 2.5, 1.75, 16, 0.42);
    mkShaft(0, 3.0, 7.6, 9.8, 5.9, 20, 0.40);
    mkShaft(5.9, 5.9, 7.6, 3.0, 1.8, 14, 0.30);
  }

  return {
    scene, sun, sunDir, M, T, statics, shafts,
    sprites: { dot, smoke: smokeSprite },
    interiorLights, lampLights,
    counts: {
      windows: scene.userData.windowCount, fence: scene.userData.fenceSegments,
      lamps: scene.userData.lampCount, beams: 16,
    },
  };
}
