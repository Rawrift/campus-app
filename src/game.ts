/**
 * The game: wires the simulation, renderer, UI, audio and input together, and
 * owns the main loop.
 *
 * Deliberately the only place that knows about all the layers. Every other
 * module knows about at most its own neighbours, which is what keeps the
 * simulation testable without any of this existing (§37).
 */

import * as THREE from 'three';
import { Clock, FIXED_DT } from '@/core/time';
import { bus } from '@/core/events';
import { clamp } from '@/core/math';
import { PlayerController } from '@/sim/player';
import { ZoneRuntime } from '@/world/zoneRuntime';
import { ZONES } from '@/world/zones';
import { ENEMIES } from '@/data/enemies.data';
import { ITEM_BASES } from '@/data/items.data';
import { SKILLS } from '@/data/skills.data';
import { ARCHETYPES } from '@/data/archetypes.data';
import { generateItem } from '@/sim/loot';
import { RARITY } from '@/sim/items';
import { GameScene } from '@/render/scene';
import { Hud } from '@/ui/hud';
import { AudioEngine } from '@/audio/audio';
import { Input } from '@/input';
import {
  BrowserStorage, applySave, createSave, loadStash, readSave, writeSave,
  type SaveFile,
} from '@/save/save';
import type { ArchetypeId } from '@/sim/ability';
import type { SimWorld } from '@/sim/world';
import type { Zone } from '@/sim/zone';
import type { Actor } from '@/sim/entity';
import type { ItemInstance } from '@/sim/items';
import type { Interactable } from '@/world/zoneDef';

const SAVE_SLOT = 'main';
/** How close the player must be to a drop to sweep it up. */
const PICKUP_RADIUS = 1.4;

export type GameState = 'menu' | 'playing' | 'paused' | 'dead';

export class Game {
  readonly scene: GameScene;
  readonly hud: Hud;
  readonly audio = new AudioEngine();
  readonly input: Input;
  private clock = new Clock();
  private storage = new BrowserStorage();

  state: GameState = 'menu';
  private zones = new ZoneRuntime('ossuan');
  private world: SimWorld | null = null;
  private zone: Zone | null = null;
  private player: PlayerController | null = null;
  private currentZoneId = 'grestwick';
  private stash: ItemInstance[] = [];
  private archetype: ArchetypeId = 'ironbound';
  private seed = 'ossuan';

  private stats = { kills: 0, deaths: 0, playtime: 0, bossDefeated: false };
  private bossActor: Actor | null = null;
  private hoveredInteractable: Interactable | null = null;
  private pointerWorld = new THREE.Vector3();
  private godMode = false;
  private frameTimes: number[] = [];
  private running = false;
  private unsubscribes: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new GameScene(canvas);
    this.input = new Input(canvas);
    this.hud = new Hud({
      onSkillSlot: (i) => this.useSkillSlot(i),
      onPotion: () => this.usePotion(),
      onEquip: (uid) => this.equipItem(uid),
      onUnequip: (slot) => this.unequipItem(slot),
      onDropItem: (uid) => this.dropItem(uid),
      onSellItem: (uid) => this.sellItem(uid),
      onMoveItem: (uid, x, y) => this.moveItem(uid, x, y),
      onSpendPoint: (id) => this.spendPoint(id),
      onBindSkill: (id, slot) => this.bindSkill(id, slot),
      onNewGame: (a) => this.newGame(a as ArchetypeId),
      onContinue: () => this.loadGame(),
      onSave: () => this.saveGame(),
      onLoad: () => this.loadGame(),
      onRestart: () => this.respawn(),
      onResume: () => this.resume(),
    });

    this.hud.onSettingChanged = (key, value) => {
      if (key === 'torchShadows') this.scene.setTorchShadows(value);
      if (key === 'bloom') this.scene.setBloom(value);
      if (key === 'ambientOcclusion') this.scene.setAmbientOcclusion(value);
    };

    this.wireEvents();
    this.hud.showStart(!!readSave(this.storage, SAVE_SLOT));
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  // --- event wiring ------------------------------------------------------

  private wireEvents(): void {
    const on = <K extends Parameters<typeof bus.on>[0]>(name: K, fn: Parameters<typeof bus.on>[1]) => {
      this.unsubscribes.push(bus.on(name, fn as never));
    };

    on('ENTITY_DAMAGED', (({ actor, result }: { actor: Actor; result: { total: number; crit: boolean; dominantType: string; overTime: boolean } }) => {
      if (result.total <= 0) return;
      const isPlayer = actor.id === this.player?.actor.id;

      this.scene.onHit(actor.x, actor.height * 0.55, actor.y, result.dominantType, result.total, result.crit);

      const weapon = this.player?.equipment.weapon?.category ?? 'sword';
      this.audio.playImpact(result.dominantType, actor.stats.get('armour'), weapon, result.crit);
      if (isPlayer) this.audio.play('player_hurt', Math.random());

      // Hit-stop and shake, scaled by how big the hit was. Both are capped
      // hard: §8 asks for "extremadamente controlado".
      if (!result.overTime) {
        const weight = clamp(result.total / 45, 0.1, 1);
        this.clock.requestHitStop(result.crit ? 0.075 : 0.03 + weight * 0.035);
        if (this.hud.settings.screenShake) {
          this.scene.shake(
            (isPlayer ? 0.14 : 0.05) + weight * (result.crit ? 0.16 : 0.07),
            isPlayer ? 0.24 : 0.16,
          );
        }
      }

      const screen = this.worldToScreen(actor.x, actor.height * 0.8, actor.y);
      if (screen) {
        this.hud.damageNumber(
          screen.x, screen.y, result.total,
          isPlayer ? 'player' : result.crit ? 'crit' : result.overTime ? 'dot' : 'normal',
        );
      }
    }) as never);

    on('ENTITY_DIED', (({ actor }: { actor: Actor }) => {
      if (actor.id === this.player?.actor.id) {
        this.audio.play('player_death');
        return;
      }
      if (this.hud.settings.gore) this.scene.onDeath(actor);
      this.audio.play('enemy_death', Math.random());
      this.stats.kills++;
      if (actor.isBoss) {
        this.hud.hideBoss();
        this.bossActor = null;
      }
    }) as never);

    on('ENTITY_HEALED', (({ actor, amount }: { actor: Actor; amount: number }) => {
      if (amount < 1) return;
      const screen = this.worldToScreen(actor.x, actor.height * 0.9, actor.y);
      if (screen) this.hud.damageNumber(screen.x, screen.y, amount, 'heal');
    }) as never);

    on('ITEM_DROPPED', (({ item }: { item: ItemInstance }) => {
      // A rare drop gets its own sound. This is the loop's payoff (§45, §61).
      if (item.rarity === 'reliquary' || item.rarity === 'haunted') {
        this.audio.play('item_rare');
        this.hud.notify(`${RARITY[item.rarity].label}: ${item.name}`, 'good');
      } else {
        this.audio.play('item_drop', Math.random());
      }
    }) as never);

    on('ITEM_PICKED', (({ item }: { item: ItemInstance }) => {
      this.audio.play('item_pickup', Math.random());
      this.hud.notify(item.name, item.rarity === 'blank' ? 'neutral' : 'good');
      this.refreshPanels();
    }) as never);

    on('ITEM_EQUIPPED', (() => {
      this.audio.play('equip');
      this.refreshPanels();
    }) as never);

    on('LEVEL_UP', (({ level }: { level: number }) => {
      this.audio.play('level_up');
      this.hud.notify(`Level ${level}`, 'good');
      this.refreshPanels();
    }) as never);

    on('SKILL_LEARNED', (({ skillId }: { skillId: string }) => {
      const def = SKILLS.find(skillId);
      this.audio.play('skill_learn');
      if (def) this.hud.notify(`Learned: ${def.name}`, 'good');
    }) as never);

    on('SKILL_USED', (({ skillId }: { skillId: string }) => {
      const def = SKILLS.find(skillId);
      if (!def) return;
      this.audio.play(def.tags.includes('melee') ? 'swing' : 'cast', Math.random());
    }) as never);

    on('BOSS_STARTED', (({ name, bossId }: { name: string; bossId: string }) => {
      this.hud.showBoss(name);
      this.audio.play('boss_start');
      this.hud.notify(ENEMIES.find(bossId)?.note ?? name, 'bad');
      for (const [, controller] of this.zone?.enemies ?? []) {
        if (controller.actor.isBoss) this.bossActor = controller.actor;
      }
    }) as never);

    on('BOSS_PHASE', (({ phase }: { phase: number }) => {
      this.audio.play('boss_phase');
      this.hud.notify(`The bell changes. Phase ${phase}.`, 'bad');
      if (this.hud.settings.screenShake) this.scene.shake(0.3, 0.5);
    }) as never);

    on('BOSS_DEFEATED', (({ name }: { name: string }) => {
      this.stats.bossDefeated = true;
      this.audio.play('boss_phase');
      this.clock.timeScale = 0.35;
      setTimeout(() => { this.clock.timeScale = 1; }, 1400);
      setTimeout(() => this.showVictory(name), 2600);
    }) as never);

    on('PLAYER_DIED', (() => {
      this.stats.deaths++;
      this.state = 'dead';
      this.hud.showDeath();
      this.hud.closeAllPanels();
    }) as never);

    on('NOTIFY', (({ text, tone }: { text: string; tone?: 'good' | 'bad' | 'neutral' }) => {
      this.hud.notify(text, tone ?? 'neutral');
    }) as never);

    on('ZONE_ENTERED', (({ name }: { name: string }) => {
      const def = ZONES[this.currentZoneId];
      this.hud.zoneCard(name, def?.subtitle ?? '');
    }) as never);
  }

  // --- lifecycle ---------------------------------------------------------

  newGame(archetype: ArchetypeId): void {
    this.audio.start();
    this.audio.startMusic();
    this.archetype = archetype;
    this.seed = `ossuan-${Date.now()}`;
    this.zones = new ZoneRuntime(this.seed);
    this.stash = [];
    this.stats = { kills: 0, deaths: 0, playtime: 0, bossDefeated: false };
    this.hud.hideStart();
    this.travelTo('grestwick');
    this.state = 'playing';
    this.start();
  }

  loadGame(): void {
    const file = readSave(this.storage, SAVE_SLOT);
    if (!file) {
      this.hud.notify('No saved character.', 'bad');
      return;
    }
    this.audio.start();
    this.audio.startMusic();
    this.archetype = file.character.archetypeId;
    this.seed = file.seed;
    this.zones = new ZoneRuntime(this.seed);
    this.stash = loadStash(file);
    this.stats = { ...file.stats };
    this.hud.hideStart();
    this.hud.hideDeath();

    this.travelTo(file.world.zoneId, file.world.x, file.world.y, file);
    this.state = 'playing';
    this.start();
    this.hud.notify('Character loaded.', 'good');
  }

  saveGame(): void {
    if (!this.player) return;
    const file = createSave({
      player: this.player, zones: this.zones, zoneId: this.currentZoneId,
      seed: this.seed, stash: this.stash, stats: this.stats,
    });
    writeSave(this.storage, SAVE_SLOT, file);
    this.hud.notify('Saved.', 'good');
    bus.emit('GAME_SAVED', { slot: SAVE_SLOT });
  }

  /** Loads a zone, carrying the character across (§35 — travel is not a reset). */
  private travelTo(zoneId: string, x?: number, y?: number, restore?: SaveFile): void {
    const previous = this.player;
    this.currentZoneId = zoneId;

    const { world, zone, loaded } = this.zones.load(zoneId, (newWorld) => {
      const player = new PlayerController(newWorld, this.archetype, this.seed);
      if (restore) {
        applySave(restore, player, this.zones);
      } else if (previous) {
        // Carry everything across by re-applying a save made in memory.
        const snapshot = createSave({
          player: previous, zones: this.zones, zoneId,
          seed: this.seed, stash: this.stash, stats: this.stats,
        });
        applySave(snapshot, player, this.zones);
      }
      return player;
    }, x !== undefined && y !== undefined ? { x, y } : undefined);

    this.world = world;
    this.zone = zone;
    this.player = zone.player;

    this.scene.loadZone(loaded);
    this.scene.cameraRig.snapTo(this.player.actor.x, this.player.actor.y);
    this.hud.minimap.setZone(loaded.grid);
    this.audio.setAmbience(loaded.def.ambience.ambienceTrack);
    this.hud.hideBoss();
    this.bossActor = null;
    this.refreshPanels();
  }

  private respawn(): void {
    this.hud.hideDeath();
    // Death costs progress towards the dungeon, not the character. The bodies
    // stay where they fell; you walk back out (§45 — death must sting, not
    // erase).
    this.travelTo('grestwick');
    if (this.player) {
      this.player.actor.alive = true;
      this.player.actor.action = 'idle';
      this.player.actor.health = this.player.actor.maxHealth;
      this.player.actor.resource = this.player.archetypeId === 'ironbound' ? 0 : this.player.actor.maxResource;
      this.player.potion.count = Math.max(2, this.player.potion.count);
    }
    this.state = 'playing';
  }

  private showVictory(name: string): void {
    const p = this.player;
    const summary = `You put down ${name}.<br><br>`
      + `${this.stats.kills} killed &middot; level ${p?.progression.level ?? 1} `
      + `&middot; ${Math.floor(this.stats.playtime / 60)} minutes<br><br>`
      + 'The bell is quiet. The rest of the Marches are not.';
    this.hud.showVictory(summary);
    this.saveGame();
  }

  private resume(): void {
    this.hud.closeAllPanels();
    this.state = 'playing';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  // --- main loop ---------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);

    const steps = this.clock.tick(now);
    const dt = Math.min(0.05, this.clock.elapsed > 0 ? (performance.now() - now) / 1000 + 1 / 60 : 1 / 60);

    if (this.state === 'playing' || this.state === 'dead') {
      this.handleInput();
      for (let i = 0; i < steps; i++) this.simulate();
      this.stats.playtime += steps * FIXED_DT;
    } else {
      this.handleMenuInput();
    }

    this.render(dt);
    this.input.endFrame();
  };

  private simulate(): void {
    const { zone, player } = this;
    if (!zone || !player) return;

    for (const actor of this.world!.actors) actor.snapshot();
    zone.update(FIXED_DT);
    this.zones.update();

    // Sweep up nearby drops automatically. A separate pick-up click per item
    // is friction the loop does not need (§16).
    for (const ground of this.world!.itemsNear(player.actor.x, player.actor.y, PICKUP_RADIUS)) {
      if (!ground.settled) continue;
      if (!player.tryPickUp(ground)) break;
    }

    if (this.godMode) {
      player.actor.health = player.actor.maxHealth;
    }
  }

  private handleInput(): void {
    const { player, world } = this;
    if (!player || !world) return;
    const p = this.input.pointer;

    // --- panel toggles ----------------------------------------------------
    if (this.input.pressed('inventory')) { this.hud.togglePanel('inventory'); this.hud.renderInventory(player); }
    if (this.input.pressed('character')) { this.hud.togglePanel('character'); this.hud.renderCharacter(player); }
    if (this.input.pressed('skills')) { this.hud.togglePanel('skills'); this.hud.renderSkills(player); }
    if (this.input.pressed('menu')) {
      if (this.hud.anyPanelOpen) this.hud.closeAllPanels();
      else { this.hud.renderMenu(); this.hud.openPanel('menu'); this.state = 'paused'; }
    }
    if (this.input.pressed('map')) {
      this.hud.minimap.zoom = this.hud.minimap.zoom > 40 ? 34 : 68;
    }
    if (this.input.pressed('debug')) {
      this.hud.setDebug(this.hud.debugVisible ? null : '');
    }
    if (this.input.pressed('stop')) player.stop();

    // Shift toggles tooltip comparison (§15).
    const shift = this.input.down('forceMove');
    if (shift !== this.hud.tooltip.compareMode) {
      this.hud.tooltip.compareMode = shift;
      this.hud.tooltip.refresh();
    }

    this.handleDebugKeys();

    if (this.state !== 'playing') return;

    // --- pointer ----------------------------------------------------------
    const ground = this.scene.cameraRig.screenToGround(p.ndcX, p.ndcY);
    if (ground) this.pointerWorld.copy(ground);

    if (p.wheel !== 0) this.scene.cameraRig.zoom(p.wheel * 1.1);

    this.hoveredInteractable = this.zones.interactableAt(player.actor.x, player.actor.y);
    this.hud.setInteractPrompt(
      this.hoveredInteractable && !this.hoveredInteractable.used
        ? this.hoveredInteractable.label
        : this.hoveredInteractable ? `${this.hoveredInteractable.label} (spent)` : null,
    );

    if (this.input.pressed('interact') && this.hoveredInteractable) {
      this.useInteractable(this.hoveredInteractable);
    }

    if (p.overUi) return;

    // --- left click: move, or attack the thing under the cursor -----------
    // Acting on `leftPressed` as well as `leftDown` matters: a quick tap
    // releases the button before the next frame runs, and an ARPG where a
    // single click does nothing is unusable.
    if ((p.leftDown || p.leftPressed) && ground) {
      const target = p.leftPressed
        ? this.scene.pickActor(p.ndcX, p.ndcY, world, player.actor.id)
        : null;
      if (target && !shift) player.requestAttack(target.id);
      else player.requestMove(ground.x, ground.z);
    }

    // --- right click: primary skill --------------------------------------
    if ((p.rightDown || p.rightPressed) && ground) {
      const skillId = player.progression.bar[0];
      if (skillId) player.requestSkill(skillId, ground.x, ground.z);
    }

    // --- number keys ------------------------------------------------------
    for (let i = 1; i <= 4; i++) {
      if (this.input.pressed(`skill${i}` as 'skill1')) this.useSkillSlot(i);
    }
    if (this.input.pressed('potion')) this.usePotion();
  }

  private handleMenuInput(): void {
    if (this.input.pressed('menu')) {
      this.hud.closeAllPanels();
      this.state = 'playing';
    }
  }

  /** Developer tools (§55). Only active while the overlay is visible. */
  private handleDebugKeys(): void {
    if (!this.hud.debugVisible || !this.zone || !this.player) return;
    const player = this.player;

    for (const code of this.input.rawPressed) {
      switch (code) {
        case 'F2': {
          const target = this.pointerWorld;
          const pool = ENEMIES.filter((e) => !e.isBoss && e.id !== 'sum_kindling');
          const pick = pool[Math.floor(Math.random() * pool.length)]!;
          this.zone.spawn(pick.id, target.x, target.z, { level: player.progression.level });
          this.hud.notify(`Spawned ${pick.name}`);
          break;
        }
        case 'F3': {
          const pool = ENEMIES.filter((e) => !e.isBoss && e.id !== 'sum_kindling');
          const pick = pool[Math.floor(Math.random() * pool.length)]!;
          this.zone.spawn(pick.id, this.pointerWorld.x, this.pointerWorld.z, {
            eliteCount: 2, level: player.progression.level,
          });
          this.hud.notify(`Spawned elite ${pick.name}`);
          break;
        }
        case 'F4': {
          const item = generateItem(this.world!.rng, {
            itemLevel: player.progression.level, rarityBonus: 6,
          });
          if (item) this.world!.dropItem(item, player.actor.x, player.actor.y);
          break;
        }
        case 'F5':
          player.grantXp(200);
          break;
        case 'F6':
          this.godMode = !this.godMode;
          this.hud.notify(`God mode ${this.godMode ? 'on' : 'off'}`);
          break;
        case 'F7':
          this.zone.clearEnemies();
          this.hud.notify('Cleared enemies');
          break;
        case 'F8':
          player.actor.x = this.pointerWorld.x;
          player.actor.y = this.pointerWorld.z;
          player.stop();
          break;
        case 'F9':
          this.zone.spawn('boss_ausric', this.pointerWorld.x, this.pointerWorld.z);
          break;
        case 'Backquote': {
          const order = ['grestwick', 'marches', 'ossuary'];
          const next = order[(order.indexOf(this.currentZoneId) + 1) % order.length]!;
          this.travelTo(next);
          break;
        }
      }
    }
  }

  // --- actions -----------------------------------------------------------

  private useSkillSlot(index: number): void {
    const player = this.player;
    if (!player || this.state !== 'playing') return;
    const skillId = player.progression.bar[index];
    if (!skillId) return;
    const aim = this.pointerWorld;
    if (!player.requestSkill(skillId, aim.x, aim.z)) this.audio.play('ui_error');
  }

  private usePotion(): void {
    if (!this.player) return;
    if (this.player.usePotion()) this.audio.play('potion');
    else this.audio.play('ui_error');
  }

  private useInteractable(i: Interactable): void {
    const player = this.player;
    if (!player) return;

    if (i.kind === 'vendor') {
      this.hud.renderVendor(player);
      this.hud.openPanel('vendor');
      this.audio.play('ui_click');
      return;
    }
    if (i.kind === 'smith') {
      // The smith refills draughts; a full repair economy is out of scope here.
      player.potion.count = player.potion.max;
      this.hud.notify('Hesper tops up your draughts.', 'good');
      this.audio.play('shrine');
      return;
    }
    if (i.kind === 'stash') {
      this.hud.notify(`Footlocker: ${this.stash.length} items stored.`, 'neutral');
      this.audio.play('ui_click');
      return;
    }

    const result = this.zones.use(i, player);
    if (i.kind === 'chest' && !i.used) this.audio.play('chest');
    if (i.kind === 'shrine') this.audio.play('shrine');
    if (result?.travelTo) {
      this.travelTo(result.travelTo, result.x, result.y);
    }
  }

  private equipItem(uid: number): void {
    if (!this.player) return;
    if (!this.player.equipFromInventory(uid)) this.audio.play('ui_error');
    this.refreshPanels();
  }

  private unequipItem(slot: Parameters<PlayerController['unequip']>[0]): void {
    if (!this.player) return;
    this.player.unequip(slot);
    this.audio.play('equip');
    this.refreshPanels();
  }

  private dropItem(uid: number): void {
    this.player?.dropFromInventory(uid);
    this.refreshPanels();
  }

  private sellItem(uid: number): void {
    if (!this.player) return;
    this.player.sellFromInventory(uid);
    this.audio.play('ui_click');
    this.hud.renderVendor(this.player);
  }

  private moveItem(uid: number, x: number, y: number): void {
    const player = this.player;
    if (!player) return;
    const item = player.inventory.getItem(uid);
    if (!item) return;

    const blocker = player.inventory.blockingItem(item, x, y, uid);
    if (blocker) {
      // Classic swap: lift both, place the dragged one, then re-home the other.
      const oldX = item.gridX;
      const oldY = item.gridY;
      player.inventory.remove(blocker.uid);
      if (player.inventory.place(item, x, y)) {
        if (!player.inventory.add(blocker)) {
          // Undo cleanly rather than leaving an item in limbo.
          player.inventory.remove(item.uid);
          if (oldX !== null && oldX !== undefined && oldY !== null && oldY !== undefined) {
            player.inventory.place(item, oldX, oldY);
          } else {
            player.inventory.add(item);
          }
          player.inventory.add(blocker);
          this.audio.play('ui_error');
        }
      } else {
        player.inventory.add(blocker);
        this.audio.play('ui_error');
      }
    } else if (!player.inventory.place(item, x, y)) {
      this.audio.play('ui_error');
    }
    this.hud.renderInventory(player);
  }

  private spendPoint(skillId: string): void {
    const player = this.player;
    if (!player) return;
    if (player.progression.spendPoint(skillId)) {
      this.audio.play('skill_learn');
      this.refreshPanels();
    } else {
      this.audio.play('ui_error');
    }
  }

  private bindSkill(skillId: string, slot: number): void {
    const player = this.player;
    if (!player) return;
    // Clear the skill from any other slot first, so it cannot occupy two.
    const existing = player.progression.bar.indexOf(skillId);
    if (existing >= 0) player.progression.bar[existing] = null;
    player.progression.bar[slot] = skillId;
    this.audio.play('ui_click');
    this.hud.renderSkills(player);
  }

  private refreshPanels(): void {
    const player = this.player;
    if (!player) return;
    if (this.hud.isPanelOpen('inventory')) this.hud.renderInventory(player);
    if (this.hud.isPanelOpen('character')) this.hud.renderCharacter(player);
    if (this.hud.isPanelOpen('skills')) this.hud.renderSkills(player);
    if (this.hud.isPanelOpen('vendor')) this.hud.renderVendor(player);
  }

  // --- rendering ---------------------------------------------------------

  private render(dt: number): void {
    const { world, player } = this;
    if (!world || !player) {
      this.scene.render();
      return;
    }

    this.scene.update(
      world, player, dt, this.clock.alpha,
      this.pointerWorld,
      this.hoveredInteractable && !this.hoveredInteractable.used
        ? { x: this.hoveredInteractable.x, y: this.hoveredInteractable.y }
        : null,
    );
    this.scene.render();

    this.hud.update(player, ZONES[this.currentZoneId]?.name ?? '');
    this.hud.minimap.reveal(player.actor.x, player.actor.y);
    this.hud.minimap.draw(
      player.actor, world.actors,
      this.zones.loaded?.interactables ?? [],
      world.items,
    );

    if (this.bossActor) this.hud.updateBoss(this.bossActor.healthFraction);

    if (this.hud.debugVisible) this.renderDebug(dt);
  }

  private renderDebug(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const stats = this.scene.stats;
    const player = this.player!;
    const zone = this.zone!;

    this.hud.setDebug([
      `fps ${(1 / Math.max(0.0001, avg)).toFixed(0)}   draws ${stats.calls}   tris ${(stats.triangles / 1000).toFixed(1)}k`,
      `particles ${stats.particles}   views ${stats.views}   actors ${this.world!.actors.length}`,
      `zone ${this.currentZoneId}   enemies ${zone.liveEnemies}   pending ${this.zones.pendingEncounters}`,
      `explored ${(this.hud.minimap.exploredFraction * 100).toFixed(0)}%   items ${this.world!.items.length}`,
      player.debugLine(),
      `pos ${player.actor.x.toFixed(1)},${player.actor.y.toFixed(1)}   god ${this.godMode ? 'ON' : 'off'}`,
      '',
      'F2 spawn  F3 elite  F4 item  F5 +xp  F6 god',
      'F7 kill all  F8 teleport  F9 boss  ` next zone',
    ].join('\n'));
  }

  private worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.scene.cameraRig.camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  private onResize = (): void => {
    this.scene.resize(window.innerWidth, window.innerHeight);
  };

  // --- test/automation hooks ---------------------------------------------

  /**
   * Exposed for the automated smoke test, which drives a real session in a
   * headless browser. Not used by the game itself.
   */
  get debugApi() {
    return {
      state: () => this.state,
      player: () => this.player,
      world: () => this.world,
      zone: () => this.zone,
      zoneId: () => this.currentZoneId,
      stats: () => this.stats,
      travelTo: (id: string) => this.travelTo(id),
      spawn: (defId: string, x: number, y: number, elite = 0) =>
        this.zone?.spawn(defId, x, y, { eliteCount: elite }),
      grantXp: (n: number) => this.player?.grantXp(n),
      giveItem: (rarityBonus = 8) => {
        const item = generateItem(this.world!.rng, {
          itemLevel: this.player!.progression.level, rarityBonus,
        });
        if (item) this.player!.inventory.add(item);
        return item;
      },
      equipAll: () => {
        const player = this.player!;
        for (const item of [...player.inventory.all]) player.equipFromInventory(item.uid);
      },
      setGod: (on: boolean) => { this.godMode = on; },
      save: () => this.saveGame(),
      load: () => this.loadGame(),
      hasSave: () => !!readSave(this.storage, SAVE_SLOT),
      itemBases: () => ITEM_BASES.size,
      archetypes: () => ARCHETYPES.all.map((a) => a.id),
      openPanel: (name: string) => {
        const player = this.player!;
        if (name === 'inventory') this.hud.renderInventory(player);
        if (name === 'character') this.hud.renderCharacter(player);
        if (name === 'skills') this.hud.renderSkills(player);
        this.hud.openPanel(name as 'inventory');
      },
      closePanels: () => this.hud.closeAllPanels(),
      toggleDebug: () => this.hud.setDebug(this.hud.debugVisible ? null : ''),
      setTorchShadows: (on: boolean) => this.scene.setTorchShadows(on),
      setBloom: (on: boolean) => this.scene.setBloom(on),
      setAmbientOcclusion: (on: boolean) => this.scene.setAmbientOcclusion(on),
    };
  }

  dispose(): void {
    this.running = false;
    for (const off of this.unsubscribes) off();
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.dispose();
    this.scene.dispose();
  }
}
