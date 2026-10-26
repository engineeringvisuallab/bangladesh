import { UI_FONT } from './theme';

/** Breath bar at the bottom of the screen: shows while the diver is under water or still catching breath. */
export class OxygenHUD {
  private el = document.createElement('div');
  private fill = document.createElement('div');
  private label = document.createElement('div');
  private shown = false;

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'absolute',
      left: '50%',
      bottom: '86px',
      transform: 'translateX(-50%)',
      width: 'min(300px, 60vw)',
      padding: '6px 10px 8px',
      borderRadius: '14px',
      background: 'rgba(3,22,34,0.62)',
      border: '1px solid rgba(160,230,245,0.45)',
      color: '#dff6ff',
      font: `600 13px/1.2 ${UI_FONT}`,
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      zIndex: '30',
    } satisfies Partial<CSSStyleDeclaration>);
    this.label.style.marginBottom = '5px';
    const track = document.createElement('div');
    Object.assign(track.style, { height: '9px', borderRadius: '6px', background: 'rgba(255,255,255,0.16)', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.fill.style, { height: '100%', width: '100%', borderRadius: '6px', transition: 'width 0.12s linear' } satisfies Partial<CSSStyleDeclaration>);
    track.appendChild(this.fill);
    this.el.append(this.label, track);
    parent.appendChild(this.el);
  }

  /** oxygen 0..1; show = under water or not full yet; unlimited = settings switch. */
  update(oxygen: number, show: boolean, unlimited: boolean): void {
    if (show !== this.shown) {
      this.shown = show;
      this.el.style.opacity = show ? '1' : '0';
    }
    if (!show) return;
    const o = Math.max(0, Math.min(1, oxygen));
    this.fill.style.width = `${Math.round(o * 100)}%`;
    this.fill.style.background = unlimited ? '#58d6ff' : o > 0.5 ? '#58d6ff' : o > 0.22 ? '#ffb84a' : '#ff4a4a';
    const secs = Math.ceil(o * 45);
    this.label.textContent = unlimited ? '🫧 অক্সিজেন: অসীম' : o <= 0 ? '⚠️ দম শেষ! ওপরে উঠুন (Space)' : `🫧 দম: ${secs} সে.`;
    this.el.style.borderColor = !unlimited && o < 0.22 ? 'rgba(255,90,90,0.8)' : 'rgba(160,230,245,0.45)';
  }

  dispose(): void {
    this.el.remove();
  }
}
