import * as THREE from 'three';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { clamp } from '../utils/math';
import type { CameraMode } from './CameraController';

/** What the driver's-eye camera needs from a vehicle. */
export interface DriverEyeSource {
  /** The driver's eye position (scene-local) and the orientation of the vehicle (its nose is +Z). False when there is no eye. */
  driverEye(pos: THREE.Vector3, quat: THREE.Quaternion): boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * First-person camera at the real position of the driver's eyes (P while driving).
 * It rides with the vehicle (it pitches and rolls with it); the mouse looks around inside the cabin and, when the mouse rests,
 * the view eases back to straight ahead.
 */
export class DriverCamera implements CameraMode {
  /** Look direction relative to the vehicle: yaw (+ = left) and pitch (+ = up), radians. */
  yaw = 0;
  pitch = 0;
  private idle = 0;
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private look = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /** The camera looks along -Z, the vehicle's nose is +Z. */
  private flip = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private source: () => DriverEyeSource | null,
  ) {}

  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.idle = 0;
  }

  update(dt: number): void {
    const m = this.input.consumeMouseDelta();
    this.input.consumeWheel();
    const k = Config.camera.mouseSensitivity;
    this.yaw = clamp(this.yaw - m.x * k, -2.2, 2.2);
    this.pitch = clamp(this.pitch - m.y * k, -0.7, 0.95);
    if (Math.abs(m.x) + Math.abs(m.y) > 0.5) this.idle = 0;
    else this.idle += dt;
    if (this.idle > 2) {
      const e = 1 - Math.exp(-1.5 * dt);
      this.yaw -= this.yaw * e;
      this.pitch -= this.pitch * e;
    }
    const v = this.source();
    if (!v || !v.driverEye(this.pos, this.quat)) return;
    this.camera.position.copy(this.pos);
    this.look.setFromEuler(this.euler.set(this.pitch, this.yaw, 0));
    this.camera.quaternion.copy(this.quat).multiply(this.flip).multiply(this.look);
  }
}
