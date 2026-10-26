import { UI_FONT } from './theme';
import { bn } from '../i18n';
import { getToolbar } from './Toolbar';

/** One engineering site the Tour menu offers. */
export interface TourSiteChoice {
  id: string;
  name: string;
  color: string;
  mark: string;
  category: string;
  stops: number;
}

/** Tour button (top-left) + the engineering-site picker. Picking a site starts that site's guided tour. */
export class TourUI {
  private button = document.createElement('button');
  private status = document.createElement('div');
  private overlay = document.createElement('div');
  private panel = document.createElement('div');
  private list = document.createElement('div');
  private title = document.createElement('div');
  private subtitle = document.createElement('div');
  private close = document.createElement('button');
  private statusTimer = 0;
  private touring = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' && this.isOpen) this.hideSites();
  };

  constructor(
    parent: HTMLElement,
    onButton: () => void,
    private readonly onChoose: (id: string) => void,
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .evc-tour-button:hover { filter:brightness(1.08); transform:translateY(-1px); }
      .evc-tour-choice:hover { background:rgba(255,210,31,.14)!important; border-color:#ffd21f!important; }
      .evc-tour-choice:focus-visible,.evc-tour-button:focus-visible { outline:3px solid #fff; outline-offset:3px; }
    `;
    document.head.appendChild(style);

    this.button.className = 'evc-tour-button';
    this.button.type = 'button';
    this.renderButton();
    Object.assign(this.button.style, {
      order: '0', height: '46px', border: '1px solid rgba(255,255,255,.48)',
      borderRadius: '12px', padding: '10px 16px', background: 'linear-gradient(135deg,#126b4b,#184735)', color: '#fff',
      font: `700 16px ${UI_FONT}`, boxShadow: '0 4px 16px rgba(0,0,0,.28)', cursor: 'pointer', pointerEvents: 'auto',
      transition: 'transform .15s ease,filter .15s ease',
    });
    this.button.addEventListener('click', onButton);

    Object.assign(this.status.style, {
      position: 'fixed', left: '14px', top: '70px', zIndex: '44', display: 'none', maxWidth: 'min(420px,85vw)',
      padding: '8px 12px', borderRadius: '10px', background: 'rgba(9,22,25,.88)', border: '1px solid rgba(255,255,255,.22)',
      color: '#fff', font: `500 14px/1.55 ${UI_FONT}`, boxShadow: '0 4px 16px rgba(0,0,0,.24)', pointerEvents: 'none',
    });

    Object.assign(this.overlay.style, {
      position: 'fixed', inset: '0', zIndex: '80', display: 'none', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'rgba(3,10,14,.74)', backdropFilter: 'blur(6px)', pointerEvents: 'auto',
    });
    Object.assign(this.panel.style, {
      width: 'min(640px,96vw)', maxHeight: 'min(78vh,760px)', overflow: 'auto', borderRadius: '20px',
      border: '1px solid rgba(255,255,255,.2)', background: 'linear-gradient(155deg,#172b30,#0b171b)',
      color: '#fff', padding: '24px', boxShadow: '0 24px 70px rgba(0,0,0,.5)', fontFamily: UI_FONT,
    });
    Object.assign(this.title.style, { fontSize: '24px', fontWeight: '800', marginBottom: '6px' });
    Object.assign(this.subtitle.style, { fontSize: '14px', color: 'rgba(255,255,255,.7)', lineHeight: '1.65', marginBottom: '18px' });
    this.list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;';
    this.close.type = 'button';
    this.close.textContent = bn.tour.close;
    Object.assign(this.close.style, {
      display: 'block', margin: '18px 0 0 auto', border: '1px solid rgba(255,255,255,.25)', borderRadius: '10px',
      padding: '9px 14px', background: 'rgba(255,255,255,.08)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
    });
    this.close.addEventListener('click', () => this.hideSites());
    this.panel.append(this.title, this.subtitle, this.list, this.close);
    this.overlay.appendChild(this.panel);
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hideSites();
    });
    getToolbar(parent).appendChild(this.button); // top-left row, next to the settings button
    parent.append(this.status, this.overlay);
    window.addEventListener('keydown', this.onKey);
    this.showStatus(bn.tour.startHint);
  }

  showStatus(text: string, seconds = 6): void {
    this.status.textContent = text;
    this.status.style.display = 'block';
    window.clearTimeout(this.statusTimer);
    if (seconds > 0) this.statusTimer = window.setTimeout(() => { this.status.style.display = 'none'; }, seconds * 1000);
  }

  hideStatus(): void {
    window.clearTimeout(this.statusTimer);
    this.status.style.display = 'none';
  }

  showSites(sites: TourSiteChoice[]): void {
    this.title.textContent = bn.tour.title;
    this.subtitle.textContent = bn.tour.hint;
    this.list.replaceChildren();
    for (const site of sites) {
      const choice = document.createElement('button');
      choice.className = 'evc-tour-choice';
      choice.type = 'button';
      choice.innerHTML = `<span class="evc-tour-mark" style="display:inline-block;min-width:26px;height:26px;line-height:26px;text-align:center;border-radius:13px;font-size:13px;font-weight:800;color:#0b171b;margin-bottom:8px"></span><span style="display:block;font-size:16px;font-weight:800;margin-bottom:5px"></span><span style="display:block;font-size:12px;line-height:1.45;color:rgba(255,255,255,.67)"></span>`;
      const spans = choice.querySelectorAll('span');
      spans[0].textContent = site.mark;
      (spans[0] as HTMLElement).style.background = site.color;
      spans[1].textContent = site.name;
      spans[2].textContent = `${bn.tour.categories[site.category] ?? site.category} · ${bn.tour.stops(site.stops)}`;
      Object.assign(choice.style, {
        textAlign: 'left', padding: '14px', minHeight: '96px', borderRadius: '12px', border: '1px solid rgba(255,255,255,.17)',
        background: 'rgba(255,255,255,.055)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
      });
      choice.addEventListener('click', () => {
        this.hideSites();
        this.onChoose(site.id);
      });
      this.list.appendChild(choice);
    }
    this.overlay.style.display = 'flex';
  }

  hideSites(): void {
    this.overlay.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.overlay.style.display === 'flex';
  }

  /** While a site tour runs the button stops it. */
  setTouring(touring: boolean): void {
    this.touring = touring;
    this.renderButton();
  }

  private renderButton(): void {
    this.button.textContent = this.touring ? `■ ${bn.tour.stop}` : `🧭 ${bn.tour.button}`;
  }

  dispose(): void {
    window.clearTimeout(this.statusTimer);
    window.removeEventListener('keydown', this.onKey);
    this.button.remove();
    this.status.remove();
    this.overlay.remove();
  }
}
