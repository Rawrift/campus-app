// Small procedural geometry builder. Accumulates transformed primitives into a
// single merged mesh so the static world costs a handful of draw calls.
import * as pc from 'playcanvas/profiler';

const _v = new pc.Vec3();

export class GeoBuilder {
    constructor() {
        this.pos = [];
        this.nrm = [];
        this.uv = [];
        this.idx = [];
    }

    get vertexCount() { return this.pos.length / 3; }

    _vert(m, x, y, z, nx, ny, nz, u, v) {
        _v.set(x, y, z);
        m.transformPoint(_v, _v);
        this.pos.push(_v.x, _v.y, _v.z);
        _v.set(nx, ny, nz);
        m.transformVector(_v, _v);
        _v.normalize();
        this.nrm.push(_v.x, _v.y, _v.z);
        this.uv.push(u, v);
    }

    _quad(m, c, n, uAx, vAx, su, sv, uo, vo) {
        const base = this.vertexCount;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [a, b] of corners) {
            this._vert(m,
                c[0] + uAx[0] * su * a + vAx[0] * sv * b,
                c[1] + uAx[1] * su * a + vAx[1] * sv * b,
                c[2] + uAx[2] * su * a + vAx[2] * sv * b,
                n[0], n[1], n[2],
                uo + a * su, vo + b * sv);
        }
        this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    /** Axis-aligned box of size (sx,sy,sz) centred at origin, transformed by m. */
    addBox(m, sx, sy, sz, uo = 0, vo = 0) {
        const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
        const F = [
            [[1, 0, 0], [0, 0, -1], [0, 1, 0], hz, hy, [hx, 0, 0]],
            [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hz, hy, [-hx, 0, 0]],
            [[0, 1, 0], [1, 0, 0], [0, 0, -1], hx, hz, [0, hy, 0]],
            [[0, -1, 0], [1, 0, 0], [0, 0, 1], hx, hz, [0, -hy, 0]],
            [[0, 0, 1], [1, 0, 0], [0, 1, 0], hx, hy, [0, 0, hz]],
            [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hx, hy, [0, 0, -hz]]
        ];
        for (const [n, uAx, vAx, su, sv, c] of F) this._quad(m, c, n, uAx, vAx, su, sv, uo, vo);
        return this;
    }

    /** Y-aligned cylinder, height h centred at origin. */
    addCylinder(m, rTop, rBot, h, segs = 12, caps = true, uo = 0, vo = 0) {
        const hy = h * 0.5;
        const base = this.vertexCount;
        const circ = Math.PI * (rTop + rBot);
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            const slope = (rBot - rTop) / h;
            const nl = 1 / Math.sqrt(1 + slope * slope);
            const u = uo + (i / segs) * circ;
            this._vert(m, ca * rTop, hy, sa * rTop, ca * nl, slope * nl, sa * nl, u, vo + hy);
            this._vert(m, ca * rBot, -hy, sa * rBot, ca * nl, slope * nl, sa * nl, u, vo - hy);
        }
        for (let i = 0; i < segs; i++) {
            const a = base + i * 2;
            this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
        if (caps) {
            for (const [y, r, ny] of [[hy, rTop, 1], [-hy, rBot, -1]]) {
                if (r <= 0) continue;
                const cb = this.vertexCount;
                this._vert(m, 0, y, 0, 0, ny, 0, uo, vo);
                for (let i = 0; i <= segs; i++) {
                    const a = (i / segs) * Math.PI * 2;
                    this._vert(m, Math.cos(a) * r, y, Math.sin(a) * r, 0, ny, 0,
                        uo + Math.cos(a) * r, vo + Math.sin(a) * r);
                }
                for (let i = 0; i < segs; i++) {
                    if (ny > 0) this.idx.push(cb, cb + 1 + i, cb + 2 + i);
                    else this.idx.push(cb, cb + 2 + i, cb + 1 + i);
                }
            }
        }
        return this;
    }

    /** UV sphere. */
    addSphere(m, r, segs = 16, rings = 12, uo = 0, vo = 0) {
        const base = this.vertexCount;
        for (let j = 0; j <= rings; j++) {
            const phi = (j / rings) * Math.PI;
            const sp = Math.sin(phi), cp = Math.cos(phi);
            for (let i = 0; i <= segs; i++) {
                const th = (i / segs) * Math.PI * 2;
                const x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
                this._vert(m, x * r, y * r, z * r, x, y, z,
                    uo + (i / segs) * Math.PI * 2 * r, vo + (j / rings) * Math.PI * r);
            }
        }
        for (let j = 0; j < rings; j++) {
            for (let i = 0; i < segs; i++) {
                const a = base + j * (segs + 1) + i, b = a + segs + 1;
                this.idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        return this;
    }

    /** Torus in the XZ plane (tyre). */
    addTorus(m, R, r, segs = 20, sides = 10, uo = 0, vo = 0) {
        const base = this.vertexCount;
        for (let i = 0; i <= segs; i++) {
            const u = (i / segs) * Math.PI * 2;
            const cu = Math.cos(u), su = Math.sin(u);
            for (let j = 0; j <= sides; j++) {
                const v = (j / sides) * Math.PI * 2;
                const cv = Math.cos(v), sv = Math.sin(v);
                const nx = cu * cv, ny = sv, nz = su * cv;
                this._vert(m, cu * (R + r * cv), r * sv, su * (R + r * cv), nx, ny, nz,
                    uo + (i / segs) * Math.PI * 2 * R, vo + (j / sides) * Math.PI * 2 * r);
            }
        }
        for (let i = 0; i < segs; i++) {
            for (let j = 0; j < sides; j++) {
                const a = base + i * (sides + 1) + j, b = a + sides + 1;
                this.idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        return this;
    }

    /** Subdivided ground plane in XZ, y = 0, world-sized UVs. */
    addGrid(m, sx, sz, nx, nz) {
        const base = this.vertexCount;
        for (let j = 0; j <= nz; j++) {
            for (let i = 0; i <= nx; i++) {
                const x = (i / nx - 0.5) * sx, z = (j / nz - 0.5) * sz;
                this._vert(m, x, 0, z, 0, 1, 0, x, z);
            }
        }
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const a = base + j * (nx + 1) + i, b = a + nx + 1;
                this.idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        return this;
    }

    build(device, computeTangents = true) {
        const g = new pc.Geometry();
        g.positions = this.pos;
        g.normals = this.nrm;
        g.uvs = this.uv;
        g.indices = this.idx;
        if (computeTangents) g.calculateTangents();
        return pc.Mesh.fromGeometry(device, g);
    }
}

export function mat4(px, py, pz, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = new pc.Mat4();
    const q = new pc.Quat().setFromEulerAngles(rx, ry, rz);
    m.setTRS(new pc.Vec3(px, py, pz), q, new pc.Vec3(s, s, s));
    return m;
}

export function meshEntity(app, name, mesh, material, layerIds) {
    const mi = new pc.MeshInstance(mesh, material);
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
    if (layerIds) e.render.layers = layerIds;
    app.root.addChild(e);
    return { entity: e, meshInstance: mi };
}
