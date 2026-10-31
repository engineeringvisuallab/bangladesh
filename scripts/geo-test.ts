/* Run: npx tsx scripts/geo-test.ts   (no dependencies, checks the geo maths) */
import { readFileSync } from 'node:fs';
import { enToLonLat, lonLatToEN, GeoRef, Region, WorldFrame, tileOf, tileOrigin, TILE_SIZE_M, type RegionDef } from '../src/geo';

let failed = 0;
function check(name: string, ok: boolean, info = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

// 1. Projection: values produced independently by a Python implementation of the same series.
{
  const en = lonLatToEN(89.37, 24.85);
  check('lon/lat -> E/N matches reference', near(en.e, 739490.02796, 0.001) && near(en.n, 2750420.96370, 0.001), `${en.e.toFixed(3)}, ${en.n.toFixed(3)}`);
  const ll = enToLonLat(732749.9, 2753306.84);
  check('E/N -> lon/lat matches reference', near(ll.lat, 24.877084934, 1e-8) && near(ll.lon, 89.303825362, 1e-8), `${ll.lat.toFixed(9)}, ${ll.lon.toFixed(9)}`);
  let worst = 0;
  for (let lat = 20.6; lat <= 26.7; lat += 0.37) for (let lon = 88.0; lon <= 92.7; lon += 0.41) {
    const e = lonLatToEN(lon, lat);
    const b = enToLonLat(e.e, e.n);
    worst = Math.max(worst, Math.abs(b.lat - lat), Math.abs(b.lon - lon));
  }
  check('round trip over all of Bangladesh < 1e-7 deg (~1 cm)', worst < 1e-7, `worst ${worst.toExponential(2)} deg = ${(worst * 111000 * 1000).toFixed(2)} mm`);
}

// 2. GeoRef from 2 points reproduces the points, and pixel <-> E/N round-trips.
const def = JSON.parse(readFileSync(new URL('../public/regions/bogura/region.json', import.meta.url), 'utf8')) as RegionDef;
const mainRef = def.references.find((r) => r.id === 'main_map')!;
{
  const g = GeoRef.fit(mainRef.gcps, mainRef.width, mainRef.height);
  const res = g.residuals(mainRef.gcps);
  check('2-point fit hits both control points', res.every((r) => r.metres < 1e-6));
  const p = g.pixelToEN(1000, 700);
  const back = g.enToPixel(p.e, p.n);
  check('pixel -> E/N -> pixel round trip', near(back.px, 1000, 1e-9) && near(back.py, 700, 1e-9));
  const mpp = g.metresPerPixel();
  check('screenshot is isotropic, ~5.8 m/px', near(mpp.x, 5.82, 0.05) && near(mpp.y, 5.82, 0.05), `${mpp.x.toFixed(3)} x ${mpp.y.toFixed(3)}`);
  const b = g.bounds();
  console.log(`      image covers ${(b.maxE - b.minE).toFixed(0)} m x ${(b.maxN - b.minN).toFixed(0)} m`);
}

// 3. 3+ points: recovers a rotated + scaled affine exactly (so more control points can be added later).
{
  const a = 4.2, b = 1.1, c = 700000, d = 0.9, e = -4.8, f = 2750000;
  const mk = (id: string, px: number, py: number) => ({ id, px, py, e: a * px + b * py + c, n: d * px + e * py + f });
  const gcps = [mk('a', 10, 20), mk('b', 2000, 50), mk('c', 300, 1200), mk('d', 2400, 1300)];
  const g = GeoRef.fit(gcps, 2576, 1401);
  const worst = Math.max(...g.residuals(gcps).map((r) => r.metres));
  check('least-squares affine recovers rotation/skew', worst < 1e-6 && g.mode === 'least-squares-affine', `worst ${worst.toExponential(2)} m`);
  let threw = false;
  try {
    GeoRef.fit([mk('a', 0, 0), mk('b', 1, 1), mk('c', 2, 2)], 10, 10);
  } catch {
    threw = true;
  }
  check('collinear control points are rejected', threw);
}

// 4. Region, tiles and the scene frame.
{
  const region = new Region(def);
  const frame = WorldFrame.nearest(region.center.e, region.center.n);
  check('scene origin is on the 500 m tile grid', frame.originE % TILE_SIZE_M === 0 && frame.originN % TILE_SIZE_M === 0, `${frame.originE}, ${frame.originN}`);
  const x = frame.toX(region.center.e + 123);
  const z = frame.toZ(region.center.n + 50);
  check('east = +x, north = -z', x - frame.toX(region.center.e) === 123 && z - frame.toZ(region.center.n) === -50, `dx ${x - frame.toX(region.center.e)}, dz ${z - frame.toZ(region.center.n)}`);
  const en = frame.toEN(x, z);
  check('scene -> E/N round trip', near(en.e, region.center.e + 123, 1e-9) && near(en.n, region.center.n + 50, 1e-9));
  const tiles = region.tiles();
  const t0 = tiles[0];
  const o = tileOrigin(t0);
  const okTiles = tiles.every((t) => { const org = tileOrigin(t); const tt = tileOf(org.e + 1, org.n + 1); return tt.i === t.i && tt.j === t.j; });
  check('tile indices are consistent', okTiles && o.e % TILE_SIZE_M === 0, `${tiles.length} tiles, first ${t0.i},${t0.j}`);
  const covered = tiles.length * TILE_SIZE_M * TILE_SIZE_M;
  const area = (region.bounds.maxE - region.bounds.minE) * (region.bounds.maxN - region.bounds.minN);
  check('tiles cover the whole image rectangle', covered >= area && covered < area * 1.2, `${(covered / 1e6).toFixed(1)} km2 tiles vs ${(area / 1e6).toFixed(1)} km2 image`);
  for (const c of region.checkpoints()) {
    const ll = enToLonLat(c.e, c.n);
    console.log(`      ${c.id.padEnd(9)} ${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}`);
  }
  const p = region.georefs[1].pixelToEN(1405, 583);
  const mid = enToLonLat(p.e, p.n);
  check('"Bogura" label lands on Bogura town (24.85 N, 89.37 E +-0.01)', near(mid.lat, 24.85, 0.01) && near(mid.lon, 89.373, 0.01), `${mid.lat.toFixed(4)}, ${mid.lon.toFixed(4)}`);
  // independent check of the airport photo: the map-frame tick marks (found in the image, NOT used to build region.json's numbers directly)
  // crop = original photo shifted by (44, 41). Top tick 89 19'0"E at x=687.5, bottom tick at x=730.0, left tick 24 52'30"N at y=463.5.
  const air = region.georefs[0];
  const lonOf = (px: number, py: number): number => { const q = air.pixelToEN(px, py); return enToLonLat(q.e, q.n).lon; };
  const latOf = (px: number, py: number): number => { const q = air.pixelToEN(px, py); return enToLonLat(q.e, q.n).lat; };
  const m = (deg: number): number => deg * 101000; // ~metres
  check('airport photo: top tick = 89 19\'0"E (within 1 m)', near(m(lonOf(687.5 - 44, 39 - 41)), m(89 + 19 / 60), 1), `${lonOf(687.5 - 44, 39 - 41).toFixed(7)}`);
  check('airport photo: bottom tick = 89 19\'0"E (within 1 m)', near(m(lonOf(730.0 - 44, 2538 - 41)), m(89 + 19 / 60), 1));
  check('airport photo: right-edge lat tick = 24 52\'0"N (within 1 m)', near(latOf(1785 - 44, 1156.4 - 41) * 110900, (24 + 52 / 60) * 110900, 1));
}

console.log(failed === 0 ? '\nall geo tests passed' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
