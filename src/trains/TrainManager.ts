import type { RailNetwork } from '../rail/RailNetwork';
import { TrainFleet, type CarPose, type Train } from './TrainSim';
import { CONSIST, TRAIN_LENGTH } from './TrainConfig';

/**
 * STAGE 14 / Step 5B.1: trains in the game loop.
 *
 *  - SIMULATION: the whole fleet is always simulated (it costs ~0.2 us per frame, so no "far away" shortcut is needed). The simulation does
 *    not depend on the player, nothing about it changes when a train gets or loses its picture.
 *  - VIEWS (spawn / despawn): a train gets a 3D view only while it is near the player. The railway meshes exist for chunks up to LOD2
 *    (2.6 km), so a train is shown within `show` m of the player and removed beyond `hide` m (hysteresis: no flicker at the border).
 *  - FLOATING ORIGIN: views live under the world root with ABSOLUTE world coordinates (like the bridges); the root moves by -origin, so an
 *    origin shift needs no work here and a train can never jump when the origin moves.
 * Colliders (TrainPhysics), player / vehicle overlap (TrainOverlap) and the minimap marker (markers()) are 5B.2.
 */
export interface TrainViewLike {
  /** Place the cars from the simulation (absolute world coordinates). */
  update(train: Train): void;
  dispose(): void;
}

export interface TrainViewHost {
  create(train: Train): TrainViewLike;
}

export interface TrainManagerOptions {
  /** Show a train when its nearest point is closer than this (m); hide it beyond `hide`. */
  show?: number;
  hide?: number;
  seed?: number;
  /** Where the trains start (arrival-end keys of the routing graph). */
  start?: readonly string[];
  keepEvents?: boolean;
  /** Step 6: fixed-block signals (default on). */
  signals?: boolean;
}

/** Default timetable: one train at each of six stations and one shuttle on the closed ring-south pair. */
export const DEFAULT_TRAIN_START: readonly string[] = [
  'airport-branch:b', // airport (terminal)
  'west-sw:b', // sw-newtown (terminal)
  'south-1:a', // central
  'south-2:b', // port
  'west-nw:b', // nw-town (terminal)
  'north-1:b', // north-hub
  'ring-south:a', // sw-newtown <-> south-interchange shuttle
];

/** Seed with the fewest touching trains of seeds 1..30 over a 2 h run (`npx tsx scripts/train-game-test.ts scan`). Only a stop-gap: it is not a guarantee for longer play, the signals of Step 6 solve it. */
export const DEFAULT_TRAIN_SEED = 18;

/** A train on the site map: middle of the train, heading in degrees clockwise from north (same convention as the other map markers). */
export interface TrainMarker {
  id: number;
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}

/**
 * Which trains need Rapier colliders: those within `radius` of the player, with a hysteresis (`extra`) so the colliders do not flicker.
 * Same idea as RailPhysics (the physics only simulates things near the player). Pure: TrainPhysics creates / removes bodies from `add` / `remove`.
 */
export class TrainSelector {
  private active = new Set<number>();

  constructor(private manager: TrainManager, private radius: number, private extra = 64) {}

  get activeIds(): ReadonlySet<number> {
    return this.active;
  }

  update(px: number, pz: number): { add: number[]; remove: number[] } {
    const add: number[] = [], remove: number[] = [];
    for (const t of this.manager.trains) {
      const d = this.manager.distanceTo(t, px, pz);
      const has = this.active.has(t.id);
      if (!has && d <= this.radius) { this.active.add(t.id); add.push(t.id); }
      else if (has && d > this.radius + this.extra) { this.active.delete(t.id); remove.push(t.id); }
    }
    return { add, remove };
  }
}

export class TrainManager {
  readonly fleet: TrainFleet;
  private views = new Map<number, TrainViewLike>();
  private show: number;
  private hide: number;
  /** Counters for the tests / debug panel. */
  created = 0;
  disposed = 0;

  constructor(rail: RailNetwork, private host: TrainViewHost, opts: TrainManagerOptions = {}) {
    this.show = opts.show ?? 2400;
    this.hide = opts.hide ?? 2700;
    this.fleet = new TrainFleet(rail, { seed: opts.seed ?? DEFAULT_TRAIN_SEED, keepEvents: opts.keepEvents ?? false, signals: opts.signals ?? true });
    for (const key of opts.start ?? DEFAULT_TRAIN_START) this.fleet.spawn(key);
  }

  get trains(): readonly Train[] {
    return this.fleet.trains;
  }

  get visibleCount(): number {
    return this.views.size;
  }

  hasView(id: number): boolean {
    return this.views.has(id);
  }

  /** From the fixed 60 Hz update. */
  fixedUpdate(dt: number): void {
    this.fleet.update(dt);
  }

  /** Smallest distance (m) from (px, pz) to the front, the middle or the rear of a train. */
  distanceTo(t: Train, px: number, pz: number): number {
    let best = Infinity;
    const p = { x: 0, y: 0, z: 0 };
    const ph = t.renderS();
    for (const back of [0, TRAIN_LENGTH / 2, TRAIN_LENGTH]) {
      t.path.posAt(ph - back, p);
      best = Math.min(best, Math.hypot(p.x - px, p.z - pz));
    }
    return best;
  }

  /** Is any train within r metres of the point? (cheap test before the overlap check) */
  anyNear(px: number, pz: number, r: number): boolean {
    for (const t of this.fleet.trains) if (this.distanceTo(t, px, pz) < r) return true;
    return false;
  }

  /**
   * All trains for the site map (every train, near or far: the simulation always runs). The marker sits at the middle of the train (between
   * the two middle cars, the very poses the colliders use) and points from the rear one to the front one.
   */
  markers(out: TrainMarker[] = []): TrainMarker[] {
    out.length = 0;
    const a: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
    const b: CarPose = { ...a, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
    const j = CONSIST.length / 2 - 1;
    for (const t of this.fleet.trains) {
      t.carPose(j, a);
      t.carPose(j + 1, b);
      const fx = a.x - b.x, fz = a.z - b.z;
      out.push({ id: t.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, heading: (((Math.atan2(fx, -fz) * 180) / Math.PI) + 360) % 360, moving: t.state === 'run' });
    }
    return out;
  }

  /** Once per rendered frame, after the player / camera moved. Creates and removes views and places the cars of the visible trains. */
  update(playerX: number, playerZ: number): void {
    for (const t of this.fleet.trains) {
      const d = this.distanceTo(t, playerX, playerZ);
      let v = this.views.get(t.id);
      if (!v && d < this.show) {
        v = this.host.create(t);
        this.views.set(t.id, v);
        this.created++;
      } else if (v && d > this.hide) {
        v.dispose();
        this.views.delete(t.id);
        this.disposed++;
        v = undefined;
      }
      if (v) v.update(t);
    }
  }

  dispose(): void {
    for (const v of this.views.values()) {
      v.dispose();
      this.disposed++;
    }
    this.views.clear();
  }
}
