import * as THREE from 'three';
import { rng } from './scene.js';

/* --------------------------------------------------------------- dust motes */
export function makeDust(count, sprite, sampleLight) {
  const r = rng(4242);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // inside the warehouse volume, denser low and near the gate light
    const x = -11 + r() * 22;
    const y = 0.25 + Math.pow(r(), 1.35) * 7.2;
    const z = -7.2 + r() * 14.4;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    phase[i * 3] = r() * 6.28; phase[i * 3 + 1] = r() * 6.28; phase[i * 3 + 2] = r() * 6.28;
    size[i] = 0.012 + Math.pow(r(), 2.4) * 0.055;
    sampleLight(x, y, z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 24);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: sprite }, uScale: { value: 720 } },
    vertexShader: `
      uniform float uTime; uniform float uScale;
      attribute vec3 aPhase; attribute float aSize; attribute vec3 aColor;
      varying vec3 vColor; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*0.33 + aPhase.x)*0.48 + sin(uTime*0.11 + aPhase.z)*0.9;
        p.y += sin(uTime*0.19 + aPhase.y)*0.34;
        p.z += cos(uTime*0.27 + aPhase.z)*0.48 + cos(uTime*0.09 + aPhase.x)*0.7;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(0.4, -mv.z), 1.0, 26.0);
        vColor = aColor;
        vA = 0.45 + 0.55 * (0.5 + 0.5*sin(uTime*0.9 + aPhase.x*2.7));
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec3 vColor; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        float a = t.a * vA;
        if (a < 0.008) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

/* -------------------------------------------------------------- smoke column */
export function makeSmoke(count, sprite, origin, sunColor) {
  const r = rng(909);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    seed[i * 4] = i / count;                    // lifetime offset
    seed[i * 4 + 1] = r() * 6.28;               // sway phase
    seed[i * 4 + 2] = 0.55 + r() * 0.9;         // size scale
    seed[i * 4 + 3] = 0.75 + r() * 0.5;         // speed scale
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(origin.x, origin.y + 9, origin.z), 22);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uMap: { value: sprite }, uScale: { value: 720 },
      uSun: { value: new THREE.Color(sunColor) },
      uBase: { value: new THREE.Color(0x2a2b30) },
    },
    vertexShader: `
      uniform float uTime; uniform float uScale;
      attribute vec4 aSeed;
      varying float vAge; varying float vFlicker;
      void main(){
        float life = mod(uTime * 0.115 * aSeed.w + aSeed.x, 1.0);
        vAge = life;
        vec3 p = position;
        float h = life * 13.5;
        p.y += h;
        float sway = sin(life*4.2 + aSeed.y) * (0.35 + life*2.4);
        p.x += sway * 0.75 + sin(uTime*0.4 + aSeed.y)*life*1.4;
        p.z += cos(life*3.4 + aSeed.y) * (0.3 + life*1.9) + cos(uTime*0.33 + aSeed.y)*life*1.1;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.30 + life*2.3) * aSeed.z;
        gl_PointSize = clamp(sz * uScale / max(0.5, -mv.z), 2.0, 92.0);
        vFlicker = aSeed.z;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uSun; uniform vec3 uBase;
      varying float vAge; varying float vFlicker;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        float fade = smoothstep(0.0, 0.10, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));
        float a = t.a * fade * 0.42;
        if (a < 0.004) discard;
        vec3 col = mix(uBase*0.55, mix(uBase, uSun*0.55, 0.55), smoothstep(0.0,0.75,vAge));
        col *= (0.75 + 0.5*vFlicker);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  return pts;
}

/* -------------------------------------------------------------- spark system */
export class Sparks {
  constructor(cap, sprite) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.sz = new Float32Array(cap);
    this.head = 0;
    this.rand = rng(31337);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -9999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.aLife = new THREE.BufferAttribute(this.life, 1);
    this.aSize = new THREE.BufferAttribute(this.sz, 1);
    g.setAttribute('aLife', this.aLife);
    g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 90);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite }, uScale: { value: 720 } },
      vertexShader: `
        uniform float uScale; attribute float aLife; attribute float aSize;
        varying float vL;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(0.4,-mv.z), 1.0, 34.0);
          vL = aLife;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vL;
        void main(){
          if (vL <= 0.0) discard;
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * clamp(vL, 0.0, 1.0);
          vec3 hot = mix(vec3(1.0,0.32,0.05), vec3(1.0,0.95,0.72), clamp(vL*1.5,0.0,1.0));
          gl_FragColor = vec4(hot * a * 2.4, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
  }
  emit(x, y, z, strength, n) {
    const r = this.rand;
    const k = n === undefined ? Math.round(4 + strength * 14) : n;
    for (let i = 0; i < k; i++) {
      const j = this.head; this.head = (this.head + 1) % this.cap;
      this.pos[j * 3] = x; this.pos[j * 3 + 1] = y; this.pos[j * 3 + 2] = z;
      const sp = (1.6 + r() * 7.5) * (0.5 + strength);
      const th = r() * 6.2831, ph = Math.acos(1 - r() * 1.25);
      this.vel[j * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[j * 3 + 1] = Math.cos(ph) * sp * 0.9 + 1.4;
      this.vel[j * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const L = 0.35 + r() * 0.85;
      this.life[j] = 1; this.maxLife[j] = L;
      this.sz[j] = 0.035 + r() * 0.07;
    }
  }
  update(dt) {
    const p = this.pos, v = this.vel, l = this.life, ml = this.maxLife;
    for (let i = 0; i < this.cap; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt / ml[i];
      if (l[i] <= 0) { p[i * 3 + 1] = -9999; continue; }
      v[i * 3 + 1] -= 16 * dt;
      v[i * 3] *= 0.985; v[i * 3 + 2] *= 0.985;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.03) { p[i * 3 + 1] = 0.03; v[i * 3 + 1] *= -0.32; v[i * 3] *= 0.6; v[i * 3 + 2] *= 0.6; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.aLife.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
}

/* ------------------------------------------------------------- blast puffs */
export class Blast {
  constructor(cap, sprite) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.sz = new Float32Array(cap);
    this.head = 0;
    this.rand = rng(5150);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -9999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.aLife = new THREE.BufferAttribute(this.life, 1);
    this.aSize = new THREE.BufferAttribute(this.sz, 1);
    g.setAttribute('aLife', this.aLife);
    g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 90);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite }, uScale: { value: 720 } },
      vertexShader: `
        uniform float uScale; attribute float aLife; attribute float aSize;
        varying float vL;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          float grow = (1.0 - aLife) * 3.4 + 0.5;
          gl_PointSize = clamp(aSize * grow * uScale / max(0.5,-mv.z), 2.0, 96.0);
          vL = aLife;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vL;
        void main(){
          if (vL <= 0.0) discard;
          vec4 t = texture2D(uMap, gl_PointCoord);
          float fade = smoothstep(0.0,0.18,1.0-vL) * vL;
          float a = t.a * fade * 0.62;
          if (a < 0.004) discard;
          vec3 hot = mix(vec3(0.30,0.28,0.26), vec3(1.0,0.52,0.16), clamp((vL-0.6)*3.0,0.0,1.0));
          gl_FragColor = vec4(hot, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }
  burst(x, y, z, n, power) {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      const j = this.head; this.head = (this.head + 1) % this.cap;
      const th = r() * 6.2831, ph = Math.acos(1 - r() * 1.6);
      const rad = r() * 1.2;
      this.pos[j * 3] = x + Math.sin(ph) * Math.cos(th) * rad;
      this.pos[j * 3 + 1] = y + Math.cos(ph) * rad * 0.6 + 0.2;
      this.pos[j * 3 + 2] = z + Math.sin(ph) * Math.sin(th) * rad;
      const sp = (2.5 + r() * 9) * power;
      this.vel[j * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[j * 3 + 1] = Math.cos(ph) * sp * 0.55 + 2.2;
      this.vel[j * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      this.life[j] = 1; this.maxLife[j] = 1.4 + r() * 1.7;
      this.sz[j] = 0.24 + r() * 0.42;
    }
  }
  update(dt) {
    const p = this.pos, v = this.vel, l = this.life, ml = this.maxLife;
    for (let i = 0; i < this.cap; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt / ml[i];
      if (l[i] <= 0) { p[i * 3 + 1] = -9999; continue; }
      v[i * 3 + 1] += (1.4 - 4.0 * (1 - l[i])) * dt;
      v[i * 3] *= 0.955; v[i * 3 + 2] *= 0.955; v[i * 3 + 1] *= 0.975;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.06) { p[i * 3 + 1] = 0.06; v[i * 3 + 1] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.aLife.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
}

/* --------------------------------------------------------- shockwave rings */
export class Shockwave {
  constructor(scene) {
    this.items = [];
    this.scene = scene;
    this.geo = new THREE.RingGeometry(0.75, 1.0, 48);
    this.geo.rotateX(-Math.PI / 2);
  }
  fire(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb060, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, y, z);
    m.renderOrder = 9;
    this.scene.add(m);
    this.items.push({ m, t: 0 });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / 1.05;
      if (k >= 1) { this.scene.remove(it.m); it.m.material.dispose(); this.items.splice(i, 1); continue; }
      const s = 1 + k * 13;
      it.m.scale.set(s, 1, s);
      it.m.material.opacity = 0.85 * Math.pow(1 - k, 1.6);
    }
  }
}
