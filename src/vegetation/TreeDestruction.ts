import * as THREE from 'three';
import type { Bus } from '../core/EventBus';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { chunkOriginX, chunkOriginZ, worldToChunkCoord, chunkKey } from '../world/WorldGrid';
import { treeMeshes } from './TreeChunkBuilder';
import type { TreePhysics } from './TreePhysics';
import { TREE_KIND_COUNT, TREE_STRIDE, treeKey, type TreeChunkData } from './TreeTypes';

interface ChunkTrees {
  cx: number;
  cz: number;
  trees: TreeChunkData;
  meshes: (THREE.InstancedMesh | null)[];
}

interface Falling {
  grp: THREE.Group;
  mesh: THREE.Mesh;
  /** World position of the trunk's foot. */
  w: THREE.Vector3;
  axis: THREE.Vector3;
  t: number;
  life: number;
}

const FALL = 1.0; // seconds until the tree lies down
const LIFE = 28;
const MAX_FALLING = 70;
const Q = new THREE.Quaternion();

/**
 * Felled trees (STAGE 7 follow-up). A tank running over trees or a blast knocks them down: the instance disappears
 * from the forest mesh, its trunk collider is removed (so the tank is not stopped by it) and a copy of the tree
 * topples away from the force, lies there a while and then vanishes. Felled trees stay felled: the list is kept per
 * chunk and re-applied when the chunk is rebuilt (LOD change, walking away and coming back).
 */
export class TreeDestruction {
  private chunks = new Map<string, ChunkTrees>();
  private dead = new Map<string, Set<string>>();
  private falling: Falling[] = [];
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private d: { scene: THREE.Scene; origin: FloatingOrigin; bus: Bus; physics: TreePhysics; puff?: (at: THREE.Vector3) => void }) {
    d.bus.on('chunk:loaded', (e) => {
      if (!e.trees) {
        this.chunks.delete(e.key);
        return;
      }
      this.chunks.set(e.key, { cx: e.cx, cz: e.cz, trees: e.trees, meshes: treeMeshes.get(e.trees) ?? [] });
      const dead = this.dead.get(e.key);
      if (dead) this.reapply(e.key, dead);
    });
    d.bus.on('chunk:unloaded', (e) => this.chunks.delete(e.key));
  }

  get felled(): number {
    let n = 0;
    for (const s of this.dead.values()) n += s.size;
    return n;
  }

  /** Every tree within `r` of (wx, wz) falls, away from (fromX, fromZ). */
  destroyInRadius(wx: number, wz: number, r: number, fromX: number, fromZ: number): number {
    return this.scan(wx - r, wz - r, wx + r, wz + r, (x, z) => {
      const dx = x - wx;
      const dz = z - wz;
      if (dx * dx + dz * dz > r * r) return null;
      const px = x - fromX;
      const pz = z - fromZ;
      const l = Math.hypot(px, pz) || 1;
      return { x: px / l, z: pz / l };
    });
  }

  /**
   * Trees inside an oriented box fall: centre (cx, cz), unit forward (fx, fz), half length `hl`, half width `hw`.
   * They topple ahead of the vehicle and a bit to the side.
   */
  destroyInBox(cx: number, cz: number, fx: number, fz: number, hl: number, hw: number): number {
    const reach = Math.hypot(hl, hw);
    return this.scan(cx - reach, cz - reach, cx + reach, cz + reach, (x, z) => {
      const rx = x - cx;
      const rz = z - cz;
      const along = rx * fx + rz * fz;
      const lat = rx * fz - rz * fx;
      if (Math.abs(along) > hl || Math.abs(lat) > hw) return null;
      const s = lat >= 0 ? 1 : -1;
      const px = fx * 0.8 + fz * 0.6 * s;
      const pz = fz * 0.8 - fx * 0.6 * s;
      const l = Math.hypot(px, pz) || 1;
      return { x: px / l, z: pz / l };
    });
  }

  /** Visits the trees of the chunks under the rectangle; `test` returns the fall direction or null (stays). Returns how many fell. */
  private scan(x0: number, z0: number, x1: number, z1: number, test: (x: number, z: number) => { x: number; z: number } | null): number {
    const a = worldToChunkCoord(x0, z0);
    const b = worldToChunkCoord(x1, z1);
    let n = 0;
    for (let cz = a.cz; cz <= b.cz; cz++) {
      for (let cx = a.cx; cx <= b.cx; cx++) {
        const key = chunkKey(cx, cz);
        const ch = this.chunks.get(key);
        if (!ch) continue;
        const ox = chunkOriginX(cx);
        const oz = chunkOriginZ(cz);
        for (let k = 0; k < TREE_KIND_COUNT; k++) {
          const data = ch.trees[k];
          if (!data) continue;
          for (let i = 0, o = 0; o < data.length; o += TREE_STRIDE, i++) {
            const wx = ox + data[o];
            const wz = oz + data[o + 2];
            if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
            const dead = this.dead.get(key);
            if (dead?.has(treeKey(k, data[o], data[o + 2]))) continue;
            const push = test(wx, wz);
            if (!push) continue;
            this.fell(key, ch, k, i, o, wx, wz, push);
            n++;
          }
        }
      }
    }
    return n;
  }

  private fell(key: string, ch: ChunkTrees, kind: number, i: number, o: number, wx: number, wz: number, push: { x: number; z: number }): void {
    const data = ch.trees[kind];
    let dead = this.dead.get(key);
    if (!dead) this.dead.set(key, (dead = new Set()));
    dead.add(treeKey(kind, data[o], data[o + 2]));
    const mesh = ch.meshes[kind];
    if (mesh) {
      mesh.setMatrixAt(i, this.zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.d.physics.removeTree(key, kind, data[o], data[o + 2]);
    if (mesh) this.spawnFalling(mesh, wx, data[o + 1], wz, data[o + 3], data[o + 4], push);
  }

  /** The chunk was rebuilt: felled trees stay gone. */
  private reapply(key: string, dead: Set<string>): void {
    const ch = this.chunks.get(key);
    if (!ch) return;
    for (let k = 0; k < TREE_KIND_COUNT; k++) {
      const data = ch.trees[k];
      const mesh = ch.meshes[k];
      if (!data || !mesh) continue;
      let any = false;
      for (let i = 0, o = 0; o < data.length; o += TREE_STRIDE, i++) {
        if (!dead.has(treeKey(k, data[o], data[o + 2]))) continue;
        mesh.setMatrixAt(i, this.zero);
        this.d.physics.removeTree(key, k, data[o], data[o + 2]);
        any = true;
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private spawnFalling(src: THREE.InstancedMesh, wx: number, y: number, wz: number, scale: number, yaw: number, push: { x: number; z: number }): void {
    if (this.falling.length >= MAX_FALLING) this.drop(0);
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(src.geometry, src.material);
    mesh.rotation.y = yaw;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    grp.add(mesh);
    this.d.scene.add(grp);
    const w = new THREE.Vector3(wx, y, wz);
    this.falling.push({ grp, mesh, w, axis: new THREE.Vector3(push.z, 0, -push.x), t: 0, life: LIFE });
    this.d.puff?.(w);
  }

  private drop(i: number): void {
    this.falling[i].grp.removeFromParent();
    this.falling.splice(i, 1);
  }

  /** Every frame. */
  update(dt: number): void {
    const o = this.d.origin.origin;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      if (f.t > f.life) {
        this.drop(i);
        continue;
      }
      let ang: number;
      if (f.t < FALL) ang = (f.t / FALL) ** 2 * 1.45;
      else {
        const t2 = f.t - FALL;
        ang = 1.45 + 0.07 * Math.exp(-3 * t2) * Math.sin(14 * t2); // it bounces once on the ground
      }
      f.grp.quaternion.copy(Q.setFromAxisAngle(f.axis, ang));
      f.grp.position.set(f.w.x - o.x, f.w.y, f.w.z - o.z);
      const left = f.life - f.t;
      if (left < 1.5) f.mesh.scale.setScalar(f.mesh.scale.x * Math.max(0.01, 1 - 2.5 * dt)); // shrinks away at the end
    }
  }

  dispose(): void {
    for (const f of this.falling) f.grp.removeFromParent();
    this.falling.length = 0;
  }
}
