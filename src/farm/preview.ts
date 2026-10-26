// Standalone preview of the farm system (farm.html): the REAL terrain heights around the camera + every field, crop, tractor and worker.
// Free-fly: WASD + mouse (click to capture) - Shift fast - Q / E down / up. The buttons on the left jump to the nearest field of a kind.
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/700.css';
import * as THREE from 'three';
import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { Config } from '../core/Config';
import { Act, ACT_BN } from './CropDefs';
import { FARM_FIELDS } from './FarmFields';
import { FarmManager } from './FarmManager';
import type { Field } from './FarmPlan';

const CSS = `
.fp{position:fixed;inset:0;pointer-events:none;font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#fff}
.fp .panel{position:absolute;left:12px;top:12px;background:rgba(15,23,42,.84);border-radius:12px;padding:10px 12px;pointer-events:auto;width:230px;max-height:calc(100% - 100px);overflow:auto}
.fp h1{font-size:16px;margin:0 0 6px;color:#4ade80}
.fp button{display:block;width:100%;margin:2px 0;padding:5px 8px;border:0;border-radius:8px;background:#1e293b;color:#fff;text-align:left;cursor:pointer;font:inherit;font-size:13px}
.fp button:hover{background:#334155}
.fp .info{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(15,23,42,.9);border:2px solid #4ade80;border-radius:14px;padding:8px 18px;text-align:center;min-width:220px}
.fp .info b{font-size:18px;display:block}.fp .info small{opacity:.85}
.fp .help{position:absolute;right:12px;bottom:12px;font-size:12px;background:rgba(15,23,42,.72);padding:6px 10px;border-radius:8px}`;

const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
const el = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
el.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3f5); scene.fog = new THREE.Fog(0xbfe3f5, 500, 1900);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.0));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.6); sun.position.set(300, 500, 200); scene.add(sun);
const cam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 4000);

const terrain = new TerrainGenerator(Config.world.seed);
const farm = new FarmManager({ root: scene, terrain, playerWorld: (o) => o.copy(cam.position) });

// ---- terrain patch around the camera (rebuilt when the camera moves 350 m) ----
const TILE = 2400, STEP = 12, NV = TILE / STEP + 1;
const geo = new THREE.BufferGeometry();
const pos = new Float32Array(NV * NV * 3), col = new Float32Array(NV * NV * 3), idx: number[] = [];
for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) { const a = j * NV + i, b = a + NV; idx.push(a, b, a + 1, b, b + 1, a + 1); }
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
const patch = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
patch.frustumCulled = false; scene.add(patch);
const smp = terrain.makeSample();
let cx0 = 1e9, cz0 = 1e9;
function rebuildPatch(cx: number, cz: number): void {
  cx0 = cx; cz0 = cz;
  const c = new THREE.Color();
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = cx - TILE / 2 + i * STEP, z = cz - TILE / 2 + j * STEP, k = (j * NV + i) * 3;
    terrain.sample(x, z, smp);
    const wet = !Number.isNaN(smp.water) && smp.h < smp.water;
    pos[k] = x; pos[k + 1] = wet ? smp.water : smp.h; pos[k + 2] = z;
    if (wet) c.set(0x3f8fb8); else c.set(0x86a85a).lerp(new THREE.Color(0x9c8f66), Math.min(1, Math.max(0, (smp.h - 60) / 220)));
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.computeVertexNormals();
}

// ---- camera ----
let yaw = 0, pitch = -0.25;
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code)); addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => { if (document.pointerLockElement) { yaw -= e.movementX * 0.0025; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.0025)); } });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function goTo(f: Field): void {
  const back = 70, y = terrain.heightAt(f.cx, f.cz) + 28;
  cam.position.set(f.cx + back, y, f.cz + back);
  yaw = Math.PI / 4; pitch = -0.38; // looking toward -x, -z: at the field
}
const start = FARM_FIELDS.find((f) => f.zone === 'east-farms') ?? FARM_FIELDS[0];
goTo(start);

// ---- UI ----
const ui = document.createElement('div'); ui.className = 'fp';
ui.innerHTML = `<div class="panel"><h1>EV কৃষি প্রিভিউ</h1><div id="b"></div></div><div class="info" id="info"></div><div class="help">W A S D · Shift দ্রুত · Q/E নিচে/উপরে · ক্লিক করে মাউস ঘোরান</div>`;
document.body.appendChild(ui);
const box = ui.querySelector('#b') as HTMLElement, info = ui.querySelector('#info') as HTMLElement;
const jump = (label: string, test: (f: Field) => boolean) => {
  const b = document.createElement('button'); b.textContent = label;
  b.onclick = () => {
    let best: Field | null = null, bd = 1e12;
    for (const f of FARM_FIELDS) if (test(f)) { const d = (f.cx - cam.position.x) ** 2 + (f.cz - cam.position.z) ** 2; if (d > 400 && d < bd) { bd = d; best = f; } }
    if (best) goTo(best);
  };
  box.appendChild(b);
};
for (const a of [Act.plow, Act.transplant, Act.sow, Act.irrigate, Act.spray, Act.weed, Act.harvestCombine, Act.harvestHand, Act.thresh, Act.haul, Act.pick, Act.graze]) jump(ACT_BN[a], (f) => f.act === a);
jump('ধান', (f) => f.crop === 'dhan'); jump('পাহাড়ি ফল বাগান', (f) => f.kind === 'hill' && f.crop !== 'cha'); jump('চা বাগান', (f) => f.crop === 'cha'); jump('মাচায় লাউ', (f) => f.crop === 'lau'); jump('আখ', (f) => f.crop === 'akh');

let last = performance.now();
const dir = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const sp = (keys.has('ShiftLeft') ? 140 : 35) * dt;
  dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys.has('KeyW')) cam.position.addScaledVector(dir, sp);
  if (keys.has('KeyS')) cam.position.addScaledVector(dir, -sp);
  if (keys.has('KeyD')) cam.position.addScaledVector(right, sp);
  if (keys.has('KeyA')) cam.position.addScaledVector(right, -sp);
  if (keys.has('KeyE')) cam.position.y += sp;
  if (keys.has('KeyQ')) cam.position.y -= sp;
  cam.rotation.set(pitch, yaw, 0, 'YXZ');
  if (Math.hypot(cam.position.x - cx0, cam.position.z - cz0) > 350) rebuildPatch(cam.position.x, cam.position.z);
  farm.update(dt);
  const fi = farm.info(cam.position.x - Math.sin(yaw) * 40, cam.position.z - Math.cos(yaw) * 40) ?? farm.info(cam.position.x, cam.position.z);
  info.innerHTML = fi ? `<b>${fi.crop}</b><small>${fi.stage}${fi.work ? ' · ' + fi.work : ''}</small>` : '<small>মাঠের দিকে তাকান…</small>';
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
rebuildPatch(cam.position.x, cam.position.z);
requestAnimationFrame(frame);
