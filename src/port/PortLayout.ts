/**
 * PORT LAYOUT (pure data, deterministic): every structure of the sea port as a list of simple parts - boxes, upright prisms (tanks, silos,
 * piles), bars (booms, stays, pipes) and gable roofs - grouped into pieces (a crane, a container block, a quay segment, a ship ...).
 *
 * The same layout feeds the mesh (PortMesh, in the chunk worker: a part belongs to the chunk that holds its centre) and the physics
 * (PortPhysics, main thread: only the `solid` parts become Rapier colliders, only near the player). Nothing here reads the terrain: the
 * decks are flat by construction (PortFormation), so every height below is a constant.
 * Units: metres, world coordinates (x east, z south, y up, sea level 0).
 */
import { mulberry32 } from '../world/Seed';
import { Config } from '../core/Config';
import { BERTHS, BREAKWATERS, LATTICE, OIL, PLATFORMS, PORT_DESIGN as D, QUAY_WALLS, ZQ_BULK, ZQ_CONT, ZQ_FISH, platform } from './PortPlan';

export type RGB = readonly [number, number, number];

export interface PortPart {
  /** 0 box, 1 upright prism (cylinder), 2 bar between two points, 3 gable roof. */
  k: 0 | 1 | 2 | 3;
  /** Box: centre + half sizes. Prism: centre, hx = radius, hy = half height. Bar: A = (x, y, z), B = (bx, by, bz), hx = half width, hy = half height.
   *  Gable: centre of the footprint at eave level, hx / hz half footprint, hy = ridge height above the eave, n = 0 ridge along x, 1 along z. */
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  bx: number; by: number; bz: number;
  /** Number of sides of a prism (and the ridge axis of a gable). */
  n: number;
  c: RGB;
  /** Drawn. */
  vis: boolean;
  /** Has a collider (box / prism only). */
  solid: boolean;
  /** Small detail: left out of the coarse (LOD2) mesh. */
  det: boolean;
}

export type PieceKind = 'quay' | 'container' | 'crane' | 'building' | 'ship' | 'tank' | 'jetty' | 'silo' | 'breakwater' | 'light' | 'boat' | 'ground';

export interface PortPiece {
  id: string;
  kind: PieceKind;
  /** Centre and radius of the solid parts (physics activation). */
  x: number;
  z: number;
  r: number;
  parts: PortPart[];
}

const DECK = D.deck;
/** Top of the paved surface slabs of the sea-level decks / of the oil terrace. */
const T = DECK + 0.07;
const TO = D.oilDeck + 0.07;

export const C = {
  concrete: [0.62, 0.61, 0.58], concreteLt: [0.7, 0.69, 0.66], concreteDk: [0.46, 0.45, 0.43], yard: [0.5, 0.5, 0.48], asphalt: [0.2, 0.21, 0.23], gravel: [0.34, 0.32, 0.3],
  line: [0.9, 0.85, 0.25], white: [0.9, 0.9, 0.88], dark: [0.07, 0.07, 0.08], steel: [0.4, 0.44, 0.5], steelLt: [0.62, 0.65, 0.7], rust: [0.45, 0.25, 0.18],
  craneRed: [0.74, 0.14, 0.1], craneBlue: [0.14, 0.3, 0.6], rtg: [0.92, 0.62, 0.1], yellow: [0.92, 0.78, 0.12], glass: [0.26, 0.38, 0.5],
  shed: [0.8, 0.82, 0.84], shedRoof: [0.5, 0.56, 0.62], brick: [0.6, 0.34, 0.27], cream: [0.88, 0.85, 0.76], roofRed: [0.55, 0.22, 0.18],
  tank: [0.86, 0.87, 0.89], tankRoof: [0.6, 0.62, 0.66], pipe: [0.7, 0.32, 0.12], pipeBlue: [0.2, 0.4, 0.7],
  hullRed: [0.46, 0.1, 0.09], hullBlack: [0.09, 0.1, 0.13], hullNavy: [0.1, 0.16, 0.3], hullGreen: [0.12, 0.3, 0.22], deckGrey: [0.38, 0.4, 0.38], hatch: [0.55, 0.62, 0.55],
  coal: [0.08, 0.08, 0.09], grain: [0.78, 0.68, 0.38], sand: [0.7, 0.62, 0.45], rock: [0.42, 0.41, 0.4], rockDk: [0.3, 0.3, 0.3],
  green: [0.1, 0.78, 0.25], red: [0.85, 0.12, 0.1], fender: [0.04, 0.04, 0.04],
} satisfies Record<string, RGB>;

const BOX_COLORS: RGB[] = [
  [0.72, 0.14, 0.12], [0.14, 0.3, 0.62], [0.12, 0.5, 0.3], [0.85, 0.5, 0.1], [0.88, 0.76, 0.18], [0.55, 0.57, 0.6],
  [0.88, 0.88, 0.86], [0.1, 0.5, 0.5], [0.45, 0.28, 0.18], [0.45, 0.1, 0.18], [0.3, 0.2, 0.5],
];

interface O { solid?: boolean; det?: boolean; vis?: boolean }

/** Collects the parts of one piece. */
class PB {
  parts: PortPart[] = [];
  private add(p: Partial<PortPart> & { k: PortPart['k']; c: RGB }, o?: O): void {
    this.parts.push({ x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, bx: 0, by: 0, bz: 0, n: 0, vis: o?.vis ?? true, solid: o?.solid ?? false, det: o?.det ?? false, ...p });
  }
  /** Box from min / max corners. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: RGB, o?: O): this {
    this.add({ k: 0, c, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 }, o);
    return this;
  }
  /** Upright prism of radius r from y0 to y1. */
  cyl(x: number, z: number, r: number, y0: number, y1: number, c: RGB, sides = 12, o?: O): this {
    this.add({ k: 1, c, x, y: (y0 + y1) / 2, z, hx: r, hy: (y1 - y0) / 2, hz: r, n: sides }, o);
    return this;
  }
  /** Bar from A to B with a rectangular section (half width hw across, half height hh). */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, hw: number, hh: number, c: RGB, o?: O): this {
    this.add({ k: 2, c, x: ax, y: ay, z: az, bx, by, bz, hx: hw, hy: hh }, o);
    return this;
  }
  /** Gable roof over the footprint x0..x1 / z0..z1, eaves at yE, ridge at yR. `alongX` = ridge runs along x. */
  gable(x0: number, x1: number, z0: number, z1: number, yE: number, yR: number, c: RGB, alongX: boolean, o?: O): this {
    this.add({ k: 3, c, x: (x0 + x1) / 2, y: yE, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, hy: yR - yE, n: alongX ? 0 : 1 }, o);
    return this;
  }
  /** A flat paved slab (top at `top`), cut at the 100 m grid so no part crosses a chunk border. */
  slab(x0: number, z0: number, x1: number, z1: number, top: number, c: RGB, thick = 0.12, o?: O): this {
    const xs = cuts(x0, x1), zs = cuts(z0, z1);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) this.box(xs[i], xs[i + 1], top - thick, top, zs[j], zs[j + 1], c, o);
    return this;
  }
}

/** Break points of [a, b] at every multiple of 100 m (chunk borders are multiples of 500 m from -5000). */
function cuts(a: number, b: number): number[] {
  const out = [a];
  for (let v = Math.floor(a / 100) * 100 + 100; v < b; v += 100) out.push(v);
  out.push(b);
  return out;
}

export class PortLayout {
  readonly pieces: PortPiece[] = [];
  private byChunk = new Map<string, PortPart[]>();
  private seq = 0;

  constructor() {
    this.quays();
    this.surfaces();
    this.containerTerminal();
    this.landside();
    this.bulkTerminal();
    this.fishingHarbour();
    this.oilTerminal();
    this.breakwaters();
    this.ships();
    this.lights();
    // index every drawn part by the chunk of its centre
    const S = Config.world.chunkSize, H = Config.world.size / 2;
    for (const p of this.pieces) {
      for (const q of p.parts) {
        if (!q.vis) continue;
        const mx = q.k === 2 ? (q.x + q.bx) / 2 : q.x, mz = q.k === 2 ? (q.z + q.bz) / 2 : q.z;
        const key = `${Math.floor((mx + H) / S)},${Math.floor((mz + H) / S)}`;
        const a = this.byChunk.get(key);
        if (a) a.push(q);
        else this.byChunk.set(key, [q]);
      }
    }
  }

  /** All drawn parts whose centre lies in chunk (cx, cz). */
  partsInChunk(cx: number, cz: number): PortPart[] {
    return this.byChunk.get(`${cx},${cz}`) ?? [];
  }

  private piece(id: string, kind: PieceKind, pb: PB): void {
    // centre and radius of the collider parts (or of everything, for pieces without colliders)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of pb.parts) {
      if (!q.solid) continue;
      const rx = q.k === 1 ? q.hx : q.hx, rz = q.k === 1 ? q.hx : q.hz;
      x0 = Math.min(x0, q.x - rx); x1 = Math.max(x1, q.x + rx); z0 = Math.min(z0, q.z - rz); z1 = Math.max(z1, q.z + rz);
    }
    if (x0 === Infinity) { x0 = x1 = z0 = z1 = 0; }
    this.pieces.push({ id, kind, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2, parts: pb.parts });
  }

  private id(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  /* ---------------------------------------------------------------- quay walls, fenders, bollards, surfaces */

  private quays(): void {
    const st = LATTICE / 4; // terrain LOD0 vertex spacing (3.906 m): the dredged row is one step beyond the quay line
    for (const w of QUAY_WALLS) {
      const alongX = w.z0 === w.z1;
      const a = alongX ? w.x0 : w.z0, b = alongX ? w.x1 : w.z1;
      const n = Math.max(1, Math.ceil((b - a) / 50));
      for (let i = 0; i < n; i++) {
        const s0 = a + ((b - a) * i) / n, s1 = a + ((b - a) * (i + 1)) / n;
        const pb = new PB();
        if (alongX) {
          const zf = w.z0 + st; // wall face
          pb.box(s0, s1, w.bottom, w.top + 0.12, zf - 1.4, zf, C.concrete, { solid: true });
          pb.box(s0, s1, w.top - 1, w.top + 0.07, w.z0, zf - 1.4, C.concreteLt, { solid: true }); // cap over the slope behind the face
          pb.box(s0, s1, w.top + 0.07, w.top + 0.25, zf - 0.5, zf, C.concreteLt); // kerb
          for (let s = Math.ceil(s0 / 15) * 15; s < s1; s += 15) pb.box(s - 1, s + 1, -1, 4.2, zf, zf + 0.5, C.fender, { det: true }); // rubber fenders
          for (let s = Math.ceil(s0 / 25) * 25 + 7; s < s1; s += 25) pb.cyl(s, zf - 2.2, 0.45, w.top + 0.07, w.top + 0.95, C.dark, 8, { det: true }); // bollards
          pb.box(s0, s1, w.top + 0.075, w.top + 0.09, zf - 1.6, zf - 1.2, C.line, { det: true });
        } else {
          const east = w.face === 'E';
          const xf = east ? w.x0 + st : w.x0 - st; // wall face
          const lo = east ? xf - 1.4 : xf, hi = east ? xf : xf + 1.4;
          pb.box(lo, hi, w.bottom, w.top + 0.12, s0, s1, C.concrete, { solid: true });
          if (w.top >= DECK) pb.box(Math.min(w.x0, east ? lo : hi), Math.max(w.x0, east ? lo : hi), w.top - 1, w.top + 0.07, s0, s1, C.concreteLt, { solid: true });
          for (let s = Math.ceil(s0 / 15) * 15; s < s1; s += 15) pb.box(east ? xf : xf - 0.5, east ? xf + 0.5 : xf, -1, 4.2, s - 1, s + 1, C.fender, { det: true });
        }
        this.piece(this.id(`quay-${w.id}`), 'quay', pb);
      }
    }
  }

  private surfaces(): void {
    const pb = new PB();
    const col: Record<string, RGB> = { fishing: C.concrete, bulk: C.gravel, landside: C.asphalt, container: C.yard, oil: C.concreteLt };
    for (const p of PLATFORMS) pb.slab(p.x0, p.z0, p.x1, p.z1, p.id === 'oil' ? TO : T, col[p.id], 0.12);
    // yellow edge lines along every quay face, a lighter crane apron on the container quay
    const c = platform('container');
    pb.slab(c.x0, ZQ_CONT - 40, c.x1, ZQ_CONT, T + 0.02, C.concreteLt, 0.02);
    for (const b of BERTHS) pb.box(b.x0, b.x1, T + 0.02, T + 0.04, b.zq - 0.9, b.zq - 0.5, C.line, { det: true });
    this.piece(this.id('ground'), 'ground', pb);
  }

  /* ---------------------------------------------------------------- container terminal */

  private containerTerminal(): void {
    const c = platform('container');
    // --- ship-to-shore gantry cranes: rails (sea side zS, land side zL = zS - 30), 4 cranes
    const zS = ZQ_CONT - 4, zL = zS - 30;
    const rails = new PB();
    for (const z of [zS, zL]) rails.box(c.x0 + 8, c.x1 - 8, T, T + 0.22, z - 0.35, z + 0.35, C.steel, { det: true });
    this.piece(this.id('rails'), 'crane', rails);
    [1790, 1880, 1970, 2120].forEach((x, i) => this.stsCrane(x, zS, zL, i === 3 ? C.craneBlue : C.craneRed));

    // --- stacking yard: blocks of 6 containers (lateral pitch 2.7 m), sections of 11 slots (pitch 12.9 m), RTG cranes between lanes
    const apronZ = ZQ_CONT - 40;
    const blockW = 6 * 2.7;
    const laneW = 10;
    const yardTop = c.z0 + 10;
    const sections = [0, 1, 2].map((k) => 1722 + k * (11 * 12.9 + 12));
    let zEnd = apronZ - 8; // south edge of the block nearest to the apron
    const asphalt = new PB();
    let b = 0;
    while (zEnd - blockW >= yardTop) {
      const zs0 = zEnd - blockW;
      sections.forEach((x0, si) => this.containerSection(x0, zs0, blockW, 11, b * 3 + si));
      this.rtg(sections[0] + 70, zs0 + blockW / 2, blockW + 2.4, C.rtg);
      this.rtg(sections[1] + 70, zs0 + blockW / 2, blockW + 2.4, C.rtg);
      // lane marking (white dashes) along the lane north of the block
      for (let x = sections[0]; x < sections[2] + 11 * 12.9; x += 14) asphalt.box(x, x + 6, T + 0.02, T + 0.035, zs0 - laneW / 2 - 0.1, zs0 - laneW / 2 + 0.1, C.white, { det: true });
      zEnd = zs0 - laneW;
      b++;
    }
    // asphalt lanes between the blocks (darker, drawn under the containers)
    asphalt.slab(c.x0 + 6, yardTop, c.x1 - 6, apronZ - 6, T + 0.015, C.asphalt, 0.015);
    this.piece(this.id('lanes'), 'ground', asphalt);
  }

  private containerSection(x0: number, z0: number, w: number, slots: number, seed: number): void {
    const pb = new PB();
    const r = mulberry32(0xc0ffee + seed * 7919);
    for (let i = 0; i < slots; i++) {
      for (let j = 0; j < 6; j++) {
        if (r() < 0.09) continue; // empty slot
        const tiers = 1 + Math.floor(r() * r() * 4 + r() * 1.6); // mostly 1-3 high, sometimes 4-5
        const cx0 = x0 + i * 12.9, cz0 = z0 + j * (w / 6);
        const base = BOX_COLORS[Math.floor(r() * BOX_COLORS.length)];
        for (let t = 0; t < tiers; t++) {
          const col = r() < 0.15 ? BOX_COLORS[Math.floor(r() * BOX_COLORS.length)] : base;
          pb.box(cx0, cx0 + 12.2, T + t * 2.6, T + (t + 1) * 2.6, cz0 + 0.1, cz0 + w / 6 - 0.1, col, { det: t > 0 });
        }
        pb.box(cx0, cx0 + 12.2, T, T + tiers * 2.6, cz0 + 0.1, cz0 + w / 6 - 0.1, C.dark, { solid: true, vis: false });
      }
    }
    this.piece(this.id('containers'), 'container', pb);
  }

  /** Rubber-tyred gantry: straddles a block, runs along x. */
  private rtg(xc: number, zc: number, span: number, col: RGB): void {
    const pb = new PB();
    const hz = span / 2, hx = 6, H = 17.5;
    for (const sx of [-hx, hx]) for (const sz of [-hz, hz]) {
      pb.box(xc + sx - 0.5, xc + sx + 0.5, T, T + H, zc + sz - 0.5, zc + sz + 0.5, col, { solid: true });
      pb.box(xc + sx - 0.9, xc + sx + 0.9, T, T + 1.1, zc + sz - 1.1, zc + sz + 1.1, C.dark, { det: true }); // tyre bogie
    }
    for (const sx of [-hx, hx]) pb.box(xc + sx - 0.5, xc + sx + 0.5, T + H, T + H + 1.3, zc - hz - 0.6, zc + hz + 0.6, col);
    for (const sz of [-hz, hz]) pb.box(xc - hx, xc + hx, T + H, T + H + 1.1, zc + sz - 0.4, zc + sz + 0.4, col, { det: true });
    pb.box(xc - 1.6, xc + 1.6, T + H - 2.2, T + H, zc - 3, zc + 3, C.steel, { det: true }); // trolley + spreader
    pb.box(xc - hx - 1.5, xc - hx + 1.5, T + H + 1.3, T + H + 3.6, zc - hz - 1, zc - hz + 2, C.white, { det: true }); // cabin
    this.piece(this.id('rtg'), 'crane', pb);
  }

  /** Ship-to-shore container crane: 4 legs, sills, portal beam, boom (outreach 55 m over the water), A-frame and stays. */
  private stsCrane(x: number, zS: number, zL: number, col: RGB): void {
    const pb = new PB();
    const gx = 9, H = 31;
    for (const sx of [-gx, gx]) for (const z of [zS, zL]) {
      pb.box(x + sx - 1.1, x + sx + 1.1, T, T + H, z - 1.1, z + 1.1, col, { solid: true });
      pb.box(x + sx - 1.9, x + sx + 1.9, T, T + 1.3, z - 1.6, z + 1.6, C.dark, { det: true }); // wheel truck
    }
    for (const sx of [-gx, gx]) {
      pb.box(x + sx - 0.9, x + sx + 0.9, T + 4, T + 6, zL, zS, col, { det: true }); // sill beam
      pb.box(x + sx - 0.9, x + sx + 0.9, T + H, T + H + 2.2, zL - 1.2, zS + 1.2, col); // portal top beam
    }
    for (const z of [zS, zL]) pb.box(x - gx, x + gx, T + H - 1.4, T + H, z - 0.9, z + 0.9, col);
    // boom over the water (girder box), tip at zS + 55, back reach to zL - 24
    pb.box(x - 1.7, x + 1.7, T + 38.5, T + 41.2, zL - 24, zS + 55, col);
    pb.box(x - 2.4, x + 2.4, T + 35.5, T + 38.5, zS + 14, zS + 22, C.steelLt, { det: true }); // trolley with the spreader frame
    pb.box(x - 1.2, x + 1.2, T + 28, T + 35.5, zS + 15, zS + 21, C.steel, { det: true });
    pb.box(x - 4.5, x + 4.5, T + 41.2, T + 46, zL - 21, zL - 7, C.white, { det: true }); // machinery house
    // A-frame and stays
    pb.bar(x - 2.4, T + H + 2.2, zL + 1, x - 0.8, T + 53, zL - 1.5, 0.45, 0.45, col, { det: true });
    pb.bar(x + 2.4, T + H + 2.2, zL + 1, x + 0.8, T + 53, zL - 1.5, 0.45, 0.45, col, { det: true });
    pb.bar(x, T + 53, zL - 1.5, x, T + 41, zS + 55, 0.22, 0.22, C.steel, { det: true });
    pb.bar(x, T + 53, zL - 1.5, x, T + 41, zL - 24, 0.22, 0.22, C.steel, { det: true });
    pb.box(x - 1.2, x + 1.2, T + 53, T + 54.2, zL - 3, zL, C.red, { det: true }); // aircraft warning light box
    this.piece(this.id('sts'), 'crane', pb);
  }

  /* ---------------------------------------------------------------- landside: gates, customs, admin, tower, CFS */

  private landside(): void {
    const ls = platform('landside');
    const z0 = ls.z0 + 6; // buildings start 6 m inside the north edge
    // administration building (5 floors) with window bands, customs hall, port control tower, CFS warehouse
    const adm = new PB();
    adm.box(1718, 1750, T, T + 18, z0 + 6, z0 + 24, C.cream, { solid: true });
    for (let f = 0; f < 4; f++) adm.box(1718.1, 1749.9, T + 3 + f * 3.8, T + 4.8 + f * 3.8, z0 + 23.9, z0 + 24.15, C.glass, { det: true });
    adm.box(1717, 1751, T + 18, T + 18.7, z0 + 5, z0 + 25, C.concreteDk);
    this.piece(this.id('admin'), 'building', adm);

    const cus = new PB();
    cus.box(1760, 1800, T, T + 9, z0 + 8, z0 + 24, C.brick, { solid: true });
    cus.gable(1759, 1801, z0 + 7, z0 + 25, T + 9, T + 12, C.roofRed, true);
    cus.box(1766, 1794, T + 3, T + 4.6, z0 + 23.9, z0 + 24.15, C.glass, { det: true });
    this.piece(this.id('customs'), 'building', cus);

    const tw = new PB();
    tw.box(1812, 1820, T, T + 38, z0 + 12, z0 + 20, C.concrete, { solid: true });
    tw.box(1808, 1824, T + 38, T + 39, z0 + 8, z0 + 24, C.concreteDk);
    tw.box(1809, 1823, T + 39, T + 44, z0 + 9, z0 + 23, C.glass, { solid: true });
    tw.box(1807, 1825, T + 44, T + 44.8, z0 + 7, z0 + 25, C.concreteDk);
    tw.bar(1816, T + 44.8, z0 + 16, 1816, T + 54, z0 + 16, 0.15, 0.15, C.steel);
    this.piece(this.id('vts'), 'building', tw);

    const cfs = new PB();
    cfs.box(1960, 2090, T, T + 11, z0 + 4, z0 + 26, C.shed, { solid: true });
    cfs.gable(1959, 2091, z0 + 3, z0 + 27, T + 11, T + 13.5, C.shedRoof, false);
    for (let x = 1968; x < 2088; x += 20) cfs.box(x, x + 9, T, T + 5, z0 + 25.9, z0 + 26.2, C.dark, { det: true }); // dock doors
    this.piece(this.id('cfs'), 'building', cfs);

    // gate booths with a long canopy (inbound + outbound), red / white barrier arms
    for (const g of [1850, 1935]) {
      const pb = new PB();
      pb.box(g - 8, g + 8, T + 5.2, T + 5.8, z0 + 1, z0 + 12, C.concreteDk, { det: false });
      for (const x of [g - 8, g + 8]) pb.box(x - 0.4, x + 0.4, T, T + 5.2, z0 + 5, z0 + 6, C.steel, { solid: true });
      pb.box(g - 1.6, g + 1.6, T, T + 3.2, z0 + 4, z0 + 8, C.white, { solid: true });
      pb.box(g - 1.4, g + 1.4, T + 1.3, T + 2.4, z0 + 3.9, z0 + 4.1, C.glass, { det: true });
      pb.bar(g - 7, T + 1.1, z0 + 2.5, g - 2, T + 1.1, z0 + 2.5, 0.08, 0.12, C.red, { det: true });
      pb.bar(g + 7, T + 1.1, z0 + 2.5, g + 2, T + 1.1, z0 + 2.5, 0.08, 0.12, C.white, { det: true });
      this.piece(this.id('gate'), 'building', pb);
    }
  }

  /* ---------------------------------------------------------------- bulk / general cargo */

  private bulkTerminal(): void {
    const b = platform('bulk');
    // three transit sheds along the back of the yard
    [1346, 1460, 1574].forEach((x0) => {
      const pb = new PB();
      const z0 = b.z0 + 10;
      pb.box(x0, x0 + 100, T, T + 12, z0, z0 + 30, C.shed, { solid: true });
      pb.gable(x0 - 1, x0 + 101, z0 - 1, z0 + 31, T + 12, T + 14.5, C.shedRoof, true);
      for (let x = x0 + 6; x < x0 + 96; x += 18) pb.box(x, x + 8, T, T + 6, z0 + 29.9, z0 + 30.2, C.dark, { det: true });
      this.piece(this.id('shed'), 'building', pb);
    });
    // open stockpiles (coal, sand) in front of the sheds
    const sp = new PB();
    ([[1385, 2868, 15, 9, C.coal], [1440, 2874, 13, 8, C.coal], [1500, 2866, 14, 8, C.sand]] as const).forEach(([x, z, r, h, c]) => {
      sp.cyl(x, z, r, T, T + h * 0.35, c, 10, { solid: true });
      sp.cyl(x, z, r * 0.62, T + h * 0.35, T + h * 0.7, c, 10);
      sp.cyl(x, z, r * 0.28, T + h * 0.7, T + h, c, 10);
    });
    this.piece(this.id('stock'), 'silo', sp);
    // grain silos + conveyor gallery out to a ship loader
    const si = new PB();
    for (let i = 0; i < 4; i++) si.cyl(1618 + i * 20, 2870, 8.5, T, T + 30, C.concreteLt, 14, { solid: true });
    si.box(1608, 1698, T + 30, T + 33, 2862, 2878, C.concreteDk);
    si.box(1608, 1698, T, T + 4, 2862, 2878, C.concreteDk, { det: true });
    si.box(1696, 1700, T + 4, T + 32, 2858, 2882, C.concreteDk, { solid: true }); // elevator tower
    si.bar(1646, T + 20, 2886, 1646, T + 9.5, ZQ_BULK + 14, 1.2, 1.2, C.steelLt); // conveyor gallery to the ship loader
    for (let z = 2890; z < ZQ_BULK; z += 14) si.box(1645, 1647, T, T + 9, z - 0.3, z + 0.3, C.steel, { det: true });
    si.box(1642, 1650, T + 9.4, T + 11, ZQ_BULK + 10, ZQ_BULK + 16, C.yellow);
    this.piece(this.id('silos'), 'silo', si);
    // two mobile harbour cranes on the quay
    [1440, 1530].forEach((x) => this.mobileCrane(x, ZQ_BULK - 9));
  }

  private mobileCrane(x: number, z: number): void {
    const pb = new PB();
    pb.box(x - 5, x + 5, T, T + 4.2, z - 3, z + 3, C.dark, { solid: true }); // chassis + outriggers
    pb.box(x - 3.5, x + 3.5, T + 4.2, T + 8, z - 3.5, z + 3.5, C.yellow, { solid: true }); // slewing house
    pb.box(x - 1.2, x + 1.2, T + 8, T + 11.5, z - 6.5, z - 2.5, C.glass, { det: true }); // cab
    pb.cyl(x, z, 1.5, T + 8, T + 17, C.yellow, 8, { solid: true }); // tower
    pb.bar(x, T + 17, z, x, T + 33, z + 28, 0.8, 0.8, C.yellow); // boom, raised, out over the vessel
    pb.bar(x, T + 17, z, x, T + 21, z - 7, 0.6, 0.6, C.steel, { det: true });
    pb.bar(x, T + 33, z + 28, x, T + 13, z + 27, 0.12, 0.12, C.dark, { det: true }); // hoist rope + grab
    pb.box(x - 1.6, x + 1.6, T + 9.5, T + 13, z + 25.5, z + 28.5, C.steel, { det: true });
    this.piece(this.id('mhc'), 'crane', pb);
  }

  /* ---------------------------------------------------------------- fishing harbour */

  private fishingHarbour(): void {
    const f = platform('fishing');
    const hall = new PB();
    hall.box(1115, 1180, T, T + 9, f.z0 + 8, f.z0 + 34, C.cream, { solid: true });
    hall.gable(1114, 1181, f.z0 + 7, f.z0 + 35, T + 9, T + 12, C.roofRed, true);
    for (let x = 1122; x < 1178; x += 14) hall.box(x, x + 8, T, T + 5, f.z0 + 33.9, f.z0 + 34.2, C.dark, { det: true });
    this.piece(this.id('fishhall'), 'building', hall);
    const ice = new PB();
    ice.box(1200, 1218, T, T + 12, f.z0 + 10, f.z0 + 24, C.white, { solid: true });
    ice.cyl(1222, f.z0 + 17, 1.5, T, T + 20, C.steelLt, 8, { solid: true });
    this.piece(this.id('iceplant'), 'building', ice);
    for (let i = 0; i < 3; i++) {
      const net = new PB();
      net.box(1240 + i * 28, 1262 + i * 28, T, T + 6, f.z0 + 8, f.z0 + 22, C.rust, { solid: true });
      net.gable(1239 + i * 28, 1263 + i * 28, f.z0 + 7, f.z0 + 23, T + 6, T + 8, C.shedRoof, true);
      this.piece(this.id('netshed'), 'building', net);
    }
    // three finger jetties on piles + moored fishing boats between them
    const r = mulberry32(0xf15b);
    [1150, 1215, 1280].forEach((x) => {
      const pb = new PB();
      const L = 74;
      pb.box(x - 3, x + 3, 4.55, T - 0.02, ZQ_FISH + 3.9, ZQ_FISH + L, C.concrete, { solid: true });
      for (let z = ZQ_FISH + 10; z < ZQ_FISH + L; z += 12) {
        pb.cyl(x - 2.5, z, 0.45, -6, 4.55, C.concreteDk, 6, { det: true });
        pb.cyl(x + 2.5, z, 0.45, -6, 4.55, C.concreteDk, 6, { det: true });
      }
      pb.box(x - 3, x + 3, T - 0.02, T + 0.2, ZQ_FISH + L - 0.4, ZQ_FISH + L, C.concreteLt, { det: true });
      this.piece(this.id('finger'), 'jetty', pb);
    });
    [[1182, 2955], [1182, 2985], [1247, 2950], [1247, 2982], [1247, 3008], [1112, 2965]].forEach(([x, z]) => this.fishingBoat(x, z, r));
  }

  private fishingBoat(x: number, z: number, r: () => number): void {
    const pb = new PB();
    const hullC: RGB = r() < 0.5 ? C.hullNavy : [0.15, 0.42, 0.45];
    const L = 8 + r() * 3.5;
    pb.box(x - 2, x + 2, -1.1, 1.3, z - L / 2, z + L / 2, hullC);
    pb.box(x - 1.7, x + 1.7, 0.1, 1.45, z - L / 2 + 0.2, z + L / 2 - 0.2, C.white, { det: true });
    pb.box(x - 1.4, x + 1.4, 1.45, 3.6, z + L / 2 - 4.2, z + L / 2 - 0.8, C.white); // wheelhouse aft
    pb.bar(x, 1.3, z - L / 4, x, 7.5, z - L / 4, 0.1, 0.1, C.steel, { det: true }); // mast
    this.piece(this.id('fboat'), 'boat', pb);
  }

  /* ---------------------------------------------------------------- oil terminal */

  private oilTerminal(): void {
    const o = OIL.tankFarm;
    // four storage tanks with floating roofs, bund wall (solid), pump house, pipe rack, loading manifold
    const tanks = new PB();
    [2314, 2350, 2386, 2422].forEach((x, i) => {
      tanks.cyl(x, 2905, 13, TO, TO + 15, i === 1 ? C.craneRed : C.tank, 20, { solid: true });
      tanks.cyl(x, 2905, 13.4, TO + 15, TO + 15.5, C.tankRoof, 20);
      tanks.bar(x + 12, TO + 0.5, 2905 + 3, x + 6, TO + 15.5, 2905 + 10, 0.35, 0.12, C.steel, { det: true }); // spiral stair
    });
    const w = 0.5, y1 = TO + 1.4;
    tanks.box(o.x0 + 2, o.x1 - 2, TO, y1, 2877, 2877 + w * 2, C.concreteDk, { solid: true });
    tanks.box(o.x0 + 2, o.x1 - 2, TO, y1, 2932, 2932 + w * 2, C.concreteDk, { solid: true });
    tanks.box(o.x0 + 2, o.x0 + 2 + w * 2, TO, y1, 2877, 2934, C.concreteDk, { solid: true });
    tanks.box(o.x1 - 2 - w * 2, o.x1 - 2, TO, y1, 2877, 2934, C.concreteDk, { solid: true });
    this.piece(this.id('tanks'), 'tank', tanks);

    const ph = new PB();
    ph.box(2400, 2418, TO, TO + 6, 2921, 2931, C.shed, { solid: true });
    ph.box(2300, 2430, TO + 0.0, TO + 0.5, 2929.5, 2931, C.pipe, { det: true }); // pipe header
    ph.box(2360, 2363, TO, TO + 0.7, 2933, 2938, C.pipeBlue, { det: true });
    this.piece(this.id('pump'), 'building', ph);

    // trestle: road + pipes on piles from the terrace to the T-head
    const tr = new PB();
    const z0 = o.z1, z1 = OIL.headZ - OIL.headHalf;
    tr.box(OIL.trunkX - OIL.trunkHalf, OIL.trunkX + OIL.trunkHalf, OIL.deck - 0.55, TO - 0.02, z0, z1, C.concrete, { solid: true });
    for (const dx of [-3.6, -2.7, -1.8]) tr.box(OIL.trunkX + dx - 0.3, OIL.trunkX + dx + 0.3, TO, TO + 0.6, z0, z1, dx === -2.7 ? C.pipeBlue : C.pipe, { det: true });
    for (const dx of [-OIL.trunkHalf, OIL.trunkHalf]) tr.box(OIL.trunkX + dx - 0.15, OIL.trunkX + dx + 0.15, TO, TO + 0.9, z0, z1, C.concreteLt, { det: true });
    for (let z = z0 + 8; z < z1; z += 16) for (const dx of [-3.8, 3.8]) tr.cyl(OIL.trunkX + dx, z, 0.5, -8, OIL.deck - 0.55, C.concreteDk, 6, { det: true });
    this.piece(this.id('trestle'), 'jetty', tr);

    // T-head: working platform, mooring + breasting dolphins with catwalks, loading arms
    const hd = new PB();
    hd.box(OIL.headX0, OIL.headX1, OIL.deck - 0.55, TO - 0.02, OIL.headZ - OIL.headHalf, OIL.headZ + OIL.headHalf, C.concrete, { solid: true });
    hd.box(OIL.headX0, OIL.headX1, TO - 0.02, TO + 0.3, OIL.headZ + OIL.headHalf - 0.4, OIL.headZ + OIL.headHalf, C.concreteLt, { det: true });
    for (let x = OIL.headX0 + 6; x < OIL.headX1; x += 14) for (const dz of [-5.5, 5.5]) hd.cyl(x, OIL.headZ + dz, 0.5, -8, OIL.deck - 0.55, C.concreteDk, 6, { det: true });
    for (let x = OIL.headX0 + 10; x < OIL.headX1; x += 25) hd.box(x - 1, x + 1, TO - 0.02, TO + 0.2, OIL.headZ + 6.2, OIL.headZ + 6.8, C.fender, { det: true });
    this.piece(this.id('head'), 'jetty', hd);
    const dz = OIL.headZ + 18;
    [[OIL.headX0 - 22, 3.1], [OIL.headX1 + 22, 3.1], [2335, 2.6], [2405, 2.6]].forEach(([x, rr]) => {
      const pb = new PB();
      pb.cyl(x, dz, rr, -14, 10.5, C.concreteDk, 12, { solid: true });
      pb.cyl(x, dz, rr + 0.3, 10.5, 11.1, C.concreteLt, 12);
      pb.box(x - 0.5, x + 0.5, TO - 0.02, TO + 0.25, OIL.headZ + OIL.headHalf, dz - rr, C.concrete, { det: true }); // catwalk stub
      this.piece(this.id('dolphin'), 'jetty', pb);
    });
    [2360, 2385].forEach((x) => {
      const pb = new PB();
      pb.box(x - 1, x + 1, TO, TO + 1.5, OIL.headZ - 1, OIL.headZ + 1, C.steel, { solid: true });
      pb.box(x - 0.4, x + 0.4, TO + 1.5, TO + 9, OIL.headZ - 0.4, OIL.headZ + 0.4, C.yellow, { det: true });
      pb.bar(x, TO + 9, OIL.headZ, x, TO + 4, OIL.headZ + 14, 0.3, 0.3, C.yellow, { det: true });
      this.piece(this.id('larm'), 'crane', pb);
    });
  }

  /* ---------------------------------------------------------------- breakwaters */

  private breakwaters(): void {
    const m = D.mound;
    const r = mulberry32(0xb4ea);
    for (const s of BREAKWATERS) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux; // normal; the sea side is the +z side
      const sea = nz > 0 ? 1 : -1;
      const n = Math.ceil(len / 100);
      for (let i = 0; i < n; i++) {
        const t0 = (len * i) / n, t1 = (len * (i + 1)) / n;
        const pb = new PB();
        const ax = s.ax + ux * t0, az = s.az + uz * t0, bx = s.ax + ux * t1, bz = s.az + uz * t1;
        // crest road + crown wall on the sea side
        pb.bar(ax, m.crest + 0.1, az, bx, m.crest + 0.1, bz, 4.5, 0.1, C.concreteLt);
        pb.bar(ax + nx * sea * 5.3, m.crest + 1.2, az + nz * sea * 5.3, bx + nx * sea * 5.3, m.crest + 1.2, bz + nz * sea * 5.3, 0.6, 1.2, C.concrete, { solid: true });
        // armour stones on both slopes
        for (let t = t0; t < t1; t += 9) {
          for (const side of [1, -1]) for (const k of [0, 9, 20]) {
            const d = m.half + 0.5 + k + r() * 3;
            const y = m.crest - Math.max(0, d - m.half) / m.slope;
            const px = s.ax + ux * (t + r() * 4) + nx * side * d, pz = s.az + uz * (t + r() * 4) + nz * side * d;
            const sz = 1.6 + r() * 1.6;
            pb.box(px - sz, px + sz, y - sz * 0.4, y + sz * 1.1, pz - sz, pz + sz, r() < 0.5 ? C.rock : C.rockDk, { det: true });
          }
        }
        this.piece(this.id(`bw-${s.id}`), 'breakwater', pb);
      }
      // navigation lights on the head (green on the mole, red on the wing)
      for (const [x, z, c] of [[s.bx, s.bz, s.id === 'south-mole' ? C.green : C.red]] as const) {
        const pb = new PB();
        pb.box(x - 2.2, x + 2.2, m.crest, m.crest + 3, z - 2.2, z + 2.2, C.concrete, { solid: true });
        pb.cyl(x, z, 0.9, m.crest + 3, m.crest + 9, C.white, 8, { solid: true });
        pb.cyl(x, z, 1.2, m.crest + 9, m.crest + 10.6, c, 8);
        this.piece(this.id('beacon'), 'light', pb);
      }
    }
  }

  /* ---------------------------------------------------------------- ships at the berths */

  private ships(): void {
    const r = mulberry32(0x5415);
    // --- container ship (300 m) alongside the container quay, stern to the west
    {
      const x0 = 1740, L = 300, B = 42, zc = ZQ_CONT + 4 + B / 2, deck = 9;
      const pb = this.hull(x0, L, zc, B, 12, deck, C.hullRed, C.hullNavy);
      // accommodation block + funnel at the stern, containers in bays on deck
      pb.box(x0 + 22, x0 + 50, deck, deck + 33, zc - 14, zc + 14, C.white, { solid: true });
      for (let f = 0; f < 6; f++) pb.box(x0 + 49.9, x0 + 50.2, deck + 4 + f * 4.6, deck + 6 + f * 4.6, zc - 13, zc + 13, C.glass, { det: true });
      pb.box(x0 + 10, x0 + 22, deck, deck + 26, zc - 4, zc + 4, C.craneRed);
      for (let bx = x0 + 60; bx < x0 + L - 40; bx += 12.8) {
        for (let g = 0; g < 5; g++) {
          const tiers = 3 + Math.floor(r() * 4);
          const base = BOX_COLORS[Math.floor(r() * BOX_COLORS.length)];
          for (let t = 0; t < tiers; t++) pb.box(bx, bx + 12.2, deck + t * 2.6, deck + (t + 1) * 2.6, zc - B / 2 + 2 + g * 7.6, zc - B / 2 + 2 + g * 7.6 + 7.4, r() < 0.2 ? BOX_COLORS[Math.floor(r() * BOX_COLORS.length)] : base, { det: t > 1 });
        }
      }
      this.piece(this.id('ship-container'), 'ship', pb);
    }
    // --- bulk carrier (190 m) at the bulk quay, stern to the west
    {
      const x0 = 1410, L = 190, B = 32, zc = ZQ_BULK + 4 + B / 2, deck = 7;
      const pb = this.hull(x0, L, zc, B, 9.5, deck, C.hullGreen, C.hullBlack);
      pb.box(x0 + 8, x0 + 30, deck, deck + 26, zc - 11, zc + 11, C.white, { solid: true });
      pb.box(x0 + 2, x0 + 8, deck, deck + 14, zc - 3, zc + 3, C.craneRed);
      for (let i = 0; i < 7; i++) pb.box(x0 + 40 + i * 20, x0 + 40 + i * 20 + 17, deck, deck + 1.8, zc - 12, zc + 12, C.hatch, );
      for (let i = 0; i < 3; i++) {
        const x = x0 + 70 + i * 40;
        pb.cyl(x, zc, 1.1, deck, deck + 10, C.yellow, 8, { det: true });
        pb.bar(x, deck + 10, zc, x, deck + 22, zc + 22, 0.5, 0.5, C.yellow, { det: true });
      }
      this.piece(this.id('ship-bulk'), 'ship', pb);
    }
    // --- product tanker (170 m) at the oil jetty, along the T-head, stern to the east
    {
      const x0 = OIL.headX0 - 15, L = 170, B = 30, zc = OIL.headZ + 8 + 3 + B / 2, deck = 7.5;
      const pb = this.hull(x0, L, zc, B, 10.5, deck, C.hullRed, C.hullBlack);
      pb.box(x0 + L - 34, x0 + L - 8, deck, deck + 24, zc - 10, zc + 10, C.white, { solid: true });
      pb.cyl(x0 + L - 14, zc, 2.6, deck + 24, deck + 32, C.craneRed, 10);
      for (let x = x0 + 14; x < x0 + L - 40; x += 16) pb.box(x, x + 1.2, deck, deck + 1.4, zc - 1, zc + 1, C.pipe, { det: true });
      pb.box(x0 + 14, x0 + L - 40, deck, deck + 1.0, zc - 0.5, zc + 0.5, C.pipe, { det: true });
      pb.box(x0 + 80, x0 + 92, deck, deck + 3, zc - 6, zc + 6, C.steel, { det: true }); // manifold
      this.piece(this.id('ship-tanker'), 'ship', pb);
    }
  }

  /** Hull: red / black lower + upper body, bow and stern blocks. Solid (one box) so boats and the player cannot go through. */
  private hull(x0: number, L: number, zc: number, B: number, draft: number, deck: number, lower: RGB, upper: RGB): PB {
    const pb = new PB();
    const h = B / 2;
    pb.box(x0 + 14, x0 + L - 30, -draft, 0.0, zc - h, zc + h, lower, { solid: true });
    pb.box(x0 + 14, x0 + L - 30, 0.0, deck, zc - h, zc + h, upper, { solid: true });
    pb.box(x0, x0 + 14, -draft * 0.9, deck, zc - h * 0.82, zc + h * 0.82, upper, { solid: true }); // stern
    pb.box(x0 + L - 30, x0 + L - 10, -draft, deck + 1, zc - h * 0.76, zc + h * 0.76, upper, { solid: true }); // forward body
    pb.box(x0 + L - 10, x0 + L, -draft * 0.5, deck + 2.5, zc - h * 0.4, zc + h * 0.4, upper, { solid: true }); // bow
    pb.box(x0 + 14, x0 + L - 30, deck, deck + 0.2, zc - h, zc + h, C.deckGrey);
    return pb;
  }

  /* ---------------------------------------------------------------- light masts */

  private lights(): void {
    const pts: [number, number, number][] = [];
    for (let x = 1760; x <= 2160; x += 100) pts.push([x, 2897, T], [x, 2843, T]);
    for (let x = 1360; x <= 1660; x += 100) pts.push([x, 2860, T]);
    pts.push([1210, 2900, T], [1130, 2870, T], [2330, 2925, TO], [2410, 2880, TO]);
    for (const [x, z, y] of pts) {
      const pb = new PB();
      pb.cyl(x, z, 0.35, y, y + 28, C.steelLt, 6, { solid: true });
      pb.box(x - 2.4, x + 2.4, y + 28, y + 29.2, z - 0.6, z + 0.6, C.steel);
      pb.box(x - 2.1, x + 2.1, y + 27.4, y + 28, z - 0.5, z + 0.5, [0.95, 0.95, 0.8], { det: true });
      this.piece(this.id('mast'), 'light', pb);
    }
  }
}

let cache: PortLayout | null = null;
/** The one layout of this thread (the worker builds its own, the main thread another; both are identical). */
export function getPortLayout(): PortLayout {
  if (!cache) cache = new PortLayout();
  return cache;
}
