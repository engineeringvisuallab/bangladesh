import * as THREE from 'three';
import type { RoadMeshData } from './RoadMesh';
import type { RoadMaterial } from './RoadMaterial';

/** Turns the worker's road ribbon into a mesh (chunk-local coordinates, parented to the chunk group). */
export class RoadChunkBuilder {
  constructor(private material: RoadMaterial) {}

  build(data: RoadMeshData): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('aRd', new THREE.BufferAttribute(data.info, 4));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'road';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
