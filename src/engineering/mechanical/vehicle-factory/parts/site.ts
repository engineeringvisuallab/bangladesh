import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Entrance: gate house, visitor and training centre, car park, plant roads and street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  road(g, m.asphalt, 0, G.z + 2, 0, L.roadZ, 8); // entrance road
  road(g, m.asphalt, -184, L.roadZ, 184, L.roadZ, 8); // main plant road
  road(g, m.asphalt, -170, -66, 170, -66, 8); // north corridor (AGVs, trucks)
  road(g, m.asphalt, -183, L.roadZ, -183, -66, 6);
  road(g, m.asphalt, 184, L.roadZ, 184, -66, 6);
  for (let z = G.z - 2; z > L.roadZ + 6; z -= 8) box(g, 0.2, 0.02, 3.5, m.white, 0, 0.07, z);
  building(g, m, { x: 8, z: G.z - 2, w: 6, d: 5, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, -3.2, 0, G.z);
  box(g, 4.2, 0.2, 0.2, m.red, -1.2, 3.0, G.z);
  const sign = makeSign('EV VEHICLE FACTORY', 14, 2.2);
  sign.position.set(0, 6.4, G.z + 2.2);
  g.add(sign);
  for (const x of [-7, 7]) box(g, 0.5, 6.4, 0.5, m.steel, x, 0, G.z + 2.2);
  const V = L.visitor;
  building(g, m, { x: V.x, z: V.z, w: V.w, d: V.d, h: 7, floors: 2, door: 'N' });
  box(g, V.w + 6, 0.05, 14, m.asphalt, V.x, 0, V.z - V.d / 2 - 8);
  for (let i = 0; i < 8; i++) box(g, 0.15, 0.02, 4, m.white, V.x - 17 + i * 4.8, 0.07, V.z - V.d / 2 - 8);
  for (let z = G.z - 8; z > L.roadZ + 8; z -= 20) {
    lightPole(g, m, 5.5, z, 1);
    lightPole(g, m, -5.5, z, -1);
  }
  for (let x = -170; x < 180; x += 26) {
    lightPole(g, m, x, L.roadZ + 5, -1);
    lightPole(g, m, x, -61, 1);
  }
  return { id: 'gate', nameBn: 'Main gate, visitor centre and roads', group: g };
}
