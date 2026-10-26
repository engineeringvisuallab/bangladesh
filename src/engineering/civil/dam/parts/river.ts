import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, railing, tank, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { slopeBox } from './ctx';
import { L } from '../layout';

/** Downstream river (the water the dam lets go) and the road bridge to the switchyard. */
export function buildRiver({ mats: m, t, anim, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'river';
  const R = L.river;
  const zm = (R.z0 + R.z1) / 2;
  tank(g, site, m, { x: (R.x0 + R.x1) / 2, z: zm, w: R.x1 - R.x0, d: R.z1 - R.z0, depth: R.depth, top: 0.2, water: t.river, level: -0.25 });
  flow(anim, g, [V(R.x0 + 3, -0.1, zm), V(R.x1 - 2, -0.1, zm)], { color: 0xd8f1ff, speed: 3.2, spacing: 5, size: 0.35 });
  // bridge at x = roadE: deck + two short ramps (the river walls stand a little above the ground)
  const x = L.roadE;
  box(g, 7, 0.3, 19, m.concrete, x, 0.3, zm);
  slopeBox(g, m.concrete, 7, 0.3, R.z1 + 1.5, 0.3, R.z1 + 5.5, -0.3, x);
  slopeBox(g, m.concrete, 7, 0.3, R.z0 - 5.5, -0.3, R.z0 - 1.5, 0.3, x);
  railing(g, m.steel, x - 3.4, R.z0 - 1.5, x - 3.4, R.z1 + 1.5, 0.6);
  railing(g, m.steel, x + 3.4, R.z0 - 1.5, x + 3.4, R.z1 + 1.5, 0.6);
  return { id: 'river', nameBn: 'Downstream river and bridge', group: g };
}
