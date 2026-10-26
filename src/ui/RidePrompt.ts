import { UI_FONT } from './theme';

/** A pill at the bottom middle of the screen: "F - get on the train" / "next station ..." (hidden when the text is empty). Only touches the DOM when the text changes. */
export class RidePrompt {
  private el = document.createElement('div');
  private text = '';

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'fixed',
      bottom: '112px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '9px 20px',
      borderRadius: '999px',
      background: 'rgba(8,12,22,0.8)',
      color: '#eaf3ff',
      font: `600 16px/1.45 ${UI_FONT}`,
      pointerEvents: 'none',
      display: 'none',
      zIndex: '40',
      whiteSpace: 'pre',
      textAlign: 'center',
      border: '1px solid rgba(120,170,255,0.45)',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.el.textContent = text;
    this.el.style.display = text ? 'block' : 'none';
  }

  dispose(): void {
    this.el.remove();
  }
}
