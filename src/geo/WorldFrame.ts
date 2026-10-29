import type { EN } from './Projection';
import { snapToTileGrid } from './Tiles';

/**
 * Scene coordinates <-> projected coordinates.
 *
 * Same convention as EVCity: x = east, y = up, z = south (so NORTH = -z). Scene units are metres.
 * The scene origin is a fixed projected point (snapped to the tile grid) so that scene numbers stay small
 * (float32 safe) while every object still has an exact global address:  E = originE + x,  N = originN - z.
 *
 * Today the origin sits in the middle of the first city. When a city is far away (tens of km), the game
 * re-bases the origin (floating origin) and only this class changes - region data never does.
 */
export class WorldFrame {
  constructor(
    readonly originE: number,
    readonly originN: number,
  ) {}

  static nearest(e: number, n: number): WorldFrame {
    return new WorldFrame(snapToTileGrid(e), snapToTileGrid(n));
  }

  toX(e: number): number {
    return e - this.originE;
  }
  toZ(n: number): number {
    return -(n - this.originN);
  }
  toE(x: number): number {
    return this.originE + x;
  }
  toN(z: number): number {
    return this.originN - z;
  }
  toEN(x: number, z: number, out: EN = { e: 0, n: 0 }): EN {
    out.e = this.originE + x;
    out.n = this.originN - z;
    return out;
  }
}
