import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl } from '../../../core/prims';
import { every, plume } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, animRobot, follow, makeRobot, makeWorker, shopShell } from './ctx';
import { L, LINE_Z, ROW, SHOP } from '../layout';

const Z = LINE_Z;

/** Final assembly: wiring, cockpit module, windscreen, the "marriage" (battery pack + e-axle lifted into the body), wheels, seats, doors, fluids and charging. The door sub-line runs beside the main line. */
export function buildAssembly({ mats: m, t, anim, line }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'assembly';
  const S = SHOP.assembly;
  shopShell(g, m, t, { x: (S.x0 + S.x1) / 2, z: (ROW.z0 + ROW.z1) / 2, w: S.x1 - S.x0, d: ROW.d, h: S.h, lineZ: Z, doorsN: [40, 64], openS: true });
  const MX = L.marriageX;
  box(g, MX - 3 - S.x0, 0.3, 2.4, t.pressGrey, (S.x0 + MX - 3) / 2, 0, Z);
  box(g, S.x1 - (MX + 3), 0.3, 2.4, t.pressGrey, (MX + 3 + S.x1) / 2, 0, Z);

  // --- cockpit module (x 44): robot carries the dashboard assembly into the body
  const r1 = makeRobot(g, t, 44, Z - 4.2, Math.PI / 2);
  animRobot(anim, r1, 0.4, 0.9, 0.8, false);
  const dash = box(r1.arm2, 1.5, 0.35, 0.5, t.robotDark, 0, 1.9, 0.5);
  void dash;
  box(g, 2.2, 0.9, 1.0, t.rack, 44, 0, Z - 8); // dashboard module on its stand
  // --- windscreen (x 52): robot with a suction frame holds the glass; glue is applied first
  const r2 = makeRobot(g, t, 52, Z + 4.2, -Math.PI / 2);
  animRobot(anim, r2, 1.5, 0.9, 0.8, false);
  box(r2.arm2, 1.4, 0.05, 1.0, t.glassCar, 0, 2.3, 0);
  // --- marriage (x 60): a pit with a lift; the battery pack (and e-axle) rises exactly when a car is above it
  box(g, 6, 0.1, 5, t.robotDark, MX, 0, Z);
  const lift = new THREE.Group();
  lift.position.set(MX, 0.1, Z);
  g.add(lift);
  box(lift, 2.4, 0.15, 1.7, t.pressGrey, 0, 0, 0);
  box(lift, 2.2, 0.22, 1.5, t.battery, 0, 0.15, 0);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) box(lift, 0.6, 0.12, 0.6, t.cell, -0.7 + a * 0.7, 0.37, -0.35 + b * 0.7);
  box(lift, 0.5, 0.3, 0.9, t.pressBlue, 1.3, 0.3, 0);
  for (const dx of [-2.6, 2.6]) for (const dz of [-1.9, 1.9]) box(g, 0.3, 0.9, 0.3, t.robotDark, MX + dx, 0, Z + dz);
  every(anim, () => {
    let dx = 99;
    for (const c of line.cars) dx = Math.min(dx, Math.abs(c.position.x - MX));
    const f = Math.min(1, Math.max(0, 1 - dx / 7));
    lift.position.y = 0.05 + 0.5 * f * f * (3 - 2 * f);
  });
  for (const [dx, s] of [[-2.2, 1], [2.2, -1]] as const) animRobot(anim, makeRobot(g, t, MX + dx, Z + s * 4.5, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.8), dx, 1.6, 0.6, false);
  // --- wheels (x 84): two robots lift tyres onto the hubs; tyre stacks at the side
  [Z - 4.2, Z + 4.2].forEach((z, i) => {
    const r = makeRobot(g, t, 84, z, i === 0 ? Math.PI / 2 : -Math.PI / 2);
    animRobot(anim, r, i * 1.9, 1, 0.9, false);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), t.tyre);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(0, 2.3, 0.2);
    r.arm2.add(tyre);
  });
  for (let k = 0; k < 4; k++) for (const x of [78, 90]) cyl(g, 0.34, 0.24 * 4, t.tyre, x, 0.24 * k, Z + 9, 14);
  // --- seats + trim (x 74), doors refit (x 96), fluids and charging (x 106): people work here
  makeWorker(g, t, anim, 36, Z + 4, Math.PI, 0);
  makeWorker(g, t, anim, 36, Z - 4, 0, 1);
  makeWorker(g, t, anim, 74, Z + 4, Math.PI, 2);
  makeWorker(g, t, anim, 74, Z - 4, 0, 3);
  makeWorker(g, t, anim, 96, Z + 4, Math.PI, 4);
  makeWorker(g, t, anim, 96, Z - 4, 0, 5);
  cyl(g, 0.15, 2.4, t.robotDark, 106, 0, Z + 3, 8);
  const plug = box(g, 0.3, 0.3, 0.3, t.lampG, 106, 2.3, Z + 3);
  every(anim, (tm) => (plug.scale.setScalar(0.8 + 0.3 * Math.sin(tm * 3)), undefined));
  // --- door sub-line beside the main line: doors travel east, get fitted with windows, locks, speakers
  box(g, 72, 0.4, 1.6, t.pressGrey, 66, 0, Z - 15);
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const doorPath = new Path([[30, 0.9, Z - 15], [100, 0.9, Z - 15]] as WP[]);
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Group();
    env.add(d);
    box(d, 1.3, 0.7, 0.08, t.carSilver, 0, 0, 0);
    box(d, 0.9, 0.3, 0.06, t.glassCar, 0, 0.7, 0);
    follow(anim, d, doorPath, 0.9, i * 12);
  }
  [Z - 15 - 3.5, Z - 15 + 3.5].forEach((z, i) => animRobot(anim, makeRobot(g, t, 56 + i * 12, z, i === 0 ? Math.PI / 2 : -Math.PI / 2, 0.8), i, 1, 0.7, false));
  // --- parts supermarket along the north wall
  for (let i = 0; i < 6; i++) box(g, 8, 2.4, 1.2, t.rack, 36 + i * 12, 0, ROW.z0 + 3);
  plume(anim, g, 106, 3, Z + 3, { count: 4, rise: 0.6, life: 2, size0: 0.4, size1: 0.9, windX: 0, windZ: 0, spread: 0.2, opacity: 0.2, color: 0x38e07a });
  const sign = makeSign('FINAL ASSEMBLY  -  one car every 60 s', 14, 1.5);
  sign.position.set(70, 10.6, Z + 7);
  g.add(sign);
  const s2 = makeSign('MARRIAGE: battery meets body', 10, 1.2);
  s2.position.set(MX, 7.4, Z + 5);
  g.add(s2);
  return { id: 'assembly', nameBn: 'Final assembly line', group: g };
}
