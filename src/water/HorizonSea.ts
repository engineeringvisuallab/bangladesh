import * as THREE from 'three';
import { Config } from '../core/Config';
import type { WaterMaterial } from './WaterMaterial';

/**
 * Deep sea beyond the area covered by chunks: a big flat ring at y = 0 with a square hole where the
 * terrain chunks (and their own water meshes) are. Shares the water shader, so it matches the near sea.
 */
export class HorizonSea {
  readonly mesh: THREE.Mesh;

  constructor(material: WaterMaterial) {
    const hole = Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize;
    const far = 40_000;
    const quads: [number, number, number, number][] = [
      [-far, -far, far, -hole], // north
      [-far, hole, far, far], // south
      [-far, -hole, -hole, hole], // west
      [hole, -hole, far, hole], // east
    ];
    const pos: number[] = [];
    const idx: number[] = [];
    for (const [x0, z0, x1, z1] of quads) {
      const b = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const n = pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Array(n).fill(100), 1));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2));
    geo.setAttribute('aStep', new THREE.Float32BufferAttribute(new Array(n).fill(100000), 1)); // flat mesh: the waves only shape the shading here
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, material.material);
    this.mesh.name = 'HorizonSea';
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
