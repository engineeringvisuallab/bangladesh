// EV Agro Research Institute inside the open world (west farmland).
//  - the institute (AgroBuilder: 120 x 80 m, two floors around a garden courtyard, 16 themed rooms) + the research field (shade houses, plots, pond)
//    stand at AGRO_POS on a flat pad (terrain.agro), always there when the game starts
//  - Rapier colliders for every wall / counter / pole (the 2-D rectangles of the module), the first-floor slab and the roof:
//    the player, cars and helicopters cannot go through
//  - the green lift button in the lobby takes the player to the other floor; the crosshair + left click / O talks to the experts / reads the signs
import * as THREE from 'three';
import type { Camera } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { UI_FONT } from '../ui/theme';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { InputManager } from '../input/InputManager';
import { MallInteraction } from '../mall/MallInteraction';
import type { PickInfo, Rect } from '../mall/MallBuilder';
import { buildAgro, type AgroBuild } from './AgroBuilder';
import { FIELD_INFO, FOOT, type AgroPick, type RoomDef } from './AgroRooms';

export interface AgroDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  camera: Camera;
  input: InputManager;
  dom: HTMLElement; // the canvas
  container: HTMLElement;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Teleport the player (capsule centre, world coordinates): used by the lift. */
  teleport: (world: THREE.Vector3) => void;
  /** Is the player walking (not driving / flying / sailing)? */
  onFoot: () => boolean;
}

const CSS = `
.evagro-tip{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);display:none;z-index:50;
  background:rgba(15,23,42,.92);border:2px solid #4ade80;border-radius:14px;padding:10px 20px;text-align:center;color:#fff;
  font-family:${UI_FONT};pointer-events:auto;cursor:pointer;max-width:80vw}
.evagro-tip b{display:block;font-size:18px}
.evagro-tip small{display:block;opacity:.85;font-size:12px;margin-top:2px}
.evagro-toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);display:none;z-index:51;background:#166534;color:#fff;
  border-radius:12px;padding:10px 18px;max-width:420px;text-align:center;font-family:${UI_FONT};font-size:14px;pointer-events:none}
.evagro-help{position:fixed;left:12px;bottom:12px;z-index:50;display:none;background:rgba(15,23,42,.72);color:#fff;border-radius:10px;
  padding:6px 10px;font:12px ${UI_FONT};pointer-events:none}
.evagro-fade{position:fixed;inset:0;z-index:60;background:#000;opacity:0;transition:opacity .25s;pointer-events:none}
`;

const SHOW_DIST = 1400; // the institute is drawn within this distance (it is 300 m wide)
const ANIM_DIST = 300; // the fountain emblem / rotors turn within this distance
const REACH = 9; // a sign / expert / button must be this close to the player (the camera sits behind him)

export class AgroManager {
  readonly build: AgroBuild;
  readonly group: THREE.Group;
  /** True while the player walks inside the institute building (guns are put away). */
  inside = false;
  /** 0 = ground floor, 1 = first floor (only inside the building). */
  level: 0 | 1 = 0;
  /** The room the player stands in (null in the corridors, the lobby and outdoors). */
  room: RoomDef | null = null;
  private body: RAPIER.RigidBody;
  private inter: MallInteraction;
  private tip = document.createElement('div');
  private toast = document.createElement('div');
  private help = document.createElement('div');
  private fade = document.createElement('div');
  private style = document.createElement('style');
  private toastTimer = 0;
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private lifting = false;

  constructor(private d: AgroDeps) {
    const site = d.terrain.agro;
    this.build = buildAgro();
    this.group = this.build.group;
    this.group.position.set(site.x, site.floorY, site.z);
    this.group.rotation.y = 0;
    d.root.add(this.group);
    this.body = this.createColliders();

    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.tip.className = 'evagro-tip';
    this.tip.addEventListener('click', (e) => { e.stopPropagation(); this.inter.click(); });
    d.container.appendChild(this.tip);
    this.toast.className = 'evagro-toast';
    d.container.appendChild(this.toast);
    this.help.className = 'evagro-help';
    this.help.innerHTML = 'লিফটের সবুজ বোতামে ক্রসহেয়ার রেখে <b>বাম ক্লিক / O</b> = তলা বদল · বিশেষজ্ঞ ও সাইনে ক্লিক = তথ্য · বন্দুক এখানে বন্ধ';
    d.container.appendChild(this.help);
    this.fade.className = 'evagro-fade';
    d.container.appendChild(this.fade);

    this.inter = new MallInteraction(d.camera, d.dom, this.build.pickables[0], (p) => this.onHover(p), (p) => this.onPick(p as AgroPick));
    this.inter.blockers = this.build.blockers;
    this.inter.maxDist = 20; // the camera is ~6 m behind the player; `accept` keeps picks within reach of the player
    this.inter.accept = (hit) => {
      this.d.playerWorld(this.p);
      this.q.copy(hit.point);
      this.d.origin.toWorld(this.q, this.q);
      return Math.hypot(this.q.x - this.p.x, this.q.z - this.p.z) <= REACH && Math.abs(this.q.y - this.p.y) <= 5; // same floor only
    };
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.agro;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(site.x - o.x, site.floorY, site.z - o.z));
    const { hx, hz, yardX, yardZ, FH, wallH } = FOOT;
    const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, friction = 0.4): void => {
      if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
      world.createCollider(
        R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setFriction(friction),
        body,
      );
    };
    // every wall / counter / pole / pond edge: the module's own 2-D rectangles, one list per floor
    const rects = (list: Rect[], y0: number, y1: number): void => { for (const r of list) box(r.minX, r.maxX, r.minZ, r.maxZ, y0, y1); };
    rects(this.build.colliders[0], 0, wallH);
    rects(this.build.colliders[1], FH, FH + wallH);
    // first-floor slab + roof slab: a ring around the open courtyard (the same four boxes the builder draws)
    for (const [y0, y1] of [[FH - 0.4, FH], [2 * FH - 0.4, 2 * FH]] as const) {
      box(-hx, hx, -hz, -yardZ, y0, y1, 1); box(-hx, hx, yardZ, hz, y0, y1, 1);
      box(-hx, -yardX, -yardZ, yardZ, y0, y1, 1); box(yardX, hx, -yardZ, yardZ, y0, y1, 1);
    }
    // floor slab (top face = the floor tiles): the terrain under the building is 3 cm lower, this makes walking perfectly smooth
    box(-hx, hx, -hz, hz, -0.5, 0, 1);
    return body;
  }

  private onHover(p: PickInfo | null): void {
    if (!p) { this.tip.style.display = 'none'; return; }
    this.tip.style.display = 'block';
    this.tip.innerHTML = `<b>${p.title}</b><small>${p.sub || ''}</small>`;
  }

  private say(t: string): void {
    this.toast.textContent = t;
    this.toast.style.display = 'block';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.style.display = 'none'), 3500);
  }

  private onPick(k: AgroPick): void {
    if (k.action === 'lift') { this.useLift(); return; }
    if (k.action === 'ask') {
      const info = k.roomId === 'field' ? FIELD_INFO : this.build.rooms.find((r) => r.def.id === k.roomId)?.def;
      this.say(k.roomId === 'reception'
        ? 'রিসেপশন: স্বাগতম! লিফটে দোতলায় যান, অথবা করিডর ধরে হেঁটে রুম বেছে নিন।'
        : `${info?.bn ?? ''}: বিশেষজ্ঞের পরামর্শ ফিচার পরে যোগ হবে। বিষয়: ${info?.topics.join(', ') ?? ''}`);
    } else this.say(`${k.title} — ${k.sub}`);
  }

  /** The lift: fade out, put the player on the other floor at the same x / z, fade in. */
  private useLift(): void {
    if (this.lifting) return;
    this.lifting = true;
    const to = this.level === 0 ? 1 : 0;
    this.fade.style.opacity = '1';
    window.setTimeout(() => {
      this.d.playerWorld(this.p);
      const site = this.d.terrain.agro;
      this.d.teleport(this.q.set(this.p.x, site.floorY + to * FOOT.FH + 1.0, this.p.z));
      this.level = to;
      this.fade.style.opacity = '0';
      this.lifting = false;
    }, 280);
  }

  /** Minimap marker position (the building centre). */
  get position(): { x: number; z: number } {
    const s = this.d.terrain.agro;
    return { x: s.x, z: s.z };
  }

  /** Where the player can be put to see the institute: in front of the entrance (the driveway). */
  get entrance(): { x: number; z: number } {
    const s = this.d.terrain.agro;
    return { x: s.x + this.build.spawn.x, z: s.z + this.build.spawn.z };
  }

  /** Once per rendered frame. */
  update(dt: number): void {
    const site = this.d.terrain.agro;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    const walking = this.d.onFoot();
    const was = this.inside;
    const lx = this.p.x - site.x, lz = this.p.z - site.z;
    this.inside = walking && site.inBuilding(this.p.x, this.p.z, -0.2) && this.p.y > site.floorY - 2 && this.p.y < site.floorY + 2 * FOOT.FH + 1;
    this.level = this.inside && this.p.y - site.floorY > FOOT.FH - 0.5 ? 1 : this.inside ? 0 : this.level === 1 && this.lifting ? 1 : 0;
    this.room = this.inside ? this.build.rooms.find((r) => r.def.level === this.level && lx > r.def.x0 && lx < r.def.x1 && lz > r.def.z0 && lz < r.def.z1)?.def ?? null : null;

    this.group.visible = dist < SHOW_DIST;
    if (dist < ANIM_DIST) this.build.update(dt);
    if (this.inside !== was) this.help.style.display = this.inside ? 'block' : 'none';

    // talking / reading: on foot, on the grounds only
    const active = walking && site.inside(this.p.x, this.p.z, 4) && !this.lifting;
    if (active) {
      this.inter.targets = this.build.pickables[this.level];
      this.inter.update();
      if (this.inter.hovered && (this.d.input.wasPressed('Mouse0') || this.d.input.wasPressed('KeyO'))) this.inter.click();
    } else if (this.inter.hovered) {
      this.inter.clear();
    }
  }

  dispose(): void {
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.group);
    this.build.dispose();
    this.tip.remove();
    this.toast.remove();
    this.help.remove();
    this.fade.remove();
    this.style.remove();
  }
}
