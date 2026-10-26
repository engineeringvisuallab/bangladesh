// The army camp inside the open world: the model stands at ARMY_POS on its levelled pad (terrain.army), Rapier colliders (fixed, in floating-origin
// local coordinates) keep the player, cars and helicopters out of the buildings, towers, vehicles and the fence. Hidden when the player is far away.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { createArmyModel, type ArmyModel } from './ArmyModel';
import { armyToWorld } from './ArmyPlan';

export interface ArmyDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

const SHOW_DIST = 2600;

export class ArmyManager {
  readonly model: ArmyModel;
  private body: RAPIER.RigidBody;
  private p = new THREE.Vector3();

  constructor(private d: ArmyDeps) {
    const site = d.terrain.army;
    this.model = createArmyModel(site.plan);
    this.model.group.position.set(site.plan.site.cx, site.floorY, site.plan.site.cz);
    d.root.add(this.model.group);
    this.body = this.createColliders();
  }

  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER, world = this.d.physics.world;
    const site = this.d.terrain.army, plan = site.plan, o = this.d.origin.origin, yaw = plan.site.heading;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(plan.site.cx - o.x, site.floorY, plan.site.cz - o.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
    const box = (lx: number, lz: number, w: number, dd: number, h: number): void => {
      world.createCollider(R.ColliderDesc.cuboid(w / 2, h / 2, dd / 2).setTranslation(lx, h / 2, lz).setFriction(0.5), body);
    };
    for (const s of plan.solids) box(s.cx, s.cz, s.w, s.d, s.h);
    for (const f of plan.fence) box((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, Math.abs(f.x1 - f.x0) || 0.3, Math.abs(f.z1 - f.z0) || 0.3, 2.6);
    return body;
  }

  /** World x, z of the helipad and of the spot just inside the main gate (where "L" puts the player). */
  get spawns(): { helipad: { x: number; z: number }; gate: { x: number; z: number } } {
    const plan = this.d.terrain.army.plan;
    return { helipad: armyToWorld(plan.site, plan.helipad.x, plan.helipad.z), gate: armyToWorld(plan.site, plan.spawn.x, plan.spawn.z) };
  }

  update(): void {
    const site = this.d.terrain.army.plan.site;
    this.d.playerWorld(this.p);
    this.model.group.visible = Math.hypot(this.p.x - site.cx, this.p.z - site.cz) < SHOW_DIST;
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.model.group);
    this.model.dispose();
  }
}
