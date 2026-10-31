import * as THREE from 'three';
import type { InputManager } from '../input/InputManager';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import { Vehicle, type DriveInput, type VehicleDeps } from '../vehicles/Vehicle';
import { VehicleAudio } from '../vehicles/VehicleAudio';
import type { VehicleSpec } from '../vehicles/VehicleSpec';
import type { GroundPhysics } from '../world/GroundPhysics';

export interface DriveSystemDeps {
  vehicle: VehicleDeps;
  ground: GroundPhysics;
  input: InputManager;
  /** World position -> screen pixels (null if behind the camera). */
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
}

/**
 * Slim version of EVCity's VehicleManager: parked vehicles, getting in / out (F), keyboard -> DriveInput, freezing vehicles far from the
 * focus (no ground collider there). No people, police, HUD classes or tank logic yet.
 * There is no walking player: "you" are the fly camera; F near a vehicle gets in, F again gets out.
 */
export class DriveSystem {
  readonly vehicles: Vehicle[] = [];
  driver: Vehicle | null = null;
  /** Short message for the HUD (Suprim mode changes, hints). */
  message = '';
  private readonly drive: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
  private readonly audio = new VehicleAudio();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private readonly d: DriveSystemDeps) {}

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /** A driverless vehicle stands at scene (x, z), nose along `yaw` (0 = nose points south, PI = north). */
  spawnParked(spec: VehicleSpec, x: number, z: number, yaw: number): Vehicle {
    const y = this.d.vehicle.terrain.heightAt(x, z) + 1.4;
    const v = new Vehicle(this.d.vehicle, spec, this.tmp.set(x, y, z), yaw);
    v.persistent = true;
    this.vehicles.push(v);
    return v;
  }

  /** 60 Hz, before the physics step. */
  fixedUpdate(dt: number): void {
    const k = (c: string): boolean => this.d.input.isDown(c);
    this.drive.throttle = k('KeyW');
    this.drive.brake = k('KeyS');
    this.drive.steer = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0);
    this.drive.handbrake = k('Space');
    // Suprim extras: Space = up, X = deeper, Shift = boost, Ctrl = slow down
    this.drive.up = this.drive.handbrake;
    this.drive.down = k('KeyX');
    this.drive.boost = k('ShiftLeft') || k('ShiftRight');
    this.drive.slow = k('ControlLeft') || k('ControlRight');
    for (const v of this.vehicles) v.fixedUpdate(dt, v.tourInput ?? (v === this.driver ? this.drive : null));
  }

  afterStep(): void {
    for (const v of this.vehicles) v.afterStep();
  }

  /** Key presses, once per frame. `camPos` = where "you" stand (the fly camera) for getting in. */
  handleKeys(camPos: THREE.Vector3): void {
    const inp = this.d.input;
    if (inp.wasPressed('KeyF')) {
      if (this.driver) this.exit();
      else {
        const near = this.nearest(camPos, 7);
        if (near && Math.abs(near.forwardSpeed) < 2.5) this.enter(near);
        else this.message = 'no vehicle within 7 m';
      }
    }
    const v = this.driver;
    if (!v) return;
    if (inp.wasPressed('KeyE')) v.powertrain.requestShift(1);
    if (inp.wasPressed('KeyQ')) v.powertrain.requestShift(-1);
    if (inp.wasPressed('KeyG')) v.powertrain.auto = !v.powertrain.auto;
    if (inp.wasPressed('KeyR')) v.reset();
    if (v.spec.amphibious) {
      const say = (msg: string | null): void => {
        if (msg) this.message = msg;
      };
      if (inp.wasPressed('KeyN')) say(v.toggleFlight());
      if (inp.wasPressed('KeyC')) say(v.toggleDive());
      if (inp.wasPressed('KeyT')) say(v.requestFloat());
    }
  }

  /** Every frame. `focus` = scene position of the camera (decides which vehicles are simulated). */
  update(alpha: number, focus: THREE.Vector3, dt: number): void {
    if (this.driver && this.driver.state === 'wrecked') this.exit(true);
    for (const v of this.vehicles) {
      if (v.enabled) v.tick(dt);
      else v.tickOffline(dt);
      v.events.length = 0; // explode / fall events are for the (not yet ported) people & police systems
    }
    for (const v of this.vehicles) {
      v.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      const near = dist < PhysicsConfig.activeRadius * 0.9 && this.d.ground.hasColliderAt(this.tmp.x, this.tmp.z);
      if (v.occupied || near) v.setEnabled(true);
      else if (dist > PhysicsConfig.activeRadius * 1.1) v.setEnabled(false);
      v.update(alpha);
    }
    this.audio.update(dt, this.vehicles, this.driver, focus, this.d.project, this.d.input.isDown('KeyH')); // H = horn
  }

  /** The vehicle the camera just left (for placing the camera) is returned by exit(); this is for the HUD. */
  hudLine(): string {
    const v = this.driver;
    if (!v) return '';
    const t = v.telemetry();
    const gear = t.gear > 0 ? String(t.gear) : t.gear < 0 ? 'R' : 'N';
    return `${v.spec.id}   ${Math.abs(t.kmh).toFixed(0)} km/h   gear ${gear}${t.auto ? ' (auto)' : ''}   ${t.rpm.toFixed(0)} rpm`;
  }

  private nearest(p: THREE.Vector3, maxDist: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = maxDist;
    for (const v of this.vehicles) {
      if (v.state === 'wrecked') continue;
      v.getWorldPosition(this.tmp2);
      const dd = Math.hypot(this.tmp2.x - p.x, this.tmp2.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = v;
      }
    }
    return best;
  }

  private enter(v: Vehicle): void {
    v.removeDriver();
    v.seatDriver('player');
    v.ai = null;
    v.coast = false;
    this.driver = v;
    v.occupied = true;
    v.setEnabled(true);
    v.openDoor(0.9);
  }

  /** Leaves the vehicle; returns it (the caller puts the fly camera beside it) or null if you cannot get out now. */
  exit(force = false): Vehicle | null {
    const v = this.driver;
    if (!v) return null;
    if (!force && (v.mode !== 'drive' || Math.abs(v.telemetry().speed) > 3)) {
      this.message = 'stop first (or land / surface the Suprim)';
      return null;
    }
    v.openDoor(1.1);
    this.driver = null;
    v.removeDriver();
    v.occupied = false;
    this.lastExited = v;
    return v;
  }
  lastExited: Vehicle | null = null;

  dispose(): void {
    this.audio.dispose();
    for (const v of this.vehicles) v.dispose();
    this.vehicles.length = 0;
  }
}
