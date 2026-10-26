import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { hash2, mergeParts, part, vnoise } from './GeoUtil';

/**
 * The sea floor comes alive: swaying seaweed and kelp, branching and brain corals, rocks. Placed on a 5 m grid around the
 * camera (the same cell always gives the same plants), only where the water is deep enough to cover them (sea, lakes, rivers).
 * Four InstancedMeshes; cells near the camera are computed a few per frame, far cells are dropped.
 */

const CELL = 5;

type Kind = 0 | 1 | 2 | 3; // seaweed, branch coral, dome coral, rock
interface Inst {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  tint: number;
}

/** [radius m, seaweed, branch coral, dome coral, rock] per quality. */
const QUALITY = [
  { reach: 42, caps: [450, 140, 100, 90] },
  { reach: 70, caps: [1000, 300, 220, 180] },
  { reach: 100, caps: [1900, 500, 360, 280] },
] as const;

const SEAWEED_TINTS: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.85, 1.05, 0.8],
  [1.15, 1.0, 0.55],
  [1.3, 0.62, 0.5],
  [0.8, 0.95, 1.1],
];
const CORAL_TINTS: [number, number, number][] = [
  [1.5, 0.75, 0.35],
  [1.5, 0.45, 0.6],
  [0.95, 0.55, 1.3],
  [1.5, 1.3, 0.4],
  [1.1, 0.5, 0.45],
  [0.5, 1.2, 1.0],
];
const DOME_TINTS: [number, number, number][] = [
  [1.1, 1.0, 0.65],
  [0.75, 1.1, 0.8],
  [1.3, 0.75, 0.7],
  [0.9, 0.85, 1.15],
];
const ROCK_TINTS: [number, number, number][] = [
  [0.85, 0.82, 0.78],
  [0.7, 0.7, 0.72],
  [0.8, 0.9, 0.75],
  [0.95, 0.85, 0.7],
];

function bladeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const segs = 5;
    const pos: number[] = [];
    const idx: number[] = [];
    const lean = 0.18 + hash2(b, 3, 1) * 0.3;
    for (let s = 0; s <= segs; s++) {
      const y = s / segs;
      const hw = 0.065 * (1 - 0.7 * y);
      const cx = lean * y * y;
      pos.push(cx - hw, y, 0, cx + hw, y, 0);
      if (s < segs) {
        const k = s * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.rotateY((b / blades) * Math.PI * 2 + hash2(b, 9, 2));
    g.translate(Math.cos(b * 2.4) * 0.09, 0, Math.sin(b * 2.4) * 0.09);
    parts.push(
      part(g, (_x, y) => {
        const k = Math.min(1, Math.max(0, y));
        return [0.1 + 0.28 * k, 0.26 + 0.38 * k, 0.1 + 0.15 * k];
      }),
    );
  }
  return mergeParts(parts);
}

function branchCoralGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 1;
  const rnd = (): number => hash2(seed++, 77, 5);
  const grow = (base: THREE.Matrix4, len: number, rad: number, depth: number): void => {
    const cyl = new THREE.CylinderGeometry(rad * 0.55, rad, len, 5, 1);
    cyl.translate(0, len / 2, 0);
    cyl.applyMatrix4(base);
    parts.push(
      part(cyl, (_x, y) => {
        const k = 0.5 + 0.55 * Math.min(1, Math.max(0, y / 0.9));
        return [k, k, k];
      }),
    );
    if (depth <= 0) return;
    const tip = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.92, 0));
    const n = depth === 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.45 + rnd() * 0.5, (i / n) * Math.PI * 2 + rnd(), 0, 'YXZ'));
      grow(tip.clone().multiply(rot), len * (0.6 + rnd() * 0.15), rad * 0.62, depth - 1);
    }
  };
  grow(new THREE.Matrix4(), 0.32, 0.075, 2);
  return mergeParts(parts);
}

function domeCoralGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const ridge = 1 + 0.07 * Math.sin(x * 22 + y * 5) * Math.sin(z * 22 - y * 4);
    x *= ridge;
    z *= ridge;
    y = y > 0 ? y * 0.7 * ridge : y * 0.15;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return part(g, (x, y, z) => {
    const k = 0.72 + 0.28 * Math.sin(x * 24) * Math.sin(z * 24 + y * 6);
    return [k, k, k];
  });
}

function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const j = 0.78 + 0.45 * hash2(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    p.setXYZ(i, x * j * 1.1, (y > 0 ? y * 0.75 : y * 0.35) * j, z * j);
  }
  g.computeVertexNormals();
  return part(g, (x, y, z) => {
    const k = 0.6 + 0.4 * hash2(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20) + 4);
    return [k, k, k];
  });
}

export class SeabedDecor {
  private meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private uTime = { value: 0 };
  private cells = new Map<number, Inst[]>();
  private offsets: { dx: number; dz: number; d: number }[] = [];
  private offsetsReach = 0;
  private quality = 1;
  private sc: TerrainSample;
  private dirty = true;
  private rebuildTimer = 0;
  private evictTimer = 0;
  private lastGx = 1e9;
  private lastGz = 1e9;
  private mtx = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private col = new THREE.Color();
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    root: THREE.Object3D,
    private terrain: TerrainGenerator,
  ) {
    this.sc = terrain.makeSample();
    const seaweedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    seaweedMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.8;
          float sw = position.y * position.y;
          transformed.x += sin(uTime * 1.4 + ph + position.y * 3.0) * 0.2 * sw;
          transformed.z += cos(uTime * 1.1 + ph * 1.3 + position.y * 2.5) * 0.15 * sw;`,
        );
    };
    seaweedMat.customProgramCacheKey = () => 'evc-seaweed-v1';
    const coralMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.mats.push(seaweedMat, coralMat, rockMat);
    const geos = [bladeGeometry(), branchCoralGeometry(), domeCoralGeometry(), rockGeometry()];
    const mats = [seaweedMat, coralMat, coralMat, rockMat];
    const maxCaps = QUALITY[2].caps;
    for (let i = 0; i < 4; i++) {
      const m = new THREE.InstancedMesh(geos[i], mats[i], maxCaps[i]);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.name = ['seaweed', 'branchCoral', 'domeCoral', 'seaRock'][i];
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
      this.meshes.push(m);
      this.geos.push(geos[i]);
    }
    this.setQuality(1);
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    this.cells.clear();
    this.dirty = true;
    this.lastGx = 1e9;
  }

  private ensureOffsets(reach: number): void {
    if (this.offsetsReach === reach) return;
    this.offsetsReach = reach;
    this.offsets = [];
    const r = Math.ceil(reach / CELL);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz) * CELL;
        if (d <= reach) this.offsets.push({ dx, dz, d });
      }
    }
    this.offsets.sort((a, b) => a.d - b.d);
  }

  private key(gx: number, gz: number): number {
    return (gx + 5000) * 20000 + (gz + 5000);
  }

  /** Plants of one grid cell (can be empty). */
  private makeCell(gx: number, gz: number): Inst[] {
    const out: Inst[] = [];
    const x = (gx + hash2(gx, gz, 11)) * CELL;
    const z = (gz + hash2(gx, gz, 12)) * CELL;
    this.terrain.sample(x, z, this.sc);
    const s = this.sc;
    if (Number.isNaN(s.water)) return out;
    const depth = s.water - s.h;
    if (depth < 1.0) return out;
    const reef = vnoise(x * 0.013 + 10, z * 0.013, 3); // > 0.55: coral reef zone, otherwise sea-grass meadow
    const rocky = vnoise(x * 0.035, z * 0.035 + 40, 4);
    const r1 = hash2(gx, gz, 21);
    const r2 = hash2(gx, gz, 22);
    const r3 = hash2(gx, gz, 23);
    const r4 = hash2(gx, gz, 24);

    // seaweed meadows and kelp forests
    if (depth <= 30 && reef < 0.6 && r1 < 0.62) {
      const clumps = 1 + (r2 > 0.55 ? 1 : 0) + (r2 > 0.85 ? 1 : 0);
      for (let c = 0; c < clumps; c++) {
        const jx = (hash2(gx, gz, 30 + c) - 0.5) * CELL * 0.9;
        const jz = (hash2(gx, gz, 40 + c) - 0.5) * CELL * 0.9;
        let height = 0.7 + hash2(gx, gz, 50 + c) * 1.8;
        if (depth > 6 && r3 > 0.6) height = Math.min(depth * 0.7, 3 + hash2(gx, gz, 60 + c) * 6); // kelp
        height = Math.min(height, depth * 0.9); // never sticks out of the water
        const w = 0.85 + hash2(gx, gz, 70 + c) * 0.9;
        out.push({
          kind: 0, x: x + jx, y: s.h - 0.08, z: z + jz, yaw: hash2(gx, gz, 80 + c) * 6.28,
          sx: w, sy: height, sz: w, tint: Math.floor(hash2(gx, gz, 90 + c) * SEAWEED_TINTS.length),
        });
      }
    }
    // coral reef (clear shallow water)
    if (reef > 0.52 && depth >= 1.5 && depth <= 18) {
      if (r1 < 0.55) {
        const sc = 0.7 + r2 * 1.5;
        out.push({
          kind: 1, x: x + (r3 - 0.5) * 3, y: s.h - 0.05, z: z + (r4 - 0.5) * 3, yaw: r2 * 6.28,
          sx: sc, sy: Math.min(sc * (0.8 + r3 * 0.8), (depth - 0.4) / 0.85), sz: sc, tint: Math.floor(r4 * CORAL_TINTS.length),
        });
      }
      if (r2 < 0.45) {
        const sc = 0.6 + r3 * 1.4;
        out.push({
          kind: 2, x: x - (r4 - 0.5) * 3, y: s.h - 0.02, z: z + (r1 - 0.5) * 3, yaw: r3 * 6.28,
          sx: sc, sy: sc * (0.8 + r1 * 0.4), sz: sc * (0.8 + r2 * 0.4), tint: Math.floor(r1 * DOME_TINTS.length),
        });
      }
    }
    // rocks
    if (rocky > 0.55 && r4 < 0.45) {
      const sc = 0.4 + r1 * r1 * 2.4;
      out.push({
        kind: 3, x: x + (r2 - 0.5) * 3, y: s.h + 0.05 * sc, z: z + (r3 - 0.5) * 3, yaw: r1 * 6.28,
        sx: sc * (0.9 + r2 * 0.6), sy: sc * (0.6 + r3 * 0.5), sz: sc, tint: Math.floor(r4 * ROCK_TINTS.length),
      });
    }
    return out;
  }

  /** cx, cz = where the player / camera is (absolute world metres). */
  update(dt: number, time: number, cx: number, cz: number): void {
    this.uTime.value = time;
    const Q = QUALITY[this.quality];
    this.ensureOffsets(Q.reach);
    const gx0 = Math.floor(cx / CELL);
    const gz0 = Math.floor(cz / CELL);
    if (gx0 !== this.lastGx || gz0 !== this.lastGz) {
      this.lastGx = gx0;
      this.lastGz = gz0;
      this.dirty = true;
    }
    // compute a few missing cells per frame, nearest first
    let budget = 36;
    for (let i = 0; i < this.offsets.length && budget > 0; i++) {
      const o = this.offsets[i];
      const k = this.key(gx0 + o.dx, gz0 + o.dz);
      if (this.cells.has(k)) continue;
      this.cells.set(k, this.makeCell(gx0 + o.dx, gz0 + o.dz));
      this.dirty = true;
      budget--;
    }
    // forget far cells
    this.evictTimer -= dt;
    if (this.evictTimer <= 0) {
      this.evictTimer = 1.5;
      const lim = Math.ceil((Q.reach + 15) / CELL);
      for (const k of this.cells.keys()) {
        const gx = Math.floor(k / 20000) - 5000;
        const gz = (k % 20000) - 5000;
        if (Math.abs(gx - gx0) > lim || Math.abs(gz - gz0) > lim) this.cells.delete(k);
      }
    }
    this.rebuildTimer -= dt;
    if (this.dirty && this.rebuildTimer <= 0) {
      this.rebuildTimer = 0.25;
      this.dirty = false;
      this.rebuild(gx0, gz0);
    }
  }

  private rebuild(gx0: number, gz0: number): void {
    const caps = QUALITY[this.quality].caps;
    const n = [0, 0, 0, 0];
    for (let i = 0; i < this.offsets.length; i++) {
      const o = this.offsets[i];
      const list = this.cells.get(this.key(gx0 + o.dx, gz0 + o.dz));
      if (!list) continue;
      for (const it of list) {
        const k = it.kind;
        if (n[k] >= caps[k]) continue;
        const mesh = this.meshes[k];
        this.quat.setFromAxisAngle(this.yAxis, it.yaw);
        this.pos.set(it.x, it.y, it.z);
        this.scl.set(it.sx, it.sy, it.sz);
        this.mtx.compose(this.pos, this.quat, this.scl);
        mesh.setMatrixAt(n[k], this.mtx);
        const t = k === 0 ? SEAWEED_TINTS[it.tint] : k === 1 ? CORAL_TINTS[it.tint] : k === 2 ? DOME_TINTS[it.tint] : ROCK_TINTS[it.tint];
        this.col.setRGB(t[0], t[1], t[2]);
        mesh.setColorAt(n[k], this.col);
        n[k]++;
      }
    }
    for (let k = 0; k < 4; k++) {
      const m = this.meshes[k];
      m.count = n[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Total number of plants / rocks drawn (debug). */
  get count(): number {
    return this.meshes.reduce((a, m) => a + m.count, 0);
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
