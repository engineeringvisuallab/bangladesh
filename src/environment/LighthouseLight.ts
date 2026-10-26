// LIGHTHOUSE LIGHT (বাতিঘর): the lantern room of the lighthouse in the sea shines at night.
//   - two opposite beams that sweep round slowly (one turn in ~12 s), long enough to be seen across the bay, drawn additively
//   - a bright glow at the lantern (seen from far away) and one warm PointLight that lights the tower, the rocks and the water nearby
// It stands on its own at the lantern's world position, NOT inside the building model: the building is only built when the player is
// within ~2 km, but the light must be visible from much farther away. Children use ABSOLUTE world coordinates (parent = world.root).
import * as THREE from 'three';

/** Height of the lantern above the lighthouse floor: = ty + 1.8 in buildLighthouse() (src/buildings/models/luxury.ts: 4.8 + 1.4 + 30 + 1.8). */
export const LIGHTHOUSE_LANTERN_HEIGHT = 38;

const BEAM_LENGTH = 1500;
const BEAM_RADIUS = 70; // at the far end
/** Turn speed of the beams (rad / s): one turn in about 12.5 s. */
const TURN = 0.5;

const BEAM_VERT = /* glsl */ `
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main() {
  vT = clamp(position.x / ${BEAM_LENGTH.toFixed(1)}, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform float uOn;
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main() {
  // bright along the axis, soft at the edges (the cone surface turns away from the eye there), fading with distance
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = uOn * edge * pow(1.0 - vT, 1.3) * smoothstep(0.0, 0.015, vT) * 0.55;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * a, 1.0);
}
`;

const GLOW_VERT = /* glsl */ `
uniform float uScale;
uniform float uOn;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1.0);
  gl_PointSize = clamp(60.0 * uScale / dist, 14.0, 220.0);
  vA = uOn;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  float core = exp(-r * r * 14.0);
  float halo = pow(max(1.0 - r, 0.0), 2.4) * 0.6;
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.62) * (core + halo) * vA, 1.0);
}
`;

export class LighthouseLight {
  readonly group = new THREE.Group();
  private beams = new THREE.Group();
  private beamMat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;
  private glow: THREE.Points;
  private light: THREE.PointLight;
  private geos: THREE.BufferGeometry[] = [];

  /** floorY = the height of the lighthouse floor (PlacedBuildings.floorYOf('lighthouse')). */
  constructor(parent: THREE.Object3D, readonly x: number, floorY: number, readonly z: number) {
    const y = floorY + LIGHTHOUSE_LANTERN_HEIGHT;
    this.group.position.set(x, y, z);

    // a beam = an open cone lying along +X: thin at the lantern, wide at the far end
    const cone = new THREE.CylinderGeometry(BEAM_RADIUS, 0.6, BEAM_LENGTH, 20, 1, true);
    cone.rotateZ(-Math.PI / 2); // +Y -> +X : the wide end (top) now points along +X
    cone.rotateZ(-0.012); // a hair downwards, so the beam skims the sea
    cone.translate(BEAM_LENGTH / 2, 0, 0);
    this.geos.push(cone);
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uOn: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const b1 = new THREE.Mesh(cone, this.beamMat);
    const b2 = new THREE.Mesh(cone, this.beamMat);
    b2.rotation.y = Math.PI;
    for (const b of [b1, b2]) {
      b.frustumCulled = false;
      b.renderOrder = 5;
      this.beams.add(b);
    }
    this.group.add(this.beams);

    // glow at the lantern
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geos.push(g);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uScale: { value: 800 }, uOn: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // the lantern glass is part of the tower: let the glow show over it
      fog: false,
    });
    this.glow = new THREE.Points(g, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
    this.group.add(this.glow);

    // one warm light for the tower, the rocks and the sea around (always in the scene, intensity 0 by day: adding / removing a light
    // later would recompile every material)
    this.light = new THREE.PointLight(0xffdca0, 0, 190, 1.6);
    this.group.add(this.light);

    parent.add(this.group);
    this.update(0, 0, 70, 800);
  }

  /** Once per rendered frame. on = 0 (day) .. 1 (night), time = seconds, fovDeg / viewportPx for the glow size. */
  update(on: number, time: number, fovDeg: number, viewportPx: number): void {
    // the PointLight itself stays "visible" all the time (a light that comes and goes would recompile every material): only its intensity changes
    this.beams.visible = this.glow.visible = on > 0.01;
    this.light.intensity = on * 260;
    this.beamMat.uniforms.uOn.value = on;
    this.glowMat.uniforms.uOn.value = on;
    this.glowMat.uniforms.uScale.value = viewportPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.beams.rotation.y = time * TURN;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.beamMat.dispose();
    this.glowMat.dispose();
    this.light.dispose();
  }
}
