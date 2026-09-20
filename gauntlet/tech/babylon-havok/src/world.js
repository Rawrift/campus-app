// ---------------------------------------------------------------------------
// Geometria estatica del mundo: nave industrial, exterior, valla, farolas,
// escombros. Todo se fusiona por material para minimizar draw calls y se
// devuelve la lista de colliders para la fisica.
// ---------------------------------------------------------------------------
import {
  MeshBuilder, Mesh, Vector3, Matrix, Quaternion, Color3, VertexBuffer,
  StandardMaterial, Texture,
} from '@babylonjs/core';
import { makeBox, merge, bakeUV, boxUV, trs } from './meshutil.js';
import { makeAlphaTexture } from './tex.js';
import { mulberry32, lerp } from './noise.js';

export const HX = 12, HZ = 8, WH = 8, TH = 0.35;   // semiancho X, semiprofundo Z, altura muro, espesor

export function buildWorld(scene, M, colliders) {
  const rnd = mulberry32(20260920);
  const R = (a, b) => a + (b - a) * rnd();
  const out = { casters: [], receivers: [], lampHeads: [] };
  const col = (x, y, z, w, h, d, ry = 0) => colliders.push({ x, y, z, w, h, d, ry });

  // ======================= SUELO EXTERIOR ==============================
  const ground = MeshBuilder.CreateGround('ground', { width: 160, height: 160, subdivisions: 12 }, scene);
  boxUV(ground, 4);
  ground.material = M.groundExt;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  col(0, -1, 0, 170, 2, 170);
  out.receivers.push(ground);

  // charco reflectante ~14x10 centrado en (16,0,14)
  const damp = MeshBuilder.CreateGround('damp', { width: 17.5, height: 13.5, subdivisions: 1 }, scene);
  damp.position.set(16, 0.03, 14);
  boxUV(damp, 4);
  const dampMat = M.groundExt.clone('m_damp');
  dampMat.albedoColor = new Color3(0.42, 0.44, 0.48);
  dampMat.roughness = 0.55;
  damp.material = dampMat;
  damp.receiveShadows = true;
  damp.freezeWorldMatrix();

  const puddle = MeshBuilder.CreateGround('puddle', { width: 14, height: 10, subdivisions: 1 }, scene);
  puddle.position.set(16, 0.062, 14);
  boxUV(puddle, 3);
  M.wet.environmentIntensity = 1.35;
  puddle.material = M.wet;
  puddle.freezeWorldMatrix();

  // ======================= NAVE: MUROS =================================
  const wallsG = [];
  const eX = HX + TH / 2, eZ = HZ + TH / 2;
  // laterales +-X: banda inferior, superior y machones entre ventanas
  const winZ = [-6, -2, 2, 6], winW = 2.4, winY0 = 4.2, winY1 = 6.0;
  for (const sx of [-1, 1]) {
    const x = sx * eX;
    wallsG.push(makeBox(scene, 'wl', TH, winY0, HZ * 2 + TH, x, winY0 / 2, 0));
    col(x, winY0 / 2, 0, TH, winY0, HZ * 2 + TH);
    wallsG.push(makeBox(scene, 'wu', TH, WH - winY1, HZ * 2 + TH, x, (WH + winY1) / 2, 0));
    col(x, (WH + winY1) / 2, 0, TH, WH - winY1, HZ * 2 + TH);
    // machones
    const edges = [-eZ];
    for (const z of winZ) { edges.push(z - winW / 2, z + winW / 2); }
    edges.push(eZ);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      const w = b - a; if (w <= 0.001) continue;
      wallsG.push(makeBox(scene, 'wp', TH, winY1 - winY0, w, x, (winY0 + winY1) / 2, (a + b) / 2));
      col(x, (winY0 + winY1) / 2, (a + b) / 2, TH, winY1 - winY0, w);
    }
  }
  // muro trasero -Z (con puerta peatonal)
  wallsG.push(makeBox(scene, 'wb1', HX * 2 + TH * 2 - 3.2, WH, TH, -1.6, WH / 2, -eZ));
  col(-1.6, WH / 2, -eZ, HX * 2 + TH * 2 - 3.2, WH, TH);
  wallsG.push(makeBox(scene, 'wb2', 1.2, WH, TH, 10.95, WH / 2, -eZ));
  col(10.95, WH / 2, -eZ, 1.2, WH, TH);
  wallsG.push(makeBox(scene, 'wb3', 2.0, WH - 2.4, TH, 9.35, (WH + 2.4) / 2, -eZ));
  col(9.35, (WH + 2.4) / 2, -eZ, 2.0, WH - 2.4, TH);
  // fachada +Z: dos machones y dintel (porton 10 x 6)
  wallsG.push(makeBox(scene, 'wf1', eX - 5, WH, TH, -(5 + eX) / 2, WH / 2, eZ));
  col(-(5 + eX) / 2, WH / 2, eZ, eX - 5, WH, TH);
  // machon estrecho + segundo hueco de carga (4,7 x 4,6) + machon de esquina
  wallsG.push(makeBox(scene, 'wf2a', 0.7, WH, TH, 5.35, WH / 2, eZ));
  col(5.35, WH / 2, eZ, 0.7, WH, TH);
  wallsG.push(makeBox(scene, 'wf2b', eX - 10.4, WH, TH, (10.4 + eX) / 2, WH / 2, eZ));
  col((10.4 + eX) / 2, WH / 2, eZ, eX - 10.4, WH, TH);
  wallsG.push(makeBox(scene, 'wf2c', 4.7, WH - 4.6, TH, 8.05, (WH + 4.6) / 2, eZ));
  col(8.05, (WH + 4.6) / 2, eZ, 4.7, WH - 4.6, TH);
  wallsG.push(makeBox(scene, 'wf3', 10, WH - 6, TH, 0, (WH + 6) / 2, eZ));
  col(0, (WH + 6) / 2, eZ, 10, WH - 6, TH);
  // pilares interiores
  for (const px of [-6, 6]) for (const pz of [-1, 4.5]) {
    wallsG.push(makeBox(scene, 'col', 0.52, WH, 0.52, px, WH / 2, pz));
    wallsG.push(makeBox(scene, 'capi', 0.78, 0.3, 0.78, px, WH - 0.5, pz));
    col(px, WH / 2, pz, 0.52, WH, 0.52);
  }
  // cubierta
  wallsG.push(makeBox(scene, 'roof', HX * 2 + TH * 2 + 0.9, 0.34, HZ * 2 + TH * 2 + 0.9, 0, WH + 0.17, 0));
  col(0, WH + 0.17, 0, HX * 2 + TH * 2 + 0.9, 0.34, HZ * 2 + TH * 2 + 0.9);
  // peto de cubierta
  for (const s of [-1, 1]) {
    wallsG.push(makeBox(scene, 'par', HX * 2 + TH * 2 + 0.9, 0.55, 0.22, 0, WH + 0.6, s * (eZ + 0.45)));
    wallsG.push(makeBox(scene, 'par', 0.22, 0.55, HZ * 2 + TH * 2 + 0.9, s * (eX + 0.45), WH + 0.6, 0));
  }
  // entreplanta 24 x 5 a 4 m en el lado -Z
  wallsG.push(makeBox(scene, 'mezz', HX * 2, 0.26, 5, 0, 3.87, -5.5));
  col(0, 3.87, -5.5, HX * 2, 0.26, 5);
  for (const px of [-10.5, -3.6, 3.6, 10.5]) {
    wallsG.push(makeBox(scene, 'mcol', 0.34, 3.74, 0.34, px, 1.87, -3.3));
    col(px, 1.87, -3.3, 0.34, 3.74, 0.34);
  }
  const wallMesh = merge('walls', wallsG, M.wall, scene, 2.6);
  wallMesh.receiveShadows = true;
  out.casters.push(wallMesh); out.receivers.push(wallMesh);

  // solera interior pulida
  const slab = MeshBuilder.CreateBox('slab', { width: HX * 2, height: 0.08, depth: HZ * 2 }, scene);
  slab.position.set(0, -0.02, 0);
  bakeUV(slab, 3);
  slab.material = M.floorInt;
  slab.receiveShadows = true;
  slab.freezeWorldMatrix();
  col(0, -0.02, 0, HX * 2, 0.08, HZ * 2);
  out.receivers.push(slab);
  // superficie de la entreplanta (madera)
  const mezzTop = MeshBuilder.CreateBox('mezzTop', { width: HX * 2 - 0.1, height: 0.06, depth: 4.94 }, scene);
  mezzTop.position.set(0, 4.02, -5.5);
  bakeUV(mezzTop, 1.2);
  mezzTop.material = M.wood;
  mezzTop.receiveShadows = true;
  mezzTop.freezeWorldMatrix();
  out.casters.push(mezzTop); out.receivers.push(mezzTop);

  // ======================= CELOSIA DE CUBIERTA =========================
  const trussG = [];
  const nT = 13, z0 = -7.5, dz = 15 / (nT - 1);
  for (let i = 0; i < nT; i++) {
    const z = z0 + i * dz;
    trussG.push(makeBox(scene, 'tc', HX * 2 + 0.6, 0.15, 0.15, 0, 7.86, z));
    trussG.push(makeBox(scene, 'tc', HX * 2 + 0.6, 0.15, 0.15, 0, 7.02, z));
    for (let k = 0; k < 12; k++) {
      const x = -12 + k * 2 + 1;
      const d = MeshBuilder.CreateBox('td', { width: 2.3, height: 0.09, depth: 0.09 }, scene);
      d.position.set(x, 7.44, z);
      d.rotation.z = (k % 2 === 0 ? 1 : -1) * 0.35;
      trussG.push(d);
    }
    for (let k = 0; k <= 6; k++) {
      trussG.push(makeBox(scene, 'tv', 0.1, 0.84, 0.1, -12 + k * 4, 7.44, z));
    }
  }
  // correas longitudinales
  for (let k = 0; k <= 8; k++) {
    trussG.push(makeBox(scene, 'tp', 0.12, 0.12, HZ * 2 + 0.6, -12 + k * 3, 7.92, 0));
  }
  // dintel del porton reforzado
  trussG.push(makeBox(scene, 'lint', 11.2, 0.42, 0.42, 0, 6.2, eZ - 0.35));
  const truss = merge('truss', trussG, M.metal, scene, 1.0);
  truss.receiveShadows = true;
  out.casters.push(truss); out.receivers.push(truss);

  // ======================= VENTANAS ====================================
  const glassG = [], frameG = [];
  for (const sx of [-1, 1]) {
    for (const z of winZ) {
      const g = MeshBuilder.CreatePlane('gp', { width: winW - 0.12, height: winY1 - winY0 - 0.12 }, scene);
      g.position.set(sx * eX, (winY0 + winY1) / 2, z);
      g.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      glassG.push(g);
      const fw = 0.07;
      frameG.push(makeBox(scene, 'f', TH + 0.06, fw, winW, sx * eX, winY0 + fw / 2, z));
      frameG.push(makeBox(scene, 'f', TH + 0.06, fw, winW, sx * eX, winY1 - fw / 2, z));
      frameG.push(makeBox(scene, 'f', TH + 0.06, winY1 - winY0, fw, sx * eX, (winY0 + winY1) / 2, z - winW / 2 + fw / 2));
      frameG.push(makeBox(scene, 'f', TH + 0.06, winY1 - winY0, fw, sx * eX, (winY0 + winY1) / 2, z + winW / 2 - fw / 2));
      frameG.push(makeBox(scene, 'f', TH + 0.02, 0.05, winW, sx * eX, (winY0 + winY1) / 2, z));
      frameG.push(makeBox(scene, 'f', TH + 0.02, winY1 - winY0, 0.05, sx * eX, (winY0 + winY1) / 2, z));
    }
  }
  const glass = Mesh.MergeMeshes(glassG.map(g => { g.bakeCurrentTransformIntoVertices(); return g; }), true, true);
  glass.name = 'glass'; glass.material = M.glass; glass.isPickable = false; glass.freezeWorldMatrix();
  const frames = merge('winFrames', frameG, M.metalRail, scene, 0.8);
  out.casters.push(frames);

  // ======================= BARANDILLA + ESCALERA =======================
  const railG = [];
  for (let x = -11.6; x <= 11.7; x += 1.55) railG.push(makeBox(scene, 'rp', 0.07, 1.12, 0.07, x, 4.61, -3.06));
  railG.push(makeBox(scene, 'rr', HX * 2, 0.07, 0.07, 0, 5.15, -3.06));
  railG.push(makeBox(scene, 'rr', HX * 2, 0.06, 0.06, 0, 4.62, -3.06));
  railG.push(makeBox(scene, 'rt', HX * 2, 0.22, 0.05, 0, 4.16, -3.06));
  // escalera a la entreplanta (lado -X)
  const st = 13, sh = 3.95 / st;
  for (let i = 0; i < st; i++) {
    railG.push(makeBox(scene, 'sp', 1.35, 0.07, 0.30, -9.6, sh * (i + 1), -0.9 - i * 0.30));
    railG.push(makeBox(scene, 'sr', 1.35, sh - 0.09, 0.06, -9.6, sh * (i + 0.5), -0.75 - i * 0.30));
  }
  for (const sx of [-1, 1]) {
    const s = MeshBuilder.CreateBox('sg', { width: 0.09, height: 0.34, depth: 5.3 }, scene);
    s.position.set(-9.6 + sx * 0.67, 1.95, -2.72); s.rotation.x = -0.72;
    railG.push(s);
    for (let i = 0; i < 6; i++) {
      railG.push(makeBox(scene, 'shp', 0.06, 1.0, 0.06, -9.6 + sx * 0.67, 0.5 + i * 0.63, -0.95 - i * 0.62));
    }
    const hr = MeshBuilder.CreateBox('shr', { width: 0.07, height: 0.07, depth: 5.2 }, scene);
    hr.position.set(-9.6 + sx * 0.67, 2.9, -2.72); hr.rotation.x = -0.72;
    railG.push(hr);
  }
  col(-9.6, 1.9, -2.8, 1.5, 0.2, 5.4, 0);
  const rail = merge('rail', railG, M.metalRail, scene, 0.7);
  rail.receiveShadows = true;
  out.casters.push(rail);

  // ======================= CONSTRUCCIONES SECUNDARIAS ==================
  function container(name, mat, x, y, z, ry, sx, sy, sz) {
    const g = [];
    g.push(makeBox(scene, 'cb', sx, sy, sz, 0, 0, 0));
    for (const ax of [-1, 1]) for (const az of [-1, 1]) {
      g.push(makeBox(scene, 'cc', 0.18, sy + 0.08, 0.18, ax * (sx / 2 - 0.09), 0, az * (sz / 2 - 0.09)));
    }
    g.push(makeBox(scene, 'ct', sx + 0.04, 0.14, sz + 0.04, 0, sy / 2, 0));
    g.push(makeBox(scene, 'ct', sx + 0.04, 0.14, sz + 0.04, 0, -sy / 2, 0));
    for (const d of [-0.28, 0.28]) g.push(makeBox(scene, 'cd', 0.1, sy - 0.3, 0.06, d * sx / 2 * 0.5, 0, sz / 2 + 0.04));
    const m = merge(name, g, mat, scene, 1.3);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.receiveShadows = true;
    m.freezeWorldMatrix();
    col(x, y, z, sx, sy, sz, ry);
    out.casters.push(m); out.receivers.push(m);
    return m;
  }
  container('cont1', M.containerA, -21, 1.32, 9.5, 0.22, 6.1, 2.6, 2.44);
  container('cont2', M.containerB, -18.5, 1.32, -17, -0.38, 6.1, 2.6, 2.44);
  container('cont3', M.containerC, -18.9, 3.95, -16.7, -0.34, 6.1, 2.6, 2.44);

  // caseta de obra con cubierta a un agua
  {
    const g = [];
    g.push(makeBox(scene, 'hb', 5.2, 3.1, 3.4, 0, 0, 0));
    const rf = MeshBuilder.CreateBox('hr', { width: 5.8, height: 0.16, depth: 3.9 }, scene);
    rf.position.set(0, 1.68, 0); rf.rotation.x = 0.1; g.push(rf);
    g.push(makeBox(scene, 'hd', 0.95, 2.05, 0.1, -1.4, -0.5, 1.72));
    g.push(makeBox(scene, 'hw', 1.2, 0.9, 0.1, 1.3, 0.35, 1.72));
    const h = merge('caseta', g, M.containerC, scene, 1.1);
    h.position.set(22, 1.55, -11.5); h.rotation.y = -0.5;
    h.receiveShadows = true; h.freezeWorldMatrix();
    col(22, 1.55, -11.5, 5.2, 3.1, 3.4, -0.5);
    out.casters.push(h); out.receivers.push(h);
  }

  // ======================= VALLA PERIMETRAL ============================
  const postG = [], panelG = [];
  const FX = 38, FZ = 34, step = 3.2;
  const pts = [];
  for (let x = -FX; x <= FX - 0.01; x += step) pts.push([x, -FZ, x + step, -FZ]);
  for (let z = -FZ; z <= FZ - 0.01; z += step) pts.push([FX, z, FX, z + step]);
  for (let x = FX; x >= -FX + 0.01; x -= step) pts.push([x, FZ, x - step, FZ]);
  for (let z = FZ; z >= -FZ + 0.01; z -= step) pts.push([-FX, z, -FX, z - step]);
  let seg = 0;
  for (const [ax, az, bx, bz] of pts) {
    seg++;
    // hueco de acceso en el lado +Z
    if (Math.abs(az - FZ) < 0.01 && ax <= 4.9 && ax >= -4.9) continue;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bx - ax, bz - az);
    const p = MeshBuilder.CreatePlane('fp', { width: len, height: 2.3 }, scene);
    p.position.set(cx, 1.2, cz); p.rotation.y = ang + Math.PI / 2;
    panelG.push(p);
    const po = MeshBuilder.CreateCylinder('fpo', { height: 2.75, diameter: 0.1, tessellation: 6 }, scene);
    po.position.set(ax, 1.37, az); postG.push(po);
    const top = MeshBuilder.CreateBox('ftr', { width: len, height: 0.06, depth: 0.06 }, scene);
    top.position.set(cx, 2.36, cz); top.rotation.y = ang + Math.PI / 2; postG.push(top);
    for (let w = 0; w < 3; w++) {
      const bw = MeshBuilder.CreateBox('fbw', { width: len, height: 0.035, depth: 0.035 }, scene);
      bw.position.set(cx, 2.5 + w * 0.13, cz); bw.rotation.y = ang + Math.PI / 2; postG.push(bw);
    }
  }
  out.fenceSegments = seg;
  const fencePanels = Mesh.MergeMeshes(panelG.map(p => { p.bakeCurrentTransformIntoVertices(); return p; }), true, true);
  fencePanels.name = 'fencePanels'; fencePanels.material = M.fence;
  fencePanels.isPickable = false; fencePanels.receiveShadows = false; fencePanels.freezeWorldMatrix();
  const fencePosts = merge('fencePosts', postG, M.metal, scene, 0.6);
  out.casters.push(fencePosts);

  // ======================= FAROLAS =====================================
  const lampG = [], headG = [];
  const lampPos = [[26, -24], [26, -8], [26, 8], [26, 24], [-26, -24], [-26, -8], [-26, 8], [-26, 24],
                   [11, 30], [-11, 30], [11, -30], [-11, -30]];
  for (const [lx, lz] of lampPos) {
    const dir = lx > 0 ? -1 : 1;
    lampG.push(makeBox(scene, 'lb', 0.5, 0.25, 0.5, lx, 0.12, lz));
    const post = MeshBuilder.CreateCylinder('lp', { height: 7.2, diameterTop: 0.11, diameterBottom: 0.17, tessellation: 10 }, scene);
    post.position.set(lx, 3.7, lz); lampG.push(post);
    const arm = MeshBuilder.CreateCylinder('la', { height: 1.5, diameter: 0.09, tessellation: 8 }, scene);
    arm.position.set(lx + dir * 0.66, 7.32, lz); arm.rotation.z = dir * (Math.PI / 2 - 0.25); lampG.push(arm);
    const hood = MeshBuilder.CreateBox('lh', { width: 0.78, height: 0.16, depth: 0.42 }, scene);
    hood.position.set(lx + dir * 1.32, 7.48, lz); lampG.push(hood);
    const head = MeshBuilder.CreateBox('lg', { width: 0.66, height: 0.1, depth: 0.34 }, scene);
    head.position.set(lx + dir * 1.32, 7.36, lz); headG.push(head);
  }
  const lamps = merge('lamps', lampG, M.metal, scene, 0.9);
  out.casters.push(lamps);
  const heads = Mesh.MergeMeshes(headG.map(h => { h.bakeCurrentTransformIntoVertices(); return h; }), true, true);
  heads.name = 'lampHeads'; heads.material = M.lampOff; heads.isPickable = false; heads.freezeWorldMatrix();

  // ======================= LAMPARAS INTERIORES =========================
  const fixG = [], fixGlassG = [];
  out.interiorLampPos = [[-7, 6.6, -5.0], [7, 6.6, -5.0], [-7, 6.6, 3.2], [7, 6.6, 3.2]];
  for (const [lx, ly, lz] of out.interiorLampPos) {
    const cab = MeshBuilder.CreateCylinder('lc', { height: 0.9, diameter: 0.045, tessellation: 6 }, scene);
    cab.position.set(lx, ly + 0.75, lz); fixG.push(cab);
    const shade = MeshBuilder.CreateCylinder('ls', { height: 0.42, diameterTop: 0.22, diameterBottom: 1.05, tessellation: 16 }, scene);
    shade.position.set(lx, ly + 0.2, lz); fixG.push(shade);
    const bulb = MeshBuilder.CreateSphere('lb', { diameter: 0.34, segments: 8 }, scene);
    bulb.position.set(lx, ly + 0.02, lz); fixGlassG.push(bulb);
    const disc = MeshBuilder.CreateDisc('ld', { radius: 0.5, tessellation: 16 }, scene);
    disc.position.set(lx, ly + 0.015, lz); disc.rotation.x = -Math.PI / 2; fixGlassG.push(disc);
  }
  const fixtures = merge('fixtures', fixG, M.metalRail, scene, 0.5);
  out.casters.push(fixtures);
  const bulbs = Mesh.MergeMeshes(fixGlassG.map(b => { b.bakeCurrentTransformIntoVertices(); return b; }), true, true);
  bulbs.name = 'bulbs'; bulbs.material = M.lampOn; bulbs.isPickable = false; bulbs.freezeWorldMatrix();

  // ======================= PALES / ESCOMBROS (thin instances) ==========
  function palletMesh() {
    const g = [];
    for (let i = 0; i < 5; i++) g.push(makeBox(scene, 'pk', 1.2, 0.035, 0.14, 0, 0.125, -0.4 + i * 0.2));
    for (let i = 0; i < 3; i++) g.push(makeBox(scene, 'pk', 0.14, 0.09, 1.0, -0.5 + i * 0.5, 0.05, 0));
    for (let i = 0; i < 3; i++) g.push(makeBox(scene, 'pk', 1.2, 0.03, 0.12, 0, 0.005, -0.4 + i * 0.4));
    return merge('pallet', g, M.wood, scene, 0.5);
  }
  const pallet = palletMesh();
  const rockSrc = MeshBuilder.CreateIcoSphere('rockSrc', { radius: 0.25, subdivisions: 1, flat: true }, scene);
  {
    const p = rockSrc.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < p.length; i += 3) {
      const k = 0.72 + 0.5 * rnd();
      p[i] *= k; p[i + 1] *= k * 0.75; p[i + 2] *= k;
    }
    rockSrc.setVerticesData(VertexBuffer.PositionKind, p, false);
    rockSrc.createNormals(true);
    boxUV(rockSrc, 0.4);
    rockSrc.material = M.gravel;
  }
  const plankSrc = MeshBuilder.CreateBox('plankSrc', { width: 1.9, height: 0.055, depth: 0.19 }, scene);
  boxUV(plankSrc, 0.5); plankSrc.material = M.wood;
  const brickSrc = MeshBuilder.CreateBox('brickSrc', { width: 0.24, height: 0.105, depth: 0.115 }, scene);
  boxUV(brickSrc, 0.35); brickSrc.material = M.gravel;

  function scatter(src, n, area, yBase, scaleMin, scaleMax, flat) {
    const buf = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do {
        x = R(area[0], area[1]); z = R(area[2], area[3]); tries++;
      } while (tries < 8 && Math.abs(x) < 13 && Math.abs(z) < 9 && rnd() < 0.55);
      const s = R(scaleMin, scaleMax);
      trs(x, yBase * s + (flat ? 0 : 0), z,
        flat ? R(-0.06, 0.06) : R(-3, 3), R(-3.14, 3.14), flat ? R(-0.06, 0.06) : R(-3, 3),
        s, s, s, buf, i * 16);
    }
    src.thinInstanceSetBuffer('matrix', buf, 16, true);
    src.isPickable = false;
    src.alwaysSelectAsActiveMesh = true;
    return src;
  }
  scatter(rockSrc, 52, [-34, 34, -30, 30], 0.14, 0.55, 1.7, false);
  scatter(plankSrc, 30, [-30, 30, -28, 28], 0.03, 0.8, 1.25, true);
  scatter(brickSrc, 44, [-28, 28, -26, 26], 0.05, 0.85, 1.35, true);
  {
    const n = 11, buf = new Float32Array(n * 16);
    const spots = [[-14.5, 11.2], [-16.2, 12.6], [15.5, -6.5], [-9.5, -12.5], [8.5, -14.5],
                   [19.5, 5.5], [-24, 2.5], [4.5, 20], [-5.5, 17.5], [25, 17], [-3.4, 8.9]];
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[i];
      trs(x, i === 10 ? 0.0 : R(0, 0.5), z, R(-0.05, 0.05), R(-3.14, 3.14), R(-0.05, 0.05), 1, 1, 1, buf, i * 16);
    }
    pallet.thinInstanceSetBuffer('matrix', buf, 16, true);
    pallet.isPickable = false; pallet.alwaysSelectAsActiveMesh = true;
  }
  out.casters.push(rockSrc, plankSrc, brickSrc, pallet);
  out.receivers.push(rockSrc, plankSrc, brickSrc, pallet);

  // monticulos de grava
  for (const [gx, gz, gs] of [[-27, 20, 3.4], [29, -20, 2.6], [-30, -6, 2.2]]) {
    const m = MeshBuilder.CreateSphere('mound', { diameter: 1, segments: 10, slice: 0.5 }, scene);
    m.scaling.set(gs, gs * 0.42, gs);
    m.position.set(gx, 0, gz);
    bakeUV(m, 0.9);
    m.material = M.gravel; m.receiveShadows = true; m.freezeWorldMatrix();
    out.casters.push(m); out.receivers.push(m);
    col(gx, -0.1, gz, gs * 0.9, 0.55, gs * 0.9);
  }

  return out;
}
