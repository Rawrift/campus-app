/**
 * Entry point.
 *
 * Keeps boot deliberately small: inject styles, make a canvas, construct the
 * game, and surface a handle for the automated smoke test.
 */

import { injectStyles } from '@/ui/styles';
import { Game } from '@/game';

function boot(): void {
  injectStyles();

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  document.body.appendChild(canvas);

  let game: Game;
  try {
    game = new Game(canvas);
  } catch (err) {
    // A WebGL failure is the one error the player can actually act on, so it
    // gets a real message rather than a blank screen.
    console.error('[boot] failed to start:', err);
    document.body.innerHTML = `
      <div style="color:#cdc3ad;font-family:Georgia,serif;padding:48px;max-width:600px;margin:0 auto">
        <h1 style="font-weight:400;letter-spacing:.08em">OSSUAN could not start</h1>
        <p style="color:#8c8474;line-height:1.6">
          This game needs WebGL 2. Your browser reported:
        </p>
        <pre style="color:#8c2f24;white-space:pre-wrap;font-size:12px">${String(err)}</pre>
        <p style="color:#8c8474;line-height:1.6">
          Try a current Chrome, Firefox or Safari, and check that hardware
          acceleration is enabled.
        </p>
      </div>`;
    return;
  }

  game.start();

  // The first click satisfies the browser's audio autoplay policy.
  const unlock = () => {
    game.audio.start();
    game.audio.resume();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);

  // Handle for tools/smoke.mjs, which drives a real session in headless
  // Chromium to verify the game actually runs (§53).
  (window as unknown as { __OSSUAN: unknown }).__OSSUAN = {
    game,
    api: game.debugApi,
    ready: true,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
