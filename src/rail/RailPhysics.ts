import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { RAIL_DESIGN as D } from './RailPlan';
import type { RailEdge, RailNetwork } from './RailNetwork';
import { stationAccesses } from './StationAccess';
import { linedSegments, portalBoxes, shellBoxes, trackEdgesOf, type ShellBox } from './RailTunnel';

type Quat = { x: number; y: number; z: number; w: number };

/** Rotation that turns the local +Z axis into the direction (dx, dy, dz) with the local +Y staying up (yaw then pitch). */
function aim(dx: number, dy: number, dz: number): Quat {
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  // q = qY(yaw) * qX(-pitch)
  return { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
}

/** One cuboid of a collider piece (world x / z, y up; half sizes; rotation). */
export interface DeckBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  q: Quat;
  friction: number;
}

export interface PierSpec {
  x: number;
  z: number;
  y0: number;
  y1: number;
  dx: number;
  dz: number;
}

/** The pier columns of the viaduct, as the collider code wants them. */
export function pierSpecs(rail: RailNetwork): PierSpec[] {
  return rail.piers.map((p) => ({ x: p.x, z: p.z, y0: p.baseY, y1: p.deckY - D.ballast - D.deckThick - 1.5, dx: p.dx, dz: p.dz }));
}

/**
 * Cuboids of the viaduct deck piece of edge `e` between s0 and s1 (deck slab in ~10 m pieces, parapets, and the pier columns whose centre
 * lies within the piece). `ox, oz` = the piece's reference point (its middle). Pure geometry: RailPhysics hands these to Rapier and the
 * tests ray-cast the very same list.
 */
export function deckBoxes(rail: RailNetwork, e: RailEdge, s0: number, s1: number, ox: number, oz: number, piers: PierSpec[]): DeckBox[] {
  const out: DeckBox[] = [];
  const stationNear = (x: number, z: number): boolean => rail.stations.some((s) => Math.hypot(s.x - x, s.z - z) < D.stationFlat + 40);
  const n = Math.max(1, Math.ceil((s1 - s0) / 10));
  for (let k = 0; k < n; k++) {
    const a = rail.pointAt(e, s0 + ((s1 - s0) * k) / n);
    const c = rail.pointAt(e, s0 + ((s1 - s0) * (k + 1)) / n);
    const ya = e.design[a.i] + (e.design[a.i + 1] - e.design[a.i]) * ((s0 + ((s1 - s0) * k) / n - e.cum[a.i]) / (e.cum[a.i + 1] - e.cum[a.i] || 1));
    const yc = e.design[c.i] + (e.design[c.i + 1] - e.design[c.i]) * ((s0 + ((s1 - s0) * (k + 1)) / n - e.cum[c.i]) / (e.cum[c.i + 1] - e.cum[c.i] || 1));
    const dx = c.x - a.x, dy = yc - ya, dz = c.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const q = aim(dx / len, dy / len, dz / len);
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, my = (ya + yc) / 2;
    const hw = stationNear(mx, mz) ? 9.6 : D.deckHalf;
    const thick = D.ballast + D.deckThick;
    out.push({ x: mx, y: my - thick / 2, z: mz, hx: hw, hy: thick / 2, hz: len / 2 + 0.05, q, friction: 1.0 });
    // parapets
    const wx = -dz / (Math.hypot(dx, dz) || 1), wz = dx / (Math.hypot(dx, dz) || 1);
    for (const sg of [-1, 1]) out.push({ x: mx + wx * sg * (hw - 0.15), y: my + 0.5, z: mz + wz * sg * (hw - 0.15), hx: 0.15, hy: 0.5, hz: len / 2 + 0.05, q, friction: 0.3 });
  }
  for (const p of piers) {
    if (Math.hypot(p.x - ox, p.z - oz) > (s1 - s0) / 2 + 3 || p.y1 - p.y0 < 0.3) continue;
    out.push({ x: p.x, y: (p.y0 + p.y1) / 2, z: p.z, hx: 2.2, hy: (p.y1 - p.y0) / 2, hz: 1.3, q: aim(p.dx, 0, p.dz), friction: 0.8 });
  }
  return out;
}

interface Item {
  id: number;
  x: number;
  z: number;
  /** Distance from (x, z) within which the item is needed (its half length). */
  radius: number;
  fill: (b: Builder) => void;
}

interface Builder {
  box: (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: Quat, friction?: number) => void;
}

/**
 * Rapier colliders for the railway's raised structures: viaduct decks (with parapets and piers), the decks of elevated station links and station platforms,
 * and the lining of tunnels / boxes (floor, walls, roof) with their portal head walls (the terrain has a hole there).
 * Ground track needs none (the terrain collider already contains the embankment). Like the terrain and road-bridge colliders they
 * only exist near the player; bodies live in floating-origin local coordinates.
 */
export class RailPhysics {
  private items: Item[] = [];
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(private physics: PhysicsWorld, private origin: FloatingOrigin, rail: RailNetwork, groundAt?: (x: number, z: number) => number) {
    let id = 0;
    // the lines, then the station links (a link in an elevated station stands on a viaduct deck of its own)
    for (const e of [...rail.edges, ...rail.links.map((l) => l.edge)]) {
      e.segments.forEach((seg) => {
        if (seg.kind !== 'bridge') return;
        // split long viaducts into pieces of ~120 m so only the part near the player has colliders
        const n = Math.max(1, Math.ceil((seg.s1 - seg.s0) / 120));
        for (let k = 0; k < n; k++) {
          const s0 = seg.s0 + ((seg.s1 - seg.s0) * k) / n;
          const s1 = seg.s0 + ((seg.s1 - seg.s0) * (k + 1)) / n;
          const mid = rail.pointAt(e, (s0 + s1) / 2);
          this.items.push({ id: id++, x: mid.x, z: mid.z, radius: (s1 - s0) / 2 + 12, fill: (b) => this.deck(b, rail, e, s0, s1, mid.x, mid.z) });
        }
      });
    }
    // tunnels and boxes: floor, walls and roof in ~120 m pieces, and a head wall (wings, lintel, approach slab) at every portal.
    // The terrain collider has a hole here (TerrainPhysics), so these are what the car drives on and between.
    const tracks = trackEdgesOf(rail);
    for (const L of linedSegments(rail)) {
      const e = tracks[L.edge];
      const n = Math.max(1, Math.ceil((L.s1 - L.s0) / 120));
      for (let k = 0; k < n; k++) {
        const s0 = L.s0 + ((L.s1 - L.s0) * k) / n;
        const s1 = L.s0 + ((L.s1 - L.s0) * (k + 1)) / n;
        const mid = rail.pointAt(e, (s0 + s1) / 2);
        this.items.push({ id: id++, x: mid.x, z: mid.z, radius: (s1 - s0) / 2 + 12, fill: (b) => this.boxes(b, shellBoxes(rail, e, L.kind, s0, s1), mid.x, mid.z) });
      }
      for (const [on, s, out] of [[L.portalA, L.s0, -1], [L.portalB, L.s1, 1]] as const) {
        if (!on) continue;
        const p = rail.pointAt(e, s);
        this.items.push({ id: id++, x: p.x, z: p.z, radius: 24, fill: (b) => this.boxes(b, portalBoxes(rail, e, L.kind, s, out), p.x, p.z) });
      }
    }
    for (const st of rail.stations) {
      for (const ar of st.arrivals) {
        const e = rail.edges.find((q) => q.id === ar.edgeId)!;
        const sgn = ar.end === 'a' ? 1 : -1;
        const s0 = ar.end === 'a' ? 0 : e.length;
        const p = rail.pointAt(e, s0 + sgn * (12 + D.platform / 2));
        this.items.push({ id: id++, x: p.x, z: p.z, radius: D.platform / 2 + 12, fill: (b) => this.platform(b, st.level, p) });
      }
    }
    // station stairs and their side walls (solid boxes of StationAccess; the shelter and signs are only pictures). Needs the terrain height to match the mesh.
    if (groundAt) {
      for (const a of stationAccesses(rail, groundAt)) {
        this.items.push({ id: id++, x: a.cx, z: a.cz, radius: a.radius, fill: (b) => {
          for (const k of a.boxes) if (k.solid) b.box(k.x - a.cx, k.y, k.z - a.cz, k.hw, k.hh, k.hl, aim(k.ax, 0, k.az), 0.9);
        } });
      }
    }
    // viaduct piers (columns) are added to the deck piece that contains them
    this.piers = pierSpecs(rail);
  }

  private piers: PierSpec[];

  get activeCount(): number {
    return this.active.size;
  }

  private boxes(b: Builder, list: ShellBox[], ox: number, oz: number): void {
    for (const k of list) b.box(k.x - ox, k.y, k.z - oz, k.hx, k.hy, k.hz, k.q, k.friction);
  }

  private deck(b: Builder, rail: RailNetwork, e: RailEdge, s0: number, s1: number, ox: number, oz: number): void {
    for (const k of deckBoxes(rail, e, s0, s1, ox, oz, this.piers)) b.box(k.x - ox, k.y, k.z - oz, k.hx, k.hy, k.hz, k.q, k.friction);
  }

  private platform(b: Builder, level: number, p: { x: number; z: number; dx: number; dz: number }): void {
    const q = aim(p.dx, 0, p.dz);
    const wx = -p.dz, wz = p.dx;
    for (const sg of [-1, 1]) {
      const lat = sg * (D.trackSpacing / 2 + 1.7 + 2.25);
      b.box(p.x + wx * lat - p.x, level + 0.23, p.z + wz * lat - p.z, 2.25, 0.73 + 0.0, D.platform / 2, q, 0.9);
    }
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (const it of this.items) {
      const d = Math.hypot(px - it.x, pz - it.z);
      const reach = PhysicsConfig.activeRadius + it.radius;
      const has = this.active.has(it.id);
      if (!has && d <= reach) this.create(it);
      else if (has && d > reach + 64) this.remove(it.id);
    }
  }

  private create(it: Item): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(it.x - this.origin.origin.x, 0, it.z - this.origin.origin.z));
    it.fill({
      box: (cx, cy, cz, hx, hy, hz, q, friction = 1) => {
        world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation(q).setFriction(friction), body);
      },
    });
    this.active.set(it.id, body);
  }

  private remove(id: number): void {
    const body = this.active.get(id);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(id);
  }

  dispose(): void {
    for (const id of [...this.active.keys()]) this.remove(id);
  }
}
