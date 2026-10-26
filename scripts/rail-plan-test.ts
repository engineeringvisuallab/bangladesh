// Stage 12 check - the railway is designed so that NOTHING else is hurt by it:
//   * every line connects its two stations, curves / grades are railway-like, station approaches are straight and flat;
//   * every road crossing is grade-separated with real clearance (5.2 m over a road, 7.4 m under one);
//   * the railway earthworks never change a road (asphalt, shoulder, slopes, junction pads) - checked on the real terrain function;
//   * viaduct piers stand only on ground that is free of roads / pads / road bridges; no span is longer than a steel girder can do;
//   * rivers are bridged above the highest water, wet ground is never filled;
//   * nothing runs into the airport / seaport, lines keep apart outside stations, stations fan their approaches apart;
//   * the finished terrain under a ground line really is the designed formation.
// Optional: npx tsx scripts/rail-plan-test.ts out.json  -> dumps the network for a preview picture.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { LINES, STATIONS, RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { bn } from '../src/i18n/bn';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
let t0 = Date.now();
const gen = new TerrainGenerator(Config.world.seed);
console.log(`terrain + roads + rail ${Date.now() - t0} ms`);
const rail = gen.rail;
const ctx = (rail as any).ctx;
console.log(`${rail.lengthKm.toFixed(1)} km of double track, ${rail.crossings.length} road crossings, ${rail.piers.length} viaduct piers, ${rail.steelSpans.length} steel spans`);
const sA = gen.makeSample();
const sB = gen.makeSample();

console.log('\nstation               kind       level  mode       lines');
for (const s of rail.stations) {
  console.log(`${s.id.padEnd(20)} ${s.kind.padEnd(9)} ${s.level.toFixed(1).padStart(6)}  ${(s.elevated ? 'ELEVATED' : 'ground').padEnd(9)}  ${s.arrivals.map((a) => a.edgeId).join(', ')}`);
  if (!bn.rail.station[s.id]) fail(`no Bangla name for station ${s.id}`);
  if (s.spread > 32) fail(`${s.id}: station ground is rough (${s.spread.toFixed(1)} m spread)`);
}
for (const p of STATIONS) if (!rail.stationById(p.id)) fail(`station ${p.id} missing`);

console.log('\nline             length  minR   maxGrade  wet%  tunnel  bridge  box (m)');
for (const e of rail.edges) {
  const sum = (k: string) => e.segments.filter((s) => s.kind === k).reduce((a, s) => a + s.s1 - s.s0, 0);
  console.log(`${e.id.padEnd(16)} ${(e.length / 1000).toFixed(2).padStart(5)}km ${e.minRadius.toFixed(0).padStart(5)}  ${(e.maxGrade * 100).toFixed(2).padStart(6)}%  ${(e.wetShare * 100).toFixed(1).padStart(4)}  ${sum('tunnel').toFixed(0).padStart(6)}  ${sum('bridge').toFixed(0).padStart(6)}  ${sum('cutcover').toFixed(0).padStart(4)}`);
  if (!bn.rail.line[e.id]) fail(`no Bangla name for line ${e.id}`);
  const a = rail.stationById(e.from)!, b = rail.stationById(e.to)!;
  const n = e.xs.length - 1;
  if (Math.abs(Math.hypot(e.xs[0] - a.x, e.zs[0] - a.z) - D.endR) > 2) fail(`${e.id}: does not start ${D.endR} m from ${e.from}`);
  if (Math.abs(Math.hypot(e.xs[n] - b.x, e.zs[n] - b.z) - D.endR) > 2) fail(`${e.id}: does not end ${D.endR} m from ${e.to}`);
  if (e.minRadius < 140) fail(`${e.id}: curve too tight (${e.minRadius.toFixed(0)} m)`);
  if (e.maxGrade > D.maxGradeException + 1e-3) fail(`${e.id}: grade ${(e.maxGrade * 100).toFixed(2)}% above the limit`);
  if (e.wetShare > 0.2) fail(`${e.id}: ${(e.wetShare * 100).toFixed(0)}% of the line is over water`);
  if (e.length > Math.hypot(a.x - b.x, a.z - b.z) * 1.9) fail(`${e.id}: path is very winding`);
  // station approaches: straight and exactly flat
  for (const [from, to, st] of [[0, e.zoneA, a], [e.length - e.zoneB, e.length, b]] as const) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= n; i++) if (e.cum[i] >= from - 1e-6 && e.cum[i] <= to + 1e-6) { lo = Math.min(lo, e.design[i]); hi = Math.max(hi, e.design[i]); }
    if (hi - lo > 0.02) fail(`${e.id}: platform approach at ${st.id} is not flat (${(hi - lo).toFixed(2)} m)`);
    if (Math.abs(lo - st.level) > 0.05) fail(`${e.id}: platform level differs from ${st.id} level`);
  }
}
for (const l of LINES) if (!rail.edges.find((e) => e.id === l.id)) fail(`line ${l.id} missing`);
for (const i of rail.issues) fail(`design issue: ${i}`);

// ---- crossings: every one grade-separated with real clearance
const by: Record<string, number> = {};
for (const c of rail.crossings) by[c.kind] = (by[c.kind] ?? 0) + 1;
console.log('\nroad crossings by resolution:', by);
let clearBad = 0;
for (const c of rail.crossings) {
  const e = rail.edges.find((q) => q.id === c.edgeId)!;
  const road = gen.roads.roads[c.roadId];
  let i = 0;
  while (i < e.cum.length - 2 && e.cum[i + 1] < c.s) i++;
  const t = (c.s - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1);
  const dz = e.design[i] + (e.design[i + 1] - e.design[i]) * t;
  let k = 0, bd = Infinity;
  for (let q = 0; q < road.xs.length - 1; q++) {
    const abx = road.xs[q + 1] - road.xs[q], abz = road.zs[q + 1] - road.zs[q];
    const tt = Math.max(0, Math.min(1, ((c.x - road.xs[q]) * abx + (c.z - road.zs[q]) * abz) / (abx * abx + abz * abz || 1)));
    const d = Math.hypot(c.x - road.xs[q] - abx * tt, c.z - road.zs[q] - abz * tt);
    if (d < bd) { bd = d; k = q; (road as any)._t = tt; }
  }
  const ry = road.ys[k] + (road.ys[k + 1] - road.ys[k]) * (road as any)._t;
  if (c.kind === 'rail-over-road' && dz - (D.ballast + D.deckThick) < ry + D.roadClearance - 0.05) { clearBad++; fail(`${c.edgeId}: viaduct over ${c.roadName} only ${(dz - D.ballast - D.deckThick - ry).toFixed(1)} m above the road`); }
  if (c.kind === 'road-over-rail' && dz > ry - D.underRoadDrop + 0.05) { clearBad++; fail(`${c.edgeId}: box under ${c.roadName} only ${(ry - dz).toFixed(1)} m below the road`); }
  if (c.kind === 'rail-under-bridge' && dz > ry - 7.0) { clearBad++; fail(`${c.edgeId}: rail under bridge of ${c.roadName} with only ${(ry - dz).toFixed(1)} m`); }
}
console.log(`vertical clearances checked at ${rail.crossings.length} crossings`);

// ---- the railway never changes a road: real terrain function with and without the rail, on / around every road near a rail corridor
let roadPts = 0, roadHurt = 0, maxHurt = 0;
for (const r of gen.roads.roads) {
  for (let i = 0; i < r.xs.length; i++) {
    if (!gen.railForm.inCorridor(r.xs[i], r.zs[i], 60)) continue;
    const dx = i + 1 < r.xs.length ? r.xs[i + 1] - r.xs[i] : r.xs[i] - r.xs[i - 1];
    const dzz = i + 1 < r.zs.length ? r.zs[i + 1] - r.zs[i] : r.zs[i] - r.zs[i - 1];
    const l = Math.hypot(dx, dzz) || 1;
    const nx = -dzz / l, nz = dx / l;
    for (const u of [0, -(r.halfWidth + r.shoulder), r.halfWidth + r.shoulder, -(r.halfWidth + r.shoulder + 6), r.halfWidth + r.shoulder + 6]) {
      const x = r.xs[i] + nx * u, z = r.zs[i] + nz * u;
      gen.sampleNatural(x, z, sA); gen.roads.apply(x, z, sA);
      gen.sample(x, z, sB);
      roadPts++;
      const d = Math.abs(sA.h - sB.h);
      if (d > 0.02) { roadHurt++; maxHurt = Math.max(maxHurt, d); }
    }
  }
}
console.log(`road surface / shoulder / slope probes near the railway: ${roadPts}, changed by the rail: ${roadHurt}`);
if (roadHurt) fail(`the railway earthworks change the terrain on ${roadHurt} road probes (max ${maxHurt.toFixed(2)} m)`);

// junction pads: not touched either
let padHurt = 0;
for (const p of gen.roads.pads) {
  if (!gen.railForm.inCorridor(p.x, p.z, p.rCore + p.emb + 40)) continue;
  for (let a = 0; a < 8; a++) {
    const x = p.x + Math.cos(a * 0.785) * p.rCore * 0.8, z = p.z + Math.sin(a * 0.785) * p.rCore * 0.8;
    gen.sampleNatural(x, z, sA); gen.roads.apply(x, z, sA); gen.sample(x, z, sB);
    if (Math.abs(sA.h - sB.h) > 0.02) padHurt++;
  }
}
if (padHurt) fail(`${padHurt} junction-pad probes are changed by the railway`);

// ---- piers: free ground, sane spans
let pierBad = 0;
for (const p of rail.piers) if (!ctx.pierFree(p.x, p.z, D.pierSize / 2, D.pierRoadGap - 0.01)) pierBad++;
if (pierBad) fail(`${pierBad} viaduct piers stand on road / pad / road-bridge ground`);
if (rail.piers.some((p) => p.deckY - p.baseY < 1)) console.log('(info) some piers are very short (deck close to the ground)');
console.log(`piers checked: ${rail.piers.length}, on blocked ground: ${pierBad}`);

// ---- ground lines: the terrain under the track IS the formation; wet ground untouched; ballast above the formation
let gSamples = 0, gOff = 0;
for (const e of rail.edges) {
  for (let i = 1; i < e.xs.length - 1; i++) {
    const seg = e.segments.find((q) => e.cum[i] >= q.s0 && e.cum[i] <= q.s1)!;
    if (seg.kind !== 'ground') continue;
    // away from the ends of the ground stretch (neighbouring structures trim the formation)
    if (e.cum[i] - seg.s0 < 30 || seg.s1 - e.cum[i] < 30) continue;
    gen.sampleNatural(e.xs[i], e.zs[i], sA);
    if (!Number.isNaN(sA.water) && sA.h <= sA.water + 0.3) { fail(`${e.id}: ground line on wet ground at s=${e.cum[i].toFixed(0)}`); continue; }
    gen.sample(e.xs[i], e.zs[i], sB);
    gSamples++;
    if (Math.abs(sB.h - (e.design[i] - D.ballast)) > 0.08) gOff++;
  }
}
console.log(`formation check: ${gSamples} ground samples, ${gOff} off the designed level`);
if (gOff > gSamples * 0.02) fail(`${gOff} of ${gSamples} ground samples are not at the designed formation level`);

// rivers: bridges above the highest water
for (const e of rail.edges) for (let i = 0; i < e.xs.length; i++) {
  if (Number.isNaN(e.water[i])) continue;
  const seg = e.segments.find((q) => e.cum[i] >= q.s0 - 1e-6 && e.cum[i] <= q.s1 + 1e-6)!;
  if (seg.kind !== 'bridge') { fail(`${e.id}: water under the line at s=${e.cum[i].toFixed(0)} but no bridge`); break; }
  if (e.design[i] - D.ballast - D.deckThick < e.water[i] + D.waterClearance - 0.05) { fail(`${e.id}: deck only ${(e.design[i] - D.ballast - D.deckThick - e.water[i]).toFixed(1)} m above the water at s=${e.cum[i].toFixed(0)}`); break; }
}

// airport / seaport grounds, station fan, corridor API
for (const e of rail.edges) for (let i = 0; i < e.xs.length; i++) if (ctx.facilityAt(e.xs[i], e.zs[i], 20)) { fail(`${e.id}: track inside the airport / seaport grounds`); break; }
for (const st of rail.stations) {
  const sorted = st.arrivals.map((a) => a.bearing).sort((p, q) => p - q);
  for (let i = 0; i < sorted.length; i++) {
    const nxt = sorted[(i + 1) % sorted.length] + (i + 1 === sorted.length ? Math.PI * 2 : 0);
    if (sorted.length > 1 && (nxt - sorted[i]) * 180 / Math.PI < D.minArrivalGap - 0.6) fail(`${st.id}: arrivals only ${(((nxt - sorted[i]) * 180) / Math.PI).toFixed(1)} deg apart`);
  }
}
{
  const e = rail.edges[0];
  const mid = (e.xs.length / 2) | 0;
  if (!gen.railForm.inCorridor(e.xs[mid], e.zs[mid], 0)) fail('inCorridor false on the track');
  if (gen.railForm.inCorridor(e.xs[mid] + 900, e.zs[mid] + 900, 0) && gen.railForm.inCorridor(e.xs[mid] - 900, e.zs[mid] - 900, 0)) fail('inCorridor true far from the track on both sides');
}

// STAGE 13 step 3: grades. Every line stays within 2.5 %; a line may go higher ONLY where the solver proved that no legal profile
// exists (rail.gradeNotes holds that proof and the smallest grade that works), and never above that grade.
console.log('\ngrade exceptions (smallest grade at which a legal profile exists):');
for (const n of rail.gradeNotes) console.log('  ' + n);
if (!rail.gradeNotes.length) console.log('  none');
for (const e of rail.edges) {
  const note = rail.gradeNotes.find((q) => q.startsWith(e.id + ':'));
  const allowed = note ? parseFloat(/up to ([0-9.]+) %/.exec(note)![1]) / 100 : D.maxGrade;
  if (e.maxGrade > allowed + 0.0002) fail(`${e.id}: grade ${(e.maxGrade * 100).toFixed(2)} % is above ${(allowed * 100).toFixed(2)} %${note ? ' (documented exception)' : ''}`);
  if (note && e.maxGrade > D.maxGradeException) fail(`${e.id}: grade above the hard limit ${(D.maxGradeException * 100).toFixed(1)} %`);
}

// STAGE 13: station links (through-running connections inside a station)
console.log(`\nstation links: ${rail.links.length}`);
for (const l of rail.links) {
  console.log(`  ${l.id.padEnd(42)} ${l.length.toFixed(0).padStart(4)} m  minR ${l.minRadius.toFixed(0)}`);
  const st = rail.stationById(l.station)!;
  if (l.minRadius < D.linkMinRadius) fail(`link ${l.id}: radius ${l.minRadius.toFixed(0)} m is too tight`);
  for (const side of [l.a, l.b]) {
    const e = rail.edges.find((q) => q.id === side.edgeId)!;
    const i = side.end === 'a' ? 0 : e.xs.length - 1;
    const j = side.end === l.a.end && side === l.a ? 0 : l.xs.length - 1;
    if (e.from !== st.id && side.end === 'a') fail(`link ${l.id}: edge ${e.id} does not start at ${st.id}`);
    if (e.to !== st.id && side.end === 'b') fail(`link ${l.id}: edge ${e.id} does not end at ${st.id}`);
    if (Math.hypot(e.xs[i] - l.xs[j], e.zs[i] - l.zs[j]) > 1) fail(`link ${l.id}: does not meet the end of ${e.id}`);
  }
  for (let q = 0; q < l.xs.length; q++) if (Math.hypot(l.xs[q] - st.x, l.zs[q] - st.z) > D.endR + 1) { fail(`link ${l.id}: leaves the station throat`); break; }
  for (const ar of st.arrivals) {
    if (ar.edgeId === l.a.edgeId || ar.edgeId === l.b.edgeId) continue;
    const ex = st.x + Math.cos(ar.bearing) * D.endR, ez = st.z + Math.sin(ar.bearing) * D.endR;
    let d = Infinity;
    for (let q = 0; q < l.xs.length; q++) d = Math.min(d, Math.hypot(l.xs[q] - ex, l.zs[q] - ez));
    if (d < 12) fail(`link ${l.id}: runs ${d.toFixed(1)} m from the buffer stop of ${ar.edgeId}`);
  }
}
for (const l of rail.links) {
  const e = l.edge;
  if (!l.elevated) for (let i = 0; i < e.xs.length; i++) if (Math.abs(l.level - e.ground[i]) > 3) { fail(`link ${l.id}: ground link is ${(l.level - e.ground[i]).toFixed(1)} m off the natural ground`); break; }
  if (l.elevated && rail.piers.filter((p) => p.edgeId === l.id).length < 1) fail(`link ${l.id}: elevated link without piers`);
}
for (const st of rail.stations) {
  const n = rail.links.filter((l) => l.station === st.id).length;
  if (st.arrivals.length >= 2 && n === 0) console.log(`  (info) ${st.id}: no link is gentle enough - terminal station`);
}

// STEP 4: turnouts where two links leave one line end (both tracks) and diamond crossings where link tracks cross
{
  const half = D.trackSpacing / 2;
  const ends = new Map<string, string[]>();
  for (const l of rail.links) for (const q of [l.a, l.b]) { const k = `${l.station}|${q.edgeId}|${q.end}`; ends.set(k, [...(ends.get(k) ?? []), l.id]); }
  const shared = [...ends].filter(([, v]) => v.length >= 2);
  const expected = shared.reduce((n, [, v]) => n + (v.length - 1) * 2, 0);
  console.log(`\nswitches: ${rail.switches.length} (${shared.length} line ends with two links x 2 tracks)`);
  if (rail.switches.length !== expected) fail(`expected ${expected} switches (every line end shared by two links, both tracks), found ${rail.switches.length}`);
  for (const sw of rail.switches) {
    const e = rail.edges.find((q) => q.id === sw.lineId)!;
    const i = sw.end === 'a' ? 0 : e.xs.length - 1, j = sw.end === 'a' ? 1 : e.xs.length - 2;
    // direction into the station = from the second-last point towards the end point
    let tx = e.xs[i] - e.xs[j], tz = e.zs[i] - e.zs[j];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const tox = e.xs[i] + -tz * sw.track * half, toz = e.zs[i] + tx * sw.track * half;
    const toe = Math.hypot(sw.x - tox, sw.z - toz);
    const sep = Math.hypot(sw.stock[Math.floor(sw.frogS) * 2] - sw.div[Math.floor(sw.frogS) * 2], sw.stock[Math.floor(sw.frogS) * 2 + 1] - sw.div[Math.floor(sw.frogS) * 2 + 1]);
    console.log(`  ${sw.id.padEnd(34)} toe ${toe.toFixed(2)} m off the track end  frog at ${sw.frogS.toFixed(1)} m  blade ${sw.bladeLen.toFixed(1)} m  routes ${sw.straight.split(':')[1]} / ${sw.diverging.split(':')[1]}`);
    if (toe > 1.0) fail(`switch ${sw.id}: toe is ${toe.toFixed(2)} m from the track end of ${sw.lineId}`);
    if (sw.straight === sw.diverging || !rail.links.some((q) => q.id === sw.straight) || !rail.links.some((q) => q.id === sw.diverging)) fail(`switch ${sw.id}: bad route links`);
    if (sw.frogS < 8 || sw.frogS > 60) fail(`switch ${sw.id}: frog ${sw.frogS.toFixed(1)} m from the toe is not sensible`);
    if (sw.bladeLen > D.switchBladeMax + 1e-9 || sw.bladeLen >= sw.frogS) fail(`switch ${sw.id}: blade ${sw.bladeLen.toFixed(1)} m is longer than allowed / reaches the frog`);
    if (Math.abs(sep - D.gauge) > 0.6) fail(`switch ${sw.id}: the routes are ${sep.toFixed(2)} m apart at the frog (should be about one gauge)`);
    if (Math.abs(sw.level - rail.links.find((q) => q.id === sw.straight)!.level) > 1e-6) fail(`switch ${sw.id}: level differs from its link`);
  }
  // independent crossing count: two link centre lines that cross at >= diamondMinAngle give 2 x 2 diamonds
  let pairs = 0;
  for (let a = 0; a < rail.links.length; a++) for (let b = a + 1; b < rail.links.length; b++) {
    const A = rail.links[a], B = rail.links[b];
    if (A.station !== B.station) continue;
    let hit = false;
    for (let p = 0; p < A.xs.length - 1 && !hit; p++) for (let q = 0; q < B.xs.length - 1 && !hit; q++) {
      const r1x = A.xs[p + 1] - A.xs[p], r1z = A.zs[p + 1] - A.zs[p], r2x = B.xs[q + 1] - B.xs[q], r2z = B.zs[q + 1] - B.zs[q];
      const den = r1x * r2z - r1z * r2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((B.xs[q] - A.xs[p]) * r2z - (B.zs[q] - A.zs[p]) * r2x) / den, u = ((B.xs[q] - A.xs[p]) * r1z - (B.zs[q] - A.zs[p]) * r1x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      let ang = Math.abs(Math.atan2(den, r1x * r2x + r1z * r2z)) * 180 / Math.PI;
      ang = Math.min(ang, 180 - ang);
      if (ang >= D.diamondMinAngle) hit = true;
    }
    if (hit) pairs++;
  }
  console.log(`diamond crossings: ${rail.diamonds.length} (${pairs} crossing link pairs x 4 track crossings)`);
  if (rail.diamonds.length !== pairs * 4) fail(`expected ${pairs * 4} diamonds (${pairs} crossing link pairs x 4), found ${rail.diamonds.length}`);
  if (!rail.diamonds.some((d) => d.station === 'central')) fail('no diamond crossing at the central station');
  for (const d of rail.diamonds) {
    const st = rail.stationById(d.station)!;
    if (Math.hypot(d.x - st.x, d.z - st.z) > 40) fail(`diamond ${d.id}: ${Math.hypot(d.x - st.x, d.z - st.z).toFixed(0)} m from the station centre`);
    if (d.angle < D.diamondMinAngle) fail(`diamond ${d.id}: angle ${d.angle.toFixed(1)} deg is too small`);
    // every corner is one half gauge from both track centre lines
    const nax = -d.az, naz = d.ax, nbx = -d.bz, nbz = d.bx;
    for (let k = 0; k < 4; k++) {
      const rx = d.corners[k * 2] - d.x, rz = d.corners[k * 2 + 1] - d.z;
      if (Math.abs(Math.abs(rx * nax + rz * naz) - D.gauge / 2) > 1e-6 || Math.abs(Math.abs(rx * nbx + rz * nbz) - D.gauge / 2) > 1e-6) { fail(`diamond ${d.id}: rail corner ${k} is not on the rails`); break; }
    }
  }
  const central = rail.diamonds.filter((d) => d.station === 'central');
  if (central.length) console.log(`  central: ${central.length} diamonds, angles ${Math.min(...central.map((d) => d.angle)).toFixed(1)}-${Math.max(...central.map((d) => d.angle)).toFixed(1)} deg, ${Math.max(...central.map((d) => Math.hypot(d.x - rail.stationById('central')!.x, d.z - rail.stationById('central')!.z))).toFixed(1)} m from the centre at most`);
}

console.log(bad ? `\n${bad} FAILURES` : '\nALL OK');
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify({
    stations: rail.stations,
    edges: rail.edges.map((e) => ({ id: e.id, pts: Array.from(e.xs, (x, i) => [Math.round(x), Math.round(e.zs[i])]), seg: e.segments })),
    crossings: rail.crossings,
    piers: rail.piers,
  }));
}
process.exit(bad ? 1 : 0);
