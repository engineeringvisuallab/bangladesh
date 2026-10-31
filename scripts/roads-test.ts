/* Run: npx tsx scripts/roads-test.ts   (roads + ribbons + georeference of the traced data, no dependencies) */
import { readFileSync } from 'node:fs';
import { Region, WorldFrame, enToLonLat, type RegionDef } from '../src/geo';
import type { RoadsFile } from '../src/roads/RoadData';
import { buildArea, buildRibbon } from '../src/roads/RoadGeometry';
import { RoadNetwork } from '../src/roads/RoadNetwork';

let failed = 0;
function check(name: string, ok: boolean, info = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!ok) failed++;
}
const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as T;
const def = read<RegionDef>('../public/regions/bogura/region.json');
const file = read<RoadsFile>('../public/regions/bogura/roads.json');
const region = new Region(def);
const frame = WorldFrame.nearest(region.center.e, region.center.n);
const net = new RoadNetwork([file], frame);
const flat = (): number => 0;

const road = (id: string) => net.roads.find((r) => r.id === id)!;
const hw = road('bogura-main-road');
const rw = road('runway');
check('main road length 2.0 - 2.4 km', hw.length > 2000 && hw.length < 2400, `${hw.length.toFixed(0)} m`);
check('runway length 1.25 - 1.45 km (real: 1372 m / 4500 ft)', rw.length > 1250 && rw.length < 1450, `${rw.length.toFixed(0)} m`);
const brg = ((Math.atan2(rw.xs[1] - rw.xs[0], -(rw.zs[1] - rw.zs[0])) * 180) / Math.PI + 360) % 360;
check('runway bearing 119 deg (+-1)', Math.abs(brg - 119) < 1, `${brg.toFixed(1)}`);
const inside = file.roads.every((r) => r.points.every(([e, n]) => region.contains(e, n)));
check('all road points are inside the region', inside);

// surface queries
const mid = (r: typeof hw, f: number): { x: number; z: number; nx: number; nz: number } => {
  const i = Math.floor((r.xs.length - 1) * f);
  const dx = r.xs[i + 1] - r.xs[i];
  const dz = r.zs[i + 1] - r.zs[i];
  const l = Math.hypot(dx, dz);
  return { x: (r.xs[i] + r.xs[i + 1]) / 2, z: (r.zs[i] + r.zs[i + 1]) / 2, nx: -dz / l, nz: dx / l };
};
for (const [r, half] of [[hw, 5], [rw, 15]] as const) {
  const m = mid(r, 0.5);
  check(`${r.id}: asphalt on the centre line`, net.surfaceAt(m.x, m.z) === 1);
  check(`${r.id}: asphalt just inside the edge (${half - 1} m)`, net.surfaceAt(m.x + m.nx * (half - 1), m.z + m.nz * (half - 1)) === 1);
  check(`${r.id}: ground just outside the edge (${half + 3} m)`, net.surfaceAt(m.x + m.nx * (half + 3), m.z + m.nz * (half + 3)) === 0);
}
const apron = net.area('apron')!;
const cx = apron.xs.reduce((a, b) => a + b) / 4;
const cz = apron.zs.reduce((a, b) => a + b) / 4;
check('apron centre is asphalt', net.surfaceAt(cx, cz) === 1);
check('3 km away is natural ground', net.surfaceAt(cx + 3000, cz) === 0);
const acc = road('airport-access-road');
const last = acc.xs.length - 1;
let dJoin = Infinity;
for (let i = 0; i < hw.xs.length - 1; i++) {
  const dx = hw.xs[i + 1] - hw.xs[i];
  const dz = hw.zs[i + 1] - hw.zs[i];
  const k = Math.max(0, Math.min(1, ((acc.xs[last] - hw.xs[i]) * dx + (acc.zs[last] - hw.zs[i]) * dz) / (dx * dx + dz * dz)));
  dJoin = Math.min(dJoin, Math.hypot(acc.xs[last] - (hw.xs[i] + k * dx), acc.zs[last] - (hw.zs[i] + k * dz)));
}
check('access road ends on the main road centre line (<= 1 m)', dJoin <= 1, `${dJoin.toFixed(2)} m`);

// ribbon meshes: finite, indices in range, every triangle faces up, v grows along the road
for (const r of net.roads) {
  const d = buildRibbon(r, flat, 0.06, 12);
  let up = true;
  let finite = true;
  for (let t = 0; t < d.indices.length; t += 3) {
    const [a, b, c] = [d.indices[t], d.indices[t + 1], d.indices[t + 2]];
    const ax = d.positions[b * 3] - d.positions[a * 3];
    const az = d.positions[b * 3 + 2] - d.positions[a * 3 + 2];
    const bx = d.positions[c * 3] - d.positions[a * 3];
    const bz = d.positions[c * 3 + 2] - d.positions[a * 3 + 2];
    if (az * bx - ax * bz <= 0) up = false;
  }
  for (const v of d.positions) if (!Number.isFinite(v)) finite = false;
  const nv = d.positions.length / 3;
  const inRange = d.indices.every((i) => i < nv);
  const lastV = d.uvs[d.uvs.length - 1];
  check(`ribbon ${r.id}: ${nv} vertices, all triangles face up, v ends at ${lastV.toFixed(1)} (= length/12)`, up && finite && inRange && Math.abs(lastV - r.length / 12) < 0.01);
}
{
  const d = buildArea(apron, flat, 0.07, 10);
  let up = true;
  for (let t = 0; t < d.indices.length; t += 3) {
    const [a, b, c] = [d.indices[t], d.indices[t + 1], d.indices[t + 2]];
    const ax = d.positions[b * 3] - d.positions[a * 3];
    const az = d.positions[b * 3 + 2] - d.positions[a * 3 + 2];
    const bx = d.positions[c * 3] - d.positions[a * 3];
    const bz = d.positions[c * 3 + 2] - d.positions[a * 3 + 2];
    if (az * bx - ax * bz <= 0) up = false;
  }
  check('apron polygon faces up', up);
}

// the screenshot registration must put the NW runway threshold where the airport photo says it is
{
  const photo = region.georefs[0].pixelToEN(318.3 - 44, 948.3 - 41); // threshold bars, pixel in the photo crop
  const shot = region.georefs[1].pixelToEN(336.75, 262.5); // same bars, pixel in the screenshot
  const d = Math.hypot(photo.e - shot.e, photo.n - shot.n);
  check('screenshot vs airport photo: NW runway threshold agrees within 25 m', d < 25, `${d.toFixed(1)} m`);
  const ll = enToLonLat(photo.e, photo.n);
  console.log(`      NW threshold  ${ll.lat.toFixed(6)} N  ${ll.lon.toFixed(6)} E`);
}

console.log(failed === 0 ? '\nall road tests passed' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
