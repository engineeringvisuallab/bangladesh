import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import { every, plume } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, cx, cy } from './helpers';

/** Machine shop: lathe (rotating chuck + travelling carriage), milling machine (spinning cutter + moving table), drill press, grinder with sparks, workbench and overhead crane. */
export function buildShop({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'shop';
  const S = L.shop;
  building(g, m, { x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, open: 'S', door: 'N' });
  const sign = (text: string, x: number, y: number, z: number, w = 6): void => {
    const s = makeSign(text, w, 1.1);
    s.position.set(x, y, z);
    g.add(s);
  };
  const zc = S.z - 4;
  // ----- lathe (x 45 .. 58)
  {
    const x0 = 46;
    bx(g, 11, 0.9, 2.4, t.cast, x0 + 5.5, 1.1, zc);
    for (const lx of [x0 + 0.6, x0 + 10.4]) bx(g, 1.4, 1.1, 2.2, t.paintGrey, lx, 0.55, zc);
    bx(g, 2.6, 2.6, 2.6, t.paintBlue, x0 + 1.3, 3.0, zc); // headstock
    const chuck = new THREE.Group();
    chuck.position.set(x0 + 3.0, 3.0, zc);
    g.add(chuck);
    cx(chuck, 0.95, 0.7, t.steelDark, 0, 0, 0, 24);
    for (let k = 0; k < 3; k++) {
      const jaw = bx(chuck, 0.7, 0.5, 0.35, t.steel, 0.1, 0, 0);
      const holder = new THREE.Group();
      holder.rotation.x = (k / 3) * Math.PI * 2;
      jaw.position.set(0.1, 0.8, 0);
      holder.add(jaw);
      chuck.add(holder);
    }
    cx(chuck, 0.42, 6.2, t.steel, 3.6, 0, 0, 18); // workpiece (round bar)
    bx(chuck, 0.12, 0.12, 6.0, t.mark, 3.6, 0.42, 0).rotation.y = Math.PI / 2; // marker line along the bar
    bx(g, 1.8, 2.2, 1.8, t.paintBlue, x0 + 9.4, 2.9, zc); // tailstock
    cx(g, 0.1, 1.2, t.steel, x0 + 8.1, 3.0, zc, 8);
    const carriage = new THREE.Group();
    g.add(carriage);
    bx(carriage, 2.6, 0.7, 2.8, t.paintGrey, 0, 1.9, zc);
    bx(carriage, 1.0, 0.5, 1.0, t.paintBlue, 0, 2.5, zc + 1.2); // cross slide
    bx(carriage, 0.5, 0.5, 0.7, t.steelDark, 0, 3.0, zc + 0.95); // tool post
    bx(carriage, 0.2, 0.2, 0.6, t.steel, 0, 2.95, zc + 0.5).rotation.y = 0; // cutting tool touching the work
    const chips = plume(anim, carriage, 0, 3.0, zc + 0.5, { count: 8, rise: 0.7, life: 0.9, size0: 0.22, size1: 0.06, windX: 0.6, windZ: 0.5, spread: 0.4, opacity: 0.9, color: 0xcfd3d8 });
    void chips;
    every(anim, (tm) => {
      chuck.rotation.x += 0.2; // visually slow (real: ~500 rpm)
      carriage.position.x = x0 + 5.6 + 2.2 * Math.sin(tm * 0.4);
    });
    sign('Lathe', x0 + 5.5, 6.8, zc - 1.5);
  }
  // ----- milling machine (x 62 .. 77)
  {
    const x = 70;
    bx(g, 5.2, 2.2, 2.6, t.paintGreen, x, 1.1, zc);
    bx(g, 1.8, 6.2, 1.8, t.paintGreen, x - 2.1, 3.1, zc - 0.5); // column
    bx(g, 4.2, 1.5, 2.2, t.paintGreen, x - 0.2, 6.4, zc - 0.2); // overarm / head
    const spindle = new THREE.Group();
    spindle.position.set(x + 0.4, 4.8, zc);
    g.add(spindle);
    cy(spindle, 0.3, 1.2, t.steelDark, 0, 0.6, 0, 14);
    cy(spindle, 0.45, 1.0, t.steel, 0, -0.1, 0, 16); // end mill
    for (let k = 0; k < 4; k++) {
      const fl = bx(spindle, 0.1, 1.0, 0.18, t.steelDark, 0, -0.1, 0);
      fl.position.set(Math.cos((k * Math.PI) / 2) * 0.45, -0.1, Math.sin((k * Math.PI) / 2) * 0.45);
      fl.rotation.y = -(k * Math.PI) / 2;
    }
    const table = new THREE.Group();
    g.add(table);
    bx(table, 4.4, 0.5, 2.0, t.cast, x, 2.5, zc);
    bx(table, 2.4, 0.9, 1.4, t.steel, x, 3.15, zc); // workpiece in the vise
    bx(table, 0.4, 0.8, 1.6, t.steelDark, x - 1.5, 3.1, zc);
    bx(table, 0.4, 0.8, 1.6, t.steelDark, x + 1.5, 3.1, zc);
    const sparksM = plume(anim, g, x + 0.4, 3.6, zc + 0.3, { count: 8, rise: 0.5, life: 0.8, size0: 0.18, size1: 0.05, windX: 0.5, windZ: 0.6, spread: 0.5, opacity: 0.9, color: 0xcfd3d8 });
    every(anim, (tm) => {
      spindle.rotation.y += 0.55;
      table.position.x = 1.2 * Math.sin(tm * 0.5);
      sparksM.position.x = x + 0.4;
    });
    sign('Milling Machine', x, 8.2, zc - 1.5);
  }
  // ----- drill press (x 82)
  {
    const x = 83;
    bx(g, 2.4, 0.4, 2.2, t.cast, x, 0.2, zc);
    cy(g, 0.26, 6.4, t.steel, x - 0.6, 3.6, zc - 0.3, 14);
    bx(g, 2.2, 1.5, 1.6, t.paintBlue, x, 6.0, zc - 0.1);
    const quill = new THREE.Group();
    g.add(quill);
    const bit = new THREE.Group();
    quill.add(bit);
    cy(bit, 0.14, 2.0, t.steel, 0, 0, 0, 10);
    bx(bit, 0.06, 1.8, 0.3, t.steelDark, 0.06, 0, 0).rotation.y = 0.5; // flute marker
    bit.position.set(x + 0.3, 4.4, zc);
    bx(quill, 0.5, 1.4, 0.5, t.steelDark, x + 0.3, 5.4, zc);
    bx(g, 2.2, 0.3, 2.0, t.cast, x, 2.2, zc);
    bx(g, 1.4, 0.3, 1.4, t.steel, x + 0.3, 2.5, zc);
    every(anim, (tm) => {
      bit.rotation.y += 0.8;
      quill.position.y = -0.9 * (0.5 - 0.5 * Math.cos(tm * 0.9));
    });
    sign('Drill Press', x, 8.2, zc - 1.5, 5);
  }
  // ----- bench grinder with sparks (x 94)
  {
    const x = 94;
    cy(g, 0.35, 3.0, t.paintGrey, x, 1.5, zc, 14);
    bx(g, 2.6, 1.0, 1.2, t.paintBlue, x, 3.3, zc);
    const wheel = new THREE.Group();
    wheel.position.set(x + 1.6, 3.3, zc);
    g.add(wheel);
    const disc = bx(wheel, 0.4, 1.8, 1.8, t.steelDark, 0, 0, 0);
    disc.geometry.dispose();
    disc.geometry = new THREE.CylinderGeometry(0.9, 0.9, 0.4, 28);
    disc.rotation.z = Math.PI / 2;
    bx(wheel, 0.3, 0.2, 0.3, t.markY, 0, 0.8, 0);
    wheel.rotation.z = 0;
    const gd = new THREE.Group();
    gd.add(wheel);
    g.add(gd);
    // the wheel axis is x: turn it around x
    plume(anim, g, x + 2.2, 3.6, zc + 0.9, { count: 14, rise: -0.6, life: 0.5, size0: 0.14, size1: 0.02, windX: 1.0, windZ: 1.4, spread: 0.6, opacity: 1, color: 0xffb347 });
    bx(g, 0.2, 0.2, 1.8, t.steel, x + 2.2, 3.5, zc + 1.4);
    every(anim, () => {
      wheel.rotation.x += 0.9;
    });
    sign('Grinder', x, 6.2, zc - 1.5, 5);
  }
  // ----- workbench with vise (x 104)
  bx(g, 3.6, 0.2, 1.6, t.cast, 104, 1.2, zc);
  for (const dx of [-1.6, 1.6]) bx(g, 0.25, 1.2, 1.4, t.paintGrey, 104 + dx, 0.6, zc);
  bx(g, 0.8, 0.7, 0.6, t.paintRed, 103.2, 1.7, zc);
  // ----- overhead crane
  const cr = new THREE.Group();
  g.add(cr);
  for (const dz of [-16.4, 16.4]) bx(g, 68, 0.4, 0.5, t.steelDark, S.x, 9.6, S.z + dz);
  bx(cr, 0.8, 0.8, 32.8, t.paintRed, 0, 10.0, S.z);
  const trolley = new THREE.Group();
  bx(trolley, 2, 0.7, 2.2, m.yellow, 0, 10.7, 0);
  const rope = bx(trolley, 0.08, 4, 0.08, t.steelDark, 0, 8.4, 0);
  bx(trolley, 0.8, 0.8, 0.8, t.steel, 0, 6.2, 0);
  cr.add(trolley);
  every(anim, (tm) => {
    cr.position.x = S.x + 22 * Math.sin(tm * 0.1);
    trolley.position.z = S.z + 6 * Math.sin(tm * 0.17);
    rope.scale.y = 1 + 0.05 * Math.sin(tm * 0.8);
  });
  return { id: 'shop', nameBn: 'Machine Shop (Lathe, Mill, Drill, Grinder)', group: g };
}
