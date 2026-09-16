# CHANGELOG

## 0.6.0 — Architecture, and the occlusion cutout it needed

### Gateways

Every room in the abbey sat on the same plane with nothing above head height
between them, so moving through it read as crossing a floor plan rather than
passing through architecture. Each threshold now carries an arch, scaled so its
columns land on the corridor walls rather than standing in the doorway. The
belfry gets the widest one: the boss should be behind something.

The nave and chapter house also got wall furniture — banners, niches, candles —
because bare walls above knee height are exactly where the eye goes once an arch
has drawn it upward, and a few more pillars through the aisles.

None of this was safe to add before the change below. Walking under an arch
means walking behind one, and behind one prop used to mean every prop of that
material vanishing.

### 915 draw calls to 415

The budget check failed after the arches went in, at 915 against its 900 limit.
Raising the limit would have been the wrong move — the number crept up because
of real waste, not because the scene finally got as heavy as the budget allowed.

Three finds, in order of size:

- **An enemy's rigid parts did not need to be meshes.** A weapon, a claw or a
  buckle is rigid and hangs off exactly one bone, so leaving each as its own
  mesh looks correct — and costs a draw call each, doubled by the shadow pass.
  Measured on a villager: eight such meshes totalling 288 vertices against 743
  for the whole body. Binding them to their bone with full weight is
  mathematically identical to parenting them there, so the animation is
  unchanged and they merge into the single skinned mesh.
- **Rags were named for nothing.** In this rig a name means "the animator moves
  this individually, never merge it". Nothing ever looked the rags up. The name
  bought six draw calls per enemy for cloth that simply hangs off a torso.
- **Near-identical tints each bought a material family.** Prop builders author
  colours by eye, so stone appeared as 0x6a665e, 0x615c53, 0x635e55 and
  0x6a604e — four greys nobody can tell apart at this distance, each with its
  own batch, times the texture variants. Tints are now snapped to the nearest 16
  per channel, which moves a colour by at most 3%. Opaque scenery batches: 71 to
  50.

An enemy is now one mesh with five draw groups, down from nine and eleven.

### The occlusion cutout

Scenery between the camera and the character has to get out of the way. The way
it did that was a raycast that faded whatever mesh it hit, and that is
fundamentally incompatible with how this renderer draws: terrain and props are
merged into one mesh per material to hold the draw-call budget, so "whatever
mesh you hit" is *every wall in the zone*, or every wooden object in it.

Measured before touching it — 36 of 40 camera positions around the hub had
something fading, up to five batches at once, the largest 868 vertices. Adding
prop density had made a long-standing bug much louder.

It is now a per-fragment cutout in the scenery shaders. Anything drawn closer to
the camera than the character, inside a disc around them on screen, is dithered
away with a 4×4 ordered dither. Discarding rather than blending is deliberate: a
discard needs no transparent pass, no depth sorting, and no cloned material.

Because it has no concept of a mesh, batching cannot break it — and it fixes
what the raycast could never do, which is the wall that hides a shoulder but not
the character's centre. One ray only ever found what sat on the exact centre
line.

Actors are not patched. An enemy standing between the camera and the player is
information the player needs, not an obstruction.

Three things had to be got right, and each was wrong first:

- **The projection lagged a frame.** `Object3D.project` reads
  `matrixWorldInverse`, which three.js refreshes only when it renders — so the
  cutout was projected through the previous frame's camera and sat visibly
  beside the character whenever the camera moved.
- **The dither was striped.** A threshold that varies mostly along one axis
  dithers into vertical lines, which reads as damage rather than as a soft edge.
  The 4×4 Bayer is now built from two nested 2×2 levels, so it scatters in both.
- **The floor was being cut.** Ground in front of the character is genuinely
  closer to the camera, so the disc punched a hole in it and the background
  showed through. Upward-facing surfaces are exempt: in a top-down view the
  floor never hides anyone.

## 0.5.0 — Air, contact, and a world with things in it

### Ambient occlusion

Direct lighting cannot darken the crease where a barrel meets the floor, the
inside of a doorway, or the gap under a cart, because nothing is casting a
shadow there — the light simply never had a path in. Without that darkening
every object reads as sitting *on top of* the scene rather than in it, and shadow
maps do not substitute: they resolve nothing at the few centimetres where two
surfaces meet, which is exactly the scale that says "these things are touching".

A GTAO pass now runs before bloom, tuned against an A/B sweep rather than to
taste: radius 1.0 world units, scale 1.3. A stronger setting grounded things
harder and started smearing dark halos across open ground, so it was not taken.
It is a graphics option, defaulting on.

Measured rather than assumed, and the measurement changed the design: at full
resolution the pass **doubled** the frame, because it has to render the whole
scene a second time into a depth/normal buffer before it can shade anything.
Occlusion is a low-frequency signal with no edges of its own to lose, so the
buffers now run at half the frame size and upsample — 106% down to 35%, with the
A/B crops indistinguishable. `npm run smoke` measures the cost each run, the way
it already measured torch shadows.

### Ash in the air

Every particle in the game was *caused* by something — a blow, a torch, a spell
— which left the air itself empty. Empty air is a quiet but persistent tell that
a scene is a diorama: nothing ever crosses between the camera and the character,
so the space between them reads as vacuum rather than as distance.

Ash now drifts continuously through a volume around the player, seeded in a ring
so motes never pop in on top of the camera, nearly weightless and heavily
dragged so it hangs rather than falls. Density is authored per zone; the crypt
has twice the village's. The ambient emitter has its own cap on the particle
pool, because ash is continuous and combat is bursty — without one a still room
fills the pool and the first blow of a fight silently drops its blood and sparks.

### The ground had polka dots

The gravel in the ground texture was painted at about a quarter of the ground's
own brightness. A stone that dark is a *hole*, not a stone, and a few hundred of
them tile into a field of dots that reads as pattern — worse than no gravel,
because the eye locks onto the repeat. Real stones sit within a stop or so of the
earth they lie on; what separates them is the relief map, not the albedo.

### Denser zones, and scatter that keeps its distance

Prop counts are up roughly 60% across all three zones, with new kinds in each
mix. A settlement people fled reads as abandoned when the frame is full of what
they could not carry; a handful of barrels on bare ground reads as a level that
is not finished.

Raising the counts alone made it worse, because `scatter` placed uniformly at
random — which clumps, and two barrels 20cm apart do not read as two barrels,
they read as one broken mesh. It now rejects a candidate that lands within a
minimum distance of one already placed, so the density a zone asks for is bounded
by whether the placement can keep things apart rather than by taste.

Sick-tree foliage was also darkened; it was the one thing outdoors still reading
bright enough to pull the eye off the character.

### Every box cost six draw calls

Chasing the density regression turned up something that had been quietly true
for the whole project. Three.js primitives carry material groups so a box can
take a different material per face — `BoxGeometry` ships six, `CylinderGeometry`
three — and the renderer issues one draw call *per group*, even when every group
points at the same material. Merging preserves them. So a rig assembled from
boxes and cylinders was paying six draw calls per merged part, and the merging
that exists to cut draw calls was cutting objects only.

With one material there is nothing for the groups to select between, so
clearing them is exactly equivalent. Both rigs and the static prop batches now
do. A villager went from 41 draw groups to 11; with 24 of them on screen the
scene's total fell from 1234 to 454.

### Every prop had its own material

Raising the density immediately blew the draw-call budget, which turned out to
be worth the trouble it caused. The renderer batches static props *by material*,
and every prop builder was asking for its texture with `rng.int(0, 999)` as the
seed. The material cache keys on that seed, so a thousand possible seeds meant a
thousand possible materials: a zone of 800 props produced hundreds of one-prop
batches and the merging that exists to hold the budget was collapsing nothing.
It also made boot generate a fresh albedo, roughness and normal map for each.

Four variants per material now. That is enough to break up a row of barrels at
this camera distance; the variety that actually reads comes from per-prop
rotation, scale and the builders' own randomised geometry, none of which costs a
batch.

## 0.4.0 — Bodies instead of puppets

The rig was the clearest thing left between this and the reference: the parts
moved, the body did not.

### The body is skinned

Both rigs — the player and all seven enemy body plans — are now one
`SkinnedMesh` bound to the joint hierarchy, instead of rigid segments parented
to it. A rigid upper arm and a rigid forearm cannot share a surface, so every
bent elbow, knee, waist and neck was a seam where two solids slid through each
other. At ARPG distance that does not read as low detail, it reads as *puppet*.

Armour, hair and weapons stay rigid and parented to bones. That is not a
compromise in either direction: a pauldron genuinely does not deform, and
keeping it off the skin leaves a live armour swap a single `add`/`remove` with
no rebinding.

Weights are computed rather than painted (`render/geometry/skin.ts`). Each part
is submitted with the short list of bones it is *allowed* to bind to — a thigh
may bind to its own hip and knee and to the pelvis, never to the other thigh —
which is the one real advantage of generating every mesh in code. Generic
nearest-bone auto-weighting has no way to know that and pinches the crotch and
the armpits every time. Influence falls off from a bone's line segment rather
than its origin, because binding to points pinches each limb at its middle.

### Enemies got elbows and knees

Every body plan built an arm or a leg as one loft running the limb's whole
length, rotating about the shoulder or hip. A limb that cannot bend is the
clearest possible statement that a thing is not alive, and at ARPG distance a
bending knee is the strongest readability cue a walking creature has. Each limb
now spans a mid joint, placed a little above halfway because the upper arm is
shorter than the forearm and the thigh than the shin on nearly every animal.
The knee flexes through the swing phase and straightens to take the weight; the
elbow closes at the top of a wind-up and opens through the strike.

### Joint timing

Every joint used to be damped toward its target at one rate, so the whole body
started and stopped on the same frame and moved as one rigid unit that happened
to be hinged. Stiffness is now per joint, running from the pelvis (fastest,
leads) out to the hands, feet and head (slowest, settle last) — follow-through
and overlapping action, which is most of the difference between a hinged shape
and a body.

The walk cycle got the mechanics that were missing with it: lateral weight
shift onto the standing leg, pelvic drop on the swing side, pelvis and
shoulders counter-rotating with the shoulders leading, arms tucking in as the
pace rises, and a head that holds its heading against the shoulder twist.

### Draw calls

`mergeGeometries` emits one draw group per input geometry, so six body parts
sharing three materials would have cost six draw calls per character. Parts are
merged by material first, which with 28 actors on screen is the frame budget.

## 0.3.0 — The world becomes visible

A pass on visual fidelity, prompted by the honest verdict that the game so far
was "geometric shapes". Most of it turned out to be four faults rather than a
missing art budget.

### The ground was never drawn

Every horizontal terrain quad — floor, path, mire, the surround beyond the
playable area, and the wall tops — was emitted with its corners in clockwise
order seen from above while carrying an upward normal. With `side: FrontSide`
all of it was back-face culled. Nothing errored; the background simply showed
through where the ground should be, and a uniform background reads exactly like
a flat, untextured floor. Found by hiding the terrain meshes one at a time and
noticing that hiding the floor changed nothing on screen.

`quad()` now derives its triangle order from the normal it is given rather than
trusting the corner order, so no call site can reintroduce it, and
`tests/terrain.test.ts` covers the predicate.

### Every texture in the game was painted 2.6x too dark

Under three.js colour management `new THREE.Color(0x6e6149).r` is the **linear**
component (0.156), not the 0.43 the hex describes. All procedural textures are
painted into sRGB canvases, so writing `colour.r * 255` put the linear number in
as though it were sRGB: mid-tan earth landed at RGB 40 instead of 110. That is a
flat darkening plus a loss of saturation applied to every surface at once, and
it was being compensated for with far too much light — which is what made the
world read as grey shapes under a floodlight.

Textures now go back through sRGB before they are painted, and the lighting has
come down to match: ambient and sun roughly halved in every zone, torches and
braziers from 34/52 to 15/23, exposure from 1.12 to 1.05.

### Surfaces that lied about their material

- **Walls read as vertical planks.** A wall face is one tile wide and
  `wallHeight` tall, but both UV axes got the same scale, stretching the
  stonework by that factor. Each axis is now scaled by the length it spans, so
  the masonry courses are square.
- **Mire read as pale plastic.** At roughness 0.35 it mirrored the sky gradient
  out of the environment map and every mire tile became a flat blue rectangle.
  Now 0.62 and darker: a wet sheen off the torches, no sky.
- **The ground tiled visibly.** Gravel was clipped at the texture edges and cart
  ruts did not meet across the wrap, so the repeat drew a dead-straight grid
  across the zone. Stones are drawn through all nine wraps, ruts close on
  themselves and alternate axis, and the per-tile height jitter — which opened a
  hairline crack along every shared edge — is gone.

### Elites stopped hiding themselves

The `core` modifier put an additive sphere around the creature's chest. Bloom
turned it into an opaque disc wider than the enemy, which hid the very
silhouette §22 asks an elite to change. It is now a ring at the feet plus three
orbiting shards.

### Models

Bodies, equipment and all seven enemy body plans are built by lofting
hand-authored cross-sections (`src/render/geometry/loft.ts`) rather than from
boxes, spheres and cylinders — ribcages that taper to a waist, blades with a
lens-shaped section, helmets as shell plus brow band plus cheek lames, a spine
that curves rather than a tilted tube.

### Also

- `renderer.info` no longer reports the output pass's single fullscreen
  triangle as the whole frame; the reset is held until the next frame so every
  composer pass is counted.

## 0.2.0 — Playable build

Hosting, plus the balance work that only became possible once the game could
actually be measured being played.

### Hosting
- `npm run build:hosted` produces a **single self-contained HTML file**
  (~780 KB) that boots and plays straight off disk, verified from `file://`.
- A GitHub Pages workflow that builds, runs the tests, and deploys on push.
  The deploy is gated on `npm test`, so a build that fails its own tests never
  becomes the thing people play.
- `docs/HOSTING.md` covers the four options, and why PlayCanvas is not one of
  them: it hosts PlayCanvas *projects*, not arbitrary WebGL builds, so using it
  would mean rewriting the ~5,000 lines of Three.js and DOM presentation code
  rather than deploying what exists.

### Balance, measured rather than assumed
An automated playthrough (`tests/playthrough.test.ts`) plays the real game
through the Marches and the boss as all three archetypes, using only the public
player API. It found two genuine problems:

- **The Ashen was resource-starved.** Its opener cost 6 Ember against a 3.2/s
  regeneration, throttling it to roughly a quarter of the melee archetypes'
  sustained damage. Openers are now free for every archetype, which is also
  what the other two already did.
- **The Pallwalker's opener was a third weaker** than the others. Raised from a
  0.62 to a 0.72 coefficient.

Measured spread across the three openers is now 1.28x, down from unbounded.
A run reaches level 5-6 crossing the Marches and kills the boss in 32-88s.

### Quality of life
- The essential controls are on the start screen, instead of only in a menu a
  new player has no reason to open.
- Ward charges from the reliquary effect now show as pips on the HUD; they
  accumulated invisibly before.
- The HUD is hidden behind full-screen menus rather than glowing faintly
  through them.

### Torch shadows: implemented, measured, and left off
Shadow-casting torchlight was the single largest atmosphere upgrade identified
in the audit. It is implemented — a fixed pool of two lamps that borrow the
nearest torches, so the shadow-caster count never changes and no shader
recompile is triggered — and it is **off by default**, because measuring it
showed it costs about a third of the frame and changes almost nothing: the
geometry near a torch is bones, candles and rubble, all too low to throw a
shadow from a light 1.5 units up. The option is kept for strong hardware.

## 0.1.0 — Vertical slice "The Ninth Bell"

The first playable build. Verified by `npm test` (106 tests) and
`npm run smoke` (44 runtime checks in a real browser).

### Phase A — Foundation
- Audited the environment before writing code: no Godot, Unreal, Unity or
  Blender; no GPU; no display. Verified that headless Chromium renders WebGL 2
  through SwiftShader, which made TypeScript + Three.js the only stack that
  could be built, run, screenshotted and regression-tested here.
- Core primitives: seeded RNG, typed event bus, fixed-timestep clock with
  hit-stop, FSM, object pool, stable-ID registry.
- Established the rule that `src/sim/` imports no rendering code.

### Phase B — Combat
- Stat model with flat and additive-percentage modifiers, four attributes,
  six damage types and resistances.
- One centralised damage pipeline handling crits, armour, resistances,
  stagger and knockback.
- Actors with acceleration-based movement, action states and status effects.
- Nine combat shapes implemented once each (arc, line, projectile, ground,
  self-area, dash, curse, chain, leap).

### Phase C — Items
- 47 base items across 8 weapon categories and 4 armour classes.
- 30 affixes with 3–4 level-gated, weighted tiers each, and group exclusivity.
- 4 rarities (Blank, Marked, Haunted, Reliquary) with a steep curve.
- 10 reliquary effects bound to 7 event hooks, each changing gameplay rather
  than a number.
- Seeded, reproducible loot generation; 10×6 grid inventory with drag, swap
  and comparison; equipment with slot and two-handed resolution.

### Phase D — Progression
- 24 data-driven skills, 8 per archetype, with declarative shapes so modifiers
  apply without per-skill variants.
- XP curve to level 10, per-archetype stat growth, skill points and ranks.
- Three archetypes with distinct resource economies.

### Phase E — World
- Three zones built from composable carving primitives.
- Proximity-triggered encounters, chests, shrines, lore objects and travel.
- Versioned save format addressed entirely by stable IDs, with migration and
  graceful degradation of removed content.

### Phase F — Enemies
- 11 enemy types across three families with distinct combat roles.
- AI state machine with aggro, alert hesitation, leash, line of sight,
  preferred-range steering and neighbour separation.
- 7 elite modifiers that change behaviour and add silhouette geometry.
- A three-phase boss whose phases add attacks and pressure, not health.

### Phase G — Presentation
- Procedural texture generation with correlated roughness maps.
- Modular character rig with live equipment swapping and procedural animation.
- Seven enemy body plans distinguishable by outline alone.
- ~50 prop builders, merged terrain, isometric camera with occlusion fade.
- Pooled VFX: particles, decals, telegraph rings.
- DOM UI: HUD, grid inventory, character sheet, skill tree, tooltips with
  comparison, fog-of-war minimap, damage numbers.
- Fully synthesised audio with material-correct impact selection.

### Phase H — Polish
- Full documentation set.
- Visual pass driven by reviewing actual renders: lighting rebalanced for
  physical units, per-zone wall heights, ground texture scale, albedo range.
- Self-audit against the brief's 15 criteria.

### Bugs fixed
See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the full list with causes. The
notable ones: every actor was taking 10% damage due to a stat default; stats
inflated on every gear swap due to a modifier leak; the game was entirely
unclickable due to a CSS specificity error; quick clicks were ignored; clicking
an enemy's body missed; and all torches emitted no light.
