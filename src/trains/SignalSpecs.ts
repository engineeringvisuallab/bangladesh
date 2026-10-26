import { platformBlock } from './Signals';
import type { TrainFleet } from './TrainSim';
import type { LegPath } from './TrackPath';
import { RAIL_HEAD } from './TrainConfig';
import type { EndKey } from './RailGraph';

/** STAGE 15 / Step 6: where the signals stand (pure geometry, no three.js; SignalView.ts draws them). */
export interface SignalSpec {
  kind: 'home' | 'starter';
  node: EndKey;
  edgeId: string;
  end: 'a' | 'b';
  /** Foot of the mast (ground = top of ballast level) and the unit direction of travel the signal faces AGAINST. */
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  /** The rail it protects (rail head position at the signal) for the tests. */
  trackX: number;
  trackZ: number;
}

/** Distance (m) from the track centre line to the mast (outside of its own track, on the left of the direction of travel). */
export const MAST_OFFSET = 2.8;
/** The home signal stands this far (m) in front of the platform block. */
export const HOME_BEFORE = 12;
/** The starter stands this far (m) beyond the front of the standing train. */
export const STARTER_AHEAD = 12;

export function signalSpecs(fleet: TrainFleet): SignalSpec[] {
  const sig = fleet.signals;
  if (!sig) return [];
  const out: SignalSpec[] = [];
  const arriving = new Map<EndKey, ReturnType<TrainFleet['graph']['legsFrom']>[number]>();
  for (const n of fleet.graph.nodes.values()) for (const l of fleet.graph.legsFrom(n.key)) if (!arriving.has(l.to)) arriving.set(l.to, l);
  const p0 = { x: 0, y: 0, z: 0 }, p1 = { x: 0, y: 0, z: 0 };
  const put = (kind: SignalSpec['kind'], node: EndKey, edgeId: string, end: 'a' | 'b', path: LegPath, s: number): void => {
    path.posAt(s, p0);
    path.posAt(s + 1, p1);
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
    const tx = dx / l, tz = dz / l;
    out.push({ kind, node, edgeId, end, x: p0.x + tz * MAST_OFFSET, y: p0.y - RAIL_HEAD, z: p0.z - tx * MAST_OFFSET, tx, tz, trackX: p0.x, trackZ: p0.z });
  };
  for (const n of fleet.graph.nodes.values()) {
    const into = arriving.get(n.key);
    if (into) {
      const path = fleet.pathFor(into);
      const fi = sig.blocksOf(path).first.get(platformBlock(n.edgeId, n.end));
      if (fi !== undefined) put('home', n.key, n.edgeId, n.end, path, path.cum[fi] - HOME_BEFORE);
    }
    const out0 = fleet.graph.legsFrom(n.key)[0];
    if (out0) {
      const path = fleet.pathFor(out0);
      put('starter', n.key, n.edgeId, n.end, path, path.sStart + STARTER_AHEAD);
    }
  }
  return out;
}

