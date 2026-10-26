import { Config } from '../core/Config';

export const LOD_COUNT = Config.lod.distances.length;
/** Chunks farther than this (m) are not loaded at all. */
export const LOAD_DISTANCE = Config.lod.distances[LOD_COUNT - 1];

/**
 * Pick the LOD for a chunk at `dist` metres. Pass the chunk's current LOD (if loaded)
 * to get hysteresis, so chunks do not flip back and forth at a boundary.
 */
export function selectLod(dist: number, current?: number): number {
  const h = Config.lod.hysteresis;
  for (let i = 0; i < LOD_COUNT; i++) {
    let limit = Config.lod.distances[i];
    if (current !== undefined) {
      // Currently coarser than i -> must come closer before upgrading. Otherwise stay a bit longer.
      limit *= current > i ? 1 - h : 1 + h;
    }
    if (dist < limit) return i;
  }
  return LOD_COUNT - 1;
}
