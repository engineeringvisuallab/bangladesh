import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { PAT, attachPattern, buildReefFishGeometry, buildReefFishMaterial } from './ReefFish';
import { hash2, mergeParts, part } from './GeoUtil';

/**
 * Life under the surface of every sea, lake and river:
 *  - fish schools (small shoals, medium shoals, big loners) that swim in 3D, turn away from the shore, scatter from a swimmer
 *  - jellyfish pulsing and drifting
 *  - sea turtles gliding with their flippers beating
 * Everything is instanced; groups appear around the camera where the water is deep enough and are removed when far away.
 * Positions are absolute world metres (objects live under the world root).
 */

const SLOT = 24; // fish slots per school
const MAX_SCHOOLS = 22;

/** [schools, jellyfish, turtles, spawn radius m] per quality. */
const QUALITY = [
  { schools: 7, jelly: 5, turtles: 0, reach: 55 },
  { schools: 14, jelly: 10, turtles: 2, reach: 85 },
  { schools: 22, jelly: 18, turtles: 4, reach: 115 },
] as const;

/**
 * Fish species. Kind 0 = shoals (14-24 fish), 1 = small groups (6-10), 2 = big loners (1-2).
 * theme = colours (shown at 70 / 30 %), pat = body pattern (see ReefFish.ts), asp = body aspect (width, height, length),
 * size = length range (m), w = how often it is picked.
 */
interface FishSp {
  kind: 0 | 1 | 2;
  w: number;
  theme: [number, number, number][];
  pat: number;
  asp: [number, number, number];
  size: [number, number];
  fast?: number;
}
const FISH_SPECIES: FishSp[] = [
  { kind: 0, w: 3, theme: [[1.5, 0.8, 0.25], [1.6, 0.55, 0.2]], pat: PAT.SILVER, asp: [1, 1, 1], size: [0.2, 0.3] }, // anthias
  { kind: 0, w: 2, theme: [[0.45, 0.8, 1.5], [0.35, 0.65, 1.3]], pat: PAT.SILVER, asp: [0.9, 0.9, 1], size: [0.2, 0.3] }, // blue chromis
  { kind: 0, w: 2, theme: [[0.5, 0.85, 1.5], [0.9, 1.0, 1.3]], pat: PAT.STRIPE, asp: [0.8, 0.75, 1.3], size: [0.26, 0.4] }, // fusilier
  { kind: 0, w: 2, theme: [[1.2, 1.25, 1.3], [1.0, 1.05, 1.15]], pat: PAT.SILVER, asp: [0.75, 0.7, 1.3], size: [0.22, 0.34] }, // sardines
  { kind: 0, w: 1, theme: [[1.5, 1.4, 0.3], [1.3, 1.25, 0.45]], pat: PAT.BARS, asp: [1, 1.2, 1], size: [0.22, 0.32] }, // sergeant major
  { kind: 1, w: 2, theme: [[1.3, 1.0, 0.3], [0.5, 0.7, 1.5]], pat: PAT.BARS, asp: [0.8, 1.9, 0.95], size: [0.5, 0.75] }, // angelfish
  { kind: 1, w: 2, theme: [[1.6, 1.5, 0.5], [1.5, 1.4, 0.4]], pat: PAT.BARS, asp: [0.75, 1.8, 0.9], size: [0.4, 0.6] }, // butterflyfish
  { kind: 1, w: 3, theme: [[1.7, 0.6, 0.15], [1.6, 0.7, 0.2]], pat: PAT.CLOWN, asp: [1, 1.05, 0.85], size: [0.25, 0.4] }, // clownfish
  { kind: 1, w: 2, theme: [[0.2, 0.5, 1.7], [0.25, 0.45, 1.5]], pat: PAT.TANG, asp: [0.8, 1.5, 1], size: [0.4, 0.6] }, // blue tang
  { kind: 1, w: 2, theme: [[0.3, 1.1, 0.9], [0.6, 0.7, 1.4]], pat: PAT.SPOTS, asp: [1, 1.1, 1.2], size: [0.55, 0.85] }, // parrotfish
  { kind: 2, w: 2, theme: [[0.85, 0.5, 0.35], [0.55, 0.55, 0.4]], pat: PAT.SPOTS, asp: [1.2, 1.1, 1], size: [1.2, 2.0] }, // grouper
  { kind: 2, w: 2, theme: [[0.95, 1.0, 1.05]], pat: PAT.SILVER, asp: [0.7, 0.5, 1.8], size: [1.4, 2.4], fast: 1.5 }, // barracuda
  { kind: 2, w: 2, theme: [[0.5, 0.7, 1.25], [0.6, 0.8, 1.2]], pat: PAT.SILVER, asp: [1, 0.9, 1.1], size: [1.4, 2.2], fast: 1.6 }, // tuna
  { kind: 2, w: 1, theme: [[1.1, 1.15, 1.1]], pat: PAT.SILVER, asp: [0.85, 1.1, 1.1], size: [1.2, 1.8] }, // giant trevally
];
const JELLY_TINTS: [number, number, number][] = [
  [1.0, 0.65, 1.0],
  [0.6, 0.9, 1.0],
  [1.0, 0.85, 0.9],
  [0.7, 1.0, 0.85],
];

interface School {
  alive: boolean;
  kind: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  baseSpeed: number;
  size: number;
  n: number;
  turn: number;
  timer: number;
  yFrac: number;
  scatter: number;
  asp: [number, number, number];
}

interface Fish {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  ox: number;
  oy: number;
  oz: number;
  phase: number;
  k: number;
}

interface Jelly {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  phase: number;
  size: number;
  heading: number;
}

interface Turtle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  roll: number;
  turn: number;
  timer: number;
  size: number;
  speed: number;
  yFrac: number;
}

function jellyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bell = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  bell.scale(1, 0.72, 1);
  parts.push(part(bell, (_x, y) => [0.75 + 0.5 * Math.min(1, y * 2.2), 0.75 + 0.45 * Math.min(1, y * 2.2), 1.0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.CylinderGeometry(0.012, 0.004, 1.15, 4, 4);
    t.translate(Math.cos(a) * 0.4, -0.58, Math.sin(a) * 0.4);
    parts.push(part(t, (_x, y) => [0.95, 0.8 + 0.2 * Math.max(0, y + 1), 1.0]));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const t = new THREE.CylinderGeometry(0.045, 0.012, 0.55, 5, 3);
    t.translate(Math.cos(a) * 0.1, -0.28, Math.sin(a) * 0.1);
    parts.push(part(t, () => [1.0, 0.75, 0.95]));
  }
  return mergeParts(parts);
}

function turtleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shell = new THREE.SphereGeometry(0.5, 14, 10);
  shell.scale(0.62, 0.3, 0.82);
  parts.push(
    part(shell, (x, y, z) => {
      const plate = 0.78 + 0.22 * Math.sin(x * 16) * Math.sin(z * 14);
      return y > -0.02 ? [0.3 * plate, 0.42 * plate, 0.18 * plate] : [0.75, 0.72, 0.5];
    }),
  );
  const head = new THREE.SphereGeometry(0.11, 8, 6);
  head.scale(1, 0.9, 1.35);
  head.translate(0, 0.01, 0.55);
  parts.push(part(head, () => [0.5, 0.55, 0.3]));
  const flipFlap = (x: number): number => Math.min(1, Math.max(0, (Math.abs(x) - 0.22) / 0.4));
  for (const s of [-1, 1]) {
    const f = new THREE.SphereGeometry(0.3, 8, 6);
    f.scale(1.55, 0.1, 0.44);
    f.rotateY(s * 0.5);
    f.translate(s * 0.55, -0.03, 0.16);
    parts.push(part(f, () => [0.4, 0.5, 0.25], flipFlap));
    const r = new THREE.SphereGeometry(0.2, 7, 5);
    r.scale(1.25, 0.09, 0.5);
    r.rotateY(-s * 0.4);
    r.translate(s * 0.3, -0.04, -0.46);
    parts.push(part(r, () => [0.4, 0.5, 0.25], (x) => 0.35 * flipFlap(x)));
  }
  return mergeParts(parts);
}

export class MarineLife {
  private fishMesh: THREE.InstancedMesh;
  private fishGeo = buildReefFishGeometry();
  private fishMat: THREE.MeshStandardMaterial;
  private patAttr: THREE.InstancedBufferAttribute;
  private jellyMesh: THREE.InstancedMesh;
  private jellyGeo = jellyGeometry();
  private jellyMat: THREE.MeshBasicMaterial;
  private turtleMesh: THREE.InstancedMesh;
  private turtleGeo = turtleGeometry();
  private turtleMat: THREE.MeshStandardMaterial;
  private uTime = { value: 0 };
  private schools: School[] = [];
  private fish: Fish[] = [];
  private jellies: Jelly[] = [];
  private turtles: Turtle[] = [];
  private sc: TerrainSample;
  private s2: TerrainSample;
  private quality = 1;
  private spawnTimer = 0;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private seq = 1;

  constructor(
    root: THREE.Object3D,
    private terrain: TerrainGenerator,
  ) {
    this.sc = terrain.makeSample();
    this.s2 = terrain.makeSample();
    this.dummy.rotation.order = 'YXZ';

    // fish
    this.patAttr = attachPattern(this.fishGeo, MAX_SCHOOLS * SLOT);
    this.fishMat = buildReefFishMaterial(this.uTime);
    this.fishMesh = new THREE.InstancedMesh(this.fishGeo, this.fishMat, MAX_SCHOOLS * SLOT);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.name = 'marineFish';
    for (let i = 0; i < MAX_SCHOOLS; i++) {
      this.schools.push({ alive: false, kind: 0, x: 0, y: 0, z: 0, heading: 0, speed: 1, baseSpeed: 1, size: 0.3, n: 0, turn: 0, timer: 0, yFrac: 0.5, scatter: 0, asp: [1, 1, 1] });
      for (let k = 0; k < SLOT; k++) {
        this.fish.push({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, ox: 0, oy: 0, oz: 0, phase: 0, k: 1 });
        this.fishMesh.setMatrixAt(i * SLOT + k, this.zero);
        this.fishMesh.setColorAt(i * SLOT + k, this.col.setRGB(1, 1, 1));
      }
    }
    root.add(this.fishMesh);

    // jellyfish
    this.jellyMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.jellyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.7;
          float pulse = sin(uTime * 2.2 + ph);
          float bellW = step(0.0, position.y);
          transformed.xz *= 1.0 + 0.13 * pulse * bellW;
          transformed.y *= 1.0 - 0.1 * pulse * bellW;
          transformed.x += sin(uTime * 2.0 + ph + position.y * 4.0) * 0.06 * (1.0 - bellW) * -position.y;
          transformed.z += cos(uTime * 1.7 + ph + position.y * 3.0) * 0.06 * (1.0 - bellW) * -position.y;`,
        );
    };
    this.jellyMat.customProgramCacheKey = () => 'evc-jelly-v1';
    this.jellyMesh = new THREE.InstancedMesh(this.jellyGeo, this.jellyMat, QUALITY[2].jelly);
    this.jellyMesh.frustumCulled = false;
    this.jellyMesh.renderOrder = 3;
    this.jellyMesh.name = 'jellyfish';
    for (let i = 0; i < QUALITY[2].jelly; i++) {
      this.jellies.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, phase: 0, size: 0.6, heading: 0 });
      this.jellyMesh.setMatrixAt(i, this.zero);
      this.jellyMesh.setColorAt(i, this.col.setRGB(1, 1, 1));
    }
    root.add(this.jellyMesh);

    // turtles
    this.turtleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.turtleMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFlap;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float tph = instanceMatrix[3].x * 0.4 + instanceMatrix[3].z * 0.5;
          transformed.y += sin(uTime * 1.7 + tph) * 0.3 * aFlap * (abs(position.x) - 0.15);`,
        );
    };
    this.turtleMat.customProgramCacheKey = () => 'evc-turtle-v1';
    this.turtleMesh = new THREE.InstancedMesh(this.turtleGeo, this.turtleMat, QUALITY[2].turtles);
    this.turtleMesh.frustumCulled = false;
    this.turtleMesh.name = 'seaTurtles';
    for (let i = 0; i < QUALITY[2].turtles; i++) {
      this.turtles.push({ alive: false, x: 0, y: 0, z: 0, heading: 0, roll: 0, turn: 0, timer: 0, size: 1.2, speed: 0.8, yFrac: 0.5 });
      this.turtleMesh.setMatrixAt(i, this.zero);
    }
    root.add(this.turtleMesh);
    this.setQuality(1);
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    // groups above the new limit disappear at once
    const Q = QUALITY[this.quality];
    for (let i = Q.schools; i < MAX_SCHOOLS; i++) this.killSchool(i);
    for (let i = Q.jelly; i < this.jellies.length; i++) this.killJelly(i);
    for (let i = Q.turtles; i < this.turtles.length; i++) this.killTurtle(i);
  }

  private killSchool(i: number): void {
    this.schools[i].alive = false;
    for (let k = 0; k < SLOT; k++) this.fishMesh.setMatrixAt(i * SLOT + k, this.zero);
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }
  private killJelly(i: number): void {
    this.jellies[i].alive = false;
    this.jellyMesh.setMatrixAt(i, this.zero);
    this.jellyMesh.instanceMatrix.needsUpdate = true;
  }
  private killTurtle(i: number): void {
    this.turtles[i].alive = false;
    this.turtleMesh.setMatrixAt(i, this.zero);
    this.turtleMesh.instanceMatrix.needsUpdate = true;
  }

  private rnd(): number {
    return hash2(this.seq++, 4242, 17);
  }
  private r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  /** A random spot in water at least `minDepth` deep, in a ring around (cx, cz). Result in this.s2 / out. */
  private findWater(cx: number, cz: number, reach: number, minDepth: number, out: { x: number; z: number; h: number; water: number }): boolean {
    for (let a = 0; a < 5; a++) {
      const ang = this.rnd() * Math.PI * 2;
      const d = 14 + this.rnd() * (reach - 14);
      const x = cx + Math.cos(ang) * d;
      const z = cz + Math.sin(ang) * d;
      if (Math.abs(x) > 4900 || Math.abs(z) > 4900) continue;
      this.terrain.sample(x, z, this.s2);
      if (Number.isNaN(this.s2.water) || this.s2.water - this.s2.h < minDepth) continue;
      out.x = x;
      out.z = z;
      out.h = this.s2.h;
      out.water = this.s2.water;
      return true;
    }
    return false;
  }

  private spot = { x: 0, z: 0, h: 0, water: 0 };

  private spawnSchool(i: number, cx: number, cz: number, reach: number): void {
    const kindRoll = this.rnd();
    const kind: 0 | 1 | 2 = kindRoll < 0.58 ? 0 : kindRoll < 0.9 ? 1 : 2;
    const minDepth = kind === 2 ? 6 : kind === 1 ? 3.5 : 2.6;
    if (!this.findWater(cx, cz, reach, minDepth, this.spot)) return;
    // pick a species of this kind (weighted)
    const pool = FISH_SPECIES.filter((f) => f.kind === kind);
    let tot = 0;
    for (const f of pool) tot += f.w;
    let pick = this.rnd() * tot;
    let sp0 = pool[0];
    for (const f of pool) {
      pick -= f.w;
      if (pick <= 0) {
        sp0 = f;
        break;
      }
    }
    const s = this.schools[i];
    const sp = this.spot;
    s.alive = true;
    s.kind = kind;
    s.x = sp.x;
    s.z = sp.z;
    s.heading = this.rnd() * Math.PI * 2;
    s.n = kind === 0 ? 14 + Math.floor(this.rnd() * 10) : kind === 1 ? 6 + Math.floor(this.rnd() * 5) : 1 + Math.floor(this.rnd() * 2);
    s.size = this.r(sp0.size[0], sp0.size[1]);
    s.asp = sp0.asp;
    s.baseSpeed = (kind === 0 ? this.r(0.9, 1.7) : kind === 1 ? this.r(0.9, 1.5) : this.r(0.6, 1.1)) * (sp0.fast ?? 1);
    s.speed = s.baseSpeed;
    s.turn = 0;
    s.timer = 0;
    s.scatter = 0;
    s.yFrac = this.r(0.15, 0.85);
    const depth = sp.water - sp.h;
    s.y = sp.water - Math.max(0.8, depth * s.yFrac);
    const theme = sp0.theme;
    const spread = kind === 0 ? 1.4 : kind === 1 ? 2.2 : 3;
    for (let k = 0; k < SLOT; k++) {
      const f = this.fish[i * SLOT + k];
      f.ox = (this.rnd() - 0.5) * spread * 2;
      f.oy = (this.rnd() - 0.5) * spread * 0.8;
      f.oz = (this.rnd() - 0.5) * spread * 2;
      f.x = s.x + f.ox;
      f.y = s.y + f.oy;
      f.z = s.z + f.oz;
      f.heading = s.heading;
      f.pitch = 0;
      f.phase = this.rnd() * 6.28;
      f.k = 0.8 + this.rnd() * 0.4;
      const t = theme[this.rnd() < 0.7 || theme.length < 2 ? 0 : 1];
      this.patAttr.setX(i * SLOT + k, sp0.pat);
      const v = 0.85 + this.rnd() * 0.3;
      this.fishMesh.setColorAt(i * SLOT + k, this.col.setRGB(t[0] * v, t[1] * v, t[2] * v));
    }
    if (this.fishMesh.instanceColor) this.fishMesh.instanceColor.needsUpdate = true;
    this.patAttr.needsUpdate = true;
  }

  private spawnJelly(i: number, cx: number, cz: number, reach: number): void {
    if (!this.findWater(cx, cz, reach, 5.5, this.spot)) return;
    const j = this.jellies[i];
    const sp = this.spot;
    j.alive = true;
    j.x = sp.x;
    j.z = sp.z;
    j.y = sp.water - this.r(2.5, Math.min(sp.water - sp.h - 1.5, 22));
    j.size = this.r(0.4, 1.1);
    j.heading = this.rnd() * 6.28;
    j.vx = Math.sin(j.heading) * 0.2;
    j.vz = Math.cos(j.heading) * 0.2;
    j.phase = this.rnd() * 6.28;
    this.jellyMesh.setColorAt(i, this.col.setRGB(...JELLY_TINTS[Math.floor(this.rnd() * JELLY_TINTS.length)]));
    if (this.jellyMesh.instanceColor) this.jellyMesh.instanceColor.needsUpdate = true;
  }

  private spawnTurtle(i: number, cx: number, cz: number, reach: number): void {
    if (!this.findWater(cx, cz, reach, 4, this.spot)) return;
    const t = this.turtles[i];
    const sp = this.spot;
    t.alive = true;
    t.x = sp.x;
    t.z = sp.z;
    t.heading = this.rnd() * 6.28;
    t.size = this.r(1.0, 1.7);
    t.speed = this.r(0.6, 1.0);
    t.turn = 0;
    t.timer = 0;
    t.roll = 0;
    t.yFrac = this.r(0.2, 0.7);
    t.y = sp.water - Math.max(1, (sp.water - sp.h) * t.yFrac);
  }

  /** cam = camera world position, focus = the swimmer (fish scatter from it). */
  update(dt: number, time: number, cam: THREE.Vector3, focus: THREE.Vector3): void {
    this.uTime.value = time;
    const Q = QUALITY[this.quality];
    dt = Math.min(dt, 0.05);

    // spawn: one or two groups per tick (checked every 0.3 s), dead ones come back around the camera
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.3;
      let tries = 2;
      for (let i = 0; i < Q.schools && tries > 0; i++) if (!this.schools[i].alive) { this.spawnSchool(i, cam.x, cam.z, Q.reach); tries--; }
      for (let i = 0; i < Q.jelly && tries > 0; i++) if (!this.jellies[i].alive) { this.spawnJelly(i, cam.x, cam.z, Q.reach); tries--; }
      for (let i = 0; i < Q.turtles && tries > 0; i++) if (!this.turtles[i].alive) { this.spawnTurtle(i, cam.x, cam.z, Q.reach); tries--; }
    }

    this.updateFish(dt, time, cam, focus, Q.reach);
    this.updateJellies(dt, time, cam, Q.reach);
    this.updateTurtles(dt, cam, Q.reach);
  }

  private updateFish(dt: number, time: number, cam: THREE.Vector3, focus: THREE.Vector3, reach: number): void {
    const d = this.dummy;
    for (let i = 0; i < MAX_SCHOOLS; i++) {
      const s = this.schools[i];
      if (!s.alive) continue;
      if (Math.hypot(s.x - cam.x, s.z - cam.z) > reach + 30) {
        this.killSchool(i);
        continue;
      }
      // wander
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = this.r(2, 6);
        s.turn = this.r(-0.6, 0.6);
      }
      // scatter from a swimmer / diver close by
      const dxp = s.x - focus.x;
      const dzp = s.z - focus.z;
      const dyp = s.y - focus.y;
      const dp = Math.hypot(dxp, dzp, dyp * 0.6);
      const nervous = s.kind === 2 ? 5 : 8;
      s.scatter = dp < nervous ? Math.min(1, s.scatter + dt * 4) : Math.max(0, s.scatter - dt * 0.8);
      if (s.scatter > 0.05) {
        const away = Math.atan2(dxp, dzp);
        let diff = away - s.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.heading += diff * Math.min(1, dt * 3.5) * s.scatter;
      }
      s.speed += (s.baseSpeed * (1 + s.scatter * 1.9) - s.speed) * Math.min(1, dt * 2);
      s.heading += s.turn * dt;
      // keep out of the shallows: look ahead
      const ahead = 6 + s.size * 6;
      const fx = s.x + Math.sin(s.heading) * ahead;
      const fz = s.z + Math.cos(s.heading) * ahead;
      this.terrain.sample(fx, fz, this.sc);
      const sc = this.sc;
      const minD = s.kind === 2 ? 4 : s.kind === 1 ? 2.4 : 1.9;
      if (Number.isNaN(sc.water) || sc.water - sc.h < minD) {
        s.heading += 2.6 * dt * (s.turn >= 0 ? 1 : -1) + 1.0 * dt;
        s.speed = Math.max(0.4, s.speed * 0.985);
      }
      s.x += Math.sin(s.heading) * s.speed * dt;
      s.z += Math.cos(s.heading) * s.speed * dt;
      this.terrain.sample(s.x, s.z, this.sc);
      if (!Number.isNaN(this.sc.water)) {
        const depth = this.sc.water - this.sc.h;
        const want = this.sc.water - Math.min(depth - 0.7, Math.max(0.9, depth * (s.yFrac + 0.18 * Math.sin(time * 0.2 + i))));
        s.y += (Math.max(this.sc.h + 0.7, Math.min(this.sc.water - 0.7, want)) - s.y) * Math.min(1, dt * 1.2);
      }
      // the fish follow their slot in the school with a springy lag
      const c = Math.cos(s.heading);
      const sn = Math.sin(s.heading);
      const k = 1 - Math.exp(-2.4 * dt);
      for (let n = 0; n < s.n; n++) {
        const f = this.fish[i * SLOT + n];
        const wob = 0.45 * (1 - s.scatter * 0.7);
        const lx = f.ox + Math.sin(time * 0.7 + f.phase) * wob;
        const lz = f.oz + Math.cos(time * 0.6 + f.phase * 1.3) * wob;
        const ly = f.oy + Math.sin(time * 0.9 + f.phase) * 0.18;
        const tx = s.x + lx * c + lz * sn;
        const tz = s.z - lx * sn + lz * c;
        const ty = s.y + ly;
        const px = f.x;
        const py = f.y;
        const pz = f.z;
        f.x += (tx - f.x) * k;
        f.y += (ty - f.y) * k;
        f.z += (tz - f.z) * k;
        const vx = f.x - px;
        const vy = f.y - py;
        const vz = f.z - pz;
        const hv = Math.hypot(vx, vz);
        const want = hv > 0.002 ? Math.atan2(vx, vz) : s.heading;
        let diff = want - f.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.heading += diff * Math.min(1, dt * 6);
        f.pitch += (Math.atan2(vy, Math.max(hv, 0.001)) - f.pitch) * Math.min(1, dt * 4);
        d.position.set(f.x, f.y, f.z);
        d.rotation.set(-Math.max(-0.6, Math.min(0.6, f.pitch)), f.heading, 0);
        d.scale.set(s.size * f.k * s.asp[0], s.size * f.k * s.asp[1], s.size * f.k * s.asp[2]);
        d.updateMatrix();
        this.fishMesh.setMatrixAt(i * SLOT + n, d.matrix);
      }
      for (let n = s.n; n < SLOT; n++) this.fishMesh.setMatrixAt(i * SLOT + n, this.zero);
    }
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }

  private updateJellies(dt: number, time: number, cam: THREE.Vector3, reach: number): void {
    const d = this.dummy;
    for (let i = 0; i < this.jellies.length; i++) {
      const j = this.jellies[i];
      if (!j.alive) continue;
      if (Math.hypot(j.x - cam.x, j.z - cam.z) > reach + 30) {
        this.killJelly(i);
        continue;
      }
      // pulse-propelled: rises with each contraction, sinks slowly in between
      const pulse = Math.sin(time * 2.2 + (j.x * 0.5 + j.z * 0.7));
      const vy = pulse > 0.2 ? 0.28 * pulse : -0.07;
      j.heading += Math.sin(time * 0.3 + j.phase) * 0.15 * dt;
      j.vx += (Math.sin(j.heading) * 0.22 - j.vx) * Math.min(1, dt * 0.8);
      j.vz += (Math.cos(j.heading) * 0.22 - j.vz) * Math.min(1, dt * 0.8);
      this.terrain.sample(j.x + j.vx * 6, j.z + j.vz * 6, this.sc);
      if (Number.isNaN(this.sc.water) || this.sc.water - this.sc.h < 3.5) j.heading += 1.5 * dt;
      j.x += j.vx * dt;
      j.z += j.vz * dt;
      j.y += vy * dt;
      this.terrain.sample(j.x, j.z, this.s2);
      if (!Number.isNaN(this.s2.water)) {
        j.y = Math.max(this.s2.h + 1.2, Math.min(this.s2.water - 1.8, j.y));
      }
      d.position.set(j.x, j.y, j.z);
      d.rotation.set(Math.sin(time * 0.5 + j.phase) * 0.12, j.heading, Math.cos(time * 0.4 + j.phase) * 0.1);
      d.scale.setScalar(j.size);
      d.updateMatrix();
      this.jellyMesh.setMatrixAt(i, d.matrix);
    }
    this.jellyMesh.instanceMatrix.needsUpdate = true;
  }

  private updateTurtles(dt: number, cam: THREE.Vector3, reach: number): void {
    const d = this.dummy;
    for (let i = 0; i < this.turtles.length; i++) {
      const t = this.turtles[i];
      if (!t.alive) continue;
      if (Math.hypot(t.x - cam.x, t.z - cam.z) > reach + 30) {
        this.killTurtle(i);
        continue;
      }
      t.timer -= dt;
      if (t.timer <= 0) {
        t.timer = this.r(4, 10);
        t.turn = this.r(-0.35, 0.35);
      }
      const ahead = 9;
      this.terrain.sample(t.x + Math.sin(t.heading) * ahead, t.z + Math.cos(t.heading) * ahead, this.sc);
      if (Number.isNaN(this.sc.water) || this.sc.water - this.sc.h < 3) t.turn = 0.7;
      t.heading += t.turn * dt;
      t.roll += (-t.turn * 0.8 - t.roll) * Math.min(1, dt * 2);
      t.x += Math.sin(t.heading) * t.speed * dt;
      t.z += Math.cos(t.heading) * t.speed * dt;
      this.terrain.sample(t.x, t.z, this.s2);
      let pitch = 0;
      if (!Number.isNaN(this.s2.water)) {
        const depth = this.s2.water - this.s2.h;
        const want = Math.max(this.s2.h + 1.0, Math.min(this.s2.water - 1.0, this.s2.water - depth * t.yFrac));
        pitch = Math.max(-0.4, Math.min(0.4, (want - t.y) * 0.4));
        t.y += (want - t.y) * Math.min(1, dt * 0.6);
      }
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(-pitch, t.heading, t.roll);
      d.scale.setScalar(t.size);
      d.updateMatrix();
      this.turtleMesh.setMatrixAt(i, d.matrix);
    }
    this.turtleMesh.instanceMatrix.needsUpdate = true;
  }

  /** Number of living groups (debug). */
  get stats(): { schools: number; jellyfish: number; turtles: number } {
    return {
      schools: this.schools.filter((s) => s.alive).length,
      jellyfish: this.jellies.filter((j) => j.alive).length,
      turtles: this.turtles.filter((t) => t.alive).length,
    };
  }

  dispose(): void {
    for (const m of [this.fishMesh, this.jellyMesh, this.turtleMesh]) {
      m.removeFromParent();
      m.dispose();
    }
    this.fishGeo.dispose();
    this.jellyGeo.dispose();
    this.turtleGeo.dispose();
    this.fishMat.dispose();
    this.jellyMat.dispose();
    this.turtleMat.dispose();
  }
}
