import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { building, pump, pipe, valve, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Low-lift pump house: 3 pumps (2 duty + 1 standby) lifting river water into the plant. Open shed so pumps are visible. */
export function buildIntakePump({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'intakePump';
  const { x, z, w, d } = L.intakePump;
  building(g, m, { x, z, w, d, h: 5, open: 'S' });
  const px = x - 2; // -131
  for (const zz of [z - 4, z, z + 4]) {
    pump(g, m, px, zz, Math.PI);
    pipe(g, [V(px - 0.55, 1.5, zz), V(px - 0.55, 1.8, zz), V(-126.5, 1.8, zz)], 0.3, m.pipe.raw);
    valve(g, m, -128.4, 1.8, zz, 0.3, 'x');
  }
  pipe(g, [V(-126.5, 1.8, z - 4), V(-126.5, 1.8, z + 4)], 0.5, m.pipe.raw);
  return { id: 'intakePump', nameBn: 'Intake Pump House (Low-Lift)', group: g };
}
