import * as THREE from 'three';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { TerrainGenerator } from '../terrain';
import { AISLE_EYE, CAB_EYE, NOSE_X, SEAT_EYE } from '../trains/TrainMesh';
import { pathIndex } from '../trains/TrainRide';
import type { CarPose, Train } from '../trains/TrainSim';
import type { TunnelProbe } from '../trains/TunnelProbe';
import { clamp } from '../utils/math';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { CameraMode } from './CameraController';

/**
 * The camera of a train passenger (C cycles the views):
 *   seat     first person at a window seat of the car, mouse looks around (out of the window, down the saloon)
 *   aisle    first person standing in the aisle
 *   cab      the driver's eyes in the LEADING cab (locomotive or driving trailer): the track, signals and stations ahead
 *   outside  free orbit around the car (wheel zooms); in a tunnel it is kept between the walls
 *   cine     cinematic: slowly circling, low, long-lens "film" camera around the car (the 4K showcase view)
 * Every view is placed from the train's own pose, so it never depends on the physics (no ray pulls the camera into the train any more) and the
 * near plane is short enough to sit inside the saloon.
 */
export type TrainViewMode = 'seat' | 'aisle' | 'cab' | 'outside' | 'cine';
export const TRAIN_VIEWS: readonly TrainViewMode[] = ['seat', 'aisle', 'cab', 'outside', 'cine'];
export const TRAIN_VIEW_NAMES: Record<TrainViewMode, string> = {
  seat: 'জানালার ধারের সিট',
  aisle: 'বগির ভেতরে দাঁড়িয়ে',
  cab: 'ড্রাইভারের কেবিন',
  outside: 'ট্রেনের বাইরে থেকে',
  cine: 'সিনেমাটিক ক্যামেরা',
};

export interface TrainRideRef {
  train: Train;
  /** Physical car index (0 = the locomotive as built) the player rides in. */
  car: number;
}

const LENS: Record<TrainViewMode, { near: number; fov: number }> = {
  seat: { near: 0.15, fov: 72 },
  aisle: { near: 0.15, fov: 72 },
  cab: { near: 0.15, fov: 68 },
  outside: { near: 0.6, fov: 62 },
  cine: { near: 0.6, fov: 44 },
};

const UP = new THREE.Vector3(0, 1, 0);

export class TrainCamera implements CameraMode {
  view: TrainViewMode = 'seat';
  /** Look direction relative to the direction of travel (inside views): yaw (+ = left), pitch (+ = up), radians. */
  yaw = 0;
  pitch = 0;
  /** Orbit (outside / cine): angle round the car from straight behind (+ = to the right), elevation, distance (m). */
  private oyaw = 0.7;
  private opitch = 0.25;
  private odist = 32;
  private t = 0;
  private pose: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
  private nose = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();
  private side = new THREE.Vector3();
  private right = new THREE.Vector3();
  private centre = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private basis = new THREE.Matrix4();
  private base = new THREE.Quaternion();
  private look = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private sc;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private ref: () => TrainRideRef | null,
    private origin: FloatingOrigin,
    private terrain: TerrainGenerator,
    private tunnels: TunnelProbe | null,
  ) {
    this.sc = terrain.makeSample();
  }

  /** Called when the player boards: start at the window seat, looking ahead. */
  reset(): void {
    this.view = 'seat';
    this.yaw = 0;
    this.pitch = 0;
    this.t = 0;
    this.applyLens();
  }

  setView(v: TrainViewMode): void {
    this.view = v;
    this.yaw = 0;
    this.pitch = 0;
    this.applyLens();
  }

  /** Next view of the cycle; returns it. */
  next(): TrainViewMode {
    this.setView(TRAIN_VIEWS[(TRAIN_VIEWS.indexOf(this.view) + 1) % TRAIN_VIEWS.length]);
    return this.view;
  }

  private applyLens(): void {
    const l = LENS[this.view];
    this.camera.near = l.near;
    this.camera.fov = l.fov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const r = this.ref();
    if (!r) return;
    const t = r.train;
    this.t += dt;
    const m = this.input.consumeMouseDelta();
    const wheel = this.input.consumeWheel();
    const k = Config.camera.mouseSensitivity;
    const inside = this.view === 'seat' || this.view === 'aisle' || this.view === 'cab';
    if (inside) {
      this.yaw = Math.atan2(Math.sin(this.yaw - m.x * k), Math.cos(this.yaw - m.x * k));
      this.pitch = clamp(this.pitch - m.y * k, -0.95, 1.15);
    } else {
      this.oyaw -= m.x * k;
      this.opitch = clamp(this.opitch + m.y * k, -0.1, 1.35);
      if (wheel !== 0) this.odist = clamp(this.odist * Math.exp(wheel * 0.0012), 6, 140);
    }

    // frame of the car: nose direction (model +x), up, across, exactly like TrainView
    const j = this.view === 'cab' ? 0 : pathIndex(t, r.car);
    const p = t.carPose(j, this.pose);
    const s = p.flipped ? -1 : 1;
    this.nose.set(p.fx * s, p.fy * s, p.fz * s);
    this.up.copy(UP).addScaledVector(this.nose, -this.nose.y).normalize();
    this.side.crossVectors(this.nose, this.up);
    this.centre.set(p.x - this.origin.origin.x, p.y, p.z - this.origin.origin.z);
    // direction of travel (what the passenger looks at): nose * s
    this.fwd.set(p.fx, p.fy, p.fz);

    if (inside) {
      let ex = 0, ey = AISLE_EYE.y, ez = 0;
      if (this.view === 'seat') {
        ex = -s * SEAT_EYE.x;
        ey = SEAT_EYE.y;
        ez = SEAT_EYE.z;
      } else if (this.view === 'cab') {
        const nose = p.kind === 'loco' ? NOSE_X.loco : NOSE_X.cab;
        ex = s * (nose - CAB_EYE.fromNose);
        ey = CAB_EYE.y;
      }
      this.pos.copy(this.centre).addScaledVector(this.nose, ex).addScaledVector(this.up, ey).addScaledVector(this.side, ez);
      this.camera.position.copy(this.pos);
      // basis: x = right of travel, y = up, z = backwards (the camera looks along -z)
      this.right.crossVectors(this.fwd, this.up).normalize();
      this.basis.makeBasis(this.right, this.up, this.fwd.clone().negate());
      this.base.setFromRotationMatrix(this.basis);
      this.look.setFromEuler(this.euler.set(this.pitch, this.yaw, 0));
      this.camera.quaternion.copy(this.base).multiply(this.look);
      return;
    }

    // ---- outside / cinematic: orbit round the car ----
    let yaw = this.oyaw, pitch = this.opitch, dist = this.odist;
    if (this.view === 'cine') {
      yaw += this.t * 0.11;
      pitch = clamp(0.12 + 0.1 * Math.sin(this.t * 0.13) + (this.opitch - 0.25) * 0.6, 0.03, 0.9);
      dist = this.odist * (1 + 0.28 * Math.sin(this.t * 0.09 + 1.2));
    }
    this.focus.copy(this.centre).addScaledVector(this.up, 2.0);
    const wx = p.x, wz = p.z;
    const inTunnel = this.tunnels?.inside(wx, wz) ?? false;
    if (inTunnel) dist = Math.min(dist, 9);
    // horizontal basis of the travel direction
    const hl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const hx = this.fwd.x / hl, hz = this.fwd.z / hl;
    const cp = Math.cos(pitch);
    let along = -Math.cos(yaw) * cp * dist;
    let across = Math.sin(yaw) * cp * dist;
    let high = Math.sin(pitch) * dist;
    if (inTunnel) {
      // between the walls (centre line to the lining is 5.6 m, the other track is 4.5 m away) and under the roof
      across = clamp(across, -3.4, 3.4);
      high = clamp(high, 0.4, 3.6);
      along = clamp(along, -9, 9);
    }
    this.pos.copy(this.focus);
    this.pos.x += hx * along + -hz * across;
    this.pos.z += hz * along + hx * across;
    this.pos.y += high;
    // never below the ground or the track
    const gx = this.pos.x + this.origin.origin.x, gz = this.pos.z + this.origin.origin.z;
    this.terrain.sample(gx, gz, this.sc);
    const minY = Math.max(p.y + 0.6, inTunnel ? -Infinity : this.sc.h + 1.2);
    if (this.pos.y < minY) this.pos.y = minY;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.focus);
  }
}
