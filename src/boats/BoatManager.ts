import * as THREE from 'three';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainGenerator, TerrainPhysics } from '../terrain';
import type { BoatHUD } from '../ui/BoatHUD';
import type { HUD } from '../ui/HUD';
import { Boat, type BoatDeps, type BoatInput } from './Boat';
import { BoatAudio } from './BoatAudio';

export interface BoatManagerDeps {
  boat: BoatDeps;
  terrainPhysics: TerrainPhysics;
  input: InputManager;
  player: Player;
  orbit: OrbitCamera;
  hud: HUD;
  boatHud: BoatHUD;
  /** True while the player drives a car or flies a helicopter (the boat must not be entered then). */
  busy: () => boolean;
  /** World position -> screen pixels (null if behind the camera). */
  project: (world: THREE.Vector3) => { x: number; y: number } | null;
}

const ENTER_DIST = 7;
/** Only get out when (almost) stopped. */
const EXIT_SPEED = 3.5;

/** A spot of open water: world position, water level and a heading that points away from the shore. */
export interface WaterSpot {
  x: number;
  z: number;
  level: number;
  yaw: number;
}

/**
 * Looks for the nearest water that is deep enough (>= minDepth) and has open water around it,
 * searching in growing rings around (cx, cz). Returns null if there is none within maxRadius.
 */
export function findWaterSpot(terrain: TerrainGenerator, cx: number, cz: number, maxRadius = 4000, minDepth = 2.5): WaterSpot | null {
  const sc = terrain.makeSample();
  const deep = (x: number, z: number, d: number): boolean => {
    terrain.sample(x, z, sc);
    return !Number.isNaN(sc.water) && sc.water - sc.h >= d;
  };
  const STEP = 25;
  for (let r = 0; r <= maxRadius; r += STEP) {
    const n = r === 0 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * r) / STEP));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!deep(x, z, minDepth)) continue;
      // needs room for the hull: shallow-but-wet water all around within 10 m
      let room = true;
      for (let k = 0; k < 8 && room; k++) {
        const b = (k / 8) * Math.PI * 2;
        room = deep(x + Math.cos(b) * 10, z + Math.sin(b) * 10, 1.2);
      }
      if (!room) continue;
      terrain.sample(x, z, sc);
      const level = sc.water;
      // face the direction with the most open water
      let bestYaw = 0;
      let bestScore = -1;
      for (let k = 0; k < 16; k++) {
        const yaw = (k / 16) * Math.PI * 2;
        let score = 0;
        for (let s = 1; s <= 8; s++) {
          if (!deep(x + Math.sin(yaw) * s * 25, z + Math.cos(yaw) * s * 25, 1.2)) break;
          score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestYaw = yaw;
        }
      }
      return { x, z, level, yaw: bestYaw };
    }
  }
  return null;
}

/**
 * Owns all boats: spawning, freezing parked ones that are far from the player, getting in/out (F),
 * the keyboard -> helm mapping, the HUD and sound.
 * Keys while driving: W throttle, S reverse, A/D steer, Shift turbo, Space anchor brake, R level the boat, F get out.
 */
export class BoatManager {
  readonly boats: Boat[] = [];
  skipper: Boat | null = null;
  private audio = new BoatAudio();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private helm: BoatInput = { throttle: 0, steer: 0, boost: false, anchor: false };

  constructor(private d: BoatManagerDeps) {}

  /** Float a boat on the water at (x, z); `level` is the water surface height. */
  spawn(x: number, z: number, level: number, yaw: number): Boat {
    const b = new Boat(this.d.boat, new THREE.Vector3(x, level + 0.25, z), yaw);
    this.boats.push(b);
    return b;
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /** 60 Hz, before the physics step. */
  fixedUpdate(dt: number): void {
    const k = (c: string) => this.d.input.isDown(c);
    const h = this.helm;
    h.throttle = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    h.steer = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0);
    h.boost = k('ShiftLeft') || k('ShiftRight');
    h.anchor = k('Space');
    for (const b of this.boats) b.fixedUpdate(dt, b === this.skipper ? h : null);
  }

  afterStep(): void {
    for (const b of this.boats) b.afterStep();
  }

  /** Key presses (once per frame). Returns true if the key was used here (so the car / helicopter logic must ignore it). */
  handleKeys(): boolean {
    const inp = this.d.input;
    const skipper = this.skipper;
    if (skipper) {
      if (inp.wasPressed('KeyR')) skipper.reset();
      if (inp.wasPressed('KeyF')) this.exit();
      return true;
    }
    if (inp.wasPressed('KeyF') && !this.d.busy()) {
      const near = this.nearest(ENTER_DIST);
      if (near) {
        this.enter(near);
        return true;
      }
    }
    return false;
  }

  /** Every frame. `focus` = world position of the camera (decides which boats are simulated). */
  update(dt: number, alpha: number, focus: THREE.Vector3): void {
    for (const b of this.boats) {
      b.getWorldPosition(this.tmp);
      const dist = Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      const near = dist < PhysicsConfig.activeRadius * 0.9 && this.d.terrainPhysics.hasColliderAt(this.tmp.x, this.tmp.z);
      if (b.occupied || near) b.setEnabled(true);
      else if (dist > PhysicsConfig.activeRadius * 1.1) b.setEnabled(false);
      b.update(alpha, dt);
    }

    const skipper = this.skipper;
    if (skipper) {
      this.d.hud.hideMarker();
      const tel = skipper.telemetry();
      this.d.boatHud.update(tel, dt);
      this.audio.update(tel.lever, tel.speed, tel.propInWater);
    } else if (!this.d.busy() && this.d.player.active && this.d.player.ready && !this.d.player.inVehicle) {
      // an icon over the boat you can get into (no text)
      const near = this.nearest(ENTER_DIST);
      if (near) {
        near.getWorldPosition(this.tmp);
        this.tmp.y += 2.6;
        this.d.hud.setMarker(this.d.project(this.tmp), 'boat');
      }
    }
  }

  private nearest(maxDist: number): Boat | null {
    this.d.player.getWorldPosition(this.tmp2);
    let best: Boat | null = null;
    let bd = maxDist;
    for (const b of this.boats) {
      b.getWorldPosition(this.tmp);
      const dd = Math.hypot(this.tmp.x - this.tmp2.x, this.tmp.z - this.tmp2.z);
      if (dd < bd && Math.abs(this.tmp.y - this.tmp2.y) < 4.5) {
        bd = dd;
        best = b;
      }
    }
    return best;
  }

  private enter(b: Boat): void {
    this.skipper = b;
    b.occupied = true;
    b.setEnabled(true);
    b.lever = 0;
    b.seatPlayer(true);
    this.d.player.setInVehicle(true);
    this.d.orbit.setTarget(b, 13, 5, 40);
    this.d.boatHud.show();
    this.audio.start();
  }

  private exit(): void {
    const b = this.skipper!;
    const t = b.telemetry();
    if (Math.abs(t.speed) > EXIT_SPEED) return; // only when (almost) stopped
    // step out on whichever side is dry land (a dock / the shore); otherwise into the water on the left
    const terrain = this.d.boat.terrain;
    const sc = terrain.makeSample();
    let spot: THREE.Vector3 | null = null;
    outer: for (const dist of [1.9, 3.2]) {
      for (const side of [1, -1]) {
        b.sidePosition(side, dist, this.tmp);
        terrain.sample(this.tmp.x, this.tmp.z, sc);
        if (Number.isNaN(sc.water) || sc.h >= sc.water) {
          spot = this.tmp.clone();
          break outer;
        }
      }
    }
    if (!spot) spot = b.sidePosition(1, 1.9, this.tmp).clone();
    terrain.sample(spot.x, spot.z, sc);
    const surface = Number.isNaN(sc.water) ? sc.h : Math.max(sc.h, sc.water);
    spot.y = surface + Config.player.height / 2 + 0.3;
    this.skipper = null;
    b.occupied = false;
    b.seatPlayer(false);
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(spot);
    this.d.orbit.setTarget(this.d.player, Config.orbit.distance, Config.orbit.minDistance, Config.orbit.maxDistance);
    this.d.boatHud.hide();
    this.audio.stop();
  }

  dispose(): void {
    this.audio.dispose();
    for (const b of this.boats) b.dispose();
    this.boats.length = 0;
  }
}
