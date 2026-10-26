import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, building } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx, WP } from './ctx';
import { Path, follow, makeCar, shopShell } from './ctx';
import { L } from '../layout';

/** Crash laboratory (a car is pulled into a barrier at 56 km/h, crumples, airbag flashes) and the outdoor test track with a skid pad. */
export function buildTesting({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'testing';
  const C = L.crash;
  shopShell(g, m, t, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, openS: true });
  box(g, 64, 0.1, 1.2, t.robotDark, C.x - 4, 0.2, C.z); // sled rail
  // barrier: concrete block with a deformable aluminium face; high-speed flood lamps
  box(g, 6, 3.6, 9, m.concrete, -24, 0, C.z);
  box(g, 0.8, 1.4, 4, t.cellGold, -27.4, 0.3, C.z);
  const lamps = [box(g, 0.6, 0.6, 0.6, t.lightF, -40, 6.5, C.z - 6), box(g, 0.6, 0.6, 0.6, t.lightF, -40, 6.5, C.z + 6)];
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const car = makeCar(t, t.carWhite);
  car.stage('semi');
  env.add(car);
  const dummy = box(car, 0.35, 0.5, 0.3, t.dummy, 0, 0.7, 0.4);
  box(car, 0.35, 0.5, 0.3, t.dummy, 0, 0.7, -0.4);
  void dummy;
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), t.target);
  bag.position.set(0.5, 0.8, 0.4);
  bag.visible = false;
  car.add(bag);
  const X0 = -84;
  const XH = -31.2;
  every(anim, (tm) => {
    const p = tm % 17;
    let x = X0;
    let crumple = 1;
    if (p >= 5 && p < 8.4) x = X0 + (XH - X0) * ((p - 5) / 3.4);
    else if (p >= 8.4 && p < 12) {
      x = XH + 0.3;
      crumple = 0.86;
    } else if (p >= 12 && p < 16.5) {
      x = XH + 0.3 + (X0 - XH - 0.3) * ((p - 12) / 4.5);
      crumple = 0.86 + 0.14 * ((p - 12) / 4.5);
    }
    car.position.set(x, 0.35, C.z);
    car.scale.x = crumple;
    bag.visible = p >= 8.4 && p < 10;
    lamps.forEach((l) => (l.visible = p >= 4.5 && p < 11));
  });
  const s = makeSign('CRASH LAB  -  56 km/h frontal impact', 13, 1.4);
  s.position.set(C.x, C.h + 3, C.z + C.d / 2 + 0.3);
  g.add(s);

  // ---- test track: asphalt loop, centre line, two test cars, skid pad with a circling car, control tower
  const pts = L.track;
  const asphalt = m.asphalt;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(-(bz - az), bx - ax);
    const mid = new THREE.Group();
    mid.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    mid.rotation.y = ang;
    g.add(mid);
    box(mid, len + 9, 0.08, 10, asphalt, 0, 0, 0);
    for (let k = -Math.floor(len / 12); k <= Math.floor(len / 12); k++) box(mid, 5, 0.02, 0.25, m.white, k * 10, 0.09, 0);
  }
  const loop = new Path(pts.map(([x, z]) => [x, 0.05, z] as WP), true);
  [[t.carBlue, 14, 0], [t.carRed, 11, loop.len / 2]].forEach(([mat, v, off]) => {
    const c = makeCar(t, mat as THREE.Material);
    c.stage('full');
    env.add(c);
    follow(anim, c, loop, v as number, off as number);
  });
  const cx = 106;
  const cz = 96;
  cyl(g, 19, 0.08, asphalt, cx, 0, cz, 40);
  cyl(g, 10, 0.1, t.carGreen, cx, 0, cz, 32);
  const ring: WP[] = [];
  for (let k = 0; k < 20; k++) ring.push([cx + Math.cos((k / 20) * Math.PI * 2) * 14.5, 0.1, cz - Math.sin((k / 20) * Math.PI * 2) * 14.5]);
  const sk = makeCar(t, t.carWhite);
  sk.stage('full');
  env.add(sk);
  follow(anim, sk, new Path(ring, true), 8);
  building(g, m, { x: 106, z: 66, w: 16, d: 7, h: 6, door: 'S' });
  const ts = makeSign('TEST TRACK  -  handling, braking, durability', 14, 1.4);
  ts.position.set(106, 10, 66);
  g.add(ts);
  return { id: 'testing', nameBn: 'Crash laboratory and test track', group: g };
}
