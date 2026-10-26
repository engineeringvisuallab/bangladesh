// FARM MANAGER: all crop fields of the open world (the committed table FarmFields.ts), streamed around the player.
//   within 1.3 km   ground layer (textures, terraces, flooded paddy)           - cheap, built 2 per frame at most
//   within 380 m    plants (instanced crops, trees, banana, tea ...)           - 1 per frame
//   within 240 m    people + machines (tractor, combine, drone, farmers, cows) - 1 per frame, animated
// Children of `root` use ABSOLUTE world coordinates (like every other manager); each field sits in its own group (position + yaw).
import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { ACT_BN, STAGE_BN, cropById } from './CropDefs';
import { buildActors, type Actor } from './FarmActors';
import { FarmCrew } from './FarmCrew';
import type { PeopleManager } from '../people/PeopleManager';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { FARM_FIELDS, FARM_INDEX } from './FarmFields';
import type { Field } from './FarmPlan';
import { HeightGrid, buildGround, buildPlants, disposeField, windUniform } from './FarmRenderer';

export interface FarmDeps {
  root: THREE.Object3D;
  terrain: TerrainGenerator;
  /** World position of the player (capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** With these two the fields get REAL farmers and machines (FarmCrew); without them only the props. */
  people?: PeopleManager;
  vehicles?: VehicleManager;
}

const GROUND_R = 1300;
const PLANT_R = 380;
const ACTOR_R = 240;
const HYST = 80;

interface Live {
  f: Field;
  root: THREE.Group;
  grid: HeightGrid;
  ground: THREE.Group;
  plants: THREE.Group | null;
  actors: Actor | null;
  actorsTried: boolean;
}

export interface FieldInfo { field: Field; crop: string; stage: string; work: string }

export class FarmManager {
  readonly group = new THREE.Group();
  private readonly live = new Map<number, Live>();
  private readonly p = new THREE.Vector3();
  private readonly cand: { f: Field; d: number }[] = FARM_FIELDS.map((f) => ({ f, d: 0 }));
  private t = 0;
  private disabled = false;
  readonly crew: FarmCrew | null;

  constructor(private readonly deps: FarmDeps) {
    this.group.name = 'EVFarm';
    deps.root.add(this.group);
    this.crew = deps.people && deps.vehicles ? new FarmCrew({ people: deps.people, vehicles: deps.vehicles, terrain: deps.terrain }) : null;
  }

  /** The field under world point (x, z), with Bangla names for the HUD, or null. */
  info(x: number, z: number): FieldInfo | null {
    if (this.disabled) return null;
    if (!FARM_INDEX.covers(x, z, 0)) return null;
    const f = FARM_INDEX.at(x, z)!;
    const c = cropById(f.crop);
    return { field: f, crop: c.bn, stage: STAGE_BN[f.stage], work: ACT_BN[f.act] };
  }

  get liveCount(): number { return this.live.size; }

  /** Fail-safe: an error in the farm code switches the farm off (fields removed, crew stopped) - the rest of the game keeps running. */
  update(dt: number): void {
    if (this.disabled) return;
    try {
      this.step(dt);
    } catch (e) {
      console.error('[Farm] switched off after an error:', e);
      this.disabled = true;
      try { this.dispose(); } catch { /* ignore */ }
    }
  }

  private step(dt: number): void {
    this.t += dt;
    windUniform.value = this.t;
    this.deps.playerWorld(this.p);
    const px = this.p.x, pz = this.p.z;
    this.crew?.update(dt, px, pz);
    for (const c of this.cand) c.d = Math.hypot(c.f.cx - px, c.f.cz - pz);
    this.cand.sort((a, b) => a.d - b.d);
    let gb = 0, pb = 0, ab = 0;
    for (const { f, d } of this.cand) {
      let lv = this.live.get(f.id);
      if (d > GROUND_R + HYST) { if (lv) this.remove(f.id); continue; }
      if (!lv) {
        if (d > GROUND_R || gb >= 2) continue;
        lv = this.create(f);
        gb++;
      }
      if (d <= PLANT_R && !lv.plants && pb < 1) { lv.plants = buildPlants(f, lv.grid); lv.root.add(lv.plants); pb++; }
      else if (d > PLANT_R + HYST && lv.plants) { lv.root.remove(lv.plants); disposeField(lv.plants); lv.plants = null; }
      if (d <= ACTOR_R && !lv.actorsTried && ab < 1) {
        lv.actorsTried = true;
        lv.actors = buildActors(f, lv.grid);
        if (lv.actors) lv.root.add(lv.actors.group);
        ab++;
      } else if (d > ACTOR_R + HYST && lv.actorsTried) {
        if (lv.actors) { lv.root.remove(lv.actors.group); this.freeActors(lv.actors.group); }
        lv.actors = null; lv.actorsTried = false;
      }
      if (lv.actors && d <= ACTOR_R) lv.actors.tick(this.t);
    }
  }

  private create(f: Field): Live {
    const root = new THREE.Group();
    root.position.set(f.cx, f.y, f.cz);
    root.rotation.y = f.yaw;
    root.name = `field-${f.id}`;
    const grid = new HeightGrid(f, (x, z) => this.deps.terrain.heightAt(x, z));
    const ground = buildGround(f, grid);
    root.add(ground);
    this.group.add(root);
    const lv: Live = { f, root, grid, ground, plants: null, actors: null, actorsTried: false };
    this.live.set(f.id, lv);
    return lv;
  }

  private freeActors(g: THREE.Object3D): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.userData.own) return;
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      m.geometry?.dispose();
      const mt = m.material as THREE.Material | undefined;
      mt?.dispose();
    });
  }

  private remove(id: number): void {
    const lv = this.live.get(id);
    if (!lv) return;
    if (lv.plants) disposeField(lv.plants);
    if (lv.actors) this.freeActors(lv.actors.group);
    disposeField(lv.ground);
    this.group.remove(lv.root);
    this.live.delete(id);
  }

  dispose(): void {
    this.crew?.dispose();
    for (const id of [...this.live.keys()]) this.remove(id);
    this.deps.root.remove(this.group);
  }
}
