// ---------------------------------------------------------------------------
// VFX: polvo en suspension, columna de humo, fuego, chispas y haces de luz.
// ---------------------------------------------------------------------------
import {
  ParticleSystem, Vector3, Color4, Color3, MeshBuilder, Mesh, Matrix, Quaternion,
  StandardMaterial, Texture, Constants,
} from '@babylonjs/core';
import { makeAlphaTexture } from './tex.js';
import { fbm, clamp01, smoothstep } from './noise.js';

export function buildVFX(scene, sunDir) {
  const V = {};

  const dot = makeAlphaTexture(scene, 'p_dot', 64, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = Math.pow(clamp01(1 - d), 2.1);
    o[0] = 1; o[1] = 1; o[2] = 1; o[3] = a;
  });
  const puff = makeAlphaTexture(scene, 'p_puff', 128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = fbm(u * 6, v * 6, 8, 313, 4);
    const a = clamp01(1 - d) * (0.45 + n * 0.85);
    o[0] = 1; o[1] = 1; o[2] = 1; o[3] = clamp01(Math.pow(a, 1.5));
  });
  const streak = makeAlphaTexture(scene, 'p_streak', 64, (u, v, o) => {
    const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2;
    const a = clamp01(1 - dx * dx) * clamp01(1 - Math.pow(dy, 0.6));
    o[0] = 1; o[1] = 1; o[2] = 1; o[3] = a;
  });

  // ---------- polvo en el haz de luz (interior) ----------
  const motes = new ParticleSystem('motes', 720, scene);
  motes.particleTexture = dot;
  motes.emitter = new Vector3(-1, 3.4, 1.0);
  motes.createBoxEmitter(new Vector3(0, 1, 0), new Vector3(0, 1, 0),
    new Vector3(-11, -3.2, -7), new Vector3(11, 4.2, 7.4));
  motes.color1 = new Color4(1.0, 0.86, 0.66, 0.48);
  motes.color2 = new Color4(0.78, 0.80, 0.92, 0.26);
  motes.colorDead = new Color4(0.5, 0.5, 0.6, 0);
  motes.minSize = 0.016; motes.maxSize = 0.055;
  motes.minLifeTime = 7; motes.maxLifeTime = 15;
  motes.emitRate = 62;
  motes.blendMode = ParticleSystem.BLENDMODE_ADD;
  motes.gravity = new Vector3(0, -0.035, 0);
  motes.direction1 = new Vector3(-0.12, 0.05, -0.12);
  motes.direction2 = new Vector3(0.12, 0.11, 0.12);
  motes.minEmitPower = 0.02; motes.maxEmitPower = 0.12;
  motes.updateSpeed = 0.02;
  motes.preWarmCycles = 260; motes.preWarmStepOffset = 4;
  motes.start();
  V.motes = motes;

  // polvo ambiente mas denso y tenue
  const haze = new ParticleSystem('haze', 70, scene);
  haze.particleTexture = puff;
  haze.emitter = new Vector3(0, 3.0, 0);
  haze.createBoxEmitter(new Vector3(0, 1, 0), new Vector3(0, 1, 0),
    new Vector3(-11, -2.8, -7.5), new Vector3(11, 4.0, 7.5));
  haze.color1 = new Color4(0.66, 0.63, 0.60, 0.075);
  haze.color2 = new Color4(0.42, 0.45, 0.55, 0.035);
  haze.colorDead = new Color4(0.4, 0.42, 0.5, 0);
  haze.minSize = 1.1; haze.maxSize = 2.1;
  haze.minLifeTime = 10; haze.maxLifeTime = 18;
  haze.emitRate = 5;
  haze.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  haze.gravity = new Vector3(0, 0.02, 0);
  haze.minEmitPower = 0.02; haze.maxEmitPower = 0.1;
  haze.updateSpeed = 0.02;
  haze.preWarmCycles = 300; haze.preWarmStepOffset = 4;
  haze.start();
  V.haze = haze;

  // ---------- columna de humo de un bidon exterior ----------
  const BARREL = new Vector3(11.2, 0.0, 17.0);
  V.barrelPos = BARREL;
  const smoke = new ParticleSystem('smoke', 210, scene);
  smoke.particleTexture = puff;
  smoke.emitter = new Vector3(BARREL.x, BARREL.y + 0.95, BARREL.z);
  smoke.createConeEmitter(0.26, 0.5);
  smoke.color1 = new Color4(0.30, 0.29, 0.28, 0.62);
  smoke.color2 = new Color4(0.14, 0.135, 0.14, 0.48);
  smoke.colorDead = new Color4(0.09, 0.09, 0.10, 0);
  smoke.minSize = 0.55; smoke.maxSize = 1.2;
  smoke.addSizeGradient(0, 0.5, 0.9);
  smoke.addSizeGradient(1.0, 2.6, 4.0);
  smoke.minLifeTime = 3.2; smoke.maxLifeTime = 6.0;
  smoke.emitRate = 22;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.gravity = new Vector3(0.55, 1.7, -0.35);
  smoke.minEmitPower = 1.1; smoke.maxEmitPower = 2.4;
  smoke.minAngularSpeed = -0.5; smoke.maxAngularSpeed = 0.5;
  smoke.updateSpeed = 0.02;
  smoke.preWarmCycles = 220; smoke.preWarmStepOffset = 4;
  smoke.start();
  V.smoke = smoke;

  const fire = new ParticleSystem('fire', 180, scene);
  fire.particleTexture = puff;
  fire.emitter = new Vector3(BARREL.x, BARREL.y + 0.82, BARREL.z);
  fire.createConeEmitter(0.2, 0.4);
  fire.color1 = new Color4(2.6, 1.25, 0.32, 1.0);
  fire.color2 = new Color4(1.8, 0.52, 0.10, 1.0);
  fire.colorDead = new Color4(0.5, 0.12, 0.02, 0);
  fire.minSize = 0.16; fire.maxSize = 0.52;
  fire.minLifeTime = 0.35; fire.maxLifeTime = 0.85;
  fire.emitRate = 85;
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.gravity = new Vector3(0.1, 2.6, 0);
  fire.minEmitPower = 0.7; fire.maxEmitPower = 1.8;
  fire.updateSpeed = 0.02;
  fire.preWarmCycles = 60;
  fire.start();
  V.fire = fire;

  // ---------- chispas (pool round-robin) ----------
  V.sparks = [];
  for (let i = 0; i < 5; i++) {
    const sp = new ParticleSystem('sparks' + i, 260, scene);
    sp.particleTexture = streak;
    sp.emitter = new Vector3(0, -50, 0);
    sp.createSphereEmitter(0.16, 1.0);
    sp.color1 = new Color4(3.0, 1.9, 0.75, 1.0);
    sp.color2 = new Color4(2.4, 0.85, 0.18, 1.0);
    sp.colorDead = new Color4(0.7, 0.16, 0.02, 0);
    sp.minSize = 0.03; sp.maxSize = 0.13;
    sp.minScaleY = 1.0; sp.maxScaleY = 3.6;
    sp.minLifeTime = 0.35; sp.maxLifeTime = 1.15;
    sp.emitRate = 0;
    sp.manualEmitCount = 0;
    sp.blendMode = ParticleSystem.BLENDMODE_ADD;
    sp.gravity = new Vector3(0, -12.5, 0);
    sp.minEmitPower = 3.5; sp.maxEmitPower = 13;
    sp.minAngularSpeed = -6; sp.maxAngularSpeed = 6;
    sp.updateSpeed = 0.02;
    sp.start();
    V.sparks.push(sp);
  }
  let sparkIdx = 0;
  V.burst = (pos, count) => {
    const sp = V.sparks[sparkIdx++ % V.sparks.length];
    sp.emitter = pos.clone ? pos.clone() : new Vector3(pos.x, pos.y, pos.z);
    sp.manualEmitCount = count;
  };

  // ---------- polvo de explosion ----------
  const blast = new ParticleSystem('blast', 380, scene);
  blast.particleTexture = puff;
  blast.emitter = new Vector3(0, 1, 0);
  blast.createSphereEmitter(2.2, 0.85);
  blast.color1 = new Color4(0.62, 0.56, 0.47, 0.62);
  blast.color2 = new Color4(0.30, 0.28, 0.27, 0.5);
  blast.colorDead = new Color4(0.2, 0.19, 0.19, 0);
  blast.minSize = 0.6; blast.maxSize = 1.5;
  blast.addSizeGradient(0, 0.5, 1.0);
  blast.addSizeGradient(1.0, 1.9, 3.0);
  blast.minLifeTime = 1.0; blast.maxLifeTime = 2.2;
  blast.emitRate = 0; blast.manualEmitCount = 0;
  blast.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  blast.gravity = new Vector3(0, 0.9, 0);
  blast.minEmitPower = 2.0; blast.maxEmitPower = 6.5;
  blast.updateSpeed = 0.02;
  blast.start();
  const flash = new ParticleSystem('flash', 150, scene);
  flash.particleTexture = puff;
  flash.emitter = new Vector3(0, 1, 0);
  flash.createSphereEmitter(1.1, 1.0);
  flash.color1 = new Color4(3.4, 2.1, 0.8, 1.0);
  flash.color2 = new Color4(2.2, 0.8, 0.18, 1.0);
  flash.colorDead = new Color4(0.5, 0.12, 0.02, 0);
  flash.minSize = 0.5; flash.maxSize = 1.6;
  flash.minLifeTime = 0.22; flash.maxLifeTime = 0.6;
  flash.emitRate = 0; flash.manualEmitCount = 0;
  flash.blendMode = ParticleSystem.BLENDMODE_ADD;
  flash.gravity = new Vector3(0, 3, 0);
  flash.minEmitPower = 3; flash.maxEmitPower = 9;
  flash.updateSpeed = 0.02;
  flash.start();
  V.blastAt = (pos) => {
    blast.emitter = pos.clone();
    flash.emitter = pos.clone();
    blast.manualEmitCount = 110;
    flash.manualEmitCount = 60;
  };

  // ---------- haces de luz volumetricos (falsos, aditivos) ----------
  const shaftTex = makeAlphaTexture(scene, 'shaft', 128, (u, v, o) => {
    const dx = Math.abs(u - 0.5) * 2;
    const edge = Math.pow(clamp01(1 - dx), 1.7);
    const along = Math.pow(clamp01(1 - v), 1.35) * smoothstep(0, 0.10, v);
    const a = edge * along;
    o[0] = 1; o[1] = 0.93; o[2] = 0.78; o[3] = a;
  });
  const shaftMat = new StandardMaterial('m_shaft', scene);
  shaftMat.diffuseColor = new Color3(0, 0, 0);
  shaftMat.emissiveColor = new Color3(1, 1, 1);
  shaftMat.emissiveTexture = shaftTex;
  shaftMat.opacityTexture = shaftTex;
  shaftMat.disableLighting = true;
  shaftMat.backFaceCulling = false;
  shaftMat.alphaMode = Constants.ALPHA_ADD;
  shaftMat.alpha = 0.72;
  shaftMat.freeze();

  const shafts = [];
  const mkShaft = (from, width, length, power) => {
    const beam = sunDir.scale(-1).normalize();           // direccion en que viaja la luz
    let right = Vector3.Cross(new Vector3(0, 1, 0), beam).normalize();
    for (let k = 0; k < 1; k++) {
      const p = MeshBuilder.CreatePlane('shaft', { width, height: length }, scene);
      p.material = shaftMat;
      p.isPickable = false;
      p.applyFog = false;
      p.receiveShadows = false;
      p.position.copyFrom(from.add(beam.scale(length * 0.5)));
      const zax = Vector3.Cross(right, beam).normalize();
      const mtx = new Matrix();
      Matrix.FromXYZAxesToRef(right, beam, zax, mtx);
      p.rotationQuaternion = Quaternion.FromRotationMatrix(mtx);
      p.visibility = power;
      p.freezeWorldMatrix();
      p.alwaysSelectAsActiveMesh = true;
      shafts.push(p);
    }
  };
  V.mkShaft = mkShaft;
  V.shafts = shafts;
  return V;
}
