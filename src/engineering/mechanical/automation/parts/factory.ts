import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, road } from '../../../core/prims';
import { every, spin } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { solveIK } from '../sim';
import { sevenSeg } from './sevenseg';
import { bx, cx, cy, cz, mesh } from './helpers';

/**
 * Automated Production Hall + Warehouse: a real working line, driven by the shared simulation.
 * Boxes arrive on a conveyor, a photo-eye counts them, a height beam spots TALL boxes and a pneumatic pusher rejects them,
 * a 2-link robot arm (inverse kinematics) picks the good ones and stacks them on a pallet, an AGV carries full pallets to the rack.
 */
export function buildFactory({ mats: m, t, anim, sim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'factory';
  const H = L.hall;
  const W = L.warehouse;
  const l = L.line;
  building(g, m, { x: H.x, z: H.z, w: H.w, d: H.d, h: H.h, open: 'N', door: 'S' });
  building(g, m, { x: W.x, z: W.z, w: W.w, d: W.d, h: W.h, open: 'N', door: 'S' });
  const lampMat = (c: number): THREE.MeshBasicMaterial => {
    const mm = new THREE.MeshBasicMaterial({ color: c });
    anim.disposables.push(mm);
    return mm;
  };

  // ---------- conveyor
  const bx0 = l.xSpawn - 3; // (the simulation itself is stepped once per frame by the plant, before any part is drawn)
  const bx1 = l.xEnd + 2;
  const blen = bx1 - bx0;
  bx(g, blen, 0.5, 3.0, t.frame, (bx0 + bx1) / 2, 0.75, l.beltZ);
  bx(g, blen, 0.12, 2.6, t.beltTop, (bx0 + bx1) / 2, 1.0 - 0.06, l.beltZ);
  for (const dz of [-1.5, 1.5]) bx(g, blen, 0.3, 0.12, t.steel, (bx0 + bx1) / 2, 1.15, l.beltZ + dz); // side guides
  for (let x = bx0 + 2; x < bx1; x += 7) for (const dz of [-1.2, 1.2]) bx(g, 0.25, 0.5, 0.25, t.frame, x, 0.25, l.beltZ + dz);
  // moving cross-marks on the belt (they run at the belt speed: the belt really moves)
  const marks: THREE.Mesh[] = [];
  const spacing = 1.8;
  const nMarks = Math.floor(blen / spacing);
  for (let i = 0; i < nMarks; i++) marks.push(bx(g, 0.12, 0.02, 2.4, t.beltMark, bx0 + i * spacing, 0.95, l.beltZ));
  const rollers = [bx0, bx1].map((x) => cz(g, 0.35, 3.0, t.steelDark, x, 0.75, l.beltZ, 16));
  void rollers;
  const motor = bx(g, 1.2, 0.9, 0.9, t.agvBody, bx0 - 1.4, 0.45, l.beltZ);
  void motor;
  // hopper (boxes are dropped here)
  const hop = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.1, 2.6, 4, 1, true), t.glass);
  hop.position.set(l.xSpawn - 1.5, 3.6, l.beltZ);
  hop.rotation.y = Math.PI / 4;
  g.add(hop);
  for (const dx of [-1.6, 1.6]) for (const dz of [-1.6, 1.6]) bx(g, 0.2, 3.3, 0.2, t.frame, l.xSpawn - 1.5 + dx, 0, l.beltZ + dz);

  // ---------- S1: through-beam photo-eye (counts boxes)
  const s1Lamp = lampMat(0x38e07a);
  {
    const x = l.xS1;
    for (const dz of [-2.2, 2.2]) bx(g, 0.35, 1.4, 0.35, t.frame, x, 0, l.beltZ + dz);
    bx(g, 0.28, 0.28, 0.28, t.cabinetDark, x, 1.5, l.beltZ - 2.2);
    bx(g, 0.28, 0.28, 0.28, t.cabinetDark, x, 1.5, l.beltZ + 2.2);
    bx(g, 0.16, 0.16, 0.06, s1Lamp, x, 1.95, l.beltZ + 2.2);
  }
  const beam1 = bx(g, 0.05, 0.05, 4.2, t.beamRed, l.xS1, 1.64, l.beltZ);
  // ---------- S2: height beam (only a TALL box interrupts it)
  const s2Lamp = lampMat(0x38e07a);
  const beam2 = bx(g, 0.05, 0.05, 4.4, t.beamRed, l.xS2, 3.5, l.beltZ);
  {
    const x = l.xS2;
    for (const dz of [-2.3, 2.3]) bx(g, 0.35, 4.0, 0.35, t.frame, x, 0, l.beltZ + dz);
    bx(g, 0.3, 0.3, 4.9, t.frame, x, 4.0, l.beltZ);
    bx(g, 0.3, 0.3, 0.3, t.cabinetDark, x, 3.35, l.beltZ - 2.3);
    bx(g, 0.3, 0.3, 0.3, t.cabinetDark, x, 3.35, l.beltZ + 2.3);
    bx(g, 0.16, 0.16, 0.06, s2Lamp, x, 3.8, l.beltZ + 2.3);
    const s = makeSign('HEIGHT SENSOR', 4.2, 0.7);
    s.position.set(x, 4.9, l.beltZ - 2.3);
    s.rotation.y = Math.PI;
    g.add(s);
  }
  // ---------- pneumatic pusher + reject chute and bin
  const pz0 = l.beltZ - 6;
  cz(g, 0.5, 3.0, t.agvBody, l.xSort, 1.6, pz0 + 1.5, 18);
  const rod = cz(g, 0.14, 1, t.steel, l.xSort, 1.6, 0, 10);
  const plate = bx(g, 1.8, 1.5, 0.15, t.steelDark, l.xSort, 1.0, 0);
  bx(g, 0.3, 1.6, 0.3, t.frame, l.xSort - 1.3, 0, pz0 + 0.5);
  bx(g, 0.3, 1.6, 0.3, t.frame, l.xSort + 1.3, 0, pz0 + 0.5);
  const chute = bx(g, 2.2, 0.12, 4.0, t.steel, l.xSort, 0.6, l.beltZ + 4.2);
  chute.rotation.x = -0.12;
  for (const dx of [-1.15, 1.15]) bx(g, 0.1, 0.3, 4.0, t.steel, l.xSort + dx, 0.9, l.beltZ + 4.2);
  const binZ = l.beltZ + 7.6;
  bx(g, 3.2, 0.1, 3.2, t.red as unknown as THREE.Material, l.xSort, 0, binZ);
  for (const [sx, sz, w, d] of [[-1.6, 0, 0.12, 3.2], [1.6, 0, 0.12, 3.2], [0, -1.6, 3.2, 0.12], [0, 1.6, 3.2, 0.12]] as const) bx(g, w, 1.3, d, t.boxTall, l.xSort + sx, 0, binZ + sz);
  {
    const s = makeSign('REJECTS', 3.2, 0.6);
    s.position.set(l.xSort, 1.8, binZ + 1.7);
    g.add(s);
  }
  // ---------- pick position (stopper) and robot cell fence
  bx(g, 0.3, 0.8, 2.4, t.agvStripe, l.xPick + 1.2, 1.0, l.beltZ);
  const rb = L.robot;
  for (const [x, z] of [[rb.x - 7, rb.z - 10], [rb.x + 7, rb.z - 10], [rb.x - 7, rb.z + 0.5], [rb.x + 7, rb.z + 0.5]] as const) bx(g, 0.15, 2.4, 0.15, t.agvStripe, x, 0, z);
  for (const [x, z, w, d] of [[rb.x, rb.z - 10, 14, 0.06], [rb.x - 7, rb.z - 4.75, 0.06, 10.5], [rb.x + 7, rb.z - 4.75, 0.06, 10.5]] as const) bx(g, w, 2.2, d, t.glass, x, 0, z);
  const sgn = makeSign('ROBOT CELL', 5, 0.8);
  sgn.position.set(rb.x, 2.9, rb.z - 10);
  g.add(sgn);

  // ---------- robot arm
  const robot = new THREE.Group();
  robot.position.set(rb.x, 0, rb.z);
  g.add(robot);
  cy(robot, 1.0, 1.6, t.cabinetDark, 0, 0.8, 0, 28);
  const yawG = new THREE.Group();
  robot.add(yawG);
  bx(yawG, 1.5, 1.0, 1.5, t.robotOrange, 0, 1.1, 0);
  const shoulder = new THREE.Group();
  shoulder.position.y = rb.shoulderY;
  yawG.add(shoulder);
  cz(shoulder, 0.55, 1.1, t.robotGrey, 0, 0, 0, 20);
  bx(shoulder, 0.7, 0.7, rb.l1, t.robotOrange, 0, 0, rb.l1 / 2);
  const elbow = new THREE.Group();
  elbow.position.z = rb.l1;
  shoulder.add(elbow);
  cz(elbow, 0.5, 1.0, t.robotGrey, 0, 0, 0, 20);
  bx(elbow, 0.6, 0.6, rb.l2, t.robotOrange, 0, 0, rb.l2 / 2);
  const wrist = new THREE.Group();
  wrist.position.z = rb.l2;
  elbow.add(wrist);
  cz(wrist, 0.35, 0.8, t.robotGrey, 0, 0, 0, 16);
  bx(wrist, 1.5, 0.2, 0.25, t.steelDark, 0, 0, 0.12);
  const fingers = [-1, 1].map((s) => {
    const f = bx(wrist, 0.14, 0.45, rb.grip * 0.85, t.steel, s * 0.85, 0, rb.grip * 0.5);
    return { f, s };
  });
  let grip = 0;
  every(anim, (_tm) => {
    const ik = solveIK(sim.tip);
    yawG.rotation.y = ik.yaw;
    shoulder.rotation.x = -ik.a1;
    elbow.rotation.x = -ik.el;
    wrist.rotation.x = Math.PI / 2 + ik.a1 + ik.el;
    const target = sim.gripClosed ? 0.64 : 0.95;
    grip += (target - grip) * 0.25;
    for (const { f, s } of fingers) f.position.x = s * grip;
  });

  // ---------- pallets, boxes
  const boxGeo = {
    short: new THREE.BoxGeometry(1.1, 1.0, 1.1).translate(0, 0.5, 0),
    tall: new THREE.BoxGeometry(1.1, 1.8, 1.1).translate(0, 0.9, 0),
  };
  anim.disposables.push(boxGeo.short, boxGeo.tall);
  const itemMeshes = new Map<number, THREE.Mesh>();
  const palletGeo = new THREE.BoxGeometry(5.2, 0.18, 3.6).translate(0, 0.21, 0);
  const skidGeo = new THREE.BoxGeometry(5.2, 0.12, 0.5).translate(0, 0.06, 0);
  anim.disposables.push(palletGeo, skidGeo);
  const palletMeshes = new Map<number, THREE.Group>();
  // yellow floor frame of the pallet station
  const ps = L.pallet;
  for (const [x, z, w, d] of [[ps.x, ps.z - 1.95, 5.8, 0.12], [ps.x, ps.z + 1.95, 5.8, 0.12], [ps.x - 2.9, ps.z, 0.12, 3.9], [ps.x + 2.9, ps.z, 0.12, 3.9]] as const) bx(g, w, 0.02, d, t.agvStripe, x, 0.02, z);

  // ---------- AGV
  const agvG = new THREE.Group();
  g.add(agvG);
  bx(agvG, 2.6, 0.45, 4.4, t.agvBody, 0, 0.1, 0);
  bx(agvG, 2.4, 0.06, 4.2, t.agvStripe, 0, 0.55, 0);
  for (const sx of [-1.35, 1.35]) for (const sz of [-1.6, 1.6]) cx(agvG, 0.3, 0.2, t.steelDark, sx, 0.3, sz, 14);
  const lidar = new THREE.Group();
  lidar.position.set(0, 0.8, 2.0);
  agvG.add(lidar);
  cy(lidar, 0.25, 0.3, t.cabinetDark, 0, 0, 0, 14);
  const sweep = bx(lidar, 3.0, 0.02, 0.06, t.wave, 1.5, 0.1, 0);
  void sweep;
  spin(anim, lidar, 'y', 8);
  const agvLight = lampMat(0x38e07a);
  bx(agvG, 0.5, 0.15, 0.15, agvLight, 0, 0.62, -2.0);
  // AGV lane markings (yellow guide line on the road)
  const lz = L.agv.laneZ;
  bx(g, 100, 0.02, 0.15, t.agvStripe, (L.pallet.x + L.agv.rackDropX) / 2, 0.07, lz);
  bx(g, 0.15, 0.02, 26, t.agvStripe, L.pallet.x, 0.07, (lz + L.pallet.z) / 2);
  bx(g, 0.15, 0.02, 37, t.agvStripe, L.agv.rackDropX, 0.07, (lz + L.agv.rackDropZ) / 2);
  // charging station
  bx(g, 3.6, 0.1, 5.2, t.cabinetDark, L.agv.parkX, 0, L.agv.parkZ);
  bx(g, 0.6, 1.6, 0.6, t.cabinet, L.agv.parkX + 2.4, 0, L.agv.parkZ);

  // ---------- rack in the warehouse
  const R = L.rack;
  for (const sx of [-9.5, 0, 9.5]) for (const sz of [-1.9, 1.9]) bx(g, 0.35, 6.4, 0.35, t.rackFrame, R.x + sx, 0, R.z + sz);
  for (const lv of [0.3, 2.6, 4.9]) for (const sx of [-4.75, 4.75]) for (const sz of [-1.9, 1.9]) bx(g, 9.4, 0.22, 0.3, t.rackBeam, R.x + sx, lv, R.z + sz);
  {
    const s = makeSign('RACK STORAGE', 6, 0.8);
    s.position.set(R.x, 7.2, R.z + 2.2);
    s.rotation.y = Math.PI;
    g.add(s);
  }

  // ---------- counters on the back wall (what the PLC counts)
  const wallZ = H.z + H.d / 2 - 0.4;
  const boards: { title: string; get: () => number; x: number }[] = [
    { title: 'GOOD BOXES', get: () => sim.good, x: -105 },
    { title: 'REJECTED', get: () => sim.rejected, x: -80 },
    { title: 'PALLETS STORED', get: () => sim.stored, x: -55 },
  ];
  const segs = boards.map((b) => {
    bx(g, 9, 4.2, 0.2, t.screenBg, b.x, 3.0, wallZ);
    const s = makeSign(b.title, 8, 0.9);
    s.position.set(b.x, 6.5, wallZ - 0.16);
    s.rotation.y = Math.PI;
    g.add(s);
    const d = sevenSeg(g, 4, b.x + 3.0, 3.5, wallZ - 0.2, 0.8, 0x38e07a, anim.disposables);
    d.group.rotation.y = Math.PI;
    return { d, get: b.get };
  });

  // ---------- every frame: draw the simulation
  const boxMat = { short: t.boxShort, tall: t.boxTall };
  const blink = (tm: number): boolean => Math.floor(tm * 3) % 2 === 0;
  every(anim, (tm) => {
    // belt marks
    const off = (tm * 1.3) % spacing;
    marks.forEach((mk, i) => {
      mk.position.x = bx0 + ((i * spacing + off) % (nMarks * spacing));
    });
    // sensors
    beam1.visible = !sim.s1;
    beam2.visible = !sim.s2;
    s1Lamp.color.setHex(sim.s1 ? 0xff3b30 : 0x38e07a);
    s2Lamp.color.setHex(sim.s2 ? 0xff3b30 : 0x38e07a);
    // pusher
    const ext = sim.pusher;
    const tipZ = l.beltZ - 1.8 + 4.4 * ext;
    rod.scale.y = Math.max(0.01, tipZ - (pz0 + 3.0));
    rod.position.z = pz0 + 3.0 + rod.scale.y / 2;
    plate.position.z = tipZ;
    // boxes
    const alive = new Set<number>();
    for (const it of sim.items) {
      alive.add(it.id);
      let mm = itemMeshes.get(it.id);
      if (!mm) {
        mm = new THREE.Mesh(boxGeo[it.kind], boxMat[it.kind]);
        mm.castShadow = true;
        g.add(mm);
        itemMeshes.set(it.id, mm);
      }
      mm.position.set(it.x, it.y, it.z);
    }
    for (const [id, mm] of itemMeshes) if (!alive.has(id)) {
      g.remove(mm);
      itemMeshes.delete(id);
    }
    // pallets
    const palAlive = new Set<number>();
    for (const p of sim.pallets) {
      palAlive.add(p.id);
      let pg = palletMeshes.get(p.id);
      if (!pg) {
        pg = new THREE.Group();
        pg.add(new THREE.Mesh(palletGeo, t.pallet));
        for (const dz of [-1.5, 0, 1.5]) {
          const sk = new THREE.Mesh(skidGeo, t.pallet);
          sk.position.z = dz;
          pg.add(sk);
        }
        g.add(pg);
        palletMeshes.set(p.id, pg);
      }
      pg.position.set(p.x, p.y, p.z);
    }
    for (const [id, pg] of palletMeshes) if (!palAlive.has(id)) {
      g.remove(pg);
      palletMeshes.delete(id);
    }
    // AGV
    agvG.position.set(sim.agv.x, 0, sim.agv.z);
    agvG.rotation.y = sim.agv.yaw;
    agvLight.color.setHex(sim.agv.state === 'parked' ? 0x38e07a : blink(tm) ? 0xffb703 : 0x553300);
    for (const s of segs) s.d.set(s.get());
  });
  void mesh;
  return { id: 'factory', nameBn: 'Automated Production Hall & Warehouse', group: g };
}
void road;
