import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { box } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { animRobot, makeRobot, makeWorker, shopShell } from './ctx';
import { LINE_Z, ROW, SHOP } from '../layout';

const Z = LINE_Z;

/** Body shop: the skid conveyor, an underbody station, the framing gate with welding robots (sparks), closure robots that carry doors and hood, and a laser measuring arch. */
export function buildBody({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'body';
  const S = SHOP.body;
  shopShell(g, m, t, { x: (S.x0 + S.x1) / 2, z: (ROW.z0 + ROW.z1) / 2, w: S.x1 - S.x0, d: ROW.d, h: S.h, lineZ: Z, openS: true });
  box(g, 58, 0.4, 2.4, t.pressGrey, -80, 0, Z); // skid conveyor under the bodies
  // stations: x, kind
  const stations: [number, string][] = [[-100, 'underbody'], [-88, 'framing'], [-76, 'closures'], [-64, 'finish']];
  let n = 0;
  for (const [x, kind] of stations) {
    // jig table under the body
    box(g, 4.8, 0.3, 2.4, t.robotDark, x, 0.4, Z);
    const count = kind === 'framing' ? 3 : 2;
    for (let k = 0; k < count; k++) {
      const rx = x + (k - (count - 1) / 2) * 3.2;
      const rn = makeRobot(g, t, rx, Z - 4.2, Math.PI / 2);
      animRobot(anim, rn, n++ * 1.3, 1, 1, true);
      const rs = makeRobot(g, t, rx, Z + 4.2, -Math.PI / 2);
      animRobot(anim, rs, n++ * 1.3 + 0.6, 1, 1, true);
    }
    box(g, 1.2, 1.6, 1, t.pressGrey, x + 3.2, 0, Z + 7); // control cabinet
  }
  // framing gate: a big portal that clamps the body shell
  for (const dz of [-3, 3]) box(g, 0.7, 6.5, 0.7, t.pressBlue, -88, 0, Z + dz);
  box(g, 0.8, 0.9, 7.4, t.pressBlue, -88, 6.4, Z);
  // closure robots hold a door and the hood on their tool
  const doorHold = box(g, 1.3, 0.1, 0.9, t.carSilver, -76, 3.2, Z - 2.6);
  const hoodHold = box(g, 1.7, 0.1, 1.5, t.carSilver, -76, 3.4, Z + 2.6);
  every(anim, (tm) => {
    doorHold.position.y = 2.5 + 1.2 * (0.5 + 0.5 * Math.sin(tm * 0.9));
    hoodHold.position.y = 2.7 + 1.2 * (0.5 + 0.5 * Math.sin(tm * 0.9 + 1.4));
  });
  // laser measuring arch with a sweeping light bar
  for (const dz of [-2.8, 2.8]) box(g, 0.4, 3.6, 0.4, t.robotDark, -60, 0, Z + dz);
  box(g, 0.5, 0.5, 6, t.robotDark, -60, 3.5, Z);
  const bar = box(g, 0.1, 0.1, 5.2, t.lampR, -60, 3.2, Z);
  every(anim, (tm) => (bar.position.x = -60 + 0.9 * Math.sin(tm * 2.2)));
  const sign = makeSign('BODY IN WHITE  -  about 4,000 spot welds', 14, 1.5);
  sign.position.set(-82, 10.6, Z + 6);
  g.add(sign);
  makeWorker(g, t, anim, -94, Z + 8, Math.PI, 0.3);
  makeWorker(g, t, anim, -70, Z + 8, Math.PI, 1.9);
  return { id: 'body', nameBn: 'Body shop (welding robots)', group: g };
}
