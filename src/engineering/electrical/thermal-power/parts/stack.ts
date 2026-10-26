import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, V } from '../../../core/prims';
import { flow, plume, spin } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

/** Flue-gas path: duct from the boiler, induced-draft fan (spinning), tall striped stack with a thin plume. */
export function buildStack({ mats: m, t, anim, solids }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'stack';
  const S = L.stack;
  const B = L.boiler;
  // stack: tapered concrete flue with red / white aviation bands on the top 30 m
  const bands: [number, THREE.Material][] = [[0, m.concrete], [40, t.paintRed], [50, t.paintWhite], [61, t.paintRed]];
  const top = S.h;
  const rAt = (y: number): number => S.r0 + (S.r1 - S.r0) * (y / top);
  bands.forEach(([ya, mat], i) => {
    const yb = i + 1 < bands.length ? bands[i + 1][0] : top;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rAt(yb), rAt(ya), yb - ya, 28), mat);
    c.position.set(S.x, (ya + yb) / 2, S.z);
    g.add(c);
  });
  cyl(g, S.r0 + 1.2, 1.2, m.concreteDark, S.x, 0, S.z, 28);
  void solids;
  // flue duct boiler -> fan -> stack
  const yd = 12;
  const xb = B.x - B.w / 2 - 0.3;
  const xs = S.x + S.r0 - 0.2;
  const duct = [V(xb, yd, S.z), V(xs, yd, S.z)];
  pipe(g, duct, 1.5, m.pipe.flue);
  flow(anim, g, [V(xb + 0.5, yd, S.z), V(xs - 1.5, yd, S.z), V(S.x, yd, S.z), V(S.x, 40, S.z)], { color: 0xdddddd, speed: 6, spacing: 3.2, size: 0.3 });
  // induced-draft fan: scroll casing + a spinning impeller you can see on its face
  const fx = (xb + xs) / 2;
  cylH(g, 2.7, 2.4, m.casing, fx, yd, S.z, 'z', 24);
  box(g, 3.2, 2.4, 3.2, m.motor, fx - 4.5, yd - 1.2, S.z); // fan motor
  const imp = new THREE.Group();
  imp.position.set(fx, yd, S.z + 1.25);
  for (let k = 0; k < 8; k++) {
    const blade = box(imp, 0.35, 2.2, 0.12, m.steel, 0, 0, 0);
    blade.position.y = 1.1;
    const hold = new THREE.Group();
    hold.rotation.z = (k / 8) * Math.PI * 2;
    hold.add(blade);
    imp.add(hold);
  }
  g.add(imp);
  spin(anim, imp, 'z', -9);
  // thin warm plume (gas is a clean fuel: mostly steam and CO2, almost invisible)
  plume(anim, g, S.x, top + 1, S.z, { count: 18, rise: 28, life: 6, size0: 3, size1: 9, windX: 14, windZ: 3, spread: 3, opacity: 0.22, color: 0xe2e6ea });
  // aviation warning lights
  box(g, 0.6, 0.6, 0.6, t.lampR, S.x, top, S.z + S.r1);
  box(g, 0.6, 0.6, 0.6, t.lampR, S.x, 50, S.z + rAt(50));
  return { id: 'stack', nameBn: 'Chimney & Flue Gas Fan', group: g };
}
