import type { Vehicle } from '../vehicles';
import type { VehicleId } from '../vehicles/VehicleSpec';
import { bn, bnDigits } from '../i18n';
import { Gold, GoldConfig, accidentFine } from './Gold';
import { GoldHUD } from '../ui/GoldHUD';

const fmt = (n: number): string => bnDigits(Math.floor(n).toLocaleString('en-US'));

/** One traffic accident of the player: all the hits that happen within `accidentWindow` seconds are ONE accident. */
interface Incident {
  last: number;
  vehicles: Map<Vehicle, VehicleId>;
  killed: Set<object>;
  hurt: Set<object>;
}

/**
 * The Gold economy of the player.
 *   START : 10,000 Gold.
 *   FINE  : crossing a stop line on RED = 10 Gold.
 *           traffic accident (the player's vehicle hits another vehicle / runs people over) = 500 Gold x (type of the vehicle that was hit)
 *           + 500 Gold for every person killed (see GoldConfig / accidentFine).
 *   GIFT  : killing a criminal = 200 Gold.
 */
export class Economy {
  readonly gold = new Gold();
  private hud: GoldHUD;
  private now = 0;
  private incident: Incident | null = null;
  private lastSignalFine = -999;

  constructor(parent: HTMLElement) {
    this.hud = new GoldHUD(parent);
    this.hud.setBalance(this.gold.balance);
    this.gold.onChange((b) => this.hud.setBalance(b));
  }

  get balance(): number {
    return this.gold.balance;
  }

  /** Show / hide the balance chip (settings menu); fines and gifts still pop up as messages. */
  setBalanceVisible(on: boolean): void {
    this.hud.setChipVisible(on);
  }

  /** The player's vehicle crossed a stop line on a red light. */
  redLight(): void {
    if (this.now - this.lastSignalFine < GoldConfig.signalCooldown) return;
    this.lastSignalFine = this.now;
    const taken = this.gold.charge(GoldConfig.signalFine, bn.gold.fine);
    const text = taken < GoldConfig.signalFine ? bn.gold.fineShort : `${bn.gold.fine}: −${fmt(taken)} ${bn.gold.unit}`;
    this.hud.say(text, 'fine');
  }

  /** The player's vehicle crashed into another vehicle. */
  vehicleHit(other: Vehicle): void {
    this.open().vehicles.set(other, other.spec.look.kind);
  }

  /** The player's vehicle hit a person (a normal civilian / policeman, not a criminal). `who` identifies the person (counted once). */
  personHit(who: object, died: boolean): void {
    const inc = this.open();
    if (died) {
      inc.killed.add(who);
      inc.hurt.delete(who);
    } else if (!inc.killed.has(who)) inc.hurt.add(who);
  }

  /** The player killed a criminal: a gift. */
  criminalKilled(): void {
    this.gold.earn(GoldConfig.criminalReward, bn.gold.criminal);
    this.hud.say(`${bn.gold.criminal}: +${fmt(GoldConfig.criminalReward)} ${bn.gold.unit}`, 'income');
  }

  /** Short message under the Gold chip. */
  say(text: string, kind: 'fine' | 'income'): void {
    this.hud.say(text, kind);
  }

  /** Every frame: an accident whose hits stopped coming is closed and fined. */
  update(t: number): void {
    this.now = t;
    const inc = this.incident;
    if (!inc || t - inc.last < GoldConfig.accidentWindow) return;
    this.incident = null;
    const kinds = [...inc.vehicles.values()];
    const killed = inc.killed.size;
    const fine = accidentFine(kinds, killed);
    const taken = this.gold.charge(fine, bn.gold.accident);
    // what exactly was hit, for the message
    const parts: string[] = [];
    const names = new Map<string, number>();
    for (const v of inc.vehicles.keys()) names.set(v.spec.nameBn, (names.get(v.spec.nameBn) ?? 0) + 1);
    for (const [n, c] of names) parts.push(c > 1 ? `${n} ×${bnDigits(String(c))}` : n);
    if (killed > 0) parts.push(`${bnDigits(String(killed))} ${bn.gold.killed}`);
    else if (inc.hurt.size > 0) parts.push(`${bnDigits(String(inc.hurt.size))} ${bn.gold.hurt}`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    const text = taken < fine ? `${bn.gold.fineShort}: −${fmt(taken)} ${bn.gold.unit}` : `${bn.gold.accident}${detail}: −${fmt(taken)} ${bn.gold.unit}`;
    this.hud.say(text, 'fine');
  }

  dispose(): void {
    this.hud.dispose();
  }

  private open(): Incident {
    if (!this.incident) this.incident = { last: this.now, vehicles: new Map(), killed: new Set(), hurt: new Set() };
    this.incident.last = this.now;
    return this.incident;
  }
}
