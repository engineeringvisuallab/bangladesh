import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, cylH, pipe, pump, valve, V, buriedLine } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Make-up water: deep tube well -> ion-exchange vessels (cation, anion, mixed bed) -> demineralised-water tanks -> deaerator. */
export function buildDm({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'dm';
  const D = L.dm;
  building(g, m, { x: D.x, z: D.z, w: D.w, d: D.d, h: 6.5, open: 'S', door: 'N' });
  const zi = D.z - 1;
  // ion-exchange vessels in a row: 2 cation (blue), 2 anion (red), 1 mixed bed (white)
  const vessels: [number, THREE.Material, number][] = [[-9, t.resinBlue, 4.2], [-5, t.resinBlue, 4.2], [-1, t.resinRed, 4.2], [3, t.resinRed, 4.2], [8, m.white, 4.8]];
  for (const [dx, mat, h] of vessels) {
    cyl(g, 1.2, h, mat, D.x + dx, 0.3, zi, 20);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.set(D.x + dx, 0.3 + h, zi);
    g.add(dome);
    for (const dz of [-0.6, 0.6]) box(g, 0.3, 0.3, 0.3, m.steel, D.x + dx + dz, 0, zi + 1.1);
  }
  box(g, D.w - 4, 0.25, 3.2, m.concreteDark, D.x, 0, zi);
  pipe(g, [V(D.x - 9, 5.2, zi + 1.6), V(D.x + 8, 5.2, zi + 1.6)], 0.25, m.pipe.feedwater);
  // chemicals for regeneration: acid and alkali tanks outside the east wall
  cyl(g, 1.8, 5, m.pipe.chemical, D.x + D.w / 2 + 4, 0, D.z - 3, 20);
  cyl(g, 1.8, 5, m.red, D.x + D.w / 2 + 4, 0, D.z + 3, 20);
  // two demineralised-water storage tanks
  const tanks = [V(-95, 0, 50), V(-95, 0, 72)];
  for (const p of tanks) {
    cyl(g, 6, 10, m.white, p.x, 0, p.z, 36);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 1.6, 36), m.roof);
    roof.position.set(p.x, 10.8, p.z);
    g.add(roof);
  }
  // deep tube well (west): raw water comes up in the pump house and flows into the plant
  box(g, 3, 3, 3, m.wall, -150, 0, 62);
  box(g, 3.4, 0.3, 3.4, m.roof, -150, 3, 62);
  cyl(g, 0.4, 5, m.steel, -150, 3.3, 62, 10);
  buriedLine(g, m.pipe.raw, [V(-150, 0, 62), V(-150, 0, 78)], 8);
  pump(g, m, -146, 62, 0, 0, 0.9);
  const raw = [V(-148, 1.2, 62), V(D.x - D.w / 2 - 0.5, 1.2, 62), V(D.x - D.w / 2 + 2, 1.2, zi + 2), V(D.x - 9, 1.2, zi + 2)];
  pipe(g, raw, 0.28, m.pipe.raw);
  flow(anim, g, raw, { color: 0xe6c79a, speed: 3.5, spacing: 2.2, size: 0.22 });
  // pure water: vessels -> storage tanks -> pipe east, up and into the deaerator
  const F = L.feed;
  const toTanks = [V(D.x + 8, 1.2, zi + 2), V(D.x + D.w / 2 - 1, 1.2, zi + 2), V(D.x + D.w / 2 - 1, 1.2, 50), V(-95 - 6, 1.2, 50)];
  pipe(g, toTanks, 0.28, m.pipe.feedwater);
  const toFeed = [V(-89, 1.2, 50), V(-70, 1.2, 50), V(-70, 1.2, F.z), V(-70, 8, F.z), V(F.x - 6, 8, F.z)];
  pipe(g, toFeed, 0.3, m.pipe.feedwater);
  valve(g, m, -80, 1.2, 50, 0.3, 'x');
  flow(anim, g, [...toTanks, V(-89, 1.2, 50), ...toFeed.slice(1)], { color: 0xbfe0ff, speed: 3.5, spacing: 2.4, size: 0.24 });
  void cylH;
  return { id: 'dm', nameBn: 'DM Plant (Water Purification)', group: g };
}
