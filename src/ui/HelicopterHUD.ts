import { bn, bnNum } from '../i18n';
import type { HelicopterTelemetry } from '../aircraft/Helicopter';
import { UI_FONT } from './theme';

/**
 * Flight instruments (all Bangla, only real flight data - no instructions):
 * artificial horizon + speed, altitude, vertical speed, rotor, collective, heading, engine state.
 * The map is the always-on site map (ui/Minimap.ts).
 */
export class HelicopterHUD {
  private root = document.createElement('div');
  private horizon = document.createElement('canvas');
  private panel = document.createElement('div');
  private hctx: CanvasRenderingContext2D;
  private visible = false;
  private timer = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(parent: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      bottom: '14px',
      transform: 'translateX(-50%)',
      display: 'none',
      gap: '10px',
      alignItems: 'stretch',
      pointerEvents: 'none',
      zIndex: '11',
    });
    this.horizon.width = 150 * this.dpr;
    this.horizon.height = 150 * this.dpr;
    Object.assign(this.horizon.style, { width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)' });
    Object.assign(this.panel.style, {
      color: '#e8f0ff',
      font: `500 13px/1.55 ${UI_FONT}`,
      background: 'rgba(0,0,0,0.6)',
      padding: '8px 12px',
      borderRadius: '8px',
      minWidth: '280px',
    });
    this.root.append(this.horizon, this.panel);
    this.hctx = this.horizon.getContext('2d')!;
    parent.appendChild(this.root);
    // small screens: scale the instruments down
    const fit = () => {
      const k = Math.min(1, window.innerHeight / 620, window.innerWidth / 700);
      this.root.style.transformOrigin = 'bottom center';
      this.root.style.transform = `translateX(-50%)${k < 1 ? ` scale(${k})` : ''}`;
    };
    fit();
    window.addEventListener('resize', fit);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  update(t: HelicopterTelemetry, dt: number): void {
    if (!this.visible) return;
    this.drawHorizon(t);
    this.timer += dt;
    if (this.timer < 0.1) return;
    this.timer = 0;
    const h = bn.heli;
    const bar = (v: number, color: string) =>
      `<span style="display:inline-block;width:90px;height:8px;background:#333;border-radius:4px;vertical-align:middle"><span style="display:block;width:${Math.round(Math.max(0, Math.min(1, v)) * 90)}px;height:8px;background:${color};border-radius:4px"></span></span>`;
    const dir = h.compass[Math.round(t.heading / 45) % 8];
    const eng = !t.engineOn ? bn.state.off : t.rpm < 0.97 ? h.spooling : bn.state.on;
    this.panel.innerHTML =
      `<div>${h.speed}: <b>${bnNum(t.kmh)}</b> ${h.kmh}${t.boost ? ` · <span style="color:#ff9a3c">${h.boost}</span>` : ''}</div>` +
      `<div>${h.altAgl}: <b>${bnNum(Math.max(0, t.agl))}</b> ${bn.units.meter} · ${h.altMsl}: ${bnNum(t.alt)} ${bn.units.meter}</div>` +
      `<div>${h.vs}: <b>${t.vz >= 0 ? '+' : ''}${bnNum(t.vz, 1)}</b> ${h.mps}</div>` +
      `<div>${h.rotor}: ${bar(t.rpm, '#5ad17a')} ${bnNum(t.rpm * 100)}%</div>` +
      `<div>${h.collective}: ${bar(t.collective, '#5aa9ff')} ${bnNum(t.collective * 100)}%</div>` +
      `<div>${h.heading}: <b>${bnNum(t.heading)}°</b> ${dir}</div>` +
      `<div>${h.engine}: <b>${eng}</b> · ${t.assist ? h.assist : `<span style="color:#ff6a6a">${h.manual}</span>`}</div>`;
  }

  private drawHorizon(t: HelicopterTelemetry): void {
    const c = this.hctx;
    const S = 150 * this.dpr;
    const R = S / 2;
    c.save();
    c.clearRect(0, 0, S, S);
    c.translate(R, R);
    c.beginPath();
    c.arc(0, 0, R - 2, 0, Math.PI * 2);
    c.clip();
    c.rotate(-t.roll);
    c.translate(0, -t.pitch * R * 2.2);
    c.fillStyle = '#4f8fd6';
    c.fillRect(-S, -S * 2, S * 2, S * 2);
    c.fillStyle = '#7a5a36';
    c.fillRect(-S, 0, S * 2, S * 2);
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * this.dpr;
    c.beginPath();
    c.moveTo(-S, 0);
    c.lineTo(S, 0);
    c.stroke();
    c.lineWidth = 1 * this.dpr;
    for (const a of [-0.35, -0.17, 0.17, 0.35]) {
      const y = -a * R * 2.2;
      c.beginPath();
      c.moveTo(-R * 0.22, y);
      c.lineTo(R * 0.22, y);
      c.stroke();
    }
    c.restore();
    // fixed aircraft symbol
    c.save();
    c.translate(R, R);
    c.strokeStyle = '#ffd21f';
    c.lineWidth = 3 * this.dpr;
    c.beginPath();
    c.moveTo(-R * 0.55, 0);
    c.lineTo(-R * 0.18, 0);
    c.lineTo(-R * 0.18, R * 0.1);
    c.moveTo(R * 0.55, 0);
    c.lineTo(R * 0.18, 0);
    c.lineTo(R * 0.18, R * 0.1);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 3 * this.dpr, 0, Math.PI * 2);
    c.fillStyle = '#ffd21f';
    c.fill();
    c.restore();
  }
}
