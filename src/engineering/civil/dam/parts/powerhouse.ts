import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, cyl, tank, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Powerhouse: two vertical Francis turbine-generator units (the runner, shaft and generator rotor all turn), overhead crane, draft tubes and the tailrace pool. */
export function buildPowerhouse({ mats: m, t, anim, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'powerhouse';
  const Hh = L.hall;
  const zu = L.unitZ;
  building(g, m, { x: (Hh.x0 + Hh.x1) / 2, z: (Hh.z0 + Hh.z1) / 2, w: Hh.x1 - Hh.x0, d: Hh.z1 - Hh.z0, h: Hh.h, open: 'S', door: 'E' });

  for (const xu of L.units) {
    // concrete spiral-case housing (transparent so the runner shows) and the volute inlet from the penstock
    cyl(g, 4.2, 3, t.glass, xu, 1.6, zu, 28);
    // draft tube: carries the used water under the floor into the tailrace
    box(g, 4.6, 3.4, 9, m.concrete, xu, 0.2, 35.6);
    // generator floor: slab on four legs
    box(g, 10, 0.6, 10, m.concrete, xu, 9.1, zu);
    for (const dx of [-4.2, 4.2]) for (const dz of [-4.2, 4.2]) box(g, 0.9, 8.5, 0.9, m.concrete, xu + dx, 0.6, zu + dz);
    // the rotating assembly on one vertical shaft: runner (turbine), shaft, generator rotor, exciter
    const rotor = new THREE.Group();
    rotor.position.set(xu, 0, zu);
    g.add(rotor);
    cyl(rotor, 0.55, 12.5, m.steel, 0, 3.1, 0, 14); // shaft
    cyl(rotor, 0.95, 2.6, t.blade, 0, 1.8, 0, 18); // runner hub
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const blade = box(rotor, 0.14, 2.2, 1.7, t.blade, Math.cos(a) * 2.3, 1.9, Math.sin(a) * 2.3);
      blade.rotation.y = -a + 0.5; // twisted blades
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.45, 8, 32), t.poleRed);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 11.2, 0);
    rotor.add(ring);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      box(rotor, 0.55, 1.7, 0.7, k % 2 ? t.poleBlue : t.poleRed, Math.cos(a) * 3.0, 10.35, Math.sin(a) * 3.0).rotation.y = -a;
    }
    box(rotor, 6, 0.3, 0.5, t.steelDark, 0, 10.2, 0);
    box(rotor, 0.5, 0.3, 6, t.steelDark, 0, 10.2, 0);
    cyl(rotor, 1.2, 1.8, t.steelDark, 0, 12.7, 0, 18); // exciter
    spin(anim, rotor, 'y', 2.0);
    // stator: translucent casing so the spinning rotor can be seen; top cover and terminal box
    cyl(g, 3.9, 3.2, t.glass, xu, 9.7, zu, 32);
    cyl(g, 3.95, 0.35, t.steelDark, xu, 12.9, zu, 32);
    cyl(g, 3.95, 0.35, t.steelDark, xu, 9.5, zu, 32);
    box(g, 1.8, 1.6, 1.4, t.paintGrey, xu + 4.6, 10.4, zu);
    // water path through the machine: penstock -> spiral case -> runner -> draft tube -> tailrace
    flow(anim, g, [V(xu, 3.1, 13.7), V(xu, 3.1, 23.8), V(xu, 2.4, zu), V(xu, 1.4, 33), V(xu, 0.9, 40.2), V(xu, -0.1, 41), V(xu, -0.1, 61)], { color: 0x9fd0ff, speed: 7, spacing: 3, size: 0.5 });
  }

  // overhead travelling crane (lifts the heavy rotor for maintenance): rails on both long walls, a bridge that slides along x with a trolley and hook
  box(g, 40, 0.4, 0.5, m.steel, 66, 14, Hh.z0 + 1.2);
  box(g, 40, 0.4, 0.5, m.steel, 66, 14, Hh.z1 - 1.2);
  const crane = new THREE.Group();
  g.add(crane);
  box(crane, 1.2, 1.1, Hh.z1 - Hh.z0 - 2, t.gateOrange, 0, 14.4, 28);
  const trolley = new THREE.Group();
  crane.add(trolley);
  box(trolley, 2.2, 0.8, 1.8, t.steelDark, 0, 13.6, 0);
  cyl(trolley, 0.06, 3.8, m.steel, 0, 9.8, 0, 6); // hoist rope
  box(trolley, 0.8, 0.8, 0.8, m.yellow, 0, 9.8, 0);
  every(anim, (tm) => {
    crane.position.x = 66 + 14 * Math.sin(tm * 0.12);
    trolley.position.z = 28 + 5 * Math.sin(tm * 0.2);
  });

  // tailrace pool in front of the draft tubes (sunk into the ground)
  const T = L.tailrace;
  tank(g, site, m, { x: (T.x0 + T.x1) / 2, z: (T.z0 + T.z1) / 2, w: T.x1 - T.x0, d: T.z1 - T.z0, depth: T.depth, top: 0.2, water: t.river, level: -0.25 });
  return { id: 'powerhouse', nameBn: 'Powerhouse: turbines, generators and tailrace', group: g };
}
