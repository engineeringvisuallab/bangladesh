// Farm crew logic (pure part): job plans on the real field table + the lane-following controller on a kinematic vehicle model.
//   npm run test:farm-crew
import { FARM_FIELDS } from '../src/farm/FarmFields';
import { Act } from '../src/farm/CropDefs';
import { loopRoute, planJobs, pursue } from '../src/farm/FarmJobs';
import { mulberry32 } from '../src/world/Seed';

let bad = 0;
const fail = (s: string) => { console.log('FAIL', s); bad++; };

// ---- job plans ----
const byAct = new Map<number, number>(), poses = new Set<string>(), vehicles = new Map<string, number>();
let workers = 0;
for (const f of FARM_FIELDS) {
  const plan = planJobs(f, mulberry32(f.seed ^ 0xc4e3));
  const again = planJobs(f, mulberry32(f.seed ^ 0xc4e3));
  if (JSON.stringify(plan) !== JSON.stringify(again)) fail(`plan of field ${f.id} not deterministic`);
  if (f.level && plan.v.length) fail(`field ${f.id}: a machine on a levelled terrace`);
  for (const w of plan.w) {
    workers++;
    if (w.pose) poses.add(w.pose);
    if (Math.abs(w.x) > f.w && w.kind !== 'ferry') fail(`field ${f.id}: worker x ${w.x.toFixed(1)} outside`);
    if (Math.abs(w.z) > f.d) fail(`field ${f.id}: worker z ${w.z.toFixed(1)} outside`);
  }
  for (const v of plan.v) {
    vehicles.set(v.id, (vehicles.get(v.id) ?? 0) + 1);
    for (const [x, z] of v.route) if (Math.abs(x) > f.w / 2 + 25 || Math.abs(z) > f.d / 2 + 25) fail(`field ${f.id}: route point ${x.toFixed(1)},${z.toFixed(1)} too far outside`);
  }
  byAct.set(f.act, (byAct.get(f.act) ?? 0) + 1);
}
console.log(`${FARM_FIELDS.length} fields -> ${workers} farmers; vehicles:`, JSON.stringify(Object.fromEntries(vehicles)), '; poses:', [...poses].join(', '));
for (const need of ['tractor', 'combine', 'pickup']) if (!vehicles.get(need)) fail(`no ${need} planned anywhere`);
for (const p of ['plant', 'cut', 'pick', 'sow', 'spray', 'tend', 'carry', 'weed']) if (!poses.has(p)) fail(`pose ${p} never used`);
if (workers < 100) fail('too few farmers');

// ---- controller on a kinematic bicycle: follow the lane loop ----
function simulate(name: string, route: [number, number][], wheelbase: number, maxSteer: number, lane: number): void {
  let x = route[0][0], z = route[0][1] - 1, yaw = 0; // heading +z (yaw = angle from +z toward +x)
  let sp = 0, i = 1, laps = 0, maxDev = 0, minSp = 1e9, t = 0;
  const dt = 1 / 30;
  while (t < 400) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (Math.hypot(route[i][0] - x, route[i][1] - z) < 4.5) { i = (i + 1) % route.length; if (i === 1) laps++; }
    const c = pursue(fx, fz, x, z, route[i][0], route[i][1], sp, lane);
    const delta = c.steer * maxSteer; // +1 = left: yaw decreases when turning toward +x? (left of +z is +x) -> yaw increases
    sp = Math.max(0, sp + (c.throttle * 2.5 - c.brake * 5) * dt);
    yaw += (sp / wheelbase) * Math.tan(delta) * dt;
    x += Math.sin(yaw) * sp * dt; z += Math.cos(yaw) * sp * dt;
    t += dt;
    // deviation from the closest route segment
    let best = 1e9;
    for (let k = 0; k < route.length; k++) {
      const [ax, az] = route[k], [bx, bz] = route[(k + 1) % route.length], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      best = Math.min(best, Math.hypot(x - (ax + u * vx), z - (az + u * vz)));
    }
    if (t > 40) { maxDev = Math.max(maxDev, best); minSp = Math.min(minSp, sp); }
  }
  console.log(`${name}: ${laps} laps in 400 s, max deviation from the lane ${maxDev.toFixed(2)} m, slowest ${minSp.toFixed(2)} m/s`);
  if (laps < 2) fail(`${name}: did not complete 2 laps`);
  if (maxDev > 3.2) fail(`${name}: leaves the lane by ${maxDev.toFixed(1)} m`);
}
simulate('tractor  (8 m lanes)', loopRoute(-10, 8, 36), 2.6, 0.7, 2.6);
simulate('combine  (14 m lanes)', loopRoute(-10, 14, 36), 4.0, 0.55, 2.2);
simulate('pickup   (bank loop)', loopRoute(-50, 10, 30), 3.2, 0.6, 4.5);
void Act;
console.log(bad ? 'FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);
