import * as THREE from 'three';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainPhysics } from '../terrain';
import type { HUD } from '../ui/HUD';
import type { HelicopterHUD } from '../ui/HelicopterHUD';
import type { VehicleManager } from '../vehicles';
import { Helicopter, type FlightInput, type HelicopterDeps } from './Helicopter';
import { HelicopterAudio } from './HelicopterAudio';

export interface HelicopterManagerDeps {
  heli: HelicopterDeps;
  terrainPhysics: TerrainPhysics;
  input: InputManager;
  player: Player;
  orbit: OrbitCamera;
  hud: HUD;
  vehicles: VehicleManager;
  helicopterHud: HelicopterHUD;
  /** World position -> screen pixels (null if behind the camera). */
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
}

const ENTER_DIST = 6;

/**
 * Owns all helicopters: spawning, freezing parked ones that are far from the player, getting in/out (F),
 * the keyboard -> flight controls mapping, flight HUD and sound.
 * Keys while flying: H engine, Space up, C down, W/S pitch, A/D bank, Q/E yaw, Shift boost, X assist, R level.
 */
export class HelicopterManager {
  readonly helis: Helicopter[] = [];
  pilot: Helicopter | null = null;
  private audio = new HelicopterAudio();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private flight: FlightInput = { pitch: 0, roll: 0, yaw: 0, up: false, down: false, boost: false };
  private tourTargets = new Map<Helicopter, { target: THREE.Vector3; landingApproach: boolean }>();

  constructor(private d: HelicopterManagerDeps) {}

  spawn(world: THREE.Vector3, yaw: number): Helicopter {
    const h = new Helicopter(this.d.heli, world, yaw);
    this.helis.push(h);
    return h;
  }

  private summoned: Helicopter[] = [];

  /** The N menu: a parked helicopter at `world`. Only the last two are kept (the oldest unused one is removed). */
  summon(world: THREE.Vector3, yaw: number): Helicopter {
    const h = this.spawn(world, yaw);
    this.summoned = this.summoned.filter((s) => this.helis.includes(s));
    this.summoned.push(h);
    while (this.summoned.length > 2) {
      const old = this.summoned.shift()!;
      if (old === this.pilot) continue;
      this.tourTargets.delete(old);
      const i = this.helis.indexOf(old);
      if (i >= 0) { this.helis.splice(i, 1); old.dispose(); }
    }
    return h;
  }

  /** Police helicopters use the same stable autopilot but hold altitude instead of landing. */
  setPolicePursuitTarget(h: Helicopter, target: THREE.Vector3): void {
    h.policeAircraft = true;
    h.engineOn = true;
    h.assist = true;
    h.releaseAutopilot();
    h.setEnabled(true);
    this.tourTargets.set(h, { target: target.clone(), landingApproach: false });
  }

  /** Move the point a police helicopter flies to (in place: no allocation, no physics calls; the helicopter was set up by setPolicePursuitTarget). */
  movePolicePursuitTarget(h: Helicopter, x: number, y: number, z: number): void {
    const t = this.tourTargets.get(h);
    if (t) t.target.set(x, y, z);
  }

  clearTourTarget(h: Helicopter): void {
    this.tourTargets.delete(h);
  }

  removePolicePursuit(h: Helicopter): boolean {
    if (!h.policeAircraft || h === this.pilot) return false;
    this.tourTargets.delete(h);
    const i = this.helis.indexOf(h);
    if (i < 0) return false;
    this.helis.splice(i, 1);
    h.dispose();
    return true;
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /** 60 Hz, before the physics step. */
  fixedUpdate(dt: number): void {
    const k = (c: string) => this.d.input.isDown(c);
    const f = this.flight;
    f.pitch = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    f.roll = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    f.yaw = (k('KeyQ') ? 1 : 0) - (k('KeyE') ? 1 : 0);
    f.up = k('Space');
    f.down = k('KeyC');
    f.boost = k('ShiftLeft') || k('ShiftRight');
    for (const h of this.helis) {
      const autopilot = this.tourTargets.get(h);
      if (autopilot) h.tourFixedUpdate(dt, autopilot.target, autopilot.landingApproach);
      else h.fixedUpdate(dt, h === this.pilot ? f : null);
    }
  }

  afterStep(): void {
    for (const h of this.helis) h.afterStep();
  }

  /** Key presses (once per frame). Returns true if F was used here (so the car logic must ignore it). */
  handleKeys(): boolean {
    const inp = this.d.input;
    const pilot = this.pilot;
    if (pilot) {
      if (inp.wasPressed('KeyH')) pilot.engineOn = !pilot.engineOn;
      if (inp.wasPressed('KeyX')) pilot.assist = !pilot.assist;
      if (inp.wasPressed('KeyR')) pilot.reset();
      if (inp.wasPressed('KeyF')) {
        this.exit();
        return true;
      }
      return false;
    }
    if (inp.wasPressed('KeyF') && !this.d.vehicles.driver) {
      const near = this.nearest(ENTER_DIST);
      if (near && near.dist <= this.carDistance()) {
        this.enter(near.heli);
        return true;
      }
    }
    return false;
  }

  /** Every frame. `focus` = world position of the camera (decides which helicopters are simulated). */
  update(dt: number, alpha: number, focus: THREE.Vector3): void {
    for (const h of this.helis) {
      h.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      const near = dist < PhysicsConfig.activeRadius * 0.9 && this.d.terrainPhysics.hasColliderAt(this.tmp.x, this.tmp.z);
      if (h.occupied || near) h.setEnabled(true);
      else if (dist > PhysicsConfig.activeRadius * 1.1) h.setEnabled(false);
      h.update(alpha, dt);
    }

    const pilot = this.pilot;
    if (pilot) {
      this.d.hud.hideMarker();
      const tel = pilot.telemetry();
      this.d.helicopterHud.update(tel, dt);
      this.audio.update(tel.rpm, tel.collective, tel.speed);
    } else if (!this.d.vehicles.driver && this.d.player.active && this.d.player.ready && !this.d.player.inVehicle) {
      // an icon over the helicopter you can get into (no text); it wins over a car marker when it is the closer one
      const near = this.nearest(ENTER_DIST);
      if (near && near.dist <= this.carDistance()) {
        near.heli.getWorldPosition(this.tmp);
        this.tmp.y += 3.6;
        this.d.hud.setMarker(this.d.project(this.tmp), 'heli');
      }
    }
  }

  private carDistance(): number {
    const car = this.d.vehicles.nearest(4);
    if (!car) return Infinity;
    this.d.player.getWorldPosition(this.tmp2);
    car.getWorldPosition(this.tmp);
    return Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
  }

  private nearest(maxDist: number): { heli: Helicopter; dist: number } | null {
    this.d.player.getWorldPosition(this.tmp2);
    let best: { heli: Helicopter; dist: number } | null = null;
    let bd = maxDist;
    for (const h of this.helis) {
      h.getWorldPosition(this.tmp);
      const dd = Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      if (dd < bd && Math.abs(this.tmp.y - this.tmp2.y) < 5) {
        bd = dd;
        best = { heli: h, dist: dd };
      }
    }
    return best;
  }

  private enter(h: Helicopter): void {
    this.clearTourTarget(h);
    h.releaseAutopilot();
    this.pilot = h;
    h.occupied = true;
    h.setEnabled(true);
    h.engineOn = false;
    h.assist = true;
    this.d.player.setInVehicle(true);
    this.d.orbit.setTarget(h, 22, 8, 90);
    this.d.helicopterHud.show();
    this.audio.start();
  }

  private exit(): void {
    const h = this.pilot!;
    const t = h.telemetry();
    if (t.agl > 1.5 || t.speed > 3) return; // only when landed and stopped
    h.doorPosition(this.tmp);
    const ground = this.d.heli.terrain.heightAt(this.tmp.x, this.tmp.z);
    this.tmp.y = ground + Config.player.height / 2 + 0.3;
    this.pilot = null;
    h.occupied = false;
    h.engineOn = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp);
    this.d.orbit.setTarget(this.d.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
    this.d.helicopterHud.hide();
    this.audio.stop();
  }

  dispose(): void {
    this.audio.dispose();
    for (const h of this.helis) h.dispose();
    this.helis.length = 0;
  }
}
