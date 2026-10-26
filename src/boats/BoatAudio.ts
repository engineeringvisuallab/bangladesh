/**
 * Procedural outboard sound (Web Audio, no files): a rough sawtooth engine note plus filtered water noise.
 * Pitch follows the throttle, the water noise follows the speed. Created on first use (needs a user gesture).
 */
export class BoatAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
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

  /** lever -1..1, speed in m/s, propInWater false = the engine screams (revs free). */
  update(lever: number, speed: number, propInWater: boolean): void {
    if (!this.ctx || !this.master || !this.active) return;
    const now = this.ctx.currentTime;
    const l = Math.abs(lever);
    const rev = propInWater ? l : Math.min(1, l * 1.5 + 0.2);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, now, 0.08);
    this.engine?.frequency.setTargetAtTime(38 + 120 * rev + Math.min(30, speed * 1.2), now, 0.12);
    this.engineGain?.gain.setTargetAtTime(0.1 + 0.16 * rev, now, 0.12);
    this.engineFilter?.frequency.setTargetAtTime(260 + 900 * rev, now, 0.15);
    this.waterFilter?.frequency.setTargetAtTime(300 + Math.min(1800, speed * 90), now, 0.2);
    this.waterGain?.gain.setTargetAtTime(Math.min(0.32, speed * 0.018), now, 0.2);
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 300;
    const eg = ctx.createGain();
    eg.gain.value = 0.1;
    osc.connect(ef);
    ef.connect(eg);
    eg.connect(master);
    this.engine = osc;
    this.engineFilter = ef;
    this.engineGain = eg;

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 400;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    noise.connect(wf);
    wf.connect(wg);
    wg.connect(master);
    this.waterFilter = wf;
    this.waterGain = wg;

    osc.start();
    noise.start();
  }

  dispose(): void {
    this.active = false;
    void this.ctx?.close();
    this.ctx = null;
  }
}
