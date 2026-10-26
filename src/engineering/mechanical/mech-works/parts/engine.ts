import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, V } from '../../../core/prims';
import { flow, every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bar, bx, cx, cy, cz, mesh, span } from './helpers';

// slider-crank geometry (metres, model scale)
const R = 0.7; // crank radius
const LR = 2.5; // connecting rod length
const CY = 2.2; // crank axis height above the stand
const HEAD_Y = CY + R + LR + 0.55; // underside of the cylinder head
const CROWN = 0.35; // piston crown above the wrist pin
const W = 0.9; // cam lobe half-width (rad, cam angle)
const LIFT = 0.22;
const OMEGA = Math.PI; // crank speed: half a turn per second (a 4-stroke cycle takes 4 s): slowed down so each stroke can be followed

const bump = (a: number): number => {
  const x = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(x) < W ? Math.cos((Math.PI * x) / (2 * W)) ** 2 : 0;
};
const COLORS = { intake: 0x7fd0ff, comp: 0xffe066, burn: 0xff6a2b, ash: 0xb08a6a, exhaust: 0x9a9a9a };

/** Test cell with a see-through single-cylinder 4-stroke petrol engine: piston, connecting rod, crank, two cams and valves really move; the gas colour shows the stroke. */
export function buildEngine({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'engine';
  const E = L.engine;
  building(g, m, { x: E.x, z: E.z, w: E.w, d: E.d, h: E.h, open: 'S', door: 'N' });
  const eng = new THREE.Group();
  eng.position.set(E.x - 6, 1.2, E.z + 7);
  g.add(eng);
  const gasMat = t.gas.clone();
  anim.disposables.push(gasMat);

  // test bed, frame, backdrop plate (makes the moving parts easy to see)
  bx(g, 44, 1.2, 9, m.concreteDark, E.x, 0.6, E.z + 1);
  bx(eng, 6.4, 0.3, 2.2, t.cast, 0, -0.15, -2);
  bx(eng, 6.4, 11, 0.2, t.plate, 0, 5.2, -1.05);
  for (const px of [-2.3, 2.3]) for (const pz of [-0.8, 0.8]) bx(eng, 0.3, HEAD_Y - 1.2, 0.3, t.steelDark, px, (HEAD_Y - 1.2) / 2 + 0.2, pz);
  bx(eng, 5.2, 0.8, 1.9, t.cast, 0, HEAD_Y + 0.4, 0); // cylinder head
  bx(eng, 2.4, 1.0, 1.9, t.cast, 0, CY - 0.8, 0); // crankcase bottom
  // liner (glass), gas volume
  const linerBottom = CY + LR - R - CROWN;
  mesh(eng, new THREE.CylinderGeometry(0.88, 0.88, HEAD_Y - linerBottom, 28, 1, true), t.glass, 0, (HEAD_Y + linerBottom) / 2, 0);
  const gas = mesh(eng, new THREE.CylinderGeometry(0.8, 0.8, 1, 24), gasMat, 0, 0, 0);
  // crank (webs, pin, counterweight, journal)
  const crank = new THREE.Group();
  crank.position.y = CY;
  eng.add(crank);
  bx(crank, 0.5, R + 0.6, 0.35, t.steelDark, 0, (R - 0.25) / 2, 0.3);
  bx(crank, 0.5, R + 0.6, 0.35, t.steelDark, 0, (R - 0.25) / 2, -0.3);
  cz(crank, 0.22, 1.0, t.steel, 0, R, 0, 16);
  mesh(crank, new THREE.CylinderGeometry(0.62, 0.62, 0.35, 20, 1, false), t.cast, 0, -0.85, 0.3).rotation.x = Math.PI / 2;
  mesh(crank, new THREE.CylinderGeometry(0.62, 0.62, 0.35, 20, 1, false), t.cast, 0, -0.85, -0.3).rotation.x = Math.PI / 2;
  cz(eng, 0.3, 2.2, t.steel, 0, CY, -0.2, 18);
  bx(crank, 0.16, 0.16, 0.2, m.red, 0, R + 0.3, 0.52); // marker: makes the turning visible
  // piston + rod
  const piston = new THREE.Group();
  eng.add(piston);
  cy(piston, 0.82, 0.8, t.paintGrey, 0, CROWN - 0.4, 0, 28);
  for (const ry of [0.1, -0.05, -0.2]) cy(piston, 0.84, 0.05, t.steelDark, 0, CROWN + ry - 0.05, 0, 28);
  cz(piston, 0.15, 1.5, t.steel, 0, 0, 0, 12);
  const rod = bar(eng, 0.22, 0.3, t.steel);
  // valves + springs + DOHC cams
  const camY = HEAD_Y + 0.8 + 1.5 + 0.35 + 0.02;
  const stemTop = camY - 0.35;
  const valves: { stem: THREE.Group; spring: THREE.Mesh; lobe: number; cam: THREE.Mesh; x: number }[] = [];
  const profile = new THREE.Shape();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = 0.35 + LIFT * bump(a);
    if (i === 0) profile.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else profile.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const camGeo = new THREE.ExtrudeGeometry(profile, { depth: 0.4, bevelEnabled: false });
  camGeo.translate(0, 0, -0.2);
  anim.disposables.push(camGeo);
  ([[-0.5, Math.PI / 4], [0.5, 0.75 * Math.PI]] as const).forEach(([vx, lobe]) => {
    const stem = new THREE.Group();
    stem.position.set(vx, 0, 0);
    cy(stem, 0.06, stemTop - (HEAD_Y + 0.8), t.steel, 0, (stemTop + HEAD_Y + 0.8) / 2, 0, 8);
    cy(stem, 0.34, 0.07, t.steel, 0, HEAD_Y - 0.04, 0, 20); // valve head, inside the chamber
    cy(stem, 0.16, 0.12, t.brass, 0, stemTop - 0.06, 0, 12); // cap
    eng.add(stem);
    const spring = cy(eng, 0.2, 1, t.copper, vx, 0, 0, 10);
    spring.scale.y = 1;
    const cam = new THREE.Mesh(camGeo, vx < 0 ? t.gearB : t.gearA);
    cam.position.set(vx, camY, 0);
    eng.add(cam);
    cz(eng, 0.08, 1.6, t.steel, vx, camY, 0, 10);
    valves.push({ stem, spring, lobe, cam, x: vx });
  });
  bx(eng, 2.6, 0.12, 1.8, t.steelDark, 0, camY + 0.55, 0); // cam cover plate
  // spark plug + flash
  cy(eng, 0.12, 1.1, t.brass, 0, HEAD_Y + 1.35, 0, 10);
  cy(eng, 0.2, 0.5, m.white, 0, HEAD_Y + 1.7, 0, 10);
  const flash = mesh(eng, new THREE.SphereGeometry(0.45, 12, 8), t.flash, 0, HEAD_Y - 0.25, 0);
  flash.name = 'fx';
  flash.visible = false;
  // intake (left) and exhaust (right) ports with moving gas
  const inPath = [V(-4.6, HEAD_Y + 0.4, 0), V(-1.6, HEAD_Y + 0.4, 0), V(-0.5, HEAD_Y + 0.4, 0), V(-0.5, HEAD_Y - 0.1, 0)];
  const exPath = [V(0.5, HEAD_Y - 0.1, 0), V(0.5, HEAD_Y + 0.4, 0), V(1.8, HEAD_Y + 0.4, 0), V(4.8, HEAD_Y + 0.4, 0)];
  pipe(eng, inPath.slice(0, 3), 0.28, t.pipeCold);
  pipe(eng, exPath.slice(1), 0.28, t.steelDark);
  const inFlow = flow(anim, eng, inPath, { color: 0xbfe8ff, speed: 2.4, spacing: 0.8, size: 0.1 });
  const exFlow = flow(anim, eng, exPath, { color: 0xbdbdbd, speed: 2.4, spacing: 0.8, size: 0.1 });
  // flywheel + dynamometer (load) on the same shaft, behind the engine
  const wheel = new THREE.Group();
  wheel.position.set(0, CY, -2.2);
  eng.add(wheel);
  cz(wheel, 1.7, 0.35, t.cast, 0, 0, 0, 40);
  cz(wheel, 1.25, 0.4, t.steelDark, 0, 0, 0, 30);
  for (let k = 0; k < 6; k++) {
    const sp = bx(wheel, 0.25, 1.2, 0.2, t.cast, 0, 0, 0.0);
    sp.position.y = 0;
    const holder = new THREE.Group();
    holder.rotation.z = (k / 6) * Math.PI;
    holder.add(sp);
    wheel.add(holder);
  }
  bx(wheel, 0.22, 0.45, 0.4, m.red, 0, 1.45, 0);
  const dyno = new THREE.Group();
  dyno.position.set(0, CY, -5.3);
  eng.add(dyno);
  cz(dyno, 1.5, 2.2, t.paintBlue, 0, 0, 0, 36);
  cz(eng, 0.25, 3, t.steel, 0, CY, -3.6, 12);
  bx(dyno, 0.25, 0.6, 0.5, m.yellow, 0, 1.2, 1.2);
  bx(eng, 0.3, 3.2, 0.3, t.steelDark, 1.9, CY - 0.5, -5.3); // torque arm to the load cell
  bx(eng, 0.9, 0.6, 0.6, m.yellow, 1.9, 0.4, -5.3);
  // stroke board on the back wall: 4 panels, the active stroke lights up
  const names = ['INTAKE (air & fuel enter)', 'COMPRESSION (pressure & heat rise)', 'POWER (burning, work is done)', 'EXHAUST (burnt gas leaves)'];
  const hues = [COLORS.intake, COLORS.comp, COLORS.burn, COLORS.exhaust];
  const panels = hues.map((h, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: h });
    anim.disposables.push(mat);
    bx(g, 8.8, 2.4, 0.15, mat, E.x - 17 + i * 9.4 + 7, 10.2, E.z - 17.4);
    const s = makeSign(names[i], 8.2, 1.4);
    s.position.set(E.x - 17 + i * 9.4 + 7, 10.2, E.z - 17.26);
    g.add(s);
    return mat;
  });

  const dim = new THREE.Color();
  const tmpC = new THREE.Color();
  const colorOf = (hex: number): THREE.Color => tmpC.setHex(hex);
  every(anim, (tm) => {
    const th = OMEGA * tm; // crank angle, grows without limit
    const th2 = th % (Math.PI * 2);
    const ph = th % (Math.PI * 4); // position in the 4-stroke cycle: 0..pi intake, pi..2pi compression, 2pi..3pi power, 3pi..4pi exhaust
    crank.rotation.z = -th2;
    wheel.rotation.z = -th2;
    dyno.rotation.z = -th2;
    const yp = R * Math.cos(th2) + Math.sqrt(LR * LR - R * R * Math.sin(th2) ** 2);
    piston.position.y = CY + yp;
    const px = R * Math.sin(th2);
    const py = CY + R * Math.cos(th2);
    span(rod, px, py, 0, CY + yp);
    rod.scale.y = LR;
    // gas volume between crown and head
    const crown = CY + yp + CROWN;
    const h = Math.max(0.05, HEAD_Y - crown);
    gas.scale.y = h;
    gas.position.y = HEAD_Y - h / 2;
    // stroke state
    const stroke = Math.floor(ph / Math.PI);
    const f = (ph % Math.PI) / Math.PI;
    if (stroke === 0) gasMat.color.copy(colorOf(COLORS.intake));
    else if (stroke === 1) gasMat.color.copy(colorOf(COLORS.intake)).lerp(dim.setHex(COLORS.comp), f);
    else if (stroke === 2) gasMat.color.copy(colorOf(COLORS.burn)).lerp(dim.setHex(COLORS.ash), f);
    else gasMat.color.copy(colorOf(COLORS.exhaust));
    gasMat.opacity = 0.35 + 0.35 * (stroke === 2 ? 1 - f * 0.5 : 1);
    flash.visible = ph >= 2 * Math.PI && ph < 2 * Math.PI + 0.55;
    if (flash.visible) flash.scale.setScalar(1 - (ph - 2 * Math.PI) / 0.7);
    inFlow.visible = stroke === 0;
    exFlow.visible = stroke === 3;
    // cams at half crank speed, valves pushed down by the lobes
    const c = th / 2;
    valves.forEach((v) => {
      v.cam.rotation.z = v.lobe + c;
      const lift = LIFT * bump(Math.PI / 2 - (v.lobe + c));
      v.stem.position.y = -lift;
      const top = stemTop - lift;
      v.spring.scale.y = Math.max(0.3, top - (HEAD_Y + 0.8));
      v.spring.position.y = (top + HEAD_Y + 0.8) / 2;
    });
    panels.forEach((mat, i) => mat.color.setHex(hues[i]).multiplyScalar(i === stroke ? 1 : 0.22));
  });
  void cx;
  return { id: 'engine', nameBn: 'Engine Test Cell (4-Stroke Engine)', group: g };
}
