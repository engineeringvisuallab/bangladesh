import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import type { Ctx } from './ctx';
import { PAD } from '../layout';

function quad(g: THREE.Group, mat: THREE.Material, a: number[], b: number[], c: number[], d: number[]): void {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));
}
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Outside the fence: grass, the river with its banks (EAST side: the plant releases its water there) and trees. */
export function buildEnvironment({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'environment';
  m.grass.side = THREE.DoubleSide;
  m.soil.side = THREE.DoubleSide;
  const y = -0.05;
  const Z = 420;
  const xs = [PAD.maxX, 167, 230, 244];
  const bed = -4;
  quad(g, m.grass, [-520, y, -Z], [-520, y, Z], [PAD.minX, y, Z], [PAD.minX, y, -Z]);
  quad(g, m.grass, [PAD.minX, y, -Z], [PAD.minX, y, PAD.minZ], [PAD.maxX, y, PAD.minZ], [PAD.maxX, y, -Z]);
  quad(g, m.grass, [PAD.minX, y, PAD.maxZ], [PAD.minX, y, Z], [PAD.maxX, y, Z], [PAD.maxX, y, PAD.maxZ]);
  quad(g, m.soil, [xs[0], y, -Z], [xs[1], bed, -Z], [xs[1], bed, Z], [xs[0], y, Z]);
  quad(g, m.soil, [xs[1], bed, -Z], [xs[2], bed, -Z], [xs[2], bed, Z], [xs[1], bed, Z]);
  quad(g, m.soil, [xs[2], bed, -Z], [xs[3], y, -Z], [xs[3], y, Z], [xs[2], bed, Z]);
  quad(g, m.grass, [xs[3], y, -Z], [520, y, -Z], [520, y, Z], [xs[3], y, Z]);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(xs[2] - xs[1] + 8, Z * 2), m.riverWater);
  water.rotation.x = -Math.PI / 2;
  water.position.set((xs[1] + xs[2]) / 2, -1.5, 0);
  g.add(water);
  const rand = rng(11);
  const n = 150;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6), m.trunk, n);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 6.5, 8), m.foliage, n);
  const d = new THREE.Object3D();
  let i = 0;
  while (i < n) {
    const x = -400 + rand() * 540;
    const z = -400 + rand() * 800;
    const inside = x > PAD.minX - 6 && x < PAD.maxX + 8 && z > PAD.minZ - 8 && z < PAD.maxZ + 8;
    if (inside || x > PAD.maxX - 2) continue;
    const s = 0.8 + rand() * 0.7;
    d.position.set(x, 1.25 * s, z);
    d.scale.set(s, s, s);
    d.updateMatrix();
    trunk.setMatrixAt(i, d.matrix);
    d.position.set(x, 5.7 * s, z);
    d.updateMatrix();
    crown.setMatrixAt(i, d.matrix);
    i++;
  }
  g.add(trunk, crown);
  return { id: 'environment', nameBn: 'River & Surroundings', group: g };
}
