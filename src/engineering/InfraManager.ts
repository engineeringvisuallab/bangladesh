// SWTP (water treatment) and STP (sewage treatment) inside the open world.
//  - each plant is built by the engineering module (engineering/index.ts) and stands on its own dug-out ground pad (terrain.infra)
//  - the intake / outfall pipes are measured on THIS terrain, so they really reach the river
//  - Rapier colliders for the walls, tank walls, buildings, columns and the fence, and a trimesh for the pad plate (the pits are real holes)
//  - a narrated camera tour (Y): the camera visits every structure in the order the water travels and a Bangla voice explains it
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { InputManager } from '../input/InputManager';
import { getInfrastructureDef, InfraTour, registerBuiltinInfrastructure, type Infrastructure, type Narrator } from './index';
import type { InfraSite } from './InfraSites';

export interface InfraDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  input: InputManager;
  voice: Narrator;
  container: HTMLElement;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** May a tour start now? (not while driving, flying, sailing or inside a building) */
  canStart?: () => boolean;
}

export interface Plant {
  site: InfraSite;
  infra: Infrastructure;
  tour: InfraTour;
  /** distance from the pad's river-side edge to the river, and the river level relative to the floor (measured) */
  riverReach: number;
  waterRel: number;
}

const ANIM_DIST = 900; // plant animation (flow dots, rotors, plumes) runs only this close
const SHOW_DIST = 2400; // a plant is drawn within this distance of the player
const HINT_DIST = 450; // "press Y" hint within this distance
const FONT = '"Noto Sans Bengali", "Nirmala UI", system-ui, sans-serif';

export class InfraManager {
  readonly plants: Plant[] = [];
  /** Called with true when a tour starts and false when it ends (the engine hands the camera over). */
  onTour: (active: boolean) => void = () => {};
  private active: Plant | null = null;
  private readonly tourCam = new THREE.PerspectiveCamera();
  private readonly lastOrigin = new THREE.Vector3();
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly hint: HTMLDivElement;
  private hintText = '';
  private readonly p = new THREE.Vector3();

  constructor(private d: InfraDeps) {
    registerBuiltinInfrastructure();
    this.lastOrigin.copy(d.origin.origin);
    for (const site of d.terrain.infra) this.plants.push(this.build(site));

    this.hint = document.createElement('div');
    Object.assign(this.hint.style, {
      position: 'absolute', top: '64px', left: '50%', transform: 'translateX(-50%)', padding: '6px 16px', borderRadius: '8px',
      background: 'rgba(8,24,38,0.82)', color: '#fff', font: `500 15px ${FONT}`, pointerEvents: 'none', display: 'none', zIndex: '15', textAlign: 'center',
    });
    d.container.appendChild(this.hint);
  }

  get touring(): boolean {
    return this.active !== null;
  }

  /** The Tour menu: one entry per engineering site in the world. */
  listTours(): { id: string; name: string; color: string; mark: string; category: string; stops: number }[] {
    return this.plants.map((pl) => ({ id: pl.site.id, name: pl.site.nameBn, color: pl.site.color, mark: pl.site.mark, category: pl.infra.category, stops: pl.tour.stops.length }));
  }

  /** Tour menu: start the guided tour of site `id` from wherever the player is (the camera cuts to the site, like Y next to it). */
  startById(id: string): 'started' | 'unknown' | 'blocked' | 'busy' {
    if (this.active) return 'busy';
    const pl = this.plants.find((p) => p.site.id === id);
    if (!pl) return 'unknown';
    if (!(this.d.canStart?.() ?? true)) return 'blocked';
    this.start(pl);
    return 'started';
  }

  /** Stop the running tour (the Tour button while a tour runs). */
  stopTour(): void {
    this.active?.tour.stop();
  }

  /** Name of the plant whose fence the world point is in (+margin), or null. */
  nameAt(x: number, z: number): { id: string; name: string; color: string } | null {
    for (const pl of this.plants) if (pl.site.inside(x, z, 6)) return { id: pl.site.id, name: pl.site.nameBn, color: pl.site.color };
    return null;
  }

  // ---------------------------------------------------------------------------------------------

  private build(site: InfraSite): Plant {
    const { terrain, root } = this.d;
    const s = { h: 0, water: NaN, fx: 0, fz: 0 };
    const pt = { x: 0, z: 0 };
    const groundY = (lx: number, lz: number): number => {
      site.toWorld(lx, lz, pt);
      terrain.sample(pt.x, pt.z, s);
      return s.h - site.floorY;
    };
    // where is the river? march outwards from the middle of the river-side edge until there is water
    const side = site.riverSide === 'W' ? -1 : 1;
    const hasRiver = site.riverSide !== 'none';
    const edge = side < 0 ? site.rect.x0 : site.rect.x1;
    let reach = 25;
    let waterRel = -3;
    for (let dd = 0; hasRiver && dd <= 200; dd++) {
      site.toWorld(edge + side * dd, 0, pt);
      terrain.sample(pt.x, pt.z, s);
      if (!Number.isNaN(s.water) && s.h < s.water - 0.1) {
        reach = dd;
        waterRel = s.water - site.floorY;
        break;
      }
    }
    const def = getInfrastructureDef(site.id);
    if (!def) throw new Error(`infrastructure ${site.id} is not registered`);
    const infra = def.create({ withEnvironment: false, groundY, riverReach: reach, waterRel, skirtDepth: site.deep });
    infra.setLabelsVisible(false);
    infra.root.position.set(site.x, site.floorY, site.z);
    infra.root.rotation.y = site.yaw;
    root.add(infra.root);
    this.createColliders(site, infra);
    const tour = new InfraTour(infra, this.tourCam, this.d.voice);
    tour.onState = (st) => {
      if (st === 'idle' && this.active?.infra === infra) this.finish();
    };
    return { site, infra, tour, riverReach: reach, waterRel };
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  private createColliders(site: InfraSite, infra: Infrastructure): void {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const o = this.d.origin.origin;
    const half = site.yaw / 2;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(site.x - o.x, site.floorY, site.z - o.z).setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    );
    // the ground plate (with the pits as real holes)
    const plate = infra.root.getObjectByName('ground-pad') as THREE.Mesh | undefined;
    if (plate) {
      const pos = plate.geometry.getAttribute('position');
      const verts = new Float32Array(pos.array as ArrayLike<number>);
      const idx = plate.geometry.index ? new Uint32Array(plate.geometry.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i);
      world.createCollider(R.ColliderDesc.trimesh(verts, idx).setFriction(0.8), body);
    }
    for (const sh of infra.solids()) {
      if (sh.kind === 'box') {
        world.createCollider(
          R.ColliderDesc.cuboid(sh.h[0], sh.h[1], sh.h[2]).setTranslation(sh.c[0], sh.c[1], sh.c[2]).setRotation({ x: sh.q[0], y: sh.q[1], z: sh.q[2], w: sh.q[3] }).setFriction(0.5),
          body,
        );
      } else {
        world.createCollider(R.ColliderDesc.cylinder(sh.hh, sh.r).setTranslation(sh.c[0], sh.c[1], sh.c[2]).setFriction(0.5), body);
      }
    }
    this.bodies.push(body);
  }

  // ---------------------------------------------------------------------------------------------

  /** Every frame (before the camera controller). */
  update(dt = 0): void {
    const { input } = this.d;
    const pw = this.d.playerWorld(this.p);
    let nearest: Plant | null = null;
    let nd = Infinity;
    for (const pl of this.plants) {
      const dist = Math.hypot(pw.x - pl.site.x, pw.z - pl.site.z);
      pl.infra.root.visible = dist < SHOW_DIST || this.active === pl;
      if (pl.infra.root.visible && pl.infra.update && (dist < ANIM_DIST || this.active === pl)) pl.infra.update(dt); // spinning rotors, flowing dots, plumes
      if (dist < nd) {
        nd = dist;
        nearest = pl;
      }
    }
    if (input.wasPressed('KeyY')) {
      if (this.active) this.active.tour.stop();
      else if (nearest && (this.d.canStart?.() ?? true)) this.start(nearest);
    }
    if (this.active) {
      if (input.wasPressed('Period')) this.active.tour.next();
      if (input.wasPressed('Comma')) this.active.tour.prev();
    }
    let text = '';
    if (this.active) {
      const t = this.active.tour;
      const st = t.stops[t.index];
      const bn = this.active.infra.narrationLang === 'bn';
      if (st) text = bn ? `${this.active.site.nameBn} · ধাপ ${t.index + 1}/${t.stops.length}: ${st.titleBn}   [ . পরের · , আগের · Y থামুন ]` : `${this.active.site.nameBn} · Step ${t.index + 1}/${t.stops.length}: ${st.titleBn}   [ . next · , back · Y stop ]`;
    } else if (nearest && nd < HINT_DIST) text = nearest.infra.narrationLang === 'bn' ? `${nearest.site.nameBn} · Y চাপুন: ভয়েস ট্যুর` : `${nearest.site.nameBn} · Press Y: guided voice tour`;
    if (text !== this.hintText) {
      this.hintText = text;
      this.hint.textContent = text;
      this.hint.style.display = text ? 'block' : 'none';
    }
  }

  /** After the camera controller: while a tour runs the tour owns the camera. `camera` is the game camera (origin-local coordinates). */
  applyCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    const a = this.active;
    if (!a) return;
    const o = this.d.origin.origin;
    if (o.x !== this.lastOrigin.x || o.z !== this.lastOrigin.z) {
      const dx = this.lastOrigin.x - o.x;
      const dz = this.lastOrigin.z - o.z;
      a.tour.translate(dx, dz);
      this.tourCam.position.x += dx;
      this.tourCam.position.z += dz;
      this.lastOrigin.copy(o);
    }
    a.tour.update(dt);
    camera.position.copy(this.tourCam.position);
    camera.quaternion.copy(this.tourCam.quaternion);
  }

  private start(pl: Plant): void {
    this.active = pl;
    pl.infra.root.visible = true;
    pl.infra.setLabelsVisible(true);
    this.lastOrigin.copy(this.d.origin.origin);
    // cut to the plant (no long flight over the map): start high above it
    const w = new THREE.Vector3(pl.site.x + 200, pl.site.floorY + 260, pl.site.z + 200);
    this.d.origin.toLocal(w, this.tourCam.position);
    this.tourCam.lookAt(this.d.origin.toLocal(new THREE.Vector3(pl.site.x, pl.site.floorY, pl.site.z)));
    this.onTour(true);
    pl.tour.start(0);
  }

  private finish(): void {
    if (!this.active) return;
    this.active.infra.setLabelsVisible(false);
    this.active = null;
    this.onTour(false);
  }

  dispose(): void {
    this.active?.tour.stop();
    for (const b of this.bodies) this.d.physics.world.removeRigidBody(b);
    for (const pl of this.plants) {
      pl.infra.root.removeFromParent();
      pl.infra.dispose();
    }
    this.hint.remove();
  }
}
