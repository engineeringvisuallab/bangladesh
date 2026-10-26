import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, pipe, pump, V } from '../../../core/prims';
import { flow, plume, rain } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Natural-draft cooling tower (hyperbolic shell, air inlet with fill and spray pipes, cold basin) with its big white vapour plume, and the circulating-water pump house. */
export function buildCooling({ mats: m, t, anim, solids }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'cooling';
  const C = L.cooling;
  const yIn = 8; // height of the air-inlet opening
  // shell: hyperbola r(y) = rt * sqrt(1 + ((y - yt)/c)^2), turned around the vertical axis
  const yt = 52;
  const c = Math.sqrt((yIn - yt) ** 2 / ((C.rBase / C.rThroat) ** 2 - 1));
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = yIn + ((C.h - yIn) * i) / 24;
    prof.push(new THREE.Vector2(C.rThroat * Math.sqrt(1 + ((y - yt) / c) ** 2), y));
  }
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), t.towerShell);
  shell.position.set(C.x, 0, C.z);
  g.add(shell);
  // ring beam, inclined columns around the air inlet, basin with water
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(C.rBase + 0.3, C.rBase + 0.3, 1.0, 56, 1, true), m.concreteDS);
  ring.position.set(C.x, yIn - 0.5, C.z);
  g.add(ring);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    box(g, 0.9, yIn, 0.9, m.concrete, C.x + Math.cos(a) * (C.rBase - 0.2), 0, C.z + Math.sin(a) * (C.rBase - 0.2));
  }
  cyl(g, C.rBase + 2.5, 0.9, m.concreteDark, C.x, 0, C.z, 56);
  const water = new THREE.Mesh(new THREE.CircleGeometry(C.rBase + 1.8, 56), t.towerWater);
  water.rotation.x = -Math.PI / 2;
  water.position.set(C.x, 0.95, C.z);
  g.add(water);
  // fill (honeycomb packing, where the water and the air meet) + spray pipes above it
  cyl(g, C.rBase - 5, 3, t.fill, C.x, 2.2, C.z, 40);
  const spokes = 10;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    pipe(g, [V(C.x, 6.4, C.z), V(C.x + Math.cos(a) * (C.rBase - 6), 6.4, C.z + Math.sin(a) * (C.rBase - 6))], 0.28, t.hotPipe);
  }
  pipe(g, [V(C.x, 1.5, C.z), V(C.x, 6.4, C.z)], 0.8, t.hotPipe);
  rain(anim, g, C.x, C.z, C.rBase - 7, 6.2, 5.3, 120, 0x8fd6ff, 5);
  flow(anim, g, [V(C.x, 1.6, C.z), V(C.x, 6.4, C.z), V(C.x + C.rBase - 8, 6.4, C.z)], { color: 0xffd7a0, speed: 4, spacing: 2.4, size: 0.4 });
  // big warm-vapour plume (water vapour, NOT smoke)
  plume(anim, g, C.x, C.h + 1, C.z, { count: 30, rise: 48, life: 9, size0: 12, size1: 34, windX: 20, windZ: 6, spread: 10, opacity: 0.5, color: 0xffffff });
  solids.push({ kind: 'cyl', c: [C.x, 4, C.z], r: C.rBase + 2.5, hh: 4 });

  // cold-water return pipe: basin -> pump house; pump house with three circulating-water pumps
  const P = L.coolPump;
  building(g, m, { x: P.x, z: P.z, w: P.w, d: P.d, h: 5, open: 'S', door: 'N' });
  for (const dx of [-4.5, 0, 4.5]) pump(g, m, P.x + dx + 1, P.z - 1.5, Math.PI, 0, 1.2);
  const back = [V(C.x - C.rBase - 1, 1.5, P.z), V(P.x + P.w / 2, 1.5, P.z), V(P.x, 1.5, P.z)];
  pipe(g, back, 0.9, m.pipe.cooling);
  flow(anim, g, back, { color: 0xc8fff7, speed: 5, spacing: 3.4, size: 0.4 });
  pipe(g, [V(C.x - C.rBase + 2, 1.5, P.z), V(C.x - C.rBase - 1, 1.5, P.z)], 0.9, m.pipe.cooling);
  return { id: 'cooling', nameBn: 'Cooling Tower & Circulating Pumps', group: g };
}
