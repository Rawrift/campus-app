/**
 * The modular character rig (§3, §7).
 *
 * The body is one `SkinnedMesh` bound to the joint hierarchy; armour, hair and
 * weapons stay rigid and parented to bones. That split is not a compromise in
 * either direction. Skin, muscle and cloth have to stretch across a bent elbow
 * or they read as two solids sliding through each other -- which, at ARPG
 * distance, is exactly what says *puppet*. A pauldron or a greave genuinely
 * does not deform, and leaving it off the skin keeps a live armour swap a
 * single `add`/`remove` with no rebinding and no chance of a new piece landing
 * on the wrong bone.
 *
 * Animation is procedural: poses are functions of a phase value, blended
 * towards over time. There are no animation files to author or ship. See
 * `pose.ts` for the joint timing that makes those poses read as weight.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { clamp, damp, lerp, TAU } from '@/core/math';
import { material } from '../materials';
import { loft, shell, type Section } from './loft';
import { SkinBinder, type BoneSpan } from './skin';
import {
  buildBelt, buildBoot, buildCloak, buildGlove, buildHelmet,
  buildLegPiece, buildShoulder, buildTorso, buildWeapon,
} from './equipment';
import type { VisualModule, VisualSpec, WeaponCategory } from '@/sim/items';
import type { BodySpec } from '@/data/archetypes.data';

export type AnimState =
  | 'idle' | 'walk' | 'run' | 'windup' | 'strike' | 'recover'
  | 'cast' | 'hit' | 'death' | 'dodge';

interface Bones {
  hips: THREE.Bone;
  spine: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  shoulderL: THREE.Bone; shoulderR: THREE.Bone;
  upperArmL: THREE.Bone; upperArmR: THREE.Bone;
  forearmL: THREE.Bone; forearmR: THREE.Bone;
  handL: THREE.Bone; handR: THREE.Bone;
  thighL: THREE.Bone; thighR: THREE.Bone;
  shinL: THREE.Bone; shinR: THREE.Bone;
  footL: THREE.Bone; footR: THREE.Bone;
}

const SEG = {
  hipHeight: 0.93,
  spine: 0.13,
  chest: 0.22,
  neck: 0.17,
  upperArm: 0.27,
  forearm: 0.25,
  thigh: 0.44,
  shin: 0.42,
} as const;

function bone(parent: THREE.Object3D, y = 0, x = 0, z = 0): THREE.Bone {
  const g = new THREE.Bone();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly bones: Bones;
  /** Equipment groups currently attached, keyed by module. */
  private attached = new Map<VisualModule, THREE.Object3D[]>();
  private cloakSegments: THREE.Object3D[] = [];
  private bodyParts: THREE.Mesh[] = [];

  // --- animation state ---------------------------------------------------
  private phase = 0;
  private state: AnimState = 'idle';
  /** 0..1 progress through a one-shot action, driven externally. */
  private actionT = 0;
  private blend = 0;
  private hitTimer = 0;
  private deathT = 0;
  /** Per-character offset so a crowd does not breathe in unison. */
  private readonly offset: number;
  private lastPos = new THREE.Vector3();
  private cloakVelocity = new THREE.Vector3();

  constructor(readonly body: BodySpec, seed: number) {
    const rng = new Rng(seed);
    this.offset = rng.range(0, TAU);

    const skin = material('skin', body.skin, seed);
    const cloth = material('cloth', body.clothPrimary, seed + 1);
    const cloth2 = material('cloth', body.clothSecondary, seed + 2);
    const hair = material('cloth', body.hair, seed + 3, { roughness: 0.95 });

    const scale = body.scale;
    this.root.scale.setScalar(scale);

    // --- skeleton --------------------------------------------------------
    const hips = bone(this.root, SEG.hipHeight);
    const spine = bone(hips, SEG.spine);
    const chest = bone(spine, SEG.chest);
    const neck = bone(chest, SEG.neck);
    const head = bone(neck, 0.1);

    const shoulderX = 0.185 * body.shoulderWidth;
    const shoulderL = bone(chest, 0.1, -shoulderX);
    const shoulderR = bone(chest, 0.1, shoulderX);
    const upperArmL = bone(shoulderL, -0.05);
    const upperArmR = bone(shoulderR, -0.05);
    const forearmL = bone(upperArmL, -SEG.upperArm);
    const forearmR = bone(upperArmR, -SEG.upperArm);
    const handL = bone(forearmL, -SEG.forearm);
    const handR = bone(forearmR, -SEG.forearm);

    const hipX = 0.105;
    const thighL = bone(hips, -0.03, -hipX);
    const thighR = bone(hips, -0.03, hipX);
    const shinL = bone(thighL, -SEG.thigh);
    const shinR = bone(thighR, -SEG.thigh);
    const footL = bone(shinL, -SEG.shin);
    const footR = bone(shinR, -SEG.shin);

    this.bones = {
      hips, spine, chest, neck, head,
      shoulderL, shoulderR, upperArmL, upperArmR, forearmL, forearmR, handL, handR,
      thighL, thighR, shinL, shinR, footL, footR,
    };

    // --- body meshes -----------------------------------------------------
    const limb = body.limbThickness;
    const shoulders = body.shoulderWidth;
    const torsoDepth = body.torsoDepth;

    // Every bone, with the segment it deforms. A bone alone is a point and a
    // point has no length to fall off along, so binding to points pinches each
    // limb in the middle; the segment runs to wherever the limb actually ends.
    const tip = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
    const spans: Record<string, BoneSpan> = {
      hips: { bone: hips, tip: tip(0, SEG.spine, 0) },
      spine: { bone: spine, tip: tip(0, SEG.chest, 0) },
      chest: { bone: chest, tip: tip(0, SEG.neck, 0) },
      neck: { bone: neck, tip: tip(0, 0.12, 0) },
      head: { bone: head, tip: tip(0, 0.11, 0) },
      shoulderL: { bone: shoulderL, tip: tip(0, -0.06, 0) },
      shoulderR: { bone: shoulderR, tip: tip(0, -0.06, 0) },
      upperArmL: { bone: upperArmL, tip: tip(0, -SEG.upperArm, 0) },
      upperArmR: { bone: upperArmR, tip: tip(0, -SEG.upperArm, 0) },
      forearmL: { bone: forearmL, tip: tip(0, -SEG.forearm, 0) },
      forearmR: { bone: forearmR, tip: tip(0, -SEG.forearm, 0) },
      handL: { bone: handL, tip: tip(0, -0.10, 0) },
      handR: { bone: handR, tip: tip(0, -0.10, 0) },
      thighL: { bone: thighL, tip: tip(0, -SEG.thigh, 0) },
      thighR: { bone: thighR, tip: tip(0, -SEG.thigh, 0) },
      shinL: { bone: shinL, tip: tip(0, -SEG.shin, 0) },
      shinR: { bone: shinR, tip: tip(0, -SEG.shin, 0) },
      footL: { bone: footL, tip: tip(0, -0.03, 0.12) },
      footR: { bone: footR, tip: tip(0, -0.03, 0.12) },
    };
    const binder = new SkinBinder(this.root);
    binder.setSkeleton(spans);

    /**
     * Submits one body part. `allowed` is the short list of bones the part may
     * bind to -- the joints it spans plus their neighbours. Restricting it is
     * what stops a vertex on one thigh picking up weight from the other, which
     * generic nearest-bone weighting cannot know not to do.
     */
    const add = (
      parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
      allowed: string[], transform?: THREE.Matrix4,
    ) => binder.add(geo, parent, mat, allowed, transform);

    /**
     * Sections are authored as a handful of keys and splined into a smooth
     * form. The bulges are anatomical, not decorative: a deltoid at the top of
     * the upper arm, a calf belly a third of the way down the shin. They are
     * what stop a limb reading as a cylinder from the ARPG camera.
     */
    const limbSections = (keys: Section[], thickness: number): Section[] =>
      keys.map((k) => ({
        ...k,
        width: k.width * thickness,
        depth: (k.depth ?? k.width) * thickness,
      }));

    // --- torso: a rounded box that narrows at the waist and flares at the
    //     chest. Superellipse roundness near 3 reads as a ribcage; a plain
    //     ellipse reads as a barrel and a box reads as a crate.
    add(chest, loft([
      { y: -0.32, width: 0.130 * shoulders, depth: 0.092 * torsoDepth, roundness: 3.0 },
      { y: -0.20, width: 0.140 * shoulders, depth: 0.100 * torsoDepth, roundness: 3.1 },
      { y: -0.08, width: 0.163 * shoulders, depth: 0.116 * torsoDepth, roundness: 3.2 },
      { y:  0.05, width: 0.182 * shoulders, depth: 0.126 * torsoDepth, roundness: 3.3 },
      { y:  0.15, width: 0.190 * shoulders, depth: 0.118 * torsoDepth, roundness: 3.4 },
      { y:  0.23, width: 0.168 * shoulders, depth: 0.100 * torsoDepth, roundness: 3.2 },
    ], { radialSegments: 16, smoothSteps: 3 }), cloth,
      ['chest', 'spine', 'neck', 'shoulderL', 'shoulderR']);

    // The hips, as a separate form so the waist has a real join.
    add(hips, loft([
      { y: -0.12, width: 0.118, depth: 0.092 * torsoDepth, roundness: 3.0 },
      { y: -0.02, width: 0.132, depth: 0.100 * torsoDepth, roundness: 3.1 },
      { y:  0.08, width: 0.126, depth: 0.094 * torsoDepth, roundness: 3.0 },
    ], { radialSegments: 14, smoothSteps: 3 }), cloth2,
      ['hips', 'spine', 'thighL', 'thighR']);

    // --- neck and head ---------------------------------------------------
    add(neck, loft([
      { y: -0.01, width: 0.050, depth: 0.048, roundness: 2.4 },
      { y:  0.06, width: 0.046, depth: 0.046, roundness: 2.3 },
      { y:  0.11, width: 0.050, depth: 0.050, roundness: 2.3 },
    ], { radialSegments: 12, smoothSteps: 2 }), skin, ['neck', 'chest', 'head']);

    // A skull with a jaw, a brow and a cranium, rather than a sphere. The
    // slight forward offset through the middle sections gives it a face.
    add(head, loft([
      { y: -0.095, width: 0.044, depth: 0.052, roundness: 2.6, offsetZ: 0.012 },
      { y: -0.060, width: 0.066, depth: 0.076, roundness: 2.7, offsetZ: 0.010 },
      { y: -0.020, width: 0.079, depth: 0.089, roundness: 2.6, offsetZ: 0.006 },
      { y:  0.020, width: 0.084, depth: 0.092, roundness: 2.5 },
      { y:  0.065, width: 0.082, depth: 0.088, roundness: 2.4, offsetZ: -0.004 },
      { y:  0.100, width: 0.070, depth: 0.074, roundness: 2.3, offsetZ: -0.008 },
    ], { radialSegments: 16, smoothSteps: 3, domeEnd: true }), skin, ['head', 'neck']);

    // Hair as a shell over the cranium: it has a rim and a parting line, which
    // a scaled sphere does not.
    add(head, shell(0.098, {
      arc: Math.PI * 0.52, thickness: 0.016, segments: 14,
      scaleX: 0.92, scaleY: 1.05, scaleZ: 1.0,
    }), hair, ['head'], new THREE.Matrix4().makeTranslation(0, 0.036, -0.006));

    // --- arms -------------------------------------------------------------
    const upperArmKeys: Section[] = [
      { y:  0.010, width: 0.056, depth: 0.054, roundness: 2.5 },
      { y: -0.060, width: 0.053, depth: 0.051, roundness: 2.4 },
      { y: -0.150, width: 0.045, depth: 0.044, roundness: 2.3 },
      { y: -0.250, width: 0.040, depth: 0.039, roundness: 2.3 },
    ];
    const forearmKeys: Section[] = [
      { y:  0.005, width: 0.041, depth: 0.040, roundness: 2.3 },
      { y: -0.070, width: 0.043, depth: 0.041, roundness: 2.3 },
      { y: -0.175, width: 0.033, depth: 0.032, roundness: 2.2 },
      { y: -0.245, width: 0.029, depth: 0.028, roundness: 2.2 },
    ];

    const scaled = (v: number) => new THREE.Matrix4().makeScale(v, v, v);

    for (const [upper, fore, hand, side] of [
      [upperArmL, forearmL, handL, 'L'], [upperArmR, forearmR, handR, 'R'],
    ] as const) {
      add(upper, loft(limbSections(upperArmKeys, limb), { radialSegments: 12, smoothSteps: 3 }),
        cloth, [`upperArm${side}`, `shoulder${side}`, `forearm${side}`, 'chest']);
      add(fore, loft(limbSections(forearmKeys, limb), { radialSegments: 12, smoothSteps: 3 }),
        skin, [`forearm${side}`, `upperArm${side}`, `hand${side}`]);
      // The hand: a flattened rounded box with a thumb mass, sized so a weapon
      // grip reads against it (§3 asks for hands big enough to read weapons).
      add(hand, loft([
        { y:  0.00, width: 0.032, depth: 0.022, roundness: 3.0 },
        { y: -0.045, width: 0.037, depth: 0.024, roundness: 3.2 },
        { y: -0.095, width: 0.033, depth: 0.021, roundness: 3.0 },
      ], { radialSegments: 10, smoothSteps: 3, domeEnd: true }),
        skin, [`hand${side}`, `forearm${side}`], scaled(limb));
    }

    // --- legs -------------------------------------------------------------
    const thighKeys: Section[] = [
      { y:  0.000, width: 0.083, depth: 0.081, roundness: 2.6 },
      { y: -0.090, width: 0.080, depth: 0.078, roundness: 2.5 },
      { y: -0.280, width: 0.064, depth: 0.062, roundness: 2.4 },
      { y: -0.430, width: 0.055, depth: 0.054, roundness: 2.4 },
    ];
    const shinKeys: Section[] = [
      { y:  0.000, width: 0.057, depth: 0.056, roundness: 2.4 },
      { y: -0.090, width: 0.060, depth: 0.062, roundness: 2.4, offsetZ: -0.008 },
      { y: -0.280, width: 0.038, depth: 0.038, roundness: 2.3 },
      { y: -0.410, width: 0.033, depth: 0.033, roundness: 2.3 },
    ];
    const bootMat = material('leather', 0x3f3025, seed + 5);

    // The foot is swept along Z, so it is authored upright and laid down here.
    const shoeTransform = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -0.028, 0.012),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      new THREE.Vector3(limb, limb, limb),
    );

    for (const [thigh, shin, foot, side] of [
      [thighL, shinL, footL, 'L'], [thighR, shinR, footR, 'R'],
    ] as const) {
      add(thigh, loft(limbSections(thighKeys, limb), { radialSegments: 12, smoothSteps: 3 }),
        cloth2, [`thigh${side}`, 'hips', `shin${side}`]);
      add(shin, loft(limbSections(shinKeys, limb), { radialSegments: 12, smoothSteps: 3 }),
        cloth2, [`shin${side}`, `thigh${side}`, `foot${side}`]);
      // A foot shape with an arch and a toe, swept along Z rather than Y.
      add(foot, loft([
        { y: -0.100, width: 0.040, depth: 0.030, roundness: 3.2 },
        { y: -0.030, width: 0.047, depth: 0.036, roundness: 3.4 },
        { y:  0.050, width: 0.046, depth: 0.030, roundness: 3.4 },
        { y:  0.110, width: 0.036, depth: 0.022, roundness: 3.0 },
      ], { radialSegments: 10, smoothSteps: 3, domeEnd: true }),
        bootMat, [`foot${side}`, `shin${side}`], shoeTransform);
    }

    const skinned = binder.build();
    if (skinned) this.bodyParts.push(skinned);
  }

  // --- equipment ---------------------------------------------------------

  /**
   * Attaches (or clears) a visual module. Passing `null` removes whatever is
   * there, which is what an unequip does.
   */
  setModule(module: VisualModule, spec: VisualSpec | null, seed: number, category?: WeaponCategory): void {
    if (module === 'none') return;

    // Remove the previous pieces and free their geometry.
    for (const obj of this.attached.get(module) ?? []) {
      obj.parent?.remove(obj);
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.attached.delete(module);
    if (module === 'cloak') this.cloakSegments = [];
    if (!spec) return;

    const added: THREE.Object3D[] = [];
    const attach = (target: THREE.Object3D, obj: THREE.Object3D) => {
      obj.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      target.add(obj);
      added.push(obj);
    };

    switch (module) {
      case 'helmet':
        attach(this.bones.head, buildHelmet(spec, seed));
        break;

      case 'torsoArmour':
        attach(this.bones.chest, buildTorso(spec, seed));
        break;

      // Symmetric modules are built twice and mirrored, so a left pauldron is
      // not a mirrored *instance* sharing a transform with the right one.
      case 'shoulders':
        for (const [b, side] of [[this.bones.shoulderL, -1], [this.bones.shoulderR, 1]] as const) {
          const piece = buildShoulder(spec, seed, side);
          piece.position.set(side * 0.06, 0.03, 0);
          attach(b, piece);
        }
        break;

      case 'gloves':
        for (const b of [this.bones.handL, this.bones.handR]) {
          const piece = buildGlove(spec, seed);
          piece.position.y = -0.03;
          attach(b, piece);
        }
        break;

      case 'belt':
        attach(this.bones.hips, buildBelt(spec, seed));
        break;

      case 'legs':
        for (const b of [this.bones.thighL, this.bones.thighR]) {
          const piece = buildLegPiece(spec, seed);
          piece.position.y = -SEG.thigh / 2;
          attach(b, piece);
        }
        break;

      case 'boots':
        for (const b of [this.bones.footL, this.bones.footR]) {
          const piece = buildBoot(spec, seed);
          piece.position.y = -0.02;
          attach(b, piece);
        }
        break;

      case 'cloak': {
        const { group, segments } = buildCloak(spec, seed);
        this.cloakSegments = segments;
        attach(this.bones.chest, group);
        break;
      }

      case 'mainHand': {
        const weapon = buildWeapon(category ?? 'sword', spec, seed);
        // Held in the fist, angled slightly forward so the blade is readable
        // from the isometric camera rather than foreshortened into a dot.
        weapon.position.set(0, -0.06, 0.02);
        weapon.rotation.x = -0.25;
        attach(this.bones.handR, weapon);
        break;
      }

      case 'offHand': {
        const isShield = category === 'shield';
        const piece = buildWeapon(category ?? 'shield', spec, seed + 99);
        if (isShield) {
          // Strapped across the forearm, facing outward.
          piece.position.set(-0.08, -0.1, 0.04);
          piece.rotation.set(0.15, 0.3, 0.1);
        } else {
          piece.position.set(0, -0.06, 0.02);
          piece.rotation.x = -0.25;
        }
        attach(this.bones.handL, piece);
        break;
      }
    }
    this.attached.set(module, added);
  }

  /** Tints every body mesh, used for the damage flash and elite auras (§8). */
  setTint(colour: number, amount: number): void {
    for (const mesh of this.bodyParts) {
      // The body is one skinned mesh carrying a material per submitted part,
      // so what used to be one material per mesh is now an array.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat.emissive) continue;
        mat.emissive.setHex(colour);
        mat.emissiveIntensity = amount;
      }
    }
  }

  // --- animation ---------------------------------------------------------

  setState(state: AnimState): void {
    if (this.state === state) return;
    // Re-entering an action restarts its progress; looping states keep phase.
    if (state === 'windup' || state === 'strike' || state === 'cast' || state === 'dodge') {
      this.actionT = 0;
    }
    if (state === 'hit') this.hitTimer = 0.28;
    this.state = state;
    this.blend = 0;
  }

  get currentState(): AnimState {
    return this.state;
  }

  /**
   * Advances the animation.
   * @param speed planar movement speed in world units/second
   * @param actionProgress 0..1 through the current committed action, if any
   */
  update(dt: number, speed: number, actionProgress = 0): void {
    const b = this.bones;
    this.blend = Math.min(1, this.blend + dt * 9);
    this.actionT = actionProgress;
    if (this.hitTimer > 0) this.hitTimer -= dt;

    // Stride frequency follows actual speed, so the feet never skate (§7).
    const stride = clamp(speed / 4.4, 0, 2.2);
    this.phase += dt * (2.4 + stride * 5.2);
    const p = this.phase + this.offset;

    const isMoving = speed > 0.35;
    const swing = Math.sin(p) * clamp(stride, 0.15, 1.3);
    const bob = Math.abs(Math.sin(p)) * 0.035 * stride;
    const breathe = Math.sin(p * 0.32) * 0.018;

    // --- base locomotion pose --------------------------------------------
    /*
     * A walk is not legs swinging under a static torso. The pelvis carries the
     * body's mass over one foot at a time: it shifts sideways onto the standing
     * leg, drops on the side with nothing under it, and twists -- and the
     * shoulders twist *against* it, harder than the pelvis does, which is what
     * makes the arms swing rather than being swung. Those three, plus the
     * two-footfalls-per-cycle bob, are most of what reads as a person walking.
     */
    const stance = Math.sin(p);
    let targets = {
      hipsY: SEG.hipHeight - (isMoving ? bob : 0) + (isMoving ? 0 : breathe),
      hipsRot: isMoving ? stance * 0.13 : 0,
      hipsShift: isMoving ? -stance * 0.026 * clamp(stride, 0.2, 1) : 0,
      hipsTilt: isMoving ? stance * 0.055 * clamp(stride, 0.2, 1) : 0,
      spineX: isMoving ? 0.12 + stride * 0.07 : 0.03,
      chestRot: isMoving ? -stance * 0.22 : Math.sin(p * 0.3) * 0.02,
      headX: isMoving ? -0.06 : Math.sin(p * 0.27) * 0.03,
      armLX: isMoving ? swing * 1.05 : 0.12 + Math.sin(p * 0.3) * 0.03,
      armRX: isMoving ? -swing * 1.05 : 0.12 - Math.sin(p * 0.3) * 0.03,
      // Arms tuck in as the pace picks up rather than staying splayed.
      armSpread: isMoving ? 0.16 - clamp(stride, 0, 1) * 0.05 : 0.1,
      foreL: isMoving ? -0.35 - Math.max(0, swing) * 0.45 : -0.25,
      foreR: isMoving ? -0.35 - Math.max(0, -swing) * 0.45 : -0.25,
      thighL: isMoving ? -swing * 0.95 : 0,
      thighR: isMoving ? swing * 0.95 : 0,
      shinL: isMoving ? Math.max(0, swing) * 0.9 : 0.04,
      shinR: isMoving ? Math.max(0, -swing) * 0.9 : 0.04,
      footL: isMoving ? -Math.max(0, swing) * 0.35 : 0,
      footR: isMoving ? -Math.max(0, -swing) * 0.35 : 0,
    };

    // --- action overlays --------------------------------------------------
    const t = clamp(this.actionT, 0, 1);
    switch (this.state) {
      case 'windup': {
        // Wind the weapon back and rotate the torso away: the anticipation
        // that makes the strike land (§8).
        const w = Math.pow(t, 0.7);
        targets = {
          ...targets,
          spineX: -0.12 * w,
          chestRot: 0.55 * w,
          armRX: -1.5 * w - 0.2,
          armLX: 0.5 * w,
          foreR: -1.1 * w - 0.2,
          armSpread: 0.3 * w + 0.1,
          headX: -0.12 * w,
          thighL: -0.15 * w, thighR: 0.1 * w,
        };
        break;
      }
      case 'strike': {
        // Whip through, then overshoot slightly. The pose leads the damage.
        const s = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
        targets = {
          ...targets,
          spineX: 0.3 * s,
          chestRot: lerp(0.55, -0.7, s),
          armRX: lerp(-1.7, 1.0, s),
          armLX: lerp(0.5, -0.3, s),
          foreR: lerp(-1.3, -0.1, s),
          armSpread: 0.35,
          headX: 0.12 * s,
          thighL: 0.25 * s, thighR: -0.18 * s,
        };
        break;
      }
      case 'recover': {
        // Settle back: weight shifts, weapon drops. Never an instant reset.
        const r = 1 - Math.pow(1 - t, 2);
        targets = {
          ...targets,
          spineX: lerp(0.3, 0.04, r),
          chestRot: lerp(-0.7, 0, r),
          armRX: lerp(1.0, 0.12, r),
          armLX: lerp(-0.3, 0.12, r),
          foreR: lerp(-0.1, -0.25, r),
          thighL: lerp(0.25, 0, r), thighR: lerp(-0.18, 0, r),
        };
        break;
      }
      case 'cast': {
        // Both hands forward and up, weight back — legible as "not a swing".
        const c = Math.sin(Math.min(1, t * 1.3) * Math.PI);
        targets = {
          ...targets,
          spineX: -0.18 * c,
          armRX: -1.1 - 0.5 * c,
          armLX: -0.8 - 0.4 * c,
          foreR: -0.4 - 0.3 * c,
          foreL: -0.4 - 0.3 * c,
          armSpread: 0.22 + c * 0.18,
          headX: -0.14 * c,
        };
        break;
      }
      case 'dodge': {
        const d = Math.sin(Math.min(1, t) * Math.PI);
        targets = {
          ...targets,
          hipsY: SEG.hipHeight - 0.22 * d,
          spineX: 0.5 * d,
          thighL: -1.1 * d, thighR: -0.8 * d,
          shinL: 1.5 * d, shinR: 1.2 * d,
          armLX: -0.6 * d, armRX: -0.4 * d,
        };
        break;
      }
      case 'death': {
        // Collapse: the whole rig folds and the root tips over.
        this.deathT = Math.min(1, this.deathT + dt * 1.6);
        const k = this.deathT;
        const fall = k * k;
        this.root.rotation.x = -Math.PI * 0.44 * fall;
        this.root.position.y = -0.42 * fall * this.body.scale;
        targets = {
          ...targets,
          hipsY: SEG.hipHeight - 0.35 * fall,
          spineX: 0.5 * fall,
          chestRot: 0.3 * fall,
          headX: 0.6 * fall,
          armLX: -0.9 * fall, armRX: -0.7 * fall,
          armSpread: 0.5 * fall,
          thighL: -0.5 * fall, thighR: -0.3 * fall,
          shinL: 0.9 * fall, shinR: 0.6 * fall,
          foreL: -0.2, foreR: -0.2, footL: 0, footR: 0, hipsRot: 0,
        };
        break;
      }
      default:
        break;
    }

    // A hit reaction is layered on top of whatever else is happening (§8).
    if (this.hitTimer > 0 && this.state !== 'death') {
      const h = this.hitTimer / 0.28;
      const recoil = Math.sin(h * Math.PI) * 0.3;
      targets.spineX -= recoil;
      targets.headX -= recoil * 0.8;
      targets.chestRot += recoil * 0.35;
    }

    /*
     * Apply, with a different stiffness per joint.
     *
     * Driving every joint towards its target at one rate is the single biggest
     * reason a procedurally posed rig reads as a puppet: everything starts and
     * stops on the same frame, so the body moves as one rigid unit that happens
     * to be hinged. Real bodies are a chain of masses. The pelvis is heavy and
     * leads; the hand at the end of an arm is light and arrives late, which is
     * what animators call follow-through and overlapping action, and it is
     * almost the whole difference.
     *
     * `damp` converges faster as `smoothing` gets smaller, so the values below
     * run from the hips (fastest, leads the motion) out to the hands and head
     * (slowest, settle last). The spread is deliberately wide -- about 4x in
     * per-frame terms -- because a narrow one is indistinguishable from one
     * rate.
     */
    const LEAD = 0.000002;   // pelvis: heaviest mass, starts first
    const SPINE = 0.00002;
    const CHEST = 0.0002;
    const LIMB = 0.0006;     // upper arm, thigh
    const JOINT = 0.004;     // forearm, shin
    const TRAIL = 0.02;      // hand, foot, head: arrive last

    const ap = (
      obj: THREE.Object3D, axis: 'x' | 'y' | 'z', target: number, k: number,
    ) => {
      obj.rotation[axis] = damp(obj.rotation[axis], target, k, dt);
    };

    b.hips.position.y = damp(b.hips.position.y, targets.hipsY, LEAD, dt);
    // Lateral weight shift onto the supporting leg. Without it a walk is a pair
    // of legs swinging under a torso that never commits to either foot.
    b.hips.position.x = damp(b.hips.position.x, targets.hipsShift, SPINE, dt);
    ap(b.hips, 'y', targets.hipsRot, LEAD);
    // Pelvic drop on the swing side: the hip that has no weight under it falls.
    ap(b.hips, 'z', targets.hipsTilt, SPINE);
    ap(b.spine, 'x', targets.spineX, SPINE);
    ap(b.chest, 'y', targets.chestRot, CHEST);
    ap(b.head, 'x', targets.headX, TRAIL);
    // The head counter-rotates against the chest so it keeps facing the way the
    // character is going rather than swinging with the shoulders.
    ap(b.neck, 'y', -targets.chestRot * 0.55, TRAIL);

    ap(b.upperArmL, 'x', targets.armLX, LIMB);
    ap(b.upperArmR, 'x', targets.armRX, LIMB);
    ap(b.upperArmL, 'z', targets.armSpread, LIMB);
    ap(b.upperArmR, 'z', -targets.armSpread, LIMB);
    ap(b.forearmL, 'x', targets.foreL, JOINT);
    ap(b.forearmR, 'x', targets.foreR, JOINT);
    ap(b.handL, 'x', targets.foreL * 0.22, TRAIL);
    ap(b.handR, 'x', targets.foreR * 0.22, TRAIL);

    ap(b.thighL, 'x', targets.thighL, LIMB);
    ap(b.thighR, 'x', targets.thighR, LIMB);
    ap(b.shinL, 'x', targets.shinL, JOINT);
    ap(b.shinR, 'x', targets.shinR, JOINT);
    ap(b.footL, 'x', targets.footL, TRAIL);
    ap(b.footR, 'x', targets.footR, TRAIL);

    this.updateCloak(dt);
  }

  /**
   * Trails the cloak behind the character.
   *
   * Each segment lags the one above it, driven by how fast the root is moving.
   * §2 asks for cloth with movement; this is the cheapest way to get it that
   * still reads as fabric rather than as a rigid board.
   */
  private updateCloak(dt: number): void {
    if (this.cloakSegments.length === 0) return;

    const pos = new THREE.Vector3();
    this.root.getWorldPosition(pos);
    const delta = pos.clone().sub(this.lastPos);
    this.lastPos.copy(pos);
    if (dt > 0) delta.divideScalar(dt);
    this.cloakVelocity.lerp(delta, clamp(dt * 6, 0, 1));

    // Convert world velocity into the character's own frame so the cloak
    // trails behind regardless of which way they are facing.
    const local = this.cloakVelocity.clone();
    const inv = new THREE.Quaternion();
    this.root.getWorldQuaternion(inv);
    local.applyQuaternion(inv.invert());

    const lean = clamp(local.z * 0.055, -0.9, 0.35);
    const sway = clamp(-local.x * 0.045, -0.5, 0.5);
    const flutter = Math.sin(this.phase * 2.1) * 0.05 * clamp(this.cloakVelocity.length() * 0.2, 0, 1);

    this.cloakSegments.forEach((seg, i) => {
      const falloff = 1 - i / (this.cloakSegments.length + 1);
      const targetX = 0.1 + lean * falloff + flutter * falloff;
      const targetZ = sway * falloff;
      seg.rotation.x = damp(seg.rotation.x, targetX, 0.0008 + i * 0.0006, dt);
      seg.rotation.z = damp(seg.rotation.z, targetZ, 0.0008 + i * 0.0006, dt);
    });
  }

  /** Frees every geometry this rig created. */
  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
