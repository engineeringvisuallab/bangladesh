import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { OrbitTarget } from '../camera/OrbitCamera';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainGenerator } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { clamp } from '../utils/math';
import { Powertrain } from './Powertrain';
import { VehicleModel } from './VehicleModel';
import { BIKE_PILLION_POSE, BIKE_RIDER_POSE, ENGINEER_LOOK, PersonModel } from '../people/PersonModel';
import type { Person } from '../people/Person';
import type { AIDriver } from '../traffic/AIDriver';
import { groundY, SUPRIM_FLIGHT, wheelDefs, type VehicleSpec, type WheelDef } from './VehicleSpec';
import type { TerrainSample } from '../terrain/Lakes';
import { waveHeight, waveScale } from '../water/WaterWaves';
import type { VehicleFx } from './VehicleFx';
import { RailLock, type RailPoint } from './RailLock';
import type { RailNetwork } from '../rail/RailNetwork';

export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  /** -1 = steer right, +1 = steer left (Rapier: +X is the left side when facing +Z). */
  steer: number;
  handbrake: boolean;
  /** Optional analogue pedals (0..1) for AI drivers; the keyboard leaves them out (= full pedal). */
  throttleAmt?: number;
  brakeAmt?: number;
  /** Suprim only: Space (climb / shallower), X (deeper under water), Shift (boost), Ctrl (slow down). */
  up?: boolean;
  down?: boolean;
  boost?: boolean;
  slow?: boolean;
}

/**
 * Suprim: how it moves right now. drive = wheels on the road; fly = wings out, VTOL thrusters on (hovers, Space climbs);
 * land = flight mode is being switched off, it sinks to the ground / water; float = on the water surface; dive = submarine;
 * rail = locked on a railway track (drives along the rails, steered by them).
 */
const RAIL_LOCKS = new WeakMap<object, RailLock>();

export type VehicleMode = 'drive' | 'fly' | 'land' | 'float' | 'dive' | 'rail';

/** Who sits behind the wheel: a person, or the player himself. A vehicle never exists without one (see VehicleManager). */
export type Driver = Person | 'player';

export interface VehicleTelemetry {
  speed: number;
  kmh: number;
  rpm: number;
  redline: number;
  idle: number;
  gear: number;
  gearCount: number;
  auto: boolean;
  throttle: number;
  brake: number;
  steerAngle: number;
  torque: number;
  powerKw: number;
  wheelForce: number;
  slip: boolean;
  limiter: boolean;
  shifting: boolean;
  engineBraking: boolean;
  handbrake: boolean;
  wheelsOnGround: number;
  /** Suprim: current mode, height above the ground / water (m) and depth below the water surface (m). Other vehicles: 'drive', 0, 0. */
  mode: VehicleMode;
  altitude: number;
  depth: number;
}

/** Everything the sound system (VehicleAudio) needs from a vehicle. */
export interface VehicleAudioState {
  kind: string;
  /** Signed speed along the nose (m/s). */
  speed: number;
  /** Sideways speed (m/s): tyres slide when it is large. */
  lateral: number;
  throttle: number;
  brake: number;
  rpm: number;
  idle: number;
  redline: number;
  gear: number;
  shifting: boolean;
  limiter: boolean;
  handbrake: boolean;
  engineBraking: boolean;
  wheelsOnGround: number;
  wheelCount: number;
  hp: number;
  state: 'ok' | 'burning' | 'wrecked';
  /** 0 = natural ground, 1 = gravel, 2 = asphalt. */
  surface: number;
  /** Driver door opening, 0..1. */
  door: number;
  /** Somebody is driving (or an autopilot) and the vehicle is not a wreck. */
  engineOn: boolean;
  enclosed: boolean;
}

export interface VehicleDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
  /** Explosions / debris / smoke (set by the Engine after creation; vehicles work without it). */
  fx?: VehicleFx | null;
  /** A crash happened to `v`: the net velocity change `dv` (m/s) and the speed (m/s) it had before. Used by the Gold economy (traffic accidents). */
  onCrash?: ((v: Vehicle, dv: number, speed: number) => void) | null;
}

/** What happened to a vehicle; VehicleManager handles these (people, wanted level, ejecting the player). */
export type VehicleEvent =
  | { type: 'explode'; byPlayer: boolean }
  | { type: 'fall'; lethal: boolean }
  | { type: 'wreckKill'; byPlayer: boolean }
  /** The vehicle is a write-off (crash fire / burn-out) but did NOT blow up: everybody gets out alive. */
  | { type: 'totaled' };

/** A one-step velocity change (m/s) this big (6 g) opens a "crash window". Braking and bumps stay far below it. */
const CRASH_TRIGGER = 1.0;
/** The window closes after this many quiet seconds. Damage uses the NET velocity change of the whole crash, so solver pops and contact jitter do not count. */
const CRASH_WINDOW = 0.12;
/** Net delta-v (m/s) of a whole crash below which nothing is damaged (~32 km/h: a bumper tap, a parking bump, a kerb, pushing against a wall). */
const CRASH_DV = 9;
/** hp lost per m/s above CRASH_DV (before the vehicle's `fragile` factor): 10 m/s ~ 2 hp, 15 ~ 12, 22 ~ 26, 30 ~ 42, 40 ~ 62. */
const CRASH_DAMAGE = 2;
/** A crash alone never takes hp below this: the car is wrecked and smoking, but it does not blow up. */
const CRASH_HP_FLOOR = 15;
/** Delta-v above which a badly damaged car can catch fire from a leaking fuel line (it burns, it does not explode). */
const CRASH_FIRE_DV = 22;
const CRASH_FIRE_HP = 20;
/** Below this hp the engine / drivetrain is damaged and power falls off (limp mode). */
const LIMP_HP = 30;
/** hp fractions at which parts break off (stage 1..3). */
const STAGES = [0.55, 0.3, 0.12];
/** Real cars take many bullets: this multiplies every vehicle's `bulletsToKill`. */
const BULLET_TOUGHNESS = 3;
/** Chance that a vehicle shot to 0 hp (or a burning one) actually goes up in a blast. Usually it just burns out and everybody gets out. */
const SHOT_EXPLODE_CHANCE = 0.2;
/** Blast damage on vehicles is scaled by this (a car survives a nearby grenade, it does not survive a bomb). */
const BLAST_TOUGHNESS = 0.65;

const RHO = 1.2;
const ROLL_RES = 0.012;
/** Motorbike: the most sideways acceleration the rider asks of the tyres (in g). tan(lean) = a / g, so 0.7 g = 35 degrees of lean. */
const BIKE_MAX_LAT_G = 0.7;
/** Motorbike: the bike goes down when it leans further than this (rad, ~58 deg) or stands on its tail / nose. */
const BIKE_FALL_LEAN = 1.02;
/** Tyre grip multiplier per surface under the wheel (STAGE 6): natural ground (baseline), gravel shoulder, asphalt. */
const SURFACE_GRIP = [1.0, 1.0, 1.15] as const;
const UP = new THREE.Vector3(0, 1, 0);
/** Motorbike balance: the rider corrects a lean error with a roll rate of KV x error (time constant 0.1 s), at most this fast (rad/s). */
const BIKE_KV = 10;
const BIKE_MAX_ROLL_RATE = 5;

/**
 * A drivable vehicle: Rapier dynamic chassis + Rapier's raycast vehicle controller
 * (spring/damper suspension, tyre friction, brakes, steering). On top of that we model the
 * drivetrain (Powertrain: engine torque curve, clutch, gearbox, final drive) and add
 * aerodynamic drag and rolling resistance as forces.
 */
export class Vehicle implements OrbitTarget {
  readonly model: VehicleModel;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly powertrain: Powertrain;
  private controller: RAPIER.DynamicRayCastVehicleController;

  occupied = false;
  /** Marked law-enforcement vehicle controlled by PolicePursuitManager. */
  policeVehicle = false;
  /** Parked player-owned vehicle (the tank): traffic never removes it. */
  persistent = false;
  /** Passengers (not the driver). They are killed with the vehicle or when a bullet reaches them. */
  readonly passengers: Person[] = [];
  /** 100 = new, 0 = on fire and about to blow up. */
  hp = 100;
  state: 'ok' | 'burning' | 'wrecked' = 'ok';
  /** Seconds since the wreck blew up. */
  wreckedFor = 0;
  /** Two-wheeler that has fallen over (the balance controller is off). */
  fallen = false;
  /** No driver at the wheel any more: the vehicle coasts to a stop. */
  coast = false;
  /** Damage came from the player (a kill then counts as a crime). */
  lastHitByPlayer = false;
  readonly events: VehicleEvent[] = [];
  /** Tank: turret yaw (rel. to the hull) and barrel pitch (rad). */
  turretYaw = 0;
  turretPitch = 0;
  /** Non-null while an autopilot (police pursuit, farm crew) drives the vehicle instead of a player or normal traffic AI. */
  tourInput: DriveInput | null = null;
  /** Whoever is driving. null only for the few seconds after the player left a car (it is removed then). */
  driver: Driver | null = null;
  /** The brain of an AI-driven car (null when the player drives or when nobody does). */
  ai: AIDriver | null = null;
  /** Seconds since the player got out (the empty car disappears soon after). */
  abandonedFor = 0;
  private playerSeat: PersonModel | null = null;
  /** False while parked far from the player (no ground collider there): body is frozen. */
  enabled = false;

  private throttle = 0;
  private brake = 0;
  private steerAngle = 0;
  private handbrake = false;
  private wheelsOnGround = 0;
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private renderPos = new THREE.Vector3();
  private renderQuat = new THREE.Quaternion();
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private speed = 0;
  private prevLv = new THREE.Vector3();
  private hasPrevLv = false;
  private age = 0;
  private impactGrace = 0;
  private fuse = 0;
  /** A burning vehicle blows up when the fuse runs out only if the fire came from weapons / blasts. A crash fire just burns out. */
  private explosive = true;
  private inCrash = false;
  private crashT = 0;
  private crashQuiet = 0;
  private crashV0 = new THREE.Vector3();
  private crashSpeed = 0;
  private stageDone = 0;
  private smokeT = 0;
  private lostWheel: boolean[] = [];
  private defs: WheelDef[];
  /** Motorbike: the curvature (1/m) the rider is asking for, and a slow trim that makes the real curvature match it. */
  private bikeKappa = 0;
  /** Motorbike: lean angle of the last step (rad), used to share the tyre grip between braking and cornering. */
  private bikeRoll = 0;
  private bikeTrim = 0;
  private inertia = { x: 1, y: 1, z: 1 };
  private tmpV2 = new THREE.Vector3();

  // ---- Suprim: road / air / water modes (see amphibiousStep) ----
  mode: VehicleMode = 'drive';
  /** Height of the wheels above the ground (or the water surface) in m, and depth of the hull below the water surface in m. */
  agl = 0;
  depth = 0;
  /** Wings / thrusters animation, 0..1 (VehicleModel.setFlightPose). */
  wingAmt = 0;
  thrustAmt = 0;
  /** A message for the player about a mode change (VehicleManager shows it once and clears it). */
  modeMsg: string | null = null;
  private flightClock = 0;
  private diveTarget: number = SUPRIM_FLIGHT.subDepth;
  private surfacing = false;
  private yawRate = 0;
  private tiltP = 0;
  private tiltR = 0;
  private waterSc: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };
  private aheadSc: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };
  private eul = new THREE.Euler();
  /** Drone physics: attitude (tilt of the whole craft, rad, + = nose down) that follows the commanded acceleration with a motor lag. */
  private droneTilt = 0;
  private windT = Math.random() * 100;
  /** Rail mode: the point on the track (absolute world coordinates), which way the nose points along the track polyline (+1 / -1), speed along the polyline (m/s, signed). */
  private railPt: RailPoint = { track: 0, i: 0, t: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, dist: 0 };
  private railTmp: RailPoint = { track: 0, i: 0, t: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, dist: 0 };
  private railFace = 1;
  private railV = 0;
  private railOff = { x: 0, y: 0, z: 0 };
  private railSteerHold = 0;
  private railCool = 0;
  private railSpin = 0;
  private railYaw = 0;

  constructor(
    private d: VehicleDeps,
    readonly spec: VehicleSpec,
    spawnWorld: THREE.Vector3,
    yaw: number,
  ) {
    const R = d.physics.RAPIER;
    const s = spec;
    const local = d.origin.toLocal(spawnWorld);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);

    this.body = d.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(local.x, local.y, local.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.02)
        .setAngularDamping(0.5)
        .setCanSleep(false)
        .setCcdEnabled(true), // fast vehicles must not tunnel through walls
    );
    // Collider has no density of its own: mass and centre of mass are set explicitly (low COM = stable car).
    this.collider = d.physics.world.createCollider(
      R.ColliderDesc.cuboid(s.half.x, s.half.y, s.half.z).setTranslation(0, s.colliderY ?? 0, 0).setDensity(0).setFriction(0.4).setRestitution(0.05),
      this.body,
    );
    this.defs = wheelDefs(s);
    const ex = s.half.x * 2;
    const ey = s.half.y * 2;
    const ez = s.half.z * 2;
    this.inertia = {
      x: (s.mass / 12) * (ey * ey + ez * ez),
      y: (s.mass / 12) * (ex * ex + ez * ez),
      z: (s.mass / 12) * (ex * ex + ey * ey),
    };
    this.body.setAdditionalMassProperties(
      s.mass,
      { x: 0, y: s.comY, z: s.comZ ?? 0 },
      this.inertia,
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    this.controller = d.physics.world.createVehicleController(this.body);
    for (const w of this.defs) {
      this.controller.addWheel({ x: w.x, y: s.connY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.susp.rest, s.wheelRadius);
    }
    this.lostWheel = this.defs.map(() => false);
    this.wheelSurface = this.defs.map(() => 0);
    for (let i = 0; i < this.defs.length; i++) {
      this.controller.setWheelSuspensionStiffness(i, s.susp.stiffness);
      this.controller.setWheelSuspensionCompression(i, s.susp.compression);
      this.controller.setWheelSuspensionRelaxation(i, s.susp.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, s.susp.travel);
      this.controller.setWheelMaxSuspensionForce(i, 1e6);
      this.controller.setWheelFrictionSlip(i, s.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, s.sideFriction);
    }

    this.powertrain = new Powertrain(s);
    this.model = new VehicleModel(s);
    d.scene.add(this.model.root);

    this.prevPos.copy(local);
    this.currPos.copy(local);
    this.prevQuat.copy(q);
    this.currQuat.copy(q);
    this.syncModel(1);
    this.body.setEnabled(false); // enabled by VehicleManager once the ground under it has loaded

    d.bus.on('origin:shift', ({ dx, dz }) => {
      for (const v of [this.prevPos, this.currPos, this.renderPos]) {
        v.x -= dx;
        v.z -= dz;
      }
      this.model.root.position.x -= dx;
      this.model.root.position.z -= dz;
    });
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.body.setEnabled(on);
    if (on) {
      const t = this.body.translation();
      this.prevPos.set(t.x, t.y, t.z);
      this.currPos.copy(this.prevPos);
    }
  }

  // ---- OrbitTarget ----
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderPos.x, this.renderPos.y + 1.3, this.renderPos.z);
  }

  /** Camera yaw that puts the camera behind the car (only while driving fast enough to matter). */
  followYaw(): number | null {
    if (Math.abs(this.speed) < 2.5) return null;
    this.forwardVector(this.fwd);
    return Math.atan2(-this.fwd.x, -this.fwd.z);
  }

  forwardVector(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    return out.set(0, 0, 1).applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
  }
  private tmpQ = new THREE.Quaternion();

  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.d.origin.toWorld(this.renderPos, out);
  }

  /** World position next to the driver's door (RIGHT side: right-hand drive) for getting out. */
  doorPosition(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    const left = this.tmp.set(1, 0, 0).applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
    const t = this.body.translation();
    const o = this.spec.half.x + 1.0;
    return this.d.origin.toWorld(out.set(t.x - left.x * o, t.y, t.z - left.z * o), out);
  }

  /** Physics position in WORLD coordinates (not the interpolated render position). */
  physWorld(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x + this.d.origin.origin.x, t.y, t.z + this.d.origin.origin.z);
  }

  /** Signed speed along the car's nose (m/s) as of the last physics step. */
  get forwardSpeed(): number {
    return this.speed;
  }

  /** World-up component of the car's up axis: 1 = upright, < 0 = on its roof. */
  get upY(): number {
    const r = this.body.rotation();
    return 1 - 2 * (r.x * r.x + r.z * r.z);
  }

  /** Linear velocity in WORLD axes (x, z), m/s. */
  velocityXZ(out: { x: number; z: number }): void {
    const l = this.body.linvel();
    out.x = l.x;
    out.z = l.z;
  }

  private placeSeated(m: PersonModel): void {
    const s = this.spec.seat;
    m.root.removeFromParent();
    m.setSeated(true, this.spec.balance ? BIKE_RIDER_POSE : undefined);
    m.root.position.set(s.x, s.y, s.z);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(s.scale * m.look.scale);
    this.model.root.add(m.root);
  }

  /** The driver's eye (scene-local coordinates) and the orientation of the car (nose = +Z): the camera of the driver's-eye view (P). */
  driverEye(pos: THREE.Vector3, quat: THREE.Quaternion): boolean {
    const s = this.spec.seat;
    const root = this.model.root;
    root.updateWorldMatrix(true, false);
    // seated, the eyes are ~0.78 m above the hips (body scale 1 = 1.8 m) and a little in front of them
    const k = s.scale * ENGINEER_LOOK.scale;
    const lean = this.spec.balance ? BIKE_RIDER_POSE.lean : 0; // a tucked rider's head is ahead of his hips
    pos.set(s.x, s.y + 0.78 * k * Math.cos(lean), s.z + (0.06 + 0.78 * Math.sin(lean)) * k);
    root.localToWorld(pos);
    root.getWorldQuaternion(quat);
    return true;
  }

  private doorOpen = 0;
  private doorGoal = 0;
  private doorHold = 0;

  /** Show or hide the seated player (hidden in the driver's-eye view: the camera sits inside his head). */
  setPlayerVisible(on: boolean): void {
    if (this.playerSeat) this.playerSeat.root.visible = on;
  }

  /** Put a person (or the player) behind the wheel. */
  seatDriver(who: Driver): void {
    this.driver = who;
    this.abandonedFor = 0;
    if (who === 'player') {
      this.playerSeat = new PersonModel(ENGINEER_LOOK);
      this.placeSeated(this.playerSeat);
    } else {
      who.vehicle = this;
      who.task = 'driving';
      who.mode = 'idle';
      who.speed = 0;
      this.placeSeated(who.model);
    }
  }

  /** Take the driver out of the seat (the caller decides where he goes). */
  removeDriver(): Driver | null {
    const who = this.driver;
    this.driver = null;
    this.ai = null;
    if (who === 'player') {
      this.playerSeat?.root.removeFromParent();
      this.playerSeat = null;
    } else if (who) this.unseat(who);
    return who;
  }

  private unseat(who: Person): void {
    who.model.root.removeFromParent();
    who.model.setSeated(false);
    who.model.root.scale.setScalar(who.model.look.scale);
    who.vehicle = null;
  }

  /** Put a passenger on seat number `slot` (see spec.seats). Returns false if there is no such free seat. */
  seatPassenger(p: Person): boolean {
    const seats = this.spec.seats ?? [];
    if (this.passengers.length >= seats.length) return false;
    const st = seats[this.passengers.length];
    this.passengers.push(p);
    p.vehicle = this;
    p.task = 'driving';
    p.mode = 'idle';
    p.speed = 0;
    p.model.root.removeFromParent();
    p.model.setSeated(true, this.spec.balance ? BIKE_PILLION_POSE : undefined);
    p.model.root.position.set(st.x, st.y, st.z);
    p.model.root.rotation.set(0, 0, 0);
    p.model.root.scale.setScalar(st.scale * p.model.look.scale);
    this.model.root.add(p.model.root);
    return true;
  }

  /** Take one passenger out of his seat (the caller decides what happens to him). */
  removePassenger(p: Person): void {
    const i = this.passengers.indexOf(p);
    if (i < 0) return;
    this.passengers.splice(i, 1);
    this.unseat(p);
  }

  /** Take every passenger out (the seats close up behind them). */
  removePassengers(): Person[] {
    const out = [...this.passengers];
    for (const p of out) this.unseat(p);
    this.passengers.length = 0;
    return out;
  }

  /** Everybody inside: driver first. */
  occupants(): Person[] {
    const out: Person[] = [];
    if (this.driver && this.driver !== 'player') out.push(this.driver);
    for (const p of this.passengers) out.push(p);
    return out;
  }

  /** World position of a seated person (hips). */
  seatWorld(p: Person, out: THREE.Vector3): THREE.Vector3 {
    const m = p.model.root;
    this.model.root.updateMatrixWorld(true);
    m.getWorldPosition(out);
    return this.d.origin.toWorld(out, out);
  }

  /** What each wheel stands on: 0 = natural ground, 1 = gravel shoulder, 2 = asphalt (Stage 6 roads; grip differs). */
  private wheelSurface: number[] = [];

  /** Surface under the car (the worst wheel), for the HUD / sound later. */
  get surface(): number {
    return Math.min(...this.wheelSurface);
  }

  private updateSurfaces(): void {
    const t = this.body.translation();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;
    // horizontal forward / left axes of the car
    let fx = this.fwd.x;
    let fz = this.fwd.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    for (let i = 0; i < this.defs.length; i++) {
      const sx = this.defs[i].x;
      const sz = this.defs[i].z;
      const wx = t.x + ox + fz * sx + fx * sz;
      const wz = t.z + oz - fx * sx + fz * sz;
      const k = this.d.terrain.roads.surfaceAt(wx, wz); // 0 ground, 1 asphalt, 2 gravel
      this.wheelSurface[i] = k === 1 ? 2 : k === 2 ? 1 : 0;
    }
  }

  /** Put the car upright again (after a roll-over). */
  reset(): void {
    if (this.mode === 'rail') {
      this.leaveRail(0);
      return;
    }
    if (this.mode !== 'drive') {
      // Suprim in the air / on the water: stabilise = stop and level out
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.tiltP = 0;
      this.tiltR = 0;
      this.yawRate = 0;
      return;
    }
    const r = this.body.rotation();
    this.forwardVector(this.fwd);
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    void r;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const gy = this.d.terrain.heightAt(wx, wz);
    this.body.setTranslation({ x: t.x, y: gy + 1.4, z: t.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (this.state !== 'wrecked') this.fallen = false;
  }

  /** Called every fixed step BEFORE the physics world steps. */
  fixedUpdate(dt: number, input: DriveInput | null): void {
    if (!this.enabled) return;
    const s = this.spec;
    // Signed speed along the car's forward axis (+Z). (Rapier's own currentVehicleSpeed() uses another axis by default.)
    this.forwardVector(this.fwd);
    const lv = this.body.linvel();
    const v = lv.x * this.fwd.x + lv.y * this.fwd.y + lv.z * this.fwd.z;
    this.speed = v;
    const pt = this.powertrain;

    // ---- crash detection: the NET velocity change of a whole impact (~0.1 s), not single-step spikes ----
    this.age += dt;
    this.impactGrace = Math.max(0, this.impactGrace - dt);
    const armed = this.age > 1.5 && this.impactGrace <= 0 && this.state !== 'wrecked';
    if (this.hasPrevLv && armed) {
      const step = Math.hypot(lv.x - this.prevLv.x, lv.y - this.prevLv.y, lv.z - this.prevLv.z);
      if (step > CRASH_TRIGGER) {
        if (!this.inCrash) {
          this.inCrash = true;
          this.crashT = 0;
          this.crashV0.copy(this.prevLv);
        }
        this.crashQuiet = 0;
      }
    }
    if (this.inCrash) {
      this.crashT += dt;
      this.crashQuiet += dt;
      if (!armed) this.inCrash = false;
      else if (this.crashQuiet >= CRASH_WINDOW || this.crashT > 0.5) {
        this.inCrash = false;
        // in the air gravity changes vy during the window; that is not part of the crash (on the ground the road carries it)
        const g = this.wheelsOnGround === 0 ? PhysicsConfig.gravity * this.crashT : 0;
        const dv = Math.hypot(lv.x - this.crashV0.x, lv.y - this.crashV0.y - g, lv.z - this.crashV0.z);
        // a crash can not take away more speed than the vehicle had (x1.6 for the bounce back): a car that stands still against a wall
        // (spring / solver jitter while the driver keeps the throttle down) is not a crash and must not be damaged again and again
        const v0 = Math.hypot(this.crashV0.x, this.crashV0.y, this.crashV0.z);
        this.crashSpeed = v0;
        this.impact(Math.min(dv, 45, v0 * 1.6 + 0.5));
      }
    }
    this.prevLv.set(lv.x, lv.y, lv.z);
    this.hasPrevLv = true;

    // ---- Suprim: flying / floating / diving is not wheel physics ----
    if (s.amphibious) {
      if (this.state === 'wrecked' && this.mode !== 'drive') this.leaveAmphibious('drive');
      if (this.mode !== 'drive') {
        this.amphibiousStep(dt, input, lv);
        return;
      }
    }

    // ---- pedals: W = gas / S = brake or reverse (as in most games) ----
    let thrTarget = 0;
    let brkTarget = 0;
    const dead = this.state === 'wrecked';
    const inp = dead ? { throttle: false, brake: false, steer: 0, handbrake: true } : input ?? { throttle: false, brake: false, steer: 0, handbrake: true };
    if (this.coast && !dead) {
      // nobody at the wheel: no gas, a little braking, handbrake once (almost) stopped
      if (Math.abs(v) > 1.5) brkTarget = 0.25;
      inp.throttle = false;
      inp.brake = false;
      inp.steer = 0;
      inp.handbrake = Math.abs(v) < 1.5;
    } else if (inp.throttle && !inp.brake) {
      if (v < -1) brkTarget = 1;
      else {
        pt.selectDirection(1);
        thrTarget = inp.throttleAmt ?? 1;
      }
    } else if (inp.brake && !inp.throttle) {
      if (v > 1) brkTarget = inp.brakeAmt ?? 1;
      else {
        pt.selectDirection(-1);
        thrTarget = 1;
      }
    }
    if (pt.gear < 0 && v < -7) thrTarget = 0; // reverse speed limit (~25 km/h)
    if (s.amphibious && v > SUPRIM_FLIGHT.roadMax * 0.985) thrTarget = 0; // road speed limit: 500 km/h
    this.throttle += (thrTarget - this.throttle) * Math.min(1, 10 * dt);
    this.brake += (brkTarget - this.brake) * Math.min(1, 14 * dt);
    this.handbrake = inp.handbrake;

    // ---- powertrain ----
    pt.step(dt, this.throttle, v);

    // ---- steering: less lock at speed ----
    // The steering lock shrinks with speed, and never asks for more than ~1.6 g of cornering (tyre grip limit).
    const av = Math.abs(v);
    const skid = s.skid;
    let target = 0;
    if (s.balance) {
      target = this.bikeSteer(clamp(inp.steer, -1, 1), v, dt);
    } else if (!skid) {
      const gripCap = ((s.balance ? 0.75 : 1.9) * -PhysicsConfig.gravity * 2 * s.wheelbaseHalf) / (av * av + 1);
      // two-wheelers (balance) keep the old, careful values: a quick steering change makes the bike fall over
      const maxAngle = Math.max(s.balance ? 0.03 : 0.05, Math.min(s.maxSteer / (1 + Math.pow(av / (s.balance ? 16 : 24), 2)), gripCap));
      target = clamp(inp.steer, -1, 1) * maxAngle;
    }
    // keyboard steering is on / off: the wheels must follow within ~0.1 s, otherwise a tap on A / D turns the car only slowly
    const rate = s.balance ? (Math.abs(target) > Math.abs(this.steerAngle) ? 3.2 : 5.0) : Math.abs(target) > Math.abs(this.steerAngle) ? 6.0 : 7.0;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);

    // ---- apply to wheels ----
    // Rapier ignores the brake on a wheel that also has an engine force, so the drive is cut while braking
    // (like pressing the clutch). Without this, the brakes would do nothing on driven wheels.
    this.updateSurfaces();
    const braking = this.brake > 0.02 || this.handbrake || !input || dead;
    const nSide = this.defs.filter((w) => w.side === 1).length || 1;
    // damaged engine / drivetrain: power falls off below LIMP_HP (the car limps instead of driving like new)
    const health = this.hp >= LIMP_HP ? 1 : 0.4 + 0.6 * (this.hp / LIMP_HP);
    const skidSteer = skid ? clamp(inp.steer, -1, 1) / (1 + av / 7) : 0;
    for (let i = 0; i < this.defs.length; i++) {
      const w = this.defs[i];
      const lost = this.lostWheel[i];
      this.controller.setWheelFrictionSlip(i, s.frictionSlip * SURFACE_GRIP[this.wheelSurface[i]] * (lost ? 0.15 : 1));
      let force = braking || lost ? 0 : pt.wheelForce * w.drive * health;
      // a tracked vehicle turns by driving its two sides at different speeds (left turn: left side slower, right side faster)
      if (skid && !braking) force -= (skidSteer * w.side * skid.turnForce) / nSide;
      this.controller.setWheelEngineForce(i, force);
      // a bike brakes mostly with the front wheel (weight moves forward under braking)
      // ...but a leaned tyre has less grip left over for braking (friction circle): the harder the lean, the softer the brake
      const bias = s.balance ? (w.z > 0 ? 1.3 : 0.7) * (1 - 0.7 * clamp(Math.abs(this.bikeRoll) / 0.7, 0, 1)) : 1;
      let b = lost ? 0 : this.brake * s.brakeMax * bias;
      if (this.handbrake && w.z < 0 && w.drive > 0) b = s.brakeMax * 1.3;
      if (this.handbrake && skid) b = s.brakeMax;
      if (!input || dead) b = s.brakeMax; // parked: brakes on
      this.controller.setWheelBrake(i, b);
      this.controller.setWheelSteering(i, w.steer ? this.steerAngle : 0);
      // handbrake locks the rear: less side grip -> the tail slides
      this.controller.setWheelSideFrictionStiffness(i, this.handbrake && w.z < 0 && w.drive > 0 && !skid ? s.sideFriction * 0.35 : s.sideFriction);
    }

    // ---- aerodynamic drag + rolling resistance (forces on the chassis) ----
    const drag = 0.5 * RHO * s.cd * s.frontalArea * v * Math.abs(v) + ROLL_RES * s.mass * -PhysicsConfig.gravity * Math.sign(v) * (Math.abs(v) > 0.2 ? 1 : 0);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.body.addForce({ x: -this.fwd.x * drag, y: -this.fwd.y * drag, z: -this.fwd.z * drag }, true);
    if (s.downforce) this.body.addForce({ x: 0, y: -0.5 * RHO * s.downforce * v * v, z: 0 }, true); // aero downforce (supercar)
    if (s.amphibious && this.depth > 0.02) this.wadeForces(v); // driving into water: buoyancy + water drag
    if (skid && !braking && !dead) {
      // a little direct yaw torque on top of the track forces (the real thing grips the ground with its whole length)
      this.body.addTorque({ x: 0, y: skidSteer * skid.yawAssist, z: 0 }, true);
    }
    if (s.balance) this.balanceBike(v);

    this.controller.updateVehicle(dt);

    let n = 0;
    for (let i = 0; i < this.defs.length; i++) if (this.controller.wheelIsInContact(i)) n++;
    this.wheelsOnGround = n;

    if (s.amphibious) {
      this.checkWater();
      this.checkRail(dt, input);
    }

    // safety net: never end up far below the analytic ground
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const gy = this.d.terrain.heightAt(wx, wz);
    if (t.y < gy - 2) {
      this.body.setTranslation({ x: t.x, y: gy + 1.5, z: t.z }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  // ------------------------------------------------------------------ Suprim: fly / float / dive
  /** N: unfold the wings and start flying / switch flight mode off and land. Returns a refusal text, or null if accepted. */
  toggleFlight(): string | null {
    if (!this.spec.amphibious) return null;
    if (this.state !== 'ok') return '⚠️ গাড়ি নষ্ট — ফ্লাইট মোড চালু হবে না';
    switch (this.mode) {
      case 'rail':
        this.leaveRail(0);
        this.enterFlight();
        return null;
      case 'drive':
      case 'float':
        this.enterFlight();
        return null;
      case 'fly':
        this.mode = 'land';
        this.modeMsg = '🛬 অবতরণ শুরু… (N আবার চাপলে আবার ওড়া)';
        return null;
      case 'land':
        this.mode = 'fly';
        this.modeMsg = '🛫 আবার ফ্লাইট মোড';
        return null;
      default:
        return '🌊 আগে পানির ওপরে উঠুন (C), তারপর N';
    }
  }

  /** C: dive like a submarine / come back up. */
  toggleDive(): string | null {
    if (!this.spec.amphibious) return null;
    if (this.state !== 'ok') return '⚠️ গাড়ি নষ্ট — ডুব দেওয়া যাবে না';
    if (this.mode === 'dive') {
      this.surfacing = !this.surfacing;
      this.modeMsg = this.surfacing ? '⬆️ ভেসে উঠছে…' : '⬇️ আবার ডুব';
      return null;
    }
    if (this.mode === 'fly' || this.mode === 'land') return '🛬 ডুব দিতে আগে নামুন (N)';
    if (this.mode === 'rail') return '🚆 আগে রেললাইন ছাড়ুন (A / D ধরে রাখুন)';
    this.sampleWater();
    const deep = this.waterSc.water - this.waterSc.h;
    if (this.mode === 'drive' && !(this.depth > 0)) return '🌊 ডুব দিতে পানিতে নামুন';
    if (deep < SUPRIM_FLIGHT.diveDepth) return '🌊 পানি যথেষ্ট গভীর নয় — গভীর পানিতে যান';
    this.body.setGravityScale(0, true);
    this.mode = 'dive';
    this.surfacing = false;
    this.diveTarget = clamp(SUPRIM_FLIGHT.subDepth, SUPRIM_FLIGHT.subMin, Math.max(SUPRIM_FLIGHT.subMin, deep - SUPRIM_FLIGHT.floorGap - 1.2));
    this.modeMsg = '🌊 সাবমেরিন মোড — W A S D চলুন · Space ওপরে · X নিচে · C ভেসে ওঠা · T পানির ওপরে';
    return null;
  }

  /** T: come up and float on the water surface (works from the road when the car stands in deep water). */
  requestFloat(): string | null {
    if (!this.spec.amphibious) return null;
    if (this.mode === 'dive') {
      this.surfacing = true;
      this.modeMsg = '⬆️ পানির ওপরে উঠছে…';
      return null;
    }
    if (this.mode === 'drive') {
      this.sampleWater();
      if (this.depth > 0) {
        this.enterFloat();
        return null;
      }
      return '🌊 ভাসতে পানিতে নামুন';
    }
    return null;
  }

  private sampleWater(): void {
    const t = this.body.translation();
    const sc = this.waterSc;
    this.d.terrain.sample(t.x + this.d.origin.origin.x, t.z + this.d.origin.origin.z, sc);
    const wet = !Number.isNaN(sc.water) && sc.h < sc.water;
    this.depth = wet ? Math.max(0, sc.water - (t.y + groundY(this.spec))) : 0;
  }

  /** The water surface (with waves) at the hull centre, or NaN when there is no water. */
  private waterY(sc: TerrainSample, x: number, z: number): number {
    if (Number.isNaN(sc.water) || sc.h >= sc.water) return NaN;
    return sc.water + waveHeight(x, z, waveScale(sc.water, Math.hypot(sc.fx, sc.fz), Math.max(0, sc.water - sc.h)));
  }

  private enterFlight(): void {
    this.body.setGravityScale(0, true);
    this.mode = 'fly';
    this.flightClock = 0;
    this.yawRate = 0;
    this.modeMsg = '🚀 ফ্লাইট মোড চালু — ডানা খুলছে… Space চাপলে ওপরে ওঠা, তারপর W A S D';
  }

  private enterFloat(): void {
    this.body.setGravityScale(0, true);
    this.mode = 'float';
    this.surfacing = false;
    this.modeMsg = '🌊 পানিতে ভাসছে — W A S D চলুন · C ডুব · N ওড়া';
  }

  /** Back to the road (wheels take over) or to the water surface. */
  private leaveAmphibious(to: 'drive' | 'float'): void {
    const q = this.body.rotation();
    this.forwardVector(this.fwd);
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    void q;
    const up = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.body.setRotation({ x: up.x, y: up.y, z: up.z, w: up.w }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.tiltP = 0;
    this.tiltR = 0;
    this.yawRate = 0;
    this.surfacing = false;
    if (to === 'drive') {
      this.body.setGravityScale(1, true);
      this.mode = 'drive';
      this.thrustAmt = 0;
      this.impactGrace = 1.0; // the touch-down is not a crash
    } else this.enterFloat();
  }

  /** Drive mode: a deep ford / lake under the hull turns the car into a boat. */
  private checkWater(): void {
    if (this.mode !== 'drive' || this.state !== 'ok') return;
    this.sampleWater();
    if (this.depth >= SUPRIM_FLIGHT.floatDepth) {
      this.enterFloat();
      this.modeMsg = '🌊 পানি! স্বয়ংক্রিয়ভাবে ভাসছে — C ডুব · T ভাসা · N ওড়া';
    }
  }

  /** Distance (m) from the tyre bottoms down to the first solid thing below (road deck, bridge, roof, ground), Infinity if there is nothing within 80 m. */
  private probeBelow(): number {
    const R = this.d.physics.RAPIER;
    const t = this.body.translation();
    const ray = new R.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = this.d.physics.world.castRay(ray, 80, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, this.body);
    return hit ? hit.timeOfImpact + groundY(this.spec) : Infinity;
  }

  /** Driving into water (wheels still on the bottom): the water pushes the hull up (buoyancy) and slows it (drag). */
  private wadeForces(v: number): void {
    const F = SUPRIM_FLIGHT;
    const m = this.spec.mass;
    const g = -PhysicsConfig.gravity;
    const sub = clamp(this.depth / F.floatDepth, 0, 1);
    this.body.addForce({ x: 0, y: 0.85 * m * g * sub, z: 0 }, true); // buoyancy: up to 85 % of the weight
    const a = Math.min(25, sub * 0.35 * v * Math.abs(v)); // water drag (m/s^2), never harder than 2.5 g
    this.body.addForce({ x: -this.fwd.x * m * a * Math.sign(v), y: -this.fwd.y * m * a * Math.sign(v), z: -this.fwd.z * m * a * Math.sign(v) }, true);
  }

  // ------------------------------------------------------------------ Suprim: on the rails
  private railLockOf(): RailLock | null {
    const rail = (this.d.terrain as unknown as { rail?: RailNetwork }).rail;
    if (!rail) return null;
    let rl = RAIL_LOCKS.get(rail);
    if (!rl) {
      rl = new RailLock(rail);
      RAIL_LOCKS.set(rail, rl);
    }
    return rl;
  }

  /** Drive mode: wheels on a rail head, nose along the track -> lock on and drive along the rails. */
  private checkRail(dt: number, input: DriveInput | null): void {
    if (this.mode !== 'drive' || this.state !== 'ok' || !input || this.ai || this.coast) return;
    this.railCool = Math.max(0, this.railCool - dt);
    if (this.railCool > 0 || this.wheelsOnGround < 2) return;
    const lock = this.railLockOf();
    if (!lock) return;
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const p = this.railPt;
    if (!lock.nearest(wx, wz, SUPRIM_FLIGHT.railTol, p)) return;
    const feetY = t.y + groundY(this.spec);
    if (Math.abs(feetY - p.y) > 0.9) return; // under / over the track (bridge, tunnel), not on it
    this.forwardVector(this.fwd);
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const along = (this.fwd.x / fl) * p.tx + (this.fwd.z / fl) * p.tz;
    if (Math.abs(along) < 0.88) return; // more than ~28 degrees across the rails
    this.enterRail(along > 0 ? 1 : -1, wx, wz, feetY);
  }

  private enterRail(face: number, wx: number, wz: number, feetY: number): void {
    const p = this.railPt;
    const lv = this.body.linvel();
    this.mode = 'rail';
    this.railFace = face;
    this.railV = lv.x * p.tx + lv.z * p.tz;
    this.railOff.x = wx - p.x;
    this.railOff.z = wz - p.z;
    this.railOff.y = feetY - p.y;
    this.railSteerHold = 0;
    this.railCool = 0;
    this.forwardVector(this.fwd);
    this.railYaw = Math.atan2(this.fwd.x, this.fwd.z);
    this.body.setGravityScale(0, true);
    this.modeMsg = '🚆 রেললাইনে উঠেছে — W / S গতি · A বা D ধরে রাখুন = লাইন ছাড়া · N = ওড়া';
  }

  /** Back to the wheels. side: 0 = stay where you are, +1 / -1 = step off to the left / right of the track. */
  private leaveRail(side: number): void {
    if (this.mode !== 'rail') return;
    if (side !== 0) {
      const t = this.body.translation();
      const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
      const hx = this.fwd.x / fl;
      const hz = this.fwd.z / fl;
      const off = 3.4 * side;
      this.body.setTranslation({ x: t.x + hz * off, y: t.y + 0.15, z: t.z - hx * off }, true);
    }
    this.leaveAmphibious('drive');
    this.railCool = side !== 0 ? 4 : 1.5;
    this.railV = 0;
    this.railSteerHold = 0;
    if (side !== 0) this.modeMsg = '🚗 রেললাইন ছেড়েছে — সাধারণ ড্রাইভ মোড';
  }

  private railStep(dt: number, inp: DriveInput | null, _lv: { x: number; y: number; z: number }): void {
    const F = SUPRIM_FLIGHT;
    const body = this.body;
    const lock = this.railLockOf();
    const p = this.railPt;
    if (!lock) {
      this.leaveRail(0);
      return;
    }
    const t = body.translation();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;
    const drive = inp ? (inp.throttle && !inp.brake ? 1 : inp.brake && !inp.throttle ? -1 : 0) : 0;
    const boost = true; // full power all the time: no Shift needed
    const slow = !!inp?.slow;
    const steer = inp ? clamp(inp.steer, -1, 1) : 0;
    // A / D held for a moment: step off the rails
    if (Math.abs(steer) > 0.5) this.railSteerHold += dt;
    else this.railSteerHold = Math.max(0, this.railSteerHold - 2 * dt);
    this.forwardVector(this.fwd);
    if (this.railSteerHold > 0.4) {
      this.leaveRail(steer > 0 ? 1 : -1);
      return;
    }
    this.railCool = Math.max(0, this.railCool - dt);

    // ---- speed: 500 km/h limit and the curves (lateral acceleration limit), looked at far enough ahead to brake in time ----
    let vCar = this.railV * this.railFace;
    const topLim = F.roadMax * (slow ? F.slow : 1);
    const dirCar = vCar >= 0 ? this.railFace : -this.railFace;
    const look = Math.min(2000, (vCar * vCar) / (2 * F.railBrake) + 40);
    const rMin = lock.minRadiusAhead(p, dirCar, look);
    const vCurve = Number.isFinite(rMin) ? Math.sqrt(F.railLat * Math.max(rMin, 20)) : Infinity;
    const vLim = vCar >= 0 ? Math.min(topLim, vCurve) : 14;
    if (!inp) vCar -= Math.sign(vCar) * Math.min(Math.abs(vCar), 3 * dt); // nobody driving: rolls to a stop
    else if (drive > 0) vCar += F.railAccel * (boost ? 1.6 : 1) * Math.max(0.12, 1 - Math.max(0, vCar) / (F.roadMax * 1.05)) * dt;
    else if (drive < 0) vCar -= (vCar > 0.5 ? F.railBrake : F.railAccel * 0.6) * dt;
    else vCar -= Math.sign(vCar) * Math.min(Math.abs(vCar), (0.4 + 0.00012 * vCar * vCar) * dt);
    if (vCar > vLim) vCar = Math.max(vLim, vCar - F.railBrake * dt);
    vCar = clamp(vCar, -14, F.roadMax);
    this.railV = vCar * this.railFace;
    this.speed = vCar;
    this.railSpin += (vCar * dt) / this.spec.wheelRadius;

    // ---- move along the track; at the end of a track continue on the next one, or roll off ----
    const ds = this.railV * dt;
    if (!lock.advance(p, ds)) {
      const q = this.railTmp;
      let hopped = false;
      const fxc = p.tx * this.railFace;
      const fzc = p.tz * this.railFace;
      if (this.railCool <= 0 && lock.nearest(p.x, p.z, 3.2, q, p.track)) {
        const dot = q.tx * fxc + q.tz * fzc;
        if (Math.abs(dot) > 0.85) {
          hopped = true;
          this.railOff.x += p.x - q.x;
          this.railOff.y += p.y - q.y;
          this.railOff.z += p.z - q.z;
          Object.assign(p, q);
          this.railFace = dot > 0 ? 1 : -1;
          this.railV = vCar * this.railFace;
          this.railCool = 0.6;
        }
      }
      if (!hopped) {
        body.setLinvel({ x: fxc * vCar, y: 0, z: fzc * vCar }, true);
        this.leaveRail(0);
        this.modeMsg = '🚆 রেললাইনের শেষ — ড্রাইভ মোড';
        return;
      }
    }

    // ---- put the chassis on the rail point: velocity that reaches it exactly at the end of this step (collisions still work) ----
    const k = Math.exp(-5 * dt);
    this.railOff.x *= k;
    this.railOff.y *= k;
    this.railOff.z *= k;
    const tx = p.x + this.railOff.x - ox;
    const tz = p.z + this.railOff.z - oz;
    const ty = p.y + this.railOff.y - groundY(this.spec);
    let vx = (tx - t.x) / dt;
    let vy = (ty - t.y) / dt;
    let vz = (tz - t.z) / dt;
    const lim = Math.abs(vCar) + 25;
    const m = Math.hypot(vx, vy, vz);
    if (m > lim) {
      vx *= lim / m;
      vy *= lim / m;
      vz *= lim / m;
    }
    body.setLinvel({ x: vx, y: vy, z: vz }, true);

    // ---- attitude: nose along the rails (eased over the 20 m polyline corners), pitched with the grade ----
    const goalYaw = Math.atan2(p.tx * this.railFace, p.tz * this.railFace);
    const dy = Math.atan2(Math.sin(goalYaw - this.railYaw), Math.cos(goalYaw - this.railYaw));
    this.railYaw += dy * Math.min(1, 10 * dt);
    const tr = lock.tracks[p.track];
    const seg = Math.hypot(tr.xs[p.i + 1] - tr.xs[p.i], tr.zs[p.i + 1] - tr.zs[p.i]) || 1;
    const grade = ((tr.ys[p.i + 1] - tr.ys[p.i]) / seg) * this.railFace;
    this.tiltP += (-Math.atan(grade) - this.tiltP) * Math.min(1, 8 * dt);
    this.tiltR += (0 - this.tiltR) * Math.min(1, 8 * dt);
    this.eul.set(this.tiltP, this.railYaw, this.tiltR, 'YXZ');
    this.tmpQ.setFromEuler(this.eul);
    body.setRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);
    this.yawRate = 0;
    this.agl = 0;
    this.depth = 0;
    this.thrustAmt = 0;
    this.throttle += ((!inp ? 0 : Math.abs(drive)) - this.throttle) * Math.min(1, 6 * dt);
    this.brake = 0;
    this.handbrake = false;
    this.powertrain.step(dt, this.throttle, Math.max(0, vCar));
  }

  /**
   * Fly / land / float / dive. The wheels are switched off: the chassis is moved by setting its velocity (like a drone / boat with an
   * autopilot), so it stays stable, but it is still a real Rapier body: buildings, hills and the sea floor stop it, and crashes hurt.
   * AIR = drone physics (4 rotors: the craft tilts, the horizontal part of the thrust accelerates it, motor lag, wind gusts) that turns
   * into a real aeroplane (lift grows with speed squared, pusher thrust, rotors fade out) above ~100 km/h. WATER = buoyancy spring following
   * the waves, quadratic water drag, wave pitch / roll. All speed limits are hard: road 500, air 500, water 400 km/h.
   */
  private amphibiousStep(dt: number, input: DriveInput | null, lv: { x: number; y: number; z: number }): void {
    const F = SUPRIM_FLIGHT;
    const s = this.spec;
    const body = this.body;
    const g = -PhysicsConfig.gravity;
    const inp = this.state === 'wrecked' || !input ? null : input;
    const dead = inp === null;
    // nobody at the controls: come down gently / come up
    if (dead && this.mode === 'fly') this.mode = 'land';
    if (dead && this.mode === 'dive') this.surfacing = true;
    if (this.mode === 'rail') {
      this.railStep(dt, inp, lv);
      return;
    }

    const t = body.translation();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;
    const wx = t.x + ox;
    const wz = t.z + oz;
    const sc = this.waterSc;
    this.d.terrain.sample(wx, wz, sc);
    const wy = this.waterY(sc, wx, wz);
    const wet = !Number.isNaN(wy);
    const feetY = t.y + groundY(s); // height of the tyre bottoms
    const bottomLocal = (s.colliderY ?? 0) - s.half.y; // hull bottom, chassis-local
    this.forwardVector(this.fwd);
    const fx = this.fwd.x;
    const fz = this.fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    const hx = fx / fl; // heading (horizontal forward)
    const hz = fz / fl;
    let yaw = Math.atan2(hx, hz);
    const thr = inp && inp.throttle && !inp.brake ? 1 : 0;
    const brk = inp && inp.brake && !inp.throttle ? 1 : 0;
    const drive = thr - brk * 0.45;
    const steer = inp ? clamp(inp.steer, -1, 1) : 0;
    const boost = true; // full power all the time: no Shift needed (Ctrl still slows down)
    const slow = !!inp?.slow;
    const vF = lv.x * hx + lv.z * hz; // forward speed along the heading
    const vL = lv.x * hz - lv.z * hx; // sideways (body +X = left when the nose points to +Z)
    this.speed = vF;
    let vy = lv.y;
    let nF = vF;
    let nL = vL;
    let pitchGoal = 0; // + = nose down
    let rollGoal = 0; // + = left side up
    let turnRate: number = F.yawAir;
    let fast = false; // air: the attitude follows quicker

    if (this.mode === 'fly' || this.mode === 'land') {
      // ---------------------------- AIR: drone + aeroplane ----------------------------
      this.depth = 0;
      this.flightClock += dt;
      const vH = Math.hypot(lv.x, lv.z);
      const ready = this.flightClock >= F.deploy || vH > F.wingStall; // thrusters spooled up (or already flying fast)
      this.thrustAmt += ((ready ? 1 : 0) - this.thrustAmt) * Math.min(1, 3 * dt);
      const ground = wet ? Math.max(sc.h, wy) : sc.h;
      const agl = Math.min(feetY - ground, this.probeBelow()); // terrain / water, or anything solid below (expressway deck, bridge, roof)
      this.agl = agl;
      const landing = this.mode === 'land';
      fast = true;

      const wingK = clamp((vH - F.wingStall) / (F.wingFull - F.wingStall), 0, 1); // how much of the weight the wings carry
      const rotorK = 1 - clamp((vH - F.rotorOff0) / (F.rotorOff1 - F.rotorOff0), 0, 1); // rotor authority fades out
      const pushK = clamp((vH - 14) / 18, 0, 1); // the pusher thrust takes over from the rotors

      // wind: slow gusts, stronger higher up (not on the ground)
      this.windT += dt;
      const gustK = clamp((agl - 4) / 20, 0, 1) * (ready ? 1 : 0);
      const gu = (Math.sin(this.windT * 0.61 + 1.3) * 0.7 + Math.sin(this.windT * 1.7) * 0.35) * gustK;
      const gv = (Math.sin(this.windT * 0.53 + 4.1) * 0.7 + Math.sin(this.windT * 1.9 + 2.0) * 0.35) * gustK;
      const gw = (Math.sin(this.windT * 0.9 + 0.5) * 0.5 + Math.sin(this.windT * 2.3) * 0.25) * gustK;

      // wanted forward speed: W = drone speed, or (once flying fast / Shift) the aeroplane cruise; S = slow down / back
      const moveK = Math.max(clamp((agl - 1.0) / 2.0, 0, 1), clamp(vH / 25, 0, 1)); // no creeping along the ground
      let tF = 0;
      if (ready) {
        if (drive > 0) tF = boost ? F.airMax : vH > 45 ? F.cruise : F.droneMax;
        else if (drive < 0) tF = -F.droneMax * 0.45;
        if (slow) tF = Math.min(tF, F.cruise) * F.slow; // Ctrl = slow down (drone speed), however fast W alone would go
        if (landing) tF = Math.min(tF, 22);
      }
      tF *= moveK;

      // forces along the heading
      const kd = F.accel / (F.airMax * F.airMax); // quadratic drag: the normal pusher power balances it at airMax
      const aDrag = -kd * vF * Math.abs(vF) - 0.02 * vF;
      const aLim = g * Math.tan(F.tiltMax);
      const aDes = clamp((tF - vF) * 1.4 - aDrag, -aLim, aLim); // the acceleration the rotors are asked for
      const tiltCmd = ready ? Math.atan(aDes / g) : 0;
      this.droneTilt += (tiltCmd - this.droneTilt) * (1 - Math.exp(-dt / F.tiltTau)); // motors + inertia: the attitude lags
      const aRotor = g * Math.tan(this.droneTilt) * rotorK; // horizontal part of the rotor thrust
      let aPush = 0;
      if (ready && tF > vF && pushK > 0) aPush = clamp((tF - vF) * 2 - aDrag, 0, boost ? F.accelBoost : F.accel) * pushK;
      let aBrake = ready && drive < 0 && vF > 3 ? -18 * (0.3 + 0.7 * wingK) : 0; // air brake (S)
      if (ready && slow && vF > tF + 3) aBrake -= 26; // Ctrl: speed brakes out
      nF = clamp(vF + (aRotor + aPush + aBrake + aDrag + (gu * hx + gv * hz) * 0.5) * dt, -F.droneMax, F.airMax);
      nL = vL * Math.exp(-(1.1 + 3.0 * pushK) * dt) + (gu * hz - gv * hx) * 0.5 * dt;

      // vertical: Space = climb (rotors / pull up), X = descend, otherwise hold the height; the terrain is looked at 1.5 s ahead
      this.d.terrain.sample(wx + lv.x * 1.5, wz + lv.z * 1.5, this.aheadSc);
      const ahead = Math.max(this.aheadSc.h, Number.isNaN(this.aheadSc.water) ? -Infinity : this.aheadSc.water);
      const aglAhead = feetY - Math.max(ground, ahead);
      let targetVy = 0;
      if (landing) {
        const sink = agl < F.flare ? F.touchdown + (F.descend - F.touchdown) * clamp(agl / F.flare, 0, 1) : F.descend;
        targetVy = -sink;
      } else {
        const climbBase = F.climb; // vertical speed stays precise (no overshoot after Space); only the forward speed is always full
        const climbPlane = F.climbPlane * clamp(vH / 80, 0, 1);
        if (inp?.up && ready && agl < F.ceiling) targetVy = Math.max(climbBase, climbBase + (climbPlane - climbBase) * wingK);
        else if (inp?.down && ready) targetVy = -(7 + (45 - 7) * wingK);
        const need = 3.5 + vH * 0.2; // clearance wanted over the ground ahead
        if (moveK > 0.3 && aglAhead < need) targetVy = Math.max(targetVy, Math.min(40, (need - aglAhead) * 3 + 1));
        if (agl >= F.ceiling && targetVy > 0) targetVy = 0;
      }
      const aUp = 6.9 + (30 - 6.9) * wingK; // rotors: about 0.7 g spare; wings: pull-up
      const aDn = 8 + (30 - 8) * wingK;
      let dvy = clamp((targetVy - vy) * 3, -aDn, aUp);
      dvy -= g * (1 - Math.cos(this.droneTilt)) * rotorK * 0.5; // a tilted rotor disc loses vertical thrust: the craft sags a little in a hard turn / stop
      dvy += gw * 0.6;
      vy += dvy * dt;

      // the body stays LEVEL in the air, like a normal car: the nose never rises when it speeds up / climbs, it never leans back or banks
      // (the drone tilt above still drives the physics, it is just not shown on the body)
      pitchGoal = 0;
      turnRate = F.yawAir / (1 + vH / 45);
      rollGoal = 0;

      // touch-down
      if (landing && agl <= 0.3) {
        const overWater = wet && wy - sc.h >= F.floatDepth * 0.9;
        this.leaveAmphibious(overWater ? 'float' : 'drive');
        if (!overWater) this.modeMsg = '🛬 নেমেছে — সাধারণ ড্রাইভ মোড';
        return;
      }
    } else if (this.mode === 'float') {
      // ---------------------------- ON THE WATER ----------------------------
      this.thrustAmt = 0;
      this.agl = 0;
      const shallow = !wet || wy - sc.h < F.floatDepth * 0.5;
      if (shallow) {
        // reached the shore: the wheels take over again (leaving the water at full boat speed would launch the car, so it is eased to ~160 km/h)
        const sp = Math.hypot(lv.x, lv.z);
        const cap = 45;
        const k = sp > cap ? cap / sp : 1;
        body.setLinvel({ x: lv.x * k, y: Math.min(lv.y, 0), z: lv.z * k }, true);
        this.leaveAmphibious('drive');
        this.modeMsg = '🏖️ তীরে পৌঁছেছে — ড্রাইভ মোড';
        return;
      }
      this.depth = Math.max(0, wy - feetY);
      // the hull rides the waves: surface height at the bow, stern and both sides
      const ws = waveScale(sc.water, Math.hypot(sc.fx, sc.fz), Math.max(0, sc.water - sc.h));
      const surf = (px: number, pz: number): number => sc.water + waveHeight(px, pz, ws);
      const hB = surf(wx + hx * 2.0, wz + hz * 2.0);
      const hS = surf(wx - hx * 2.0, wz - hz * 2.0);
      const hP = surf(wx + hz * 0.9, wz - hx * 0.9); // body +X (left)
      const hM = surf(wx - hz * 0.9, wz + hx * 0.9);
      const mean = (wy + hB + hS + hP + hM) / 5;
      const targetY = mean - 0.28 - bottomLocal; // the hull sits just under the waterline
      // buoyancy = spring towards the floating height + damping: dropping in from the air plunges, bobs up and settles
      vy += (36 * (targetY - t.y) - 6.5 * vy) * dt;
      vy = clamp(vy, -25, 25);
      const aMax = F.floatAccel * (boost ? F.waterBoost : 1) * (slow ? F.slow : 1);
      const kdw = (F.floatAccel * F.waterBoost) / (F.waterMax * F.waterMax); // water drag: boost power balances it at 400 km/h
      const aThr = drive > 0 ? aMax : drive < 0 ? -aMax * 0.5 : 0;
      const aF = aThr - kdw * vF * Math.abs(vF) - 0.02 * vF;
      nF = clamp(vF + aF * dt, -20, F.waterMax);
      nL = vL * Math.exp(-2.2 * dt);
      turnRate = (F.yawWater / (1 + Math.abs(vF) / 40)) * (0.3 + 0.7 * clamp(Math.abs(vF) / 4, 0, 1));
      const noseUp = Math.atan2(hB - hS, 4) + clamp(aF * 0.012, -0.12, 0.12) + 0.05 * clamp(vF / F.waterMax, 0, 1);
      pitchGoal = -noseUp;
      rollGoal = Math.atan2(hP - hM, 1.8) - clamp(Math.atan((this.yawRate * vF) / g), -0.5, 0.5) * 0.5;
    } else {
      // ---------------------------- SUBMARINE ----------------------------
      this.thrustAmt = 0;
      this.agl = 0;
      if (!wet) {
        this.surfacing = true;
      }
      const surf = wet ? wy : t.y;
      this.d.terrain.sample(wx + lv.x * 1.2, wz + lv.z * 1.2, this.aheadSc);
      const floor = Math.max(sc.h, Number.isNaN(this.aheadSc.water) || this.aheadSc.h >= this.aheadSc.water ? sc.h : this.aheadSc.h);
      const minCentre = floor + F.floorGap - bottomLocal; // lowest allowed hull centre
      const maxDepth = surf - minCentre; // deepest allowed depth of the centre
      if (inp?.up) this.diveTarget -= F.subRate * dt;
      if (inp?.down) this.diveTarget += F.subRate * dt;
      // the wanted depth never winds up beyond what the water / sea floor allows (otherwise Space would have no effect for a long time)
      this.diveTarget = clamp(this.diveTarget, F.subMin, Math.min(F.subMax, Math.max(F.subMin, maxDepth)));
      if (maxDepth < F.subMin + 0.3) this.surfacing = true; // too shallow to stay under
      const floatY = surf - 0.28 - bottomLocal;
      const targetY = this.surfacing ? floatY : Math.max(minCentre, surf - Math.min(this.diveTarget, Math.max(F.subMin, maxDepth)));
      this.depth = Math.max(0, surf - t.y);
      // ballast / trim planes: a damped spring to the wanted depth (neutral buoyancy, no gravity under water)
      vy += (3.0 * (targetY - t.y) - 3.4 * vy) * dt;
      vy = clamp(vy, -9, 9);
      const aMax = F.subAccel * (boost ? F.waterBoost : 1) * (slow ? F.slow : 1);
      const kdw = (F.subAccel * F.waterBoost) / (F.waterMax * F.waterMax);
      const aThr = drive > 0 ? aMax : drive < 0 ? -aMax * 0.5 : 0;
      const aF = aThr - kdw * vF * Math.abs(vF) - 0.03 * vF;
      nF = clamp(vF + aF * dt, -15, F.waterMax);
      nL = vL * Math.exp(-2.5 * dt);
      turnRate = (F.yawSub / (1 + Math.abs(vF) / 50)) * (0.35 + 0.65 * clamp(Math.abs(vF) / 3, 0, 1));
      pitchGoal = -clamp(Math.atan2(vy, Math.max(Math.abs(vF), 4)), -0.6, 0.6) * 0.8 + clamp(aF * 0.004, -0.05, 0.05);
      rollGoal = -clamp(Math.atan((this.yawRate * vF) / g), -0.6, 0.6) * 0.7;
      if (this.surfacing && Math.abs(t.y - floatY) < 0.35 && wet) {
        this.surfacing = false;
        this.enterFloat();
        this.modeMsg = '🌊 ভেসে উঠেছে — C আবার ডুব · N ওড়া';
        return;
      }
    }

    // ---- common: yaw, velocity, attitude ----
    this.yawRate += (steer * turnRate - this.yawRate) * Math.min(1, 6 * dt);
    yaw += this.yawRate * dt;
    const nhx = Math.sin(yaw);
    const nhz = Math.cos(yaw);
    body.setLinvel({ x: nhx * nF + nhz * nL, y: vy, z: nhz * nF - nhx * nL }, true);
    const kA = fast ? 9 : 4;
    this.tiltP += (pitchGoal - this.tiltP) * Math.min(1, kA * dt);
    this.tiltR += (rollGoal - this.tiltR) * Math.min(1, kA * dt);
    this.eul.set(this.tiltP, yaw, this.tiltR, 'YXZ');
    this.tmpQ.setFromEuler(this.eul);
    body.setRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);

    // the electric motors still "sing" with the speed (VehicleAudio reads the powertrain)
    this.throttle += ((dead ? 0 : Math.abs(drive)) - this.throttle) * Math.min(1, 6 * dt);
    this.brake = 0;
    this.handbrake = false;
    this.powertrain.step(dt, this.throttle, Math.max(0, nF));

    // safety net: never end up inside the ground
    const gy = this.d.terrain.heightAt(wx, wz);
    if (t.y < gy - 2) {
      body.setTranslation({ x: t.x, y: gy + 1.5, z: t.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /**
   * Two wheels cannot stand on their own, so a roll controller does what the rider does: it holds the bike upright,
   * and in a bend it leans exactly as far as the bend needs (tan(lean) = v^2 / (r g) = yaw rate x speed / g).
   * It switches off when the bike hits something or leans too far - then the bike falls over by itself.
   */
  private balanceBike(v: number): void {
    if (this.fallen || this.state === 'wrecked') return;
    const g = -PhysicsConfig.gravity;
    const r = this.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w);
    const right = this.tmp.set(1, 0, 0).applyQuaternion(this.tmpQ); // chassis +X (the bike's left side)
    const roll = Math.asin(clamp(right.y, -1, 1)); // + about the forward axis lifts +X
    const av = this.body.angvel();
    const wRoll = av.x * this.fwd.x + av.y * this.fwd.y + av.z * this.fwd.z;
    // Lean the bike exactly as far as the corner needs: tan(lean) = lateral acceleration / g. The lateral acceleration is
    // what the rider asks for (kappa v^2) blended with what the bike really does (yaw rate x speed), so the lean follows
    // the steering at once and stays honest when the tyres slide.
    const aReal = av.y * v;
    const aAsk = v > 0 ? this.bikeKappa * v * v : aReal;
    this.bikeRoll = roll;
    const wanted = clamp(-Math.atan((0.5 * aReal + 0.5 * aAsk) / g), -0.75, 0.75);
    // falls: too far over, or on its tail / nose (a wheelie that went too far, an endo)
    if (Math.abs(roll) > BIKE_FALL_LEAN || Math.abs(this.fwd.y) > 0.9) {
      this.fall(Math.abs(v));
      return;
    }
    // The rider works like a velocity servo on the roll rate (a torque spring would have to fight the m h^2 inertia of the whole
    // bike about its tyre contact line and goes unstable at 60 Hz; a rate servo is stable and has no overshoot).
    const wDes = clamp(BIKE_KV * (wanted - roll), -BIKE_MAX_ROLL_RATE, BIKE_MAX_ROLL_RATE);
    const dw = (wDes - wRoll) * 0.85;
    this.body.setAngvel({ x: av.x + this.fwd.x * dw, y: av.y + this.fwd.y * dw, z: av.z + this.fwd.z * dw }, true);
  }

  /**
   * Motorbike steering. The rider does not ask for a handlebar angle, he asks for a curve: full lock at walking pace, but at
   * speed only as much curvature as the tyres can give (BIKE_MAX_LAT_G). From the curvature the front-wheel angle follows from
   * the bicycle model (tan(delta) = kappa L), and a slow trim corrects it until the bike really drives that curve (a leaned
   * wheel turns tighter than a upright one, so the plain geometry is not exact).
   */
  private bikeSteer(input: number, v: number, dt: number): number {
    const s = this.spec;
    const L = 2 * s.wheelbaseHalf;
    const av = Math.abs(v);
    const kMax = Math.min(Math.tan(s.maxSteer) / L, (BIKE_MAX_LAT_G * -PhysicsConfig.gravity) / (av * av + 4));
    this.bikeKappa += (input * kMax - this.bikeKappa) * Math.min(1, 12 * dt);
    const yaw = this.body.angvel().y;
    if (v > 2 && !this.fallen) {
      const err = this.bikeKappa - yaw / v;
      this.bikeTrim = clamp(this.bikeTrim + 3 * err * L * dt, -0.2, 0.2);
    }
    if (Math.abs(this.bikeKappa) < 0.004 || v < 1.5) this.bikeTrim *= Math.max(0, 1 - 4 * dt);
    return clamp(Math.atan(this.bikeKappa * L) + this.bikeTrim, -s.maxSteer, s.maxSteer);
  }

  /** The bike goes down (crash or too much lean): the rider is thrown off by VehicleManager. */
  private fall(speed: number): void {
    if (this.fallen) return;
    this.fallen = true;
    this.events.push({ type: 'fall', lethal: speed > 13 });
  }

  // ------------------------------------------------------------------ damage
  /** A whole crash is over: the net velocity change was `dv` m/s. */
  private impact(dv: number): void {
    if (this.spec.balance && !this.fallen && dv > 3.6) this.fall(Math.abs(this.speed) + dv);
    if (dv > 2.5) {
      this.physWorld(this.tmpV2);
      this.d.fx?.crash(this.tmpV2, dv); // sparks and a bang, even when nothing is damaged
    }
    this.impactGrace = 0.3;
    this.d.onCrash?.(this, dv, this.crashSpeed);
    if (dv <= CRASH_DV) return; // a light bump: no damage at all
    this.hurt((dv - CRASH_DV) * CRASH_DAMAGE * this.spec.fragile, false, 'crash');
    // a very hard hit on a car that is already in a bad way can start a fuel-leak fire: it burns, but it does not explode
    if (this.state === 'ok' && dv > CRASH_FIRE_DV && this.hp < CRASH_FIRE_HP && this.spec.fragile > 0.1 && Math.random() < Math.min(0.6, (dv - CRASH_FIRE_DV) / 20)) {
      this.state = 'burning';
      this.explosive = false;
      this.fuse = 7 + Math.random() * 6;
      this.events.push({ type: 'totaled' }); // people get out of a burning car
    }
  }

  /** One bullet of a gun with `weaponDamage` (game units; 24 = an average rifle). Heavy vehicles shrug off small guns. */
  shot(weaponDamage: number, byPlayer: boolean): void {
    const k = clamp(Math.sqrt(weaponDamage / 24), 0.75, 1.6);
    this.hurt((100 / (this.spec.bulletsToKill * BULLET_TOUGHNESS)) * k, byPlayer);
  }

  /** Blast damage (hp units, 0..100+). */
  blast(amount: number, byPlayer: boolean): void {
    this.hurt(amount * BLAST_TOUGHNESS * Math.min(1, this.spec.fragile + 0.4), byPlayer);
  }

  /** An outside impulse (shell recoil): not counted as a crash. */
  kick(ix: number, iy: number, iz: number): void {
    this.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
    this.impactGrace = 0.3;
  }

  /**
   * A blast wave pushes the vehicle: `dv` m/s of delta-v, applied on the side that faces the explosion (so a car near a blast
   * is not only shoved away but also tips and tumbles). (dirX, dirZ) = unit vector from the explosion to the vehicle.
   */
  blastPush(dirX: number, dirZ: number, dv: number): void {
    if (dv <= 0.05) return;
    const m = this.spec.mass;
    const t = this.body.translation();
    const h = this.spec.half;
    const point = { x: t.x - dirX * h.z * 0.6, y: t.y - h.y * 0.2, z: t.z - dirZ * h.z * 0.6 };
    this.body.applyImpulseAtPoint({ x: dirX * m * dv, y: m * dv * 0.45, z: dirZ * m * dv }, point, true);
    this.impactGrace = 0.3;
    this.inCrash = false;
  }

  /** `cause` 'crash' can wreck a vehicle but never blow it up; 'weapon' (bullets, blasts) can. */
  private hurt(amount: number, byPlayer: boolean, cause: 'crash' | 'weapon' = 'weapon'): void {
    if (this.state === 'wrecked' || amount <= 0) return;
    if (byPlayer) this.lastHitByPlayer = true;
    const floor = cause === 'crash' ? CRASH_HP_FLOOR : 0;
    this.hp = Math.max(Math.min(this.hp, floor), this.hp - amount);
    this.breakParts();
    if (cause !== 'weapon') return;
    if (this.state === 'burning') {
      // shot or blasted while already on fire: only sometimes does the fuel go up
      if (!this.explosive && Math.random() < SHOT_EXPLODE_CHANCE) {
        this.explosive = true;
        this.fuse = Math.min(this.fuse, 0.9);
      }
    } else if (this.hp <= 0 && this.state === 'ok') {
      this.state = 'burning';
      // usually a shot-up car just burns (everybody gets out); a real blast (big damage in one go) still blows it up
      this.explosive = amount >= 60 || Math.random() < SHOT_EXPLODE_CHANCE;
      this.fuse = this.explosive ? 0.8 + Math.random() * 0.8 : 7 + Math.random() * 6;
      if (!this.explosive) this.events.push({ type: 'totaled' });
    }
  }

  /** Parts come off as the vehicle gets weaker: bumpers, panels, finally a wheel. */
  private breakParts(): void {
    const frac = this.hp / 100;
    while (this.stageDone < STAGES.length && frac < STAGES[this.stageDone]) {
      this.stageDone++;
      const st = this.stageDone;
      for (const part of this.model.parts) if (part.stage === st && part.obj.parent) this.detach(part.obj, 2.5 + Math.random() * 2);
      if (st === 3 && this.defs.length > 2 && !this.spec.balance && this.spec.look.kind !== 'tank') this.loseWheel();
    }
    // the rest bends a bit
    for (const part of this.model.parts) {
      if (part.stage > 0 && part.obj.parent) {
        part.obj.rotation.x += (Math.random() - 0.5) * 0.04 * (1 - frac);
        part.obj.rotation.z += (Math.random() - 0.5) * 0.04 * (1 - frac);
      }
    }
  }

  private loseWheel(): void {
    const free: number[] = [];
    for (let i = 0; i < this.defs.length; i++) if (!this.lostWheel[i]) free.push(i);
    if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)];
    this.lostWheel[i] = true;
    this.controller.setWheelSuspensionStiffness(i, 0); // that corner drops
    this.detach(this.model.wheels[i].pivot, 3);
  }

  /** Throw a piece of the model off the vehicle. */
  private detach(obj: THREE.Object3D, kick: number): void {
    const fx = this.d.fx;
    if (!fx || !obj.parent) return;
    const lv = this.body.linvel();
    const dir = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5).normalize();
    const vel = new THREE.Vector3(lv.x + dir.x * kick, lv.y + dir.y * kick, lv.z + dir.z * kick);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    fx.spawnPiece(obj, vel, spin);
  }

  /** The player gets out / is thrown out: the first thing is that nobody drives it any more. */
  markDriverGone(): void {
    this.coast = true;
  }

  /** Open the driver's door and shut it again after `hold` seconds (getting in / out). No door = nothing happens. */
  openDoor(hold: number): void {
    if (!this.model.driverDoor) return;
    this.doorGoal = 1;
    this.doorHold = hold;
  }

  hasDoor(): boolean {
    return this.model.driverDoor !== null;
  }

  private animateDoor(dt: number): void {
    if (!this.model.driverDoor || (this.doorOpen === 0 && this.doorGoal === 0)) return;
    if (this.doorGoal === 1 && this.doorOpen >= 1) {
      this.doorHold -= dt;
      if (this.doorHold <= 0) this.doorGoal = 0;
    }
    const step = dt / 0.28; // about a quarter of a second to swing
    this.doorOpen = this.doorGoal === 1 ? Math.min(1, this.doorOpen + step) : Math.max(0, this.doorOpen - step);
    const t = this.doorOpen;
    this.model.setDoor(t * t * (3 - 2 * t)); // ease in / out
  }

  /**
   * Far away from the player (physics off): the fire / wreck clocks must still run, otherwise a burning vehicle stays frozen
   * and is still burning when the player comes back minutes later. Nobody is near, so a burning car just burns out (no blast).
   */
  tickOffline(dt: number): void {
    if (this.state === 'burning') {
      this.fuse -= dt;
      if (this.fuse <= 0) this.burnOut();
    } else if (this.state === 'wrecked') {
      this.wreckedFor += dt;
    }
  }

  /** Every frame (render side): fire, smoke, fuse, wreck timer. `dt` in seconds. */
  tick(dt: number): void {
    this.animateDoor(dt);
    if (this.spec.amphibious) {
      const out = this.mode === 'fly' || this.mode === 'land';
      this.wingAmt += clamp((out ? 1 : 0) - this.wingAmt, -dt / 1.2, dt / 1.2);
      if (!out) this.thrustAmt = Math.max(0, this.thrustAmt - dt * 2);
      this.model.setFlightPose(this.wingAmt, this.thrustAmt, dt);
    }
    const fx = this.d.fx;
    if (this.state === 'ok') {
      if (this.hp < 100 * STAGES[2] && fx) this.emit(dt, 0.12, 1);
      return;
    }
    if (this.state === 'burning') {
      this.fuse -= dt;
      if (fx) this.emit(dt, 0.07, 2);
      if (this.fuse <= 0) {
        if (this.explosive) this.explode();
        else this.burnOut();
      }
      return;
    }
    this.wreckedFor += dt;
    if (fx && this.wreckedFor < 22) this.emit(dt, 0.14, this.wreckedFor < 8 ? 2 : 1);
  }

  private emit(dt: number, every: number, strength: number): void {
    if (this.d.fx?.managesFire) return; // VehicleFire simulates the flames and smoke
    this.smokeT -= dt;
    if (this.smokeT > 0 || !this.d.fx) return;
    this.smokeT = every * (0.7 + Math.random() * 0.6);
    this.physWorld(this.tmpV2);
    this.forwardVector(this.fwd);
    const o = this.spec.half.z * 0.55;
    this.tmpV2.x += this.fwd.x * o + (Math.random() - 0.5) * 0.6;
    this.tmpV2.y += 0.8;
    this.tmpV2.z += this.fwd.z * o + (Math.random() - 0.5) * 0.6;
    this.d.fx.smoke(this.tmpV2, strength);
    if (strength >= 2) this.d.fx.fire(this.tmpV2);
  }

  /** A crash fire has burnt itself out: the car is a black write-off, but nothing blew up. */
  private burnOut(): void {
    this.state = 'wrecked';
    this.wreckedFor = 0;
    this.coast = true;
    this.ai = null;
    this.hp = 0;
    this.model.char();
  }

  /** Blow up: everything breakable flies off, the shell stays as a burnt wreck, everybody inside dies (VehicleManager). */
  private explode(): void {
    this.state = 'wrecked';
    this.wreckedFor = 0;
    this.coast = true;
    this.ai = null;
    for (const part of this.model.parts) if (part.stage !== 0 && part.obj.parent) this.detach(part.obj, 5 + Math.random() * 6);
    for (let i = 0; i < this.defs.length; i++) {
      if (!this.lostWheel[i]) {
        this.lostWheel[i] = true;
        this.controller.setWheelSuspensionStiffness(i, 0);
        this.detach(this.model.wheels[i].pivot, 6 + Math.random() * 4);
      }
    }
    this.model.char();
    const m = this.spec.mass;
    const up = Math.min(4, 3000 / Math.sqrt(m) / 8);
    this.body.applyImpulse({ x: (Math.random() - 0.5) * m * 1.2, y: m * up, z: (Math.random() - 0.5) * m * 1.2 }, true);
    this.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * this.inertia.x * 3, y: (Math.random() - 0.5) * this.inertia.y * 2, z: (Math.random() - 0.5) * this.inertia.z * 3 }, true);
    this.impactGrace = 0.5;
    this.events.push({ type: 'explode', byPlayer: this.lastHitByPlayer });
  }

  // ------------------------------------------------------------------ tank turret
  /**
   * Turn the turret / raise the barrel towards a point (floating-origin LOCAL coordinates). Turret yaw is limited
   * by `turnRate`, the barrel by its elevation range.
   */
  aimTurret(dt: number, target: THREE.Vector3): void {
    const T = this.spec.turret;
    const tur = this.model.turret;
    const bar = this.model.barrel;
    if (!T || !tur || !bar) return;
    const q = this.renderQuat;
    const pivot = this.tmp.set(0, T.y, T.z).applyQuaternion(q).add(this.renderPos);
    const rel = this.tmpV2.copy(target).sub(pivot).applyQuaternion(this.tmpQ.copy(q).invert());
    const yawWant = Math.atan2(rel.x, rel.z);
    const pitchWant = clamp(Math.atan2(rel.y, Math.hypot(rel.x, rel.z)), T.minPitch, T.maxPitch);
    let dy = yawWant - this.turretYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turretYaw += clamp(dy, -T.turnRate * dt, T.turnRate * dt);
    this.turretPitch += clamp(pitchWant - this.turretPitch, -0.8 * dt, 0.8 * dt);
    tur.rotation.y = this.turretYaw;
    bar.rotation.x = -this.turretPitch;
  }

  /** Muzzle position (floating-origin LOCAL) and firing direction of the cannon. */
  muzzle(outPos: THREE.Vector3, outDir: THREE.Vector3): boolean {
    const m = this.model.muzzle;
    if (!m) return false;
    this.model.root.updateMatrixWorld(true);
    m.getWorldPosition(outPos);
    m.getWorldQuaternion(this.tmpQ);
    outDir.set(0, 0, 1).applyQuaternion(this.tmpQ);
    return true;
  }

  /** After the physics world stepped. */
  afterStep(): void {
    if (!this.enabled) return;
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  update(alpha: number): void {
    this.syncModel(alpha);
  }

  private syncModel(alpha: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.model.root.position.copy(this.renderPos);
    this.model.root.quaternion.copy(this.renderQuat);
    if (!this.enabled) return;
    const s = this.spec;
    for (let i = 0; i < this.defs.length; i++) {
      const w = this.model.wheels[i];
      if (this.lostWheel[i] || w.pivot.parent !== this.model.root) continue;
      const len = this.controller.wheelSuspensionLength(i) ?? s.susp.rest;
      w.pivot.position.y = s.connY - len;
      w.steer.rotation.y = this.controller.wheelSteering(i) ?? 0;
      w.spin.rotation.x = this.mode === 'rail' ? this.railSpin : this.controller.wheelRotation(i) ?? 0;
    }
  }

  /** Snapshot for the sound system (cheap; called once a frame for the few audible vehicles). */
  audioState(): VehicleAudioState {
    const pt = this.powertrain;
    const lv = this.body.linvel();
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    return {
      kind: this.spec.look.kind,
      speed: this.speed,
      lateral: Math.abs((lv.x * this.fwd.z - lv.z * this.fwd.x) / fl),
      throttle: this.throttle,
      brake: this.brake,
      rpm: pt.rpm,
      idle: this.spec.engine.idleRpm,
      redline: this.spec.engine.redlineRpm,
      gear: pt.gear,
      shifting: pt.shiftTimer > 0,
      limiter: pt.limiter,
      handbrake: this.handbrake,
      engineBraking: pt.engineBraking,
      wheelsOnGround: this.wheelsOnGround,
      wheelCount: this.defs.length,
      hp: this.hp,
      state: this.state,
      surface: this.wheelSurface.length ? this.surface : 2,
      door: this.doorOpen,
      engineOn: (this.driver !== null || this.tourInput !== null) && !this.coast && this.state !== 'wrecked',
      enclosed: !!this.spec.enclosed,
    };
  }

  telemetry(): VehicleTelemetry {
    const pt = this.powertrain;
    return {
      speed: this.speed,
      kmh: Math.abs(this.speed) * 3.6,
      rpm: pt.rpm,
      redline: this.spec.engine.redlineRpm,
      idle: this.spec.engine.idleRpm,
      gear: pt.gear,
      gearCount: this.spec.gears.length,
      auto: pt.auto,
      throttle: this.throttle,
      brake: this.brake,
      steerAngle: this.steerAngle,
      torque: pt.torque,
      powerKw: pt.powerKw,
      wheelForce: pt.wheelForce,
      slip: pt.slip,
      limiter: pt.limiter,
      shifting: pt.shiftTimer > 0,
      engineBraking: pt.engineBraking,
      handbrake: this.handbrake,
      wheelsOnGround: this.wheelsOnGround,
      mode: this.mode,
      altitude: this.agl,
      depth: this.depth,
    };
  }

  dispose(): void {
    this.d.scene.remove(this.model.root);
    this.model.dispose();
    this.d.physics.world.removeVehicleController(this.controller);
    this.d.physics.world.removeRigidBody(this.body);
  }
}
