import type { RoadGraph, RoadPoint, Station } from '../traffic/RoadGraph';

export interface TourRoadSpot {
  roadId: number;
  s: number;
  x: number;
  z: number;
  y: number;
  hx: number;
  hz: number;
  distance: number;
}

export interface TourWaypoint {
  x: number;
  y: number;
  z: number;
  /** Desired cruise speed in metres per second. */
  vmax: number;
  /** Width of the physical road at this waypoint (m); only wide roads may be used for overtaking. */
  roadWidth?: number;
  /** Adjacent passing-lane centre offset derived from this road's actual lane geometry. */
  passOffset?: number;
  roadId?: number;
}

interface Edge {
  fromPad: number;
  toPad: number;
  roadId: number;
  fromS: number;
  toS: number;
  weight: number;
}

const ROAD_POINT: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };

/** Finds road access points and builds a deterministic pad-to-pad route on the existing road splines. */
export class TourRoadPlanner {
  constructor(private readonly graph: RoadGraph) {}

  nearestSpot(x: number, z: number, maxDistance = 5000): TourRoadSpot | null {
    let best: TourRoadSpot | null = null;
    let bestD2 = maxDistance * maxDistance;
    for (const road of this.graph.roads) {
      const step = Math.max(12, Math.min(28, road.step * 1.5));
      for (let s = 0; s <= road.length + 0.01; s += step) {
        this.graph.at(road.id, Math.min(s, road.length), 1, 0, ROAD_POINT);
        const dx = ROAD_POINT.x - x;
        const dz = ROAD_POINT.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { roadId: road.id, s: Math.min(s, road.length), x: ROAD_POINT.x, z: ROAD_POINT.z, y: ROAD_POINT.y, hx: ROAD_POINT.hx, hz: ROAD_POINT.hz, distance: Math.sqrt(d2) };
        }
      }
    }
    if (!best) return null;

    // Refine the road-distance estimate around the best coarse sample.
    const road = this.graph.roads[best.roadId];
    const lo = Math.max(0, best.s - 22);
    const hi = Math.min(road.length, best.s + 22);
    for (let s = lo; s <= hi + 0.01; s += 2.5) {
      this.graph.at(road.id, s, 1, 0, ROAD_POINT);
      const d = Math.hypot(ROAD_POINT.x - x, ROAD_POINT.z - z);
      if (d < best.distance) best = { roadId: road.id, s, x: ROAD_POINT.x, z: ROAD_POINT.z, y: ROAD_POINT.y, hx: ROAD_POINT.hx, hz: ROAD_POINT.hz, distance: d };
    }
    return best;
  }

  lanePoint(spot: Pick<TourRoadSpot, 'roadId' | 's'>, dir: 1 | -1): RoadPoint {
    return this.graph.at(spot.roadId, spot.s, dir, this.graph.laneOffset(spot.roadId), { x: 0, z: 0, y: 0, hx: 0, hz: 0 });
  }

  buildRoute(startX: number, startZ: number, targetX: number, targetZ: number, maxAccessDistance = 2400): TourWaypoint[] | null {
    const start = this.nearestSpot(startX, startZ, maxAccessDistance);
    const target = this.nearestSpot(targetX, targetZ, maxAccessDistance);
    if (!start || !target) return null;

    const points: TourWaypoint[] = [];
    if (start.roadId === target.roadId) {
      const dir: 1 | -1 = target.s >= start.s ? 1 : -1;
      this.appendSegment(points, start.roadId, start.s, target.s, dir);
      return points.length >= 2 ? points : null;
    }

    const startStation = this.nearestStation(start.roadId, start.s);
    const targetStation = this.nearestStation(target.roadId, target.s);
    if (!startStation || !targetStation) return null;

    const edges = this.shortestPath(startStation.station.pad, targetStation.station.pad);
    if (!edges) return null;

    // Reach the first junction from the current road spot.
    this.appendSegment(points, start.roadId, start.s, startStation.station.s, start.s <= startStation.station.s ? 1 : -1);
    // Follow each connected road segment through the network's actual junction pads.
    for (const edge of edges) this.appendSegment(points, edge.roadId, edge.fromS, edge.toS, edge.toS >= edge.fromS ? 1 : -1);
    // Travel from the final junction onto the road nearest the selected destination.
    this.appendSegment(points, target.roadId, targetStation.station.s, target.s, target.s >= targetStation.station.s ? 1 : -1);
    return points.length >= 4 ? points : null;
  }

  private nearestStation(roadId: number, s: number): { station: Station; distance: number } | null {
    let best: { station: Station; distance: number } | null = null;
    for (const station of this.graph.stations(roadId)) {
      const d = Math.abs(station.s - s);
      if (!best || d < best.distance) best = { station, distance: d };
    }
    return best;
  }

  private shortestPath(startPad: number, targetPad: number): Edge[] | null {
    if (startPad === targetPad) return [];
    const count = this.graph.net.pads.length;
    const adjacency: Edge[][] = Array.from({ length: count }, () => []);
    for (const road of this.graph.roads) {
      const stations = [...this.graph.stations(road.id)].sort((a, b) => a.s - b.s);
      for (let i = 0; i + 1 < stations.length; i++) {
        const a = stations[i];
        const b = stations[i + 1];
        if (a.pad === b.pad || a.pad < 0 || b.pad < 0 || a.pad >= count || b.pad >= count) continue;
        const w = Math.abs(b.s - a.s);
        adjacency[a.pad].push({ fromPad: a.pad, toPad: b.pad, roadId: road.id, fromS: a.s, toS: b.s, weight: w });
        adjacency[b.pad].push({ fromPad: b.pad, toPad: a.pad, roadId: road.id, fromS: b.s, toS: a.s, weight: w });
      }
    }

    const dist = new Float64Array(count).fill(Infinity);
    const previous: (Edge | null)[] = Array.from({ length: count }, () => null);
    const visited = new Uint8Array(count);
    dist[startPad] = 0;

    for (let n = 0; n < count; n++) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < count; i++) {
        if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u < 0 || u === targetPad) break;
      visited[u] = 1;
      for (const edge of adjacency[u]) {
        const next = edge.toPad;
        const alt = dist[u] + edge.weight;
        if (alt < dist[next]) { dist[next] = alt; previous[next] = edge; }
      }
    }
    if (!Number.isFinite(dist[targetPad])) return null;
    const result: Edge[] = [];
    let pad = targetPad;
    let guard = count + 1;
    while (pad !== startPad && guard-- > 0) {
      const edge = previous[pad];
      if (!edge) return null;
      result.unshift(edge);
      pad = edge.fromPad;
    }
    return pad === startPad ? result : null;
  }

  private appendSegment(out: TourWaypoint[], roadId: number, fromS: number, toS: number, dir: 1 | -1): void {
    const road = this.graph.roads[roadId];
    const start = Math.max(0, Math.min(road.length, fromS));
    const end = Math.max(0, Math.min(road.length, toS));
    const distance = Math.abs(end - start);
    const sampleStep = 8;
    const roadSpeed = Math.max(12, Math.min(31, (road.speedKmh / 3.6) * 1.12));
    const n = Math.max(1, Math.ceil(distance / sampleStep));
    for (let i = 0; i <= n; i++) {
      const s = start + (end - start) * (i / n);
      this.graph.at(roadId, s, dir, this.graph.laneOffset(roadId), ROAD_POINT);
      this.appendPoint(out, ROAD_POINT.x, ROAD_POINT.y, ROAD_POINT.z, roadSpeed, road.halfWidth * 2, (road.halfWidth * 2) / Math.max(2, road.lanes), roadId);
    }
  }

  private appendPoint(out: TourWaypoint[], x: number, y: number, z: number, vmax: number, roadWidth = 8, passOffset = 3.2, roadId = -1): void {
    const last = out[out.length - 1];
    if (!last) { out.push({ x, y, z, vmax, roadWidth, passOffset, roadId }); return; }
    const gap = Math.hypot(x - last.x, z - last.z);
    if (gap < 1.2) { last.vmax = Math.min(last.vmax, vmax); last.roadWidth = Math.min(last.roadWidth ?? roadWidth, roadWidth); last.passOffset = Math.min(last.passOffset ?? passOffset, passOffset); last.roadId = roadId; return; }
    const pieces = Math.max(1, Math.ceil(gap / 3.5));
    for (let i = 1; i <= pieces; i++) {
      const t = i / pieces;
      out.push({ x: last.x + (x - last.x) * t, y: last.y + (y - last.y) * t, z: last.z + (z - last.z) * t, vmax, roadWidth, passOffset, roadId });
    }
  }
}
