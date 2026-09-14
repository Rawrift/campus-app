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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '@/core/rng';
import { clamp, damp, TAU } from '@/core/math';
import { material, emissive } from '../materials';
import { loft, shell, type Section } from './loft';
import type { EnemyVisual } from '@/sim/enemyDef';
import type { AnimState } from './character';
import { SkinBinder, type BoneSpan } from './skin';

export class EnemyRig {
  readonly root = new THREE.Group();
  /** Parts the animator rotates. Named loosely; not every plan has all of them. */
  private torso = new THREE.Bone();
  private head = new THREE.Bone();
  private armL = new THREE.Bone();
  private armR = new THREE.Bone();
  private legL = new THREE.Bone();
  private legR = new THREE.Bone();
  /*
   * Mid-limb joints.
   *
   * Every plan used to build an arm or a leg as one loft running the whole
   * length of the limb, rotating about the shoulder or hip. A limb that cannot
   * bend is the clearest possible statement that a thing is not alive -- at
   * ARPG distance a bending knee is the strongest readability cue a walking
   * creature has, and a straight one reads as a stilt. These are the elbows and
   * knees; the limb is skinned across them so it bends rather than hinging.
   */
  private foreL = new THREE.Bone();
  private foreR = new THREE.Bone();
  private shinL = new THREE.Bone();
  private shinR = new THREE.Bone();
  private eliteCrest = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private binder: SkinBinder;
  private skinned: THREE.SkinnedMesh | null = null;

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
    this.binder = new SkinBinder(this.root);
    this.build(rng);
    this.bindSkin();
    this.mergeStatic();
  }

  /**
   * Binds everything the plan submitted as skin.
   *
   * Runs after `build`, because the spans have to be measured from the bones
   * where the plan actually put them -- limb lengths and joint heights differ
   * per body plan, and a span measured before placement binds the whole limb to
   * the shoulder.
   */
  private bindSkin(): void {
    const tip = (y: number, z = 0) => new THREE.Vector3(0, y, z);
    const spans: Record<string, BoneSpan> = {
      torso: { bone: this.torso, tip: tip(0.34) },
      head: { bone: this.head, tip: tip(0.1) },
      armL: { bone: this.armL, tip: tip(this.foreL.position.y) },
      armR: { bone: this.armR, tip: tip(this.foreR.position.y) },
      foreL: { bone: this.foreL, tip: tip(this.foreL.userData.length as number ?? -0.3) },
      foreR: { bone: this.foreR, tip: tip(this.foreR.userData.length as number ?? -0.3) },
      legL: { bone: this.legL, tip: tip(this.shinL.position.y) },
      legR: { bone: this.legR, tip: tip(this.shinR.position.y) },
      shinL: { bone: this.shinL, tip: tip(this.shinL.userData.length as number ?? -0.3) },
      shinR: { bone: this.shinR, tip: tip(this.shinR.userData.length as number ?? -0.3) },
    };
    this.binder.setSkeleton(spans);
    this.skinned = this.binder.build();
    if (this.skinned) this.meshes.push(this.skinned);
  }

  /**
   * Collapses each animated group's static sub-meshes into one mesh per
   * material.
   *
   * An enemy is built from 10-20 primitives, and at one draw call each a
   * mid-size pack costs more draw calls than the entire level does. The parts
   * within a joint never move relative to each other, so they can be baked;
   * anything the animator looks up by name (glowing cores, flames, rags) is
   * left alone.
   */
  private mergeStatic(): void {
    const groups = [this.torso, this.head, this.armL, this.armR, this.legL, this.legR];
    const merged: THREE.Mesh[] = [];

    for (const group of groups) {
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of [...group.children]) {
        if (!(child instanceof THREE.Mesh)) continue;
        // Named meshes are animated individually; never fold them in.
        if (child.name) continue;
        const mat = child.material as THREE.Material;
        if (Array.isArray(child.material)) continue;
        let list = batches.get(mat);
        if (!list) { list = []; batches.set(mat, list); }
        list.push(child);
      }

      for (const [mat, meshes] of batches) {
        if (meshes.length < 2) {
          if (meshes[0]) merged.push(meshes[0]);
          continue;
        }
        const geometries = meshes.map((m) => {
          m.updateMatrix();
          const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone())
            .applyMatrix4(m.matrix);
          for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
          }
          if (!g.attributes.uv) {
            g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
          }
          return g;
        });

        const combined = mergeGeometries(geometries, false);
        if (!combined) {
          // Keep the originals rather than losing body parts.
          for (const m of meshes) merged.push(m);
          for (const g of geometries) g.dispose();
          continue;
        }
        for (const m of meshes) {
          group.remove(m);
          m.geometry.dispose();
        }
        for (const g of geometries) g.dispose();

        const mesh = new THREE.Mesh(combined, mat);
        mesh.castShadow = true;
        group.add(mesh);
        merged.push(mesh);
      }
    }

    // Anything not touched above (named meshes, nested weapon groups) keeps its
    // place in the tint list.
    for (const m of this.meshes) {
      if (m.parent && !merged.includes(m)) merged.push(m);
    }
    this.meshes = merged;
  }

  /**
   * Builds one limb as a single skinned form spanning a mid joint.
   *
   * The sections are authored exactly as before, running from the shoulder or
   * hip down to the hand or foot. What changes is that the loft is bound across
   * an elbow or knee placed partway down it, so bending the joint bends the
   * surface instead of sliding two sticks past each other.
   */
  private limb(
    rootBone: THREE.Bone, midBone: THREE.Bone, sections: Section[],
    mat: THREE.Material, names: [string, string],
    opts: { radial?: number; dome?: boolean; bendAt?: number } = {},
  ): void {
    const top = sections[0]!.y;
    const bottom = sections[sections.length - 1]!.y;
    // Elbows and knees sit a little above halfway: the upper arm is shorter
    // than the forearm, and the thigh than the shin, on nearly every animal.
    const bend = top + (bottom - top) * (opts.bendAt ?? 0.46);
    midBone.position.y = bend;
    midBone.userData.length = bottom - bend;
    rootBone.add(midBone);

    this.binder.add(
      loft(sections, {
        radialSegments: opts.radial ?? 10, smoothSteps: 3, domeEnd: opts.dome,
      }),
      rootBone, mat, [names[0], names[1], 'torso'],
    );
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
      ? material('bone', v.accent, seed + 4, { emissive: v.accent, emissiveIntensity: v.glow * 0.5 })
      : accent;

    // Which mid joint and span names belong to each limb bone. Routing through
    // this map means the seven body plans below need no edits to gain elbows
    // and knees: they already say which bone a limb hangs from.
    const limbs = new Map<THREE.Object3D, [THREE.Bone, string, string]>([
      [this.armL, [this.foreL, 'armL', 'foreL']],
      [this.armR, [this.foreR, 'armR', 'foreR']],
      [this.legL, [this.shinL, 'legL', 'shinL']],
      [this.legR, [this.shinR, 'legR', 'shinR']],
    ]);

    /**
     * Adds a lofted part. Body parts are submitted as skin rather than built as
     * meshes, so the surface stays continuous where two bones meet; a limb is
     * routed through `limb` so it bends at a mid joint instead of hinging at
     * the shoulder or hip.
     */
    const part = (
      parent: THREE.Object3D, sections: Section[], mat: THREE.Material,
      opts: { radial?: number; dome?: boolean; y?: number } = {},
    ): void => {
      const limb = limbs.get(parent);
      if (limb) {
        this.limb(parent as THREE.Bone, limb[0], sections, mat, [limb[1], limb[2]], opts);
        return;
      }
      const allowed = parent === this.head ? ['head', 'torso'] : ['torso', 'head'];
      this.binder.add(
        loft(sections, {
          radialSegments: opts.radial ?? 12, smoothSteps: 3, domeEnd: opts.dome,
        }),
        parent, mat, allowed,
        opts.y ? new THREE.Matrix4().makeTranslation(0, opts.y, 0) : undefined,
      );
    };

    switch (v.build) {
      // --- gaunt: tall, thin, long arms. Reads as "fast and fragile". -------
      case 'gaunt': {
        this.baseY = 0;
        this.torso.position.y = 1.0;
        // A starved ribcage: wide across the chest, hollow at the waist.
        part(this.torso, [
          { y: -0.34, width: 0.095, depth: 0.072, roundness: 2.9 },
          { y: -0.16, width: 0.105, depth: 0.078, roundness: 3.0 },
          { y:  0.04, width: 0.135, depth: 0.094, roundness: 3.1 },
          { y:  0.20, width: 0.128, depth: 0.086, roundness: 3.0 },
          { y:  0.30, width: 0.100, depth: 0.070, roundness: 2.8 },
        ], primary, { radial: 14 });

        this.head.position.y = 0.42;
        this.torso.add(this.head);
        part(this.head, [
          { y: -0.075, width: 0.034, depth: 0.042, roundness: 2.6, offsetZ: 0.010 },
          { y: -0.030, width: 0.058, depth: 0.068, roundness: 2.6 },
          { y:  0.030, width: 0.066, depth: 0.076, roundness: 2.4 },
          { y:  0.080, width: 0.052, depth: 0.058, roundness: 2.3, offsetZ: -0.008 },
        ], skin, { radial: 12, dome: true });

        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.13, 0.22, 0);
          this.torso.add(arm);
          part(arm, [
            { y:  0.02, width: 0.036, depth: 0.036, roundness: 2.4 },
            { y: -0.24, width: 0.026, depth: 0.026, roundness: 2.3 },
            { y: -0.52, width: 0.022, depth: 0.022, roundness: 2.2 },
            { y: -0.66, width: 0.026, depth: 0.020, roundness: 2.6 },
          ], skin, { radial: 10, dome: true });
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.075, -0.32, 0);
          this.torso.add(leg);
          part(leg, [
            { y:  0.00, width: 0.048, depth: 0.048, roundness: 2.5 },
            { y: -0.30, width: 0.034, depth: 0.036, roundness: 2.4 },
            { y: -0.62, width: 0.028, depth: 0.028, roundness: 2.3 },
          ], secondary, { radial: 10 });
        }
        break;
      }

      // --- heavy: wide, low, enormous shoulders. Reads as "do not tank this".
      case 'heavy': {
        this.torso.position.y = 1.05;
        part(this.torso, [
          { y: -0.36, width: 0.215, depth: 0.170, roundness: 3.2 },
          { y: -0.14, width: 0.250, depth: 0.195, roundness: 3.4 },
          { y:  0.10, width: 0.295, depth: 0.215, roundness: 3.5 },
          { y:  0.26, width: 0.270, depth: 0.185, roundness: 3.3 },
          { y:  0.34, width: 0.190, depth: 0.145, roundness: 3.0 },
        ], primary, { radial: 16 });

        this.head.position.y = 0.40;
        this.torso.add(this.head);
        part(this.head, [
          { y: -0.070, width: 0.070, depth: 0.078, roundness: 2.8 },
          { y: -0.010, width: 0.098, depth: 0.104, roundness: 2.7 },
          { y:  0.060, width: 0.088, depth: 0.092, roundness: 2.5 },
        ], skin, { radial: 12, dome: true });

        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.33, 0.20, 0);
          this.torso.add(arm);
          // Slab shoulders as domed shells: the defining feature of this plan.
          const pad = this.mesh(arm, shell(0.185, {
            arc: Math.PI * 0.58, thickness: 0.02, segments: 14,
            scaleX: 1.2, scaleY: 0.86, scaleZ: 1.05,
          }), accent, 0.05);
          pad.rotation.z = side * 0.12;
          part(arm, [
            { y: -0.04, width: 0.082, depth: 0.080, roundness: 2.6 },
            { y: -0.34, width: 0.064, depth: 0.062, roundness: 2.5 },
            { y: -0.58, width: 0.072, depth: 0.058, roundness: 2.9 },
          ], skin, { radial: 12, dome: true });
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.15, -0.34, 0);
          this.torso.add(leg);
          part(leg, [
            { y:  0.00, width: 0.108, depth: 0.100, roundness: 2.7 },
            { y: -0.34, width: 0.082, depth: 0.078, roundness: 2.5 },
            { y: -0.64, width: 0.070, depth: 0.070, roundness: 2.4 },
          ], secondary, { radial: 12 });
        }
        break;
      }

      // --- hunched: bent forward, head low. Reads as "was a person once". ---
      case 'hunched': {
        this.torso.position.y = 0.95;
        this.torso.rotation.x = 0.34;
        // The offsets curve the spine forward rather than just tilting a tube.
        part(this.torso, [
          { y: -0.30, width: 0.135, depth: 0.100, roundness: 3.0, offsetZ: -0.020 },
          { y: -0.12, width: 0.150, depth: 0.112, roundness: 3.1 },
          { y:  0.06, width: 0.168, depth: 0.122, roundness: 3.2, offsetZ: 0.016 },
          { y:  0.22, width: 0.145, depth: 0.104, roundness: 3.0, offsetZ: 0.030 },
          { y:  0.30, width: 0.105, depth: 0.080, roundness: 2.8, offsetZ: 0.034 },
        ], primary, { radial: 14 });

        this.head.position.set(0, 0.34, 0.075);
        this.torso.add(this.head);
        part(this.head, [
          { y: -0.070, width: 0.042, depth: 0.050, roundness: 2.6, offsetZ: 0.010 },
          { y: -0.020, width: 0.066, depth: 0.076, roundness: 2.6 },
          { y:  0.040, width: 0.070, depth: 0.078, roundness: 2.4 },
        ], skin, { radial: 12, dome: true });

        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.165, 0.16, 0.01);
          arm.rotation.x = -0.5;
          this.torso.add(arm);
          part(arm, [
            { y:  0.02, width: 0.046, depth: 0.046, roundness: 2.5 },
            { y: -0.22, width: 0.035, depth: 0.035, roundness: 2.4 },
            { y: -0.48, width: 0.034, depth: 0.026, roundness: 2.8 },
          ], skin, { radial: 10, dome: true });
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.095, -0.28, 0);
          leg.rotation.x = -0.3;
          this.torso.add(leg);
          part(leg, [
            { y:  0.00, width: 0.062, depth: 0.060, roundness: 2.5 },
            { y: -0.28, width: 0.046, depth: 0.048, roundness: 2.4 },
            { y: -0.56, width: 0.038, depth: 0.038, roundness: 2.3 },
          ], secondary, { radial: 10 });
        }
        break;
      }

      // --- quadruped: long, low, horizontal. Unmistakable from above. -------
      case 'quadruped': {
        this.torso.position.y = 0.52;
        // Swept along Z, with a deep chest and a narrow haunch.
        const body = this.mesh(this.torso, loft([
          { y: -0.46, width: 0.115, depth: 0.130, roundness: 2.8 },
          { y: -0.20, width: 0.155, depth: 0.170, roundness: 2.9 },
          { y:  0.10, width: 0.170, depth: 0.195, roundness: 3.0 },
          { y:  0.34, width: 0.140, depth: 0.150, roundness: 2.8 },
          { y:  0.50, width: 0.100, depth: 0.105, roundness: 2.6 },
        ], { radialSegments: 14, smoothSteps: 3 }), primary);
        body.rotation.x = Math.PI / 2;

        this.head.position.set(0, 0.03, 0.52);
        this.torso.add(this.head);
        // A muzzle rather than a box: tapering forward with a brow above.
        const skull = this.mesh(this.head, loft([
          { y: -0.16, width: 0.048, depth: 0.042, roundness: 2.6 },
          { y: -0.04, width: 0.078, depth: 0.075, roundness: 2.7 },
          { y:  0.10, width: 0.090, depth: 0.088, roundness: 2.8 },
          { y:  0.20, width: 0.070, depth: 0.072, roundness: 2.6 },
        ], { radialSegments: 12, smoothSteps: 3 }), skin);
        skull.rotation.x = -Math.PI / 2;
        for (const side of [-1, 1]) {
          const ear = this.mesh(this.head, loft([
            { y: 0, width: 0.026, depth: 0.014, roundness: 2.2 },
            { y: 0.07, width: 0.008, depth: 0.006, roundness: 2 },
          ], { radialSegments: 8, smoothSteps: 2 }), skin, 0.075, side * 0.05, -0.06);
          ear.rotation.z = side * 0.35;
        }

        const legs: [THREE.Bone, number, number][] = [
          [this.armL, -0.13, 0.30], [this.armR, 0.13, 0.30],
          [this.legL, -0.13, -0.30], [this.legR, 0.13, -0.30],
        ];
        for (const [leg, x, z] of legs) {
          leg.position.set(x, -0.04, z);
          this.torso.add(leg);
          part(leg, [
            { y:  0.00, width: 0.052, depth: 0.052, roundness: 2.5 },
            { y: -0.22, width: 0.032, depth: 0.032, roundness: 2.3 },
            { y: -0.46, width: 0.028, depth: 0.034, roundness: 2.6 },
          ], secondary, { radial: 9, dome: true });
        }
        // A ridge of spines so it is not just a body with legs.
        for (let i = 0; i < 6; i++) {
          const spine = this.mesh(this.torso, loft([
            { y: 0, width: 0.020, depth: 0.014, roundness: 2 },
            { y: 0.09, width: 0.003, depth: 0.002, roundness: 2 },
          ], { radialSegments: 6, smoothSteps: 2 }), accent, 0.16, 0, 0.32 - i * 0.15);
          spine.rotation.x = -0.25;
        }
        break;
      }

      // --- wisp: floating, no legs, emissive core. Reads as "not physical". -
      case 'wisp': {
        this.baseY = 0.5;
        this.torso.position.y = 1.05;
        const core = this.mesh(this.torso, new THREE.IcosahedronGeometry(0.17, 1), glowMat);
        core.name = 'core';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          const strip = this.mesh(
            this.torso,
            loft([
              { y:  0.06, width: 0.030, depth: 0.010, roundness: 2.6 },
              { y: -0.16, width: 0.044, depth: 0.012, roundness: 2.8 },
              { y: -0.44, width: 0.024, depth: 0.008, roundness: 2.4 },
            ], { radialSegments: 8, smoothSteps: 3 }),
            material('cloth', v.secondary, seed + 10 + i, { transparent: true, opacity: 0.72 }),
            -0.20, Math.cos(a) * 0.12, Math.sin(a) * 0.12,
          );
          strip.rotation.y = -a;
          strip.rotation.z = Math.cos(a) * 0.2;
        }
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.32, 18), emissive(v.accent, 0.25));
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = -0.1;
        this.torso.add(halo);
        break;
      }

      // --- tall: elongated, robed, no visible legs. Reads as "wrong". -------
      case 'tall': {
        this.torso.position.y = 1.0;
        // A robe that falls and flares, with real shoulders under it.
        part(this.torso, [
          { y:  0.34, width: 0.085, depth: 0.072, roundness: 2.8 },
          { y:  0.22, width: 0.150, depth: 0.110, roundness: 3.1 },
          { y:  0.02, width: 0.155, depth: 0.118, roundness: 3.0 },
          { y: -0.34, width: 0.190, depth: 0.150, roundness: 2.8 },
          { y: -0.72, width: 0.245, depth: 0.200, roundness: 2.6 },
        ], primary, { radial: 16 });

        this.head.position.y = 0.48;
        this.torso.add(this.head);
        part(this.head, [
          { y: -0.080, width: 0.034, depth: 0.042, roundness: 2.6, offsetZ: 0.010 },
          { y: -0.030, width: 0.056, depth: 0.066, roundness: 2.6 },
          { y:  0.030, width: 0.064, depth: 0.072, roundness: 2.4 },
          { y:  0.085, width: 0.048, depth: 0.052, roundness: 2.3, offsetZ: -0.008 },
        ], skin, { radial: 12, dome: true });

        if (v.glow) {
          const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 6), emissive(v.accent, 0.75));
          eyes.position.set(0, 0.01, 0.062);
          eyes.scale.x = 2.4;
          this.head.add(eyes);
        }
        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.145, 0.28, 0);
          this.torso.add(arm);
          part(arm, [
            { y:  0.02, width: 0.048, depth: 0.048, roundness: 2.6 },
            { y: -0.34, width: 0.034, depth: 0.034, roundness: 2.4 },
            { y: -0.66, width: 0.028, depth: 0.026, roundness: 2.4 },
            { y: -0.78, width: 0.030, depth: 0.022, roundness: 2.8 },
          ], primary, { radial: 10, dome: true });
        }
        break;
      }

      // --- armoured: the plated silhouette used by wardens and the boss. ----
      case 'armoured': {
        this.torso.position.y = 1.08;
        part(this.torso, [
          { y: -0.30, width: 0.165, depth: 0.120, roundness: 3.3 },
          { y: -0.10, width: 0.195, depth: 0.140, roundness: 3.5 },
          { y:  0.12, width: 0.215, depth: 0.150, roundness: 3.5 },
          { y:  0.28, width: 0.190, depth: 0.126, roundness: 3.3 },
          { y:  0.36, width: 0.140, depth: 0.100, roundness: 3.0 },
        ], accent, { radial: 16 });

        // A layered fauld below the waist.
        for (let i = 0; i < 3; i++) {
          const plate = this.mesh(this.torso, loft([
            { y: -0.045, width: 0.175 - i * 0.012, depth: 0.128 - i * 0.008, roundness: 3.6 },
            { y:  0.045, width: 0.182 - i * 0.012, depth: 0.134 - i * 0.008, roundness: 3.6 },
          ], { radialSegments: 14, smooth: false, capStart: false, capEnd: false }),
            accent, -0.34 - i * 0.085);
          void plate;
        }

        this.head.position.y = 0.42;
        this.torso.add(this.head);
        // A tapered great-helm whose flat faces catch the key light.
        part(this.head, [
          { y: -0.085, width: 0.070, depth: 0.076, roundness: 4.0 },
          { y: -0.010, width: 0.086, depth: 0.094, roundness: 3.6 },
          { y:  0.060, width: 0.074, depth: 0.080, roundness: 3.2 },
          { y:  0.105, width: 0.040, depth: 0.044, roundness: 2.8 },
        ], accent, { radial: 10, dome: true });
        if (v.glow) {
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.018, 0.016), emissive(v.accent, 0.7));
          visor.position.set(0, -0.005, 0.088);
          this.head.add(visor);
        }

        for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
          arm.position.set(side * 0.235, 0.20, 0);
          this.torso.add(arm);
          const pad = this.mesh(arm, shell(0.145, {
            arc: Math.PI * 0.56, thickness: 0.016, segments: 14,
            scaleX: 1.22, scaleY: 0.9, scaleZ: 1.06,
          }), accent, 0.045);
          pad.rotation.z = side * 0.14;
          part(arm, [
            { y: -0.04, width: 0.062, depth: 0.060, roundness: 2.7 },
            { y: -0.32, width: 0.050, depth: 0.048, roundness: 2.6 },
            { y: -0.56, width: 0.058, depth: 0.046, roundness: 3.0 },
          ], secondary, { radial: 12, dome: true });
        }
        for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
          leg.position.set(side * 0.125, -0.38, 0);
          this.torso.add(leg);
          part(leg, [
            { y:  0.00, width: 0.086, depth: 0.082, roundness: 2.9 },
            { y: -0.34, width: 0.066, depth: 0.064, roundness: 2.7 },
            { y: -0.62, width: 0.072, depth: 0.060, roundness: 3.0 },
          ], accent, { radial: 12, dome: true });
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
          material('bone', v.accent, seed + 73, { emissive: v.accent, emissiveIntensity: 0.7 }),
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
        // A glowing shell around the chest reads as a bright disc once bloom
        // gets hold of it, and it hides the very silhouette §22 asks an elite
        // to change. The cue is put where it cannot occlude the creature
        // instead: a ring at the feet, which is also where the player is
        // already looking for hit boxes, plus three shards orbiting the core.
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.018, 5, 28), emissive(tint, 0.5),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.88;
        ring.name = 'eliteRing';
        g.add(ring);
        for (let i = 0; i < 3; i++) {
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), mat);
          const a = (i / 3) * TAU;
          shard.position.set(Math.cos(a) * 0.34, 0.1 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.3);
          g.add(shard);
        }
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
      // The body is one skinned mesh carrying a material per submitted part.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat.emissive) continue;
        mat.emissive.setHex(colour);
        mat.emissiveIntensity = amount;
      }
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
      // The knee flexes through the swing phase and straightens to take the
      // weight. It is the cue that carries furthest: at ARPG distance a leg
      // that stays straight through a stride reads as a stilt, not a leg.
      // `shin` damps slower than `leg` so the lower limb trails the thigh.
      this.shinL.rotation.x = damp(this.shinL.rotation.x, Math.max(0, swing) * 0.85, 0.006, dt);
      this.shinR.rotation.x = damp(this.shinR.rotation.x, Math.max(0, -swing) * 0.85, 0.006, dt);
      if (this.visual.build === 'quadruped') {
        // Diagonal gait, so it does not hop like a pantomime horse.
        this.armL.rotation.x = damp(this.armL.rotation.x, swing * 0.8, k, dt);
        this.armR.rotation.x = damp(this.armR.rotation.x, -swing * 0.8, k, dt);
        // Forelegs bend the other way at the carpus, which is most of what
        // stops a four-legged walk reading as a table sliding along.
        this.foreL.rotation.x = damp(this.foreL.rotation.x, -Math.max(0, swing) * 0.7, 0.006, dt);
        this.foreR.rotation.x = damp(this.foreR.rotation.x, -Math.max(0, -swing) * 0.7, 0.006, dt);
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
      // The elbow closes hardest at the top of a wind-up and opens through the
      // strike, so the weapon travels further than the shoulder alone could
      // carry it. Damped slower than the shoulder: the forearm arrives late.
      const elbow = this.state === 'windup' ? -0.9 - 0.7 * t
        : this.state === 'strike' ? -1.2 + 1.1 * Math.min(1, t * 1.7)
        : -0.28;
      this.foreR.rotation.x = damp(this.foreR.rotation.x, elbow, 0.01, dt);
      this.foreL.rotation.x = damp(this.foreL.rotation.x, elbow * 0.4 - 0.15, 0.01, dt);
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
    const ring = this.eliteCrest.getObjectByName('eliteRing');
    if (ring) ring.rotation.z -= dt * 0.9;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
