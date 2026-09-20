import { PBRMaterial, Color3, Texture, DynamicTexture, Constants } from '@babylonjs/core';
import { makeMaps, makeAlphaTexture } from './tex.js';
import * as R from './tex.js';
import { fbm, clamp01, smoothstep } from './noise.js';

function pbr(scene, name, maps, o = {}) {
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = maps.albedo;
  m.bumpTexture = maps.normal;
  m.metallicTexture = maps.orm;
  m.useRoughnessFromMetallicTextureAlpha = false;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = true;
  m.useAmbientOcclusionFromMetallicTextureRed = true;
  m.metallic = o.metallic ?? 1.0;
  m.roughness = o.roughness ?? 1.0;
  m.albedoColor = o.color ?? new Color3(1, 1, 1);
  m.bumpTexture.level = o.bump ?? 1.0;
  m.maxSimultaneousLights = o.lights ?? 6;
  m.enableSpecularAntiAliasing = true;
  m.forceIrradianceInFragment = false;
  if (o.uv) { for (const t of [maps.albedo, maps.normal, maps.orm]) { t.uScale = o.uv; t.vScale = o.uv; } }
  return m;
}

export function buildMaterials(scene) {
  const M = {};
  const N = (s, sz, fn, opt) => makeMaps(scene, s, sz, fn, opt);

  const mConcreteExt = N('concExt', 512, R.recipeConcreteExt, { normalStrength: 9, aoAmount: 2.0 });
  const mWall = N('wall', 512, R.recipeConcreteWall, { normalStrength: 11, aoAmount: 2.4 });
  const mFloor = N('floorInt', 512, R.recipeConcretePolished, { normalStrength: 6, aoAmount: 1.6 });
  const mPaint = N('paint', 384, R.recipePaintedMetal, { normalStrength: 7, aoAmount: 1.8 });
  const mCorr = N('corrug', 384, R.recipeCorrugated, { normalStrength: 16, aoAmount: 1.4 });
  const mRust = N('rust', 384, R.recipeRust, { normalStrength: 12, aoAmount: 2.2 });
  const mWood = N('wood', 384, R.recipeWood, { normalStrength: 8, aoAmount: 1.8 });
  const mRubber = N('rubber', 256, R.recipeRubber, { normalStrength: 10, aoAmount: 1.5 });
  const mPlastic = N('plastic', 256, R.recipePlastic, { normalStrength: 5, aoAmount: 1.2 });
  const mSteel = N('steel', 256, R.recipeSteel, { normalStrength: 5, aoAmount: 1.0 });
  const mGravel = N('gravel', 256, R.recipeGravel, { normalStrength: 14, aoAmount: 2.2 });

  M.groundExt = pbr(scene, 'm_groundExt', mConcreteExt, { bump: 1.15, lights: 2 });
  M.wall = pbr(scene, 'm_wall', mWall, { bump: 1.0 });
  M.floorInt = pbr(scene, 'm_floorInt', mFloor, { bump: 0.7, roughness: 0.92 });
  M.metal = pbr(scene, 'm_metal', mPaint, { color: new Color3(0.56, 0.60, 0.64) });
  M.metalRail = pbr(scene, 'm_metalRail', mPaint, { color: new Color3(0.80, 0.62, 0.16), roughness: 0.95 });
  M.containerA = pbr(scene, 'm_contA', mCorr, { color: new Color3(0.28, 0.40, 0.52) });
  M.containerB = pbr(scene, 'm_contB', mCorr, { color: new Color3(0.62, 0.25, 0.18) });
  M.containerC = pbr(scene, 'm_contC', mCorr, { color: new Color3(0.42, 0.46, 0.34) });
  M.rust = pbr(scene, 'm_rust', mRust, {});
  M.wood = pbr(scene, 'm_wood', mWood, {});
  M.rubber = pbr(scene, 'm_rubber', mRubber, { roughness: 1.0 });
  M.plasticY = pbr(scene, 'm_plasticY', mPlastic, { color: new Color3(0.86, 0.52, 0.08) });
  M.plasticB = pbr(scene, 'm_plasticB', mPlastic, { color: new Color3(0.20, 0.34, 0.52) });
  M.steel = pbr(scene, 'm_steel', mSteel, {});
  M.gravel = pbr(scene, 'm_gravel', mGravel, {});

  // --- vidrio ---
  const glass = new PBRMaterial('m_glass', scene);
  glass.albedoColor = new Color3(0.42, 0.52, 0.56);
  glass.metallic = 0.0; glass.roughness = 0.06;
  glass.alpha = 0.26;
  glass.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  glass.backFaceCulling = false;
  glass.environmentIntensity = 1.35;
  glass.useRadianceOverAlpha = true;
  glass.useSpecularOverAlpha = true;
  glass.maxSimultaneousLights = 6;
  M.glass = glass;

  // --- charco: mismo hormigon pero mojado, refleja ---
  const wet = pbr(scene, 'm_wet', N('wet', 256, (u, v, o) => {
    const ripple = fbm(u * 26, v * 26, 128, 17, 4);
    const macro = fbm(u * 5, v * 5, 32, 51, 4);
    const t = 0.055 + macro * 0.035;
    o[0] = t * 1.0; o[1] = t * 1.05; o[2] = t * 1.12;
    o[3] = ripple * 0.5 + macro * 0.5;
    o[4] = clamp01(0.045 + macro * 0.10);
    o[5] = 0.0;
    o[6] = 1.0;
  }, { normalStrength: 2.0, aoAmount: 0.4 }), { bump: 0.45, lights: 2 });
  M.wet = wet;

  // --- metal emisivo de luminarias ---
  const lamp = new PBRMaterial('m_lampGlass', scene);
  lamp.albedoColor = new Color3(0.05, 0.05, 0.05);
  lamp.metallic = 0.0; lamp.roughness = 0.25;
  lamp.emissiveColor = new Color3(3.4, 2.55, 1.45);
  lamp.maxSimultaneousLights = 2;
  M.lampOn = lamp;

  const lampOff = new PBRMaterial('m_lampOff', scene);
  lampOff.albedoColor = new Color3(0.55, 0.55, 0.52);
  lampOff.metallic = 0.1; lampOff.roughness = 0.35;
  lampOff.emissiveColor = new Color3(0.55, 0.42, 0.22);
  lampOff.maxSimultaneousLights = 2;
  M.lampOff = lampOff;

  // --- malla de simple torsion (alpha test) ---
  const meshTex = makeAlphaTexture(scene, 'chainlink', 256, (u, v, o) => {
    const n = 16;
    const a = Math.abs(((u * n + v * n) % 1) - 0.5);
    const b = Math.abs(((u * n - v * n) % 1) - 0.5);
    const w = 0.13;
    const on = (a < w ? 1 : 0) || (b < w ? 1 : 0);
    const shade = 0.5 + 0.5 * (1 - Math.min(a, b) / w);
    o[0] = 0.34 * shade; o[1] = 0.35 * shade; o[2] = 0.36 * shade;
    o[3] = on ? 1 : 0;
  });
  meshTex.uScale = 3; meshTex.vScale = 2;
  const fence = new PBRMaterial('m_fence', scene);
  fence.albedoTexture = meshTex;
  fence.useAlphaFromAlbedoTexture = true;
  fence.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST;
  fence.alphaCutOff = 0.4;
  fence.metallic = 0.85; fence.roughness = 0.55;
  fence.backFaceCulling = false;
  fence.maxSimultaneousLights = 2;
  M.fence = fence;

  // --- cartel con texto (canvas 2D) ---
  const dt = new DynamicTexture('signTex', { width: 512, height: 256 }, scene, true);
  const ctx = dt.getContext();
  ctx.fillStyle = '#c8501f'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  ctx.strokeStyle = '#f2ead8'; ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 480, 224);
  ctx.fillStyle = '#f7f1e2';
  ctx.font = 'bold 86px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('NAVE 7', 256, 96);
  ctx.font = 'bold 40px Helvetica, Arial, sans-serif';
  ctx.fillText('ZONA RESTRINGIDA', 256, 176);
  ctx.fillStyle = 'rgba(20,10,4,0.30)';
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    ctx.fillRect(x, y, 2 + Math.random() * 6, 1 + Math.random() * 2);
  }
  dt.update();
  const sign = new PBRMaterial('m_sign', scene);
  sign.albedoTexture = dt;
  sign.bumpTexture = mPaint.normal;
  sign.metallic = 0.15; sign.roughness = 0.62;
  sign.maxSimultaneousLights = 6;
  sign.backFaceCulling = false;
  M.sign = sign;

  M._maps = { mConcreteExt, mWall, mFloor, mPaint, mCorr, mRust, mWood, mRubber, mPlastic, mSteel, mGravel };
  return M;
}
