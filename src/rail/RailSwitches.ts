import { RAIL_DESIGN as D } from './RailPlan';
import type { RailLink } from './RailNetwork';

/**
 * STAGE 13 / Step 4: turnouts (switches) and diamond crossings of the station links. Pure geometry (no three.js, no Rapier), shared by
 * the mesh builder and the tests.
 *
 * Switch: where TWO links leave the same end of a line, each of the line's two tracks forks into two routes. The route of the link that
 *   bends less is the straight (stock) route, the other one diverges. The toe (blade tips) is at the end of the line; the frog is where the
 *   two routes are one gauge apart (their inner rails meet). A link end that only ONE link continues is a plain through connection: both
 *   tracks run on into the link, nothing forks, so there is no turnout there.
 * Diamond: where the track of one link crosses the track of another link of the same station at a real angle (>= diamondMinAngle).
 */
export interface RailSwitch {
  id: string;
  station: string;
  /** The line end both links leave. */
  lineId: string;
  end: 'a' | 'b';
  /** Link of the straight (stock) route and link of the diverging route. */
  straight: string;
  diverging: string;
  /** Which track of the double line (-1 = left, +1 = right, seen along the direction into the station). */
  track: -1 | 1;
  /** Which side the diverging route leaves to (-1 left, +1 right). */
  turn: -1 | 1;
  /** Top of ballast (m). */
  level: number;
  /** Toe of the switch (on the track centre line, at the line end) and the unit direction into the station. */
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Switch blade length and distance toe -> frog (m). */
  bladeLen: number;
  frogS: number;
  /** Track centre line of the straight / diverging route every `step` m from the toe to `frogS + tail` (x, z pairs). */
  step: number;
  stock: Float64Array;
  div: Float64Array;
}

export interface RailDiamond {
  id: string;
  station: string;
  linkA: string;
  linkB: string;
  trackA: -1 | 1;
  trackB: -1 | 1;
  level: number;
  /** Where the two track centre lines cross. */
  x: number;
  z: number;
  /** Unit directions of track A / track B at the crossing. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Acute angle between the tracks (deg). */
  angle: number;
  /** The four points where a rail of one track crosses a rail of the other (x, z pairs). */
  corners: number[];
}

interface Poly {
  x: Float64Array;
  z: Float64Array;
}

/** Resample a polyline every `h` m (linear between vertices). */
function resample(xs: ArrayLike<number>, zs: ArrayLike<number>, h: number): { x: number[]; z: number[]; tx: number[]; tz: number[] } {
  const cum = [0];
  for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  const L = cum[cum.length - 1];
  const out = { x: [] as number[], z: [] as number[], tx: [] as number[], tz: [] as number[] };
  let k = 0;
  for (let s = 0; s <= L + 1e-9; s += h) {
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const len = cum[k + 1] - cum[k] || 1;
    const t = Math.min(1, (s - cum[k]) / len);
    out.x.push(xs[k] + (xs[k + 1] - xs[k]) * t);
    out.z.push(zs[k] + (zs[k + 1] - zs[k]) * t);
    out.tx.push((xs[k + 1] - xs[k]) / len);
    out.tz.push((zs[k + 1] - zs[k]) / len);
  }
  return out;
}

/** The centre line of one track (offset `side * trackSpacing / 2` to the left of the direction of the polyline). */
function trackLine(xs: ArrayLike<number>, zs: ArrayLike<number>, side: number): Poly {
  const n = xs.length;
  const x = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = xs[b] - xs[a], tz = zs[b] - zs[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    x[i] = xs[i] + -tz * side * (D.trackSpacing / 2);
    z[i] = zs[i] + tx * side * (D.trackSpacing / 2);
  }
  return { x, z };
}

function distToPoly(px: number, pz: number, p: Poly, from: number, to: number): number {
  let best = Infinity;
  for (let i = Math.max(0, from); i < Math.min(p.x.length - 1, to); i++) {
    const vx = p.x[i + 1] - p.x[i], vz = p.z[i + 1] - p.z[i];
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((px - p.x[i]) * vx + (pz - p.z[i]) * vz) / l2));
    best = Math.min(best, Math.hypot(px - (p.x[i] + vx * t), pz - (p.z[i] + vz * t)));
  }
  return best;
}

/** The link as seen from one of its ends: the centre line starting at that end. */
function fromEnd(l: RailLink, end: 'a' | 'b'): { xs: number[]; zs: number[] } {
  const xs = Array.from(l.xs), zs = Array.from(l.zs);
  if (end === 'b') {
    xs.reverse();
    zs.reverse();
  }
  return { xs, zs };
}

/** Total turning (rad) of the first `len` m of a polyline: decides which of two links is the straight route. */
function turning(xs: number[], zs: number[], len: number): number {
  const r = resample(xs, zs, 1);
  const n = Math.min(r.x.length - 1, Math.round(len));
  return Math.abs(Math.atan2(r.tx[0] * r.tz[n] - r.tz[0] * r.tx[n], r.tx[0] * r.tx[n] + r.tz[0] * r.tz[n]));
}

export function buildSwitches(links: RailLink[]): RailSwitch[] {
  const out: RailSwitch[] = [];
  const groups = new Map<string, { link: RailLink; end: 'a' | 'b' }[]>();
  for (const l of links) {
    for (const [q, end] of [[l.a, 'a'], [l.b, 'b']] as const) {
      // the link's own end `end` is the one that touches the line end q
      const k = `${l.station}|${q.edgeId}|${q.end}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ link: l, end });
    }
  }
  for (const [key, g] of groups) {
    if (g.length < 2) continue;
    const [station, lineId, lineEnd] = key.split('|');
    // the link that bends least in the first 60 m is the straight route
    const ori = g.map((m) => ({ m, p: fromEnd(m.link, m.end) }));
    ori.sort((p, q) => turning(p.p.xs, p.p.zs, 60) - turning(q.p.xs, q.p.zs, 60));
    const S = ori[0];
    for (let o = 1; o < ori.length; o++) {
      const Dv = ori[o];
      const rs = resample(S.p.xs, S.p.zs, 0.5);
      const rd = resample(Dv.p.xs, Dv.p.zs, 0.5);
      const dx0 = rs.tx[0], dz0 = rs.tz[0];
      for (const track of [-1, 1] as const) {
        const ts = trackLine(rs.x, rs.z, track);
        const td = trackLine(rd.x, rd.z, track);
        // first distance at which the diverging track is one gauge away from the straight one
        let frogJ = -1;
        let turn: -1 | 1 = 1;
        for (let j = 1; j < td.x.length; j++) {
          const d = distToPoly(td.x[j], td.z[j], ts, j - 24, j + 24);
          if (d >= D.gauge) {
            frogJ = j;
            const side = (td.x[j] - ts.x[j]) * -dz0 + (td.z[j] - ts.z[j]) * dx0;
            turn = side >= 0 ? 1 : -1;
            break;
          }
        }
        if (frogJ < 0) continue;
        const frogS = frogJ * 0.5;
        const tail = 6;
        const nOut = Math.min(ts.x.length, td.x.length, Math.floor((frogS + tail) / 0.5) + 1);
        const cnt = Math.floor((nOut - 1) / 2) + 1; // one sample per metre
        const stock = new Float64Array(cnt * 2), div = new Float64Array(cnt * 2);
        for (let q = 0; q < cnt; q++) {
          stock[q * 2] = ts.x[q * 2];
          stock[q * 2 + 1] = ts.z[q * 2];
          div[q * 2] = td.x[q * 2];
          div[q * 2 + 1] = td.z[q * 2];
        }
        out.push({
          id: `${station}:${lineId}:${lineEnd}:${track < 0 ? 'L' : 'R'}`,
          station,
          lineId,
          end: lineEnd as 'a' | 'b',
          straight: S.m.link.id,
          diverging: Dv.m.link.id,
          track,
          turn,
          level: S.m.link.level,
          x: ts.x[0],
          z: ts.z[0],
          dx: dx0,
          dz: dz0,
          bladeLen: Math.min(D.switchBladeMax, 0.55 * frogS),
          frogS,
          step: 1,
          stock,
          div,
        });
      }
    }
  }
  return out;
}

function segHit(a: number[], b: number[], c: number[], d: number[]): { x: number; z: number; ang: number } | null {
  const r1x = b[0] - a[0], r1z = b[1] - a[1], r2x = d[0] - c[0], r2z = d[1] - c[1];
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * r2z - (c[1] - a[1]) * r2x) / den;
  const u = ((c[0] - a[0]) * r1z - (c[1] - a[1]) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const ang = Math.abs(Math.atan2(r1x * r2z - r1z * r2x, r1x * r2x + r1z * r2z));
  return { x: a[0] + r1x * t, z: a[1] + r1z * t, ang: Math.min(ang, Math.PI - ang) };
}

export function buildDiamonds(links: RailLink[]): RailDiamond[] {
  const out: RailDiamond[] = [];
  const g2 = D.gauge / 2;
  for (let i = 0; i < links.length; i++) {
    for (let j = i + 1; j < links.length; j++) {
      const A = links[i], B = links[j];
      if (A.station !== B.station) continue;
      for (const ka of [-1, 1] as const) {
        for (const kb of [-1, 1] as const) {
          const pa = trackLine(A.xs, A.zs, ka), pb = trackLine(B.xs, B.zs, kb);
          const seen: { x: number; z: number }[] = [];
          for (let p = 0; p < pa.x.length - 1; p++) {
            for (let q = 0; q < pb.x.length - 1; q++) {
              const h = segHit([pa.x[p], pa.z[p]], [pa.x[p + 1], pa.z[p + 1]], [pb.x[q], pb.z[q]], [pb.x[q + 1], pb.z[q + 1]]);
              if (!h || (h.ang * 180) / Math.PI < D.diamondMinAngle) continue;
              if (seen.some((s) => Math.hypot(s.x - h.x, s.z - h.z) < 0.5)) continue;
              seen.push(h);
              let ax = pa.x[p + 1] - pa.x[p], az = pa.z[p + 1] - pa.z[p];
              let bx = pb.x[q + 1] - pb.x[q], bz = pb.z[q + 1] - pb.z[q];
              let l = Math.hypot(ax, az) || 1;
              ax /= l;
              az /= l;
              l = Math.hypot(bx, bz) || 1;
              bx /= l;
              bz /= l;
              // rails of A: (p - X) . nA = +-g/2, rails of B: (p - X) . nB = +-g/2
              const nax = -az, naz = ax, nbx = -bz, nbz = bx;
              const det = nax * nbz - naz * nbx;
              const corners: number[] = [];
              for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
                corners.push(h.x + (sa * g2 * nbz - naz * sb * g2) / det, h.z + (nax * sb * g2 - nbx * sa * g2) / det);
              }
              out.push({ id: `${A.station}:${A.id}|${B.id}:${ka < 0 ? 'L' : 'R'}${kb < 0 ? 'L' : 'R'}`, station: A.station, linkA: A.id, linkB: B.id, trackA: ka, trackB: kb, level: A.level, x: h.x, z: h.z, ax, az, bx, bz, angle: (h.ang * 180) / Math.PI, corners });
            }
          }
        }
      }
    }
  }
  return out;
}
