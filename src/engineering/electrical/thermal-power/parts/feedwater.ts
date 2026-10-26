import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, pump, valve, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Feed-water area: deaerator on legs, two boiler feed pumps, high-pressure heater, and the high-pressure line to the boiler drum. */
export function buildFeedwater({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'feedwater';
  const F = L.feed;
  const B = L.boiler;
  const yD = 8;
  // deaerator (horizontal vessel on legs) + steam-heating dome
  cylH(g, 1.8, 12, m.steel, F.x, yD, F.z, 'x', 24);
  cyl(g, 1.0, 2.2, m.steel, F.x + 1, yD + 1.4, F.z, 16);
  for (const dx of [-4.5, 4.5]) for (const dz of [-1, 1]) box(g, 0.5, yD - 1.8, 0.5, m.steel, F.x + dx, 0, F.z + dz);
  box(g, 14, 0.3, 4, m.concreteDark, F.x, 0, F.z);
  // feed pumps (2 x 100 %): big motors, suction from the deaerator, discharge to the HP heater and the boiler
  const pz = 3;
  pump(g, m, F.x - 3, pz, Math.PI, 0, 1.5);
  pump(g, m, F.x + 3, pz, Math.PI, 0, 1.5);
  // pipes: deaerator outlet down to the pumps, discharge header, HP heater, line to the drum
  const out = [V(F.x - 3, yD - 1.8, F.z), V(F.x - 3, 1.5, F.z), V(F.x - 3, 1.5, pz)];
  pipe(g, out, 0.45, m.pipe.feedwater);
  const hpx = F.x - 22;
  cylH(g, 0.9, 7, m.casing, hpx, 1.8, pz, 'x', 18); // HP heater
  for (const dx of [-2.5, 2.5]) box(g, 0.5, 1.0, 1.4, m.concreteDark, hpx + dx, 0, pz);
  const feed = [V(F.x - 6, 1.5, pz), V(hpx + 3.5, 1.5, pz), V(hpx - 3.5, 1.5, pz), V(-85, 1.5, pz), V(-85, 1.5, B.z + B.d / 2 + 1), V(-85, 37, B.z + B.d / 2 + 1), V(-85, 37, B.z), V(-85, 41, B.z), V(B.x + 7.6, 41, B.z)];
  pipe(g, feed, 0.5, m.pipe.feedwater, m.concreteDark);
  valve(g, m, F.x - 12, 1.5, pz, 0.4, 'x');
  pipe(g, [V(F.x - 3, 1.5, pz), V(F.x - 6, 1.5, pz)], 0.45, m.pipe.feedwater);
  flow(anim, g, [V(F.x, yD - 1.8, F.z), ...out, ...feed], { color: 0xa8d4ff, speed: 6, spacing: 2.6, size: 0.3 });
  // hot-steam extraction to the deaerator (small lagged pipe from the turbine side)
  void t;
  return { id: 'feedwater', nameBn: 'Deaerator & Feed Water Pumps', group: g };
}
