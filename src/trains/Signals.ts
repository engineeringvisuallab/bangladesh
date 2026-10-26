import type { RailNetwork } from '../rail/RailNetwork';
import type { LegPath } from './TrackPath';
import type { Train } from './TrainSim';
import { TRAIN_LENGTH } from './TrainConfig';

/**
 * STAGE 15 / Step 6: fixed-block signalling (headless: no three.js, no game classes).
 *
 * BLOCKS. Every line is a double track and every direction of it is its own track. A track is cut into blocks:
 *   `<line>:<ab|ba>:<k>`   open-line blocks (about BLOCK.target m long), k counted from where the track starts;
 *   `<line>:<ab|ba>:P`     the PLATFORM block = the last BLOCK.endZone m of the track in front of a station end (home signal at its start);
 *   `S:<station>`          the station THROAT: every link and every terminal crossover of one station (links cross each other at the central
 *                          station, the throat is one block so two trains never meet there).
 * A train HOLDS every block its body touches (tail margin included) and CLAIMS blocks ahead of it, in order, up to BLOCK.horizon m. A block that is
 * held by another train is RED: the train must be able to stop (service braking) BLOCK.stopMargin m before its start. A block is released when the
 * tail has left it. So there is never more than one train in a block, and a following train always keeps at least one block clear (or waits).
 * A train that dwells at a platform is ready to leave only when the route through the throat and the first block of the outbound track is clear
 * (platform / starter signal green); otherwise it stays (the dwell is extended).
 *
 * Known limits (documented in the Bangla doc): the throat S is one block per station (cautious); the geometry of a link against the OTHER platform
 * track of a line is not checked; if the tracks between several stations were all full, trains could wait for each other (deadlock): `findDeadlock()`
 * detects such a cycle (the tests count them), it is not resolved by force because that would break the one-train-per-block rule.
 */
export const BLOCK = {
  /** Length (m) of the platform block in front of a station end. */
  endZone: 450,
  /** Wanted length (m) of the open-line blocks. */
  target: 1200,
  /** A train claims blocks this far (m) ahead of its front: more than the braking distance from 120 km/h at the service rate (694 m). */
  horizon: 800,
  /** The signal stands this far (m) in front of the block it protects. */
  stopMargin: 12,
  /** The tail must be this far (m) past the end of a block before the block is released. */
  releaseMargin: 6,
} as const;

const other = (e: 'a' | 'b'): 'a' | 'b' => (e === 'a' ? 'b' : 'a');

/** Number of open-line blocks (without the platform block) of a track of this length. */
export function openBlocks(len: number): number {
  return len > BLOCK.endZone ? Math.max(1, Math.ceil((len - BLOCK.endZone) / BLOCK.target)) : 0;
}

/** Block id of a point `dTravel` m along a track (measured from where the track starts in its direction of travel). */
export function lineBlockId(edgeId: string, len: number, towardB: boolean, dTravel: number): string {
  const dir = towardB ? 'ab' : 'ba';
  const n = openBlocks(len);
  if (n === 0 || dTravel >= len - BLOCK.endZone) return `${edgeId}:${dir}:P`;
  const k = Math.max(0, Math.min(n - 1, Math.floor(dTravel / ((len - BLOCK.endZone) / n))));
  return `${edgeId}:${dir}:${k}`;
}

/** Platform block id of the arrival end `end` of a line (the track that runs INTO that end). */
export const platformBlock = (edgeId: string, end: 'a' | 'b'): string => `${edgeId}:${end === 'b' ? 'ab' : 'ba'}:P`;

/** The blocks of every sample of a leg path. */
export class LegBlocks {
  /** Block ids per sample (usually one, two at a junction / crossover). */
  readonly ids: string[][];
  /** First / last sample index of each block id. */
  readonly first = new Map<string, number>();
  readonly last = new Map<string, number>();

  constructor(rail: RailNetwork, readonly path: LegPath) {
    const info = path.info, leg = path.leg;
    const edge = (id: string) => rail.edges.find((e) => e.id === id)!;
    const arrive = edge(info.arriveEdge), dep = edge(info.depEdge);
    const n = path.n;
    this.ids = new Array(n);
    const stationOfEnd = (e: typeof arrive, end: 'a' | 'b') => (end === 'a' ? e.from : e.to);
    const station = leg.via ? leg.via.station : stationOfEnd(arrive, info.arriveEnd);
    const S = `S:${station}`;
    const eps = 1e-6;
    for (let i = 0; i < n; i++) {
      const c = path.cc[i];
      const ids: string[] = [];
      if (leg.via) {
        if (c <= info.linkStart + eps) {
          ids.push(lineBlockId(arrive.id, arrive.length, info.arriveEnd === 'b', arrive.length - (info.d0 - c)));
          if (c >= info.linkStart - eps) ids.push(S);
        } else if (c <= info.linkEnd + eps) {
          ids.push(S);
          if (c >= info.linkEnd - eps) ids.push(lineBlockId(dep.id, dep.length, leg.line.enter === 'a', 0));
        } else {
          ids.push(lineBlockId(dep.id, dep.length, leg.line.enter === 'a', c - info.linkEnd));
        }
      } else {
        // reversal: the train stands on the arrival (inbound) track, crosses over, then drives away on the other (outbound) track of the same line
        const away = info.arriveEnd === 'a'; // moving a -> b
        const dFromEnd = info.dFront + c;
        const inboundD = arrive.length - dFromEnd;
        if (c <= info.crossStart) {
          ids.push(lineBlockId(arrive.id, arrive.length, !away, inboundD));
        } else if (c <= info.crossEnd) {
          ids.push(lineBlockId(arrive.id, arrive.length, !away, inboundD), S, lineBlockId(arrive.id, arrive.length, away, dFromEnd));
        } else {
          ids.push(lineBlockId(arrive.id, arrive.length, away, dFromEnd));
        }
      }
      this.ids[i] = ids;
      for (const id of ids) {
        if (!this.first.has(id)) this.first.set(id, i);
        this.last.set(id, i);
      }
    }
  }

  /** Sample range [i0, i1] covering the front at s and the interval behind it. */
  range(sBack: number, sFront: number): [number, number] {
    const p = this.path;
    const i0 = Math.max(0, p.find(Math.max(0, sBack)));
    const i1 = Math.min(p.n - 1, p.find(Math.max(0, sFront)) + 1);
    return [i0, i1];
  }
}

export type Aspect = 'red' | 'green';

export class SignalSystem {
  /** block id -> train id. */
  readonly owner = new Map<string, number>();
  private claims = new Map<number, Set<string>>();
  private cache = new Map<LegPath, LegBlocks>();
  /** Counters (tests / debug). */
  redStops = 0;
  departHolds = 0;
  /** train id -> id of the train whose block stops it (red signal ahead / route not clear). Removed when it is free to go. */
  readonly blockedBy = new Map<number, number>();

  constructor(readonly rail: RailNetwork) {}

  blocksOf(path: LegPath): LegBlocks {
    let b = this.cache.get(path);
    if (!b) {
      b = new LegBlocks(this.rail, path);
      this.cache.set(path, b);
    }
    return b;
  }

  claimsOf(id: number): ReadonlySet<string> {
    return this.claims.get(id) ?? new Set();
  }

  private set(id: number): Set<string> {
    let s = this.claims.get(id);
    if (!s) this.claims.set(id, (s = new Set()));
    return s;
  }

  private take(train: number, block: string): void {
    this.owner.set(block, train);
    this.set(train).add(block);
  }

  private free(train: number, block: string): void {
    if (this.owner.get(block) === train) this.owner.delete(block);
    this.claims.get(train)?.delete(block);
  }

  /** A train is put on a platform: it takes every block under its body (the platform block). Throws when somebody else holds one. */
  attach(train: Train): void {
    const B = this.blocksOf(train.path);
    const [i0, i1] = B.range(train.s - TRAIN_LENGTH - BLOCK.releaseMargin, train.s);
    for (let i = i0; i <= i1; i++) for (const b of B.ids[i]) {
      const o = this.owner.get(b);
      if (o !== undefined && o !== train.id) throw new Error(`block ${b} is already held by train ${o}`);
      this.take(train.id, b);
    }
  }

  /**
   * Can a standing train leave now? All blocks from its start to the end of the throat (+30 m) (terminal reversal: to the end of the crossover)
   * and the first block after it must be free. All or nothing, so a waiting train does not hold blocks it cannot use.
   */
  canDepart(train: Train): boolean {
    const want = this.routeBlocks(train);
    for (const b of want) {
      const o = this.owner.get(b);
      if (o !== undefined && o !== train.id) {
        this.blockedBy.set(train.id, o);
        return false;
      }
    }
    for (const b of want) this.take(train.id, b);
    this.blockedBy.delete(train.id);
    return true;
  }

  /** The blocks a standing train needs for its first move (see canDepart). */
  private routeBlocks(train: Train): Set<string> {
    const path = train.pathNext();
    const B = this.blocksOf(path);
    const info = path.info;
    const need = path.leg.via ? info.linkEnd + 30 : info.crossEnd + 30;
    let iEnd = 0;
    while (iEnd < path.n - 1 && path.cc[iEnd] < need) iEnd++;
    const [i0] = B.range(path.sStart - TRAIN_LENGTH - BLOCK.releaseMargin, path.sStart);
    const want = new Set<string>();
    for (let i = i0; i <= iEnd; i++) for (const b of B.ids[i]) want.add(b);
    return want;
  }

  /** Read-only: would canDepart say yes right now? (the starter signal of a platform) */
  routeFree(train: Train): boolean {
    for (const b of this.routeBlocks(train)) {
      const o = this.owner.get(b);
      if (o !== undefined && o !== train.id) return false;
    }
    return true;
  }

  /** After the path changed (departure): drop the blocks that are not on the new path. */
  rebase(train: Train): void {
    const B = this.blocksOf(train.path);
    for (const b of [...this.set(train.id)]) if (!B.first.has(b)) this.free(train.id, b);
  }

  /**
   * Once per step of a RUNNING train: release the blocks behind its tail, claim the free blocks ahead (in order, up to the horizon) and return the
   * track distance where it must stop (the red signal), or Infinity.
   */
  advance(train: Train): number {
    const path = train.path, B = this.blocksOf(path), mine = this.set(train.id);
    const sTail = train.s - TRAIN_LENGTH - BLOCK.releaseMargin;
    for (const b of [...mine]) {
      const li = B.last.get(b);
      if (li === undefined || path.cum[li] < sTail) this.free(train.id, b);
    }
    const i0 = path.find(train.s);
    const sMax = train.s + BLOCK.horizon;
    for (let i = i0; i < path.n && path.cum[i] <= sMax; i++) {
      for (const b of B.ids[i]) {
        const o = this.owner.get(b);
        if (o === train.id) continue;
        if (o === undefined) { this.take(train.id, b); continue; }
        // red: the signal stands in front of the first sample of this block
        const fi = B.first.get(b)!;
        this.blockedBy.set(train.id, o);
        return Math.max(0, path.cum[fi] - BLOCK.stopMargin);
      }
    }
    this.blockedBy.delete(train.id);
    return Infinity;
  }

  /** Home signal of a platform end: green when the platform block is free (a train may enter), red when a train is on it. */
  homeAspect(edgeId: string, end: 'a' | 'b'): Aspect {
    return this.owner.has(platformBlock(edgeId, end)) ? 'red' : 'green';
  }

  /** Is block `b` held, and by whom? */
  holder(b: string): number | undefined {
    return this.owner.get(b);
  }

  /**
   * Wait-for cycles: a standing train that is ready to leave but whose route is held waits for the holder; a running train stopped at a red
   * waits for the holder of that block. A cycle of such waits is a deadlock. Returns the train ids of one cycle, or null.
   */
  findDeadlock(trains: readonly Train[]): number[] | null {
    const waits = new Map<number, number>();
    for (const t of trains) {
      const w = t.waitingFor();
      if (w !== undefined) waits.set(t.id, w);
    }
    for (const start of waits.keys()) {
      const seen: number[] = [];
      let cur: number | undefined = start;
      while (cur !== undefined && !seen.includes(cur)) {
        seen.push(cur);
        cur = waits.get(cur);
      }
      if (cur !== undefined) return seen.slice(seen.indexOf(cur));
    }
    return null;
  }

  /** Station-end helper for the view: the other end of a line. */
  static otherEnd = other;
}
