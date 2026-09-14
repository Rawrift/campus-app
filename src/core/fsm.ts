/**
 * Minimal finite state machine used by the player controller and enemy AI (§21).
 *
 * Chosen over a behaviour tree because ARPG enemies have few, clearly named
 * states and the debug overlay can then print the state name directly, which
 * matters more during tuning than the extra expressiveness of a tree.
 */

export interface State<C> {
  readonly name: string;
  enter?(ctx: C): void;
  update?(ctx: C, dt: number): string | void;
  exit?(ctx: C): void;
}

export class StateMachine<C> {
  private states = new Map<string, State<C>>();
  private current: State<C> | null = null;
  /** Seconds spent in the current state — AI uses it for timeouts. */
  timeInState = 0;

  constructor(private ctx: C) {}

  add(state: State<C>): this {
    this.states.set(state.name, state);
    return this;
  }

  get currentName(): string {
    return this.current?.name ?? 'none';
  }

  is(...names: string[]): boolean {
    return this.current !== null && names.includes(this.current.name);
  }

  transition(name: string): void {
    if (this.current?.name === name) return;
    const next = this.states.get(name);
    if (!next) {
      console.warn(`[fsm] unknown state "${name}"`);
      return;
    }
    this.current?.exit?.(this.ctx);
    this.current = next;
    this.timeInState = 0;
    next.enter?.(this.ctx);
  }

  update(dt: number): void {
    if (!this.current) return;
    this.timeInState += dt;
    const next = this.current.update?.(this.ctx, dt);
    if (typeof next === 'string') this.transition(next);
  }
}
