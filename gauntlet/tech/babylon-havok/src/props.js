// ---------------------------------------------------------------------------
// Cuerpos rigidos dinamicos. Cada "lote" es una malla con thin instances y un
// unico PhysicsBody instanciado de Havok -> 1 draw call y 1 shape por lote.
// ---------------------------------------------------------------------------
import {
  MeshBuilder, Mesh, Vector3, Quaternion, Matrix,
  PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere,
  PhysicsShapeCylinder, PhysicsShapeContainer,
} from '@babylonjs/core';
import { boxUV, trs } from './meshutil.js';
import { mulberry32 } from './noise.js';

export class PropWorld {
  constructor(scene, M, shadow) {
    this.scene = scene; this.M = M; this.shadow = shadow;
    this.batches = [];
    this.singles = [];
    this.rnd = mulberry32(7717);
    this._buildProtos();
  }

  _buildProtos() {
    const s = this.scene, M = this.M;
    const hide = (m, mat, uv) => { boxUV(m, uv); m.material = mat; m.setEnabled(false); m.isPickable = false; return m; };
    this.proto = {};
    this.proto.crate = hide(MeshBuilder.CreateBox('p_crate', { size: 0.8 }, s), M.wood, 0.42);
    this.proto.crateS = hide(MeshBuilder.CreateBox('p_crateS', { width: 0.62, height: 0.44, depth: 0.62 }, s), M.plasticY, 0.32);
    this.proto.barrel = hide(MeshBuilder.CreateCylinder('p_barrel', { height: 0.9, diameter: 0.6, tessellation: 16 }, s), M.rust, 0.55);
    this.proto.sphere = hide(MeshBuilder.CreateSphere('p_sphere', { diameter: 0.7, segments: 10 }, s), M.steel, 0.45);
    this.proto.tire = hide(MeshBuilder.CreateTorus('p_tire', { diameter: 0.62, thickness: 0.24, tessellation: 12 }, s), M.rubber, 0.33);
    this.proto.beam = hide(MeshBuilder.CreateBox('p_beam', { width: 1.7, height: 0.16, depth: 0.3 }, s), M.wood, 0.4);
    this.proto.drumB = hide(MeshBuilder.CreateCylinder('p_drumB', { height: 0.86, diameter: 0.56, tessellation: 14 }, s), M.plasticB, 0.5);

    this.spec = {
      crate: { mass: 18, fr: 0.62, re: 0.05, shape: () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.8, 0.8, 0.8), s) },
      crateS: { mass: 7, fr: 0.5, re: 0.22, shape: () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.62, 0.44, 0.62), s) },
      barrel: { mass: 22, fr: 0.45, re: 0.12, shape: () => new PhysicsShapeCylinder(new Vector3(0, -0.45, 0), new Vector3(0, 0.45, 0), 0.3, s) },
      sphere: { mass: 190, fr: 0.34, re: 0.30, shape: () => new PhysicsShapeSphere(Vector3.Zero(), 0.35, s) },
      tire: { mass: 9, fr: 0.88, re: 0.45, shape: () => new PhysicsShapeCylinder(new Vector3(0, -0.13, 0), new Vector3(0, 0.13, 0), 0.42, s) },
      beam: { mass: 14, fr: 0.58, re: 0.08, shape: () => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1.7, 0.16, 0.3), s) },
      drumB: { mass: 12, fr: 0.5, re: 0.18, shape: () => new PhysicsShapeCylinder(new Vector3(0, -0.43, 0), new Vector3(0, 0.43, 0), 0.28, s) },
    };
  }

  /** transforms: array de [x,y,z,rx,ry,rz] */
  addBatch(kind, transforms) {
    if (!transforms.length) return null;
    const s = this.scene, sp = this.spec[kind];
    const mesh = this.proto[kind].clone('b_' + kind + '_' + this.batches.length);
    mesh.setEnabled(true); mesh.isVisible = true; mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const n = transforms.length;
    const buf = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const t = transforms[i];
      trs(t[0], t[1], t[2], t[3], t[4], t[5], 1, 1, 1, buf, i * 16);
    }
    mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
    mesh.receiveShadows = true;
    this.shadow.addShadowCaster(mesh);

    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, s);
    const shape = sp.shape();
    shape.material = { friction: sp.fr, restitution: sp.re };
    body.shape = shape;
    for (let i = 0; i < n; i++) {
      const mp = body.computeMassProperties(i);
      const k = sp.mass / (mp.mass || 1);
      body.setMassProperties({
        mass: sp.mass,
        inertia: mp.inertia ? mp.inertia.scale(k) : undefined,
        centerOfMass: mp.centerOfMass,
        inertiaOrientation: mp.inertiaOrientation,
      }, i);
      body.setLinearDamping(0.04, i);
      body.setAngularDamping(0.12, i);
    }
    const b = { kind, mesh, body, count: n };
    this.batches.push(b);
    return b;
  }

  get bodyCount() {
    let n = 0;
    for (const b of this.batches) n += b.count;
    return n + this.singles.length;
  }

  countActive(threshold = 0.09) {
    const v = new Vector3();
    let act = 0;
    for (const b of this.batches) {
      for (let i = 0; i < b.count; i++) {
        b.body.getLinearVelocityToRef(v, i);
        if (v.lengthSquared() > threshold * threshold) act++;
      }
    }
    for (const s of this.singles) {
      if (!s.body || s.body._isDisposed) continue;
      s.body.getLinearVelocityToRef(v);
      if (v.lengthSquared() > threshold * threshold) act++;
    }
    return act;
  }

  /** Impulso radial. Devuelve puntos de mayor energia para chispas. */
  explode(center, radius, forceN, dt = 1 / 60) {
    const p = new Vector3(), imp = new Vector3();
    const hot = [];
    for (const b of this.batches) {
      for (let i = 0; i < b.count; i++) {
        b.body.getObjectCenterWorldToRef(p, i);
        const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) continue;
        const fall = 1 - d / radius;
        const mag0 = forceN * fall * fall * dt;
        const m = this.spec[b.kind].mass;
        const mag = Math.min(mag0, m * 16);
        const inv = 1 / Math.max(d, 0.35);
        imp.set(dx * inv * mag, (dy * inv + 0.55) * mag, dz * inv * mag);
        b.body.applyImpulse(imp, p, i);
        if (fall > 0.55 && hot.length < 26 && ((i + hot.length) % 3 === 0)) hot.push(p.clone());
      }
    }
    for (const s of this.singles) {
      if (!s.body || s.body._isDisposed || s.static) continue;
      s.body.getObjectCenterWorldToRef(p);
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      const fall = 1 - d / radius;
      const mag = Math.min(forceN * fall * fall * dt, (s.mass || 10) * 16);
      const inv = 1 / Math.max(d, 0.35);
      imp.set(dx * inv * mag, (dy * inv + 0.55) * mag, dz * inv * mag);
      s.body.applyImpulse(imp, p);
    }
    return hot;
  }
}

// ---------------- estado inicial: 120 cuerpos ----------------
export function initialLayout(rnd) {
  const R = (a, b) => a + (b - a) * rnd();
  const L = { crate: [], barrel: [], sphere: [], tire: [], crateS: [], beam: [], drumB: [] };

  // 3 piramides de cajas de madera, 5 niveles (15 cajas cada una)
  const pyr = [[-7.0, 1.2, 0.0], [4.6, 5.4, 0.42], [7.4, -5.6, -0.3]];
  for (const [px, pz, ry] of pyr) {
    for (let lv = 0; lv < 5; lv++) {
      const n = 5 - lv;
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * 0.83;
        const x = px + ox * Math.cos(ry), z = pz + ox * Math.sin(ry);
        L.crate.push([x, 0.415 + lv * 0.812, z, 0, ry + R(-0.02, 0.02), 0]);
      }
    }
  }
  // bodegon de materiales delante del porton (camara 3)
  L.crate.push([-4.72, 0.56, 7.92, 0, 0.18, 0]);
  L.crate.push([-4.30, 1.37, 8.02, 0, -0.42, 0]);
  L.barrel.push([-5.62, 0.455, 8.42, 0, 0.6, 0]);
  L.barrel.push([-5.55, 1.37, 8.40, 0, 1.1, 0]);
  L.tire.push([-3.55, 0.13, 7.55, 0, 0.5, 0]);
  L.tire.push([-3.50, 0.39, 7.62, 0.04, 1.3, 0]);
  L.sphere.push([-3.95, 0.35, 8.62, 0, 0, 0]);
  L.beam.push([-5.9, 0.08, 7.0, 0, 0.32, 0]);
  L.beam.push([-6.0, 0.24, 7.1, 0, 0.26, 0]);

  // monton fisico delante/dentro del porton (camara 4)
  const pile = [[4.2, 5.6], [3.4, 6.3], [5.0, 6.4], [4.8, 4.8], [3.2, 4.9], [5.7, 5.6], [2.6, 5.9], [4.1, 7.1]];
  for (let i = 0; i < pile.length; i++) {
    const [x, z] = pile[i];
    if (i % 3 === 0) L.barrel.push([x, 0.46, z, 0, R(0, 3), 0]);
    else if (i % 3 === 1) L.tire.push([x, 0.14, z, 0, R(0, 3), 0]);
    else L.crateS.push([x, 0.23, z, 0, R(0, 3), 0]);
  }
  L.sphere.push([5.4, 0.36, 7.4, 0, 0, 0]);
  L.sphere.push([2.9, 0.36, 7.0, 0, 0, 0]);

  // dispersion interior
  const want = { barrel: 25, sphere: 20, tire: 30 };
  const zones = [[-10.5, 10.5, -7.0, 7.0], [-9, 9, 8.6, 15.0]];
  const push = (k) => {
    while (L[k].length < want[k]) {
      const zn = zones[L[k].length % 2 === 0 ? 0 : 1];
      const x = R(zn[0], zn[1]), z = R(zn[2], zn[3]);
      if (Math.abs(x + 7) < 2.6 && Math.abs(z - 1.2) < 2.6) continue;
      if (Math.abs(x - 4.6) < 2.6 && Math.abs(z - 5.4) < 2.6) continue;
      if (Math.abs(x + 4.6) < 1.6 && Math.abs(z - 8.0) < 1.6) continue;
      const y = k === 'barrel' ? 0.46 : k === 'sphere' ? 0.36 : 0.14;
      L[k].push([x, y, z, k === 'barrel' && rnd() < 0.22 ? 1.5708 : 0, R(0, 3.14), 0]);
    }
  };
  push('barrel'); push('sphere'); push('tire');
  return L;
}

export function totalOf(L) {
  let n = 0;
  for (const k in L) n += L[k].length;
  return n;
}
