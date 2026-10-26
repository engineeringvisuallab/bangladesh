import * as THREE from 'three';
import type { DriveInput, Vehicle } from '../vehicles/Vehicle';
import { clamp } from '../utils/math';
import { RouteBuilder } from './Route';
import type { BusStop } from './BusStops';
import type { TrafficSignals } from './TrafficSignals';

/** Something a driver must not hit (WORLD coordinates, metres, m/s). */
export interface Obstacle {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  kind: 'vehicle' | 'person';
  /** Who it is (a driver never reacts to itself). */
  ref: unknown;
}

const BRAKE_DECEL = 3.2;
const P = new THREE.Vector3();
const F = new THREE.Vector3();

/**
 * The "brain" of a person who drives: follows the route in front of the car (pure pursuit), holds a target speed
 * (road limit, bends, dead ends), and stops for anything in front of the bumper. Produces the SAME DriveInput as
 * the keyboard does for the player, so AI cars use exactly the same physics.
 */
export class AIDriver {
  readonly input: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false, throttleAmt: 0, brakeAmt: 0 };
  head = 0;
  /** Set when this car should be removed (flipped, stuck, or finished its dead-end road). */
  dead = false;
  /** Seconds the car has been parked at the end of its route. */
  finishedFor = 0;
  /** Set true for a driver that must not obey traffic lights. */
  ignoreSignals = false;
  /** Buses: the bus stop being approached, the ones already served, and how long the bus has waited there. */
  stop: BusStop | null = null;
  readonly served = new Set<number>();
  private dwell = 0;
  private stuck = 0;
  private flipped = 0;
  private blocked = 0;
  private steer = 0;

  constructor(
    private veh: Vehicle,
    readonly route: RouteBuilder,
    /** Traffic lights: the driver stops at the stop line of a red (or late yellow) light. */
    private signals?: TrafficSignals,
  ) {}

  update(dt: number, obstacles: Obstacle[]): void {
    const v = this.veh;
    const spec = v.spec;
    v.physWorld(P);
    v.forwardVector(F);
    const flat = Math.hypot(F.x, F.z) || 1;
    const fx = F.x / flat;
    const fz = F.z / flat;
    const speed = v.forwardSpeed;
    const pts = this.route.pts;

    // ---- keep the road ahead of us built, walk the head forward, forget what is behind ----
    this.route.fill(this.head, 120);
    const d2 = (i: number) => (pts[i].x - P.x) ** 2 + (pts[i].z - P.z) ** 2;
    while (this.head + 1 < pts.length && d2(this.head + 1) <= d2(this.head)) this.head++;
    if (this.head > 30) {
      pts.splice(0, this.head - 4);
      this.head = 4;
    }

    // ---- steering: pure pursuit on a point `ld` metres ahead ----
    const ld = clamp(4.5 + Math.abs(speed) * 0.9, 5, 26);
    let idx = this.head;
    let acc = Math.hypot(pts[idx].x - P.x, pts[idx].z - P.z);
    while (acc < ld && idx + 1 < pts.length) {
      acc += Math.hypot(pts[idx + 1].x - pts[idx].x, pts[idx + 1].z - pts[idx].z);
      idx++;
    }
    const tx = pts[idx].x - P.x;
    const tz = pts[idx].z - P.z;
    const along = tx * fx + tz * fz;
    const lat = tx * fz - tz * fx; // + = left of the car
    const alpha = Math.atan2(lat, Math.max(0.01, along));
    const wheelbase = spec.wheelbaseHalf * 2;
    const delta = Math.atan((2 * wheelbase * Math.sin(alpha)) / Math.max(3, Math.hypot(tx, tz)));
    const av = Math.abs(speed);
    const maxAngle = Math.max(0.05, spec.maxSteer / (1 + (av / 16) ** 2));
    const want = clamp(delta / maxAngle, -1, 1);
    this.steer += (want - this.steer) * Math.min(1, 8 * dt);

    // ---- target speed: what the road / bends / dead end allow, braking early enough ----
    let vt = Infinity;
    let dist = Math.hypot(pts[this.head].x - P.x, pts[this.head].z - P.z);
    for (let j = this.head; j < pts.length && dist < 90; j++) {
      if (j > this.head) dist += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z);
      vt = Math.min(vt, Math.sqrt(pts[j].vmax * pts[j].vmax + 2 * BRAKE_DECEL * dist));
    }
    if (!Number.isFinite(vt)) vt = 0;
    if (spec.cruiseMax !== undefined) vt = Math.min(vt, spec.cruiseMax); // rickshaws crawl, autos stay modest
    // a bus stop ahead: halt with the middle of the bus at the stop, wait a while, then go on
    if (this.stop) {
      const da = (this.stop.sx - P.x) * fx + (this.stop.sz - P.z) * fz;
      if (da < -3) {
        this.served.add(this.stop.id);
        this.stop = null;
        this.dwell = 0;
      } else {
        vt = Math.min(vt, Math.sqrt(2 * BRAKE_DECEL * 0.7 * Math.max(0, da - 0.8)));
        if (da < 3 && Math.abs(speed) < 0.7) {
          vt = 0;
          this.dwell += dt;
          if (this.dwell > 7) {
            this.served.add(this.stop.id);
            this.stop = null;
            this.dwell = 0;
          }
        }
      }
    }
    // a dead end: once the last point is beside / behind us we must STOP (never drive back to it, never turn around)
    if (this.route.terminal && this.head >= pts.length - 1) {
      const end = pts[pts.length - 1];
      if ((end.x - P.x) * fx + (end.z - P.z) * fz < 1.5) vt = 0;
    }

    // a red (or late yellow) traffic light ahead: stop behind its stop line (nothing to do once the car is past the line)
    if (this.signals && !this.ignoreSignals) {
      const sl = this.signals.brakeLimit(P.x, P.z, fx, fz, speed, spec.half.z);
      if (sl < vt) vt = sl;
    }

    // ---- things in front of the bumper ----
    let blockedByVehicle = false;
    const halfLen = spec.half.z;
    const halfW = spec.half.x + 0.55;
    for (const o of obstacles) {
      if (o.ref === v) continue;
      const rx = o.x - P.x;
      const rz = o.z - P.z;
      const a = rx * fx + rz * fz;
      if (a < 0.5) continue;
      const l = rx * fz - rz * fx;
      if (Math.abs(l) > halfW + o.r) continue;
      const reach = 6 + av * 1.8 + (av * av) / (2 * BRAKE_DECEL);
      if (a > reach + o.r + halfLen) continue;
      const gap = a - halfLen - o.r - 1.5;
      const ahead = Math.max(0, o.vx * fx + o.vz * fz);
      const allowed = ahead + Math.sqrt(2 * BRAKE_DECEL * Math.max(0, gap));
      if (allowed < vt) vt = allowed;
      if (o.kind === 'vehicle' && gap < 4) blockedByVehicle = true;
    }
    this.blocked = blockedByVehicle && av < 0.6 ? this.blocked + dt : 0;
    if (this.blocked > 7) {
      // Preserve collision safety even in a deadlock. A tiny creep may resolve a queue, but never ignore obstacles.
      vt = Math.min(vt, 1.2);
      this.blocked = 0;
    }

    // ---- pedals ----
    const inp = this.input;
    const err = vt - speed;
    inp.steer = this.steer;
    inp.throttle = false;
    inp.brake = false;
    inp.handbrake = false;
    inp.throttleAmt = 0;
    inp.brakeAmt = 0;
    if (vt < 0.4 && av < 0.8) {
      inp.handbrake = true; // standing still: hold with the handbrake (a plain brake at standstill would engage reverse)
    } else if (err > 0.4) {
      inp.throttle = true;
      inp.throttleAmt = clamp(err * 0.45, 0.15, 1);
    } else if (err < -0.7 && speed > 1) {
      inp.brake = true;
      inp.brakeAmt = clamp(-err * 0.4, 0.15, 1);
    }

    // ---- housekeeping: end of the road, stuck, flipped ----
    const last = pts[pts.length - 1];
    const toEnd = Math.hypot(last.x - P.x, last.z - P.z);
    if (this.route.terminal && toEnd < 6 && av < 0.5) this.finishedFor += dt;
    else this.finishedFor = 0;
    if (av < 0.25 && vt > 2) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck > 14) this.dead = true;
    if (v.upY < 0.35) this.flipped += dt;
    else this.flipped = 0;
    if (this.flipped > 2.5) this.dead = true;
  }
}
