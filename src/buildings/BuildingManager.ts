// PROTOTYPE building inside the open world: the police station (thana) from src/buildings/models.
//  - the model (one merged mesh per surface) stands at PROTO_POS on a flat pad (terrain.protoBuilding), always there when the game starts
//  - simple Rapier boxes: boundary wall (gate left open), main station, lock-up, barracks, parked jeeps / van, trees, poles. The player,
//    cars and helicopters cannot go through them. This is the PROTOTYPE collision: later it can follow each wall / room exactly.
//  - a paved apron over the whole plot and a footpath from the gate to the F6 road
//  - hidden when the player is far away
// To use another model: change PROTO_MODEL_ID in ProtoSite.ts (and the colliders below).
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { BUILDING_MODEL_BY_ID } from './models/registry';
import type { BuiltBuilding } from './models/BuildingKit';
import { PROTO_MODEL_ID, PROTO_PATH, PROTO_PLOT, PROTO_SIZE } from './ProtoSite';

export interface BuildingDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

const SHOW_DIST = 2000; // the building is drawn within this distance (was 900)
const FLOOR_TOP = 0.1; // the compound's own paving is 6-10 cm above the pad

/** Collision boxes of the police station in the model's local frame: [centre x, centre z, half x, half z, height, yaw]. Numbers come from buildPoliceStation(). */
const BOXES: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, -8, 12.4, 6.4, 8.6, 0], // main station (2 storeys + roof sign)
  [15, -14, 5, 4, 4.6, 0], // lock-up block
  [-17, -12, 5, 7, 5, 0], // barracks / armoury wing
  [-5, 14, 0.9, 0.9, 2.8, 0], // guard sentry box
  [-14, 10, 1, 2.2, 2.6, 0.4], // jeep
  [-4, 8, 1, 2.2, 2.6, -0.2], // jeep
  [18, 12, 1, 2.6, 2.8, 0.1], // prison van
  [-20, -20, 2.3, 0.9, 1.1, 0], // seized motorbikes
];
const CYLS: readonly (readonly [number, number, number, number])[] = [
  [-24, 18, 0.4, 5], // tree
  [24, -20, 0.4, 5], // tree
  [10, 10, 0.2, 10], // flag pole
  [22, -4, 0.25, 14], // wireless mast
];

export class BuildingManager {
  readonly building: BuiltBuilding;
  readonly group: THREE.Group;
  /** True while the player stands anywhere on the plot (HUD label). */
  inside = false;
  private body: RAPIER.RigidBody;
  private apron: THREE.Mesh;
  private path: THREE.Mesh;
  private p = new THREE.Vector3();

  constructor(private d: BuildingDeps) {
    const site = d.terrain.protoBuilding;
    const def = BUILDING_MODEL_BY_ID[PROTO_MODEL_ID];
    if (!def) throw new Error(`building model "${PROTO_MODEL_ID}" not found`);
    this.building = def.build(0);
    this.group = this.building.root;
    this.group.position.set(site.x, site.floorY, site.z);
    this.group.rotation.y = site.yaw;
    d.root.add(this.group);

    // paved apron: the whole level plot (the compound stands on it), then the footpath north to the road
    const P = PROTO_PLOT;
    const mat = (color: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.apron = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0), mat(0xb9b5ab));
    this.apron.rotation.x = -Math.PI / 2;
    this.apron.position.set((P.x0 + P.x1) / 2, site.floorY - 0.015, (P.z0 + P.z1) / 2);
    d.root.add(this.apron);
    const plen = P.z0 + 1 - PROTO_PATH.z0;
    this.path = new THREE.Mesh(new THREE.PlaneGeometry(PROTO_PATH.halfWidth * 2, plen), mat(0xa8a49a));
    this.path.rotation.x = -Math.PI / 2;
    this.path.position.set(PROTO_PATH.x, site.floorY - 0.01, PROTO_PATH.z0 + plen / 2);
    d.root.add(this.path);

    this.body = this.createColliders();
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.protoBuilding;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(site.x - o.x, site.floorY, site.z - o.z)
        .setRotation({ x: 0, y: Math.sin(site.yaw / 2), z: 0, w: Math.cos(site.yaw / 2) }),
    );
    /** Box by local min/max x, z and y range. */
    const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, friction = 0.4, rot = 0): void => {
      world.createCollider(
        R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
          .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
          .setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) })
          .setFriction(friction),
        body,
      );
    };
    const hx = PROTO_SIZE.W / 2, hz = PROTO_SIZE.D / 2;
    // floor slab (top = the compound's paving): walking is perfectly smooth
    box(-hx, hx, -hz, hz, -1, FLOOR_TOP, 1);
    // boundary wall 2.6 m high: back, left, right, and the front wall in two pieces around the 7 m gate
    const wt = 0.4, wh = 2.6, gate = 3.5;
    const wx = hx - 0.3, wz = hz - 0.3;
    box(-wx, wx, -wz - wt / 2, -wz + wt / 2, 0, wh); // back
    box(-wx - wt / 2, -wx + wt / 2, -wz, wz, 0, wh); // left
    box(wx - wt / 2, wx + wt / 2, -wz, wz, 0, wh); // right
    box(-wx, -gate, wz - wt / 2, wz + wt / 2, 0, wh); // front left
    box(gate, wx, wz - wt / 2, wz + wt / 2, 0, wh); // front right
    for (const [x, z, rx, rz, h, yaw] of BOXES) box(x - rx, x + rx, z - rz, z + rz, 0, h, 0.4, yaw);
    for (const [x, z, r, h] of CYLS) world.createCollider(R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, h / 2, z), body);
    return body;
  }

  /** Minimap marker position. */
  get position(): { x: number; z: number } {
    const s = this.d.terrain.protoBuilding;
    return { x: s.x, z: s.z };
  }

  /** Once per rendered frame. */
  update(): void {
    const site = this.d.terrain.protoBuilding;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    this.group.visible = this.apron.visible = this.path.visible = dist < SHOW_DIST;
    this.inside = site.onPlot(this.p.x, this.p.z) && this.p.y > site.floorY - 3 && this.p.y < site.floorY + 40;
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.group, this.apron, this.path);
    for (const m of [this.apron, this.path]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.building.dispose();
  }
}
