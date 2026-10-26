/** Settings that are only about what is shown on the screen (and a few small preferences). Saved in the browser. */
export interface HudOptions {
  /** The little dot in the middle of the screen (and the aim ring / hit marker). */
  crosshair: boolean;
  /** The Gold balance chip at the top. Fine / income messages still pop up. */
  gold: boolean;
  /** Weapon + bullets chip and the wanted stars (the stars still flash for a few seconds when the level changes). */
  weapon: boolean;
  /** false = the area name (city mall, SWTP, ...) shows for a few seconds when you enter an area; true = it stays on the screen. */
  areaAlways: boolean;
  /** Sound / voice off. */
  muted: boolean;
  /** Minimap zoom: 0 close, 1 medium, 2 whole world. */
  mapZoom: number;
  /** Water quality: 0 low, 1 medium, 2 high (waves, seabed plants, sea life, light beams, caustics). */
  waterQuality: number;
  /** true = the diver never runs out of breath. */
  infiniteOxygen: boolean;
}

export const HUD_DEFAULTS: Readonly<HudOptions> = {
  crosshair: true,
  gold: false,
  weapon: false,
  areaAlways: false,
  muted: false,
  mapZoom: 1,
  waterQuality: 1,
  infiniteOxygen: false,
};

const KEY = 'evcity.settings';

export class HudSettings {
  readonly values: HudOptions = { ...HUD_DEFAULTS };
  private listeners: ((v: Readonly<HudOptions>) => void)[] = [];

  constructor() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (raw) {
        const o = JSON.parse(raw) as Partial<Record<keyof HudOptions, unknown>>;
        for (const k of ['crosshair', 'gold', 'weapon', 'areaAlways', 'muted'] as const) if (typeof o[k] === 'boolean') this.values[k] = o[k] as boolean;
        if (typeof o.infiniteOxygen === 'boolean') this.values.infiniteOxygen = o.infiniteOxygen;
        if (typeof o.waterQuality === 'number' && o.waterQuality >= 0 && o.waterQuality <= 2) this.values.waterQuality = Math.round(o.waterQuality);
        if (typeof o.mapZoom === 'number' && o.mapZoom >= 0 && o.mapZoom <= 2) this.values.mapZoom = Math.round(o.mapZoom);
      }
    } catch {
      /* broken / blocked storage: defaults */
    }
  }

  set<K extends keyof HudOptions>(key: K, value: HudOptions[K]): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l(this.values);
  }

  onChange(fn: (v: Readonly<HudOptions>) => void): void {
    this.listeners.push(fn);
  }
}
