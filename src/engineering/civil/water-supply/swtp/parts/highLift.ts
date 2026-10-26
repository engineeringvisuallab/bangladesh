import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { building, pipe, pump, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** High-lift pump house: 4 pumps (3 duty + 1 standby) that push treated water into the city network. */
export function buildHighLift({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'highLift';
  const { x, z, w, d } = L.highLift;
  building(g, m, { x, z, w, d, h: 6, open: 'S' });
  const zs = [z - 4.2, z - 1.4, z + 1.4, z + 4.2];
  // suction main from the reservoir (+ suction header outside the east wall)
  pipe(g, [V(80, 0.9, z), V(52, 0.9, z)], 0.55, m.pipe.delivery, m.concrete);
  pipe(g, [V(52, 0.9, zs[0]), V(52, 0.9, zs[3])], 0.55, m.pipe.delivery);
  for (const zz of zs) {
    pump(g, m, 44, zz, 0, 0, 1.0);
    pipe(g, [V(52, 0.9, zz), V(45.8, 0.9, zz)], 0.35, m.pipe.delivery);
    valve(g, m, 49, 0.9, zz, 0.35, 'x');
    pipe(g, [V(44.55, 1.4, zz), V(44.55, 2.4, zz), V(34, 2.4, zz)], 0.35, m.pipe.delivery);
    valve(g, m, 38, 2.4, zz, 0.35, 'x');
  }
  pipe(g, [V(34, 2.4, zs[0]), V(34, 2.4, zs[3])], 0.6, m.pipe.delivery);
  return { id: 'highLift', nameBn: 'High-Lift Pump House', group: g };
}
