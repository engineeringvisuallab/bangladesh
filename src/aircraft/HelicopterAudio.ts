/**
 * Procedural helicopter sound (Web Audio, no files): filtered noise that "chops" at the blade-pass rate
 * plus a turbine whine. Loudness and pitch follow the rotor speed. Created on first use (needs a user gesture).
 */
export class HelicopterAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private turbine: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private muted = false;
  private active = false;

  setMuted(m: boolean): void {
    this.muted = m;
    if (m && this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  start(): void {
    this.active = true;
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) this.build();
    void this.ctx?.resume();
  }

  stop(): void {
    this.active = false;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  /** rpm 0..1, collective 0..1, speed in m/s. `gain` 0..1 = how near the listener is (1 = inside). */
  update(rpm: number, collective: number, speed: number, gain = 1): void {
    if (!this.ctx || !this.master || !this.active) return;
    const now = this.ctx.currentTime;
    const loud = this.muted ? 0 : Math.min(1, rpm * 1.1) * (0.55 + 0.35 * collective + Math.min(0.1, speed / 600));
    this.master.gain.setTargetAtTime(loud * 0.55 * gain, now, 0.08);
    this.lfo?.frequency.setTargetAtTime(3 + 9 * rpm, now, 0.1);
    this.lowpass?.frequency.setTargetAtTime(350 + 900 * collective * rpm, now, 0.15);
    this.turbine?.frequency.setTargetAtTime(120 + 520 * rpm, now, 0.15);
    this.turbineGain?.gain.setTargetAtTime(0.03 + 0.05 * rpm, now, 0.15);
    void speed;
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // looping white noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 600;
    this.lowpass = lowpass;

    // blade chop: LFO modulating the gain of the noise
    const chop = ctx.createGain();
    chop.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth);
    depth.connect(chop.gain);
    this.lfo = lfo;

    noise.connect(lowpass);
    lowpass.connect(chop);
    chop.connect(master);

    // turbine whine
    const turbine = ctx.createOscillator();
    turbine.type = 'sawtooth';
    turbine.frequency.value = 120;
    const tg = ctx.createGain();
    tg.gain.value = 0.03;
    const tf = ctx.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 1400;
    turbine.connect(tf);
    tf.connect(tg);
    tg.connect(master);
    this.turbine = turbine;
    this.turbineGain = tg;

    noise.start();
    lfo.start();
    turbine.start();
  }

  dispose(): void {
    this.active = false;
    void this.ctx?.close();
    this.ctx = null;
  }
}
