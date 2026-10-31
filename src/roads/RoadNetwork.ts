import type { WorldFrame } from '../geo';
import type { RoadClass, RoadsFile } from './RoadData';

export interface RoadLine {
  id: string;
  name: string;
  kind: RoadClass;
  width: number;
  /** Scene coordinates (x east, z south), metres. */
  xs: Float64Array;
  zs: Float64Array;
  length: number;
}

export interface AreaPoly {
  id: string;
  name: string;
  xs: Float64Array;
  zs: Float64Array;
}

const CELL = 32;

/**
 * All roads of the loaded cities in scene coordinates, with a fast "what am I driving on" query for the vehicle physics
 * (`surfaceAt`: 1 = asphalt, 0 = natural ground). Pure TypeScript, no three.js.
 */
export class RoadNetwork {
  readonly roads: RoadLine[] = [];
  readonly areas: AreaPoly[] = [];
  /** cell -> segment ids (road index * 65536 + segment index) and area indices. */
  private readonly segCells = new Map<number, number[]>();
  private readonly areaCells = new Map<number, number[]>();

  constructor(files: readonly RoadsFile[], frame: WorldFrame) {
    for (const f of files) {
      for (const r of f.roads) {
        const n = r.points.length;
        const xs = new Float64Array(n);
        const zs = new Float64Array(n);
        let length = 0;
        for (let i = 0; i < n; i++) {
          xs[i] = frame.toX(r.points[i][0]);
          zs[i] = frame.toZ(r.points[i][1]);
          if (i > 0) length += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
        }
        const ri = this.roads.length;
        this.roads.push({ id: r.id, name: r.name, kind: r.kind, width: r.width, xs, zs, length });
        for (let i = 0; i < n - 1; i++) {
          const pad = r.width / 2 + 1;
          this.addToCells(this.segCells, ri * 65536 + i, Math.min(xs[i], xs[i + 1]) - pad, Math.min(zs[i], zs[i + 1]) - pad, Math.max(xs[i], xs[i + 1]) + pad, Math.max(zs[i], zs[i + 1]) + pad);
        }
      }
      for (const a of f.areas) {
        const xs = Float64Array.from(a.points, (p) => frame.toX(p[0]));
        const zs = Float64Array.from(a.points, (p) => frame.toZ(p[1]));
        const ai = this.areas.length;
        this.areas.push({ id: a.id, name: a.name, xs, zs });
        this.addToCells(this.areaCells, ai, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
      }
    }
  }

  private addToCells(map: Map<number, number[]>, id: number, x0: number, z0: number, x1: number, z1: number): void {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const key = cx * 100003 + cz;
        const list = map.get(key);
        if (list) list.push(id);
        else map.set(key, [id]);
      }
    }
  }

  /** Surface under scene position (x, z): 1 = asphalt (road or paved area), 0 = natural ground. */
  surfaceAt(x: number, z: number): 0 | 1 | 2 {
    const key = Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
    const segs = this.segCells.get(key);
    if (segs) {
      for (const id of segs) {
        const road = this.roads[Math.floor(id / 65536)];
        if (segmentDistance(x, z, road, id % 65536) <= road.width / 2) return 1;
      }
    }
    const areas = this.areaCells.get(key);
    if (areas) for (const ai of areas) if (inPolygon(x, z, this.areas[ai])) return 1;
    return 0;
  }

  /** Closest road centre line (brute force, for HUD / tools, not for physics). */
  nearest(x: number, z: number): { road: RoadLine; distance: number } | null {
    let best: { road: RoadLine; distance: number } | null = null;
    for (const road of this.roads) {
      for (let i = 0; i < road.xs.length - 1; i++) {
        const d = segmentDistance(x, z, road, i);
        if (!best || d < best.distance) best = { road, distance: d };
      }
    }
    return best;
  }

  area(id: string): AreaPoly | undefined {
    return this.areas.find((a) => a.id === id);
  }
}

function segmentDistance(px: number, pz: number, r: RoadLine, i: number): number {
  const ax = r.xs[i];
  const az = r.zs[i];
  const dx = r.xs[i + 1] - ax;
  const dz = r.zs[i + 1] - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function inPolygon(x: number, z: number, a: AreaPoly): boolean {
  let inside = false;
  const n = a.xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (a.zs[i] > z !== a.zs[j] > z && x < ((a.xs[j] - a.xs[i]) * (z - a.zs[i])) / (a.zs[j] - a.zs[i]) + a.xs[i]) inside = !inside;
  }
  return inside;
}
