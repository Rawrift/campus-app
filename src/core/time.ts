/**
 * Fixed-timestep clock.
 *
 * The simulation runs at a fixed 60 Hz regardless of display refresh so that
 * combat timings (anticipation / impact / recovery windows, §8) and AI decisions
 * are frame-rate independent and reproducible in tests. The renderer
 * interpolates between the last two sim states for smooth motion on any display.
 */

export const FIXED_DT = 1 / 60;
/** Never simulate more than this much wall time in one frame (spiral-of-death guard). */
const MAX_FRAME_TIME = 0.25;

export class Clock {
  private accumulator = 0;
  private last = 0;
  private started = false;

  /** Wall-clock seconds since the clock started, ignoring hit-stop. */
  elapsed = 0;
  /** Simulation seconds elapsed — excludes time frozen by hit-stop. */
  simTime = 0;
  /** Interpolation factor in [0,1) between the previous and current sim step. */
  alpha = 0;

  /**
   * Global hit-stop timer (§8). While positive, the simulation is frozen but
   * the renderer keeps drawing, which is what makes an impact read as a hit
   * rather than as a dropped frame.
   */
  private hitStop = 0;
  /** Slow-motion multiplier, used briefly on the boss kill. */
  timeScale = 1;

  reset(now: number): void {
    this.last = now;
    this.accumulator = 0;
    this.started = true;
  }

  requestHitStop(duration: number): void {
    // Overlapping impacts extend rather than stack, so a big cleave does not
    // freeze the game for a quarter of a second.
    this.hitStop = Math.max(this.hitStop, Math.min(duration, 0.12));
  }

  get frozen(): boolean {
    return this.hitStop > 0;
  }

  /**
   * Advances the clock and returns how many fixed steps the caller must run.
   * @param now milliseconds, as supplied by requestAnimationFrame.
   */
  tick(now: number): number {
    if (!this.started) {
      this.reset(now);
      return 0;
    }
    let frameTime = (now - this.last) / 1000;
    this.last = now;
    if (!Number.isFinite(frameTime) || frameTime < 0) frameTime = 0;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
    this.elapsed += frameTime;

    if (this.hitStop > 0) {
      this.hitStop -= frameTime;
      this.alpha = 1;
      return 0;
    }

    this.accumulator += frameTime * this.timeScale;
    let steps = 0;
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.simTime += FIXED_DT;
      steps++;
      // Hard cap: if we are this far behind, drop the backlog instead of
      // stalling the tab trying to catch up.
      if (steps >= 8) {
        this.accumulator = 0;
        break;
      }
    }
    this.alpha = this.accumulator / FIXED_DT;
    return steps;
  }
}

/** A one-shot countdown used pervasively for cooldowns and attack phases. */
export class Timer {
  remaining = 0;

  start(duration: number): void {
    this.remaining = duration;
  }

  /** Returns true on the tick the timer completes. */
  tick(dt: number): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      return true;
    }
    return false;
  }

  get active(): boolean {
    return this.remaining > 0;
  }

  cancel(): void {
    this.remaining = 0;
  }
}
