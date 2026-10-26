import * as THREE from 'three';

const POOL = 8;
const LIFE = 1.5;

/** Expanding foam rings on the water surface (a body falls in, a big splash). Positions are absolute world metres. */
export class SplashRings {
  private geo = new THREE.RingGeometry(0.72, 1, 40);
  private rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; delay: number; size: number; alive: boolean }[] = [];
  private cursor = 0;

  constructor(root: THREE.Object3D) {
    this.geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      root.add(mesh);
      this.rings.push({ mesh, mat, age: LIFE, delay: 0, size: 1, alive: false });
    }
  }

  trigger(x: number, y: number, z: number, strength: number): void {
    for (let k = 0; k < 2; k++) {
      const r = this.rings[this.cursor];
      this.cursor = (this.cursor + 1) % POOL;
      r.alive = true;
      r.age = 0;
      r.delay = k * 0.14;
      r.size = 1.8 + strength * 3.2 + k * 0.8;
      r.mesh.position.set(x, y + 0.06, z);
      r.mesh.scale.setScalar(0.3);
      r.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.alive) continue;
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.age += dt;
      const k = r.age / LIFE;
      if (k >= 1) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      r.mesh.scale.setScalar(0.3 + r.size * (1 - Math.pow(1 - k, 2.2)));
      r.mat.opacity = 0.75 * (1 - k) * Math.min(1, k * 8);
    }
  }

  dispose(): void {
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      r.mat.dispose();
    }
    this.geo.dispose();
  }
}
