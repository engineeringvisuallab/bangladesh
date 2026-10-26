import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, pipe, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Aerated grit chamber with grit classifier and bin. */
export function buildGrit({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'grit';
  const t = L.grit;
  tank(g, site, m, { x: t.x, z: t.z, w: t.w, d: t.d, depth: 3.5, top: 1.0, water: m.waterSewage, level: 0.3, rail: true });
  // bubbles on the surface
  for (let i = 0; i < 14; i++) box(g, 0.5 + (i % 3) * 0.2, 0.05, 0.4, m.foam, t.x - 6 + (i % 7) * 2, 0.3, t.z - 3.2 + Math.floor(i / 7) * 0.7);
  box(g, t.w - 1, 0.4, 0.4, m.concrete, t.x, -3.4, t.z - 3.3); // diffuser rail on the floor
  // sewage in from the channel
  pipe(g, [V(-97, 3.0, t.z), V(t.x - 2, 3.0, t.z), V(t.x - 2, 0.6, t.z)], 0.6, m.pipe.sewage);
  // air from a small blower
  box(g, 1.6, 1.2, 1.2, m.motor, t.x + 3, 0, t.z + 7);
  cyl(g, 0.4, 1.4, m.white, t.x + 4.6, 0, t.z + 7, 12);
  pipe(g, [V(t.x + 3, 1.3, t.z + 7), V(t.x + 3, 1.3, t.z + 4.5), V(t.x + 3, 0.5, t.z + 4.5)], 0.15, m.pipe.air);
  // grit classifier (inclined screw) and bin
  const cl = box(g, 5.5, 0.8, 0.9, m.steel, t.x + 11, 1.2, t.z - 1);
  cl.rotation.z = 0.5;
  box(g, 2.4, 1.5, 1.8, m.yellow, t.x + 13, 0, t.z - 1);
  return { id: 'grit', nameBn: 'Grit Chamber', group: g };
}
