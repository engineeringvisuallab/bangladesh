import * as THREE from 'three';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface Pit {
  x: number;
  z: number;
  w: number;
  d: number;
  depth: number;
  /** if set the pit is a circle of this radius (w = d = 2r) */
  r?: number;
}

/**
 * The ground pad of a site. Sunken structures (tanks, wells) register a "pit"; the pad is then extruded WITH holes
 * at those places, so tanks are really sunk into the ground and can be seen into from above.
 * In the game: flatten the terrain under `pad` (the game already has terrain pads) and set root.position.y = pad height.
 */
export class Site {
  readonly pits: Pit[] = [];
  constructor(readonly bounds: Rect, readonly pad: Rect) {}

  addPit(p: Pit): void {
    this.pits.push(p);
  }

  buildGround(mat: THREE.Material, skirtDepth = 0, skirtMat?: THREE.Material): THREE.Object3D {
    const { minX, maxX, minZ, maxZ } = this.pad;
    // shape (sx, sy) -> world (x = sx, z = -sy) after rotateX(-90deg)
    const shape = new THREE.Shape();
    shape.moveTo(minX, -minZ);
    shape.lineTo(maxX, -minZ);
    shape.lineTo(maxX, -maxZ);
    shape.lineTo(minX, -maxZ);
    shape.closePath();
    for (const p of this.pits) {
      const h = new THREE.Path();
      if (p.r !== undefined) {
        h.absarc(p.x, -p.z, p.r, 0, Math.PI * 2, false);
        shape.holes.push(h);
        continue;
      }
      const x0 = p.x - p.w / 2;
      const x1 = p.x + p.w / 2;
      const y0 = -(p.z - p.d / 2);
      const y1 = -(p.z + p.d / 2);
      h.moveTo(x0, y0);
      h.lineTo(x1, y0);
      h.lineTo(x1, y1);
      h.lineTo(x0, y1);
      h.closePath();
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 56 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.3, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ground-pad';
    if (skirtDepth <= 0) return mesh;
    // concrete retaining skirt around the pad (the game digs the ground away under the pad)
    const g = new THREE.Group();
    g.name = 'ground';
    g.add(mesh);
    const t = 0.6;
    const m = skirtMat ?? mat;
    const wx = maxX - minX;
    const wz = maxZ - minZ;
    const add = (w: number, d: number, x: number, z: number): void => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, skirtDepth, d), m);
      b.position.set(x, -skirtDepth / 2 - 0.05, z);
      g.add(b);
    };
    add(wx + 2 * t, t, (minX + maxX) / 2, minZ - t / 2);
    add(wx + 2 * t, t, (minX + maxX) / 2, maxZ + t / 2);
    add(t, wz, minX - t / 2, (minZ + maxZ) / 2);
    add(t, wz, maxX + t / 2, (minZ + maxZ) / 2);
    return g;
  }
}
