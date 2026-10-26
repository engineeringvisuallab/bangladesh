import * as THREE from 'three';
import { basisFromDirection } from '../roads/BridgeGeometry';
import type { ExpresswayNetwork, XRoute } from './ExpresswayNetwork';
import { XP } from './ExpresswayPlan';

interface Part {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
}
type Kind = 'concrete' | 'asphalt' | 'paint';

const CELL = 600;

/**
 * Visual expressway: slab, asphalt, edge / median barriers, lane paint and piers.
 * Parts of one kind are drawn with InstancedMesh, one per material and 600 m cell, so the camera only draws what it sees.
 * Everything is placed in absolute world coordinates under the world root (the floating origin moves the root), like the bridges.
 */
export class ExpresswayBuilder {
  readonly group = new THREE.Group();
  private parts: Record<Kind, Map<string, Part[]>> = { concrete: new Map(), asphalt: new Map(), paint: new Map() };
  private geo = new THREE.BoxGeometry(1, 1, 1);
  private mats: THREE.MeshLambertMaterial[] = [];
  readonly counts = { concrete: 0, asphalt: 0, paint: 0 };

  constructor(private net: ExpresswayNetwork) {
    this.group.name = 'Expressway';
    for (const r of net.routes) this.addRoute(r);
    for (const p of net.piers) this.addPier(p);
    this.finish('concrete', 0xb9b6ad, true);
    this.finish('asphalt', 0x2c2e33, false);
    this.finish('paint', 0xf1f1ea, false);
  }

  private push(kind: Kind, part: Part): void {
    const key = `${Math.floor(part.pos.x / CELL)},${Math.floor(part.pos.z / CELL)}`;
    let list = this.parts[kind].get(key);
    if (!list) this.parts[kind].set(key, (list = []));
    list.push(part);
    this.counts[kind]++;
  }

  private finish(kind: Kind, color: number, shadow: boolean): void {
    if (this.counts[kind] === 0) return;
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mats.push(mat);
    const m = new THREE.Matrix4();
    for (const list of this.parts[kind].values()) {
      const mesh = new THREE.InstancedMesh(this.geo, mat, list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p.pos, p.quat, p.scale)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.parts[kind].clear();
  }

  private addRoute(r: XRoute): void {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const hw = r.halfWidth;
    const isRamp = r.kind === 'ramp';
    const T = isRamp ? 0.9 : XP.slabThick;
    const n = r.xs.length;
    const segs = r.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const a = V(r.xs[i], r.ys[i], r.zs[i]);
      const b = V(r.xs[j], r.ys[j], r.zs[j]);
      const d = b.clone().sub(a);
      const len = d.length();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const { quat, ax, ay } = basisFromDirection(d);
      const L = len + 0.12;
      const at = (u: number, up: number) => mid.clone().addScaledVector(ax, u).addScaledVector(ay, up);
      // slab + asphalt (top face of the asphalt = road surface)
      this.push('concrete', { pos: at(0, -0.12 - T / 2), quat, scale: V(hw * 2, T, L) });
      this.push('asphalt', { pos: at(0, -0.06), quat, scale: V(hw * 2 - 0.5, 0.12, L) });
      // edge barriers (ax = the left side of the travel direction when the basis is built from +z forward: see `side`)
      for (const side of [1, -1]) {
        if (this.net.barrierOn(r, i, side)) this.push('concrete', { pos: at(side * (hw - 0.25), 0.5), quat, scale: V(0.5, 1.0, L) });
      }
      if (!isRamp) {
        // median barrier
        this.push('concrete', { pos: at(0, 0.45), quat, scale: V(XP.medianHalf * 2, 0.9, L) });
        // lane paint: solid edge lines, dashed lane lines
        const lanes = XP.lanePerSide;
        for (const side of [1, -1]) {
          for (let k = 0; k <= lanes; k++) {
            const u = side * (XP.laneStart + k * XP.laneW);
            const solid = k === 0 || k === lanes;
            if (solid) this.push('paint', { pos: at(u, 0.025), quat, scale: V(0.16, 0.05, L) });
            else this.push('paint', { pos: at(u, 0.025), quat, scale: V(0.14, 0.05, Math.min(3, len * 0.3)) });
          }
        }
      } else {
        this.push('paint', { pos: at(0, 0.025), quat, scale: V(0.14, 0.05, Math.min(3, len * 0.35)) });
        for (const side of [1, -1]) this.push('paint', { pos: at(side * (hw - 0.9), 0.025), quat, scale: V(0.14, 0.05, L) });
      }
    }
  }

  private addPier(p: { x: number; z: number; top: number; bottom: number; dx: number; dz: number; cap: number }): void {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const quat = basisFromDirection(V(p.dx, 0, p.dz)).quat;
    const h = Math.max(0.5, p.top - p.bottom - 1.4);
    // column + cap beam (hammer head) under the deck
    this.push('concrete', { pos: V(p.x, p.bottom + h / 2, p.z), quat, scale: V(p.cap > 12 ? 3.4 : 1.6, h, 2.4) });
    this.push('concrete', { pos: V(p.x, p.top - 0.7, p.z), quat, scale: V(p.cap, 1.4, 2.4) });
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
