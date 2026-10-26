/**
 * Build options. The standalone preview uses the defaults. The game passes real numbers measured on ITS terrain
 * (where the river is, how the ground falls away outside the pad), so intake / outfall pipes really reach the water.
 * All distances in metres in the infrastructure's LOCAL frame (x east, y up, z south, floor = 0).
 */
export interface InfraBuildOptions {
  /** Build the river, grass and trees around the site (preview only). The game has its own terrain: false. Default true. */
  withEnvironment?: boolean;
  /** Ground height (relative to the site floor) at local (x, z). Used for things standing OUTSIDE the pad (poles, outfall, intake pipes). */
  groundY?: (lx: number, lz: number) => number;
  /** Distance from the pad's river-side edge to the river's water edge. */
  riverReach?: number;
  /** River water surface relative to the site floor (negative = below the floor). */
  waterRel?: number;
  /** Depth (m) of the concrete skirt under the ground pad (the game digs the ground under the pad). 0 = none. */
  skirtDepth?: number;
}

export interface ResolvedOptions {
  withEnvironment: boolean;
  groundY: (lx: number, lz: number) => number;
  riverReach: number;
  waterRel: number;
  skirtDepth: number;
}

/** side = which local side the river is on. Defaults reproduce the preview's own river bank (4 m drop over 14 m). */
export function resolveOptions(o: InfraBuildOptions | undefined, side: 'W' | 'E', padEdge: number): ResolvedOptions {
  const bank = (lx: number): number => {
    const d = side === 'W' ? -padEdge - lx : lx - padEdge;
    return d <= 0 ? 0 : Math.max(-4, -d * 0.282);
  };
  return {
    withEnvironment: o?.withEnvironment ?? true,
    groundY: o?.groundY ?? ((lx) => bank(lx)),
    riverReach: o?.riverReach ?? 5,
    waterRel: o?.waterRel ?? -1.5,
    skirtDepth: o?.skirtDepth ?? 0,
  };
}
