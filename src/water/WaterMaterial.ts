import * as THREE from 'three';
import { WAVE_GLSL, WaterClock, seaStateAt } from './WaterWaves';

const VERT = /* glsl */ `
attribute float aDepth;
attribute vec2 aFlow;
attribute float aStep;
uniform vec2 uOrigin;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNrm;
varying vec2 vAbs;
varying float vScale;
varying float vLevel;
varying float vCrest;
#include <fog_pars_vertex>
${WAVE_GLSL}

float waveScaleGL(float level, float flowSpeed, float depth) {
  float sea = 1.0 - smoothstep(0.3, 1.5, abs(level));
  float base = 0.35 + 0.65 * sea;
  float river = smoothstep(0.15, 0.8, flowSpeed);
  float shallow = smoothstep(0.15, 4.0, depth);
  return (base * (1.0 - river) + 0.06 * river) * shallow;
}

void main() {
  vDepth = aDepth;
  vFlow = aFlow;
  vNrm = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vLevel = wp.y;
  vAbs = wp.xz + uOrigin;
  float scale = waveScaleGL(wp.y, length(aFlow), aDepth);
  vScale = scale;
  vec2 slope;
  int cnt = min(int(uWaveCount), 4);
  // Only waves the grid can resolve move the mesh (4 vertices per wavelength at least); coarse far chunks stay flat.
  vec3 d = gerstner(vAbs, scale, aStep * 3.0, aStep * 3.0, cnt, slope);
  wp.xyz += d;
  vCrest = clamp(d.y / (0.75 * scale * uSeaState + 0.0001), -1.0, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uUnderColor;
uniform float uDetail;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNrm;
varying vec2 vAbs;
varying float vScale;
varying float vLevel;
varying float vCrest;
#include <fog_pars_fragment>
${WAVE_GLSL}

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 ap = vAbs;                          // absolute world position -> stable ripples when the origin moves
  vec3 n0 = normalize(vNrm);
  float speed = length(vFlow);
  float dist = length(cameraPosition - vWPos);

  // Ripples scroll with the flow (rivers) or slowly with the wind (lakes, sea).
  vec2 drift = vFlow * uTime * 0.9 + vec2(0.6, 0.3) * uTime * 0.35;
  float e = 0.3;
  vec2 p1 = ap * 0.16 - drift;
  float a0 = wNoise(p1);
  vec2 g1 = vec2(wNoise(p1 + vec2(e, 0.0)) - a0, wNoise(p1 + vec2(0.0, e)) - a0) / e;
  vec2 g2 = vec2(0.0);
  if (uDetail > 0.5) {
    vec2 p2 = ap * 0.55 - drift * 1.7 + 17.0;
    float b0 = wNoise(p2);
    g2 = vec2(wNoise(p2 + vec2(e, 0.0)) - b0, wNoise(p2 + vec2(0.0, e)) - b0) / e;
  }
  float rip = (0.22 + clamp(speed * 0.07, 0.0, 0.45)) * (1.0 - smoothstep(150.0, 900.0, dist) * 0.7);
  vec2 g = (g1 * 0.5 + g2 * 0.25) * rip;

  // Every wave of the table shapes the shading, short ones fade out with distance (no shimmering at the horizon).
  vec2 ws;
  gerstner(vAbs, vScale, dist * 0.02, dist * 0.03 + 0.6, int(uWaveCount), ws);
  vec3 N = normalize(vec3(n0.x - g.x - ws.x, n0.y, n0.z - g.y - ws.y));

  vec3 V = normalize(cameraPosition - vWPos);
  float fn = wNoise(ap * 1.3 - drift * 2.5) * 0.6 + wNoise(ap * 3.1 + drift) * 0.4;

  // ------------------------------------------------------------------ seen from UNDER the surface
  if (!gl_FrontFacing) {
    vec3 I = -V;                           // from the camera up to the surface
    vec3 Nd = -N;                          // normal pointing down, towards the camera
    float cosI = clamp(dot(-I, Nd), 0.0, 1.0);
    vec3 T = refract(I, Nd, 1.33);         // water -> air
    float tir = dot(T, T) < 0.001 ? 1.0 : 0.0;
    vec3 skyT = mix(uHorizon, uZenith, pow(clamp(T.y, 0.0, 1.0), 0.55));
    float sT = max(dot(T, uSunDir), 0.0);
    skyT += uSunColor * (pow(sT, 160.0) * 2.5 + pow(sT, 16.0) * 0.35);
    skyT *= vec3(0.62, 0.9, 1.0);          // the sky seen through water is blue-green and a little dimmer
    // Snell's window: inside ~49 degrees you see the sky, outside it the surface is a silvery mirror of the sea around you
    float F = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
    F = max(F, 1.0 - smoothstep(0.62, 0.74, cosI));
    F = mix(F, 1.0, tir);
    vec3 mirror = uUnderColor * (0.9 + 0.8 * fn) + vec3(0.04, 0.09, 0.1) * smoothstep(0.55, 0.9, fn);
    vec3 colU = mix(skyT, mirror, F);
    gl_FragColor = vec4(colU, mix(0.9, 1.0, F));
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }

  // ------------------------------------------------------------------ seen from ABOVE
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
  float s = max(dot(R, uSunDir), 0.0);
  sky += uSunColor * (pow(s, 350.0) * 3.0 + pow(s, 28.0) * 0.25);

  float dd = max(vDepth, 0.0);
  // Clear tropical water: turquoise where it is shallow (you see the sand through it), deep blue further out.
  vec3 shallow = vec3(0.05, 0.36, 0.38);
  vec3 mid = vec3(0.02, 0.2, 0.3);
  vec3 deep = vec3(0.004, 0.04, 0.12);
  vec3 body = mix(shallow, mid, 1.0 - exp(-dd * 0.35));
  body = mix(body, deep, 1.0 - exp(-dd * 0.07));
  // light scattering inside the swell: crests glow turquoise
  float sss = smoothstep(0.35, 1.0, vCrest) * (0.4 + 0.6 * max(dot(normalize(vec3(uSunDir.x, 0.0, uSunDir.z)), -normalize(vec3(V.x, 0.0, V.z))), 0.0));
  body += vec3(0.04, 0.3, 0.26) * sss * vScale;
  vec3 col = mix(body, sky, fres * 0.9 + 0.04);

  // Foam: shore wash, wave crests, steep water (waterfalls, cascades) and fast water
  float steep = 1.0 - n0.y;
  float swash = 0.5 + 0.5 * sin(uTime * 0.8 + vAbs.x * 0.021 + vAbs.y * 0.017 + fn * 3.0);
  float edge = dd - swash * 0.9;
  float shore = (1.0 - smoothstep(0.0, 0.7, abs(edge))) * smoothstep(0.3, 0.75, fn) + (1.0 - smoothstep(0.0, 0.35, dd)) * 0.6;
  float crest = smoothstep(0.78, 1.0, vCrest) * smoothstep(0.45, 0.8, fn) * smoothstep(0.6, 2.5, dd) * vScale;
  float fall = smoothstep(0.12, 0.45, steep) * smoothstep(0.25, 0.65, fn + 0.25);
  float fast = smoothstep(2.5, 6.0, speed) * smoothstep(0.55, 0.85, fn) * 0.6;
  float foam = clamp(shore * 0.85 + crest * 0.7 + fall + fast, 0.0, 1.0);
  col = mix(col, vec3(0.88, 0.93, 0.97), foam);

  // Clear in the shallows (the seabed shows through), opaque only where it is deep.
  float alpha = mix(0.16, 0.93, 1.0 - exp(-dd * 0.3));
  alpha = max(alpha, fres * 0.9 + 0.05);
  alpha = max(alpha, foam * 0.95);
  alpha *= smoothstep(-0.05, 0.3, vDepth);

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Uniforms shared with the sky so water reflects the same sky colours and sun. */
export interface SkyUniforms {
  uHorizon: { value: THREE.Color };
  uZenith: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
}

/** Water quality: how many waves, how much detail. 0 = low, 1 = medium, 2 = high. */
export const WATER_WAVES_BY_QUALITY = [3, 5, 7] as const;

/**
 * One water material for rivers, lakes and sea: Gerstner waves (mesh + shading), fresnel sky reflection, sun glint,
 * foam on crests and shores, clear shallows. Double sided: from under the surface you see Snell's window.
 */
export class WaterMaterial {
  readonly material: THREE.ShaderMaterial;
  private uTime = { value: 0 };
  private uOrigin = { value: new THREE.Vector2() };
  private uWaveTime = { value: 0 };
  private uSeaState = { value: 1 };
  private uWaveCount = { value: 5 };
  private uDetail = { value: 1 };
  /** Colour of the water body seen from inside (the Underwater system keeps it up to date). */
  readonly uUnderColor = { value: new THREE.Color(0.02, 0.2, 0.3) };

  constructor(sky: SkyUniforms) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    // UniformsUtils.merge clones values; bind our shared uniform objects so updates reach the shader.
    const u = this.material.uniforms;
    u.uTime = this.uTime;
    u.uOrigin = this.uOrigin;
    u.uWaveTime = this.uWaveTime;
    u.uSeaState = this.uSeaState;
    u.uWaveCount = this.uWaveCount;
    u.uDetail = this.uDetail;
    u.uUnderColor = this.uUnderColor;
    u.uSunDir = sky.uSunDir;
    u.uSunColor = sky.uSunColor;
    u.uHorizon = sky.uHorizon;
    u.uZenith = sky.uZenith;
    this.setQuality(1);
  }

  /** 0 low (3 waves), 1 medium (5), 2 high (7 + fine ripples). */
  setQuality(q: number): void {
    const i = Math.max(0, Math.min(2, Math.round(q)));
    this.uWaveCount.value = WATER_WAVES_BY_QUALITY[i];
    this.uDetail.value = i >= 1 ? 1 : 0;
    WaterClock.vertexWaves = Math.min(4, WATER_WAVES_BY_QUALITY[i]);
  }

  update(time: number, originX: number, originZ: number): void {
    this.uTime.value = time;
    this.uWaveTime.value = time;
    this.uSeaState.value = seaStateAt(time);
    WaterClock.time = time;
    this.uOrigin.value.set(originX, originZ);
  }

  dispose(): void {
    this.material.dispose();
  }
}
