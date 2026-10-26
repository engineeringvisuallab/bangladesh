import type { RailNetwork } from './RailNetwork';
import { RAIL_DESIGN as D } from './RailPlan';
import { stationAccesses } from './StationAccess';

/**
 * Station name boards: where they hang and what they say. Pure geometry (no three.js), shared by the mesh (RailMesh draws the blue board) and the
 * text layer (StationSignLayer puts the English + Bangla name on both faces of every board).
 */
/** English names (the Bangla names are the game's own: bn.rail.station). */
export const STATION_EN: Record<string, string> = {
  central: 'Central Railway Station',
  'south-interchange': 'South Interchange Station',
  port: 'Port Rail Yard & Station',
  'east-works': 'East Industrial Station',
  'north-hub': 'North Freight Hub',
  airport: 'Airport Station',
  'nw-town': 'North-West Township Station',
  'sw-newtown': 'New Town Station',
};

/** The hanging boards on a platform: 3 per side (middle, and 30 m inside both ends), 2.9 m from the inner edge, 3.85 m above the platform level. */
export const BOARD = {
  qs: (platform: number): number[] => [-platform / 2 + 30, 0, platform / 2 - 30],
  lat: 2.9,
  y: 3.85,
  hl: 0.06,
  hh: 0.34,
  hw: 1.7,
};

export interface SignSpot {
  station: string;
  /** Centre of the board, world metres. */
  x: number;
  y: number;
  z: number;
  /** Horizontal normal of the board faces (the board has a text face on +n and on -n). */
  nx: number;
  nz: number;
  /** Board size (m) and half thickness. */
  w: number;
  h: number;
  thick: number;
}

/** Every board of the railway: the platform boards and the two signs of every stair access (shelter sign, entrance sign). */
export function stationSigns(rail: RailNetwork, groundAt: (x: number, z: number) => number): SignSpot[] {
  const out: SignSpot[] = [];
  const half = D.trackSpacing / 2;
  for (const st of rail.stations) {
    st.arrivals.forEach((ar) => {
      const e = rail.edges.find((q) => q.id === ar.edgeId)!;
      const sgn = ar.end === 'a' ? 1 : -1;
      const s0 = ar.end === 'a' ? 0 : e.length;
      const p = rail.pointAt(e, s0 + sgn * (12 + D.platform / 2));
      const tx = p.dx, tz = p.dz, wx = -tz, wz = tx;
      for (const sg of [-1, 1]) {
        for (const q of BOARD.qs(D.platform)) {
          const lat = sg * (half + 1.7 + BOARD.lat);
          out.push({ station: st.id, x: p.x + tx * q + wx * lat, y: st.level + BOARD.y, z: p.z + tz * q + wz * lat, nx: tx, nz: tz, w: BOARD.hw * 2, h: BOARD.hh * 2, thick: BOARD.hl });
        }
      }
    });
  }
  for (const a of stationAccesses(rail, groundAt)) {
    for (const b of a.boxes) {
      if (b.kind === 'sign') out.push({ station: a.station, x: b.x, y: b.y, z: b.z, nx: b.ax, nz: b.az, w: b.hw * 2, h: b.hh * 2, thick: b.hl });
    }
  }
  return out;
}
