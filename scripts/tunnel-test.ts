// Tunnel check (real Rapier, headless): npx tsx scripts/tunnel-test.ts [filter]
//   * every tunnel / box: nothing blocks a ray along each track (and the middle) from 25 m before the portal to 25 m after the other one;
//   * the floor is where the open line has it (design - ballast); walls stand at the lining, the roof is closed;
//   * the hill over a deep tunnel is still solid (the ground ray from above hits the natural ground, not a pit);
//   * a car-sized body driven in at one portal comes out of the other (or gets 60 m in): not stopped at the mouth, not fallen through;
//   * the drawn terrain loses the same triangles (mesh data) and the rail mesh has lamps (glow) inside.
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainPhysics } from '../src/terrain/TerrainPhysics';
import { buildChunkMeshData } from '../src/terrain/TerrainMeshData';
import { RailPhysics } from '../src/rail/RailPhysics';
import { buildRailMesh } from '../src/rail/RailMesh';
import { TunnelHoles, linedSegments, trackEdgesOf, frameAt, TUNNEL, tunnelHeight, roofTopAbove } from '../src/rail/RailTunnel';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { Config } from '../src/core/Config';
import { chunkKey, worldToChunkCoord } from '../src/world/WorldGrid';

const filter = process.argv[2] ?? '';
let bad = 0;
const fail = (m: string): void => {
  bad++;
  console.log('FAIL', m);
};
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const edges = trackEdgesOf(rail);
const segs = linedSegments(rail).filter((L) => !filter || edges[L.edge].id.includes(filter));
console.log(`${segs.length} lined segments`);

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER;
const origin = new FloatingOrigin(new THREE.Group(), bus);
const holes = new TunnelHoles(rail);
const tp = new TerrainPhysics(physics, origin, bus, holes);
const rp = new RailPhysics(physics, origin, rail);
const S = Config.world.chunkSize;

const loaded = new Set<string>();
const meshCache = new Map<string, ReturnType<typeof buildChunkMeshData>>();
function ensureChunks(x: number, z: number, r: number): void {
  const a = worldToChunkCoord(x - r, z - r);
  const b = worldToChunkCoord(x + r, z + r);
  for (let cz = a.cz; cz <= b.cz; cz++) {
    for (let cx = a.cx; cx <= b.cx; cx++) {
      const key = chunkKey(cx, cz);
      if (loaded.has(key)) continue;
      loaded.add(key);
      let m = meshCache.get(key);
      if (!m) {
        m = buildChunkMeshData(gen, cx, cz, Config.lod.vertsPerSide[0], 16, 0);
        meshCache.set(key, m);
      }
      bus.emit('chunk:loaded', { key, cx, cz, lod: 0, vertsPerSide: Config.lod.vertsPerSide[0], heights: m.heights });
    }
  }
}
function focus(x: number, z: number): void {
  ensureChunks(x, z, 420);
  tp.update(0.25, x, z);
  rp.update(0.25, x, z);
  physics.step();
}
const ray = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): { t: number; c?: any } | null => {
  const h = physics.world.castRay(new R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), len, false);
  return h ? { t: h.timeOfImpact, c: h.collider } : null;
};

for (const L of segs) {
  const e = edges[L.edge];
  const name = `${e.id} ${L.kind} ${L.s0.toFixed(0)}..${L.s1.toFixed(0)}`;
  const H = tunnelHeight(L.kind);
  let blocked = 0, floorOff = 0, wallMiss = 0, roofOpen = 0, hillBad = 0, hillChecked = 0, floorChecked = 0;
  let firstBlock = '';
  const from = L.s0 - 25, to = L.s1 + 25;
  for (let s = from; s < to; s += 10) {
    const f = frameAt(rail, e, Math.max(0, Math.min(e.length, s)));
    focus(f.x, f.z);
    const f2 = frameAt(rail, e, Math.max(0, Math.min(e.length, s + 10)));
    const len = Math.hypot(f2.x - f.x, f2.z - f.z, f2.y - f.y) || 10;
    const dx = (f2.x - f.x) / len, dy = (f2.y - f.y) / len, dz = (f2.z - f.z) / len;
    const wx = -f.dz, wz = f.dx;
    const inside = s >= L.s0 && s <= L.s1;
    // 1. nothing blocks the tracks (and the middle), at three heights
    for (const lat of [-D.trackSpacing / 2, 0, D.trackSpacing / 2]) {
      for (const h of [0.8, 3.0, Math.min(5.0, H - 0.5)]) {
        if (!inside && h > 3.5) continue; // open line before the portal: natural slopes may rise there
        const hit = ray(f.x + wx * lat, f.y - D.ballast + h, f.z + wz * lat, dx, dy, dz, len - 0.05);
        if (hit) {
          blocked++;
          if (!firstBlock) { const c = hit.c; const tr = c.translation(); const he = c.halfExtents?.(); firstBlock = `s=${s.toFixed(0)} lat=${lat} h=${h} hit at ${hit.t.toFixed(2)} m shape=${c.shape.type} pos=(${(tr.x + origin.origin.x).toFixed(1)},${tr.y.toFixed(1)},${(tr.z + origin.origin.z).toFixed(1)}) half=${he ? [he.x, he.y, he.z].map((v: number) => v.toFixed(1)).join(',') : '-'}`; }
        }
      }
    }
    // 2. floor under the middle = formation level
    if (s >= L.s0 - 6 && s <= L.s1 + 6) {
      const hit = ray(f.x, f.y + 2.5, f.z, 0, -1, 0, 10);
      floorChecked++;
      if (!hit || Math.abs(f.y + 2.5 - hit.t - (f.y - D.ballast)) > (inside ? 0.15 : 0.5)) { floorOff++; console.log("  floor s", (s - L.s0).toFixed(1), (s - L.s1).toFixed(1), hit ? (f.y + 2.5 - hit.t - (f.y - D.ballast)).toFixed(2) : "none"); }
    }
    if (!inside || s < L.s0 + 4 || s > L.s1 - 4) continue;
    // the player's ground safety-net must know it is inside
    if (inside && s >= L.s0 + 2 && s <= L.s1 - 2 && !holes.contains(f.x, f.y + 1, f.z)) { fail(`${name}: holes.contains false inside at s=${s.toFixed(0)}`); }
    if (inside && s >= L.s0 + 2 && s <= L.s1 - 2 && holes.contains(f.x, f.y + 40, f.z) && f.gnd - f.y > 60) { fail(`${name}: holes.contains true 40 m up on the hill`); }
    // 3. walls both sides and a closed roof
    for (const sg of [-1, 1]) {
      const hit = ray(f.x, f.y + 2, f.z, wx * sg, 0, wz * sg, 9);
      if (!hit || Math.abs(hit.t - TUNNEL.inHalf) > 0.15) wallMiss++;
    }
    {
      const hit = ray(f.x, f.y + 1, f.z, 0, 1, 0, 40);
      const want = H - 1;
      if (!hit || Math.abs(hit.t - want) > 0.2) { roofOpen++; if (roofOpen < 3) console.log('  roof s', s, 'hit', hit?.t, 'want', want - f.y); }
    }
    // 4. a deep hill above stays solid (the ground over the tunnel is where the terrain function says)
    if (f.gnd - f.y > roofTopAbove(L.kind) + 6) {
      hillChecked++;
      const gy = gen.heightAt(f.x, f.z);
      const hit = ray(f.x, gy + 400, f.z, 0, -1, 0, 800);
      if (!hit || Math.abs(gy + 400 - hit.t - gy) > 1.0) hillBad++;
    }
  }
  const tag = blocked || floorOff || wallMiss || roofOpen || hillBad ? 'FAIL' : 'ok  ';
  console.log(`${tag} ${name}: blocked rays ${blocked}, floor off ${floorOff}/${floorChecked}, wall misses ${wallMiss}, open roof ${roofOpen}, hill not solid ${hillBad}/${hillChecked}${firstBlock ? ' (first: ' + firstBlock + ')' : ''}`);
  if (tag === 'FAIL') bad++;

  // 5. drive a car-sized body through, from each end
  for (const dir of [1, -1] as const) {
    const sStart = dir === 1 ? L.s0 - 25 : L.s1 + 25;
    const sGoal = dir === 1 ? Math.min(L.s1 + 20, L.s0 + 90) : Math.max(L.s0 - 20, L.s1 - 90);
    const f = frameAt(rail, e, Math.max(0, Math.min(e.length, sStart)));
    focus(f.x, f.z);
    const yaw = Math.atan2(f.dx * dir, f.dz * dir);
    const body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(f.x - origin.origin.x, f.y - D.ballast + 1.2, f.z - origin.origin.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setCcdEnabled(true),
    );
    physics.world.createCollider(R.ColliderDesc.cuboid(1.0, 0.7, 2.3).setDensity(300).setFriction(0.2), body);
    let sNow = sStart;
    for (let step = 0; step < 900; step++) {
      const t = body.translation();
      const pf = frameAt(rail, e, Math.max(0, Math.min(e.length, sNow)));
      // steer along the centre line (like a driver would): aim at the point 6 m ahead
      const ah = frameAt(rail, e, Math.max(0, Math.min(e.length, sNow + dir * 6)));
      const vx = ah.x - (t.x + origin.origin.x), vz = ah.z - (t.z + origin.origin.z);
      const vl = Math.hypot(vx, vz) || 1;
      const lv = body.linvel();
      body.setLinvel({ x: (vx / vl) * 9, y: lv.y, z: (vz / vl) * 9 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      physics.step();
      // progress along the line = nearest s ahead
      let best = sNow, bd = Infinity;
      for (let q = sNow - 3; q <= sNow + 12; q += 1) {
        const p = frameAt(rail, e, Math.max(0, Math.min(e.length, q)));
        const d = Math.hypot(p.x - (t.x + origin.origin.x), p.z - (t.z + origin.origin.z));
        if (d < bd) { bd = d; best = q; }
      }
      sNow = best;
      if (step % 15 === 0) focus(t.x + origin.origin.x, t.z + origin.origin.z);
      if ((dir === 1 && sNow >= sGoal) || (dir === -1 && sNow <= sGoal)) break;
      void pf;
    }
    const t = body.translation();
    const pf = frameAt(rail, e, Math.max(0, Math.min(e.length, sNow)));
    const reached = dir === 1 ? sNow >= sGoal - 1 : sNow <= sGoal + 1;
    const dyFloor = t.y - (pf.y - D.ballast);
    const okDrive = reached && dyFloor > 0.2 && dyFloor < 3;
    console.log(`${okDrive ? 'ok  ' : 'FAIL'}   drive ${dir === 1 ? 'in at start' : 'in at end  '}: reached s=${sNow.toFixed(0)} goal ${sGoal.toFixed(0)}, height over floor ${dyFloor.toFixed(2)}`);
    if (!okDrive) bad++;
    physics.world.removeRigidBody(body);
  }
}

// 6. drawn side: the terrain mesh loses triangles, the rail mesh has lit lining
{
  let holeChunks = 0, glowVerts = 0, lampVerts = 0;
  for (const L of segs.slice(0, 3)) {
    const e = edges[L.edge];
    const f = frameAt(rail, e, L.portalA ? L.s0 + 2 : L.s1 - 2);
    const { cx, cz } = worldToChunkCoord(f.x, f.z);
    const m = buildChunkMeshData(gen, cx, cz, Config.lod.vertsPerSide[0], 16, 0);
    if (m.holeIndices) holeChunks++;
    const r = buildRailMesh(rail, cx, cz, 0, (x, z) => gen.heightAt(x, z));
    if (r) for (const g of r.glow) { if (g > 0) glowVerts++; if (g >= 1) lampVerts++; }
  }
  console.log(`drawn: ${holeChunks} chunks with a terrain hole, ${glowVerts} lit vertices, ${lampVerts} lamp vertices`);
  if (segs.length && (holeChunks === 0 || glowVerts === 0 || lampVerts === 0)) fail('no hole / lining / lamps in the drawn chunks');
}

console.log(bad ? `\n${bad} FAILED` : '\nall tunnel checks passed');
process.exit(bad ? 1 : 0);
