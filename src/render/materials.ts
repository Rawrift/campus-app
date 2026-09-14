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
