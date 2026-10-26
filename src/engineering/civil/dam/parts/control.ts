import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Central control room: wall of live screens (animated bars), operator desks, status lamp. Plus its car park. */
export function buildControl({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'control';
  const C = L.control;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'S', floors: 2, door: 'N' });
  box(g, 46, 0.05, 8, m.asphalt, -113, 0, 47);
  const sign = makeSign('CONTROL ROOM', 9, 1.6);
  sign.position.set(C.x, C.h + 2.6, C.z - C.d / 2 - 0.3);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const zWall = C.z - C.d / 2 + 0.5;
  const bars: THREE.Mesh[] = [];
  for (let s = 0; s < 4; s++) {
    const sx = C.x - 10.5 + s * 7;
    box(g, 6, 3.2, 0.12, t.screenBg, sx, 3.4, zWall);
    for (let b = 0; b < 6; b++) bars.push(box(g, 4.6, 0.26, 0.14, [t.barA, t.barB, t.barC][(s + b) % 3], sx, 3.45 + b * 0.4, zWall + 0.05));
  }
  every(anim, (tm) => {
    bars.forEach((b, i) => (b.scale.x = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(tm * (0.7 + (i % 5) * 0.23) + i * 1.9))));
    const k = 0.75 + 0.25 * Math.sin(tm * 3);
    t.lampG.color.setRGB(0.22 * k, 0.88 * k, 0.48 * k);
  });
  for (const dz of [-1.5, 1.5]) for (let i = 0; i < 4; i++) {
    const x = C.x - 9 + i * 6;
    box(g, 4, 0.9, 1.4, m.concreteDark, x, 0, C.z + dz);
    box(g, 1.1, 0.7, 0.1, t.screenBg, x - 0.8, 1.0, C.z + dz - 0.4);
    box(g, 1.1, 0.7, 0.1, t.screenBg, x + 0.8, 1.0, C.z + dz - 0.4);
    box(g, 0.7, 0.8, 0.7, m.steel, x, 0, C.z + dz + 1.6);
  }
  box(g, 0.5, 2.5, 0.5, m.steel, C.x + C.w / 2 - 2, C.h + 0.4, C.z);
  box(g, 0.7, 0.7, 0.7, t.lampG, C.x + C.w / 2 - 2, C.h + 2.9, C.z);
  return { id: 'control', nameBn: 'Control room', group: g };
}
