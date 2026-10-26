import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import { every, type AnimSet } from '../../../core/anim';
import { box, cyl } from '../../../core/prims';

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0.1 });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = 0.6;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};
const basic = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });

/** Extra materials only the vehicle factory needs. */
export function createVehMats() {
  return {
    floor: std(0x9a9d9f, { rough: 0.55 }),
    yellow: std(0xe6b422, { rough: 0.6 }),
    robot: std(0xe8742a, { rough: 0.45, metal: 0.4 }),
    robotDark: std(0x2d3135, { rough: 0.5, metal: 0.6 }),
    steelSheet: std(0xb4bcc4, { rough: 0.35, metal: 0.75 }),
    coil: std(0xa5adb5, { rough: 0.3, metal: 0.85 }),
    pressBlue: std(0x2d5f93, { rough: 0.5, metal: 0.4 }),
    pressGrey: std(0x6f777d, { rough: 0.55, metal: 0.5 }),
    glassCar: std(0x1d2a35, { rough: 0.1, metal: 0.5 }),
    tyre: std(0x16181a, { rough: 0.95 }),
    rim: std(0xc7cdd2, { rough: 0.3, metal: 0.9 }),
    lightF: basic(0xfff6c8),
    lightR: basic(0xff2a1a),
    clay: std(0xb8a58c, { rough: 0.95 }),
    carBlue: std(0x2f6fd0, { rough: 0.25, metal: 0.4 }),
    carRed: std(0xc0392b, { rough: 0.25, metal: 0.4 }),
    carWhite: std(0xeeeeee, { rough: 0.25, metal: 0.3 }),
    carSilver: std(0xb0b6bd, { rough: 0.2, metal: 0.6 }),
    carGreen: std(0x2e8b57, { rough: 0.25, metal: 0.4 }),
    ovenGlow: std(0x7a2a10, { rough: 0.6, emissive: 0xff5a1a }),
    waterTank: std(0x3b7fa3, { rough: 0.2, opacity: 0.8 }),
    coat: std(0x6b6e72, { rough: 0.4, opacity: 0.85 }),
    cell: std(0x2b4f8c, { rough: 0.4, metal: 0.3 }),
    cellGold: std(0xc9a227, { rough: 0.35, metal: 0.8 }),
    copper: std(0xb87333, { rough: 0.4, metal: 0.8 }),
    magnet: std(0x8a8f96, { rough: 0.3, metal: 0.9 }),
    battery: std(0x3a4046, { rough: 0.5, metal: 0.5 }),
    agv: std(0x3f8f5b, { rough: 0.5 }),
    skin: std(0xd9a577, { rough: 0.8 }),
    vest: std(0xff7a00, { rough: 0.7 }),
    helmet: std(0xf2d21b, { rough: 0.5 }),
    overall: std(0x2a4a7a, { rough: 0.8 }),
    screenBg: basic(0x07131c),
    barA: basic(0x38e07a),
    barB: basic(0x4cc9f0),
    barC: basic(0xffb703),
    spark: basic(0xffe9a0),
    lampG: basic(0x38e07a),
    lampR: basic(0xff3b30),
    mist: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    rack: std(0x3a6ea5, { rough: 0.5, metal: 0.4 }),
    pallet: std(0xc9a063, { rough: 0.9 }),
    boxCard: std(0xb98c52, { rough: 0.95 }),
    target: std(0xf0f0f0, { rough: 0.8 }),
    dummy: std(0xe8c14a, { rough: 0.7 }),
  };
}
export type VMats = ReturnType<typeof createVehMats>;

/** Cars that travel along the main line (filled by the line part, read by others). */
export interface LineState {
  cars: THREE.Group[];
}

export interface Ctx {
  mats: Mats;
  t: VMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  line: LineState;
}

// ---- paths ---------------------------------------------------------------------------------------------------------------------------------
export type WP = [number, number, number];
/** Polyline with arc-length lookup: position and heading (yaw about y, +x = 0) at distance d. */
export class Path {
  readonly len: number;
  private readonly cum: number[] = [0];
  constructor(readonly pts: WP[], readonly closed = false) {
    const p = closed ? [...pts, pts[0]] : pts;
    let s = 0;
    for (let i = 1; i < p.length; i++) {
      s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
      this.cum.push(s);
    }
    this.len = s;
    this.p = p;
  }
  private readonly p: WP[];
  at(d: number, out: { x: number; y: number; z: number; yaw: number }): void {
    const dd = ((d % this.len) + this.len) % this.len;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < dd) i++;
    const a = this.p[i - 1];
    const b = this.p[i];
    const f = (dd - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    out.x = a[0] + (b[0] - a[0]) * f;
    out.y = a[1] + (b[1] - a[1]) * f;
    out.z = a[2] + (b[2] - a[2]) * f;
    out.yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  }
}
/** Move `obj` along `path` forever at `speed` m/s (start offset in metres). */
export function follow(anim: AnimSet, obj: THREE.Object3D, path: Path, speed: number, offset = 0): void {
  const o = { x: 0, y: 0, z: 0, yaw: 0 };
  every(anim, (tm) => {
    path.at(offset + tm * speed, o);
    obj.position.set(o.x, o.y, o.z);
    obj.rotation.y = o.yaw;
  });
}

// ---- shop shell: floor, walls with doors for the line, roof, columns on the open south side -----------------------------------------------
export interface ShopOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** open the east / west wall where the main line passes (door 7 m wide, 5.5 m high) at z = lineZ */
  lineZ?: number;
  /** doors in the north wall (world x list, 6 m wide) */
  doorsN?: number[];
  openS?: boolean;
}
export function shopShell(g: THREE.Object3D, m: Mats, t: VMats, o: ShopOpts): void {
  const th = 0.4;
  box(g, o.w, 0.2, o.d, t.floor, o.x, 0, o.z);
  // north wall with doors
  const nz = o.z - o.d / 2 + th / 2;
  const cuts = [...(o.doorsN ?? [])].sort((a, b) => a - b);
  let x = o.x - o.w / 2;
  for (const c of cuts) {
    if (c - 3 > x) box(g, c - 3 - x, o.h, th, m.wall, (x + c - 3) / 2, 0, nz);
    box(g, 6, o.h - 5.5, th, m.wall, c, 5.5, nz);
    x = c + 3;
  }
  if (o.x + o.w / 2 > x) box(g, o.x + o.w / 2 - x, o.h, th, m.wall, (x + o.x + o.w / 2) / 2, 0, nz);
  // east / west walls
  for (const s of [-1, 1]) {
    const wx = o.x + s * (o.w / 2 - th / 2);
    if (o.lineZ === undefined) box(g, th, o.h, o.d - 2 * th, m.wall, wx, 0, o.z);
    else {
      const z0 = o.z - o.d / 2 + th;
      const z1 = o.z + o.d / 2 - th;
      const a = o.lineZ - 3.5;
      const b = o.lineZ + 3.5;
      box(g, th, o.h, a - z0, m.wall, wx, 0, (z0 + a) / 2);
      box(g, th, o.h, z1 - b, m.wall, wx, 0, (b + z1) / 2);
      box(g, th, o.h - 5.5, 7, m.wall, wx, 5.5, o.lineZ);
    }
  }
  if (!o.openS) box(g, o.w, o.h, th, m.wall, o.x, 0, o.z + o.d / 2 - th / 2);
  box(g, o.w + 0.8, 0.4, o.d + 0.8, m.roof, o.x, o.h, o.z);
  // clerestory strip on the roof (daylight)
  box(g, o.w - 6, 0.6, 3, m.glass, o.x, o.h + 0.4, o.z - o.d / 4);
  if (o.openS) {
    const n = Math.max(2, Math.round(o.w / 7));
    for (let i = 0; i <= n; i++) box(g, 0.5, o.h, 0.5, m.concrete, o.x + (i / n - 0.5) * (o.w - 0.5), 0, o.z + o.d / 2 - 0.25);
  }
}

// ---- cars ------------------------------------------------------------------------------------------------------------------------------------
export type CarKind = 'biw' | 'painted' | 'semi' | 'full';
/** One car, 4.4 m long (x), 1.85 m wide (z). The four stages of its life are four child groups: only one is visible at a time. */
export function makeCar(t: VMats, paint: THREE.Material): THREE.Group & { stage: (k: CarKind) => void } {
  const car = new THREE.Group() as THREE.Group & { stage: (k: CarKind) => void };
  const mk = (): THREE.Group => {
    const gr = new THREE.Group();
    car.add(gr);
    return gr;
  };
  const biw = mk();
  box(biw, 4.4, 0.12, 1.8, t.steelSheet, 0, 0.3, 0);
  for (const s of [-1, 1]) {
    box(biw, 4.2, 0.28, 0.1, t.steelSheet, 0, 0.42, s * 0.88);
    for (const px of [-1.1, 0.4, 1.3]) box(biw, 0.08, 0.62, 0.08, t.steelSheet, px, 0.7, s * 0.82);
    box(biw, 2.6, 0.06, 0.08, t.steelSheet, 0, 1.32, s * 0.82);
  }
  box(biw, 2.4, 0.05, 1.6, t.steelSheet, -0.1, 1.34, 0);
  box(biw, 0.5, 0.35, 1.7, t.steelSheet, 1.95, 0.55, 0);
  box(biw, 0.5, 0.35, 1.7, t.steelSheet, -1.95, 0.55, 0);
  const body = (gr: THREE.Group, glass: boolean): void => {
    box(gr, 4.4, 0.5, 1.85, paint, 0, 0.3, 0);
    if (glass) {
      box(gr, 2.4, 0.44, 1.62, t.glassCar, -0.1, 0.8, 0);
      box(gr, 2.3, 0.07, 1.62, paint, -0.1, 1.24, 0);
    } else box(gr, 2.4, 0.5, 1.62, paint, -0.1, 0.8, 0);
  };
  const painted = mk();
  body(painted, false);
  const semi = mk();
  body(semi, true);
  const full = mk();
  body(full, true);
  for (const [wx, wz] of [[-1.4, 0.92], [-1.4, -0.92], [1.4, 0.92], [1.4, -0.92]]) {
    const tyre = cyl(full, 0.34, 0.24, t.tyre, wx, 0, wz, 16);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.y = 0.34;
    const rim = cyl(full, 0.2, 0.26, t.rim, wx, 0, wz, 12);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.34;
  }
  for (const s of [-1, 1]) {
    box(full, 0.06, 0.12, 0.35, t.lightF, 2.2, 0.55, s * 0.6);
    box(full, 0.06, 0.12, 0.35, t.lightR, -2.2, 0.55, s * 0.6);
  }
  const all = [biw, painted, semi, full];
  const kinds: CarKind[] = ['biw', 'painted', 'semi', 'full'];
  car.stage = (k: CarKind): void => {
    const i = kinds.indexOf(k);
    all.forEach((gr, j) => (gr.visible = j === i));
  };
  car.stage('biw');
  return car;
}

// ---- robots ----------------------------------------------------------------------------------------------------------------------------------
export interface Robot {
  root: THREE.Group;
  turret: THREE.Group;
  arm1: THREE.Group;
  arm2: THREE.Group;
  spark: THREE.Mesh;
}
/** 6-axis style industrial robot (base, turret, two arms, tool). `yaw` turns the whole robot. */
export function makeRobot(parent: THREE.Object3D, t: VMats, x: number, z: number, yaw: number, s = 1): Robot {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  root.scale.setScalar(s);
  parent.add(root);
  cyl(root, 0.55, 0.6, t.robotDark, 0, 0, 0, 16);
  const turret = new THREE.Group();
  turret.position.y = 0.6;
  root.add(turret);
  box(turret, 0.7, 0.5, 0.7, t.robot, 0, 0, 0);
  const arm1 = new THREE.Group();
  arm1.position.set(0, 0.35, 0);
  turret.add(arm1);
  box(arm1, 0.34, 2.2, 0.34, t.robot, 0, 0, 0);
  const arm2 = new THREE.Group();
  arm2.position.set(0, 2.2, 0);
  arm1.add(arm2);
  box(arm2, 0.26, 1.9, 0.26, t.robot, 0, 0, 0);
  box(arm2, 0.5, 0.35, 0.5, t.robotDark, 0, 1.9, 0);
  const spark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), t.spark);
  spark.position.set(0, 2.25, 0);
  spark.visible = false;
  arm2.add(spark);
  return { root, turret, arm1, arm2, spark };
}
/** Weld-style motion: the turret swings, the arms reach down and up; the tool spark flickers when the tool is low. */
export function animRobot(anim: AnimSet, r: Robot, phase: number, speed = 1, reach = 1, sparks = true): void {
  every(anim, (tm) => {
    const w = tm * speed + phase;
    r.turret.rotation.y = 0.5 * Math.sin(w * 0.7);
    r.arm1.rotation.z = 0.55 + 0.35 * Math.sin(w * 1.3) * reach;
    r.arm2.rotation.z = -1.25 + 0.5 * Math.sin(w * 1.3 + 1.2) * reach;
    r.spark.visible = sparks && Math.sin(w * 1.3) > 0.55 && Math.sin(tm * 40 + phase) > -0.2;
  });
}

// ---- workers -----------------------------------------------------------------------------------------------------------------------------------
/** A worker in a hi-vis vest and helmet who bends over the work now and then. */
export function makeWorker(parent: THREE.Object3D, t: VMats, anim: AnimSet, x: number, z: number, yaw: number, phase: number): void {
  const w = new THREE.Group();
  w.position.set(x, 0, z);
  w.rotation.y = yaw;
  parent.add(w);
  box(w, 0.28, 0.85, 0.2, t.overall, -0.12, 0, 0);
  box(w, 0.28, 0.85, 0.2, t.overall, 0.12, 0, 0);
  const torso = new THREE.Group();
  torso.position.y = 0.85;
  w.add(torso);
  box(torso, 0.5, 0.65, 0.3, t.vest, 0, 0, 0);
  cyl(torso, 0.13, 0.12, t.skin, 0, 0.62, 0, 8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), t.helmet);
  head.position.set(0, 0.88, 0);
  torso.add(head);
  every(anim, (tm) => (torso.rotation.x = 0.35 * Math.max(0, Math.sin(tm * 0.8 + phase))));
}
