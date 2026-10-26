import * as THREE from 'three';
import type { Player } from '../characters';
import type { Helicopter } from '../aircraft/Helicopter';
import type { HelicopterManager } from '../aircraft/HelicopterManager';
import type { Wanted } from '../combat/Wanted';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { TerrainPhysics, TerrainGenerator } from '../terrain';
import type { RoadGraph, RoadPoint } from '../traffic/RoadGraph';
import type { PeopleManager } from './PeopleManager';
import type { Vehicle, DriveInput, VehicleManager } from '../vehicles';
import { SEDAN, JEEP } from '../vehicles';
import { clamp } from '../utils/math';

interface PursuitUnit {
  vehicle: Vehicle;
  input: DriveInput;
  lights: THREE.Group;
  red: THREE.Mesh;
  blue: THREE.Mesh;
  lightMaterials: THREE.MeshLambertMaterial[];
  clearTime: number;
  /** Seconds the car has been (nearly) stationary although it should be driving. */
  stuckTime: number;
  /** Seconds left of the reverse-and-turn manoeuvre that frees a stuck car. */
  reverseTime: number;
}

const V = new THREE.Vector3();
const F = new THREE.Vector3();
const ROAD_POINT: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };

/** GTA-style pursuit layer. Wanted stars spawn marked road vehicles which steer toward the player's current vehicle/person. */
export class PolicePursuitManager {
  private units: PursuitUnit[] = [];
  private spawnTimer = 1.2;
  private stars = 0;
  private sirenClock = 0;
  private audio: AudioContext | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private helis: HelicopterManager | null = null;
  private policeHeli: Helicopter | null = null;
  private heliClearTime = 0;
  private heliSpawnTimer = 0;
  /** The police helicopter's target is refreshed 5 times a second, not 60. */
  private heliAimTimer = 0;

  constructor(private d: {
    graph: RoadGraph;
    vehicles: VehicleManager;
    people: PeopleManager;
    wanted: Wanted;
    terrainPhysics: TerrainPhysics;
    terrain: TerrainGenerator;
    player: Player;
  }) {}

  get count(): number { return this.units.length + (this.policeHeli ? 1 : 0); }

  /** Attach the aircraft manager after Engine has created it. */
  setHelicopters(manager: HelicopterManager): void { this.helis = manager; }

  /** Runs before VehicleManager.fixedUpdate so the chase inputs are consumed by the existing vehicle physics. */
  fixedUpdate(dt: number, target: THREE.Vector3): void {
    for (const unit of this.units) {
      const v = unit.vehicle;
      if (this.stars <= 0) {
        unit.input.throttle = false;
        unit.input.throttleAmt = 0;
        unit.input.brake = true;
        unit.input.brakeAmt = 1;
        unit.input.handbrake = Math.abs(v.forwardSpeed) < 0.6;
        unit.input.steer = 0;
        continue;
      }
      if (v.driver === 'player' || v === this.d.vehicles.driver) continue;
      v.physWorld(V);
      const dx = target.x - V.x;
      const dz = target.z - V.z;
      const dist = Math.hypot(dx, dz);
      v.forwardVector(F);
      const yaw = Math.atan2(F.x, F.z);
      const desired = Math.atan2(dx, dz);
      let delta = desired - yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;

      const input = unit.input;
      input.steer = clamp(delta * 1.75, -1, 1);
      input.handbrake = false;
      input.throttle = false;
      input.brake = false;
      input.throttleAmt = 0;
      input.brakeAmt = 0;

      const speed = v.forwardSpeed;

      // Stuck recovery: a car that is wedged against a wall/tree/guard rail backs out while turning, then tries again.
      if (unit.reverseTime > 0) {
        unit.reverseTime -= dt;
        // S at (almost) standstill drives the car backwards in the vehicle model; steer away from the target while backing out.
        input.steer = delta >= 0 ? -1 : 1;
        input.throttle = false;
        input.throttleAmt = 0;
        input.brake = true;
        input.brakeAmt = 1;
        continue;
      }
      if (dist > 20 && Math.abs(speed) < 0.9) unit.stuckTime += dt; else unit.stuckTime = 0;
      if (unit.stuckTime > 2.5) {
        unit.stuckTime = 0;
        unit.reverseTime = 1.6;
      }

      // Fast response outside the near zone; pull up safely rather than crashing through the target.
      const topSpeed = this.stars >= 4 ? 33 : this.stars >= 2 ? 29 : 25;
      const targetSpeed = dist < 13 ? 0 : dist < 36 ? Math.min(topSpeed, (dist - 9) * 1.25) : topSpeed;
      if (dist >= 13 && speed < targetSpeed - 0.6) {
        input.throttle = true;
        input.throttleAmt = clamp((targetSpeed - speed) / 9, 0.18, 1);
      } else if (speed > targetSpeed + 0.6 || (dist < 13 && speed > 0.7)) {
        input.brake = true;
        input.brakeAmt = clamp((speed - targetSpeed + (dist < 13 ? 3 : 0)) / 8, 0.2, 1);
      } else if (dist < 13 && Math.abs(speed) < 0.8) {
        input.brake = true;
        input.brakeAmt = 1;
      }
    }
    this.updatePoliceHelicopter(dt, target);
    this.updateSiren(dt, this.stars > 0 && (this.units.length > 0 || !!this.policeHeli));
  }

  /** Render-rate lifecycle: spawn/retire patrols, strobe their roof lights and follow wanted stars. */
  update(dt: number, focus: THREE.Vector3, elapsed: number): void {
    this.stars = this.d.wanted.stars;
    const desired = this.desiredUnits(this.stars);
    this.spawnTimer -= dt;

    if (this.stars > 0 && this.units.length < desired && this.spawnTimer <= 0 && this.d.player.active) {
      this.spawnTimer = 2.2;
      this.trySpawn(focus);
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      u.clearTime = this.stars === 0 ? u.clearTime + dt : 0;
      const aliveWanted = this.stars > 0 && i < desired;
      u.vehicle.getWorldPosition(V);
      const distanceFromPlayer = Math.hypot(V.x - focus.x, V.z - focus.z);
      // Replace cars that have been left far behind so the chase remains local as the world streams.
      if (u.clearTime > 9 || (this.stars > 0 && distanceFromPlayer > 235) ||
          (this.stars > 0 && !aliveWanted && this.units.length > desired)) {
        this.removeAt(i);
        continue;
      }
      const phase = Math.floor(elapsed * 7 + i * 0.7) % 2 === 0;
      u.red.visible = phase;
      u.blue.visible = !phase;
    }
  }


  /** Wanted-level aircraft support: one stable police helicopter follows the player's current position. */
  private updatePoliceHelicopter(dt: number, focus: THREE.Vector3): void {
    if (!this.helis) return;
    this.heliSpawnTimer -= dt;
    if (this.stars >= 5 && !this.policeHeli && this.heliSpawnTimer <= 0) {
      this.heliSpawnTimer = 4;
      const angle = Math.random() * Math.PI * 2;
      const x = Math.max(-4700, Math.min(4700, focus.x + Math.cos(angle) * 115));
      const z = Math.max(-4700, Math.min(4700, focus.z + Math.sin(angle) * 115));
      const y = this.d.terrain.heightAt(x, z) + 42;
      this.policeHeli = this.helis.spawn(new THREE.Vector3(x, y, z), Math.atan2(focus.x - x, focus.z - z));
      this.helis.setPolicePursuitTarget(this.policeHeli, new THREE.Vector3(focus.x, this.d.terrain.heightAt(focus.x, focus.z) + 42, focus.z));
      this.heliClearTime = 0;
    }
    if (!this.policeHeli) return;
    if (this.stars < 5) this.heliClearTime += dt; else this.heliClearTime = 0;
    if (this.heliClearTime > 9) {
      this.helis.removePolicePursuit(this.policeHeli);
      this.policeHeli = null;
      return;
    }
    this.heliAimTimer -= dt;
    if (this.heliAimTimer > 0) return;
    this.heliAimTimer = 0.2;
    const x = Math.max(-4700, Math.min(4700, focus.x));
    const z = Math.max(-4700, Math.min(4700, focus.z));
    const y = this.d.terrain.heightAt(x, z) + 42;
    this.helis.movePolicePursuitTarget(this.policeHeli, x, y, z);
  }

  private desiredUnits(stars: number): number {
    if (stars <= 0) return 0;
    if (stars <= 4) return 1;
    return 2;
  }

  private trySpawn(focus: THREE.Vector3): void {
    const graph = this.d.graph;
    const maxRing = Math.min(155, PhysicsConfig.activeRadius * 0.88);
    for (let attempt = 0; attempt < 16; attempt++) {
      const spot = graph.randomSpotInRing(focus.x, focus.z, 65, maxRing, Math.random);
      if (!spot) return;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const road = graph.roads[spot.roadId];
      if (spot.s < 8 || spot.s > road.length - 12 || graph.onBridge(spot.roadId, spot.s)) continue;
      graph.at(spot.roadId, spot.s, dir, graph.laneOffset(spot.roadId), ROAD_POINT);
      if (!this.d.terrainPhysics.hasColliderAt(ROAD_POINT.x, ROAD_POINT.z)) continue;
      if (Math.hypot(ROAD_POINT.x - focus.x, ROAD_POINT.z - focus.z) < 48) continue;
      let crowded = false;
      for (const existing of this.d.vehicles.vehicles) {
        existing.physWorld(V);
        if (Math.hypot(V.x - ROAD_POINT.x, V.z - ROAD_POINT.z) < 20) { crowded = true; break; }
      }
      if (crowded) continue;

      const spawn = new THREE.Vector3(ROAD_POINT.x, ROAD_POINT.y + 1.0, ROAD_POINT.z);
      const yaw = Math.atan2(ROAD_POINT.hx, ROAD_POINT.hz);
      const driver = this.d.people.createPoliceDriver();
      const spec = this.stars >= 5 && Math.random() < 0.25 ? JEEP : SEDAN;
      const vehicle = this.d.vehicles.spawn(spec, spawn, yaw, driver, 0xf2f1e8);
      vehicle.policeVehicle = true;
      vehicle.setEnabled(true);
      const input: DriveInput = { throttle: false, brake: true, steer: 0, handbrake: false, throttleAmt: 0, brakeAmt: 1 };
      vehicle.tourInput = input;
      const visuals = this.makeLights(vehicle);
      this.units.push({ vehicle, input, ...visuals, clearTime: 0, stuckTime: 0, reverseTime: 0 });
      return;
    }
  }

  private makeLights(vehicle: Vehicle): Pick<PursuitUnit, 'lights' | 'red' | 'blue' | 'lightMaterials'> {
    const g = new THREE.Group();
    g.name = 'police-roof-lights';
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x20272c });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xc00000, emissiveIntensity: 1.6 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x177dff, emissive: 0x0047c7, emissiveIntensity: 1.6 });
    const roofY = vehicle.spec.id === 'jeep' ? 1.10 : 0.84;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.24), frameMat);
    bar.position.set(0, roofY, -0.24);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.13, 0.22), redMat);
    red.position.set(0.17, roofY + 0.07, -0.24);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.13, 0.22), blueMat);
    blue.position.set(-0.17, roofY + 0.07, -0.24);
    const navy = new THREE.MeshLambertMaterial({ color: 0x172c50 });
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 1.9), navy);
    stripeL.position.set(0.91, 0.08, 0.0);
    const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 1.9), navy);
    stripeR.position.set(-0.91, 0.08, 0.0);
    g.add(bar, red, blue, stripeL, stripeR);
    for (const m of [bar, red, blue, stripeL, stripeR]) m.castShadow = true;
    vehicle.model.root.add(g);
    return { lights: g, red, blue, lightMaterials: [frameMat, redMat, blueMat, navy] };
  }

  private removeAt(i: number): void {
    const unit = this.units[i];
    this.units.splice(i, 1);
    unit.vehicle.tourInput = null;
    unit.lights.removeFromParent();
    for (const child of unit.lights.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    }
    for (const m of unit.lightMaterials) m.dispose();
    const driver = this.d.vehicles.remove(unit.vehicle);
    if (driver && driver !== 'player') this.d.people.dispose(driver);
  }

  private updateSiren(dt: number, active: boolean): void {
    // Optional synthesized siren; if browser audio is unavailable, visual light bars still work.
    this.sirenClock += dt;
    try {
      if (!this.audio && active && typeof AudioContext !== 'undefined') {
        this.audio = new AudioContext();
        this.sirenOsc = this.audio.createOscillator();
        this.sirenGain = this.audio.createGain();
        this.sirenOsc.type = 'sawtooth';
        this.sirenOsc.frequency.value = 650;
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain).connect(this.audio.destination);
        this.sirenOsc.start();
      }
      if (this.audio && this.sirenOsc && this.sirenGain) {
        if (this.audio.state === 'suspended' && active) void this.audio.resume();
        const now = this.audio.currentTime;
        const wave = 0.5 + 0.5 * Math.sin(this.sirenClock * 5.2);
        this.sirenOsc.frequency.setTargetAtTime(560 + wave * 360, now, 0.07);
        this.sirenGain.gain.setTargetAtTime(active ? 0.018 : 0, now, 0.18);
      }
    } catch {
      // Browser privacy/audio policies are allowed to disable the synthesized siren.
    }
  }

  dispose(): void {
    for (let i = this.units.length - 1; i >= 0; i--) this.removeAt(i);
    if (this.policeHeli && this.helis) this.helis.removePolicePursuit(this.policeHeli);
    this.policeHeli = null;
    try { this.sirenOsc?.stop(); } catch { /* already stopped */ }
    this.sirenOsc?.disconnect();
    this.sirenGain?.disconnect();
    if (this.audio) void this.audio.close();
    this.audio = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }
}
