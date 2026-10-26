import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, buriedLine, cyl, pipe, tank, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Sludge drawn from the clarifiers flows by a buried line to two drying lagoons (so mud never goes back to the river). */
export function buildSludge({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'sludge';
  const l = L.lagoon;
  for (const z of l.zs) tank(g, site, m, { x: l.x, z, w: l.w, d: l.d, depth: 3, top: 0.8, water: m.sludge, level: -0.3, wall: m.soil });
  // sludge draw-off valve chamber beside the south clarifier
  box(g, 2.4, 1.0, 2.4, m.concreteDark, -20, 0, -17);
  cyl(g, 0.5, 0.15, m.steel, -20, 1.0, -17, 14);
  valve(g, m, -20, 1.4, -17, 0.3, 'x');
  buriedLine(g, m.pipe.sludge, [V(-20, 0, -14), V(-20, 0, 38), V(l.x, 0, 38), V(l.x, 0, 54)], 10);
  // inlet over the first lagoon
  pipe(g, [V(l.x, 0.2, 55), V(l.x, 1.6, 55), V(l.x, 1.6, l.zs[0] - 4), V(l.x, 0.6, l.zs[0] - 4)], 0.25, m.pipe.sludge);
  // transfer between lagoons
  pipe(g, [V(l.x + 12, 0.9, l.zs[0] + 8.5), V(l.x + 12, 0.9, l.zs[1] - 8.5)], 0.22, m.pipe.sludge);
  return { id: 'sludge', nameBn: 'Sludge Lagoons (Mud Drying Ponds)', group: g };
}
