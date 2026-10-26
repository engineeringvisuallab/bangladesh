import type { RailLink, RailNetwork } from '../rail/RailNetwork';

/**
 * STAGE 14 / Step 5a: the routing graph of the railway.
 *
 * NODES are the station ARRIVAL ENDS: the inner end (buffer-stop end) of every line at the station it touches, key `<lineId>:<a|b>`.
 *   (`a` = start of the line = `edge.from` station, `b` = end of the line = `edge.to` station.)
 * A train that has stopped at a platform is "at" the node of the line it arrived on.
 *
 * LEGS (what a train can do from a node):
 *   - THROUGH: a station link joins this end to another end Y of the same station. The train runs through the link, leaves on line Y and
 *     arrives at the far end of line Y. One leg per link that touches the node.
 *   - REVERSE: the node has NO link at all, so it is a terminal end (buffer stop). The train changes driving cab and leaves on the same line
 *     (on the other track of the double line). A train never reverses anywhere else.
 */
export type EndKey = string;

export interface GraphNode {
  key: EndKey;
  station: string;
  edgeId: string;
  end: 'a' | 'b';
  /** Links that touch this end. Empty = terminal end. */
  links: RailLink[];
}

export interface GraphLeg {
  /** Node where the train stands when the leg starts, and where it stands when the leg ends. */
  from: EndKey;
  to: EndKey;
  toStation: string;
  /** Link used (null = reversal at a terminal end). */
  via: RailLink | null;
  /** Line the train drives on, the end it enters from (the end it came to when reversing), and the end it arrives at. */
  line: { edgeId: string; enter: 'a' | 'b'; arrive: 'a' | 'b' };
  /** Rough length (m): rest of the arrival line to its end + link + whole departure line. Used by the router only. */
  length: number;
  key: string;
}

const other = (e: 'a' | 'b'): 'a' | 'b' => (e === 'a' ? 'b' : 'a');
export const endKey = (edgeId: string, end: 'a' | 'b'): EndKey => `${edgeId}:${end}`;

export class RailGraph {
  readonly nodes = new Map<EndKey, GraphNode>();
  private legs = new Map<EndKey, GraphLeg[]>();

  constructor(readonly rail: RailNetwork) {
    for (const e of rail.edges) {
      for (const end of ['a', 'b'] as const) {
        const station = end === 'a' ? e.from : e.to;
        const key = endKey(e.id, end);
        const links = rail.links.filter((l) => (l.a.edgeId === e.id && l.a.end === end) || (l.b.edgeId === e.id && l.b.end === end));
        this.nodes.set(key, { key, station, edgeId: e.id, end, links });
      }
    }
    for (const n of this.nodes.values()) this.legs.set(n.key, this.makeLegs(n));
  }

  private lineLength(edgeId: string): number {
    return this.rail.edges.find((e) => e.id === edgeId)!.length;
  }

  private makeLegs(n: GraphNode): GraphLeg[] {
    const out: GraphLeg[] = [];
    const mk = (via: RailLink | null, edgeId: string, enter: 'a' | 'b'): GraphLeg => {
      const arrive = other(enter);
      const to = endKey(edgeId, arrive);
      const toNode = this.nodes.get(to)!;
      return {
        from: n.key, to, toStation: toNode.station, via, line: { edgeId, enter, arrive },
        length: this.lineLength(edgeId) + (via ? via.length : 0), key: `${n.key}>${via ? via.id : 'reverse'}`,
      };
    };
    if (n.links.length === 0) {
      out.push(mk(null, n.edgeId, n.end));
    } else {
      for (const l of n.links) {
        const y = l.a.edgeId === n.edgeId && l.a.end === n.end ? l.b : l.a;
        out.push(mk(l, y.edgeId, y.end));
      }
    }
    return out;
  }

  legsFrom(key: EndKey): readonly GraphLeg[] {
    return this.legs.get(key) ?? [];
  }

  isTerminal(key: EndKey): boolean {
    const n = this.nodes.get(key);
    return !!n && n.links.length === 0;
  }

  /** Stations that have at least one terminal end. */
  terminalStations(): string[] {
    return [...new Set([...this.nodes.values()].filter((n) => n.links.length === 0).map((n) => n.station))];
  }

  /** Every node of one station. */
  nodesAt(station: string): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.station === station);
  }

  /** Cheapest chain of legs from a node to ANY node of a station (Dijkstra on leg length). Null = not reachable. */
  shortestRoute(from: EndKey, station: string): GraphLeg[] | null {
    const dist = new Map<EndKey, number>([[from, 0]]);
    const prev = new Map<EndKey, GraphLeg>();
    const todo = new Set<EndKey>([from]);
    while (todo.size) {
      let cur: EndKey | null = null;
      for (const k of todo) if (cur === null || dist.get(k)! < dist.get(cur)!) cur = k;
      todo.delete(cur!);
      const dc = dist.get(cur!)!;
      for (const l of this.legsFrom(cur!)) {
        const nd = dc + l.length;
        if (nd < (dist.get(l.to) ?? Infinity)) {
          dist.set(l.to, nd);
          prev.set(l.to, l);
          todo.add(l.to);
        }
      }
    }
    let best: EndKey | null = null;
    for (const n of this.nodesAt(station)) if (n.key !== from && dist.has(n.key) && (best === null || dist.get(n.key)! < dist.get(best)!)) best = n.key;
    if (best === null) return null;
    const route: GraphLeg[] = [];
    for (let k: EndKey = best; k !== from; ) {
      const l = prev.get(k)!;
      route.unshift(l);
      k = l.from;
    }
    return route;
  }

  /** Nodes reachable from a node (the node itself included), following legs. */
  reachable(from: EndKey): Set<EndKey> {
    const seen = new Set<EndKey>([from]);
    const stack = [from];
    while (stack.length) {
      for (const l of this.legsFrom(stack.pop()!)) if (!seen.has(l.to)) { seen.add(l.to); stack.push(l.to); }
    }
    return seen;
  }
}
