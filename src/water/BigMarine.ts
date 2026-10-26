import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { ball, loft, merge, place, smooth, spike } from '../animals/Loft';
import type { Station } from '../animals/Loft';
import { hash2 } from './GeoUtil';

/**
 * The big animals of the open sea, all built from smooth lofted bodies (no photos, no external files):
 *  - humpback whale and blue whale (the "timi"): 12-26 m, slow, tail beats up and down, long flippers, belly pleats
 *  - sharks: great white (counter-shaded, gill slits), reef shark, hammerhead; they circle a swimmer at a distance
 *  - whale shark: 8-11 m, blue-grey with white spots, gentle giant
 *  - manta rays: wings flap, sweep along the bottom / mid-water
 * Every species is ONE InstancedMesh with a handful of instances. Length of every model = 1 (nose +Z), the instance scale sets
 * the real size in metres. Swimming = a travelling wave in the vertex shader. Positions are absolute world metres.
 */

type Species = 'humpback' | 'blue' | 'white' | 'reef' | 'hammer' | 'whaleshark' | 'manta';

interface Def {
  id: Species;
  /** 0 whales, 1 sharks, 2 whale shark, 3 manta */
  skin: 0 | 1 | 2 | 3;
  len: [number, number];
  speed: [number, number];
  /** minimum water depth (m) it needs, share of the water column it likes (min..max below the surface) */
  minDepth: number;
  band: [number, number];
  /** tail wave: frequency, amplitude (share of length), vertical beat (whales, rays) or sideways (sharks) */
  freq: number;
  amp: number;
  vertical: boolean;
  /** how tightly it turns (rad/s) */
  turnRate: number;
  tint: [number, number, number];
  /** 0 never, 1 circles a swimmer */
  curious: boolean;
}

const DEFS: Record<Species, Def> = {
  humpback: { id: 'humpback', skin: 0, len: [11, 16], speed: [2.2, 3.4], minDepth: 22, band: [0.25, 0.7], freq: 1.15, amp: 0.075, vertical: true, turnRate: 0.12, tint: [1, 1, 1], curious: false },
  blue: { id: 'blue', skin: 0, len: [20, 27], speed: [2.8, 4.2], minDepth: 30, band: [0.3, 0.75], freq: 0.9, amp: 0.06, vertical: true, turnRate: 0.08, tint: [0.9, 1.0, 1.1], curious: false },
  white: { id: 'white', skin: 1, len: [3.6, 5.2], speed: [1.6, 2.6], minDepth: 9, band: [0.2, 0.7], freq: 2.6, amp: 0.085, vertical: false, turnRate: 0.5, tint: [1, 1, 1], curious: true },
  reef: { id: 'reef', skin: 1, len: [1.6, 2.4], speed: [1.0, 1.9], minDepth: 4, band: [0.4, 0.9], freq: 3.2, amp: 0.09, vertical: false, turnRate: 0.7, tint: [1.12, 0.98, 0.85], curious: true },
  hammer: { id: 'hammer', skin: 1, len: [3.0, 4.4], speed: [1.5, 2.4], minDepth: 10, band: [0.2, 0.65], freq: 2.4, amp: 0.085, vertical: false, turnRate: 0.45, tint: [1.0, 0.98, 0.92], curious: true },
  whaleshark: { id: 'whaleshark', skin: 2, len: [8, 11], speed: [0.9, 1.5], minDepth: 14, band: [0.1, 0.4], freq: 1.5, amp: 0.07, vertical: false, turnRate: 0.2, tint: [1, 1, 1], curious: false },
  manta: { id: 'manta', skin: 3, len: [3.2, 5.2], speed: [1.2, 2.0], minDepth: 5, band: [0.2, 0.8], freq: 1.3, amp: 0.2, vertical: true, turnRate: 0.35, tint: [1, 1, 1], curious: false },
};

/** [max animals per species] per quality (0 low, 1 medium, 2 high) and the radius they appear in (m). */
const QUALITY: { reach: number; cap: Record<Species, number> }[] = [
  { reach: 90, cap: { humpback: 0, blue: 0, white: 1, reef: 2, hammer: 0, whaleshark: 0, manta: 1 } },
  { reach: 150, cap: { humpback: 1, blue: 1, white: 1, reef: 3, hammer: 1, whaleshark: 1, manta: 2 } },
  { reach: 210, cap: { humpback: 2, blue: 1, white: 2, reef: 4, hammer: 2, whaleshark: 1, manta: 3 } },
];
const MAXCAP: Record<Species, number> = { humpback: 2, blue: 1, white: 2, reef: 4, hammer: 2, whaleshark: 1, manta: 3 };
const ORDER: Species[] = ['humpback', 'blue', 'white', 'reef', 'hammer', 'whaleshark', 'manta'];

interface Beast {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
  base: number;
  len: number;
  turn: number;
  timer: number;
  yFrac: number;
  circle: number;
  phase: number;
}

// ------------------------------------------------------------------ geometry

function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = merge(parts);
  g.deleteAttribute('uv');
  return g;
}

function whaleGeometry(blue: boolean): THREE.BufferGeometry {
  const k = blue ? 0.8 : 1; // the blue whale is slimmer
  const st: Station[] = [
    { z: 0.5, w: 0.03, h: 0.02, y: -0.012, n: 2.2 },
    { z: 0.47, w: 0.055 * k, h: 0.03, y: -0.012, n: 2.2 },
    { z: 0.42, w: 0.075 * k, h: 0.048, y: -0.008, n: 2.2 },
    { z: 0.34, w: 0.098 * k, h: 0.078, y: 0, n: 2.3 },
    { z: 0.2, w: 0.116 * k, h: 0.1, y: 0.004, n: 2.3 },
    { z: 0.05, w: 0.124 * k, h: 0.108, y: 0.008, n: 2.3 },
    { z: -0.1, w: 0.11 * k, h: 0.098, y: 0.007, n: 2.3 },
    { z: -0.25, w: 0.074 * k, h: 0.068, y: 0.006, n: 2.2 },
    { z: -0.38, w: 0.04 * k, h: 0.044, y: 0.008, n: 2.2 },
    { z: -0.46, w: 0.02, h: 0.03, y: 0.01, n: 2.2 },
    { z: -0.5, w: 0.012, h: 0.02, y: 0.01, n: 2.2 },
  ];
  const parts: THREE.BufferGeometry[] = [loft(smooth(st, 2), { seg: 18, tile: 1, shade: 0.4 })];
  // lower jaw: a little proud under the head
  const jaw: Station[] = [
    { z: 0.47, w: 0.03, h: 0.008, y: -0.022 },
    { z: 0.4, w: 0.07 * k, h: 0.02, y: -0.034 },
    { z: 0.3, w: 0.09 * k, h: 0.026, y: -0.04 },
    { z: 0.22, w: 0.085 * k, h: 0.02, y: -0.04 },
  ];
  parts.push(loft(smooth(jaw, 2), { seg: 12, tile: 1, shade: 0.4 }));
  for (const s of [-1, 1]) {
    // eyes
    parts.push(ball(0.006, 0.006, 0.008, s * 0.092 * k, -0.026, 0.27, 0.05));
    // pectoral flippers (humpback: very long, bumpy leading edge)
    const L = blue ? 0.1 : 0.17;
    parts.push(place(ball(L, 0.013, blue ? 0.024 : 0.034, 0, 0, 0, 1), s * (0.1 * k + L * 0.72), -0.075, 0.13, 0, s * 0.35, -s * 0.42));
    // flukes: two broad, slightly swept lobes with a notch
    parts.push(place(ball(0.1, 0.008, 0.045, 0, 0, 0, 1), s * 0.082, 0.01, -0.505, 0, s * 0.4, -s * 0.05));
  }
  // dorsal fin (small, far back) and the knobby humpback "tubercles" on the head
  parts.push(place(spike(0.008, 0.026, blue ? 0.018 : 0.035, 1, 6), 0, 0.093, -0.23, -0.85));
  if (!blue) for (let i = 0; i < 7; i++) parts.push(ball(0.007, 0.007, 0.007, (i % 2 ? 1 : -1) * 0.012 * (1 + (i >> 1)), 0.044 - (i >> 1) * 0.003, 0.46 - i * 0.03, 1));
  const g = finish(parts);
  return paint(g, (x, _y, _z, _nx, ny) => {
    // back dark slate blue, belly paler (humpback: white throat, blue whale: grey-blue all round)
    const back = sstep(-0.65, 0.1, ny);
    const base: [number, number, number] = blue ? [0.2, 0.27, 0.36] : [0.12, 0.15, 0.2];
    const belly: [number, number, number] = blue ? [0.45, 0.52, 0.58] : [0.78, 0.8, 0.82];
    const flipper = Math.abs(x) > 0.16 * k;
    const underside = flipper ? sstep(0.0, -0.4, ny) * (blue ? 0.3 : 0.95) : 0;
    const r = mix(belly[0], base[0], back);
    const gg = mix(belly[1], base[1], back);
    const b = mix(belly[2], base[2], back);
    const t = Math.max(underside, 0);
    return [mix(r, 0.88, t), mix(gg, 0.9, t), mix(b, 0.92, t)];
  });
}

function sharkGeometry(kind: 'white' | 'reef' | 'hammer' | 'whaleshark'): THREE.BufferGeometry {
  const ws = kind === 'whaleshark';
  const st: Station[] = ws
    ? [
        { z: 0.5, w: 0.07, h: 0.018, y: -0.012, n: 2.6 },
        { z: 0.46, w: 0.1, h: 0.04, y: -0.008, n: 2.5 },
        { z: 0.38, w: 0.115, h: 0.07, y: 0, n: 2.4 },
        { z: 0.2, w: 0.125, h: 0.1, y: 0.004, n: 2.4 },
        { z: 0.0, w: 0.118, h: 0.108, y: 0.006, n: 2.4 },
        { z: -0.2, w: 0.082, h: 0.085, y: 0.005, n: 2.3 },
        { z: -0.34, w: 0.046, h: 0.052, y: 0.006, n: 2.2 },
        { z: -0.44, w: 0.026, h: 0.032, y: 0.008, n: 2.2 },
      ]
    : [
        { z: 0.5, w: 0.02, h: 0.024, y: -0.008, n: 2.2 },
        { z: 0.45, w: 0.058, h: 0.05, y: -0.01, n: 2.2 },
        { z: 0.36, w: 0.092, h: 0.088, y: -0.002, n: 2.2 },
        { z: 0.15, w: 0.118, h: 0.126, y: 0.008, n: 2.2 },
        { z: -0.02, w: 0.112, h: 0.124, y: 0.01, n: 2.2 },
        { z: -0.16, w: 0.08, h: 0.094, y: 0.008, n: 2.2 },
        { z: -0.3, w: 0.045, h: 0.058, y: 0.006, n: 2.2 },
        { z: -0.4, w: 0.028, h: 0.034, y: 0.006, n: 2.2 },
        { z: -0.46, w: 0.02, h: 0.024, y: 0.008, n: 2.2 },
      ];
  const parts: THREE.BufferGeometry[] = [loft(smooth(st, 2), { seg: 16, tile: 1, shade: 0.5 })];
  const sc = ws ? 1.15 : 1.25;
  // tail: long upper lobe, shorter lower lobe (heterocercal)
  parts.push(place(spike(0.012, 0.055 * sc, 0.2 * sc, 0.8, 4), 0, 0.0, -0.45, -0.75));
  parts.push(place(spike(0.01, 0.04 * sc, 0.1 * sc, 0.8, 4), 0, -0.012, -0.45, Math.PI + 0.6));
  // first dorsal (tall, swept), second dorsal, anal fin
  const df = ws ? 0.07 : kind === 'hammer' ? 0.17 : 0.14;
  parts.push(place(spike(0.011, 0.07, df * 1.45, kind === 'reef' ? 1.0 : 0.8, 4), 0, ws ? 0.09 : 0.105, ws ? 0.1 : 0.16, -0.42));
  parts.push(place(spike(0.006, 0.026, 0.06, 0.8, 4), 0, 0.09, -0.25, -0.5));
  parts.push(place(spike(0.006, 0.026, 0.055, 0.8, 4), 0, -0.09, -0.25, Math.PI + 0.5));
  // pectoral fins: big wings swept back; pelvic fins smaller
  for (const s of [-1, 1]) {
    parts.push(place(ball(0.16 * (ws ? 0.8 : 1), 0.009, 0.075, 0, 0, 0, 0.82), s * (0.09 + 0.1), ws ? -0.065 : -0.075, 0.2, 0, s * 0.5, -s * 0.4));
    parts.push(place(ball(0.05, 0.005, 0.035, 0, 0, 0, 0.82), s * 0.07, -0.1, -0.08, 0, s * 0.3, -s * 0.25));
    parts.push(ball(0.006, 0.007, 0.01, s * (ws ? 0.1 : 0.074), ws ? 0.01 : 0.025, ws ? 0.43 : 0.4, 0.02));
  }
  if (kind === 'hammer') {
    // the "hammer": a wide flat head, eyes at its ends
    parts.push(ball(0.215, 0.014, 0.05, 0, -0.005, 0.46, 0.72));
    for (const s of [-1, 1]) parts.push(ball(0.012, 0.012, 0.014, s * 0.2, 0.002, 0.462, 0.02));
  }
  const g = finish(parts);
  return paint(g, (x, y, _z, _nx, ny) => {
    if (ws) {
      // dark blue-grey back and flanks, pale belly
      const back = sstep(-0.55, 0.0, ny);
      return [mix(0.82, 0.2, back), mix(0.84, 0.28, back), mix(0.84, 0.34, back)];
    }
    // counter-shading with a fairly sharp line (the great white's famous "waterline")
    const back = sstep(-0.22, 0.05, ny);
    let c: [number, number, number] = [mix(0.9, 0.34, back), mix(0.92, 0.4, back), mix(0.92, 0.45, back)];
    // fin tips: darker on the white shark, pale tips on the reef shark
    if (kind === 'reef' && y > 0.2) c = [0.95, 0.95, 0.95];
    if (kind !== 'reef' && Math.abs(y) < 0.4 && Math.abs(x) > 0.2) c = [c[0] * 0.8, c[1] * 0.8, c[2] * 0.82];
    return c;
  });
}

function mantaGeometry(): THREE.BufferGeometry {
  // a flat diamond: a squashed sphere, wing tips swept back, two cephalic horns, a thin tail
  const body = new THREE.SphereGeometry(0.5, 28, 14);
  body.scale(1.9, 0.12, 1.0);
  const pos = body.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(x);
    // wing tips sweep back, the leading edge arcs, the body is thick in the middle and thin at the tips
    const sweep = -ax * ax * 0.42;
    const thick = Math.exp(-ax * ax * 2.2) * 0.9 + 0.1;
    pos.setXYZ(i, x * 0.5, y * thick, z * 0.62 * (1 - 0.45 * ax / 0.95) + sweep + 0.04);
  }
  body.computeVertexNormals();
  const flat = body.toNonIndexed();
  body.dispose();
  flat.deleteAttribute('uv');
  const parts: THREE.BufferGeometry[] = [];
  const colored = paint(flat, (x, _y, z, _nx, ny) => {
    const top = sstep(-0.1, 0.25, ny);
    // dorsal: near-black with two pale shoulder patches; ventral: white with soft grey rim
    const shoulder = sstep(0.07, 0.03, Math.abs(Math.abs(x) - 0.13)) * sstep(0.06, 0.16, z) * sstep(0.36, 0.2, z) * 0.75;
    const dark = 0.06 + 0.1 * sstep(0.2, 0.5, Math.abs(x));
    const dr = mix(dark, 0.9, shoulder);
    const rim = sstep(0.3, 0.48, Math.abs(x));
    return [mix(mix(0.92, 0.55, rim), dr, top), mix(mix(0.93, 0.58, rim), dr * 1.02, top), mix(mix(0.94, 0.62, rim), dr * 1.08, top)];
  });
  parts.push(colored.index ? colored.toNonIndexed() : colored);
  const mk = (g: THREE.BufferGeometry, c: number): THREE.BufferGeometry => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    const col = new Float32Array(n * 3).fill(c);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  };
  for (const s of [-1, 1]) {
    // cephalic fins (the "horns" that funnel plankton)
    const h = new THREE.ConeGeometry(0.018, 0.14, 6);
    h.rotateX(Math.PI / 2);
    h.translate(s * 0.06, 0, 0.4);
    parts.push(mk(h, 0.12));
    const eye = new THREE.SphereGeometry(0.01, 6, 5);
    eye.translate(s * 0.11, 0.012, 0.22);
    parts.push(mk(eye, 0.02));
  }
  const tail = new THREE.CylinderGeometry(0.016, 0.003, 0.9, 6, 1);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -0.72);
  parts.push(mk(tail, 0.08));
  const out = mergeSameAttr(parts);
  return out;
}

function mergeSameAttr(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // all parts: position, normal, color (non-indexed)
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position');
    const b = p.getAttribute('normal');
    const c = p.getAttribute('color');
    for (let i = 0; i < a.count; i++) {
      pos.set([a.getX(i), a.getY(i), a.getZ(i)], (o + i) * 3);
      nor.set([b.getX(i), b.getY(i), b.getZ(i)], (o + i) * 3);
      col.set([c.getX(i), c.getY(i), c.getZ(i)], (o + i) * 3);
    }
    o += a.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ material

/**
 * skin 0 whale: belly pleats, mottled grey-blue, pale scars / barnacle patches
 * skin 1 shark: gill slits
 * skin 2 whale shark: white spots + pale stripes on the back, gill slits
 * skin 3 manta: faint underside spots
 */
function skinMaterial(def: Def, uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.skin === 3 ? 0.55 : 0.5, metalness: 0.05, side: THREE.DoubleSide });
  const axis = def.vertical ? 'y' : 'x';
  const mantaFlap = def.skin === 3;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uFreq = { value: def.freq };
    sh.uniforms.uAmp = { value: def.amp };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFreq;\nuniform float uAmp;\nvarying vec3 vLoc;\nvarying vec3 vObjN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLoc = position;
        vObjN = normal;
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
        ${
          mantaFlap
            ? `float wing = smoothstep(0.03, 0.45, abs(position.x));
               transformed.y += sin(uTime * uFreq * 3.0 + ph - abs(position.x) * 5.0) * uAmp * wing * 0.55;
               float tl = smoothstep(-0.4, -1.1, position.z);
               transformed.x += sin(uTime * 2.0 + ph + position.z * 6.0) * 0.05 * tl;`
            : `float tailW = smoothstep(0.25, -0.5, position.z);
               tailW = tailW * tailW;
               float wave = sin(uTime * uFreq * 3.0 + ph - position.z * 6.5) * uAmp * tailW;
               transformed.${axis} += wave;
               // the head swings a little against the tail
               transformed.${axis} -= sin(uTime * uFreq * 3.0 + ph - 1.6) * uAmp * 0.18 * smoothstep(0.1, 0.5, position.z);`
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc;\nvarying vec3 vObjN;\nfloat h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\nfloat vn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.22 * smoothstep(0.1, -0.7, vObjN.y);`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float n1 = vn(vLoc * vec3(22.0, 30.0, 14.0));
          float n2 = vn(vLoc * vec3(70.0, 90.0, 50.0));
          ${
            def.skin === 0
              ? `// mottled skin + pale scars, belly pleats running along the body
                 diffuseColor.rgb *= 0.86 + 0.28 * n1;
                 float scar = smoothstep(0.72, 0.8, n2) * smoothstep(-0.2, 0.3, vObjN.y);
                 diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.9 + 0.05, scar * 0.55);
                 float belly = smoothstep(-0.15, -0.6, vObjN.y) * smoothstep(0.42, 0.22, vLoc.z) * smoothstep(-0.25, 0.0, vLoc.z);
                 diffuseColor.rgb *= 1.0 - belly * 0.16 * (0.5 + 0.5 * sin(vLoc.x * 260.0));
                 float head = smoothstep(0.34, 0.44, vLoc.z) * smoothstep(-0.5, 0.2, vObjN.y);
                 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.55), head * smoothstep(0.7, 0.9, n2) * 0.7);`
              : def.skin === 1
                ? `diffuseColor.rgb *= 0.94 + 0.12 * n1;
                   float gz = (vLoc.z - 0.2) / 0.012;
                   float gl = step(0.0, gz) * step(gz, 5.0) * smoothstep(0.12, 0.03, abs(fract(gz) - 0.5)) * smoothstep(0.04, 0.09, abs(vLoc.x)) * step(abs(vLoc.y), 0.1);
                   diffuseColor.rgb *= 1.0 - 0.6 * gl;`
                : def.skin === 2
                  ? `float dorsal = smoothstep(-0.35, 0.05, vObjN.y);
                     vec3 q = vLoc * vec3(34.0, 34.0, 26.0);
                     vec3 id = floor(q);
                     vec3 lc = fract(q) - 0.5;
                     float r = h31(id);
                     float spot = step(0.18, r) * smoothstep(0.36, 0.24, length(lc));
                     // pale stripes between the spots (checkerboard-like lines of the real animal)
                     float line = smoothstep(0.05, 0.0, abs(fract(vLoc.y * 26.0 + sin(vLoc.z * 14.0) * 0.15) - 0.5) - 0.45) * 0.28;
                     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.9), clamp(spot + line, 0.0, 1.0) * dorsal * smoothstep(-0.42, -0.3, vLoc.z) * 0.9);
                     diffuseColor.rgb *= 0.92 + 0.14 * n1;
                     float gz2 = (vLoc.z - 0.3) / 0.016;
                     float gl2 = step(0.0, gz2) * step(gz2, 5.0) * smoothstep(0.12, 0.03, abs(fract(gz2) - 0.5)) * smoothstep(0.06, 0.1, abs(vLoc.x)) * step(abs(vLoc.y), 0.1);
                     diffuseColor.rgb *= 1.0 - 0.5 * gl2;`
                  : `// manta: faint dark blotches on the white underside, a pale rim
                     float under = smoothstep(0.05, -0.3, vObjN.y);
                     float bl = smoothstep(0.7, 0.78, vn(vLoc * vec3(18.0, 18.0, 18.0)));
                     diffuseColor.rgb *= 1.0 - bl * under * 0.45;`
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => `evc-big-${def.id}-v1`;
  return m;
}

// ------------------------------------------------------------------ the system

export class BigMarine {
  private meshes = {} as Record<Species, THREE.InstancedMesh>;
  private mats = [] as THREE.Material[];
  private geos = [] as THREE.BufferGeometry[];
  private beasts = {} as Record<Species, Beast[]>;
  private uTime = { value: 0 };
  private quality = 1;
  private spawnTimer = 0;
  private sc: TerrainSample;
  private s2: TerrainSample;
  private dummy = new THREE.Object3D();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private col = new THREE.Color();
  private seq = 1;
  private spot = { x: 0, z: 0, h: 0, water: 0 };

  constructor(
    root: THREE.Object3D,
    private terrain: TerrainGenerator,
  ) {
    this.sc = terrain.makeSample();
    this.s2 = terrain.makeSample();
    this.dummy.rotation.order = 'YXZ';
    const geoOf = (id: Species): THREE.BufferGeometry => {
      switch (id) {
        case 'humpback': return whaleGeometry(false);
        case 'blue': return whaleGeometry(true);
        case 'white': return sharkGeometry('white');
        case 'reef': return sharkGeometry('reef');
        case 'hammer': return sharkGeometry('hammer');
        case 'whaleshark': return sharkGeometry('whaleshark');
        case 'manta': return mantaGeometry();
      }
    };
    for (const id of ORDER) {
      const def = DEFS[id];
      const geo = geoOf(id);
      const mat = skinMaterial(def, this.uTime);
      const mesh = new THREE.InstancedMesh(geo, mat, MAXCAP[id]);
      mesh.frustumCulled = false;
      mesh.name = `sea-${id}`;
      const list: Beast[] = [];
      for (let i = 0; i < MAXCAP[id]; i++) {
        mesh.setMatrixAt(i, this.zero);
        mesh.setColorAt(i, this.col.setRGB(def.tint[0], def.tint[1], def.tint[2]));
        list.push({ alive: false, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, speed: 1, base: 1, len: 5, turn: 0, timer: 0, yFrac: 0.5, circle: 0, phase: 0 });
      }
      root.add(mesh);
      this.meshes[id] = mesh;
      this.beasts[id] = list;
      this.mats.push(mat);
      this.geos.push(geo);
    }
    this.setQuality(1);
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    for (const id of ORDER) {
      const cap = QUALITY[this.quality].cap[id];
      for (let i = cap; i < MAXCAP[id]; i++) this.kill(id, i);
    }
  }

  private kill(id: Species, i: number): void {
    this.beasts[id][i].alive = false;
    this.meshes[id].setMatrixAt(i, this.zero);
    this.meshes[id].instanceMatrix.needsUpdate = true;
  }

  private rnd(): number {
    return hash2(this.seq++, 9137, 71);
  }
  private r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  private findWater(cx: number, cz: number, minR: number, maxR: number, minDepth: number): boolean {
    for (let a = 0; a < 7; a++) {
      const ang = this.rnd() * Math.PI * 2;
      const d = minR + this.rnd() * (maxR - minR);
      const x = cx + Math.cos(ang) * d;
      const z = cz + Math.sin(ang) * d;
      if (Math.abs(x) > 4900 || Math.abs(z) > 4900) continue;
      this.terrain.sample(x, z, this.s2);
      if (Number.isNaN(this.s2.water) || this.s2.water - this.s2.h < minDepth) continue;
      this.spot.x = x;
      this.spot.z = z;
      this.spot.h = this.s2.h;
      this.spot.water = this.s2.water;
      return true;
    }
    return false;
  }

  private spawn(id: Species, i: number, cam: THREE.Vector3, reach: number): void {
    const def = DEFS[id];
    const len = this.r(def.len[0], def.len[1]);
    // far enough that you see it arrive, near enough that it passes by
    const minR = Math.min(reach * 0.45, 28 + len * 2.2);
    if (!this.findWater(cam.x, cam.z, minR, reach, def.minDepth + len * 0.35)) return;
    const b = this.beasts[id][i];
    const sp = this.spot;
    b.alive = true;
    b.len = len;
    b.x = sp.x;
    b.z = sp.z;
    // head roughly towards the camera, passing it at 10-40 m
    const toCam = Math.atan2(cam.x - sp.x, cam.z - sp.z);
    b.heading = toCam + this.r(-0.5, 0.5);
    b.base = this.r(def.speed[0], def.speed[1]);
    b.speed = b.base;
    b.turn = 0;
    b.timer = this.r(4, 10);
    b.pitch = 0;
    b.roll = 0;
    b.circle = 0;
    b.phase = this.rnd() * 6.28;
    b.yFrac = this.r(def.band[0], def.band[1]);
    const depth = sp.water - sp.h;
    b.y = sp.water - Math.max(len * 0.35 + 1, depth * b.yFrac);
    const t = 0.92 + this.rnd() * 0.16;
    this.meshes[id].setColorAt(i, this.col.setRGB(def.tint[0] * t, def.tint[1] * t, def.tint[2] * t));
    if (this.meshes[id].instanceColor) this.meshes[id].instanceColor!.needsUpdate = true;
  }

  update(dt: number, time: number, cam: THREE.Vector3, focus: THREE.Vector3): void {
    this.uTime.value = time;
    dt = Math.min(dt, 0.05);
    const Q = QUALITY[this.quality];
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.9;
      let tries = 1;
      for (const id of ORDER) {
        for (let i = 0; i < Q.cap[id] && tries > 0; i++) {
          if (!this.beasts[id][i].alive) {
            this.spawn(id, i, cam, Q.reach);
            tries--;
          }
        }
      }
    }
    for (const id of ORDER) this.step(id, dt, time, cam, focus, Q.reach);
  }

  private step(id: Species, dt: number, time: number, cam: THREE.Vector3, focus: THREE.Vector3, reach: number): void {
    const def = DEFS[id];
    const list = this.beasts[id];
    const mesh = this.meshes[id];
    const d = this.dummy;
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.alive) continue;
      any = true;
      if (Math.hypot(b.x - cam.x, b.z - cam.z) > reach + 60 + b.len) {
        this.kill(id, i);
        continue;
      }
      // wander: a slow change of course
      b.timer -= dt;
      if (b.timer <= 0) {
        b.timer = this.r(5, 14);
        b.turn = this.r(-1, 1) * def.turnRate * 0.5;
      }
      // curious sharks circle a swimmer at a respectful distance (no attack: the game has no shark bites)
      const dx = focus.x - b.x;
      const dz = focus.z - b.z;
      const dist = Math.hypot(dx, dz);
      const R = 11 + b.len * 2.4;
      if (def.curious && dist < R * 2.6) {
        b.circle = Math.min(1, b.circle + dt * 0.5);
        const toward = Math.atan2(dx, dz);
        const side = i % 2 ? 1 : -1;
        // tangent heading, bent inwards when too far, outwards when too close
        const bend = Math.max(-0.9, Math.min(0.9, (dist - R) / R));
        const want = toward + side * (Math.PI / 2 - bend * 0.9);
        let diff = want - b.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        b.heading += diff * Math.min(1, dt * 0.9) * b.circle;
        b.speed += (b.base * 1.15 - b.speed) * Math.min(1, dt);
      } else {
        b.circle = Math.max(0, b.circle - dt * 0.4);
        b.heading += b.turn * dt;
        b.speed += (b.base - b.speed) * Math.min(1, dt * 0.5);
      }
      // keep to deep enough water: look ahead and bend away from the shore
      const ahead = 14 + b.len * 2.2;
      this.terrain.sample(b.x + Math.sin(b.heading) * ahead, b.z + Math.cos(b.heading) * ahead, this.sc);
      const need = def.minDepth * 0.7 + b.len * 0.25;
      if (Number.isNaN(this.sc.water) || this.sc.water - this.sc.h < need) {
        // turn towards whichever side has deeper water
        const side = Math.sin(time * 0.3 + b.phase) > 0 ? 1 : -1;
        b.heading += side * def.turnRate * 1.6 * dt + 0.2 * dt * side;
        b.speed = Math.max(b.base * 0.6, b.speed * 0.995);
      }
      const prevX = b.x;
      const prevZ = b.z;
      b.x += Math.sin(b.heading) * b.speed * dt;
      b.z += Math.cos(b.heading) * b.speed * dt;
      this.terrain.sample(b.x, b.z, this.s2);
      let wantY = b.y;
      if (!Number.isNaN(this.s2.water)) {
        const depth = this.s2.water - this.s2.h;
        const margin = Math.max(1.5, b.len * (id === 'manta' ? 0.25 : 0.4));
        const bandY = this.s2.water - depth * (b.yFrac + 0.08 * Math.sin(time * 0.07 + b.phase));
        wantY = Math.max(this.s2.h + margin, Math.min(this.s2.water - margin, bandY));
        // sharks drift up towards a diver's depth when circling
        if (def.curious && b.circle > 0.3) wantY += (focus.y + 1.5 - wantY) * 0.4 * b.circle;
        wantY = Math.max(this.s2.h + margin, Math.min(this.s2.water - margin, wantY));
      }
      const climb = (wantY - b.y) * Math.min(1, dt * 0.35);
      b.y += climb;
      const hv = Math.max(0.001, Math.hypot(b.x - prevX, b.z - prevZ) / Math.max(dt, 0.0001));
      b.pitch += (Math.atan2(climb / Math.max(dt, 0.0001), hv) - b.pitch) * Math.min(1, dt * 1.5);
      // banking into turns
      const turnNow = b.circle > 0.1 ? 0.35 * (i % 2 ? -1 : 1) : b.turn;
      b.roll += (-Math.max(-0.5, Math.min(0.5, turnNow * 1.4)) - b.roll) * Math.min(1, dt * 1.2);
      d.position.set(b.x, b.y, b.z);
      d.rotation.set(-Math.max(-0.45, Math.min(0.45, b.pitch)), b.heading, b.roll);
      // manta: wings are wide, so its model is scaled by wingspan (x) = len and length (z) = len * 0.9
      if (id === 'manta') d.scale.set(b.len, b.len, b.len);
      else d.scale.setScalar(b.len);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  }

  get stats(): Record<Species, number> {
    const o = {} as Record<Species, number>;
    for (const id of ORDER) o[id] = this.beasts[id].filter((b) => b.alive).length;
    return o;
  }

  dispose(): void {
    for (const id of ORDER) {
      this.meshes[id].removeFromParent();
      this.meshes[id].dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
