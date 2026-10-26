// DAY / NIGHT CYCLE (logic only: three.js maths, no scene, no DOM, so a headless test can run it).
//
//   - one full cycle = dayMinutes (sunrise -> sunset, default 8) + nightMinutes (sunset -> sunrise, default 3)
//   - the sun moves on a smooth arc, and EVERYTHING (sky colours, sun colour / strength, ambient light, fog, lamps, stars) is a smooth
//     function of the sun's height, so dusk and dawn take about a minute each: night never "switches on" suddenly
//   - three modes (settings menu): 'cycle' = the normal day / night cycle, 'night' = it stays night all the time, 'day' = it stays day all the time.
//     Switching fades the sky smoothly in `switchSeconds`; in 'night' / 'day' the clock stands still (the cycle continues from where it was)
//   - the mode is remembered (localStorage) between visits
//
// Used by Environment (applies `state` to the sky, the sun, the ambient light and the fog) and by the street lights / lighthouse (read `state.lampOn`).
import * as THREE from 'three';
import { Config } from '../core/Config';

const STORAGE_KEY = 'evcity.nightEnabled'; // old setting: '0' = night off (= always day)
const MODE_KEY = 'evcity.timeMode';

/** 'cycle' = day and night follow the clock, 'night' = always night, 'day' = always day. */
export type TimeMode = 'cycle' | 'night' | 'day';
export const TIME_MODES: readonly TimeMode[] = ['cycle', 'night', 'day'];
const TAU = Math.PI * 2;

/** Everything the renderer needs for one moment of the day. Reused every frame (no allocations). */
export class LightState {
  /** Unit vector towards the sun (can be below the horizon). */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  /** Unit vector the single shadow-casting DirectionalLight shines FROM: the sun by day, the moon at night (never below ~10 degrees). */
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  readonly lightColor = new THREE.Color();
  lightIntensity = 0;
  readonly hemiSky = new THREE.Color();
  readonly hemiGround = new THREE.Color();
  hemiIntensity = 0;
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  /** Colour of the sun disc and of the glow around it (sky shader + water reflection). */
  readonly sunColor = new THREE.Color();
  /** Strength of the glow around the sun in the sky shader. */
  glow = 0.18;
  /** 0 = no stars / moon, 1 = full night sky. */
  night = 0;
  /** 0 = street lamps off, 1 = fully on (they start glowing a little before the sun touches the horizon). */
  lampOn = 0;
  /** Sine of the sun's height above the horizon (-1 .. 1). */
  sunY = 1;

  copy(o: LightState): this {
    this.sunDir.copy(o.sunDir);
    this.lightDir.copy(o.lightDir);
    this.lightColor.copy(o.lightColor);
    this.lightIntensity = o.lightIntensity;
    this.hemiSky.copy(o.hemiSky);
    this.hemiGround.copy(o.hemiGround);
    this.hemiIntensity = o.hemiIntensity;
    this.horizon.copy(o.horizon);
    this.zenith.copy(o.zenith);
    this.sunColor.copy(o.sunColor);
    this.glow = o.glow;
    this.night = o.night;
    this.lampOn = o.lampOn;
    this.sunY = o.sunY;
    return this;
  }

  /** this = lerp(this, o, t). */
  mix(o: LightState, t: number): this {
    this.sunDir.lerp(o.sunDir, t).normalize();
    this.lightDir.lerp(o.lightDir, t).normalize();
    this.lightColor.lerp(o.lightColor, t);
    this.lightIntensity += (o.lightIntensity - this.lightIntensity) * t;
    this.hemiSky.lerp(o.hemiSky, t);
    this.hemiGround.lerp(o.hemiGround, t);
    this.hemiIntensity += (o.hemiIntensity - this.hemiIntensity) * t;
    this.horizon.lerp(o.horizon, t);
    this.zenith.lerp(o.zenith, t);
    this.sunColor.lerp(o.sunColor, t);
    this.glow += (o.glow - this.glow) * t;
    this.night += (o.night - this.night) * t;
    this.lampOn += (o.lampOn - this.lampOn) * t;
    this.sunY += (o.sunY - this.sunY) * t;
    return this;
  }
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Colour stops by the sine of the sun's height: night, deep twilight, sunset glow, golden hour, day. */
interface Stop {
  y: number;
  horizon: number;
  zenith: number;
  sun: number;
  /** DirectionalLight colour + strength (the sun). */
  light: number;
  lightI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  glow: number;
}
const STOPS: readonly Stop[] = [
  { y: -0.3, horizon: 0x0b1428, zenith: 0x02050f, sun: 0xff5a1f, light: 0xff6a30, lightI: 0, hemiSky: 0x1d2d5c, hemiGround: 0x0c0f1a, hemiI: 0.5, glow: 0.1 },
  { y: -0.1, horizon: 0x33305a, zenith: 0x0a1736, sun: 0xff5a1f, light: 0xff6a30, lightI: 0, hemiSky: 0x2a3566, hemiGround: 0x141420, hemiI: 0.62, glow: 0.5 },
  { y: 0.0, horizon: 0xff8a4a, zenith: 0x2b3f78, sun: 0xff7a30, light: 0xff7a40, lightI: 0, hemiSky: 0x6c6a9a, hemiGround: 0x3b3040, hemiI: 0.78, glow: 0.75 },
  { y: 0.12, horizon: 0xf5b680, zenith: 0x4572b4, sun: 0xffb060, light: 0xffb070, lightI: 1.7, hemiSky: 0x9fb4e0, hemiGround: 0x5b4f40, hemiI: 0.98, glow: 0.4 },
  { y: 0.4, horizon: 0xbcd4ea, zenith: 0x3d78c4, sun: 0xffd999, light: 0xfff0d8, lightI: 3.0, hemiSky: 0xbcd6ff, hemiGround: 0x6b5d45, hemiI: 1.15, glow: 0.18 },
];
const MOON_COLOR = 0x9db4ff;
const MOON_INTENSITY = 0.55;

const _a = new THREE.Color();
const _b = new THREE.Color();
const _v = new THREE.Vector3();

export class DayNight {
  readonly state = new LightState();
  /** The time mode: the normal cycle, night all the time or day all the time. */
  mode: TimeMode = 'cycle';
  /** Seconds into the current cycle (0 = sunrise). */
  clock: number;
  /** 0 = following the clock, 1 = a fixed look (always day / always night). Fades between the two. */
  private offBlend = 0;
  /** Inside the fixed look: 0 = full daylight, 1 = deep night. Fades when you switch straight between always-day and always-night. */
  private fixedNight = 0;
  private readonly dayS: number;
  private readonly nightS: number;
  private readonly startFraction: number;
  /** The two fixed looks (always day: the look the game starts with; always night: the middle of the night). */
  private readonly fixed = new LightState();
  private readonly fixedDark = new LightState();
  private readonly fixedMix = new LightState();
  /** Horizontal direction (unit, x z) of the original fixed sun: the sun's arc leans that way, so the look at noon stays as it was. */
  private readonly lean = new THREE.Vector2(0.55, 0.45).normalize();
  private readonly east = new THREE.Vector3();
  private static readonly TILT = 0.35; // rad: how far the arc leans away from straight overhead (peak height 90 - 20 = 70 degrees)

  constructor() {
    const C = Config.environment.dayNight;
    this.dayS = C.dayMinutes * 60;
    this.nightS = C.nightMinutes * 60;
    this.east.set(-this.lean.y, 0, this.lean.x);
    this.startFraction = C.startFraction;
    this.clock = this.dayS * C.startFraction;
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(MODE_KEY);
        if (saved === 'cycle' || saved === 'night' || saved === 'day') this.mode = saved;
        else if (localStorage.getItem(STORAGE_KEY) === '0') this.mode = 'day'; // the old "night off" setting
      }
    } catch {
      /* storage blocked: keep the default */
    }
    this.offBlend = this.mode === 'cycle' ? 0 : 1;
    this.fixedNight = this.mode === 'night' ? 1 : 0;
    this.compute(this.dayAngle(C.startFraction * this.dayS), this.fixed);
    this.compute(1.5 * Math.PI, this.fixedDark); // the sun straight below us: the middle of the night
    this.refresh();
  }

  /** Night cycle is running (old name: "night mode on"). */
  get enabled(): boolean {
    return this.mode === 'cycle';
  }

  /** Time of day in hours (0 .. 24): sunrise 06:00, sunset 18:00, midnight 00:00. In the fixed modes: the hour that goes with that look. */
  get hours(): number {
    if (this.mode === 'night') return 0;
    if (this.mode === 'day') return 6 + 12 * this.startFraction;
    return this.clockHours(this.clock);
  }

  /** Hour (0 .. 24) for a clock value: the day part fills 06:00 - 18:00, the night part 18:00 - 06:00. */
  clockHours(clock: number): number {
    if (clock < this.dayS) return 6 + (12 * clock) / this.dayS;
    return (18 + (12 * (clock - this.dayS)) / this.nightS) % 24;
  }

  get cycleSeconds(): number {
    return this.dayS + this.nightS;
  }

  /** Time of day as a label for the UI. */
  get phase(): 'day' | 'dusk' | 'night' | 'dawn' {
    const y = this.state.sunY;
    const rising = this.clock >= this.dayS + this.nightS * 0.5 || this.clock < this.dayS * 0.5;
    if (y > 0.3) return 'day';
    if (y < -0.3) return 'night';
    return rising ? 'dawn' : 'dusk';
  }

  setMode(mode: TimeMode): void {
    this.mode = mode;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  /** Old API: true = the normal cycle, false = always day. */
  setEnabled(on: boolean): void {
    this.setMode(on ? 'cycle' : 'day');
  }

  /** Old API: cycle <-> always day. Returns true when the cycle runs. */
  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /** Next mode in the order cycle -> night -> day (the backslash key). Returns the new mode. */
  cycleMode(): TimeMode {
    this.setMode(TIME_MODES[(TIME_MODES.indexOf(this.mode) + 1) % TIME_MODES.length]);
    return this.mode;
  }

  /** Advance the clock (only while night mode is on) and recompute `state`. */
  update(dt: number): void {
    if (this.mode === 'cycle') this.clock = (this.clock + dt) % this.cycleSeconds;
    const step = dt / Math.max(0.1, Config.environment.dayNight.switchSeconds);
    const target = this.mode === 'cycle' ? 0 : 1;
    this.offBlend += Math.max(-step, Math.min(step, target - this.offBlend));
    if (this.mode !== 'cycle') {
      // not looking at the fixed look yet: pick day / night at once; already looking at it: fade from one to the other
      const nt = this.mode === 'night' ? 1 : 0;
      if (this.offBlend < 0.0001) this.fixedNight = nt;
      else this.fixedNight += Math.max(-step, Math.min(step, nt - this.fixedNight));
    }
    this.refresh();
  }

  /** Jump to a time (seconds into the cycle); used by tests and debug tools. */
  setClock(seconds: number): void {
    this.clock = ((seconds % this.cycleSeconds) + this.cycleSeconds) % this.cycleSeconds;
    this.refresh();
  }

  private refresh(): void {
    this.compute(this.angleAt(this.clock), this.state);
    if (this.offBlend > 0.0001) {
      const t = this.offBlend * this.offBlend * (3 - 2 * this.offBlend);
      const n = this.fixedNight * this.fixedNight * (3 - 2 * this.fixedNight);
      this.fixedMix.copy(this.fixed);
      if (n > 0.0001) this.fixedMix.mix(this.fixedDark, n);
      this.state.mix(this.fixedMix, t);
    }
  }

  /**
   * Sun angle for the clock: 0 .. PI over the day (sunrise to sunset, steady), PI .. 2 PI over the night. The night part is eased (slow just
   * after sunset and just before sunrise): the sun lingers near the horizon, so dusk and dawn last longer and the dark never arrives suddenly.
   */
  private angleAt(clock: number): number {
    if (clock < this.dayS) return Math.PI * (clock / this.dayS);
    const u = (clock - this.dayS) / this.nightS;
    return Math.PI + Math.PI * (u - Math.sin(TAU * u) / TAU);
  }

  private dayAngle(secondsIntoDay: number): number {
    return Math.PI * (secondsIntoDay / this.dayS);
  }

  /** Fill `o` with the whole look of the world when the sun stands at angle `a` (0 = rising, PI = setting, 2 PI = rising again). */
  private compute(a: number, o: LightState): void {
    const cosT = Math.cos(DayNight.TILT);
    const sinT = Math.sin(DayNight.TILT);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // sun = cos(a) * east + sin(a) * (up tilted a little towards the lean direction)
    o.sunDir.set(
      ca * this.east.x + sa * sinT * this.lean.x,
      sa * cosT,
      ca * this.east.z + sa * sinT * this.lean.y,
    );
    o.sunDir.normalize();
    const y = o.sunDir.y;
    o.sunY = y;

    // sky + sun colours: smooth piecewise blend between the stops
    let i = 0;
    while (i < STOPS.length - 2 && y > STOPS[i + 1].y) i++;
    const s0 = STOPS[i];
    const s1 = STOPS[i + 1];
    const t = smooth(0, 1, (y - s0.y) / (s1.y - s0.y));
    const mixC = (out: THREE.Color, k0: number, k1: number): void => {
      out.copy(_a.setHex(k0)).lerp(_b.setHex(k1), t);
    };
    mixC(o.horizon, s0.horizon, s1.horizon);
    mixC(o.zenith, s0.zenith, s1.zenith);
    mixC(o.sunColor, s0.sun, s1.sun);
    mixC(o.hemiSky, s0.hemiSky, s1.hemiSky);
    mixC(o.hemiGround, s0.hemiGround, s1.hemiGround);
    o.hemiIntensity = s0.hemiI + (s1.hemiI - s0.hemiI) * t;
    o.glow = s0.glow + (s1.glow - s0.glow) * t;
    // outside the stop range: clamp (below the first stop = full night, above the last = full day)
    if (y <= STOPS[0].y) this.clampTo(STOPS[0], o);
    else if (y >= STOPS[STOPS.length - 1].y) this.clampTo(STOPS[STOPS.length - 1], o);

    // shadow-casting light: the sun (strength fades to 0 at the horizon), or the moon once the sun is below it
    const top = STOPS[STOPS.length - 1];
    const sunStrength = y <= 0 ? 0 : y >= top.y ? top.lightI : s0.lightI + (s1.lightI - s0.lightI) * t;
    const moonStrength = MOON_INTENSITY * smooth(0, 0.25, -y);
    if (sunStrength >= moonStrength) {
      o.lightColor.setHex(y >= top.y ? top.light : this.lerpHex(s0.light, s1.light, t));
      o.lightIntensity = sunStrength;
      this.lowLight(o.sunDir, o.lightDir);
    } else {
      o.lightColor.setHex(MOON_COLOR);
      o.lightIntensity = moonStrength;
      this.lowLight(_v.copy(o.sunDir).negate(), o.lightDir); // the moon is opposite the sun
    }
    // artificial lights come on before the sun touches the horizon and are fully on a little after
    o.lampOn = 1 - smooth(-0.08, 0.1, y);
    o.night = smooth(-0.05, -0.3, y);
  }

  private lerpHex(a: number, b: number, t: number): number {
    return _a.setHex(a).lerp(_b.setHex(b), t).getHex();
  }

  private clampTo(s: Stop, o: LightState): void {
    o.horizon.setHex(s.horizon);
    o.zenith.setHex(s.zenith);
    o.sunColor.setHex(s.sun);
    o.hemiSky.setHex(s.hemiSky);
    o.hemiGround.setHex(s.hemiGround);
    o.hemiIntensity = s.hemiI;
    o.glow = s.glow;
  }

  /** The shadow light never gets lower than about 10 degrees (very long shadows would leave the shadow map). */
  private lowLight(dir: THREE.Vector3, out: THREE.Vector3): void {
    const h = Math.hypot(dir.x, dir.z) || 1;
    const minY = 0.17;
    const yy = Math.max(dir.y, minY);
    const k = Math.sqrt(Math.max(0, 1 - yy * yy)) / h;
    out.set(dir.x * k, yy, dir.z * k);
  }
}
