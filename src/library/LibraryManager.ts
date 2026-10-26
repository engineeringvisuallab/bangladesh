// City Library inside the open world.
//  - the hall (CityLibrary.ts) stands at LIBRARY_POS on a flat pad (terrain.library), always there when the game starts
//  - Rapier colliders for the walls (door left open), the roof, the floor and every bookcase / table / column inside:
//    the player, cars and helicopters cannot go through
//  - a paved forecourt + a footpath from the door to the F7 road
//  - the hall is cheap (books are ONE InstancedMesh), so it is simply hidden when the player is far away
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { CityLibrary } from './CityLibrary';
import { LIBRARY_PATH, LIBRARY_PLOT } from './LibrarySite';

export interface LibraryDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Is the player walking (not driving / flying / sailing)? */
  onFoot: () => boolean;
}

const SHOW_DIST = 900; // the hall is drawn within this distance
const ANIM_DIST = 150; // the globe and the other small animations run within this distance
const HALL_H = 9; // wall height (m)
const INNER_H = 4; // bookcases, tables, desk, globe stand: lower than the walls
const WALL_T = 0.25; // wall half thickness

export class LibraryManager {
  readonly library: CityLibrary;
  readonly group: THREE.Group;
  /** True while the player stands inside the hall (on foot). */
  inside = false;
  private body: RAPIER.RigidBody;
  private foundation: THREE.Mesh;
  private plaza: THREE.Mesh;
  private path: THREE.Mesh;
  private p = new THREE.Vector3();

  constructor(private d: LibraryDeps) {
    const site = d.terrain.library;
    // no point lights: every extra light makes every lit material in the scene more expensive; the game's own hemisphere light and the
    // emissive lamps / windows of the hall are enough
    this.library = new CityLibrary({ interiorLights: false });
    this.group = this.library.group;
    this.group.position.set(site.x, site.floorY, site.z);
    this.group.rotation.y = site.yaw;
    d.root.add(this.group);

    // concrete podium under the floor, so no gap shows if the ground is a bit lower than the floor somewhere
    this.foundation = new THREE.Mesh(
      new THREE.BoxGeometry(CityLibrary.HALF_X * 2 + 1.4, 1.6, CityLibrary.HALF_Z * 2 + 1.4),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.95 }),
    );
    this.foundation.position.set(site.x, site.floorY - 0.8 - 0.02, site.z);
    this.foundation.rotation.y = site.yaw;
    d.root.add(this.foundation);

    // paved forecourt: the whole level plot, the hall stands on it
    const P = LIBRARY_PLOT;
    const mat = (color: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.plaza = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0), mat(0xc4c0b6));
    this.plaza.rotation.x = -Math.PI / 2;
    this.plaza.position.set((P.x0 + P.x1) / 2, site.floorY - 0.015, (P.z0 + P.z1) / 2);
    d.root.add(this.plaza);

    // footpath: from the forecourt (north edge of the plot) up to the road edge
    const plen = P.z0 + 1 - LIBRARY_PATH.z0;
    this.path = new THREE.Mesh(new THREE.PlaneGeometry(LIBRARY_PATH.halfWidth * 2, plen), mat(0xa8a49a));
    this.path.rotation.x = -Math.PI / 2;
    this.path.position.set(LIBRARY_PATH.x, site.floorY - 0.01, LIBRARY_PATH.z0 + plen / 2);
    d.root.add(this.path);

    this.body = this.createColliders();
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.library;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(site.x - o.x, site.floorY, site.z - o.z)
        .setRotation({ x: 0, y: Math.sin(site.yaw / 2), z: 0, w: Math.cos(site.yaw / 2) }),
    );
    const hx = CityLibrary.HALF_X, hz = CityLibrary.HALF_Z;
    /** Box by local min/max x, z and y range. */
    const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, friction = 0.4): void => {
      world.createCollider(
        R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setFriction(friction),
        body,
      );
    };
    // walls (the structure itself only ships the furniture colliders): back, left, right, and the front wall in two pieces around the door
    box(-hx - WALL_T * 2, hx + WALL_T * 2, -hz - WALL_T * 2, -hz, 0, HALL_H);
    box(-hx - WALL_T * 2, -hx, -hz, hz + WALL_T * 2, 0, HALL_H);
    box(hx, hx + WALL_T * 2, -hz, hz + WALL_T * 2, 0, HALL_H);
    const door = 3; // door opening: x in [-3, 3]
    box(-hx, -door, hz, hz + WALL_T * 2, 0, HALL_H);
    box(door, hx, hz, hz + WALL_T * 2, 0, HALL_H);
    box(-door, door, hz, hz + WALL_T * 2, 5, HALL_H); // lintel above the 5 m door
    // roof: helicopters and the tank cannot drop into the hall from above
    box(-hx - 0.5, hx + 0.5, -hz - 0.5, hz + 0.5, HALL_H, HALL_H + 0.4);
    // floor slab (top face = the floor tiles; the terrain under the hall is 3 cm lower): walking is perfectly smooth
    box(-hx - 0.5, hx + 0.5, -hz - 0.5, hz + 0.5, -1, 0, 1);
    // bookcases, tables, columns, reception desk, globe stand
    for (const c of this.library.colliders) {
      if (c.kind === 'circle') {
        world.createCollider(R.ColliderDesc.cylinder(INNER_H / 2, c.r).setTranslation(c.x, INNER_H / 2, c.z), body);
      } else {
        world.createCollider(
          R.ColliderDesc.cuboid(c.hx, INNER_H / 2, c.hz)
            .setTranslation(c.x, INNER_H / 2, c.z)
            .setRotation({ x: 0, y: Math.sin(c.rot / 2), z: 0, w: Math.cos(c.rot / 2) })
            .setFriction(0.4),
          body,
        );
      }
    }
    return body;
  }

  /** Player position in the hall's own (local) x / z metres. */
  private toLocal(wx: number, wz: number, out: { x: number; z: number }): void {
    const site = this.d.terrain.library;
    const dx = wx - site.x, dz = wz - site.z;
    const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
    out.x = dx * c - dz * s;
    out.z = dx * s + dz * c;
  }

  private loc = { x: 0, z: 0 };

  /** Name of the book section the player is standing at (e.g. "Science"), or null when outside / far from every section. */
  get section(): string | null {
    if (!this.inside) return null;
    this.d.playerWorld(this.p);
    this.toLocal(this.p.x, this.p.z, this.loc);
    return this.library.zoneAt(this.loc.x, this.loc.z, 7);
  }

  /** Minimap marker position. */
  get position(): { x: number; z: number } {
    const s = this.d.terrain.library;
    return { x: s.x, z: s.z };
  }

  /** Once per rendered frame. */
  update(t: number): void {
    const site = this.d.terrain.library;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    this.group.visible = this.foundation.visible = this.plaza.visible = this.path.visible = dist < SHOW_DIST;
    this.inside = this.d.onFoot() && site.inside(this.p.x, this.p.z, -0.6) && this.p.y > site.floorY - 2 && this.p.y < site.floorY + HALL_H;
    if (dist < ANIM_DIST) this.library.update(t);
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.foundation, this.plaza, this.path);
    for (const m of [this.foundation, this.plaza, this.path]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.library.dispose(); // removes the group from the scene
  }
}
