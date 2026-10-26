import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, pipe, valve, cylH, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Raw-water rising main to the plant. It rises over the plant road on a pipe bridge. */
export function buildRawMain({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'rawMain';
  const z = L.intakePump.z;
  const y = 1.8;
  const hi = 6.5;
  pipe(g, [V(-126.5, y, z), V(-118, y, z), V(-118, hi, z), V(-106, hi, z), V(-106, y, z), V(L.flume.x0 - 1, y, z), V(L.flume.x0 - 1, 1.3, z)], 0.5, m.pipe.raw, m.concrete);
  valve(g, m, -122, y, z, 0.5, 'x');
  // electromagnetic flow meter
  cylH(g, 0.75, 1.4, m.steel, -112 - 8, y, z, 'x', 16);
  // A-frame columns of the pipe bridge
  for (const px of [-118, -106]) {
    box(g, 0.7, hi - 0.4, 0.7, m.concrete, px, 0, z - 1.2);
    box(g, 0.7, hi - 0.4, 0.7, m.concrete, px, 0, z + 1.2);
  }
  box(g, 13, 0.4, 3.2, m.steel, -112, hi - 0.9, z);
  return { id: 'rawMain', nameBn: 'Raw Water Rising Main', group: g };
}
