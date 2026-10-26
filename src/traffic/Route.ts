import type { RoadKind } from '../roads/RoadTypes';
import { RoadGraph, type RoadPoint } from './RoadGraph';

/** Where a driver may go: the route never uses a road kind / place (city area or world zone) this refuses (see vehicles/VehicleUse). */
export interface RouteRule {
  roadOk(kind: RoadKind): boolean;
  placeOk(x: number, z: number): boolean;
}

/** One point of the path an AI driver follows (WORLD coordinates). */
export interface RoutePt {
  x: number;
  z: number;
  y: number;
  /** Speed this point allows (m/s): road limit, bends, dead ends. */
  vmax: number;
  /** Overtaking: sideways shift (m, <0 = right) into the passing lane here; 0 = never overtake at this point. */
  os: number;
  /** The passing lane carries oncoming traffic. */
  oc: boolean;
  /** The point is in / right before a junction (a car must be back in its own lane there). */
  jn: boolean;
}

/** One planned junction decision: at pad `pad` leave on road `roadId` in direction `dir` (tour cars). */
export interface PlanStep {
  pad: number;
  roadId: number;
  dir: 1 | -1;
}

const STEP = 5;
const TURN_RADIUS_DIST = 12;
const LATERAL_ACCEL = 2.2;
const FAST_LATERAL_ACCEL = 5.5; // tour car: wider, smoother curves and a higher bend speed
const FAST_TURN_DIST = 22;

/**
 * Builds the path in front of a car, a few metres at a time: follow the road in the left lane; when a junction
 * pad is near, choose straight / left / right and join the other road with a smooth curve. No driver ever reverses
 * or turns around: a road that simply ends (no junction) is a dead end and the car stops there.
 */
export class RouteBuilder {
  pts: RoutePt[] = [];
  terminal = false;
  /** Tour cars: junction decisions to follow, the place to stop at, and fast driving (much above the normal limit). */
  plan: PlanStep[] | null = null;
  target: { roadId: number; s: number } | null = null;
  fast = false;
  private skipPad = -1;
  private tmp: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private tmp2: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private tmp3: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private lastHx = 0;
  private lastHz = 1;

  constructor(
    private g: RoadGraph,
    private rnd: () => number,
    public roadId: number,
    public s: number,
    public dir: 1 | -1,
    /** 0.7 .. 1.0: how fast this driver likes to go compared with the limit. */
    private temper: number,
    /** Optional limits on road kinds / zones (AI traffic). Without it the driver goes anywhere. */
    private rule?: RouteRule,
  ) {}

  /** Seed the route with the lane point we start on. */
  start(): void {
    const p = this.g.at(this.roadId, this.s, this.dir, this.g.laneOffset(this.roadId), this.tmp);
    this.lastHx = p.hx;
    this.lastHz = p.hz;
    this.push(p.x, p.z, p.y, this.cruise());
  }

  private get turnDist(): number {
    return this.fast ? FAST_TURN_DIST : TURN_RADIUS_DIST;
  }

  /** Is the route position within reach of a junction station of the current road? */
  private nearJunction(): boolean {
    const reach = this.turnDist + 16;
    for (const st of this.g.stations(this.roadId)) if (Math.abs(st.s - this.s) < reach) return true;
    return false;
  }

  private cruise(): number {
    if (this.fast) return Math.min(Math.max(this.g.limit(this.roadId) * 1.9, 22), 42);
    return Math.min(this.g.limit(this.roadId) * 0.85, 22) * this.temper;
  }

  private push(x: number, z: number, y: number, vmax: number, junction = false): void {
    const n = this.pts.length;
    const pi = this.fast && !junction ? this.g.passInfo(this.roadId, this.s) : { shift: 0, oncoming: false };
    this.pts.push({ x, z, y, vmax, os: pi.shift, oc: pi.oncoming, jn: junction || (this.fast && this.nearJunction()) });
    if (n >= 2) {
      // bend limit for the middle point: v = sqrt(a_lat / curvature)
      const a = this.pts[n - 2];
      const b = this.pts[n - 1];
      const c = this.pts[n];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const bcx = c.x - b.x;
      const bcz = c.z - b.z;
      const cr = Math.abs(abx * bcz - abz * bcx);
      const den = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(c.x - a.x, c.z - a.z);
      if (den > 1e-6) {
        const k = (2 * cr) / den;
        if (k > 1e-4) b.vmax = Math.min(b.vmax, Math.max(3.5, Math.sqrt((this.fast ? FAST_LATERAL_ACCEL : LATERAL_ACCEL) / k)));
      }
    }
  }

  /** Extend the route until at least `minLen` metres exist beyond index `from`. */
  fill(from: number, minLen: number): void {
    let guard = 200;
    while (!this.terminal && guard-- > 0) {
      let len = 0;
      for (let i = Math.max(from, 1); i < this.pts.length; i++) len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z);
      if (len >= minLen) return;
      this.step();
    }
  }

  private step(): void {
    const r = this.g.roads[this.roadId];
    // tour: the stopping place is right here -> finish exactly there
    if (this.target && this.roadId === this.target.roadId && (!this.plan || this.plan.length === 0)) {
      const ahead = (this.target.s - this.s) * this.dir;
      if (ahead <= STEP && ahead >= -STEP) {
        const p = this.g.at(this.roadId, this.target.s, this.dir, this.g.laneOffset(this.roadId), this.tmp);
        this.lastHx = p.hx;
        this.lastHz = p.hz;
        this.push(p.x, p.z, p.y, 0);
        this.terminal = true;
        return;
      }
    }
    // a junction ahead within reach?
    for (const st of this.g.stations(this.roadId)) {
      const ahead = (st.s - this.s) * this.dir;
      if (st.pad !== this.skipPad && ahead > 0 && ahead <= this.turnDist) {
        this.junction(st.pad, st.s);
        return;
      }
    }
    const next = this.s + this.dir * STEP;
    if (next < 0 || next > r.length) {
      // end of the road: finish at the very end, then stop
      const p = this.g.at(this.roadId, this.dir > 0 ? r.length : 0, this.dir, this.g.laneOffset(this.roadId), this.tmp);
      this.push(p.x, p.z, p.y, 0);
      this.terminal = true;
      return;
    }
    this.s = next;
    const p = this.g.at(this.roadId, this.s, this.dir, this.g.laneOffset(this.roadId), this.tmp);
    this.lastHx = p.hx;
    this.lastHz = p.hz;
    if (this.rule && !this.rule.placeOk(p.x, p.z)) {
      // the road leaves the area this vehicle belongs to: it stops just before the border (and is removed like at any dead end)
      this.pts[this.pts.length - 1].vmax = 0; // the last point that is still inside becomes the stopping point
      this.terminal = true;
      return;
    }
    this.push(p.x, p.z, p.y, this.cruise());
    // a pad we already passed is forgotten once we are well beyond it
    if (this.skipPad >= 0) {
      const st = this.g.stations(this.roadId).find((q) => q.pad === this.skipPad);
      if (!st || Math.abs(st.s - this.s) > this.turnDist + STEP) this.skipPad = -1;
    }
  }

  private junction(pad: number, sStation: number): void {
    interface Exit {
      roadId: number;
      s: number;
      dir: 1 | -1;
      w: number;
    }
    const exits: Exit[] = [];
    const here = this.tmp2;
    for (const arm of this.g.arms(pad)) {
      const r2 = this.g.roads[arm.roadId];
      if (this.rule && arm.roadId !== this.roadId && !this.rule.roadOk(r2.kind)) continue; // not a road for this vehicle
      for (const d of [1, -1] as const) {
        const remaining = d > 0 ? r2.length - arm.s : arm.s;
        if (remaining < 45) continue;
        const straight = arm.roadId === this.roadId && d === this.dir;
        if (arm.roadId === this.roadId && !straight) continue; // never back where we came from
        const h = this.g.at(arm.roadId, arm.s, d, 0, here);
        if (h.hx * this.lastHx + h.hz * this.lastHz < -0.7) continue; // no U-turns
        if (this.rule) {
          // the junction itself and the place a turn would end up must both be somewhere this vehicle belongs
          if (!this.rule.placeOk(h.x, h.z)) continue;
          const so = Math.min(Math.max(arm.s + d * this.turnDist, 0), r2.length);
          const q = this.g.at(arm.roadId, so, d, 0, this.tmp3);
          if (!this.rule.placeOk(q.x, q.z)) continue; // leads out of its area
        }
        exits.push({ roadId: arm.roadId, s: arm.s, dir: d, w: straight ? 3 : 1 });
      }
    }
    this.skipPad = pad;
    if (exits.length === 0) {
      // nowhere to go: stop at the pad
      this.terminal = true;
      this.push(this.pts[this.pts.length - 1].x + this.lastHx, this.pts[this.pts.length - 1].z + this.lastHz, this.pts[this.pts.length - 1].y, 0);
      return;
    }
    let pick = exits[0];
    // tour: follow the planned decision for this pad if that exit exists, otherwise choose like normal traffic
    const want = this.plan && this.plan.length > 0 && this.plan[0].pad === pad ? this.plan.shift()! : null;
    const planned = want ? exits.find((e) => e.roadId === want.roadId && e.dir === want.dir) : undefined;
    if (planned) pick = planned;
    else {
      let tot = 0;
      for (const e of exits) tot += e.w;
      let t = this.rnd() * tot;
      for (const e of exits) {
        if (t < e.w) {
          pick = e;
          break;
        }
        t -= e.w;
      }
    }
    if (pick.roadId === this.roadId && pick.dir === this.dir) return; // straight on: the normal stepping continues through the pad

    // curve from where we are to the lane of the new road, TURN_RADIUS_DIST past the pad centre
    const last = this.pts[this.pts.length - 1];
    const sOut = pick.s + pick.dir * this.turnDist;
    const q = this.g.at(pick.roadId, sOut, pick.dir, this.g.laneOffset(pick.roadId), this.tmp);
    const p0x = last.x;
    const p0z = last.z;
    const p2x = q.x;
    const p2z = q.z;
    // control point = intersection of the two tangent lines (fallback: midpoint)
    const d0x = this.lastHx;
    const d0z = this.lastHz;
    const d2x = q.hx;
    const d2z = q.hz;
    const den = d0x * d2z - d0z * d2x;
    let cx = (p0x + p2x) / 2;
    let cz = (p0z + p2z) / 2;
    if (Math.abs(den) > 0.15) {
      const t0 = ((p2x - p0x) * d2z - (p2z - p0z) * d2x) / den;
      if (t0 > 0 && t0 < 70) {
        cx = p0x + d0x * t0;
        cz = p0z + d0z * t0;
      }
    }
    const y0 = last.y;
    const y2 = q.y;
    const N = this.fast ? 12 : 8;
    const vmax = Math.min(this.cruise(), this.fast ? 14 : 7);
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      this.push(a * p0x + b * cx + c * p2x, a * p0z + b * cz + c * p2z, y0 + (y2 - y0) * u, vmax, true);
    }
    this.lastHx = d2x;
    this.lastHz = d2z;
    this.roadId = pick.roadId;
    this.dir = pick.dir;
    this.s = sOut;
    void sStation;
  }
}
