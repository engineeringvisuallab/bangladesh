import type { VehicleId } from '../vehicles/VehicleSpec';

/**
 * GOLD = the game currency. Every number of the economy lives here, so the balance can be tuned in one place.
 */
export const GoldConfig = {
  /** Gold the player owns at the start of every game. */
  startBalance: 10000,
  /** true = the purse is kept in the browser between reloads; false = every new game starts with `startBalance`. */
  persist: false,

  // ---- FINES ----
  /** Fine for crossing the stop line of a RED traffic light (the player's vehicle). */
  signalFine: 10,
  /** Seconds before the same junction can fine the player again (one crossing = one fine). */
  signalCooldown: 8,
  /**
   * Traffic accident: base fine. The player's vehicle crashes into another vehicle and / or runs people over.
   *   fine = accidentBase x (sum of the multipliers of the vehicle types that were hit; 1 when only people were hit) + accidentKillExtra x people killed
   */
  accidentBase: 500,
  /** Extra fine for every person the player's vehicle killed in the same accident. */
  accidentKillExtra: 500,
  /** Multiplier of the base fine by the TYPE of the vehicle that was hit (a bus or a hypercar costs more than a bike). */
  vehicleMultiplier: {
    bike: 0.6,
    evbike: 0.8,
    rickshaw: 0.7,
    auto: 0.9,
    sedan: 1.0,
    jeep: 1.2,
    bus: 1.6,
    hypercar: 2.0,
    evhypar: 2.0,
    suprim: 2.5,
    tank: 2.5,
    tractor: 1.3,
    pickup: 1.2,
    combine: 2.0,
  } as Record<VehicleId, number>,
  /** A crash counts as an accident with a vehicle from this speed change (m/s, ~18 km/h); gentler bumps cost nothing. */
  accidentMinDv: 5,
  /** The player's vehicle must have been moving at least this fast (m/s) before the crash (a parked car that gets hit is not the player's fault). */
  accidentMinSpeed: 3,
  /** Hits within this many seconds of each other belong to ONE accident (one fine, one message). */
  accidentWindow: 1.6,

  // ---- INCOME ----
  /** Reward for killing a criminal (an armed attacker). */
  criminalReward: 200,

  // ---- Traffic light timing is in src/traffic/TrafficSignals.ts ----
} as const;

const KEY = 'evcity.gold.v2';

export type GoldListener = (balance: number, delta: number, reason: string) => void;

/** The player's Gold purse. */
export class Gold {
  private _balance: number = GoldConfig.startBalance;
  private listeners: GoldListener[] = [];

  constructor() {
    if (!GoldConfig.persist) return;
    try {
      const v = window.localStorage.getItem(KEY);
      if (v !== null && Number.isFinite(Number(v))) this._balance = Math.max(0, Math.floor(Number(v)));
    } catch {
      /* storage blocked: keep the default */
    }
  }

  get balance(): number {
    return this._balance;
  }

  onChange(fn: GoldListener): void {
    this.listeners.push(fn);
  }

  /** Income. */
  earn(amount: number, reason: string): void {
    if (amount <= 0) return;
    this.set(this._balance + amount, amount, reason);
  }

  /** Fine / payment. The purse never goes below 0; returns the Gold really taken. */
  charge(amount: number, reason: string): number {
    const taken = Math.min(this._balance, Math.max(0, Math.floor(amount)));
    if (taken > 0) this.set(this._balance - taken, -taken, reason);
    return taken;
  }

  private set(v: number, delta: number, reason: string): void {
    this._balance = Math.floor(v);
    if (GoldConfig.persist) {
      try {
        window.localStorage.setItem(KEY, String(this._balance));
      } catch {
        /* ignore */
      }
    }
    for (const l of this.listeners) l(this._balance, delta, reason);
  }
}

/** The accident fine for the given hits (pure function, used by the Economy and by the test). */
export function accidentFine(vehicleKinds: VehicleId[], killed: number): number {
  const mult = vehicleKinds.length ? vehicleKinds.reduce((a, k) => a + (GoldConfig.vehicleMultiplier[k] ?? 1), 0) : 1;
  return Math.round(GoldConfig.accidentBase * mult) + GoldConfig.accidentKillExtra * Math.max(0, killed);
}
