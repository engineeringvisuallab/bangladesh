import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, buriedLine, cyl, pipe, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Chlorine contact tank, hypochlorite dosing kiosk, sampling chamber and the outfall into the river. */
export function buildDisinfection({ mats: m, site, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'disinfection';
  const c = L.contact;
  tank(g, site, m, { x: c.x, z: c.z, w: c.w, d: c.d, depth: 3.5, top: 1.0, water: m.waterClear, level: 0.3, rail: true });
  const len = c.w - 0.5 - 5;
  [c.z - 2.7, c.z + 2.7].forEach((z, i) => box(g, len, 4.1, 0.3, m.concrete, i === 0 ? c.x - c.w / 2 + 0.5 + len / 2 : c.x + c.w / 2 - 0.5 - len / 2, -3.5, z));
  // chlorine dosing kiosk
  const k = L.chlorine;
  building(g, m, { x: k.x, z: k.z, w: k.w, d: k.d, h: 3.6, open: 'S' });
  for (const dx of [-2, 0, 2]) cyl(g, 0.6, 1.8, m.white, k.x + dx, 0.2, k.z - 1.2, 16);
  pipe(g, [V(k.x - 2, 2.2, k.z), V(k.x - 4, 2.2, k.z + 3), V(110, 1.3, k.z + 3), V(110, 1.3, c.z - 6), V(110, 0.3, c.z - 6)], 0.12, m.pipe.chlorine);
  // outfall: out of the tank, buried under the road, back up at the river bank, ending under water
  const zo = c.z + 4;
  const edge = 153; // pad edge
  const endX = edge + opts.riverReach + 6;
  pipe(g, [V(c.x + c.w / 2, 0.8, zo), V(126, 0.8, zo)], 0.55, m.pipe.effluent);
  buriedLine(g, m.pipe.effluent, [V(127, 0, zo), V(150, 0, zo)], 8);
  const lowY = opts.waterRel - 1.3;
  const pts: THREE.Vector3[] = [V(151, 0.6, zo)];
  for (let t = 1; t <= 6; t++) {
    const x = edge + ((endX - edge) * t) / 6;
    pts.push(V(x, Math.max(opts.groundY(x, zo) + 0.5, lowY), zo));
  }
  pts[pts.length - 1].y = lowY;
  pipe(g, pts, 0.55, m.pipe.effluent);
  box(g, 2.2, 2.2, 1.6, m.concrete, endX + 1.4, lowY - 1, zo); // headwall at the end
  // sampling chamber (water quality is checked here)
  box(g, 3.2, 1.0, 3.2, m.concreteDark, 134, 0, zo + 4);
  cyl(g, 0.7, 0.15, m.steel, 134, 1.0, zo + 4, 16);
  return { id: 'disinfection', nameBn: 'Chlorine Contact Tank & Outfall', group: g };
}
