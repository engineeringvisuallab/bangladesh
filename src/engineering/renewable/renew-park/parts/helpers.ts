import * as THREE from 'three';
import { flow, type AnimSet } from '../../../core/anim';
import { pipe, V } from '../../../core/prims';
import { makeSign } from '../../../core/Labels';

type G = THREE.Object3D;

/** A mesh placed by its centre (unlike prims.box, which places by the bottom). */
export function mesh(parent: G, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
export const bx = (parent: G, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
/** vertical cylinder by its CENTRE */
export const cy = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
/** cylinder along x by its centre */
export const cx = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => {
  const m = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
};
/** cone, apex up, by its centre */
export const cone = (parent: G, r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 20): THREE.Mesh => mesh(parent, new THREE.ConeGeometry(r, h, seg), mat, x, y, z);

/** A pipe / cable (list of [x, y, z] points) with dots travelling along it in the flow direction. Returns the dots (so a part can hide them, e.g. no solar current at night). */
export function fpipe(parent: G, anim: AnimSet, pts: [number, number, number][], r: number, mat: THREE.Material, color: number, speed = 3, spacing = 1.5): THREE.InstancedMesh {
  const v = pts.map((p) => V(p[0], p[1], p[2]));
  pipe(parent, v, r, mat);
  return flow(anim, parent, v, { color, speed, spacing, size: Math.min(0.32, r * 0.5 + 0.07) });
}

/** Pipe-rack legs (solid posts) and a cross beam every `step` metres along a straight run at height y. */
export function rack(parent: G, mat: THREE.Material, x1: number, z1: number, x2: number, z2: number, y: number, width: number, step = 14): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / step));
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  for (let i = 0; i <= n; i++) {
    const px = x1 + ((x2 - x1) * i) / n;
    const pz = z1 + ((z2 - z1) * i) / n;
    if (alongX) {
      for (const s of [-1, 1]) bx(parent, 0.5, y, 0.5, mat, px, y / 2, pz + (s * width) / 2);
      bx(parent, 0.35, 0.35, width + 0.8, mat, px, y - 0.2, pz);
    } else {
      for (const s of [-1, 1]) bx(parent, 0.5, y, 0.5, mat, px + (s * width) / 2, y / 2, pz);
      bx(parent, width + 0.8, 0.35, 0.35, mat, px, y - 0.2, pz);
    }
  }
}

/** A small ground sign board on two posts, facing south (+z): names a unit for people walking past. */
export function board(parent: G, mat: THREE.Material, text: string, x: number, z: number, w = 6): void {
  const s = makeSign(text, w, 1.0);
  s.position.set(x, 1.7, z);
  parent.add(s);
  for (const dx of [-w / 2 + 0.3, w / 2 - 0.3]) bx(parent, 0.18, 2.2, 0.18, mat, x + dx, 1.1, z - 0.12);
}
