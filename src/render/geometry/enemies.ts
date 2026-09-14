/**
 * Enemy meshes (§19 silhouette, §22 elite cues).
 *
 * Seven body plans, each chosen so that it is identifiable from the ARPG camera
 * by outline alone — that is the actual design requirement, not detail. A
 * player must be able to tell a wisp from a warden at the edge of the fog and
 * react before it arrives.
 *
 * They share `CharacterRig`'s animation contract (`setState` / `update`) so the
 * scene can drive players and enemies through exactly the same code path.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { clamp, damp, TAU } from '@/core/math';
import { material, emissive } from '../materials';
import type { EnemyVisual } from '@/sim/enemyDef';
import type { AnimState } from './character';

export class EnemyRig {
  readonly root = new THREE.Group();
  /** Parts the animator rotates. Named loosely; not every plan has all of them. */
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eliteCrest = new THREE.Group();
  private meshes: THREE.Mesh[] = [];

  private phase: number;
  private state: AnimState = 'idle';
  private actionT = 0;
  private hitTimer = 0;
  private deathT = 0;
  private baseY = 0;

  constructor(readonly visual: EnemyVisual, seed: number) {
    const rng = new Rng(seed);
    this.phase = rng.range(0, TAU);
    this.root.scale.setScalar(visual.scale);
    this.root.add(this.torso);
    this.build(rng);
  }

  private mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, x = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  private build(rng: Rng): void {
    const v = this.visual;
    const seed = rng.int(0, 99999);
    const primary = material('cloth', v.primary, seed, { roughness: 0.95 });
    const secondary = material('leather', v.secondary, seed + 1);
    const skin = material('skin', v.primary, seed + 2);
    const accent = material('iron', v.accent, seed + 3);
    const glowMat = v.glow
      ? material('bone', v.accent, seed + 4, { emissive: v.accent, emissiveIntensity: v.glow * 0.85 })
      : accent;

    switch (v.build) {
      // --- gaunt: tall, thin, long arms. Reads as "fast and fragile". -------
      case 'gaunt': {
        this.baseY = 0;
        this.torso.position.y = 1.0;
        this.mesh(this.torso, new THREE.CylinderGeometry(0.13, 0.16, 0.62, 7), primary);
        this.head.position.y = 0.42;
        this.torso.add(this.head);
        const skull = this.mesh(this.head, new THREE.SphereGeometry(0.1, 9, 7), skin);
        skull.scale.set(0.82, 1.35, 0.9);
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.15, 0.24, 0);
          this.torso.add(arm);
          this.mesh(arm, new THREE.CylinderGeometry(0.035, 0.028, 0.66, 6), skin, -0.33);
          this.mesh(arm, new THREE.BoxGeometry(0.06, 0.13, 0.05), skin, -0.68);
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.08, -0.32, 0);
          this.torso.add(leg);
          this.mesh(leg, new THREE.CylinderGeometry(0.05, 0.038, 0.68, 6), secondary, -0.34);
        }
        break;
      }

      // --- heavy: wide, low, enormous shoulders. Reads as "do not tank this".
      case 'heavy': {
        this.torso.position.y = 1.05;
        const body = this.mesh(this.torso, new THREE.BoxGeometry(0.62, 0.68, 0.44), primary);
        body.geometry.translate(0, 0, 0);
        this.head.position.y = 0.38;
        this.torso.add(this.head);
        this.mesh(this.head, new THREE.SphereGeometry(0.13, 9, 7), skin).scale.set(1, 0.86, 1);
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.36, 0.2, 0);
          this.torso.add(arm);
          // Slab shoulders: the defining feature of this plan.
          this.mesh(arm, new THREE.SphereGeometry(0.2, 9, 7), accent, 0.06).scale.set(1.15, 0.9, 1.05);
          this.mesh(arm, new THREE.CylinderGeometry(0.085, 0.07, 0.56, 7), skin, -0.3);
          this.mesh(arm, new THREE.BoxGeometry(0.13, 0.15, 0.11), secondary, -0.62);
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.16, -0.36, 0);
          this.torso.add(leg);
          this.mesh(leg, new THREE.CylinderGeometry(0.11, 0.09, 0.66, 7), secondary, -0.33);
        }
        break;
      }

      // --- hunched: bent forward, head low. Reads as "was a person once". ---
      case 'hunched': {
        this.torso.position.y = 0.95;
        this.torso.rotation.x = 0.34;
        this.mesh(this.torso, new THREE.CylinderGeometry(0.17, 0.2, 0.55, 7), primary);
        this.head.position.set(0, 0.34, 0.09);
        this.torso.add(this.head);
        this.mesh(this.head, new THREE.SphereGeometry(0.11, 9, 7), skin).scale.set(0.92, 1.05, 1);
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.19, 0.18, 0);
          arm.rotation.x = -0.5;
          this.torso.add(arm);
          this.mesh(arm, new THREE.CylinderGeometry(0.045, 0.036, 0.54, 6), skin, -0.27);
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.1, -0.3, 0);
          leg.rotation.x = -0.3;
          this.torso.add(leg);
          this.mesh(leg, new THREE.CylinderGeometry(0.06, 0.048, 0.6, 6), secondary, -0.3);
        }
        break;
      }

      // --- quadruped: long, low, horizontal. Unmistakable from above. -------
      case 'quadruped': {
        this.torso.position.y = 0.52;
        const body = this.mesh(this.torso, new THREE.CylinderGeometry(0.19, 0.15, 0.86, 8), primary);
        body.rotation.x = Math.PI / 2;
        this.head.position.set(0, 0.04, 0.5);
        this.torso.add(this.head);
        this.mesh(this.head, new THREE.BoxGeometry(0.18, 0.17, 0.3), skin).scale.z = 1.1;
        this.mesh(this.head, new THREE.ConeGeometry(0.07, 0.18, 5), skin, -0.03, 0, 0.19).rotation.x = Math.PI / 2;
        // Four legs, front pair forward of the mass.
        const legs: [THREE.Group, number, number][] = [
          [this.armL, -0.15, 0.3], [this.armR, 0.15, 0.3],
          [this.legL, -0.15, -0.3], [this.legR, 0.15, -0.3],
        ];
        for (const [leg, x, z] of legs) {
          leg.position.set(x, -0.06, z);
          this.torso.add(leg);
          this.mesh(leg, new THREE.CylinderGeometry(0.045, 0.035, 0.46, 6), secondary, -0.23);
        }
        // A ridge of spines so it is not just a cylinder with legs.
        for (let i = 0; i < 5; i++) {
          this.mesh(this.torso, new THREE.ConeGeometry(0.03, 0.12, 4), accent, 0.18, 0, 0.3 - i * 0.16);
        }
        break;
      }

      // --- wisp: floating, no legs, emissive core. Reads as "not physical". -
      case 'wisp': {
        this.baseY = 0.5;
        this.torso.position.y = 1.05;
        const core = this.mesh(this.torso, new THREE.IcosahedronGeometry(0.2, 1), glowMat);
        core.name = 'core';
        // A shroud that hangs below, so it has a silhouette and not just a dot.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const strip = this.mesh(
            this.torso, new THREE.BoxGeometry(0.07, 0.5, 0.02),
            material('cloth', v.secondary, seed + 10 + i, { transparent: true, opacity: 0.72 }),
            -0.32, Math.cos(a) * 0.13, Math.sin(a) * 0.13,
          );
          strip.rotation.y = -a;
        }
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 16), emissive(v.accent, 0.35));
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = -0.1;
        this.torso.add(halo);
        break;
      }

      // --- tall: elongated, robed, no visible legs. Reads as "wrong". -------
      case 'tall': {
        this.torso.position.y = 1.0;
        // A narrower taper plus real shoulders: a plain wide cone reads as a
        // traffic cone rather than as something wearing a robe.
        const robe = this.mesh(this.torso, new THREE.CylinderGeometry(0.15, 0.29, 1.2, 9), primary);
        robe.position.y = -0.2;
        const shoulders = this.mesh(this.torso, new THREE.BoxGeometry(0.44, 0.16, 0.22), secondary, 0.3);
        shoulders.rotation.z = 0.04;
        this.head.position.y = 0.5;
        this.torso.add(this.head);
        const skull = this.mesh(this.head, new THREE.SphereGeometry(0.11, 9, 7), skin);
        skull.scale.set(0.82, 1.3, 0.85);
        if (v.glow) {
          const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), emissive(v.accent, 0.9));
          eyes.position.set(0, 0.02, 0.09);
          eyes.scale.x = 2.2;
          this.head.add(eyes);
        }
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.17, 0.3, 0);
          this.torso.add(arm);
          this.mesh(arm, new THREE.CylinderGeometry(0.04, 0.03, 0.74, 6), primary, -0.37);
          this.mesh(arm, new THREE.BoxGeometry(0.055, 0.14, 0.045), skin, -0.78);
        }
        break;
      }

      // --- armoured: the plated silhouette used by wardens and the boss. ----
      case 'armoured': {
        this.torso.position.y = 1.08;
        this.mesh(this.torso, new THREE.BoxGeometry(0.52, 0.66, 0.4), accent);
        // Layered fauld, so the outline is not a plain box.
        for (let i = 0; i < 3; i++) {
          this.mesh(this.torso, new THREE.BoxGeometry(0.5 - i * 0.03, 0.1, 0.38), accent, -0.36 - i * 0.09);
        }
        this.head.position.y = 0.42;
        this.torso.add(this.head);
        this.mesh(this.head, new THREE.SphereGeometry(0.13, 9, 7), accent).scale.set(0.95, 1.1, 1);
        this.mesh(this.head, new THREE.BoxGeometry(0.04, 0.14, 0.04), accent, -0.04, 0, 0.12);
        if (v.glow) {
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), emissive(v.accent, 0.85));
          visor.position.set(0, 0.01, 0.13);
          this.head.add(visor);
        }
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.31, 0.22, 0);
          this.torso.add(arm);
          this.mesh(arm, new THREE.SphereGeometry(0.17, 9, 7), accent, 0.04).scale.set(1.1, 0.9, 1);
          this.mesh(arm, new THREE.CylinderGeometry(0.07, 0.058, 0.54, 7), secondary, -0.28);
          this.mesh(arm, new THREE.BoxGeometry(0.11, 0.13, 0.1), accent, -0.58);
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.14, -0.4, 0);
          this.torso.add(leg);
          this.mesh(leg, new THREE.CylinderGeometry(0.09, 0.075, 0.64, 7), accent, -0.32);
        }
        break;
      }
    }

    if (v.cloth) this.addRags(v, seed);
    if (v.weapon) this.addWeapon(v, seed);
    this.torso.add(this.eliteCrest);
  }

  private addRags(v: EnemyVisual, seed: number): void {
    const mat = material('cloth', v.secondary, seed + 60, {
      transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    });
    const count = Math.round(3 + v.cloth! * 5);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const rag = this.mesh(
        this.torso, new THREE.BoxGeometry(0.1, 0.3 + v.cloth! * 0.4, 0.015), mat,
        -0.3, Math.cos(a) * 0.2, Math.sin(a) * 0.2,
      );
      rag.rotation.y = -a;
      rag.name = 'rag';
    }
  }

  private addWeapon(v: EnemyVisual, seed: number): void {
    const iron = material('iron', 0x605a52, seed + 70);
    const wood = material('wood', 0x50412c, seed + 71);
    const g = new THREE.Group();
    // Held in the right hand, pointing down-forward at rest.
    g.position.set(0, -0.62, 0.06);
    g.rotation.x = -0.35;

    switch (v.weapon) {
      case 'cleaver':
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.18, 6), wood));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.11), iron).translateY(0.22));
        break;
      case 'sword':
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 6), wood));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.46, 0.06), iron).translateY(0.3));
        break;
      case 'shield_sword': {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.42, 0.06), iron).translateY(0.26));
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.05), iron);
        shield.position.set(0, -0.1, 0.06);
        shield.rotation.set(0.2, 0.3, 0);
        this.armL.add(shield);
        this.meshes.push(shield);
        break;
      }
      case 'maul':
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.56, 6), wood).translateY(0.2));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), iron).translateY(0.5));
        break;
      case 'censer': {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), iron);
        chain.position.y = -0.17;
        g.add(chain);
        const bowl = new THREE.Mesh(
          new THREE.SphereGeometry(0.085, 8, 6),
          material('iron', 0x7a5a3a, seed + 72, { emissive: 0xd2762c, emissiveIntensity: 1.6 }),
        );
        bowl.position.y = -0.36;
        bowl.name = 'censerBowl';
        g.add(bowl);
        break;
      }
      case 'staff': {
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.95, 6), wood).translateY(0.3));
        const head = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.06, 0),
          material('bone', v.accent, seed + 73, { emissive: v.accent, emissiveIntensity: 1.8 }),
        );
        head.position.y = 0.8;
        g.add(head);
        break;
      }
      case 'bell': {
        // The boss carries the thing it is named for.
        const bell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.26, 0.34, 10, 1, true),
          material('darksteel', 0x8a7038, seed + 74, { emissive: 0xc8a349, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
        );
        bell.position.y = -0.2;
        g.add(bell);
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.6, 6), iron).translateY(0.16));
        break;
      }
      case 'claws':
        // Claws live on the hands themselves, not in a held group.
        for (const arm of [this.armL, this.armR]) {
          for (let i = -1; i <= 1; i++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.14, 4), iron);
            claw.position.set(i * 0.04, -0.68, 0.04);
            claw.rotation.x = Math.PI;
            arm.add(claw);
            this.meshes.push(claw);
          }
        }
        return;
    }
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; this.meshes.push(o); } });
    this.armR.add(g);
  }

  /**
   * Adds the geometry cue for an elite modifier.
   * §22 is explicit that an elite must not be "just a recoloured model", so
   * every modifier adds actual silhouette.
   */
  addEliteCrest(crest: string, tint: number, glow: number): void {
    const mat = material('iron', tint, Math.floor(tint), {
      emissive: glow > 0 ? tint : 0x000000, emissiveIntensity: glow,
    });
    const g = this.eliteCrest;
    switch (crest) {
      case 'spines':
        for (let i = 0; i < 7; i++) {
          const spine = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 5), mat);
          const a = (i / 7) * Math.PI - Math.PI / 2;
          spine.position.set(Math.sin(a) * 0.2, 0.3, -0.18 - Math.cos(a) * 0.05);
          spine.rotation.x = -0.5;
          spine.rotation.z = Math.sin(a) * 0.4;
          g.add(spine);
        }
        break;
      case 'plates':
        for (let i = 0; i < 4; i++) {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62 - i * 0.05, 0.1, 0.5 - i * 0.04), mat);
          plate.position.y = 0.3 - i * 0.16;
          g.add(plate);
        }
        break;
      case 'boils':
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const boil = new THREE.Mesh(new THREE.SphereGeometry(0.07 + (i % 3) * 0.02, 6, 5), mat);
          boil.position.set(Math.cos(a) * 0.26, 0.1 + Math.sin(i * 2.3) * 0.22, Math.sin(a) * 0.22);
          g.add(boil);
        }
        break;
      case 'halo': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 18), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.72;
        ring.name = 'eliteHalo';
        g.add(ring);
        break;
      }
      case 'hooks':
        for (let i = 0; i < 5; i++) {
          const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 5, 10, Math.PI * 1.4), mat);
          hook.position.set((i - 2) * 0.12, 0.34, -0.2);
          hook.rotation.x = 1.1;
          g.add(hook);
        }
        break;
      case 'core': {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), mat);
        core.position.y = 0.1;
        core.name = 'eliteCore';
        g.add(core);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), emissive(tint, 0.18));
        shell.position.y = 0.1;
        g.add(shell);
        break;
      }
    }
    g.traverse((o) => { if (o instanceof THREE.Mesh) this.meshes.push(o); });
  }

  setState(state: AnimState): void {
    if (this.state === state) return;
    if (state === 'hit') this.hitTimer = 0.24;
    this.state = state;
  }

  setTint(colour: number, amount: number): void {
    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) continue;
      mat.emissive.setHex(colour);
      mat.emissiveIntensity = amount;
    }
  }

  update(dt: number, speed: number, actionProgress = 0): void {
    this.actionT = actionProgress;
    if (this.hitTimer > 0) this.hitTimer -= dt;
    const stride = clamp(speed / 4, 0, 2);
    this.phase += dt * (2 + stride * 6);
    const p = this.phase;
    const swing = Math.sin(p) * clamp(stride, 0.12, 1.2);
    const k = 0.0006;

    // Wisps float and never walk.
    if (this.visual.build === 'wisp') {
      this.torso.position.y = damp(this.torso.position.y, 1.05 + Math.sin(p * 0.8) * 0.12, 0.002, dt);
      this.torso.rotation.y += dt * 0.6;
      const core = this.torso.getObjectByName('core');
      if (core) core.rotation.set(p * 0.4, p * 0.7, 0);
    } else {
      this.legL.rotation.x = damp(this.legL.rotation.x, -swing * 0.8, k, dt);
      this.legR.rotation.x = damp(this.legR.rotation.x, swing * 0.8, k, dt);
      if (this.visual.build === 'quadruped') {
        // Diagonal gait, so it does not hop like a pantomime horse.
        this.armL.rotation.x = damp(this.armL.rotation.x, swing * 0.8, k, dt);
        this.armR.rotation.x = damp(this.armR.rotation.x, -swing * 0.8, k, dt);
      }
      this.torso.position.y = damp(
        this.torso.position.y,
        this.baseY + (this.torso.userData.restY as number ?? this.torso.position.y),
        0.002, dt,
      );
    }

    // --- action poses -----------------------------------------------------
    const t = clamp(this.actionT, 0, 1);
    let armTarget = this.visual.build === 'quadruped' ? 0 : 0.15;
    let torsoTarget = this.visual.build === 'hunched' ? 0.34 : 0;

    if (this.state === 'windup') {
      // A long, obvious rear-back. The telegraph is the whole point (§23).
      armTarget = -1.6 * Math.pow(t, 0.6);
      torsoTarget += -0.22 * t;
    } else if (this.state === 'strike') {
      const s = Math.sin(Math.min(1, t * 1.7) * Math.PI * 0.5);
      armTarget = -1.6 + s * 2.5;
      torsoTarget += 0.3 * s;
    } else if (this.state === 'recover') {
      armTarget = 0.9 * (1 - t) + 0.15;
      torsoTarget += 0.1 * (1 - t);
    } else if (this.state === 'staggered' as AnimState) {
      torsoTarget += -0.3;
    }

    if (this.hitTimer > 0) {
      const h = this.hitTimer / 0.24;
      torsoTarget -= Math.sin(h * Math.PI) * 0.35;
    }

    if (this.state === 'death') {
      this.deathT = Math.min(1, this.deathT + dt * 1.8);
      const fall = this.deathT * this.deathT;
      this.root.rotation.x = -Math.PI * 0.46 * fall;
      this.root.position.y = -0.4 * fall * this.visual.scale;
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.5 * fall, 0.002, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, -0.8 * fall, 0.002, dt);
      this.armR.rotation.x = damp(this.armR.rotation.x, -0.6 * fall, 0.002, dt);
      return;
    }

    if (this.visual.build !== 'quadruped' && this.visual.build !== 'wisp') {
      this.armR.rotation.x = damp(this.armR.rotation.x, armTarget, k, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, armTarget * 0.45 + swing * 0.3, k, dt);
    }
    this.torso.rotation.x = damp(this.torso.rotation.x, torsoTarget, k, dt);
    this.head.rotation.x = damp(this.head.rotation.x, -torsoTarget * 0.5, k, dt);

    // Elite cues animate so they read as active, not as decoration.
    const halo = this.eliteCrest.getObjectByName('eliteHalo');
    if (halo) halo.rotation.z += dt * 1.4;
    const core = this.eliteCrest.getObjectByName('eliteCore');
    if (core) {
      core.rotation.y += dt * 1.8;
      core.scale.setScalar(1 + Math.sin(p * 3) * 0.08);
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
