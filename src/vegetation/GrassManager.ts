import * as THREE from 'three';
import { Config } from '../core/Config';
import type { GrassResult } from '../workers/messages';
import type { GrassAssets } from './GrassAssets';
import { GRASS_STRIDE, GrassType } from './TreeTypes';

const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
/** Tiles exist a little beyond the playable area, like the terrain chunk margin rings. */
const LIMIT = HALF + Config.world.chunkSize * Config.world.chunkMargin;

interface Tile {
  key: string;
  tx: number;
  tz: number;
  /** distance ring (index into Config.vegetation.grass.lods) the tile was built for */
  lod: number;
  /** one InstancedMesh per grass / flower type that occurs in the tile (null = none of that type) */
  meshes: (THREE.InstancedMesh | null)[];
}

export interface GrassSource {
  requestGrass(tx: number, tz: number, stride: number): Promise<GrassResult>;
}

/** Ring of a tile `d` metres away. `current` = the ring it has now (hysteresis: a tile changes ring only after passing the border by a margin, no flicker). */
function grassLod(d: number, current?: number): number {
  const L = G.lods;
  for (let i = 0; i < L.length; i++) {
    let limit = L[i].to;
    if (current !== undefined) limit *= current > i ? 1 - G.lodHysteresis : 1 + G.lodHysteresis;
    if (d < limit) return i;
  }
  return L.length - 1;
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const GREEN: [number, number, number] = [0.25, 0.42, 0.12];
const DRY: [number, number, number] = [0.46, 0.42, 0.2];
const YELLOW: [number, number, number] = [0.42, 0.5, 0.15];

/** Smooth 2D value noise in 0..1 (integer-lattice hash, smoothstep blend): decides where the flower patches are. Deterministic, no state. */
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number): number => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Grass around the player (STAGE 7). Tiles of `grass.tile` metres within `grass.radius` of the player are requested from
 * the workers, built as one InstancedMesh each and removed again beyond `grass.keep`. Tiles are children of the world root
 * at absolute world positions (like chunks), so the floating origin moves them automatically. No grass is made while the
 * camera is far above the ground (free-fly / helicopter).
 */
export class GrassManager {
  private tiles = new Map<string, Tile>();
  /** tiles asked from the workers (key -> ring asked for); a tile counts as pending until its mesh exists, so it is never requested twice */
  private pending = new Map<string, number>();
  /** tiles in range (key -> the ring they should have now) */
  private wanted = new Map<string, number>();
  private ready: { key: string; tx: number; tz: number; lod: number; data: Float32Array }[] = [];
  private timer = 1;
  private disposed = false;

  constructor(
    private root: THREE.Object3D,
    private source: GrassSource,
    private assets: GrassAssets,
  ) {}

  get tileCount(): number {
    return this.tiles.size;
  }
  /** Number of InstancedMeshes in the scene (one per grass / flower type per tile). */
  get meshCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) for (const m of t.meshes) if (m) n++;
    return n;
  }
  get tuftCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) for (const m of t.meshes) if (m) n += m.count;
    return n;
  }

  /** Call every frame. `groundAt` is only asked when the tile list is re-evaluated (5 Hz). */
  update(dt: number, px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.timer += dt;
    if (this.timer >= 0.2) {
      this.timer = 0;
      this.evaluate(px, py, pz, groundAt);
    }
    // tile meshes are built within a small time budget per frame (at least one), so a long meadow fills in fast when driving
    const t0 = performance.now();
    do {
      const r = this.ready.shift();
      if (!r) break;
      this.pending.delete(r.key); // a tile counts as pending until its mesh exists, so it is never requested twice
      // a tile whose ring changed while the worker was busy is dropped (it is asked again with the right ring)
      if (this.wanted.get(r.key) === r.lod && this.tiles.get(r.key)?.lod !== r.lod) this.install(r.key, r.tx, r.tz, r.lod, r.data);
    } while (this.ready.length > 0 && performance.now() - t0 < 4);
  }

  private evaluate(px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.wanted.clear();
    const high = py - groundAt(px, pz) > G.maxAboveGround;
    if (high) {
      for (const t of [...this.tiles.values()]) this.remove(t);
      for (const r of this.ready) this.pending.delete(r.key);
      this.ready.length = 0;
      return;
    }

    const T = G.tile;
    const i0 = Math.floor((px - G.radius + HALF) / T);
    const i1 = Math.floor((px + G.radius + HALF) / T);
    const j0 = Math.floor((pz - G.radius + HALF) / T);
    const j1 = Math.floor((pz + G.radius + HALF) / T);
    const need: { key: string; tx: number; tz: number; d: number; lod: number }[] = [];
    for (let tz = j0; tz <= j1; tz++) {
      for (let tx = i0; tx <= i1; tx++) {
        const x0 = tx * T - HALF;
        const z0 = tz * T - HALF;
        if (x0 < -LIMIT || z0 < -LIMIT || x0 + T > LIMIT || z0 + T > LIMIT) continue;
        const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
        if (d > G.radius) continue;
        const key = `${tx},${tz}`;
        const have = this.tiles.get(key);
        const lod = grassLod(d, have?.lod);
        this.wanted.set(key, lod);
        if (have?.lod !== lod && !this.pending.has(key)) need.push({ key, tx, tz, d, lod });
      }
    }
    need.sort((a, b) => a.d - b.d);
    for (const n of need) {
      if (this.pending.size >= G.maxInFlight) break;
      this.pending.set(n.key, n.lod);
      this.source.requestGrass(n.tx, n.tz, G.lods[n.lod].stride).then(
        (res) => {
          if (this.disposed) this.pending.delete(n.key);
          else this.ready.push({ key: n.key, tx: n.tx, tz: n.tz, lod: n.lod, data: res.data });
        },
        () => this.pending.delete(n.key),
      );
    }

    // remove tiles that are clearly out of range (keep > radius = no flicker)
    for (const t of [...this.tiles.values()]) {
      const x0 = t.tx * T - HALF;
      const z0 = t.tz * T - HALF;
      const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
      if (d > G.keep) this.remove(t);
    }
  }

  private install(key: string, tx: number, tz: number, lod: number, data: Float32Array): void {
    const count = data.length / GRASS_STRIDE;
    const ring = G.lods[lod];
    const geoms = this.assets.lodGeometries[lod];
    const old = this.tiles.get(key); // the same tile in another ring: swapped in the same frame, so there is never a gap
    if (count === 0) {
      // keep an empty marker so the tile is not requested again
      if (old) this.remove(old);
      this.tiles.set(key, { key, tx, tz, lod, meshes: [] });
      return;
    }
    const ox = tx * G.tile - HALF;
    const oz = tz * G.tile - HALF;
    // 1. choose the type of every tuft (grass kinds by a hash, wildflowers inside meadow patches)
    const types = new Uint8Array(count);
    const counts = new Array<number>(geoms.length).fill(0);
    for (let i = 0; i < count; i++) {
      const o = i * GRASS_STRIDE;
      const wx = ox + data[o];
      const wz = oz + data[o + 2];
      const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
      const h1 = hh - Math.floor(hh);
      const h2 = hh * 7.31 - Math.floor(hh * 7.31);
      const h3 = hh * 31.7 - Math.floor(hh * 31.7);
      const dry = data[o + 6];
      let type: number;
      // flower patches (value noise, ~25 m) with one dominant species per patch (another noise, ~60 m); never on dry high ground
      const patch = vnoise(wx / 22, wz / 22);
      const inPatch = patch > 0.64;
      const flowerChance = (inPatch ? G.flowerInPatch * Math.min(1, (patch - 0.64) / 0.12 + 0.35) : G.flowerScatter) * (1 - dry);
      if (lod === 0 && h2 < flowerChance) {
        const sp = vnoise(wx / 55 + 40, wz / 55 - 17);
        const dominant = sp < 0.2 ? GrassType.daisy : sp < 0.38 ? GrassType.buttercup : sp < 0.52 ? GrassType.lavender : sp < 0.68 ? GrassType.poppy : sp < 0.84 ? GrassType.cornflower : GrassType.clover;
        // 70 % the dominant species of the patch, 30 % a random other flower so the meadow is mixed, not a single colour
        type = h3 < 0.7 ? dominant : GrassType.daisy + Math.floor(((h3 - 0.7) / 0.3) * 6) % 6;
      } else {
        type = h1 < 0.32 ? GrassType.wild : h1 < 0.62 ? GrassType.lawn : h1 < 0.88 ? GrassType.clump : GrassType.seed;
        if (dry > 0.5 && type === GrassType.lawn) type = GrassType.wild;
      }
      types[i] = type;
      counts[type]++;
    }
    // 2. one InstancedMesh per type
    const meshes: (THREE.InstancedMesh | null)[] = [];
    const next = new Array<number>(geoms.length).fill(0);
    for (let t = 0; t < geoms.length; t++) {
      if (counts[t] === 0) {
        meshes.push(null);
        continue;
      }
      const mesh = new THREE.InstancedMesh(geoms[t], this.assets.material, counts[t]);
      mesh.name = `grass ${key} type${t}`;
      meshes.push(mesh);
    }
    for (let i = 0; i < count; i++) {
      const o = i * GRASS_STRIDE;
      const type = types[i];
      const mesh = meshes[type] as THREE.InstancedMesh;
      const slot = next[type]++;
      const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
      const h2 = hh * 7.31 - Math.floor(hh * 7.31);
      const sc = data[o + 3];
      dummy.position.set(data[o], data[o + 1], data[o + 2]);
      dummy.rotation.set(0, data[o + 4], 0);
      // size variation inside a type (each type already has its own shape / height)
      const grow = 0.8 + 0.5 * h2;
      const wide = type === GrassType.lawn ? 1.1 : type === GrassType.wild ? 0.95 : 1;
      // width: far rings have fewer tufts, each a bit wider. height: Config.grass.heightScale, width: Config.grass.widthScale (both 2x bigger than step 3)
      const w = sc * wide * ring.size * G.widthScale;
      dummy.scale.set(w, sc * grow * G.heightScale, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      const dry = data[o + 6];
      const t = data[o + 5] * (0.9 + h2 * 0.2); // brightness varies tuft to tuft
      // brighter tufts lean yellow-green (like sun-lit, drier grass), darker ones deep green
      const u = Math.min(1, Math.max(0, (t - 0.85) / 0.3)) * 0.55;
      color.setRGB(
        (GREEN[0] + (YELLOW[0] - GREEN[0]) * u + (DRY[0] - GREEN[0]) * dry) * t,
        (GREEN[1] + (YELLOW[1] - GREEN[1]) * u + (DRY[1] - GREEN[1]) * dry) * t,
        (GREEN[2] + (YELLOW[2] - GREEN[2]) * u + (DRY[2] - GREEN[2]) * dry) * t,
        THREE.SRGBColorSpace,
      );
      mesh.setColorAt(slot, color);
    }
    if (old) this.remove(old);
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.place(mesh, tx, tz);
    }
    this.tiles.set(key, { key, tx, tz, lod, meshes });
  }

  private place(mesh: THREE.InstancedMesh, tx: number, tz: number): void {
    mesh.position.set(tx * G.tile - HALF, 0, tz * G.tile - HALF);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.root.add(mesh);
  }

  private remove(t: Tile): void {
    for (const m of t.meshes) {
      if (!m) continue;
      this.root.remove(m);
      m.dispose(); // frees the per-tile instance buffers; the shared geometries / material stay
    }
    this.tiles.delete(t.key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [...this.tiles.values()]) this.remove(t);
    this.ready.length = 0;
    this.pending.clear();
  }
}
