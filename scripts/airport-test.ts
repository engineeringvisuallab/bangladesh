/**
 * Airport self-test (no game, no three.js needed).
 *   npx tsx scripts/airport-test.ts            -> runs checks
 *   npx tsx scripts/airport-test.ts --dump     -> also prints plan JSON (for previews)
 */
import type { MeshArrays } from '../src/airport/MeshBuilder';
import {
  createAirportPlan, buildAirportMesh, localToWorld, worldToLocal,
  airportFootprints, padBlend, airportEntranceWorld, isInsideAirport,
} from '../src/airport';

let failed = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
}

const site = { cx: 1234.5, cz: -987.25, heading: 0.7, groundY: 12, seed: 42 };
const plan = createAirportPlan(site);

// 1. determinism
const again = createAirportPlan(site);
check('deterministic for same seed', JSON.stringify(plan) === JSON.stringify(again));
const hangars = (p: typeof plan): number => p.buildings.filter((b) => b.kind === 'hangar').length;
let seen2 = false; let seen3 = false;
for (let s = 1; s < 40; s++) { const n = hangars(createAirportPlan({ seed: s })); if (n === 2) seen2 = true; if (n === 3) seen3 = true; }
check('hangar count varies with seed (2..3)', seen2 && seen3);

// 2. transforms
const w = localToWorld(site, 321, -45);
const l = worldToLocal(site, w.x, w.z);
check('localToWorld/worldToLocal round-trip', Math.abs(l.x - 321) < 1e-6 && Math.abs(l.z + 45) < 1e-6);

// 3. mesh sanity
const mesh = buildAirportMesh(plan);
for (const [name, m] of Object.entries(mesh) as [string, MeshArrays][]) {
  const vc = m.positions.length / 3;
  let maxIdx = 0; for (const i of m.indices) if (i > maxIdx) maxIdx = i;
  let badN = 0;
  for (let i = 0; i < vc; i++) {
    const len = Math.hypot(m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!);
    if (Math.abs(len - 1) > 1e-4) badN++;
  }
  const nan = m.positions.some((v: number) => !Number.isFinite(v));
  check(`${name}: non-empty, valid indices, unit normals`, vc > 0 && maxIdx < vc && m.indices.length % 3 === 0 && badN === 0 && !nan,
    `(${vc} verts, ${m.indices.length / 3} tris)`);
}

// 4. every ground normal faces up
let downFacing = 0;
for (let i = 0; i < mesh.ground.normals.length / 3; i++) if (mesh.ground.normals[i * 3 + 1]! < 0.99) downFacing++;
check('ground faces point up', downFacing === 0);

// 5. winding agrees with normals (solid)
{
  const m = mesh.solid; let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = (i: number): number[] => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const [A, B, C] = [p(a), p(b), p(c)] as [number[], number[], number[]];
    const e1 = [B[0]! - A[0]!, B[1]! - A[1]!, B[2]! - A[2]!];
    const e2 = [C[0]! - A[0]!, C[1]! - A[1]!, C[2]! - A[2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const dot = n[0]! * m.normals[a * 3]! + n[1]! * m.normals[a * 3 + 1]! + n[2]! * m.normals[a * 3 + 2]!;
    if (dot <= 0) bad++;
  }
  check('solid winding matches normals', bad === 0, `(${bad} bad)`);
}

// 6. everything inside the fenced bounds
{
  const b = plan.bounds; let out = 0;
  for (const r of [...plan.pavements, ...plan.markings, ...plan.buildings]) {
    if (r.cx - r.w / 2 < b.minX - 1e-6 || r.cx + r.w / 2 > b.maxX + 1e-6 || r.cz - r.d / 2 < b.minZ - 1e-6 || r.cz + r.d / 2 > b.maxZ + 1e-6) out++;
  }
  check('all pavement/markings/buildings inside bounds', out === 0, `(${out} outside)`);
}

// 7. no overlapping pavements of the same height class (z-fight guard)
{
  const flat = plan.pavements.filter((p) => p.kind !== 'runway');
  let overlaps = 0;
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    const a = flat[i]!; const c = flat[j]!;
    const ox = Math.min(a.cx + a.w / 2, c.cx + c.w / 2) - Math.max(a.cx - a.w / 2, c.cx - c.w / 2);
    const oz = Math.min(a.cz + a.d / 2, c.cz + c.d / 2) - Math.max(a.cz - a.d / 2, c.cz - c.d / 2);
    // shoulder legitimately sits under the runway only; other pairs must only touch
    if (ox > 1e-6 && oz > 1e-6) overlaps++;
  }
  check('no coplanar pavement overlaps', overlaps === 0, `(${overlaps})`);
}

// 8. terrain / physics / road helpers
check('pad is flat at groundY', padBlend(plan, site.cx, site.cz)?.weight === 1 && padBlend(plan, site.cx, site.cz)?.y === 12);
check('pad blend vanishes far away', padBlend(plan, site.cx + 5000, site.cz) === null);
check('runway centre is inside airport', isInsideAirport(plan, site.cx, site.cz));
check('footprints produced', airportFootprints(plan).length > 10, `(${airportFootprints(plan).length})`);
const ent = airportEntranceWorld(plan);
check('entrance direction is unit length', Math.abs(Math.hypot(ent.dirX, ent.dirZ) - 1) < 1e-9);

console.log('\nplan:', {
  pavements: plan.pavements.length, markings: plan.markings.length, buildings: plan.buildings.length,
  lights: plan.lights.length, fenceSegments: plan.fence.length,
  bounds: plan.bounds,
});

if (process.argv.includes('--dump')) console.log('---PLAN---\n' + JSON.stringify(createAirportPlan({ seed: 7 })));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
