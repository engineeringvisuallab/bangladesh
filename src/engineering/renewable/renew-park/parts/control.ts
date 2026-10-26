import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { board, bx, mesh } from './helpers';

/** Energy control centre: a building open to the road with a big live display (solar, wind, battery charge, grid, demand), a day clock and a sun / moon. */
export function buildControl({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'control';
  const C = L.control;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'N', door: 'S' });
  const front = C.z - C.d / 2;
  const sgn = makeSign('Energy Control Centre', 10, 1.4);
  sgn.position.set(C.x, C.h + 1.5, front - 0.5);
  sgn.rotation.y = Math.PI;
  g.add(sgn);
  box(g, 0.2, 1.5, 0.2, t.steelDark, C.x - 4.5, C.h + 0.4, front - 0.5);
  box(g, 0.2, 1.5, 0.2, t.steelDark, C.x + 4.5, C.h + 0.4, front - 0.5);

  // consoles
  const screens: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const x = C.x - 12 + i * 8;
    bx(g, 4.4, 0.9, 1.5, t.steelDark, x, 0.45, C.z - 1);
    screens.push(bx(g, 1.4, 0.8, 0.1, t.ledGreen, x, 1.55, C.z - 1.5));
  }

  // live display on the back wall, seen from the road
  const wz = C.z + C.d / 2 - 0.6;
  const fz = wz - 0.12;
  bx(g, 26, 5.2, 0.15, t.screenOff, C.x, 3.8, wz);
  const bars: { mesh: THREE.Mesh; key: 'solar' | 'wind' | 'soc' | 'grid' | 'load' }[] = [];
  const defs: ['solar' | 'wind' | 'soc' | 'grid' | 'load', string, THREE.Material][] = [
    ['solar', 'Solar', t.barSolar],
    ['wind', 'Wind', t.barWind],
    ['soc', 'Battery', t.barBattery],
    ['grid', 'Grid', t.barGrid],
    ['load', 'Demand', t.barLoad],
  ];
  defs.forEach(([key, name, mat], i) => {
    const x = C.x - 10 + i * 5;
    bars.push({ mesh: bx(g, 1.8, 1, 0.1, mat, x, 2.0, fz), key });
    const sg = makeSign(name, 3.8, 0.65);
    sg.position.set(x, 1.35, fz - 0.02);
    sg.rotation.y = Math.PI;
    g.add(sg);
  });
  // day clock: the hand makes one turn per day; a sun in the daytime, a moon at night
  const clock = new THREE.Group();
  clock.position.set(C.x + 10.5, 5.6, fz - 0.02);
  g.add(clock);
  const face = mesh(clock, new THREE.CylinderGeometry(1.0, 1.0, 0.06, 28), t.steelDark, 0, 0, 0);
  face.rotation.x = Math.PI / 2;
  const hand = new THREE.Group();
  clock.add(hand);
  bx(hand, 0.1, 0.8, 0.05, t.ledAmber, 0, 0.4, -0.06);
  const sky = mesh(g, new THREE.SphereGeometry(0.55, 16, 12), t.sun, C.x - 10.5, 5.6, fz - 0.4);
  const csg = makeSign('Day clock', 2.6, 0.55);
  csg.position.set(C.x + 10.5, 4.3, fz - 0.02);
  csg.rotation.y = Math.PI;
  g.add(csg);

  every(anim, () => {
    for (const b of bars) {
      let v = 0;
      if (b.key === 'solar') v = sim.solar;
      else if (b.key === 'wind') v = sim.wind;
      else if (b.key === 'soc') v = sim.soc;
      else if (b.key === 'grid') v = Math.min(1, Math.abs(sim.grid));
      else v = sim.load;
      const h = 0.08 + 3.0 * Math.max(0, Math.min(1, v));
      b.mesh.scale.y = h;
      b.mesh.position.y = 2.0 + h / 2;
      if (b.key === 'grid') b.mesh.material = sim.grid >= 0 ? t.barGrid : t.ledAmber; // white = export, amber = import
    }
    hand.rotation.z = -sim.phase * Math.PI * 2;
    sky.material = sim.day ? t.sun : t.moon;
    screens.forEach((s, i) => {
      s.material = Math.sin(sim.phase * 60 + i * 1.7) > -0.5 ? t.ledGreen : t.ledOff;
    });
  });
  board(g, t.steelDark, 'Live display: one day = 40 seconds', C.x, C.z + 14, 9);
  return { id: 'control', nameBn: 'Energy Control Centre', group: g };
}
