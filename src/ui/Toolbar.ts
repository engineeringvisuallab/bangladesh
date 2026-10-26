/**
 * The small button row in the top-left corner (Tour button, settings button). One shared element: every button just appends itself,
 * and `style.order` decides the place (tour = 0, settings = 1).
 */
let bar: HTMLElement | null = null;

export function getToolbar(parent: HTMLElement): HTMLElement {
  if (bar && bar.isConnected) return bar;
  bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    left: '14px',
    top: '14px',
    zIndex: '45',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(bar);
  return bar;
}
