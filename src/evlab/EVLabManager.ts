// EVLab research campus inside the open world.
//  - the campus (EVLab.ts) stands at EVLAB_POS on the big level plot (terrain.evlab), scaled by EVLAB_SCALE, always there when the game starts
//  - Rapier colliders for the fence, hub and every building (the player, cars and helicopters cannot go through; the gate stays open)
//  - ~1,500 meshes and no LOD, so the whole group is hidden (and its animations paused) when the player is far away
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { EVLab } from './EVLab';
import { EVLAB_FENCE, EVLAB_LOCAL_HALF_X, EVLAB_LOCAL_HALF_Z, EVLAB_ROAD, EVLAB_SCALE } from './EVLabSite';

export interface EVLabDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

const FENCE_H = 4; // fence colliders (m)
const FENCE_PIECE = 6; // length of one fence panel (m)
const GATE_GAP = 12; // the boundary fence is open this far (m) either side of the avenue
const BUILDING_H = 20; // hub + buildings (m)
const SHOW_DIST = 1100; // the group is drawn within this distance of the plot centre
const ANIM_DIST = 420; // animations (cranes, gears, turbines ...) run within this distance

export class EVLabManager {
  readonly lab: EVLab;
  private body: RAPIER.RigidBody;
  private access: THREE.Mesh;
  private fenceBody: RAPIER.RigidBody | null = null;
  private fenceMeshes: THREE.InstancedMesh[] = [];
  private p = new THREE.Vector3();

  constructor(private d: EVLabDeps) {
    const site = d.terrain.evlab;
    this.lab = new EVLab({ surroundings: false, halfX: EVLAB_LOCAL_HALF_X, halfZ: EVLAB_LOCAL_HALF_Z, fence: false });
    this.lab.group.position.set(site.x, site.floorY, site.z);
    this.lab.group.rotation.y = site.yaw;
    this.lab.group.scale.setScalar(EVLAB_SCALE);
    d.root.add(this.lab.group);
    this.body = this.createColliders();

    // access road: asphalt strip from the gate (south fence) to the F6 highway
    const len = EVLAB_ROAD.endZ - site.gateZ;
    this.access = new THREE.Mesh(new THREE.PlaneGeometry(EVLAB_ROAD.halfWidth * 2, len), new THREE.MeshLambertMaterial({ color: 0x3b3d40 }));
    this.access.rotation.x = -Math.PI / 2;
    this.access.position.set(site.x, site.floorY + 0.04, site.gateZ + len / 2);
    d.root.add(this.access);

    this.buildBoundaryFence();
  }

  /**
   * The big EVLAB boundary: a fence along EVLAB_FENCE in absolute world coordinates (panels + posts, following the ground), with Rapier colliders.
   * It is open at the avenue (the gate) and wherever a local street crosses it. Only the boundary - the campus inside is untouched.
   */
  private buildBoundaryFence(): void {
    const T = this.d.terrain;
    const site = T.evlab;
    const R = this.d.physics.RAPIER;
    const o = this.d.origin.origin;
    // local streets (to leave a gap where they cross the fence)
    const streets: { xs: ArrayLike<number>; zs: ArrayLike<number>; w: number }[] = [];
    for (const r of T.roads.roads) if (r.kind === 'local') streets.push({ xs: r.xs, zs: r.zs, w: r.halfWidth + r.shoulder + 3 });
    const nearStreet = (x: number, z: number): boolean => {
      for (const st of streets) {
        for (let i = 0; i + 1 < st.xs.length; i++) {
          const ax = st.xs[i], az = st.zs[i], bx = st.xs[i + 1], bz = st.zs[i + 1];
          if (Math.abs(x - ax) > 80 && Math.abs(x - bx) > 80) continue;
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
          const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < st.w) return true;
        }
      }
      return false;
    };
    interface Piece { ax: number; az: number; bx: number; bz: number }
    const pieces: Piece[] = [];
    const P = EVLAB_FENCE;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / FENCE_PIECE));
      for (let k = 0; k < n; k++) {
        const ax = x0 + ((x1 - x0) * k) / n, az = z0 + ((z1 - z0) * k) / n;
        const bx = x0 + ((x1 - x0) * (k + 1)) / n, bz = z0 + ((z1 - z0) * (k + 1)) / n;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mz > site.z && Math.abs(mx - site.x) < GATE_GAP) continue; // the gate: the avenue passes here
        if (nearStreet(mx, mz) || nearStreet(ax, az) || nearStreet(bx, bz)) continue;
        pieces.push({ ax, az, bx, bz });
      }
    }
    const body = this.d.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(-o.x, 0, -o.z));
    this.fenceBody = body;
    const panelGeo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0x888e94 });
    const panels = new THREE.InstancedMesh(panelGeo, mat, pieces.length);
    const posts = new THREE.InstancedMesh(panelGeo, new THREE.MeshLambertMaterial({ color: 0x5d646b }), pieces.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    pieces.forEach((pc, i) => {
      const len = Math.hypot(pc.bx - pc.ax, pc.bz - pc.az);
      const ga = T.heightAt(pc.ax, pc.az), gb = T.heightAt(pc.bx, pc.bz), gm = T.heightAt((pc.ax + pc.bx) / 2, (pc.az + pc.bz) / 2);
      const lo = Math.min(ga, gb, gm) - 0.5, hi = Math.max(ga, gb, gm);
      const yaw = -Math.atan2(pc.bz - pc.az, pc.bx - pc.ax);
      q.setFromAxisAngle(up, yaw);
      // panel: from just below the ground up to 2.5 m above the highest ground under it
      const ph = hi + 2.5 - lo;
      m.compose(pos.set((pc.ax + pc.bx) / 2, lo + ph / 2, (pc.az + pc.bz) / 2), q, sc.set(len + 0.05, ph, 0.35));
      panels.setMatrixAt(i, m);
      const kh = hi + 3 - (ga - 0.5);
      m.compose(pos.set(pc.ax, ga - 0.5 + kh / 2, pc.az), q.identity(), sc.set(0.5, kh, 0.5));
      posts.setMatrixAt(i, m);
      // collider: 4 m high, same footprint
      const ch = hi + FENCE_H - lo;
      this.d.physics.world.createCollider(
        R.ColliderDesc.cuboid(len / 2 + 0.05, ch / 2, 0.3)
          .setTranslation((pc.ax + pc.bx) / 2, lo + ch / 2, (pc.az + pc.bz) / 2)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .setFriction(0.4),
        body,
      );
    });
    for (const im of [panels, posts]) {
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.name = 'EVLabBoundaryFence';
      this.d.root.add(im);
      this.fenceMeshes.push(im);
    }
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.evlab;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(site.x - o.x, site.floorY, site.z - o.z));
    const S = EVLAB_SCALE;
    for (const c of this.lab.colliders) {
      if (c.kind === 'circle') {
        world.createCollider(R.ColliderDesc.cylinder(BUILDING_H / 2, c.r * S).setTranslation(c.x * S, BUILDING_H / 2, c.z * S), body);
      } else {
        const fence = c.hx <= 0.5 || c.hz <= 0.5;
        const h = fence ? FENCE_H : BUILDING_H;
        world.createCollider(
          R.ColliderDesc.cuboid(c.hx * S, h / 2, c.hz * S)
            .setTranslation(c.x * S, h / 2, c.z * S)
            .setRotation({ x: 0, y: Math.sin(c.rot / 2), z: 0, w: Math.cos(c.rot / 2) })
            .setFriction(0.4),
          body,
        );
      }
    }
    return body;
  }

  /** True when the player is inside the fenced plot. */
  get inside(): boolean {
    this.d.playerWorld(this.p);
    return this.d.terrain.evlab.inside(this.p.x, this.p.z);
  }

  /** Once per rendered frame. */
  update(t: number): void {
    const site = this.d.terrain.evlab;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    this.lab.group.visible = this.access.visible = dist < SHOW_DIST;
    if (dist < ANIM_DIST) this.lab.update(t);
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    if (this.fenceBody) this.d.physics.world.removeRigidBody(this.fenceBody);
    for (const im of this.fenceMeshes) {
      this.d.root.remove(im);
      im.dispose();
      (im.material as THREE.Material).dispose();
    }
    this.fenceMeshes[0]?.geometry.dispose();
    this.d.root.remove(this.lab.group);
    this.d.root.remove(this.access);
    this.access.geometry.dispose();
    (this.access.material as THREE.Material).dispose();
    this.lab.dispose();
  }
}
