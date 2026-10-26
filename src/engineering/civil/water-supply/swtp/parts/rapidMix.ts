import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, tank } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Parshall flume (measures flow) followed by the rapid-mix chamber where coagulant is mixed in. */
export function buildRapidMix({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'rapidMix';
  const { x0, z } = L.flume;
  // Parshall flume: wide inlet, narrow throat, wide outlet
  const segs = [
    { xa: x0, xb: x0 + 6, w: 4 },
    { xa: x0 + 6, xb: x0 + 9, w: 1.8 },
    { xa: x0 + 9, xb: x0 + 14, w: 4 },
  ];
  for (const s of segs) {
    const cx = (s.xa + s.xb) / 2;
    const len = s.xb - s.xa;
    box(g, len, 0.3, s.w + 0.6, m.concreteDark, cx, 0, z);
    for (const sg of [-1, 1]) box(g, len, 1.9, 0.3, m.concrete, cx, 0, z + sg * (s.w / 2 + 0.15));
    box(g, len, 0.1, s.w, m.waterTurbid, cx, 0.9, z);
  }
  for (const xe of [x0 + 6, x0 + 9]) {
    box(g, 0.3, 1.9, 1.1, m.concrete, xe, 0, z - 1.45);
    box(g, 0.3, 1.9, 1.1, m.concrete, xe, 0, z + 1.45);
  }
  // staff gauge + level sensor on the throat
  box(g, 0.1, 2.6, 0.1, m.red, x0 + 7.5, 0, z - 1.4);
  box(g, 0.6, 0.6, 0.6, m.white, x0 + 7.5, 2.0, z + 1.4);
  // rapid mixer
  const mx = L.mixer;
  tank(g, site, m, { x: mx.x, z: mx.z, w: mx.w, d: mx.d, depth: 3, top: 1.2, water: m.waterTurbid, level: 0.6 });
  box(g, mx.w + 1, 0.3, 0.9, m.concrete, mx.x, 1.3, mx.z);
  cyl(g, 0.45, 1.0, m.motor, mx.x, 1.6, mx.z, 16);
  cyl(g, 0.07, 5.2, m.steel, mx.x, -3.0, mx.z, 8);
  box(g, 2.0, 0.12, 0.35, m.steel, mx.x, -2.5, mx.z);
  box(g, 0.35, 0.12, 2.0, m.steel, mx.x, -2.5, mx.z);
  return { id: 'rapidMix', nameBn: 'Parshall Flume & Rapid Mixing', group: g };
}
