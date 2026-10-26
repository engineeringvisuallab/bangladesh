import * as THREE from 'three';
import type { PeopleManager } from '../people';
import type { TerrainGenerator } from '../terrain';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { Vehicle } from './Vehicle';
import type { VehicleManager } from './VehicleManager';
import type { VehicleSpec } from './VehicleSpec';
import { groundY, wheelDefs } from './VehicleSpec';

/**
 * Realistic vehicle fire (visuals, physics, spreading, heat and sound). Used for every vehicle; the bus burns the biggest and longest.
 *
 * Physics (per particle, world space):
 *  - flames: hot gas, buoyancy follows its temperature (cools exponentially), turbulence, air drag, entrainment towards the plume axis,
 *    colour from a black-body-like ramp (white-yellow core -> orange -> red -> dark), additive blending
 *  - smoke: buoyant while it is warm, then drifts with the wind (stronger higher up, so the plume bends), expands as it mixes with air,
 *    soot-black near the fire and grey further away, lit orange from below by the flames
 *  - embers / sparks: lifted by the updraft, then fall (gravity + drag), blow downwind and die on the ground
 *  - the burning vehicle's velocity is inherited, so a burning car leaves a trail
 *
 * Fire development: engine bay -> windows blow out and the cabin burns -> roof and tyres burn (tyres pop). After the wreck stage the fuel
 * runs out slowly (a bus burns for minutes, a bike for seconds). EVs burn as a battery fire: venting jets, hiss, white smoke, long burn.
 * Heat: people and vehicles close to a big fire are hurt, so a burning bus can set the car next to it alight.
 *
 * Sound (Web Audio, no files): low roar + mid rumble, breathing hiss, two looping crackle layers (fine crackle + sparse pops), plus one-shots:
 * ignition whoosh, window glass cracking, tyre blow-outs, fuel flare-ups, thermal metal pings, battery vents. Distance volume + muffling + stereo pan.
 */

export interface FireAudioHandle {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

export interface VehicleFireDeps {
  scene: THREE.Scene;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  people: PeopleManager;
  vehicles: VehicleManager;
  /** Shared audio context (null until audio is allowed). */
  audio: () => FireAudioHandle | null;
  muted: () => boolean;
}

// ------------------------------------------------------------------------------------------------ profiles

interface Prof {
  /** Seconds of fire after the vehicle is a wreck (the fuel load). */
  burn: number;
  /** Seconds from ignition to a fully involved fire. */
  grow: number;
  battery: boolean;
  /** Has a fuel tank that can flare up. */
  fuelTank: boolean;
  /** 0..1 how black the smoke is. */
  soot: number;
  windows: number;
  engine: 'front' | 'rear' | 'mid';
}

const PROF: Record<string, Prof> = {
  sedan: { burn: 55, grow: 9, battery: false, fuelTank: true, soot: 0.8, windows: 2, engine: 'front' },
  jeep: { burn: 65, grow: 9, battery: false, fuelTank: true, soot: 0.85, windows: 2, engine: 'front' },
  hypercar: { burn: 160, grow: 7, battery: true, fuelTank: false, soot: 0.45, windows: 2, engine: 'mid' },
  evhypar: { burn: 210, grow: 9, battery: true, fuelTank: false, soot: 0.5, windows: 3, engine: 'mid' },
  suprim: { burn: 200, grow: 9, battery: true, fuelTank: false, soot: 0.5, windows: 3, engine: 'mid' },
  evbike: { burn: 90, grow: 5, battery: true, fuelTank: false, soot: 0.4, windows: 0, engine: 'mid' },
  bike: { burn: 30, grow: 5, battery: false, fuelTank: true, soot: 0.7, windows: 0, engine: 'mid' },
  auto: { burn: 45, grow: 7, battery: false, fuelTank: true, soot: 0.75, windows: 0, engine: 'rear' },
  rickshaw: { burn: 28, grow: 6, battery: false, fuelTank: false, soot: 0.6, windows: 0, engine: 'mid' },
  bus: { burn: 170, grow: 16, battery: false, fuelTank: true, soot: 1, windows: 8, engine: 'rear' },
  tank: { burn: 80, grow: 10, battery: false, fuelTank: true, soot: 0.9, windows: 0, engine: 'rear' },
};

// ------------------------------------------------------------------------------------------------ helpers

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rnd = Math.random;

const C: number[] = [0, 0, 0];
/** Black-body-like flame colour for a temperature 0..1 (sRGB, written to the shared array C). */
function fireColor(h: number): number[] {
  const x = clamp(h, 0, 1);
  if (x > 0.72) {
    const t = (x - 0.72) / 0.28;
    C[0] = 1;
    C[1] = 0.62 + 0.32 * t;
    C[2] = 0.16 + 0.5 * t;
  } else if (x > 0.38) {
    const t = (x - 0.38) / 0.34;
    C[0] = 0.95 + 0.05 * t;
    C[1] = 0.26 + 0.36 * t;
    C[2] = 0.04 + 0.12 * t;
  } else {
    const t = x / 0.38;
    C[0] = 0.25 + 0.7 * t;
    C[1] = 0.04 + 0.22 * t;
    C[2] = 0.02 + 0.02 * t;
  }
  return C;
}

function makeTexture(kind: 'flame' | 'smoke' | 'glow'): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  const blob = (x: number, y: number, r: number, a: number, soft: number): void => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(soft, `rgba(255,255,255,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  };
  if (kind === 'flame') {
    blob(S / 2, S / 2, S * 0.5, 1, 0.35);
    for (let i = 0; i < 6; i++) blob(S * (0.3 + rnd() * 0.4), S * (0.3 + rnd() * 0.4), S * (0.16 + rnd() * 0.12), 0.5, 0.4);
  } else if (kind === 'smoke') {
    blob(S / 2, S / 2, S * 0.5, 0.75, 0.3);
    for (let i = 0; i < 10; i++) blob(S * (0.2 + rnd() * 0.6), S * (0.2 + rnd() * 0.6), S * (0.14 + rnd() * 0.16), 0.38, 0.5);
  } else {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.08)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ instanced billboards

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
varying float vFade;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot);
  float s = sin(aRot);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize;
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vColor = aColor;
  vFade = clamp((-mv.z - 0.6) / 2.2, 0.0, 1.0); // dissolve when right in front of the camera
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vFade;
void main() {
  float a = texture2D(uMap, vUv).a * vColor.a * vFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`;

/** One draw call of camera-facing quads; positions are written every frame. */
class Sprites {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: THREE.InstancedBufferAttribute;
  private size: THREE.InstancedBufferAttribute;
  private rot: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private n = 0;

  constructor(private max: number, tex: THREE.Texture | null, additive: boolean, order: number, onRender: (cam: THREE.Camera) => void) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
    const mk = (n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.size = mk(1);
    this.rot = mk(1);
    this.col = mk(4);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aRot', this.rot);
    g.setAttribute('aColor', this.col);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.onBeforeRender = (_r, _s, camera) => onRender(camera);
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, rot: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    const pa = this.pos.array as Float32Array;
    pa[i * 3] = x;
    pa[i * 3 + 1] = y;
    pa[i * 3 + 2] = z;
    (this.size.array as Float32Array)[i] = size;
    (this.rot.array as Float32Array)[i] = rot;
    const ca = this.col.array as Float32Array;
    ca[i * 4] = r;
    ca[i * 4 + 1] = g;
    ca[i * 4 + 2] = b;
    ca[i * 4 + 3] = a;
  }

  commit(): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.pos.needsUpdate = true;
    this.size.needsUpdate = true;
    this.rot.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ particles

interface Part {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  rot: number;
  rv: number;
  /** Start temperature 0..1 (flames, embers). */
  h0: number;
  a: number;
  seed: number;
  /** Smoke: 0 = soot black, 1 = pale vapour. */
  tint: number;
}

const mkPool = (n: number): Part[] =>
  Array.from({ length: n }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, rot: 0, rv: 0, h0: 1, a: 1, seed: 0, tint: 0 }));

// ------------------------------------------------------------------------------------------------ fire sound

class FireSound {
  readonly input: GainNode;
  private pan: StereoPannerNode;
  private lp: BiquadFilterNode;
  private srcs: AudioScheduledSourceNode[] = [];
  private rumbleG: GainNode;
  private roarG: GainNode;
  private hissG: GainNode;
  private crackG: GainNode;
  private popG: GainNode;
  private crackSrc: AudioBufferSourceNode;
  private popSrc: AudioBufferSourceNode;
  private dead = false;

  constructor(private h: FireAudioHandle, crack: AudioBuffer, pops: AudioBuffer) {
    const ctx = h.ctx;
    this.input = ctx.createGain();
    this.input.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 12000;
    this.input.connect(this.pan);
    this.pan.connect(this.lp);
    this.lp.connect(h.master);
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const noise = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = h.noise;
      s.loop = true;
      this.srcs.push(s);
      return s;
    };
    // low roar of the burning gas (brown-ish noise, slowly breathing)
    const rumble = noise();
    const rumbleF = filt('lowpass', 150, 0.8);
    this.rumbleG = gain(0);
    rumble.connect(rumbleF);
    rumbleF.connect(this.rumbleG);
    this.rumbleG.connect(this.input);
    // mid-range roar
    const roar = noise();
    const roarF = filt('bandpass', 480, 0.55);
    this.roarG = gain(0);
    roar.connect(roarF);
    roarF.connect(this.roarG);
    this.roarG.connect(this.input);
    // hiss (flicker modulated at a few unrelated rates)
    const hiss = noise();
    const hissH = filt('highpass', 2200, 0.6);
    const hissB = filt('bandpass', 5200, 0.5);
    this.hissG = gain(0);
    hiss.connect(hissH);
    hissH.connect(hissB);
    hissB.connect(this.hissG);
    this.hissG.connect(this.input);
    // two crackle layers of different length so the loop never repeats audibly
    this.crackSrc = ctx.createBufferSource();
    this.crackSrc.buffer = crack;
    this.crackSrc.loop = true;
    this.crackG = gain(0);
    this.crackSrc.connect(this.crackG);
    this.crackG.connect(this.input);
    this.popSrc = ctx.createBufferSource();
    this.popSrc.buffer = pops;
    this.popSrc.loop = true;
    this.popG = gain(0);
    this.popSrc.connect(this.popG);
    this.popG.connect(this.input);
    for (const s of this.srcs) {
      if (s instanceof AudioBufferSourceNode) s.start(ctx.currentTime, rnd() * 1.5);
      else s.start();
    }
    this.crackSrc.start(ctx.currentTime, rnd() * crack.duration);
    this.popSrc.start(ctx.currentTime, rnd() * pops.duration);
  }

  private set(p: AudioParam, v: number, tc = 0.1): void {
    p.setTargetAtTime(v, this.h.ctx.currentTime, tc);
  }

  update(lvl: number, sf: number, battery: boolean, vol: number, cutoff: number, pan: number): void {
    if (this.dead) return;
    const l = clamp(lvl, 0, 1);
    this.set(this.input.gain, vol, 0.15);
    this.set(this.pan.pan, pan, 0.15);
    this.set(this.lp.frequency, cutoff, 0.2);
    this.set(this.rumbleG.gain, 0.5 * Math.pow(l, 1.1) * Math.pow(sf, 0.6) * (0.85 + 0.3 * rnd()), 0.25);
    this.set(this.roarG.gain, 0.2 * Math.pow(l, 1.3) * Math.pow(sf, 0.5) * (0.8 + 0.4 * rnd()), 0.2);
    this.set(this.hissG.gain, (0.03 + (battery ? 0.26 : 0.06)) * l * (0.6 + 0.8 * rnd()), 0.12);
    this.set(this.crackG.gain, (0.08 + 0.5 * Math.pow(l, 0.8)) * (0.7 + 0.6 * rnd()), 0.15);
    this.set(this.popG.gain, 0.65 * Math.pow(l, 1.2), 0.3);
    this.set(this.crackSrc.playbackRate, 0.9 + 0.2 * rnd(), 0.6);
    this.set(this.popSrc.playbackRate, 0.92 + 0.16 * rnd(), 0.8);
  }

  private burst(freq: number, q: number, dur: number, gain: number, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo = 0): void {
    const ctx = this.h.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.h.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.input);
    s.start(t, rnd() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.h.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.input);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Ignition: a swell of rushing gas with a soft thump. */
  whoosh(size: number): void {
    this.burst(220, 0.7, 1.4, 0.8 * size, 0, 'bandpass', 1400);
    this.tone(75, 38, 0.7, 0.55 * size);
    this.burst(600, 0.5, 0.9, 0.25 * size, 0.1, 'bandpass', 2400);
  }

  /** A window cracking and falling out. */
  glass(): void {
    this.burst(3600, 1.2, 0.06, 0.7);
    this.burst(2400, 1, 0.12, 0.4, 0.04);
    for (let k = 0; k < 5; k++) this.tone(4500 + rnd() * 3500, 3500 + rnd() * 2500, 0.1 + rnd() * 0.08, 0.1, 0.06 + k * 0.045 + rnd() * 0.03);
    this.burst(7000, 0.6, 0.35, 0.18, 0.1, 'highpass');
  }

  /** A tyre bursting: dull bang, then the air hissing out. */
  tyre(): void {
    this.burst(260, 0.8, 0.3, 0.9, 0, 'lowpass');
    this.tone(120, 45, 0.4, 0.8);
    this.burst(7500, 0.5, 1.8, 0.28, 0.05, 'highpass', 3500);
  }

  /** Fuel vapour igniting: low whump. */
  flare(): void {
    this.tone(62, 30, 0.8, 0.9);
    this.burst(320, 0.7, 1.0, 0.8, 0, 'lowpass', 90);
    this.burst(900, 0.5, 0.8, 0.3, 0.05, 'bandpass', 3000);
  }

  /** Thermal expansion of the body. */
  ping(): void {
    const f = 500 + rnd() * 2200;
    this.tone(f, f * 0.97, 0.2 + rnd() * 0.25, 0.09 + rnd() * 0.06);
    if (rnd() < 0.4) this.tone(f * 1.51, f * 1.48, 0.12, 0.04, 0.01);
  }

  /** A battery cell vents: hard hiss + pop. */
  vent(): void {
    this.burst(4200, 0.5, 1.3, 0.5, 0, 'highpass', 2600);
    this.burst(500, 1, 0.12, 0.5, 0, 'bandpass');
  }

  retire(): void {
    if (this.dead) return;
    this.dead = true;
    this.set(this.input.gain, 0, 0.2);
    setTimeout(() => {
      for (const s of this.srcs) {
        try {
          s.stop();
        } catch {
          /* stopped */
        }
      }
      try {
        this.crackSrc.stop();
        this.popSrc.stop();
      } catch {
        /* stopped */
      }
      this.input.disconnect();
      this.pan.disconnect();
      this.lp.disconnect();
    }, 700);
  }
}

/** Looping crackle: lots of tiny impulses (fine) or a few resonant pops (sparse). */
function makeCrackle(ctx: AudioContext, secs: number, perSec: number, pops: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const count = Math.floor(perSec * secs);
  for (let i = 0; i < count; i++) {
    const pos = Math.floor(rnd() * n);
    const amp = Math.pow(rnd(), 3) * (pops ? 1 : 0.6) + 0.04;
    const len = pops ? 300 + Math.floor(rnd() * 1800) : 12 + Math.floor(rnd() * 120);
    const f = 300 + rnd() * (pops ? 700 : 3000);
    for (let k = 0; k < len && pos + k < n; k++) {
      const env = Math.exp(-k / (len * 0.22));
      const v = pops ? Math.sin((k * 2 * Math.PI * f) / sr) * 0.5 + (rnd() * 2 - 1) * 0.7 : rnd() * 2 - 1;
      d[pos + k] += v * amp * env;
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < n; i++) d[i] *= k;
  return buf;
}

// ------------------------------------------------------------------------------------------------ fire record per vehicle

interface Rec {
  v: Vehicle | null;
  spec: VehicleSpec;
  prof: Prof;
  /** Size factor from the vehicle's footprint (bus ~1.9, car 1, bike ~0.3). */
  sf: number;
  age: number;
  fuel: number;
  lvl: number;
  smolder: boolean;
  /** Last known pose (world position, orientation) and velocity. */
  wpos: THREE.Vector3;
  q: THREE.Quaternion;
  vel: THREE.Vector3;
  accF: number;
  accS: number;
  accE: number;
  glassAt: number[];
  tyreAt: number[];
  flareAt: number;
  pingT: number;
  jetT: number;
  jetLeft: number;
  heatT: number;
  fresh: boolean;
  dist: number;
  sound: FireSound | null;
}

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const TMP3 = new THREE.Vector3();

export class VehicleFire {
  private flames = mkPool(900);
  private smokes = mkPool(1500);
  private embers = mkPool(500);
  private nf = 0;
  private ns = 0;
  private ne = 0;
  private flameSprites: Sprites;
  private smokeSprites: Sprites;
  private emberSprites: Sprites;
  private glowSprites: Sprites;
  private recs = new Map<object, Rec>();
  private cam: THREE.Camera | null = null;
  private time = 0;
  private wx = 1;
  private wz = 0;
  private crackBuf: AudioBuffer | null = null;
  private popBuf: AudioBuffer | null = null;
  private textures: THREE.Texture[] = [];

  constructor(private d: VehicleFireDeps) {
    const f = makeTexture('flame');
    const s = makeTexture('smoke');
    const g = makeTexture('glow');
    for (const t of [f, s, g]) if (t) this.textures.push(t);
    const onRender = (cam: THREE.Camera): void => {
      this.cam = cam;
    };
    this.smokeSprites = new Sprites(1500, s, false, 2, onRender);
    this.flameSprites = new Sprites(900, f, true, 3, onRender);
    this.emberSprites = new Sprites(500, g, true, 4, onRender);
    this.glowSprites = new Sprites(16, g, true, 1, onRender);
    for (const sp of [this.glowSprites, this.smokeSprites, this.flameSprites, this.emberSprites]) d.scene.add(sp.mesh);
  }

  // ------------------------------------------------------------------ spawning (also used by explosions and other effects)

  private spawn(pool: Part[], idx: number): Part {
    const p = pool[idx % pool.length];
    p.alive = true;
    p.age = 0;
    p.rot = rnd() * Math.PI * 2;
    p.rv = (rnd() - 0.5) * 1.6;
    p.seed = rnd();
    p.tint = 0;
    return p;
  }

  private addFlame(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, h0 = 1, a = 0.9): void {
    const p = this.spawn(this.flames, this.nf++);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = size;
    p.s1 = size;
    p.life = life;
    p.h0 = h0;
    p.a = a;
  }

  private addSmoke(x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, a: number, tint: number): void {
    const p = this.spawn(this.smokes, this.ns++);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = s0;
    p.s1 = s1;
    p.life = life;
    p.a = a;
    p.tint = tint;
    p.h0 = 1;
  }

  private addEmber(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, h0 = 1): void {
    const p = this.spawn(this.embers, this.ne++);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s0 = size;
    p.s1 = size;
    p.life = life;
    p.h0 = h0;
    p.a = 1;
  }

  /** A puff of smoke at a WORLD point (tree felling, light damage). */
  smoke(at: THREE.Vector3, strength: number): void {
    const s = 0.6 + strength * 0.5;
    this.addSmoke(at.x, at.y, at.z, (rnd() - 0.5) * 0.8, 0.8 + strength * 0.6, (rnd() - 0.5) * 0.8, s * 0.5, s * 3.2, 3.5 + rnd() * 2 * strength, strength > 1 ? 0.6 : 0.4, 0.45);
  }

  /** A single small flame at a WORLD point (muzzle flash, small fires). */
  flame(at: THREE.Vector3): void {
    this.addFlame(at.x, at.y, at.z, (rnd() - 0.5) * 0.8, 0.8 + rnd(), (rnd() - 0.5) * 0.8, 0.45 + rnd() * 0.25, 0.3 + rnd() * 0.25);
  }

  /** An explosion fireball at a WORLD point: expanding hot gas that then rises, with sparks and a big smoke column. `size` ~ 1 for a car, 2+ for a shell hit. */
  fireball(at: THREE.Vector3, size: number): void {
    const n = Math.floor(34 * size);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = (rnd() - 0.2) * 1.1;
      const sp = (3 + rnd() * 8) * size * Math.cos(e);
      this.addFlame(at.x + (rnd() - 0.5) * size, at.y + (rnd() - 0.2) * size, at.z + (rnd() - 0.5) * size, Math.cos(a) * sp, Math.sin(e) * sp * 0.9 + 2 + rnd() * 3, Math.sin(a) * sp, (1 + rnd() * 1.2) * size, 0.7 + rnd() * 0.7, 1, 0.95);
    }
    for (let i = 0; i < Math.floor(46 * size); i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (4 + rnd() * 12) * size;
      this.addEmber(at.x, at.y + 0.3, at.z, Math.cos(a) * sp, 3 + rnd() * 10 * size, Math.sin(a) * sp, 0.07 + rnd() * 0.09, 1.2 + rnd() * 2.2);
    }
    for (let i = 0; i < Math.floor(26 * size); i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (0.5 + rnd() * 3.5) * size;
      this.addSmoke(at.x, at.y + rnd() * size, at.z, Math.cos(a) * sp, 2.5 + rnd() * 3, Math.sin(a) * sp, (1 + rnd()) * size, (5 + rnd() * 4) * size, 5 + rnd() * 4, 0.75, 0);
    }
  }

  // ------------------------------------------------------------------ fire records

  private makeRec(v: Vehicle): Rec {
    const prof = PROF[v.spec.look.kind] ?? (PROF.sedan as Prof);
    const h = v.spec.half;
    const sf = clamp(Math.sqrt((h.x * 2 * h.z * 2) / 7.9), 0.3, 2.4);
    const wrecked = v.state === 'wrecked';
    const age = wrecked ? prof.grow + v.wreckedFor : 0;
    const rec: Rec = {
      v,
      spec: v.spec,
      prof,
      sf,
      age,
      fuel: wrecked ? clamp(1 - v.wreckedFor / prof.burn, 0.05, 1) : 1,
      lvl: wrecked ? 0.7 : 0,
      smolder: v.state === 'ok',
      wpos: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      vel: new THREE.Vector3(),
      accF: 0,
      accS: 0,
      accE: 0,
      glassAt: [],
      tyreAt: [],
      flareAt: -1,
      pingT: 1 + rnd() * 2,
      jetT: 2 + rnd() * 2,
      jetLeft: 0,
      heatT: 0,
      fresh: v.state === 'burning',
      dist: 1e9,
      sound: null,
    };
    if (!wrecked) {
      for (let i = 0; i < prof.windows; i++) rec.glassAt.push(2.5 + rnd() * prof.grow * 0.8);
      for (let i = 0; i < wheelDefs(v.spec).length; i++) rec.tyreAt.push(prof.grow * (0.5 + rnd() * 1.5));
      if (prof.fuelTank) rec.flareAt = 6 + rnd() * prof.grow;
    }
    return rec;
  }

  /** Local point on a part of the vehicle (chassis-local), written into TMP. Returns true when it is a tyre. */
  private site(rec: Rec, kind: 'flame' | 'smoke' | 'ember'): boolean {
    const s = rec.spec;
    const h = s.half;
    const bottom = groundY(s);
    const top = (s.colliderY ?? 0) + h.y;
    const cabin = !!s.enclosed;
    const p = rec.prof;
    const g = Math.max(1, p.grow);
    const wEng = p.battery ? 0.5 : 1;
    const wBat = p.battery ? 1.3 : 0;
    const wCab = cabin ? smooth(2.5, 2.5 + g * 0.6, rec.age) * 1.4 : 0;
    const wRoof = cabin ? smooth(g * 0.6, g, rec.age) * (kind === 'smoke' ? 0.8 : 1.0) : 0;
    const wheels = wheelDefs(s);
    const wTyre = smooth(g * 0.4, g * 0.9, rec.age) * (kind === 'ember' ? 0.2 : 0.55);
    const tot = wEng + wBat + wCab + wRoof + wTyre;
    let r = rnd() * tot;
    if ((r -= wEng) < 0) {
      const z = p.engine === 'front' ? h.z * 0.62 : p.engine === 'rear' ? -h.z * 0.7 : 0;
      TMP.set((rnd() - 0.5) * h.x * 1.4, bottom + (top - bottom) * 0.42, z + (rnd() - 0.5) * h.z * 0.3);
      return false;
    }
    if ((r -= wBat) < 0) {
      TMP.set((rnd() - 0.5) * h.x * 0.9, bottom + 0.3, (rnd() - 0.5) * h.z);
      return false;
    }
    if ((r -= wCab) < 0) {
      const wy = s.windowY ?? top - 0.5;
      TMP.set((rnd() > 0.5 ? 1 : -1) * h.x * 0.8, wy + rnd() * (top - wy) * 0.9, (rnd() - 0.5) * h.z * 1.5);
      return false;
    }
    if ((r -= wRoof) < 0) {
      TMP.set((rnd() - 0.5) * h.x * 1.5, top, (rnd() - 0.5) * h.z * 1.7);
      return false;
    }
    const w = wheels[Math.floor(rnd() * wheels.length)];
    if (!w) {
      TMP.set(0, bottom + 0.4, 0);
      return false;
    }
    TMP.set(w.x, bottom + s.wheelRadius * 0.9, w.z);
    return true;
  }

  private worldOf(rec: Rec, out: THREE.Vector3): THREE.Vector3 {
    return out.applyQuaternion(rec.q).add(rec.wpos);
  }

  private emitFlame(rec: Rec, lvl: number): void {
    this.site(rec, 'flame');
    const l = this.worldOf(rec, TMP3.copy(TMP));
    const sf = rec.sf;
    const size = (0.7 + rnd() * 0.6) * (0.55 + 0.5 * sf) * (0.6 + 0.6 * lvl);
    this.addFlame(l.x, l.y, l.z, rec.vel.x * 0.85 + (rnd() - 0.5) * 1.2, 0.8 + rnd() * 1.6, rec.vel.z * 0.85 + (rnd() - 0.5) * 1.2, size, (0.45 + rnd() * 0.5) * (0.8 + 0.5 * Math.sqrt(sf)) * (0.7 + 0.4 * lvl), 0.8 + rnd() * 0.2, 0.95);
  }

  private emitSmoke(rec: Rec, lvl: number): void {
    const tyre = this.site(rec, 'smoke');
    const l = this.worldOf(rec, TMP3.copy(TMP));
    const sf = rec.sf;
    const battery = rec.prof.battery;
    const soot = tyre ? 1 : rec.prof.soot;
    const tint = rec.smolder ? 0.85 : battery ? 0.7 : clamp(1 - soot, 0, 1) * 0.8;
    const a = rec.smolder ? 0.4 : (0.5 + 0.3 * lvl) * (0.5 + 0.5 * soot);
    this.addSmoke(l.x, l.y, l.z, rec.vel.x * 0.7 + (rnd() - 0.5) * 1.2, 1 + rnd() * 1.6, rec.vel.z * 0.7 + (rnd() - 0.5) * 1.2, (0.5 + rnd() * 0.5) * (0.6 + 0.5 * sf), (3.2 + rnd() * 2.6) * (0.6 + 0.6 * sf), (6 + rnd() * 4) * (0.8 + 0.3 * sf) * (rec.smolder ? 0.6 : 1), a, tint);
  }

  private emitEmber(rec: Rec, lvl: number): void {
    this.site(rec, 'ember');
    const l = this.worldOf(rec, TMP3.copy(TMP));
    const up = rec.prof.battery ? 5 + rnd() * 9 : 2 + rnd() * 6;
    this.addEmber(l.x, l.y, l.z, rec.vel.x + (rnd() - 0.5) * 4 * (0.5 + lvl), up, rec.vel.z + (rnd() - 0.5) * 4 * (0.5 + lvl), 0.05 + rnd() * 0.08, 1.2 + rnd() * 2.4, 0.8 + rnd() * 0.2);
  }

  private burstAt(rec: Rec, lx: number, ly: number, lz: number, flames: number, embers: number, smokeN: number, sootTint: number): void {
    const p = TMP2.set(lx, ly, lz);
    this.worldOf(rec, p);
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    for (let i = 0; i < flames; i++) this.addFlame(px, py, pz, (rnd() - 0.5) * 5, 1 + rnd() * 4, (rnd() - 0.5) * 5, 0.4 + rnd() * 0.4, 0.35 + rnd() * 0.3, 0.9, 0.9);
    for (let i = 0; i < embers; i++) this.addEmber(px, py, pz, (rnd() - 0.5) * 9, 2 + rnd() * 7, (rnd() - 0.5) * 9, 0.05 + rnd() * 0.07, 1 + rnd() * 2);
    for (let i = 0; i < smokeN; i++) this.addSmoke(px, py, pz, (rnd() - 0.5) * 2.5, 1.5 + rnd() * 2, (rnd() - 0.5) * 2.5, 0.5, 3 + rnd() * 2, 5 + rnd() * 3, 0.7, sootTint);
  }

  // ------------------------------------------------------------------ per-frame update

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    this.time += dt;
    // slowly turning wind with gusts
    const ang = 0.9 + 0.35 * Math.sin(this.time * 0.031) + 0.15 * Math.sin(this.time * 0.13);
    const sp = 1.6 * (1 + 0.45 * Math.sin(this.time * 0.29) + 0.25 * Math.sin(this.time * 0.9 + 1));
    this.wx = Math.cos(ang) * sp;
    this.wz = Math.sin(ang) * sp;

    this.scan();
    for (const [key, rec] of this.recs) {
      this.updateRec(key, rec, dt);
    }
    this.simulate(dt);
    this.updateSound();
  }

  private scan(): void {
    const list = this.d.vehicles.vehicles;
    for (const v of list) {
      if (this.recs.has(v)) continue;
      const prof = PROF[v.spec.look.kind] ?? (PROF.sedan as Prof);
      const burning = v.state === 'burning';
      const wrecked = v.state === 'wrecked' && v.wreckedFor < prof.burn * 0.95;
      const smoulder = v.state === 'ok' && v.hp < 28;
      if ((burning || wrecked || smoulder) && v.enabled) this.recs.set(v, this.makeRec(v));
    }
  }

  private updateRec(key: object, rec: Rec, dt: number): void {
    const o = this.d.origin.origin;
    const v = rec.v;
    if (v && !this.d.vehicles.vehicles.includes(v)) rec.v = null; // removed from the world: the fire stays where it was
    if (rec.v) {
      const w = rec.v;
      if (!w.enabled) {
        // far from the player (physics off): no particles, but the fire keeps burning down in the background
        rec.smolder = false;
        rec.age += dt;
        if (w.state === 'wrecked') rec.fuel -= dt / rec.prof.burn;
        else if (w.state === 'ok') rec.fuel -= dt / 8; // recovered / repaired
        rec.lvl *= Math.exp(-dt * 0.5);
        if (w.state === 'burning') rec.lvl = Math.max(rec.lvl, 0.5);
        if (rec.fuel <= 0 && w.state !== 'burning') {
          rec.sound?.retire();
          this.recs.delete(key);
        }
        return;
      }
      const root = w.model.root;
      rec.wpos.set(root.position.x + o.x, root.position.y, root.position.z + o.z);
      rec.q.copy(root.quaternion);
      const lv = w.body.linvel();
      rec.vel.set(lv.x, lv.y, lv.z);
      if (w.state === 'burning') {
        rec.smolder = false;
        rec.age += dt;
      } else if (w.state === 'wrecked') {
        rec.smolder = false;
        rec.age += dt;
        rec.fuel -= dt / rec.prof.burn;
      } else if (w.hp >= 28) rec.fuel -= dt / 8; // repaired / recovered: dies away
      else rec.smolder = true;
    } else {
      rec.vel.multiplyScalar(Math.max(0, 1 - 2 * dt));
      rec.smolder = false;
      rec.age += dt;
      rec.fuel -= dt / rec.prof.burn;
    }
    const g = Math.max(1, rec.prof.grow);
    const burningNow = rec.v ? rec.v.state === 'burning' : false;
    let target: number;
    if (rec.smolder) target = 0.14;
    else if (burningNow) target = 0.1 + 0.9 * smooth(0, g, rec.age);
    else target = clamp(Math.pow(Math.max(rec.fuel, 0), 0.7), 0, 1) * (0.5 + 0.5 * smooth(0, g * 0.5, rec.age));
    rec.lvl += (target - rec.lvl) * Math.min(1, dt * (target > rec.lvl ? 1.2 : 0.5));
    if (rec.lvl < 0.012 && !rec.smolder && rec.fuel <= 0) {
      rec.sound?.retire();
      this.recs.delete(key);
      return;
    }
    const lvl = rec.lvl;
    if (lvl < 0.01) return;
    rec.dist = this.dist(rec.wpos);

    // ---- continuous emission
    const sf = rec.sf;
    rec.accF += (rec.smolder ? 0 : lvl * 70 * sf) * dt;
    rec.accS += (rec.smolder ? 6 : lvl * 16) * Math.pow(sf, 1.1) * dt;
    rec.accE += (rec.smolder ? 0 : lvl * (rec.prof.battery ? 22 : 9) * sf) * dt;
    for (let i = 0; rec.accF >= 1 && i < 14; i++, rec.accF -= 1) this.emitFlame(rec, lvl);
    for (let i = 0; rec.accS >= 1 && i < 14; i++, rec.accS -= 1) this.emitSmoke(rec, lvl);
    for (let i = 0; rec.accE >= 1 && i < 10; i++, rec.accE -= 1) this.emitEmber(rec, lvl);
    rec.accF = Math.min(rec.accF, 2);
    rec.accS = Math.min(rec.accS, 2);
    rec.accE = Math.min(rec.accE, 2);

    if (rec.smolder) return;

    // ---- events: ignition, windows blowing out, tyres bursting, fuel flare-up, metal pings, battery vents
    const snd = rec.sound;
    if (rec.fresh) {
      if (snd) {
        snd.whoosh(0.6 + 0.4 * sf);
        rec.fresh = false;
      } else if (rec.age > 2) rec.fresh = false;
    }
    const top = (rec.spec.colliderY ?? 0) + rec.spec.half.y;
    const h = rec.spec.half;
    for (let i = rec.glassAt.length - 1; i >= 0; i--) {
      if (rec.age < (rec.glassAt[i] ?? 1e9)) continue;
      rec.glassAt.splice(i, 1);
      const wy = rec.spec.windowY ?? top - 0.5;
      this.burstAt(rec, (rnd() > 0.5 ? 1 : -1) * h.x * 0.95, wy + (top - wy) * 0.4, (rnd() - 0.5) * h.z * 1.6, 9, 6, 3, 0.2);
      snd?.glass();
    }
    const wheels = wheelDefs(rec.spec);
    for (let i = rec.tyreAt.length - 1; i >= 0; i--) {
      if (rec.age < (rec.tyreAt[i] ?? 1e9)) continue;
      rec.tyreAt.splice(i, 1);
      const w = wheels[Math.floor(rnd() * wheels.length)];
      if (w) this.burstAt(rec, w.x, groundY(rec.spec) + rec.spec.wheelRadius * 0.8, w.z, 6, 14, 6, 0);
      snd?.tyre();
    }
    if (rec.flareAt >= 0 && rec.age >= rec.flareAt) {
      rec.flareAt = -1;
      this.site(rec, 'flame');
      const p = this.worldOf(rec, TMP.clone());
      this.fireball(p, 0.45 * sf);
      snd?.flare();
    }
    rec.pingT -= dt;
    if (rec.pingT <= 0) {
      rec.pingT = 0.6 + rnd() * 2.2 / Math.max(0.3, lvl);
      if (lvl > 0.3) snd?.ping();
    }
    if (rec.prof.battery && lvl > 0.3) {
      rec.jetT -= dt;
      if (rec.jetT <= 0 && rec.jetLeft <= 0) {
        rec.jetLeft = 0.5 + rnd() * 0.9;
        rec.jetT = 1.5 + rnd() * 3;
        snd?.vent();
      }
      if (rec.jetLeft > 0) {
        rec.jetLeft -= dt;
        const n = Math.floor(140 * dt * (0.7 + rnd() * 0.6)) + 1;
        const side = rnd() > 0.5 ? 1 : -1;
        const jx = h.x * 0.5 * side;
        const jz = (rnd() - 0.5) * h.z;
        const base = TMP2.set(jx, groundY(rec.spec) + 0.3, jz);
        this.worldOf(rec, base);
        const bx = base.x;
        const by = base.y;
        const bz = base.z;
        for (let i = 0; i < n; i++) {
          this.addFlame(bx + (rnd() - 0.5) * 0.3, by, bz + (rnd() - 0.5) * 0.3, side * (1 + rnd() * 3) + rec.vel.x, 6 + rnd() * 6, (rnd() - 0.5) * 2 + rec.vel.z, 0.3 + rnd() * 0.25, 0.3 + rnd() * 0.25, 1, 1);
          if (rnd() < 0.5) this.addEmber(bx, by, bz, side * (2 + rnd() * 5), 6 + rnd() * 9, (rnd() - 0.5) * 5, 0.04 + rnd() * 0.05, 1 + rnd() * 1.5);
        }
      }
    }

    // ---- heat: people and vehicles close to a strong fire are hurt (radiant heat falls off quickly with distance)
    rec.heatT -= dt;
    if (rec.heatT <= 0 && lvl > 0.45) {
      rec.heatT = 0.4;
      const reach = 2.6 + 1.4 * sf;
      for (const p of this.d.people.onFoot) {
        if (p.dead) continue;
        const d = Math.hypot(p.world.x - rec.wpos.x, p.world.z - rec.wpos.z);
        if (d < reach + 1) this.d.people.damage(p, 9 * lvl * Math.pow(1 - d / (reach + 1), 2) * 0.4, false, false);
      }
      for (const o2 of this.d.vehicles.vehicles) {
        if (o2 === rec.v || !o2.enabled || o2.state === 'wrecked') continue;
        o2.physWorld(TMP);
        const d = Math.hypot(TMP.x - rec.wpos.x, TMP.z - rec.wpos.z) - o2.spec.half.z * 0.5;
        if (d < reach * 0.8) o2.blast(7 * lvl * Math.pow(1 - Math.max(0, d) / (reach * 0.8), 1.5) * 0.4, false);
      }
    }
  }

  private dist(w: THREE.Vector3): number {
    if (!this.cam) return 1e9;
    const o = this.d.origin.origin;
    const e = this.cam.matrixWorld.elements;
    return Math.hypot(w.x - (e[12] ?? 0) - o.x, w.z - (e[14] ?? 0) - o.z);
  }

  private simulate(dt: number): void {
    const o = this.d.origin.origin;
    const t = this.time;
    const wx = this.wx;
    const wz = this.wz;
    const terrain = this.d.terrain;

    // ---- flames
    this.flameSprites.begin();
    for (const p of this.flames) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const u = p.age / p.life;
      const heat = p.h0 * Math.exp(-p.age * 2.4);
      p.vy += (1.5 + 10 * heat) * dt;
      const tx = Math.sin(p.y * 2.1 + t * 5.2 + p.seed * 6.28) * 2.4;
      const tz = Math.cos(p.y * 1.9 + t * 4.3 + p.seed * 9.1) * 2.4;
      p.vx += (tx + (wx * 0.8 - p.vx) * 0.4) * dt;
      p.vz += (tz + (wz * 0.8 - p.vz) * 0.4) * dt;
      const drag = Math.exp(-1.1 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy *= Math.exp(-0.7 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rv * dt;
      const size = p.s0 * (0.7 + 0.9 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)) * (1 - u * u * 0.65);
      const col = fireColor(heat);
      const a = p.a * smooth(0, 0.1, u) * Math.pow(1 - u, 1.2) * (0.35 + 0.65 * heat);
      this.flameSprites.push(p.x - o.x, p.y, p.z - o.z, size, p.rot, col[0] ?? 1, col[1] ?? 0.5, col[2] ?? 0.1, a);
    }
    this.flameSprites.commit();

    // ---- smoke
    this.smokeSprites.begin();
    for (const p of this.smokes) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const u = p.age / p.life;
      const T = Math.exp(-p.age * 0.45);
      p.vy += (6 * T + 0.2) * dt;
      p.vy *= Math.exp(-0.5 * dt);
      const shear = 1 + Math.min(1.2, Math.max(0, p.y) * 0.03);
      p.vx += ((wx * shear - p.vx) * 0.7 + Math.sin(p.y * 0.9 + t * 1.3 + p.seed * 6.28) * 0.6) * dt;
      p.vz += ((wz * shear - p.vz) * 0.7 + Math.cos(p.y * 0.8 + t * 1.1 + p.seed * 7.7) * 0.6) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rv * 0.3 * dt;
      const size = p.s0 + (p.s1 - p.s0) * Math.pow(u, 0.55);
      const a = p.a * smooth(0, 0.07, u) * Math.pow(1 - u, 1.4);
      // soot black -> grey (or pale vapour for battery / smouldering smoke), lit orange from below while still near the flames
      const grey = (0.05 + 0.33 * Math.pow(u, 0.7)) * (1 - p.tint) + (0.62 + 0.15 * u) * p.tint;
      const warm = T * (1 - u) * 0.5 * (1 - p.tint * 0.5);
      this.smokeSprites.push(p.x - o.x, p.y, p.z - o.z, size, p.rot, grey + warm * 0.9, grey + warm * 0.4, grey + warm * 0.1, a);
    }
    this.smokeSprites.commit();

    // ---- embers and sparks
    this.emberSprites.begin();
    for (const p of this.embers) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const u = p.age / p.life;
      const lift = 14 * Math.exp(-p.age * 1.4);
      p.vy += (lift - 5) * dt;
      const drag = Math.exp(-0.9 * dt);
      p.vx += (wx * 1.2 - p.vx) * 0.5 * dt;
      p.vz += (wz * 1.2 - p.vz) * 0.5 * dt;
      p.vx *= drag;
      p.vz *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const gy = terrain.heightAt(p.x, p.z) + 0.04;
      if (p.y < gy) {
        p.y = gy;
        p.vx = p.vy = p.vz = 0;
        p.age = Math.max(p.age, p.life * 0.8);
      }
      const heat = p.h0 * (1 - u * 0.8);
      const col = fireColor(0.3 + heat * 0.7);
      const flick = 0.6 + 0.4 * Math.sin(p.age * 38 + p.seed * 50);
      this.emberSprites.push(p.x - o.x, p.y, p.z - o.z, p.s0 * (1 + 3 * flick), 0, col[0] ?? 1, col[1] ?? 0.5, col[2] ?? 0.1, (1 - u) * flick);
    }
    this.emberSprites.commit();

    // ---- fire glow (a soft halo around each big fire: it lights up the surroundings at night)
    this.glowSprites.begin();
    for (const rec of this.recs.values()) {
      if (rec.lvl < 0.1 || rec.smolder || (rec.v && !rec.v.enabled)) continue;
      const flick = 0.75 + 0.25 * Math.sin(t * 17 + rec.sf * 5) * Math.sin(t * 7.3 + 1.7);
      this.glowSprites.push(rec.wpos.x - o.x, rec.wpos.y + 1.3, rec.wpos.z - o.z, (7 + 11 * rec.sf) * (0.6 + 0.4 * rec.lvl), 0, 1, 0.45, 0.13, 0.2 * rec.lvl * flick);
    }
    this.glowSprites.commit();
  }

  // ------------------------------------------------------------------ sound

  private updateSound(): void {
    const muted = this.d.muted();
    const cam = this.cam;
    const near: Rec[] = [];
    if (cam && !muted) for (const r of this.recs.values()) if (r.lvl > 0.05 && r.dist < 110) near.push(r);
    near.sort((a, b) => a.dist - b.dist);
    const chosen = new Set(near.slice(0, 3));
    for (const r of this.recs.values()) {
      if (!chosen.has(r) && r.sound) {
        r.sound.retire();
        r.sound = null;
      }
    }
    if (!cam || chosen.size === 0) return;
    const h = this.d.audio();
    if (!h) return;
    if (!this.crackBuf) this.crackBuf = makeCrackle(h.ctx, 4.1, 90, false);
    if (!this.popBuf) this.popBuf = makeCrackle(h.ctx, 5.7, 3.5, true);
    const e = cam.matrixWorld.elements;
    const o = this.d.origin.origin;
    for (const r of chosen) {
      if (!r.sound) r.sound = new FireSound(h, this.crackBuf, this.popBuf);
      const dx = r.wpos.x - (e[12] ?? 0) - o.x;
      const dz = r.wpos.z - (e[14] ?? 0) - o.z;
      const pan = clamp((dx * (e[0] ?? 1) + dz * (e[2] ?? 0)) / (Math.hypot(dx, dz) + 1), -1, 1) * 0.8;
      const reach = 14 * Math.sqrt(r.sf);
      const vol = clamp(0.95 / (1 + Math.pow(r.dist / reach, 1.6)), 0, 1) * (r.dist > 90 ? (110 - r.dist) / 20 : 1);
      const cutoff = Math.max(700, 14000 / (1 + r.dist / 20));
      r.sound.update(r.smolder ? 0.12 : r.lvl, r.sf, r.prof.battery, vol, cutoff, pan);
    }
  }

  dispose(): void {
    for (const r of this.recs.values()) r.sound?.retire();
    this.recs.clear();
    for (const s of [this.glowSprites, this.smokeSprites, this.flameSprites, this.emberSprites]) s.dispose();
    for (const t of this.textures) t.dispose();
  }
}
