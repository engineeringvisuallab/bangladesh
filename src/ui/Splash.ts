import { UI_FONT } from './theme';

/**
 * Game-start splash: the EVCity logo animates in (icon pops + glows, wordmark wipes in, light sweep),
 * a thin progress bar runs while the engine loads, then the whole thing fades out.
 * Pure DOM + CSS (transform/opacity), so it keeps animating while the engine is busy loading.
 */

const HOLD_AFTER_INTRO_MS = 2500; // logo + name stay fully visible this long AFTER the wordmark has appeared
const INTRO_FALLBACK_MS = 4000;   // safety: treat the intro as done after this even if animationend never fires
const FADE_OUT_MS = 700;

const CSS = `
.evs-root{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 45%,#10283a 0%,#0b1520 55%,#060b12 100%);overflow:hidden;
  font-family:${UI_FONT};transition:opacity ${FADE_OUT_MS}ms ease,transform ${FADE_OUT_MS}ms ease;}
.evs-root.evs-out{opacity:0;transform:scale(1.06);pointer-events:none;}
.evs-glow{position:absolute;left:50%;top:46%;width:60vmin;height:60vmin;margin:-30vmin 0 0 -30vmin;border-radius:50%;
  background:radial-gradient(circle,rgba(16,245,212,.38) 0%,rgba(16,245,212,0) 68%);opacity:0;
  animation:evs-glow 3s ease-out .1s forwards,evs-breathe 3.2s ease-in-out 3s infinite;}
.evs-grid{position:absolute;inset:-50%;background-image:linear-gradient(rgba(16,245,212,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(16,245,212,.07) 1px,transparent 1px);
  background-size:56px 56px;transform:perspective(600px) rotateX(62deg) translateY(0);transform-origin:50% 60%;opacity:0;
  animation:evs-fade 1.6s ease .2s forwards,evs-grid 6s linear infinite;
  -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);}
.evs-logo{position:relative;width:min(78vw,760px);aspect-ratio:1000/217;}
.evs-layer{position:absolute;inset:0;background:url(LOGO_URL) center/100% 100% no-repeat;}
.evs-iconwrap{position:absolute;inset:0;transform-origin:14% 50%;opacity:0;
  animation:evs-icon 1.1s cubic-bezier(.2,1.3,.4,1) .35s forwards,evs-iconglow 2.4s ease-in-out 1.5s infinite;}
.evs-icon{clip-path:inset(0 71% 0 0);}
.evs-text{clip-path:inset(0 100% 0 29%);opacity:0;animation:evs-text 1.1s cubic-bezier(.65,0,.25,1) 1.1s forwards;}
.evs-shine{position:absolute;inset:0;overflow:hidden;pointer-events:none;
  -webkit-mask-image:url(LOGO_URL);mask-image:url(LOGO_URL);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}
.evs-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;width:22%;left:-30%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.95),transparent);transform:skewX(-18deg);
  animation:evs-sweep 1.1s ease-in-out 2.3s forwards;}
.evs-bar{position:relative;margin-top:7vh;width:min(46vw,340px);height:3px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;opacity:0;animation:evs-fade .6s ease 1.4s forwards;}
.evs-fill{position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(90deg,#00c8e6,#10f5d4);border-radius:3px;
  transform:scaleX(.04);transform-origin:left center;transition:transform .5s ease;box-shadow:0 0 10px rgba(16,245,212,.8);}
.evs-label{margin-top:12px;color:rgba(200,230,240,.7);font-size:13px;letter-spacing:.5px;opacity:0;animation:evs-fade .6s ease 1.6s forwards;}
@keyframes evs-fade{to{opacity:1}}
@keyframes evs-glow{0%{opacity:0;transform:scale(.5)}60%{opacity:1}100%{opacity:.75;transform:scale(1)}}
@keyframes evs-breathe{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:.5;transform:scale(1.08)}}
@keyframes evs-grid{to{background-position:0 56px}}
@keyframes evs-icon{0%{opacity:0;transform:scale(.4) rotate(-14deg) translateX(-30px)}100%{opacity:1;transform:scale(1) rotate(0) translateX(0)}}
@keyframes evs-iconglow{0%,100%{filter:drop-shadow(0 0 4px rgba(16,245,212,.35))}50%{filter:drop-shadow(0 0 22px rgba(16,245,212,.9))}}
@keyframes evs-text{0%{opacity:0;clip-path:inset(0 100% 0 29%);transform:translateX(-24px)}25%{opacity:1}100%{opacity:1;clip-path:inset(0 0 0 29%);transform:translateX(0)}}
@keyframes evs-sweep{to{left:120%}}
@media (prefers-reduced-motion:reduce){
  .evs-grid,.evs-glow,.evs-iconwrap,.evs-text,.evs-shine::after{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}
}
`;

export class Splash {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  /** Resolves when the logo + wordmark intro has finished playing (the engine load starts only after this). */
  readonly introDone: Promise<void>;
  private introEndedAt = 0;
  private progress = 0.04;
  private creep: number | undefined;

  constructor(parent: HTMLElement = document.body) {
    const logoUrl = `${import.meta.env.BASE_URL}assets/evcity-logo.png`;
    const style = document.createElement('style');
    style.textContent = CSS.split('LOGO_URL').join(`"${logoUrl}"`);
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'evs-root';
    this.root.innerHTML = `
      <div class="evs-grid"></div>
      <div class="evs-glow"></div>
      <div class="evs-logo">
        <div class="evs-iconwrap"><div class="evs-layer evs-icon"></div></div>
        <div class="evs-layer evs-text"></div>
        <div class="evs-shine"></div>
      </div>
      <div class="evs-bar"><div class="evs-fill"></div></div>
      <div class="evs-label">লোড হচ্ছে…</div>`;
    parent.appendChild(this.root);
    this.fill = this.root.querySelector('.evs-fill') as HTMLDivElement;
    this.label = this.root.querySelector('.evs-label') as HTMLDivElement;

    const textEl = this.root.querySelector('.evs-text') as HTMLDivElement;
    this.introDone = new Promise<void>((resolve) => {
      const done = () => { if (!this.introEndedAt) { this.introEndedAt = performance.now(); resolve(); } };
      textEl.addEventListener('animationend', done, { once: true });
      window.setTimeout(done, INTRO_FALLBACK_MS);
    });

    // The engine gives no granular progress, so creep towards ~90% and jump to 100% when it is ready.
    this.creep = window.setInterval(() => {
      this.setProgress(this.progress + (0.9 - this.progress) * 0.08);
    }, 350);
  }

  setProgress(p: number): void {
    this.progress = Math.max(this.progress, Math.min(1, p));
    this.fill.style.transform = `scaleX(${this.progress})`;
  }

  /** Call when the game is ready: finishes the bar, waits for the intro to play out, fades away, removes itself. */
  async finish(): Promise<void> {
    if (this.creep !== undefined) window.clearInterval(this.creep);
    this.setProgress(1);
    this.label.textContent = 'প্রস্তুত!';
    await this.introDone;
    const wait = Math.max(0, HOLD_AFTER_INTRO_MS - (performance.now() - this.introEndedAt));
    await new Promise((r) => setTimeout(r, wait));
    this.root.classList.add('evs-out');
    await new Promise((r) => setTimeout(r, FADE_OUT_MS + 50));
    this.root.remove();
  }

  /** Loading failed: drop the splash immediately so the error message is visible. */
  dispose(): void {
    if (this.creep !== undefined) window.clearInterval(this.creep);
    this.root.remove();
  }
}
