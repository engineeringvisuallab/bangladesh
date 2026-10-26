import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box } from '../../../core/prims';
import { every, plume } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { animRobot, makeRobot, makeWorker, shopShell } from './ctx';
import { LINE_Z, ROW, SHOP } from '../layout';

const Z = LINE_Z;

/** Paint shop: pre-treatment dip, e-coat dip (the body is lowered into the tanks), e-coat oven, sealer/primer booth, base-coat booth, clear-coat booth (spray robots + mist), cure oven. */
export function buildPaint({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'paint';
  const S = SHOP.paint;
  shopShell(g, m, t, { x: (S.x0 + S.x1) / 2, z: (ROW.z0 + ROW.z1) / 2, w: S.x1 - S.x0, d: ROW.d, h: S.h, lineZ: Z, openS: true });
  box(g, 68, 0.3, 2.4, t.pressGrey, -13, 0, Z);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x7a2a10, emissive: 0xff5a1a, emissiveIntensity: 0.6, transparent: true, opacity: 0.5, depthWrite: false });
  const boothMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.28, roughness: 0.3, depthWrite: false });
  anim.disposables.push(glowMat, boothMat);
  every(anim, (tm) => (glowMat.emissiveIntensity = 0.55 + 0.2 * Math.sin(tm * 1.6)));

  // dip tanks: walls + translucent liquid (the car is lowered into it by the overhead hoist)
  const tank = (x0: number, x1: number, liquid: THREE.Material): void => {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    for (const dz of [-3, 3]) box(g, w, 2.6, 0.4, m.concrete, cx, 0, Z + dz);
    for (const x of [x0, x1]) box(g, 0.4, 2.6, 6, m.concrete, x, 0, Z);
    box(g, w - 0.6, 2.2, 5.4, liquid, cx, 0, Z);
  };
  tank(-45, -36, t.waterTank);
  tank(-34, -26, t.coat);
  box(g, 28, 0.5, 0.6, t.robotDark, -35, 6.3, Z); // overhead hoist rail
  for (const x of [-47, -35, -23]) for (const dz of [-3.4, 3.4]) box(g, 0.5, 6.3, 0.5, t.robotDark, x, 0, Z + dz);
  // ovens and booths
  const oven = (x0: number, x1: number): void => {
    box(g, x1 - x0, 3.4, 6.2, glowMat, (x0 + x1) / 2, 0.1, Z);
    for (const x of [x0, x1]) {
      for (const dz of [-3.1, 3.1]) box(g, 0.5, 3.9, 0.4, t.robotDark, x, 0, Z + dz);
      box(g, 0.5, 0.6, 6.6, t.robotDark, x, 3.3, Z);
    }
    box(g, x1 - x0, 0.6, 1.4, t.pressGrey, (x0 + x1) / 2, 3.6, Z);
  };
  oven(-23, -14);
  oven(13, 21);
  const booth = (x0: number, x1: number, mist: number, k: number): void => {
    box(g, x1 - x0, 3.9, 6.4, boothMat, (x0 + x1) / 2, 0.1, Z);
    for (const x of [x0, x1]) {
      for (const dz of [-3.1, 3.1]) box(g, 0.4, 4.1, 0.4, t.pressGrey, x, 0, Z + dz);
      box(g, 0.4, 0.8, 6.6, t.pressGrey, x, 3.3, Z);
    }
    for (const s of [-1, 1]) {
      const r = makeRobot(g, t, (x0 + x1) / 2 + (s > 0 ? 0.8 : -0.8), Z + s * 5.4, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      animRobot(anim, r, k * 1.7 + (s > 0 ? 0 : 1.1), 1.1, 0.8, false);
    }
    plume(anim, g, (x0 + x1) / 2, 1.8, Z, { count: 14, rise: 1.2, life: 1.6, size0: 1.2, size1: 2.6, windX: 0, windZ: 0, spread: 1.4, opacity: 0.35, color: mist });
  };
  booth(-12, -5, 0x9aa3ab, 0); // sealer + primer
  booth(-3, 4, 0x3d7bd8, 1); // base coat (colour)
  booth(6, 12, 0xffffff, 2); // clear coat
  // light tunnel for the final paint inspection
  for (const dz of [-3, 3]) box(g, 0.4, 3.4, 0.4, t.robotDark, 22.5, 0, Z + dz);
  box(g, 0.5, 0.5, 6.4, t.robotDark, 22.5, 3.4, Z);
  for (let i = 0; i < 4; i++) box(g, 0.2, 0.12, 5.2, t.lightF, 22.5, 0.6 + i * 0.9, Z + 0);
  const sign = makeSign('PAINT SHOP  -  clean, coat, bake', 13, 1.5);
  sign.position.set(-13, 10.6, Z + 7);
  g.add(sign);
  const s1 = makeSign('PRETREAT / E-COAT', 9, 1.2);
  s1.position.set(-35, 8.2, Z + 3.5);
  g.add(s1);
  makeWorker(g, t, anim, 24, Z + 5, Math.PI, 0.7);
  box(g, 1.6, 1.8, 1.0, t.pressGrey, -9, 0, Z + 8); // paint mixing cabinet
  return { id: 'paint', nameBn: 'Paint shop', group: g };
}
