import { BODY, INSIDE, NOSE_X, PANTOGRAPH_TOP, SEAT_EYE, buildCarDecals, buildCarParts } from '../src/trains/TrainMesh';
import { CONSIST, type CarKind } from '../src/trains/TrainConfig';

/**
 * Train interior test (headless): every car part is finite, has valid indices, stays inside the car envelope (so the colliders / gauge still fit),
 * the saloon is HOLLOW (floor, ceiling and seats exist in the `inside` part) and the passenger eye lies inside the saloon and above the seat.
 */
let fail = 0;
const ok = (c: boolean, msg: string): void => {
  if (!c) {
    fail++;
    console.log('FAIL', msg);
  }
};

const kinds: CarKind[] = ['loco', 'coach', 'cab'];
for (const k of kinds) {
  const parts = buildCarParts(k);
  const len = (k === 'loco' ? BODY.loco.length : BODY.coach.length) / 2;
  const roof = k === 'loco' ? BODY.loco.roof : BODY.coach.roof;
  for (const [name, d] of Object.entries(parts)) {
    const n = d.positions.length / 3;
    ok(n > 0, `${k}.${name} empty`);
    ok(n < 400000, `${k}.${name} too many vertices ${n}`);
    let bad = 0, maxIdx = 0;
    for (const v of d.positions) if (!Number.isFinite(v)) bad++;
    for (const v of d.normals) if (!Number.isFinite(v)) bad++;
    for (const v of d.colors) if (!Number.isFinite(v) || v < 0 || v > 1.2) bad++;
    for (const i of d.indices) maxIdx = Math.max(maxIdx, i);
    ok(bad === 0, `${k}.${name} has ${bad} bad numbers`);
    ok(maxIdx < n, `${k}.${name} index ${maxIdx} >= ${n}`);
    ok(d.surf.length === n, `${k}.${name} surf attribute has ${d.surf.length} entries for ${n} vertices`);
    let sMax = 0;
    for (const v of d.surf) sMax = Math.max(sMax, v);
    ok(sMax <= 9, `${k}.${name} surface class ${sMax} > 9`);
    ok(d.indices.length % 3 === 0, `${k}.${name} indices not multiple of 3`);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, d.positions[i * 3]); x1 = Math.max(x1, d.positions[i * 3]);
      y0 = Math.min(y0, d.positions[i * 3 + 1]); y1 = Math.max(y1, d.positions[i * 3 + 1]);
      z0 = Math.min(z0, d.positions[i * 3 + 2]); z1 = Math.max(z1, d.positions[i * 3 + 2]);
    }
    console.log(`${k.padEnd(5)} ${name.padEnd(6)} verts ${String(n).padStart(6)} tris ${String(d.indices.length / 3).padStart(6)}  x ${x0.toFixed(2)}..${x1.toFixed(2)}  y ${y0.toFixed(2)}..${y1.toFixed(2)}  z ${z0.toFixed(2)}..${z1.toFixed(2)}`);
    ok(z0 >= -1.6 && z1 <= 1.6, `${k}.${name} sticks out sideways (${z0}..${z1})`);
    ok(x0 >= -len - 0.7 && x1 <= len + 0.7, `${k}.${name} too long (${x0}..${x1})`);
    // wheels touch the rail head (y = 0); the collider box (TrainBoxes) stops at roof + 0.3 / 0.2: only the pantograph may be higher
    const top = k === 'loco' ? PANTOGRAPH_TOP + 0.05 : roof + 0.22;
    ok(y0 >= -0.001 && y1 <= top, `${k}.${name} too tall / low (${y0}..${y1})`);
  }
  // hollow: the inside part has floor, ceiling and (coach, cab) seats
  const ins = parts.inside;
  let lowest = 1e9, highest = -1e9;
  for (let i = 0; i < ins.positions.length / 3; i++) {
    lowest = Math.min(lowest, ins.positions[i * 3 + 1]);
    highest = Math.max(highest, ins.positions[i * 3 + 1]);
  }
  ok(lowest <= INSIDE.floor + 0.001, `${k} inside has no floor`);
  ok(highest >= INSIDE.ceil - 0.05, `${k} inside has no ceiling`);
}

// logo plates: both sides, valid UVs, in front of the skin, no further out than the door leaves
for (const k of kinds) {
  const d = buildCarDecals(k);
  ok(d.positions.length === 24 && d.uvs.length === 16 && d.indices.length === 12, `${k} decal sizes`);
  for (let i = 0; i < 4 * 2; i++) ok(Math.abs(d.positions[i * 3 + 2]) > 1.512 && Math.abs(d.positions[i * 3 + 2]) < 1.53, `${k} decal depth`);
  for (const v of d.uvs) ok(v === 0 || v === 1, `${k} decal uv`);
}

// seat eye: above the cushion (1.45), below the ceiling, inside the walls
ok(SEAT_EYE.y > 1.45 + 0.6 && SEAT_EYE.y < INSIDE.ceil - 0.5, 'seat eye height');
ok(Math.abs(SEAT_EYE.z) < INSIDE.linIn, 'seat eye inside the walls');
ok(NOSE_X.cab === 11 && NOSE_X.loco === 10, 'nose positions');
ok(CONSIST.length === 6, 'consist unchanged');

console.log(fail === 0 ? 'ALL OK' : `${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
