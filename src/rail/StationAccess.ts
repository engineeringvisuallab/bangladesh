import { RAIL_DESIGN as D } from './RailPlan';
import type { RailNetwork } from './RailNetwork';

/**
 * STATION ACCESS (pure geometry, no three.js / Rapier): the way UP to a platform.
 *
 * Six of the eight stations stand on a viaduct 10-18 m above the ground (platform = `level`), so people and the player need a real staircase to
 * get to the trains. Every platform side of a passenger / mixed station gets one:
 *   - a straight STAIR that starts at the OUTER edge of the platform (between two canopy posts) and runs away from the track, 3.2 m wide, 0.20 m rise,
 *     0.32 m tread, until the tread meets the ground (the terrain height is sampled under every step, so it works on any slope);
 *   - side WALLS (1.1 m) on both sides, so nobody falls off the stair;
 *   - a GATE SHELTER at the top (roof on four posts with a blue "station" sign) and an entrance SIGN at the foot.
 * The same list of boxes feeds the railway mesh (RailMesh, worker) and the colliders (RailPhysics, main thread): both call `stationAccesses` with the
 * same ground function, the result is deterministic, so picture and collision always agree. A candidate position along the platform is skipped when
 * one of its steps would stand on a road / road bridge (the stair must never block a street); then the next candidate is tried.
 */
export const ACCESS = {
  rise: 0.2,
  run: 0.32,
  width: 3.2,
  maxSteps: 150,
  /** Platform top above `RailStation.level` (collider top; the picture is 0.02 lower). */
  platformTop: 0.96,
  /** Flat landing between the platform edge and the first step (m): it carries the stair over the viaduct parapet (the parapet is 1.0 m high and stands 0.3 m inside the deck edge, a step 0.6 m under the platform top would walk into it). */
  landing: 1.9,
  wall: 0.12,
  wallH: 1.1,
  /** Positions along the platform (m from its middle, + = away from the line end) between two canopy posts (posts stand at -55 + 15 k). */
  along: [12.5, -17.5, 42.5, -47.5, 27.5, -2.5, 57.5, -32.5],
} as const;

export type AccessBoxKind = 'tread' | 'wall' | 'post' | 'roof' | 'sign';

export interface AccessBox {
  kind: AccessBoxKind;
  /** Box centre. */
  x: number;
  y: number;
  z: number;
  /** Unit direction of the box's LONG axis in the ground plane, half sizes along it / up / across it. */
  ax: number;
  az: number;
  hl: number;
  hh: number;
  hw: number;
  /** True: the box is solid (treads, walls); false: decoration only. */
  solid: boolean;
}

export interface StationAccess {
  station: string;
  /** Index into `RailStation.arrivals` and the platform side (+1 / -1 times the across vector of the line). */
  arrival: number;
  side: 1 | -1;
  /** Unit vectors: along the platform (tangent of the line) and away from the track (this side). */
  tx: number;
  tz: number;
  ox: number;
  oz: number;
  /** Platform standing point at the head of the stair (top of the platform) and the foot (ground). */
  top: { x: number; y: number; z: number };
  foot: { x: number; y: number; z: number };
  /** Walking points from the top of the stair (index 0) down to the foot (last), on the tread surfaces. */
  steps: { x: number; y: number; z: number }[];
  /** Centre of the whole structure, and a radius that contains all of it (m). */
  cx: number;
  cz: number;
  radius: number;
  boxes: AccessBox[];
}

const cache = new WeakMap<RailNetwork, StationAccess[]>();

/** Every station access of the railway (computed once per network; `groundAt` must be the final terrain height). */
export function stationAccesses(rail: RailNetwork, groundAt: (x: number, z: number) => number): StationAccess[] {
  const hit = cache.get(rail);
  if (hit) return hit;
  const out: StationAccess[] = [];
  const half = D.trackSpacing / 2;
  const platLat = half + 1.7 + 2.25;
  const edgeLat = half + 1.7 + 4.5;
  for (const st of rail.stations) {
    if (st.kind === 'freight') continue;
    st.arrivals.forEach((ar, ai) => {
      const e = rail.edges.find((q) => q.id === ar.edgeId);
      if (!e) return;
      const sgn = ar.end === 'a' ? 1 : -1;
      const s0 = ar.end === 'a' ? 0 : e.length;
      const p = rail.pointAt(e, s0 + sgn * (12 + D.platform / 2));
      const tx = p.dx, tz = p.dz;
      const wx = -tz, wz = tx;
      const T = st.level + ACCESS.platformTop;
      for (const side of [1, -1] as const) {
        const ox = wx * side, oz = wz * side;
        for (const q of ACCESS.along) {
          // p is on the TRACK centre line: the base point of the stair lies on the PLATFORM centre line, platLat to the side
          const a = buildOne(rail, groundAt, st.id, ai, side, p.x + tx * q + ox * platLat, p.z + tz * q + oz * platLat, tx, tz, ox, oz, T, platLat, edgeLat);
          if (a) {
            out.push(a);
            break;
          }
        }
      }
    });
  }
  cache.set(rail, out);
  return out;
}

function buildOne(
  rail: RailNetwork, groundAt: (x: number, z: number) => number, station: string, arrival: number, side: 1 | -1,
  bx: number, bz: number, tx: number, tz: number, ox: number, oz: number, T: number, platLat: number, edgeLat: number,
): StationAccess | null {
  // base point (bx, bz) is on the platform centre line; the lateral coordinate is measured from the line centre, = platLat there
  const cxl = bx - ox * platLat, czl = bz - oz * platLat; // the line centre at that along position
  const at = (lat: number): { x: number; z: number } => ({ x: cxl + ox * lat, z: czl + oz * lat });
  const boxes: AccessBox[] = [];
  const steps: { x: number; y: number; z: number }[] = [];
  const { rise, run, width, wall, wallH } = ACCESS;
  // landing: a solid slab at platform height from the platform edge over the parapet to the first step
  {
    const c = at(edgeLat + ACCESS.landing / 2 - 0.2);
    const bottom = T - 0.8;
    boxes.push({ kind: 'tread', x: c.x, y: (T + bottom) / 2, z: c.z, ax: ox, az: oz, hl: ACCESS.landing / 2 + 0.1, hh: (T - bottom) / 2, hw: width / 2, solid: true });
    for (const s of [-1, 1]) {
      const off = s * (width / 2 + wall / 2);
      boxes.push({ kind: 'wall', x: c.x + tx * off, y: (T + wallH + bottom) / 2, z: c.z + tz * off, ax: ox, az: oz, hl: ACCESS.landing / 2 + 0.1, hh: (T + wallH - bottom) / 2, hw: wall / 2, solid: true });
    }
  }
  const stairLat = edgeLat + ACCESS.landing;
  let lat = stairLat;
  let last = { x: 0, y: T, z: 0 };
  let done = false;
  for (let k = 1; k <= ACCESS.maxSteps; k++) {
    const c = at(lat + run / 2);
    const top = T - k * rise;
    const g = groundAt(c.x, c.z);
    for (const w of [-1.8, 0, 1.8]) if (rail.roadBlockedAt(c.x + tx * w, c.z + tz * w)) return null;
    const bottom = Math.min(top - 0.6, g - 0.4);
    const cy = (top + bottom) / 2;
    boxes.push({ kind: 'tread', x: c.x, y: cy, z: c.z, ax: ox, az: oz, hl: run / 2, hh: (top - bottom) / 2, hw: width / 2, solid: true });
    const wt = top + wallH;
    const wy = (wt + bottom) / 2;
    for (const s of [-1, 1]) {
      const off = s * (width / 2 + wall / 2);
      boxes.push({ kind: 'wall', x: c.x + tx * off, y: wy, z: c.z + tz * off, ax: ox, az: oz, hl: run / 2, hh: (wt - bottom) / 2, hw: wall / 2, solid: true });
    }
    steps.push({ x: c.x, y: top, z: c.z });
    last = { x: c.x, y: top, z: c.z };
    lat += run;
    if (top <= g + 0.25) {
      done = true;
      break;
    }
  }
  if (!done && steps.length === 0) return null;
  const topP = at(platLat);
  // gate shelter at the head of the stair: roof on four posts over the first 5 m, blue sign on the platform side
  const rl = stairLat + 0.1; // roof centre (lateral): over the landing and the first steps
  const rc = at(rl);
  const hwRoof = width / 2 + 0.5;
  boxes.push({ kind: 'roof', x: rc.x, y: T + 3.3, z: rc.z, ax: ox, az: oz, hl: 2.6, hh: 0.12, hw: hwRoof, solid: false });
  // the four posts stand ON THE STAIR WALLS (their foot is the top of the wall under them, so none floats in the air or hangs over the steps)
  for (const dl of [-2.3, 2.3]) {
    const latp = rl + dl;
    const c = at(latp);
    let surf = T; // landing: platform height
    let onGround = false; // past the last step (a short stair on high ground): the post stands on the terrain
    if (latp > stairLat) {
      const k = Math.floor((latp - stairLat) / run) + 1;
      if (k <= steps.length) surf = T - k * rise;
      else onGround = true;
    }
    const roofY = T + 3.3 - 0.1;
    for (const dw of [-(width / 2 + wall / 2), width / 2 + wall / 2]) {
      const px = c.x + tx * dw, pz = c.z + tz * dw;
      const foot = onGround ? groundAt(px, pz) - 0.3 : surf + wallH - 0.1;
      boxes.push({ kind: 'post', x: px, y: (foot + roofY) / 2, z: pz, ax: ox, az: oz, hl: 0.1, hh: (roofY - foot) / 2, hw: 0.1, solid: false });
    }
  }
  const sg = at(rl - 2.65);
  boxes.push({ kind: 'sign', x: sg.x, y: T + 2.9, z: sg.z, ax: ox, az: oz, hl: 0.06, hh: 0.4, hw: hwRoof, solid: false });
  // entrance sign at the foot: two posts and a board across the stair
  const fl = at(lat + 1.2);
  const gf = groundAt(fl.x, fl.z);
  for (const dw of [-width / 2 - 0.3, width / 2 + 0.3]) boxes.push({ kind: 'post', x: fl.x + tx * dw, y: gf + 1.6, z: fl.z + tz * dw, ax: ox, az: oz, hl: 0.1, hh: 1.6, hw: 0.1, solid: false });
  boxes.push({ kind: 'sign', x: fl.x, y: gf + 3.0, z: fl.z, ax: ox, az: oz, hl: 0.06, hh: 0.5, hw: width / 2 + 0.7, solid: false });
  const mx = (topP.x + last.x) / 2, mz = (topP.z + last.z) / 2;
  const radius = Math.hypot(topP.x - last.x, topP.z - last.z) / 2 + 12;
  return {
    station, arrival, side, tx, tz, ox, oz,
    top: { x: topP.x, y: T, z: topP.z },
    foot: { x: last.x, y: last.y, z: last.z },
    steps,
    cx: mx, cz: mz, radius, boxes,
  };
}
