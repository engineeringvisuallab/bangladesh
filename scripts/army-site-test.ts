// Army camp site check: the pad is level, dry, clear of roads / the railway, and the camp plan has no overlapping buildings.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { createArmyPlan } from '../src/army/ArmyPlan';
let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new TerrainGenerator(Config.world.seed), s = g.makeSample(), m = new Float32Array(2);
const R = g.army.rect; let maxDev = 0, wet = 0, road = 0, rail = 0, n = 0;
for (let x = R.x0; x <= R.x1; x += 8) for (let z = R.z0; z <= R.z1; z += 8) {
  n++; g.sample(x, z, s);
  if (!Number.isNaN(s.water) && s.h < s.water + 0.2) wet++;
  g.roads.maskAt(x, z, 1, m); if (m[1] > 0.05) road++;
  if ((g as any).railForm.inCorridor(x, z, 6)) rail++;
  maxDev = Math.max(maxDev, Math.abs(s.h - g.army.floorY));
}
console.log(`pad ${n} samples, floor ${g.army.floorY.toFixed(1)} m, max deviation ${maxDev.toFixed(2)} m`);
ok(wet === 0, `no water on the pad (${wet})`);
ok(road === 0, `no road across the pad (${road})`);
ok(rail === 0, `no railway across the pad (${rail})`);
ok(maxDev < 0.2, 'the pad is level (< 0.2 m)');
const p = createArmyPlan(); const S = p.solids; let ov = 0;
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (Math.abs(S[i].cx - S[j].cx) < (S[i].w + S[j].w) / 2 && Math.abs(S[i].cz - S[j].cz) < (S[i].d + S[j].d) / 2) ov++;
ok(ov === 0, `no overlapping buildings (${ov})`);
console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);
