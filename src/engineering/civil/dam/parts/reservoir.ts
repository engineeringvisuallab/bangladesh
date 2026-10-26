import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, sphere, V } from '../../../core/prims';
import { every, flow, plume } from '../../../core/anim';
import type { Ctx } from './ctx';
import { rnd } from './ctx';
import { H } from '../layout';

/** Reservoir: rock-walled storage lake (36 m deep at full level), a river inflow (waterfall) from the hills, a floating trash boom. */
export function buildReservoir({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'reservoir';
  const zBack = -96;
  const zFace = -26;
  // water body: a box under the rock banks (only the top shows between them). Transparent + big = also a collider (nobody walks into the lake).
  box(g, 216, H.frl, zFace - zBack, t.reservoir, 0, 0, (zBack + zFace) / 2);
  // rock banks: jagged blocks, the lake widens towards the back
  const hw = (z: number): number => 80 + 0.35 * (zFace - z);
  let i = 0;
  for (let z0 = zBack; z0 < zFace; z0 += 7) {
    const zc = z0 + 3.5;
    for (const side of [-1, 1]) {
      const inner = hw(zc) + (rnd(i++) * 4 - 2);
      const w = 150 - inner;
      const h = 46 + rnd(i++) * 7;
      box(g, w, h, 7.2, rnd(i++) > 0.5 ? t.rock : t.rockDark, side * (inner + w / 2), 0, zc);
      if (rnd(i++) > 0.45) box(g, w * 0.5, 5, 7.2, t.rockLight, side * (inner + w * 0.75), h, zc); // an upper terrace
    }
  }
  // back wall (the hill the river comes from)
  for (let x = -150; x < 150; x += 15) {
    const h = 48 + rnd(i++) * 9;
    box(g, 15.2, h, 10, rnd(i++) > 0.5 ? t.rock : t.rockDark, x + 7.5, 0, zBack - 4.5);
  }
  // inflow: a waterfall sheet down the back wall into the lake, with mist and travelling dots
  const wx = 36;
  box(g, 6, 18, 0.4, t.spill, wx, H.frl - 1, zBack + 0.25);
  flow(anim, g, [V(wx, 54, zBack + 0.7), V(wx, H.frl + 0.4, zBack + 0.7)], { color: 0xffffff, speed: 10, spacing: 2.2, size: 0.28 });
  plume(anim, g, wx, H.frl + 0.5, zBack + 3, { count: 12, rise: 6, life: 2.6, size0: 3, size1: 8, windX: 2, windZ: 3, spread: 4, opacity: 0.5, color: 0xffffff });
  // slow current on the surface: from the waterfall towards the intake towers
  flow(anim, g, [V(wx, H.frl + 0.2, zBack + 4), V(55, H.frl + 0.2, -64), V(66, H.frl + 0.2, -36)], { color: 0xd8f1ff, speed: 3, spacing: 5, size: 0.35 });
  flow(anim, g, [V(-60, H.frl + 0.2, -80), V(-30, H.frl + 0.2, -55), V(0, H.frl + 0.2, -34)], { color: 0xd8f1ff, speed: 2.4, spacing: 6, size: 0.3 });
  // trash boom: a chain of floats in front of the intake towers
  const floats: THREE.Mesh[] = [];
  for (let k = 0; k <= 18; k++) {
    const f = sphere(g, 0.55, t.buoy, 46 + k * 2.1, H.frl + 0.2, -44 + Math.sin((k / 18) * Math.PI) * -3);
    floats.push(f);
  }
  every(anim, (tm) => floats.forEach((f, k) => (f.position.y = H.frl + 0.15 + 0.12 * Math.sin(tm * 1.3 + k * 0.7))));
  every(anim, (tm) => {
    t.reservoir.opacity = 0.87 + 0.03 * Math.sin(tm * 0.8);
  });
  void m;
  return { id: 'reservoir', nameBn: 'Reservoir and river inflow', group: g };
}
