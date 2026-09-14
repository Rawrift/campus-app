# CHANGELOG

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
