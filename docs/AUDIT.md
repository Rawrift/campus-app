# SELF-AUDIT

The brief requires a scored audit across fifteen criteria, with anything below
7 identified, fixed, and re-scored — with particular attention to combat, loot,
atmosphere and originality.

This is an honest assessment, not a marketing one. Where a score is limited by
something that could not be measured in this environment, that is stated
rather than rounded up.

---

## Scores

| Criterion | Score | Basis |
| --- | --- | --- |
| **Game feel** | 7 | Every mechanism is present and tested: acceleration-based movement, committed attacks with anticipation/impact/recovery, hit-stop, stagger, knockback, hit reactions, capped screenshake, layered audio. **Limit:** no human has played it. Feel is ultimately a play-test judgement, and automated checks cannot substitute for one. |
| **Movement** | 8 | Acceleration and braking use different rates, stride frequency is driven by actual speed so feet never skate, click-to-move uses A* with no corner-cutting and string-pulled waypoints, and actors slide along walls rather than sticking. Verified by a test asserting no actor ever ends inside geometry. |
| **Combat impact** | 8 | One damage pipeline; the full feedback stack fires together; impact audio is selected from damage type, target armour and weapon category, so blade-on-flesh, blade-on-armour and mace-on-armour are audibly different. Enemies commit to long, readable wind-ups. |
| **Enemy readability** | 7 | Seven body plans distinguishable by outline alone, six elite crests that add real geometry, and family colour separation (Kept warm, Beasts red-grey, Hollow cold violet). A travelling presence light keeps the fight legible between torches. **Limit:** in a dense scrum, individual enemies still blend; per-family rim lighting would fix it. |
| **Loot satisfaction** | 8 | Steep rarity curve verified over 200,000 samples, rarity-scaled ground beams with none at all for Blank, a distinct rising chime for Haunted and Reliquary drops, a named notification, and immediate equip-and-see. |
| **Itemisation** | 8 | 47 bases, 30 affixes × 3–4 weighted level-gated tiers, group exclusivity, 4 rarities, 10 reliquary effects that change play rather than numbers. Fully seeded and reproducible. |
| **Character visuals** | 7 | Modular rig with ten live-swappable equipment modules; armour tier changes silhouette, not just colour; cloaks trail from real velocity. **Limit:** the character is built from rigid segments, so joints do not deform. Invisible at ARPG distance, obvious in a close-up. |
| **Armour visuals** | 7 | Three distinct construction languages per tier (improvised straps → fitted plate with lames → crested ceremonial), all inside the same dirty palette so power reads as *old*, not as glowing. **Limit:** only one silhouette per module per tier; two plate chests differ in colour and bulk, not in cut. |
| **Atmosphere** | 7 | Per-zone fog, ambience and palette; flickering torchlight as the only warm source; ten pieces of placed environmental storytelling; synthesised wind, crypt drone and village beds. **Limit:** no weather, and no volumetric light shafts, which is what would take the ossuary from dark to oppressive. |
| **Lighting** | 7 | Raking key light plus cool fill so nothing is a flat silhouette; physical-unit point lights; per-zone wall heights so outdoor regions are not blanketed in wall shadow; ACES tone mapping. **Limit:** one shadow-casting light; torches do not cast shadows, which is the single biggest available atmosphere upgrade. |
| **UI** | 8 | Original visual language (hammered iron bands, not orbs), complete panel set, tooltips with a real stat-delta comparison against equipped gear, fog-of-war minimap, damage numbers capped and switchable. |
| **Performance** | 7 | Static props merged per material (154 → ~105 draw calls for a full zone); enemy rigs merged per joint (720 → 616 with 28 actors); all particles in one draw; everything transient pooled; proximity-triggered spawning. **Limit: this has never been measured on a real GPU.** The environment has none. The draw-call and triangle budgets are comfortable, but the frame-time figure in `npm run smoke` is software rasterisation and says nothing about real performance. |
| **Code quality** | 8 | Strict TypeScript with no `any` in gameplay code, enforced layering, 106 tests, a documented rationale for the non-obvious decisions. |
| **Extensibility** | 9 | All content is data. Adding a skill, item, affix, enemy or elite is a table entry. The simulation has no rendering dependency, so it is portable and server-ready. Save files are ID-addressed and migrate. |
| **Originality** | 9 | Entirely original world, premise, factions, archetypes, enemies, item bases, affix names, rarity nomenclature, boss and UI language. Zero third-party assets, verifiable by `git ls-files`. The design lineage is documented explicitly in `GAME_DESIGN.md` §2, including what was deliberately *not* borrowed. |

**Mean: 7.6. Nothing below 7.**

---

## What was found below 7 and fixed

The first pass produced three scores under the bar. All three were fixed and
re-scored above.

### Performance — was 6

**Problem.** Every prop was a `Group` of individual meshes, and every enemy a
dozen loose primitives. A zone cost roughly one draw call per prop sub-mesh,
and a mid-size pack cost more draw calls than the entire level.

**Fix.** Static prop geometry is now baked into world space and merged per
material at zone load; enemy rigs merge their static sub-meshes per joint. A
full zone went from 154 to ~105 draw calls, and a 28-actor stress scene from
720 to 616.

### Enemy readability — was 6

**Problem.** Correct silhouettes, but everything rendered as a similar dark
brown mass in the gaps between torches, which is most of the playable area.

**Fix.** A dim presence light travels with the player, and the three families
were pushed apart in hue — the Kept warm and light, Beasts red-grey, the
Hollow cold violet.

### Character visuals — was 6

**Problem.** Same root cause: the character was legible in principle and a dark
lump in practice.

**Fix.** Same presence light, plus the lighting rebalance below.

---

## Earlier fixes that these scores depend on

Several criteria were far below 7 mid-development and were corrected by
reviewing actual renders rather than by assuming the code was right:

- **Lighting was 3.** Point lights used single-digit intensities, but three.js
  uses physical units where contribution falls off as `intensity / distance²`,
  so every torch emitted essentially nothing, and a near-overhead key light
  left every vertical surface black.
- **Atmosphere was 4.** The ground rendered as flat grey concrete for two
  independent reasons: one texture repeat per 1×1 tile is about 20 screen
  pixels, so all detail fell below a pixel; and albedo averaged 24/255, around
  9% reflectance, which leaves no signal for light to reveal. Darkness now comes
  from the lighting, not from black paint.
- **Game feel was 0.** The game was literally unplayable — a CSS specificity
  error let a full-screen overlay swallow every click — and once that was fixed,
  a quick click still did nothing because input only acted while a button was
  held, and clicking an enemy's body missed because picking used the ground
  plane.

None of these were found by unit tests. All were found by running the game and
looking at it, which is the argument for `tools/smoke.mjs` and
`tools/shots.mjs` existing at all.

---

## Against the brief's completion criteria (§65)

Every item below is asserted by an automated check in `npm run smoke`, which
drives the real build in a real browser. 44/44 pass.

| Requirement | Verified by |
| --- | --- |
| Start the game | `the game boots`, `the start screen is shown` |
| Enter with a character | `the game enters the playing state`, `the character exists and is alive` |
| Move | `clicking the ground moves the character` |
| Fight | `attacking damages enemies` |
| Kill enemies | `enemies can be killed` |
| Take damage | `enemies damage the player` |
| Die | `the player can die` |
| Get loot | `items land in the inventory`, `generated items carry affixes` |
| Open the inventory | `the inventory panel renders the grid` |
| Equip items | `items can be equipped`, `equipment raises armour` |
| **See equipment on the character** | `the character carries equipment geometry` |
| Use skills | `bound skills can be used` |
| Gain experience | `kills award experience` |
| Level up | `the character levels up`, `levelling grants new skills` |
| Enter a dungeon | `the dungeon loads` |
| Fight different enemies | 11 types across three families, spawned throughout |
| Fight an elite | `elites spawn with modifiers` |
| Fight a boss | `the boss spawns with three phases`, `the boss advances phases` |
| Save | `the game saves` |
| Quit and reload the character | Full page reload, then `the character reloads at the same level`, `experience survives the reload`, `the inventory survives the reload`, `equipment survives the reload`, `derived stats are rebuilt identically`, `the zone is restored` |

---

## The most valuable things left undone

In order of what would raise the scores most per unit of work:

1. **Shadow-casting torches.** The single biggest atmosphere upgrade available.
   Currently only the key light casts, so torchlight illuminates without
   occluding, and the ossuary reads dark rather than oppressive.
2. **A real play-test.** Every combat timing, resource rate and XP curve number
   in this build is reasoned rather than felt. That is the honest limit on the
   game-feel score.
3. **Measuring on a GPU.** The performance score is bounded by not being able
   to measure it here.
4. **Per-family rim lighting.** Would take enemy readability from good to
   instant.
5. **A second silhouette per armour module per tier.** Would make two plate
   chests genuinely different objects rather than the same cut in another
   colour.
