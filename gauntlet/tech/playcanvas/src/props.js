// Dynamic rigid bodies, articulated assemblies (chain / hinged sign / ragdolls)
// and the hardware-instanced renderer that draws them in a handful of draw calls.
import * as pc from 'playcanvas/profiler';
import { GeoBuilder, mat4 } from './geo.js';
import { mulberry32 } from './noise.js';

const _m = new pc.Mat4();

class Batch {
    constructor(device, app, name, mesh, material, max) {
        this.name = name;
        this.max = max;
        this.nodes = [];
        this.data = new Float32Array(max * 16);
        this.vb = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), max, {
            usage: pc.BUFFER_DYNAMIC
        });
        this.mi = new pc.MeshInstance(mesh, material);
        this.mi.setInstancing(this.vb, false);
        this.mi.instancingCount = 0;
        this.mi.visible = false;
        this.mi.castShadow = true;
        this.mi.receiveShadow = true;
        const e = new pc.Entity('batch_' + name);
        e.addComponent('render', { meshInstances: [this.mi], castShadows: true, receiveShadows: true });
        app.root.addChild(e);
        this.entity = e;
    }
    add(node) {
        if (this.nodes.length >= this.max) return false;
        this.nodes.push(node);
        return true;
    }
    update() {
        const n = this.nodes.length;
        if (n === 0) { this.mi.visible = false; return; }
        const d = this.data;
        for (let i = 0; i < n; i++) {
            d.set(this.nodes[i].getWorldTransform().data, i * 16);
        }
        this.vb.setData(d);
        this.mi.instancingCount = n;
        this.mi.visible = true;
    }
}

// ------------------------------------------------------------ prop meshes
function crateMesh(device, size) {
    const g = new GeoBuilder();
    const h = size / 2, t = 0.05;
    g.addBox(mat4(0, 0, 0), size - t, size - t, size - t);
    for (const s of [-1, 1]) {
        g.addBox(mat4(0, s * (h - t / 2), 0), size, t, size);
        g.addBox(mat4(s * (h - t / 2), 0, 0), t, size - t * 2, size);
        g.addBox(mat4(0, 0, s * (h - t / 2)), size - t * 2, size - t * 2, t);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.addBox(mat4(sx * (h - t * 0.6), 0, sz * (h - t * 0.6)), t * 1.4, size, t * 1.4);
    }
    return g.build(device);
}

function drumMesh(device) {
    const g = new GeoBuilder();
    g.addCylinder(mat4(0, 0, 0), 0.30, 0.30, 0.88, 20, true);
    for (const y of [-0.24, 0, 0.24]) g.addCylinder(mat4(0, y, 0), 0.323, 0.323, 0.055, 20, false);
    for (const y of [-0.44, 0.44]) g.addCylinder(mat4(0, y, 0), 0.315, 0.315, 0.035, 20, true);
    g.addCylinder(mat4(0.16, 0.455, 0.0), 0.05, 0.05, 0.03, 8, true);
    return g.build(device);
}

function sphereMesh(device, r) {
    return new GeoBuilder().addSphere(mat4(0, 0, 0), r, 22, 14).build(device);
}

function tyreMesh(device) {
    const g = new GeoBuilder();
    g.addTorus(mat4(0, 0, 0), 0.315, 0.145, 22, 11);
    g.addCylinder(mat4(0, 0, 0), 0.20, 0.20, 0.17, 14, true);
    return g.build(device);
}

function unitBoxMesh(device) {
    return new GeoBuilder().addBox(mat4(0, 0, 0), 1, 1, 1).build(device);
}

function unitSphereMesh(device) {
    return new GeoBuilder().addSphere(mat4(0, 0, 0), 0.5, 16, 12).build(device);
}

function signMesh(device) {
    const g = new GeoBuilder();
    g.addBox(mat4(0, 0, 0), 2.6, 1.15, 0.07);
    g.addBox(mat4(0, 0.60, 0), 2.7, 0.09, 0.12);
    g.addBox(mat4(0, -0.60, 0), 2.7, 0.09, 0.12);
    for (const s of [-1, 1]) g.addCylinder(mat4(s * 1.0, 0.63, 0), 0.045, 0.045, 0.22, 8, true);
    return g.build(device);
}

function chainLinkMesh(device) {
    const g = new GeoBuilder();
    g.addTorus(mat4(0, 0, 0, 90, 0, 0), 0.075, 0.030, 12, 7);
    return g.build(device);
}

// ------------------------------------------------------------------ system
export class Props {
    constructor(app, M, device) {
        this.app = app;
        this.M = M;
        this.device = device;
        this.rnd = mulberry32(777001);
        this.batches = {};
        this.bodies = [];          // every dynamic rigidbody entity
        this.monitors = [];        // impact watchers for sparks
        this.joints = [];
        this.ragdollCount = 0;
        this.onImpact = null;

        const mk = (name, mesh, matName, max) => {
            this.batches[name] = new Batch(device, app, name, mesh, M[matName], max);
        };
        const crate = crateMesh(device, 0.8);
        mk('crateA', crate, 'wood', 420);
        mk('crateB', crate, 'woodPale', 220);
        mk('crateC', crate, 'woodDark', 220);
        const drum = drumMesh(device);
        mk('drumA', drum, 'rust', 260);
        mk('drumB', drum, 'metalPaintRed', 160);
        mk('sphere', sphereMesh(device, 0.35), 'steel', 200);
        mk('tyre', tyreMesh(device), 'rubber', 260);
        const ub = unitBoxMesh(device), us = unitSphereMesh(device);
        mk('rdA', ub, 'plasticOrange', 220);
        mk('rdB', ub, 'plasticBlue', 220);
        mk('rdC', ub, 'plasticYellow', 220);
        mk('rdHeadA', us, 'plasticOrange', 30);
        mk('rdHeadB', us, 'plasticBlue', 30);
        mk('rdHeadC', us, 'plasticYellow', 30);
        mk('chain', chainLinkMesh(device), 'steel', 40);

        this.signMeshRes = signMesh(device);
    }

    get bodyCount() { return this.bodies.length; }

    activeCount() {
        let n = 0;
        for (let i = 0; i < this.bodies.length; i++) {
            const b = this.bodies[i].rigidbody?.body;
            if (b && b.isActive()) n++;
        }
        return n;
    }

    update() {
        for (const k in this.batches) this.batches[k].update();
        this._checkImpacts();
    }

    _checkImpacts() {
        if (!this.onImpact) return;
        const now = performance.now();
        for (const m of this.monitors) {
            const rb = m.e.rigidbody;
            if (!rb || !rb.body) continue;
            const v = rb.linearVelocity;
            const sp = v.length();
            if (m.prev > 5.5 && sp < m.prev * 0.45 && now - m.last > 420) {
                m.last = now;
                this.onImpact(m.e.getPosition(), Math.min(1, m.prev / 16));
            }
            m.prev = sp;
        }
    }

    // ---------------------------------------------------------- spawning
    _body(name, pos, rot, shape, mass, fric, rest, batchName, visualScale) {
        const e = new pc.Entity(name);
        e.setPosition(pos.x, pos.y, pos.z);
        if (rot) e.setRotation(rot);
        e.addComponent('collision', shape);
        e.addComponent('rigidbody', {
            type: 'dynamic', mass, friction: fric, restitution: rest,
            linearDamping: 0.02, angularDamping: 0.06
        });
        this.app.root.addChild(e);
        let node = e;
        if (visualScale) {
            node = new pc.GraphNode('vis');
            node.setLocalScale(visualScale.x, visualScale.y, visualScale.z);
            e.addChild(node);
        }
        if (batchName) this.batches[batchName].add(node);
        this.bodies.push(e);
        return e;
    }

    spawnCrate(pos, rot, variant) {
        const b = ['crateA', 'crateB', 'crateC'][variant % 3];
        return this._body('crate', pos, rot, { type: 'box', halfExtents: new pc.Vec3(0.4, 0.4, 0.4) },
            18, 0.62, 0.05, b);
    }
    spawnDrum(pos, rot, variant) {
        const b = variant % 2 ? 'drumB' : 'drumA';
        return this._body('drum', pos, rot, { type: 'cylinder', radius: 0.3, height: 0.9, axis: 1 },
            22, 0.42, 0.16, b);
    }
    spawnSphere(pos) {
        const e = this._body('sphere', pos, null, { type: 'sphere', radius: 0.35 }, 190, 0.32, 0.26, 'sphere');
        const body = e.rigidbody.body;
        if (body) { body.setCcdMotionThreshold(0.18); body.setCcdSweptSphereRadius(0.24); }
        this.monitors.push({ e, prev: 0, last: 0 });
        return e;
    }
    spawnTyre(pos, rot) {
        return this._body('tyre', pos, rot, { type: 'cylinder', radius: 0.46, height: 0.29, axis: 1 },
            9, 0.92, 0.46, 'tyre');
    }

    spawnRandomProp(pos, rot) {
        const r = this.rnd();
        if (r < 0.42) return this.spawnCrate(pos, rot, (this.rnd() * 3) | 0);
        if (r < 0.66) return this.spawnDrum(pos, rot, (this.rnd() * 2) | 0);
        if (r < 0.82) return this.spawnTyre(pos, rot);
        return this.spawnSphere(pos);
    }

    // ------------------------------------------------------- initial pile
    buildInitialSet() {
        const rnd = this.rnd;
        const q = (x, y, z) => new pc.Quat().setFromEulerAngles(x, y, z);
        // 3 crate pyramids, 5 levels (15 crates each)
        const pyramids = [[1.6, 4.6, -12], [7.4, 1.2, 26], [-3.2, 6.4, 6]];
        for (let p = 0; p < 3; p++) {
            const [cx, cz, yaw] = pyramids[p];
            const rq = q(0, yaw, 0);
            for (let lvl = 0; lvl < 5; lvl++) {
                const n = 5 - lvl;
                for (let i = 0; i < n; i++) {
                    const lx = (i - (n - 1) / 2) * 0.83;
                    const local = new pc.Vec3(lx, 0.405 + lvl * 0.815, 0);
                    rq.transformVector(local, local);
                    this.spawnCrate(new pc.Vec3(cx + local.x, local.y, cz + local.z), rq, p + lvl);
                }
            }
        }
        // drums
        for (let i = 0; i < 25; i++) {
            const row = (i / 5) | 0, col = i % 5;
            const x = -1.2 + col * 0.72 + (rnd() - 0.5) * 0.05;
            const z = -6.2 + row * 0.75 + (rnd() - 0.5) * 0.05;
            this.spawnDrum(new pc.Vec3(x, 0.47, z), q(0, rnd() * 360, 0), i);
        }
        // steel spheres
        for (let i = 0; i < 20; i++) {
            this.spawnSphere(new pc.Vec3(-9.2 + (i % 5) * 0.85, 0.36 + ((i / 5) | 0) * 0.02, 1.4 + ((i / 5) | 0) * 0.85));
        }
        // tyres: 5 stacks of 6
        const stacks = [[9.6, 5.2], [10.4, 3.0], [4.2, 7.0], [-7.0, 6.6], [8.2, -5.6]];
        for (let s = 0; s < 5; s++) {
            for (let k = 0; k < 6; k++) {
                this.spawnTyre(new pc.Vec3(stacks[s][0] + (rnd() - 0.5) * 0.08, 0.155 + k * 0.30, stacks[s][1] + (rnd() - 0.5) * 0.08),
                    q(0, rnd() * 360, 0));
            }
        }
    }

    // --------------------------------------------------------- assemblies
    /** Hanging chain: `links` capsule links joined by alternating hinges. */
    buildChain(anchorPos, links = 12) {
        const app = this.app;
        const anchor = new pc.Entity('chainAnchor');
        anchor.setPosition(anchorPos.x, anchorPos.y, anchorPos.z);
        anchor.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.06, 0.06, 0.06) });
        anchor.addComponent('rigidbody', { type: 'static' });
        app.root.addChild(anchor);

        const pitch = 0.165;
        let prev = anchor;
        let prevY = anchorPos.y;
        for (let i = 0; i < links; i++) {
            const y = anchorPos.y - pitch * (i + 1);
            const rotAxis = i % 2 === 0 ? 0 : 90;
            const e = new pc.Entity('chainLink' + i);
            e.setPosition(anchorPos.x, y, anchorPos.z);
            e.setEulerAngles(0, rotAxis, 0);
            e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.042, 0.105, 0.042) });
            e.addComponent('rigidbody', {
                type: 'dynamic', mass: 3.2, friction: 0.5, restitution: 0.05,
                linearDamping: 0.08, angularDamping: 0.35
            });
            app.root.addChild(e);
            this.batches.chain.add(e);
            this.bodies.push(e);

            const j = new pc.Entity('chainJoint' + i);
            j.setPosition(anchorPos.x, (prevY + y) * 0.5, anchorPos.z);
            j.setEulerAngles(0, i % 2 === 0 ? 90 : 0, 0);
            app.root.addChild(j);
            j.addComponent('joint', {
                type: pc.JOINTTYPE_HINGE,
                entityA: prev,
                entityB: e,
                enableLimits: true,
                limits: new pc.Vec2(-72, 72),
                enableCollision: false
            });
            this.joints.push(j);
            prev = e; prevY = y;
        }
        // a rusty drum slung on the bottom link so the chain reads as load-bearing
        const hookPos = new pc.Vec3(anchorPos.x, prevY - 0.62, anchorPos.z);
        const hook = this._body('chainDrum', hookPos, null,
            { type: 'cylinder', radius: 0.3, height: 0.9, axis: 1 }, 30, 0.6, 0.1, 'drumA');
        const jh = new pc.Entity('chainHookJoint');
        jh.setPosition(anchorPos.x, prevY - 0.14, anchorPos.z);
        app.root.addChild(jh);
        jh.addComponent('joint', {
            type: pc.JOINTTYPE_BALL, entityA: prev, entityB: hook,
            enableLimits: true, swingLimitY: 50, swingLimitZ: 50, twistLimit: 30, enableCollision: false
        });
        this.joints.push(jh);
        return { anchor, links };
    }

    /** Swinging facade sign on a horizontal hinge. */
    buildSign(pos) {
        const app = this.app;
        const bracket = new pc.Entity('signBracket');
        bracket.setPosition(pos.x, pos.y + 0.72, pos.z);
        bracket.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(1.4, 0.06, 0.07) });
        bracket.addComponent('rigidbody', { type: 'static' });
        app.root.addChild(bracket);

        const e = new pc.Entity('sign');
        e.setPosition(pos.x, pos.y, pos.z);
        e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(1.3, 0.6, 0.05) });
        e.addComponent('rigidbody', {
            type: 'dynamic', mass: 26, friction: 0.5, restitution: 0.08,
            linearDamping: 0.02, angularDamping: 0.22
        });
        const mi = new pc.MeshInstance(this.signMeshRes, this.M.metalPaintWarm);
        e.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
        app.root.addChild(e);
        this.bodies.push(e);

        const j = new pc.Entity('signHinge');
        j.setPosition(pos.x, pos.y + 0.66, pos.z);
        // joint entity local X is the hinge axis; identity rotation -> swings about world X
        app.root.addChild(j);
        j.addComponent('joint', {
            type: pc.JOINTTYPE_HINGE, entityA: bracket, entityB: e,
            enableLimits: true, limits: new pc.Vec2(-58, 58), enableCollision: false
        });
        this.joints.push(j);
        // give it a nudge so it is already swinging when the harness looks
        e.rigidbody.applyImpulse(0, 0, -34);
        return e;
    }

    /** Articulated ragdoll: 11 bodies, 10 joints with sane limits. */
    buildRagdoll(origin, yaw = 0, variant = 0) {
        const app = this.app;
        const V = ['rdA', 'rdB', 'rdC'][variant % 3];
        const H = ['rdHeadA', 'rdHeadB', 'rdHeadC'][variant % 3];
        const q = new pc.Quat().setFromEulerAngles(0, yaw, 0);
        const P = (x, y, z) => {
            const v = new pc.Vec3(x, y, z);
            q.transformVector(v, v);
            return new pc.Vec3(origin.x + v.x, origin.y + v.y, origin.z + v.z);
        };
        const parts = {};
        const mkPart = (name, pos, size, mass, batch) => {
            const e = this._body('rd_' + name, pos, q,
                { type: 'box', halfExtents: new pc.Vec3(size[0] / 2, size[1] / 2, size[2] / 2) },
                mass, 0.7, 0.05, batch, new pc.Vec3(size[0], size[1], size[2]));
            e.rigidbody.angularDamping = 0.22;
            e.rigidbody.linearDamping = 0.03;
            const b = e.rigidbody.body;
            if (b) b.setCcdMotionThreshold(0.12);
            parts[name] = e;
            return e;
        };
        // dimensions in metres, standing pose centred on `origin` (pelvis at y=0)
        mkPart('pelvis', P(0, 0, 0), [0.34, 0.22, 0.21], 12, V);
        mkPart('torso', P(0, 0.34, 0), [0.38, 0.46, 0.23], 20, V);
        const head = this._body('rd_head', P(0, 0.72, 0), q, { type: 'sphere', radius: 0.125 }, 4.5, 0.6, 0.08, H,
            new pc.Vec3(0.25, 0.28, 0.25));
        head.rigidbody.angularDamping = 0.25;
        parts.head = head;
        for (const s of [-1, 1]) {
            const t = s < 0 ? 'L' : 'R';
            mkPart('uarm' + t, P(s * 0.31, 0.42, 0), [0.12, 0.31, 0.12], 2.6, V);
            mkPart('larm' + t, P(s * 0.31, 0.10, 0), [0.10, 0.30, 0.10], 1.9, V);
            mkPart('uleg' + t, P(s * 0.11, -0.36, 0), [0.15, 0.42, 0.15], 6.5, V);
            mkPart('lleg' + t, P(s * 0.11, -0.80, 0), [0.13, 0.40, 0.13], 4.2, V);
        }
        const addJoint = (name, a, b, pos, euler, cfg) => {
            const j = new pc.Entity(name);
            j.setPosition(pos.x, pos.y, pos.z);
            const rq = new pc.Quat().setFromEulerAngles(euler[0], euler[1] + yaw, euler[2]);
            j.setRotation(rq);
            app.root.addChild(j);
            j.addComponent('joint', Object.assign({ entityA: a, entityB: b, enableCollision: false }, cfg));
            this.joints.push(j);
            return j;
        };
        const ball = (sy, sz, tw) => ({
            type: pc.JOINTTYPE_BALL, enableLimits: true,
            swingLimitY: sy, swingLimitZ: sz, twistLimit: tw
        });
        const hinge = (lo, hi) => ({
            type: pc.JOINTTYPE_HINGE, enableLimits: true, limits: new pc.Vec2(lo, hi)
        });
        addJoint('j_spine', parts.pelvis, parts.torso, P(0, 0.14, 0), [0, 0, 0], ball(26, 26, 22));
        addJoint('j_neck', parts.torso, parts.head, P(0, 0.60, 0), [0, 0, 0], ball(36, 36, 30));
        for (const s of [-1, 1]) {
            const t = s < 0 ? 'L' : 'R';
            addJoint('j_sh' + t, parts.torso, parts['uarm' + t], P(s * 0.24, 0.53, 0), [0, 0, 0], ball(68, 58, 40));
            // elbow hinge about world X (joint local X axis)
            addJoint('j_el' + t, parts['uarm' + t], parts['larm' + t], P(s * 0.31, 0.255, 0), [0, 0, 0], hinge(-135, -2));
            addJoint('j_hip' + t, parts.pelvis, parts['uleg' + t], P(s * 0.11, -0.13, 0), [0, 0, 0], ball(52, 34, 26));
            addJoint('j_kn' + t, parts['uleg' + t], parts['lleg' + t], P(s * 0.11, -0.58, 0), [0, 0, 0], hinge(2, 132));
        }
        this.ragdollCount++;
        return parts;
    }

    // --------------------------------------------------------------- fx
    explode(center, radiusM, impulseN) {
        const dt = 1 / 60;
        const tmp = new pc.Vec3();
        let touched = 0;
        for (const e of this.bodies) {
            const rb = e.rigidbody;
            if (!rb || !rb.body || rb.type !== 'dynamic') continue;
            const p = e.getPosition();
            tmp.set(p.x - center.x, p.y - center.y, p.z - center.z);
            const d = tmp.length();
            if (d > radiusM) continue;
            const fall = 1 - d / radiusM;
            if (d < 0.001) tmp.set(0, 1, 0); else tmp.mulScalar(1 / d);
            tmp.y += 0.55;
            tmp.normalize();
            const j = impulseN * dt * fall * fall;
            rb.activate();
            rb.applyImpulse(tmp.x * j, tmp.y * j, tmp.z * j);
            // clamp so nothing tunnels through the world
            const v = rb.linearVelocity;
            const sp = v.length();
            if (sp > 34) rb.linearVelocity = v.mulScalar(34 / sp);
            const b = rb.body;
            if (b) { b.setCcdMotionThreshold(0.2); b.setCcdSweptSphereRadius(0.12); }
            touched++;
        }
        return touched;
    }
}
