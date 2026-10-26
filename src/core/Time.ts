/** Frame timing + smoothed FPS. */
export class Time {
  /** Seconds of the last rendered frame. */
  delta = 0;
  elapsed = 0;
  fps = 60;
  frameMs = 16.7;
  /** Total fixed physics steps executed. */
  fixedSteps = 0;

  advance(dt: number): void {
    this.delta = dt;
    this.elapsed += dt;
    this.frameMs = this.frameMs * 0.9 + dt * 1000 * 0.1;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
  }
}
