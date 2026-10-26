import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { cyl } from '../../../core/prims';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cone, cy, fpipe, mesh } from './helpers';

/** Three wind turbines (the rotor faces south, the wind comes from the south in the monsoon), the cables to the bus, and a weather mast with a cup anemometer and a wind vane. */
export function buildWind({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'wind';
  const H = L.hubY;
  const rotors: THREE.Group[] = [];
  const beacons: THREE.Mesh[] = [];

  L.turbines.forEach((tb, i) => {
    cyl(g, 4.2, 0.8, m.concrete, tb.x, 0, tb.z, 28); // foundation
    mesh(g, new THREE.CylinderGeometry(1.1, 2.0, 40, 28), t.white, tb.x, 20.8, tb.z); // tapered tower
    bx(g, 5.8, 3.0, 3.4, t.white, tb.x, H, tb.z + 0.3); // nacelle: gearbox and generator inside
    bx(g, 1.6, 0.5, 2.0, t.steelDark, tb.x - 1.6, H + 1.8, tb.z + 0.3); // anemometer mount on the roof
    beacons.push(mesh(g, new THREE.SphereGeometry(0.25, 10, 8), t.ledRed, tb.x + 1.6, H + 1.9, tb.z - 0.6));
    const rotor = new THREE.Group();
    rotor.position.set(tb.x, H, tb.z + 3.1);
    g.add(rotor);
    const nose = cone(g, 1.2, 2.6, t.white, tb.x, H, tb.z + 4.3, 18);
    nose.rotation.x = Math.PI / 2;
    cy(rotor, 0.9, 1.4, t.white, 0, 0, 0, 18).rotation.x = Math.PI / 2; // hub
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.rotation.z = (k * Math.PI * 2) / 3 + i * 0.7;
      bx(holder, 1.5, 4.2, 0.55, t.blade, 0, 2.6, 0.3);
      bx(holder, 0.95, 10.5, 0.3, t.blade, 0, 9.9, 0.3);
      bx(holder, 0.6, 1.4, 0.3, t.blade, 0, 15.6, 0.3);
      bx(holder, 0.97, 1.0, 0.32, t.paintRed, 0, 14.4, 0.3); // tip marking
      rotor.add(holder);
    }
    rotors.push(rotor);
    // cable from the tower foot to the bus
    fpipe(g, anim, [[tb.x, 0.25, tb.z + 3], [tb.x, 0.25, L.windBusZ]], 0.1, t.cWind, DOT.wind, 3, 1.2);
  });
  const xs = L.turbines.map((tb) => tb.x);
  fpipe(g, anim, [[Math.max(...xs), 0.25, L.windBusZ], [L.trafo.x, 0.25, L.windBusZ], [L.trafo.x, 0.25, L.trafo.z - 3]], 0.14, t.cWind, DOT.wind, 3.4, 1.4);
  board(g, t.steelDark, 'Wind Turbine (rotor about 32 m across)', L.turbines[0].x, L.turbines[0].z + 12, 9);

  // the rotors turn faster in a stronger wind; they stop when it is too calm
  anim.add((_tt, dt) => {
    const w = sim.wind;
    const speed = w < 0.18 ? 0.1 : 0.35 + 1.4 * w;
    for (const r of rotors) r.rotation.z -= dt * speed;
  });
  every(anim, (tt) => {
    for (const b of beacons) b.material = Math.sin(tt * 4) > 0 ? t.ledRed : t.ledOff; // aircraft warning light
  });

  // ---- weather mast: wind speed from the cups, direction from the vane
  const M = L.mast;
  cyl(g, 0.15, 20, t.steel, M.x, 0, M.z, 10);
  const cups = new THREE.Group();
  cups.position.set(M.x, 20.3, M.z);
  g.add(cups);
  cy(cups, 0.08, 0.6, t.steelDark, 0, 0, 0, 8);
  for (let k = 0; k < 3; k++) {
    const holder = new THREE.Group();
    holder.rotation.y = (k * Math.PI * 2) / 3;
    bx(holder, 0.9, 0.05, 0.05, t.steelDark, 0.45, 0.2, 0);
    mesh(holder, new THREE.SphereGeometry(0.17, 8, 6), t.white, 0.95, 0.2, 0);
    cups.add(holder);
  }
  anim.add((_tt, dt) => {
    cups.rotation.y += dt * (1 + 9 * sim.wind);
  });
  const vane = new THREE.Group();
  vane.position.set(M.x, 18.5, M.z);
  g.add(vane);
  bx(vane, 1.4, 0.05, 0.05, t.steelDark, 0, 0, 0);
  bx(vane, 0.5, 0.5, 0.04, t.paintRed, -0.8, 0, 0);
  cone(vane, 0.12, 0.35, t.paintRed, 0.8, 0, 0, 8).rotation.z = -Math.PI / 2;
  every(anim, (tt) => {
    vane.rotation.y = 0.9 * Math.sin(tt * 0.35) + 0.3 * Math.sin(tt * 1.1);
  });
  board(g, t.steelDark, 'Weather Mast', M.x, M.z + 5, 4.4);
  return { id: 'wind', nameBn: 'Wind Turbines & Weather Mast', group: g };
}
