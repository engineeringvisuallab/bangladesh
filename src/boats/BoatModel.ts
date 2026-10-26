import * as THREE from 'three';
import { BOAT } from './BoatSpec';

/** Hull outline seen from above: [x, z] pairs, stern at -z, bow at +z. */
const OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0.85, -2.7], [1.0, -1.8], [1.0, 0.6], [0.85, 1.7], [0.45, 2.5], [0, 2.85],
  [-0.45, 2.5], [-0.85, 1.7], [-1.0, 0.6], [-1.0, -1.8], [-0.85, -2.7],
];

/**
 * Procedural low-poly speedboat (no model files). Faces +Z, left = +X, origin = hull centre.
 * The outboard swings with the rudder, the propeller spins with the throttle, the wheel turns.
 */
export class BoatModel {
  readonly root = new THREE.Group();
  private outboard = new THREE.Group();
  private prop = new THREE.Group();
  private wheel = new THREE.Group();
  private blurMat: THREE.MeshBasicMaterial;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private propAngle = 0;

  constructor() {
    const L = BOAT.look;
    const lambert = (c: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: c, ...extra });
      this.mats.push(m);
      return m;
    };
    const hull = lambert(L.hull);
    const bottom = lambert(L.bottom);
    const accent = lambert(L.accent);
    const deck = lambert(L.deck);
    const glass = lambert(L.glass, { emissive: 0x050a10, transparent: true, opacity: 0.75 });
    const dark = lambert(0x2a2d31);
    const seatMat = lambert(0x3a3f46);

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

    /** Extruded hull outline. `shrink` > 1 makes it a little wider; a hole gives the open tub. */
    const ring = (scale: number, y0: number, height: number, m: THREE.Material, hollow: boolean) => {
      const shape = new THREE.Shape();
      // after rotateX(-90deg): shape y -> -z, extrusion (+z) -> +y
      OUTLINE.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x * scale, -z * scale) : shape.lineTo(x * scale, -z * scale)));
      shape.closePath();
      if (hollow) {
        const hole = new THREE.Path();
        OUTLINE.forEach(([x, z], i) => (i === 0 ? hole.moveTo(x * 0.84, -z * 0.9 + 0.0) : hole.lineTo(x * 0.84, -z * 0.9 + 0.0)));
        hole.closePath();
        shape.holes.push(hole);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, y0, 0);
      return add(g, m);
    };
    const top = BOAT.keelY + 0.7;
    ring(1.0, BOAT.keelY, 0.7, hull, true); // open tub
    ring(1.006, BOAT.keelY, 0.3, bottom, true); // anti-fouling paint below the waterline
    ring(1.012, top - 0.09, 0.09, accent, true); // gunwale stripe
    // floor
    const floor = (() => {
      const shape = new THREE.Shape();
      OUTLINE.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x * 0.86, -z * 0.9) : shape.lineTo(x * 0.86, -z * 0.9)));
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, BOAT.keelY + 0.22, 0);
      return add(g, deck);
    })();
    floor.castShadow = false;

    // --- console, windscreen, seats ---
    box(1.3, 0.5, 0.55, hull, 0, 0.12, 0.55); // dashboard console
    box(1.34, 0.05, 0.6, accent, 0, 0.39, 0.55);
    const screen = box(1.4, 0.55, 0.04, glass, 0, 0.72, 0.85);
    screen.rotation.x = -0.45;
    box(0.05, 0.6, 0.05, dark, 0.68, 0.7, 0.86).rotation.x = -0.45;
    box(0.05, 0.6, 0.05, dark, -0.68, 0.7, 0.86).rotation.x = -0.45;
    box(0.55, 0.18, 0.5, seatMat, -0.35, -0.02, -0.25); // driver seat
    box(0.55, 0.36, 0.1, seatMat, -0.35, 0.16, -0.5);
    box(0.55, 0.18, 0.5, seatMat, 0.35, -0.02, -0.25); // passenger seat
    box(0.55, 0.36, 0.1, seatMat, 0.35, 0.16, -0.5);
    box(1.6, 0.2, 0.55, seatMat, 0, -0.02, -1.9); // rear bench
    box(1.6, 0.34, 0.1, seatMat, 0, 0.14, -2.15);

    // --- steering wheel (in front of the driver) ---
    this.wheel.position.set(-0.35, 0.5, 0.42);
    this.wheel.rotation.x = -0.9;
    const rim = add(new THREE.TorusGeometry(0.17, 0.02, 6, 14), dark, this.wheel);
    rim.castShadow = false;
    add(new THREE.BoxGeometry(0.34, 0.025, 0.025), dark, this.wheel);
    this.root.add(this.wheel);

    // --- bow: anchor + rail ---
    box(0.06, 0.1, 0.5, dark, 0, top + 0.02, 2.35);
    add(new THREE.SphereGeometry(0.07, 8, 6), accent).position.set(0, top + 0.08, 2.62);

    // --- outboard engine (pivot at the transom, swings about the y axis) ---
    this.outboard.position.set(0, 0.12, BOAT.stern.z - 0.12);
    box(0.4, 0.62, 0.55, accent, 0, 0.05, -0.08, this.outboard); // cowl
    box(0.26, 0.75, 0.3, dark, 0, -0.52, -0.05, this.outboard); // leg
    box(0.2, 0.2, 0.55, dark, 0, -0.9, 0, this.outboard); // gearcase
    this.prop.position.set(0, -0.9, -0.34);
    box(0.06, 0.06, 0.06, dark, 0, 0, 0, this.prop);
    for (let i = 0; i < 3; i++) {
      const blade = box(0.46, 0.07, 0.05, dark, 0, 0, 0, this.prop);
      blade.rotation.z = (i * Math.PI) / 3;
    }
    this.blurMat = new THREE.MeshBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.mats.push(this.blurMat);
    const blur = add(new THREE.CircleGeometry(0.25, 20), this.blurMat, this.prop);
    blur.castShadow = false;
    blur.receiveShadow = false;
    this.outboard.add(this.prop);
    this.root.add(this.outboard);

    // --- nav lights ---
    const navL = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const navR = new THREE.MeshBasicMaterial({ color: 0x30ff60 });
    this.mats.push(navL, navR);
    add(new THREE.SphereGeometry(0.06, 6, 5), navL).position.set(0.8, top + 0.04, 1.5);
    add(new THREE.SphereGeometry(0.06, 6, 5), navR).position.set(-0.8, top + 0.04, 1.5);
  }

  /** lever -1..1 (throttle), rudder in rad (+ = boat turns left). */
  animate(dt: number, lever: number, rudder: number, propInWater: boolean): void {
    this.outboard.rotation.y = -rudder;
    this.wheel.rotation.z = rudder * 2.2;
    const spin = Math.abs(lever) * (propInWater ? 1 : 1.7);
    this.propAngle += dt * (propInWater ? 6 : 30) * (0.4 + 4 * spin) * (lever < 0 ? -1 : 1);
    this.prop.rotation.z = this.propAngle;
    this.blurMat.opacity = propInWater ? Math.min(0.28, Math.abs(lever) * 0.4) : 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
