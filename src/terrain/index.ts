import type { TerrainSample } from './Lakes';

/**
 * The part of EVCity's TerrainGenerator that vehicles and the orbit camera use. The real implementation for Bogura is
 * `world/GroundTerrain.ts` (backed by a Heightfield). Coordinates are WORLD coordinates (= scene coordinates while the origin is 0).
 */
export interface TerrainGenerator {
  heightAt(x: number, z: number): number;
  sample(x: number, z: number, out: TerrainSample): TerrainSample;
  makeSample(): TerrainSample;
  /** Road surface lookup: 0 = ground, 1 = asphalt, 2 = gravel. No roads yet -> always 0. */
  roads: { surfaceAt(x: number, z: number): 0 | 1 | 2 };
  /** Only EVCity has a railway network; Suprim's rail mode looks for it. Absent here. */
  rail?: unknown;
}

/** Only used as a type by EVCity's VehicleManager (not copied); kept so imports stay valid. */
export interface TerrainPhysics {
  hasColliderAt(x: number, z: number): boolean;
}
