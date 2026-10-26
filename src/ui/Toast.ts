import { UI_FONT } from './theme';

/** A small message in the top middle of the screen that fades away by itself (used for "night mode on / off"). */
export class Toast {
  private el = document.createElement('div');
  private timer = 0;

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 18px',
      borderRadius: '999px',
      background: 'rgba(8,12,22,0.78)',
      color: '#eaf3ff',
      font: `500 15px/1.4 ${UI_FONT}`,
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.35s ease',
      zIndex: '40',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  show(text: string, ms = 2600): void {
    this.el.textContent = text;
    this.el.style.opacity = '1';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.el.style.opacity = '0'), ms);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.el.remove();
  }
}
