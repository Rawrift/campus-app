# KNOWN ISSUES

Honest state of the vertical slice. Everything here is either a known
limitation of the scope, or a defect that is understood but not yet fixed.

Last updated after the Phase H audit.

---

## Limitations of scope (deliberate)

These are **not** bugs. They are things the vertical slice does not include, and
the architecture is built to accept them later.

| Area | State | Notes |
| --- | --- | --- |
| **Stash** | Stubbed | The footlocker reports its contents but has no transfer UI. It is serialised in the save format and `PlayerController` already separates stash from bag. |
| **Vendor buying** | Selling only | The trade panel sells; there is no buy inventory. Gold accumulates and is spent nowhere except implicitly. |
| **Blacksmith** | Refills draughts | No repair or upgrade economy. |
| **Procedural dungeons** | Architecture only | Zones are hand-authored from carving primitives, which are exactly what a generator would call. `§27` of the brief asks for a designed dungeon first, and that is what this is. |
| **Difficulty tiers / NG+** | Not implemented | `Zone.spawn` already accepts a level override and scales stats, which is the mechanism such a mode would use. |
| **Multiplayer** | Not implemented | The simulation is deterministic, seeded and rendering-free, so it is not precluded. No netcode exists. |
| **Rebindable controls** | Table exists, no UI | `Input.rebind()` works; nothing calls it from a settings screen. |
| **Dismemberment** | Not implemented | Gore is blood, decals and corpses. The brief lists limb loss as "if technically viable"; now that the bodies are skinned rather than rigid it is *harder* than it was, since a limb is no longer a separable mesh -- it would mean a second bound mesh per severable part. Still not worth the time against other priorities. |
| **Dodge roll** | Only as a skill | The Pallwalker's Slip is the dodge. There is no universal dodge button; the brief listed one as conditional on it fitting the combat, and a committed-attack design reads better without one. |

---

## Known defects

### Screenshots are the only visual regression test
Four faults in this release — a whole terrain layer back-face culled, every
texture painted 2.6x too dark, wall UVs stretched by the wall height, and mire
mirroring the sky — were invisible to 120 unit tests and 45 browser checks. All
four were found by looking at rendered frames and then isolating meshes by hand.
`tests/terrain.test.ts` now covers the winding predicate, but nothing asserts
that a surface is lit, textured or the colour it was authored as. A perceptual
check (sample the rendered ground, assert its mean and variance stay in a band)
would have caught three of the four and does not exist.

### Nobody has played it
Still the honest headline limitation. An automated bot now plays the full route
and the boss as all three archetypes, which proves the run is completable and
caught two real balance faults — but a bot uses potions perfectly, never
mis-clicks and never panics. It recorded **zero deaths**, which almost certainly
means the game is easier for it than for a person, and says nothing about
whether the combat *feels* good.

### Torch shadows cost a third of the frame for almost nothing
Implemented and available in the options, off by default. See the changelog for
the measurement.

### Performance in software rendering is not representative
`npm run smoke` reports median frames close to a second. That is SwiftShader
software rasterisation with **no GPU at all** — the only renderer available in
the verification environment. It measures stability and draw-call budget, not
real performance. The same scene is ~545 draw calls with 28 actors, which should
be a comfortable 60 FPS budget on hardware, but **this has not been measured on
a real GPU** and that should be treated as an estimate rather than a result.

Skinning made this worse in a way worth naming: vertex skinning is per-vertex
work on every frame, and a software rasteriser does it on the CPU with no
parallelism, so the measured frame time rose sharply when the rigs were bound.
On a GPU the same work is close to free. The number that *is* meaningful is the
vertex count, which is why the binder keeps its geometry indexed — de-indexing
to satisfy `mergeGeometries` roughly tripled it.

Because the frame time is this long, the clock's spiral-of-death guard caps how
many fixed simulation steps a frame may catch up, so the game runs in slow
motion here. Any smoke check that waits for the simulation to reach a state must
wait on that state, not on wall-clock — one of them did not, and failed on a
game that was working fine, just slowly.

### Draw calls scale with prop count, not with screen area
Props are cloned per instance rather than instanced, so a dense zone costs a
draw call per prop even when off-screen. Frustum culling helps, but the fix is
`InstancedMesh` per (kind, variant). This is the single highest-value
optimisation left.

### The bundle is one 787 KB chunk
Almost all of it is Three.js. It is not code-split, so first load fetches
everything. Fine for a game, poor for a web page.

### Occlusion fade is a single raycast
Only geometry on the exact camera→player line fades. A wall that hides the
player's shoulder but not their centre stays opaque. A capsule cast or a small
raycast fan would fix it.

### Enemy pathing is steering, not pathfinding
Enemies steer with obstacle avoidance and wall sliding rather than running A*.
Around a long L-shaped corridor they can press against a wall until the player
moves into line of sight. This is a deliberate trade (thirty A* queries a frame,
plus robotic-looking perfect pathing), but it is visible in the dungeon's
tighter corridors.

### The stash count is the only feedback on a full bag
When the pack is full, pickup fails with a notification, but there is no
visual queue of items left on the ground beyond their world beams.

### Audio has no spatialisation
Every sound plays at the same level regardless of distance. `PannerNode` per
source would fix it; the synthesis architecture already isolates each voice.

### Elite ward aura is reapplied per tick
`wardAura` writes a stat modifier onto every ally within radius each frame and
relies on the source being cleared on death. It works and cannot leak (the
modifier is removed explicitly), but it is O(allies) per warden per tick, and a
subscription model would be cleaner.

### Save is a single slot
`SaveStorage` supports named slots and `listSaves` returns them sorted, but the
UI only ever writes `main`.

---

## Fixed during development

Recorded because the causes are non-obvious and worth remembering.

| Bug | Cause | How it was found |
| --- | --- | --- |
| Every actor took 10% damage | `damageTaken` defaulted to 0, and the clamp raised it to the 0.1 floor. Multiplier stats need identity defaults. | Unit test asserting a kill |
| Stats inflated on every gear swap | `Equipment.applyTo` removed modifiers only for *currently equipped* items, so a swapped-out item's modifiers stayed forever | Save round-trip test |
| The game was completely unclickable | CSS `#ui-root > *` (specificity 1,0,0) beat `.vignette { pointer-events: none }`, so a full-screen overlay swallowed every world click | Smoke test |
| A quick click did nothing | Input acted only while a button was *held*; a tap releases before the next frame | Smoke test |
| Clicking an enemy's body missed | Actor picking intersected the ground plane; at a 38° camera a chest projects ~1.3 units from the feet | Smoke test |
| Torches emitted no light | three.js uses physical light units (`intensity / distance²`); single-digit intensities are effectively zero | Screenshot review |
| Everything was a black silhouette | Near-overhead sun with low ambient leaves vertical faces unlit | Screenshot review |
| Ground rendered as flat grey | Two causes: one texture repeat per 1×1 tile is ~20 screen pixels so detail fell below a pixel; and albedo averaged 24/255 (~9% reflectance), leaving no signal for light to reveal | Screenshot review + measuring the texture |
| Outdoor zones were entirely in shadow | 3-unit walls ringed every open area; wall height is now per-zone | Screenshot review |
| Road encounters spawned off the road | The road is carved with a deterministic wander, so hand-typed coordinates drifted off it. Spawns now resolve against the built grid | Zone connectivity test |
