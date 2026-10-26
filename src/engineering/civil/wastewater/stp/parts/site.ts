import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, lightPole, road } from '../../../../core/prims';
import type { Ctx } from './ctx';
import { L, SITE } from '../layout';

/** Boundary fence, internal roads and street lights. */
export function buildSiteWorks({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'site';
  const { minX, maxX, minZ, maxZ } = SITE;
  const gx = L.gate.x;
  const segs: number[][] = [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, gx + 5, maxZ],
    [gx - 5, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ];
  const posts: THREE.Vector3[] = [];
  for (const [x1, z1, x2, z2] of segs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const alongX = Math.abs(x2 - x1) > 0;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    box(g, alongX ? len : 0.05, 2.2, alongX ? 0.05 : len, m.fenceMesh, cx, 0, cz);
    box(g, alongX ? len : 0.08, 0.08, alongX ? 0.08 : len, m.steel, cx, 2.2, cz);
    const n = Math.round(len / 4);
    for (let i = 0; i <= n; i++) posts.push(new THREE.Vector3(x1 + ((x2 - x1) * i) / n, 1.3, z1 + ((z2 - z1) * i) / n));
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), m.steel, posts.length);
  const d = new THREE.Object3D();
  posts.forEach((p, i) => {
    d.position.copy(p);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  g.add(inst);
  road(g, m.asphalt, gx, 26, gx, maxZ, 8);
  road(g, m.asphalt, -140, 26, 140, 26, 7);
  road(g, m.asphalt, -140, -90, -140, 26, 7);
  road(g, m.asphalt, -140, -90, 140, -90, 7);
  road(g, m.asphalt, 140, -90, 140, 26, 7);
  for (let x = -130; x <= 130; x += 30) lightPole(g, m, x, 22, 1);
  for (let z = 36; z <= 90; z += 27) lightPole(g, m, gx + 5.5, z, 1);
  for (let x = -120; x <= 130; x += 40) lightPole(g, m, x, -94.5, 1);
  return { id: 'site', nameBn: 'Boundary Fence & Internal Roads', group: g };
}
