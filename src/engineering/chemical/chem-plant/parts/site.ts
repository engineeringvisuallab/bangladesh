import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gate house, sign, spine road, gate road, administration building, street lights, muster point. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  const rz = L.roadZ;
  road(g, m.asphalt, -126, rz, 126, rz, 8);
  road(g, m.asphalt, G.x, rz, G.x, G.z, 8);
  for (let x = -120; x < 124; x += 9) box(g, 4, 0.02, 0.2, m.white, x, 0.07, rz);
  for (let z = rz + 6; z < G.z - 4; z += 8) box(g, 0.2, 0.02, 3.5, m.white, G.x, 0.07, z);
  // gate house beside the road, barrier arm (raised) across it
  building(g, m, { x: G.x + 8, z: G.z - 6, w: 6, d: 5, h: 3.2, door: 'W' });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x + 4.4, 0, G.z - 2);
  box(g, 4.4, 0.2, 0.2, m.red, G.x + 2.2, 3.0, G.z - 2);
  const sign = makeSign('Chemical Process Plant', 14, 2.2);
  sign.position.set(G.x, 6.4, G.z + 4);
  sign.rotation.y = 0; // faces south (the road outside)
  g.add(sign);
  for (const dx of [-7.4, 7.4]) box(g, 0.5, 6.4, 0.5, m.steel, G.x + dx, 0, G.z + 4);
  // administration
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: A.h, floors: 2, door: 'N' });
  box(g, A.w + 6, 0.05, 14, m.asphalt, A.x, 0, A.z - A.d / 2 - 6);
  // street lights along the spine road and the gate road
  for (let x = -120; x < 124; x += 26) {
    lightPole(g, m, x, rz + 5, 1);
    lightPole(g, m, x + 13, rz - 5, -1);
  }
  for (let z = rz + 14; z < G.z - 6; z += 18) lightPole(g, m, G.x + 5, z, 1);
  // muster point: where everybody gathers in an emergency (upwind, away from the process area)
  const ms = makeSign('Muster Point', 4, 1.2);
  ms.position.set(-124, 3.2, 40);
  ms.rotation.y = Math.PI / 2;
  g.add(ms);
  box(g, 0.2, 3.2, 0.2, m.steel, -124, 0, 40);
  return { id: 'gate', nameBn: 'Main Gate, Administration & Roads', group: g };
}
