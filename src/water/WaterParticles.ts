import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
uniform float uPxScale;
varying float vAlpha;
varying float vKind;
void main() {
  vAlpha = aAlpha;
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPxScale / max(-mv.z, 0.2), 1.0, 72.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTint;
varying float vAlpha;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vAlpha < 0.003) discard;
  float a;
  vec3 col;
  if (vKind < 0.5) {            // marine snow: soft specks
    a = (1.0 - smoothstep(0.2, 1.0, d)) * 0.6;
    col = uTint;
  } else if (vKind < 1.5) {     // bubble: faint disc, bright rim, little highlight
    float ring = smoothstep(0.62, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
    float hi = 1.0 - smoothstep(0.0, 0.22, length(c - vec2(-0.17, -0.17)));
    a = 0.1 + ring * 0.75 + hi * 0.85;
    col = vec3(0.85, 0.97, 1.0);
  } else {                      // spray droplet
    a = 1.0 - smoothstep(0.3, 1.0, d);
    col = vec3(0.95, 0.98, 1.0);
  }
  gl_FragColor = vec4(col, a * vAlpha);
}
`;

const BUBBLES = 160;
const SPRAY = 96;
const SNOW_MAX = 240;
const N = BUBBLES + SPRAY + SNOW_MAX;
const BOX = 9; // half size (m) of the marine-snow box around the camera

/**
 * Small particles of the water: bubbles rising from a diver, spray of a splash and drifting marine snow
 * (the specks that make you feel the water around you). One Points object, soft discs drawn in the shader.
 * Positions are ABSOLUTE world metres (the object lives under the world root).
 */
export class WaterParticles {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private alpha = new Float32Array(N);
  private kind = new Float32Array(N);
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private max = new Float32Array(N);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private uPxScale = { value: 800 };
  private uTint = { value: new THREE.Color(0.7, 0.9, 0.95) };
  private bubbleCursor = 0;
  private sprayCursor = 0;
  private snowCount = 140;
  private snowInit = false;

  constructor(root: THREE.Object3D) {
    for (let i = 0; i < N; i++) {
      this.kind[i] = i < BUBBLES ? 1 : i < BUBBLES + SPRAY ? 2 : 0;
      this.pos[i * 3 + 1] = -9999;
    }
    const pa = new THREE.BufferAttribute(this.pos, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    const sa = new THREE.BufferAttribute(this.size, 1);
    sa.setUsage(THREE.DynamicDrawUsage);
    const aa = new THREE.BufferAttribute(this.alpha, 1);
    aa.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('aSize', sa);
    this.geo.setAttribute('aAlpha', aa);
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPxScale: this.uPxScale, uTint: this.uTint },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'WaterParticles';
    root.add(this.points);
  }

  /** Quality 0..2 -> how many specks of marine snow. */
  setQuality(q: number): void {
    this.snowCount = [60, 140, SNOW_MAX][Math.max(0, Math.min(2, Math.round(q)))];
  }

  /** `n` bubbles rising from (x, y, z), spread = random radius (m). */
  emitBubbles(x: number, y: number, z: number, n: number, spread = 0.25): void {
    for (let k = 0; k < n; k++) {
      const i = this.bubbleCursor;
      this.bubbleCursor = (this.bubbleCursor + 1) % BUBBLES;
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread * 2;
      this.pos[i * 3 + 1] = y + Math.random() * 0.2;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.15;
      this.vel[i * 3 + 1] = 0.55 + Math.random() * 0.7;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      this.size[i] = 0.03 + Math.random() * 0.07;
      this.life[i] = 0;
      this.max[i] = 99;
      this.alpha[i] = 1;
    }
  }

  /** Droplets thrown up from a splash at (x, y, z). strength 0..1+ */
  emitSpray(x: number, y: number, z: number, strength: number): void {
    const n = Math.min(SPRAY, Math.round(14 + strength * 40));
    for (let k = 0; k < n; k++) {
      const i = BUBBLES + this.sprayCursor;
      this.sprayCursor = (this.sprayCursor + 1) % SPRAY;
      const a = Math.random() * Math.PI * 2;
      const h = (0.5 + Math.random() * 1.6) * (0.6 + strength * 0.6);
      this.pos[i * 3] = x + Math.cos(a) * 0.2;
      this.pos[i * 3 + 1] = y + 0.1;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.2;
      this.vel[i * 3] = Math.cos(a) * h * 0.9;
      this.vel[i * 3 + 1] = 2.2 + Math.random() * 3.2 * (0.5 + strength);
      this.vel[i * 3 + 2] = Math.sin(a) * h * 0.9;
      this.size[i] = 0.05 + Math.random() * 0.1;
      this.life[i] = 0;
      this.max[i] = 99;
      this.alpha[i] = 1;
    }
  }

  /**
   * cam = camera world position, under = 0..1 how much the camera is under water, surfaceY = water surface under the camera,
   * pxHeight = drawing buffer height (px), fov in degrees, light = 0..1 brightness of the water (snow colour).
   */
  update(dt: number, time: number, cam: THREE.Vector3, under: number, surfaceY: number, pxHeight: number, fov: number, light: number): void {
    this.uPxScale.value = pxHeight / (2 * Math.tan((fov * Math.PI) / 360));
    this.uTint.value.setRGB(0.55 * light + 0.1, 0.8 * light + 0.1, 0.9 * light + 0.1);

    // bubbles: rise, wobble, pop at the surface
    for (let i = 0; i < BUBBLES; i++) {
      if (this.alpha[i] <= 0) continue;
      this.life[i] += dt;
      const o = i * 3;
      this.pos[o] += (this.vel[o] + Math.sin(time * 4 + i) * 0.06) * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += (this.vel[o + 2] + Math.cos(time * 3.4 + i * 1.7) * 0.06) * dt;
      this.size[i] *= 1 + dt * 0.12;
      if (this.pos[o + 1] >= surfaceY - 0.04 || this.life[i] > 14) {
        this.alpha[i] = 0;
        this.pos[o + 1] = -9999;
      }
    }
    // spray: ballistic
    for (let i = BUBBLES; i < BUBBLES + SPRAY; i++) {
      if (this.alpha[i] <= 0) continue;
      this.life[i] += dt;
      const o = i * 3;
      this.vel[o + 1] -= 9.81 * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < surfaceY - 0.05 && this.life[i] > 0.1) {
        this.alpha[i] = 0;
        this.pos[o + 1] = -9999;
      } else this.alpha[i] = Math.max(0, 1 - this.life[i] / 1.8);
    }
    // marine snow: a box of specks around the camera, only under water
    const s0 = BUBBLES + SPRAY;
    if (!this.snowInit) {
      for (let i = 0; i < SNOW_MAX; i++) {
        const o = (s0 + i) * 3;
        this.pos[o] = cam.x + (Math.random() * 2 - 1) * BOX;
        this.pos[o + 1] = cam.y + (Math.random() * 2 - 1) * BOX * 0.7;
        this.pos[o + 2] = cam.z + (Math.random() * 2 - 1) * BOX;
        this.vel[o] = (Math.random() - 0.5) * 0.12;
        this.vel[o + 1] = -0.02 - Math.random() * 0.07;
        this.vel[o + 2] = (Math.random() - 0.5) * 0.12;
        this.size[s0 + i] = 0.012 + Math.random() * 0.03;
      }
      this.snowInit = true;
    }
    const show = under > 0.05;
    for (let i = 0; i < SNOW_MAX; i++) {
      const idx = s0 + i;
      const o = idx * 3;
      if (!show || i >= this.snowCount) {
        this.alpha[idx] = 0;
        continue;
      }
      this.pos[o] += (this.vel[o] + Math.sin(time * 0.6 + i) * 0.03) * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += (this.vel[o + 2] + Math.cos(time * 0.5 + i * 1.3) * 0.03) * dt;
      let dx = this.pos[o] - cam.x;
      let dy = this.pos[o + 1] - cam.y;
      let dz = this.pos[o + 2] - cam.z;
      const by = BOX * 0.7;
      dx = ((((dx + BOX) % (2 * BOX)) + 2 * BOX) % (2 * BOX)) - BOX;
      dy = ((((dy + by) % (2 * by)) + 2 * by) % (2 * by)) - by;
      dz = ((((dz + BOX) % (2 * BOX)) + 2 * BOX) % (2 * BOX)) - BOX;
      this.pos[o] = cam.x + dx;
      this.pos[o + 1] = cam.y + dy;
      this.pos[o + 2] = cam.z + dz;
      const edge = 1 - Math.max(Math.abs(dx) / BOX, Math.abs(dy) / by, Math.abs(dz) / BOX);
      const nearSurface = Math.min(1, Math.max(0, (surfaceY - this.pos[o + 1]) / 0.6));
      this.alpha[idx] = Math.min(1, edge * 3) * under * nearSurface;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
