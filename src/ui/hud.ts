/**
 * HUD, panels and screens (§32, §33).
 *
 * All DOM, layered over the WebGL canvas. Text stays crisp at any resolution
 * and the layout work is done by the browser rather than by hand-rolled
 * world-space UI, which matters for a game whose tooltips carry this much
 * information.
 */

import { ARCHETYPES } from '@/data/archetypes.data';
import { SKILLS, skillsFor } from '@/data/skills.data';
import { ITEM_BASES } from '@/data/items.data';
import { RARITY, type EquipSlot, type ItemInstance } from '@/sim/items';
import { GRID_W, GRID_H } from '@/sim/inventory';
import { ATTRIBUTES, DAMAGE_TYPES, type StatKey } from '@/sim/stats';
import type { PlayerController } from '@/sim/player';
import { Tooltip, STAT_LABELS, formatStat, escapeHtml } from './tooltip';
import { Minimap } from './minimap';

const CELL = 38;

export type PanelName = 'inventory' | 'character' | 'skills' | 'menu' | 'vendor';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export interface HudCallbacks {
  onSkillSlot(index: number): void;
  onPotion(): void;
  onEquip(uid: number): void;
  onUnequip(slot: EquipSlot): void;
  onDropItem(uid: number): void;
  onSellItem(uid: number): void;
  onMoveItem(uid: number, x: number, y: number): void;
  onSpendPoint(skillId: string): void;
  onBindSkill(skillId: string, slot: number): void;
  onNewGame(archetype: string): void;
  onContinue(): void;
  onSave(): void;
  onLoad(): void;
  onRestart(): void;
  onResume(): void;
}

export class Hud {
  readonly root: HTMLDivElement;
  readonly tooltip: Tooltip;
  readonly minimap: Minimap;

  private healthFill!: HTMLDivElement;
  private healthGhost!: HTMLDivElement;
  private healthLabel!: HTMLDivElement;
  private resourceFill!: HTMLDivElement;
  private resourceLabel!: HTMLDivElement;
  private levelLabel!: HTMLDivElement;
  private xpFill!: HTMLDivElement;
  private skillSlots: HTMLDivElement[] = [];
  private potionCount!: HTMLDivElement;
  private dmgLayer!: HTMLDivElement;
  private notifyLayer!: HTMLDivElement;
  private bossBar!: HTMLDivElement;
  private bossName!: HTMLDivElement;
  private bossFill!: HTMLDivElement;
  private debugBox!: HTMLDivElement;
  private interactPrompt!: HTMLDivElement;
  private lowHealth!: HTMLDivElement;
  private wardPips!: HTMLDivElement;
  private minimapLabel!: HTMLDivElement;
  private panels = new Map<PanelName, HTMLDivElement>();
  private panelBodies = new Map<PanelName, HTMLDivElement>();
  private startScreen!: HTMLDivElement;
  private deathScreen!: HTMLDivElement;
  private victoryScreen!: HTMLDivElement;

  /** Settings surfaced in the menu (§33 — damage numbers are optional). */
  settings = { damageNumbers: true, screenShake: true, gore: true, bloom: true, torchShadows: false };

  private selectedArchetype = 'ironbound';
  /** Notified when a graphics option changes, so the renderer can react. */
  onSettingChanged: ((key: keyof Hud['settings'], value: boolean) => void) | null = null;

  /** The item currently being dragged, if any. Read by the drop handler. */
  dragging: { uid: number; el: HTMLElement } | null = null;

  constructor(private cb: HudCallbacks) {
    this.root = el('div');
    this.root.id = 'ui-root';
    document.body.appendChild(this.root);

    this.tooltip = new Tooltip(this.root);
    this.buildHud();
    this.buildPanels();
    this.buildScreens();

    const mm = el('div', 'minimap');
    this.minimap = new Minimap(mm, 180);
    this.minimapLabel = el('div', 'minimap-label', 'Unknown');
    mm.appendChild(this.minimapLabel);
    this.root.appendChild(mm);
  }

  // --- construction ------------------------------------------------------

  private buildHud(): void {
    const vignette = el('div', 'vignette');
    this.root.appendChild(vignette);
    this.lowHealth = el('div', 'low-health');
    this.root.appendChild(this.lowHealth);

    const bl = el('div', 'hud-bottom-left');
    this.levelLabel = el('div', 'hud-level', 'Level <strong>1</strong>');
    bl.appendChild(this.levelLabel);

    const healthBand = el('div', 'vital-band');
    this.healthGhost = el('div', 'vital-ghost');
    this.healthFill = el('div', 'vital-fill health');
    this.healthLabel = el('div', 'vital-label', '0 / 0');
    healthBand.append(this.healthGhost, this.healthFill, el('div', 'vital-notches'), this.healthLabel);
    bl.appendChild(healthBand);

    const resourceBand = el('div', 'vital-band resource');
    this.resourceFill = el('div', 'vital-fill resource');
    this.resourceLabel = el('div', 'vital-label', '0 / 0');
    resourceBand.append(this.resourceFill, el('div', 'vital-notches'), this.resourceLabel);
    bl.appendChild(resourceBand);
    this.root.appendChild(bl);

    // Action bar: RMB, then 1-4.
    const bar = el('div', 'action-bar');
    const keys = ['RMB', '1', '2', '3', '4'];
    for (let i = 0; i < 5; i++) {
      const slot = el('div', 'skill-slot empty');
      slot.appendChild(el('div', 'skill-key', keys[i]!));
      slot.appendChild(el('div', 'skill-glyph', '&mdash;'));
      const cd = el('div', 'skill-cd');
      cd.style.transform = 'scaleY(0)';
      slot.appendChild(cd);
      slot.appendChild(el('div', 'skill-cd-text', ''));
      slot.addEventListener('click', () => this.cb.onSkillSlot(i));
      this.skillSlots.push(slot);
      bar.appendChild(slot);
    }
    this.root.appendChild(bar);

    this.wardPips = el('div', 'ward-pips');
    for (let i = 0; i < 3; i++) this.wardPips.appendChild(el('div', 'ward-pip'));
    this.root.appendChild(this.wardPips);

    const potion = el('div', 'potion-slot');
    potion.appendChild(el('div', 'potion-key', 'Q'));
    this.potionCount = el('div', 'potion-count', '0');
    potion.appendChild(this.potionCount);
    potion.addEventListener('click', () => this.cb.onPotion());
    this.root.appendChild(potion);

    const xpRail = el('div', 'xp-rail');
    this.xpFill = el('div', 'xp-fill');
    xpRail.appendChild(this.xpFill);
    this.root.appendChild(xpRail);

    this.dmgLayer = el('div', 'dmg-layer');
    this.root.appendChild(this.dmgLayer);
    this.notifyLayer = el('div', 'notify-layer');
    this.root.appendChild(this.notifyLayer);

    this.bossBar = el('div', 'boss-bar');
    this.bossName = el('div', 'boss-name', '');
    const track = el('div', 'boss-track');
    this.bossFill = el('div', 'boss-fill');
    track.append(this.bossFill, el('div', 'boss-phases'));
    this.bossBar.append(this.bossName, track);
    this.root.appendChild(this.bossBar);

    this.interactPrompt = el('div', 'interact-prompt');
    this.root.appendChild(this.interactPrompt);

    this.debugBox = el('div', 'debug');
    this.root.appendChild(this.debugBox);
  }

  private makePanel(name: PanelName, title: string): HTMLDivElement {
    const panel = el('div', 'panel');
    panel.id = `panel-${name}`;
    const head = el('div', 'panel-head');
    head.appendChild(el('h3', undefined, title));
    const close = el('button', 'panel-close', '&times;');
    close.addEventListener('click', () => this.closePanel(name));
    head.appendChild(close);
    const body = el('div', 'panel-body');
    panel.append(head, body);
    this.root.appendChild(panel);
    this.panels.set(name, panel);
    this.panelBodies.set(name, body);
    return panel;
  }

  private buildPanels(): void {
    this.makePanel('inventory', 'Pack');
    this.makePanel('character', 'Character');
    this.makePanel('skills', 'Disciplines');
    this.makePanel('vendor', 'Trade');
    this.makePanel('menu', 'Paused');
  }

  private buildScreens(): void {
    // --- start ------------------------------------------------------------
    this.startScreen = el('div', 'screen open');
    const inner = el('div', 'screen-inner');
    inner.appendChild(el('h1', undefined, 'OSSUAN'));
    inner.appendChild(el('div', 'tagline', 'The Ninth Bell'));
    inner.appendChild(el('div', 'blurb',
      'The rite that carried memory out of the dead stopped working. '
      + 'It stayed in the bone instead, and curdled, and the bone turned to glass. '
      + 'People learned to burn that glass and breathe what came off it, and for a while '
      + 'they knew things they had no right to know.<br><br>'
      + 'Something has been answering.'));

    const row = el('div', 'archetype-row');
    for (const arch of ARCHETYPES.all) {
      const card = el('div', 'archetype-card');
      if (arch.id === this.selectedArchetype) card.classList.add('selected');
      card.dataset.archetype = arch.id;
      card.appendChild(el('h3', undefined, arch.name));
      card.appendChild(el('div', 'title', arch.title));
      card.appendChild(el('p', undefined, arch.blurb));
      card.appendChild(el('div', 'tags', `${arch.resource.name} &middot; ${skillsFor(arch.id).length} skills`));
      card.addEventListener('click', () => {
        this.selectedArchetype = arch.id;
        for (const c of row.children) c.classList.toggle('selected', (c as HTMLElement).dataset.archetype === arch.id);
      });
      row.appendChild(card);
    }
    inner.appendChild(row);

    const begin = el('button', 'btn wide', 'Walk out to the Marches');
    begin.addEventListener('click', () => this.cb.onNewGame(this.selectedArchetype));
    inner.appendChild(begin);

    const cont = el('button', 'btn wide', 'Continue');
    cont.style.marginTop = '8px';
    cont.id = 'btn-continue';
    cont.addEventListener('click', () => this.cb.onContinue());
    inner.appendChild(cont);

    // A first-time player has no way to discover that right click is their
    // primary skill, so the essentials go on the door rather than in a menu.
    const keys = el('div', 'start-keys');
    const essentials: [string, string][] = [
      ['Left click', 'move &middot; attack'],
      ['Right click', 'primary skill'],
      ['1 &ndash; 4', 'skills'],
      ['Q', 'draught'],
      ['F', 'interact'],
      ['I / C / K', 'pack &middot; character &middot; skills'],
      ['Shift', 'compare items'],
      ['Esc', 'menu'],
    ];
    for (const [key, what] of essentials) {
      const row = el('div', 'start-key');
      row.innerHTML = `<kbd>${key}</kbd><span>${what}</span>`;
      keys.appendChild(row);
    }
    inner.appendChild(keys);

    this.startScreen.appendChild(inner);
    this.root.appendChild(this.startScreen);

    // --- death ------------------------------------------------------------
    this.deathScreen = el('div', 'screen');
    const dInner = el('div', 'screen-inner');
    const dTitle = el('h1', 'dead', 'YOU ARE UNMADE');
    dInner.appendChild(dTitle);
    dInner.appendChild(el('div', 'tagline', 'Something will find the body'));
    dInner.appendChild(el('div', 'blurb',
      'You keep what you carried. The Marches do not keep anything.'));
    const respawn = el('button', 'btn wide', 'Wake in Grestwick');
    respawn.addEventListener('click', () => this.cb.onRestart());
    dInner.appendChild(respawn);
    this.deathScreen.appendChild(dInner);
    this.root.appendChild(this.deathScreen);

    // --- victory ----------------------------------------------------------
    this.victoryScreen = el('div', 'screen');
    const vInner = el('div', 'screen-inner');
    vInner.appendChild(el('h1', undefined, 'THE BELL IS QUIET'));
    vInner.appendChild(el('div', 'tagline', 'For now'));
    vInner.appendChild(el('div', 'blurb', ''));
    const vClose = el('button', 'btn wide', 'Go back down');
    vClose.addEventListener('click', () => {
      this.victoryScreen.classList.remove('open');
      this.setHudHidden(this.anyScreenOpen);
      this.cb.onResume();
    });
    vInner.appendChild(vClose);
    this.victoryScreen.appendChild(vInner);
    this.root.appendChild(this.victoryScreen);
  }

  // --- screens -----------------------------------------------------------

  /** Hides the in-world HUD while a full-screen menu is up. */
  private setHudHidden(hidden: boolean): void {
    this.root.classList.toggle('hud-hidden', hidden);
  }

  showStart(hasSave: boolean): void {
    this.setHudHidden(true);
    this.startScreen.classList.add('open');
    const cont = document.getElementById('btn-continue') as HTMLButtonElement | null;
    if (cont) cont.style.display = hasSave ? 'block' : 'none';
  }

  hideStart(): void {
    this.startScreen.classList.remove('open');
    this.setHudHidden(this.anyScreenOpen);
  }

  showDeath(): void {
    this.setHudHidden(true);
    this.deathScreen.classList.add('open');
  }

  hideDeath(): void {
    this.deathScreen.classList.remove('open');
    this.setHudHidden(this.anyScreenOpen);
  }

  showVictory(summary: string): void {
    const blurb = this.victoryScreen.querySelector('.blurb');
    if (blurb) blurb.innerHTML = summary;
    this.setHudHidden(true);
    this.victoryScreen.classList.add('open');
  }

  get anyScreenOpen(): boolean {
    return this.startScreen.classList.contains('open')
      || this.deathScreen.classList.contains('open')
      || this.victoryScreen.classList.contains('open');
  }

  // --- panels ------------------------------------------------------------

  isPanelOpen(name: PanelName): boolean {
    return this.panels.get(name)?.classList.contains('open') ?? false;
  }

  get anyPanelOpen(): boolean {
    return [...this.panels.values()].some((p) => p.classList.contains('open'));
  }

  openPanel(name: PanelName): void {
    this.panels.get(name)?.classList.add('open');
  }

  closePanel(name: PanelName): void {
    this.panels.get(name)?.classList.remove('open');
    this.tooltip.hide();
  }

  togglePanel(name: PanelName): boolean {
    const open = this.isPanelOpen(name);
    if (open) this.closePanel(name);
    else this.openPanel(name);
    return !open;
  }

  closeAllPanels(): void {
    for (const name of this.panels.keys()) this.closePanel(name);
  }

  // --- per-frame HUD -----------------------------------------------------

  update(player: PlayerController, zoneName: string): void {
    const actor = player.actor;
    const hp = actor.healthFraction;
    this.healthFill.style.transform = `scaleX(${hp})`;
    this.healthLabel.textContent = `${Math.max(0, Math.ceil(actor.health))} / ${actor.maxHealth}`;
    // The ghost bar lags behind, which is what makes a big hit legible.
    const ghost = parseFloat(this.healthGhost.dataset.value ?? '1');
    if (hp < ghost) {
      this.healthGhost.style.transform = `scaleX(${hp})`;
      this.healthGhost.dataset.value = String(hp);
    } else if (hp > ghost) {
      this.healthGhost.style.transform = `scaleX(${hp})`;
      this.healthGhost.dataset.value = String(hp);
    }
    this.lowHealth.classList.toggle('active', hp < 0.3 && actor.alive);

    const resourceName = ARCHETYPES.get(player.archetypeId).resource.name;
    this.resourceFill.style.transform = `scaleX(${actor.resourceFraction})`;
    this.resourceLabel.textContent = `${Math.floor(actor.resource)} ${resourceName}`;

    this.levelLabel.innerHTML = `Level <strong>${player.progression.level}</strong>`
      + (player.progression.skillPoints > 0
        ? ` <span style="color:var(--brass)">&bull; ${player.progression.skillPoints} point${player.progression.skillPoints > 1 ? 's' : ''}</span>`
        : '');
    this.xpFill.style.width = `${player.progression.xpFraction * 100}%`;
    this.potionCount.textContent = String(player.potion.count);
    this.minimapLabel.textContent = zoneName;

    // Ward charges only exist while a reliquary that grants them is worn.
    const wards = player.effects.has('fx_ward_charge') ? player.effects.wardCharges : -1;
    this.wardPips.classList.toggle('visible', wards >= 0);
    if (wards >= 0) {
      const pips = this.wardPips.children;
      for (let i = 0; i < pips.length; i++) {
        pips[i]!.classList.toggle('lit', i < wards);
      }
      this.wardPips.classList.toggle('full', wards >= pips.length);
    }

    // Action bar.
    for (let i = 0; i < this.skillSlots.length; i++) {
      const slot = this.skillSlots[i]!;
      const skillId = player.progression.bar[i];
      const glyph = slot.querySelector('.skill-glyph') as HTMLElement;
      const cd = slot.querySelector('.skill-cd') as HTMLElement;
      const cdText = slot.querySelector('.skill-cd-text') as HTMLElement;

      if (!skillId) {
        slot.classList.add('empty');
        glyph.innerHTML = '&mdash;';
        cd.style.transform = 'scaleY(0)';
        cdText.textContent = '';
        continue;
      }
      const def = SKILLS.find(skillId);
      const instance = player.progression.skills.get(skillId);
      if (!def || !instance) continue;

      slot.classList.remove('empty');
      glyph.textContent = def.icon;
      glyph.style.color = `#${def.colour.toString(16).padStart(6, '0')}`;
      slot.classList.toggle('unaffordable', actor.resource < instance.cost);

      const frac = instance.cooldownFraction;
      cd.style.transform = `scaleY(${frac})`;
      cdText.textContent = frac > 0 ? instance.cooldownRemaining.toFixed(1) : '';

      slot.onmouseenter = (e) => this.tooltip.showSkill(skillId, player, e.clientX, e.clientY);
      slot.onmouseleave = () => this.tooltip.hide();
    }
  }

  // --- feedback ----------------------------------------------------------

  damageNumber(screenX: number, screenY: number, amount: number, kind: 'normal' | 'crit' | 'player' | 'heal' | 'dot'): void {
    if (!this.settings.damageNumbers) return;
    // A hard cap: §33 is explicit that the screen must not fill with numbers.
    if (this.dmgLayer.childElementCount > 26) {
      this.dmgLayer.firstElementChild?.remove();
    }
    const node = el('div', `dmg ${kind === 'normal' ? '' : kind}`,
      kind === 'heal' ? `+${amount}` : String(amount));
    node.style.left = `${screenX}px`;
    node.style.top = `${screenY}px`;
    this.dmgLayer.appendChild(node);
    setTimeout(() => node.remove(), 950);
  }

  notify(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    if (this.notifyLayer.childElementCount > 5) this.notifyLayer.firstElementChild?.remove();
    const node = el('div', `notify ${tone}`, escapeHtml(text));
    this.notifyLayer.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  zoneCard(name: string, subtitle: string): void {
    const card = el('div', 'zone-card');
    card.appendChild(el('h2', undefined, escapeHtml(name)));
    card.appendChild(el('p', undefined, escapeHtml(subtitle)));
    this.root.appendChild(card);
    setTimeout(() => card.remove(), 5200);
  }

  showBoss(name: string): void {
    this.bossBar.classList.add('visible');
    this.bossName.textContent = name;
  }

  updateBoss(fraction: number): void {
    this.bossFill.style.transform = `scaleX(${Math.max(0, fraction)})`;
  }

  hideBoss(): void {
    this.bossBar.classList.remove('visible');
  }

  setInteractPrompt(label: string | null): void {
    if (!label) {
      this.interactPrompt.classList.remove('visible');
      return;
    }
    this.interactPrompt.innerHTML = `<kbd>F</kbd>${escapeHtml(label)}`;
    this.interactPrompt.classList.add('visible');
  }

  setDebug(text: string | null): void {
    if (text === null) {
      this.debugBox.classList.remove('visible');
      return;
    }
    this.debugBox.textContent = text;
    this.debugBox.classList.add('visible');
  }

  get debugVisible(): boolean {
    return this.debugBox.classList.contains('visible');
  }

  // --- inventory ---------------------------------------------------------

  renderInventory(player: PlayerController, vendorMode = false): void {
    const body = this.panelBodies.get(vendorMode ? 'vendor' : 'inventory');
    if (!body) return;
    body.innerHTML = '';

    if (vendorMode) {
      body.appendChild(el('div', 'inv-meta',
        `<span>Click an item to sell it.</span><span>${player.gold} marks</span>`));
    }

    const grid = el('div', 'inv-grid');
    grid.style.gridTemplateColumns = `repeat(${GRID_W}, ${CELL}px)`;
    grid.style.gridTemplateRows = `repeat(${GRID_H}, ${CELL}px)`;
    grid.style.width = `${GRID_W * (CELL + 2) + 6}px`;

    for (let i = 0; i < GRID_W * GRID_H; i++) grid.appendChild(el('div', 'inv-cell'));

    for (const item of player.inventory.all) {
      if (item.gridX === null || item.gridX === undefined) continue;
      const base = ITEM_BASES.find(item.baseId);
      if (!base) continue;
      const [w, h] = base.grid;
      const node = el('div', 'inv-item');
      node.dataset.rarity = item.rarity;
      node.dataset.uid = String(item.uid);
      node.style.left = `${3 + item.gridX * (CELL + 2)}px`;
      node.style.top = `${3 + (item.gridY ?? 0) * (CELL + 2)}px`;
      node.style.width = `${w * CELL + (w - 1) * 2}px`;
      node.style.height = `${h * CELL + (h - 1) * 2}px`;

      const glyph = el('div', 'glyph', escapeHtml(shortLabel(base.name)));
      glyph.style.color = `#${RARITY[item.rarity].colour.toString(16).padStart(6, '0')}`;
      node.appendChild(glyph);

      node.addEventListener('mouseenter', (e) => this.tooltip.showItem(item, player, e.clientX, e.clientY));
      node.addEventListener('mouseleave', () => this.tooltip.hide());
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        if (vendorMode) this.cb.onSellItem(item.uid);
        else if (e.ctrlKey || e.metaKey) this.cb.onDropItem(item.uid);
        else this.cb.onEquip(item.uid);
      });

      if (!vendorMode) this.makeDraggable(node, item, grid);
      grid.appendChild(node);
    }

    body.appendChild(grid);
    if (!vendorMode) {
      body.appendChild(el('div', 'inv-meta',
        `<span>Click to equip &middot; Ctrl+click to drop &middot; drag to move</span>`
        + `<span>${player.inventory.freeCells} cells free &middot; ${player.gold} marks</span>`));
    }
  }

  /** Grid drag-and-drop with swap (§15). */
  private makeDraggable(node: HTMLElement, item: ItemInstance, grid: HTMLElement): void {
    node.addEventListener('pointerdown', (down) => {
      if (down.button !== 0 || down.ctrlKey || down.metaKey) return;
      down.preventDefault();

      let moved = false;
      const startX = down.clientX;
      const startY = down.clientY;
      const gridRect = grid.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const grabX = down.clientX - nodeRect.left;
      const grabY = down.clientY - nodeRect.top;

      const onMove = (move: PointerEvent) => {
        if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < 5) return;
        if (!moved) {
          moved = true;
          node.classList.add('dragging');
          this.dragging = { uid: item.uid, el: node };
          this.tooltip.hide();
        }
        node.style.left = `${move.clientX - gridRect.left - grabX}px`;
        node.style.top = `${move.clientY - gridRect.top - grabY}px`;
      };

      const onUp = (up: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) return;
        node.classList.remove('dragging');
        this.dragging = null;
        const gx = Math.round((up.clientX - gridRect.left - grabX - 3) / (CELL + 2));
        const gy = Math.round((up.clientY - gridRect.top - grabY - 3) / (CELL + 2));
        this.cb.onMoveItem(item.uid, gx, gy);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // --- character sheet ---------------------------------------------------

  renderCharacter(player: PlayerController): void {
    const body = this.panelBodies.get('character');
    if (!body) return;
    body.innerHTML = '';
    const stats = player.actor.stats;

    // Equipment grid, laid out so the silhouette is readable.
    const equipGrid = el('div', 'equip-grid');
    const layout: (EquipSlot | null)[] = [
      'head', 'cloak', 'amulet',
      'shoulders', 'chest', 'hands',
      'belt', 'legs', 'feet',
      'mainHand', 'offHand', 'ring1',
      null, null, 'ring2',
    ];
    for (const slot of layout) {
      if (!slot) { equipGrid.appendChild(el('div')); continue; }
      const item = player.equipment.get(slot);
      const node = el('div', `equip-slot${item ? ' filled' : ''}`);
      node.textContent = item ? shortLabel(ITEM_BASES.find(item.baseId)?.name ?? '?') : slot;
      if (item) {
        node.dataset.rarity = item.rarity;
        node.addEventListener('mouseenter', (e) => this.tooltip.showItem(item, player, e.clientX, e.clientY));
        node.addEventListener('mouseleave', () => this.tooltip.hide());
        node.addEventListener('click', () => this.cb.onUnequip(slot));
      }
      equipGrid.appendChild(node);
    }
    body.appendChild(equipGrid);

    const group = (title: string, rows: [string, string][]) => {
      body.appendChild(el('div', 'stat-group-title', title));
      for (const [k, v] of rows) {
        body.appendChild(el('div', 'stat-row', `<span>${k}</span><span>${v}</span>`));
      }
    };

    group('Attributes', ATTRIBUTES.map((a) => [
      STAT_LABELS[a] ?? a, Math.round(stats.get(a)).toString(),
    ] as [string, string]));

    const weapon = player.weapon;
    group('Offence', [
      ['Weapon damage', `${weapon.min.toFixed(0)}–${weapon.max.toFixed(0)} ${weapon.type}`],
      ['Attack power', Math.round(stats.get('attackPower')).toString()],
      ['Spell power', Math.round(stats.get('spellPower')).toString()],
      ['Attack speed', `${stats.get('attackSpeed').toFixed(2)}x`],
      ['Critical chance', `${(stats.get('critChance') * 100).toFixed(1)}%`],
      ['Critical damage', `${(stats.get('critDamage') * 100).toFixed(0)}%`],
      ['Stagger power', Math.round(stats.get('staggerPower')).toString()],
    ]);

    group('Defence', [
      ['Health', `${Math.ceil(player.actor.health)} / ${player.actor.maxHealth}`],
      ['Armour', Math.round(stats.get('armour')).toString()],
      ['Damage taken', `${(stats.get('damageTaken') * 100).toFixed(0)}%`],
      ['Stagger resistance', Math.round(stats.get('staggerResist')).toString()],
      ['Movement speed', stats.get('moveSpeed').toFixed(2)],
    ]);

    group('Resistances', DAMAGE_TYPES.map((t) => [
      STAT_LABELS[`res_${t}` as StatKey] ?? t,
      `${(stats.get(`res_${t}` as StatKey) * 100).toFixed(0)}%`,
    ] as [string, string]));

    // Only show non-zero utility stats, so the sheet is not mostly zeroes.
    const utility: [string, string][] = [];
    for (const key of ['lifeOnHit', 'lifeOnKill', 'healthRegen', 'resourceRegen', 'areaSize'] as StatKey[]) {
      const v = stats.get(key);
      if (Math.abs(v) > 0.001) utility.push([STAT_LABELS[key] ?? key, formatStat(key, v)]);
    }
    if (utility.length > 0) group('Utility', utility);

    const effects = player.effects.activeDefs;
    if (effects.length > 0) {
      body.appendChild(el('div', 'stat-group-title', 'Reliquary effects'));
      for (const fx of effects) {
        const row = el('div', 'stat-row');
        row.style.display = 'block';
        row.innerHTML = `<span style="color:var(--rarity-reliquary)">${escapeHtml(fx.text)}</span>`;
        body.appendChild(row);
      }
    }
  }

  // --- skills ------------------------------------------------------------

  renderSkills(player: PlayerController): void {
    const body = this.panelBodies.get('skills');
    if (!body) return;
    body.innerHTML = '';

    const points = player.progression.skillPoints;
    body.appendChild(el('div', 'inv-meta',
      `<span>${ARCHETYPES.get(player.archetypeId).name} &middot; ${ARCHETYPES.get(player.archetypeId).title}</span>`
      + `<span>${points} point${points === 1 ? '' : 's'} unspent</span>`));

    const list = el('div', 'skill-list');
    for (const def of skillsFor(player.archetypeId)) {
      const rank = player.progression.ranks.get(def.id) ?? 0;
      const known = rank > 0;
      const available = def.requiredLevel <= player.progression.level;

      const row = el('div', `skill-row${known ? ' known' : ''}${available ? '' : ' locked'}`);
      const badge = el('div', 'skill-badge', def.icon);
      badge.style.color = `#${def.colour.toString(16).padStart(6, '0')}`;
      row.appendChild(badge);

      const info = el('div', 'skill-info');
      info.appendChild(el('h4', undefined, escapeHtml(def.name)));
      info.appendChild(el('p', undefined, escapeHtml(def.description)));
      const meta: string[] = [`lvl ${def.requiredLevel}`];
      if (def.resourceCost > 0) meta.push(`${def.resourceCost} cost`);
      if (def.cooldown > 0) meta.push(`${def.cooldown}s cd`);
      if (known) meta.push(`rank ${rank}/${def.maxRank}`);
      info.appendChild(el('div', 'skill-meta', meta.map((m) => `<span>${m}</span>`).join('')));

      if (known) {
        const binds = el('div', 'bind-row');
        const labels = ['R', '1', '2', '3', '4'];
        for (let i = 0; i < 5; i++) {
          const b = el('button', 'bind-btn', labels[i]!);
          if (player.progression.bar[i] === def.id) b.classList.add('active');
          b.addEventListener('click', () => this.cb.onBindSkill(def.id, i));
          binds.appendChild(b);
        }
        info.appendChild(binds);
      }
      row.appendChild(info);

      const actions = el('div', 'skill-actions');
      const btn = el('button', 'btn', known ? 'Improve' : 'Learn') as HTMLButtonElement;
      btn.disabled = !available || points <= 0 || (known && rank >= def.maxRank);
      btn.addEventListener('click', () => this.cb.onSpendPoint(def.id));
      actions.appendChild(btn);
      row.appendChild(actions);

      list.appendChild(row);
    }
    body.appendChild(list);
  }

  // --- menu --------------------------------------------------------------

  renderMenu(): void {
    const body = this.panelBodies.get('menu');
    if (!body) return;
    body.innerHTML = '';

    const buttons: [string, () => void][] = [
      ['Resume', () => this.cb.onResume()],
      ['Save', () => this.cb.onSave()],
      ['Load', () => this.cb.onLoad()],
    ];
    for (const [label, fn] of buttons) {
      const b = el('button', 'btn wide', label);
      b.style.marginBottom = '6px';
      b.addEventListener('click', fn);
      body.appendChild(b);
    }

    body.appendChild(el('div', 'stat-group-title', 'Options'));
    const toggles: [string, keyof typeof this.settings][] = [
      ['Damage numbers', 'damageNumbers'],
      ['Screen shake', 'screenShake'],
      ['Gore', 'gore'],
      ['Bloom', 'bloom'],
      ['Torch shadows (costly)', 'torchShadows'],
    ];
    for (const [label, key] of toggles) {
      const row = el('div', 'stat-row');
      const btn = el('button', 'btn', this.settings[key] ? 'On' : 'Off');
      btn.addEventListener('click', () => {
        this.settings[key] = !this.settings[key];
        btn.textContent = this.settings[key] ? 'On' : 'Off';
        this.onSettingChanged?.(key, this.settings[key]);
      });
      row.appendChild(el('span', undefined, label));
      row.appendChild(btn);
      body.appendChild(row);
    }

    body.appendChild(el('div', 'stat-group-title', 'Controls'));
    const controls = [
      'Left click &mdash; move, or attack a target',
      'Right click &mdash; primary skill',
      '1&ndash;4 &mdash; bound skills',
      'Q &mdash; healing draught',
      'F &mdash; interact',
      'I / C / K &mdash; pack, character, disciplines',
      'M / Tab &mdash; map zoom',
      'Shift &mdash; compare items',
      'Esc &mdash; this menu',
      'F1 &mdash; developer overlay',
    ];
    for (const line of controls) {
      const row = el('div', 'stat-row');
      row.style.fontSize = '11.5px';
      row.innerHTML = `<span style="color:var(--muted)">${line}</span>`;
      body.appendChild(row);
    }
  }

  renderVendor(player: PlayerController): void {
    this.renderInventory(player, true);
  }
}

/** Condenses an item name to something that fits a 38px grid cell. */
function shortLabel(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 7);
  return words.map((w) => w.slice(0, 5)).slice(0, 2).join('\n');
}
