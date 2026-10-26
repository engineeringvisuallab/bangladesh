import * as THREE from 'three';
import type { WeaponId } from './Weapons';
import { weaponSpec } from './Weapons';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const DARK = new THREE.MeshLambertMaterial({ color: 0x1d1f23 });
const METAL = new THREE.MeshLambertMaterial({ color: 0x4a4f57 });
const WOOD = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x111820 });

const SIDEARMS = new Set<WeaponId>(['pistol', 'combatPistol', 'heavyPistol', 'revolver']);
const COMPACT = new Set<WeaponId>(['microSmg', 'smg']);
const RIFLES = new Set<WeaponId>(['ak47', 'carbineRifle', 'sniperRifle']);

/**
 * Procedural low-poly weapon silhouettes. The barrel follows the character's existing local -Y convention.
 * These are intentionally stylised game props rather than detailed real-world weapon replicas.
 */
export function makeGun(id: WeaponId): THREE.Group {
  const len = weaponSpec(id).gunLength;
  const g = new THREE.Group();
  const part = (m: THREE.Material, w: number, l: number, h: number, y: number, z: number, x = 0) => {
    const mesh = new THREE.Mesh(BOX, m);
    mesh.scale.set(w, l, h);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };

  // Core receiver and barrel.
  part(DARK, SIDEARMS.has(id) ? 0.075 : 0.09, len * 0.55, 0.09, -len * 0.43, 0);
  part(METAL, 0.027, len * (id === 'sniperRifle' ? 0.78 : 0.55), 0.027, -len * 0.9, 0.018);
  part(DARK, 0.032, len * 0.2, 0.032, -len * 1.2, 0.02); // muzzle
  part(DARK, 0.043, 0.09, 0.115, -0.06, -0.075); // grip
  part(METAL, 0.024, 0.07, 0.028, -len * 0.25, 0.05); // sight rail

  if (SIDEARMS.has(id)) {
    // Squared slide, trigger guard and a slightly different silhouette for the revolver.
    part(id === 'revolver' ? METAL : DARK, 0.078, len * 0.36, 0.062, -len * 0.48, 0.035);
    part(METAL, 0.035, 0.06, 0.034, -len * 0.45, -0.02, 0.035);
    if (id === 'revolver') {
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.075, 8), METAL);
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.set(0, -len * 0.38, 0.045);
      cylinder.castShadow = true;
      g.add(cylinder);
      part(WOOD, 0.055, 0.10, 0.085, -0.04, -0.095); // revolver grip panels
    } else {
      part(DARK, 0.055, 0.075, 0.095, -0.055, -0.085); // magazine base
    }
  }

  if (COMPACT.has(id)) {
    // Compact SMG: short stock, vertical magazine and broad foregrip.
    part(DARK, 0.055, len * 0.34, 0.07, -len * 0.46, -0.06);
    part(METAL, 0.052, len * 0.18, 0.09, -len * 0.64, -0.035); // vertical magazine
    part(DARK, 0.035, len * 0.25, 0.055, -len * 0.05, -0.015); // compact stock
    if (id === 'smg') part(DARK, 0.035, len * 0.22, 0.055, -len * 1.0, -0.01);
  }

  if (RIFLES.has(id)) {
    const wood = id === 'ak47';
    const furniture = wood ? WOOD : DARK;
    part(furniture, 0.085, len * 0.36, 0.11, -len * 0.22, -0.025); // handguard
    part(furniture, 0.065, len * 0.32, 0.09, -len * 0.05, -0.08); // stock
    part(DARK, 0.055, len * 0.28, 0.13, -len * 0.55, -0.09); // magazine
    part(METAL, 0.045, len * 0.14, 0.045, -len * 0.68, -0.015); // front sight
    if (id === 'sniperRifle') {
      part(DARK, 0.035, len * 0.28, 0.035, -len * 0.34, 0.08); // scope tube
      part(METAL, 0.06, 0.04, 0.06, -len * 0.34, 0.08); // scope ring
      part(DARK, 0.018, len * 0.2, 0.025, -len * 0.75, -0.035); // bipod silhouette
    }
  }

  if (id === 'shotgun') {
    part(WOOD, 0.07, len * 0.34, 0.085, -len * 0.12, -0.055); // stock
    part(WOOD, 0.065, len * 0.32, 0.07, -len * 0.62, -0.025); // pump
    part(METAL, 0.034, len * 0.25, 0.034, -len * 0.92, 0.02); // long barrel accent
  }

  // A tiny optic on the carbine / AK family makes the long guns easier to distinguish in third person.
  if (id === 'carbineRifle' || id === 'ak47') part(GLASS, 0.035, 0.08, 0.045, -len * 0.25, 0.075);
  return g;
}
