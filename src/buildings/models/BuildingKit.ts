import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { classifySurface, SURFACE_SPEC, type PartKind, type Surface, type SurfaceOverrides } from './SurfaceMap';
import { getSurfaceMaterial } from './BuildingTextures';

/**
 * BUILDING KIT - small helper to build low-poly buildings from code (no model files), same style as the
 * rocks / vehicles: flat shaded, vertex colours, ONE merged body mesh + ONE merged glass mesh per building.
 *
 * Every part also gets a real-world SURFACE (brick, plaster, tin, thatch ...) chosen from its colour + kind (see SurfaceMap.ts);
 * the parts are grouped per surface and get UVs in metres, so the textures keep the same real size on every wall.
 *
 * Conventions: metres, origin = centre of the footprint at ground level (y = 0), the front (street side) faces +Z.
 * Nothing in here knows about the game world: a building is just a THREE.Group you can place anywhere later.
 */

export type Side = 'front' | 'back' | 'left' | 'right';
const SIDE_ANGLE: Record<Side, number> = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

/** Typical storey height (m). */
export const FLOOR_H = 3.0;

export interface BuiltBuilding {
  root: THREE.Group;
  /** Footprint (m) including yard / boundary wall if the model has one. */
  width: number;
  depth: number;
  height: number;
  /** Frees the geometry (materials are shared). */
  dispose(): void;
}

/** Small deterministic random generator (for colour variants). */
export function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick<T>(seed: number, list: readonly T[]): T {
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}

export interface WindowGridOpts {
  y0: number;
  floors: number;
  floorH?: number;
  cols: number;
  ww: number;
  wh: number;
  sill: number;
  glass?: number;
  frame?: number | null;
  skip?: (floor: number, col: number) => boolean;
}

export class Kit {
  private buckets = new Map<Surface, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private toGlass = false;
  private force: Surface | null = null;

  /** @param overrides colour -> surface for this model (e.g. clay colours -> 'mud'). */
  constructor(private overrides?: SurfaceOverrides) {}

  private get cur(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** Draw everything inside `fn` with one fixed surface, whatever its colour. */
  withSurface(surface: Surface, fn: () => void): void {
    const prev = this.force;
    this.force = surface;
    fn();
    this.force = prev;
  }

  /** Draw everything inside `fn` into the glass mesh. */
  asGlass(fn: () => void): void {
    const prev = this.toGlass;
    this.toGlass = true;
    fn();
    this.toGlass = prev;
  }

  private put(g: THREE.BufferGeometry, color: number, kind: PartKind, dims: readonly [number, number, number]): void {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    geo.applyMatrix4(this.cur);
    const surf: Surface = this.toGlass ? 'glass' : this.force ?? classifySurface(kind, color, dims, this.overrides);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (surf !== 'plain') geo.setAttribute('uv', new THREE.BufferAttribute(planarUVs(pos, SURFACE_SPEC[surf].size), 2));
    let list = this.buckets.get(surf);
    if (!list) this.buckets.set(surf, (list = []));
    list.push(geo);
  }

  // ---------- transforms ----------

  withMatrix(m: THREE.Matrix4, fn: () => void): void {
    this.stack.push(this.cur.clone().multiply(m));
    fn();
    this.stack.pop();
  }

  /** Draw in a local frame: translated to (x,y,z) and turned `ry` radians about Y. */
  local(x: number, y: number, z: number, ry: number, fn: () => void): void {
    const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));
    this.withMatrix(m, fn);
  }

  /** Draw in the frame of one wall of a box-shaped building: local +x runs along the wall, local +z points outwards. */
  onSide(side: Side, cx: number, cz: number, w: number, d: number, fn: (len: number, half: number) => void): void {
    const fb = side === 'front' || side === 'back';
    this.local(cx, 0, cz, SIDE_ANGLE[side], () => fn(fb ? w : d, fb ? d / 2 : w / 2));
  }

  // ---------- primitives (y0 = bottom) ----------

  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, y0 + h / 2, cz);
    this.put(g, color, 'box', [w, h, d]);
  }

  glass(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): void {
    this.toGlass = true;
    this.box(cx, y0, cz, w, h, d, color);
    this.toGlass = false;
  }

  cyl(cx: number, y0: number, cz: number, rBottom: number, rTop: number, h: number, color: number, seg = 14): void {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
    g.translate(cx, y0 + h / 2, cz);
    this.put(g, color, 'cyl', [2 * Math.max(rBottom, rTop), h, 2 * Math.max(rBottom, rTop)]);
  }

  sphere(cx: number, cy: number, cz: number, r: number, color: number, sy = 1): void {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, sy, 1);
    g.translate(cx, cy, cz);
    this.put(g, color, 'sphere', [2 * r, 2 * r * sy, 2 * r]);
  }

  /** Gable roof: span across X, ridge along Z (length). */
  gable(cx: number, y0: number, cz: number, span: number, length: number, h: number, color: number): void {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    g.translate(cx, y0, cz - length / 2);
    this.put(g, color, 'roof', [span, h, length]);
  }

  /** Mono-pitch (shed) roof: low edge at -X, high edge at +X, runs along Z. */
  shed(cx: number, y0: number, cz: number, span: number, length: number, hLow: number, hHigh: number, color: number): void {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(span / 2, hHigh);
    s.lineTo(-span / 2, hLow);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    g.translate(cx, y0, cz - length / 2);
    this.put(g, color, 'roof', [span, hHigh, length]);
  }

  /** Half-sphere dome (base radius r, height h), sitting at y0. Use withSurface() to choose its material. */
  dome(cx: number, y0: number, cz: number, r: number, h: number, color: number, seg = 20): void {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(r, h, r);
    g.translate(cx, y0, cz);
    this.put(g, color, 'roof', [2 * r, h, 2 * r]);
  }

  /** Pointed (gothic / mughal) arch panel facing +Z: width w, total height h, thickness d. glass = true puts it in the glass mesh. */
  arch(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, glass = false): void {
    const s = new THREE.Shape();
    const sh = h * 0.58;
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, sh);
    s.quadraticCurveTo(w / 2, sh + (h - sh) * 0.75, 0, h);
    s.quadraticCurveTo(-w / 2, sh + (h - sh) * 0.75, -w / 2, sh);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 });
    g.translate(cx, y0, cz - d / 2);
    this.toGlass = glass;
    this.put(g, color, 'box', [w, h, d]);
    this.toGlass = false;
  }

  /** Four-sided pyramid / hip roof. */
  hip(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: number): void {
    const g = new THREE.ConeGeometry(1, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.5, 0);
    g.scale(w / Math.SQRT2, h, d / Math.SQRT2);
    g.translate(cx, y0, cz);
    this.put(g, color, 'roof', [w, h, d]);
  }

  // ---------- composite helpers ----------

  /** Corrugated tin roof: gable with ribs running down both slopes. Ridge along Z. */
  tinRoof(cx: number, y0: number, cz: number, span: number, length: number, h: number, base: number, rib: number): void {
    this.withSurface('tin', () => this.tinRoofParts(cx, y0, cz, span, length, h, base, rib));
  }

  private tinRoofParts(cx: number, y0: number, cz: number, span: number, length: number, h: number, base: number, rib: number): void {
    this.gable(cx, y0, cz, span, length, h, base);
    const slope = Math.hypot(span / 2, h);
    const ang = Math.atan2(h, span / 2);
    const n = Math.max(2, Math.round(length / 0.42));
    for (const s of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const z = cz - length / 2 + (length * (i + 0.5)) / n;
        const m = new THREE.Matrix4()
          .makeTranslation(cx + (s * span) / 4, y0 + h / 2, z)
          .multiply(new THREE.Matrix4().makeRotationZ(-s * ang));
        this.withMatrix(m, () => this.box(0, 0.0, 0, slope, 0.07, 0.07, rib));
      }
    }
    // ridge cap
    this.box(cx, y0 + h - 0.04, cz, 0.35, 0.1, length + 0.05, rib);
  }

  /** Window grid on one wall (glass + optional frame). Wall box is (cx,cz,w,d). */
  windowGrid(side: Side, cx: number, cz: number, w: number, d: number, o: WindowGridOpts): void {
    const fh = o.floorH ?? FLOOR_H;
    const glass = o.glass ?? 0x2f4f66;
    this.onSide(side, cx, cz, w, d, (len, half) => {
      for (let f = 0; f < o.floors; f++) {
        for (let c = 0; c < o.cols; c++) {
          if (o.skip?.(f, c)) continue;
          const t = -len / 2 + (len * (c + 0.5)) / o.cols;
          const y = o.y0 + f * fh + o.sill;
          if (o.frame != null) this.box(t, y - 0.07, half + 0.01, o.ww + 0.14, o.wh + 0.14, 0.05, o.frame);
          this.glass(t, y, half + 0.04, o.ww, o.wh, 0.05, glass);
        }
      }
    });
  }

  /** One balcony (slab + railing) on a wall, spanning t0..t1 along the wall (wall-centred coordinates). */
  balcony(side: Side, cx: number, cz: number, w: number, d: number, y: number, t0: number, t1: number, depth: number, slab: number, rail: number, glassRail = false): void {
    this.onSide(side, cx, cz, w, d, (_len, half) => {
      const mid = (t0 + t1) / 2;
      const L = t1 - t0;
      this.box(mid, y, half + depth / 2, L, 0.16, depth, slab);
      const ry = y + 0.16;
      const put = glassRail
        ? (a: number, b: number, c: number, ww: number, hh: number, dd: number) => this.glass(a, b, c, ww, hh, dd, rail)
        : (a: number, b: number, c: number, ww: number, hh: number, dd: number) => this.box(a, b, c, ww, hh, dd, rail);
      put(mid, ry, half + depth - 0.04, L, 1.0, 0.06);
      put(t0 + 0.03, ry, half + depth / 2, 0.06, 1.0, depth);
      put(t1 - 0.03, ry, half + depth / 2, 0.06, 1.0, depth);
    });
  }

  /** Parapet wall around a flat roof of a box (roof top at y). */
  parapet(cx: number, y: number, cz: number, w: number, d: number, h: number, t: number, color: number): void {
    this.box(cx, y, cz + d / 2 - t / 2, w, h, t, color);
    this.box(cx, y, cz - d / 2 + t / 2, w, h, t, color);
    this.box(cx - w / 2 + t / 2, y, cz, t, h, d - 2 * t, color);
    this.box(cx + w / 2 - t / 2, y, cz, t, h, d - 2 * t, color);
  }

  /** Plastic roof water tank on a small plinth. */
  waterTank(cx: number, y: number, cz: number, r = 0.85, color = 0x1d2530): void {
    this.box(cx, y, cz, r * 2.3, 0.3, r * 2.3, 0x9a9a95);
    this.cyl(cx, y + 0.3, cz, r, r, 1.15, color, 14);
    this.cyl(cx, y + 1.45, cz, r * 0.85, r * 0.6, 0.18, color, 14);
    this.cyl(cx, y + 1.63, cz, r * 0.22, r * 0.22, 0.12, 0xc9c9c9, 8);
  }

  /** Boundary wall with a gate gap in the front. Wall centred at (cx,cz). */
  boundaryWall(cx: number, cz: number, W: number, D: number, color: number, cap: number, gate = 3.4, h = 1.8): void {
    const t = 0.22;
    this.box(cx, 0, cz - D / 2 + t / 2, W, h, t, color);
    this.box(cx - W / 2 + t / 2, 0, cz, t, h, D - 2 * t, color);
    this.box(cx + W / 2 - t / 2, 0, cz, t, h, D - 2 * t, color);
    const seg = (W - gate) / 2;
    this.box(cx - gate / 2 - seg / 2, 0, cz + D / 2 - t / 2, seg, h, t, color);
    this.box(cx + gate / 2 + seg / 2, 0, cz + D / 2 - t / 2, seg, h, t, color);
    for (const s of [-1, 1]) {
      this.box(cx + (s * gate) / 2, 0, cz + D / 2 - t / 2, 0.45, h + 0.45, 0.45, color);
      this.box(cx + (s * gate) / 2, h + 0.45, cz + D / 2 - t / 2, 0.6, 0.1, 0.6, cap);
      // open iron gate leaf
      this.box(cx + s * (gate / 2 - 0.05), 0.15, cz + D / 2 + 0.55, 0.05, 1.5, 1.1, 0x2d3439);
    }
  }

  tree(x: number, z: number, h = 4.5, crown = 0x4b8a42): void {
    this.cyl(x, 0, z, 0.2, 0.14, h * 0.55, 0x6b4a2f, 7);
    this.sphere(x, h * 0.75, z, h * 0.32, crown, 0.9);
    this.sphere(x + h * 0.14, h * 0.62, z + h * 0.06, h * 0.22, crown);
  }

  // ---------- output ----------

  finish(width: number, depth: number, height: number): BuiltBuilding {
    const root = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    for (const [surf, list] of this.buckets) {
      const g = mergeGeometries(list, false)!;
      geos.push(g);
      const m = new THREE.Mesh(g, getSurfaceMaterial(surf));
      m.name = surf;
      m.castShadow = surf !== 'glass';
      m.receiveShadow = true;
      root.add(m);
      for (const x of list) x.dispose();
    }
    this.buckets.clear();
    return {
      root,
      width,
      depth,
      height,
      dispose: () => geos.forEach((g) => g.dispose()),
    };
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _bt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Planar UVs per triangle, in metres / texture size. The texture's u axis runs horizontally along a wall, v runs up the wall
 * (or up the slope on a roof), so brick courses are level, tin ribs run down the roof, thatch strands follow the slope.
 */
function planarUVs(pos: THREE.BufferAttribute, size: [number, number]): Float32Array {
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    _n.copy(_b).sub(_a).cross(_c.clone().sub(_a));
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    if (Math.abs(_n.y) > 0.9) _t.set(1, 0, 0);
    else _t.crossVectors(UP, _n).normalize();
    _bt.crossVectors(_n, _t);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? _a : k === 1 ? _b : _c;
      out[(i + k) * 2] = p.dot(_t) / size[0];
      out[(i + k) * 2 + 1] = p.dot(_bt) / size[1];
    }
  }
  return out;
}
