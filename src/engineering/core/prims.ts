import * as THREE from 'three';
import type { Mats } from './materials';
import type { Site } from './Site';

type P = THREE.Object3D;
type M = THREE.Material;
export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function put(parent: P, geo: THREE.BufferGeometry, mat: M, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Box. x,z = centre, y = BOTTOM. */
export function box(parent: P, w: number, h: number, d: number, mat: M, x: number, y: number, z: number): THREE.Mesh {
  return put(parent, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
}
/** Vertical cylinder. x,z = centre, y = BOTTOM. */
export function cyl(parent: P, r: number, h: number, mat: M, x: number, y: number, z: number, seg = 20): THREE.Mesh {
  return put(parent, new THREE.CylinderGeometry(r, r, h, seg), mat, x, y + h / 2, z);
}
/** Horizontal cylinder along x or z. yc = centre height. */
export function cylH(parent: P, r: number, len: number, mat: M, x: number, yc: number, z: number, axis: 'x' | 'z', seg = 16): THREE.Mesh {
  const m = put(parent, new THREE.CylinderGeometry(r, r, len, seg), mat, x, yc, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
  return m;
}
export function sphere(parent: P, r: number, mat: M, x: number, y: number, z: number): THREE.Mesh {
  return put(parent, new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
}

/** Straight pipe segments joined with spheres at the bends. `support` adds concrete saddles under low horizontal runs. */
export function pipe(parent: P, pts: THREE.Vector3[], r: number, mat: M, support?: M): void {
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    parent.add(m);
    if (support && Math.abs(dir.y) < 1e-3 && len > 4 && a.y - r > 0.15 && a.y < 4) {
      const n = Math.floor(len / 8);
      for (let k = 0; k <= n; k++) {
        const t = n === 0 ? 0.5 : k / n;
        const p = a.clone().lerp(b, t);
        box(parent, 0.7, p.y - r, 0.7, support, p.x, 0, p.z);
      }
    }
  }
  for (let i = 1; i < pts.length - 1; i++) sphere(parent, r, mat, pts[i].x, pts[i].y, pts[i].z);
}

/** Gate valve on a horizontal pipe: body + stem + hand wheel. */
export function valve(parent: P, mats: Mats, x: number, y: number, z: number, r: number, axis: 'x' | 'z'): void {
  cylH(parent, r * 1.5, r * 1.6, mats.red, x, y, z, axis, 14);
  cyl(parent, r * 0.18, r * 2.4, mats.steel, x, y, z, 8);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.09, 6, 14), mats.red);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(x, y + r * 2.4, z);
  parent.add(wheel);
}

/** End-suction centrifugal pump with motor on a base. Local +x = suction side. rotY turns it. */
export function pump(parent: P, mats: Mats, x: number, z: number, rotY: number, baseY = 0, s = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, baseY, z);
  g.rotation.y = rotY;
  g.scale.setScalar(s);
  box(g, 3.4, 0.3, 1.3, mats.concreteDark, 0.05, 0, 0);
  cylH(g, 0.45, 1.5, mats.motor, -0.85, 0.85, 0, 'x', 18);
  cylH(g, 0.16, 0.4, mats.steel, -0.05, 0.85, 0, 'x', 10);
  cylH(g, 0.58, 0.8, mats.casing, 0.55, 0.85, 0, 'x', 18);
  cylH(g, 0.3, 0.9, mats.casing, 1.3, 0.85, 0, 'x', 14);
  cyl(g, 0.24, 0.8, mats.casing, 0.55, 1.2, 0, 12);
  box(g, 0.5, 0.3, 0.5, mats.steel, -1.2, 1.3, 0);
  parent.add(g);
  return g;
}

export interface TankOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  /** how deep below ground (m) */
  depth: number;
  /** wall top above ground (m) */
  top: number;
  water?: M;
  /** water surface height (default top - 0.7) */
  level?: number;
  wall?: M;
  rail?: boolean;
}
/** Open concrete tank sunk into the ground (registers a pit in the site). Returns the water surface height. */
export function tank(parent: P, site: Site, mats: Mats, o: TankOpts): number {
  const t = 0.5;
  const wall = o.wall ?? mats.concrete;
  const hgt = o.depth + o.top;
  site.addPit({ x: o.x, z: o.z, w: o.w, d: o.d, depth: o.depth });
  box(parent, o.w, 0.4, o.d, mats.concreteDark, o.x, -o.depth - 0.4, o.z);
  box(parent, o.w, hgt, t, wall, o.x, -o.depth, o.z - o.d / 2 + t / 2);
  box(parent, o.w, hgt, t, wall, o.x, -o.depth, o.z + o.d / 2 - t / 2);
  box(parent, t, hgt, o.d - 2 * t, wall, o.x - o.w / 2 + t / 2, -o.depth, o.z);
  box(parent, t, hgt, o.d - 2 * t, wall, o.x + o.w / 2 - t / 2, -o.depth, o.z);
  const level = o.level ?? o.top - 0.7;
  if (o.water) box(parent, o.w - 2 * t, 0.1, o.d - 2 * t, o.water, o.x, level - 0.1, o.z);
  if (o.rail) railRect(parent, mats.steel, o.x, o.z, o.w, o.d, o.top);
  return level;
}

export function railing(parent: P, mat: M, x1: number, z1: number, x2: number, z2: number, y: number, h = 1.0): void {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) box(parent, 0.07, h, 0.07, mat, x1 + (dx * i) / n, y, z1 + (dz * i) / n);
  for (const hh of [h, h * 0.5]) {
    const r = box(parent, len, 0.06, 0.06, mat, (x1 + x2) / 2, y + hh - 0.03, (z1 + z2) / 2);
    r.rotation.y = Math.atan2(-dz, dx);
  }
}
export function railRect(parent: P, mat: M, x: number, z: number, w: number, d: number, y: number): void {
  const a = x - w / 2;
  const b = x + w / 2;
  const c = z - d / 2;
  const e = z + d / 2;
  railing(parent, mat, a, c, b, c, y);
  railing(parent, mat, b, c, b, e, y);
  railing(parent, mat, b, e, a, e, y);
  railing(parent, mat, a, e, a, c, y);
}

export type Side = 'N' | 'S' | 'E' | 'W';
export interface BuildingOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** this side has NO wall (open shed / cut-away) so the equipment inside is visible. N = -z, S = +z, E = +x, W = -x */
  open?: Side;
  floors?: number;
  door?: Side;
  wall?: M;
  roof?: M;
}
/** Simple building: walls, windows, door, flat roof slab. */
export function building(parent: P, mats: Mats, o: BuildingOpts): void {
  const t = 0.35;
  const wall = o.wall ?? mats.wall;
  const floors = o.floors ?? 1;
  const fh = o.h / floors;
  const door: Side = o.door ?? (o.open === 'S' ? 'N' : 'S');
  box(parent, o.w, 0.2, o.d, mats.concreteDark, o.x, 0, o.z);
  const sides: Side[] = ['N', 'S', 'E', 'W'];
  for (const s of sides) {
    if (s === o.open) continue;
    const ns = s === 'N' || s === 'S';
    const len = ns ? o.w : o.d;
    if (ns) box(parent, o.w, o.h, t, wall, o.x, 0, o.z + (s === 'N' ? -1 : 1) * (o.d / 2 - t / 2));
    else box(parent, t, o.h, o.d - 2 * t, wall, o.x + (s === 'W' ? -1 : 1) * (o.w / 2 - t / 2), 0, o.z);
    const nw = Math.floor((len - 2) / 3.6);
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < nw; i++) {
        if (s === door && f === 0 && i === Math.floor(nw / 2)) continue;
        const off = -len / 2 + (len * (i + 0.5)) / nw;
        const y = f * fh + fh * 0.5 - 0.1;
        if (ns) box(parent, 1.4, 1.2, 0.12, mats.glass, o.x + off, y, o.z + (s === 'N' ? -1 : 1) * (o.d / 2 + 0.02));
        else box(parent, 0.12, 1.2, 1.4, mats.glass, o.x + (s === 'W' ? -1 : 1) * (o.w / 2 + 0.02), y, o.z + off);
      }
    }
    if (s === door) {
      if (ns) box(parent, 1.8, 2.5, 0.14, mats.door, o.x, 0, o.z + (s === 'N' ? -1 : 1) * (o.d / 2 + 0.03));
      else box(parent, 0.14, 2.5, 1.8, mats.door, o.x + (s === 'W' ? -1 : 1) * (o.w / 2 + 0.03), 0, o.z);
    }
  }
  for (let f = 1; f < floors; f++) box(parent, o.w + 0.2, 0.25, o.d + 0.2, mats.concreteDark, o.x, f * fh - 0.12, o.z);
  box(parent, o.w + 0.8, 0.4, o.d + 0.8, o.roof ?? mats.roof, o.x, o.h, o.z);
  if (o.open) {
    // columns on the open side
    const n = Math.max(2, Math.round((o.open === 'N' || o.open === 'S' ? o.w : o.d) / 6));
    for (let i = 0; i <= n; i++) {
      const tt = i / n - 0.5;
      if (o.open === 'S' || o.open === 'N')
        box(parent, 0.5, o.h, 0.5, mats.concrete, o.x + tt * (o.w - 0.5), 0, o.z + (o.open === 'S' ? 1 : -1) * (o.d / 2 - 0.25));
      else box(parent, 0.5, o.h, 0.5, mats.concrete, o.x + (o.open === 'E' ? 1 : -1) * (o.w / 2 - 0.25), 0, o.z + tt * (o.d - 0.5));
    }
  }
}

/** Plain road strip on the ground (axis aligned). */
export function road(parent: P, mat: M, x1: number, z1: number, x2: number, z2: number, width: number): void {
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const w = Math.abs(x2 - x1) || width;
  const d = Math.abs(z2 - z1) || width;
  box(parent, w, 0.06, d, mat, cx, 0, cz);
}

/** Street light pole. */
export function lightPole(parent: P, mats: Mats, x: number, z: number, armDir = 1): void {
  cyl(parent, 0.12, 8, mats.steel, x, 0, z, 8);
  box(parent, 1.8, 0.12, 0.12, mats.steel, x + armDir * 0.9, 8, z);
  box(parent, 0.7, 0.15, 0.35, mats.yellow, x + armDir * 1.7, 7.9, z);
}

/** Posts that mark a BURIED pipeline (the game ground pad hides the pipe itself). */
export function buriedLine(parent: P, mat: M, pts: THREE.Vector3[], every = 10): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.floor(len / every));
    for (let k = 0; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      cyl(parent, 0.16, 1.1, mat, p.x, 0, p.z, 8);
      box(parent, 0.5, 0.12, 0.5, mat, p.x, 1.1, p.z);
    }
  }
}

export interface CTankOpts {
  x: number;
  z: number;
  r: number;
  depth: number;
  top: number;
  water?: M;
  level?: number;
}
/** Circular open tank sunk into the ground (clarifier, thickener). Returns the water surface height. */
export function ctank(parent: P, site: Site, mats: Mats, o: CTankOpts): number {
  site.addPit({ x: o.x, z: o.z, w: o.r * 2, d: o.r * 2, depth: o.depth, r: o.r });
  const hgt = o.depth + o.top;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, hgt, 64, 1, true), mats.concreteDS);
  wall.position.set(o.x, -o.depth + hgt / 2, o.z);
  parent.add(wall);
  const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.5, o.r, 64), mats.concrete);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(o.x, o.top + 0.01, o.z);
  parent.add(ring);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(o.r, 64), mats.concreteDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(o.x, -o.depth, o.z);
  parent.add(floor);
  const level = o.level ?? o.top - 0.7;
  if (o.water) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(o.r - 0.5, 64), o.water);
    w.rotation.x = -Math.PI / 2;
    w.position.set(o.x, level, o.z);
    parent.add(w);
  }
  return level;
}
