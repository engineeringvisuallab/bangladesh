import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, pump, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Condenser under the turbine (two-pass, tube bundle visible through glass sides) with the cooling-water pipes and the condensate line. */
export function buildCondenser({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'condenser';
  const C = L.condenser;
  const x0 = C.x - C.w / 2;
  const x1 = C.x + C.w / 2;
  const z0 = C.z - C.d / 2;
  const z1 = C.z + C.d / 2;
  const y0 = 0.9;
  const hC = 4.9;
  // shell: steel top/bottom, glass sides (tube bundle visible), water boxes at both ends
  box(g, C.w, 0.4, C.d, m.steel, C.x, y0, C.z);
  box(g, C.w, 0.4, C.d, m.steel, C.x, y0 + hC - 0.4, C.z);
  box(g, 0.2, hC, C.d, t.casingGlass, x0, y0, C.z);
  box(g, 0.2, hC, C.d, t.casingGlass, x1, y0, C.z);
  box(g, C.w, hC, 0.2, m.steel, C.x, y0, z0);
  box(g, C.w, hC, 0.2, m.steel, C.x, y0, z1);
  for (const [zc, dz] of [[z0 - 0.7, -1], [z1 + 0.7, 1]] as const) {
    box(g, C.w - 0.6, hC - 0.6, 1.2, t.paintGrey, C.x, y0 + 0.3, zc);
    void dz;
  }
  // tube bundle: rows of small tubes along z (water runs through them, steam condenses on their outside)
  for (let ix = 0; ix < 10; ix++) for (let iy = 0; iy < 4; iy++) cylH(g, 0.09, C.d, t.tubeHot, x0 + 1 + ix * 1.1, y0 + 1 + iy * 0.9, C.z, 'z', 6);
  // hotwell (collects the condensate) + two condensate extraction pumps
  box(g, 5, 0.9, 3, t.steelDark, C.x - 3.5, 0, C.z + 1);
  pump(g, m, C.x - 8.5, z1 + 6, 0, 0, 0.9);
  pump(g, m, C.x - 8.5, z1 + 10, 0, 0, 0.9);
  // condensate: hotwell -> pumps -> to the feed-water area (west)
  const F = L.feed;
  const cond = [V(C.x - 3.5, 0.5, z1 + 0.6), V(C.x - 3.5, 0.6, z1 + 3), V(C.x - 5, 0.6, z1 + 3), V(C.x - 5, 0.6, F.z), V(F.x + 4, 0.6, F.z), V(F.x + 4, 6.4, F.z)];
  pipe(g, cond, 0.4, m.pipe.feedwater);
  flow(anim, g, [V(C.x - 3.5, 1.4, C.z), ...cond], { color: 0xbfe0ff, speed: 4, spacing: 2.8, size: 0.26 });

  // cooling water: cold in (bottom nozzle, north end), hot out (top nozzle). The cooling-tower side is built in the 'cooling' part.
  const zn = z0 - 1.3;
  const cold = [V(51, 1.5, -76), V(-5, 1.5, -76), V(-5, 1.5, zn - 8), V(-5, 2.2, zn - 8), V(-5, 2.2, zn)];
  const hot = [V(1, 4.4, zn), V(1, 4.4, -58), V(80, 4.4, -58), V(80, 1.5, -58), V(80, 1.5, -66), V(L.cooling.x, 1.5, -66)];
  pipe(g, cold, 0.9, m.pipe.cooling);
  pipe(g, hot, 0.9, t.hotPipe);
  for (const x of [20, 50]) box(g, 0.6, 3.6, 0.6, m.concreteDark, x, 0, -58); // pipe supports
  flow(anim, g, cold, { color: 0xc8fff7, speed: 5, spacing: 3.4, size: 0.4 });
  flow(anim, g, hot, { color: 0xffd7a0, speed: 5, spacing: 3.4, size: 0.4 });
  // vacuum gauge lamp (green = vacuum OK) on the shell
  cyl(g, 0.25, 0.5, m.steel, x1 - 1, y0 + hC, z1 - 1, 10);
  return { id: 'condenser', nameBn: 'Condenser & Condensate Pumps', group: g };
}
