import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, pipe, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { arrester, breaker, ct, cvt, isolator, lattice, portal } from './equip';

const HV_PITCH = 3.5;

/** Incoming 132 kV line: two lattice towers, portal gantry, line bay (arrester, CVT, isolator, breaker, CT, isolator), 132 kV bus bars, shield masts. */
export function buildHv({ mats: m, g: gm, anim, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'hv';
  const bx = L.line.x;
  const [zIn, zOut] = L.line.towerZ; // inner dead-end tower, outer tower (outside the pad)
  const lamp = new THREE.MeshBasicMaterial({ color: 0x38e07a });
  anim.disposables.push(lamp);

  // towers: the outer one stands outside the pad on the graded skirt (its foot follows the real ground)
  const yOuter = opts.groundY(bx, zOut);
  const tIn = lattice(g, gm, bx, zIn, 26, 0);
  const tOut = lattice(g, gm, bx, zOut, 30, Math.min(0, yOuter));
  const gantry = portal(g, m, gm, bx, L.line.gantryZ, HV_PITCH, 14);
  // earth (shield) wire from tower to tower catches lightning before it reaches the phases
  pipe(g, [V(bx, tOut.earth.y + 1, zOut - 60), tOut.earth, tIn.earth], 0.04, gm.steelDark);

  // line bay down the middle, from the gantry south to the bus: arrester, CVT, isolator, breaker, CT, isolator
  const zs = { la: -72, cvt: -68, iso1: -63, cb: -58, ct: -54, iso2: -50 };
  arrester(g, m, gm, bx, zs.la, HV_PITCH);
  cvt(g, m, gm, bx, zs.cvt, HV_PITCH);
  isolator(g, m, gm, bx, zs.iso1, HV_PITCH);
  breaker(g, m, gm, bx, zs.cb, HV_PITCH, 1, lamp);
  ct(g, m, gm, bx, zs.ct, HV_PITCH);
  isolator(g, m, gm, bx, zs.iso2, HV_PITCH);

  // 132 kV bus bars (3 bars along x) and the jumpers from the bay phases
  const B = L.hvBus;
  B.z.forEach((z) => pipe(g, [V(B.x0, B.y, z), V(B.x1, B.y, z)], 0.12, gm.conductor));
  for (const x of [B.x0, B.x1 - 8, (B.x0 + B.x1) / 2 + 2]) for (const dz of B.z) box(g, 0.4, B.y - 1, 0.4, gm.tower, x, 0, dz - 1.5);
  const phaseX = [-HV_PITCH, 0, HV_PITCH];
  const conductors: THREE.Vector3[][] = [];
  phaseX.forEach((dx, i) => {
    // gantry -> down the bay -> bus
    const top = gantry[i];
    const path = [V(top.x, top.y, top.z), V(bx + dx, 6.2, zs.la), V(bx + dx, 6.2, zs.iso2 + 1.5), V(bx + dx, B.y - 1, B.z[i] - 1), V(bx + dx, B.y, B.z[i])];
    conductors.push(path);
    pipe(g, path, 0.08, gm.conductor);
  });
  // incoming line conductors: from far north, over the outer tower, to the dead-end tower, down to the gantry (with a little sag)
  const lineFlow: THREE.Vector3[][] = [];
  const sag = (p: THREE.Vector3, q: THREE.Vector3): THREE.Vector3[] => {
    const r: THREE.Vector3[] = [];
    for (let k = 1; k <= 5; k++) r.push(p.clone().lerp(q, k / 5).add(V(0, -Math.sin((k / 5) * Math.PI) * 1.4, 0)));
    return r;
  };
  phaseX.forEach((_dx, i) => {
    const a = tOut.phases[i];
    const b = tIn.phases[i];
    const far = V(a.x, a.y + 1.5, zOut - 60);
    const path = [far, ...sag(far, a), ...sag(a, b), V(b.x, b.y, zIn + 1), gantry[i]];
    pipe(g, path, 0.07, gm.conductor);
    lineFlow.push(path);
  });
  // electricity: bright yellow dots, from the north along the line, through the bay, onto the bus (flows both ways in reality; shown inbound)
  phaseX.forEach((_dx, i) => {
    flow(anim, g, [...lineFlow[i], ...conductors[i].slice(1)], { color: 0xffe066, speed: 12, spacing: 5, size: 0.28 });
  });
  // power-flow dots along the bus towards both transformers
  B.z.forEach((z, i) => {
    flow(anim, g, [V(bx + phaseX[i], B.y, z), V(L.trafoX[0] + phaseX[i], B.y, z)], { color: 0xffe066, speed: 10, spacing: 5, size: 0.26 });
    flow(anim, g, [V(bx + phaseX[i], B.y, z), V(L.trafoX[1] + phaseX[i], B.y, z)], { color: 0xffe066, speed: 10, spacing: 5, size: 0.26 });
  });
  // transformer bays (isolator, breaker, CT) between the bus and each transformer
  for (const tx of L.trafoX) {
    isolator(g, m, gm, tx, -38, HV_PITCH);
    breaker(g, m, gm, tx, -32, HV_PITCH, 1, lamp);
    ct(g, m, gm, tx, -27, HV_PITCH);
    phaseX.forEach((dx, i) => pipe(g, [V(tx + dx, B.y, B.z[i]), V(tx + dx, 6.2, B.z[i] + 1), V(tx + dx, 6.2, -40)], 0.08, gm.conductor));
    for (const dx of phaseX) pipe(g, [V(tx + dx, 6.2, -24), V(tx + dx, 6.2, 1)], 0.08, gm.conductor);
  }
  // shield masts (lightning protection of the yard) at the corners
  for (const [x, z] of [[-12, -80], [132, -80], [-12, -18], [132, -18]] as const) {
    box(g, 0.5, 24, 0.5, gm.tower, x, 0, z);
    box(g, 0.09, 4, 0.09, gm.steelDark, x, 24, z);
  }
  // yard ground: gravel, a plain safety fence line along the south side
  box(g, 150, 0.08, 74, gm.gravelPit, 60, 0, -50);
  return { id: 'hv', nameBn: '132 kV Yard (Line Bay, Bus Bars)', group: g };
}
