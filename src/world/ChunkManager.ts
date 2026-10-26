import * as THREE from 'three';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { TerrainChunkBuilder } from '../terrain/TerrainChunkBuilder';
import type { RoadChunkBuilder } from '../roads/RoadChunkBuilder';
import type { RailChunkBuilder } from '../rail/RailChunkBuilder';
import type { PortChunkBuilder } from '../port/PortChunkBuilder';
import type { WaterChunkBuilder } from '../water';
import type { TreeChunkBuilder } from '../vegetation/TreeChunkBuilder';
import type { ChunkResult } from '../workers/messages';
import type { IChunkLoader } from './ChunkLoader';
import { LOAD_DISTANCE, LOD_COUNT, selectLod } from './LOD';
import {
  chunkKey,
  chunkOriginX,
  chunkOriginZ,
  distanceToChunk,
  isChunkInRange,
  worldToChunkCoord,
} from './WorldGrid';

interface ChunkEntry {
  key: string;
  cx: number;
  cz: number;
  lod: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null;
  roadMesh: THREE.Mesh | null;
  railMesh: THREE.Mesh | null;
  portMesh: THREE.Mesh | null;
  treeGroup: THREE.Group | null;
  fade: { value: number } | null;
  fadeMaterial: THREE.Material | null;
}
interface QueueItem {
  key: string;
  cx: number;
  cz: number;
  lod: number;
  dist: number;
}
interface ReadyItem {
  data: ChunkResult;
  priority: number;
}

/**
 * Decides which chunks (and at which LOD) must exist around the player,
 * asks the workers for their data, and adds/removes chunk meshes with a per-frame budget.
 *
 * Flow:  evaluate() -> queue -> pump() -> worker -> ready -> integrate() -> scene
 * All positions here are WORLD coordinates (metres, double precision), not floating-origin local ones.
 *
 * - New chunks fade in (dithered). LOD swaps of existing chunks are instant (hysteresis keeps them rare;
 *   skirts hide any crack between neighbours of different LOD).
 */
export class ChunkManager {
  private loaded = new Map<string, ChunkEntry>();
  private wanted = new Map<string, number>(); // key -> desired lod
  private requested = new Map<string, number>(); // key -> lod currently being generated
  private queue: QueueItem[] = [];
  private ready: ReadyItem[] = [];
  private fading = new Set<ChunkEntry>();
  private inFlight = 0;

  private px = 0;
  private pz = 0;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private root: THREE.Object3D,
    private loader: IChunkLoader,
    private bus: Bus,
    private builder: TerrainChunkBuilder,
    private waterBuilder: WaterChunkBuilder,
    private roadBuilder: RoadChunkBuilder,
    private railBuilder: RailChunkBuilder,
    private portBuilder: PortChunkBuilder,
    private treeBuilder: TreeChunkBuilder,
  ) {}

  /** Call every frame with the player's WORLD position. */
  update(dt: number, px: number, pz: number): void {
    this.px = px;
    this.pz = pz;
    if (Number.isNaN(this.lastX) || Math.hypot(px - this.lastX, pz - this.lastZ) > Config.chunk.reevaluateDistance) {
      this.evaluate();
    }
    this.pump();
    this.integrate();
    this.updateFades(dt);
  }

  // ---- stats for the debug panel ----
  get loadedCount(): number {
    return this.loaded.size;
  }
  get pendingCount(): number {
    return this.inFlight + this.ready.length + this.queue.length;
  }
  lodCounts(): number[] {
    const counts = new Array<number>(LOD_COUNT).fill(0);
    for (const e of this.loaded.values()) counts[e.lod]++;
    return counts;
  }

  // ---- 1. decide what we want ----
  private evaluate(): void {
    this.lastX = this.px;
    this.lastZ = this.pz;

    const S = Config.world.chunkSize;
    const r = Math.ceil(LOAD_DISTANCE / S) + 1;
    const { cx: pcx, cz: pcz } = worldToChunkCoord(this.px, this.pz);

    this.wanted.clear();
    this.queue.length = 0;

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!isChunkInRange(cx, cz)) continue;
        const dist = distanceToChunk(this.px, this.pz, cx, cz);
        if (dist > LOAD_DISTANCE) continue;

        const key = chunkKey(cx, cz);
        const current = this.loaded.get(key)?.lod;
        const lod = selectLod(dist, current);
        this.wanted.set(key, lod);
        if (current !== lod && this.requested.get(key) !== lod) {
          this.queue.push({ key, cx, cz, lod, dist });
        }
      }
    }
    this.queue.sort((a, b) => a.dist - b.dist); // nearest first

    // Unload chunks that are clearly out of range (extra margin = no unload/load flicker).
    const keepDist = LOAD_DISTANCE + S / 2;
    for (const entry of [...this.loaded.values()]) {
      if (this.wanted.has(entry.key)) continue;
      if (distanceToChunk(this.px, this.pz, entry.cx, entry.cz) > keepDist) this.unload(entry);
    }
  }

  // ---- 2. send requests to workers (limited concurrency) ----
  private pump(): void {
    while (this.inFlight < Config.chunk.maxInFlight && this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (this.wanted.get(item.key) !== item.lod) continue; // outdated
      if (this.requested.get(item.key) === item.lod) continue; // already on its way

      this.requested.set(item.key, item.lod);
      this.inFlight++;
      this.loader.request(item.cx, item.cz, item.lod).then(
        (data) => {
          this.inFlight--;
          this.ready.push({ data, priority: item.dist });
        },
        (err) => {
          this.inFlight--;
          this.requested.delete(item.key);
          console.error('[ChunkManager] chunk request failed', item.key, err);
        },
      );
    }
  }

  // ---- 3. add finished chunks to the scene, max N per frame ----
  private integrate(): void {
    if (this.ready.length === 0) return;
    this.ready.sort((a, b) => a.priority - b.priority);

    let budget = Config.chunk.maxMeshesPerFrame;
    while (this.ready.length > 0 && budget > 0) {
      const { data } = this.ready.shift()!;
      if (this.requested.get(data.key) === data.lod) this.requested.delete(data.key);
      if (this.wanted.get(data.key) !== data.lod) continue; // player moved on, discard
      this.install(data);
      budget--;
    }
  }

  private install(data: ChunkResult): void {
    const existing = this.loaded.get(data.key);
    const built = this.builder.build(data, !existing);

    built.group.position.set(chunkOriginX(data.cx), 0, chunkOriginZ(data.cz));
    built.group.updateMatrix();
    built.group.matrixAutoUpdate = false;
    built.mesh.updateMatrix();

    // Water (rivers, lakes, sea). New chunks show it after the terrain has faded in.
    let waterMesh: THREE.Mesh | null = null;
    if (data.water) {
      waterMesh = this.waterBuilder.build(data.water);
      waterMesh.updateMatrix();
      waterMesh.visible = !built.fade;
      built.group.add(waterMesh);
    }
    // Roads (STAGE 6): asphalt ribbon for LOD0/1, shown after the terrain has faded in.
    let roadMesh: THREE.Mesh | null = null;
    if (data.road) {
      roadMesh = this.roadBuilder.build(data.road);
      roadMesh.updateMatrix();
      roadMesh.visible = !built.fade;
      built.group.add(roadMesh);
    }
    // Railway (STAGE 12): track bed, rails, overhead line, viaducts, portals, platforms (LOD0-2), shown after the terrain has faded in.
    let railMesh: THREE.Mesh | null = null;
    if (data.rail) {
      railMesh = this.railBuilder.build(data.rail);
      railMesh.updateMatrix();
      railMesh.visible = !built.fade;
      built.group.add(railMesh);
    }
    // Sea port (STAGE 14): quays, cranes, containers, ships, tanks (LOD0-2), shown after the terrain has faded in.
    let portMesh: THREE.Mesh | null = null;
    if (data.port) {
      portMesh = this.portBuilder.build(data.port);
      portMesh.updateMatrix();
      portMesh.visible = !built.fade;
      built.group.add(portMesh);
    }
    // Trees (STAGE 7): instanced meshes, shown after the terrain has faded in.
    let treeGroup: THREE.Group | null = null;
    if (data.trees || data.rocks) {
      treeGroup = this.treeBuilder.build(data.trees, data.rocks, data.lod);
      if (treeGroup) {
        treeGroup.visible = !built.fade;
        built.group.add(treeGroup);
      }
    }
    this.root.add(built.group);

    if (existing) this.disposeEntry(existing);

    const entry: ChunkEntry = {
      key: data.key,
      cx: data.cx,
      cz: data.cz,
      lod: data.lod,
      group: built.group,
      mesh: built.mesh,
      waterMesh,
      roadMesh,
      railMesh,
      portMesh,
      treeGroup,
      fade: built.fade,
      fadeMaterial: built.fadeMaterial,
    };
    this.loaded.set(data.key, entry);
    if (entry.fade) this.fading.add(entry);

    this.bus.emit('chunk:loaded', {
      key: data.key,
      cx: data.cx,
      cz: data.cz,
      lod: data.lod,
      vertsPerSide: data.vertsPerSide,
      heights: data.heights,
      trees: data.trees,
      rocks: data.rocks,
    });
  }

  private updateFades(dt: number): void {
    if (this.fading.size === 0) return;
    for (const e of this.fading) {
      e.fade!.value += dt / Config.chunk.fadeSeconds;
      if (e.fade!.value >= 1) {
        this.builder.finishFade(e.mesh, e.lod, e.fadeMaterial!);
        if (e.waterMesh) e.waterMesh.visible = true;
        if (e.roadMesh) e.roadMesh.visible = true;
        if (e.railMesh) e.railMesh.visible = true;
        if (e.portMesh) e.portMesh.visible = true;
        if (e.treeGroup) e.treeGroup.visible = true;
        e.fade = null;
        e.fadeMaterial = null;
        this.fading.delete(e);
      }
    }
  }

  private disposeEntry(entry: ChunkEntry): void {
    this.root.remove(entry.group);
    entry.mesh.geometry.dispose(); // frees GPU memory
    entry.waterMesh?.geometry.dispose();
    entry.roadMesh?.geometry.dispose();
    entry.railMesh?.geometry.dispose();
    entry.portMesh?.geometry.dispose();
    if (entry.treeGroup) this.treeBuilder.dispose(entry.treeGroup);
    if (entry.fadeMaterial) this.builder.disposeFading(entry.fadeMaterial);
    this.fading.delete(entry);
  }

  private unload(entry: ChunkEntry): void {
    this.disposeEntry(entry);
    this.loaded.delete(entry.key);
    this.bus.emit('chunk:unloaded', { key: entry.key, cx: entry.cx, cz: entry.cz });
  }

  dispose(): void {
    for (const e of [...this.loaded.values()]) this.unload(e);
    this.queue.length = 0;
    this.ready.length = 0;
  }
}
