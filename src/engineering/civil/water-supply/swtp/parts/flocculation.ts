import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, pipe, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Two parallel flocculation basins with 3 compartments each and slow paddle mixers. */
export function buildFlocculation({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'flocculation';
  const f = L.floc;
  const x0 = f.x - f.w / 2;
  for (const z of [f.zN, f.zS]) {
    tank(g, site, m, { x: f.x, z, w: f.w, d: f.d, depth: 3.5, top: 1.0, water: m.waterFloc, rail: true });
    // baffle walls with alternating gaps
    [-5, 5].forEach((dx, i) => {
      const gapSide = i === 0 ? -1 : 1;
      const len = f.d - 1 - 3;
      box(g, 0.3, 3.9, len, m.concrete, f.x + dx, -3.5, z - gapSide * 1.5);
    });
    // paddle mixers
    for (const cx of [f.x - 10, f.x, f.x + 10]) {
      box(g, 0.8, 0.3, f.d + 1, m.concrete, cx, 1.0, z);
      cyl(g, 0.5, 1.0, m.motor, cx, 1.3, z, 16);
      cyl(g, 0.08, 5.2, m.steel, cx, -3.0, z, 8);
      for (const k of [-1, 1]) {
        box(g, 4.4, 0.12, 0.25, m.steel, cx, -2.2, z + k * 0.01);
        box(g, 0.25, 1.4, 0.25, m.steel, cx + k * 2.1, -2.9, z);
      }
      box(g, 0.25, 0.12, 4.4, m.steel, cx, -1.4, z);
    }
  }
  // feed from the rapid mixer: one pipe splits to both basins
  const fx = -76.5;
  pipe(g, [V(-81, 0.9, L.mixer.z), V(fx, 0.9, L.mixer.z)], 0.55, m.pipe.raw);
  pipe(g, [V(fx, 0.9, f.zN), V(fx, 0.9, f.zS)], 0.55, m.pipe.raw);
  for (const z of [f.zN, f.zS]) pipe(g, [V(fx, 0.9, z), V(x0 + 1, 0.9, z)], 0.55, m.pipe.raw);
  // outlets to the sedimentation tanks
  for (const z of [f.zN, f.zS]) pipe(g, [V(f.x + f.w / 2 - 1, 0.9, z), V(L.sed.x - L.sed.w / 2 + 1, 0.9, z)], 0.55, m.pipe.settled);
  return { id: 'flocculation', nameBn: 'Flocculation Basins', group: g };
}
