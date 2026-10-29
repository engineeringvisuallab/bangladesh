import * as THREE from 'three';
import { TILE_SIZE_M, tileKey, tileOrigin, type Region, type TileIndex, type WorldFrame } from '../geo';
import type { Heightfield } from './Heightfield';

/** Vertices per tile side - 1. 25 -> one vertex every 20 m. Raise it when a real height-map is added. */
const SEGMENTS = 25;
/** Tiles closer than this (metres, to the nearest tile edge) are built; farther than UNLOAD are dropped. */
const LOAD_RADIUS = 3200;
const UNLOAD_RADIUS = 3800;
/** Tile meshes created per frame, so flying never stutters. */
const BUILDS_PER_FRAME = 2;

interface TileInfo {
  key: string;
  tile: TileIndex;
  region: Region;
  /** Scene position of the tile's north-west corner. */
  x0: number;
  z0: number;
}

/**
 * Builds the ground as 500 m tiles on the GLOBAL tile grid (see geo/Tiles.ts), only near the camera.
 * Every region (city) contributes its own tiles; adding a city never touches another city's tiles.
 */
export class TerrainStreamer {
  readonly group = new THREE.Group();
  private readonly infos = new Map<string, TileInfo>();
  private readonly loaded = new Map<string, THREE.Mesh>();
  private readonly satellite = new Map<string, THREE.MeshBasicMaterial>();
  private readonly plain = new THREE.MeshLambertMaterial({ color: 0x86a45c });
  private useSatellite = true;

  constructor(
    private readonly frame: WorldFrame,
    regions: readonly Region[],
    private readonly heightOf: (region: Region) => Heightfield,
  ) {
    this.group.name = 'Terrain';
    for (const region of regions) {
      this.satellite.set(region.id, new THREE.MeshBasicMaterial({ color: 0x86a45c }));
      for (const tile of region.tiles()) {
        const key = tileKey(tile);
        if (this.infos.has(key)) continue; // a tile shared by two regions belongs to the first one
        const org = tileOrigin(tile);
        this.infos.set(key, { key, tile, region, x0: frame.toX(org.e), z0: frame.toZ(org.n + TILE_SIZE_M) });
      }
    }
  }

  get tileCount(): number {
    return this.infos.size;
  }
  get loadedCount(): number {
    return this.loaded.size;
  }

  /** Give a region its reference image as ground colour. */
  setReferenceTexture(regionId: string, texture: THREE.Texture): void {
    const mat = this.satellite.get(regionId);
    if (!mat) return;
    mat.map = texture;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  setSatellite(on: boolean): void {
    this.useSatellite = on;
    for (const [key, mesh] of this.loaded) mesh.material = this.materialFor(this.infos.get(key)!);
  }
  get satelliteOn(): boolean {
    return this.useSatellite;
  }

  private materialFor(info: TileInfo): THREE.Material {
    return this.useSatellite ? (this.satellite.get(info.region.id) ?? this.plain) : this.plain;
  }

  /** Call every frame with the camera position in scene coordinates. */
  update(camX: number, camZ: number): void {
    const want: { info: TileInfo; d: number }[] = [];
    for (const info of this.infos.values()) {
      const d = distanceToTile(camX, camZ, info);
      if (d <= LOAD_RADIUS) {
        if (!this.loaded.has(info.key)) want.push({ info, d });
      } else if (d > UNLOAD_RADIUS && this.loaded.has(info.key)) {
        this.drop(info.key);
      }
    }
    want.sort((a, b) => a.d - b.d);
    for (let i = 0; i < want.length && i < BUILDS_PER_FRAME; i++) this.build(want[i].info);
  }

  private drop(key: string): void {
    const mesh = this.loaded.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.loaded.delete(key);
  }

  private build(info: TileInfo): void {
    const hf = this.heightOf(info.region);
    const gr = info.region.georef;
    const n = SEGMENTS + 1;
    const step = TILE_SIZE_M / SEGMENTS;
    const pos = new Float32Array(n * n * 3);
    const nor = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const px = { px: 0, py: 0 };
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const k = iz * n + ix;
        const lx = ix * step;
        const lz = iz * step;
        const x = info.x0 + lx;
        const z = info.z0 + lz;
        // Positions are relative to the tile's own corner (mesh.position) so float32 stays precise far from the origin.
        pos[k * 3] = lx;
        pos[k * 3 + 1] = hf.heightAt(x, z);
        pos[k * 3 + 2] = lz;
        const dhx = (hf.heightAt(x + 1, z) - hf.heightAt(x - 1, z)) / 2;
        const dhz = (hf.heightAt(x, z + 1) - hf.heightAt(x, z - 1)) / 2;
        const inv = 1 / Math.hypot(dhx, 1, dhz);
        nor[k * 3] = -dhx * inv;
        nor[k * 3 + 1] = inv;
        nor[k * 3 + 2] = -dhz * inv;
        gr.enToPixel(this.frame.toE(x), this.frame.toN(z), px);
        uv[k * 2] = px.px / gr.width;
        uv[k * 2 + 1] = 1 - px.py / gr.height; // image row 0 is the top; texture v = 1 is the top
      }
    }
    // Counter-clockwise seen from above (+y): north row first (z grows southwards).
    const idx = new Uint32Array(SEGMENTS * SEGMENTS * 6);
    let w = 0;
    for (let iz = 0; iz < SEGMENTS; iz++) {
      for (let ix = 0; ix < SEGMENTS; ix++) {
        const a = iz * n + ix;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        idx[w++] = a;
        idx[w++] = c;
        idx[w++] = b;
        idx[w++] = b;
        idx[w++] = c;
        idx[w++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.materialFor(info));
    mesh.position.set(info.x0, 0, info.z0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = `tile ${info.key}`;
    this.group.add(mesh);
    this.loaded.set(info.key, mesh);
  }

  dispose(): void {
    for (const key of [...this.loaded.keys()]) this.drop(key);
    for (const m of this.satellite.values()) m.dispose();
    this.plain.dispose();
  }
}

function distanceToTile(px: number, pz: number, t: TileInfo): number {
  const dx = Math.max(t.x0 - px, 0, px - (t.x0 + TILE_SIZE_M));
  const dz = Math.max(t.z0 - pz, 0, pz - (t.z0 + TILE_SIZE_M));
  return Math.hypot(dx, dz);
}
