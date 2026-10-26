import * as THREE from 'three';

/**
 * Real-looking, TILEABLE ground textures painted once at start-up on a canvas (no files to download):
 *   grass  - thousands of blades in many greens + straw and darker clumps
 *   dirt   - brown soil with grain, pebbles, small stones and dry cracks
 *   rock   - layered grey stone with cracks, speckles and lichen
 *   sand   - fine grains with wind ripples
 * The terrain shader samples them at two scales (world coordinates, so nothing stretches) and uses them as DETAIL on top of the
 * height / slope colours: the colour of a texture divided by its average, so the overall land colours stay as designed.
 * Everything wraps around the canvas edges, so the tiles have no seams.
 */
/** Pixel size of the ground tiles (1024 = 2x sharper than before). Painted in a logical 512 space scaled by K, so the layout stays the same. */
const SIZE = 1024;
const LS = 512;
const K = SIZE / LS;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Run `draw(dx, dy)` for every wrapped copy (offsets of +-LS) that can reach the tile from point (x, y) with reach r. */
function wrapped(x: number, y: number, r: number, draw: (dx: number, dy: number) => void): void {
  const xs = [0], ys = [0];
  if (x < r) xs.push(LS); else if (x > LS - r) xs.push(-LS);
  if (y < r) ys.push(LS); else if (y > LS - r) ys.push(-LS);
  for (const dx of xs) for (const dy of ys) draw(dx, dy);
}

function blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, fill: string): void {
  wrapped(x, y, Math.max(rx, ry) + 2, (dx, dy) => {
    c.fillStyle = fill;
    c.beginPath();
    c.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2);
    c.fill();
  });
}

function line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, stroke: string): void {
  wrapped(x0, y0, Math.hypot(x1 - x0, y1 - y0) + w + 2, (dx, dy) => {
    c.strokeStyle = stroke;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0 + dx, y0 + dy);
    c.lineTo(x1 + dx, y1 + dy);
    c.stroke();
  });
}

/** Soft low-frequency tonal patches so a tile does not look like uniform noise. */
function patches(c: CanvasRenderingContext2D, r: () => number, n: number, minR: number, maxR: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    const x = r() * LS, y = r() * LS, rad = minR + r() * (maxR - minR);
    wrapped(x, y, rad, (dx, dy) => {
      const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      const col = colors[Math.floor(r() * colors.length)];
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    });
  }
}

function makeGrass(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(K, K);
  const r = rng(101);
  c.fillStyle = '#4c6a2a';
  c.fillRect(0, 0, LS, LS);
  patches(c, r, 70, 30, 90, ['rgba(110,140,50,0.35)', 'rgba(40,70,25,0.35)', 'rgba(150,140,70,0.22)']);
  // dark under-layer (shadow between the blades)
  for (let i = 0; i < 9000; i++) blob(c, r() * LS, r() * LS, 2 + r() * 3, 1 + r() * 2, r() * 6, 'rgba(20,35,10,0.25)');
  // blades: slightly bent strokes, mostly upright, many greens, some straw
  const greens = ['#3d5c1f', '#4f7326', '#62862f', '#76993a', '#8cab48', '#a3b95a', '#5b7a2a', '#2f4a18'];
  for (let i = 0; i < 30000; i++) {
    const x = r() * LS, y = r() * LS, len = 7 + r() * 17, a = -Math.PI / 2 + (r() - 0.5) * 1.1;
    const col = r() < 0.08 ? (r() > 0.5 ? '#b8a966' : '#9c8c4e') : greens[Math.floor(r() * greens.length)];
    const bend = (r() - 0.5) * 6;
    const x1 = x + Math.cos(a) * len + bend, y1 = y + Math.sin(a) * len;
    line(c, x, y, x1, y1, 0.9 + r() * 0.9, col);
  }
  // a few clover / weed leaves and tiny flowers
  for (let i = 0; i < 260; i++) blob(c, r() * LS, r() * LS, 2 + r() * 2.5, 1.5 + r() * 2, r() * 6, r() < 0.5 ? 'rgba(80,120,40,0.85)' : 'rgba(60,100,35,0.8)');
  for (let i = 0; i < 40; i++) blob(c, r() * LS, r() * LS, 1.2, 1.2, 0, r() < 0.5 ? 'rgba(250,240,200,0.9)' : 'rgba(240,210,70,0.9)');
  return cv;
}

function makeDirt(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(K, K);
  const r = rng(202);
  c.fillStyle = '#6a4a2f';
  c.fillRect(0, 0, LS, LS);
  patches(c, r, 90, 25, 80, ['rgba(120,85,50,0.4)', 'rgba(60,40,25,0.4)', 'rgba(140,110,75,0.3)']);
  for (let i = 0; i < 36000; i++) {
    const v = r();
    blob(c, r() * LS, r() * LS, 0.6 + r() * 1.4, 0.6 + r() * 1.4, 0, v < 0.5 ? 'rgba(40,25,14,0.35)' : v < 0.85 ? 'rgba(150,110,70,0.30)' : 'rgba(190,160,120,0.30)');
  }
  // dry cracks
  for (let k = 0; k < 14; k++) {
    let x = r() * LS, y = r() * LS, a = r() * 6.28;
    for (let s = 0; s < 18; s++) {
      const nx = x + Math.cos(a) * (6 + r() * 8), ny = y + Math.sin(a) * (6 + r() * 8);
      line(c, x, y, nx, ny, 0.8 + r() * 0.8, 'rgba(30,18,10,0.55)');
      x = nx; y = ny; a += (r() - 0.5) * 1.0;
    }
  }
  // pebbles and small stones with a darker underside shadow
  for (let i = 0; i < 170; i++) {
    const x = r() * LS, y = r() * LS, rad = 1.2 + r() * 3.6, g = 86 + Math.floor(r() * 60);
    blob(c, x + 1, y + 1.5, rad, rad * 0.8, 0, 'rgba(25,15,8,0.55)');
    blob(c, x, y, rad, rad * (0.65 + r() * 0.3), r() * 3, `rgb(${g},${Math.floor(g * 0.92)},${Math.floor(g * 0.8)})`);
    blob(c, x - rad * 0.25, y - rad * 0.3, rad * 0.45, rad * 0.3, 0, 'rgba(235,220,195,0.14)');
  }
  return cv;
}

function makeRock(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(K, K);
  const r = rng(303);
  c.fillStyle = '#7b756d';
  c.fillRect(0, 0, LS, LS);
  // strata: horizontal layers of slightly different greys / browns
  let y = 0;
  while (y < LS) {
    const h = 10 + r() * 34, g = 96 + Math.floor(r() * 62);
    c.fillStyle = `rgba(${g + Math.floor(r() * 14)},${g},${g - Math.floor(r() * 14)},0.55)`;
    c.fillRect(0, y, LS, h);
    y += h;
  }
  patches(c, r, 80, 20, 70, ['rgba(60,55,50,0.4)', 'rgba(170,160,145,0.35)', 'rgba(120,105,85,0.3)']);
  for (let i = 0; i < 30000; i++) blob(c, r() * LS, r() * LS, 0.6 + r() * 1.6, 0.5 + r() * 1.2, 0, r() < 0.5 ? 'rgba(30,28,26,0.3)' : 'rgba(210,205,195,0.25)');
  // cracks: long, jagged, mostly across the strata
  for (let k = 0; k < 26; k++) {
    let x = r() * LS, yy = r() * LS, a = (r() - 0.5) * 2.4 + (r() < 0.5 ? 0 : Math.PI / 2);
    for (let s = 0; s < 22; s++) {
      const nx = x + Math.cos(a) * (4 + r() * 12), ny = yy + Math.sin(a) * (4 + r() * 12);
      line(c, x, yy, nx, ny, 0.7 + r() * 1.3, 'rgba(22,20,18,0.7)');
      line(c, x + 1, yy + 1, nx + 1, ny + 1, 0.6, 'rgba(230,225,215,0.18)');
      x = nx; yy = ny; a += (r() - 0.5) * 1.3;
    }
  }
  // lichen
  for (let i = 0; i < 70; i++) blob(c, r() * LS, r() * LS, 3 + r() * 9, 2 + r() * 6, r() * 3, r() < 0.5 ? 'rgba(150,165,95,0.28)' : 'rgba(205,190,120,0.22)');
  return cv;
}

function makeSand(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(K, K);
  const r = rng(404);
  c.fillStyle = '#cdbb8e';
  c.fillRect(0, 0, LS, LS);
  patches(c, r, 60, 30, 90, ['rgba(235,215,165,0.35)', 'rgba(150,125,85,0.3)']);
  // wind ripples: wavy lines with a whole number of waves across the tile (so they wrap without seams): light crest + dark trough
  for (let k = 0; k < 22; k++) {
    const y0 = (k / 22) * LS + (r() - 0.5) * 6, ph = r() * 6.28, cyc = 2 + Math.floor(r() * 3), amp = 4 + r() * 5;
    for (const [off, w, col] of [[0, 1.6, 'rgba(255,245,215,0.30)'], [2.6, 1.4, 'rgba(120,95,60,0.22)']] as const) {
      for (const dy of [-LS, 0, LS]) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        for (let x = 0; x <= LS; x += 4) {
          const y = y0 + off + dy + Math.sin((x / LS) * Math.PI * 2 * cyc + ph) * amp;
          if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
  }
  for (let i = 0; i < 30000; i++) blob(c, r() * LS, r() * LS, 0.5 + r() * 0.8, 0.5 + r() * 0.8, 0, r() < 0.5 ? 'rgba(255,245,220,0.35)' : 'rgba(110,85,55,0.3)');
  for (let i = 0; i < 120; i++) blob(c, r() * LS, r() * LS, 1 + r() * 1.8, 1 + r() * 1.4, r() * 3, 'rgba(120,105,85,0.55)'); // shell / stone bits
  return cv;
}

function average(cv: HTMLCanvasElement): THREE.Vector3 {
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const d = c.getImageData(0, 0, SIZE, SIZE).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return new THREE.Vector3(r / n / 255, g / n / 255, b / n / 255);
}

function tex(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // used as a detail RATIO (value / average), not as a colour
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface GroundTextures {
  grass: THREE.CanvasTexture; dirt: THREE.CanvasTexture; rock: THREE.CanvasTexture; sand: THREE.CanvasTexture;
  grassMean: THREE.Vector3; dirtMean: THREE.Vector3; rockMean: THREE.Vector3; sandMean: THREE.Vector3;
}

let cache: GroundTextures | null = null;

/** Paints the four tiles once (about 0.3 s) and shares them with every terrain material. */
export function getGroundTextures(): GroundTextures {
  if (cache) return cache;
  const g = makeGrass(), d = makeDirt(), r = makeRock(), s = makeSand();
  cache = {
    grass: tex(g), dirt: tex(d), rock: tex(r), sand: tex(s),
    grassMean: average(g), dirtMean: average(d), rockMean: average(r), sandMean: average(s),
  };
  return cache;
}

export function disposeGroundTextures(): void {
  if (!cache) return;
  cache.grass.dispose(); cache.dirt.dispose(); cache.rock.dispose(); cache.sand.dispose();
  cache = null;
}
