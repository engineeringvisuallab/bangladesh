import type { RailNetwork } from '../rail/RailNetwork';
import { linedSegments, trackEdgesOf } from '../rail/RailTunnel';

/**
 * Is a point inside a tunnel / box of the railway? (pure geometry, built once from the centre lines of the lined segments)
 * The train cameras use it: in a tunnel the outside / cinematic camera must stay between the walls and under the roof, not behind the rock.
 */
export class TunnelProbe {
  private cells = new Map<string, number[]>();
  private static readonly CELL = 16;
  /** Horizontal reach (m) from the centre line of the double track: two tracks 4.5 m apart + a car's half width; the lining is 5.6 m from the centre. */
  private static readonly REACH = 6.5;
  readonly sampleCount: number;

  constructor(rail: RailNetwork) {
    const tracks = trackEdgesOf(rail);
    let n = 0;
    for (const L of linedSegments(rail)) {
      const e = tracks[L.edge];
      const steps = Math.max(1, Math.ceil((L.s1 - L.s0) / 5));
      for (let k = 0; k <= steps; k++) {
        const p = rail.pointAt(e, L.s0 + ((L.s1 - L.s0) * k) / steps);
        const key = this.key(Math.floor(p.x / TunnelProbe.CELL), Math.floor(p.z / TunnelProbe.CELL));
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(p.x, p.z);
        n++;
      }
    }
    this.sampleCount = n;
  }

  private key(cx: number, cz: number): string {
    return cx + ',' + cz;
  }

  /** True when (x, z) (world metres) lies within the tunnel / box footprint. */
  inside(x: number, z: number): boolean {
    if (this.cells.size === 0) return false;
    const c = TunnelProbe.CELL;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    const r2 = TunnelProbe.REACH * TunnelProbe.REACH;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.cells.get(this.key(cx + i, cz + j));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const dx = list[k] - x, dz = list[k + 1] - z;
          if (dx * dx + dz * dz <= r2) return true;
        }
      }
    }
    return false;
  }
}
