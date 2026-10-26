import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, pump } from '../../../core/prims';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { bx, cone, cy, fpipe, mesh } from './helpers';

/** Tank farm inside a bund wall: two floating-roof crude oil tanks (the roof rises and falls with the level), four cone-roof product tanks, the crude header and the feed pump. */
export function buildTankFarm({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'tankfarm';
  const B = L.bund;
  const w = B.x1 - B.x0;
  const d = B.z1 - B.z0;

  // ---- bund: a low wall that would hold the oil if a tank leaked (one gap in the south wall to walk in)
  const wall = (ww: number, dd: number, x: number, z: number): void => {
    box(g, ww, B.h, dd, m.concrete, x, 0, z);
  };
  wall(w, 0.6, (B.x0 + B.x1) / 2, B.z0);
  wall(0.6, d, B.x0, (B.z0 + B.z1) / 2);
  wall(0.6, d, B.x1, (B.z0 + B.z1) / 2);
  const gapA = -96;
  const gapB = -88;
  wall(gapA - B.x0, 0.6, (B.x0 + gapA) / 2, B.z1);
  wall(B.x1 - gapB, 0.6, (gapB + B.x1) / 2, B.z1);
  box(g, w, 0.08, d, m.gravel, (B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);

  // ---- crude oil tanks with a floating roof
  L.crude.forEach((c, i) => {
    mesh(g, new THREE.CylinderGeometry(c.r, c.r, c.h, 48, 1, true), t.tankWall, c.x, c.h / 2, c.z);
    const ring = mesh(g, new THREE.TorusGeometry(c.r, 0.25, 6, 48), t.steelDark, c.x, c.h, c.z);
    ring.rotation.x = Math.PI / 2;
    cy(g, c.r - 0.2, 0.3, t.steelDark, c.x, 0.15, c.z, 48); // tank floor (thin)
    const roof = new THREE.Group();
    roof.position.set(c.x, 6, c.z);
    g.add(roof);
    cy(roof, c.r - 0.45, 0.5, t.tankGrey, 0, 0, 0, 48);
    bx(roof, 1.4, 0.3, 1.4, t.steelDark, 3, 0.4, 2);
    bx(roof, 1.4, 0.3, 1.4, t.steelDark, -4, 0.4, -3);
    cy(roof, 0.35, 1.2, t.paintRed, 0, 0.9, 0, 12); // roof drain / vent
    const phase = i * Math.PI;
    every(anim, (tt) => {
      roof.position.y = 5 + 3.6 * Math.sin(tt * 0.12 + phase); // 1.4 .. 8.6 m: tank being filled / emptied
    });
    // stairs up the side
    for (let k = 0; k < 8; k++) bx(g, 1.0, 0.1, 0.5, t.steelDark, c.x + c.r + 0.7, 1.4 + k * 1.4, c.z - 2 + k * 0.5);
  });

  // ---- product tanks (cone roof), colour band = what is inside
  const bands = [t.pResidue, t.pNaphtha, t.pKero, t.pDiesel];
  L.prod.forEach((p, i) => {
    cyl(g, p.r, p.h, t.tankWhite, p.x, 0, p.z, 36);
    cyl(g, p.r + 0.03, 0.7, bands[i], p.x, p.h - 2.2, p.z, 36);
    cone(g, p.r + 0.2, 1.6, t.tankGrey, p.x, p.h + 0.8, p.z, 36);
    cyl(g, 0.15, 1.2, t.steel, p.x, p.h + 1.6, p.z, 8);
    box(g, 0.6, p.h, 0.15, t.steelDark, p.x + p.r + 0.15, 0, p.z); // ladder
  });

  // ---- crude header: both crude tanks -> feed pump
  const hy = 2.2;
  fpipe(g, anim, [[-106, hy, -35], [-106, hy, -30], [-56, hy, -30], [-56, hy, -2], [-56, 0.9, -2], [-54, 0.9, -2]], 0.38, t.pCrude, DOT.crude, 2.6);
  fpipe(g, anim, [[-80, hy, -35], [-80, hy, -30]], 0.38, t.pCrude, DOT.crude, 2.6);
  // ---- feed pump (suction on the west side) and its discharge up to the first heat exchanger
  const P = L.pump;
  pump(g, m, P.x, P.z, Math.PI, 0, 1);
  fpipe(g, anim, [[P.x - 0.55, 2.0, P.z], [P.x - 0.55, hy, P.z], [-49.5, hy, P.z], [-49.5, hy, L.exA.z], [-43.4, hy, L.exA.z]], 0.38, t.pCrude, DOT.crude, 3.4);
  return { id: 'tankfarm', nameBn: 'Tank Farm & Feed Pump', group: g };
}
