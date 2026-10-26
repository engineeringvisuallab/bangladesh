import * as THREE from 'three';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { InputManager } from '../input/InputManager';
import type { PeopleManager } from '../people';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainGenerator } from '../terrain';
import type { Vehicle, VehicleManager } from '../vehicles';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { Explosions } from './Explosions';

interface Shell {
  world: THREE.Vector3;
  vel: THREE.Vector3;
  mesh: THREE.Mesh;
  trail: number;
  life: number;
}

const SPEED = 140;
const RELOAD = 2.4;
const BLAST_RADIUS = 11;
const BLAST_POWER = 120;
const GRAV = 9.81;
const V = new THREE.Vector3();
const MUZ = new THREE.Vector3();
const DIR = new THREE.Vector3();
const AIM = new THREE.Vector3();
const PREV = new THREE.Vector3();

/**
 * The war tank's cannon. While the player drives the tank the turret follows the crosshair; the left mouse button
 * (or the on-screen fire button) fires a shell: it flies fast with a little drop, and blows up on the first terrain,
 * vehicle or person it meets. The blast destroys vehicles and kills people (Explosions).
 */
export class TankCannon {
  private shells: Shell[] = [];
  private cooldown = 0;
  private geo = new THREE.SphereGeometry(0.2, 8, 6);
  private mat = new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false });
  private badge = document.createElement('div');
  private lastText = '';

  constructor(private d: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    input: InputManager;
    orbit: OrbitCamera;
    physics: PhysicsWorld;
    origin: FloatingOrigin;
    terrain: TerrainGenerator;
    people: PeopleManager;
    vehicles: VehicleManager;
    explosions: Explosions;
  }) {
    Object.assign(this.badge.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: '60', padding: '9px 16px',
      borderRadius: '10px', border: '1px solid rgba(255,255,255,.35)', background: 'rgba(12,24,34,.88)', color: '#fff',
      font: '700 15px sans-serif', pointerEvents: 'none', display: 'none',
    });
    document.body.appendChild(this.badge);
  }

  /** Every frame. `active` = gameplay running (mouse captured / touch). */
  update(dt: number, active: boolean): void {
    const tank = this.d.vehicles.playerTank;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateShells(dt);
    if (!tank || !active) {
      this.setBadge(null);
      return;
    }
    // where the crosshair points: first thing along the camera ray, else far away
    const { camera, physics, origin } = this.d;
    camera.getWorldDirection(DIR);
    const ray = new physics.RAPIER.Ray(camera.position, DIR);
    const hit = physics.world.castRay(ray, 600, true, undefined, undefined, undefined, tank.body);
    const t = hit ? hit.timeOfImpact : 400;
    AIM.copy(camera.position).addScaledVector(DIR, Math.max(t, 15));
    tank.aimTurret(dt, AIM);
    void origin;

    const ready = this.cooldown <= 0;
    this.setBadge(ready ? '🎯 কামান প্রস্তুত — বাম মাউস: গোলা ছুড়ুন' : `⏳ কামানে গোলা ভরা হচ্ছে… ${this.cooldown.toFixed(1)}s`);
    if (ready && (this.d.input.wasPressed('Mouse0') || this.d.input.isDown('Mouse0'))) this.fire(tank);
  }

  private setBadge(text: string | null): void {
    const t = text ?? '';
    if (t === this.lastText) return;
    this.lastText = t;
    this.badge.textContent = t;
    this.badge.style.display = text ? 'block' : 'none';
  }

  private fire(tank: Vehicle): void {
    if (!tank.muzzle(MUZ, DIR)) return;
    this.cooldown = RELOAD;
    const o = this.d.origin;
    const mesh = new THREE.Mesh(this.geo, this.mat);
    this.d.scene.add(mesh);
    const world = o.toWorld(MUZ, new THREE.Vector3());
    this.shells.push({ world, vel: DIR.clone().multiplyScalar(SPEED), mesh, trail: 0, life: 8 });
    // muzzle blast + recoil
    this.d.explosions.smoke(world, 2);
    this.d.explosions.fire(world);
    this.d.explosions.crash(world, 12);
    const m = tank.spec.mass * 0.25;
    tank.kick(-DIR.x * m, 0, -DIR.z * m);
    this.d.explosions.explode(world.clone().addScaledVector(DIR, 3), 1.5, 0, true, tank); // flash and bang only
  }

  private updateShells(dt: number): void {
    const { physics, origin, terrain, people, vehicles } = this.d;
    const R = physics.RAPIER;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      PREV.copy(s.world);
      s.vel.y -= GRAV * dt;
      s.world.addScaledVector(s.vel, dt);
      s.life -= dt;
      const seg = V.copy(s.world).sub(PREV);
      const len = seg.length();
      let hitAt: THREE.Vector3 | null = null;
      if (len > 1e-4) {
        seg.divideScalar(len);
        const a = origin.toLocal(PREV, new THREE.Vector3());
        const owner = vehicles.playerTank?.body ?? undefined;
        const wh = physics.world.castRay(new R.Ray(a, seg), len, true, undefined, undefined, undefined, owner);
        let t = wh ? wh.timeOfImpact : Infinity;
        const ph = people.rayHit(a.x, a.y, a.z, seg.x, seg.y, seg.z, Math.min(t, len));
        if (ph) t = Math.min(t, ph.t);
        if (t <= len) hitAt = new THREE.Vector3().copy(PREV).addScaledVector(seg, t);
      }
      const gy = terrain.heightAt(s.world.x, s.world.z);
      if (!hitAt && s.world.y <= gy + 0.1) hitAt = new THREE.Vector3(s.world.x, gy + 0.2, s.world.z);
      if (hitAt || s.life <= 0) {
        s.mesh.removeFromParent();
        this.shells.splice(i, 1);
        if (hitAt) this.d.explosions.explode(hitAt, BLAST_RADIUS, BLAST_POWER, true);
        continue;
      }
      origin.toLocal(s.world, s.mesh.position);
      s.mesh.scale.set(1, 1, 3);
      s.mesh.lookAt(origin.toLocal(PREV.copy(s.world).add(s.vel), V));
      s.trail -= dt;
      if (s.trail <= 0) {
        s.trail = 0.03;
        this.d.explosions.smoke(s.world, 0.4);
      }
    }
  }

  dispose(): void {
    for (const s of this.shells) s.mesh.removeFromParent();
    this.shells.length = 0;
    this.geo.dispose();
    this.mat.dispose();
    this.badge.remove();
  }
}
