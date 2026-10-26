// AIRPLANE MANAGER (STAGE C): the aircraft of the world and their timetable.
//   - a SHUTTLE airliner flies between the old airport (north-east) and the sea airport (south coast): it stands at a gate, taxis to the runway, takes off,
//     flies, lands, taxis in and stands again. A player can ride it (src/airplane/PlaneRider).
//   - one more airliner comes from ABROAD (from beyond the edge of the map), lands, stands at a gate, then takes off and flies away abroad again.
//   - 4 military FIGHTERS stand on the hardstands of the sea airport; now and then one takes off, flies over the city and lands again.
//   - a few airliners just stand at the gates.
// Models are hidden when the player is far away. All numbers come from AirplaneLogic / AirplaneOps (pure, tested without three.js).
import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { createAirplaneModel, type AirplaneKind, type AirplaneModel } from './AirplaneModel';
import { FIGHTER_PERF, PLANE_PERF, PlaneFlight, buildArrivalPlan, buildDeparturePlan, buildFlightPlan, type PlanePerf, type Waypoint } from './AirplaneLogic';
import { TaxiMover, createAirportOps, type AirportOps, type Pt, type Side, type Stand } from './AirplaneOps';

export interface AirplaneDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

/** Planes are drawn within this distance of the player (m). */
const SHOW_DIST = 9000;
/** Cruise height above the runway (m): above every mountain of the map (the highest is about 490 m). */
const CRUISE = 700;
/** How far beyond the airport the planes from / to abroad start / end (m): outside the 10 km map. */
const FAR = 13000;
/** The old airport lies in a pocket of the hills: planes land there from the west on a steeper glide path (the standard one would cut into the ridge). */
const OLD_APPROACH: PlanePerf = { ...PLANE_PERF, glideSlope: (8.5 * Math.PI) / 180, finalDist: 3000 };

export interface AircraftPose { x: number; y: number; z: number; heading: number; pitch: number; roll: number }

type Mode = 'parked' | 'taxi-out' | 'flight' | 'taxi-in' | 'away';
type Job = { type: 'shuttle'; to: AirportOps } | { type: 'abroad' } | { type: 'sortie' };

class Aircraft {
  readonly model: AirplaneModel;
  mode: Mode = 'parked';
  job: Job | null = null;
  /** parked: seconds until the next job; away: seconds until it comes back. */
  timer = 0;
  flight: PlaneFlight | null = null;
  taxi: TaxiMover | null = null;
  /** True once a plane that has just landed has begun to taxi in (it waits on the runway while another plane taxis). */
  taxiStarted = false;
  /** The flight plan of the job being started (flown after the taxi to the runway). */
  plan: Waypoint[] | null = null;
  /** Id of its stand ('gate1', 'mil2' ...): the same stand exists at every airport. */
  readonly standId: string;
  /** Runway direction of the current take-off (departSide) and landing (landSide); +1 = towards local +x of the airport. */
  departSide: Side = 1;
  landSide: Side = 1;
  /** Where it lands (null = flies away abroad) and the landing threshold (to estimate when the runway is needed). */
  dest: AirportOps | null = null;
  thr: Pt | null = null;
  readonly pose: AircraftPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };

  constructor(readonly id: string, readonly kind: AirplaneKind, readonly perf: PlanePerf, root: THREE.Object3D, public airport: AirportOps, public stand: Stand) {
    this.standId = stand.id;
    this.model = createAirplaneModel(kind);
    root.add(this.model.group);
    this.park();
  }

  /** Put the plane on its stand. */
  park(): void {
    this.mode = 'parked';
    this.flight = null;
    this.taxi = null;
    const p = this.pose;
    p.x = this.stand.x; p.z = this.stand.z; p.y = this.airport.y; p.heading = this.stand.heading; p.pitch = 0; p.roll = 0;
    this.model.setGear(true);
  }

  apply(): void {
    const p = this.pose;
    this.model.place(p.x, p.y, p.z, p.heading, p.pitch, p.roll);
  }
}

/** What the player (or the HUD) may know about the shuttle. */
export interface ShuttleStatus {
  mode: Mode;
  /** Airport id it stands at / taxis at (parked, taxi-out), or flies to (flight). */
  airportId: string;
  /** Seconds until it leaves (parked only). */
  departIn: number;
  /** Seconds until it lands (flight only; an estimate), else null. */
  eta: number | null;
  pose: AircraftPose;
  /** Airport id of the next destination (parked) / the destination (flight). */
  toId: string;
  boarded: boolean;
}

export class AirplaneManager {
  readonly airports: readonly AirportOps[];
  private readonly old: AirportOps;
  private readonly sea: AirportOps;
  private readonly craft: Aircraft[] = [];
  private readonly shuttleCraft: Aircraft;
  private readonly abroadCraft: Aircraft;
  private readonly fighters: Aircraft[] = [];
  private readonly statics: AirplaneModel[] = [];
  private p = new THREE.Vector3();
  private sortieTimer = 70;
  private sortieNext = 0;
  private abroadAirport = 0;
  private abroadSeaSide: Side = 1;
  private shuttleBoarded = false;
  /** Game clock of this manager (s) and the runway time slots that jobs have reserved (see reserve()). */
  private clock = 0;
  private slots: { ap: AirportOps; start: number; end: number; owner: Aircraft }[] = [];

  constructor(private d: AirplaneDeps) {
    const t = d.terrain;
    this.old = createAirportOps('old', t.airport.plan, t.airport.floorY);
    this.sea = createAirportOps('sea', t.airportSea.plan, t.airportSea.floorY);
    this.airports = [this.old, this.sea];

    // the shuttle starts at the sea airport (new, next to the city); the airliner from abroad is away at the start
    this.shuttleCraft = new Aircraft('shuttle', 'airliner', PLANE_PERF, d.root, this.sea, this.sea.stands.gate1);
    this.shuttleCraft.timer = 40;
    this.shuttleCraft.job = null;
    this.abroadCraft = new Aircraft('abroad', 'airliner', PLANE_PERF, d.root, this.old, this.old.stands.gate2);
    this.hide(this.abroadCraft, 90);
    this.craft.push(this.shuttleCraft, this.abroadCraft);
    // military fighters on the hardstands of the sea airport
    for (let i = 0; i < 4; i++) {
      const f = new Aircraft(`fighter${i}`, 'fighter', FIGHTER_PERF, d.root, this.sea, this.sea.stands[`mil${i}`]);
      f.timer = 1e9;
      this.fighters.push(f);
      this.craft.push(f);
    }
    // airliners that just stand at the gates (nothing flies them)
    for (const [ap, gate] of [[this.sea, 'gate0'], [this.sea, 'gate3'], [this.old, 'gate0']] as const) {
      const m = createAirplaneModel('airliner');
      const st = ap.stands[gate];
      m.place(st.x, ap.y, st.z, st.heading, 0, 0);
      d.root.add(m.group);
      this.statics.push(m);
    }
    for (const a of this.craft) a.apply();
  }

  /* ---------------------------------------------------------------- queries for the rider / HUD */

  get shuttle(): ShuttleStatus {
    const a = this.shuttleCraft;
    let eta: number | null = null;
    if (a.mode === 'flight' && a.thr && a.flight) {
      const s = a.flight.state;
      eta = Math.hypot(a.thr.x - s.x, a.thr.z - s.z) / 95 + 20;
    }
    const to = a.job && a.job.type === 'shuttle' ? a.job.to : a.airport === this.old ? this.sea : this.old;
    return {
      mode: a.mode,
      airportId: a.dest && a.mode === 'flight' ? a.dest.id : a.airport.id,
      departIn: a.mode === 'parked' ? Math.max(0, a.timer) : 0,
      eta,
      pose: a.pose,
      toId: a.mode === 'flight' && a.dest ? a.dest.id : to.id,
      boarded: this.shuttleBoarded,
    };
  }

  /** The airport whose boarding area (in front of the terminal) contains the world point, with the shuttle standing there; else null. */
  shuttleGateAt(x: number, z: number): AirportOps | null {
    const a = this.shuttleCraft;
    if (a.mode !== 'parked') return null;
    const g = a.airport.gate;
    return Math.hypot(x - g.x, z - g.z) <= g.radius ? a.airport : null;
  }

  /** The player gets on: the shuttle leaves soon. */
  board(): void {
    this.shuttleBoarded = true;
    this.shuttleCraft.timer = Math.min(this.shuttleCraft.timer, 10);
  }

  /** The player gets off (only when the shuttle stands at a gate): where he is put down (world, standing height), or null. */
  alight(): { x: number; y: number; z: number } | null {
    const a = this.shuttleCraft;
    if (a.mode !== 'parked') return null;
    this.shuttleBoarded = false;
    const c = a.airport.curb;
    return { x: c.x, y: a.airport.y + 1.6, z: c.z };
  }

  airport(id: string): AirportOps {
    return id === 'sea' ? this.sea : this.old;
  }

  /* ---------------------------------------------------------------- frame update */

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    this.clock += step;
    this.d.playerWorld(this.p);
    for (const a of this.craft) this.updateCraft(a, step);
    // a fighter takes off every few minutes (when no other flight is on its way)
    this.sortieTimer -= step;
    if (this.sortieTimer <= 0) {
      const f = this.fighters[this.sortieNext % this.fighters.length];
      if (f.mode === 'parked' && this.runwayClear(this.sea, f) && !this.taxiBusy(this.sea, f)) {
        f.job = { type: 'sortie' };
        if (this.startJob(f)) {
          this.sortieNext++;
          this.sortieTimer = 200;
        } else {
          f.job = null;
          this.sortieTimer = 12;
        }
      } else this.sortieTimer = 15;
    }
    for (const a of this.craft) {
      a.apply();
      a.model.group.visible = a.mode !== 'away' && Math.hypot(this.p.x - a.pose.x, this.p.z - a.pose.z) < SHOW_DIST;
    }
    for (const m of this.statics) m.group.visible = Math.hypot(this.p.x - m.group.position.x, this.p.z - m.group.position.z) < SHOW_DIST;
  }

  private hide(a: Aircraft, seconds: number): void {
    a.mode = 'away';
    a.timer = seconds;
    a.flight = null;
    a.taxi = null;
    a.model.group.visible = false;
  }

  private updateCraft(a: Aircraft, dt: number): void {
    switch (a.mode) {
      case 'parked': {
        if (a === this.shuttleCraft) {
          a.timer -= dt;
          const to = a.airport === this.old ? this.sea : this.old;
          if (a.timer <= 0 && this.runwayClear(a.airport, a) && !this.taxiBusy(a.airport, a) && this.runwayClear(to, a)) {
            a.job = { type: 'shuttle', to };
            if (!this.startJob(a)) { a.job = null; a.timer = 6; } // the runway time slot is taken: wait a little
          }
        } else if (a === this.abroadCraft) {
          a.timer -= dt;
          if (a.timer <= 0 && this.runwayClear(a.airport, a) && !this.taxiBusy(a.airport, a)) {
            a.job = { type: 'abroad' };
            if (!this.startJob(a)) { a.job = null; a.timer = 6; }
          }
        }
        return;
      }
      case 'away': {
        a.timer -= dt;
        if (a === this.abroadCraft && a.timer <= 0) this.startArrivalFromAbroad(a);
        return;
      }
      case 'taxi-out': {
        const t = a.taxi!;
        // hold short of the runway while another aircraft uses it or lands soon
        t.holding = t.index <= 3 && t.remaining() <= 60 && !this.runwayClear(a.airport, a);
        t.step(dt);
        this.copyTaxi(a, t);
        if (t.done) this.beginTakeoff(a);
        return;
      }
      case 'flight': {
        const f = a.flight!;
        f.step(dt);
        const s = f.state, p = a.pose;
        p.x = s.x; p.y = s.y; p.z = s.z; p.heading = s.heading; p.pitch = s.pitch; p.roll = s.roll;
        a.model.setGear(s.gearDown);
        if (s.done) {
          if (!a.dest) { // flew away abroad
            this.hide(a, 150 + Math.random() * 90);
            return;
          }
          // landed: taxi in to the stand
          a.airport = a.dest;
          a.stand = a.airport.stands[a.standId];
          const route = a.airport.taxiIn({ x: s.x, z: s.z }, a.landSide, a.stand);
          a.taxi = new TaxiMover(route, s.heading, a.kind === 'fighter' ? 18 : 14);
          a.taxi.holding = true;
          a.taxiStarted = false;
          a.flight = null;
          a.mode = 'taxi-in';
          p.pitch = 0; p.roll = 0;
        }
        return;
      }
      case 'taxi-in': {
        const t = a.taxi!;
        if (!a.taxiStarted && !this.taxiBusy(a.airport, a)) { a.taxiStarted = true; t.holding = false; }
        t.step(dt);
        this.copyTaxi(a, t);
        if (t.done) {
          a.park();
          a.job = null;
          a.timer = a === this.shuttleCraft ? 75 : a === this.abroadCraft ? 100 : 1e9;
        }
        return;
      }
    }
  }

  private copyTaxi(a: Aircraft, t: TaxiMover): void {
    const p = a.pose;
    p.x = t.x; p.z = t.z; p.y = a.airport.y; p.heading = t.heading; p.pitch = 0; p.roll = 0;
  }

  /* ---------------------------------------------------------------- jobs */

  /** The aircraft stands at `a.airport` and starts its job: taxi to the runway. */
  private startJob(a: Aircraft): boolean {
    const job = a.job!;
    const ap = a.airport;
    let side: Side;
    if (ap === this.old) side = -1; // the old airport: always take off towards the west (over the low land, away from the hills in the east)
    else if (job.type === 'sortie') side = -1; // towards the east (world), the hardstands are at that end
    else if (job.type === 'shuttle') side = -1; // the old airport is north-east: take off towards the east
    else {
      side = this.abroadSeaSide;
      this.abroadSeaSide = side === 1 ? -1 : 1;
    }
    a.departSide = side;
    const dep = ap.takeoffEnd(side);
    let plan: Waypoint[];
    if (job.type === 'shuttle') {
      const dest = job.to;
      a.dest = dest;
      a.landSide = 1; // both airports are approached from the same end: old from the west, sea from the east (travelling west)
      const arr = dest.landingEnd(a.landSide);
      a.thr = { x: arr.x, z: arr.z };
      plan = buildFlightPlan(dep, arr, dest === this.old ? OLD_APPROACH : PLANE_PERF, { cruiseAlt: CRUISE });
    } else if (job.type === 'abroad') {
      a.dest = null;
      a.thr = null;
      const h = dep.heading;
      plan = buildDeparturePlan(dep, { x: dep.x + Math.cos(h) * FAR, z: dep.z + Math.sin(h) * FAR }, PLANE_PERF, { cruiseAlt: CRUISE });
    } else {
      // military sortie: take off, fly over the city and come back to the sea airport
      a.dest = ap;
      a.landSide = 1;
      const arr = ap.landingEnd(a.landSide);
      a.thr = { x: arr.x, z: arr.z };
      const y = ap.y + 650;
      const dp = buildDeparturePlan(dep, { x: -700, z: 1500 }, FIGHTER_PERF, { cruiseAlt: 650 });
      const ap2 = buildArrivalPlan(arr, { x: 1500, z: 300, y }, FIGHTER_PERF, { cruiseAlt: 650 });
      plan = [...dp, ...ap2];
    }
    // reserve the runway: the take-off at this airport and the landing at the destination must not overlap any other plane's use of that runway
    const route = ap.taxiOut(a.stand, side);
    const speed = a.kind === 'fighter' ? 18 : 14;
    const taxiT = this.routeLength(route) / speed + 12;
    const sim = this.simulate(plan, dep.heading, a.perf);
    const depSlot = { start: this.clock + taxiT - 10, end: this.clock + taxiT + sim.liftT + 20 };
    const arrSlot = a.dest ? { start: this.clock + taxiT + sim.touchT - 50, end: this.clock + taxiT + sim.doneT + 40 } : null;
    if (!this.slotFree(ap, depSlot, a) || (a.dest && arrSlot && !this.slotFree(a.dest, arrSlot, a))) return false;
    this.reserve(a, ap, depSlot);
    if (a.dest && arrSlot) this.reserve(a, a.dest, arrSlot, true);
    a.plan = plan;
    a.taxi = new TaxiMover(route, a.stand.heading, speed);
    a.mode = 'taxi-out';
    return true;
  }

  /** Flight time (s) from the start of the plan to lift-off, touchdown and the end (done), simulated at a coarse step with the same logic as the real flight. */
  private simulate(plan: Waypoint[], heading: number, perf: PlanePerf): { liftT: number; touchT: number; doneT: number } {
    const f = new PlaneFlight(plan, heading, perf);
    let t = 0, lift = -1, touch = -1;
    while (!f.state.done && t < 1200) {
      f.step(0.5);
      t += 0.5;
      const ph = f.state.phase;
      if (lift < 0 && (ph === 'climb' || f.airborneStart)) lift = t;
      if (touch < 0 && (ph === 'flare' || ph === 'landing-roll')) touch = t;
    }
    return { liftT: lift < 0 ? t : lift, touchT: touch < 0 ? t : touch, doneT: t };
  }

  private routeLength(route: Pt[]): number {
    let d = 0;
    for (let i = 1; i < route.length; i++) d += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    return d;
  }

  private slotFree(ap: AirportOps, w: { start: number; end: number }, self: Aircraft): boolean {
    this.slots = this.slots.filter((sl) => sl.end > this.clock - 20);
    return !this.slots.some((sl) => sl.ap === ap && sl.owner !== self && sl.start < w.end && w.start < sl.end);
  }

  /** Book a runway time slot (a plane's older slots are dropped when it books its departure slot). */
  private reserve(a: Aircraft, ap: AirportOps, w: { start: number; end: number }, keep = false): void {
    if (!keep) this.slots = this.slots.filter((sl) => sl.owner !== a);
    this.slots.push({ ap, start: w.start, end: w.end, owner: a });
  }

  private beginTakeoff(a: Aircraft): void {
    a.flight = new PlaneFlight(a.plan!, a.pose.heading, a.perf);
    a.plan = null;
    a.taxi = null;
    a.mode = 'flight';
    a.model.setGear(true);
  }

  /** The airliner from abroad appears at the edge of the map and flies to one of the airports. */
  private startArrivalFromAbroad(a: Aircraft): void {
    const ap = this.airports[this.abroadAirport % 2];
    if (!this.runwayClear(ap, a)) { a.timer = 15; return; }
    this.abroadAirport++;
    a.airport = ap;
    a.stand = ap.stands[a.standId];
    a.landSide = ap === this.old ? 1 : this.abroadSeaSide;
    this.abroadSeaSide = this.abroadSeaSide === 1 ? -1 : 1;
    const arr = ap.landingEnd(a.landSide);
    const h = arr.heading;
    const from = { x: arr.x - Math.cos(h) * FAR, z: arr.z - Math.sin(h) * FAR, y: ap.y + 900 };
    a.dest = ap;
    a.thr = { x: arr.x, z: arr.z };
    const perf = ap === this.old ? OLD_APPROACH : PLANE_PERF;
    const plan = buildArrivalPlan(arr, from, perf, { cruiseAlt: CRUISE });
    const sim = this.simulate(plan, h, perf);
    const slot = { start: this.clock + sim.touchT - 50, end: this.clock + sim.doneT + 40 };
    if (!this.slotFree(ap, slot, a)) { a.timer = 6; return; }
    this.reserve(a, ap, slot);
    a.flight = new PlaneFlight(plan, h, perf);
    a.mode = 'flight';
    a.job = { type: 'abroad' };
    a.model.setGear(false);
    const st = a.flight.state, p = a.pose;
    p.x = st.x; p.y = st.y; p.z = st.z; p.heading = st.heading; p.pitch = 0; p.roll = 0;
  }

  /** True when another plane is rolling on the taxiways of `ap` (a plane that waits at the hold-short line or on the runway does not count). */
  private taxiBusy(ap: AirportOps, self: Aircraft): boolean {
    for (const o of this.craft) {
      if (o !== self && o.airport === ap && (o.mode === 'taxi-out' || o.mode === 'taxi-in') && o.taxi && !o.taxi.holding) return true;
    }
    return false;
  }

  /** True when the runway of `ap` is free for `self` to enter: nobody on it, nobody about to land. */
  private runwayClear(ap: AirportOps, self: Aircraft): boolean {
    for (const o of this.craft) {
      if (o === self) continue;
      if (o.mode === 'flight' && o.flight) {
        const ph = o.flight.state.phase;
        if (o.airport === ap && (ph === 'takeoff-roll' || ph === 'rotate')) return false;
        if (o.dest === ap && o.thr) {
          const s = o.flight.state;
          if (ph === 'final' || ph === 'flare' || ph === 'landing-roll') return false;
          if (Math.hypot(o.thr.x - s.x, o.thr.z - s.z) / 80 < 110) return false;
        }
      } else if (o.mode === 'taxi-out' && o.airport === ap && o.taxi && o.taxi.index >= 4) return false;
      else if (o.mode === 'taxi-in' && o.airport === ap && o.taxi && o.taxi.index <= 2) return false;
    }
    return true;
  }

  dispose(): void {
    for (const a of this.craft) { this.d.root.remove(a.model.group); a.model.dispose(); }
    for (const m of this.statics) { this.d.root.remove(m.group); m.dispose(); }
  }
}
