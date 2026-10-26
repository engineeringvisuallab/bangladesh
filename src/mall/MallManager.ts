// City Mall (2 floors, glass building that follows the roads) inside the open world.
//  - the building (MallBuilder) stands at MALL_POS on a flat pad (terrain.mall), always there when the game starts
//  - Rapier colliders for walls / shelves / pedestals / roof (the player, cars and helicopters cannot go through)
//  - shopping: walk in, look at a product (crosshair) -> left click or O opens its page on the live shop in a NEW TAB
import * as THREE from 'three';
import type { Camera } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { UI_FONT } from '../ui/theme';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { InputManager } from '../input/InputManager';
import { buildMall, MALL, type MallBuild, type PickInfo } from './MallBuilder';
import { MALL_POLY } from './MallSite';
import type { Catalog } from './MallCatalog';
import { MallInteraction } from './MallInteraction';

export interface MallDeps {
  root: THREE.Object3D;          // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  camera: Camera;
  input: InputManager;
  dom: HTMLElement;              // the canvas
  container: HTMLElement;
  catalog: Catalog;
  /** World position of the player on foot (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Is the player walking (not driving / flying / sailing)? Shopping is only for walkers. */
  onFoot: () => boolean;
}

const CSS = `
.evmall-tip{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);display:none;z-index:50;
  background:rgba(15,23,42,.92);border:2px solid #22d3ee;border-radius:14px;padding:10px 20px;text-align:center;color:#fff;
  font-family:${UI_FONT};pointer-events:auto;cursor:pointer;max-width:80vw}
.evmall-tip b{display:block;font-size:18px}
.evmall-tip i{display:block;color:#22d3ee;font-style:normal;font-size:21px;font-weight:700}
.evmall-tip small{display:block;opacity:.85;font-size:12px;margin-top:2px}
.evmall-banner{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:50;display:flex;gap:10px;align-items:center;
  background:rgba(15,23,42,.88);border:2px solid #22d3ee;border-radius:16px;padding:10px 18px;color:#fff;font-family:${UI_FONT};
  font-size:15px;pointer-events:none;transition:opacity 1.2s;box-shadow:0 4px 18px rgba(0,0,0,.35)}
.evmall-banner b{color:#22d3ee}
.evmall-help{position:fixed;left:12px;bottom:12px;z-index:50;display:none;background:rgba(15,23,42,.72);color:#fff;border-radius:10px;
  padding:6px 10px;font:12px ${UI_FONT};pointer-events:none}
`;

export class MallManager {
  readonly build: MallBuild;
  readonly group: THREE.Group;
  /** True while the player stands inside the building (guns are put away, shopping is on). */
  inside = false;
  private body: RAPIER.RigidBody;
  private inter: MallInteraction;
  private tip = document.createElement('div');
  private help = document.createElement('div');
  private banner: HTMLElement | null = document.createElement('div');
  private bannerTimer = 0;
  private near = false;
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private plaza: THREE.Mesh;

  constructor(private d: MallDeps) {
    const site = d.terrain.mall;
    this.build = buildMall(d.catalog);
    this.group = this.build.group;
    this.group.position.set(site.x, site.floorY, site.z);
    this.group.rotation.y = site.yaw;
    d.root.add(this.group);

    // paved plaza: the whole level plot (it follows the road edges), the building stands on it
    const shape = new THREE.Shape(MALL_POLY.map(([x, z]) => new THREE.Vector2(x, -z)));
    this.plaza = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: 0xb4bcc6, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.plaza.rotation.x = -Math.PI / 2;
    this.plaza.position.y = site.floorY - 0.015;
    d.root.add(this.plaza);

    this.body = this.createColliders();

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.tip.className = 'evmall-tip';
    this.tip.addEventListener('click', (e) => { e.stopPropagation(); this.inter.click(); });
    d.container.appendChild(this.tip);
    this.help.className = 'evmall-help';
    this.help.innerHTML = 'পণ্যের দিকে ক্রসহেয়ার রাখুন · <b>বাম ক্লিক / O</b> = অর্ডার পেজ (নতুন ট্যাবে) · জোনের নাম ওপরে ঝুলছে · বন্দুক এখানে বন্ধ';
    d.container.appendChild(this.help);

    this.inter = new MallInteraction(d.camera, d.dom, this.build.pickables, (p) => this.onHover(p));
    this.inter.blockers = this.build.blockers;
    this.inter.maxDist = 20; // the camera is ~6 m behind the player; `accept` below keeps picks within reach of the player
    this.inter.accept = (hit) => {
      this.d.playerWorld(this.p);
      this.q.copy(hit.point);
      this.d.origin.toWorld(this.q, this.q);
      return Math.hypot(this.q.x - this.p.x, this.q.z - this.p.z) <= 9 && Math.abs(this.q.y - this.p.y) <= 5; // same floor only
    };

    // start-of-game hint (the mall is right there, in front of the spawn point)
    const b = this.banner!;
    b.className = 'evmall-banner';
    b.innerHTML = '<span style="font-size:22px">🛍️</span><span><b>City Mall</b> সামনেই — একটা বিশাল খোলা গ্লাস হল, পণ্যগুলো জোন অনুযায়ী সাজানো: পশ্চিমে খাবার, পূর্বে ফ্যাশন!</span>';
    d.container.appendChild(b);
    this.bannerTimer = 14;
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.mall;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(site.x - o.x, site.floorY, site.z - o.z)
        .setRotation({ x: 0, y: Math.sin(site.yaw / 2), z: 0, w: Math.cos(site.yaw / 2) }),
    );
    // roof, billboards (the hall is empty inside), shelves, pedestals, railings (each has its own height range)
    for (const s of this.build.solids) {
      world.createCollider(
        R.ColliderDesc.cuboid((s.maxX - s.minX) / 2, (s.maxY - s.minY) / 2, (s.maxZ - s.minZ) / 2)
          .setTranslation((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2).setFriction(0.4),
        body,
      );
    }
    // ramps between the floors (walkable slopes) + their side railings
    for (const r of this.build.ramps) {
      const dx = r.x1 - r.x0, dy = r.y1 - r.y0, len = Math.hypot(dx, dy), ang = Math.atan(dy / dx); // in (-90, 90) deg: the box never turns upside down
      const cx = (r.x0 + r.x1) / 2 + Math.sin(ang) * (r.thick / 2), cy = (r.y0 + r.y1) / 2 - Math.cos(ang) * (r.thick / 2);
      world.createCollider(
        R.ColliderDesc.cuboid(len / 2, r.thick / 2, r.width / 2).setTranslation(cx, cy, r.zc)
          .setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }).setFriction(1),
        body,
      );
    }
    for (const r of this.build.rampRails) {
      world.createCollider(
        R.ColliderDesc.cuboid(r.hx, r.hy, r.hz).setTranslation(r.cx, r.cy, r.cz).setRotation({ x: 0, y: 0, z: Math.sin(r.rotZ / 2), w: Math.cos(r.rotZ / 2) }),
        body,
      );
    }
    // the glass curtain wall that follows the roads (turned boxes)
    for (const o of this.build.obbs) {
      world.createCollider(
        R.ColliderDesc.cuboid(o.hx, (o.y1 - o.y0) / 2, o.hz).setTranslation(o.cx, (o.y0 + o.y1) / 2, o.cz)
          .setRotation({ x: 0, y: Math.sin(o.rot / 2), z: 0, w: Math.cos(o.rot / 2) }).setFriction(0.2),
        body,
      );
    }
    // floors + roofs of the glass concourse around the shopping block (not rectangles: triangle meshes)
    for (const m of this.build.meshSolids) world.createCollider(R.ColliderDesc.trimesh(m.vertices, m.indices).setFriction(1), body);
    // floor slab (top face = the floor tiles): the terrain under the mall is 3 cm lower, this makes walking perfectly smooth
    world.createCollider(R.ColliderDesc.cuboid(MALL.W / 2 + 0.5, 0.5, MALL.D / 2 + 0.5).setTranslation(0, -0.5, 0).setFriction(1), body);
    return body;
  }

  private onHover(p: PickInfo | null): void {
    if (!p) { this.tip.style.display = 'none'; return; }
    this.tip.style.display = 'block';
    this.tip.innerHTML = p.url
      ? `<b>${p.title}</b><i>${p.sub}</i><small>বাম ক্লিক বা O চাপুন → অর্ডার পেজ নতুন ট্যাবে খুলবে</small>`
      : `<b>${p.title}</b><small>${p.sub}</small>`;
  }

  /** Minimap marker position. */
  get position(): { x: number; z: number } {
    const s = this.d.terrain.mall;
    return { x: s.x, z: s.z };
  }

  /** Once per rendered frame. */
  update(dt: number): void {
    const site = this.d.terrain.mall;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    const walking = this.d.onFoot();
    const was = this.inside;
    this.inside = walking && site.inside(this.p.x, this.p.z, -0.2) && this.p.y > site.floorY - 2 && this.p.y < site.floorY + MALL.H;

    // the whole building is cheap to keep, but its animation only runs when it can be seen
    this.group.visible = this.plaza.visible = dist < 900;
    this.near = dist < 180;
    // 40 shops are a lot of meshes: show only the floor the player is on (+- 1) when inside, the ground floor (seen through the doors) when close, nothing when far
    const pf = Math.max(0, Math.min(MALL.floors - 1, Math.floor((this.p.y - site.floorY) / MALL.FH)));
    this.build.floors.forEach((fg, i) => { fg.visible = this.inside ? Math.abs(i - pf) <= 1 : i === 0 && dist < 200; });
    if (this.near) this.build.update(dt);
    this.build.roof.visible = true;

    if (this.inside !== was) this.help.style.display = this.inside ? 'block' : 'none';
    if (this.inside && this.banner) this.bannerTimer = Math.min(this.bannerTimer, 0.01);

    if (this.banner) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.style.opacity = '0';
        const b = this.banner;
        this.banner = null;
        window.setTimeout(() => b.remove(), 1500);
      }
    }

    // shopping: only inside the building and only on foot
    if (this.inside) {
      this.inter.update();
      if (this.inter.hovered && (this.d.input.wasPressed('Mouse0') || this.d.input.wasPressed('KeyO'))) this.inter.click();
    } else if (this.inter.hovered) {
      this.inter.clear();
    }
  }

  dispose(): void {
    const world = this.d.physics.world;
    world.removeRigidBody(this.body);
    this.d.root.remove(this.group);
    this.d.root.remove(this.plaza);
    this.plaza.geometry.dispose();
    (this.plaza.material as THREE.Material).dispose();
    this.build.dispose();
    this.tip.remove();
    this.help.remove();
    this.banner?.remove();
  }
}
