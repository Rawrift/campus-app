/**
 * Minimap (§34).
 *
 * Fog of war is per-tile and revealed by proximity, so the map fills in as the
 * player explores rather than handing them the layout on arrival — the brief is
 * explicit that the map must not be revealed from the start.
 */

import { Tile, type NavGrid } from '@/sim/world';
import type { Actor } from '@/sim/entity';
import type { Interactable } from '@/world/zoneDef';

const COLOURS = {
  floor: '#3a352d',
  path: '#4a4235',
  mire: '#2e3830',
  wall: '#191714',
  unseen: '#07070a',
  player: '#e8dcc4',
  enemy: '#8c2f24',
  elite: '#c8a349',
  boss: '#c96a38',
  item: '#6f93c4',
  exit: '#8fae7c',
  chest: '#c8a349',
  shrine: '#9fc4d8',
} as const;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** One byte per tile: 0 unseen, 1 seen. */
  private explored: Uint8Array | null = null;
  private grid: NavGrid | null = null;
  private baseLayer: HTMLCanvasElement | null = null;
  /** World units visible across the minimap. */
  zoom = 34;

  constructor(container: HTMLElement, size = 180) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
  }

  setZone(grid: NavGrid): void {
    this.grid = grid;
    this.explored = new Uint8Array(grid.width * grid.height);

    // Pre-render the terrain once into an offscreen canvas; per-frame we only
    // composite it through the fog mask, which is far cheaper than redrawing
    // thousands of tiles every frame.
    const base = document.createElement('canvas');
    base.width = grid.width;
    base.height = grid.height;
    const bctx = base.getContext('2d')!;
    const img = bctx.createImageData(grid.width, grid.height);
    for (let i = 0; i < grid.tiles.length; i++) {
      const tile = grid.tiles[i] as Tile;
      const hex = tile === Tile.Path ? COLOURS.path
        : tile === Tile.Mire ? COLOURS.mire
        : tile === Tile.Floor ? COLOURS.floor
        : (tile === Tile.Wall || tile === Tile.Prop) ? COLOURS.wall
        : COLOURS.unseen;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    this.baseLayer = base;
  }

  /** Marks tiles around the player as explored. */
  reveal(x: number, y: number, radius = 11): void {
    if (!this.grid || !this.explored) return;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const r2 = radius * radius;
    for (let ty = cy - radius; ty <= cy + radius; ty++) {
      if (ty < 0 || ty >= this.grid.height) continue;
      for (let tx = cx - radius; tx <= cx + radius; tx++) {
        if (tx < 0 || tx >= this.grid.width) continue;
        if ((tx - cx) ** 2 + (ty - cy) ** 2 > r2) continue;
        this.explored[ty * this.grid.width + tx] = 1;
      }
    }
  }

  get exploredFraction(): number {
    if (!this.explored || !this.grid) return 0;
    let seen = 0;
    let total = 0;
    for (let i = 0; i < this.explored.length; i++) {
      const tile = this.grid.tiles[i] as Tile;
      if (tile !== Tile.Floor && tile !== Tile.Path && tile !== Tile.Mire) continue;
      total++;
      if (this.explored[i]) seen++;
    }
    return total > 0 ? seen / total : 0;
  }

  draw(
    player: Actor, actors: readonly Actor[],
    interactables: readonly Interactable[],
    items: readonly { x: number; y: number }[],
  ): void {
    const { ctx, canvas, grid, explored, baseLayer } = this;
    if (!grid || !explored || !baseLayer) return;

    const size = canvas.width;
    ctx.fillStyle = COLOURS.unseen;
    ctx.fillRect(0, 0, size, size);

    const scale = size / this.zoom;
    const originX = player.x - this.zoom / 2;
    const originY = player.y - this.zoom / 2;
    const toScreen = (wx: number, wy: number): [number, number] =>
      [(wx - originX) * scale, (wy - originY) * scale];

    // Terrain, drawn through the explored mask.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      baseLayer,
      originX, originY, this.zoom, this.zoom,
      0, 0, size, size,
    );
    // Punch unexplored tiles back to black.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLOURS.unseen;
    const x0 = Math.max(0, Math.floor(originX));
    const y0 = Math.max(0, Math.floor(originY));
    const x1 = Math.min(grid.width, Math.ceil(originX + this.zoom));
    const y1 = Math.min(grid.height, Math.ceil(originY + this.zoom));
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        if (explored[ty * grid.width + tx]) continue;
        const [sx, sy] = toScreen(tx, ty);
        ctx.fillRect(sx, sy, scale + 1, scale + 1);
      }
    }
    ctx.restore();

    const dot = (wx: number, wy: number, colour: string, r: number) => {
      if (!explored[Math.floor(wy) * grid.width + Math.floor(wx)]) return;
      const [sx, sy] = toScreen(wx, wy);
      if (sx < -4 || sy < -4 || sx > size + 4 || sy > size + 4) return;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const i of interactables) {
      const colour = i.kind === 'exit' ? COLOURS.exit
        : i.kind === 'chest' ? COLOURS.chest
        : i.kind === 'shrine' ? COLOURS.shrine : null;
      if (!colour || i.used) continue;
      dot(i.x, i.y, colour, i.kind === 'exit' ? 3.5 : 2.5);
    }
    for (const item of items) dot(item.x, item.y, COLOURS.item, 1.8);

    for (const actor of actors) {
      if (!actor.alive || actor.faction !== 'hostile') continue;
      const colour = actor.isBoss ? COLOURS.boss
        : actor.eliteAffixes.length > 0 ? COLOURS.elite : COLOURS.enemy;
      dot(actor.x, actor.y, colour, actor.isBoss ? 4 : actor.eliteAffixes.length > 0 ? 3 : 2);
    }

    // The player: an arrow, so facing is readable at a glance.
    const [px, py] = toScreen(player.x, player.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.facing + Math.PI / 2);
    ctx.fillStyle = COLOURS.player;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.6, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3.6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Serialised fog state, so exploration survives a save (§35). */
  serialise(): number[] {
    return this.explored ? Array.from(this.explored) : [];
  }

  restore(data: number[]): void {
    if (!this.explored || data.length !== this.explored.length) return;
    this.explored.set(data);
  }
}
