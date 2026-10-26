import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cylH } from '../../../core/prims';
import { every, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, makeWorker, shopShell } from './ctx';
import { L, LINE_Z, ROW, SHOP } from '../layout';

const Z = LINE_Z;
const PRESS_X = [-152, -139, -126];

/** Steel coil yard (uncoiler, leveller, blanking press) and the press shop: three presses in a row, each stroke shapes the flat blank a little more (draw, trim, flange/pierce). */
export function buildPress({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'press';
  const S = SHOP.press;
  const cx = (S.x0 + S.x1) / 2;
  shopShell(g, m, t, { x: cx, z: (ROW.z0 + ROW.z1) / 2, w: S.x1 - S.x0, d: ROW.d, h: S.h, lineZ: Z, doorsN: [-165], openS: true });

  // ---- coil yard (north of the shop): canopy, coils on saddles, uncoiler (reel turns), leveller, blanking press
  const C = L.coilYard;
  box(g, C.w, 0.15, C.d, m.concreteDark, C.x, 0, C.z);
  for (const dx of [-28, 28]) for (const dz of [-24, 24]) box(g, 0.6, 8, 0.6, m.steel, C.x + dx, 0, C.z + dz);
  box(g, C.w, 0.4, C.d, m.roof, C.x, 8, C.z);
  for (let i = 0; i < 10; i++) {
    const x = C.x - 25 + (i % 5) * 7;
    const z = C.z + (i < 5 ? 14 : 22);
    box(g, 1.2, 0.4, 2.2, m.steel, x, 0, z);
    cylH(g, 1.05, 1.7, t.coil, x, 1.45, z, 'x', 24);
    cylH(g, 0.35, 1.72, t.robotDark, x, 1.45, z, 'x', 12);
  }
  const reel = cylH(g, 1.1, 1.6, t.coil, -165, 1.6, -118, 'x', 24);
  spin(anim, reel, 'x', 1.4);
  box(g, 3, 1.2, 3, m.steel, -165, 0, -118);
  for (const dx of [-1.8, 1.8]) box(g, 0.4, 3, 0.4, t.pressGrey, -165 + dx, 0, -118);
  box(g, 3.4, 1.6, 4, t.pressGrey, -165, 0, -108); // leveller
  box(g, 3.2, 2.6, 4, t.pressBlue, -165, 0, -96); // blanking press
  for (const dx of [-1.6, 1.6]) {
    const roller = cylH(g, 0.28, 3.2, m.steel, -165 + dx * 0.0, 2.2, -108, 'x', 10);
    spin(anim, roller, 'x', dx > 0 ? 3 : -3);
  }
  const sign = makeSign('STEEL COILS -> BLANKS', 10, 1.4);
  sign.position.set(C.x, 5, C.z + C.d / 2 + 0.3);
  g.add(sign);

  // ---- press line: 3 presses, belt under the blanks
  box(g, 58, 0.4, 1.6, t.pressGrey, -143, 0, Z);
  const slides: { g: THREE.Group; ph: number }[] = [];
  PRESS_X.forEach((x, i) => {
    for (const dx of [-2.3, 2.3]) for (const dz of [-1.8, 1.8]) box(g, 0.8, 8.6, 0.8, t.pressBlue, x + dx, 0, Z + dz);
    box(g, 5.6, 1.7, 4.4, t.pressBlue, x, 8.6, Z); // crown with the drive
    box(g, 4.8, 1.1, 4, t.pressGrey, x, 0.2, Z - 0); // bolster
    box(g, 3.8, 0.5, 2.8, t.robotDark, x, 1.3, Z); // lower die
    const slide = new THREE.Group();
    slide.position.set(x, 5, Z);
    g.add(slide);
    box(slide, 4.4, 1.0, 3.6, t.pressGrey, 0, 0, 0);
    box(slide, 3.8, 0.5, 2.6, t.robotDark, 0, -0.5, 0); // upper die
    for (const dx of [-1.6, 1.6]) box(slide, 0.3, 3.2, 0.3, t.steelSheet, dx, 1.0, 0); // connecting rods
    slides.push({ g: slide, ph: i * 1.1 });
  });
  every(anim, (tm) => slides.forEach((s) => (s.g.position.y = 3.6 + 1.9 * (0.5 + 0.5 * Math.sin(tm * 1.5 + s.ph)))));
  const label = makeSign('PRESS LINE  -  draw / trim / flange', 12, 1.4);
  label.position.set(-139, 12.4, Z + 3);
  g.add(label);

  // ---- blanks and panels travelling: flat blank -> drawn -> trimmed -> finished door panel
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const path = new Path([[-165, 1.55, -96], [-165, 1.55, -45], [-165, 1.55, Z], [-108, 1.55, Z]] as WP[]);
  const o = { x: 0, y: 0, z: 0, yaw: 0 };
  const parts: THREE.Group[] = [];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Group();
    env.add(p);
    const flat = box(p, 1.4, 0.05, 1.0, t.steelSheet, 0, 0, 0);
    const drawn = box(p, 1.3, 0.22, 0.9, t.steelSheet, 0, 0, 0);
    const trimmed = box(p, 1.2, 0.16, 0.8, t.steelSheet, 0, 0, 0);
    const done = new THREE.Group();
    p.add(done);
    box(done, 1.2, 0.12, 0.8, t.carSilver, 0, 0, 0);
    box(done, 0.6, 0.14, 0.4, t.glassCar, 0.1, 0.01, 0);
    p.userData.v = [flat, drawn, trimmed, done];
    parts.push(p);
  }
  every(anim, (tm) => {
    parts.forEach((p, i) => {
      path.at(i * 8 + tm * 1.4, o);
      p.position.set(o.x, o.y, o.z);
      const v = p.userData.v as THREE.Object3D[];
      const k = o.x < -153 && o.z < Z - 0.1 ? 0 : o.x < -145 ? 1 : o.x < -132 ? 2 : 3;
      v.forEach((mesh, j) => (mesh.visible = j === k));
    });
  });
  // finished panels in racks at the exit, workers at the press ends
  for (let i = 0; i < 4; i++) box(g, 2.6, 0.8 + i * 0.15, 1.6, t.rack, -172 + i * 3.2, 0, -8); // finished panels in racks
  makeWorker(g, t, anim, -146, Z + 4.5, Math.PI, 0);
  makeWorker(g, t, anim, -132, Z + 4.5, Math.PI, 2);
  return { id: 'press', nameBn: 'Coil yard and press shop', group: g };
}
