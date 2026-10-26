import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { OrbitTarget } from '../camera/OrbitCamera';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainGenerator } from '../terrain';
import { clamp } from '../utils/math';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { HelicopterModel } from './HelicopterModel';
import { HELI } from './HelicopterSpec';

/** Pilot controls. pitch/roll/yaw are -1..1. */
export interface FlightInput {
  /** +1 = nose down (fly forward), -1 = nose up (slow down / fly backwards). */
  pitch: number;
  /** +1 = bank right, -1 = bank left. */
  roll: number;
  /** +1 = turn nose left, -1 = turn nose right (tail-rotor pedals). */
  yaw: number;
  up: boolean;
  down: boolean;
  boost: boolean;
}

export interface HelicopterTelemetry {
  /** Horizontal speed (m/s). */
  speed: number;
  kmh: number;
  /** Vertical speed (m/s), + = climbing. */
  vz: number;
  /** Altitude above sea level and above the ground (m). */
  alt: number;
  agl: number;
  /** Rotor speed 0..1, collective 0..1. */
  rpm: number;
  collective: number;
  thrust: number;
  weight: number;
  /** Heading in degrees: 0 = north (-z), 90 = east (+x). */
  heading: number;
  /** Attitude in radians (pitch + = nose down, roll + = banked right). */
  pitch: number;
  roll: number;
  engineOn: boolean;
  assist: boolean;
  boost: boolean;
  groundEffect: boolean;
  thinAir: boolean;
  /** True world position (m). */
  x: number;
  z: number;
}

export interface HelicopterDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
}

const IDLE: FlightInput = { pitch: 0, roll: 0, yaw: 0, up: false, down: false, boost: false };
const UP = new THREE.Vector3(0, 1, 0);
const G = -PhysicsConfig.gravity;
/** Invisible wall just inside the playable area. */
const BOUND = Config.player.bound - 40;

/**
 * A flyable helicopter. One Rapier dynamic body; the rotor is modelled as forces/torques:
 *  - lift   = collective * Tmax * (rotor speed)^2 * air density * ground effect * translational lift, along the rotor axis
 *  - tilting the rotor axis (cyclic) turns part of the lift into forward/sideways force
 *  - pitch/roll torque from the cyclic, yaw torque from the tail rotor (pedals)
 *  - anisotropic aerodynamic drag, thinner air with altitude
 * "Stability assist" (X) is an autopilot: attitude hold + vertical-speed hold (hover without touching a key).
 * Without it (manual) the controls command angular accelerations / collective directly: a real challenge.
 */
export class Helicopter implements OrbitTarget {
  readonly model = new HelicopterModel();
  readonly body: RAPIER.RigidBody;

  occupied = false;
  /** Police pursuit aircraft are AI-only (flown by the autopilot below). */
  policeAircraft = false;
  /** False while parked far from the player (no ground collider there): body is frozen. */
  enabled = false;
  engineOn = false;
  assist = true;
  rpm = 0;
  collective = 0;

  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private renderPos = new THREE.Vector3();
  private renderQuat = new THREE.Quaternion();

  private q = new THREE.Quaternion();
  private qInv = new THREE.Quaternion();
  private up = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private left = new THREE.Vector3();
  private hf = new THREE.Vector3(0, 0, 1);
  private hr = new THREE.Vector3(1, 0, 0);
  private vel = new THREE.Vector3();
  private wl = new THREE.Vector3();
  private f = new THREE.Vector3();
  private tq = new THREE.Vector3();
  private sc;
  private tourTargetLocal = new THREE.Vector3();
  private tourWantedVelocity = new THREE.Vector3();
  private tourCurrentVelocity = new THREE.Vector3();
  private tourDeltaVelocity = new THREE.Vector3();
  private tourHeadingForward = new THREE.Vector3();
  private tourHeadingQuaternion = new THREE.Quaternion();

  private pitchAng = 0;
  private rollAng = 0;
  private headingDeg = 0;
  private hSpeed = 0;
  private vz = 0;
  private agl = 0;
  private altitude = 0;
  private thrust = 0;
  private groundEffect = false;
  private thinAir = false;
  private boosting = false;

  constructor(
    private d: HelicopterDeps,
    spawnWorld: THREE.Vector3,
    yaw: number,
  ) {
    const R = d.physics.RAPIER;
    const local = d.origin.toLocal(spawnWorld);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.sc = d.terrain.makeSample();

    this.body = d.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(local.x, local.y, local.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.0)
        .setAngularDamping(0.25)
        .setCanSleep(false),
    );
    const col = (hx: number, hy: number, hz: number, x: number, y: number, z: number, friction: number) =>
      d.physics.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setDensity(0).setFriction(friction).setRestitution(0.05), this.body);
    col(0.95, 0.8, 1.7, 0, 0, 0.3, 0.4); // cabin
    col(0.2, 0.25, 2.3, 0, 0.18, -4.1, 0.4); // tail boom
    col(0.07, 0.07, 1.75, 1.05, -1.2, 0.2, 0.9); // left skid
    col(0.07, 0.07, 1.75, -1.05, -1.2, 0.2, 0.9); // right skid
    this.body.setAdditionalMassProperties(
      HELI.mass,
      { x: 0, y: HELI.comY, z: 0 },
      { x: HELI.inertia.x, y: HELI.inertia.y, z: HELI.inertia.z },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    d.scene.add(this.model.root);
    this.prevPos.copy(local);
    this.currPos.copy(local);
    this.prevQuat.copy(q);
    this.currQuat.copy(q);
    this.syncModel(1, 0);
    this.body.setEnabled(false); // enabled by the manager once the ground under it has loaded

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
    } else {
      this.rpm = 0;
      this.collective = 0;
      this.engineOn = false;
    }
  }

  // ---- OrbitTarget ----
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderPos.x, this.renderPos.y + 0.6, this.renderPos.z);
  }

  /** Chase camera: swing behind the helicopter while it flies. */
  followYaw(): number | null {
    if (this.hSpeed < 4) return null;
    this.forwardVector(this.fwd);
    return Math.atan2(-this.fwd.x, -this.fwd.z);
  }

  forwardVector(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    return out.set(0, 0, 1).applyQuaternion(this.q.set(r.x, r.y, r.z, r.w));
  }

  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.d.origin.toWorld(this.renderPos, out);
  }

  /** World position next to the left door (for getting out). */
  doorPosition(out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    const left = this.left.set(1, 0, 0).applyQuaternion(this.q.set(r.x, r.y, r.z, r.w));
    const t = this.body.translation();
    return this.d.origin.toWorld(out.set(t.x + left.x * 2.6, t.y, t.z + left.z * 2.6), out);
  }

  /** Level the helicopter again (after a roll-over / crash), keeping position and heading. */
  reset(): void {
    this.forwardVector(this.fwd);
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const gy = this.d.terrain.heightAt(wx, wz);
    this.body.setTranslation({ x: t.x, y: Math.max(t.y, gy + HELI.skidDepth + 1.5), z: t.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Stable, physics-integrated autopilot for the police helicopters.
   * It steers velocity and heading directly while keeping the airframe level; normal player flight
   * still uses the force-based controller below. `targetWorld` is always in absolute world space.
   */
  tourFixedUpdate(dt: number, targetWorld: THREE.Vector3, landingApproach: boolean): void {
    if (!this.enabled) return;
    this.body.setGravityScale(0, true);
    this.engineOn = true;
    this.assist = true;
    this.rpm = Math.min(1, this.rpm + dt * 0.9);

    const t = this.body.translation();
    const lv = this.body.linvel();
    const localTarget = this.d.origin.toLocal(targetWorld, this.tourTargetLocal);
    const dx = localTarget.x - t.x;
    const dz = localTarget.z - t.z;
    const distance = Math.hypot(dx, dz);
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    const groundY = this.d.terrain.heightAt(wx, wz);

    // Use a smooth high transit path, then follow a shallow, controlled descent over the landing pad.
    let desiredY: number;
    if (landingApproach) {
      const approachHeight = Math.min(48, Math.max(0, (distance - 6) * 0.44));
      desiredY = localTarget.y + approachHeight;
      const terrainClearance = this.d.terrain.heightAt(wx, wz) + HELI.skidDepth + (distance > 28 ? 18 : Math.max(0.08, distance * 0.24));
      desiredY = Math.max(desiredY, terrainClearance);
    } else {
      desiredY = Math.max(localTarget.y, groundY + HELI.skidDepth + 18);
    }

    // Braking is distance-based, so the helicopter cannot fly past its pad at cruise speed.
    const maxSpeed = landingApproach ? 62 : 42; // ~223 km/h Tour cruise, a little slower for police orbiting
    const desiredSpeed = Math.min(maxSpeed, Math.sqrt(2 * 10 * Math.max(0, distance - 1.5)));
    this.tourWantedVelocity.set(0, 0, 0);
    if (distance > 1e-3) {
      this.tourWantedVelocity.x = (dx / distance) * desiredSpeed;
      this.tourWantedVelocity.z = (dz / distance) * desiredSpeed;
    }

    this.tourCurrentVelocity.set(lv.x, 0, lv.z);
    this.tourDeltaVelocity.set(
      this.tourWantedVelocity.x - this.tourCurrentVelocity.x,
      0,
      this.tourWantedVelocity.z - this.tourCurrentVelocity.z,
    );
    const maxHorizontalChange = 13 * dt;
    const dv = Math.hypot(this.tourDeltaVelocity.x, this.tourDeltaVelocity.z);
    if (dv > maxHorizontalChange && dv > 1e-6) this.tourDeltaVelocity.multiplyScalar(maxHorizontalChange / dv);
    let vx = lv.x + this.tourDeltaVelocity.x;
    let vz = lv.z + this.tourDeltaVelocity.z;

    const verticalWanted = clamp((desiredY - t.y) * 0.75, -6.5, 7.5);
    const vy = lv.y + clamp(verticalWanted - lv.y, -4.5 * dt, 4.5 * dt);

    // Rotate only around world-up, with a finite turn rate. This prevents bank/roll accumulation and flips.
    const horizontalSpeed = Math.hypot(vx, vz);
    let currentYaw = 0;
    this.forwardVector(this.tourHeadingForward);
    currentYaw = Math.atan2(this.tourHeadingForward.x, this.tourHeadingForward.z);
    let desiredYaw = currentYaw;
    if (distance > 1.2) desiredYaw = Math.atan2(dx, dz);
    let yawError = desiredYaw - currentYaw;
    while (yawError > Math.PI) yawError -= Math.PI * 2;
    while (yawError < -Math.PI) yawError += Math.PI * 2;
    const yaw = currentYaw + clamp(yawError, -1.4 * dt, 1.4 * dt);
    this.tourHeadingQuaternion.setFromAxisAngle(UP, yaw);
    this.body.setRotation({
      x: this.tourHeadingQuaternion.x, y: this.tourHeadingQuaternion.y,
      z: this.tourHeadingQuaternion.z, w: this.tourHeadingQuaternion.w,
    }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // Close to touchdown, remove all horizontal drift and gently settle onto the terrain-height target.
    if (landingApproach && distance < 1.8 && Math.abs(t.y - localTarget.y) < 0.18 && Math.hypot(vx, vz) < 0.7 && Math.abs(vy) < 0.5) {
      vx = 0; vz = 0;
      this.body.setTranslation({ x: localTarget.x, y: localTarget.y, z: localTarget.z }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      this.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    this.hSpeed = horizontalSpeed;
    this.vz = vy;
    this.altitude = t.y;
    const sampleWorld = this.d.origin.toWorld(new THREE.Vector3(t.x, t.y, t.z));
    this.d.terrain.sample(sampleWorld.x, sampleWorld.z, this.sc);
    const surface = Math.max(this.sc.h, Number.isNaN(this.sc.water) ? -Infinity : this.sc.water, Config.terrain.seaLevel);
    this.agl = t.y - HELI.skidDepth - surface;
    this.pitchAng = 0;
    this.rollAng = 0;
    this.collective = this.agl < 1.2 ? 0.05 : 0.55;
    this.thrust = this.collective * HELI.thrustMax * this.rpm * this.rpm;
  }

  /** Hand the helicopter back from the autopilot to normal physics (gravity on again). */
  releaseAutopilot(): void {
    this.body.setGravityScale(1, true);
  }

  /** Called every fixed step BEFORE the physics world steps. input = null while parked. */
  fixedUpdate(dt: number, input: FlightInput | null): void {
    if (!this.enabled) return;
    const body = this.body;
    const inp = input ?? IDLE;
    const t = body.translation();
    const r = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();

    this.q.set(r.x, r.y, r.z, r.w);
    this.qInv.copy(this.q).invert();
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.fwd.set(0, 0, 1).applyQuaternion(this.q);
    this.vel.set(lv.x, lv.y, lv.z);
    this.wl.set(av.x, av.y, av.z).applyQuaternion(this.qInv); // angular velocity in body axes

    // Heading-aligned horizontal axes, attitude angles.
    const hl = Math.hypot(this.fwd.x, this.fwd.z);
    if (hl > 0.25) this.hf.set(this.fwd.x / hl, 0, this.fwd.z / hl);
    this.hr.set(-this.hf.z, 0, this.hf.x);
    this.pitchAng = Math.atan2(this.up.dot(this.hf), this.up.y);
    this.rollAng = Math.atan2(this.up.dot(this.hr), this.up.y);
    this.headingDeg = (((Math.atan2(this.fwd.x, -this.fwd.z) * 180) / Math.PI) + 360) % 360;
    this.hSpeed = Math.hypot(lv.x, lv.z);
    this.vz = lv.y;

    // Ground / water below.
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    this.d.terrain.sample(wx, wz, this.sc);
    const surface = Math.max(this.sc.h, Number.isNaN(this.sc.water) ? -Infinity : this.sc.water, Config.terrain.seaLevel);
    this.agl = t.y - HELI.skidDepth - surface;
    this.altitude = t.y;
    const agl = this.agl;

    // ---- rotor speed (turbine spool-up / coast-down) ----
    const target = this.engineOn ? 1 : 0;
    if (this.rpm < target) this.rpm = Math.min(target, this.rpm + HELI.spoolUp * dt);
    else this.rpm = Math.max(target, this.rpm - (agl < 0.3 ? HELI.spoolDownGround : HELI.spoolDownAir) * dt);
    const r2 = this.rpm * this.rpm;

    // ---- how much lift one unit of collective gives right now ----
    const density = Math.exp(-t.y / 8500); // relative air density
    const ground = 1 + 0.14 * clamp(1 - agl / 10, 0, 1); // ground effect
    const trans = 1 + 0.1 * clamp(this.hSpeed / 20, 0, 1); // translational lift
    const ceil = clamp((HELI.ceilingZero - t.y) / (HELI.ceilingZero - HELI.ceilingFull), 0, 1);
    const tf = density * ground * trans * ceil;
    this.groundEffect = agl < 6 && this.rpm > 0.9;
    this.thinAir = ceil < 0.9;
    this.boosting = inp.boost && this.assist;

    // ---- collective ----
    if (!input) {
      this.collective = 0;
    } else if (this.assist) {
      // Vertical-speed hold: Space = climb, C = descend, nothing = hold altitude.
      const vzMax = inp.boost ? 9 : 6;
      let vzT = (inp.up ? vzMax : 0) - (inp.down ? vzMax : 0);
      if (agl < 14) vzT = Math.max(vzT, -(0.7 + agl * 0.3)); // soft landing
      const acc = clamp(2.4 * (vzT - this.vz), -5, 7);
      const need = (HELI.mass * (G + acc)) / Math.max(this.up.y, 0.5);
      let c = r2 * tf > 0.02 ? need / (HELI.thrustMax * tf * r2) : 1;
      if (agl < 0.3 && !inp.up) c = 0; // on the ground: collective flat
      c = clamp(c, 0, 1);
      this.collective += clamp(c - this.collective, -3 * dt, 3 * dt);
    } else {
      this.collective = clamp(this.collective + ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * 0.35 * dt, 0, 1);
    }

    body.resetForces(false);
    body.resetTorques(false);

    // ---- lift: along the rotor axis (fixed to the fuselage) ----
    this.thrust = this.collective * HELI.thrustMax * tf * r2;
    this.f.copy(this.up).multiplyScalar(this.thrust);

    // ---- aerodynamic drag (different drag area for each body axis) ----
    const rho = 1.225 * density;
    const v = this.tq.copy(this.vel).applyQuaternion(this.qInv); // velocity in body axes
    const cd = HELI.cdA;
    const dl = new THREE.Vector3(-0.5 * rho * cd.x * Math.abs(v.x) * v.x, -0.5 * rho * cd.y * Math.abs(v.y) * v.y, -0.5 * rho * cd.z * Math.abs(v.z) * v.z);
    dl.applyQuaternion(this.q);
    this.f.add(dl);
    body.addForce({ x: this.f.x, y: this.f.y, z: this.f.z }, true);

    // ---- attitude: angular accelerations (body axes), then torque = I * alpha ----
    const grounded = agl < 0.4;
    let ax: number;
    let ay: number;
    let az: number;
    if (this.assist) {
      const maxP = inp.boost ? HELI.maxPitchBoost : HELI.maxPitch;
      ax = grounded ? 0 : clamp(7 * (inp.pitch * maxP - this.pitchAng) - 3.2 * this.wl.x, -6, 6);
      az = grounded ? 0 : clamp(7 * (inp.roll * HELI.maxRoll - this.rollAng) - 3.2 * this.wl.z, -6, 6);
      ay = clamp(4 * (inp.yaw * 1.2 - this.wl.y), -3.5, 3.5);
    } else {
      ax = inp.pitch * 3.0 - 0.8 * this.wl.x;
      az = inp.roll * 3.0 - 0.8 * this.wl.z;
      ay = inp.yaw * 2.2 - 0.6 * this.wl.y - 0.5 * this.collective; // main-rotor torque reaction
    }
    // The rotor gives control authority: no rotor speed, no control.
    this.tq.set(HELI.inertia.x * ax * r2, HELI.inertia.y * ay * r2, HELI.inertia.z * az * r2).applyQuaternion(this.q);
    body.addTorque({ x: this.tq.x, y: this.tq.y, z: this.tq.z }, true);

    // ---- safety nets ----
    // Never below the ground / water surface (colliders may not exist yet at high speed).
    if (agl < -0.3) {
      body.setTranslation({ x: t.x, y: surface + HELI.skidDepth + 0.05, z: t.z }, true);
      body.setLinvel({ x: lv.x * 0.9, y: Math.max(lv.y, 0), z: lv.z * 0.9 }, true);
    }
    // Invisible wall at the map edge.
    const ox = wx > BOUND ? wx - BOUND : wx < -BOUND ? wx + BOUND : 0;
    const oz = wz > BOUND ? wz - BOUND : wz < -BOUND ? wz + BOUND : 0;
    if (ox !== 0 || oz !== 0) {
      const cur = body.translation();
      body.setTranslation({ x: cur.x - ox, y: cur.y, z: cur.z - oz }, true);
      const l2 = body.linvel();
      body.setLinvel({ x: ox !== 0 && Math.sign(l2.x) === Math.sign(ox) ? 0 : l2.x, y: l2.y, z: oz !== 0 && Math.sign(l2.z) === Math.sign(oz) ? 0 : l2.z }, true);
    }
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

  update(alpha: number, dt: number): void {
    this.syncModel(alpha, dt);
  }

  private syncModel(alpha: number, dt: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.model.root.position.copy(this.renderPos);
    this.model.root.quaternion.copy(this.renderQuat);
    this.model.animate(dt, this.rpm);
  }

  telemetry(): HelicopterTelemetry {
    const w = this.getWorldPosition(this.f);
    return {
      speed: this.hSpeed,
      kmh: this.hSpeed * 3.6,
      vz: this.vz,
      alt: this.altitude,
      agl: this.agl,
      rpm: this.rpm,
      collective: this.collective,
      thrust: this.thrust,
      weight: HELI.mass * G,
      heading: this.headingDeg,
      pitch: this.pitchAng,
      roll: this.rollAng,
      engineOn: this.engineOn,
      assist: this.assist,
      boost: this.boosting,
      groundEffect: this.groundEffect,
      thinAir: this.thinAir,
      x: w.x,
      z: w.z,
    };
  }

  dispose(): void {
    this.d.scene.remove(this.model.root);
    this.model.dispose();
    this.d.physics.world.removeRigidBody(this.body);
  }
}
