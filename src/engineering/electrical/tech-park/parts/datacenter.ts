import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, V } from '../../../core/prims';
import { every, flow, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, cy } from './helpers';

/** Data center: rows of server racks with blinking drive/network LEDs, a cold aisle (blue air from the floor) and a hot aisle (orange air to the roof), cooling units with fans, overhead fibre trays with light pulses, UPS and batteries. */
export function buildDatacenter({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'dc';
  const C = L.dc;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'N', door: 'S' });
  const sign = (text: string, w: number, x: number, y: number, z: number, rotY = Math.PI, h = 0.55): void => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    s.rotation.y = rotY;
    g.add(s);
  };
  // ---- two rows of racks (each rack: cabinet + 12 server units with LEDs). Racks face the cold aisle between the rows.
  const rows = [{ z: C.z - 6.0, face: 1 }, { z: C.z + 6.0, face: -1 }]; // front faces point to the aisle in the middle
  const leds: { mesh: THREE.Mesh; ph: number; speed: number; color: number }[] = [];
  const nRack = 10;
  const x0 = C.x - 38;
  for (const row of rows) {
    for (let r = 0; r < nRack; r++) {
      const x = x0 + r * 4.0 + (r >= 5 ? 6 : 0);
      bx(g, 2.4, 6.4, 1.6, t.rack, x, 0, row.z);
      const frontZ = row.z + row.face * 0.86; // the side that faces the cold aisle
      for (let u = 0; u < 12; u++) {
        const y = 0.35 + u * 0.5;
        bx(g, 2.1, 0.38, 0.06, t.cabinetDark, x, y, frontZ);
        for (let k = 0; k < 3; k++) {
          const ph = ((r * 12 + u) * 7.13 + k * 2.3 + row.z) % 6.28;
          const l1 = bx(g, 0.1, 0.1, 0.05, t.off, x - 0.7 + k * 0.28, y + 0.14, frontZ + row.face * 0.04);
          leds.push({ mesh: l1, ph, speed: 2 + ((r + u + k) % 5) * 1.3, color: k === 0 ? 0x38e07a : k === 1 ? 0x4cc9f0 : 0xffb703 });
        }
      }
    }
  }
  // the LED rows above are on the aisle side of each rack: front of row 0 faces +z (towards the aisle), row 1 faces -z
  // ---- cold aisle: blue floor and rising blue air; hot aisles behind the racks: orange air going up to the roof
  bx(g, 90, 0.05, 6.0, t.cold, C.x, 0.05, C.z);
  const aisle = (zc: number, color: number, yTop: number): void => {
    for (let i = 0; i < 6; i++) {
      const x = x0 + 2 + i * 12;
      flow(anim, g, [V(x, 0.4, zc), V(x, yTop, zc)], { color, speed: 2.4, spacing: 1.1, size: 0.14 });
    }
  };
  aisle(C.z, 0x7fd0ff, 5.5); // cold air from the floor vents
  aisle(C.z - 9, 0xff8a4c, 8.5); // hot air behind the racks rises to the roof returns
  aisle(C.z + 9, 0xff8a4c, 8.5);
  sign('COLD AISLE', 6, C.x - 44, 5.2, C.z, 0, 0.5);
  sign('HOT AISLE', 6, C.x - 44, 5.2, C.z - 9, 0, 0.5);
  // ---- overhead cable tray with light pulses (fibre)
  const trayY = 7.2;
  for (const zc of [C.z - 3.2, C.z + 3.2]) {
    bx(g, 84, 0.12, 1.4, t.steelDark, C.x, trayY - 0.08, zc);
    flow(anim, g, [V(C.x - 42, trayY + 0.15, zc), V(C.x + 42, trayY + 0.15, zc)], { color: 0x7fd0ff, speed: 14, spacing: 5, size: 0.12 });
    flow(anim, g, [V(C.x + 42, trayY + 0.15, zc + 0.3), V(C.x - 42, trayY + 0.15, zc + 0.3)], { color: 0xffd23f, speed: 14, spacing: 6, size: 0.1 });
  }
  sign('FIBRE-OPTIC TRAYS: LIGHT PULSES = DATA', 16, C.x, 8.0, C.z - 3.2, 0, 0.6);
  // ---- cooling units (CRAH) with spinning fans at the east end
  for (let i = 0; i < 3; i++) {
    const z = C.z - 8 + i * 8;
    bx(g, 3.2, 5.6, 2.4, t.cabinet, C.x + 44, 0, z);
    const fan = new THREE.Group();
    fan.position.set(C.x + 42.3, 3.2, z);
    g.add(fan);
    for (let k = 0; k < 4; k++) {
      const b = bx(fan, 0.05, 0.3, 1.5, t.steelDark, 0, 0, 0);
      const holder = new THREE.Group();
      holder.rotation.x = (k * Math.PI) / 2;
      b.position.set(0, 0, 0);
      holder.add(b);
      fan.add(holder);
    }
    spin(anim, fan, 'x', 12);
  }
  sign('COOLING UNITS: CHILLED WATER TAKES THE HEAT AWAY', 17, C.x + 44, 6.6, C.z, 0, 0.55);
  // chilled-water pipe (blue) to a chiller outside the north... (it goes out through the wall)
  pipe(g, [V(C.x + 46, 1.0, C.z - 8), V(C.x + 46, 1.0, C.z + 8)], 0.25, m.pipe.cooling);
  flow(anim, g, [V(C.x + 46, 1.0, C.z - 8), V(C.x + 46, 1.0, C.z + 8)], { color: 0xc8fff7, speed: 3, spacing: 1.6, size: 0.16 });
  // ---- power: UPS cabinets and a battery wall at the west end
  for (let i = 0; i < 2; i++) bx(g, 3.0, 4.6, 1.8, t.cabinet, C.x - 46, 0, C.z - 3 + i * 6);
  for (let i = 0; i < 18; i++) bx(g, 0.9, 0.9, 0.9, t.blue, C.x - 47.8 + (i % 6) * 1.0, 0.1 + Math.floor(i / 6) * 1.0, C.z - 14);
  sign('UPS + BATTERIES (POWER NEVER BLINKS)', 14, C.x - 44, 5.6, C.z - 3, Math.PI / 2, 0.5);
  every(anim, (tm) => {
    for (const l of leds) l.mesh.material = Math.sin(tm * l.speed + l.ph) > 0.35 ? lamp(l.color) : t.off;
  });
  void cy;
  return { id: 'dc', nameBn: 'Data Center', group: g };
}
