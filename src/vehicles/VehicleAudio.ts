import * as THREE from 'three';
import type { Vehicle, VehicleAudioState } from './Vehicle';

/**
 * Procedural vehicle sound (Web Audio, no sound files) for EVERY vehicle kind.
 *
 *  - petrol / diesel / single-cylinder / two-stroke / tank engines: firing-rate oscillators (rpm -> pitch), grit, intake noise, rev limiter, gear clunks, backfire pops
 *  - electric cars + bike: motor whine that follows rpm / load, regen, low-speed pedestrian hum
 *  - cycle rickshaw: chain ticks and wheel rumble, bicycle bell
 *  - every vehicle: tyre / road rumble (asphalt vs gravel vs earth), wind, tyre screech, brake squeal, horn (H), starter / power-up and shut-down,
 *    door open / shut, handbrake ratchet, landing thump, reverse beeper, air-brake hiss (bus), track clatter (tank), fire crackle, limp-mode sputter
 *
 * The player's vehicle and the nearest AI vehicles each get a voice (spatialised: pan from the screen position, volume + muffling from the distance).
 * The AudioContext is created on first use (needs a user gesture, which the game start gives).
 */

type EngineType = 'ice' | 'diesel' | 'single' | 'twostroke' | 'tank' | 'ev' | 'pedal';

interface Profile {
  type: EngineType;
  /** Cylinders (firing rate = rpm / 60 x cyl / 2 for a 4-stroke, rpm / 60 x cyl for a 2-stroke). */
  cyl: number;
  gain: number;
  /** Engine low-pass cut-off at idle / full load (Hz). */
  lp: [number, number];
  /** Firing roughness 0..1 (amplitude modulation at the firing rate). */
  am: number;
  /** EV: whine pitch range above 220 Hz. */
  evTop: number;
  horn: { f: [number, number]; wave: OscillatorType; lp: number; gain: number } | 'bell';
  reverseBeep: boolean;
  airBrake: boolean;
  /** 0..1 how much the tyres squeal. */
  squeal: number;
}

const PROFILES: Record<string, Profile> = {
  sedan: { type: 'ice', cyl: 4, gain: 0.5, lp: [420, 2400], am: 0.15, evTop: 0, horn: { f: [415, 523], wave: 'square', lp: 2200, gain: 0.2 }, reverseBeep: false, airBrake: false, squeal: 1 },
  jeep: { type: 'diesel', cyl: 4, gain: 0.58, lp: [320, 1500], am: 0.45, evTop: 0, horn: { f: [370, 466], wave: 'square', lp: 1900, gain: 0.22 }, reverseBeep: true, airBrake: false, squeal: 0.9 },
  hypercar: { type: 'ev', cyl: 0, gain: 0.6, lp: [3000, 6000], am: 0, evTop: 3200, horn: { f: [440, 554], wave: 'square', lp: 2600, gain: 0.2 }, reverseBeep: true, airBrake: false, squeal: 1 },
  evhypar: { type: 'ev', cyl: 0, gain: 0.55, lp: [2200, 4500], am: 0, evTop: 1700, horn: { f: [392, 494], wave: 'square', lp: 2000, gain: 0.22 }, reverseBeep: true, airBrake: false, squeal: 0.8 },
  suprim: { type: 'ev', cyl: 0, gain: 0.55, lp: [2600, 5200], am: 0, evTop: 2100, horn: { f: [440, 587], wave: 'square', lp: 2200, gain: 0.2 }, reverseBeep: true, airBrake: false, squeal: 0.8 },
  evbike: { type: 'ev', cyl: 0, gain: 0.55, lp: [3200, 7000], am: 0, evTop: 3800, horn: { f: [660, 880], wave: 'square', lp: 3000, gain: 0.18 }, reverseBeep: false, airBrake: false, squeal: 0.7 },
  bike: { type: 'single', cyl: 1, gain: 0.5, lp: [500, 3000], am: 0.5, evTop: 0, horn: { f: [620, 760], wave: 'square', lp: 2800, gain: 0.18 }, reverseBeep: false, airBrake: false, squeal: 0.7 },
  auto: { type: 'twostroke', cyl: 2, gain: 0.55, lp: [700, 2600], am: 0.55, evTop: 0, horn: { f: [520, 640], wave: 'sawtooth', lp: 2200, gain: 0.16 }, reverseBeep: false, airBrake: false, squeal: 0.6 },
  bus: { type: 'diesel', cyl: 6, gain: 0.8, lp: [260, 1000], am: 0.35, evTop: 0, horn: { f: [185, 233], wave: 'sawtooth', lp: 1400, gain: 0.3 }, reverseBeep: true, airBrake: true, squeal: 0.4 },
  tank: { type: 'tank', cyl: 6, gain: 0.95, lp: [200, 800], am: 0.4, evTop: 0, horn: { f: [140, 175], wave: 'sawtooth', lp: 900, gain: 0.3 }, reverseBeep: false, airBrake: false, squeal: 0 },
  rickshaw: { type: 'pedal', cyl: 0, gain: 0, lp: [400, 400], am: 0, evTop: 0, horn: 'bell', reverseBeep: false, airBrake: false, squeal: 0.2 },
};

const FALLBACK: Profile = PROFILES.sedan as Profile;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** One audible vehicle: a small synth graph + one-shot helpers. */
class Voice {
  /** One-shots (and everything else) go through this: pan -> distance low-pass -> master. */
  readonly input: GainNode;
  private pan: StereoPannerNode;
  private lp: BiquadFilterNode;
  private nodes: AudioScheduledSourceNode[] = [];

  // ICE group
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private oscC: OscillatorNode;
  private amLfo: OscillatorNode;
  private engFilter: BiquadFilterNode;
  private engGain: GainNode;
  private intakeFilter: BiquadFilterNode;
  private intakeGain: GainNode;
  // EV group
  private w1: OscillatorNode;
  private w2: OscillatorNode;
  private w3: OscillatorNode;
  private hum: OscillatorNode;
  private avasA: OscillatorNode;
  private avasB: OscillatorNode;
  private evGain: GainNode;
  private avasGain: GainNode;
  // road
  private rollFilter: BiquadFilterNode;
  private rollGain: GainNode;
  private windFilter: BiquadFilterNode;
  private windGain: GainNode;
  private screechFilter: BiquadFilterNode;
  private screechGain: GainNode;
  private screechLfo: OscillatorNode;
  // rhythmic layers (rickshaw chain, tank tracks)
  private tickFilter: BiquadFilterNode;
  private tickGain: GainNode;
  private tickLfo: OscillatorNode;
  // horn
  private hornA: OscillatorNode;
  private hornB: OscillatorNode;
  private hornGain: GainNode;
  // fire
  private fireGain: GainNode;

  // edge detection
  private prev: VehicleAudioState;
  private airT = 0;
  private beepT = 0;
  private hornPrev = false;
  private dead = false;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private noise: AudioBuffer,
    private p: Profile,
    first: VehicleAudioState,
  ) {
    this.prev = first;
    const vg = ctx.createGain();
    vg.gain.value = 0;
    this.input = vg;
    this.pan = ctx.createStereoPanner();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 16000;
    vg.connect(this.pan);
    this.pan.connect(this.lp);
    this.lp.connect(dest);

    const osc = (type: OscillatorType, f = 40): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      this.nodes.push(o);
      return o;
    };
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
    const nz = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      this.nodes.push(s);
      return s;
    };

    // ---- combustion engine ----
    this.oscA = osc('sawtooth');
    this.oscB = osc('square');
    this.oscC = osc('triangle');
    const mixA = gain(0.5);
    const mixB = gain(0.22);
    const mixC = gain(0.26);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    this.engFilter = filt('lowpass', 400, 0.9);
    const am = gain(1 - p.am / 2);
    this.amLfo = osc('sine', 20);
    const amDepth = gain(p.am / 2);
    this.amLfo.connect(amDepth);
    amDepth.connect(am.gain);
    this.engGain = gain(0);
    this.oscA.connect(mixA);
    this.oscB.connect(mixB);
    this.oscC.connect(mixC);
    mixA.connect(shaper);
    mixB.connect(shaper);
    mixC.connect(shaper);
    shaper.connect(this.engFilter);
    this.engFilter.connect(am);
    am.connect(this.engGain);
    this.engGain.connect(vg);
    const intake = nz();
    this.intakeFilter = filt('bandpass', 500, 0.8);
    this.intakeGain = gain(0);
    intake.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(vg);

    // ---- electric motor ----
    this.w1 = osc('sine', 300);
    this.w2 = osc('triangle', 600);
    this.w3 = osc('sine', 900);
    this.hum = osc('sine', 90);
    this.evGain = gain(0);
    const evMix1 = gain(0.5);
    const evMix2 = gain(0.22);
    const evMix3 = gain(0.12);
    const humMix = gain(0.25);
    this.w1.connect(evMix1);
    this.w2.connect(evMix2);
    this.w3.connect(evMix3);
    this.hum.connect(humMix);
    for (const m of [evMix1, evMix2, evMix3, humMix]) m.connect(this.evGain);
    this.evGain.connect(vg);
    this.avasA = osc('sine', 220);
    this.avasB = osc('sine', 277);
    this.avasGain = gain(0);
    this.avasA.connect(this.avasGain);
    this.avasB.connect(this.avasGain);
    this.avasGain.connect(vg);

    // ---- tyres on the road, wind ----
    const roll = nz();
    this.rollFilter = filt('bandpass', 400, 0.6);
    this.rollGain = gain(0);
    roll.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(vg);
    const wind = nz();
    this.windFilter = filt('highpass', 500, 0.5);
    this.windGain = gain(0);
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(vg);
    const scr = nz();
    this.screechFilter = filt('bandpass', 2100, 7);
    const scrAm = gain(0.65);
    this.screechLfo = osc('sine', 11);
    const scrDepth = gain(0.35);
    this.screechLfo.connect(scrDepth);
    scrDepth.connect(scrAm.gain);
    this.screechGain = gain(0);
    scr.connect(this.screechFilter);
    this.screechFilter.connect(scrAm);
    scrAm.connect(this.screechGain);
    this.screechGain.connect(vg);

    // ---- rhythmic: chain ticks (rickshaw) / track clatter (tank) ----
    const tick = nz();
    this.tickFilter = filt('bandpass', p.type === 'tank' ? 850 : 3200, 1.2);
    const tickAm = gain(0.5);
    this.tickLfo = osc('square', 4);
    const tickDepth = gain(0.5);
    this.tickLfo.connect(tickDepth);
    tickDepth.connect(tickAm.gain);
    this.tickGain = gain(0);
    tick.connect(this.tickFilter);
    this.tickFilter.connect(tickAm);
    tickAm.connect(this.tickGain);
    this.tickGain.connect(vg);

    // ---- horn ----
    const h = p.horn === 'bell' ? null : p.horn;
    this.hornA = osc(h ? h.wave : 'sine', h ? h.f[0] : 440);
    this.hornB = osc(h ? h.wave : 'sine', h ? h.f[1] : 550);
    const hornLp = filt('lowpass', h ? h.lp : 2000, 0.7);
    this.hornGain = gain(0);
    this.hornA.connect(hornLp);
    this.hornB.connect(hornLp);
    hornLp.connect(this.hornGain);
    this.hornGain.connect(vg);

    // ---- fire crackle ----
    const fire = nz();
    const fireF = filt('bandpass', 1700, 0.9);
    this.fireGain = gain(0);
    fire.connect(fireF);
    fireF.connect(this.fireGain);
    this.fireGain.connect(vg);

    // start everything (noise sources at random offsets so layers do not correlate)
    for (const n of this.nodes) {
      if (n instanceof AudioBufferSourceNode) n.start(ctx.currentTime, Math.random() * 1.5);
      else n.start();
    }
  }

  private set(param: AudioParam, v: number, tc = 0.06): void {
    param.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  /** Short filtered noise burst. */
  private burst(freq: number, q: number, dur: number, gain: number, delay = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.input);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** Short pitched tone that glides f0 -> f1. */
  private tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.input);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * @param vol 0..1 distance volume, @param cutoff distance / cabin low-pass (Hz), @param pan -1..1
   * @param near the player can really hear one-shots from this vehicle
   */
  update(st: VehicleAudioState, vol: number, cutoff: number, pan: number, isPlayer: boolean, horn: boolean, dt: number, near: boolean): void {
    if (this.dead) return;
    const p = this.p;
    const pr = this.prev;
    const sp = Math.abs(st.speed);
    const on = st.engineOn && st.state !== 'wrecked';
    const load = st.throttle;
    const rpm01 = clamp((st.rpm - st.idle) / Math.max(1, st.redline - st.idle), 0, 1);
    const now = this.ctx.currentTime;
    this.set(this.input.gain, vol, 0.05);
    this.set(this.pan.pan, pan, 0.08);
    this.set(this.lp.frequency, cutoff, 0.1);

    // ---------------- engine ----------------
    const combustion = p.type === 'ice' || p.type === 'diesel' || p.type === 'single' || p.type === 'twostroke' || p.type === 'tank';
    if (combustion) {
      const fire = Math.max(9, p.type === 'twostroke' ? (st.rpm / 60) * p.cyl : ((st.rpm / 60) * p.cyl) / 2);
      this.set(this.oscA.frequency, fire, 0.03);
      this.set(this.oscB.frequency, fire * 0.5, 0.03);
      this.set(this.oscC.frequency, fire * 2, 0.03);
      this.set(this.amLfo.frequency, fire, 0.03);
      this.set(this.engFilter.frequency, p.lp[0] + (p.lp[1] - p.lp[0]) * (0.25 * rpm01 + 0.75 * load), 0.06);
      let eg = on ? p.gain * (0.28 + 0.5 * load + 0.22 * rpm01) : 0;
      if (st.limiter && p.type !== 'tank') eg *= Math.floor(now * 22) % 2 === 0 ? 0.3 : 1; // rev limiter bounce
      if (st.shifting) eg *= 0.35; // torque cut during a gear change
      if (on && st.state === 'ok' && st.hp < 30 && Math.random() < 0.12) eg *= 0.15; // limp-mode sputter
      this.set(this.engGain.gain, eg, 0.04);
      this.set(this.intakeFilter.frequency, 350 + 1500 * rpm01, 0.08);
      this.set(this.intakeGain.gain, on ? p.gain * 0.22 * load * (0.3 + 0.7 * rpm01) : 0, 0.06);
    } else {
      this.set(this.engGain.gain, 0, 0.05);
      this.set(this.intakeGain.gain, 0, 0.05);
    }

    // ---------------- electric motor ----------------
    if (p.type === 'ev') {
      const f = 220 + rpm01 * p.evTop;
      const moving = clamp(sp / 6, 0, 1);
      const drive = Math.max(load, st.engineBraking ? 0.4 : 0);
      this.set(this.w1.frequency, f, 0.05);
      this.set(this.w2.frequency, f * 2, 0.05);
      this.set(this.w3.frequency, f * 3.02, 0.05);
      this.set(this.hum.frequency, 70 + rpm01 * 180, 0.06);
      this.set(this.evGain.gain, on ? p.gain * (0.04 + 0.3 * drive) * (0.3 + 0.7 * moving) * (st.shifting ? 0.5 : 1) : 0, 0.05);
      // low-speed pedestrian warning hum
      this.set(this.avasGain.gain, on ? 0.05 * clamp(1 - sp / 8, 0, 1) : 0, 0.15);
    } else {
      this.set(this.evGain.gain, 0, 0.05);
      this.set(this.avasGain.gain, 0, 0.05);
    }

    // ---------------- tyres, wind, screech ----------------
    const grounded = st.wheelCount > 0 ? st.wheelsOnGround / st.wheelCount : 1;
    const surf = st.surface; // 0 ground, 1 gravel, 2 asphalt
    const rollBase = p.type === 'tank' ? 0.05 : surf === 2 ? 0.13 : surf === 1 ? 0.22 : 0.2;
    this.set(this.rollFilter.frequency, (surf === 2 ? 260 : 190) + sp * (surf === 2 ? 15 : 9), 0.1);
    this.set(this.rollGain.gain, Math.pow(clamp(sp / 24, 0, 1), 1.2) * rollBase * grounded, 0.1);
    const windAmt = Math.pow(clamp((sp - 10) / 40, 0, 1), 2) * (st.enclosed && isPlayer ? 0.1 : 0.26);
    this.set(this.windFilter.frequency, 400 + sp * 22, 0.1);
    this.set(this.windGain.gain, windAmt, 0.12);

    let scr = 0;
    const slidSpeed = clamp((sp - 1.5) / 4, 0, 1);
    if (grounded > 0.4) {
      scr = Math.max(scr, clamp((st.lateral - 2.4) / 5, 0, 1) * slidSpeed);
      if (st.handbrake && sp > 5) scr = Math.max(scr, 0.55);
      if (st.brake > 0.6 && sp > 14) scr = Math.max(scr, clamp((sp - 14) / 25, 0, 0.4));
    }
    const squeal = st.brake > 0.35 && sp > 0.6 && sp < 6 && p.squeal > 0 ? 0.18 * clamp(sp / 2, 0, 1) : 0;
    this.set(this.screechFilter.frequency, (squeal > scr ? 3000 : 1800) + sp * 18, 0.05);
    this.set(this.screechLfo.frequency, 8 + sp * 0.3, 0.1);
    this.set(this.screechGain.gain, Math.max(scr * 0.34, squeal) * p.squeal, 0.04);

    // ---------------- chain ticks (rickshaw) / track clatter (tank) ----------------
    if (p.type === 'pedal') {
      this.set(this.tickLfo.frequency, 1.5 + sp * 1.3, 0.1);
      this.set(this.tickGain.gain, clamp(sp / 1.2, 0, 1) * 0.16, 0.1);
    } else if (p.type === 'tank') {
      this.set(this.tickLfo.frequency, 2 + sp * 1.7, 0.1);
      this.set(this.tickGain.gain, clamp(sp / 5, 0, 1) * 0.5, 0.1);
    } else this.set(this.tickGain.gain, 0, 0.1);

    // ---------------- horn (held) / bell (press) ----------------
    const hornOn = isPlayer && horn;
    if (p.horn === 'bell') {
      if (hornOn && !this.hornPrev) {
        this.tone(2300, 2300, 0.9, 0.22, 'sine');
        this.tone(3450, 3450, 0.7, 0.12, 'sine');
        this.tone(2300, 2300, 0.9, 0.22, 'sine', 0.16);
      }
    } else this.set(this.hornGain.gain, hornOn ? p.horn.gain : 0, 0.012);
    this.hornPrev = hornOn;

    // ---------------- fire ----------------
    this.set(this.fireGain.gain, 0, 0.03); // fire sound comes from VehicleFire

    // ---------------- one-shots ----------------
    if (near) {
      // starter / power-up and shut-down
      if (on && !(pr.engineOn && pr.state !== 'wrecked')) {
        if (p.type === 'ev') {
          this.tone(520, 520, 0.14, 0.14, 'sine');
          this.tone(780, 780, 0.22, 0.14, 'sine', 0.14);
        } else if (p.type !== 'pedal') {
          this.tone(60, 140, 0.6, 0.2, 'sawtooth');
          this.burst(300, 1, 0.5, 0.16);
        }
      } else if (!on && pr.engineOn && pr.state !== 'wrecked') {
        if (p.type === 'ev') {
          this.tone(780, 780, 0.12, 0.1, 'sine');
          this.tone(520, 400, 0.22, 0.1, 'sine', 0.12);
        } else if (p.type !== 'pedal') this.tone(120, 45, 0.45, 0.14, 'sawtooth');
      }
      // door
      if (pr.door < 0.02 && st.door >= 0.02) {
        this.burst(170, 1, 0.14, 0.45);
        this.burst(2800, 6, 0.02, 0.2, 0.02);
      } else if (pr.door >= 0.02 && st.door < 0.02) {
        this.burst(110, 1, 0.18, 0.6);
        this.burst(3000, 8, 0.03, 0.3, 0.05);
      }
      // gear clunk
      if (st.shifting && !pr.shifting && combustion) this.burst(140, 1.2, 0.12, 0.3);
      // backfire pop on lift-off
      if ((p.type === 'ice' || p.type === 'single' || p.type === 'twostroke') && pr.throttle > 0.5 && st.throttle < 0.1 && rpm01 > 0.55 && Math.random() < 0.5) {
        this.burst(220, 1.2, 0.09, 0.35, 0.02);
        if (Math.random() < 0.4) this.burst(260, 1.4, 0.07, 0.25, 0.12);
      }
      // handbrake ratchet
      if (st.handbrake && !pr.handbrake) for (let k = 0; k < 3; k++) this.burst(2600, 8, 0.015, 0.25, k * 0.05);
      // bus air-brake hiss
      if (p.airBrake && pr.brake > 0.5 && st.brake < 0.1 && Math.abs(pr.speed) > 2) this.burst(5500, 0.7, 0.55, 0.22, 0, 'highpass');
      // landing thump after being airborne
      if (st.wheelsOnGround === 0) this.airT += dt;
      else {
        if (this.airT > 0.22 && st.wheelsOnGround >= 2) this.burst(95, 1.2, 0.28, clamp(0.3 + this.airT, 0.3, 0.9));
        this.airT = 0;
      }
      // reverse beeper
      if (p.reverseBeep && on && st.gear < 0 && sp > 0.2) {
        this.beepT -= dt;
        if (this.beepT <= 0) {
          this.tone(1000, 1000, 0.14, 0.12, 'triangle');
          this.beepT = 0.85;
        }
      } else this.beepT = 0;
    }
    this.prev = st;
  }

  /** Fade out and free the audio nodes. */
  retire(): void {
    if (this.dead) return;
    this.dead = true;
    this.set(this.input.gain, 0, 0.08);
    setTimeout(() => {
      for (const n of this.nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      this.input.disconnect();
      this.pan.disconnect();
      this.lp.disconnect();
    }, 400);
  }
}

/** All vehicle sound: owns the AudioContext and one voice per audible vehicle. */
export class VehicleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<Vehicle, Voice>();
  private muted = false;
  private tmp = new THREE.Vector3();
  private cand: { v: Vehicle; d: number; x: number; y: number; z: number }[] = [];

  /** The nearest N vehicles (plus the player's) get a voice. */
  private static readonly MAX_VOICES = 7;
  private static readonly RANGE = 80;

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private ensure(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor(); // many engines at once must not clip
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      comp.connect(ctx.destination);
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.9;
      master.connect(comp);
      this.master = master;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /**
   * Every frame.
   * @param driver the vehicle the player drives (null on foot)
   * @param focus world position of the listener (camera / player)
   * @param project world -> screen pixels (null = behind the camera), used for stereo pan
   * @param horn the horn key is held
   */
  update(dt: number, vehicles: readonly Vehicle[], driver: Vehicle | null, focus: THREE.Vector3, project: (w: THREE.Vector3) => { x: number; y: number } | null, horn: boolean): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noise) return;
    // pick the audible vehicles
    this.cand.length = 0;
    for (const v of vehicles) {
      if (!v.enabled) continue;
      v.getWorldPosition(this.tmp);
      const d = v === driver ? 0 : Math.hypot(this.tmp.x - focus.x, this.tmp.z - focus.z);
      if (d < VehicleAudio.RANGE) this.cand.push({ v, d, x: this.tmp.x, y: this.tmp.y, z: this.tmp.z });
    }
    this.cand.sort((a, b) => a.d - b.d);
    const chosen = this.cand.slice(0, VehicleAudio.MAX_VOICES);
    const keep = new Set(chosen.map((c) => c.v));
    for (const [v, voice] of this.voices) {
      if (!keep.has(v)) {
        voice.retire();
        this.voices.delete(v);
      }
    }
    const w = typeof window !== 'undefined' ? window.innerWidth || 1 : 1;
    for (const c of chosen) {
      const st = c.v.audioState();
      let voice = this.voices.get(c.v);
      if (!voice) {
        voice = new Voice(this.ctx, this.master, this.noise, PROFILES[c.v.spec.look.kind] ?? FALLBACK, st);
        this.voices.set(c.v, voice);
      }
      const isPlayer = c.v === driver;
      let pan = 0;
      let behind = false;
      if (!isPlayer) {
        const s = project(this.tmp.set(c.x, c.y, c.z));
        if (s) pan = clamp((s.x / w) * 2 - 1, -1, 1) * 0.85;
        else behind = true;
      }
      const fade = c.d > 65 ? (VehicleAudio.RANGE - c.d) / (VehicleAudio.RANGE - 65) : 1;
      const vol = isPlayer ? 1 : (fade * (behind ? 0.6 : 1)) / (1 + Math.pow(c.d / 9, 1.7));
      const cutoff = isPlayer ? (st.enclosed ? 6500 : 16000) : Math.max(900, 16000 / (1 + c.d / 9));
      voice.update(st, vol, cutoff, pan, isPlayer, horn, dt, isPlayer || c.d < 25);
    }
  }

  dispose(): void {
    for (const voice of this.voices.values()) voice.retire();
    this.voices.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
