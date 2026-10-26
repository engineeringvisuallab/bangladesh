import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { flow } from '../../../core/anim';
import { V } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cy, fpipe, mesh } from './helpers';

/** Solar field (8 rows of modules tilted towards the sun), DC cables, inverter station, and an exploded "how a solar module is built" demonstration. */
export function buildSolar({ t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'solar';
  const S = L.solar;
  const len = S.x1 - S.x0;
  const cxm = (S.x0 + S.x1) / 2;
  const chord = 4.4;
  const yc = 1.9;
  const dz = (chord / 2) * Math.cos(S.tilt);
  const dy = (chord / 2) * Math.sin(S.tilt);
  const flows: THREE.InstancedMesh[] = [];

  for (let i = 0; i < S.rows; i++) {
    const z = S.z0 + i * S.pitch;
    const strip = bx(g, len, 0.08, chord, t.pv, cxm, yc, z);
    strip.rotation.x = S.tilt; // normal tips towards +z (south): the modules face the sun
    bx(g, len, 0.1, 0.1, t.alu, cxm, yc - dy, z + dz); // frame rails along the low and the high edge
    bx(g, len, 0.1, 0.1, t.alu, cxm, yc + dy, z - dz);
    const n = Math.round(len / 14.5);
    for (let k = 0; k <= n; k++) {
      const x = S.x0 + (len * k) / n;
      bx(g, 0.18, yc - dy, 0.18, t.steelDark, x, (yc - dy) / 2, z + dz); // low posts
      bx(g, 0.18, yc + dy, 0.18, t.steelDark, x, (yc + dy) / 2, z - dz); // high posts
    }
    // combiner box and DC cable to the collector
    bx(g, 0.8, 1.0, 0.5, t.paintGrey, S.x1 + 1.5, 0.5, z);
    flows.push(fpipe(g, anim, [[S.x1 + 1.9, 0.25, z], [L.collectorX, 0.25, z]], 0.1, t.cDC, DOT.dc, 3, 1.2));
  }
  const lastZ = S.z0 + (S.rows - 1) * S.pitch;
  const I = L.inverter;
  flows.push(fpipe(g, anim, [[L.collectorX, 0.25, S.z0], [L.collectorX, 0.25, I.z], [I.x - 3.6, 0.25, I.z]], 0.16, t.cDC, DOT.dc, 3.4, 1.4));
  board(g, t.steelDark, 'Solar Field (tilted 23° to the south)', cxm, lastZ + 9, 9);

  // ---- inverter station: DC from the modules -> AC, two fans cool it (they run faster when the sun is strong)
  bx(g, 7, 2.6, 3, t.white, I.x, 1.3, I.z);
  bx(g, 7.2, 0.2, 3.2, t.steelDark, I.x, 2.65, I.z);
  for (let k = 0; k < 6; k++) bx(g, 0.1, 1.6, 0.05, t.steelDark, I.x - 2.5 + k * 1.0, 1.5, I.z + 1.52); // louvres
  const fans: THREE.Group[] = [];
  for (const dx of [-1.8, 1.8]) {
    cy(g, 0.9, 0.3, t.steelDark, I.x + dx, 2.9, I.z, 20);
    const fan = new THREE.Group();
    fan.position.set(I.x + dx, 3.1, I.z);
    g.add(fan);
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = (k * Math.PI * 2) / 3;
      bx(holder, 0.25, 0.04, 0.8, t.alu, 0, 0, 0.45);
      fan.add(holder);
    }
    fans.push(fan);
  }
  const trafo = L.trafo;
  flows.push(fpipe(g, anim, [[I.x + 3.6, 0.25, I.z], [22, 0.25, I.z], [22, 0.25, trafo.z], [trafo.x - 3.4, 0.25, trafo.z]], 0.16, t.cAC, DOT.ac, 3.4, 1.4));
  board(g, t.steelDark, 'Inverter: DC to AC', I.x, I.z + 5, 5.4);

  // ---- exploded view of one module, with a lamp that really lights up while the sun is shining (the cable carries the current)
  const D = L.demo;
  const layers: [THREE.Material, string, number][] = [
    [t.glass, 'Toughened glass', 4.0],
    [t.eva, 'EVA film', 3.1],
    [t.pvDemo, 'Silicon cells', 2.2],
    [t.backsheet, 'Back sheet', 1.3],
  ];
  for (const [mat, name, y] of layers) {
    bx(g, 4, 0.1, 2.6, mat, D.x, y, D.z);
    const sg = makeSign(name, 4.6, 0.7);
    sg.position.set(D.x + 8.6, y, D.z + 1.2);
    g.add(sg);
  }
  const fy = 0.4;
  bx(g, 4.2, 0.14, 0.14, t.alu, D.x, fy, D.z - 1.4);
  bx(g, 4.2, 0.14, 0.14, t.alu, D.x, fy, D.z + 1.4);
  bx(g, 0.14, 0.14, 2.8, t.alu, D.x - 2.1, fy, D.z);
  bx(g, 0.14, 0.14, 2.8, t.alu, D.x + 2.1, fy, D.z);
  const fsg = makeSign('Aluminium frame', 4.6, 0.7);
  fsg.position.set(D.x + 8.6, fy, D.z + 1.2);
  g.add(fsg);
  cy(g, 0.05, 4.6, t.steelDark, D.x, 2.3, D.z, 8);
  for (const dx of [-1.4, 0, 1.4]) {
    flows.push(flow(anim, g, [V(D.x + dx, 9, D.z), V(D.x + dx, 4.6, D.z)], { color: DOT.light, speed: 4, spacing: 1.0, size: 0.14 }));
  }
  flows.push(fpipe(g, anim, [[D.x + 1.95, 2.2, D.z], [D.x + 3.2, 2.2, D.z], [D.x + 3.2, 1.2, D.z]], 0.06, t.cDC, DOT.electron, 2.2, 0.7));
  cy(g, 0.08, 1.0, t.steelDark, D.x + 3.2, 0.5, D.z, 8);
  mesh(g, new THREE.SphereGeometry(0.4, 14, 10), t.lampOn, D.x + 3.2, 1.6, D.z);
  board(g, t.steelDark, 'Inside a solar module', D.x, D.z + 6, 6);

  anim.add((_tt, dt) => {
    const sun = sim.solar > 0.04;
    for (const f of flows) f.visible = sun; // no current at night
    for (const fan of fans) fan.rotation.y += dt * (1 + 11 * sim.solar);
    t.lampOn.emissiveIntensity = 1.4 * sim.solar;
  });
  return { id: 'solar', nameBn: 'Solar Field & Inverter', group: g };
}
