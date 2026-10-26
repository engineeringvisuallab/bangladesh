import * as THREE from 'three';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainPhysics } from '../terrain';
import type { HUD } from '../ui/HUD';
import type { VehicleHUD } from '../ui/VehicleHUD';
import type { SuprimHUD } from '../ui/SuprimHUD';
import type { Person } from '../people/Person';
import type { PeopleManager } from '../people';
import { rayVsPerson } from '../combat/Hit';
import type { VehicleFx } from './VehicleFx';
import type { TreeDestruction } from '../vegetation/TreeDestruction';
import { TANK } from './VehicleSpec';
import { Vehicle, type DriveInput, type Driver, type VehicleDeps } from './Vehicle';
import type { VehicleSpec } from './VehicleSpec';
import { VehicleAudio } from './VehicleAudio';

export interface VehicleManagerDeps {
  vehicle: VehicleDeps;
  terrainPhysics: TerrainPhysics;
  input: InputManager;
  player: Player;
  orbit: OrbitCamera;
  hud: HUD;
  vehicleHud: VehicleHUD;
  /** Suprim cockpit panel (mode / speed / altitude / depth). */
  suprimHud?: SuprimHUD;
  /** Short on-screen messages (mode changes of the Suprim). */
  toast?: (text: string) => void;
  /** World position -> screen pixels (null if behind the camera). */
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
  /** The driver the player pulled out of his seat: where does he go now? */
  onDriverEjected: (person: Person, door: THREE.Vector3) => void;
}

/**
 * Owns all vehicles: spawning, freezing the ones far from the player (no ground collider there),
 * getting in/out (F), mapping the keyboard to driving input, and the driving HUD.
 * STAGE 9: a vehicle never exists without a driver. `spawn` needs one; the player getting in throws the AI driver
 * out (he steps out of the right-hand door and runs away); when the player gets out, the empty car is removed by
 * TrafficManager once he has walked off. AI cars use the same Vehicle class with an AIDriver's DriveInput.
 */
export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  driver: Vehicle | null = null;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private drive: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
  private coastInput: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false };
  private people: PeopleManager | null = null;
  private trees: TreeDestruction | null = null;
  private byHandle = new Map<number, Vehicle>();
  private tank: Vehicle | null = null;
  private tankHome: { x: number; z: number; yaw: number } | null = null;
  private tankRespawn = 0;
  /** The parked fleet at the start (one of every kind): a driverless copy stands at each home; a new one comes back when it was wrecked or driven far away. */
  private parked: { spec: VehicleSpec; x: number; z: number; yaw: number; body?: number; v: Vehicle | null; respawn: number }[] = [];
  private tmp3 = new THREE.Vector3();
  private tmp4 = new THREE.Vector3();

  /** Engine / tyre / horn / door sounds of every vehicle. */
  private audio = new VehicleAudio();

  constructor(private d: VehicleManagerDeps) {}

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /** Explosions / debris / smoke (the Engine hands them over after creating them). */
  setFx(fx: VehicleFx): void {
    this.d.vehicle.fx = fx;
  }

  /** Called whenever any vehicle has a crash (net velocity change dv m/s, speed before the crash): the Gold economy uses it for traffic accidents. */
  setCrashHook(fn: VehicleDeps['onCrash']): void {
    this.d.vehicle.onCrash = fn;
  }

  /** People are needed for run-overs and for throwing the occupants out of a wrecked vehicle. */
  setPeople(p: PeopleManager): void {
    this.people = p;
  }

  /** The tank flattens the trees in its way. */
  setTrees(t: TreeDestruction): void {
    this.trees = t;
  }

  /** The vehicle a Rapier collider belongs to (for bullets). */
  byCollider(handle: number): Vehicle | null {
    return this.byHandle.get(handle) ?? null;
  }

  /** The war tank: parked at `x, z`; when it is destroyed a new one appears there after a while. */
  setTankHome(x: number, z: number, yaw: number): void {
    this.tankHome = { x, z, yaw };
    this.tankRespawn = 0.5;
  }

  /** One parked, driverless copy of each given vehicle (the start area). The player gets in with F like in the tank. */
  setParked(list: { spec: VehicleSpec; x: number; z: number; yaw: number; body?: number }[]): void {
    this.parked = list.map((p) => ({ ...p, v: null, respawn: 0.5 }));
  }

  private keepParked(dt: number, focus: THREE.Vector3): void {
    for (const p of this.parked) {
      if (p.v && !this.vehicles.includes(p.v)) p.v = null;
      if (p.v) {
        const w = p.v;
        if (w !== this.driver && w.state === 'wrecked' && w.wreckedFor > 25) {
          const i = this.vehicles.indexOf(w);
          this.vehicles.splice(i, 1);
          this.byHandle.delete(w.collider.handle);
          w.dispose();
          p.v = null;
          p.respawn = 12;
        } else if (w !== this.driver && Math.hypot(w.getWorldPosition(this.tmp4).x - p.x, this.tmp4.z - p.z) > 150) {
          w.persistent = false; // someone drove it away: it becomes an ordinary car (traffic clears it) and a fresh copy waits at home
          p.v = null;
          p.respawn = 1;
        } else continue;
      }
      p.respawn -= dt;
      if (p.respawn > 0 || Math.hypot(focus.x - p.x, focus.z - p.z) < 6) continue;
      const y = this.d.vehicle.terrain.heightAt(p.x, p.z) + 1.4;
      const spec = p.body === undefined ? p.spec : { ...p.spec, look: { ...p.spec.look, body: p.body } };
      const v = new Vehicle(this.d.vehicle, spec, this.tmp3.set(p.x, y, p.z), p.yaw);
      v.persistent = true;
      this.vehicles.push(v);
      this.byHandle.set(v.collider.handle, v);
      p.v = v;
    }
  }

  /** Vehicles brought by the N menu (oldest first): only the last few are kept, so summoning does not pile up cars for ever. */
  private summoned: Vehicle[] = [];

  /** The N menu: a driverless copy of `spec` stands at (x, z), nose along `yaw`. The player gets in with F, like at the start fleet. */
  /**
   * Height of the surface to put a called vehicle on. The terrain height is wrong on an elevated road (expressway, bridge): the car
   * would appear under the deck. So when the caller stands above the ground, look for a solid surface at about his own height.
   */
  deckHeight(x: number, z: number, footY: number): number | null {
    const phys = this.d.vehicle.physics;
    const R = phys.RAPIER;
    const o = this.d.vehicle.origin.origin;
    const ray = new R.Ray({ x: x - o.x, y: footY + 2, z: z - o.z }, { x: 0, y: -1, z: 0 });
    const hit = phys.world.castRay(ray, 6, true, R.QueryFilterFlags.EXCLUDE_SENSORS);
    if (!hit) return null;
    const y = footY + 2 - hit.timeOfImpact;
    return y >= footY - 1.5 && y <= footY + 0.4 ? y : null;
  }

  summon(spec: VehicleSpec, x: number, z: number, yaw: number, deckY?: number): Vehicle {
    const y = Math.max(this.d.vehicle.terrain.heightAt(x, z), deckY ?? -Infinity) + 1.4;
    const v = new Vehicle(this.d.vehicle, spec, this.tmp3.set(x, y, z), yaw);
    v.persistent = true; // traffic must not clear it while the player is away
    this.vehicles.push(v);
    this.byHandle.set(v.collider.handle, v);
    this.summoned = this.summoned.filter((s) => this.vehicles.includes(s));
    this.summoned.push(v);
    while (this.summoned.length > 6) {
      const old = this.summoned.shift()!;
      if (old !== this.driver && !old.occupied) this.remove(old);
    }
    return v;
  }

  /** Create a vehicle WITH its driver (no empty vehicles). `body` overrides the paint colour. */
  spawn(spec: VehicleSpec, world: THREE.Vector3, yaw: number, driver: Driver, body?: number): Vehicle {
    const s = body === undefined ? spec : { ...spec, look: { ...spec.look, body } };
    const v = new Vehicle(this.d.vehicle, s, world, yaw);
    v.seatDriver(driver);
    this.vehicles.push(v);
    this.byHandle.set(v.collider.handle, v);
    return v;
  }

  /** Remove a vehicle from the world; returns the driver who was in it (the caller removes him too). */
  remove(v: Vehicle): Driver | null {
    const i = this.vehicles.indexOf(v);
    if (i < 0 || v === this.driver) return null;
    const who = v.removeDriver();
    this.vehicles.splice(i, 1);
    this.byHandle.delete(v.collider.handle);
    v.dispose();
    return who;
  }

  /** 60 Hz, before the physics step. */
  fixedUpdate(dt: number): void {
    const k = (c: string) => this.d.input.isDown(c);
    this.drive.throttle = k('KeyW');
    this.drive.brake = k('KeyS');
    this.drive.steer = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0);
    this.drive.handbrake = k('Space');
    // Suprim extras: Space = up (flight) / shallower (dive), X = deeper, Shift = boost, Ctrl = slow down
    this.drive.up = this.drive.handbrake;
    this.drive.down = k('KeyX');
    this.drive.boost = k('ShiftLeft') || k('ShiftRight');
    this.drive.slow = k('ControlLeft') || k('ControlRight');
    for (const v of this.vehicles) v.fixedUpdate(dt, v.tourInput ?? (v === this.driver ? this.drive : v.ai ? v.ai.input : v.coast ? this.coastInput : null));
  }

  afterStep(): void {
    for (const v of this.vehicles) v.afterStep();
  }

  /** Key presses (once per frame). */
  handleKeys(): void {
    const inp = this.d.input;
    if (inp.wasPressed('KeyF')) {
      if (this.driver) this.exit();
      else {
        const near = this.nearest(4);
        // only a car that has (almost) stopped - the AI stops for you when you stand in front of it
        if (near && Math.abs(near.forwardSpeed) < 2.5 && !this.boarding) {
          if (near.hasDoor()) {
            // the door swings open first, then you climb in and it shuts behind you
            near.openDoor(0.9);
            this.boarding = { v: near, t: 0.35 };
          } else this.enter(near);
        }
      }
    }
    const v = this.driver;
    if (!v) return;
    if (inp.wasPressed('KeyE')) v.powertrain.requestShift(1);
    if (inp.wasPressed('KeyQ')) v.powertrain.requestShift(-1);
    if (inp.wasPressed('KeyG')) v.powertrain.auto = !v.powertrain.auto;
    if (inp.wasPressed('KeyI')) this.d.vehicleHud.toggleCurve();
    if (inp.wasPressed('KeyR')) v.reset();
    if (v.spec.amphibious) {
      // Suprim: N flight mode on / off, C dive / surface, T float on the water
      const say = (msg: string | null) => { if (msg) this.d.toast?.(msg); };
      if (inp.wasPressed('KeyN')) say(v.toggleFlight());
      if (inp.wasPressed('KeyC')) say(v.toggleDive());
      if (inp.wasPressed('KeyT')) say(v.requestFloat());
    }
  }

  /** A car whose door is swinging open before the player gets in (`t` = seconds left). */
  private boarding: { v: Vehicle; t: number } | null = null;

  /** Every frame. `focus` = world position of the camera/player (decides which vehicles are simulated). */
  update(alpha: number, focus: THREE.Vector3, dt = 1 / 60): void {
    if (this.boarding) {
      this.boarding.t -= dt;
      if (this.boarding.t <= 0) {
        const v = this.boarding.v;
        this.boarding = null;
        if (!this.driver && this.vehicles.includes(v) && v.state !== 'wrecked' && Math.abs(v.forwardSpeed) < 2.5) this.enter(v);
      }
    }
    this.keepTank(dt, focus);
    this.keepParked(dt, focus);
    for (const v of [...this.vehicles]) {
      if (v.enabled) {
        v.tick(dt);
        this.handleEvents(v);
        this.runOver(v);
        if (v.spec.look.kind === 'tank' && v.state !== 'wrecked') this.crushTrees(v);
      } else v.tickOffline(dt); // far away: fire and wreck timers keep running
    }
    for (const v of this.vehicles) {
      v.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      const near = dist < PhysicsConfig.activeRadius * 0.9 && this.d.terrainPhysics.hasColliderAt(this.tmp.x, this.tmp.z);
      if (v.occupied || near) v.setEnabled(true);
      else if (dist > PhysicsConfig.activeRadius * 1.1) v.setEnabled(false);
      v.update(alpha);
    }
    this.audio.update(dt, this.vehicles, this.driver, focus, this.d.project, this.d.input.isDown('KeyH')); // H = horn / bell

    const hud = this.d.hud;
    if (this.driver) {
      hud.hideMarker();
      if (this.driver.spec.amphibious) {
        this.d.suprimHud?.update(this.driver.telemetry());
        if (this.driver.modeMsg) {
          this.d.toast?.(this.driver.modeMsg);
          this.driver.modeMsg = null;
        }
      } else this.d.vehicleHud.update(this.driver.telemetry(), this.driver.spec);
    } else {
      // an icon over the vehicle you can get into (no text)
      const near = this.d.player.active && this.d.player.ready && !this.d.player.inVehicle ? this.nearest(4) : null;
      if (near) {
        near.getWorldPosition(this.tmp);
        this.tmp.y += 2.4;
        hud.setMarker(this.d.project(this.tmp), 'car');
      } else hud.hideMarker();
    }
  }

  nearest(maxDist: number): Vehicle | null {
    this.d.player.getWorldPosition(this.tmp2);
    let best: Vehicle | null = null;
    let bd = maxDist;
    for (const v of this.vehicles) {
      if (v.policeVehicle || v.state === 'wrecked') continue;
      v.getWorldPosition(this.tmp);
      const dd = Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      if (dd < bd) {
        bd = dd;
        best = v;
      }
    }
    return best;
  }

  private enter(v: Vehicle): void {
    // the AI driver is pulled out of the right-hand door
    const old = v.removeDriver();
    if (old && old !== 'player') {
      v.doorPosition(this.tmp);
      this.tmp.y = this.d.vehicle.terrain.heightAt(this.tmp.x, this.tmp.z);
      this.d.player.getWorldPosition(this.tmp2);
      old.heading = Math.atan2(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      this.d.onDriverEjected(old, this.tmp);
    }
    for (const p of v.removePassengers()) {
      // everybody else gets out of the way too
      this.tmp.set(this.tmp.x + (Math.random() - 0.5) * 2.5, this.tmp.y, this.tmp.z + (Math.random() - 0.5) * 2.5);
      p.heading = Math.random() * Math.PI * 2;
      this.d.onDriverEjected(p, this.tmp);
    }
    v.seatDriver('player');
    v.ai = null;
    v.coast = false;
    this.driver = v;
    v.occupied = true;
    v.setEnabled(true);
    this.d.player.setInVehicle(true);
    const cam = v.spec.camera ?? { dist: 9, min: 5, max: 28 };
    this.d.orbit.setTarget(v, cam.dist, cam.min, cam.max);
    if (v.spec.amphibious) this.d.suprimHud?.show();
    else this.d.vehicleHud.show();
  }

  private exit(): void {
    const v = this.driver!;
    if (v.mode === 'fly' || v.mode === 'land' || v.mode === 'dive') {
      this.d.toast?.(v.mode === 'dive' ? '🌊 আগে পানির ওপরে উঠুন (C)' : '🛬 আগে নামুন (N)');
      return;
    }
    if (Math.abs(v.telemetry().speed) > 3) return; // can only get out when (almost) stopped
    v.openDoor(1.1); // the door swings open and shuts again behind the player
    v.doorPosition(this.tmp);
    const ground = this.d.vehicle.terrain.heightAt(this.tmp.x, this.tmp.z);
    this.tmp.y = ground + Config.player.height / 2 + 0.3;
    this.driver = null;
    v.removeDriver(); // the player steps out; the empty car is removed soon after (TrafficManager)
    v.abandonedFor = 0;
    v.occupied = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp);
    this.d.orbit.setTarget(this.d.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
    this.d.vehicleHud.hide();
    this.d.suprimHud?.hide();
  }


  // ------------------------------------------------------------------ damage, people, tank
  /** Throw the player out of a vehicle that blew up / fell over (he cannot die). */
  private forceExit(v: Vehicle): void {
    if (this.driver !== v) return;
    v.doorPosition(this.tmp);
    const ground = this.d.vehicle.terrain.heightAt(this.tmp.x, this.tmp.z);
    this.tmp.y = ground + Config.player.height / 2 + 0.3;
    this.driver = null;
    v.removeDriver();
    v.abandonedFor = 0;
    v.occupied = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp);
    this.d.orbit.setTarget(this.d.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
    this.d.vehicleHud.hide();
    this.d.suprimHud?.hide();
  }

  /** Take somebody out of a vehicle and put him on the ground (dead or running). Returns false if he was not inside. */
  private eject(v: Vehicle, p: Person, dead: boolean, byPlayer: boolean, head = false): void {
    const people = this.people;
    if (!people) return;
    v.seatWorld(p, this.tmp4);
    const pos = this.tmp4.clone();
    pos.y = Math.max(this.d.vehicle.terrain.heightAt(pos.x, pos.z), pos.y - 0.6);
    if (v.driver === p) {
      v.removeDriver();
      v.markDriverGone();
    } else v.removePassenger(p);
    p.heading = Math.random() * Math.PI * 2;
    people.adopt(p, pos, 'flee');
    if (dead) people.damage(p, 9999, head, byPlayer);
  }

  /** A bullet reached somebody inside a vehicle (or on a bike). */
  shootOccupant(v: Vehicle, p: Person, damage: number, head: boolean): void {
    if (!this.people) return;
    const dmg = damage * (head ? 3 : 1);
    if (p.health - dmg <= 0) this.eject(v, p, true, true, head);
    else {
      p.health -= dmg;
      if (v.driver === p) this.eject(v, p, false, true);
    }
  }

  /**
   * Ray (floating-origin LOCAL, unit direction) against the people sitting in vehicles. Riders of open vehicles (bike,
   * rickshaw, auto) can be hit from anywhere; people in an enclosed vehicle only through the glass part of the body of
   * the vehicle the ray just hit (`entered`). The tank is armoured.
   */
  rayOccupant(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, entered: Vehicle | null): { vehicle: Vehicle; person: Person; t: number; head: boolean } | null {
    let best: { vehicle: Vehicle; person: Person; t: number; head: boolean } | null = null;
    for (const v of this.vehicles) {
      if (!v.enabled || v.spec.look.kind === 'tank') continue;
      const people = v.occupants();
      if (!people.length) continue;
      if (v.spec.enclosed && v !== entered) continue;
      v.model.root.updateMatrixWorld(true);
      for (const p of people) {
        p.model.root.getWorldPosition(this.tmp3);
        const h = rayVsPerson(ox, oy, oz, dx, dy, dz, this.tmp3.x, this.tmp3.y - 0.45, this.tmp3.z, 1.4, 0.4, 0.78, best ? best.t : maxT);
        if (!h) continue;
        if (v.spec.enclosed) {
          v.model.root.getWorldPosition(this.tmp4);
          if (oy + dy * h.t < this.tmp4.y + (v.spec.windowY ?? 0.25)) continue; // the bullet hit the metal below the windows
        }
        if (!best || h.t < best.t) best = { vehicle: v, person: p, t: h.t, head: h.head };
      }
    }
    return best;
  }

  private handleEvents(v: Vehicle): void {
    while (v.events.length) {
      const ev = v.events.shift()!;
      if (ev.type === 'explode') {
        v.physWorld(this.tmp3);
        const fx = this.d.vehicle.fx;
        for (const p of v.occupants()) this.eject(v, p, true, ev.byPlayer);
        if (v.driver === 'player') this.forceExit(v);
        fx?.explode(this.tmp3, Math.max(4.5, v.spec.half.z * 1.5), v.spec.mass > 5000 ? 110 : 70, ev.byPlayer, v);
      } else if (ev.type === 'totaled') {
        // write-off without an explosion (crash fire): everybody climbs out alive
        if (v.driver === 'player') this.forceExit(v);
        for (const p of v.occupants()) this.eject(v, p, false, false);
        v.ai = null;
      } else if (ev.type === 'fall') {
        if (v.driver === 'player') this.forceExit(v);
        for (const p of v.occupants()) this.eject(v, p, ev.lethal, false);
        v.ai = null;
      }
    }
  }

  /** A tank drives straight through forests: the trees in front of and beside the hull fall (their colliders go first, so it is not stopped). */
  private crushTrees(v: Vehicle): void {
    if (!this.trees) return;
    v.physWorld(this.tmp3);
    v.forwardVector(this.tmp4);
    const l = Math.hypot(this.tmp4.x, this.tmp4.z) || 1;
    this.trees.destroyInBox(this.tmp3.x, this.tmp3.z, this.tmp4.x / l, this.tmp4.z / l, v.spec.half.z + 2.4, v.spec.half.x + 0.9);
  }

  /** The player's vehicle hit a person (civilian / police): who, did he die. Used by the Gold economy. */
  onPersonHit: ((p: Person, died: boolean) => void) | null = null;

  /** Vehicles run people over (the tank too). */
  private runOver(v: Vehicle): void {
    const people = this.people;
    if (!people || Math.abs(v.forwardSpeed) < 3 || v.state === 'wrecked') return;
    v.physWorld(this.tmp3);
    v.forwardVector(this.tmp4);
    const hl = Math.hypot(this.tmp4.x, this.tmp4.z) || 1;
    const fx = this.tmp4.x / hl;
    const fz = this.tmp4.z / hl;
    const s = v.spec;
    for (const p of [...people.onFoot]) {
      if (p.dead || Math.abs(p.world.y - this.tmp3.y) > 3) continue;
      const rx = p.world.x - this.tmp3.x;
      const rz = p.world.z - this.tmp3.z;
      const along = rx * fx + rz * fz;
      const lat = rx * fz - rz * fx;
      if (Math.abs(along) < s.half.z + 0.25 && Math.abs(lat) < s.half.x + 0.25) {
        const died = people.damage(p, Math.abs(v.forwardSpeed) * Math.sqrt(s.mass) * 0.12, false, v === this.driver);
        if (v === this.driver && p.role !== 'thug') this.onPersonHit?.(p, died);
      }
    }
  }

  /** The parked war tank: spawn it, and bring a new one when it was destroyed. */
  private keepTank(dt: number, focus: THREE.Vector3): void {
    if (!this.tankHome) return;
    const t = this.tank;
    if (t && !this.vehicles.includes(t)) this.tank = null;
    if (this.tank) {
      const w = this.tank;
      if (w.state === 'wrecked' && w.wreckedFor > 25 && w !== this.driver) {
        const i = this.vehicles.indexOf(w);
        this.vehicles.splice(i, 1);
        this.byHandle.delete(w.collider.handle);
        w.dispose();
        this.tank = null;
        this.tankRespawn = 12;
      }
      return;
    }
    this.tankRespawn -= dt;
    const h = this.tankHome;
    if (this.tankRespawn > 0 || Math.hypot(focus.x - h.x, focus.z - h.z) < 50) return;
    const y = this.d.vehicle.terrain.heightAt(h.x, h.z) + 1.4;
    const v = new Vehicle(this.d.vehicle, TANK, this.tmp3.set(h.x, y, h.z), h.yaw);
    v.persistent = true;
    this.vehicles.push(v);
    this.byHandle.set(v.collider.handle, v);
    this.tank = v;
  }

  /** The tank the player is driving (null otherwise). */
  get playerTank(): Vehicle | null {
    return this.driver && this.driver.spec.look.kind === 'tank' ? this.driver : null;
  }

  dispose(): void {
    for (const v of this.vehicles) v.dispose();
    this.vehicles.length = 0;
  }
}
