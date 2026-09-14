/**
 * Central typed event bus (§38).
 *
 * Anything that wants to react to gameplay — UI, audio, VFX, achievements,
 * item "on kill" effects, future analytics or quests — subscribes here instead
 * of being called directly by the simulation. The simulation therefore never
 * imports the renderer, which is what keeps `src/sim/` headless-testable.
 */

import type { DamageResult } from '@/sim/damage';
import type { ItemInstance } from '@/sim/items';
import type { Actor } from '@/sim/entity';

export interface GameEvents {
  ENTITY_SPAWNED: { actor: Actor };
  ENTITY_DAMAGED: { actor: Actor; result: DamageResult; sourceId: number | null };
  ENTITY_HEALED: { actor: Actor; amount: number };
  ENTITY_DIED: { actor: Actor; killerId: number | null };
  ENTITY_STAGGERED: { actor: Actor; heavy: boolean };

  ITEM_DROPPED: { item: ItemInstance; x: number; y: number };
  ITEM_PICKED: { item: ItemInstance };
  ITEM_EQUIPPED: { item: ItemInstance; slot: string };
  ITEM_UNEQUIPPED: { item: ItemInstance; slot: string };
  ITEM_SOLD: { item: ItemInstance; value: number };

  LEVEL_UP: { level: number; skillPoints: number };
  XP_GAINED: { amount: number; total: number };

  SKILL_USED: { skillId: string; actorId: number };
  SKILL_LEARNED: { skillId: string; rank: number };
  RESOURCE_SPENT: { actorId: number; amount: number };

  BOSS_STARTED: { bossId: string; name: string };
  BOSS_PHASE: { bossId: string; phase: number };
  BOSS_DEFEATED: { bossId: string; name: string };

  ZONE_ENTERED: { zoneId: string; name: string };
  PLAYER_DIED: { level: number };
  GAME_SAVED: { slot: string };
  GAME_LOADED: { slot: string };

  /** Renderer-facing feedback hooks (§8). Purely presentational. */
  FX_HIT: { x: number; y: number; z: number; kind: string; amount: number; crit: boolean };
  FX_SCREENSHAKE: { intensity: number; duration: number };
  FX_HITSTOP: { duration: number };
  NOTIFY: { text: string; tone?: 'good' | 'bad' | 'neutral' };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<(p: never) => void>>();

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as (p: never) => void);
    return () => this.off(name, handler);
  }

  once<K extends EventName>(name: K, handler: Handler<K>): () => void {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends EventName>(name: K, handler: Handler<K>): void {
    this.handlers.get(name)?.delete(handler as (p: never) => void);
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    // Copy before iterating: handlers are allowed to unsubscribe themselves,
    // which item "on kill" effects legitimately do when they fire once.
    for (const handler of [...set]) {
      try {
        (handler as Handler<K>)(payload);
      } catch (err) {
        console.error(`[events] handler for ${String(name)} threw:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** The single bus the running game uses. Tests construct their own. */
export const bus = new EventBus();
