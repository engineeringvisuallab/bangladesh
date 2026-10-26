import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, cylH, pipe, V, road } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';

const insulator = (g: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, h: number): void => {
  cyl(g, 0.22, h, mat, x, y, z, 10);
  for (let k = 0; k < 4; k++) cyl(g, 0.4, 0.1, mat, x, y + 0.3 + k * (h / 4.5), z, 10); // sheds
};

/** Generator step-up transformer (11 kV -> 132 kV), 132 kV switchyard (gantries, bus bars, breakers, isolators) and the outgoing transmission line with pylons. */
export function buildElectrical({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'electrical';
  const T = L.trafo;
  const Y = L.shaft.y;
  const zs = [-32, -30, -28]; // three phases at the transformer
  const bus = [-17, -15, -13]; // three phases in the switchyard
  const wire = t.steelDark;

  // --- bus duct from the generator terminal box, out through the hall wall, to the low-voltage bushings
  const lv: THREE.Vector3[][] = zs.map((z, i) => [V(20, Y + 3.6, -30 + (i - 1) * 0.9), V(36, 13.6, z), V(36, 9.8, z), V(T.x - 3.5, 9.8, z)]);
  for (const p of lv) pipe(g, p, 0.35, t.paintGrey);

  // --- transformer: tank on a concrete bund, radiators, conservator, 3 LV + 3 HV bushings
  box(g, 12, 0.5, 9, m.concreteDark, T.x, 0, T.z);
  box(g, 9, 8, 6, t.paintGrey, T.x, 0.6, T.z);
  for (let i = 0; i < 9; i++) box(g, 0.25, 6, 1.4, t.paintGrey, T.x - 3.6 + i * 0.9, 1.2, T.z + 3.9); // radiator fins (south)
  for (let i = 0; i < 9; i++) box(g, 0.25, 6, 1.4, t.paintGrey, T.x - 3.6 + i * 0.9, 1.2, T.z - 3.9); // radiator fins (north)
  cylH(g, 0.9, 7, t.paintWhite, T.x, 10.3, T.z - 1.6, 'x', 16); // conservator tank
  zs.forEach((z) => {
    insulator(g, t.porcelain, T.x - 3.5, 8.6, z, 1.4); // LV bushing (short)
    insulator(g, t.porcelain, T.x + 2.5, 8.6, z, 3.4); // HV bushing (tall)
  });

  // --- HV conductors to the switchyard, then the yard
  const yx0 = L.yard.x0;
  const yx1 = L.yard.x1;
  const hv: THREE.Vector3[][] = zs.map((z, i) => [V(T.x + 2.5, 12, z), V(62, 13, z), V(62, 13, bus[i]), V(yx0, 13, bus[i]), V(yx0 + 4, 11, bus[i])]);
  for (const p of hv) pipe(g, p, 0.1, wire);
  // gantries (portal frames) with insulator strings, bus bars between them
  const gx = [yx0, 105, yx1];
  for (const x of gx) {
    for (const z of [-22, -8]) box(g, 0.7, 14, 0.7, m.steel, x, 0, z);
    box(g, 0.5, 0.7, 15.4, m.steel, x, 13.3, -15);
    for (const z of bus) insulator(g, t.porcelain, x, 11.3, z, 2);
  }
  for (const z of bus) pipe(g, [V(yx0, 11, z), V(105, 11, z), V(yx1, 11, z)], 0.1, wire);
  // bay equipment under the bus: isolators, circuit breakers (white tanks), current transformers
  for (const z of bus) {
    for (const x of [86, 100, 118]) {
      box(g, 0.6, 2, 0.6, m.steel, x, 0, z);
      insulator(g, t.porcelain, x, 2, z, 3.4);
      pipe(g, [V(x, 5.4, z), V(x, 11, z)], 0.07, wire);
    }
    cylH(g, 0.8, 2.6, t.paintWhite, 93, 3.2, z, 'x', 16); // circuit breaker interrupter
    box(g, 0.6, 3, 0.6, m.steel, 93, 0, z);
    insulator(g, t.porcelain, 93, 4.4, z, 1.8);
  }
  box(g, 40, 0.3, 14, m.concreteDark, 100, 0, -15);
  // outgoing line east: sag between the gantry and pylons
  const px = [150, 164, 178];
  const tower = (x: number): void => {
    for (const dz of [-1.8, 1.8]) {
      const leg = box(g, 0.4, 20, 0.4, m.steel, x, 0, -15 + dz);
      leg.rotation.x = dz < 0 ? -0.06 : 0.06;
    }
    box(g, 0.4, 0.4, 7, m.steel, x, 19, -15);
    for (const z of bus) insulator(g, t.porcelain, x, 17.4, z, 1.6);
  };
  px.forEach(tower);
  const out: THREE.Vector3[][] = bus.map((z) => {
    const pts: THREE.Vector3[] = [V(yx1, 11, z), V(yx1 + 6, 11, z)];
    let prev = yx1 + 6;
    for (const x of px) {
      for (let k = 1; k <= 4; k++) {
        const xx = prev + ((x - prev) * k) / 4;
        const sag = k < 4 ? Math.sin((k / 4) * Math.PI) * 1.6 : 0;
        pts.push(V(xx, 17.4 - sag, z));
      }
      prev = x;
    }
    return pts;
  });
  for (const p of out) pipe(g, p, 0.08, wire);
  // electricity "flow": bright dots along every phase (generator -> transformer -> yard -> line)
  zs.forEach((_z, i) => {
    flow(anim, g, [...lv[i], ...hv[i].slice(0), ...out[i].slice(1)], { color: 0xffe066, speed: 12, spacing: 4.5, size: 0.3 });
  });
  // maintenance road to the transformer
  road(g, m.asphalt, 0, -8, T.x - 6, -8, 6);
  return { id: 'electrical', nameBn: 'Transformer & Switchyard', group: g };
}
