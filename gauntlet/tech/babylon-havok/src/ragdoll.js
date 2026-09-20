// ---------------------------------------------------------------------------
// Ragdoll articulado: 11 cuerpos + 10 joints con limites (Physics6DoFConstraint).
// Los miembros son InstancedMesh de dos prototipos -> 2 draw calls para todos.
// ---------------------------------------------------------------------------
import {
  MeshBuilder, Vector3, Quaternion,
  PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere,
  Physics6DoFConstraint, PhysicsConstraintAxis,
} from '@babylonjs/core';
import { boxUV } from './meshutil.js';

const LOCK = (a) => ({ axis: a, minLimit: 0, maxLimit: 0 });
const LIM = (a, lo, hi) => ({ axis: a, minLimit: lo, maxLimit: hi });
const AX = PhysicsConstraintAxis;

// [nombre, w,h,d, x,y,z, masa]
const PARTS = [
  ['pelvis', 0.36, 0.26, 0.23, 0.00, 0.98, 0, 12],
  ['chest', 0.44, 0.54, 0.25, 0.00, 1.44, 0, 22],
  ['head', 0.27, 0.27, 0.27, 0.00, 1.86, 0, 4.5],
  ['uArmL', 0.13, 0.34, 0.13, -0.30, 1.52, 0, 2.2],
  ['lArmL', 0.11, 0.32, 0.11, -0.30, 1.17, 0, 1.6],
  ['uArmR', 0.13, 0.34, 0.13, 0.30, 1.52, 0, 2.2],
  ['lArmR', 0.11, 0.32, 0.11, 0.30, 1.17, 0, 1.6],
  ['uLegL', 0.17, 0.44, 0.17, -0.11, 0.63, 0, 7.0],
  ['lLegL', 0.145, 0.42, 0.145, -0.11, 0.19, 0, 3.5],
  ['uLegR', 0.17, 0.44, 0.17, 0.11, 0.63, 0, 7.0],
  ['lLegR', 0.145, 0.42, 0.145, 0.11, 0.19, 0, 3.5],
];

// [a, b, pivotA, pivotB, axisA, perpA, limites]
const JOINTS = [
  [1, 2, [0, 0.27, 0], [0, -0.135, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -0.7, 0.55), LIM(AX.ANGULAR_Y, -0.9, 0.9), LIM(AX.ANGULAR_Z, -0.5, 0.5)]],
  [0, 1, [0, 0.13, 0], [0, -0.27, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -0.45, 0.65), LIM(AX.ANGULAR_Y, -0.55, 0.55), LIM(AX.ANGULAR_Z, -0.35, 0.35)]],
  [1, 3, [-0.23, 0.21, 0], [0, 0.17, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -1.5, 1.5), LIM(AX.ANGULAR_Y, -0.8, 0.8), LIM(AX.ANGULAR_Z, -0.25, 1.65)]],
  [3, 4, [0, -0.17, 0], [0, 0.16, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -2.3, 0.0), LOCK(AX.ANGULAR_Y), LIM(AX.ANGULAR_Z, -0.12, 0.12)]],
  [1, 5, [0.23, 0.21, 0], [0, 0.17, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -1.5, 1.5), LIM(AX.ANGULAR_Y, -0.8, 0.8), LIM(AX.ANGULAR_Z, -1.65, 0.25)]],
  [5, 6, [0, -0.17, 0], [0, 0.16, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -2.3, 0.0), LOCK(AX.ANGULAR_Y), LIM(AX.ANGULAR_Z, -0.12, 0.12)]],
  [0, 7, [-0.11, -0.13, 0], [0, 0.22, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -1.35, 0.55), LIM(AX.ANGULAR_Y, -0.45, 0.45), LIM(AX.ANGULAR_Z, -0.35, 0.75)]],
  [7, 8, [0, -0.22, 0], [0, 0.21, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, 0.0, 2.35), LOCK(AX.ANGULAR_Y), LIM(AX.ANGULAR_Z, -0.1, 0.1)]],
  [0, 9, [0.11, -0.13, 0], [0, 0.22, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, -1.35, 0.55), LIM(AX.ANGULAR_Y, -0.45, 0.45), LIM(AX.ANGULAR_Z, -0.75, 0.35)]],
  [9, 10, [0, -0.22, 0], [0, 0.21, 0], [1, 0, 0], [0, 1, 0],
    [LIM(AX.ANGULAR_X, 0.0, 2.35), LOCK(AX.ANGULAR_Y), LIM(AX.ANGULAR_Z, -0.1, 0.1)]],
];

export function buildRagdollProtos(scene, M, shadow) {
  const limb = MeshBuilder.CreateBox('rd_limb', { size: 1 }, scene);
  boxUV(limb, 0.30); limb.material = M.plasticY; limb.isVisible = false; limb.isPickable = false;
  const head = MeshBuilder.CreateSphere('rd_head', { diameter: 1, segments: 8 }, scene);
  boxUV(head, 0.30); head.material = M.plasticB; head.isVisible = false; head.isPickable = false;
  return { limb, head, shadow };
}

export function spawnRagdoll(scene, protos, ox, oy, oz, yaw, sink) {
  const bodies = [];
  const rotY = Quaternion.RotationAxis(new Vector3(0, 1, 0), yaw);
  const rotate = (x, y, z) => {
    const v = new Vector3(x, y, z);
    v.rotateByQuaternionToRef(rotY, v);
    return v;
  };
  for (const [name, w, h, d, px, py, pz, mass] of PARTS) {
    const isHead = name === 'head';
    const src = isHead ? protos.head : protos.limb;
    const inst = src.createInstance('rd_' + name);
    inst.scaling.set(w, h, d);
    const p = rotate(px, 0, pz);
    inst.position.set(ox + p.x, oy + py, oz + p.z);
    inst.rotationQuaternion = rotY.clone();
    inst.isPickable = false;
    inst.receiveShadows = true;
    protos.shadow.addShadowCaster(inst);

    const body = new PhysicsBody(inst, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = isHead
      ? new PhysicsShapeSphere(Vector3.Zero(), w * 0.5, scene)
      : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, h, d), scene);
    shape.material = { friction: 0.7, restitution: 0.06 };
    body.shape = shape;
    const mp = body.computeMassProperties();
    const k = mass / (mp.mass || 1);
    body.setMassProperties({
      mass, inertia: mp.inertia ? mp.inertia.scale(k) : undefined,
      centerOfMass: mp.centerOfMass, inertiaOrientation: mp.inertiaOrientation,
    });
    body.setLinearDamping(0.12);
    body.setAngularDamping(0.45);
    bodies.push({ body, mesh: inst, mass });
    if (sink) sink.push({ body, mesh: inst, mass, soft: true });
  }
  const joints = [];
  for (const [a, b, pa, pb, ax, pax, limits] of JOINTS) {
    const c = new Physics6DoFConstraint({
      pivotA: new Vector3(pa[0], pa[1], pa[2]),
      pivotB: new Vector3(pb[0], pb[1], pb[2]),
      axisA: new Vector3(ax[0], ax[1], ax[2]),
      axisB: new Vector3(ax[0], ax[1], ax[2]),
      perpAxisA: new Vector3(pax[0], pax[1], pax[2]),
      perpAxisB: new Vector3(pax[0], pax[1], pax[2]),
      collision: false,
    }, [
      LOCK(AX.LINEAR_X), LOCK(AX.LINEAR_Y), LOCK(AX.LINEAR_Z), ...limits,
    ], scene);
    bodies[a].body.addConstraint(bodies[b].body, c);
    joints.push(c);
  }
  return { bodies, joints };
}
