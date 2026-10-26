import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, cyl, pipe, pump, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Aeration tank (activated sludge) with 2 lanes, surface foam, air drop pipes and the blower house. */
export function buildAeration({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'aeration';
  const a = L.aeration;
  tank(g, site, m, { x: a.x, z: a.z, w: a.w, d: a.d, depth: 5, top: 1.0, water: m.waterAeration, level: 0.3, rail: true });
  // middle wall makes a 2-lane (U-shaped) flow path
  box(g, a.w - 8, 5.8, 0.4, m.concrete, a.x + 2, -5, a.z);
  // foam / bubbles
  for (let i = 0; i < 70; i++) {
    const fx = a.x - 32 + ((i * 37) % 64);
    const fz = a.z - 10.5 + ((i * 13) % 21);
    box(g, 0.8 + (i % 4) * 0.3, 0.04, 0.6 + (i % 3) * 0.3, m.foam, fx, 0.31, fz);
  }
  // blower house + blowers
  const b = L.blower;
  building(g, m, { x: b.x, z: b.z, w: b.w, d: b.d, h: 4.5, open: 'S' });
  for (const dx of [-5.5, 0, 5.5]) {
    box(g, 2.6, 1.6, 1.6, m.motor, b.x + dx, 0.2, b.z - 1.5);
    cyl(g, 0.55, 1.8, m.white, b.x + dx, 0.2, b.z + 0.7, 14); // silencer
    pipe(g, [V(b.x + dx, 1.8, b.z - 1.5), V(b.x + dx, 1.8, b.z - 3.8)], 0.22, m.pipe.air);
  }
  pipe(g, [V(b.x - 5.5, 1.8, b.z - 3.8), V(b.x + 5.5, 1.8, b.z - 3.8)], 0.3, m.pipe.air);
  // air header along the south wall with drop pipes into the tank
  const zh = a.z + a.d / 2 - 0.1 + 0.35; // just outside the wall
  pipe(g, [V(b.x, 1.8, b.z - 3.8), V(b.x, 1.8, zh)], 0.35, m.pipe.air);
  pipe(g, [V(a.x - 30, 1.8, zh), V(a.x + 30, 1.8, zh)], 0.35, m.pipe.air);
  for (let dx = -30; dx <= 30; dx += 10) pipe(g, [V(a.x + dx, 1.8, zh), V(a.x + dx, 1.8, zh - 3), V(a.x + dx, -4.3, zh - 3)], 0.14, m.pipe.air);
  void pump;
  return { id: 'aeration', nameBn: 'Aeration Tank & Blower House', group: g };
}
