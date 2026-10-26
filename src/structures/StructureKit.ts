import * as THREE from 'three';

/** 2D walk-collision shapes in the structure's LOCAL space (x/z, y is up). */
export type Collider =
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; rot: number }
  | { kind: 'circle'; x: number; z: number; r: number };

/** Common shape of CityLibrary and EVLab so the game can treat them the same way. */
export interface Structure {
  readonly group: THREE.Group;
  readonly colliders: readonly Collider[];
  /** t = elapsed seconds. Drives the small animations (cranes, gears, turbines ...). */
  update(t: number): void;
  dispose(): void;
}

/** True when local-space point (x,z) is inside any collider (grown by `margin` = player radius). */
export function hitsCollider(cs: readonly Collider[], x: number, z: number, margin = 0.4): boolean {
  for (const c of cs) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (c.kind === 'circle') {
      const r = c.r + margin;
      if (dx * dx + dz * dz < r * r) return true;
    } else {
      const co = Math.cos(c.rot);
      const sn = Math.sin(c.rot);
      const u = dx * co - dz * sn;
      const v = dx * sn + dz * co;
      if (Math.abs(u) < c.hx + margin && Math.abs(v) < c.hz + margin) return true;
    }
  }
  return false;
}

/** Local rect [x0,x1,z0,z1] placed with yaw `rot` at (px,pz) -> parent-space box collider. */
export function rectToBox(r: readonly [number, number, number, number], px: number, pz: number, rot: number): Collider {
  const cx = (r[0] + r[1]) / 2;
  const cz = (r[2] + r[3]) / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    kind: 'box',
    x: px + cx * c + cz * s,
    z: pz - cx * s + cz * c,
    hx: (r[1] - r[0]) / 2,
    hz: (r[3] - r[2]) / 2,
    rot,
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Disposable = { dispose(): void };

/**
 * Caches geometries/materials, owns everything it creates and disposes it all in
 * one call. Used by both CityLibrary and EVLab.
 */
export class Kit {
  readonly anim: Array<(t: number) => void> = [];
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private owned: Disposable[] = [];
  private signs = new Map<string, THREE.CanvasTexture>();

  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  lambert(color: number, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
    const key = 'l' + color + JSON.stringify(opts);
    let m = this.mats.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, ...opts });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Cached material of any type (e.g. MeshBasicMaterial) under a unique key. */
  custom<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.mats.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key) as T | undefined;
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  texture(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d') as CanvasRenderingContext2D, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return this.own(t);
  }

  private put<T extends THREE.Object3D>(p: THREE.Object3D, o: T, x: number, y: number, z: number): T {
    o.position.set(x, y, z);
    p.add(o);
    return o;
  }

  node(p: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    return this.put(p, new THREE.Group(), x, y, z);
  }

  mesh(p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    return this.put(p, new THREE.Mesh(g, m), x, y, z);
  }

  box(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
    return this.mesh(p, this.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
  }

  cyl(p: THREE.Object3D, rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 20): THREE.Mesh {
    return this.mesh(p, this.geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
  }

  sphere(p: THREE.Object3D, r: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
    return this.mesh(p, this.geo(`s${r}`, () => new THREE.SphereGeometry(r, 18, 12)), m, x, y, z);
  }

  dome(p: THREE.Object3D, r: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
    return this.mesh(p, this.geo(`d${r}`, () => new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), m, x, y, z);
  }

  torus(p: THREE.Object3D, R: number, r: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
    return this.mesh(p, this.geo(`t${R},${r}`, () => new THREE.TorusGeometry(R, r, 8, 36)), m, x, y, z);
  }

  /** Flat horizontal plane facing up. */
  floor(p: THREE.Object3D, w: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
    const o = this.mesh(p, this.geo(`p${w},${d}`, () => new THREE.PlaneGeometry(w, d)), m, x, y, z);
    o.rotation.x = -Math.PI / 2;
    return o;
  }

  /** Standing board with text on both faces (faces +z and -z). */
  sign(p: THREE.Object3D, text: string, color: number, x: number, y: number, z: number, w: number, h: number, serif = false): void {
    const key = text + color + serif;
    let tex = this.signs.get(key);
    if (!tex) {
      tex = this.texture(512, Math.round((512 * h) / w), (c, W, H) => {
        c.fillStyle = serif ? '#2a1c12' : '#14202b';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#' + color.toString(16).padStart(6, '0');
        c.fillRect(0, 0, W, 10);
        c.fillRect(0, H - 10, W, 10);
        c.fillStyle = serif ? '#f5e6c8' : '#ffffff';
        c.font = `bold ${Math.round(H * 0.42)}px ${serif ? 'Georgia,serif' : 'Arial,sans-serif'}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, W / 2, H / 2);
      });
      this.signs.set(key, tex);
    }
    const map = tex;
    const m = this.custom('sign' + key, () => new THREE.MeshBasicMaterial({ map }));
    const g = this.geo(`q${w},${h}`, () => new THREE.PlaneGeometry(w, h));
    for (const back of [false, true]) {
      const q = this.mesh(p, g, m, x, y, z + (back ? -0.21 : 0.21));
      if (back) q.rotation.y = Math.PI;
    }
    this.box(p, w, h, 0.4, x, y, z, this.lambert(serif ? 0x2a1c12 : 0x14202b));
  }

  dispose(): void {
    this.anim.length = 0;
    for (const o of this.owned) o.dispose();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.owned = [];
    this.geos.clear();
    this.mats.clear();
    this.signs.clear();
  }
}
