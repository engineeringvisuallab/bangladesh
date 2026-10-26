import type { RailNetwork } from '../rail/RailNetwork';
import { RailGraph, type EndKey, type GraphLeg } from './RailGraph';
import { LegPath, type PathPose } from './TrackPath';
import { CAR_GAP, CONSIST, TRAIN, type CarSpec } from './TrainConfig';
import { SignalSystem } from './Signals';

/**
 * STAGE 14 / Step 5a: train movement (headless: no three.js, no Rapier, no game classes).
 *
 * A train stands at a platform (dwell 20-30 s), picks the next leg from the routing graph, accelerates along the leg path, keeps under the
 * speed envelope of the path (curves, links, crossover, station approach, braking to the platform) and stops with the middle of the train at the
 * platform centre. At a terminal end it changes cab and drives back out on the other track; everywhere else it only goes forward.
 * Step 6: with `FleetOptions.signals` the trains obey fixed-block signals (Signals.ts): one train per block, red = stop before the block, a train waits
 * on the platform until its route is clear. Without it (the Step 5a tests) trains do not look at each other.
 */
export interface CarPose {
  kind: CarSpec['kind'];
  /** Car centre (the middle of its two bogies); y = rail head top. */
  x: number;
  y: number;
  z: number;
  /** Unit vector from the rear bogie to the front bogie in the DIRECTION OF TRAVEL. */
  fx: number;
  fy: number;
  fz: number;
  /** True: the model's nose must point opposite to (fx, fy, fz). */
  flipped: boolean;
  /** The two bogie positions (front bogie, rear bogie in the direction of travel). */
  bf: PathPose;
  br: PathPose;
}

export type TrainEventKind = 'arrive' | 'depart' | 'reverse';
export interface TrainEvent {
  t: number;
  kind: TrainEventKind;
  station: string;
  node: EndKey;
  /** Distance (m) from the front to the planned stop (arrive only). */
  stopError?: number;
}

/** What a listener (announcements, HUD) hears: the 3 logged kinds plus the signal ones, which are never stored in `Train.events`. */
export type TrainNoticeKind = TrainEventKind | 'approach' | 'hold' | 'clear';
export interface TrainNotice {
  t: number;
  kind: TrainNoticeKind;
  train: Train;
  /** Station the notice is about (platform for arrive / depart / hold-at-platform, destination for approach / hold-at-home-signal). */
  station: string;
  /** hold / clear: true = at a platform (route not clear), false = at a red signal on the open line. */
  atPlatform?: boolean;
}

/** The "approaching the station" notice is sent when this far (m) from the stopping point. */
export const APPROACH_NOTICE = 500;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Train {
  state: 'dwell' | 'run' = 'dwell';
  /** Node the train stands at (or last stood at). */
  node: EndKey;
  path: LegPath;
  leg: GraphLeg;
  /** Track distance of the FRONT of the train on `path`, speed (m/s), seconds of dwell left. */
  s: number;
  /** `s` before the last fixed step (the picture and the collider interpolate between the two). */
  prevS: number;
  v = 0;
  dwell: number;
  /** True: the cab car leads (the train has reversed an odd number of times). */
  reversed = false;
  private spawnedFacingOut = false;
  /** Step 6: waiting on the platform because the route is not clear; seconds waited in total; red-signal stops. */
  held = false;
  heldTime = 0;
  holds = 0;
  redStops = 0;
  /** Stopped in front of a red signal on the line right now. */
  atRed = false;
  /** Signal limit (track distance where the train must stop) of the last step; Infinity = green. */
  signalLimit = Infinity;
  private approachSent = false;
  /** Distance travelled (m) and counters. */
  odometer = 0;
  stops = 0;
  reversals = 0;
  readonly events: TrainEvent[] = [];
  /** Offset (m) from the front of the train to the front of the car at path position j, for the normal and for the reversed order. */
  private offN: number[] = [];
  private offR: number[] = [];

  constructor(readonly id: number, private fleet: TrainFleet, node: EndKey, readonly keepEvents: boolean) {
    this.node = node;
    this.leg = fleet.chooseLeg(this, node);
    this.path = fleet.pathFor(this.leg);
    this.s = this.path.sStart;
    this.prevS = this.s;
    this.dwell = fleet.dwellTime();
    // a train placed at a terminal end starts on the track it will LEAVE on (its first leg is the reversal): it already faces out, so the first
    // departure must not flip it again
    if (this.leg.via === null) {
      this.reversed = true;
      this.spawnedFacingOut = true;
    }
    let a = 0, b = 0;
    for (let j = 0; j < CONSIST.length; j++) {
      this.offN.push(a);
      this.offR.push(b);
      a += CONSIST[j].length + CAR_GAP;
      b += CONSIST[CONSIST.length - 1 - j].length + CAR_GAP;
    }
    fleet.signals?.attach(this);
  }

  /** Path of the leg the train will drive next (the one it leaves on after the dwell). */
  pathNext(): LegPath {
    return this.fleet.pathFor(this.leg);
  }

  /** Station this train stands at (state dwell) or is heading for (state run). */
  get station(): string {
    return this.state === 'dwell' ? this.fleet.graph.nodes.get(this.node)!.station : this.leg.toStation;
  }

  /** Id of the train this one is waiting for (standing ready to leave, or stopped at a red), else undefined. Used by the deadlock check. */
  waitingFor(): number | undefined {
    const b = this.fleet.signals?.blockedBy.get(this.id);
    if (b === undefined) return undefined;
    if (this.state === 'dwell') return this.dwell <= 0 ? b : undefined;
    return this.v < 0.5 ? b : undefined;
  }

  /**
   * Estimated seconds until the train stands at its next platform (running trains only), by driving a copy of it along the speed envelope.
   * Signals are NOT predicted (a train stopped at a red is as late as the red lasts), so it is an estimate.
   */
  etaArrive(): number | null {
    if (this.state !== 'run') return null;
    const p = this.path, dt = 0.5;
    let s = this.s, v = this.v, t = 0;
    for (let k = 0; k < 4000 && s < p.sStop - 0.02; k++) {
      const ahead = p.envAt(s + v * dt + 0.5 * TRAIN.accel * dt * dt);
      const a = Math.max(-TRAIN.maxBrake, Math.min(TRAIN.accel, (ahead - v) / dt));
      v = Math.max(0, v + a * dt);
      s += v * dt;
      t += dt;
      if (v < 0.3 && p.sStop - s < 3) break;
    }
    return t;
  }

  private notice(t: number, kind: TrainNoticeKind, station: string, atPlatform?: boolean): void {
    for (const f of this.fleet.listeners) f({ t, kind, train: this, station, atPlatform });
  }

  /** Cars in path order (index 0 = the car at the front of the train). */
  carAt(j: number): CarSpec {
    return CONSIST[this.reversed ? CONSIST.length - 1 - j : j];
  }

  /**
   * Where the FRONT of the train is drawn (and where its collider is): between the position before and after the last 0.1 s step, by the time
   * since that step (fleet.phase). Smooth at any frame rate, one step (0.1 s) behind the simulation. View, collider, overlap check and map
   * marker all use this. The headless sim tests call step() directly (phase 0 = the position right after the step).
   */
  renderS(): number {
    // in every state (also right after arriving: the last step of the stop is interpolated, so the picture does not jump to the stop point)
    const a = Math.max(0, Math.min(1, this.fleet.phase / TRAIN.dt));
    return this.prevS + (this.s - this.prevS) * a;
  }

  /** Pose of the car at path position j (0 = leading car). */
  carPose(j: number, out: CarPose): CarPose {
    const car = this.carAt(j);
    const sFront = this.renderS();
    const front = sFront - (this.reversed ? this.offR[j] : this.offN[j]);
    const centre = front - car.length / 2;
    this.path.posAt(centre + car.bogieHalf, out.bf);
    this.path.posAt(centre - car.bogieHalf, out.br);
    const dx = out.bf.x - out.br.x, dy = out.bf.y - out.br.y, dz = out.bf.z - out.br.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    out.kind = car.kind;
    out.x = (out.bf.x + out.br.x) / 2;
    out.y = (out.bf.y + out.br.y) / 2;
    out.z = (out.bf.z + out.br.z) / 2;
    out.fx = dx / l;
    out.fy = dy / l;
    out.fz = dz / l;
    out.flipped = car.flip !== this.reversed;
    return out;
  }

  /** Advance one fixed step. */
  step(dt: number, t: number): void {
    this.prevS = this.s;
    const sig = this.fleet.signals;
    if (this.state === 'dwell') {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        // platform (starter) signal: the route through the throat and the first block of the outbound track must be clear
        if (sig && !sig.canDepart(this)) {
          if (!this.held) {
            this.held = true;
            this.holds++;
            sig.departHolds++;
            this.notice(t, 'hold', this.station, true);
          }
          this.heldTime += dt;
          return;
        }
        if (this.held) {
          this.held = false;
          this.notice(t, 'clear', this.station, true);
        }
        this.depart(t);
      }
      return;
    }
    const p = this.path;
    // block signals: release behind the tail, claim ahead, and the track distance of the red signal in front (Infinity = green)
    const lim = sig ? sig.advance(this) : Infinity;
    this.signalLimit = lim;
    // look one step ahead: the speed after this step must still be inside the envelope there
    const sAhead = this.s + this.v * dt + 0.5 * TRAIN.accel * dt * dt;
    let ahead = p.envAt(sAhead);
    if (lim !== Infinity) ahead = Math.min(ahead, Math.sqrt(Math.max(0, 2 * TRAIN.serviceBrake * (lim - sAhead))));
    let a = (ahead - this.v) / dt;
    a = Math.max(-TRAIN.maxBrake, Math.min(TRAIN.accel, a));
    this.v = Math.max(0, this.v + a * dt);
    const ds = this.v * dt;
    this.s += ds;
    this.odometer += ds;
    if (!this.approachSent && this.s >= p.sStop - APPROACH_NOTICE) {
      this.approachSent = true;
      this.notice(t, 'approach', this.leg.toStation);
    }
    if (lim !== Infinity && this.v < 0.3 && lim - this.s < 5) {
      if (!this.atRed) {
        this.atRed = true;
        this.redStops++;
        if (sig) sig.redStops++;
        this.notice(t, 'hold', p.sStop - this.s < 650 ? this.leg.toStation : this.station, false);
      }
    } else if (this.atRed && lim === Infinity) {
      this.atRed = false;
      this.notice(t, 'clear', this.leg.toStation, false);
    }
    if (this.s >= p.sStop - 0.02) this.arrive(t);
  }

  private depart(t: number): void {
    this.state = 'run';
    if (this.leg.via === null && !this.spawnedFacingOut) {
      this.reversed = !this.reversed;
      this.reversals++;
      this.log(t, 'reverse');
    }
    this.spawnedFacingOut = false;
    this.approachSent = false;
    // the new path starts with the train in exactly the place it stands (checked by the test: pose jump)
    this.path = this.fleet.pathFor(this.leg);
    this.s = this.path.sStart;
    this.prevS = this.s;
    this.v = 0;
    this.fleet.signals?.rebase(this);
    this.log(t, 'depart');
  }

  private arrive(t: number): void {
    const err = this.path.sStop - this.s;
    this.s = this.path.sStop;
    this.v = 0;
    this.state = 'dwell';
    this.stops++;
    this.atRed = false;
    this.fleet.signals?.blockedBy.delete(this.id);
    this.node = this.leg.to;
    const nd = this.fleet.graph.nodes.get(this.node)!;
    if (this.keepEvents) this.events.push({ t, kind: 'arrive', station: nd.station, node: this.node, stopError: err });
    this.dwell = this.fleet.dwellTime();
    this.leg = this.fleet.chooseLeg(this, this.node);
    this.notice(t, 'arrive', nd.station);
    // the pose does not change: the arrival path keeps carrying the train while it dwells; the next leg path takes over in depart()
  }

  private log(t: number, kind: TrainEventKind): void {
    const nd = this.fleet.graph.nodes.get(this.node)!;
    this.notice(t, kind, nd.station);
    if (!this.keepEvents) return;
    this.events.push({ t, kind, station: nd.station, node: this.node });
  }
}

export interface FleetOptions {
  seed?: number;
  /** Keep a list of arrive / depart / reverse events per train (tests). */
  keepEvents?: boolean;
  /** Step 6: obey fixed-block signals (one train per block). Off = the Step 5a behaviour. */
  signals?: boolean;
}

export class TrainFleet {
  readonly graph: RailGraph;
  readonly trains: Train[] = [];
  /** Simulated seconds. */
  time = 0;
  private rng: () => number;
  /** Fixed-block signalling (null = off). */
  readonly signals: SignalSystem | null;
  /** Called for every train notice (arrive, depart, reverse, approach, hold, clear). */
  readonly listeners: ((n: TrainNotice) => void)[] = [];
  private paths = new Map<string, LegPath>();
  private acc = 0;

  /** Seconds since the last fixed step (0 .. TRAIN.dt): the view extrapolates the running trains by this much. */
  get phase(): number {
    return this.acc;
  }

  constructor(readonly rail: RailNetwork, private opts: FleetOptions = {}) {
    this.graph = new RailGraph(rail);
    this.signals = opts.signals ? new SignalSystem(rail) : null;
    this.rng = mulberry32(opts.seed ?? 1);
  }

  pathFor(leg: GraphLeg): LegPath {
    let p = this.paths.get(leg.key);
    if (!p) {
      p = new LegPath(this.rail, leg);
      this.paths.set(leg.key, p);
    }
    return p;
  }

  dwellTime(): number {
    return TRAIN.dwellMin + this.rng() * (TRAIN.dwellMax - TRAIN.dwellMin);
  }

  /** Next leg from a node: the only one, or a random one that does not simply go back to the station the train came from. */
  chooseLeg(train: Train, node: EndKey): GraphLeg {
    const legs = this.graph.legsFrom(node);
    if (legs.length === 1) return legs[0];
    const lastStation = train.leg ? this.graph.nodes.get(train.leg.from)!.station : '';
    const fresh = legs.filter((l) => l.toStation !== lastStation);
    const pool = fresh.length ? fresh : legs;
    return pool[Math.floor(this.rng() * pool.length) % pool.length];
  }

  /** Put a train, standing at a platform and about to dwell, on the arrival end `node`. */
  spawn(node: EndKey): Train {
    if (!this.graph.nodes.has(node)) throw new Error(`no such station end: ${node}`);
    const t = new Train(this.trains.length, this, node, !!this.opts.keepEvents);
    this.trains.push(t);
    return t;
  }

  /** Advance the simulation by `dt` seconds (any size; split into fixed steps). */
  update(dt: number): void {
    this.acc += dt;
    while (this.acc >= TRAIN.dt) {
      this.acc -= TRAIN.dt;
      this.time += TRAIN.dt;
      for (const tr of this.trains) tr.step(TRAIN.dt, this.time);
    }
  }
}
