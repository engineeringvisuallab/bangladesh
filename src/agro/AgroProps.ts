// EV Agro - procedural props and the furnishing of every room theme.
// Room-local frame: `a` = distance along the door wall, `t` = depth from the door wall inwards (0 .. D).
import * as THREE from 'three';
import { makePerson, makeProductModel, stdMat } from '../mall/ProductModels';
import { canvasTex, fitText, hex, signMesh } from '../mall/MallBuilder';
import type { Theme } from './AgroRooms';

export interface RoomCtx {
  g: THREE.Group; y0: number; axis: 'x' | 'z'; a0: number; a1: number; D: number; dw: number; sgn: number; doorA: number;
  color: number;
  collide(x0: number, x1: number, z0: number, z1: number): void;
  expert(a: number, t: number): void;
}

const P = (c: RoomCtx, a: number, t: number): [number, number] => (c.axis === 'x' ? [a, c.dw + c.sgn * t] : [c.dw + c.sgn * t, a]);
export const facing = (m: THREE.Object3D, nx: number, nz: number) => { m.rotation.y = Math.atan2(nx, nz); };
/** unit normal pointing from the back wall towards the door wall */
export const towardDoor = (c: RoomCtx): [number, number] => (c.axis === 'x' ? [0, -c.sgn] : [-c.sgn, 0]);

function bx(c: RoomCtx, a: number, t: number, la: number, lt: number, h: number, m: THREE.Material, y = 0, solid = false): THREE.Mesh {
  const [x, z] = P(c, a, t), [w, d] = c.axis === 'x' ? [la, lt] : [lt, la];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, c.y0 + y + h / 2, z); c.g.add(mesh);
  if (solid) c.collide(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  return mesh;
}
function cy(c: RoomCtx, a: number, t: number, r: number, h: number, m: THREE.Material, y = 0, solid = false, rz = false): THREE.Mesh {
  const [x, z] = P(c, a, t);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), m);
  mesh.position.set(x, c.y0 + y + h / 2, z); if (rz) mesh.rotation.z = Math.PI / 2; c.g.add(mesh);
  if (solid) c.collide(x - r, x + r, z - r, z + r);
  return mesh;
}
function place(c: RoomCtx, o: THREE.Object3D, a: number, t: number, yaw = 0, hx = 0, hz = 0, y = 0): void {
  const [x, z] = P(c, a, t);
  o.position.set(x, c.y0 + y, z); o.rotation.y = yaw; c.g.add(o);
  if (hx) c.collide(x - hx, x + hx, z - hz, z + hz);
}
function inst(c: RoomCtx, geo: THREE.BufferGeometry, pts: [number, number, number][], colors?: number[], mat: THREE.Material = stdMat(0xffffff, 0, 0.7)): void {
  const im = new THREE.InstancedMesh(geo, mat, pts.length), o = new THREE.Object3D(), col = new THREE.Color();
  pts.forEach(([a, t, y], i) => {
    const [x, z] = P(c, a, t); o.position.set(x, c.y0 + y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    if (colors) im.setColorAt(i, col.setHex(colors[i % colors.length]));
  });
  c.g.add(im);
}

const JAR = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xf5f5f4, 0x92400e];
const dark = stdMat(0x1f2937, 0.3, 0.6), steel = stdMat(0xcbd5e1, 0.9, 0.3), wood = stdMat(0x92400e, 0, 0.8);
const glass = new THREE.MeshStandardMaterial({ color: 0x9bd1f0, transparent: true, opacity: 0.3, roughness: 0.1 });
const water = (col = 0x38bdf8) => new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.65 });

// ---------------- shared small props ----------------
export function textSprite(text: string, accent: number, w = 2.6): THREE.Sprite {
  const tex = canvasTex(512, 128, (c) => {
    c.fillStyle = 'rgba(15,23,42,0.9)'; c.beginPath(); c.roundRect(4, 4, 504, 120, 20); c.fill();
    c.fillStyle = hex(accent); c.fillRect(4, 108, 504, 16);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, text, 52, 700, 470); c.fillText(text, 256, 52);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(w, w / 4, 1);
  return s;
}
export const makeExpert = makePerson;
export function makeTractor(): THREE.Group {
  const g = new THREE.Group(), body = stdMat(0xf97316, 0.5, 0.4), tyre = stdMat(0x111111, 0, 0.95);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); };
  add(new THREE.BoxGeometry(2.2, 0.7, 1.0), body, 0, 0.95);
  add(new THREE.BoxGeometry(1.0, 0.9, 0.9), stdMat(0x142233, 0.9, 0.1), -0.45, 1.7);
  add(new THREE.BoxGeometry(1.1, 0.06, 1.0), body, -0.45, 2.18);
  add(new THREE.BoxGeometry(1.5, 0.22, 0.7), stdMat(0x22d3ee, 0, 0.3, 0x22d3ee), 0.1, 0.5);
  for (const z of [-0.72, 0.72]) {
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.35, 24), tyre, -0.7, 0.62, z, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 20), tyre, 0.85, 0.38, z * 0.85, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.05, 0.14, 0.7), stdMat(0xffffff, 0, 0.3, 0xffffff), 1.12, 1.0);
  return g;
}
function cow(): THREE.Group {
  const g = new THREE.Group(), w = stdMat(0xf8fafc, 0, 0.9), k = stdMat(0x111111, 0, 0.9);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); };
  add(new THREE.BoxGeometry(1.5, 0.75, 0.65), w, 0, 0.95);
  add(new THREE.BoxGeometry(0.4, 0.4, 0.42), w, 0.95, 1.2);
  add(new THREE.BoxGeometry(0.2, 0.16, 0.44), stdMat(0xf9a8d4, 0, 0.9), 1.2, 1.1);
  add(new THREE.BoxGeometry(0.5, 0.2, 0.67), k, -0.2, 1.1);
  add(new THREE.BoxGeometry(0.35, 0.3, 0.67), k, 0.4, 0.85);
  for (const x of [-0.6, 0.6]) for (const z of [-0.22, 0.22]) add(new THREE.BoxGeometry(0.13, 0.6, 0.13), w, x, 0.3, z);
  add(new THREE.BoxGeometry(0.06, 0.55, 0.06), k, -0.78, 0.9);
  return g;
}
export function makeDrone(): THREE.Group {
  const g = new THREE.Group(), add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); };
  add(new THREE.BoxGeometry(0.5, 0.16, 0.5), stdMat(0xf1f5f9, 0.3, 0.4), 0, 0.55);
  add(new THREE.BoxGeometry(1.8, 0.05, 0.07), dark, 0, 0.55, 0, Math.PI / 4);
  add(new THREE.BoxGeometry(1.8, 0.05, 0.07), dark, 0, 0.55, 0, -Math.PI / 4);
  for (const x of [-0.64, 0.64]) for (const z of [-0.64, 0.64]) add(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.45 }), x, 0.62, z);
  add(new THREE.SphereGeometry(0.1, 10, 8), stdMat(0x22d3ee, 0, 0.2, 0x22d3ee), 0, 0.42);
  return g;
}
function crop(kind: number): THREE.Group {
  const g = new THREE.Group(), green = stdMat(0x4d7c0f, 0, 0.9);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); };
  const stalks = (head: number, h: number, n: number) => { for (let i = 0; i < n; i++) { const x = Math.cos(i * 2.4) * 0.22, z = Math.sin(i * 2.4) * 0.22;
    add(new THREE.CylinderGeometry(0.02, 0.025, h, 6), green, x, h / 2, z);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stdMat(head, 0, 0.8)); hd.scale.set(0.6, 2.2, 0.6); hd.position.set(x, h, z); g.add(hd); } };
  if (kind === 0) stalks(0xd4a017, 0.9, 10);
  else if (kind === 1) stalks(0xe8c46a, 0.8, 12);
  else if (kind === 2) { for (const [x, z] of [[0, 0], [0.2, 0.15], [-0.18, 0.1]]) { add(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 8), green, x, 0.7, z); add(new THREE.CylinderGeometry(0.08, 0.07, 0.34, 10), stdMat(0xfacc15, 0, 0.7), x + 0.1, 0.9, z); } }
  else if (kind === 3) { add(new THREE.SphereGeometry(0.38, 12, 10), green, 0, 0.5); for (let i = 0; i < 6; i++) add(new THREE.SphereGeometry(0.09, 10, 8), stdMat(0xdc2626, 0, 0.5), Math.cos(i * 1.1) * 0.3, 0.45 + (i % 3) * 0.12, Math.sin(i * 1.1) * 0.3); }
  else if (kind === 4) { add(new THREE.ConeGeometry(0.5, 0.3, 14), stdMat(0x78350f, 0, 1), 0, 0.15); for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), stdMat(0xb08a5a, 0, 0.9)); p.scale.set(1.2, 0.9, 1); p.position.set(Math.cos(i * 1.3) * 0.32, 0.4, Math.sin(i * 1.3) * 0.32); g.add(p); } }
  else for (let i = 0; i < 7; i++) add(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 6), stdMat(0x65a30d, 0, 0.9), Math.cos(i * 2.4) * 0.2, 0.85, Math.sin(i * 2.4) * 0.2);
  return g;
}
const CROPS = ['ধান', 'গম', 'ভুট্টা', 'টমেটো', 'আলু', 'পাট'];

// ---------------- furnishing ----------------
export function furnish(theme: Theme, c: RoomCtx): void {
  const D = c.D, L0 = c.a0 + 2, L1 = c.a1 - 8, tF = 3.6, tB = D - 3.6;
  const cnt = (sp: number) => Math.max(1, Math.floor((L1 - L0) / sp));
  const at = (i: number, n: number) => L0 + ((L1 - L0) * (i + 0.5)) / n;
  /** run fn on the front line (door side, skipping the door path) and the back line */
  const lines = (sp: number, fn: (a: number, t: number, i: number) => void, backOnly = false) => {
    const n = cnt(sp);
    for (let i = 0; i < n; i++) { const a = at(i, n); if (!backOnly && Math.abs(a - c.doorA) > 3.6) fn(a, tF, i); fn(a, tB, i + n); }
  };
  const table = (a: number, t: number, len: number, wid = 1.0) => { bx(c, a, t, len, wid, 0.85, dark, 0, true); bx(c, a, t, len + 0.1, wid + 0.1, 0.07, stdMat(0xf1f5f9, 0.1, 0.4), 0.85); };
  const flask = (a: number, t: number, col: number) => { cy(c, a, t, 0.09, 0.2, stdMat(col, 0, 0.3), 0.92); cy(c, a, t, 0.035, 0.12, glass, 1.12); };
  const scope = (a: number, t: number) => { bx(c, a, t, 0.3, 0.2, 0.05, dark, 0.92); bx(c, a, t, 0.08, 0.08, 0.35, stdMat(0xe5e7eb, 0.7, 0.3), 0.95); };
  const rack = (len: number, rows: number, palette: number[], mat = steel) => {
    const a = (L0 + L1) / 2, t = D - 0.65; bx(c, a, t, len, 0.5, 3.0, mat, 0, true);
    const pts: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < len / 0.34 - 1; k++) pts.push([a - len / 2 + 0.3 + k * 0.34, t - 0.28, 0.35 + r * 0.7]);
    inst(c, new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10), pts, palette);
  };
  const plantsBed = (a: number, t: number, len: number, wid: number, col: number, h = 0.5, soil = 0x5b3a1e) => {
    bx(c, a, t, len, wid, 0.45, stdMat(soil, 0, 1), 0, true);
    const pts: [number, number, number][] = [];
    for (let x = -len / 2 + 0.3; x < len / 2; x += 0.45) for (let z = -wid / 2 + 0.25; z < wid / 2; z += 0.45) pts.push([a + x, t + z, 0.45]);
    inst(c, new THREE.ConeGeometry(0.18, h, 6), pts, [col, col + 0x0a1a0a]);
  };
  const tank = (a: number, t: number, len: number, wid: number, h: number, fish = false) => {
    bx(c, a, t, len, wid, 0.5, dark, 0, true); bx(c, a, t, len - 0.1, wid - 0.1, h, water(), 0.5); bx(c, a, t, len, wid, h + 0.05, glass, 0.5);
    if (fish) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), stdMat(0xf97316, 0, 0.4)); f.scale.set(1.7, 0.9, 0.6); place(c, f, a - len * 0.3 + i * len * 0.2, t + (i % 2 ? 0.2 : -0.2), 0, 0, 0, 0.5 + h * (0.3 + 0.12 * (i % 3))); }
  };
  const desk = (a: number, t: number, len = 2.2) => { bx(c, a, t, len, 0.9, 0.78, wood, 0, true); bx(c, a, t, 0.7, 0.05, 0.4, dark, 0.9); bx(c, a, t, 0.7, 0.03, 0.45, stdMat(0x22d3ee, 0, 0.2, 0x0e7490), 1.0); };
  const shelves = (len: number, t: number, a: number) => {
    bx(c, a, t, len, 0.45, 2.6, wood, 0, true);
    const pts: [number, number, number][] = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < len / 0.12 - 2; k++) pts.push([a - len / 2 + 0.15 + k * 0.12, t - 0.24, 0.2 + r * 0.6]);
    inst(c, new THREE.BoxGeometry(0.09, 0.4, 0.3), pts, [0x1d4ed8, 0xb91c1c, 0x15803d, 0xca8a04, 0x7e22ce, 0xf1f5f9]);
  };
  const board = (a: number, y: number, w: number, h: number, title: string, sub: string) => {
    const m = signMesh(w, h, title, sub, c.color), [nx, nz] = towardDoor(c), [x, z] = P(c, a, D - 0.06);
    m.position.set(x, c.y0 + y, z); facing(m, nx, nz); c.g.add(m);
  };

  switch (theme) {
    case 'soil':
      lines(6, (a, t, i) => { table(a, t, 4.2); for (let k = 0; k < 3; k++) flask(a - 1.2 + k * 1.2, t, JAR[(i + k) % JAR.length]); scope(a + 1.6, t); });
      rack(L1 - L0 - 2, 3, [0x78350f, 0x92400e, 0xb45309, 0x57534e]);
      plantsBed(L0 + 3, D / 2, 5, 1.6, 0x4d7c0f); break;
    case 'seed':
      lines(6, (a, t, i) => { if (i % 2 === 0 && t === tF) { bx(c, a, t, 1.3, 1.0, 2.0, stdMat(0xf8fafc, 0.3, 0.4), 0, true); bx(c, a, t, 1.0, 0.04, 0.6, stdMat(0x22d3ee, 0, 0.3, 0x22d3ee), 1.2); } else { table(a, t, 4); scope(a - 1, t); scope(a + 1, t); } });
      rack(L1 - L0 - 2, 3, [0xeab308, 0xf8fafc, 0xd97706, 0x84cc16, 0xf59e0b]); break;
    case 'protect':
      lines(6, (a, t) => { table(a, t, 4.2); scope(a - 1.4, t); scope(a, t); bx(c, a + 1.4, t, 1.0, 0.7, 0.3, glass, 0.92); for (let k = 0; k < 3; k++) bx(c, a + 1.1 + k * 0.3, t, 0.12, 0.12, 0.1, dark, 0.95); });
      rack(L1 - L0 - 2, 2, [0xdc2626, 0x15803d, 0xf59e0b]); break;
    case 'water':
      lines(7, (a, t, i) => { const tk = cy(c, a, t, 1.1, 2.4, water(0x38bdf8), 0, true); tk.material = water(0x0ea5e9); cy(c, a, t, 1.15, 0.2, steel, 2.4); if (i % 2) cy(c, a + 2, t, 0.3, 1.0, stdMat(0x1d4ed8, 0.5, 0.4), 0, true); });
      cy(c, (L0 + L1) / 2, D - 0.9, 0.08, L1 - L0, stdMat(0x2563eb, 0.4, 0.5), 3.0, false, c.axis === 'x');
      plantsBed(L0 + 4, D - 3.4 - 2.4, 6, 1.4, 0x65a30d); break;
    case 'greenhouse':
      lines(6, (a, t) => { for (let r = 0; r < 3; r++) { bx(c, a, t, 4.4, 1.0, 0.06, steel, 0.4 + r * 0.9); bx(c, a, t, 4.2, 0.9, 0.12, stdMat(0x38bdf8, 0, 0.3), 0.46 + r * 0.9); bx(c, a, t, 4.2, 0.9, 0.04, stdMat(0xa855f7, 0, 0.3, 0xa855f7), 0.95 + r * 0.9); }
        bx(c, a, t, 4.4, 1.0, 0.02, dark, 0, true); inst(c, new THREE.ConeGeometry(0.14, 0.4, 6), Array.from({ length: 36 }, (_, k): [number, number, number] => [a - 2 + (k % 12) * 0.36, t - 0.3 + Math.floor(k / 12) * 0.3, 0.55 + 0.9 * (k % 3)]), [0x22c55e, 0x16a34a]); }); break;
    case 'workshop': {
      const n = cnt(7);
      for (let i = 0; i < n; i++) { const a = at(i, n), big = i % 2 === 0; if (Math.abs(a - c.doorA) < 4.5) continue; const tr = makeTractor(); tr.scale.setScalar(big ? 1.1 : 0.85);
        place(c, tr, a, tB, c.axis === 'x' ? 0 : Math.PI / 2, 1.5, 1.2); if (!big || i > 0) place(c, makeProductModel('charger', 0x3b82f6), a + 2.3, tB, 0, 0.5, 0.4); }
      lines(8, (a, t, i) => { if (t === tB) return; table(a, t, 3); place(c, makeProductModel(i % 2 ? 'motor' : 'battery', 0xef4444, 0.5), a, t, 0, 0, 0, 0.93); }); break; }
    case 'solar':
      lines(6, (a, t) => place(c, makeProductModel('solar', 0x1e3a8a, 0.9), a, t, c.axis === 'x' ? 0 : Math.PI / 2, 1.2, 1.2));
      lines(9, (a, t, i) => { if (t === tF) return; place(c, makeProductModel('battery', i % 2 ? 0xf59e0b : 0x22d3ee, 0.8), a + 3.5, t - 1.4, 0, 0.6, 0.4); }, true); break;
    case 'museum': {
      const n = Math.min(6, cnt(6.5));
      for (let i = 0; i < n; i++) { const a = at(i, n), t = i % 2 ? tB : tF; if (t === tF && Math.abs(a - c.doorA) < 3.6) { continue; }
        cy(c, a, t, 1.0, 0.9, stdMat(0xf1f5f9, 0.1, 0.5), 0, true); const cr = crop(i % 6); cr.scale.setScalar(1.3); place(c, cr, a, t, 0, 0, 0, 0.9);
        const s = textSprite(CROPS[i % 6], c.color, 1.8); const [x, z] = P(c, a, t); s.position.set(x, c.y0 + 3.2, z); c.g.add(s); } break; }
    case 'livestock': {
      const n = cnt(9);
      for (let i = 0; i < n; i++) { const a = at(i, n), t = tB; for (let k = 0; k < 2; k++) place(c, cow(), a - 1 + k * 2.2, t + (k ? 0.4 : -0.3), 0.4 + k, 0, 0, 0);
        bx(c, a, t - 2.0, 4.4, 0.6, 0.5, wood, 0, true); bx(c, a, t + 2.3, 4.6, 0.08, 1.1, wood, 0); }
      lines(11, (a, t, i) => { if (t === tB) return; cy(c, a, t, 0.7, 1.6, steel, 0, true); if (i === 0) bx(c, a + 2, t, 1.6, 0.8, 0.5, stdMat(0xfef3c7, 0, 0.9), 0, true); }); break; }
    case 'fish':
      lines(6, (a, t) => tank(a, t, 4.2, 1.5, 1.1, true)); break;
    case 'weather': {
      const mx = (L0 + L1) / 2; cy(c, mx, D / 2 + 1.5, 0.06, 4.2, steel, 0, true); for (let k = 0; k < 3; k++) { const cup = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), stdMat(0xef4444, 0, 0.5)); place(c, cup, mx + Math.cos(k * 2.09) * 0.4, D / 2 + 1.5 + Math.sin(k * 2.09) * 0.4, 0, 0, 0, 4.2); }
      board(L0 + 5, 2.3, 6, 1.7, '২৮°C  ·  আর্দ্রতা ৭৫%', 'আজকের আবহাওয়া (ডেমো)'); board(L1 - 5, 2.3, 6, 1.7, 'বৃষ্টি: ৩ মিমি', 'আগামী ৭ দিনের পূর্বাভাস (ডেমো)');
      lines(7, (a, t) => { if (t === tB) return; desk(a, t, 2.6); }); break; }
    case 'drone': {
      const n = cnt(6);
      for (let i = 0; i < n; i++) { const a = at(i, n); cy(c, a, tB, 0.5, 1.0, dark, 0, true); const d = makeDrone(); d.scale.setScalar(1.1); place(c, d, a, tB, i, 0, 0, 1.0); }
      lines(8, (a, t, i) => { if (t === tB) return; if (i === 0) { bx(c, a, t, 5, 2.2, 0.8, dark, 0, true); bx(c, a, t, 4.8, 2.0, 0.04, stdMat(0x65a30d, 0, 0.8), 0.8); } else desk(a, t, 2.4); }); break; }
    case 'market':
      lines(7, (a, t, i) => { bx(c, a, t, 3.6, 1.0, 0.95, wood, 0, true); bx(c, a, t, 3.8, 1.3, 0.1, stdMat(JAR[i % JAR.length], 0, 0.7), 2.4);
        for (let k = 0; k < 4; k++) bx(c, a - 1.3 + k * 0.85, t, 0.6, 0.5, 0.35, stdMat(JAR[(i + k) % JAR.length], 0, 0.8), 0.95); });
      for (let k = 0; k < 6; k++) bx(c, L0 + 4 + k * 1.1, D - 0.5, 0.7, 0.1, 0.6 + ((k * 7) % 5) * 0.4, stdMat(JAR[k], 0, 0.5), 0.3); break;
    case 'library':
      lines(6, (a, t) => { shelves(5, t === tB ? D - 0.65 : t, a); }, false);
      for (let i = 0; i < 3; i++) { bx(c, L0 + 6 + i * 11, D / 2, 3, 1.2, 0.8, wood, 0, true); } break;
    case 'auditorium': {
      bx(c, c.a0 + 3.2, D / 2, 5.2, D - 1.0, 0.5, stdMat(0x7f1d1d, 0, 0.8), 0, true);
      board(c.a0 + 0.8, 2.4, 9, 3.2, 'EV Agro Training', 'কৃষক প্রশিক্ষণ ও সেমিনার');
      const pts: [number, number, number][] = [];
      for (let a = c.a0 + 9; a < c.a1 - 6; a += 1.15) for (let t = 4.2; t < D - 1.2; t += 0.9) if (Math.abs(t - D / 2) > 0.7) pts.push([a, t, 0.25]);
      inst(c, new THREE.BoxGeometry(0.5, 0.5, 0.5), pts, [0xe11d48, 0x1e293b]);
      c.collide(...(() => { const [x0, z0] = P(c, c.a0 + 8.5, 4), [x1, z1] = P(c, c.a1 - 5.5, D / 2 - 0.7); return [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)] as [number, number, number, number]; })());
      c.collide(...(() => { const [x0, z0] = P(c, c.a0 + 8.5, D / 2 + 0.7), [x1, z1] = P(c, c.a1 - 5.5, D - 1); return [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)] as [number, number, number, number]; })());
      break; }
    case 'advisory':
      for (let k = 0; k < 3; k++) { const a = L0 + 3 + k * 9; desk(a, tB - 1.0, 3.2); c.expert(a, tB + 0.6); }
      lines(8, (a, t) => { if (t === tB) return; bx(c, a, t, 2.8, 0.9, 0.45, stdMat(0x15803d, 0, 0.8), 0, true); bx(c, a, t - 0.4, 2.8, 0.2, 0.5, stdMat(0x166534, 0, 0.8), 0.45); });
      board((L0 + L1) / 2, 2.2, 9, 1.5, 'প্রশ্ন করুন, পরামর্শ নিন', 'Ask our experts'); return;
  }
  // every other room: a consultation desk with an expert in the reserved back corner
  const ea = c.a1 - 3.5; desk(ea, D - 3.4, 3.4); c.expert(ea, D - 1.7);
}
