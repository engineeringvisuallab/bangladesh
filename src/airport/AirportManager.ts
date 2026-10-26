// The airport inside the open world (STAGE B).
//  - the module's model (runway, taxiway, apron, terminal, hangars, tower, lights, fence) stands at AIRPORT_POS on the levelled pad (terrain.airport)
//  - Rapier colliders (fixed, in floating-origin local coordinates) for the buildings, poles, windsock and fence: player, cars and helicopters cannot go through
//  - the whole model is simply hidden when the player is far away
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { createAirportModel, type AirportModel } from './AirportModel';
import type { AirportSite } from './AirportSite';

export interface AirportDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Which airport to build: default = the old one (terrain.airport); pass terrain.airportSea for the sea airport. */
  site?: AirportSite;
}

const SHOW_DIST = 5200; // the airport is drawn within this distance (it is 1.5 km wide; the spawn is ~4.7 km away)

export class AirportManager {
  readonly model: AirportModel;
  private body: RAPIER.RigidBody;
  private p = new THREE.Vector3();

  /** The airport site this manager builds. */
  private get site(): AirportSite {
    return this.d.site ?? this.d.terrain.airport;
  }

  constructor(private d: AirportDeps) {
    const site = this.site;
    this.model = createAirportModel(site.plan);
    this.model.group.position.set(site.plan.site.cx, site.floorY, site.plan.site.cz);
    this.model.group.rotation.y = site.plan.site.heading;
    d.root.add(this.model.group);
    this.body = this.createColliders();
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.site;
    const plan = site.plan;
    const o = this.d.origin.origin;
    const yaw = plan.site.heading;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(plan.site.cx - o.x, site.floorY, plan.site.cz - o.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
    const box = (lx: number, lz: number, w: number, dd: number, h: number): void => {
      world.createCollider(R.ColliderDesc.cuboid(w / 2, h / 2, dd / 2).setTranslation(lx, h / 2, lz).setFriction(0.5), body);
    };
    for (const b of plan.buildings) if (b.kind !== 'jetbridge') box(b.cx, b.cz, b.w, b.d, b.h); // jet bridges are elevated: skipped
    for (const pl of plan.poles) box(pl.x, pl.z, 0.5, 0.5, pl.h);
    box(plan.windsock.x, plan.windsock.z, 0.3, 0.3, 7);
    for (const f of plan.fence) box((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, Math.abs(f.x1 - f.x0) || 0.15, Math.abs(f.z1 - f.z0) || 0.15, 2.4);
    return body;
  }

  /** Where a helicopter / plane can start: world x, z of the helipad and the runway start. */
  get spawns(): { helipad: { x: number; z: number }; runwayStart: { x: number; z: number; yaw: number } } {
    const plan = this.site.plan;
    const c = Math.cos(plan.site.heading), s = Math.sin(plan.site.heading);
    const w = (lx: number, lz: number) => ({ x: plan.site.cx + lx * c + lz * s, z: plan.site.cz - lx * s + lz * c });
    const r = plan.spawns.runwayStart;
    return { helipad: w(plan.spawns.helipad.x, plan.spawns.helipad.z), runwayStart: { ...w(r.x, r.z), yaw: r.yaw + plan.site.heading } };
  }

  /** Once per rendered frame. `night` 0..1 dims / brightens the runway lights. */
  update(night = 0): void {
    const site = this.site.plan.site;
    this.d.playerWorld(this.p);
    this.model.group.visible = Math.hypot(this.p.x - site.cx, this.p.z - site.cz) < SHOW_DIST;
    this.model.setNight(night);
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.model.group);
    this.model.dispose();
  }
}
