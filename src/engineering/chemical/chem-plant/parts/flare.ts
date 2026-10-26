import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, pipe, V } from '../../../core/prims';
import { every, plume } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cone, cy, fpipe, rack } from './helpers';

/** Flare stack with knock-out drum (burns waste gas safely) + the control room where operators watch the whole plant on screens. */
export function buildFlareControl({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'flare';

  // ---- gas line from the reflux drum to the knock-out drum, then to the stack
  const D = L.drum;
  const F = L.flare;
  const K = L.kod;
  fpipe(g, anim, [[D.x, 3.9, D.z], [D.x, 8, D.z], [D.x, 8, -65], [K.x, 8, -65], [K.x, 8, K.z], [K.x, 5.4, K.z]], 0.4, t.pGas, DOT.gas, 3.0, 1.6);
  rack(g, t.steel, D.x, -65, K.x - 6, -65, 8, 2.4);
  box(g, 6, 0.4, 6, m.concreteDark, K.x, 0, K.z);
  cyl(g, 1.6, 5, t.tankGrey, K.x, 0.4, K.z, 24); // knock-out drum: liquid drops out here, only gas goes on
  fpipe(g, anim, [[K.x + 1.6, 3.0, K.z], [F.x, 3.0, K.z], [F.x, 3.0, F.z - 0.9]], 0.4, t.pGas, DOT.gas, 2.8, 1.6);
  board(g, t.steelDark, 'Flare Knock-Out Drum', K.x - 1, K.z + 4, 6.4);

  // ---- stack: red / white bands, guy wires, tip, flame, smoke
  box(g, 6, 0.5, 6, m.concreteDark, F.x, 0, F.z);
  cyl(g, 0.9, F.h, t.steel, F.x, 0.5, F.z, 20);
  for (const y of [6.5, 20.5, 34.5]) cyl(g, 0.94, 3.5, t.paintRed, F.x, y, F.z, 20);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.5;
    pipe(g, [V(F.x, 30, F.z), V(F.x + Math.cos(a) * 15, 0.2, F.z + Math.sin(a) * 15)], 0.05, t.steelDark);
  }
  const top = F.h + 0.5;
  cy(g, 1.1, 1.2, t.steelDark, F.x, top + 0.6, F.z, 16);
  const flame = new THREE.Group();
  flame.position.set(F.x, top + 1.2, F.z);
  g.add(flame);
  cone(flame, 1.3, 5.5, t.flameOuter, 0, 2.75, 0, 14).name = 'fx';
  cone(flame, 0.75, 3.8, t.flameInner, 0, 1.9, 0, 12).name = 'fx';
  cone(flame, 0.5, 1.6, t.flameBlue, 0, 0.8, 0, 10).name = 'fx';
  every(anim, (tt) => {
    const f = 1 + 0.28 * Math.sin(tt * 9) + 0.14 * Math.sin(tt * 19.5);
    flame.scale.set(1 + 0.1 * Math.sin(tt * 13), f, 1 + 0.1 * Math.cos(tt * 11));
    flame.rotation.z = 0.08 * Math.sin(tt * 2.6);
  });
  plume(anim, g, F.x, top + 6, F.z, { count: 14, rise: 12, life: 3.2, size0: 1.5, size1: 5, windX: 5, windZ: 1, spread: 2, opacity: 0.22, color: 0x2a2a2a });
  board(g, t.steelDark, 'Flare Stack', F.x - 6, F.z + 6, 4.4);

  // ---- control room: open on the north side so the screens and consoles can be seen from the road
  const C = L.control;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'N', door: 'S' });
  const front = C.z - C.d / 2;
  const sgn = makeSign('Control Room (DCS)', 9, 1.3);
  sgn.position.set(C.x, C.h + 1.4, front - 0.5);
  sgn.rotation.y = Math.PI;
  g.add(sgn);
  box(g, 0.2, 1.4, 0.2, t.steelDark, C.x - 4, C.h + 0.4, front - 0.5);
  box(g, 0.2, 1.4, 0.2, t.steelDark, C.x + 4, C.h + 0.4, front - 0.5);
  // consoles (operators sit here), monitors that blink
  const monitors: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const x = C.x - 12 + i * 6;
    bx(g, 4.4, 0.9, 1.5, t.steelDark, x, 0.45, C.z - 1.5);
    for (const dx of [-1.1, 1.1]) monitors.push(bx(g, 1.3, 0.8, 0.1, t.screenOn, x + dx, 1.55, C.z - 2.0));
  }
  // emergency shutdown button (red mushroom in a yellow guard)
  cy(g, 0.45, 0.2, t.paintYellow, C.x, 1.0, C.z - 1.3, 16);
  cy(g, 0.28, 0.25, t.paintRed, C.x, 1.15, C.z - 1.3, 16);
  // big wall screen with a process picture: tank level bars rise and fall, lamps show alarm / normal
  bx(g, 18, 3.4, 0.15, t.screenOff, C.x, 3.3, C.z + C.d / 2 - 0.6);
  const wz = C.z + C.d / 2 - 0.72;
  bx(g, 15, 0.08, 0.05, t.screenOn, C.x, 3.3, wz);
  for (const dx of [-6, -2, 2, 6]) bx(g, 0.08, 1.2, 0.05, t.screenOn, C.x + dx, 3.9, wz);
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) bars.push(bx(g, 0.7, 1, 0.06, t.screenAmber, C.x - 7.2 + i * 4, 3.5, wz - 0.02));
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) lamps.push(bx(g, 0.35, 0.35, 0.1, t.lampGreen, C.x - 7.5 + i * 3, 5.4, wz));
  every(anim, (tt) => {
    monitors.forEach((mo, i) => {
      mo.material = Math.sin(tt * 1.7 + i * 1.3) > -0.6 ? t.screenOn : t.screenOff;
    });
    bars.forEach((b, i) => {
      const h = 0.4 + 1.6 * (0.5 + 0.5 * Math.sin(tt * 0.5 + i * 1.4));
      b.scale.y = h;
      b.position.y = 2.2 + h / 2;
    });
    lamps.forEach((l, i) => {
      l.material = i === 5 && Math.sin(tt * 3) > 0 ? t.lampRed : i === 5 ? t.lampOff : t.lampGreen;
    });
  });
  return { id: 'flare', nameBn: 'Flare Stack & Control Room', group: g };
}
