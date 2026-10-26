import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { makeCar, makeWorker, shopShell } from './ctx';
import { L } from '../layout';

/** Design studio (full-size clay model on a turntable, CAD wall, designers) and the wind tunnel (clay car in the test section, big fan, smoke streamlines over the body). */
export function buildDesign({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'design';
  const D = L.design;
  shopShell(g, m, t, { x: D.x, z: D.z, w: D.w, d: D.d, h: D.h, openS: true });
  // clay studio (west half)
  const sx = D.x - 20;
  const table = cyl(g, 3.6, 0.3, t.pressGrey, sx, 0, D.z, 28);
  const clay = makeCar(t, t.clay);
  clay.stage('painted');
  clay.position.set(0, 0.35, 0);
  const plate = new THREE.Group();
  plate.position.set(sx, 0, D.z);
  plate.add(clay);
  g.add(plate);
  spin(anim, plate, 'y', 0.25);
  void table;
  // sculptors' tool rail and a CAD wall with live bars
  box(g, 14, 4, 0.3, t.screenBg, sx, 2.6, D.z - D.d / 2 + 0.6);
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) bars.push(box(g, 0.6, 2.4, 0.1, [t.barA, t.barB, t.barC][i % 3], sx - 6.5 + i, 3.2, D.z - D.d / 2 + 0.8));
  every(anim, (tm) => bars.forEach((b, i) => (b.scale.y = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(tm * (0.6 + (i % 4) * 0.25) + i)))));
  for (let i = 0; i < 3; i++) {
    box(g, 3, 0.8, 1.4, m.concreteDark, sx - 10 + i * 4, 0, D.z + 10);
    box(g, 1.2, 0.8, 0.1, t.screenBg, sx - 10 + i * 4, 0.9, D.z + 9.4);
  }
  makeWorker(g, t, anim, sx - 4, D.z + 5, Math.PI / 2, 0.5);
  makeWorker(g, t, anim, sx + 4, D.z - 5, -Math.PI / 2, 2);
  // wind tunnel (east half): nozzle, test section with the car, diffuser, fan, return duct above
  const wx = D.x + 14;
  const wz = D.z;
  const tunnel = new THREE.MeshStandardMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.25, depthWrite: false });
  anim.disposables.push(tunnel);
  box(g, 14, 5, 7, tunnel, wx, 0, wz);
  for (const dx of [-7, 7]) box(g, 0.3, 5.2, 7.2, t.pressGrey, wx + dx, 0, wz);
  box(g, 14, 0.4, 7.4, t.pressGrey, wx, 5.0, wz);
  const car = makeCar(t, t.clay);
  car.stage('painted');
  car.position.set(wx, 0.35, wz);
  g.add(car);
  const fan = new THREE.Group();
  fan.position.set(wx + 11.5, 2.5, wz);
  g.add(fan);
  cylH(g, 3.2, 1.4, t.pressGrey, wx + 11.5, 2.5, wz, 'x', 24);
  for (let k = 0; k < 6; k++) {
    const b = box(fan, 0.12, 2.6, 0.5, t.steelSheet, 0, 0, 0);
    b.rotation.x = (k / 6) * Math.PI * 2;
    b.position.set(0, 0, 0);
    b.rotation.order = 'XYZ';
  }
  spin(anim, fan, 'x', 9);
  box(g, 6, 3, 7, t.pressGrey, wx + 16, 0, wz); // return duct
  for (const zz of [-2.4, -1.2, 0, 1.2, 2.4]) {
    const peak = 2.4 - Math.abs(zz) * 0.18;
    flow(anim, g, [V(wx - 6.6, 1.2, wz + zz), V(wx - 3, 1.35, wz + zz), V(wx - 1.2, peak, wz + zz), V(wx + 1.2, peak + 0.05, wz + zz), V(wx + 3.5, 1.7, wz + zz), V(wx + 6.6, 1.3, wz + zz)], { color: 0xe8f6ff, speed: 9, spacing: 1.6, size: 0.12 });
  }
  const s = makeSign('WIND TUNNEL  -  less drag, more range', 12, 1.4);
  s.position.set(wx, 9, D.z + D.d / 2 - 0.4);
  g.add(s);
  const s2 = makeSign('DESIGN STUDIO', 9, 1.3);
  s2.position.set(sx, 9, D.z + D.d / 2 - 0.4);
  g.add(s2);
  return { id: 'design', nameBn: 'Design studio and wind tunnel', group: g };
}
