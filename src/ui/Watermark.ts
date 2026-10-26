/**
 * EVCity watermark: the logo, small, in a screen corner at 50 % opacity. Never blocks the mouse and sits under the menus.
 * Change WATERMARK_OPACITY / WIDTH_PX / the corner below to adjust it.
 */
const WATERMARK_OPACITY = 0.5;
const WIDTH_PX = 150;

export class Watermark {
  private readonly el = document.createElement('img');

  constructor(parent: HTMLElement = document.body) {
    this.el.src = `${import.meta.env.BASE_URL}assets/evcity-logo.png`;
    this.el.alt = '';
    this.el.draggable = false;
    Object.assign(this.el.style, {
      position: 'fixed',
      right: '14px',
      bottom: '12px',
      width: `${WIDTH_PX}px`,
      height: 'auto',
      opacity: String(WATERMARK_OPACITY),
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '9',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
  }
}
