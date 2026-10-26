import * as THREE from 'three';
import { Config } from '../core/Config';
import { mulberry32 } from '../world/Seed';
import { GRASS_TYPE_COUNT, GrassType } from './TreeTypes';

/**
 * REALISTIC GRASS + WILDFLOWERS. Ten tuft models (TreeTypes.GrassType), all in ONE shared material:
 *   0 lawn   - short, fine, very dense blades            1 wild  - tall, slim, bent blades (the "meadow" look)
 *   2 clump  - broad-leaf bunch                            3 seed  - tall straw-coloured grass with feathery seed heads
 *   4 daisy  5 buttercup  6 lavender  7 poppy  8 cornflower  9 clover  - a grass tuft with real flower heads growing out of it
 * Every blade is a curved ribbon (base -> middle -> pointed tip) with its own height, lean, droop, width and tint, a dark root and a
 * bright tip, and normals that bend a little to the sides so a blade is shaded round, not flat. Flower heads are built from petals
 * (not a coloured dot): daisy = 12 white petals around a yellow eye, buttercup = 5 round yellow petals, poppy = a red cup with a
 * dark centre, cornflower = 9 pointed blue petals, lavender = a purple spike of tiny florets, clover = a white pom-pom + trefoil leaves.
 *
 * The real green / dry colour of the meadow still comes from the per-instance colour; vertices flagged `aFlower` ignore it
 * (flowers keep their own colour). Wind sway + distance fade are in the vertex shader, sun-through-the-blades in the fragment shader.
 */

type RNG = () => number;
type RGB = [number, number, number];

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  fl: number[] = [];

  vert(p: ArrayLike<number>, n: THREE.Vector3, c: RGB, flower: number): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c[0], c[1], c[2]);
    this.fl.push(flower);
  }

  tri(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, n: THREE.Vector3, ca: RGB, cb: RGB = ca, cc: RGB = ca, flower = 0): void {
    this.vert(a, n, ca, flower);
    this.vert(b, n, cb, flower);
    this.vert(c, n, cc, flower);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFlower', new THREE.Float32BufferAttribute(this.fl, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** Flower heads are a little larger than life so they read at game distances. */
const HEAD = 1.45;
/** Normal mostly up (lit like the ground under the tuft) with a sideways tilt so the blade is shaded round. */
const bladeNormal = (sx: number, sz: number, k: number): THREE.Vector3 => new THREE.Vector3(sx * k, 1, sz * k).normalize();

interface BladeOpts {
  cx: number;
  cz: number;
  /** growth direction (outward), unit */
  dx: number;
  dz: number;
  h: number;
  lean: number;
  droop: number;
  /** half width at the root */
  w: number;
  tint: RGB;
  /** brightness at the root / at the tip */
  root: number;
  tip: number;
}

/** One curved blade: root -> middle -> upper -> pointed tip (5 triangles). */
function blade(b: Builder, o: BladeOpts): void {
  const tx = -o.dz, tz = o.dx; // sideways
  const at = (t: number): [number, number, number] => {
    const out = o.lean * t * t + o.droop * t * t * t;
    return [o.cx + o.dx * out, o.h * t - o.droop * 0.35 * t * t * t, o.cz + o.dz * out];
  };
  const P0 = at(0), P1 = at(0.45), P2 = at(0.8), P3 = at(1);
  const w0 = o.w, w1 = o.w * 0.86, w2 = o.w * 0.48;
  const c = (k: number): RGB => [k * o.tint[0], k * o.tint[1], k * o.tint[2]];
  const nl = bladeNormal(-tx, -tz, 0.38), nr = bladeNormal(tx, tz, 0.38), nm = bladeNormal(0, 0, 0);
  const L0 = [P0[0] - tx * w0, P0[1], P0[2] - tz * w0], R0 = [P0[0] + tx * w0, P0[1], P0[2] + tz * w0];
  const L1 = [P1[0] - tx * w1, P1[1], P1[2] - tz * w1], R1 = [P1[0] + tx * w1, P1[1], P1[2] + tz * w1];
  const L2 = [P2[0] - tx * w2, P2[1], P2[2] - tz * w2], R2 = [P2[0] + tx * w2, P2[1], P2[2] + tz * w2];
  const k0 = o.root, k1 = o.root + (o.tip - o.root) * 0.45, k2 = o.root + (o.tip - o.root) * 0.8;
  b.vert(L0, nl, c(k0), 0); b.vert(R0, nr, c(k0), 0); b.vert(R1, nr, c(k1), 0);
  b.vert(L0, nl, c(k0), 0); b.vert(R1, nr, c(k1), 0); b.vert(L1, nl, c(k1), 0);
  b.vert(L1, nl, c(k1), 0); b.vert(R1, nr, c(k1), 0); b.vert(R2, nr, c(k2), 0);
  b.vert(L1, nl, c(k1), 0); b.vert(R2, nr, c(k2), 0); b.vert(L2, nl, c(k2), 0);
  b.vert(L2, nl, c(k2), 0); b.vert(R2, nr, c(k2), 0); b.vert(P3, nm, c(o.tip), 0);
}

interface GrassStyle {
  blades: number;
  hMin: number;
  hMax: number;
  /** >1 = many short blades, a few tall ones */
  hPow: number;
  /** half-width at the root (m) */
  wMin: number;
  wMax: number;
  /** radius of the tuft (m) */
  rMin: number;
  rMax: number;
  lean: [number, number];
  droop: [number, number];
  /** share of straw / yellow-green blades */
  straw: number;
  yellow: number;
}

const STYLES: Record<number, GrassStyle> = {
  [GrassType.lawn]: { blades: 18, hMin: 0.1, hMax: 0.38, hPow: 1.3, wMin: 0.012, wMax: 0.02, rMin: 0.02, rMax: 0.2, lean: [0.03, 0.14], droop: [0.02, 0.07], straw: 0.05, yellow: 0.25 },
  [GrassType.wild]: { blades: 14, hMin: 0.3, hMax: 1.15, hPow: 1.5, wMin: 0.014, wMax: 0.024, rMin: 0.03, rMax: 0.28, lean: [0.08, 0.34], droop: [0.08, 0.3], straw: 0.1, yellow: 0.32 },
  [GrassType.clump]: { blades: 9, hMin: 0.22, hMax: 0.6, hPow: 1.2, wMin: 0.032, wMax: 0.05, rMin: 0.02, rMax: 0.16, lean: [0.1, 0.32], droop: [0.06, 0.2], straw: 0.06, yellow: 0.2 },
  [GrassType.seed]: { blades: 11, hMin: 0.45, hMax: 1.35, hPow: 1.3, wMin: 0.01, wMax: 0.017, rMin: 0.03, rMax: 0.22, lean: [0.04, 0.22], droop: [0.04, 0.16], straw: 0.45, yellow: 0.4 },
};
const FLOWER_BASE_STYLE: GrassStyle = { blades: 9, hMin: 0.14, hMax: 0.5, hPow: 1.4, wMin: 0.013, wMax: 0.022, rMin: 0.03, rMax: 0.2, lean: [0.05, 0.22], droop: [0.03, 0.14], straw: 0.05, yellow: 0.25 };

function grassBlades(b: Builder, r: RNG, s: GrassStyle, density = 1): void {
  const count = Math.max(4, Math.round(s.blades * Config.vegetation.grass.bladeDensity * density));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.9;
    const rad = s.rMin + (s.rMax - s.rMin) * Math.sqrt(r());
    const h = s.hMin + Math.pow(r(), s.hPow) * (s.hMax - s.hMin);
    const da = a + (r() - 0.5) * 1.1;
    const k = r();
    // per-blade tint: fresh green / yellow-green / straw
    const tint: RGB = k < s.straw ? [1.5, 1.2, 0.62] : k < s.straw + s.yellow ? [1.2, 1.08, 0.78] : [0.9 + r() * 0.14, 1.0 + r() * 0.06, 0.88 + r() * 0.16];
    blade(b, {
      cx: Math.cos(a) * rad,
      cz: Math.sin(a) * rad,
      dx: Math.cos(da),
      dz: Math.sin(da),
      h,
      lean: s.lean[0] + r() * (s.lean[1] - s.lean[0]),
      droop: (s.droop[0] + r() * (s.droop[1] - s.droop[0])) * (0.5 + h),
      w: s.wMin + r() * (s.wMax - s.wMin),
      tint,
      root: 0.22 + r() * 0.1,
      tip: 1.0 + r() * 0.2,
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// flowers
// ---------------------------------------------------------------------------------------------------------------------

const STEM: RGB = [0.18, 0.36, 0.09];
const STEM_TOP: RGB = [0.3, 0.5, 0.14];

/** A thin stem (2 segments, leaning) ending at the returned top; `dir` is the stem direction at the top. */
function stem(b: Builder, x0: number, z0: number, h: number, lx: number, lz: number, width = 0.0055): { top: THREE.Vector3; dir: THREE.Vector3 } {
  const a = [x0, 0, z0];
  const m = [x0 + lx * 0.3, h * 0.5, z0 + lz * 0.3];
  const e = [x0 + lx, h, z0 + lz];
  const sl = Math.hypot(lx, lz) || 1;
  const tx = (-lz / sl) * width, tz = (lx / sl) * width;
  const n = bladeNormal(0, 0, 0);
  const A = [a, m, e];
  const widths = [1, 0.85, 0.7];
  for (let i = 0; i < 2; i++) {
    const p = A[i], q = A[i + 1];
    const wp = widths[i], wq = widths[i + 1];
    const cp: RGB = i === 0 ? STEM : STEM_TOP, cq: RGB = STEM_TOP;
    b.tri([p[0] - tx * wp, p[1], p[2] - tz * wp], [p[0] + tx * wp, p[1], p[2] + tz * wp], [q[0] + tx * wq, q[1], q[2] + tz * wq], n, cp, cp, cq, 1);
    b.tri([p[0] - tx * wp, p[1], p[2] - tz * wp], [q[0] + tx * wq, q[1], q[2] + tz * wq], [q[0] - tx * wq, q[1], q[2] - tz * wq], n, cp, cq, cq, 1);
  }
  const dir = new THREE.Vector3(e[0] - m[0], e[1] - m[1], e[2] - m[2]).normalize();
  return { top: new THREE.Vector3(e[0], e[1], e[2]), dir };
}

/** Orthonormal basis (u, v) of the plane of a flower head whose axis (face direction) is `axis`. */
function basis(axis: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const ref = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { u, v };
}

const at3 = (c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, ax: THREE.Vector3, x: number, y: number, h: number): number[] => [
  c.x + u.x * x + v.x * y + ax.x * h,
  c.y + u.y * x + v.y * y + ax.y * h,
  c.z + u.z * x + v.z * y + ax.z * h,
];

/** A disc of petals around a centre. `lift` raises the petal tips along the axis (cup shape) or lowers them (droop). */
function petalDisc(
  b: Builder,
  r: RNG,
  c: THREE.Vector3,
  axis: THREE.Vector3,
  petals: number,
  inner: number,
  outer: number,
  width: number,
  lift: number,
  base: RGB,
  tip: RGB,
  rot: number,
): void {
  const { u, v } = basis(axis);
  inner *= HEAD;
  outer *= HEAD;
  width *= HEAD;
  lift *= HEAD;
  const n = axis.clone().multiplyScalar(0.8).addScaledVector(UP, 0.5).normalize();
  for (let i = 0; i < petals; i++) {
    const a = rot + (i / petals) * Math.PI * 2 + (r() - 0.5) * 0.12;
    const len = outer * (0.88 + r() * 0.24);
    const ca = Math.cos(a), sa = Math.sin(a);
    const pa = -sa, pb = ca;
    const bw = width * 0.45;
    const mw = width * 0.5;
    const m = inner + (len - inner) * 0.55;
    const A = at3(c, u, v, axis, ca * inner - pa * bw, sa * inner - pb * bw, 0);
    const B = at3(c, u, v, axis, ca * inner + pa * bw, sa * inner + pb * bw, 0);
    const M1 = at3(c, u, v, axis, ca * m - pa * mw, sa * m - pb * mw, lift * 0.4);
    const M2 = at3(c, u, v, axis, ca * m + pa * mw, sa * m + pb * mw, lift * 0.4);
    const T = at3(c, u, v, axis, ca * len, sa * len, lift);
    const mid: RGB = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2];
    b.tri(A, B, M2, n, base, base, mid, 1);
    b.tri(A, M2, M1, n, base, mid, mid, 1);
    b.tri(M1, M2, T, n, mid, mid, tip, 1);
  }
}

/** A raised fan (the flower's eye / centre). */
function eye(b: Builder, c: THREE.Vector3, axis: THREE.Vector3, rad: number, rise: number, col: RGB, edge: RGB, sides = 8): void {
  const { u, v } = basis(axis);
  rad *= HEAD;
  rise *= HEAD;
  const n = axis.clone().multiplyScalar(0.7).addScaledVector(UP, 0.7).normalize();
  const top = at3(c, u, v, axis, 0, 0, rise);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    b.tri(top, at3(c, u, v, axis, Math.cos(a0) * rad, Math.sin(a0) * rad, 0), at3(c, u, v, axis, Math.cos(a1) * rad, Math.sin(a1) * rad, 0), n, col, edge, edge, 1);
  }
}

/** Small green stem leaf. */
function leaf(b: Builder, x: number, z: number, dx: number, dz: number, len: number, wid: number): void {
  const n = bladeNormal(0, 0, 0);
  const tx = -dz * wid, tz = dx * wid;
  const A = [x, 0.01, z], B = [x + dx * len * 0.5 + tx, len * 0.25, z + dz * len * 0.5 + tz], C = [x + dx * len * 0.5 - tx, len * 0.25, z + dz * len * 0.5 - tz];
  const T = [x + dx * len, len * 0.2, z + dz * len];
  const dark: RGB = [0.16, 0.34, 0.1], light: RGB = [0.3, 0.52, 0.16];
  b.tri(A, B, C, n, dark, light, light, 1);
  b.tri(B, T, C, n, light, light, light, 1);
}

type FlowerFn = (b: Builder, r: RNG, x: number, z: number) => void;

/** Head axis: continues the stem, pulled up a bit and nudged randomly so no two heads face the same way. */
const headAxis = (r: RNG, dir: THREE.Vector3, up: number, jitter: number): THREE.Vector3 =>
  dir.clone().lerp(UP, up).add(new THREE.Vector3((r() - 0.5) * jitter, 0, (r() - 0.5) * jitter)).normalize();

const daisy: FlowerFn = (b, r, x, z) => {
  const { top, dir } = stem(b, x, z, 0.3 + r() * 0.35, (r() - 0.5) * 0.22, (r() - 0.5) * 0.22, 0.004);
  const axis = headAxis(r, dir, 0.25, 0.5);
  petalDisc(b, r, top, axis, 12, 0.007, 0.036 + r() * 0.01, 0.0095, -0.006, [1, 0.97, 0.82], [1, 1, 1], r() * 6.28);
  eye(b, top, axis, 0.0125, 0.006, [1, 0.78, 0.08], [0.95, 0.62, 0.04]);
  const a = r() * 6.28;
  leaf(b, x, z, Math.cos(a), Math.sin(a), 0.09, 0.02);
};

const buttercup: FlowerFn = (b, r, x, z) => {
  const { top, dir } = stem(b, x, z, 0.28 + r() * 0.35, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0.0045);
  const axis = headAxis(r, dir, 0.4, 0.3);
  petalDisc(b, r, top, axis, 5, 0.004, 0.026, 0.028, 0.011, [0.95, 0.72, 0.02], [1, 0.9, 0.12], r() * 6.28);
  eye(b, top, axis, 0.009, 0.003, [0.8, 0.62, 0.02], [0.9, 0.7, 0.03], 6);
  const a = r() * 6.28;
  leaf(b, x, z, Math.cos(a), Math.sin(a), 0.1, 0.03);
};

const lavender: FlowerFn = (b, r, x, z) => {
  const { top, dir } = stem(b, x, z, 0.4 + r() * 0.4, (r() - 0.5) * 0.18, (r() - 0.5) * 0.18, 0.0035);
  // spike of florets: whorls getting smaller towards the tip
  const spike = 0.14 + r() * 0.08;
  const rows = 8;
  const pale: RGB = [0.62, 0.44, 0.86], deep: RGB = [0.38, 0.16, 0.68];
  const hue = r();
  const n = UP.clone();
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y = top.clone().addScaledVector(dir, spike * t * 0.95 - 0.02);
    const size = 0.0145 * 1.25 * (1 - t * 0.6);
    const rot = r() * 6.28;
    for (let k = 0; k < 3; k++) {
      const a = rot + (k / 3) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const o = [y.x + ca * size * 0.5, y.y, y.z + sa * size * 0.5];
      const col: RGB = [pale[0] + (deep[0] - pale[0]) * hue * (0.6 + 0.4 * t), pale[1] + (deep[1] - pale[1]) * hue, pale[2] + (deep[2] - pale[2]) * hue];
      const tp = [o[0] + ca * size * 0.6, o[1] + size * 1.5, o[2] + sa * size * 0.6];
      const l = [o[0] - sa * size, o[1], o[2] + ca * size], rr = [o[0] + sa * size, o[1], o[2] - ca * size];
      b.tri(l, rr, tp, n, deep, deep, col, 1);
      b.tri(l, tp, [o[0] + ca * size * 1.3, o[1] - size * 0.2, o[2] + sa * size * 1.3], n, deep, col, pale, 1);
    }
  }
};

const poppy: FlowerFn = (b, r, x, z) => {
  const { top, dir } = stem(b, x, z, 0.36 + r() * 0.4, (r() - 0.5) * 0.24, (r() - 0.5) * 0.24, 0.0045);
  const axis = headAxis(r, dir, 0.2, 0.5);
  petalDisc(b, r, top, axis, 4, 0.005, 0.034 + r() * 0.01, 0.044, 0.02, [0.62, 0.04, 0.03], [0.95, 0.12, 0.07], r() * 6.28);
  eye(b, top, axis, 0.011, 0.006, [0.06, 0.05, 0.04], [0.18, 0.26, 0.08], 7);
  const a = r() * 6.28;
  leaf(b, x, z, Math.cos(a), Math.sin(a), 0.12, 0.025);
};

const cornflower: FlowerFn = (b, r, x, z) => {
  const { top, dir } = stem(b, x, z, 0.32 + r() * 0.4, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0.0035);
  const axis = headAxis(r, dir, 0.3, 0.4);
  const blue = r() < 0.7;
  const base: RGB = blue ? [0.14, 0.2, 0.72] : [0.55, 0.3, 0.75];
  const tip: RGB = blue ? [0.33, 0.45, 1] : [0.8, 0.55, 0.95];
  petalDisc(b, r, top, axis, 9, 0.006, 0.03 + r() * 0.008, 0.01, 0.005, base, tip, r() * 6.28);
  eye(b, top, axis, 0.009, 0.005, [0.3, 0.12, 0.45], [0.2, 0.1, 0.4], 6);
  const a = r() * 6.28;
  leaf(b, x, z, Math.cos(a), Math.sin(a), 0.1, 0.012);
};

const clover: FlowerFn = (b, r, x, z) => {
  const { top } = stem(b, x, z, 0.1 + r() * 0.12, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1, 0.0035);
  // white / pink pom-pom: a rounded cap of small petals
  const col: RGB = r() < 0.7 ? [0.97, 0.96, 0.92] : [0.95, 0.72, 0.8];
  const dark: RGB = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
  const R = 0.017 * HEAD;
  const n = UP.clone();
  const topP = [top.x, top.y + R, top.z], bot = [top.x, top.y - R * 0.6, top.z];
  const ring: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    ring.push([top.x + Math.cos(a) * R * 1.1, top.y + R * 0.1, top.z + Math.sin(a) * R * 1.1]);
  }
  for (let i = 0; i < 7; i++) {
    const p = ring[i], q = ring[(i + 1) % 7];
    b.tri(topP, p, q, n, col, dark, dark, 1);
    b.tri(bot, q, p, n, dark, dark, dark, 1);
  }
  // trefoil leaves on short stalks around the base: three round leaflets each
  const leaves = 3 + Math.floor(r() * 3);
  for (let i = 0; i < leaves; i++) {
    const a = r() * Math.PI * 2;
    const dist = 0.03 + r() * 0.08;
    const cx = x + Math.cos(a) * dist, cz = z + Math.sin(a) * dist, cy = 0.06 + r() * 0.05;
    for (let k = 0; k < 3; k++) {
      const la = a + (k / 3) * Math.PI * 2 + r() * 0.3;
      const lxp = cx + Math.cos(la) * 0.018, lzp = cz + Math.sin(la) * 0.018;
      const ls = 0.017;
      const c0: RGB = [0.13, 0.32, 0.09], c1: RGB = [0.26, 0.5, 0.17];
      const A = [lxp - ls, cy, lzp], B = [lxp + ls, cy, lzp], C = [lxp, cy + 0.003, lzp + ls * 1.7], D = [lxp, cy + 0.002, lzp - ls * 1.7];
      b.tri(A, C, B, n, c0, c1, c0, 1);
      b.tri(A, B, D, n, c0, c0, c1, 1);
    }
    stem(b, cx, cz, cy, 0.001, 0, 0.003);
  }
};

const FLOWERS: Record<number, { fn: FlowerFn; stems: [number, number]; spread: number }> = {
  [GrassType.daisy]: { fn: daisy, stems: [3, 6], spread: 0.22 },
  [GrassType.buttercup]: { fn: buttercup, stems: [3, 5], spread: 0.2 },
  [GrassType.lavender]: { fn: lavender, stems: [3, 5], spread: 0.18 },
  [GrassType.poppy]: { fn: poppy, stems: [2, 4], spread: 0.22 },
  [GrassType.cornflower]: { fn: cornflower, stems: [3, 5], spread: 0.2 },
  [GrassType.clover]: { fn: clover, stems: [3, 5], spread: 0.2 },
};

/** Seed heads on a few tall stems: a feathery cluster of short bristles at the tip. */
function seedHeads(b: Builder, r: RNG): void {
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.02 + r() * 0.16;
    const { top, dir } = stem(b, Math.cos(a) * rad, Math.sin(a) * rad, 0.7 + r() * 0.7, Math.cos(a) * (0.08 + r() * 0.16), Math.sin(a) * (0.08 + r() * 0.16), 0.0045);
    const len = 0.13 + r() * 0.09;
    const straw: RGB = [0.78, 0.68, 0.36], pale: RGB = [0.92, 0.85, 0.55];
    const nrm = UP.clone();
    const bristles = 10;
    for (let k = 0; k < bristles; k++) {
      const t = k / bristles;
      const base = top.clone().addScaledVector(dir, len * t * 0.8 - 0.03);
      const sz = 0.017 * (1 - t * 0.55);
      for (let s = 0; s < 2; s++) {
        const aa = r() * Math.PI * 2;
        const ox = Math.cos(aa), oz = Math.sin(aa);
        const tipP = [base.x + ox * sz * 1.8 + dir.x * 0.02, base.y + dir.y * 0.02 + 0.006, base.z + oz * sz * 1.8 + dir.z * 0.02];
        b.tri([base.x - oz * 0.0035, base.y, base.z + ox * 0.0035], [base.x + oz * 0.0035, base.y, base.z - ox * 0.0035], tipP, nrm, straw, straw, pale, 1);
      }
    }
  }
}

/** `density` < 1 = a cheaper model for the far LOD rings (fewer blades, no seed heads). */
function make(type: number, density = 1): THREE.BufferGeometry {
  const r = mulberry32(4242 + type * 7919);
  const b = new Builder();
  const style = STYLES[type];
  if (style) {
    grassBlades(b, r, style, density);
    if (type === GrassType.seed && density >= 1) seedHeads(b, r);
  } else {
    // flower tuft: low grass + several flowers on stems
    grassBlades(b, r, FLOWER_BASE_STYLE);
    const f = FLOWERS[type];
    const count = f.stems[0] + Math.floor(r() * (f.stems[1] - f.stems[0] + 1));
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = f.spread * Math.sqrt(r());
      f.fn(b, r, Math.cos(a) * rad, Math.sin(a) * rad);
    }
  }
  return b.build();
}

export class GrassAssets {
  /** [LOD ring][GrassType]. Ring 0 has all ten tuft models, the far rings only the four grass kinds (no flowers, fewer blades). */
  readonly lodGeometries: THREE.BufferGeometry[][] = [];
  /** index = GrassType (ring 0) */
  readonly geometries: THREE.BufferGeometry[];
  readonly material: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  private fade = { value: new THREE.Vector2(Config.vegetation.grass.fadeStart, Config.vegetation.grass.fadeEnd) };

  constructor() {
    Config.vegetation.grass.lods.forEach((lod, i) => {
      const n = i === 0 ? GRASS_TYPE_COUNT : 4;
      const list: THREE.BufferGeometry[] = [];
      for (let t = 0; t < n; t++) list.push(make(t, lod.density));
      this.lodGeometries.push(list);
    });
    this.geometries = this.lodGeometries[0];
    this.material = this.makeMaterial();
  }

  /** Wind sway + distance fade in the vertex shader; the sun shining THROUGH the blades (translucency) in the fragment shader. */
  private makeMaterial(): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = this.time;
      shader.uniforms.uGrassFade = this.fade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uGrassTime;\nuniform vec2 uGrassFade;\nattribute float aFlower;\nvarying float vFlower;')
        // flower parts keep their own colour: undo the per-instance green / dry tint for them
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          vFlower = aFlower;
          #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
            vColor.rgb = mix(vColor.rgb, color.rgb, aFlower);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 gip = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float gFade = 1.0 - smoothstep(uGrassFade.x, uGrassFade.y, length(gip.xyz));
            float gph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
            // slow wind gusts that travel across the meadow (waves of bending) + the small fast flutter of each tuft
            float gust = sin(uGrassTime * 0.9 + instanceMatrix[3].x * 0.045 + instanceMatrix[3].z * 0.03) * 0.5 + 0.5;
            float bendAmt = mix(1.0, 0.75, aFlower);
            transformed.x += (sin(uGrassTime * 2.1 + gph) * 0.05 + sin(uGrassTime * 0.8 + gph * 0.5) * 0.04 + gust * 0.09) * position.y * 1.3 * bendAmt;
            transformed.z += (cos(uGrassTime * 1.7 + gph) * 0.04 + gust * 0.03) * position.y * bendAmt;
            transformed *= gFade;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlower;')
        // both sides of a blade are lit like the ground (do not flip the normal on back faces)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
        // REALISM: when the camera looks toward the sun, the light glows through the blades / petals (bright, yellow-green rim)
        .replace(
          '#include <opaque_fragment>',
          `#if NUM_DIR_LIGHTS > 0
            {
              vec3 gView = normalize(-vViewPosition);
              float gBack = pow(clamp(dot(-gView, directionalLights[0].direction), 0.0, 1.0), 3.0);
              float gTip = clamp(dot(vColor.rgb, vec3(0.333)) * 1.1, 0.0, 1.0);
              outgoingLight += diffuseColor.rgb * directionalLights[0].color * gBack * gTip * mix(0.55, 0.3, vFlower) * vec3(1.0, 1.15, 0.55);
            }
          #endif
          #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => 'grass-wind-fade-v3';
    return m;
  }

  update(time: number): void {
    this.time.value = time;
  }

  dispose(): void {
    for (const list of this.lodGeometries) for (const g of list) g.dispose();
    this.material.dispose();
  }
}
