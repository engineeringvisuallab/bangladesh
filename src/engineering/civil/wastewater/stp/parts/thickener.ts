import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, ctank, cyl } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Circular sludge thickener: slow picket-fence stirrer thickens the thin sludge. */
export function buildThickener({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'thickener';
  const t = L.thickener;
  ctank(g, site, m, { x: t.x, z: t.z, r: t.r, depth: 4, top: 1.2, water: m.sludge, level: 0.4 });
  cyl(g, 0.5, 6, m.concrete, t.x, -4, t.z, 16);
  const arm = new THREE.Group();
  arm.position.set(t.x, 0, t.z);
  arm.rotation.y = 0.9;
  box(arm, t.r, 0.3, 0.7, m.steel, t.r / 2, 1.4, 0);
  box(arm, 1.0, 0.8, 1.2, m.motor, t.r - 0.6, 1.5, 0);
  for (let i = 0; i < 6; i++) box(arm, 0.08, 3.5, 0.08, m.steel, 1.5 + i * 1.1, -3.4, 0);
  box(arm, t.r - 1.5, 0.1, 0.1, m.steel, t.r / 2 + 0.5, -3.5, 0);
  g.add(arm);
  return { id: 'thickener', nameBn: 'Sludge Thickener', group: g };
}
