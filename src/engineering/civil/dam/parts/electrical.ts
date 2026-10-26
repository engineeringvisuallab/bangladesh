import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

const insulator = (g: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, h: number): void => {
  cyl(g, 0.22, h, mat, x, y, z, 10);
  for (let k = 0; k < 4; k++) cyl(g, 0.4, 0.1, mat, x, y + 0.3 + k * (h / 4.5), z, 10); // sheds
};

/** Two step-up transformers (11 kV -> 132 kV), the 132 kV switchyard (gantries, bus bars, breakers, isolators) and the outgoing line to the national grid. */
export function buildElectrical({ mats: m, t, anim, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'electrical';
  const TX = L.trafoX;
  const trafoZ = [20, 36];
  const phase = [-2, 0, 2];
  const bus = [26, 28, 30];
  const yx0 = L.yard.x0;
  const yx1 = L.yard.x1;
  const wire = t.steelDark;
  const lines: THREE.Vector3[][] = [];

  L.units.forEach((xu, u) => {
    const zt = trafoZ[u];
    // transformer: tank on a bund, radiators, conservator, 3 low-voltage (short) and 3 high-voltage (tall) bushings
    box(g, 12, 0.5, 9, m.concreteDark, TX, 0, zt);
    box(g, 9, 8, 6, t.paintGrey, TX, 0.6, zt);
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) box(g, 0.25, 6, 1.4, t.paintGrey, TX - 3.6 + i * 0.9, 1.2, zt + s * 3.9);
    cylH(g, 0.9, 7, t.paintWhite, TX, 10.3, zt - 1.6, 'x', 16);
    phase.forEach((p) => {
      insulator(g, t.porcelain, TX - 3.5, 8.6, zt + p, 1.4);
      insulator(g, t.porcelain, TX + 2.5, 8.6, zt + p, 3.4);
    });
    // 11 kV bus ducts from the generator terminal box (through the hall wall) to the low-voltage bushings, then 132 kV leads up to the yard bus
    phase.forEach((p, i) => {
      const lv = [V(xu + 5.5, 10.4, L.unitZ + p * 0.35), V(xu + 8, 11.6, zt + p), V(TX - 3.5, 11.6, zt + p), V(TX - 3.5, 9.9, zt + p)];
      pipe(g, lv, 0.35, t.paintGrey);
      const hv = [V(TX + 2.5, 12, zt + p), V(TX + 7, 13.5, zt + p), V(yx0 - 4, 13.5, bus[i]), V(yx0, 11.8, bus[i])];
      pipe(g, hv, 0.1, wire);
      lines.push([...lv, ...hv.slice(1)]);
    });
  });

  // switchyard: three portal gantries with insulator strings, bus bars between them, isolators and circuit breakers under the bus
  box(g, 38, 0.3, 17, m.concreteDark, (yx0 + yx1) / 2, 0, 28);
  for (const x of [yx0, 129, yx1]) {
    for (const z of [21.3, 34.7]) box(g, 0.7, 14, 0.7, m.steel, x, 0, z);
    box(g, 0.5, 0.7, 14.4, m.steel, x, 13.3, 28);
    for (const z of bus) insulator(g, t.porcelain, x, 11.3, z, 2);
  }
  for (const z of bus) {
    pipe(g, [V(yx0, 11.8, z), V(129, 11.8, z), V(yx1, 11.8, z)], 0.1, wire);
    for (const x of [118, 124, 138]) {
      box(g, 0.6, 2, 0.6, m.steel, x, 0, z);
      insulator(g, t.porcelain, x, 2, z, 3.4);
      pipe(g, [V(x, 5.4, z), V(x, 11.8, z)], 0.07, wire);
    }
    cylH(g, 0.8, 2.6, t.paintWhite, 132, 3.2, z, 'x', 16); // circuit breaker interrupter
    box(g, 0.6, 3, 0.6, m.steel, 132, 0, z);
  }

  // outgoing 132 kV line: a terminal tower on the pad edge, two more towers out in the hills (their legs follow the real ground)
  const px = [149, 171, 193];
  const base = px.map((x) => opts.groundY(x, 28) - (x > 150 ? 0.4 : 0));
  px.forEach((x, k) => {
    for (const dz of [-1.8, 1.8]) {
      const leg = box(g, 0.4, 22, 0.4, m.steel, x, base[k], 28 + dz);
      leg.rotation.x = dz < 0 ? -0.06 : 0.06;
    }
    box(g, 0.4, 0.4, 7.4, m.steel, x, base[k] + 20, 28);
    for (const z of bus) insulator(g, t.porcelain, x, base[k] + 18.4, z, 1.6);
    if (x > 150) box(g, 3, 0.3, 3, m.concreteDark, x, base[k] - 0.3, 28);
  });
  bus.forEach((z, i) => {
    const pts: THREE.Vector3[] = [V(yx1, 11.8, z), V(px[0], base[0] + 18.4, z)];
    for (let k = 0; k < px.length - 1; k++) {
      const y0 = base[k] + 18.4;
      const y1 = base[k + 1] + 18.4;
      for (let s = 1; s <= 4; s++) pts.push(V(px[k] + ((px[k + 1] - px[k]) * s) / 4, y0 + ((y1 - y0) * s) / 4 - (s < 4 ? Math.sin((s / 4) * Math.PI) * 1.8 : 0), z));
    }
    pipe(g, pts.slice(0, 2), 0.08, wire);
    pipe(g, pts.slice(1), 0.08, wire);
    // electricity "flow": bright dots, generator -> transformer -> yard -> line (both units feed the same bus)
    for (const u of [0, 1]) flow(anim, g, [...lines[u * 3 + i], V(yx0, 11.8, z), V(yx1, 11.8, z), ...pts.slice(1)], { color: 0xffe066, speed: 12, spacing: 5, size: 0.3 });
  });
  return { id: 'electrical', nameBn: 'Transformers, switchyard and transmission line', group: g };
}
