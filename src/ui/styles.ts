/**
 * The UI stylesheet, injected at boot.
 *
 * §32 asks for dark, minimal, physical UI with an *original* visual language,
 * and explicitly forbids copying the twin-orb layout. This design instead uses
 * horizontal iron bands: health is a wide notched band bottom-left, resource a
 * narrower band beneath it, experience a single hairline along the very bottom
 * edge of the screen. Nothing is round, nothing glows, and the frame metaphor
 * throughout is hammered plate rather than carved fantasy stone.
 */

export const CSS = `
:root {
  --ink: #0d0c0b;
  --iron: #24221f;
  --iron-light: #3a3630;
  --edge: #4e483f;
  --parchment: #cdc3ad;
  --muted: #8c8474;
  --blood: #8c2f24;
  --blood-deep: #571a14;
  --ember: #c27a35;
  --brass: #c8a349;
  --rot: #6f8a3a;
  --shadow-violet: #7d6a94;
  --rarity-blank: #b9b2a6;
  --rarity-marked: #6f93c4;
  --rarity-haunted: #c8a349;
  --rarity-reliquary: #c96a38;
  --ui-font: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  --ui-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0; height: 100%; overflow: hidden;
  background: #000; color: var(--parchment);
  font-family: var(--ui-font);
  user-select: none; -webkit-user-select: none;
}

#game-canvas { display: block; width: 100vw; height: 100vh; cursor: crosshair; }

#ui-root {
  position: fixed; inset: 0; pointer-events: none;
  font-size: 14px; line-height: 1.35;
}
/*
 * Interactive UI opts in; everything else must stay click-through.
 * Selecting by id + child would out-specify the per-element rules below and
 * silently make the full-screen overlays (vignette, damage numbers) swallow
 * every click meant for the world, so the opt-in is listed explicitly.
 */
#ui-root .panel,
#ui-root .screen,
#ui-root .skill-slot,
#ui-root .potion-slot,
#ui-root .minimap,
#ui-root .action-bar,
#ui-root .btn { pointer-events: auto; }

#ui-root .vignette,
#ui-root .low-health,
#ui-root .dmg-layer,
#ui-root .notify-layer,
#ui-root .zone-card,
#ui-root .xp-rail,
#ui-root .boss-bar,
#ui-root .interact-prompt,
#ui-root .hud-bottom-left,
#ui-root .tooltip { pointer-events: none; }

/* ---------------------------------------------------------------- HUD ---- */

.hud-bottom-left {
  position: absolute; left: 18px; bottom: 26px;
  display: flex; flex-direction: column; gap: 5px;
  pointer-events: none;
}

/* Hammered iron band. The notches are the identity of this HUD. */
.vital-band {
  position: relative; width: 268px; height: 26px;
  background: linear-gradient(180deg, #17161400 0%, #0b0a09 100%), var(--ink);
  border: 1px solid var(--edge);
  border-radius: 1px;
  box-shadow: inset 0 0 0 1px #00000080, 0 2px 6px #000000aa;
  overflow: hidden;
}
.vital-band.resource { width: 232px; height: 16px; }

.vital-fill {
  position: absolute; inset: 1px; width: 100%;
  transform-origin: left center;
  transition: transform 120ms linear;
}
.vital-fill.health {
  background: linear-gradient(180deg, #a33a2c 0%, var(--blood) 45%, var(--blood-deep) 100%);
}
.vital-fill.resource { background: linear-gradient(180deg, #d08a3e 0%, #a35f25 100%); }

/* A lighter ghost bar that drains behind the real one, so a big hit reads. */
.vital-ghost {
  position: absolute; inset: 1px; width: 100%;
  transform-origin: left center;
  background: #d8654e55;
  transition: transform 520ms cubic-bezier(.2,.7,.3,1) 140ms;
}

.vital-notches {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg,
    #00000000 0px, #00000000 25px, #00000066 25px, #00000066 27px);
  pointer-events: none;
}
.vital-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; letter-spacing: 0.06em;
  color: #e8dcc4; text-shadow: 0 1px 2px #000, 0 0 6px #000;
  font-variant-numeric: tabular-nums;
}
.vital-band.resource .vital-label { font-size: 10px; }

.hud-level {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 12px; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase;
}
.hud-level strong { color: var(--parchment); font-size: 15px; letter-spacing: 0; }

/* Experience: one hairline along the very bottom of the screen. */
.xp-rail {
  position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
  background: #0a0908; border-top: 1px solid #00000080;
}
.xp-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #6a5a2c, var(--brass));
  transition: width 260ms ease-out;
}

/* --------------------------------------------------------- action bar ---- */

.action-bar {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
  display: flex; gap: 7px;
}
.skill-slot {
  position: relative; width: 52px; height: 52px;
  background: linear-gradient(180deg, var(--iron-light), var(--iron));
  border: 1px solid var(--edge);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: inset 0 1px 0 #ffffff12, 0 2px 5px #000a;
}
.skill-slot:hover { border-color: var(--brass); }
.skill-slot.empty { opacity: 0.4; cursor: default; }
.skill-slot.unaffordable .skill-glyph { color: #6b5a4a; }
.skill-glyph {
  font-family: var(--ui-mono); font-size: 17px; font-weight: 700;
  color: var(--parchment); letter-spacing: -0.04em;
  text-shadow: 0 1px 2px #000;
}
.skill-key {
  position: absolute; top: 1px; left: 3px;
  font-size: 9px; color: var(--muted); font-family: var(--ui-mono);
}
.skill-cd {
  position: absolute; inset: 0; background: #000000bb;
  transform-origin: bottom; pointer-events: none;
}
.skill-cd-text {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--ui-mono); font-size: 13px; color: #e0d6bf; text-shadow: 0 1px 2px #000;
  pointer-events: none;
}

.potion-slot {
  position: absolute; right: 18px; bottom: 26px;
  width: 52px; height: 52px;
  background: linear-gradient(180deg, var(--iron-light), var(--iron));
  border: 1px solid var(--edge);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer;
}
.potion-count { font-size: 17px; color: var(--blood); font-weight: 700; text-shadow: 0 1px 2px #000; }
.potion-key { font-size: 9px; color: var(--muted); font-family: var(--ui-mono); }

/* ----------------------------------------------------------- minimap ---- */

.minimap {
  position: absolute; top: 16px; right: 16px;
  width: 182px; height: 182px;
  background: #07070a; border: 1px solid var(--edge);
  box-shadow: 0 2px 10px #000a; overflow: hidden;
}
.minimap canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.minimap-label {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 3px 6px; font-size: 10px; letter-spacing: 0.09em; text-transform: uppercase;
  background: #0b0a09dd; color: var(--muted); text-align: center;
}

/* ---------------------------------------------------- damage numbers ---- */

.dmg-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.dmg {
  position: absolute; font-family: var(--ui-mono); font-weight: 700;
  font-size: 15px; color: #e2d6bd;
  text-shadow: 0 1px 0 #000, 0 0 5px #000;
  animation: dmg-rise 900ms ease-out forwards;
  white-space: nowrap;
}
.dmg.crit { font-size: 22px; color: #ffd27a; }
.dmg.player { color: #e2685a; font-size: 17px; }
.dmg.heal { color: #8fae7c; }
.dmg.dot { font-size: 12px; opacity: 0.85; }
@keyframes dmg-rise {
  0%   { transform: translate(-50%, 0) scale(0.7); opacity: 0; }
  15%  { transform: translate(-50%, -8px) scale(1.1); opacity: 1; }
  100% { transform: translate(-50%, -52px) scale(0.95); opacity: 0; }
}

/* ------------------------------------------------------ notifications ---- */

.notify-layer {
  position: absolute; left: 50%; top: 16%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  pointer-events: none; max-width: 560px;
}
.notify {
  padding: 7px 15px; background: #0b0a09e8;
  border: 1px solid var(--edge); border-left: 3px solid var(--muted);
  font-size: 13px; color: var(--parchment);
  animation: notify-in 220ms ease-out, notify-out 500ms ease-in 3.4s forwards;
  text-align: center;
}
.notify.good { border-left-color: var(--rot); }
.notify.bad  { border-left-color: var(--blood); }
@keyframes notify-in  { from { opacity: 0; transform: translateY(-8px); } }
@keyframes notify-out { to { opacity: 0; transform: translateY(-6px); } }

/* Zone title card. */
.zone-card {
  position: absolute; left: 50%; top: 26%; transform: translateX(-50%);
  text-align: center; pointer-events: none;
  animation: zone-fade 5s ease-out forwards;
}
.zone-card h2 {
  margin: 0; font-size: 34px; font-weight: 400; letter-spacing: 0.09em;
  color: #ddd2ba; text-shadow: 0 2px 14px #000, 0 0 28px #000;
}
.zone-card p {
  margin: 5px 0 0; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--muted);
}
@keyframes zone-fade { 0%,55% { opacity: 1; } 100% { opacity: 0; } }

/* ------------------------------------------------------------ panels ---- */

.panel {
  position: absolute; background: linear-gradient(180deg, #16151399, #0d0c0b) , #100f0d;
  border: 1px solid var(--edge);
  box-shadow: 0 8px 40px #000c, inset 0 1px 0 #ffffff0a;
  display: none; flex-direction: column;
}
.panel.open { display: flex; }
.panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 13px; border-bottom: 1px solid var(--edge);
  background: #0a0908;
}
.panel-head h3 {
  margin: 0; font-size: 13px; font-weight: 400;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--parchment);
}
.panel-close {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 17px; line-height: 1; padding: 0 3px; font-family: var(--ui-font);
}
.panel-close:hover { color: var(--parchment); }
.panel-body { padding: 13px; overflow-y: auto; flex: 1; }

#panel-inventory { right: 16px; top: 214px; width: 428px; }
#panel-character { left: 16px; top: 16px; width: 316px; max-height: 74vh; }
#panel-skills    { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 620px; max-height: 78vh; }
#panel-vendor    { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 560px; max-height: 74vh; }
#panel-menu      { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 330px; }
#panel-map       { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 620px; }

/* -------------------------------------------------- inventory grid ---- */

.inv-grid {
  position: relative;
  display: grid; gap: 2px;
  background: #070706; padding: 3px; border: 1px solid #2a2823;
}
.inv-cell { background: #17161390; border: 1px solid #23211d; }
.inv-item {
  position: absolute; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #22201c, #151412);
  border: 1px solid var(--rarity-blank);
  cursor: grab; overflow: hidden; padding: 2px;
}
.inv-item:hover { filter: brightness(1.3); }
.inv-item.dragging { opacity: 0.4; cursor: grabbing; }
.inv-item .glyph {
  font-family: var(--ui-mono); font-size: 11px; font-weight: 700;
  text-align: center; line-height: 1.05; word-break: break-word;
  text-shadow: 0 1px 2px #000;
}
.inv-item[data-rarity="blank"]     { border-color: #55504733; }
.inv-item[data-rarity="marked"]    { border-color: var(--rarity-marked); box-shadow: inset 0 0 12px #6f93c433; }
.inv-item[data-rarity="haunted"]   { border-color: var(--rarity-haunted); box-shadow: inset 0 0 12px #c8a34940; }
.inv-item[data-rarity="reliquary"] { border-color: var(--rarity-reliquary); box-shadow: inset 0 0 16px #c96a3855; }

.inv-meta {
  display: flex; justify-content: space-between;
  margin-top: 9px; font-size: 11px; color: var(--muted);
  letter-spacing: 0.05em;
}

/* --------------------------------------------------------- equipment ---- */

.equip-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 13px;
}
.equip-slot {
  height: 50px; background: #131210; border: 1px solid #2a2823;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: #5c564c; text-transform: uppercase; letter-spacing: 0.08em;
  cursor: pointer; text-align: center; padding: 2px; overflow: hidden;
}
.equip-slot.filled { color: var(--parchment); font-size: 10px; }
.equip-slot:hover { border-color: var(--brass); }
.equip-slot[data-rarity="marked"]    { border-color: var(--rarity-marked); }
.equip-slot[data-rarity="haunted"]   { border-color: var(--rarity-haunted); }
.equip-slot[data-rarity="reliquary"] { border-color: var(--rarity-reliquary); }

.stat-row {
  display: flex; justify-content: space-between;
  padding: 3px 0; font-size: 12px; border-bottom: 1px solid #1d1b18;
}
.stat-row span:first-child { color: var(--muted); }
.stat-row span:last-child { font-family: var(--ui-mono); font-variant-numeric: tabular-nums; }
.stat-group-title {
  margin: 11px 0 5px; font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ember);
}

/* ------------------------------------------------------------ skills ---- */

.skill-list { display: flex; flex-direction: column; gap: 7px; }
.skill-row {
  display: flex; gap: 11px; align-items: flex-start;
  padding: 9px; background: #131210; border: 1px solid #24221e;
}
.skill-row.locked { opacity: 0.42; }
.skill-row.known { border-color: #3e3a32; }
.skill-badge {
  flex: 0 0 40px; height: 40px;
  background: linear-gradient(180deg, var(--iron-light), var(--iron));
  border: 1px solid var(--edge);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--ui-mono); font-weight: 700; font-size: 14px;
}
.skill-info { flex: 1; min-width: 0; }
.skill-info h4 { margin: 0 0 2px; font-size: 14px; font-weight: 400; color: #ddd2ba; }
.skill-info p { margin: 0; font-size: 12px; color: var(--muted); }
.skill-meta {
  margin-top: 4px; font-size: 11px; color: #6f695d; font-family: var(--ui-mono);
  display: flex; gap: 11px; flex-wrap: wrap;
}
.skill-actions { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.btn {
  background: var(--iron); color: var(--parchment);
  border: 1px solid var(--edge); padding: 5px 11px;
  font-family: var(--ui-font); font-size: 12px; cursor: pointer;
  letter-spacing: 0.05em;
}
.btn:hover:not(:disabled) { background: var(--iron-light); border-color: var(--brass); }
.btn:disabled { opacity: 0.35; cursor: default; }
.btn.wide { width: 100%; text-align: center; }
.btn.danger:hover:not(:disabled) { border-color: var(--blood); color: #e0968c; }

.bind-row { display: flex; gap: 4px; margin-top: 4px; }
.bind-btn {
  width: 22px; height: 22px; font-size: 10px; padding: 0;
  background: var(--iron); border: 1px solid var(--edge);
  color: var(--muted); cursor: pointer; font-family: var(--ui-mono);
}
.bind-btn.active { border-color: var(--brass); color: var(--brass); }

/* ----------------------------------------------------------- tooltip ---- */

.tooltip {
  position: fixed; z-index: 900; max-width: 314px;
  background: #0a0908f2; border: 1px solid var(--edge);
  padding: 11px 13px; font-size: 12.5px; pointer-events: none;
  box-shadow: 0 6px 26px #000d;
  display: none;
}
.tooltip.visible { display: block; }
.tooltip h4 { margin: 0 0 1px; font-size: 15px; font-weight: 400; letter-spacing: 0.02em; }
.tooltip .subtitle {
  font-size: 11px; color: var(--muted); margin-bottom: 7px;
  text-transform: uppercase; letter-spacing: 0.1em;
}
.tooltip .stat { color: #c3bba8; font-family: var(--ui-mono); font-size: 12px; }
.tooltip .affix { color: #7fa8d8; font-family: var(--ui-mono); font-size: 12px; }
.tooltip .special {
  color: var(--rarity-reliquary); margin-top: 7px; font-style: italic;
  border-top: 1px solid #2a2823; padding-top: 7px; line-height: 1.4;
}
.tooltip .flavour {
  color: #6f695d; font-style: italic; margin-top: 7px;
  border-top: 1px solid #1d1b18; padding-top: 6px; line-height: 1.4;
}
.tooltip .req { color: var(--blood); font-size: 11.5px; margin-top: 5px; }
.tooltip .compare {
  margin-top: 9px; padding-top: 8px; border-top: 1px dashed #322f29;
  font-size: 11.5px; color: var(--muted);
}
.tooltip .compare .better { color: var(--rot); }
.tooltip .compare .worse  { color: var(--blood); }
.tooltip .hint { margin-top: 7px; font-size: 10.5px; color: #5c564c; letter-spacing: 0.05em; }

/* ------------------------------------------------------------ screens ---- */

/*
 * While a full-screen menu is up, the HUD is hidden rather than dimmed. The
 * screen background is nearly but not fully opaque, so a live health bar
 * glowing faintly through the start screen reads as a bug.
 */
.hud-hidden .hud-bottom-left,
.hud-hidden .action-bar,
.hud-hidden .potion-slot,
.hud-hidden .minimap,
.hud-hidden .xp-rail,
.hud-hidden .ward-pips,
.hud-hidden .boss-bar,
.hud-hidden .interact-prompt,
.hud-hidden .low-health,
.hud-hidden .vignette { display: none !important; }

.screen {
  position: fixed; inset: 0; display: none;
  align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #0d0b0aee 0%, #000000f8 75%);
  z-index: 1000;
}
.screen.open { display: flex; }
.screen-inner { text-align: center; max-width: 620px; padding: 26px; }
.screen h1 {
  font-size: 46px; margin: 0 0 9px; font-weight: 400; letter-spacing: 0.1em;
  color: #d8ccb4;
}
.screen h1.dead { color: var(--blood); }
.screen .tagline {
  color: var(--muted); font-size: 13px; letter-spacing: 0.26em;
  text-transform: uppercase; margin-bottom: 26px;
}
.screen .blurb {
  color: #9d9482; font-size: 13.5px; line-height: 1.65; margin-bottom: 22px;
}
.archetype-row { display: flex; gap: 13px; justify-content: center; margin-bottom: 22px; }
.archetype-card {
  flex: 1; max-width: 190px; padding: 15px 13px;
  background: #131210; border: 1px solid #2a2823; cursor: pointer; text-align: left;
}
.archetype-card:hover, .archetype-card.selected { border-color: var(--brass); background: #1a1815; }
.archetype-card h3 {
  margin: 0 0 2px; font-size: 17px; font-weight: 400; color: #ddd2ba; letter-spacing: 0.04em;
}
.archetype-card .title {
  font-size: 10.5px; color: var(--ember); text-transform: uppercase;
  letter-spacing: 0.12em; margin-bottom: 8px;
}
.archetype-card p { margin: 0; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
.archetype-card .tags {
  margin-top: 9px; font-size: 10px; color: #6f695d; font-family: var(--ui-mono);
}

/* ------------------------------------------------------- ward charges ---- */

.ward-pips {
  position: absolute; right: 18px; bottom: 86px;
  display: none; gap: 5px;
}
.ward-pips.visible { display: flex; }
.ward-pip {
  width: 14px; height: 14px;
  background: #131210; border: 1px solid var(--edge);
  transform: rotate(45deg);
}
.ward-pip.lit {
  background: #8fa8c4; border-color: #b6cde3;
  box-shadow: 0 0 7px #8fa8c488;
}
.ward-pips.full .ward-pip.lit { animation: ward-ready 900ms ease-in-out infinite; }
@keyframes ward-ready { 50% { box-shadow: 0 0 14px #b6cde3; } }

/* --------------------------------------------------------- start keys ---- */

.start-keys {
  margin-top: 22px; padding-top: 16px; border-top: 1px solid #262420;
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 6px 20px; text-align: left;
}
.start-key { display: flex; align-items: baseline; gap: 9px; font-size: 12px; }
.start-key kbd {
  flex: 0 0 88px; text-align: right;
  font-family: var(--ui-mono); font-size: 11px; color: var(--brass);
}
.start-key span { color: var(--muted); }

/* -------------------------------------------------------------- boss ---- */

.boss-bar {
  position: absolute; left: 50%; top: 22px; transform: translateX(-50%);
  width: 500px; display: none;
}
.boss-bar.visible { display: block; }
.boss-name {
  text-align: center; font-size: 15px; letter-spacing: 0.16em;
  text-transform: uppercase; color: #ddd2ba; margin-bottom: 5px;
  text-shadow: 0 1px 5px #000;
}
.boss-track {
  height: 14px; background: var(--ink); border: 1px solid var(--edge);
  position: relative; overflow: hidden;
}
.boss-fill {
  height: 100%; width: 100%; transform-origin: left center;
  background: linear-gradient(180deg, #b04a34, #6d1f16);
  transition: transform 140ms linear;
}
.boss-phases {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg,
    transparent 0, transparent 33.2%, #000000cc 33.2%, #000000cc 33.8%,
    transparent 33.8%, transparent 66.4%, #000000cc 66.4%, #000000cc 67%);
}

/* -------------------------------------------------------------- debug ---- */

.debug {
  position: absolute; left: 16px; bottom: 120px;
  font-family: var(--ui-mono); font-size: 11px; color: #7fa87f;
  background: #050505d8; padding: 7px 9px; border: 1px solid #1e2a1e;
  display: none; white-space: pre; line-height: 1.5; max-width: 380px;
}
.debug.visible { display: block; }
.debug-help { color: #5c6f5c; margin-top: 6px; border-top: 1px solid #1e2a1e; padding-top: 5px; }

.interact-prompt {
  position: absolute; left: 50%; bottom: 110px; transform: translateX(-50%);
  background: #0b0a09e0; border: 1px solid var(--edge);
  padding: 6px 14px; font-size: 12.5px; color: var(--parchment);
  display: none; letter-spacing: 0.04em;
}
.interact-prompt.visible { display: block; }
.interact-prompt kbd {
  background: var(--iron); border: 1px solid var(--edge); padding: 1px 6px;
  font-family: var(--ui-mono); font-size: 11px; margin-right: 6px; color: var(--brass);
}

.vignette {
  position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 150px 20px #00000099;
}
/* Reddens and pulses when the player is nearly dead — a diegetic warning. */
.low-health {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  box-shadow: inset 0 0 140px 40px #7d1c1699;
  transition: opacity 320ms ease-out;
}
.low-health.active { opacity: 1; animation: pulse-low 1.5s ease-in-out infinite; }
@keyframes pulse-low { 50% { opacity: 0.5; } }
`;

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}
