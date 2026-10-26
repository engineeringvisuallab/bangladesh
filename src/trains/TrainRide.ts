import type { RailNetwork } from '../rail/RailNetwork';
import { stationAccesses, type StationAccess } from '../rail/StationAccess';
import { CONSIST } from './TrainConfig';
import type { CarPose, Train, TrainFleet } from './TrainSim';

/**
 * Riding a train as a passenger (pure geometry, no three.js): who may get on, and where a passenger steps out.
 * A train can be boarded only while it STANDS at a platform (state `dwell`). The player must be on the platform next to one of its cars.
 */
export interface Boardable {
  train: Train;
  /** PHYSICAL car index (0 = the loco as built). Stays the same when the train reverses, unlike the path position. */
  car: number;
}

const tmp: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };

/** Path position (0 = leading car) of a physical car, and back. */
export const pathIndex = (t: Train, car: number): number => (t.reversed ? CONSIST.length - 1 - car : car);

/** Platform: how far (m) from the middle of a car the player may stand sideways / how far above / below the rail head (player capsule CENTRE). */
const REACH = { lat: 9.5, endPad: 1.5, yMin: 0.2, yMax: 3.4 };

/** The standing train car the player (capsule centre at px, py, pz) is next to, or null. The nearest car wins. */
export function findBoardable(trains: readonly Train[], px: number, py: number, pz: number): Boardable | null {
  let best: Boardable | null = null;
  let bd = Infinity;
  for (const t of trains) {
    if (t.state !== 'dwell') continue;
    for (let j = 0; j < CONSIST.length; j++) {
      t.carPose(j, tmp);
      const hl = Math.hypot(tmp.fx, tmp.fz) || 1;
      const ux = tmp.fx / hl, uz = tmp.fz / hl;
      const dx = px - tmp.x, dz = pz - tmp.z;
      const along = dx * ux + dz * uz;
      const lat = -dx * uz + dz * ux;
      const dy = py - tmp.y;
      const half = t.carAt(j).length / 2 + REACH.endPad;
      if (Math.abs(along) > half || Math.abs(lat) > REACH.lat || dy < REACH.yMin || dy > REACH.yMax) continue;
      const d = Math.hypot(along, lat);
      if (d < bd) {
        bd = d;
        best = { train: t, car: t.reversed ? CONSIST.length - 1 - j : j };
      }
    }
  }
  return best;
}

/** Can passengers leave the train at the station it stands at? (freight stations have no stairs / platforms for people) */
export function canAlight(rail: RailNetwork, fleet: TrainFleet, t: Train): boolean {
  const st = rail.stationById(fleet.graph.nodes.get(t.node)?.station ?? '');
  return !!st && st.kind !== 'freight';
}

/**
 * Where a passenger of car `car` steps out: on the platform beside that car (the platform on the side the train stands at: its centre is
 * 3.95 m from the track axis), 1 m above the platform top so the capsule drops onto it. null = no platform for people here.
 */
export function alightSpot(rail: RailNetwork, fleet: TrainFleet, groundAt: (x: number, z: number) => number, t: Train, car: number): { x: number; y: number; z: number } | null {
  const node = fleet.graph.nodes.get(t.node);
  if (!node) return null;
  const st = rail.stationById(node.station);
  if (!st || st.kind === 'freight') return null;
  const ai = st.arrivals.findIndex((a) => a.edgeId === node.edgeId && a.end === node.end);
  const all = stationAccesses(rail, groundAt).filter((a) => a.station === st.id);
  const own = all.filter((a) => a.arrival === ai);
  const list: StationAccess[] = own.length ? own : all;
  if (!list.length) return null;
  t.carPose(pathIndex(t, car), tmp);
  const cx = tmp.x, cz = tmp.z;
  let pick: StationAccess | null = null;
  let score = Infinity;
  for (const a of list) {
    const lat = (cx - a.top.x) * a.ox + (cz - a.top.z) * a.oz; // car axis relative to this platform's centre line (negative = on the track side)
    const s = Math.abs(lat + 3.95);
    if (s < score) {
      score = s;
      pick = a;
    }
  }
  if (!pick) return null;
  const along = Math.max(-70, Math.min(70, (cx - pick.top.x) * pick.tx + (cz - pick.top.z) * pick.tz));
  return { x: pick.top.x + pick.tx * along, y: pick.top.y + 1.0, z: pick.top.z + pick.tz * along };
}
