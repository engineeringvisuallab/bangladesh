import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { extrudeProfile, solidBox } from './ctx';
import { L } from '../layout';

/** Visitor model: a 0.3-scale slice of the gravity dam with the three forces drawn as pulsing arrows (water thrust, weight, uplift). */
export function buildModel({ mats: m, t, anim, solids }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'model';
  const M = L.model;
  const s = 0.3;
  const grp = new THREE.Group();
  grp.position.set(M.x, 0, M.z);
  g.add(grp);
  // foundation rock (translucent, so the uplift arrows can be seen), dam slice, reservoir water
  box(grp, 6, 3, 22, t.soilGlass, 0, 0, -5);
  const slice = extrudeProfile([[-26 * s, 0], [-26 * s, 44 * s], [-16 * s, 44 * s], [14 * s, 0]], -2, 2, m.concrete);
  slice.position.y = 3;
  grp.add(slice);
  box(grp, 4, 36 * s, 8, t.modelWater, 0, 3, -26 * s - 4);
  solids.push(solidBox(M.x - 2, M.x + 2, 3, 3 + 44 * s, M.z - 26 * s, M.z + 14 * s));

  const arrow = (mat: THREE.Material, len: number, rot: THREE.Euler, x: number, y: number, z: number): THREE.Group => {
    const a = new THREE.Group();
    a.position.set(x, y, z);
    a.rotation.copy(rot);
    // built pointing +y: shaft then a cone head; the group is then turned
    cyl(a, 0.25, len, mat, 0, 0, 0, 8);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 12), mat);
    head.position.set(0, len + 0.7, 0);
    a.add(head);
    grp.add(a);
    return a;
  };
  // water thrust (red), horizontal, pushing the dam downstream: acts one third up from the base
  const thrust = arrow(t.arrowRed, 3.4, new THREE.Euler(Math.PI / 2, 0, 0), 0, 3 + (44 * s) / 3, -26 * s - 4.8);
  // weight (green), straight down through the dam body
  const weight = arrow(t.arrowGreen, 2.4, new THREE.Euler(Math.PI, 0, 0), 0, 3 + 44 * s + 3.9, -26 * s + 1.6);
  // uplift (orange), water pressure under the base pushing up (smaller towards the toe)
  const uplift = [-5, -1.2, 2.4].map((z, i) => arrow(t.arrowOrange, 1.8 - i * 0.45, new THREE.Euler(0, 0, 0), 0, 3 - (3.2 - i * 0.45), z));
  every(anim, (tm) => {
    const k = 1 + 0.1 * Math.sin(tm * 2.4);
    thrust.scale.set(1, k, 1);
    weight.scale.set(1, 1 + 0.1 * Math.sin(tm * 2.4 + 2), 1);
    uplift.forEach((u, i) => u.scale.set(1, 1 + 0.12 * Math.sin(tm * 2.4 + 4 + i), 1));
  });
  // sign board on two posts
  const sign = makeSign('FORCES ON A GRAVITY DAM', 9, 1.5);
  sign.position.set(0, 2.4, 8);
  grp.add(sign);
  for (const x of [-4.2, 4.2]) box(grp, 0.3, 2.4, 0.3, m.steel, x, 0, 8);
  box(grp, 12, 0.1, 6, m.concreteDark, 0, 0, 8.5);
  return { id: 'model', nameBn: 'Forces on a gravity dam (model)', group: g };
}
