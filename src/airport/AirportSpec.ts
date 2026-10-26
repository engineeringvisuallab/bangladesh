/**
 * Airport — fixed dimensions & palette.
 * Pure data. No imports, so it is safe to use from workers too.
 * All lengths in metres. Local frame: +X = runway direction, +Z = terminal side, +Y = up.
 */

export type RGB = readonly [number, number, number];

/** sRGB hex -> linear RGB (what three.js expects for vertex colours). */
export function srgb(hex: number): RGB {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

export const AIRPORT_SPEC = {
  runway: {
    length: 1400,
    width: 45,
    shoulder: 7.5,
    designators: ['09', '27'] as readonly [string, string],
  },
  taxiway: {
    width: 22,
    /** centre-line distance from runway centre-line (+Z) */
    offset: 125,
    /** taxiway starts/ends this far inside the runway ends */
    endInset: 80,
    /** connector X positions measured from runway centre */
    connectorX: [-580, -250, 250, 580] as readonly number[],
  },
  apron: { width: 400, depth: 140 },
  terminal: { width: 170, depth: 40, height: 14, gap: 8, gates: [-60, -20, 20, 60] as readonly number[] },
  tower: { offsetX: 30, shaft: 7, shaftH: 32, cab: 13, cabH: 3.2 },
  hangar: { width: 55, depth: 45, height: 11, roofH: 5, spacing: 65, startX: -280, apronDepth: 14 },
  parking: { width: 140, depth: 50, gap: 10 },
  road: { width: 10, length: 46 },
  helipad: { x: 150, radius: 14 },
  fence: { height: 2.4, thickness: 0.15, margin: 60, entranceGap: 8 },
  lightSpacing: { runway: 60, taxiway: 40 },
  /** pavement stacking heights (avoid z-fighting) */
  y: { pavement: 0.04, runway: 0.06, marking: 0.08, marking2: 0.1, marking3: 0.12 },
} as const;

export const AIRPORT_COLORS = {
  shoulder: srgb(0x4a4d50),
  runway: srgb(0x3a3d40),
  taxiway: srgb(0x45484b),
  apron: srgb(0x8d9094),
  parking: srgb(0x2e3033),
  road: srgb(0x2c2e30),
  white: srgb(0xe8e8e8),
  yellow: srgb(0xe8c020),
  helipadDisc: srgb(0x2a2d30),
  terminal: srgb(0xcfd2d4),
  terminalRoof: srgb(0x5d6166),
  glass: srgb(0x2b4a63),
  towerShaft: srgb(0xbfc3c6),
  towerCab: srgb(0x8f959a),
  hangarWall: srgb(0xb8bcbf),
  hangarDoor: srgb(0x40464c),
  hangarRoofs: [srgb(0x7a8794), srgb(0x8b4a3c), srgb(0x4f6f52)] as readonly RGB[],
  jetbridge: srgb(0xa9aeb2),
  pole: srgb(0x5a5f64),
  fence: srgb(0x6b7075),
  sockOrange: srgb(0xff6a00),
  sockWhite: srgb(0xf2f2f2),
  lightWhite: srgb(0xfff4d6),
  lightGreen: srgb(0x20ff60),
  lightRed: srgb(0xff2a2a),
  lightBlue: srgb(0x2a60ff),
  lightAmber: srgb(0xffb030),
} as const;
