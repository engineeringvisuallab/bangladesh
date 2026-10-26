// Headless City Mall test (ONE open 14 m glass hall that follows the roads): flat pad on the bent plot, no trees / roads on it, the outline is NOT a
// rectangle and hugs the roads, glass curtain wall all round (solid, 2 doorways), no walls / upper floor / ramp inside, the products stand openly in
// 12 category ZONES (8 food in the west, 4 fashion in the east) either side of a free aisle, walkers get through the doors, cross the hall along
// the aisle and can reach every product's viewing spot.
// npx tsx scripts/mall-test.ts
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { MALL_SIZE, MALL_PLOT, MALL_POLY, MALL_BUILDING, MALL_BUILDING_LOCAL, MALL_DOORS, MALL_POS, mallToWorld } from '../src/mall/MallSite';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { CityPlan } from '../src/city/CityPlan';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

// tiny canvas stub so MallBuilder can run without a browser
const ctxStub: any = new Proxy({ canvas: { width: 1024, height: 256 } }, { get: (t: any, k) => (k in t ? t[k] : () => ({ width: 10 })), set: () => true });
(globalThis as any).location = { href: 'http://localhost/' };
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { buildMall } = await import('../src/mall/MallBuilder');
const { loadCatalog } = await import('../src/mall/MallCatalog');

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const gen = new TerrainGenerator(Config.world.seed);
const m = gen.mall;
console.log('mall at', m.x, m.z, 'yaw', m.yaw, 'floorY', m.floorY.toFixed(2));

const polyHas = (P: ReadonlyArray<readonly [number, number]>, x: number, z: number) => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const inPoly = (x: number, z: number) => polyHas(MALL_POLY, x, z);
const dseg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => { const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz; const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / l2)) : 0; return Math.hypot(px - (ax + abx * t), pz - (az + abz * t)); };
const polyArea = (P: ReadonlyArray<readonly [number, number]>) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
/** distance from a point to the nearest main road EDGE (centreline minus half width + shoulder) or to the rail centreline - 6 m */
const roadClear = (x: number, z: number) => {
  let best = 1e9;
  for (const r of gen.roads.roads) { if (r.tier > 2) continue; for (let i = 0; i + 1 < r.xs.length; i++) best = Math.min(best, dseg(x, z, r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1]) - (r.halfWidth + r.shoulder)); }
  for (const e of gen.rail.edges) for (let i = 0; i + 1 < e.xs.length; i++) best = Math.min(best, dseg(x, z, e.xs[i], e.zs[i], e.xs[i + 1], e.zs[i + 1]) - 6);
  return best;
};

// 1. flat pad under the whole plot polygon
let mn = 1e9, mx = -1e9, cnt = 0;
for (let x = MALL_PLOT.x0; x <= MALL_PLOT.x1; x += 2) for (let z = MALL_PLOT.z0; z <= MALL_PLOT.z1; z += 2) { if (!inPoly(x, z)) continue; cnt++; const h = gen.heightAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(mx - mn < 0.001, `terrain under the whole mall plot (${cnt} samples, bent wedge) is perfectly flat (range ${(mx - mn).toFixed(4)} m)`);
ok(Math.abs(mx - (m.floorY - 0.03)) < 0.001, 'pad is 3 cm below the floor tiles');

// 2. the building outline: inside the plot, NOT a rectangle, hugs the roads, never on a road
let outV = 0, minApron = 1e9;
for (const [x, z] of MALL_BUILDING) { if (!inPoly(x, z)) outV++; }
for (let i = 0; i < MALL_BUILDING.length; i++) { const A = MALL_BUILDING[i], B = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; for (let t = 0; t <= 1; t += 0.05) { const x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t; if (!inPoly(x, z)) outV++; else { let d = 1e9; for (let a = 0, b = MALL_POLY.length - 1; a < MALL_POLY.length; b = a++) d = Math.min(d, dseg(x, z, MALL_POLY[a][0], MALL_POLY[a][1], MALL_POLY[b][0], MALL_POLY[b][1])); minApron = Math.min(minApron, d); } } }
ok(outV === 0, `the whole building outline lies inside the plot (apron >= ${minApron.toFixed(1)} m)`);
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
for (const [x, z] of MALL_BUILDING) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
const fill = polyArea(MALL_BUILDING) / ((bx1 - bx0) * (bz1 - bz0));
const axisAligned = MALL_BUILDING.length <= 4 && MALL_BUILDING.every((p, i) => { const q = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; return Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01; });
ok(MALL_BUILDING.length >= 8 && !axisAligned && fill < 0.9, `the building is not a rectangle: ${MALL_BUILDING.length} corners, fills ${(fill * 100).toFixed(0)}% of its bounding box`);
let hug = 0, tot = 0, minRoad = 1e9;
for (let i = 0; i < MALL_BUILDING.length; i++) { const A = MALL_BUILDING[i], B = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; const L = Math.hypot(B[0] - A[0], B[1] - A[1]); for (let d = 0; d < L; d += 2) { const x = A[0] + ((B[0] - A[0]) * d) / L, z = A[1] + ((B[1] - A[1]) * d) / L; const c = roadClear(x, z); tot++; minRoad = Math.min(minRoad, c); if (c < 14) hug++; } }
ok(hug / tot > 0.5, `the outline follows the roads: ${(100 * hug / tot).toFixed(0)}% of the wall is within 14 m of a road edge / the viaduct`);
ok(minRoad >= 5, `the glass wall keeps >= 5 m from every road edge and from the viaduct (closest ${minRoad.toFixed(1)} m)`);
// the block (96 x 64) fits inside the outline with room to spare
let blockOut = 0, blockMin = 1e9;
for (let i = 0; i <= 24; i++) for (const [u, v] of [[-1, -1 + i / 12], [1, -1 + i / 12], [-1 + i / 12, -1], [-1 + i / 12, 1]]) {
  const w = mallToWorld((u * MALL_SIZE.W) / 2, (v * MALL_SIZE.D) / 2);
  if (!polyHas(MALL_BUILDING, w.x, w.z)) blockOut++;
  else { let d = 1e9; for (let a = 0, b = MALL_BUILDING.length - 1; a < MALL_BUILDING.length; b = a++) d = Math.min(d, dseg(w.x, w.z, MALL_BUILDING[a][0], MALL_BUILDING[a][1], MALL_BUILDING[b][0], MALL_BUILDING[b][1])); blockMin = Math.min(blockMin, d); }
}
ok(blockOut === 0 && blockMin > 1.5, `the shopping block lies inside the glass outline with ${blockMin.toFixed(1)} m to spare`);
ok(m.inside(MALL_POS.x, MALL_POS.z) && !m.inside(0, 0) && !m.inside(MALL_BUILDING[0][0] - 8, MALL_BUILDING[0][1]), 'MallSite.inside follows the bent outline (centre in, spawn out)');

// 3. blend to natural ground is gentle and does not touch the roads
let maxSlope = 0;
for (let x = MALL_PLOT.x0 - 30; x <= MALL_PLOT.x1 + 30; x += 1) for (let z = MALL_PLOT.z0 - 30; z <= MALL_PLOT.z1 + 30; z += 1) {
  if (gen.roads.surfaceAt(x, z) !== 0 || gen.roads.surfaceAt(x + 1, z + 1) !== 0) continue;
  const h = gen.heightAt(x, z);
  maxSlope = Math.max(maxSlope, Math.abs(gen.heightAt(x + 1, z) - h), Math.abs(gen.heightAt(x, z + 1) - h));
}
ok(maxSlope < 0.35, `no steep step around the pad (the plot edge is only ~4 m from the road shoulder, so the blend is short there) (max ${maxSlope.toFixed(3)} m per m)`);
let roadHits = 0;
for (let x = MALL_PLOT.x0 - 2; x <= MALL_PLOT.x1 + 2; x += 2) for (let z = MALL_PLOT.z0 - 2; z <= MALL_PLOT.z1 + 2; z += 2) if (inPoly(x, z) && gen.roads.surfaceAt(x, z) !== 0) roadHits++;
ok(roadHits === 0, `no road surface on the mall plot (${roadHits} hits)`);
let roadPts = 0;
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) if (m.near(r.xs[i], r.zs[i]) && Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]) > 0.02) roadPts++;
ok(roadPts === 0, 'roads keep their own height where they meet the pad skirt');
ok(Math.hypot(m.x, m.z) < 220, 'mall is close to the spawn point (' + Math.hypot(m.x, m.z).toFixed(0) + ' m)');
ok(m.x > 0 && m.x < 200 && m.z < 0, 'the mall stands in the corner between F4 (west), F7 (south) and the viaduct (east)');
const near = MALL_DOORS.reduce((a, b) => (Math.hypot(a.x, a.z) <= Math.hypot(b.x, b.z) ? a : b));
ok(near.side === -1, 'the doorway nearest to the spawn is the west one');

// 4. no trees on the plot
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
let onPlot = 0, total = 0;
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) {
  const d = trees.place(cx, cz);
  const ox = cx * Config.world.chunkSize, oz = cz * Config.world.chunkSize;
  for (const arr of d) {
    for (let i = 0; i + 2 < arr.length; i += 6) { total++; if (m.contains(arr[i] + ox, arr[i + 2] + oz)) onPlot++; }
  }
}
console.log('trees checked:', total);
ok(onPlot === 0, 'no tree stands on the mall plot');

// 5. mall build: one empty hall
const cat = await loadCatalog();
const mall = buildMall(cat);
ok(mall.shops.length === 12 && mall.items.length === 36, `12 zones, 36 products (${mall.shops.length} zones, ${mall.items.length} products)`);
ok(mall.floors.length === 1, 'one floor (the old two storeys are one 14 m hall)');
ok(mall.pickables.length >= 36, 'products are pickable');
ok(mall.shops.filter((z) => z.floor === 0).length === 8 && mall.shops.filter((z) => z.floor === 1).length === 4, 'zones: 8 food + 4 fashion');
ok(mall.shops.filter((z) => z.floor === 0).every((z) => z.viewPos.x < 0) && mall.shops.filter((z) => z.floor === 1).every((z) => z.viewPos.x > 0), 'food zones in the west, fashion zones in the east');
ok(mall.ramps.length === 0 && mall.rampRails.length === 0, 'no ramp');
ok(mall.solids.every((q) => q.minY >= 14 - 1e-6 || q.maxY <= 2.5), 'no walls inside: every solid is the roof or a low pedestal / counter / post (<= 2.5 m)');
ok(mall.items.every((it) => Math.abs(it.viewPos.z) > 8), 'the aisle |z| < 8 is free: every viewing spot lies beside it');
ok(mall.obbs.length >= MALL_BUILDING.length, `glass curtain wall: ${mall.obbs.length} wall pieces round ${MALL_BUILDING.length} corners`);
ok(mall.obbs.filter((o) => o.y0 === 0 && o.y1 === 14).length >= MALL_BUILDING.length && mall.obbs.filter((o) => o.y0 === 5).length === 2, 'walls are 14 m high, with a doorway lintel at each of the 2 entrances');
ok(mall.meshSolids.length >= 8, `${mall.meshSolids.length} floor / roof pieces around the block`);

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER, W = physics.world;
const body = W.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
const HX = MALL_SIZE.W / 2;
for (const s of mall.solids) W.createCollider(R.ColliderDesc.cuboid((s.maxX - s.minX) / 2, (s.maxY - s.minY) / 2, (s.maxZ - s.minZ) / 2).setTranslation((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2), body);
for (const r of mall.ramps) {
  const dx = r.x1 - r.x0, dy = r.y1 - r.y0, len = Math.hypot(dx, dy), ang = Math.atan(dy / dx);
  W.createCollider(R.ColliderDesc.cuboid(len / 2, r.thick / 2, r.width / 2).setTranslation((r.x0 + r.x1) / 2 + Math.sin(ang) * r.thick / 2, (r.y0 + r.y1) / 2 - Math.cos(ang) * r.thick / 2, r.zc).setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }), body);
}
for (const r of mall.rampRails) W.createCollider(R.ColliderDesc.cuboid(r.hx, r.hy, r.hz).setTranslation(r.cx, r.cy, r.cz).setRotation({ x: 0, y: 0, z: Math.sin(r.rotZ / 2), w: Math.cos(r.rotZ / 2) }), body);
for (const o of mall.obbs) W.createCollider(R.ColliderDesc.cuboid(o.hx, (o.y1 - o.y0) / 2, o.hz).setTranslation(o.cx, (o.y0 + o.y1) / 2, o.cz).setRotation({ x: 0, y: Math.sin(o.rot / 2), z: 0, w: Math.cos(o.rot / 2) }), body);
for (const t of mall.meshSolids) W.createCollider(R.ColliderDesc.trimesh(t.vertices, t.indices), body);
W.createCollider(R.ColliderDesc.cuboid(MALL_SIZE.W / 2 + 0.5, 0.5, MALL_SIZE.D / 2 + 0.5).setTranslation(0, -0.5, 0), body);
W.createCollider(R.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(1), body); // the paved plaza / ground around the mall
W.step();

// a real walker: same character controller settings as Player.ts
const P = Config.player, HALFH = P.height / 2;
const walker = W.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
const col = W.createCollider(R.ColliderDesc.capsule(HALFH - P.radius, P.radius), walker);
const cc = W.createCharacterController(0.02);
cc.setUp({ x: 0, y: 1, z: 0 }); cc.setSlideEnabled(true); cc.enableAutostep(P.stepHeight, 0.2, false); cc.enableSnapToGround(0.5);
cc.setMaxSlopeClimbAngle((P.maxSlopeDeg * Math.PI) / 180); cc.setMinSlopeSlideAngle(((P.maxSlopeDeg + 5) * Math.PI) / 180);
const pos = { x: 0, y: 0, z: 0 };
const put = (x: number, floorY: number, z: number) => { pos.x = x; pos.z = z; pos.y = floorY + HALFH + 0.05; walker.setNextKinematicTranslation(pos); W.step(); };
const walk = (tx: number, tz: number, steps = 4000, speed = 0.07) => {
  for (let i = 0; i < steps; i++) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) break;
    const k = Math.min(speed, d) / d;
    cc.computeColliderMovement(col, { x: dx * k, y: -0.1, z: dz * k });
    const mv = cc.computedMovement();
    pos.x += mv.x; pos.y += mv.y; pos.z += mv.z;
    walker.setNextKinematicTranslation(pos); W.step();
  }
};
const feet = () => pos.y - HALFH;

// 6. the glass wall is solid all the way round (except the 2 doorways): from 3 m outside, a ray at eye height hits it within ~3 m
let leaks = 0, tested = 0;
for (let i = 0; i < MALL_BUILDING_LOCAL.length; i++) {
  const A = MALL_BUILDING_LOCAL[i], B = MALL_BUILDING_LOCAL[(i + 1) % MALL_BUILDING_LOCAL.length];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  let nx = -uz, nz = ux; if (nx * (A[0] + B[0]) + nz * (A[1] + B[1]) < 0) { nx = -nx; nz = -nz; }
  for (const f of [0.15, 0.5, 0.85]) {
    const px = A[0] + (B[0] - A[0]) * f, pz = A[1] + (B[1] - A[1]) * f;
    if (MALL_DOORS.some((d) => Math.hypot(px - d.lx, pz) < 7)) continue;
    tested++;
    const hit = W.castRay(new R.Ray({ x: px + nx * 3, y: 1.5, z: pz + nz * 3 }, { x: -nx, y: 0, z: -nz }), 10, true);
    if (!hit || hit.timeOfImpact > 3.5) leaks++;
  }
}
ok(leaks === 0 && tested > 30, `no gap in the glass wall (${tested} rays from outside, ${leaks} got through)`);
const roofHit = W.castRay(new R.Ray({ x: -50, y: 40, z: 0 }, { x: 0, y: -1, z: 0 }), 60, true);
ok(!!roofHit && Math.abs(40 - roofHit.timeOfImpact - 14.4) < 0.15, 'the roof also covers the concourse round the block (y = 14.4)');
const roofHit2 = W.castRay(new R.Ray({ x: 30, y: 40, z: 0 }, { x: 0, y: -1, z: 0 }), 60, true);
ok(!!roofHit2 && Math.abs(40 - roofHit2.timeOfImpact - 14.4) < 0.15, 'the roof covers the east half too');

// 7. doors: from the plaza through the east glass doorway, the east end doorway, across the whole ground floor, out through the west doors
const east = MALL_DOORS[1], west = MALL_DOORS[0];
put(east.lx + 6, 0, 0);
walk(HX - 4, 0);
ok(Math.abs(pos.x - (HX - 4)) < 0.3, 'a walker gets in through the east glass doorway and the 10 m east door');
walk(-HX + 4, -5);
ok(pos.x < -HX + 6, 'a walker can cross the whole ground floor');
walk(west.lx - 3, 0);
ok(pos.x < west.lx - 2, `and leave through the west doors out to the plaza (x = ${pos.x.toFixed(1)})`);
// glass wall beside the east doorway: find where z = 20 meets the outline (east side)
let xe20 = 1e9;
for (let i = 0; i < MALL_BUILDING_LOCAL.length; i++) { const A = MALL_BUILDING_LOCAL[i], B = MALL_BUILDING_LOCAL[(i + 1) % MALL_BUILDING_LOCAL.length]; if ((A[1] > 20) === (B[1] > 20)) continue; const x = A[0] + ((20 - A[1]) / (B[1] - A[1])) * (B[0] - A[0]); if (x > HX && x < xe20) xe20 = x; }
put(HX + 2, 0, 20); walk(HX + 12, 20, 400);
ok(pos.x < xe20 - 0.1 && pos.x > HX + 1, `the glass wall stops a walker (wall at x = ${xe20.toFixed(1)}, stopped at ${pos.x.toFixed(2)})`);

// 8. open hall: a walker crosses it from the west end to the east end along the aisle (z = 0) on the flat floor
put(-HX + 4, 0, 0); walk(HX - 4, 0);
ok(Math.abs(pos.x - (HX - 4)) < 0.3 && Math.abs(feet()) < 0.2, 'a walker crosses the whole hall along the aisle');
// 9. every product has a reachable viewing spot (walk in from the aisle edge)
let noView = 0;
for (const it of mall.items) {
  const sg = it.yaw > 1 ? 1 : -1;
  put(it.viewPos.x, 0, sg * 6);
  walk(it.viewPos.x, it.viewPos.z, 800);
  if (Math.hypot(pos.x - it.viewPos.x, pos.z - it.viewPos.z) > 0.6) noView++;
}
ok(noView === 0, `all ${mall.items.length} products have a reachable viewing spot (${noView} unreachable)`);
ok(mall.surfaceAt(-20, 10, 1) === 0 && mall.surfaceAt(20, -10, 1) === 0, 'viewer surfaceAt: flat floor everywhere');
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
