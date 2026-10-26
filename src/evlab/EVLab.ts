import * as THREE from 'three';
import { Kit, mulberry32, rectToBox, type Collider, type Structure } from '../structures/StructureKit';
import { DISCIPLINES, palette, shell, type Rect } from './EVLabBuilders';

export interface EVLabOptions {
  seed?: number;
  /**
   * Big ground planes, lake, trees, hills, distant city skyline and the 700 m highway to the city.
   * Turn OFF when the game already has terrain/vegetation (the campus itself stays).
   * Default true (standalone preview).
   */
  surroundings?: boolean;
  /**
   * Half sizes (local metres) of the FENCED plot. Default 300 x 300 (the classic square campus).
   * A bigger plot keeps the campus in the middle and just fences more empty ground around it; the gate moves to z = +halfZ.
   */
  halfX?: number;
  /** Build the rectangular fence + colliders (default true). The game turns it off and builds its own, bigger boundary (EVLabManager). */
  fence?: boolean;
  halfZ?: number;
}

export interface EVLabBuilding {
  name: string;
  /** Centre of the main building, local space. */
  x: number;
  z: number;
  /** Yaw of the building; its front (+z local) faces the hub. */
  rot: number;
}

/**
 * EVLab - Engineering Visual Lab: a 600 x 600 m research campus inside a fenced plot (default 600 x 600, or bigger via halfX / halfZ).
 * Local origin = campus centre (Central Hub). Gate is on the +z side (z = +halfZ, default +300), and the
 * highway towards the city runs along +z. 8 discipline buildings sit on a ring of radius 130.
 * All geometry is flat at y = 0, so place it on a flattened terrain pad.
 */
export class EVLab implements Structure {
  static readonly HALF = 300;
  static readonly RING_RADIUS = 130;

  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly buildings: EVLabBuilding[] = [];
  /** Gate position (local) - the player/vehicle enters from here walking towards -z. */
  readonly gate: { x: number; z: number };
  /** Half sizes of the fenced plot (local metres). */
  readonly halfX: number;
  readonly halfZ: number;

  private readonly kit = new Kit();

  constructor(opts: EVLabOptions = {}) {
    const k = this.kit;
    const g = this.group;
    const HX = Math.max(opts.halfX ?? EVLab.HALF, 300);
    const HZ = Math.max(opts.halfZ ?? EVLab.HALF, 300);
    this.halfX = HX;
    this.halfZ = HZ;
    this.gate = { x: 0, z: HZ };
    g.name = 'EVLab';
    const rnd = mulberry32(opts.seed ?? 11);
    const p = palette(k);
    const road = k.lambert(0x3b3d40);

    // ---------- roads
    k.floor(g, 52, 24, 0, 0.03, HZ - 4, road);
    // avenue from the hub ring to the gate
    k.floor(g, 14, HZ - 100, 0, 0.03, (HZ - 16 + 84) / 2, road);
    const ring = k.mesh(g, k.geo('ring', () => new THREE.RingGeometry(76, 84, 64)), road, 0, 0.03, 0);
    ring.rotation.x = -Math.PI / 2;

    // ---------- hub
    const hub = k.node(g);
    k.cyl(hub, 24, 24, 0.4, 0, 0.2, 0, k.lambert(0xd8d2c4), 48);
    k.cyl(hub, 15, 15, 10, 0, 5, 0, k.lambert(0xf2f2f2), 40);
    k.dome(hub, 15, 0, 10, 0, k.lambert(0x9fd0f0, { emissive: 0x1d3a55, transparent: true, opacity: 0.8 }));
    k.torus(hub, 15, 0.5, 0, 10, 0, p.ST).rotation.x = Math.PI / 2;
    k.box(hub, 5, 5, 0.4, 0, 2.5, 15.1, p.DK);
    k.sign(hub, 'EVLab', 0x3a9be8, 0, 7, 15.4, 9, 2.2);
    DISCIPLINES.forEach((d, i) => {
      const a = (i + 0.5) * Math.PI / 4;
      const x = Math.sin(a) * 21;
      const z = Math.cos(a) * 21;
      k.cyl(hub, 0.15, 0.15, 13, x, 6.5, z, p.ST, 8);
      k.box(hub, 0.2, 3, 4, x, 11, z, k.lambert(d.color, { emissive: d.color, emissiveIntensity: 0.4 })).rotation.y = a + Math.PI / 2;
    });
    k.cyl(g, 6, 6, 1, 0, 0.5, 60, p.ST, 28);
    k.cyl(g, 5.5, 5.5, 0.2, 0, 1.05, 60, p.WT, 28);
    k.cyl(g, 0.25, 0.6, 6, 0, 4, 60, p.WH, 10);
    this.colliders.push({ kind: 'circle', x: 0, z: 0, r: 16.5 }, { kind: 'circle', x: 0, z: 60, r: 6.5 });

    // ---------- fence + gate
    const fe = k.lambert(0x888e94);
    const sw = HX - 12; // length of each south fence piece (gate gap |x| < 12)
    if (opts.fence !== false) {
      k.box(g, 2 * HX, 2.5, 0.4, 0, 1.25, -HZ, fe);
      k.box(g, 0.4, 2.5, 2 * HZ, -HX, 1.25, 0, fe);
      k.box(g, 0.4, 2.5, 2 * HZ, HX, 1.25, 0, fe);
      k.box(g, sw, 2.5, 0.4, -(HX + 12) / 2, 1.25, HZ, fe);
      k.box(g, sw, 2.5, 0.4, (HX + 12) / 2, 1.25, HZ, fe);
    }
    k.box(g, 2.4, 11, 2.4, -12, 5.5, HZ, p.ST);
    k.box(g, 2.4, 11, 2.4, 12, 5.5, HZ, p.ST);
    k.box(g, 27, 2, 2.4, 0, 11, HZ, p.ST);
    k.sign(g, 'EVLab Research Campus', 0x3a9be8, 0, 14, HZ, 20, 3.2);
    k.box(g, 4, 3.2, 4, 17, 1.6, HZ - 4, k.lambert(0xd9d4c8));
    if (opts.fence !== false) {
      // fence as colliders (gate gap |x| < 10 stays open)
      this.colliders.push(
        { kind: 'box', x: 0, z: -HZ, hx: HX, hz: 0.3, rot: 0 },
        { kind: 'box', x: -HX, z: 0, hx: 0.3, hz: HZ, rot: 0 },
        { kind: 'box', x: HX, z: 0, hx: 0.3, hz: HZ, rot: 0 },
        { kind: 'box', x: -(HX + 10) / 2, z: HZ, hx: (HX - 10) / 2, hz: 0.3, rot: 0 },
        { kind: 'box', x: (HX + 10) / 2, z: HZ, hx: (HX - 10) / 2, hz: 0.3, rot: 0 },
      );
    }

    // ---------- parking + helipad
    k.floor(g, 40, 22, -70, 0.04, 250, k.lambert(0x333538));
    for (let i = 0; i < 10; i++) {
      const x = -86 + (i % 5) * 8 + 4;
      const z = 244 + Math.floor(i / 5) * 12;
      const c = new THREE.Color().setHSL(rnd(), 0.6, 0.5);
      k.box(g, 2, 0.9, 4.2, x, 0.7, z, k.lambert(c.getHex()));
      k.box(g, 1.8, 0.8, 2, x, 1.5, z, k.lambert(0xbfd8ea));
    }
    k.cyl(g, 10, 10, 0.1, 70, 0.07, 250, k.lambert(0x444a50), 32);
    const hTex = k.texture(128, 128, (c) => {
      c.fillStyle = '#fff';
      c.font = 'bold 100px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('H', 64, 70);
    });
    k.floor(g, 9, 9, 70, 0.2, 250, k.custom('heliH', () => new THREE.MeshBasicMaterial({ map: hTex, transparent: true })));

    // ---------- 8 discipline buildings + spoke roads
    const R_ = EVLab.RING_RADIUS;
    DISCIPLINES.forEach((d, i) => {
      const a = (i + 0.5) * Math.PI / 4;
      const rot = a + Math.PI;
      const bx = R_ * Math.sin(a);
      const bz = R_ * Math.cos(a);
      const bg = k.node(g, bx, 0, bz);
      bg.rotation.y = rot;
      const rects: Rect[] = [];
      const add = (...r: Rect[]): void => { rects.push(...r); };
      shell(bg, d.name, d.color, k, add);
      d.build(bg, d.color, k, add);
      for (const r of rects) this.colliders.push(rectToBox(r, bx, bz, rot));
      this.buildings.push({ name: d.name, x: bx, z: bz, rot });
      const sg = k.node(g);
      sg.rotation.y = a;
      k.floor(sg, 8, 92, 0, 0.03, 72, road);
    });

    if (opts.surroundings !== false) this.addSurroundings(rnd);
  }

  private addSurroundings(rnd: () => number): void {
    const k = this.kit;
    const g = this.group;
    const p = palette(k);
    k.floor(g, 1800, 1800, 0, -0.05, 0, k.lambert(0x6f9a55));
    k.floor(g, 600, 600, 0, -0.02, 0, k.lambert(0x82b265));
    const road = k.lambert(0x3b3d40);
    k.floor(g, 14, 676, 0, 0.03, 362, road);
    k.floor(g, 0.4, 676, 0, 0.04, 362, k.lambert(0xe8d36a));
    k.cyl(g, 60, 60, 0.1, 200, 0.03, 200, p.WT, 48);

    const d = new THREE.Object3D();
    // far city skyline
    const sg = new THREE.BoxGeometry(1, 1, 1);
    const sk = k.own(new THREE.InstancedMesh(sg, k.lambert(0x8fa0b2), 90));
    k.own(sg);
    for (let i = 0; i < 90; i++) {
      const h = 20 + rnd() * rnd() * 110;
      const w = 14 + rnd() * 24;
      d.position.set((rnd() - 0.5) * 700, h / 2, 720 + rnd() * 120);
      d.scale.set(w, h, w);
      d.updateMatrix();
      sk.setMatrixAt(i, d.matrix);
    }
    g.add(sk);
    // hills
    const hg = new THREE.ConeGeometry(1, 1, 7);
    const hl = k.own(new THREE.InstancedMesh(hg, k.lambert(0xffffff), 26));
    k.own(hg);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const r = 560 + rnd() * 160;
      const h = 70 + rnd() * 90;
      const w = 110 + rnd() * 90;
      d.position.set(Math.sin(a) * r, h / 2 - 4, Math.cos(a) * r);
      d.scale.set(w, h, w);
      d.rotation.set(0, rnd() * 3, 0);
      d.updateMatrix();
      hl.setMatrixAt(i, d.matrix);
      hl.setColorAt(i, new THREE.Color().setHSL(0.28 + rnd() * 0.05, 0.3, 0.3 + rnd() * 0.12));
    }
    g.add(hl);
    // trees
    const N = 520;
    const fg = new THREE.ConeGeometry(2.8, 8, 7);
    const tg = new THREE.CylinderGeometry(0.4, 0.5, 3, 6);
    const tf = k.own(new THREE.InstancedMesh(fg, k.lambert(0xffffff), N));
    const tk = k.own(new THREE.InstancedMesh(tg, k.lambert(0x5a3a22), N));
    k.own(fg);
    k.own(tg);
    let n = 0;
    while (n < N) {
      const x = (rnd() - 0.5) * 900;
      const z = (rnd() - 0.5) * 900;
      if (Math.hypot(x, z) < 205) continue;
      if (Math.abs(x) < 16 && z > 0) continue;
      if (Math.hypot(x - 200, z - 200) < 66) continue;
      if (Math.abs(x) < 40 && z > 285) continue;
      if (Math.hypot(x + 70, z - 250) < 30) continue;
      const s = 0.8 + rnd() * 0.9;
      d.rotation.set(0, 0, 0);
      d.scale.set(s, s, s);
      d.position.set(x, 3 + 4 * s, z);
      d.updateMatrix();
      tf.setMatrixAt(n, d.matrix);
      tf.setColorAt(n, new THREE.Color().setHSL(0.3 + rnd() * 0.06, 0.45, 0.22 + rnd() * 0.12));
      d.position.set(x, 1.5 * s, z);
      d.updateMatrix();
      tk.setMatrixAt(n++, d.matrix);
    }
    g.add(tf, tk);
  }

  /** Name of the campus zone around local (x,z): a building, "Central Hub", "Main Gate" or "Campus". */
  zoneAt(x: number, z: number): string {
    if (z > this.halfZ - 30) return 'Main Gate';
    if (x * x + z * z < 1600) return 'Central Hub';
    for (const b of this.buildings) if ((x - b.x) ** 2 + (z - b.z) ** 2 < 4900) return b.name + ' Engineering';
    return 'Campus';
  }

  /** A good spot (local x/z + facing yaw for a camera looking -z up to +yaw) in front of building i. */
  viewpoint(i: number): { x: number; z: number; yaw: number } {
    const b = this.buildings[i];
    return { x: b.x + 34 * Math.sin(b.rot), z: b.z + 34 * Math.cos(b.rot), yaw: b.rot };
  }

  update(t: number): void {
    for (const f of this.kit.anim) f(t);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.kit.dispose();
  }
}
