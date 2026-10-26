import * as THREE from 'three';
import { ball, curveTube, hang, loft, merge, place, smooth, spike, type Station } from './Loft';
import { LOOKS, skinOf, type Skin } from './AnimalSkins';
import { cachedGeo, DARK, lerp, mesh, sm, type Rig } from './AnimalRig';
import type { Species } from './Species';
import { buildBird, buildDolphin, buildFishGeometry, buildFishMaterial } from './AnimalExtra';

export type { Species } from './Species';
export type { Rig, RigKind } from './AnimalRig';
export { buildFishGeometry, buildFishMaterial };

/**
 * Procedural animals (no external assets). Bodies are smooth lofted meshes (Loft.ts), not piles of balls: a torso with a deep
 * chest, a narrow waist and a wide rump, tapered necks, heads with a real muzzle, two-part legs (thigh / shank / hoof, paw, pad),
 * tails, ears, horns, antlers, tusks, a trunk, a mane ... This file builds the four-legged animals (and the crocodile);
 * birds, the dolphin and the fish are in AnimalExtra.ts.
 */

type TailKind = 'rope' | 'whip' | 'bush' | 'stub' | 'curl' | 'croc' | 'ball';
type EarKind = 'point' | 'round' | 'long' | 'flap' | 'big' | 'none';

interface QuadSpec {
  /** Body length from the rump to the front of the chest (m). */
  L: number;
  /** Height of the withers above the ground (m). */
  H: number;
  /** Depth and width of the chest and of the rump (m). */
  cd: number; cw: number; rd: number; rw: number;
  /** 0..1 belly tuck, rump height relative to the withers, shoulder hump (m). */
  waist?: number; drop?: number; hump?: number;
  /** Bend of the hind / front legs (rad, 0 = straight pillars). */
  hind?: number; front?: number;
  /** Leg radius (m) at the shoulder; hind legs are a little thicker. */
  lw: number;
  /** Share of the upper part in the leg length. */
  legUp?: number;
  foot: 'hoof' | 'paw' | 'pad' | 'toe';
  /** length, base half-width, top half-width, angle above the horizontal (rad). */
  neck: [number, number, number, number];
  /** length, half width, half height, muzzle share, muzzle width, muzzle height (shares of the skull), tilt down (rad). */
  head: [number, number, number, number, number, number, number];
  tail: [TailKind, number, number];
  ears: [EarKind, number];
  /** Eyes at the sides of the head (prey) or in front (hunters). */
  eyes: 'side' | 'front';
  /** Crocodile: angle of the thigh out to the side (rad). */
  splay?: number;
  swing?: number;
  /** Super-ellipse exponent of the muzzle (boxy muzzles). */
  boxy?: number;
}

/** Leg thickness factor per foot type (the table gives slim values). */
const LEG_K = { hoof: 1.5, paw: 1.4, pad: 1.0, toe: 1.2 };

const QUAD: Partial<Record<Species, QuadSpec>> = {
  cow: { L: 1.55, H: 1.3, cd: 0.66, cw: 0.48, rd: 0.62, rw: 0.5, waist: 0.25, drop: 0.0, hump: 0.13, hind: 0.2, lw: 0.07, foot: 'hoof', neck: [0.5, 0.17, 0.11, 0.42], head: [0.46, 0.12, 0.15, 0.5, 0.78, 0.7, 0.55], tail: ['rope', 0.95, 0.025], ears: ['flap', 1], eyes: 'side' },
  buffalo: { L: 1.9, H: 1.38, cd: 0.78, cw: 0.62, rd: 0.7, rw: 0.62, waist: 0.15, drop: -0.05, hump: 0.04, hind: 0.15, lw: 0.085, foot: 'hoof', neck: [0.5, 0.24, 0.16, 0.12], head: [0.55, 0.15, 0.17, 0.5, 0.85, 0.7, 0.75], tail: ['rope', 0.85, 0.03], ears: ['flap', 1.1], eyes: 'side' },
  goat: { L: 0.8, H: 0.72, cd: 0.34, cw: 0.2, rd: 0.3, rw: 0.22, waist: 0.35, drop: 0.0, hind: 0.3, lw: 0.028, foot: 'hoof', neck: [0.3, 0.07, 0.045, 0.75], head: [0.24, 0.055, 0.075, 0.55, 0.7, 0.6, 0.35], tail: ['stub', 0.14, 0.03], ears: ['flap', 0.9], eyes: 'side' },
  sheep: { L: 0.85, H: 0.78, cd: 0.46, cw: 0.36, rd: 0.44, rw: 0.38, waist: 0.05, drop: 0.0, hind: 0.2, lw: 0.03, foot: 'hoof', neck: [0.26, 0.1, 0.06, 0.55], head: [0.22, 0.06, 0.08, 0.55, 0.7, 0.62, 0.5], tail: ['stub', 0.2, 0.05], ears: ['flap', 0.9], eyes: 'side', boxy: 2.6 },
  horse: { L: 1.55, H: 1.5, cd: 0.62, cw: 0.4, rd: 0.58, rw: 0.46, waist: 0.3, drop: 0.02, hind: 0.32, lw: 0.06, foot: 'hoof', neck: [0.78, 0.17, 0.095, 0.9], head: [0.58, 0.095, 0.15, 0.55, 0.62, 0.6, 0.45], tail: ['rope', 0.85, 0.04], ears: ['long', 0.8], eyes: 'side' },
  dog: { L: 0.7, H: 0.58, cd: 0.27, cw: 0.15, rd: 0.22, rw: 0.17, waist: 0.5, drop: 0.0, hind: 0.35, lw: 0.027, foot: 'paw', neck: [0.22, 0.07, 0.05, 0.85], head: [0.2, 0.055, 0.065, 0.5, 0.65, 0.6, 0.3], tail: ['curl', 0.3, 0.02], ears: ['flap', 0.8], eyes: 'front' },
  cat: { L: 0.36, H: 0.25, cd: 0.13, cw: 0.09, rd: 0.12, rw: 0.1, waist: 0.4, drop: 0.04, hind: 0.45, lw: 0.016, foot: 'paw', neck: [0.1, 0.035, 0.03, 0.6], head: [0.09, 0.04, 0.036, 0.22, 0.6, 0.55, 0.15], tail: ['whip', 0.3, 0.012], ears: ['point', 1.5], eyes: 'front' },
  deer: { L: 1.1, H: 0.92, cd: 0.4, cw: 0.23, rd: 0.38, rw: 0.26, waist: 0.4, drop: 0.03, hind: 0.32, lw: 0.03, foot: 'hoof', neck: [0.5, 0.1, 0.06, 0.95], head: [0.27, 0.06, 0.075, 0.6, 0.62, 0.55, 0.45], tail: ['stub', 0.14, 0.03], ears: ['long', 0.85], eyes: 'side' },
  boar: { L: 1.15, H: 0.82, cd: 0.52, cw: 0.34, rd: 0.44, rw: 0.34, waist: 0.1, drop: -0.08, hump: 0.07, hind: 0.2, lw: 0.04, foot: 'hoof', neck: [0.24, 0.17, 0.13, 0.05], head: [0.46, 0.1, 0.12, 0.65, 0.55, 0.5, 0.4], tail: ['curl', 0.28, 0.018], ears: ['point', 1.3], eyes: 'side' },
  rabbit: { L: 0.3, H: 0.2, cd: 0.14, cw: 0.1, rd: 0.17, rw: 0.12, waist: 0.1, drop: 0.2, hind: 0.7, lw: 0.012, foot: 'paw', neck: [0.06, 0.04, 0.035, 0.5], head: [0.09, 0.035, 0.04, 0.4, 0.7, 0.7, 0.3], tail: ['ball', 0.05, 0.03], ears: ['long', 1.5], eyes: 'side' },
  elephant: { L: 2.5, H: 2.45, cd: 1.3, cw: 1.0, rd: 1.22, rw: 1.0, waist: 0.1, drop: -0.03, hind: 0.1, lw: 0.2, foot: 'pad', neck: [0.5, 0.52, 0.42, 0.25], head: [0.95, 0.42, 0.5, 0.2, 0.6, 0.7, 0.55], tail: ['rope', 1.2, 0.04], ears: ['big', 1], eyes: 'side', swing: 0.3 },
  zebra: { L: 1.5, H: 1.35, cd: 0.6, cw: 0.36, rd: 0.56, rw: 0.42, waist: 0.3, drop: 0.0, hind: 0.3, lw: 0.05, foot: 'hoof', neck: [0.66, 0.15, 0.09, 0.8], head: [0.52, 0.09, 0.13, 0.55, 0.65, 0.62, 0.45], tail: ['rope', 0.7, 0.035], ears: ['long', 0.8], eyes: 'side' },
  giraffe: { L: 1.7, H: 3.0, cd: 0.82, cw: 0.4, rd: 0.58, rw: 0.36, waist: 0.2, drop: -0.2, hump: 0.2, hind: 0.12, lw: 0.07, foot: 'hoof', neck: [1.95, 0.2, 0.085, 1.2], head: [0.46, 0.085, 0.11, 0.6, 0.65, 0.65, 0.45], tail: ['rope', 0.95, 0.025], ears: ['long', 0.9], eyes: 'side', swing: 0.4 },
  rhino: { L: 2.3, H: 1.65, cd: 1.0, cw: 0.78, rd: 0.92, rw: 0.8, waist: 0.05, drop: -0.04, hump: 0.12, hind: 0.1, lw: 0.14, foot: 'pad', neck: [0.5, 0.38, 0.3, 0.12], head: [0.95, 0.24, 0.3, 0.6, 0.62, 0.55, 0.55], tail: ['rope', 0.6, 0.03], ears: ['point', 0.9], eyes: 'side', swing: 0.32 },
  hippo: { L: 2.3, H: 1.35, cd: 1.1, cw: 0.95, rd: 1.05, rw: 0.95, waist: 0.0, drop: -0.02, hind: 0.0, lw: 0.17, foot: 'pad', neck: [0.3, 0.45, 0.4, 0.0], head: [0.82, 0.3, 0.27, 0.55, 1.0, 0.85, 0.3], tail: ['stub', 0.25, 0.04], ears: ['round', 0.5], eyes: 'side', swing: 0.28, boxy: 3.2 },
  tiger: { L: 1.45, H: 0.98, cd: 0.54, cw: 0.4, rd: 0.46, rw: 0.38, waist: 0.4, drop: 0.02, hind: 0.38, lw: 0.075, foot: 'paw', neck: [0.3, 0.2, 0.16, 0.35], head: [0.42, 0.2, 0.2, 0.35, 0.6, 0.55, 0.3], tail: ['whip', 1.0, 0.05], ears: ['round', 0.9], eyes: 'front' },
  lion: { L: 1.5, H: 1.12, cd: 0.6, cw: 0.42, rd: 0.5, rw: 0.4, waist: 0.4, drop: 0.0, hind: 0.38, lw: 0.08, foot: 'paw', neck: [0.3, 0.2, 0.17, 0.35], head: [0.42, 0.2, 0.2, 0.33, 0.62, 0.55, 0.3], tail: ['whip', 0.95, 0.045], ears: ['round', 0.85], eyes: 'front' },
  leopard: { L: 1.05, H: 0.7, cd: 0.36, cw: 0.26, rd: 0.34, rw: 0.26, waist: 0.5, drop: 0.03, hind: 0.4, lw: 0.05, foot: 'paw', neck: [0.22, 0.12, 0.1, 0.3], head: [0.29, 0.13, 0.125, 0.3, 0.62, 0.55, 0.25], tail: ['whip', 0.85, 0.035], ears: ['round', 0.85], eyes: 'front' },
  wolf: { L: 1.0, H: 0.85, cd: 0.38, cw: 0.23, rd: 0.33, rw: 0.23, waist: 0.5, drop: 0.0, hind: 0.35, lw: 0.04, foot: 'paw', neck: [0.3, 0.1, 0.075, 0.6], head: [0.3, 0.075, 0.085, 0.5, 0.55, 0.5, 0.3], tail: ['bush', 0.45, 0.07], ears: ['point', 1.4], eyes: 'front' },
  fox: { L: 0.55, H: 0.4, cd: 0.19, cw: 0.12, rd: 0.17, rw: 0.13, waist: 0.4, drop: 0.0, hind: 0.38, lw: 0.02, foot: 'paw', neck: [0.14, 0.05, 0.04, 0.5], head: [0.17, 0.045, 0.05, 0.5, 0.45, 0.45, 0.25], tail: ['bush', 0.4, 0.07], ears: ['point', 1.7], eyes: 'front' },
  bear: { L: 1.45, H: 1.12, cd: 0.7, cw: 0.55, rd: 0.66, rw: 0.55, waist: 0.1, drop: 0.0, hump: 0.12, hind: 0.2, lw: 0.1, foot: 'paw', neck: [0.3, 0.27, 0.22, 0.2], head: [0.38, 0.14, 0.15, 0.4, 0.6, 0.55, 0.45], tail: ['stub', 0.1, 0.05], ears: ['round', 0.7], eyes: 'front' },
  crocodile: { L: 1.75, H: 0.45, cd: 0.32, cw: 0.56, rd: 0.34, rw: 0.6, waist: 0.0, drop: 0.0, hind: 0.0, lw: 0.045, foot: 'toe', neck: [0.1, 0.2, 0.18, 0.0], head: [0.85, 0.15, 0.09, 0.72, 0.62, 0.62, 0.0], tail: ['croc', 1.6, 0.22], ears: ['none', 0], eyes: 'side', splay: 1.0, swing: 0.45, boxy: 3.0 },
};

// ---------------------------------------------------------------------------------------------- pieces

interface Torso {
  st: Station[];
  top: (t: number) => number;
  depth: (t: number) => number;
}

function torso(s: QuadSpec): Torso {
  const { L, H, cd, cw, rd, rw } = s;
  const waist = s.waist ?? 0.3, drop = s.drop ?? 0, hump = s.hump ?? 0;
  const top = (t: number): number => lerp(H * (1 + drop), H, sm(0.08, 0.8, t)) + hump * Math.exp(-(((t - 0.72) / 0.14) ** 2));
  const depth = (t: number): number => {
    let d = lerp(rd, cd, sm(0.12, 0.72, t));
    d *= 1 - waist * 0.18 * Math.exp(-(((t - 0.42) / 0.17) ** 2));
    if (t < 0.22) d *= 0.38 + 0.62 * Math.pow(t / 0.22, 0.6);
    if (t > 0.8) d *= 1 - 0.38 * Math.pow((t - 0.8) / 0.2, 1.4);
    return d;
  };
  const width = (t: number): number => {
    let w = lerp(rw, cw, sm(0.12, 0.72, t));
    w *= 1 - waist * 0.08 * Math.exp(-(((t - 0.42) / 0.17) ** 2));
    if (t < 0.22) w *= 0.42 + 0.58 * Math.pow(t / 0.22, 0.55);
    if (t > 0.8) w *= 1 - 0.45 * Math.pow((t - 0.8) / 0.2, 1.3);
    return w;
  };
  const ts = [0, 0.03, 0.09, 0.18, 0.32, 0.48, 0.64, 0.78, 0.9, 0.97, 1];
  const st: Station[] = ts.map((t) => ({ z: -L / 2 + t * L, w: width(t) / 2, h: depth(t) / 2, y: top(t) - depth(t) / 2, n: 2.15 }));
  return { st, top, depth };
}

function tailGeo(kind: TailKind, len: number, w: number): THREE.BufferGeometry {
  switch (kind) {
    case 'rope': {
      const pts = [[0, 0, 0], [0, -0.28 * len, -0.04 * len], [0, -0.6 * len, -0.08 * len], [0, -0.92 * len, -0.07 * len]];
      return merge([curveTube(pts, w, w * 0.55, 1, 6), ball(w * 1.9, len * 0.1, w * 1.9, 0, -len * 0.96, -0.07 * len, 0.35)]);
    }
    case 'whip': {
      const pts = [[0, 0, 0], [0, 0.0, -0.3 * len], [0, -0.07 * len, -0.62 * len], [0, -0.04 * len, -0.92 * len]];
      return merge([curveTube(pts, w, w * 0.78, 1, 7), ball(w * 0.9, w * 0.9, w * 1.6, 0, -0.04 * len, -0.96 * len, 0.18)]);
    }
    case 'curl': {
      const pts = [[0, 0, 0], [0, 0.04 * len, -0.28 * len], [0, 0.2 * len, -0.4 * len], [0, 0.36 * len, -0.26 * len]];
      return curveTube(pts, w, w * 0.45, 1, 6);
    }
    case 'bush': {
      const st: Station[] = [
        { z: 0, w: w * 0.45, h: w * 0.45, y: 0 }, { z: -len * 0.25, w: w * 0.9, h: w * 0.9, y: -len * 0.04 },
        { z: -len * 0.6, w: w, h: w, y: -len * 0.16 }, { z: -len * 0.88, w: w * 0.6, h: w * 0.6, y: -len * 0.28 }, { z: -len, w: w * 0.15, h: w * 0.15, y: -len * 0.33 },
      ];
      return loft(smooth(st, 2), { seg: 10 });
    }
    case 'croc': {
      const st: Station[] = [
        { z: 0, w: w * 1.0, h: w * 0.75, y: 0 }, { z: -len * 0.2, w: w * 0.85, h: w * 0.75, y: 0 }, { z: -len * 0.5, w: w * 0.55, h: w * 0.62, y: 0 },
        { z: -len * 0.8, w: w * 0.28, h: w * 0.5, y: 0 }, { z: -len, w: w * 0.06, h: w * 0.18, y: 0 },
      ];
      const parts: THREE.BufferGeometry[] = [loft(smooth(st, 3), { seg: 12 })];
      for (let i = 0; i < 9; i++) {
        const z = -len * (0.05 + i * 0.1), hh = w * (0.75 - i * 0.055);
        parts.push(spike(w * 0.2, w * 0.1, w * 0.4 * (1 - i * 0.07), 0.5, 5).translate(0, hh * 0.8, z));
      }
      return merge(parts);
    }
    case 'ball':
      return ball(w, w, w, 0, 0, -w * 0.6, 1.5);
    default:
      return curveTube([[0, 0, 0], [0, -0.25 * len, -0.3 * len], [0, -0.7 * len, -0.45 * len]], w, w * 0.35, 1, 6);
  }
}

/** Ears: fur parts merged into the head (the elephant's big ears are separate, animated meshes). */
function earParts(kind: EarKind, size: number, hw: number, hh: number, hl: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (kind === 'none' || kind === 'big') return out;
  for (const s of [-1, 1]) {
    switch (kind) {
      case 'point': out.push(place(spike(hw * 0.5 * size, hw * 0.16 * size, hw * 1.1 * size, 1, 6), s * hw * 0.62, hh * 0.72, -hl * 0.02, -0.15, 0, -s * 0.32)); break;
      case 'round': out.push(ball(hw * 0.4 * size, hw * 0.4 * size, hw * 0.12 * size, s * hw * 0.72, hh * 0.86, -hl * 0.04)); break;
      case 'long': out.push(place(ball(hw * 0.36 * size, hh * 1.25 * size, hw * 0.1 * size, 0, hh * 0.7 * size, 0), s * hw * 0.78, hh * 0.78, -hl * 0.04, -0.2, 0, -s * 0.55)); break;
      case 'flap': out.push(place(ball(hw * 1.05 * size, hh * 0.17 * size, hh * 0.55 * size, s * hw * 0.9 * size, 0, 0), s * hw * 0.55, hh * 0.52, -hl * 0.06, 0, 0, -s * 0.22)); break;
      default: break;
    }
  }
  return out;
}

/** Horns, antlers, tusks, eyes, nose: the accent mesh of the head. */
function headAccessories(sp: Species, s: QuadSpec, variant: number): THREE.BufferGeometry[] {
  const [hl, hw, hh, mz, mw, mh] = s.head;
  const out: THREE.BufferGeometry[] = [];
  const bone = [0.88, 0.84, 0.72], horn = [0.2, 0.16, 0.12], pale = [0.93, 0.9, 0.8];
  const noseY = -hh * (0.1 + 0.18 * mz), tipZ = hl * 0.99;
  const er = Math.max(0.011, hh * 0.15);
  for (const x of [-1, 1]) {
    if (s.eyes === 'side') out.push(ball(er, er, er * 0.8, x * hw * 0.95, hh * 0.3, hl * 0.22, DARK));
    else out.push(ball(er, er * 0.85, er * 0.8, x * hw * 0.55, hh * 0.28, hl * 0.4, [0.78, 0.6, 0.1]), ball(er * 0.45, er * 0.7, er * 0.5, x * hw * 0.55, hh * 0.28, hl * 0.4 + er * 0.5, DARK));
  }
  const nc = sp === 'tiger' || sp === 'lion' || sp === 'leopard' ? [0.5, 0.25, 0.22] : sp === 'cow' || sp === 'buffalo' || sp === 'boar' || sp === 'hippo' ? [0.3, 0.22, 0.22] : DARK;
  out.push(ball(hw * mw * 0.55, hh * mh * 0.4, hl * 0.06, 0, noseY, tipZ, nc));
  const k = hl / 0.3;
  switch (sp) {
    case 'deer':
      if (variant % 3 !== 0) for (const x of [-1, 1]) {
        const b = [x * hw * 0.5, hh * 0.85, -hl * 0.05];
        const p = (dx: number, dy: number, dz: number): number[] => [b[0] + x * dx * k, b[1] + dy * k, b[2] + dz * k];
        out.push(curveTube([b, p(0.02, 0.16, -0.05), p(0.06, 0.34, -0.06), p(0.07, 0.5, 0.0), p(0.05, 0.6, 0.1)], 0.017 * k, 0.007 * k, bone, 6));
        out.push(curveTube([p(0.02, 0.16, -0.05), p(0.03, 0.26, 0.05), p(0.03, 0.34, 0.14)], 0.011 * k, 0.005 * k, bone, 5));
        out.push(curveTube([p(0.06, 0.34, -0.06), p(0.1, 0.42, 0.02), p(0.1, 0.5, 0.1)], 0.01 * k, 0.005 * k, bone, 5));
      }
      break;
    case 'cow':
      for (const x of [-1, 1]) out.push(curveTube([[x * hw * 0.8, hh * 0.78, -hl * 0.04], [x * (hw + 0.07), hh + 0.02, -hl * 0.06], [x * (hw + 0.14), hh + 0.12, -hl * 0.02], [x * (hw + 0.1), hh + 0.24, hl * 0.06]], 0.028, 0.007, pale, 6));
      break;
    case 'buffalo':
      for (const x of [-1, 1]) out.push(curveTube([[x * hw * 0.8, hh * 0.6, -hl * 0.02], [x * (hw + 0.2), hh * 0.7, -hl * 0.2], [x * (hw + 0.42), hh * 0.95, -hl * 0.45], [x * (hw + 0.5), hh * 1.5, -hl * 0.55]], 0.05, 0.01, horn, 7));
      break;
    case 'goat':
      for (const x of [-1, 1]) out.push(curveTube([[x * hw * 0.55, hh * 0.85, -hl * 0.02], [x * hw * 0.8, hh + 0.1, -hl * 0.25], [x * hw * 1.0, hh + 0.17, -hl * 0.65], [x * hw * 1.1, hh + 0.11, -hl * 1.0]], 0.016, 0.005, bone, 6));
      out.push(ball(hw * 0.2, hh * 0.5, hw * 0.2, 0, -hh * 0.6, hl * 0.86, [0.82, 0.76, 0.66]));
      break;
    case 'sheep':
      if (variant % 2 === 0) for (const x of [-1, 1]) out.push(curveTube([[x * hw * 0.6, hh * 0.7, -hl * 0.05], [x * (hw + 0.06), hh * 0.9, -hl * 0.2], [x * (hw + 0.1), hh * 0.5, -hl * 0.35], [x * (hw + 0.04), hh * 0.2, -hl * 0.1]], 0.012, 0.004, bone, 5));
      break;
    case 'giraffe':
      for (const x of [-1, 1]) {
        out.push(spike(0.016, 0.016, 0.12, [0.75, 0.6, 0.4], 6).translate(x * hw * 0.35, hh * 0.85, -hl * 0.05));
        out.push(ball(0.022, 0.022, 0.022, x * hw * 0.35, hh * 0.85 + 0.125, -hl * 0.05, [0.18, 0.12, 0.08]));
      }
      break;
    case 'rhino':
      out.push(place(spike(0.1, 0.1, 0.5, [0.45, 0.4, 0.34], 9), 0, hh * 0.5, hl * 0.74, 0.3));
      out.push(place(spike(0.065, 0.065, 0.2, [0.45, 0.4, 0.34], 8), 0, hh * 0.8, hl * 0.45, 0.15));
      break;
    case 'elephant':
      for (const x of [-1, 1]) out.push(curveTube([[x * hw * 0.38, -hh * 0.5, hl * 0.78], [x * hw * 0.5, -hh * 1.1, hl * 0.95], [x * hw * 0.5, -hh * 1.25, hl * 1.4], [x * hw * 0.34, -hh * 0.95, hl * 1.75]], 0.06, 0.012, pale, 8));
      break;
    case 'boar':
      for (const x of [-1, 1]) out.push(curveTube([[x * hw * mw * 0.55, -hh * 0.45, hl * 0.78], [x * hw * mw * 0.75, -hh * 0.4, hl * 0.88], [x * hw * mw * 0.8, -hh * 0.1, hl * 0.84]], 0.014, 0.004, pale, 5));
      break;
    case 'hippo':
      for (const x of [-1, 1]) {
        out.push(spike(0.04, 0.04, 0.16, pale, 6).translate(x * hw * 0.78, -hh * 0.55, hl * 0.9));
        out.push(ball(er * 1.4, er * 1.2, er * 1.4, x * hw * 0.72, hh * 0.95, hl * 0.2, [0.45, 0.38, 0.36]), ball(0.025, 0.02, 0.03, x * hw * 0.22, hh * 0.28, hl * 0.97, DARK));
      }
      break;
    case 'crocodile':
      for (const x of [-1, 1]) out.push(ball(0.028, 0.03, 0.03, x * hw * 0.62, hh * 0.9, hl * 0.12, [0.6, 0.55, 0.12]));
      for (let i = 0; i < 9; i++) for (const x of [-1, 1]) out.push(spike(0.006, 0.006, 0.02, pale, 4).translate(x * hw * mw * 0.92, -hh * 0.36, hl * (0.38 + i * 0.065)));
      break;
    default:
      break;
  }
  return out;
}

/** A row of short, stiff hairs along the top of the neck (zebra, horse, giraffe). */
function maneRow(len: number, h0: number, h1: number, n: number, k: number, back: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(place(spike(0.02, 0.012, 0.1 + 0.03 * Math.sin(t * 3), k, 5), 0, lerp(h0, h1, t), -0.04 + t * len, back, 0, 0));
  }
  return out;
}

function buildQuad(sp: Species, variant: number): Rig {
  const s = QUAD[sp] as QuadSpec;
  const looks = LOOKS[sp];
  const v = variant % looks.length;
  const key = `${sp}:${v}`;
  const M: Skin = skinOf(key, looks[v]);
  const croc = sp === 'crocodile';
  const T = torso(s);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  group.add(body);
  const L = s.L;

  // ---- torso (+ shoulder mane of the lion, back ridge of the crocodile)
  mesh(body, cachedGeo(`${key}:body`, () => {
    const parts: THREE.BufferGeometry[] = [loft(smooth(T.st, 3), { seg: 16, tile: 1.6 })];
    if (sp === 'lion') parts.push(ball(0.3, 0.28, 0.3, 0, T.top(0.78) - 0.22, -L / 2 + L * 0.78, 0.6));
    if (croc) {
      for (let i = 0; i < 13; i++) {
        const t = 0.06 + i * 0.072, z = -L / 2 + t * L;
        parts.push(spike(0.05, 0.025, 0.07, 0.55, 5).translate(0, T.top(t) - 0.015, z));
        parts.push(spike(0.03, 0.018, 0.05, 0.55, 4).translate(0.1, T.top(t) - 0.03, z), spike(0.03, 0.018, 0.05, 0.55, 4).translate(-0.1, T.top(t) - 0.03, z));
      }
    }
    return merge(parts);
  }), M.fur);

  // ---- neck
  const [nl, nw0, nw1, up] = s.neck;
  const nt = 0.88;
  const neckY = T.top(nt) - T.depth(nt) * 0.55;
  const neck = new THREE.Group();
  neck.position.set(0, neckY, -L / 2 + nt * L);
  neck.rotation.x = -up;
  body.add(neck);
  mesh(neck, cachedGeo(`${key}:neck`, () => {
    const st: Station[] = [
      { z: -nl * 0.3, w: nw0 * 0.95, h: nw0 * 1.2, y: 0 },
      { z: nl * 0.25, w: lerp(nw0, nw1, 0.4), h: lerp(nw0, nw1, 0.4) * 1.25, y: 0 },
      { z: nl * 0.7, w: lerp(nw0, nw1, 0.8), h: lerp(nw0, nw1, 0.8) * 1.15, y: 0 },
      { z: nl, w: nw1, h: nw1 * 1.1, y: 0 },
    ];
    const parts: THREE.BufferGeometry[] = [loft(smooth(st, 3), { seg: 12, tile: 1.6 })];
    const hr = s.head[0];
    if (sp === 'lion') parts.push(ball(hr * 0.78, hr * 0.78, hr * 0.62, 0, 0, nl * 0.9, 0.5), ball(hr * 0.9, hr * 0.7, hr * 0.7, 0, -hr * 0.12, nl * 0.55, 0.5));
    if (sp === 'zebra') parts.push(...maneRow(nl * 0.95, nw0 * 1.25, nw1 * 1.25, 9, 0.12, -0.1));
    if (sp === 'horse') parts.push(...maneRow(nl * 0.95, nw0 * 1.25, nw1 * 1.25, 10, 0.25, -0.5));
    if (sp === 'giraffe') parts.push(...maneRow(nl * 0.97, nw0 * 1.2, nw1 * 1.2, 14, 0.2, -0.1));
    return merge(parts);
  }), M.fur);

  // ---- head
  const [hl, hw, hh, mz, mw, mh, tilt] = s.head;
  const head = new THREE.Group();
  head.position.set(0, 0, nl);
  head.rotation.x = tilt + up;
  neck.add(head);
  const bx = s.boxy ?? 2.4;
  mesh(head, cachedGeo(`${key}:head`, () => {
    const mzY = -hh * 0.28 * mz;
    const st: Station[] = [
      { z: -hl * 0.14, w: hw * 0.7, h: hh * 0.8, y: 0, n: 2.2 },
      { z: hl * 0.08, w: hw, h: hh, y: 0, n: 2.3 },
      { z: hl * (1 - mz), w: hw * (0.55 + 0.45 * mw), h: hh * (0.58 + 0.42 * mh), y: mzY * 0.4, n: Math.max(2.4, bx - 0.4) },
      { z: hl * 0.93, w: hw * mw, h: hh * mh, y: mzY, n: bx },
      { z: hl, w: hw * mw * 0.82, h: hh * mh * 0.8, y: mzY, n: bx },
    ];
    return merge([loft(smooth(st, 3), { seg: 14, tile: 1.2 }), ...earParts(s.ears[0], s.ears[1], hw, hh, hl)]);
  }), M.fur);
  mesh(head, cachedGeo(`${key}:headacc${variant % 3}`, () => merge(headAccessories(sp, s, variant))), M.acc);

  // ---- trunk + big ears of the elephant
  let trunk: THREE.Group[] | undefined;
  let ears: THREE.Group[] | undefined;
  if (sp === 'elephant') {
    trunk = [];
    let parent: THREE.Object3D = head;
    const segL = [0.55, 0.5, 0.42];
    const segW = [0.2, 0.15, 0.1, 0.07];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? -hh * 0.55 : 0, i === 0 ? hl * 0.92 : segL[i - 1]);
      g.rotation.x = [0.7, 0.35, 0.15][i];
      parent.add(g);
      mesh(g, cachedGeo(`${key}:trunk${i}`, () => {
        const st: Station[] = [
          { z: -0.03, w: segW[i] * 1.06, h: segW[i] * 1.06, y: 0 },
          { z: segL[i] * 0.5, w: (segW[i] + segW[i + 1]) / 2, h: (segW[i] + segW[i + 1]) / 2, y: 0 },
          { z: segL[i], w: segW[i + 1], h: segW[i + 1], y: 0 },
        ];
        const parts: THREE.BufferGeometry[] = [loft(smooth(st, 2), { seg: 12, tile: 1.0, caps: i === 2 })];
        if (i === 2) parts.push(ball(segW[3] * 1.1, segW[3] * 0.8, 0.05, 0, -0.01, segL[2], 0.65));
        return merge(parts);
      }), M.fur);
      trunk.push(g);
      parent = g;
    }
    ears = [];
    for (const side of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(side * hw * 0.85, hh * 0.35, -hl * 0.06);
      e.rotation.y = side * 0.42;
      head.add(e);
      mesh(e, cachedGeo(`${key}:ear`, () => ball(0.035, 0.62, 0.5, 0, -0.32, -0.15, 0.82)), M.fur, side * 0.04, 0, 0);
      ears.push(e);
    }
  }

  // ---- tail
  const tail = new THREE.Group();
  const tailY = croc ? T.top(0.1) - 0.15 : Math.max(0.05, T.top(0.1) - T.depth(0.1) * 0.35);
  tail.position.set(0, tailY, -L / 2 + 0.01);
  body.add(tail);
  mesh(tail, cachedGeo(`${key}:tail`, () => tailGeo(s.tail[0], s.tail[1], s.tail[2])), M.fur);

  // ---- legs
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const legRest: number[] = [];
  const kneeRest: number[] = [];
  const tF = 0.77, tH = 0.2;
  const pivotF = T.top(tF) - T.depth(tF) * (croc ? 0.5 : 0.35);
  const pivotH = T.top(tH) - T.depth(tH) * (croc ? 0.5 : 0.3);
  const lwk = s.lw * LEG_K[s.foot];
  const footH = s.foot === 'hoof' ? Math.max(0.02, lwk * 1.35) : s.foot === 'pad' ? lwk * 0.55 : s.foot === 'toe' ? 0.03 : Math.max(0.02, lwk * 0.7);
  const splay = s.splay ?? 0;
  for (let i = 0; i < 4; i++) {
    const front = i < 2, side = i % 2 === 0 ? -1 : 1;
    const pivot = front ? pivotF : pivotH;
    const bend = front ? (s.front ?? 0.04) : (s.hind ?? 0.3);
    const lw = s.lw * LEG_K[s.foot] * (front ? 1 : 1.12);
    let up2: number, lo: number;
    if (croc) {
      up2 = pivot * 0.55;
      lo = Math.max(0.05, pivot - up2 * Math.cos(splay) - footH);
    } else {
      const total = (pivot - footH) / Math.cos(bend);
      up2 = total * (s.legUp ?? 0.46);
      lo = total - up2;
    }
    const hip = new THREE.Group();
    const px = (front ? s.cw : s.rw) * (croc ? 0.5 : 0.31);
    hip.position.set(side * px, pivot, -L / 2 + (front ? tF : tH) * L);
    group.add(hip);
    const thigh = new THREE.Group();
    thigh.rotation.z = side * splay;
    hip.add(thigh);
    const kn = new THREE.Group();
    kn.position.y = -up2;
    kn.rotation.z = -side * splay;
    thigh.add(kn);
    const fk = front ? 'F' : 'H';
    mesh(thigh, cachedGeo(`${key}:up${fk}`, () => {
      const st: Station[] = front
        ? [{ z: 0, w: lw * 1.3, h: lw * 1.5, y: 0 }, { z: up2 * 0.45, w: lw * 1.05, h: lw * 1.25, y: 0 }, { z: up2, w: lw * 0.78, h: lw * 0.85, y: 0 }]
        : [{ z: 0, w: lw * 1.3, h: lw * 1.9, y: -lw * 0.2 }, { z: up2 * 0.4, w: lw * 1.2, h: lw * 1.7, y: -lw * 0.2 }, { z: up2, w: lw * 0.75, h: lw * 0.85, y: 0 }];
      return hang(loft(smooth(st, 2), { seg: 10, tile: 1.4 }));
    }), M.fur);
    mesh(kn, cachedGeo(`${key}:lo${fk}`, () => {
      const st: Station[] = [{ z: 0, w: lw * 0.76, h: lw * 0.86, y: 0 }, { z: lo * 0.4, w: lw * 0.56, h: lw * 0.64, y: 0 }, { z: lo, w: lw * 0.62, h: lw * 0.7, y: 0 }];
      const parts: THREE.BufferGeometry[] = [hang(loft(smooth(st, 2), { seg: 10, tile: 1.4 }))];
      if (s.foot === 'hoof') parts.push(ball(lw * 0.78, footH * 0.55, lw * 1.0, 0, -lo - footH * 0.1, lw * 0.15, 0.22));
      else if (s.foot === 'paw') parts.push(ball(lw * 1.35, footH * 0.75, lw * 2.1, 0, -lo - footH * 0.1, lw * 0.9, 1));
      else if (s.foot === 'pad') parts.push(ball(lw * 1.22, footH * 0.7, lw * 1.3, 0, -lo - footH * 0.05, lw * 0.1, 0.78));
      else parts.push(ball(lw * 1.2, footH * 0.5, lw * 2.6, 0, -lo - footH * 0.1, lw * 1.2, 0.85));
      return merge(parts);
    }), M.fur);
    // standing pose: the thigh points forward-down, the shank back-down (hind legs); front legs are straight pillars
    legRest.push(-bend);
    kneeRest.push(front ? bend * 1.2 : bend * 2);
    hip.rotation.x = -bend;
    kn.rotation.x = kneeRest[i];
    legs.push(hip);
    knees.push(kn);
  }

  const swing = s.swing ?? Math.min(0.62, Math.max(0.2, Math.asin(Math.min(0.9, (0.3 * L) / Math.max(0.2, pivotF)))));
  // how far the neck must go down to reach the ground, and how much the head gives back so the nose points down, not backwards
  const reach = nl + hl * 0.8 + (sp === 'elephant' ? 1.4 : 0);
  const beta = Math.min(1.45, Math.max(0.6, Math.asin(Math.min(0.95, Math.max(0, neckY - 0.12) / reach))));
  const graze = beta + up;
  const headComp = Math.min(0.85, Math.max(0, 1 - (1.3 - tilt) / Math.max(0.3, graze)));
  return {
    kind: croc ? 'croc' : 'quad', group, body, neck, head, tail, legs, knees, legRest, kneeRest,
    hipY: Math.max(pivotF, pivotH), length: L, side: Math.max(s.cw, s.rw) * 0.5 + 0.03,
    neckRest: -up, grazeRange: graze, headRest: tilt + up, headComp, swing, tailHang: s.tail[0] === 'rope',
    trunk, ears, floatDepth: sp === 'hippo' ? 0.95 : sp === 'elephant' ? 1.3 : croc ? 0.16 : 0.5,
  };
}

/** Number of colour variants of a species (the manager picks one at random). */
export function variantCount(sp: Species): number {
  return Math.max(LOOKS[sp].length, sp === 'deer' ? 3 : 1);
}

export function buildAnimal(sp: Species, variant = 0): Rig {
  if (sp === 'chicken' || sp === 'duck' || sp === 'peacock') return buildBird(sp, variant);
  if (sp === 'dolphin') return buildDolphin(variant);
  return buildQuad(sp, variant);
}
