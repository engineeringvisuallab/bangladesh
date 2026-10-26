import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gate house, sign, roads and street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  road(g, m.asphalt, G.x, -92, G.x, 70, 7);
  for (const [z, x1] of [[-14, 150], [16, 135], [60, 135]] as const) road(g, m.asphalt, G.x, z, x1, z, 6);
  for (let z = G.z + 6; z < 66; z += 8) box(g, 0.2, 0.02, 3.5, m.white, G.x, 0.07, z);
  building(g, m, { x: G.x + 8, z: G.z + 2, w: 6, d: 5, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x - 3.2, 0, G.z);
  box(g, 4.2, 0.2, 0.2, m.red, G.x - 1.2, 3.0, G.z);
  const sign = makeSign('Grid Substation', 12, 2.2);
  sign.position.set(G.x, 6.4, G.z - 3.5);
  sign.rotation.y = Math.PI; // faces the road outside (north)
  g.add(sign);
  for (const dx of [-6.4, 6.4]) box(g, 0.5, 6.4, 0.5, m.steel, G.x + dx, 0, G.z - 3.5);
  for (let z = G.z + 8; z < 66; z += 20) {
    lightPole(g, m, G.x + 5, z, 1);
    lightPole(g, m, G.x - 5, z, -1);
  }
  return { id: 'gate', nameBn: 'Main Gate & Roads', group: g };
}
