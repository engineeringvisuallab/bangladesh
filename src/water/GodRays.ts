import * as THREE from 'three';

const VERT = /* glsl */ `
uniform vec2 uShear;
uniform float uTop;
varying vec2 vUv;
varying vec3 vWPos;
varying float vSeed;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xz += uShear * (wp.y - uTop);      // the beam leans away from the sun the deeper it goes
  vWPos = wp.xyz;
  vSeed = modelMatrix[3].x * 0.013 + modelMatrix[3].z * 0.017;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uColor;
uniform vec3 uCam;
varying vec2 vUv;
varying vec3 vWPos;
varying float vSeed;
void main() {
  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
  edge = edge * edge;
  float fall = pow(vUv.y, 1.25);                         // 1 at the surface, 0 at the bottom of the beam
  float flick = 0.6 + 0.4 * sin(uTime * 0.7 + vSeed * 40.0 + vUv.y * 2.5) * sin(uTime * 0.43 + vSeed * 17.0);
  float d = distance(vWPos, uCam);
  float camFade = (1.0 - smoothstep(16.0, 44.0, d)) * smoothstep(1.2, 5.0, d);
  float a = edge * fall * flick * camFade * uStrength;
  gl_FragColor = vec4(uColor, a);
}
`;

const RAYS = 28;
const RANGE = 48; // rays are wrapped around the camera in a square of this half size

/** Sun beams in the water: soft additive planes from the surface down, drifting with the waves' light. Only while under water. */
export class GodRays {
  private group = new THREE.Group();
  private geo = new THREE.PlaneGeometry(1, 1);
  private mat: THREE.ShaderMaterial;
  private rays: { mesh: THREE.Mesh; x: number; z: number }[] = [];
  private uTime = { value: 0 };
  private uStrength = { value: 0 };
  private uShear = { value: new THREE.Vector2() };
  private uTop = { value: 0 };
  private uColor = { value: new THREE.Color(0.55, 0.9, 0.95) };
  private uCam = { value: new THREE.Vector3() };
  private count = 20;

  constructor(root: THREE.Object3D) {
    this.geo.translate(0, -0.5, 0); // top edge at y = 0
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: this.uTime, uStrength: this.uStrength, uShear: this.uShear, uTop: this.uTop, uColor: this.uColor, uCam: this.uCam },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < RAYS; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.rotation.y = Math.random() * Math.PI;
      const w = 2.2 + Math.random() * 4.5;
      mesh.scale.set(w, 34 + Math.random() * 18, 1);
      this.group.add(mesh);
      this.rays.push({ mesh, x: (Math.random() * 2 - 1) * RANGE, z: (Math.random() * 2 - 1) * RANGE });
    }
    this.group.visible = false;
    this.group.name = 'GodRays';
    root.add(this.group);
  }

  /** 0 = off, 1 = a few beams, 2 = many. */
  setQuality(q: number): void {
    this.count = [0, 14, RAYS][Math.max(0, Math.min(2, Math.round(q)))];
  }

  /**
   * cam = camera world position, surfaceY = water surface there, under 0..1, sunDir = direction to the sun,
   * daylight 0..1, tint = water colour (beams are a lighter version of it).
   */
  update(time: number, cam: THREE.Vector3, surfaceY: number, under: number, sunDir: THREE.Vector3, daylight: number, tint: THREE.Color): void {
    const on = under > 0.02 && this.count > 0 && sunDir.y > 0.05 && daylight > 0.02;
    this.group.visible = on;
    if (!on) return;
    this.uTime.value = time;
    this.uCam.value.copy(cam);
    this.uTop.value = surfaceY;
    this.uStrength.value = under * Math.min(1, sunDir.y * 1.8) * daylight * 0.2;
    // light bends towards the vertical when it enters the water, so the beams are steeper than the sun
    const k = 0.4 / Math.max(sunDir.y, 0.25);
    this.uShear.value.set(sunDir.x * k, sunDir.z * k); // shader: shift = shear * (y - top), y - top < 0 -> away from the sun
    this.uColor.value.setRGB(0.5 + tint.r * 0.6, 0.85 + tint.g * 0.2, 0.9 + tint.b * 0.2);
    for (let i = 0; i < RAYS; i++) {
      const r = this.rays[i];
      r.mesh.visible = i < this.count;
      if (i >= this.count) continue;
      let dx = r.x - cam.x;
      let dz = r.z - cam.z;
      dx = ((((dx + RANGE) % (2 * RANGE)) + 2 * RANGE) % (2 * RANGE)) - RANGE;
      dz = ((((dz + RANGE) % (2 * RANGE)) + 2 * RANGE) % (2 * RANGE)) - RANGE;
      r.mesh.position.set(cam.x + dx, surfaceY, cam.z + dz);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
