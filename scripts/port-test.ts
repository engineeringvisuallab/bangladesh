// Stage 14 check: the sea port. Decks are flat and dry and keep clear of the roads, the roads are untouched, the berths are dredged to their design
// depth, the breakwater is above the sea, every structure stands on its deck, the mesh of every port chunk is valid, the colliders are consistent.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { BERTHS, BREAKWATERS, OIL, PLATFORMS, PORT_DESIGN, LATTICE, QUAY_WALLS } from '../src/port/PortPlan';
import { getPortLayout } from '../src/port/PortLayout';
import { buildPortMesh } from '../src/port/PortMesh';
import { solidParts } from '../src/port/PortPhysics';
import { SEAPORT, getWorldZoneAt } from '../src/city/WorldZones';
import { bn } from '../src/i18n/bn';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample();
const D = PORT_DESIGN;

// 1. platforms: flat at their level, dry, on the lattice, >= 40 m from every road
for (const p of PLATFORMS) {
  for (const v of [p.x0, p.x1, p.z0, p.z1]) if (Math.abs(((v + 5000) / LATTICE) - Math.round((v + 5000) / LATTICE)) > 1e-9) fail(`${p.id} edge ${v} is off the lattice`);
  let n = 0, notFlat = 0, wet = 0, minRoad = Infinity;
  for (let x = p.x0; x <= p.x1; x += LATTICE / 2) for (let z = p.z0; z <= p.z1; z += LATTICE / 2) {
    g.sample(x, z, sc); n++;
    if (Math.abs(sc.h - p.h) > 0.01) notFlat++;
    if (!Number.isNaN(sc.water)) wet++;
    minRoad = Math.min(minRoad, g.portForm.roadDist(x, z));
  }
  console.log(`${p.id.padEnd(10)} ${n} samples, not flat ${notFlat}, wet ${wet}, nearest road ${minRoad.toFixed(0)} m`);
  if (notFlat) fail(`${p.id} deck is not flat`);
  if (wet) fail(`${p.id} deck is wet`);
  if (minRoad < D.roadClear + D.roadFade) fail(`${p.id} is only ${minRoad.toFixed(0)} m from a road`);
}

// 2. roads untouched: the ground on every road centre line near the port is the road's own surface
let roadChecked = 0, roadMoved = 0;
for (const rd of (g.roads as unknown as { roads: { xs: Float64Array; zs: Float64Array; ys: Float64Array }[] }).roads) {
  for (let i = 0; i < rd.xs.length; i++) {
    if (rd.xs[i] < 900 || rd.xs[i] > 2650 || rd.zs[i] < 2500 || rd.zs[i] > 3300) continue;
    g.sample(rd.xs[i], rd.zs[i], sc);
    roadChecked++;
    if (Math.abs(sc.h - rd.ys[i]) > 0.25) roadMoved++;
  }
}
console.log(`road points checked ${roadChecked}, moved by the port ${roadMoved}`);
if (roadChecked === 0) fail('no road near the port?');
if (roadMoved) fail('the port changed the road surface');

// 3. dredging: full design depth in front of every quay (rows 1 .. 60 m beyond the quay line), the quay edge itself is still deck
for (const b of BERTHS) {
  let worst = -Infinity;
  for (let x = b.x0 + 10; x <= b.x1 - 10; x += 20) {
    g.sample(x, b.zq, sc);
    if (Math.abs(sc.h - D.deck) > 0.01) fail(`${b.id}: quay edge at x=${x} is ${sc.h.toFixed(2)} m`);
    for (let s = LATTICE / 4; s <= 60; s += 8) { g.sample(x, b.zq + s, sc); worst = Math.max(worst, sc.h); if (Number.isNaN(sc.water)) fail(`${b.id}: no water at x=${x} s=${s}`); }
  }
  console.log(`${b.id.padEnd(10)} deepest requirement ${(-b.depth).toFixed(1)} m, shallowest point in the pocket ${worst.toFixed(1)} m`);
  if (worst > -b.depth + 0.05) fail(`${b.id} is not dredged to ${b.depth} m (shallowest ${worst.toFixed(2)})`);
}
{ // oil jetty head
  let worst = -Infinity;
  for (let x = OIL.pocket.x0 + 20; x <= OIL.pocket.x1 - 20; x += 10) for (let z = OIL.pocket.z0 + 10; z <= OIL.pocket.z1 - 10; z += 10) { g.sample(x, z, sc); worst = Math.max(worst, sc.h); }
  console.log(`oil head   shallowest point ${worst.toFixed(1)} m (need <= ${-OIL.pocket.depth})`);
  if (worst > -OIL.pocket.depth + 0.05) fail('oil jetty pocket too shallow');
}

// 4. breakwater: crest above the sea along its whole length, and sea on both sides
for (const s of BREAKWATERS) {
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
  let low = Infinity;
  for (let t = 0; t <= len; t += 10) { g.sample(s.ax + ((s.bx - s.ax) * t) / len, s.az + ((s.bz - s.az) * t) / len, sc); low = Math.min(low, sc.h); }
  console.log(`${s.id.padEnd(10)} ${len.toFixed(0)} m long, lowest crest point ${low.toFixed(2)} m`);
  if (low < D.mound.crest - 0.05 && s.id === 'south-mole') fail(`${s.id} crest dips to ${low.toFixed(2)}`);
  if (low < 3) fail(`${s.id} crest is not above the sea`);
}
g.sample(1700, 3175, sc);
if (Number.isNaN(sc.water) || sc.h > -3) fail('harbour basin north of the mole is not water');
g.sample(1700, 3225, sc);
if (!Number.isNaN(sc.water)) fail('breakwater crest has water on it');

// 5. layout: every part is inside the port area; buildings stand on a deck; solid parts are boxes / prisms; counts
const L = getPortLayout();
const kinds = new Map<string, number>();
let parts = 0, solid = 0, drawn = 0;
const decks = PLATFORMS;
const onDeck = (x: number, z: number) => decks.some((p) => x >= p.x0 - 0.5 && x <= p.x1 + 0.5 && z >= p.z0 - 0.5 && z <= p.z1 + 0.5);
for (const pc of L.pieces) {
  kinds.set(pc.kind, (kinds.get(pc.kind) ?? 0) + 1);
  for (const q of pc.parts) {
    parts++;
    if (q.vis) drawn++;
    if (q.solid) solid++;
    const mx = q.k === 2 ? (q.x + q.bx) / 2 : q.x, mz = q.k === 2 ? (q.z + q.bz) / 2 : q.z;
    if (Number.isNaN(mx + mz + q.y + q.hx + q.hy + q.hz)) fail(`NaN in a ${pc.kind} part of ${pc.id}`);
    if (mx < SEAPORT.x0 - 5 || mx > SEAPORT.x1 + 5 || mz < SEAPORT.z0 - 5) fail(`${pc.id} outside the port`);
    if (mz > SEAPORT.z1 + 5) fail(`${pc.id} south of the port area`);
    if (pc.kind === 'building' || pc.kind === 'tank' || pc.kind === 'silo' || pc.kind === 'crane' || pc.kind === 'container') {
      if (q.solid && !pc.id.startsWith('larm') && !onDeck(q.x, q.z)) fail(`${pc.kind} ${pc.id} (${q.x.toFixed(0)}, ${q.z.toFixed(0)}) is not on a deck`);
    }
  }
}
console.log('pieces', L.pieces.length, 'parts', parts, 'drawn', drawn, 'solid', solid, [...kinds.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
if (L.pieces.length < 100) fail('too few pieces');

// 6. buildings / containers stand on level ground: the terrain under the corners of every solid land box is the deck
for (const pc of L.pieces) {
  if (!['building', 'tank', 'container', 'silo'].includes(pc.kind)) continue;
  for (const q of solidParts(pc)) {
    if (q.k !== 0) continue;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.sample(q.x + dx * q.hx, q.z + dz * q.hz, sc);
      const deck = pc.id.startsWith('tanks') || pc.id.startsWith('pump') ? D.oilDeck : D.deck;
      if (Math.abs(sc.h - deck) > 0.05) { fail(`${pc.id} corner stands at ${sc.h.toFixed(2)} not ${deck}`); break; }
    }
  }
}

// 7. mesh of every port chunk, LOD 0-3
let meshes = 0, tris = 0;
for (let cx = 11; cx <= 15; cx++) for (let cz = 14; cz <= 17; cz++) {
  for (let lod = 0; lod <= 3; lod++) {
    const m = buildPortMesh(L, g.portForm.gates, cx, cz, lod, (x, z) => { g.sample(x, z, sc); return sc.h; });
    if (lod === 3) { if (m) fail('LOD3 has a port mesh'); continue; }
    if (!m) continue;
    meshes++;
    tris += m.indices.length / 3;
    const nv = m.positions.length / 3;
    let maxIdx = 0;
    for (let i = 0; i < m.indices.length; i++) maxIdx = Math.max(maxIdx, m.indices[i]);
    if (maxIdx >= nv) fail(`chunk ${cx},${cz} lod ${lod}: index out of range`);
    if (m.positions.some((v) => Number.isNaN(v)) || m.normals.some((v) => Number.isNaN(v))) fail(`chunk ${cx},${cz} lod ${lod}: NaN in mesh`);
    if (lod === 0) console.log(`  chunk ${cx},${cz} lod0: ${nv} vertices, ${m.indices.length / 3} triangles`);
  }
}
console.log('port meshes', meshes, 'triangles', tris);
if (meshes < 4) fail('too few port meshes');
{
  const a = buildPortMesh(L, g.portForm.gates, 13, 15, 0, () => 0)!;
  const b = buildPortMesh(L, g.portForm.gates, 13, 15, 2, () => 0)!;
  if (b.indices.length >= a.indices.length) fail('LOD2 is not lighter than LOD0');
}

// 8. gate roads exist and start next to the road; zone names
if (g.portForm.gates.length !== 2) fail('gate roads missing');
for (const gr of g.portForm.gates) if (gr.z1 - gr.z0 < 20 || gr.z1 - gr.z0 > 120) fail(`gate road ${gr.id} has a silly length ${gr.z1 - gr.z0}`);
for (const a of SEAPORT.areas) if (!bn.worldZones.facility[a.id]) fail(`no Bangla name for ${a.id}`);
for (const [n, x, z, id] of [['container yard', 1900, 2900, 'seaport-container'], ['bulk quay', 1500, 2880, 'seaport-bulk'], ['fishing', 1200, 2900, 'seaport-fishing'], ['oil', 2370, 3100, 'seaport-oil'], ['basin', 1700, 3100, 'seaport-basin'], ['gate', 1850, 2820, 'seaport-admin']] as const) {
  const h = getWorldZoneAt(x, z);
  if (h.area?.id !== id) fail(`${n} is ${h.area?.id}, expected ${id}`);
}
if (QUAY_WALLS.length < 5) fail('quay walls missing');

console.log(bad ? `\n${bad} FAILURES` : '\nALL OK');
process.exit(bad ? 1 : 0);
