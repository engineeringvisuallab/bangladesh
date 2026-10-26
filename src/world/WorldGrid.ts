import { Config } from '../core/Config';

/**
 * World <-> chunk grid maths.
 * World space: x,z in [-size/2, +size/2] metres, (0,0) is the map centre, y is up.
 * North = -z, South = +z, East = +x.
 * Chunk (0,0) is the north-west corner; chunk (cx,cz) covers
 *   x in [cx*S - half, (cx+1)*S - half], z likewise.
 * 10000 / 500 = exactly 20 chunks per side. Extra `chunkMargin` rings (negative / >= 20 indices)
 * are rendered outside the playable area.
 */
const S = Config.world.chunkSize;
const HALF = Config.world.size / 2;
const M = Config.world.chunkMargin;

export const CHUNKS_PER_SIDE = Math.round(Config.world.size / S);
export const WORLD_HALF = HALF;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunkCoord(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor((x + HALF) / S), cz: Math.floor((z + HALF) / S) };
}

/** World position of the chunk's minimum corner. */
export function chunkOriginX(cx: number): number {
  return cx * S - HALF;
}
export function chunkOriginZ(cz: number): number {
  return cz * S - HALF;
}

/** Chunks inside the playable area plus the margin rings. */
export function isChunkInRange(cx: number, cz: number): boolean {
  return cx >= -M && cz >= -M && cx < CHUNKS_PER_SIDE + M && cz < CHUNKS_PER_SIDE + M;
}

/** Horizontal distance from a point to the nearest edge of a chunk (0 if inside). */
export function distanceToChunk(px: number, pz: number, cx: number, cz: number): number {
  const minX = chunkOriginX(cx);
  const minZ = chunkOriginZ(cz);
  const dx = Math.max(minX - px, 0, px - (minX + S));
  const dz = Math.max(minZ - pz, 0, pz - (minZ + S));
  return Math.hypot(dx, dz);
}
