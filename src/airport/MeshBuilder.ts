/**
 * Tiny flat-shaded mesh builder -> typed arrays (no three.js, worker friendly).
 * Every face is emitted with its own vertices, normal and colour.
 */

import type { RGB } from './AirportSpec';

export type Vec3 = readonly [number, number, number];

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get vertexCount(): number { return this.pos.length / 3; }
  get triangleCount(): number { return this.idx.length / 3; }

  /**
   * Add a planar convex polygon. `facing` is either 'up' (normal.y > 0) or a point
   * that lies inside the solid (the face is wound so its normal points away from it).
   */
  private poly(pts: Vec3[], color: RGB, facing: 'up' | Vec3): void {
    const a = pts[0]; const b = pts[1]; const c = pts[2];
    if (!a || !b || !c) return;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;

    let flip: boolean;
    if (facing === 'up') {
      flip = ny < 0;
    } else {
      let mx = 0; let my = 0; let mz = 0;
      for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; }
      mx /= pts.length; my /= pts.length; mz /= pts.length;
      flip = nx * (mx - facing[0]) + ny * (my - facing[1]) + nz * (mz - facing[2]) < 0;
    }
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const ordered = flip ? pts.slice().reverse() : pts;

    const base = this.vertexCount;
    for (const p of ordered) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
    for (let i = 1; i < ordered.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /** flat rectangle on the ground, w along X, d along Z */
  rect(cx: number, cz: number, w: number, d: number, y: number, color: RGB): void {
    const x0 = cx - w / 2; const x1 = cx + w / 2;
    const z0 = cz - d / 2; const z1 = cz + d / 2;
    this.poly([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], color, 'up');
  }

  /** flat disc (triangle fan) */
  disc(cx: number, cz: number, r: number, y: number, color: RGB, segs = 28): void {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      this.poly(
        [[cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r]],
        color, 'up',
      );
    }
  }

  /** open-bottom box standing on baseY */
  box(cx: number, baseY: number, cz: number, w: number, h: number, d: number, color: RGB): void {
    this.frustum(cx, baseY, cz, w, d, w, d, h, color);
  }

  /** 4-sided frustum (box when top == bottom), open bottom */
  frustum(cx: number, baseY: number, cz: number, w0: number, d0: number, w1: number, d1: number, h: number, color: RGB): void {
    const y1 = baseY + h;
    const b: Vec3[] = [
      [cx - w0 / 2, baseY, cz - d0 / 2], [cx + w0 / 2, baseY, cz - d0 / 2],
      [cx + w0 / 2, baseY, cz + d0 / 2], [cx - w0 / 2, baseY, cz + d0 / 2],
    ];
    const t: Vec3[] = [
      [cx - w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz - d1 / 2],
      [cx + w1 / 2, y1, cz + d1 / 2], [cx - w1 / 2, y1, cz + d1 / 2],
    ];
    const inside: Vec3 = [cx, baseY + h / 2, cz];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const b0 = b[i]; const b1 = b[j]; const t0 = t[i]; const t1 = t[j];
      if (b0 && b1 && t0 && t1) this.poly([b0, b1, t1, t0], color, inside);
    }
    this.poly(t, color, inside);
  }

  /** walls + gable roof (ridge along X) */
  gable(cx: number, baseY: number, cz: number, w: number, d: number, h: number, roofH: number, wall: RGB, roof: RGB): void {
    this.box(cx, baseY, cz, w, h, d, wall);
    const x0 = cx - w / 2; const x1 = cx + w / 2;
    const z0 = cz - d / 2; const z1 = cz + d / 2;
    const y0 = baseY + h; const y1 = y0 + roofH;
    const inside: Vec3 = [cx, baseY + h / 2, cz];
    this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, cz], [x0, y1, cz]], roof, inside);
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, cz], [x0, y1, cz]], roof, inside);
    this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, cz]], wall, inside);
    this.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, cz]], wall, inside);
  }

  build(): MeshArrays {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      indices: new Uint32Array(this.idx),
    };
  }
}
