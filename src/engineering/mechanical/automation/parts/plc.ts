import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { CAP } from '../sim';
import { bx } from './helpers';

/**
 * PLC & control room. The PLC cabinet, the ladder-logic screen and the SCADA mimic all show the SAME signals the line uses,
 * so students can follow "sensor -> PLC logic -> output -> machine" in real time.
 */
export function buildPlc({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'plc';
  const P = L.plc;
  building(g, m, { x: P.x, z: P.z, w: P.w, d: P.d, h: P.h, open: 'S', door: 'N' });
  const wz = P.z - P.d / 2 + 1.0;
  const mk = (c: number): THREE.MeshBasicMaterial => {
    const mm = new THREE.MeshBasicMaterial({ color: c });
    anim.disposables.push(mm);
    return mm;
  };
  const sign = (text: string, w: number, x: number, y: number, z: number, h = 0.55): void => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    g.add(s);
  };
  const OFF = 0x2a3036;

  // ---------- ladder logic screen
  const lx = P.x - 14;
  bx(g, 13, 8.6, 0.3, t.screenBg, lx, 1.6, wz);
  sign('PLC PROGRAM (LADDER LOGIC)', 11, lx, 10.5, wz + 0.2, 0.8);
  const railL = lx - 5.8;
  const railR = lx + 5.8;
  bx(g, 0.12, 7.0, 0.1, mk(0xb7bec6), railL, 2.2, wz + 0.2);
  bx(g, 0.12, 7.0, 0.1, mk(0xb7bec6), railR, 2.2, wz + 0.2);
  type Rung = { y: number; contacts: { label: string; get: () => boolean }[]; coil: string; coilLabel: string; get: () => boolean };
  const rungs: Rung[] = [
    { y: 8.0, contacts: [{ label: 'S3 BOX AT PICK', get: () => sim.s3 }, { label: 'NOT ROBOT BUSY', get: () => !sim.robotBusy }], coil: 'ROBOT START', coilLabel: '', get: () => sim.s3 && !sim.robotBusy },
    { y: 6.2, contacts: [{ label: 'S2 TALL BOX', get: () => sim.s2 || sim.pusher > 0.02 }], coil: 'PUSHER', coilLabel: '', get: () => sim.s2 || sim.pusher > 0.02 },
    { y: 4.4, contacts: [{ label: 'NOT E-STOP', get: () => true }], coil: 'CONVEYOR MOTOR', coilLabel: '', get: () => sim.motor },
    { y: 2.6, contacts: [{ label: 'PALLET FULL', get: () => (sim.station?.count ?? 0) >= CAP }, { label: 'NOT AGV BUSY', get: () => !sim.agvBusy }], coil: 'AGV GO', coilLabel: '', get: () => (sim.station?.count ?? 0) >= CAP && !sim.agvBusy },
  ];
  const wires: { mat: THREE.MeshBasicMaterial; rung: Rung }[] = [];
  const contactMats: { mat: THREE.MeshBasicMaterial; get: () => boolean }[] = [];
  for (const r of rungs) {
    const wire = mk(OFF);
    wires.push({ mat: wire, rung: r });
    bx(g, 11.6, 0.1, 0.08, wire, lx, r.y, wz + 0.22);
    r.contacts.forEach((c, i) => {
      const cxp = lx - 3.6 + i * 3.7;
      const cm = mk(OFF);
      contactMats.push({ mat: cm, get: c.get });
      bx(g, 0.14, 0.8, 0.12, cm, cxp - 0.3, r.y - 0.4, wz + 0.25);
      bx(g, 0.14, 0.8, 0.12, cm, cxp + 0.3, r.y - 0.4, wz + 0.25);
      sign(c.label, 3.3, cxp, r.y + 0.6, wz + 0.25, 0.45);
    });
    const coil = mk(OFF);
    contactMats.push({ mat: coil, get: r.get });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 20), coil);
    ring.position.set(lx + 4.0, r.y, wz + 0.25);
    g.add(ring);
    anim.disposables.push(ring.geometry);
    sign(r.coil, 3.4, lx + 4.0, r.y + 0.9, wz + 0.25, 0.45);
  }

  // ---------- PLC cabinet: power, CPU, input module, output module with LEDs
  const cabX = P.x - 3;
  const cabZ = P.z - 4;
  bx(g, 7.2, 6.6, 1.6, t.cabinetDark, cabX, 0, cabZ);
  const faceZ = cabZ + 0.85;
  const mods = ['POWER', 'CPU', 'INPUTS (DI)', 'OUTPUTS (DO)'];
  mods.forEach((nm, k) => {
    bx(g, 6.4, 1.2, 0.1, t.cabinet, cabX, 0.4 + k * 1.5, faceZ);
    sign(nm, 3.0, cabX - 1.8, 0.6 + k * 1.5 + 0.6, faceZ + 0.1, 0.4);
  });
  const scanLamps = [0, 1, 2].map(() => mk(OFF));
  ['READ INPUTS', 'RUN PROGRAM', 'WRITE OUTPUTS'].forEach((nm, k) => {
    bx(g, 0.4, 0.4, 0.1, scanLamps[k], cabX + 1.6 + k * 0.8 - 0.8, 1.9, faceZ + 0.08);
    void nm;
  });
  sign('SCAN CYCLE: READ -> RUN -> WRITE', 6.4, cabX, 5.9, faceZ + 0.1, 0.5);
  const diDefs: [string, () => boolean][] = [['S1', () => sim.s1], ['S2', () => sim.s2], ['S3', () => sim.s3], ['RBT', () => sim.robotBusy], ['AGV', () => sim.agvBusy], ['FULL', () => (sim.station?.count ?? 0) >= CAP]];
  const doDefs: [string, () => boolean][] = [['MTR', () => sim.motor], ['PSH', () => sim.pusher > 0.02], ['RBT', () => sim.robotBusy], ['AGV', () => sim.agvBusy]];
  const leds: { mat: THREE.MeshBasicMaterial; get: () => boolean; on: number }[] = [];
  diDefs.forEach(([nm, get], i) => {
    const mat = mk(OFF);
    bx(g, 0.28, 0.28, 0.08, mat, cabX - 2.8 + i * 0.95, 3.45, faceZ + 0.08);
    sign(nm, 0.9, cabX - 2.8 + i * 0.95, 3.95 - 0.1, faceZ + 0.12, 0.28);
    leds.push({ mat, get, on: 0x38e07a });
  });
  doDefs.forEach(([nm, get], i) => {
    const mat = mk(OFF);
    bx(g, 0.28, 0.28, 0.08, mat, cabX - 2.8 + i * 0.95, 4.95, faceZ + 0.08);
    sign(nm, 0.9, cabX - 2.8 + i * 0.95, 5.45 - 0.1, faceZ + 0.12, 0.28);
    leds.push({ mat, get, on: 0xffb703 });
  });

  // ---------- SCADA / HMI mimic of the whole line
  const mx = P.x + 8.5;
  const mw = 14;
  bx(g, mw, 8.6, 0.3, t.screenBg, mx, 1.6, wz);
  sign('SCADA / HMI: LIVE VIEW OF THE LINE', 12, mx, 10.5, wz + 0.2, 0.8);
  const X = (x: number): number => mx - mw / 2 + 0.8 + ((x + 128) / 200) * (mw - 1.6);
  const Y = (z: number): number => 8.6 - ((z - 2) / 56) * 6.6;
  const zf = wz + 0.2;
  bx(g, X(-20) - X(-124), 0.35, 0.08, mk(0x56606a), (X(-124) + X(-20)) / 2, Y(45) - 0.17, zf); // belt
  bx(g, 0.9, 0.9, 0.08, mk(0x3a4650), X(-30), Y(29) - 0.45, zf); // pallet station
  bx(g, 0.5, 0.5, 0.08, mk(0xe8731a), X(-30), Y(37) - 0.25, zf); // robot
  bx(g, 1.2, 0.9, 0.08, mk(0x3a4650), X(62), Y(46) - 0.45, zf); // rack
  bx(g, X(62) - X(-30), 0.06, 0.06, mk(0xffd23f), (X(-30) + X(62)) / 2, Y(3.5), zf); // AGV lane
  const dots: THREE.Mesh[] = [];
  const dotShort = mk(0x38e07a);
  const dotTall = mk(0xe8731a);
  for (let i = 0; i < 18; i++) dots.push(bx(g, 0.28, 0.28, 0.1, dotShort, 0, 0, zf + 0.05));
  const agvDot = bx(g, 0.7, 0.35, 0.1, mk(0x4c8dff), 0, 0, zf + 0.06);
  const sensLamps = [['S1', -104], ['S2', -84], ['S3', -30]].map(([nm, x]) => {
    const mat = mk(OFF);
    bx(g, 0.28, 0.28, 0.1, mat, X(x as number), Y(41), zf + 0.05);
    sign(nm as string, 0.8, X(x as number), Y(41) + 0.55, zf + 0.1, 0.3);
    return mat;
  });
  sign('GREEN DOT = GOOD BOX   ORANGE DOT = TALL BOX   BLUE = AGV', 12, mx, Y(55), zf + 0.1, 0.4);

  // ---------- operator desks
  for (let i = 0; i < 3; i++) {
    const x = P.x - 6 + i * 8;
    bx(g, 4, 0.9, 1.5, m.concreteDark, x, 0, P.z + 6);
    bx(g, 1.2, 0.8, 0.1, t.screenBg, x - 0.8, 1.0, P.z + 5.6);
    bx(g, 1.2, 0.8, 0.1, t.screenBg, x + 0.8, 1.0, P.z + 5.6);
    bx(g, 0.7, 0.9, 0.7, t.steelDark, x, 0, P.z + 7.4);
  }

  every(anim, (tm) => {
    for (const w of wires) w.mat.color.setHex(w.rung.get() ? 0x38e07a : OFF);
    for (const c of contactMats) c.mat.color.setHex(c.get() ? 0x38e07a : OFF);
    for (const l of leds) l.mat.color.setHex(l.get() ? l.on : OFF);
    const ph = Math.floor((tm * 2.5) % 3);
    scanLamps.forEach((l, k) => l.color.setHex(k === ph ? 0xffd23f : OFF));
    // mimic
    let k = 0;
    for (const it of sim.items) {
      if (it.state === 'placed' || it.state === 'gone') continue;
      if (k >= dots.length) break;
      const d = dots[k++];
      d.visible = true;
      d.material = it.kind === 'tall' ? dotTall : dotShort;
      d.position.set(X(it.x), Y(it.z) - 0.2, zf + 0.05);
    }
    for (; k < dots.length; k++) dots[k].visible = false;
    agvDot.position.set(X(sim.agv.x), Y(sim.agv.z) - 0.2, zf + 0.06);
    sensLamps[0].color.setHex(sim.s1 ? 0xff3b30 : 0x38e07a);
    sensLamps[1].color.setHex(sim.s2 ? 0xff3b30 : 0x38e07a);
    sensLamps[2].color.setHex(sim.s3 ? 0xff3b30 : 0x38e07a);
  });
  return { id: 'plc', nameBn: 'PLC & Control Room (Ladder Logic, SCADA)', group: g };
}
