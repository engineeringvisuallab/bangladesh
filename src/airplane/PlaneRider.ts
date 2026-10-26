import * as THREE from 'three';
import { bn, bnNum } from '../i18n';
import type { AirplaneManager } from './AirplaneManager';

/** What the rider needs from the game (kept small so the class has no dependency on the Engine). */
export interface PlaneRiderDeps {
  planes: AirplaneManager;
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

const airportName = (id: string): string => bn.planes.airport[id] ?? id;
const secs = (s: number): string => bnNum(Math.max(0, Math.ceil(s)));

/**
 * The player as a PLANE PASSENGER: in front of the terminal of an airport where the shuttle airliner stands at its gate, press F to get on. The shuttle
 * taxis to the runway, takes off, flies to the other airport (old airport <-> sea airport), lands and taxis to the gate: press F to get off in front of
 * that terminal. While riding the player sits in the plane (no physics body) and the camera follows it. The player does not fly the plane.
 */
export class PlaneRider {
  private on = false;
  private cand: string | null = null;
  private tmp = new THREE.Vector3();

  constructor(private d: PlaneRiderDeps) {}

  get riding(): boolean {
    return this.on;
  }

  /** Once per frame, before the vehicle keys. Returns true when F belongs to the plane (so the vehicles do not also use it) or the player is riding. */
  handleKeys(): boolean {
    if (this.on) {
      if (this.d.pressedF()) this.tryAlight();
      return true;
    }
    this.cand = null;
    if (this.d.canBoard()) {
      this.d.player.getWorldPosition(this.tmp);
      const ap = this.d.planes.shuttleGateAt(this.tmp.x, this.tmp.z);
      if (ap) this.cand = ap.id;
    }
    if (this.cand && this.d.pressedF()) {
      this.board();
      return true;
    }
    return false;
  }

  /** Every frame after the planes moved: carry the player with the seat and write the prompt. */
  update(): void {
    const sh = this.d.planes.shuttle;
    if (this.on) {
      const p = sh.pose;
      this.tmp.set(p.x, p.y + 3, p.z);
      this.d.player.carryTo(this.tmp);
      const to = airportName(sh.toId);
      if (sh.mode === 'parked') this.d.prompt(bn.planes.ride.atGate(airportName(sh.airportId), to, secs(sh.departIn)));
      else if (sh.mode === 'taxi-out') this.d.prompt(bn.planes.ride.taxi(to));
      else if (sh.mode === 'flight') this.d.prompt(bn.planes.ride.flying(to, sh.eta === null ? null : secs(sh.eta)));
      else this.d.prompt(bn.planes.ride.landedTaxi(airportName(sh.airportId)));
      return;
    }
    this.d.prompt(this.cand ? bn.planes.ride.board(airportName(sh.toId), secs(sh.departIn)) : '');
  }

  private board(): void {
    this.d.planes.board();
    this.on = true;
    this.cand = null;
    this.d.player.setInVehicle(true);
    this.d.onRide(true);
    this.d.toast(bn.planes.ride.boarded(airportName(this.d.planes.shuttle.toId)));
  }

  private tryAlight(): void {
    const at = airportName(this.d.planes.shuttle.airportId);
    const spot = this.d.planes.alight();
    if (!spot) {
      this.d.toast(bn.planes.ride.moving);
      return;
    }
    this.on = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp.set(spot.x, spot.y, spot.z));
    this.d.onRide(false);
    this.d.prompt('');
    this.d.toast(bn.planes.ride.left(at));
  }

  dispose(): void {
    this.d.prompt('');
  }
}
