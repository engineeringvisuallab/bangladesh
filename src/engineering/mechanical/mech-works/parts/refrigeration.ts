import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, valve, V } from '../../../core/prims';
import { flow, plume, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, cx, cy, mesh } from './helpers';

/** Vapour-compression refrigeration plant: compressor, air-cooled condenser (fan + heat plume), expansion valve, evaporator in a cold room (fan + cold air). Pipes and dots are coloured by the state of the refrigerant. */
export function buildRefrigeration({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'fridge';
  const F = L.fridge;
  building(g, m, { x: F.x, z: F.z, w: F.w, d: F.d, h: F.h, open: 'N', door: 'S' });
  const z = F.z;
  const sign = (text: string, x: number, y: number, w = 6.5): void => {
    const s = makeSign(text, w, 1.1);
    s.position.set(x, y, z - 4.2);
    s.rotation.y = Math.PI;
    g.add(s);
  };
  const dot = (pts: THREE.Vector3[], color: number, speed = 4): void => {
    flow(anim, g, pts, { color, speed, spacing: 1.1, size: 0.14 });
  };

  // ---- compressor: skid, motor with a turning coupling, compressor body
  const cxp = -45;
  bx(g, 8, 0.6, 3.6, t.cast, cxp, 0.3, z);
  cx(g, 1.0, 2.6, t.paintBlue, cxp + 1.4, 1.9, z, 24); // compressor
  cx(g, 0.85, 2.4, t.paintGrey, cxp - 2.3, 1.9, z, 24); // motor
  const cpl = new THREE.Group();
  cpl.position.set(cxp - 0.7, 1.9, z);
  g.add(cpl);
  cx(cpl, 0.35, 0.8, t.steel, 0, 0, 0, 14);
  bx(cpl, 0.14, 0.8, 0.14, t.mark, 0, 0.3, 0);
  spin(anim, cpl, 'x', 12);
  bx(g, 1.4, 1.0, 1.2, t.paintWhite, cxp + 1.4, 3.0, z); // oil separator
  sign('Compressor', cxp, 6.0);

  // ---- condenser: fin bank + fan on top
  const kx = -29;
  bx(g, 9, 0.35, 3.4, t.steelDark, kx, 0.4, z);
  for (let i = 0; i < 42; i++) bx(g, 0.05, 3.4, 3.0, t.fin, kx - 4.1 + i * 0.2, 2.3, z);
  const fan = new THREE.Group();
  fan.position.set(kx, 4.3, z);
  g.add(fan);
  for (let k = 0; k < 4; k++) {
    const b = bx(fan, 0.4, 0.05, 2.2, t.steelDark, 0, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (k * Math.PI) / 2;
    b.position.set(0, 0, 1.1);
    holder.add(b);
    fan.add(holder);
  }
  cy(g, 2.3, 0.12, t.steelDark, kx, 4.0, z, 28);
  cy(fan, 0.3, 0.5, t.steel, 0, -0.2, 0, 10);
  spin(anim, fan, 'y', 9);
  plume(anim, g, kx, 4.6, z, { count: 12, rise: 4.0, life: 2.6, size0: 1.0, size1: 2.6, windX: 0, windZ: -0.8, spread: 1.4, opacity: 0.2, color: 0xffb08a });
  sign('Condenser (throws heat out)', kx, 6.6, 9);

  // ---- expansion valve
  const ex = -14;
  bx(g, 0.9, 0.9, 0.9, t.paintRed, ex, 1.3, z);
  cy(g, 0.35, 0.6, t.brass, ex, 2.2, z, 12);
  for (let i = 0; i < 5; i++) mesh(g, new THREE.SphereGeometry(0.2 + (i % 2) * 0.08, 8, 6), m.white, ex + 0.7 + i * 0.28, 1.0 + (i % 3) * 0.12, z + 0.2); // frost
  valve(g, m, ex - 1.5, 1.3, z, 0.3, 'x');
  sign('Expansion Valve', ex, 4.4, 6);

  // ---- cold room with evaporator, fan, crates, cold air
  const cr = { x: -5, w: 10, d: 7, h: 5.2 };
  bx(g, cr.w, cr.h, 0.2, t.cold, cr.x, cr.h / 2, z - cr.d / 2);
  bx(g, cr.w, cr.h, 0.2, t.cold, cr.x, cr.h / 2, z + cr.d / 2);
  bx(g, 0.2, cr.h, cr.d, t.cold, cr.x - cr.w / 2, cr.h / 2, z);
  bx(g, 0.2, cr.h, cr.d, t.cold, cr.x + cr.w / 2, cr.h / 2, z);
  bx(g, cr.w + 0.3, 0.25, cr.d + 0.3, t.paintWhite, cr.x, cr.h + 0.1, z);
  for (let i = 0; i < 24; i++) bx(g, 0.05, 1.4, 1.6, t.fin, cr.x - 1.6 + i * 0.14, 4.1, z); // evaporator coil
  const efan = new THREE.Group();
  efan.position.set(cr.x - 3, 4.1, z + 0.4);
  g.add(efan);
  for (let k = 0; k < 3; k++) {
    const b = bx(efan, 0.3, 0.9, 0.04, t.steelDark, 0, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (k * Math.PI * 2) / 3;
    b.position.set(0, 0.5, 0);
    holder.add(b);
    efan.add(holder);
  }
  spin(anim, efan, 'z', 10);
  for (let i = 0; i < 6; i++) bx(g, 1.2, 1.0, 1.0, t.paintWhite, cr.x + 1.5 + (i % 3) * 1.4, 0.5 + Math.floor(i / 3) * 1.0, z + 0.8);
  plume(anim, g, cr.x, 3.4, z, { count: 12, rise: -2.4, life: 2.4, size0: 0.8, size1: 1.8, windX: 1.5, windZ: 0.6, spread: 3.0, opacity: 0.22, color: 0xcfeaff });
  sign('Evaporator (Cold Room)', cr.x, 7.0, 8);

  // ---- pipes, coloured by refrigerant state; dots show the flow direction
  const hot = [V(cxp + 1.4, 2.9, z), V(cxp + 1.4, 7.4, z), V(kx - 4.4, 7.4, z), V(kx - 4.4, 3.6, z)];
  const liquid = [V(kx + 4.4, 0.9, z), V(ex - 1.7, 0.9, z), V(ex - 1.7, 1.3, z), V(ex, 1.3, z)];
  const wet = [V(ex, 1.3, z), V(ex + 0.5, 1.3, z), V(cr.x - cr.w / 2, 1.3, z), V(cr.x - 1.8, 1.3, z), V(cr.x - 1.8, 4.1, z)];
  const suction = [V(cr.x + 1.8, 4.1, z), V(cr.x + 1.8, 6.4, z + 1.2), V(cr.x + 1.8, 7.0, z + 3.2), V(cxp + 2.6, 7.0, z + 3.2), V(cxp + 2.6, 1.9, z + 3.2), V(cxp + 2.6, 1.9, z)];
  pipe(g, hot, 0.28, t.pipeHot);
  pipe(g, liquid, 0.2, t.pipeLiquid);
  pipe(g, wet, 0.2, t.pipeCold);
  pipe(g, suction, 0.3, t.pipeSuction);
  dot(hot, 0xff8a7a, 5);
  dot(liquid, 0xffd08a, 3);
  dot(wet, 0x7ac8ff, 3);
  dot(suction, 0xe6f6ff, 5);
  // finned bank is shown with the same colour progression: hot at the inlet end
  return { id: 'fridge', nameBn: 'Refrigeration Plant', group: g };
}
