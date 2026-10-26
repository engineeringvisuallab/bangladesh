import * as THREE from 'three';

/** Floating Bangla name tag (sprite). Safe in Node (no DOM): then it is just an empty sprite. */
export function makeLabel(text: string, scale = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 144;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = 'rgba(10,25,40,0.82)';
      g.beginPath();
      g.roundRect(4, 4, c.width - 8, c.height - 8, 28);
      g.fill();
      g.strokeStyle = '#5ec2ff';
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = '700 58px "Noto Sans Bengali", "Nirmala UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, c.height / 2 + 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(19.2 * scale, 3.6 * scale, 1);
  s.renderOrder = 20;
  s.name = 'label';
  return s;
}

/** A flat sign board (plane) with text, e.g. the entrance sign. Faces +z. */
export function makeSign(text: string, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b4f72 });
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * h) / w);
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#1b4f72';
      g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 8;
      g.strokeRect(10, 10, c.width - 20, c.height - 20);
      g.fillStyle = '#ffffff';
      g.font = '700 70px "Noto Sans Bengali", "Nirmala UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, c.height / 2 + 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.color.set(0xffffff);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
