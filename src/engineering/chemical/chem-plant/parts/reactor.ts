import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, pump, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { DOT, std } from './ctx';
import { L } from '../layout';
import { board, bx, cone, cx, cy, fpipe, mesh } from './helpers';

/** Reaction unit: two feed tanks + pumps, a stirred-tank reactor (jacket, agitator, baffles), a fixed-bed catalytic reactor and a product receiver. */
export function buildReactor({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'reactor';

  // ---- feed tanks A (blue) and B (red) with their pumps
  const feeds = [
    { ...L.feedTanks[0], band: t.pFeedA, mat: t.pFeedA, dot: DOT.feedA, name: 'Feed A' },
    { ...L.feedTanks[1], band: t.pFeedB, mat: t.pFeedB, dot: DOT.feedB, name: 'Feed B' },
  ];
  const R = L.cstr;
  feeds.forEach((f, i) => {
    box(g, 4.4, 0.4, 4.4, m.concreteDark, f.x, 0, f.z);
    cyl(g, 1.8, 5, t.tankWhite, f.x, 0.4, f.z, 28);
    cyl(g, 1.83, 0.7, f.band, f.x, 3.4, f.z, 28);
    cone(g, 1.9, 1.0, t.tankGrey, f.x, 5.9, f.z, 28);
    const sg = makeSign(f.name, 2.6, 0.8);
    sg.position.set(f.x, 1.9, f.z + 1.95);
    g.add(sg);
    pump(g, m, f.x + 7, f.z, Math.PI, 0, 1);
    fpipe(g, anim, [[f.x + 1.8, 1.0, f.z], [f.x + 5.2, 1.0, f.z], [f.x + 5.2, 0.9, f.z]], 0.3, f.mat, f.dot, 2.2);
    // discharge: feed A goes over the top (y 6.0) to the far inlet, feed B straight to the vessel
    const px = f.x + 7 - 0.55;
    if (i === 0) fpipe(g, anim, [[px, 2.0, f.z], [px, 6.0, f.z], [px, 6.0, R.z + 2], [R.x - 2.0, 6.0, R.z + 2]], 0.3, f.mat, f.dot, 2.6);
    else fpipe(g, anim, [[px, 2.0, f.z], [px, 4.2, f.z], [R.x - 2.0, 4.2, f.z]], 0.3, f.mat, f.dot, 2.6);
  });

  // ---- stirred-tank reactor (CSTR): glass shell, cooling jacket, liquid, baffles, agitator
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]] as const) bx(g, 0.5, 1.6, 0.5, t.steelDark, R.x + dx, 0.8, R.z + dz);
  cone(g, 2.4, 1.6, t.tankGrey, R.x, 0.8 + 0.5, R.z, 24).rotation.x = Math.PI; // bottom cone (apex down)
  cy(g, 2.4, 6, t.shell, R.x, 4.5, R.z, 32);
  cy(g, 2.8, 4.4, t.jacket, R.x, 3.8, R.z, 32); // cooling jacket
  cone(g, 2.4, 1.4, t.tankGrey, R.x, 8.2, R.z, 32);
  const liq = std(0x3e7cc0, { opacity: 0.6, rough: 0.2, metal: 0 });
  anim.disposables.push(liq);
  cy(g, 2.3, 4.0, liq, R.x, 3.9, R.z, 32);
  const colA = new THREE.Color(0x3e7cc0);
  const colB = new THREE.Color(0x56b886);
  every(anim, (tt) => {
    liq.color.copy(colA).lerp(colB, 0.5 + 0.5 * Math.sin(tt * 0.4)); // feed colour -> product colour
  });
  for (const [dx, dz] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2]] as const) bx(g, dz === 0 ? 0.15 : 0.4, 4, dz === 0 ? 0.4 : 0.15, t.steel, R.x + dx, 3.9, R.z + dz);
  cy(g, 0.6, 1.0, t.paintBlue, R.x, 9.4, R.z, 16); // motor
  const ag = new THREE.Group();
  ag.position.set(R.x, 0, R.z);
  g.add(ag);
  cy(ag, 0.1, 7.2, t.steel, 0, 5.0, 0, 8); // shaft
  for (const y of [2.4, 4.4]) {
    for (let k = 0; k < 4; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = (k * Math.PI) / 2;
      bx(holder, 1.7, 0.15, 0.5, t.steel, 0.95, y, 0);
      ag.add(holder);
    }
  }
  spin(anim, ag, 'y', 5);
  // jacket water (cold in at the bottom, warm out at the top)
  fpipe(g, anim, [[R.x + 6, 2.2, R.z - 1.5], [R.x + 2.8, 2.2, R.z - 1.5]], 0.25, t.pCold, DOT.cold, 2.0);
  fpipe(g, anim, [[R.x + 2.8, 5.6, R.z + 1.5], [R.x + 6, 5.6, R.z + 1.5]], 0.25, t.pWarm, DOT.warm, 2.0);
  // access platform + ladder
  const ring = mesh(g, new THREE.RingGeometry(2.5, 3.4, 32), t.steelDark, R.x, 7.0, R.z);
  ring.rotation.x = -Math.PI / 2;
  const rail = mesh(g, new THREE.TorusGeometry(3.4, 0.05, 6, 32), t.paintYellow, R.x, 8.0, R.z);
  rail.rotation.x = Math.PI / 2;
  bx(g, 0.15, 7.6, 0.7, t.steelDark, R.x - 3.5, 3.8, R.z + 0.5);
  board(g, t.steelDark, 'Stirred-Tank Reactor', R.x, R.z + 5, 6.4);

  // ---- fixed-bed catalytic reactor: reactants flow down through two beds of catalyst pellets
  const Bd = L.bed;
  cyl(g, 1.9, 1.0, t.steelDark, Bd.x, 0, Bd.z, 24); // skirt
  cy(g, 1.6, 11, t.shell, Bd.x, 6.5, Bd.z, 28);
  cone(g, 1.6, 1.4, t.tankGrey, Bd.x, 13.2, Bd.z, 28);
  const bed = std(0x5a3a2a, { rough: 0.95, metal: 0.05, emissive: 0xff4a10, glow: 0.3 });
  anim.disposables.push(bed);
  for (const y of [4.3, 8.7]) {
    cy(g, 1.5, 2.4, bed, Bd.x, y, Bd.z, 28);
    cy(g, 1.55, 0.12, t.steel, Bd.x, y - 1.25, Bd.z, 28); // support grid
  }
  every(anim, (tt) => {
    bed.emissiveIntensity = 0.3 + 0.08 * Math.sin(tt * 1.7);
  });
  for (const [dx, dz] of [[0.6, 0.3], [-0.6, -0.3]] as const) {
    flow(anim, g, [V(Bd.x + dx, 12.0, Bd.z + dz), V(Bd.x + dx, 1.8, Bd.z + dz)], { color: DOT.product, speed: 2.4, spacing: 1.0, size: 0.13 });
  }
  const ry = Bd.z + 12;
  bx(g, 0.15, 12, 0.7, t.steelDark, Bd.x + 1.8, 6.5, Bd.z + 0.5);
  // product of the stirred tank is pumped up to the top of the fixed bed; the outlet goes to a receiver drum
  fpipe(g, anim, [[R.x, 0.3, R.z], [R.x, 0.9, R.z], [R.x, 0.9, R.z + 8], [Bd.x + 6, 0.9, R.z + 8], [Bd.x + 6, 14, R.z + 8], [Bd.x + 6, 14, Bd.z], [Bd.x, 14, Bd.z], [Bd.x, 13.0, Bd.z]], 0.32, t.pProduct, DOT.product, 2.8);
  fpipe(g, anim, [[Bd.x + 1.6, 1.6, Bd.z], [Bd.x + 4, 1.6, Bd.z], [Bd.x + 4, 1.6, Bd.z + 12], [Bd.x + 2.6, 1.6, Bd.z + 12]], 0.32, t.pProduct, DOT.product, 2.6);
  cx(g, 1.2, 5, t.tankGrey, Bd.x, 1.6, ry, 20); // receiver drum
  for (const dx of [-1.6, 1.6]) bx(g, 0.8, 0.6, 2.0, m.concreteDark, Bd.x + dx, 0.3, ry);
  board(g, t.steelDark, 'Fixed-Bed Reactor', Bd.x - 4, Bd.z + 4, 5.6);
  return { id: 'reactor', nameBn: 'Reactor Section', group: g };
}
