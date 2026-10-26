import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { deckSegments } from './BridgeGeometry';
import type { BridgeSpec, RoadSpec } from './RoadTypes';

/**
 * Rapier colliders for bridges: one cuboid per deck segment + a parapet on each side.
 * Like the terrain colliders they only exist near the player (physics radius + half the bridge length).
 * Bodies live in floating-origin local coordinates; PhysicsWorld shifts them when the origin moves.
 */
export class BridgePhysics {
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private bridges: BridgeSpec[],
    private roads: RoadSpec[],
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (const b of this.bridges) {
      const d = Math.hypot(px - b.centerX, pz - b.centerZ);
      const reach = PhysicsConfig.activeRadius + b.lengthM / 2;
      const has = this.active.has(b.id);
      if (!has && d <= reach) this.create(b);
      else if (has && d > reach + 64) this.remove(b.id);
    }
  }

  private create(b: BridgeSpec): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.centerX - this.origin.origin.x, 0, b.centerZ - this.origin.origin.z));
    const half = b.deckHalfWidth;
    for (const seg of deckSegments(this.roads[b.roadId], b)) {
      const q = { x: seg.quat.x, y: seg.quat.y, z: seg.quat.z, w: seg.quat.w };
      const at = (ox: number, oy: number) => ({
        x: seg.mid.x - b.centerX + seg.ax.x * ox + seg.ay.x * oy,
        y: seg.mid.y + seg.ax.y * ox + seg.ay.y * oy,
        z: seg.mid.z - b.centerZ + seg.ax.z * ox + seg.ay.z * oy,
      });
      // deck: top face = road surface
      world.createCollider(R.ColliderDesc.cuboid(half, 0.5, seg.len / 2 + 0.06).setTranslation(at(0, -0.5).x, at(0, -0.5).y, at(0, -0.5).z).setRotation(q).setFriction(1.0), body);
      // parapets (cars cannot drive off the bridge by accident)
      for (const side of [1, -1]) {
        const p = at(side * (half - 0.18), 0.5);
        world.createCollider(R.ColliderDesc.cuboid(0.15, 0.5, seg.len / 2 + 0.06).setTranslation(p.x, p.y, p.z).setRotation(q).setFriction(0.3), body);
      }
    }
    this.active.set(b.id, body);
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
