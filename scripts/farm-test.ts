// Farm planner on the real terrain: fields dry, flat enough, clear of roads / rail / pads / buildings, never overlapping, with variety of crops + stages.
//   npm run test:farm          (also writes /tmp/farm-map.json for a quick top-down picture)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { terrainGround } from '../src/farm/FarmGround';
import { FieldIndex, planFarms, fieldContains, type PlanStats } from '../src/farm/FarmPlan';
import { Act, CROPS, STAGE_BN, cropById } from '../src/farm/CropDefs';
import { FARM_FIELDS } from '../src/farm/FarmFields';

const t0 = Date.now();
const g = new TerrainGenerator(Config.world.seed);
const ground = terrainGround(g);
const stats: PlanStats = { cells: 0, fields: 0, rejected: {} };
const fields = planFarms(ground, Config.world.seed, stats);
console.log(`planned ${fields.length} fields from ${stats.cells} candidate cells in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('rejected:', JSON.stringify(stats.rejected));

let bad = 0;
const fail = (s: string) => { console.log('FAIL', s); bad++; };
if (fields.length < 150) fail('too few fields');

// the committed table (src/farm/FarmFields.ts) is the current plan
if (FARM_FIELDS.length !== fields.length || FARM_FIELDS.some((f, i) => f.crop !== fields[i].crop || f.stage !== fields[i].stage || f.act !== fields[i].act || Math.abs(f.cx - fields[i].cx) > 0.1)) fail('FarmFields.ts is out of date: run npm run gen:farm');

// determinism
const again = planFarms(ground, Config.world.seed);
if (again.length !== fields.length || again.some((f, i) => f.crop !== fields[i].crop || f.stage !== fields[i].stage || f.cx !== fields[i].cx)) fail('plan is not deterministic');

// per-field checks: corners and centre dry + unblocked, no overlap with a neighbour
const idx = new FieldIndex(fields);
const p = { h: 0, wet: false, blocked: false };
let overlaps = 0, wet = 0, blocked = 0;
for (const f of fields) {
  for (const [a, b] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const lx = (a * f.w) / 2, lz = (b * f.d) / 2, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const x = f.cx + lx * c + lz * s, z = f.cz - lx * s + lz * c;
    ground.probe(x, z, p);
    if (p.wet) wet++;
    if (p.blocked) blocked++;
    if (!fieldContains(f, x, z, 0.5)) fail('corner not inside own field');
    const o = idx.at(x, z);
    if (o && o !== f && fieldContains(o, x, z, 0)) overlaps++;
  }
}
if (wet) fail(`${wet} wet corners`);
if (blocked) fail(`${blocked} blocked corners`);
if (overlaps) fail(`${overlaps} overlaps`);

// variety
const byCrop = new Map<string, number>(), byStage = new Array(9).fill(0), byAct = new Array(13).fill(0), byZone = new Map<string, number>();
for (const f of fields) {
  byCrop.set(f.crop, (byCrop.get(f.crop) ?? 0) + 1);
  byStage[f.stage]++; byAct[f.act]++;
  byZone.set(f.zone, (byZone.get(f.zone) ?? 0) + 1);
}
console.log('crops :', [...byCrop].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${cropById(k).en} ${v}`).join(', '));
console.log('stages:', byStage.map((n, i) => `${STAGE_BN[i]} ${n}`).join(' | '));
console.log('acts  :', Object.entries(Act).map(([k, v]) => `${k} ${byAct[v]}`).join(', '));
console.log('zones :', [...byZone].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
const missing = CROPS.filter((c) => !byCrop.has(c.id)).map((c) => c.id);
console.log('crops never placed:', missing.join(', ') || 'none');
if (byCrop.size < 14) fail('too little crop variety');
for (const a of [Act.plow, Act.harvestCombine, Act.harvestHand, Act.irrigate, Act.spray, Act.pick, Act.thresh, Act.transplant]) if (!byAct[a]) fail(`no field with activity ${a}`);

writeFileSync('/tmp/farm-map.json', JSON.stringify(fields.map((f) => [f.cx, f.cz, f.w, f.d, f.yaw, f.crop, f.stage, f.act, f.kind])));
console.log(bad ? 'FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);
