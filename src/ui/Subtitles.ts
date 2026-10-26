import { UI_FONT } from './theme';

/** বাংলা সাবটাইটেল: ভয়েস লাইন চলার সময় নিচে দেখায় (ভয়েস বন্ধ থাকলেও পড়া যায়)। */
export class Subtitles {
  private el = document.createElement('div');
  private timer = 0;

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '50%',
      bottom: '36px',
      transform: 'translateX(-50%)',
      maxWidth: 'min(900px, 90vw)',
      padding: '10px 18px',
      background: 'rgba(0,0,0,0.68)',
      color: '#fff',
      font: `500 20px/1.6 ${UI_FONT}`,
      textAlign: 'center',
      borderRadius: '8px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '20',
    });
    parent.appendChild(this.el);
  }

  /** `seconds` = how long to keep it on screen (null = until hide() is called). */
  show(text: string, seconds: number | null): void {
    window.clearTimeout(this.timer);
    this.el.textContent = text;
    this.el.style.display = 'block';
    if (seconds !== null) this.timer = window.setTimeout(() => this.hide(), seconds * 1000);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.style.display = 'none';
  }
}
