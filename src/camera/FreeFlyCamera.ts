import * as THREE from 'three';
import { Config } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import { clamp } from '../utils/math';
import type { CameraMode } from './CameraController';

/** Debug free-fly camera: WASD + mouse look. */
export class FreeFlyCamera implements CameraMode {
  yaw = 0;
  pitch = Config.camera.startPitch;
  speed = Config.camera.baseSpeed;

  private velocity = new THREE.Vector3();
  private target = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
  ) {}

  update(dt: number): void {
    const c = Config.camera;

    // --- look ---
    const m = this.input.consumeMouseDelta();
    this.yaw -= m.x * c.mouseSensitivity;
    this.pitch = clamp(this.pitch - m.y * c.mouseSensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    // --- mouse wheel changes base speed ---
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.speed = clamp(this.speed * Math.exp(-wheel * 0.001), c.minSpeed, c.maxSpeed);

    // --- move ---
    const k = (code: string) => (this.input.isDown(code) ? 1 : 0);
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

    this.target.set(0, 0, 0);
    this.target.addScaledVector(this.forward, k('KeyW') - k('KeyS'));
    this.target.addScaledVector(this.right, k('KeyD') - k('KeyA'));
    this.target.y += k('Space') + k('KeyE') - k('KeyQ') - k('KeyC');
    if (this.target.lengthSq() > 0) this.target.normalize();

    const boost = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') ? c.boostMultiplier : 1;
    this.target.multiplyScalar(this.speed * boost);

    // Smooth acceleration
    this.velocity.lerp(this.target, 1 - Math.exp(-12 * dt));
    this.camera.position.addScaledVector(this.velocity, dt);
  }
}
