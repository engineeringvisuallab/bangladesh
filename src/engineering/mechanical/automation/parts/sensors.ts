import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { sevenSeg } from './sevenseg';
import { bx, cx, cy, mesh } from './helpers';

/** Sensor lab: inductive proximity sensor (sees metal only), through-beam photo-eye (counts boxes), ultrasonic distance sensor (sound echoes). */
export function buildSensors({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'sensors';
  const S = L.sensorLab;
  building(g, m, { x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, open: 'S', door: 'N' });
  const lamp = (c: number): THREE.MeshBasicMaterial => {
    const mm = new THREE.MeshBasicMaterial({ color: c });
    anim.disposables.push(mm);
    return mm;
  };
  const zc = S.z + 2;
  const station = (i: number, title: string): number => {
    const x = S.x - 19 + i * 19;
    bx(g, 16, 7.4, 0.2, t.plate, x, 3.7, S.z - S.d / 2 + 1.2);
    bx(g, 16.4, 0.5, 8, t.cabinet, x, 0, zc - 1);
    const s = makeSign(title, 14, 1.0);
    s.position.set(x, 8.0, S.z - S.d / 2 + 1.35);
    g.add(s);
    return x;
  };

  // ---- 1. inductive proximity sensor: a metal block is detected, a plastic block is not
  {
    const x0 = station(0, 'INDUCTIVE SENSOR: DETECTS METAL ONLY');
    const sx = x0 - 6.5;
    cx(g, 0.55, 2.2, t.steelDark, sx, 3.2, zc, 20);
    cx(g, 0.45, 0.4, t.steel, sx + 1.3, 3.2, zc, 20); // sensing face
    bx(g, 0.5, 3.0, 0.5, t.frame, sx - 0.6, 0.5, zc);
    const status = lamp(0x4a4f55);
    bx(g, 0.4, 0.4, 0.4, status, sx - 0.3, 4.2, zc);
    const field = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 12, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.16, depthWrite: false }));
    field.rotation.y = Math.PI / 2;
    field.position.set(sx + 1.5, 3.2, zc);
    field.name = 'fx';
    anim.disposables.push(field.geometry, field.material as THREE.Material);
    g.add(field);
    const rail = bx(g, 11, 0.2, 1.6, t.steelDark, x0 + 1, 1.7, zc);
    void rail;
    const carriage = new THREE.Group();
    g.add(carriage);
    const metal = bx(carriage, 1.4, 1.4, 1.4, t.steel, 0, 2.5, zc);
    const plastic = bx(carriage, 1.4, 1.4, 1.4, t.boxShort, 0, 2.5, zc);
    const seg = sevenSeg(g, 3, x0 + 4.2, 5.6, zc + 1.2, 0.7, 0x4cc9f0, anim.disposables);
    const unit = makeSign('DISTANCE (cm)', 4.6, 0.6);
    unit.position.set(x0 + 5.4, 5.2, zc + 1.25);
    g.add(unit);
    every(anim, (tm) => {
      const cyc = Math.floor(tm / 8);
      const d = 0.9 + 4.2 * (0.5 + 0.5 * Math.cos((tm / 8) * Math.PI * 2)); // gap between the sensor face and the block
      const isMetal = cyc % 2 === 0;
      carriage.position.x = sx + 1.5 + d + 0.7;
      metal.visible = isMetal;
      plastic.visible = !isMetal;
      const detect = isMetal && d < 1.7;
      status.color.setHex(detect ? 0x38e07a : 0x4a4f55);
      (field.material as THREE.MeshBasicMaterial).opacity = detect ? 0.38 : 0.16;
      seg.set(d * 10);
    });
  }

  // ---- 2. photo-eye (through beam): boxes interrupt the beam, the counter goes up
  {
    const x0 = station(1, 'PHOTO-EYE: BEAM BROKEN = BOX COUNTED');
    const z0 = zc - 3.3;
    const z1 = zc + 3.3;
    for (const z of [z0, z1]) {
      bx(g, 0.5, 2.6, 0.5, t.frame, x0, 0.5, z);
      bx(g, 0.5, 0.5, 0.5, t.cabinetDark, x0, 2.8, z);
    }
    const lampRx = lamp(0x38e07a);
    bx(g, 0.3, 0.3, 0.3, lampRx, x0 + 0.4, 3.2, z1);
    const beam = bx(g, 0.07, 0.07, z1 - z0, t.beamRed, x0, 3.05, zc);
    bx(g, 16, 0.3, 3.0, t.beltTop, x0, 1.6, zc);
    const boxes: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) boxes.push(bx(g, 1.5, 1.2, 1.5, t.boxShort, x0 - 8, 1.9, zc));
    // boxes at x, just above the belt; the beam is at 3.05: boxes are 1.9 + 1.2 = 3.1 high so they break it
    const seg = sevenSeg(g, 3, x0 - 7.5, 5.2, zc + 3.6, 0.7, 0x38e07a, anim.disposables);
    const unit = makeSign('BOXES COUNTED', 5, 0.6);
    unit.position.set(x0 - 5.6, 4.8, zc + 3.65);
    g.add(unit);
    let count = 0;
    let was = false;
    every(anim, (tm) => {
      let blocked = false;
      boxes.forEach((b, k) => {
        const bxp = x0 - 8 + ((tm * 1.6 + k * 4) % 16);
        b.position.x = bxp;
        if (Math.abs(bxp - x0) < 0.9) blocked = true;
      });
      beam.visible = !blocked;
      lampRx.color.setHex(blocked ? 0xff3b30 : 0x38e07a);
      if (blocked && !was) count++;
      was = blocked;
      seg.set(count);
    });
  }

  // ---- 3. ultrasonic sensor: sends sound, listens for the echo, distance = speed x time / 2
  {
    const x0 = station(2, 'ULTRASONIC SENSOR: SOUND ECHO = DISTANCE');
    const sx = x0 - 6.6;
    cx(g, 0.7, 1.4, t.cabinetDark, sx, 3.3, zc, 24);
    cx(g, 0.5, 0.2, t.steel, sx + 0.75, 3.3, zc, 24);
    bx(g, 0.5, 3.0, 0.5, t.frame, sx - 0.5, 0.5, zc);
    const wall = bx(g, 0.4, 3.4, 4.4, t.cabinet, x0 + 7, 1.7, zc);
    const seg = sevenSeg(g, 3, x0 + 3.0, 5.6, zc + 3.2, 0.7, 0xffb703, anim.disposables);
    const unit = makeSign('DISTANCE (cm)', 4.6, 0.6);
    unit.position.set(x0 + 4.2, 5.2, zc + 3.25);
    g.add(unit);
    const rings: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
      anim.disposables.push(mat);
      const r = mesh(g, new THREE.RingGeometry(0.85, 1.0, 28), mat, sx, 3.3, zc);
      r.rotation.y = Math.PI / 2;
      r.name = 'fx';
      anim.disposables.push(r.geometry);
      rings.push(r);
    }
    every(anim, (tm) => {
      const d = 6.5 + 2.4 * Math.sin(tm * 0.35) - 2; // distance from sensor face to the wall
      wall.position.x = sx + 0.9 + d;
      rings.forEach((r, k) => {
        const ph = (tm * 0.55 + k / 4) % 1;
        const s = ph * 2 * d;
        const out = s < d;
        const pos = out ? s : 2 * d - s;
        r.position.x = sx + 0.9 + pos;
        r.scale.setScalar(0.3 + pos * 0.28);
        const mat = r.material as THREE.MeshBasicMaterial;
        mat.color.setHex(out ? 0x7fd0ff : 0xffb703);
        mat.opacity = 0.65 * (1 - ph * 0.4);
      });
      seg.set(d * 10);
    });
  }
  void cy;
  return { id: 'sensors', nameBn: 'Sensor Lab (Inductive, Photo-eye, Ultrasonic)', group: g };
}
