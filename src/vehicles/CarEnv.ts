import * as THREE from 'three';

let cached: THREE.CubeTexture | null = null;

/**
 * Small procedural "sunny day" reflection cube (blue sky, bright horizon haze, dark-green ground, a sun spot).
 * Only the car paint / glass / chrome materials use it (no scene.environment change), so nothing else in the game is affected.
 * Shared by all vehicles, built once.
 */
export function carEnv(): THREE.CubeTexture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const S = 128;
  const face = (kind: 'top' | 'bottom' | 'side', sun = false): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    if (kind === 'top') {
      const gr = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.75);
      gr.addColorStop(0, '#3f7fd0');
      gr.addColorStop(1, '#9cc4ee');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(255,255,255,0.55)'; // a few clouds
      for (const [x, y, r] of [[34, 40, 16], [58, 46, 20], [92, 84, 14], [84, 28, 12]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'bottom') {
      g.fillStyle = '#2f3a2a';
      g.fillRect(0, 0, S, S);
    } else {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, '#5c9ae0'); // sky
      gr.addColorStop(0.42, '#bcd8f2');
      gr.addColorStop(0.5, '#e9f0f4'); // bright horizon
      gr.addColorStop(0.52, '#58664a'); // grass
      gr.addColorStop(1, '#2d3527');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      if (sun) {
        const sg = g.createRadialGradient(S * 0.7, S * 0.22, 1, S * 0.7, S * 0.22, S * 0.22);
        sg.addColorStop(0, 'rgba(255,250,225,1)');
        sg.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = sg;
        g.fillRect(0, 0, S, S);
      }
    }
    return c;
  };
  // order: +x, -x, +y, -y, +z, -z
  const tex = new THREE.CubeTexture([face('side', true), face('side'), face('top'), face('bottom'), face('side'), face('side')]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
