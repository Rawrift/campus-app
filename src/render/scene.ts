/**
 * The renderer.
 *
 * Reads simulation state every frame and reflects it; never writes to it. That
 * one-way dependency is what lets the whole game be tested headlessly, and what
 * would let a server own the simulation later (§37, §49).
 *
 * Actor views are created and destroyed lazily as actors appear and are pruned,
 * so the renderer needs no spawn/despawn notifications from the simulation.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Rng } from '@/core/rng';
import { clamp, damp, lerp } from '@/core/math';
import { Tile, type GroundItem, type SimWorld } from '@/sim/world';
import { ARCHETYPES } from '@/data/archetypes.data';
import { ENEMIES } from '@/data/enemies.data';
import { ELITE_MODIFIERS } from '@/data/elites.data';
import { ITEM_BASES } from '@/data/items.data';
import { RARITY, type EquipSlot, type VisualModule, type WeaponCategory } from '@/sim/items';
import type { Actor } from '@/sim/entity';
import type { PlayerController } from '@/sim/player';
import type { LoadedZone } from '@/world/zoneRuntime';
import type { Prop } from '@/world/zoneDef';
import { CameraRig } from './camera';
import { buildTerrain, type TerrainResult } from './terrain';
import { environmentTexture } from './textures';
import { buildProp } from './geometry/props';
import { CharacterRig, type AnimState } from './geometry/character';
import { EnemyRig } from './geometry/enemies';
import { VfxSystem, burstForDamage } from './vfx';
import { emissive, material } from './materials';

interface ActorView {
  rig: CharacterRig | EnemyRig;
  root: THREE.Group;
  /** Health bar billboard, hidden until the actor is damaged. */
  bar?: THREE.Sprite;
  barBg?: THREE.Sprite;
  lastHealth: number;
  flash: number;
  /** Set when the actor is dead, so the view fades before removal. */
  fading: number;
  isPlayer: boolean;
}

interface ItemView {
  group: THREE.Group;
  ground: GroundItem;
  beam?: THREE.Mesh;
  bob: number;
}

/** Lights attached to props, animated for flicker. */
interface FlickerLight {
  light: THREE.PointLight;
  base: number;
  amount: number;
  phase: number;
  /** The prop's flame meshes, scaled with the flicker. */
  flames: THREE.Object3D[];
  x: number;
  y: number;
  z: number;
  emit: boolean;
}

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cameraRig: CameraRig;
  readonly vfx = new VfxSystem();

  private actorViews = new Map<number, ActorView>();
  private itemViews = new Map<number, ItemView>();
  private projectileViews = new Map<number, THREE.Mesh>();
  private groundViews = new Map<number, THREE.Mesh>();
  private flickers: FlickerLight[] = [];
  private terrain: TerrainResult | null = null;
  private zoneGroup = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  /**
   * A dim light that travels with the player.
   *
   * The brief requires that character type, weapon, armour class and enemy
   * identity be readable at a glance (§2), and a scene lit only by scattered
   * torches cannot guarantee that — you routinely fight in the gaps between
   * them. This keeps the immediate area around the player legible without
   * lifting the zone's overall darkness, which stays a mechanic.
   */
  private presence: THREE.PointLight;
  /**
   * A small, fixed pool of shadow-casting lamps that borrow the two nearest
   * torches each frame.
   *
   * Torch lights themselves never cast, for two reasons. A zone has dozens of
   * them and point-light shadows cost six cube faces each; and changing how
   * many lights cast shadows forces three.js to recompile every material,
   * which would hitch constantly as the player walks. Keeping the count fixed
   * at two, and moving them, gives occluded torchlight at a bounded cost.
   */
  private shadowLamps: THREE.PointLight[] = [];
  /** Flicker entries whose own light is muted this frame because it is borrowed. */
  private borrowed: FlickerLight[] = [];
  /**
   * Off by default, and here is the measurement behind that.
   *
   * Enabled, torch shadows cost roughly a third of the frame. What they buy in
   * these rooms is close to nothing: the geometry near a torch is bones,
   * candles and rubble, all of it low, and a light at 1.5 units above the floor
   * throws almost no shadow from objects that short. The pillars that would
   * cast a real shadow are nowhere near the torches.
   *
   * The implementation is correct and the option is kept, because on a strong
   * GPU a third of a 4ms frame is free and the belfry does have tall geometry
   * near its braziers. It simply does not earn its cost as a default.
   */
  torchShadows = false;
  private hemi: THREE.HemisphereLight;
  /** Direction the key light comes from, set per zone. */
  private sunDir = new THREE.Vector3(0.6, 0.8, 0.4);
  private moveMarker: THREE.Mesh;
  private interactMarker: THREE.Mesh;
  /** Meshes currently faded because they occlude the player (§6). */
  private faded = new Set<THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  /** Equipment signature, so the character is rebuilt only when gear changes. */
  private equipSignature = '';
  private rng = new Rng('scene');
  private elapsed = 0;
  /** Image-based lighting, regenerated per zone from that zone's palette. */
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  /**
   * Bloom.
   *
   * The whole game is lit by fire in the dark, and fire that does not bleed
   * into the air around it reads as a flat orange shape. A high threshold keeps
   * it off ordinary surfaces: only flames, magic, hot coals and the emissive
   * cores of the Hollow cross it.
   */
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  bloomEnabled = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES filmic keeps the deep shadows this game lives in from crushing to
    // pure black while letting torchlight bloom out (§28).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this.cameraRig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.scene.add(this.zoneGroup);
    this.scene.add(this.vfx.group);

    this.hemi = new THREE.HemisphereLight(0x4a4e58, 0x20201c, 0.6);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xa8987c, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    const d = 22;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // A dim, cool fill from the opposite side. Without it the faces turned away
    // from the key light render as flat black and every prop becomes a
    // silhouette, which destroys the readability §2 requires.
    this.fill = new THREE.DirectionalLight(0x5a6472, 0.38);
    this.fill.castShadow = false;
    this.scene.add(this.fill);

    this.presence = new THREE.PointLight(0xc4ab88, 26, 16, 1.55);
    this.presence.castShadow = false;
    this.scene.add(this.presence);

    for (let i = 0; i < 2; i++) {
      const lamp = new THREE.PointLight(0xff9a44, 0, 14, 2);
      lamp.castShadow = false;
      // Small maps: these light a few metres of a dim room, and a soft,
      // slightly noisy shadow suits torchlight better than a crisp one.
      lamp.shadow.mapSize.set(1024, 1024);
      // Point-light shadows on large flat floors self-shadow readily. A normal
      // bias alone handles it without the peter-panning a depth bias causes.
      lamp.shadow.bias = 0;
      lamp.shadow.normalBias = 0.14;
      lamp.shadow.camera.near = 0.5;
      lamp.shadow.camera.far = 16;
      this.scene.add(lamp);
      this.shadowLamps.push(lamp);
    }

    // Click-to-move marker.
    const size = new THREE.Vector2(
      Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight),
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cameraRig.camera));
    this.bloom = new UnrealBloomPass(size, 0.62, 0.72, 0.82);
    this.composer.addPass(this.bloom);
    // OutputPass applies tone mapping and the colour-space conversion at the
    // end of the chain, which is where they belong once a composer exists.
    this.composer.addPass(new OutputPass());

    this.moveMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 18),
      emissive(0xc8b98a, 0.7),
    );
    this.moveMarker.rotation.x = -Math.PI / 2;
    this.moveMarker.visible = false;
    this.scene.add(this.moveMarker);

    this.interactMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 22),
      emissive(0xc8a349, 0.55),
    );
    this.interactMarker.rotation.x = -Math.PI / 2;
    this.interactMarker.visible = false;
    this.scene.add(this.interactMarker);
  }

  // --- zone --------------------------------------------------------------

  loadZone(loaded: LoadedZone): void {
    this.clearZone();
    const { grid, props, def } = loaded;
    const amb = def.ambience;

    this.terrain = buildTerrain(grid, amb, 1234);
    this.zoneGroup.add(this.terrain.group);

    // Rebuild the environment for this zone, so metal reflects the room it is
    // actually standing in rather than a generic grey.
    this.envTarget?.dispose();
    const envSource = environmentTexture(
      amb.ambientColour, amb.groundColour, amb.interior ? 0.5 : 0.3,
    );
    this.envTarget = this.pmrem.fromEquirectangular(envSource);
    this.scene.environment = this.envTarget.texture;
    // Kept low: this is a dark game, and the environment is here to make metal
    // read as metal, not to light the scene.
    this.scene.environmentIntensity = amb.interior ? 0.3 : 0.45;
    envSource.dispose();

    this.scene.fog = new THREE.Fog(amb.fogColour, amb.fogNear, amb.fogFar);
    this.scene.background = new THREE.Color(amb.fogColour);
    this.hemi.color.setHex(amb.ambientColour);
    this.hemi.groundColor.setHex(
      new THREE.Color(amb.groundColour).multiplyScalar(0.4).getHex(),
    );
    this.hemi.intensity = amb.ambientIntensity;
    this.sun.color.setHex(amb.sunColour);
    this.sun.intensity = amb.sunIntensity;
    this.sun.castShadow = amb.sunIntensity > 0.2;
    // A raking elevation, so walls and characters catch light on one side and
    // cast long shadows, rather than being lit flat from directly overhead.
    const [elevation, azimuth] = amb.sunAngle;
    const pitch = Math.abs(elevation);
    this.sunDir.set(
      Math.cos(azimuth) * Math.cos(pitch),
      Math.max(0.35, Math.sin(pitch)),
      Math.sin(azimuth) * Math.cos(pitch),
    ).normalize();
    this.fill.color.setHex(amb.ambientColour);
    this.fill.intensity = amb.interior ? 0.22 : 0.38;
    // Stronger indoors, where there is no sky to fall back on.
    this.presence.intensity = amb.interior ? 13 : 7;
    this.presence.distance = amb.interior ? 17 : 14;

    this.cameraRig.setBounds(def.width, def.height);

    // --- props -----------------------------------------------------------
    // Props are static, so instead of adding one Group per prop (a draw call
    // per sub-mesh, per prop) their geometries are baked into world space and
    // merged per material. A zone with 800 props drops from roughly 1600 draw
    // calls to one per distinct material.
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const matrix = new THREE.Matrix4();
    const propMatrix = new THREE.Matrix4();

    for (const prop of props) {
      const template = buildProp(prop.kind, prop.variant);
      propMatrix.compose(
        new THREE.Vector3(prop.x, 0, prop.y),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, prop.rotation, 0)),
        new THREE.Vector3(prop.scale, prop.scale, prop.scale),
      );

      template.updateMatrixWorld(true);
      // Props with lights are added individually below (their flames animate),
      // so they must not also be baked into the static batch.
      if (prop.light) { this.addPropLight(prop); continue; }

      template.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const mat = node.material as THREE.Material;
        if (Array.isArray(node.material)) return;

        // Bake the prop transform and the sub-mesh's local transform together.
        matrix.multiplyMatrices(propMatrix, node.matrixWorld);

        // Merging requires every geometry in a batch to agree on both its
        // attribute set and whether it is indexed. Three.js primitives differ
        // on the latter, so everything is normalised to non-indexed: the extra
        // vertices are cheap for static scenery, and mixing the two silently
        // fails the whole batch.
        const geo = (node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone())
          .applyMatrix4(matrix);
        for (const name of Object.keys(geo.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') {
            geo.deleteAttribute(name);
          }
        }
        if (!geo.attributes.uv) {
          const count = geo.attributes.position!.count;
          geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        if (!geo.attributes.normal) geo.computeVertexNormals();

        let list = batches.get(mat);
        if (!list) { list = []; batches.set(mat, list); }
        list.push(geo);
      });

    }

    // Flush the batches into one mesh per material.
    for (const [mat, geometries] of batches) {
      if (geometries.length === 0) continue;
      const merged = geometries.length === 1
        ? geometries[0]!
        : mergeGeometries(geometries, false);
      if (!merged) {
        // Never silently drop scenery: fall back to unmerged meshes so a
        // geometry mismatch shows up as a performance issue, not a missing prop.
        console.warn('[scene] could not merge a prop batch; falling back');
        for (const geo of geometries) this.zoneGroup.add(new THREE.Mesh(geo, mat));
        continue;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.zoneGroup.add(mesh);
      if (geometries.length > 1) for (const geo of geometries) geo.dispose();
    }

    // --- interactables ----------------------------------------------------
    for (const i of loaded.interactables) {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.52, 20),
        emissive(i.kind === 'exit' ? 0x8fae7c : 0xc8a349, 0.4),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(i.x, 0.04, i.y);
      marker.name = `interact:${i.id}`;
      this.zoneGroup.add(marker);

      if (i.kind === 'chest') {
        const chest = buildProp('crate', 3).clone(true);
        chest.position.set(i.x, 0, i.y);
        chest.scale.setScalar(1.15);
        this.zoneGroup.add(chest);
      }
      if (i.kind === 'exit') {
        // A soft pillar of light: unmissable, and it does not need a label.
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.7, 4.5, 10, 1, true),
          emissive(0x9fc48a, 0.16),
        );
        beam.position.set(i.x, 2.25, i.y);
        this.zoneGroup.add(beam);
      }
    }

    // Mire tiles get a faint reflective sheen, which sells standing water.
    void Tile;
  }

  /**
   * Adds a prop that carries a light.
   *
   * These are kept as individual objects rather than merged into the static
   * batch, because the flicker animation scales their flame meshes every frame.
   * There are only a few dozen per zone, so the draw calls are affordable.
   */
  private addPropLight(prop: Prop): void {
    if (!prop.light) return;
    const template = buildProp(prop.kind, prop.variant);
    const instance = template.clone(true);
    instance.position.set(prop.x, 0, prop.y);
    instance.rotation.y = prop.rotation;
    instance.scale.setScalar(prop.scale);
    instance.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.zoneGroup.add(instance);

    const light = new THREE.PointLight(prop.light.colour, prop.light.intensity, prop.light.range, 2);
    light.position.set(prop.x, 1.5, prop.y);
    this.zoneGroup.add(light);

    const flames: THREE.Object3D[] = [];
    instance.traverse((o) => { if (o.name === 'flame') flames.push(o); });

    this.flickers.push({
      light, base: prop.light.intensity, amount: prop.light.flicker ?? 0,
      phase: this.rng.range(0, Math.PI * 2), flames,
      x: prop.x, y: 1.45, z: prop.y,
      emit: prop.kind === 'brazier' || prop.kind === 'torch' || prop.kind === 'forge',
    });
  }

  private clearZone(): void {
    this.terrain?.dispose();
    this.terrain = null;
    // Merged batches own their geometry, so dispose everything under the zone
    // group rather than only its direct children.
    this.zoneGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.zoneGroup.clear();
    this.flickers.length = 0;
    this.faded.clear();

    for (const view of this.actorViews.values()) {
      this.scene.remove(view.root);
      view.rig.dispose();
    }
    this.actorViews.clear();
    for (const view of this.itemViews.values()) this.scene.remove(view.group);
    this.itemViews.clear();
    for (const mesh of this.projectileViews.values()) this.scene.remove(mesh);
    this.projectileViews.clear();
    for (const mesh of this.groundViews.values()) this.scene.remove(mesh);
    this.groundViews.clear();
    this.vfx.clear();
    this.equipSignature = '';
  }

  // --- actor views -------------------------------------------------------

  private createView(actor: Actor, player: PlayerController): ActorView {
    const root = new THREE.Group();
    let rig: CharacterRig | EnemyRig;

    if (actor.id === player.actor.id) {
      rig = new CharacterRig(ARCHETYPES.get(player.archetypeId).body, actor.id);
    } else {
      const def = ENEMIES.find(actor.defId);
      if (def) {
        const enemyRig = new EnemyRig(def.visual, actor.id);
        for (const id of actor.eliteAffixes) {
          const mod = ELITE_MODIFIERS.find(id);
          if (mod?.visual.crest) {
            enemyRig.addEliteCrest(mod.visual.crest, mod.visual.tint, mod.visual.glow ?? 0);
          }
        }
        rig = enemyRig;
      } else {
        rig = new CharacterRig(ARCHETYPES.get('ironbound').body, actor.id);
      }
    }

    root.add(rig.root);
    this.scene.add(root);

    const view: ActorView = {
      rig, root, lastHealth: actor.health, flash: 0, fading: 0,
      isPlayer: actor.id === player.actor.id,
    };

    if (!view.isPlayer) {
      // Health bars appear only once something has been hit, so an untouched
      // room is not a wall of UI (§32 — do not overload the screen).
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x160f0d, transparent: true, opacity: 0.8, depthTest: false,
      }));
      bg.scale.set(0.92, 0.1, 1);
      bg.visible = false;
      root.add(bg);
      view.barBg = bg;

      const bar = new THREE.Sprite(new THREE.SpriteMaterial({
        color: actor.isBoss ? 0xa8582f : actor.eliteAffixes.length > 0 ? 0xc8a349 : 0x8c3b30,
        transparent: true, depthTest: false,
      }));
      bar.scale.set(0.88, 0.07, 1);
      bar.visible = false;
      root.add(bar);
      view.bar = bar;
    }

    return view;
  }

  /**
   * Rebuilds the player's visible gear when equipment changes.
   * This is §4's core requirement: the character must visibly change.
   */
  private syncEquipment(player: PlayerController, rig: CharacterRig): void {
    const signature = ([
      'head', 'chest', 'shoulders', 'hands', 'belt', 'legs', 'feet', 'cloak', 'mainHand', 'offHand',
    ] as EquipSlot[])
      .map((slot) => {
        const item = player.equipment.get(slot);
        return item ? `${slot}=${item.baseId}` : `${slot}=-`;
      })
      .join('|');

    if (signature === this.equipSignature) return;
    this.equipSignature = signature;

    const modules: [EquipSlot, VisualModule][] = [
      ['head', 'helmet'], ['chest', 'torsoArmour'], ['shoulders', 'shoulders'],
      ['hands', 'gloves'], ['belt', 'belt'], ['legs', 'legs'], ['feet', 'boots'],
      ['cloak', 'cloak'], ['mainHand', 'mainHand'], ['offHand', 'offHand'],
    ];

    for (const [slot, module] of modules) {
      const item = player.equipment.get(slot);
      if (!item) {
        rig.setModule(module, null, 0);
        continue;
      }
      const base = ITEM_BASES.find(item.baseId);
      if (!base) continue;
      rig.setModule(
        module, base.visual, item.uid,
        (slot === 'mainHand' || slot === 'offHand') ? base.category as WeaponCategory : undefined,
      );
    }
  }

  /** Translates a simulation action state into an animation state. */
  private animStateFor(actor: Actor): AnimState {
    switch (actor.action) {
      case 'windup': return 'windup';
      case 'strike': return 'strike';
      case 'recover': return 'recover';
      case 'casting': return 'cast';
      case 'staggered': return 'hit';
      case 'dodging': return 'dodge';
      case 'dead': return 'death';
      case 'moving': return actor.speed > 5 ? 'run' : 'walk';
      default: return 'idle';
    }
  }

  // --- per-frame ---------------------------------------------------------

  /**
   * @param alpha interpolation factor between the previous and current fixed
   *        simulation step, so rendering stays smooth above 60 Hz
   */
  update(
    world: SimWorld, player: PlayerController, dt: number, alpha: number,
    pointer: THREE.Vector3 | null, hoveredInteractable: { x: number; y: number } | null,
  ): void {
    this.elapsed += dt;

    // --- actors -----------------------------------------------------------
    const seen = new Set<number>();
    for (const actor of world.actors) {
      seen.add(actor.id);
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = this.createView(actor, player);
        this.actorViews.set(actor.id, view);
      }

      // Interpolate between fixed steps so motion is smooth at any refresh rate.
      const x = lerp(actor.prevX, actor.x, alpha);
      const z = lerp(actor.prevY, actor.y, alpha);
      view.root.position.set(x, 0, z);
      view.root.rotation.y = -actor.facing + Math.PI / 2;

      // Action progress drives the animation's phase so the pose and the
      // damage window are always in sync (§8).
      let progress = 0;
      if (actor.action === 'windup' || actor.action === 'strike' || actor.action === 'recover') {
        progress = clamp(1 - actor.actionTimer / 0.4, 0, 1);
      }
      if (view.isPlayer) {
        const action = player.actionProgress;
        if (action) progress = clamp(1 - action.t / 0.45, 0, 1);
        this.syncEquipment(player, view.rig as CharacterRig);
      }

      view.rig.setState(this.animStateFor(actor));
      view.rig.update(dt, actor.speed, progress);

      // Damage flash: a brief emissive pulse, the cheapest legible hit cue.
      if (actor.health < view.lastHealth) {
        view.flash = 0.14;
      }
      view.lastHealth = actor.health;
      if (view.flash > 0) {
        view.flash -= dt;
        view.rig.setTint(0xff5a3c, clamp(view.flash / 0.14, 0, 1) * 1.6);
      } else {
        view.rig.setTint(0x000000, 0);
      }

      // Health bar.
      if (view.bar && view.barBg) {
        const hurt = actor.health < actor.maxHealth && actor.alive;
        view.bar.visible = hurt;
        view.barBg.visible = hurt;
        if (hurt) {
          const y = actor.height + 0.45;
          const frac = actor.healthFraction;
          view.barBg.position.set(0, y, 0);
          view.bar.position.set(-(0.88 * (1 - frac)) / 2, y, 0);
          view.bar.scale.x = 0.88 * frac;
        }
      }

      // Corpses sink and fade rather than vanishing (§8 asks for cadáveres).
      if (!actor.alive) {
        view.fading += dt;
        const t = clamp((view.fading - 8) / 4, 0, 1);
        view.root.position.y = -t * 0.6;
        view.root.visible = t < 1;
      }
    }

    // Remove views whose actors have been pruned.
    for (const [id, view] of this.actorViews) {
      if (seen.has(id)) continue;
      this.scene.remove(view.root);
      view.rig.dispose();
      this.actorViews.delete(id);
    }

    this.updateProjectiles(world, alpha);
    this.updateGroundEffects(world, dt);
    this.updateItems(world, dt);
    this.updateFlickers(dt);

    // --- markers ----------------------------------------------------------
    const dest = player.moveTarget;
    this.moveMarker.visible = !!dest;
    if (dest) {
      this.moveMarker.position.set(dest.x, 0.05, dest.y);
      this.moveMarker.scale.setScalar(0.9 + Math.sin(this.elapsed * 6) * 0.1);
    }
    this.interactMarker.visible = !!hoveredInteractable;
    if (hoveredInteractable) {
      this.interactMarker.position.set(hoveredInteractable.x, 0.06, hoveredInteractable.y);
      this.interactMarker.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.06);
    }

    // --- camera -----------------------------------------------------------
    const px = lerp(player.actor.prevX, player.actor.x, alpha);
    const pz = lerp(player.actor.prevY, player.actor.y, alpha);
    const offset = pointer
      ? new THREE.Vector3(pointer.x - px, 0, pointer.z - pz)
      : undefined;
    this.cameraRig.update(dt, px, pz, offset);

    // Both lights follow the camera so the shadow frustum always covers the
    // visible area; a static sun would leave most of a large zone unshadowed.
    this.sun.position.set(
      px + this.sunDir.x * 26, this.sunDir.y * 26, pz + this.sunDir.z * 26,
    );
    this.sun.target.position.set(px, 0, pz);
    this.fill.position.set(
      px - this.sunDir.x * 20, 10, pz - this.sunDir.z * 20,
    );
    this.fill.target.position.set(px, 0, pz);
    this.fill.target.updateMatrixWorld();
    // Slightly above and behind the player, so it rims their silhouette rather
    // than flattening them with a head-on flash.
    this.presence.position.set(px + this.sunDir.x * 1.6, 3.4, pz + this.sunDir.z * 1.6);

    this.updateShadowLamps(px, pz);
    this.vfx.update(dt);
    this.updateOcclusion(px, pz);
  }

  private updateProjectiles(world: SimWorld, alpha: number): void {
    const seen = new Set<number>();
    for (const p of world.projectiles) {
      if (!p.active) continue;
      seen.add(p.id);
      let mesh = this.projectileViews.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 0),
          emissive(p.colour, 0.95),
        );
        this.scene.add(mesh);
        this.projectileViews.set(p.id, mesh);
      }
      mesh.visible = true;
      mesh.scale.setScalar(p.radius * 1.5);
      mesh.position.set(p.x, p.z, p.y);
      mesh.rotation.x += 0.2;
      mesh.rotation.y += 0.15;
      // A trail of matching particles, so a bolt reads as moving fast.
      this.vfx.emit(burstForDamage(Object.keys(p.packet.amounts)[0] ?? 'physical'),
        p.x, p.z, p.y, 40, 0.016);
      void alpha;
    }
    for (const [id, mesh] of this.projectileViews) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.projectileViews.delete(id);
    }
  }

  private updateGroundEffects(world: SimWorld, dt: number): void {
    const seen = new Set<number>();
    for (const g of world.ground) {
      if (!g.active) continue;
      seen.add(g.id);
      let mesh = this.groundViews.get(g.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 22), emissive(g.colour, 0.3));
        mesh.rotation.x = -Math.PI / 2;
        this.scene.add(mesh);
        this.groundViews.set(g.id, mesh);
        // Delayed effects get a telegraph ring the moment they are created.
        if (g.delay > 0) this.vfx.telegraph(g.x, g.y, g.radius, g.delay, g.colour);
      }
      mesh.position.set(g.x, 0.07, g.y);
      mesh.scale.setScalar(g.radius);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      // Faint while telegraphing, solid once live.
      mat.opacity = g.delay > 0 ? 0.12 : 0.28 + Math.sin(this.elapsed * 5) * 0.05;

      if (g.delay <= 0 && g.dps > 0) {
        const kind = burstForDamage(g.damageType);
        for (let i = 0; i < 2; i++) {
          const a = this.rng.range(0, Math.PI * 2);
          const r = Math.sqrt(this.rng.next()) * g.radius;
          this.vfx.emit(kind, g.x + Math.cos(a) * r, 0.1, g.y + Math.sin(a) * r, 22, dt);
        }
      }
    }
    for (const [id, mesh] of this.groundViews) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.groundViews.delete(id);
    }
  }

  private updateItems(world: SimWorld, dt: number): void {
    const seen = new Set<number>();
    for (const ground of world.items) {
      seen.add(ground.item.uid);
      let view = this.itemViews.get(ground.item.uid);
      if (!view) {
        const group = new THREE.Group();
        const base = ITEM_BASES.find(ground.item.baseId);
        const rarity = RARITY[ground.item.rarity];

        // The item itself, as a small version of its real mesh.
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.32, 0.08),
          material('iron', rarity.colour, ground.item.uid, { roughness: 0.5 }),
        );
        mesh.castShadow = true;
        group.add(mesh);

        // Rarity beam. Deliberately restrained for common drops so the screen
        // does not become fireworks (§16).
        if (ground.item.rarity !== 'blank') {
          const height = ground.item.rarity === 'reliquary' ? 3.4 : ground.item.rarity === 'haunted' ? 2.4 : 1.5;
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.22, height, 8, 1, true),
            emissive(rarity.colour, ground.item.rarity === 'marked' ? 0.18 : 0.32),
          );
          beam.position.y = height / 2;
          group.add(beam);
          view = { group, ground, beam, bob: this.rng.range(0, Math.PI * 2) };
        } else {
          view = { group, ground, bob: this.rng.range(0, Math.PI * 2) };
        }
        void base;
        this.scene.add(group);
        this.itemViews.set(ground.item.uid, view);
      }

      view.bob += dt * 2.2;
      view.group.position.set(ground.x, ground.z + 0.25 + Math.sin(view.bob) * 0.05, ground.y);
      view.group.rotation.y += dt * 0.8;
    }
    for (const [uid, view] of this.itemViews) {
      if (seen.has(uid)) continue;
      this.scene.remove(view.group);
      view.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.itemViews.delete(uid);
    }
  }

  private updateFlickers(dt: number): void {
    for (const f of this.flickers) {
      f.phase += dt * 9;
      // Two out-of-phase sines look far more like fire than one, or than noise.
      const flicker = 1 + (Math.sin(f.phase) * 0.6 + Math.sin(f.phase * 2.7) * 0.4) * f.amount;
      f.light.intensity = f.base * flicker;
      for (const flame of f.flames) {
        flame.scale.set(1, 0.85 + flicker * 0.2, 1);
        flame.rotation.y += dt * 2;
      }
      if (f.emit) this.vfx.emit('embers', f.x, f.y, f.z, 9, dt);
    }
  }

  /**
   * Hands the shadow lamps to the two nearest torches.
   *
   * The borrowed torch's own light is muted to zero rather than hidden: an
   * invisible light leaves three.js's light list, which changes the shader
   * permutation and forces a recompile. Zero intensity keeps the list stable.
   */
  private updateShadowLamps(px: number, pz: number): void {
    for (const f of this.borrowed) f.light.intensity = f.base;
    this.borrowed.length = 0;

    if (!this.torchShadows) {
      for (const lamp of this.shadowLamps) lamp.intensity = 0;
      return;
    }

    const nearby = this.flickers
      .map((f) => ({ f, d: (f.x - px) ** 2 + (f.z - pz) ** 2 }))
      .filter((e) => e.d < 24 * 24)
      .sort((a, b) => a.d - b.d);

    for (let i = 0; i < this.shadowLamps.length; i++) {
      const lamp = this.shadowLamps[i]!;
      const entry = nearby[i];
      if (!entry) { lamp.intensity = 0; continue; }
      const f = entry.f;
      lamp.position.set(f.x, f.y, f.z);
      lamp.color.copy(f.light.color);
      lamp.intensity = f.light.intensity;
      lamp.distance = f.light.distance;
      lamp.shadow.camera.far = Math.max(6, f.light.distance);
      // Mute the original so the light is moved, not doubled.
      f.light.intensity = 0;
      this.borrowed.push(f);
    }
  }

  /**
   * Toggled by the graphics option and by the automated tests.
   *
   * `castShadow` has to be cleared, not just the intensity: three.js renders a
   * shadow map for every casting light regardless of how bright it is, so
   * muting the lamp saves nothing. Flipping it forces one material recompile,
   * which is fine for a setting the player changes occasionally and would not
   * be fine per frame.
   */
  setTorchShadows(enabled: boolean): void {
    if (this.torchShadows === enabled) return;
    this.torchShadows = enabled;
    for (const lamp of this.shadowLamps) {
      lamp.castShadow = enabled;
      lamp.shadow.map?.dispose();
      lamp.shadow.map = null;
    }
  }

  /**
   * Fades geometry between the camera and the player (§6).
   * Raycasts once per frame along the camera→player line and fades whatever it
   * hits, restoring anything that is no longer in the way.
   */
  private updateOcclusion(px: number, pz: number): void {
    const playerPos = new THREE.Vector3(px, 1.0, pz);
    const camPos = this.cameraRig.camera.position;
    const dir = playerPos.clone().sub(camPos);
    const distance = dir.length();
    dir.normalize();

    this.raycaster.set(camPos, dir);
    this.raycaster.far = distance - 0.6;
    const hits = this.raycaster.intersectObject(this.zoneGroup, true);

    const nowFaded = new Set<THREE.Mesh>();
    for (const hit of hits) {
      const mesh = hit.object as THREE.Mesh;
      if (!(mesh instanceof THREE.Mesh)) continue;
      const mat = mesh.material as THREE.Material;
      if (Array.isArray(mat)) continue;
      nowFaded.add(mesh);
      if (!this.faded.has(mesh)) {
        // Clone on first fade so we never mutate the shared cached material.
        mesh.userData.originalMaterial = mat;
        const clone = mat.clone();
        clone.transparent = true;
        clone.depthWrite = false;
        mesh.material = clone;
        this.faded.add(mesh);
      }
      const m = mesh.material as THREE.Material;
      m.opacity = damp(m.opacity, 0.22, 0.002, 0.016);
    }

    for (const mesh of [...this.faded]) {
      if (nowFaded.has(mesh)) continue;
      const m = mesh.material as THREE.Material;
      m.opacity = damp(m.opacity, 1, 0.002, 0.016);
      if (m.opacity > 0.97) {
        m.dispose();
        mesh.material = mesh.userData.originalMaterial as THREE.Material;
        this.faded.delete(mesh);
      }
    }
  }

  // --- hit feedback ------------------------------------------------------

  /** Called from the event bus when something is struck (§8). */
  onHit(x: number, y: number, z: number, damageType: string, amount: number, crit: boolean): void {
    const power = clamp(0.6 + amount / 40, 0.6, 2.0) * (crit ? 1.6 : 1);
    this.vfx.burst(burstForDamage(damageType), x, y, z, power);
    // A physical hit throws dust as well as blood, which is what gives a swing
    // its sense of contact rather than of passing through.
    if (damageType === 'physical') this.vfx.burst('sparks', x, y, z, power * 0.6);
    if (amount > 0 && (damageType === 'physical' || crit)) {
      this.vfx.decal(x, z, 0.7 + power * 0.35);
    }
  }

  onDeath(actor: Actor): void {
    this.vfx.burst('blood', actor.x, actor.height * 0.4, actor.y, 1.8);
    this.vfx.burst('dust', actor.x, 0.15, actor.y, 1.4);
    this.vfx.decal(actor.x, actor.y, 1.4);
  }

  shake(intensity: number, duration: number): void {
    this.cameraRig.shake(intensity, duration);
  }

  // --- picking -----------------------------------------------------------

  /**
   * Returns the actor under the pointer, if any.
   *
   * Picking is done in screen space against the actor's vertical extent, not by
   * intersecting the ground plane. At a 38-degree camera a character's chest
   * projects roughly 1.3 world units away from their feet, so a ground-plane
   * test forces the player to click at an enemy's *feet* rather than at the
   * enemy — which feels broken every single time it happens.
   */
  pickActor(ndcX: number, ndcY: number, world: SimWorld, playerId: number): Actor | null {
    const camera = this.cameraRig.camera;
    const canvas = this.renderer.domElement;
    const halfW = canvas.clientWidth * 0.5;
    const halfH = canvas.clientHeight * 0.5;
    const px = ndcX * halfW;
    const py = ndcY * halfH;

    const base = new THREE.Vector3();
    const top = new THREE.Vector3();
    const edge = new THREE.Vector3();

    let best: Actor | null = null;
    let bestScore = Infinity;

    for (const actor of world.actors) {
      if (!actor.alive || actor.id === playerId || actor.faction === 'player') continue;

      base.set(actor.x, 0.1, actor.y).project(camera);
      top.set(actor.x, actor.height, actor.y).project(camera);
      if (base.z > 1 || top.z > 1) continue;

      const bx = base.x * halfW;
      const by = base.y * halfH;
      const tx = top.x * halfW;
      const ty = top.y * halfH;

      // The actor's collision radius, projected, so the pick target shrinks
      // correctly with distance instead of being a fixed pixel blob.
      edge.set(actor.x + actor.radius + 0.35, actor.height * 0.5, actor.y).project(camera);
      const mid = new THREE.Vector3(actor.x, actor.height * 0.5, actor.y).project(camera);
      const radiusPx = Math.max(14, Math.abs(edge.x - mid.x) * halfW);

      // Distance from the pointer to the actor's vertical body segment.
      const segX = tx - bx;
      const segY = ty - by;
      const lenSq = segX * segX + segY * segY;
      const t = lenSq > 0
        ? clamp(((px - bx) * segX + (py - by) * segY) / lenSq, 0, 1)
        : 0;
      const cx = bx + segX * t;
      const cy = by + segY * t;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > radiusPx) continue;

      // Prefer the closest to the pointer, breaking ties towards the nearer
      // actor so an enemy in front is picked over one behind it.
      const score = dist - base.z * 40;
      if (score < bestScore) { bestScore = score; best = actor; }
    }
    return best;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.cameraRig.resize(width / Math.max(1, height));
  }

  render(): void {
    // `renderer.info.render` is reset at the start of every `render()` call, and
    // the composer makes several per frame -- so read straight after a composed
    // frame and you get the output pass's single fullscreen triangle instead of
    // the scene. Holding the reset until the next frame accumulates every pass,
    // which is both what the debug overlay wants and a stable number to assert
    // on.
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.cameraRig.camera);
  }

  /** Toggled by the graphics option and by the automated tests. */
  setBloom(enabled: boolean): void {
    this.bloomEnabled = enabled;
  }

  /** Renderer statistics for the debug overlay (§55). */
  get stats(): { calls: number; triangles: number; particles: number; views: number } {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      particles: this.vfx.activeParticles,
      views: this.actorViews.size,
    };
  }

  dispose(): void {
    this.clearZone();
    this.vfx.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
