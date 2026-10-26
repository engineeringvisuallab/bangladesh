import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH } from '../../../core/prims';
import { every, rain, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, follow, makeWorker, shopShell } from './ctx';
import { L, LINE_Z, ROW, SHOP } from '../layout';

const Z = LINE_Z;

/** End of line: water-leak booth (rain), roller dynamometer, wheel alignment, ADAS camera targets, headlamp aiming, final inspection - then the vehicle yard and the car carrier. */
export function buildEol({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'eol';
  const S = SHOP.eol;
  shopShell(g, m, t, { x: (S.x0 + S.x1) / 2, z: (ROW.z0 + ROW.z1) / 2, w: S.x1 - S.x0, d: ROW.d, h: S.h, lineZ: Z, openS: true });
  box(g, S.x1 - S.x0, 0.3, 2.4, t.pressGrey, (S.x0 + S.x1) / 2, 0, Z);
  // water test booth (x 124..134): nozzles on an arch rain on the car; leaks are found by sensors inside
  const boothMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.28, depthWrite: false });
  anim.disposables.push(boothMat);
  box(g, 10, 4, 6.4, boothMat, 129, 0.1, Z);
  for (const x of [124, 134]) {
    for (const dz of [-3.1, 3.1]) box(g, 0.4, 4.2, 0.4, t.pressGrey, x, 0, Z + dz);
    box(g, 0.4, 0.8, 6.6, t.pressGrey, x, 3.4, Z);
  }
  rain(anim, g, 129, Z, 2.8, 3.6, 0.5, 160, 0xaed6f1, 6);
  // roller dynamometer (x 139..146): four rollers under the wheels, they turn
  for (const [x, z] of [[140, -0.92], [141.4, -0.92], [143.8, -0.92], [145.2, -0.92], [140, 0.92], [141.4, 0.92], [143.8, 0.92], [145.2, 0.92]]) {
    spin(anim, cylH(g, 0.33, 0.9, t.robotDark, x, 0.34, Z + z, 'z', 14), 'z', 9);
  }
  box(g, 8, 0.05, 4, t.robotDark, 142.6, 0, Z);
  box(g, 1.6, 2.2, 1, t.pressBlue, 142.6, 0, Z + 4);
  // alignment cameras, ADAS targets, headlamp aiming screen
  for (const z of [-2.4, 2.4]) {
    box(g, 0.3, 1.2, 0.3, t.robotDark, 152, 0, Z + z);
    box(g, 0.5, 0.35, 0.4, t.screenBg, 152, 1.2, Z + z);
  }
  for (const z of [-3.6, 3.6]) {
    box(g, 0.1, 2, 2.4, t.target, 164, 0.4, Z + z);
    for (let k = 0; k < 3; k++) box(g, 0.12, 0.5, 0.5, t.robotDark, 164, 0.9 + (k % 2) * 0.7, Z + z - 0.7 + k * 0.7);
  }
  box(g, 0.1, 2.6, 4.4, t.target, 172, 0.4, Z);
  box(g, 0.12, 0.08, 4, t.robotDark, 172, 1.5, Z);
  // final inspection arch with a light bar
  for (const dz of [-3, 3]) box(g, 0.4, 3.6, 0.4, t.robotDark, 175.5, 0, Z + dz);
  box(g, 0.5, 0.5, 6.4, t.robotDark, 175.5, 3.5, Z);
  for (let i = 0; i < 4; i++) box(g, 0.14, 0.12, 5.4, t.lightF, 175.5 + 0, 0.7 + i * 0.7, Z);
  makeWorker(g, t, anim, 129, Z + 5, Math.PI, 0.2);
  makeWorker(g, t, anim, 150, Z + 5, Math.PI, 1.1);
  makeWorker(g, t, anim, 168, Z + 5, Math.PI, 2.4);
  const sign = makeSign('END OF LINE  -  leak, roll, align, calibrate', 15, 1.5);
  sign.position.set(149, 8.6, Z + 7);
  g.add(sign);

  // vehicle yard: 7 rows of finished cars (instanced)
  const Y = L.yard;
  box(g, Y.x1 - Y.x0 + 4, 0.1, Y.z1 - Y.z0 + 4, m.asphalt, (Y.x0 + Y.x1) / 2, 0, (Y.z0 + Y.z1) / 2);
  const cols = 9;
  const rows = 7;
  const lower = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 0.5, 1.85), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.4 }), cols * rows);
  const cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.5, 1.62), new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.5, color: 0x22303a }), cols * rows);
  const tyres = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.3, 1.95), t.tyre, cols * rows);
  const cols5 = [0x2f6fd0, 0xc0392b, 0xeeeeee, 0xb0b6bd, 0x2e8b57].map((c) => new THREE.Color(c));
  const mm = new THREE.Matrix4();
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Y.x0 + 3 + c * 6;
    const z = Y.z0 + 2.4 + r * 4.4;
    mm.makeTranslation(x, 0.55, z);
    lower.setMatrixAt(n, mm);
    lower.setColorAt(n, cols5[(r * 3 + c * 2) % cols5.length]);
    mm.makeTranslation(x - 0.1, 1.05, z);
    cabin.setMatrixAt(n, mm);
    mm.makeTranslation(x, 0.3, z);
    tyres.setMatrixAt(n, mm);
    n++;
  }
  g.add(lower, cabin, tyres);
  // car carrier: cab, two-deck trailer with cars, leaves along the road
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const truck = new THREE.Group();
  env.add(truck);
  box(truck, 3, 2.6, 2.6, t.pressBlue, 0, 0.6, 0);
  box(truck, 1.6, 1.2, 2.5, t.glassCar, 0.8, 1.7, 0);
  box(truck, 18, 0.3, 2.6, t.pressGrey, -11, 0.9, 0);
  box(truck, 18, 0.3, 2.6, t.pressGrey, -11, 2.8, 0);
  for (let i = 0; i < 6; i++) {
    const cr = new THREE.Group();
    cr.position.set(-4.5 - i * 4, i < 3 ? 1.5 : 3.4, 0);
    box(cr, 3.8, 0.45, 1.8, [t.carBlue, t.carRed, t.carWhite][i % 3], 0, 0, 0);
    box(cr, 2, 0.4, 1.6, t.glassCar, -0.1, 0.45, 0);
    truck.add(cr);
  }
  follow(anim, truck, new Path([[100, 0, L.roadZ + 2], [188, 0, L.roadZ + 2]] as WP[]), 4);
  every(anim, () => undefined);
  cyl(g, 0.2, 0.1, t.lampG, 124, 0, 2, 6);
  const ys = makeSign('FINISHED VEHICLES', 10, 1.4);
  ys.position.set((Y.x0 + Y.x1) / 2, 4, Y.z1 + 3);
  g.add(ys);
  return { id: 'eol', nameBn: 'End-of-line tests, vehicle yard and shipping', group: g };
}
