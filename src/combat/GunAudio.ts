import type { WeaponId } from './Weapons';

/** Procedural gun sounds (Web Audio, no files): a noise crack + a low thump. Quieter with distance. */
export class GunAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private lastShot = 0;

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.03);
  }

  private ensure(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const n = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /** `distance` in metres from the player (0 = the player's own gun). */
  shot(weapon: WeaponId, distance = 0): void {
    if (this.muted || !this.ensure() || !this.ctx || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.02) return; // many guns at once: do not stack
    this.lastShot = now;
    const vol = 1 / (1 + distance / 22);
    if (vol < 0.04) return;
    const big = weapon === 'shotgun' || weapon === 'sniperRifle' ? 1.5 : ['smg', 'microSmg', 'ak47', 'carbineRifle'].includes(weapon) ? 0.9 : 1;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = (weapon === 'shotgun' ? 2200 : weapon === 'sniperRifle' || weapon === 'ak47' ? 2600 : 3800) / (1 + distance / 120);
    const g = this.ctx.createGain();
    const dur = 0.09 * big + 0.05;
    g.gain.setValueAtTime(vol * 0.9, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(now, Math.random() * 0.3, dur + 0.02);

    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.frequency.setValueAtTime(150 * (weapon === 'shotgun' ? 0.7 : weapon === 'sniperRifle' || weapon === 'ak47' ? 0.8 : 1), now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    og.gain.setValueAtTime(vol * 0.7 * big, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    o.connect(og).connect(this.master);
    o.start(now);
    o.stop(now + 0.16);
  }

  /** One short metal click: `freq` Hz, `dur` s. */
  private click(delay: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  /** Empty gun: a dry click. */
  dry(): void {
    if (this.muted || !this.ensure()) return;
    this.click(0, 900, 0.04, 0.18);
  }

  /** Magazine out - and in. */
  reload(): void {
    if (this.muted || !this.ensure()) return;
    this.click(0, 420, 0.07, 0.2);
    this.click(0.35, 600, 0.05, 0.15);
  }

  /** Slide / bolt: the gun is ready. */
  reloadDone(): void {
    if (this.muted || !this.ensure()) return;
    this.click(0, 700, 0.05, 0.22);
    this.click(0.09, 1000, 0.04, 0.2);
  }

  /** Ammo picked up. */
  pickup(): void {
    if (this.muted || !this.ensure()) return;
    this.click(0, 1200, 0.05, 0.16);
    this.click(0.07, 1600, 0.07, 0.16);
  }

  /** A bullet hits the player (a dull thud). */
  thud(): void {
    if (this.muted || !this.ensure() || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(35, now + 0.15);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.2);
  }
}
