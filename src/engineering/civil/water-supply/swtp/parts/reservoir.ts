import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, pipe, railRect, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Underground clear-water reservoir (RCC) with roof slab, manholes, vents and access kiosk. */
export function buildReservoir({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'reservoir';
  const r = L.reservoir;
  tank(g, site, m, { x: r.x, z: r.z, w: r.w, d: r.d, depth: 5, top: 1.2, water: m.waterClear, level: -0.5 });
  box(g, r.w, 0.5, r.d, m.concrete, r.x, 1.2, r.z); // roof slab
  railRect(g, m.steel, r.x, r.z, r.w - 0.6, r.d - 0.6, 1.7);
  for (const dx of [-15, 0, 15]) {
    for (const dz of [-8, 8]) {
      cyl(g, 0.7, 0.4, m.concreteDark, r.x + dx, 1.7, r.z + dz, 16);
      cyl(g, 0.6, 0.1, m.steel, r.x + dx, 2.1, r.z + dz, 16);
    }
  }
  for (const dx of [-20, 20]) pipe(g, [V(r.x + dx, 1.7, r.z), V(r.x + dx, 3.4, r.z), V(r.x + dx + 0.8, 3.4, r.z), V(r.x + dx + 0.8, 2.9, r.z)], 0.18, m.steel);
  box(g, 3.2, 2.8, 3.2, m.wall, r.x + 21, 1.7, r.z + 11);
  box(g, 3.8, 0.3, 3.8, m.roof, r.x + 21, 4.5, r.z + 11);
  box(g, 0.2, 2.2, 1.2, m.door, r.x + 19.35, 1.7, r.z + 11);
  // overflow pipe on the east side
  pipe(g, [V(r.x + r.w / 2, 1.0, r.z - 8), V(r.x + r.w / 2 + 6, 1.0, r.z - 8)], 0.35, m.pipe.sludge);
  return { id: 'reservoir', nameBn: 'Clear Water Underground Reservoir', group: g };
}
