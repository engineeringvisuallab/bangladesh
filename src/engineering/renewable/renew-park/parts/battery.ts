import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import type { Ctx } from './ctx';
import { DOT } from './ctx';
import { L } from '../layout';
import { board, bx, cx, fpipe } from './helpers';

/** Battery storage: six containers (one with a glass side so the battery racks can be seen), cooling units with fans, status lights, and the power-conversion cabinet. Charges at noon, discharges in the evening. */
export function buildBattery({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'battery';
  const B = L.battery;
  const P = L.pcs;
  const lights: { mesh: THREE.Mesh; k: number }[] = [];
  const modules: { mesh: THREE.Mesh; k: number }[] = [];
  const fans: THREE.Group[] = [];

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      const x = B.x0 + j * B.dx;
      const z = B.z0 + i * B.dz;
      box(g, 12.6, 0.3, 3.2, m.concreteDark, x, 0, z); // slab
      const cut = i === 0 && j === 0;
      if (!cut) {
        bx(g, 12, 2.9, 2.6, t.white, x, 1.75, z);
      } else {
        bx(g, 12, 0.2, 2.6, t.white, x, 0.4, z); // floor
        bx(g, 12.2, 0.2, 2.8, t.white, x, 3.3, z); // roof
        bx(g, 12, 2.9, 0.2, t.white, x, 1.75, z - 1.2); // back wall
        bx(g, 0.2, 2.9, 2.6, t.white, x - 5.9, 1.75, z); // end walls
        bx(g, 0.2, 2.9, 2.6, t.white, x + 5.9, 1.75, z);
        bx(g, 11.8, 2.8, 0.1, t.glass, x, 1.75, z + 1.25); // glass front
        for (let r = 0; r < 3; r++) {
          const rx = x - 3.6 + r * 3.6;
          bx(g, 1.8, 2.4, 1.0, t.steelDark, rx, 1.65, z - 0.2); // rack frame
          for (let k = 0; k < 6; k++) modules.push({ mesh: bx(g, 1.5, 0.3, 0.9, t.modOff, rx, 0.7 + k * 0.38, z - 0.15), k });
        }
      }
      // status lights on the south side: as many green as the charge level
      for (let k = 0; k < 6; k++) lights.push({ mesh: bx(g, 0.3, 0.3, 0.05, t.ledOff, x - 3 + k * 1.2, 3.1, z + 1.35), k });
      // cooling unit on the west end with a fan
      bx(g, 1.1, 1.6, 2.0, t.paintGrey, x - 6.6, 1.2, z);
      cx(g, 0.75, 0.1, t.steelDark, x - 7.2, 1.4, z, 18);
      const fan = new THREE.Group();
      fan.position.set(x - 7.3, 1.4, z);
      g.add(fan);
      for (let k = 0; k < 4; k++) {
        const holder = new THREE.Group();
        holder.rotation.x = (k * Math.PI) / 2;
        bx(holder, 0.04, 0.08, 0.7, t.alu, 0, 0, 0.38);
        fan.add(holder);
      }
      fans.push(fan);
    }
  }

  // power conversion cabinet (AC <-> DC) and the cable along the aisle; the dots show charging (green) or discharging (orange)
  bx(g, 4, 2.4, 2.4, t.paintBlue, P.x, 1.2, P.z);
  bx(g, 4.2, 0.2, 2.6, t.steelDark, P.x, 2.5, P.z);
  const endX = B.x0 + 2 * B.dx + 6;
  const aisle: [number, number, number][] = [[P.x + 2.2, 0.25, P.z], [endX, 0.25, P.z]];
  const charge = fpipe(g, anim, aisle, 0.14, t.cBatt, DOT.charge, 3.0, 1.3);
  const discharge = flow(anim, g, [V(endX, 0.25, P.z), V(P.x + 2.2, 0.25, P.z)], { color: DOT.discharge, speed: 3.0, spacing: 1.3, size: 0.14 });
  const T = L.trafo;
  const down = fpipe(g, anim, [[T.x, 0.25, T.z + 2.2], [T.x, 0.25, P.z], [P.x - 2.2, 0.25, P.z]], 0.14, t.cAC, DOT.ac, 3.0, 1.3);
  const up = flow(anim, g, [V(P.x - 2.2, 0.25, P.z), V(T.x, 0.25, P.z), V(T.x, 0.25, T.z + 2.2)], { color: DOT.discharge, speed: 3.0, spacing: 1.3, size: 0.14 });
  board(g, t.steelDark, 'Battery Storage (lithium-ion)', B.x0 + B.dx, B.z0 + B.dz + 6.5, 8.4);

  anim.add((_tt, dt) => {
    const charging = sim.batt > 0.03;
    const discharging = sim.batt < -0.03;
    charge.visible = charging;
    down.visible = charging;
    discharge.visible = discharging;
    up.visible = discharging;
    for (const l of lights) l.mesh.material = sim.soc > (l.k + 0.5) / 6 ? (sim.soc < 0.2 ? t.ledAmber : t.ledGreen) : t.ledOff;
    for (const mo of modules) mo.mesh.material = sim.soc > (mo.k + 0.5) / 6 ? t.modOn : t.modOff;
    for (const f of fans) f.rotation.x += dt * (0.6 + 12 * Math.abs(sim.batt)); // the more power moves, the more heat to remove
  });
  return { id: 'battery', nameBn: 'Battery Storage', group: g };
}
