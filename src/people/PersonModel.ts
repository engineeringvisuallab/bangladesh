import * as THREE from 'three';
import { makeGun } from '../combat/GunModel';
import type { WeaponId } from '../combat/Weapons';
import { buildHuman, kneeFlex, ELBOW_REST, HAND_GRIP_Y } from './HumanBody';

/** Everything that makes one person look different from another. */
export interface Appearance {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  /** Body height scale (1 = 1.8 m). */
  scale: number;
  headwear: 'none' | 'cap' | 'helmet' | 'topi';
  headwearColor: number;
  /** Reflective vest (site workers / engineer). */
  vest: boolean;
  /** Short beard on the chin (optional, default none). */
  beard?: boolean;
  /** Small per-person proportion variation; omitted looks use average proportions. */
  bodyType?: 'slim' | 'average' | 'stocky';
}

export type PersonMode = 'idle' | 'walk' | 'run';

/**
 * Work poses (farm fields): an overlay on the idle / walk animation, driven by PersonModel.setWork.
 * plant = bent over planting seedlings, weed = bent over scratching the soil, cut = bent, sickle in the right hand,
 * hoe = digging / chopping, pick = reaching up to fruit, carry = basket on the head, spray = knapsack sprayer, sow = broadcasting seed, tend = spade.
 */
export type WorkPose = 'plant' | 'weed' | 'cut' | 'hoe' | 'pick' | 'carry' | 'spray' | 'sow' | 'tend';

const SKIN = [0xc68e6b, 0xb87a56, 0xa86f4c, 0xd2a07c, 0x8d5a3c, 0x9a6642];
const HAIR = [0x111111, 0x1b1410, 0x2a1d14, 0x3a2a1c];
const SHIRT = [0xf1f1ec, 0x3b6ea8, 0x2f7d5b, 0x8c2f3a, 0x6b6f76, 0xd98b2b, 0x4a4a9a, 0xb5a642, 0x2b2f36, 0xc9c0a8];
const PANTS = [0x23262d, 0x2f4a7a, 0x6a5a45, 0x3a3a3a, 0x1c2a44, 0x8a8068];
const SHOES = [0x1a1a1a, 0x3a2a1a, 0x4a4a4a];
const CAP = [0x1c3b6e, 0x8c2f3a, 0xf1f1ec, 0x2b2f36];

const pick = <T,>(a: T[], r: () => number): T => a[Math.floor(r() * a.length) % a.length];

/** A random everyday person (seeded by the caller's random function). */
export function randomAppearance(r: () => number): Appearance {
  const archetype = r();
  const skin = pick(SKIN, r);
  const hair = pick(HAIR, r);
  const bodyRoll = r();
  const bodyType: NonNullable<Appearance['bodyType']> = bodyRoll < 0.24 ? 'slim' : bodyRoll < 0.76 ? 'average' : 'stocky';
  const height = 0.92 + r() * 0.14;

  // Keep a few recognizable silhouettes from the supplied reference: site engineer,
  // traditional topi wearer, cap-wearing pedestrian, and a plain/casual pedestrian.
  // Leave a fifth of the population freely randomized so the city does not look cloned.
  if (archetype < 0.18) {
    return {
      skin, hair: 0x211b16, shirt: 0xff7519, pants: pick([0x17477c, 0x204d83, 0x2f4a7a], r),
      shoes: 0x242424, scale: height, headwear: 'helmet', headwearColor: 0xffd21f,
      vest: true, beard: r() < 0.18, bodyType,
    };
  }
  if (archetype < 0.37) {
    return {
      skin, hair, shirt: pick([0x2f7d5b, 0x347b5a, 0x4a8065], r),
      pants: pick([0x202c3d, 0x303b4a, 0x2f4a7a], r), shoes: pick([0x28231f, 0x3a2a1a], r),
      scale: height, headwear: 'topi', headwearColor: pick([0xf2efe6, 0xe4dfd0], r),
      vest: false, beard: r() < 0.68, bodyType,
    };
  }
  if (archetype < 0.56) {
    return {
      skin, hair, shirt: pick([0x244a74, 0x233f68, 0x2d5f89], r),
      pants: pick([0x252a31, 0x30343b, 0x333c49], r), shoes: pick([0x232323, 0x444444], r),
      scale: height, headwear: 'cap', headwearColor: pick([0xf1f1ec, 0xe5e5df, 0x2b2f36], r),
      vest: false, beard: r() < 0.12, bodyType,
    };
  }
  if (archetype < 0.76) {
    return {
      skin, hair, shirt: pick([0xc9c0a8, 0xe2dbca, 0xd5d0c5], r),
      pants: pick([0x2f4a7a, 0x31537c, 0x293b50], r), shoes: pick([0x292725, 0x3a2a1a], r),
      scale: height, headwear: 'none', headwearColor: 0xf1f1ec,
      vest: false, beard: r() < 0.16, bodyType,
    };
  }

  const roll = r();
  return {
    skin,
    hair,
    shirt: pick(SHIRT, r),
    pants: pick(PANTS, r),
    shoes: pick(SHOES, r),
    scale: height,
    headwear: roll < 0.12 ? 'topi' : roll < 0.3 ? 'cap' : 'none',
    headwearColor: roll < 0.12 ? 0xf2efe6 : pick(CAP, r),
    vest: false,
    beard: r() < 0.18,
    bodyType,
  };
}

/** The player's own look (yellow helmet, orange vest) - used when the player sits in a vehicle. */
export const ENGINEER_LOOK: Appearance = {
  skin: 0xe0b08a,
  hair: 0x2a1d14,
  shirt: 0xff7a1a,
  pants: 0x2f4a7a,
  shoes: 0x3a2a1a,
  scale: 1,
  headwear: 'helmet',
  headwearColor: 0xffd21f,
  vest: true,
  bodyType: 'average',
};

// ---- shared materials (dozens of people, a handful of GPU objects; the body geometry is shared in HumanBody.ts) ----
const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number): THREE.MeshLambertMaterial => {
  let m = mats.get(c);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c });
    mats.set(c, m);
  }
  return m;
};

/**
 * How a seated person sits (radians; see PersonModel.setSeated). `lean` tips the whole upper body forward about the hips,
 * `thigh` / `arm` are measured from straight down in the WORLD (negative = swung forward), `knee` bends the shin back
 * relative to the thigh, `elbow` bends the forearm forward (default -0.3), `spread` is the half distance between the hips.
 */
export interface SeatPose {
  lean: number;
  thigh: number;
  knee: number;
  arm: number;
  spread: number;
  elbow?: number;
}

/** Car / bus / rickshaw seat: upright, legs straight forward (shins down), hands on the wheel. */
export const SIT_POSE: SeatPose = { lean: 0, thigh: -1.45, knee: 1.5, arm: -1.15, spread: 0.11, elbow: -0.3 };
/** Sport-bike rider: tucked forward onto the clip-on bars, knees gripping the tank, feet on the rear-set pegs. */
export const BIKE_RIDER_POSE: SeatPose = { lean: 0.72, thigh: -0.88, knee: 1.76, arm: -0.59, spread: 0.17, elbow: -0.15 };
/** Pillion: sits more upright behind the rider, hands on his waist. */
export const BIKE_PILLION_POSE: SeatPose = { lean: 0.4, thigh: -0.66, knee: 1.32, arm: -0.9, spread: 0.16, elbow: -0.3 };

/**
 * Procedural realistic-shaped person (no model files): rounded torso, neck, face, hair, tapered arms with elbows
 * and hands, thighs / knees / shins and shoes (see HumanBody.ts). Faces +Z, feet at y = 0 when standing.
 * `setSeated(true)` puts the hips at the model origin with legs forward and hands on the wheel (for drivers).
 */
export class PersonModel {
  readonly root = new THREE.Group();
  private pivot: THREE.Group; // at the hips
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shinL: THREE.Group;
  private shinR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private foreL: THREE.Group;
  private foreR: THREE.Group;
  private phase = Math.random() * 6;
  private seated = false;
  /** Shoes live in their own joint at the ankle (built on first use) so a bike rider's soles can stay flat on the pegs. */
  private footL: THREE.Group | null = null;
  private footR: THREE.Group | null = null;
  private legRestX = 0.11;
  private gun: THREE.Group | null = null;
  private aiming = false;
  private fall = 0; // 0 = standing ... 1 = lying on the ground
  private work: WorkPose | null = null;
  private workT = Math.random() * 6;
  private fallTarget = 0;

  constructor(readonly look: Appearance) {
    const rig = buildHuman(look, mat);
    this.pivot = rig.pivot;
    this.legL = rig.legL;
    this.legR = rig.legR;
    this.shinL = rig.shinL;
    this.shinR = rig.shinR;
    this.armL = rig.armL;
    this.armR = rig.armR;
    this.foreL = rig.foreL;
    this.foreR = rig.foreR;
    this.pivot.position.y = 0.9;
    this.legRestX = this.legR.position.x;
    this.root.add(this.pivot);
    this.root.scale.setScalar(look.scale);
  }

  /** Put a gun in the right hand (null = no gun). */
  setGun(id: WeaponId | null): void {
    if (this.gun) {
      this.foreR.remove(this.gun);
      this.gun = null;
    }
    if (id) {
      this.gun = makeGun(id);
      this.gun.position.set(0, HAND_GRIP_Y, 0);
      this.foreR.add(this.gun);
    }
  }

  /** Arm raised, pointing the gun forward. */
  setAiming(on: boolean): void {
    this.aiming = on;
  }

  /** A work pose (farm work) on top of the walk / idle animation; null = normal again. */
  setWork(w: WorkPose | null): void {
    this.work = w;
  }

  get working(): WorkPose | null {
    return this.work;
  }

  /** Fall down (true) / stand up (false). Animated in update(). */
  setDead(dead: boolean): void {
    this.fallTarget = dead ? 1 : 0;
    if (dead) this.aiming = false;
  }

  get isSeated(): boolean {
    return this.seated;
  }

  /** Moves each shoe out of its shin into an ankle joint (looks identical until the foot is rotated). */
  private splitFeet(): void {
    if (this.footL) return;
    for (const shin of [this.shinL, this.shinR]) {
      const shoe = shin.children[1] as THREE.Mesh; // shin mesh = children[0], shoe mesh = children[1] (see HumanBody.buildHuman)
      const foot = new THREE.Group();
      foot.position.y = -0.36; // the ankle: end of the shin
      shin.add(foot);
      foot.add(shoe); // add() re-parents
      shoe.position.y = 0.36; // keeps the shoe exactly where it was
      if (shin === this.shinL) this.footL = foot;
      else this.footR = foot;
    }
  }

  setSeated(on: boolean, pose: SeatPose = SIT_POSE): void {
    this.seated = on;
    this.pivot.position.y = on ? 0 : 0.9;
    const tucked = on && pose.lean !== 0;
    if (tucked) this.splitFeet();
    if (on) {
      this.pivot.rotation.x = pose.lean;
      // legs / arms hang from the (tipped) upper body, so their angles are relative to the lean
      this.legL.rotation.x = this.legR.rotation.x = pose.thigh - pose.lean;
      this.shinL.rotation.x = this.shinR.rotation.x = pose.knee; // knees bent
      this.armL.rotation.x = this.armR.rotation.x = pose.arm - pose.lean;
      this.foreL.rotation.x = this.foreR.rotation.x = pose.elbow ?? -0.3;
    } else {
      if (this.fall === 0) this.pivot.rotation.x = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.shinL.rotation.x = this.shinR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.foreL.rotation.x = this.foreR.rotation.x = ELBOW_REST;
    }
    // car seats keep the body-type leg spacing; only the bike poses set their own (wider) hip spread
    const spread = on && pose !== SIT_POSE ? pose.spread : this.legRestX;
    this.legL.position.x = -spread;
    this.legR.position.x = spread;
    if (this.footL && this.footR) {
      // keep the soles flat whatever the leg does: total world angle of the shin = thigh + knee (+ lean is already inside `thigh`)
      this.footL.rotation.x = this.footR.rotation.x = on && tucked ? -(pose.thigh + pose.knee) : 0;
    }
  }

  /** Smoothly turn to face `heading` (radians about Y, 0 = +Z). */
  setHeading(heading: number, dt: number): void {
    let d = heading - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, 10 * dt);
  }

  update(dt: number, speed: number, mode: PersonMode): void {
    if (this.seated) return;
    if (this.fall !== this.fallTarget) {
      this.fall += Math.sign(this.fallTarget - this.fall) * Math.min(Math.abs(this.fallTarget - this.fall), dt * 3);
      this.pivot.rotation.x = -Math.PI / 2 * this.fall; // falls on its back
      this.pivot.position.y = 0.9 + (0.14 - 0.9) * this.fall;
    }
    if (this.fall > 0) return; // lying: no walking animation
    const k = Math.min(1, 14 * dt);
    const ease = (g: THREE.Object3D, target: number) => {
      g.rotation.x += (target - g.rotation.x) * k;
    };
    if (mode === 'walk' || mode === 'run') {
      this.phase += dt * (3 + speed * 0.9);
      const amp = mode === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      ease(this.legL, s * amp);
      ease(this.legR, -s * amp);
      ease(this.shinL, kneeFlex(this.phase, amp, true));
      ease(this.shinR, kneeFlex(this.phase, amp, false));
      ease(this.armL, -s * amp * 0.9);
      ease(this.armR, s * amp * 0.9);
      const elbow = mode === 'run' ? -1.0 : -0.3;
      ease(this.foreL, elbow);
      ease(this.foreR, this.gun ? -0.1 : elbow);
    } else {
      ease(this.legL, 0);
      ease(this.legR, 0);
      ease(this.shinL, 0);
      ease(this.shinR, 0);
      ease(this.armL, 0);
      ease(this.armR, 0);
      ease(this.foreL, ELBOW_REST);
      ease(this.foreR, this.gun ? -0.05 : ELBOW_REST);
    }
    if (this.work) this.applyWork(dt);
    else if (Math.abs(this.pivot.rotation.x) > 0.002) ease(this.pivot, 0);
    if (this.aiming) {
      ease(this.armR, -1.5);
      ease(this.armL, -1.25);
      ease(this.foreR, 0);
      ease(this.foreL, -0.15);
    } else if (this.gun && mode === 'idle') {
      ease(this.armR, -0.35); // gun held low
    }
  }

  /** Farm work: tilts the body about the hips and moves the arms / legs of the current WorkPose (angles relative to the tipped body). */
  private applyWork(dt: number): void {
    const w = this.work!;
    this.workT += dt;
    const t = this.workT;
    const k = Math.min(1, 9 * dt);
    const to = (g: THREE.Object3D, v: number) => {
      g.rotation.x += (v - g.rotation.x) * k;
    };
    let lean = 0;
    let aL = 0;
    let aR = 0;
    let fL = ELBOW_REST;
    let fR = ELBOW_REST;
    let legs = false; // bent poses: legs stay upright (counter the lean) and stand still
    switch (w) {
      case 'plant':
        lean = 1.12 + Math.sin(t * 1.3) * 0.06; aL = -0.35 - Math.sin(t * 2.4) * 0.4; aR = -0.35 + Math.sin(t * 2.4) * 0.4; fL = fR = -0.25; legs = true; break;
      case 'weed':
        lean = 1.0 + Math.sin(t * 1.1) * 0.05; aL = -0.4 + Math.sin(t * 3) * 0.3; aR = -0.4 - Math.sin(t * 3) * 0.3; fL = fR = -0.2; legs = true; break;
      case 'cut':
        lean = 0.95 + Math.sin(t * 1.6) * 0.07; aL = -0.85; fL = -0.5; aR = -0.45 + Math.sin(t * 3.2) * 0.65; fR = -0.9 + Math.sin(t * 3.2) * 0.35; legs = true; break;
      case 'hoe':
        lean = 0.35 + Math.max(0, Math.sin(t * 2.6)) * 0.35; aL = aR = -1.75 + Math.sin(t * 2.6) * 1.05; fL = fR = -0.35; break;
      case 'pick':
        lean = -0.06; aR = -2.55 + Math.sin(t * 1.7) * 0.3; fR = -0.25; aL = -0.7; fL = -1.3; break;
      case 'carry':
        aL = aR = -2.75; fL = fR = -1.35; break;
      case 'spray':
        lean = 0.1; aR = -1.35 + Math.sin(t * 3.1) * 0.25; fR = -0.3; aL = -0.2; break;
      case 'sow':
        lean = 0.18; aR = -0.5 + Math.sin(t * 2.2) * 0.95; fR = -0.55; aL = -0.35; fL = -0.9; break;
      case 'tend':
        lean = 0.3; aL = aR = -0.85 + Math.sin(t * 1.4) * 0.25; fL = fR = -0.55; break;
    }
    to(this.pivot, lean);
    if (legs) {
      to(this.legL, -lean);
      to(this.legR, -lean);
      to(this.shinL, 0);
      to(this.shinR, 0);
    }
    to(this.armL, aL - lean);
    to(this.armR, aR - lean);
    to(this.foreL, fL);
    to(this.foreR, fR);
  }
}
