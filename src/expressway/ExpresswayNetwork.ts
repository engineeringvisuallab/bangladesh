import { CITY_RAMPS, INTERCHANGES, ROUTE_PLANS, XP, type XKind } from './ExpresswayPlan';
import { ExpresswayRouter, type XAvoid } from './ExpresswayRouter';

/** What the network needs from the world: the ground height, and the ordinary roads (to land the ramps on). */
export interface XGround {
  heightAt(x: number, z: number): number;
}
export interface XRoadLike {
  tier: number;
  xs: ArrayLike<number>;
  zs: ArrayLike<number>;
  ys: ArrayLike<number>;
  bridgeOf: ArrayLike<number>;
}

export interface XRoute {
  id: number;
  name: string;
  kind: XKind;
  closed: boolean;
  halfWidth: number;
  step: number;
  xs: Float64Array;
  zs: Float64Array;
  /** Finished road surface height. */
  ys: Float64Array;
  /** Highest natural ground across the deck at each point (m). */
  ground: Float64Array;
  /** Distance along the route from point 0 (m). */
  cum: Float64Array;
  length: number;
  /** Places where the edge barrier is left open (ramp merge lanes, Y-merges): point index, side (+1 left, -1 right, 0 both), half length (m). */
  gaps: { i: number; side: number; half: number }[];
  /** Ramps only: id of the route it leaves, arc length on it, and the side (+1 left / -1 right). */
  parent?: number;
  parentS?: number;
  side?: number;
  /** The deck is pinned to the ring height at an end (Y-merge). */
  /** Dead ends that come down to the ground. */
  descend?: 'start' | 'end' | 'both';
  /** Ramps: the ordinary road it lands on (-1 = open ground). */
  landing?: { x: number; z: number; y: number } | null;
  label?: string;
}

export interface XPier {
  x: number;
  z: number;
  /** Underside of the deck / ground height (m). */
  top: number;
  bottom: number;
  /** Index of the route point it stands at. */
  i: number;
  /** Direction of the deck (unit vector, x / z) and the width of the cap beam. */
  dx: number;
  dz: number;
  cap: number;
  routeId: number;
}

export interface XInterchange {
  n: number;
  id: string;
  x: number;
  z: number;
  routeId: number;
  s: number;
  rampId: number | null;
}

type Pt = [number, number];

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Uniform Catmull-Rom through the points, densely sampled, then resampled every `step` metres. */
function curve(pts: readonly Pt[] | readonly (readonly [number, number])[], closed: boolean, step: number): Pt[] {
  const n = pts.length;
  const P = (i: number): readonly [number, number] => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  const dense: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const sub = Math.max(8, Math.ceil(L / 25));
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) dense.push([pts[n - 1][0], pts[n - 1][1]]);
  return resample(dense, closed, step);
}

function resample(poly: Pt[], closed: boolean, step: number): Pt[] {
  const pts = closed ? [...poly, poly[0]] : poly;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const count = Math.max(2, Math.round(total / step));
  const ds = total / count;
  const out: Pt[] = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  let target = ds;
  for (let i = 1; i < pts.length && out.length < count + (closed ? 0 : 1); i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + L >= target - 1e-9 && out.length < count + (closed ? 0 : 1)) {
      const t = (target - acc) / (L || 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      target += ds;
    }
    acc += L;
  }
  if (!closed && out.length < count + 1) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

export class ExpresswayNetwork {
  readonly routes: XRoute[] = [];
  readonly piers: XPier[] = [];
  readonly interchanges: XInterchange[] = [];
  /** Problems found while building (tests / debug): a ramp that did not fit, a grade that was too steep ... */
  readonly issues: string[] = [];
  /** Not errors: ramps that end on open ground because no ordinary road is within reach (farms, mountains). */
  readonly notes: string[] = [];

  constructor(
    private ground: XGround,
    roads: readonly XRoadLike[],
    avoid: readonly XAvoid[] = [],
  ) {
    const byName = new Map<string, XRoute>();
    // 1. the flyovers. The hint points are routed round hills, the sea and the 'avoid' areas; the two ends of each flyover stay exact.
    const router = new ExpresswayRouter(ground, avoid);
    const pinned = (p: Pt): boolean => INTERCHANGES.some((ic) => Math.hypot(ic.x - p[0], ic.z - p[1]) < 5);
    for (const plan of ROUTE_PLANS) {
      const guide = router.route(plan.pts, plan.closed, pinned);
      const r = this.addMain(plan.name, plan.kind, plan.closed, curve(guide, plan.closed, XP.step));
      r.descend = plan.descend;
      byName.set(plan.name, r);
    }
    this.buildHeights(byName);
    // 2. flyover ends (the deck itself comes down to the ground there) and any city freight ramps
    const rampsOf = new Map<number, number>();
    for (const ic of INTERCHANGES) {
      const route = byName.get(ic.route)!;
      const s = this.nearestS(route, ic.x, ic.z);
      if (this.atDescendingEnd(route, s)) {
        this.interchanges.push({ n: ic.n, id: ic.id, x: ic.x, z: ic.z, routeId: route.id, s, rampId: null });
        const n = route.xs.length;
        route.gaps.push({ i: s === 0 ? 0 : n - 1, side: 0, half: 70 });
        continue;
      }
      const ramp = this.addRamp(route, s, ic.hint ?? [ic.x, ic.z], ic.side ?? 0, !!ic.open, roads, `ramp-${ic.n}`);
      this.interchanges.push({ n: ic.n, id: ic.id, x: ic.x, z: ic.z, routeId: route.id, s, rampId: ramp ? ramp.id : null });
      if (ramp) rampsOf.set(ic.n, ramp.id);
    }
    for (const cr of CITY_RAMPS) {
      const route = byName.get(cr.route)!;
      const s = this.nearestS(route, cr.at[0], cr.at[1]);
      this.addRamp(route, s, cr.hint, 0, false, roads, cr.id);
    }
    this.addGaps(byName);
    // 3. piers
    for (const r of this.routes) this.addPiers(r);
  }

  /** Total length of all deck (not ramps), km. */
  get deckKm(): number {
    return this.routes.filter((r) => r.kind !== 'ramp').reduce((a, r) => a + r.length, 0) / 1000;
  }

  private addMain(name: string, kind: XKind, closed: boolean, pts: Pt[]): XRoute {
    const n = pts.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      zs[i] = pts[i][1];
    }
    let length = 0;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      length += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      cum[i] = length;
    }
    if (closed) length += Math.hypot(xs[0] - xs[n - 1], zs[0] - zs[n - 1]);
    const r: XRoute = {
      id: this.routes.length,
      name,
      kind,
      closed,
      halfWidth: XP.deckHalf,
      step: XP.step,
      xs,
      zs,
      ys: new Float64Array(n),
      ground: new Float64Array(n),
      cum,
      length,
      gaps: [],
    };
    this.routes.push(r);
    return r;
  }

  /** Unit direction of travel at point i. */
  dir(r: XRoute, i: number): [number, number] {
    const n = r.xs.length;
    const a = r.closed ? (i + n - 1) % n : Math.max(0, i - 1);
    const b = r.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const dx = r.xs[b] - r.xs[a];
    const dz = r.zs[b] - r.zs[a];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  private nearestS(r: XRoute, x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < r.xs.length; i++) {
      const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Highest ground across the deck (centre + 5 lateral samples + a point behind / ahead). */
  private groundAcross(r: XRoute, i: number, halfWidth: number): number {
    const [dx, dz] = this.dir(r, i);
    const nx = dz;
    const nz = -dx;
    let h = -Infinity;
    for (const u of [-1, -0.5, 0, 0.5, 1]) h = Math.max(h, this.ground.heightAt(r.xs[i] + nx * u * halfWidth, r.zs[i] + nz * u * halfWidth));
    void dx;
    void dz;
    return h;
  }

  /** Height profile of every flyover: ground + clearance, grade-limited, smooth; both ends then come down to the ground. */
  private buildHeights(byName: Map<string, XRoute>): void {
    for (const r of byName.values()) {
      const n = r.xs.length;
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        r.ground[i] = this.groundAcross(r, i, r.halfWidth);
        raw[i] = Math.max(r.ground[i] + XP.clearance, XP.minDeckY);
      }
      const y = this.envelope(raw, r, XP.maxGrade, null, null, 6);
      for (let i = 0; i < n; i++) r.ys[i] = y[i];
      if (r.descend) this.descendEnds(r);
      this.checkGrade(r);
    }
  }

  /** A dead end comes down to the ground: the surface never stays above ground + a steady grade measured from the end. */
  private descendEnds(r: XRoute): void {
    const n = r.xs.length;
    for (const end of [0, n - 1]) {
      if (!(end === 0 ? r.descend === 'start' || r.descend === 'both' : r.descend === 'end' || r.descend === 'both')) continue;
      const yEnd = r.ground[end] + 0.15;
      let d = 0;
      for (let k = 0; k < n; k++) {
        const i = end === 0 ? k : n - 1 - k;
        if (k > 0) d += Math.hypot(r.xs[i] - r.xs[end === 0 ? k - 1 : n - k], r.zs[i] - r.zs[end === 0 ? k - 1 : n - k]);
        const limit = yEnd + XP.endGrade * d;
        if (r.ys[i] > limit) r.ys[i] = limit;
        else if (d > 900) break;
      }
    }
  }

  /** The lowest surface that stays above `raw` and never changes faster than `grade`; then smoothed (and lifted again where smoothing dipped). */
  private envelope(raw: Float64Array, r: XRoute, grade: number, pinA: number | null, pinB: number | null, smoothPasses: number): Float64Array {
    const n = raw.length;
    const closed = r.closed;
    // allowed height change between point i-1 and i (point 0: the closing segment of a loop) from the REAL spacing
    const gs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? n - 1 : i - 1;
      gs[i] = grade * Math.hypot(r.xs[i] - r.xs[a], r.zs[i] - r.zs[a]);
    }
    let y = Float64Array.from(raw);
    const pins = (v: Float64Array): void => {
      // a pinned end keeps its height exactly; the grade limit then shapes the neighbours
      if (pinA !== null) v[0] = pinA;
      if (pinB !== null) v[n - 1] = pinB;
    };
    pins(y);
    const pass = (v: Float64Array): void => {
      const reps = closed ? 2 : 1;
      for (let k = 0; k < reps; k++) {
        for (let i = 1; i < n; i++) v[i] = Math.max(v[i], v[i - 1] - gs[i]);
        if (closed) v[0] = Math.max(v[0], v[n - 1] - gs[0]);
        for (let i = n - 2; i >= 0; i--) v[i] = Math.max(v[i], v[i + 1] - gs[i + 1]);
        if (closed) v[n - 1] = Math.max(v[n - 1], v[0] - gs[0]);
      }
    };
    pass(y);
    for (let s = 0; s < smoothPasses; s++) {
      const t = Float64Array.from(y);
      for (let i = 0; i < n; i++) {
        const a = closed ? (i + n - 1) % n : Math.max(0, i - 1);
        const b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
        const a2 = closed ? (i + n - 2) % n : Math.max(0, i - 2);
        const b2 = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
        t[i] = (y[a2] + 2 * y[a] + 3 * y[i] + 2 * y[b] + y[b2]) / 9;
      }
      y = t;
      for (let i = 0; i < n; i++) y[i] = Math.max(y[i], raw[i]);
      pins(y);
      pass(y);
    }
    return y;
  }

  private checkGrade(r: XRoute): void {
    let worst = 0;
    for (let i = 1; i < r.ys.length; i++) worst = Math.max(worst, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
    if (worst > (r.descend ? XP.endGrade : XP.maxGrade) * 1.03) this.issues.push(`${r.name}: grade ${(worst * 100).toFixed(2)} % over the limit`);
  }

  /** Cubic Bezier from p0 to p3 -> points every `step` m. */
  private bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, step: number): { pts: Pt[]; length: number } {
    const dense: Pt[] = [];
    const N = 80;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const u = 1 - t;
      dense.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    let length = 0;
    for (let k = 1; k < dense.length; k++) length += Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]);
    return { pts: resample(dense, false, step), length };
  }

  /**
   * A ramp that leaves `parent` at point `s` and comes down to the nearest ordinary road near `hint` (or to open ground).
   * Two-way, 2 lanes, constant grade <= rampGrade; the end height is the surface of the road it lands on.
   */
  private addRamp(parent: XRoute, s: number, hint: readonly [number, number], sideWanted: number, open: boolean, roads: readonly XRoadLike[], label: string): XRoute | null {
    const [tx, tz] = this.dir(parent, s);
    const nx = tz; // left normal
    const nz = -tx;
    const y0 = parent.ys[s];
    // candidate landing points: vertices of ordinary roads (not on bridges) around the hint
    type Cand = { x: number; z: number; y: number; d: number };
    const cands: Cand[] = [];
    if (!open) {
      for (const road of roads) {
        if (road.tier > 4) continue;
        for (let i = 0; i < road.xs.length; i += 2) {
          if (road.bridgeOf[i] >= 0) continue;
          const d = Math.hypot(road.xs[i] - hint[0], road.zs[i] - hint[1]);
          if (d < 1100) cands.push({ x: road.xs[i], z: road.zs[i], y: road.ys[i], d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
    }
    const tryBuild = (side: number, target: { x: number; z: number; y: number }, allowLong = false): { r: XRoute; pts: Pt[] } | null => {
      const off = parent.halfWidth - 6;
      const p0: Pt = [parent.xs[s] + nx * side * off, parent.zs[s] + nz * side * off];
      const dist = Math.hypot(target.x - p0[0], target.z - p0[1]);
      const k = Math.max(60, dist * 0.42);
      const ex = (target.x - p0[0]) / (dist || 1);
      const ez = (target.z - p0[1]) / (dist || 1);
      const b = this.bezier(p0, [p0[0] + tx * k, p0[1] + tz * k], [target.x - ex * k * 0.8, target.z - ez * k * 0.8], [target.x, target.z], XP.rampStep);
      const need = (y0 - target.y) / XP.rampGrade;
      if (b.length < need + 20 || (!allowLong && b.length > XP.rampMaxLen)) return null;
      // a ramp must not run back over the deck it leaves: its heading may not point against the direction of travel for long
      return { r: this.makeRamp(parent, s, side, b.pts, y0, target.y, label), pts: b.pts };
    };
    // find a landing
    const sides = sideWanted !== 0 ? [sideWanted] : [1, -1];
    for (const c of cands) {
      for (const side of this.sideOrder(parent, s, c, sides)) {
        // the landing must be on the ramp's side of the deck and far enough from the deck centre line
        const lat = (c.x - parent.xs[s]) * nx * side + (c.z - parent.zs[s]) * nz * side;
        if (lat < parent.halfWidth + 25) continue;
        if (Math.hypot(c.x - parent.xs[s], c.z - parent.zs[s]) > XP.rampReach) continue;
        const res = tryBuild(side, c);
        if (res) {
          res.r.landing = { x: c.x, z: c.z, y: c.y };
          return res.r;
        }
      }
    }
    // no road in reach (or an 'open' ramp): come down on open ground out to the side; the run grows until the grade fits
    const side = sideWanted !== 0 ? sideWanted : 1;
    let run = 240;
    for (let k = 0; k < 14; k++, run *= 1.3) {
      const target = { x: parent.xs[s] + nx * side * run * (open ? 1.0 : 0.8) + tx * run * 0.5, z: parent.zs[s] + nz * side * run * (open ? 1.0 : 0.8) + tz * run * 0.5, y: 0 };
      target.y = this.ground.heightAt(target.x, target.z) + 0.2;
      const res = tryBuild(side, target, true);
      if (res) {
        res.r.landing = open ? { x: target.x, z: target.z, y: target.y } : null;
        if (!open) this.notes.push(`${label}: no ordinary road within ${XP.rampReach} m, the ramp ends on open ground`);
        return res.r;
      }
    }
    this.issues.push(`${label}: could not build a ramp`);
    return null;
  }

  private sideOrder(parent: XRoute, s: number, c: { x: number; z: number }, sides: number[]): number[] {
    const [tx, tz] = this.dir(parent, s);
    const cross = tx * (c.z - parent.zs[s]) - tz * (c.x - parent.xs[s]);
    // cross > 0: the point lies to the right of the direction of travel (x east, z south)
    const natural = cross > 0 ? -1 : 1;
    return sides.includes(natural) ? [natural] : [];
  }

  private makeRamp(parent: XRoute, s: number, side: number, pts: Pt[], y0: number, y1: number, label: string): XRoute {
    const n = pts.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    const ys = new Float64Array(n);
    let cum = 0;
    const cumArr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      zs[i] = pts[i][1];
      if (i) cum += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      cumArr[i] = cum;
    }
    // 5 cm under the deck / road it meets, so the two asphalt layers never fight (z-fighting)
    const ya = y0 - 0.05;
    const yb = y1 - 0.05;
    for (let i = 0; i < n; i++) {
      // level for the first 12 m (merge lane), then one steady grade, level again for the last 8 m (joins the road)
      const a = clamp((cumArr[i] - 12) / Math.max(1, cum - 20), 0, 1);
      ys[i] = ya + (yb - ya) * a;
    }
    const ground = new Float64Array(n);
    for (let i = 0; i < n; i++) ground[i] = this.ground.heightAt(xs[i], zs[i]);
    const r: XRoute = {
      id: this.routes.length,
      name: label,
      kind: 'ramp',
      closed: false,
      halfWidth: XP.rampHalf,
      step: XP.rampStep,
      xs,
      zs,
      ys,
      ground,
      cum: cumArr,
      length: cum,
      gaps: [],
      parent: parent.id,
      parentS: s,
      side,
      label,
    };
    this.routes.push(r);
    return r;
  }

  /** Is point s within 60 m of a dead end that comes down to the ground (the deck itself is the ramp there)? */
  private atDescendingEnd(r: XRoute, s: number): boolean {
    if (!r.descend || r.closed) return false;
    const near0 = r.cum[s] < 60 && (r.descend === 'start' || r.descend === 'both');
    const near1 = r.length - r.cum[s] < 60 && (r.descend === 'end' || r.descend === 'both');
    return near0 || near1;
  }

  /** Where the edge barrier must be open: ramp merge lanes (none now) - the flyover ends are plain descending decks. */
  private addGaps(_byName: Map<string, XRoute>): void {
    for (const r of this.routes) if (r.kind === 'ramp') this.routes[r.parent!].gaps.push({ i: r.parentS!, side: r.side!, half: XP.gapHalf });
  }

  /** Is there an edge barrier at point i on this side (+1 left, -1 right)? */
  barrierOn(r: XRoute, i: number, side: number): boolean {
    if (r.kind === 'ramp' && (r.cum[i] < 30 || r.cum[i] > r.length - 22)) return false;
    const n = r.xs.length;
    for (const g of r.gaps) {
      let d = Math.abs(i - g.i);
      if (r.closed) d = Math.min(d, n - d);
      if (d * r.step <= g.half && (g.side === 0 || g.side === side)) return false;
    }
    return true;
  }

  private addPiers(r: XRoute): void {
    const n = r.xs.length;
    let acc = r.kind === 'ramp' ? 12 : 0;
    let cumS = 0;
    for (let i = 1; i < n; i++) {
      const seg = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
      cumS += seg;
      if (cumS < acc) continue;
      acc += r.kind === 'ramp' ? 26 : XP.pierSpacing;
      const g = this.ground.heightAt(r.xs[i], r.zs[i]);
      const top = r.ys[i] - XP.slabThick - 0.12;
      if (top - g < 2.5) continue;
      const [dx, dz] = this.dir(r, i);
      this.piers.push({ x: r.xs[i], z: r.zs[i], top, bottom: g - 1.5, i, dx, dz, cap: r.halfWidth * 2 - 6, routeId: r.id });
    }
  }
}
