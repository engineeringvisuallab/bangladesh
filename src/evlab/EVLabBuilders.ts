import * as THREE from 'three';
import type { Kit } from '../structures/StructureKit';

/** Local footprint rect [minX, maxX, minZ, maxZ] of one building (front = +z). */
export type Rect = [number, number, number, number];

const PI = Math.PI;

interface Palette {
  WH: THREE.MeshLambertMaterial;
  GL: THREE.MeshLambertMaterial;
  TG: THREE.MeshLambertMaterial;
  DK: THREE.MeshLambertMaterial;
  ST: THREE.MeshLambertMaterial;
  WT: THREE.MeshLambertMaterial;
  HOT: THREE.MeshLambertMaterial;
  wire: THREE.MeshBasicMaterial;
}

export function palette(k: Kit): Palette {
  return {
    WH: k.lambert(0xffffff),
    GL: k.lambert(0x8fc4e8, { emissive: 0x1d3a55 }),
    TG: k.lambert(0xbfe6ff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    DK: k.lambert(0x3a4048),
    ST: k.lambert(0x9aa0a6),
    WT: k.lambert(0x3b8fd6, { emissive: 0x0d3050 }),
    HOT: k.lambert(0xff7a1a, { emissive: 0xff5500 }),
    wire: k.custom('wire', () => new THREE.MeshBasicMaterial({ color: 0x5a6068, wireframe: true })),
  };
}

export type Builder = (g: THREE.Group, color: number, k: Kit, R: (...r: Rect[]) => void) => void;

/** Main building + Lab annex + forecourt, shared by all 8 disciplines. */
export function shell(g: THREE.Group, name: string, col: number, k: Kit, R: (...r: Rect[]) => void): void {
  const p = palette(k);
  const w = k.lambert(0xe8e4dc);
  const ac = k.lambert(col);
  k.box(g, 36, 10, 24, 0, 5, 0, w);
  k.box(g, 37, 1, 25, 0, 10.5, 0, ac);
  k.box(g, 34, 1.6, 0.2, 0, 3, 12.05, p.GL);
  k.box(g, 34, 1.6, 0.2, 0, 7, 12.05, p.GL);
  k.box(g, 4, 3.6, 0.3, 0, 1.8, 12.1, p.DK);
  k.sign(g, name, col, 0, 12.8, 10.5, 15, 2.6);
  k.cyl(g, 0.25, 0.25, 16, -16, 19, -8, p.ST, 8);
  k.sphere(g, 1.2, -16, 28, -8, k.lambert(col, { emissive: col }));
  k.box(g, 14, 7, 16, 27, 3.5, -2, w);
  k.box(g, 14.5, 0.6, 16.5, 27, 7.3, -2, ac);
  k.box(g, 12, 1.4, 0.2, 27, 3.5, 6.05, p.GL);
  k.box(g, 3, 3, 0.3, 27, 1.5, 6.1, p.DK);
  k.sign(g, name + ' Lab', col, 27, 9.2, 5.5, 9, 1.6);
  k.floor(g, 40, 20, 0, 0.05, 22, k.lambert(0x9a9a9a));
  R([-18.5, 18.5, -12.5, 12.5], [19.5, 34.5, -10.5, 6.5]);
}

export const civil: Builder = (g, _c, k, R) => {
  const p = palette(k);
  const yl = k.lambert(0xf0b020);
  const bl = k.lambert(0x3b7fcf, { emissive: 0x0b2a52 });
  // tower crane
  k.box(g, 1.6, 34, 1.6, -26, 17, -30, yl);
  k.box(g, 3, 2.4, 3, -26, 1.2, -30, p.ST);
  const cr = k.node(g, -26, 34, -30);
  k.box(cr, 34, 1, 1.2, 8, 0, 0, yl);
  k.box(cr, 10, 1, 1.2, -9, 0, 0, yl);
  k.box(cr, 3, 3, 3, -13, -2, 0, p.ST);
  k.box(cr, 0.15, 12, 0.15, 16, -6, 0, p.ST);
  k.box(cr, 1.2, 1, 1.2, 16, -12, 0, p.DK);
  k.anim.push((t) => { cr.rotation.y = Math.sin(t * 0.25) * 0.9; });
  R([-27, -25, -31, -29]);
  // truss bridge over a water channel
  k.box(g, 64, 0.15, 12, 0, 0.07, -48, bl);
  k.box(g, 46, 0.8, 5, 0, 3.6, -48, p.ST);
  for (const x of [-21, 21]) {
    k.box(g, 3, 3.6, 7, x, 1.8, -48, p.ST);
    R([x - 1.6, x + 1.6, -51.6, -44.4]);
  }
  for (const z of [-50.5, -45.5]) {
    k.box(g, 46, 0.4, 0.4, 0, 8.4, z, yl);
    k.box(g, 46, 0.4, 0.4, 0, 4, z, yl);
    for (let i = 0; i <= 11; i++) {
      const x = -22 + i * 4;
      k.box(g, 0.3, 4.4, 0.3, x, 6.2, z, yl);
      if (i < 11) k.box(g, 5.9, 0.25, 0.25, x + 2, 6.2, z, yl).rotation.z = i % 2 ? 0.83 : -0.83;
    }
  }
  // shake-table test structure
  const sh = k.node(g, 28, 0, -26);
  k.box(sh, 10, 1, 10, 0, 0.5, 0, p.ST);
  const fr = k.node(sh, 0, 1, 0);
  for (let f = 0; f < 3; f++) {
    k.box(fr, 8, 0.4, 8, 0, 3 + f * 3.4, 0, k.lambert(0xbdbdbd));
    for (const x of [-3.6, 3.6]) for (const z of [-3.6, 3.6]) k.box(fr, 0.5, 3, 0.5, x, 1.5 + f * 3.4, z, k.lambert(0xa8a8a8));
  }
  k.anim.push((t) => { fr.position.x = Math.sin(t * 18) * 0.18; });
  R([22.5, 33.5, -31.5, -20.5]);
  for (let i = 0; i < 5; i++) k.box(g, 3, 3, 3, -8 + i * 4.2, 1.5 + (i % 2) * 3, -20, k.lambert(0xb9b4aa));
};

export const mech: Builder = (g, c, k, R) => {
  const p = palette(k);
  const m = k.lambert(0xb8bcc2);
  const rd = k.lambert(c);
  k.box(g, 46, 10, 30, 0, 5, -42, m);
  for (let i = 0; i < 5; i++) {
    const x = -18 + i * 9;
    k.box(g, 9.6, 0.4, 30, x, 11.2, -42, p.DK).rotation.z = -0.35;
    k.box(g, 0.3, 3.2, 30, x + 4.3, 10.8, -42, p.GL);
  }
  for (const x of [-20, -14]) {
    k.cyl(g, 1.3, 1.7, 26, x, 13, -60, k.lambert(0x8a4a3a));
    k.cyl(g, 1.9, 1.9, 0.8, x, 25, -60, rd);
  }
  R([-23.5, 23.5, -57.5, -26.5], [-22, -12, -62, -58]);
  const gear = (par: THREE.Object3D, r: number, n: number, x: number, y: number): THREE.Group => {
    const q = k.node(par, x, y, 0);
    k.cyl(q, r, r, 1.4, 0, 0, 0, rd, 24).rotation.x = PI / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      k.box(q, 1.6, 1.6, 1.4, Math.cos(a) * (r + 0.5), Math.sin(a) * (r + 0.5), 0, rd).rotation.z = a;
    }
    return q;
  };
  const gp = k.node(g, 0, 0, -18);
  const g1 = gear(gp, 5, 12, 22, 9);
  const g2 = gear(gp, 3.4, 8, 31.4, 9);
  k.box(gp, 0.8, 9, 0.8, 22, 4.5, 0, p.DK);
  k.box(gp, 0.8, 9, 0.8, 31.4, 4.5, 0, p.DK);
  k.anim.push((t) => { g1.rotation.z = t * 0.5; g2.rotation.z = -t * 0.735; });
  R([20, 33, -19.5, -16.5]);
  // robot arm
  const ab = k.node(g, -30, 0, -18);
  k.cyl(ab, 2.4, 2.8, 1.4, 0, 0.7, 0, p.DK);
  const j1 = k.node(ab, 0, 1.4, 0);
  k.box(j1, 1.2, 8, 1.2, 0, 4, 0, rd);
  const j2 = k.node(j1, 0, 8, 0);
  k.box(j2, 1, 7, 1, 0, 3.5, 0, rd);
  k.sphere(j2, 0.9, 0, 0, 0, p.DK);
  const j3 = k.node(j2, 0, 7, 0);
  k.box(j3, 2.2, 0.5, 0.5, 0, 0, 0, p.DK);
  k.anim.push((t) => {
    j1.rotation.y = t * 0.6;
    j2.rotation.z = Math.sin(t * 0.9) * 0.9;
    j3.rotation.z = Math.sin(t * 1.7) * 0.6;
  });
  R([-33, -27, -21, -15]);
  // conveyor
  k.box(g, 32, 1, 3, 0, 0.5, -20, p.DK);
  const cb: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) cb.push(k.box(g, 1.8, 1.6, 1.8, 0, 1.8, -20, k.lambert(0xc89a5a)));
  k.anim.push((t) => cb.forEach((b, i) => { b.position.x = ((t * 3 + i * 5) % 30) - 15; }));
  R([-16, 16, -21.5, -18.5]);
};

export const elec: Builder = (g, _c, k, R) => {
  const p = palette(k);
  k.box(g, 36, 0.1, 24, 0, 0.07, -42, k.lambert(0xb0a890));
  for (let i = 0; i < 4; i++) {
    const x = -13.5 + i * 9;
    k.box(g, 5, 4, 3.4, x, 2, -42, p.ST);
    for (let q = -1; q <= 1; q++) k.cyl(g, 0.3, 0.3, 2.4, x + q * 1.4, 5.2, -42, k.lambert(0xdd8844), 8);
  }
  R([-18, 18, -54, -30]);
  const pg = k.geo('pylon', () => new THREE.CylinderGeometry(0.5, 2.4, 26, 4, 7, true));
  const px = [-36, 0, 36];
  for (const x of px) {
    const t = k.mesh(g, pg, p.wire, x, 13, -64);
    t.rotation.y = PI / 4;
    k.box(g, 11, 0.4, 0.4, x, 25, -64, p.ST);
    k.box(g, 9, 0.4, 0.4, x, 21, -64, p.ST);
    R([x - 2.5, x + 2.5, -66.5, -61.5]);
  }
  const lineMat = k.custom('line', () => new THREE.LineBasicMaterial({ color: 0x222222 }));
  for (let s = 0; s < 2; s++) {
    for (const [dx, y] of [[-5, 25], [5, 25], [-4, 21], [4, 21]]) {
      const a = new THREE.Vector3(px[s] + dx, y, -64);
      const b = new THREE.Vector3(px[s + 1] + dx, y, -64);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 3;
      const geo = k.own(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(20)));
      g.add(new THREE.Line(geo, lineMat));
    }
  }
  // solar field
  const sg = new THREE.BoxGeometry(3, 0.1, 2);
  const sm = k.own(new THREE.InstancedMesh(sg, k.lambert(0x1c3d7a, { emissive: 0x0a1a3a }), 48));
  k.own(sg);
  const d = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    d.position.set(22 + (i % 6) * 4, 1.6, -24 - Math.floor(i / 6) * 4.2);
    d.rotation.set(-0.6, 0, 0);
    d.updateMatrix();
    sm.setMatrixAt(i, d.matrix);
  }
  g.add(sm);
  R([20, 46, -62, -20]);
  // Tesla coil
  k.cyl(g, 0.8, 1.6, 6, -30, 3, -18, p.ST);
  k.cyl(g, 0.5, 0.5, 10, -30, 11, -18, p.ST);
  const tc = k.sphere(g, 1.6, -30, 17, -18, k.lambert(0xaaccff, { emissive: 0x6699ff }));
  k.torus(g, 2.2, 0.25, -30, 15.5, -18, p.ST).rotation.x = PI / 2;
  k.anim.push((t) => tc.scale.setScalar(1 + 0.12 * Math.sin(t * 14)));
  R([-32, -28, -20, -16]);
};

export const chem: Builder = (g, _c, k, R) => {
  const p = palette(k);
  const sv = k.lambert(0xcfd4da);
  const pp = k.lambert(0xc9a227);
  for (let i = 0; i < 4; i++) {
    const x = -27 + i * 18;
    k.cyl(g, 5, 5, 12, x, 6, -34, sv, 28);
    k.cyl(g, 5.2, 5.2, 0.5, x, 12.2, -34, p.DK, 28);
    R([x - 5.2, x + 5.2, -39.2, -28.8]);
    k.cyl(g, 0.4, 0.4, 9, x, 3, -43.5, pp, 8).rotation.x = PI / 2;
  }
  k.cyl(g, 0.6, 0.6, 72, 0, 3, -48, pp, 8).rotation.z = PI / 2;
  for (let i = 0; i < 3; i++) {
    const x = -22 + i * 22;
    const z = -62;
    k.cyl(g, 2, 2, 34, x, 17, z, sv);
    for (let y = 4; y < 34; y += 5) k.cyl(g, 2.3, 2.3, 0.4, x, y, z, p.DK);
    k.box(g, 0.3, 34, 0.3, x + 2.3, 17, z, p.DK);
    R([x - 2.4, x + 2.4, z - 2.4, z + 2.4]);
  }
  k.cyl(g, 0.5, 0.5, 44, 0, 30, -62, pp, 8).rotation.z = PI / 2;
  for (const x of [-12, 12]) {
    k.sphere(g, 6, x, 10, -84, sv);
    for (const a of [-3.4, 3.4]) for (const b of [-3.4, 3.4]) k.cyl(g, 0.4, 0.4, 10, x + a, 5, -84 + b, p.DK, 8);
    R([x - 6.5, x + 6.5, -90.5, -77.5]);
  }
  k.cyl(g, 0.5, 0.8, 36, 36, 18, -40, p.DK);
  const fl = k.cyl(g, 0, 1.3, 5, 36, 38.5, -40, p.HOT);
  k.anim.push((t) => {
    fl.scale.y = 1 + 0.35 * Math.sin(t * 20) + 0.2 * Math.sin(t * 31);
    fl.scale.x = 1 + 0.15 * Math.sin(t * 27);
  });
  R([34.5, 37.5, -41.5, -38.5]);
};

export const aero: Builder = (g, c, k, R) => {
  const p = palette(k);
  const cm = k.lambert(c);
  const hg = k.node(g, -8, 0, -42);
  hg.rotation.y = PI / 2;
  const hat = k.geo('hangar', () => new THREE.CylinderGeometry(15, 15, 40, 28, 1, true, 0, PI));
  k.mesh(hg, hat, k.lambert(0xcfd5dc, { side: THREE.DoubleSide }), 0, 0, 0).rotation.z = PI / 2;
  k.mesh(g, k.geo('hangarBack', () => new THREE.CircleGeometry(15, 28, 0, PI)), k.lambert(0xb8c0c8, { side: THREE.DoubleSide }), -8, 0, -62);
  R([-23.5, 7.5, -62, -22]);
  const jet = (par: THREE.Object3D, x: number, y: number, z: number, s: number): void => {
    const q = k.node(par, x, y, z);
    q.scale.setScalar(s);
    k.cyl(q, 1.1, 1.1, 12, 0, 0, 0, p.WH, 12).rotation.x = PI / 2;
    k.cyl(q, 0, 1.1, 3, 0, 0, 7.5, p.WH, 12).rotation.x = PI / 2;
    k.box(q, 16, 0.25, 3.2, 0, -0.2, 0.5, cm);
    k.box(q, 5, 0.2, 1.6, 0, 0.3, -5.5, cm);
    k.box(q, 0.2, 2.4, 2, 0, 1.4, -5.5, cm);
  };
  jet(g, -8, 1.8, -42, 1);
  jet(g, 22, 1.8, -36, 1.2);
  k.box(g, 14, 0.1, 100, 40, 0.08, -90, k.lambert(0x2b2b2b));
  for (let i = 0; i < 9; i++) k.box(g, 0.8, 0.12, 6, 40, 0.12, -48 - i * 10, p.WH);
  k.cyl(g, 3, 3, 34, -33, 5, -30, k.lambert(0xd7dbe0), 24).rotation.x = PI / 2;
  k.torus(g, 3.4, 0.5, -33, 5, -12.8, p.ST);
  k.box(g, 0.8, 5, 0.8, -33, 2.5, -38, p.ST);
  k.box(g, 0.8, 5, 0.8, -33, 2.5, -22, p.ST);
  R([-36.5, -29.5, -47.5, -12.5]);
  k.cyl(g, 1.4, 1.8, 18, 24, 9, -14, k.lambert(0xe4e4e4));
  k.cyl(g, 3.6, 3, 3.2, 24, 19.5, -14, p.GL);
  k.cyl(g, 3.8, 3.8, 0.4, 24, 21.3, -14, p.DK);
  R([22, 26, -16, -12]);
  for (const a of [-3, 3]) for (const b of [-3, 3]) k.box(g, 0.6, 20, 0.6, 6 + a, 10, -72 + b, p.ST);
  k.box(g, 7, 0.6, 7, 6, 20, -72, p.ST);
  k.cyl(g, 1.5, 1.5, 14, 6, 12, -72, p.WH);
  k.cyl(g, 0, 1.5, 4, 6, 21, -72, cm);
  for (let q = 0; q < 3; q++) k.box(g, 0.2, 3, 1.8, 6 + Math.cos(q * 2.09) * 1.7, 6, -72 + Math.sin(q * 2.09) * 1.7, cm).rotation.y = -q * 2.09;
  R([2.5, 9.5, -75.5, -68.5]);
};

export const envi: Builder = (g, _c, k, R) => {
  const p = palette(k);
  const cc = k.lambert(0xd5d9d6);
  const arms: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -24 + i * 16;
    const z = -36;
    k.cyl(g, 7, 7, 2.2, x, 1.1, z, cc, 32);
    k.cyl(g, 6.4, 6.4, 0.2, x, 2.2, z, p.WT, 32);
    const a = k.node(g, x, 2.6, z);
    k.box(a, 13, 0.3, 0.6, 0, 0, 0, p.ST);
    arms.push(a);
    R([x - 7.2, x + 7.2, z - 7.2, z + 7.2]);
  }
  k.anim.push((t) => arms.forEach((a, i) => { a.rotation.y = t * 0.5 + i; }));
  const rot: THREE.Group[] = [];
  for (const [x, z] of [[26, -30], [36, -50], [26, -70]]) {
    k.cyl(g, 0.5, 0.9, 30, x, 15, z, p.WH);
    k.box(g, 1.6, 1.6, 3.2, x, 30.5, z + 1, p.WH);
    const r = k.node(g, x, 30.5, z + 2.8);
    for (let q = 0; q < 3; q++) {
      const b = k.node(r);
      b.rotation.z = q * 2.094;
      k.box(b, 0.7, 12, 0.25, 0, 6, 0, p.WH);
    }
    rot.push(r);
    R([x - 1, x + 1, z - 1, z + 1]);
  }
  k.anim.push((t) => rot.forEach((r, i) => { r.rotation.z = t * 1.2 + i; }));
  k.box(g, 24, 6, 12, -22, 3, -72, p.TG);
  for (const s of [-1, 1]) k.box(g, 13.6, 0.3, 12.2, -22 + s * 6, 7.4, -72, p.TG).rotation.z = -s * 0.45;
  for (let i = 0; i < 7; i++) for (const z of [-78, -66]) k.box(g, 0.2, 6, 0.2, -33 + i * 4, 3, z, p.ST);
  for (let i = 0; i < 5; i++) k.box(g, 2, 1, 10, -30 + i * 3.5, 0.5, -72, k.lambert(0x3a8a3a));
  R([-34.5, -9.5, -78.5, -65.5]);
  k.cyl(g, 7, 7, 1.4, 2, 0.7, -76, cc, 28);
  k.dome(g, 7, 2, 1.4, -76, k.lambert(0xcdd6c4));
  R([-5.5, 9.5, -83.5, -68.5]);
};

export const cs: Builder = (g, c, k, R) => {
  const p = palette(k);
  const cn = k.lambert(c, { emissive: c, emissiveIntensity: 0.8 });
  for (let f = 0; f < 3; f++) {
    k.box(g, 22, 0.4, 22, 0, 5.6 + f * 6.2, -38, k.lambert(0xdddddd));
    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 4;
      k.box(g, 2.2, 4.4, 14, x, 2.6 + f * 6.2, -38, p.DK);
      k.box(g, 1.6, 0.3, 0.1, x, 3.6 + f * 6.2, -30.95, cn);
    }
  }
  k.box(g, 22, 19, 22, 0, 10, -38, p.TG);
  R([-11.5, 11.5, -49.5, -26.5]);
  const dishGeo = k.geo('dish', () => new THREE.SphereGeometry(5, 20, 8, 0, PI * 2, 0, 0.7));
  const dishMat = k.lambert(0xe6e9ec, { side: THREE.DoubleSide });
  const dish = (x: number, z: number): void => {
    const q = k.node(g, x, 0, z);
    k.cyl(q, 0.4, 0.5, 8, 0, 4, 0, p.ST, 8);
    const u = k.node(q, 0, 8, 0);
    const t = k.node(u);
    t.rotation.x = -0.9;
    k.mesh(t, dishGeo, dishMat, 0, 0, 0).rotation.x = PI;
    k.anim.push((tt) => { u.rotation.y = tt * 0.3; });
    R([x - 0.8, x + 0.8, z - 0.8, z + 0.8]);
  };
  dish(26, -44);
  dish(32, -58);
  k.mesh(g, k.geo('antenna', () => new THREE.CylinderGeometry(0.3, 1.6, 44, 4, 8, true)), p.wire, -26, 22, -30).rotation.y = PI / 4;
  const lm = k.custom('antLight', () => new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  k.sphere(g, 0.6, -26, 44.5, -30, lm);
  k.anim.push((t) => lm.color.setHex(Math.sin(t * 5) > 0 ? 0xff2222 : 0x330000));
  R([-27.6, -24.4, -31.6, -28.4]);
  [-8, 8].forEach((x, i) => {
    const q = k.node(g, x, 0, -20);
    q.scale.setScalar(2);
    const rb = k.lambert(0xe8ecef);
    k.box(q, 2, 3, 1.2, 0, 3.5, 0, rb);
    k.box(q, 1.3, 1.3, 1.3, 0, 5.8, 0, rb);
    k.box(q, 0.9, 0.2, 0.1, 0, 5.9, 0.7, cn);
    for (const s of [-0.5, 0.5]) k.box(q, 0.8, 3, 0.8, s, 1.5, 0, p.DK);
    k.box(q, 0.6, 2.6, 0.6, -1.5, 3.6, 0, p.DK);
    const ar = k.node(q, 1.5, 4.9, 0);
    k.box(ar, 0.6, 2.6, 0.6, 0, -1.2, 0, p.DK);
    k.anim.push((t) => { ar.rotation.z = i ? Math.sin(t * 3) * 1.2 + 2.2 : 2.6 + Math.sin(t * 2) * 0.4; });
    R([x - 2, x + 2, -22, -18]);
  });
  k.cyl(g, 4, 4, 0.15, 26, 0.1, -24, p.DK, 24);
  const dr = k.node(g, 26, 5, -24);
  const rr: THREE.Mesh[] = [];
  k.box(dr, 1.4, 0.4, 1.4, 0, 0, 0, p.DK);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      k.box(dr, 1.4, 0.1, 0.1, a * 0.7, 0, b * 0.7, p.DK);
      rr.push(k.cyl(dr, 0.8, 0.8, 0.05, a * 1.3, 0.3, b * 1.3, cn, 12));
    }
  }
  k.anim.push((t) => {
    dr.position.y = 5 + Math.sin(t * 1.5) * 0.6;
    rr.forEach((r) => { r.rotation.y = t * 40; });
  });
};

export const matl: Builder = (g, _c, k, R) => {
  const p = palette(k);
  k.dome(g, 15, 0, 0, -40, k.lambert(0xdff2ff, { transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  k.cyl(g, 15, 15, 0.4, 0, 0.2, -40, p.WH, 32);
  k.box(g, 5, 3, 5, 0, 1.5, -40, p.DK);
  const co = k.sphere(g, 2.5, 0, 5, -40, p.HOT);
  k.anim.push((t) => co.scale.setScalar(1 + 0.1 * Math.sin(t * 3)));
  R([-15.5, 15.5, -55.5, -24.5]);
  // atom sculpture
  const at = k.node(g, -32, 0, -20);
  k.box(at, 1, 10, 1, 0, 5, 0, p.ST);
  k.sphere(at, 2, 0, 14, 0, p.HOT);
  const ors: THREE.Group[] = [];
  for (let q = 0; q < 3; q++) {
    const o = k.node(at, 0, 14, 0);
    o.rotation.set(q * 1.05, q * 0.6, 0);
    k.torus(o, 7, 0.12, 0, 0, 0, p.ST);
    k.sphere(o, 0.6, 7, 0, 0, k.lambert(0x55e0ff, { emissive: 0x33aacc }));
    ors.push(o);
  }
  k.anim.push((t) => ors.forEach((o, q) => { o.rotation.z = t * (1 + q * 0.35); }));
  R([-33, -31, -21, -19]);
  // crystal lattice (instanced)
  const sGeo = new THREE.SphereGeometry(0.7, 12, 8);
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const lt = k.own(new THREE.InstancedMesh(sGeo, k.lambert(0xffffff), 64));
  const sk = k.own(new THREE.InstancedMesh(bGeo, k.lambert(0xaaaaaa), 144));
  k.own(sGeo);
  k.own(bGeo);
  const lg = k.node(g, 32, 6, -20);
  const d = new THREE.Object3D();
  let n = 0;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let q = 0; q < 4; q++) {
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.position.set((i - 1.5) * 3, (j - 1.5) * 3, (q - 1.5) * 3);
        d.updateMatrix();
        lt.setMatrixAt(n, d.matrix);
        lt.setColorAt(n++, new THREE.Color((i + j + q) % 2 ? 0xe14fa8 : 0x55b0ff));
        for (const [a, b, e] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          if ((a && i < 3) || (b && j < 3) || (e && q < 3)) {
            d.position.set((i - 1.5) * 3 + a * 1.5, (j - 1.5) * 3 + b * 1.5, (q - 1.5) * 3 + e * 1.5);
            d.scale.set(a ? 3 : 0.2, b ? 3 : 0.2, e ? 3 : 0.2);
            d.updateMatrix();
            sk.setMatrixAt(s++, d.matrix);
          }
        }
      }
    }
  }
  lg.add(lt, sk);
  k.anim.push((t) => { lg.rotation.y = t * 0.25; });
  R([29, 35, -23, -17]);
  // tensile tester
  const tf = k.node(g, -34, 0, -62);
  for (const x of [-2, 2]) k.box(tf, 0.8, 12, 0.8, x, 6, 0, p.ST);
  k.box(tf, 5, 0.8, 0.8, 0, 12, 0, p.ST);
  k.box(tf, 5, 0.8, 2, 0, 0.4, 0, p.ST);
  k.cyl(tf, 0.3, 0.3, 10, 0, 6, 0, k.lambert(0xaaaaaa), 8);
  const ch = k.box(tf, 4, 0.7, 1.2, 0, 7, 0, p.DK);
  k.anim.push((t) => { ch.position.y = 7 + Math.sin(t * 0.4) * 2; });
  R([-37, -31, -64, -60]);
  // furnace + cleanroom
  k.box(g, 8, 6, 8, 28, 3, -62, p.DK);
  k.cyl(g, 1, 1.3, 16, 28, 14, -62, p.DK);
  k.box(g, 3, 2, 0.2, 28, 2, -57.9, p.HOT);
  R([24, 32, -66, -58]);
  k.box(g, 16, 6, 10, 0, 3, -72, p.WH);
  k.box(g, 14, 1.4, 0.2, 0, 3.6, -66.9, p.GL);
  R([-8.5, 8.5, -77.5, -66.5]);
};

export interface Discipline {
  name: string;
  color: number;
  build: Builder;
}

export const DISCIPLINES: readonly Discipline[] = [
  { name: 'Civil', color: 0xf08a24, build: civil },
  { name: 'Mechanical', color: 0xd23a3a, build: mech },
  { name: 'Electrical', color: 0xf2c230, build: elec },
  { name: 'Chemical', color: 0x8a4fd1, build: chem },
  { name: 'Aerospace', color: 0x3a9be8, build: aero },
  { name: 'Environmental', color: 0x3fae5a, build: envi },
  { name: 'Computer & Robotics', color: 0x1bc4c4, build: cs },
  { name: 'Materials & Nano', color: 0xe14fa8, build: matl },
];
