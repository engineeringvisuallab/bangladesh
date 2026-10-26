import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cylH, railing, tank, V } from '../../../core/prims';
import { every, flow, plume } from '../../../core/anim';
import type { Ctx } from './ctx';
import { slopeBox } from './ctx';
import { H, L } from '../layout';

/** Spillway: five radial gates on the ogee crest, the chute, training walls, the stilling basin (energy dissipation) with baffle blocks. */
export function buildSpillway({ mats: m, t, anim, site }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'spillway';
  // piers (carry the gates, the hoists and the road deck) and the road deck on top
  for (const x of L.piers) box(g, 2, 15.4, 17, m.concrete, x, H.sill, -17.5);
  box(g, 86, 0.6, 7, m.concrete, 0, 43.4, -20.5);
  railing(g, m.steel, -43, -24, 43, -24, H.crest);
  railing(g, m.steel, -43, -17, 43, -17, H.crest);

  // radial gates: skin plate (arc of a circle around the trunnion pin) + two arms. Turning the gate about the pin lifts its lower edge.
  const R = 12.5;
  const a0 = (-36.9 * Math.PI) / 180;
  const a1 = (11.5 * Math.PI) / 180;
  const N = 6;
  const gates: THREE.Group[] = [];
  L.bays.forEach((xc) => {
    const gate = new THREE.Group();
    gate.position.set(xc, 35.5, -12);
    g.add(gate);
    const pt = (a: number): [number, number] => [-R * Math.cos(a), R * Math.sin(a)]; // (dz, dy) from the pin
    for (let k = 0; k < N; k++) {
      const [z0, y0] = pt(a0 + ((a1 - a0) * k) / N);
      const [z1, y1] = pt(a0 + ((a1 - a0) * (k + 1)) / N);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.5, Math.hypot(z1 - z0, y1 - y0) + 0.05), t.gateOrange);
      seg.rotation.x = Math.atan2(-(y1 - y0), z1 - z0);
      seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
      gate.add(seg);
    }
    for (const dx of [-5.5, 5.5]) {
      for (const a of [a0 + (a1 - a0) * 0.2, a1]) {
        const [pz, py] = pt(a);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, R), t.steelDark);
        arm.rotation.x = Math.atan2(-py, pz);
        arm.position.set(dx, py / 2, pz / 2);
        gate.add(arm);
      }
    }
    cylH(gate, 0.6, 14, t.steelDark, 0, 0, 0, 'x', 10); // trunnion pin
    box(g, 4, 3, 3, t.paintGrey, xc, H.crest, -19); // hoist house on the deck
    gates.push(gate);
  });
  // gates 2-4 are open a little (flood release), 1 and 5 closed; the openings breathe slowly
  every(anim, (tm) => {
    [1, 2, 3].forEach((b, i) => (gates[b].rotation.x = 0.1 + 0.05 * Math.sin(tm * 0.25 + i * 1.7)));
  });

  // chute: training walls on every pier line, water sheet and travelling dots under the three open gates
  for (const x of L.piers) slopeBox(g, m.concrete, 2, 4, -12, 25, 14, 4, x, 0);
  const open = [L.bays[1], L.bays[2], L.bays[3]];
  for (const xc of open) {
    slopeBox(g, t.spill, 13.6, 0.35, -23, 28.2, -12, 25.2, xc, 0.05);
    slopeBox(g, t.spill, 13.6, 0.35, -12, 25, 14, 4, xc, 0.05);
    slopeBox(g, t.spill, 13.6, 0.35, 14, 4, 19, 1.7, xc, 0.05);
    flow(anim, g, [V(xc, 28.9, -23), V(xc, 26, -12), V(xc, 4.8, 14), V(xc, 2.2, 19), V(xc, 1.1, 23), V(xc, 1.1, 49)], { color: 0xffffff, speed: 9, spacing: 2.6, size: 0.36 });
    plume(anim, g, xc, 1.8, 22, { count: 10, rise: 5, life: 2.2, size0: 3, size1: 9, windX: 0, windZ: 4, spread: 5, opacity: 0.55, color: 0xffffff });
  }

  // stilling basin: a sunken concrete pool where the fast water loses its energy in a hydraulic jump (chute blocks, baffle blocks, end sill)
  const S = L.stilling;
  tank(g, site, m, { x: (S.x0 + S.x1) / 2, z: (S.z0 + S.z1) / 2, w: S.x1 - S.x0, d: S.z1 - S.z0, depth: S.depth, top: 2.2, water: t.river, level: 1.2 });
  for (let x = S.x0 + 6; x < S.x1 - 2; x += 10) box(g, 1.8, 3.4, 1.8, m.concrete, x, -S.depth, 27.5);
  box(g, S.x1 - S.x0 - 2, 2.6, 1.2, m.concreteDark, 0, -S.depth, S.z1 - 3);
  return { id: 'spillway', nameBn: 'Spillway gates, chute and stilling basin', group: g };
}
