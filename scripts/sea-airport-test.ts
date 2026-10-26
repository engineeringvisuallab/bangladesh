// Sea airport + aircraft check (STAGE C): the new airport stands on filled land in the sea, clear of everything else; planes take off, fly, land and
// taxi at both airports without cutting into the terrain or each other; the shuttle / abroad airliner / fighters keep their timetable.
// Uses the real TerrainGenerator and AirplaneManager (three.js is only used for Group / Vector3 / geometry, no GPU).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { SEA_AIRPORT_FLOOR } from '../src/airport/AirportSite';
import { AIRPORT, AIRPORT_SEA, ARMY, SEAPORT, getWorldZoneAt } from '../src/city/WorldZones';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
import { AirplaneManager } from '../src/airplane/AirplaneManager';
import { createAirportOps } from '../src/airplane/AirplaneOps';
import { FIGHTER_PERF, PLANE_PERF, PlaneFlight, buildFlightPlan } from '../src/airplane/AirplaneLogic';
import { Group } from 'three';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new TerrainGenerator(Config.world.seed);
const sea = g.airportSea;

// ---- site: filled land, flat, dry, causeway reaches the shore
ok(Math.abs(sea.floorY - SEA_AIRPORT_FLOOR) < 1e-9, `sea airport floor = ${sea.floorY} m (filled up to ${SEA_AIRPORT_FLOOR} m)`);
const R = sea.rect;
let n = 0, wetNatural = 0, minH = 1e9, maxH = -1e9, dry = 0;
const s = g.makeSample();
for (let x = R.x0; x <= R.x1; x += 20) for (let z = R.z0; z <= R.z1; z += 20) {
  n++;
  const h = g.heightAt(x, z);
  minH = Math.min(minH, h); maxH = Math.max(maxH, h);
  if (h > 0.5) dry++;
}
ok(dry === n, `the whole pad is above sea level (${dry}/${n} samples)`);
ok(maxH - minH < 0.3, `the pad is flat (${minH.toFixed(2)} .. ${maxH.toFixed(2)} m)`);
void wetNatural; void s;
// causeway: from the pad entrance (local +z, towards the north) to the shore: centre line dry and flat
const entr = createAirportOps('sea', sea.plan, sea.floorY);
const c0 = entr.toWorld(0, sea.plan.causeway.z0), c1 = entr.toWorld(0, sea.plan.causeway.z1);
let cMin = 1e9, cMax = -1e9;
for (let t = 0; t <= 1; t += 0.02) { const h = g.heightAt(c0.x + (c1.x - c0.x) * t, c0.z + (c1.z - c0.z) * t); cMin = Math.min(cMin, h); cMax = Math.max(cMax, h); }
ok(cMin > 0.5 && cMax - cMin < 0.3, `the causeway is dry and flat (${cMin.toFixed(2)} .. ${cMax.toFixed(2)} m)`);
ok(g.heightAt(c1.x, c1.z - 60) > 0.5 || c1.z < c0.z, 'the causeway ends on land');

// ---- no overlap with other facilities / engineering areas (30 m margin like eng-zones-test) / the old airport
const ov = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }, m = 0): boolean => !(a.x1 + m <= b.x0 || a.x0 - m >= b.x1 || a.z1 + m <= b.z0 || a.z0 - m >= b.z1);
for (const f of [AIRPORT, ARMY, SEAPORT]) ok(!ov(AIRPORT_SEA, f), `sea airport grounds do not overlap ${f.id}`);
for (const a of ENGINEERING_AREAS) ok(!ov(AIRPORT_SEA, a, 30), `sea airport keeps 30 m from ${a.id}`);
// the island must not touch the pad
let islandLand = 0;
for (let x = R.x0 - 40; x <= R.x1 + 40; x += 20) for (let z = R.z0 - 40; z <= R.z1 + 40; z += 20) {
  const isl = Config.terrain.island, di = Math.hypot(x - isl.x, z - isl.z) / isl.radius;
  if (di < 0.78) islandLand++;
}
ok(islandLand === 0, 'the island hills are not inside the pad');
ok(getWorldZoneAt(180, 3670).id === 'airport-sea', 'zone lookup: runway centre is the sea airport');
ok(getWorldZoneAt(2500, -4000).id === 'airport', 'zone lookup: the old airport is unchanged');

// ---- flights: all four combinations, terrain clearance (old airport: steep approach from the west)
const old = createAirportOps('old', g.airport.plan, g.airport.floorY);
const seaOps = entr;
const OLD_APPROACH = { ...PLANE_PERF, glideSlope: (8.5 * Math.PI) / 180, finalDist: 3000 };
function fly(name: string, plan: ReturnType<typeof buildFlightPlan>, h0: number, perf: typeof PLANE_PERF, rollMax: number): void {
  const f = new PlaneFlight(plan, h0, perf);
  let t = 0, clr = 1e9, at = '';
  while (!f.state.done && t < 1500) {
    f.step(0.1); t += 0.1;
    const st = f.state;
    // clearance over the terrain everywhere except in the first / last 800 m next to the runways (take-off roll, flare, landing roll)
    const dDep = Math.hypot(st.x - plan[0].x, st.z - plan[0].z), dArr = Math.hypot(st.x - plan[plan.length - 1].x, st.z - plan[plan.length - 1].z);
    const climbingOut = st.y < plan[0].y + 30 && dDep < 3000; // just lifted off
    const fin = plan.find((w) => w.phase === 'final');
    const nearFinal = st.phase === 'final' && fin !== undefined && Math.hypot(st.x - fin.x, st.z - fin.z) < 700; // the glide path ends 12 m above the runway
    if (!nearFinal && dDep > 800 && dArr > 800 && !climbingOut && st.phase !== 'takeoff-roll' && st.phase !== 'rotate' && st.phase !== 'flare' && st.phase !== 'landing-roll') { const c = st.y - Math.max(0, g.heightAt(st.x, st.z)); if (c < clr) { clr = c; at = `${st.phase} ${Math.round(st.x)},${Math.round(st.z)} y${st.y.toFixed(0)}`; } }
  }
  ok(f.state.done && t < 400, `${name}: flight finishes in ${(t / 60).toFixed(1)} min`);
  ok(clr > 20, `${name}: min clearance above the terrain ${clr.toFixed(0)} m (${at})`);
  void rollMax;
}
fly('sea -> old', buildFlightPlan(seaOps.takeoffEnd(-1), old.landingEnd(1), OLD_APPROACH, { cruiseAlt: 700 }), seaOps.takeoffEnd(-1).heading, PLANE_PERF, 0);
fly('old -> sea', buildFlightPlan(old.takeoffEnd(-1), seaOps.landingEnd(1), PLANE_PERF, { cruiseAlt: 700 }), old.takeoffEnd(-1).heading, PLANE_PERF, 0);

// ---- the aircraft manager: 25 minutes of game time
const root = new Group();
const player = { x: 0, z: 0 };
const m = new AirplaneManager({ root, terrain: g, playerWorld: (o) => { o.set(player.x, 0, player.z); return o; } });
const craft = (m as unknown as { craft: { id: string; mode: string; airport: { id: string }; pose: { x: number; y: number; z: number }; flight: { state: { phase: string } } | null }[] }).craft;
const seen = new Map<string, Set<string>>();
let minSep = 1e9, sepInfo = '';
const dt = 0.1;
let shuttleAirports = new Set<string>();
for (let t = 0; t < 1500; t += dt) {
  m.update(dt);
  for (const a of craft) {
    const set = seen.get(a.id) ?? new Set<string>(); seen.set(a.id, set);
    set.add(a.mode === 'flight' && a.flight ? 'flight:' + a.flight.state.phase : a.mode);
    if (a.id === 'shuttle' && a.mode === 'parked') shuttleAirports.add(a.airport.id);
  }
  for (let i = 0; i < craft.length; i++) for (let j = i + 1; j < craft.length; j++) {
    const A = craft[i], B = craft[j];
    if (A.mode === 'away' || B.mode === 'away' || (A.mode === 'parked' && B.mode === 'parked')) continue;
    if (Math.abs(A.pose.y - B.pose.y) > 30) continue;
    const dd = Math.hypot(A.pose.x - B.pose.x, A.pose.z - B.pose.z);
    if (dd < minSep) { minSep = dd; sepInfo = `${A.id}(${A.mode}) / ${B.id}(${B.mode}) t=${t.toFixed(0)} at ${Math.round(A.pose.x)},${Math.round(A.pose.z)}`; }
  }
}
const has = (id: string, ...ph: string[]): boolean => ph.every((p) => seen.get(id)?.has(p));
ok(has('shuttle', 'taxi-out', 'flight:takeoff-roll', 'flight:cruise', 'flight:landing-roll', 'taxi-in', 'parked'), 'shuttle: taxi, take-off, cruise, landing, taxi-in, parked');
ok(shuttleAirports.has('old') && shuttleAirports.has('sea'), 'shuttle stands at both airports');
ok(has('abroad', 'away', 'flight:descent', 'flight:landing-roll', 'taxi-in', 'parked', 'taxi-out', 'flight:climb'), 'airliner from abroad: arrives, lands, stands, leaves again');
ok(has('fighter0', 'taxi-out', 'flight:takeoff-roll', 'flight:cruise', 'flight:landing-roll', 'parked'), 'fighter: sortie from the hardstand and back');
ok(minSep >= 35, `min distance between aircraft on the move: ${minSep.toFixed(0)} m (stands are 40 m apart) ${sepInfo}`);
void FIGHTER_PERF;
m.dispose();

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
