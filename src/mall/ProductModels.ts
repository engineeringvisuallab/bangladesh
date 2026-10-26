// City Mall procedural low-poly product models. Origin = bottom centre, y up, about 2.4 m max width.
import * as THREE from 'three';
import type { ProductKind } from './MallCatalog';

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function stdMat(color: number, metal = 0.3, rough = 0.55, glow = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${metal}|${rough}|${glow}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    if (glow) { m.emissive.setHex(glow); m.emissiveIntensity = 1.4; }
    cache.set(key, m);
  }
  return m;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (r: number, h: number, s = 20) => new THREE.CylinderGeometry(r, r, h, s);
function put(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  g.add(mesh);
  return mesh;
}
const dark = stdMat(0x111827, 0.2, 0.8);
const steel = stdMat(0xc9d1d9, 0.9, 0.3);

function wheel(g: THREE.Object3D, x: number, y: number, z: number, r: number, w: number): void {
  put(g, C(r, w, 24), stdMat(0x111111, 0, 0.9), x, y, z, Math.PI / 2);
  put(g, C(r * 0.6, w + 0.02, 16), steel, x, y, z, Math.PI / 2);
}

const builders: Record<ProductKind, (g: THREE.Group, color: number) => void> = {
  car(g, color) {
    const body = stdMat(color, 0.6, 0.3), glass = stdMat(0x142233, 0.9, 0.1);
    put(g, B(2.6, 0.45, 1.15), body, 0, 0.58, 0);
    put(g, B(1.4, 0.4, 1.0), glass, -0.12, 1.0, 0);
    put(g, B(1.25, 0.06, 0.96), body, -0.12, 1.23, 0);
    for (const z of [-0.38, 0.38]) {
      put(g, B(0.05, 0.1, 0.32), stdMat(0xffffff, 0, 0.3, 0xffffff), 1.3, 0.64, z);
      put(g, B(0.05, 0.1, 0.32), stdMat(0xff2222, 0, 0.3, 0xff2222), -1.3, 0.64, z);
    }
    put(g, B(2.3, 0.03, 1.0), stdMat(0x22d3ee, 0, 0.3, 0x22d3ee), 0, 0.3, 0); // under-glow
    for (const x of [-0.85, 0.85]) for (const z of [-0.6, 0.6]) wheel(g, x, 0.3, z, 0.3, 0.22);
  },
  bike(g, color) {
    const fr = stdMat(color, 0.5, 0.4);
    for (const x of [-0.75, 0.75]) put(g, new THREE.TorusGeometry(0.42, 0.06, 10, 28), stdMat(0x111111, 0, 0.9), x, 0.48, 0);
    put(g, C(0.15, 0.12, 16), dark, -0.75, 0.48, 0, Math.PI / 2); // hub motor
    put(g, B(1.0, 0.07, 0.07), fr, 0, 0.92, 0);
    put(g, B(0.07, 0.85, 0.07), fr, 0.68, 0.75, 0, 0, 0, -0.35);
    put(g, B(0.07, 0.6, 0.07), fr, -0.45, 0.7, 0, 0, 0, 0.3);
    put(g, B(0.65, 0.2, 0.14), dark, 0, 0.7, 0);
    put(g, B(0.4, 0.03, 0.02), stdMat(0x22c55e, 0, 0.3, 0x22c55e), 0, 0.7, 0.075);
    put(g, B(0.42, 0.07, 0.2), dark, -0.45, 1.05, 0);
    put(g, B(0.07, 0.07, 0.6), dark, 0.82, 1.2, 0);
  },
  battery(g, color) {
    put(g, B(1.0, 0.6, 0.55), stdMat(color, 0.4, 0.5), 0, 0.3, 0);
    put(g, B(1.02, 0.08, 0.57), dark, 0, 0.64, 0);
    put(g, C(0.07, 0.14, 12), stdMat(0xd4a017, 0.9, 0.3), -0.3, 0.75, 0);
    put(g, C(0.07, 0.14, 12), stdMat(0xb45309, 0.9, 0.3), 0.3, 0.75, 0);
    put(g, B(0.7, 0.06, 0.02), stdMat(0x22c55e, 0, 0.3, 0x22c55e), 0, 0.42, 0.28);
    put(g, B(0.3, 0.18, 0.02), stdMat(0xffffff, 0, 0.6), 0, 0.22, 0.28);
  },
  charger(g, color) {
    put(g, B(0.9, 0.12, 0.6), dark, 0, 0.06, 0);
    put(g, B(0.45, 1.7, 0.3), stdMat(color, 0.4, 0.4), 0, 0.97, 0);
    put(g, B(0.3, 0.4, 0.02), stdMat(0x22c55e, 0, 0.3, 0x22c55e), 0, 1.45, 0.16);
    put(g, B(0.2, 0.35, 0.12), dark, 0, 0.85, 0.2);
    put(g, B(0.47, 0.06, 0.32), stdMat(0xffffff, 0, 0.3, 0x22d3ee), 0, 1.84, 0);
    put(g, new THREE.TorusGeometry(0.3, 0.03, 8, 20), dark, 0.5, 0.55, 0, 0, Math.PI / 2, 0);
  },
  solar(g, color) {
    const p = new THREE.Group();
    put(p, B(2.2, 0.06, 1.3), stdMat(color, 0.8, 0.25), 0, 0, 0);
    const line = stdMat(0xcbd5e1, 0.5, 0.4);
    for (let i = 1; i < 6; i++) put(p, B(0.015, 0.07, 1.3), line, -1.1 + (i * 2.2) / 6, 0, 0);
    for (let i = 1; i < 4; i++) put(p, B(2.2, 0.07, 0.015), line, 0, 0, -0.65 + (i * 1.3) / 4);
    p.position.y = 1.1;
    p.rotation.x = -0.5;
    g.add(p);
    for (const x of [-0.8, 0.8]) put(g, C(0.04, 1.1, 8), stdMat(0x94a3b8, 0.8, 0.4), x, 0.55, -0.1);
    put(g, B(2.0, 0.05, 0.3), dark, 0, 0.03, 0);
  },
  motor(g, color) {
    put(g, C(0.45, 0.9, 28), stdMat(color, 0.6, 0.35), 0, 0.6, 0, 0, 0, Math.PI / 2);
    for (let i = -2; i <= 2; i++) put(g, new THREE.TorusGeometry(0.46, 0.03, 8, 28), dark, i * 0.17, 0.6, 0, 0, Math.PI / 2, 0);
    put(g, C(0.07, 0.5, 12), steel, 0.7, 0.6, 0, 0, 0, Math.PI / 2);
    put(g, C(0.38, 0.1, 24), stdMat(0xb45309, 0.9, 0.3), -0.5, 0.6, 0, 0, 0, Math.PI / 2);
    put(g, B(0.9, 0.1, 0.8), dark, 0, 0.05, 0);
  },
  tyre(g, color) {
    put(g, new THREE.TorusGeometry(0.6, 0.22, 14, 32), stdMat(0x111111, 0, 0.95), 0, 0.85, 0);
    put(g, C(0.45, 0.3, 28), stdMat(color, 0.8, 0.3), 0, 0.85, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) put(g, B(0.8, 0.06, 0.06), steel, 0, 0.85, 0.16, 0, 0, (i * Math.PI) / 5);
  },
  helmet(g, color) {
    const shell = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.35, side: THREE.DoubleSide });
    put(g, new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), shell, 0, 0.55, 0);
    put(g, B(0.25, 0.22, 0.6), stdMat(0x0b1220, 0.9, 0.1), 0.38, 0.62, 0);
    put(g, B(1.0, 0.02, 0.12), stdMat(0xffffff, 0, 0.5), 0, 1.05, 0);
  },
  shirt(g, color) {
    const cl = stdMat(color, 0, 0.8);
    put(g, B(0.2, 1.0, 0.16), stdMat(0x94a3b8, 0.8, 0.4), 0, 0.5, 0);           // stand pole
    put(g, B(0.7, 0.06, 0.06), stdMat(0x94a3b8, 0.8, 0.4), 0, 1.0, 0);          // hanger bar
    put(g, B(0.78, 0.75, 0.14), cl, 0, 1.45, 0);                                // body
    put(g, B(0.3, 0.55, 0.12), cl, -0.52, 1.5, 0, 0, 0, 0.35);                  // sleeves
    put(g, B(0.3, 0.55, 0.12), cl, 0.52, 1.5, 0, 0, 0, -0.35);
    put(g, B(0.24, 0.05, 0.16), stdMat(0xffffff, 0, 0.6), 0, 1.84, 0.01);       // collar
    put(g, B(0.78, 0.04, 0.15), stdMat(0xffffff, 0, 0.6, 0), 0, 1.15, 0);       // hem
  },
  shoe(g, color) {
    const m = stdMat(color, 0.2, 0.6);
    put(g, B(0.4, 0.08, 1.1), stdMat(0xf1f5f9, 0, 0.8), 0, 0.5, 0);             // sole
    put(g, B(0.4, 0.22, 0.6), m, 0, 0.65, 0.18);                                // toe
    put(g, B(0.4, 0.5, 0.4), m, 0, 0.8, -0.28);                                 // ankle
    put(g, B(0.3, 0.04, 0.3), dark, 0, 1.06, -0.28);
    put(g, B(0.42, 0.06, 0.3), stdMat(0xffffff, 0, 0.5), 0, 0.75, 0.15);        // laces
    put(g, B(0.9, 0.08, 0.9), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);          // little stand
  },
  bag(g, color) {
    const m = stdMat(color, 0.1, 0.6);
    put(g, B(0.9, 0.7, 0.4), m, 0, 0.75, 0);
    put(g, B(0.92, 0.12, 0.42), dark, 0, 0.9, 0);
    put(g, new THREE.TorusGeometry(0.28, 0.035, 8, 20, Math.PI), stdMat(0x1c1917, 0.2, 0.7), 0, 1.1, 0);
    put(g, B(0.18, 0.1, 0.02), stdMat(0xd4a017, 0.9, 0.3), 0, 0.88, 0.22);
    put(g, B(0.7, 0.3, 0.5), stdMat(0x334155, 0.3, 0.5), 0, 0.15, 0);
  },
  watch(g, color) {
    put(g, B(0.9, 0.08, 0.9), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
    put(g, C(0.05, 0.9, 10), stdMat(0x1f2937, 0.5, 0.4), 0, 0.5, 0);
    put(g, C(0.38, 0.1, 28), stdMat(color, 0.9, 0.25), 0, 1.05, 0, Math.PI / 2);
    put(g, C(0.31, 0.11, 28), stdMat(0x0b1220, 0.5, 0.2), 0, 1.05, 0.01, Math.PI / 2);
    put(g, B(0.04, 0.22, 0.02), stdMat(0xffffff, 0, 0.4, 0xffffff), 0, 1.1, 0.07);
    put(g, B(0.26, 0.6, 0.06), dark, 0, 1.55, -0.02);
    put(g, B(0.26, 0.6, 0.06), dark, 0, 0.55, -0.02);
  },
  phone(g, color) {
    put(g, B(0.9, 0.08, 0.9), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
    put(g, B(0.04, 0.55, 0.04), steel, 0, 0.4, 0);
    const p = new THREE.Group();
    put(p, B(0.52, 1.0, 0.06), stdMat(color, 0.7, 0.3), 0, 0, 0);
    put(p, B(0.46, 0.92, 0.02), stdMat(0x0b1220, 0.4, 0.1, 0x1e3a8a), 0, 0, 0.035);
    put(p, B(0.1, 0.1, 0.03), dark, -0.12, 0.38, -0.04);
    p.position.set(0, 1.25, 0); p.rotation.x = -0.15; g.add(p);
  },
  laptop(g, color) {
    put(g, B(0.9, 0.08, 0.9), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
    put(g, B(1.2, 0.05, 0.85), stdMat(color, 0.8, 0.3), 0, 0.5, 0.1);
    put(g, B(1.0, 0.03, 0.55), dark, 0, 0.535, 0.18);
    const s = new THREE.Group();
    put(s, B(1.2, 0.8, 0.04), stdMat(color, 0.8, 0.3), 0, 0, 0);
    put(s, B(1.1, 0.7, 0.02), stdMat(0x0b1220, 0.3, 0.1, 0x2563eb), 0, 0, 0.025);
    s.position.set(0, 0.92, -0.32); s.rotation.x = -0.22; g.add(s);
  },
  tv(g, color) {
    put(g, B(0.8, 0.05, 0.4), dark, 0, 0.5, 0);
    put(g, B(0.1, 0.4, 0.1), dark, 0, 0.7, -0.05);
    put(g, B(2.1, 1.2, 0.08), stdMat(color, 0.6, 0.3), 0, 1.4, 0);
    put(g, B(2.0, 1.1, 0.02), stdMat(0x0b1220, 0.3, 0.1, 0x0ea5e9), 0, 1.4, 0.05);
    put(g, B(2.5, 0.08, 0.7), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
  },
  headphone(g, color) {
    put(g, B(0.9, 0.08, 0.9), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
    put(g, C(0.05, 0.7, 10), steel, 0, 0.4, 0);
    put(g, new THREE.TorusGeometry(0.42, 0.06, 10, 28, Math.PI), stdMat(color, 0.5, 0.4), 0, 1.0, 0);
    for (const x of [-0.42, 0.42]) put(g, C(0.2, 0.16, 20), stdMat(color, 0.5, 0.4), x, 1.0, 0, 0, 0, Math.PI / 2);
  },
  sofa(g, color) {
    const m = stdMat(color, 0, 0.9);
    put(g, B(2.3, 0.45, 1.0), m, 0, 0.4, 0);
    put(g, B(2.3, 0.7, 0.28), m, 0, 0.95, -0.4);
    for (const x of [-1.1, 1.1]) put(g, B(0.2, 0.65, 1.0), m, x, 0.7, 0);
    for (const x of [-0.55, 0.55]) put(g, B(1.0, 0.18, 0.75), stdMat(color, 0, 0.7), x, 0.7, 0.08);
    for (const x of [-1.0, 1.0]) for (const z of [-0.4, 0.4]) put(g, B(0.08, 0.18, 0.08), dark, x, 0.09, z);
  },
  lamp(g, color) {
    put(g, C(0.3, 0.06, 20), dark, 0, 0.05, 0);
    put(g, C(0.03, 1.5, 8), steel, 0, 0.8, 0);
    put(g, new THREE.CylinderGeometry(0.2, 0.55, 0.6, 24, 1, true), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 1.75, 0);
    put(g, new THREE.SphereGeometry(0.14, 12, 10), stdMat(0xffffff, 0, 0.3, 0xfff1a8), 0, 1.7, 0);
  },
  pot(g, color) {
    const m = stdMat(color, 0.6, 0.35);
    put(g, C(0.55, 0.55, 28), m, 0, 0.55, 0);
    put(g, C(0.58, 0.06, 28), steel, 0, 0.85, 0);
    put(g, C(0.12, 0.1, 12), dark, 0, 0.93, 0);
    put(g, B(0.5, 0.1, 0.1), dark, 0.72, 0.7, 0);
    put(g, B(0.5, 0.1, 0.1), dark, -0.72, 0.7, 0);
    put(g, B(1.0, 0.1, 1.0), stdMat(0x334155, 0.3, 0.5), 0, 0.2, 0);
  },
  toy(g, color) {
    const cols = [color, 0xfacc15, 0x22c55e, 0x3b82f6, 0xef4444];
    for (let i = 0; i < 6; i++) put(g, B(0.5, 0.5, 0.5), stdMat(cols[i % 5], 0, 0.6), -0.55 + (i % 3) * 0.55, 0.3 + Math.floor(i / 3) * 0.5, 0.05 * i - 0.1);
    put(g, C(0.22, 0.5, 18), stdMat(color, 0, 0.6), 0, 1.3, 0);
    put(g, new THREE.SphereGeometry(0.28, 16, 12), stdMat(0xf8fafc, 0, 0.6), 0, 1.75, 0);
    put(g, B(1.8, 0.06, 0.7), dark, 0, 0.03, 0);
  },
  book(g, color) {
    const cols = [color, 0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xa855f7];
    for (let i = 0; i < 6; i++) put(g, B(0.2, 0.9 + (i % 3) * 0.12, 0.7), stdMat(cols[i], 0, 0.8), -0.6 + i * 0.24, 0.55 + (i % 3) * 0.06, 0);
    put(g, B(1.6, 0.06, 0.8), stdMat(0x92400e, 0, 0.8), 0, 0.08, 0);
    const o = new THREE.Group(); put(o, B(0.7, 0.06, 0.9), stdMat(0xf8fafc, 0, 0.8), 0, 0, 0); o.position.set(0, 1.3, 0.1); o.rotation.x = -0.4; g.add(o);
  },
  ball(g, color) {
    put(g, new THREE.SphereGeometry(0.5, 24, 18), stdMat(color, 0.1, 0.5), 0, 0.85, 0);
    put(g, new THREE.TorusGeometry(0.5, 0.025, 8, 28), dark, 0, 0.85, 0);
    put(g, new THREE.TorusGeometry(0.5, 0.025, 8, 28), dark, 0, 0.85, 0, Math.PI / 2);
    put(g, C(0.4, 0.1, 20), stdMat(0x334155, 0.3, 0.5), 0, 0.25, 0);
    put(g, B(0.08, 1.5, 0.08), stdMat(0x92400e, 0, 0.7), 0.9, 0.85, 0, 0, 0, 0.15); // bat / stick
  },
  box(g, color) {
    put(g, B(1.0, 0.7, 0.8), stdMat(color, 0, 0.7), 0, 0.45, 0);
    put(g, B(1.04, 0.06, 0.84), stdMat(0xffffff, 0, 0.6), 0, 0.82, 0);
    put(g, B(0.16, 0.72, 0.84), stdMat(0xfacc15, 0, 0.5), 0, 0.45, 0);              // ribbon
    put(g, B(0.7, 0.45, 0.6), stdMat(color, 0, 0.7), 0.3, 1.1, 0);
    put(g, B(1.4, 0.08, 1.0), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
  },
  bottle(g, color) {
    for (let i = 0; i < 3; i++) {
      const x = -0.55 + i * 0.55, m = stdMat(color, 0.2, 0.3);
      put(g, C(0.18, 0.75, 16), m, x, 0.5, 0);
      put(g, C(0.08, 0.3, 12), m, x, 1.05, 0);
      put(g, C(0.09, 0.08, 12), stdMat(0xffffff, 0, 0.5), x, 1.22, 0);
      put(g, C(0.185, 0.3, 16), stdMat(0xffffff, 0, 0.7), x, 0.5, 0);                // label
    }
    put(g, B(1.7, 0.08, 0.6), stdMat(0x334155, 0.3, 0.5), 0, 0.04, 0);
  },
  cake(g, color) {
    put(g, C(0.7, 0.45, 32), stdMat(0xfde68a, 0, 0.8), 0, 0.3, 0);
    put(g, C(0.72, 0.18, 32), stdMat(color, 0, 0.6), 0, 0.62, 0);
    put(g, C(0.46, 0.35, 28), stdMat(0xfef3c7, 0, 0.8), 0, 0.9, 0);
    put(g, C(0.48, 0.1, 28), stdMat(color, 0, 0.6), 0, 1.1, 0);
    for (let i = 0; i < 6; i++) put(g, new THREE.SphereGeometry(0.06, 8, 6), stdMat(0xef4444, 0, 0.5), Math.cos(i) * 0.32, 1.2, Math.sin(i) * 0.32);
    put(g, C(0.02, 0.25, 6), stdMat(0xf8fafc, 0, 0.5), 0, 1.3, 0);
    put(g, new THREE.SphereGeometry(0.04, 8, 6), stdMat(0xffffff, 0, 0.3, 0xffcc33), 0, 1.45, 0);
  },
};

export function makeProductModel(kind: ProductKind, color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  builders[kind](g, color);
  g.scale.setScalar(scale);
  return g;
}

/** Standing expert (front = +z). The viewer turns him towards the door. */
export function makePerson(color: number): THREE.Group {
  const g = new THREE.Group(), skin = stdMat(0xd6a27a, 0, 0.8), cloth = stdMat(color, 0, 0.7);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); };
  for (const x of [-0.12, 0.12]) add(new THREE.BoxGeometry(0.17, 0.8, 0.2), dark, x, 0.4);
  add(new THREE.BoxGeometry(0.5, 0.65, 0.28), cloth, 0, 1.12);
  for (const x of [-0.33, 0.33]) add(new THREE.BoxGeometry(0.12, 0.6, 0.14), cloth, x, 1.12);
  add(new THREE.SphereGeometry(0.16, 14, 12), skin, 0, 1.58);
  add(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), stdMat(0x1c1917, 0, 0.9), 0, 1.6);
  return g;
}
