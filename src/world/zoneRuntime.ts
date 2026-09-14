/**
 * Turns a `ZoneDef` into a live, running area.
 *
 * Owns the trigger-based spawning that paces the dungeon (§26): encounters are
 * declared with a `triggerRadius` and only materialise when the player gets
 * close, so the map is not thirty active AI agents from the moment it loads,
 * and so each fight starts as an event rather than as a distant blob.
 */

import { NavGrid, SimWorld } from '@/sim/world';
import { Zone } from '@/sim/zone';
import { PlayerController } from '@/sim/player';
import { Rng } from '@/core/rng';
import { dist2 } from '@/core/math';
import { generateItem } from '@/sim/loot';
import { ZONES } from './zones';
import type { Interactable, Prop, SpawnInstruction, ZoneDef } from './zoneDef';

export interface LoadedZone {
  readonly def: ZoneDef;
  readonly grid: NavGrid;
  readonly props: Prop[];
  readonly interactables: Interactable[];
  readonly pending: (SpawnInstruction & { fired: boolean })[];
}

export class ZoneRuntime {
  loaded: LoadedZone | null = null;
  zone: Zone | null = null;
  world: SimWorld | null = null;

  /** Interactable ids already consumed, kept across travel so chests stay open. */
  readonly consumed = new Set<string>();
  /** Zones the player has visited, for the save file and the map. */
  readonly visited = new Set<string>();
  /** Fired encounter groups, so backtracking does not respawn a cleared room. */
  readonly clearedGroups = new Set<string>();

  constructor(readonly seed: string) {}

  /**
   * Builds a zone and installs it. The player controller is rebound to the new
   * world, keeping its progression, bags and gear (§35 — travel is not a reset).
   */
  load(
    zoneId: string,
    makePlayer: (world: SimWorld) => PlayerController,
    arriveAt?: { x: number; y: number },
  ): { world: SimWorld; zone: Zone; loaded: LoadedZone } {
    const def = ZONES[zoneId];
    if (!def) throw new Error(`[zone] unknown zone "${zoneId}"`);

    const rng = new Rng(`${this.seed}:${zoneId}`);
    const grid = new NavGrid(def.width, def.height);
    def.build(grid, rng);
    const props = def.decorate(grid, rng);
    const interactables = def.interactables().map((i) => ({
      ...i, used: this.consumed.has(i.id),
    }));
    const pending = def.spawns(rng, grid).map((s) => ({
      ...s,
      // A group already cleared this session does not come back.
      fired: s.group ? this.clearedGroups.has(`${zoneId}:${s.group}`) : false,
    }));

    const world = new SimWorld(grid, `${this.seed}:${zoneId}`);
    const player = makePlayer(world);
    const start = arriveAt ?? def.playerStart;
    const spot = grid.nearestWalkable(start.x, start.y);
    player.actor.x = spot.x;
    player.actor.y = spot.y;
    player.actor.prevX = spot.x;
    player.actor.prevY = spot.y;
    player.stop();

    const zone = new Zone(world, player, world.rng);

    this.loaded = { def, grid, props, interactables, pending };
    this.zone = zone;
    this.world = world;
    this.visited.add(zoneId);

    // Spawns with no trigger radius are placed immediately (the boss room's
    // occupant, for instance, should already be standing there).
    for (const s of pending) {
      if (s.fired || s.triggerRadius) continue;
      this.fire(s);
    }

    world.events.emit('ZONE_ENTERED', { zoneId, name: def.name });
    return { world, zone, loaded: this.loaded };
  }

  private fire(s: SpawnInstruction & { fired: boolean }): void {
    if (!this.zone || !this.loaded) return;
    s.fired = true;
    this.zone.spawnGroup(
      [{ defId: s.defId, count: s.count ?? 1, eliteCount: s.eliteCount ?? 0 }],
      s.x, s.y, s.spread ?? 2.5,
    );
    if (s.group) this.clearedGroups.add(`${this.loaded.def.id}:${s.group}`);
  }

  /** Checks proximity triggers. Called once per simulation step. */
  update(): void {
    const zone = this.zone;
    const loaded = this.loaded;
    if (!zone || !loaded) return;

    const px = zone.player.actor.x;
    const py = zone.player.actor.y;
    for (const s of loaded.pending) {
      if (s.fired || !s.triggerRadius) continue;
      if (dist2(px, py, s.x, s.y) <= s.triggerRadius * s.triggerRadius) this.fire(s);
    }
  }

  /** The interactable the player is standing in range of, if any. */
  interactableAt(x: number, y: number): Interactable | null {
    if (!this.loaded) return null;
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const i of this.loaded.interactables) {
      const r = i.radius ?? 1.8;
      const d = dist2(x, y, i.x, i.y);
      if (d > r * r || d >= bestD) continue;
      bestD = d;
      best = i;
    }
    return best;
  }

  /**
   * Applies an interactable's effect. Returns a travel request when the
   * interactable is an exit, so the caller (the Game) performs the load.
   */
  use(i: Interactable, player: PlayerController): { travelTo?: string; x?: number; y?: number } | null {
    const world = this.world;
    if (!world) return null;

    switch (i.kind) {
      case 'exit':
        return { travelTo: i.targetZone, x: i.targetX, y: i.targetY };

      case 'chest': {
        if (i.used) {
          world.events.emit('NOTIFY', { text: 'Already emptied.', tone: 'neutral' });
          return null;
        }
        i.used = true;
        this.consumed.add(i.id);
        const rolls = i.lootRolls ?? 2;
        let dropped = 0;
        for (let n = 0; n < rolls; n++) {
          const item = generateItem(world.rng, {
            itemLevel: i.itemLevel ?? Math.max(1, player.progression.level),
            rarityBonus: i.lootRarityBonus ?? 0.5,
          });
          if (item) { world.dropItem(item, i.x, i.y); dropped++; }
        }
        player.gold += 15 + Math.round(world.rng.range(0, 25) * (i.lootRolls ?? 1));
        world.events.emit('NOTIFY', {
          text: dropped > 0 ? `${i.label}: ${dropped} items` : `${i.label}: empty`,
          tone: dropped > 0 ? 'good' : 'neutral',
        });
        return null;
      }

      case 'shrine': {
        if (i.used) {
          world.events.emit('NOTIFY', { text: 'It has gone out.', tone: 'neutral' });
          return null;
        }
        i.used = true;
        this.consumed.add(i.id);
        world.heal(player.actor, player.actor.maxHealth);
        player.actor.resource = player.actor.maxResource;
        player.potion.count = Math.min(player.potion.max, player.potion.count + 2);
        world.events.emit('NOTIFY', { text: 'You are whole again, for now.', tone: 'good' });
        return null;
      }

      case 'lore': {
        world.events.emit('NOTIFY', { text: i.text ?? i.label, tone: 'neutral' });
        this.consumed.add(i.id);
        return null;
      }

      case 'stash':
      case 'vendor':
      case 'smith':
        // These open UI panels; the Game layer handles them.
        return null;

      default:
        return null;
    }
  }

  /** Remaining un-fired encounters, shown by the debug overlay. */
  get pendingEncounters(): number {
    return this.loaded?.pending.filter((s) => !s.fired).length ?? 0;
  }
}
