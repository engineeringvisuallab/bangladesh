import * as THREE from 'three';
import type { PeopleManager } from '../people';
import type { TerrainGenerator } from '../terrain';
import type { Vehicle, VehicleManager } from '../vehicles';
import type { VehicleFx } from '../vehicles/VehicleFx';
import { VehicleFire } from '../vehicles/VehicleFire';
import type { TreeDestruction } from '../vegetation/TreeDestruction';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { CombatEffects } from './CombatEffects';

interface Piece {
  obj: THREE.Object3D;
  w: THREE.Vector3;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  rest: boolean;
}

const LOCAL = new THREE.Vector3();
const SCR = new THREE.Vector3();

export interface ExplosionDeps {
  scene: THREE.Scene;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  people: PeopleManager;
  vehicles: VehicleManager;
  effects: CombatEffects;
  /** Blasts fell the trees around them. */
  trees?: TreeDestruction;
  /** World position of the player's ears (for the loudness of bangs). */
  listener: (out: THREE.Vector3) => THREE.Vector3;
}

/**
 * Everything that blows up or breaks: area explosions (tank shells, helicopter bombs, burning vehicles), fire and smoke
 * puffs, and the pieces that fly off damaged vehicles (they tumble and bounce on the terrain, then disappear).
 * Pooled: nothing is created while playing except the objects handed in as pieces.
 */
export class Explosions implements VehicleFx {
  /** Realistic flames, smoke, embers and burning-vehicle fire (see VehicleFire). */
  private vfire: VehicleFire;
  /** Tells the vehicles that burning (smoke / flames) is simulated here, not by the vehicle itself. */
  readonly managesFire = true;
  private pieces: Piece[] = [];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private lastBang = 0;

  constructor(private d: ExplosionDeps) {
    this.vfire = new VehicleFire({
      scene: d.scene,
      origin: d.origin,
      terrain: d.terrain,
      people: d.people,
      vehicles: d.vehicles,
      audio: () => (this.ensureAudio() && this.ctx && this.master && this.noise ? { ctx: this.ctx, master: this.master, noise: this.noise } : null),
      muted: () => this.muted,
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  // ------------------------------------------------------------------ explosion
  /** Area blast at a WORLD point. `power` = damage to a person standing in the middle (falls off linearly to 0 at `radius`). */
  explode(at: THREE.Vector3, radius: number, power: number, byPlayer: boolean, ignore: Vehicle | null = null): void {
    const { people, vehicles, effects, origin } = this.d;
    origin.toLocal(at, LOCAL);
    effects.impact(LOCAL, 0xff8b28, 24);
    this.vfire.fireball(at, Math.min(2.2, radius / 6) + 0.3);
    this.bang(at, Math.min(2.2, 0.8 + radius / 8));
    if (radius >= 4) this.d.trees?.destroyInRadius(at.x, at.z, radius * 0.9, at.x, at.z);

    for (const p of people.onFoot) {
      if (p.dead) continue;
      const dist = Math.hypot(p.world.x - at.x, p.world.z - at.z);
      if (dist < radius && Math.abs(p.world.y - at.y) < radius * 0.6) people.damage(p, (1 - dist / radius) * power * 2.4, false, byPlayer);
    }
    for (const v of vehicles.vehicles) {
      if (v === ignore || !v.enabled || v.state === 'wrecked') continue;
      v.physWorld(SCR);
      const dx = SCR.x - at.x;
      const dz = SCR.z - at.z;
      const dist = Math.max(0.01, Math.hypot(dx, dz));
      const reach = radius + v.spec.half.z * 0.6;
      if (dist > reach) continue;
      const k = 1 - dist / reach;
      // Overpressure falls off much faster than linearly (about 1/r^2 in the far field), so a car at the edge of the
      // blast is only dented while one next to it is destroyed.
      v.blast(Math.pow(k, 1.6) * power * 1.1, byPlayer);
      // Delta-v = (pressure x frontal area x time) / mass: lighter vehicles are thrown further (~ mass^-1/3), a bigger
      // charge pushes harder (~ power^1/3). The push acts on the side facing the blast, so the vehicle also tips over.
      const lift = Math.min(1.8, Math.max(0.25, Math.cbrt(1250 / v.spec.mass)));
      const charge = power <= 0 ? 0 : Math.cbrt(power / 70);
      v.blastPush(dx / dist, dz / dist, 15 * k * k * lift * charge);
    }
  }

  // ------------------------------------------------------------------ VehicleFx
  smoke(at: THREE.Vector3, strength: number): void {
    this.vfire.smoke(at, strength);
  }

  fire(at: THREE.Vector3): void {
    this.vfire.flame(at);
  }

  crash(at: THREE.Vector3, dv: number): void {
    this.d.origin.toLocal(at, LOCAL);
    this.d.effects.impact(LOCAL, 0xffd27a, Math.min(12, 3 + Math.floor(dv)));
    if (dv > 3.5) this.bang(at, Math.min(0.9, dv / 14), true);
  }

  spawnPiece(obj: THREE.Object3D, velocity: THREE.Vector3, spin: THREE.Vector3, life = 30): void {
    obj.updateWorldMatrix(true, false);
    this.d.scene.attach(obj);
    const o = this.d.origin.origin;
    if (this.pieces.length >= 160) this.dropPiece(0);
    this.pieces.push({ obj, w: new THREE.Vector3(obj.position.x + o.x, obj.position.y, obj.position.z + o.z), v: velocity.clone(), spin: spin.clone(), age: 0, life, rest: false });
  }

  private dropPiece(i: number): void {
    this.pieces[i].obj.removeFromParent();
    this.pieces.splice(i, 1);
  }

  // ------------------------------------------------------------------ internals
  private ensureAudio(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const n = Math.floor(this.ctx.sampleRate * 1.6);
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /** A low boom (explosion) or a short metal bang (crash). Quieter with distance. */
  private bang(at: THREE.Vector3, size: number, metal = false): void {
    if (this.muted || !this.ensureAudio() || !this.ctx || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBang < 0.05) return;
    this.lastBang = now;
    this.d.listener(SCR);
    const dist = Math.hypot(SCR.x - at.x, SCR.z - at.z);
    const vol = size / (1 + dist / 35);
    if (vol < 0.03) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = metal ? 'bandpass' : 'lowpass';
    f.frequency.setValueAtTime(metal ? 1800 : 900, now);
    if (!metal) f.frequency.exponentialRampToValueAtTime(70, now + 1.1);
    const g = this.ctx.createGain();
    const len = metal ? 0.18 : 1.1;
    g.gain.setValueAtTime(Math.min(1.4, vol), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + len);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + len + 0.05);
    if (!metal) {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.frequency.setValueAtTime(90, now);
      o.frequency.exponentialRampToValueAtTime(28, now + 0.6);
      og.gain.setValueAtTime(Math.min(1, vol), now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      o.connect(og);
      og.connect(this.master);
      o.start(now);
      o.stop(now + 0.75);
    }
  }

  update(dt: number): void {
    const o = this.d.origin.origin;
    this.vfire.update(dt);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      if (p.age > p.life) {
        this.dropPiece(i);
        continue;
      }
      if (!p.rest) {
        p.v.y -= 9.81 * dt;
        // air drag on a flat panel: a = -k |v| v (a thin bonnet slows down fast, a heavy part flies on)
        p.v.multiplyScalar(Math.max(0, 1 - 0.012 * p.v.length() * dt));
        p.w.addScaledVector(p.v, dt);
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
        p.obj.rotation.z += p.spin.z * dt;
        const gy = this.d.terrain.heightAt(p.w.x, p.w.z) + 0.15;
        if (p.w.y < gy) {
          p.w.y = gy;
          if (p.v.y < -1.2) {
            p.v.y *= -0.32;
            p.v.x *= 0.7;
            p.v.z *= 0.7;
            p.spin.multiplyScalar(0.6);
          } else {
            p.v.y = 0;
            p.v.x *= 1 - 3 * dt;
            p.v.z *= 1 - 3 * dt;
            p.spin.multiplyScalar(1 - 4 * dt);
            if (Math.hypot(p.v.x, p.v.z) < 0.15) p.rest = true;
          }
        }
      }
      p.obj.position.set(p.w.x - o.x, p.w.y, p.w.z - o.z);
      if (p.age > p.life - 2) p.obj.scale.multiplyScalar(1 - 1.6 * dt); // shrink away at the end
    }
  }

  dispose(): void {
    this.vfire.dispose();
    for (const p of this.pieces) p.obj.removeFromParent();
    this.pieces.length = 0;
    void this.ctx?.close();
  }
}
