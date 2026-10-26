// Every building model of src/buildings/models, standing at its spot from Placements.ts. POSITION ONLY (prototype):
//  - no flat terrain pad, no colliders, no footpaths yet: the surface merge comes later
//  - each model stands on a plain concrete plinth reaching from its footprint's highest ground point down to its lowest, so nothing floats or sinks
//  - a model is only BUILT when the player comes within BUILD_DIST (the big ones are heavy), and hidden again beyond HIDE_DIST
import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { BUILDING_MODEL_BY_ID } from './models/registry';
import type { BuiltBuilding } from './models/BuildingKit';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from './Placements';

export interface PlacedBuildingsDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: TerrainGenerator;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

// Was 1100 / 1400: buildings only popped up when the player was almost next to them. 2000 m is the end of the detailed terrain (LOD2);
// the fog thins them out but the shape stays visible from far away.
const BUILD_DIST = 2000;
const HIDE_DIST = 2300;
/** Big models are heavy to build: at most this many are built per frame (nearest first), so the game never stalls. */
const MAX_BUILDS_PER_FRAME = 1;
/** Minimap dot colour per model group. */
const GROUP_COLOR: Record<string, string> = {
  residential: '#facc15', commercial: '#fb923c', industrial: '#a78bfa', civic: '#60a5fa', education: '#2dd4bf',
  health: '#f87171', religious: '#34d399', utility: '#cbd5e1', transport: '#94a3b8', recreation: '#f472b6',
};

interface Slot {
  p: BuildingPlacement;
  floorY: number;
  minY: number;
  built: BuiltBuilding | null;
  plinth: THREE.Mesh | null;
  shown: boolean;
}

export class PlacedBuildings {
  private slots: Slot[] = [];
  private plinthMat = new THREE.MeshLambertMaterial({ color: 0xa8a49a });
  private p = new THREE.Vector3();

  constructor(private d: PlacedBuildingsDeps) {
    for (const p of BUILDING_PLACEMENTS) {
      if (!BUILDING_MODEL_BY_ID[p.id]) continue;
      // ground range under the (rotated) footprint
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      let mn = 1e9, mx = -1e9;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * (p.W / 2), lz = (j / 2) * (p.D / 2);
        const h = d.terrain.heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
        mn = Math.min(mn, h); mx = Math.max(mx, h);
      }
      this.slots.push({ p, floorY: mx + 0.02, minY: mn, built: null, plinth: null, shown: false });
    }
  }

  /** Minimap dots (world x, z + colour of the building group). */
  /** Position + floor height of the first hand placed building with this model id (null if there is none): lets other systems (the lighthouse light) stand on it. */
  anchorOf(id: string): { x: number; z: number; floorY: number } | null {
    const sl = this.slots.find((s) => s.p.id === id);
    return sl ? { x: sl.p.x, z: sl.p.z, floorY: sl.floorY } : null;
  }

  /** Minimap dots (world x, z + colour of the building group). */
  get markers(): { x: number; z: number; color: string }[] {
    return this.slots.map((sl) => ({ x: sl.p.x, z: sl.p.z, color: GROUP_COLOR[BUILDING_MODEL_BY_ID[sl.p.id]!.group] ?? '#fff' }));
  }

  private show(sl: Slot): void {
    if (!sl.built) {
      const { p } = sl;
      const b = BUILDING_MODEL_BY_ID[p.id]!.build(p.seed ?? 0);
      b.root.position.set(p.x, sl.floorY, p.z);
      b.root.rotation.y = p.yaw;
      this.d.root.add(b.root);
      sl.built = b;
      // plinth: from the lowest ground point up to just under the model's own ground slab (6 cm thick)
      const h = sl.floorY - sl.minY + 0.5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.W, h, p.D), this.plinthMat);
      m.position.set(p.x, sl.floorY - h / 2 - 0.005, p.z);
      m.rotation.y = p.yaw;
      this.d.root.add(m);
      sl.plinth = m;
    }
    sl.built.root.visible = true;
    sl.plinth!.visible = true;
    sl.shown = true;
  }

  private hide(sl: Slot): void {
    if (sl.built) sl.built.root.visible = false;
    if (sl.plinth) sl.plinth.visible = false;
    sl.shown = false;
  }

  /** Once per rendered frame. */
  update(): void {
    this.d.playerWorld(this.p);
    let builds = 0;
    // nearest first: sort only the slots that still have to be built
    const pending: { sl: Slot; dist: number }[] = [];
    for (const sl of this.slots) {
      const dist = Math.hypot(this.p.x - sl.p.x, this.p.z - sl.p.z);
      if (dist < BUILD_DIST) {
        if (sl.built) {
          if (!sl.shown) this.show(sl); // already built once: showing it again is cheap
        } else pending.push({ sl, dist });
      } else if (sl.shown && dist > HIDE_DIST) this.hide(sl);
    }
    if (pending.length > 1) pending.sort((a, b) => a.dist - b.dist);
    for (const { sl } of pending) {
      if (builds >= MAX_BUILDS_PER_FRAME) break;
      this.show(sl);
      builds++;
    }
  }

  dispose(): void {
    for (const sl of this.slots) {
      if (sl.built) {
        this.d.root.remove(sl.built.root);
        sl.built.dispose();
      }
      if (sl.plinth) {
        this.d.root.remove(sl.plinth);
        sl.plinth.geometry.dispose();
      }
    }
    this.plinthMat.dispose();
    this.slots = [];
  }
}
