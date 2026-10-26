import * as THREE from 'three';
import { makeGun } from '../combat/GunModel';
import type { WeaponId } from '../combat/Weapons';
import { ENGINEER_LOOK } from '../people/PersonModel';
import { buildHuman, kneeFlex, ELBOW_REST, HAND_GRIP_Y } from '../people/HumanBody';

export type PlayerState = 'idle' | 'walk' | 'run' | 'air' | 'swim' | 'wade';

/**
 * The procedural engineer: realistic-shaped body (see people/HumanBody.ts), yellow safety helmet, orange vest, blue trousers.
 * No model files needed. Faces +Z, feet at y = 0, 1.8 m tall. Walk / run / jump / swim animation.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  private pivot: THREE.Group; // at the hips; tilts forward when swimming
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shinL: THREE.Group;
  private shinR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private foreL: THREE.Group;
  private foreR: THREE.Group;
  private phase = 0;
  private swimBlend = 0;
  private gun: THREE.Group | null = null;
  private gunId: WeaponId | null = null;
  private aiming = false;
  private mats: THREE.Material[] = [];

  constructor() {
    const rig = buildHuman(ENGINEER_LOOK, (c) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    });
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
    this.root.add(this.pivot);
  }

  /** Gun in the right hand (null = hands empty). */
  setGun(id: WeaponId | null): void {
    if (id === this.gunId) return;
    if (this.gun) {
      this.foreR.remove(this.gun);
      this.gun = null;
    }
    this.gunId = id;
    if (id) {
      this.gun = makeGun(id);
      this.gun.position.set(0, HAND_GRIP_Y, 0);
      this.foreR.add(this.gun);
    }
  }

  /** Both arms raised, pointing the gun where the camera looks. */
  setAiming(on: boolean): void {
    this.aiming = on;
  }

  /** Face direction (radians, rotation about Y; 0 = +Z). */
  setHeading(heading: number, dt: number): void {
    let d = heading - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, 12 * dt);
  }

  update(dt: number, horizSpeed: number, state: PlayerState): void {
    const k = Math.min(1, 14 * dt);
    const ease = (g: THREE.Object3D, target: number) => {
      g.rotation.x += (target - g.rotation.x) * k;
    };
    this.swimBlend += ((state === 'swim' ? 1 : 0) - this.swimBlend) * Math.min(1, 8 * dt);
    this.pivot.rotation.x = this.swimBlend * 1.25;

    if (state === 'walk' || state === 'run' || state === 'wade') {
      this.phase += dt * (3 + horizSpeed * 0.9);
      const amp = state === 'run' ? 0.95 : 0.55;
      const s = Math.sin(this.phase);
      ease(this.legL, s * amp);
      ease(this.legR, -s * amp);
      ease(this.shinL, kneeFlex(this.phase, amp, true));
      ease(this.shinR, kneeFlex(this.phase, amp, false));
      ease(this.armL, -s * amp * 0.9);
      ease(this.armR, s * amp * 0.9);
      const elbow = state === 'run' ? -1.0 : -0.3;
      ease(this.foreL, elbow);
      ease(this.foreR, this.gun ? -0.1 : elbow);
    } else if (state === 'air') {
      ease(this.legL, -0.6);
      ease(this.legR, 0.35);
      ease(this.shinL, 0.3);
      ease(this.shinR, 0.8);
      ease(this.armL, -0.9);
      ease(this.armR, -0.9);
      ease(this.foreL, -0.4);
      ease(this.foreR, this.gun ? -0.1 : -0.4);
    } else if (state === 'swim') {
      this.phase += dt * 4;
      ease(this.armL, this.phase % (Math.PI * 2) - Math.PI);
      this.armR.rotation.x = this.armL.rotation.x + Math.PI;
      ease(this.legL, Math.sin(this.phase * 3) * 0.35);
      ease(this.legR, -Math.sin(this.phase * 3) * 0.35);
      ease(this.shinL, 0.25 + Math.max(0, -Math.sin(this.phase * 3)) * 0.3);
      ease(this.shinR, 0.25 + Math.max(0, Math.sin(this.phase * 3)) * 0.3);
      ease(this.foreL, -0.15);
      ease(this.foreR, -0.15);
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
    if (this.aiming && state !== 'swim') {
      ease(this.armR, -1.5);
      ease(this.armL, -1.25);
      ease(this.foreR, 0);
      ease(this.foreL, -0.15);
    }
  }

  /** The body geometry is shared by everyone (HumanBody.ts): only the materials belong to this model. */
  dispose(): void {
    for (const m of this.mats) m.dispose();
  }
}
