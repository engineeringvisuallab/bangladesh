import type { RailNetwork } from '../rail/RailNetwork';
import { bn } from '../i18n';
import type { TrainFleet, TrainNotice } from './TrainSim';

/**
 * STAGE 15 / Step 6: Bangla station announcements (pure logic; the engine hands it VoiceManager.speakAnnouncement).
 * Listens to the fleet's notices and speaks only when the player is near the station the notice is about (approach: 600 m farther out, so the
 * announcement is heard while the train comes in). Never more often than every `minGap` simulated seconds; an announcement that the voice
 * refuses (something else is being said) does not use up the gap.
 * Every line has a stable id `train-<kind>-<station id>` (the name of the optional recorded file) and a fixed Bangla sentence (the subtitle).
 */
export type SayFn = (key: string, text: string) => boolean | void;

export interface Announcement {
  key: string;
  text: string;
  kind: 'approach' | 'arrive' | 'depart' | 'holdPlatform' | 'holdSignal';
  station: string;
}

export class TrainAnnouncer {
  private px = 1e9;
  private pz = 1e9;
  private lastT = -1e9;
  /** Everything said (tests / debug). */
  readonly said: Announcement[] = [];
  enabled = true;

  constructor(fleet: TrainFleet, private rail: RailNetwork, private say: SayFn, private opts: { minGap?: number; hear?: number; hearApproach?: number } = {}) {
    fleet.listeners.push((n) => this.onNotice(n));
  }

  setPlayer(x: number, z: number): void {
    this.px = x;
    this.pz = z;
  }

  /** The sentence for a notice, or null when this kind is not announced. */
  static compose(n: Pick<TrainNotice, 'kind' | 'station' | 'atPlatform'>, stationName: string): Announcement | null {
    const A = bn.trains.announce;
    switch (n.kind) {
      case 'approach': return { key: `train-approach-${n.station}`, text: A.approach(stationName), kind: 'approach', station: n.station };
      case 'arrive': return { key: `train-arrive-${n.station}`, text: A.arrive(stationName), kind: 'arrive', station: n.station };
      case 'depart': return { key: `train-depart-${n.station}`, text: A.depart(stationName), kind: 'depart', station: n.station };
      case 'hold':
        return n.atPlatform
          ? { key: `train-hold-platform-${n.station}`, text: A.holdPlatform(stationName), kind: 'holdPlatform', station: n.station }
          : { key: `train-hold-signal-${n.station}`, text: A.holdSignal(stationName), kind: 'holdSignal', station: n.station };
      default: return null;
    }
  }

  private onNotice(n: TrainNotice): void {
    if (!this.enabled) return;
    const st = this.rail.stations.find((s) => s.id === n.station);
    if (!st) return;
    const reach = st.radius + (n.kind === 'approach' || (n.kind === 'hold' && !n.atPlatform) ? (this.opts.hearApproach ?? 600) : (this.opts.hear ?? 150));
    if (Math.hypot(this.px - st.x, this.pz - st.z) > reach) return;
    if (n.t - this.lastT < (this.opts.minGap ?? 10)) return;
    const a = TrainAnnouncer.compose(n, bn.rail.station[n.station] ?? n.station);
    if (!a) return;
    if (this.say(a.key, a.text) === false) return;
    this.lastT = n.t;
    this.said.push(a);
  }
}
