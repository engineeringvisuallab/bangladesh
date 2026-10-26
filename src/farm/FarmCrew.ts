// FARM CREW: the game's REAL people and vehicles at work in the crop fields (no dummies).
//
//   PEOPLE   every farmer is a real `Person` (PeopleManager.adopt with task 'work'): they can be shot, run over, scared (they flee and then walk back to
//            their place), count for traffic / police, and use the game's walking animation + the new work poses (bent planting, cutting, picking ...).
//   VEHICLES real `Vehicle`s from VehicleManager (tractor, combine harvester, pickup - see VehicleSpec): driven by a farmer with the same physics as
//            yours. FarmCrew steers them through `Vehicle.tourInput` (pure pursuit on the lanes). F next to one: the farmer is thrown out and the
//            machine is yours.
//   Everything is created when a field is within ~215 m of the player and removed again when it is far away.
//   Fail-safe: any error switches the crew off (people and vehicles are removed) and the game goes on.
//
// What happens in a field follows its ACTIVITY (CropDefs.Act):
//   plow            tractor on the lanes at the plough frontier              (levelled paddy: two farmers digging by hand)
//   sow             two farmers walking the lanes, throwing seed
//   transplant      a line of bent farmers planting rice seedlings           (creeping across the paddy)
//   weed            farmers bent over the rows
//   irrigate        a farmer with a spade at the water inlet
//   spray           a farmer with a knapsack sprayer walking the lanes
//   harvestCombine  combine harvester + a pickup waiting on the bank        (levelled paddy: sickle crew instead)
//   harvestHand     a line of farmers cutting with sickles + one carrying bundles to the bank
//   pick            pickers reaching up to the fruit / bending to the vegetables
//   thresh          farmers feeding the thresher + one carrying sacks
//   haul            pickup shuttling on the bank lane                        (levelled paddy: farmers carrying baskets on their heads)
//   graze           a herdsman with the cows
import * as THREE from 'three';
import type { PeopleManager } from '../people/PeopleManager';
import { Person } from '../people/Person';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { DriveInput, Vehicle } from '../vehicles/Vehicle';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { SPECS, groundY } from '../vehicles/VehicleSpec';
import { mulberry32 } from '../world/Seed';
import { farmerLook, planJobs, pursue, tri, type WSpec } from './FarmJobs';
import { FARM_FIELDS } from './FarmFields';
import type { Field } from './FarmPlan';

export interface CrewDeps {
  people: PeopleManager;
  vehicles: VehicleManager;
  terrain: TerrainGenerator;
}

const CREW_R = 165; // people: a field is up to ~50 m wide, and PeopleManager removes anybody beyond 240 m
const VEH_R = 200; // vehicles (physics is active within 300 m)
const HYST = 25;

interface Worker { p: Person; f: Field; s: WSpec; t: number; ph: number }
interface FVeh { v: Vehicle; drv: Person; f: Field; route: [number, number][]; i: number; speed: number; park: boolean; input: DriveInput; stuck: number }
interface FieldCrew { f: Field; workers: Worker[]; vehicles: FVeh[]; vehDone: boolean; seed: number }

export class FarmCrew {
  private readonly crews = new Map<number, FieldCrew>();
  private readonly byPerson = new Map<Person, Worker>();
  private readonly released: { v: Vehicle; t: number }[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private scan = 0;
  private t = 0;
  private dead = false;
  private cleanup = false;

  constructor(private readonly d: CrewDeps) {
    d.people.workHook = (p, dt) => {
      try {
        this.work(p, dt);
      } catch (e) {
        // inside PeopleManager's own loop: do not touch the people list here, just stop and clean up on the next update
        console.error('[FarmCrew] switched off after an error:', e);
        this.dead = true;
        this.cleanup = true;
        d.people.workHook = null;
        p.worker = false;
        p.task = 'idle';
      }
    };
  }

  get workerCount(): number { return this.byPerson.size; }
  get vehicleCount(): number { let n = 0; for (const c of this.crews.values()) n += c.vehicles.length; return n; }
  get active(): boolean { return !this.dead; }

  update(dt: number, px: number, pz: number): void {
    if (this.cleanup) { this.cleanup = false; this.removeEverything(); }
    if (this.dead) return;
    try {
      this.step(dt, px, pz);
    } catch (e) {
      console.error('[FarmCrew] switched off after an error:', e);
      this.shutdown();
    }
  }

  dispose(): void {
    this.shutdown();
  }

  // ------------------------------------------------------------------ main step
  private step(dt: number, px: number, pz: number): void {
    this.t += dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.5;
      for (const f of FARM_FIELDS) {
        const dist = Math.hypot(f.cx - px, f.cz - pz);
        const cr = this.crews.get(f.id);
        if (!cr) { if (dist <= CREW_R && this.crews.size < 16) this.spawnCrew(f); continue; }
        if (dist > CREW_R + HYST) { this.removeCrew(cr); continue; }
        if (!cr.vehDone && dist <= VEH_R) this.spawnVehicles(cr);
        else if (cr.vehDone && cr.vehicles.length > 0 && dist > VEH_R + HYST) this.removeVehicles(cr);
      }
      // abandoned machines (the player drove one and left it): remove when far away
      for (let i = this.released.length - 1; i >= 0; i--) {
        const r = this.released[i];
        if (r.v === this.d.vehicles.driver) continue;
        r.v.getWorldPosition(this.tmp);
        if (Math.hypot(this.tmp.x - px, this.tmp.z - pz) > 280) {
          const who = this.d.vehicles.remove(r.v);
          if (who && who !== 'player') this.d.people.dispose(who);
          this.released.splice(i, 1);
        }
      }
    }
    for (const cr of this.crews.values()) {
      for (let i = cr.workers.length - 1; i >= 0; i--) {
        const w = cr.workers[i];
        const gone = w.p.model.root.parent === null || w.p.dead;
        if (gone) { this.byPerson.delete(w.p); w.p.worker = false; cr.workers.splice(i, 1); continue; }
        if (w.p.task === 'idle' || w.p.task === 'wander') w.p.task = 'work'; // scared away earlier: back to work
        if (w.p.task !== 'work') w.p.model.setWork(null);
      }
      for (let i = cr.vehicles.length - 1; i >= 0; i--) {
        const fv = cr.vehicles[i];
        if (fv.v === this.d.vehicles.driver || fv.v.state === 'wrecked' || fv.v.upY < 0.3 || fv.stuck > 12) {
          this.release(cr, i);
          continue;
        }
        this.drive(fv, dt);
      }
    }
  }

  // ------------------------------------------------------------------ people
  private toWorld(f: Field, lx: number, lz: number, out: { x: number; z: number }): void {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    out.x = f.cx + lx * c + lz * s;
    out.z = f.cz - lx * s + lz * c;
  }

  private ground(f: Field, x: number, z: number): number {
    const h = this.d.terrain.heightAt(x, z);
    return f.level ? Math.max(h, f.y + 0.03) : h;
  }

  private spawnCrew(f: Field): void {
    const r = mulberry32(f.seed ^ 0xc4e3), plan = planJobs(f, r);
    const cr: FieldCrew = { f, workers: [], vehicles: [], vehDone: plan.v.length === 0, seed: f.seed };
    this.crews.set(f.id, cr);
    const o = { x: 0, z: 0 };
    for (const s of plan.w) {
      const p = new Person(farmerLook(r));
      p.worker = true;
      p.heading = r() * 6.28;
      this.toWorld(f, s.x, s.z, o);
      this.tmp.set(o.x, this.ground(f, o.x, o.z), o.z);
      this.d.people.adopt(p, this.tmp, 'work');
      const w: Worker = { p, f, s, t: r() * 20, ph: r() * 6.28 };
      cr.workers.push(w);
      this.byPerson.set(p, w);
    }
  }

  private removeCrew(cr: FieldCrew): void {
    for (const w of cr.workers) {
      this.byPerson.delete(w.p);
      w.p.worker = false;
      if (w.p.task === 'work' || w.p.task === 'idle') this.d.people.dispose(w.p); // else: fleeing / fighting: leave it to the game
    }
    this.removeVehicles(cr);
    this.crews.delete(cr.f.id);
  }

  /** PeopleManager calls this every frame for a person whose task is 'work'. */
  private work(p: Person, dt: number): void {
    const w = this.byPerson.get(p);
    if (!w) { p.worker = false; p.task = 'idle'; p.timer = 1; return; }
    const f = w.f, s = w.s;
    w.t += dt;
    const target = (t: number, out: { x: number; z: number }): void => {
      let lx = s.x, lz = s.z;
      switch (s.kind) {
        case 'shuffle': lx = s.x + (((t * (s.speed ?? 0.1)) % 1) * (s.range ?? 8)); break;
        case 'lane': lz = s.z + tri((t * (s.speed ?? 1)) / (s.range ?? 40)) * (s.range ?? 40); break;
        case 'wander': lx = s.x + Math.sin(t * 0.11 + w.ph) * (s.range ?? 8) * 0.5; lz = s.z + Math.cos(t * 0.13 + w.ph) * (s.range ?? 8) * 0.5; break;
        case 'ferry': {
          const bx = -f.w / 2 - 3, L = Math.max(4, Math.abs(s.x - bx)), u = tri((t * (s.speed ?? 1)) / L);
          lx = s.x + (bx - s.x) * u;
          break;
        }
        default: break;
      }
      this.toWorld(f, lx, lz, out);
    };
    const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
    target(w.t, a);
    const dx = a.x - p.world.x, dz = a.z - p.world.z, dist = Math.hypot(dx, dz);
    if (dist > 1.5) { // far from the place (just came back from running away): walk there
      const step = Math.min(dist, 1.8 * dt);
      p.world.x += (dx / dist) * step; p.world.z += (dz / dist) * step;
      p.heading = Math.atan2(dx, dz);
      p.speed = 1.8; p.mode = 'walk';
      p.model.setWork(s.pose === 'carry' ? 'carry' : null);
    } else {
      p.world.x = a.x; p.world.z = a.z;
      const moving = s.kind === 'lane' || s.kind === 'ferry';
      if (moving || s.kind === 'wander') {
        target(w.t + 0.4, b);
        if (Math.hypot(b.x - a.x, b.z - a.z) > 0.01) p.heading = Math.atan2(b.x - a.x, b.z - a.z);
      } else {
        const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
        p.heading = Math.atan2(c, -sn); // facing the field's +x (along the rows)
      }
      p.speed = moving ? s.speed ?? 1 : 0;
      p.mode = moving ? 'walk' : 'idle';
      p.model.setWork(s.pose);
    }
    p.world.y = this.ground(f, p.world.x, p.world.z);
  }

  // ------------------------------------------------------------------ vehicles
  private spawnVehicles(cr: FieldCrew): void {
    cr.vehDone = true;
    const f = cr.f, r = mulberry32(cr.seed ^ 0x7e11), plan = planJobs(f, mulberry32(f.seed ^ 0xc4e3));
    for (const vs of plan.v) {
      const spec = SPECS[vs.id];
      const o = { x: 0, z: 0 }, o2 = { x: 0, z: 0 };
      this.toWorld(f, vs.route[0][0], vs.route[0][1], o);
      const next = vs.route[1] ?? [vs.route[0][0], vs.route[0][1] + 1];
      this.toWorld(f, next[0], next[1], o2);
      const yaw = vs.park ? Math.atan2(Math.sin(f.yaw), Math.cos(f.yaw)) : Math.atan2(o2.x - o.x, o2.z - o.z);
      const world = new THREE.Vector3(o.x, this.d.terrain.heightAt(o.x, o.z) - groundY(spec) + 0.3, o.z);
      const drv = new Person(farmerLook(r));
      drv.worker = true;
      const v = this.d.vehicles.spawn(spec, world, yaw, drv, vs.id === 'pickup' ? 0xf4f1ea : undefined);
      v.persistent = true;
      const world2: [number, number][] = vs.route.map(([lx, lz]) => { const q = { x: 0, z: 0 }; this.toWorld(f, lx, lz, q); return [q.x, q.z]; });
      const input: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false, throttleAmt: 0, brakeAmt: 0 };
      v.tourInput = input;
      cr.vehicles.push({ v, drv, f, route: world2, i: vs.route.length > 1 ? 1 : 0, speed: vs.speed, park: !!vs.park, input, stuck: 0 });
    }
  }

  private removeVehicles(cr: FieldCrew): void {
    for (let i = cr.vehicles.length - 1; i >= 0; i--) {
      const fv = cr.vehicles[i];
      if (fv.v === this.d.vehicles.driver) { this.release(cr, i); continue; }
      fv.v.tourInput = null;
      const who = this.d.vehicles.remove(fv.v);
      if (who && who !== 'player') this.d.people.dispose(who);
      cr.vehicles.splice(i, 1);
    }
  }

  /** The player took the machine (or it crashed / got stuck): stop steering it; it stays until the player is far away. */
  private release(cr: FieldCrew, i: number): void {
    const fv = cr.vehicles[i];
    fv.v.tourInput = null;
    fv.drv.worker = false; // the farmer (thrown out of the cab) is an ordinary pedestrian from now on
    this.released.push({ v: fv.v, t: this.t });
    cr.vehicles.splice(i, 1);
  }

  /** Pure pursuit on the lane route: steer to the next point, hold the lane speed. */
  private drive(fv: FVeh, dt: number): void {
    const inp = fv.input, v = fv.v;
    if (fv.park) { inp.throttle = false; inp.brake = true; inp.handbrake = true; inp.throttleAmt = 0; inp.brakeAmt = 1; inp.steer = 0; return; }
    v.physWorld(this.pos);
    v.forwardVector(this.fwd);
    if (Math.hypot(fv.route[fv.i][0] - this.pos.x, fv.route[fv.i][1] - this.pos.z) < 4.5) fv.i = (fv.i + 1) % fv.route.length;
    const sp = v.forwardSpeed;
    const c = pursue(this.fwd.x, this.fwd.z, this.pos.x, this.pos.z, fv.route[fv.i][0], fv.route[fv.i][1], sp, fv.speed);
    inp.steer = c.steer;
    inp.throttleAmt = c.throttle;
    inp.brakeAmt = c.brake;
    inp.throttle = c.throttle > 0.04;
    inp.brake = c.brake > 0.04;
    inp.handbrake = false;
    fv.stuck = Math.abs(sp) < 0.25 && inp.throttleAmt > 0.5 ? fv.stuck + dt : Math.max(0, fv.stuck - dt);
  }

  // ------------------------------------------------------------------ shutdown
  private shutdown(): void {
    this.dead = true;
    this.d.people.workHook = null;
    this.removeEverything();
  }

  private removeEverything(): void {
    for (const cr of [...this.crews.values()]) {
      try { this.removeCrew(cr); } catch { /* ignore */ }
    }
    for (const r of this.released) {
      try { const who = this.d.vehicles.remove(r.v); if (who && who !== 'player') this.d.people.dispose(who); } catch { /* ignore */ }
    }
    this.released.length = 0;
    this.byPerson.clear();
    this.crews.clear();
  }
}
