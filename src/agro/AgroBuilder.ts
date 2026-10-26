// EV Agro Research Institute - the whole institute as ONE THREE.Group (local origin = centre, y = 0 ground floor).
// 120 x 80 m, two floors around an open garden courtyard; lifts in the lobby; 16 themed rooms with experts.
// Place later: inst.group.position.set(x, groundY, z); inst.group.rotation.y = yaw;  (colliders stay in LOCAL space)
import * as THREE from 'three';
import { makePerson, makeProductModel, stdMat } from '../mall/ProductModels';
import { canvasTex, signMesh } from '../mall/MallBuilder';
import type { Rect } from '../mall/MallBuilder';
import { AgroPick, FOOT, ROOMS, RoomDef } from './AgroRooms';
import { buildField, FieldSpot } from './AgroField';
import { RoomCtx, facing, furnish, makeExpert, textSprite, towardDoor } from './AgroProps';

export type { AgroPick } from './AgroRooms';
export interface RoomInfo {
  def: RoomDef; viewPos: THREE.Vector3; yaw: number;   // viewPos = corridor point in front of the door (floor y excluded)
  experts: { pos: THREE.Vector3; object: THREE.Object3D }[]; // later: attach the Q&A / advisor feature here
}
export interface AgroBuild {
  group: THREE.Group; upper: THREE.Group; roof: THREE.Group; outdoor: THREE.Group;
  colliders: [Rect[], Rect[]]; pickables: [THREE.Object3D[], THREE.Object3D[]]; blockers: THREE.Object3D[];
  rooms: RoomInfo[]; fieldSpots: FieldSpot[]; floorHeight: number; lobby: { pos: THREE.Vector3; yaw: number };
  spawn: THREE.Vector3; spawnYaw: number; update(dt: number): void; dispose(): void;
}

export function buildAgro(): AgroBuild {
  const { hx, hz, yardX, yardZ, FH, wallH } = FOOT;
  const g = new THREE.Group(); g.name = 'EVAgroInstitute';
  const upper = new THREE.Group(), roof = new THREE.Group(); upper.add(roof); g.add(upper);
  const colliders: [Rect[], Rect[]] = [[], []], pickables: [THREE.Object3D[], THREE.Object3D[]] = [[], []];
  const blockers: THREE.Object3D[] = [], rooms: RoomInfo[] = [], spinners: THREE.Object3D[] = [], rotors: THREE.Object3D[] = [];
  const wallM = stdMat(0xf5f1e6, 0, 0.9), slabM = stdMat(0xe7e5e4, 0, 0.9), darkM = stdMat(0x14532d, 0.2, 0.6);
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9bd1f0, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide });
  const lightM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lv = (L: number) => (L === 0 ? g : upper);

  const slab = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, m: THREE.Material, L: 0 | 1 | -1, col = false, solid = true, parent?: THREE.Object3D) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    (parent ?? lv(Math.max(L, 0))).add(mesh);
    if (col && L >= 0) colliders[L as 0 | 1].push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
    if (solid) blockers.push(mesh);
    return mesh;
  };
  const plane = (w: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D, rx = -Math.PI / 2) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = rx; p.position.set(x, y, z); parent.add(p); return p;
  };
  const tile = canvasTex(128, 128, (c) => { c.fillStyle = '#e7e5e4'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#d6d3d1'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64); });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(hx * 2 / 3, hz * 2 / 3);
  const tileM = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.3 });

  // ---- floors / ceilings (ring around the courtyard) ----
  const ring = (y0: number, y1: number, m: THREE.Material, parent: THREE.Object3D) => {
    slab(-hx, hx, -hz, -yardZ, y0, y1, m, -1, false, false, parent); slab(-hx, hx, yardZ, hz, y0, y1, m, -1, false, false, parent);
    slab(-hx, -yardX, -yardZ, yardZ, y0, y1, m, -1, false, false, parent); slab(yardX, hx, -yardZ, yardZ, y0, y1, m, -1, false, false, parent);
  };
  ring(FH - 0.4, FH, slabM, upper); // first-floor slab (= ground ceiling)
  ring(2 * FH - 0.4, 2 * FH, slabM, roof);
  plane(hx * 2, hz * 2, 0, 0.005, 0, tileM, g); // ground floor (the yard garden lies on top of it)
  const f1 = stdMat(0xe7e5e4, 0.1, 0.35);
  plane(hx * 2, hz - yardZ, 0, FH + 0.005, -(hz + yardZ) / 2, f1, upper); plane(hx * 2, hz - yardZ, 0, FH + 0.005, (hz + yardZ) / 2, f1, upper);
  plane(hx - yardX, yardZ * 2, -(hx + yardX) / 2, FH + 0.005, 0, f1, upper); plane(hx - yardX, yardZ * 2, (hx + yardX) / 2, FH + 0.005, 0, f1, upper);
  // lights under each ceiling
  for (const L of [0, 1] as const) for (const z of [-23, 23]) plane(hx * 1.6, 0.4, 0, L * FH + wallH - 0.02, z, lightM, lv(L), Math.PI / 2);

  // ---- courtyard (ground level, open sky) ----
  const yard = new THREE.Group(); g.add(yard);
  plane(yardX * 2, yardZ * 2, 0, 0.02, 0, stdMat(0x4d9a3a, 0, 1), yard);
  plane(yardX * 2, 4, 0, 0.03, 0, stdMat(0xd6d3d1, 0, 0.9), yard); plane(4, yardZ * 2, 0, 0.03, 0, stdMat(0xd6d3d1, 0, 0.9), yard);
  const fountain = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.7, 36), stdMat(0xa8a29e, 0.2, 0.7)); fb.position.y = 0.35; fountain.add(fb);
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.1, 36), new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })); fw.position.y = 0.68; fountain.add(fw);
  const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 14), stdMat(0xa8a29e, 0.2, 0.7)); fc.position.y = 1.5; fountain.add(fc);
  const emblem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: 0x22c55e, wireframe: true, emissive: 0x22c55e, emissiveIntensity: 0.6 }));
  emblem.position.y = 3.4; fountain.add(emblem); spinners.push(emblem); yard.add(fountain);
  colliders[0].push({ minX: -3.8, maxX: 3.8, minZ: -3.8, maxZ: 3.8 });
  const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 22; i++) { // trees
    const x = (rng() * 2 - 1) * (yardX - 3), z = (rng() * 2 - 1) * (yardZ - 3);
    if (Math.abs(x) < 4.5 || Math.abs(z) < 3.5 || (Math.abs(Math.abs(x) - 22) < 8.5 && Math.abs(Math.abs(z) - 11) < 5)) continue;
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 8), stdMat(0x78350f, 0, 1)); tr.position.y = 1.2; t.add(tr);
    const cr = new THREE.Mesh(new THREE.SphereGeometry(1.5 + rng(), 12, 10), stdMat(rng() > 0.5 ? 0x15803d : 0x22c55e, 0, 0.9)); cr.position.y = 3.4; t.add(cr);
    t.position.set(x, 0, z); yard.add(t); colliders[0].push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  // demo crop plots in the yard corners (paddy, vegetables, wheat)
  [[-22, -11, 0x84cc16], [22, -11, 0x65a30d], [-22, 11, 0xca8a04], [22, 11, 0x22c55e]].forEach(([px, pz, col]) => {
    plane(14, 7, px, 0.04, pz, stdMat(0x5b3a1e, 0, 1), yard);
    const pts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.6, 5), stdMat(col, 0, 0.9), 20 * 9), o = new THREE.Object3D();
    let n = 0; for (let ix = 0; ix < 20; ix++) for (let iz = 0; iz < 9; iz++) { o.position.set(px - 6.6 + ix * 0.7, 0.34, pz - 3 + iz * 0.75); o.updateMatrix(); pts.setMatrixAt(n++, o.matrix); }
    yard.add(pts);
  });
  // ground-floor columns along the inner edge + first-floor glass railing
  for (let x = -yardX; x <= yardX; x += 10) for (const z of [-yardZ, yardZ]) { slab(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, wallH, wallM, 0, true); }
  for (let z = -yardZ + 10; z < yardZ; z += 10) for (const x of [-yardX, yardX]) slab(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, wallH, wallM, 0, true);
  const rail = (x0: number, x1: number, z0: number, z1: number) => slab(x0, x1, z0, z1, FH, FH + 1.1, glassM, 1, true, false);
  rail(-yardX - 0.1, yardX + 0.1, -yardZ - 0.1, -yardZ); rail(-yardX - 0.1, yardX + 0.1, yardZ, yardZ + 0.1);
  rail(-yardX - 0.1, -yardX, -yardZ, yardZ); rail(yardX, yardX + 0.1, -yardZ, yardZ);

  // ---- rooms ----
  const expertColors = [0x2563eb, 0x16a34a, 0xdb2777, 0xd97706];
  for (const def of ROOMS) {
    const L = def.level, y0 = L * FH, par = lv(L), T = 0.3;
    const { x0, x1, z0, z1 } = def, pz = def.face.endsWith('z'), pos = def.face[0] === '+';
    const dwEdge = pz ? (pos ? z1 : z0) : (pos ? x1 : x0), sgn = pos ? -1 : 1; // inward direction
    const dh = 2.8, half = 2.5;
    // four walls (inset by T); the door wall gets a gap + header
    const wall = (a0: number, a1: number, b0: number, b1: number, yA = 0, yB = wallH, col = true) => slab(a0, a1, b0, b1, y0 + yA, y0 + yB, wallM, L, col);
    const wallsAlong = (fixed0: number, fixed1: number, lo: number, hi: number, alongX: boolean, door: number | null) => {
      const seg = (u0: number, u1: number, yA: number, yB: number, col: boolean) => alongX ? wall(u0, u1, fixed0, fixed1, yA, yB, col) : wall(fixed0, fixed1, u0, u1, yA, yB, col);
      if (door === null) { seg(lo, hi, 0, wallH, true); return; }
      seg(lo, door - half, 0, wallH, true); seg(door + half, hi, 0, wallH, true); seg(door - half, door + half, dh, wallH, false);
    };
    const dz = pz ? def.doorAt : null, dx = pz ? null : def.doorAt;
    wallsAlong(z0, z0 + T, x0, x1, true, pz && !pos ? dz : null);  // wall on the z0 side
    wallsAlong(z1 - T, z1, x0, x1, true, pz && pos ? dz : null);   // wall on the z1 side
    wallsAlong(x0, x0 + T, z0, z1, false, !pz && !pos ? dx : null);
    wallsAlong(x1 - T, x1, z0, z1, false, !pz && pos ? dx : (!pz && def.backDoor !== undefined ? def.backDoor : null));
    // floor tint + ceiling lights
    const tint = new THREE.Color(def.color).lerp(new THREE.Color(0xffffff), 0.75);
    plane(x1 - x0 - 0.6, z1 - z0 - 0.6, (x0 + x1) / 2, y0 + 0.01, (z0 + z1) / 2, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5 }), par);
    for (let k = 0; k < 3; k++) { const f = (k + 1) / 4; if (pz) plane(x1 - x0 - 4, 0.4, (x0 + x1) / 2, y0 + wallH - 0.03, z0 + (z1 - z0) * f, lightM, par, Math.PI / 2); else plane(0.4, z1 - z0 - 4, x0 + (x1 - x0) * f, y0 + wallH - 0.03, (z0 + z1) / 2, lightM, par, Math.PI / 2); }
    // sign on the corridor side of the door
    const sign = signMesh(6, 1.5, def.bn, def.en, def.color);
    const [nx, nz] = pz ? [0, pos ? 1 : -1] : [pos ? 1 : -1, 0];
    sign.position.set(pz ? def.doorAt : dwEdge + nx * 0.02, y0 + 3.7, pz ? dwEdge + nz * 0.02 : def.doorAt); facing(sign, nx, nz); par.add(sign);
    // topics plaque beside the door (what this room can tell you)
    const off = def.doorAt > 40 ? -4.3 : 4.3, pl = signMesh(3.8, 0.95, def.topics.join(' · '), 'বিষয়সমূহ', def.color);
    pl.position.set(pz ? def.doorAt + off : dwEdge + nx * 0.02, y0 + 1.9, pz ? dwEdge + nz * 0.02 : def.doorAt + off); facing(pl, nx, nz); par.add(pl);
    // exterior windows on outer walls
    const win = (u: number, len: number, fixed: number, ox: number, oz: number, alongX: boolean) => {
      const m = plane(len, 1.4, alongX ? u : fixed, y0 + 2.4, alongX ? fixed : u, new THREE.MeshStandardMaterial({ color: 0x7dd3fc, metalness: 0.6, roughness: 0.1 }), par, 0);
      facing(m, ox, oz);
    };
    if (z0 === -hz) { win((x0 + x1) / 2, x1 - x0 - 4, z0 - 0.02, 0, -1, true); win((x0 + x1) / 2, x1 - x0 - 4, z0 + T + 0.02, 0, 1, true); }
    if (z1 === hz) { win((x0 + x1) / 2, x1 - x0 - 4, z1 + 0.02, 0, 1, true); win((x0 + x1) / 2, x1 - x0 - 4, z1 - T - 0.02, 0, -1, true); }
    if (x0 === -hx) { win((z0 + z1) / 2, z1 - z0 - 6, x0 - 0.02, -1, 0, false); win((z0 + z1) / 2, z1 - z0 - 6, x0 + T + 0.02, 1, 0, false); }
    if (x1 === hx && def.backDoor === undefined) { win((z0 + z1) / 2, z1 - z0 - 6, x1 + 0.02, 1, 0, false); win((z0 + z1) / 2, z1 - z0 - 6, x1 - T - 0.02, -1, 0, false); }

    if (def.backDoor !== undefined) { // outside sign above the back door that leads to the research field
      const bs = signMesh(5, 1.2, 'গবেষণা মাঠ →', 'Research Field', 0x22c55e); bs.position.set(x1 + 0.03, y0 + 3.7, def.backDoor); facing(bs, 1, 0); par.add(bs);
    }
    // furnish (room-local frame)
    const D = pz ? z1 - z0 - T : x1 - x0 - T;
    const info: RoomInfo = { def, experts: [], viewPos: new THREE.Vector3(), yaw: 0 };
    const grp = new THREE.Group(); par.add(grp);
    const ctx: RoomCtx = {
      g: grp, y0, axis: pz ? 'x' : 'z', a0: (pz ? x0 : z0) + 1, a1: (pz ? x1 : z1) - 1, D, dw: dwEdge, sgn, doorA: def.doorAt, color: def.color,
      collide: (a, b, c2, d) => colliders[L].push({ minX: a, maxX: b, minZ: c2, maxZ: d }),
      expert: (a, t) => {
        const e = makeExpert(expertColors[info.experts.length % 4]); const [tx, tz] = towardDoor(ctx);
        const p = ctx.axis === 'x' ? new THREE.Vector3(a, y0, dwEdge + sgn * t) : new THREE.Vector3(dwEdge + sgn * t, y0, a);
        e.position.copy(p); facing(e, tx, tz);
        const tag = textSprite('পরামর্শ নিন', def.color, 2.0); tag.position.y = 2.25; e.add(tag);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1; e.add(hit);
        e.userData.pick = { title: `${def.bn} — বিশেষজ্ঞ`, sub: 'প্রশ্ন করুন (ফিচার পরে আসছে)', url: '', action: 'ask', roomId: def.id } satisfies AgroPick;
        grp.add(e); pickables[L].push(e); info.experts.push({ pos: p, object: e });
      },
    };
    furnish(def.theme, ctx);
    // back-wall title banner
    const ban = signMesh(10, 1.0, def.bn, def.en, def.color), [bnx, bnz] = towardDoor(ctx);
    const bp = ctx.axis === 'x' ? [(ctx.a0 + ctx.a1 - 8) / 2, dwEdge + sgn * (D - 0.03)] : [dwEdge + sgn * (D - 0.03), (ctx.a0 + ctx.a1 - 8) / 2];
    ban.position.set(bp[0], y0 + 3.9, bp[1]); facing(ban, bnx, bnz); par.add(ban);
    // where "teleport to room" puts you: in the corridor in front of the door, looking in
    const vx = pz ? def.doorAt : dwEdge + nx * 3, vz = pz ? dwEdge + nz * 3 : def.doorAt;
    info.viewPos.set(vx, 0, vz); info.yaw = Math.atan2(nx, nz); // looks into the room
    rooms.push(info);
  }

  // ---- lobby (ground, x -15..15, z 26..40) + mezzanine lounge above; lifts; reception ----
  for (const L of [0, 1] as const) {
    const y0 = L * FH, par = lv(L);
    const front = (x0: number, x1: number, yA: number, yB: number, col: boolean) => slab(x0, x1, hz - 0.3, hz, y0 + yA, y0 + yB, glassM, L, col);
    if (L === 0) { front(-15, -6, 0, wallH, true); front(6, 15, 0, wallH, true); front(-6, 6, 3.4, wallH, false); } else front(-15, 15, 0, wallH, true);
    plane(30, 14, 0, y0 + 0.01, 33, stdMat(L ? 0xd9f99d : 0xbbf7d0, 0, 0.4), par);
    for (const x of [-11, 11]) { // lift cab
      const cab = new THREE.Group(); cab.position.set(x, y0, 38);
      const box = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz2: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz2); cab.add(b); blockers.push(b); return b; };
      box(3, 3.6, 0.2, darkM, 0, 1.8, 1.4); box(0.2, 3.6, 3, darkM, -1.4, 1.8, 0); box(0.2, 3.6, 3, darkM, 1.4, 1.8, 0); box(3, 0.3, 3, darkM, 0, 3.75, 0);
      box(1.3, 2.8, 0.08, stdMat(0xcbd5e1, 0.9, 0.3), -0.7, 1.4, -1.45); box(1.3, 2.8, 0.08, stdMat(0xcbd5e1, 0.9, 0.3), 0.7, 1.4, -1.45);
      box(0.5, 2.2, 0.2, darkM, 1.95, 1.1, -1.35);
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.12), stdMat(0x22c55e, 0, 0.3, 0x16a34a)); btn.position.set(1.95, 1.3, -1.45);
      btn.userData.pick = { title: 'লিফট', sub: L ? 'নিচের তলায় যান' : 'দোতলায় যান', url: '', action: 'lift' } satisfies AgroPick; cab.add(btn); pickables[L].push(btn);
      par.add(cab); colliders[L].push({ minX: x - 1.5, maxX: x + 1.5, minZ: 36.5, maxZ: 39.5 });
    }
  }
  // reception desk + welcome board (ground lobby)
  slab(-4, 4, 30, 31.2, 0, 1.1, stdMat(0x166534, 0.1, 0.6), 0, true);
  const welcome = signMesh(9, 2, 'স্বাগতম — EV Agro', 'কৃষি গবেষণা ইনস্টিটিউট', 0x22c55e); welcome.position.set(0, 2.6, hz - 0.35); facing(welcome, 0, -1); g.add(welcome);
  const lounge = signMesh(9, 2, 'মেজানাইন লাউঞ্জ', 'লিফট: ১১ মিটার ডানে/বামে', 0x22c55e); lounge.position.set(0, FH + 2.6, hz - 0.35); facing(lounge, 0, -1); upper.add(lounge);

  // lobby / lounge seating, planters, floor emblem, receptionist
  const wood = stdMat(0x92400e, 0, 0.8), leaf = stdMat(0x22c55e, 0, 0.9);
  for (const L of [0, 1] as const) {
    const y0 = L * FH, par = lv(L);
    const em = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.7, 48), new THREE.MeshBasicMaterial({ color: 0x16a34a })); em.rotation.x = -Math.PI / 2; em.position.set(0, y0 + 0.02, 33); par.add(em);
    for (const [x, z] of [[-6, 36.5], [6, 36.5], [-6, 28], [6, 28]]) {
      const b = new THREE.Group(); b.position.set(x, y0, z);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.7), wood); top.position.y = 0.5; b.add(top);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.08), wood); back.position.set(0, 0.8, z > 32 ? 0.3 : -0.3); b.add(back);
      par.add(b); colliders[L].push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 0.4, maxZ: z + 0.4 });
    }
    for (const [x, z] of [[-13.5, 28], [13.5, 28], [-13.5, 35], [13.5, 35]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.7, 16), stdMat(0xb45309, 0, 0.8)); pot.position.set(x, y0 + 0.35, z); par.add(pot);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), leaf); bush.position.set(x, y0 + 1.3, z); par.add(bush);
      colliders[L].push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
  }
  const rec = makePerson(0x16a34a); rec.position.set(0, 0, 29.2); // behind the desk, facing the entrance (+z)
  const rh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.9), new THREE.MeshBasicMaterial({ visible: false })); rh.position.y = 1; rec.add(rh);
  const rt = textSprite('রিসেপশন', 0x16a34a, 2.0); rt.position.y = 2.25; rec.add(rt);
  rec.userData.pick = { title: 'রিসেপশন — স্বাগতম!', sub: 'কোন বিভাগে যেতে চান? বাম মেনু থেকে রুম বেছে নিন', url: '', action: 'ask', roomId: 'reception' } satisfies AgroPick;
  g.add(rec); pickables[0].push(rec);

  // ---- outdoor: driveway, EV parking with chargers, demo farm, wind turbine, flags, trees ----
  const outdoor = new THREE.Group(); outdoor.name = 'AgroOutdoor'; g.add(outdoor);
  const asphalt = stdMat(0x374151, 0, 0.95), white = stdMat(0xf8fafc, 0, 0.8);
  plane(14, 60, 0, 0.008, hz + 30, asphalt, outdoor); plane(30, 24, 40, 0.008, hz + 16, asphalt, outdoor);
  const lineGeo = new THREE.BoxGeometry(0.12, 0.01, 4.6), lines = new THREE.InstancedMesh(lineGeo, white, 24), lo = new THREE.Object3D(); let ln = 0;
  for (let i = 0; i < 12; i++) for (const z of [hz + 9.5, hz + 21.5]) { lo.position.set(26.5 + i * 2.4, 0.02, z); lo.updateMatrix(); lines.setMatrixAt(ln++, lo.matrix); }
  outdoor.add(lines);
  for (let i = 0; i < 5; i++) { // chargers on the middle island + parked EVs
    const ch = makeProductModel('charger', 0x3b82f6, 0.9); ch.position.set(29 + i * 5.5, 0, hz + 15.5); outdoor.add(ch);
    colliders[0].push({ minX: 28.5 + i * 5.5, maxX: 29.5 + i * 5.5, minZ: hz + 15, maxZ: hz + 16 });
    if (i % 2 === 0) { const car = makeProductModel('car', [0x22d3ee, 0xef4444, 0x16a34a][i / 2], 0.9); car.position.set(28.5 + i * 5.5 + 1.2, 0, hz + 12); car.rotation.y = Math.PI / 2; outdoor.add(car); colliders[0].push({ minX: 27.5 + i * 5.5, maxX: 31 + i * 5.5, minZ: hz + 9.5, maxZ: hz + 14.5 }); }
  }
  plane(40, 24, -42, 0.008, hz + 20, stdMat(0x5b3a1e, 0, 1), outdoor); // demo farm
  const farm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.6, 5), stdMat(0xffffff, 0, 0.9), 55 * 28), fo = new THREE.Object3D(), fc2 = new THREE.Color(); let fn = 0;
  for (let ix = 0; ix < 55; ix++) for (let iz = 0; iz < 28; iz++) { fo.position.set(-61 + ix * 0.72, 0.3, hz + 9 + iz * 0.8); fo.updateMatrix(); farm.setMatrixAt(fn, fo.matrix); farm.setColorAt(fn++, fc2.setHex(iz < 14 ? 0x84cc16 : 0xca8a04)); }
  outdoor.add(farm);
  const fsign = signMesh(8, 1.6, 'প্রদর্শনী খামার', 'Demo Farm — ধান ও গম', 0x84cc16); fsign.position.set(-42, 1.4, hz + 7.5); facing(fsign, 0, -1); outdoor.add(fsign);
  const tower = new THREE.Group(); tower.position.set(76, 0, 30); outdoor.add(tower); // wind turbine
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 20, 12), white); mast.position.y = 10; tower.add(mast);
  const hub = new THREE.Group(); hub.position.set(0, 20.3, 0.9); tower.add(hub); rotors.push(hub);
  for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.08), white); bl.position.y = 3.5; const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI * 2) / 3; arm.add(bl); hub.add(arm); }
  colliders[0].push({ minX: 75.3, maxX: 76.7, minZ: 29.3, maxZ: 30.7 });
  for (const x of [-8, 8]) { // flag poles at the entrance
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), stdMat(0xcbd5e1, 0.8, 0.3)); pole.position.set(x, 3.5, hz + 9); outdoor.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshBasicMaterial({ color: 0x16a34a, side: THREE.DoubleSide })); flag.position.set(x + 1.05, 6.2, hz + 9); outdoor.add(flag);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 8), stdMat(0x78350f, 0, 1), 20), crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 12, 10), stdMat(0x15803d, 0, 0.9), 20), to = new THREE.Object3D(); let tn = 0;
  for (let k = 0; k < 10; k++) for (const x of [-11, 11]) {
    const z = hz + 8 + k * 6; to.position.set(x, 1.2, z); to.updateMatrix(); trunks.setMatrixAt(tn, to.matrix);
    to.position.y = 3.6; to.updateMatrix(); crowns.setMatrixAt(tn++, to.matrix);
    colliders[0].push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  outdoor.add(trunks, crowns);

  // ---- research field (open shade houses etc.) east of the building ----
  const field = buildField();
  g.add(field.group); roof.add(field.shade);
  colliders[0].push(...field.colliders); pickables[0].push(...field.pickables); blockers.push(...field.blockers);

  // ---- facade, canopy, rooftop sign, rooftop solar ----
  const big = signMesh(30, 3.4, 'EV AGRO RESEARCH INSTITUTE', 'ইভি এগ্রো কৃষি গবেষণা ইনস্টিটিউট', 0x22c55e);
  slab(-16, 16, hz - 0.5, hz - 0.1, 2 * FH, 2 * FH + 3.8, darkM, -1, false, false, roof); big.position.set(0, 2 * FH + 1.9, hz - 0.08); roof.add(big);
  slab(-9, 9, hz, hz + 7, 3.7, 4.0, stdMat(0x22c55e, 0.3, 0.4), -1, false, true);
  plane(14, 10, 0, 0.012, hz + 6, stdMat(0xd6d3d1, 0, 0.9), g);
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.08, 1.6), stdMat(0x1e3a8a, 0.8, 0.25), 60), po = new THREE.Object3D();
  let pn = 0; for (let ix = 0; ix < 20; ix++) for (const z of [-34, -30, -26]) { po.position.set(-56 + ix * 5.6, 2 * FH + 0.6, z + 0.5); po.rotation.x = -0.35; po.updateMatrix(); panels.setMatrixAt(pn++, po.matrix); }
  roof.add(panels);

  return {
    group: g, upper, roof, outdoor, colliders, pickables, blockers, rooms, fieldSpots: field.spots, floorHeight: FH,
    lobby: { pos: new THREE.Vector3(0, 0, 35.5), yaw: 0 },
    spawn: new THREE.Vector3(0, 0, hz + 22), spawnYaw: 0,
    update(dt) { for (const s of spinners) s.rotation.y += dt * 0.5; for (const r of rotors) r.rotation.z -= dt * 1.2; },
    dispose() { g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); },
  };
}
