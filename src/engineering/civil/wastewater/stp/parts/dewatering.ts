import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, building, buriedLine, cyl, cylH, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Belt-filter-press building: digested sludge is squeezed into a dry cake that a truck carries away. */
export function buildDewatering({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'dewatering';
  const b = L.dewater;
  building(g, m, { x: b.x, z: b.z, w: b.w, d: b.d, h: 7, open: 'S' });
  // belt press: long frame with rollers and belts
  box(g, 9, 0.5, 2.8, m.steel, b.x - 2, 1.6, b.z - 1);
  box(g, 8.6, 0.12, 2.5, m.casing, b.x - 2, 2.2, b.z - 1);
  for (let i = 0; i < 5; i++) cylH(g, 0.5, 2.8, m.concreteDark, b.x - 5.6 + i * 1.7, 2.9, b.z - 1, 'z', 14);
  for (const sx of [-1, 1]) box(g, 0.4, 1.6, 0.4, m.steel, b.x - 2 + sx * 4.3, 0, b.z - 1);
  cyl(g, 1.0, 2.8, m.white, b.x + 6, 0, b.z - 3, 18); // polymer tank
  const conv = box(g, 5, 0.4, 0.9, m.steel, b.x + 4, 1.6, b.z + 1.5);
  conv.rotation.z = -0.25;
  // cake truck waiting outside
  const tx = b.x + 2;
  const tz = b.z + b.d / 2 + 6;
  box(g, 2.4, 1.4, 8, m.concreteDark, tx, 0.8, tz);
  box(g, 2.2, 1.0, 5, new THREE.MeshStandardMaterial({ color: 0x5a4a36 }), tx, 2.2, tz + 1);
  box(g, 2.4, 1.8, 2, m.red, tx, 0.8, tz - 3.8);
  for (const dz of [-3, 0.5, 3]) for (const sx of [-1.25, 1.25]) cylH(g, 0.55, 0.35, m.casing, tx + sx, 0.55, tz + dz, 'x', 12);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2, 12), new THREE.MeshStandardMaterial({ color: 0x5a4a36 }));
  pile.position.set(b.x - 6, 1, b.z + b.d / 2 + 4);
  g.add(pile);
  // digested sludge arrives by a buried line from the digester
  buriedLine(g, m.pipe.sludge, [V(-24, 0, L.digester.z + 2), V(b.x - b.w / 2 - 1, 0, L.digester.z + 2)], 9);
  return { id: 'dewatering', nameBn: 'Dewatering Building (Belt Press)', group: g };
}
