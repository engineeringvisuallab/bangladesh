import * as THREE from 'three';
import { Config } from '../core/Config';
import { mulberry32 } from '../world/Seed';
import { TREE_KIND_COUNT, TreeKind } from './TreeTypes';

/**
 * Tree models (built from code, no files) + the shared tree material.
 *
 * REALISTIC TREES: every model is ONE geometry (a whole forest is a handful of draw calls) made of
 *   - tapered, slightly bent trunks with a root flare, plus branches (tubes with a bark texture), and
 *   - a crown of many LEAF CARDS: small quads that carry a painted cluster of real-looking leaves (alpha cut-out), oriented
 *     randomly inside an ellipsoid. Their shading normals point away from the crown centre, so the whole crown is lit like one
 *     soft, round mass (bright on top, dark underneath) instead of hundreds of flat squares.
 * One painted texture atlas (a strip of 5 tiles, made on a canvas at start-up, no files): 0 bark, 1 ovate-leaf sprays, 2 needles,
 *   3 lobed-leaf sprays, 4 dense leaf mass (far LOD). Every leaf is painted individually (shape, veins, serrated rim, petiole).
 * Two detail levels per kind: 0 = near (LOD0 chunks), 1 = far (LOD1 chunks).
 * Kinds (TreeTypes): broadleaf = round-crowned shade tree, pine = layered conifer (high ground),
 *   palm = tall slender tree with a wide flat crown (the savanna tree of the reference picture; the old umbrella "palm" is gone).
 */

const TILES = 5;
/** Pixel size of one atlas tile: 800 -> the whole atlas is 4000 x 800 (4K wide, still inside every GPU's texture limit). The painters draw in a logical 512 space scaled by K. */
const TILE = 800;
const LS = 512;
const K = TILE / LS;
const TILE_BARK = 0;
const TILE_LEAF = 1;
const TILE_NEEDLE = 2;
const TILE_LOBED = 3;
const TILE_MASS = 4;

// ---------------------------------------------------------------------------------------------------------------------
// texture atlas (canvas, painted once)
// ---------------------------------------------------------------------------------------------------------------------

function paintBark(c: CanvasRenderingContext2D, tile: number): void {
  const x0 = tile * LS;
  const r = mulberry32(777);
  c.save();
  c.scale(K, K);
  c.beginPath();
  c.rect(x0, 0, LS, LS);
  c.clip();
  c.fillStyle = '#5e4630';
  c.fillRect(x0, 0, LS, LS);
  // vertical fibres, wrapped sideways so the tile has no seam around the trunk
  for (let i = 0; i < 900; i++) {
    const x = r() * LS;
    const y = r() * LS;
    const w = 2 + r() * 9;
    const len = 50 + r() * 260;
    const l = 22 + r() * 26;
    c.fillStyle = `hsla(${24 + r() * 10}, ${26 + r() * 14}%, ${l}%, ${0.35 + r() * 0.4})`;
    for (const dx of [0, -LS, LS]) c.fillRect(x0 + x + dx, y - len / 2, w, len);
  }
  // dark cracks
  c.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    let x = r() * LS;
    let y = r() * LS;
    const len = 40 + r() * 200;
    c.strokeStyle = `rgba(25,16,9,${0.35 + r() * 0.4})`;
    c.lineWidth = 1.5 + r() * 3;
    for (const dx of [0, -LS, LS]) {
      c.beginPath();
      c.moveTo(x0 + x + dx, y);
      let cx = x;
      for (let s = 0; s < 6; s++) {
        cx += (r() - 0.5) * 14;
        c.lineTo(x0 + cx + dx, y + (len / 6) * (s + 1));
      }
      c.stroke();
    }
    x += 0;
    y += 0;
  }
  // light patches (moss / dry bark)
  for (let i = 0; i < 60; i++) {
    const x = r() * LS;
    const y = r() * LS;
    c.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 30},${105 + r() * 25},0.10)`;
    for (const dx of [0, -LS, LS]) {
      c.beginPath();
      c.ellipse(x0 + x + dx, y, 6 + r() * 22, 20 + r() * 50, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${h.toFixed(1)}, ${Math.max(0, s).toFixed(1)}%, ${Math.min(96, Math.max(3, l)).toFixed(1)}%, ${a})`;

/** Half-width of an ovate leaf (0..1) at fraction t along its length: rounded base, widest near 40 %, drawn-out pointed tip. */
const ovate = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.82) * (1 - 0.3 * t);

interface LeafLook {
  hue: number;
  sat: number;
  light: number;
  /** sideways bend of the blade (fraction of its length at the tip) */
  curl: number;
  /** 0 = smooth edge, 1 = fine saw teeth */
  serrate: number;
}

/** Outline of one ovate leaf lying along +x (base at the origin, tip at x = len), with an optional serrated edge. */
function ovatePath(c: CanvasRenderingContext2D, len: number, wid: number, curl: number, serrate: number): void {
  const N = 30;
  c.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k <= N; k++) {
      const i = side < 0 ? k : N - k;
      const t = i / N;
      const tooth = serrate > 0 ? serrate * wid * 0.075 * ((t * 16) % 1) * Math.sin(Math.PI * t) : 0;
      const w = wid * ovate(t) + tooth;
      const x = t * len;
      const y = curl * len * t * t + side * w;
      if (side < 0 && k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }
  c.closePath();
}

/** One painted ovate leaf (shaded blade, darker rim, midrib, lateral veins, petiole) at (x, y) pointing along `ang`. */
function drawOvateLeaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, look: LeafLook, veins: boolean): void {
  const { hue, sat, light, curl, serrate } = look;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, hsl(hue + 3, sat, light + 8));
  g.addColorStop(1, hsl(hue - 2, sat + 4, light - 7));
  c.fillStyle = g;
  ovatePath(c, len, wid, curl, serrate);
  c.fill();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = hsl(hue - 6, sat, light - 15, 0.55);
  c.lineWidth = Math.max(0.8, len * 0.014);
  c.stroke();
  if (veins) {
    c.strokeStyle = hsl(hue + 10, sat - 12, light + 13, 0.5);
    c.lineWidth = Math.max(0.6, len * 0.011);
    for (let i = 0; i < 6; i++) {
      const t = 0.1 + i * 0.135;
      const t2 = Math.min(0.97, t + 0.17);
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.moveTo(t * len, curl * len * t * t);
        c.lineTo(t2 * len, curl * len * t2 * t2 + sd * wid * ovate(t2) * 0.78);
        c.stroke();
      }
    }
  }
  c.strokeStyle = hsl(hue + 14, sat - 16, light + 17, 0.85);
  c.lineWidth = Math.max(1, len * 0.024);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.48, 0, len * 0.96, curl * len * 0.92);
  c.stroke();
  // petiole (leaf stalk)
  c.strokeStyle = hsl(hue - 20, sat - 8, light - 4, 1);
  c.lineWidth = Math.max(1.4, len * 0.03);
  c.beginPath();
  c.moveTo(-len * 0.22, 0);
  c.lineTo(len * 0.04, 0);
  c.stroke();
  c.restore();
}

/** Radius (0..1) of a five-lobed palmate leaf (fig / oak / maple family) in direction `a` from the leaf base: deep notches between lobes. */
const lobeR = (a: number): number => {
  const u = Math.abs((2.5 * a) / Math.PI);
  const tri = 1 - 2 * Math.abs(u - Math.round(u)); // 1 at every lobe tip, 0 in every notch
  return (0.4 + 0.6 * Math.pow(Math.max(0, tri), 0.85)) * (1 - (0.28 * Math.abs(a)) / 2.5) * (1 + 0.02 * Math.sin(a * 37));
};
const LOBE_TIPS = [0, 1.2566, -1.2566, 2.5133, -2.5133];

/** One painted lobed leaf (base at the origin, middle lobe along +x), with a vein running into every lobe. */
function drawLobedLeaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, look: LeafLook): void {
  const { hue, sat, light } = look;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -len * 0.9, 0, len * 0.9);
  g.addColorStop(0, hsl(hue + 3, sat, light + 8));
  g.addColorStop(1, hsl(hue - 2, sat + 4, light - 7));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = -2.5 + (5 * i) / N;
    const r = len * lobeR(a);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = hsl(hue - 6, sat, light - 15, 0.55);
  c.lineWidth = Math.max(0.9, len * 0.012);
  c.stroke();
  c.strokeStyle = hsl(hue + 12, sat - 14, light + 15, 0.8);
  for (const a of LOBE_TIPS) {
    c.lineWidth = Math.max(1, len * (a === 0 ? 0.024 : 0.017));
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * len * lobeR(a) * 0.86, Math.sin(a) * len * lobeR(a) * 0.86);
    c.stroke();
  }
  c.strokeStyle = hsl(hue - 20, sat - 8, light - 4, 1);
  c.lineWidth = Math.max(1.6, len * 0.03);
  c.beginPath();
  c.moveTo(-len * 0.3, 0);
  c.lineTo(len * 0.04, 0);
  c.stroke();
  c.restore();
}

/**
 * A tile that holds ONE LEAF SPRAY: a few twigs that carry individual leaves (alternate along the stem, a terminal leaf at the tip).
 * The gaps between the leaves are transparent, so the crown shows layers, light and the branch skeleton instead of a solid green mass.
 * Leaf cards are aimed so that the tips of the sprays point away from the crown centre (see Mesh.card).
 */
function paintSprays(c: CanvasRenderingContext2D, tile: number, lobed: boolean, seed: number): void {
  const r = mulberry32(seed);
  c.save();
  c.scale(K, K);
  c.translate(tile * LS, 0);
  c.beginPath();
  c.rect(0, 0, LS, LS);
  c.clip();
  const margin = LS * (lobed ? 0.15 : 0.1);
  interface Leaf { x: number; y: number; ang: number; len: number; look: LeafLook }
  const leaves: Leaf[] = [];
  const baseLen = lobed ? 78 : 84;
  // a twig: curved stem with leaves on alternate sides; side twigs grow out of the first level
  const twig = (sx: number, sy: number, ang0: number, L: number, n: number, depth: number): void => {
    const steps = 24;
    const bend = (r() - 0.5) * 0.9;
    const px: number[] = [sx];
    const py: number[] = [sy];
    const pa: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = ang0 + bend * (i / steps);
      pa.push(a);
      px.push(px[i] + Math.cos(a) * (L / steps));
      py.push(py[i] + Math.sin(a) * (L / steps));
    }
    pa.push(pa[steps - 1]);
    c.lineCap = 'round';
    for (let i = 0; i < steps; i++) {
      c.strokeStyle = '#4a3920';
      c.lineWidth = (depth === 0 ? 3.6 : 2.4) * (1 - 0.55 * (i / steps));
      c.beginPath();
      c.moveTo(px[i], py[i]);
      c.lineTo(px[i + 1], py[i + 1]);
      c.stroke();
    }
    const at = (t: number): { x: number; y: number; a: number } => {
      const f = Math.min(0.999, t) * steps;
      const i = Math.floor(f);
      const k = f - i;
      return { x: px[i] + (px[i + 1] - px[i]) * k, y: py[i] + (py[i + 1] - py[i]) * k, a: pa[i] };
    };
    for (let i = 0; i <= n; i++) {
      const t = i === n ? 1 : 0.16 + (0.84 * i) / n;
      const p = at(t);
      const side = i % 2 === 0 ? 1 : -1;
      const terminal = i === n;
      const len = baseLen * (1.05 - 0.3 * t) * (0.9 + 0.2 * r()) * (depth > 0 ? 0.88 : 1) * (terminal ? 1.05 : 1);
      const ang = terminal ? p.a + (r() - 0.5) * 0.3 : p.a + side * (0.8 + r() * 0.45);
      const look: LeafLook = {
        hue: (lobed ? 104 : 100) + (r() - 0.5) * 20,
        sat: 46 + r() * 12,
        light: 24 + r() * 14 + t * 6 - (depth > 0 ? 0 : (1 - t) * 4),
        curl: (r() - 0.5) * 0.22,
        serrate: lobed ? 0 : 0.6 + r() * 0.5,
      };
      if (p.x > margin && p.x < LS - margin && p.y > margin && p.y < LS - margin) leaves.push({ x: p.x, y: p.y, ang, len, look });
    }
    if (depth === 0) {
      for (const t of [0.34, 0.58]) {
        const p = at(t);
        const side = r() < 0.5 ? 1 : -1;
        twig(p.x, p.y, p.a + side * (0.7 + r() * 0.3), L * (0.42 + r() * 0.12), Math.max(2, Math.round(n * 0.42)), 1);
      }
    }
  };
  const stems = lobed ? 3 : 4;
  for (let s = 0; s < stems; s++) {
    const spread = s / (stems - 1) - 0.5;
    twig(
      LS * 0.5 + spread * LS * 0.3 + (r() - 0.5) * 18,
      LS * 0.94,
      -Math.PI / 2 + spread * 1.0 + (r() - 0.5) * 0.2,
      LS * (0.7 + r() * 0.12),
      lobed ? 6 : 7,
      0,
    );
  }
  for (const lf of leaves) {
    if (lobed) drawLobedLeaf(c, lf.x, lf.y, lf.ang, lf.len, lf.look);
    else drawOvateLeaf(c, lf.x, lf.y, lf.ang, lf.len, lf.len * 0.27, lf.look, true);
  }
  c.restore();
}

/** The dense far-LOD tile: a disc of many small leaves (distant crowns read as a soft green mass, with the same colours as the sprays). */
function paintMass(c: CanvasRenderingContext2D, tile: number, seed: number): void {
  const r = mulberry32(seed);
  c.save();
  c.scale(K, K);
  c.translate(tile * LS, 0);
  c.beginPath();
  c.rect(0, 0, LS, LS);
  c.clip();
  const cx = LS / 2;
  const cy = LS / 2;
  const R = LS * 0.44;
  const layers = [
    { n: 360, h: 104, s: 48, l: 22 },
    { n: 420, h: 98, s: 54, l: 32 },
    { n: 380, h: 92, s: 56, l: 42 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const rr = (R - 30) * Math.sqrt(r());
      const ang = r() * Math.PI * 2;
      const len = 40 + r() * 22;
      drawOvateLeaf(
        c,
        cx + Math.cos(ang) * rr,
        cy + Math.sin(ang) * rr,
        ang + (r() - 0.5) * 1.8,
        len,
        len * 0.3,
        { hue: L.h + (r() - 0.5) * 18, sat: L.s, light: L.l + (r() - 0.5) * 8, curl: 0, serrate: 0 },
        false,
      );
    }
  }
  c.restore();
}

function paintNeedles(c: CanvasRenderingContext2D, tile: number): void {
  const x0 = tile * LS;
  const r = mulberry32(31337);
  const cx = x0 + LS / 2;
  const cy = LS / 2;
  const R = LS * 0.45;
  c.save();
  c.scale(K, K);
  c.beginPath();
  c.rect(x0, 0, LS, LS);
  c.clip();
  c.lineCap = 'round';
  for (let b = 0; b < 9; b++) {
    const a = -Math.PI / 2 + (b / 8 - 0.5) * 2.4 + (r() - 0.5) * 0.2;
    const ex = cx + Math.cos(a) * R;
    const ey = cy + Math.sin(a) * R;
    c.strokeStyle = '#3b2a1a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(ex, ey);
    c.stroke();
    for (let t = 0.08; t < 1; t += 0.018) {
      const bx = cx + (ex - cx) * t;
      const by = cy + (ey - cy) * t;
      for (const side of [-1, 1]) {
        const na = a + side * (0.9 + r() * 0.5);
        const nl = (18 + r() * 24) * (1 - t * 0.5);
        c.strokeStyle = `hsl(${128 + r() * 18}, ${34 + r() * 14}%, ${15 + r() * 14}%)`;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl);
        c.stroke();
      }
    }
  }
  c.restore();
}

/** The atlas as a DataTexture (rgb of the transparent pixels is filled in, so mip levels have no dark fringes). Null without a DOM (tests). */
function makeAtlas(): THREE.DataTexture | null {
  if (typeof document === 'undefined') return null;
  const W = TILE * TILES;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = TILE;
  const c = cv.getContext('2d');
  if (!c) return null;
  paintBark(c, TILE_BARK);
  paintSprays(c, TILE_LEAF, false, 1234);
  paintNeedles(c, TILE_NEEDLE);
  paintSprays(c, TILE_LOBED, true, 98765);
  paintMass(c, TILE_MASS, 4242);
  const img = c.getImageData(0, 0, W, TILE);
  const d = img.data;
  for (let t = 1; t < TILES; t++) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = 0; y < TILE; y++) {
      for (let x = t * TILE; x < (t + 1) * TILE; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 200) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      }
    }
    if (n === 0) continue;
    const ar = Math.round(sr / n), ag = Math.round(sg / n), ab = Math.round(sb / n);
    for (let y = 0; y < TILE; y++) {
      for (let x = t * TILE; x < (t + 1) * TILE; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128) { d[i] = ar; d[i + 1] = ag; d[i + 2] = ab; }
      }
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer), W, TILE, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapT = THREE.RepeatWrapping; // the bark tile repeats along long trunks
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------------------------------
// geometry builder
// ---------------------------------------------------------------------------------------------------------------------

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

class Mesh {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  private vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, b: number, g = b, bl = b): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(b, g, bl);
    return this.pos.length / 3 - 1;
  }

  /** A tapered tube along a polyline (trunk / branch). Bark texture, outward normals. */
  tube(points: THREE.Vector3[], radii: number[], seg: number, shade = 1): void {
    const rings: number[][] = [];
    const total = points.length;
    // bark texture repeats along the tube so its texels stay square: (length / circumference) repeats
    let len = 0;
    for (let i = 1; i < total; i++) len += points[i].distanceTo(points[i - 1]);
    const meanR = radii.reduce((a, b) => a + b, 0) / total;
    const vRep = Math.max(0.25, len / (Math.PI * 2 * Math.max(meanR, 0.02)));
    for (let i = 0; i < total; i++) {
      const prev = points[Math.max(i - 1, 0)];
      const next = points[Math.min(i + 1, total - 1)];
      const t = next.clone().sub(prev).normalize();
      const ref = Math.abs(t.y) > 0.95 ? V3(1, 0, 0) : V3(0, 1, 0);
      const a = new THREE.Vector3().crossVectors(ref, t).normalize();
      const b = new THREE.Vector3().crossVectors(t, a);
      const ring: number[] = [];
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const dir = a.clone().multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
        const p = points[i].clone().addScaledVector(dir, radii[i]);
        const u = (TILE_BARK + 0.03 + 0.94 * (j / seg)) / TILES;
        const v = 0.03 + 0.94 * (i / Math.max(total - 1, 1)) * vRep;
        ring.push(this.vert(p, dir, u, v, shade * (0.85 + 0.15 * (i / total))));
      }
      rings.push(ring);
    }
    for (let i = 0; i < total - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a0 = rings[i][j], a1 = rings[i][j + 1], b0 = rings[i + 1][j], b1 = rings[i + 1][j + 1];
        this.idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }

  /**
   * One leaf card. `n` = the card's plane normal (its front face), `shade` = the normal used for lighting, `tint` = colour multiplier
   * (leaf-to-leaf hue variation), `aim` = when given, the card is turned so that the tips of its leaf spray point along this direction.
   */
  card(center: THREE.Vector3, n: THREE.Vector3, upHint: THREE.Vector3, w: number, h: number, tile: number, rot: number, shade: THREE.Vector3, bright: number, flip: boolean, tint?: readonly [number, number, number], aim?: THREE.Vector3): void {
    const nn = n.clone().normalize();
    const hint = upHint.clone();
    if (Math.abs(hint.dot(nn)) > 0.95) hint.set(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(hint, nn).normalize();
    const up2 = new THREE.Vector3().crossVectors(nn, right);
    if (aim) {
      // the spray tips are at the top of the tile (v = 0), which is the -up2 side of the card
      const qx = aim.dot(right), qy = aim.dot(up2);
      if (qx * qx + qy * qy > 1e-4) rot = Math.atan2(qx, -qy) + (rot / (Math.PI * 2) - 0.5) * 1.3;
    }
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const r2 = right.clone().multiplyScalar(cr).addScaledVector(up2, sr);
    const u2 = up2.clone().multiplyScalar(cr).addScaledVector(right, -sr);
    const sn = shade.clone().normalize();
    const u0 = tile / TILES, u1 = (tile + 1) / TILES;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const ids: number[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = center.clone().addScaledVector(r2, (sx * w) / 2).addScaledVector(u2, (sy * h) / 2);
      const su = flip ? -sx : sx;
      ids.push(this.vert(p, sn, su > 0 ? u1 : u0, sy > 0 ? 1 : 0, bright * tr, bright * tg, bright * tb));
    }
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const unit = (r: () => number): THREE.Vector3 => {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return V3(s * Math.cos(a), z, s * Math.sin(a));
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Leaf-to-leaf colour variation: most cards are a slightly cooler or warmer green, `warmChance` of them are yellow-green (young / sunlit leaves). */
function leafTint(r: () => number, warmChance: number): readonly [number, number, number] {
  if (r() < warmChance) return [1.16, 1.07, 0.64];
  const j = r();
  return [0.9 + 0.16 * j, 1.0, 0.88 + 0.22 * (1 - j)];
}

/** A clump of leaf cards filling the shell of an ellipsoid. */
function crown(m: Mesh, r: () => number, c: THREE.Vector3, rx: number, ry: number, rz: number, count: number, sMin: number, sMax: number, warmChance = 0.22): void {
  const yMin = c.y - ry, yMax = c.y + ry;
  for (let i = 0; i < count; i++) {
    const d = unit(r);
    if (d.y < -0.35) d.y = -0.35 + (d.y + 0.35) * 0.3; // the underside is flatter and mostly hidden
    const shell = 0.58 + 0.42 * r();
    const p = V3(c.x + d.x * rx * shell, c.y + d.y * ry * shell, c.z + d.z * rz * shell);
    const radial = V3(d.x / rx, d.y / ry, d.z / rz).normalize();
    const n = radial.clone().multiplyScalar(0.55).addScaledVector(unit(r), 0.75).normalize();
    if (n.dot(radial) < 0.2) n.addScaledVector(radial, 0.6).normalize();
    const size = lerp(sMin, sMax, r());
    const t = Math.min(1, Math.max(0, (p.y - yMin) / (yMax - yMin)));
    const bright = lerp(0.72, 1.2, t * t * 0.6 + t * 0.4) + (r() - 0.5) * 0.18;
    m.card(p, n, V3(0, 1, 0), size, size * lerp(0.85, 1.1, r()), TILE_MASS, r() * Math.PI * 2, radial, bright, r() < 0.5, leafTint(r, warmChance));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// tree models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * REAL BRANCHING. A tree is grown, not stamped: a bent trunk, primary limbs growing out of it, secondary limbs out of those and
 * twigs at the ends - every limb a tapered, slightly wobbling tube that bends up (towards the light) or droops (heavy outer
 * branches). Leaf clusters sit at the tips of the finest twigs, so the crown has holes, layers and a visible skeleton, and the
 * inside of the crown is darker than its sunlit outside.
 */
interface Style {
  seed: number;
  trunkH: number;
  trunkR: number;
  trunkBend: number;
  /** primary limbs: count, where along the trunk they start (0..1), angle from vertical (rad), length (m), droop at the ends */
  primary: number;
  startFrac: number;
  spread: [number, number];
  limbLen: number;
  /** extra upright limbs forking from the top of the trunk (vase / oak shapes) */
  fork: number;
  /** child limbs per limb at levels 1, 2 and their length / radius ratio relative to the parent */
  kids: [number, number];
  lenRatio: [number, number];
  /** gravity on the outer limbs (negative = they rise) */
  droop: number;
  /** crown for shading and for the far LOD: centre height and radii */
  crownY: number;
  rx: number;
  ry: number;
  /** leaf clusters: cards per cluster, cluster radius (m), card size range (m), chance of a warm (yellow-green) leaf card */
  cards: number;
  clusterR: number;
  card: [number, number];
  warm: number;
  /** flat crowns squash the leaf clusters vertically (acacia / savanna tree) */
  flat?: number;
  /** lobed (palmate, fig / oak-like) leaves instead of ovate serrated ones */
  lobed?: boolean;
}

interface Grow {
  m: Mesh;
  r: () => number;
  s: Style;
  detail: number;
  clusters: THREE.Vector3[];
}

const SEG = [9, 5, 4, 3];

/** Point (and direction) at fraction t along a polyline. */
function along(pts: THREE.Vector3[], t: number): { p: THREE.Vector3; d: THREE.Vector3; i: number } {
  const f = Math.min(Math.max(t, 0), 0.999) * (pts.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  return { p: pts[i].clone().lerp(pts[i + 1], k), d: pts[i + 1].clone().sub(pts[i]).normalize(), i };
}

function limb(g: Grow, start: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, level: number): void {
  const { m, r, s } = g;
  const maxLevel = 3;
  const n = level === 0 ? 6 : level === 1 ? 5 : 4;
  const pts = [start.clone()];
  const radii = [r0];
  const d = dir.clone().normalize();
  const p = start.clone();
  const step = len / (n - 1);
  for (let i = 1; i < n; i++) {
    // wobble + tropism: the trunk and main limbs seek the light, the outer limbs sag under their own weight
    const wob = level === 0 ? s.trunkBend : 0.28 + level * 0.06;
    d.x += (r() - 0.5) * wob;
    d.z += (r() - 0.5) * wob;
    d.y += (r() - 0.5) * wob * 0.5 + (level === 0 ? 0.04 : level === 1 ? 0.05 - s.droop * 0.05 : -s.droop * 0.1);
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
    radii.push(r0 * (level === 0 ? 1 - 0.62 * (i / (n - 1)) : 1 - 0.8 * (i / (n - 1))));
  }
  m.tube(pts, radii, Math.max(3, g.detail === 0 ? SEG[level] : 4), 0.82 + 0.18 * Math.min(1, level / 2));

  if (level === 0 && g.detail === 0) {
    // root flare: short buttress roots spreading over the ground
    const roots = 5;
    for (let k = 0; k < roots; k++) {
      const a = (k / roots) * Math.PI * 2 + r() * 0.6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rr = r0 * (1.5 + r() * 0.8);
      m.tube([V3(ca * rr, -0.05, sa * rr), V3(ca * r0 * 0.9, r0 * 0.5, sa * r0 * 0.9), V3(ca * r0 * 0.5, r0 * 1.7, sa * r0 * 0.5)], [r0 * 0.2, r0 * 0.32, r0 * 0.5], 5);
    }
  }

  if (level < maxLevel) {
    const count = level === 0 ? s.primary : Math.max(1, Math.round(s.kids[level - 1] * (0.75 + r() * 0.5)));
    const t0 = level === 0 ? s.startFrac : 0.3;
    let az = r() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const t = level === 0 ? t0 + (1 - t0) * ((k + r() * 0.6) / count) * 0.92 : t0 + (1 - t0) * ((k + r() * 0.5) / count);
      const at = along(pts, t);
      const rAt = radii[at.i] * 0.7;
      az += 2.399 + (r() - 0.5) * 0.8; // golden angle: limbs spiral round the trunk
      const ang = level === 0 ? s.spread[0] + r() * (s.spread[1] - s.spread[0]) : 0.55 + r() * 0.5;
      // rotate the parent direction by `ang` around an axis perpendicular to it, at azimuth `az`
      const ref = Math.abs(at.d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(ref, at.d).normalize();
      const v = new THREE.Vector3().crossVectors(at.d, u);
      const side = u.clone().multiplyScalar(Math.cos(az)).addScaledVector(v, Math.sin(az));
      const cd = at.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      const cl = level === 0 ? s.limbLen * (0.75 + r() * 0.5) * (1 - 0.35 * Math.abs(t - 0.75)) : len * s.lenRatio[level - 1] * (0.8 + r() * 0.4) * (1 - 0.3 * t);
      limb(g, at.p, cd, cl, Math.max(rAt, 0.03), level + 1);
    }
    if (level === 0 && s.fork > 0) {
      // the trunk forks at the top into upright limbs
      for (let k = 0; k < s.fork; k++) {
        const a = (k / s.fork) * Math.PI * 2 + r() * 0.8;
        const cd = V3(Math.cos(a) * (0.35 + r() * 0.3), 1, Math.sin(a) * (0.35 + r() * 0.3)).normalize();
        limb(g, pts[n - 1], cd, s.limbLen * (0.9 + r() * 0.3), radii[n - 1] * 1.1, 1);
      }
    }
  }
  if (level >= maxLevel - 1) {
    // foliage sits at the tip of the thin limbs, and a second cluster part-way along the last ones
    g.clusters.push(pts[n - 1].clone());
    if (level === maxLevel && r() < 0.45) g.clusters.push(along(pts, 0.6).p);
  }
}

/**
 * Leaf cards (painted leaf sprays) around a cluster centre. The cards lie mostly flat and face up and out, like leaves do, and their
 * spray tips point away from the crown centre. The outer / upper ones are brighter, the inner / lower ones darker (crown occlusion).
 */
function leafCluster(g: Grow, c: THREE.Vector3, cc: THREE.Vector3): void {
  const { m, r, s } = g;
  const n = s.cards;
  const tile = s.lobed ? TILE_LOBED : TILE_LEAF;
  for (let i = 0; i < n; i++) {
    const d = unit(g.r);
    const rad = s.clusterR * (0.35 + 0.65 * Math.cbrt(r()));
    const p = V3(c.x + d.x * rad, c.y + d.y * rad * (s.flat ?? 1), c.z + d.z * rad);
    const radial = V3((p.x - cc.x) / s.rx, (p.y - cc.y) / s.ry, (p.z - cc.z) / s.rx).normalize();
    // plane normal: mostly up (leaves catch the sky), some outward lean, some random tilt
    const nrm = V3(0, 0.62, 0).addScaledVector(radial, 0.4).addScaledVector(unit(r), 0.62).normalize();
    if (nrm.dot(radial) < 0.1) nrm.addScaledVector(radial, 0.5).normalize();
    const size = lerp(s.card[0], s.card[1], r());
    // brightness: sunlit top / outside of the crown, shaded inside and underneath
    const dist = Math.min(1.25, Math.hypot((p.x - cc.x) / s.rx, (p.y - cc.y) / s.ry, (p.z - cc.z) / s.rx));
    const top = Math.min(1, Math.max(0, (p.y - (cc.y - s.ry)) / (2 * s.ry)));
    const bright = lerp(0.5, 1.2, Math.min(1, dist * 0.7 + top * 0.35)) + (r() - 0.5) * 0.16;
    m.card(p, nrm, V3(0, 1, 0), size, size * lerp(0.9, 1.08, r()), tile, r() * Math.PI * 2, radial, bright, r() < 0.5, leafTint(r, s.warm), radial);
  }
}

function growTree(s: Style, detail: number): THREE.BufferGeometry {
  const r = mulberry32(s.seed);
  const m = new Mesh();
  const g: Grow = { m, r, s, detail, clusters: [] };
  const cc = V3(0, s.crownY, 0);
  if (detail === 0) {
    limb(g, V3(0, 0, 0), V3(0.04, 1, 0.02), s.trunkH, s.trunkR, 0);
    for (const c of g.clusters) leafCluster(g, c, cc);
  } else {
    // far LOD: one tube trunk, a few stubs and a handful of big leaf cards
    const seg = 5;
    m.tube([V3(0, 0, 0), V3(0.1, s.trunkH * 0.35, 0.04), V3(0, s.trunkH * 0.7, -0.05), V3(0, s.trunkH, 0)], [s.trunkR, s.trunkR * 0.7, s.trunkR * 0.55, s.trunkR * 0.4], seg);
    crown(m, r, cc, s.rx * 0.95, s.ry * 0.95, s.rx * 0.95, 20, 2.6, 3.8, s.warm);
  }
  return m.build();
}

const STYLE_ROUND: Style = {
  seed: 101, trunkH: 3.8, trunkR: 0.5, trunkBend: 0.1, primary: 7, startFrac: 0.5, spread: [0.7, 1.05], limbLen: 3.6, fork: 2,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: 0.3, crownY: 6.4, rx: 3.9, ry: 3.0, cards: 8, clusterR: 1.0, card: [1.0, 1.55], warm: 0.2,
};
const STYLE_OAK: Style = {
  seed: 5150, trunkH: 2.7, trunkR: 0.66, trunkBend: 0.18, primary: 6, startFrac: 0.5, spread: [0.95, 1.25], limbLen: 4.4, fork: 2,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: 0.25, crownY: 5.6, rx: 5.2, ry: 2.7, cards: 7, clusterR: 1.05, card: [1.0, 1.5], warm: 0.15, lobed: true,
};
const STYLE_VASE: Style = {
  seed: 7777, trunkH: 2.4, trunkR: 0.5, trunkBend: 0.1, primary: 4, startFrac: 0.7, spread: [0.35, 0.6], limbLen: 5.2, fork: 3,
  kids: [3, 3], lenRatio: [0.5, 0.5], droop: 0.0, crownY: 6.8, rx: 3.3, ry: 3.8, cards: 8, clusterR: 0.95, card: [0.95, 1.45], warm: 0.18,
};
const STYLE_SLENDER: Style = {
  seed: 31415, trunkH: 5.2, trunkR: 0.3, trunkBend: 0.1, primary: 8, startFrac: 0.35, spread: [0.45, 0.85], limbLen: 2.4, fork: 1,
  kids: [3, 2], lenRatio: [0.55, 0.5], droop: 0.15, crownY: 7.4, rx: 2.5, ry: 3.2, cards: 8, clusterR: 0.85, card: [0.85, 1.35], warm: 0.3,
};
/** The savanna tree: tall slender trunk, wide flat layered crown. */
const STYLE_ACACIA: Style = {
  seed: 202, trunkH: 8.4, trunkR: 0.34, trunkBend: 0.12, primary: 5, startFrac: 0.78, spread: [1.0, 1.35], limbLen: 3.8, fork: 0,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: -0.1, crownY: 11.2, rx: 4.8, ry: 1.5, cards: 7, clusterR: 1.25, card: [0.95, 1.5], warm: 0.2, flat: 0.45,
};

function broadleaf(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_ROUND, detail);
}
function oak(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_OAK, detail);
}
function vase(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_VASE, detail);
}
function slender(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_SLENDER, detail);
}
/** The tall slender tree with a wide flat crown. */
function palm(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_ACACIA, detail);
}

function pine(detail: number): THREE.BufferGeometry {
  const r = mulberry32(303);
  const m = new Mesh();
  const seg = detail === 0 ? 7 : 4;
  m.tube([V3(0, 0, 0), V3(0.05, 1.6, 0), V3(0, 4, 0.04), V3(0, 7.5, 0), V3(0, 10.6, 0)], [0.4, 0.28, 0.2, 0.12, 0.04], seg);
  const layers = detail === 0 ? 8 : 4;
  for (let i = 0; i < layers; i++) {
    const f = i / (layers - 1);
    const y = lerp(2.5, 9.4, f);
    const rad = lerp(2.9, 0.5, Math.pow(f, 0.9));
    const count = detail === 0 ? Math.round(5 + rad * 2.4) : 6;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r() * 0.6;
      const out = V3(Math.cos(a), 0, Math.sin(a));
      const n = out.clone().multiplyScalar(0.45).add(V3(0, 0.9, 0)).normalize();
      const size = (detail === 0 ? 1.0 : 1.7) * (rad * 1.05 + 0.9);
      const c = V3(out.x * rad * 0.55, y - rad * 0.12 + r() * 0.3, out.z * rad * 0.55);
      m.card(c, n, out, size * 0.85, size, TILE_NEEDLE, r() * 0.5 - 0.25, n, lerp(0.62, 1.0, f) + (r() - 0.5) * 0.14, r() < 0.5);
    }
  }
  return m.build();
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material with wind sway. */
export class TreeAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  readonly material: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  private atlas: THREE.DataTexture | null;

  constructor() {
    const makers: Record<number, (d: number) => THREE.BufferGeometry> = {
      [TreeKind.broadleaf]: broadleaf,
      [TreeKind.pine]: pine,
      [TreeKind.palm]: palm,
      [TreeKind.oak]: oak,
      [TreeKind.vase]: vase,
      [TreeKind.slender]: slender,
    };
    for (let k = 0; k < TREE_KIND_COUNT; k++) this.geometries.push([makers[k](0), makers[k](1)]);

    this.atlas = makeAtlas();
    // Leaf cards are cut-outs (alpha test, soft edge with MSAA) and seen from both sides.
    const m = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: this.atlas ? 0.42 : 0,
      alphaToCoverage: !!this.atlas,
    });
    const wind = Config.vegetation.windStrength;
    // everything right of the bark tile is foliage (bark u < 0.97 / TILES, leaves u >= 1 / TILES)
    const leafEdge = (0.985 / TILES).toFixed(5);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTreeTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTreeTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.053;
          #else
            float ph = 0.0;
          #endif
          float bend = max(position.y, 0.0) * ${wind.toFixed(4)};
          float gust = 1.0 + 0.5 * sin(uTreeTime * 0.37 + ph * 1.7);
          transformed.x += sin(uTreeTime * 1.4 + ph) * bend * gust;
          transformed.z += cos(uTreeTime * 1.1 + ph * 1.3) * bend * 0.7;
          // branches sway on their own (a slow wave runs through the crown, so neighbouring limbs are out of step)
          float bp = position.x * 0.9 + position.z * 0.7 + position.y * 0.4;
          transformed.x += sin(uTreeTime * 1.9 + bp + ph) * bend * 0.3;
          transformed.z += cos(uTreeTime * 1.6 + bp * 1.3 + ph) * bend * 0.22;
          // every leaf flutters a little, each with its own phase (never the bark tile, less near the ground)
          float isLeaf = step(${leafEdge}, uv.x);
          float lp = position.x * 12.9898 + position.y * 78.233 + position.z * 37.719;
          float fl = sin(uTreeTime * 3.3 + lp) * 0.6 + sin(uTreeTime * 5.1 + lp * 1.7) * 0.4;
          transformed += normal * fl * 0.04 * isLeaf * min(1.0, position.y * 0.15) * (0.5 + 0.5 * gust);`,
        );
      // sunlight through the leaves + a soft sheen: added to the lit colour just before it is written
      const light = `
        #if NUM_DIR_LIGHTS > 0
        {
          #ifdef USE_MAP
            float leafMask = step(${leafEdge}, vMapUv.x);
          #else
            float leafMask = 0.0;
          #endif
          vec3 sunDir = directionalLights[ 0 ].direction;
          vec3 sunCol = directionalLights[ 0 ].color;
          vec3 viewDir = normalize( vViewPosition );
          float ndl = dot( normal, sunDir );
          // transmission: light that hits the far side of a thin leaf glows through it (strongest when looking towards the sun)
          float back = pow( clamp( -dot( viewDir, sunDir ), 0.0, 1.0 ), 2.5 );
          float open = smoothstep( 0.62, 1.05, vColor.g );
          float tr = ( clamp( -ndl, 0.0, 1.0 ) * 0.6 + back * 0.55 ) * leafMask * open;
          outgoingLight += diffuseColor.rgb * vec3( 1.0, 1.12, 0.45 ) * sunCol * tr * 0.55;
          // soft sheen (waxy leaf surface), only where the sun really reaches the leaf
          vec3 halfDir = normalize( sunDir + viewDir );
          float spec = pow( clamp( dot( normal, halfDir ), 0.0, 1.0 ), 36.0 );
          float sunSeen = clamp( dot( reflectedLight.directDiffuse, vec3( 0.3333 ) ) * 6.0, 0.0, 1.0 );
          outgoingLight += sunCol * spec * 0.045 * sunSeen * leafMask;
        }
        #endif
        `;
      const hook = shader.fragmentShader.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '#include <output_fragment>';
      shader.fragmentShader = shader.fragmentShader.replace(hook, light + '\n' + hook);
    };
    m.customProgramCacheKey = () => 'tree-wind-leaf2';
    this.material = m;
  }

  update(time: number): void {
    this.time.value = time;
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
    this.atlas?.dispose();
  }
}
