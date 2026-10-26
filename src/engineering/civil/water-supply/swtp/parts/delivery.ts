import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, buriedLine, cyl, cylH, pipe, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Treated-water delivery main: leaves the pump house above ground, then runs buried to the south gate and into the city. */
export function buildDelivery({ mats: m, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'delivery';
  const x = L.deliveryX;
  const z0 = L.highLift.z;
  pipe(g, [V(34, 2.4, z0), V(x, 2.4, z0), V(x, 2.4, 38), V(x, 0.5, 41)], 0.7, m.pipe.delivery, m.concrete);
  valve(g, m, 26, 2.4, z0, 0.7, 'x');
  cylH(g, 1.0, 1.6, m.steel, 21, 2.4, z0, 'x', 18); // electromagnetic flow meter
  box(g, 0.9, 1.0, 0.9, m.white, 21, 3.4, z0);
  // buried part: markers only
  buriedLine(g, m.pipe.delivery, [V(x, 0, 46), V(x, 0, 108)], 12);
  // valve chamber with manhole lid
  box(g, 4, 0.12, 4, m.concreteDark, x, 0, 90);
  cyl(g, 0.7, 0.15, m.steel, x, 0.12, 90, 16);
  // outlet through the south fence
  cylH(g, 0.7, 6, m.pipe.delivery, x, opts.groundY(x, 114) + 0.9, 113, 'z', 18);
  box(g, 1.8, 1.8, 0.3, m.concreteDark, x, 0, 110.2);
  return { id: 'delivery', nameBn: 'Delivery Main (to the City)', group: g };
}
