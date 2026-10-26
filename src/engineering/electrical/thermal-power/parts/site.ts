import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gate house with barrier and sign, admin building, roads and street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  // roads: gate -> plant, and the east-west road to the switchyard
  road(g, m.asphalt, 0, G.z + 4, 0, -8, 7);
  road(g, m.asphalt, 0, 24, L.yard.x1, 24, 7);
  for (let z = G.z; z > 24; z -= 8) box(g, 0.2, 0.02, 3.5, m.white, 0, 0.07, z);
  // gate house, barrier, sign
  building(g, m, { x: 8, z: G.z - 2, w: 6, d: 5, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, -3.2, 0, G.z);
  const boom = box(g, 4.2, 0.2, 0.2, m.red, -1.2, 3.0, G.z);
  boom.rotation.z = 0;
  const sign = makeSign('Thermal Power Plant', 12, 2.2);
  sign.position.set(0, 6.4, G.z + 3.5);
  g.add(sign);
  for (const x of [-6.4, 6.4]) box(g, 0.5, 6.4, 0.5, m.steel, x, 0, G.z + 3.5);
  // admin building and car park
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: 7, floors: 2, door: 'S' });
  box(g, A.w + 4, 0.05, 10, m.asphalt, A.x, 0, A.z + A.d / 2 + 6);
  // street lights along the access road and the east road
  for (let z = G.z - 6; z > 30; z -= 18) {
    lightPole(g, m, 5, z, 1);
    lightPole(g, m, -5, z, -1);
  }
  for (let x = 20; x < L.yard.x1; x += 24) lightPole(g, m, x, 28.5, -1);
  void cyl;
  return { id: 'gate', nameBn: 'Main Gate, Administration & Roads', group: g };
}
