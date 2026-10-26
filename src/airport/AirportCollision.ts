/**
 * Airport — data helpers for the other systems (terrain, physics, roads, traffic).
 * Pure functions, no three.js, no dependency on any other game module.
 */

import { localToWorld, worldToLocal } from './AirportPlan';
import type { AirportPlan } from './AirportPlan';

/** oriented box footprint in WORLD space */
export interface Footprint {
  x: number;
  z: number;
  hw: number; // half extent along the box's local X
  hd: number; // half extent along the box's local Z
  rot: number; // rotation.y of the box (= airport heading)
  height: number;
  kind: string;
}

/** Solid obstacles (buildings, poles, windsock, fence). Jet bridges are elevated and skipped. */
export function airportFootprints(plan: AirportPlan): Footprint[] {
  const out: Footprint[] = [];
  const rot = plan.site.heading;
  const add = (lx: number, lz: number, w: number, d: number, h: number, kind: string): void => {
    const p = localToWorld(plan.site, lx, lz);
    out.push({ x: p.x, z: p.z, hw: w / 2, hd: d / 2, rot, height: h, kind });
  };
  for (const b of plan.buildings) {
    if (b.kind === 'jetbridge') continue;
    add(b.cx, b.cz, b.w, b.d, b.h, b.kind);
  }
  for (const p of plan.poles) add(p.x, p.z, 0.5, 0.5, p.h, 'pole');
  add(plan.windsock.x, plan.windsock.z, 0.3, 0.3, 7, 'windsock');
  for (const f of plan.fence) {
    add((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, Math.abs(f.x1 - f.x0) || 0.15, Math.abs(f.z1 - f.z0) || 0.15, 2.4, 'fence');
  }
  return out;
}

/** true when a world point is inside the airport's flat pad (without blend) */
export function isInsideAirport(plan: AirportPlan, wx: number, wz: number, margin = 0): boolean {
  const l = worldToLocal(plan.site, wx, wz);
  return (
    Math.abs(l.x - plan.pad.cx) <= plan.pad.w / 2 + margin &&
    Math.abs(l.z - plan.pad.cz) <= plan.pad.d / 2 + margin
  );
}

/**
 * Ground height the terrain should have at a world point, or null if the point
 * is outside pad + blend. Inside the pad it is exactly groundY; across the blend
 * band it returns a 0..1 weight so the terrain can mix with its natural height.
 */
export function padBlend(plan: AirportPlan, wx: number, wz: number): { y: number; weight: number } | null {
  const l = worldToLocal(plan.site, wx, wz);
  const dx = Math.max(0, Math.abs(l.x - plan.pad.cx) - plan.pad.w / 2);
  const dz = Math.max(0, Math.abs(l.z - plan.pad.cz) - plan.pad.d / 2);
  const dist = Math.hypot(dx, dz);
  if (dist >= plan.pad.blend) return null;
  const t = 1 - dist / plan.pad.blend;
  return { y: plan.pad.y, weight: t * t * (3 - 2 * t) }; // smoothstep
}

/** world position of the road connection point + outward direction */
export function airportEntranceWorld(plan: AirportPlan): { x: number; z: number; dirX: number; dirZ: number; width: number } {
  const e = plan.entrance;
  const p = localToWorld(plan.site, e.x, e.z);
  const c = Math.cos(plan.site.heading);
  const s = Math.sin(plan.site.heading);
  return { x: p.x, z: p.z, dirX: e.dirX * c + e.dirZ * s, dirZ: -e.dirX * s + e.dirZ * c, width: e.width };
}
