import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gate house, sign, spine road, administration building, car park, street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  road(g, m.asphalt, -190, 0, 185, 0, 8);
  for (let x = -185; x < G.x - 6; x += 9) box(g, 4, 0.02, 0.2, m.white, x, 0.07, 0);
  building(g, m, { x: G.x - 4, z: G.z - 8, w: 5, d: 6, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x, 0, G.z + 5);
  box(g, 0.2, 0.2, 4.4, m.red, G.x, 3.0, G.z + 2.8);
  const sign = makeSign('Automation & Robotics Plant', 13, 2.2);
  sign.position.set(G.x + 4, 6.4, 0);
  sign.rotation.y = Math.PI / 2; // faces east (the public road)
  g.add(sign);
  for (const dz of [-6.8, 6.8]) box(g, 0.5, 6.4, 0.5, m.steel, G.x + 4, 0, dz);
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: A.h, floors: 2, open: 'S', door: 'N' });
  box(g, A.w + 6, 0.05, 12, m.asphalt, A.x, 0, A.z + A.d / 2 + 7);
  for (let x = -180; x < G.x - 10; x += 26) {
    lightPole(g, m, x, 5, 1);
    lightPole(g, m, x + 13, -5, -1);
  }
  return { id: 'gate', nameBn: 'Main Gate, Administration & Roads', group: g };
}
