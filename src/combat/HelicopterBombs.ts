import * as THREE from 'three';
import type { InputManager } from '../input/InputManager';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain';
import type { PeopleManager } from '../people';
import type { VehicleManager } from '../vehicles';
import type { CombatEffects } from './CombatEffects';
import type { Helicopter } from '../aircraft/Helicopter';
import type { Explosions } from './Explosions';

interface Bomb {
  world: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Group;
}

const WORLD = new THREE.Vector3();
const LOCAL = new THREE.Vector3();
const SCRATCH = new THREE.Vector3();

/** Game-only helicopter bomb projectiles with a bounded lifetime, collision against terrain/water, and stylized impact effects. */
export class HelicopterBombs {
  private bombs: Bomb[] = [];
  private sample: ReturnType<TerrainGenerator['makeSample']>;
  private cooldown = 0;
  private readonly bodyGeo = new THREE.SphereGeometry(0.22, 10, 8);
  private readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0x20272b, metalness: 0.52, roughness: 0.46 });
  private readonly bandGeo = new THREE.TorusGeometry(0.19, 0.055, 6, 12);
  private readonly bandMat = new THREE.MeshStandardMaterial({ color: 0xd98228, metalness: 0.25, roughness: 0.55 });

  constructor(private d: {
    scene: THREE.Scene;
    input: InputManager;
    origin: FloatingOrigin;
    terrain: TerrainGenerator;
    people: PeopleManager;
    vehicles: VehicleManager;
    effects: CombatEffects;
    /** Real blast (vehicles burn and blow up, fire + smoke + sound). */
    explosions?: Explosions;
    getPilot: () => Helicopter | null;
  }) {
    this.sample = d.terrain.makeSample();
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pilot = this.d.getPilot();
    if (pilot && this.d.input.wasPressed('KeyZ') && this.cooldown <= 0) {
      this.cooldown = 0.65;
      this.drop(pilot);
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.velocity.y -= 17.0 * dt;
      b.world.addScaledVector(b.velocity, dt);
      this.d.origin.toLocal(b.world, b.mesh.position);
      b.mesh.rotation.x += 3.5 * dt;
      b.mesh.rotation.z += 2.2 * dt;
      this.d.terrain.sample(b.world.x, b.world.z, this.sample);
      const terrainY = this.d.terrain.heightAt(b.world.x, b.world.z);
      const surfaceY = Number.isNaN(this.sample.water) ? terrainY : Math.max(terrainY, this.sample.water);
      if (b.world.y <= surfaceY + 0.18 || b.world.y < terrainY - 30) {
        this.explode(b.world);
        b.mesh.removeFromParent();
        this.bombs.splice(i, 1);
      }
    }
  }

  private drop(heli: Helicopter): void {
    if (this.bombs.length >= 12) return;
    heli.getWorldPosition(WORLD);
    const t = heli.telemetry();
    const yaw = t.heading * Math.PI / 180;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.castShadow = true;
    group.add(body);
    const band = new THREE.Mesh(this.bandGeo, this.bandMat);
    band.rotation.x = Math.PI / 2;
    group.add(band);
    this.d.scene.add(group);
    const velocity = new THREE.Vector3(Math.sin(yaw) * Math.min(t.speed, 26) * 0.72, Math.max(-2, t.vz * 0.25), -Math.cos(yaw) * Math.min(t.speed, 26) * 0.72);
    const world = new THREE.Vector3(WORLD.x, WORLD.y - 1.6, WORLD.z);
    this.d.origin.toLocal(world, group.position);
    this.bombs.push({ world, velocity, mesh: group });
  }

  private explode(at: THREE.Vector3): void {
    if (this.d.explosions) {
      this.d.explosions.explode(at, 14, 70, true);
      return;
    }
    this.d.origin.toLocal(at, LOCAL);
    this.d.effects.impact(LOCAL, 0xff8b28, 26);
    // A short, stylized red impact puff represents damage without graphic gore.
    this.d.effects.hitPuff(LOCAL);
    const radius = 13.5;
    for (const person of this.d.people.onFoot) {
      if (person.dead) continue;
      const dist = Math.hypot(person.world.x - at.x, person.world.z - at.z);
      if (dist < radius && Math.abs(person.world.y - at.y) < 7) this.d.people.damage(person, (1 - dist / radius) * 150, false, true);
    }
    for (const vehicle of this.d.vehicles.vehicles) {
      if (!vehicle.enabled) continue;
      vehicle.getWorldPosition(SCRATCH);
      const dx = SCRATCH.x - at.x, dz = SCRATCH.z - at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dist < 0.01) continue;
      const strength = (1 - dist / radius) * 18;
      vehicle.body.applyImpulse({ x: dx / dist * strength, y: Math.max(1.5, strength * 0.24), z: dz / dist * strength }, true);
    }
  }

  dispose(): void {
    for (const b of this.bombs) b.mesh.removeFromParent();
    this.bombs.length = 0;
    this.bodyGeo.dispose(); this.bandGeo.dispose(); this.bodyMat.dispose(); this.bandMat.dispose();
  }
}
