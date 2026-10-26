import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, pipe, V } from '../../../core/prims';
import { every, flow, plume } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { DOT, std } from './ctx';
import { L } from '../layout';
import { board, bx, cone, cy, fpipe, mesh, rack } from './helpers';

/** Furnace (fired heater with a glowing coil and burners) + the distillation column cut open so the trays, the rising vapour and the falling liquid can be seen, + the four product draws to the pipe rack. */
export function buildDistill({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'distill';

  // =================================================== FURNACE
  const F = L.furnace;
  const fx0 = F.x - F.w / 2;
  const fx1 = F.x + F.w / 2;
  box(g, F.w + 1.4, 0.4, F.d + 1.4, m.concreteDark, F.x, 0, F.z);
  box(g, F.w, F.h, 0.6, t.brick, F.x, 0.4, F.z - F.d / 2 + 0.3); // back wall (north)
  box(g, 0.6, F.h, F.d - 1.2, t.brick, fx0 + 0.3, 0.4, F.z); // west wall
  box(g, 0.6, F.h, F.d - 1.2, t.brick, fx1 - 0.3, 0.4, F.z); // east wall
  box(g, F.w + 0.8, 0.5, F.d + 0.8, m.roof, F.x, F.h + 0.4, F.z);
  bx(g, F.w - 1.2, F.h - 0.6, 0.08, t.hotWall, F.x, F.h / 2 + 0.4, F.z - F.d / 2 + 0.65); // glowing inner back wall
  cy(g, 1.4, 12, m.chimney, F.x, F.h + 0.9 + 6, F.z, 24); // stack
  plume(anim, g, F.x, F.h + 13.2, F.z, { count: 12, rise: 8, life: 4, size0: 1.2, size1: 4, windX: 3, windZ: 1, spread: 2, opacity: 0.25, color: 0x9a9a9a });
  // coil: crude oil zig-zags through the hot zone (two planes), a single path so the dots show the flow
  const cz1 = F.z - 3;
  const cz2 = F.z + 3;
  const xa = fx0 + 1.5;
  const xb = fx1 - 1.5;
  const pts: [number, number, number][] = [[fx0 - 0.5, 2.2, F.z], [xa, 2.2, F.z], [xa, 2.2, cz1]];
  for (let i = 0; i < 4; i++) {
    const y = 3.2 + i * 1.6;
    const [s0, s1] = i % 2 === 0 ? [xa, xb] : [xb, xa];
    pts.push([s0, y, cz1], [s1, y, cz1]);
  }
  pts.push([xa, 8.0, cz1], [xa, 8.0, cz2]);
  for (let j = 0; j < 3; j++) {
    const y = 8.0 - j * 1.6;
    const [s0, s1] = j % 2 === 0 ? [xa, xb] : [xb, xa];
    pts.push([s0, y, cz2], [s1, y, cz2]);
  }
  pts.push([xb, 4.8, F.z], [fx1 + 0.5, 4.8, F.z]);
  const coil = pts.map((p) => V(p[0], p[1], p[2]));
  pipe(g, coil, 0.3, t.hotCoil);
  flow(anim, g, coil, { color: DOT.hot, speed: 3, spacing: 1.2, size: 0.2 });
  every(anim, (tt) => {
    t.hotCoil.emissiveIntensity = 0.85 + 0.15 * Math.sin(tt * 2.3);
  });
  // burners on the floor, flames flicker
  [-5.4, -1.8, 1.8, 5.4].forEach((dx, i) => {
    cy(g, 0.4, 0.5, t.steelDark, F.x + dx, 0.65, F.z, 12);
    const fl = new THREE.Group();
    fl.position.set(F.x + dx, 0.9, F.z);
    g.add(fl);
    cone(fl, 0.55, 2.6, t.flameOuter, 0, 1.3, 0, 12).name = 'fx';
    cone(fl, 0.3, 1.8, t.flameInner, 0, 0.9, 0, 10).name = 'fx';
    every(anim, (tt) => {
      fl.scale.set(1, 0.85 + 0.22 * Math.sin(tt * 11 + i * 1.7) + 0.1 * Math.sin(tt * 23 + i), 1);
    });
  });
  // feed from the first heat exchanger, outlet to the column (partly vaporised, red-hot)
  const hy = 2.2;
  fpipe(g, anim, [[-32.6, hy, L.exA.z], [-28.5, hy, L.exA.z], [-28.5, hy, F.z], [fx0 - 0.5, hy, F.z]], 0.38, t.pCrude, DOT.crude, 3.4);
  const C = L.col;
  fpipe(g, anim, [[fx1 + 0.5, 4.8, F.z], [fx1 + 2.5, 4.8, F.z], [18, 4.8, F.z], [18, 9, F.z], [C.x - C.r, 9, C.z]], 0.4, t.pHot, DOT.hot, 3.6);

  // =================================================== DISTILLATION COLUMN
  const r = C.r;
  cyl(g, r + 0.3, C.yBase, t.steelDark, C.x, 0, C.z, 36); // skirt
  cy(g, r, 5, t.tankGrey, C.x, 6.5, C.z, 36); // bottom (residue sump)
  cy(g, r, 24, t.shell, C.x, 21, C.z, 36); // glass-like shell: trays 9 .. 33 m
  cone(g, r, 3, t.tankGrey, C.x, 34.5, C.z, 36); // head
  const dark = new THREE.Color(0x5a3a1e);
  const pale = new THREE.Color(0xf4e7a0);
  const N = 12;
  for (let k = 0; k < N; k++) {
    const y = 10 + k * 2;
    const col = dark.clone().lerp(pale, k / (N - 1));
    const lm = std(col.getHex(), { opacity: 0.75, rough: 0.2, metal: 0 });
    anim.disposables.push(lm);
    cy(g, 3.0, 0.12, t.steel, C.x, y, C.z, 36); // tray
    cy(g, 2.96, 0.3, lm, C.x, y + 0.21, C.z, 36); // liquid on the tray
    bx(g, 0.9, 1.9, 2.2, t.steelDark, C.x + (k % 2 === 0 ? 2.4 : -2.4), y - 0.9, C.z); // downcomer
  }
  // vapour rises (white), liquid falls (amber) inside the column
  for (const [dx, dz] of [[1.0, 0.7], [-0.9, -0.8]] as const) {
    flow(anim, g, [V(C.x + dx, 9.6, C.z + dz), V(C.x + dx, 32.6, C.z + dz)], { color: DOT.vapour, speed: 3.2, spacing: 1.1, size: 0.14 });
  }
  for (const dx of [-1.8, 1.8]) {
    flow(anim, g, [V(C.x + dx, 32.6, C.z), V(C.x + dx, 9.6, C.z)], { color: DOT.kero, speed: 2.4, spacing: 1.7, size: 0.15 });
  }
  // platforms, rails and a ladder
  for (const y of [12, 20, 28]) {
    const ring = mesh(g, new THREE.RingGeometry(r + 0.1, r + 1.0, 36), t.steelDark, C.x, y, C.z);
    ring.rotation.x = -Math.PI / 2;
    const rail = mesh(g, new THREE.TorusGeometry(r + 1.0, 0.05, 6, 36), t.paintYellow, C.x, y + 1.0, C.z);
    rail.rotation.x = Math.PI / 2;
  }
  bx(g, 0.15, 33, 0.7, t.steelDark, C.x + r + 0.5, 16.5, C.z);
  // temperature scale (red = hot at the bottom, blue = cold at the top)
  const scale = [0xd7301f, 0xf0643a, 0xf59e3d, 0xe8d24a, 0x6fb6e8, 0x2f72c8];
  scale.forEach((c, i) => {
    const mm = new THREE.MeshBasicMaterial({ color: c });
    anim.disposables.push(mm);
    bx(g, 0.5, 4, 0.2, mm, C.x, 11 + i * 4, C.z + r + 0.3);
  });
  const hot = makeSign('~350 °C', 3.6, 0.9);
  hot.position.set(C.x, 8.6, C.z + r + 0.45);
  g.add(hot);
  const cold = makeSign('~40 °C', 3.2, 0.9);
  cold.position.set(C.x, 33.4, C.z + r + 0.45);
  g.add(cold);

  // product draws: diesel, kerosene, naphtha, residue -> rack lanes -> product tanks
  const xs = [-2.4, -0.8, 0.8, 2.4];
  const ys = [16, 22, 29, 6.2];
  const mats = [t.pDiesel, t.pKero, t.pNaphtha, t.pResidue];
  const dots = [DOT.diesel, DOT.kero, DOT.naphtha, DOT.residue];
  const names = ['Diesel', 'Kerosene', 'Naphtha', 'Residue'];
  const tankOf = [3, 2, 1, 0];
  const ry = L.rackY;
  xs.forEach((dx, i) => {
    const tk = L.prod[tankOf[i]];
    const zs = C.z + Math.sqrt(r * r - dx * dx);
    const lane = L.lanes[i];
    fpipe(
      g,
      anim,
      [[C.x + dx, ys[i], zs], [C.x + dx, ys[i], C.z + 5], [C.x + dx, ry, C.z + 5], [C.x + dx, ry, lane], [tk.x, ry, lane], [tk.x, ry, tk.z + tk.r]],
      i === 3 ? 0.36 : 0.3,
      mats[i],
      dots[i],
      2.2,
      1.6,
    );
    const sg = makeSign(names[i], 3.0, 0.8);
    sg.position.set(C.x + dx, ys[i] + 1.3, C.z + 5.7);
    g.add(sg);
    bx(g, 0.5, ry, 0.5, t.steel, tk.x + 1.2, ry / 2, -8); // support where the line turns towards its tank
  });
  rack(g, t.steel, C.x - 2, 8.25, -117, 8.25, ry, 6);
  rack(g, t.steel, C.x, -30, C.x, 5, ry, 7);
  board(g, t.steelDark, 'Furnace', F.x, F.z + 11, 4.4);
  return { id: 'distill', nameBn: 'Distillation Column & Furnace', group: g };
}
