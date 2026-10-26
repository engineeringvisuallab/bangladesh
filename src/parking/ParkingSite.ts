// Parking around the City Mall's west door, across / along the F4 road, plus the start point + the parked fleet slots.
// Pure numbers and a few functions (no three.js / DOM): the terrain's vegetation code, the engine and the lot builder all use it.
//
// Lot frame: origin P0 on the F4 centre line, `s` runs along F4 away from the crossing (= to the LEFT when you face the mall),
// `n` is the distance from the F4 centre line towards the SOUTH-WEST side (away from the mall). So n > 0 is the start side, n < 0 is
// the mall side. The F4 kerb is at |n| ~ 9.2; the mall's glass wall stands at n ~ -16.5; its west door is at s ~ 16.7.
//
// LAYOUT (looking from the start point at the mall):
//   START SIDE (n > 0)   right: MALL_LOT (angled bays, 3 rows) | APRON = entry road + the START POINT | left: EVLAB_LOT (big lot with the fleet)
//   MALL SIDE  (n < 0)   FRONT_ROW = ONE row of bays right in front of the mall wall (gap at the door) | SIDE_LOT = big lot beside the
//                        mall (north of it, along F4) with its own driveway.
// Nothing here carries a signboard any more.

const UX = 0.33303786, UZ = -0.94291345; // along F4
const NX = -0.94291345, NZ = -0.33303786; // away from the mall, across F4
const OX = 15, OZ = -93.4;

export function lotToWorld(s: number, n: number): { x: number; z: number } {
  return { x: OX + UX * s + NX * n, z: OZ + UZ * s + NZ * n };
}

/** Yaw (about +y) of a vehicle whose nose points along lot direction (ds, dn). */
export function lotYaw(ds: number, dn: number): number {
  return Math.atan2(UX * ds + NX * dn, UZ * ds + NZ * dn);
}

export interface LotRect { id: 'mall' | 'evlab' | 'apron' | 'front' | 'side' | 'sidedrive'; s0: number; s1: number; n0: number; n1: number }

/** Start side, right: the angled-bay lot. */
export const MALL_LOT: LotRect = { id: 'mall', s0: -4, s1: 20, n0: 13, n1: 40 };
/** Start side, middle: the entry road from F4 (it reaches the F4 shoulder) and the apron where the player starts. */
export const APRON: LotRect = { id: 'apron', s0: 20, s1: 36, n0: 9.6, n1: 44 };
/** Start side, left: the big lot with the EVLAB fleet (bikes, cars, bus, tank, helicopter pad). */
export const EVLAB_LOT: LotRect = { id: 'evlab', s0: 36, s1: 80, n0: 13, n1: 44 };
/** Mall side: ONE row of bays along the mall's west wall (on the paved strip between F4 and the glass), left open at the door. */
export const FRONT_ROW: LotRect = { id: 'front', s0: 2, s1: 70, n0: -16.3, n1: -10.6 };
/** Mall side: the big lot beside (north of) the mall, and its driveway from F4. Move SIDE_LOT.s0/s1 to slide it along the road. */
export const SIDE_LOT: LotRect = { id: 'side', s0: 104, s1: 150, n0: -37, n1: -14.5 };
export const SIDE_DRIVE: LotRect = { id: 'sidedrive', s0: 108, s1: 116, n0: -14.5, n1: -9.8 };

export const PARKING_LOTS: ReadonlyArray<LotRect> = [MALL_LOT, APRON, EVLAB_LOT, FRONT_ROW, SIDE_LOT, SIDE_DRIVE];

/** True on a lot (+ margin): no trees, rocks or grass here. */
export function parkingContains(x: number, z: number, margin = 0): boolean {
  const dx = x - OX, dz = z - OZ;
  const s = dx * UX + dz * UZ, n = dx * NX + dz * NZ;
  for (const l of PARKING_LOTS) {
    if (s >= l.s0 - margin && s <= l.s1 + margin && n >= l.n0 - margin && n <= l.n1 + margin) return true;
  }
  return false;
}

/** The EVLAB lot's s positions were laid out for a lot starting at s = 48; the lot now starts at 36. */
const SH = EVLAB_LOT.s0 - 48;

/** Row A (nose to the road): the eight small road vehicles. Row B: bus (along the road), tank and helicopter pad. */
export const EVLAB_SLOTS = {
  bike: { s: 52.5 + SH, n: 16.6 },
  evbike: { s: 56.5 + SH, n: 16.6 },
  rickshaw: { s: 60.5 + SH, n: 16.8 },
  auto: { s: 64.5 + SH, n: 16.8 },
  sedan: { s: 68.5 + SH, n: 17.2 },
  jeep: { s: 72.5 + SH, n: 17.2 },
  hypercar: { s: 76.5 + SH, n: 17.2 },
  evhypar: { s: 80.5 + SH, n: 17.2 },
  bus: { s: 61 + SH, n: 33 },
  tank: { s: 74.5 + SH, n: 34 },
  heli: { s: 85 + SH, n: 34 },
};
/** Bay lines of row A (s positions): eight 4 m bays. */
export const EVLAB_ROW_A_LINES = [50.5, 54.5, 58.5, 62.5, 66.5, 70.5, 74.5, 78.5, 82.5].map((s) => s + SH);

/** Where the player starts: in the middle of the apron (the entry road), looking over F4 at the mall's west door. */
export const START_LOT_POS = { s: 28, n: 18 };

// ---------------------------------------------------------------------------------------------------------------------------------
// The painted layout as plain data (lot coordinates). ParkingLots drapes it over the terrain; scripts can dump it for a top view.
// ---------------------------------------------------------------------------------------------------------------------------------
/** [s0, s1, n0, n1, step?] - an axis-aligned patch in lot coordinates. */
export type Rect4 = readonly [number, number, number, number, number?];
/** A straight painted line (width w) from lot point a to lot point b. */
export interface Seg { a: readonly [number, number]; b: readonly [number, number]; w: number }
export interface ParkingGeometry {
  asphalt: Rect4[];
  kerb: Rect4[];
  paint: Rect4[];
  lines: Seg[];
  rings: { s: number; n: number; r: number; w: number }[];
}

export function buildParkingGeometry(): ParkingGeometry {
  const g: ParkingGeometry = { asphalt: [], kerb: [], paint: [], lines: [], rings: [] };
  const W = 0.12; // painted line width
  const rect = (l: LotRect): Rect4 => [l.s0, l.s1, l.n0, l.n1];
  const bar = (s0: number, s1: number, n: number): void => void g.paint.push([s0, s1, n - W / 2, n + W / 2, 4]); // a line along s at n
  const post = (s: number, n0: number, n1: number): void => void g.paint.push([s - W / 2, s + W / 2, Math.min(n0, n1), Math.max(n0, n1), 2.5]); // a line along n at s
  const outline = (s0: number, s1: number, n0: number, n1: number): void => {
    g.paint.push([s0, s1, n0, n0 + W, 4], [s0, s1, n1 - W, n1, 4], [s0, s0 + W, n0, n1, 4], [s1 - W, s1, n0, n1, 4]);
  };
  const inset = 0.6;

  for (const l of PARKING_LOTS) g.asphalt.push(rect(l));

  // ---- road-side concrete kerb strips of the two start-side lots
  for (const l of [MALL_LOT, EVLAB_LOT]) g.kerb.push([l.s0, l.s1, l.n0, l.n0 + 1.4, 4]);
  // and of the side lot (open at the driveway)
  g.kerb.push([SIDE_LOT.s0, SIDE_DRIVE.s0, SIDE_LOT.n1 - 0.5, SIDE_LOT.n1, 4], [SIDE_DRIVE.s1, SIDE_LOT.s1, SIDE_LOT.n1 - 0.5, SIDE_LOT.n1, 4]);

  // ---- white edge lines: only on the OUTER sides (the apron side stays open)
  const edges = (l: LotRect, outerS: 's0' | 's1'): void => {
    bar(l.s0 + inset, l.s1 - inset, l.n1 - inset - W / 2);
    const so = outerS === 's0' ? l.s0 + inset : l.s1 - inset;
    g.paint.push([so - W / 2, so + W / 2, l.n0 + 1.6, l.n1 - inset, 4]);
  };
  edges(MALL_LOT, 's0');
  edges(EVLAB_LOT, 's1');

  // ---- APRON: dashed centre line of the entry road
  const cs = (APRON.s0 + APRON.s1) / 2;
  for (let n = 13; n < 40; n += 4) g.paint.push([cs - W / 2, cs + W / 2, n, n + 2, 2]);

  // ---- MALL_LOT: three rows of angled (60 deg) bays - row A on the road side, aisle, then rows B and C back to back (a herringbone)
  {
    const lean = 3.0, pitch = 3.2, sw = W;
    const rows: { n0: number; n1: number; flip: boolean }[] = [
      { n0: 14.2, n1: 19.4, flip: false },
      { n0: 26.0, n1: 31.2, flip: false },
      { n0: 31.2, n1: 36.4, flip: true },
    ];
    for (const r of rows) {
      for (let s = MALL_LOT.s0 + 1; s + lean <= MALL_LOT.s1 - 1 + 1e-6; s += pitch) {
        g.lines.push(r.flip ? { a: [s + lean, r.n0], b: [s, r.n1], w: sw } : { a: [s, r.n0], b: [s + lean, r.n1], w: sw });
      }
    }
    bar(MALL_LOT.s0 + 1, MALL_LOT.s1 - 1, 19.4);
    bar(MALL_LOT.s0 + 1, MALL_LOT.s1 - 1, 26.0);
  }

  // ---- EVLAB_LOT: row A = eight 4 m bays for the road vehicles, row B = bus bay (along the road), tank pad, helicopter pad
  for (const s of EVLAB_ROW_A_LINES) post(s, 14.2, 20.2);
  bar(EVLAB_ROW_A_LINES[0], EVLAB_ROW_A_LINES[EVLAB_ROW_A_LINES.length - 1], 20.2);
  const bus = EVLAB_SLOTS.bus, tank = EVLAB_SLOTS.tank, h = EVLAB_SLOTS.heli;
  outline(bus.s - 6.4, bus.s + 6.4, bus.n - 2.3, bus.n + 2.3);
  outline(tank.s - 2.9, tank.s + 2.9, tank.n - 4.6, tank.n + 4.6);
  g.rings.push({ s: h.s, n: h.n, r: 7, w: 0.4 });
  g.paint.push([h.s - 2.2, h.s - 1.6, h.n - 2.6, h.n + 2.6, 2], [h.s + 1.6, h.s + 2.2, h.n - 2.6, h.n + 2.6, 2], [h.s - 2.2, h.s + 2.2, h.n - 0.3, h.n + 0.3, 2]); // the H

  // ---- FRONT_ROW: ONE row of 2.8 m bays along the mall wall, a gap at the west door (s ~ 16.7)
  {
    const door = 16.7, gap = 3.6, pitch = 2.8;
    const n0 = FRONT_ROW.n0 + 0.2, n1 = FRONT_ROW.n1 - 0.8; // bay depth 4.6 m
    for (let s = FRONT_ROW.s0; s <= door - gap + 1e-6; s += pitch) post(s, n0, n1);
    for (let s = door + gap; s <= FRONT_ROW.s1 + 1e-6; s += pitch) post(s, n0, n1);
  }

  // ---- SIDE_LOT: bays along s, row A (road side), aisle, rows B and C back to back
  {
    const pitch = 2.9;
    const rows: [number, number][] = [[-19.9, -15.1], [-31.4, -26.4], [-36.4, -31.4]];
    for (const [a, b] of rows) for (let s = SIDE_LOT.s0 + 1.5; s <= SIDE_LOT.s1 - 1.5 + 1e-6; s += pitch) post(s, a, b);
    bar(SIDE_LOT.s0 + 1.5, SIDE_LOT.s1 - 1.5, -19.9);
    bar(SIDE_LOT.s0 + 1.5, SIDE_LOT.s1 - 1.5, -26.4);
    bar(SIDE_LOT.s0 + 1.5, SIDE_LOT.s1 - 1.5, -31.4);
    bar(SIDE_LOT.s0 + inset, SIDE_LOT.s1 - inset, SIDE_LOT.n0 + inset + W / 2);
    g.paint.push([SIDE_LOT.s1 - inset - W, SIDE_LOT.s1 - inset, SIDE_LOT.n0 + inset, SIDE_LOT.n1 - 1.4, 4]);
    g.paint.push([SIDE_LOT.s0 + inset, SIDE_LOT.s0 + inset + W, SIDE_LOT.n0 + inset, SIDE_LOT.n1 - 1.4, 4]);
  }
  return g;
}
