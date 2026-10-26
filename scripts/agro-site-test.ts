// EV Agro institute pad in the real terrain: flat, dry, on farmland, clear of roads / railway / other sites; no trees, rocks or local streets on it.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt } from '../src/city/WorldZones';
import { agroKeepout } from '../src/agro/AgroSite';
const g = new TerrainGenerator(Config.world.seed); const s = g.makeSample(); const m = new Float32Array(4);
const a = g.agro, R = a.rect; let bad = 0;
const fail = (t: string) => { console.log('FAIL', t); bad++; };
let maxDev = 0, n = 0, wet = 0, road = 0, rail = 0, notFarm = 0;
for (let x = R.x0; x <= R.x1; x += 10) for (let z = R.z0; z <= R.z1; z += 10) {
  g.sample(x, z, s); n++; maxDev = Math.max(maxDev, Math.abs(s.h - (a.floorY - 0.03)));
  if (!Number.isNaN(s.water) && s.h < s.water) wet++;
  g.roads.maskAt(x, z, 1, m); if (m[0] > 0 || m[1] > 0) road++;
  if (g.railForm.inCorridor(x, z, 6)) rail++;
  if (getWorldZoneAt(x, z).kind !== 'farmland') notFarm++;
  if (!a.contains(x, z, 0)) fail('contains() false on the pad');
}
console.log(`pad ${n} samples, floor ${a.floorY.toFixed(1)} m, max deviation ${maxDev.toFixed(3)} m, wet ${wet}, road ${road}, rail ${rail}, not-farmland ${notFarm}`);
if (maxDev > 0.35) fail('pad not flat');
if (wet) fail('water on the pad');
if (road) fail('a road crosses the pad');
if (rail) fail('the railway crosses the pad');
if (notFarm) fail('part of the pad is not farmland');
if (!agroKeepout(a.x, a.z)) fail('no local-street keepout');
// skirt: 40 m outside the pad the ground is natural again
const far = { x: R.x0 - 60, z: a.z };
g.sample(far.x, far.z, s); const h1 = s.h; g.sampleGround(far.x, far.z, s);
if (Math.abs(h1 - s.h) > 0.5) fail('skirt reaches too far');
console.log(bad ? 'FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
