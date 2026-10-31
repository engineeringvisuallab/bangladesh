import RAPIER from '@dimforge/rapier3d-compat';
import type { Bus } from '../core/EventBus';
import { PhysicsConfig } from './PhysicsConfig';

/**
 * Thin wrapper around the Rapier world. ALL physics in the game goes through Rapier.
 * Later stages create bodies/colliders via `physics.world` (terrain heightfields, vehicles, ...).
 * Coordinates are floating-origin LOCAL coordinates (see FloatingOrigin).
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly RAPIER = RAPIER;

  static async create(bus: Bus): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(bus);
  }

  private constructor(bus: Bus) {
    this.world = new RAPIER.World({ x: 0, y: PhysicsConfig.gravity, z: 0 });
    this.world.timestep = PhysicsConfig.fixedStep;

    // Keep every body in sync when the floating origin moves.
    bus.on('origin:shift', ({ dx, dz }) => {
      this.world.bodies.forEach((body) => {
        const t = body.translation();
        body.setTranslation({ x: t.x - dx, y: t.y, z: t.z - dz }, true);
      });
    });
  }

  /** One fixed step (called at 60 Hz by the game loop). */
  step(): void {
    this.world.step();
  }

  /** True if a point is inside the active simulation radius (300 m) around the player. */
  isActive(x: number, z: number, playerX: number, playerZ: number): boolean {
    return Math.hypot(x - playerX, z - playerZ) <= PhysicsConfig.activeRadius;
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  get colliderCount(): number {
    return this.world.colliders.len();
  }

  dispose(): void {
    this.world.free();
  }
}
