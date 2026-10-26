import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, cyl, cylH, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

function wire(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(20)), new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
}

/** Small substation (transformer, gantry, switchgear room) + diesel generator. */
export function buildElectrical({ mats: m, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'electrical';
  const s = L.substation;
  box(g, s.w, 0.06, s.d, m.gravelBed, s.x, 0, s.z);
  for (const [cx, cz, w, d] of [[s.x, s.z - s.d / 2, s.w, 0.05], [s.x, s.z + s.d / 2, s.w, 0.05], [s.x - s.w / 2, s.z, 0.05, s.d], [s.x + s.w / 2, s.z, 0.05, s.d]] as const) box(g, w, 2.4, d, m.fenceMesh, cx, 0, cz);
  box(g, 4.6, 2.8, 3.2, m.casing, s.x - 3, 0.3, s.z);
  for (let i = 0; i < 5; i++) box(g, 0.12, 2.2, 0.9, m.casing, s.x - 0.1, 0.5, s.z - 1.3 + i * 0.65);
  cylH(g, 0.5, 4.2, m.casing, s.x - 3, 3.6, s.z - 0.6, 'x', 14);
  for (const dz of [-1, 0, 1]) cyl(g, 0.15, 1.4, m.white, s.x - 4.2, 3.1, s.z + dz, 8);
  const gx = s.x + 6;
  for (const gz of [s.z - 4, s.z + 4]) box(g, 0.6, 8, 0.6, m.steel, gx, 0, gz);
  box(g, 0.4, 0.4, 8.6, m.steel, gx, 8, s.z);
  for (const dz of [-3, 0, 3]) cyl(g, 0.14, 1.2, m.white, gx, 6.8, s.z + dz, 8);
  // incoming line from a pole outside the south fence
  const py = opts.groundY(gx, 108);
  cyl(g, 0.28, 11.5, m.trunk, gx, py - 0.5, 108, 8);
  box(g, 0.25, 0.25, 7, m.trunk, gx + 0.0, py + 10.2, 108);
  for (const dz of [-3, 0, 3]) wire(g, V(gx + dz, py + 10.4, 108), V(gx, 7.8, s.z + dz), 0.8);
  building(g, m, { x: s.x + 3, z: s.z + 11.5 - 4, w: 8, d: 5, h: 3.6, door: 'N' });
  const gn = L.generator;
  building(g, m, { x: gn.x, z: gn.z, w: gn.w, d: gn.d, h: 4.6, open: 'S' });
  box(g, 5, 2.0, 1.9, m.yellow, gn.x - 2, 0.2, gn.z - 1);
  box(g, 1.8, 1.9, 1.8, m.white, gn.x + 1.5, 0.2, gn.z - 1);
  cyl(g, 0.22, 3.2, m.chimney, gn.x - 3.5, 4.9, gn.z - 3, 10);
  cylH(g, 1.0, 4, m.steel, gn.x, 1.1, gn.z + 6.5, 'x', 18);
  return { id: 'electrical', nameBn: 'Substation & Generator', group: g };
}
