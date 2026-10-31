import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';

/**
 * Gives the copied EVCity vehicle code the terrain interface it expects, backed by one height function in scene coordinates.
 * No water yet. `roads.surfaceAt` (the RoadNetwork) says asphalt (1) or natural ground (0), and the vehicles' tyre grip follows.
 */
export class GroundTerrain implements TerrainGenerator {
  constructor(
    private readonly height: (x: number, z: number) => number,
    /** Anything with `surfaceAt` (the RoadNetwork). */
    readonly roads: { surfaceAt(x: number, z: number): 0 | 1 | 2 },
  ) {}

  heightAt(x: number, z: number): number {
    return this.height(x, z);
  }

  sample(x: number, z: number, out: TerrainSample): TerrainSample {
    out.h = this.height(x, z);
    out.water = Number.NaN;
    out.fx = 0;
    out.fz = 0;
    return out;
  }

  makeSample(): TerrainSample {
    return { h: 0, water: Number.NaN, fx: 0, fz: 0 };
  }
}
