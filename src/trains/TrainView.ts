import * as THREE from 'three';
import { buildCarDecals, buildCarParts, type CarParts, type TrainDecalData, type TrainMeshData } from './TrainMesh';
import { CONSIST, type CarKind } from './TrainConfig';
import type { CarPose, Train } from './TrainSim';
import type { TrainViewHost, TrainViewLike } from './TrainManager';

/**
 * Procedural surface textures of the trains (GLSL, no image files), painted from the `surf` class of every face and the CAR-LOCAL position (so they
 * ride with the car): panel joints and dirt on the paint, seat fabric with fine crackle lines, speckled floor vinyl, wall panel joints, perforated
 * ceiling, chrome grain, rubber ribs, plastic grain. See TRAIN_SURF in TrainMesh.
 */
const TRAIN_GLSL = /* glsl */ `
varying float vSurf;
varying vec3 vP;
varying vec3 vN;
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03) + 0.125 * vn(p * 4.01); }
vec3 cell2(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 g = vec2(float(x), float(y));
    vec3 q = vec3(i + g, 5.1);
    vec2 o = vec2(h31(q), h31(q + 19.0));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = h31(q + 7.0); } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2, id);
}
vec3 trainTex(float s, vec3 p, vec3 n) {
  if (s < 0.5) return vec3(1.0);
  vec3 an = abs(n);
  if (s < 1.5) { // body paint
    float k = 0.97 + 0.05 * vn(p * 18.0);
    if (an.z > 0.6) {
      k *= 1.0 - 0.12 * smoothstep(0.488, 0.5, abs(fract(p.x / 2.75) - 0.5));
      k *= 1.0 - 0.2 * smoothstep(1.35, 0.85, p.y) * (0.6 + 0.6 * fbm(vec3(p.x * 1.5, p.y * 0.7, 1.0)));
      k *= 1.0 - 0.07 * smoothstep(0.6, 0.9, vn(vec3(p.x * 9.0, p.y * 0.5, 4.0)));
    } else if (an.y > 0.6) {
      k *= 0.9 + 0.12 * fbm(p * 2.5);
    }
    return vec3(k);
  }
  if (s < 2.5) return vec3(0.8 + 0.4 * vn(p * 26.0)); // dark metal
  if (s < 3.5) { // seat fabric: blue with crackle lines
    vec2 uv = (an.y > an.x && an.y > an.z ? p.xz : (an.x > an.z ? p.zy : p.xy)) * 22.0;
    vec3 c = cell2(uv);
    float line = 1.0 - smoothstep(0.0, 0.09, c.y - c.x);
    float weave = 0.93 + 0.07 * sin(uv.x * 9.0) * sin(uv.y * 9.0);
    return vec3(0.9 + 0.2 * c.z) * weave + vec3(0.1, 0.22, 0.55) * line * 0.9;
  }
  if (s < 4.5) { // floor vinyl: pale and dark flecks
    float a = vn(p * 60.0), b = vn(p * 60.0 + 9.0);
    return vec3((0.92 + 0.32 * step(0.78, a) - 0.28 * step(0.8, b)) * (0.95 + 0.1 * fbm(p * 4.0)));
  }
  if (s < 5.5) { // wall panels
    float k = 0.96 + 0.06 * vn(p * 14.0);
    k *= 1.0 - 0.14 * smoothstep(0.486, 0.5, abs(fract(p.x / 1.85) - 0.5));
    return vec3(k);
  }
  if (s < 6.5) { // ceiling: perforated panels
    vec2 g = fract(p.xz * 38.0) - 0.5;
    float hole = smoothstep(0.2, 0.13, length(g));
    float seam = smoothstep(0.488, 0.5, abs(fract(p.x / 1.85) - 0.5));
    return vec3((1.0 - 0.07 * hole) * (1.0 - 0.1 * seam));
  }
  if (s < 7.5) return vec3(0.88 + 0.22 * vn(p * 34.0)); // chrome grain
  if (s < 8.5) return vec3(0.7 + 0.35 * sin(p.x * 70.0 + p.y * 10.0)); // rubber ribs
  return vec3(0.93 + 0.12 * vn(p * 40.0)); // plastic
}
`;

const patchTrain = (shader: { vertexShader: string; fragmentShader: string }): void => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float surf;\nvarying float vSurf;\nvarying vec3 vP;\nvarying vec3 vN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;\nvP = position;\nvN = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TRAIN_GLSL)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= trainTex(floor(vSurf + 0.5), vP, normalize(vN));');
};

/** One shared, lit, vertex-coloured material for all trains (same kind as the rail material): the outside of the cars, with procedural textures. */
export class TrainMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'train';
    this.onBeforeCompile = patchTrain;
    this.customProgramCacheKey = () => 'train-tex';
  }
}

/** The inside of the cars (floor, seats, lining, lamps, head / tail lamps): UNLIT, the colours already carry a fake shading, so the saloon is bright by day and by night. Procedural textures on top. */
export class TrainInsideMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'train-inside';
    this.onBeforeCompile = patchTrain;
    this.customProgramCacheKey = () => 'train-inside-tex';
  }
}

/** Window panes: see-through, so the saloon shows from outside and the world from the seat. */
export class TrainGlassMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.name = 'train-glass';
  }
}

/**
 * The OFFICIAL EVCity logo (public/assets/evcity-logo.png: teal E mark, white "EVCity" and tagline). The white letters would vanish on the white
 * paint, so while it is copied onto the canvas every near-white pixel becomes charcoal (the teal mark keeps its colour). The canvas is transparent
 * until the PNG has loaded, then the texture is refreshed. No DOM (headless): null.
 */
function makeLogoTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 217;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const mx = Math.max(px[i], px[i + 1], px[i + 2]);
      const mn = Math.min(px[i], px[i + 1], px[i + 2]);
      if (mn > 150 && mx - mn < 40) {
        // white / light grey letter pixel -> charcoal, keeping its antialiased alpha
        px[i] = 29;
        px[i + 1] = 36;
        px[i + 2] = 41;
      }
    }
    g.putImageData(d, 0, 0);
    t.needsUpdate = true;
  };
  img.src = `${import.meta.env.BASE_URL}assets/evcity-logo.png`;
  return t;
}

/** The three materials every train view uses. */
export interface TrainMaterials {
  body: TrainMaterial;
  inside: TrainInsideMaterial;
  glass: TrainGlassMaterial;
  /** Logo plates (null when there is no DOM: headless). */
  decal: THREE.MeshLambertMaterial | null;
}

/**
 * Where the viewer (camera) is, world metres. The saloon, the windows and the logo of a car are only drawn when the camera is closer than
 * `INTERIOR_RANGE` (or nobody told us where it is): from far away the outside is all that can be seen, and the seats are the heavy part.
 */
const viewer = { x: 0, z: 0, set: false };
const INTERIOR_RANGE = 160;
export function setTrainViewer(x: number, z: number): void {
  viewer.x = x;
  viewer.z = z;
  viewer.set = true;
}

const toGeometry = (d: TrainMeshData): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(d.surf, 1));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
};

const decalGeometries = new Map<CarKind, THREE.BufferGeometry>();
function decalGeometry(kind: CarKind): THREE.BufferGeometry {
  let g = decalGeometries.get(kind);
  if (!g) {
    const d: TrainDecalData = buildCarDecals(kind);
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    decalGeometries.set(kind, g);
  }
  return g;
}

interface CarGeometries {
  body: THREE.BufferGeometry;
  inside: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

const geometries = new Map<CarKind, CarGeometries>();
function carGeometry(kind: CarKind): CarGeometries {
  let g = geometries.get(kind);
  if (!g) {
    const parts: CarParts = buildCarParts(kind);
    g = { body: toGeometry(parts.body), inside: toGeometry(parts.inside), glass: toGeometry(parts.glass) };
    geometries.set(kind, g);
  }
  return g;
}

/** Frees the shared car geometries (engine shutdown). */
export function disposeTrainGeometries(): void {
  for (const g of geometries.values()) {
    g.body.dispose();
    g.inside.dispose();
    g.glass.dispose();
  }
  geometries.clear();
  for (const g of decalGeometries.values()) g.dispose();
  decalGeometries.clear();
}

/**
 * Three.js view of one simulated train (Step 5a provides it; it is wired into the game in Step 5b). One mesh per car, the three car geometries are shared.
 * `update` places every car from the simulation. World coordinates are shifted by (originX, originZ) so the game's floating origin can be applied.
 */
export class TrainView {
  readonly group = new THREE.Group();
  private cars: THREE.Mesh[] = [];
  private pose: CarPose = { kind: 'coach', x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, flipped: false, bf: { x: 0, y: 0, z: 0 }, br: { x: 0, y: 0, z: 0 } };
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();
  private side = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor(materials: TrainMaterials) {
    this.group.name = 'train';
    for (const c of CONSIST) {
      const g = carGeometry(c.kind);
      const mesh = new THREE.Mesh(g.body, materials.body);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      // the saloon and the windows ride on the car (children keep an identity matrix: they follow the body)
      const inside = new THREE.Mesh(g.inside, materials.inside);
      const glass = new THREE.Mesh(g.glass, materials.glass);
      inside.matrixAutoUpdate = false;
      glass.matrixAutoUpdate = false;
      inside.updateMatrix();
      glass.updateMatrix();
      glass.renderOrder = 2;
      mesh.add(inside, glass);
      if (materials.decal) {
        const decal = new THREE.Mesh(decalGeometry(c.kind), materials.decal);
        decal.matrixAutoUpdate = false;
        decal.updateMatrix();
        mesh.add(decal);
      }
      this.cars.push(mesh);
      this.group.add(mesh);
    }
  }

  update(train: Train, originX: number, originZ: number): void {
    const n = this.cars.length;
    for (let k = 0; k < n; k++) {
      // mesh k is always the same physical car; after a reversal it sits at the other end of the path order
      const j = train.reversed ? n - 1 - k : k;
      const p = train.carPose(j, this.pose);
      const s = p.flipped ? -1 : 1;
      this.fwd.set(p.fx * s, p.fy * s, p.fz * s);
      this.up.set(0, 1, 0).addScaledVector(this.fwd, -this.fwd.y).normalize();
      this.side.crossVectors(this.fwd, this.up);
      this.m.makeBasis(this.fwd, this.up, this.side);
      this.m.setPosition(p.x - originX, p.y, p.z - originZ);
      this.cars[k].matrix.copy(this.m);
      this.cars[k].matrixWorldNeedsUpdate = true;
      const dx = p.x - viewer.x, dz = p.z - viewer.z;
      const near = !viewer.set || dx * dx + dz * dz < INTERIOR_RANGE * INTERIOR_RANGE;
      for (const ch of this.cars[k].children) ch.visible = near;
    }
  }
}

/**
 * Puts the train views under the world root. Positions are ABSOLUTE world coordinates (the root is moved by the floating origin, exactly like
 * the bridge meshes), so `update(train, 0, 0)`.
 */
export class TrainLayer implements TrainViewHost {
  private materials: TrainMaterials = { body: new TrainMaterial(), inside: new TrainInsideMaterial(), glass: new TrainGlassMaterial(), decal: TrainLayer.makeDecalMaterial() };

  private static makeDecalMaterial(): THREE.MeshLambertMaterial | null {
    const map = makeLogoTexture();
    if (!map) return null;
    return new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }

  constructor(private root: THREE.Object3D) {}

  create(): TrainViewLike {
    const view = new TrainView(this.materials);
    this.root.add(view.group);
    return {
      update: (train: Train) => view.update(train, 0, 0),
      dispose: () => this.root.remove(view.group),
    };
  }

  dispose(): void {
    this.materials.body.dispose();
    this.materials.inside.dispose();
    this.materials.glass.dispose();
    this.materials.decal?.map?.dispose();
    this.materials.decal?.dispose();
    disposeTrainGeometries();
  }
}
