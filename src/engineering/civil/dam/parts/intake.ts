import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, building, pipe, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { H, L } from '../layout';

/** Intake towers on the upstream face (trash rack, emergency gate slot, level rings) and the two steel penstocks down the downstream face to the turbines. */
export function buildIntake({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'intake';
  for (const xu of L.units) {
    // open-fronted tower: side walls, floor, roof slab; the trash rack closes the front
    for (const s of [-1, 1]) box(g, 0.8, 38, 8, m.concrete, xu + s * 4.1, 8, -30);
    box(g, 9, 2, 8, m.concrete, xu, 8, -30);
    box(g, 9, 2, 8, m.concrete, xu, 44, -30);
    const top = new THREE.Group();
    top.position.set(xu, 46, -30);
    g.add(top);
    building(top, m, { x: 0, z: 0, w: 8.6, d: 7, h: 4, door: 'E' });
    for (let k = 0; k < 17; k++) box(g, 0.14, 24, 0.14, m.steel, xu - 4 + k * 0.5, 12, -34.2);
    for (const y of [14, 22, 30, 35]) box(g, 8.4, 0.3, 0.3, m.steel, xu, y, -34.2);
    box(g, 5, 6, 0.4, t.dark, xu, 36.6, -34.3); // emergency gate slot (stop gate, lowered to shut the water off)
    // bell mouth: the wide, smooth entrance of the penstock (wide end faces the lake)
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.6, 4.2, 20), t.steelDark);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(xu, H.intake, -30);
    g.add(bell);
    // level rings: blue = minimum draw-down, green = full reservoir, red = maximum flood
    box(g, 9.4, 0.35, 8.4, t.lvlBlue, xu, H.mddl - 0.17, -30);
    box(g, 9.4, 0.35, 8.4, t.lvlGreen, xu, H.frl - 0.17, -30);
    box(g, 9.4, 0.35, 8.4, t.lvlRed, xu, H.mwl - 0.17, -30);
    // penstock: through the dam at 20 m (hidden in the concrete), out of the downstream face, down the slope, into the turbine
    const pts = [V(xu, H.intake, -30), V(xu, H.intake, 2.2), V(xu, 3.1, 13.7), V(xu, 3.1, 23.8)];
    pipe(g, pts, 2.5, m.pipe.penstock);
    flow(anim, g, pts, { color: 0x9fd0ff, speed: 8, spacing: 3.2, size: 0.55 });
    // access walkway beside the pipe and a shut-off (butterfly) valve house at the toe
    box(g, 1.6, 2.2, 1.6, t.gateOrange, xu - 3.4, 0, 14.6);
  }
  return { id: 'intake', nameBn: 'Intake towers and penstocks', group: g };
}
