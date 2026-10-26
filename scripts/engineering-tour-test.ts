// Engineering Tour (the Tour button): click Tour -> pick a site -> that site's guided tour starts. Builds the sites like the game does.
// Run: npx tsx scripts/engineering-tour-test.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { InfraManager } from '../src/engineering/InfraManager';
import { TourManager } from '../src/tour/TourManager';

// minimal DOM: just enough for TourUI / Toolbar / InfraManager
class El {
  style: Record<string, string> = {};
  children: El[] = [];
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  className = '';
  type = '';
  textContent = '';
  isConnected = true;
  disabled = false;
  private html = '';
  set innerHTML(v: string) { this.html = v; this.children = [new El(), new El(), new El()]; }
  get innerHTML(): string { return this.html; }
  appendChild(c: El): El { this.children.push(c); return c; }
  append(...c: El[]): void { this.children.push(...c); }
  replaceChildren(...c: El[]): void { this.children = [...c]; }
  remove(): void { this.isConnected = false; }
  addEventListener(t: string, f: (e: unknown) => void): void { (this.listeners[t] ??= []).push(f); }
  querySelectorAll(): El[] { return this.children; }
  click(): void { for (const f of this.listeners.click ?? []) f({ target: this }); }
  getContext(): null { return null; } // canvas signs are skipped in the headless test
}
const keyListeners: ((e: { code: string }) => void)[] = [];
(globalThis as Record<string, unknown>).window = Object.assign(globalThis, {
  addEventListener: (t: string, f: (e: { code: string }) => void) => { if (t === 'keydown') keyListeners.push(f); },
  removeEventListener: (t: string, f: (e: { code: string }) => void) => { const i = keyListeners.indexOf(f); if (t === 'keydown' && i >= 0) keyListeners.splice(i, 1); },
});
const head = new El();
(globalThis as Record<string, unknown>).document = { createElement: () => new El(), head };

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const g = new TerrainGenerator(Config.world.seed);
const origin = { origin: new THREE.Vector3(), toLocal: (w: THREE.Vector3, out = new THREE.Vector3()) => out.set(w.x, w.y, w.z), toWorld: (l: THREE.Vector3, out = new THREE.Vector3()) => out.set(l.x, l.y, l.z) };
const spoken: string[] = [];
let canStart = true;
const container = new El();
const mgr = new InfraManager({
  root: new THREE.Group(), physics: { RAPIER, world } as never, origin: origin as never, terrain: g,
  input: { wasPressed: () => false } as never,
  voice: { speakText: async (t: string) => { spoken.push(t); }, stop() {} }, container: container as never,
  playerWorld: (out) => out.set(0, 30, 0),
  canStart: () => canStart,
});
world.step();

// 1) the menu lists every engineering site
const sites = mgr.listTours();
console.log('sites:', sites.map((s) => s.id).join(', '));
ok(sites.length === g.infra.length && sites.length >= 10, `menu lists every engineering site (${sites.length})`);
ok(sites.every((s) => s.name && s.mark && s.color && s.category && s.stops >= 5), 'every entry has a name, mark, colour, category and stops');
ok(['tech', 'renew', 'chem', 'auto', 'vehicle', 'dam'].every((id) => sites.some((s) => s.id === id)), 'new sites (tech, renew, chem, auto, vehicle, dam) are in the menu');

// 2) the Tour button + picker
let tourOn = false;
const tour = new TourManager({ container: container as never, infra: mgr });
mgr.onTour = (a) => { tourOn = a; tour.setTouring(a); };
const toolbar = container.children.find((c) => c.style.top === '14px' && c.style.left === '14px');
const button = toolbar?.children[0];
ok(!!button, 'Tour button is in the top-left toolbar');
const overlay = container.children.find((c) => c.style.inset === '0');
ok(!!overlay && overlay.style.display === 'none', 'site picker starts closed');
button.click();
ok(overlay!.style.display === 'flex', 'clicking Tour opens the site picker');
const panel = overlay!.children[0];
const list = panel.children[2];
ok(list.children.length === sites.length, `picker shows ${sites.length} site cards`);
for (const f of [...keyListeners]) f({ code: 'Escape' });
ok(overlay!.style.display === 'none', 'Esc closes the picker');
button.click();

// 3) picking a site starts its tour by itself (camera cut, narration, tour state)
const techIdx = sites.findIndex((s) => s.id === 'tech');
list.children[techIdx].click();
ok(tourOn && mgr.touring, 'picking a site starts that site\'s tour');
ok(overlay!.style.display === 'none', 'picker closes when the tour starts');
ok(/Stop|থামান/.test(button.textContent), 'while touring the Tour button turns into Stop');
for (let i = 0; i < 30; i++) { mgr.applyCamera(1 / 60, new THREE.PerspectiveCamera()); mgr.update(1 / 60); }
ok(spoken.length > 0, 'the site narration starts (voice requested)');
const planned = mgr.plants.find((p) => p.site.id === 'tech')!;
ok(planned.tour.index === 0 && planned.tour.stops.length === sites[techIdx].stops, 'tour runs on the chosen site, from stop 1');

// 4) the Tour button stops a running tour
button.click();
for (let i = 0; i < 5; i++) { mgr.applyCamera(1 / 60, new THREE.PerspectiveCamera()); mgr.update(1 / 60); }
ok(!mgr.touring && !tourOn, 'Tour button stops the running tour');
ok(/Tour|ট্যুর/.test(button.textContent) && !/থামান/.test(button.textContent), 'button is back to Tour');

// 5) can not start from a vehicle / building
canStart = false;
ok(mgr.startById('chem') === 'blocked' && !mgr.touring, 'blocked while driving / flying / inside a building');
canStart = true;
ok(mgr.startById('nope') === 'unknown', 'unknown site id is ignored');

// 6) another site, then a second pick while touring is ignored
ok(mgr.startById('renew') === 'started' && mgr.touring, 'a second site can be toured after the first one stopped');
ok(mgr.startById('chem') === 'busy', 'a pick during a running tour does not start a second one');
mgr.stopTour();
for (let i = 0; i < 5; i++) { mgr.applyCamera(1 / 60, new THREE.PerspectiveCamera()); mgr.update(1 / 60); }
ok(!mgr.touring, 'stopTour ends it');

tour.dispose();
mgr.dispose();
ok(keyListeners.length === 0, 'dispose removes the Esc listener');
console.log(bad ? `${bad} FAILURES` : 'ALL OK');
if (bad) process.exit(1);
