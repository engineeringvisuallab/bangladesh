import { UI_FONT } from './theme';
import { bn, bnDigits } from '../i18n';

const fmt = (n: number): string => bnDigits(Math.floor(n).toLocaleString('en-US'));

/** Gold purse chip (top centre) + a short message line under it (fines in red, income in green). */
export class GoldHUD {
  private chip = document.createElement('div');
  private amount = document.createElement('span');
  private toast = document.createElement('div');
  private timer = 0;

  constructor(parent: HTMLElement) {
    Object.assign(this.chip.style, {
      position: 'fixed', left: '50%', top: '14px', transform: 'translateX(-50%)', padding: '5px 14px',
      borderRadius: '16px', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,210,31,0.6)',
      color: '#ffd21f', font: `700 15px ${UI_FONT}`, pointerEvents: 'none', zIndex: '12', display: 'flex', gap: '8px', alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    this.chip.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#e0a800 70%);box-shadow:0 0 6px rgba(255,200,0,.8)"></span>';
    const unit = document.createElement('span');
    unit.textContent = bn.gold.unit;
    unit.style.cssText = 'font-weight:500;font-size:12px;opacity:.85';
    this.chip.append(this.amount, unit);
    Object.assign(this.toast.style, {
      position: 'fixed', left: '50%', top: '104px', transform: 'translateX(-50%)', padding: '6px 16px', borderRadius: '8px',
      font: `600 14px ${UI_FONT}`, color: '#fff', pointerEvents: 'none', zIndex: '12', display: 'none', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.append(this.chip, this.toast);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.chip.remove();
    this.toast.remove();
  }

  /** The balance chip at the top (the fine / income messages are always shown). */
  setChipVisible(on: boolean): void {
    this.chip.style.display = on ? 'flex' : 'none';
  }

  setBalance(n: number): void {
    this.amount.textContent = fmt(n);
  }

  /** kind: 'fine' (red) or 'income' (green) */
  say(text: string, kind: 'fine' | 'income'): void {
    this.toast.textContent = text;
    this.toast.style.background = kind === 'fine' ? 'rgba(190,30,30,0.9)' : 'rgba(25,130,60,0.9)';
    this.toast.style.display = 'block';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.toast.style.display = 'none'), kind === 'fine' ? 3500 : 2200);
  }
}
