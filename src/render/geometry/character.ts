/**
 * The modular character rig (§3, §7).
 *
 * Built from nested `Group`s rather than a skinned mesh. That is a deliberate
 * trade: skinning would deform better, but this project generates *every* mesh
 * at runtime and swaps armour pieces live, and rigid segments parented to joints
 * make that swap a single `add`/`remove` with no skeleton rebinding, no weight
 * painting, and no risk of a new piece being bound to the wrong bone. At ARPG
 * camera distance the difference is not visible; the robustness is.
 *
 * Animation is procedural: poses are functions of a phase value, blended
 * towards over time. There are no animation files to author or ship.
 */

import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { clamp, damp, lerp, TAU } from '@/core/math';
import { material } from '../materials';
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
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group; shoulderR: THREE.Group;
  upperArmL: THREE.Group; upperArmR: THREE.Group;
  forearmL: THREE.Group; forearmR: THREE.Group;
  handL: THREE.Group; handR: THREE.Group;
  thighL: THREE.Group; thighR: THREE.Group;
  shinL: THREE.Group; shinR: THREE.Group;
  footL: THREE.Group; footR: THREE.Group;
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

function bone(parent: THREE.Object3D, y = 0, x = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
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
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y;
      mesh.castShadow = true;
      parent.add(mesh);
      this.bodyParts.push(mesh);
      return mesh;
    };

    // Torso: the undershirt, always present so an unarmoured chest is not nude.
    add(chest, new THREE.BoxGeometry(0.34 * body.shoulderWidth, 0.4, 0.21 * body.torsoDepth), cloth, 0.0);
    add(spine, new THREE.BoxGeometry(0.29, 0.2, 0.19 * body.torsoDepth), cloth2, 0.05);
    add(hips, new THREE.BoxGeometry(0.3, 0.16, 0.19 * body.torsoDepth), cloth2, -0.05);

    // Head, neck, hair.
    add(neck, new THREE.CylinderGeometry(0.052, 0.06, 0.1, 7), skin, 0.04);
    const skull = add(head, new THREE.SphereGeometry(0.115, 12, 10), skin, 0.02);
    skull.scale.set(0.94, 1.12, 1.02);
    const jaw = add(head, new THREE.BoxGeometry(0.13, 0.08, 0.13), skin, -0.06);
    jaw.scale.z = 1.05;
    const crown = add(head, new THREE.SphereGeometry(0.12, 10, 8, 0, TAU, 0, Math.PI * 0.6), hair, 0.035);
    crown.scale.set(1.02, 0.95, 1.05);

    // Arms and legs.
    for (const [upper, fore, hand] of [
      [upperArmL, forearmL, handL], [upperArmR, forearmR, handR],
    ] as const) {
      add(upper, new THREE.CylinderGeometry(0.052 * limb, 0.046 * limb, SEG.upperArm, 7), cloth, -SEG.upperArm / 2);
      add(fore, new THREE.CylinderGeometry(0.046 * limb, 0.04 * limb, SEG.forearm, 7), skin, -SEG.forearm / 2);
      add(hand, new THREE.BoxGeometry(0.075 * limb, 0.1, 0.06 * limb), skin, -0.03);
    }
    for (const [thigh, shin, foot] of [
      [thighL, shinL, footL], [thighR, shinR, footR],
    ] as const) {
      add(thigh, new THREE.CylinderGeometry(0.072 * limb, 0.06 * limb, SEG.thigh, 7), cloth2, -SEG.thigh / 2);
      add(shin, new THREE.CylinderGeometry(0.058 * limb, 0.048 * limb, SEG.shin, 7), cloth2, -SEG.shin / 2);
      add(foot, new THREE.BoxGeometry(0.09, 0.06, 0.2), material('leather', 0x3f3025, seed + 5), -0.02).position.z = 0.045;
    }
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
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) continue;
      mat.emissive.setHex(colour);
      mat.emissiveIntensity = amount;
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
    let targets = {
      hipsY: SEG.hipHeight - (isMoving ? bob : 0) + (isMoving ? 0 : breathe),
      hipsRot: isMoving ? Math.sin(p) * 0.07 : 0,
      spineX: isMoving ? 0.12 + stride * 0.07 : 0.03,
      chestRot: isMoving ? -Math.sin(p) * 0.1 : Math.sin(p * 0.3) * 0.02,
      headX: isMoving ? -0.06 : Math.sin(p * 0.27) * 0.03,
      armLX: isMoving ? swing * 0.85 : 0.12 + Math.sin(p * 0.3) * 0.03,
      armRX: isMoving ? -swing * 0.85 : 0.12 - Math.sin(p * 0.3) * 0.03,
      armSpread: isMoving ? 0.14 : 0.1,
      foreL: isMoving ? -0.35 - Math.max(0, swing) * 0.4 : -0.25,
      foreR: isMoving ? -0.35 - Math.max(0, -swing) * 0.4 : -0.25,
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

    // --- apply, damped so poses blend rather than snap ---------------------
    const k = 0.0005;
    const ap = (obj: THREE.Object3D, axis: 'x' | 'y' | 'z', target: number) => {
      obj.rotation[axis] = damp(obj.rotation[axis], target, k, dt);
    };

    b.hips.position.y = damp(b.hips.position.y, targets.hipsY, k, dt);
    ap(b.hips, 'y', targets.hipsRot);
    ap(b.spine, 'x', targets.spineX);
    ap(b.chest, 'y', targets.chestRot);
    ap(b.head, 'x', targets.headX);

    ap(b.upperArmL, 'x', targets.armLX);
    ap(b.upperArmR, 'x', targets.armRX);
    ap(b.upperArmL, 'z', targets.armSpread);
    ap(b.upperArmR, 'z', -targets.armSpread);
    ap(b.forearmL, 'x', targets.foreL);
    ap(b.forearmR, 'x', targets.foreR);

    ap(b.thighL, 'x', targets.thighL);
    ap(b.thighR, 'x', targets.thighR);
    ap(b.shinL, 'x', targets.shinL);
    ap(b.shinR, 'x', targets.shinR);
    ap(b.footL, 'x', targets.footL);
    ap(b.footR, 'x', targets.footR);

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
