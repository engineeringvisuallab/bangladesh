import { TerrainGenerator } from '../terrain/TerrainGenerator';

/**
 * Paints the map picture of the whole world (incl. the margin) once, off the main thread.
 * Land colours by height with sun shading, sea/lakes/rivers in blue. North is up (row 0 = -z).
 */
export interface MinimapRequest {
  seed: number;
  /** Pixels per side. */
  size: number;
  /** Map covers x,z in [-half, +half] metres. */
  half: number;
}
export interface MinimapResult {
  rgba: Uint8ClampedArray;
  size: number;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<MinimapRequest>) => {
  const { seed, size, half } = e.data;
  const gen = new TerrainGenerator(seed);
  const mpp = (2 * half) / size;
  const sc = gen.makeSample();
  const H = new Float32Array(size * size);
  const W = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const z = -half + (j + 0.5) * mpp;
    for (let i = 0; i < size; i++) {
      gen.sample(-half + (i + 0.5) * mpp, z, sc);
      H[j * size + i] = sc.h;
      W[j * size + i] = sc.water;
    }
  }

  const rgba = new Uint8ClampedArray(size * size * 4);
  // sun from the south-east, like the game's sun
  const lx = 0.55;
  const ly = 0.62;
  const lz = 0.45;
  const ll = Math.hypot(lx, ly, lz);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const h = H[k];
      const w = W[k];
      let r: number, g: number, b: number;
      if (!Number.isNaN(w) && w > h + 0.02) {
        const depth = Math.min(1, (w - h) / 45);
        r = 78 - 56 * depth;
        g = 158 - 92 * depth;
        b = 214 - 70 * depth;
      } else {
        if (h < 4) [r, g, b] = [220, 207, 152];
        else if (h < 60) [r, g, b] = [112 - h * 0.25, 164 - h * 0.2, 84];
        else if (h < 200) [r, g, b] = [100 + (h - 60) * 0.15, 150 - (h - 60) * 0.1, 80];
        else if (h < 330) [r, g, b] = [128 + (h - 200) * 0.1, 128 - (h - 200) * 0.05, 92 + (h - 200) * 0.2];
        else if (h < 420) [r, g, b] = [158, 150, 142];
        else [r, g, b] = [244, 245, 250];
        const hl = H[k - (i > 0 ? 1 : 0)];
        const hr = H[k + (i < size - 1 ? 1 : 0)];
        const hu = H[k - (j > 0 ? size : 0)];
        const hd = H[k + (j < size - 1 ? size : 0)];
        const nx = (hl - hr) / (2 * mpp);
        const nz = (hu - hd) / (2 * mpp);
        const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
        const lit = Math.max(0, (nx * inv * lx + inv * ly + nz * inv * lz) / ll);
        const shade = 0.5 + 0.75 * lit;
        r *= shade;
        g *= shade;
        b *= shade;
      }
      rgba[k * 4] = r;
      rgba[k * 4 + 1] = g;
      rgba[k * 4 + 2] = b;
      rgba[k * 4 + 3] = 255;
    }
  }

  // Rivers are thin (a few metres): stamp them at least 2 px wide so every stream stays visible.
  for (const s of gen.rivers.segments) {
    const steps = Math.max(2, Math.ceil(s.len / (mpp * 0.5)));
    for (let n = 0; n <= steps; n++) {
      const t = n / steps;
      const x = s.ax + (s.bx - s.ax) * t;
      const z = s.az + (s.bz - s.az) * t;
      const rad = Math.max(1.1, (s.hwA + (s.hwB - s.hwA) * t) / mpp);
      const ci = (x + half) / mpp;
      const cj = (z + half) / mpp;
      const r2 = Math.ceil(rad);
      for (let dj = -r2; dj <= r2; dj++) {
        for (let di = -r2; di <= r2; di++) {
          if (di * di + dj * dj > rad * rad) continue;
          const i = Math.floor(ci) + di;
          const j = Math.floor(cj) + dj;
          if (i < 0 || j < 0 || i >= size || j >= size) continue;
          const k = (j * size + i) * 4;
          rgba[k] = 60;
          rgba[k + 1] = 140;
          rgba[k + 2] = 205;
        }
      }
    }
  }

  // Roads (STAGE 6): dark outline first, then the coloured core on top, so junctions stay clean.
  // freeway = orange, primary = pale yellow, secondary = white, bridges = magenta.
  const stamp = (x: number, z: number, rad: number, cr: number, cg: number, cb: number): void => {
    const ci = (x + half) / mpp;
    const cj = (z + half) / mpp;
    const r2 = Math.ceil(rad);
    for (let dj = -r2; dj <= r2; dj++) {
      for (let di = -r2; di <= r2; di++) {
        if (di * di + dj * dj > rad * rad) continue;
        const i = Math.floor(ci) + di;
        const j = Math.floor(cj) + dj;
        if (i < 0 || j < 0 || i >= size || j >= size) continue;
        const k = (j * size + i) * 4;
        rgba[k] = cr;
        rgba[k + 1] = cg;
        rgba[k + 2] = cb;
      }
    }
  };
  for (const pass of [0, 1]) {
    // draw the small roads first so the big ones end up on top
    for (const tier of [3, 2, 1]) {
      const core = tier === 1 ? 1.8 : tier === 2 ? 1.45 : 1.15;
      for (const r of gen.roads.roads) {
        if (r.tier !== tier || r.earth) continue;
        const n = r.xs.length;
        for (let a = 0; a < n - 1; a++) {
          const len = Math.hypot(r.xs[a + 1] - r.xs[a], r.zs[a + 1] - r.zs[a]);
          const steps = Math.max(1, Math.ceil(len / (mpp * 0.5)));
          const onBridge = r.bridgeOf[a] >= 0;
          for (let q = 0; q <= steps; q++) {
            const t = q / steps;
            const x = r.xs[a] + (r.xs[a + 1] - r.xs[a]) * t;
            const z = r.zs[a] + (r.zs[a + 1] - r.zs[a]) * t;
            if (pass === 0) stamp(x, z, core + 0.85, 45, 32, 22);
            else if (onBridge) stamp(x, z, core, 235, 95, 205);
            else if (tier === 1) stamp(x, z, core, 255, 179, 71);
            else if (tier === 2) stamp(x, z, core, 255, 243, 196);
            else stamp(x, z, core, 255, 255, 255);
          }
        }
      }
    }
  }

  ctx.postMessage({ rgba, size } satisfies MinimapResult, [rgba.buffer]);
};
