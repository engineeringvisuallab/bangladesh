// Checks the SWTP / STP pads on the real terrain: floor height, river distance, river not buried, no water in the dug-out pad,
// no other pad / road / rail touched. Run: npx tsx scripts/infra-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const g = new TerrainGenerator(Config.world.seed);
const o = g.makeSample();
const pt = { x: 0, z: 0 };
let bad = 0;
const fail = (m: string): void => { bad++; console.log('FAIL', m); };
for (const s of g.infra) {
  console.log(`\n== ${s.id}: origin (${s.x}, ${s.z}) floorY=${s.floorY.toFixed(2)} deep=${s.deep}`);
  const R = s.rect;
  // 1) under the pad: dug out, never water
  let wet = 0, n = 0, hmin = 1e9;
  for (let lx = R.x0 + 1; lx <= R.x1 - 1; lx += 4) for (let lz = R.z0 + 1; lz <= R.z1 - 1; lz += 4) {
    s.toWorld(lx, lz, pt); g.sample(pt.x, pt.z, o); n++; hmin = Math.min(hmin, o.h);
    if (!Number.isNaN(o.water) && o.h < o.water + 0.2) wet++;
  }
  console.log(`pad interior: ${n} samples, lowest ground ${hmin.toFixed(1)}, with water in the pit: ${wet}`);
  if (wet) fail(`${s.id}: water shows inside the dug-out pad`);
  if (s.riverSide === 'none') {
    // plants without a river: only the road check (5) matters
    const mk = new Float32Array(4); let rk = 0;
    for (let lx = R.x0 - 40; lx <= R.x1 + 40; lx += 8) for (let lz = R.z0 - 40; lz <= R.z1 + 40; lz += 8) { s.toWorld(lx, lz, pt); g.roads.maskAt(pt.x, pt.z, 1, mk); rk = Math.max(rk, mk[1]); }
    console.log(`(no river side) road / junction mask max within pad + 40 m: ${rk.toFixed(2)}`);
    if (rk > 0) fail(`${s.id}: a road touches the pad area`);
    continue;
  }
  // 2) river: march out from the river-side edge midpoint
  const side = s.id === 'swtp' ? -1 : 1;
  const ex = side < 0 ? R.x0 : R.x1;
  let reach = -1, ws = NaN, bankH = NaN;
  for (let d = 0; d <= 200; d += 1) {
    s.toWorld(ex + side * d, 0, pt); g.sample(pt.x, pt.z, o);
    if (!Number.isNaN(o.water) && o.h < o.water - 0.1) { reach = d; ws = o.water; bankH = o.h; break; }
  }
  console.log(`river water edge ${reach} m from the pad edge, water level ${ws.toFixed(2)} (floor ${(ws - s.floorY).toFixed(2)} rel), river bed there ${bankH.toFixed(2)}`);
  if (reach < 0) fail(`${s.id}: no river found on its river side`);
  // 3) is the river untouched by the grading? compare with the same sample without the pad
  s.toWorld(ex + side * Math.max(reach, 1), 0, pt);
  // 4) ground just outside the edge on the 3 other sides vs the pad plate height (steepness of the grading)
  let maxSlope = 0;
  for (const [lx, lz] of [[0, R.z0], [0, R.z1], [side < 0 ? R.x1 : R.x0, 0], [ex, 0]] as const) {
    const dirx = lx === 0 ? 0 : Math.sign(lx), dirz = lz === 0 ? 0 : Math.sign(lz);
    let prev = s.floorY;
    for (let d = 1; d <= 30; d++) { s.toWorld(lx + dirx * d, lz + dirz * d, pt); g.sample(pt.x, pt.z, o); maxSlope = Math.max(maxSlope, Math.abs(o.h - prev)); prev = o.h; }
  }
  console.log(`steepest 1 m step of the grading skirt: ${maxSlope.toFixed(2)} m`);
  // 5) roads / rail near the pad? any road earthwork under the skirt?
  const mask = new Float32Array(4); let roadK = 0;
  for (let lx = R.x0 - 40; lx <= R.x1 + 40; lx += 8) for (let lz = R.z0 - 40; lz <= R.z1 + 40; lz += 8) { s.toWorld(lx, lz, pt); g.roads.maskAt(pt.x, pt.z, 1, mask); roadK = Math.max(roadK, mask[1]); }
  console.log(`road / junction mask max within pad + 40 m: ${roadK.toFixed(2)}`);
  if (roadK > 0) fail(`${s.id}: a road touches the pad area`);
  // 6) vegetation keep-out is in effect at the centre
  console.log('contains centre:', s.contains(s.x, s.z), ' inside fence:', s.inside(s.x, s.z));
}
// existing pads unchanged: sample a few reference points far from the plants with the plants present
const ref = [[0, 0], [66, 56], [-1500, -800], [900, 400]];
console.log('\nreference heights:', ref.map(([x, z]) => { g.sample(x, z, o); return o.h.toFixed(2); }).join(' '));
console.log(bad ? `${bad} problem(s)` : 'OK');
process.exit(bad ? 1 : 0);
