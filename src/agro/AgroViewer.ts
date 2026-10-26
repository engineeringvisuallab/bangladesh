// Standalone walkthrough of the EV Agro institute (agro.html). Two floors, lifts, room teleport menu.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MallInteraction } from '../mall/MallInteraction';
import type { PickInfo } from '../mall/MallBuilder';
import { buildAgro } from './AgroBuilder';
import type { AgroPick } from './AgroRooms';
import { FIELD_INFO } from './AgroRooms';

const CSS = `
.ag{position:fixed;inset:0;pointer-events:none;font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#fff}
.ag .panel{position:absolute;left:12px;top:12px;background:rgba(15,23,42,.84);border-radius:12px;padding:10px 12px;pointer-events:auto;width:240px;max-height:calc(100% - 90px);overflow:auto}
.ag h1{font-size:16px;margin:0 0 6px;color:#4ade80}.ag h2{font-size:12px;margin:8px 0 3px;opacity:.7}
.ag button{display:block;width:100%;margin:2px 0;padding:5px 8px;border:0;border-radius:8px;background:#1e293b;color:#fff;text-align:left;cursor:pointer;font:inherit;font-size:13px;border-left:5px solid var(--c,#4ade80)}
.ag button:hover{background:#334155}
.ag .help{position:absolute;left:12px;bottom:12px;font-size:12px;background:rgba(15,23,42,.72);padding:6px 10px;border-radius:8px}
.ag .cross{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border:2px solid #fff;border-radius:50%;opacity:.8}
.ag .tip{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(15,23,42,.92);border:2px solid #4ade80;border-radius:14px;padding:10px 18px;text-align:center;display:none}
.ag .tip b{font-size:18px;display:block}.ag .tip small{opacity:.85}
.ag .where{position:absolute;right:12px;top:12px;background:rgba(15,23,42,.84);border-radius:10px;padding:6px 12px;font-size:14px}
.ag .toast{position:absolute;left:50%;top:70px;transform:translateX(-50%);background:#166534;border-radius:12px;padding:10px 18px;display:none;max-width:420px;text-align:center}
.ag input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:0;margin:4px 0;font:inherit;font-size:13px}.ag #mini{position:absolute;right:12px;bottom:12px;border-radius:10px;background:rgba(15,23,42,.82)}
.ag .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .25s}`;

export async function startAgroViewer(container: HTMLElement): Promise<void> {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  await document.fonts.load('700 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined);
  const agro = buildAgro(), FH = agro.floorHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f5); scene.fog = new THREE.Fog(0xbfe3f5, 160, 480);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // makes metals look right
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(40, 80, 50); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x7fae5f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; scene.add(ground);
  scene.add(agro.group);

  const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
  const pos = agro.spawn.clone(); let yaw = agro.spawnYaw, pitch = 0, level: 0 | 1 = 0, overview = 0;
  const EYE = 1.65, R = 0.45;

  // ---- UI ----
  const ui = document.createElement('div'); ui.className = 'ag';
  ui.innerHTML = `<div class="panel"><h1>EV Agro Institute</h1><input id="q" placeholder="রুম বা বিষয় খুঁজুন… (যেমন: সার, সেচ, মাছ)"><div id="res"></div><button id="b-out" style="--c:#94a3b8">বাইরে (প্রবেশদ্বার)</button><button id="b-lobby" style="--c:#4ade80">লবি</button>
    <h2>গবেষণা মাঠ (খোলা শেড)</h2><div id="lf"></div><h2>নিচতলা</h2><div id="l0"></div><h2>দোতলা</h2><div id="l1"></div></div><div class="where" id="where"></div><canvas id="mini" width="195" height="135"></canvas><div class="cross"></div>
    <div class="tip" id="tip"></div><div class="toast" id="toast"></div><div class="fade" id="fade"></div>
    <div class="help">W A S D চলুন · Shift দৌড় · মাউস ঘোরান · লিফটের সবুজ বোতামে ক্লিক = তলা বদল · বিশেষজ্ঞে ক্লিক = পরামর্শ · O = ওপর থেকে দেখুন · Esc = মাউস ছাড়ুন</div>`;
  document.body.appendChild(ui);
  const $ = (id: string) => ui.querySelector('#' + id) as HTMLElement;
  const tip = $('tip'), toast = $('toast'), fade = $('fade'), where = $('where');
  let toastT = 0;
  const say = (t: string) => { toast.textContent = t; toast.style.display = 'block'; clearTimeout(toastT); toastT = window.setTimeout(() => (toast.style.display = 'none'), 3500); };
  const rooms = new Map(agro.rooms.map((r) => [r.def.id, r]));

  const setLevel = (l: 0 | 1) => { level = l; inter.targets = agro.pickables[l]; };
  const go = (x: number, z: number, y: number, l: 0 | 1) => {
    overview = 0; agro.roof.visible = true; agro.upper.visible = true; inter.maxDist = 14;
    pos.set(x, 0, z); yaw = y; pitch = 0; setLevel(l);
  };
  $('b-out').onclick = () => go(agro.spawn.x, agro.spawn.z, agro.spawnYaw, 0);
  $('b-lobby').onclick = () => go(agro.lobby.pos.x, agro.lobby.pos.z, agro.lobby.yaw, 0);
  for (const r of agro.rooms) {
    const b = document.createElement('button');
    b.textContent = r.def.bn; b.style.setProperty('--c', '#' + r.def.color.toString(16).padStart(6, '0'));
    b.onclick = () => go(r.viewPos.x, r.viewPos.z, r.yaw, r.def.level);
    $('l' + r.def.level).appendChild(b);
  }
  const q = $('q') as HTMLInputElement, res = $('res');
  q.addEventListener('keydown', (e) => e.stopPropagation());
  q.addEventListener('input', () => {
    res.innerHTML = ''; const v = q.value.trim().toLowerCase(); if (!v) return;
    agro.rooms.filter((r) => (r.def.bn + r.def.en + r.def.topics.join(' ')).toLowerCase().includes(v)).slice(0, 6).forEach((r) => {
      const b = document.createElement('button'); b.textContent = `${r.def.bn} (${r.def.level ? 'দোতলা' : 'নিচতলা'})`;
      b.style.setProperty('--c', '#' + r.def.color.toString(16).padStart(6, '0')); b.onclick = () => go(r.viewPos.x, r.viewPos.z, r.yaw, r.def.level); res.appendChild(b);
    });
  });
  const mini = ($('mini') as HTMLCanvasElement).getContext('2d')!;
  const drawMini = () => {
    const X = (x: number) => (x + 65) * 1.5, Z = (z: number) => (z + 45) * 1.5;
    mini.clearRect(0, 0, 195, 135); mini.fillStyle = '#d6d3d1'; mini.fillRect(X(-60), Z(-40), 180, 120);
    mini.fillStyle = '#4d9a3a'; mini.fillRect(X(-40), Z(-20), 120, 60);
    for (const r of agro.rooms) if (r.def.level === level) { mini.fillStyle = '#' + r.def.color.toString(16).padStart(6, '0'); mini.fillRect(X(r.def.x0) + 1, Z(r.def.z0) + 1, (r.def.x1 - r.def.x0) * 1.5 - 2, (r.def.z1 - r.def.z0) * 1.5 - 2); }
    const px = Math.min(Math.max(X(pos.x), 3), 192), pz = Math.min(Math.max(Z(pos.z), 3), 132);
    mini.fillStyle = '#fff'; mini.beginPath(); mini.arc(px, pz, 4, 0, 7); mini.fill();
    mini.strokeStyle = '#fff'; mini.lineWidth = 2; mini.beginPath(); mini.moveTo(px, pz); mini.lineTo(px - Math.sin(yaw) * 8, pz - Math.cos(yaw) * 8); mini.stroke();
  };
  for (const f of agro.fieldSpots) {
    const b = document.createElement('button'); b.textContent = f.bn; b.style.setProperty('--c', '#22c55e');
    b.onclick = () => go(f.pos.x, f.pos.z, f.yaw, 0); $('lf').appendChild(b);
  }
  const roomAt = () => agro.rooms.find((r) => r.def.level === level && pos.x > r.def.x0 && pos.x < r.def.x1 && pos.z > r.def.z0 && pos.z < r.def.z1);

  const inter = new MallInteraction(cam, renderer.domElement, agro.pickables[0], (p) => {
    tip.style.display = p ? 'block' : 'none';
    if (p) tip.innerHTML = `<b>${p.title}</b><small>${p.sub || ''}</small>`;
  }, (p: PickInfo) => {
    const k = p as AgroPick;
    if (k.action === 'lift') {
      fade.style.opacity = '1';
      setTimeout(() => { setLevel(level === 0 ? 1 : 0); fade.style.opacity = '0'; }, 280);
    } else if (k.action === 'ask') {
      const r = k.roomId === 'field' ? FIELD_INFO : rooms.get(k.roomId ?? '')?.def;
      say(k.roomId === 'reception' ? 'রিসেপশন: স্বাগতম! বাম মেনু থেকে রুম বেছে নিন, অথবা লিফটে দোতলায় যান।' : `${r?.bn ?? ''}: বিশেষজ্ঞের পরামর্শ ফিচার পরে যোগ হবে। বিষয়: ${r?.topics.join(', ') ?? ''}`);
    } else if (k.action === 'info') say(`${k.title} — ${k.sub}`);
  });
  inter.blockers = agro.blockers;

  // ---- input ----
  const keys = new Set<string>();
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyO') { // walk -> overview (roof off) -> overview (upper floor off) -> walk
      overview = (overview + 1) % 3;
      agro.roof.visible = overview === 0; agro.upper.visible = overview !== 2; inter.maxDist = overview ? 500 : 14;
      if (overview) document.exitPointerLock();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  renderer.domElement.addEventListener('click', () => {
    if (inter.click()) return;
    if (!overview) void renderer.domElement.requestPointerLock();
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.4, 1.4);
  });
  addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  const blocked = (x: number, z: number) => agro.colliders[level].some((r) => x > r.minX - R && x < r.maxX + R && z > r.minZ - R && z < r.maxZ + R);
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!overview) {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const v = (keys.has('ShiftLeft') ? 9 : 4.5) * dt;
      const nx = pos.x + (-Math.sin(yaw) * f + Math.cos(yaw) * r) * v, nz = pos.z + (-Math.cos(yaw) * f - Math.sin(yaw) * r) * v;
      if (!blocked(nx, pos.z)) pos.x = nx;
      if (!blocked(pos.x, nz)) pos.z = nz;
      cam.position.set(pos.x, level * FH + EYE, pos.z); cam.rotation.set(pitch, yaw, 0, 'YXZ');
    } else { cam.position.set(85, 190, 130); cam.lookAt(85, 0, 5); }
    where.textContent = overview ? 'ওপর থেকে দেখা' : (roomAt()?.def.bn ?? (pos.x > 70 && pos.x < 150 && Math.abs(pos.z) < 30 ? 'শেড এলাকা — গবেষণা মাঠ' : pos.x > 62 && pos.z > -75 && pos.z < 75 && level === 0 ? 'গবেষণা মাঠ' : pos.z > 40 ? 'বাইরে' : level ? 'দোতলা — করিডর' : 'নিচতলা — করিডর'));
    agro.update(dt); drawMini(); inter.update(); renderer.render(scene, cam);
  });
}
