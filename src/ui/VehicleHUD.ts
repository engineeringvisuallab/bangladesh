import { bn, bnNum } from '../i18n';
import { lerpCurve } from '../vehicles/Powertrain';
import type { VehicleSpec } from '../vehicles/VehicleSpec';
import type { VehicleTelemetry } from '../vehicles/Vehicle';
import { UI_FONT } from './theme';

const toBn = (s: string) => s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

/**
 * Driving HUD (all Bangla): speedometer + RPM gauge + gear + pedals,
 * and (I key) a live engine curve showing torque and power with the current operating point.
 * The curve panel is the "engineering lesson": it shows what the engine, gearbox and wheels are doing right now.
 */
export class VehicleHUD {
  private root = document.createElement('div');
  private gauge = document.createElement('canvas');
  private curve = document.createElement('canvas');
  private gctx: CanvasRenderingContext2D;
  private cctx: CanvasRenderingContext2D;
  private visible = false;
  private curveOn = false; // the engine-curve panel is on request only (I key)
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(parent: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '14px',
      bottom: '14px',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '8px',
      pointerEvents: 'none',
      zIndex: '11',
    });
    const size = (c: HTMLCanvasElement, w: number, h: number) => {
      c.width = w * this.dpr;
      c.height = h * this.dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    };
    size(this.gauge, 260, 200);
    size(this.curve, 330, 214);
    this.curve.style.display = 'none';
    this.root.append(this.curve, this.gauge);
    parent.appendChild(this.root);
    // On small screens the panels would not fit: scale the whole HUD down (anchored at the bottom-right corner).
    const fit = () => {
      const k = Math.min(1, window.innerHeight / 760);
      this.root.style.transformOrigin = 'bottom right';
      this.root.style.transform = k < 1 ? `scale(${k})` : '';
    };
    fit();
    window.addEventListener('resize', fit);
    this.gctx = this.gauge.getContext('2d')!;
    this.cctx = this.curve.getContext('2d')!;
    this.gctx.scale(this.dpr, this.dpr);
    this.cctx.scale(this.dpr, this.dpr);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';
  }
  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }
  toggleCurve(): void {
    this.curveOn = !this.curveOn;
    this.curve.style.display = this.curveOn ? 'block' : 'none';
  }

  update(t: VehicleTelemetry, spec: VehicleSpec): void {
    if (!this.visible) return;
    this.drawGauge(t, spec);
    if (this.curveOn) this.drawCurve(t, spec);
  }

  private drawGauge(t: VehicleTelemetry, spec: VehicleSpec): void {
    const c = this.gctx;
    const W = 260;
    const H = 200;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.beginPath();
    c.roundRect(0, 0, W, H, 12);
    c.fill();

    const cx = 105;
    const cy = 96;
    const R = 78;
    const maxRpm = Math.ceil(t.redline / 1000) * 1000 + (t.redline % 1000 === 0 ? 0 : 0);
    const a0 = (135 * Math.PI) / 180;
    const sweep = (270 * Math.PI) / 180;
    const ang = (rpm: number) => a0 + (Math.min(rpm, maxRpm) / maxRpm) * sweep;

    c.lineWidth = 9;
    c.lineCap = 'butt';
    c.strokeStyle = '#2d3a4d';
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + sweep);
    c.stroke();
    c.strokeStyle = '#d33';
    c.beginPath();
    c.arc(cx, cy, R, ang(t.redline * 0.92), ang(maxRpm));
    c.stroke();
    c.strokeStyle = '#4ec3ff';
    c.beginPath();
    c.arc(cx, cy, R, a0, ang(t.rpm));
    c.stroke();

    c.fillStyle = '#cfe0f5';
    c.font = `500 12px ${UI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k <= maxRpm / 1000; k++) {
      const a = ang(k * 1000);
      c.fillText(toBn(String(k)), cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18));
    }

    // speed (centre), unit below it
    c.fillStyle = '#fff';
    c.font = `700 38px ${UI_FONT}`;
    c.fillText(bnNum(t.kmh), cx, cy - 8);
    c.font = `400 12px ${UI_FONT}`;
    c.fillStyle = '#9fb6d3';
    c.fillText(bn.vehicle.kmh, cx, cy + 18);

    // rpm unit: top-left corner
    c.textAlign = 'left';
    c.font = `400 11px ${UI_FONT}`;
    c.fillText(bn.vehicle.rpmUnit, 10, 16);
    c.textAlign = 'center';

    // gear: in the open gap at the bottom of the dial
    const g = t.gear;
    const gearTxt = g === 0 ? bn.vehicle.gearN : g < 0 ? bn.vehicle.gearR : bnNum(g);
    c.fillStyle = t.shifting ? '#ffd479' : '#fff';
    c.font = `700 ${g > 0 ? 26 : 15}px ${UI_FONT}`;
    c.fillText(gearTxt, cx, cy + 50);
    c.font = `400 11px ${UI_FONT}`;
    c.fillStyle = '#9fb6d3';
    c.fillText(`${bn.vehicle.gear} · ${t.auto ? bn.vehicle.auto : bn.vehicle.manual}`, cx, cy + 72);

    // pedals
    const bar = (x: number, v: number, col: string) => {
      c.fillStyle = '#2d3a4d';
      c.fillRect(x, 24, 12, 120);
      c.fillStyle = col;
      c.fillRect(x, 24 + 120 * (1 - v), 12, 120 * v);
    };
    bar(206, t.throttle, '#4ee08a');
    bar(228, t.brake, '#ff5a4a');
    if (t.handbrake) {
      c.fillStyle = '#ff5a4a';
      c.font = `600 12px ${UI_FONT}`;
      c.textAlign = 'center';
      c.fillText(bn.vehicle.handbrake, 218, 166);
    }
    void spec;
  }

  private drawCurve(t: VehicleTelemetry, spec: VehicleSpec): void {
    const c = this.cctx;
    const W = 330;
    const H = 214;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.beginPath();
    c.roundRect(0, 0, W, H, 12);
    c.fill();

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#e8f0ff';
    c.font = `600 13px ${UI_FONT}`;
    c.fillText(bn.vehicle.curveTitle, 12, 20);

    const px = 36;
    const py = 30;
    const pw = W - px - 14;
    const ph = 105;
    const maxRpm = Math.ceil(spec.engine.redlineRpm / 1000) * 1000;
    const curve = spec.engine.torque;
    const maxT = Math.max(...curve.map((p) => p[1])) * 1.1;
    const power = (rpm: number) => (lerpCurve(curve, rpm) * rpm * 2 * Math.PI) / 60 / 1000;
    const maxP = Math.max(...Array.from({ length: 70 }, (_, i) => power((i / 69) * maxRpm))) * 1.1;
    const X = (rpm: number) => px + (rpm / maxRpm) * pw;
    const YT = (v: number) => py + ph - (v / maxT) * ph;
    const YP = (v: number) => py + ph - (v / maxP) * ph;

    c.strokeStyle = '#3a4a60';
    c.lineWidth = 1;
    c.strokeRect(px, py, pw, ph);
    c.fillStyle = '#9fb6d3';
    c.font = `400 10px ${UI_FONT}`;
    c.textAlign = 'center';
    for (let k = 0; k <= maxRpm / 1000; k++) c.fillText(toBn(String(k)), X(k * 1000), py + ph + 12);
    c.fillText(bn.vehicle.rpmUnit, px + pw / 2, py + ph + 24);

    // redline
    c.strokeStyle = '#d33';
    c.beginPath();
    c.moveTo(X(spec.engine.redlineRpm), py);
    c.lineTo(X(spec.engine.redlineRpm), py + ph);
    c.stroke();

    const draw = (f: (r: number) => number, Y: (v: number) => number, col: string) => {
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const r = spec.engine.idleRpm + (i / 60) * (spec.engine.redlineRpm - spec.engine.idleRpm);
        const x = X(r);
        const y = Y(f(r));
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    };
    draw((r) => lerpCurve(curve, r), YT, '#ff9f3a');
    draw(power, YP, '#4ec3ff');

    // current operating point
    const rpm = Math.min(t.rpm, maxRpm);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(X(rpm), py);
    c.lineTo(X(rpm), py + ph);
    c.stroke();
    const dot = (y: number, col: string) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(X(rpm), y, 4.5, 0, Math.PI * 2);
      c.fill();
    };
    dot(YT(Math.max(0, lerpCurve(curve, rpm) * Math.max(t.throttle, 0.02))), '#ff9f3a');
    dot(YP(Math.max(0, t.powerKw)), '#4ec3ff');

    // live numbers
    c.textAlign = 'left';
    c.font = `500 12px ${UI_FONT}`;
    c.fillStyle = '#ff9f3a';
    c.fillText(`${bn.vehicle.torque}: ${bnNum(Math.max(0, t.torque))} ${bn.vehicle.nm}`, 12, 172);
    c.fillStyle = '#4ec3ff';
    c.fillText(`${bn.vehicle.power}: ${bnNum(Math.max(0, t.powerKw))} ${bn.vehicle.kw}`, 175, 172);
    c.fillStyle = '#cfe0f5';
    c.font = `400 11px ${UI_FONT}`;
    const ratio = t.gear > 0 ? spec.gears[t.gear - 1] : t.gear < 0 ? spec.reverse : 0;
    c.fillText(`${bn.vehicle.ratio}: ${bnNum(ratio, 2)} × ${bnNum(spec.finalDrive, 2)} = ${bnNum(ratio * spec.finalDrive, 1)}`, 12, 190);
    c.fillText(`${bn.vehicle.wheelForce}: ${bnNum(Math.abs(t.wheelForce))} ${bn.vehicle.newton}`, 12, 207);
  }
}
