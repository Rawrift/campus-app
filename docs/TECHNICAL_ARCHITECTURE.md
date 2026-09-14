# TECHNICAL ARCHITECTURE

## 1. Why TypeScript and Three.js

The engine was chosen by auditing what could actually be built, run and
verified in the target environment, not by preference.

| Candidate | Verdict |
| --- | --- |
| Godot 4 | Not installed. Even fetched, `--headless` disables the renderer, so the game could be compiled but never seen or visually regression-tested. |
| Unreal | Not installed, and unbuildable without a GPU. |
| Unity | Not installed. |
| Blender (asset pipeline) | Not installed — see `ASSET_PIPELINE.md` for the consequence. |
| **TypeScript + Three.js (WebGL 2)** | **Runs, renders, screenshots and regression-tests today**, verified before any code was written. |

The governing criterion was: *a thing that can be built, whose code is
verifiable, with a reproducible pipeline* — ranked above a stack that produces
prettier stills but cannot be executed or tested.

**Portability is preserved by architecture, not by engine choice.** All gameplay
lives in `src/sim/`, which imports zero rendering code. Porting to another
engine means rewriting `src/render/` and `src/ui/`, not the game.

---

## 2. The layering rule

```
          ┌──────────────────────────────────────────┐
          │  game.ts  (the only module that knows     │
          │           about every layer)              │
          └───────┬──────────┬──────────┬────────────┘
                  │          │          │
      ┌───────────▼───┐  ┌───▼────┐  ┌──▼──────┐
      │  render/      │  │  ui/   │  │ audio/  │   read-only consumers
      └───────┬───────┘  └───┬────┘  └──┬──────┘
              │              │          │
              └──────────────┴──────────┘
                             │  (reads state; subscribes to events)
                    ┌────────▼─────────┐
                    │  sim/  +  world/ │   the game itself
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  core/  +  data/ │   primitives and content
                    └──────────────────┘
```

Enforced rules:

1. **`src/sim/` never imports `src/render/`, `src/ui/` or `src/audio/`.**
2. The renderer **reads** simulation state each frame and never writes to it.
3. Cross-layer communication is the typed event bus (`src/core/events.ts`) in
   one direction, and direct reads in the other.

Consequences, all of which the project relies on:

- The entire game runs and is tested in Node with no browser
  (`tests/sim.test.ts` plays full fights headlessly).
- The simulation is deterministic given a seed, which makes the loot
  distribution testable over 200,000 samples.
- The simulation could be moved to a server for multiplayer without being
  rewritten.

---

## 3. Module map

### `core/` — engine-agnostic primitives

| Module | Responsibility |
| --- | --- |
| `rng.ts` | mulberry32 seeded PRNG with weighted picks, forking and string seeds. Nothing in the game calls `Math.random` for gameplay. |
| `events.ts` | Typed event bus. Handlers may unsubscribe themselves during dispatch (item effects do), so the handler set is copied before iteration. |
| `time.ts` | Fixed-timestep clock at 60 Hz, with hit-stop, time scaling, a spiral-of-death guard and an interpolation alpha. |
| `math.ts` | Framerate-independent damping, angle helpers, cone tests. |
| `fsm.ts` | Finite state machine used by AI. Chosen over a behaviour tree because ARPG enemies have few, clearly-named states and the debug overlay can print the state name. |
| `pool.ts` | Object pooling with double-release protection. |
| `registry.ts` | Stable-ID content registry. Throws on unknown IDs (content bugs should be loud); `find` is the non-throwing variant for save files. |

### `sim/` — the game

`stats.ts` holds the stat model: base values plus flat and additive-percentage
modifiers, resolved lazily and cached. Attributes feed derived stats in exactly
one place, so rebalancing is a single edit.

`damage.ts` is the **only** code that changes health. Everything routes through
`resolveDamage`, so crits, per-element resistance, armour, elite modifiers, item
hooks and damage numbers stay consistent.

`world.ts` owns actors, projectiles, ground effects, dropped items and the
navigation grid, plus a coarse spatial hash rebuilt each tick. Actor collision
*pushes* rather than blocks, so a pack cannot form an impassable wall.

`ai.ts` gives each enemy an FSM (`idle → patrol → alert → chase → attack →
reposition`, with `flee`, `leash` and `dead`) plus steering that combines
"approach my preferred range" with "get out of my neighbours' way". The
separation term is why a pack surrounds the player instead of queueing into
their weapon.

`combat.ts` turns skill and attack *data* into world effects. Nine shape kinds
(arc, line, projectile, ground area, self area, dash, curse, chain, leap) are
implemented once each; adding a skill is data, adding a *kind* of skill is one
new case.

`pathfind.ts` is A* with no corner-cutting and string-pulled waypoints, used
**only** by the player. Enemies deliberately steer instead, because a pack that
paths perfectly around corners reads as robotic and thirty A* queries a frame is
not free.

### `world/` — levels

`builders.ts` provides carving primitives. Zones are *authored* but written as
composed operations rather than tile arrays, because a 90×90 tile array is
unreadable and unrevisable — and because those primitives are exactly what a
procedural generator would call later.

`zoneRuntime.ts` handles proximity-triggered encounters, so a map is not thirty
active AI agents from the moment it loads.

### `render/` — presentation

`textures.ts` paints every surface into a `<canvas>` from value noise, producing
albedo **and a correlated roughness map**: scratches are lighter *and* smoother,
rust is darker *and* rougher. That correlation is most of what separates a
believable surface from a tinted plane.

`geometry/character.ts` is a rig of nested `Group`s rather than a skinned mesh.
That is a deliberate trade: skinning deforms better, but this project generates
every mesh at runtime and swaps armour live, and rigid segments parented to
joints make that swap an `add`/`remove` with no skeleton rebinding and no risk
of binding a new piece to the wrong bone. At ARPG camera distance the difference
is invisible; the robustness is not.

`terrain.ts` merges the whole level into a handful of geometries and emits wall
faces only where a wall touches walkable ground.

`vfx.ts` pools ~900 particles into a single `Points` draw with a small custom
shader (world-unit particle sizing is not available from `PointsMaterial`), plus
pooled decals and telegraph rings.

---

## 4. The frame

```
requestAnimationFrame
  └─ Clock.tick(now) → N fixed steps (0 while hit-stop is active)
       ├─ handleInput()                      once per frame
       ├─ for N: simulate()                  fixed 1/60 s
       │    ├─ snapshot previous transforms  (for interpolation)
       │    ├─ Zone.update(dt)
       │    │    ├─ PlayerController.update
       │    │    ├─ EnemyController.update × n
       │    │    └─ SimWorld.step  (statuses, collision, projectiles,
       │    │                       ground effects, item physics)
       │    ├─ ZoneRuntime.update            proximity triggers
       │    └─ auto-pickup sweep
       ├─ render(dt)
       │    ├─ GameScene.update(world, player, dt, alpha, …)
       │    ├─ GameScene.render()
       │    └─ Hud.update / Minimap.draw
       └─ Input.endFrame()
```

The simulation runs at a fixed 60 Hz regardless of display refresh, so attack
timings and AI decisions are frame-rate independent and reproducible. The
renderer interpolates between the last two steps using `clock.alpha`, so motion
stays smooth on a 144 Hz display.

---

## 5. Save format

Three rules, each learned from how saves usually break:

1. **Everything is addressed by stable string ID** — `baseId`, `affixId`,
   `skillId`, `zoneId` — never by array index or object reference. Reordering
   or adding content in a later patch cannot corrupt an existing character.
2. **Derived values are not stored.** Max health, armour and damage are
   recomputed from archetype + level + gear on load, so a balance change applies
   to existing characters instead of being frozen into the file.
3. **Unknown content degrades, it does not throw.** An item whose base was
   removed is dropped with a warning and the rest of the character loads.

Migration walks `v1 → v2 → v3` additively rather than needing a path per
version pair. A file from a *newer* version is refused rather than mangled.

---

## 6. Performance

Measured under the automated stress scenario (28 actors, SwiftShader software
rendering, no GPU): ~720 draw calls, ~19k triangles.

Design decisions that keep it there:

- Terrain merged into ~5 geometries instead of one mesh per tile (a 86×82 zone
  is ~7000 tiles).
- Props built once per (kind, variant) and cloned — a graveyard of forty stones
  costs four geometry builds.
- Materials cached by (kind, colour, seed).
- All particles in one `Points` draw.
- Projectiles, ground effects and decals pooled.
- Proximity-triggered spawning, so inactive parts of a map cost nothing.
- Spatial hash for all radius/cone queries.
- Shadow casting limited to the key light, with the frustum following the
  camera.

The frame times reported by `npm run smoke` (~340 ms median) are SwiftShader
software rasterisation with no GPU at all; they measure *stability and draw-call
budget*, not real-world performance. On hardware, the 720 draw calls and 19k
triangles are a comfortable 60 FPS budget.

---

## 7. Testing

| Layer | How |
| --- | --- |
| Formulas, loot, affixes, inventory, save | `npm test` — 106 Vitest tests, no browser |
| AI, elites, boss phases, full fights | Same suite: `tests/sim.test.ts` plays real fights headlessly |
| Level design | `tests/zones.test.ts` asserts full grid connectivity, that every spawn/interactable/exit destination is on walkable ground, and that the dungeon has its required structure |
| The actual running game | `npm run smoke` — boots the real build in headless Chromium, plays a session with synthetic input, and checks 44 runtime behaviours |
| Visuals | `node tools/shots.mjs` — captures scenario screenshots for review |

The smoke test is the important one: it is what makes statements about the game
working *verifiable* rather than asserted. It caught four real bugs that unit
tests structurally could not — a CSS specificity error that made the game
completely unclickable, input that ignored quick taps, ground-plane actor
picking that made clicking an enemy's body miss, and point lights emitting
nothing because three.js uses physical units.
