import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH } from '../../../core/prims';
import { every, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, animRobot, follow, makeRobot, makeWorker, shopShell } from './ctx';
import { L } from '../layout';

const BZ = L.battery.z;

/** Battery and motor shop: cell trays -> module line -> pack line (lid closes) -> pack tester, motor line (stator winding, magnets, e-axle) and the AGVs that carry the packs to the "marriage" station. */
export function buildBattery({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'battery';
  const B = L.battery;
  shopShell(g, m, t, { x: B.x, z: B.z, w: B.w, d: B.d, h: B.h, openS: true });
  // cell storage: three racks of cylindrical cells (instanced, standing upright in trays)
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.36, 8);
  const cells = new THREE.InstancedMesh(geo, t.cell, 3 * 8 * 8);
  const mtx = new THREE.Matrix4();
  let n = 0;
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    mtx.makeTranslation(5 + r * 4 + i * 0.26 - 0.9, 1.6 + 0.2, BZ - 14 + j * 0.26);
    cells.setMatrixAt(n++, mtx);
  }
  g.add(cells);
  for (let r = 0; r < 3; r++) {
    box(g, 2.4, 0.2, 2.4, m.steel, 5 + r * 4, 1.4, BZ - 13.2);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(g, 0.15, 1.4, 0.15, m.steel, 5 + r * 4 + dx, 0, BZ - 13.2 + dz);
  }
  // module line: belt, 4 robots stacking and welding cells into modules
  box(g, 34, 0.5, 1.4, t.pressGrey, 31, 0, BZ);
  [24, 30, 36, 42].forEach((x, i) => {
    animRobot(anim, makeRobot(g, t, x, BZ - 3.4, Math.PI / 2, 0.8), i * 1.4, 1.2, 0.8, i % 2 === 0);
    animRobot(anim, makeRobot(g, t, x, BZ + 3.4, -Math.PI / 2, 0.8), i * 1.4 + 0.7, 1.2, 0.8, false);
  });
  // pack line: belt, tester cabinet
  box(g, 26, 0.5, 2.0, t.pressGrey, 66, 0, BZ);
  box(g, 3, 2.6, 2, t.pressBlue, 78, 0, BZ - 5);
  box(g, 0.3, 0.3, 0.1, t.lampG, 77, 2.0, BZ - 3.96);
  // motor line: winding machine (stator spins), magnet insertion robot, e-axle assembly
  box(g, 14, 0.5, 1.2, t.pressGrey, 86, 0, BZ + 10);
  const wind = cyl(g, 0.9, 0.7, t.copper, 82, 0.9, BZ + 14, 20);
  box(g, 2, 0.9, 2, t.robotDark, 82, 0, BZ + 14);
  spin(anim, wind, 'y', 4);
  animRobot(anim, makeRobot(g, t, 88, BZ + 14, 0, 0.8), 0.5, 1, 0.8, false);
  cylH(g, 0.6, 1.2, t.magnet, 91, 0.95, BZ + 14, 'x', 16);

  // moving items
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const modPath = new Path([[16, 0.72, BZ], [48, 0.72, BZ]] as WP[]);
  for (let i = 0; i < 5; i++) {
    const mod = new THREE.Group();
    env.add(mod);
    box(mod, 1.0, 0.28, 0.6, t.battery, 0, 0, 0);
    for (let k = 0; k < 6; k++) box(mod, 0.12, 0.04, 0.5, t.cellGold, -0.4 + k * 0.16, 0.28, 0);
    follow(anim, mod, modPath, 0.8, i * 6.4);
  }
  const packPath = new Path([[54, 0.72, BZ], [78, 0.72, BZ]] as WP[]);
  const lids: THREE.Mesh[] = [];
  const packs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const pk = new THREE.Group();
    env.add(pk);
    box(pk, 2.2, 0.22, 1.5, t.battery, 0, 0, 0);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) box(pk, 0.62, 0.18, 0.6, t.cell, -0.7 + a * 0.7, 0.22, -0.35 + b * 0.7);
    lids.push(box(pk, 2.2, 0.06, 1.5, t.pressGrey, 0, 0.4, 0));
    packs.push(pk);
    follow(anim, pk, packPath, 0.7, i * 6.5);
  }
  every(anim, () => packs.forEach((pk, i) => (lids[i].visible = pk.position.x > 66)));
  // e-axle units (motor + inverter + gearbox) on the motor belt
  const axPath = new Path([[80, 0.72, BZ + 10], [92, 0.72, BZ + 10]] as WP[]);
  for (let i = 0; i < 3; i++) {
    const ax = new THREE.Group();
    env.add(ax);
    cylH(ax, 0.38, 0.9, t.magnet, 0, 0.4, 0, 'x', 14);
    box(ax, 0.5, 0.3, 0.4, t.pressBlue, 0.55, 0.3, 0);
    box(ax, 0.5, 0.25, 0.4, t.cellGold, -0.3, 0.7, 0);
    follow(anim, ax, axPath, 0.6, i * 4);
  }
  // AGVs carry finished packs south to the assembly hall
  const agvPath = new Path([[64, 0.3, BZ + 26], [64, 0.3, -36], [56, 0.3, -36], [56, 0.3, BZ + 26]] as WP[], true);
  for (let i = 0; i < 2; i++) {
    const agv = new THREE.Group();
    env.add(agv);
    box(agv, 2.4, 0.3, 1.7, t.agv, 0, 0, 0);
    box(agv, 2.1, 0.2, 1.4, t.battery, 0, 0.3, 0);
    follow(anim, agv, agvPath, 2.2, i * (agvPath.len / 2));
  }
  const sign = makeSign('BATTERY + MOTOR SHOP', 12, 1.5);
  sign.position.set(B.x, B.h + 3, B.z + B.d / 2 + 0.3);
  g.add(sign);
  makeWorker(g, t, anim, 40, BZ + 7, Math.PI, 0.2);
  makeWorker(g, t, anim, 66, BZ + 4, Math.PI, 1.6);
  return { id: 'battery', nameBn: 'Battery and motor shop', group: g };
}
