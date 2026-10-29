import type { EN } from './Projection';

/** Ground control point: a pixel of the reference image and the projected coordinate it sits on. */
export interface Gcp {
  id: string;
  /** Image pixel, (0,0) = top-left corner of the image, x right, y down. Fractions allowed. */
  px: number;
  py: number;
  e: number;
  n: number;
}

export interface Bounds {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
}

/**
 * Affine map between reference-image pixels and projected metres:
 *   E = a*px + b*py + c        N = d*px + e*py + f
 *
 * - 2 control points  -> north-up image (no rotation), each axis scaled separately.
 * - 3+ control points -> full least-squares affine (handles rotation / skew too). Add points to improve accuracy.
 */
export class GeoRef {
  private constructor(
    private readonly a: number,
    private readonly b: number,
    private readonly c: number,
    private readonly d: number,
    private readonly e: number,
    private readonly f: number,
    readonly width: number,
    readonly height: number,
    readonly mode: 'two-point-north-up' | 'least-squares-affine',
  ) {}

  static fit(gcps: readonly Gcp[], width: number, height: number): GeoRef {
    if (gcps.length < 2) throw new Error('GeoRef needs at least 2 control points');
    if (gcps.length === 2) {
      const [p, q] = gcps;
      const dpx = q.px - p.px;
      const dpy = q.py - p.py;
      if (dpx === 0 || dpy === 0) throw new Error('GeoRef: the 2 control points must differ in both pixel x and y');
      const a = (q.e - p.e) / dpx;
      const e = (q.n - p.n) / dpy; // negative: pixel y grows southwards
      return new GeoRef(a, 0, p.e - a * p.px, 0, e, p.n - e * p.py, width, height, 'two-point-north-up');
    }
    // Normal equations for [px py 1] * coef = target, solved for E and N together.
    let sxx = 0;
    let sxy = 0;
    let sx = 0;
    let syy = 0;
    let sy = 0;
    const s1 = gcps.length;
    let bxE = 0;
    let byE = 0;
    let b1E = 0;
    let bxN = 0;
    let byN = 0;
    let b1N = 0;
    for (const g of gcps) {
      sxx += g.px * g.px;
      sxy += g.px * g.py;
      sx += g.px;
      syy += g.py * g.py;
      sy += g.py;
      bxE += g.px * g.e;
      byE += g.py * g.e;
      b1E += g.e;
      bxN += g.px * g.n;
      byN += g.py * g.n;
      b1N += g.n;
    }
    const M = [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, s1],
    ];
    const cE = solve3(M, [bxE, byE, b1E]);
    const cN = solve3(M, [bxN, byN, b1N]);
    return new GeoRef(cE[0], cE[1], cE[2], cN[0], cN[1], cN[2], width, height, 'least-squares-affine');
  }

  pixelToEN(px: number, py: number, out: EN = { e: 0, n: 0 }): EN {
    out.e = this.a * px + this.b * py + this.c;
    out.n = this.d * px + this.e * py + this.f;
    return out;
  }

  enToPixel(e: number, n: number, out: { px: number; py: number } = { px: 0, py: 0 }): { px: number; py: number } {
    const det = this.a * this.e - this.b * this.d;
    const de = e - this.c;
    const dn = n - this.f;
    out.px = (this.e * de - this.b * dn) / det;
    out.py = (-this.d * de + this.a * dn) / det;
    return out;
  }

  /** Axis-aligned box around the whole image (exact for north-up images). */
  bounds(): Bounds {
    const cs = [this.pixelToEN(0, 0), this.pixelToEN(this.width, 0), this.pixelToEN(0, this.height), this.pixelToEN(this.width, this.height)];
    return {
      minE: Math.min(...cs.map((c) => c.e)),
      maxE: Math.max(...cs.map((c) => c.e)),
      minN: Math.min(...cs.map((c) => c.n)),
      maxN: Math.max(...cs.map((c) => c.n)),
    };
  }

  /** Metres per pixel along image x and along image y. */
  metresPerPixel(): { x: number; y: number } {
    return { x: Math.hypot(this.a, this.d), y: Math.hypot(this.b, this.e) };
  }

  /** Distance (m) between where each control point lands and where it should be. ~0 for 2 points. */
  residuals(gcps: readonly Gcp[]): { id: string; metres: number }[] {
    return gcps.map((g) => {
      const p = this.pixelToEN(g.px, g.py);
      return { id: g.id, metres: Math.hypot(p.e - g.e, p.n - g.n) };
    });
  }
}

function solve3(m: number[][], r: number[]): [number, number, number] {
  const det3 = (a: number[][]): number =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det3(m);
  if (Math.abs(d) < 1e-9) throw new Error('GeoRef: control points are collinear / degenerate');
  const col = (k: number): number[][] => m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
  return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
}
