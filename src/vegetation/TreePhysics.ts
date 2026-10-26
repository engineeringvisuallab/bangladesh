import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { chunkOriginX, chunkOriginZ } from '../world/WorldGrid';
import { ROCK_KIND_COUNT, RockKind, TREE_KIND_COUNT, TREE_STRIDE, TreeKind, treeKey, type TreeChunkData } from './TreeTypes';

/** Trunk collider per kind at scale 1: radius (m) and height (m, capped: only the part a person / car can touch). */
const TRUNK: Record<number, { r: number; h: number }> = {
  [TreeKind.broadleaf]: { r: 0.42, h: 3.4 },
  [TreeKind.pine]: { r: 0.35, h: 3 },
  [TreeKind.palm]: { r: 0.28, h: 5 },
  [TreeKind.oak]: { r: 0.55, h: 3 },
  [TreeKind.vase]: { r: 0.42, h: 3 },
  [TreeKind.slender]: { r: 0.28, h: 4 },
};
/** Rock collider per kind at scale 1: radius (m) and height (m), a bit smaller than the model. Rocks lower than `rocks.collideMinHeight` are skipped. */
const ROCK: Record<number, { r: number; h: number }> = {
  [RockKind.round]: { r: 0.8, h: 0.68 },
  [RockKind.slab]: { r: 1.15, h: 0.3 },
};
const FLOATS = 5; // per tree in a cell: dx, y, dz (relative to the cell centre / ground), radius, half height

interface Cell {
  key: string;
  chunk: string;
  /** World coordinates of the cell centre. */
  x: number;
  z: number;
  data: Float32Array;
  body: RAPIER.RigidBody | null;
}

/**
 * Trunk colliders for trees (STAGE 7). Rapier cylinders, only near the player:
 * trees are grouped in 50 m squares (`collideCell`), one fixed body per square. A square gets its body when it comes
 * within `collideRadius` of the player and loses it beyond `collideKeep`. Bodies live in floating-origin LOCAL
 * coordinates (PhysicsWorld shifts them on origin:shift), same as TerrainPhysics.
 */
export class TreePhysics {
  private cells = new Map<string, Cell>();
  private byChunk = new Map<string, string[]>();
  /** Per chunk: tree id -> where its collider data sits (so a felled tree loses its trunk collider). */
  private refs = new Map<string, Map<string, { cell: string; off: number }>>();
  private timer = 1;
  private colliders = 0;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    bus: Bus,
  ) {
    bus.on('chunk:loaded', (e) => {
      this.dropChunk(e.key); // LOD swap or reload: same trees, rebuild from the new data
      if (e.trees || e.rocks) this.addChunk(e.key, e.cx, e.cz, e.trees ?? null, e.rocks ?? null);
      this.timer = 1;
    });
    bus.on('chunk:unloaded', (e) => this.dropChunk(e.key));
  }

  get activeBodies(): number {
    let n = 0;
    for (const c of this.cells.values()) if (c.body) n++;
    return n;
  }

  get activeColliders(): number {
    return this.colliders;
  }

  /** Call every frame with the player's WORLD position. Work is throttled to 5 Hz. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;

    const V = Config.vegetation;
    const half = V.collideCell / 2;
    const want: { cell: Cell; d: number }[] = [];
    for (const cell of this.cells.values()) {
      const dx = Math.max(Math.abs(px - cell.x) - half, 0);
      const dz = Math.max(Math.abs(pz - cell.z) - half, 0);
      const d = Math.hypot(dx, dz);
      if (!cell.body) {
        if (d <= V.collideRadius) want.push({ cell, d });
      } else if (d > V.collideKeep) {
        this.removeBody(cell);
      }
    }
    want.sort((a, b) => a.d - b.d); // nearest first
    for (let i = 0; i < want.length && i < V.collideBuildPerTick; i++) this.createBody(want[i].cell);
  }

  private addChunk(key: string, cx: number, cz: number, trees: TreeChunkData | null, rocks: TreeChunkData | null): void {
    const S = Config.world.chunkSize;
    const size = Config.vegetation.collideCell;
    const per = Math.round(S / size);
    const ox = chunkOriginX(cx);
    const oz = chunkOriginZ(cz);
    const buckets = new Map<number, number[]>();
    const pending: { id: number; off: number; key: string }[] = [];
    const kinds = (trees ? TREE_KIND_COUNT : 0) + (rocks ? ROCK_KIND_COUNT : 0);
    for (let n = 0; n < kinds; n++) {
      const isRock = !trees || n >= TREE_KIND_COUNT;
      const k = isRock ? n - (trees ? TREE_KIND_COUNT : 0) : n;
      const d = (isRock ? rocks : trees)![k];
      if (!d) continue;
      const spec = isRock ? ROCK[k] : TRUNK[k];
      for (let o = 0; o < d.length; o += TREE_STRIDE) {
        if (isRock && spec.h * d[o + 3] < Config.vegetation.rocks.collideMinHeight) continue; // small rocks: walk over them
        const lx = d[o];
        const lz = d[o + 2];
        const ci = Math.min(per - 1, Math.max(0, Math.floor(lx / size)));
        const cj = Math.min(per - 1, Math.max(0, Math.floor(lz / size)));
        const id = cj * per + ci;
        let b = buckets.get(id);
        if (!b) buckets.set(id, (b = []));
        const scale = d[o + 3];
        const h = Math.min(spec.h * scale, 5);
        const radius = spec.r * scale;
        // relative to the cell centre (x, z); y is the ground height (the body sits at y = 0)
        if (!isRock) pending.push({ id, off: b.length, key: treeKey(k, lx, lz) });
        b.push(lx - (ci + 0.5) * size, d[o + 1], lz - (cj + 0.5) * size, radius, h / 2);
      }
    }
    const keys: string[] = [];
    for (const [id, b] of buckets) {
      const ci = id % per;
      const cj = Math.floor(id / per);
      const cellKey = `${key}#${id}`;
      this.cells.set(cellKey, {
        key: cellKey,
        chunk: key,
        x: ox + (ci + 0.5) * size,
        z: oz + (cj + 0.5) * size,
        data: new Float32Array(b),
        body: null,
      });
      keys.push(cellKey);
    }
    this.byChunk.set(key, keys);
    const refs = new Map<string, { cell: string; off: number }>();
    for (const p of pending) refs.set(p.key, { cell: `${key}#${p.id}`, off: p.off });
    this.refs.set(key, refs);
  }

  /** A tree was felled (TreeDestruction): its trunk collider goes away at once. */
  removeTree(chunk: string, kind: number, lx: number, lz: number): void {
    const ref = this.refs.get(chunk)?.get(treeKey(kind, lx, lz));
    const cell = ref ? this.cells.get(ref.cell) : undefined;
    if (!ref || !cell || cell.data[ref.off + 3] <= 0) return;
    cell.data[ref.off + 3] = 0;
    if (cell.body) {
      this.removeBody(cell);
      this.createBody(cell);
    }
  }

  private dropChunk(key: string): void {
    const keys = this.byChunk.get(key);
    if (!keys) return;
    for (const k of keys) {
      const cell = this.cells.get(k);
      if (cell) this.removeBody(cell);
      this.cells.delete(k);
    }
    this.byChunk.delete(key);
    this.refs.delete(key);
  }

  private createBody(cell: Cell): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cell.x - this.origin.origin.x, 0, cell.z - this.origin.origin.z));
    const d = cell.data;
    for (let o = 0; o < d.length; o += FLOATS) {
      const half = d[o + 4];
      if (d[o + 3] <= 0) continue; // felled tree
      world.createCollider(R.ColliderDesc.cylinder(half, d[o + 3]).setTranslation(d[o], d[o + 1] + half, d[o + 2]), body);
    }
    this.colliders += d.length / FLOATS;
    cell.body = body;
  }

  private removeBody(cell: Cell): void {
    if (!cell.body) return;
    this.physics.world.removeRigidBody(cell.body); // removes its colliders too
    this.colliders -= cell.data.length / FLOATS;
    cell.body = null;
  }

  dispose(): void {
    for (const cell of this.cells.values()) this.removeBody(cell);
    this.cells.clear();
    this.byChunk.clear();
  }
}
