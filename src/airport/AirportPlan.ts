/**
 * Airport — layout plan (pure data, deterministic, no three.js).
 *
 * Everything is expressed in the airport LOCAL frame and every rectangle is
 * axis-aligned in that frame. The finished model is placed in the world with
 *   group.position = (site.cx, site.groundY, site.cz); group.rotation.y = site.heading
 * and localToWorld()/worldToLocal() below use exactly that convention.
 */

import { AIRPORT_SPEC as S } from './AirportSpec';

export interface AirportSite {
  /** world position of the runway centre */
  cx: number;
  cz: number;
  /** yaw (radians) applied to the local +X axis */
  heading: number;
  /** flat ground height of the whole airport */
  groundY: number;
  seed: number;
  /** Length (m) of a paved access causeway that continues the entrance road (local +Z) over filled ground, e.g. out of the sea. 0 / missing = none. */
  causeway?: number;
  /** Adds a military apron (hardstands for 4 fighters) with hardened shelters on the east side (local +x) of the apron. */
  military?: boolean;
}

export interface Rect { cx: number; cz: number; w: number; d: number }

export type PavementKind = 'shoulder' | 'runway' | 'taxiway' | 'connector' | 'apron' | 'parking' | 'road';
export interface Pavement extends Rect { kind: PavementKind }

export type MarkingColor = 'white' | 'yellow';
/** layer 0 = on pavement, 1 = on top of a disc, 2 = on top of that */
export interface Marking extends Rect { color: MarkingColor; layer: 0 | 1 | 2 }

export type BuildingKind = 'terminal' | 'tower' | 'hangar' | 'jetbridge';
export interface Building extends Rect { kind: BuildingKind; h: number; tint: number }

export type LightColor = 'white' | 'green' | 'red' | 'blue' | 'amber';
export interface AirportLight { x: number; y: number; z: number; color: LightColor }

export interface FenceSegment { x0: number; z0: number; x1: number; z1: number }

export interface Helipad { x: number; z: number; radius: number }

export interface AirportPad extends Rect {
  /** world-space centre of the flat area (cx/cz above are local) */
  worldX: number;
  worldZ: number;
  y: number;
  /** terrain should blend back to natural height over this distance */
  blend: number;
}

export interface AirportPlan {
  site: AirportSite;
  runway: { length: number; width: number; designators: readonly [string, string] };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  pavements: Pavement[];
  markings: Marking[];
  buildings: Building[];
  poles: { x: number; z: number; h: number }[];
  windsock: { x: number; z: number };
  fence: FenceSegment[];
  lights: AirportLight[];
  helipad: Helipad;
  /** where a road should join the airport (local coords + outward direction) */
  entrance: { x: number; z: number; dirX: number; dirZ: number; width: number };
  /** aircraft/helicopter start points (local coords) */
  spawns: { runwayStart: { x: number; z: number; yaw: number }; helipad: { x: number; z: number } };
  pad: AirportPad;
  /** The access causeway in the LOCAL frame (road + shoulders, levelled like the pad); z0 === z1 when there is none. */
  causeway: { x0: number; x1: number; z0: number; z1: number };
}

export const DEFAULT_SITE: AirportSite = { cx: 0, cz: 0, heading: 0, groundY: 0, seed: 1 };

// ---------------------------------------------------------------- transforms

export function localToWorld(site: AirportSite, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(site.heading);
  const s = Math.sin(site.heading);
  return { x: site.cx + x * c + z * s, z: site.cz - x * s + z * c };
}

export function worldToLocal(site: AirportSite, wx: number, wz: number): { x: number; z: number } {
  const c = Math.cos(site.heading);
  const s = Math.sin(site.heading);
  const dx = wx - site.cx;
  const dz = wz - site.cz;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// ---------------------------------------------------------------- helpers

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rectangle from min/max corners */
function span(x0: number, x1: number, z0: number, z1: number): Rect {
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

// 7-segment digits: a b c d e f g
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

// ---------------------------------------------------------------- plan

export function createAirportPlan(partial: Partial<AirportSite> = {}): AirportPlan {
  const site: AirportSite = { ...DEFAULT_SITE, ...partial };
  const rnd = mulberry32(site.seed);

  const L = S.runway.length;
  const W = S.runway.width;
  const halfL = L / 2;
  const shoulderHalf = W / 2 + S.runway.shoulder; // 30
  const tw = S.taxiway.width;
  const taxiZ = S.taxiway.offset;
  const taxiNear = taxiZ - tw / 2; // 114
  const taxiFar = taxiZ + tw / 2; // 136

  const pavements: Pavement[] = [];
  const markings: Marking[] = [];
  const buildings: Building[] = [];
  const lights: AirportLight[] = [];
  const fence: FenceSegment[] = [];

  // ---- runway
  pavements.push({ kind: 'shoulder', ...span(-halfL - S.runway.shoulder, halfL + S.runway.shoulder, -shoulderHalf, shoulderHalf) });
  pavements.push({ kind: 'runway', cx: 0, cz: 0, w: L, d: W });

  // ---- taxiway + connectors
  const taxiHalf = halfL - S.taxiway.endInset;
  pavements.push({ kind: 'taxiway', ...span(-taxiHalf, taxiHalf, taxiNear, taxiFar) });
  for (const x of S.taxiway.connectorX) {
    pavements.push({ kind: 'connector', ...span(x - tw / 2, x + tw / 2, shoulderHalf, taxiNear) });
  }

  // ---- apron + terminal
  const apronNear = taxiFar;
  const apronFar = apronNear + S.apron.depth;
  pavements.push({ kind: 'apron', ...span(-S.apron.width / 2, S.apron.width / 2, apronNear, apronFar) });

  const termZ0 = apronFar + S.terminal.gap;
  const termZ1 = termZ0 + S.terminal.depth;
  buildings.push({ kind: 'terminal', ...span(-S.terminal.width / 2, S.terminal.width / 2, termZ0, termZ1), h: S.terminal.height, tint: 0 });

  for (const gx of S.terminal.gates) {
    // jet bridge: from terminal front toward the apron
    buildings.push({ kind: 'jetbridge', ...span(gx - 1.8, gx + 1.8, termZ0 - 22, termZ0), h: 4.5, tint: 0 });
  }

  // ---- control tower
  const towerX = S.terminal.width / 2 + S.tower.offsetX;
  const towerZ = (termZ0 + termZ1) / 2;
  buildings.push({ kind: 'tower', cx: towerX, cz: towerZ, w: S.tower.shaft, d: S.tower.shaft, h: S.tower.shaftH, tint: 0 });

  // ---- hangars (2 or 3, seeded)
  const hangarCount = 2 + Math.floor(rnd() * 2);
  const hangarZ0 = taxiFar + S.hangar.apronDepth;
  let hMinX = Infinity;
  let hMaxX = -Infinity;
  for (let i = 0; i < hangarCount; i++) {
    const cx = S.hangar.startX - i * S.hangar.spacing;
    buildings.push({
      kind: 'hangar', cx, cz: hangarZ0 + S.hangar.depth / 2, w: S.hangar.width, d: S.hangar.depth,
      h: S.hangar.height, tint: Math.floor(rnd() * 3),
    });
    hMinX = Math.min(hMinX, cx - S.hangar.width / 2 - 5);
    hMaxX = Math.max(hMaxX, cx + S.hangar.width / 2 + 5);
  }
  pavements.push({ kind: 'apron', ...span(hMinX, hMaxX, taxiFar, hangarZ0) });

  // ---- optional military apron: hardstands in a row (nose towards the shelters) + 4 hardened shelters
  if (site.military) {
    pavements.push({ kind: 'apron', ...span(290, 640, taxiFar, 300) });
    for (let i = 0; i < 4; i++) buildings.push({ kind: 'hangar', cx: 330 + i * 70, cz: 270, w: 30, d: 40, h: 8, tint: 1 });
  }

  // ---- landside: parking + entrance road
  const parkZ0 = termZ1 + S.parking.gap;
  const parkZ1 = parkZ0 + S.parking.depth;
  pavements.push({ kind: 'parking', ...span(-S.parking.width / 2, S.parking.width / 2, parkZ0, parkZ1) });
  const roadZ1 = parkZ1 + S.road.length;
  pavements.push({ kind: 'road', ...span(-S.road.width / 2, S.road.width / 2, parkZ1, roadZ1) });
  // optional causeway road: the entrance road carries on over filled ground (the sea airport joins the shore this way)
  const causeLen = site.causeway ?? 0;
  if (causeLen > 0) pavements.push({ kind: 'road', ...span(-S.road.width / 2, S.road.width / 2, roadZ1, roadZ1 + causeLen) });
  const causeway = { x0: -S.road.width / 2 - 14, x1: S.road.width / 2 + 14, z0: roadZ1, z1: roadZ1 + causeLen };

  // ---- bounds
  const m = S.fence.margin;
  const bounds = {
    minX: -halfL - m,
    maxX: halfL + m,
    minZ: -shoulderHalf - m,
    maxZ: roadZ1 + 4,
  };

  // ---- fence (gap at the entrance road)
  const g = S.fence.entranceGap;
  fence.push({ x0: bounds.minX, z0: bounds.minZ, x1: bounds.maxX, z1: bounds.minZ });
  fence.push({ x0: bounds.minX, z0: bounds.minZ, x1: bounds.minX, z1: bounds.maxZ });
  fence.push({ x0: bounds.maxX, z0: bounds.minZ, x1: bounds.maxX, z1: bounds.maxZ });
  fence.push({ x0: bounds.minX, z0: bounds.maxZ, x1: -g, z1: bounds.maxZ });
  fence.push({ x0: g, z0: bounds.maxZ, x1: bounds.maxX, z1: bounds.maxZ });

  // ---- markings: runway
  const white = (r: Rect, layer: 0 | 1 | 2 = 0): void => { markings.push({ ...r, color: 'white', layer }); };
  const yellow = (r: Rect, layer: 0 | 1 | 2 = 0): void => { markings.push({ ...r, color: 'yellow', layer }); };

  // edge lines
  for (const sgn of [-1, 1]) white({ cx: 0, cz: sgn * (W / 2 - 0.8), w: L - 20, d: 0.45 });
  // centre-line dashes (30 m dash, 20 m gap)
  for (let x = -halfL + 100; x + 30 <= halfL - 100; x += 50) white({ cx: x + 15, cz: 0, w: 30, d: 0.9 });
  // thresholds + designators + aiming points
  for (let end = 0; end < 2; end++) {
    const dir = end === 0 ? 1 : -1; // direction of travel (+X for end 0)
    const edgeX = -dir * halfL; // runway end
    const at = (v: number): number => edgeX + dir * v;
    for (let i = 0; i < 5; i++) {
      for (const sgn of [-1, 1]) {
        white({ cx: at(6 + 15), cz: sgn * (3 + i * 3.6), w: 30, d: 1.8 });
      }
    }
    // designator: glyph (u = right across runway, v = forward)
    const name = S.runway.designators[end] ?? '00';
    const gw = 4, gh = 8, t = 0.9, gap = 2;
    const total = name.length * gw + (name.length - 1) * gap;
    for (let k = 0; k < name.length; k++) {
      const segs = SEG[name.charAt(k)] ?? '';
      const u0 = -total / 2 + k * (gw + gap);
      const v0 = 45;
      const bar = (cu: number, cv: number, su: number, sv: number): void => {
        const u = u0 + cu;
        const v = v0 + cv;
        white({ cx: at(v), cz: dir * u, w: sv, d: su });
      };
      if (segs.includes('a')) bar(gw / 2, gh - t / 2, gw, t);
      if (segs.includes('d')) bar(gw / 2, t / 2, gw, t);
      if (segs.includes('g')) bar(gw / 2, gh / 2, gw, t);
      if (segs.includes('f')) bar(t / 2, (gh * 3) / 4, t, gh / 2);
      if (segs.includes('b')) bar(gw - t / 2, (gh * 3) / 4, t, gh / 2);
      if (segs.includes('e')) bar(t / 2, gh / 4, t, gh / 2);
      if (segs.includes('c')) bar(gw - t / 2, gh / 4, t, gh / 2);
    }
    // aiming point 300 m in
    for (const sgn of [-1, 1]) white({ cx: at(300 + 22.5), cz: sgn * 9, w: 45, d: 6 });
  }

  // ---- markings: taxiways (yellow)
  yellow({ cx: 0, cz: taxiZ, w: taxiHalf * 2, d: 0.3 });
  for (const x of S.taxiway.connectorX) {
    yellow({ cx: x, cz: (shoulderHalf + taxiNear) / 2, w: 0.3, d: taxiNear - shoulderHalf });
    yellow({ cx: x, cz: shoulderHalf + 6, w: tw, d: 0.9 }); // hold-short bar
  }

  // ---- markings: apron stands
  for (const gx of S.terminal.gates) {
    yellow({ cx: gx, cz: (apronNear + 6 + apronFar - 12) / 2, w: 0.3, d: apronFar - 12 - (apronNear + 6) });
    yellow({ cx: gx, cz: apronFar - 14, w: 6, d: 0.6 }); // stop bar
  }

  // ---- helipad
  const hpZ = (apronNear + apronFar) / 2;
  const helipad: Helipad = { x: S.helipad.x, z: hpZ, radius: S.helipad.radius };
  // "H" painted as three bars (layer 2, on top of the dark disc)
  const hr = helipad.radius;
  white({ cx: helipad.x - hr * 0.3, cz: hpZ, w: 0.9, d: hr * 0.9 }, 2); // left leg (along Z)
  white({ cx: helipad.x + hr * 0.3, cz: hpZ, w: 0.9, d: hr * 0.9 }, 2); // right leg
  white({ cx: helipad.x, cz: hpZ, w: hr * 0.6, d: 0.9 }, 2); // cross bar

  // ---- parking stripes
  const rowZ = [parkZ0 + 12.5, parkZ1 - 12.5];
  for (const z of rowZ) {
    for (let x = -S.parking.width / 2 + 2; x <= S.parking.width / 2 - 2 + 0.01; x += 2.8) {
      white({ cx: x, cz: z, w: 0.12, d: 5.5 });
    }
  }

  // ---- lights
  const ly = 0.25;
  // runway edge (white) every 60 m
  for (let x = -halfL; x <= halfL + 0.01; x += S.lightSpacing.runway) {
    for (const sgn of [-1, 1]) lights.push({ x, y: ly, z: sgn * (W / 2 + 1.5), color: 'white' });
  }
  // thresholds: green, across the runway width
  for (const x of [-halfL - 1, halfL + 1]) {
    for (let i = -4; i <= 4; i++) lights.push({ x, y: ly, z: i * 5, color: 'green' });
  }
  // taxiway edge (blue) every 40 m
  for (let x = -taxiHalf; x <= taxiHalf + 0.01; x += S.lightSpacing.taxiway) {
    for (const sgn of [-1, 1]) lights.push({ x, y: ly, z: taxiZ + sgn * (tw / 2 + 1), color: 'blue' });
  }
  // helipad perimeter (amber)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    lights.push({ x: helipad.x + Math.cos(a) * (hr + 0.5), y: ly, z: hpZ + Math.sin(a) * (hr + 0.5), color: 'amber' });
  }

  // ---- floodlight poles on the apron corners + tower beacon
  const poleH = 16;
  const poles = [
    { x: -190, z: apronNear + 10, h: poleH },
    { x: 190, z: apronNear + 10, h: poleH },
    { x: -190, z: apronFar - 10, h: poleH },
    { x: 190, z: apronFar - 10, h: poleH },
  ];
  for (const p of poles) lights.push({ x: p.x, y: p.h + 0.4, z: p.z, color: 'white' });
  lights.push({ x: towerX, y: S.tower.shaftH + S.tower.cabH + 4 + 5, z: towerZ, color: 'red' });

  // ---- windsock
  const windsock = { x: -halfL / 2, z: -(shoulderHalf + 12) };

  // ---- entrance + spawns
  const entrance = { x: 0, z: roadZ1, dirX: 0, dirZ: 1, width: S.road.width };
  const spawns = {
    runwayStart: { x: -halfL + 20, z: 0, yaw: 0 },
    helipad: { x: helipad.x, z: hpZ },
  };

  // ---- flat pad for the terrain system
  const padRect = span(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  const wc = localToWorld(site, padRect.cx, padRect.cz);
  const pad: AirportPad = { ...padRect, worldX: wc.x, worldZ: wc.z, y: site.groundY, blend: 60 };

  return {
    site, runway: { length: L, width: W, designators: S.runway.designators }, bounds,
    pavements, markings, buildings, poles, windsock, fence, lights, helipad, entrance, spawns, pad, causeway,
  };
}
