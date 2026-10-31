/** What a vehicle asks the ground about one point. Same shape as EVCity's TerrainSample. */
export interface TerrainSample {
  /** Ground height (m). */
  h: number;
  /** Water surface height (m), NaN = no water here. */
  water: number;
  /** Water current (m/s). */
  fx: number;
  fz: number;
}
