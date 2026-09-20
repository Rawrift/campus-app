// Static world: terrain, warehouse shell, structure, exterior props.
// Everything is merged per material into single meshes -> few draw calls.
import * as pc from 'playcanvas/profiler';
import { GeoBuilder, mat4, meshEntity } from './geo.js';
import { mulberry32 } from './noise.js';

export const NAVE = { hx: 12, hz: 8, wall: 8, thick: 0.4, doorW: 10, doorH: 6 };

function addStatic(app, name, cx, cy, cz, sx, sy, sz, rotY = 0, friction = 0.85, restitution = 0.08) {
    const e = new pc.Entity(name);
    e.setPosition(cx, cy, cz);
    if (rotY) e.setEulerAngles(0, rotY, 0);
    e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(sx * 0.5, sy * 0.5, sz * 0.5) });
    e.addComponent('rigidbody', { type: 'static', friction, restitution });
    app.root.addChild(e);
    return e;
}

export function buildWorld(app, M, device) {
    const rnd = mulberry32(20240917);
    const R = (a, b) => a + rnd() * (b - a);
    const builders = {};
    const B = (key) => (builders[key] ||= new GeoBuilder());
    const uo = () => rnd() * 40;

    const out = { statics: [], lights: [], lamps: [], signAnchorY: 0 };

    // ------------------------------------------------------------ terrain
    B('asphalt').addGrid(mat4(0, 0, 0), 160, 160, 64, 64);
    B('wet').addGrid(mat4(16, 0.012, 14), 14, 10, 8, 6);
    B('floor').addGrid(mat4(0, 0.018, 0), 23.2, 15.2, 12, 8);
    out.statics.push(addStatic(app, 'ground', 0, -0.5, 0, 200, 1, 200, 0, 0.92, 0.05));

    // --------------------------------------------------------- nave shell
    const { hx, hz, wall, thick } = NAVE;
    const C = 'concrete';
    // back wall (-Z)
    B(C).addBox(mat4(0, wall / 2, -hz - thick / 2), hx * 2 + thick * 2, wall, thick, uo(), uo());
    out.statics.push(addStatic(app, 'wallBack', 0, wall / 2, -hz - thick / 2, hx * 2 + thick * 2, wall, thick));
    // front wall (+Z) : two piers + lintel over a 10 x 6 doorway
    const pierW = (hx * 2 - NAVE.doorW) / 2;                 // 7 m each
    for (const s of [-1, 1]) {
        const cx = s * (NAVE.doorW / 2 + pierW / 2);
        B(C).addBox(mat4(cx, wall / 2, hz + thick / 2), pierW, wall, thick, uo(), uo());
        out.statics.push(addStatic(app, 'wallFront' + s, cx, wall / 2, hz + thick / 2, pierW, wall, thick));
    }
    B(C).addBox(mat4(0, (NAVE.doorH + wall) / 2, hz + thick / 2), NAVE.doorW, wall - NAVE.doorH, thick, uo(), uo());
    out.statics.push(addStatic(app, 'lintel', 0, (NAVE.doorH + wall) / 2, hz + thick / 2, NAVE.doorW, wall - NAVE.doorH, thick));
    // side walls with 4 window openings each
    const winZ = [-6.0, -2.5, 1.0, 4.5], winW = 2.4, winY0 = 4.4, winY1 = 6.4;
    for (const s of [-1, 1]) {
        const cx = s * (hx + thick / 2);
        B(C).addBox(mat4(cx, winY0 / 2, 0), thick, winY0, hz * 2, uo(), uo());
        B(C).addBox(mat4(cx, (winY1 + wall) / 2, 0), thick, wall - winY1, hz * 2, uo(), uo());
        // piers between windows
        const edges = [-hz];
        for (const z of winZ) { edges.push(z - winW / 2, z + winW / 2); }
        edges.push(hz);
        for (let i = 0; i < edges.length; i += 2) {
            const z0 = edges[i], z1 = edges[i + 1];
            if (z1 - z0 < 0.01) continue;
            B(C).addBox(mat4(cx, (winY0 + winY1) / 2, (z0 + z1) / 2), thick, winY1 - winY0, z1 - z0, uo(), uo());
        }
        out.statics.push(addStatic(app, 'wallSide' + s, cx, wall / 2, 0, thick, wall, hz * 2));
        // window frames + glass
        for (const z of winZ) {
            const fr = 0.09;
            B('metalPaint').addBox(mat4(cx, winY0 + fr / 2, z), thick + 0.04, fr, winW, uo(), uo());
            B('metalPaint').addBox(mat4(cx, winY1 - fr / 2, z), thick + 0.04, fr, winW, uo(), uo());
            B('metalPaint').addBox(mat4(cx, (winY0 + winY1) / 2, z - winW / 2 + fr / 2), thick + 0.04, winY1 - winY0, fr, uo(), uo());
            B('metalPaint').addBox(mat4(cx, (winY0 + winY1) / 2, z + winW / 2 - fr / 2), thick + 0.04, winY1 - winY0, fr, uo(), uo());
            B('metalPaint').addBox(mat4(cx, (winY0 + winY1) / 2, z), thick + 0.02, winY1 - winY0, 0.06, uo(), uo());
            B('glass').addBox(mat4(cx, (winY0 + winY1) / 2, z), 0.05, winY1 - winY0 - fr * 2, winW - fr * 2, 0, 0);
        }
    }
    // door surround + rolled shutter
    B('metalPaint').addBox(mat4(0, NAVE.doorH + 0.14, hz + thick / 2), NAVE.doorW + 0.5, 0.28, thick + 0.12, uo(), uo());
    for (const s of [-1, 1]) {
        B('metalPaint').addBox(mat4(s * (NAVE.doorW / 2 + 0.14), NAVE.doorH / 2, hz + thick / 2), 0.28, NAVE.doorH, thick + 0.12, uo(), uo());
    }
    B('metalPaint').addCylinder(mat4(0, NAVE.doorH + 0.55, hz - 0.15, 0, 0, 90), 0.42, 0.42, NAVE.doorW - 0.2, 16, true, uo(), uo());

    // ------------------------------------------------------------- roof
    const roofY = wall + 0.22;
    B('metalPaint').addBox(mat4(0, roofY, 0), hx * 2 + 1.6, 0.44, hz * 2 + 1.6, uo(), uo());
    out.statics.push(addStatic(app, 'roof', 0, roofY, 0, hx * 2 + 1.6, 0.44, hz * 2 + 1.6));
    for (let i = 0; i < 25; i++) {
        const x = -12.0 + i * 1.0;
        B('metalPaint').addBox(mat4(x, roofY + 0.28, 0), 0.26, 0.14, hz * 2 + 1.5, uo(), uo());
    }
    // 14 I-beams spanning Z, visible from inside
    for (let i = 0; i < 14; i++) {
        const x = -11.3 + i * (22.6 / 13);
        const yb = 7.42;
        B('metalPaint').addBox(mat4(x, yb, 0), 0.30, 0.055, hz * 2, uo(), uo());
        B('metalPaint').addBox(mat4(x, yb + 0.26, 0), 0.055, 0.46, hz * 2, uo(), uo());
        B('metalPaint').addBox(mat4(x, yb + 0.52, 0), 0.30, 0.055, hz * 2, uo(), uo());
    }
    // purlins across X
    for (let i = 0; i < 7; i++) {
        const z = -7 + i * (14 / 6);
        B('metalPaint').addBox(mat4(0, 7.18, z), hx * 2, 0.13, 0.13, uo(), uo());
    }
    // diagonal cross bracing in two bays
    for (const z of [-5.2, 5.2]) {
        for (const s of [-1, 1]) {
            B('metalPaint').addBox(mat4(s * 5.6, 7.0, z, 0, 0, s * 22), 12.0, 0.08, 0.08, uo(), uo());
        }
    }

    // ---------------------------------------------------------- pillars
    for (const px of [-6, 6]) {
        for (const pz of [-2, 2]) {
            B(C).addBox(mat4(px, wall / 2, pz), 0.55, wall, 0.55, uo(), uo());
            B('metalPaint').addBox(mat4(px, 0.06, pz), 0.85, 0.12, 0.85, uo(), uo());
            out.statics.push(addStatic(app, `pillar${px}_${pz}`, px, wall / 2, pz, 0.55, wall, 0.55));
        }
    }

    // -------------------------------------------------------- mezzanine
    const mzY = 3.85, mzZ0 = -hz, mzZ1 = -3;
    const mzCz = (mzZ0 + mzZ1) / 2, mzD = mzZ1 - mzZ0;
    B('metalPaint').addBox(mat4(0, mzY, mzCz), hx * 2, 0.30, mzD, uo(), uo());
    out.statics.push(addStatic(app, 'mezz', 0, mzY, mzCz, hx * 2, 0.30, mzD));
    for (let i = 0; i < 6; i++) {
        const x = -10 + i * 4;
        B('metalPaint').addBox(mat4(x, (mzY - 0.15) / 2, mzZ1 + 0.25), 0.22, mzY - 0.15, 0.22, uo(), uo());
        out.statics.push(addStatic(app, 'mezzCol' + i, x, (mzY - 0.15) / 2, mzZ1 + 0.25, 0.22, mzY - 0.15, 0.22));
    }
    // railing
    for (let i = 0; i <= 16; i++) {
        const x = -11.5 + i * (23 / 16);
        B('metalPaint').addCylinder(mat4(x, mzY + 0.15 + 0.55, mzZ1 - 0.12), 0.035, 0.035, 1.1, 8, true, uo(), uo());
    }
    B('metalPaint').addCylinder(mat4(0, mzY + 0.15 + 1.06, mzZ1 - 0.12, 0, 0, 90), 0.05, 0.05, 23.4, 8, true, uo(), uo());
    B('metalPaint').addCylinder(mat4(0, mzY + 0.15 + 0.55, mzZ1 - 0.12, 0, 0, 90), 0.035, 0.035, 23.4, 8, true, uo(), uo());
    B('metalPaint').addBox(mat4(0, mzY + 0.15 + 0.02, mzZ1 - 0.12), 23.4, 0.14, 0.04, uo(), uo());
    // stairs
    {
        const steps = 13, x0 = 10.4, w = 1.2;
        for (let i = 0; i < steps; i++) {
            const y = mzY + 0.15 - (i + 1) * (mzY + 0.15) / steps;
            const z = mzZ1 + 0.35 + i * 0.30;
            B('metalPaint').addBox(mat4(x0, y, z), w, 0.05, 0.32, uo(), uo());
            B('metalPaint').addBox(mat4(x0, y + 0.13, z + 0.16), w, 0.26, 0.04, uo(), uo());
        }
        for (const s of [-1, 1]) {
            B('metalPaint').addBox(mat4(x0 + s * w / 2, mzY * 0.52, mzZ1 + 2.3, -32, 0, 0), 0.07, 0.34, 5.1, uo(), uo());
            B('metalPaint').addCylinder(mat4(x0 + s * w / 2, mzY * 0.52 + 1.0, mzZ1 + 2.3, -32, 0, 0), 0.035, 0.035, 5.1, 8, true, uo(), uo());
        }
        out.statics.push(addStatic(app, 'stairRamp', x0, mzY * 0.52 - 0.1, mzZ1 + 2.3, w, 0.4, 5.1));
    }

    // ------------------------------------------------------ storage racks
    for (const [rx, rz, len] of [[-9.5, -0.5, 7.0], [-9.5, 5.2, 5.0]]) {
        const h = 4.4;
        for (let i = 0; i <= Math.round(len / 2.5); i++) {
            const z = rz - len / 2 + i * (len / Math.max(1, Math.round(len / 2.5)));
            for (const s of [-1, 1]) {
                B('metalPaintWarm').addBox(mat4(rx + s * 0.55, h / 2, z), 0.1, h, 0.1, uo(), uo());
            }
            B('metalPaintWarm').addBox(mat4(rx, h - 0.1, z, 0, 0, 0), 1.2, 0.08, 0.08, uo(), uo());
        }
        for (const ly of [1.3, 2.7, 4.1]) {
            for (const s of [-1, 1]) {
                B('metalPaintWarm').addBox(mat4(rx + s * 0.5, ly, rz), 0.12, 0.16, len, uo(), uo());
            }
            B('woodDark').addBox(mat4(rx, ly + 0.10, rz), 1.15, 0.05, len - 0.1, uo(), uo());
        }
        out.statics.push(addStatic(app, 'rack' + rx + rz, rx, 2.2, rz, 1.25, 4.4, len));
    }

    // -------------------------------------------------- interior lamps x5
    const lampPos = [[-7, 6.55, -4.5], [7, 6.55, -4.5], [-7, 6.55, 3.2], [7, 6.55, 3.2], [0, 6.55, -0.6]];
    for (const [lx, ly, lz] of lampPos) {
        B('metalPaint').addCylinder(mat4(lx, ly + 0.55, lz), 0.028, 0.028, 0.95, 6, false, uo(), uo());
        B('metalPaint').addCylinder(mat4(lx, ly + 0.02, lz), 0.10, 0.44, 0.33, 14, true, uo(), uo());
        B('lamp').addCylinder(mat4(lx, ly - 0.16, lz), 0.38, 0.30, 0.06, 14, true, 0, 0);
        const L = new pc.Entity('lampLight');
        L.setPosition(lx, ly - 0.3, lz);
        L.addComponent('light', {
            type: 'omni', color: new pc.Color(1.0, 0.83, 0.60), intensity: 9,
            range: 13, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED,
            luminance: 22000
        });
        app.root.addChild(L);
        out.lights.push(L);
    }
    // two cool accent lights under the mezzanine
    for (const [lx, lz] of [[-5.5, -5.6], [5.5, -5.6]]) {
        B('lampCool').addBox(mat4(lx, 3.62, lz), 1.1, 0.07, 0.18, 0, 0);
        const L = new pc.Entity('mezzLight');
        L.setPosition(lx, 3.4, lz);
        L.addComponent('light', {
            type: 'omni', color: new pc.Color(0.72, 0.82, 1.0), intensity: 5,
            range: 9, castShadows: false, luminance: 12000
        });
        app.root.addChild(L);
        out.lights.push(L);
    }

    // ---------------------------------------------- secondary buildings
    // 1. shipping container
    {
        const m = mat4(-24, 1.32, 12, 0, 17, 0);
        B('metalPaintRed').addBox(m, 6.1, 2.6, 2.45, uo(), uo());
        for (let i = 0; i < 20; i++) {
            const x = -2.85 + i * 0.30;
            B('metalPaintRed').addBox(mat4(0, 0, 0).copy(m).mul(mat4(x, 0, 1.24)), 0.12, 2.3, 0.08, uo(), uo());
            B('metalPaintRed').addBox(mat4(0, 0, 0).copy(m).mul(mat4(x, 0, -1.24)), 0.12, 2.3, 0.08, uo(), uo());
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            B('metalPaint').addBox(mat4(0, 0, 0).copy(m).mul(mat4(sx * 3.0, 0, sz * 1.2)), 0.16, 2.62, 0.16, uo(), uo());
        }
        out.statics.push(addStatic(app, 'container1', -24, 1.32, 12, 6.1, 2.6, 2.45, 17));
        const m2 = mat4(-23.4, 3.95, 12.6, 0, 13, 0);
        B('metalPaintGreen').addBox(m2, 6.1, 2.6, 2.45, uo(), uo());
        for (let i = 0; i < 20; i++) {
            const x = -2.85 + i * 0.30;
            B('metalPaintGreen').addBox(mat4(0, 0, 0).copy(m2).mul(mat4(x, 0, 1.24)), 0.12, 2.3, 0.08, uo(), uo());
            B('metalPaintGreen').addBox(mat4(0, 0, 0).copy(m2).mul(mat4(x, 0, -1.24)), 0.12, 2.3, 0.08, uo(), uo());
        }
        out.statics.push(addStatic(app, 'container2', -23.4, 3.95, 12.6, 6.1, 2.6, 2.45, 13));
    }
    // 2. pitched-roof shed
    {
        const bx = 28, bz = -16;
        B(C).addBox(mat4(bx, 2.5, bz, 0, -12, 0), 8, 5, 6, uo(), uo());
        for (const s of [-1, 1]) {
            B('metalPaint').addBox(mat4(bx, 5.55, bz, 0, -12, 0).mul(mat4(0, 0.3, s * 1.65, s * 20, 0, 0)), 8.6, 0.16, 3.6, uo(), uo());
        }
        B('metalPaint').addBox(mat4(bx, 2.1, bz, 0, -12, 0).mul(mat4(-1.4, 0, 3.05)), 1.6, 4.0, 0.14, uo(), uo());
        out.statics.push(addStatic(app, 'shed', bx, 2.5, bz, 8, 5, 6, -12));
    }
    // 3. small plant house
    {
        const bx = -20, bz = -23;
        B(C).addBox(mat4(bx, 1.55, bz, 0, 28, 0), 3.6, 3.1, 3.2, uo(), uo());
        B('metalPaint').addBox(mat4(bx, 3.22, bz, 0, 28, 0), 4.0, 0.2, 3.6, uo(), uo());
        B('metalPaint').addCylinder(mat4(bx + 1.0, 4.0, bz + 0.6), 0.22, 0.22, 1.6, 12, true, uo(), uo());
        out.statics.push(addStatic(app, 'plant', bx, 1.55, bz, 3.6, 3.1, 3.2, 28));
    }

    // ------------------------------------------------------------ fence
    {
        const L = 38, seg = 2.6, postH = 2.35;
        const runs = [
            { ax: 'x', z: -L, from: -L, to: L },
            { ax: 'x', z: L, from: -L, to: L },
            { ax: 'z', x: -L, from: -L, to: L },
            { ax: 'z', x: L, from: -L, to: L }
        ];
        let segCount = 0;
        for (const run of runs) {
            const n = Math.round((run.to - run.from) / seg);
            for (let i = 0; i < n; i++) {
                const t0 = run.from + i * seg, t1 = t0 + seg, tm = (t0 + t1) / 2;
                // gate gap on the +Z run
                if (run.ax === 'x' && run.z === L && Math.abs(tm) < 4.2) continue;
                segCount++;
                const px = run.ax === 'x' ? tm : run.x;
                const pz = run.ax === 'x' ? run.z : tm;
                const rot = run.ax === 'x' ? 0 : 90;
                B('metalPaint').addCylinder(mat4(px - (run.ax === 'x' ? seg / 2 : 0), postH / 2, pz - (run.ax === 'z' ? seg / 2 : 0)), 0.055, 0.055, postH, 6, false, uo(), uo());
                B('metalPaint').addBox(mat4(px, postH - 0.08, pz, 0, rot, 0), seg, 0.07, 0.07, uo(), uo());
                B('metalPaint').addBox(mat4(px, 0.22, pz, 0, rot, 0), seg, 0.05, 0.05, uo(), uo());
                const gb = B('chainlink');
                const base = gb.vertexCount;
                const dx = run.ax === 'x' ? seg / 2 : 0, dz = run.ax === 'z' ? seg / 2 : 0;
                const y0 = 0.22, y1 = postH - 0.1;
                const nrmX = run.ax === 'x' ? 0 : 1, nrmZ = run.ax === 'x' ? 1 : 0;
                const pts = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
                for (const [a, b] of pts) {
                    gb.pos.push(px + dx * a, b ? y1 : y0, pz + dz * a);
                    gb.nrm.push(nrmX, 0, nrmZ);
                    gb.uv.push(a * seg / 2, b ? y1 : y0);
                }
                gb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
        }
        out.fenceSegments = segCount;
        for (const [cx, cz, sx, sz] of [[0, -L, 78, 0.3], [0, L, 78, 0.3], [-L, 0, 0.3, 78], [L, 0, 0.3, 78]]) {
            out.statics.push(addStatic(app, 'fenceCol', cx, 1.2, cz, sx, 2.4, sz, 0, 0.6, 0.2));
        }
    }

    // ---------------------------------------------------------- lampposts
    {
        const positions = [];
        for (const x of [-20, 20]) for (const z of [-26, -13, 0, 13, 26]) positions.push([x, z, x > 0 ? -90 : 90]);
        positions.push([-16, 11, 90], [16, 11, -90], [-16, -11, 90], [16, -11, -90]);
        out.lampCount = positions.length;
        for (const [px, pz, yaw] of positions) {
            B('metalPaint').addCylinder(mat4(px, 0.14, pz), 0.20, 0.26, 0.28, 10, true, uo(), uo());
            B('metalPaint').addCylinder(mat4(px, 3.3, pz), 0.075, 0.105, 6.3, 10, false, uo(), uo());
            const arm = mat4(px, 6.35, pz, 0, yaw, 0);
            B('metalPaint').addBox(mat4(0, 0, 0).copy(arm).mul(mat4(0, 0.12, 0.72, -14, 0, 0)), 0.09, 0.09, 1.5, uo(), uo());
            B('metalPaint').addBox(mat4(0, 0, 0).copy(arm).mul(mat4(0, 0.30, 1.42)), 0.42, 0.20, 0.78, uo(), uo());
            B('lamp').addBox(mat4(0, 0, 0).copy(arm).mul(mat4(0, 0.185, 1.42)), 0.34, 0.05, 0.66, 0, 0);
        }
        for (const [px, pz] of [[-20, 0], [20, 0], [-16, 11], [16, -11]]) {
            const L = new pc.Entity('streetLight');
            L.setPosition(px + (px > 0 ? -1.4 : 1.4), 6.4, pz);
            L.addComponent('light', {
                type: 'omni', color: new pc.Color(1.0, 0.80, 0.52), intensity: 6,
                range: 14, castShadows: false, luminance: 16000
            });
            app.root.addChild(L);
            out.lights.push(L);
        }
    }

    // ------------------------------------------------- scattered debris
    let debris = 0;
    const inNave = (x, z) => Math.abs(x) < 12.5 && Math.abs(z) < 8.5;
    const pileZone = (x, z) => x > -3 && x < 11 && z > -1 && z < 8;
    // pallets
    for (let i = 0; i < 16; i++) {
        let x, z, guard = 0;
        do { x = R(-34, 34); z = R(-34, 34); guard++; } while (guard < 50 && (pileZone(x, z) || (Math.abs(x) < 14 && Math.abs(z) < 10 && i > 4)));
        const yaw = R(0, 360), tilt = R(-3, 3);
        const m = mat4(x, 0.075, z, tilt, yaw, R(-3, 3));
        const key = rnd() < 0.5 ? 'wood' : 'woodPale';
        for (let k = 0; k < 3; k++) B(key).addBox(mat4(0, 0, 0).copy(m).mul(mat4(0, 0, -0.45 + k * 0.45)), 1.2, 0.09, 0.12, uo(), uo());
        for (let k = 0; k < 6; k++) B(key).addBox(mat4(0, 0, 0).copy(m).mul(mat4(0, 0.09, -0.5 + k * 0.2)), 1.2, 0.045, 0.14, uo(), uo());
        debris++;
    }
    // planks
    for (let i = 0; i < 26; i++) {
        let x, z, guard = 0;
        do { x = R(-36, 36); z = R(-36, 36); guard++; } while (guard < 50 && pileZone(x, z));
        B(rnd() < 0.5 ? 'wood' : 'woodDark').addBox(mat4(x, 0.03 + rnd() * 0.04, z, R(-4, 4), R(0, 360), R(-3, 3)), R(1.1, 2.6), 0.045, R(0.12, 0.26), uo(), uo());
        debris++;
    }
    // rubble / broken concrete
    for (let i = 0; i < 34; i++) {
        let x, z, guard = 0;
        do { x = R(-36, 36); z = R(-36, 36); guard++; } while (guard < 50 && pileZone(x, z));
        const s = R(0.12, 0.42);
        B(C).addBox(mat4(x, s * 0.35, z, R(0, 360), R(0, 360), R(0, 360)), s, s * R(0.5, 0.9), s * R(0.7, 1.3), uo(), uo());
        debris++;
    }
    // bricks
    for (let i = 0; i < 14; i++) {
        const x = R(-16, 20), z = R(-20, 20);
        if (pileZone(x, z)) continue;
        B('metalPaintWarm').addBox(mat4(x, 0.05, z, 0, R(0, 360), 0), 0.24, 0.1, 0.12, uo(), uo());
        debris++;
    }
    // traffic cones
    for (let i = 0; i < 8; i++) {
        const x = R(-18, 24), z = R(2, 30);
        B('plasticOrange').addCylinder(mat4(x, 0.30, z), 0.035, 0.17, 0.58, 10, true, uo(), uo());
        B('plasticOrange').addBox(mat4(x, 0.025, z, 0, R(0, 360), 0), 0.42, 0.05, 0.42, uo(), uo());
        debris++;
    }
    // static rusty drums lying around (non-physics dressing)
    for (let i = 0; i < 9; i++) {
        const x = R(-34, 34), z = R(-34, 34);
        if (inNave(x, z)) continue;
        const lying = rnd() < 0.45;
        const m = lying ? mat4(x, 0.30, z, 0, R(0, 360), 90) : mat4(x, 0.45, z, 0, R(0, 360), 0);
        B('rust').addCylinder(m, 0.30, 0.30, 0.90, 16, true, uo(), uo());
        B('rust').addCylinder(lying ? mat4(x, 0.30, z, 0, 0, 90) : mat4(x, 0.72, z), 0.315, 0.315, 0.05, 16, true, uo(), uo());
        debris++;
    }
    out.debrisCount = debris;

    // the smoking drum (fixed position, exterior)
    out.smokeDrum = new pc.Vec3(13.5, 0.0, 18.5);
    B('rust').addCylinder(mat4(out.smokeDrum.x, 0.45, out.smokeDrum.z), 0.31, 0.31, 0.9, 18, true, uo(), uo());
    B('rust').addCylinder(mat4(out.smokeDrum.x, 0.90, out.smokeDrum.z), 0.33, 0.33, 0.04, 18, true, uo(), uo());
    B('metalPaint').addBox(mat4(out.smokeDrum.x - 0.9, 0.12, out.smokeDrum.z + 0.7, 0, 24, 0), 1.4, 0.2, 0.9, uo(), uo());
    out.statics.push(addStatic(app, 'smokeDrum', out.smokeDrum.x, 0.45, out.smokeDrum.z, 0.62, 0.9, 0.62));

    // --------------------------------------------------------- finalise
    const renderables = [];
    for (const key of Object.keys(builders)) {
        const mesh = builders[key].build(device, key !== 'chainlink' && key !== 'glass' ? true : true);
        const mat = M[key];
        if (!mat) { console.warn('missing material', key); continue; }
        const r = meshEntity(app, 'world_' + key, mesh, mat);
        if (key === 'glass') { r.meshInstance.castShadow = false; }
        renderables.push(r);
    }
    out.renderables = renderables;
    out.triangleEstimate = Object.values(builders).reduce((a, b) => a + b.idx.length / 3, 0);
    return out;
}
