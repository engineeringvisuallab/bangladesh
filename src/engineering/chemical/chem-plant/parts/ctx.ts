import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

export const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number; glow?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.3 });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.glow ?? 0.8;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};
const basic = (color: number, opacity = 1): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ color });
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  return m;
};

export function createChemMats() {
  return {
    steel: std(0xb7bec6, { rough: 0.35, metal: 0.8 }),
    steelDark: std(0x4a5056, { rough: 0.5, metal: 0.6 }),
    tankWhite: std(0xe9ecee, { rough: 0.5, metal: 0.2 }),
    tankGrey: std(0xaab2b9, { rough: 0.55, metal: 0.3 }),
    /** open tank wall: seen from inside too */
    tankWall: Object.assign(std(0xdfe3e6, { rough: 0.5, metal: 0.25 }), { side: THREE.DoubleSide }),
    paintRed: std(0xb5382c, { rough: 0.55 }),
    paintBlue: std(0x2e5c8a, { rough: 0.55 }),
    paintGreen: std(0x3f7d5a, { rough: 0.55 }),
    paintYellow: std(0xe0b020, { rough: 0.55 }),
    paintOrange: std(0xd9772a, { rough: 0.55 }),
    paintWhite: std(0xefefec, { rough: 0.5 }),
    brick: std(0x8a8f94, { rough: 0.9, metal: 0.05 }),
    copper: std(0xb8693d, { rough: 0.4, metal: 0.8 }),
    catalyst: std(0x4a4038, { rough: 0.95, metal: 0.05 }),
    /** glass-like shells so the inside can be seen */
    shell: Object.assign(std(0xcfe3ee, { opacity: 0.16, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    jacket: Object.assign(std(0xbfe3ef, { opacity: 0.22, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    liquid: std(0x6fbf9a, { opacity: 0.6, rough: 0.2 }),
    hotCoil: std(0x8b2a10, { rough: 0.5, metal: 0.4, emissive: 0xff5a1f, glow: 0.9 }),
    hotWall: std(0x6b3a22, { rough: 0.8, metal: 0.1, emissive: 0xff7a1a, glow: 0.35 }),
    fin: std(0xc2cbd2, { rough: 0.4, metal: 0.8 }),
    screenOn: basic(0x2fe29a),
    screenOff: basic(0x0d3b2c),
    screenAmber: basic(0xffb347),
    lampRed: basic(0xff3b30),
    lampGreen: basic(0x32d74b),
    lampOff: basic(0x333a40),
    flameOuter: basic(0xff7a1a, 0.85),
    flameInner: basic(0xffd54a, 0.95),
    flameBlue: basic(0x4aa8ff, 0.8),
    markY: basic(0xffd23f),
    // pipe colours = what flows inside
    pCrude: std(0x4a3322, { rough: 0.5, metal: 0.4 }),
    pHot: std(0xc2552b, { rough: 0.5, metal: 0.4 }),
    pVapour: std(0xdfe3e6, { rough: 0.5, metal: 0.4 }),
    pNaphtha: std(0xe9cf6a, { rough: 0.5, metal: 0.4 }),
    pKero: std(0xd9a441, { rough: 0.5, metal: 0.4 }),
    pDiesel: std(0x9c6a2c, { rough: 0.5, metal: 0.4 }),
    pResidue: std(0x2f2925, { rough: 0.5, metal: 0.4 }),
    pGas: std(0xe8c21a, { rough: 0.5, metal: 0.4 }),
    pReflux: std(0xf0e8b0, { rough: 0.5, metal: 0.4 }),
    pCold: std(0x4aa8e0, { rough: 0.5, metal: 0.4 }),
    pWarm: std(0xe0803a, { rough: 0.5, metal: 0.4 }),
    pFeedA: std(0x3e7cc0, { rough: 0.5, metal: 0.4 }),
    pFeedB: std(0xc0503e, { rough: 0.5, metal: 0.4 }),
    pProduct: std(0x56b886, { rough: 0.5, metal: 0.4 }),
  };
}
export type CMats = ReturnType<typeof createChemMats>;

/** bright colour of the dots that travel inside each kind of pipe */
export const DOT = {
  crude: 0x9b6b3d,
  hot: 0xff7a3d,
  vapour: 0xffffff,
  naphtha: 0xfff2a8,
  kero: 0xffd36b,
  diesel: 0xd4903f,
  residue: 0x6b5a4e,
  gas: 0xfff06a,
  reflux: 0xfff8cf,
  cold: 0x7fd0ff,
  warm: 0xffa66b,
  feedA: 0x6fb2ff,
  feedB: 0xff8a76,
  product: 0x8ff0b8,
} as const;

export interface Ctx {
  mats: Mats;
  t: CMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
}
