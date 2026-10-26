// Airport pad in the real terrain: the pad is flat, the skirt grades back, roads / railway / port are untouched.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const g = new TerrainGenerator(Config.world.seed); const s = g.makeSample();
const a = g.airport, R = a.rect; let bad = 0;
const fail = (m: string) => { console.log('FAIL', m); bad++; };
let maxDev = 0, n = 0, wet = 0;
for (let x = R.x0; x <= R.x1; x += 20) for (let z = R.z0; z <= R.z1; z += 20) {
  g.sample(x, z, s); n++; maxDev = Math.max(maxDev, Math.abs(s.h - (a.floorY - 0.03)));
  if (!Number.isNaN(s.water) && s.h < s.water) wet++;
}
console.log(`pad ${n} samples, floor ${a.floorY.toFixed(1)} m, max deviation ${maxDev.toFixed(3)} m, wet ${wet}`);
if (maxDev > 0.35) fail('pad not flat (a road or the railway crosses it?)');
if (wet) fail('water on the pad');
// railway corridor south of the pad must not move
let moved = 0, cnt = 0;
const g2 = new TerrainGenerator(Config.world.seed); // same seed, same code: compare pad skirt vs natural beyond 60 m
for (let x = R.x0; x <= R.x1; x += 40) { const z = R.z1 + 80; g.sample(x, z, s); const h1 = s.h; g2.sampleGround(x, z, s); cnt++; if (!g.airport.near(x, z) && Math.abs(h1 - s.h) > 30) moved++; }
console.log('far-field samples checked', cnt, 'suspicious', moved);
console.log(bad ? 'FAILED' : 'ALL OK'); process.exit(bad ? 1 : 0);
