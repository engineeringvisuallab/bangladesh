import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import type { Ctx } from './ctx';
import { PAD } from '../layout';

function quad(g: THREE.Group, mat: THREE.Material, a: number[], b: number[], c: number[], d: number[]): void {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Outside the fence: grass, the river with its banks (west) and trees. Not a tour stop. */
export function buildEnvironment({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'environment';
  m.grass.side = THREE.DoubleSide; // quads are lit from both sides, winding does not matter
  m.soil.side = THREE.DoubleSide;
  const y = -0.05;
  const Z = 420;
  const xs = [PAD.minX, -182, -248, -262]; // bank top, bed start, bed end, far bank top
  const bed = -4;
  // ground around the pad (counter-clockwise seen from above => normal up)
  quad(g, m.grass, [PAD.minX, y, -Z], [PAD.minX, y, PAD.minZ], [PAD.maxX, y, PAD.minZ], [PAD.maxX, y, -Z]);
  quad(g, m.grass, [PAD.minX, y, PAD.maxZ], [PAD.minX, y, Z], [PAD.maxX, y, Z], [PAD.maxX, y, PAD.maxZ]);
  quad(g, m.grass, [PAD.maxX, y, -Z], [PAD.maxX, y, Z], [520, y, Z], [520, y, -Z]);
  // river: near slope, bed, far slope, far bank
  quad(g, m.soil, [xs[0], y, -Z], [xs[1], bed, -Z], [xs[1], bed, Z], [xs[0], y, Z]);
  quad(g, m.soil, [xs[1], bed, -Z], [xs[2], bed, -Z], [xs[2], bed, Z], [xs[1], bed, Z]);
  quad(g, m.soil, [xs[2], bed, -Z], [xs[3], y, -Z], [xs[3], y, Z], [xs[2], bed, Z]);
  quad(g, m.grass, [xs[3], y, -Z], [-520, y, -Z], [-520, y, Z], [xs[3], y, Z]);
  // river water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(xs[2] - xs[1] + 8, Z * 2), m.riverWater);
  water.rotation.x = -Math.PI / 2;
  water.position.set((xs[1] + xs[2]) / 2, -1.5, 0);
  g.add(water);

  // trees (instanced), kept away from the river and the pad
  const rand = rng(7);
  const n = 160;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6), m.trunk, n);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 6.5, 8), m.foliage, n);
  const dummy = new THREE.Object3D();
  let i = 0;
  while (i < n) {
    const x = -150 + rand() * 520;
    const z = -400 + rand() * 800;
    const insidePad = x > PAD.minX - 6 && x < PAD.maxX + 8 && z > PAD.minZ - 8 && z < PAD.maxZ + 8;
    if (insidePad || x < PAD.minX - 2 || (x > PAD.maxX && x < PAD.maxX + 14)) continue;
    const s = 0.8 + rand() * 0.7;
    dummy.position.set(x, 1.25 * s, z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2.5 * s + 3.2 * s, z);
    dummy.updateMatrix();
    crown.setMatrixAt(i, dummy.matrix);
    i++;
  }
  g.add(trunk, crown);
  return { id: 'environment', nameBn: 'River & Surroundings', group: g };
}
