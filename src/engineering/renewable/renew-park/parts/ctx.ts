import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

export const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number; glow?: number; map?: THREE.Texture } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.3 });
  if (o.map) m.map = o.map;
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

/** Solar cell texture made in memory (no canvas, works in Node): dark blue cells with light grid lines; the box it covers repeats it. */
function pvTexture(a: AnimSet, repeatX: number, repeatY: number): THREE.DataTexture {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const line = x === 0 || y === 0 || x === 8;
      const i = (y * N + x) * 4;
      const v = line ? [185, 196, 212] : [20 + (x % 4) * 2, 46 + (y % 4) * 2, 96];
      data[i] = v[0];
      data[i + 1] = v[1];
      data[i + 2] = v[2];
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  a.disposables.push(tex);
  return tex;
}

export function createRenewMats(a: AnimSet) {
  return {
    steel: std(0xb7bec6, { rough: 0.35, metal: 0.8 }),
    steelDark: std(0x4a5056, { rough: 0.5, metal: 0.6 }),
    alu: std(0xc8cfd6, { rough: 0.3, metal: 0.9 }),
    white: std(0xf1f3f4, { rough: 0.45, metal: 0.15 }),
    blade: std(0xf4f6f7, { rough: 0.35, metal: 0.1 }),
    paintRed: std(0xb5382c, { rough: 0.55 }),
    paintBlue: std(0x2e5c8a, { rough: 0.55 }),
    paintGreen: std(0x3f7d5a, { rough: 0.55 }),
    paintYellow: std(0xe0b020, { rough: 0.55 }),
    paintGrey: std(0x8f979e, { rough: 0.6 }),
    transformer: std(0x5f7d6b, { rough: 0.5, metal: 0.4 }),
    ceramic: std(0xb98a5b, { rough: 0.3, metal: 0.1 }),
    glass: Object.assign(std(0xaed4e6, { opacity: 0.2, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    /** solar module strip (texture: 2 m x 2.2 m cells) */
    pv: std(0xffffff, { rough: 0.25, metal: 0.4, map: pvTexture(a, 58, 2) }),
    /** the small demo panel layers (bigger cells) */
    pvDemo: std(0xffffff, { rough: 0.25, metal: 0.4, map: pvTexture(a, 4, 4) }),
    eva: std(0xf3e6a8, { opacity: 0.45, rough: 0.2, metal: 0 }),
    backsheet: std(0xe8e8e4, { rough: 0.6, metal: 0.05 }),
    modOn: std(0x2a6a45, { rough: 0.5, metal: 0.2, emissive: 0x32d74b, glow: 0.9 }),
    modOff: std(0x2a3036, { rough: 0.6, metal: 0.3 }),
    lampOn: std(0xfff3b0, { rough: 0.3, metal: 0, emissive: 0xffe066, glow: 0 }),
    ledGreen: basic(0x32d74b),
    ledAmber: basic(0xffb347),
    ledRed: basic(0xff3b30),
    ledOff: basic(0x333a40),
    screenOff: basic(0x0d2a3b),
    barSolar: basic(0xffd23f),
    barWind: basic(0x5ec2ff),
    barBattery: basic(0x32d74b),
    barGrid: basic(0xe8ecef),
    barLoad: basic(0xff7a45),
    sun: basic(0xffd23f),
    moon: basic(0xb9c6d6),
    // cables = what flows inside
    cDC: std(0xe0a020, { rough: 0.5, metal: 0.4 }),
    cAC: std(0x2f6fbd, { rough: 0.5, metal: 0.4 }),
    cWind: std(0x2ec4b6, { rough: 0.5, metal: 0.4 }),
    cBatt: std(0x3fae5a, { rough: 0.5, metal: 0.4 }),
    cHV: std(0x8a929a, { rough: 0.4, metal: 0.7 }),
  };
}
export type RMats = ReturnType<typeof createRenewMats>;

/** bright colour of the dots that travel along each cable */
export const DOT = {
  dc: 0xffd23f,
  ac: 0x7fb4ff,
  wind: 0x7ff0e0,
  charge: 0x7dff9a,
  discharge: 0xff9a4a,
  hv: 0xdff3ff,
  light: 0xfff0a0,
  electron: 0x9fd0ff,
} as const;

/**
 * One accelerated day for the whole park (a day lasts DAY seconds). Every part reads these numbers, so the sun, the wind, the battery and the
 * control-room display always agree. It must be registered in the AnimSet BEFORE the parts (it runs first each frame).
 * All values are 0..1 "per unit of the park's rating". Not real engineering numbers, only the right story:
 * sun rises and sets, wind gusts, the evening has the biggest demand, the battery fills at noon and empties in the evening.
 */
export const DAY = 40;
export class Sim {
  /** 0..1 through the day: 0 = sunrise, 0.5 = sunset, 0.75 = evening demand peak */
  phase = 0.08;
  solar = 0;
  wind = 0.5;
  load = 0.4;
  soc = 0.35;
  /** + charging the battery, - discharging (per unit) */
  batt = 0;
  /** + export to the grid, - import from the grid */
  grid = 0;
  get day(): boolean {
    return this.phase < 0.5;
  }
  update(t: number, dt: number): void {
    this.phase = ((t / DAY) % 1 + 0.08) % 1;
    const p = this.phase;
    this.solar = p < 0.5 ? Math.sin(p * 2 * Math.PI) : 0;
    this.wind = Math.min(1, Math.max(0.12, 0.5 + 0.28 * Math.sin(p * 2 * Math.PI * 1.7 + 0.8) + 0.1 * Math.sin(p * 2 * Math.PI * 5.3)));
    this.load = 0.4 + 0.6 * Math.exp(-(((p - 0.75) / 0.09) ** 2));
    const gen = this.solar + this.wind * 0.6;
    const surplus = gen - this.load;
    // battery takes the surplus (up to 0.35 per unit) and gives back up to 0.3 when there is a shortage; the rest goes to / comes from the grid
    let b = Math.max(-0.3, Math.min(0.35, surplus));
    if (b > 0 && this.soc >= 0.98) b = 0;
    if (b < 0 && this.soc <= 0.04) b = 0;
    this.soc = Math.min(1, Math.max(0, this.soc + b * dt * 0.035));
    this.batt = b;
    this.grid = surplus - b;
  }
}

export interface Ctx {
  mats: Mats;
  t: RMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  sim: Sim;
}
