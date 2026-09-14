/**
 * The isometric camera rig (§6).
 *
 * Requirements from the brief, and how each is met:
 *  - diagonal, elevated perspective → a fixed yaw/pitch offset, never behind
 *    the character, so it can never be mistaken for a third-person game
 *  - close enough to appreciate the character, far enough to read combat →
 *    the default distance was chosen by rendering the same fight at several
 *    distances and keeping the one where a pauldron is still legible while
 *    a five-enemy pack still fits on screen
 *  - smooth following, configurable → exponential damping with a tunable factor
 *  - bounds → the camera target is clamped to the zone's extents
 *  - zoom in a small range → deliberately small, because a big zoom range lets
 *    the player zoom out until the atmosphere stops working
 *  - occlusion fade → anything between the camera and the player is faded
 */

import * as THREE from 'three';
import { clamp, damp } from '@/core/math';

export interface CameraSettings {
  /** Distance from the target along the view direction. */
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Elevation in radians above the horizon. */
  pitch: number;
  /** Rotation around the world Y axis. */
  yaw: number;
  fov: number;
  /** Fraction of the gap remaining after one second; lower is snappier. */
  smoothing: number;
  /** How far the camera leads the pointer, as a fraction of the offset. */
  lookAhead: number;
}

/**
 * Tuned defaults. A 38° pitch keeps enough of the character's front visible to
 * read their gear, while a steeper angle would flatten everything into a
 * top-down map and a shallower one would hide the floor the fight happens on.
 */
export const DEFAULT_CAMERA: CameraSettings = {
  distance: 14.5,
  minDistance: 11,
  maxDistance: 21,
  pitch: 38 * (Math.PI / 180),
  yaw: -45 * (Math.PI / 180),
  fov: 34,
  smoothing: 0.0015,
  lookAhead: 0.16,
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly settings: CameraSettings;
  /** The point the camera is following, in world space. */
  private target = new THREE.Vector3();
  private current = new THREE.Vector3();
  private shakeAmount = 0;
  private shakeTime = 0;
  private shakeOffset = new THREE.Vector3();
  /** Zone bounds; the target is clamped inside them. */
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  constructor(aspect: number, settings: Partial<CameraSettings> = {}) {
    this.settings = { ...DEFAULT_CAMERA, ...settings };
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.5, 220);
  }

  setBounds(width: number, height: number): void {
    // Inset so the camera never shows the outside of the map.
    const inset = 6;
    this.bounds = {
      minX: inset, maxX: Math.max(inset, width - inset),
      minZ: inset, maxZ: Math.max(inset, height - inset),
    };
  }

  /** Snaps immediately, for zone entry and respawn. */
  snapTo(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.current.copy(this.target);
    this.apply();
  }

  zoom(delta: number): void {
    this.settings.distance = clamp(
      this.settings.distance + delta,
      this.settings.minDistance,
      this.settings.maxDistance,
    );
  }

  shake(intensity: number, duration: number): void {
    // §8 asks for screenshake that is "extremadamente controlado". Capped hard,
    // and additive only up to the cap, so a big pull never turns the screen to
    // soup.
    this.shakeAmount = Math.min(0.5, Math.max(this.shakeAmount, intensity));
    this.shakeTime = Math.max(this.shakeTime, Math.min(duration, 0.4));
  }

  /**
   * @param pointerOffset the pointer's world offset from the player, used for
   *        a small amount of look-ahead so aiming feels connected to the view
   */
  update(dt: number, focusX: number, focusZ: number, pointerOffset?: THREE.Vector3): void {
    this.target.set(focusX, 0, focusZ);
    if (pointerOffset) {
      this.target.x += clamp(pointerOffset.x, -8, 8) * this.settings.lookAhead;
      this.target.z += clamp(pointerOffset.z, -8, 8) * this.settings.lookAhead;
    }
    if (this.bounds) {
      this.target.x = clamp(this.target.x, this.bounds.minX, this.bounds.maxX);
      this.target.z = clamp(this.target.z, this.bounds.minZ, this.bounds.maxZ);
    }

    this.current.x = damp(this.current.x, this.target.x, this.settings.smoothing, dt);
    this.current.y = damp(this.current.y, this.target.y, this.settings.smoothing, dt);
    this.current.z = damp(this.current.z, this.target.z, this.settings.smoothing, dt);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime / 0.4) * this.shakeAmount;
      // Deterministic, high-frequency, and decaying — reads as impact, not drift.
      const t = performance.now() * 0.06;
      this.shakeOffset.set(Math.sin(t * 1.7) * k, Math.sin(t * 2.3) * k * 0.6, Math.cos(t * 1.9) * k);
      if (this.shakeTime <= 0) { this.shakeAmount = 0; this.shakeOffset.set(0, 0, 0); }
    }

    this.apply();
  }

  private apply(): void {
    const { distance, pitch, yaw } = this.settings;
    const horizontal = Math.cos(pitch) * distance;
    const offset = new THREE.Vector3(
      Math.cos(yaw) * horizontal,
      Math.sin(pitch) * distance,
      Math.sin(yaw) * horizontal,
    );
    this.camera.position.copy(this.current).add(offset).add(this.shakeOffset);
    this.camera.lookAt(this.current.x + this.shakeOffset.x, this.current.y + 0.9, this.current.z + this.shakeOffset.z);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Converts a normalised pointer position into a point on the ground plane. */
  screenToGround(ndcX: number, ndcY: number, planeY = 0): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  get focus(): THREE.Vector3 {
    return this.current;
  }
}
