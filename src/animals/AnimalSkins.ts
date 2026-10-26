import * as THREE from 'three';
import type { Species } from './Species';

/**
 * Skins: every species gets a painted canvas texture (fur, stripes, spots, scales, feathers ...) shared by all animals of
 * that species + colour variant. u = around the body (the back line is at x = 0 and x = w, the belly in the middle),
 * v = along the body. Two materials per skin:
 *   fur - the texture x vertex colour (the lofts darken their underside; hooves are tinted dark)
 *   acc - no texture, the colour comes from the vertex colours (eyes, noses, horns, beaks, combs, tusks)
 */
export type Pattern =
  | 'plain' | 'tiger' | 'zebra' | 'giraffe' | 'rosette' | 'spots' | 'patch' | 'wool' | 'bristle'
  | 'scale' | 'wrinkle' | 'feather' | 'dolphin' | 'tabby' | 'peacock' | 'eyes';

export interface Look {
  pattern: Pattern;
  base: string;
  /** Belly / chest colour (the pale band in the middle of the texture). */
  belly?: string;
  /** Mark colour (stripes, spots, patches). */
  mark?: string;
  /** Number of fur strokes (more = softer). */
  amount?: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const W = 256;
type Ctx = CanvasRenderingContext2D;

function fillBase(c: Ctx, base: string, r: () => number, amount: number, light = 'rgba(255,240,200,0.10)', dark = 'rgba(30,15,0,0.12)'): void {
  c.fillStyle = base;
  c.fillRect(0, 0, W, W);
  for (let i = 0; i < amount; i++) {
    c.strokeStyle = r() > 0.5 ? light : dark;
    c.lineWidth = 1;
    const x = r() * W, y = r() * W;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (r() - 0.5) * 3, y + 3 + r() * 6);
    c.stroke();
  }
}

function bellyBand(c: Ctx, color: string, alpha = 0.9, half = 0.12): void {
  const g = c.createLinearGradient(0, 0, W, 0);
  const a = (v: number): string => `rgba(${color},${v})`;
  g.addColorStop(0, a(0));
  g.addColorStop(0.5 - half * 1.6, a(0));
  g.addColorStop(0.5 - half * 0.3, a(alpha));
  g.addColorStop(0.5 + half * 0.3, a(alpha));
  g.addColorStop(0.5 + half * 1.6, a(0));
  g.addColorStop(1, a(0));
  c.fillStyle = g;
  c.fillRect(0, 0, W, W);
}

/** "r,g,b" of a #rrggbb colour (for the rgba() gradients). */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function blob(c: Ctx, x: number, y: number, rx: number, ry: number, r: () => number): void {
  c.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.78 + r() * 0.44;
    const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

function paint(c: Ctx, look: Look, seed: number): void {
  const r = rng(seed);
  const base = look.base, mark = look.mark ?? '#222222';
  const belly = look.belly;
  switch (look.pattern) {
    case 'tiger': {
      fillBase(c, base, r, look.amount ?? 1800);
      for (let y = 6; y < W; y += 9 + r() * 9) {
        for (let x = 0; x < W; x++) {
          const back = 0.5 + 0.5 * Math.cos((x / W) * Math.PI * 2);
          const len = back > 0.15 ? Math.pow(back, 0.6) * (0.5 + r() * 0.25) : 0;
          if (len <= 0) continue;
          c.fillStyle = 'rgba(25,14,8,0.92)';
          const th = 2.2 + 3 * len;
          c.fillRect(x, y + Math.sin(x * 0.2 + y) * 1.6, 1.2, th * (0.5 + len));
        }
      }
      break;
    }
    case 'tabby': {
      fillBase(c, base, r, look.amount ?? 1500);
      c.fillStyle = mark;
      c.globalAlpha = 0.55;
      for (let y = 4; y < W; y += 11 + r() * 8) for (let x = 0; x < W; x += 3) {
        const back = 0.5 + 0.5 * Math.cos((x / W) * Math.PI * 2);
        if (back > 0.25) c.fillRect(x, y + Math.sin(x * 0.15) * 2, 3, 3 + back * 3);
      }
      c.globalAlpha = 1;
      break;
    }
    case 'zebra': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      c.fillStyle = mark;
      for (let x = 0; x < W; x++) {
        const wob = Math.sin(x * 0.045) * 5 + Math.sin(x * 0.17) * 1.5;
        for (let y = -20; y < W + 20; y += 1) {
          const band = Math.floor((y + wob) / 11);
          if ((band & 1) === 1) c.fillRect(x, y, 1, 1);
        }
      }
      break;
    }
    case 'giraffe': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      c.fillStyle = mark;
      const cell = 36;
      for (let gy = -1; gy < W / cell + 1; gy++) for (let gx = -1; gx < W / cell + 1; gx++) {
        const x = gx * cell + (gy & 1 ? cell / 2 : 0) + (r() - 0.5) * 8, y = gy * cell + (r() - 0.5) * 8;
        blob(c, x, y, cell * 0.38, cell * 0.36, r);
      }
      break;
    }
    case 'rosette': {
      fillBase(c, base, r, look.amount ?? 1500);
      for (let i = 0; i < 170; i++) {
        const x = r() * W, y = r() * W;
        const back = 0.5 + 0.5 * Math.cos((x / W) * Math.PI * 2);
        if (back < 0.12) continue;
        c.strokeStyle = mark; c.lineWidth = 2.4; c.fillStyle = 'rgba(190,140,60,0.5)';
        const rr = 3 + r() * 4;
        c.beginPath(); c.arc(x, y, rr, 0.3, 5.9); c.stroke();
        c.beginPath(); c.arc(x, y, rr * 0.45, 0, 6.3); c.fill();
      }
      break;
    }
    case 'spots': {
      fillBase(c, base, r, look.amount ?? 1800);
      for (let i = 0; i < 170; i++) {
        c.fillStyle = 'rgba(255,248,230,0.85)';
        c.beginPath(); c.arc(r() * W, 20 + r() * (W - 40), 1.6 + r() * 2.2, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'patch': {
      fillBase(c, base, r, look.amount ?? 1400);
      c.fillStyle = mark;
      for (let i = 0; i < 7; i++) {
        const x = r() * W, y = r() * W, rx = 22 + r() * 40, ry = 20 + r() * 38;
        for (const o of [-W, 0, W]) blob(c, x + o, y, rx, ry, r);
      }
      break;
    }
    case 'wool': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      for (let i = 0; i < 900; i++) {
        const x = r() * W, y = r() * W, rr = 3 + r() * 5;
        c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(60,50,40,0.16)';
        c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'bristle': {
      fillBase(c, base, r, 1200);
      for (let i = 0; i < 2600; i++) {
        c.strokeStyle = r() > 0.55 ? 'rgba(10,6,2,0.35)' : 'rgba(150,120,90,0.25)';
        c.lineWidth = 1;
        const x = r() * W, y = r() * W;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 2, y + 6 + r() * 8); c.stroke();
      }
      break;
    }
    case 'scale': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      for (let y = 0; y < W; y += 9) for (let x = 0; x < W; x += 9) {
        const ox = (y / 9) & 1 ? 4.5 : 0;
        c.fillStyle = r() > 0.5 ? 'rgba(20,30,10,0.35)' : 'rgba(210,220,150,0.16)';
        c.fillRect(x + ox + 1, y + 1, 7, 7);
      }
      c.fillStyle = mark;
      c.globalAlpha = 0.5;
      for (let i = 0; i < 9; i++) c.fillRect(0, i * 28 + 8, W * 0.28, 8);
      c.fillRect(W * 0.72, 0, W * 0.28, W);
      c.globalAlpha = 1;
      break;
    }
    case 'wrinkle': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      for (let i = 0; i < 1500; i++) {
        c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
        c.fillRect(r() * W, r() * W, 6 + r() * 20, 1 + r() * 1.5);
      }
      c.strokeStyle = 'rgba(30,25,22,0.35)';
      c.lineWidth = 1.4;
      for (let i = 0; i < 70; i++) {
        const x = r() * W, y = r() * W;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10 + r() * 12, y + (r() - 0.5) * 6, x + 22 + r() * 24, y + (r() - 0.5) * 3); c.stroke();
      }
      break;
    }
    case 'feather': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      for (let y = 0; y < W + 8; y += 7) for (let x = 0; x < W + 8; x += 9) {
        const ox = (y / 7) & 1 ? 4.5 : 0;
        c.fillStyle = 'rgba(255,255,255,0.13)';
        c.beginPath(); c.arc(x + ox, y, 5.2, 0.1, Math.PI - 0.1); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 1;
        c.beginPath(); c.arc(x + ox, y, 5.2, 0.1, Math.PI - 0.1); c.stroke();
      }
      break;
    }
    case 'peacock': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      for (let i = 0; i < 1800; i++) {
        c.strokeStyle = r() > 0.5 ? 'rgba(120,200,120,0.18)' : 'rgba(0,40,20,0.2)';
        const x = r() * W, y = r() * W;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 4, y + 6 + r() * 10); c.stroke();
      }
      for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 5; gx++) {
        const x = 26 + gx * 50 + (gy & 1 ? 25 : 0), y = 20 + gy * 42;
        c.fillStyle = '#c9a23a'; c.beginPath(); c.ellipse(x, y, 11, 14, 0, 0, 6.3); c.fill();
        c.fillStyle = '#1d6a8c'; c.beginPath(); c.ellipse(x, y, 7, 9, 0, 0, 6.3); c.fill();
        c.fillStyle = '#10204a'; c.beginPath(); c.ellipse(x, y, 3.2, 4.2, 0, 0, 6.3); c.fill();
      }
      break;
    }
    case 'dolphin': {
      const g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, base); g.addColorStop(0.22, base);
      g.addColorStop(0.42, belly ?? '#e6ebee'); g.addColorStop(0.58, belly ?? '#e6ebee');
      g.addColorStop(0.78, base); g.addColorStop(1, base);
      c.fillStyle = g;
      c.fillRect(0, 0, W, W);
      for (let i = 0; i < 500; i++) {
        c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,20,40,0.06)';
        c.fillRect(r() * W, r() * W, 10 + r() * 20, 1 + r() * 2);
      }
      return;
    }
    case 'eyes': {
      c.fillStyle = base;
      c.fillRect(0, 0, W, W);
      break;
    }
    default:
      fillBase(c, base, r, look.amount ?? 1800);
  }
  if (belly) bellyBand(c, rgb(belly), look.pattern === 'zebra' || look.pattern === 'tiger' ? 0.85 : 0.75);
}

const texCache = new Map<string, THREE.CanvasTexture>();

function texture(key: string, look: Look, seed: number): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = W;
  paint(cv.getContext('2d') as Ctx, look, seed);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export interface Skin {
  fur: THREE.MeshStandardMaterial;
  acc: THREE.MeshStandardMaterial;
}
const skins = new Map<string, Skin>();
let accShared: THREE.MeshStandardMaterial | null = null;

/** The material without texture: its colour comes from the vertex colours (eyes, horns, beaks, bird legs ...). */
export function accMaterial(): THREE.MeshStandardMaterial {
  if (!accShared) accShared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  return accShared;
}

/** The shared materials of one skin (cached by key, e.g. 'deer:0'). */
export function skinOf(key: string, look: Look): Skin {
  let s = skins.get(key);
  if (s) return s;
  let seed = 7;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  s = { fur: new THREE.MeshStandardMaterial({ map: texture(key, look, seed), vertexColors: true, roughness: 0.95, metalness: 0 }), acc: accMaterial() };
  skins.set(key, s);
  return s;
}

/** Colour variants of each species (index = variant % length). */
export const LOOKS: Record<Species, Look[]> = {
  cow: [
    { pattern: 'plain', base: '#d9d3c6', belly: '#f1ece2' },
    { pattern: 'plain', base: '#8a5a36', belly: '#b08a64' },
    { pattern: 'patch', base: '#ece6d8', mark: '#2a2622' },
    { pattern: 'patch', base: '#a9683c', mark: '#efe9dc' },
  ],
  buffalo: [{ pattern: 'wrinkle', base: '#3d3a37' }, { pattern: 'wrinkle', base: '#54483e' }],
  goat: [
    { pattern: 'patch', base: '#ece5d6', mark: '#6b4a2e' },
    { pattern: 'plain', base: '#6d4c30', belly: '#b49a76' },
    { pattern: 'plain', base: '#2a2623', belly: '#6a625a' },
    { pattern: 'patch', base: '#c9b08a', mark: '#efe9dc' },
  ],
  sheep: [{ pattern: 'wool', base: '#e9e5da' }, { pattern: 'wool', base: '#a8a396' }],
  horse: [
    { pattern: 'plain', base: '#7a4a2a', belly: '#9a6a46' },
    { pattern: 'plain', base: '#1f1b19', belly: '#3a3430' },
    { pattern: 'plain', base: '#d3cec4', belly: '#ebe6dc' },
    { pattern: 'plain', base: '#98582a', belly: '#b47a4a' },
  ],
  dog: [
    { pattern: 'plain', base: '#b58a50', belly: '#e0c9a0' },
    { pattern: 'plain', base: '#2a2522', belly: '#8a6a44' },
    { pattern: 'patch', base: '#ece4d4', mark: '#8a5a30' },
    { pattern: 'plain', base: '#8a8782', belly: '#cfcac2' },
  ],
  cat: [
    { pattern: 'tabby', base: '#c98d47', mark: '#6a4220', belly: '#efe0c0' },
    { pattern: 'patch', base: '#ece6dc', mark: '#26221f' },
    { pattern: 'tabby', base: '#8d8a86', mark: '#3a3836', belly: '#d8d4cc' },
  ],
  chicken: [
    { pattern: 'feather', base: '#ece8de' },
    { pattern: 'feather', base: '#9a4a22' },
    { pattern: 'feather', base: '#2a2c30' },
  ],
  duck: [
    { pattern: 'feather', base: '#f1eee6' },
    { pattern: 'feather', base: '#7b6a52' },
    { pattern: 'feather', base: '#3c3d42' },
  ],
  deer: [{ pattern: 'spots', base: '#aa7240', belly: '#f4ead8' }],
  boar: [{ pattern: 'bristle', base: '#43382f' }, { pattern: 'bristle', base: '#5e4c3a' }],
  rabbit: [
    { pattern: 'plain', base: '#8f7456', belly: '#e8dcc6' },
    { pattern: 'plain', base: '#8c8984', belly: '#e0dcd4' },
    { pattern: 'plain', base: '#ebe7e0' },
  ],
  elephant: [{ pattern: 'wrinkle', base: '#807c77' }],
  zebra: [{ pattern: 'zebra', base: '#f1eee6', mark: '#16120f', belly: '#f6f2ea' }],
  giraffe: [{ pattern: 'giraffe', base: '#e4c98a', mark: '#8a5428' }],
  rhino: [{ pattern: 'wrinkle', base: '#8a867f' }],
  hippo: [{ pattern: 'wrinkle', base: '#8d7a76' }],
  tiger: [{ pattern: 'tiger', base: '#d9822b', belly: '#fff5e1' }],
  lion: [{ pattern: 'plain', base: '#c9a060', belly: '#eed9b0', amount: 2600 }],
  leopard: [{ pattern: 'rosette', base: '#d6a455', mark: '#2a1a0c', belly: '#f0e2c4' }],
  wolf: [{ pattern: 'plain', base: '#7b756a', belly: '#d2cabc', amount: 2800 }],
  fox: [{ pattern: 'plain', base: '#c4692a', belly: '#f3ebdd', amount: 2400 }],
  bear: [{ pattern: 'plain', base: '#2a2321', amount: 2800 }, { pattern: 'plain', base: '#5d3f28', amount: 2800 }],
  peacock: [{ pattern: 'feather', base: '#1f4ea6' }],
  crocodile: [{ pattern: 'scale', base: '#4e5b3a', mark: '#24301a', belly: '#c9c48a' }],
  dolphin: [{ pattern: 'dolphin', base: '#66798a', belly: '#e4e9ec' }],
};

/** Train of a peacock (same skin type as the body but eye-spots). */
export const PEACOCK_TRAIN: Look = { pattern: 'peacock', base: '#2a7a4a' };
