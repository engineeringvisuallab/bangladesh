import * as THREE from 'three';
import { Kit, mulberry32, type Collider, type Structure } from '../structures/StructureKit';

export interface BookInfo {
  title: string;
  author: string;
  year: number;
  section: string;
}

export interface LibrarySection {
  name: string;
  hue: number;
  adjectives: string[];
  nouns: string[];
}

export const LIBRARY_SECTIONS: readonly LibrarySection[] = [
  { name: 'Science', hue: 205, adjectives: ['Quantum', 'Cosmic', 'Living', 'Hidden', 'Modern'], nouns: ['Physics', 'Universe', 'Chemistry', 'Cells', 'Energy', 'Atoms'] },
  { name: 'History', hue: 25, adjectives: ['Rise of', 'Fall of', 'Lost', 'Ancient', 'Secret'], nouns: ['Empires', 'Rivers', 'Kingdoms', 'Revolutions', 'Silk Roads'] },
  { name: 'Engineering', hue: 215, adjectives: ['Applied', 'Practical', 'Modern', 'Basic', 'Advanced'], nouns: ['Bridges', 'Circuits', 'Thermodynamics', 'Machines', 'Structures', 'Hydraulics'] },
  { name: 'Literature', hue: 335, adjectives: ['Songs of', 'Letters from', 'Tales of', 'Echoes of', 'Poems for'], nouns: ['Monsoon', 'Midnight', 'Home', 'The Delta', 'Autumn'] },
  { name: 'Art & Design', hue: 285, adjectives: ['Colour', 'Form', 'Light', 'Line', 'Studio'], nouns: ['Studio', 'Sketches', 'Masters', 'Pattern', 'Theory'] },
  { name: 'Children', hue: 48, adjectives: ['The Little', 'Brave', 'Magic', 'Sleepy', 'Funny'], nouns: ['Tiger', 'Boat', 'Garden', 'Robot', 'Moon'] },
  { name: 'Medicine', hue: 0, adjectives: ['Human', 'Clinical', 'Essential', 'Atlas of', 'Guide to'], nouns: ['Anatomy', 'Healing', 'Nutrition', 'Genetics', 'Surgery'] },
  { name: 'Philosophy', hue: 165, adjectives: ['Questions of', 'Meditations on', 'Logic and', 'Ethics of', 'Roots of'], nouns: ['Mind', 'Freedom', 'Truth', 'Justice', 'Being'] },
  { name: 'Bangla Sahitya', hue: 350, adjectives: ["Podma'r", 'Bhorer', 'Rater', 'Shonar', 'Amar'], nouns: ['Gaan', 'Golpo', 'Kobita', 'Diary', 'Shomoy'] },
  { name: 'Maps & Travel', hue: 125, adjectives: ['Atlas of', 'Journey to', 'Guide to', 'Rivers of', 'Roads of'], nouns: ['Sundarbans', 'Himalaya', 'Old Cities', 'Oceans', 'Deserts'] },
];

const AUTHORS = ['A. Rahman', 'S. Akter', 'M. Hossain', 'J. Carter', 'L. Moreau', 'K. Tanaka', 'R. Das', 'E. Novak', 'T. Okafor', 'N. Islam'];

interface BookRec {
  x: number;
  y: number;
  z: number;
  ry: number;
  lean: number;
  w: number;
  h: number;
  color: THREE.Color;
  section: number;
  seed: number;
}

export interface CityLibraryOptions {
  seed?: number;
  /** Local warm point lights inside the hall. Distance-limited, so they stay local. Default true. */
  interiorLights?: boolean;
  /** Candela-like intensity of each interior light (three >= r155 physical units). Default 150. */
  lightIntensity?: number;
}

/**
 * City Library: one big reading hall (40 x 32 m, 9 m high), local origin = hall centre on the floor.
 * Entrance is on the +z wall (door opening x in [-3,3]). ~11,000 books in ONE InstancedMesh.
 */
export class CityLibrary implements Structure {
  static readonly HALF_X = 20;
  static readonly HALF_Z = 16;
  static readonly HEIGHT = 9;

  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly bookMesh: THREE.InstancedMesh;
  /** Door position (local) - walk in towards -z from here. */
  readonly entrance = { x: 0, z: 16 };
  readonly sections = LIBRARY_SECTIONS;
  /** Section centres (local x/z) so a HUD can show "you are in: Science". */
  readonly zones: Array<{ x: number; z: number; name: string }> = [];

  private readonly kit = new Kit();
  private readonly books: BookRec[] = [];
  private readonly lightGroup = new THREE.Group();
  private globe: THREE.Mesh;

  constructor(opts: CityLibraryOptions = {}) {
    const rnd = mulberry32(opts.seed ?? 7);
    const k = this.kit;
    const g = this.group;
    g.name = 'CityLibrary';
    const wood = k.lambert(0x5a3a22);
    const wood2 = k.lambert(0x7a5232);
    const dark = k.lambert(0x3a2616);
    const wall = k.lambert(0xe9dcc3);

    // --- floor, rugs
    const ft = k.texture(512, 512, (c) => {
      for (let r = 0; r < 8; r++) {
        const off = (r % 2) * 128;
        for (let x = -128 + off; x < 512; x += 256) {
          c.fillStyle = `hsl(28,${35 + rnd() * 15}%,${30 + rnd() * 10}%)`;
          c.fillRect(x, r * 64, 256, 64);
          c.strokeStyle = 'rgba(0,0,0,.35)';
          c.lineWidth = 2;
          c.strokeRect(x, r * 64, 256, 64);
        }
      }
    });
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(10, 8);
    k.floor(g, 40, 32, 0, 0, 0, k.lambert(0xffffff, { map: ft }));
    k.floor(g, 12, 14, 0, 0.01, 1, k.lambert(0x7a2a2a));
    k.floor(g, 10.6, 12.6, 0, 0.015, 1, k.lambert(0x3c4a6a));

    // --- shell
    const sh = k.node(g);
    k.box(sh, 40, 9, 0.5, 0, 4.5, -16.25, wall);
    k.box(sh, 0.5, 9, 32, -20.25, 4.5, 0, wall);
    k.box(sh, 0.5, 9, 32, 20.25, 4.5, 0, wall);
    k.box(sh, 17, 9, 0.5, -11.5, 4.5, 16.25, wall);
    k.box(sh, 17, 9, 0.5, 11.5, 4.5, 16.25, wall);
    k.box(sh, 6, 4, 0.5, 0, 7, 16.25, wall);
    k.box(sh, 41, 0.4, 33, 0, 9.2, 0, k.lambert(0xf2e8d4));
    k.box(sh, 0.5, 5, 0.6, -3, 2.5, 16.25, dark);
    k.box(sh, 0.5, 5, 0.6, 3, 2.5, 16.25, dark);
    k.box(sh, 6.6, 0.4, 0.7, 0, 5, 16.25, dark);
    for (let x = -17.5; x <= 17.5; x += 5) k.box(sh, 0.4, 0.5, 32, x, 8.75, 0, dark);
    for (let z = -12; z <= 12; z += 8) k.box(sh, 40, 0.4, 0.4, 0, 8.7, z, dark);
    const glow = k.lambert(0xdff0ff, { emissive: 0xcfe8ff, emissiveIntensity: 0.9 });
    const winGeo = k.geo('win', () => new THREE.PlaneGeometry(2.6, 2.8));
    for (let z = -12; z <= 12; z += 4) {
      for (const sx of [-1, 1]) {
        k.box(sh, 0.1, 3, 2.8, sx * 19.95, 6.3, z, dark);
        const w = k.mesh(sh, winGeo, glow, sx * 19.88, 6.3, z);
        w.rotation.y = (-sx * Math.PI) / 2;
      }
    }
    for (const x of [-14, -8, 8, 14]) {
      k.box(sh, 0.1, 3, 2.8, x, 6.3, 15.95, dark);
      const w = k.mesh(sh, winGeo, glow, x, 6.3, 15.9);
      w.rotation.y = Math.PI;
    }
    k.box(sh, 6, 0.12, 14, 0, 9.0, 1, k.lambert(0xffffff, { emissive: 0xfff2d0, emissiveIntensity: 1 }));
    for (const sx of [-1, 1]) {
      for (const z of [-7.5, -2.5, 5, 12]) {
        const x = sx * 6;
        k.cyl(g, 0.35, 0.4, 9, x, 4.5, z, k.lambert(0xd9c9a8), 16);
        k.box(sh, 1, 0.3, 1, x, 0.15, z, dark);
        k.box(sh, 1, 0.3, 1, x, 8.8, z, dark);
        this.box(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
      }
    }

    // --- bookcases
    const addCase = (cx: number, cz: number, r: number, L: number, sec: number, dbl: boolean): void => {
      const cg = k.node(g, cx, 0, cz);
      cg.rotation.y = r;
      const D = 0.72;
      k.box(cg, 0.08, 3.8, D, -L / 2, 1.9, 0, wood);
      k.box(cg, 0.08, 3.8, D, L / 2, 1.9, 0, wood);
      k.box(cg, L + 0.2, 0.1, D + 0.1, 0, 3.85, 0, wood2);
      k.box(cg, L, 3.6, 0.04, 0, 1.8, 0, wood);
      for (let i = 0; i < 7; i++) k.box(cg, L, 0.05, D - 0.02, 0, 0.1 + i * 0.57, 0, wood2);
      const cr = Math.cos(r);
      const sr = Math.sin(r);
      const hue = LIBRARY_SECTIONS[sec].hue;
      for (const side of dbl ? [1, -1] : [1]) {
        for (let l = 0; l < 6; l++) {
          const y0 = 0.125 + l * 0.57;
          let x = -L / 2 + 0.07;
          while (x < L / 2 - 0.12) {
            const w = 0.05 + rnd() * 0.09;
            if (rnd() < 0.04) {
              x += w + 0.02;
              continue;
            }
            const h = 0.3 + rnd() * 0.18;
            const lean = rnd() < 0.05 ? (rnd() < 0.5 ? 0.2 : -0.2) : 0;
            const lx = x + w / 2;
            const lz = side * (0.2 - rnd() * 0.025);
            const col = new THREE.Color();
            const q = rnd();
            if (q < 0.1) col.setHSL(rnd(), 0.5, 0.4);
            else if (q < 0.16) col.setHSL(0.12, 0.45, 0.72);
            else col.setHSL((((hue + (rnd() - 0.5) * 50 + 360) % 360) / 360), 0.35 + rnd() * 0.4, 0.22 + rnd() * 0.28);
            this.books.push({
              x: cx + lx * cr + lz * sr,
              y: y0 + h / 2,
              z: cz - lx * sr + lz * cr,
              ry: r + (side < 0 ? Math.PI : 0),
              lean,
              w,
              h,
              color: col,
              section: sec,
              seed: (rnd() * 4e9) | 0,
            });
            x += w + (lean ? 0.1 : 0.004);
          }
        }
      }
      k.sign(cg, LIBRARY_SECTIONS[sec].name, new THREE.Color().setHSL(hue / 360, 0.55, 0.45).getHex(), 0, 5.4, 0, 4.2, 1.05, true);
      for (const sx of [-1.8, 1.8]) k.box(cg, 0.04, 3.7, 0.04, sx, 7.3, 0, dark);
      const rotated = Math.abs(sr) > 0.5;
      const hx = rotated ? 0.36 : L / 2;
      const hz = rotated ? L / 2 : 0.36;
      this.box(cx - hx, cx + hx, cz - hz, cz + hz);
      this.zones.push({ x: cx, z: cz, name: LIBRARY_SECTIONS[sec].name });
    };
    const rows = [-10, -5, 0];
    [0, 1, 2].forEach((s, i) => addCase(-12, rows[i], 0, 10, s, true));
    [3, 4, 5].forEach((s, i) => addCase(12, rows[i], 0, 10, s, true));
    addCase(-19.64, -7, Math.PI / 2, 14, 6, false);
    addCase(19.64, -7, -Math.PI / 2, 14, 7, false);
    addCase(-10, -15.64, 0, 16, 8, false);
    addCase(10, -15.64, 0, 16, 9, false);

    // --- all books: one InstancedMesh
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), this.books.length);
    k.own(bm.geometry);
    k.own(bm.material as THREE.Material);
    k.own(bm);
    const d = new THREE.Object3D();
    d.rotation.order = 'YXZ';
    this.books.forEach((b, i) => {
      d.position.set(b.x, b.y, b.z);
      d.rotation.set(0, b.ry, b.lean);
      d.scale.set(b.w, b.h, 0.3);
      d.updateMatrix();
      bm.setMatrixAt(i, d.matrix);
      bm.setColorAt(i, b.color);
    });
    bm.instanceMatrix.needsUpdate = true;
    g.add(bm);
    this.bookMesh = bm;

    // --- reading tables
    const tbl = k.lambert(0x6b4527);
    for (const [x, z] of [[-3, -1], [3, -1], [-3, 4.5], [3, 4.5]]) {
      const tg = k.node(g, x, 0, z);
      k.box(tg, 3.2, 0.1, 1.5, 0, 0.78, 0, tbl);
      for (const a of [-1.4, 1.4]) for (const b of [-0.6, 0.6]) k.box(tg, 0.1, 0.78, 0.1, a, 0.39, b, wood);
      for (const a of [-0.9, 0.9]) {
        for (const s of [-1, 1]) {
          k.box(tg, 0.5, 0.07, 0.5, a, 0.46, s * 1.1, wood2);
          k.box(tg, 0.5, 0.5, 0.06, a, 0.75, s * 1.33, wood2);
          k.box(tg, 0.06, 0.46, 0.06, a - 0.2, 0.23, s * 1.1, wood);
          k.box(tg, 0.06, 0.46, 0.06, a + 0.2, 0.23, s * 1.1, wood);
        }
      }
      k.cyl(tg, 0.1, 0.17, 0.16, 0, 1.0, 0, k.lambert(0x1f6b45, { emissive: 0xffd27a, emissiveIntensity: 0.35 }), 12);
      k.box(tg, 0.05, 0.16, 0.05, 0, 0.9, 0, dark);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Color().setHSL(rnd(), 0.5, 0.4);
        k.box(tg, 0.28, 0.04 + rnd() * 0.05, 0.2, -1 + i * 0.5, 0.86, 0.35 * (rnd() - 0.5), k.lambert(c.getHex())).rotation.y = rnd();
      }
      this.box(x - 1.7, x + 1.7, z - 1.5, z + 1.5);
    }

    // --- reception desk
    const rd = k.node(g, -10, 0, 11.5);
    k.box(rd, 6, 1.1, 1.2, 0, 0.55, 0, wood);
    k.box(rd, 6.3, 0.12, 1.5, 0, 1.15, 0, wood2);
    k.box(rd, 6.04, 0.9, 0.05, 0, 0.6, 0.62, k.lambert(0x8a6038));
    k.sign(rd, 'Reception', 0xc08a2a, 0, 2.2, 0, 3, 0.7, true);
    k.box(rd, 0.04, 1, 0.04, 0, 1.7, 0, dark);
    this.box(-13.2, -6.8, 10.7, 12.3);

    // --- globe + wall lettering
    const gt = k.texture(512, 256, (c, w, h) => {
      c.fillStyle = '#2b6cb0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#4f9a52';
      for (let i = 0; i < 22; i++) {
        c.beginPath();
        c.ellipse(rnd() * w, 40 + rnd() * (h - 80), 20 + rnd() * 40, 12 + rnd() * 25, rnd() * 3, 0, 7);
        c.fill();
      }
    });
    this.globe = k.mesh(g, k.geo('globe', () => new THREE.SphereGeometry(0.9, 32, 24)), k.lambert(0xffffff, { map: gt }), 0, 1.9, -13);
    k.box(sh, 0.3, 1, 0.3, 0, 0.5, -13, dark);
    k.box(sh, 1.4, 0.2, 1.4, 0, 0.1, -13, dark);
    this.box(-0.9, 0.9, -13.9, -12.1);
    const title = k.texture(1024, 205, (c) => {
      c.fillStyle = '#e0b15a';
      c.font = 'bold 130px Georgia,serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('CITY LIBRARY', 512, 102);
    });
    k.mesh(g, k.geo('title', () => new THREE.PlaneGeometry(9, 1.8)), k.custom('titleMat', () => new THREE.MeshBasicMaterial({ map: title, transparent: true })), 0, 6, -15.95);

    // --- chandeliers
    const gold = k.lambert(0xb8902f);
    const bulb = k.lambert(0xfff0c0, { emissive: 0xffd890, emissiveIntensity: 1.2 });
    for (const z of [-1, 7]) {
      const cg = k.node(g, 0, 7, z);
      k.torus(cg, 1.3, 0.06, 0, 0, 0, gold).rotation.x = Math.PI / 2;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.sphere(cg, 0.12, Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3, bulb);
      }
      k.box(cg, 0.05, 2, 0.05, 0, 1.1, 0, dark);
    }

    // --- optional local lights
    if (opts.interiorLights !== false) {
      const inten = opts.lightIntensity ?? 150;
      for (const [x, y, z] of [[-12, 6, -5], [12, 6, -5], [0, 6, 6], [0, 6, -9], [-12, 6, 8], [12, 6, 8]]) {
        const l = new THREE.PointLight(0xffe2b0, inten, 24, 2);
        l.position.set(x, y, z);
        this.lightGroup.add(l);
      }
      g.add(this.lightGroup);
    }
  }

  private box(x0: number, x1: number, z0: number, z1: number): void {
    this.colliders.push({ kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, rot: 0 });
  }

  /** Turn the six interior point lights on/off (e.g. only when the player is near/inside). */
  setInteriorLights(on: boolean): void {
    this.lightGroup.visible = on;
  }

  /** True if local (x,z) is inside the hall walls (door excluded). Use for "player entered library". */
  contains(x: number, z: number): boolean {
    return Math.abs(x) < CityLibrary.HALF_X - 0.5 && z > -CityLibrary.HALF_Z + 0.5 && z < CityLibrary.HALF_Z - 0.3;
  }

  /** Name of the nearest section within `radius` metres, or null. */
  zoneAt(x: number, z: number, radius = 6): string | null {
    let best: string | null = null;
    let bd = radius * radius;
    for (const zn of this.zones) {
      const q = (zn.x - x) ** 2 + (zn.z - z) ** 2;
      if (q < bd) {
        bd = q;
        best = zn.name;
      }
    }
    return best;
  }

  /** Which book is the ray pointing at? Call every few frames, not every frame. */
  bookAt(ray: THREE.Raycaster, maxDist = 5): BookInfo | null {
    const prev = ray.far;
    ray.far = maxDist;
    const hit = ray.intersectObject(this.bookMesh)[0];
    ray.far = prev;
    if (!hit || hit.instanceId === undefined) return null;
    const b = this.books[hit.instanceId];
    return this.describe(b.section, b.seed);
  }

  describe(section: number, seed: number): BookInfo {
    const r = mulberry32(seed);
    const s = LIBRARY_SECTIONS[section];
    return {
      title: `${s.adjectives[(r() * 5) | 0]} ${s.nouns[(r() * s.nouns.length) | 0]}`,
      author: AUTHORS[(r() * AUTHORS.length) | 0],
      year: 1950 + ((r() * 74) | 0),
      section: s.name,
    };
  }

  get bookCount(): number {
    return this.books.length;
  }

  update(t: number): void {
    this.globe.rotation.y = t * 0.3;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.kit.dispose();
  }
}
