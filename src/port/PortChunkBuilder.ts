import * as THREE from 'three';
import type { PortMeshData } from './PortMesh';

/** One shared, lit, vertex-coloured material for all port meshes (quays, cranes, ships, tanks, containers ...). */
export class PortMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'port';
  }
}

/** Turns the worker's port geometry into a mesh (chunk-local coordinates, parented to the chunk group). */
export class PortChunkBuilder {
  constructor(private material: PortMaterial) {}

  build(data: PortMeshData): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'port';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
