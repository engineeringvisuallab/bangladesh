import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, pipe, V } from '../../../core/prims';
import { flow, plume, rain, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cx, cy, fpipe, mesh } from './helpers';

/** Two shell-and-tube heat exchangers (one cut open), the water cooling tower, and the air-cooled overhead condenser with its reflux drum. */
export function buildExchange({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'exchange';

  // ---- shell-and-tube exchanger, axis along x, centre height 2.2
  const shellTube = (x: number, z: number, cut: boolean): void => {
    const y = 2.2;
    cx(g, 1.4, 8.8, cut ? t.shell : t.tankGrey, x, y, z, 28);
    cx(g, 1.55, 1.0, t.paintBlue, x - 4.9, y, z, 28); // end channels (tube-side fluid)
    cx(g, 1.55, 1.0, t.paintBlue, x + 4.9, y, z, 28);
    for (const dx of [-2.8, 2.8]) bx(g, 1.0, 1.2, 2.4, m.concreteDark, x + dx, 0.6, z);
    cy(g, 0.35, 0.8, t.steel, x + 3.2, 3.9, z, 12); // shell nozzle in (top)
    cy(g, 0.35, 0.8, t.steel, x - 3.2, 0.6, z, 12); // shell nozzle out (bottom)
    if (!cut) return;
    for (const dx of [-4.4, 4.4]) cx(g, 1.38, 0.12, t.steel, x + dx, y, z, 28); // tube sheets
    const tubes: [number, number][] = [[0, 0], [0.5, 0], [-0.5, 0], [0.25, 0.45], [-0.25, 0.45], [0.25, -0.45], [-0.25, -0.45]];
    for (const [dy, dz] of tubes) cx(g, 0.11, 8.8, t.copper, x, y + dy, z + dz, 8);
    for (let k = 0; k < 3; k++) bx(g, 0.1, 1.4, 2.7, t.steel, x - 2.2 + k * 2.2, y + (k % 2 === 0 ? 0.7 : -0.7), z); // baffles
    // tube side: cold crude west -> east; shell side: hot residue east -> west (opposite = counter-current)
    for (const [dy, dz] of [[0, 0], [0.5, 0], [-0.25, 0.45]] as const) {
      flow(anim, g, [V(x - 4.4, y + dy, z + dz), V(x + 4.4, y + dy, z + dz)], { color: DOT.crude, speed: 2.4, spacing: 1.3, size: 0.12 });
    }
    for (const dz of [-1.0, 1.0]) flow(anim, g, [V(x + 4.3, y, z + dz), V(x - 4.3, y, z + dz)], { color: DOT.hot, speed: 2.4, spacing: 1.6, size: 0.15 });
  };
  const A = L.exA;
  const B = L.exB;
  shellTube(A.x, A.z, true);
  shellTube(B.x, B.z, false);
  // hot residue enters A at the top (east) and leaves at the bottom (west); same for the hot product in B
  for (const z of [A.z, B.z]) {
    fpipe(g, anim, [[A.x + 3.2, 6.0, z], [A.x + 3.2, 4.3, z]], 0.3, t.pHot, DOT.hot, 2.2);
    fpipe(g, anim, [[A.x - 3.2, 0.3, z], [A.x - 3.2, 0.3, z - 3]], 0.3, t.pHot, DOT.warm, 2.2);
  }
  // cooling water for exchanger B: cold from the tower basin to the east end, warm back to the top of the tower
  const T = L.tower;
  const cw = 1.0;
  fpipe(g, anim, [[-30, cw, T.z + 2.5], [-30, cw, B.z], [-30, 2.2, B.z], [B.x + 5.4, 2.2, B.z]], 0.36, t.pCold, DOT.cold, 2.4);
  fpipe(g, anim, [[B.x - 5.4, 2.2, B.z], [-46, 2.2, B.z], [-46, cw, B.z], [-46, cw, T.z + 4], [-45, cw, T.z + 4], [-45, 7.5, T.z + 4], [-45, 7.5, T.z + 1]], 0.36, t.pWarm, DOT.warm, 2.4);

  // ---- cooling tower: two cells; cell 1 is cut open (south wall missing) so the fill and the falling water show
  const cells = [-43, -33];
  cells.forEach((x, i) => {
    box(g, 8.4, 1.2, 8.4, m.concreteDark, x, 0, T.z); // basin
    const wallMat = t.paintGreen;
    box(g, 0.4, 7, 8, wallMat, x - 3.8, 1.2, T.z);
    box(g, 0.4, 7, 8, wallMat, x + 3.8, 1.2, T.z);
    box(g, 8, 7, 0.4, wallMat, x, 1.2, T.z - 3.8);
    if (i === 1) {
      box(g, 8, 7, 0.4, wallMat, x, 1.2, T.z + 3.8);
      for (let k = 0; k < 5; k++) bx(g, 8.1, 0.15, 0.15, t.steelDark, x, 2.2 + k * 1.2, T.z + 4.05); // louvres
    } else {
      for (let k = 0; k < 8; k++) bx(g, 7.2, 0.12, 7.2, t.paintWhite, x, 2.6 + k * 0.45, T.z); // fill packing
      rain(anim, g, x, T.z, 3.2, 7.4, 1.5, 60, 0x7fd0ff, 5);
    }
    box(g, 8.4, 0.4, 8.4, m.roof, x, 8.2, T.z);
    cy(g, 2.7, 1.4, t.steel, x, 9.3, T.z, 28); // fan stack
    const fan = new THREE.Group();
    fan.position.set(x, 9.0, T.z);
    g.add(fan);
    for (let k = 0; k < 4; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = (k * Math.PI) / 2;
      bx(holder, 0.5, 0.06, 2.4, t.steelDark, 0, 0, 1.3);
      fan.add(holder);
    }
    cy(fan, 0.35, 0.5, t.steel, 0, 0, 0, 10);
    spin(anim, fan, 'y', 8);
    plume(anim, g, x, 10.2, T.z, { count: 14, rise: 9, life: 3.5, size0: 2.2, size1: 6, windX: 3, windZ: 1, spread: 3, opacity: 0.3, color: 0xffffff });
  });

  // ---- overhead condenser: an air cooler (fan blows air over the finned tubes) on a steel frame
  const K = L.cooler;
  for (const dx of [-4.5, 4.5]) for (const dz of [-1.6, 1.6]) bx(g, 0.6, 6.2, 0.6, t.steelDark, K.x + dx, 3.1, K.z + dz);
  bx(g, 9.6, 0.3, 3.8, t.steelDark, K.x, 6.2, K.z);
  bx(g, 9, 0.9, 3.0, t.fin, K.x, 6.8, K.z); // finned tube bundle
  for (const dx of [-5.2, 5.2]) bx(g, 0.8, 1.3, 3.4, t.paintBlue, K.x + dx, 6.8, K.z); // inlet / outlet headers
  for (const dx of [-2.4, 2.4]) {
    cy(g, 1.9, 0.3, t.steel, K.x + dx, 7.5, K.z, 24); // fan ring
    const fan = new THREE.Group();
    fan.position.set(K.x + dx, 7.7, K.z);
    g.add(fan);
    for (let k = 0; k < 4; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = (k * Math.PI) / 2;
      bx(holder, 0.4, 0.05, 1.8, t.steelDark, 0, 0, 0.95);
      fan.add(holder);
    }
    spin(anim, fan, 'y', 9);
    plume(anim, g, K.x + dx, 8.6, K.z, { count: 8, rise: 4, life: 2.6, size0: 1, size1: 3, windX: 0, windZ: -0.8, spread: 1.4, opacity: 0.15, color: 0xffd0a0 });
  }
  // vapour from the column head down to the cooler, condensed liquid to the reflux drum
  const C = L.col;
  fpipe(g, anim, [[C.x, 36.6, C.z], [C.x, 38.6, C.z], [K.x + 6.4, 38.6, C.z], [K.x + 6.4, 38.6, K.z], [K.x + 6.4, 6.8, K.z], [K.x + 5.6, 6.8, K.z]], 0.5, t.pVapour, DOT.vapour, 3.2, 1.4);
  const D = L.drum;
  fpipe(g, anim, [[K.x - 5.6, 6.8, K.z], [K.x - 6.8, 6.8, K.z], [K.x - 6.8, 2.4, K.z], [D.x + 3.6, 2.4, K.z]], 0.32, t.pReflux, DOT.reflux, 2.2);
  // reflux drum (horizontal vessel on two saddles)
  cx(g, 1.5, 7, t.tankGrey, D.x, 2.4, D.z, 24);
  for (const dx of [-2.2, 2.2]) bx(g, 0.9, 1.0, 2.2, m.concreteDark, D.x + dx, 0.5, D.z);
  mesh(g, new THREE.SphereGeometry(1.5, 16, 12), t.tankGrey, D.x - 3.5, 2.4, D.z);
  mesh(g, new THREE.SphereGeometry(1.5, 16, 12), t.tankGrey, D.x + 3.5, 2.4, D.z);
  // reflux: part of the liquid goes back to the top tray of the column
  fpipe(g, anim, [[D.x - 5, 2.4, D.z], [20.5, 2.4, D.z], [20.5, 32.6, D.z], [20.5, 32.6, C.z], [C.x - C.r, 32.6, C.z]], 0.3, t.pReflux, DOT.reflux, 2.4, 1.5);
  // pipe support posts for the long vertical lines
  for (const [px, pz] of [[20.5, D.z], [K.x + 6.4, K.z]] as const) pipe(g, [V(px + 0.9, 0, pz), V(px + 0.9, 32, pz)], 0.12, t.steelDark);
  board(g, t.steelDark, 'Heat Exchanger', A.x, -6.5, 5.6);
  board(g, t.steelDark, 'Cooling Tower', T.x, -51, 5.6);
  board(g, t.steelDark, 'Air Cooler (Condenser)', K.x, -47, 6.4);
  board(g, t.steelDark, 'Reflux Drum', D.x, -47.5, 4.4);
  return { id: 'exchange', nameBn: 'Heat Exchangers, Cooling Tower & Condenser', group: g };
}
