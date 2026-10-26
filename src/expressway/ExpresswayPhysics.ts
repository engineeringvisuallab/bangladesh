import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { basisFromDirection } from '../roads/BridgeGeometry';
import type { ExpresswayNetwork, XRoute } from './ExpresswayNetwork';
import { XP } from './ExpresswayPlan';

interface Piece {
  id: number;
  route: XRoute;
  i0: number;
  i1: number;
  cx: number;
  cz: number;
  reach: number;
  piers: number[];
}

/**
 * Rapier colliders for the expressway: one fixed body per piece of ~16 segments (deck slab, edge + median barriers, piers).
 * Like the bridges, a piece only exists while the player is near it (physics radius + half the piece).
 * Bodies live in floating-origin local coordinates; PhysicsWorld shifts them when the origin moves.
 */
export class ExpresswayPhysics {
  private pieces: Piece[] = [];
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private net: ExpresswayNetwork,
  ) {
    let id = 0;
    for (const r of net.routes) {
      const n = r.xs.length;
      const segs = r.closed ? n : n - 1;
      const per = r.kind === 'ramp' ? 20 : 16;
      for (let i0 = 0; i0 < segs; i0 += per) {
        const i1 = Math.min(segs, i0 + per);
        let cx = 0;
        let cz = 0;
        for (let i = i0; i <= i1; i++) {
          cx += r.xs[i % n];
          cz += r.zs[i % n];
        }
        cx /= i1 - i0 + 1;
        cz /= i1 - i0 + 1;
        let reach = 0;
        for (let i = i0; i <= i1; i++) reach = Math.max(reach, Math.hypot(r.xs[i % n] - cx, r.zs[i % n] - cz));
        this.pieces.push({ id: id++, route: r, i0, i1, cx, cz, reach: reach + 25, piers: [] });
      }
    }
    // each pier belongs to the piece that contains its route point
    const byRoute = new Map<number, Piece[]>();
    for (const p of this.pieces) {
      const l = byRoute.get(p.route.id) ?? [];
      l.push(p);
      byRoute.set(p.route.id, l);
    }
    net.piers.forEach((pier, k) => {
      const list = byRoute.get(pier.routeId);
      const piece = list?.find((p) => pier.i >= p.i0 && pier.i <= p.i1) ?? list?.[list.length - 1];
      piece?.piers.push(k);
    });
  }

  get activeCount(): number {
    return this.active.size;
  }
  get pieceCount(): number {
    return this.pieces.length;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (const p of this.pieces) {
      const d = Math.hypot(px - p.cx, pz - p.cz);
      const reach = PhysicsConfig.activeRadius + p.reach;
      const has = this.active.has(p.id);
      if (!has && d <= reach) this.create(p);
      else if (has && d > reach + 64) this.remove(p.id);
    }
  }

  private create(p: Piece): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const r = p.route;
    const n = r.xs.length;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(p.cx - this.origin.origin.x, 0, p.cz - this.origin.origin.z));
    const hw = r.halfWidth;
    const isRamp = r.kind === 'ramp';
    const T = isRamp ? 0.9 : XP.slabThick;
    for (let i = p.i0; i < p.i1; i++) {
      const j = (i + 1) % n;
      const a = new THREE.Vector3(r.xs[i], r.ys[i], r.zs[i]);
      const b = new THREE.Vector3(r.xs[j], r.ys[j], r.zs[j]);
      const d = b.clone().sub(a);
      const len = d.length();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const { quat, ax, ay } = basisFromDirection(d);
      const q = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
      const at = (u: number, up: number) => ({
        x: mid.x - p.cx + ax.x * u + ay.x * up,
        y: mid.y + ax.y * u + ay.y * up,
        z: mid.z - p.cz + ax.z * u + ay.z * up,
      });
      const half = len / 2 + 0.06;
      // slab: the top face is the road surface
      const s = at(0, -T / 2);
      world.createCollider(R.ColliderDesc.cuboid(hw, T / 2, half).setTranslation(s.x, s.y, s.z).setRotation(q).setFriction(1.0), body);
      // edge barriers (left = +ax, right = -ax); open at ramp merge lanes
      for (const side of [1, -1]) {
        if (!this.net.barrierOn(r, i, side)) continue;
        const e = at(side * (hw - 0.25), 0.5);
        world.createCollider(R.ColliderDesc.cuboid(0.25, 0.5, half).setTranslation(e.x, e.y, e.z).setRotation(q).setFriction(0.3), body);
      }
      if (!isRamp) {
        const m = at(0, 0.45);
        world.createCollider(R.ColliderDesc.cuboid(XP.medianHalf, 0.45, half).setTranslation(m.x, m.y, m.z).setRotation(q).setFriction(0.3), body);
      }
    }
    for (const k of p.piers) {
      const pier = this.net.piers[k];
      const q4 = basisFromDirection(new THREE.Vector3(pier.dx, 0, pier.dz)).quat;
      const q = { x: q4.x, y: q4.y, z: q4.z, w: q4.w };
      const h = Math.max(0.5, pier.top - pier.bottom - 1.4);
      world.createCollider(R.ColliderDesc.cuboid(pier.cap > 12 ? 1.7 : 0.8, h / 2, 1.2).setTranslation(pier.x - p.cx, pier.bottom + h / 2, pier.z - p.cz).setRotation(q), body);
      world.createCollider(R.ColliderDesc.cuboid(pier.cap / 2, 0.7, 1.2).setTranslation(pier.x - p.cx, pier.top - 0.7, pier.z - p.cz).setRotation(q), body);
    }
    this.active.set(p.id, body);
  }

  private remove(id: number): void {
    const body = this.active.get(id);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(id);
  }

  dispose(): void {
    for (const id of [...this.active.keys()]) this.remove(id);
  }
}
