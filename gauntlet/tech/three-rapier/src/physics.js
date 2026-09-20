import * as THREE from 'three';
import { boxGeo, cylGeo, rng } from './scene.js';

const V = { x: 0, y: 0, z: 0 };
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _qt = new THREE.Quaternion();
const _scl = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color();

export class PhysWorld {
  constructor(RAPIER, sceneData, scene, onSpark) {
    this.R = RAPIER;
    this.scene = scene;
    this.onSpark = onSpark;
    this.rand = rng(0xC0FFEE);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ip = this.world.integrationParameters;
    ip.dt = 1 / 60;
    ip.numSolverIterations = 6;
    ip.numInternalPgsIterations = 1;
    this.fixedDt = 1 / 60;
    this.acc = 0;
    this.pools = {};
    this.bodies = [];          // {rb, pool, idx, prevSpeed}
    this.dynamicCount = 0;
    this.ragdollCount = 0;
    this.M = sceneData.M;
    this.sceneData = sceneData;
    this._buildStatics(sceneData.statics);
    this._buildPools();
  }

  /* ------------------------------------------------------------- statics */
  _buildStatics(list) {
    const R = this.R;
    // ground
    const gb = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.world.createCollider(R.ColliderDesc.cuboid(80, 0.5, 80).setFriction(0.85).setRestitution(0.02), gb);
    for (const s of list) {
      const d = R.RigidBodyDesc.fixed().setTranslation(s.p[0], s.p[1], s.p[2]);
      if (s.ry) {
        const h = s.ry * 0.5;
        d.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
      }
      const rb = this.world.createRigidBody(d);
      this.world.createCollider(R.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setFriction(0.78).setRestitution(0.04), rb);
    }
  }

  /* --------------------------------------------------------------- pools */
  _pool(name, geo, mat, cap, tintFn) {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    // park unused instances far away so a stale matrix never shows
    _mat.makeTranslation(0, -9999, 0);
    for (let i = 0; i < cap; i++) im.setMatrixAt(i, _mat);
    if (tintFn) {
      for (let i = 0; i < cap; i++) { tintFn(_col, i, this.rand); im.setColorAt(i, _col); }
      im.instanceColor.needsUpdate = true;
    }
    this.scene.add(im);
    this.pools[name] = { mesh: im, cap, n: 0 };
    return this.pools[name];
  }

  _buildPools() {
    const M = this.M;
    const r = this.rand;
    const woodTint = (c) => { const k = 0.72 + r() * 0.5; c.setRGB(k * (0.98 + r() * 0.08), k * (0.94 + r() * 0.08), k * 0.92); };
    const metalTint = (c) => { const k = 0.7 + r() * 0.55; c.setRGB(k, k * (0.96 + r() * 0.07), k * (0.92 + r() * 0.1)); };
    const darkTint = (c) => { const k = 0.8 + r() * 0.4; c.setRGB(k, k, k); };

    this._pool('crate', boxGeo(0.8, 0.8, 0.8), M.wood, 620, woodTint);
    this._pool('barrel', cylGeo(0.30, 0.30, 0.90, 16, 1), M.rust, 320, metalTint);
    this._pool('ball', new THREE.SphereGeometry(0.35, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.34, metalness: 0.95, envMapIntensity: 1.3 }), 190, darkTint);
    this._pool('tire', new THREE.TorusGeometry(0.34, 0.135, 10, 18), M.rubber, 240, darkTint);
    this._pool('plank', boxGeo(1.4, 0.09, 0.26), M.wood, 180, woodTint);
    this._pool('pipe', cylGeo(0.085, 0.085, 1.6, 12, 1), M.steel, 140, metalTint);
    this._pool('link', cylGeo(0.048, 0.048, 0.30, 8, 1), M.steel, 40, metalTint);
    // ragdoll pools
    this._pool('rbox', new THREE.BoxGeometry(1, 1, 1), M.plastic, 60,
      (c, i) => { c.setRGB(1.0, 0.72 + (i % 3) * 0.08, 0.22); });
    this._pool('rlimb', new THREE.CapsuleGeometry(0.06, 0.24, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.9 }), 200,
      (c, i) => { const k = 0.7 + (i % 5) * 0.09; c.setRGB(k, k * 1.02, k * 1.08); });
    this._pool('rhead', new THREE.SphereGeometry(0.115, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xb08a66, roughness: 0.72, metalness: 0.0, envMapIntensity: 1.0 }), 30);
  }

  /* -------------------------------------------------------------- bodies */
  _spawn(poolName, colliderFn, x, y, z, q, scale, ccd) {
    const R = this.R;
    const p = this.pools[poolName];
    if (p.n >= p.cap) return null;
    const d = R.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setLinearDamping(0.06).setAngularDamping(0.14);
    if (q) d.setRotation(q);
    if (ccd) d.setCcdEnabled(true);
    const rb = this.world.createRigidBody(d);
    this.world.createCollider(colliderFn(R), rb);
    const idx = p.n++;
    const rec = { rb, pool: p, idx, scale: scale || null, prev: 0 };
    this.bodies.push(rec);
    this.dynamicCount++;
    return rec;
  }

  addCrate(x, y, z, q) {
    // 0.8 m wooden crate, 18 kg -> density 35.2
    return this._spawn('crate', (R) => R.ColliderDesc.cuboid(0.4, 0.4, 0.4)
      .setDensity(35.2).setFriction(0.62).setRestitution(0.07), x, y, z, q);
  }
  addBarrel(x, y, z, q) {
    // cylinder r .3 h .9, 22 kg -> density 86.5
    return this._spawn('barrel', (R) => R.ColliderDesc.cylinder(0.45, 0.30)
      .setDensity(86.5).setFriction(0.38).setRestitution(0.16), x, y, z, q);
  }
  addBall(x, y, z) {
    // steel sphere r .35, 190 kg -> density 1058
    return this._spawn('ball', (R) => R.ColliderDesc.ball(0.35)
      .setDensity(1058).setFriction(0.42).setRestitution(0.26), x, y, z, null, null, true);
  }
  addTire(x, y, z, q) {
    // torus approximated by a cylinder, 9 kg -> V = pi*0.34^2*0.27 = 0.098 -> d = 92
    return this._spawn('tire', (R) => R.ColliderDesc.cylinder(0.135, 0.345)
      .setDensity(92).setFriction(0.95).setRestitution(0.52), x, y, z, q);
  }
  addPlank(x, y, z, q) {
    return this._spawn('plank', (R) => R.ColliderDesc.cuboid(0.7, 0.045, 0.13)
      .setDensity(520).setFriction(0.58).setRestitution(0.10), x, y, z, q);
  }
  addPipe(x, y, z, q) {
    return this._spawn('pipe', (R) => R.ColliderDesc.cylinder(0.8, 0.085)
      .setDensity(430).setFriction(0.34).setRestitution(0.20), x, y, z, q);
  }

  randQuat() {
    const r = this.rand;
    const u1 = r(), u2 = r() * Math.PI * 2, u3 = r() * Math.PI * 2;
    const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
    return { x: s1 * Math.sin(u2), y: s1 * Math.cos(u2), z: s2 * Math.sin(u3), w: s2 * Math.cos(u3) };
  }

  /* ---------------------------------------------------- initial 120 props */
  buildInitialProps() {
    const r = this.rand;
    // 3 pyramids of 5 levels of 0.8 m crates -> 15 each = 45
    const pyr = [[-6.4, 0.0], [5.6, -4.4], [3.2, 4.6]];
    for (const [px, pz] of pyr) {
      for (let lvl = 0; lvl < 5; lvl++) {
        const n = 5 - lvl;
        for (let i = 0; i < n; i++) {
          const x = px + (i - (n - 1) / 2) * 0.84;
          const y = 0.42 + lvl * 0.815;
          this.addCrate(x, y, pz + (r() - 0.5) * 0.02);
        }
      }
    }
    // 30 barrels
    const drumSpots = [];
    for (let i = 0; i < 18; i++) drumSpots.push([-9.6 + (i % 6) * 0.72, 0.46 + Math.floor(i / 6) * 0.93, -6.0 + Math.floor(i / 6) * 0.05]);
    for (let i = 0; i < 12; i++) drumSpots.push([2 + r() * 8, 0.46, 6.2 + r() * 5]);
    for (const [x, y, z] of drumSpots) this.addBarrel(x, y, z);
    // 15 steel spheres
    for (let i = 0; i < 15; i++) this.addBall(-2.5 + r() * 9, 0.36 + (i % 3) * 0.75, -1.5 + r() * 6);
    // 30 tyres
    for (let i = 0; i < 18; i++) {
      const bx = -9.0 + (i % 3) * 1.05, bz = 2.4 + Math.floor(i / 9) * 1.4;
      this.addTire(bx, 0.14 + Math.floor((i % 9) / 3) * 0.30, bz, { x: 0.7071, y: 0, z: 0, w: 0.7071 });
    }
    for (let i = 0; i < 12; i++) {
      this.addTire(6 + r() * 6, 0.15, 8.5 + r() * 5, { x: 0.7071, y: 0, z: 0, w: 0.7071 });
    }
    this.initialProps = this.dynamicCount;
  }

  /* --------------------------------------------------------------- chain */
  buildChain(ax, ay, az, links) {
    const R = this.R;
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(ax, ay, az));
    let prev = anchor, prevAnchor = { x: 0, y: 0, z: 0 };
    const L = 0.30;
    for (let i = 0; i < links; i++) {
      const y = ay - L * 0.5 - i * L * 0.92;
      const rec = this._spawn('link', (RR) => RR.ColliderDesc.cylinder(0.15, 0.048)
        .setDensity(1600).setFriction(0.5).setRestitution(0.05), ax, y, az);
      rec.rb.setAngularDamping(0.6);
      rec.rb.setLinearDamping(0.12);
      const jd = R.JointData.spherical(prevAnchor, { x: 0, y: L * 0.46, z: 0 });
      this.world.createImpulseJoint(jd, prev, rec.rb, true);
      prev = rec.rb;
      prevAnchor = { x: 0, y: -L * 0.46, z: 0 };
    }
    // weighted hook at the bottom
    const hook = this._spawn('ball', (RR) => RR.ColliderDesc.ball(0.35).setDensity(300)
      .setFriction(0.5).setRestitution(0.1), ax, ay - L * 0.5 - links * L * 0.92 - 0.3, az);
    const jd = R.JointData.spherical(prevAnchor, { x: 0, y: 0.32, z: 0 });
    this.world.createImpulseJoint(jd, prev, hook.rb, true);
    hook.rb.setLinvel({ x: 1.1, y: 0, z: 0.7 }, true);
    this.chainLinks = links;
  }

  /* ---------------------------------------------------------- hinged sign */
  buildSign(x, y, z, sceneRef) {
    const R = this.R;
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const g = boxGeo(3.0, 1.1, 0.09);
    const mesh = new THREE.Mesh(g, this.M.sign);
    mesh.castShadow = true; mesh.receiveShadow = true;
    sceneRef.add(mesh);
    const d = R.RigidBodyDesc.dynamic().setTranslation(x, y - 0.68, z)
      .setLinearDamping(0.25).setAngularDamping(0.25);
    const rb = this.world.createRigidBody(d);
    this.world.createCollider(R.ColliderDesc.cuboid(1.5, 0.55, 0.045)
      .setDensity(260).setFriction(0.5).setRestitution(0.1), rb);
    const jd = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.68, z: 0 }, { x: 1, y: 0, z: 0 });
    const j = this.world.createImpulseJoint(jd, anchor, rb, true);
    if (j.setLimits) j.setLimits(-0.85, 0.85);
    rb.setAngvel({ x: 1.4, y: 0, z: 0 }, true);
    this.signBody = { rb, mesh };
    this.dynamicCount++;
    // brackets
    return rb;
  }

  /* -------------------------------------------------------------- ragdoll */
  addRagdoll(x, y, z, vx, vy, vz) {
    const R = this.R, S = 0.86;
    const parts = [];
    const mkBox = (hx, hy, hz, ox, oy, oz, dens) => {
      const p = this.pools['rbox'];
      if (p.n >= p.cap) return null;
      const d = R.RigidBodyDesc.dynamic().setTranslation(x + ox * S, y + oy * S, z + oz * S)
        .setLinearDamping(0.12).setAngularDamping(0.35);
      const rb = this.world.createRigidBody(d);
      this.world.createCollider(R.ColliderDesc.cuboid(hx * S, hy * S, hz * S)
        .setDensity(dens).setFriction(0.72).setRestitution(0.03), rb);
      const idx = p.n++;
      const rec = { rb, pool: p, idx, scale: [hx * 2 * S, hy * 2 * S, hz * 2 * S], prev: 0 };
      this.bodies.push(rec); this.dynamicCount++;
      return rec;
    };
    const mkLimb = (half, rad, ox, oy, oz, dens) => {
      const p = this.pools['rlimb'];
      if (p.n >= p.cap) return null;
      const d = R.RigidBodyDesc.dynamic().setTranslation(x + ox * S, y + oy * S, z + oz * S)
        .setLinearDamping(0.12).setAngularDamping(0.35);
      const rb = this.world.createRigidBody(d);
      this.world.createCollider(R.ColliderDesc.capsule(half * S, rad * S)
        .setDensity(dens).setFriction(0.72).setRestitution(0.03), rb);
      const idx = p.n++;
      const rec = { rb, pool: p, idx, scale: [rad * S / 0.06, half * S / 0.12, rad * S / 0.06], prev: 0 };
      this.bodies.push(rec); this.dynamicCount++;
      return rec;
    };
    const mkHead = (rad, ox, oy, oz) => {
      const p = this.pools['rhead'];
      if (p.n >= p.cap) return null;
      const d = R.RigidBodyDesc.dynamic().setTranslation(x + ox * S, y + oy * S, z + oz * S)
        .setLinearDamping(0.12).setAngularDamping(0.4);
      const rb = this.world.createRigidBody(d);
      this.world.createCollider(R.ColliderDesc.ball(rad * S)
        .setDensity(1080).setFriction(0.6).setRestitution(0.05), rb);
      const idx = p.n++;
      const rec = { rb, pool: p, idx, scale: [rad * S / 0.115, rad * S / 0.115, rad * S / 0.115], prev: 0 };
      this.bodies.push(rec); this.dynamicCount++;
      return rec;
    };

    const pelvis = mkBox(0.16, 0.11, 0.10, 0, 0, 0, 980);
    if (!pelvis) return 0;
    const torso = mkBox(0.19, 0.26, 0.12, 0, 0.42, 0, 900);
    const head = mkHead(0.125, 0, 0.83, 0);
    const uaL = mkLimb(0.11, 0.058, -0.24, 0.45, 0, 950);
    const laL = mkLimb(0.115, 0.050, -0.24, 0.115, 0, 950);
    const uaR = mkLimb(0.11, 0.058, 0.24, 0.45, 0, 950);
    const laR = mkLimb(0.115, 0.050, 0.24, 0.115, 0, 950);
    const ulL = mkLimb(0.19, 0.075, -0.10, -0.385, 0, 1000);
    const llL = mkLimb(0.19, 0.065, -0.10, -0.905, 0, 1000);
    const ulR = mkLimb(0.19, 0.075, 0.10, -0.385, 0, 1000);
    const llR = mkLimb(0.19, 0.065, 0.10, -0.905, 0, 1000);
    if (!llR) return 0;
    const P = [pelvis, torso, head, uaL, laL, uaR, laR, ulL, llL, ulR, llR];

    const v = (a, b, c) => ({ x: a * S, y: b * S, z: c * S });
    const AX = { x: 1, y: 0, z: 0 };
    const joints = [];
    const rev = (b1, b2, a1, a2, lo, hi) => {
      const j = this.world.createImpulseJoint(R.JointData.revolute(a1, a2, AX), b1.rb, b2.rb, true);
      if (j.setLimits) j.setLimits(lo, hi);
      j.setContactsEnabled(false);
      joints.push(j); return j;
    };
    const sph = (b1, b2, a1, a2) => {
      const j = this.world.createImpulseJoint(R.JointData.spherical(a1, a2), b1.rb, b2.rb, true);
      j.setContactsEnabled(false);
      joints.push(j); return j;
    };
    // 10 joints
    rev(pelvis, torso, v(0, 0.13, 0), v(0, -0.29, 0), -0.45, 0.65);          // spine
    rev(torso, head, v(0, 0.29, 0), v(0, -0.12, 0), -0.55, 0.55);            // neck
    sph(torso, uaL, v(-0.24, 0.20, 0), v(0, 0.17, 0));                        // shoulder L
    sph(torso, uaR, v(0.24, 0.20, 0), v(0, 0.17, 0));                         // shoulder R
    rev(uaL, laL, v(0, -0.17, 0), v(0, 0.165, 0), -2.15, 0.0);                // elbow L
    rev(uaR, laR, v(0, -0.17, 0), v(0, 0.165, 0), -2.15, 0.0);                // elbow R
    sph(pelvis, ulL, v(-0.10, -0.12, 0), v(0, 0.265, 0));                     // hip L
    sph(pelvis, ulR, v(0.10, -0.12, 0), v(0, 0.265, 0));                      // hip R
    rev(ulL, llL, v(0, -0.265, 0), v(0, 0.255, 0), 0.0, 2.1);                 // knee L
    rev(ulR, llR, v(0, -0.265, 0), v(0, 0.255, 0), 0.0, 2.1);                 // knee R

    if (vx !== undefined) {
      for (const p of P) if (p) p.rb.setLinvel({ x: vx, y: vy, z: vz }, true);
      const r = this.rand;
      torso.rb.setAngvel({ x: (r() - 0.5) * 5, y: (r() - 0.5) * 5, z: (r() - 0.5) * 5 }, true);
    }
    this.ragdollCount++;
    return { parts: P.length, joints: joints.length };
  }

  /* ------------------------------------------------------------ explosion */
  explode(cx, cy, cz, radius, forceN) {
    const imp = forceN * this.fixedDt;           // 45 kN applied over one fixed step
    const maxV = 34;
    let hit = 0;
    for (const rec of this.bodies) {
      const rb = rec.rb;
      if (!rb.isDynamic()) continue;
      const t = rb.translation();
      const dx = t.x - cx, dy = t.y - cy, dz = t.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2) + 0.35;
      const fall = Math.pow(1 - Math.min(1, d / radius), 1.5);
      const k = imp * fall / d;
      rb.wakeUp();
      rb.applyImpulse({ x: dx * k, y: (dy + 0.55) * k, z: dz * k }, true);
      const r = this.rand;
      const ti = imp * fall * 0.012;
      rb.applyTorqueImpulse({ x: (r() - 0.5) * ti, y: (r() - 0.5) * ti, z: (r() - 0.5) * ti }, true);
      const lv = rb.linvel();
      const s = Math.hypot(lv.x, lv.y, lv.z);
      if (s > maxV) rb.setLinvel({ x: lv.x / s * maxV, y: lv.y / s * maxV, z: lv.z / s * maxV }, true);
      hit++;
    }
    return hit;
  }

  /* ----------------------------------------------------------------- step */
  step(dtSec) {
    this.acc += Math.min(dtSec, 0.25);
    const maxSub = this.dynamicCount > 430 ? 2 : 3;
    let steps = 0;
    while (this.acc >= this.fixedDt && steps < maxSub) {
      this.world.step();
      this.acc -= this.fixedDt;
      steps++;
    }
    if (steps === maxSub) this.acc = Math.min(this.acc, this.fixedDt);
    return steps;
  }

  /* ------------------------------------------------------- visual syncing */
  sync() {
    let active = 0;
    const sparkBudget = 6;
    let sparks = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const rec = this.bodies[i];
      const rb = rec.rb;
      const sleeping = rb.isSleeping();
      if (!sleeping) active++;
      const t = rb.translation();
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) {
        rb.setTranslation({ x: 0, y: 30, z: 0 }, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      if (t.y < -25) { rb.setTranslation({ x: (this.rand() - 0.5) * 16, y: 14, z: (this.rand() - 0.5) * 10 }, true); }
      const q = rb.rotation();
      _pos.set(t.x, t.y, t.z);
      _qt.set(q.x, q.y, q.z, q.w);
      if (rec.scale) _scl.set(rec.scale[0], rec.scale[1], rec.scale[2]); else _scl.set(1, 1, 1);
      _mat.compose(_pos, _qt, _scl);
      rec.pool.mesh.setMatrixAt(rec.idx, _mat);
      if (!sleeping && this.onSpark && sparks < sparkBudget) {
        const lv = rb.linvel();
        const s = Math.hypot(lv.x, lv.y, lv.z);
        if (rec.prev - s > 5.5 && rec.prev > 7) {
          this.onSpark(t.x, t.y, t.z, Math.min(1, (rec.prev - s) / 18));
          sparks++;
        }
        rec.prev = s;
      }
    }
    for (const k in this.pools) {
      const p = this.pools[k];
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.mesh.computeBoundingSphere();
    }
    if (this.signBody) {
      const t = this.signBody.rb.translation(), q = this.signBody.rb.rotation();
      this.signBody.mesh.position.set(t.x, t.y, t.z);
      this.signBody.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    this.activeBodies = active;
  }

  /* ------------------------------------------------------------ spawners */
  rainProps(n, cx, cz, spreadX, spreadZ, yBase, ySpread, vy) {
    const r = this.rand;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * spreadX;
      const z = cz + (r() - 0.5) * spreadZ;
      const y = yBase + r() * ySpread;
      const q = this.randQuat();
      const t = r();
      let rec = null;
      if (t < 0.42) rec = this.addCrate(x, y, z, q);
      else if (t < 0.62) rec = this.addBarrel(x, y, z, q);
      else if (t < 0.72) rec = this.addBall(x, y, z);
      else if (t < 0.86) rec = this.addTire(x, y, z, q);
      else if (t < 0.95) rec = this.addPlank(x, y, z, q);
      else rec = this.addPipe(x, y, z, q);
      if (rec) {
        made++;
        if (vy) rec.rb.setLinvel({ x: (r() - 0.5) * 1.4, y: vy, z: (r() - 0.5) * 1.4 }, true);
      }
    }
    return made;
  }

  dropRagdolls(n, height) {
    const r = this.rand;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const x = -8.5 + (i % 4) * 5.0 + (r() - 0.5) * 1.6;
      const z = -4.5 + Math.floor(i / 4) * 5.5 + (r() - 0.5) * 1.6;
      const res = this.addRagdoll(x, height + r() * 1.6, z, (r() - 0.5) * 3.4, -1.5, (r() - 0.5) * 3.4);
      if (res) made++;
    }
    return made;
  }
}
