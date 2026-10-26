import { RAIL_DESIGN as D } from '../rail/RailPlan';
import type { RailEdge, RailNetwork } from '../rail/RailNetwork';
import type { GraphLeg } from './RailGraph';
import { RAIL_HEAD, STOP_FRONT_D, TRAIN, TRAIN_LENGTH } from './TrainConfig';

/**
 * STAGE 14 / Step 5a: the path one train leg follows (arrival platform -> next platform), as a dense polyline of the ACTUAL TRACK
 * (rail head top), with a speed envelope.
 *
 * The path starts BEHIND the standing train (so the cars always have track under them) and ends at the far end of the next line.
 * Positions are `s` = metres along the track polyline itself. Samples every TRAIN.sample m. The track positions are made exactly the
 * way RailMesh makes the rails (vertex frames from the neighbouring points, blended along the segment), so the wheels sit on the drawn rails.
 *
 * Speed envelope (`env`): the highest speed the FRONT of the train may have at each `s`:
 *   curves  v <= sqrt(latAccel * R) (R from the 3-point circle of the line vertices, like RailNetwork.minRadius), kept until the TAIL has left the curve;
 *   links   <= linkSpeed, crossover <= crossoverSpeed, station approach / departure <= approachSpeed, line speed <= maxSpeed,
 *   then a backward pass with the service braking rate so that the train can always stop at the platform (v = 0 at `sStop`).
 */
export interface PathZone {
  kind: 'link' | 'crossover' | 'approach' | 'departure';
  /** Track distance range (m) in which the FRONT is limited (the tail extension is added on top for curves, links and crossovers). */
  s0: number;
  s1: number;
  cap: number;
}

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const radiusCache = new WeakMap<RailEdge, Float64Array>();
/** Radius (m) of the circle through every vertex and its two neighbours (the ends take their neighbour's value). */
export function vertexRadius(e: RailEdge): Float64Array {
  const hit = radiusCache.get(e);
  if (hit) return hit;
  const n = e.xs.length;
  const r = new Float64Array(n).fill(Infinity);
  for (let q = 1; q < n - 1; q++) {
    const x1 = e.xs[q] - e.xs[q - 1], z1 = e.zs[q] - e.zs[q - 1], x2 = e.xs[q + 1] - e.xs[q], z2 = e.zs[q + 1] - e.zs[q];
    const cross = Math.abs(x1 * z2 - z1 * x2);
    const l1 = Math.hypot(x1, z1), l2 = Math.hypot(x2, z2), l3 = Math.hypot(e.xs[q + 1] - e.xs[q - 1], e.zs[q + 1] - e.zs[q - 1]);
    r[q] = cross > 1e-9 ? (l1 * l2 * l3) / (2 * cross) : Infinity;
  }
  if (n > 2) {
    r[0] = r[1];
    r[n - 1] = r[n - 2];
  }
  radiusCache.set(e, r);
  return r;
}

/** One sample of the centre line in the direction of travel. */
interface CS {
  x: number;
  z: number;
  /** Top of ballast. */
  y: number;
  /** Unit tangent in the direction of travel and the across vector the rails are measured along (same as RailMesh: (-tz, tx)). */
  tx: number;
  tz: number;
  R: number;
  /** Distance along the centre chain. */
  c: number;
  piece: 'arrive' | 'link' | 'depart';
}

function vertexFrame(e: RailEdge, i: number): { tx: number; tz: number } {
  const n = e.xs.length;
  const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
  const tx = e.xs[b] - e.xs[a], tz = e.zs[b] - e.zs[a];
  const l = Math.hypot(tx, tz) || 1;
  return { tx: tx / l, tz: tz / l };
}

/** Centre-line samples of an edge between s0 and s1 (either order; s1 < s0 = driven backwards), every `step` m. */
function sampleEdge(e: RailEdge, s0: number, s1: number, step: number, piece: CS['piece'], c0: number): CS[] {
  const dir = s1 >= s0 ? 1 : -1;
  const len = Math.abs(s1 - s0);
  const n = Math.max(1, Math.round(len / step));
  const R = vertexRadius(e);
  const out: CS[] = [];
  let k = 0;
  for (let q = 0; q <= n; q++) {
    const s = s0 + (dir * len * q) / n;
    // segment index with cum[k] <= s < cum[k+1]
    let lo = 0, hi = e.cum.length - 2;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (e.cum[m] <= s) { k = m; lo = m + 1; } else hi = m - 1;
    }
    k = Math.max(0, Math.min(e.cum.length - 2, k));
    const seg = e.cum[k + 1] - e.cum[k] || 1;
    const t = Math.max(0, Math.min(1, (s - e.cum[k]) / seg));
    const A = vertexFrame(e, k), B = vertexFrame(e, k + 1);
    let tx = A.tx + (B.tx - A.tx) * t, tz = A.tz + (B.tz - A.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.push({
      x: e.xs[k] + (e.xs[k + 1] - e.xs[k]) * t,
      z: e.zs[k] + (e.zs[k + 1] - e.zs[k]) * t,
      y: e.design[k] + (e.design[k + 1] - e.design[k]) * t,
      tx: dir * tx, tz: dir * tz,
      R: Math.min(R[k], R[k + 1]),
      c: c0 + (len * q) / n,
      piece,
    });
  }
  return out;
}

export interface PathPose {
  x: number;
  y: number;
  z: number;
}

export class LegPath {
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Distance along the track polyline. */
  readonly cum: Float64Array;
  /** Distance along the centre chain (for zones). */
  readonly cc: Float64Array;
  /** Local curve radius (m) at each sample. */
  readonly radius: Float64Array;
  /** Speed envelope for the front of the train (m/s). */
  readonly env: Float64Array;
  /** Where the front stands at the start / where it must stop (track distance). */
  readonly sStart: number;
  readonly sStop: number;
  readonly length: number;
  readonly zones: PathZone[] = [];
  /** True: this leg changes tracks (terminal reversal). */
  readonly crossover: boolean;
  /** STAGE 15 / Step 6: how the path is made of line / link pieces (centre-chain distances), used to cut the path into signal blocks (Signals.ts). */
  readonly info: {
    arriveEdge: string;
    arriveEnd: 'a' | 'b';
    depEdge: string;
    /** Distance (m) from the arrival line end back to the first sample (via legs) / forward from the arrival end to the first sample (reversal). */
    d0: number;
    linkStart: number;
    linkEnd: number;
    /** Reversal: line distance (m) from the arrival end of the first sample. */
    dFront: number;
    /** Reversal: start (the first turnout, 10 m in front of the standing train) and end (20 m after the last turnout) of the crossover, centre-chain distance. */
    crossStart: number;
    crossEnd: number;
  };

  constructor(rail: RailNetwork, readonly leg: GraphLeg) {
    const step = TRAIN.sample;
    const edge = (id: string): RailEdge => rail.edges.find((e) => e.id === id)!;
    const L = TRAIN_LENGTH;
    const d0 = TRAIN.platformCentre + L / 2 + TRAIN.tailMargin; // behind the rear of the standing train, measured from the line end
    const arrive = edge(leg.from.slice(0, leg.from.lastIndexOf(':')));
    const arriveEnd = leg.from.slice(leg.from.lastIndexOf(':') + 1) as 'a' | 'b';
    const dep = edge(leg.line.edgeId);
    const sOfD = (e: RailEdge, end: 'a' | 'b', d: number): number => (end === 'a' ? d : e.length - d);

    let cs: CS[] = [];
    let linkStart = -1, linkEnd = -1;
    if (leg.via) {
      // 1) the arrival line, from behind the train up to its end; 2) the link; 3) the whole departure line
      cs = sampleEdge(arrive, sOfD(arrive, arriveEnd, d0), sOfD(arrive, arriveEnd, 0), step, 'arrive', 0);
      const link = leg.via;
      const fromA = link.a.edgeId === arrive.id && link.a.end === arriveEnd;
      const le = link.edge;
      const part = fromA ? sampleEdge(le, 0, le.length, step, 'link', cs[cs.length - 1].c) : sampleEdge(le, le.length, 0, step, 'link', cs[cs.length - 1].c);
      linkStart = part[0].c;
      linkEnd = part[part.length - 1].c;
      cs.push(...part.slice(1));
      const depEnd = leg.line.enter;
      const sEnter = depEnd === 'a' ? 0 : dep.length;
      const sFar = depEnd === 'a' ? dep.length : 0;
      cs.push(...sampleEdge(dep, sEnter, sFar, step, 'depart', cs[cs.length - 1].c).slice(1));
    } else {
      // reversal: the train drives back out along the same line; its new rear starts at the old front position
      const dFront = STOP_FRONT_D - TRAIN.tailMargin;
      const sA = sOfD(arrive, arriveEnd, dFront);
      cs = sampleEdge(arrive, sA, arriveEnd === 'a' ? arrive.length : 0, step, 'depart', 0);
    }

    // front position at the start: the train body (length L) lies behind it on the path
    const cStart = d0 - STOP_FRONT_D;
    const cTotal = cs[cs.length - 1].c;
    const cStop = cTotal - STOP_FRONT_D;

    // side (which track): -1 = left of the direction of travel. A terminal reversal starts on the track that is on the right of the new direction
    // and crosses over to the left one in front of the train.
    const half = D.trackSpacing / 2;
    const sign = TRAIN.keepLeft ? 1 : -1;
    this.crossover = !leg.via;
    this.info = {
      arriveEdge: arrive.id, arriveEnd, depEdge: dep.id, d0, linkStart, linkEnd,
      dFront: STOP_FRONT_D - TRAIN.tailMargin,
      crossStart: TRAIN.tailMargin + L + TRAIN.crossoverGap,
      crossEnd: TRAIN.tailMargin + L + TRAIN.crossoverGap + TRAIN.crossoverLen + 20,
    };
    const xc0 = leg.via ? 0 : TRAIN.tailMargin + L + TRAIN.crossoverGap; // centre distance where the crossover starts (reversal only)
    const sideAt = (c: number): number => {
      if (leg.via) return -1 * sign;
      return (1 - 2 * smooth((c - xc0) / TRAIN.crossoverLen)) * sign;
    };

    const n = cs.length;
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.z = new Float64Array(n);
    this.cum = new Float64Array(n);
    this.cc = new Float64Array(n);
    this.radius = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = cs[i];
      const side = sideAt(p.c);
      this.x[i] = p.x + -p.tz * side * half;
      this.z[i] = p.z + p.tx * side * half;
      this.y[i] = p.y + RAIL_HEAD;
      this.cc[i] = p.c;
      this.radius[i] = p.R;
      if (i > 0) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.length = this.cum[n - 1];
    const sAtC = (c: number): number => {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (this.cc[m] <= c) lo = m; else hi = m;
      }
      const span = this.cc[hi] - this.cc[lo] || 1;
      return this.cum[lo] + ((c - this.cc[lo]) / span) * (this.cum[hi] - this.cum[lo]);
    };
    this.sStart = sAtC(cStart);
    this.sStop = sAtC(cStop);

    // ---- speed envelope
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = Math.min(TRAIN.maxSpeed, Math.sqrt(TRAIN.latAccel * this.radius[i]));
      const p = cs[i];
      if (p.piece === 'link' || (p.c >= linkStart - 20 && p.c <= linkEnd + 20 && linkStart >= 0)) v = Math.min(v, TRAIN.linkSpeed);
      if (!leg.via && p.c >= xc0 - 20 && p.c <= xc0 + TRAIN.crossoverLen + 20) v = Math.min(v, TRAIN.crossoverSpeed);
      // a sample caps if the interval around it touches the zone (so the limit is never reached late)
      const lo = i > 0 ? this.cum[i - 1] : this.cum[i], hi = i + 1 < n ? this.cum[i + 1] : this.cum[i];
      if (hi >= this.sStop - TRAIN.approachDist) v = Math.min(v, TRAIN.approachSpeed);
      if (lo <= this.sStart + TRAIN.departDist) v = Math.min(v, TRAIN.approachSpeed);
      raw[i] = v;
    }
    if (leg.via) this.zones.push({ kind: 'link', s0: sAtC(linkStart - 20), s1: sAtC(linkEnd + 20), cap: TRAIN.linkSpeed });
    else this.zones.push({ kind: 'crossover', s0: sAtC(xc0 - 20), s1: sAtC(xc0 + TRAIN.crossoverLen + 20), cap: TRAIN.crossoverSpeed });
    this.zones.push({ kind: 'departure', s0: 0, s1: this.sStart + TRAIN.departDist, cap: TRAIN.approachSpeed });
    this.zones.push({ kind: 'approach', s0: this.sStop - TRAIN.approachDist, s1: this.length, cap: TRAIN.approachSpeed });

    // a limit holds until the TAIL has left the restricted stretch: min over the last L metres
    const eff = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = raw[i];
      for (let j = i - 1; j >= 0 && this.cum[i] - this.cum[j] <= L; j--) v = Math.min(v, raw[j]);
      eff[i] = v;
    }
    // braking: backward pass; the front must be at rest at sStop (the last sample before the stop looks at the stop itself, not at the next sample)
    this.env = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      if (this.cum[i] >= this.sStop) {
        this.env[i] = 0;
        continue;
      }
      const nextIsStop = i + 1 >= n || this.cum[i + 1] >= this.sStop;
      const nextV = nextIsStop ? 0 : this.env[i + 1];
      const dist = (nextIsStop ? this.sStop : this.cum[i + 1]) - this.cum[i];
      this.env[i] = Math.min(eff[i], Math.sqrt(nextV * nextV + 2 * TRAIN.serviceBrake * dist));
    }
  }

  /** Index of the sample at or before s. */
  find(s: number): number {
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m; else hi = m;
    }
    return lo;
  }

  /** Track position at distance s (clamped to the path). */
  posAt(s: number, out: PathPose): PathPose {
    const c = Math.max(0, Math.min(this.length, s));
    const i = this.find(c);
    const j = Math.min(this.n - 1, i + 1);
    const span = this.cum[j] - this.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (c - this.cum[i]) / span));
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    return out;
  }

  /** Speed envelope (m/s) at distance s. */
  envAt(s: number): number {
    if (s >= this.sStop) return 0;
    const c = Math.max(0, s);
    const i = this.find(c);
    const j = Math.min(this.n - 1, i + 1);
    const span = this.cum[j] - this.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (c - this.cum[i]) / span));
    // near the stop the exact braking curve (the samples are 5 m apart)
    return Math.min(this.env[i] + (this.env[j] - this.env[i]) * t, Math.sqrt(2 * TRAIN.serviceBrake * (this.sStop - s)));
  }

  /** Is s (the front) inside a limited zone including the tail extension (curves are not zones)? */
  zoneAt(s: number): PathZone | null {
    for (const z of this.zones) if (z.kind !== 'departure' && z.kind !== 'approach' && s >= z.s0 && s <= z.s1 + TRAIN_LENGTH) return z;
    return null;
  }
}
