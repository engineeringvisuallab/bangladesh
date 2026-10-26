import * as THREE from 'three';
import type { CitySite, TerrainGenerator } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { RoadGraph, RoadPoint } from './RoadGraph';

/** One bus stop: a shelter at the kerb of one road direction, and the lane spot where a bus halts. */
export interface BusStop {
  id: number;
  roadId: number;
  s: number;
  dir: 1 | -1;
  /** Shelter position (world). */
  x: number;
  z: number;
  y: number;
  /** Where the middle of a bus stops (world, in the lane). */
  sx: number;
  sz: number;
  /** Unit travel direction of that lane. */
  hx: number;
  hz: number;
}

const SPACING = 200;
const SHOW_RADIUS = 280;
const POOL = 18;
const P: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
const L: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };

/**
 * Bus stops along the streets of the city areas, one per travel direction (left-hand traffic: the shelter stands at
 * the left kerb). The positions are fixed data (found once from the road graph); only the shelters near the player
 * are drawn (a small pool of models). Buses stop at them (AIDriver) and the minimap shows them.
 */
export class BusStops {
  readonly stops: BusStop[] = [];
  private cells = new Map<string, number[]>();
  private pool: THREE.Group[] = [];
  private shown = new Map<number, THREE.Group>();
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private timer = 0;

  constructor(private d: { scene: THREE.Scene; origin: FloatingOrigin; terrain: TerrainGenerator; graph: RoadGraph; sites: CitySite[] }) {
    this.build();
    for (let i = 0; i < POOL; i++) {
      const g = this.makeShelter();
      g.visible = false;
      d.scene.add(g);
      this.pool.push(g);
    }
  }

  private build(): void {
    const g = this.d.graph;
    for (let r = 0; r < g.roads.length; r++) {
      const road = g.roads[r];
      if (road.kind === 'highway' || road.kind === 'roundabout' || road.length < 250) continue;
      const offset = 70 + ((r * 97) % 120);
      for (let s = offset; s < road.length - 70; s += SPACING) {
        g.at(r, s, 1, 0, P);
        let near = false;
        for (const site of this.d.sites) if (Math.hypot(site.x - P.x, site.z - P.z) < site.coreRadius + 450) near = true;
        if (!near) continue;
        if (g.onBridge(r, s - 20) || g.onBridge(r, s) || g.onBridge(r, s + 20)) continue;
        let clear = true;
        for (const st of g.stations(r)) if (Math.abs(st.s - s) < 45) clear = false;
        if (!clear) continue;
        for (const dir of [1, -1] as const) {
          g.at(r, s, dir, g.laneOffset(r), L); // bus lane
          g.at(r, s, dir, road.halfWidth + road.shoulder * 0.7 + 0.9, P); // shelter, left kerb
          const id = this.stops.length;
          const y = this.d.terrain.heightAt(P.x, P.z);
          this.stops.push({ id, roadId: r, s, dir, x: P.x, z: P.z, y, sx: L.x, sz: L.z, hx: L.hx, hz: L.hz });
          const key = this.key(P.x, P.z);
          const list = this.cells.get(key);
          if (list) list.push(id);
          else this.cells.set(key, [id]);
        }
      }
    }
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / 150)},${Math.floor(z / 150)}`;
  }

  /** Nearest stop in front of a bus (within 110 m, in its own lane and direction) that it has not served yet. */
  nextAhead(x: number, z: number, fx: number, fz: number, served: Set<number>): BusStop | null {
    const cx = Math.floor(x / 150);
    const cz = Math.floor(z / 150);
    let best: BusStop | null = null;
    let bd = 110;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.cells.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const id of list) {
          if (served.has(id)) continue;
          const st = this.stops[id];
          const dx = st.sx - x;
          const dz = st.sz - z;
          const along = dx * fx + dz * fz;
          if (along < -1 || along > bd) continue;
          if (Math.abs(dx * fz - dz * fx) > 4.5) continue;
          if (st.hx * fx + st.hz * fz < 0.85) continue;
          bd = along;
          best = st;
        }
      }
    }
    return best;
  }

  /** Every frame: shelters near the focus are drawn, far ones are hidden. */
  update(dt: number, focus: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const want = new Set<number>();
    const cx = Math.floor(focus.x / 150);
    const cz = Math.floor(focus.z / 150);
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        for (const id of this.cells.get(`${cx + i},${cz + j}`) ?? []) {
          const st = this.stops[id];
          if (Math.hypot(st.x - focus.x, st.z - focus.z) < SHOW_RADIUS) want.add(id);
        }
      }
    }
    for (const [id, g] of this.shown) {
      if (!want.has(id)) {
        g.visible = false;
        this.pool.push(g);
        this.shown.delete(id);
      }
    }
    for (const id of want) {
      if (this.shown.has(id)) continue;
      const g = this.pool.pop();
      if (!g) break;
      const st = this.stops[id];
      g.userData.world = new THREE.Vector3(st.x, st.y, st.z);
      g.rotation.y = Math.atan2(st.hx, st.hz);
      g.visible = true;
      this.shown.set(id, g);
    }
  }

  /** Floating origin: place the shown shelters (call every frame, cheap). */
  place(): void {
    const o = this.d.origin.origin;
    for (const g of this.shown.values()) {
      const w = g.userData.world as THREE.Vector3;
      g.position.set(w.x - o.x, w.y, w.z - o.z);
    }
  }

  private makeShelter(): THREE.Group {
    const grp = new THREE.Group();
    const mat = (c: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: c, ...extra });
      this.mats.push(m);
      return m;
    };
    const add = (w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, l);
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
    };
    const steel = mat(0x4b5359);
    const roof = mat(0x1f6fb5);
    const glass = mat(0x9fc6d8, { transparent: true, opacity: 0.35 });
    const wood = mat(0x8a5a33);
    const sign = mat(0x1456a8, { emissive: 0x06224a });
    const white = mat(0xffffff, { emissive: 0x555555 });
    // model: +Z = travel direction, +X = kerb side (left), the open side faces the road (-X)
    add(1.7, 0.12, 4.2, mat(0xb9b6ae), 0, 0.06, 0); // pad
    add(0.08, 2.5, 0.08, steel, 0.8, 1.25, 1.9);
    add(0.08, 2.5, 0.08, steel, 0.8, 1.25, -1.9);
    add(0.08, 2.2, 0.08, steel, -0.8, 1.1, 1.9);
    add(0.08, 2.2, 0.08, steel, -0.8, 1.1, -1.9);
    add(1.9, 0.12, 4.4, roof, 0.05, 2.5, 0); // roof
    add(0.05, 1.5, 4.0, glass, 0.82, 1.35, 0); // back panel
    add(0.5, 0.08, 3.0, wood, 0.5, 0.5, 0); // bench
    add(0.5, 0.1, 0.5, steel, 0.5, 0.25, 1.2);
    add(0.5, 0.1, 0.5, steel, 0.5, 0.25, -1.2);
    // bus stop sign post in front of the shelter
    add(0.07, 3.0, 0.07, steel, -1.0, 1.5, 2.8);
    add(0.7, 0.7, 0.06, sign, -1.0, 3.0, 2.8);
    add(0.3, 0.38, 0.07, white, -1.0, 3.0, 2.8);
    return grp;
  }

  dispose(): void {
    for (const g of this.pool) g.removeFromParent();
    for (const g of this.shown.values()) g.removeFromParent();
    for (const geo of this.geos) geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
