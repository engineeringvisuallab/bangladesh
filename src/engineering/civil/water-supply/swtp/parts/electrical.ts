import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, cyl, cylH, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

function wire(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
}
function pole(g: THREE.Group, m: Ctx['mats'], x: number, z: number, y0: number): void {
  cyl(g, 0.28, 12.5, m.trunk, x, y0 - 0.5, z, 8);
  box(g, 0.25, 0.25, 7, m.trunk, x, y0 + 11.2, z);
  for (const dz of [-2.8, 0, 2.8]) cyl(g, 0.12, 0.8, m.white, x, y0 + 11.4, z + dz, 8);
}

/** Incoming 11 kV line, substation yard (transformers + gantry), switchgear room and standby diesel generators. */
export function buildElectrical({ mats: m, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'electrical';
  const s = L.substation;
  const x0 = s.x - s.w / 2;
  const x1 = s.x + s.w / 2;
  const z0 = s.z - s.d / 2;
  const z1 = s.z + s.d / 2;
  box(g, s.w, 0.06, s.d, m.gravelBed, s.x, 0, s.z);
  // yard fence
  for (const [cx, cz, w, d] of [[s.x, z0, s.w, 0.05], [s.x, z1, s.w, 0.05], [x0, s.z, 0.05, s.d], [x1, s.z, 0.05, s.d]] as const) box(g, w, 2.4, d, m.fenceMesh, cx, 0, cz);
  // transformers
  for (const tz of [s.z - 5, s.z + 5]) {
    box(g, 4.6, 2.8, 3.2, m.casing, 44, 0.3, tz);
    for (let i = 0; i < 5; i++) box(g, 0.12, 2.2, 0.9, m.casing, 46.9, 0.5, tz - 1.3 + i * 0.65);
    cylH(g, 0.5, 4.2, m.casing, 44, 3.6, tz - 0.6, 'x', 14);
    for (const dz of [-1, 0, 1]) cyl(g, 0.15, 1.4, m.white, 42.8, 3.1, tz + dz, 8);
    for (const dz of [-1, 0, 1]) cyl(g, 0.12, 1.0, m.white, 45.4, 3.1, tz + dz, 8);
  }
  // gantry (incoming)
  const gx = 62;
  for (const gz of [s.z - 8, s.z + 8]) box(g, 0.6, 9, 0.6, m.steel, gx, 0, gz);
  box(g, 0.4, 0.4, 16.6, m.steel, gx, 9, s.z);
  for (const dz of [-4, 0, 4]) cyl(g, 0.14, 1.2, m.white, gx, 7.8, s.z + dz, 8);
  // switchgear room
  building(g, m, { x: 74, z: s.z, w: 10, d: 10, h: 4.2, door: 'W' });
  // generators (open shed)
  const gn = L.generator;
  building(g, m, { x: gn.x, z: gn.z, w: gn.w, d: gn.d, h: 4.6, open: 'S' });
  for (const dx of [-4, 3]) {
    box(g, 5, 2.0, 1.9, m.yellow, gn.x + dx, 0.2, gn.z - 1);
    box(g, 1.8, 1.9, 1.8, m.white, gn.x + dx + 3.1, 0.2, gn.z - 1);
    cyl(g, 0.22, 3.2, m.chimney, gn.x + dx - 1.5, 4.9, gn.z - 3, 10);
  }
  cylH(g, 1.1, 5, m.steel, gn.x, 1.2, gn.z + 8.5, 'x', 18); // diesel tank
  for (const dx of [-1.6, 1.6]) box(g, 0.4, 1.0, 1.6, m.concreteDark, gn.x + dx, 0, gn.z + 8.5);
  // incoming overhead line: poles outside the fence, 3 phases to the gantry
  const y1 = opts.groundY(170, s.z);
  pole(g, m, 170, s.z, y1);
  pole(g, m, 112, s.z, 0);
  for (const dz of [-2.8, 0, 2.8]) {
    wire(g, V(170, y1 + 11.6, s.z + dz), V(112, 11.6, s.z + dz), 1.5);
    wire(g, V(112, 11.6, s.z + dz), V(gx, 8.0, s.z + dz * 1.4), 2.2);
  }
  return { id: 'electrical', nameBn: 'Substation & Standby Generator', group: g };
}
