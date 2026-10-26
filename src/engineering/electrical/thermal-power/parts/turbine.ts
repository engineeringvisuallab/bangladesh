import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, cylH, pipe, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Turbine hall: HP + LP steam turbine and the generator on one shaft (the rotor really turns), overhead crane, main steam line from the boiler. */
export function buildTurbine({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'turbine';
  const H = L.hall;
  const Y = L.shaft.y;
  const Z = L.shaft.z;
  building(g, m, { x: H.x, z: H.z, w: H.w, d: H.d, h: H.h, open: 'S', door: 'N' });

  // turbine deck ("table") on legs: the condenser stands under it
  box(g, 52, 1.2, 8, m.concrete, -1, 6.2, Z);
  for (const x of [-25, -14, 8, 24]) for (const dz of [-3.6, 3.6]) box(g, 1.2, 6.2, 1.2, m.concrete, x, 0, Z + dz);

  // casings (translucent, so the spinning blade discs can be seen)
  const hp = { x: -17, len: 9, r: 1.9 };
  const lp = { x: -2, len: 12, r: 3.0 };
  cylH(g, hp.r, hp.len, t.casingGlass, hp.x, Y, Z, 'x', 24);
  cylH(g, lp.r, lp.len, t.casingGlass, lp.x, Y, Z, 'x', 28);
  for (const x of [-20, -14]) box(g, 1.2, 1.1, 3, m.steel, x, 7.4, Z);
  box(g, 2.4, 1.8, 2.4, m.steel, hp.x, Y + hp.r, Z); // control valve chest
  box(g, 1.8, 1.4, 1.6, m.steel, -23.5, Y - 0.7, Z); // front bearing / governor

  // rotor: shaft + blade discs + couplings (turns about the x axis)
  const rotor = new THREE.Group();
  rotor.position.set(0, Y, Z);
  g.add(rotor);
  cylH(rotor, 0.55, 49, m.steel, 0, 0, 0, 'x', 16);
  const disc = (x: number, r: number): void => {
    cylH(rotor, r, 0.22, t.blade, x, 0, 0, 'x', 28);
    const fin = box(rotor, 0.12, r, 0.5, t.blade, x, 0, 0); // one radial fin per disc: makes the rotation visible
    fin.position.set(x, r / 2, 0);
    const holder = new THREE.Group();
    holder.rotation.x = x * 0.9; // different start angle per disc
    holder.add(fin);
    rotor.add(holder);
  };
  for (let i = 0; i < 6; i++) disc(hp.x - 3.6 + i * 1.45, 1.0 + i * 0.1); // HP stages
  for (let i = 0; i < 5; i++) {
    disc(lp.x - 1.4 - i * 1.0, 1.7 + i * 0.25); // LP stages, double flow: steam enters in the middle and goes both ways
    disc(lp.x + 1.4 + i * 1.0, 1.7 + i * 0.25);
  }
  for (const x of [-10.5, 8.5]) {
    cylH(rotor, 1.15, 0.45, t.steelDark, x, 0, 0, 'x', 24); // coupling flange
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(rotor, 0.3, 0.3, 0.3, m.yellow, x, Math.cos(a) * 0.9 - 0.15, Math.sin(a) * 0.9);
    }
  }
  cylH(rotor, 1.05, 1.8, t.steelDark, 24, 0, 0, 'x', 20); // exciter
  box(rotor, 0.3, 2.1, 0.4, m.yellow, 24, 0, 0);
  spin(anim, rotor, 'x', 5.5);

  // generator (stationary body around the rotor): cooling-fin rings, end bells, terminal box
  const gen = { x: 16, len: 14, r: 2.4 };
  cylH(g, gen.r, gen.len, t.generator, gen.x, Y, Z, 'x', 32);
  for (let i = 0; i < 8; i++) cylH(g, gen.r + 0.12, 0.3, t.paintGrey, gen.x - gen.len / 2 + 1 + i * 1.8, Y, Z, 'x', 32);
  for (const x of [11, 21]) box(g, 1.2, 0.7, 3, m.steel, x, Y - gen.r - 0.6, Z);
  box(g, 3, 1.6, 3, t.paintWhite, 20, Y + gen.r, Z); // terminal box (cables leave to the transformer)

  // LP exhaust neck down to the condenser
  box(g, 6, 1.6, 6, m.steel, lp.x, 5.8, Z);

  // overhead travelling crane
  for (const dz of [-13.2, 13.2]) box(g, 60, 0.5, 0.5, m.steel, H.x, 17, H.z + dz);
  const bridge = new THREE.Group();
  box(bridge, 0.9, 0.9, 26.4, t.paintRed, 0, 17.5, 0);
  for (const dz of [-13.2, 13.2]) box(bridge, 1.4, 0.6, 1.4, m.steel, 0, 17.1, dz);
  const trolley = new THREE.Group();
  box(trolley, 2.2, 0.8, 2.4, m.yellow, 0, 18.4, 0);
  const rope = box(trolley, 0.08, 6, 0.08, m.steel, 0, 12.4, 0);
  box(trolley, 0.7, 0.7, 0.7, m.steel, 0, 11.7, 0);
  bridge.add(trolley);
  bridge.position.set(H.x, 0, H.z);
  g.add(bridge);
  every(anim, (tm) => {
    bridge.position.x = H.x + 18 * Math.sin(tm * 0.12);
    trolley.position.z = 7 * Math.sin(tm * 0.2);
    rope.scale.y = 1 + 0.05 * Math.sin(tm * 0.9);
  });

  // main steam line: boiler -> over the pipe rack -> into the HP casing; crossover HP -> LP
  const steam = [V(-103, 37, -34), V(-103, 47.5, -34), V(-40, 47.5, -34), V(-40, 16, -34), V(hp.x, 16, -34), V(hp.x, 16, Z), V(hp.x, Y + hp.r + 1.8, Z)];
  pipe(g, steam, 0.7, t.lagging);
  for (const x of [-85, -70, -55]) {
    box(g, 0.8, 47.5, 0.8, m.steel, x, 0, -34);
    box(g, 2.4, 0.4, 0.4, m.steel, x, 46.9, -34);
  }
  const cross = [V(hp.x + hp.len / 2, Y, Z), V(hp.x + hp.len / 2, 14.4, Z), V(lp.x, 14.4, Z), V(lp.x, Y + lp.r, Z)];
  pipe(g, cross, 0.6, t.lagging);
  flow(anim, g, [...steam, V(hp.x, Y, Z), V(hp.x + hp.len / 2, Y, Z), ...cross.slice(1)], { color: 0xffffff, speed: 14, spacing: 2.6, size: 0.3 });
  void cyl;
  return { id: 'turbine', nameBn: 'Turbine Hall (Steam Turbine & Generator)', group: g };
}
