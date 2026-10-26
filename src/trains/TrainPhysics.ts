import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { CONSIST, TRAIN_LENGTH } from './TrainConfig';
import { trainBoxes, type TrainBox } from './TrainBoxes';
import { TrainSelector, type TrainManager } from './TrainManager';

/**
 * STAGE 14 / Step 5B.2: Rapier colliders of the trains. One KINEMATIC body per car (a cuboid), only for trains near the player (like the
 * other colliders). Bodies live in floating-origin LOCAL coordinates (PhysicsWorld shifts them on origin:shift); the target pose of every
 * body is set from the world pose each fixed step, so a shift cannot leave a stale position.
 * The pose is the interpolated one the picture uses (Train.renderS), so the body moves smoothly every 1/60 s: Rapier derives the push
 * velocity from the movement per step, and the simulation itself only steps every 0.1 s.
 * Call `fixedUpdate` AFTER `TrainManager.fixedUpdate` and BEFORE `physics.step()`.
 */
export class TrainPhysics {
  private bodies = new Map<number, RAPIER.RigidBody[]>();
  private selector: TrainSelector;
  private timer = 1;

  constructor(private physics: PhysicsWorld, private origin: FloatingOrigin, private manager: TrainManager) {
    // a train is needed when any part of it can be within the active radius of the player
    this.selector = new TrainSelector(manager, PhysicsConfig.activeRadius + TRAIN_LENGTH / 2);
  }

  get activeTrains(): number {
    return this.bodies.size;
  }

  get bodyCount(): number {
    return this.activeTrains * CONSIST.length;
  }

  /** Every fixed step. (px, pz) = player WORLD position. */
  fixedUpdate(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer >= 0.2) {
      this.timer = 0;
      const { add, remove } = this.selector.update(px, pz);
      for (const id of add) this.create(id);
      for (const id of remove) this.remove(id);
    }
    for (const [id, list] of this.bodies) {
      const boxes = trainBoxes(this.manager.trains[id]);
      for (let k = 0; k < list.length; k++) this.place(list[k], boxes[k]);
    }
  }

  private place(body: RAPIER.RigidBody, b: TrainBox): void {
    body.setNextKinematicTranslation({ x: b.x - this.origin.origin.x, y: b.y, z: b.z - this.origin.origin.z });
    body.setNextKinematicRotation(b.q);
  }

  private create(id: number): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const boxes = trainBoxes(this.manager.trains[id]);
    const list: RAPIER.RigidBody[] = [];
    for (const b of boxes) {
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(b.x - this.origin.origin.x, b.y, b.z - this.origin.origin.z).setRotation(b.q),
      );
      world.createCollider(R.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setFriction(0.8), body);
      list.push(body);
    }
    this.bodies.set(id, list);
  }

  private remove(id: number): void {
    const list = this.bodies.get(id);
    if (!list) return;
    for (const body of list) this.physics.world.removeRigidBody(body);
    this.bodies.delete(id);
  }

  dispose(): void {
    for (const id of [...this.bodies.keys()]) this.remove(id);
  }
}
