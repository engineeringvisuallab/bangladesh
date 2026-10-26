import * as THREE from 'three';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { PeopleManager } from '../people/PeopleManager';
import type { TerrainPhysics } from '../terrain';
import type { CityPlan } from '../city/CityPlan';
import { getWorldZoneAt } from '../city/WorldZones';
import type { RoadKind } from '../roads/RoadTypes';
import { SPECS, canUse, canUseRoad, canUsePlace, groundY, type Vehicle, type VehicleManager, type VehicleSpec } from '../vehicles';
import type { BusStops } from './BusStops';
import { AIDriver, type Obstacle } from './AIDriver';
import { RoadGraph, type RoadPoint } from './RoadGraph';
import { RouteBuilder } from './Route';
import type { TrafficSignals } from './TrafficSignals';

export interface TrafficDeps {
  graph: RoadGraph;
  /** City areas (homes, bazaar, campus ...): decides where small / special vehicles belong inside a city. */
  plan: CityPlan;
  vehicles: VehicleManager;
  people: PeopleManager;
  player: Player;
  terrainPhysics: TerrainPhysics;
  /** Buses halt at these. */
  stops?: BusStops;
  /** Traffic lights: AI drivers obey them. */
  signals?: TrafficSignals;
}

const tmpPt: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
const V3 = new THREE.Vector3();
const VEL = { x: 0, z: 0 };
const F3 = new THREE.Vector3();

/**
 * AI traffic. A car only ever exists WITH a driver: spawning a car means creating a person, seating him, and
 * giving him a route. Drivers follow the roads in the left lane (Bangladesh), turn at junctions, brake for
 * people and other cars, and disappear (together with their car) when far from the player or at a dead end.
 * Also removes the car the player walked away from (it would be empty).
 */
export class TrafficManager {
  private timer = 1;
  private obstacles: Obstacle[] = [];
  private _aiCount = 0;

  constructor(private d: TrafficDeps) {}

  get aiCount(): number {
    return this._aiCount;
  }

  /** 60 Hz, before the physics step: every AI driver decides his pedals. */
  fixedUpdate(dt: number): void {
    const vs = this.d.vehicles.vehicles;
    const obs = this.obstacles;
    obs.length = 0;
    for (const v of vs) {
      if (!v.enabled) continue;
      v.physWorld(V3);
      v.velocityXZ(VEL);
      const hz = v.spec.half.z;
      if (hz > 3) {
        // a long vehicle (bus, tank) counts as a row of circles along its length
        v.forwardVector(F3);
        const l = Math.hypot(F3.x, F3.z) || 1;
        const n = Math.ceil((hz * 2) / 3.2);
        for (let k = 0; k < n; k++) {
          const off = (k / (n - 1) - 0.5) * (hz * 2 - 3.6);
          obs.push({ x: V3.x + (F3.x / l) * off, z: V3.z + (F3.z / l) * off, vx: VEL.x, vz: VEL.z, r: 2.0, kind: 'vehicle', ref: v });
        }
      } else obs.push({ x: V3.x, z: V3.z, vx: VEL.x, vz: VEL.z, r: hz < 1.2 ? 1.2 : 2.0, kind: 'vehicle', ref: v });
    }
    this.d.people.collectObstacles(obs);
    for (const v of vs) {
      if (!v.ai || !v.enabled) continue;
      if (this.d.stops && v.spec.look.kind === 'bus' && !v.ai.stop) {
        v.physWorld(V3);
        v.forwardVector(F3);
        const l = Math.hypot(F3.x, F3.z) || 1;
        v.ai.stop = this.d.stops.nextAhead(V3.x, V3.z, F3.x / l, F3.z / l, v.ai.served);
      }
      v.ai.update(dt, obs);
    }
  }

  /** Every frame. */
  update(dt: number, focus: THREE.Vector3): void {
    const T = Config.traffic;
    const vm = this.d.vehicles;
    let ai = 0;
    for (let i = vm.vehicles.length - 1; i >= 0; i--) {
      const v = vm.vehicles[i];
      if (v === vm.driver || v.persistent) continue;
      v.physWorld(V3);
      const dist = Math.hypot(V3.x - focus.x, V3.z - focus.z);
      if (v.state === 'wrecked') {
        // a burnt-out wreck stays a while (it is something to look at) and then goes away
        if (v.wreckedFor > 30 || dist > T.despawnRadius) this.remove(v);
        continue;
      }
      if (v.driver === null) {
        // the player got out: the empty car goes away once he has walked off (never in front of his eyes)
        v.abandonedFor += dt;
        if (dist > 30 || v.abandonedFor > 90) this.remove(v);
        continue;
      }
      if (v.ai) {
        ai++;
        if (v.ai.dead || v.ai.finishedFor > 4 || dist > T.despawnRadius) this.remove(v);
      }
    }
    this._aiCount = ai;

    this.timer -= dt;
    if (this.timer <= 0 && ai < T.target && this.d.player.active) {
      this.timer = T.spawnEvery;
      this.trySpawn(focus);
    }
  }

  private trySpawn(focus: THREE.Vector3): void {
    const T = Config.traffic;
    const g = this.d.graph;
    for (let attempt = 0; attempt < 12; attempt++) {
      const spot = g.randomSpotInRing(focus.x, focus.z, T.spawnMin, Math.min(T.spawnMax, PhysicsConfig.activeRadius * 0.9), Math.random);
      if (!spot) return; // no road around the player
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const road = g.roads[spot.roadId];
      if (spot.s < 20 || spot.s > road.length - 60) continue;
      g.at(spot.roadId, spot.s, dir, g.laneOffset(spot.roadId), tmpPt);
      const dist = Math.hypot(tmpPt.x - focus.x, tmpPt.z - focus.z);
      if (dist < T.spawnMin || dist > Math.min(T.spawnMax, PhysicsConfig.activeRadius * 0.9)) continue;
      if (!this.d.terrainPhysics.hasColliderAt(tmpPt.x, tmpPt.z)) continue;
      if (g.onBridge(spot.roadId, spot.s) || g.onBridge(spot.roadId, spot.s + dir * 30)) continue;
      let crowded = false;
      for (const v of this.d.vehicles.vehicles) {
        v.physWorld(V3);
        if (Math.hypot(V3.x - tmpPt.x, V3.z - tmpPt.z) < T.spawnGap) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;

      // which vehicle belongs on THIS road in THIS area (a rickshaw never appears on a freeway, a bus not in a lane)
      const spec = this.pickSpec(road.kind, tmpPt.x, tmpPt.z);
      if (!spec) continue;
      const temper = 0.7 + Math.random() * 0.28;
      const route = new RouteBuilder(g, Math.random, spot.roadId, spot.s, dir, temper, {
        roadOk: (k) => canUseRoad(spec.use, k),
        placeOk: (x, z) => canUsePlace(spec.use, getWorldZoneAt(x, z).kind, this.d.plan.areaAt(x, z)?.kind ?? null),
      });
      route.start();
      const yaw = Math.atan2(tmpPt.hx, tmpPt.hz);
      const colour = this.paint(spec);
      V3.set(tmpPt.x, tmpPt.y - groundY(spec) + 0.25, tmpPt.z);
      // the driver first: a vehicle cannot be created without one
      const driver = this.d.people.createPerson();
      const car = this.d.vehicles.spawn(spec, V3, yaw, driver, colour);
      const [lo, hi] = spec.pax ?? [0, 0];
      const pax = lo + Math.floor(Math.random() * (hi - lo + 1));
      for (let i = 0; i < pax; i++) if (!car.seatPassenger(this.d.people.createPerson())) break;
      car.ai = new AIDriver(car, route, this.d.signals);
      car.setEnabled(true);
      return;
    }
  }

  /** A vehicle that may use this kind of road in this kind of zone, by weight (null = nothing suits this place). */
  private pickSpec(road: RoadKind, x: number, z: number): VehicleSpec | null {
    const zone = getWorldZoneAt(x, z).kind;
    const area = this.d.plan.areaAt(x, z)?.kind ?? null;
    let buses = 0;
    for (const v of this.d.vehicles.vehicles) if (v.spec.look.kind === 'bus' && v.state !== 'wrecked') buses++;
    const fits: { spec: VehicleSpec; w: number }[] = [];
    let total = 0;
    for (const spec of Object.values(SPECS)) {
      if (!canUse(spec.use, road, zone, area)) continue;
      if (spec.look.kind === 'bus' && buses >= Config.traffic.maxBuses) continue;
      fits.push({ spec, w: spec.use.weight });
      total += spec.use.weight;
    }
    let r = Math.random() * total;
    for (const f of fits) {
      if (r < f.w) return f.spec;
      r -= f.w;
    }
    return fits.length > 0 ? fits[fits.length - 1].spec : null;
  }

  private paint(spec: VehicleSpec): number {
    switch (spec.look.kind) {
      case 'rickshaw': return RICKSHAW_COLOURS[Math.floor(Math.random() * RICKSHAW_COLOURS.length)];
      case 'bus': return BUS_COLOURS[Math.floor(Math.random() * BUS_COLOURS.length)];
      case 'auto': return AUTO_COLOURS[Math.floor(Math.random() * AUTO_COLOURS.length)];
      default: return BODY_COLOURS[Math.floor(Math.random() * BODY_COLOURS.length)];
    }
  }

  /** Remove a vehicle and (if there is one) its driver and passengers. */
  private remove(v: Vehicle): void {
    for (const p of v.removePassengers()) this.d.people.dispose(p);
    const who = this.d.vehicles.remove(v);
    if (who && who !== 'player') this.d.people.dispose(who);
  }
}

const RICKSHAW_COLOURS = [0x2e6fbd, 0xc8402e, 0x2f9e5b, 0xe0a82a, 0x8a3fa8, 0x1c9fb0];
const BUS_COLOURS = [0xd23a2c, 0x2f7d5b, 0x2d4f8a, 0xe0a82a];
const AUTO_COLOURS = [0x2f9e5b, 0xe0c02a, 0x2e8ac8, 0xd9d9d4];
const BODY_COLOURS = [0xf2f2f0, 0xb8302a, 0x2d4f8a, 0x3a3f46, 0xd9b53a, 0x2f7d5b, 0x8a8f96, 0x1d1d20];
