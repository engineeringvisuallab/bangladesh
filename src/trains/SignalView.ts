import * as THREE from 'three';
import { signalSpecs, type SignalSpec } from './SignalSpecs';
import type { TrainFleet } from './TrainSim';

/**
 * STAGE 15 / Step 6: the signals you SEE: a home signal in front of every platform end (red = a train is on the platform block, a train
 * may not enter) and a starter signal just beyond the front of the standing train (green = the route through the throat is clear and the
 * train may leave). Where they stand is computed headless (`signalSpecs`, tested); `SignalLayer` draws them with the same floating-origin
 * trick as the trains (absolute world coordinates under the world root). Positions come from SignalSpecs.ts (pure, tested).
 */
interface Lamp {
  spec: SignalSpec;
  group: THREE.Group;
  red: THREE.Mesh;
  green: THREE.Mesh;
  aspect: 'red' | 'green' | '';
}

export class SignalLayer {
  private lamps: Lamp[] = [];
  private mats = {
    redOn: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    redOff: new THREE.MeshBasicMaterial({ color: 0x3a0c0c }),
    greenOn: new THREE.MeshBasicMaterial({ color: 0x2aff62 }),
    greenOff: new THREE.MeshBasicMaterial({ color: 0x0a3a16 }),
    metal: new THREE.MeshLambertMaterial({ color: 0x2b2f36 }),
  };
  private geo = {
    pole: new THREE.BoxGeometry(0.22, 5.2, 0.22),
    head: new THREE.BoxGeometry(0.5, 1.5, 0.7),
    lamp: new THREE.SphereGeometry(0.2, 8, 6),
  };
  /** Signals are drawn within this distance (m) of the player (the railway meshes reach 2.6 km; the lamps are small). */
  showDistance = 1500;

  constructor(private root: THREE.Object3D, private fleet: TrainFleet) {
    for (const spec of signalSpecs(fleet)) {
      const g = new THREE.Group();
      g.name = `signal-${spec.kind}`;
      const pole = new THREE.Mesh(this.geo.pole, this.mats.metal);
      pole.position.y = 2.6;
      const head = new THREE.Mesh(this.geo.head, this.mats.metal);
      head.position.y = 5.0;
      const red = new THREE.Mesh(this.geo.lamp, this.mats.redOn);
      const green = new THREE.Mesh(this.geo.lamp, this.mats.greenOff);
      red.position.set(0.26, 5.35, 0);
      green.position.set(0.26, 4.7, 0);
      g.add(pole, head, red, green);
      // local +x (the lamps' side) faces the oncoming train, that is AGAINST the direction of travel
      g.rotation.y = Math.atan2(spec.tz, -spec.tx);
      g.position.set(spec.x, spec.y, spec.z);
      g.visible = false;
      root.add(g);
      this.lamps.push({ spec, group: g, red, green, aspect: '' });
    }
  }

  get count(): number {
    return this.lamps.length;
  }

  private aspectOf(s: SignalSpec): 'red' | 'green' {
    const sig = this.fleet.signals!;
    if (s.kind === 'home') return sig.homeAspect(s.edgeId, s.end);
    for (const t of this.fleet.trains) if (t.state === 'dwell' && t.node === s.node) return sig.routeFree(t) ? 'green' : 'red';
    return 'red';
  }

  update(px: number, pz: number): void {
    for (const l of this.lamps) {
      const near = Math.hypot(l.spec.x - px, l.spec.z - pz) < this.showDistance;
      l.group.visible = near;
      if (!near) continue;
      const a = this.aspectOf(l.spec);
      if (a === l.aspect) continue;
      l.aspect = a;
      l.red.material = a === 'red' ? this.mats.redOn : this.mats.redOff;
      l.green.material = a === 'green' ? this.mats.greenOn : this.mats.greenOff;
    }
  }

  dispose(): void {
    for (const l of this.lamps) this.root.remove(l.group);
    this.lamps = [];
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
