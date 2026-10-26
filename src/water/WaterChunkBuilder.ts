import * as THREE from 'three';
import { Config } from '../core/Config';
import type { WaterMeshData } from '../terrain/TerrainMeshData';
import type { WaterMaterial } from './WaterMaterial';

/** Builds the water mesh of one chunk (rivers, lakes and the sea near the coast). */
export class WaterChunkBuilder {
  constructor(private material: WaterMaterial) {}

  build(w: WaterMeshData): THREE.Mesh {
    const S = Config.world.chunkSize;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(w.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(w.normals, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(w.depth, 1));
    geo.setAttribute('aFlow', new THREE.BufferAttribute(w.flow, 2));
    // Grid spacing of this chunk (LOD): the shader only lets waves move the mesh that the grid can resolve.
    const step = w.positions.length > 3 ? Math.abs(w.positions[3] - w.positions[0]) || 4 : 4;
    geo.setAttribute('aStep', new THREE.BufferAttribute(new Float32Array(w.depth.length).fill(step), 1));
    geo.setIndex(new THREE.BufferAttribute(w.indices, 1));
    const box = new THREE.Box3(new THREE.Vector3(0, w.minY - 2.5, 0), new THREE.Vector3(S, w.maxY + 2.5, S));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());

    const mesh = new THREE.Mesh(geo, this.material.material);
    mesh.name = 'water';
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
