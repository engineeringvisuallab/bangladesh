import * as THREE from 'three';

const SEG: Record<string, [number, number, number, number]> = {
  // x, y, w, h of the 7 segments in a 1 x 2 cell: a b c d e f g
  a: [0, 1.9, 0.8, 0.14], b: [0.45, 1.45, 0.14, 0.8], c: [0.45, 0.45, 0.14, 0.8], d: [0, 0.0, 0.8, 0.14],
  e: [-0.45, 0.45, 0.14, 0.8], f: [-0.45, 1.45, 0.14, 0.8], g: [0, 0.95, 0.8, 0.14],
};
const DIGITS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '' };

/** A row of seven-segment digits built from boxes (works everywhere, no textures). Call set(n) to show a number. */
export function sevenSeg(parent: THREE.Object3D, digits: number, x: number, y: number, z: number, scale: number, onColor: number, dispose: { dispose(): void }[]): { set(n: number): void; group: THREE.Group } {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  parent.add(g);
  const on = new THREE.MeshBasicMaterial({ color: onColor });
  const off = new THREE.MeshBasicMaterial({ color: 0x1b2226 });
  dispose.push(on, off);
  const geos = new Map<string, THREE.BoxGeometry>();
  const cells: Map<string, THREE.Mesh>[] = [];
  for (let d = 0; d < digits; d++) {
    const m = new Map<string, THREE.Mesh>();
    for (const [k, [sx, sy, w, h]] of Object.entries(SEG)) {
      const key = `${w}x${h}`;
      let geo = geos.get(key);
      if (!geo) {
        geo = new THREE.BoxGeometry(w, h, 0.1);
        geos.set(key, geo);
        dispose.push(geo);
      }
      const seg = new THREE.Mesh(geo, off);
      seg.position.set(d * 1.4 + sx, sy + h / 2, 0);
      g.add(seg);
      m.set(k, seg);
    }
    cells.push(m);
  }
  let last = -1;
  return {
    group: g,
    set(n: number): void {
      const v = Math.max(0, Math.floor(n));
      if (v === last) return;
      last = v;
      const s = String(v).padStart(digits, ' ').slice(-digits);
      cells.forEach((cell, i) => {
        const lit = DIGITS[s[i]] ?? '';
        for (const [k, seg] of cell) seg.material = lit.includes(k) ? on : off;
      });
    },
  };
}
