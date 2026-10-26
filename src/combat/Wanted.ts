import { Config } from '../core/Config';

/**
 * "Wanted" level, TIME based: stars depend on how long the player keeps fighting / committing crimes.
 *   2 min of crime = 1 star, 5 min = 2 stars, 7 min = 3, 8.5 min = 4, 10 min = 5 (see Config.combat.wanted.starAt).
 * Every crime keeps the "active" window open (activeWindow s) and adds a few bonus seconds (heat * bonusPerHeat);
 * while the window is open crime time grows 1 s per second, afterwards it fades (decay s per second).
 */
export class Wanted {
  /** Seconds of sustained crime. */
  crimeTime = 0;
  private active = 0;

  /** A crime of weight `h` (Config.combat.wanted.killCivilian ...). */
  add(h: number): void {
    const W = Config.combat.wanted;
    this.active = W.activeWindow;
    this.crimeTime = Math.min(W.starAt[W.starAt.length - 1], this.crimeTime + h * W.bonusPerHeat);
  }

  update(dt: number): void {
    const W = Config.combat.wanted;
    if (this.active > 0) {
      this.active = Math.max(0, this.active - dt);
      this.crimeTime = Math.min(W.starAt[W.starAt.length - 1], this.crimeTime + dt);
    } else {
      this.crimeTime = Math.max(0, this.crimeTime - W.decay * dt);
    }
  }

  get stars(): number {
    const at = Config.combat.wanted.starAt;
    let n = 0;
    for (let i = 0; i < at.length; i++) if (this.crimeTime >= at[i]) n = i + 1;
    return n;
  }

  /** How many police officers should be around the player. */
  get policeTarget(): number {
    return this.stars * Config.combat.wanted.policePerStar;
  }

  clear(): void {
    this.crimeTime = 0;
    this.active = 0;
  }
}
