/** A single artificial neuron (perceptron) that LEARNS to separate two groups of points. Pure TypeScript, deterministic. */
export interface Pt {
  x: number; // -1..1
  y: number;
  label: 1 | -1;
}

export class Perceptron {
  pts: Pt[] = [];
  w = [0.1, 0.1];
  b = 0;
  epoch = 0;
  updates = 0;
  private idx = 0;
  private seed: number;
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.reset(seed);
  }
  reset(seed: number): void {
    this.seed = seed >>> 0;
    // the hidden rule: points above a tilted line are class +1
    const a = (this.rnd() - 0.5) * 1.4;
    const c = (this.rnd() - 0.5) * 0.4;
    this.pts = [];
    while (this.pts.length < 36) {
      const x = this.rnd() * 2 - 1;
      const y = this.rnd() * 2 - 1;
      const s = y - (a * x + c);
      if (Math.abs(s) < 0.14) continue; // keep a gap so the groups can be separated
      this.pts.push({ x, y, label: s > 0 ? 1 : -1 });
    }
    this.w = [(this.rnd() - 0.5) * 0.4, (this.rnd() - 0.5) * 0.4];
    this.b = 0;
    this.epoch = 0;
    this.updates = 0;
    this.idx = 0;
  }
  predict(p: Pt): 1 | -1 {
    return this.w[0] * p.x + this.w[1] * p.y + this.b >= 0 ? 1 : -1;
  }
  get errors(): number {
    return this.pts.filter((p) => this.predict(p) !== p.label).length;
  }
  get accuracy(): number {
    return 1 - this.errors / this.pts.length;
  }
  /** Look at the next point; if it is wrong, nudge the weights towards the right answer. Returns the point just looked at and whether it was wrong. */
  step(): { p: Pt; wrong: boolean } {
    const p = this.pts[this.idx];
    const wrong = this.predict(p) !== p.label;
    if (wrong) {
      const lr = 0.25;
      this.w[0] += lr * p.label * p.x;
      this.w[1] += lr * p.label * p.y;
      this.b += lr * p.label;
      this.updates++;
    }
    this.idx++;
    if (this.idx >= this.pts.length) {
      this.idx = 0;
      this.epoch++;
    }
    return { p, wrong };
  }
}
