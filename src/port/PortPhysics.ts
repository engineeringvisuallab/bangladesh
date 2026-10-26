import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { getPortLayout, type PortPart, type PortPiece } from './PortLayout';

/** The solid parts of a piece (boxes and upright prisms) - what the colliders are made of. Pure data: the tests use it too. */
export function solidParts(piece: PortPiece): PortPart[] {
  return piece.parts.filter((p) => p.solid && (p.k === 0 || p.k === 1));
}

/**
 * Rapier colliders for the port's solid structures: quay walls and caps, container stacks, crane legs, buildings, tanks, silos, ship hulls,
 * jetties, dolphins and light masts. The ground (decks, basin, breakwater mound) is already in the terrain heightfield collider.
 * Like the railway structures they only exist near the player; bodies live in floating-origin local coordinates.
 */
export class PortPhysics {
  private items: { id: number; x: number; z: number; radius: number; piece: PortPiece }[] = [];
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(private physics: PhysicsWorld, private origin: FloatingOrigin) {
    getPortLayout().pieces.forEach((piece, id) => {
      if (solidParts(piece).length > 0) this.items.push({ id, x: piece.x, z: piece.z, radius: piece.r + 8, piece });
    });
  }

  get activeCount(): number {
    return this.active.size;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (const it of this.items) {
      const d = Math.hypot(px - it.x, pz - it.z);
      const reach = PhysicsConfig.activeRadius + it.radius;
      const has = this.active.has(it.id);
      if (!has && d <= reach) this.create(it);
      else if (has && d > reach + 64) this.remove(it.id);
    }
  }

  private create(it: { id: number; x: number; z: number; piece: PortPiece }): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(it.x - this.origin.origin.x, 0, it.z - this.origin.origin.z));
    for (const p of solidParts(it.piece)) {
      const desc = p.k === 0 ? R.ColliderDesc.cuboid(p.hx, p.hy, p.hz) : R.ColliderDesc.cylinder(p.hy, p.hx);
      world.createCollider(desc.setTranslation(p.x - it.x, p.y, p.z - it.z).setFriction(0.9), body);
    }
    this.active.set(it.id, body);
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
