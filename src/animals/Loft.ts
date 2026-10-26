import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Loft: a smooth tube made of cross-section rings placed along the +Z axis.
 * Every ring is a super-ellipse (n = 2: ellipse, n = 3..4: a rounder box), so a torso can have a deep chest, a narrow
 * waist and a wide rump, a leg can have a thick thigh and a thin shank, a head can have a long muzzle ... all in ONE
 * smooth mesh instead of a pile of balls and cylinders.
 *   u (texture) = around the tube: 0 = the back line, 0.5 = the belly (so fur textures put the pale belly in the middle)
 *   v (texture) = along the tube in metres / `tile`  (the same texel density on every part of an animal)
 *   vertex colour = 1 on the back, darker underneath (a cheap ambient-occlusion look)
 */
export interface Station {
  /** Position along the axis (m). */
  z: number;
  /** Half width (x) and half height (y) of the ring (m). */
  w: number;
  h: number;
  /** Centre of the ring: height and sideways offset (m). */
  y?: number;
  x?: number;
  /** Super-ellipse exponent: 2 = ellipse (default 2.4). */
  n?: number;
}

export interface LoftOpts {
  /** Vertices around every ring (default 14). */
  seg?: number;
  /** Metres per texture tile along the axis (default 1.6). */
  tile?: number;
  /** 0..1: how much the underside is darkened (default 1). */
  shade?: number;
  /** Close the ends with a cap (default true). */
  caps?: boolean;
}

const sgnPow = (v: number, p: number): number => Math.sign(v) * Math.pow(Math.abs(v), p);

export function loft(st: Station[], o: LoftOpts = {}): THREE.BufferGeometry {
  const seg = o.seg ?? 14;
  const tile = o.tile ?? 1.6;
  const shade = o.shade ?? 1;
  const caps = o.caps ?? true;
  const rings = st.length;
  const nv = rings * (seg + 1) + (caps ? 2 : 0);
  const pos = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3).fill(1);
  const index: number[] = [];
  const z0 = st[0].z;
  for (let r = 0; r < rings; r++) {
    const s = st[r];
    const e = 2 / (s.n ?? 2.4);
    for (let j = 0; j <= seg; j++) {
      const th = Math.PI / 2 - (j / seg) * Math.PI * 2; // start on the back line, go round clockwise
      const c = Math.cos(th), sn = Math.sin(th);
      const i = r * (seg + 1) + j;
      pos[i * 3] = (s.x ?? 0) + s.w * sgnPow(c, e);
      pos[i * 3 + 1] = (s.y ?? 0) + s.h * sgnPow(sn, e);
      pos[i * 3 + 2] = s.z;
      uv[i * 2] = j / seg;
      uv[i * 2 + 1] = (s.z - z0) / tile;
      const k = 1 - 0.34 * shade * (1 - (sn * 0.5 + 0.5));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = r * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    const mk = (r: number, vi: number, flip: boolean): void => {
      const s = st[r];
      pos[vi * 3] = s.x ?? 0; pos[vi * 3 + 1] = s.y ?? 0; pos[vi * 3 + 2] = s.z;
      uv[vi * 2] = 0.5; uv[vi * 2 + 1] = (s.z - z0) / tile;
      col[vi * 3] = col[vi * 3 + 1] = col[vi * 3 + 2] = 0.85;
      for (let j = 0; j < seg; j++) {
        const a = r * (seg + 1) + j, b = a + 1;
        if (flip) index.push(vi, a, b); else index.push(vi, b, a);
      }
    };
    mk(0, rings * (seg + 1), false);
    mk(rings - 1, rings * (seg + 1) + 1, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // the seam (j = 0 and j = seg are the same place): give both the same normal so there is no visible line
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let r = 0; r < rings; r++) {
    const a = r * (seg + 1), b = a + seg;
    const nx = nor.getX(a) + nor.getX(b), ny = nor.getY(a) + nor.getY(b), nz = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(a, nx / l, ny / l, nz / l);
    nor.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return g;
}

/** Rotate a loft built along +Z so that its axis points down (-Y): legs hang from their pivot. */
export function hang(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.rotateX(Math.PI / 2);
  return g;
}

/** A plain ellipsoid (eyes, noses, pads, muscles) with the same attributes as a loft so the two can be merged. */
export function ball(sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, k: number | number[] = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 9);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return tint(g, k);
}

/** A cone (horns, tusks, ears, beaks, thorns): base radius rx x rz, length `len` along +Y, base at the origin. */
export function spike(rx: number, rz: number, len: number, k: number | number[] = 1, seg = 8): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, seg, 1);
  g.scale(rx, len, rz);
  g.translate(0, len / 2, 0);
  return tint(g, k);
}

/**
 * Give a geometry a flat vertex colour: one number = grey multiplier (darkens the fur texture), or [r, g, b] 0..1
 * (for the accent material that has no texture: horns, beaks, eyes, noses, combs ...).
 */
export function tint(g: THREE.BufferGeometry, c: number | number[]): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const rgb = typeof c === 'number' ? [c, c, c] : c;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Merge parts (all with position / normal / uv / colour) into one geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  if (!m) throw new Error('animal geometry merge failed');
  for (const p of parts) p.dispose();
  return m;
}

/** Bend a loft's local transform: translate / rotate in one go. */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Catmull-Rom smoothing of the station table: `per` extra rings between every two given ones. */
export function smooth(st: Station[], per = 3): Station[] {
  if (st.length < 3) return st;
  const out: Station[] = [];
  const cr = (a: number, b: number, c: number, d: number, t: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < st.length - 1; i++) {
    const p0 = st[Math.max(0, i - 1)], p1 = st[i], p2 = st[i + 1], p3 = st[Math.min(st.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({
        z: cr(p0.z, p1.z, p2.z, p3.z, t),
        w: Math.max(0.001, cr(p0.w, p1.w, p2.w, p3.w, t)),
        h: Math.max(0.001, cr(p0.h, p1.h, p2.h, p3.h, t)),
        y: cr(p0.y ?? 0, p1.y ?? 0, p2.y ?? 0, p3.y ?? 0, t),
        x: cr(p0.x ?? 0, p1.x ?? 0, p2.x ?? 0, p3.x ?? 0, t),
        n: cr(p0.n ?? 2.4, p1.n ?? 2.4, p2.n ?? 2.4, p3.n ?? 2.4, t),
      });
    }
  }
  out.push(st[st.length - 1]);
  return out;
}

/** A round tube along a 3D path (antlers, horns, tusks, tails, trunks): radius r0 at the start, r1 at the tip. */
export function curveTube(pts: number[][], r0: number, r1: number, k: number | number[] = 1, seg = 7, flat = 1): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array((n * (seg + 1) + 1) * 3);
  const uv = new Float32Array((n * (seg + 1) + 1) * 2);
  const index: number[] = [];
  let ref = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    if (Math.abs(ty * ref[1] + tx * ref[0] + tz * ref[2]) > 0.95) ref = Math.abs(ty) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    // normal = ref x t, binormal = t x normal
    let nx = ref[1] * tz - ref[2] * ty, ny = ref[2] * tx - ref[0] * tz, nz = ref[0] * ty - ref[1] * tx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    ref = [bx, by, bz]; // carry the frame along the path
    const rr = r0 + (r1 - r0) * (n === 1 ? 0 : i / (n - 1));
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const c = Math.cos(th) * rr, s = Math.sin(th) * rr * flat;
      const vi = i * (seg + 1) + j;
      pos[vi * 3] = pts[i][0] + nx * c + bx * s;
      pos[vi * 3 + 1] = pts[i][1] + ny * c + by * s;
      pos[vi * 3 + 2] = pts[i][2] + nz * c + bz * s;
      uv[vi * 2] = j / seg; uv[vi * 2 + 1] = i / Math.max(1, n - 1);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  // a pointed tip closes the end
  const tip = n * (seg + 1);
  const e = pts[n - 1], e0 = pts[Math.max(0, n - 2)];
  pos[tip * 3] = e[0] + (e[0] - e0[0]) * 0.25;
  pos[tip * 3 + 1] = e[1] + (e[1] - e0[1]) * 0.25;
  pos[tip * 3 + 2] = e[2] + (e[2] - e0[2]) * 0.25;
  uv[tip * 2] = 0.5; uv[tip * 2 + 1] = 1;
  for (let j = 0; j < seg; j++) { const a = (n - 1) * (seg + 1) + j; index.push(a, tip, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return tint(g, k);
}
