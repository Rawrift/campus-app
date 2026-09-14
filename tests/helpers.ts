import { NavGrid, SimWorld, Tile } from '@/sim/world';
import { PlayerController } from '@/sim/player';
import { Zone } from '@/sim/zone';
import { EventBus } from '@/core/events';
import { resetEntityIds } from '@/sim/entity';
import { resetUidCounter } from '@/sim/items';
import { clearDeferred } from '@/sim/effects';
import type { ArchetypeId } from '@/sim/ability';

export const DT = 1 / 60;

/** An open walled arena, which is all most simulation tests need. */
export function makeArena(size = 40): NavGrid {
  const grid = new NavGrid(size, size, Tile.Floor);
  for (let i = 0; i < size; i++) {
    grid.set(i, 0, Tile.Wall);
    grid.set(i, size - 1, Tile.Wall);
    grid.set(0, i, Tile.Wall);
    grid.set(size - 1, i, Tile.Wall);
  }
  return grid;
}

export interface TestRig {
  world: SimWorld;
  player: PlayerController;
  zone: Zone;
  events: EventBus;
  /** Advances the simulation by `seconds` of fixed steps. */
  run(seconds: number): void;
}

export function makeRig(archetype: ArchetypeId = 'ironbound', seed = 'test'): TestRig {
  resetEntityIds();
  resetUidCounter();
  clearDeferred();
  const events = new EventBus();
  const world = new SimWorld(makeArena(), seed, events);
  const player = new PlayerController(world, archetype, seed);
  player.actor.x = 20;
  player.actor.y = 20;
  const zone = new Zone(world, player);
  return {
    world, player, zone, events,
    run(seconds: number) {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) zone.update(DT);
    },
  };
}

/** Collects every event of a kind fired during a test. */
export function capture<K extends Parameters<EventBus['on']>[0]>(
  events: EventBus, name: K,
): unknown[] {
  const out: unknown[] = [];
  events.on(name, (p) => out.push(p));
  return out;
}
