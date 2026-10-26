import type { RoadGraph, RoadPoint } from './RoadGraph';
import type { PlanStep } from './Route';

export interface RoadPos {
  roadId: number;
  s: number;
}

const TURN_PENALTY = 20; // m: prefer going straight when two ways are about equally long
const MIN_REMAINING = 45; // same rule as RouteBuilder.junction: no exit onto a road that ends right away

interface Node {
  r: number;
  i: number;
  d: 1 | -1;
  cost: number;
  prev: Node | null;
  /** Decision taken at prev's junction to get here. */
  via: PlanStep | null;
  done: boolean;
}

/**
 * Shortest drivable way along the road network (Dijkstra) from a car standing on (roadId, s) heading `dir` to a stopping
 * place `target`. Returns the junction decisions in order, which RouteBuilder.plan follows (no U-turns, same exit rules as
 * normal traffic). [] = the target is straight ahead on the same road. null = no way (roads not connected).
 */
export function planRoute(g: RoadGraph, start: RoadPos & { dir: 1 | -1 }, target: RoadPos): PlanStep[] | null {
  const key = (r: number, i: number, d: number): number => (r * 4096 + i) * 2 + (d > 0 ? 1 : 0);
  const nodes = new Map<number, Node>();
  const open: Node[] = [];
  let goal: { cost: number; from: Node; step: PlanStep } | null = null;

  const startSt = g.stations(start.roadId);
  // first junction ahead of the start
  let first = -1;
  if (start.dir > 0) {
    for (let i = 0; i < startSt.length; i++) if (startSt[i].s > start.s) { first = i; break; }
  } else {
    for (let i = startSt.length - 1; i >= 0; i--) if (startSt[i].s < start.s) { first = i; break; }
  }
  if (target.roadId === start.roadId && (target.s - start.s) * start.dir > 0) {
    if (first < 0 || (startSt[first].s - target.s) * start.dir > 0) return [];
  }
  if (first < 0) return null;

  const first0: Node = { r: start.roadId, i: first, d: start.dir, cost: Math.abs(startSt[first].s - start.s), prev: null, via: null, done: false };
  nodes.set(key(first0.r, first0.i, first0.d), first0);
  open.push(first0);

  const hIn: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const hOut: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };

  const relax = (from: Node, r2: number, d2: 1 | -1, k2: number, extra: number, step: PlanStep): void => {
    const st2 = g.stations(r2);
    const nk = k2 + d2;
    if (r2 === target.roadId) {
      const ahead = (target.s - st2[k2].s) * d2;
      const blocked = nk >= 0 && nk < st2.length && (st2[nk].s - target.s) * d2 < 0;
      if (ahead > 0 && !blocked) {
        const c = from.cost + extra + ahead;
        if (!goal || c < goal.cost) goal = { cost: c, from, step };
      }
    }
    if (nk < 0 || nk >= st2.length) return; // the road ends before the next junction
    const c = from.cost + extra + Math.abs(st2[nk].s - st2[k2].s);
    const kk = key(r2, nk, d2);
    let n = nodes.get(kk);
    if (!n) {
      n = { r: r2, i: nk, d: d2, cost: Infinity, prev: null, via: null, done: false };
      nodes.set(kk, n);
    }
    if (c < n.cost) {
      n.cost = c;
      n.prev = from;
      n.via = step;
      open.push(n);
    }
  };

  while (open.length > 0) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].cost < open[bi].cost) bi = k;
    const n = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (n.done) continue;
    n.done = true;
    if (goal && n.cost > (goal as { cost: number }).cost) break;

    const st = g.stations(n.r)[n.i];
    const pad = st.pad;
    g.at(n.r, st.s, n.d, 0, hIn);
    for (const arm of g.arms(pad)) {
      for (const d2 of [1, -1] as const) {
        const road2 = g.roads[arm.roadId];
        const remaining = d2 > 0 ? road2.length - arm.s : arm.s;
        if (remaining < MIN_REMAINING) continue;
        const straight = arm.roadId === n.r && d2 === n.d;
        if (arm.roadId === n.r && !straight) continue;
        g.at(arm.roadId, arm.s, d2, 0, hOut);
        if (hOut.hx * hIn.hx + hOut.hz * hIn.hz < -0.7) continue;
        const k2 = g.stations(arm.roadId).findIndex((q) => q.pad === pad);
        if (k2 < 0) continue;
        relax(n, arm.roadId, d2, k2, straight ? 0 : TURN_PENALTY, { pad, roadId: arm.roadId, dir: d2 });
      }
    }
  }

  const found = goal as { cost: number; from: Node; step: PlanStep } | null;
  if (!found) return null;
  const steps: PlanStep[] = [found.step];
  for (let n: Node | null = found.from; n && n.prev; n = n.prev) steps.push(n.via!);
  return steps.reverse();
}
