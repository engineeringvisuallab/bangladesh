import { mulberry32 } from '../world/Seed';

const GRAD_X = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GRAD_Y = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Seeded 2D gradient (Perlin) noise + fBm + ridged fBm. Pure maths, runs in workers and on the main thread. */
export class Noise2D {
  private perm = new Uint8Array(512);

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Single octave, roughly in [-1, 1]. */
  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const perm = this.perm;
    const aa = perm[perm[X] + Y] & 7;
    const ab = perm[perm[X] + Y + 1] & 7;
    const ba = perm[perm[X + 1] + Y] & 7;
    const bb = perm[perm[X + 1] + Y + 1] & 7;
    const n00 = GRAD_X[aa] * xf + GRAD_Y[aa] * yf;
    const n10 = GRAD_X[ba] * (xf - 1) + GRAD_Y[ba] * yf;
    const n01 = GRAD_X[ab] * xf + GRAD_Y[ab] * (yf - 1);
    const n11 = GRAD_X[bb] * (xf - 1) + GRAD_Y[bb] * (yf - 1);
    const x1 = n00 + u * (n10 - n00);
    const x2 = n01 + u * (n11 - n01);
    return (x1 + v * (x2 - x1)) * 1.45;
  }

  /** Fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let total = 0;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, y * freq) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / total;
  }

  /** Ridged multifractal: sharp ridges and valleys (mountain ranges). Returns [0, 1]. */
  ridged(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let prev = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(this.noise(x * freq, y * freq));
      n *= n;
      sum += n * amp * prev;
      total += amp;
      prev = Math.min(1, n * 1.6);
      amp *= 0.5;
      freq *= 2.05;
    }
    return Math.min(1, (sum / total) * 1.25);
  }
}
