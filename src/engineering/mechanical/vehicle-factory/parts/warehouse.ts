import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, follow, shopShell } from './ctx';
import { L } from '../layout';

/** Parts warehouse: high-bay racks with two automatic stacker cranes (mast runs along the aisle, carriage lifts a pallet), and AGVs that deliver kits to the assembly line. */
export function buildWarehouse({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'warehouse';
  const W = L.warehouse;
  shopShell(g, m, t, { x: W.x, z: W.z, w: W.w, d: W.d, h: W.h, openS: true });
  // three rack blocks along x, two aisles between them
  const racksZ = [W.z - 17, W.z - 2, W.z + 13];
  const x0 = W.x - 36;
  const len = 72;
  const pal = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.1, 1.0), t.boxCard, 3 * 36 * 4);
  const mm = new THREE.Matrix4();
  let n = 0;
  for (const rz of racksZ) {
    for (const dz of [-1.2, 1.2]) for (let i = 0; i <= 36; i++) box(g, 0.15, 11, 0.15, t.rack, x0 + i * 2, 0, rz + dz);
    for (let lvl = 0; lvl < 4; lvl++) {
      box(g, len, 0.12, 2.6, t.rack, x0 + len / 2, 1.2 + lvl * 2.6, rz);
      for (let i = 0; i < 36; i++) {
        mm.makeTranslation(x0 + 1 + i * 2, 1.2 + lvl * 2.6 + 0.12 + 0.55, rz);
        if (n < 3 * 36 * 4 && (i * 7 + lvl * 3 + rz) % 5 !== 0) pal.setMatrixAt(n++, mm);
      }
    }
  }
  pal.count = n;
  g.add(pal);
  // stacker cranes in the two aisles
  const aisles = [(racksZ[0] + racksZ[1]) / 2, (racksZ[1] + racksZ[2]) / 2];
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const cranes: { c: THREE.Group; car: THREE.Group; ph: number }[] = [];
  aisles.forEach((az, i) => {
    const c = new THREE.Group();
    c.position.set(x0 + 10, 0, az);
    env.add(c);
    box(c, 0.7, 11, 0.7, t.robot, 0, 0, 0);
    box(c, 1.4, 0.3, 1.2, t.robotDark, 0, 0, 0);
    box(c, 1.4, 0.3, 1.2, t.robotDark, 0, 11, 0);
    const car = new THREE.Group();
    c.add(car);
    box(car, 1.6, 0.2, 1.8, t.pressGrey, 0, 0, 0);
    box(car, 1.3, 1.0, 0.9, t.boxCard, 0, 0.2, 0);
    cranes.push({ c, car, ph: i * 2 });
  });
  every(anim, (tm) => cranes.forEach((k) => {
    k.c.position.x = x0 + 36 + 28 * Math.sin(tm * 0.18 + k.ph);
    k.car.position.y = 1.3 + 4.8 * (0.5 + 0.5 * Math.sin(tm * 0.5 + k.ph * 1.7));
  }));
  // AGVs: warehouse door -> corridor -> assembly north door (x = 40) and back
  const route = new Path([[W.x + 30, 0.3, W.z + W.d / 2 + 1], [W.x + 30, 0.3, -66], [40, 0.3, -66], [40, 0.3, -42], [36, 0.3, -42], [36, 0.3, -66], [W.x + 26, 0.3, -66], [W.x + 26, 0.3, W.z + W.d / 2 + 1]] as WP[], true);
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Group();
    env.add(a);
    box(a, 2.2, 0.3, 1.5, t.agv, 0, 0, 0);
    box(a, 1.4, 0.9, 1.1, t.boxCard, 0, 0.3, 0);
    follow(anim, a, route, 2.4, i * (route.len / 3));
  }
  const sign = makeSign('PARTS WAREHOUSE  -  automatic high-bay', 13, 1.5);
  sign.position.set(W.x, W.h + 3.2, W.z + W.d / 2 + 0.3);
  g.add(sign);
  return { id: 'warehouse', nameBn: 'Parts warehouse (AS/RS)', group: g };
}
