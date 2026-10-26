import * as THREE from 'three';

/** A solid thing the player / cars must not walk through, in the infrastructure's local frame. */
export type SolidShape =
  | { kind: 'box'; c: [number, number, number]; q: [number, number, number, number]; h: [number, number, number] }
  | { kind: 'cyl'; c: [number, number, number]; r: number; hh: number };

/**
 * Collect collision shapes from the visual meshes (walls, tank walls, buildings, columns, big cylinders, fence panels).
 * Pipes, windows, doors, rails, water and other thin / small things are skipped on purpose.
 */
export function collectSolids(root: THREE.Object3D): SolidShape[] {
  root.updateWorldMatrix(true, true);
  const inv = root.matrixWorld.clone().invert();
  const out: SolidShape[] = [];
  const rel = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a.name === 'labels' || a.name === 'environment') return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    rel.decompose(p, q, s);
    up.set(0, 1, 0).applyQuaternion(q);
    const g = o.geometry;
    const mat = o.material as THREE.Material;
    if (g instanceof THREE.BoxGeometry) {
      if (up.y < 0.97) return;
      const w = g.parameters.width * s.x;
      const h = g.parameters.height * s.y;
      const d = g.parameters.depth * s.z;
      const thin = Math.min(w, d);
      const big = (h >= 0.9 && thin >= 0.2 && w * d >= 0.25) || (h >= 1.8 && Math.max(w, d) >= 3 && mat.transparent) || (w * d >= 20 && h >= 0.3 && thin >= 2);
      if (!big) return;
      out.push({ kind: 'box', c: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], h: [w / 2, h / 2, d / 2] });
    } else if (g instanceof THREE.CircleGeometry) {
      // round tank floors (water discs are transparent and are skipped)
      const r = g.parameters.radius * s.x;
      const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // CircleGeometry faces +z; the tank floors are turned face-up
      if (mat.transparent || nrm.y < 0.97 || r < 3) return;
      out.push({ kind: 'cyl', c: [p.x, p.y - 0.2, p.z], r, hh: 0.2 });
    } else if (g instanceof THREE.CylinderGeometry) {
      if (up.y < 0.97) return;
      const r = g.parameters.radiusTop * s.x;
      const h = g.parameters.height * s.y;
      if (g.parameters.openEnded) {
        if (r < 7 || h < 2) return; // tank walls: a ring of boxes
        const n = Math.max(16, Math.round(r * 1.8));
        const seg = (2 * Math.PI * r) / n;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
          out.push({ kind: 'box', c: [p.x + Math.cos(a) * (r - 0.25), p.y, p.z + Math.sin(a) * (r - 0.25)], q: [qa.x, qa.y, qa.z, qa.w], h: [0.25, h / 2, seg / 2 + 0.05] });
        }
      } else if (r >= 0.8 && h >= 2) out.push({ kind: 'cyl', c: [p.x, p.y, p.z], r, hh: h / 2 });
    }
  });
  return out;
}
