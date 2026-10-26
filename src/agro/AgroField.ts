// EV Agro Research Field - open-air research area east of the institute building (connected via the workshop's back door).
//  * MAIN SHADE HOUSE 80 x 60 m: open-sided steel frame + shade net, 4 research zones underneath
//  * OPEN FIELD plots + irrigation canal, weather station, drone pad
//  * fish/duck pond with pavilion, EV machinery parking shade with solar roof
import * as THREE from 'three';
import { makeProductModel, makePerson, stdMat } from '../mall/ProductModels';
import { canvasTex, signMesh } from '../mall/MallBuilder';
import type { Rect } from '../mall/MallBuilder';
import { AgroPick, FIELD } from './AgroRooms';
import { facing, makeDrone, makeTractor, textSprite } from './AgroProps';

export interface FieldSpot { id: string; bn: string; pos: THREE.Vector3; yaw: number }
export interface FieldBuild {
  group: THREE.Group; shade: THREE.Group; // `shade` = net roofs (hidden in overview mode)
  colliders: Rect[]; pickables: THREE.Object3D[]; blockers: THREE.Object3D[]; spots: FieldSpot[];
}

export function buildField(): FieldBuild {
  const g = new THREE.Group(); g.name = 'EVAgroField';
  const shade = new THREE.Group(); g.add(shade);
  const colliders: Rect[] = [], pickables: THREE.Object3D[] = [], blockers: THREE.Object3D[] = [], spots: FieldSpot[] = [];
  const M = stdMat, white = M(0xffffff, 0, 0.85), gravel = M(0xcdc3a8, 0, 1), soil = M(0x5b3a1e, 0, 1);
  const col = (x: number, z: number, hx: number, hz = hx) => colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, solid = false) => { const o = mk(new THREE.BoxGeometry(w, h, d), m, x, y, z); if (solid) col(x, z, w / 2, d / 2); return o; };
  const plane = (w: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D = g) => { const o = mk(new THREE.PlaneGeometry(w, d), m, x, y, z, parent); o.rotation.x = -Math.PI / 2; return o; };
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, pts: number[][], colors?: number[]) => {
    const im = new THREE.InstancedMesh(geo, m, pts.length), o = new THREE.Object3D(), c = new THREE.Color();
    pts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.y = p[3] ?? 0; o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (colors) im.setColorAt(i, c.setHex(colors[i % colors.length])); });
    g.add(im); return im;
  };
  const info = (o: THREE.Object3D, title: string, sub: string) => { o.userData.pick = { title, sub, url: '', action: 'info' } satisfies AgroPick; pickables.push(o); };
  const label = (w: number, h: number, t: string, sub: string, color: number, x: number, y: number, z: number, nx: number, nz: number) => { const s = signMesh(w, h, t, sub, color); s.position.set(x, y, z); facing(s, nx, nz); g.add(s); return s; };
  const expert = (x: number, z: number, nx: number, nz: number, color: number) => {
    const e = makePerson(color); e.position.set(x, 0, z); facing(e, nx, nz);
    const tag = textSprite('পরামর্শ নিন', 0x22c55e, 2.0); tag.position.y = 2.25; e.add(tag);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1; e.add(hit);
    e.userData.pick = { title: 'গবেষণা মাঠ — কৃষি বিশেষজ্ঞ', sub: 'প্রশ্ন করুন (ফিচার পরে আসছে)', url: '', action: 'ask', roomId: 'field' } satisfies AgroPick;
    g.add(e); pickables.push(e);
  };

  // ---- ground, paths ----
  plane(FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0, (FIELD.x0 + FIELD.x1) / 2, 0.001, 0, M(0x86a85a, 0, 1));
  plane(10, 4, 65, 0.02, 0, gravel); plane(8, 50, 104, 0.02, 50, gravel);
  plane(80, 60, 110, 0.012, 0, M(0x9b8b6c, 0, 1)); plane(80, 4, 110, 0.03, 0, gravel); plane(4, 60, 110, 0.03, 0, gravel);

  // ---- MAIN SHADE HOUSE (x 70..150, z -30..30) ----
  const px = [70, 80, 90, 100, 120, 130, 140, 150], pz = [-30, -20, -10, 10, 20, 30];
  const posts: number[][] = []; for (const x of px) for (const z of pz) { posts.push([x, 3.25, z]); col(x, z, 0.35); }
  inst(new THREE.CylinderGeometry(0.16, 0.2, 6.5, 10), M(0x6b7280, 0.6, 0.4), posts);
  inst(new THREE.BoxGeometry(80, 0.25, 0.25), M(0x4b5563, 0.6, 0.4), [-30, -20, -10, 0, 10, 20, 30].map((z) => [110, 6.6, z]));
  inst(new THREE.BoxGeometry(0.25, 0.25, 60), M(0x4b5563, 0.6, 0.4), [70, 80, 90, 100, 110, 120, 130, 140, 150].map((x) => [x, 6.6, 0]));
  const netTex = canvasTex(16, 16, (c) => { c.fillStyle = 'rgba(15,70,30,0.32)'; c.fillRect(0, 0, 16, 16); c.strokeStyle = 'rgba(5,40,15,0.85)'; c.lineWidth = 2; c.strokeRect(0, 0, 16, 16); });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(160, 120);
  const net = plane(80.6, 60.6, 110, 6.75, 0, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }), shade);
  void net;
  label(8, 1.6, 'ক. শস্য গবেষণা', 'Crop Research', 0x84cc16, 90, 4.6, -1.8, 0, 1); label(8, 1.6, 'খ. সবজি ও ফল', 'Vegetables & Fruits', 0xef4444, 130, 4.6, -1.8, 0, 1);
  label(8, 1.6, 'গ. নার্সারি ও চারা', 'Nursery', 0x22c55e, 90, 4.6, 1.8, 0, -1); label(8, 1.6, 'ঘ. হাইড্রোপনিক্স', 'Hydroponics', 0xa855f7, 130, 4.6, 1.8, 0, -1);

  const plot = (x: number, z: number, w: number, d: number, color: number, title: string, sub: string, h = 0.55) => {
    const bed = box(w, 0.3, d, soil, x, 0.15, z); info(bed, `প্লট — ${title}`, sub);
    const pts: number[][] = [];
    for (let a = -w / 2 + 0.4; a < w / 2; a += 0.55) for (let b = -d / 2 + 0.35; b < d / 2; b += 0.55) pts.push([x + a, 0.3 + h / 2, z + b]);
    inst(new THREE.ConeGeometry(0.17, h, 5), white, pts, [color, color + 0x0a1a06]);
    box(0.08, 1.1, 0.08, M(0x78350f, 0, 1), x, 0.55, z + d / 2 + 0.25);
    const s = label(2.6, 0.65, title, '', color, x, 1.3, z + d / 2 + 0.22, 0, 1); info(s, `প্লট — ${title}`, sub);
  };
  const A: [string, string, number][] = [['ধান — BRRI-29', 'জাত ও সার-মাত্রা তুলনা', 0x84cc16], ['গম — বারি-৩০', 'সেচ ও বপন-সময় পরীক্ষা', 0xd4a017], ['ভুট্টা — হাইব্রিড', 'ঘনত্ব ও ফলন পরীক্ষা', 0xfacc15],
    ['পাট', 'আঁশ মান গবেষণা', 0x65a30d], ['সরিষা', 'তেলবীজ জাত পরীক্ষা', 0xfde047], ['মুগ ডাল', 'নাইট্রোজেন সংবন্ধন', 0x4d7c0f]];
  const B: [string, string, number][] = [['টমেটো', 'রোগ প্রতিরোধী জাত', 0x22c55e], ['বেগুন', 'পোকা দমন পরীক্ষা', 0x7c3aed], ['মরিচ', 'শেড-নেট এ ফলন', 0xef4444],
    ['শসা (মাচা)', 'মাচায় চাষ পদ্ধতি', 0x16a34a], ['লাউ', 'ভার্টিক্যাল চাষ', 0x4ade80], ['ফুলকপি', 'তাপ-সহনশীল জাত', 0xe5e7eb]];
  [77, 89, 101].forEach((x, c) => [-25, -12].forEach((z, r) => { const [t, s, k] = A[r * 3 + c]; plot(x, z, 10, 6, k, t, s); }));
  [119, 131, 143].forEach((x, c) => [-25, -12].forEach((z, r) => { const [t, s, k] = B[r * 3 + c]; plot(x, z, 10, 6, k, t, s, r === 0 && c === 0 ? 0.9 : 0.6); }));
  // zone C: nursery tables with seedling trays + mist poles
  const trays: number[][] = [];
  [78, 92].forEach((x) => [8, 16, 24].forEach((z) => {
    box(8, 0.9, 1.5, M(0x1f2937, 0.3, 0.6), x, 0.45, z, true); box(8.1, 0.06, 1.6, M(0xe5e7eb, 0.1, 0.4), x, 0.93, z);
    for (let k = 0; k < 12; k++) trays.push([x - 3.6 + k * 0.65, 1.02, z]);
    mk(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), M(0x94a3b8, 0.8, 0.3), x + 4.4, 1.5, z); mk(new THREE.SphereGeometry(0.1, 8, 6), M(0x22d3ee, 0, 0.3, 0x22d3ee), x + 4.4, 3.05, z);
  }));
  inst(new THREE.BoxGeometry(0.6, 0.12, 1.2), white, trays, [0x22c55e, 0x16a34a, 0x4ade80]);
  info(box(1, 1, 1, M(0x16a34a, 0, 1), 105, 0.5, 6), 'নার্সারি — চারা উৎপাদন', 'বীজতলা, চারা-পরিচর্যা ও স্থানান্তর');
  // zone D: hydroponic / vertical racks
  [118, 130, 142].forEach((x) => [10, 22].forEach((z) => {
    box(8, 0.12, 1.5, M(0x94a3b8, 0.7, 0.3), x, 2.9, z); box(0.1, 2.9, 1.5, M(0x94a3b8, 0.7, 0.3), x - 4, 1.45, z, true); box(0.1, 2.9, 1.5, M(0x94a3b8, 0.7, 0.3), x + 4, 1.45, z, true);
    const pts: number[][] = [];
    for (let lv = 0; lv < 3; lv++) { box(7.8, 0.12, 1.1, M(0x38bdf8, 0, 0.3), x, 0.45 + lv * 0.95, z); box(7.8, 0.04, 0.2, M(0xa855f7, 0, 0.3, 0xa855f7), x, 0.95 + lv * 0.95 + 0.4, z - 0.45); for (let k = 0; k < 16; k++) pts.push([x - 3.7 + k * 0.49, 0.8 + lv * 0.95, z]); }
    inst(new THREE.ConeGeometry(0.15, 0.4, 6), white, pts, [0x22c55e, 0x4ade80]);
  }));
  info(box(1, 1, 1, M(0xa855f7, 0, 0.6), 108, 0.5, 14), 'হাইড্রোপনিক্স — মাটিবিহীন চাষ', 'পুষ্টি-দ্রবণ, এলইডি আলো ও ভার্টিক্যাল ফার্মিং');
  // tanks at the corners + soil sensors
  for (const [x, z] of [[72, -28], [148, -28], [72, 28], [148, 28]]) { mk(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 20), M(0x1d4ed8, 0.3, 0.5), x, 3.2, z); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.12, 2.0, 0.12, M(0x6b7280, 0.6, 0.4), x + dx, 1.0, z + dz); col(x, z, 1.4); }
  const sens: number[][] = []; for (let x = 74; x < 148; x += 6) for (const z of [-17.5, -4.5]) if (Math.abs(x - 110) > 4) sens.push([x, 0.55, z]);
  inst(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M(0xe5e7eb, 0.5, 0.4), sens);
  inst(new THREE.SphereGeometry(0.09, 8, 6), M(0x22c55e, 0, 0.3, 0x22c55e), sens.map((p) => [p[0], 1.15, p[2]]));

  // ---- OPEN FIELD (x 162..222) ----
  const stripe = (c1: string, c2: string, d: number) => { const t = canvasTex(8, 16, (c) => { c.fillStyle = c1; c.fillRect(0, 0, 8, 8); c.fillStyle = c2; c.fillRect(0, 8, 8, 8); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.repeat.set(1, d / 1.4); return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); };
  const open: [string, string, number, string, string, number][] = [
    ['খোলা মাঠ — গম', 'জাত ও সেচ তুলনা (ডেমো)', -52, '#b08a2e', '#d9b44a', 0xd4a017], ['খোলা মাঠ — ভুট্টা', 'সারের মাত্রা পরীক্ষা (ডেমো)', -28, '#3f7a24', '#5fa535', 0x65a30d], ['খোলা মাঠ — পতিত/পরীক্ষা', 'মাটির উর্বরতা পুনরুদ্ধার (ডেমো)', -4, '#6b4a2a', '#7d5a36', 0x92400e]];
  for (const [t, sub, z, c1, c2, k] of open) {
    const p = plane(60, 20, 192, 0.03, z, stripe(c1, c2, 20)); info(p, t, sub);
    const pts: number[][] = []; for (let r = -8; r <= 8; r += 4) for (let x = 164; x < 220; x += 0.8) pts.push([x, 0.4, z + r]);
    if (k !== 0x92400e) inst(new THREE.ConeGeometry(0.2, 0.7, 5), white, pts, [k, k + 0x0a1a06]);
    box(0.1, 1.4, 0.1, M(0x78350f, 0, 1), 160.5, 0.7, z); label(3.2, 0.8, t, '', k, 160.5, 1.7, z, -1, 0);
  }
  plane(60, 2.2, 192, 0.04, -40, new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })); // canal between the plots
  // weather station + drone pad + scarecrow
  const ws = new THREE.Group(); ws.position.set(190, 0, 28);
  const wm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), M(0xcbd5e1, 0.8, 0.3)); wm.position.y = 3; ws.add(wm);
  for (let k = 0; k < 3; k++) { const cup = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M(0xef4444, 0, 0.5)); cup.position.set(Math.cos(k * 2.09) * 0.5, 6.1, Math.sin(k * 2.09) * 0.5); ws.add(cup); }
  const louver = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), M(0xf8fafc, 0, 0.6)); louver.position.set(1.2, 1.8, 0); ws.add(louver);
  const hitW = new THREE.Mesh(new THREE.BoxGeometry(3, 6.5, 3), new THREE.MeshBasicMaterial({ visible: false })); hitW.position.y = 3.2; ws.add(hitW);
  g.add(ws); col(190, 28, 0.5); info(ws, 'স্বয়ংক্রিয় আবহাওয়া স্টেশন', 'তাপমাত্রা, বৃষ্টি, বাতাস ও আর্দ্রতা মাপে (ডেমো)');
  const padTex = canvasTex(256, 256, (c) => { c.fillStyle = '#334155'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 100, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 134); });
  const pad = plane(8, 8, 210, 0.05, 28, new THREE.MeshBasicMaterial({ map: padTex, transparent: true }));
  const dr = makeDrone(); dr.scale.setScalar(1.3); dr.position.set(210, 0.05, 28); g.add(dr); info(pad, 'ড্রোন ল্যান্ডিং প্যাড', 'ড্রোনে ফসল পর্যবেক্ষণ ও স্প্রে গবেষণা'); info(dr, 'কৃষি ড্রোন', 'ফসলের স্বাস্থ্য ও স্প্রে গবেষণা');
  const sc = new THREE.Group(); sc.position.set(176, 0, -22);
  for (const [w, h, y] of [[0.08, 1.8, 0.9], [1.4, 0.08, 1.4]] as const) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), M(0x78350f, 0, 1)); o.position.y = y; sc.add(o); }
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M(0xe7c27d, 0, 1)); hd.position.y = 1.95; sc.add(hd); const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 10), M(0xb45309, 0, 1)); hat.position.y = 2.25; sc.add(hat); g.add(sc);
  const trees: number[][] = []; for (let z = -72; z <= 72; z += 6) trees.push([226, 0, z]);
  inst(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 8), M(0x78350f, 0, 1), trees.map((t) => [t[0], 1.3, t[2]]));
  inst(new THREE.SphereGeometry(1.7, 10, 8), white, trees.map((t) => [t[0], 3.8, t[2]]), [0x15803d, 0x22c55e, 0x166534]);

  // ---- POND + pavilion (x 66..90, z 44..66) ----
  const pond = plane(24, 22, 78, 0.04, 55, new THREE.MeshStandardMaterial({ color: 0x2b9fd8, transparent: true, opacity: 0.85, roughness: 0.1 })); info(pond, 'মৎস্য ও হাঁস গবেষণা পুকুর', 'মাছের খাবার, পানির মান ও মিশ্র চাষ');
  for (const [w, d, x, z] of [[25, 0.8, 78, 44], [25, 0.8, 78, 66], [0.8, 22, 66, 55], [0.8, 22, 90, 55]] as const) box(w, 0.3, d, M(0x9ca3af, 0, 1), x, 0.15, z);
  col(78, 55, 12.5, 11.5);
  for (const [x, z] of [[72, 50], [78, 55], [84, 60]]) { mk(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14), M(0xf1f5f9, 0.2, 0.5), x, 0.2, z); mk(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 10), M(0x22d3ee, 0, 0.3, 0x22d3ee), x, 0.45, z); }
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { mk(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), M(0x78350f, 0, 1), 95 + dx, 1.6, 55 + dz); col(95 + dx, 55 + dz, 0.25); }
  box(5, 0.15, 5, M(0xb45309, 0, 0.8), 95, 3.3, 55); box(2.2, 0.15, 0.6, M(0x92400e, 0, 0.8), 95, 0.5, 56.5, true);

  // ---- EV MACHINERY PARKING SHADE (x 70..108, z -70..-44) with solar roof ----
  for (const [x, z] of [[72, -46], [106, -46], [72, -68], [106, -68], [89, -46], [89, -68]]) { mk(new THREE.CylinderGeometry(0.18, 0.2, 4.6, 10), M(0x6b7280, 0.6, 0.4), x, 2.3, z); col(x, z, 0.35); }
  const roofP = box(38, 0.2, 26, M(0x1e3a8a, 0.8, 0.25), 89, 4.7, -57); roofP.rotation.x = 0.08; shade.add(roofP);
  [[76, -52, 0], [89, -52, 0], [102, -52, 0], [82, -62, 0]].forEach(([x, z], i) => {
    const t = makeTractor(); t.scale.setScalar(1); t.position.set(x, 0, z); t.rotation.y = Math.PI / 2 * 0 + (i % 2 ? 0.3 : -0.2); g.add(t); col(x, z, 1.6, 1.4);
    const ch = makeProductModel('charger', 0x3b82f6, 1); ch.position.set(x + 2.6, 0, z); g.add(ch); col(x + 2.6, z, 0.5, 0.4);
  });
  label(8, 1.6, 'ইভি যন্ত্র পার্কিং', 'EV Machinery Parking · Solar Charging', 0xf97316, 89, 3.8, -44.5, 0, 1);

  // ---- fence, gate arch, entrance sign, experts ----
  const fenceTex = canvasTex(32, 32, (c) => { c.strokeStyle = 'rgba(71,85,105,0.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(32, 32); c.moveTo(32, 0); c.lineTo(0, 32); c.stroke(); });
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  const fence = (x0: number, x1: number, z0: number, z1: number) => {
    const alongX = x1 - x0 > z1 - z0, len = alongX ? x1 - x0 : z1 - z0, t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(len / 1.5, 1);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
    f.position.set((x0 + x1) / 2, 0.75, (z0 + z1) / 2); f.rotation.y = alongX ? 0 : Math.PI / 2; g.add(f);
    colliders.push({ minX: x0 - 0.1, maxX: x1 + 0.1, minZ: z0 - 0.1, maxZ: z1 + 0.1 });
    const n = Math.floor(len / 5), pts: number[][] = []; for (let i = 0; i <= n; i++) pts.push(alongX ? [x0 + (i * len) / n, 0.8, z0] : [x0, 0.8, z0 + (i * len) / n]);
    inst(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), M(0x475569, 0.5, 0.5), pts);
  };
  fence(FIELD.x0, FIELD.x1, FIELD.z0, FIELD.z0); fence(FIELD.x0, 98, FIELD.z1, FIELD.z1); fence(110, FIELD.x1, FIELD.z1, FIELD.z1); fence(FIELD.x1, FIELD.x1, FIELD.z0, FIELD.z1);
  fence(FIELD.x0, FIELD.x0, 40, FIELD.z1); fence(FIELD.x0, FIELD.x0, FIELD.z0, -40);
  for (const x of [98, 110]) { mk(new THREE.CylinderGeometry(0.25, 0.3, 5, 10), M(0x14532d, 0.3, 0.6), x, 2.5, FIELD.z1); col(x, FIELD.z1, 0.4); }
  box(13, 0.4, 0.4, M(0x14532d, 0.3, 0.6), 104, 5.2, FIELD.z1);
  label(11, 1.8, 'EV Agro গবেষণা মাঠ', 'Research Field — স্বাগতম', 0x22c55e, 104, 4.2, FIELD.z1 + 0.25, 0, 1);
  expert(64, 4.5, 1, 0, 0x16a34a); expert(166, 3.5, -1, 0, 0xd97706);

  // ---- teleport spots ----
  const S = (id: string, bn: string, x: number, z: number, yaw: number) => spots.push({ id, bn, pos: new THREE.Vector3(x, 0, z), yaw });
  S('gate', 'মাঠের প্রবেশদ্বার', 104, 84, 0); S('shade', 'শেড এলাকা (গবেষণা)', 73, 0, -Math.PI / 2); S('open', 'খোলা মাঠ', 156, -14, -Math.PI / 2);
  S('pond', 'পুকুর ও মৎস্য', 78, 40, Math.PI); S('parking', 'ইভি যন্ত্র পার্কিং', 89, -41, 0); S('weather', 'আবহাওয়া ও ড্রোন', 200, 36, 0);
  return { group: g, shade, colliders, pickables, blockers, spots };
}
