import { UI_FONT } from './theme';
import { bn } from '../i18n';

export interface VehicleMenuItem {
  id: string;
  label: string;
  icon: string;
}

/** Keys that pick an entry while the menu is open (1..9, then 0 and the minus key). */
const PICK_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
const PICK_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

/**
 * "N" menu: every vehicle in the game as a button. Pick one (click or number key) and `onChoose(id)` brings it to the player.
 * `onChoose` returns null when it worked (the menu closes) or a Bangla message when it could not (the menu stays open and shows it).
 * The UI owns no game logic.
 */
export class VehicleMenu {
  private overlay = document.createElement('div');
  private panel = document.createElement('div');
  private grid = document.createElement('div');
  private note = document.createElement('div');
  private style = document.createElement('style');

  constructor(
    parent: HTMLElement,
    private items: VehicleMenuItem[],
    private onChoose: (id: string) => string | null,
    /** The canvas: pointer lock is requested again on it after a pick, so the game goes on without an extra click. */
    private lockTarget?: HTMLElement,
    /** While this returns true the N key is left to the game (the Suprim uses N for flight mode). */
    private blocked: () => boolean = () => false,
  ) {
    this.style.textContent = `
      .evc-vm-choice:hover { background:rgba(255,210,31,.14)!important; border-color:#ffd21f!important; }
      .evc-vm-choice:focus-visible,.evc-vm-close:focus-visible { outline:3px solid #fff; outline-offset:3px; }
    `;
    document.head.appendChild(this.style);

    Object.assign(this.overlay.style, {
      position: 'fixed', inset: '0', zIndex: '85', display: 'none', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'rgba(3,10,14,.74)', backdropFilter: 'blur(6px)', pointerEvents: 'auto',
    });
    Object.assign(this.panel.style, {
      width: 'min(640px,96vw)', maxHeight: 'min(82vh,780px)', overflow: 'auto', borderRadius: '20px',
      border: '1px solid rgba(255,255,255,.2)', background: 'linear-gradient(155deg,#172b30,#0b171b)',
      color: '#fff', padding: '24px', boxShadow: '0 24px 70px rgba(0,0,0,.5)', fontFamily: UI_FONT,
    });
    const title = document.createElement('div');
    title.textContent = `🚗 ${bn.vehicleMenu.title}`;
    Object.assign(title.style, { fontSize: '24px', fontWeight: '800', marginBottom: '6px' });
    const sub = document.createElement('div');
    sub.textContent = bn.vehicleMenu.hint;
    Object.assign(sub.style, { fontSize: '14px', color: 'rgba(255,255,255,.7)', lineHeight: '1.65', marginBottom: '16px' });
    this.grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;';
    Object.assign(this.note.style, { display: 'none', marginTop: '14px', padding: '9px 12px', borderRadius: '10px', background: 'rgba(220,60,60,.2)', border: '1px solid rgba(255,120,120,.5)', fontSize: '14px', lineHeight: '1.55' });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'evc-vm-close';
    close.textContent = bn.vehicleMenu.close;
    Object.assign(close.style, {
      display: 'block', margin: '18px 0 0 auto', border: '1px solid rgba(255,255,255,.25)', borderRadius: '10px',
      padding: '9px 14px', background: 'rgba(255,255,255,.08)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
    });
    close.addEventListener('click', () => this.close());

    items.forEach((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'evc-vm-choice';
      b.innerHTML = '<span style="display:block;font-size:28px;line-height:1.2"></span><span style="display:block;font-size:15px;font-weight:700;margin-top:4px"></span><span style="display:block;font-size:12px;color:rgba(255,255,255,.55);margin-top:3px"></span>';
      const sp = b.querySelectorAll('span');
      sp[0].textContent = item.icon;
      sp[1].textContent = item.label;
      sp[2].textContent = i < PICK_LABELS.length ? `[${PICK_LABELS[i]}]` : '';
      Object.assign(b.style, {
        textAlign: 'left', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,.17)',
        background: 'rgba(255,255,255,.055)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
      });
      b.addEventListener('click', () => this.pick(item.id));
      this.grid.appendChild(b);
    });

    this.panel.append(title, sub, this.grid, this.note, close);
    this.overlay.appendChild(this.panel);
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    parent.appendChild(this.overlay);
    // capture phase: while the menu is open the game must not see the digit keys (weapon switch) or Escape
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean {
    return this.overlay.style.display === 'flex';
  }

  open(): void {
    this.note.style.display = 'none';
    this.overlay.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock(); // the mouse is needed for the buttons
  }

  close(relock = false): void {
    this.overlay.style.display = 'none';
    if (relock) this.relock();
  }

  private relock(): void {
    try {
      const p = (this.lockTarget as (HTMLElement & { requestPointerLock(): Promise<void> | void }) | undefined)?.requestPointerLock();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
    } catch {
      /* the browser refused (e.g. the lock was just released): the first click on the game locks it again */
    }
  }

  private pick(id: string): void {
    const err = this.onChoose(id);
    if (err) {
      this.note.textContent = err;
      this.note.style.display = 'block';
      return;
    }
    this.close(true);
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyN') {
      if (this.blocked() && !this.isOpen) return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.isOpen) this.close(true);
      else this.open();
      return;
    }
    if (!this.isOpen) return;
    if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      this.close();
      return;
    }
    const i = PICK_KEYS.indexOf(e.code);
    if (i >= 0 && i < this.items.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.pick(this.items[i].id);
    }
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.overlay.remove();
    this.style.remove();
  }
}
