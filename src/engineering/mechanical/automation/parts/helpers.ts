import * as THREE from 'three';
import type { AnimSet } from '../../../core/anim';

type G = THREE.Object3D;

/** A mesh placed by its centre (unlike prims.box, which places by the bottom). */
export function mesh(parent: G, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
export const bx = (parent: G, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
/** cylinder along z (the axis of most rotating machine parts here, so they face a viewer on the road) */
export const cz = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => {
  const m = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
};
/** vertical cylinder by its centre */
export const cy = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
/** cylinder along x by its centre */
export const cx = (parent: G, r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh => {
  const m = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
};

/** Spur gear (teeth built from the module): axis = z. Pitch radius = module * N / 2. */
export function gearGeometry(n: number, module: number, thick: number): THREE.ExtrudeGeometry {
  const rp = (module * n) / 2;
  const rt = rp + module;
  const rr = rp - 1.15 * module;
  const p = (Math.PI * 2) / n;
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = i * p;
    const pts: [number, number][] = [[rr, a - 0.34 * p], [rt, a - 0.16 * p], [rt, a + 0.16 * p], [rr, a + 0.34 * p]];
    pts.forEach(([r, ang], k) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rr * 0.28, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Update a bar so it spans from a to b in the x-y plane (bar geometry: vertical box of unit height, scaled). */
export function span(bar: THREE.Object3D, ax: number, ay: number, bx_: number, by: number): void {
  const dx = bx_ - ax;
  const dy = by - ay;
  bar.position.x = (ax + bx_) / 2;
  bar.position.y = (ay + by) / 2;
  bar.rotation.z = Math.atan2(-dx, dy);
  bar.scale.y = Math.hypot(dx, dy);
}
/** Bar of unit length along y (so `span` can stretch it). */
export const bar = (parent: G, thick: number, depth: number, mat: THREE.Material, z = 0): THREE.Mesh => bx(parent, thick, 1, depth, mat, 0, 0, z);

export const disposeLater = (a: AnimSet, ...items: { dispose(): void }[]): void => {
  a.disposables.push(...items);
};
