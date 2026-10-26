import * as THREE from 'three';
import { HELI } from './HelicopterSpec';

/**
 * Procedural low-poly helicopter (no model files). Faces +Z, left = +X, origin = fuselage centre.
 * The main rotor and tail rotor spin with the rotor speed; a translucent disc shows the rotor "blur".
 */
export class HelicopterModel {
  readonly root = new THREE.Group();
  private mainRotor = new THREE.Group();
  private tailRotor = new THREE.Group();
  private blurMat: THREE.MeshBasicMaterial;
  private beaconMat: THREE.MeshBasicMaterial;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mainAngle = 0;
  private tailAngle = 0;
  private blink = 0;

  constructor() {
    const L = HELI.look;
    const lambert = (c: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: c, ...extra });
      this.mats.push(m);
      return m;
    };
    const body = lambert(L.body);
    const accent = lambert(L.accent);
    const glass = lambert(L.glass, { emissive: 0x050a10 });
    const dark = lambert(0x2a2d31);

    const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.root) => {
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => {
      const mesh = add(new THREE.BoxGeometry(w, h, l), m, parent);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const ellipsoid = (rx: number, ry: number, rz: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = add(new THREE.SphereGeometry(1, 20, 14), m);
      mesh.scale.set(rx, ry, rz);
      mesh.position.set(x, y, z);
      return mesh;
    };
    /** Cylinder lying along the z axis (radiusFront at +z). */
    const zCyl = (rFront: number, rBack: number, len: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = add(new THREE.CylinderGeometry(rFront, rBack, len, 12), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      return mesh;
    };

    // --- fuselage ---
    ellipsoid(1.0, 0.95, 1.9, body, 0, 0, 0.3); // cabin
    ellipsoid(0.93, 0.72, 1.05, glass, 0, 0.14, 1.2); // windscreen
    box(1.3, 1.15, 1.7, body, 0, 0.1, -1.4); // engine bay
    box(1.32, 0.12, 2.4, accent, 0, -0.1, -0.7); // colour stripe
    zCyl(0.34, 0.12, 4.6, body, 0, 0.18, -4.1); // tail boom
    box(0.08, 1.35, 0.95, accent, 0, 0.75, -6.05); // vertical fin
    box(2.0, 0.06, 0.5, body, 0, 0.2, -5.6); // horizontal stabiliser
    box(0.5, 0.3, 0.9, dark, 0, 1.05, -0.6); // engine intake / gearbox cover

    // --- visible side weapon pods / forward barrels for vehicle-mounted firing ---
    for (const side of [-1, 1]) {
      box(0.25, 0.28, 1.12, dark, side * 1.08, -0.36, 0.15); // pod mount
      const barrel = add(new THREE.CylinderGeometry(0.085, 0.10, 1.0, 10), dark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 1.08, -0.34, 0.92); // points out along the nose
      const muzzle = add(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), accent);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(side * 1.08, -0.34, 1.48);
    }
    // Compact belly hardpoints visually mark the bomb-release system used by the Z action.
    for (const side of [-1, 1]) {
      const store = add(new THREE.CylinderGeometry(0.16, 0.18, 0.72, 10), dark);
      store.rotation.x = Math.PI / 2;
      store.position.set(side * 0.48, -0.82, -0.18);
    }

    // --- skids ---
    for (const sx of [1.05, -1.05]) {
      zCyl(0.05, 0.05, 3.5, dark, sx, -1.2, 0.2);
      box(0.08, 0.85, 0.08, dark, sx * 0.9, -0.8, 0.95);
      box(0.08, 0.85, 0.08, dark, sx * 0.9, -0.8, -0.55);
    }

    // --- main rotor ---
    const mast = add(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 10), dark);
    mast.position.set(0, 1.3, 0.2);
    this.mainRotor.position.set(0, 1.75, 0.2);
    add(new THREE.SphereGeometry(0.24, 12, 8), dark, this.mainRotor);
    box(HELI.rotorRadius * 2, 0.05, 0.34, dark, 0, 0, 0, this.mainRotor);
    box(0.34, 0.05, HELI.rotorRadius * 2, dark, 0, 0, 0, this.mainRotor);
    this.root.add(this.mainRotor);

    this.blurMat = new THREE.MeshBasicMaterial({ color: 0x20262b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.mats.push(this.blurMat);
    const blur = add(new THREE.CircleGeometry(HELI.rotorRadius, 48), this.blurMat, this.root);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(0, 1.78, 0.2);
    blur.castShadow = false;
    blur.receiveShadow = false;

    // --- tail rotor (spins about the x axis) ---
    this.tailRotor.position.set(0.22, 0.75, -6.1);
    box(0.05, 1.5, 0.14, dark, 0, 0, 0, this.tailRotor);
    box(0.05, 0.14, 1.5, dark, 0, 0, 0, this.tailRotor);
    this.root.add(this.tailRotor);

    // --- lights ---
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.mats.push(this.beaconMat);
    const beacon = add(new THREE.SphereGeometry(0.12, 8, 6), this.beaconMat);
    beacon.position.set(0, 1.5, -6.1);
    beacon.castShadow = false;
    const navL = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const navR = new THREE.MeshBasicMaterial({ color: 0x30ff60 });
    this.mats.push(navL, navR);
    add(new THREE.SphereGeometry(0.08, 6, 5), navL).position.set(1.0, 0.2, 0.9); // left (+x) = red
    add(new THREE.SphereGeometry(0.08, 6, 5), navR).position.set(-1.0, 0.2, 0.9); // right = green
  }

  /** rpm: rotor speed 0..1. */
  animate(dt: number, rpm: number): void {
    this.mainAngle += dt * rpm * 26;
    this.tailAngle += dt * rpm * 90;
    this.mainRotor.rotation.y = this.mainAngle;
    this.tailRotor.rotation.x = this.tailAngle;
    this.blurMat.opacity = Math.max(0, Math.min(0.3, (rpm - 0.2) * 0.4));
    this.blink += dt;
    this.beaconMat.color.setHex(Math.sin(this.blink * 7) > 0.6 ? 0xff2020 : 0x300808);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
