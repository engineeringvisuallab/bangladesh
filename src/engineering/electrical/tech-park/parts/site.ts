import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, lightPole, road } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Gate house, sign, spine road, street lights, plaza paving. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  road(g, m.asphalt, -170, 0, 170, 0, 9);
  for (let x = -165; x < 165; x += 9) box(g, 4, 0.02, 0.2, m.white, x, 0.07, 0);
  building(g, m, { x: G.x + 6, z: G.z - 8, w: 5, d: 6, h: 3.2 });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x + 2, 0, G.z + 5);
  box(g, 4.4, 0.2, 0.2, m.red, G.x + 2, 3.0, G.z + 2.8).rotation.y = Math.PI / 2;
  const sign = makeSign('Computer Science & Electronics Park', 14, 2.2);
  sign.position.set(G.x - 2, 6.4, 0);
  sign.rotation.y = -Math.PI / 2; // faces west (the city)
  g.add(sign);
  for (const dz of [-7.2, 7.2]) box(g, 0.5, 6.4, 0.5, m.steel, G.x - 2, 0, dz);
  for (let x = -150; x < 170; x += 26) {
    lightPole(g, m, x, 7, 1);
    lightPole(g, m, x + 13, -7, -1);
  }
  return { id: 'gate', nameBn: 'Main Gate & Roads', group: g };
}
