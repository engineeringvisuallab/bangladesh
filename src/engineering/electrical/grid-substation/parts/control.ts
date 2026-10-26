import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building } from '../../../core/prims';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Control & relay building: relay panels with blinking lamps, SCADA screens (live bars; the alarm screen goes red when a feeder trips), feeder status lamps, battery bank. */
export function buildControl({ mats: m, g: gm, anim, fault, feederLamps }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'control';
  const C = L.control;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'E', floors: 2, door: 'S' });
  const x0 = C.x - C.w / 2;
  const z0 = C.z - C.d / 2;
  const alarmBg = new THREE.MeshBasicMaterial({ color: 0x07131c });
  const lampOn = new THREE.MeshBasicMaterial({ color: 0x38e07a });
  const lampAmber = new THREE.MeshBasicMaterial({ color: 0xffb703 });
  anim.disposables.push(alarmBg, lampOn, lampAmber);

  // relay panels along the west wall: grey cabinets with rows of status lamps
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const z = z0 + 2 + i * 1.4;
    box(g, 0.9, 2.3, 1.0, gm.paintGrey, x0 + 1.2, 0, z);
    for (let k = 0; k < 4; k++) {
      const l = box(g, 0.1, 0.12, 0.12, k % 2 ? lampOn : lampAmber, x0 + 1.7, 1.2 + k * 0.28, z);
      lamps.push(l);
    }
  }
  // SCADA screens on the north wall (live bars) + one alarm screen
  const bars: THREE.Mesh[] = [];
  for (let s = 0; s < 3; s++) {
    const sx = C.x - 8 + s * 6.5;
    box(g, 5.6, 3, 0.12, gm.screenBg, sx, 3.4, z0 + 0.5);
    for (let b = 0; b < 5; b++) bars.push(box(g, 4.2, 0.26, 0.14, [gm.barA, gm.barB, gm.barC][(s + b) % 3], sx, 3.7 + b * 0.4 - 0.3, z0 + 0.55));
  }
  box(g, 5.6, 3, 0.12, alarmBg, C.x + 11.5, 3.4, z0 + 0.5);
  box(g, 3.6, 0.45, 0.14, gm.barC, C.x + 11.5, 4.3, z0 + 0.58);
  // mimic strip with the 6 feeder status lamps (shared materials: they turn red when that feeder's breaker trips)
  box(g, 9, 0.9, 0.12, gm.screenBg, C.x + 2, 1.25, z0 + 0.5);
  feederLamps.forEach((lp, i) => box(g, 0.7, 0.5, 0.14, lp, C.x - 1.5 + i * 1.3, 1.45, z0 + 0.58));
  // operator desks and chairs
  for (let i = 0; i < 3; i++) {
    const x = C.x - 4 + i * 5;
    box(g, 3.6, 0.9, 1.4, m.concreteDark, x, 0, C.z + 0.5);
    box(g, 1.1, 0.7, 0.1, gm.screenBg, x - 0.8, 1.0, C.z + 0.1);
    box(g, 1.1, 0.7, 0.1, gm.screenBg, x + 0.8, 1.0, C.z + 0.1);
    box(g, 0.7, 0.8, 0.7, m.steel, x, 0, C.z + 2.0);
  }
  // battery bank (110 V DC): keeps protection and breakers working even if the AC supply is lost
  for (const dz of [0, 1.4]) for (let i = 0; i < 16; i++) box(g, 0.5, 0.7, 0.45, new THREE.MeshStandardMaterial({ color: 0x2f5f9e, roughness: 0.6 }), x0 + 4 + i * 0.6, 0.3, C.z + C.d / 2 - 2.2 + dz);
  box(g, 11, 0.1, 3.4, m.steel, x0 + 8.8, 0.15, C.z + C.d / 2 - 1.5);

  every(anim, (t) => {
    bars.forEach((b, i) => {
      b.scale.x = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(t * (0.7 + (i % 5) * 0.23) + i * 1.9));
    });
    lamps.forEach((l, i) => {
      l.visible = Math.sin(t * (1.5 + (i % 4) * 0.6) + i) > -0.55;
    });
    // alarm screen: dark when healthy, flashing red while a feeder is tripped
    const alarm = fault.phase === 1;
    alarmBg.color.setHex(alarm && Math.floor(t * 3) % 2 === 0 ? 0xb3261e : alarm ? 0x5a1410 : 0x07131c);
  });
  return { id: 'control', nameBn: 'Control & Relay Building', group: g };
}
