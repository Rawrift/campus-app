# IMPLEMENTATION PLAN — PROJECT CHACOX

> Working title. In-fiction the game is set in **OSSUAN**; the vertical slice is
> **"The Ninth Bell"**. See `docs/GAME_DESIGN.md` for the invented world.

## 0. Environment audit (performed 2026-09-14, before any code was written)

| Tool | Result |
| --- | --- |
| Godot 4.x | **not installed**, not in any apt source configured here |
| Unreal Engine | **not installed** (and unbuildable: no GPU, ~100 GB source) |
| Unity | **not installed** |
| Blender | **not installed** (so no Python-driven DCC asset generation — see §42 fallback) |
| GPU / `/dev/dri` | **absent** — no hardware acceleration |
| `$DISPLAY` | **empty** — no X session |
| Node.js | 22.22.2 ✅ |
| Python | 3.11.15 ✅ |
| gcc / cmake / make | 13.3 / 3.28 / 4.3 ✅ |
| Chromium | **pre-installed** at `/opt/pw-browsers/chromium-1194` ✅ |
| Playwright | installable from npm ✅ |
| WebGL2 in headless Chromium | **VERIFIED WORKING** — `WebGL 2.0 (OpenGL ES 3.0 Chromium)` via ANGLE/SwiftShader |
| npm registry reachable | ✅ |

## 1. Engine decision

**TypeScript + Three.js (WebGL2), built with Vite, tested with Vitest + Playwright.**

The master prompt (§43) ranks the criteria explicitly: *"producto realmente
construible + código verificable + pipeline reproducible"*, and warns against
picking an engine merely because it produces better screenshots if we then
cannot execute or test anything.

Applying that test to this environment:

- **Godot / Unreal / Unity are not present and cannot be exercised.** Even if a
  Godot headless binary were fetched, `--headless` disables the renderer, so the
  game could be *compiled* but never *seen* or visually regression-tested here.
  Every visual claim would be unverifiable — exactly what §64 and §53 forbid.
- **Three.js on WebGL2 runs, renders and screenshots in this container today**
  (verified above, not assumed). That makes the whole loop real: `npm run build`
  compiles, `npm test` runs the simulation head-less, and `npm run smoke` boots
  the actual game in Chromium, plays it with synthetic input, and writes PNGs.
- The player runs it with `npm run dev` and a browser. No engine download, no
  GPU driver, no platform build step.

**Portability is preserved by architecture, not by engine choice:** all gameplay
lives in `src/sim/`, which imports *zero* rendering code. The renderer is a
read-only consumer of simulation state. Porting to Godot/Unreal later means
rewriting `src/render/` and `src/ui/`, not the game.

## 2. Asset strategy — budget 0, zero license risk

Blender is unavailable, so §42's fallback applies: **every mesh, texture,
material, animation and sound in this project is generated procedurally in code
at runtime.** There are no downloaded assets at all.

- Meshes: authored from primitives + custom `BufferGeometry` builders
  (`src/render/geometry/`), driven by parameters so armour tiers, weapons,
  rocks, gravestones and ruins are variations of the same generators.
- Textures: painted to `<canvas>` at boot (noise, rust, grain, weave, mortar).
- Skeletal animation: a hand-built rig + procedurally authored animation clips.
- Audio: synthesised through the WebAudio graph (no samples).

Consequence: `THIRD_PARTY_ASSETS.md` lists only the npm libraries, and the game
cannot be an "asset flip" because there are no third-party assets to flip.

## 3. Phase order (as per §52)

- **A — Foundation**: repo, build, typed event bus, seeded RNG, fixed-timestep
  clock, sim/render split, isometric camera, click-to-move on a nav grid.
- **B — Combat**: stats, damage pipeline, anticipation/impact/recovery attacks,
  hit-stop, knockback, hit reactions, death, corpses, feedback.
- **C — Items**: item bases, weighted affix generator, 4 rarities, ground drops,
  grid inventory, equipment, **visual equipment swap**.
- **D — Progression**: XP curve, levels, stat growth, data-driven skills.
- **E — World**: hub, outdoor region, hand-authored dungeon, spawners.
- **F — Enemies**: families, combat roles, AI, elite affixes, boss (3 phases).
- **G — Presentation**: materials, lighting, VFX pooling, UI, minimap, audio.
- **H — Polish**: perf, tests, balance, docs, self-audit against §66.

## 4. Definition of done (§65)

A build where the player can: start, pick a character, move, fight, take damage,
die, get loot, open the inventory, equip items, **see the equipment on the
character**, use skills, gain XP, level up, enter the dungeon, fight varied
enemies, fight an elite, fight the boss, save, quit and reload the character.

Verified by `npm run build`, `npm test` and `npm run smoke` — not by assertion.
