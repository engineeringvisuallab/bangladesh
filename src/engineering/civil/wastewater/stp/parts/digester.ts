import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl, pipe, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Anaerobic digester (heated, airtight) + heat exchanger, biogas holder and flare. */
export function buildDigester({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'digester';
  const d = L.digester;
  cyl(g, d.r, d.h, m.concrete, d.x, 0, d.z, 48);
  // dome roof: spherical cap, 3 m high over a 10 m radius
  const R = (d.r * d.r + 9) / 6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 12, 0, Math.PI * 2, 0, Math.asin(d.r / R)), m.concreteDark);
  dome.position.set(d.x, d.h + 3 - R, d.z);
  g.add(dome);
  cyl(g, 0.6, 1.0, m.steel, d.x, d.h + 2.9, d.z, 12);
  box(g, 0.1, d.h, 0.7, m.steel, d.x + d.r + 0.1, 0, d.z + 3); // stair/ladder
  // heat exchanger + sludge circulation
  box(g, 3.2, 1.5, 1.5, m.red, -20, 0, 43);
  pipe(g, [V(d.x + d.r, 1.0, 43), V(-20 - 1.6, 1.0, 43)], 0.25, m.pipe.sludge);
  pipe(g, [V(d.x + d.r, 4.5, 43), V(-17, 4.5, 43), V(-17, 1.5, 43)], 0.25, m.pipe.sludge);
  // thickened sludge in from the thickener
  pipe(g, [V(L.thickener.x + L.thickener.r, 1.0, d.z), V(d.x - d.r, 1.0, d.z)], 0.3, m.pipe.sludge);
  // biogas: dome -> gas holder -> flare
  const h = L.gasHolder;
  pipe(g, [V(d.x, d.h + 3.4, d.z), V(d.x, 20, d.z), V(d.x, 20, h.z), V(d.x, 7.6, h.z)], 0.25, m.pipe.biogas);
  box(g, 0.4, 20, 0.4, m.steel, d.x, 0, (d.z + h.z) / 2);
  cyl(g, h.r, 3, m.concreteDark, h.x, 0, h.z, 32);
  const mem = new THREE.Mesh(new THREE.SphereGeometry(h.r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.membrane);
  mem.scale.y = 0.8;
  mem.position.set(h.x, 3, h.z);
  g.add(mem);
  const f = L.flare;
  pipe(g, [V(h.x - h.r, 1.2, h.z), V(f.x, 1.2, f.z)], 0.2, m.pipe.biogas);
  cyl(g, 0.22, 7, m.steel, f.x, 0, f.z, 10);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 10), m.pipe.biogas);
  flame.position.set(f.x, 7.9, f.z);
  g.add(flame);
  return { id: 'digester', nameBn: 'Anaerobic Digester & Biogas', group: g };
}
