import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, pipe, tank, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** 6 rapid sand filters (2 rows x 3) with a pipe gallery between the rows. */
export function buildFiltration({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'filtration';
  const f = L.filter;
  const zg = (f.zN + f.zS) / 2; // gallery centre = -40
  for (const z of [f.zN, f.zS]) {
    for (const x of f.xs) {
      tank(g, site, m, { x, z, w: f.w, d: f.d, depth: 3.5, top: 1.0, water: m.waterSettled, level: 0.3, rail: true });
      box(g, f.w - 1, 0.9, f.d - 1, m.sand, x, -2.4, z); // sand
      box(g, f.w - 1, 0.9, f.d - 1, m.gravelBed, x, -3.3, z); // gravel + underdrain
      for (const dz of [-4, 4]) box(g, f.w - 2, 0.4, 0.9, m.concrete, x, -0.6, z + dz); // wash-water troughs
    }
  }
  // inlet from the sedimentation tanks to the settled-water header
  const hx = 22;
  const zs = zg - 1.7;
  for (const z of [f.zN, f.zS]) {
    pipe(g, [V(11, 0.9, z), V(11, 2.0, z), V(17, 2.0, z), V(17, 2.0, zs), V(hx, 2.0, zs)], 0.5, m.pipe.settled, m.concrete);
  }
  // headers in the gallery: settled water (top), filtered water (middle), backwash (low)
  const xEnd = f.xs[2] + f.w / 2 + 1.5; // 73
  pipe(g, [V(hx, 2.0, zs), V(xEnd, 2.0, zs)], 0.5, m.pipe.settled, m.concrete);
  pipe(g, [V(hx, 1.1, zg + 1.7), V(xEnd, 1.1, zg + 1.7)], 0.4, m.pipe.filtered, m.concrete);
  pipe(g, [V(hx, 0.4, zg), V(xEnd + 2, 0.4, zg)], 0.3, m.pipe.backwash);
  for (const x of f.xs) {
    pipe(g, [V(x, 2.0, zs), V(x, 2.0, f.zN + f.d / 2 - 4)], 0.3, m.pipe.settled); // inlet to north bed
    pipe(g, [V(x, 2.0, zs), V(x, 2.0, f.zS - f.d / 2 + 4)], 0.3, m.pipe.settled); // inlet to south bed
    valve(g, m, x, 2.0, zg - 3.4, 0.3, 'z');
    valve(g, m, x, 2.0, zg + 3.4, 0.3, 'z');
    pipe(g, [V(x - 3, 1.1, zg + 1.7), V(x - 3, 1.1, f.zN + f.d / 2 - 0.2)], 0.25, m.pipe.filtered);
    pipe(g, [V(x - 3, 1.1, zg + 1.7), V(x - 3, 1.1, f.zS - f.d / 2 + 0.2)], 0.25, m.pipe.filtered);
    pipe(g, [V(x + 3, 0.4, zg), V(x + 3, 0.4, f.zN + f.d / 2 - 0.2)], 0.22, m.pipe.backwash);
    pipe(g, [V(x + 3, 0.4, zg), V(x + 3, 0.4, f.zS - f.d / 2 + 0.2)], 0.22, m.pipe.backwash);
  }
  return { id: 'filtration', nameBn: 'Rapid Sand Filters', group: g };
}
