// Cadena de eslabones (>=10) y cartel oscilante sobre bisagra.
import {
  MeshBuilder, Vector3, Quaternion, TransformNode, Color3,
  PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeCylinder,
  BallAndSocketConstraint, HingeConstraint,
} from '@babylonjs/core';
import { boxUV } from './meshutil.js';

export function buildChain(scene, M, shadow, sink, ax, ay, az, n = 13) {
  const proto = MeshBuilder.CreateTorus('chainSrc', { diameter: 0.28, thickness: 0.078, tessellation: 10 }, scene);
  boxUV(proto, 0.25);
  proto.material = M.steel; proto.isVisible = false; proto.isPickable = false;

  // ancla estatica bajo la viga
  const anchorNode = new TransformNode('chainAnchor', scene);
  anchorNode.position.set(ax, ay, az);
  const anchor = new PhysicsBody(anchorNode, PhysicsMotionType.STATIC, false, scene);
  anchor.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.14, 0.14, 0.14), scene);

  const links = [];
  const gap = 0.205;
  for (let i = 0; i < n; i++) {
    const q = Quaternion.RotationAxis(i % 2 === 0 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1), Math.PI / 2);
    const inst = proto.createInstance('link' + i);
    inst.position.set(ax, ay - 0.18 - i * gap, az);
    inst.rotationQuaternion = q;
    inst.isPickable = false;
    shadow.addShadowCaster(inst);
    const body = new PhysicsBody(inst, PhysicsMotionType.DYNAMIC, false, scene);
    const sh = new PhysicsShapeCylinder(new Vector3(0, -0.05, 0), new Vector3(0, 0.05, 0), 0.15, scene);
    sh.material = { friction: 0.5, restitution: 0.05 };
    body.shape = sh;
    const mp = body.computeMassProperties();
    const k = 3.2 / (mp.mass || 1);
    body.setMassProperties({ mass: 3.2, inertia: mp.inertia ? mp.inertia.scale(k) : undefined, centerOfMass: mp.centerOfMass, inertiaOrientation: mp.inertiaOrientation });
    body.setLinearDamping(0.18); body.setAngularDamping(0.45);
    // vector local que apunta a -Y del mundo
    const qi = Quaternion.Inverse(q);
    const down = new Vector3(0, -1, 0);
    down.rotateByQuaternionToRef(qi, down);
    links.push({ body, mesh: inst, down: down.scale(gap * 0.5), mass: 3.2 });
    if (sink) sink.push({ body, mesh: inst, mass: 3.2 });
  }
  // union al ancla
  anchor.addConstraint(links[0].body, new BallAndSocketConstraint(
    new Vector3(0, -0.09, 0), links[0].down.scale(-1),
    new Vector3(0, 1, 0), new Vector3(0, 1, 0), scene));
  for (let i = 0; i < n - 1; i++) {
    anchorSafe(links[i], links[i + 1], scene);
  }
  // gancho / contrapeso
  const hook = MeshBuilder.CreateBox('hook', { width: 0.34, height: 0.5, depth: 0.34 }, scene);
  boxUV(hook, 0.3); hook.material = M.steel; hook.isPickable = false;
  hook.position.set(ax, ay - 0.18 - n * gap - 0.26, az);
  hook.rotationQuaternion = Quaternion.Identity();
  shadow.addShadowCaster(hook);
  const hb = new PhysicsBody(hook, PhysicsMotionType.DYNAMIC, false, scene);
  hb.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.34, 0.5, 0.34), scene);
  hb.shape.material = { friction: 0.6, restitution: 0.05 };
  const mph = hb.computeMassProperties();
  const kh = 26 / (mph.mass || 1);
  hb.setMassProperties({ mass: 26, inertia: mph.inertia ? mph.inertia.scale(kh) : undefined, centerOfMass: mph.centerOfMass, inertiaOrientation: mph.inertiaOrientation });
  hb.setLinearDamping(0.1); hb.setAngularDamping(0.3);
  if (sink) sink.push({ body: hb, mesh: hook, mass: 26 });
  const last = links[n - 1];
  last.body.addConstraint(hb, new BallAndSocketConstraint(
    last.down, new Vector3(0, 0.25, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0), scene));
  return { links, hook: hb, count: n + 1 };
}

function anchorSafe(a, b, scene) {
  a.body.addConstraint(b.body, new BallAndSocketConstraint(
    a.down, b.down.scale(-1), new Vector3(0, 1, 0), new Vector3(0, 1, 0), scene));
}

export function buildSign(scene, M, shadow, sink, x, y, z) {
  const anchorNode = new TransformNode('signAnchor', scene);
  anchorNode.position.set(x, y, z);
  const anchor = new PhysicsBody(anchorNode, PhysicsMotionType.STATIC, false, scene);
  anchor.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.2, 0.2, 0.2), scene);

  const board = MeshBuilder.CreateBox('sign', { width: 2.9, height: 1.5, depth: 0.09 }, scene);
  board.material = M.sign;
  board.position.set(x, y - 0.12 - 0.86, z);
  board.rotationQuaternion = Quaternion.Identity();
  board.isPickable = false;
  shadow.addShadowCaster(board);
  const body = new PhysicsBody(board, PhysicsMotionType.DYNAMIC, false, scene);
  body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(2.9, 1.5, 0.09), scene);
  body.shape.material = { friction: 0.5, restitution: 0.1 };
  const mp = body.computeMassProperties();
  const k = 34 / (mp.mass || 1);
  body.setMassProperties({ mass: 34, inertia: mp.inertia ? mp.inertia.scale(k) : undefined, centerOfMass: mp.centerOfMass, inertiaOrientation: mp.inertiaOrientation });
  body.setLinearDamping(0.05); body.setAngularDamping(0.06);
  anchor.addConstraint(body, new HingeConstraint(
    new Vector3(0, -0.12, 0), new Vector3(0, 0.86, 0),
    new Vector3(1, 0, 0), new Vector3(1, 0, 0), scene));
  body.setAngularVelocity(new Vector3(0.9, 0, 0));
  if (sink) sink.push({ body, mesh: board, mass: 34 });

  // soporte visible
  const arm = MeshBuilder.CreateBox('signArm', { width: 0.12, height: 0.12, depth: 0.7 }, scene);
  arm.position.set(x, y + 0.05, z - 0.35);
  boxUV(arm, 0.4); arm.material = M.metalRail; arm.freezeWorldMatrix(); arm.isPickable = false;
  shadow.addShadowCaster(arm);
  return body;
}
