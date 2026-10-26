import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, pipe, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cx, cy } from './helpers';

/** Step-up transformer (cooling fins, bushings, oil conservator), the switchyard gantry with breaker and lightning arrester, and the three-phase line to the pylon. The dots flow out when the park exports and back in when it imports. */
export function buildGrid({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'grid';
  const T = L.trafo;
  const G = L.gantry;
  const Y = L.pylon;

  // ---- transformer
  box(g, 9, 0.3, 7, m.concreteDark, T.x, 0, T.z);
  bx(g, 6, 3.4, 4, t.transformer, T.x, 2.0, T.z);
  for (let k = 0; k < 8; k++) bx(g, 0.12, 2.6, 3.4, t.transformer, T.x + 3.3 + k * 0.28, 1.9, T.z); // cooling fins
  cx(g, 0.7, 4.6, t.transformer, T.x, 4.5, T.z - 1.2, 18); // oil conservator
  const b = [-1.6, 0, 1.6];
  for (const dz of b) {
    cy(g, 0.22, 1.7, t.ceramic, T.x + 1.5, 4.55, T.z + dz, 12); // high-voltage bushings
    cy(g, 0.32, 0.18, t.steelDark, T.x + 1.5, 5.5, T.z + dz, 12);
    cy(g, 0.14, 1.0, t.ceramic, T.x - 2.2, 3.5, T.z + dz, 10); // low-voltage side
  }
  board(g, t.steelDark, 'Step-up Transformer', T.x, T.z + 5.2, 6);

  // ---- switchyard gantry, circuit breaker, lightning arrester
  for (const dz of [-6, 6]) bx(g, 0.6, 11, 0.6, t.steel, G.x, 5.5, T.z + dz);
  bx(g, 0.4, 0.5, 13, t.steel, G.x, 10.8, T.z);
  const pz = [-3.5, 0, 3.5];
  for (const dz of pz) cy(g, 0.15, 1.2, t.ceramic, G.x, 10.0, T.z + dz, 10);
  bx(g, 1.6, 2.6, 1.2, t.paintGrey, 40, 1.3, T.z - 8); // circuit breaker: opens the line in a fault
  for (const dz of pz) cy(g, 0.22, 1.6, t.ceramic, 40, 3.4, T.z - 8 + dz * 0.25, 10);
  cy(g, 0.2, 3.0, t.ceramic, G.x - 3, 1.5, T.z + 7.2, 10); // lightning arrester
  bx(g, 1.2, 0.1, 0.1, t.steelDark, 40, 4.5, T.z - 8);
  board(g, t.steelDark, 'Circuit Breaker & Lightning Arrester', 44, T.z + 11, 8.4);

  // ---- pylon (tapering steel mast with two cross-arms and hanging insulators)
  pylon(g, t, Y.x, Y.z);
  const exports: THREE.InstancedMesh[] = [];
  const imports: THREE.InstancedMesh[] = [];
  const endX = 156;
  b.forEach((bz, i) => {
    const z = T.z + pz[i];
    const pts: [number, number, number][] = [
      [T.x + 1.5, 5.6, T.z + bz],
      [T.x + 1.5, 8.4, T.z + bz],
      [G.x, 9.4, z],
      [(G.x + Y.x) / 2, 10.2, z],
      [Y.x, 12.6, z],
      [endX, 13.0, z],
    ];
    const v = pts.map((p) => V(p[0], p[1], p[2]));
    pipe(g, v, 0.1, t.cHV);
    exports.push(flow(anim, g, v, { color: DOT.hv, speed: 5, spacing: 2.4, size: 0.2 }));
    imports.push(flow(anim, g, [...v].reverse(), { color: DOT.discharge, speed: 5, spacing: 2.4, size: 0.2 }));
  });
  anim.add(() => {
    for (const e of exports) e.visible = sim.grid > 0.03;
    for (const e of imports) e.visible = sim.grid < -0.03;
  });
  board(g, t.steelDark, 'To the national grid', Y.x - 8, Y.z + 7, 6.4);
  return { id: 'grid', nameBn: 'Transformer & Grid Connection', group: g };
}

/** pylon geometry */
function pylon(g: THREE.Group, t: Ctx['t'], x: number, z: number): void {
  cy(g, 0.3, 16, t.steel, x, 8, z, 10);
  cyl(g, 0.9, 1.0, t.steel, x, 0, z, 10);
  bx(g, 0.3, 0.3, 9, t.steel, x, 13.6, z);
  bx(g, 0.3, 0.3, 7, t.steel, x, 11.0, z);
  for (const dz of [-3.5, 0, 3.5]) cy(g, 0.12, 1.0, t.ceramic, x, 13.0, z + dz, 8);
}
