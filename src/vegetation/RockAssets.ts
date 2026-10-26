import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2D } from '../world/Seed';
import { ROCK_KIND_COUNT, RockKind } from './TreeTypes';

/**
 * Rock models (built from code) + the shared rock material. Flat shaded, vertex colours (lighter on top faces).
 * Two kinds x two detail levels (0 = near, 1 = far), base at y = 0, radius ~1 m at scale 1.
 *   round: a lumpy boulder (squashed icosahedron), slab: a flat wide stone.
 */

/** Same rounded position -> same offset, so neighbouring faces stay connected after the lumps are applied. */
function lump(x: number, y: number, z: number, amount: number): number {
  const h = hash2D(Math.round(x * 997) ^ 0x1f3a, Math.round(y * 991), Math.round(z * 983));
  return 1 + ((h / 4294967296) - 0.5) * 2 * amount;
}

function rock(detail: number, sx: number, sy: number, sz: number, lumpy: number, base: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = lump(x, y, z, lumpy);
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  // the rock sits on the ground: lowest point at y = 0
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color(base);
  for (let i = 0; i < p.count; i += 3) {
    // one colour per face: lighter on faces that look up, a little random variation
    const up = Math.max(0, n.getY(i));
    const v = (hash2D(i * 7919, 13, 17) / 4294967296 - 0.5) * 0.12;
    const f = 0.78 + 0.3 * up + v;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = c.r * f;
      col[(i + k) * 3 + 1] = c.g * f;
      col[(i + k) * 3 + 2] = c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return mergeGeometries([g], false)!;
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material. */
export class RockAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor() {
    for (let k = 0; k < ROCK_KIND_COUNT; k++) this.geometries.push([]);
    this.geometries[RockKind.round] = [rock(1, 1.0, 0.72, 0.92, 0.22, 0x7b766d), rock(0, 1.0, 0.72, 0.92, 0.16, 0x7b766d)];
    this.geometries[RockKind.slab] = [rock(1, 1.5, 0.3, 1.15, 0.16, 0x86806f), rock(0, 1.5, 0.3, 1.15, 0.12, 0x86806f)];
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
  }
}
