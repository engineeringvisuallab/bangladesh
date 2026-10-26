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
import { ENGINEER_LOOK, PersonModel } from '../people/PersonModel';
import { BoatModel } from './BoatModel';
import { BoatWake } from './BoatWake';
import { BOAT } from './BoatSpec';
import { waveHeight, waveScale } from '../water/WaterWaves';

/** Helm controls. */
export interface BoatInput {
  /** +1 = throttle forward, -1 = reverse (the lever moves smoothly towards this). */
  throttle: number;
  /** +1 = turn left, -1 = turn right (same sign as the car). */
  steer: number;
  boost: boolean;
  /** Anchor / emergency brake (a big extra hull drag). */
  anchor: boolean;
}

export interface BoatTelemetry {
  /** Speed through the water along the hull (m/s, + forward). */
  speed: number;
  kmh: number;
  /** Throttle lever -1..1. */
  lever: number;
  /** Outboard angle (rad), + = pointing the boat to the left. */
  rudder: number;
  /** Heading in degrees: 0 = north (-z), 90 = east (+x). */
  heading: number;
  /** Forces (N). */
  buoyancy: number;
  weight: number;
  thrust: number;
  drag: number;
  /** Share of the buoyancy points that are under water (0..1). */
  immersion: number;
  /** Water depth under the hull centre (m); 0 = no water. */
  depth: number;
  propInWater: boolean;
  aground: boolean;
  boost: boolean;
  anchor: boolean;
  /** Speed of the current at the boat (m/s). */
  current: number;
  roll: number;
  pitch: number;
  /** True world position (m). */
  x: number;
  z: number;
}

export interface BoatDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
}

const IDLE: BoatInput = { throttle: 0, steer: 0, boost: false, anchor: false };
const UP = new THREE.Vector3(0, 1, 0);
const G = -PhysicsConfig.gravity;
/** Invisible wall just inside the playable area. */
const BOUND = Config.player.bound - 40;

/**
 * A drivable speedboat. One Rapier dynamic body; the water is not a collider, it is a set of forces:
 *  - buoyancy: 8 points on the hull bottom, each pushes up with density * g * area * depth (Archimedes)
 *    plus a damper, so the hull floats, pitches and rolls on its own
 *  - propeller: thrust = min(static thrust, power / speed), pushed from the stern along the outboard direction
 *    (turning the outboard turns the boat; no water at the propeller = no thrust)
 *  - hull resistance: quadratic + linear drag, much stronger sideways (the keel), measured relative to the current
 *  - the terrain collider is the river / lake / sea bed and the shore: the hull runs aground there.
 */
export class Boat implements OrbitTarget {
  readonly model = new BoatModel();
  readonly body: RAPIER.RigidBody;
  private wake: BoatWake;
  private playerSeat: PersonModel | null = null;

  occupied = false;
  /** False while parked far from the player (no ground collider there): body is frozen. */
  enabled = false;
  lever = 0;
  rudder = 0;

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
  private vel = new THREE.Vector3();
  private rel = new THREE.Vector3();
  private wv = new THREE.Vector3();
  private off = new THREE.Vector3();
  private f = new THREE.Vector3();
  private tq = new THREE.Vector3();
  private pt = new THREE.Vector3();
  private sc;
  private sp;

  private headingDeg = 0;
  private fSpeed = 0;
  private rollAng = 0;
  private pitchAng = 0;
  private buoyN = 0;
  private thrustN = 0;
  private dragN = 0;
  private immersion = 0;
  private depth = 0;
  private propWet = false;
  private current = 0;
  private waterY = 0;
  private boosting = false;
  private anchored = false;

  constructor(
    private d: BoatDeps,
    spawnWorld: THREE.Vector3,
    yaw: number,
  ) {
    const R = d.physics.RAPIER;
    const local = d.origin.toLocal(spawnWorld);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.sc = d.terrain.makeSample();
    this.sp = d.terrain.makeSample();

    this.body = d.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(local.x, local.y, local.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.0)
        .setAngularDamping(0.1)
        .setCanSleep(false),
    );
    const col = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      d.physics.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setDensity(0).setFriction(0.15).setRestitution(0.1), this.body);
    col(0.95, 0.2, 2.0, 0, BOAT.keelY + 0.2, -0.7); // main hull
    col(0.55, 0.2, 0.7, 0, BOAT.keelY + 0.2, 2.0); // bow
    this.body.setAdditionalMassProperties(
      BOAT.mass,
      { x: BOAT.com.x, y: BOAT.com.y, z: BOAT.com.z },
      { x: BOAT.inertia.x, y: BOAT.inertia.y, z: BOAT.inertia.z },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    d.scene.add(this.model.root);
    this.wake = new BoatWake(d.scene);
    this.waterY = spawnWorld.y;
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
      this.wake.shift(dx, dz);
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
      this.lever = 0;
      this.fSpeed = 0;
    }
  }

  // ---- OrbitTarget ----
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderPos.x, this.renderPos.y + 1.1, this.renderPos.z);
  }

  /** Chase camera: swing behind the boat while it moves. */
  followYaw(): number | null {
    if (Math.abs(this.fSpeed) < 3) return null;
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

  /** World position beside the hull (side = +1 left, -1 right) at distance `dist` from the centre line. */
  sidePosition(side: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
    const r = this.body.rotation();
    const left = this.left.set(1, 0, 0).applyQuaternion(this.q.set(r.x, r.y, r.z, r.w));
    const t = this.body.translation();
    return this.d.origin.toWorld(out.set(t.x + left.x * dist * side, t.y, t.z + left.z * dist * side), out);
  }

  /** Put the player (or nobody) behind the wheel. */
  seatPlayer(on: boolean): void {
    if (on && !this.playerSeat) {
      const m = new PersonModel(ENGINEER_LOOK);
      m.root.removeFromParent();
      m.setSeated(true);
      m.root.position.set(BOAT.seat.x, BOAT.seat.y, BOAT.seat.z);
      m.root.rotation.set(0, 0, 0);
      m.root.scale.setScalar(BOAT.seat.scale * m.look.scale);
      this.model.root.add(m.root);
      this.playerSeat = m;
    } else if (!on && this.playerSeat) {
      this.playerSeat.root.removeFromParent();
      this.playerSeat = null;
    }
  }

  /** Height (m) of the waves above the flat water level at absolute (x, z): sea swell, small on lakes, none on rivers. */
  private waveAt(x: number, z: number, s: { h: number; water: number; fx: number; fz: number }): number {
    return waveHeight(x, z, waveScale(s.water, Math.hypot(s.fx, s.fz), Math.max(0, s.water - s.h)));
  }

  /** Level the boat again after a capsize, keeping position and heading; sits on the water surface. */
  reset(): void {
    this.forwardVector(this.fwd);
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const t = this.body.translation();
    const wx = t.x + this.d.origin.origin.x;
    const wz = t.z + this.d.origin.origin.z;
    this.d.terrain.sample(wx, wz, this.sc);
    const surface = !Number.isNaN(this.sc.water) ? Math.max(this.sc.water, this.sc.h) : this.sc.h;
    this.body.setTranslation({ x: t.x, y: surface + 0.4, z: t.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Called every fixed step BEFORE the physics world steps. input = null while nobody drives. */
  fixedUpdate(dt: number, input: BoatInput | null): void {
    if (!this.enabled) return;
    const body = this.body;
    const inp = input ?? IDLE;
    const t = body.translation();
    const r = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    const ox = this.d.origin.origin.x;
    const oz = this.d.origin.origin.z;

    this.q.set(r.x, r.y, r.z, r.w);
    this.qInv.copy(this.q).invert();
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.fwd.set(0, 0, 1).applyQuaternion(this.q);
    this.vel.set(lv.x, lv.y, lv.z);
    const wl = this.wv.set(av.x, av.y, av.z).applyQuaternion(this.qInv); // angular velocity in body axes
    const wlY = wl.y;

    // attitude + heading
    const hl = Math.hypot(this.fwd.x, this.fwd.z);
    this.headingDeg = (((Math.atan2(this.fwd.x, -this.fwd.z) * 180) / Math.PI) + 360) % 360;
    this.rollAng = Math.asin(clamp(-this.left.set(1, 0, 0).applyQuaternion(this.q).y, -1, 1));
    this.pitchAng = hl > 1e-3 ? Math.atan2(this.fwd.y, hl) : 0;

    body.resetForces(false);
    body.resetTorques(false);

    // ---- water at the hull centre: level + current ----
    this.d.terrain.sample(t.x + ox, t.z + oz, this.sc);
    const centreWet = !Number.isNaN(this.sc.water) && this.sc.h < this.sc.water;
    const flowX = centreWet ? this.sc.fx : 0;
    const flowZ = centreWet ? this.sc.fz : 0;
    this.current = Math.hypot(flowX, flowZ);
    if (centreWet) this.waterY = this.sc.water + this.waveAt(t.x + ox, t.z + oz, this.sc);
    this.depth = centreWet ? Math.max(0, this.sc.water - this.sc.h) : 0;

    // ---- buoyancy (Archimedes) at every hull point ----
    let lift = 0;
    let wet = 0;
    for (const p of BOAT.points) {
      this.off.set(p.x, p.y, p.z).applyQuaternion(this.q);
      const px = t.x + this.off.x;
      const py = t.y + this.off.y;
      const pz = t.z + this.off.z;
      this.d.terrain.sample(px + ox, pz + oz, this.sp);
      if (Number.isNaN(this.sp.water) || this.sp.h >= this.sp.water) continue; // dry land under this point
      const sub = this.sp.water + this.waveAt(px + ox, pz + oz, this.sp) - py; // the hull rides the real waves
      if (sub <= 0) continue;
      wet += clamp(sub / 0.3, 0, 1);
      // velocity of this point (v + w x r) for the damper
      const vy = lv.y + (av.z * this.off.x - av.x * this.off.z);
      const fy = Math.max(0, p.k * Math.min(sub, BOAT.maxDraft) - p.c * vy);
      lift += fy;
      body.addForceAtPoint({ x: 0, y: fy, z: 0 }, { x: px, y: py, z: pz }, true);
    }
    this.buoyN = lift;
    this.immersion = wet / BOAT.points.length;
    // resisting hull: full drag once it floats at its normal draft (immersion ~0.4), none when it is out of the water
    const imm = clamp(this.immersion / 0.35, 0, 1);

    // ---- velocity relative to the water (the current carries the boat) ----
    this.rel.set(lv.x - flowX, lv.y, lv.z - flowZ).applyQuaternion(this.qInv);
    this.fSpeed = this.rel.z;

    // ---- engine ----
    const target = input ? clamp(inp.throttle, -1, 1) : 0;
    this.lever += clamp(target - this.lever, -2.2 * dt, 1.8 * dt);
    const vMax = Math.abs(this.fSpeed);
    const lim = clamp(vMax / 14, 0, 1);
    const rudderMax = BOAT.rudderLow + (BOAT.rudderHigh - BOAT.rudderLow) * lim;
    this.rudder += clamp((input ? inp.steer : 0) * rudderMax - this.rudder, -1.8 * dt, 1.8 * dt);
    this.boosting = inp.boost && this.lever > 0.2;
    this.anchored = inp.anchor;

    // is the propeller in the water?
    this.off.set(BOAT.stern.x, BOAT.propY, BOAT.stern.z).applyQuaternion(this.q);
    this.d.terrain.sample(t.x + this.off.x + ox, t.z + this.off.z + oz, this.sp);
    const propSub = !Number.isNaN(this.sp.water) && this.sp.h < this.sp.water ? this.sp.water + this.waveAt(t.x + this.off.x + ox, t.z + this.off.z + oz, this.sp) - (t.y + this.off.y) : -1;
    this.propWet = propSub > 0.02;
    const propK = clamp(propSub / 0.25, 0, 1);

    const tStat = BOAT.thrustStatic * (this.boosting ? BOAT.boostThrust : 1);
    const power = BOAT.power * (this.boosting ? BOAT.boostPower : 1);
    const tAvail = Math.min(tStat, power / Math.max(this.rel.z, 3.5));
    const thrust = (this.lever >= 0 ? this.lever * tAvail : this.lever * BOAT.reverseShare * BOAT.thrustStatic) * propK;
    this.thrustN = thrust;
    // thrust direction: the outboard swings by `rudder` (+ = left turn: the stern is pushed to the right)
    this.f.set(-Math.sin(this.rudder) * thrust, 0, Math.cos(this.rudder) * thrust).applyQuaternion(this.q);
    this.off.set(BOAT.stern.x, BOAT.stern.y, BOAT.stern.z).applyQuaternion(this.q);
    body.addForceAtPoint({ x: this.f.x, y: this.f.y, z: this.f.z }, { x: t.x + this.off.x, y: t.y + this.off.y, z: t.z + this.off.z }, true);

    // ---- hull resistance (relative to the water) ----
    const brake = this.anchored ? BOAT.anchorDrag : 1;
    const dF = BOAT.dragFwd;
    const dS = BOAT.dragSide;
    // going backwards the blunt transom pushes the water: much more resistance
    const back = this.rel.z < 0 ? BOAT.reverseDrag : 1;
    const fz = -(dF.quad * Math.abs(this.rel.z) + dF.lin) * this.rel.z * imm * brake * back;
    const fx = -(dS.quad * Math.abs(this.rel.x) + dS.lin) * this.rel.x * imm * (this.anchored ? 2 : 1);
    this.dragN = Math.abs(fz);
    this.f.set(fx, 0, fz).applyQuaternion(this.q);
    this.off.set(0, BOAT.com.y - 0.04, 0).applyQuaternion(this.q); // just under the centre of mass: a hard turn heels the boat only a little
    body.addForceAtPoint({ x: this.f.x, y: this.f.y, z: this.f.z }, { x: t.x + this.off.x, y: t.y + this.off.y, z: t.z + this.off.z }, true);

    // yaw damping (water resists the boat turning)
    const yd = -(BOAT.yawDamp.lin * wlY + BOAT.yawDamp.quad * Math.abs(wlY) * wlY) * imm;
    this.tq.set(0, yd, 0).applyQuaternion(this.q);
    body.addTorque({ x: this.tq.x, y: this.tq.y, z: this.tq.z }, true);

    // ---- safety nets ----
    // Self-righting (the boat is a foam-filled unsinkable hull): a gentle torque when it is nearly on its side.
    if (this.up.y < 0.35) {
      this.tq.copy(this.up).cross(UP);
      if (this.tq.lengthSq() < 0.04) this.tq.copy(this.fwd); // exactly upside down: any roll direction will do
      this.tq.multiplyScalar(9000 * (1 - this.up.y));
      body.addTorque({ x: this.tq.x, y: this.tq.y, z: this.tq.z }, true);
    }
    // Never far below the surface (the seabed collider may not exist yet at high speed).
    if (centreWet && t.y < this.sc.water - 3) {
      body.setTranslation({ x: t.x, y: this.sc.water + 0.3, z: t.z }, true);
      body.setLinvel({ x: lv.x, y: Math.max(lv.y, 0), z: lv.z }, true);
    }
    // Invisible wall at the map edge.
    const wx = t.x + ox;
    const wz = t.z + oz;
    const bx = wx > BOUND ? wx - BOUND : wx < -BOUND ? wx + BOUND : 0;
    const bz = wz > BOUND ? wz - BOUND : wz < -BOUND ? wz + BOUND : 0;
    if (bx !== 0 || bz !== 0) {
      const cur = body.translation();
      body.setTranslation({ x: cur.x - bx, y: cur.y, z: cur.z - bz }, true);
      const l2 = body.linvel();
      body.setLinvel({ x: bx !== 0 && Math.sign(l2.x) === Math.sign(bx) ? 0 : l2.x, y: l2.y, z: bz !== 0 && Math.sign(l2.z) === Math.sign(bz) ? 0 : l2.z }, true);
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
    if (this.enabled && dt > 0) {
      this.pt.set(BOAT.stern.x, 0, BOAT.stern.z - 0.2).applyQuaternion(this.renderQuat).add(this.renderPos);
      this.wake.update(dt, this.pt, this.waterY, Math.abs(this.fSpeed), this.propWet && Math.abs(this.lever) > 0.05);
    }
  }

  private syncModel(alpha: number, dt: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.model.root.position.copy(this.renderPos);
    this.model.root.quaternion.copy(this.renderQuat);
    this.model.animate(dt, this.lever, this.rudder, this.propWet);
  }

  telemetry(): BoatTelemetry {
    const w = this.getWorldPosition(this.f);
    return {
      speed: this.fSpeed,
      kmh: this.fSpeed * 3.6,
      lever: this.lever,
      rudder: this.rudder,
      heading: this.headingDeg,
      buoyancy: this.buoyN,
      weight: BOAT.mass * G,
      thrust: this.thrustN,
      drag: this.dragN,
      immersion: this.immersion,
      depth: this.depth,
      propInWater: this.propWet,
      aground: this.immersion < 0.15,
      boost: this.boosting,
      anchor: this.anchored,
      current: this.current,
      roll: this.rollAng,
      pitch: this.pitchAng,
      x: w.x,
      z: w.z,
    };
  }

  dispose(): void {
    this.seatPlayer(false);
    this.wake.dispose();
    this.d.scene.remove(this.model.root);
    this.model.dispose();
    this.d.physics.world.removeRigidBody(this.body);
  }
}
