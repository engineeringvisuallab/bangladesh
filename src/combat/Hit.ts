/** Pure ray maths for shooting (no three.js, easy to test). */

export interface PersonHit {
  /** Distance along the ray (m). */
  t: number;
  head: boolean;
}

/**
 * Ray against a standing person = a vertical cylinder (feet at py, `height` tall, `radius` wide).
 * The ray direction (dx, dy, dz) must be a unit vector. Returns null when it misses or the hit is farther than maxT.
 * `headFrom` = share of the height where the head starts (0.84 -> the top 16 % is the head).
 */
export function rayVsPerson(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  px: number, py: number, pz: number,
  height: number, radius: number, headFrom: number, maxT: number,
): PersonHit | null {
  const rx = ox - px;
  const rz = oz - pz;
  const r2 = radius * radius;
  const a = dx * dx + dz * dz;
  let tEnter: number;
  let tExit: number;
  if (a < 1e-9) {
    if (rx * rx + rz * rz > r2) return null;
    tEnter = -Infinity;
    tExit = Infinity;
  } else {
    const b = rx * dx + rz * dz;
    const c = rx * rx + rz * rz - r2;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    tEnter = (-b - s) / a;
    tExit = (-b + s) / a;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < py || oy > py + height) return null;
  } else {
    const y0 = (py - oy) / dy;
    const y1 = (py + height - oy) / dy;
    tEnter = Math.max(tEnter, Math.min(y0, y1));
    tExit = Math.min(tExit, Math.max(y0, y1));
  }
  if (tEnter > tExit || tExit < 0) return null;
  const t = Math.max(tEnter, 0);
  if (t > maxT) return null;
  const yHit = oy + dy * t;
  return { t, head: yHit >= py + height * headFrom };
}
