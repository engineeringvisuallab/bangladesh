// Where the engineering plants (SWTP water treatment, STP sewage treatment) stand in the world, plus the level pad each one needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
//
// Placement rule (see CHANGES_BN.md): the SWTP takes river water UPSTREAM; the STP releases treated water DOWNSTREAM, 800 m further down the
// same river (the river runs south-west to the sea here). Each site is turned so that its river side faces the river.
const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export interface InfraPlacement {
  id: 'swtp' | 'stp' | 'thermal' | 'grid' | 'mech' | 'dam' | 'chem' | 'auto' | 'renew' | 'vehicle' | 'tech';
  nameBn: string;
  /** site origin (the local (0,0) of the plant) and yaw: local +x maps to world (cos yaw, -sin yaw) */
  x: number;
  z: number;
  yaw: number;
  /** the level pad in local metres (= the ground plate of the plant) */
  rect: { x0: number; x1: number; z0: number; z1: number };
  /** which local side faces the river */
  riverSide: 'W' | 'E' | 'none';
  /** HUD / minimap colour and the one-letter minimap mark */
  color: string;
  mark: string;
  /** how deep (m) the ground under the pad is dug (the plant's tanks and wells are sunk into it) */
  deep: number;
  /** grading skirt width (m) from the pad back to natural ground, and on the river side (short: the river is close) */
  blend: number;
  riverBlend: number;
  /** floor raised this many metres above the natural ground (flood safety for a plant that stands on the flood plain) */
  lift: number;
}

const d2r = Math.PI / 180;
export const INFRA_PLACEMENTS: InfraPlacement[] = [
  { id: 'swtp', nameBn: 'Water Treatment Plant (SWTP)', x: -180, z: 1260, yaw: 161.2 * d2r, rect: { x0: -168, x1: 158, z0: -113, z1: 113 }, riverSide: 'W', color: '#0ea5e9', mark: 'W', deep: 10, blend: 30, riverBlend: 22, lift: 2.5 },
  { id: 'stp', nameBn: 'Sewage Treatment Plant (STP)', x: -240, z: 2040, yaw: 142.2 * d2r, rect: { x0: -153, x1: 153, z0: -103, z1: 103 }, riverSide: 'E', color: '#92400e', mark: 'S', deep: 7.5, blend: 30, riverBlend: 10, lift: 0 },
  // Thermal power plant: stands inside the engineering area 'eng-thermal-power' (x 700..1150, z -3150..-2850), no river needed.
  // Pad 348 x 224 m: clear of the pond in the area's south-west corner and of the public road just east of it; entrance on the south side (local +z).
  { id: 'thermal', nameBn: 'Thermal Power Plant', x: 925, z: -3010, yaw: 0, rect: { x0: -165, x1: 183, z0: -112, z1: 112 }, riverSide: 'none', color: '#f59e0b', mark: 'T', deep: 3, blend: 28, riverBlend: 28, lift: 0 },
  // 132/33 kV grid substation: inside the engineering area 'eng-grid' (x 150..600, z 2100..2450). A main road cuts that area at z~2350
  // and another runs along its west side, so the pad stays in the north part; entrance on the north side (local -z).
  { id: 'grid', nameBn: 'Grid Substation', x: 388, z: 2214, yaw: 0, rect: { x0: -180, x1: 180, z0: -92, z1: 80 }, riverSide: 'none', color: '#eab308', mark: 'G', deep: 2, blend: 26, riverBlend: 26, lift: 0 },
  // Mechanical works: inside the engineering area 'eng-mech-works' (x 1450..2050, z 200..650). A public road runs N-S through the east part of the
  // area (x ~1950) and hills rise in the south, so the pad sits in the flat north-west part; the plant's gate faces the road (east side).
  { id: 'mech', nameBn: 'Mechanical Works', x: 1690, z: 332, yaw: 0, rect: { x0: -205, x1: 175, z0: -107, z1: 100 }, riverSide: 'none', color: '#8b5cf6', mark: 'M', deep: 1.5, blend: 26, riverBlend: 26, lift: 0 },
  // Dam & hydropower station: stands inside the engineering area 'eng-dam' (x 3150..3750, z 350..850), on dry ground south of its natural lake.
  // Pad 300 x 210 m (centre 3450, 724). The reservoir (rock-walled) is on the north side (local -z), the river and the entrance (south edge) on the +z side.
  // The ground there is rough, so the grading skirt is long (60 m) to blend the cut and fill back into the hills.
  { id: 'dam', nameBn: 'Dam & Hydropower Station', x: 3450, z: 724, yaw: 0, rect: { x0: -150, x1: 150, z0: -105, z1: 105 }, riverSide: 'none', color: '#38bdf8', mark: 'D', deep: 7, blend: 60, riverBlend: 60, lift: 0 },
  // Chemical process plant: inside the engineering area 'eng-chemical' (x 2100..2700, z 2050..2450). Main roads cut that area in several places, so the pad sits in the
  // free, flat middle-east part (>= 12 m from every main road, ~3 m of relief); the gate faces south towards the nearest road.
  { id: 'chem', nameBn: 'Chemical Process Plant', x: 2539, z: 2242, yaw: 0, rect: { x0: -133, x1: 133, z0: -75, z1: 75 }, riverSide: 'none', color: '#ff9100', mark: 'C', deep: 1.5, blend: 24, riverBlend: 24, lift: 0 },
  // Automation & robotics plant: inside the engineering area 'eng-automation' (x 2200..2800, z 550..1000). Two public roads run N-S through the east part of
  // that area (x ~2670) and hills rise in the north-west and centre-south, so the pad sits in the flat north-centre part; the gate faces the road (east).
  { id: 'auto', nameBn: 'Automation & Robotics Plant', x: 2425, z: 690, yaw: 0, rect: { x0: -195, x1: 185, z0: -95, z1: 80 }, riverSide: 'none', color: '#06b6d4', mark: 'A', deep: 1.5, blend: 26, riverBlend: 26, lift: 0 },
  // Renewable energy park: inside the engineering area 'eng-renewable' (x -2750..-2250, z -2900..-2550). Free, flat ground (1.7 m of relief, >= 15 m from every road); the gate faces south
  // towards the nearest road (S12, at the south-west corner).
  { id: 'renew', nameBn: 'Renewable Energy Park', x: -2438, z: -2781, yaw: 0, rect: { x0: -158, x1: 158, z0: -93, z1: 93 }, riverSide: 'none', color: '#76ff03', mark: 'R', deep: 1.5, blend: 24, riverBlend: 24, lift: 0 },
  // EV vehicle factory: inside the NEW engineering area 'eng-vehicle' (x -500..100, z 2400..2750): flat dry ground, no public road crosses it (the fence has no gaps),
  // ~1.7 m of relief under the pad. Pad 380 x 300 m, entrance on the south side (local +z).
  { id: 'vehicle', nameBn: 'EV Vehicle Factory', x: -129, z: 2571, yaw: 0, rect: { x0: -190, x1: 190, z0: -150, z1: 150 }, riverSide: 'none', color: '#b388ff', mark: 'V', deep: 3, blend: 35, riverBlend: 35, lift: 0 },
  // Computer science & electronics park: inside the engineering area 'eng-tech-park' (x 450..1050, z -1350..-900). Flat, dry ground in the north part; small hills in the west and
  // south-east. Gate on the west side (towards the city). Minimap mark is 'E' (the letter 'C' is already used by the chemical plant).
  { id: 'tech', nameBn: 'Computer Science & Electronics Park', x: 775, z: -1228, yaw: 0, rect: { x0: -175, x1: 175, z0: -100, z1: 100 }, riverSide: 'none', color: '#a855f7', mark: 'E', deep: 1.5, blend: 26, riverBlend: 26, lift: 0 },
];

/** Floor is cut slightly BELOW the plate so the plate never z-fights with the ground. */
export const INFRA_PAD_SINK = 0.03;
/** The ground under the outer INSET metres of the pad stays level (no moat next to the plate edge); then it drops over EDGE_DROP metres. */
const INSET = 3;
const EDGE_DROP = 2.5;

export class InfraSite {
  readonly id: InfraPlacement['id'];
  readonly nameBn: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly rect: InfraPlacement['rect'];
  readonly deep: number;
  readonly lift: number;
  readonly riverSide: InfraPlacement['riverSide'];
  readonly color: string;
  readonly mark: string;
  /** Floor height (m). Set once from the natural ground (see TerrainGenerator). */
  floorY = 0;
  private readonly c: number;
  private readonly s: number;
  private readonly side: number;
  private readonly blend: number;
  private readonly riverBlend: number;

  constructor(p: InfraPlacement) {
    this.id = p.id;
    this.nameBn = p.nameBn;
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.yaw;
    this.rect = p.rect;
    this.deep = p.deep;
    this.lift = p.lift;
    this.riverSide = p.riverSide;
    this.color = p.color;
    this.mark = p.mark;
    this.c = Math.cos(p.yaw);
    this.s = Math.sin(p.yaw);
    this.side = p.riverSide === 'W' ? -1 : p.riverSide === 'E' ? 1 : 0;
    this.blend = p.blend;
    this.riverBlend = p.riverBlend;
  }

  /** World (x, z) -> the plant's local (x, z). */
  toLocal(wx: number, wz: number, out: { x: number; z: number }): void {
    const dx = wx - this.x;
    const dz = wz - this.z;
    out.x = dx * this.c - dz * this.s;
    out.z = dx * this.s + dz * this.c;
  }
  /** The plant's local (x, z) -> world. */
  toWorld(lx: number, lz: number, out: { x: number; z: number }): void {
    out.x = this.x + lx * this.c + lz * this.s;
    out.z = this.z - lx * this.s + lz * this.c;
  }

  private readonly t = { x: 0, z: 0 };

  /** Signed distance to the pad rectangle (negative inside) and how far past the river-side edge the point is (0 if not). */
  private dist(x: number, z: number): { s: number; river: number } {
    this.toLocal(x, z, this.t);
    const R = this.rect;
    const ex = Math.max(R.x0 - this.t.x, this.t.x - R.x1);
    const ez = Math.max(R.z0 - this.t.z, this.t.z - R.z1);
    const s = ex > 0 || ez > 0 ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez);
    const past = this.side === 0 ? 0 : this.side < 0 ? R.x0 - this.t.x : this.t.x - R.x1;
    return { s, river: Math.max(past, 0) };
  }

  private skirt(river: number): number {
    return this.blend + (this.riverBlend - this.blend) * smoothstep(0, 10, river);
  }

  /** True if (x, z) is on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.dist(x, z).s <= margin + 6;
  }

  /** Inside the plant's fence line (+ margin). */
  inside(x: number, z: number, margin = 0): boolean {
    return this.dist(x, z).s <= margin;
  }

  /** Cheap pre-check: is (x, z) on the pad or its grading skirt? */
  near(x: number, z: number): boolean {
    const { s, river } = this.dist(x, z);
    return s < this.skirt(river);
  }

  /** The new ground height for natural ground height `h` at (x, z). `k` (0..1) weakens the grading skirt where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const { s, river } = this.dist(x, z);
    const top = this.floorY - INFRA_PAD_SINK;
    if (s <= 0) return top - this.deep * smoothstep(0, EDGE_DROP, Math.max(0, -s - INSET)); // under the pad: dug out, the plate covers it
    const b = this.skirt(river);
    if (s >= b) return h;
    const t = (1 - smoothstep(0, b, s)) * k;
    return h + (top - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned near a plant. Main roads are never touched. */
export function infraKeepout(x: number, z: number): boolean {
  for (const p of INFRA_PLACEMENTS) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const dx = x - p.x;
    const dz = z - p.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (lx > p.rect.x0 - 40 && lx < p.rect.x1 + 40 && lz > p.rect.z0 - 40 && lz < p.rect.z1 + 40) return true;
  }
  return false;
}
