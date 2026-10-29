/**
 * The global tile grid. Tiles are TILE_SIZE_M squares aligned to multiples of 500 m of the national projection
 * (easting / northing), NOT to any city. So tile (1479, 5502) is the same ground no matter which city file mentions it,
 * and a new city can never collide with or shift an old one.
 */
export const TILE_SIZE_M = 500;

export interface TileIndex {
  i: number; // easting index
  j: number; // northing index
}

export const tileKey = (t: TileIndex): string => `${t.i},${t.j}`;

export function tileOf(e: number, n: number): TileIndex {
  return { i: Math.floor(e / TILE_SIZE_M), j: Math.floor(n / TILE_SIZE_M) };
}

/** South-west corner of a tile, in projected metres. */
export function tileOrigin(t: TileIndex): { e: number; n: number } {
  return { e: t.i * TILE_SIZE_M, n: t.j * TILE_SIZE_M };
}

export function snapToTileGrid(v: number): number {
  return Math.round(v / TILE_SIZE_M) * TILE_SIZE_M;
}
