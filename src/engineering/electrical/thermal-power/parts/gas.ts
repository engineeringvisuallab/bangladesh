import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, cylH, pipe, valve, V, buriedLine } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gas receiving & metering station (filters, meter run, pressure reducer) and the fuel line to the three burners. */
export function buildGas({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gas';
  const R = L.gas;
  building(g, m, { x: R.x, z: R.z, w: R.w, d: R.d, h: 4.5, open: 'S', door: 'N' });
  const zi = R.z - 1.5;
  // two filter vessels, a meter run and a pressure-reducing skid
  for (const dx of [-7, -3.5]) {
    cyl(g, 0.7, 2.8, m.steel, R.x + dx, 0.2, zi, 16);
    cyl(g, 0.2, 0.5, m.steel, R.x + dx, 3.0, zi, 8);
  }
  cylH(g, 0.35, 5, m.pipe.gas, R.x + 1.5, 1.2, zi, 'x', 14);
  box(g, 1.2, 1.1, 0.9, t.paintWhite, R.x + 1.5, 1.5, zi + 0.2); // flow computer
  cylH(g, 0.5, 3, t.paintGrey, R.x + 6.5, 1.3, zi, 'x', 16);
  box(g, 7, 0.2, 2, m.concreteDark, R.x - 1, 0, zi);
  // incoming pipeline (buried from the gas field in the west: marker posts, then it comes up inside the pad)
  const ix = -165;
  buriedLine(g, m.pipe.gas, [V(ix, 0, R.z), V(R.x - R.w / 2 - 6, 0, R.z)], 10);
  const inlet = [V(R.x - R.w / 2 - 6, 1.2, R.z), V(R.x - 8.5, 1.2, R.z), V(R.x - 8.5, 1.2, zi), V(R.x - 7, 1.2, zi)];
  pipe(g, inlet, 0.35, m.pipe.gas);
  valve(g, m, R.x - 12, 1.2, R.z, 0.35, 'x');
  pipe(g, [V(R.x - 7, 1.2, zi), V(R.x - 3.5, 1.2, zi), V(R.x + 6.5, 1.2, zi), V(R.x + R.w / 2 - 0.2, 1.2, zi)], 0.35, m.pipe.gas);
  // fuel line to the burners: along the ground, up the front of the boiler, header over the three burners
  const B = L.boiler;
  const main = [V(R.x + R.w / 2 - 0.2, 1.2, zi), V(R.x + R.w / 2 + 2, 1.4, zi), V(R.x + R.w / 2 + 2, 1.4, R.z), V(-104, 1.4, R.z), V(-104, 1.4, B.z + B.d / 2 + 3.5), V(-104, 9, B.z + B.d / 2 + 3.5), V(-88, 9, B.z + B.d / 2 + 3.5)];
  pipe(g, main, 0.35, m.pipe.gas, m.concreteDark);
  for (const bx of [-100, -95, -90]) pipe(g, [V(bx, 9, B.z + B.d / 2 + 3.5), V(bx, 9, B.z + B.d / 2 + 1.8)], 0.22, m.pipe.gas);
  valve(g, m, -104, 4, B.z + B.d / 2 + 3.5, 0.35, 'z');
  // gas flow dots: pipeline -> station -> burners
  const path = [V(ix, 1.2, R.z), ...inlet.slice(1), V(R.x + R.w / 2 - 0.2, 1.2, zi), ...main.slice(1, 6), V(-104, 9, B.z + B.d / 2 + 3.5), V(-95, 9, B.z + B.d / 2 + 3.5), V(-95, 9, B.z + B.d / 2 + 1.8)];
  flow(anim, g, path, { color: 0xfff2a8, speed: 5, spacing: 3, size: 0.32 });
  return { id: 'gas', nameBn: 'Gas Receiving & Metering Station', group: g };
}
