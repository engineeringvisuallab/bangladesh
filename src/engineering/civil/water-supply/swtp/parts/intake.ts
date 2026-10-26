import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cylH, pipe, tank, V, railing } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** River intake: inlet pipes with screens in the river, bar screen with rake, sluice gate, intake well (sump). */
export function buildIntake({ mats: m, site, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'intake';
  const { x, z, w, d } = L.intake;
  const depth = Math.max(7, 3.5 - opts.waterRel);
  const wy = opts.waterRel; // river water level = level in the well
  const pipeY = wy - 1.6;
  const endX = -(168 + opts.riverReach + 5);
  tank(g, site, m, { x, z, w, d, depth, top: 1.5, water: m.waterTurbid, level: wy });
  const zi = [z - 3, z + 3];
  // inlet pipes under the bank, ending in screened bell-mouths in the river
  for (const zz of zi) {
    pipe(g, [V(endX, pipeY, zz), V(x - w / 2 + 0.5, pipeY, zz)], 0.9, m.pipe.raw);
    cylH(g, 1.15, 1.6, m.steel, endX - 1.2, pipeY, zz, 'x', 14);
    box(g, 0.2, 3.0, 0.2, m.steel, endX - 2.2, pipeY - 2.5, zz); // pile
  }
  // bar screen (vertical bars) + frame
  const bx = x - w / 2 + 5; // -160
  const inner0 = z - d / 2 + 0.5;
  const nBars = 36;
  const barBottom = -depth + 1.6;
  for (let i = 0; i < nBars; i++) box(g, 0.05, 0.9 - barBottom, 0.05, m.steel, bx, barBottom, inner0 + ((d - 1) * (i + 0.5)) / nBars);
  box(g, 0.15, 0.2, d - 1, m.steel, bx, 0.9, z);
  box(g, 0.15, 0.2, d - 1, m.steel, bx, barBottom - 0.2, z);
  // trash-rake machine on a beam over the screen
  box(g, 1.0, 0.4, d + 0.4, m.steel, bx, 2.6, z);
  for (const s of [-1, 1]) box(g, 0.8, 1.1, 0.8, m.steel, bx, 1.5, z + s * (d / 2 - 0.4));
  box(g, 1.4, 1.2, 1.6, m.yellow, bx, 3.0, z - 1);
  box(g, 0.15, 3.6, 2.4, m.yellow, bx - 0.55, -1.2, z - 1);
  // partition wall with sluice-gate opening between screen chamber and well
  const px = x - w / 2 + 11; // -155
  const half = (d - 1 - 4) / 2;
  box(g, 0.5, depth + 1.5, half, m.concrete, px, -depth, z - 2 - half / 2 - 0.25);
  box(g, 0.5, depth + 1.5, half, m.concrete, px, -depth, z + 2 + half / 2 + 0.25);
  box(g, 0.3, 0.3, 4.4, m.steel, px, 1.0, z);
  box(g, 0.2, 2.6, 3.6, m.steel, px + 0.1, wy - 1.5, z);
  // walkway deck over the screen chamber and well entrance
  box(g, 6, 0.3, d - 1, m.concreteDark, x - w / 2 + 8.5, 1.2, z);
  railing(g, m.steel, x - w / 2 + 5.5, z - d / 2 + 0.6, x - w / 2 + 5.5, z + d / 2 - 0.6, 1.5);
  // suction pipes rise out of the well toward the pump house
  for (const zz of [z - 4, z, z + 4]) pipe(g, [V(-145, -depth + 1.5, zz), V(-145, 0.9, zz), V(-132.5, 0.9, zz)], 0.38, m.pipe.raw);
  return { id: 'intake', nameBn: 'Intake (Taking Water from the River)', group: g };
}
