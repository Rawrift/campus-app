/**
 * Shared material library.
 *
 * Materials are cached by (kind, colour, seed) because a level contains
 * hundreds of props and dozens of actors, and a unique `MeshStandardMaterial`
 * per object would both waste memory and break Three.js's ability to batch
 * draw calls (§39).
 */

import * as THREE from 'three';
import {
  boneSurface, clothSurface, groundSurface, leatherSurface,
  metalSurface, skinSurface, stoneSurface, woodSurface, type SurfaceMaps,
} from './textures';

export type MaterialKind =
  | 'iron' | 'steel' | 'darksteel' | 'leather' | 'cloth' | 'wood'
  | 'stone' | 'ground' | 'bone' | 'skin' | 'flesh';

interface Recipe {
  surface: (seed: number, colour: number) => SurfaceMaps;
  metalness: number;
  roughness: number;
  /** Multiplies the texture repeat, so a wall is not one giant stone block. */
  repeat: number;
}

/**
 * Metalness is deliberately below the "physically correct" 1.0 for a bare
 * metal. These surfaces are pitted, oxidised and filthy, and the dirt in the
 * pits is a dielectric; a full-metal value reads as showroom chrome, which the
 * art direction explicitly rules out. Roughness comes from the generated map,
 * which keeps scratches smoother than the surface around them.
 */
const RECIPES: Record<MaterialKind, Recipe> = {
  iron:      { surface: (s, c) => metalSurface(s, c, 0.6), metalness: 0.55, roughness: 1, repeat: 1 },
  steel:     { surface: (s, c) => metalSurface(s, c, 0.3), metalness: 0.68, roughness: 1, repeat: 1 },
  darksteel: { surface: (s, c) => metalSurface(s, c, 0.15), metalness: 0.72, roughness: 1, repeat: 1 },
  leather:   { surface: leatherSurface, metalness: 0.02, roughness: 1, repeat: 1 },
  cloth:     { surface: clothSurface, metalness: 0.0, roughness: 1, repeat: 1 },
  wood:      { surface: woodSurface, metalness: 0.0, roughness: 1, repeat: 1 },
  stone:     { surface: (s, c) => stoneSurface(s, c, 0.3), metalness: 0.0, roughness: 1, repeat: 1 },
  ground:    { surface: (s, c) => groundSurface(s, c, 0.22), metalness: 0.0, roughness: 1, repeat: 1 },
  bone:      { surface: boneSurface, metalness: 0.0, roughness: 1, repeat: 1 },
  skin:      { surface: skinSurface, metalness: 0.0, roughness: 1, repeat: 1 },
  flesh:     { surface: skinSurface, metalness: 0.0, roughness: 1, repeat: 1 },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/*
 * The occlusion cutout.
 *
 * Scenery between the camera and the character has to get out of the way, and
 * the obvious way -- raycast, then fade whatever mesh you hit -- is
 * fundamentally incompatible with how this renderer draws. Terrain and props
 * are merged into one mesh per material to hold the draw-call budget, so
 * "whatever mesh you hit" is *every wall in the zone*, or every wooden object
 * in it. Measured in the hub, 36 camera positions out of 40 had something
 * fading and up to five batches were fading at once.
 *
 * So the cutout is done per fragment instead. Anything drawn closer to the
 * camera than the character, inside a disc around them on screen, is dithered
 * away. That fixes the batching problem by not caring about meshes at all, and
 * it also fixes what the old approach could never do: a wall that hides a
 * shoulder but not the character's centre used to stay solid, because one
 * raycast only ever found what was on the exact centre line.
 *
 * Discarding rather than blending is deliberate: a discard needs no transparent
 * pass, no depth sorting, and no cloned material. At this camera distance the
 * dither reads as a soft edge.
 *
 * Every patched material shares this one uniforms object, so the renderer
 * writes the character's position once per frame and all of them see it.
 */
export const occlusionUniforms = {
  /** Character position in pixels, matching `gl_FragCoord`. */
  uCutCentre: { value: new THREE.Vector2(-1000, -1000) },
  /** Radius of the disc, in pixels. Zero disables the cutout. */
  uCutRadius: { value: 0 },
  /** Distance from the camera to the character, in world units. */
  uCutDepth: { value: 0 },
};

/**
 * Patches a material to dither away fragments in front of the character.
 *
 * Applied to scenery only. Actors keep their solid materials: an enemy that
 * happens to stand between the camera and the player is information the player
 * needs, not an obstruction.
 */
function applyOcclusionCutout(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutCentre = occlusionUniforms.uCutCentre;
    shader.uniforms.uCutRadius = occlusionUniforms.uCutRadius;
    shader.uniforms.uCutDepth = occlusionUniforms.uCutDepth;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vCutDepth;\nvarying float vCutUp;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCutDepth = -mvPosition.z;',
      )
      // How far this surface faces upward, in world space. The floor is the one
      // thing that is always closer to the camera than the character and never
      // hides them, so it has to be exempt or the cutout punches a hole in the
      // ground and the background shows through it.
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvCutUp = normalize(mat3(modelMatrix) * objectNormal).y;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vCutDepth;
        varying float vCutUp;
        uniform vec2 uCutCentre;
        uniform float uCutRadius;
        uniform float uCutDepth;
        // A 4x4 ordered dither, built from two nested 2x2 levels. Cheaper than
        // a texture lookup and stable in screen space, so the pattern does not
        // crawl as the camera moves. The scatter has to be two-dimensional: a
        // threshold that varies mostly along one axis dithers into stripes,
        // which reads as damage rather than as a soft edge.
        float cutBayer2(vec2 a) {
          a = floor(a);
          return fract(a.x * 0.5 + a.y * a.y * 0.75);
        }
        float cutDither(vec2 p) {
          return cutBayer2(p * 0.5) * 0.25 + cutBayer2(p);
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uCutRadius > 0.0 && vCutDepth < uCutDepth && vCutUp < 0.72) {
          float d = distance(gl_FragCoord.xy, uCutCentre) / uCutRadius;
          if (d < 1.0) {
            // Solid at the rim, gone at the centre. The dithered band is the
            // outer quarter only: any wider and the pattern itself is what the
            // eye sees instead of the character behind it.
            float cut = 1.0 - smoothstep(0.72, 1.0, d);
            if (cut > cutDither(gl_FragCoord.xy)) discard;
          }
        }`);
  };
  // Without this the renderer reuses one compiled program for materials whose
  // parameters match, and a patched and an unpatched material would share it.
  mat.customProgramCacheKey = () => 'cutout';
}

export interface MaterialOptions {
  /** Strength of the generated relief, where the surface provides one. */
  normalScale?: number;
  /** Texture repeat, for large surfaces like floors and walls. */
  repeat?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Multiply the albedo by the mesh's vertex colours. */
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** Overrides the recipe's roughness multiplier. */
  roughness?: number;
  flatShading?: boolean;
  /**
   * Dither this surface away when it stands between the camera and the
   * character. Scenery wants it; actors do not.
   */
  cutout?: boolean;
}

/**
 * Returns a cached material. Two calls with identical arguments return the very
 * same object, so changing one changes all of them — clone before mutating.
 */
export function material(
  kind: MaterialKind, colour: number, seed = 0, opts: MaterialOptions = {},
): THREE.MeshStandardMaterial {
  const key = [
    kind, colour, seed, opts.repeat ?? 1, opts.emissive ?? 0, opts.emissiveIntensity ?? 0,
    opts.transparent ? 1 : 0, opts.opacity ?? 1, opts.side ?? 0, opts.roughness ?? -1,
    opts.flatShading ? 1 : 0, opts.normalScale ?? 1, opts.vertexColors ? 1 : 0,
    // Part of the key: a patched and an unpatched material are not the same
    // material, and scenery and actors legitimately ask for both.
    opts.cutout ? 1 : 0,
  ].join('|');

  const existing = cache.get(key);
  if (existing) return existing;

  const recipe = RECIPES[kind];
  const maps = recipe.surface(seed || colour, colour);
  const repeat = opts.repeat ?? recipe.repeat;
  maps.map.repeat.set(repeat, repeat);
  maps.roughnessMap.repeat.set(repeat, repeat);
  if (maps.normalMap) maps.normalMap.repeat.set(repeat, repeat);

  const scale = opts.normalScale ?? 1;
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    roughnessMap: maps.roughnessMap,
    normalMap: maps.normalMap ?? null,
    normalScale: new THREE.Vector2(scale, scale),
    metalness: recipe.metalness,
    roughness: opts.roughness ?? recipe.roughness,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
    vertexColors: opts.vertexColors ?? false,
  });
  if (opts.cutout) applyOcclusionCutout(mat);
  cache.set(key, mat);
  return mat;
}

/** An unlit material for glows, magic and UI-ish world markers. */
const emissiveCache = new Map<string, THREE.MeshBasicMaterial>();
export function emissive(colour: number, opacity = 1, blending: THREE.Blending = THREE.AdditiveBlending): THREE.MeshBasicMaterial {
  const key = `${colour}|${opacity}|${blending}`;
  const existing = emissiveCache.get(key);
  if (existing) return existing;
  const mat = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  emissiveCache.set(key, mat);
  return mat;
}

/** Frees every cached GPU resource. Called when tearing the game down. */
export function disposeMaterials(): void {
  for (const mat of cache.values()) {
    mat.map?.dispose();
    mat.roughnessMap?.dispose();
    mat.normalMap?.dispose();
    mat.dispose();
  }
  cache.clear();
  for (const mat of emissiveCache.values()) mat.dispose();
  emissiveCache.clear();
}

/** Maps an item's declared material name onto a render material kind. */
export function materialForSpec(name: string): MaterialKind {
  switch (name) {
    case 'iron': return 'iron';
    case 'steel': return 'steel';
    case 'darksteel': return 'darksteel';
    case 'leather': return 'leather';
    case 'cloth': return 'cloth';
    case 'wood': return 'wood';
    case 'bone': return 'bone';
    default: return 'iron';
  }
}

/** Base colours per material tier, chosen to stay inside the §28 palette. */
export const MATERIAL_COLOURS: Record<string, number> = {
  iron: 0x6b6660,
  steel: 0x8a8781,
  darksteel: 0x45434a,
  leather: 0x5c4331,
  cloth: 0x6a6154,
  wood: 0x6b5638,
  bone: 0xc0b18a,
};
