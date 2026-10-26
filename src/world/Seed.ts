/** Deterministic randomness. Same seed -> same world, everywhere (main thread and workers). */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fast 32-bit PRNG. Returns a function giving numbers in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of (seed, x, z) -> uint32. Used for per-chunk seeds. */
export function hash2D(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Seed {
  readonly value: number;

  constructor(input: number | string) {
    this.value = typeof input === 'string' ? hashString(input) : input >>> 0;
  }

  /** Global random stream. */
  rng(): () => number {
    return mulberry32(this.value);
  }

  /** Independent, reproducible random stream for one chunk. */
  chunkSeed(cx: number, cz: number): number {
    return hash2D(this.value, cx, cz);
  }

  chunkRng(cx: number, cz: number): () => number {
    return mulberry32(this.chunkSeed(cx, cz));
  }
}
