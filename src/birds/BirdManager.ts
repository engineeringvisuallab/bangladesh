import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import { clamp } from '../utils/math';
import { mulberry32 } from '../world/Seed';
import { createBirdGeometry, createBirdMaterial } from './BirdModel';

interface Kind {
  name: string;
  count: [number, number];
  /** Height above the ground (m). */
  alt: [number, number];
  speed: [number, number];
  /** Wingspan in metres (a little bigger than life so they read from afar). */
  size: number;
  rate: [number, number];
  amp: number;
  colors: number[];
  /** Flock radius (m). */
  spread: number;
}

const KINDS: Kind[] = [
  { name: 'crow', count: [6, 12], alt: [30, 70], speed: [9, 12], size: 1.8, rate: [9, 12], amp: 0.45, colors: [0x24272b, 0x2f3338, 0x1b1d20], spread: 14 },
  { name: 'egret', count: [4, 8], alt: [40, 90], speed: [8, 10], size: 2.3, rate: [5, 7], amp: 0.35, colors: [0xf6f6f0, 0xe9ece6], spread: 18 },
  { name: 'swallow', count: [10, 18], alt: [12, 35], speed: [13, 17], size: 1.0, rate: [16, 20], amp: 0.5, colors: [0x27365a, 0x1f2c48, 0x3a3f4a], spread: 10 },
  { name: 'dove', count: [8, 14], alt: [20, 50], speed: [10, 12], size: 1.4, rate: [10, 13], amp: 0.4, colors: [0xb9b2a6, 0xcfc9bd, 0x9d978c], spread: 12 },
];
const FLOCK_KINDS = [0, 1, 2, 3, 0, 1, 2, 3, 0, 3, 2, 1];

/** Flocks wander inside this radius around the player; one that leaves it is moved to the far side. */
const NEAR = 850;
const FAR = 1300;

interface Flock {
  kind: Kind;
  start: number;
  count: number;
  x: number;
  z: number;
  alt: number;
  baseAlt: number;
  heading: number;
  speed: number;
  turn: number;
  seed: number;
  /** Per bird formation offset (x, y, z) in the flock frame + a personal phase. */
  off: Float32Array;
  phase: Float32Array;
}

/**
 * Flying birds: a few flocks (crows, egrets, swallows, doves) that wander over the world around the player.
 * All birds are one InstancedMesh (one draw call); the wing flapping is done in the vertex shader.
 * A flock follows the terrain height (never flies into a hill), turns gently, banks into turns and pitches with climbs.
 * Added to the world root, so matrices use true world coordinates (the floating origin is handled by the root).
 */
export class BirdManager {
  private flocks: Flock[] = [];
  private mesh: THREE.InstancedMesh;
  private uTime = { value: 0 };
  private geo = createBirdGeometry();
  private mat = createBirdMaterial(this.uTime);
  private dummy = new THREE.Object3D();
  private rng: () => number;
  private placed = false;
  readonly total: number;

  constructor(
    private root: THREE.Object3D,
    private terrain: TerrainGenerator,
    seed: number,
  ) {
    this.rng = mulberry32(seed ^ 0x51ed270b);
    const r = this.rng;
    const between = (a: number, b: number) => a + (b - a) * r();

    // build the flocks (counts, colours, formation)
    let n = 0;
    const colors: THREE.Color[] = [];
    const scales: number[] = [];
    const bird: number[] = [];
    for (const ki of FLOCK_KINDS) {
      const kind = KINDS[ki];
      const count = Math.round(between(kind.count[0], kind.count[1]));
      const off = new Float32Array(count * 3);
      const phase = new Float32Array(count);
      const base = new THREE.Color(kind.colors[Math.floor(r() * kind.colors.length)]);
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const rad = Math.sqrt(r()) * kind.spread;
        off[i * 3] = Math.cos(a) * rad;
        off[i * 3 + 1] = (r() - 0.5) * kind.spread * 0.4;
        off[i * 3 + 2] = Math.sin(a) * rad * 1.4;
        phase[i] = r();
        colors.push(base.clone().multiplyScalar(0.85 + r() * 0.3));
        scales.push(kind.size * (0.85 + r() * 0.3));
        bird.push(r() * 6.28, between(kind.rate[0], kind.rate[1]), kind.amp * (0.8 + r() * 0.4));
      }
      this.flocks.push({
        kind, start: n, count, x: 0, z: 0, alt: 0, baseAlt: between(kind.alt[0], kind.alt[1]),
        heading: r() * Math.PI * 2, speed: between(kind.speed[0], kind.speed[1]), turn: 0, seed: r() * 100, off, phase,
      });
      n += count;
    }
    this.total = n;

    this.geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(new Float32Array(bird), 3));
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false; // the instances move all over the world; the geometry bounds say nothing
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, colors[i]);
      this.dummy.scale.setScalar(scales[i]);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    // per-bird scale is kept in the matrix each frame
    this.scales = scales;
    root.add(this.mesh);
  }
  private scales: number[];

  /** Put a flock on a ring around the player, heading roughly across the player's area. */
  private place(f: Flock, fx: number, fz: number, ring: [number, number]): void {
    const a = this.rng() * Math.PI * 2;
    const d = ring[0] + (ring[1] - ring[0]) * this.rng();
    f.x = fx + Math.cos(a) * d;
    f.z = fz + Math.sin(a) * d;
    // face towards the player +- 70 degrees so the flock passes over
    f.heading = Math.atan2(fx - f.x, fz - f.z) + (this.rng() - 0.5) * 2.4;
    f.alt = this.ground(f.x, f.z, f.heading) + f.baseAlt;
  }

  private ground(x: number, z: number, heading: number): number {
    const t = this.terrain;
    // highest ground under the flock and 50 / 110 / 180 m ahead (the flock climbs before the hill arrives)
    const sx = Math.sin(heading);
    const cz = Math.cos(heading);
    let h = Math.max(t.heightAt(x, z), 0);
    for (const a of [50, 110, 180]) h = Math.max(h, t.heightAt(x + sx * a, z + cz * a));
    return h;
  }

  /** Every frame. `focus` = true world position of the player / camera. */
  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.uTime.value = time;
    if (!this.placed) {
      this.placed = true;
      for (const f of this.flocks) this.place(f, focus.x, focus.z, [60, NEAR]);
    }
    const d = this.dummy;
    const e = new THREE.Euler();
    const step = Math.min(dt, 0.1);
    for (const f of this.flocks) {
      // --- flock motion: gentle wander, pulled back towards the player when it strays ---
      let turn = Math.sin(time * 0.13 + f.seed * 7) * 0.1 + Math.sin(time * 0.31 + f.seed * 3) * 0.06;
      const dx = focus.x - f.x;
      const dz = focus.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist > NEAR) {
        const want = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
        turn += clamp(diff, -1, 1) * 0.35;
      }
      f.turn += (turn - f.turn) * Math.min(1, step * 1.5);
      f.heading += f.turn * step;
      f.x += Math.sin(f.heading) * f.speed * step;
      f.z += Math.cos(f.heading) * f.speed * step;
      if (dist > FAR) this.place(f, focus.x, focus.z, [NEAR * 0.8, NEAR]);

      // --- height: follow the terrain with a smooth climb / descent ---
      const target = this.ground(f.x, f.z, f.heading) + f.baseAlt;
      const prevAlt = f.alt;
      f.alt += (target - f.alt) * (1 - Math.exp(-(target > f.alt ? 2.2 : 0.6) * step)); // climbs fast, descends lazily
      const vy = step > 0 ? (f.alt - prevAlt) / step : 0;
      const pitch = clamp(Math.atan2(vy, f.speed), -0.45, 0.45);
      const bank = clamp(-f.turn * 2.4, -0.6, 0.6);
      const ch = Math.cos(f.heading);
      const sh = Math.sin(f.heading);

      for (let i = 0; i < f.count; i++) {
        const p = f.phase[i] * 6.2832;
        const lx = f.off[i * 3] + Math.sin(time * 0.6 + p) * 1.6;
        const ly = f.off[i * 3 + 1] + Math.sin(time * 0.9 + p * 1.7) * 0.8;
        const lz = f.off[i * 3 + 2] + Math.sin(time * 0.4 + p * 1.3) * 2.2;
        d.position.set(f.x + lx * ch + lz * sh, f.alt + ly, f.z - lx * sh + lz * ch);
        e.set(-pitch, f.heading + Math.sin(time * 0.8 + p) * 0.08, bank + Math.sin(time * 1.1 + p * 2) * 0.08, 'YXZ');
        d.quaternion.setFromEuler(e);
        d.scale.setScalar(this.scales[f.start + i]);
        d.updateMatrix();
        this.mesh.setMatrixAt(f.start + i, d.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** For tests / debug: world position of bird i. */
  positionOf(i: number, out: THREE.Vector3): THREE.Vector3 {
    this.mesh.getMatrixAt(i, this.dummy.matrix);
    return out.setFromMatrixPosition(this.dummy.matrix);
  }

  get flockCount(): number {
    return this.flocks.length;
  }

  dispose(): void {
    this.root.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
