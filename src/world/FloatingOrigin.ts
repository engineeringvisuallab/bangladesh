import * as THREE from 'three';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';

/**
 * Floating origin: avoids float32 jitter far from (0,0).
 *
 * - The true (double precision) position of anything is  world = origin + local.
 * - The camera always stays close to the scene origin (|x|,|z| < threshold).
 * - All world objects live under `root`, positioned with ABSOLUTE world coordinates.
 *   `root.position = -origin`, so the GPU only ever sees small numbers.
 * - When the camera strays too far, we move `origin` to the camera and emit 'origin:shift'.
 *   Rapier is float32, so PhysicsWorld listens and shifts every body by (-dx, -dz).
 * Only x and z are shifted; the world is only 1.5 km tall, y needs no shifting.
 */
export class FloatingOrigin {
  readonly origin = new THREE.Vector3();

  constructor(
    private root: THREE.Object3D,
    private bus: Bus,
  ) {}

  update(camera: THREE.Object3D): void {
    const p = camera.position;
    const t = Config.floatingOrigin.threshold;
    if (Math.abs(p.x) <= t && Math.abs(p.z) <= t) return;

    const dx = p.x;
    const dz = p.z;
    this.origin.x += dx;
    this.origin.z += dz;
    p.x -= dx;
    p.z -= dz;
    this.root.position.set(-this.origin.x, 0, -this.origin.z);
    this.bus.emit('origin:shift', { dx, dz, origin: this.origin.clone() });
  }

  toWorld(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(local.x + this.origin.x, local.y, local.z + this.origin.z);
  }

  toLocal(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(world.x - this.origin.x, world.y, world.z - this.origin.z);
  }
}
