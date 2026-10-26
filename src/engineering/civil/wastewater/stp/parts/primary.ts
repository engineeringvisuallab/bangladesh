import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { buriedLine, ctank, pipe, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { clarifierMech } from './common';
import { L } from '../layout';

/** Two circular primary clarifiers: heavy solids settle (primary sludge), grease floats. */
export function buildPrimary({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'primary';
  const { xs, z, r } = L.primary;
  for (const x of xs) {
    ctank(g, site, m, { x, z, r, depth: 3.5, top: 1.0, water: m.waterPrimary, level: 0.3 });
    clarifierMech(g, m, x, z, r, 3.5, 1.0, x === xs[0] ? 0.5 : 2.2);
  }
  // feed from the grit chamber: straight to the first, around the north side to the second
  const gx = L.grit.x + L.grit.w / 2;
  pipe(g, [V(gx, 0.9, z), V(xs[0], 0.9, z)], 0.5, m.pipe.sewage);
  pipe(g, [V(gx + 4, 0.9, z), V(gx + 4, 0.9, z - 17), V(xs[1], 0.9, z - 17), V(xs[1], 0.9, z)], 0.5, m.pipe.sewage);
  // settled sewage leaves over the rim into one header that goes to the aeration tank
  const zh = -27;
  pipe(g, [V(xs[0], 0.8, z + r), V(xs[0], 0.8, zh), V(-5, 0.8, zh), V(-5, 0.8, -42), V(0.5, 0.8, -42)], 0.5, m.pipe.sewage);
  pipe(g, [V(xs[1], 0.8, z + r), V(xs[1], 0.8, zh)], 0.5, m.pipe.sewage);
  // primary sludge: buried line from both tank bottoms to the thickener
  buriedLine(g, m.pipe.sludge, [V(xs[0], 0, z + r + 2), V(xs[0], 0, 20), V(-70, 0, 20), V(-70, 0, 36)], 10);
  buriedLine(g, m.pipe.sludge, [V(xs[1], 0, z + r + 2), V(xs[1], 0, 20), V(xs[0], 0, 20)], 10);
  return { id: 'primary', nameBn: 'Primary Clarifier', group: g };
}
