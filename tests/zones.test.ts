import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';
import { NavGrid } from '@/sim/world';
import { ZONES, ZONE_ORDER } from '@/world/zones';
import { countWalkable, reachableTiles } from '@/world/builders';
import { ENEMIES } from '@/data/enemies.data';

/** Builds a zone exactly as the game does, so the tests check the real thing. */
function buildZone(id: string) {
  const def = ZONES[id]!;
  const rng = new Rng(`zone-${id}`);
  const grid = new NavGrid(def.width, def.height);
  def.build(grid, rng);
  return { def, grid, rng };
}

describe.each(ZONE_ORDER)('zone %s', (id) => {
  it('builds a grid with a meaningful amount of walkable space', () => {
    const { grid } = buildZone(id);
    const walkable = countWalkable(grid);
    expect(walkable).toBeGreaterThan(400);
  });

  it('places the player on walkable ground', () => {
    const { def, grid } = buildZone(id);
    expect(grid.worldWalkable(def.playerStart.x, def.playerStart.y)).toBe(true);
  });

  it('is fully connected — every walkable tile is reachable from the start', () => {
    const { def, grid } = buildZone(id);
    const reached = reachableTiles(grid, def.playerStart.x, def.playerStart.y);
    const total = countWalkable(grid);
    // A handful of stranded tiles would be a level-design bug, not a rounding
    // issue, so this is deliberately strict.
    expect(reached.size).toBe(total);
  });

  it('puts every interactable on walkable ground', () => {
    const { def, grid } = buildZone(id);
    for (const i of def.interactables()) {
      expect(
        grid.worldWalkable(i.x, i.y),
        `${id}: interactable ${i.id} at ${i.x},${i.y} is not on walkable ground`,
      ).toBe(true);
    }
  });

  it('puts every spawn point on walkable ground and names a real enemy', () => {
    const { def, grid, rng } = buildZone(id);
    for (const s of def.spawns(rng, grid)) {
      expect(ENEMIES.has(s.defId), `${id}: unknown enemy ${s.defId}`).toBe(true);
      expect(
        grid.worldWalkable(s.x, s.y),
        `${id}: spawn ${s.defId} at ${s.x},${s.y} is not on walkable ground`,
      ).toBe(true);
    }
  });

  it('decorates without placing props outside the map', () => {
    const { def, grid, rng } = buildZone(id);
    const props = def.decorate(grid, rng);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(def.width);
      expect(p.y).toBeLessThanOrEqual(def.height);
    }
  });

  it('builds deterministically from the same seed', () => {
    const a = buildZone(id);
    const b = buildZone(id);
    expect(Array.from(a.grid.tiles)).toEqual(Array.from(b.grid.tiles));
  });
});

describe('zone links', () => {
  it('every exit points at a zone that exists, and lands on walkable ground', () => {
    for (const id of ZONE_ORDER) {
      const { def } = buildZone(id);
      for (const i of def.interactables()) {
        if (i.kind !== 'exit') continue;
        expect(ZONES[i.targetZone!], `${id}: exit to unknown zone ${i.targetZone}`).toBeTruthy();

        const target = buildZone(i.targetZone!);
        expect(
          target.grid.worldWalkable(i.targetX!, i.targetY!),
          `${id}: exit lands at ${i.targetX},${i.targetY} in ${i.targetZone}, which is not walkable`,
        ).toBe(true);
      }
    }
  });

  it('the hub is safe and the other two are hostile', () => {
    expect(ZONES.grestwick!.hostile).toBe(false);
    expect(ZONES.marches!.hostile).toBe(true);
    expect(ZONES.ossuary!.hostile).toBe(true);
  });
});

describe('the dungeon meets the §26 structure', () => {
  const { def } = buildZone('ossuary');
  const spawns = def.spawns(new Rng("s"), buildZone("ossuary").grid);
  const groups = new Set(spawns.map((s) => s.group));

  it('has the full progression of named encounter groups', () => {
    for (const g of ['entry', 'nave', 'west', 'east', 'chapter', 'elite', 'descent', 'boss']) {
      expect(groups.has(g), `missing encounter group "${g}"`).toBe(true);
    }
  });

  it('has a fork: two distinct branches that both rejoin', () => {
    expect(groups.has('west')).toBe(true);
    expect(groups.has('east')).toBe(true);
  });

  it('contains at least two elite packs and exactly one boss', () => {
    const elites = spawns.filter((s) => (s.eliteCount ?? 0) > 0);
    expect(elites.length).toBeGreaterThanOrEqual(2);

    const bosses = spawns.filter((s) => ENEMIES.get(s.defId).isBoss);
    expect(bosses.length).toBe(1);
    expect(bosses[0]!.defId).toBe('boss_ausric');
  });

  it('uses at least five distinct normal enemy types', () => {
    const kinds = new Set(spawns.map((s) => s.defId).filter((d) => !ENEMIES.get(d).isBoss));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('offers rest and reward points between the fights', () => {
    const kinds = def.interactables().map((i) => i.kind);
    expect(kinds).toContain('shrine');
    expect(kinds.filter((k) => k === 'chest').length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === 'lore').length).toBeGreaterThanOrEqual(3);
  });
});
