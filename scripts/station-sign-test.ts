import { Config } from '../src/core/Config';
import { bn } from '../src/i18n';
import { BOARD, STATION_EN, stationSigns } from '../src/rail/StationSigns';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

/**
 * Station name boards (headless): every station has an English and a Bangla name, every board has a finite position, a unit-length horizontal
 * normal and a sensible size, every platform has 2 sides x 3 boards, and the boards stay clear of the stair axis (the middle of a bay).
 */
let bad = 0;
const fail = (m: string): void => {
  bad++;
  console.log('FAIL', m);
};
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
for (const st of rail.stations) {
  if (!STATION_EN[st.id]) fail(`${st.id}: no English name`);
  if (!bn.rail.station[st.id]) fail(`${st.id}: no Bangla name`);
}
const spots = stationSigns(rail, (x, z) => gen.heightAt(x, z));
let platform = 0;
for (const s of spots) {
  if (![s.x, s.y, s.z, s.nx, s.nz, s.w, s.h, s.thick].every(Number.isFinite)) fail(`${s.station}: non-finite board`);
  if (Math.abs(Math.hypot(s.nx, s.nz) - 1) > 1e-3) fail(`${s.station}: normal length ${Math.hypot(s.nx, s.nz)}`);
  if (s.w < 2 || s.w > 6 || s.h < 0.5 || s.h > 1.2 || s.w / s.h < 3) fail(`${s.station}: odd board size ${s.w} x ${s.h}`);
  if (s.h === BOARD.hh * 2) platform++;
}
const arrivals = rail.stations.reduce((n, st) => n + st.arrivals.length, 0);
if (platform !== arrivals * 2 * BOARD.qs(D.platform).length) fail(`platform boards ${platform}, expected ${arrivals * 6}`);
console.log(`${rail.stations.length} stations, ${arrivals} platforms, ${spots.length} boards (${platform} on platforms)`);
console.log(bad === 0 ? 'ALL OK' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
