import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Entrance: gate house with barrier and sign, admin building, car park, access roads and street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  // roads: gate -> E-W road (z 78) -> west road (control room) and east road (river bridge, switchyard)
  road(g, m.asphalt, 0, G.z + 3, 0, L.roadZ - 3.5, 7);
  road(g, m.asphalt, L.roadW, L.roadZ, L.roadE, L.roadZ, 7);
  road(g, m.asphalt, L.roadW, L.roadZ, L.roadW, 44, 7);
  road(g, m.asphalt, L.roadE, L.roadZ, L.roadE, 74.5, 7);
  road(g, m.asphalt, L.roadE, 49, L.roadE, 44, 7);
  for (let z = G.z; z > L.roadZ + 4; z -= 8) box(g, 0.2, 0.02, 3.5, m.white, 0, 0.07, z);
  for (let x = L.roadW + 6; x < L.roadE - 4; x += 10) box(g, 3.5, 0.02, 0.2, m.white, x, 0.07, L.roadZ);
  // gate house, barrier, sign
  building(g, m, { x: 8, z: G.z - 2, w: 6, d: 5, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, -3.2, 0, G.z);
  box(g, 4.2, 0.2, 0.2, m.red, -1.2, 3.0, G.z);
  const sign = makeSign('DAM & HYDROPOWER STATION', 15, 2.2);
  sign.position.set(0, 6.4, G.z + 3.5);
  g.add(sign);
  for (const x of [-7.2, 7.2]) box(g, 0.5, 6.4, 0.5, m.steel, x, 0, G.z + 3.5);
  // admin / visitor building and car park
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: 7, floors: 2, door: 'S' });
  box(g, A.w + 4, 0.05, 12, m.asphalt, A.x, 0, A.z - A.d / 2 - 7);
  for (let i = 0; i < 6; i++) box(g, 0.15, 0.02, 4, m.white, A.x - 11 + i * 4.4, 0.07, A.z - A.d / 2 - 7);
  // street lights along the entrance road and the E-W road
  for (let z = G.z - 6; z > L.roadZ + 6; z -= 18) {
    lightPole(g, m, 5, z, 1);
    lightPole(g, m, -5, z, -1);
  }
  for (let x = L.roadW + 10; x < L.roadE - 6; x += 24) lightPole(g, m, x, L.roadZ + 4.5, -1);
  return { id: 'gate', nameBn: 'Main gate, visitor building and roads', group: g };
}
