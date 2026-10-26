import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Appearance } from './PersonModel';

/**
 * A realistic-shaped low-poly human (no model files): rounded torso with shoulders, neck, an egg-shaped head with
 * face (eyes, brows, nose, mouth, ears), hair, tapered arms with elbows + hands, thighs / knees / shins and shoes.
 *
 * All the shapes are built ONCE and shared by every person (merged per colour slot), so dozens of people are still
 * only ~16 meshes each. Faces +Z, feet at y = 0 when `pivot` sits at y = 0.9. Total height ~1.8 m.
 */

export interface HumanRig {
  /** At the hips. Add to your root group and set `pivot.position.y = 0.9`. */
  pivot: THREE.Group;
  /** Hip joints (swing the whole leg) and knee joints (bend the shin backwards, rotation.x > 0). */
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** Shoulder joints (swing the whole arm) and elbow joints (bend the forearm forwards, rotation.x < 0). */
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
}

/** Where a gun sits in the right forearm group (in the hand). */
export const HAND_GRIP_Y = -0.28;
/** Elbow bend while standing (rad). */
export const ELBOW_REST = -0.12;

/** How far the knee bends while the leg swings forward (the shin kicks back). `left` = left leg. */
export function kneeFlex(phase: number, amp: number, left: boolean): number {
  const c = Math.cos(phase);
  return Math.max(0, left ? -c : c) * amp * 1.3;
}

type V3 = [number, number, number];

const sph = (r: V3, p: V3, seg = 14, rings = 10): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(1, seg, rings);
  g.scale(r[0], r[1], r[2]);
  g.translate(p[0], p[1], p[2]);
  return g;
};

/** Partial sphere (a dome / a chin cup), scaled to an ellipsoid, tilted about X, then moved. */
const cap = (r: V3, p: V3, thetaStart: number, thetaLen: number, phiStart = 0, phiLen = Math.PI * 2, tilt = 0): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(1, 16, 10, phiStart, phiLen, thetaStart, thetaLen);
  g.scale(r[0], r[1], r[2]);
  if (tilt) g.rotateX(tilt);
  g.translate(p[0], p[1], p[2]);
  return g;
};

/** Tapered tube hanging DOWN from y = `top` (a limb segment). */
const limb = (rTop: number, rBot: number, len: number, top = 0, radial = 8): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, radial, 1);
  g.translate(0, top - len / 2, 0);
  return g;
};

// torso outline: [y, radius]; the cross section is an ellipse (x full, z * TORSO_DEPTH)
const TORSO_PROFILE: [number, number][] = [
  [-0.06, 0.17],
  [0.0, 0.18],
  [0.12, 0.165], // waist
  [0.28, 0.2],
  [0.44, 0.222], // chest
  [0.54, 0.205], // shoulders
  [0.6, 0.12],
  [0.64, 0.05], // base of the neck
];
const TORSO_DEPTH = 0.62;

const torsoRadius = (y: number): number => {
  const p = TORSO_PROFILE;
  if (y <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][0]) {
      const t = (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
    }
  }
  return p[p.length - 1][1];
};

/** A thin open ring around the torso at height y (belt / reflective stripe). */
const band = (y: number, height: number, grow: number): THREE.BufferGeometry => {
  const r = torsoRadius(y) + grow;
  const g = new THREE.CylinderGeometry(r, r, height, 18, 1, true);
  g.scale(1, 1, TORSO_DEPTH);
  g.translate(0, y, 0);
  return g;
};

// head: an egg (ellipsoid) centred at HEAD_Y
const HEAD_Y = 0.76;
const HEAD_R: V3 = [0.098, 0.125, 0.11];
const grow = (k: number): V3 => [HEAD_R[0] * k, HEAD_R[1] * k, HEAD_R[2] * k];

interface Geoms {
  shirt: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  skinHead: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  hairBeard: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  stripes: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  helmet: THREE.BufferGeometry;
  topi: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreArm: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  shoe: THREE.BufferGeometry;
}

let cache: Geoms | null = null;

function geoms(): Geoms {
  if (cache) return cache;

  // ---- torso (shirt) + shoulders ----
  const lathe = new THREE.LatheGeometry(
    new THREE.SplineCurve(TORSO_PROFILE.map(([y, r]) => new THREE.Vector2(r, y))).getPoints(16),
    18,
  );
  lathe.scale(1, 1, TORSO_DEPTH);
  const shirt = mergeGeometries([lathe, sph([0.07, 0.07, 0.07], [-0.275, 0.54, 0], 10, 8), sph([0.07, 0.07, 0.07], [0.275, 0.54, 0], 10, 8)], false);

  // ---- hips (pants) ----
  const pelvis = sph([0.185, 0.12, 0.12], [0, -0.05, 0], 14, 8);

  // ---- neck, head, nose, ears (skin) ----
  const neck = new THREE.CylinderGeometry(0.048, 0.054, 0.12, 10, 1);
  neck.translate(0, 0.64, 0);
  const skinHead = mergeGeometries([
    neck,
    sph(HEAD_R, [0, HEAD_Y, 0], 18, 14),
    sph([0.017, 0.022, 0.02], [0, 0.752, 0.106], 8, 6), // nose
    sph([0.014, 0.028, 0.02], [-0.099, 0.765, -0.004], 8, 6), // ears
    sph([0.014, 0.028, 0.02], [0.099, 0.765, -0.004], 8, 6),
  ], false);

  // ---- hair: short cut (tilted dome, nape) + eyebrows ----
  const hairParts = [
    cap(grow(1.07), [0, HEAD_Y + 0.003, -0.004], 0, Math.PI * 0.46, 0, Math.PI * 2, -0.32),
    sph([0.093, 0.08, 0.085], [0, 0.715, -0.035], 10, 7),
    sph([0.022, 0.005, 0.008], [-0.037, 0.796, 0.099], 8, 5), // eyebrows
    sph([0.022, 0.005, 0.008], [0.037, 0.796, 0.099], 8, 5),
  ];
  const hair = mergeGeometries(hairParts, false);
  const hairBeard = mergeGeometries([
    ...hairParts.map((g) => g.clone()),
    cap(grow(1.05), [0, HEAD_Y - 0.003, 0.004], Math.PI * 0.68, Math.PI * 0.32, 0, Math.PI), // chin beard (below the mouth)
  ], false);

  // ---- eyes, mouth, belt (fixed dark colour) ----
  const belt = band(0.02, 0.045, 0.014);
  const dark = mergeGeometries([
    sph([0.012, 0.012, 0.007], [-0.037, 0.775, 0.099], 8, 6),
    sph([0.012, 0.012, 0.007], [0.037, 0.775, 0.099], 8, 6),
    sph([0.022, 0.005, 0.006], [0, 0.712, 0.1], 8, 5),
    belt,
  ], false);

  // ---- high-visibility vest: two horizontal bands plus two vertical front straps ----
  // The vertical straps make the engineer silhouette read more like a real reflective vest.
  const vestStraps = [
    new THREE.BoxGeometry(0.026, 0.31, 0.012),
    new THREE.BoxGeometry(0.026, 0.31, 0.012),
  ];
  vestStraps[0].translate(-0.087, 0.305, 0.128);
  vestStraps[1].translate(0.087, 0.305, 0.128);
  const stripes = mergeGeometries([
    band(0.2, 0.055, 0.016),
    band(0.4, 0.055, 0.016),
    ...vestStraps,
  ], false);

  // ---- headwear ----
  const visor = new THREE.CylinderGeometry(0.105, 0.105, 0.01, 12, 1, false, -Math.PI / 2, Math.PI);
  visor.rotateX(0.12);
  visor.translate(0, 0.815, 0.07);
  const capG = mergeGeometries([cap(grow(1.11), [0, HEAD_Y + 0.01, -0.002], 0, Math.PI * 0.38, 0, Math.PI * 2, -0.12), visor], false);

  const brim = new THREE.CylinderGeometry(0.16, 0.16, 0.016, 18, 1);
  brim.translate(0, 0.812, 0.012);
  const helmet = mergeGeometries([
    cap(grow(1.16), [0, 0.765, 0], 0, Math.PI * 0.42),
    brim,
    sph([0.013, 0.012, 0.12], [0, 0.89, 0], 8, 5), // ridge
  ], false);

  const topi = new THREE.CylinderGeometry(0.09, 0.103, 0.07, 14, 1);
  topi.translate(0, 0.855, 0);

  // ---- arms: sleeve (shirt) / forearm + hand (skin) ----
  const upperArm = limb(0.056, 0.047, 0.3, 0.0);
  const foreArm = mergeGeometries([
    sph([0.044, 0.044, 0.044], [0, 0, 0], 8, 6), // elbow
    limb(0.045, 0.034, 0.24, 0.0, 8),
    sph([0.038, 0.052, 0.026], [0, HAND_GRIP_Y, 0.004], 8, 6), // hand
  ], false);

  // ---- legs: thigh + knee / shin (pants), shoe ----
  const thigh = mergeGeometries([limb(0.09, 0.067, 0.46, 0.0, 10), sph([0.066, 0.066, 0.066], [0, -0.46, 0], 8, 6)], false);
  const shin = limb(0.064, 0.043, 0.36, 0.0, 8);
  const shoe = sph([0.052, 0.05, 0.125], [0, -0.39, 0.045], 10, 7);

  cache = { shirt, pelvis, skinHead, hair, hairBeard, dark, stripes, cap: capG, helmet, topi, upperArm, foreArm, thigh, shin, shoe };
  return cache;
}

/**
 * Build the body of one person with the given look. `mat(colour)` supplies (shared or owned) materials.
 * The geometry is shared and must NOT be disposed by the caller.
 */
export function buildHuman(look: Appearance, mat: (colour: number) => THREE.Material): HumanRig {
  const g = geoms();
  const bodyType = look.bodyType ?? 'average';
  // Use mild proportion differences rather than scaling the complete rig. This keeps
  // hands, feet, pivots, and walking animations lined up while avoiding cloned bodies.
  const proportions = bodyType === 'slim'
    ? { torsoX: 0.91, torsoZ: 0.94, armX: 0.91, armZ: 0.94, legX: 0.92, legZ: 0.95, shoulder: 0.96, headX: 0.98, headZ: 0.98 }
    : bodyType === 'stocky'
      ? { torsoX: 1.12, torsoZ: 1.10, armX: 1.10, armZ: 1.08, legX: 1.08, legZ: 1.06, shoulder: 1.08, headX: 1.03, headZ: 1.02 }
      : { torsoX: 1, torsoZ: 1, armX: 1, armZ: 1, legX: 1, legZ: 1, shoulder: 1, headX: 1, headZ: 1 };
  const mesh = (geo: THREE.BufferGeometry, colour: number, shadow = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat(colour));
    m.castShadow = shadow;
    return m;
  };

  const pivot = new THREE.Group();
  const shirt = mesh(g.shirt, look.shirt);
  shirt.scale.set(proportions.torsoX, 1, proportions.torsoZ);
  pivot.add(shirt);
  const pelvis = mesh(g.pelvis, look.pants);
  pelvis.scale.set(proportions.torsoX * 1.02, 1, proportions.torsoZ * 1.02);
  pivot.add(pelvis);

  // Keep the face and all headwear in one group so hats follow the subtle head-shape change.
  const head = new THREE.Group();
  head.scale.set(proportions.headX, 1, proportions.headZ);
  head.add(mesh(g.skinHead, look.skin));
  head.add(mesh(look.beard ? g.hairBeard : g.hair, look.hair, false));
  head.add(mesh(g.dark, 0x1c1612, false));
  if (look.headwear === 'cap') head.add(mesh(g.cap, look.headwearColor, false));
  else if (look.headwear === 'helmet') head.add(mesh(g.helmet, look.headwearColor, false));
  else if (look.headwear === 'topi') head.add(mesh(g.topi, look.headwearColor, false));
  pivot.add(head);
  if (look.vest) pivot.add(mesh(g.stripes, 0xe5e4d7, false));

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const foreL = new THREE.Group();
  const foreR = new THREE.Group();
  for (const [arm, fore, sx] of [[armL, foreL, -1], [armR, foreR, 1]] as const) {
    arm.position.set(sx * 0.29 * proportions.shoulder, 0.55, 0);
    arm.scale.set(proportions.armX, 1, proportions.armZ);
    arm.add(mesh(g.upperArm, look.shirt));
    fore.position.set(0, -0.29, 0);
    fore.rotation.x = ELBOW_REST;
    fore.add(mesh(g.foreArm, look.skin, false));
    arm.add(fore);
    pivot.add(arm);
  }

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const shinL = new THREE.Group();
  const shinR = new THREE.Group();
  for (const [leg, shin, sx] of [[legL, shinL, -1], [legR, shinR, 1]] as const) {
    leg.position.set(sx * 0.11 * proportions.legX, 0, 0);
    leg.scale.set(proportions.legX, 1, proportions.legZ);
    leg.add(mesh(g.thigh, look.pants));
    shin.position.set(0, -0.46, 0);
    shin.add(mesh(g.shin, look.pants));
    shin.add(mesh(g.shoe, look.shoes, false));
    leg.add(shin);
    pivot.add(leg);
  }

  return { pivot, legL, legR, shinL, shinR, armL, armR, foreL, foreR };
}
