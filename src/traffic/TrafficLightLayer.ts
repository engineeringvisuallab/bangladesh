// The 3D look of the traffic signals (see TrafficSignals.ts for which junctions get one and what the lights do).
// Every signalized leg gets ONE pole on the kerb of its incoming lane, just before the stop line, with a black 3-lamp head facing the
// approaching drivers (red on top, yellow, green at the bottom). Everything is instanced: 3 draw calls for all of it.
// The lamps are MeshBasicMaterial with a per-instance colour (bright = lit, dark = off), so they glow in the dark like real signals.
// Children use ABSOLUTE world coordinates (world.root), like the engineering fence and the placed buildings.
import * as THREE from 'three';
import type { Light, TrafficSignals } from './TrafficSignals';

const POLE_H = 5.4;
const HEAD_Y = POLE_H - 0.9;
const LAMP_Y = [0.42, 0, -0.42]; // red, yellow, green (top to bottom)

const LIT = [new THREE.Color(0xff2a1a), new THREE.Color(0xffc21a), new THREE.Color(0x22ff6e)];
const DARK = [new THREE.Color(0x3a0c08), new THREE.Color(0x3a2c06), new THREE.Color(0x07301a)];

export class TrafficLightLayer {
  readonly group = new THREE.Group();
  private poles: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  /** For every leg (in the order pads -> arms): the last shown state (0 green, 1 yellow, 2 red; -1 = never drawn). */
  private shown: Int8Array;
  private legs: { pad: number; arm: number }[] = [];
  private poleGeo = new THREE.CylinderGeometry(0.09, 0.12, POLE_H, 8);
  private headGeo = new THREE.BoxGeometry(0.46, 1.36, 0.34);
  private lampGeo: THREE.CircleGeometry = new THREE.CircleGeometry(0.15, 14);
  private poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
  private headMat = new THREE.MeshLambertMaterial({ color: 0x15171a });
  private lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  constructor(parent: THREE.Object3D, private signals: TrafficSignals) {
    for (let p = 0; p < signals.pads.length; p++) for (let k = 0; k < signals.pads[p].arms.length; k++) this.legs.push({ pad: p, arm: k });
    const n = this.legs.length;
    this.shown = new Int8Array(n).fill(-1);
    this.poles = new THREE.InstancedMesh(this.poleGeo, this.poleMat, Math.max(1, n));
    this.heads = new THREE.InstancedMesh(this.headGeo, this.headMat, Math.max(1, n));
    this.lamps = new THREE.InstancedMesh(this.lampGeo, this.lampMat, Math.max(1, n * 3));
    this.poles.count = n;
    this.heads.count = n;
    this.lamps.count = n * 3;
    // the lamps are a few pixels in size and far away they must not vanish into the fog differently from the poles: keep them simple
    for (const m of [this.poles, this.heads, this.lamps]) {
      m.frustumCulled = false; // the instances are spread over the whole map
      m.castShadow = false;
      m.receiveShadow = false;
    }

    const dummy = new THREE.Object3D();
    const head = new THREE.Matrix4();
    const off = new THREE.Matrix4();
    const mat = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const sp = signals.pads[this.legs[i].pad];
      const a = sp.arms[this.legs[i].arm];
      const yaw = Math.atan2(a.dx, a.dz); // local +Z of the head looks out along the leg, at the approaching drivers
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(a.poleX, a.poleY + POLE_H / 2, a.poleZ);
      dummy.updateMatrix();
      this.poles.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, yaw, 0);
      dummy.position.set(a.poleX, a.poleY + HEAD_Y, a.poleZ);
      dummy.updateMatrix();
      this.heads.setMatrixAt(i, dummy.matrix);
      head.copy(dummy.matrix);
      for (let c = 0; c < 3; c++) {
        off.makeTranslation(0, LAMP_Y[c], 0.18);
        mat.multiplyMatrices(head, off);
        this.lamps.setMatrixAt(i * 3 + c, mat);
        this.lamps.setColorAt(i * 3 + c, DARK[c]);
      }
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    this.group.add(this.poles, this.heads, this.lamps);
    parent.add(this.group);
    this.update();
  }

  /** Once per rendered frame: recolour the lamps of every leg whose light changed. */
  update(): void {
    const sg = this.signals;
    let changed = false;
    for (let i = 0; i < this.legs.length; i++) {
      const { pad, arm } = this.legs[i];
      const l: Light = sg.light(sg.pads[pad], arm);
      const code = l === 'green' ? 0 : l === 'yellow' ? 1 : 2;
      if (this.shown[i] === code) continue;
      this.shown[i] = code;
      // lamp order in the head: 0 red, 1 yellow, 2 green; `code` 0 = green lit, 1 = yellow, 2 = red
      const lit = code === 2 ? 0 : code === 1 ? 1 : 2;
      for (let c = 0; c < 3; c++) this.lamps.setColorAt(i * 3 + c, c === lit ? LIT[c] : DARK[c]);
      changed = true;
    }
    if (changed && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.poles.dispose();
    this.heads.dispose();
    this.lamps.dispose();
    this.poleGeo.dispose();
    this.headGeo.dispose();
    this.lampGeo.dispose();
    this.poleMat.dispose();
    this.headMat.dispose();
    this.lampMat.dispose();
  }
}
