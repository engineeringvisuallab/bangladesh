// AIRPORT OPERATIONS (pure numbers, no three.js, deterministic): where aircraft stand, taxi and take off at one airport.
// Everything is derived from the airport plan (src/airport/AirportPlan) + the floor height of its pad, so it works for the old airport and for the sea airport.
//
// Local frame of an airport: x along the runway (runway centre = 0,0), z = terminal side (apron, terminal, parking), same as the AirportPlan.
// World frame: x east, z SOUTH; a plane heading h travels along (cos h, sin h) in (x, z) (see AirplaneLogic).
import { localToWorld, type AirportPlan } from '../airport/AirportPlan';
import { AIRPORT_SPEC as S } from '../airport/AirportSpec';
import type { RunwayEnd } from './AirplaneLogic';

export interface Pt { x: number; z: number }

/** Height of the pavement above the pad floor (m): the wheels roll on it. */
export const PAVEMENT_Y = 0.07;

/** Distance (m) of the usable threshold from the runway end, and where a plane lines up for take-off (the outer connector). */
const THRESHOLD_INSET = 20;
const LINEUP_X = 580;

export type Side = 1 | -1;

export interface Stand {
  id: string;
  /** Local position of the fuselage centre and the local direction of the nose (0, +1 = towards the terminal). */
  lx: number;
  lz: number;
  /** World position and heading (AirplaneLogic convention). */
  x: number;
  z: number;
  heading: number;
}

export interface AirportOps {
  id: string;
  plan: AirportPlan;
  /** Height of the wheels on the pavement (m above sea level). */
  y: number;
  /** World centre of the boarding area (in front of the terminal) and its radius (m). */
  gate: { x: number; z: number; radius: number };
  /** The spot where a passenger who gets off is put down (world), and a point a little further from the terminal. */
  curb: Pt;
  stands: Record<string, Stand>;
  /** Heading (AirplaneLogic) of local direction (dx, dz). */
  headingOf(dx: number, dz: number): number;
  toWorld(lx: number, lz: number): Pt;
  /** Take-off start (outer connector) for a roll towards local +x (side = +1) or -x (side = -1). */
  takeoffEnd(side: Side): RunwayEnd;
  /** Landing threshold for a landing roll towards local +x (side = +1; you arrive from the -x end) or -x. */
  landingEnd(side: Side): RunwayEnd;
  /** Taxi route (world points) from a stand to the take-off start of `side`. */
  taxiOut(stand: Stand, side: Side): Pt[];
  /** Taxi route from a point on the runway (world, after the landing roll, travelling towards local `side`) to a stand. */
  taxiIn(from: Pt, side: Side, stand: Stand): Pt[];
  /** Local x of the runway position of a world point (to find where a plane stands on the runway). */
  localX(x: number, z: number): number;
}

/** Build the operations of one airport from its plan (+ the floor height of the pad). */
export function createAirportOps(id: string, plan: AirportPlan, floorY: number): AirportOps {
  const site = plan.site;
  const y = floorY + PAVEMENT_Y;
  const toWorld = (lx: number, lz: number): Pt => localToWorld(site, lx, lz);
  const c = Math.cos(site.heading), s = Math.sin(site.heading);
  // world direction of a local direction: x_w = dx c + dz s, z_w = -dx s + dz c (see localToWorld)
  const headingOf = (dx: number, dz: number): number => Math.atan2(-dx * s + dz * c, dx * c + dz * s);
  const halfL = S.runway.length / 2;
  const taxiZ = S.taxiway.offset;

  // ---- stands: nose-in to the jet bridges of the terminal (nose 22.5 m from the fuselage centre, bridge end at z = apron end + 8 - 22)
  const apronFar = taxiZ + S.taxiway.width / 2 + S.apron.depth; // 276
  const termZ0 = apronFar + S.terminal.gap; // 284
  const stands: Record<string, Stand> = {};
  const addStand = (sid: string, lx: number, lz: number, dx: number, dz: number): void => {
    const w = toWorld(lx, lz);
    stands[sid] = { id: sid, lx, lz, x: w.x, z: w.z, heading: headingOf(dx, dz) };
  };
  for (const [i, gx] of S.terminal.gates.entries()) addStand(`gate${i}`, gx, termZ0 - 22 - 22.5, 0, 1);
  // military hardstands (sea airport): a row on the east apron, nose towards the shelters (only used when the plan has that apron)
  for (let i = 0; i < 4; i++) addStand(`mil${i}`, 330 + i * 70, 190, 0, 1);

  const gate = { ...toWorld(0, termZ0 + 30), radius: 70 };
  const curb = toWorld(0, termZ0 + 80);

  const takeoffEnd = (side: Side): RunwayEnd => {
    const p = toWorld(-LINEUP_X * side, 0);
    // usable length from the line-up point to 40 m before the far end
    return { x: p.x, z: p.z, heading: headingOf(side, 0), length: LINEUP_X + halfL - 40, y };
  };
  const landingEnd = (side: Side): RunwayEnd => {
    const p = toWorld(-(halfL - THRESHOLD_INSET) * side, 0);
    return { x: p.x, z: p.z, heading: headingOf(side, 0), length: S.runway.length - 2 * THRESHOLD_INSET, y };
  };

  const connectors = S.taxiway.connectorX;
  const localX = (x: number, z: number): number => {
    const dx = x - site.cx, dz = z - site.cz;
    return dx * c - dz * s;
  };

  /** Local-frame route: from a stand straight north to the taxiway, along it to a connector, up the connector onto the runway centre line. */
  const taxiOut = (stand: Stand, side: Side): Pt[] => {
    const cx = -LINEUP_X * side; // the outer connector at the beginning of the roll
    const pts: Pt[] = [toWorld(stand.lx, stand.lz), toWorld(stand.lx, taxiZ), toWorld(cx, taxiZ), toWorld(cx, 40), toWorld(cx, 0)];
    return pts;
  };

  /** Route off the runway: ahead to the next connector that lies in the direction of travel, down it to the taxiway, along it to the stand. */
  const taxiIn = (from: Pt, side: Side, stand: Stand): Pt[] => {
    const fx = localX(from.x, from.z);
    const ahead = connectors.filter((cx) => (cx - fx) * side > 25).sort((a, b) => (a - b) * side);
    const cx = ahead.length ? ahead[0] : connectors[side > 0 ? connectors.length - 1 : 0];
    return [from, toWorld(Math.max(-halfL + 60, Math.min(halfL - 60, cx)), 0), toWorld(cx, 40), toWorld(cx, taxiZ), toWorld(stand.lx, taxiZ), toWorld(stand.lx, stand.lz)];
  };

  return { id, plan, y, gate, curb, stands, headingOf, toWorld, takeoffEnd, landingEnd, taxiOut, taxiIn, localX };
}

/** A plane rolling along a taxi route at a constant speed. step() moves it; the heading turns smoothly towards the next point. */
export class TaxiMover {
  x: number;
  z: number;
  heading: number;
  done = false;
  /** True: stand still (hold short of the runway). */
  holding = false;
  private i = 1;

  /** Index of the route point the plane is rolling to (1 = first leg). */
  get index(): number {
    return this.i;
  }

  constructor(private readonly route: Pt[], startHeading: number, private readonly speed = 14, private readonly turnRate = 0.7) {
    this.x = route[0].x;
    this.z = route[0].z;
    this.heading = startHeading;
  }

  step(dt: number): void {
    if (this.done || this.holding) return;
    let budget = this.speed * dt;
    while (budget > 0 && this.i < this.route.length) {
      const t = this.route[this.i];
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      if (d <= budget) { this.x = t.x; this.z = t.z; budget -= d; this.i++; } else { this.x += (dx / d) * budget; this.z += (dz / d) * budget; budget = 0; }
    }
    if (this.i >= this.route.length) { this.done = true; return; }
    const want = Math.atan2(this.route[this.i].z - this.z, this.route[this.i].x - this.x);
    const dh = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    this.heading += Math.max(-this.turnRate * dt, Math.min(this.turnRate * dt, dh));
  }

  /** Distance still to roll along the route (m). */
  remaining(): number {
    let d = 0, px = this.x, pz = this.z;
    for (let k = this.i; k < this.route.length; k++) { d += Math.hypot(this.route[k].x - px, this.route[k].z - pz); px = this.route[k].x; pz = this.route[k].z; }
    return d;
  }
}
