import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const t0 = performance.now();
const g = new TerrainGenerator(Config.world.seed);
console.log('build ms', (performance.now() - t0).toFixed(0));
const R = g.roads;
console.log('pads', R.pads.length, 'clusters skipped', R.padSkipped.length);
for (const s of R.padSkipped) console.log('  skip', s);
const kinds: Record<string, number> = {};
for (const p of R.pads) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
console.log(kinds);
// residual: plane vs the leg heights just outside the stubs, and terrain vs plane inside
const a = g.makeSample();
let worstT = 0, worstArm = 0;
for (const p of R.pads) {
  const o = p.outline;
  for (let i = 0; i < o.length; i += 2) {
    g.sample(o[i], o[i + 1], a);
    const py = p.y + p.a * (o[i] - p.x) + p.b * (o[i + 1] - p.z);
    worstT = Math.max(worstT, Math.abs(a.h - py));
  }
  for (const arm of p.arms) {
    const rd = R.roads[arm.roadId];
    // closest vertex to the pad centre beyond the outline: leg height vs plane
    let best = 1e9, bi = -1;
    for (let i = 0; i < rd.xs.length; i++) { const d = Math.hypot(rd.xs[i] - p.x, rd.zs[i] - p.z); if (d > p.rCore - 1 && d < best) { best = d; bi = i; } }
    if (bi >= 0 && best < p.rCore + 12) worstArm = Math.max(worstArm, Math.abs(rd.ys[bi] - (p.y + p.a * (rd.xs[bi] - p.x) + p.b * (rd.zs[bi] - p.z))));
  }
}
console.log('terrain vs plane on outline worst', worstT.toFixed(3), 'leg height vs plane at pad edge worst', worstArm.toFixed(2));
console.log('radii', R.pads.map(p => p.rCore.toFixed(0)).join(' '));
const res: number[] = [];
for (const p of R.pads) {
  let w = 0;
  for (const arm of p.arms) {
    const rd = R.roads[arm.roadId];
    for (let i = 0; i < rd.xs.length; i++) {
      const d = Math.hypot(rd.xs[i] - p.x, rd.zs[i] - p.z);
      if (d < 28) w = Math.max(w, Math.abs(rd.ys[i] - (p.y + p.a * (rd.xs[i] - p.x) + p.b * (rd.zs[i] - p.z))));
    }
  }
  res.push(w);
}
console.log('fit residual per pad (m):', res.map(v => v.toFixed(2)).join(' '));
const bigs = R.pads.map((p, i) => ({ i, p, r: res[i] })).filter(q => q.r > 0.4);
for (const b of bigs) console.log('pad', b.i, b.p.kind, 'at', b.p.x.toFixed(0), b.p.z.toFixed(0), 'resid', b.r.toFixed(2), 'grad', b.p.a.toFixed(3), b.p.b.toFixed(3), b.p.arms.map(a => R.roads[a.roadId].name + ':' + ((a.theta*180/Math.PI)|0)).join(' '));
