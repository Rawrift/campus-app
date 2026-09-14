# ART DIRECTION

## 1. The target

Stylised dark realism. Believable materials and adult human proportions, with
silhouettes exaggerated just enough to stay readable from an isometric camera.

**Explicitly avoided:** cartoon and anime styling, oversaturated colour,
mirror-bright armour, comically large weapons, childlike proportions,
light-covered interfaces, generic mobile-RPG gloss.

The world should look **old, dangerous and hostile** — and like it existed long
before the player arrived.

---

## 2. Palette

| Role | Colour family |
| --- | --- |
| Earth, mud, field | `#6e6149` `#594f3f` |
| Rusted iron | `#6b6660` with `#7a3e26` oxide |
| Dirty stone | `#6b6557` `#524c42` |
| Charcoal, char | `#2a231c` `#1c1712` |
| Dried blood | `#3e1210` — never bright red |
| Desaturated vegetation | `#3f4630` `#5e6140` |
| Warm firelight | `#ff9a44` `#ffa855` |
| Brass (the one accent) | `#c8a349` |

Magic is the only place saturated colour is allowed, and even then it is
localised: fire `#d2762c`, shadow `#7d6a94`, poison `#6f8a3a`, frost `#9fb6d8`,
lightning `#a8c3e0`.

**Blood is dried, not fresh.** Bright primary red reads as paint and fights the
rest of the palette. This was corrected during development after reviewing
actual renders.

---

## 3. Materials

Every texture is painted from value noise into a canvas at boot, producing
albedo *and* a matching roughness map. The correlation between the two is what
sells a surface:

| Material | Albedo | Roughness |
| --- | --- | --- |
| **Metal** | dark base, rust blooms, bright scratches along handled edges | scratches *smoother*, rust *rougher* |
| **Leather** | grain, blotches, creases, stitch lines | worn patches greasier, so smoother |
| **Cloth** | explicit warp/weft, dirt, tears | uniformly rough |
| **Wood** | noise-displaced rings, knots, water-darkened patches | rings vary it slightly |
| **Stone** | offset block courses, mortar, cracks, moss in the joints | uniformly rough |
| **Ground** | coarse + fine noise, gravel in two tones, cart ruts | uniform |

### A lesson worth recording

The first implementation painted everything very dark, reasoning that a dark
game needs dark textures. It rendered as flat grey concrete: measured mean
albedo was 24/255, around 9% reflectance, which leaves almost no signal for
light to reveal. The fix was to raise albedo into a normal reflectance range and
let the *lighting* create the darkness. **A dark scene comes from low light, not
from black paint.**

A second, related issue: the ground texture originally mapped one 256 px
texture per 1×1 world tile, which at the game's camera is about 20 screen
pixels — every detail fell below a pixel and averaged to flat grey. Spreading
each repeat over four tiles put the grain and gravel at a size the player can
see.

Both of those were real, and both were also masking something larger. Raising
the authored albedo did not raise the *painted* one, because every generator was
writing linear components into an sRGB canvas: `new THREE.Color(0x6e6149).r` is
0.156 under three.js colour management, not the 0.43 the hex describes, so a
mid-tan earth was painted at RGB 40 and measured at 39. A flat 2.6x darkening
and a loss of saturation, applied to every surface in the game at once. The
compensation was more light, which is precisely the mistake the lesson above
warns about — arrived at from the other direction. Textures now convert back
through sRGB before they are painted (`displayColour` in `textures.ts`) and the
lighting has come down by roughly half to match.

Worth stating plainly, because it cost a full pass to find: **measure the
texture, not the intent.** The albedo above was diagnosed by drawing the
generated canvas into a 2D context and reading its mean. Every one of these
faults was invisible to the test suite and obvious in three numbers.

### And measure the frame, not the texture

The ground was also, for the whole of that first pass, *not being drawn at all*.
Every horizontal terrain quad was wound clockwise seen from above while carrying
an upward normal, so `side: FrontSide` culled the lot. What was on screen where
the ground should be was the background colour, and a uniform background is
indistinguishable from a flat untextured floor — so the fault presented as an art
problem and absorbed a texture fix, a tiling fix and a lighting fix before
anyone doubted the mesh existed. It was found by hiding terrain meshes one at a
time: hiding the floor changed nothing.

---

## 4. Characters

### Proportions

Roughly 7.5 heads tall, adult, functional musculature. Hands and feet are
slightly oversized so a weapon and a boot remain readable at distance — §2 of
the brief asks explicitly for visible boots and legible weapons.

Nobody is clean. The intended read is *someone who survives*, not someone
dressed for a parade: worn leather, oxidised metal, coarse cloth, visible
seams, repairs, dirt, soot.

### The modular rig

One skinned body bound to a joint hierarchy, with rigid attachment points for:

`helmet` · `torsoArmour` · `shoulders` · `gloves` · `belt` · `legs` · `boots` ·
`cloak` · `mainHand` · `offHand`

Symmetric modules (shoulders, gloves, legs, boots) are built twice and mirrored
rather than instanced, so a left pauldron is genuinely its own mesh.

### Armour tiers change shape, not just colour

| Tier | Reads as |
| --- | --- |
| **0** | Improvised. Straps, a scavenged plate lashed on off-centre, cloth underneath. |
| **1** | Professional. Fitted plate, real lames on the pauldrons, a nasal bar and cheek plates on the helm, belt pouches. |
| **2** | Ancient and ceremonial. A crest — the single strongest silhouette cue in the kit — plus engraving, studs and a brass medallion. |

Tier 2 stays in the same dirty palette. A powerful object should feel **old and
dangerous, not luminous**.

### Cloth moves

Cloaks are built as a segmented chain; each segment lags the one above it, driven
by the character's actual world velocity converted into their local frame, so a
cloak trails correctly regardless of facing.

---

## 5. Enemies — silhouette first

The design requirement is that a player can identify a threat by outline at the
edge of the fog and react before it arrives. Seven body plans:

| Plan | Outline | Reads as |
| --- | --- | --- |
| `gaunt` | tall, thin, very long arms | fast and fragile |
| `heavy` | wide, low, slab shoulders | do not tank this |
| `hunched` | bent forward, head low | was a person once |
| `quadruped` | long, low, horizontal | animal, fast |
| `wisp` | floating core, hanging shroud, no legs | not physical |
| `tall` | elongated, robed, shouldered | wrong |
| `armoured` | plated, layered fauld, visor | a soldier |

### Elite cues are geometry

Colour alone is not acceptable. Each modifier attaches real silhouette:

`spines` (a fan of back spikes) · `plates` (stacked slabs) · `boils` (clustered
nodules) · `halo` (a rotating ring) · `hooks` (a row of hooks) · `core` (a
pulsing emissive core inside a translucent shell).

---

## 6. Lighting

Darkness is a mechanic, but legibility is a requirement. Both came from
reviewing actual renders.

- **Hemisphere ambient** does the base legibility work. Outdoors ~0.85–0.95;
  the ossuary runs at 0.42, roughly half, so torchlight does the work there.
- **A raking key light**, not an overhead one. The first build placed the sun
  near-vertical and every vertical surface rendered as a black silhouette.
- **A dim cool fill** from the opposite side, so faces turned away from the key
  light do not go to pure black.
- **Point lights in physical units.** Three.js contribution falls off as
  `intensity / distance²`. The first build used single-digit intensities that
  emitted essentially nothing; torches are now 34, braziers 52, the forge 60.
- **Per-zone wall height.** 3.4 units of stone indoors is architecture; the same
  wall around a field shadowed entire outdoor regions, so exteriors use 1.35-unit
  banks and the village a 2.2-unit palisade.
- **ACES filmic tone mapping** at 1.12 exposure, so deep shadows do not crush to
  pure black and torchlight can bloom.
- Flicker is two out-of-phase sines, which reads far more like fire than either
  one sine or random noise.

---

## 7. VFX

Legibility first: every effect says something about gameplay.

- **Impacts** — damage-typed particle burst, plus dust and sparks on physical
  contact. The dust is what gives a swing its sense of *contact* rather than of
  passing through.
- **Telegraphs** — every delayed ground effect draws a ring that closes and
  brightens towards detonation. §23's "no unfair hits without a telegraph" is
  enforced structurally: the ring is created by the renderer whenever a ground
  effect with a delay is spawned, so it cannot be forgotten.
- **Loot beams** — height and brightness scale with rarity, and Blank items get
  no beam at all, so the screen does not become fireworks.
- **Decals** — blood and scorch, capped at 90, fading over their last seconds.

Everything is pooled into a single `Points` draw.

---

## 8. UI

Dark, minimal, physical, and deliberately **not** the twin-orb layout.

The metaphor is hammered iron plate: health is a wide notched band at the
bottom left, resource a narrower band beneath it, experience a single hairline
along the very bottom edge of the screen. Nothing is round and nothing glows.

A lighter "ghost" bar drains behind the health bar so a big hit is legible as a
*hit* rather than as a number changing. Below a third health, a red vignette
pulses.

Damage numbers are capped at 26 on screen and can be switched off entirely —
the brief is explicit that impact, reaction and audio matter more than the
number.

Typography is an old-style serif for body text and a monospace for anything
numeric, so stats align.
