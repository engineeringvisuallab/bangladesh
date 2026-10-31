import type { RailNetwork } from '../rail/RailNetwork';

/** Same shapes as EVCity's RailLock (Suprim rail mode). Never reached while `terrain.rail` is undefined. */
export interface RailTrack {
  id: number;
  n: number;
  xs: Float64Array;
  zs: Float64Array;
  ys: Float64Array;
  cum: Float64Array;
  rad: Float64Array;
  length: number;
}

export interface RailPoint {
  track: number;
  i: number;
  t: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  dist: number;
}

/** Stub: no tracks, nothing is ever found. Replace with EVCity's RailLock when railways are ported. */
export class RailLock {
  readonly tracks: RailTrack[] = [];
  constructor(_rail: RailNetwork) {}
  nearest(_x: number, _z: number, _maxDist: number, _out: RailPoint, _skipTrack = -1): boolean {
    return false;
  }
  fill(_t: RailTrack, _i: number, _u: number, out: RailPoint): RailPoint {
    return out;
  }
  advance(_p: RailPoint, _ds: number): boolean {
    return false;
  }
  minRadiusAhead(_p: RailPoint, _dir: number, _dist: number): number {
    return Infinity;
  }
}
