/**
 * ENGINEERING AREA BOUNDARY FENCE - the layout (pure numbers, no three.js, so it can be tested headless).
 * PROTOTYPE: every engineering area (EngineeringZones.ts) is closed in by a plain fence along its rectangle. No gates.
 * The fence only stops where a public road crosses it (otherwise the fence would cut the road): that is a gap in the fence, not an entrance.
 * The shape is a simple rectangle for now and will be refined later; only `buildFenceLayout` has to change then.
 */
import { ENGINEERING_GATES, type EngineeringArea } from './EngineeringZones';

export const FENCE = {
  /** Length of one visible panel (m). */
  pieceLen: 6,
  /** Length of one physics collider (m): longer than a panel, fewer colliders. */
  colliderLen: 12,
  /** Fence stays this far (m) away from the edge of the road shoulder. */
  roadMargin: 3,
} as const;

export interface FencePiece { ax: number; az: number; bx: number; bz: number }

export interface FenceLayout {
  areaId: string;
  /** Panels (visual). */
  visual: FencePiece[];
  /** Colliders (same line, longer pieces). */
  solid: FencePiece[];
  /** The 4 corners (taller coloured posts). */
  corners: { x: number; z: number }[];
  perimeter: number;
  /** Total length (m) left open for roads. */
  gapLength: number;
}

export interface RoadLike { xs: ArrayLike<number>; zs: ArrayLike<number>; halfWidth: number; shoulder: number }

const CELL = 64;

/** Spatial hash of road segments: "is this point on / right next to a road?" */
export class RoadHash {
  private cells = new Map<number, { ax: number; az: number; bx: number; bz: number; w: number }[]>();
  private key(i: number, j: number): number { return (i + 512) * 4096 + (j + 512); }

  constructor(roads: readonly RoadLike[], extra: number = FENCE.roadMargin) {
    for (const r of roads) {
      const w = r.halfWidth + r.shoulder + extra;
      for (let k = 0; k + 1 < r.xs.length; k++) {
        const seg = { ax: r.xs[k], az: r.zs[k], bx: r.xs[k + 1], bz: r.zs[k + 1], w };
        const i0 = Math.floor((Math.min(seg.ax, seg.bx) - w) / CELL), i1 = Math.floor((Math.max(seg.ax, seg.bx) + w) / CELL);
        const j0 = Math.floor((Math.min(seg.az, seg.bz) - w) / CELL), j1 = Math.floor((Math.max(seg.az, seg.bz) + w) / CELL);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const kk = this.key(i, j);
          let l = this.cells.get(kk);
          if (!l) { l = []; this.cells.set(kk, l); }
          l.push(seg);
        }
      }
    }
  }

  near(x: number, z: number): boolean {
    const l = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return false;
    for (const s of l) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
      const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      if (Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz)) < s.w) return true;
    }
    return false;
  }
}

/** Is the middle of this fence piece inside the area's entrance gate? */
function inGate(a: EngineeringArea, mx: number, mz: number): boolean {
  const g = ENGINEERING_GATES[a.id];
  if (!g) return false;
  const half = g.width / 2;
  if (g.side === 'S') return Math.abs(mz - a.z1) < 1 && Math.abs(mx - g.at) <= half;
  if (g.side === 'N') return Math.abs(mz - a.z0) < 1 && Math.abs(mx - g.at) <= half;
  if (g.side === 'E') return Math.abs(mx - a.x1) < 1 && Math.abs(mz - g.at) <= half;
  return Math.abs(mx - a.x0) < 1 && Math.abs(mz - g.at) <= half;
}

function cut(a: EngineeringArea, step: number, hash: RoadHash): { pieces: FencePiece[]; gap: number } {
  const c: [number, number][] = [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]];
  const pieces: FencePiece[] = [];
  let gap = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = c[i], [x1, z1] = c[(i + 1) % 4];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const ax = x0 + ((x1 - x0) * k) / n, az = z0 + ((z1 - z0) * k) / n;
      const bx = x0 + ((x1 - x0) * (k + 1)) / n, bz = z0 + ((z1 - z0) * (k + 1)) / n;
      if (hash.near(ax, az) || hash.near(bx, bz) || hash.near((ax + bx) / 2, (az + bz) / 2) || inGate(a, (ax + bx) / 2, (az + bz) / 2)) { gap += len / n; continue; }
      pieces.push({ ax, az, bx, bz });
    }
  }
  return { pieces, gap };
}

export function buildFenceLayout(a: EngineeringArea, hash: RoadHash): FenceLayout {
  const v = cut(a, FENCE.pieceLen, hash);
  const s = cut(a, FENCE.colliderLen, hash);
  return {
    areaId: a.id,
    visual: v.pieces,
    solid: s.pieces,
    corners: [{ x: a.x0, z: a.z0 }, { x: a.x1, z: a.z0 }, { x: a.x1, z: a.z1 }, { x: a.x0, z: a.z1 }],
    perimeter: 2 * ((a.x1 - a.x0) + (a.z1 - a.z0)),
    gapLength: v.gap,
  };
}
