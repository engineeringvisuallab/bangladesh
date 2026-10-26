import { Config } from '../core/Config';
import type { Noise2D } from './Noise';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * MAIN ISLAND in the southern sea (about 2 km2). Pure function of (x, z) like the rest of the terrain,
 * so chunks, LODs, colliders and workers all agree on the same ground.
 *
 *   u = 1 - (distance / bent radius):  u > 0 is land, u = 0 is the shoreline, u < 0 is the sea around it.
 *   land   : sand beach shelf -> rolling hills -> a higher middle
 *   sea    : a gentle underwater shelf that slopes down into the natural sea floor
 *
 * `seaFloor` is the natural height the sea would have here (negative); it is returned unchanged far from the island.
 */
export function islandHeight(noise: Noise2D, x: number, z: number, seaFloor: number): number {
  const I = Config.terrain.island;
  const dx = x - I.x;
  const dz = z - I.z;
  const d = Math.hypot(dx, dz);
  // Quick exit: well outside the biggest possible outline + shelf.
  if (d > I.radius * (1 + I.wobble) * 1.6) return seaFloor;

  // Outline: radius bent by low-frequency noise (bays and headlands) + a little fine noise (rocky coast).
  const bend = noise.fbm(dx * 0.0016 + 41.7, dz * 0.0016 - 12.3, 3) * I.wobble + noise.fbm(dx * 0.007 - 5.1, dz * 0.007 + 8.8, 2) * 0.03;
  const R = I.radius * (1 + bend);
  const u = 1 - d / R;
  if (u < -0.6) return seaFloor;

  // Underwater shelf: from the natural sea floor up to the beach height at the shoreline.
  // (max: the shelf only ever RAISES the sea floor - natural land that happens to be near the island is never lowered)
  if (u < 0) return Math.max(seaFloor, lerp(seaFloor, I.beach, smoothstep(-0.6, 0, u)));

  // Land: beach first (gentle), then hills. `core` grows from the shore to the middle.
  const core = smoothstep(0.04, 0.85, u);
  const hills = 0.55 + 0.45 * noise.fbm(dx * 0.0042 + 9.2, dz * 0.0042 + 27.5, 4); // ~0.1 .. 1
  const detail = noise.fbm(x * 0.013, z * 0.013, 3);
  const rise = I.peak * Math.pow(core, 1.35) * hills;
  return I.beach + rise + detail * 1.6 * smoothstep(0.03, 0.2, u);
}

/** True if (x, z) is on the island's land (rough test for zones; the exact shoreline is where height > sea level). */
export function isOnIsland(noise: Noise2D, x: number, z: number): boolean {
  return islandHeight(noise, x, z, -60) > Config.terrain.seaLevel + 0.6;
}
