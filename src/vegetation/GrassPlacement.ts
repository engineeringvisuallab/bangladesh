import { Config } from '../core/Config';
import type { CityPlan } from '../city/CityPlan';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { TerrainSample } from '../terrain/Lakes';
import { Noise2D } from '../terrain/Noise';
import { hash2D, mulberry32 } from '../world/Seed';
import type { TreePlacer } from './TreePlacement';
import { placementContains } from '../buildings/Placements';
import { farmCovers } from '../farm/FarmFields';


const V = Config.vegetation;
const G = V.grass;
const HALF = Config.world.size / 2;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * STAGE 7 (step 2): grass tufts of ONE tile (`grass.tile` metres square, world grid). Same method as the trees: a fixed
 * global grid of small cells (`grass.cell`), one random stream per cell, so a tuft is always at the same place whichever
 * tile asks. Meadows (noise) with bare patches, thinner inside forests; none on water, beach, roads, steep ground or
 * high up; half as many inside planned city areas.
 */
export class GrassPlacer {
  private meadow: Noise2D;
  private sample: TerrainSample;
  private sx: TerrainSample;
  private sz: TerrainSample;
  private mask = new Float32Array(2);

  constructor(private gen: TerrainGenerator, private plan: CityPlan, private seed: number, private trees: TreePlacer) {
    this.meadow = new Noise2D((seed ^ 0x3b9d27a1) >>> 0);
    this.sample = gen.makeSample();
    this.sx = gen.makeSample();
    this.sz = gen.makeSample();
  }

  /** 1 outside cities, `cityChance` inside a planned city, blending back over `cityFadeOut` metres outside it. */
  private cityFactor(x: number, z: number): number {
    const sites = this.gen.sites;
    for (let i = 0; i < sites.length; i++) {
      const d = Math.hypot(x - sites[i].x, z - sites[i].z);
      const R = this.plan.maxRadius(i);
      if (d >= R + V.cityFadeOut) continue;
      if (d < R) return G.cityChance;
      return G.cityChance + (1 - G.cityChance) * smooth(R, R + V.cityFadeOut, d);
    }
    return 1;
  }

  /** Tufts of tile (tx, tz), tile-local coordinates, GRASS_STRIDE floats each. */
  place(tx: number, tz: number, stride = 1): Float32Array {
    const per = Math.round(G.tile / G.cell);
    const ox = tx * G.tile - HALF;
    const oz = tz * G.tile - HALF;
    const gx0 = tx * per;
    const gz0 = tz * per;
    const out: number[] = [];
    const s = this.sample;
    const m = this.mask;

    // stride > 1 (far LOD rings): only every stride-th cell of the global cell grid, so these tufts are exactly a subset of the full tile
    for (let j = 0; j < per; j += stride) {
      for (let i = 0; i < per; i += stride) {
        const rng = mulberry32(hash2D(this.seed ^ 0x6a55c, gx0 + i, gz0 + j));
        const roll = rng();
        const jx = rng();
        const jz = rng();
        const rScale = rng();
        const rYaw = rng();
        const rTint = rng();
        const rDry = rng();
        const x = ox + (i + jx) * G.cell;
        const z = oz + (j + jz) * G.cell;

        // 1. chance from noise only (most cells stop here)
        const patch = smooth(-0.35, 0.25, this.meadow.fbm(x / 45, z / 45, 2));
        let chance = G.minChance + (G.maxChance - G.minChance) * patch;
        chance *= 1 - G.forestThin * this.trees.forestAt(x, z);
        if (roll >= chance) continue;

        // 2. terrain tests
        this.gen.sample(x, z, s);
        const h = s.h;
        if (!Number.isNaN(s.water) && h < s.water + 0.3) continue;
        chance *= smooth(3.5, 8, h) * (1 - smooth(G.heightFadeStart, G.heightFadeEnd, h));
        if (roll >= chance) continue;
        this.gen.sample(x + 1, z, this.sx);
        this.gen.sample(x, z + 1, this.sz);
        const slope = Math.hypot(this.sx.h - h, this.sz.h - h);
        if (slope >= G.maxSlope) continue;
        chance *= 1 - smooth(G.slopeFadeFrom, G.maxSlope, slope);
        chance *= this.cityFactor(x, z);
        if (roll >= chance) continue;
        this.gen.roads.maskAt(x, z, 1, m);
        if (m[1] > 0.01) continue;
        if (this.gen.railForm.inCorridor(x, z, 0)) continue;
        if (this.gen.portForm.inFootprint(x, z, 0)) continue; // STAGE 14: sea port
        if (this.gen.airport.contains(x, z, 1)) continue; // airport pad
        if (this.gen.airportSea.contains(x, z, 1)) continue; // sea airport pad + causeway
        if (this.gen.army.contains(x, z, 1)) continue; // army camp
        if (this.gen.mall.contains(x, z, 1)) continue; // City Mall plot
        if (this.gen.evlab.contains(x, z, 1)) continue; // EVLab campus plot
        if (this.gen.library.contains(x, z, 1)) continue; // City Library plot
        if (this.gen.protoBuilding.contains(x, z, 1)) continue; // prototype building plot
        if (placementContains(x, z, 1)) continue; // placed buildings
        if (this.gen.agro.contains(x, z, 1)) continue; // Agro institute pad
        if (farmCovers(x, z, 0.5)) continue; // crop fields
        if (this.gen.infra.some((s) => s.contains(x, z, 1))) continue; // SWTP / STP plot

        const dry = Math.min(1, Math.max(0, smooth(G.dryFrom, G.dryTo, h) + (rDry - 0.5) * 0.2));
        out.push(x - ox, h - 0.03, z - oz, 0.55 + 0.95 * rScale ** 1.5, rYaw * Math.PI * 2, 0.85 + rTint * 0.3, dry);
      }
    }
    return new Float32Array(out);
  }
}

