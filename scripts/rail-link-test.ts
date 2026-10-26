// Step 4: the decks of the elevated station links have colliders, and their height is the designed level.
//   Layer 1 (always runs, needs no Rapier / three): rays are cast analytically onto the exact cuboids RailPhysics gives to Rapier
//           (RailPhysics is run with a recording builder instead of a real world).
//   Layer 2 (runs when `three` and Rapier are installed): the same rays are cast in a REAL Rapier world through RailPhysics.update().
// npx tsx scripts/rail-link-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RailPhysics } from '../src/rail/RailPhysics';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;

interface WBox { x: number; y: number; z: number; hx: number; hy: number; hz: number; q: { x: number; y: number; z: number; w: number } }
const rp: any = new RailPhysics({} as never, { origin: { x: 0, z: 0 } } as never, rail);

// 1. item bookkeeping: lines' viaduct pieces + platforms are what existed before; each elevated link adds ceil(length / 120) pieces
const elevated = rail.links.filter((l) => l.elevated);
const linkPieces = elevated.reduce((n, l) => n + Math.max(1, Math.ceil(l.edge.length / 120)), 0);
let before = 0;
for (const e of rail.edges) for (const sg of e.segments) if (sg.kind === 'bridge') before += Math.max(1, Math.ceil((sg.s1 - sg.s0) / 120));
for (const st of rail.stations) before += st.arrivals.length;
console.log(`collider pieces: ${rp.items.length} (${before} for lines / platforms as before, ${linkPieces} new for ${elevated.length} elevated links; ${rail.links.length - elevated.length} ground link needs none - the terrain collider holds it)`);
if (rp.items.length !== before + linkPieces) fail(`expected ${before + linkPieces} collider pieces, found ${rp.items.length}`);

const boxes: WBox[] = [];
for (const it of rp.items) {
  it.fill({ box: (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: WBox['q']) => boxes.push({ x: it.x + cx, y: cy, z: it.z + cz, hx, hy, hz, q }) });
}

// 2. analytic downward ray against an oriented cuboid
function rot(q: WBox['q'], v: number[], inv: boolean): number[] {
  const u = inv ? [-q.x, -q.y, -q.z] : [q.x, q.y, q.z];
  const c1 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const c2 = [u[1] * c1[2] - u[2] * c1[1], u[2] * c1[0] - u[0] * c1[2], u[0] * c1[1] - u[1] * c1[0]];
  return [v[0] + 2 * q.w * c1[0] + 2 * c2[0], v[1] + 2 * q.w * c1[1] + 2 * c2[1], v[2] + 2 * q.w * c1[2] + 2 * c2[2]];
}
function rayDown(x: number, y: number, z: number): { top: number } | null {
  let best: number | null = null;
  for (const b of boxes) {
    if (Math.abs(b.x - x) > 40 || Math.abs(b.z - z) > 40) continue;
    const o = rot(b.q, [x - b.x, y - b.y, z - b.z], true);
    const d = rot(b.q, [0, -1, 0], true);
    let t0 = 0, t1 = Infinity;
    const h = [b.hx, b.hy, b.hz];
    let miss = false;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (Math.abs(o[a]) > h[a]) { miss = true; break; } continue; }
      const ta = (-h[a] - o[a]) / d[a], tb = (h[a] - o[a]) / d[a];
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (miss || t1 < t0) continue;
    const hitY = y - t0;
    if (best === null || hitY > best) best = hitY;
  }
  return best === null ? null : { top: best };
}

const half = D.trackSpacing / 2;
const lateral = [-8.5, -half, 0, half, 8.5];
let ok = 0, blocked = 0, total = 0, worst = 0, edgeTotal = 0, edgeGaps = 0;
for (const l of elevated) {
  const e = l.edge;
  for (let s = 3; s <= e.length - 3; s += 3) {
    const p = rail.pointAt(e, s);
    const wx = -p.dz, wz = p.dx;
    for (const lat of lateral) {
      const edge = Math.abs(lat) > 8;
      if (edge) edgeTotal++; else total++;
      const h = rayDown(p.x + wx * lat, l.level + 6, p.z + wz * lat);
      // the deck is built from straight 10 m chords: on the OUTER edge of a curve a thin wedge between two chords stays open
      if (!h && edge) { edgeGaps++; continue; }
      if (!h) { fail(`link ${l.id}: no collider under the deck at s=${s} m, lateral ${lat} m`); continue; }
      const err = Math.abs(h.top - l.level);
      if (err <= 0.02) { if (!edge) ok++; worst = Math.max(worst, err); } else if (Math.abs(h.top - (l.level + 1.0)) <= 0.02) { if (!edge) blocked++; }
      else fail(`link ${l.id}: collider top ${h.top.toFixed(3)} at s=${s} m, lateral ${lat} m (designed level ${l.level.toFixed(3)})`);
    }
  }
}
console.log(`analytic rays on the track area (lateral -2.25 / 0 / +2.25 m): ${total} on ${elevated.length} link decks, ${ok} hit the deck at the designed level, ${blocked} land on the parapet of a crossing link's deck (level + 1.0 m); worst height error ${(worst * 1000).toFixed(1)} mm`);
console.log(`deck edge (8.5 m from the centre line): ${edgeTotal} rays, ${edgeGaps} fall into a chord wedge on the outer side of a curve (${(100 * edgeGaps / edgeTotal).toFixed(1)} %)`);
if (ok + blocked !== total) fail('some track-area rays hit nothing at all');
if (blocked > total * 0.02) fail('too many track-area rays are blocked by a neighbouring deck parapet');
if (edgeGaps > edgeTotal * 0.05) fail('too many gaps at the deck edge');
// the ground link has no deck piece
for (const l of rail.links.filter((q) => !q.elevated)) {
  const p = rail.pointAt(l.edge, l.edge.length / 2);
  const h = rayDown(p.x, l.level + 6, p.z);
  if (h && h.top > l.level - 0.5) fail(`ground link ${l.id}: unexpected deck collider at ${h.top.toFixed(2)} m`);
}

// 3. real Rapier world (when installed)
let three: any = null, mods: any = null;
try {
  three = await import('three');
  mods = {
    bus: await import('../src/core/EventBus'),
    pw: await import('../src/physics/PhysicsWorld'),
    fo: await import('../src/world/FloatingOrigin'),
  };
} catch (e) {
  console.log(`(info) real Rapier layer skipped: ${(e as Error).message.split('\n')[0]}`);
}
if (three && mods) {
  const bus = new mods.bus.EventBus();
  const physics = await mods.pw.PhysicsWorld.create(bus);
  const origin = new mods.fo.FloatingOrigin(new three.Group(), bus);
  const real = new RailPhysics(physics, origin, rail);
  const R = physics.RAPIER;
  let n = 0, hit = 0;
  for (const l of elevated) {
    const mid = rail.pointAt(l.edge, l.edge.length / 2);
    real.update(1, mid.x, mid.z);
    physics.step();
    for (const s of [6, l.edge.length / 2, l.edge.length - 6]) {
      const p = rail.pointAt(l.edge, s);
      for (const lat of [-half, 0, half]) {
        n++;
        const x = p.x + -p.dz * lat, z = p.z + p.dx * lat;
        const h = physics.world.castRay(new R.Ray({ x: x - origin.origin.x, y: l.level + 6, z: z - origin.origin.z }, { x: 0, y: -1, z: 0 }), 20, true);
        if (!h) { fail(`real Rapier: no hit on ${l.id} at s=${s.toFixed(0)} lateral ${lat}`); continue; }
        const top = l.level + 6 - h.timeOfImpact;
        if (Math.abs(top - l.level) <= 0.02) hit++;
        else if (Math.abs(top - (l.level + 1.0)) > 0.02) fail(`real Rapier: ${l.id} top ${top.toFixed(3)} (designed ${l.level.toFixed(3)})`);
      }
    }
    real.dispose();
  }
  console.log(`real Rapier rays: ${n}, ${hit} hit the deck at the designed level`);
}

console.log(bad ? `${bad} FAILURES` : 'RAIL LINK COLLIDERS OK');
process.exit(bad ? 1 : 0);
