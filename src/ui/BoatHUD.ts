import { bn, bnNum } from '../i18n';
import type { BoatTelemetry } from '../boats/Boat';
import { UI_FONT } from './theme';

/**
 * Boat instruments (all Bangla, only real data - no instructions): speed, throttle lever, outboard (rudder) angle,
 * heading, water depth, and the forces that make a boat work: buoyancy vs weight (Archimedes) and thrust vs water drag.
 * The map is the always-on site map (ui/Minimap.ts).
 */
export class BoatHUD {
  private root = document.createElement('div');
  private panel = document.createElement('div');
  private visible = false;
  private timer = 0;

  constructor(parent: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      bottom: '14px',
      transform: 'translateX(-50%)',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '11',
    });
    Object.assign(this.panel.style, {
      color: '#e8f0ff',
      font: `500 13px/1.55 ${UI_FONT}`,
      background: 'rgba(0,0,0,0.6)',
      padding: '8px 12px',
      borderRadius: '8px',
      minWidth: '320px',
    });
    this.root.append(this.panel);
    parent.appendChild(this.root);
    // small screens: scale the instruments down
    const fit = () => {
      const k = Math.min(1, window.innerHeight / 620, window.innerWidth / 640);
      this.root.style.transformOrigin = 'bottom center';
      this.root.style.transform = `translateX(-50%)${k < 1 ? ` scale(${k})` : ''}`;
    };
    fit();
    window.addEventListener('resize', fit);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  update(t: BoatTelemetry, dt: number): void {
    if (!this.visible) return;
    this.timer += dt;
    if (this.timer < 0.1) return;
    this.timer = 0;
    const b = bn.boat;
    const bar = (v: number, color: string) =>
      `<span style="display:inline-block;width:90px;height:8px;background:#333;border-radius:4px;vertical-align:middle"><span style="display:block;width:${Math.round(Math.max(0, Math.min(1, v)) * 90)}px;height:8px;background:${color};border-radius:4px"></span></span>`;
    const dir = bn.heli.compass[Math.round(t.heading / 45) % 8];
    const rudderDeg = (t.rudder * 180) / Math.PI;
    const lever = t.lever >= 0 ? bar(t.lever, t.boost ? '#ff9a3c' : '#5ad17a') : bar(-t.lever, '#ff6a6a');
    const warn = !t.propInWater ? `<div style="color:#ff6a6a">${b.propOut}</div>` : '';
    const ratio = t.weight > 0 ? t.buoyancy / t.weight : 0;
    this.panel.innerHTML =
      `<div>${b.speed}: <b style="font-size:20px">${bnNum(Math.abs(t.kmh))}</b> ${bn.vehicle.kmh}${t.speed < -0.5 ? ` · <span style="color:#ff6a6a">${b.reverse}</span>` : ''}${t.boost ? ` · <span style="color:#ff9a3c">${b.boost}</span>` : ''}${t.anchor ? ` · <span style="color:#5aa9ff">${b.anchor}</span>` : ''}</div>` +
      `<div>${b.throttle}: ${lever} ${bnNum(Math.abs(t.lever) * 100)}%</div>` +
      `<div>${b.rudder}: <b>${rudderDeg >= 0 ? '◀ ' : '▶ '}${bnNum(Math.abs(rudderDeg))}°</b> · ${b.heading}: <b>${bnNum(t.heading)}°</b> ${dir}</div>` +
      `<div>${b.depth}: <b>${t.depth > 0 ? bnNum(t.depth, 1) : '—'}</b> ${bn.units.meter}${t.current > 0.1 ? ` · ${b.current}: ${bnNum(t.current, 1)} ${bn.units.meterPerSec}` : ''}</div>` +
      `<div>${b.buoyancy}: <b>${bnNum(t.buoyancy)}</b> / ${b.weight} ${bnNum(t.weight)} ${b.newton} ${bar(ratio / 1.4, '#4fc3f7')}</div>` +
      `<div>${b.thrust}: <b>${bnNum(Math.abs(t.thrust))}</b> ${b.newton} · ${b.drag}: <b>${bnNum(t.drag)}</b> ${b.newton}</div>` +
      (t.aground ? `<div style="color:#ffb84d">${b.aground}</div>` : '') +
      warn;
  }
}
