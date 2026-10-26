import * as THREE from 'three';
import type { Player } from '../characters';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain';
import type { Obstacle } from '../traffic/AIDriver';
import type { RoadGraph, RoadPoint } from '../traffic/RoadGraph';
import type { VehicleManager } from '../vehicles';
import { Config } from '../core/Config';
import { Person } from './Person';
import type { RailNetwork } from '../rail/RailNetwork';
import { stationAccesses, type StationAccess } from '../rail/StationAccess';
import { alightSpot } from '../trains/TrainRide';
import { CONSIST } from '../trains/TrainConfig';
import type { TrainManager } from '../trains/TrainManager';
import type { Train } from '../trains/TrainSim';
import { randomAppearance, type Appearance } from './PersonModel';
import { rayVsPerson } from '../combat/Hit';
import { weaponSpec, type WeaponId } from '../combat/Weapons';
import type { CombatHooks } from '../combat/CombatHooks';

const POLICE_LOOK: Appearance = {
  skin: 0xb87a56, hair: 0x111111, shirt: 0x2a4a86, pants: 0x14213d, shoes: 0x101010,
  scale: 1.02, headwear: 'cap', headwearColor: 0x14213d, vest: false,
};

export interface PeopleDeps {
  scene: THREE.Scene;
  terrain: TerrainGenerator;
  origin: FloatingOrigin;
  graph: RoadGraph;
  vehicles: VehicleManager;
  player: Player;
}

const STATION_CLEAR = 16;
/** Chance that somebody who has finished standing around goes to a railway station, how near (m) a station stair must be, and how many people may stand on one platform side. */
const STATION_SHARE = 0.35;
const STATION_RANGE = 450;
const tmpPt: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };

/**
 * Everybody who is not sitting in a vehicle: people walking along the road edges, people wandering around the
 * city zones, people who just got thrown out of a car. People are cheap (no physics body): they are snapped to
 * the ground and the cars brake for them. They appear around the player and disappear far away.
 * Drivers are people too - TrafficManager makes them (createPerson) and they live inside their vehicle.
 */
export class PeopleManager {
  /** People on foot. */
  readonly onFoot: Person[] = [];
  private spawnTimer = 0;
  private policeTimer = 0;
  /** Guns, wanted level, effects (set by the Engine; without it nobody has a gun - the old behaviour). */
  private combat: CombatHooks | null = null;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private sc;
  private tmpV = new THREE.Vector3();
  /** Railway stations: the stairs people use, the trains they board / leave (null until the Engine calls setStations). */
  private st: { rail: RailNetwork; trains: TrainManager; accesses: StationAccess[] } | null = null;
  private focusX = 0;
  private focusZ = 0;

  constructor(private d: PeopleDeps) {
    this.sc = d.terrain.makeSample();
  }

  /** People walk to the stations: up the stairs, wait on the platform and board the standing trains; people who step out of a train walk down. */
  setStations(rail: RailNetwork, trains: TrainManager): void {
    this.st = { rail, trains, accesses: stationAccesses(rail, (x, z) => this.d.terrain.heightAt(x, z)) };
    trains.fleet.listeners.push((n) => {
      if (n.kind === 'arrive') this.alight(n.train);
    });
  }

  get count(): number {
    return this.onFoot.length;
  }

  setCombat(h: CombatHooks): void {
    this.combat = h;
  }

  /** People who are alive (bodies on the ground do not count). */
  private get aliveCount(): number {
    let n = 0;
    for (const p of this.onFoot) if (p.role !== 'police' && !p.dead && !p.worker) n++;
    return n;
  }

  /** A new person who is not in the world yet (a driver, or a pedestrian about to be placed). */
  createPerson(): Person {
    return new Person(randomAppearance(Math.random));
  }

  /** A separate seated driver used by police pursuit vehicles (not added to the pedestrian population). */
  createPoliceDriver(): Person {
    const p = new Person({ ...POLICE_LOOK, skin: Math.random() < 0.5 ? 0xb87a56 : 0x9a6642 });
    p.role = 'police';
    p.weapon = 'smg';
    p.model.setGun('smg');
    return p;
  }

  /** Put a person on the ground at a world position (thrown out of a car, or freshly spawned). */
  adopt(p: Person, world: THREE.Vector3, task: 'idle' | 'flee' | 'wander' | 'sidewalk' | 'station' | 'work'): void {
    p.vehicle = null;
    p.world.copy(world);
    p.task = task;
    p.timer = task === 'flee' ? 4 + Math.random() * 2 : 0;
    p.model.setSeated(false);
    p.model.root.scale.setScalar(p.model.look.scale);
    p.model.root.rotation.set(0, p.heading, 0);
    this.d.scene.add(p.model.root);
    this.onFoot.push(p);
    this.place(p);
  }

  /** Person leaves the world for good (also called for the driver of a removed car). */
  dispose(p: Person): void {
    p.model.root.removeFromParent();
    const i = this.onFoot.indexOf(p);
    if (i >= 0) this.onFoot.splice(i, 1);
  }

  /** Every person on foot (and the player, if walking) as something a driver must not hit. */
  collectObstacles(out: Obstacle[]): void {
    for (const p of this.onFoot) {
      if (p.dead) continue;
      out.push({ x: p.world.x, z: p.world.z, vx: Math.sin(p.heading) * p.speed, vz: Math.cos(p.heading) * p.speed, r: 0.45, kind: 'person', ref: p });
    }
    const pl = this.d.player;
    if (pl.active && !pl.inVehicle) {
      pl.getWorldPosition(this.tmpV);
      out.push({ x: this.tmpV.x, z: this.tmpV.z, vx: pl.vel.x, vz: pl.vel.z, r: 0.5, kind: 'person', ref: pl });
    }
  }

  update(dt: number, focus: THREE.Vector3): void {
    const T = Config.people;
    this.focusX = focus.x;
    this.focusZ = focus.z;
    // ---- spawn / despawn around the player ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.aliveCount < T.target && this.d.player.active) {
      this.spawnTimer = T.spawnEvery;
      this.trySpawn(focus);
    }
    for (let i = this.onFoot.length - 1; i >= 0; i--) {
      const p = this.onFoot[i];
      const dist = Math.hypot(p.world.x - focus.x, p.world.z - focus.z);
      if (dist > T.despawnRadius) {
        this.dispose(p);
        continue;
      }
      if (p.dead) {
        p.deadT += dt;
        if (p.deadT > Config.combat.deadLinger) {
          this.dispose(p);
          continue;
        }
      } else {
        this.think(p, dt);
      }
      this.place(p);
      p.model.update(dt, p.speed, p.mode);
    }
    if (this.combat) this.updatePolice(dt, focus);
  }

  private place(p: Person): void {
    const o = this.d.origin.origin;
    p.model.root.position.set(p.world.x - o.x, p.world.y, p.world.z - o.z);
    p.model.setHeading(p.heading, 1 / 30);
  }

  // ------------------------------------------------------------------ spawning
  private trySpawn(focus: THREE.Vector3): void {
    const T = Config.people;
    // near a station: some people are already waiting on the platform
    if (this.st && Math.random() < 0.3 && this.spawnOnPlatform(focus)) return;
    const g = this.d.graph;
    const inCity = this.d.terrain.sites.some((s) => Math.hypot(s.x - focus.x, s.z - focus.z) < s.coreRadius + 250);
    for (let attempt = 0; attempt < 8; attempt++) {
      const wander = inCity && Math.random() < T.wanderShare;
      const p = this.createPerson();
      if (wander) {
        const a = Math.random() * Math.PI * 2;
        const r = T.spawnMin + Math.random() * (T.spawnMax - T.spawnMin);
        const x = focus.x + Math.cos(a) * r;
        const z = focus.z + Math.sin(a) * r;
        if (!this.walkable(x, z)) continue;
        this.tmpV.set(x, this.d.terrain.heightAt(x, z), z);
        p.heading = Math.random() * Math.PI * 2;
        this.adopt(p, this.tmpV, 'idle');
        p.timer = Math.random() * 3;
        this.maybeArm(p);
        return;
      }
      const spot = g.randomSpotInRing(focus.x, focus.z, T.spawnMin, T.spawnMax, Math.random);
      if (!spot) continue;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const r = this.d.graph.roads[spot.roadId];
      const lateral = side * (r.halfWidth + r.shoulder * 0.55 + 0.2);
      g.at(spot.roadId, spot.s, 1, lateral, tmpPt);
      const dist = Math.hypot(tmpPt.x - focus.x, tmpPt.z - focus.z);
      if (dist < T.spawnMin || dist > T.spawnMax) continue;
      if (g.onBridge(spot.roadId, spot.s) || this.nearStation(spot.roadId, spot.s, STATION_CLEAR)) continue;
      p.roadId = spot.roadId;
      p.s = spot.s;
      p.dir = dir;
      p.side = side;
      p.heading = Math.atan2(tmpPt.hx * dir, tmpPt.hz * dir);
      this.tmpV.set(tmpPt.x, tmpPt.y + 0.05, tmpPt.z);
      this.adopt(p, this.tmpV, 'sidewalk');
      this.maybeArm(p);
      return;
    }
  }

  private nearStation(roadId: number, s: number, clear: number): boolean {
    for (const st of this.d.graph.stations(roadId)) if (Math.abs(st.s - s) < clear) return true;
    return false;
  }

  /** Open ground a person may walk on: not water, not asphalt, not too steep. */
  private walkable(x: number, z: number): boolean {
    const t = this.d.terrain;
    t.sample(x, z, this.sc);
    if (!Number.isNaN(this.sc.water) && this.sc.h < this.sc.water + 0.4) return false;
    if (t.roads.surfaceAt(x, z) === 1) return false;
    const h = this.sc.h;
    const dx = t.heightAt(x + 1.5, z) - h;
    const dz = t.heightAt(x, z + 1.5) - h;
    return Math.hypot(dx, dz) / 1.5 < 0.7;
  }

  // ------------------------------------------------------------------ behaviour
  private think(p: Person, dt: number): void {
    // a fast vehicle coming at us -> get out of its way
    if (p.task !== 'flee' && p.task !== 'attack' && !(p.task === 'station' && p.stPhase !== 'toFoot') && this.dodge(p)) p.task = 'flee';
    if (this.combat && p.role !== 'civilian' && p.task !== 'attack') this.checkAggro(p, dt);

    switch (p.task) {
      case 'idle':
        p.speed = 0;
        p.mode = 'idle';
        p.timer -= dt;
        if (p.timer <= 0) this.startWander(p);
        break;
      case 'flee':
        p.timer -= dt;
        p.speed = Config.people.run;
        p.mode = 'run';
        this.move(p, dt, true);
        if (p.timer <= 0) {
          p.task = 'idle';
          p.timer = 1 + Math.random() * 2;
        }
        break;
      case 'attack':
        this.attack(p, dt);
        break;
      case 'wander':
        this.wander(p, dt);
        break;
      case 'work':
        if (this.workHook) this.workHook(p, dt);
        else p.task = 'idle';
        break;
      case 'station':
        this.stationWalk(p, dt);
        break;
      case 'sidewalk':
        this.sidewalk(p, dt);
        break;
      default:
        break;
    }
  }

  /** Step sideways away from a vehicle that is coming at us fast. Returns true if we must run. */
  private dodge(p: Person): boolean {
    for (const v of this.d.vehicles.vehicles) {
      if (!v.enabled || Math.abs(v.forwardSpeed) < 3) continue;
      v.forwardVector(this.tmpV);
      const fx = this.tmpV.x;
      const fz = this.tmpV.z;
      v.physWorld(this.tmpV);
      const rx = p.world.x - this.tmpV.x;
      const rz = p.world.z - this.tmpV.z;
      const dir = Math.sign(v.forwardSpeed);
      const hl = Math.hypot(fx, fz) || 1;
      const along = ((rx * fx + rz * fz) / hl) * dir;
      const lat = (rx * fz - rz * fx) / hl;
      if (along > 0 && along < 5 + Math.abs(v.forwardSpeed) * 0.9 && Math.abs(lat) < 2.6) {
        // run to the side we are already on
        const side = lat >= 0 ? 1 : -1;
        p.heading = Math.atan2(fz / hl * side, -fx / hl * side);
        p.timer = 1.6;
        return true;
      }
    }
    return false;
  }

  private sidewalk(p: Person, dt: number): void {
    const g = this.d.graph;
    const r = g.roads[p.roadId];
    p.speed = p.pace;
    p.mode = 'walk';
    const next = p.s + p.dir * p.pace * dt;
    let turn = next < 2 || next > r.length - 2 || g.onBridge(p.roadId, next);
    if (!turn) {
      for (const st of g.stations(p.roadId)) {
        const dn = Math.abs(st.s - next);
        if (dn < STATION_CLEAR && dn < Math.abs(st.s - p.s)) {
          turn = true;
          break;
        }
      }
    }
    if (turn) {
      p.dir = (p.dir === 1 ? -1 : 1) as 1 | -1;
      p.task = Math.random() < 0.5 ? 'idle' : 'sidewalk';
      p.timer = 2 + Math.random() * 6;
      if (p.task === 'sidewalk') p.timer = 0;
      return;
    }
    p.s = next;
    const lateral = p.side * (r.halfWidth + r.shoulder * 0.55 + 0.2);
    g.at(p.roadId, p.s, 1, lateral, tmpPt);
    p.world.set(tmpPt.x, tmpPt.y + 0.05, tmpPt.z);
    p.heading = Math.atan2(tmpPt.hx * p.dir, tmpPt.hz * p.dir);
    // now and then stop and look around
    if (Math.random() < dt * 0.02) {
      p.task = 'idle';
      p.timer = 2 + Math.random() * 6;
      p.mode = 'idle';
      p.speed = 0;
    }
  }

  private startWander(p: Person): void {
    // some people go to a railway station
    if (this.st && p.role === 'civilian' && Math.random() < STATION_SHARE) {
      const a = this.nearestAccess(p.world.x, p.world.z, STATION_RANGE);
      if (a) {
        p.access = a;
        p.stPhase = 'toFoot';
        p.task = 'station';
        p.timer = 150;
        return;
      }
    }
    // somebody standing at the roadside keeps walking the roadside; everybody else picks a spot nearby
    if (p.roadId >= 0 && p.world.y > -1e8 && p.vehicle === null && this.d.graph.roads[p.roadId] && p.task === 'idle' && p.timer <= 0 && this.onRoadEdge(p)) {
      p.task = 'sidewalk';
      return;
    }
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 35;
    p.goalX = p.world.x + Math.cos(a) * r;
    p.goalZ = p.world.z + Math.sin(a) * r;
    p.task = 'wander';
  }

  /** True while the person is standing at the road edge he was spawned on (sidewalk walkers only). */
  private onRoadEdge(p: Person): boolean {
    if (p.roadId < 0) return false;
    const r = this.d.graph.roads[p.roadId];
    this.d.graph.at(p.roadId, p.s, 1, p.side * (r.halfWidth + r.shoulder * 0.55 + 0.2), tmpPt);
    return Math.hypot(tmpPt.x - p.world.x, tmpPt.z - p.world.z) < 1.5;
  }

  private wander(p: Person, dt: number): void {
    const dx = p.goalX - p.world.x;
    const dz = p.goalZ - p.world.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      p.task = 'idle';
      p.timer = 2 + Math.random() * 8;
      p.speed = 0;
      p.mode = 'idle';
      return;
    }
    p.heading = Math.atan2(dx, dz);
    p.speed = p.pace;
    p.mode = 'walk';
    this.move(p, dt, false);
  }

  /** Move along the current heading on open ground; stops when something (water, road, cliff) is in the way. */
  private move(p: Person, dt: number, running: boolean): void {
    const sp = running ? Config.people.run : p.pace;
    const nx = p.world.x + Math.sin(p.heading) * sp * dt;
    const nz = p.world.z + Math.cos(p.heading) * sp * dt;
    // (somebody who ended up ON the asphalt is allowed to walk off it)
    if (p.task === 'wander' && !this.walkable(nx, nz) && this.walkable(p.world.x, p.world.z)) {
      p.task = 'idle';
      p.timer = 1 + Math.random() * 3;
      p.speed = 0;
      p.mode = 'idle';
      return;
    }
    p.world.x = nx;
    p.world.z = nz;
    p.world.y = this.d.terrain.heightAt(nx, nz);
  }

  // ------------------------------------------------------------------ railway stations
  /** The stair whose foot is nearest to (x, z) within `range` m, or null. */
  private nearestAccess(x: number, z: number, range: number): StationAccess | null {
    let best: StationAccess | null = null;
    let bd = range;
    for (const a of this.st?.accesses ?? []) {
      const d = Math.hypot(a.foot.x - x, a.foot.z - z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** A person already standing on a platform within sight range of the player (not closer than the normal spawn distance). */
  private spawnOnPlatform(focus: THREE.Vector3): boolean {
    const T = Config.people;
    const a = this.nearestAccess(focus.x, focus.z, T.spawnMax + 60);
    if (!a) return false;
    const off = (Math.random() * 2 - 1) * 55;
    const x = a.top.x + a.tx * off + (Math.random() - 0.5) * 2;
    const z = a.top.z + a.tz * off + (Math.random() - 0.5) * 2;
    const dist = Math.hypot(x - focus.x, z - focus.z);
    if (dist < T.spawnMin || dist > T.spawnMax) return false;
    const p = this.createPerson();
    p.heading = Math.atan2(-a.ox, -a.oz);
    this.tmpV.set(x, a.top.y, z);
    this.adopt(p, this.tmpV, 'station');
    p.access = a;
    p.stPhase = 'wait';
    p.timer = 15 + Math.random() * 45;
    return true;
  }

  /** A train has stopped: a few passengers step out next to some of its cars and walk to the stair. */
  private alight(t: Train): void {
    const st = this.st;
    if (!st || this.aliveCount >= Config.people.target + 6) return;
    const fleet = st.trains.fleet;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const spot = alightSpot(st.rail, fleet, (x, z) => this.d.terrain.heightAt(x, z), t, 1 + Math.floor(Math.random() * (CONSIST.length - 1)));
      if (!spot) return;
      if (Math.hypot(spot.x - this.focusX, spot.z - this.focusZ) > Config.people.spawnMax + 150) return;
      const a = this.nearestAccessTo(spot.x, spot.z);
      if (!a) return;
      const p = this.createPerson();
      p.heading = Math.random() * Math.PI * 2;
      this.tmpV.set(spot.x + (Math.random() - 0.5) * 1.5, a.top.y, spot.z + (Math.random() - 0.5) * 1.5);
      this.adopt(p, this.tmpV, 'station');
      p.access = a;
      p.stPhase = 'toTop';
      p.timer = 150;
    }
  }

  /** The stair whose head is nearest to a point on a platform. */
  private nearestAccessTo(x: number, z: number): StationAccess | null {
    let best: StationAccess | null = null;
    let bd = 60;
    for (const a of this.st?.accesses ?? []) {
      const d = Math.hypot(a.top.x - x, a.top.z - z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** Walk towards (x, z) at `speed` m/s, face the way; returns the distance left. */
  private walkTo(p: Person, x: number, z: number, speed: number, dt: number): number {
    const dx = x - p.world.x;
    const dz = z - p.world.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) {
      p.heading = Math.atan2(dx, dz);
      const step = Math.min(d, speed * dt);
      p.world.x += (dx / d) * step;
      p.world.z += (dz / d) * step;
    }
    p.speed = speed;
    p.mode = 'walk';
    return d;
  }

  /** The whole trip: to the foot of the stair, up, along the platform, wait (board a standing train), or down and away. */
  private stationWalk(p: Person, dt: number): void {
    const a = p.access;
    if (!a || !this.st) {
      p.task = 'idle';
      p.timer = 1;
      return;
    }
    p.timer -= dt;
    switch (p.stPhase) {
      case 'toFoot': {
        // the entrance sign stands 1.2 m beyond the last step: walk through it onto the first step
        const d = this.walkTo(p, a.foot.x + a.ox * 1.2, a.foot.z + a.oz * 1.2, p.pace, dt);
        p.world.y = this.d.terrain.heightAt(p.world.x, p.world.z);
        if (d < 0.4) {
          p.stPhase = 'climb';
          p.stIdx = a.steps.length - 1;
        } else if (p.timer <= 0) this.leaveStation(p);
        break;
      }
      case 'climb': {
        const s = a.steps[p.stIdx];
        const d = this.walkTo(p, s.x, s.z, p.pace * 0.85, dt);
        p.world.y += (s.y - p.world.y) * Math.min(1, dt * 8);
        if (d < 0.15) {
          p.world.y = s.y;
          p.stIdx--;
          if (p.stIdx < 0) {
            p.stPhase = 'platform';
            const off = (Math.random() * 2 - 1) * 55;
            p.goalX = a.top.x + a.tx * off;
            p.goalZ = a.top.z + a.tz * off;
          }
        }
        break;
      }
      case 'platform': {
        p.world.y = a.top.y;
        const d = this.walkTo(p, p.goalX, p.goalZ, p.pace, dt);
        if (d < 0.4) {
          p.stPhase = 'wait';
          p.timer = 15 + Math.random() * 45;
        }
        break;
      }
      case 'wait': {
        p.world.y = a.top.y;
        p.speed = 0;
        p.mode = 'idle';
        p.heading = Math.atan2(-a.ox, -a.oz);
        // a train standing next to the platform: get on (the person leaves the world)
        for (const t of this.st.trains.trains) {
          if (t.state !== 'dwell') continue;
          if (this.st.trains.distanceTo(t, p.world.x, p.world.z) < 22) {
            this.dispose(p);
            return;
          }
        }
        if (p.timer <= 0) {
          p.stPhase = 'down';
          p.stIdx = 0;
        }
        break;
      }
      case 'toTop': {
        p.world.y = a.top.y;
        const d = this.walkTo(p, a.top.x, a.top.z, p.pace, dt);
        if (d < 0.5) {
          p.stPhase = 'down';
          p.stIdx = 0;
        }
        break;
      }
      case 'down': {
        const s = a.steps[p.stIdx];
        const d = this.walkTo(p, s.x, s.z, p.pace * 0.85, dt);
        p.world.y += (s.y - p.world.y) * Math.min(1, dt * 8);
        if (d < 0.15) {
          p.world.y = s.y;
          p.stIdx++;
          if (p.stIdx >= a.steps.length) {
            p.world.y = this.d.terrain.heightAt(p.world.x, p.world.z);
            this.leaveStation(p);
          }
        }
        break;
      }
    }
  }

  private leaveStation(p: Person): void {
    p.access = null;
    p.task = 'idle';
    p.timer = 1 + Math.random() * 3;
    p.speed = 0;
    p.mode = 'idle';
    p.world.y = this.d.terrain.heightAt(p.world.x, p.world.z);
  }

  // ------------------------------------------------------------------ guns
  /** Some people carry a gun and want to kill the player. */
  private maybeArm(p: Person): void {
    if (!this.combat || Math.random() > Config.combat.thugShare) return;
    p.role = 'thug';
    const roll = Math.random();
    this.giveGun(p, roll < 0.34 ? 'pistol' : roll < 0.52 ? 'combatPistol' : roll < 0.72 ? 'microSmg' : roll < 0.9 ? 'smg' : 'shotgun');
  }

  private giveGun(p: Person, w: WeaponId): void {
    p.weapon = w;
    p.model.setGun(w);
  }

  /** An armed person (or police while the player is wanted) notices the player and attacks. */
  private checkAggro(p: Person, dt: number): void {
    const c = this.combat!;
    if (p.dead || p.task === 'flee') return;
    if (p.role === 'police') {
      if (c.wanted.stars > 0) this.startAttack(p);
      return;
    }
    p.losT -= dt;
    if (p.losT > 0) return;
    p.losT = 0.4;
    c.playerWorld(this.tmpA);
    const dist = Math.hypot(this.tmpA.x - p.world.x, this.tmpA.z - p.world.z);
    if (dist > Config.combat.sightRange) return;
    this.eyes(p, this.tmpB);
    if (!c.blocked(this.tmpB, this.tmpA)) this.startAttack(p);
  }

  private startAttack(p: Person): void {
    if (p.task === 'attack' || p.dead) return;
    p.task = 'attack';
    p.fireT = 0.5 + Math.random() * 0.8; // a moment to react
    p.losT = 0;
    p.hasLos = false;
  }

  private eyes(p: Person, out: THREE.Vector3): THREE.Vector3 {
    return out.set(p.world.x, p.world.y + 1.45 * p.model.look.scale, p.world.z);
  }

  /** Can this person stand here? (water and steep cliffs: no; asphalt: yes - attackers cross roads) */
  private passable(x: number, z: number): boolean {
    const t = this.d.terrain;
    t.sample(x, z, this.sc);
    if (!Number.isNaN(this.sc.water) && this.sc.h < this.sc.water + 0.4) return false;
    const h = this.sc.h;
    return Math.hypot(t.heightAt(x + 1.5, z) - h, t.heightAt(x, z + 1.5) - h) / 1.5 < 0.8;
  }

  private attack(p: Person, dt: number): void {
    const c = this.combat;
    if (!c || !p.weapon) {
      p.task = 'idle';
      p.timer = 2;
      return;
    }
    const C = Config.combat;
    c.playerWorld(this.tmpA);
    const dx = this.tmpA.x - p.world.x;
    const dz = this.tmpA.z - p.world.z;
    const dist = Math.hypot(dx, dz);
    // police give up when nobody is wanted any more; armed civilians lose interest far away
    if ((p.role === 'police' && c.wanted.stars === 0) || (p.role === 'thug' && dist > C.sightRange * 2.4)) {
      p.task = 'idle';
      p.timer = 2;
      p.speed = 0;
      p.mode = 'idle';
      p.model.setAiming(false);
      return;
    }
    p.heading = Math.atan2(dx, dz);
    // line of sight, 4 times a second
    p.losT -= dt;
    if (p.losT <= 0) {
      p.losT = 0.25;
      this.eyes(p, this.tmpB);
      p.hasLos = dist < C.fireRange && !c.blocked(this.tmpB, this.tmpA);
    }
    const keep = C.keepDistance * (p.weapon === 'shotgun' ? 0.6 : 1);
    let moveSpeed = 0;
    let dirSign = 1;
    let side = 0;
    if (dist > keep + 4 || !p.hasLos) {
      moveSpeed = Config.people.run * 0.85; // run at the player
    } else if (dist < keep - 6) {
      moveSpeed = p.pace * 1.3;
      dirSign = -1; // back off
    } else {
      p.strafeT -= dt;
      if (p.strafeT <= 0) {
        p.strafeT = 1 + Math.random() * 2;
        p.strafe = Math.random() < 0.5 ? 1 : -1;
      }
      side = p.strafe;
      moveSpeed = p.pace * 0.9;
    }
    const nx0 = Math.sin(p.heading);
    const nz0 = Math.cos(p.heading);
    const mx = nx0 * dirSign + nz0 * side;
    const mz = nz0 * dirSign - nx0 * side;
    const ml = Math.hypot(mx, mz) || 1;
    const nx = p.world.x + (mx / ml) * moveSpeed * dt;
    const nz = p.world.z + (mz / ml) * moveSpeed * dt;
    if (this.passable(nx, nz)) {
      p.world.x = nx;
      p.world.z = nz;
      p.world.y = this.d.terrain.heightAt(nx, nz);
      p.speed = moveSpeed;
      p.mode = moveSpeed > 3 ? 'run' : 'walk';
    } else {
      p.speed = 0;
      p.mode = 'idle';
    }
    p.model.setAiming(p.hasLos);
    // shoot
    p.fireT -= dt;
    if (p.hasLos && p.fireT <= 0) this.npcShoot(p, dist);
  }

  /** One shot of an armed person at the player. The player never dies: a hit only flashes the screen. */
  private npcShoot(p: Person, dist: number): void {
    const c = this.combat!;
    const C = Config.combat;
    const w = weaponSpec(p.weapon!);
    const burstLen = w.auto ? 4 : 1;
    if (p.burstLeft <= 0) p.burstLeft = burstLen;
    p.burstLeft--;
    p.fireT = p.burstLeft > 0 ? w.interval * 1.6 : (w.auto ? 1.0 : 0.9) + Math.random() * (p.role === 'police' ? 0.8 : 1.4);
    const o = this.d.origin.origin;
    const sc = p.model.look.scale;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const muzzle = this.tmpB.set(p.world.x - o.x + fx * (0.55 + w.gunLength) + fz * -0.3, p.world.y + 1.4 * sc, p.world.z - o.z + fz * (0.55 + w.gunLength) + fx * 0.3);
    c.playerWorld(this.tmpA);
    const hitChance = Math.max(C.minHit, C.baseHit - dist * C.hitFalloff) * (p.mode === 'run' ? 0.7 : 1);
    const pellets = w.pellets > 1 ? 3 : 1;
    let hit = false;
    for (let i = 0; i < pellets; i++) {
      const ok = Math.random() < hitChance * (w.pellets > 1 ? 0.6 : 1);
      hit = hit || ok;
      const miss = ok ? 0 : 1 + Math.random() * 2.5;
      const a = Math.random() * Math.PI * 2;
      const end = new THREE.Vector3(this.tmpA.x - o.x + Math.cos(a) * miss, this.tmpA.y + 0.2 + (ok ? 0 : (Math.random() - 0.5) * 2), this.tmpA.z - o.z + Math.sin(a) * miss);
      c.effects.tracer(muzzle, end);
      if (!ok) c.effects.impact(end, 0x9a8a68, 3);
    }
    c.effects.muzzleFlash(muzzle);
    c.audio.shot(w.id, dist);
    if (hit) c.playerHit(C.npcDamage);
  }

  // ------------------------------------------------------------------ being shot
  /**
   * Ray against everybody on foot (alive). Origin and direction are floating-origin LOCAL; `maxT` in metres.
   * Returns the nearest person hit.
   */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): { person: Person; t: number; head: boolean } | null {
    const o = this.d.origin.origin;
    const C = Config.combat;
    let best: { person: Person; t: number; head: boolean } | null = null;
    for (const p of this.onFoot) {
      if (p.dead) continue;
      const px = p.world.x - o.x;
      const pz = p.world.z - o.z;
      // quick reject: person farther than maxT from the start
      if (Math.abs(px - ox) > maxT + 1 || Math.abs(pz - oz) > maxT + 1) continue;
      const h = rayVsPerson(ox, oy, oz, dx, dy, dz, px, p.world.y, pz, 1.8 * p.model.look.scale, C.bodyRadius, C.headFrom, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) best = { person: p, t: h.t, head: h.head };
    }
    return best;
  }

  /** The player killed a criminal (a 'thug'). Used by the Gold economy (reward). */
  onCriminalKilled: ((p: Person) => void) | null = null;
  /** Farm workers: called every frame for people whose task is 'work' (FarmCrew moves them and sets the pose). */
  workHook: ((p: Person, dt: number) => void) | null = null;

  /** The player (or anybody) hurts a person. Returns true if the person died. */
  damage(p: Person, amount: number, head: boolean, byPlayer: boolean): boolean {
    if (p.dead) return false;
    const C = Config.combat;
    p.health -= amount * (head ? C.headshotMultiplier : 1);
    const w = this.combat?.wanted;
    if (p.health <= 0) {
      this.kill(p);
      if (byPlayer && p.role === 'thug') this.onCriminalKilled?.(p);
      if (byPlayer && w) w.add(p.role === 'police' ? C.wanted.killPolice : p.role === 'thug' ? 0 : C.wanted.killCivilian);
      this.alarm(p.world, p);
      return true;
    }
    if (byPlayer && w) w.add(p.role === 'police' ? C.wanted.shootPolice : p.role === 'thug' ? 0 : C.wanted.woundCivilian);
    // reaction: armed people shoot back, everybody else runs
    if (p.role === 'civilian') this.panic(p);
    else this.startAttack(p);
    this.alarm(p.world, p);
    return false;
  }

  private kill(p: Person): void {
    p.task = 'dead';
    p.speed = 0;
    p.mode = 'idle';
    p.deadT = 0;
    p.health = 0;
    p.model.setAiming(false);
    p.model.setDead(true);
  }

  /** Run away from the player for a while. */
  private panic(p: Person): void {
    if (p.dead || p.task === 'attack') return;
    if (p.task === 'flee' && p.timer > 2) return; // already running
    const pw = this.tmpA;
    if (this.combat) this.combat.playerWorld(pw);
    else this.d.player.getWorldPosition(pw);
    p.heading = Math.atan2(p.world.x - pw.x, p.world.z - pw.z) + (Math.random() - 0.5) * 0.9;
    p.task = 'flee';
    p.timer = Config.combat.fleeSeconds * (0.7 + Math.random() * 0.6);
  }

  /** The player fired a gun at this WORLD point: people close by panic, armed people attack. */
  alarmAt(at: THREE.Vector3): void {
    this.alarm(at, null);
  }

  /** Gunfire / a body: everybody close runs; armed people close to the player attack. */
  private alarm(at: THREE.Vector3, except: Person | null): void {
    const R = Config.combat.alarmRadius;
    for (const q of this.onFoot) {
      if (q === except || q.dead || q.task === 'attack') continue;
      if (Math.hypot(q.world.x - at.x, q.world.z - at.z) > R) continue;
      if (q.role === 'civilian') this.panic(q);
      else this.startAttack(q);
    }
  }

  // ------------------------------------------------------------------ police
  private updatePolice(dt: number, focus: THREE.Vector3): void {
    const W = Config.combat.wanted;
    const c = this.combat!;
    let police = 0;
    for (let i = this.onFoot.length - 1; i >= 0; i--) {
      const p = this.onFoot[i];
      if (p.role !== 'police' || p.dead) continue;
      police++;
      if (c.wanted.stars === 0) {
        p.idleT += dt;
        if (p.idleT > W.leaveAfter) {
          this.dispose(p);
          police--;
        }
      } else p.idleT = 0;
    }
    this.policeTimer -= dt;
    if (this.policeTimer > 0 || police >= c.wanted.policeTarget || !this.d.player.active) return;
    this.policeTimer = W.spawnEvery;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = W.spawnMin + Math.random() * (W.spawnMax - W.spawnMin);
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      if (!this.passable(x, z)) continue;
      const p = new Person({ ...POLICE_LOOK, skin: Math.random() < 0.5 ? 0xb87a56 : 0x9a6642 });
      p.role = 'police';
      p.heading = a + Math.PI;
      this.tmpV.set(x, this.d.terrain.heightAt(x, z), z);
      this.adopt(p, this.tmpV, 'idle');
      this.giveGun(p, c.wanted.stars >= 5 ? 'ak47' : c.wanted.stars >= 3 ? 'smg' : 'pistol');
      this.startAttack(p);
      return;
    }
  }
}
