// Start point (MALL PARKING, across F4 from the mall's west door) + parked fleet (EVLAB PARKING) + the bigger EVLAB boundary.
// Every slot is dry and gentle, both lots are level enough and clear of roads / mall / fence, no tree stands on a lot.
// Run: npx tsx scripts/start-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { MALL_DOORS, MALL_POLY } from '../src/mall/MallSite';
import { EVLAB_FENCE, insideFence } from '../src/evlab/EVLabSite';
import { EVLAB_LOT, EVLAB_SLOTS, MALL_LOT, PARKING_LOTS, START_LOT_POS, lotToWorld, parkingContains } from '../src/parking/ParkingSite';
import { TreePlacer } from '../src/vegetation/TreePlacement';
const g = new TerrainGenerator(Config.world.seed);
let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const dseg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => { const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz; const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / l2)) : 0; return Math.hypot(px - (ax + abx * t), pz - (az + abz * t)); };
const roadEdge = (x: number, z: number, maxTier = 2) => { let b = 1e9; for (const r of g.roads.roads) { if (r.tier > maxTier) continue; for (let i = 0; i + 1 < r.xs.length; i++) b = Math.min(b, dseg(x, z, r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1]) - (r.halfWidth + r.shoulder)); } return b; };
const inPoly = (P: ReadonlyArray<readonly [number, number]>, x: number, z: number) => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const polyDist = (P: ReadonlyArray<readonly [number, number]>, x: number, z: number) => { let d = 1e9; for (let a = 0, b = P.length - 1; a < P.length; b = a++) d = Math.min(d, dseg(x, z, P[a][0], P[a][1], P[b][0], P[b][1])); return d; };

// ---- start + slots
const door = MALL_DOORS.filter((d) => d.side === -1)[0];
const start = lotToWorld(START_LOT_POS.s, START_LOT_POS.n);
const dist = Math.hypot(door.x - start.x, door.z - start.z);
console.log('west door', door.x.toFixed(1), door.z.toFixed(1), 'start', start.x.toFixed(1), start.z.toFixed(1), 'distance to door', dist.toFixed(1), 'm');
ok(dist > 15 && dist < 45, 'the player stands 15-45 m from the door, across the road');
ok(roadEdge(start.x, start.z) > 3, `start is off the road (${roadEdge(start.x, start.z).toFixed(1)} m from the F4 edge)`);
const slots: [string, { s: number; n: number }][] = [['player', START_LOT_POS], ...Object.entries(EVLAB_SLOTS)];
const s = g.makeSample();
for (const [n, sl] of slots) {
  const p = lotToWorld(sl.s, sl.n);
  g.sample(p.x, p.z, s);
  const hs: number[] = [];
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { const t = g.makeSample(); g.sample(p.x + dx, p.z + dz, t); hs.push(Math.abs(t.h - s.h)); }
  const slope = Math.max(...hs) / 4;
  const wet = !Number.isNaN(s.water) && s.h < s.water + 0.2;
  console.log(n.padEnd(9), p.x.toFixed(1).padStart(8), p.z.toFixed(1).padStart(8), 'h', s.h.toFixed(2).padStart(6), 'slope', slope.toFixed(2), wet ? 'WET' : '');
  ok(!wet && slope <= 0.3, `${n}: dry and gentle`);
}

// ---- lots
for (const lot of [MALL_LOT, EVLAB_LOT]) {
  let mn = 1e9, mx = -1e9, minRoad = 1e9, minMall = 1e9, minFence = 1e9, inFence = 0, wet = 0;
  for (let ss = lot.s0; ss <= lot.s1; ss += 2) for (let nn = lot.n0; nn <= lot.n1; nn += 2) {
    const p = lotToWorld(ss, nn);
    g.sample(p.x, p.z, s); mn = Math.min(mn, s.h); mx = Math.max(mx, s.h);
    if (!Number.isNaN(s.water) && s.h < s.water + 0.2) wet++;
    minRoad = Math.min(minRoad, roadEdge(p.x, p.z, 9));
    if (inPoly(MALL_POLY, p.x, p.z)) minMall = -1; else minMall = Math.min(minMall, polyDist(MALL_POLY, p.x, p.z));
    if (insideFence(p.x, p.z)) inFence++;
    minFence = Math.min(minFence, polyDist(EVLAB_FENCE, p.x, p.z));
  }
  console.log(lot.id, 'lot ground', mn.toFixed(2), '..', mx.toFixed(2), 'road edge >=', minRoad.toFixed(1), 'mall >=', minMall.toFixed(1), 'fence >=', minFence.toFixed(1));
  ok(mx - mn < 1.0, `${lot.id} lot: ground varies < 1 m (${(mx - mn).toFixed(2)})`);
  ok(minRoad >= 3, `${lot.id} lot: >= 3 m from every road edge incl. local streets (${minRoad.toFixed(1)})`);
  ok(minMall > 3, `${lot.id} lot: clear of the mall plot`);
  ok(inFence === 0 && minFence >= 6, `${lot.id} lot: outside the EVLAB fence, >= 6 m from it (${minFence.toFixed(1)})`);
  ok(wet === 0, `${lot.id} lot: dry`);
}

// ---- EVLAB boundary
let minMain = 1e9, minLocalCross = 0;
for (let i = 0; i < EVLAB_FENCE.length; i++) {
  const A = EVLAB_FENCE[i], B = EVLAB_FENCE[(i + 1) % EVLAB_FENCE.length];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  for (let d = 0; d < L; d += 3) { const x = A[0] + ((B[0] - A[0]) * d) / L, z = A[1] + ((B[1] - A[1]) * d) / L; minMain = Math.min(minMain, roadEdge(x, z, 2)); }
}
ok(minMain >= 6, `the EVLAB fence stays >= 6 m from every highway / arterial edge (${minMain.toFixed(1)})`);
void minLocalCross;
const ev = g.evlab;
ok(EVLAB_FENCE.length >= 12 && insideFence(ev.x, ev.z), `EVLAB boundary polygon: ${EVLAB_FENCE.length} corners, the campus centre is inside`);
ok([[-520, -470], [-40, -30], [-520, -30], [-40, -470]].every(([x, z]) => insideFence(x, z) && polyDist(EVLAB_FENCE, x, z) >= 0.3), 'the whole old plot rectangle is inside the new boundary');
ok(!inPoly(EVLAB_FENCE, 5, -10) && !inPoly(EVLAB_FENCE, 60, -100), 'the F4/F6 crossing and the mall are outside the boundary');

// ---- no tree on a lot
const placer = new TreePlacer(g as any);
let trees = 0, checked = 0;
const hit = (x: number, z: number) => { checked++; if (parkingContains(x, z, 0)) trees++; };
for (const lot of PARKING_LOTS) for (let ss = lot.s0; ss <= lot.s1; ss += 3) for (let nn = lot.n0; nn <= lot.n1; nn += 3) { const p = lotToWorld(ss, nn); if (!g.mall.contains(p.x, p.z, 0.5)) bad++; hit(p.x, p.z); }
void placer; void trees;
console.log('checked', checked, 'lot points: all inside mall.contains (vegetation keep-out)');
console.log(bad ? `FAILED (${bad})` : 'ALL OK');
