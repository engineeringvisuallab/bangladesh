import { Config } from '../core/Config';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { TerrainSample } from '../terrain/Lakes';
import { Noise2D } from '../terrain/Noise';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import { hash2D, mulberry32 } from '../world/Seed';
import type { TreePlacer } from './TreePlacement';
import { placementContains } from '../buildings/Placements';
import { farmCovers } from '../farm/FarmFields';
import { ROCK_KIND_COUNT, RockKind, type TreeChunkData } from './TreeTypes';

const V = Config.vegetation;
const R = V.rocks;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * STAGE 7 (step 2): where do rocks lie?  Same idea as TreePlacer: a fixed global grid (`rocks.cellSize`), one random stream
 * per cell, so a rock is the same whatever chunk or LOD asks. More rocks in clumps (noise), on steep ground (outcrops) and
 * above the tree line; none in water, near roads, or in built-up city areas (green zones allowed, see TreePlacer.cityFactor).
 */
export class RockPlacer {
  private clump: Noise2D;
  private sample: TerrainSample;
  private sx: TerrainSample;
  private sz: TerrainSample;
  private mask = new Float32Array(2);

  constructor(private gen: TerrainGenerator, private trees: TreePlacer, private seed: number) {
    this.clump = new Noise2D((seed ^ 0x51a7c3e9) >>> 0);
    this.sample = gen.makeSample();
    this.sx = gen.makeSample();
    this.sz = gen.makeSample();
  }

  private nearRoad(x: number, z: number): boolean {
    if (this.gen.railForm.inCorridor(x, z, 2)) return true;
    if (this.gen.portForm.inFootprint(x, z, 2)) return true; // STAGE 14: sea port
    if (this.gen.airport.contains(x, z, 3)) return true; // airport pad
    if (this.gen.airportSea.contains(x, z, 3)) return true; // sea airport pad + causeway
    if (this.gen.army.contains(x, z, 3)) return true; // army camp
    if (this.gen.mall.contains(x, z, 3)) return true; // City Mall plot
    if (this.gen.evlab.contains(x, z, 3)) return true; // EVLab campus plot
    if (this.gen.library.contains(x, z, 3)) return true; // City Library plot
    if (this.gen.protoBuilding.contains(x, z, 3)) return true; // prototype building plot
    if (placementContains(x, z, 3)) return true; // placed buildings
    if (this.gen.agro.contains(x, z, 3)) return true; // Agro institute pad
    if (farmCovers(x, z, 2)) return true; // crop fields
    for (const s of this.gen.infra) if (s.contains(x, z, 5)) return true; // SWTP / STP plot
    const r = this.gen.roads;
    const m = this.mask;
    const c = R.roadClear;
    r.maskAt(x, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x + c, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x - c, z, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x, z + c, 1, m);
    if (m[1] > 0.01) return true;
    r.maskAt(x, z - c, 1, m);
    return m[1] > 0.01;
  }

  /** All rocks of chunk (cx, cz), chunk-local coordinates (TREE_STRIDE floats each, one array per RockKind). */
  place(cx: number, cz: number): TreeChunkData {
    const S = Config.world.chunkSize;
    const cell = R.cellSize;
    const perSide = Math.round(S / cell);
    const ox = chunkOriginX(cx);
    const oz = chunkOriginZ(cz);
    const gx0 = cx * perSide;
    const gz0 = cz * perSide;
    const lists: number[][] = [];
    for (let k = 0; k < ROCK_KIND_COUNT; k++) lists.push([]);
    const s = this.sample;

    for (let j = 0; j < perSide; j++) {
      for (let i = 0; i < perSide; i++) {
        const rng = mulberry32(hash2D(this.seed ^ 0x0cc5a, gx0 + i, gz0 + j));
        const roll = rng();
        const jx = rng();
        const jz = rng();
        const rScale = rng();
        const rYaw = rng();
        const rTint = rng();
        const rKind = rng();
        const x = ox + (i + jx) * cell;
        const z = oz + (j + jz) * cell;

        // clumps: rock fields with empty ground between them
        const clump = 0.25 + 1.0 * smooth(-0.15, 0.35, this.clump.fbm(x / 110, z / 110, 2));
        // most cells stop here without touching the terrain (even the steepest, rockiest cell has at most maxChance)
        if (roll >= R.maxChance * clump) continue;

        this.gen.sample(x, z, s);
        const h = s.h;
        if (h < R.minHeight) continue;
        if (!Number.isNaN(s.water) && h < s.water + R.waterMargin) continue;

        this.gen.sample(x + 1.5, z, this.sx);
        this.gen.sample(x, z + 1.5, this.sz);
        const slope = Math.hypot(this.sx.h - h, this.sz.h - h) / 1.5;
        let chance = R.baseChance + R.outcropChance * smooth(0.35, 0.8, slope) + R.alpineChance * smooth(240, 380, h);
        chance = Math.min(R.maxChance, chance) * clump * this.trees.cityFactor(x, z);
        if (roll >= chance) continue;
        if (this.nearRoad(x, z)) continue;

        const scale = 0.4 + 2.1 * Math.pow(rScale, 4); // many small stones, few boulders
        const kind = rKind < 0.3 ? RockKind.slab : RockKind.round;
        lists[kind].push(x - ox, h - 0.22 * scale, z - oz, scale, rYaw * Math.PI * 2, 0.75 + rTint * 0.35);
      }
    }
    return lists.map((l) => new Float32Array(l));
  }
}
