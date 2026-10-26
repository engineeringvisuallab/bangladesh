import { RAIL_DESIGN as D } from '../rail/RailPlan';
import { RAIL_HEAD, type CarKind } from './TrainConfig';

/**
 * Train car geometry (pure arrays, no three.js, so it can be built and measured in a headless test).
 * Local car frame: +x = the nose (front) of the car, y up with y = 0 at the TOP OF THE RAIL HEAD, z = across. Origin = middle of the car.
 *
 * RAILWAY LOOK-UP: the cars are no longer solid blocks, they are HOLLOW and have a real interior. Every car is built in three parts
 * (same vertex format as RailMeshData, flat-coloured faces):
 *   body    the outside (skin, roof, underframe, bogies, pantograph)   - drawn with the lit TrainMaterial
 *   inside  the inside (floor, lining, ceiling, seats, poles, lamps, driver desk) and the head / tail lamps
 *           - drawn UNLIT (MeshBasicMaterial): colours already carry a fake shading, so the saloon is bright by day and by night (lamps on)
 *   glass   window panes - drawn transparent, so the saloon can be seen from outside and the outside from the seat
 * Passengers (camera) sit at SEAT_EYE; the driver's eye is CAB_EYE (cab car and locomotive).
 */
export interface TrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per vertex: surface class for the procedural texture shader (see TRAIN_SURF). */
  surf: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** Textured quads (logo): own UVs. */
export interface TrainDecalData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

export interface CarParts {
  body: TrainMeshData;
  inside: TrainMeshData;
  glass: TrainMeshData;
}

type V = [number, number, number];
type P2 = [number, number];

const C = {
  locoBody: [0.9, 0.91, 0.9] as V,
  locoStripe: [0.93, 0.93, 0.9] as V,
  coachBody: [0.9, 0.91, 0.9] as V,
  blue: [0.05, 0.24, 0.62] as V,
  green: [0.33, 0.72, 0.16] as V,
  coachStripe: [0.1, 0.45, 0.28] as V,
  coachStripe2: [0.95, 0.75, 0.15] as V,
  roof: [0.74, 0.76, 0.78] as V,
  skirt: [0.22, 0.23, 0.26] as V,
  glass: [0.07, 0.13, 0.2] as V,
  frame: [0.1, 0.11, 0.13] as V,
  roofGear: [0.55, 0.57, 0.6] as V,
  under: [0.12, 0.12, 0.13] as V,
  bogie: [0.16, 0.16, 0.18] as V,
  wheel: [0.3, 0.3, 0.33] as V,
  disc: [0.45, 0.43, 0.42] as V,
  door: [0.62, 0.64, 0.62] as V,
  panto: [0.62, 0.64, 0.68] as V,
  insulator: [0.8, 0.55, 0.3] as V,
  bellows: [0.09, 0.09, 0.1] as V,
  louver: [0.2, 0.22, 0.25] as V,
  // ---- inside (colours before the fake shading of the `inside` emitter) ----
  wallUp: [0.9, 0.89, 0.84] as V,
  wallLow: [0.46, 0.5, 0.56] as V,
  ceiling: [0.94, 0.94, 0.92] as V,
  cove: [0.84, 0.85, 0.83] as V,
  floor: [0.4, 0.46, 0.54] as V,
  aisle: [0.46, 0.52, 0.6] as V,
  seatBlue: [0.1, 0.22, 0.62] as V,
  seatHead: [0.1, 0.15, 0.32] as V,
  seatFrame: [0.74, 0.76, 0.78] as V,
  arm: [0.5, 0.52, 0.56] as V,
  chrome: [0.8, 0.82, 0.86] as V,
  strap: [0.95, 0.78, 0.18] as V,
  lamp: [1.0, 0.98, 0.9] as V,
  vent: [0.3, 0.31, 0.33] as V,
  doorIn: [0.58, 0.6, 0.63] as V,
  yellow: [0.92, 0.78, 0.12] as V,
  headLamp: [1.0, 0.97, 0.85] as V,
  tailLamp: [0.95, 0.1, 0.08] as V,
  desk: [0.27, 0.29, 0.33] as V,
  screen: [0.25, 0.85, 0.95] as V,
  cabWall: [0.74, 0.75, 0.74] as V,
  cabSeat: [0.12, 0.12, 0.15] as V,
  machine: [0.5, 0.52, 0.5] as V,
  machineDark: [0.28, 0.3, 0.32] as V,
};

/**
 * SURFACE CLASS of a face (by the colour constant it was emitted with) for the procedural texture shader (TrainView):
 * 1 body paint (panel joints, dirt near the sill), 2 dark metal, 3 seat fabric (blue with fine crackle lines), 4 floor (speckled vinyl),
 * 5 wall panel, 6 ceiling (perforated panels), 7 chrome / steel, 8 rubber bellows (ribs), 9 hard plastic / leather.
 */
export const TRAIN_SURF = new Map<V, number>([
  [C.coachBody, 1], [C.roof, 1], [C.blue, 1], [C.green, 1], [C.door, 1], [C.coachStripe, 1], [C.coachStripe2, 1],
  [C.skirt, 2], [C.under, 2], [C.bogie, 2], [C.wheel, 2], [C.louver, 2], [C.vent, 2],
  [C.seatBlue, 3], [C.cabSeat, 3],
  [C.floor, 4], [C.aisle, 4], [C.machineDark, 4],
  [C.wallUp, 5], [C.wallLow, 5], [C.cabWall, 5], [C.doorIn, 5], [C.machine, 5], [C.desk, 5],
  [C.ceiling, 6], [C.cove, 6],
  [C.chrome, 7], [C.roofGear, 7], [C.panto, 7], [C.disc, 7], [C.strap, 7],
  [C.bellows, 8], [C.frame, 8],
  [C.seatFrame, 9], [C.seatHead, 9], [C.arm, 9],
]);

/** Highest point of the raised pantograph collector above the rail head: it touches the contact wire (design height + contactHeight above the top of ballast). */
export const PANTOGRAPH_TOP = D.contactHeight - RAIL_HEAD;

class Emit {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  surf: number[] = [];
  /** true: the colour is multiplied by a fake shading that depends on the face direction (for the unlit inside). */
  constructor(private shade = false) {}
  /** true: no shading at all (lamps). */
  flat = false;

  private k(n: V): number {
    if (!this.shade || this.flat) return 1;
    return 0.88 + 0.12 * Math.max(0, n[1]) - 0.1 * Math.max(0, -n[1]) + 0.03 * n[0];
  }

  /** Quad wound counter-clockwise seen from the side the normal points to. */
  quad(a: V, b: V, c: V, d: V, n: V, col: V): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const q = dot >= 0 ? [a, b, c, d] : [a, d, c, b];
    const base = this.pos.length / 3;
    const f = this.k(n);
    const sid = TRAIN_SURF.get(col) ?? 0;
    for (const p of q) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0] * f, col[1] * f, col[2] * f);
      this.surf.push(sid);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: V, b: V, c: V, n: V, col: V): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const q = dot >= 0 ? [a, b, c] : [a, c, b];
    const base = this.pos.length / 3;
    const f = this.k(n);
    const sid = TRAIN_SURF.get(col) ?? 0;
    for (const p of q) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0] * f, col[1] * f, col[2] * f);
      this.surf.push(sid);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** Axis-aligned box by its extents (any order). */
  bx(xa: number, xb: number, ya: number, yb: number, za: number, zb: number, col: V): void {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
    this.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], Math.min(za, zb), Math.max(za, zb), col);
  }

  /** Axis-aligned box: centre, half length (x), half height (y), half width (z). */
  box(cx: number, cy: number, cz: number, hl: number, hh: number, hw: number, col: V): void {
    this.prism([[cx - hl, cy - hh], [cx + hl, cy - hh], [cx + hl, cy + hh], [cx - hl, cy + hh]], cz - hw, cz + hw, col);
  }

  /** Convex side profile (x, y) extruded across z0..z1. */
  prism(profile: P2[], z0: number, z1: number, col: V): void {
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const pr = area >= 0 ? profile : [...profile].reverse(); // counter-clockwise
    const m = pr.length;
    for (let i = 0; i < m; i++) {
      const p = pr[i], q = pr[(i + 1) % m];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      const n: V = [dy / l, -dx / l, 0];
      this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], n, col);
    }
    for (let i = 1; i < m - 1; i++) {
      this.tri([pr[0][0], pr[0][1], z1], [pr[i][0], pr[i][1], z1], [pr[i + 1][0], pr[i + 1][1], z1], [0, 0, 1], col);
      this.tri([pr[0][0], pr[0][1], z0], [pr[i][0], pr[i][1], z0], [pr[i + 1][0], pr[i + 1][1], z0], [0, 0, -1], col);
    }
  }

  /** Convex PLAN outline (x, z) extruded between y0 and y1: a nose that narrows towards the front. */
  prismY(profile: P2[], y0: number, y1: number, col: V): void {
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const pr = area >= 0 ? profile : [...profile].reverse();
    const m = pr.length;
    for (let i = 0; i < m; i++) {
      const p = pr[i], q = pr[(i + 1) % m];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const l = Math.hypot(dx, dz) || 1;
      const n: V = [dz / l, 0, -dx / l];
      this.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, col);
    }
    for (let i = 1; i < m - 1; i++) {
      this.tri([pr[0][0], y1, pr[0][1]], [pr[i][0], y1, pr[i][1]], [pr[i + 1][0], y1, pr[i + 1][1]], [0, 1, 0], col);
      this.tri([pr[0][0], y0, pr[0][1]], [pr[i][0], y0, pr[i][1]], [pr[i + 1][0], y0, pr[i + 1][1]], [0, -1, 0], col);
    }
  }

  /** Convex CROSS-SECTION (z, y) extruded along x (x0..x1, any order): the rounded roof, a tank, a pipe. */
  prismX(profile: P2[], xa: number, xb: number, col: V): void {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const pr = area >= 0 ? profile : [...profile].reverse();
    const m = pr.length;
    for (let i = 0; i < m; i++) {
      const p = pr[i], q = pr[(i + 1) % m];
      const dz = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dz, dy) || 1;
      const n: V = [0, -dz / l, dy / l];
      this.quad([x0, p[1], p[0]], [x1, p[1], p[0]], [x1, q[1], q[0]], [x0, q[1], q[0]], n, col);
    }
    for (let i = 1; i < m - 1; i++) {
      this.tri([x1, pr[0][1], pr[0][0]], [x1, pr[i][1], pr[i][0]], [x1, pr[i + 1][1], pr[i + 1][0]], [1, 0, 0], col);
      this.tri([x0, pr[0][1], pr[0][0]], [x0, pr[i][1], pr[i][0]], [x0, pr[i + 1][1], pr[i + 1][0]], [-1, 0, 0], col);
    }
  }

  /** Cylinder along x. */
  cylX(x0: number, x1: number, cy: number, cz: number, r: number, col: V, n = 10): void {
    const pr: P2[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pr.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.prismX(pr, x0, x1, col);
  }

  /** A thin bar from (x0, y0) to (x1, y1) of thickness t, across z0..z1. */
  strut(x0: number, y0: number, x1: number, y1: number, t: number, z0: number, z1: number, col: V): void {
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (t / 2), ny = (dx / l) * (t / 2);
    this.prism([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], z0, z1, col);
  }

  /** Wheel, axis along z (n-sided). */
  wheel(cx: number, cy: number, cz: number, r: number, hw: number, col: V, n = 12): void {
    const pr: P2[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      pr.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.prism(pr, cz - hw, cz + hw, col);
  }

  data(): TrainMeshData {
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      colors: Float32Array.from(this.col),
      surf: Float32Array.from(this.surf),
      indices: this.pos.length / 3 > 65535 ? Uint32Array.from(this.idx) : Uint16Array.from(this.idx),
    };
  }
}

/** Body dimensions (m), shared with the tests and the colliders (TrainBoxes). */
export const BODY = {
  width: 3.0,
  loco: { length: 20, bottom: 0.95, roof: 3.95 },
  coach: { length: 22, bottom: 0.85, roof: 3.75 },
};

/** Interior measures (m above the rail head). */
export const INSIDE = {
  /** Top of the saloon floor. */
  floor: 1.0,
  /** Underside of the ceiling: coach / cab car, locomotive. */
  ceil: 3.28,
  ceilLoco: 3.45,
  /** Outer skin 0.09 thick (z 1.41 .. 1.5), lining 0.02 inside it (z 1.39 .. 1.41). */
  skinIn: 1.41,
  linIn: 1.39,
  /** Side windows: sill and head height, width. */
  sill: 1.78,
  head: 2.95,
  winW: 1.35,
  /** Seat bays: one window per two seat rows. */
  bay: 1.85,
  row: 0.925,
  /** Length of a driver's cab (partition to nose). */
  cabLen: 3.0,
};

/** Where a passenger's eyes are in the car frame (x is the magnitude: the seat row that faces the direction of travel). Seated, window side. */
export const SEAT_EYE = { x: 1.39, y: 2.24, z: 1.14 };
/** Standing in the aisle. */
export const AISLE_EYE = { x: 0, y: 2.62, z: 0 };
/** Driver's eye: distance behind the nose, height. Only cars with a cab (kind 'cab' = driving trailer, 'loco'). */
export const CAB_EYE = { fromNose: 2.25, y: 2.28 };
/** Nose position (x of the buffer face) of the cab cars. */
export const NOSE_X = { loco: BODY.loco.length / 2, cab: BODY.coach.length / 2 };

interface Parts {
  body: Emit;
  inside: Emit;
  glass: Emit;
}

const I = INSIDE;

/** Rounded roof cross-section (z, y): flat underside at `ceil`, crown at `roofY`. */
const roofProfile = (ceil: number, roofY: number): P2[] => [[-1.5, ceil], [1.5, ceil], [1.5, ceil + 0.14], [1.25, roofY - 0.2], [0.7, roofY - 0.04], [0, roofY], [-0.7, roofY - 0.04], [-1.25, roofY - 0.2], [-1.5, ceil + 0.14]];

/** Side wall piece x0..x1, y0..y1 on both sides: outer skin (lit) and inner lining (unlit). */
function wall(p: Parts, x0: number, x1: number, y0: number, y1: number, skin: V, lining: V): void {
  for (const s of [-1, 1]) {
    p.body.bx(x0, x1, y0, y1, s > 0 ? I.skinIn : -1.5, s > 0 ? 1.5 : -I.skinIn, skin);
    if (y1 > I.floor) p.inside.bx(x0, x1, Math.max(y0, I.floor), y1, s > 0 ? I.linIn : -I.skinIn, s > 0 ? I.skinIn : -I.linIn, lining);
  }
}

function glassPane(p: Parts, xa: number, xb: number, ya: number, yb: number, z: number): void {
  const n: V = [0, 0, z > 0 ? 1 : -1];
  p.glass.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], n, C.glass);
}

interface SaloonSpec {
  x0: number;
  x1: number;
  ceil: number;
  roofY: number;
  skin: V;
  /** Window centres (x). */
  windows: number[];
  /** Door centres (x), on both sides. */
  doors: number[];
  /** Seat benches: x and the direction the seat faces (+1 = towards +x). */
  rows: { x: number; dir: 1 | -1 }[];
  /** Vertical poles (x); two per x (z = +-0.55). */
  poles: number[];
  /** Grab rail span (x0, x1) or null. */
  rail: [number, number] | null;
  /** End walls with an inter-car door at x0 / at x1 (with the rubber bellows outside). */
  gangwayBack: boolean;
  gangwayFront: boolean;
}

/** The passenger saloon (everything between two end walls): floor, skin with window openings, lining, ceiling, seats, rails, lamps. */
function saloon(p: Parts, sp: SaloonSpec): void {
  const { x0, x1, ceil } = sp;
  // ---- floor ----
  p.body.bx(x0, x1, 0.85, 0.98, -I.skinIn, I.skinIn, C.under);
  p.inside.bx(x0 + 0.02, x1 - 0.02, 0.98, I.floor, -I.linIn, I.linIn, C.floor);
  p.inside.bx(x0 + 0.02, x1 - 0.02, I.floor, I.floor + 0.006, -0.42, 0.42, C.aisle);
  // ---- roof: rounded cross-section, lined ceiling below ----
  p.body.prismX(roofProfile(ceil, sp.roofY), x0, x1, C.roof);
  p.inside.bx(x0 + 0.02, x1 - 0.02, ceil - 0.03, ceil, -I.linIn, I.linIn, C.ceiling);
  for (const s of [-1, 1]) p.inside.bx(x0 + 0.02, x1 - 0.02, ceil - 0.24, ceil - 0.03, s * 1.12, s * I.linIn, C.cove);
  // ---- side walls: lower band, header, pillars between the openings ----
  const open: [number, number][] = [
    ...sp.windows.map((c) => [c - I.winW / 2, c + I.winW / 2] as [number, number]),
    ...sp.doors.map((c) => [c - 0.5, c + 0.5] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);
  wall(p, x0, x1, 0.85, 1.3, C.skirt, C.wallLow);
  wall(p, x0, x1, 1.3, I.sill, sp.skin, C.wallLow);
  wall(p, x0, x1, I.head, ceil, sp.skin, C.wallUp);
  let xa = x0;
  for (const [a, b] of open) {
    if (a > xa) wall(p, xa, a, I.sill, I.head, sp.skin, C.wallUp);
    xa = b;
  }
  if (x1 > xa) wall(p, xa, x1, I.sill, I.head, sp.skin, C.wallUp);
  // livery along the outside: blue band, thin green line, a green swoosh wedge at the ends
  for (const s of [-1, 1]) {
    p.body.bx(x0 + 0.1, x1 - 0.1, 0.98, 1.16, s * 1.5, s * 1.512, C.blue);
    p.body.bx(x0 + 0.1, x1 - 0.1, 1.16, 1.24, s * 1.5, s * 1.512, C.green);
    const wedge = (xa: number, dir: number): void => p.body.prism([[xa, 1.24], [xa + dir * 4.7, 1.24], [xa + dir * 2.4, 1.74], [xa, 1.74]], Math.min(s * 1.5, s * 1.512), Math.max(s * 1.5, s * 1.512), C.green);
    wedge(x0 + 0.5, 1);
    if (sp.gangwayFront) wedge(x1 - 0.5, -1);
  }
  // ---- windows: glass, rubber frame outside, sill ledge inside ----
  for (const c of sp.windows) {
    const a = c - I.winW / 2, b = c + I.winW / 2;
    for (const s of [-1, 1]) {
      glassPane(p, a, b, I.sill, I.head, s * 1.455);
      p.body.bx(a - 0.05, b + 0.05, I.sill - 0.05, I.sill, s * 1.5, s * 1.514, C.frame);
      p.body.bx(a - 0.05, b + 0.05, I.head, I.head + 0.05, s * 1.5, s * 1.514, C.frame);
      p.body.bx(a - 0.05, a, I.sill, I.head, s * 1.5, s * 1.514, C.frame);
      p.body.bx(b, b + 0.05, I.sill, I.head, s * 1.5, s * 1.514, C.frame);
      p.inside.bx(a, b, I.sill - 0.03, I.sill, s * 1.3, s * I.linIn, C.wallUp);
    }
  }
  // ---- doors: leaf frame around a big window, seam, posts, yellow threshold ----
  for (const c of sp.doors) {
    for (const s of [-1, 1]) {
      glassPane(p, c - 0.5, c + 0.5, I.sill, I.head, s * 1.455);
      p.body.bx(c - 0.66, c + 0.66, 0.95, I.sill, s * 1.5, s * 1.516, C.door);
      p.body.bx(c - 0.66, c + 0.66, I.head, 3.12, s * 1.5, s * 1.516, C.door);
      p.body.bx(c - 0.66, c - 0.5, I.sill, I.head, s * 1.5, s * 1.516, C.door);
      p.body.bx(c + 0.5, c + 0.66, I.sill, I.head, s * 1.5, s * 1.516, C.door);
      p.body.bx(c - 0.012, c + 0.012, 0.95, 3.12, s * 1.516, s * 1.52, C.frame);
      p.body.bx(c - 0.12, c - 0.06, 1.9, 2.3, s * 1.516, s * 1.53, C.chrome);
      p.inside.bx(c - 0.66, c - 0.5, I.floor, ceil, s * 1.3, s * I.linIn, C.chrome);
      p.inside.bx(c + 0.5, c + 0.66, I.floor, ceil, s * 1.3, s * I.linIn, C.chrome);
      p.inside.bx(c - 0.66, c + 0.66, I.floor, I.floor + 0.01, s * 1.0, s * I.linIn, C.yellow);
    }
  }
  // ---- end walls with the inter-car door ----
  for (const [on, x, dir] of [[sp.gangwayBack, x0, 1], [sp.gangwayFront, x1, -1]] as const) {
    if (!on) continue;
    p.body.bx(x, x + dir * 0.09, 0.85, ceil, -1.5, 1.5, sp.skin);
    const xi = x + dir * 0.11;
    p.inside.bx(x + dir * 0.09, xi, I.floor, ceil, -I.linIn, I.linIn, C.wallUp);
    p.inside.bx(xi, xi + dir * 0.02, I.floor, 2.95, -0.58, 0.58, C.doorIn);
    p.inside.bx(xi, xi + dir * 0.03, I.floor, 2.95, -0.6, -0.54, C.chrome);
    p.inside.bx(xi, xi + dir * 0.03, I.floor, 2.95, 0.54, 0.6, C.chrome);
    p.inside.bx(xi, xi + dir * 0.03, 2.9, 2.97, -0.6, 0.6, C.chrome);
    p.glass.quad([xi + dir * 0.025, 1.85, -0.4], [xi + dir * 0.025, 1.85, 0.4], [xi + dir * 0.025, 2.75, 0.4], [xi + dir * 0.025, 2.75, -0.4], [dir, 0, 0], C.glass);
    // rubber bellows (outside, in the gap between two cars)
    const e = x;
    const out = -dir * 0.38;
    p.body.bx(e, e + out, 3.0, ceil, -1.1, 1.1, C.bellows);
    p.body.bx(e, e + out, 0.95, 1.25, -1.1, 1.1, C.bellows);
    for (const s of [-1, 1]) p.body.bx(e, e + out, 1.25, 3.0, s * 0.98, s * 1.1, C.bellows);
  }
  // ---- seats ----
  for (const r of sp.rows) {
    for (const s of [-1, 1]) {
      const zl = s > 0 ? 0.46 : -1.37, zh = s > 0 ? 1.37 : -0.46;
      const xb = r.x - r.dir * 0.23;
      p.inside.bx(r.x - 0.2, r.x + 0.2, I.floor, 1.34, zl + 0.12, zh - 0.12, C.seatFrame);
      p.inside.bx(r.x - 0.25, r.x + 0.25, 1.34, 1.45, zl, zh, C.seatBlue);
      p.inside.bx(xb - 0.05, xb + 0.05, 1.45, 2.05, zl + 0.04, zh - 0.04, C.seatBlue);
      p.inside.bx(xb - 0.065, xb + 0.065, 1.45, 2.08, zl - 0.02, zl + 0.04, C.seatFrame);
      p.inside.bx(xb - 0.065, xb + 0.065, 1.45, 2.08, zh - 0.04, zh + 0.02, C.seatFrame);
      p.inside.bx(xb - 0.07 - r.dir * 0.0, xb + 0.07, 2.05, 2.3, zl + 0.12, zh - 0.12, C.seatHead);
      p.inside.bx(r.x - 0.22, r.x + 0.2, 1.45, 1.68, s > 0 ? 0.43 : -0.5, s > 0 ? 0.5 : -0.43, C.arm);
      p.inside.bx(r.x - 0.22, r.x + 0.2, 1.45, 1.68, s > 0 ? 1.37 : -1.39, s > 0 ? 1.39 : -1.37, C.arm);
    }
  }
  // ---- ceiling lamps (lit), vents, grab rail with drops and hand loops, poles ----
  const bays = Math.max(0, Math.floor((x1 - x0 - 4) / I.bay));
  const bx0 = (x0 + x1) / 2 - ((bays - 1) * I.bay) / 2;
  for (let k = 0; k < bays; k++) {
    const x = bx0 + k * I.bay;
    p.inside.flat = true;
    for (const s of [-1, 1]) p.inside.bx(x - 0.6, x + 0.6, ceil - 0.05, ceil - 0.03, s * 0.42, s * 0.7, C.lamp);
    p.inside.flat = false;
    p.inside.bx(x - 0.4, x + 0.4, ceil - 0.045, ceil - 0.03, -0.25, 0.25, C.vent);
    for (const s of [-1, 1]) p.inside.bx(x - 0.02, x + 0.02, 2.98, ceil - 0.24, s * 0.86, s * 0.9, C.chrome);
  }
  // luggage racks over the windows (slotted shelf with brackets)
  for (const s of [-1, 1]) {
    p.inside.bx(sp.rows.length ? sp.rows[0].x - 0.5 : x0 + 1, sp.rows.length ? sp.rows[sp.rows.length - 1].x + 0.5 : x1 - 1, 2.98, 3.02, s * 0.88, s * 1.38, C.chrome);
    p.inside.bx(sp.rows.length ? sp.rows[0].x - 0.5 : x0 + 1, sp.rows.length ? sp.rows[sp.rows.length - 1].x + 0.5 : x1 - 1, 3.02, 3.1, s * 1.34, s * 1.38, C.chrome);
  }
  if (sp.rail) {
    p.inside.bx(sp.rail[0], sp.rail[1], 2.93, 2.97, -0.02, 0.02, C.chrome);
    for (let x = sp.rail[0] + 0.5; x <= sp.rail[1] - 0.4; x += I.bay) {
      p.inside.bx(x - 0.015, x + 0.015, 2.97, ceil, -0.015, 0.015, C.chrome);
      p.inside.bx(x + I.bay / 2 - 0.01, x + I.bay / 2 + 0.01, 2.5, 2.93, -0.01, 0.01, C.chrome);
      p.inside.bx(x + I.bay / 2 - 0.07, x + I.bay / 2 + 0.07, 2.44, 2.5, -0.025, 0.025, C.strap);
    }
  }
  for (const x of sp.poles) for (const s of [-1, 1]) p.inside.bx(x - 0.02, x + 0.02, I.floor, ceil, s * 0.55 - 0.02, s * 0.55 + 0.02, C.chrome);
}

/**
 * A driver's cab with the nose on the +x side (`s` = 1) or on the -x side (`s` = -1). `xp` = x of the partition, the cab is `cabLen` (3 m) long.
 * Raked windscreen, side window, driver's desk with screens, seat, head / tail lamps, buffer beam.
 */
function cab(p: Parts, s: 1 | -1, xp: number, ceil: number, roofY: number, skin: V, bottom: number): void {
  const X = (a: number): number => xp + s * a;
  const L = I.cabLen;
  const sw = 1.85; // cab side window sill
  // floor
  p.body.bx(X(0), X(L - 1.0), bottom, 0.98, -I.skinIn, I.skinIn, C.under);
  p.inside.bx(X(0), X(L - 1.0), 0.98, I.floor, -I.linIn, I.linIn, C.floor);
  p.inside.bx(X(L - 1.0), X(L - 0.16), 0.98, I.floor, -1.1, 1.1, C.floor); // inside the narrowing nose
  // side walls: lower band, pillar, header, window, front piece up to the raked windscreen
  wall(p, X(0), X(L - 1.0), bottom, 1.3, C.skirt, C.wallLow);
  wall(p, X(0), X(L - 1.0), 1.3, sw, skin, C.wallLow);
  wall(p, X(0), X(0.45), sw, ceil, skin, C.cabWall);
  wall(p, X(0.45), X(1.25), 2.9, ceil, skin, C.cabWall);
  for (const z of [-1, 1]) {
    const zo = z > 0 ? [I.skinIn, 1.5] : [-1.5, -I.skinIn];
    const zi = z > 0 ? [I.linIn, I.skinIn] : [-I.skinIn, -I.linIn];
    const piece: P2[] = [[X(1.25), sw], [X(L - 1.0), sw], [X(L - 1.0), 2.05 + (0.86 * (ceil - 2.05)) / 1.41], [X(1.4), ceil], [X(1.25), ceil]];
    p.body.prism(piece, zo[0], zo[1], skin);
    p.inside.prism(piece, zi[0], zi[1], C.cabWall);
    glassPane(p, X(0.45), X(1.25), sw, 2.9, z * 1.455);
    p.body.bx(X(0.4), X(1.3), sw - 0.05, sw, z * 1.5, z * 1.514, C.frame);
    p.body.bx(X(0.4), X(1.3), 2.9, 2.95, z * 1.5, z * 1.514, C.frame);
  }
  // partition with a door and a glass window
  p.inside.bx(X(0), X(0.08), I.floor, ceil, 0.5, I.linIn, C.cabWall);
  p.inside.bx(X(0), X(0.08), I.floor, ceil, -I.linIn, -0.5, C.cabWall);
  p.inside.bx(X(0), X(0.08), I.floor, 1.9, -0.5, 0.5, C.doorIn);
  p.inside.bx(X(0), X(0.08), 2.75, ceil, -0.5, 0.5, C.cabWall);
  p.glass.quad([X(0.04), 1.9, -0.5], [X(0.04), 1.9, 0.5], [X(0.04), 2.75, 0.5], [X(0.04), 2.75, -0.5], [-s, 0, 0], C.glass);
  // ceiling and the roof over the cab: the roof ends at the top of the windscreen, a brow juts out over it
  p.inside.bx(X(0), X(L - 0.5), ceil - 0.03, ceil, -I.linIn, I.linIn, C.ceiling);
  p.body.prismX(roofProfile(ceil, roofY), X(0), X(1.45), C.roof);
  p.body.prism([[X(1.45), ceil], [X(L - 0.5), ceil], [X(L - 0.45), ceil + 0.12], [X(L - 1.0), roofY - 0.05], [X(1.45), roofY]], -1.5, 1.5, C.roof);
  // front: lower panel, raked windscreen with pillars, lamps
  // nose: the bumper zone narrows towards the front in plan view, the face above it overhangs a little and carries the black face plate and the lamps
  p.body.prismY([[X(L - 1.0), -1.5], [X(L - 0.5), -1.4], [X(L - 0.12), -1.15], [X(L), -0.9], [X(L), 0.9], [X(L - 0.12), 1.15], [X(L - 0.5), 1.4], [X(L - 1.0), 1.5]], bottom, 1.45, C.blue);
  p.body.prism([[X(L - 0.6), 1.45], [X(L - 0.06), 1.45], [X(L - 0.06), 1.82], [X(L - 0.14), 2.05], [X(L - 0.6), 2.05]], -1.5, 1.5, C.blue);
  p.body.bx(X(L - 0.06), X(L - 0.045), 1.52, 1.95, -1.15, 1.15, C.frame);
  p.inside.bx(X(L - 0.16), X(L - 0.14), I.floor, 2.05, -1.1, 1.1, C.cabWall);
  const wsn: V = [s * 0.62, 0.78, 0];
  p.glass.quad([X(L - 0.14), 2.05, -1.15], [X(L - 0.14), 2.05, 1.15], [X(1.45), ceil, 1.4], [X(1.45), ceil, -1.4], wsn, C.glass);
  for (const z of [-1, 1]) p.body.strut(X(L - 0.14), 2.05, X(1.45), ceil, 0.1, z * 1.15 - 0.05, z * 1.15 + 0.05, C.frame);
  p.body.strut(X(L - 0.14), 2.05, X(1.45), ceil, 0.06, -0.04, 0.04, C.frame);
  p.inside.flat = true;
  for (const z of [-1, 1]) {
    p.inside.bx(X(L - 0.045), X(L - 0.02), 1.58, 1.76, z * 0.62, z * 0.98, C.headLamp);
    p.inside.bx(X(L - 0.045), X(L - 0.02), 1.58, 1.74, z * 0.25, z * 0.42, C.tailLamp);
  }
  p.inside.bx(X(L - 0.1), X(L), 1.98, 2.05, -0.16, 0.16, C.headLamp);
  p.inside.flat = false;
  // buffer beam and coupler
  p.body.bx(X(L - 0.2), X(L + 0.3), 0.7, 0.95, -0.85, 0.85, C.under);
  p.body.bx(X(L), X(L + 0.55), 0.72, 0.88, -0.18, 0.18, C.roofGear);
  // driver's desk: sloped console with screens, controller and buttons
  const desk: P2[] = [[X(L - 1.25), I.floor], [X(L - 0.35), I.floor], [X(L - 0.35), 1.38], [X(L - 0.65), 1.62], [X(L - 1.25), 1.55]];
  p.inside.prism(desk, -1.2, 1.2, C.desk);
  p.inside.flat = true;
  for (const z of [-0.7, -0.15]) p.inside.bx(X(L - 0.95), X(L - 0.7), 1.56, 1.6, z - 0.2, z + 0.2, C.screen);
  p.inside.bx(X(L - 0.95), X(L - 0.8), 1.56, 1.6, 0.3, 0.4, C.tailLamp);
  p.inside.bx(X(L - 0.95), X(L - 0.8), 1.56, 1.6, 0.45, 0.55, C.lamp);
  p.inside.flat = false;
  p.inside.bx(X(L - 1.2), X(L - 1.1), 1.55, 1.78, 0.62, 0.7, C.chrome);
  p.inside.bx(X(L - 1.22), X(L - 1.08), 1.74, 1.82, 0.58, 0.74, C.strap);
  // driver's seat
  const sx = L - CAB_EYE.fromNose;
  p.inside.bx(X(sx - 0.25), X(sx + 0.25), I.floor, 1.3, -0.25, 0.25, C.seatFrame);
  p.inside.bx(X(sx - 0.25), X(sx + 0.25), 1.3, 1.42, -0.27, 0.27, C.cabSeat);
  p.inside.bx(X(sx - 0.31), X(sx - 0.2), 1.42, 2.0, -0.26, 0.26, C.cabSeat);
  p.inside.bx(X(sx - 0.31), X(sx - 0.22), 2.0, 2.25, -0.17, 0.17, C.cabSeat);
}

function bogie(p: Parts, x: number, motors: boolean): void {
  const em = p.body;
  em.box(x, 0.53, 0, 1.6, 0.1, 0.12, C.bogie); // transom
  for (const sz of [-1, 1]) em.box(x, 0.55, sz * 0.95, 1.7, 0.14, 0.08, C.bogie); // side frames
  for (const ax of [-1.25, 1.25]) {
    em.wheel(x + ax, 0.46, 0, 0.07, 0.78, C.wheel, 8); // axle
    for (const sz of [-1, 1]) {
      em.wheel(x + ax, 0.46, sz * 0.7175, 0.46, 0.065, C.wheel, 14);
      em.wheel(x + ax, 0.46, sz * 0.5, 0.27, 0.02, C.disc, 10);
      em.box(x + ax, 0.62, sz * 0.86, 0.14, 0.12, 0.1, C.under); // axle box
    }
    if (motors) em.box(x + ax * 0.55, 0.52, 0, 0.35, 0.2, 0.42, C.under);
  }
}

function pantograph(em: Emit, x: number, roof: number): void {
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.7, 0.7]) em.box(x + sx, roof + 0.15, sz, 0.1, 0.15, 0.1, C.insulator);
  em.box(x, roof + 0.35, 0, 0.8, 0.05, 0.85, C.panto);
  const y0 = roof + 0.4;
  for (const sz of [-0.45, 0.45]) {
    em.strut(x - 0.6, y0, x + 0.8, y0 + 0.6, 0.1, sz - 0.05, sz + 0.05, C.panto); // lower arm up to the knee
    em.strut(x + 0.8, y0 + 0.6, x - 0.4, y0 + 0.85, 0.1, sz - 0.05, sz + 0.05, C.panto); // upper arm back to the collector
  }
  // collector head: its top is exactly the contact wire height
  em.box(x - 0.4, PANTOGRAPH_TOP - 0.035, 0, 0.25, 0.035, 0.95, C.panto);
}

function underframe(p: Parts, len: number): void {
  const em = p.body;
  em.bx(-len, len, 0.58, 0.85, -1.1, 1.1, C.under);
  for (const s of [-1, 1]) {
    em.cylX(-len * 0.8, -len * 0.3, 0.64, s * 0.65, 0.2, C.skirt);
    em.bx(len * 0.15, len * 0.65, 0.5, 0.85, s * 0.6, s * 1.15, C.skirt);
  }
}

function roofGear(em: Emit, xs: number[], roofY: number, len: number): void {
  for (const x of xs) {
    em.box(x, roofY + 0.09, 0, len, 0.09, 0.9, C.roofGear);
    for (let k = -2; k <= 2; k++) em.box(x + k * (len / 2.6), roofY + 0.18, 0, 0.08, 0.01, 0.8, C.vent);
  }
}

/**
 * "EVCity" logo plates on both sides of a car (textured quads with UVs, drawn by TrainView with a canvas texture): coaches and the driving trailer
 * between the second window and the door, the locomotive in the middle of the machine room. Reads left to right from outside on both sides.
 */
export function buildCarDecals(kind: CarKind): TrainDecalData {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const cx = kind === 'loco' ? 0 : -4.2;
  const w = 2.4, h = w * (217 / 1000); // the official EVCity logo (public/assets/evcity-logo.png) is 1000 x 217
  const yc = kind === 'loco' ? 1.52 : 1.51;
  for (const s of [-1, 1]) {
    const z = s * 1.518;
    const a = s > 0 ? cx - w / 2 : cx + w / 2; // left edge as seen from outside
    const b = s > 0 ? cx + w / 2 : cx - w / 2;
    const base = pos.length / 3;
    pos.push(a, yc - h / 2, z, b, yc - h / 2, z, b, yc + h / 2, z, a, yc + h / 2, z);
    for (let k = 0; k < 4; k++) nrm.push(0, 0, s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    if (s > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint16Array.from(idx) };
}

/** The three parts of one car kind. */
export function buildCarParts(kind: CarKind): CarParts {
  const p: Parts = { body: new Emit(), inside: new Emit(true), glass: new Emit() };
  if (kind === 'loco') {
    const { length: L, bottom: b, roof } = BODY.loco;
    const h = L / 2;
    const ceil = I.ceilLoco;
    // two driver's cabs, machine room in between (hollow, walled, with louvres)
    cab(p, 1, h - I.cabLen, ceil, roof, C.locoBody, b);
    cab(p, -1, -(h - I.cabLen), ceil, roof, C.locoBody, b);
    const x0 = -(h - I.cabLen), x1 = h - I.cabLen;
    p.body.bx(x0, x1, b, 0.98, -I.skinIn, I.skinIn, C.under);
    p.inside.bx(x0, x1, 0.98, I.floor, -I.linIn, I.linIn, C.machineDark);
    p.body.prismX(roofProfile(ceil, roof), x0, x1, C.roof);
    p.inside.bx(x0, x1, ceil - 0.03, ceil, -I.linIn, I.linIn, C.machine);
    wall(p, x0, x1, b, 1.3, C.skirt, C.machineDark);
    wall(p, x0, x1, 1.3, ceil, C.locoBody, C.machine);
    for (const s of [-1, 1]) {
      p.body.bx(x0 + 0.2, x1 - 0.2, 1.0, 1.2, s * 1.5, s * 1.512, C.blue);
      p.body.bx(x0 + 0.2, x1 - 0.2, 1.2, 1.27, s * 1.5, s * 1.512, C.green);
      for (const cx of [-4.8, -1.6, 1.6, 4.8]) {
        p.body.bx(cx - 1.0, cx + 1.0, 1.75, 3.05, s * 1.5, s * 1.508, C.louver);
        for (let k = 0; k < 6; k++) p.body.bx(cx - 0.95, cx + 0.95, 1.85 + k * 0.2, 1.9 + k * 0.2, s * 1.5, s * 1.52, C.locoBody);
      }
    }
    // machine room: transformer, cabinets, cable tray
    p.inside.bx(-3.2, 0.2, I.floor, 2.9, -1.1, -0.25, C.machineDark);
    p.inside.bx(0.8, 2.6, I.floor, 2.4, 0.3, 1.1, C.machine);
    p.inside.bx(-5.8, -4.2, I.floor, 2.6, 0.3, 1.1, C.machine);
    p.inside.bx(x0, x1, ceil - 0.15, ceil - 0.03, -0.3, 0.3, C.vent);
    p.inside.flat = true;
    for (const x of [-4.5, 0, 4.5]) p.inside.bx(x - 0.4, x + 0.4, ceil - 0.05, ceil - 0.03, -0.1, 0.1, C.lamp);
    p.inside.flat = false;
    // roof gear
    roofGear(p.body, [3.5, -6], roof, 1.2);
    pantograph(p.body, -3, roof);
    underframe(p, 6.5);
    bogie(p, -6.2, true);
    bogie(p, 6.2, true);
    // bellows are not needed: the loco is double-ended with cabs; a coupler on both buffer beams is part of the cab
  } else {
    const { length: L, bottom: b, roof } = BODY.coach;
    const h = L / 2;
    const ceil = I.ceil;
    const rowsFor = (from: number, to: number): { x: number; dir: 1 | -1 }[] => {
      const out: { x: number; dir: 1 | -1 }[] = [];
      for (let x = from; x <= to + 1e-6; x += I.row) out.push({ x, dir: x < 0 ? 1 : -1 });
      return out;
    };
    const baySpan = (a: number, b2: number): number[] => {
      const out: number[] = [];
      for (let c = a; c <= b2 + 1e-6; c += I.bay) out.push(c);
      return out;
    };
    if (kind === 'cab') {
      // driving trailer: cab at the +x nose (partition at 8.0), a door at 6.9, the rest is saloon
      saloon(p, {
        x0: -h, x1: 8.0, ceil, roofY: roof, skin: C.coachBody,
        windows: baySpan(-6.475, 4.625), doors: [-9.0, 6.9], rows: rowsFor(-6.94, 4.2), poles: [-8.0, 7.6],
        rail: [-6.8, 4.9], gangwayBack: true, gangwayFront: false,
      });
      cab(p, 1, 8.0, ceil, roof, C.coachBody, b);
    } else {
      saloon(p, {
        x0: -h, x1: h, ceil, roofY: roof, skin: C.coachBody,
        windows: baySpan(-6.475, 6.475), doors: [-9.0, 9.0], rows: rowsFor(-6.94, 6.94), poles: [-8.0, 8.0],
        rail: [-6.8, 6.8], gangwayBack: true, gangwayFront: true,
      });
    }
    roofGear(p.body, [-3, 4], roof, 1.4);
    underframe(p, 6.5);
    bogie(p, -8, false);
    bogie(p, 8, false);
  }
  return { body: p.body.data(), inside: p.inside.data(), glass: p.glass.data() };
}

/** The outside of one car kind (kept for the old callers and the tests). */
export function buildCarMesh(kind: CarKind): TrainMeshData {
  return buildCarParts(kind).body;
}
