// Step 7a diagnostic (headless, no Rapier / three): is the "AI cars stay on their lane (< 3.5 m)" check of people-test.ts limited by the
// route itself? The test measures the distance from the car to the NEAREST ROUTE POINT. A car that sits exactly on the route can still be
// up to gap/2 away from the nearest point. This prints the route point gaps (straights, junction turns) over many random starts.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';

const gen = new TerrainGenerator(Config.world.seed);
const R = gen.roads;
const graph = new RoadGraph(R);
let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const N = Number(process.argv[2] ?? 400);
let negStart = 0, worstGap = 0, worstJn = 0, worstStraight = 0, n = 0, jnRoutes = 0, over7 = 0, worstHalfOnCurve = 0;
const hist = new Map<number, number>();
for (let k = 0; k < N; k++) {
  const sp = graph.randomSpot(rnd);
  const road = R.roads[sp.roadId];
  const s = Math.min(Math.max(40, sp.s), road.length - 400);
  if (s < 0) negStart++;
  const rb = new RouteBuilder(graph, rnd, sp.roadId, s, 1, 0.9);
  rb.start();
  rb.fill(0, 1700); // ~80 s at 20 m/s
  const p = rb.pts;
  let sawJn = false;
  for (let i = 1; i < p.length; i++) {
    const g = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    n++;
    worstGap = Math.max(worstGap, g);
    if (g > 7) over7++;
    const b = Math.round(g);
    hist.set(b, (hist.get(b) ?? 0) + 1);
    if (p[i].jn) { sawJn = true; worstJn = Math.max(worstJn, g); } else worstStraight = Math.max(worstStraight, g);
  }
  if (sawJn) jnRoutes++;
  void worstHalfOnCurve;
}
console.log(`routes started with a NEGATIVE s (road shorter than 440 m, the formula of people-test.ts B2): ${negStart} of ${N}`);
console.log(`${N} routes (1700 m each), ${n} point gaps; routes with a junction turn ${jnRoutes}`);
console.log(`largest gap: ${worstGap.toFixed(1)} m; on straights ${worstStraight.toFixed(1)} m; in junctions ${worstJn.toFixed(1)} m; gaps > 7 m: ${over7}`);
console.log(`=> a car exactly on the route can be up to ${(worstGap / 2).toFixed(2)} m from the nearest point (the test limit is 3.5 m)`);
console.log('gap histogram (m: count):', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([g, c]) => `${g}:${c}`).join(' '));
