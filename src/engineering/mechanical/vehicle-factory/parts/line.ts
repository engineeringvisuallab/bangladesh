import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { every } from '../../../core/anim';
import type { Ctx, CarKind, WP } from './ctx';
import { Path, makeCar } from './ctx';
import { LINE_Z } from '../layout';

const Z = LINE_Z;
/** Skid height of the car origin on the conveyor, and the hoist heights in the dip tanks. */
const Y = 0.55;
const HI = 3.5;
const DIP = 1.6;
/** the route every car takes: body shop -> paint shop (lifted into two dip tanks) -> assembly -> end of line -> out of the east door */
export const LINE_PATH = new Path([
  [-108, Y, Z], [-47, Y, Z], [-46, HI, Z], [-41, HI, Z], [-40, DIP, Z], [-38, DIP, Z], [-37, HI, Z], [-34, HI, Z], [-33, HI, Z], [-32, DIP, Z], [-27, DIP, Z], [-26, HI, Z], [-24, HI, Z], [-23, Y, Z],
  [185, Y, Z],
] as WP[]);

const STAGES: [number, CarKind][] = [[-1e9, 'biw'], [2, 'painted'], [44, 'semi'], [86, 'full']];

/** The cars that travel along the whole line. A car is a bare body in the body shop, painted from the base-coat booth, gets glass at the cockpit/glass station and wheels at the wheel station. */
export function buildLine({ t, anim, line }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'line';
  // moving things are not obstacles: the collider collector skips groups named 'environment'
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  const paints = [t.carBlue, t.carRed, t.carWhite, t.carSilver, t.carGreen];
  const spacing = 18;
  const n = Math.floor(LINE_PATH.len / spacing);
  const o = { x: 0, y: 0, z: 0, yaw: 0 };
  for (let i = 0; i < n; i++) {
    const car = makeCar(t, paints[i % paints.length]);
    env.add(car);
    line.cars.push(car);
  }
  const speed = 1.1;
  every(anim, (tm) => {
    line.cars.forEach((car, i) => {
      LINE_PATH.at(i * spacing + tm * speed, o);
      car.position.set(o.x, o.y, o.z);
      car.rotation.y = 0;
      let k: CarKind = 'biw';
      for (const [x, kind] of STAGES) if (o.x >= x) k = kind;
      (car as THREE.Group & { stage: (k: CarKind) => void }).stage(k);
    });
  });
  return { id: 'line', nameBn: 'Vehicles on the line', group: g };
}
