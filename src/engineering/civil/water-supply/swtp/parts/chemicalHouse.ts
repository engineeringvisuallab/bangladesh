import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { building, cyl, pump, pipe, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Chemical house: alum, lime and polymer tanks with dosing pumps. The yellow line carries the dose to the mixer. */
export function buildChemicalHouse({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'chemical';
  const { x, z, w, d } = L.chem;
  building(g, m, { x, z, w, d, h: 5.5, open: 'S' });
  const tz = z - 3.5;
  const tanks = [
    { x: -97, r: 1.7, h: 4.2 },
    { x: -93, r: 1.7, h: 4.2 },
    { x: -88, r: 1.3, h: 3.4 },
    { x: -84, r: 0.9, h: 2.4 },
  ];
  for (const t of tanks) {
    cyl(g, t.r, t.h, m.white, t.x, 0, tz, 24);
    cyl(g, t.r + 0.05, 0.25, m.yellow, t.x, t.h * 0.55, tz, 24); // chemical hazard band
    pipe(g, [V(t.x, 0.6, tz + t.r), V(t.x, 0.6, z + 1.5)], 0.1, m.pipe.chemical);
    pump(g, m, t.x, z + 2.5, Math.PI / 2, 0, 0.5);
    pipe(g, [V(t.x - 0.28, 1.1, z + 2.5), V(t.x - 0.28, 1.8, z + 2.5), V(t.x - 0.28, 1.8, z + 4.8)], 0.1, m.pipe.chemical);
  }
  // header and the dosing line to the rapid mixer (x = -81)
  pipe(g, [V(-97.3, 1.8, z + 4.8), V(-81, 1.8, z + 4.8), V(-81, 1.8, L.mixer.z + 2.6), V(-81, 0.8, L.mixer.z + 2.6)], 0.14, m.pipe.chemical, m.concrete);
  return { id: 'chemical', nameBn: 'Chemical House (Dosing)', group: g };
}
