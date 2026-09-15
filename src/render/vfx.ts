/**
 * Visual effects (§8, §29, §30, §39).
 *
 * Priority order from the brief is legibility first: every effect has to say
 * something about gameplay. Impacts say "that connected"; telegraphs say "move
 * now"; blood says "that hurt it". Nothing here exists to be pretty.
 *
 * Everything is pooled. A busy fight produces hundreds of particle bursts a
 * second, and allocating meshes per hit produces GC hitches exactly when the
 * game most needs to feel responsive.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { clamp } from '@/core/math';
import { radialSprite, splatSprite } from './textures';

const MAX_PARTICLES = 1200;

/**
 * How much of the pool the ambient emitter may hold at once.
 *
 * Ash is continuous and combat is bursty, so without a cap a still room fills
 * the pool and the first blow of a fight silently drops its blood and sparks.
 * The reserve is the other way round from how it reads: this is the ceiling on
 * the *ambient* share, leaving the rest always available to events.
 */
const MAX_AMBIENT = 320;
const MAX_DECALS = 90;

interface Particle {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  size: number;
  endSize: number;
  r: number; g: number; b: number;
  endR: number; endG: number; endB: number;
  gravity: number;
  drag: number;
  /** Seeded by the ambient emitter, which is capped separately. */
  ambient: boolean;
}

export type BurstKind =
  | 'sparks' | 'blood' | 'dust' | 'embers' | 'ash' | 'motes'
  | 'frost' | 'shadow' | 'lightning' | 'poison' | 'bone';

/** Per-kind tuning. Colours are start → end, so embers cool as they fall. */
const BURSTS: Record<BurstKind, {
  count: [number, number];
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  endSize: number;
  from: [number, number, number];
  to: [number, number, number];
  gravity: number;
  drag: number;
  upward: number;
}> = {
  sparks:    { count: [8, 14], speed: [3.5, 8], life: [0.18, 0.42], size: [0.05, 0.11], endSize: 0.01, from: [1.0, 0.82, 0.45], to: [0.7, 0.22, 0.08], gravity: -9, drag: 0.9, upward: 0.5 },
  blood:     { count: [10, 18], speed: [2.0, 5.5], life: [0.3, 0.7], size: [0.06, 0.15], endSize: 0.03, from: [0.30, 0.045, 0.035], to: [0.10, 0.015, 0.012], gravity: -11, drag: 0.95, upward: 0.7 },
  dust:      { count: [6, 12], speed: [0.6, 2.2], life: [0.5, 1.1], size: [0.14, 0.32], endSize: 0.5, from: [0.42, 0.38, 0.32], to: [0.3, 0.28, 0.25], gravity: 0.3, drag: 0.86, upward: 0.9 },
  embers:    { count: [6, 12], speed: [0.8, 2.6], life: [0.6, 1.4], size: [0.05, 0.1], endSize: 0.01, from: [1.0, 0.6, 0.2], to: [0.5, 0.12, 0.04], gravity: 1.4, drag: 0.92, upward: 1.0 },
  ash:       { count: [8, 16], speed: [0.4, 1.6], life: [1.0, 2.2], size: [0.05, 0.12], endSize: 0.02, from: [0.5, 0.48, 0.45], to: [0.28, 0.27, 0.26], gravity: -0.5, drag: 0.9, upward: 0.8 },
  motes:     { count: [6, 12], speed: [0.5, 2.0], life: [0.6, 1.5], size: [0.05, 0.12], endSize: 0.02, from: [0.72, 0.66, 0.9], to: [0.3, 0.26, 0.45], gravity: 0.8, drag: 0.9, upward: 1.0 },
  frost:     { count: [8, 14], speed: [1.5, 4.0], life: [0.3, 0.8], size: [0.05, 0.13], endSize: 0.01, from: [0.72, 0.88, 1.0], to: [0.3, 0.45, 0.65], gravity: -4, drag: 0.9, upward: 0.6 },
  shadow:    { count: [8, 16], speed: [1.0, 3.2], life: [0.5, 1.2], size: [0.1, 0.24], endSize: 0.3, from: [0.42, 0.34, 0.5], to: [0.1, 0.08, 0.14], gravity: 0.4, drag: 0.88, upward: 0.9 },
  lightning: { count: [8, 14], speed: [4.0, 9.0], life: [0.12, 0.3], size: [0.05, 0.12], endSize: 0.01, from: [0.78, 0.88, 1.0], to: [0.35, 0.5, 0.85], gravity: 0, drag: 0.85, upward: 0.5 },
  poison:    { count: [8, 14], speed: [0.8, 2.6], life: [0.6, 1.4], size: [0.09, 0.2], endSize: 0.28, from: [0.45, 0.58, 0.24], to: [0.2, 0.28, 0.1], gravity: 0.5, drag: 0.9, upward: 0.9 },
  bone:      { count: [6, 12], speed: [2.5, 6.0], life: [0.4, 0.9], size: [0.05, 0.12], endSize: 0.03, from: [0.82, 0.76, 0.6], to: [0.45, 0.42, 0.33], gravity: -10, drag: 0.94, upward: 0.7 },
};

export class VfxSystem {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  /** Fractional carry for the ambient emitter, so a low rate still emits. */
  private ashDebt = 0;
  private ambientLive = 0;
  private points: THREE.Points;
  private positions: Float32Array;
  private colours: Float32Array;
  private sizes: Float32Array;
  private rng = new Rng('vfx');

  /** Blood and scorch marks that persist on the floor (§30). */
  private decals: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  private decalPool: THREE.Mesh[] = [];
  private decalTextures: THREE.Texture[] = [];

  /** Telegraph rings for incoming ground attacks (§23 — always readable). */
  private telegraphs: { mesh: THREE.Mesh; life: number; maxLife: number; radius: number }[] = [];

  constructor() {
    this.group.name = 'vfx';

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false, ambient: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.1, endSize: 0.01,
        r: 1, g: 1, b: 1, endR: 1, endG: 1, endB: 1, gravity: 0, drag: 0.9,
      });
    }

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colours = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colours, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setDrawRange(0, 0);

    // A tiny custom shader is worth it here: per-particle size in world units
    // is not available from PointsMaterial, and without it every particle is
    // the same size regardless of how far the camera is.
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: radialSprite() }, uScale: { value: 620 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColour;
        uniform float uScale;
        void main() {
          vColour = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec3 vColour;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(vColour, tex.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    // Dried, not fresh: bright primary red reads as paint and fights the
    // desaturated palette the art direction is built on (§28).
    for (let i = 0; i < 4; i++) this.decalTextures.push(splatSprite(i + 1, '#3e1210'));
    this.decalTextures.push(splatSprite(90, '#1c1410'));
  }

  // --- particles ---------------------------------------------------------

  /** Spawns a burst. `power` scales count and speed for bigger hits. */
  burst(kind: BurstKind, x: number, y: number, z: number, power = 1, direction?: THREE.Vector3): void {
    const def = BURSTS[kind];
    const count = Math.round(this.rng.int(def.count[0], def.count[1]) * clamp(power, 0.4, 2.2));

    for (let i = 0; i < count; i++) {
      const p = this.particles.find((q) => !q.active);
      // Dropping a particle is far better than growing the pool mid-fight.
      if (!p) return;

      const speed = this.rng.range(def.speed[0], def.speed[1]) * clamp(power, 0.6, 1.8);
      const theta = this.rng.range(0, Math.PI * 2);
      const phi = Math.acos(this.rng.range(-1, 1));

      let vx = Math.sin(phi) * Math.cos(theta);
      let vy = Math.abs(Math.cos(phi)) * def.upward;
      let vz = Math.sin(phi) * Math.sin(theta);
      if (direction) {
        // Bias along the hit direction so blood sprays away from the blow.
        vx = vx * 0.45 + direction.x * 1.1;
        vz = vz * 0.45 + direction.z * 1.1;
      }

      p.active = true;
      p.x = x + this.rng.range(-0.1, 0.1);
      p.y = y + this.rng.range(-0.1, 0.1);
      p.z = z + this.rng.range(-0.1, 0.1);
      p.vx = vx * speed;
      p.vy = vy * speed;
      p.vz = vz * speed;
      p.maxLife = this.rng.range(def.life[0], def.life[1]);
      p.life = p.maxLife;
      p.size = this.rng.range(def.size[0], def.size[1]) * clamp(power, 0.7, 1.6);
      p.endSize = def.endSize;
      [p.r, p.g, p.b] = def.from;
      [p.endR, p.endG, p.endB] = def.to;
      p.gravity = def.gravity;
      p.drag = def.drag;
    }
  }

  /**
   * Airborne ash, seeded continuously in a volume around the camera.
   *
   * Every particle in the game so far is *caused* by something -- a blow, a
   * torch, a spell. That leaves the air itself empty, and empty air is one of
   * the quietest but most persistent tells that a scene is a diorama: nothing
   * crosses in front of anything, so the space between the camera and the
   * character reads as vacuum rather than as distance. A slow drift of ash
   * gives the volume something in it, and in a place that burned and is named
   * for a bell rung over the dead it is on-theme rather than decorative.
   *
   * Seeded in a ring rather than a disc: motes spawned right on top of the
   * camera pop in as full-size smears, which is worse than no dust at all.
   *
   * @param density motes per second; zone-authored, 0 disables
   */
  ambientAsh(
    cx: number, cz: number, density: number, dt: number,
    tint: [number, number, number],
  ): void {
    if (density <= 0) return;
    this.ashDebt += density * dt;
    while (this.ashDebt >= 1) {
      this.ashDebt -= 1;
      if (this.ambientLive >= MAX_AMBIENT) { this.ashDebt = 0; return; }
      const p = this.particles.find((q) => !q.active);
      if (!p) { this.ashDebt = 0; return; }
      p.ambient = true;
      this.ambientLive++;

      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(3.5, 13);
      p.active = true;
      p.x = cx + Math.cos(a) * r;
      p.z = cz + Math.sin(a) * r;
      // Spawned high and drifting down, so a mote's whole life is spent in the
      // part of the volume the camera actually looks through.
      p.y = this.rng.range(1.2, 4.4);
      p.vx = this.rng.range(-0.22, 0.22);
      p.vy = this.rng.range(-0.30, -0.08);
      p.vz = this.rng.range(-0.22, 0.22);
      p.maxLife = this.rng.range(3.5, 7.5);
      p.life = p.maxLife;
      // Sized to land at two or three pixels at the game's camera distance.
      // A physically honest mote is smaller than that and simply disappears,
      // which is the same as not having any.
      p.size = this.rng.range(0.055, 0.115);
      p.endSize = 0.5;
      [p.r, p.g, p.b] = tint;
      p.endR = tint[0] * 0.25;
      p.endG = tint[1] * 0.25;
      p.endB = tint[2] * 0.25;
      // Nearly weightless and heavily dragged: ash hangs, it does not fall.
      p.gravity = -0.04;
      p.drag = 0.995;
    }
  }

  /** A thin continuous emission, used for torches and burning ground. */
  emit(kind: BurstKind, x: number, y: number, z: number, rate: number, dt: number): void {
    if (this.rng.next() > rate * dt) return;
    const def = BURSTS[kind];
    const p = this.particles.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.x = x + this.rng.range(-0.12, 0.12);
    p.y = y;
    p.z = z + this.rng.range(-0.12, 0.12);
    p.vx = this.rng.range(-0.3, 0.3);
    p.vy = this.rng.range(0.5, 1.4);
    p.vz = this.rng.range(-0.3, 0.3);
    p.maxLife = this.rng.range(def.life[0], def.life[1]);
    p.life = p.maxLife;
    p.size = this.rng.range(def.size[0], def.size[1]);
    p.endSize = def.endSize;
    [p.r, p.g, p.b] = def.from;
    [p.endR, p.endG, p.endB] = def.to;
    p.gravity = def.gravity;
    p.drag = def.drag;
  }

  // --- decals ------------------------------------------------------------

  /** Leaves a mark on the ground. Fades out rather than popping (§30). */
  decal(x: number, z: number, scale = 1, scorch = false, lifetime = 26): void {
    if (this.decals.length >= MAX_DECALS) {
      const oldest = this.decals.shift();
      if (oldest) {
        this.group.remove(oldest.mesh);
        this.decalPool.push(oldest.mesh);
      }
    }

    let mesh = this.decalPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, opacity: 0.7,
          // polygonOffset stops z-fighting with the floor it lies on.
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
    }
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map = scorch
      ? this.decalTextures[this.decalTextures.length - 1]!
      : this.decalTextures[this.rng.int(0, this.decalTextures.length - 2)]!;
    mat.opacity = 0.7;
    mat.needsUpdate = true;

    const size = this.rng.range(0.8, 1.5) * scale;
    mesh.scale.set(size, size, 1);
    mesh.position.set(x, 0.03, z);
    mesh.rotation.z = this.rng.range(0, Math.PI * 2);
    this.group.add(mesh);
    this.decals.push({ mesh, life: lifetime, maxLife: lifetime });
  }

  // --- telegraphs --------------------------------------------------------

  /**
   * Draws the ground marker for an incoming attack.
   * §23 forbids unfair hits without a telegraph, so every delayed ground effect
   * gets one of these, and it fills towards the moment of impact.
   */
  telegraph(x: number, z: number, radius: number, duration: number, colour = 0xd2762c): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 28),
      new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.7,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    mesh.scale.setScalar(radius);
    this.group.add(mesh);
    this.telegraphs.push({ mesh, life: duration, maxLife: duration, radius });
  }

  // --- per-frame ---------------------------------------------------------

  update(dt: number): void {
    let write = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        if (p.ambient) { p.ambient = false; this.ambientLive--; }
        continue;
      }

      p.vy += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Particles that reach the floor stop there rather than sinking through.
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy = 0;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }

      const t = 1 - p.life / p.maxLife;
      // Fading by shrinking (not by alpha) keeps additive blending readable.
      const fade = 1 - t * t;
      this.positions[write * 3] = p.x;
      this.positions[write * 3 + 1] = p.y;
      this.positions[write * 3 + 2] = p.z;
      this.colours[write * 3] = (p.r + (p.endR - p.r) * t) * fade;
      this.colours[write * 3 + 1] = (p.g + (p.endG - p.g) * t) * fade;
      this.colours[write * 3 + 2] = (p.b + (p.endB - p.b) * t) * fade;
      this.sizes[write] = p.size + (p.endSize - p.size) * t;
      write++;
    }

    const geo = this.points.geometry;
    geo.setDrawRange(0, write);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;

    // Decals fade over their last few seconds.
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]!;
      d.life -= dt;
      const mat = d.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 * clamp(d.life / 5, 0, 1);
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        this.decalPool.push(d.mesh);
        this.decals.splice(i, 1);
      }
    }

    // Telegraphs grow and brighten as the impact approaches.
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]!;
      t.life -= dt;
      const progress = 1 - clamp(t.life / t.maxLife, 0, 1);
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + progress * 0.5;
      // The inner radius closes in: the ring "fills" towards detonation.
      t.mesh.scale.setScalar(t.radius * (0.86 + progress * 0.14));
      if (t.life <= 0) {
        this.group.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        this.telegraphs.splice(i, 1);
      }
    }
  }

  /** Active particle count, shown by the debug overlay (§55). */
  get activeParticles(): number {
    return this.particles.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  clear(): void {
    for (const p of this.particles) { p.active = false; p.ambient = false; }
    this.ambientLive = 0;
    this.ashDebt = 0;
    for (const d of this.decals) this.group.remove(d.mesh);
    this.decals.length = 0;
    for (const t of this.telegraphs) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    this.telegraphs.length = 0;
  }

  dispose(): void {
    this.clear();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const m of this.decalPool) m.geometry.dispose();
    for (const t of this.decalTextures) t.dispose();
  }
}

/** Maps a damage type onto the burst that reads correctly for it. */
export function burstForDamage(type: string): BurstKind {
  switch (type) {
    case 'fire': return 'embers';
    case 'frost': return 'frost';
    case 'lightning': return 'lightning';
    case 'poison': return 'poison';
    case 'shadow': return 'shadow';
    default: return 'blood';
  }
}
