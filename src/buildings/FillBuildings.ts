// STEP 2 - PERFORMANCE: draws the city fill (PlacementsFill.ts, hundreds of buildings) with INSTANCING + CHUNKS + LOD.
//
//  - Only 4 colour variants of every model are ever built (`seed % 4`); a model + variant ("template") is built ONCE and shared.
//  - The fill is cut into 256 m chunks. Per chunk and per template there is one InstancedMesh per surface mesh of the model, so the number of
//    draw calls depends on the number of DIFFERENT models near you, not on the number of buildings.
//  - LOD per chunk (distance from the player to the chunk's box):  near = full instanced models,  middle = plain boxes (1 draw call per chunk),
//    far = hidden. Hysteresis stops flicker at the borders. Chunks outside the camera view are skipped by three.js (frustum culling).
//  - Templates are warmed up a few ms per frame, nearest chunk first, so walking into the city never freezes the game; until a chunk's models
//    are ready it shows its boxes.
// POSITION ONLY like PlacedBuildings (no colliders yet). The 55 hand placed buildings stay in PlacedBuildings.ts, untouched.
import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { FILL_MODEL_BY_ID } from './models/fillRegistry';
import type { BuiltBuilding } from './models/BuildingKit';
import type { BuildingPlacement } from './Placements';
import { FILL_PLACEMENTS } from './PlacementsFill';

export interface FillBuildingsDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: TerrainGenerator;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

export const FILL_CHUNK = 256;
/** Distance (m) from the player to a chunk's box: full models closer than DETAIL, boxes closer than PROXY, hidden beyond. */
export const FILL_DETAIL_DIST = 520;
export const FILL_PROXY_DIST = 1700;
const HYST = 120; // already shown: stays shown this much (m) longer
const VARIANTS = 4;
const WARM_BUDGET_MS = 4;
const MAX_CHUNK_SWITCHES_PER_FRAME = 2;
/** A plinth under a model is only needed when the ground under the footprint is not (almost) level. */
const PLINTH_MIN_RANGE = 0.25;
/** Shadow casting of the instanced models (see above). */
export const FILL_CAST_SHADOW = false;
const PROXY_COLORS = [0xd8d2c6, 0xcfc8bb, 0xdcd6cc, 0xc9c3b8];

interface Item {
  p: BuildingPlacement;
  floorY: number;
  minY: number;
  key: string; // template key `${id}#${variant}`
  chunk: Chunk;
}
interface Template {
  built: BuiltBuilding;
  /** One InstancedMesh per surface mesh of the model, for the whole city. */
  inst: THREE.InstancedMesh[];
  /** Every building of the city that uses this template. */
  items: Item[];
}
const LOD = { Hidden: 0, Proxy: 1, Detail: 2 } as const;
type LOD = (typeof LOD)[keyof typeof LOD];
interface Chunk {
  key: string;
  items: Item[];
  x0: number; x1: number; z0: number; z1: number;
  keys: string[]; // templates this chunk needs
  group: THREE.Group;
  proxy: THREE.InstancedMesh | null;
  lod: LOD;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP_Y = new THREE.Vector3(0, 1, 0);

function setPose(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1): void {
  _q.setFromAxisAngle(UP_Y, yaw);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

export class FillBuildings {
  private chunks: Chunk[] = [];
  private templates = new Map<string, Template>();
  private wanted = new Set<string>(); // template keys requested by chunks in detail range
  private itemsByKey = new Map<string, Item[]>();
  private dirty = new Set<string>(); // templates whose instance matrices must be rewritten
  private plinthItems: Item[] = [];
  private plinthInst: THREE.InstancedMesh | null = null;
  private plinthDirty = false;
  private p = new THREE.Vector3();
  private proxyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private proxyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private plinthGeo = new THREE.BoxGeometry(1, 1, 1);
  private plinthMat = new THREE.MeshLambertMaterial({ color: 0xa8a49a });
  private holder = new THREE.Group();

  constructor(private d: FillBuildingsDeps) {
    this.holder.name = 'fill-buildings';
    d.root.add(this.holder);
    const byChunk = new Map<string, { p: BuildingPlacement; floorY: number; minY: number; key: string }[]>();
    for (const p of FILL_PLACEMENTS) {
      if (!FILL_MODEL_BY_ID[p.id]) continue;
      // ground range under the (rotated) footprint
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      let mn = 1e9, mx = -1e9;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * (p.W / 2), lz = (j / 2) * (p.D / 2);
        const h = d.terrain.heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
        mn = Math.min(mn, h); mx = Math.max(mx, h);
      }
      const raw = { p, floorY: mx + 0.02, minY: mn, key: `${p.id}#${Math.abs(p.seed ?? 0) % VARIANTS}` };
      const k = `${Math.floor(p.x / FILL_CHUNK)},${Math.floor(p.z / FILL_CHUNK)}`;
      const l = byChunk.get(k);
      if (l) l.push(raw); else byChunk.set(k, [raw]);
    }
    for (const [key, raws] of byChunk) {
      const [ci, cj] = key.split(',').map(Number);
      const group = new THREE.Group();
      group.visible = false;
      this.holder.add(group);
      const chunk: Chunk = {
        key, items: [],
        x0: ci * FILL_CHUNK, x1: (ci + 1) * FILL_CHUNK, z0: cj * FILL_CHUNK, z1: (cj + 1) * FILL_CHUNK,
        keys: [...new Set(raws.map((it) => it.key))],
        group, proxy: null, lod: LOD.Hidden,
      };
      for (const r of raws) {
        const it: Item = { ...r, chunk };
        chunk.items.push(it);
        const l = this.itemsByKey.get(it.key);
        if (l) l.push(it); else this.itemsByKey.set(it.key, [it]);
        if (it.floorY - it.minY > PLINTH_MIN_RANGE) this.plinthItems.push(it);
      }
      this.chunks.push(chunk);
    }
    // one plinth InstancedMesh for the whole city (only where the ground is not level)
    if (this.plinthItems.length) {
      this.plinthInst = new THREE.InstancedMesh(this.plinthGeo, this.plinthMat, this.plinthItems.length);
      this.plinthInst.frustumCulled = false;
      this.plinthInst.receiveShadow = true;
      this.plinthInst.count = 0;
      this.holder.add(this.plinthInst);
    }
  }

  /** Debug / test numbers. */
  get stats(): { buildings: number; chunks: number; detail: number; proxy: number; templates: number; drawCalls: number; shown: number } {
    let detail = 0, proxy = 0, drawCalls = 0, buildings = 0, shown = 0;
    for (const c of this.chunks) {
      buildings += c.items.length;
      if (c.lod === LOD.Detail) detail++;
      else if (c.lod === LOD.Proxy) { proxy++; drawCalls += 1; shown += c.items.length; }
    }
    for (const t of this.templates.values()) { for (const im of t.inst) if (im.visible && im.count > 0) drawCalls++; if (t.inst[0] && t.inst[0].visible) shown += t.inst[0].count; }
    if (this.plinthInst && this.plinthInst.visible && this.plinthInst.count > 0) drawCalls++;
    return { buildings, chunks: this.chunks.length, detail, proxy, templates: this.templates.size, drawCalls, shown };
  }

  /** Is the template (model + colour variant) built? Builds it when `build` is true. */
  private template(key: string, build: boolean): Template | null {
    const have = this.templates.get(key);
    if (have || !build) return have ?? null;
    const [id, v] = key.split('#');
    const built = FILL_MODEL_BY_ID[id!]!.build(Number(v) + 1);
    const meshes: THREE.Mesh[] = [];
    built.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const items = this.itemsByKey.get(key) ?? [];
    const inst = meshes.map((mesh) => {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(1, items.length));
      im.frustumCulled = false; // the set of instances changes with the LOD: one bound for the whole city is useless
      im.castShadow = FILL_CAST_SHADOW && mesh.castShadow;
      im.receiveShadow = mesh.receiveShadow;
      im.count = 0;
      im.visible = false;
      this.holder.add(im);
      return im;
    });
    const t: Template = { built, inst, items };
    this.templates.set(key, t);
    this.dirty.add(key);
    return t;
  }

  private distTo(c: Chunk): number {
    const dx = Math.max(c.x0 - this.p.x, 0, this.p.x - c.x1);
    const dz = Math.max(c.z0 - this.p.z, 0, this.p.z - c.z1);
    return Math.hypot(dx, dz);
  }

  private buildProxy(c: Chunk): void {
    const m = new THREE.InstancedMesh(this.proxyGeo, this.proxyMat, c.items.length);
    c.items.forEach((it, i) => {
      const def = FILL_MODEL_BY_ID[it.p.id]!;
      const h = Math.max(4, def.floors * 3.2 + 2);
      setPose(m, i, it.p.x, it.floorY, it.p.z, it.p.yaw, it.p.W * 0.88, h, it.p.D * 0.88);
      m.setColorAt(i, _c.setHex(PROXY_COLORS[Math.abs(it.p.seed ?? 0) % PROXY_COLORS.length]!));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = false;
    m.receiveShadow = true;
    c.group.add(m);
    c.proxy = m;
  }

  private setLod(c: Chunk, lod: LOD): void {
    if (lod !== LOD.Hidden && !c.proxy) this.buildProxy(c); // boxes always exist: dropping back to them is free
    if (c.proxy) c.proxy.visible = lod === LOD.Proxy;
    c.group.visible = lod === LOD.Proxy;
    if ((lod === LOD.Detail) !== (c.lod === LOD.Detail)) {
      for (const k of c.keys) this.dirty.add(k);
      this.plinthDirty = true;
    }
    c.lod = lod;
  }

  /** Rewrites the instance matrices of the templates whose set of detailed buildings changed. */
  private flush(): void {
    for (const key of this.dirty) {
      const t = this.templates.get(key);
      if (!t) continue; // not built yet: stays dirty
      let n = 0;
      for (const it of t.items) {
        if (it.chunk.lod !== LOD.Detail) continue;
        for (const im of t.inst) setPose(im, n, it.p.x, it.floorY, it.p.z, it.p.yaw);
        n++;
      }
      for (const im of t.inst) {
        im.count = n;
        im.visible = n > 0;
        im.instanceMatrix.needsUpdate = true;
      }
      this.dirty.delete(key);
    }
    if (this.plinthDirty && this.plinthInst) {
      let n = 0;
      for (const it of this.plinthItems) {
        if (it.chunk.lod !== LOD.Detail) continue;
        const h = it.floorY - it.minY + 0.5;
        setPose(this.plinthInst, n++, it.p.x, it.floorY - h / 2 - 0.005, it.p.z, it.p.yaw, it.p.W, h, it.p.D);
      }
      this.plinthInst.count = n;
      this.plinthInst.visible = n > 0;
      this.plinthInst.instanceMatrix.needsUpdate = true;
      this.plinthDirty = false;
    }
  }

  /** Once per rendered frame. */
  update(): void {
    this.d.playerWorld(this.p);
    const order: { c: Chunk; dist: number; want: LOD }[] = [];
    this.wanted.clear();
    for (const c of this.chunks) {
      const dist = this.distTo(c);
      let want: LOD = LOD.Hidden;
      if (dist < FILL_DETAIL_DIST + (c.lod === LOD.Detail ? HYST : 0)) want = LOD.Detail;
      else if (dist < FILL_PROXY_DIST + (c.lod !== LOD.Hidden ? HYST : 0)) want = LOD.Proxy;
      if (want === LOD.Detail) {
        // all models of the chunk must be ready, else it shows its boxes for now
        let ready = true;
        for (const k of c.keys) if (!this.templates.has(k)) { ready = false; this.wanted.add(k + '|' + dist.toFixed(0).padStart(6, '0')); }
        if (!ready) want = LOD.Proxy;
      }
      if (want !== c.lod) order.push({ c, dist, want });
    }
    // nearest first
    if (order.length > 1) order.sort((a, b) => a.dist - b.dist);
    let switches = 0;
    for (const o of order) {
      if (switches >= MAX_CHUNK_SWITCHES_PER_FRAME) break;
      this.setLod(o.c, o.want);
      switches++;
    }
    this.flush();
    // warm templates: nearest chunk first, limited ms per frame
    if (this.wanted.size) {
      const list = [...this.wanted].sort((a, b) => a.split('|')[1]!.localeCompare(b.split('|')[1]!));
      const t0 = performance.now();
      for (const entry of list) {
        const key = entry.split('|')[0]!;
        if (this.templates.has(key)) continue;
        this.template(key, true);
        if (performance.now() - t0 > WARM_BUDGET_MS) break;
      }
    }
  }

  dispose(): void {
    this.d.root.remove(this.holder);
    for (const c of this.chunks) c.proxy?.dispose();
    for (const t of this.templates.values()) {
      for (const im of t.inst) im.dispose();
      t.built.dispose();
    }
    this.plinthInst?.dispose();
    this.proxyGeo.dispose();
    this.proxyMat.dispose();
    this.plinthGeo.dispose();
    this.plinthMat.dispose();
    this.templates.clear();
    this.chunks = [];
  }
}
