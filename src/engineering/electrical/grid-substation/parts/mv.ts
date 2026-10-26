import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, cyl, pipe, V } from '../../../core/prims';
import { every, flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { breaker, ct, isolator, pole, portal } from './equip';

const P = 2; // 33 kV phase pitch
const K = 0.62; // 33 kV equipment is smaller than 132 kV

/**
 * 33 kV side: bus bars, 6 feeder bays (isolator, breaker, CT), portal gantry, overhead feeders on poles leaving the site,
 * capacitor bank, and the PROTECTION DEMO: every ~26 s lightning hits feeder 3, its breaker trips (feeder goes dark, lamp red),
 * the other feeders keep running, then the breaker re-closes.
 */
export function buildMv({ mats: m, g: gm, anim, opts, fault, feederLamps }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'mv';
  const B = L.mvBus;
  // 33 kV bus bars
  B.z.forEach((z) => pipe(g, [V(B.x0, B.y, z), V(B.x1, B.y, z)], 0.1, gm.conductor));
  for (const x of [B.x0 + 2, 60, B.x1 - 2]) for (const z of B.z) box(g, 0.35, B.y - 0.5, 0.35, gm.tower, x, 0, z - 1.5);

  const feederFlows: THREE.InstancedMesh[][] = L.feederX.map(() => []);
  const strike: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  L.feederX.forEach((fx, idx) => {
    isolator(g, m, gm, fx, 32, P, K);
    breaker(g, m, gm, fx, 37, P, K, feederLamps[idx]);
    ct(g, m, gm, fx, 42, P, K);
    const top = portal(g, m, gm, fx, L.gantryZ, P, 8.5);
    const p1 = pole(g, gm, fx, 70, 11);
    const yOut = Math.min(0, opts.groundY(fx, 94));
    const p2 = pole(g, gm, fx, 94, 11, yOut);
    [-P, 0, P].forEach((dx, i) => {
      // bus -> down -> along the bay -> gantry
      pipe(g, [V(fx + dx, B.y, B.z[i]), V(fx + dx, 6.4, B.z[i] + 1), V(fx + dx, 6.4, L.gantryZ - 1), top[i]], 0.07, gm.conductor);
      // overhead line: gantry -> pole 1 -> pole 2 -> out of the site (3 spans with a little sag)
      const pts: THREE.Vector3[] = [top[i]];
      const nodes = [p1[i], p2[i], V(fx + dx, p2[i].y - 0.4, 122)];
      let prev = top[i];
      for (const n of nodes) {
        for (let k = 1; k <= 4; k++) pts.push(prev.clone().lerp(n, k / 4).add(V(0, -Math.sin((k / 4) * Math.PI) * 0.9, 0)));
        prev = n;
      }
      pipe(g, pts, 0.06, gm.conductor);
      const path = [V(fx + dx, B.y, B.z[i]), V(fx + dx, 6.4, B.z[i] + 1), V(fx + dx, 6.4, L.gantryZ - 1), ...pts];
      feederFlows[idx].push(flow(anim, g, path, { color: 0xff9f1c, speed: 8, spacing: 4.5, size: 0.24 }));
      if (idx === L.faultFeeder && i === 1) {
        const mid = pts[Math.floor(pts.length * 0.55)];
        strike.x = mid.x;
        strike.y = mid.y;
        strike.z = mid.z;
      }
    });
  });

  // --- capacitor bank (power-factor correction): 3 racks of cans + series reactors, fed from the west end of the 33 kV bus
  const C = L.capBank;
  for (let r = 0; r < 3; r++) {
    const rx = C.x - 9 + r * 9;
    box(g, 7.4, 0.3, 4.2, gm.paintGrey, rx, 0, C.z);
    for (const px of [-3.4, 3.4]) for (const pz of [-1.9, 1.9]) box(g, 0.25, 4.4, 0.25, gm.tower, rx + px, 0, C.z + pz);
    for (const lv of [0, 1]) {
      box(g, 7.2, 0.18, 4.0, gm.tower, rx, 0.3 + lv * 2.0, C.z);
      for (let cx = 0; cx < 4; cx++) for (let cz = 0; cz < 2; cz++) {
        cyl(g, 0.42, 1.3, gm.canBody, rx - 2.7 + cx * 1.8, 0.5 + lv * 2.0, C.z - 1.0 + cz * 2.0, 14);
        cyl(g, 0.12, 0.28, gm.porcelain, rx - 2.7 + cx * 1.8, 1.8 + lv * 2.0, C.z - 1.0 + cz * 2.0, 8);
      }
    }
  }
  cyl(g, 1.0, 2.2, gm.reactor, C.x + 7, 0, C.z, 20); // series reactor
  const capFeed = [V(B.x0, B.y, B.z[1]), V(C.x + 7, B.y, B.z[1]), V(C.x + 7, 5, B.z[1]), V(C.x + 7, 5, C.z - 2), V(C.x - 9, 5, C.z - 2)];
  pipe(g, capFeed, 0.09, gm.conductor);
  flow(anim, g, [V(B.x0 + 20, B.y, B.z[1]), ...capFeed], { color: 0xff9f1c, speed: 6, spacing: 4, size: 0.24 });

  // --- protection demo: lightning, trip, re-close
  const bolt = new THREE.Line(new THREE.BufferGeometry(), gm.bolt);
  bolt.name = 'fx';
  bolt.frustumCulled = false;
  bolt.visible = false;
  g.add(bolt);
  const arc = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), gm.arc);
  arc.name = 'fx';
  arc.visible = false;
  g.add(arc);
  anim.disposables.push(bolt.geometry);
  const CYCLE = 26;
  const green = 0x38e07a;
  const red = 0xff3b30;
  const lamp = feederLamps[L.faultFeeder];
  const boltPts = new Float32Array(10 * 3);
  bolt.geometry.setAttribute('position', new THREE.BufferAttribute(boltPts, 3));
  const faultFlows = feederFlows[L.faultFeeder];
  every(anim, (t) => {
    const c = t % CYCLE;
    const flash = c >= 12 && c < 12.35;
    bolt.visible = flash && Math.floor(c * 30) % 2 === 0;
    arc.visible = c >= 12.1 && c < 16.5; // the arc stays until the breaker has cut the current
    if (flash) {
      const jitter = Math.floor(c * 30);
      for (let k = 0; k < 10; k++) {
        const f = k / 9;
        const j = k === 9 ? 0 : Math.sin(jitter * 7.1 + k * 3.3) * 2.2;
        boltPts[k * 3] = strike.x + 9 * (1 - f) + j;
        boltPts[k * 3 + 1] = strike.y + 38 * (1 - f);
        boltPts[k * 3 + 2] = strike.z + j * 0.5;
      }
      (bolt.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    if (arc.visible) {
      arc.position.set(strike.x, strike.y, strike.z);
      arc.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 41)));
    }
    const tripped = c >= 12.3 && c < 18;
    fault.phase = tripped ? 1 : c >= 18 && c < 22 ? 2 : 0;
    lamp.color.setHex(tripped ? red : green);
    for (const f of faultFlows) f.visible = !tripped;
  });
  return { id: 'mv', nameBn: '33 kV Bus, Feeders & Capacitor Bank', group: g };
}
