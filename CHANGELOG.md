# CHANGELOG

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
