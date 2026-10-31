import * as THREE from 'three';

/**
 * EVCity logo drawn in code (no image files): a teal "E" mark made of three rounded bars, optionally followed by the word "EVCity".
 * Used on every EVCity vehicle (doors, nose, tailgate, spare-wheel cover).
 */
export const EV_TEAL = 0x1fd1b0;

export type LogoStyle = 'mark' | 'wordmark' | 'badge';

/** Draws the "E" mark with its top-left corner at (x, y) in a box of `s` px. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#3df2c8');
  g.addColorStop(1, '#12a98f');
  ctx.fillStyle = g;
  const bar = s * 0.22;
  const r = bar / 2;
  const rr = (bx: number, by: number, bw: number, bh: number) => {
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();
  };
  rr(x, y, bar, s); // spine
  rr(x, y, s, bar); // top bar
  rr(x, y + (s - bar) / 2, s * 0.78, bar); // middle bar (shorter)
  rr(x, y + s - bar, s, bar); // bottom bar
}

/**
 * Logo texture. `wordmark`: E mark + "EVCity" (2:0.55), `mark`: only the E mark (square), `badge`: round dark cover with a teal ring,
 * the mark and the word (spare-wheel cover). `dark` = draw the text in white (for dark panels), otherwise charcoal.
 * Returns null when there is no DOM (headless tests).
 */
export function makeLogoTexture(style: LogoStyle, dark = false): THREE.CanvasTexture | null {
  const key = `${style}:${dark}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const tex = buildLogo(style, dark);
  cache.set(key, tex);
  return tex;
}

/** One shared texture per style (every vehicle reuses it; never disposed per vehicle). */
const cache = new Map<string, THREE.CanvasTexture | null>();

function buildLogo(style: LogoStyle, dark: boolean): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const W = style === 'wordmark' ? 512 : 256;
  const H = style === 'wordmark' ? 128 : 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  const text = dark || style === 'badge' ? '#f4f7f8' : '#1d2429';
  if (style === 'mark') {
    drawMark(ctx, W * 0.14, H * 0.14, W * 0.72);
  } else if (style === 'wordmark') {
    drawMark(ctx, 14, 22, 84);
    ctx.fillStyle = text;
    ctx.font = '700 84px "Segoe UI", Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('EVCity', 120, 66);
  } else {
    ctx.fillStyle = '#171c20';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1fd1b0';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 14, 0, Math.PI * 2);
    ctx.stroke();
    drawMark(ctx, W / 2 - 24, H * 0.2, 48);
    ctx.fillStyle = text;
    ctx.font = '700 40px "Segoe UI", Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EVCity', W / 2, H * 0.68);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
