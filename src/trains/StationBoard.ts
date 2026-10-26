import type { RailNetwork, RailStation } from '../rail/RailNetwork';
import { bn, bnDuration, bnNum } from '../i18n';
import type { TrainFleet } from './TrainSim';

/**
 * STAGE 15 / Step 6: the station board shown on the HUD when the player is at / near a station: Bangla station name and the trains heading to
 * or standing at it (ETA from the speed envelope, see Train.etaArrive). Pure (no DOM): `formatBoard` makes the Bangla text lines.
 */
export type BoardKind = 'arriving' | 'redWait' | 'standing' | 'waiting';
export interface BoardRow {
  train: number;
  kind: BoardKind;
  /** Seconds until it stops at the platform (arriving) or leaves (standing); null = unknown. */
  seconds: number | null;
}
export interface BoardInfo {
  station: string;
  rows: BoardRow[];
  /** Home signals of the station's platform ends. */
  green: number;
  red: number;
}

export class StationBoard {
  private cache: BoardInfo | null = null;
  private cacheStation = '';
  private cacheT = -1;

  /** `near` = how far (m) outside the station radius the board still shows. `maxRows` rows at most. */
  constructor(private fleet: TrainFleet, private rail: RailNetwork, private near = 200, private maxRows = 3, private refresh = 0.5) {}

  stationNear(px: number, pz: number): RailStation | null {
    let best: RailStation | null = null, bd = Infinity;
    for (const s of this.rail.stations) {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d <= s.radius + this.near && d < bd) { best = s; bd = d; }
    }
    return best;
  }

  /** Board of the station the player is at, or null when the player is not near any station. Recomputed every `refresh` simulated seconds. */
  update(px: number, pz: number): BoardInfo | null {
    const st = this.stationNear(px, pz);
    if (!st) { this.cache = null; this.cacheStation = ''; return null; }
    const now = this.fleet.time;
    if (this.cache && this.cacheStation === st.id && now - this.cacheT < this.refresh) return this.cache;
    this.cacheStation = st.id;
    this.cacheT = now;
    this.cache = this.build(st.id);
    return this.cache;
  }

  build(stationId: string): BoardInfo {
    const rows: BoardRow[] = [];
    for (const t of this.fleet.trains) {
      if (t.state === 'run' && t.leg.toStation === stationId) rows.push({ train: t.id, kind: t.atRed ? 'redWait' : 'arriving', seconds: t.atRed ? null : t.etaArrive() });
      else if (t.state === 'dwell' && t.station === stationId) rows.push({ train: t.id, kind: t.held ? 'waiting' : 'standing', seconds: t.held ? null : Math.max(0, t.dwell) });
    }
    const rank = (r: BoardRow): number => (r.kind === 'standing' || r.kind === 'waiting' ? -1 : 0);
    rows.sort((a, b) => rank(a) - rank(b) || (a.seconds ?? 1e9) - (b.seconds ?? 1e9));
    let green = 0, red = 0;
    const sig = this.fleet.signals;
    if (sig) {
      for (const n of this.fleet.graph.nodesAt(stationId)) (sig.homeAspect(n.edgeId, n.end) === 'green' ? green++ : red++);
    }
    return { station: stationId, rows: rows.slice(0, this.maxRows), green, red };
  }
}

/** The Bangla text of a board: a title (station name) and one line per train, plus the signal summary. */
export function formatBoard(b: BoardInfo): { title: string; lines: string[]; signal: string } {
  const T = bn.trains.board;
  const lines = b.rows.map((r) => {
    const name = `${bn.trains.train} ${bnNum(r.train + 1)}`;
    switch (r.kind) {
      case 'arriving': return `${name} — ${T.arriving} ${r.seconds === null ? '' : bnDuration(r.seconds)}`.trim();
      case 'redWait': return `${name} — ${T.redWait}`;
      case 'standing': return `${name} — ${T.standing} ${bnDuration(r.seconds ?? 0)}`;
      default: return `${name} — ${T.waiting}`;
    }
  });
  if (lines.length === 0) lines.push(T.none);
  return {
    title: bn.rail.station[b.station] ?? b.station,
    lines,
    signal: `${T.signals}: ${bnNum(b.green)}${T.count} ${T.green} · ${bnNum(b.red)}${T.count} ${T.red}`,
  };
}
