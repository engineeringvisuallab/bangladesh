import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, lightPole, road } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx } from './helpers';

/** Gate house, sign, roads, administration, car park with EV chargers, solar-powered street lights. */
export function buildSiteWorks({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const G = L.gate;
  const rz = L.roadZ;
  road(g, m.asphalt, -150, rz, 150, rz, 8);
  road(g, m.asphalt, G.x, rz, G.x, G.z, 8);
  for (let x = -144; x < 148; x += 9) box(g, 4, 0.02, 0.2, m.white, x, 0.07, rz);
  for (let z = rz + 6; z < G.z - 4; z += 8) box(g, 0.2, 0.02, 3.5, m.white, G.x, 0.07, z);
  building(g, m, { x: G.x + 8, z: G.z - 6, w: 6, d: 5, h: 3.2, door: 'W' });
  box(g, 0.4, 3.4, 0.4, m.steel, G.x + 4.4, 0, G.z - 2);
  box(g, 4.4, 0.2, 0.2, m.red, G.x + 2.2, 3.0, G.z - 2);
  const sign = makeSign('Renewable Energy Park', 14, 2.2);
  sign.position.set(G.x, 6.4, G.z + 4);
  g.add(sign);
  for (const dx of [-7.4, 7.4]) box(g, 0.5, 6.4, 0.5, m.steel, G.x + dx, 0, G.z + 4);
  // administration
  const A = L.admin;
  building(g, m, { x: A.x, z: A.z, w: A.w, d: A.d, h: A.h, floors: 2, door: 'N' });
  box(g, A.w + 6, 0.05, 12, m.asphalt, A.x, 0, A.z - A.d / 2 - 5);
  // electric-vehicle chargers on the car park (the little light is green when the park has power to spare)
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const x = A.x - 9 + i * 6;
    const z = A.z - A.d / 2 - 8.5;
    box(g, 0.5, 1.6, 0.35, t.paintBlue, x, 0, z);
    leds.push(bx(g, 0.2, 0.2, 0.05, t.ledGreen, x, 1.3, z + 0.2));
  }
  every(anim, () => {
    for (const l of leds) l.material = sim.grid > -0.05 ? t.ledGreen : t.ledAmber;
  });
  // street lights with their own small solar panel on top
  for (let x = -138; x < 146; x += 26) {
    lightPole(g, m, x, rz + 5, 1);
    const panel = bx(g, 1.6, 0.06, 1.0, t.pvDemo, x, 8.5, rz + 5);
    panel.rotation.x = 0.4;
  }
  for (let z = rz + 14; z < G.z - 6; z += 18) {
    lightPole(g, m, G.x + 5, z, 1);
  }
  // muster point
  const ms = makeSign('Muster Point', 4, 1.2);
  ms.position.set(-152, 3.2, 52);
  ms.rotation.y = Math.PI / 2;
  g.add(ms);
  cyl(g, 0.1, 3.2, t.steel, -152, 0, 52, 8);
  return { id: 'gate', nameBn: 'Main Gate, Administration & Roads', group: g };
}
