import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, buriedLine, cyl, tank, V } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L } from '../layout';

function screwPump(g: THREE.Group, m: Ctx['mats'], x0: number, y0: number, z: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const s = new THREE.Group();
  s.position.set(x0, y0, z);
  s.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, len, 16), m.steel);
  tube.rotation.z = Math.PI / 2;
  tube.position.set(len / 2, 0, 0);
  s.add(tube);
  for (let t = 0.6; t < len; t += 0.6) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.07, 18), m.steel);
    f.rotation.z = Math.PI / 2;
    f.position.set(t, 0, 0);
    s.add(f);
  }
  box(s, len, 0.25, 2.8, m.concrete, len / 2, -1.5, 0); // trough
  box(s, 1.6, 1.4, 1.6, m.motor, len + 0.8, -0.7, 0); // gearbox + motor
  g.add(s);
}

/** Lift station with 2 screw pumps, the raised inlet channel and the fine mechanical screen. */
export function buildInlet({ mats: m, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'inlet';
  const p = L.pump;
  const c = L.channel;
  tank(g, site, m, { x: p.x, z: p.z, w: p.w, d: p.d, depth: 6, top: 1.0, water: m.waterSewage, level: -1.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.5, 8, 0.5, m.concrete, p.x + sx * (p.w / 2 - 0.3), 0, p.z + sz * (p.d / 2 - 0.3));
  box(g, p.w + 1, 0.4, p.d + 1, m.roof, p.x, 8, p.z);
  for (const zz of [p.z - 2.5, p.z + 2.5]) screwPump(g, m, p.x - 6, -4.5, zz, -122, 3.0);
  // raised channel
  const len = c.x1 - c.x0;
  const cx = (c.x0 + c.x1) / 2;
  box(g, len, 0.4, 3.4, m.concrete, cx, 2.2, c.z);
  for (const sg of [-1, 1]) box(g, len, 1.2, 0.3, m.concrete, cx, 2.6, c.z + sg * 1.55);
  box(g, len - 0.6, 0.1, 2.9, m.waterSewage, cx, 2.8, c.z);
  for (const x of [-114, -106, -100]) for (const sg of [-1, 1]) box(g, 0.6, 2.2, 0.6, m.concrete, x, 0, c.z + sg * 1.9);
  // fine screen: inclined bars + frame + rake motor + screenings bin
  const sx = L.screenX;
  const bars = box(g, 0.12, 4.4, 3.0, m.steel, sx, 2.9, c.z);
  bars.rotation.z = -0.35;
  for (const sg of [-1, 1]) box(g, 0.4, 8, 0.4, m.steel, sx, 0, c.z + sg * 2.1);
  box(g, 0.4, 0.4, 4.6, m.steel, sx, 7.6, c.z);
  box(g, 1.6, 1.3, 1.6, m.motor, sx, 8.0, c.z);
  box(g, 0.5, 3.4, 0.5, m.steel, sx - 1.4, 0.9, c.z - 3.4);
  box(g, 2.4, 1.5, 1.8, m.yellow, sx - 1.4, 0, c.z - 5);
  // trunk sewer arrives buried from the west (manhole inside the fence)
  cyl(g, 0.9, 0.35, m.concreteDark, -146, 0, p.z, 16);
  cyl(g, 0.75, 0.1, m.steel, -146, 0.35, p.z, 16);
  buriedLine(g, m.pipe.sewage, [V(-146, 0, p.z), V(-138, 0, p.z)], 8);
  return { id: 'inlet', nameBn: 'Inlet Pump Station & Screens', group: g };
}
