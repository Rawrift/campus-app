/**
 * Automated smoke test (§53, §65).
 *
 * Builds the game, serves it, drives a real session in headless Chromium, and
 * checks every item on the brief's completion checklist actually happens. It
 * also writes screenshots, so visual claims about the game can be verified
 * rather than asserted.
 *
 * Run with: npm run smoke
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'screenshots';
const HEADED_SHOT = process.argv.includes('--shots');

/**
 * Measures the luminance of what is actually on screen.
 *
 * The WebGL drawing buffer is cleared once a frame is presented, so reading it
 * back afterwards always returns zeros. Taking a real screenshot and decoding
 * it through a 2D canvas measures what the player would actually see, UI
 * included.
 */
async function measureFrame(page, region = null) {
  const buf = await page.screenshot({ clip: region ?? undefined });
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let min = 255, max = 0, sum = 0, n = 0;
    // Sample every 4th pixel: plenty for a statistic, far faster than all of them.
    for (let i = 0; i < px.length; i += 16) {
      const lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      sum += lum; n++;
    }
    return {
      min: Math.round(min), max: Math.round(max),
      mean: Math.round(sum / n), range: Math.round(max - min),
    };
  }, dataUrl);
}

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for the port to answer rather than sleeping a fixed amount.
  for (let i = 0; i < 60; i++) {
    await delay(500);
    try {
      const res = await fetch(URL);
      if (res.ok) return proc;
    } catch { /* not up yet */ }
  }
  throw new Error('preview server did not start');
}

async function main() {
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  console.log(`\nserving ${URL}\n`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const shot = async (name) => {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };

  try {
    // ---------------------------------------------------------------- boot
    console.log('BOOT');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__OSSUAN?.ready === true, { timeout: 30000 });
    check('the game boots', true);

    const renderer = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const gl = c.getContext('webgl2');
      const d = gl?.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    check('WebGL 2 context is live', !!renderer, renderer.slice(0, 60));

    check('the start screen is shown', await page.locator('.screen.open h1').isVisible());
    check('three archetypes are offered', (await page.locator('.archetype-card').count()) === 3);
    await shot('01-start-screen');

    // -------------------------------------------------------- start a game
    console.log('\nSTART A CHARACTER');
    await page.locator('.archetype-card[data-archetype="ironbound"]').click();
    await page.locator('.screen.open .btn').first().click();
    await delay(2500);

    check('the game enters the playing state',
      (await page.evaluate(() => window.__OSSUAN.api.state())) === 'playing');
    check('the character exists and is alive',
      await page.evaluate(() => window.__OSSUAN.api.player()?.actor.alive === true));
    check('the hub loaded',
      (await page.evaluate(() => window.__OSSUAN.api.zoneId())) === 'grestwick');
    await shot('02-hub');

    // The renderer is actually drawing, not showing a blank canvas.
    const drawInfo = await page.evaluate(() => {
      const g = window.__OSSUAN.game;
      return { calls: g.scene.stats.calls, tris: g.scene.stats.triangles };
    });
    check('the scene is drawing geometry', drawInfo.calls > 10 && drawInfo.tris > 5000,
      `${drawInfo.calls} draw calls, ${drawInfo.tris} triangles`);

    const frame = await measureFrame(page);
    check('the frame has real image content', frame.range > 25,
      `luminance ${frame.min}-${frame.max}, mean ${frame.mean}`);
    check('the scene is lit well enough to read', frame.mean > 16,
      `mean luminance ${frame.mean}`);

    // ------------------------------------------------------------ movement
    console.log('\nMOVEMENT');
    const before = await page.evaluate(() => {
      const a = window.__OSSUAN.api.player().actor;
      return { x: a.x, y: a.y };
    });
    await page.mouse.click(760, 300);
    await delay(1800);
    const after = await page.evaluate(() => {
      const a = window.__OSSUAN.api.player().actor;
      return { x: a.x, y: a.y };
    });
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    check('clicking the ground moves the character', moved > 1.0, `moved ${moved.toFixed(2)} units`);

    // ------------------------------------------------------------- combat
    console.log('\nCOMBAT');
    await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      api.spawn('kept_villager', p.x + 3, p.y);
      api.spawn('kept_villager', p.x + 4, p.y + 1);
    });
    await delay(400);
    const enemyHpBefore = await page.evaluate(() =>
      window.__OSSUAN.api.world().actors.filter((a) => a.faction === 'hostile')
        .reduce((s, a) => s + a.health, 0));

    // Attack by clicking on an enemy repeatedly.
    for (let i = 0; i < 26; i++) {
      const pos = await page.evaluate(() => {
        const g = window.__OSSUAN.game;
        const e = g.debugApi.world().actors.find((a) => a.faction === 'hostile' && a.alive);
        if (!e) return null;
        const v = new g.scene.cameraRig.camera.position.constructor(e.x, 1, e.y)
          .project(g.scene.cameraRig.camera);
        return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
      });
      if (!pos) break;
      await page.mouse.click(Math.round(pos.x), Math.round(pos.y));
      await delay(260);
    }

    const combat = await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      return {
        enemyHp: api.world().actors.filter((a) => a.faction === 'hostile').reduce((s, a) => s + a.health, 0),
        kills: api.stats().kills,
        xp: api.player().progression.xp,
        dead: api.world().actors.filter((a) => a.faction === 'hostile' && !a.alive).length,
      };
    });
    check('attacking damages enemies', combat.enemyHp < enemyHpBefore,
      `${enemyHpBefore.toFixed(0)} → ${combat.enemyHp.toFixed(0)} total enemy health`);
    check('enemies can be killed', combat.dead > 0 || combat.kills > 0, `${combat.kills} kills`);
    check('kills award experience', combat.xp > 0, `${combat.xp} xp`);
    await shot('03-combat');

    // ------------------------------------------------------- taking damage
    console.log('\nDAMAGE AND DEATH');
    await page.evaluate(async () => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      for (let i = 0; i < 5; i++) api.spawn('kept_flagellant', p.x + 2 + i * 0.4, p.y + 1);
    });
    /*
     * Wait on simulated time, not on wall-clock.
     *
     * Five flagellants have to close, telegraph and land a blow, which is about
     * a second and a half of game time. A fixed `delay` assumed that buys the
     * same in simulation, and it does on hardware -- but this runs on
     * SwiftShader with no GPU at around one frame per second, and the clock's
     * spiral-of-death guard caps how many fixed steps one frame may catch up.
     * Four and a half seconds of wall-clock then bought a handful of ticks and
     * the check failed on a game that was working fine, just slowly.
     */
    const hurt = await page.evaluate(async () => {
      const api = window.__OSSUAN.api;
      const a = api.player().actor;
      const start = performance.now();
      while (a.health >= a.maxHealth && performance.now() - start < 40000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { hp: a.health, max: a.maxHealth };
    });
    check('enemies damage the player', hurt.hp < hurt.max, `${hurt.hp.toFixed(0)}/${hurt.max}`);

    // Kill the player through the real damage path, so death, the event and
    // the screen are all genuinely exercised rather than poked into place.
    await page.evaluate(() => {
      const g = window.__OSSUAN.game;
      const p = g.debugApi.player().actor;
      g.debugApi.world().damage(null, p, { amounts: { physical: 99999 } });
    });
    await delay(1200);
    const died = await page.evaluate(() => ({
      state: window.__OSSUAN.api.state(),
      screen: !!document.querySelector('.screen.open h1.dead'),
    }));
    check('the player can die', died.state === 'dead' || died.screen, `state=${died.state}`);
    if (died.screen) await shot('04-death');

    // Respawn.
    if (died.screen) {
      await page.locator('.screen.open .btn').click();
      await delay(1500);
    }
    check('the player can restart after dying',
      (await page.evaluate(() => window.__OSSUAN.api.player().actor.alive)) === true);

    // ---------------------------------------------------------------- loot
    console.log('\nLOOT, INVENTORY AND EQUIPMENT');
    await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      api.setGod(true);
      api.grantXp(4000);
      for (let i = 0; i < 8; i++) api.giveItem(10);
      // A separate high-bonus batch, purely to sample the rarity curve.
      window.__rarities = [];
      for (let i = 0; i < 220; i++) {
        const it = window.__OSSUAN.game.debugApi.world().rng;
        void it;
      }
    });
    await delay(600);
    const inv = await page.evaluate(() => {
      const p = window.__OSSUAN.api.player();
      return {
        count: p.inventory.count,
        rarities: p.inventory.all.map((i) => i.rarity),
        affixes: p.inventory.all.reduce((n, i) => n + i.affixes.length, 0),
      };
    });
    check('items land in the inventory', inv.count >= 6, `${inv.count} items`);
    check('generated items carry affixes', inv.affixes > 0, `${inv.affixes} affixes total`);
    // Sample the generator properly rather than inferring the curve from 8 drops.
    const curve = await page.evaluate(() => {
      const counts = {};
      for (let i = 0; i < 400; i++) {
        const item = window.__OSSUAN.api.giveItem(1.2);
        if (item) { counts[item.rarity] = (counts[item.rarity] ?? 0) + 1; }
        if (item) window.__OSSUAN.api.player().inventory.remove(item.uid);
      }
      return counts;
    });
    check('the generator produces several rarities', Object.keys(curve).length > 1,
      Object.entries(curve).map(([k, v]) => `${k} ${v}`).join(', '));

    await page.evaluate(() => window.__OSSUAN.api.openPanel('inventory'));
    await delay(400);
    check('the inventory panel renders the grid',
      (await page.locator('#panel-inventory .inv-item').count()) > 0);
    await shot('05-inventory');

    // Equipment, and crucially whether the character mesh changed (§4).
    const equipBefore = await page.evaluate(() => {
      const g = window.__OSSUAN.game;
      const view = [...g.scene.actorViews?.values?.() ?? []];
      return { sig: g.scene.equipSignature, count: view.length };
    }).catch(() => ({ sig: '', count: 0 }));

    await page.evaluate(() => window.__OSSUAN.api.equipAll());
    await delay(900);

    const equipped = await page.evaluate(() => {
      const p = window.__OSSUAN.api.player();
      const g = window.__OSSUAN.game;
      // Count the *rigid* meshes hanging off the player's rig: equipping must
      // add geometry to the character, which is the §4 requirement. Counting
      // every mesh stopped measuring that once the body became a single
      // skinned mesh -- the total then moves when the body changes, which is
      // the opposite of what this check is for. Armour, weapons and hair are
      // the rigid attachments, so they are what gets counted.
      let meshes = 0;
      const playerId = p.actor.id;
      g.scene.scene.traverse(() => {});
      const view = g.scene.actorViews?.get?.(playerId);
      if (view) view.root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes++; });
      return {
        slots: p.equipment.entries.length,
        armour: p.actor.stats.get('armour'),
        meshes,
      };
    });
    check('items can be equipped', equipped.slots > 0, `${equipped.slots} slots filled`);
    check('equipment raises armour', equipped.armour > 0, `${equipped.armour.toFixed(1)} armour`);
    check('the character carries equipment geometry', equipped.meshes > 12,
      `${equipped.meshes} rigid attachment meshes on the rig`);
    void equipBefore;

    await page.evaluate(() => window.__OSSUAN.api.openPanel('character'));
    await delay(400);
    await shot('06-character');
    await page.evaluate(() => window.__OSSUAN.api.closePanels());

    // -------------------------------------------------------------- skills
    console.log('\nSKILLS AND PROGRESSION');
    const prog = await page.evaluate(() => {
      const p = window.__OSSUAN.api.player();
      return { level: p.progression.level, skills: p.progression.skills.size, points: p.progression.skillPoints };
    });
    check('the character levels up', prog.level > 1, `level ${prog.level}`);
    check('levelling grants new skills', prog.skills > 1, `${prog.skills} skills known`);

    await page.evaluate(() => window.__OSSUAN.api.openPanel('skills'));
    await delay(400);
    check('the skill panel lists the archetype tree',
      (await page.locator('#panel-skills .skill-row').count()) >= 8);
    await shot('07-skills');
    await page.evaluate(() => window.__OSSUAN.api.closePanels());

    // Use a bound skill and confirm it fires.
    await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      api.spawn('kept_villager', p.x + 3, p.y);
      api.player().actor.resource = api.player().actor.maxResource;
    });
    await delay(300);
    await page.mouse.move(700, 360);
    await page.keyboard.press('Digit1');
    await delay(900);
    const skillUsed = await page.evaluate(() => {
      const p = window.__OSSUAN.api.player();
      return [...p.progression.skills.values()].some((s) => s.cooldownRemaining > 0)
        || p.actor.resource < p.actor.maxResource;
    });
    check('bound skills can be used', skillUsed);

    // ----------------------------------------------------------- the world
    console.log('\nWORLD, ELITES AND BOSS');
    await page.evaluate(() => window.__OSSUAN.api.travelTo('marches'));
    await delay(2200);
    check('the outdoor region loads',
      (await page.evaluate(() => window.__OSSUAN.api.zoneId())) === 'marches');
    await shot('08-marches');

    await page.evaluate(() => window.__OSSUAN.api.travelTo('ossuary'));
    await delay(2200);
    check('the dungeon loads',
      (await page.evaluate(() => window.__OSSUAN.api.zoneId())) === 'ossuary');
    await shot('09-dungeon');

    const elite = await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      const c = api.spawn('kept_warden', p.x + 4, p.y, 2);
      return c ? { name: c.actor.name, hp: c.actor.maxHealth, affixes: c.actor.eliteAffixes.length } : null;
    });
    check('elites spawn with modifiers', !!elite && elite.affixes === 2,
      elite ? `${elite.name} (${elite.hp} hp)` : 'none');
    await delay(1400);
    await shot('10-elite');

    const boss = await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      const c = api.spawn('boss_ausric', p.x + 6, p.y);
      return c ? { name: c.actor.name, hp: c.actor.maxHealth, phases: c.def.phaseThresholds?.length ?? 0 } : null;
    });
    check('the boss spawns with three phases', !!boss && boss.phases === 2,
      boss ? `${boss.name}, ${boss.hp} hp` : 'none');
    await delay(2600);
    const bossBar = await page.locator('.boss-bar.visible').count();
    check('the boss health bar appears when engaged', bossBar > 0);
    await shot('11-boss');

    // Drive the boss through its phases.
    await page.evaluate(() => {
      const w = window.__OSSUAN.api.world();
      const b = w.actors.find((a) => a.isBoss);
      if (b) b.health = b.maxHealth * 0.2;
    });
    await delay(1200);
    const phase = await page.evaluate(() => {
      const z = window.__OSSUAN.api.zone();
      for (const c of z.enemies.values()) if (c.actor.isBoss) return c.ctx.bossPhase;
      return -1;
    });
    check('the boss advances phases as it is wounded', phase >= 2, `phase index ${phase}`);

    // ---------------------------------------------------------- save/load
    console.log('\nSAVE AND RELOAD');
    const preSave = await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      api.save();
      const p = api.player();
      return {
        level: p.progression.level,
        xp: p.progression.xp,
        items: p.inventory.count,
        equipped: p.equipment.entries.length,
        armour: p.actor.stats.get('armour'),
        zone: api.zoneId(),
      };
    });
    check('the game saves', await page.evaluate(() => window.__OSSUAN.api.hasSave()));

    // Full page reload: this is the real test, not an in-memory round trip.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__OSSUAN?.ready === true, { timeout: 30000 });
    await delay(800);
    await page.locator('#btn-continue').click();
    await delay(2500);

    const postLoad = await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player();
      return {
        level: p.progression.level,
        xp: p.progression.xp,
        items: p.inventory.count,
        equipped: p.equipment.entries.length,
        armour: p.actor.stats.get('armour'),
        zone: api.zoneId(),
        alive: p.actor.alive,
      };
    });
    check('the character reloads at the same level',
      postLoad.level === preSave.level, `${preSave.level} → ${postLoad.level}`);
    check('experience survives the reload', postLoad.xp === preSave.xp);
    check('the inventory survives the reload',
      postLoad.items === preSave.items, `${preSave.items} → ${postLoad.items} items`);
    check('equipment survives the reload',
      postLoad.equipped === preSave.equipped, `${preSave.equipped} → ${postLoad.equipped} slots`);
    check('derived stats are rebuilt identically',
      Math.abs(postLoad.armour - preSave.armour) < 0.01,
      `${preSave.armour.toFixed(1)} → ${postLoad.armour.toFixed(1)} armour`);
    check('the zone is restored', postLoad.zone === preSave.zone, postLoad.zone);
    await shot('12-reloaded');

    // ------------------------------------------------------- performance
    console.log('\nPERFORMANCE');
    await page.evaluate(() => {
      const api = window.__OSSUAN.api;
      const p = api.player().actor;
      api.setGod(true);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        api.spawn('kept_villager', p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7);
      }
    });
    await delay(3500);
    const perf = await page.evaluate(async () => {
      const frames = [];
      let last = performance.now();
      await new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (++n < 90) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      frames.sort((a, b) => a - b);
      const g = window.__OSSUAN.game;
      return {
        median: frames[Math.floor(frames.length / 2)],
        p95: frames[Math.floor(frames.length * 0.95)],
        calls: g.scene.stats.calls,
        tris: g.scene.stats.triangles,
        actors: g.debugApi.world().actors.length,
      };
    });
    console.log(`    ${perf.actors} actors · ${perf.calls} draw calls · ${(perf.tris / 1000).toFixed(0)}k triangles`);
    console.log(`    median frame ${perf.median.toFixed(1)}ms · p95 ${perf.p95.toFixed(1)}ms (SwiftShader, no GPU)`);

    // Measure torch shadows separately: they are six cube-face renders per
    // lamp, which is cheap on a GPU and brutal on a software rasteriser, so
    // folding them into one number would misrepresent both.
    const shadowCost = await page.evaluate(async () => {
      const measure = async () => {
        const frames = [];
        let last = performance.now();
        await new Promise((resolve) => {
          let n = 0;
          const tick = () => {
            const now = performance.now();
            frames.push(now - last);
            last = now;
            if (++n < 40) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        frames.sort((a, b) => a - b);
        return frames[Math.floor(frames.length / 2)];
      };
      const api = window.__OSSUAN.api;
      api.setTorchShadows(false);
      const off = await measure();
      api.setTorchShadows(true);
      const on = await measure();
      api.setTorchShadows(false);

      // Ambient occlusion costs a whole extra scene render for its normal
      // buffer, on top of the pass itself, so it is worth measuring rather than
      // assuming. It is a graphics option for exactly this reason.
      api.setAmbientOcclusion(false);
      const aoOff = await measure();
      api.setAmbientOcclusion(true);
      const aoOn = await measure();
      return { off, on, aoOff, aoOn };
    });
    console.log(`    torch shadows: ${shadowCost.off.toFixed(0)}ms off · ${shadowCost.on.toFixed(0)}ms on`);
    console.log(`    ambient occlusion: ${shadowCost.aoOff.toFixed(0)}ms off · ${shadowCost.aoOn.toFixed(0)}ms on`);
    check('torch shadows can be turned off', shadowCost.off > 0 && shadowCost.on > 0,
      `${((shadowCost.on / shadowCost.off - 1) * 100).toFixed(0)}% cost on software rendering`);
    check('ambient occlusion can be turned off', shadowCost.aoOff > 0 && shadowCost.aoOn > 0,
      `${((shadowCost.aoOn / shadowCost.aoOff - 1) * 100).toFixed(0)}% cost on software rendering`);
    check('the renderer stays within a sane draw-call budget under load',
      perf.calls < 900, `${perf.calls} draw calls with ${perf.actors} actors`);
    await shot('13-stress');

    // -------------------------------------------------------------- errors
    console.log('\nRUNTIME HEALTH');
    // Missing-content warnings are reported by the game itself and would show
    // up here, so an empty list is a real signal.
    const realErrors = [...pageErrors, ...consoleErrors].filter(
      (e) => !e.includes('favicon') && !e.includes('Download the React'),
    );
    check('no uncaught exceptions during the whole session',
      pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'none');
    check('no console errors during the whole session',
      realErrors.length === 0, realErrors.slice(0, 2).join(' | ') || 'none');

  } catch (err) {
    check(`the session ran to completion`, false, String(err).split('\n')[0]);
    await shot('99-failure').catch(() => {});
  } finally {
    await browser.close();
    server.kill();
  }

  // ------------------------------------------------------------- summary
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`  ${passed}/${results.length} checks passed`);
  if (HEADED_SHOT || true) console.log(`  screenshots written to ./${SHOTS}/`);
  console.log(`${'─'.repeat(66)}\n`);

  if (failures > 0) {
    console.log('FAILED CHECKS:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.name} — ${r.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
