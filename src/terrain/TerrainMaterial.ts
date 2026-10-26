import * as THREE from 'three';
import { getGroundTextures, type GroundTextures } from './GroundTextures';

/**
 * Procedural terrain shading (no texture files needed).
 * Built on MeshLambertMaterial so the sun, shadows and fog from three.js keep working;
 * the colour is injected in the fragment shader from HEIGHT and SLOPE:
 *   olive grass + brown soil patches (flat) -> dry grass (high) -> rock (steep / alpine) -> snow (peaks)
 *   sand near sea level, wet dark seabed below it.
 * Detail noise is TRIPLANAR (sampled on 3 planes, blended by the normal) so steep cliffs do not stretch.
 * Real textures can later replace the noise by sampling with the same triplanar weights.
 *
 * Materials: one shared material per LOD, plus short-lived "fading" materials for new chunks
 * (dithered fade-in so chunks do not pop).
 */

const VERT_HEADER = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
attribute vec2 aRoad;
varying vec2 vRoad;
`;

const VERT_BODY = /* glsl */ `
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * normal);
vRoad = aRoad;
`;

const FRAG_HEADER = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec2 vRoad;
uniform vec2 uOrigin;
uniform float uDebugLod;
uniform float uLod;
uniform float uFade;
uniform sampler2D uGrassTex;
uniform sampler2D uDirtTex;
uniform sampler2D uRockTex;
uniform sampler2D uSandTex;
uniform vec3 uGrassMean;
uniform vec3 uDirtMean;
uniform vec3 uRockMean;
uniform vec3 uSandMean;
uniform float uWaterY;      // water surface height near the player (sea level when there is no lake / river around)
uniform float uCaustic;     // 0 = no caustics (quality low), 1 = full
uniform float uCausticTime;
uniform vec2 uWaterCam;     // camera x,z (local) - lakes only affect the ground close to the camera

// Moving light net on the seabed: sun light focused by the waves (tileable, about 18 m per tile).
float evcCaustic(vec2 uv, float t) {
  vec2 p = mod(uv * 0.35, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}

// Texture DETAIL = texture colour / its average, sampled at two scales (so the tile repeat is not visible).
vec3 evcDetail(sampler2D t, vec3 mean, vec2 p, float s1, float s2) {
  vec3 a = texture2D(t, p / s1).rgb / mean;
  vec3 b = texture2D(t, p / s2 + vec2(0.37, 0.61)).rgb / mean;
  return a * mix(vec3(1.0), b, 0.65);
}
// Rock on cliffs: triplanar so the strata do not stretch on steep faces.
vec3 evcRockDetail(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 a = (texture2D(uRockTex, p.yz / 5.0).rgb * w.x + texture2D(uRockTex, p.zx / 5.0).rgb * w.y + texture2D(uRockTex, p.xy / 5.0).rgb * w.z) / uRockMean;
  vec3 b = (texture2D(uRockTex, p.yz / 19.0 + 0.3).rgb * w.x + texture2D(uRockTex, p.zx / 19.0 + 0.3).rgb * w.y + texture2D(uRockTex, p.xy / 19.0 + 0.3).rgb * w.z) / uRockMean;
  return a * mix(vec3(1.0), b, 0.6);
}

float evcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float evcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = evcHash(i);
  float b = evcHash(i + vec2(1.0, 0.0));
  float c = evcHash(i + vec2(0.0, 1.0));
  float d = evcHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Triplanar noise: sample on YZ, ZX and XY planes and blend by normal.
float evcTriNoise(vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  return evcNoise(p.yz * s) * w.x + evcNoise(p.zx * s) * w.y + evcNoise(p.xy * s) * w.z;
}
float evcBayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = x + y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[idx] + 0.5) / 16.0;
}
`;

const FRAG_FADE = /* glsl */ `
if (uFade < 0.999) {
  if (evcBayer4(gl_FragCoord.xy) >= uFade) discard;
}
`;

const FRAG_COLOR = /* glsl */ `
{
  vec3 nrm = normalize(vWNrm);
  float h = vWPos.y;
  vec2 ap = vWPos.xz + uOrigin;           // absolute world x,z (stable when the floating origin moves)
  vec3 p3 = vec3(ap.x, h, ap.y);
  float nLow = evcNoise(ap * 0.004);
  float nMid = evcNoise(ap * 0.03);
  float nHi  = evcTriNoise(p3, nrm, 0.35);
  float nTri = evcTriNoise(p3, nrm, 0.08);
  float slope = 1.0 - nrm.y;

  // Real meadow: fresh green grass with yellow-green and straw patches, and darker natural brown soil showing through in patches.
  vec3 grass = mix(vec3(0.24, 0.36, 0.12), vec3(0.40, 0.49, 0.17), nMid * 0.6 + nHi * 0.4);
  grass = mix(grass, vec3(0.50, 0.50, 0.22), smoothstep(0.55, 0.80, evcNoise(ap * 0.05 + 3.1)) * 0.5); // sunlit yellow-green patches
  vec3 dry   = mix(vec3(0.52, 0.45, 0.25), vec3(0.44, 0.38, 0.21), nMid);
  vec3 soil  = mix(vec3(0.31, 0.23, 0.15), vec3(0.45, 0.34, 0.22), nMid * 0.5 + nHi * 0.5);
  vec3 rock  = mix(vec3(0.34, 0.32, 0.30), vec3(0.55, 0.51, 0.46), nTri * 0.6 + nHi * 0.4);
  vec3 sand  = mix(vec3(0.72, 0.65, 0.45), vec3(0.80, 0.74, 0.55), nHi);
  vec3 snow  = vec3(0.93, 0.95, 0.98);
  vec3 wet   = vec3(0.30, 0.27, 0.19);

  // dry straw already from the lowlands in patches, soil patches (about half of the flat land) with a soft edge
  vec3 col = mix(grass, dry, smoothstep(60.0, 260.0, h + (nLow - 0.5) * 120.0));
  float soilN = evcNoise(ap * 0.0021 + 7.3) * 0.62 + evcNoise(ap * 0.009 + 1.7) * 0.28 + nHi * 0.10;
  float soilAmt = smoothstep(0.50, 0.64, soilN);
  col = mix(col, soil, soilAmt * 0.85);
  // a little soil on steeper ground too (earth shows through where the slope is not yet rock)
  col = mix(col, soil, smoothstep(0.05, 0.14, slope) * 0.45);
  float rockAmt = smoothstep(0.10, 0.26, slope + (nTri - 0.5) * 0.10);
  rockAmt = max(rockAmt, smoothstep(250.0, 420.0, h + (nLow - 0.5) * 120.0) * 0.7);
  col = mix(col, rock, rockAmt);

  float snowAmtPre = smoothstep(340.0, 400.0, h + (nLow - 0.5) * 60.0) * (1.0 - smoothstep(0.30, 0.55, slope));
  float sandAmt = 1.0 - smoothstep(1.5, 7.0 + nMid * 3.0, h);
  col = mix(col, sand, sandAmt * (1.0 - rockAmt * 0.6));
  // SEABED (sea below sea level, lakes / rivers below the water level near the camera): rippled sand, dark algae patches,
  // fading into blue-green gloom with depth - instead of a plain dark mud.
  float inW = smoothstep(-0.1, 0.4, uWaterY - h);
  float lakeGate = abs(uWaterY) < 0.5 ? 1.0 : 1.0 - smoothstep(110.0, 180.0, distance(vWPos.xz, uWaterCam));
  float seaAmt = max(clamp(0.5 - h * 0.35, 0.0, 1.0), inW * lakeGate * 0.8);
  float depthW = max(uWaterY - h, 0.0);
  {
    float ripple = sin(dot(ap, vec2(0.83, 0.56)) * 2.3 + nMid * 7.0 + nHi * 2.0) * 0.5 + 0.5;
    vec3 seabed = mix(vec3(0.66, 0.58, 0.40), vec3(0.50, 0.43, 0.30), ripple * 0.6 + nHi * 0.4);
    seabed = mix(seabed, vec3(0.28, 0.33, 0.24), smoothstep(0.62, 0.80, evcNoise(ap * 0.045 + 9.0)) * 0.7);
    seabed = mix(seabed, vec3(0.09, 0.2, 0.25), 1.0 - exp(-depthW * 0.045));
    col = mix(col, seabed, seaAmt * (1.0 - rockAmt * 0.5));
  }

  // REAL TEXTURE DETAIL: grass blades, soil with pebbles, layered rock, rippled sand (fades out with distance: far land stays calm)
  {
    float camDist = distance(vWPos, cameraPosition);
    float strength = 1.0 - smoothstep(700.0, 2400.0, camDist) * 0.85;
    // Grass texture: LARGER scale (was 2.4 / 9.7 m per tile) and the fine layer fades out with distance, so the lawn no longer shimmers.
    float gNear = 1.0 - smoothstep(10.0, 70.0, camDist);
    vec3 gFine = texture2D(uGrassTex, ap / 5.5).rgb / uGrassMean;
    vec3 gCoarse = texture2D(uGrassTex, ap / 19.0 + vec2(0.37, 0.61)).rgb / uGrassMean;
    vec3 dGrass = mix(vec3(1.0), gFine, 0.7 * gNear) * mix(vec3(1.0), gCoarse, 0.55);
    vec3 dSoil  = evcDetail(uDirtTex, uDirtMean, ap, 3.1, 11.3);
    vec3 dSand  = evcDetail(uSandTex, uSandMean, ap, 2.8, 12.9);
    vec3 dRock  = evcRockDetail(p3, nrm);
    float wSoil = clamp(soilAmt * 0.85 + smoothstep(0.05, 0.14, slope) * 0.45, 0.0, 1.0);
    vec3 det = mix(dGrass, dSoil, wSoil);
    det = mix(det, dRock, rockAmt);
    det = mix(det, dSand, sandAmt * (1.0 - rockAmt * 0.6));
    det = mix(det, vec3(1.0), clamp(snowAmtPre, 0.0, 1.0) * 0.8);
    col *= mix(vec3(1.0), det, strength);
    // the wet seabed stays dark and plain
    col = mix(col, col * 0.9, clamp(0.5 - h * 0.25, 0.0, 1.0));
  }
  float causticAmt = uCaustic * inW * lakeGate * smoothstep(0.0, 0.6, depthW) * (1.0 - smoothstep(2.0, 20.0, depthW));

  float snowAmt = smoothstep(340.0, 400.0, h + (nLow - 0.5) * 60.0) * (1.0 - smoothstep(0.30, 0.55, slope));
  col = mix(col, snow, snowAmt);

  // STAGE 6: concrete road surface and gravel shoulder. Far LODs use this colour; LOD0/1 also get detailed ribbons.
  col = mix(col, vec3(0.43, 0.40, 0.34), vRoad.y * 0.9);
  col = mix(col, vec3(0.46, 0.47, 0.48) * 0.97 + nHi * 0.025, vRoad.x);

  col = pow(col, vec3(2.2));              // authored in sRGB-ish values, shader works in linear
  if (causticAmt > 0.002) {
    float cz = evcCaustic(ap, uCausticTime);
    col *= 1.0 + cz * causticAmt * 2.6 * clamp(nrm.y, 0.0, 1.0);
  }
  diffuseColor.rgb = col;

  if (uDebugLod > 0.5) {
    vec3 lc = uLod < 0.5 ? vec3(0.1, 0.8, 0.1) : uLod < 1.5 ? vec3(0.9, 0.8, 0.1) : uLod < 2.5 ? vec3(0.95, 0.4, 0.05) : vec3(0.4, 0.2, 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, lc, 0.7);
  }
}
`;

export class TerrainMaterials {
  /** Absolute world x,z of the floating origin (updated on origin:shift). */
  private uOrigin = { value: new THREE.Vector2() };
  private uDebugLod = { value: 0 };
  private uWaterY = { value: 0 };
  private uCaustic = { value: 0 };
  private uCausticTime = { value: 0 };
  private uWaterCam = { value: new THREE.Vector2() };
  private wireframe = false;
  private shared: THREE.MeshLambertMaterial[] = [];
  private all = new Set<THREE.MeshLambertMaterial>();
  private ground: GroundTextures = getGroundTextures();

  constructor(lodCount: number) {
    for (let lod = 0; lod < lodCount; lod++) this.shared.push(this.make(lod, { value: 1 }));
  }

  getShared(lod: number): THREE.MeshLambertMaterial {
    return this.shared[lod];
  }

  /** A material with its own fade uniform (0 = invisible, 1 = fully drawn). Dispose with `disposeFading`. */
  createFading(lod: number): { material: THREE.MeshLambertMaterial; fade: { value: number } } {
    const fade = { value: 0 };
    return { material: this.make(lod, fade), fade };
  }

  disposeFading(m: THREE.Material): void {
    this.all.delete(m as THREE.MeshLambertMaterial);
    m.dispose();
  }

  setOrigin(x: number, z: number): void {
    this.uOrigin.value.set(x, z);
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    for (const m of this.all) m.wireframe = on;
  }

  /** Water the player is near: surface height, caustic strength 0..1, clock, camera local x / z (see water/Underwater.ts). */
  setWater(waterY: number, caustic: number, time: number, camX: number, camZ: number): void {
    this.uWaterY.value = waterY;
    this.uCaustic.value = caustic;
    this.uCausticTime.value = time * 0.8;
    this.uWaterCam.value.set(camX, camZ);
  }

  setLodColors(on: boolean): void {
    this.uDebugLod.value = on ? 1 : 0;
  }

  get isWireframe(): boolean {
    return this.wireframe;
  }
  get isLodColors(): boolean {
    return this.uDebugLod.value > 0.5;
  }

  dispose(): void {
    for (const m of this.all) m.dispose();
    this.all.clear();
  }

  private make(lod: number, uFade: { value: number }): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, wireframe: this.wireframe });
    const uLod = { value: lod };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uOrigin = this.uOrigin;
      shader.uniforms.uDebugLod = this.uDebugLod;
      shader.uniforms.uWaterY = this.uWaterY;
      shader.uniforms.uCaustic = this.uCaustic;
      shader.uniforms.uCausticTime = this.uCausticTime;
      shader.uniforms.uWaterCam = this.uWaterCam;
      shader.uniforms.uLod = uLod;
      shader.uniforms.uFade = uFade;
      const G = this.ground;
      shader.uniforms.uGrassTex = { value: G.grass };
      shader.uniforms.uDirtTex = { value: G.dirt };
      shader.uniforms.uRockTex = { value: G.rock };
      shader.uniforms.uSandTex = { value: G.sand };
      shader.uniforms.uGrassMean = { value: G.grassMean };
      shader.uniforms.uDirtMean = { value: G.dirtMean };
      shader.uniforms.uRockMean = { value: G.rockMean };
      shader.uniforms.uSandMean = { value: G.sandMean };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEADER)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEADER)
        .replace('void main() {', 'void main() {\n' + FRAG_FADE)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
    };
    m.customProgramCacheKey = () => 'evc-terrain-v8-seabed-caustics';
    this.all.add(m);
    return m;
  }
}
