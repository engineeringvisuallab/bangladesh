import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { insulatorColumn } from './equip';

const PITCH = 3.5;

/** Two 132/33 kV power transformers: tank on a plinth, radiator banks with spinning cooling fans, conservator, Buchholz relay, tap changer, bushings, firewall and oil pit. */
export function buildTransformers({ mats: m, g: gm, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'transformer';
  const Z = L.trafoZ;
  const tanks: THREE.Group[] = [];
  for (const tx of L.trafoX) {
    box(g, 22, 0.1, 15, gm.gravelPit, tx, 0, Z); // oil soak pit (gravel) around the transformer
    box(g, 12, 0.8, 7, gm.paintGrey, tx, 0, Z);
    const tank = new THREE.Group();
    tank.position.set(tx, 0, Z);
    g.add(tank);
    tanks.push(tank);
    box(tank, 10, 7, 6, gm.paintGreen, 0, 0.8, 0);
    box(tank, 10.4, 0.4, 6.4, gm.paintGrey, 0, 7.8, 0); // lid
    // radiator banks east and west, 6 panels each
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) box(tank, 0.22, 5.2, 3.8, gm.paintGreen, sx * (5.7 + i * 0.55), 1.4, 0);
    // conservator tank + Buchholz relay in the pipe to the tank
    cylH(tank, 0.75, 8, gm.paintGrey, 0, 9.7, 0.8, 'x', 16);
    cylH(tank, 0.14, 1.9, gm.steelDark, 0, 8.7, 0.8, 'z', 8);
    cyl(tank, 0.34, 0.5, m.yellow, 0, 8.55, 0.8, 10);
    box(tank, 1.5, 3.2, 1.7, gm.paintGrey, 3.2, 1.0, 3.9); // on-load tap changer
    // HV bushings (tall, north) and LV bushings (shorter, south)
    for (const dx of [-PITCH, 0, PITCH]) {
      insulatorColumn(tank, gm, dx, 8, -2.4, 3.6, 0.3);
      insulatorColumn(tank, gm, dx, 8, 2.4, 2.2, 0.26);
    }
    // cooling fans under both radiator banks (they really turn)
    for (const sx of [-1, 1]) for (const dz of [-1.2, 1.2]) {
      const fan = new THREE.Group();
      fan.position.set(sx * 7.1, 1.1, dz);
      for (let k = 0; k < 4; k++) {
        const blade = box(fan, 1.5, 0.05, 0.28, gm.steelDark, 0, 0, 0);
        blade.rotation.y = (k / 4) * Math.PI;
      }
      cyl(fan, 0.12, 0.2, m.steel, 0, -0.05, 0, 8);
      tank.add(fan);
      spin(anim, fan, 'y', 16);
    }
    // conductors: from the bay (HV) to the bushings, from the LV bushings up and over towards the 33 kV bus
    for (const dx of [-PITCH, 0, PITCH]) {
      pipe(g, [V(tx + dx, 6.2, 1), V(tx + dx, 11.8, 1), V(tx + dx, 11.8, Z - 2.4)], 0.08, gm.conductor);
    }
    const mvz = L.mvBus.z;
    [-PITCH, 0, PITCH].forEach((dx, i) => {
      const path = [V(tx + dx, 10.4, Z + 2.4), V(tx + dx, 10.4, 14), V(tx + dx, 9.2, 14), V(tx + dx, 9.2, mvz[i] - 1), V(tx + dx, L.mvBus.y, mvz[i])];
      pipe(g, path, 0.08, gm.conductor);
      flow(anim, g, [V(tx + dx, 11.8, Z - 2.4), V(tx + dx, 11.8, Z - 2.4), ...path], { color: 0xffe066, speed: 9, spacing: 4, size: 0.25 });
    });
  }
  // fire wall between the two transformers (a fire in one must not reach the other)
  box(g, 0.6, 9, 16, m.concrete, 60, 0, Z);
  // faint humming: the tanks shake a few millimetres (magnetostriction, twice the mains frequency)
  every(anim, (t) => {
    tanks.forEach((tk, i) => {
      tk.position.x = L.trafoX[i] + 0.012 * Math.sin(t * 38 + i);
    });
  });
  return { id: 'transformer', nameBn: 'Power Transformers (132/33 kV)', group: g };
}
