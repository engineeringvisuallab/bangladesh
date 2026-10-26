import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundY, wheelDefs, type VehicleSpec } from './VehicleSpec';
import { EV_TEAL, makeLogoTexture, type LogoStyle } from './EVCityLogo';
import { carEnv } from './CarEnv';

type AnyMat = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

/** Steering-head rake of the bike (rad): the fork leans back 25 degrees from vertical. */
const RAKE = 0.436;

export interface WheelNode {
  /** Moves up/down with the suspension. */
  pivot: THREE.Group;
  /** Yaw (steering). */
  steer: THREE.Group;
  /** Roll (wheel rotation about the axle). */
  spin: THREE.Group;
}

/**
 * A piece of the body that can break off. stage 0 = the shell (always stays, burns black);
 * 1..3 = comes off when the vehicle is damaged to 75 / 50 / 28 %; 4 = only flies off when it blows up.
 */
export interface ModelPart {
  obj: THREE.Object3D;
  stage: 0 | 1 | 2 | 3 | 4;
}

/**
 * One cross-section of a lofted body shell: half width `w`, bottom / top height above the GROUND (`hb`, `ht`) and the corner
 * radii (`r` = top corners, `rb` = bottom corners, default `r`). A shell is a row of sections at growing z (rear -> front).
 */
interface Section {
  z: number;
  w: number;
  hb: number;
  ht: number;
  r: number;
  rb?: number;
}

/** Linear interpolation of a section table at `z`. */
function sectionAt(t: Section[], z: number): Section {
  if (z <= t[0].z) return { ...t[0], z };
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (z <= b.z) {
      const k = (z - a.z) / (b.z - a.z);
      const l = (p: number, q: number) => p + (q - p) * k;
      return { z, w: l(a.w, b.w), hb: l(a.hb, b.hb), ht: l(a.ht, b.ht), r: l(a.r, b.r), rb: l(a.rb ?? a.r, b.rb ?? b.r) };
    }
  }
  return { ...t[t.length - 1], z };
}

/** Sedan: lower body (hood, wings, doors, deck). Nose +Z. Heights above the ground in metres. */
const SEDAN_LOWER: Section[] = [
  { z: -2.0, w: 0.8, hb: 0.4, ht: 0.9, r: 0.14 },
  { z: -1.9, w: 0.85, hb: 0.3, ht: 0.94, r: 0.17, rb: 0.12 },
  { z: -1.4, w: 0.88, hb: 0.22, ht: 0.93, r: 0.16, rb: 0.1 },
  { z: -0.2, w: 0.89, hb: 0.2, ht: 0.9, r: 0.16, rb: 0.1 },
  { z: 0.8, w: 0.89, hb: 0.2, ht: 0.89, r: 0.16, rb: 0.1 },
  { z: 1.4, w: 0.88, hb: 0.22, ht: 0.84, r: 0.15, rb: 0.11 },
  { z: 1.85, w: 0.84, hb: 0.26, ht: 0.74, r: 0.15 },
  { z: 2.0, w: 0.78, hb: 0.34, ht: 0.66, r: 0.16 },
];

/** Sedan: greenhouse (glass). Narrower on top (tumblehome), sloping windscreen and rear window. */
const SEDAN_CABIN: Section[] = [
  { z: -1.3, w: 0.72, hb: 0.86, ht: 0.92, r: 0.02, rb: 0.02 },
  { z: -1.05, w: 0.72, hb: 0.86, ht: 1.24, r: 0.2, rb: 0.02 },
  { z: -0.7, w: 0.7, hb: 0.86, ht: 1.43, r: 0.22, rb: 0.02 },
  { z: -0.1, w: 0.7, hb: 0.86, ht: 1.45, r: 0.22, rb: 0.02 },
  { z: 0.3, w: 0.71, hb: 0.86, ht: 1.43, r: 0.22, rb: 0.02 },
  { z: 0.55, w: 0.73, hb: 0.86, ht: 1.18, r: 0.2, rb: 0.02 },
  { z: 0.85, w: 0.76, hb: 0.86, ht: 0.93, r: 0.02, rb: 0.02 },
];

/** Hypercar: lower body. Low wedge nose, wide rear haunches, tapered tail. Heights above the ground in metres. */
const HYPER_LOWER: Section[] = [
  { z: -2.25, w: 0.7, hb: 0.3, ht: 0.74, r: 0.12, rb: 0.08 },
  { z: -2.1, w: 0.84, hb: 0.26, ht: 0.88, r: 0.2, rb: 0.1 },
  { z: -1.6, w: 0.96, hb: 0.18, ht: 0.96, r: 0.22, rb: 0.1 },
  { z: -0.9, w: 0.94, hb: 0.16, ht: 0.86, r: 0.2, rb: 0.1 },
  { z: 0.1, w: 0.9, hb: 0.15, ht: 0.72, r: 0.18, rb: 0.08 },
  { z: 1.0, w: 0.93, hb: 0.16, ht: 0.8, r: 0.2, rb: 0.1 },
  { z: 1.45, w: 0.94, hb: 0.16, ht: 0.76, r: 0.2, rb: 0.1 },
  { z: 1.8, w: 0.9, hb: 0.16, ht: 0.62, r: 0.2, rb: 0.1 },
  { z: 2.1, w: 0.8, hb: 0.15, ht: 0.48, r: 0.18, rb: 0.08 },
  { z: 2.25, w: 0.66, hb: 0.17, ht: 0.4, r: 0.15, rb: 0.06 },
];

/** Hypercar: teardrop glass canopy, raked windscreen and a fastback rear window. */
const HYPER_CABIN: Section[] = [
  { z: -1.35, w: 0.55, hb: 0.84, ht: 0.9, r: 0.02, rb: 0.02 },
  { z: -1.05, w: 0.62, hb: 0.8, ht: 1.06, r: 0.25, rb: 0.02 },
  { z: -0.5, w: 0.68, hb: 0.7, ht: 1.14, r: 0.3, rb: 0.02 },
  { z: 0.1, w: 0.7, hb: 0.7, ht: 1.12, r: 0.3, rb: 0.02 },
  { z: 0.65, w: 0.7, hb: 0.7, ht: 0.98, r: 0.25, rb: 0.02 },
  { z: 1.05, w: 0.68, hb: 0.7, ht: 0.78, r: 0.02, rb: 0.02 },
];

/** EVHypar (hyper-GT SUV): low, wide body: long bonnet, wide rear haunches, wedge nose, kammback tail. Heights above the ground in metres. */
const EVH_SHELL: Section[] = [
  { z: -2.45, w: 0.78, hb: 0.38, ht: 1.0, r: 0.16, rb: 0.08 },
  { z: -2.36, w: 0.92, hb: 0.3, ht: 1.1, r: 0.2, rb: 0.1 },
  { z: -1.95, w: 1.0, hb: 0.22, ht: 1.16, r: 0.22, rb: 0.1 },
  { z: -1.2, w: 1.0, hb: 0.2, ht: 1.14, r: 0.2, rb: 0.1 },
  { z: -0.1, w: 0.97, hb: 0.2, ht: 1.08, r: 0.18, rb: 0.1 },
  { z: 0.9, w: 0.97, hb: 0.2, ht: 1.04, r: 0.18, rb: 0.1 },
  { z: 1.5, w: 0.99, hb: 0.2, ht: 0.98, r: 0.18, rb: 0.1 },
  { z: 2.05, w: 0.94, hb: 0.2, ht: 0.8, r: 0.17, rb: 0.09 },
  { z: 2.33, w: 0.84, hb: 0.22, ht: 0.64, r: 0.15, rb: 0.08 },
  { z: 2.45, w: 0.68, hb: 0.26, ht: 0.52, r: 0.13, rb: 0.06 },
];

/** EVHypar: long teardrop glasshouse: strongly raked windscreen and a sloping fastback tailgate window. */
const EVH_CABIN: Section[] = [
  { z: -2.0, w: 0.72, hb: 1.02, ht: 1.1, r: 0.02, rb: 0.02 },
  { z: -1.7, w: 0.8, hb: 1.02, ht: 1.36, r: 0.22, rb: 0.02 },
  { z: -0.9, w: 0.88, hb: 1.02, ht: 1.55, r: 0.28, rb: 0.02 },
  { z: 0.1, w: 0.89, hb: 1.02, ht: 1.57, r: 0.28, rb: 0.02 },
  { z: 0.85, w: 0.87, hb: 1.02, ht: 1.34, r: 0.22, rb: 0.02 },
  { z: 1.45, w: 0.82, hb: 1.02, ht: 1.02, r: 0.02, rb: 0.02 },
];

/** Suprim: low, wide wedge body with a long tail. Heights above the ground in metres. */
const SUP_SHELL: Section[] = [
  { z: -2.4, w: 0.72, hb: 0.3, ht: 0.78, r: 0.12, rb: 0.08 },
  { z: -2.25, w: 0.88, hb: 0.24, ht: 0.92, r: 0.2, rb: 0.1 },
  { z: -1.7, w: 0.99, hb: 0.18, ht: 0.99, r: 0.22, rb: 0.1 },
  { z: -0.9, w: 0.97, hb: 0.16, ht: 0.9, r: 0.2, rb: 0.1 },
  { z: 0.0, w: 0.93, hb: 0.15, ht: 0.76, r: 0.18, rb: 0.08 },
  { z: 0.9, w: 0.96, hb: 0.16, ht: 0.8, r: 0.2, rb: 0.1 },
  { z: 1.5, w: 0.96, hb: 0.16, ht: 0.72, r: 0.2, rb: 0.1 },
  { z: 2.0, w: 0.88, hb: 0.16, ht: 0.55, r: 0.18, rb: 0.08 },
  { z: 2.28, w: 0.74, hb: 0.17, ht: 0.42, r: 0.15, rb: 0.06 },
  { z: 2.4, w: 0.58, hb: 0.2, ht: 0.36, r: 0.12, rb: 0.05 },
];

/** Suprim: teardrop glass canopy. */
const SUP_CABIN: Section[] = [
  { z: -1.4, w: 0.58, hb: 0.84, ht: 0.9, r: 0.02, rb: 0.02 },
  { z: -1.1, w: 0.64, hb: 0.8, ht: 1.1, r: 0.25, rb: 0.02 },
  { z: -0.5, w: 0.7, hb: 0.72, ht: 1.2, r: 0.3, rb: 0.02 },
  { z: 0.2, w: 0.7, hb: 0.72, ht: 1.18, r: 0.3, rb: 0.02 },
  { z: 0.75, w: 0.7, hb: 0.72, ht: 1.0, r: 0.25, rb: 0.02 },
  { z: 1.15, w: 0.66, hb: 0.7, ht: 0.76, r: 0.02, rb: 0.02 },
];

/** Jeep: tub + bonnet + nose (one shell). Square and upright. */
const JEEP_SHELL: Section[] = [
  { z: -1.95, w: 0.9, hb: 0.42, ht: 1.1, r: 0.05, rb: 0.04 },
  { z: -1.88, w: 0.915, hb: 0.4, ht: 1.1, r: 0.06, rb: 0.04 },
  { z: 0.5, w: 0.915, hb: 0.4, ht: 1.1, r: 0.06, rb: 0.04 },
  { z: 0.56, w: 0.86, hb: 0.46, ht: 1.0, r: 0.06, rb: 0.05 },
  { z: 1.86, w: 0.86, hb: 0.48, ht: 1.0, r: 0.07, rb: 0.05 },
  { z: 1.97, w: 0.84, hb: 0.52, ht: 0.98, r: 0.08, rb: 0.06 },
];

/** Jeep: boxy greenhouse (glass), nearly upright windscreen. */
const JEEP_CABIN: Section[] = [
  { z: -1.9, w: 0.85, hb: 1.05, ht: 1.3, r: 0.03, rb: 0.02 },
  { z: -1.86, w: 0.85, hb: 1.05, ht: 1.84, r: 0.08, rb: 0.02 },
  { z: 0.38, w: 0.85, hb: 1.05, ht: 1.84, r: 0.08, rb: 0.02 },
  { z: 0.64, w: 0.86, hb: 1.05, ht: 1.12, r: 0.02, rb: 0.02 },
];

/**
 * Procedural low-poly vehicles (no model files). Faces +Z, left side is +X, origin = chassis centre.
 * Wheel order matches the Rapier wheels (see wheelDefs): for the 4-wheel cars 0 front-left, 1 front-right, 2 rear-left, 3 rear-right.
 * Sedan / jeep / bike / rickshaw / auto / bus / tank.
 */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly wheels: WheelNode[] = [];
  readonly parts: ModelPart[] = [];
  /** Tank only: turret (yaw), barrel (pitch) and the muzzle point (+Z is the firing direction). */
  turret: THREE.Group | null = null;
  barrel: THREE.Group | null = null;
  muzzle: THREE.Object3D | null = null;
  /** Driver's door, hinged at its front edge (sedan, jeep, bus). null on open vehicles (bike, rickshaw, auto, tank). */
  driverDoor: THREE.Group | null = null;
  private mats: AnyMat[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private gy: number;
  /** Suprim: folding wings (open 0..1 -> swing out about the vertical axis) and the four VTOL thruster arms. */
  private wingG: { g: THREE.Group; sx: number }[] = [];
  private armG: { g: THREE.Group; sx: number; bar: THREE.Mesh; pod: THREE.Group; rotor: THREE.Group; disc: THREE.Mesh; glow: THREE.Mesh; glowM: THREE.MeshBasicMaterial; discM: THREE.MeshBasicMaterial }[] = [];
  private rotorAngle = 0;

  constructor(private spec: VehicleSpec) {
    this.gy = groundY(spec);
    switch (spec.look.kind) {
      case 'sedan': this.sedan(); break;
      case 'jeep': this.jeep(); break;
      case 'hypercar': this.hypercar(); break;
      case 'evbike': this.evbike(); break;
      case 'evhypar': this.evhypar(); break;
      case 'suprim': this.suprim(); break;
      case 'bike': this.bike(); break;
      case 'rickshaw': this.rickshaw(); break;
      case 'auto': this.auto(); break;
      case 'bus': this.bus(); break;
      case 'tank': this.tank(); break;
      case 'tractor': this.tractor(); break;
      case 'combine': this.combine(); break;
      case 'pickup': this.pickup(); break;
    }
    this.wheelsAndSpare();
  }

  // ------------------------------------------------------------------ helpers
  private mat(c: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: c, ...extra });
    this.mats.push(m);
    return m;
  }

  /** Physically based material (reflects the shared sky cube): paint, glass, chrome, rubber. */
  private pbr(c: number, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
    const m = new THREE.MeshPhysicalMaterial({ color: c, envMap: carEnv(), ...extra });
    this.mats.push(m);
    return m;
  }

  /** Metallic clear-coated car paint. */
  private carPaint(c: number): THREE.MeshPhysicalMaterial {
    return this.pbr(c, { metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 });
  }

  /** Dark tinted, glossy window glass (you still see the people inside). */
  private carGlass(): THREE.MeshPhysicalMaterial {
    return this.pbr(0x0b1722, { metalness: 0.15, roughness: 0.04, transparent: true, opacity: 0.58, envMapIntensity: 1.6 });
  }

  private chromeMat(): THREE.MeshPhysicalMaterial {
    return this.pbr(0xe4e8ec, { metalness: 1, roughness: 0.1, envMapIntensity: 1.2 });
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root): THREE.Mesh {
    this.geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Box, chassis-local height y. */
  private box(w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    const mesh = this.mesh(new THREE.BoxGeometry(w, h, l), m, x, y, z, parent);
    if (parent === this.root) this.parts.push({ obj: mesh, stage });
    return mesh;
  }

  /** Box, height y metres ABOVE THE GROUND. */
  private boxG(w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    return this.box(w, h, l, m, x, this.gy + y, z, stage, parent);
  }

  /** Rounded tyre (lathe profile, axis = Y). */
  private makeTyre(r: number, w: number, knobby = false, rimFrac = 0.62): THREE.BufferGeometry {
    const hw = w / 2;
    const rin = r * rimFrac;
    const prof = [
      [rin, -hw * 0.85], [r * 0.8, -hw], [r * 0.93, -hw * 0.93], [r * 0.985, -hw * 0.55], [r, -hw * 0.2],
      [r, hw * 0.2], [r * 0.985, hw * 0.55], [r * 0.93, hw * 0.93], [r * 0.8, hw], [rin, hw * 0.85],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const segs = knobby ? 40 : 28;
    const g = new THREE.LatheGeometry(prof, segs);
    if (knobby) {
      // mud-terrain tread: raised blocks in a staggered pattern (centre blocks on even segments, shoulder blocks on odd ones)
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const n = prof.length;
      for (let i = 0; i < pos.count; i++) {
        const seg = Math.floor(i / n);
        const j = i % n;
        const y = pos.getY(i);
        const rad = Math.hypot(pos.getX(i), pos.getZ(i));
        if (rad < r * 0.9) continue;
        const shoulder = Math.abs(y) > hw * 0.45;
        const raised = shoulder ? seg % 2 === 1 : seg % 2 === 0;
        const k = raised ? 1.045 : 0.985;
        if (j >= 0 && j < n) {
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * k);
        }
      }
      g.computeVertexNormals();
    }
    this.geos.push(g);
    return g;
  }

  // ------------------------------------------------------------------ lofted bodywork
  /** Rounded-rectangle ring of a section, counter-clockwise seen from +Z: [x, height above ground][]. */
  private ring(sec: Section, K = 4): [number, number][] {
    const hgt = Math.max(0.01, sec.ht - sec.hb);
    let rt = Math.max(0.005, Math.min(sec.r, sec.w - 0.005));
    let rb = Math.max(0.005, Math.min(sec.rb ?? sec.r, sec.w - 0.005));
    const k = Math.min(1, (hgt - 0.002) / (rt + rb));
    rt *= Math.max(0.05, k);
    rb *= Math.max(0.05, k);
    const w = sec.w;
    const pts: [number, number][] = [];
    const arc = (cx: number, cy: number, R: number, a0: number) => {
      for (let i = 0; i <= K; i++) {
        const a = a0 + ((Math.PI / 2) * i) / K;
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
    };
    arc(w - rb, sec.hb + rb, rb, -Math.PI / 2);
    arc(w - rt, sec.ht - rt, rt, 0);
    arc(-(w - rt), sec.ht - rt, rt, Math.PI / 2);
    arc(-(w - rb), sec.hb + rb, rb, Math.PI);
    return pts;
  }

  /**
   * A smooth shell through the sections (rear -> front): rounded corners, smooth shading along the body, flat end caps.
   * The geometry is centred on its own middle so the piece spins around itself when it breaks off.
   */
  private loft(sections: Section[], m: THREE.Material, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root, base: number = this.gy): THREE.Mesh {
    const rings = sections.map((sec) => this.ring(sec));
    const N = rings[0].length;
    const S = sections.length;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < S; i++) for (let j = 0; j < N; j++) pos.push(rings[i][j][0], base + rings[i][j][1], sections[i].z);
    for (let i = 0; i < S - 1; i++) {
      for (let j = 0; j < N; j++) {
        const a = i * N + j;
        const b = i * N + ((j + 1) % N);
        const c = (i + 1) * N + ((j + 1) % N);
        const d = (i + 1) * N + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    // end caps with their own vertices (flat normals)
    const cap = (i: number, front: boolean) => {
      const v0 = pos.length / 3; // first vertex of this cap
      let cx = 0;
      let cy = 0;
      for (let j = 0; j < N; j++) {
        pos.push(rings[i][j][0], base + rings[i][j][1], sections[i].z);
        cx += rings[i][j][0] / N;
        cy += rings[i][j][1] / N;
      }
      pos.push(cx, base + cy, sections[i].z);
      const c = v0 + N;
      for (let j = 0; j < N; j++) {
        const a = v0 + j;
        const b = v0 + ((j + 1) % N);
        if (front) idx.push(c, a, b);
        else idx.push(c, b, a);
      }
    };
    cap(0, false);
    cap(S - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    const mesh = this.mesh(g, m, c.x, c.y, c.z, parent);
    if (parent === this.root) this.parts.push({ obj: mesh, stage });
    return mesh;
  }

  /** A round bar from point `a` to point `b` (both [x, y, z] in `parent` coordinates). */
  private tube(a: number[], b: number[], r: number, m: THREE.Material, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const mesh = this.mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    mesh.castShadow = r > 0.02;
    if (parent === this.root) this.parts.push({ obj: mesh, stage });
    return mesh;
  }

  private cyl(r: number, len: number, seg = 12): THREE.CylinderGeometry {
    return new THREE.CylinderGeometry(r, r, len, seg);
  }


  // ------------------------------------------------------------------ models
  /**
   * A smooth shell through the sections (rear -> front): rounded corners, smooth shading along the body, flat end caps.
   * The geometry is centred on its own middle so the piece spins around itself when it breaks off.
   */
  private uloft(sections: Section[], m: THREE.Material, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root, off: THREE.Vector3 = new THREE.Vector3()): THREE.Mesh {
    const rings = sections.map((sec) => this.ring(sec));
    const N = rings[0].length;
    const S = sections.length;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < S; i++) for (let j = 0; j < N; j++) pos.push(rings[i][j][0], this.gy + rings[i][j][1], sections[i].z);
    for (let i = 0; i < S - 1; i++) {
      for (let j = 0; j < N; j++) {
        const a = i * N + j;
        const b = i * N + ((j + 1) % N);
        const c = (i + 1) * N + ((j + 1) % N);
        const d = (i + 1) * N + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    // end caps with their own vertices (flat normals)
    const cap = (i: number, front: boolean) => {
      const base = pos.length / 3;
      let cx = 0;
      let cy = 0;
      for (let j = 0; j < N; j++) {
        pos.push(rings[i][j][0], this.gy + rings[i][j][1], sections[i].z);
        cx += rings[i][j][0] / N;
        cy += rings[i][j][1] / N;
      }
      pos.push(cx, this.gy + cy, sections[i].z);
      const c = base + N;
      for (let j = 0; j < N; j++) {
        const a = base + j;
        const b = base + ((j + 1) % N);
        if (front) idx.push(c, a, b);
        else idx.push(c, b, a);
      }
    };
    cap(0, false);
    cap(S - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    const mesh = this.mesh(g, m, c.x - off.x, c.y - off.y, c.z - off.z, parent);
    if (parent === this.root) this.parts.push({ obj: mesh, stage });
    return mesh;
  }

  // ------------------------------------------------------------------ part helpers (rickshaw / auto / bus / tank) (y = height above the ground on the root, local y inside a group)
  private yy(y: number, parent: THREE.Object3D): number {
    return parent === this.root ? this.gy + y : y;
  }

  private reg<T extends THREE.Object3D>(o: T, stage: ModelPart['stage'], parent: THREE.Object3D): T {
    if (parent === this.root) this.parts.push({ obj: o, stage });
    return o;
  }

  /** Rounded box (soft edges). */
  private rbox(w: number, h: number, l: number, rad: number, m: THREE.Material, x: number, y: number, z: number, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    const g = new RoundedBoxGeometry(w, h, l, 2, Math.max(0.002, Math.min(rad, Math.min(w, h, l) / 2 - 0.001)));
    return this.reg(this.mesh(g, m, x, this.yy(y, parent), z, parent), stage, parent);
  }

  /** Cylinder along an axis. */
  private ucyl(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root, seg = 14, open = false): THREE.Mesh {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.reg(this.mesh(g, m, x, this.yy(y, parent), z, parent), stage, parent);
  }

  /** Round tube between two points (ground-height coordinates on the root, local inside a group). */
  private utube(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root, seg = 8): THREE.Mesh {
    const A = new THREE.Vector3(a[0], this.yy(a[1], parent), a[2]);
    const B = new THREE.Vector3(b[0], this.yy(b[1], parent), b[2]);
    const d = B.clone().sub(A);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const mesh = this.mesh(g, m, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return this.reg(mesh, stage, parent);
  }

  /** Half cylinder shell over a wheel (mudguard), axis = X, covers the top half. */
  private guard(r: number, width: number, m: THREE.Material, x: number, y: number, z: number, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root, arc = Math.PI): THREE.Mesh {
    const g = new THREE.CylinderGeometry(r, r, width, 18, 1, true, 0, arc);
    g.rotateZ(Math.PI / 2);
    return this.reg(this.mesh(g, m, x, this.yy(y, parent), z, parent), stage, parent);
  }

  /** Merge many small pieces (already in final coordinates, ground heights on the root) into one mesh. */
  private fuse(list: THREE.BufferGeometry[], m: THREE.Material, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): THREE.Mesh {
    const off = parent === this.root ? this.gy : 0;
    const merged = mergeGeometries(
      list.map((g) => {
        g.translate(0, off, 0);
        return g;
      }),
      false,
    );
    list.forEach((g) => g.dispose());
    if (!merged) throw new Error('VehicleModel.fuse: merge failed');
    merged.computeBoundingBox();
    const c = merged.boundingBox!.getCenter(new THREE.Vector3());
    merged.translate(-c.x, -c.y, -c.z);
    return this.reg(this.mesh(merged, m, c.x, c.y, c.z, parent), stage, parent);
  }

  /**
   * A solid slab: the side outline `poly` ([z, height above ground][], wheel arches included) extruded sideways from x0 to x1
   * with a soft bevel. `hole` cuts an opening (the inside of a tank track).
   */
  private profile(poly: [number, number][], x0: number, x1: number, bevel: number, m: THREE.Material, stage: ModelPart['stage'] = 0, hole?: [number, number][]): THREE.Mesh {
    const shape = new THREE.Shape();
    poly.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    if (hole) {
      const p = new THREE.Path();
      hole.forEach(([z, y], i) => (i ? p.lineTo(z, y) : p.moveTo(z, y)));
      shape.holes.push(p);
    }
    const depth = Math.max(0.002, x1 - x0 - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
    g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world x
    g.computeBoundingBox();
    g.translate(x0 - g.boundingBox!.min.x, this.gy, 0);
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    return this.reg(this.mesh(g, m, c.x, c.y, c.z), stage, this.root);
  }

  /** Points of a wheel arch seen from the side, left to right (+z), from the body bottom `yb` up over the wheel and down again. */
  private arch(zc: number, hc: number, R: number, yb: number, n = 12): [number, number][] {
    const dx = Math.sqrt(Math.max(0.0001, R * R - (yb - hc) * (yb - hc)));
    const a0 = Math.atan2(yb - hc, dx);
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - a0 - ((Math.PI - 2 * a0) * i) / n;
      pts.push([zc + R * Math.cos(a), hc + R * Math.sin(a)]);
    }
    return pts;
  }


  private sedan(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const trim = this.pbr(spec.look.accent, { metalness: 0.1, roughness: 0.5 });
    const glass = this.carGlass();
    const dark = this.pbr(0x0f1114, { roughness: 0.6, metalness: 0.1 });
    const interior = this.mat(0x23262b);
    const chrome = this.chromeMat();
    const plate = this.mat(0xe9e6d8);
    const lightF = this.pbr(0xeef5ff, { emissive: 0xaecdff, emissiveIntensity: 0.55, roughness: 0.04, metalness: 0 });
    const lightR = this.pbr(0xd01414, { emissive: 0x7a0000, roughness: 0.15, metalness: 0 });
    const H = (h: number) => this.gy + h; // height above ground -> chassis-local y

    // ---- shell: lower body + greenhouse (glass) + roof ----
    this.loft(SEDAN_LOWER, paint, 0);
    this.loft(SEDAN_CABIN, glass, 4);
    // roof: a 10 cm thick hat over the top of the glass (a little wider than the glass = roof edge), with the header rails
    const roof: Section[] = [-1.12, -0.9, -0.7, -0.1, 0.3, 0.55].map((z) => {
      const g = sectionAt(SEDAN_CABIN, z);
      const ht = g.ht + 0.008;
      return { z, w: g.w + 0.006, hb: ht - 0.1, ht, r: g.r, rb: 0.01 };
    });
    this.loft(roof, paint, 3);
    // bonnet and boot lid: thin panels a hair above the shell (they can break off)
    const panel = (zs: number[]): Section[] =>
      zs.map((z) => {
        const s = sectionAt(SEDAN_LOWER, z);
        return { z, w: s.w - 0.05, hb: s.ht + 0.012 - 0.034, ht: s.ht + 0.012, r: 0.017 };
      });
    this.loft(panel([0.45, 0.9, 1.4, 1.7, 1.9]), paint, 3);
    this.loft(panel([-1.88, -1.5, -1.2, -0.95]), paint, 2);

    // ---- bumpers ----
    this.loft(
      [
        { z: 1.93, w: 0.8, hb: 0.24, ht: 0.5, r: 0.1 },
        { z: 2.12, w: 0.81, hb: 0.22, ht: 0.5, r: 0.1 },
        { z: 2.22, w: 0.74, hb: 0.26, ht: 0.46, r: 0.1 },
      ],
      trim,
      1,
    );
    this.loft(
      [
        { z: -2.22, w: 0.74, hb: 0.28, ht: 0.5, r: 0.1 },
        { z: -2.12, w: 0.81, hb: 0.24, ht: 0.54, r: 0.1 },
        { z: -1.93, w: 0.8, hb: 0.24, ht: 0.54, r: 0.1 },
      ],
      trim,
      2,
    );

    // ---- pillars, mirrors ----
    for (const sx of [1, -1]) {
      const a = this.box(0.055, 0.78, 0.07, paint, sx * 0.69, H(1.17), 0.575, 4); // A pillar
      a.rotation.x = -0.83;
      this.box(0.05, 0.34, 0.08, paint, sx * 0.71, H(1.07), -0.23, 4); // B pillar
      const c = this.box(0.09, 0.62, 0.08, paint, sx * 0.66, H(1.12), -1.02, 4); // C pillar
      c.rotation.x = 0.95;
      this.box(0.14, 0.08, 0.07, paint, sx * 0.98, H(1.0), 0.6, 3); // mirror
      this.box(0.09, 0.03, 0.03, dark, sx * 0.92, H(0.98), 0.6, 3); // mirror arm
    }

    // ---- door seams, handles, wheel arches ----
    for (const sx of [1, -1]) {
      for (const z of [0.52, -0.22, -0.96]) this.box(0.006, 0.52, 0.012, dark, sx * 0.892, H(0.62), z, 0);
      for (const z of [0.3, -0.45]) this.box(0.012, 0.03, 0.14, chrome, sx * 0.893, H(0.8), z, 0);
    }
    const archG = new THREE.CircleGeometry(0.4, 24, 0, Math.PI);
    this.geos.push(archG);
    for (const d of wheelDefs(spec)) {
      const arch = new THREE.Mesh(archG, dark);
      const sx = d.x > 0 ? 1 : -1;
      arch.position.set(sx * 0.886, H(spec.wheelRadius), d.z);
      arch.rotation.y = sx * (Math.PI / 2);
      this.root.add(arch);
    }

    this.addDoor(0.89, 0.52, 0.74, 0.3, 0.5, 0.05, paint, chrome, dark); // driver's door (right-hand drive)

    // ---- realism extras: LED lamps, chrome window trim, skirts, spoiler lip, fog lamps, aerial ----
    const ledStrip = this.mat(0xffffff, { emissive: 0xdff0ff });
    const redBar = this.mat(0xe01010, { emissive: 0x8a0000 });
    for (const sx of [1, -1]) {
      const led = this.box(0.28, 0.014, 0.012, ledStrip, sx * 0.54, H(0.635), 2.03, 2); // daytime running strip
      led.rotation.y = sx * 0.3;
      this.box(0.1, 0.055, 0.04, lightF, sx * 0.6, H(0.31), 2.212, 1); // fog lamps
      this.box(0.02, 0.012, 1.8, chrome, sx * 0.735, H(0.905), -0.2, 0); // chrome window-base trim
      this.box(0.03, 0.07, 1.85, trim, sx * 0.9, H(0.27), -0.2, 0); // side skirts
    }
    this.box(0.88, 0.03, 0.02, redBar, 0, H(0.82), -2.015, 2); // light bar joining the tail lamps
    this.box(1.1, 0.025, 0.1, paint, 0, H(0.97), -1.93, 2); // boot spoiler lip
    const aerial = this.mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.42, 6), dark, 0.5, H(1.33), -0.95);
    this.parts.push({ obj: aerial, stage: 3 });

    // ---- lights, grille, plates, exhaust ----
    for (const sx of [1, -1]) {
      const hl = this.box(0.3, 0.09, 0.05, lightF, sx * 0.54, H(0.57), 2.0, 2);
      hl.rotation.y = sx * 0.3;
      const tl = this.box(0.32, 0.1, 0.05, lightR, sx * 0.6, H(0.8), -2.0, 2);
      tl.rotation.y = -sx * 0.2;
    }
    this.box(0.6, 0.1, 0.04, dark, 0, H(0.47), 2.01, 2); // grille
    this.box(0.62, 0.012, 0.04, chrome, 0, H(0.53), 2.015, 2);
    this.box(0.3, 0.075, 0.012, plate, 0, H(0.34), 2.23, 1); // number plates
    this.box(0.3, 0.075, 0.012, plate, 0, H(0.4), -2.23, 2);
    this.box(0.09, 0.06, 0.12, chrome, 0.5, H(0.26), -2.25, 2); // exhaust tip

    // ---- interior seen through the glass ----
    this.box(1.3, 0.02, 1.75, interior, 0, H(0.905), -0.2, 4); // floor / seat tops
    this.box(1.3, 0.12, 0.3, interior, 0, H(0.97), 0.68, 4); // dashboard
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 8, 20), dark);
    this.geos.push(sw.geometry);
    sw.position.set(-0.42, H(1.0), 0.56); // right-hand drive
    sw.rotation.x = -2.53;
    this.root.add(sw);
    this.parts.push({ obj: sw, stage: 4 });
    const seats = [spec.seat, ...(spec.seats ?? [])];
    for (const st of seats) {
      // the back must stay under the glass (the rear seats sit where the rear window slopes down)
      const zb = st.z - 0.3;
      const top = Math.min(1.3, sectionAt(SEDAN_CABIN, zb).ht - 0.14);
      const hgt = top - 0.9;
      const back = this.box(0.46, hgt, 0.08, interior, st.x, H(0.9 + hgt / 2), zb, 4);
      back.rotation.x = -0.12;
      if (top > 1.25) this.box(0.2, 0.12, 0.07, interior, st.x, H(top + 0.02), zb, 4); // head restraint
    }
  }

  private jeep(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const trim = this.pbr(spec.look.accent, { metalness: 0.1, roughness: 0.5 });
    const glass = this.carGlass();
    const dark = this.pbr(0x0f1114, { roughness: 0.6, metalness: 0.1 });
    const interior = this.mat(0x23262b);
    const chrome = this.chromeMat();
    const plate = this.mat(0xe9e6d8);
    const lamp = this.pbr(0xeef5ff, { emissive: 0xaecdff, emissiveIntensity: 0.6, roughness: 0.04, metalness: 0 });
    const tail = this.pbr(0xd01414, { emissive: 0x8a0000, roughness: 0.15, metalness: 0 });
    const amber = this.mat(0xff9a1a, { emissive: 0x552200 });
    const teal = this.mat(EV_TEAL, { emissive: 0x0c6f5c });
    const roofM = this.pbr(0x14171a, { metalness: 0.3, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 }); // gloss black roof (EVCity SUV)
    const rubber = this.pbr(0x101214, { roughness: 0.85, metalness: 0 });
    const steel = this.pbr(0x8b9298, { metalness: 0.9, roughness: 0.35 });
    const H = (h: number) => this.gy + h;

    // ---- shell, glass, roof, bonnet, bumpers ----
    this.loft(JEEP_SHELL, paint, 0);
    this.loft(JEEP_CABIN, glass, 4);
    this.loft(
      [
        { z: -1.9, w: 0.856, hb: 1.74, ht: 1.848, r: 0.08, rb: 0.01 },
        { z: -1.5, w: 0.856, hb: 1.74, ht: 1.848, r: 0.08, rb: 0.01 },
        { z: 0.38, w: 0.856, hb: 1.74, ht: 1.848, r: 0.08, rb: 0.01 },
        { z: 0.5, w: 0.856, hb: 1.6, ht: 1.7, r: 0.04, rb: 0.01 },
      ],
      roofM,
      3,
    ); // roof
    this.loft([{ z: 0.62, w: 0.8, hb: 0.99, ht: 1.032, r: 0.016 }, { z: 1.9, w: 0.8, hb: 0.99, ht: 1.032, r: 0.016 }], paint, 3); // bonnet panel
    this.loft(
      [
        { z: 1.97, w: 0.93, hb: 0.4, ht: 0.64, r: 0.05 },
        { z: 2.14, w: 0.93, hb: 0.4, ht: 0.64, r: 0.05 },
        { z: 2.18, w: 0.9, hb: 0.42, ht: 0.6, r: 0.05 },
      ],
      trim,
      1,
    );
    this.loft(
      [
        { z: -2.18, w: 0.9, hb: 0.4, ht: 0.64, r: 0.05 },
        { z: -2.1, w: 0.93, hb: 0.4, ht: 0.64, r: 0.05 },
        { z: -1.95, w: 0.93, hb: 0.4, ht: 0.64, r: 0.05 },
      ],
      trim,
      2,
    );

    const flareG = new THREE.TorusGeometry(0.54, 0.05, 8, 18, Math.PI);
    const archG = new THREE.CircleGeometry(0.5, 24, 0, Math.PI);
    const lampG = new THREE.CylinderGeometry(0.115, 0.115, 0.07, 16);
    const lensG = new THREE.CylinderGeometry(0.095, 0.095, 0.08, 16);
    this.geos.push(flareG, archG, lampG, lensG);
    for (const sx of [1, -1]) {
      // pillars, door seams + handles, mirrors
      const a = this.box(0.07, 0.8, 0.08, paint, sx * 0.87, H(1.45), 0.52, 4); // A pillar (raked)
      a.rotation.x = -0.25;
      this.box(0.07, 0.74, 0.1, paint, sx * 0.87, H(1.43), -0.48, 4); // B
      this.box(0.07, 0.74, 0.1, paint, sx * 0.87, H(1.43), -1.55, 4); // C
      for (const z of [0.45, -0.48, -1.52]) this.box(0.006, 0.56, 0.012, dark, sx * 0.918, H(0.78), z, 0);
      for (const z of [0.2, -0.75]) this.box(0.012, 0.04, 0.16, trim, sx * 0.919, H(0.98), z, 0);
      this.box(0.1, 0.2, 0.14, trim, sx * 1.0, H(1.4), 0.62, 3); // mirror
      this.box(0.12, 0.03, 0.03, trim, sx * 0.93, H(1.32), 0.62, 3);
      // round headlights with chrome bezels, indicators, tail lights
      const bez = this.mesh(lampG, chrome, sx * 0.62, H(0.8), 2.0);
      bez.rotation.x = Math.PI / 2;
      const lens = this.mesh(lensG, lamp, sx * 0.62, H(0.8), 2.01);
      lens.rotation.x = Math.PI / 2;
      this.parts.push({ obj: bez, stage: 2 }, { obj: lens, stage: 2 });
      this.box(0.12, 0.1, 0.05, amber, sx * 0.83, H(0.7), 1.98, 2);
      this.box(0.1, 0.34, 0.05, tail, sx * 0.83, H(0.92), -1.975, 2);
      // fenders: flat top, flare ring and a dark arch behind each wheel (the wheels stick out of the tub)
      for (const z of [1.2, -1.2]) {
        this.box(0.25, 0.05, 1.2, rubber, sx * 0.99, H(0.96), z, 2);
        const fl = this.mesh(flareG, rubber, sx * 0.95, H(0.42), z);
        fl.rotation.y = Math.PI / 2;
        const arch = new THREE.Mesh(archG, dark);
        arch.position.set(sx * 0.918, H(0.42), z);
        arch.rotation.y = sx * (Math.PI / 2);
        this.root.add(arch);
      }
      this.box(0.16, 0.04, 1.4, trim, sx * 0.96, H(0.46), 0, 3); // side step
      this.box(0.07, 0.1, 0.1, amber, sx * 0.5, H(0.45), 2.2, 1); // tow hooks
      this.box(0.04, 0.05, 2.4, trim, sx * 0.62, H(1.95), -0.6, 3); // roof rack rails
    }
    // grille: dark panel with seven body-coloured slots
    this.box(0.56, 0.36, 0.03, dark, 0, H(0.8), 1.99, 2);
    for (let k = 0; k < 7; k++) this.box(0.045, 0.32, 0.04, trim, -0.255 + k * 0.085, H(0.8), 2.0, 2);
    this.box(1.5, 0.035, 0.03, teal, 0, H(0.99), 1.99, 2); // cyan LED strip across the nose
    this.logo('mark', false, 0.22, 0.22, 0, H(0.8), 2.025, 0, 2); // EVCity mark on the grille
    this.box(1.0, 0.03, 0.05, teal, 0, H(1.99), 0.3, 3); // roof light bar
    for (const sx of [1, -1]) {
      this.box(0.012, 0.03, 2.6, teal, sx * 0.92, H(0.62), 0, 0); // teal side stripe
      this.logo('wordmark', false, 0.8, 0.2, sx * 0.925, H(0.8), -0.02, sx * (Math.PI / 2), 0); // EVCity on the doors
    }
    this.box(0.5, 0.14, 0.16, trim, 0, H(0.5), 2.24, 1); // winch
    this.box(0.34, 0.1, 0.012, plate, 0, H(0.52), -2.2, 2); // rear plate
    for (const z of [-1.7, -1.1, -0.5, 0.1]) this.box(1.3, 0.03, 0.05, trim, 0, H(1.95), z, 3); // roof rack bars

    this.addDoor(0.915, 0.45, 0.93, 0.52, 0.52, 0.05, paint, trim, dark); // driver's door (right-hand drive)

    // ---- realism extras: rock sliders, snorkel, bonnet vents, skid plate, LED daytime strips ----
    for (const sx of [1, -1]) {
      this.box(0.1, 0.1, 1.5, rubber, sx * 0.98, H(0.4), 0, 3); // rock slider
      this.box(0.28, 0.012, 0.22, rubber, sx * 0.35, H(1.038), 1.1, 3); // bonnet vent
      this.box(0.22, 0.014, 0.022, teal, sx * 0.62, H(0.665), 2.03, 2); // DRL under the headlamp
    }
    const snorkel = this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 10), rubber, 0.94, H(1.46), 0.74);
    this.parts.push({ obj: snorkel, stage: 3 });
    this.box(0.09, 0.11, 0.14, rubber, 0.94, H(1.96), 0.8, 3); // snorkel intake
    this.box(0.9, 0.05, 0.3, steel, 0, H(0.36), 2.14, 1); // steel skid plate under the nose
    this.box(0.5, 0.05, 0.2, steel, 0, H(0.36), -2.1, 2); // rear recovery plate

    // ---- spare wheel on the tailgate ----
    const spare = new THREE.Group();
    spare.position.set(0, H(1.0), -2.17);
    spare.rotation.x = Math.PI / 2; // tyre axis Y -> Z
    const st = this.mesh(this.makeTyre(0.4, 0.2, true), rubber, 0, 0, 0, spare);
    st.castShadow = true;
    const hubG = new THREE.CylinderGeometry(0.22, 0.22, 0.21, 16);
    this.geos.push(hubG);
    this.mesh(hubG, trim, 0, 0, 0, spare);
    this.root.add(spare);
    this.parts.push({ obj: spare, stage: 3 });
    this.logo('badge', true, 0.52, 0.52, 0, H(1.0), -2.283, Math.PI, 3); // EVCity cover on the spare wheel

    // ---- interior seen through the glass ----
    this.box(1.6, 0.02, 2.3, interior, 0, H(1.06), -0.7, 4); // floor / seat tops
    this.box(1.6, 0.2, 0.34, interior, 0, H(1.1), 0.42, 4); // dashboard
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.017, 8, 20), dark);
    this.geos.push(sw.geometry);
    sw.position.set(-0.45, H(1.24), 0.2); // right-hand drive
    sw.rotation.x = -2.3;
    this.root.add(sw);
    this.parts.push({ obj: sw, stage: 4 });
    for (const q of [spec.seat, ...(spec.seats ?? [])]) {
      const back = this.box(0.5, 0.55, 0.1, interior, q.x, H(1.35), q.z - 0.32, 4);
      back.rotation.x = -0.12;
      this.box(0.22, 0.14, 0.08, interior, q.x, H(1.7), q.z - 0.32, 4); // head restraint
    }
  }

  /** EVCity Volt GT: low, wide electric hypercar. Gloss graphite paint, glass canopy, teal LED signature, active rear wing, diffuser. */
  private hypercar(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const carbon = this.pbr(spec.look.accent, { metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const glass = this.carGlass();
    const dark = this.pbr(0x090b0d, { roughness: 0.55, metalness: 0.1 });
    const interior = this.mat(0x1b1e22);
    const chrome = this.chromeMat();
    const plate = this.mat(0xe9e6d8);
    const lamp = this.pbr(0xeef7ff, { emissive: 0xaecdff, emissiveIntensity: 0.7, roughness: 0.04, metalness: 0 });
    const redBar = this.mat(0xe01010, { emissive: 0xa00000 });
    const teal = this.mat(EV_TEAL, { emissive: 0x12a98f });
    const H = (h: number) => this.gy + h;

    // ---- shell: lower body, glass canopy, carbon roof, bonnet ----
    this.loft(HYPER_LOWER, paint, 0);
    this.loft(HYPER_CABIN, glass, 4);
    const roof: Section[] = [-1.0, -0.5, 0.1, 0.55].map((z) => {
      const g = sectionAt(HYPER_CABIN, z);
      const ht = g.ht + 0.008;
      return { z, w: g.w * 0.62, hb: ht - 0.06, ht, r: 0.12, rb: 0.01 };
    });
    this.loft(roof, carbon, 3);
    const hood = [1.15, 1.45, 1.8, 2.05].map((z): Section => {
      const sct = sectionAt(HYPER_LOWER, z);
      return { z, w: sct.w - 0.2, hb: sct.ht + 0.012 - 0.03, ht: sct.ht + 0.012, r: 0.015 };
    });
    this.loft(hood, carbon, 3); // carbon bonnet insert

    // ---- aero: front splitter, side blades, rear diffuser, active wing ----
    this.box(1.6, 0.035, 0.42, carbon, 0, H(0.17), 2.08, 1); // splitter
    for (const sx of [1, -1]) {
      this.box(0.03, 0.2, 1.4, carbon, sx * 0.95, H(0.26), 0.0, 0); // side blades
      this.box(0.015, 0.06, 0.5, dark, sx * 0.925, H(0.55), -0.85, 0); // side air intakes behind the doors
      this.box(0.015, 0.06, 0.5, dark, sx * 0.925, H(0.64), -0.85, 0);
      this.box(0.05, 0.27, 0.34, carbon, sx * 0.78, H(1.14), -1.98, 3); // wing endplates
      this.box(0.04, 0.2, 0.06, carbon, sx * 0.42, H(1.02), -1.98, 3); // wing uprights
      const wr = this.box(0.12, 0.05, 0.1, carbon, sx * 0.68, H(0.6), 2.0, 1); // front canard
      wr.rotation.z = sx * 0.2;
    }
    this.box(1.6, 0.035, 0.44, carbon, 0, H(1.2), -1.98, 3); // rear wing
    this.box(1.2, 0.2, 0.16, carbon, 0, H(0.28), -2.18, 2); // diffuser
    for (let k = -3; k <= 3; k++) this.box(0.014, 0.14, 0.2, dark, k * 0.16, H(0.27), -2.22, 2); // diffuser fins

    // ---- lights: LED blade headlamps with teal DRL, light-bar tail, plates ----
    for (const sx of [1, -1]) {
      const hl = this.box(0.52, 0.03, 0.2, lamp, sx * 0.52, H(0.525), 1.95, 2);
      hl.rotation.set(0.34, sx * 0.25, 0);
      const drl = this.box(0.5, 0.012, 0.025, teal, sx * 0.52, H(0.545), 2.06, 2);
      drl.rotation.set(0.34, sx * 0.25, 0);
    }
    this.box(1.4, 0.035, 0.03, redBar, 0, H(0.82), -2.12, 2); // tail light bar
    for (const sx of [1, -1]) this.box(0.22, 0.05, 0.03, redBar, sx * 0.62, H(0.7), -2.14, 2);
    this.box(0.5, 0.05, 0.02, dark, 0, H(0.36), 2.2, 1); // front intake
    this.box(0.34, 0.08, 0.012, plate, 0, H(0.33), -2.24, 2); // rear plate
    this.logo('mark', true, 0.16, 0.16, 0, H(0.45), 2.22, 0, 2); // EVCity mark on the nose
    for (const sx of [1, -1]) this.logo('wordmark', true, 0.6, 0.165, sx * 0.947, H(0.43), 0.1, sx * (Math.PI / 2), 0);
    for (const sx of [1, -1]) this.box(0.012, 0.014, 2.4, teal, sx * 0.945, H(0.27), 0, 0); // teal sill line

    // ---- mirrors, door seams, handles, wheel arches ----
    for (const sx of [1, -1]) {
      this.box(0.16, 0.06, 0.1, carbon, sx * 0.84, H(0.8), 0.78, 3); // mirror
      this.box(0.04, 0.03, 0.05, carbon, sx * 0.76, H(0.76), 0.78, 3);
      this.box(0.006, 0.4, 0.012, dark, sx * 0.915, H(0.5), 0.75, 0); // door seam
      this.box(0.006, 0.4, 0.012, dark, sx * 0.915, H(0.5), -0.1, 0);
      this.box(0.012, 0.025, 0.12, chrome, sx * 0.918, H(0.62), -0.02, 0); // handle
    }
    const archG = new THREE.CircleGeometry(0.4, 24, 0, Math.PI);
    this.geos.push(archG);
    for (const d of wheelDefs(spec)) {
      const arch = new THREE.Mesh(archG, dark);
      const sx = d.x > 0 ? 1 : -1;
      arch.position.set(sx * (d.z > 0 ? 0.946 : 0.966), H(spec.wheelRadius), d.z);
      arch.rotation.y = sx * (Math.PI / 2);
      this.root.add(arch);
    }
    this.addDoor(0.9, 0.7, 0.8, 0.26, 0.44, 0.05, paint, chrome, dark); // driver's door (right-hand drive)

    // ---- interior seen through the glass ----
    this.box(1.2, 0.02, 1.5, interior, 0, H(0.56), -0.2, 4); // floor / seat bases
    this.box(1.3, 0.1, 0.3, interior, 0, H(0.7), 0.82, 4); // dashboard
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 8, 20), dark);
    this.geos.push(sw.geometry);
    sw.position.set(-0.38, H(0.84), 0.55); // right-hand drive
    sw.rotation.x = -2.5;
    this.root.add(sw);
    this.parts.push({ obj: sw, stage: 4 });
    for (const st of [spec.seat, ...(spec.seats ?? [])]) {
      const back = this.box(0.42, 0.46, 0.09, interior, st.x, H(0.8), st.z - 0.3, 4); // bucket seat back
      back.rotation.x = -0.28;
      this.box(0.22, 0.12, 0.08, interior, st.x, H(1.08), st.z - 0.38, 4); // head restraint
    }
  }

  /** Painted text decal (flat plane a hair off the body). "EV" is teal, the rest white. w:h = 4:1. */
  private label(text: string, w: number, x: number, y: number, z: number, rotY: number, stage: ModelPart['stage'] = 0): void {
    if (typeof document === 'undefined') return;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext('2d');
    if (!g) return;
    g.font = '900 88px "Arial Black", Arial, sans-serif';
    g.textBaseline = 'middle';
    const ev = text.startsWith('EV') ? 'EV' : '';
    const rest = text.slice(ev.length);
    const total = g.measureText(text).width;
    let px = (512 - total) / 2;
    if (ev) {
      g.fillStyle = '#1fd1b0';
      g.fillText(ev, px, 66);
      px += g.measureText(ev).width;
    }
    g.fillStyle = '#f2f6f8';
    g.fillText(rest, px, 66);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = this.mat(0xffffff, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = this.mesh(new THREE.PlaneGeometry(w, w / 4), m, x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = false;
    this.parts.push({ obj: mesh, stage });
  }

  /**
   * EVCity EVHypar: electric hyper-GT SUV (not a jeep any more). Low and wide with a sloping fastback roof and a panoramic glass roof, a full-width
   * teal LED nose signature and slim blade headlamps, closed EV nose with a splitter, flared haunches, flush door handles, blade mirrors, a full-width
   * red tail light bar, an active ducktail spoiler and a finned rear diffuser. Deep green metallic paint, teal accents, bright aero alloys.
   */
  private evhypar(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const carbon = this.pbr(spec.look.accent, { metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const rubber = this.pbr(0x101214, { roughness: 0.85, metalness: 0 });
    const glass = this.carGlass();
    const roofGlass = this.pbr(0x070d14, { metalness: 0.2, roughness: 0.03, transparent: true, opacity: 0.8, envMapIntensity: 1.8 });
    const dark = this.pbr(0x0b0d10, { roughness: 0.6, metalness: 0.1 });
    const interior = this.mat(0x23262b);
    const chrome = this.chromeMat();
    const plate = this.mat(0xe9e6d8);
    const lamp = this.pbr(0xeef5ff, { emissive: 0xaecdff, emissiveIntensity: 0.7, roughness: 0.04, metalness: 0 });
    const redBar = this.mat(0xe01010, { emissive: 0xa00000 });
    const teal = this.mat(EV_TEAL, { emissive: 0x12a98f });
    const H = (h: number) => this.gy + h;
    const side = (z: number) => sectionAt(EVH_SHELL, z).w; // body half width at z

    // ---- shell, glass, roof, panoramic roof glass, bonnet ----
    this.loft(EVH_SHELL, paint, 0);
    this.loft(EVH_CABIN, glass, 4);
    const roof: Section[] = [-1.5, -0.9, -0.1, 0.5, 0.95].map((z) => {
      const gl = sectionAt(EVH_CABIN, z);
      return { z, w: gl.w + 0.006, hb: gl.ht - 0.15, ht: gl.ht + 0.035, r: 0.12, rb: 0.01 };
    });
    this.loft(roof, paint, 3);
    this.box(0.98, 0.03, 1.1, roofGlass, 0, H(1.6), -0.45, 3); // panoramic glass roof
    const hood = [0.95, 1.35, 1.8, 2.2].map((z): Section => {
      const sct = sectionAt(EVH_SHELL, z);
      return { z, w: sct.w - 0.12, hb: sct.ht + 0.012 - 0.03, ht: sct.ht + 0.012, r: 0.03 };
    });
    this.loft(hood, paint, 3);
    const slope = Math.atan2(0.18, 0.55); // bonnet falls away to the nose
    for (const sx of [1, -1]) {
      const v = this.box(0.26, 0.008, 0.5, dark, sx * 0.3, H(0.972), 1.62, 3); // power-dome vents
      v.rotation.x = slope;
    }
    this.box(0.03, 0.008, 0.95, teal, 0, H(0.99), 1.5, 3).rotation.x = slope * 0.55; // centre line on the bonnet

    // ---- front: closed EV nose, splitter, LED signature, blade headlamps ----
    this.box(1.7, 0.03, 0.4, carbon, 0, H(0.165), 2.27, 1); // splitter
    this.box(0.6, 0.13, 0.012, dark, 0, H(0.36), 2.456, 1); // lower intake
    for (const sx of [1, -1]) this.box(0.2, 0.09, 0.012, dark, sx * 0.55, H(0.34), 2.4, 1).rotation.y = sx * 0.55; // corner air curtains
    const lead = Math.atan2(0.16, 0.28); // nose top surface falls away
    this.box(1.5, 0.016, 0.03, teal, 0, H(0.665), 2.31, 2).rotation.x = lead; // full-width LED strip over the nose
    for (const sx of [1, -1]) {
      const hl = this.box(0.5, 0.024, 0.17, lamp, sx * 0.56, H(sectionAt(EVH_SHELL, 2.2).ht + 0.016), 2.2, 2); // slim blade headlamp, sits on the nose
      hl.rotation.set(lead, -sx * 0.16, 0);
      const drl = this.box(0.48, 0.014, 0.024, teal, sx * 0.56, H(sectionAt(EVH_SHELL, 2.12).ht + 0.026), 2.12, 2); // DRL above it
      drl.rotation.set(lead, -sx * 0.16, 0);
    }
    this.logo('mark', true, 0.16, 0.16, 0, H(0.42), 2.463, 0, 2);

    // ---- sides: sills, door lines, flush handles, flared haunches, arches, blade mirrors ----
    const flareG = new THREE.TorusGeometry(0.52, 0.04, 8, 18, Math.PI);
    const archG = new THREE.CircleGeometry(0.5, 24, 0, Math.PI);
    this.geos.push(flareG, archG);
    for (const sx of [1, -1]) {
      this.box(0.05, 0.08, 2.1, carbon, sx * 0.99, H(0.25), -0.1, 0); // side skirt
      this.box(0.012, 0.014, 2.3, teal, sx * 1.0, H(0.33), -0.1, 0); // teal sill line
      for (const z of [0.9, -0.1, -1.12]) this.box(0.006, 0.56, 0.012, dark, sx * (side(z) + 0.004), H(0.6), z, 0); // door shut lines
      for (const z of [0.22, -0.8]) this.box(0.012, 0.025, 0.17, chrome, sx * (side(z) + 0.006), H(0.86), z, 0); // flush handles
      this.box(0.02, 0.4, 0.1, dark, sx * 0.9, H(1.33), -0.1, 4); // blacked-out B pillar
      this.box(0.14, 0.07, 0.17, paint, sx * 1.06, H(1.1), 0.9, 3); // blade mirror
      this.box(0.13, 0.03, 0.05, dark, sx * 0.99, H(1.07), 0.92, 3);
      this.label('EVHypar', 0.62, sx * (side(-0.6) + 0.004), H(0.7), -0.6, sx * (Math.PI / 2), 0);
      for (const z of [1.5, -1.5]) {
        const fl = this.mesh(flareG, rubber, sx * (side(z) + 0.004), H(spec.wheelRadius), z);
        fl.rotation.y = Math.PI / 2;
        const arch = new THREE.Mesh(archG, dark);
        arch.position.set(sx * (side(z) + 0.003), H(spec.wheelRadius), z);
        arch.rotation.y = sx * (Math.PI / 2);
        this.root.add(arch);
      }
    }
    this.addDoor(0.97, 0.9, 1.0, 0.32, 0.54, 0.04, paint, chrome, dark); // driver's door (right-hand drive)

    // ---- rear: LED light bar, ducktail spoiler, diffuser, plate ----
    this.box(1.5, 0.045, 0.016, redBar, 0, H(0.92), -2.456, 2); // full-width tail light bar
    for (const sx of [1, -1]) this.box(0.1, 0.2, 0.016, redBar, sx * 0.67, H(0.82), -2.456, 2); // blade end lamps
    this.box(0.46, 0.1, 0.012, plate, 0, H(0.52), -2.458, 2);
    this.label('EVHYPAR', 0.7, 0, H(0.72), -2.458, Math.PI, 0);
    const duck = this.box(1.72, 0.04, 0.36, paint, 0, H(1.14), -2.24, 3); // active ducktail spoiler
    duck.rotation.x = 0.14;
    for (const sx of [1, -1]) this.box(0.04, 0.1, 0.1, carbon, sx * 0.5, H(1.1), -2.2, 3); // spoiler hinges
    this.box(1.2, 0.12, 0.14, carbon, 0, H(0.3), -2.4, 2); // diffuser
    for (let k = -3; k <= 3; k++) this.box(0.014, 0.12, 0.16, dark, k * 0.16, H(0.28), -2.42, 2); // diffuser fins
    const rr = this.box(0.9, 0.03, 0.15, carbon, 0, H(1.43), -1.52, 3); // roof-end spoiler
    rr.rotation.x = 0.1;

    // ---- interior seen through the glass ----
    this.box(1.7, 0.02, 2.5, interior, 0, H(0.5), -0.55, 4); // floor
    this.box(1.7, 0.2, 0.4, interior, 0, H(1.0), 1.0, 4); // dashboard
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 20), dark);
    this.geos.push(sw.geometry);
    sw.position.set(-0.48, H(1.2), 0.78); // right-hand drive
    sw.rotation.x = -2.4;
    this.root.add(sw);
    this.parts.push({ obj: sw, stage: 4 });
    for (const q of [spec.seat, ...(spec.seats ?? [])]) {
      this.box(0.5, 0.12, 0.5, interior, q.x, H(0.62), q.z, 4); // seat cushion
      const back = this.box(0.5, 0.6, 0.1, interior, q.x, H(0.95), q.z - 0.3, 4);
      back.rotation.x = -0.28; // reclined sport seats
      this.box(0.22, 0.14, 0.08, interior, q.x, H(1.3), q.z - 0.4, 4); // head restraint
    }
  }

  /**
   * EVCity SUPRIM (one vehicle, three worlds). Silver low coupe with blue LED lines. Two folding wings lie along the rear deck and swing
   * out to the sides in flight mode; four VTOL thruster arms (ducted rotor + blue exhaust) slide out of the fenders. `setFlightPose` animates them.
   */
  private suprim(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const carbon = this.pbr(spec.look.accent, { metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const dark = this.pbr(0x0b0d10, { roughness: 0.6, metalness: 0.1 });
    const glass = this.carGlass();
    const interior = this.mat(0x23262b);
    const chrome = this.chromeMat();
    const plate = this.mat(0xe9e6d8);
    const lamp = this.pbr(0xeef5ff, { emissive: 0xaecdff, emissiveIntensity: 0.8, roughness: 0.04, metalness: 0 });
    const redBar = this.mat(0xe01010, { emissive: 0xa00000 });
    const BLUE = 0x2a9bff;
    const blue = this.mat(BLUE, { emissive: 0x1a6fe0 });
    const H = (h: number) => this.gy + h;
    const side = (z: number) => sectionAt(SUP_SHELL, z).w;

    // ---- shell, canopy, roof, bonnet ----
    this.loft(SUP_SHELL, paint, 0);
    this.loft(SUP_CABIN, glass, 4);
    const roof: Section[] = [-1.0, -0.5, 0.2, 0.7].map((z) => {
      const gl = sectionAt(SUP_CABIN, z);
      return { z, w: gl.w * 0.55, hb: gl.ht - 0.12, ht: gl.ht + 0.03, r: 0.1, rb: 0.01 };
    });
    this.loft(roof, carbon, 3);
    const slope = Math.atan2(0.3, 0.7);
    for (const sx of [1, -1]) this.box(0.24, 0.008, 0.6, dark, sx * 0.34, H(0.742), 1.5, 3).rotation.x = slope * 0.4; // bonnet vents
    this.box(0.03, 0.008, 1.0, blue, 0, H(0.76), 1.45, 3).rotation.x = slope * 0.35; // blue centre line

    // ---- front: splitter, intake, LED signature, blade headlamps ----
    this.box(1.7, 0.03, 0.4, carbon, 0, H(0.17), 2.25, 1);
    this.box(0.7, 0.1, 0.012, dark, 0, H(0.3), 2.402, 1);
    const lead = Math.atan2(0.14, 0.3);
    this.box(1.4, 0.016, 0.03, blue, 0, H(0.37), 2.33, 2).rotation.x = lead;
    for (const sx of [1, -1]) {
      const hl = this.box(0.48, 0.022, 0.16, lamp, sx * 0.5, H(0.43), 2.15, 2);
      hl.rotation.set(lead, -sx * 0.18, 0);
      const drl = this.box(0.46, 0.012, 0.022, blue, sx * 0.5, H(0.445), 2.06, 2);
      drl.rotation.set(lead, -sx * 0.18, 0);
    }
    this.logo('mark', true, 0.2, 0.2, 0, H(0.3), 2.409, 0, 2); // EVCity mark on the nose
    this.logoFlat('mark', false, 0.34, 0.34, 0, H(0.655) + 0.004, 1.72, -Math.PI / 2 + 0.33, 0, 3); // big EVCity mark on the bonnet

    // ---- sides: sills, blue lines, flared haunches, blade mirrors ----
    const flareG = new THREE.TorusGeometry(0.5, 0.04, 8, 18, Math.PI);
    const archG = new THREE.CircleGeometry(0.48, 24, 0, Math.PI);
    this.geos.push(flareG, archG);
    const rubber = this.pbr(0x101214, { roughness: 0.85, metalness: 0 });
    for (const sx of [1, -1]) {
      this.box(0.05, 0.07, 2.2, carbon, sx * 0.97, H(0.24), -0.1, 0);
      this.box(0.012, 0.016, 2.8, blue, sx * (side(0) + 0.006), H(0.36), -0.1, 0); // blue body line
      for (const z of [0.95, -0.15]) this.box(0.006, 0.45, 0.012, dark, sx * (side(z) + 0.004), H(0.52), z, 0); // door lines
      this.box(0.012, 0.025, 0.17, chrome, sx * (side(0.3) + 0.006), H(0.62), 0.3, 0); // flush handle
      this.box(0.13, 0.06, 0.16, paint, sx * 1.04, H(0.88), 0.85, 3); // blade mirror
      this.label('EVCity Suprim', 0.78, sx * (side(-0.9) + 0.004), H(0.55), -0.9, sx * (Math.PI / 2), 0);
      this.logo('wordmark', false, 0.6, 0.15, sx * (side(0.4) + 0.006), H(0.52), 0.4, sx * (Math.PI / 2), 0); // EVCity logo on the doors
      for (const z of [1.5, -1.5]) {
        const fl = this.mesh(flareG, rubber, sx * (side(z) + 0.004), H(spec.wheelRadius), z);
        fl.rotation.y = Math.PI / 2;
        const arch = new THREE.Mesh(archG, dark);
        arch.position.set(sx * (side(z) + 0.003), H(spec.wheelRadius), z);
        arch.rotation.y = sx * (Math.PI / 2);
        this.root.add(arch);
      }
    }
    this.addDoor(0.95, 0.9, 1.05, 0.28, 0.46, 0.04, paint, chrome, dark); // driver's door (right-hand drive)

    // ---- rear: light bar, ducktail, diffuser ----
    this.box(1.5, 0.04, 0.016, redBar, 0, H(0.8), -2.402, 2);
    this.box(0.46, 0.1, 0.012, plate, 0, H(0.5), -2.404, 2);
    this.label('SUPRIM', 0.62, 0, H(0.66), -2.404, Math.PI, 0);
    this.logo('mark', true, 0.22, 0.22, 0, H(0.9), -2.405, Math.PI, 2); // EVCity mark on the tail
    this.logoFlat('mark', false, 0.3, 0.3, 0, H(0.99) + 0.004, -1.9, -Math.PI / 2, Math.PI, 3); // EVCity mark on the rear deck
    this.box(1.6, 0.035, 0.34, paint, 0, H(1.0), -2.2, 3).rotation.x = 0.12;
    this.box(1.15, 0.1, 0.14, carbon, 0, H(0.3), -2.36, 2);
    for (let k = -3; k <= 3; k++) this.box(0.014, 0.1, 0.16, dark, k * 0.16, H(0.28), -2.38, 2);

    // ---- blue underglow (always on) ----
    const glowM = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mats.push(glowM as unknown as AnyMat);
    const under = this.mesh(new THREE.PlaneGeometry(1.8, 4.4), glowM, 0, H(0.1), 0);
    under.rotation.x = -Math.PI / 2;
    under.castShadow = false;
    under.receiveShadow = false;

    // ---- interior seen through the canopy ----
    this.box(1.5, 0.02, 2.2, interior, 0, H(0.45), -0.3, 4);
    this.box(1.5, 0.18, 0.36, interior, 0, H(0.78), 1.0, 4);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 20), dark);
    this.geos.push(sw.geometry);
    sw.position.set(-0.42, H(0.98), 0.74);
    sw.rotation.x = -2.4;
    this.root.add(sw);
    this.parts.push({ obj: sw, stage: 4 });
    for (const q of [spec.seat, ...(spec.seats ?? [])]) {
      this.box(0.46, 0.12, 0.5, interior, q.x, H(0.58), q.z, 4);
      this.box(0.46, 0.55, 0.1, interior, q.x, H(0.86), q.z - 0.3, 4).rotation.x = -0.28;
    }

    // ---- FOLDING WINGS: lie along the rear deck (closed), swing out sideways (open). Pivot on the shoulder behind the canopy ----
    const wingM = this.pbr(spec.look.body, { metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
    const span = 2.5;
    const shape = new THREE.Shape();
    // x = span (outwards), y = -chord (towards +Z in the end): leading edge at y = 0 is the rear edge... swept-back trapezoid
    shape.moveTo(0, 0);
    shape.lineTo(span, -0.22);
    shape.lineTo(span, -0.5);
    shape.lineTo(0, -0.78);
    shape.closePath();
    const wingG = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
    wingG.rotateX(-Math.PI / 2); // shape y -> -z... (x, z, -y): chord ends up on +Z
    this.geos.push(wingG);
    const tipG = new THREE.BoxGeometry(span * 0.96, 0.012, 0.025);
    this.geos.push(tipG);
    for (const sx of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.8, H(0.98), -0.7);
      const m = new THREE.Mesh(wingG, wingM);
      m.scale.x = sx;
      m.castShadow = true;
      const tip = new THREE.Mesh(tipG, blue.clone());
      this.mats.push(tip.material as AnyMat);
      tip.position.set(sx * span * 0.5, 0.03, 0.78 * 0.5);
      g.add(m, tip);
      this.root.add(g);
      this.wingG.push({ g, sx });
      g.rotation.y = sx * (Math.PI / 2); // folded
    }

    // ---- VTOL THRUSTER ARMS: slide out of the four corners ----
    const armM = this.pbr(0x8e97a2, { metalness: 0.8, roughness: 0.35 });
    const ringG = new THREE.TorusGeometry(0.52, 0.045, 8, 28);
    const bladeG = new THREE.BoxGeometry(1.0, 0.012, 0.09);
    const discG = new THREE.CircleGeometry(0.5, 28);
    const hubG2 = new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12);
    const glowG = new THREE.ConeGeometry(0.4, 1.6, 14, 1, true);
    glowG.translate(0, -0.8, 0); // apex at the pod, opening downwards
    this.geos.push(ringG, bladeG, discG, hubG2, glowG);
    const barG = new THREE.BoxGeometry(1, 0.07, 0.1);
    this.geos.push(barG);
    const L = 1.15;
    for (const sx of [1, -1]) {
      for (const z of [1.55, -1.55]) {
        const g = new THREE.Group();
        g.position.set(sx * 0.8, H(z > 0 ? 0.78 : 0.74), z); // arm root on the body; the pod rises above wheel / body height when it deploys
        const bar = new THREE.Mesh(barG, armM);
        bar.castShadow = true;
        const pod = new THREE.Group();
        const ring = new THREE.Mesh(ringG, armM);
        ring.rotation.x = Math.PI / 2;
        const rotor = new THREE.Group();
        rotor.add(new THREE.Mesh(bladeG, carbon), new THREE.Mesh(hubG2, chrome));
        const b2 = new THREE.Mesh(bladeG, carbon);
        b2.rotation.y = Math.PI / 2;
        rotor.add(b2);
        rotor.position.y = 0.04;
        const discM = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const disc = new THREE.Mesh(discG, discM);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.045;
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x57b8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const glow = new THREE.Mesh(glowG, glowMat);
        glow.position.y = -0.02;
        pod.add(ring, rotor); // no light cone / glow disc: the rotors are plain drone rotors
        void disc; void glow;
        this.mats.push(discM as unknown as AnyMat, glowMat as unknown as AnyMat);
        g.add(bar, pod);
        this.root.add(g);
        this.armG.push({ g, sx, bar, pod, rotor, disc, glow, glowM: glowMat, discM });
        pod.visible = false;
        bar.visible = false;
        void L;
      }
    }
    this.setFlightPose(0, 0, 0);
  }

  /** Suprim animation: `open` 0..1 = wings out + thruster arms extended, `thrust` 0..1 = rotors spinning, exhaust glowing. */
  setFlightPose(open: number, thrust: number, dt: number): void {
    if (!this.wingG.length) return;
    const e = open * open * (3 - 2 * open); // smooth
    // wings: completely hidden while folded (normal car look), swing out when deploying
    for (const w of this.wingG) {
      w.g.visible = e > 0.015;
      w.g.rotation.y = w.sx * (Math.PI / 2) * (1 - e);
    }
    // The two crossed blades look identical every 90 deg (1.57 rad): at 96 rad/s and 60 fps the step per frame is ~1.6 rad, so the
    // rotor looked frozen (wagon-wheel effect). The step per frame is capped well below 45 deg, so it always visibly turns forward.
    this.rotorAngle += Math.min(dt * (8 + thrust * 90), 0.5);
    const L = 1.15;
    const RISE = 0.5; // the drone pods end up this far above their arm roots (above the wheels / body line)
    for (const a of this.armG) {
      const ext = Math.max(0.001, e) * L;
      const rise = e * RISE;
      const vis = e > 0.02;
      const len = Math.hypot(ext, rise);
      a.bar.visible = vis;
      a.pod.visible = vis;
      a.bar.scale.x = len;
      a.bar.position.set((a.sx * ext) / 2, rise / 2, 0);
      a.bar.rotation.z = a.sx * Math.atan2(rise, ext);
      a.pod.position.set(a.sx * ext, rise, 0);
      a.pod.scale.setScalar(Math.max(0.01, e));
      a.rotor.rotation.y = this.rotorAngle * (a.sx > 0 ? 1 : -1);
      a.discM.opacity = 0;
      a.glowM.opacity = 0;
      a.glow.visible = false;
      a.disc.visible = false;
      a.rotor.visible = true;
    }
  }

  /** EVCity electric sport bike: silver body, teal accents, no engine / exhaust (battery pack instead), fairing turns with the bars. */
  private bike(): void {
    const body = this.mat(this.spec.look.body);
    const dark = this.mat(this.spec.look.accent);
    const black = this.mat(0x0e1012);
    const chrome = this.mat(0xaeb4ba);
    const alu = this.mat(0x8c939a);
    const teal = this.mat(EV_TEAL, { emissive: 0x0c6f5c });
    const tealDeep = this.mat(0x14a890, { emissive: 0x06382f });
    const lamp = this.mat(0xd8fff6, { emissive: 0x2ee6c8 });
    const tail = this.mat(0xcc1111, { emissive: 0x660000 });
    const amber = this.mat(0xffa21a, { emissive: 0x553300 });
    const glass = this.mat(0x172431, { transparent: true, opacity: 0.5 });
    const plate = this.mat(0xe9e6d8);
    const wr = this.spec.wheelRadius;
    const gy = this.gy;
    const W = this.spec.wheelbaseHalf; // front axle z; the rear axle is at -W
    const P = (x: number, h: number, z: number): number[] => [x, gy + h, z]; // [x, height above ground, z] -> chassis-local point

    // ---- frame: twin aluminium spars from the steering head back to the swing-arm pivot, sub-frame under the seat ----
    const head = [0, 0.84, 0.47];
    const pivotZ = -0.36;
    const pivotH = 0.47;
    for (const sx of [1, -1]) {
      this.tube(P(sx * 0.1, head[1] - 0.04, head[2] - 0.04), P(sx * 0.115, 0.6, -0.12), 0.024, alu, 0); // main spar (upper run)
      this.tube(P(sx * 0.115, 0.6, -0.12), P(sx * 0.12, pivotH + 0.04, pivotZ + 0.02), 0.026, alu, 0);
      this.tube(P(sx * 0.1, 0.62, -0.1), P(sx * 0.08, 0.7, -0.78), 0.016, dark, 0); // sub-frame
      this.tube(P(sx * 0.11, 0.48, 0.3), P(sx * 0.12, 0.34, -0.1), 0.02, dark, 0); // lower cradle
    }
    this.boxG(0.27, 0.3, 0.46, tealDeep, 0, 0.42, 0.06, 3); // battery pack (teal casing, seen below the tank)
    // ---- swing arm, hub motor + belt drive, shock ----
    for (const sx of [1, -1]) {
      this.tube(P(sx * 0.12, pivotH, pivotZ), P(sx * 0.115, wr, -W), 0.03, alu, 0); // swing-arm leg
      this.boxG(0.04, 0.12, 0.1, dark, sx * 0.115, wr, -W, 0); // axle plate
    }
    this.boxG(0.04, 0.05, 0.62, black, 0.125, 0.4, -0.54, 3); // drive belt (left side)
    this.mesh(this.cyl(0.075, 0.2, 14), black, 0, gy + pivotH, pivotZ, this.root).rotation.z = Math.PI / 2; // motor
    this.tube(P(0, 0.72, -0.42), P(0, 0.4, pivotZ - 0.06), 0.022, chrome, 3); // rear shock
    this.tube(P(0, 0.62, -0.4), P(0, 0.5, pivotZ - 0.05), 0.04, teal, 3); // shock spring
    // ---- bodywork (lofted shells) ----
    // tail: raised pillion cowl, narrow at the tip
    this.loft(
      [
        { z: -1.02, w: 0.07, hb: 0.74, ht: 0.83, r: 0.03 },
        { z: -0.9, w: 0.12, hb: 0.7, ht: 0.85, r: 0.05 },
        { z: -0.7, w: 0.16, hb: 0.67, ht: 0.84, r: 0.06 },
        { z: -0.55, w: 0.165, hb: 0.65, ht: 0.8, r: 0.06 },
      ],
      body,
      2,
    );
    // pillion pad and rider seat (dark, stepped)
    this.loft(
      [
        { z: -0.88, w: 0.1, hb: 0.8, ht: 0.865, r: 0.03 },
        { z: -0.7, w: 0.14, hb: 0.78, ht: 0.87, r: 0.04 },
        { z: -0.52, w: 0.15, hb: 0.76, ht: 0.82, r: 0.04 },
      ],
      black,
      3,
    );
    this.loft(
      [
        { z: -0.58, w: 0.13, hb: 0.72, ht: 0.8, r: 0.03 },
        { z: -0.4, w: 0.16, hb: 0.68, ht: 0.795, r: 0.04 },
        { z: -0.2, w: 0.15, hb: 0.68, ht: 0.79, r: 0.04 },
        { z: 0.0, w: 0.11, hb: 0.7, ht: 0.8, r: 0.035 },
      ],
      black,
      4,
    );
    // tank / battery cover: narrow where the knees grip, wider and higher at the front
    this.loft(
      [
        { z: -0.1, w: 0.09, hb: 0.62, ht: 0.83, r: 0.04 },
        { z: 0.1, w: 0.085, hb: 0.6, ht: 0.88, r: 0.04 },
        { z: 0.28, w: 0.13, hb: 0.6, ht: 0.94, r: 0.06 },
        { z: 0.44, w: 0.16, hb: 0.64, ht: 0.95, r: 0.07 },
        { z: 0.54, w: 0.13, hb: 0.7, ht: 0.93, r: 0.06 },
      ],
      body,
      3,
    );
    // fixed fairing: nose cowl and side panels (widest over the front wheel, narrowing to the nose)
    this.loft(
      [
        { z: 0.28, w: 0.17, hb: 0.62, ht: 0.9, r: 0.07 },
        { z: 0.42, w: 0.19, hb: 0.58, ht: 0.97, r: 0.09 },
        { z: 0.58, w: 0.195, hb: 0.6, ht: 0.96, r: 0.1 },
        { z: 0.78, w: 0.16, hb: 0.68, ht: 0.95, r: 0.09 },
        { z: 0.93, w: 0.11, hb: 0.72, ht: 0.9, r: 0.06 },
        { z: 1.0, w: 0.07, hb: 0.73, ht: 0.85, r: 0.04 },
      ],
      body,
      2,
    );
    // belly pan around the battery (ends before the front tyre)
    this.loft(
      [
        { z: -0.2, w: 0.12, hb: 0.3, ht: 0.55, r: 0.05 },
        { z: 0.0, w: 0.175, hb: 0.24, ht: 0.58, r: 0.06 },
        { z: 0.3, w: 0.185, hb: 0.22, ht: 0.6, r: 0.07 },
        { z: 0.38, w: 0.13, hb: 0.26, ht: 0.58, r: 0.06 },
      ],
      body,
      1,
    );
    // ---- fairing details: screen, headlights, intake, signals, stripes, tail light, plate ----
    const screen = this.boxG(0.26, 0.27, 0.012, glass, 0, 1.06, 0.5, 4);
    screen.rotation.x = -1.0;
    for (const sx of [1, -1]) {
      const l = this.boxG(0.1, 0.035, 0.03, lamp, sx * 0.065, 0.83, 0.975, 2); // cyan LED headlight
      l.rotation.set(0, sx * 0.55, sx * -0.12);
      this.boxG(0.015, 0.03, 0.06, amber, sx * 0.185, 0.9, 0.62, 2); // indicator on the fairing side
      this.boxG(0.012, 0.035, 0.6, teal, sx * 0.166, 0.43, 0.15, 1); // teal stripe on the belly pan
      this.boxG(0.012, 0.03, 0.3, teal, sx * 0.196, 0.88, 0.5, 2).rotation.set(0, 0, 0); // teal stripe on the fairing
      this.boxG(0.012, 0.03, 0.4, teal, sx * 0.168, 0.74, -0.7, 2); // teal stripe on the tail
      this.logo('wordmark', false, 0.26, 0.065, sx * 0.2, gy + 0.8, 0.5, sx * (Math.PI / 2), 2); // on the fairing
      this.logo('wordmark', false, 0.3, 0.075, sx * 0.1865, gy + 0.4, 0.15, sx * (Math.PI / 2), 1); // on the belly pan
      this.logo('wordmark', false, 0.22, 0.055, sx * 0.168, gy + 0.78, -0.7, sx * (Math.PI / 2), 2); // on the tail
    }
    this.boxG(0.09, 0.03, 0.02, black, 0, 0.77, 0.998, 2); // air intake slot under the lamps
    this.logo('mark', false, 0.075, 0.075, 0, gy + 0.8, 1.003, 0, 2); // EVCity mark on the nose
    this.boxG(0.17, 0.025, 0.02, tail, 0, 0.8, -1.03, 3); // LED tail light
    this.boxG(0.012, 0.025, 0.05, amber, 0.1, 0.78, -1.0, 3).rotation.y = 0.5;
    this.boxG(0.012, 0.025, 0.05, amber, -0.1, 0.78, -1.0, 3).rotation.y = -0.5;
    this.boxG(0.2, 0.13, 0.01, plate, 0, 0.66, -1.02, 3); // number plate
    this.logo('mark', false, 0.075, 0.075, 0, gy + 0.855, -1.045, Math.PI, 3); // EVCity mark above the plate
    // ---- foot pegs (rider rear-sets, pillion pegs) with brackets ----
    for (const sx of [1, -1]) {
      this.tube(P(sx * 0.11, 0.52, -0.3), P(sx * 0.17, 0.32, -0.19), 0.014, alu, 0);
      this.tube(P(sx * 0.14, 0.32, -0.19), P(sx * 0.24, 0.32, -0.19), 0.013, chrome, 0);
      this.tube(P(sx * 0.1, 0.56, -0.7), P(sx * 0.16, 0.3, -0.63), 0.012, alu, 0);
      this.tube(P(sx * 0.12, 0.3, -0.63), P(sx * 0.2, 0.3, -0.63), 0.012, chrome, 0);
    }
    // ---- the steering assembly: everything in here turns with the bars, about the raked steering axis ----
    this.frontFork = (g: THREE.Group, wheelFrame: THREE.Group) => {
      // g: local +Y is the steering axis (up and back by `rake`), origin = front axle. wheelFrame: same origin, axes level.
      const topY = 0.62;
      for (const sx of [1, -1]) {
        this.tube([sx * 0.095, 0.3, 0], [sx * 0.095, topY - 0.02, 0], 0.024, dark, 0, g); // upside-down fork: thick upper tube
        this.tube([sx * 0.095, 0.0, 0], [sx * 0.095, 0.31, 0], 0.017, chrome, 0, g); // slim lower tube
        this.mesh(new THREE.BoxGeometry(0.03, 0.07, 0.05), dark, sx * 0.1, 0.02, 0, g); // axle lug
        this.mesh(new THREE.BoxGeometry(0.035, 0.09, 0.07), black, sx * 0.095, 0.11, -0.045, g); // brake caliper
        // clip-on handlebar from the fork top to the grip, rubber grip, mirror on a stalk, brake lever
        this.tube([sx * 0.095, topY, 0.0], [sx * 0.31, 0.7, -0.1], 0.013, alu, 0, g);
        this.tube([sx * 0.3, 0.7, -0.1], [sx * 0.36, 0.7, -0.1], 0.017, black, 0, g);
        this.tube([sx * 0.3, 0.71, -0.1], [sx * 0.33, 0.82, -0.04], 0.007, dark, 0, g);
        const m = this.mesh(new THREE.BoxGeometry(0.11, 0.065, 0.014), body, sx * 0.335, 0.86, -0.04, g);
        m.rotation.set(0.25, sx * -0.25, 0);
        this.mesh(new THREE.BoxGeometry(0.1, 0.014, 0.016), black, sx * 0.3, 0.725, 0.04, g);
      }
      this.mesh(new THREE.BoxGeometry(0.2, 0.035, 0.07), dark, 0, topY, 0, g); // triple clamp
      this.mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), black, 0, topY + 0.045, -0.03, g); // dash
      // front mudguard over the tyre (wheel-aligned frame): follows the tyre radius
      const fs: Section[] = [];
      for (const dz of [-0.31, -0.22, -0.12, 0, 0.12, 0.22, 0.31]) {
        const top = Math.sqrt(Math.max(0, (wr + 0.03) ** 2 - dz * dz));
        fs.push({ z: dz, w: 0.075, hb: wr + top - 0.03, ht: wr + top, r: 0.02 });
      }
      this.loft(fs, body, 0, wheelFrame, -wr);
    };
  }

  private evbike(): void {
    const body = this.carPaint(this.spec.look.body);
    const carbon = this.pbr(this.spec.look.accent, { metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const chrome = this.chromeMat();
    const teal = this.mat(EV_TEAL, { emissive: 0x12a98f });
    const lamp = this.pbr(0xeaffff, { emissive: 0x2ee6c8, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0 });
    const tail = this.mat(0xe01010, { emissive: 0xa00000 });
    const glass = this.pbr(0x10202c, { metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.5, envMapIntensity: 1.5 });
    const wr = this.spec.wheelRadius; // wheel centre height above the ground
    // ---- frame, battery pack, swing arm, motor, shock ----
    this.boxG(0.14, 0.2, 1.0, carbon, 0, 0.52, 0); // frame
    this.boxG(0.26, 0.22, 0.62, carbon, 0, 0.42, 0.05, 3); // battery pack
    this.boxG(0.18, 0.015, 0.5, teal, 0, 0.3, 0.05, 3); // glowing underside
    this.boxG(0.22, 0.16, 0.16, carbon, 0, 0.36, -0.2); // motor housing
    const shock = this.boxG(0.04, 0.3, 0.04, chrome, 0, 0.55, -0.35, 3);
    shock.rotation.x = 0.5;
    for (const sx of [1, -1]) {
      this.boxG(0.045, 0.07, 0.6, carbon, sx * 0.115, 0.36, -0.45); // swing arm
      this.boxG(0.012, 0.03, 0.5, teal, sx * 0.132, 0.42, 0.05, 3); // battery light strip
    }
    // ---- tank cover, side fairings, tail (pearl white) ----
    this.loft(
      [
        { z: -0.1, w: 0.1, hb: 0.66, ht: 0.88, r: 0.05 },
        { z: 0.1, w: 0.16, hb: 0.62, ht: 0.95, r: 0.07 },
        { z: 0.38, w: 0.17, hb: 0.62, ht: 0.96, r: 0.07 },
        { z: 0.6, w: 0.12, hb: 0.66, ht: 0.9, r: 0.05 },
      ],
      body,
      2,
    );
    this.loft(
      [
        { z: -0.25, w: 0.14, hb: 0.3, ht: 0.7, r: 0.05 },
        { z: 0.1, w: 0.2, hb: 0.27, ht: 0.8, r: 0.07 },
        { z: 0.45, w: 0.18, hb: 0.34, ht: 0.84, r: 0.07 },
        { z: 0.52, w: 0.12, hb: 0.62, ht: 0.82, r: 0.05 },
      ],
      body,
      2,
    );
    this.loft(
      [
        { z: -1.0, w: 0.05, hb: 0.7, ht: 0.8, r: 0.025 },
        { z: -0.65, w: 0.1, hb: 0.68, ht: 0.84, r: 0.04 },
        { z: -0.3, w: 0.13, hb: 0.66, ht: 0.84, r: 0.05 },
      ],
      body,
      3,
    );
    this.boxG(0.2, 0.06, 0.5, carbon, 0, 0.84, -0.25, 4); // seat
    this.boxG(0.18, 0.025, 0.02, tail, 0, 0.78, -1.01, 3); // tail light bar
    for (const sx of [1, -1]) {
      this.boxG(0.012, 0.025, 0.5, teal, sx * 0.203, 0.45, 0.12, 2); // teal side stripe
      this.logo('wordmark', false, 0.34, 0.085, sx * 0.205, this.gy + 0.58, 0.12, sx * (Math.PI / 2), 2); // on the fairing
    }
    // ---- fork, clip-on bars, nose fairing, screen, LED lamps, winglets, mirrors (all turn with the front wheel) ----
    this.frontFork = (g: THREE.Group) => {
      const y = (h: number) => h - wr; // height above ground -> local to the wheel centre
      for (const sx of [1, -1]) {
        this.mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), chrome, sx * 0.09, 0.3, 0, g); // fork leg
        this.mesh(new THREE.BoxGeometry(0.24, 0.03, 0.03), carbon, sx * 0.18, y(0.82), -0.12, g); // clip-on bar
        this.mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), carbon, sx * 0.22, y(0.93), -0.1, g); // mirror stem
        this.mesh(new THREE.BoxGeometry(0.07, 0.04, 0.03), carbon, sx * 0.23, y(0.96), -0.1, g); // mirror
        const wing = this.mesh(new THREE.BoxGeometry(0.12, 0.012, 0.09), carbon, sx * 0.2, y(0.78), 0.22, g); // aero winglet
        wing.rotation.z = sx * 0.1;
        this.mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), lamp, sx * 0.1, y(0.855), 0.465, g); // LED headlamp
      }
      this.mesh(new THREE.BoxGeometry(0.13, 0.03, 0.42), carbon, 0, y(0.7), 0.02, g); // front mudguard
      this.mesh(new THREE.BoxGeometry(0.3, 0.28, 0.4), body, 0, y(0.86), 0.1, g); // fairing
      const nose = this.mesh(new THREE.BoxGeometry(0.22, 0.16, 0.26), body, 0, y(0.8), 0.32, g);
      nose.rotation.x = -0.25;
      const screen = this.mesh(new THREE.BoxGeometry(0.22, 0.24, 0.02), glass, 0, y(1.08), -0.02, g);
      screen.rotation.x = -0.55;
      this.mesh(new THREE.BoxGeometry(0.24, 0.012, 0.02), teal, 0, y(0.79), 0.465, g); // teal DRL line
      this.logo('mark', false, 0.08, 0.08, 0, y(0.86), 0.458, 0, 0, g); // EVCity mark on the nose
      for (const sx of [1, -1]) this.logo('wordmark', false, 0.26, 0.065, sx * 0.152, y(0.87), 0.1, sx * (Math.PI / 2), 0, g);
    };
  }

  /** Dhaka cycle-rickshaw: bicycle front half, painted tin carriage with a folding hood, spoked wheels. */
  private rickshaw(): void {
    const body = this.mat(this.spec.look.body);
    const gold = this.mat(this.spec.look.accent);
    const dark = this.mat(0x1c1c1e);
    const steel = this.mat(0xb9bec4);
    const leather = this.mat(0x2a1d16);
    const cloth = this.mat(0xb8352a, { side: THREE.DoubleSide });
    const cushion = this.mat(0xc8402e);
    const teal = this.mat(EV_TEAL, { emissive: 0x0d6f5d });
    const lampM = this.mat(0xfff4c0, { emissive: 0x806a20 });
    const tailM = this.mat(0xd01818, { emissive: 0x4d0505 });
    const art = [0xe84a3a, 0xf2c230, 0x2fb36b, 0xf4f1e8, 0x7a3aa8].map((c) => this.mat(c));

    // ---- bicycle half: frame, crank, saddle ----
    this.utube([0, 0.97, 0.86], [0, 0.9, 0.3], 0.022, dark, 0); // top tube
    this.utube([0, 0.95, 0.84], [0, 0.4, 0.5], 0.026, dark, 0); // down tube
    this.utube([0, 0.4, 0.5], [0, 0.9, 0.3], 0.02, dark, 0); // seat tube
    this.utube([0, 0.4, 0.5], [0, 0.42, -0.6], 0.02, dark, 0); // main beam into the carriage
    this.ucyl(0.035, 0.035, 0.2, steel, 0, 0.4, 0.5, 'x', 4, this.root, 10); // bottom bracket
    this.ucyl(0.1, 0.1, 0.012, steel, 0.075, 0.4, 0.5, 'x', 4, this.root, 18); // chain ring
    this.rbox(0.012, 0.03, 1.1, 0.004, dark, 0.075, 0.41, -0.05, 4); // chain
    for (const [s, y] of [[1, 1], [-1, -1]] as const) {
      this.utube([s * 0.1, 0.4, 0.5], [s * 0.1, 0.4 + y * 0.17, 0.5 + 0.0], 0.012, steel, 4, this.root, 5);
      this.rbox(0.1, 0.02, 0.07, 0.008, dark, s * 0.14, 0.4 + y * 0.17, 0.5, 4); // pedals
    }
    this.utube([0, 0.9, 0.3], [0, 0.72, 0.32], 0.016, steel, 4); // seat post
    this.rbox(0.18, 0.06, 0.28, 0.025, leather, 0, 0.93, 0.36, 4); // saddle
    this.rbox(0.07, 0.07, 0.07, 0.02, dark, 0, 0.88, 0.4, 4);

    // ---- carriage: floor, tin seat, painted back panel, low sides, folding hood ----
    this.utube([0.3, 0.45, 0.4], [0.3, 0.45, -1.08], 0.018, dark, 0); // chassis rails
    this.utube([-0.3, 0.45, 0.4], [-0.3, 0.45, -1.08], 0.018, dark, 0);
    this.ucyl(0.02, 0.02, 1.08, steel, 0, 0.34, -0.55, 'x', 0, this.root, 8); // rear axle
    this.rbox(0.96, 0.04, 1.12, 0.015, gold, 0, 0.46, -0.52, 1); // floor
    this.rbox(0.9, 0.04, 0.2, 0.015, gold, 0, 0.5, 0.12, 2); // foot board
    this.rbox(0.78, 0.14, 0.52, 0.05, cushion, 0, 0.57, -0.55, 2); // seat cushion
    const back = this.rbox(0.8, 0.52, 0.09, 0.04, cushion, 0, 0.9, -0.82, 2); // padded back
    back.rotation.x = -0.14;
    this.rbox(0.92, 0.62, 0.04, 0.02, body, 0, 0.9, -0.97, 2); // tin back panel
    for (const [w, h, x, y] of [[0.92, 0.035, 0, 1.2], [0.92, 0.035, 0, 0.6], [0.035, 0.62, 0.455, 0.9], [0.035, 0.62, -0.455, 0.9]] as const) this.rbox(w, h, 0.05, 0.01, gold, x, y, -0.97, 2);
    for (let i = 0; i < 5; i++) {
      const d = this.ucyl(i === 2 ? 0.1 : 0.06, i === 2 ? 0.1 : 0.06, 0.012, art[i], -0.3 + i * 0.15, 0.9 + (i % 2 ? 0.14 : -0.14) * (i === 2 ? 0 : 1), -0.995, 'z', 2, this.root, 14);
      d.castShadow = false;
    }
    this.logo('wordmark', true, 0.42, 0.115, 0, this.gy + 0.74, -0.998, Math.PI, 2);
    for (const s of [-1, 1]) {
      this.rbox(0.04, 0.3, 0.98, 0.015, body, s * 0.47, 0.64, -0.5, 2);
      this.rbox(0.045, 0.03, 1.0, 0.01, gold, s * 0.47, 0.8, -0.5, 2);
      this.rbox(0.045, 0.03, 1.0, 0.01, teal, s * 0.47, 0.5, -0.5, 3);
      this.guard(0.4, 0.07, body, s * 0.52, 0.34, -0.55, 2); // rear mudguards
      this.utube([s * 0.5, 0.74, -0.18], [s * 0.5, 0.97, -0.18], 0.012, dark, 3); // hood struts
      this.utube([s * 0.5, 0.74, -0.9], [s * 0.5, 0.97, -0.9], 0.012, dark, 3);
    }
    // folding hood: canvas over three bows
    const hoodG = new THREE.CylinderGeometry(0.53, 0.53, 0.82, 16, 1, true, Math.PI / 2, Math.PI);
    hoodG.rotateX(Math.PI / 2);
    this.reg(this.mesh(hoodG, cloth, 0, this.gy + 0.97, -0.55), 3, this.root);
    for (const z of [-0.14, -0.55, -0.96]) {
      const bow = new THREE.TorusGeometry(0.53, 0.014, 5, 18, Math.PI);
      this.reg(this.mesh(bow, dark, 0, this.gy + 0.97, z), 3, this.root);
    }
    // lights, plate
    for (const s of [-1, 1]) this.rbox(0.06, 0.04, 0.03, 0.01, tailM, s * 0.38, 0.5, -1.1, 3);
    this.rbox(0.2, 0.1, 0.02, 0.008, this.mat(0xf1d34a), 0, 0.42, -1.1, 3);

    // ---- front fork, mudguard, handlebar, lamp (turns with the wheel; local y = height above the wheel centre) ----
    this.frontFork = (g: THREE.Group) => {
      for (const s of [-1, 1]) this.utube([s * 0.05, 0, 0], [s * 0.03, 0.6, -0.07], 0.014, dark, 4, g);
      this.ucyl(0.02, 0.02, 0.12, dark, 0, 0.62, -0.07, 'x', 4, g, 8); // crown
      this.utube([0, 0.62, -0.07], [0, 0.76, -0.14], 0.016, steel, 4, g); // stem
      this.ucyl(0.011, 0.011, 0.58, steel, 0, 0.77, -0.14, 'x', 4, g, 8); // bars
      for (const s of [-1, 1]) {
        this.utube([s * 0.29, 0.77, -0.14], [s * 0.31, 0.73, -0.27], 0.011, steel, 4, g, 6);
        this.ucyl(0.016, 0.016, 0.1, dark, s * 0.31, 0.73, -0.3, 'z', 4, g, 8);
        this.utube([s * 0.27, 0.78, -0.16], [s * 0.2, 0.78, -0.1], 0.006, dark, 4, g, 5);
      }
      const bell = this.mesh(new THREE.SphereGeometry(0.035, 10, 8), steel, 0.13, 0.82, -0.12, g);
      this.reg(bell, 4, g);
      this.guard(0.385, 0.075, body, 0, 0.0, 0, 4, g, Math.PI * 0.82); // front mudguard
      this.rbox(0.1, 0.07, 0.06, 0.025, lampM, 0, 0.55, 0.06, 4, g); // headlamp
      this.rbox(0.1, 0.012, 0.062, 0.004, teal, 0, 0.6, 0.06, 4, g);
    };
  }

  /** CNG auto-rickshaw (Bajaj style): green rounded cowl, black hood, wire-mesh side doors, handlebar steering, wheel-arch side panels. */
  private auto(): void {
    const green = this.mat(this.spec.look.body);
    const dgreen = this.mat(new THREE.Color(this.spec.look.body).multiplyScalar(0.72).getHex());
    const black = this.mat(0x1b1e22);
    const hood = this.mat(0x16181b);
    const chrome = this.mat(0xcfd5da);
    const teal = this.mat(EV_TEAL, { emissive: 0x0d6f5d });
    const glass = this.mat(0x1a2b38, { transparent: true, opacity: 0.4 });
    const lens = this.mat(0xfff4c0, { emissive: 0x806a20 });
    const amber = this.mat(0xffa21a, { emissive: 0x6a3d00 });
    const tail = this.mat(0xd01818, { emissive: 0x4d0505 });
    const seatM = this.mat(0x23272c);
    const plate = this.mat(0xf1d34a);
    const WZ = -0.8;

    // ---- shell: floor pan, side panels with wheel arches, front cowl, rear engine cover ----
    this.rbox(1.12, 0.1, 2.0, 0.03, black, 0, 0.4, -0.38, 0);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 0.57 : -0.71;
      const poly: [number, number][] = [[-1.28, 0.44], ...this.arch(WZ, 0.28, 0.4, 0.44), [0.42, 0.44], [0.42, 0.88], [-1.28, 0.88]];
      this.profile(poly, x0, x0 + 0.14, 0.02, green, 0);
    }
    this.uloft([
      { z: 0.28, w: 0.7, hb: 0.42, ht: 0.94, r: 0.12 },
      { z: 0.5, w: 0.72, hb: 0.44, ht: 1.02, r: 0.14 },
      { z: 0.9, w: 0.6, hb: 0.5, ht: 1.04, r: 0.2 },
      { z: 1.15, w: 0.44, hb: 0.62, ht: 0.98, r: 0.2 },
      { z: 1.38, w: 0.24, hb: 0.64, ht: 0.8, r: 0.14 },
    ], green, 0);
    this.rbox(1.34, 0.64, 0.44, 0.1, green, 0, 0.7, -1.2, 0); // rear engine cover
    this.rbox(1.26, 0.18, 0.1, 0.05, dgreen, 0, 0.5, -1.45, 2); // rear apron
    this.guard(0.33, 0.2, green, 0, 0.29, 1.15, 2); // front mudguard
    this.rbox(0.56, 0.05, 0.05, 0.02, chrome, 0, 0.62, 1.42, 1); // front bumper bar
    this.rbox(0.24, 0.14, 0.03, 0.02, black, 0, 0.78, 1.38, 3); // face plate
    this.ucyl(0.1, 0.1, 0.07, chrome, 0, 0.93, 1.34, 'z', 3, this.root, 16); // headlamp bezel
    this.ucyl(0.085, 0.085, 0.075, lens, 0, 0.93, 1.345, 'z', 3, this.root, 16);
    for (const s of [-1, 1]) {
      this.rbox(0.07, 0.07, 0.05, 0.02, amber, s * 0.34, 0.86, 1.08, 3); // indicators
      this.rbox(0.07, 0.1, 0.04, 0.02, tail, s * 0.58, 0.72, -1.43, 3);
      this.rbox(0.07, 0.07, 0.05, 0.02, amber, s * 0.7, 0.76, -1.34, 3);
    }
    this.rbox(0.34, 0.14, 0.02, 0.01, plate, 0, 0.44, -1.47, 3);
    this.logo('wordmark', true, 0.74, 0.2, 0.706, this.gy + 0.65, -0.35, Math.PI / 2, 2);
    this.logo('wordmark', true, 0.74, 0.2, -0.706, this.gy + 0.65, -0.35, -Math.PI / 2, 2);
    this.logo('mark', true, 0.2, 0.2, 0, this.gy + 0.7, -1.482, Math.PI, 2);
    for (const s of [-1, 1]) this.rbox(0.012, 0.035, 1.5, 0.005, teal, s * 0.713, 0.8, -0.45, 3);
    for (const s of [-1, 1]) this.rbox(0.14, 0.03, 1.0, 0.012, black, s * 0.68, 0.3, -0.1, 3); // step board

    // ---- canopy: black hood, posts, raked windscreen, rear window ----
    this.uloft([
      { z: -1.42, w: 0.6, hb: 1.55, ht: 1.66, r: 0.1 },
      { z: -1.25, w: 0.76, hb: 1.62, ht: 1.74, r: 0.14 },
      { z: -0.4, w: 0.8, hb: 1.66, ht: 1.79, r: 0.14 },
      { z: 0.15, w: 0.78, hb: 1.62, ht: 1.75, r: 0.14 },
      { z: 0.5, w: 0.72, hb: 1.5, ht: 1.64, r: 0.14 },
    ], hood, 3);
    for (const s of [-1, 1]) {
      this.utube([s * 0.7, 1.0, 0.62], [s * 0.67, 1.62, 0.32], 0.022, black, 4); // A posts
      this.utube([s * 0.68, 0.88, -1.3], [s * 0.68, 1.62, -1.3], 0.022, black, 4); // rear posts
      this.utube([s * 0.7, 1.5, 0.3], [s * 0.7, 1.5, -1.3], 0.014, black, 4); // door top rail
      this.utube([s * 0.7, 0.9, 0.3], [s * 0.7, 0.9, -1.3], 0.014, black, 4);
      // wire-mesh side doors
      const bars: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 14; i++) bars.push(new THREE.BoxGeometry(0.01, 0.6, 0.01).translate(s * 0.7, 1.2, 0.26 - i * 0.116));
      for (const y of [1.05, 1.2, 1.35]) bars.push(new THREE.BoxGeometry(0.008, 0.008, 1.52).translate(s * 0.7, y, -0.5));
      this.fuse(bars, black, 4);
    }
    const ws = this.rbox(1.32, 0.7, 0.03, 0.02, glass, 0, 1.33, 0.46, 4);
    ws.rotation.x = -0.46;
    this.rbox(1.2, 0.6, 0.03, 0.02, glass, 0, 1.2, -1.42, 4); // rear window
    const wiper = this.rbox(0.5, 0.012, 0.015, 0.005, black, 0.2, 1.1, 0.56, 4);
    wiper.rotation.z = 0.15;
    for (const s of [-1, 1]) {
      this.utube([s * 0.7, 1.14, 0.56], [s * 0.82, 1.2, 0.5], 0.01, black, 4); // mirrors
      this.ucyl(0.07, 0.07, 0.02, chrome, s * 0.85, 1.2, 0.5, 'z', 4, this.root, 12);
    }

    // ---- seats ----
    this.rbox(0.5, 0.12, 0.42, 0.04, seatM, 0, 0.55, 0.0, 4); // driver
    this.rbox(0.5, 0.42, 0.08, 0.03, seatM, 0, 0.82, -0.24, 4);
    this.rbox(1.18, 0.12, 0.52, 0.04, seatM, 0, 0.52, -0.85, 4); // rear bench
    this.rbox(1.18, 0.5, 0.09, 0.04, seatM, 0, 0.85, -1.12, 4);
    this.rbox(1.18, 0.07, 0.07, 0.02, chrome, 0, 1.12, -1.12, 4); // grab bar

    // ---- handlebar + fork (turns with the front wheel; local y = height above the wheel centre) ----
    this.frontFork = (g: THREE.Group) => {
      this.utube([0, 0, 0], [0, 0.78, -0.56], 0.03, chrome, 4, g);
      this.rbox(0.18, 0.1, 0.16, 0.03, black, 0, 0.8, -0.56, 4, g); // head cowl / speedometer
      this.ucyl(0.014, 0.014, 0.66, black, 0, 0.84, -0.56, 'x', 4, g, 8);
      for (const s of [-1, 1]) {
        this.ucyl(0.022, 0.022, 0.12, black, s * 0.33, 0.84, -0.56, 'x', 4, g, 8); // grips
        this.utube([s * 0.3, 0.84, -0.56], [s * 0.3, 0.88, -0.45], 0.008, black, 4, g, 5); // levers
      }
    };
  }

  /** EVCity electric city bus (like the one in the brand picture): pearl-white body, black glass, teal light strips, real wheel arches. */
  private bus(): void {
    const white = this.mat(this.spec.look.body); // pearl white by default (traffic buses get silver tints)
    const silver = this.mat(0xaab3b8);
    const dark = this.mat(0x12171b);
    const trim = this.mat(0x2b3238);
    const teal = this.mat(EV_TEAL, { emissive: 0x0d6f5d });
    const glass = this.mat(0x0f1a22, { transparent: true, opacity: 0.55 });
    const lampW = this.mat(0xf2fbff, { emissive: 0xa9dcff });
    const tail = this.mat(0xd01818, { emissive: 0x4d0505 });
    const seatM = this.mat(0x15857a);
    const seatD = this.mat(0x222c33);
    const pole = this.mat(0xd2d9dd);
    const floorM = this.mat(0x30373d);
    const WZ = [3.5, -2.4]; // axles
    const W = 1.29;

    // ---- shell: lower body with real wheel arches, nose and tail caps, black glass band, roof ----
    const poly: [number, number][] = [[-4.85, 0.38], ...this.arch(WZ[1], 0.5, 0.68, 0.38), ...this.arch(WZ[0], 0.5, 0.68, 0.38), [4.85, 0.38], [4.85, 1.3], [-4.85, 1.3]];
    this.profile(poly, -W, W, 0.05, white, 0);
    this.uloft([
      { z: 4.8, w: W, hb: 0.38, ht: 1.3, r: 0.06, rb: 0.08 },
      { z: 5.15, w: 1.26, hb: 0.42, ht: 1.24, r: 0.1, rb: 0.12 },
      { z: 5.32, w: 1.12, hb: 0.52, ht: 1.14, r: 0.2, rb: 0.15 },
    ], white, 0);
    this.uloft([
      { z: -5.32, w: 1.12, hb: 0.52, ht: 1.3, r: 0.2, rb: 0.15 },
      { z: -5.2, w: 1.25, hb: 0.42, ht: 1.3, r: 0.12, rb: 0.12 },
      { z: -4.8, w: W, hb: 0.38, ht: 1.3, r: 0.06, rb: 0.08 },
    ], white, 0);
    // dark wheel wells + black rocker panel
    for (const z of WZ) for (const s of [-1, 1]) this.box(0.04, 1.05, 1.5, dark, s * 0.86, this.gy + 0.78, z, 0);
    for (const s of [-1, 1]) this.boxG(0.02, 0.17, 9.6, trim, s * (W + 0.006), 0.47, 0, 2);
    this.uloft([
      { z: -5.22, w: 1.18, hb: 1.3, ht: 2.34, r: 0.2, rb: 0 },
      { z: -4.95, w: 1.27, hb: 1.3, ht: 2.52, r: 0.12, rb: 0 },
      { z: -4.5, w: 1.275, hb: 1.3, ht: 2.55, r: 0.05, rb: 0 },
      { z: 4.4, w: 1.275, hb: 1.3, ht: 2.55, r: 0.05, rb: 0 },
      { z: 4.95, w: 1.26, hb: 1.3, ht: 2.5, r: 0.1, rb: 0 },
      { z: 5.23, w: 1.15, hb: 1.3, ht: 1.88, r: 0.12, rb: 0 },
    ], glass, 4);
    this.uloft([
      { z: -5.25, w: 1.12, hb: 2.4, ht: 2.92, r: 0.2, rb: 0.05 },
      { z: -4.8, w: 1.27, hb: 2.48, ht: 3.05, r: 0.28, rb: 0.04 },
      { z: 4.2, w: 1.27, hb: 2.48, ht: 3.05, r: 0.28, rb: 0.04 },
      { z: 4.95, w: 1.25, hb: 2.44, ht: 2.98, r: 0.26, rb: 0.05 },
      { z: 5.18, w: 1.17, hb: 2.4, ht: 2.74, r: 0.14, rb: 0.05 },
      { z: 5.28, w: 1.05, hb: 2.4, ht: 2.62, r: 0.1, rb: 0.05 },
    ], white, 3);
    // roof pod (battery / HVAC) with louvres
    this.uloft([
      { z: -3.7, w: 0.6, hb: 3.0, ht: 3.17, r: 0.1 },
      { z: -3.4, w: 0.86, hb: 3.0, ht: 3.3, r: 0.16 },
      { z: 1.4, w: 0.86, hb: 3.0, ht: 3.3, r: 0.16 },
      { z: 1.75, w: 0.6, hb: 3.0, ht: 3.17, r: 0.1 },
    ], silver, 3);
    const lou: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) lou.push(new THREE.BoxGeometry(1.2, 0.012, 0.07).translate(0, 3.305, -3.0 + i * 0.52));
    this.fuse(lou, trim, 3);
    this.rbox(1.6, 0.025, 0.05, 0.01, teal, 0, 2.985, 4.3, 3);

    // ---- side detailing: pillars, teal belt line, passenger doors ----
    const pil: THREE.BufferGeometry[] = [];
    for (const z of [-4.5, -3.3, -2.1, -0.95, 0.35, 1.5, 2.45, 3.85, 4.7]) for (const s of [-1, 1]) pil.push(new THREE.BoxGeometry(0.05, 1.28, 0.1).translate(s * (W + 0.0), 1.94, z));
    this.fuse(pil, white, 4);
    for (const s of [-1, 1]) this.rbox(0.012, 0.045, 9.7, 0.005, teal, s * (W + 0.008), 1.22, 0, 2);
    for (const zc of [3.15, -0.3]) {
      this.rbox(0.03, 2.02, 1.28, 0.02, dark, W + 0.012, 1.46, zc, 3); // door glass
      this.rbox(0.04, 2.0, 0.025, 0.004, silver, W + 0.02, 1.46, zc, 3); // meeting stile
      this.rbox(0.04, 0.05, 1.3, 0.004, teal, W + 0.02, 2.5, zc, 3);
    }
    this.addDoor(W, 4.9, 1.2, 0.6, 1.05, 0.06, white, silver, dark, { m: glass, h: 0.85 }); // driver's cab door (right side)

    // ---- nose: black face, teal LED eyebrows, EVCity board ----
    this.rbox(1.95, 0.56, 0.05, 0.03, dark, 0, 0.88, 5.325, 1);
    this.rbox(0.9, 0.12, 0.04, 0.02, trim, 0, 0.66, 5.345, 1); // grille
    for (const s of [-1, 1]) {
      this.rbox(0.62, 0.05, 0.04, 0.02, teal, s * 0.66, 1.08, 5.35, 2);
      this.rbox(0.28, 0.1, 0.04, 0.03, lampW, s * 0.82, 0.9, 5.35, 2);
      this.rbox(0.18, 0.06, 0.03, 0.02, lampW, s * 0.5, 0.9, 5.35, 2);
    }
    this.rbox(2.12, 0.2, 0.12, 0.06, trim, 0, 0.56, 5.28, 1); // bumper
    this.rbox(1.78, 0.3, 0.05, 0.03, dark, 0, 2.5, 5.285, 3); // destination board
    this.logo('wordmark', true, 1.2, 0.33, 0, this.gy + 2.5, 5.315, 0, 3);
    this.logo('mark', true, 0.34, 0.34, 0, this.gy + 0.9, 5.352, 0, 2);
    for (const s of [-1, 1]) {
      this.rbox(0.05, 0.38, 0.2, 0.02, dark, s * 1.47, 2.1, 5.0, 3); // mirrors
      this.rbox(0.22, 0.03, 0.03, 0.01, dark, s * 1.37, 2.1, 5.02, 3);
    }
    // wipers
    for (const s of [-1, 1]) {
      const wp = this.rbox(0.62, 0.014, 0.02, 0.005, dark, s * 0.4, 1.5, 5.215, 4);
      wp.rotation.z = s * 0.12;
    }

    // ---- tail ----
    this.rbox(1.95, 0.5, 0.05, 0.03, dark, 0, 0.9, -5.325, 2);
    for (const s of [-1, 1]) {
      this.rbox(0.1, 0.78, 0.04, 0.03, tail, s * 1.02, 1.0, -5.345, 2);
      this.rbox(0.36, 0.05, 0.04, 0.02, teal, s * 0.55, 0.64, -5.35, 2);
    }
    this.rbox(2.12, 0.2, 0.12, 0.06, trim, 0, 0.56, -5.28, 2);
    this.logo('wordmark', true, 1.0, 0.275, 0, this.gy + 0.92, -5.356, Math.PI, 2);
    // big side wordmarks
    this.logo('wordmark', false, 2.5, 0.69, W + 0.012, this.gy + 0.84, -3.2, Math.PI / 2, 1);
    this.logo('wordmark', false, 2.5, 0.69, -(W + 0.012), this.gy + 0.84, -0.1, -Math.PI / 2, 1);
    this.logo('mark', false, 0.5, 0.5, W + 0.012, this.gy + 0.86, 1.95, Math.PI / 2, 1);
    this.logo('mark', false, 0.5, 0.5, -(W + 0.012), this.gy + 0.86, 2.6, -Math.PI / 2, 1);

    // ---- interior: floor, seats (teal), poles, driver cab ----
    this.rbox(2.4, 0.05, 9.7, 0.01, floorM, 0, 0.9, 0, 4);
    const seats = [...(this.spec.seats ?? []), this.spec.seat];
    for (const st of seats) {
      const isDriver = st === this.spec.seat;
      const sm = isDriver ? seatD : seatM;
      const sy = st.y - this.gy; // hips height above the ground
      this.rbox(0.46, 0.34, 0.4, 0.04, trim, st.x, sy - 0.38, st.z, 4); // pedestal
      this.rbox(0.5, 0.12, 0.5, 0.04, sm, st.x, sy - 0.1, st.z, 4); // cushion
      this.rbox(0.5, 0.58, 0.1, 0.04, sm, st.x, sy + 0.2, st.z - 0.27, 4); // back
      this.rbox(0.32, 0.14, 0.08, 0.03, sm, st.x, sy + 0.55, st.z - 0.27, 4); // headrest
    }
    for (const [x, z] of [[0.95, 2.45], [0.95, 3.85], [0.95, 0.35], [0.95, -0.95], [-0.4, 4.4]] as const) this.ucyl(0.022, 0.022, 1.55, pole, x, 1.68, z, 'y', 4, this.root, 8);
    this.ucyl(0.02, 0.02, 9.2, pole, 0.55, 2.42, 0, 'z', 4, this.root, 8);
    this.ucyl(0.02, 0.02, 9.2, pole, -0.55, 2.42, 0, 'z', 4, this.root, 8);
    this.rbox(2.3, 0.5, 0.55, 0.05, dark, 0, 1.5, 4.8, 4); // dashboard
    this.rbox(0.5, 0.18, 0.04, 0.02, teal, 0.5, 1.8, 4.55, 4); // screen
    const sw = new THREE.TorusGeometry(0.19, 0.02, 6, 18);
    sw.rotateX(-0.9);
    this.reg(this.mesh(sw, dark, -0.62, this.gy + 1.88, 4.3), 4, this.root);
  }

  /** Outline of a track loop (rear sprocket + front idler) as [z, height] points, `inset` metres inside the outer surface. */
  private trackLoop(inset: number, n = 14): [number, number][] {
    const r = { z: -3.0, y: 0.62, R: 0.6 - inset };
    const f = { z: 3.05, y: 0.55, R: 0.53 - inset };
    const pts: [number, number][] = [];
    pts.push([r.z, r.y - r.R]); // bottom, rear
    pts.push([f.z, f.y - f.R]); // bottom, front
    for (let i = 1; i < n; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / n;
      pts.push([f.z + f.R * Math.cos(a), f.y + f.R * Math.sin(a)]); // front idler, round the nose
    }
    pts.push([f.z, f.y + f.R]);
    pts.push([r.z, r.y + r.R]);
    for (let i = 1; i < n; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / n;
      pts.push([r.z + r.R * Math.cos(a), r.y + r.R * Math.sin(a)]); // rear sprocket
    }
    return pts;
  }

  /** Main battle tank: wedge hull, tracks with tread, angular turret, smoothbore gun, hatches and stowage. */
  private tank(): void {
    const spec = this.spec;
    const body = this.mat(spec.look.body);
    const dark = this.mat(spec.look.accent);
    const track = this.mat(0x1d1e1a);
    const tread = this.mat(0x2b2c26);
    const metal = this.mat(0x30332a);
    const steel = this.mat(0x4a4d44);
    const olive2 = this.mat(0x4a5230);
    const glassM = this.mat(0x1d2a2f);
    const teal = this.mat(EV_TEAL, { emissive: 0x0d6f5d });
    const lampM = this.mat(0xfff4c0, { emissive: 0x806a20 });
    const tailM = this.mat(0xd01818, { emissive: 0x4d0505 });

    // ---- hull: wedge nose, flat deck, rear plate ----
    this.uloft([
      { z: -3.55, w: 1.15, hb: 0.5, ht: 1.02, r: 0.06, rb: 0.06 },
      { z: -3.4, w: 1.28, hb: 0.42, ht: 1.14, r: 0.08, rb: 0.06 },
      { z: -2.6, w: 1.3, hb: 0.38, ht: 1.2, r: 0.08, rb: 0.06 },
      { z: 1.9, w: 1.3, hb: 0.38, ht: 1.2, r: 0.08, rb: 0.06 },
      { z: 2.4, w: 1.28, hb: 0.4, ht: 1.12, r: 0.08, rb: 0.06 },
      { z: 3.2, w: 1.15, hb: 0.5, ht: 0.86, r: 0.08, rb: 0.06 },
      { z: 3.55, w: 0.98, hb: 0.55, ht: 0.72, r: 0.08, rb: 0.06 },
    ], body, 0);

    // ---- tracks: rubber loop (hollow, the wheels show through), tread bars, sprocket, idler, return rollers ----
    const outer = this.trackLoop(0);
    const inner = this.trackLoop(0.07);
    for (const s of [-1, 1]) {
      const cx = s * 1.55;
      this.profile(outer, cx - 0.25, cx + 0.25, 0, track, 0, inner);
      // tread bars along the outer surface
      const bars: THREE.BufferGeometry[] = [];
      let carry = 0;
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const dz = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dz, dy);
        const ang = -Math.atan2(dy, dz);
        for (let d = carry; d < len; d += 0.2) {
          const g = new THREE.BoxGeometry(0.52, 0.035, 0.12);
          g.rotateX(ang);
          g.translate(cx, a[1] + (dy * d) / len, a[0] + (dz * d) / len);
          bars.push(g);
          carry = d + 0.2 - len;
        }
        if (carry < 0) carry = 0;
      }
      this.fuse(bars, tread, 0);
      // drive sprocket (rear) with teeth, idler (front), return rollers
      const sp: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.46, 0.46, 0.4, 16).rotateZ(Math.PI / 2).translate(cx, 0.62, -3.0)];
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * Math.PI * 2;
        const t = new THREE.BoxGeometry(0.42, 0.13, 0.1);
        t.rotateX(th);
        t.translate(cx, 0.62 + Math.sin(th) * 0.5, -3.0 + Math.cos(th) * 0.5);
        sp.push(t);
      }
      this.fuse(sp, steel, 4);
      this.ucyl(0.46, 0.46, 0.4, steel, cx, 0.55, 3.05, 'x', 4, this.root, 16);
      this.ucyl(0.18, 0.18, 0.46, metal, cx, 0.55, 3.05, 'x', 4, this.root, 12);
      for (const z of [-1.7, -0.4, 0.9]) this.ucyl(0.12, 0.12, 0.4, steel, cx, 0.99, z, 'x', 4, this.root, 12);
      // fender, side skirts, mud flaps
      this.rbox(0.62, 0.045, 6.4, 0.02, body, s * 1.56, 1.28, 0, 3);
      for (const z of [-2.75, -1.65, -0.55, 0.55, 1.65, 2.75]) this.rbox(0.07, 0.42, 0.98, 0.025, olive2, s * 1.86, 1.05, z, 3);
      this.rbox(0.5, 0.3, 0.05, 0.015, dark, s * 1.56, 0.8, 3.52, 3);
    }

    // ---- hull details ----
    const lou: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) lou.push(new THREE.BoxGeometry(1.7, 0.03, 0.06).translate(0, 1.225, -3.2 + i * 0.16));
    this.fuse(lou, metal, 4);
    this.rbox(2.0, 0.025, 1.2, 0.01, steel, 0, 1.215, -2.25, 3);
    this.ucyl(0.36, 0.36, 0.13, metal, 0, 1.25, 0.9, 'y', 4, this.root, 18, true); // driver hatch ring
    for (const x of [-0.18, 0, 0.18]) this.rbox(0.1, 0.06, 0.05, 0.01, glassM, x, 1.3, 1.28, 4); // periscopes
    for (const s of [-1, 1]) {
      this.rbox(0.18, 0.14, 0.06, 0.03, lampM, s * 0.88, 0.74, 3.58, 3); // lamps
      this.rbox(0.12, 0.1, 0.05, 0.02, tailM, s * 0.95, 0.85, -3.58, 3);
      this.ucyl(0.04, 0.04, 0.24, steel, s * 0.9, 0.62, -3.5, 'x', 4, this.root, 8);
      this.rbox(0.08, 0.08, 0.1, 0.02, steel, s * 0.45, 0.62, 3.58, 4); // tow hooks
    }
    this.utube([-1.0, 1.15, 2.5], [1.0, 1.15, 2.5], 0.03, dark, 4); // tow cable
    this.utube([-1.0, 1.15, 2.5], [-1.0, 0.95, 3.1], 0.03, dark, 4);
    this.utube([1.0, 1.15, 2.5], [1.0, 0.95, 3.1], 0.03, dark, 4);
    this.rbox(0.5, 0.3, 0.3, 0.03, dark, -0.85, 0.82, -3.7, 4); // jerry can rack
    this.rbox(0.5, 0.3, 0.3, 0.03, dark, 0.0, 0.82, -3.7, 4);
    this.ucyl(0.07, 0.07, 1.0, metal, 0.85, 0.7, -3.72, 'x', 4, this.root, 8); // exhaust
    this.logo('badge', false, 0.5, 0.5, 0, this.gy + 0.82, -3.6, Math.PI, 2);
    for (const s of [-1, 1]) {
      this.logo('mark', true, 0.4, 0.4, s * 1.9, this.gy + 1.05, 0.55, s * Math.PI / 2, 3);
      this.rbox(0.02, 0.03, 6.2, 0.01, teal, s * 1.9, 0.86, 0, 3);
    }

    // ---- turret + cannon ----
    const T = spec.turret!;
    const tur = new THREE.Group();
    tur.position.set(0, T.y, T.z);
    this.uloft([
      { z: -2.25, w: 0.82, hb: 1.3, ht: 1.88, r: 0.06 },
      { z: -1.9, w: 1.0, hb: 1.28, ht: 2.0, r: 0.08 },
      { z: -1.2, w: 1.22, hb: 1.26, ht: 2.06, r: 0.1 },
      { z: 0.3, w: 1.26, hb: 1.26, ht: 2.06, r: 0.1 },
      { z: 0.85, w: 1.02, hb: 1.28, ht: 1.98, r: 0.08 },
      { z: 1.22, w: 0.62, hb: 1.4, ht: 1.9, r: 0.06 },
    ], body, 4, tur, tur.position);
    const ty = (h: number) => h - 1.55; // turret-local y from ground height
    this.ucyl(1.12, 1.12, 0.1, dark, 0, ty(1.25), 0.0, 'y', 4, tur, 24); // turret ring
    this.rbox(1.7, 0.04, 1.4, 0.02, olive2, 0, ty(2.07), -0.55, 4, tur); // roof plate
    // commander cupola + machine gun
    this.ucyl(0.27, 0.27, 0.15, dark, -0.5, ty(2.13), -0.6, 'y', 4, tur, 18);
    this.ucyl(0.2, 0.2, 0.05, steel, -0.5, ty(2.22), -0.6, 'y', 4, tur, 18);
    this.rbox(0.07, 0.08, 0.5, 0.02, metal, -0.5, ty(2.32), -0.35, 4, tur);
    for (const a of [0, 1, 2, 3, 4]) this.rbox(0.1, 0.06, 0.04, 0.01, glassM, -0.5 + Math.sin(a * 1.2) * 0.28, ty(2.17), -0.6 + Math.cos(a * 1.2) * 0.28, 4, tur);
    // loader hatch, sight, stowage, smoke launchers, antenna
    this.rbox(0.55, 0.05, 0.55, 0.02, dark, 0.5, ty(2.09), -0.8, 4, tur);
    this.rbox(0.28, 0.2, 0.2, 0.03, metal, 0.55, ty(2.13), 0.25, 4, tur); // gunner sight
    this.rbox(0.08, 0.1, 0.02, 0.01, glassM, 0.55, ty(2.14), 0.36, 4, tur);
    this.rbox(1.3, 0.44, 0.4, 0.04, olive2, 0, ty(1.62), -2.1, 4, tur); // rear bin
    for (const s of [-1, 1]) {
      const sm: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 4; k++) sm.push(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateZ(s * 0.45).translate(s * 1.3, ty(1.85), 0.2 + k * 0.17));
      this.fuse(sm, metal, 4, tur);
    }
    this.utube([0.95, ty(2.0), -1.5], [0.8, ty(3.7), -1.9], 0.012, dark, 4, tur, 5);
    this.ucyl(0.05, 0.05, 0.08, dark, 0.95, ty(2.04), -1.5, 'y', 4, tur, 8);
    this.logo('mark', true, 0.4, 0.4, 1.262, ty(1.7), -0.5, Math.PI / 2, 4, tur);
    this.logo('mark', true, 0.4, 0.4, -1.262, ty(1.7), -0.5, -Math.PI / 2, 4, tur);

    const bar = new THREE.Group();
    bar.position.set(0, 0.32, 1.55);
    this.rbox(1.0, 0.62, 0.5, 0.07, metal, 0, 0, -0.1, 4, bar); // gun mantlet
    this.ucyl(0.19, 0.19, 0.32, steel, 0, 0, 0.2, 'z', 4, bar, 16); // gun shield
    const L = T.barrel;
    this.ucyl(0.075, 0.075, L - 0.4, dark, 0, 0, L / 2 + 0.1, 'z', 4, bar, 16); // barrel
    this.ucyl(0.095, 0.095, 1.7, steel, 0, 0, 1.4, 'z', 4, bar, 16); // thermal sleeve
    this.ucyl(0.125, 0.125, 0.5, steel, 0, 0, L * 0.68, 'z', 4, bar, 16); // fume extractor
    this.rbox(0.2, 0.2, 0.32, 0.04, metal, 0, 0, L - 0.1, 4, bar); // muzzle brake
    this.ucyl(0.05, 0.05, 0.02, this.mat(0x050505), 0, 0, L + 0.07, 'z', 4, bar, 10); // bore
    this.ucyl(0.03, 0.03, 0.8, dark, 0.34, -0.12, 0.45, 'z', 4, bar, 8); // coax MG
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, L + 0.2);
    bar.add(muzzle);
    tur.add(bar);
    this.root.add(tur);
    this.parts.push({ obj: tur, stage: 4 });
    this.turret = tur;
    this.barrel = bar;
    this.muzzle = muzzle;
  }

  // ------------------------------------------------------------------ wheels
  /** Single front wheel of a bike / rickshaw / auto: fork + handlebars are added to its steering group. */
  /**
   * A hinged driver's door on the right-hand side (x < 0) over the body side at half width `S`, hinged at its front edge (z = `zHinge`),
   * `len` long, from `y0` to `y0 + h` above the ground. Behind it a dark doorway shows when it opens. Optional glass above the panel.
   */
  private addDoor(S: number, zHinge: number, len: number, y0: number, h: number, thick: number, panel: THREE.Material, handle: THREE.Material, dark: THREE.Material, glass?: { m: THREE.Material; h: number }): void {
    const x = -(S + thick / 2 + 0.012);
    this.box(0.012, h, len, dark, -(S + 0.003), this.gy + y0 + h / 2, zHinge - len / 2, 0); // doorway
    const hinge = new THREE.Group();
    hinge.position.set(x, this.gy + y0 + h / 2, zHinge);
    this.mesh(new THREE.BoxGeometry(thick, h, len), panel, 0, 0, -len / 2, hinge);
    this.mesh(new THREE.BoxGeometry(0.014, 0.035, 0.16), handle, -(thick / 2 + 0.006), h * 0.22, -len * 0.8, hinge);
    if (glass) this.mesh(new THREE.BoxGeometry(thick * 0.5, glass.h, len * 0.92), glass.m, 0, h / 2 + glass.h / 2, -len / 2, hinge);
    this.root.add(hinge);
    this.parts.push({ obj: hinge, stage: 2 });
    this.driverDoor = hinge;
  }

  /** Door angle: 0 = shut, 1 = wide open (about 66 degrees). Ignored once the door has broken off. */
  setDoor(open: number): void {
    const d = this.driverDoor;
    // right side: a positive yaw swings the rear edge out towards -X
    if (d && d.parent === this.root) d.rotation.y = open * 1.15;
  }

  /** EVCity logo decal (a flat plane a hair off the body). `rotY`: 0 = faces +Z (nose), PI = faces the tail, +-PI/2 = left / right side. */
  private logo(style: LogoStyle, dark: boolean, w: number, h: number, x: number, y: number, z: number, rotY: number, stage: ModelPart['stage'] = 0, parent: THREE.Object3D = this.root): void {
    const tex = makeLogoTexture(style, dark);
    if (!tex) return;
    const m = this.mat(0xffffff, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = this.mesh(new THREE.PlaneGeometry(w, h), m, x, y, z, parent);
    mesh.rotation.y = rotY;
    mesh.castShadow = false;
    if (parent === this.root) this.parts.push({ obj: mesh, stage });
  }

  /** Logo lying on a (nearly) horizontal panel: rotX = -PI/2 puts it flat facing up, rotZ turns it about its own normal. */
  private logoFlat(style: LogoStyle, dark: boolean, w: number, h: number, x: number, y: number, z: number, rotX: number, rotZ: number, stage: ModelPart['stage'] = 0): void {
    const tex = makeLogoTexture(style, dark);
    if (!tex) return;
    const m = this.mat(0xffffff, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = this.mesh(new THREE.PlaneGeometry(w, h), m, x, y, z, this.root);
    mesh.rotation.set(rotX, 0, rotZ);
    mesh.castShadow = false;
    this.parts.push({ obj: mesh, stage });
  }

  /** Builds the steering assembly into `g` (the steering group) - and, for a raked bike, `wheelFrame` (level axes, same origin). */
  private frontFork: ((g: THREE.Group, wheelFrame: THREE.Group) => void) | null = null;

  /** Farm tractor (EVCity Agro): long bonnet, open seat under a canopy, big rear mudguards, exhaust stack. Nose = +Z. */
  private tractor(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const trim = this.pbr(spec.look.accent, { metalness: 0.1, roughness: 0.5 });
    const dark = this.pbr(0x23272b, { roughness: 0.6, metalness: 0.2 });
    const steel = this.pbr(0x8b9298, { metalness: 0.9, roughness: 0.35 });
    const seatM = this.mat(0x1c1c1c);
    const lamp = this.pbr(0xfff3c4, { emissive: 0xffe08a, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0 });
    this.boxG(0.7, 0.55, 3.2, dark, 0, 0.9, -0.2); // chassis
    this.boxG(0.95, 0.8, 1.9, paint, 0, 1.15, 1.05, 3); // bonnet
    this.boxG(0.8, 0.55, 0.06, dark, 0, 1.0, 2.02, 1); // grille
    for (const sx of [-1, 1]) this.boxG(0.2, 0.15, 0.06, lamp, sx * 0.35, 1.3, 2.02, 4);
    this.boxG(1.6, 0.35, 0.7, dark, 0, 0.85, -1.3); // rear axle housing
    for (const sx of [-1, 1]) {
      this.boxG(0.55, 0.09, 1.45, paint, sx * 0.95, 1.28, -1.3, 3); // mudguard
      this.boxG(0.07, 0.35, 1.45, paint, sx * 1.2, 1.1, -1.3, 3);
    }
    this.boxG(0.5, 0.12, 0.5, seatM, 0, 1.42, -0.3); // seat
    this.boxG(0.5, 0.5, 0.1, seatM, 0, 1.72, -0.55);
    this.boxG(0.08, 0.7, 0.08, steel, 0, 1.5, 0.35).rotation.x = -0.5; // steering column
    this.mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), dark, 0, this.gy + 1.95, 0.5).rotation.x = 1.0; // steering wheel
    for (const sx of [-1, 1]) for (const sz of [-0.95, 0.35]) this.boxG(0.06, 1.2, 0.06, steel, sx * 0.65, 2.25, sz, 3); // canopy posts
    this.boxG(1.6, 0.07, 1.6, trim, 0, 2.88, -0.3, 3); // canopy
    this.mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.0, 8), steel, 0.3, this.gy + 1.95, 1.3); // exhaust stack
    this.boxG(1.0, 0.35, 0.3, dark, 0, 0.55, 2.15, 1); // front weight
    this.boxG(0.6, 0.22, 0.4, steel, 0, 0.55, -2.05, 2); // rear hitch
  }

  /** Combine harvester: red body, glass cab at the front, grain tank + unloading tube on top, feeder housing and a wide header with a reel. */
  private combine(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const trim = this.pbr(spec.look.accent, { metalness: 0.1, roughness: 0.5 });
    const dark = this.pbr(0x2a2e33, { roughness: 0.6, metalness: 0.2 });
    const steel = this.pbr(0x8b9298, { metalness: 0.9, roughness: 0.35 });
    const glass = this.carGlass();
    const lamp = this.pbr(0xfff3c4, { emissive: 0xffe08a, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0 });
    this.boxG(2.5, 1.5, 4.4, paint, 0, 1.75, -0.5); // threshing body
    this.boxG(2.3, 1.0, 2.6, paint, 0, 3.0, -1.1, 3); // grain tank
    this.boxG(0.3, 0.3, 2.8, trim, 0.95, 3.75, -1.2, 3); // unloading tube
    this.boxG(1.8, 1.4, 1.6, paint, 0, 3.0, 1.75, 3); // cab frame
    this.boxG(1.72, 1.0, 1.66, glass, 0, 3.1, 1.76, 4); // cab glass
    this.boxG(1.95, 0.08, 1.8, trim, 0, 3.75, 1.75, 3); // cab roof
    for (const sx of [-1, 1]) this.boxG(0.2, 0.14, 0.06, lamp, sx * 0.7, 3.6, 2.58, 4);
    this.boxG(1.9, 1.1, 1.5, dark, 0, 1.3, 3.2); // feeder housing
    this.boxG(5.0, 0.7, 1.0, trim, 0, 0.8, 4.3, 1); // cutter bar header
    this.mesh(new THREE.CylinderGeometry(0.5, 0.5, 5.0, 10), paint, 0, this.gy + 1.45, 4.6).rotation.z = Math.PI / 2; // reel
    this.boxG(2.6, 0.5, 0.5, dark, 0, 0.9, -2.9, 2); // rear
    for (const sx of [-1, 1]) this.boxG(0.1, 0.9, 0.9, steel, sx * 1.3, 1.45, 2.4); // ladder rail
    void steel;
  }

  /** Farm pickup: cab, glass, open cargo bed with side boards. Nose = +Z. */
  private pickup(): void {
    const spec = this.spec;
    const paint = this.carPaint(spec.look.body);
    const trim = this.pbr(spec.look.accent, { metalness: 0.1, roughness: 0.5 });
    const dark = this.pbr(0x16191c, { roughness: 0.6, metalness: 0.1 });
    const glass = this.carGlass();
    const lamp = this.pbr(0xeef5ff, { emissive: 0xaecdff, emissiveIntensity: 0.6, roughness: 0.04, metalness: 0 });
    const tail = this.pbr(0xd01414, { emissive: 0x8a0000, roughness: 0.15, metalness: 0 });
    this.boxG(1.8, 0.45, 4.9, dark, 0, 0.75, 0); // chassis / sills
    this.boxG(1.8, 0.5, 1.5, paint, 0, 1.15, 1.7, 3); // bonnet
    this.boxG(1.8, 0.95, 1.5, paint, 0, 1.6, 0.35); // cab
    this.boxG(1.84, 0.5, 1.2, glass, 0, 1.8, 0.35, 4); // windows
    this.boxG(1.8, 0.07, 1.4, trim, 0, 2.1, 0.35, 3); // roof
    this.boxG(1.8, 0.12, 2.3, trim, 0, 0.98, -1.55); // bed floor
    for (const sx of [-1, 1]) this.boxG(0.08, 0.5, 2.3, paint, sx * 0.86, 1.28, -1.55);
    this.boxG(1.8, 0.5, 0.08, paint, 0, 1.28, -0.42);
    this.boxG(1.8, 0.5, 0.08, paint, 0, 1.28, -2.7, 2); // tailgate
    this.boxG(1.9, 0.25, 0.2, dark, 0, 0.55, 2.55, 1); // front bumper
    this.boxG(1.9, 0.25, 0.2, dark, 0, 0.55, -2.55, 2);
    for (const sx of [-1, 1]) {
      this.boxG(0.24, 0.14, 0.06, lamp, sx * 0.62, 1.2, 2.45, 4);
      this.boxG(0.16, 0.14, 0.05, tail, sx * 0.8, 1.2, -2.75, 4);
    }
  }

  private wheelsAndSpare(): void {
    const spec = this.spec;
    const isCar = spec.look.kind === 'sedan' || spec.look.kind === 'jeep' || spec.look.kind === 'hypercar' || spec.look.kind === 'evbike' || spec.look.kind === 'evhypar' || spec.look.kind === 'suprim' || spec.look.kind === 'tractor' || spec.look.kind === 'combine' || spec.look.kind === 'pickup';
    const tireM = isCar ? this.pbr(0x131313, { roughness: 0.92, metalness: 0 }) : this.mat(spec.look.kind === 'tank' ? 0x1b1d17 : 0x161616);
    const rimM = isCar
      ? spec.look.kind === 'tractor' || spec.look.kind === 'combine'
        ? this.pbr(spec.look.accent, { metalness: 0.5, roughness: 0.5 }) // painted farm-machine wheels
        : spec.look.kind === 'jeep' || spec.look.kind === 'pickup'
        ? this.pbr(0x3a4047, { metalness: 0.85, roughness: 0.4 }) // gunmetal off-road wheels
        : spec.look.kind === 'hypercar' || spec.look.kind === 'evbike' || spec.look.kind === 'suprim'
          ? this.pbr(0x2b3036, { metalness: 0.95, roughness: 0.25 }) // dark forged alloys
          : this.pbr(0xd2d6da, { metalness: 0.95, roughness: 0.22 }) // bright alloys
      : this.mat(spec.look.kind === 'tank' ? 0x4a4f3c : spec.look.kind === 'bike' ? 0x2a2f34 : spec.look.kind === 'auto' ? 0xa7adb3 : 0xb8bcc2);
    const r = spec.wheelRadius;
    const w = spec.wheelWidth;
    const kind = spec.look.kind;
    const car = isCar || kind === 'auto' || kind === 'bus';
    const rf = spec.look.kind === 'hypercar' || spec.look.kind === 'suprim' ? 0.76 : spec.look.kind === 'evbike' ? 0.7 : 0.62; // inner tyre radius / outer (a low-profile tyre has more rim)
    // sedan: rounded tyre profile (lathe) + alloy wheel; everything else keeps the simple cylinders
    let tireG: THREE.BufferGeometry;
    if (car) tireG = this.makeTyre(r, w, spec.look.kind === 'jeep' || spec.look.kind === 'tractor' || spec.look.kind === 'combine' || spec.look.kind === 'pickup', spec.look.kind === 'tractor' || spec.look.kind === 'combine' ? 0.5 : rf);
    else if (kind === 'rickshaw') tireG = new THREE.TorusGeometry(r - 0.02, 0.022, 6, 28).rotateY(Math.PI / 2); // thin cycle tyre
    else if (kind === 'tank') tireG = new THREE.CylinderGeometry(r * 0.8, r * 0.8, w * 0.34, 18); // one of two rubber road-wheel tyres
    else tireG = new THREE.CylinderGeometry(r, r, w, 20);
    let rimG: THREE.BufferGeometry;
    if (car) rimG = new THREE.CylinderGeometry(r * (rf + 0.02), r * (rf + 0.02), w * 0.92, 20);
    else if (kind === 'rickshaw') rimG = new THREE.TorusGeometry(r - 0.05, 0.008, 5, 28).rotateY(Math.PI / 2);
    else if (kind === 'tank') rimG = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 0.9, 14);
    else rimG = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 12);
    this.geos.push(tireG, rimG);
    const dishM = this.mat(0x2a2d31);
    const dishG = new THREE.CylinderGeometry(r * (rf - 0.07), r * (rf - 0.07), w * 0.96, 20);
    const spokeLen = r * (rf - 0.12);
    const spokeC = spokeLen / 2 + r * 0.05; // spoke centre radius
    const jeepW = spec.look.kind === 'jeep' || spec.look.kind === 'tractor' || spec.look.kind === 'combine' || spec.look.kind === 'pickup';
    const singleSpoke = jeepW || kind === 'bus' || kind === 'auto';
    const spokeG = new THREE.BoxGeometry(spokeLen, 0.03, jeepW ? 0.075 : kind === 'bus' ? 0.09 : kind === 'auto' ? 0.055 : 0.038);
    const ringG = new THREE.TorusGeometry(r * (rf - 0.02), jeepW ? 0.014 : 0.01, 6, 28);
    const hubG = new THREE.CylinderGeometry(r * 0.14, r * 0.14, w * 0.99, 10);
    if (car || kind === 'tank') this.geos.push(dishG, spokeG, hubG, ringG);
    // rickshaw: 16 thin spokes + hub in one geometry
    let spokesG: THREE.BufferGeometry | null = null;
    if (kind === 'rickshaw') {
      const list: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10).rotateZ(Math.PI / 2)];
      for (let k = 0; k < 8; k++) list.push(new THREE.BoxGeometry(0.006, (r - 0.05) * 2, 0.006).rotateX((k * Math.PI) / 8));
      spokesG = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (spokesG) this.geos.push(spokesG);
    }
    const hubM = this.mat(0xc8ccd0);
    let first = true;
    for (const d of wheelDefs(spec)) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, spec.connY - spec.susp.rest, d.z);
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const bike = spec.look.kind === 'bike';
      if (bike) this.bikeWheel(spin, d.steer);
      else if (kind === 'rickshaw') {
        spin.add(new THREE.Mesh(tireG, tireM), new THREE.Mesh(rimG, hubM));
        if (spokesG) spin.add(new THREE.Mesh(spokesG, hubM));
      } else if (kind === 'tank') {
        // double road wheel: two rubber tyres on a steel hub
        for (const sx of [-1, 1]) {
          const tt = new THREE.Mesh(tireG, tireM);
          tt.rotation.z = Math.PI / 2;
          tt.position.x = sx * w * 0.3;
          tt.castShadow = true;
          spin.add(tt);
        }
        const hub = new THREE.Mesh(rimG, rimM);
        hub.rotation.z = Math.PI / 2;
        const cap = new THREE.Mesh(hubG, dishM);
        cap.rotation.z = Math.PI / 2;
        spin.add(hub, cap);
      } else {
        const tire = new THREE.Mesh(tireG, tireM);
        const rim = new THREE.Mesh(rimG, rimM);
        tire.rotation.z = Math.PI / 2; // cylinder axis Y -> X
        rim.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        spin.add(tire, rim);
      }
      if (car) {
        const dish = new THREE.Group();
        dish.rotation.z = Math.PI / 2;
        dish.add(new THREE.Mesh(dishG, dishM), new THREE.Mesh(hubG, rimM));
        for (const side of [-1, 1]) {
          const n = kind === 'bus' ? 8 : kind === 'auto' ? 5 : 6;
          for (let k = 0; k < n; k++) {
            for (const off of singleSpoke ? [0] : [-0.11, 0.11]) {
              const th = (k / n) * Math.PI * 2 + off;
              const sp = new THREE.Mesh(spokeG, rimM);
              sp.position.set(Math.cos(th) * spokeC, side * (w * 0.48 + 0.008), Math.sin(th) * spokeC);
              sp.rotation.y = -th;
              dish.add(sp);
            }
          }
          const ring = new THREE.Mesh(ringG, rimM); // rim lip / bead-lock ring
          ring.rotation.x = Math.PI / 2;
          ring.position.y = side * (w * 0.48 + 0.004);
          dish.add(ring);
        }
        spin.add(dish);
      }
      if (bike && d.steer) {
        // raked steering axis: pivot -> tilt (axis leans back) -> steer (yaw about that axis) -> untilt (wheel level again) -> spin
        const tilt = new THREE.Group();
        tilt.rotation.x = -RAKE;
        const untilt = new THREE.Group();
        untilt.rotation.x = RAKE;
        pivot.add(tilt);
        tilt.add(steer);
        steer.add(untilt);
        untilt.add(spin);
        if (this.frontFork) this.frontFork(steer, untilt);
        this.frontFork = null;
      } else {
        steer.add(spin);
        pivot.add(steer);
        if (first && d.steer && this.frontFork) {
          this.frontFork(steer, steer);
          this.frontFork = null;
        }
      }
      first = false;
      this.root.add(pivot);
      this.wheels.push({ pivot, steer, spin });
    }
  }

  /** Sport-bike wheel (axle = local X): round-profile tyre, dark 5-spoke alloy with a teal ring, brake discs, hub. */
  private bikeWheel(spin: THREE.Group, front: boolean): void {
    const r = this.spec.wheelRadius;
    const hw = front ? 0.06 : 0.09; // half tyre width: 120 front, 180 rear
    const rimR = 0.215;
    const tireM = this.mat(0x141518);
    const rimM = this.mat(0x2b3036);
    const spokeM = this.mat(0x7d858d);
    const discM = this.mat(0xb9bec4);
    const teal = this.mat(EV_TEAL, { emissive: 0x0c6f5c });
    const prof = [
      [rimR - 0.01, -hw * 0.8], [r * 0.86, -hw * 0.98], [r * 0.95, -hw * 0.86], [r * 0.99, -hw * 0.5], [r, -hw * 0.15],
      [r, hw * 0.15], [r * 0.99, hw * 0.5], [r * 0.95, hw * 0.86], [r * 0.86, hw * 0.98], [rimR - 0.01, hw * 0.8],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const tyre = this.mesh(new THREE.LatheGeometry(prof, 32), tireM, 0, 0, 0, spin);
    tyre.rotation.z = Math.PI / 2; // lathe axis Y -> X
    const face = new THREE.CylinderGeometry(rimR, rimR, 0.02, 24);
    const ringG = new THREE.TorusGeometry(rimR - 0.012, 0.007, 6, 32);
    const spokeG = new THREE.BoxGeometry(0.016, 0.17, 0.034);
    const hubG = new THREE.CylinderGeometry(0.04, 0.04, hw * 1.7, 12);
    const discG = new THREE.CylinderGeometry(front ? 0.13 : 0.11, front ? 0.13 : 0.11, 0.006, 24);
    this.geos.push(face, ringG, spokeG, hubG, discG);
    for (const sx of [1, -1]) {
      const x = sx * hw * 0.55;
      const f = new THREE.Mesh(face, rimM);
      f.rotation.z = Math.PI / 2;
      f.position.x = x;
      const ring = new THREE.Mesh(ringG, teal);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x + sx * 0.011;
      spin.add(f, ring);
      for (let k = 0; k < 5; k++) {
        const arm = new THREE.Group();
        arm.rotation.x = (k / 5) * Math.PI * 2;
        arm.position.x = x + sx * 0.012;
        const sp = new THREE.Mesh(spokeG, spokeM);
        sp.position.y = 0.12;
        arm.add(sp);
        spin.add(arm);
      }
      if (front || sx < 0) {
        const disc = new THREE.Mesh(discG, discM);
        disc.rotation.z = Math.PI / 2;
        disc.position.x = sx * (front ? 0.075 : 0.07);
        spin.add(disc);
      }
    }
    const hub = new THREE.Mesh(hubG, discM);
    hub.rotation.z = Math.PI / 2;
    spin.add(hub);
    this.mesh(this.cyl(0.07, 0.008, 20), teal, hw * 1.25 * (front ? -1 : 1), 0, 0, spin).rotation.z = Math.PI / 2; // sprocket / hub cap
    tyre.castShadow = true;
  }

  /** Burnt out: everything left on the wreck turns black. */
  char(): void {
    for (const m of this.mats) {
      m.color.multiplyScalar(0.12);
      m.emissive.setHex(0x000000);
      if ('envMapIntensity' in m) m.envMapIntensity = 0.08;
      if ('clearcoat' in m) (m as THREE.MeshPhysicalMaterial).clearcoat = 0;
      if (m.transparent) m.opacity = 0.85;
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
