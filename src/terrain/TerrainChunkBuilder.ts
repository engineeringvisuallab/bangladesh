import * as THREE from 'three';
import { Config } from '../core/Config';
import type { ChunkResult } from '../workers/messages';
import { buildIndices } from './TerrainMeshData';
import type { TerrainMaterials } from './TerrainMaterial';

export interface BuiltChunk {
  group: THREE.Group;
  mesh: THREE.Mesh;
  /** Present while the chunk is fading in. */
  fade: { value: number } | null;
  fadeMaterial: THREE.Material | null;
}

const zeroMasks = new Map<number, Float32Array>();

/** Turns worker output into a three.js mesh. Index buffers are shared per LOD (same arrays, separate GPU buffers). */
export class TerrainChunkBuilder {
  constructor(private materials: TerrainMaterials) {}

  build(data: ChunkResult, fadeIn: boolean): BuiltChunk {
    const S = Config.world.chunkSize;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    // Road coverage (STAGE 6). Chunks without roads share one all-zero array per vertex count.
    const vtotal = data.positions.length / 3;
    let mask = data.roadMask;
    if (!mask) {
      mask = zeroMasks.get(vtotal) ?? new Float32Array(vtotal * 2);
      zeroMasks.set(vtotal, mask);
    }
    geo.setAttribute('aRoad', new THREE.BufferAttribute(mask, 2));
    geo.setIndex(new THREE.BufferAttribute(data.holeIndices ?? buildIndices(data.vertsPerSide), 1));

    // Bounds are known from the worker, no need to scan the vertices.
    const box = new THREE.Box3(new THREE.Vector3(0, data.minHeight, 0), new THREE.Vector3(S, data.maxHeight, S));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());

    let material: THREE.Material;
    let fade: { value: number } | null = null;
    let fadeMaterial: THREE.Material | null = null;
    if (fadeIn) {
      const f = this.materials.createFading(data.lod);
      material = f.material;
      fade = f.fade;
      fadeMaterial = f.material;
    } else {
      material = this.materials.getShared(data.lod);
    }

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `terrain ${data.cx},${data.cz} LOD${data.lod}`;
    // Shadows only matter near the player (the shadow map covers ~350 m).
    mesh.castShadow = data.lod <= 1;
    mesh.receiveShadow = data.lod <= 1;
    mesh.matrixAutoUpdate = false;

    const group = new THREE.Group();
    group.add(mesh);
    return { group, mesh, fade, fadeMaterial };
  }

  /** Swap the fading material for the shared one once fully visible. */
  finishFade(mesh: THREE.Mesh, lod: number, fadeMaterial: THREE.Material): void {
    mesh.material = this.materials.getShared(lod);
    this.materials.disposeFading(fadeMaterial);
  }

  disposeFading(material: THREE.Material): void {
    this.materials.disposeFading(material);
  }
}
