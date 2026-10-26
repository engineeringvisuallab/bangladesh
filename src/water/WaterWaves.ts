/**
 * Ocean waves shared by the water shader (GPU) and the game code (CPU: boats, swimmer, camera).
 *
 * A handful of Gerstner waves summed up. The shader and `waveHeight()` use the SAME table, so a boat or a
 * swimmer rides exactly the surface that is drawn. All positions are ABSOLUTE world metres (not floating-origin local).
 */

export interface WaveDef {
  /** Wavelength (m). */
  len: number;
  /** Amplitude (m) at full sea state. */
  amp: number;
  /** Direction of travel (radians, 0 = +X). */
  dir: number;
  /** Steepness 0..1 (how sharp the crests are). */
  steep: number;
}

/** Long swell first, short chop last. The first WAVE_VERTEX_COUNT move the mesh; all of them shape the shading. */
export const WAVES: readonly WaveDef[] = [
  { len: 64, amp: 0.55, dir: 0.35, steep: 0.55 },
  { len: 41, amp: 0.34, dir: 1.05, steep: 0.5 },
  { len: 29, amp: 0.22, dir: -0.45, steep: 0.5 },
  { len: 19, amp: 0.13, dir: 0.8, steep: 0.45 },
  { len: 11, amp: 0.06, dir: -1.1, steep: 0.4 },
  { len: 6.5, amp: 0.03, dir: 1.7, steep: 0.35 },
  { len: 3.8, amp: 0.015, dir: -0.1, steep: 0.3 },
];

export const WAVE_COUNT = WAVES.length;
const G = 9.81;
/** 3 x the vertex spacing (m) of the finest water mesh (500 m chunk / 128 cells): waves shorter than this are not part of the mesh. */
const NEAR_FADE = (3 * 500) / 128;

/** Shared clock: WaterMaterial.update() writes it, the CPU functions read it. */
export const WaterClock = { time: 0, /** how many waves move the mesh (quality setting), same as the vertex shader */ vertexWaves: 4 };

/** Sea state 0..1 (slowly changing wind). Same formula is used in the shader through uSeaState. */
export function seaStateAt(t: number): number {
  return 0.78 + 0.22 * Math.sin(t * 0.045) * Math.sin(t * 0.0173 + 1.3);
}

/**
 * How strongly waves act on a body of water: sea 1, lakes about a third, rivers almost flat,
 * and zero at the shore line (depth 0). `level` = water surface height (m), `flowSpeed` = current (m/s), `depth` = water depth (m).
 */
export function waveScale(level: number, flowSpeed: number, depth: number): number {
  const sea = 1 - smooth(0.3, 1.5, Math.abs(level));
  const base = 0.35 + 0.65 * sea;
  const river = smooth(0.15, 0.8, flowSpeed);
  const shallow = smooth(0.15, 4.0, depth);
  return (base * (1 - river) + 0.06 * river) * shallow;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Vertical wave offset (m) of the water surface at absolute world (x, z).
 * `scale` comes from waveScale(). Long waves only (the ones that also move the mesh).
 */
export function waveHeight(x: number, z: number, scale: number, t: number = WaterClock.time, count: number = WaterClock.vertexWaves): number {
  if (scale <= 0.0001) return 0;
  const sea = seaStateAt(t);
  let y = 0;
  const n = Math.min(count, WAVE_COUNT);
  for (let i = 0; i < n; i++) {
    const w = WAVES[i];
    const fade = smooth(NEAR_FADE, NEAR_FADE * 2, w.len); // the near mesh (3.9 m grid) only shows waves it can resolve, like the shader
    if (fade <= 0) continue;
    const k = (2 * Math.PI) / w.len;
    const c = Math.sqrt(G / k);
    const dx = Math.cos(w.dir);
    const dz = Math.sin(w.dir);
    y += fade * w.amp * Math.sin(k * (dx * x + dz * z) - k * c * t);
  }
  return y * scale * sea;
}

/** GLSL helpers (vertex + fragment). `uWaveTime`, `uSeaState` uniforms must exist. */
export const WAVE_GLSL = /* glsl */ `
const int WAVE_N = ${WAVE_COUNT};
const float WAVE_LEN[WAVE_N] = float[WAVE_N](${WAVES.map((w) => w.len.toFixed(2)).join(', ')});
const float WAVE_AMP[WAVE_N] = float[WAVE_N](${WAVES.map((w) => w.amp.toFixed(4)).join(', ')});
const float WAVE_DIR[WAVE_N] = float[WAVE_N](${WAVES.map((w) => w.dir.toFixed(4)).join(', ')});
const float WAVE_STEEP[WAVE_N] = float[WAVE_N](${WAVES.map((w) => w.steep.toFixed(3)).join(', ')});
uniform float uWaveTime;
uniform float uSeaState;
uniform float uWaveCount;

// Sum of Gerstner waves at absolute position p. Returns displacement (xyz) and, via 'slope', the surface slope (dh/dx, dh/dz).
// Waves shorter than minLen are skipped, and fade in over the next fadeLen metres (grid too coarse / too far away to resolve).
vec3 gerstner(vec2 p, float scale, float minLen, float fadeLen, int count, out vec2 slope) {
  vec3 d = vec3(0.0);
  slope = vec2(0.0);
  for (int i = 0; i < WAVE_N; i++) {
    if (i >= count) break;
    float len = WAVE_LEN[i];
    float fade = smoothstep(minLen, minLen + fadeLen, len);
    if (fade <= 0.0) continue;
    float k = 6.2831853 / len;
    float c = sqrt(9.81 / k);
    vec2 dir = vec2(cos(WAVE_DIR[i]), sin(WAVE_DIR[i]));
    float ph = k * dot(dir, p) - k * c * uWaveTime;
    float A = WAVE_AMP[i] * scale * uSeaState * fade;
    float s = sin(ph);
    float co = cos(ph);
    float Q = WAVE_STEEP[i];
    d.xz += dir * (Q * A * co);
    d.y += A * s;
    slope += dir * (A * k * co);
  }
  return d;
}
`;
