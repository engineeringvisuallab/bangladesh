import * as THREE from 'three';
import type { RailNetwork } from '../rail/RailNetwork';
import { bn, bnNum } from '../i18n';
import { alightSpot, canAlight, findBoardable, pathIndex, type Boardable } from './TrainRide';
import type { TrainManager } from './TrainManager';
import type { CarPose, Train } from './TrainSim';

/** What the rider needs from the game (kept small so the class has no dependency on the Engine). */
export interface RiderDeps {
  trains: TrainManager;
  rail: RailNetwork;
  groundAt: (x: number, z: number) => number;
  player: {
    active: boolean;
    inVehicle: boolean;
    setInVehicle(on: boolean): void;
    carryTo(world: THREE.Vector3): void;
    teleportTo(world: THREE.Vector3): void;
    getWorldPosition(out: THREE.Vector3): THREE.Vector3;
  };
  /** F was pressed this frame. */
  pressedF: () => boolean;
  /** True when the player may board right now (on foot, not in free-fly, not in a vehicle). */
  canBoard: () => boolean;
  /** Bottom-of-screen text ('' = hide) and a short message at the top. */
  prompt: (text: string) => void;
  toast: (text: string) => void;
  /** Called when the player gets on / off (the camera distance changes). */
  onRide: (riding: boolean) => void;
}

const name = (id: string): string => bn.rail.station[id] ?? id;
const secs = (s: number): string => bnNum(Math.max(0, Math.ceil(s)));

/**
 * The player as a train PASSENGER: on a platform next to a standing train press F to get on; the player then sits in that car and moves with it
 * (no physics body while riding); when the train stands at a station press F to step out onto its platform (and walk down the stair).
 * A train only runs the way its timetable says (the player does not drive it); the next station is shown at the bottom of the screen.
 */
export class TrainRider {
  private train: Train | null = null;
  private car = 0;
  private cand: Boardable | null = null;
  private tmp = new THREE.Vector3();
  private pose: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
  private eta: number | null = null;
  private etaT = 0;

  constructor(private d: RiderDeps) {}

  get riding(): boolean {
    return this.train !== null;
  }

  /** The train and the car the player sits in (null when not riding): the passenger camera follows it. */
  get ride(): { train: Train; car: number } | null {
    return this.train ? { train: this.train, car: this.car } : null;
  }

  /** Once per frame, before the vehicle keys. Returns true when F belongs to the train (so the vehicles do not also use it) or the player is riding. */
  handleKeys(): boolean {
    if (this.train) {
      if (this.d.pressedF()) this.tryAlight();
      return true;
    }
    this.cand = null;
    if (this.d.canBoard()) {
      this.d.player.getWorldPosition(this.tmp);
      this.cand = findBoardable(this.d.trains.trains, this.tmp.x, this.tmp.y, this.tmp.z);
    }
    if (this.cand && this.d.pressedF()) {
      this.board(this.cand);
      return true;
    }
    return false;
  }

  /** Every frame after the trains moved: carry the player with the seat and write the prompt. */
  update(dt: number): void {
    const t = this.train;
    if (t) {
      t.carPose(pathIndex(t, this.car), this.pose);
      this.tmp.set(this.pose.x, this.pose.y + 1.6, this.pose.z);
      this.d.player.carryTo(this.tmp);
      this.etaT -= dt;
      if (this.etaT <= 0) {
        this.etaT = 0.5;
        this.eta = t.etaArrive();
      }
      if (t.state === 'dwell') {
        const here = t.station;
        const next = t.leg.toStation;
        this.d.prompt(canAlight(this.d.rail, this.d.trains.fleet, t) ? bn.trains.ride.alight(name(here), name(next), secs(t.dwell)) : bn.trains.ride.noExit(name(here)));
      } else {
        this.d.prompt(bn.trains.ride.onTrain(name(t.leg.toStation), this.eta === null ? null : secs(this.eta)));
      }
      return;
    }
    const c = this.cand;
    this.d.prompt(c ? bn.trains.ride.board(name(c.train.leg.toStation), c.train.held ? null : secs(c.train.dwell)) : '');
  }

  private board(c: Boardable): void {
    this.train = c.train;
    this.car = c.car;
    this.cand = null;
    this.eta = c.train.etaArrive();
    this.etaT = 0;
    this.d.player.setInVehicle(true);
    this.d.onRide(true);
    this.d.toast(bn.trains.ride.boarded(name(c.train.leg.toStation)));
  }

  private tryAlight(): void {
    const t = this.train;
    if (!t) return;
    if (t.state !== 'dwell') {
      this.d.toast(bn.trains.ride.moving);
      return;
    }
    const spot = alightSpot(this.d.rail, this.d.trains.fleet, this.d.groundAt, t, this.car);
    if (!spot) {
      this.d.toast(bn.trains.ride.noExit(name(t.station)));
      return;
    }
    const st = t.station;
    this.train = null;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp.set(spot.x, spot.y, spot.z));
    this.d.onRide(false);
    this.d.prompt('');
    this.d.toast(bn.trains.ride.left(name(st)));
  }

  dispose(): void {
    this.d.prompt('');
  }
}

