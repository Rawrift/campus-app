/**
 * Input (§44).
 *
 * Collects raw browser events into a per-frame snapshot the game reads, rather
 * than letting handlers mutate game state directly. That keeps input ordering
 * deterministic relative to the fixed simulation step and makes rebinding a
 * matter of changing one table.
 */

export type Action =
  | 'move' | 'primary' | 'skill1' | 'skill2' | 'skill3' | 'skill4'
  | 'potion' | 'interact' | 'inventory' | 'character' | 'skills'
  | 'map' | 'menu' | 'debug' | 'stop' | 'forceMove';

/** Default bindings. §44's scheme, with the extras the debug tools need. */
export const DEFAULT_BINDINGS: Record<string, Action> = {
  Digit1: 'skill1', Digit2: 'skill2', Digit3: 'skill3', Digit4: 'skill4',
  KeyQ: 'potion',
  KeyF: 'interact',
  KeyI: 'inventory',
  KeyC: 'character',
  KeyK: 'skills', KeyS: 'skills',
  KeyM: 'map', Tab: 'map',
  Escape: 'menu',
  F1: 'debug',
  Space: 'stop',
  ShiftLeft: 'forceMove', ShiftRight: 'forceMove',
};

export interface PointerState {
  /** Normalised device coordinates, -1..1. */
  ndcX: number;
  ndcY: number;
  clientX: number;
  clientY: number;
  /** True while the button is held, for continuous move-to-cursor. */
  leftDown: boolean;
  rightDown: boolean;
  /** Set on the frame the button went down. */
  leftPressed: boolean;
  rightPressed: boolean;
  /** Accumulated wheel delta since the last frame. */
  wheel: number;
  /** True when the pointer is over UI rather than the world. */
  overUi: boolean;
}

export class Input {
  readonly pointer: PointerState = {
    ndcX: 0, ndcY: 0, clientX: 0, clientY: 0,
    leftDown: false, rightDown: false,
    leftPressed: false, rightPressed: false,
    wheel: 0, overUi: false,
  };

  private held = new Set<string>();
  private pressedThisFrame = new Set<Action>();
  private bindings = { ...DEFAULT_BINDINGS };
  /** Debug key presses, reported raw so the debug tools can own their keys. */
  private debugKeys: string[] = [];
  /** Set while any text input has focus, so typing does not drive the game. */
  private textFocus = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // The right mouse button is a game action, so suppress the browser menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.textFocus) return;
    // Tab would move focus out of the canvas; the game uses it for the map.
    if (e.code === 'Tab' || e.code === 'F1' || e.code === 'Space') e.preventDefault();

    if (!this.held.has(e.code)) {
      const action = this.bindings[e.code];
      if (action) this.pressedThisFrame.add(action);
      this.debugKeys.push(e.code);
    }
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  /** Releasing everything on blur prevents a key sticking after alt-tab. */
  private onBlur = (): void => {
    this.held.clear();
    this.pointer.leftDown = false;
    this.pointer.rightDown = false;
  };

  private updatePointerPosition(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;
    this.pointer.ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointer.overUi = (e.target as HTMLElement) !== this.canvas;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointerPosition(e);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.updatePointerPosition(e);
    if (e.button === 0) { this.pointer.leftDown = true; this.pointer.leftPressed = true; }
    if (e.button === 2) { this.pointer.rightDown = true; this.pointer.rightPressed = true; }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.pointer.leftDown = false;
    if (e.button === 2) this.pointer.rightDown = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.pointer.wheel += Math.sign(e.deltaY);
  };

  /** True on the frame the action was triggered. */
  pressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  /** True while the action's key is held. */
  down(action: Action): boolean {
    for (const [code, bound] of Object.entries(this.bindings)) {
      if (bound === action && this.held.has(code)) return true;
    }
    return false;
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Raw key codes pressed this frame, for the developer overlay. */
  get rawPressed(): readonly string[] {
    return this.debugKeys;
  }

  setTextFocus(focused: boolean): void {
    this.textFocus = focused;
    if (focused) this.held.clear();
  }

  rebind(code: string, action: Action): void {
    this.bindings[code] = action;
  }

  /** Clears per-frame state. Call at the very end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.debugKeys.length = 0;
    this.pointer.leftPressed = false;
    this.pointer.rightPressed = false;
    this.pointer.wheel = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPointerUp);
  }
}
