// VFX: suspended dust motes, a continuous smoke column, impact sparks and
// explosion bursts. All driven by PlayCanvas particle systems so they are lit
// and fogged by the same scene as everything else.
import * as pc from 'playcanvas/profiler';

const C = (...k) => new pc.Curve(k);
const CS = (a, b, c) => new pc.CurveSet([a, b, c]);

function ps(app, name, pos, data) {
    const e = new pc.Entity(name);
    e.setPosition(pos.x, pos.y, pos.z);
    app.root.addChild(e);
    e.addComponent('particlesystem', data);
    return e;
}

export class Vfx {
    constructor(app, T) {
        this.app = app;
        this.T = T;

        // ---- interior dust motes (>= 400)
        this.dust = ps(app, 'dust', new pc.Vec3(0, 3.7, 0), {
            numParticles: 480,
            lifetime: 18,
            rate: 18 / 480,
            rate2: 18 / 480,
            loop: true,
            preWarm: true,
            lighting: true,
            halfLambert: true,
            intensity: 1.6,
            depthWrite: false,
            sort: pc.PARTICLESORT_NONE,
            blendType: pc.BLEND_NORMAL,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(22, 6.4, 14.4),
            initialVelocity: 0.02,
            colorMap: T.dust,
            startAngle: 0,
            startAngle2: 360,
            scaleGraph: C(0, 0.016, 0.5, 0.030, 1, 0.014),
            alphaGraph: C(0, 0, 0.18, 0.75, 0.8, 0.65, 1, 0),
            colorGraph: CS([0, 1], [0, 0.97], [0, 0.90]),
            localVelocityGraph: CS([0, -0.03, 0.5, 0.04, 1, -0.02], [0, 0.015, 0.5, 0.05, 1, 0.01], [0, 0.03, 0.5, -0.04, 1, 0.02]),
            rotationSpeedGraph: C(0, -14, 1, 14)
        });

        // ---- smoke column from an exterior drum
        this.smoke = ps(app, 'smoke', new pc.Vec3(13.5, 1.0, 18.5), {
            numParticles: 110,
            lifetime: 6.0,
            rate: 6.0 / 110,
            rate2: 6.0 / 110,
            loop: true,
            preWarm: true,
            lighting: true,
            halfLambert: true,
            intensity: 1.1,
            depthWrite: false,
            sort: pc.PARTICLESORT_DISTANCE,
            blendType: pc.BLEND_NORMAL,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.22,
            initialVelocity: 0.9,
            colorMap: T.smoke,
            startAngle: 0,
            startAngle2: 360,
            scaleGraph: C(0, 0.55, 0.25, 1.5, 1, 4.2),
            alphaGraph: C(0, 0, 0.09, 0.70, 0.55, 0.42, 1, 0),
            colorGraph: CS(
                [0, 0.30, 0.15, 0.42, 1, 0.58],
                [0, 0.27, 0.15, 0.40, 1, 0.57],
                [0, 0.25, 0.15, 0.39, 1, 0.56]),
            velocityGraph: CS([0, 0.35, 1, 1.3], [0, 2.3, 0.4, 1.5, 1, 0.9], [0, 0.15, 1, 0.55]),
            velocityGraph2: CS([0, -0.2, 1, 0.6], [0, 1.6, 1, 0.6], [0, -0.3, 1, 0.2]),
            rotationSpeedGraph: C(0, -22, 1, 22)
        });
        // a small ember glow at the drum mouth
        this.ember = ps(app, 'ember', new pc.Vec3(13.5, 0.95, 18.5), {
            numParticles: 40,
            lifetime: 1.5,
            rate: 1.5 / 40,
            rate2: 1.5 / 40,
            loop: true,
            lighting: false,
            intensity: 6,
            depthWrite: false,
            blendType: pc.BLEND_ADDITIVE,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.2,
            initialVelocity: 1.4,
            colorMap: T.spark,
            scaleGraph: C(0, 0.075, 1, 0.012),
            alphaGraph: C(0, 1, 0.6, 0.6, 1, 0),
            colorGraph: CS([0, 1, 1, 1], [0, 0.55, 1, 0.22], [0, 0.16, 1, 0.03]),
            velocityGraph: CS([0, 0.2, 1, 0.4], [0, 2.2, 1, 0.4], [0, 0.2, 1, 0.4])
        });

        // ---- spark burst pool
        this.sparks = [];
        for (let i = 0; i < 5; i++) {
            const e = ps(app, 'sparks' + i, new pc.Vec3(0, -50, 0), {
                numParticles: 80,
                lifetime: 1.0,
                rate: 0.0006,
                rate2: 0.0012,
                loop: false,
                autoPlay: false,
                lighting: false,
                intensity: 9,
                depthWrite: false,
                blendType: pc.BLEND_ADDITIVE,
                emitterShape: pc.EMITTERSHAPE_SPHERE,
                emitterRadius: 0.07,
                initialVelocity: 6.5,
                colorMap: T.spark,
                stretch: 0.22,
                alignToMotion: true,
                scaleGraph: C(0, 0.055, 1, 0.006),
                alphaGraph: C(0, 1, 0.55, 0.9, 1, 0),
                colorGraph: CS([0, 1, 1, 1], [0, 0.82, 0.5, 0.42, 1, 0.12], [0, 0.48, 0.5, 0.10, 1, 0.02]),
                velocityGraph: CS([0, 0, 1, 0], [0, 1.0, 1, -8.5], [0, 0, 1, 0]),
                velocityGraph2: CS([0, -1.5, 1, 1.5], [0, 1.6, 1, -7.0], [0, -1.5, 1, 1.5])
            });
            this.sparks.push(e);
        }
        this.sparkIdx = 0;

        // ---- explosion bursts (dust + fire)
        this.blasts = [];
        for (let i = 0; i < 3; i++) {
            const e = ps(app, 'blast' + i, new pc.Vec3(0, -50, 0), {
                numParticles: 200,
                lifetime: 2.6,
                rate: 0.0012,
                rate2: 0.004,
                loop: false,
                autoPlay: false,
                lighting: true,
                halfLambert: true,
                intensity: 1.5,
                depthWrite: false,
                sort: pc.PARTICLESORT_DISTANCE,
                blendType: pc.BLEND_NORMAL,
                emitterShape: pc.EMITTERSHAPE_SPHERE,
                emitterRadius: 1.1,
                initialVelocity: 7.5,
                colorMap: T.smoke,
                startAngle: 0,
                startAngle2: 360,
                scaleGraph: C(0, 0.5, 0.3, 2.1, 1, 3.6),
                alphaGraph: C(0, 0, 0.06, 0.92, 0.6, 0.55, 1, 0),
                colorGraph: CS(
                    [0, 1.0, 0.13, 0.85, 0.45, 0.34, 1, 0.24],
                    [0, 0.62, 0.13, 0.46, 0.45, 0.31, 1, 0.23],
                    [0, 0.22, 0.13, 0.24, 0.45, 0.28, 1, 0.22]),
                velocityGraph: CS([0, 0.6, 1, 0.1], [0, 2.6, 0.4, 1.1, 1, 0.35], [0, 0.6, 1, 0.1]),
                velocityGraph2: CS([0, -1.4, 1, -0.1], [0, 1.2, 1, 0.1], [0, -1.4, 1, -0.1])
            });
            this.blasts.push(e);
            const f = ps(app, 'fire' + i, new pc.Vec3(0, -50, 0), {
                numParticles: 120,
                lifetime: 1.1,
                rate: 0.0006,
                rate2: 0.002,
                loop: false,
                autoPlay: false,
                lighting: false,
                intensity: 14,
                depthWrite: false,
                blendType: pc.BLEND_ADDITIVE,
                emitterShape: pc.EMITTERSHAPE_SPHERE,
                emitterRadius: 0.8,
                initialVelocity: 9.0,
                colorMap: T.spark,
                scaleGraph: C(0, 0.75, 0.4, 0.42, 1, 0.05),
                alphaGraph: C(0, 1, 0.45, 0.7, 1, 0),
                colorGraph: CS([0, 1, 1, 1], [0, 0.90, 0.4, 0.45, 1, 0.10], [0, 0.62, 0.4, 0.10, 1, 0.01]),
                velocityGraph: CS([0, 0.5, 1, 0], [0, 3.0, 1, 0.4], [0, 0.5, 1, 0])
            });
            this.blasts.push(f);
        }
        this.blastIdx = 0;
    }

    sparkAt(pos, strength = 1) {
        const e = this.sparks[this.sparkIdx % this.sparks.length];
        this.sparkIdx++;
        e.setPosition(pos.x, pos.y, pos.z);
        const c = e.particlesystem;
        c.intensity = 6 + strength * 8;
        c.reset();
        c.play();
    }

    blastAt(pos) {
        // each blast uses one smoke system + one fire system (stored in pairs)
        const base = (this.blastIdx % 3) * 2;
        this.blastIdx++;
        for (let k = 0; k < 2; k++) {
            const e = this.blasts[base + k];
            e.setPosition(pos.x, pos.y, pos.z);
            e.particlesystem.reset();
            e.particlesystem.play();
        }
    }
}
