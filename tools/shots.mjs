/**
 * Beauty shots.
 *
 * Sets up specific scenarios and screenshots them, so the visual direction can
 * be reviewed and iterated on quickly instead of being asserted.
 *
 * Run with: node tools/shots.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 4197;
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = 'screenshots';

async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await delay(400);
    try { if ((await fetch(URL)).ok) return proc; } catch { /* waiting */ }
  }
  throw new Error('server did not start');
}

const SCENES = [
  {
    name: 'hub',
    setup: async (page) => {
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.travelTo('grestwick');
      });
      await delay(2200);
    },
  },
  {
    name: 'gear',
    setup: async (page) => {
      // A fully kitted character, to show the equipment actually on the model.
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.grantXp(6000);
        for (const baseId of [
          'arm_head_plate', 'arm_chest_plate', 'arm_shoulders_plate', 'arm_hands_plate',
          'arm_belt_plate', 'arm_legs_mail', 'arm_feet_plate', 'arm_cloak_1',
          'wpn_sword_2', 'shd_2',
        ]) {
          const p = api.player();
          const item = api.giveItem(30);
          if (item) {
            const forced = { ...item, baseId, rarity: 'haunted' };
            p.inventory.remove(item.uid);
            p.inventory.add(forced);
            p.equipFromInventory(forced.uid);
          }
        }
        window.__OSSUAN.game.scene.cameraRig.settings.distance = 12.5;
      });
      await delay(1600);
    },
  },
  {
    name: 'marches',
    setup: async (page) => {
      await page.evaluate(() => window.__OSSUAN.api.travelTo('marches'));
      await delay(2400);
    },
  },
  {
    name: 'graveyard',
    setup: async (page) => {
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.travelTo('marches');
      });
      await delay(2200);
      await page.evaluate(() => {
        const p = window.__OSSUAN.api.player().actor;
        p.x = 22; p.y = 32;
        window.__OSSUAN.game.scene.cameraRig.snapTo(22, 32);
      });
      await delay(1800);
    },
  },
  {
    name: 'ossuary',
    setup: async (page) => {
      await page.evaluate(() => window.__OSSUAN.api.travelTo('ossuary'));
      await delay(2400);
      await page.evaluate(() => {
        const p = window.__OSSUAN.api.player().actor;
        p.x = 31; p.y = 64;
        window.__OSSUAN.game.scene.cameraRig.snapTo(31, 64);
      });
      await delay(2000);
    },
  },
  {
    name: 'fight',
    setup: async (page) => {
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.setGod(true);
        const p = api.player().actor;
        for (const [id, n] of [['kept_villager', 3], ['beast_hound', 2], ['kept_deserter', 2]]) {
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            api.spawn(id, p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4);
          }
        }
      });
      await delay(3600);
    },
  },
  {
    name: 'elite',
    setup: async (page) => {
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.setGod(true);
        const p = api.player().actor;
        api.spawn('kept_warden', p.x + 4, p.y, 2);
        api.spawn('hollow_gleaner', p.x - 3, p.y + 2, 1);
        api.spawn('hollow_wisp', p.x + 1, p.y - 4);
      });
      await delay(3000);
    },
  },
  {
    name: 'boss',
    setup: async (page) => {
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.travelTo('ossuary');
      });
      await delay(2200);
      await page.evaluate(() => {
        const api = window.__OSSUAN.api;
        api.setGod(true);
        const p = api.player().actor;
        p.x = 32; p.y = 11;
        window.__OSSUAN.game.scene.cameraRig.snapTo(32, 11);
        api.spawn('boss_ausric', 32, 6);
      });
      await delay(3400);
    },
  },
];

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('  ! page error:', String(e).slice(0, 160)));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__OSSUAN?.ready === true, { timeout: 30000 });
  await page.locator('.archetype-card[data-archetype="ironbound"]').click();
  await page.locator('.screen.open .btn').first().click();
  await delay(2600);

  for (const scene of SCENES) {
    try {
      // Reset the camera between scenes so an override cannot leak forward.
      await page.evaluate(() => {
        window.__OSSUAN.game.scene.cameraRig.settings.distance = 15.5;
      });
      await scene.setup(page);
      await page.screenshot({ path: `${OUT}/shot-${scene.name}.png` });
      console.log(`  wrote ${OUT}/shot-${scene.name}.png`);
    } catch (err) {
      console.log(`  ! ${scene.name} failed: ${String(err).split('\n')[0]}`);
    }
  }

  await browser.close();
  server.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
