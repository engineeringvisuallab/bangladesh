// FIELD RENDERER (three.js). One field = a ground layer (cheap, drawn up to ~1.4 km) + a plant layer (instanced crops / trees, drawn within ~420 m).
//
// GROUND: procedural canvas textures (plough lines, stubble, flooded mud, green rows ...). Fields with `level` are bench terraces: a flat plane at
//   field.y with a low earth bund (ail) around it and an earth bank wherever the natural ground falls away; fields without it follow the slope.
//   Work in progress (`progress`): a ploughed / harvested part on one side of a frontier line, the unfinished part on the other.
// PLANTS: InstancedMesh per part (leaf, fruit, trunk, crown). Count per field is capped (~1800) by widening the spacing and fattening the plant,
//   so a field always looks full. A shared wind shader sways every plant (uniform `windUniform.value` = time).
import * as THREE from 'three';
import { mulberry32 } from '../world/Seed';
import { Stage, cropById, isPerennial, type CropDef } from './CropDefs';
import type { Field } from './FarmPlan';

export const windUniform = { value: 0 };
const GN = 13;

/** Ground heights of a field on a 13 x 13 grid (relative to field.y), bilinear lookup in the field's local frame. */
export class HeightGrid {
  readonly h = new Float32Array(GN * GN);
  constructor(readonly f: Field, heightAt: (x: number, z: number) => number) {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    for (let b = 0; b < GN; b++) for (let a = 0; a < GN; a++) {
      const lx = (a / (GN - 1) - 0.5) * f.w, lz = (b / (GN - 1) - 0.5) * f.d;
      this.h[b * GN + a] = heightAt(f.cx + lx * c + lz * s, f.cz - lx * s + lz * c) - f.y;
    }
  }
  at(lx: number, lz: number): number {
    const u = Math.min(GN - 1.001, Math.max(0, (lx / this.f.w + 0.5) * (GN - 1))), v = Math.min(GN - 1.001, Math.max(0, (lz / this.f.d + 0.5) * (GN - 1)));
    const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, i = b * GN + a;
    return (this.h[i] * (1 - fu) + this.h[i + 1] * fu) * (1 - fv) + (this.h[i + GN] * (1 - fu) + this.h[i + GN + 1] * fu) * fv;
  }
}

// ------------------------------------------------------------------ textures + materials
type TexKind = 'plowed' | 'stubble' | 'bare' | 'sown' | 'mud' | 'rows' | 'weeds' | 'grass';
const TEX_M = 6; // one texture tile = 6 m
const TEXS = new Map<string, THREE.CanvasTexture>();
const GMATS = new Map<string, THREE.MeshStandardMaterial>();
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const shade = (c: number, k: number) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

function groundTex(kind: TexKind, color: number): THREE.CanvasTexture {
  const key = `${kind}:${color}`;
  let t = TEXS.get(key);
  if (t) return t;
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const rnd = mulberry32(color ^ kind.length * 7919);
  g.fillStyle = hex(color); g.fillRect(0, 0, S, S);
  if (kind === 'plowed') {
    for (let y = 0; y < S; y += 16) { g.fillStyle = shade(color, 1.35); g.fillRect(0, y, S, 7); g.fillStyle = shade(color, 0.7); g.fillRect(0, y + 9, S, 4); }
  } else if (kind === 'rows') {
    for (let y = 0; y < S; y += 16) { g.fillStyle = shade(color, 0.72); g.fillRect(0, y + 10, S, 6); g.fillStyle = shade(color, 1.12); g.fillRect(0, y + 2, S, 4); }
    for (let i = 0; i < 260; i++) { g.fillStyle = shade(color, 0.85 + rnd() * 0.3); g.fillRect(rnd() * S, rnd() * S, 3, 3); }
  } else if (kind === 'stubble') {
    for (let i = 0; i < 700; i++) { g.fillStyle = shade(color, 0.7 + rnd() * 0.5); g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 6, 1.4); }
    for (let y = 0; y < S; y += 32) { g.fillStyle = 'rgba(70,45,25,0.22)'; g.fillRect(0, y + 12, S, 3); }
  } else if (kind === 'bare' || kind === 'sown') {
    for (let i = 0; i < 500; i++) { g.fillStyle = shade(color, 0.75 + rnd() * 0.5); g.fillRect(rnd() * S, rnd() * S, 2, 2); }
    if (kind === 'sown') for (let y = 4; y < S; y += 16) for (let x = 2; x < S; x += 10) { g.fillStyle = '#7bbf4a'; g.fillRect(x + rnd() * 3, y, 2, 2); }
  } else if (kind === 'mud') {
    for (let i = 0; i < 400; i++) { g.fillStyle = shade(color, 0.8 + rnd() * 0.45); g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 8, 2); }
  } else if (kind === 'weeds') {
    for (let i = 0; i < 600; i++) { g.fillStyle = rnd() < 0.7 ? shade(color, 0.7 + rnd() * 0.6) : '#8a6a42'; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 4, 2 + rnd() * 3); }
  } else {
    for (let i = 0; i < 700; i++) { g.fillStyle = shade(color, 0.75 + rnd() * 0.5); g.fillRect(rnd() * S, rnd() * S, 2, 3); }
  }
  t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEXS.set(key, t);
  return t;
}
function groundMat(kind: TexKind, color: number): THREE.MeshStandardMaterial {
  const key = `${kind}:${color}`;
  let m = GMATS.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: groundTex(kind, color), roughness: kind === 'mud' ? 0.45 : 1, metalness: 0 }); GMATS.set(key, m); }
  return m;
}
const EARTH = new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 1, side: THREE.DoubleSide });
const BUND = new THREE.MeshStandardMaterial({ color: 0x86684a, roughness: 1 });
const WATER = new THREE.MeshStandardMaterial({ color: 0x6f9fb0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });

/** The texture of a ground part: what the land looks like at this stage. `done` = the finished side of a work frontier. */
function surface(c: CropDef, stage: number, done: boolean): [TexKind, number] {
  const perennial = isPerennial(c);
  if (perennial) return ['grass', 0x72a84c];
  switch (stage) {
    case Stage.prepared: return done ? (c.flooded ? ['mud', 0x5a4632] : ['plowed', 0x4a3220]) : ['stubble', c.stubble || 0xb8a56a];
    case Stage.sown: return c.flooded ? ['mud', 0x5a4632] : ['sown', 0x6b4a2e];
    case Stage.seedling: return c.flooded ? ['mud', 0x5a4632] : ['rows', c.leaf[0]];
    case Stage.growing: return ['rows', c.leaf[1]];
    case Stage.mature: return ['rows', c.leaf[2]];
    case Stage.ripe: return ['rows', c.leaf[3]];
    case Stage.harvesting: return done ? ['stubble', c.stubble || 0xb8a56a] : ['rows', c.leaf[3]];
    case Stage.harvested: return ['stubble', c.stubble || 0xb8a56a];
    default: return ['weeds', 0x7f8f48];
  }
}

function groundPart(f: Field, grid: HeightGrid, x0: number, x1: number, mat: THREE.Material): THREE.Mesh {
  const nx = Math.max(1, Math.round((x1 - x0) / 8)), nz = Math.max(1, Math.round(f.d / 8));
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx: number[] = [];
  let p = 0, q = 0;
  for (let iz = 0; iz <= nz; iz++) {
    const lz = -f.d / 2 + (f.d * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const lx = x0 + ((x1 - x0) * ix) / nx;
      pos[p++] = lx; pos[p++] = f.level ? 0.03 : grid.at(lx, lz) + 0.07; pos[p++] = lz;
      uv[q++] = lx / TEX_M; uv[q++] = lz / TEX_M;
    }
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const a = iz * (nx + 1) + ix, b = a + nx + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** Earth bank under the low edges of a levelled terrace + the bund (ail) along its rim. */
function terraceWalls(f: Field, grid: HeightGrid, out: THREE.Group): void {
  const K = 14, pos: number[] = [];
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    for (let k = 0; k < K; k++) {
      const t0 = k / K, t1 = (k + 1) / K;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const b0 = Math.min(0.03, grid.at(x0, z0) - 0.25), b1 = Math.min(0.03, grid.at(x1, z1) - 0.25);
      if (b0 > 0 && b1 > 0) continue;
      pos.push(x0, 0.03, z0, x0, b0, z0, x1, 0.03, z1, x0, b0, z0, x1, b1, z1, x1, 0.03, z1);
    }
  };
  const hx = f.w / 2, hz = f.d / 2;
  edge(-hx, -hz, hx, -hz); edge(hx, -hz, hx, hz); edge(hx, hz, -hx, hz); edge(-hx, hz, -hx, -hz);
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    out.add(new THREE.Mesh(g, EARTH));
  }
  const bar = (w: number, d: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), BUND); m.position.set(x, 0.17, z); out.add(m); };
  bar(f.w, 0.55, 0, -hz + 0.27); bar(f.w, 0.55, 0, hz - 0.27); bar(0.55, f.d, -hx + 0.27, 0); bar(0.55, f.d, hx - 0.27, 0);
}

/** Cheap ground layer of a field (local frame; the caller sets group position / rotation). */
export function buildGround(f: Field, grid: HeightGrid): THREE.Group {
  const g = new THREE.Group(), c = cropById(f.crop);
  const split = f.stage === Stage.prepared || f.stage === Stage.harvesting;
  const xs = -f.w / 2 + f.progress * f.w;
  if (split && f.progress < 0.999) {
    const [k1, c1] = surface(c, f.stage, true), [k2, c2] = surface(c, f.stage, false);
    g.add(groundPart(f, grid, -f.w / 2, xs, groundMat(k1, c1)), groundPart(f, grid, xs, f.w / 2, groundMat(k2, c2)));
  } else {
    const [k, col] = surface(c, f.stage, true);
    g.add(groundPart(f, grid, -f.w / 2, f.w / 2, groundMat(k, col)));
  }
  if (f.level) {
    terraceWalls(f, grid, g);
    if (c.flooded && f.stage <= Stage.seedling) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(f.w - 1.4, f.d - 1.4), WATER);
      w.rotation.x = -Math.PI / 2; w.position.y = 0.17;
      g.add(w);
    }
  }
  g.userData.kind = 'ground';
  return g;
}

// ------------------------------------------------------------------ plant geometry (unit size, base at y = 0)
const GEOC = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = GEOC.get(key);
  if (!g) { g = make(); GEOC.set(key, g); }
  return g;
}
/** Build a vertex-coloured mesh from triangles [x,y,z]*3 (colour = dark at the base, light at the tip). */
function triGeo(tris: number[][]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  for (const t of tris) for (let i = 0; i < 9; i += 3) { pos.push(t[i], t[i + 1], t[i + 2]); const k = 0.55 + 0.45 * Math.min(1, t[i + 1]); col.push(k, k, k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}
const tuftGeo = () => cached('tuft', () => {
  const t: number[][] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, dx = Math.cos(a), dz = Math.sin(a);
    t.push([-0.5 * dx, 0, -0.5 * dz, 0.5 * dx, 0, 0.5 * dz, -0.1 * dx, 1, -0.1 * dz], [0.5 * dx, 0, 0.5 * dz, 0.1 * dx, 1, 0.1 * dz, -0.1 * dx, 1, -0.1 * dz]);
  }
  return triGeo(t);
});
const stalkGeo = () => cached('stalk', () => {
  const t: number[][] = [];
  for (let k = 0; k < 2; k++) { const a = (k * Math.PI) / 2, dx = Math.cos(a), dz = Math.sin(a); t.push([-0.03 * dx, 0, -0.03 * dz, 0.03 * dx, 0, 0.03 * dz, 0, 1, 0]); }
  for (let L = 0; L < 5; L++) for (let s = 0; s < 3; s++) {
    const y = 0.25 + L * 0.15, a = L * 1.9 + s * 2.09, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    t.push([0, y, 0, dx * 0.5 + px * 0.06, y - 0.1, dz * 0.5 + pz * 0.06, dx * 0.5 - px * 0.06, y - 0.1, dz * 0.5 - pz * 0.06]);
  }
  return triGeo(t);
});
const blobGeo = () => cached('blob', () => { const g = new THREE.IcosahedronGeometry(0.5, 1); g.translate(0, 0.5, 0); return g; });
const dotGeo = () => cached('dot', () => new THREE.IcosahedronGeometry(0.5, 0));
const trunkGeo = () => cached('trunk', () => { const g = new THREE.CylinderGeometry(0.4, 0.5, 1, 7); g.translate(0, 0.5, 0); return g; });
const frondGeo = () => cached('frond', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.5); return g; });
const postGeo = () => cached('post', () => { const g = new THREE.BoxGeometry(0.1, 1, 0.1); g.translate(0, 0.5, 0); return g; });

function windify(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3( position );
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float bend = clamp( position.y, 0.0, 3.0 );
      transformed.x += sin( uWind * 1.7 + ph ) * 0.05 * bend;
      transformed.z += cos( uWind * 1.3 + ph * 1.3 ) * 0.04 * bend;`);
  };
  return m;
}
const LEAF_V = windify(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }));
const LEAF = windify(new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }));
const SOLID = windify(new THREE.MeshStandardMaterial({ roughness: 0.8 }));
const STAGE_SCALE: Record<number, number> = { [Stage.seedling]: 0.22, [Stage.growing]: 0.62, [Stage.mature]: 0.92, [Stage.ripe]: 1, [Stage.harvesting]: 1 };

const MAX_PLANTS = 1800;

/** Instanced crops / trees of a field (local frame). Empty group for stages without standing plants. */
export function buildPlants(f: Field, grid: HeightGrid): THREE.Group {
  const out = new THREE.Group(), c = cropById(f.crop), rnd = mulberry32(f.seed);
  out.userData.kind = 'plants';
  const perennial = isPerennial(c);
  if (!perennial && (f.stage < Stage.seedling || f.stage > Stage.harvesting)) return out;
  const stage = perennial ? Math.max(Stage.growing, f.stage) : f.stage;
  const sc = STAGE_SCALE[stage] ?? 1;
  const x0 = f.stage === Stage.harvesting ? -f.w / 2 + f.progress * f.w : -f.w / 2, x1 = f.w / 2;
  const edge = f.level ? 1.4 : 0.8;
  const area = Math.max(1, (x1 - x0 - 2 * edge) * (f.d - 2 * edge));
  const tree = c.shape === 'tree' || c.shape === 'palm' || c.shape === 'banana';
  const gap = Math.max(c.gap, tree ? c.gap : Math.sqrt(area / MAX_PLANTS));
  const leafCol = new THREE.Color(c.leaf[Math.min(3, Math.max(0, stage - Stage.seedling))]);
  const hasFruit = c.fruit !== 0 && stage >= Stage.mature;

  // plant positions: staggered rows, jittered
  const pts: [number, number, number, number][] = [];
  let row = 0;
  for (let lz = -f.d / 2 + edge; lz <= f.d / 2 - edge; lz += gap, row++) {
    for (let lx = x0 + edge + (row % 2) * gap * 0.5; lx <= x1 - edge; lx += gap) {
      const jx = lx + (rnd() - 0.5) * gap * 0.35, jz = lz + (rnd() - 0.5) * gap * 0.35, y = f.level ? 0 : grid.at(jx, jz);
      if (f.level && grid.at(jx, jz) > 0.25) continue; // buried in the hill side of the terrace
      pts.push([jx, y, jz, rnd()]);
    }
  }
  if (pts.length === 0) return out;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, n: number): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(g, m, n);
    im.castShadow = false; im.frustumCulled = true;
    out.add(im);
    return im;
  };
  const tint = (base: THREE.Color, r: number): THREE.Color => col.copy(base).offsetHSL((r - 0.5) * 0.03, 0, (r - 0.5) * 0.12);

  if (c.shape === 'tuft' || c.shape === 'stalk') {
    const im = mesh(c.shape === 'tuft' ? tuftGeo() : stalkGeo(), c.shape === 'tuft' ? LEAF_V : LEAF_V, pts.length);
    const wid = c.shape === 'tuft' ? gap * 0.95 : Math.min(gap, 1.6) * 0.9;
    const fr = hasFruit ? mesh(dotGeo(), SOLID, pts.length) : null;
    pts.forEach(([x, y, z, r], i) => {
      const h = c.h * sc * (0.85 + r * 0.3);
      dummy.position.set(x, y, z); dummy.rotation.set(0, r * 6.28, 0); dummy.scale.set(wid, h, wid); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tint(leafCol, r));
      if (fr) {
        const big = c.id === 'sorisha' ? 0.8 : 0.35;
        if (c.shape === 'tuft') { dummy.position.set(x, y + h * 0.96, z); dummy.scale.set(wid * big, h * 0.14, wid * big); }
        else { dummy.position.set(x + 0.18, y + h * 0.55, z); dummy.scale.set(0.18, 0.4, 0.18); }
        dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); fr.setMatrixAt(i, dummy.matrix); fr.setColorAt(i, col.set(c.fruit));
      }
    });
  } else if (c.shape === 'bush' || c.shape === 'vine' || c.shape === 'tea') {
    const im = mesh(blobGeo(), LEAF, pts.length);
    const wid = gap * (c.shape === 'tea' ? 0.95 : 0.85), lift = c.shape === 'vine' ? c.h * 0.45 * sc : 0;
    const n = hasFruit ? 3 : 0, fr = n ? mesh(dotGeo(), SOLID, pts.length * n) : null;
    pts.forEach(([x, y, z, r], i) => {
      const h = c.h * sc * (0.85 + r * 0.3) * (c.shape === 'vine' ? 0.5 : c.shape === 'tea' ? 0.75 : 1);
      dummy.position.set(x, y + lift, z); dummy.rotation.set(0, r * 6.28, 0); dummy.scale.set(wid, h, wid); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tint(leafCol, r));
      if (fr) for (let k = 0; k < n; k++) {
        const a = r * 6.28 + k * 2.1, fs = c.group === 'fruit' ? 0.3 : c.id === 'fulkopi' ? 0.3 : 0.14;
        dummy.position.set(x + Math.cos(a) * wid * 0.32, y + lift + h * (c.shape === 'vine' ? 0.15 : 0.55), z + Math.sin(a) * wid * 0.32);
        dummy.scale.set(fs, c.shape === 'vine' ? fs * 3 : fs, fs); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        fr.setMatrixAt(i * n + k, dummy.matrix); fr.setColorAt(i * n + k, col.set(c.fruit));
      }
    });
    if (c.trellis) { // macha: posts + a net of vines over the field
      const rows = Math.max(2, Math.floor(f.d / 9)), per = Math.floor((x1 - x0) / 6), posts = mesh(postGeo(), SOLID, rows * (per + 1));
      let n2 = 0;
      for (let rI = 0; rI < rows; rI++) for (let k = 0; k <= per; k++) {
        const px = x0 + edge + k * ((x1 - x0 - 2 * edge) / per), pz = -f.d / 2 + edge + rI * ((f.d - 2 * edge) / (rows - 1));
        dummy.position.set(px, f.level ? 0 : grid.at(px, pz), pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, c.h, 1); dummy.updateMatrix();
        posts.setMatrixAt(n2, dummy.matrix); posts.setColorAt(n2++, col.set(0x8b6a3a));
      }
      posts.count = n2;
    }
  } else if (c.shape === 'tree') {
    const sTree = perennial && f.stage === Stage.growing ? 0.7 : 1;
    const trunk = mesh(trunkGeo(), SOLID, pts.length), crown = mesh(blobGeo(), LEAF, pts.length);
    const n = hasFruit ? 8 : 0, fr = n ? mesh(dotGeo(), SOLID, pts.length * n) : null;
    pts.forEach(([x, y, z, r], i) => {
      const h = c.h * sTree * (0.8 + r * 0.4), cr = (c.crown ?? 3) * sTree * (0.85 + r * 0.3);
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.25 + h * 0.03, h * 0.5, 0.25 + h * 0.03); dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix); trunk.setColorAt(i, col.set(0x6b4a2e));
      dummy.position.set(x, y + h * 0.38, z); dummy.scale.set(cr * 2, h * 0.62, cr * 2); dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix); crown.setColorAt(i, tint(leafCol, r));
      if (fr) for (let k = 0; k < n; k++) {
        const a = r * 6.28 + k * 0.785, rr = cr * (0.7 + ((k * 37) % 10) / 40), yy = y + h * (0.55 + ((k * 53) % 10) / 40);
        dummy.position.set(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr); dummy.scale.setScalar(0.3 + c.h * 0.015); dummy.updateMatrix();
        fr.setMatrixAt(i * n + k, dummy.matrix); fr.setColorAt(i * n + k, col.set(c.fruit));
      }
    });
  } else if (c.shape === 'palm') {
    const trunk = mesh(trunkGeo(), SOLID, pts.length), crown = mesh(blobGeo(), LEAF, pts.length);
    const fr = hasFruit ? mesh(dotGeo(), SOLID, pts.length * 4) : null;
    pts.forEach(([x, y, z, r], i) => {
      const h = c.h * (0.85 + r * 0.3), tilt = (r - 0.5) * 0.12;
      dummy.position.set(x, y, z); dummy.rotation.set(tilt, 0, tilt); dummy.scale.set(0.35, h, 0.35); dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix); trunk.setColorAt(i, col.set(0x8a6a40));
      dummy.position.set(x + tilt * h, y + h, z - tilt * h); dummy.rotation.set(0, r * 6.28, 0); dummy.scale.set(c.id === 'narikel' ? 4.6 : 3, 1.1, c.id === 'narikel' ? 4.6 : 3); dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix); crown.setColorAt(i, tint(leafCol, r));
      if (fr) for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + r;
        dummy.position.set(x + tilt * h + Math.cos(a) * 0.5, y + h - 0.3, z - tilt * h + Math.sin(a) * 0.5); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.4); dummy.updateMatrix();
        fr.setMatrixAt(i * 4 + k, dummy.matrix); fr.setColorAt(i * 4 + k, col.set(c.fruit));
      }
    });
  } else { // banana
    const trunk = mesh(trunkGeo(), SOLID, pts.length), fronds = mesh(frondGeo(), LEAF, pts.length * 5);
    const fr = hasFruit ? mesh(dotGeo(), SOLID, pts.length) : null;
    dummy.rotation.order = 'YXZ';
    pts.forEach(([x, y, z, r], i) => {
      const h = c.h * (0.8 + r * 0.4);
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.5, h * 0.6, 0.5); dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix); trunk.setColorAt(i, col.set(0x8cc152));
      for (let k = 0; k < 5; k++) {
        dummy.position.set(x, y + h * 0.6, z); dummy.rotation.set(0.35 + r * 0.2, r * 6.28 + k * 1.2566, 0); dummy.scale.set(1.25, 1, h * 0.8); dummy.updateMatrix();
        fronds.setMatrixAt(i * 5 + k, dummy.matrix); fronds.setColorAt(i * 5 + k, tint(leafCol, r));
      }
      if (fr) { dummy.position.set(x + 0.35, y + h * 0.5, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.45, 0.8, 0.45); dummy.updateMatrix(); fr.setMatrixAt(i, dummy.matrix); fr.setColorAt(i, col.set(c.fruit)); }
    });
    dummy.rotation.order = 'XYZ';
  }
  for (const o of out.children) { const im = o as THREE.InstancedMesh; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); }
  return out;
}

/** Free the per-field GPU data of a ground / plants group (shared plant geometries, materials and textures stay). */
export function disposeField(g: THREE.Object3D): void {
  g.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) { im.dispose(); return; }
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose(); // ground meshes, banks, bunds and water own their geometry
  });
}
