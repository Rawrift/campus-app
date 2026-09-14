/**
 * Produces hosting-ready output from the Vite build.
 *
 * Two targets, because they have different constraints:
 *
 *  - `dist-artifact/`  a page plus one script, for hosts that wrap the page in
 *                      their own document skeleton (so it must not carry its
 *                      own doctype/html/head/body tags).
 *  - `dist-single/`    one self-contained .html file with the whole game
 *                      inlined, which can be opened by double-clicking or
 *                      dropped on any static host with no build step.
 *
 * Run after `npm run build`.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const scriptMatch = html.match(/<script type="module"[^>]*src="\.?\/?([^"]+)"><\/script>/);
if (!scriptMatch) throw new Error('could not find the module script in dist/index.html');
const scriptPath = scriptMatch[1];
const js = readFileSync(join(DIST, scriptPath), 'utf8');

const iconMatch = html.match(/<link rel="icon"[^>]*>/);
const icon = iconMatch ? iconMatch[0] : '';

/**
 * A loading card shown until the game boots.
 *
 * The bundle is ~800 KB and compiling it plus generating every texture takes a
 * moment on a cold load, during which the page would otherwise be blank and
 * look broken.
 */
/**
 * The loading card.
 *
 * The bundle is ~800 KB and generating every texture takes a moment on a cold
 * load, during which the page would otherwise be blank and look broken.
 *
 * It borrows the game's own visual language rather than inventing a second one:
 * the same ink, parchment and brass, the same old-style serif, no webfont.
 * The progress indicator is nine notches filling in sequence - the motif that
 * runs through the whole game, from the nine notches re-cut on the gatepost
 * each morning to the nine names in the chapter-house floor. The ninth lights
 * in brass, and only once the game is actually ready.
 */
const BOOT = `
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0a0908; overflow: hidden; }
  #boot {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px;
    background: #0a0908; color: #cdc3ad; z-index: 5000;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
    transition: opacity 700ms ease-out;
    box-shadow: inset 0 0 180px 40px #000000cc;
    padding: 24px;
  }
  #boot.gone { opacity: 0; pointer-events: none; }
  #boot h1 {
    margin: 0; font-size: clamp(30px, 7vw, 46px); font-weight: 400;
    letter-spacing: .22em; text-indent: .22em; color: #ddd2ba;
  }
  #boot .eyebrow {
    margin: 0; font-size: 11px; letter-spacing: .3em; text-transform: uppercase;
    color: #8c8474;
  }
  #boot .bells { display: flex; gap: 9px; margin-top: 4px; }
  #boot .bells i {
    display: block; width: 3px; height: 17px; background: #1e1c19;
    transition: background 300ms ease-out, box-shadow 300ms ease-out;
  }
  #boot .bells i.lit { background: #6b5f3e; }
  #boot .bells i.ninth.lit { background: #c8a349; box-shadow: 0 0 9px #c8a34988; }
  #boot .note {
    margin: 6px 0 0; font-size: 12px; color: #6f695d; max-width: 34ch;
    text-align: center; line-height: 1.6;
  }
  @media (prefers-reduced-motion: reduce) {
    #boot, #boot .bells i { transition: none; }
  }
</style>
<div id="boot">
  <h1>OSSUAN</h1>
  <p class="eyebrow">The Ninth Bell</p>
  <div class="bells" id="boot-bells"></div>
  <p class="note" id="boot-note">Lighting the ash&hellip;</p>
</div>
<script>
  (function () {
    var bells = document.getElementById('boot-bells');
    for (var i = 0; i < 9; i++) {
      var b = document.createElement('i');
      if (i === 8) b.className = 'ninth';
      bells.appendChild(b);
    }
    var pips = bells.children;
    var lit = 0;
    // The first eight fill while the bundle parses and the textures generate;
    // the ninth waits for the game to actually be ready.
    var march = setInterval(function () {
      if (lit < 8) pips[lit++].classList.add('lit');
    }, 190);

    var tries = 0;
    var timer = setInterval(function () {
      if (window.__OSSUAN && window.__OSSUAN.ready) {
        clearInterval(timer); clearInterval(march);
        for (var i = 0; i < 9; i++) pips[i].classList.add('lit');
        var card = document.getElementById('boot');
        setTimeout(function () {
          card.className = 'gone';
          setTimeout(function () { card.remove(); }, 800);
        }, 380);
      } else if (++tries > 600) {
        clearInterval(timer); clearInterval(march);
        document.getElementById('boot-note').innerHTML =
          '<span style="color:#8c2f24">This game needs WebGL 2.</span><br>' +
          'Try a current Chrome, Firefox or Safari, with hardware acceleration enabled.';
      }
    }, 100);
  })();
<\/script>`;

// --- artifact target -------------------------------------------------------
rmSync('dist-artifact', { recursive: true, force: true });
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/game.js', js);
writeFileSync(
  'dist-artifact/index.html',
  `<title>OSSUAN — The Ninth Bell</title>\n${BOOT}\n<script type="module" src="game.js"></script>\n`,
);

// --- single-file target ----------------------------------------------------
rmSync('dist-single', { recursive: true, force: true });
mkdirSync('dist-single', { recursive: true });
writeFileSync(
  'dist-single/ossuan.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>OSSUAN — The Ninth Bell</title>
<meta name="color-scheme" content="dark" />
${icon}
</head>
<body>
${BOOT}
<script type="module">
${js}
</script>
</body>
</html>
`,
);

const size = (p) => (readdirSync(p).reduce((n, f) => n + readFileSync(join(p, f)).length, 0) / 1024).toFixed(0);
console.log(`dist-artifact/  ${size('dist-artifact')} KB  (index.html + game.js)`);
console.log(`dist-single/    ${size('dist-single')} KB  (one self-contained file)`);
