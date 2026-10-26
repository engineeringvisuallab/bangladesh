import * as THREE from 'three';
import type { RockAssets } from './RockAssets';
import type { TreeAssets } from './TreeAssets';
import { ROCK_KIND_COUNT, TREE_KIND_COUNT, TREE_STRIDE, type TreeChunkData } from './TreeTypes';

const dummy = new THREE.Object3D();

/** The instanced meshes built for a chunk's tree data (index = tree kind), found again through the data array (TreeDestruction). */
export const treeMeshes = new WeakMap<TreeChunkData, (THREE.InstancedMesh | null)[]>();
const color = new THREE.Color();

/** Turns the worker's tree and rock lists into instanced meshes (one per kind), parented to the chunk group (chunk-local coordinates). */
export class TreeChunkBuilder {
  constructor(
    private assets: TreeAssets,
    private rockAssets: RockAssets,
  ) {}

  /** `lod` 0 = detailed models + shadows, higher = simple models. Returns null when the chunk has no trees or rocks. */
  build(trees: TreeChunkData | null, rocks: TreeChunkData | null, lod: number): THREE.Group | null {
    let group: THREE.Group | null = null;
    const detail = lod === 0 ? 0 : 1;
    if (rocks) {
      for (let k = 0; k < ROCK_KIND_COUNT; k++) {
        const mesh = this.instanced(rocks[k], this.rockAssets.geometries[k][detail], this.rockAssets.material, `rocks kind${k}`, lod, 1, 1, 1);
        if (mesh) (group ??= this.makeGroup()).add(mesh);
      }
    }
    if (trees) {
      const meshes: (THREE.InstancedMesh | null)[] = [];
      for (let k = 0; k < TREE_KIND_COUNT; k++) {
        const mesh = this.instanced(trees[k], this.assets.geometries[k][detail], this.assets.material, `trees kind${k}`, lod, 1, 1.01, 0.96, true);
        meshes.push(mesh);
        if (mesh) (group ??= this.makeGroup()).add(mesh);
      }
      treeMeshes.set(trees, meshes);
    }
    return group;
  }

  /** One InstancedMesh for `data` (TREE_STRIDE floats per instance: x y z scale yaw tint). Null when there are none. */
  private instanced(
    data: Float32Array | undefined,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
    lod: number,
    tr: number,
    tg: number,
    tb: number,
    hue = false,
  ): THREE.InstancedMesh | null {
    const count = data ? data.length / TREE_STRIDE : 0;
    if (!data || count === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    for (let i = 0; i < count; i++) {
      const o = i * TREE_STRIDE;
      dummy.position.set(data[o], data[o + 1], data[o + 2]);
      dummy.rotation.set(0, data[o + 4], 0);
      dummy.scale.setScalar(data[o + 3]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = data[o + 5];
      if (hue) {
        // every tree its own shade: the brighter ones lean yellow-green, the darker ones blue-green
        const u = Math.min(1, Math.max(0, (t - 0.82) / 0.32));
        mesh.setColorAt(i, color.setRGB(t * (0.9 + 0.2 * u), t * (1.03 - 0.05 * u), t * (0.96 - 0.1 * u)));
      } else mesh.setColorAt(i, color.setRGB(t * tr, t * tg, t * tb));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = lod === 0;
    mesh.receiveShadow = lod === 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private makeGroup(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'vegetation';
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    return g;
  }

  /** Frees the per-chunk instance buffers. The shared geometries and materials stay. */
  dispose(group: THREE.Group): void {
    for (const c of group.children) (c as THREE.InstancedMesh).dispose();
  }
}
