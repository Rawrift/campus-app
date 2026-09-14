/**
 * Skinning: binding the procedurally built body meshes to the skeleton (§3).
 *
 * The rig used to be rigid segments parented to joint `Group`s. That is robust
 * and swaps armour trivially, but it has one tell that no amount of pose work
 * hides: a rigid upper arm and a rigid forearm cannot share a surface, so every
 * bent elbow, knee, waist and neck is a visible seam where two solids slide
 * through each other. At ARPG distance you do not read it as "low detail", you
 * read it as *puppet* — the parts move, the body does not.
 *
 * So the body is now one `SkinnedMesh` per rig, bound to the same skeleton the
 * poses already drive. Armour stays rigid and parented to bones, which is not a
 * compromise: a pauldron or a greave genuinely does not deform, and keeping it
 * off the skin means `setModule` still swaps a piece with one `add`/`remove`
 * and no rebinding.
 *
 * Weights are computed here rather than painted, which is the one real
 * advantage of generating every mesh in code: each part is submitted with the
 * handful of bones it is *allowed* to bind to, so a vertex on the left thigh
 * can never pick up weight from the right one however close they sit. Generic
 * nearest-bone auto-weighting has no way to know that and pinches the crotch
 * and the armpits every time.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** How sharply influence falls off with distance from a bone's segment. */
const FALLOFF = 3.4;

/** Stops a vertex sitting exactly on a bone from taking infinite weight. */
const EPSILON = 0.018;

/** three.js binds at most four bones per vertex. */
const MAX_INFLUENCES = 4;

/**
 * A bone and the line segment it deforms.
 *
 * A bone on its own is a point, and a point has no length to fall off along —
 * binding to points makes a limb pinch in the middle. The segment runs from the
 * joint to wherever the limb it drives actually ends, which is usually its
 * child joint.
 */
export interface BoneSpan {
  bone: THREE.Bone;
  /** Segment end in the bone's own local space. The start is the origin. */
  tip: THREE.Vector3;
}

interface Part {
  geometry: THREE.BufferGeometry;
  /** The object the part would have been parented to, in rest pose. */
  parent: THREE.Object3D;
  material: THREE.Material;
  /** Names of the bones this part may bind to. */
  allowed: string[];
  /** Extra local transform applied before binding (a rotated foot, say). */
  transform?: THREE.Matrix4;
}

function distanceToSegment(
  p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3,
): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Collects body parts, then binds them all into one skinned mesh.
 *
 * Parts are submitted in the same place and order the rigid version built them,
 * so the rest pose is identical — the only thing that changes is that the
 * surface is now continuous across the joints.
 */
export class SkinBinder {
  private parts: Part[] = [];
  private spans = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; index: number }>();
  private bones: THREE.Bone[] = [];

  /**
   * @param root the rig root; the skinned mesh is added here, beside the
   *   skeleton rather than inside it, so it is not transformed twice
   */
  constructor(private readonly root: THREE.Object3D) {}

  /**
   * Registers the skeleton. Must be called once, after the bone hierarchy is
   * built and before any part is added.
   *
   * @param spans every bone, with the segment it deforms
   */
  setSkeleton(spans: Record<string, BoneSpan>): void {
    this.root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    for (const [name, span] of Object.entries(spans)) {
      const index = this.bones.length;
      this.bones.push(span.bone);

      // Both ends in root space, which is the space the geometry is baked to.
      const a = new THREE.Vector3().setFromMatrixPosition(span.bone.matrixWorld)
        .applyMatrix4(rootInverse);
      const b = span.tip.clone().applyMatrix4(span.bone.matrixWorld)
        .applyMatrix4(rootInverse);
      this.spans.set(name, { a, b, index });
    }
  }

  /**
   * Submits one body part.
   *
   * @param allowed the bones this part may bind to. Keep it to the joints the
   *   part actually spans plus their immediate neighbours: it is what stops a
   *   limb picking up weight from the one beside it.
   */
  add(
    geometry: THREE.BufferGeometry,
    parent: THREE.Object3D,
    material: THREE.Material,
    allowed: string[],
    transform?: THREE.Matrix4,
  ): void {
    this.parts.push({ geometry, parent, material, allowed, transform });
  }

  /**
   * Bakes every part into root space, computes weights, and returns the bound
   * mesh. Returns `null` if nothing was submitted.
   */
  build(): THREE.SkinnedMesh | null {
    if (this.parts.length === 0) return null;
    this.root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    // Grouped by material, not by part: `mergeGeometries` emits one draw group
    // per input geometry, so submitting six body parts that share three
    // materials would cost six draw calls per character. With 28 actors on
    // screen that difference is the frame budget.
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();

    for (const part of this.parts) {
      const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      if (part.geometry.index) part.geometry.dispose();

      // Into root space: the part's rest-pose placement, then out of the root's
      // own transform so the mesh can sit at identity under it.
      const toRoot = new THREE.Matrix4()
        .multiplyMatrices(rootInverse, part.parent.matrixWorld);
      if (part.transform) toRoot.multiply(part.transform);
      geo.applyMatrix4(toRoot);
      geo.computeVertexNormals();

      this.weigh(geo, part.allowed);
      const bucket = byMaterial.get(part.material);
      if (bucket) bucket.push(geo);
      else byMaterial.set(part.material, [geo]);
    }

    const baked: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (const [mat, geos] of byMaterial) {
      const one = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
      if (!one) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      baked.push(one);
      materials.push(mat);
    }

    // `true` groups by input geometry, so one mesh carries every material.
    const merged = mergeGeometries(baked, true);
    for (const g of baked) g.dispose();
    if (!merged) return null;

    const skeleton = new THREE.Skeleton(this.bones);
    const mesh = new THREE.SkinnedMesh(merged, materials);
    mesh.castShadow = true;
    // The bones live under the root too, so the mesh must not also be a child
    // of one of them — it sits beside the hierarchy at identity.
    this.root.add(mesh);
    // The bind matrix has to be the mesh's *world* matrix, because the bone
    // inverses the skeleton just computed are in world space and the root
    // carries the rig's scale. `bind()` defaults to `mesh.matrixWorld`, which
    // is still identity until the tree is updated — bind against a stale
    // identity and the rig scale is applied twice, collapsing the body to a
    // speck inside its own armour.
    this.root.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    return mesh;
  }

  /** Writes `skinIndex` and `skinWeight` for one baked part. */
  private weigh(geo: THREE.BufferGeometry, allowed: string[]): void {
    const spans = allowed
      .map((name) => this.spans.get(name))
      .filter((s): s is { a: THREE.Vector3; b: THREE.Vector3; index: number } => s !== undefined);

    const position = geo.attributes.position!;
    const count = position.count;
    const indices = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    const p = new THREE.Vector3();

    // Reused across vertices so the inner loop allocates nothing.
    const candidateWeight: number[] = [];
    const candidateIndex: number[] = [];

    for (let v = 0; v < count; v++) {
      p.fromBufferAttribute(position, v);
      candidateWeight.length = 0;
      candidateIndex.length = 0;

      for (const span of spans) {
        const d = distanceToSegment(p, span.a, span.b);
        candidateWeight.push(1 / Math.pow(d + EPSILON, FALLOFF));
        candidateIndex.push(span.index);
      }

      // Keep the strongest four by selection: the candidate list is at most a
      // handful long, so a sort would cost more than it saves.
      let total = 0;
      for (let slot = 0; slot < MAX_INFLUENCES; slot++) {
        let best = -1;
        let bestWeight = 0;
        for (let c = 0; c < candidateWeight.length; c++) {
          if (candidateWeight[c]! > bestWeight) { bestWeight = candidateWeight[c]!; best = c; }
        }
        if (best < 0) break;
        indices[v * 4 + slot] = candidateIndex[best]!;
        weights[v * 4 + slot] = bestWeight;
        total += bestWeight;
        candidateWeight[best] = 0;
      }

      if (total > 0) {
        for (let slot = 0; slot < MAX_INFLUENCES; slot++) weights[v * 4 + slot]! /= total;
      } else {
        // No allowed bone resolved: pin it to the first so the vertex does not
        // collapse to the origin.
        weights[v * 4] = 1;
      }
    }

    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  }
}
