import * as THREE from 'three';

const COUNT = 32;
const LIFE = 2.4;

/**
 * Foam trail behind the propeller: a pool of flat white discs that grow and fade on the water surface.
 * They live in the scene (not on the boat) so they stay behind while it moves on.
 */
export class BoatWake {
  private geo = new THREE.CircleGeometry(1, 14);
  private puffs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; size: number; alive: boolean }[] = [];
  private cursor = 0;
  private timer = 0;

  constructor(private scene: THREE.Scene) {
    this.geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.puffs.push({ mesh, mat, age: LIFE, size: 1, alive: false });
    }
  }

  /** `at` = a point just behind the propeller (local coordinates), `y` = water surface height. */
  update(dt: number, at: THREE.Vector3, y: number, speed: number, churning: boolean): void {
    this.timer += dt;
    const every = Math.max(0.05, 0.14 - speed * 0.006);
    if (churning && speed > 1.2 && this.timer >= every) {
      this.timer = 0;
      const p = this.puffs[this.cursor];
      this.cursor = (this.cursor + 1) % COUNT;
      p.alive = true;
      p.age = 0;
      p.size = 0.5 + Math.min(1.2, speed * 0.06);
      p.mesh.position.set(at.x + (Math.random() - 0.5) * 0.5, y + 0.04, at.z + (Math.random() - 0.5) * 0.5);
      p.mesh.visible = true;
    }
    for (const p of this.puffs) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= LIFE) {
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }
      const k = p.age / LIFE;
      p.mesh.scale.setScalar(p.size * (1 + k * 2.6));
      p.mat.opacity = 0.5 * (1 - k) * Math.min(1, speed / 6 + 0.3);
    }
  }

  /** Floating origin moved. */
  shift(dx: number, dz: number): void {
    for (const p of this.puffs) {
      p.mesh.position.x -= dx;
      p.mesh.position.z -= dz;
    }
  }

  dispose(): void {
    for (const p of this.puffs) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this.geo.dispose();
  }
}
