import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainGenerator, TerrainPhysics } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { clamp } from '../utils/math';
import { waveHeight, waveScale } from '../water/WaterWaves';
import { PlayerModel, type PlayerState } from './PlayerModel';

export interface PlayerDeps {
  physics: PhysicsWorld;
  terrain: TerrainGenerator;
  terrainPhysics: TerrainPhysics;
  origin: FloatingOrigin;
  scene: THREE.Scene;
  bus: Bus;
  input: { isDown(code: string): boolean };
  /** Yaw of the orbit camera: "forward" for the player is where the camera looks. */
  getCameraYaw: () => number;
  /** True when the point (world metres) is inside a railway tunnel / box: the terrain above it is a hill, not the floor. */
  inTunnel?: (x: number, y: number, z: number) => boolean;
  /** Elevation of the orbit camera (rad, + = camera above the player looking down): under water you swim where you look. */
  getCameraElevation?: () => number;
  /** true = the diver never runs out of breath (settings). */
  isOxygenUnlimited?: () => boolean;
  /** The body hits the water at absolute world (x, z); strength 0..1.5 (splash rings and spray). */
  onSplash?: (wx: number, wz: number, strength: number) => void;
  /** Out of breath for too long: the player passed out and was brought up to the surface. */
  onBlackout?: () => void;
}

const HALF = Config.player.height / 2; // capsule centre is HALF above the feet

/**
 * The player: a Rapier kinematic capsule driven by Rapier's KinematicCharacterController
 * (collisions, slopes, stairs/steps, snap to ground). We never write our own collision code.
 * Walk, run, jump (real gravity 9.81), wade and swim (buoyancy to the water level from terrain.sample()).
 * Runs in the 60 Hz fixed step; rendering interpolates between the last two steps.
 *
 * Coordinates: body positions are floating-origin LOCAL; world = origin + local.
 */
export class Player {
  readonly model = new PlayerModel();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;

  state: PlayerState = 'idle';
  /** False until the ground collider under the player exists (then gravity may start). */
  ready = false;
  /** False while the free-fly camera is used: the player is frozen. */
  active = true;
  /** True while sitting in a vehicle: hidden, no collider. */
  inVehicle = false;
  grounded = false;
  swimming = false;
  /** Depth of the feet under the water surface (m), 0 on dry land. */
  waterDepth = 0;
  /** Breath 0..1 (1 = full). */
  oxygen = 1;
  /** The eyes are under the water surface. */
  headUnder = false;
  /** Seconds at zero breath. */
  drownTime = 0;
  private prevSubmerge = -1;
  private blackout = false;
  readonly vel = new THREE.Vector3();
  horizSpeed = 0;
  /** Over-the-shoulder camera offset (m), see OrbitCamera. */
  readonly shoulderOffset = Config.orbit.shoulder;

  private prev = new THREE.Vector3();
  private curr = new THREE.Vector3();
  private render = new THREE.Vector3();
  private sc;
  private coyote = 0;
  private jumpCooldown = 0;
  private heading = 0;
  /** While aiming / shooting the body faces where the camera looks. */
  private aimOn = false;
  private aimHeading = 0;

  constructor(private d: PlayerDeps, spawnWorld: THREE.Vector3) {
    const R = d.physics.RAPIER;
    const P = Config.player;
    const local = d.origin.toLocal(spawnWorld);

    this.body = d.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(local.x, local.y, local.z));
    this.collider = d.physics.world.createCollider(R.ColliderDesc.capsule(HALF - P.radius, P.radius), this.body);

    this.controller = d.physics.world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(P.stepHeight, 0.2, false);
    this.controller.enableSnapToGround(0.5);
    this.controller.setMaxSlopeClimbAngle((P.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle(((P.maxSlopeDeg + 5) * Math.PI) / 180);

    this.sc = d.terrain.makeSample();
    this.prev.copy(local);
    this.curr.copy(local);
    d.scene.add(this.model.root);
    this.syncModel(1, 0);

    // Floating origin moved: everything stored in local coordinates must shift (the physics body is shifted by PhysicsWorld).
    d.bus.on('origin:shift', ({ dx, dz }) => {
      this.prev.x -= dx;
      this.prev.z -= dz;
      this.curr.x -= dx;
      this.curr.z -= dz;
      this.render.x -= dx;
      this.render.z -= dz;
      this.model.root.position.x -= dx;
      this.model.root.position.z -= dz;
    });
  }

  /** Called every fixed step (60 Hz) BEFORE the physics world steps. */
  fixedUpdate(dt: number): void {
    if (!this.active || this.inVehicle) return;
    const { terrain, origin, input } = this.d;
    const P = Config.player;
    const t = this.body.translation();
    const wx = t.x + origin.origin.x;
    const wz = t.z + origin.origin.z;

    // Wait until the ground under us exists, so we never fall through an unloaded world.
    if (!this.ready) {
      if (this.d.terrainPhysics.hasColliderAt(wx, wz)) this.ready = true;
      else return;
    }

    // --- water ---
    const feetY = t.y - HALF;
    terrain.sample(wx, wz, this.sc);
    const wet = !Number.isNaN(this.sc.water) && this.sc.h < this.sc.water;
    // the real, wavy surface (sea swell; lakes a little; rivers flat)
    const surface = wet ? this.sc.water + waveHeight(wx, wz, waveScale(this.sc.water, Math.hypot(this.sc.fx, this.sc.fz), this.sc.water - this.sc.h)) : NaN;
    const submerge = wet ? surface - feetY : -1;
    this.waterDepth = Math.max(0, submerge);
    // splash: the body enters the water (jump, fall or a run into it)
    if (this.prevSubmerge <= 0.1 && submerge > 0.1 && (this.vel.y < -1.5 || this.horizSpeed > 4)) {
      this.d.onSplash?.(wx, wz, clamp(-this.vel.y / 9 + this.horizSpeed / 22, 0.2, 1.5));
    }
    this.prevSubmerge = submerge;
    if (!this.swimming && submerge > P.swimEnter) this.swimming = true;
    else if (this.swimming && submerge < P.swimExit) this.swimming = false;

    // --- wish direction (relative to the camera) ---
    const k = (c: string) => (input.isDown(c) ? 1 : 0);
    const ix = k('KeyD') - k('KeyA');
    const iz = k('KeyW') - k('KeyS');
    const yaw = this.d.getCameraYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let wishX = Math.cos(yaw) * ix + fx * iz;
    let wishZ = -Math.sin(yaw) * ix + fz * iz;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0) {
      wishX /= wl;
      wishZ /= wl;
    }
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    // breath: the eyes under the surface use it up, the surface fills it again
    this.headUnder = this.swimming && wet && feetY + P.height * 0.9 < surface - 0.05;
    const unlimited = this.d.isOxygenUnlimited?.() ?? false;
    if (this.headUnder && !unlimited) this.oxygen = Math.max(0, this.oxygen - (dt * (sprint ? 1.5 : 1)) / P.oxygenSeconds);
    else if (!this.headUnder) this.oxygen = Math.min(1, this.oxygen + dt * P.oxygenRefill);
    if (this.headUnder && this.oxygen <= 0 && !unlimited) {
      this.drownTime += dt;
      if (this.drownTime >= P.drownGrace) this.blackout = true;
    } else this.drownTime = Math.max(0, this.drownTime - dt * 2);
    let speed = this.swimming ? (sprint ? P.swimSprint : P.swim) * (this.headUnder ? 0.88 : 1) : sprint ? P.run : P.walk;
    if (!this.swimming && submerge > 0.2) speed *= 1 - 0.35 * Math.min(1, submerge / 1.1); // wading is slower

    // --- horizontal velocity ---
    const rate = this.swimming ? 4 : this.grounded ? 14 : 3;
    const f = 1 - Math.exp(-rate * dt);
    this.vel.x += (wishX * speed - this.vel.x) * f;
    this.vel.z += (wishZ * speed - this.vel.z) * f;

    // --- vertical velocity ---
    this.jumpCooldown -= dt;
    if (this.swimming) {
      // buoyancy: float with the body centre at the water surface. C = dive, Space = up; under water W swims where the camera looks,
      // and from the surface W + the camera tilted steeply down dives too.
      const buoy = clamp((surface - HALF - feetY) * 2.5, -2, 2);
      const diveV = sprint ? P.diveSprint : P.diveSpeed;
      const rel = (this.d.getCameraElevation?.() ?? 0.35) - 0.35; // 0 = the normal view
      let vt = buoy;
      if (input.isDown('KeyC')) vt = -diveV;
      else if (input.isDown('Space')) vt = buoy + 2.2;
      else if (iz > 0 && this.headUnder && Math.abs(rel) > 0.12) {
        vt = -Math.sin(rel) * diveV * 1.15;
        if (vt > 0) vt = Math.min(vt, Math.max(buoy, 0.6));
      } else if (iz > 0 && !this.headUnder && rel > 0.4) vt = -diveV * 0.8;
      else if (this.headUnder) vt = clamp(buoy, -2, 0.9); // gentle rise when you stop
      this.vel.y += (vt - this.vel.y) * (1 - Math.exp(-6 * dt));
    } else {
      this.vel.y = Math.max(this.vel.y + PhysicsConfig.gravity * dt, -45);
      this.coyote = this.grounded ? 0.12 : this.coyote - dt;
      if (input.isDown('Space') && this.coyote > 0 && this.jumpCooldown <= 0) {
        this.vel.y = P.jump;
        this.coyote = 0;
        this.jumpCooldown = 0.3;
      }
    }

    // --- Rapier character controller: collisions, slopes, steps ---
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    let nx = t.x + m.x;
    let ny = t.y + m.y;
    let nz = t.z + m.z;
    // invisible wall at the edge of the playable area
    if (Math.abs(nx + origin.origin.x) > P.bound) nx = t.x;
    if (Math.abs(nz + origin.origin.z) > P.bound) nz = t.z;
    // passed out: brought up to the surface with some breath back
    if (this.blackout && wet) {
      ny = surface;
      this.vel.set(0, 0, 0);
      this.oxygen = 0.4;
      this.drownTime = 0;
      this.blackout = false;
      this.d.onBlackout?.();
    }
    // safety net: never end up far below the analytic ground
    const ground = terrain.heightAt(nx + origin.origin.x, nz + origin.origin.z);
    if (ny - HALF < ground - 1.5 && !this.d.inTunnel?.(nx + origin.origin.x, ny - HALF + 1, nz + origin.origin.z)) {
      ny = ground + HALF + 0.1;
      this.vel.y = 0;
    }
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // velocity actually achieved (walls and slopes slow us down)
    this.vel.x = m.x / dt;
    this.vel.z = m.z / dt;
    if (this.grounded && this.vel.y <= 0) this.vel.y = 0;
    if (desired.y > 0 && m.y < desired.y * 0.5) this.vel.y = 0; // bumped the ceiling

    this.horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.horizSpeed > 0.5) this.heading = Math.atan2(this.vel.x, this.vel.z);
    if (this.aimOn) this.heading = this.aimHeading;
    if (this.swimming) this.state = 'swim';
    else if (!this.grounded) this.state = 'air';
    else if (this.horizSpeed < 0.4) this.state = 'idle';
    else if (submerge > 0.3) this.state = 'wade';
    else this.state = sprint ? 'run' : 'walk';
  }

  /** Aim / shoot: face `heading` (radians, 0 = +Z) and raise the gun arm. */
  setAim(on: boolean, heading = 0): void {
    this.aimOn = on;
    this.aimHeading = heading;
    this.model.setAiming(on);
  }

  /** Where the gun muzzle is, floating-origin local. */
  getMuzzle(out: THREE.Vector3, gunLength: number): THREE.Vector3 {
    const h = this.aimOn ? this.aimHeading : this.heading;
    const x = 0.29;
    const z = 0.5 + gunLength;
    const c = Math.cos(h);
    const s = Math.sin(h);
    return out.set(this.render.x + x * c + z * s, this.render.y - HALF + 1.45, this.render.z - x * s + z * c);
  }

  /** Get into / out of a vehicle: the model is hidden and the capsule removed from the physics world while inside. */
  setInVehicle(on: boolean): void {
    this.inVehicle = on;
    this.body.setEnabled(!on);
    this.model.root.visible = !on;
    this.vel.set(0, 0, 0);
    this.horizSpeed = 0;
    this.state = 'idle';
  }

  /** While riding a train (inVehicle): follow the moving seat. `world` is the world position of the capsule centre. */
  carryTo(world: THREE.Vector3): void {
    const local = this.d.origin.toLocal(world);
    this.prev.copy(local);
    this.curr.copy(local);
    this.render.copy(local);
  }

  /** Called every fixed step AFTER the physics world stepped. */
  afterStep(): void {
    if (this.inVehicle) return;
    this.prev.copy(this.curr);
    const t = this.body.translation();
    this.curr.set(t.x, t.y, t.z);
  }

  /** Every rendered frame: interpolate between the last two physics steps and animate. */
  update(dt: number, alpha: number): void {
    this.syncModel(alpha, dt);
  }

  private syncModel(alpha: number, dt: number): void {
    this.render.lerpVectors(this.prev, this.curr, alpha);
    this.model.root.position.set(this.render.x, this.render.y - HALF, this.render.z);
    if (dt > 0) {
      this.model.setHeading(this.heading, dt);
      this.model.update(dt, this.horizSpeed, this.active ? this.state : 'idle');
    }
  }

  /** Point the camera looks at (local coordinates). */
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.render.x, this.render.y + Config.orbit.targetHeight, this.render.z);
  }

  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.d.origin.toWorld(this.render, out);
  }

  /** Move the player to a world position (it drops down once the ground there has loaded). */
  teleportTo(world: THREE.Vector3): void {
    const local = this.d.origin.toLocal(world);
    this.body.setTranslation(local, true);
    this.body.setNextKinematicTranslation(local);
    this.prev.copy(local);
    this.curr.copy(local);
    this.render.copy(local);
    this.vel.set(0, 0, 0);
    this.ready = false;
    this.swimming = false;
    this.grounded = false;
    this.syncModel(1, 0);
  }

  dispose(): void {
    this.d.scene.remove(this.model.root);
    this.model.dispose();
    this.d.physics.world.removeCharacterController(this.controller);
    this.d.physics.world.removeRigidBody(this.body);
  }
}
