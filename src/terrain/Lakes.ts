import { Config } from '../core/Config';
import { Seed, mulberry32 } from '../world/Seed';
import type { RiverNetwork } from './RiverNetwork';
import type { CitySite } from './TerrainGenerator';

/** Ground + water at one point. `water` is NaN when there is no water around. */
export interface TerrainSample {
  h: number;
  water: number;
  fx: number;
  fz: number;
}

interface Lake {
  x: number;
  z: number;
  R: number;
  level: number;
  depth: number;
  wobble: number;
  p1: number;
  p2: number;
  p3: number;
  reject2: number;
  isPond: boolean;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * Lakes (placed on flat plains, away from rivers and cities) and ponds (where a river ends).
 * A lake is a smooth bowl: inside the shoreline the ground is replaced by the bowl (water level L),
 * outside it blends back into the natural terrain. Because the bowl REPLACES the ground, water can
 * never hover on a slope.
 */
export class LakeSet {
  readonly lakes: Lake[] = [];

  constructor(
    seed: number,
    base: (x: number, z: number) => number,
    sites: CitySite[],
    rivers: RiverNetwork,
  ) {
    const rng = mulberry32(new Seed(seed).chunkSeed(11, 11));
    let tries = 0;
    let made = 0;
    while (made < Config.terrain.river.maxLakes && tries++ < 3000) {
      const x = (rng() * 2 - 1) * 4000;
      const z = -4000 + rng() * 5200;
      const R = 110 + rng() * 120;
      const h0 = base(x, z);
      if (h0 < 6 || h0 > 120) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.coreRadius + R * 1.6)) continue;
      if (this.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.R + R + 500)) continue;

      let ok = !rivers.isNearRiver(x, z);
      const ring: number[] = [];
      for (let k = 0; ok && k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (rivers.isNearRiver(x + Math.cos(a) * R * 1.5, z + Math.sin(a) * R * 1.5)) ok = false;
        ring.push(base(x + Math.cos(a) * R, z + Math.sin(a) * R));
      }
      if (!ok) continue;
      ring.sort((a, b) => a - b);
      if (ring[ring.length - 1] - ring[0] > 14) continue; // must be fairly flat
      const level = ring[6] - 0.4;
      if (level < 3) continue;
      this.lakes.push(this.make(x, z, R, level, 3 + R * 0.02, 0.3, rng, false));
      made++;
    }
    for (const p of rivers.ponds) this.lakes.push(this.make(p.x, p.z, 70, p.level, 2.5, 0.1, rng, true));
  }

  private make(
    x: number, z: number, R: number, level: number, depth: number, wobble: number, rng: () => number, isPond: boolean,
  ): Lake {
    const rmax = R * (1 + wobble);
    return {
      x, z, R, level, depth, wobble, isPond,
      p1: rng() * 6.28, p2: rng() * 6.28, p3: rng() * 6.28,
      reject2: (rmax * 1.45) ** 2,
    };
  }

  get count(): number {
    return this.lakes.filter((l) => !l.isPond).length;
  }
  get pondCount(): number {
    return this.lakes.filter((l) => l.isPond).length;
  }

  apply(x: number, z: number, out: TerrainSample): void {
    for (let n = 0; n < this.lakes.length; n++) {
      const L = this.lakes[n];
      const dx = x - L.x;
      const dz = z - L.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > L.reject2) continue;
      const d = Math.sqrt(d2);
      const th = Math.atan2(dz, dx);
      const Rt = L.R * (1 + L.wobble * (0.55 * Math.sin(2 * th + L.p1) + 0.3 * Math.sin(3 * th + L.p2) + 0.15 * Math.sin(5 * th + L.p3)));
      if (d >= 1.4 * Rt) continue;

      let prof: number;
      let s: number;
      if (d < Rt) {
        const q = d / Rt;
        prof = L.level - L.depth * (1 - q * q);
        s = 0;
      } else {
        prof = L.level + 0.35 * (d - Rt);
        s = smoothstep(Rt, 1.4 * Rt, d);
      }
      out.h = prof + (out.h - prof) * s;
      if (d < Rt * 1.08) {
        out.water = L.level;
        out.fx = 0;
        out.fz = 0;
      }
    }
  }
}
