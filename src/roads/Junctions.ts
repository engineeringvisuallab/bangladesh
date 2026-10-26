import { Config } from '../core/Config';
import type { TerrainSample } from '../terrain/Lakes';
import type { PadSpec, RoadKind, RoadSpec } from './RoadTypes';

/**
 * ENGINEERED INTERSECTIONS (Stage 6E).
 *
 * Before this stage every road simply ran to the junction point and the ribbons of the different roads overlapped
 * (z-fighting, torn asphalt, lane lines running over each other, no turning radius, shallow merges of 10-20 degrees).
 *
 * A real at-grade junction is designed like this, and so is this code:
 *   1. CLUSTER      road ends that lie together (+ the through roads passing there) form one junction.
 *   2. GEOMETRY     the approach legs are straightened and the angles are corrected: a T-junction meets its through road
 *                   at 90 degrees (skew angle >= 60 degrees is the engineering minimum), several legs are at least 60 degrees apart.
 *   3. KERB RETURNS every corner gets a circular fillet whose radius follows the road class (freeway 22 m ... local street 9 m).
 *   4. PAD          the carriageway of the junction is ONE flat plane-polygon (+ gravel shoulder); the terrain is levelled to it;
 *                   the ribbons of the legs are trimmed where the pad begins, so nothing overlaps.
 *   5. MARKINGS     zebra crossing and stop line on the minor legs (not on freeways).
 */

type Natural = (x: number, z: number, out: TerrainSample) => void;

const TAU = Math.PI * 2;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const wrap = (a: number): number => {
  const m = a % TAU;
  return m < 0 ? m + TAU : m;
};

/** Length (m) of the straight, flat "stub" of each leg (minimum; corners may need more). */
const STUB: Record<RoadKind, number> = { highway: 34, arterial: 30, collector: 26, local: 22, roundabout: 22 };
/** Kerb-return radius (m) per road class. */
const KERB: Record<RoadKind, number> = { highway: 22, arterial: 16, collector: 12, local: 9, roundabout: 9 };
const CLUSTER_R = 30;
const THROUGH_R = 22;
/** Beyond this distance (m) from the junction the original road line is untouched. */
const BLEND_END = 95;
const MIN_ARM = 60;
const MIN_PAD_SPACING = 105;

interface Arm {
  road: RoadSpec;
  dir: 1 | -1;
  idx0: number;
  theta0: number;
  theta: number;
  fixed: boolean;
  line: Arm | null;
  hw: number;
  sh: number;
  /** Vertex indices along the leg and their distance (m) from vertex idx0 along the ORIGINAL polyline. */
  ks: number[];
  s: number[];
  sEnd: number;
  mEnd: number;
}

interface Cluster {
  ends: { r: RoadSpec; i: number }[];
  through: { r: RoadSpec; j: number }[];
}

export interface PadResult {
  pads: PadSpec[];
  /** Per road: 1 = vertex is inside a junction stub (the ribbon between two such vertices is replaced by the pad). */
  trimmed: Map<number, Uint8Array>;
  skipped: string[];
}

function armPath(r: RoadSpec, idx0: number, dir: 1 | -1): { ks: number[]; s: number[] } {
  const ks = [idx0];
  const s = [0];
  let acc = 0;
  for (let k = idx0 + dir; k >= 0 && k < r.xs.length; k += dir) {
    acc += Math.hypot(r.xs[k] - r.xs[k - dir], r.zs[k] - r.zs[k - dir]);
    ks.push(k);
    s.push(acc);
  }
  return { ks, s };
}

function findClusters(roads: RoadSpec[]): Cluster[] {
  const ends: { r: RoadSpec; i: number; x: number; z: number }[] = [];
  for (const r of roads) {
    if (r.closed || r.kind === 'roundabout') continue;
    const n = r.xs.length;
    ends.push({ r, i: 0, x: r.xs[0], z: r.zs[0] });
    ends.push({ r, i: n - 1, x: r.xs[n - 1], z: r.zs[n - 1] });
  }
  const par = ends.map((_, i) => i);
  const find = (a: number): number => (par[a] === a ? a : (par[a] = find(par[a])));
  for (let a = 0; a < ends.length; a++) {
    for (let b = a + 1; b < ends.length; b++) {
      if (Math.hypot(ends[a].x - ends[b].x, ends[a].z - ends[b].z) < CLUSTER_R) par[find(a)] = find(b);
    }
  }
  const groups = new Map<number, typeof ends>();
  ends.forEach((e, i) => {
    const k = find(i);
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  });
  const out: Cluster[] = [];
  for (const g of groups.values()) {
    const cx = g.reduce((s, e) => s + e.x, 0) / g.length;
    const cz = g.reduce((s, e) => s + e.z, 0) / g.length;
    const through: { r: RoadSpec; j: number }[] = [];
    for (const o of roads) {
      if (o.closed || o.kind === 'roundabout' || g.some((e) => e.r === o)) continue;
      let bd = Infinity;
      let bj = -1;
      for (let j = 0; j < o.xs.length; j++) {
        const d = Math.hypot(o.xs[j] - cx, o.zs[j] - cz);
        if (d < bd) {
          bd = d;
          bj = j;
        }
      }
      if (bd < THROUGH_R) through.push({ r: o, j: bj });
    }
    if (g.length + through.length * 2 < 2) continue;
    if (g.length === 1 && through.length === 0) continue;
    out.push({ ends: g.map((e) => ({ r: e.r, i: e.i })), through });
  }
  return out;
}

/** Angle (rad) of the leg direction measured over ~28 m. */
function legAngle(r: RoadSpec, ks: number[], s: number[]): number {
  let q = 1;
  while (q < ks.length - 1 && s[q] < 28) q++;
  return Math.atan2(r.zs[ks[q]] - r.zs[ks[0]], r.xs[ks[q]] - r.xs[ks[0]]);
}

interface Corner {
  gap: number;
  mode: 'fillet' | 'straight' | 'mitre';
  X: number[];
  tt: number;
  r: number;
  O: number[];
  sXa: number;
  sXb: number;
}

function corner(a: Arm, b: Arm, c: number[]): Corner {
  const gap = wrap(b.theta - a.theta) || TAU;
  const dAx = Math.cos(a.theta);
  const dAz = Math.sin(a.theta);
  const dBx = Math.cos(b.theta);
  const dBz = Math.sin(b.theta);
  const cAx = -dAz;
  const cAz = dAx;
  const cBx = -dBz;
  const cBz = dBx;
  const rx = -(cAx * a.hw + cBx * b.hw);
  const rz = -(cAz * a.hw + cBz * b.hw);
  const det = -dAx * dBz + dBx * dAz;
  const straight: Corner = { gap, mode: 'straight', X: [c[0], c[1]], tt: 0, r: 0, O: [0, 0], sXa: 0, sXb: 0 };
  if (Math.abs(det) < 0.08 || Math.abs(gap - Math.PI) < (12 * Math.PI) / 180) return straight;
  const u = (-rx * dBz + dBx * rz) / det;
  const v = (dAx * rz - dAz * rx) / det;
  const X = [c[0] + cAx * a.hw + dAx * u, c[1] + cAz * a.hw + dAz * u];
  if (gap > Math.PI) {
    if (Math.hypot(X[0] - c[0], X[1] - c[1]) > 45) return straight;
    return { gap, mode: 'mitre', X, tt: 0, r: 0, O: [0, 0], sXa: u, sXb: v };
  }
  const k = KERB[a.road.kind] > KERB[b.road.kind] ? KERB[a.road.kind] : KERB[b.road.kind];
  const half = gap / 2;
  const r = Math.max(3, Math.min(k, 20 * Math.tan(half)));
  const tt = r / Math.tan(half);
  const bx = dAx + dBx;
  const bz = dAz + dBz;
  const bl = Math.hypot(bx, bz) || 1;
  const O = [X[0] + (bx / bl) * (r / Math.sin(half)), X[1] + (bz / bl) * (r / Math.sin(half))];
  return { gap, mode: 'fillet', X, tt, r, O, sXa: u, sXb: v };
}

/**
 * Builds all junction pads. The legs are straightened IN PLACE (road xs / zs / normals / cum change near the junctions;
 * heights are untouched), so call it once, after every road of every tier exists.
 */
export function buildJunctionPads(roads: RoadSpec[], natural: Natural): PadResult {
  const pads: PadSpec[] = [];
  const trimmed = new Map<number, Uint8Array>();
  const skipped: string[] = [];
  const sc: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };
  const wetAt = (x: number, z: number): boolean => {
    natural(x, z, sc);
    return sc.h < 2 || (!Number.isNaN(sc.water) && sc.h < sc.water + 0.4);
  };

  const clusters = findClusters(roads);
  const bestTier = (c: Cluster): number => Math.min(...c.ends.map((e) => e.r.tier), ...c.through.map((t) => t.r.tier));
  const armCount = (c: Cluster): number => c.ends.length + c.through.length * 2;
  clusters.sort((p, q) => bestTier(p) - bestTier(q) || armCount(q) - armCount(p));

  for (const cl of clusters) {
    const tag = `${cl.ends.map((e) => e.r.name).join('+')}${cl.through.length ? ' x ' + cl.through.map((t) => t.r.name).join('+') : ''}`;
    const reject = (why: string): void => {
      skipped.push(`${tag}: ${why}`);
    };

    // ---------- arms ----------
    const arms: Arm[] = [];
    const mk = (r: RoadSpec, idx0: number, dir: 1 | -1, fixed: boolean): Arm => {
      const { ks, s } = armPath(r, idx0, dir);
      return { road: r, dir, idx0, theta0: legAngle(r, ks, s), theta: 0, fixed, line: null, hw: r.halfWidth, sh: r.shoulder, ks, s, sEnd: 0, mEnd: 0 };
    };
    for (const e of cl.ends) arms.push(mk(e.r, e.i, e.i === 0 ? 1 : -1, false));
    // primary through road = best class, then widest
    const thr = [...cl.through].sort((p, q) => p.r.tier - q.r.tier || q.r.halfWidth - p.r.halfWidth);
    thr.forEach((t, idx) => {
      const a = mk(t.r, t.j, 1, idx === 0);
      const b = mk(t.r, t.j, -1, idx === 0);
      // a through road is one straight line across the junction: its tangent at the vertex (central difference over ~28 m)
      let q = 1;
      while (q < a.ks.length - 1 && a.s[q] < 28) q++;
      let q2 = 1;
      while (q2 < b.ks.length - 1 && b.s[q2] < 28) q2++;
      a.theta0 = Math.atan2(t.r.zs[a.ks[q]] - t.r.zs[b.ks[q2]], t.r.xs[a.ks[q]] - t.r.xs[b.ks[q2]]);
      b.theta0 = wrap(a.theta0 + Math.PI);
      a.line = b;
      b.line = a;
      arms.push(a, b);
    });
    const n = arms.length;
    if (n < 2) continue;
    // local streets are short (a city block): their legs only need Config.city.localRoads.minArm
    if (arms.some((a) => a.s[a.s.length - 1] < (a.road.tier === 4 ? Config.city.localRoads.minArm : MIN_ARM))) {
      reject('leg too short');
      continue;
    }
    if (new Set(arms.filter((a) => !a.line).map((a) => a.road.id)).size !== arms.filter((a) => !a.line).length) {
      reject('a road ends twice here');
      continue;
    }
    // no two junctions closer than MIN_PAD_SPACING
    let cx = 0;
    let cz = 0;
    if (thr.length > 0) {
      cx = thr[0].r.xs[thr[0].j];
      cz = thr[0].r.zs[thr[0].j];
    } else {
      for (const e of cl.ends) {
        cx += e.r.xs[e.i];
        cz += e.r.zs[e.i];
      }
      cx /= cl.ends.length;
      cz /= cl.ends.length;
    }
    const hasLocal = arms.some((a) => a.road.tier === 4);
    const tooClose = (p: PadSpec): boolean => {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (!hasLocal) return d < MIN_PAD_SPACING;
      const padLocal = p.arms.every((a) => a.kind === 'local');
      return d < (padLocal ? Config.city.localRoads.minPadSpacing : Config.city.localRoads.mixedPadSpacing);
    };
    if (pads.some(tooClose)) {
      reject('another junction too close');
      continue;
    }
    // bridges near the junction: leave the old geometry alone
    if (arms.some((a) => a.ks.some((k, m) => a.s[m] <= BLEND_END + 20 && a.road.bridgeOf[k] >= 0))) {
      reject('bridge within 115 m');
      continue;
    }

    // ---------- 2. angles ----------
    for (const a of arms) a.theta = a.theta0;
    const primary = arms.find((a) => a.fixed && a.line);
    if (primary) {
      // T / cross: a leg joining the primary road meets it at 90 degrees (when it is alone on its side)
      const free = arms.filter((a) => !a.fixed && !a.line);
      const side = (a: Arm): number => (Math.sin(a.theta0 - primary.theta) >= 0 ? 1 : -1);
      for (const a of free) {
        if (free.filter((b) => side(b) === side(a)).length === 1) a.theta = wrap(primary.theta + side(a) * (Math.PI / 2));
      }
    }
    if (n >= 3) {
      const MING = Math.min((60 * Math.PI) / 180, (330 * Math.PI) / 180 / n);
      for (let it = 0; it < 80; it++) {
        const sorted = [...arms].sort((p, q) => wrap(p.theta) - wrap(q.theta));
        let moved = false;
        for (let i = 0; i < n; i++) {
          const a = sorted[i];
          const b = sorted[(i + 1) % n];
          const gap = wrap(b.theta - a.theta);
          if (gap >= MING - 1e-4) continue;
          const def = MING - gap;
          const rot = (x: Arm, d: number): void => {
            if (x.fixed) return;
            x.theta = wrap(x.theta + d);
            if (x.line) x.line.theta = wrap(x.line.theta + d);
          };
          if (a.fixed && b.fixed) continue;
          if (a.fixed) rot(b, def);
          else if (b.fixed) rot(a, -def);
          else if (a.line === b || b.line === a) continue;
          else {
            rot(a, -def / 2);
            rot(b, def / 2);
          }
          moved = true;
        }
        if (!moved) break;
      }
      const sorted = [...arms].sort((p, q) => wrap(p.theta) - wrap(q.theta));
      let minGap = TAU;
      for (let i = 0; i < n; i++) minGap = Math.min(minGap, wrap(sorted[(i + 1) % n].theta - sorted[i].theta));
      if (minGap < (MING * 0.9)) {
        reject(`legs too close (${((minGap * 180) / Math.PI).toFixed(0)} deg)`);
        continue;
      }
    } else {
      // two legs only: a straight continuation needs no junction; a sharp bend is not a normal road
      const gap = wrap(arms[1].theta - arms[0].theta);
      const inner = Math.min(gap, TAU - gap);
      if (inner > (168 * Math.PI) / 180) continue;
      if (inner < (50 * Math.PI) / 180) {
        reject('bend sharper than 50 deg');
        continue;
      }
    }

    // ---------- 3. corners and stub lengths ----------
    const order = [...arms].sort((p, q) => wrap(p.theta) - wrap(q.theta));
    const C = [cx, cz];
    const corners: Corner[] = order.map((a, i) => corner(a, order[(i + 1) % n], C));
    const need = new Map<Arm, number>();
    for (const a of order) need.set(a, STUB[a.road.kind]);
    for (let i = 0; i < n; i++) {
      const cr = corners[i];
      const a = order[i];
      const b = order[(i + 1) % n];
      if (cr.mode === 'fillet') {
        need.set(a, Math.max(need.get(a)!, cr.sXa + cr.tt + 2.5));
        need.set(b, Math.max(need.get(b)!, cr.sXb + cr.tt + 2.5));
      } else if (cr.mode === 'mitre') {
        need.set(a, Math.max(need.get(a)!, cr.sXa + 2.5));
        need.set(b, Math.max(need.get(b)!, cr.sXb + 2.5));
      }
    }
    let bad = false;
    for (const a of order) {
      const want = need.get(a)!;
      let m = 0;
      while (m < a.s.length - 1 && a.s[m] < want) m++;
      a.mEnd = m;
      a.sEnd = a.s[m];
      if (want > 66 || a.s[a.s.length - 1] < a.sEnd + 28) bad = true;
    }
    if (bad) {
      reject('corner needs a stub longer than 66 m');
      continue;
    }

    // ---------- reshape the legs (computed first, committed only if everything is valid) ----------
    const posNew = new Map<Arm, number[][]>();
    let ok = true;
    for (const a of arms) {
      const dx = Math.cos(a.theta);
      const dz = Math.sin(a.theta);
      const straightTo = a.sEnd + 6;
      const list: number[][] = [];
      for (let m = 0; m < a.ks.length && a.s[m] <= BLEND_END; m++) {
        const k = a.ks[m];
        const sx = cx + dx * a.s[m];
        const sz = cz + dz * a.s[m];
        const w = smoothstep(straightTo, BLEND_END, a.s[m]);
        const x = sx + (a.road.xs[k] - sx) * w;
        const z = sz + (a.road.zs[k] - sz) * w;
        if (wetAt(x, z)) {
          ok = false;
          break;
        }
        list.push([x, z]);
      }
      if (!ok) break;
      posNew.set(a, list);
    }
    if (!ok) {
      reject('a leg would run into water');
      continue;
    }

    // ---------- plane of the pad ----------
    // With a primary through road the pad keeps ITS profile (slope along the road, no cross slope: the minor legs meet a level
    // carriageway); otherwise (hub of several road ends) the pad is level at the height all the roads share at the node.
    let y0 = 0;
    let pb = 0;
    let pc = 0;
    const gmax = Math.max(...arms.map((a) => a.road.maxGrade));
    if (primary) {
      const ux = Math.cos(primary.theta);
      const uz = Math.sin(primary.theta);
      // the pad is anchored to the primary road's own height at the centre; the slope is the least-squares slope through that point
      y0 = primary.road.ys[primary.idx0];
      let stt = 0;
      let sty = 0;
      for (const a of [primary, primary.line!]) {
        const list = posNew.get(a)!;
        for (let m = 0; m < list.length && a.s[m] <= a.sEnd + 8; m++) {
          const t = (list[m][0] - cx) * ux + (list[m][1] - cz) * uz;
          stt += t * t;
          sty += t * (a.road.ys[a.ks[m]] - y0);
        }
      }
      let gs = stt > 1e-6 ? sty / stt : 0;
      gs = Math.max(-gmax, Math.min(gmax, gs));
      pb = gs * ux;
      pc = gs * uz;
    } else {
      let sy = 0;
      for (const a of arms) sy += a.road.ys[a.idx0];
      y0 = sy / n;
      // a junction of local streets only: the plane is tilted to fit the streets (least squares through the leg points), so a street on
      // a gentle slope runs straight into the pad instead of being re-graded with a steep ramp
      if (arms.every((a) => a.road.tier === 4)) {
        let sxx = 0;
        let sxz = 0;
        let szz = 0;
        let sxy = 0;
        let szy = 0;
        for (const a of arms) {
          const list = posNew.get(a)!;
          for (let m = 0; m < list.length && a.s[m] <= a.sEnd + 8; m++) {
            const dx = list[m][0] - cx;
            const dz = list[m][1] - cz;
            const dy = a.road.ys[a.ks[m]] - y0;
            sxx += dx * dx;
            sxz += dx * dz;
            szz += dz * dz;
            sxy += dx * dy;
            szy += dz * dy;
          }
        }
        const det = sxx * szz - sxz * sxz;
        if (det > 1e-3) {
          const lim = Config.city.localRoads.padTilt;
          pb = Math.max(-lim, Math.min(lim, (sxy * szz - szy * sxz) / det));
          pc = Math.max(-lim, Math.min(lim, (szy * sxx - sxy * sxz) / det));
        }
      }
    }
    const planeAt = (x: number, z: number): number => y0 + pb * (x - cx) + pc * (z - cz);

    // ---------- re-grade the minor legs: level inside the pad, then a grade-limited ramp back to the planned profile ----------
    const ysNew = new Map<Arm, number[]>();
    for (const a of arms) {
      if (a === primary || a === primary?.line) continue;
      const list = posNew.get(a)!;
      const out: number[] = [];
      const gl = a.road.maxGrade * 0.99;
      let lowB = 0;
      let upB = 0;
      let same = 0;
      for (let m = 0; m < a.ks.length; m++) {
        const k = a.ks[m];
        const orig = a.road.ys[k];
        if (a.s[m] <= a.sEnd) {
          const p = m < list.length ? list[m] : [a.road.xs[k], a.road.zs[k]];
          out.push(planeAt(p[0], p[1]));
          lowB = upB = out[m];
          continue;
        }
        const chord = a.s[m] - a.s[m - 1];
        lowB -= gl * chord;
        upB += gl * chord;
        const y = Math.min(Math.max(orig, lowB), upB);
        out.push(y);
        // back on the planned profile for good: stop re-grading (the rest of the road is untouched)
        if (Math.abs(y - orig) < 1e-4) {
          if (++same >= 3) break;
        } else same = 0;
      }
      ysNew.set(a, out);
    }
    // the re-grade may not touch a bridge deck or another junction's stub (those heights are fixed)
    for (const [a, ys] of ysNew) {
      const tr = trimmed.get(a.road.id);
      for (let m = 0; m < ys.length; m++) {
        const k = a.ks[m];
        const changed = Math.abs(ys[m] - a.road.ys[k]) > 0.02;
        if (changed && (a.road.bridgeOf[k] >= 0 || (tr && tr[k] && a.s[m] > a.sEnd))) ok = false;
      }
      // a ramp that never meets the planned profile again before the road ends would break the junction at the far end
      if (ys.length === a.ks.length && Math.abs(ys[ys.length - 1] - a.road.ys[a.ks[a.ks.length - 1]]) > 0.05) ok = false;
    }
    if (!ok) {
      reject('re-grade would reach a bridge / another junction');
      continue;
    }

    // ---------- commit ----------
    const carried = new Set<RoadSpec>();
    const mine = new Set<RoadSpec>(arms.map((a) => a.road));
    for (const [a, list] of posNew) {
      for (let m = 0; m < list.length; m++) {
        const k = a.ks[m];
        const ox = a.road.xs[k];
        const oz = a.road.zs[k];
        // a road of ANOTHER junction that ends exactly on this vertex moves with it (it stays attached)
        for (const r of roads) {
          if (mine.has(r) || r.closed) continue;
          for (const e of [0, r.xs.length - 1]) {
            if (Math.hypot(r.xs[e] - ox, r.zs[e] - oz) < 1.5) {
              r.xs[e] = list[m][0];
              r.zs[e] = list[m][1];
              carried.add(r);
            }
          }
        }
        a.road.xs[k] = list[m][0];
        a.road.zs[k] = list[m][1];
      }
    }
    for (const r of carried) {
      const pin = new Uint8Array(r.xs.length);
      pin[0] = 1;
      pin[pin.length - 1] = 1;
      const old = trimmed.get(r.id);
      if (old) for (let i = 0; i < pin.length; i++) if (old[i]) pin[i] = 1;
      for (let i = 0; i < pin.length; i++) if (r.bridgeOf[i] >= 0) pin[i] = 1;
      refreshRoad(r, natural, sc, pin);
    }
    for (const [a, ys] of ysNew) for (let m = 0; m < ys.length; m++) a.road.ys[a.ks[m]] = ys[m];
    const touched = new Set<RoadSpec>(arms.map((a) => a.road));
    for (const r of touched) {
      const pin = new Uint8Array(r.xs.length);
      for (const a of arms) if (a.road === r) for (let m = 0; m <= a.mEnd; m++) pin[a.ks[m]] = 1;
      const old = trimmed.get(r.id);
      if (old) for (let i = 0; i < pin.length; i++) if (old[i]) pin[i] = 1;
      // bridge decks and the road ends keep their heights too
      for (let i = 0; i < pin.length; i++) if (r.bridgeOf[i] >= 0) pin[i] = 1;
      pin[0] = 1;
      pin[pin.length - 1] = 1;
      refreshRoad(r, natural, sc, pin);
    }

    // ---------- outline, gravel outline, markings ----------
    const outline: number[] = [];
    const gravel: number[] = [];
    const push = (p: number[], g: number[]): void => {
      outline.push(p[0], p[1]);
      gravel.push(g[0], g[1]);
    };
    const marks: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = order[i];
      const b = order[(i + 1) % n];
      const dAx = Math.cos(a.theta);
      const dAz = Math.sin(a.theta);
      const cAx = -dAz;
      const cAz = dAx;
      const dBx = Math.cos(b.theta);
      const dBz = Math.sin(b.theta);
      const cBx = -dBz;
      const cBz = dBx;
      // cap of leg a (A = clockwise edge, B = counter-clockwise edge) - done once per leg, at its own turn
      const px = cx + dAx * a.sEnd;
      const pz = cz + dAz * a.sEnd;
      push([px - cAx * a.hw, pz - cAz * a.hw], [px - cAx * (a.hw + a.sh), pz - cAz * (a.hw + a.sh)]);
      push([px + cAx * a.hw, pz + cAz * a.hw], [px + cAx * (a.hw + a.sh), pz + cAz * (a.hw + a.sh)]);
      // corner between a and b
      const cr = corners[i];
      const shAvg = (a.sh + b.sh) / 2;
      if (cr.mode === 'fillet') {
        const T1 = [cr.X[0] + dAx * cr.tt, cr.X[1] + dAz * cr.tt];
        const T2 = [cr.X[0] + dBx * cr.tt, cr.X[1] + dBz * cr.tt];
        const f1 = Math.atan2(T1[1] - cr.O[1], T1[0] - cr.O[0]);
        const f2 = Math.atan2(T2[1] - cr.O[1], T2[0] - cr.O[0]);
        let sweep = f2 - f1;
        while (sweep > Math.PI) sweep -= TAU;
        while (sweep < -Math.PI) sweep += TAU;
        const steps = Math.max(3, Math.ceil(Math.abs(sweep) / ((10 * Math.PI) / 180)));
        const rg = Math.max(0.5, cr.r - shAvg);
        for (let q = 0; q <= steps; q++) {
          const f = f1 + (sweep * q) / steps;
          const ux = Math.cos(f);
          const uz = Math.sin(f);
          push([cr.O[0] + ux * cr.r, cr.O[1] + uz * cr.r], [cr.O[0] + ux * rg, cr.O[1] + uz * rg]);
        }
      } else if (cr.mode === 'mitre') {
        // outer corner of a bend: sharp corner of the two edges; gravel = pushed outwards along the bisector
        const bx = -(dAx + dBx);
        const bz = -(dAz + dBz);
        const bl = Math.hypot(bx, bz) || 1;
        push(cr.X, [cr.X[0] - (bx / bl) * shAvg * 1.2, cr.X[1] - (bz / bl) * shAvg * 1.2]);
      }
      // 'straight': nothing to add, the next leg's cap follows
      void cBx;
      void cBz;
    }
    // the first cap vertex was pushed before the corner of the previous leg: rotate the list so the polygon is closed properly
    // (every leg pushed [A, B, corner...]; the corner belongs between B(i) and A(i+1) - exactly the order produced above)

    // zebra crossings + stop lines on the minor legs of normal roads
    const tiers = arms.map((a) => a.road.tier);
    const best = Math.min(...tiers);
    const allSame = tiers.every((t) => t === best);
    for (const a of arms) {
      if (a.road.kind === 'highway') continue;
      if (!(allSame || a.road.tier > best)) continue;
      const dx = Math.cos(a.theta);
      const dz = Math.sin(a.theta);
      const lx = -dz;
      const lz = dx;
      const quad = (kind: number, s0: number, s1: number, l0: number, l1: number): void => {
        marks.push(kind);
        for (const [s, l] of [[s0, l0], [s1, l0], [s1, l1], [s0, l1]]) marks.push(cx + dx * s + lx * l, cz + dz * s + lz * l);
      };
      const zs0 = a.sEnd - 9;
      const zs1 = a.sEnd - 6;
      for (let l = -a.hw + 0.7; l + 0.55 <= a.hw - 0.5; l += 1.15) quad(-1, zs0, zs1, l, l + 0.55);
      // incoming half only (left-hand traffic: vehicles approaching the junction keep to the left, = the negative side here)
      const med = a.hw > 6 ? 0.9 : 0.2;
      quad(-1, a.sEnd - 4.2, a.sEnd - 3.6, -a.hw + 0.35, -med);
    }

    // ---------- radius of the levelled area ----------
    let rCore = 0;
    for (let q = 0; q < outline.length; q += 2) {
      rCore = Math.max(rCore, Math.hypot(outline[q] - cx, outline[q + 1] - cz), Math.hypot(gravel[q] - cx, gravel[q + 1] - cz));
    }
    rCore += 1.5;
    // sample the pad area for water (leg stubs were checked above, the corners are not)
    let wet = false;
    for (let q = 0; q < outline.length && !wet; q += 6) wet = wetAt(outline[q], outline[q + 1]);
    natural(cx, cz, sc);
    const hNat = sc.h;
    if (wet) {
      // the legs are already reshaped; a pad over water is simply not built (the trimmed ribbons would leave a hole), so keep the old ribbons
      reject('pad would touch water');
      continue;
    }
    const emb = Math.min(40, Math.max(8, Math.abs(y0 - hNat) * 2.4 + 6));

    const spec: PadSpec = {
      id: pads.length,
      x: cx,
      z: cz,
      y: y0,
      a: pb,
      b: pc,
      rCore,
      emb,
      outline: Float32Array.from(outline),
      gravel: Float32Array.from(gravel),
      marks: Float32Array.from(marks),
      arms: order.map((a) => ({ roadId: a.road.id, theta: a.theta, kind: a.road.kind })),
      kind: n === 2 ? 'bend' : n === 3 ? 'T' : n === 4 ? '4way' : 'multi',
    };
    pads.push(spec);
    // trimmed vertices
    for (const a of arms) {
      let t = trimmed.get(a.road.id);
      if (!t) trimmed.set(a.road.id, (t = new Uint8Array(a.road.xs.length)));
      for (let m = 0; m <= a.mEnd; m++) t[a.ks[m]] = 1;
    }
  }
  return { pads, trimmed, skipped };
}

/** Recomputes everything that depends on the (moved) centre line: normals, distances, natural ground height. */
function refreshRoad(r: RoadSpec, natural: Natural, sc: TerrainSample, pin: Uint8Array): void {
  const n = r.xs.length;
  for (let i = 0; i < n; i++) {
    const ip = Math.max(0, i - 1);
    const inx = Math.min(n - 1, i + 1);
    let tx = r.xs[inx] - r.xs[ip];
    let tz = r.zs[inx] - r.zs[ip];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    r.nx[i] = tz;
    r.nz[i] = -tx;
  }
  r.cum[0] = 0;
  for (let i = 1; i < n; i++) r.cum[i] = r.cum[i - 1] + Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
  r.length = r.cum[n - 1];
  for (let i = 0; i < n; i++) {
    natural(r.xs[i], r.zs[i], sc);
    r.hNat[i] = sc.h;
  }
  // grade safety with the TRUE chords (the legs moved sideways, so some chords got shorter): clamp, never touching pinned vertices
  const g = r.maxGrade * 0.995;
  for (let it = 0; it < 12; it++) {
    for (let i = 1; i < n; i++) {
      const lim = g * (r.cum[i] - r.cum[i - 1]);
      if (r.ys[i] - r.ys[i - 1] > lim) {
        if (!pin[i]) r.ys[i] = r.ys[i - 1] + lim;
        else if (!pin[i - 1]) r.ys[i - 1] = r.ys[i] - lim;
      } else if (r.ys[i - 1] - r.ys[i] > lim) {
        if (!pin[i]) r.ys[i] = r.ys[i - 1] - lim;
        else if (!pin[i - 1]) r.ys[i - 1] = r.ys[i] + lim;
      }
    }
    for (let i = n - 1; i > 0; i--) {
      const lim = g * (r.cum[i] - r.cum[i - 1]);
      if (r.ys[i] - r.ys[i - 1] > lim) {
        if (!pin[i - 1]) r.ys[i - 1] = r.ys[i] - lim;
      } else if (r.ys[i - 1] - r.ys[i] > lim) {
        if (!pin[i - 1]) r.ys[i - 1] = r.ys[i] + lim;
      }
    }
  }
}
