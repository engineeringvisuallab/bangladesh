import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 8, 6);
const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false });
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffc860, fog: false });

interface Bit {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/** Bullet tracers, muzzle flashes and little puffs where a bullet hits. All positions are floating-origin LOCAL. Pooled: nothing is created while playing. */
export class CombatEffects {
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private flashes: { mesh: THREE.Mesh; life: number }[] = [];
  private bits: Bit[] = [];
  private nextTracer = 0;
  private nextFlash = 0;
  private nextBit = 0;
  private mats = new Map<number, THREE.MeshBasicMaterial>();
  private a = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(BOX, TRACER_MAT);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(SPHERE, FLASH_MAT);
      m.visible = false;
      scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(BOX, this.mat(0x8a7a5a));
      m.visible = false;
      m.scale.setScalar(0.07);
      scene.add(m);
      this.bits.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }
  }

  private mat(c: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(c);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: c });
      this.mats.set(c, m);
    }
    return m;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers[this.nextTracer++ % this.tracers.length];
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(0.025, 0.025, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.life = 0.06;
  }

  muzzleFlash(at: THREE.Vector3): void {
    const f = this.flashes[this.nextFlash++ % this.flashes.length];
    f.mesh.position.copy(at);
    f.mesh.scale.setScalar(0.1 + Math.random() * 0.06);
    f.mesh.visible = true;
    f.life = 0.045;
  }

  /** Dust / sparks where a bullet hits the ground or a car. */
  impact(at: THREE.Vector3, color = 0x9a8a68, count = 5): void {
    this.burst(at, color, count, 2.2, 0.35);
  }

  /** A short red puff where a person is hit (no gore). */
  hitPuff(at: THREE.Vector3): void {
    this.burst(at, 0x9b2529, 7, 1.75, 0.34);
  }

  private burst(at: THREE.Vector3, color: number, n: number, speed: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const b = this.bits[this.nextBit++ % this.bits.length];
      b.mesh.material = this.mat(color);
      b.mesh.position.copy(at);
      b.vx = (Math.random() - 0.5) * speed;
      b.vy = Math.random() * speed * 0.9;
      b.vz = (Math.random() - 0.5) * speed;
      b.life = life * (0.6 + Math.random() * 0.6);
      b.mesh.visible = true;
    }
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      if (f.life <= 0) f.mesh.visible = false;
    }
    for (const b of this.bits) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      b.vy -= 9.8 * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
    }
  }

  /** Floating origin moved: everything alive shifts with it. */
  shift(dx: number, dz: number): void {
    for (const t of this.tracers) { t.mesh.position.x -= dx; t.mesh.position.z -= dz; }
    for (const f of this.flashes) { f.mesh.position.x -= dx; f.mesh.position.z -= dz; }
    for (const b of this.bits) { b.mesh.position.x -= dx; b.mesh.position.z -= dz; }
  }

  dispose(): void {
    for (const t of this.tracers) t.mesh.removeFromParent();
    for (const f of this.flashes) f.mesh.removeFromParent();
    for (const b of this.bits) b.mesh.removeFromParent();
    this.mats.forEach((m) => m.dispose());
    void this.a;
  }
}
