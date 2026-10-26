import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, cyl } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Control room + administration (2 floors), laboratory (cut-away) and parking. */
export function buildAdmin({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'lab';
  const a = L.admin;
  const lb = L.lab;
  building(g, m, { x: a.x, z: a.z, w: a.w, d: a.d, h: 7.5, floors: 2, door: 'S' });
  building(g, m, { x: lb.x, z: lb.z, w: lb.w, d: lb.d, h: 4.2, open: 'S' });
  for (const dx of [-4, 0, 4]) {
    box(g, 3, 0.9, 1.2, m.concrete, lb.x + dx, 0.2, lb.z - 2.5);
    box(g, 3.1, 0.08, 1.3, m.white, lb.x + dx, 1.1, lb.z - 2.5);
  }
  box(g, 0.5, 0.45, 0.4, m.white, lb.x - 4, 1.18, lb.z - 2.5);
  box(g, 0.45, 0.35, 0.35, m.white, lb.x, 1.18, lb.z - 2.5);
  box(g, 0.8, 0.5, 0.5, m.white, lb.x + 4, 1.18, lb.z - 2.5); // BOD incubator
  for (let i = 0; i < 4; i++) cyl(g, 0.1, 0.35, m.glass, lb.x + 3.2 + i * 0.3, 1.18, lb.z - 2.5 + 0.4, 8);
  box(g, 26, 0.05, 11, m.asphalt, a.x, 0, 91);
  for (let i = 0; i < 6; i++) box(g, 0.12, 0.02, 4.5, m.white, a.x - 10.5 + i * 4.2, 0.06, 91);
  [0xb03a2e, 0x2b63b0, 0xdddddd].forEach((c, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 });
    box(g, 1.8, 0.8, 4, mat, a.x - 8.4 + i * 4.2, 0.3, 91);
    box(g, 1.6, 0.7, 2.2, m.glass, a.x - 8.4 + i * 4.2, 1.1, 91);
  });
  return { id: 'lab', nameBn: 'Control Room, Administration & Laboratory', group: g };
}
