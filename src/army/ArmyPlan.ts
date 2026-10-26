// ARMY CAMP: pure layout data (no three.js / DOM), so the terrain generator, its worker, the zone map and the model can all use it.
// Local frame (same as the airport): +X east, +Z south (the main gate is on the SOUTH side, towards the railway), +Y up. Lengths in metres.
// The camp stands where the old international airport used to be (north-east, inside the big military reservation, see WorldZones ARMY).

export type RGB = readonly [number, number, number];

export function srgb(hex: number): RGB {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

/**
 * Centre of the camp compound (world metres): the flat low land at the foot of the big hill in the north-west (about 3 m of relief over the whole compound,
 * west of the river, south of the hill). The camp was fitted to that patch of land, see K below.
 */
export const ARMY_POS = { cx: -1600, cz: -2920, heading: 0 };

/** The layout was drawn for a 380 x 250 m fence; K squeezes the POSITIONS (not the buildings) so the compound fits the 300 x 200 m fence of the real site. */
export const ARMY_K = 0.79;
const K = ARMY_K;

export const ARMY_COLORS = {
  concrete: srgb(0x8a8d88),
  road: srgb(0x34363a),
  sand: srgb(0xb7a273),
  wall: srgb(0x6f7a58), // olive-drab walls
  wallDark: srgb(0x4f5a3d),
  roof: srgb(0x555b4a),
  roofRed: srgb(0x7a3a2e),
  tent: srgb(0x66703f),
  tentRoof: srgb(0x7b8650),
  metal: srgb(0x5c6166),
  tank: srgb(0x58603f),
  tankDark: srgb(0x3d4430),
  door: srgb(0x2b2e2b),
  white: srgb(0xe9e9e4),
  red: srgb(0xc23b2f),
  earth: srgb(0x6b5a3f),
  flag: srgb(0xc8352c),
  pole: srgb(0xcfd0cb),
  fence: srgb(0x4b5054),
  fenceTop: srgb(0x2f3235),
} as const;

export interface ArmyRect { cx: number; cz: number; w: number; d: number }
export type GroundKind = 'concrete' | 'road' | 'sand' | 'white';
export interface ArmyGround extends ArmyRect { kind: GroundKind }
export type ArmySolidKind =
  | 'hq' | 'barracks' | 'mess' | 'garage' | 'medical' | 'gatehouse' | 'tower' | 'tent' | 'bunker' | 'fuel' | 'mast' | 'flagpole' | 'sandbag' | 'vehicle' | 'fence';
export interface ArmySolid extends ArmyRect { kind: ArmySolidKind; h: number; /** vehicles: 0..1 colour variation */ tint?: number }
export interface FenceSegment { x0: number; z0: number; x1: number; z1: number }

export interface ArmyPlan {
  site: { cx: number; cz: number; heading: number };
  ground: ArmyGround[];
  solids: ArmySolid[];
  fence: FenceSegment[];
  helipad: { x: number; z: number; r: number };
  /** The flat pad the terrain system levels (local metres, centre + size) and its blend skirt. */
  pad: { cx: number; cz: number; w: number; d: number; blend: number };
  /** Sub-areas for the zone map / HUD chip (local rectangles, first match wins). */
  areas: { id: string; x0: number; z0: number; x1: number; z1: number }[];
  /** Main gate (local, the road runs north from here). */
  gate: { x: number; z: number; width: number };
  /** Where the player stands when teleported here (local, inside the gate). */
  spawn: { x: number; z: number };
}

const FX = Math.round(190 * K); // fence half width
const FZ = Math.round(125 * K); // fence half depth

export function createArmyPlan(): ArmyPlan {
  const ground: ArmyGround[] = [];
  const solids: ArmySolid[] = [];
  const fence: FenceSegment[] = [];
  const g = (kind: GroundKind, cx: number, cz: number, w: number, d: number): void => { ground.push({ kind, cx: cx * K, cz: cz * K, w: w * K, d: d * K }); };
  const s = (kind: ArmySolidKind, cx: number, cz: number, w: number, d: number, h: number, tint = 0): void => { solids.push({ kind, cx: cx * K, cz: cz * K, w, d, h, tint }); };

  // ---- the whole compound floor (compacted gravel) and the road network
  g('sand', 0, 0, 2 * 190, 2 * 125);
  g('road', 0, 70, 10 / K, 2 * (125 - 70) + 10);          // main road from the gate north to the parade ground
  g('road', 0, 118, 24 / K, 14 / K);                          // gate apron
  g('road', 0, 52, 2 * 190 - 20, 8 / K);                   // east-west service road (south)
  g('road', 0, -62, 2 * 190 - 20, 8 / K);                  // east-west service road (north)
  g('road', -95, 0, 8 / K, 2 * 125 - 24);                  // west spur
  g('road', 95, 0, 8 / K, 2 * 125 - 24);                   // east spur
  g('concrete', 0, -10, 120, 70);                     // parade ground
  g('concrete', 108, 82, 112, 34);                    // motor pool hard-standing
  g('concrete', -140, 90, 36, 36);                    // helipad slab
  g('concrete', 148, 20, 44, 52);                     // ammunition depot apron

  // ---- perimeter fence (gap = main gate on the south side)
  const gapHalf = 8;
  fence.push({ x0: -FX, z0: -FZ, x1: FX, z1: -FZ });
  fence.push({ x0: -FX, z0: -FZ, x1: -FX, z1: FZ });
  fence.push({ x0: FX, z0: -FZ, x1: FX, z1: FZ });
  fence.push({ x0: -FX, z0: FZ, x1: -gapHalf, z1: FZ });
  fence.push({ x0: gapHalf, z0: FZ, x1: FX, z1: FZ });

  // ---- watch towers at the four corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s('tower', sx * (190 - 5), sz * (125 - 5), 5, 5, 12);

  // ---- gate: two guard houses + sandbag chicanes
  s('gatehouse', -16 / K, 125 - 6, 5, 5, 3.2);
  s('gatehouse', 16 / K, 125 - 6, 5, 5, 3.2);
  for (const sx of [-1, 1]) {
    s('sandbag', sx * 26 / K, 125 - 14, 8, 1.6, 1.3);
    s('sandbag', sx * 22 / K, 125 - 24, 1.6, 7, 1.3);
  }

  // ---- command: HQ behind the parade ground, flag pole in the middle of it, radio mast
  s('hq', 0, -88, 64, 22, 9);
  s('flagpole', 0, -30, 1, 1, 22);
  s('mast', 62, -100, 3, 3, 34);

  // ---- west block: 4 barracks (long, low, gable roof)
  for (let i = 0; i < 4; i++) s('barracks', -140, -100 + i * 34, 52, 15, 3.6);
  // ---- mess hall + medical post (south of the west block, north of the service road)
  s('mess', -60, 20, 38, 18, 4.5);
  s('medical', -60, 80, 24, 14, 4);

  // ---- east block: two rows of tents
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) s('tent', 108 + i * 14, -100 + r * 24, 9, 6, 3.2);
  // ---- ammunition depot: two earth-covered bunkers + fuel tanks
  s('bunker', 148, 4, 26, 16, 5);
  s('bunker', 148, 36, 26, 16, 5);
  s('fuel', 160, -50, 7, 7, 5);
  s('fuel', 172, -50, 7, 7, 5);

  // ---- motor pool: open shed + parked armoured vehicles on the hard-standing
  s('garage', 108, 100, 96, 24, 6.5);
  for (let i = 0; i < 4; i++) s('vehicle', 74 + i * 24, 78, 8.4, 3.6, 3.1, i / 3);

  const helipad = { x: -140 * K, z: 90 * K, r: 13 };

  return {
    site: { ...ARMY_POS },
    ground, solids, fence, helipad,
    pad: { cx: 0, cz: 0, w: 2 * FX + 24, d: 2 * FZ + 24, blend: 40 },
    areas: [
      { id: 'army-gate', x0: -40, z0: 90, x1: 40, z1: 137 },
      { id: 'army-hq', x0: -45, z0: -115, x1: 45, z1: -40 },
      { id: 'army-parade', x0: -62, z0: -46, x1: 62, z1: 26 },
      { id: 'army-barracks', x0: -170, z0: -118, x1: -105, z1: 20 },
      { id: 'army-tents', x0: 98, z0: -112, x1: 190, z1: -70 },
      { id: 'army-depot', x0: 130, z0: -62, x1: 190, z1: 52 },
      { id: 'army-motorpool', x0: 55, z0: 60, x1: 170, z1: 137 },
      { id: 'army-helipad', x0: -170, z0: 70, x1: -110, z1: 137 },
      { id: 'army-camp', x0: -202, z0: -137, x1: 202, z1: 137 },
    ].map((a) => ({ id: a.id, x0: a.x0 * K, z0: a.z0 * K, x1: a.x1 * K, z1: a.z1 * K })),
    gate: { x: 0, z: FZ, width: 2 * gapHalf },
    spawn: { x: 0, z: FZ - 30 },
  };
}

/** local -> world / world -> local (same convention as the airport: rotation.y = heading). */
export function armyToWorld(site: { cx: number; cz: number; heading: number }, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(site.heading), sn = Math.sin(site.heading);
  return { x: site.cx + x * c + z * sn, z: site.cz - x * sn + z * c };
}
export function armyToLocal(site: { cx: number; cz: number; heading: number }, wx: number, wz: number): { x: number; z: number } {
  const c = Math.cos(site.heading), sn = Math.sin(site.heading);
  const dx = wx - site.cx, dz = wz - site.cz;
  return { x: dx * c - dz * sn, z: dx * sn + dz * c };
}
