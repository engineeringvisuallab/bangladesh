/**
 * Vertical alignment (long section) solver - pure maths, no terrain.
 *
 * The designed height `design[i]` (top of ballast) of a line must:
 *   - never be steeper than `maxGrade`,
 *   - stay inside a band [lower[i], upper[i]] given by the structures it has to clear
 *     (river deck >= water + clearance, overbridge >= road + clearance, cut & cover <= road - depth, flat station platforms),
 *   - follow the ground as closely as possible (least earthwork), with gentle vertical curves.
 *
 * Method: the lower / upper bounds are first made "grade-consistent" (a bound at one point also limits its neighbours:
 * lo'[i] = max_j lo[j] - g|i-j|, up'[i] = min_j up[j] + g|i-j|); the band is empty only if two structures are too close
 * to be joined by a legal grade. The target (smoothed ground) is rate-limited to the grade, then clamped into the band
 * (clamping a g-Lipschitz function into a g-Lipschitz band stays g-Lipschitz), then smoothed (vertical curves) and clamped again.
 */
export interface ProfileResult {
  design: Float64Array;
  /** Indices where the band is empty (no legal profile): the structures there are too close together / too far apart in height. */
  infeasible: number[];
}

/** Grade limit (rise / run) of the interval between sample i and i+1: one number for the whole line, or one per interval. */
export type GradeLimit = number | Float64Array;
const gOf = (limit: GradeLimit, i: number, step: number): number => (typeof limit === 'number' ? limit : limit[Math.min(i, limit.length - 1)]) * step;

export function solveProfile(target: Float64Array, lower: Float64Array, upper: Float64Array, step: number, maxGrade: GradeLimit): ProfileResult {
  const n = target.length;
  const lo = Float64Array.from(lower);
  const up = Float64Array.from(upper);
  for (let i = 1; i < n; i++) {
    const g = gOf(maxGrade, i - 1, step);
    lo[i] = Math.max(lo[i], lo[i - 1] - g);
    up[i] = Math.min(up[i], up[i - 1] + g);
  }
  for (let i = n - 2; i >= 0; i--) {
    const g = gOf(maxGrade, i, step);
    lo[i] = Math.max(lo[i], lo[i + 1] - g);
    up[i] = Math.min(up[i], up[i + 1] + g);
  }
  const infeasible: number[] = [];
  for (let i = 0; i < n; i++) {
    if (lo[i] > up[i] + 1e-6) {
      infeasible.push(i);
      const m = (lo[i] + up[i]) / 2;
      lo[i] = m;
      up[i] = m;
    }
  }
  const clamp = (v: number, i: number): number => Math.max(lo[i], Math.min(up[i], v));
  // 1. rate-limit the target to the grade (forward then backward: |d[i]-d[i+1]| <= g for every pair)
  const d = Float64Array.from(target);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      const g = gOf(maxGrade, i - 1, step);
      d[i] = Math.max(d[i - 1] - g, Math.min(d[i - 1] + g, d[i]));
    }
    for (let i = n - 2; i >= 0; i--) {
      const g = gOf(maxGrade, i, step);
      d[i] = Math.max(d[i + 1] - g, Math.min(d[i + 1] + g, d[i]));
    }
  }
  for (let i = 0; i < n; i++) d[i] = clamp(d[i], i);
  // 2. vertical curves: relax towards the neighbours' mean, staying in the band (a convex mix keeps the grade limit)
  const t = new Float64Array(n);
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < n; i++) {
      const a = d[Math.max(0, i - 1)];
      const b = d[Math.min(n - 1, i + 1)];
      t[i] = clamp(0.5 * d[i] + 0.25 * (a + b), i);
    }
    d.set(t);
  }
  return { design: d, infeasible };
}

/** Moving average of `v` over +-`win` samples (the "natural" line a cheap railway would follow). */
export function movingAverage(v: ArrayLike<number>, win: number): Float64Array {
  const n = v.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      s += v[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

/** Is there any legal profile inside the band [lower, upper] (grade-consistent bounds do not cross)? */
export function bandOk(lower: Float64Array, upper: Float64Array, step: number, maxGrade: GradeLimit): boolean {
  const n = lower.length;
  const lo = Float64Array.from(lower);
  const up = Float64Array.from(upper);
  for (let i = 1; i < n; i++) {
    const g = gOf(maxGrade, i - 1, step);
    lo[i] = Math.max(lo[i], lo[i - 1] - g);
    up[i] = Math.min(up[i], up[i - 1] + g);
  }
  for (let i = n - 2; i >= 0; i--) {
    const g = gOf(maxGrade, i, step);
    lo[i] = Math.max(lo[i], lo[i + 1] - g);
    up[i] = Math.min(up[i], up[i + 1] + g);
  }
  for (let i = 0; i < n; i++) if (lo[i] > up[i] + 1e-6) return false;
  return true;
}
