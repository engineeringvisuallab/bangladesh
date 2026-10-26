import type { Bus } from '../core/EventBus';

/** The arrow keys work like W A S D everywhere (walking, cars, boats, helicopters, free camera). */
const ARROW_ALIAS: Record<string, string> = { KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyA: 'ArrowLeft', KeyD: 'ArrowRight' };

const BLOCKED_WHEN_LOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Digit1', 'Digit2']);

/** Keyboard + mouse (pointer lock). Other modules poll it; nobody else touches DOM events. */
export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private _locked = false;
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();
  readonly touchEnabled = (typeof window !== 'undefined') && (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1100));
  private touchLookId: number | null = null;
  private touchLastX = 0;
  private touchLastY = 0;
  private touchControls: HTMLElement | null = null;

  constructor(
    private target: HTMLElement,
    private bus: Bus,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
    target.addEventListener('click', this.onClick);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    if (this.touchEnabled) {
      target.style.touchAction = 'none';
      target.addEventListener('pointerdown', this.onTouchLookStart);
      target.addEventListener('pointermove', this.onTouchLookMove);
      target.addEventListener('pointerup', this.onTouchLookEnd);
      target.addEventListener('pointercancel', this.onTouchLookEnd);
      this.createTouchControls();
    }
  }

  get locked(): boolean {
    return this._locked;
  }

  /** Desktop requires pointer lock; touch devices use visible on-screen controls instead. */
  get gameplayActive(): boolean { return this._locked || this.touchEnabled; }

  /** Virtual keys are used by mobile buttons and map to the exact same gameplay code as a keyboard. */
  setVirtualKey(code: string, active: boolean): void {
    if (active) {
      if (!this.virtualDown.has(code)) this.virtualPressed.add(code);
      this.virtualDown.add(code);
    } else this.virtualDown.delete(code);
  }

  isDown(code: string): boolean {
    const alt = ARROW_ALIAS[code];
    return this.down.has(code) || this.virtualDown.has(code) || (alt !== undefined && this.down.has(alt));
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    const alt = ARROW_ALIAS[code];
    return this.pressed.has(code) || this.virtualPressed.has(code) || (alt !== undefined && this.pressed.has(alt));
  }

  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.virtualPressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.target.removeEventListener('click', this.onClick);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('pointerdown', this.onTouchLookStart);
    this.target.removeEventListener('pointermove', this.onTouchLookMove);
    this.target.removeEventListener('pointerup', this.onTouchLookEnd);
    this.target.removeEventListener('pointercancel', this.onTouchLookEnd);
    this.touchControls?.remove();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (this._locked && BLOCKED_WHEN_LOCKED.has(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private onBlur = (): void => {
    this.down.clear();
    this.virtualDown.clear();
    this.virtualPressed.clear();
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this._locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  /** Mouse buttons are keys too: 'Mouse0' = left, 'Mouse2' = right (only counted while the mouse is captured). */
  private onMouseDown = (e: MouseEvent): void => {
    if (!this._locked) return;
    const c = `Mouse${e.button}`;
    this.pressed.add(c);
    this.down.add(c);
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.down.delete(`Mouse${e.button}`);
  };
  private onContextMenu = (e: Event): void => {
    if (this._locked) e.preventDefault();
  };
  private onWheel = (e: WheelEvent): void => {
    if (this._locked) this.wheelDelta += e.deltaY;
  };
  private onClick = (): void => {
    if (!this._locked && !this.touchEnabled) this.target.requestPointerLock();
  };
  private createTouchControls(): void {
    const compact = window.innerWidth < 430;
    const parent = this.target.parentElement ?? document.body;
    const root = document.createElement('div');
    root.setAttribute('aria-label', 'মোবাইল গেম কন্ট্রোল');
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '900', pointerEvents: 'none', fontFamily: 'system-ui,sans-serif', userSelect: 'none' });
    const makeButton = (label: string, code: string, x: string, y: string, width = '50px'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      Object.assign(b.style, { position: 'absolute', left: x, top: y, width, height: compact ? '38px' : '46px', borderRadius: '13px',
        border: '1px solid rgba(255,255,255,.45)', background: 'rgba(8,18,25,.48)', color: '#fff',
        font: '800 12px system-ui,sans-serif', textShadow: '0 1px 3px #000', boxShadow: '0 2px 8px rgba(0,0,0,.25)',
        pointerEvents: 'auto', touchAction: 'none', backdropFilter: 'blur(4px)' });
      const down = (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); this.setVirtualKey(code, true); b.style.background = 'rgba(25,130,100,.82)'; };
      const up = (e: PointerEvent) => { e.preventDefault(); this.setVirtualKey(code, false); b.style.background = 'rgba(8,18,25,.48)'; };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      root.appendChild(b);
      return b;
    };
    // Four-direction driving / walking pad.
    const left = document.createElement('div');
    Object.assign(left.style, { position: 'absolute', left: '8px', bottom: '10px', width: compact ? '130px' : '156px', height: compact ? '116px' : '142px', pointerEvents: 'none' });
    root.appendChild(left);
    const place = (label: string, code: string, l: string, t: string, w = '48px') => {
      const b = makeButton(label, code, l, t, w); left.appendChild(b); return b;
    };
    place('▲ W', 'KeyW', compact ? '42px' : '54px', '0', compact ? '42px' : '48px');
    place('◀ A', 'KeyA', '0', compact ? '40px' : '48px', compact ? '42px' : '48px');
    place('▼ S', 'KeyS', compact ? '42px' : '54px', compact ? '40px' : '48px', compact ? '42px' : '48px');
    place('D ▶', 'KeyD', compact ? '84px' : '108px', compact ? '40px' : '48px', compact ? '42px' : '48px');
    place('SHIFT', 'ShiftLeft', compact ? '42px' : '54px', compact ? '80px' : '96px', compact ? '42px' : '48px');
    // Action pad on the right. Buttons are compact and translucent to preserve the view.
    const right = document.createElement('div');
    Object.assign(right.style, { position: 'absolute', right: '8px', bottom: '10px', width: compact ? '136px' : '164px', height: compact ? '210px' : '238px', pointerEvents: 'none' });
    root.appendChild(right);
    const act = (label: string, code: string, l: string, t: string, w = (compact ? '64px' : '76px')) => {
      const b = makeButton(label, code, l, t, w); right.appendChild(b); return b;
    };
    const x2 = compact ? '70px' : '84px'; const rightW = compact ? '64px' : '78px'; const row = compact ? 42 : 50;
    act('F · USE', 'KeyF', '0', '0'); act('JUMP / UP', 'Space', x2, '0', rightW);
    act('FIRE', 'Mouse0', '0', `${row}px`); act('AIM', 'Mouse2', x2, `${row}px`, rightW);
    act('TOOLS · B', 'KeyB', '0', `${row * 2}px`); act('DOWN · C', 'KeyC', x2, `${row * 2}px`, rightW);
    act('YAW ◀ Q', 'KeyQ', '0', `${row * 3}px`); act('YAW E ▶', 'KeyE', x2, `${row * 3}px`, rightW);
    act('BOMB · Z', 'KeyZ', '0', `${row * 4}px`);
    parent.appendChild(root);
    this.touchControls = root;
  }

  private onTouchLookStart = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement)?.closest?.('button')) return;
    this.touchLookId = e.pointerId;
    this.touchLastX = e.clientX;
    this.touchLastY = e.clientY;
  };

  private onTouchLookMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || this.touchLookId !== e.pointerId) return;
    this.mouseDX += (e.clientX - this.touchLastX) * 1.1;
    this.mouseDY += (e.clientY - this.touchLastY) * 1.1;
    this.touchLastX = e.clientX;
    this.touchLastY = e.clientY;
  };

  private onTouchLookEnd = (e: PointerEvent): void => {
    if (this.touchLookId === e.pointerId) this.touchLookId = null;
  };

  private onLockChange = (): void => {
    this._locked = document.pointerLockElement === this.target;
    if (!this._locked) this.down.clear();
    this.bus.emit('camera:locked', { locked: this._locked });
  };
}
