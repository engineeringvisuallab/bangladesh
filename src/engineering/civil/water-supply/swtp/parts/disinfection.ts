import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, cyl, pipe, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Chlorine contact tank (baffled channel so the water stays in contact long enough) + chlorine house. */
export function buildDisinfection({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'disinfection';
  const c = L.contact;
  tank(g, site, m, { x: c.x, z: c.z, w: c.w, d: c.d, depth: 4, top: 1.0, water: m.waterClear, level: 0.3, rail: true });
  const x0 = c.x - c.w / 2 + 0.5;
  const x1 = c.x + c.w / 2 - 0.5;
  const len = c.w - 0.5 - 5;
  const zw = [c.z - 5.75, c.z, c.z + 5.75];
  zw.forEach((z, i) => {
    const fromWest = i % 2 === 0;
    box(g, len, 4.6, 0.3, m.concrete, fromWest ? x0 + len / 2 : x1 - len / 2, -4, z);
  });
  // filtered water in (from the filter gallery) and disinfected water out (to the reservoir)
  pipe(g, [V(73, 1.1, -38.3), V(92, 1.1, -38.3), V(92, 1.1, -49), V(97, 1.1, -49)], 0.4, m.pipe.filtered, m.concrete);
  pipe(g, [V(97, 0.5, c.z + 9), V(94, 0.5, c.z + 9), V(94, 0.5, 1)], 0.45, m.pipe.delivery, m.concrete);
  // chlorine house
  const h = L.chlorine;
  building(g, m, { x: h.x, z: h.z, w: h.w, d: h.d, h: 4.5, open: 'S' });
  for (let i = 0; i < 4; i++) {
    const cx = h.x - 5 + i * 2.2;
    box(g, 1.3, 0.2, 1.3, m.concreteDark, cx, 0.2, h.z - 3.5);
    cyl(g, 0.4, 1.6, m.pipe.chlorine, cx, 0.4, h.z - 3.5, 16);
    cyl(g, 0.08, 0.3, m.steel, cx, 2.0, h.z - 3.5, 8);
  }
  box(g, 1.8, 2.0, 0.9, m.white, h.x + 5, 0.2, h.z - 3.5); // chlorinator
  pipe(g, [V(h.x - 5, 2.3, h.z - 3.5), V(h.x + 5, 2.3, h.z - 3.5), V(h.x + 5, 2.3, h.z + 1)], 0.1, m.pipe.chlorine);
  pipe(g, [V(h.x + 5, 2.3, h.z + 1), V(108, 1.3, h.z + 1), V(108, 1.3, c.z - 8.5), V(108, 0.2, c.z - 8.5)], 0.12, m.pipe.chlorine);
  return { id: 'disinfection', nameBn: 'Chlorine Contact Tank & Chlorine Room', group: g };
}
