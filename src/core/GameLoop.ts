import { Config } from './Config';
import type { Time } from './Time';

/**
 * Fixed-timestep loop (60 Hz physics) + variable-rate rendering.
 * fixedUpdate may run 0..N times per rendered frame.
 */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private time: Time,
    private fixedUpdate: (dt: number) => void,
    private render: (dt: number, alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frame = Math.min((now - this.last) / 1000, Config.loop.maxFrameTime);
    this.last = now;
    this.time.advance(frame);

    const step = Config.loop.fixedStep;
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= step && steps < Config.loop.maxSubSteps) {
      this.fixedUpdate(step);
      this.time.fixedSteps++;
      this.accumulator -= step;
      steps++;
    }
    // Spiral-of-death protection: drop leftover time.
    if (steps === Config.loop.maxSubSteps) this.accumulator = 0;

    // alpha = how far we are between the last two physics steps (0..1), used to interpolate visuals.
    this.render(frame, this.accumulator / step);
  };
}
