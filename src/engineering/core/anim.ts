import * as THREE from 'three';

/**
 * ANIMATION HELPERS for engineering plants (depends only on `three`, safe in Node).
 * An Infrastructure owns ONE AnimSet; every moving thing (spinning rotor, flowing pipe dots, steam plume, blinking screen)
 * registers a small function in it. The game calls `infra.update(dt)` only while the plant is near the player.
 * Everything is cheap on purpose: InstancedMesh for dots, a few sprites for each plume, no textures from the DOM.
 */
export type AnimFn = (t: number, dt: number) => void;

export class AnimSet {
  private readonly fns: AnimFn[] = [];
  private clock = 0;
  /** geometries / materials / textures created by the helpers (disposed with the plant) */
  readonly disposables: { dispose(): void }[] = [];

  add(fn: AnimFn): void {
    this.fns.push(fn);
  }
  get time(): number {
    return this.clock;
  }
  update(dt: number): void {
    const d = Math.min(Math.max(dt, 0), 0.1);
    this.clock += d;
    for (const f of this.fns) f(this.clock, d);
  }
  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.fns.length = 0;
  }
}

/** Turn `obj` around its local axis (radians per second). */
export function spin(a: AnimSet, obj: THREE.Object3D, axis: 'x' | 'y' | 'z', radPerSec: number): void {
  a.add((_t, dt) => {
    obj.rotation[axis] += radPerSec * dt;
  });
}

/** Glow / blink: calls `fn(t)` every frame (change emissive, colour, scale ...). */
export function every(a: AnimSet, fn: (t: number) => void): void {
  a.add((t) => fn(t));
}

export interface FlowOpts {
  color: number;
  /** metres per second along the path */
  speed: number;
  /** distance between two dots (m) */
  spacing: number;
  /** dot radius (m) */
  size: number;
}

/**
 * Dots that travel along a polyline: shows WHAT flows in a pipe and in which direction (path order = flow direction).
 * One InstancedMesh per call. Returns the mesh (name 'fx', so it never casts shadows or becomes a collider).
 */
export function flow(a: AnimSet, parent: THREE.Object3D, pts: THREE.Vector3[], o: FlowOpts): THREE.InstancedMesh {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.floor(total / o.spacing));
  const geo = new THREE.SphereGeometry(o.size, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: o.color });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'fx';
  mesh.frustumCulled = false;
  parent.add(mesh);
  a.disposables.push(geo, mat);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const place = (): void => {
    for (let i = 0; i < n; i++) {
      let s = (i * o.spacing + a.time * o.speed) % total;
      if (s < 0) s += total;
      let k = 1;
      while (k < cum.length - 1 && cum[k] < s) k++;
      const seg = cum[k] - cum[k - 1];
      p.copy(pts[k - 1]).lerp(pts[k], seg > 1e-6 ? (s - cum[k - 1]) / seg : 0);
      mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place();
  a.add(place);
  return mesh;
}

/** Radial soft-dot texture made in memory (no canvas, works in Node too). */
export function softDotTexture(a: AnimSet): THREE.DataTexture {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2;
      const v = Math.max(0, 1 - d);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * v * v * (3 - 2 * v));
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  a.disposables.push(tex);
  return tex;
}

export interface PlumeOpts {
  count: number;
  /** total rise (m) of a puff before it fades away */
  rise: number;
  /** seconds a puff lives */
  life: number;
  /** puff size (m) at birth and at death */
  size0: number;
  size1: number;
  /** sideways drift (m) at the end of the life: wind */
  windX: number;
  windZ: number;
  /** random sideways spread (m) at the end of the life */
  spread: number;
  opacity: number;
  color: number;
}

/** A rising, widening, fading cloud (steam / smoke): a few sprites, moved on the CPU. Origin = (x, y, z) in `parent`. */
export function plume(a: AnimSet, parent: THREE.Object3D, x: number, y: number, z: number, o: PlumeOpts): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fx';
  g.position.set(x, y, z);
  parent.add(g);
  const tex = softDotTexture(a);
  const items: { s: THREE.Sprite; seed: number; rx: number; rz: number }[] = [];
  for (let i = 0; i < o.count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: o.color, transparent: true, depthWrite: false, opacity: 0 });
    a.disposables.push(mat);
    const s = new THREE.Sprite(mat);
    s.name = 'fx';
    g.add(s);
    // deterministic pseudo-random numbers (no Math.random: same look every run)
    const r1 = Math.sin(i * 12.9898) * 43758.5453;
    const r2 = Math.sin(i * 78.233) * 12345.6789;
    items.push({ s, seed: i / o.count, rx: (r1 - Math.floor(r1)) - 0.5, rz: (r2 - Math.floor(r2)) - 0.5 });
  }
  a.add((t) => {
    for (const it of items) {
      const age = (t / o.life + it.seed) % 1;
      const k = age * age * 0.6 + age * 0.4; // slow at first, then drifts away
      it.s.position.set(o.windX * k + o.spread * it.rx * age, o.rise * age, o.windZ * k + o.spread * it.rz * age);
      const size = o.size0 + (o.size1 - o.size0) * age;
      it.s.scale.set(size, size, 1);
      const fadeIn = Math.min(1, age / 0.12);
      (it.s.material as THREE.SpriteMaterial).opacity = o.opacity * fadeIn * (1 - age) * (1 - age * 0.3);
    }
  });
  return g;
}

/** Drops falling inside a circle (cooling tower rain, sprinklers). */
export function rain(a: AnimSet, parent: THREE.Object3D, cx: number, cz: number, radius: number, yTop: number, yBottom: number, count: number, color: number, speed = 7): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(0.13, 5, 4);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'fx';
  mesh.frustumCulled = false;
  parent.add(mesh);
  a.disposables.push(geo, mat);
  const px: number[] = [];
  const pz: number[] = [];
  const ph: number[] = [];
  for (let i = 0; i < count; i++) {
    const rr = radius * Math.sqrt(((Math.sin(i * 91.7) * 4375.5) % 1 + 1) % 1);
    const aa = i * 2.399963; // golden angle
    px.push(cx + Math.cos(aa) * rr);
    pz.push(cz + Math.sin(aa) * rr);
    ph.push(((Math.sin(i * 37.1) * 9871.3) % 1 + 1) % 1);
  }
  const m = new THREE.Matrix4();
  const H = yTop - yBottom;
  a.add((t) => {
    for (let i = 0; i < count; i++) {
      const f = (ph[i] + (t * speed) / H) % 1;
      mesh.setMatrixAt(i, m.makeTranslation(px[i], yTop - f * H, pz[i]));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}
