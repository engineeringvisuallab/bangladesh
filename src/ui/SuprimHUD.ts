import type { VehicleTelemetry } from '../vehicles/Vehicle';
import { UI_FONT } from './theme';

const MODE_TEXT: Record<string, { icon: string; name: string; keys: string }> = {
  drive: { icon: '🚗', name: 'ড্রাইভ', keys: 'W A S D চলা · রেললাইনে উঠলে নিজে লক হয় · N ফ্লাইট মোড · C ডুব (পানিতে)' },
  rail: { icon: '🚆', name: 'রেললাইনে', keys: 'W / S গতি · Ctrl ধীর · A বা D ধরে রাখুন = লাইন ছাড়া · N ওড়া' },
  fly: { icon: '🛸', name: 'ফ্লাইট', keys: 'Space ওপরে · X নিচে · W A S D (সবসময় পুরো গতি) · Ctrl ধীর · N নামা' },
  land: { icon: '🛬', name: 'অবতরণ', keys: 'W A S D · N আবার ওড়া' },
  float: { icon: '🌊', name: 'পানিতে ভাসছে', keys: 'W A S D চলা (পুরো গতি) · C ডুব · N ওড়া' },
  dive: { icon: '🤿', name: 'সাবমেরিন', keys: 'W A S D চলা · Space ওপরে · X নিচে · C ভেসে ওঠা · T পানির ওপরে' },
};

const toBn = (s: string) => s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

/**
 * EVCity Suprim cockpit panel (top-centre): current mode, speed, altitude and depth, and the keys that work in this mode.
 * Shown only while the player drives a Suprim (VehicleManager decides).
 */
export class SuprimHUD {
  private root = document.createElement('div');
  private modeEl = document.createElement('div');
  private speedEl = document.createElement('div');
  private altEl = document.createElement('div');
  private depthEl = document.createElement('div');
  private keysEl = document.createElement('div');
  private last = '';

  constructor(parent: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', display: 'none',
      flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px 16px 9px', borderRadius: '16px',
      background: 'linear-gradient(160deg, rgba(8,24,44,.82), rgba(5,14,28,.82))', border: '1px solid rgba(70,170,255,.55)',
      boxShadow: '0 0 18px rgba(40,140,255,.35)', color: '#e8f4ff', fontFamily: UI_FONT, pointerEvents: 'none', zIndex: '12',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.modeEl.style, { font: `800 17px ${UI_FONT}`, letterSpacing: '.3px', color: '#7cc8ff' });
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:18px;align-items:baseline';
    const cell = (el: HTMLElement, label: string) => {
      const c = document.createElement('div');
      c.style.cssText = 'text-align:center;min-width:74px';
      el.style.cssText = `font:700 24px/1.1 ${UI_FONT};color:#fff`;
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = `font:500 11px ${UI_FONT};color:rgba(190,225,255,.75)`;
      c.append(el, l);
      row.appendChild(c);
    };
    cell(this.speedEl, 'গতি (কিমি/ঘ)');
    cell(this.altEl, 'উচ্চতা (মি)');
    cell(this.depthEl, 'গভীরতা (মি)');
    Object.assign(this.keysEl.style, { font: `500 12px ${UI_FONT}`, color: 'rgba(205,230,255,.8)' });
    this.root.append(this.modeEl, row, this.keysEl);
    parent.appendChild(this.root);
  }

  show(): void { this.root.style.display = 'flex'; }
  hide(): void { this.root.style.display = 'none'; }

  update(t: VehicleTelemetry): void {
    const m = MODE_TEXT[t.mode] ?? MODE_TEXT.drive;
    const air = t.mode === 'fly' || t.mode === 'land';
    const water = t.mode === 'float' || t.mode === 'dive';
    const key = `${t.mode}|${Math.round(t.kmh)}|${Math.round(t.altitude)}|${Math.round(t.depth)}`;
    if (key === this.last) return;
    this.last = key;
    this.modeEl.textContent = `${m.icon} ${m.name}`;
    this.speedEl.textContent = toBn(String(Math.round(t.kmh)));
    this.altEl.textContent = air ? toBn(String(Math.max(0, Math.round(t.altitude)))) : '—';
    this.depthEl.textContent = water ? toBn(String(Math.max(0, Math.round(t.depth)))) : '—';
    this.keysEl.textContent = m.keys;
  }
}
