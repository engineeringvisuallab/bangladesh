import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { buriedLine, ctank, pipe, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { clarifierMech } from './common';
import { L } from '../layout';

/** Two circular secondary clarifiers: bacteria flocs settle, clear water leaves over the rim. */
export function buildSecondary({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'secondary';
  const { xs, z, r } = L.secondary;
  const ax = L.aeration.x + L.aeration.w / 2; // 70
  for (const x of xs) {
    ctank(g, site, m, { x, z, r, depth: 4, top: 1.0, water: m.waterSettled, level: 0.3 });
    clarifierMech(g, m, x, z, r, 4, 1.0, x === xs[0] ? 1.2 : 2.6);
  }
  // mixed liquor from the aeration tank: straight to the first, around the north to the second
  pipe(g, [V(ax, 0.8, z), V(xs[0], 0.8, z)], 0.55, m.pipe.sewage);
  pipe(g, [V(ax + 4, 0.8, z), V(ax + 4, 0.8, z - 19), V(xs[1], 0.8, z - 19), V(xs[1], 0.8, z)], 0.55, m.pipe.sewage);
  // clear water out (high) to the header toward the chlorine contact tank
  for (const x of xs) pipe(g, [V(x, 1.6, z + r), V(x, 1.6, -24)], 0.5, m.pipe.effluent);
  pipe(g, [V(xs[0], 1.6, -24), V(xs[1], 1.6, -24)], 0.5, m.pipe.effluent);
  pipe(g, [V(106, 1.6, -24), V(106, 1.6, 4), V(106, 0.4, 4)], 0.5, m.pipe.effluent);
  // return activated sludge (RAS) back to the aeration tank inlet
  pipe(g, [V(xs[0] - 5, 0.6, z + r), V(xs[0] - 5, 0.6, -30), V(-3, 0.6, -30), V(-3, 0.6, -42), V(0.5, 0.6, -42)], 0.3, m.pipe.sludge);
  pipe(g, [V(xs[1] - 5, 0.6, z + r), V(xs[1] - 5, 0.6, -30), V(xs[0] - 5, 0.6, -30)], 0.3, m.pipe.sludge);
  // waste (surplus) sludge: buried line to the thickener
  buriedLine(g, m.pipe.sludge, [V(xs[0] + 5, 0, z + r + 2), V(xs[0] + 5, 0, -16), V(-70, 0, -16), V(-70, 0, 36)], 10);
  buriedLine(g, m.pipe.sludge, [V(xs[1] + 5, 0, z + r + 2), V(xs[1] + 5, 0, -16), V(xs[0] + 5, 0, -16)], 10);
  return { id: 'secondary', nameBn: 'Secondary Clarifier', group: g };
}
