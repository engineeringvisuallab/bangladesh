import { UI_FONT } from './theme';
import { bnDigits } from '../i18n';
import { Config } from '../core/Config';
import type { TimeMode } from '../environment/DayNight';
import type { HudOptions, HudSettings } from './HudSettings';
import { getToolbar } from './Toolbar';

/** What the menu needs from the game (it owns no game logic itself). */
export interface SettingsHooks {
  getTimeMode(): TimeMode;
  setTimeMode(mode: TimeMode): void;
  getMuted(): boolean;
  setMuted(muted: boolean): void;
  getMapZoom(): number;
  setMapZoom(zoom: number): void;
  getDebug(): boolean;
  setDebug(on: boolean): void;
  getGold(): number;
}

const CSS = `
.evs-gear { width:46px; height:46px; border-radius:12px; border:1px solid rgba(255,255,255,.48); background:linear-gradient(135deg,#2b3a55,#18222f);
  color:#fff; font-size:22px; line-height:1; cursor:pointer; pointer-events:auto; box-shadow:0 4px 16px rgba(0,0,0,.28); transition:transform .15s ease,filter .15s ease; order:1; }
.evs-gear:hover { filter:brightness(1.15); transform:translateY(-1px); }
.evs-gear:focus-visible, .evs-btn:focus-visible, .evs-switch:focus-visible, .evs-close:focus-visible { outline:3px solid #fff; outline-offset:3px; }
.evs-overlay { position:fixed; inset:0; z-index:90; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(3,10,14,.74);
  backdrop-filter:blur(6px); pointer-events:auto; font-family:${UI_FONT}; color:#fff; }
.evs-panel { width:min(640px,96vw); max-height:min(88vh,860px); overflow:auto; border-radius:20px; border:1px solid rgba(255,255,255,.2);
  background:linear-gradient(155deg,#172b30,#0b171b); padding:22px 24px 20px; box-shadow:0 24px 70px rgba(0,0,0,.5); }
.evs-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
.evs-title { font-size:24px; font-weight:800; }
.evs-close { border:1px solid rgba(255,255,255,.25); border-radius:10px; padding:7px 13px; background:rgba(255,255,255,.08); color:#fff; font:500 14px ${UI_FONT}; cursor:pointer; }
.evs-sub { font-size:13px; color:rgba(255,255,255,.62); margin-bottom:14px; }
.evs-sec { margin-top:16px; }
.evs-sec > h3 { margin:0 0 8px; font-size:15px; font-weight:700; color:#ffd21f; letter-spacing:.2px; }
.evs-modes { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.evs-btn { text-align:left; padding:12px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.17); background:rgba(255,255,255,.055); color:#fff;
  font:600 14px/1.35 ${UI_FONT}; cursor:pointer; }
.evs-btn:hover { background:rgba(255,210,31,.12); border-color:#ffd21f; }
.evs-btn.on { background:rgba(255,210,31,.2); border-color:#ffd21f; box-shadow:0 0 0 1px #ffd21f inset; }
.evs-btn small { display:block; margin-top:3px; font-weight:400; font-size:12px; color:rgba(255,255,255,.66); }
.evs-note { margin-top:8px; font-size:12px; line-height:1.55; color:rgba(255,255,255,.6); }
.evs-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:9px 2px; border-bottom:1px solid rgba(255,255,255,.08); }
.evs-row:last-child { border-bottom:0; }
.evs-row b { display:block; font-weight:600; font-size:14px; }
.evs-row span.d { display:block; font-size:12px; color:rgba(255,255,255,.58); margin-top:1px; }
.evs-switch { flex:0 0 auto; position:relative; width:48px; height:27px; border-radius:999px; border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.14); cursor:pointer; padding:0; transition:background .15s; }
.evs-switch::after { content:''; position:absolute; top:2px; left:2px; width:21px; height:21px; border-radius:50%; background:#fff; transition:transform .15s; }
.evs-switch.on { background:#1f9d62; border-color:#35c985; }
.evs-switch.on::after { transform:translateX(21px); }
.evs-zoom { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.evs-keys { display:grid; grid-template-columns:auto 1fr; gap:5px 14px; font-size:13px; line-height:1.5; }
.evs-keys kbd { font:600 12px ${UI_FONT}; padding:1px 8px; border-radius:6px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); white-space:nowrap; justify-self:start; }
.evs-keys span { color:rgba(255,255,255,.82); }
details.evs-help > summary { cursor:pointer; font-size:15px; font-weight:700; color:#ffd21f; margin-bottom:8px; }
.evs-gold { display:flex; justify-content:space-between; font-size:14px; padding:2px; color:#ffd21f; font-weight:700; }
@media (max-width:520px) { .evs-modes { grid-template-columns:1fr; } .evs-panel { padding:16px; } }
`;

const MODES: { id: TimeMode; icon: string; label: string; hint: string }[] = [
  { id: 'cycle', icon: '🔄', label: 'দিন-রাত চলবে', hint: `দিন ${bnDigits(String(Config.environment.dayNight.dayMinutes))} মিনিট, রাত ${bnDigits(String(Config.environment.dayNight.nightMinutes))} মিনিট` },
  { id: 'night', icon: '🌙', label: 'সবসময় রাত', hint: 'আকাশে চাঁদ-তারা, রাস্তায় বাতি জ্বলবে' },
  { id: 'day', icon: '☀️', label: 'সবসময় দিন', hint: 'রাত আসবে না, সবসময় দিনের আলো' },
];

const MODE_NOTE: Record<TimeMode, string> = {
  cycle: 'আকাশ ধীরে ধীরে বদলাবে: সকাল → দুপুর → সন্ধ্যা → রাত। সময় মিনিম্যাপের পাশে দেখা যায়।',
  night: 'এখন সবসময় রাত। ঘড়ি থেমে আছে (মধ্যরাত)। আবার “দিন-রাত চলবে” চাপলে আগের সময় থেকে চলবে।',
  day: 'এখন সবসময় দিন। ঘড়ি থেমে আছে। আবার “দিন-রাত চলবে” চাপলে আগের সময় থেকে চলবে।',
};

const ZOOMS = ['কাছে', 'মাঝারি', 'পুরো ম্যাপ'];

interface Toggle {
  key: keyof Pick<HudOptions, 'crosshair' | 'gold' | 'weapon' | 'areaAlways'>;
  label: string;
  desc: string;
}
const TOGGLES: Toggle[] = [
  { key: 'crosshair', label: 'ক্রসহেয়ার (মাঝের বিন্দু)', desc: 'নিশানা ও গুলি লাগার চিহ্ন' },
  { key: 'gold', label: 'গোল্ড ব্যালান্স', desc: 'জরিমানা/আয়ের বার্তা এমনিতেই দেখা যাবে' },
  { key: 'weapon', label: 'অস্ত্র, গুলি ও ওয়ান্টেড স্টার', desc: 'বন্ধ থাকলেও স্টার বাড়লে-কমলে কয়েক সেকেন্ড দেখা যায়' },
  { key: 'areaAlways', label: 'এলাকার নাম সবসময় দেখাও', desc: 'বন্ধ থাকলে নতুন এলাকায় ঢুকলে কিছুক্ষণ দেখায়' },
];

const KEYS: [string, string][] = [
  ['W A S D / তীর', 'হাঁটা, গাড়ি-নৌকা-হেলিকপ্টার চালানো'],
  ['Shift · Space', 'দৌড় · লাফ (হেলিকপ্টারে ওপরে ওঠা)'],
  ['মাউস', 'চারদিকে দেখা (ক্লিক করলে মাউস ধরা পড়ে, Esc এ ছাড়ে)'],
  ['F', 'যানবাহনে ওঠা / নামা'],
  ['N', 'গাড়ি বা হেলিকপ্টার ডাকা'],
  ['P', 'গাড়ির চালকের চোখে দেখা'],
  ['E · Q · G · I', 'গিয়ার বাড়ানো · কমানো · অটো/ম্যানুয়াল · ইঞ্জিন কার্ভ'],
  ['R', 'গাড়ি সোজা করা / অস্ত্র রিলোড'],
  ['H · X · Z · C', 'হেলিকপ্টার: ইঞ্জিন · অ্যাসিস্ট · বোমা · নামা'],
  ['B', 'অস্ত্র বাছাই (বাম মাউস গুলি, ডান মাউস নিশানা, Q পরের অস্ত্র)'],
  ['Y  (, .)', 'SWTP / STP ট্যুর চালু (আগের / পরের ধাপ)'],
  ['J · K · L · ;', 'বিমানবন্দর · এগ্রো ইনস্টিটিউট · সাফারি পার্ক · সেনা ক্যাম্পে যাওয়া'],
  ['V · T', 'ফ্রি ক্যামেরা · ক্যামেরার জায়গায় নেমে পড়া'],
  ['C · Space (পানিতে)', 'ডুব দেওয়া · ওপরে ওঠা (W + ক্যামেরা নিচে দিলেও ডুবে যায়)'],
  ['U · M', 'মিনিম্যাপ জুম · শব্দ বন্ধ/চালু'],
  ['\\', 'দিন-রাত মোড বদল (চক্র → রাত → দিন)'],
  ['Tab', 'এই সেটিংস মেনু খোলা / বন্ধ'],
  ['F3', 'ডিবাগ প্যানেল'],
];

/**
 * Settings menu: a gear button next to the Tour button (and the Tab key) opens it.
 * Day / night mode, what is shown on the screen, sound, minimap zoom, the keyboard help.
 * It holds no game logic: every change goes through `SettingsHooks` / `HudSettings`.
 */
export class SettingsMenu {
  private gear = document.createElement('button');
  private overlay = document.createElement('div');
  private modeButtons = new Map<TimeMode, HTMLButtonElement>();
  private modeNote = document.createElement('div');
  private switches = new Map<string, HTMLButtonElement>();
  private zoomButtons: HTMLButtonElement[] = [];
  private waterButtons: HTMLButtonElement[] = [];
  private goldValue = document.createElement('span');
  private open_ = false;
  private relock = false;
  private style = document.createElement('style');

  constructor(
    parent: HTMLElement,
    private hooks: SettingsHooks,
    private store: HudSettings,
    private lockTarget: HTMLElement,
  ) {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.gear.className = 'evs-gear';
    this.gear.type = 'button';
    this.gear.textContent = '⚙️';
    this.gear.title = 'সেটিংস (Tab)';
    this.gear.setAttribute('aria-label', 'সেটিংস');
    this.gear.addEventListener('click', () => this.toggle());
    getToolbar(parent).appendChild(this.gear);

    this.overlay.className = 'evs-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.appendChild(this.buildPanel());
    parent.appendChild(this.overlay);
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.open_;
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    this.relock = !!document.pointerLockElement; // the mouse is needed for the buttons: give it back when the menu closes
    if (document.pointerLockElement) document.exitPointerLock();
    this.refresh();
    this.overlay.style.display = 'flex';
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.style.display = 'none';
    if (this.relock) {
      try {
        const r = (this.lockTarget as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch {
        /* the browser refuses right after Esc: a click on the screen takes the mouse again */
      }
    }
    this.relock = false;
  }

  /** Re-read every setting from the game (call after a key changed something while the menu is open). */
  refresh(): void {
    const mode = this.hooks.getTimeMode();
    for (const [id, b] of this.modeButtons) b.classList.toggle('on', id === mode);
    this.modeNote.textContent = MODE_NOTE[mode];
    const v = this.store.values;
    for (const t of TOGGLES) this.setSwitch(t.key, v[t.key]);
    this.setSwitch('sound', !this.hooks.getMuted());
    this.setSwitch('oxygen', v.infiniteOxygen);
    this.waterButtons.forEach((b, i) => b.classList.toggle('on', i === v.waterQuality));
    this.setSwitch('debug', this.hooks.getDebug());
    const z = this.hooks.getMapZoom();
    this.zoomButtons.forEach((b, i) => b.classList.toggle('on', i === z));
    this.goldValue.textContent = `${bnDigits(Math.floor(this.hooks.getGold()).toLocaleString('en-US'))} গোল্ড`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.gear.remove();
    this.overlay.remove();
    this.style.remove();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.open_) return;
    if (e.code === 'Tab') e.preventDefault(); // the Engine closes the menu on Tab; do not move the focus meanwhile
    else if (e.code === 'Escape') this.close();
  };

  private setSwitch(id: string, on: boolean): void {
    const s = this.switches.get(id);
    if (!s) return;
    s.classList.toggle('on', on);
    s.setAttribute('aria-checked', String(on));
  }

  private makeSwitch(id: string, onToggle: () => void): HTMLButtonElement {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'evs-switch';
    s.setAttribute('role', 'switch');
    s.addEventListener('click', () => {
      onToggle();
      this.refresh();
    });
    this.switches.set(id, s);
    return s;
  }

  private row(label: string, desc: string, control: HTMLElement): HTMLElement {
    const r = document.createElement('div');
    r.className = 'evs-row';
    const t = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = label;
    t.appendChild(b);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = desc;
      t.appendChild(d);
    }
    r.append(t, control);
    return r;
  }

  private section(title: string): { sec: HTMLElement; body: HTMLElement } {
    const sec = document.createElement('div');
    sec.className = 'evs-sec';
    const h = document.createElement('h3');
    h.textContent = title;
    sec.appendChild(h);
    return { sec, body: sec };
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'evs-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'সেটিংস');

    const head = document.createElement('div');
    head.className = 'evs-head';
    const title = document.createElement('div');
    title.className = 'evs-title';
    title.textContent = '⚙️ সেটিংস';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'evs-close';
    close.textContent = 'বন্ধ করুন (Tab)';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    const sub = document.createElement('div');
    sub.className = 'evs-sub';
    sub.textContent = 'যেকোনো সময় বদলাতে পারবেন — পছন্দগুলো ব্রাউজারে মনে থাকে।';
    panel.append(head, sub);

    // --- day / night ---
    {
      const { sec } = this.section('🌗 দিন-রাত');
      const grid = document.createElement('div');
      grid.className = 'evs-modes';
      for (const m of MODES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'evs-btn';
        b.innerHTML = '<span></span><small></small>';
        (b.children[0] as HTMLElement).textContent = `${m.icon} ${m.label}`;
        (b.children[1] as HTMLElement).textContent = m.hint;
        b.addEventListener('click', () => {
          this.hooks.setTimeMode(m.id);
          this.refresh();
        });
        this.modeButtons.set(m.id, b);
        grid.appendChild(b);
      }
      this.modeNote.className = 'evs-note';
      sec.append(grid, this.modeNote);
      panel.appendChild(sec);
    }

    // --- screen ---
    {
      const { sec } = this.section('🖥️ স্ক্রিনে কী দেখাবে');
      for (const t of TOGGLES) {
        sec.appendChild(this.row(t.label, t.desc, this.makeSwitch(t.key, () => this.store.set(t.key, !this.store.values[t.key]))));
      }
      sec.appendChild(this.row('FPS ও ডিবাগ তথ্য', 'উন্নয়নকারীদের জন্য (F3)', this.makeSwitch('debug', () => this.hooks.setDebug(!this.hooks.getDebug()))));
      const gold = document.createElement('div');
      gold.className = 'evs-gold';
      const gl = document.createElement('span');
      gl.textContent = '🪙 আপনার গোল্ড';
      gold.append(gl, this.goldValue);
      sec.appendChild(gold);
      panel.appendChild(sec);
    }

    // --- water ---
    {
      const { sec } = this.section('🌊 পানি ও ডুব');
      const grid = document.createElement('div');
      grid.className = 'evs-zoom';
      ['নিচু', 'মাঝারি', 'উঁচু'].forEach((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'evs-btn';
        b.innerHTML = '<span></span><small></small>';
        (b.children[0] as HTMLElement).textContent = label;
        (b.children[1] as HTMLElement).textContent = ['কম ঢেউ, কম প্রাণী', 'ঢেউ, প্রবাল, মাছ', 'সব ঢেউ, আলোর রশ্মি, প্রচুর প্রাণী'][i];
        b.addEventListener('click', () => {
          this.store.set('waterQuality', i);
          this.refresh();
        });
        this.waterButtons.push(b);
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      sec.appendChild(this.row('অসীম অক্সিজেন', 'ডুব দিলে দম ফুরাবে না (বন্ধ থাকলে প্রায় ৪৫ সেকেন্ড দম থাকে)', this.makeSwitch('oxygen', () => this.store.set('infiniteOxygen', !this.store.values.infiniteOxygen))));
      const note = document.createElement('div');
      note.className = 'evs-note';
      note.textContent = 'পানিতে নামলে C চেপে বা ক্যামেরা নিচের দিকে করে W চেপে ডুব দিন। Space চেপে ওপরে উঠুন।';
      sec.appendChild(note);
      panel.appendChild(sec);
    }

    // --- sound ---
    {
      const { sec } = this.section('🔊 শব্দ');
      sec.appendChild(this.row('শব্দ ও ভয়েস', 'বন্ধ করলে সব শব্দ ও ঘোষণা থামে (M)', this.makeSwitch('sound', () => this.hooks.setMuted(!this.hooks.getMuted()))));
      panel.appendChild(sec);
    }

    // --- minimap ---
    {
      const { sec } = this.section('🗺️ মিনিম্যাপ জুম (U)');
      const grid = document.createElement('div');
      grid.className = 'evs-zoom';
      ZOOMS.forEach((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'evs-btn';
        b.textContent = label;
        b.addEventListener('click', () => {
          this.hooks.setMapZoom(i);
          this.refresh();
        });
        this.zoomButtons.push(b);
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      panel.appendChild(sec);
    }

    // --- keyboard help ---
    {
      const sec = document.createElement('div');
      sec.className = 'evs-sec';
      const d = document.createElement('details');
      d.className = 'evs-help';
      const s = document.createElement('summary');
      s.textContent = '⌨️ কী-বোর্ড নির্দেশিকা';
      const grid = document.createElement('div');
      grid.className = 'evs-keys';
      for (const [k, text] of KEYS) {
        const kb = document.createElement('kbd');
        kb.textContent = k;
        const sp = document.createElement('span');
        sp.textContent = text;
        grid.append(kb, sp);
      }
      d.append(s, grid);
      sec.appendChild(d);
      panel.appendChild(sec);
    }
    return panel;
  }
}
