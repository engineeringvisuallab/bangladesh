import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, railRect, V } from '../../../core/prims';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Boiler: steel frame, furnace with a glass east wall (you see the water-wall tubes and the burner flames), steam drum, superheater, 3 gas burners. */
export function buildBoiler({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'boiler';
  const B = L.boiler;
  const x0 = B.x - B.w / 2;
  const x1 = B.x + B.w / 2;
  const z0 = B.z - B.d / 2;
  const z1 = B.z + B.d / 2;
  const y0 = 3;
  const hF = B.h - y0;

  box(g, B.w + 6, 1, B.d + 6, m.concreteDark, B.x, 0, B.z);
  box(g, B.w, 2, B.d, m.concrete, B.x, 1, B.z); // ash-free hopper base (gas fuel: just a support block)
  // furnace shell: three steel walls + one glass wall (east) so the inside can be seen
  box(g, 0.6, hF, B.d, m.casing, x0, y0, B.z);
  box(g, B.w, hF, 0.6, m.casing, B.x, y0, z0);
  box(g, B.w, hF, 0.6, m.casing, B.x, y0, z1);
  box(g, 0.3, hF, B.d, t.furnaceGlass, x1, y0, B.z);
  box(g, B.w + 0.8, 0.6, B.d + 0.8, m.casing, B.x, B.h, B.z);

  // water-wall tubes on the inside of the back and west walls
  for (let x = x0 + 1; x <= x1 - 0.9; x += 1.0) cyl(g, 0.14, hF - 1, t.tube, x, y0 + 0.5, z0 + 0.55, 8);
  for (let z = z0 + 1.6; z <= z1 - 1.5; z += 1.2) cyl(g, 0.14, hF - 1, t.tube, x0 + 0.55, y0 + 0.5, z, 8);
  // superheater: rows of horizontal tubes high in the furnace (hotter colour = hotter steam)
  for (const zr of [-34, -30, -26]) for (const yr of [27, 29.5, 32]) cylH(g, 0.24, B.w - 2, t.tubeHot, B.x, yr, zr, 'x', 8);

  // burners on the front (south) wall, firing north into the furnace
  const burnerX = [-100, -95, -90];
  const flames: THREE.Mesh[] = [];
  burnerX.forEach((bx, i) => {
    box(g, 3, 3, 1.8, m.steel, bx, 7.5, z1 + 0.9); // wind box
    cylH(g, 0.7, 2.2, t.steelDark, bx, 9, z1 + 1.2, 'z', 14); // gas nozzle
    const f = new THREE.Mesh(new THREE.ConeGeometry(1.15, 8, 14, 1, true), t.flame);
    f.rotation.x = -Math.PI / 2; // apex points north (-z)
    f.position.set(bx, 9, z1 - 4.6);
    g.add(f);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 10, 1, true), t.flameCore);
    c.rotation.x = -Math.PI / 2;
    c.position.set(bx, 9, z1 - 3.6);
    g.add(c);
    flames.push(f, c);
    void i;
  });
  every(anim, (tm) => {
    flames.forEach((f, k) => {
      const w = Math.sin(tm * 13 + k * 1.7) * 0.5 + Math.sin(tm * 7.3 + k) * 0.5;
      f.scale.set(1 + 0.12 * w, 1 + 0.15 * w, 1 + 0.12 * w);
    });
    t.flame.opacity = 0.82 + 0.08 * Math.sin(tm * 9);
  });

  // steam drum on top, supported on two saddles; feed water enters at its east end, steam leaves through the header on the roof
  cylH(g, 1.7, 16, m.steel, B.x, 41, B.z, 'x', 20);
  for (const dx of [-5, 5]) box(g, 1.2, 5.5, 3.2, m.steel, B.x + dx, B.h, B.z);
  pipe(g, [V(B.x - 8, 41, B.z), V(B.x - 8, B.h + 3, B.z - 4), V(B.x - 8, B.h + 3, -34)], 0.6, t.lagging);
  cylH(g, 0.8, 6, t.lagging, x0 + 3, B.h + 3, -34, 'z', 12); // superheater outlet header

  // steel frame (columns + 4 beam levels) and two walk-around platforms with railings
  const fx0 = x0 - 2.5;
  const fx1 = x1 + 2.5;
  const fz0 = z0 - 2.5;
  const fz1 = z1 + 2.5;
  for (const x of [fx0, fx1]) for (const z of [fz0, fz1]) box(g, 0.9, 46, 0.9, m.steel, x, 0, z);
  for (const y of [12, 24, 36, 44]) {
    box(g, fx1 - fx0, 0.5, 0.6, m.steel, B.x, y, fz0);
    box(g, fx1 - fx0, 0.5, 0.6, m.steel, B.x, y, fz1);
    box(g, 0.6, 0.5, fz1 - fz0, m.steel, fx0, y, B.z);
    box(g, 0.6, 0.5, fz1 - fz0, m.steel, fx1, y, B.z);
  }
  for (const y of [12, 24]) {
    box(g, fx1 - fx0, 0.25, 2, m.concreteDark, B.x, y, z1 + 1.8);
    box(g, fx1 - fx0, 0.25, 2, m.concreteDark, B.x, y, z0 - 1.8);
    railRect(g, m.yellow, B.x, B.z, fx1 - fx0, fz1 - fz0, y + 0.25);
  }
  // diagonal braces on the west face
  for (const [ya, yb] of [[0, 12], [12, 24], [24, 36]] as const) {
    const len = Math.hypot(fz1 - fz0, yb - ya);
    const br = box(g, 0.3, len, 0.3, m.steel, fx0, 0, B.z);
    br.position.y = (ya + yb) / 2;
    br.rotation.x = Math.atan2(fz1 - fz0, yb - ya);
  }
  return { id: 'boiler', nameBn: 'Boiler (Furnace, Steam Drum, Burners)', group: g };
}
