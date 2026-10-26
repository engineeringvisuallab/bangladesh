import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, pump, pipe, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Elevated backwash water tank (gravity wash) with its 2 pumps filled from the clear-water reservoir. */
export function buildBackwash({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'backwash';
  const { x, z, r } = L.backwash;
  const y0 = 14;
  cyl(g, r, 4, m.white, x, y0, z, 28);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r + 0.2, 1.6, 28), m.roof);
  roof.position.set(x, y0 + 4 + 0.8, z);
  g.add(roof);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(g, 0.6, y0, 0.6, m.concrete, x + sx * 3.2, 0, z + sz * 3.2);
  }
  for (const h of [4.5, 9]) {
    box(g, 7.2, 0.35, 0.35, m.concrete, x, h, z - 3.2);
    box(g, 7.2, 0.35, 0.35, m.concrete, x, h, z + 3.2);
    box(g, 0.35, 0.35, 7.2, m.concrete, x - 3.2, h, z);
    box(g, 0.35, 0.35, 7.2, m.concrete, x + 3.2, h, z);
  }
  box(g, 0.1, 14, 0.5, m.steel, x + 4.3, 0, z + 1); // ladder
  // pumps + suction from the reservoir, discharge riser up into the tank
  for (const zz of [z - 2, z + 2]) {
    pump(g, m, 69, zz, 0, 0, 0.9);
    pipe(g, [V(73.5, 1.3, zz), V(72, 1.3, zz), V(72, 0.85, zz), V(70.7, 0.85, zz)], 0.2, m.pipe.filtered);
    pipe(g, [V(69.5, 1.5, zz), V(69.5, 2.2, zz), V(66.2, 2.2, zz)], 0.22, m.pipe.filtered);
  }
  pipe(g, [V(66.2, 2.2, z - 2), V(66.2, 2.2, z), V(66.2, y0 + 0.4, z)], 0.28, m.pipe.filtered);
  pipe(g, [V(80, 1.3, 4), V(73.5, 1.3, 4), V(73.5, 1.3, z - 2)], 0.3, m.pipe.filtered);
  // wash-water outlet: tank bottom -> down -> east -> north to the filter gallery
  pipe(g, [V(x, y0, z), V(x, 0.4, z), V(75, 0.4, z), V(75, 0.4, -40), V(73, 0.4, -40)], 0.3, m.pipe.backwash);
  valve(g, m, 68, 0.4, z, 0.3, 'x');
  return { id: 'backwash', nameBn: 'Backwash Overhead Tank', group: g };
}
