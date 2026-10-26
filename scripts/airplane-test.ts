// Airplane check: mesh builds, a shuttle flight from a NORTH-SOUTH runway to the present airport (east-west runway 09) takes off, flies, lands on the threshold zone and stops.
import { buildPlaneMesh } from '../src/airplane/AirplaneMesh';
import { buildFlightPlan, PlaneFlight, PLANE_PERF, type RunwayEnd } from '../src/airplane/AirplaneLogic';
import { AIRPORT_POS } from '../src/airport/AirportSite';
let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mesh = buildPlaneMesh();
ok(mesh.body.positions.length > 0 && mesh.gear.positions.length > 0, `mesh built (${mesh.body.indices.length / 3} + ${mesh.gear.indices.length / 3} triangles)`);
let ys = 0, mx = -1e9, mn = 1e9; for (let i = 1; i < mesh.body.positions.length; i += 3) { ys = Math.min(ys, mesh.body.positions[i]); }
for (let i = 0; i < mesh.body.positions.length; i += 3) { mx = Math.max(mx, mesh.body.positions[i]); mn = Math.min(mn, mesh.body.positions[i]); }
ok(ys >= -0.01, 'nothing below the ground');
ok(mx - mn > 40 && mx - mn < 50, `fuselage length ${(mx - mn).toFixed(1)} m`);

// new runway: north-south (an example site; the real one is designed later), planes depart towards the NORTH
const newRwy: RunwayEnd = { x: 500, z: 2600, heading: -Math.PI / 2, length: 1800, y: 20 };
// present airport: runway 09/27 (x 1800..3200 at z = -4000), land on 09 (towards the east, threshold at the west end)
const present: RunwayEnd = { x: AIRPORT_POS.cx - 700, z: AIRPORT_POS.cz, heading: 0, length: 1400, y: 35 };
const plan = buildFlightPlan(newRwy, present);
const flight = new PlaneFlight(plan, newRwy.heading);
let t = 0, maxY = 0, minAglAfterLift = 1e9, lifted = false, maxBank = 0;
const seen = new Set<string>();
while (!flight.state.done && t < 3600) {
  flight.step(0.1); t += 0.1; const s = flight.state; seen.add(s.phase); maxY = Math.max(maxY, s.y); maxBank = Math.max(maxBank, Math.abs(s.roll));
  if (s.y > newRwy.y + 3) lifted = true;
  if (lifted && s.leg >= 5) minAglAfterLift = Math.min(minAglAfterLift, s.y - present.y);
}
const s = flight.state;
console.log(`flight time ${(t / 60).toFixed(1)} min, phases ${[...seen].join(' > ')}, cruise max ${maxY.toFixed(0)} m, max bank ${(maxBank * 57.3).toFixed(0)} deg`);
ok(flight.state.done, 'the flight finishes');
ok(Math.hypot(s.x - plan[plan.length - 1].x, s.z - plan[plan.length - 1].z) < 5, 'it ends at the end of the landing roll');
ok(s.y >= present.y - 0.5 && s.y <= present.y + 0.5, 'it ends on the runway level');
ok(minAglAfterLift > -0.5, `never below the arrival runway on the way in (${minAglAfterLift.toFixed(1)} m)`);
ok(maxY > newRwy.y + 150, 'it really climbs');
ok(maxBank <= PLANE_PERF.maxBank + 1e-6, 'bank within limit');
for (const p of ['takeoff-roll', 'rotate', 'climb', 'cruise', 'descent', 'final', 'flare', 'landing-roll']) ok(seen.has(p as never), `phase ${p} flown`);
console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);
