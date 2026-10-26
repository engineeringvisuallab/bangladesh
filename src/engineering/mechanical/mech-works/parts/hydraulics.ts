import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, V } from '../../../core/prims';
import { every, flow } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bar, bx, cx, cy, mesh } from './helpers';

/** Hydraulics bay: Pascal's-law demonstrator (small piston down a long way, big piston up a little, lifting a load) and a four-column hydraulic press with power pack, gauge and oil flow. */
export function buildHydraulics({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'hydro';
  const H = L.hydro;
  building(g, m, { x: H.x, z: H.z, w: H.w, d: H.d, h: H.h, open: 'N', door: 'S' });
  const sign = (text: string, x: number, y: number, z: number, w = 7): void => {
    const s = makeSign(text, w, 1.1);
    s.position.set(x, y, z);
    s.rotation.y = Math.PI; // faces the road in the north
    g.add(s);
  };
  const zf = H.z - 2; // exhibits' z

  // ---------- Pascal's law
  {
    const x0 = -135;
    const rs = 0.35;
    const rl = 1.05;
    const stroke = 1.8;
    bx(g, 9, 0.5, 3.4, t.paintGrey, x0, 0.25, zf);
    bx(g, 11, 8, 0.2, t.plate, x0, 4.7, H.z + 6);
    const xs = x0 - 3;
    const xl = x0 + 2.4;
    const y0 = 0.5;
    const hc = 4.4;
    for (const [x, r] of [[xs, rs], [xl, rl]] as const) {
      mesh(g, new THREE.CylinderGeometry(r + 0.06, r + 0.06, hc, 28, 1, true), t.glass, x, y0 + hc / 2, zf);
      cy(g, r + 0.12, 0.2, t.steelDark, x, y0 + 0.1, zf, 28);
    }
    // oil (cylinders whose height follows the piston), manifold below
    const oilS = mesh(g, new THREE.CylinderGeometry(rs, rs, 1, 20), t.oil, xs, 0, zf);
    const oilL = mesh(g, new THREE.CylinderGeometry(rl, rl, 1, 24), t.oil, xl, 0, zf);
    const man = [V(xs, y0 + 0.4, zf), V(xl, y0 + 0.4, zf)];
    pipe(g, man, 0.2, t.oil);
    // pistons
    const pS = new THREE.Group();
    g.add(pS);
    cy(pS, rs - 0.02, 0.35, t.steel, xs, 0, zf, 20);
    cy(pS, 0.07, 2.0, t.steel, xs, 0.35, zf, 8);
    bx(pS, 1.6, 0.18, 0.5, m.red, xs, 2.4, zf); // push handle
    const pL = new THREE.Group();
    g.add(pL);
    cy(pL, rl - 0.03, 0.4, t.steel, xl, 0, zf, 28);
    bx(pL, 2.6, 0.9, 1.6, t.paintBlue, xl, 0.4, zf);
    const sgn = makeSign('LOAD', 2.2, 0.7);
    sgn.position.set(xl, 0.85, zf + 0.85);
    pL.add(sgn);
    const topS = y0 + hc - 0.4; // small piston start (top of stroke)
    const botL = y0 + 0.35;
    const flowDots = flow(anim, g, [V(xs, y0 + 0.4, zf + 0.0), V(xl, y0 + 0.4, zf)], { color: 0xffe08a, speed: 0.7, spacing: 0.9, size: 0.1 });
    flowDots.visible = true;
    every(anim, (tm) => {
      const s = 0.5 - 0.5 * Math.cos(tm * 0.6);
      const ds = stroke * s;
      pS.position.y = topS - ds;
      const dl = ds * (rs / rl) ** 2;
      pL.position.y = botL + 0.5 + dl;
      oilS.scale.y = Math.max(0.01, topS - ds - (y0 + 0.4));
      oilS.position.y = y0 + 0.4 + oilS.scale.y / 2;
      oilL.scale.y = Math.max(0.01, botL + 0.5 + dl - (y0 + 0.4));
      oilL.position.y = y0 + 0.4 + oilL.scale.y / 2;
    });
    sign('Pascal\'s Law', x0, 8.4, zf - 1.2);
  }

  // ---------- hydraulic press
  {
    const cx0 = -108;
    const hw = 2.5;
    const hd = 1.3;
    bx(g, 6.6, 0.9, 4.4, t.cast, cx0, 0.45, zf);
    bx(g, 5.0, 0.35, 3.2, t.steelDark, cx0, 1.05, zf); // bolster
    for (const sx of [-hw, hw]) for (const sz of [-hd, hd]) bx(g, 0.4, 7.4, 0.4, t.steel, cx0 + sx, 4.6, zf + sz);
    bx(g, 6.4, 0.9, 4.2, t.paintGreen, cx0, 8.5, zf);
    cy(g, 1.0, 2.0, t.paintGreen, cx0, 9.0, zf, 28);
    bx(g, 0.5, 0.5, 0.5, t.steelDark, cx0, 11.1, zf);
    // moving crosshead (platen) with ram
    const platen = new THREE.Group();
    g.add(platen);
    bx(platen, 5.0, 0.7, 3.4, t.paintBlue, cx0, 0, zf);
    cy(platen, 0.6, 3.6, t.steel, cx0, 0.3, zf, 22);
    // workpiece (squashed when the platen reaches it)
    const wp = bx(g, 1.8, 1.4, 1.4, t.copper, cx0, 1.2 + 0.7, zf);
    // pressure gauge
    const gx = cx0 + 1.4;
    const gaugeFace = mesh(g, new THREE.CylinderGeometry(0.7, 0.7, 0.18, 28), m.white, gx, 9.3, zf - hd - 1.1);
    gaugeFace.rotation.x = Math.PI / 2;
    const needle = bar(g, 0.08, 0.1, t.mark);
    needle.scale.y = 0.55;
    // power pack: tank + motor + pump (coupling turns)
    const px = -100;
    const pz = H.z + 8;
    bx(g, 3.2, 1.8, 2.2, t.paintGrey, px, 1.0, pz);
    cx(g, 0.75, 1.8, t.paintBlue, px - 3.2, 1.3, pz, 20);
    const cpl = new THREE.Group();
    cpl.position.set(px - 2.0, 1.3, pz);
    g.add(cpl);
    cx(cpl, 0.3, 0.7, t.steel, 0, 0, 0, 12);
    bx(cpl, 0.12, 0.7, 0.12, t.mark, 0, 0.3, 0);
    cx(g, 0.55, 0.9, t.steelDark, px - 1.1, 1.3, pz, 20); // pump
    bx(g, 1.2, 1.1, 1.0, t.paintRed, px + 2.3, 1.0, pz); // valve block
    const pressure = [V(px - 1.1, 1.8, pz), V(px - 1.1, 3.0, pz), V(cx0 + 3.6, 3.0, pz), V(cx0 + 3.6, 3.0, zf), V(cx0 + 3.6, 10.0, zf), V(cx0 + 1.0, 10.0, zf)];
    const back = [V(cx0 - 1.0, 8.3, zf), V(cx0 - 3.6, 8.3, zf), V(cx0 - 3.6, 2.0, pz - 0.5), V(px + 0.8, 2.0, pz - 0.5), V(px + 0.8, 1.9, pz)];
    pipe(g, pressure, 0.2, t.pipeOilP);
    pipe(g, back, 0.17, t.pipeOilR);
    flow(anim, g, pressure, { color: 0xffc27a, speed: 4, spacing: 1.2, size: 0.13 });
    flow(anim, g, back, { color: 0x9fc4ff, speed: 3, spacing: 1.4, size: 0.12 });
    every(anim, (tm) => {
      const u = 0.5 + 0.5 * Math.cos(tm * 0.7); // 1 = up, 0 = down
      const py = 2.45 + 2.8 * u;
      platen.position.y = py;
      const bottom = py - 0.35;
      const sq = Math.min(1, Math.max(0, (2.6 - bottom) / 0.55));
      wp.scale.y = 1 - 0.4 * sq;
      wp.position.y = 1.2 + 0.7 * wp.scale.y;
      const descending = Math.sin(tm * 0.7) > 0;
      const p = 0.2 + (descending ? 0.15 : 0) + 0.65 * sq;
      const ang = -2.3 + p * 2.8;
      needle.position.set(gx + Math.sin(ang) * 0.27, 9.3 + Math.cos(ang) * 0.27, zf - hd - 1.25);
      needle.rotation.z = -ang;
      cpl.rotation.x += 0.35;
    });
    sign('Hydraulic Press', cx0, 12.0 - 0.4, zf - 1.2);
  }
  return { id: 'hydro', nameBn: 'Hydraulics Bay (Pascal\'s Law & Hydraulic Press)', group: g };
}
