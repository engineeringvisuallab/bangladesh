import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { BUILT_UP_KINDS, getWorldZoneAt, type WorldZoneKind } from '../city/WorldZones';
import { placementContains } from '../buildings/Placements';
import { mulberry32 } from '../world/Seed';
import { buildAnimal, buildFishGeometry, buildFishMaterial, variantCount, type Rig } from './AnimalModel';
import { HABITAT, PREDATOR_ZONES, SPECIES, type HabitatKey, type Species, type SpeciesDef } from './Species';

/**
 * Wildlife of the whole world. Every species lives where it belongs (see Species.ts HABITAT):
 *  - farmland + villages: cows, buffaloes, goats, sheep, horses, chickens, ducks (at ponds), dogs, cats, rabbits
 *  - forest: deer, wild boar, elephants, bears, peacocks;  wetland: buffaloes, crocodiles, hippos, ducks;  mountain: wild goats, bears
 *  - the safari park (L key): zebras, giraffes, elephants, rhinos, hippos, lions, leopards;  sea: dolphin pods;  every water: fish
 *  - hunters (tiger, lion, leopard, wolf, fox) stalk their prey (Species.hunts), charge, pounce and eat; the herd runs
 * Animals live on dry, gentle, unbuilt land near the player (not on buildings, roads, inside engineering areas or the agro site)
 * and are removed when the player is far away; new groups appear in a ring around the player where the zone fits.
 * Predators keep away from the player: they never attack him. Added to the world root: positions are true world coordinates.
 */

type State = 'wander' | 'graze' | 'flee' | 'stalk' | 'chase' | 'attack' | 'eat' | 'rest' | 'dead';

interface Animal {
  sp: Species;
  def: SpeciesDef;
  rig: Rig;
  x: number; y: number; z: number;
  /** Ground height under the animal (y is higher when it floats). */
  gy: number;
  heading: number;
  speed: number;
  state: State;
  timer: number;
  tx: number; tz: number;
  retarget: number;
  target: Animal | null;
  stamina: number;
  hunger: number;
  phase: number;
  threatX: number; threatZ: number; calm: number;
  deadT: number;
  roll: number;
  pitch: number;
  neckDown: number;
  scale: number;
  seed: number;
  /** Fitness 0.8..1.02: young / old animals are slower and get caught more often. */
  fit: number;
  /** The pounce landed (decided at contact). */
  hit: boolean;
  homeX: number; homeZ: number;
  group: number;
  inWater: boolean;
  waterLevel: number;
  /** Dolphin: jump clock. */
  jump: number;
}

const NEAR_MIN = 70; // new animals appear in this ring around the player (m)
const NEAR_MAX = 300;
const GONE = 480; // animals farther than this from the player are removed
const SHOW = 260; // animals farther than this are hidden and not posed
const MAX_LAND = 64;
const MAX_PREDATORS = 4;
const MAX_DOLPHINS = 8;
const FISH_SCHOOLS = 10;
const FISH_PER = 12;
const WORLD_LIMIT = 4700;
const SAFARI = { x: 3000, z: 1900, r: 800 };

const WALK4 = [0, Math.PI, Math.PI, 0];
const GALLOP4 = [0, 0.35, Math.PI * 0.85, Math.PI * 1.15];

export class AnimalManager {
  readonly animals: Animal[] = [];
  private rnd: () => number;
  private s: TerrainSample;
  private s2: TerrainSample;
  private spawnTimer = 0.2;
  private time = 0;
  private nextGroup = 1;
  private predators: Animal[] = [];

  // fish
  private fishGeo = buildFishGeometry();
  private uTime = { value: 0 };
  private fishMat = buildFishMaterial(this.uTime);
  private fishMesh: THREE.InstancedMesh;
  private schools: School[] = [];
  private dummy = new THREE.Object3D();
  private fishTimer = 0;

  /** Wildlife can be switched off (stats / debugging). */
  enabled = true;

  constructor(private root: THREE.Object3D, private terrain: TerrainGenerator, seed: number) {
    this.rnd = mulberry32(seed ^ 0x7a11d11f);
    this.s = terrain.makeSample();
    this.s2 = terrain.makeSample();
    const nFish = FISH_SCHOOLS * FISH_PER;
    this.fishMesh = new THREE.InstancedMesh(this.fishGeo, this.fishMat, nFish);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.castShadow = false;
    this.fishMesh.count = 0;
    const palette = [0xb9c4cc, 0xc9a24a, 0x8aa07a, 0xd9602c, 0x7f8f9c, 0xe0d8c0];
    for (let i = 0; i < nFish; i++) this.fishMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(0.85 + this.rnd() * 0.3));
    root.add(this.fishMesh);
  }

  // ------------------------------------------------------------------ helpers

  private r(a: number, b: number): number { return a + (b - a) * this.rnd(); }

  private dist(a: Animal, x: number, z: number): number { return Math.hypot(a.x - x, a.z - z); }

  /** Habitat key of a place: the zone kind, or 'safari' inside the safari park. */
  private habitat(x: number, z: number): { key: HabitatKey; kind: WorldZoneKind } {
    const kind = getWorldZoneAt(x, z).kind;
    if (kind === 'park' && Math.hypot(x - SAFARI.x, z - SAFARI.z) < SAFARI.r) return { key: 'safari', kind };
    return { key: kind, kind };
  }

  /**
   * Can this species stand here? Fills this.s with the terrain sample. Land animals: dry, gentle, unbuilt ground (no buildings, no
   * agro site, no engineering area, no sea). Swimmers (duck, buffalo, hippo, crocodile, elephant) may also stand in water up to
   * their depth. On a spawn the spot must not be on asphalt.
   */
  private okCell(def: SpeciesDef, x: number, z: number, spawn: boolean): boolean {
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
    const kind = getWorldZoneAt(x, z).kind;
    if (kind === 'sea') return false;
    if (BUILT_UP_KINDS.has(kind) && !(kind === 'village' && (HABITAT.village?.[def.id] || def.id === 'fox'))) return false;
    if (this.terrain.agro.contains(x, z, 12)) return false;
    if (placementContains(x, z, 3)) return false;
    const s = this.s;
    this.terrain.sample(x, z, s);
    const inWater = !Number.isNaN(s.water) && s.h < s.water + 0.25;
    if (def.swim !== undefined) {
      if (inWater && s.water - s.h > def.swim) return false;
      if (!inWater && s.h < 0.9) return false;
    } else if (inWater || s.h < 1.2) return false;
    if (spawn && this.terrain.roads.surfaceAt(x, z) === 1) return false;
    return true;
  }

  /** Nearest water cell (depth 0.5 .. maxDepth) around a point, or null. */
  private findWater(x: number, z: number, def: SpeciesDef, maxR = 60): { x: number; z: number } | null {
    for (let rr = 6; rr <= maxR; rr += 6) {
      const a0 = this.rnd() * 6.28;
      for (let k = 0; k < 12; k++) {
        const a = a0 + (k / 12) * Math.PI * 2;
        const wx = x + Math.cos(a) * rr, wz = z + Math.sin(a) * rr;
        this.terrain.sample(wx, wz, this.s2);
        const d = this.s2.water - this.s2.h;
        if (!Number.isNaN(this.s2.water) && d >= 0.5 && d <= (def.swim ?? 3) && this.okCell(def, wx, wz, false)) return { x: wx, z: wz };
      }
    }
    return null;
  }

  private count(sp: Species): number {
    let n = 0;
    for (const a of this.animals) if (a.sp === sp && a.state !== 'dead') n++;
    return n;
  }

  /** Land animals alive (tests). */
  landCountForTest(): number { return this.landCount(); }

  private landCount(): number {
    let n = 0;
    for (const a of this.animals) if (a.sp !== 'dolphin') n++;
    return n;
  }

  private predatorCount(): number {
    let n = 0;
    for (const a of this.animals) if (a.def.role === 'predator' && a.state !== 'dead') n++;
    return n;
  }

  // ------------------------------------------------------------------ spawning

  private make(sp: Species, x: number, z: number, heading: number, group: number): Animal {
    const def = SPECIES[sp];
    const seed = Math.floor(this.rnd() * 1e6);
    const rig = buildAnimal(sp, Math.floor(this.rnd() * variantCount(sp)));
    const scale = this.r(def.size[0], def.size[1]);
    rig.group.scale.setScalar(scale);
    this.terrain.sample(x, z, this.s);
    const inWater = !Number.isNaN(this.s.water) && this.s.h < this.s.water + 0.25;
    const a: Animal = {
      sp, def, rig, x, y: this.s.h, gy: this.s.h, z, heading, speed: 0, state: 'wander', timer: this.r(1, 4), tx: x, tz: z, retarget: 0, target: null,
      stamina: 7.5, hunger: this.r(5, 18), phase: this.rnd() * 6, threatX: 0, threatZ: 0, calm: 0, deadT: 0, roll: 0, pitch: 0, neckDown: 0, scale, seed,
      fit: this.r(0.8, 1.02), hit: false, homeX: x, homeZ: z, group, inWater, waterLevel: this.s.water, jump: this.r(2, 8),
    };
    if (inWater) a.y = Math.max(a.gy, a.waterLevel - rig.floatDepth * scale);
    if (sp === 'dolphin') a.y = a.waterLevel - 0.3;
    this.root.add(rig.group);
    this.animals.push(a);
    this.place(a);
    return a;
  }

  private remove(a: Animal): void {
    this.root.remove(a.rig.group);
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
    for (const o of this.animals) if (o.target === a) { o.target = null; if (o.state === 'stalk' || o.state === 'chase' || o.state === 'attack') this.setState(o, 'wander'); }
  }

  /** One group (herd, flock, pair) of a species that fits the place, somewhere in the ring around the player. */
  private trySpawnGroup(px: number, pz: number, onlyNew = false): boolean {
    for (let attempt = 0; attempt < 20; attempt++) {
      const ang = this.rnd() * Math.PI * 2;
      const d = this.r(NEAR_MIN, NEAR_MAX);
      let cx = px + Math.cos(ang) * d, cz = pz + Math.sin(ang) * d;
      const hab = this.habitat(cx, cz);
      const table = HABITAT[hab.key];
      if (!table) continue;
      // species that fit here (population cap, a water place for the water lovers)
      const options: { sp: Species; w: number; wx: number; wz: number }[] = [];
      let total = 0;
      let water: { x: number; z: number } | null | undefined;
      for (const k of Object.keys(table) as Species[]) {
        const def = SPECIES[k], w = table[k] ?? 0;
        if (w <= 0 || this.count(k) >= def.cap || (onlyNew && this.count(k) > 0)) continue;
        let wx = cx, wz = cz;
        if (def.needsWater) {
          if (water === undefined) water = this.findWater(cx, cz, def, 40);
          if (!water) continue;
          wx = water.x; wz = water.z;
        }
        if (!this.okCell(def, wx, wz, true)) continue;
        // rare species get a better chance while few of them live here (so the zone shows its variety, not only the commonest animal)
        const wt = (w * (def.needsWater ? 3 : 1)) / (1 + this.count(k) * 0.35);
        options.push({ sp: k, w: wt, wx, wz });
        total += wt;
      }
      if (options.length === 0) continue;
      let pick = this.rnd() * total;
      let chosen = options[0];
      for (const o of options) { pick -= o.w; if (pick <= 0) { chosen = o; break; } }
      const def = SPECIES[chosen.sp];
      cx = chosen.wx; cz = chosen.wz;
      const n = def.group[0] + Math.floor(this.rnd() * (def.group[1] - def.group[0] + 1));
      const grp = this.nextGroup++;
      const spread = 5 + n * 2.2;
      let made = 0;
      for (let i = 0; i < n; i++) {
        const dx = cx + (i === 0 ? 0 : this.r(-spread, spread)), dz = cz + (i === 0 ? 0 : this.r(-spread, spread));
        if (this.okCell(def, dx, dz, true)) { this.make(chosen.sp, dx, dz, this.rnd() * 6.28, grp); made++; }
      }
      if (made === 0) continue;
      this.trySpawnHunter(chosen.sp, hab.key, cx, cz);
      return true;
    }
    return false;
  }

  /** A hunter of that species lives near a herd: the hunting you see in the wild. */
  private trySpawnHunter(prey: Species, key: HabitatKey, cx: number, cz: number): void {
    if (this.rnd() > 0.6 || this.predatorCount() >= MAX_PREDATORS) return;
    const cands: Species[] = [];
    for (const k of Object.keys(PREDATOR_ZONES) as Species[]) {
      const def = SPECIES[k];
      if (def.hunts?.includes(prey) && PREDATOR_ZONES[k]?.includes(key) && this.count(k) < def.cap) cands.push(k);
    }
    if (cands.length === 0) return;
    const sp = cands[Math.floor(this.rnd() * cands.length)];
    const def = SPECIES[sp];
    for (let t = 0; t < 10; t++) {
      const pa = this.rnd() * Math.PI * 2, pd = this.r(70, 105);
      const qx = cx + Math.cos(pa) * pd, qz = cz + Math.sin(pa) * pd;
      if (!this.okCell(def, qx, qz, true)) continue;
      const pr = this.make(sp, qx, qz, Math.atan2(cx - qx, cz - qz), this.nextGroup++);
      pr.hunger = this.r(4, 14);
      return;
    }
  }

  /** A pod of dolphins in the open sea. */
  private trySpawnPod(px: number, pz: number): boolean {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = this.rnd() * Math.PI * 2, d = this.r(60, 260);
      const x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || getWorldZoneAt(x, z).kind !== 'sea') continue;
      this.terrain.sample(x, z, this.s2);
      if (Number.isNaN(this.s2.water) || this.s2.water - this.s2.h < 4) continue;
      const def = SPECIES.dolphin;
      const n = def.group[0] + Math.floor(this.rnd() * (def.group[1] - def.group[0] + 1));
      const grp = this.nextGroup++, h0 = this.rnd() * 6.28;
      for (let i = 0; i < n; i++) {
        const dx = x + this.r(-6, 6), dz = z + this.r(-6, 6);
        this.terrain.sample(dx, dz, this.s2);
        if (Number.isNaN(this.s2.water) || this.s2.water - this.s2.h < 3) continue;
        this.make('dolphin', dx, dz, h0 + this.r(-0.2, 0.2), grp);
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ movement

  private setState(a: Animal, st: State, timer = 0): void {
    a.state = st;
    a.timer = timer;
  }

  private turnTo(a: Animal, want: number, rate: number, dt: number): void {
    let d = want - a.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const m = rate * dt;
    a.heading += Math.max(-m, Math.min(m, d));
  }

  /** Walk / run along the current heading; stops (and turns away) at deep water, steep ground, towns, buildings, the sea. */
  private advance(a: Animal, speed: number, dt: number): void {
    const step = speed * dt;
    if (step <= 0) { a.speed = 0; return; }
    const nx = a.x + Math.sin(a.heading) * step, nz = a.z + Math.cos(a.heading) * step;
    if (this.okCell(a.def, nx, nz, false)) {
      const s = this.s;
      const inWater = !Number.isNaN(s.water) && s.h < s.water + 0.25;
      if (inWater || Math.abs(s.h - a.gy) / Math.max(step, 0.3) < 0.8) {
        a.x = nx; a.z = nz;
        a.gy += (s.h - a.gy) * Math.min(1, dt * 14);
        a.inWater = inWater;
        a.waterLevel = s.water;
        a.y = inWater ? Math.max(a.gy, s.water - a.rig.floatDepth * a.scale) : a.gy;
        a.speed = speed;
        return;
      }
    }
    // blocked: turn away and pick a new target on the next retarget
    a.heading += (this.rnd() > 0.5 ? 1 : -1) * this.r(1.2, 2.2);
    a.speed = 0;
    a.retarget = 0;
    if (a.state === 'flee') a.calm += 0.5;
  }

  private place(a: Animal): void {
    const g = a.rig.group;
    g.position.set(a.x, a.y, a.z);
    g.rotation.y = a.heading;
  }

  // ------------------------------------------------------------------ behaviours

  /** Pick the next walking target: near the herd mates / the home of a farm animal, never on asphalt. */
  private retarget(a: Animal, px: number, pz: number): void {
    const def = a.def;
    a.retarget = this.r(5, 11);
    const dp = this.dist(a, px, pz);
    if (def.role === 'predator' && dp < def.shy) {
      const away = Math.atan2(a.x - px, a.z - pz);
      a.tx = a.x + Math.sin(away) * 40; a.tz = a.z + Math.cos(away) * 40;
      return;
    }
    for (let t = 0; t < 4; t++) {
      let tx: number, tz: number;
      if (def.role === 'predator') {
        const ang = this.rnd() * 6.28, d = this.r(20, def.roam);
        tx = a.x + Math.cos(ang) * d; tz = a.z + Math.sin(ang) * d;
      } else {
        // drift towards the middle of the group, or home when strayed
        let cx = 0, cz = 0, n = 0;
        for (const o of this.animals) if (o !== a && o.group === a.group && o.state !== 'dead' && this.dist(o, a.x, a.z) < 60) { cx += o.x; cz += o.z; n++; }
        if (n > 0) { cx /= n; cz /= n; } else { cx = a.x; cz = a.z; }
        if (Math.hypot(a.x - a.homeX, a.z - a.homeZ) > def.roam * 2.5) { cx = a.homeX; cz = a.homeZ; }
        const w = def.roam * 0.5;
        tx = cx + this.r(-w, w); tz = cz + this.r(-w, w);
      }
      if (this.okCell(def, tx, tz, true)) { a.tx = tx; a.tz = tz; return; }
    }
    const ang = this.rnd() * 6.28;
    a.tx = a.x + Math.cos(ang) * 8; a.tz = a.z + Math.sin(ang) * 8;
  }

  private wander(a: Animal, dt: number, px: number, pz: number, walk: number): void {
    a.retarget -= dt;
    if (a.retarget <= 0) {
      this.retarget(a, px, pz);
      if (a.def.role !== 'predator' && this.rnd() < a.def.idle) this.setState(a, a.def.role === 'amphibian' ? 'rest' : 'graze', this.r(4, a.def.role === 'amphibian' ? 40 : 11));
    }
    const want = Math.atan2(a.tx - a.x, a.tz - a.z);
    this.turnTo(a, want, 1.6, dt);
    const far = this.dist(a, a.tx, a.tz);
    this.advance(a, far > 2 ? walk : 0, dt);
  }

  /** Everything that eats plants (and the farm animals, birds, big grazers): graze, drift, step aside or run from danger. */
  private updateHerbivore(a: Animal, dt: number, px: number, pz: number): void {
    const def = a.def;
    let tx = 0, tz = 0, threat = false, hard = false;
    if (def.role !== 'grazer') {
      for (const o of this.predators) {
        if (o.state === 'dead') continue;
        const d = this.dist(a, o.x, o.z);
        const prey = o.def.hunts?.includes(a.sp) ?? false;
        const sight = o.state === 'chase' ? (prey ? 110 : 30) : o.state === 'stalk' ? 19 : 14;
        if (d < sight) { threat = true; hard = true; tx = o.x; tz = o.z; break; }
      }
    }
    const dp = this.dist(a, px, pz);
    if (!threat && dp < def.shy) { threat = true; tx = px; tz = pz; }
    if (threat && a.state !== 'flee') {
      this.setState(a, 'flee');
      a.calm = 0;
      a.threatX = tx; a.threatZ = tz;
      if (hard) for (const o of this.animals) if (o !== a && o.sp === a.sp && o.state !== 'dead' && o.state !== 'flee' && this.dist(o, a.x, a.z) < 45) { this.setState(o, 'flee'); o.threatX = tx; o.threatZ = tz; o.calm = 0; }
    }
    if (a.state === 'flee') {
      if (threat) { a.threatX = tx; a.threatZ = tz; a.calm = 0; } else a.calm += dt;
      const panic = hard || def.role === 'prey' || def.role === 'bird';
      const away = Math.atan2(a.x - a.threatX, a.z - a.threatZ) + (panic ? Math.sin(this.time * 2.3 + a.seed) * 0.35 : 0); // zig-zag
      this.turnTo(a, away, panic ? 4.2 : 2.4, dt);
      const sp = panic ? def.run * a.fit : Math.max(def.walk * 2, def.run * 0.4);
      this.advance(a, sp, dt);
      if (a.calm > (panic ? 3.5 : 1.8)) this.setState(a, 'wander');
      return;
    }
    if (a.state === 'graze' || a.state === 'rest') {
      a.timer -= dt;
      a.speed = 0;
      if (a.timer <= 0) this.setState(a, 'wander');
      return;
    }
    this.wander(a, dt, px, pz, def.walk);
  }

  /** Crocodile and hippo: lie about at the water, slide into it when disturbed, drift in the water. */
  private updateAmphibian(a: Animal, dt: number, px: number, pz: number): void {
    const def = a.def;
    const dp = this.dist(a, px, pz);
    if (a.state === 'flee') {
      this.turnTo(a, Math.atan2(a.tx - a.x, a.tz - a.z), 3, dt);
      this.advance(a, def.run, dt);
      if (a.inWater || this.dist(a, a.tx, a.tz) < 2) a.calm += dt;
      if (a.calm > 2.5) this.setState(a, 'wander');
      return;
    }
    if (dp < def.shy && !a.inWater) {
      const w = this.findWater(a.x, a.z, def, 60);
      if (w) { a.tx = w.x; a.tz = w.z; a.calm = 0; this.setState(a, 'flee'); return; }
    }
    if (a.state === 'rest' || a.state === 'graze') {
      a.timer -= dt;
      a.speed = 0;
      if (a.timer <= 0) this.setState(a, 'wander');
      return;
    }
    this.wander(a, dt, px, pz, a.inWater ? def.walk * 2.2 : def.walk);
  }

  private updatePredator(a: Animal, dt: number, px: number, pz: number): void {
    const def = a.def;
    const hunts = def.hunts ?? [];
    switch (a.state) {
      case 'wander': {
        a.hunger -= dt;
        a.stamina = Math.min(7.5, a.stamina + dt);
        this.wander(a, dt, px, pz, def.walk);
        if (a.hunger <= 0) {
          let best: Animal | null = null, bd = 120;
          for (const o of this.animals) {
            if (!hunts.includes(o.sp) || o.state === 'dead') continue;
            const d = this.dist(a, o.x, o.z);
            if (d < bd) { bd = d; best = o; }
          }
          if (best) { a.target = best; this.setState(a, 'stalk'); } else a.hunger = 8;
        }
        break;
      }
      case 'stalk': {
        const t = a.target;
        if (!t || t.state === 'dead') { this.setState(a, 'wander'); a.hunger = 6; break; }
        const d = this.dist(a, t.x, t.z);
        this.turnTo(a, Math.atan2(t.x - a.x, t.z - a.z), 2.4, dt);
        this.advance(a, def.walk * 1.5, dt);
        if (d < 24 || t.state === 'flee') { a.stamina = 7.5; this.setState(a, 'chase'); }
        if (d > 160) { this.setState(a, 'wander'); a.hunger = 10; }
        break;
      }
      case 'chase': {
        const t = a.target;
        if (!t || t.state === 'dead') { this.setState(a, 'wander'); a.hunger = 6; break; }
        const d = this.dist(a, t.x, t.z);
        a.stamina -= dt;
        // lead the prey a little
        const lead = Math.min(0.6, d / 30);
        const ax = t.x + Math.sin(t.heading) * t.speed * lead, az = t.z + Math.cos(t.heading) * t.speed * lead;
        this.turnTo(a, Math.atan2(ax - a.x, az - a.z), 5.5, dt);
        this.advance(a, def.run * a.fit, dt);
        const reach = 0.9 + a.rig.length * a.scale * 0.9;
        if (d < reach) {
          // contact: the pounce lands or the prey twists away
          a.hit = this.rnd() < 0.82;
          this.setState(a, 'attack', 0.7);
          a.speed = 0;
          if (a.hit) { this.setState(t, 'dead'); t.deadT = 0; t.speed = 0; t.heading = Math.atan2(a.x - t.x, a.z - t.z) + 1.2; }
          else { t.stamina = 0; }
        } else if (a.stamina <= 0 || d > 95) { this.setState(a, 'rest', this.r(7, 12)); a.target = null; a.hunger = this.r(15, 30); }
        break;
      }
      case 'attack': {
        const t = a.target;
        a.timer -= dt;
        a.speed = 0;
        if (t) this.turnTo(a, Math.atan2(t.x - a.x, t.z - a.z), 8, dt);
        if (a.timer <= 0) {
          if (a.hit && t && t.state === 'dead') {
            const size = Math.min(1.3, Math.max(0.45, t.rig.length * t.scale / 1.2));
            this.setState(a, 'eat', this.r(24, 40) * size);
            const back = Math.min(0.9, t.rig.length * t.scale * 0.5);
            const ex = t.x - Math.sin(t.heading) * back, ez = t.z - Math.cos(t.heading) * back;
            if (this.okCell(a.def, ex, ez, false)) { a.x = ex; a.z = ez; } // stand at the carcass (only on ground it may stand on)
            a.heading = Math.atan2(t.x - a.x, t.z - a.z);
          } else {
            this.setState(a, 'rest', this.r(8, 14)); // the prey got away
            a.hunger = this.r(15, 30);
            a.target = null;
          }
        }
        break;
      }
      case 'eat': {
        a.timer -= dt;
        a.speed = 0;
        if (a.timer <= 0) { this.setState(a, 'wander'); a.hunger = this.r(60, 110); a.target = null; }
        break;
      }
      case 'rest': {
        a.timer -= dt;
        a.speed = 0;
        a.stamina = Math.min(7.5, a.stamina + dt * 1.2);
        if (a.timer <= 0) this.setState(a, 'wander');
        break;
      }
      default: this.setState(a, 'wander');
    }
  }

  /** Dolphin: swims in the sea, turns before the shore, sometimes leaps out of the water. */
  private updateDolphin(a: Animal, dt: number): void {
    const def = a.def;
    a.retarget -= dt;
    if (a.retarget <= 0) { a.retarget = this.r(3, 8); a.pitch = 0; a.tx = this.r(-0.5, 0.5); }
    // steer: gentle random turns + keep the group together + turn before shallow water
    let turn = a.tx;
    let cx = 0, cz = 0, n = 0;
    for (const o of this.animals) if (o !== a && o.group === a.group && o.state !== 'dead') { cx += o.x; cz += o.z; n++; }
    if (n > 0) {
      cx /= n; cz /= n;
      if (Math.hypot(cx - a.x, cz - a.z) > 14) {
        let d = Math.atan2(cx - a.x, cz - a.z) - a.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        turn += Math.max(-1, Math.min(1, d)) * 0.8;
      }
    }
    const ax = a.x + Math.sin(a.heading) * 14, az = a.z + Math.cos(a.heading) * 14;
    this.terrain.sample(ax, az, this.s2);
    const shallow = Number.isNaN(this.s2.water) || this.s2.water - this.s2.h < 3 || getWorldZoneAt(ax, az).kind !== 'sea';
    if (shallow) turn = 1.6;
    a.heading += turn * dt;
    const sp = def.walk + (a.state === 'flee' ? 2 : 0) + Math.sin(this.time * 0.3 + a.seed) * 0.8 + 2;
    a.x += Math.sin(a.heading) * sp * dt;
    a.z += Math.cos(a.heading) * sp * dt;
    a.speed = sp;
    this.terrain.sample(a.x, a.z, this.s);
    a.waterLevel = this.s.water;
    a.inWater = !Number.isNaN(this.s.water);
    // jump clock: swim near the surface, now and then a leap
    a.jump -= dt;
    let y = (Number.isNaN(a.waterLevel) ? a.y : a.waterLevel) - 0.45 + Math.sin(this.time * 1.5 + a.seed) * 0.18;
    let pitch = Math.cos(this.time * 1.5 + a.seed) * 0.12;
    if (a.jump < 0) {
      const u = -a.jump / 1.5;
      if (u >= 1) a.jump = this.r(6, 16);
      else { y = (Number.isNaN(a.waterLevel) ? a.y : a.waterLevel) - 0.2 + Math.sin(u * Math.PI) * 1.9; pitch = -0.7 + u * 1.4; }
    }
    a.y += (y - a.y) * Math.min(1, dt * 6);
    a.pitch += (pitch - a.pitch) * Math.min(1, dt * 6);
  }

  // ------------------------------------------------------------------ pose

  private pose(a: Animal, dt: number): void {
    if (a.rig.kind === 'dolphin') this.poseDolphin(a);
    else if (a.rig.kind === 'bird') this.poseBird(a, dt);
    else this.poseQuad(a, dt);
  }

  private lieDown(a: Animal, dt: number): void {
    const rig = a.rig;
    const wantRoll = a.state === 'dead' ? Math.PI / 2 : 0;
    a.roll += (wantRoll - a.roll) * Math.min(1, dt * 4);
    const g = rig.group;
    g.position.set(a.x, a.y + Math.sin(a.roll) * rig.side * a.scale, a.z);
    g.rotation.y = a.heading;
    g.rotation.z = a.roll;
  }

  private poseQuad(a: Animal, dt: number): void {
    const rig = a.rig, def = a.def;
    const run = a.speed;
    const stride = Math.max(0.5, rig.length * 0.7 * a.scale);
    a.phase += (run / stride) * Math.PI * 2 * dt * 0.5;
    const gallop = run > def.run * 0.55 && def.run > 8;
    const moving = run > 0.15;
    const amp = moving ? rig.swing * Math.min(1.15, 0.35 + (run / Math.max(1, def.run))) : 0;
    const off = gallop ? GALLOP4 : WALK4;
    const crouch = a.state === 'stalk' ? 0.22 : a.state === 'attack' ? -0.1 : 0;
    const k = Math.min(1, dt * 16);
    for (let i = 0; i < 4; i++) {
      const hipT = rig.legRest[i] + (moving ? Math.sin(a.phase + off[i]) * amp : 0) + (i < 2 ? -crouch : crouch) * 0.6;
      rig.legs[i].rotation.x += (hipT - rig.legs[i].rotation.x) * k;
      const bend = moving ? Math.max(0, -Math.cos(a.phase + off[i])) * amp * 1.2 : 0;
      const kneeT = rig.kneeRest[i] + bend + crouch * 1.1;
      rig.knees[i].rotation.x += (kneeT - rig.knees[i].rotation.x) * k;
    }
    // body: bob while moving, crouch while stalking, pounce on attack
    const bob = moving ? Math.abs(Math.sin(a.phase * 2)) * 0.03 * Math.min(1, run / 3) * Math.min(1.5, rig.hipY) : 0;
    const lowered = crouch > 0 ? 0.28 * rig.hipY : 0;
    rig.body.position.y += (bob - lowered - rig.body.position.y) * Math.min(1, dt * 10);
    const gallopPitch = gallop ? Math.sin(a.phase * 2 + 1) * 0.07 : 0;
    a.pitch += ((a.state === 'attack' ? -0.45 : gallopPitch) - a.pitch) * Math.min(1, dt * 12);
    rig.body.rotation.x = a.pitch;
    const croc = rig.kind === 'croc';
    rig.body.rotation.y = croc && moving ? Math.sin(a.phase) * 0.06 : 0;
    // head / neck: down to graze and eat, low when stalking
    const st = a.state;
    const wantNeck = croc ? 0 : st === 'graze' || st === 'eat' ? 1 : st === 'stalk' ? 0.45 : st === 'chase' ? 0.1 : st === 'flee' ? -0.12 : st === 'rest' ? 0.12 : 0.05;
    a.neckDown += (wantNeck - a.neckDown) * Math.min(1, dt * 6);
    const sway = Math.sin(this.time * 0.8 + a.seed) * 0.03;
    rig.neck.rotation.x = rig.neckRest + a.neckDown * rig.grazeRange + sway;
    rig.head.rotation.x = rig.headRest - rig.headComp * a.neckDown * rig.grazeRange;
    // tail
    const fleeing = st === 'flee';
    if (croc) {
      rig.tail.rotation.y = Math.sin(a.phase + 1) * (moving ? 0.35 : 0.04);
    } else if (rig.tailHang) {
      rig.tail.rotation.z = Math.sin(this.time * (fleeing ? 6 : 1.6) + a.seed) * 0.25;
      rig.tail.rotation.x = fleeing ? 0.45 : 0;
    } else {
      rig.tail.rotation.y = Math.sin(this.time * (fleeing ? 7 : 1.8) + a.seed) * 0.3;
      rig.tail.rotation.x = fleeing ? 0.7 : st === 'chase' ? 0.15 : 0;
    }
    // elephant: swinging trunk, flapping ears
    if (rig.trunk) {
      const base = [0.7, 0.35, 0.15], dn = [0.35, 0.25, 0.15];
      for (let i = 0; i < rig.trunk.length; i++) rig.trunk[i].rotation.x = base[i] + a.neckDown * dn[i] + Math.sin(this.time * 1.1 + i * 0.8 + a.seed) * 0.07;
    }
    if (rig.ears) for (let i = 0; i < rig.ears.length; i++) rig.ears[i].rotation.y = (i === 0 ? -1 : 1) * (0.42 + Math.sin(this.time * 2.2 + a.seed) * 0.12);
    this.lieDown(a, dt);
  }

  private poseBird(a: Animal, dt: number): void {
    const rig = a.rig;
    const run = a.speed;
    a.phase += (run / (0.3 * a.scale)) * Math.PI * dt * 0.7;
    const moving = run > 0.1;
    const k = Math.min(1, dt * 16);
    for (let i = 0; i < 2; i++) {
      const ph = a.phase + (i === 0 ? 0 : Math.PI);
      rig.legs[i].rotation.x += ((moving ? Math.sin(ph) * rig.swing : 0) - rig.legs[i].rotation.x) * k;
      rig.knees[i].rotation.x += ((moving ? Math.max(0, -Math.cos(ph)) * 0.7 : 0) - rig.knees[i].rotation.x) * k;
      rig.legs[i].visible = !a.inWater;
    }
    rig.body.position.y = rig.hipY + (moving && !a.inWater ? Math.abs(Math.sin(a.phase * 2)) * 0.012 : 0);
    const grazing = a.state === 'graze' && !a.inWater;
    a.neckDown += ((grazing ? 1 : a.state === 'flee' ? -0.15 : 0.05) - a.neckDown) * Math.min(1, dt * 6);
    const peck = grazing ? 0.45 + 0.55 * Math.max(0, Math.sin(this.time * 6 + a.seed)) : 1;
    const nd = a.neckDown * peck;
    rig.body.rotation.x += (0.38 * nd - rig.body.rotation.x) * Math.min(1, dt * 12);
    rig.neck.rotation.x = rig.neckRest + nd * rig.grazeRange + (moving ? Math.sin(a.phase * 2) * 0.1 : 0);
    rig.head.rotation.x = rig.headRest - rig.headComp * nd * rig.grazeRange;
    rig.tail.rotation.x = Math.sin(this.time * 2 + a.seed) * 0.05;
    rig.tail.rotation.y = a.sp === 'peacock' ? Math.sin(this.time * 0.9 + a.seed) * 0.12 : 0;
    this.lieDown(a, dt);
  }

  private poseDolphin(a: Animal): void {
    const rig = a.rig, g = rig.group;
    g.position.set(a.x, a.y, a.z);
    g.rotation.y = a.heading;
    g.rotation.x = a.pitch;
    if (rig.spine) rig.spine[1].rotation.x = Math.sin(this.time * 7 + a.seed) * 0.3 * Math.min(1, a.speed / 3);
    rig.body.rotation.z = Math.sin(this.time * 0.7 + a.seed) * 0.05;
  }

  // ------------------------------------------------------------------ fish

  private spawnSchool(px: number, pz: number, sc: School): boolean {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = this.rnd() * Math.PI * 2, d = this.r(12, 150);
      const x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
      this.terrain.sample(x, z, this.s2);
      const s = this.s2;
      if (Number.isNaN(s.water)) continue;
      const depth = s.water - s.h;
      if (depth < 1.6) continue;
      sc.x = x; sc.z = z; sc.heading = this.rnd() * 6.28; sc.speed = this.r(0.8, 1.7);
      sc.depthFrac = this.r(0.18, 0.6);
      sc.size = this.r(0.28, 0.6) * (depth > 6 ? 1.5 : 1);
      sc.y = s.water - Math.min(depth * sc.depthFrac, 3.2) - 0.25;
      sc.alive = true;
      sc.timer = 0;
      return true;
    }
    return false;
  }

  private updateFish(dt: number, px: number, pz: number): void {
    this.fishTimer -= dt;
    const dummy = this.dummy;
    let idx = 0;
    for (const sc of this.schools) {
      if (!sc.alive) {
        if (this.fishTimer <= 0) this.spawnSchool(px, pz, sc);
        continue;
      }
      if (Math.hypot(sc.x - px, sc.z - pz) > 190) { sc.alive = false; continue; }
      // wander and turn well before the shore
      sc.timer -= dt;
      if (sc.timer <= 0) { sc.timer = this.r(2, 6); sc.turn = this.r(-0.7, 0.7); }
      sc.heading += sc.turn * dt;
      const ahead = 5 + sc.size * 8;
      const fx = sc.x + Math.sin(sc.heading) * ahead, fz = sc.z + Math.cos(sc.heading) * ahead;
      this.terrain.sample(fx, fz, this.s2);
      const s = this.s2;
      if (Number.isNaN(s.water) || s.water - s.h < 1.3) {
        sc.heading += 2.4 * dt * (sc.turn >= 0 ? 1 : -1) + 1.2 * dt;
        sc.speed = Math.max(0.5, sc.speed * 0.98);
      } else {
        sc.x += Math.sin(sc.heading) * sc.speed * dt;
        sc.z += Math.cos(sc.heading) * sc.speed * dt;
        sc.y += (s.water - Math.min((s.water - s.h) * sc.depthFrac, 3.2) - 0.25 - sc.y) * Math.min(1, dt * 2);
      }
      const t = this.time;
      for (let i = 0; i < sc.n; i++) {
        const o = sc.off[i];
        const lx = o.x + Math.sin(t * 0.7 + o.p) * 0.5, lz = o.z + Math.cos(t * 0.6 + o.p * 1.3) * 0.5;
        const c = Math.cos(sc.heading), sn = Math.sin(sc.heading);
        dummy.position.set(sc.x + lx * c + lz * sn, sc.y + o.y + Math.sin(t * 0.9 + o.p) * 0.12, sc.z - lx * sn + lz * c);
        dummy.rotation.set(0, sc.heading + Math.sin(t * 1.3 + o.p) * 0.18, 0);
        dummy.scale.setScalar(sc.size * o.k);
        dummy.updateMatrix();
        this.fishMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    if (this.fishTimer <= 0) this.fishTimer = 0.7;
    this.fishMesh.count = idx;
    this.fishMesh.instanceMatrix.needsUpdate = true;
    if (this.fishMesh.instanceColor) this.fishMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ main update

  update(dt: number, time: number, playerWorld: THREE.Vector3): void {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.1);
    this.time = time;
    this.uTime.value = time;
    const px = playerWorld.x, pz = playerWorld.z;

    // keep the population near the player
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      for (const a of this.animals.slice()) {
        if (this.dist(a, px, pz) > GONE || (a.state === 'dead' && a.deadT > 70)) this.remove(a);
      }
      const land = this.landCount();
      this.spawnTimer = land < MAX_LAND * 0.7 ? 0.5 : 1.8;
      if (land < MAX_LAND) this.trySpawnGroup(px, pz);
      else if (land < MAX_LAND + 14) this.trySpawnGroup(px, pz, true); // full: still room for a species that is missing here
      if (this.count('dolphin') <= MAX_DOLPHINS - 4 && this.rnd() < 0.5) this.trySpawnPod(px, pz);
    }

    this.predators.length = 0;
    for (const a of this.animals) if (a.def.role === 'predator' && a.state !== 'dead') this.predators.push(a);

    for (const a of this.animals) {
      if (a.state === 'dead') { a.speed = 0; a.deadT += dt; } // the carcass is removed in the maintenance step after a while
      else if (a.def.role === 'predator') this.updatePredator(a, dt, px, pz);
      else if (a.def.role === 'marine') this.updateDolphin(a, dt);
      else if (a.def.role === 'amphibian') this.updateAmphibian(a, dt, px, pz);
      else this.updateHerbivore(a, dt, px, pz);
      const vis = this.dist(a, px, pz) < SHOW;
      a.rig.group.visible = vis;
      if (vis) this.pose(a, dt);
    }

    if (this.schools.length === 0) for (let i = 0; i < FISH_SCHOOLS; i++) this.schools.push(newSchool(this.rnd, FISH_PER));
    this.updateFish(dt, px, pz);
  }

  /** Where wildlife is easy to find: the middle of the safari park. */
  get safariPark(): { x: number; z: number } { return { x: SAFARI.x, z: SAFARI.z }; }

  /** Quick counts for the debug panel / tests. */
  stats(): { deer: number; tigers: number; lions: number; dead: number; fish: number; total: number; bySpecies: Partial<Record<Species, number>> } {
    let deer = 0, tigers = 0, lions = 0, dead = 0;
    const bySpecies: Partial<Record<Species, number>> = {};
    for (const a of this.animals) {
      if (a.state === 'dead') { dead++; continue; }
      bySpecies[a.sp] = (bySpecies[a.sp] ?? 0) + 1;
      if (a.sp === 'deer') deer++;
      else if (a.sp === 'tiger') tigers++;
      else if (a.sp === 'lion') lions++;
    }
    return { deer, tigers, lions, dead, fish: this.fishMesh.count, total: this.animals.length, bySpecies };
  }

  dispose(): void {
    for (const a of this.animals.slice()) this.remove(a);
    this.root.remove(this.fishMesh);
    this.fishMesh.dispose();
    this.fishGeo.dispose();
    this.fishMat.dispose();
  }
}

interface School {
  alive: boolean;
  x: number; y: number; z: number;
  heading: number; speed: number; turn: number; timer: number;
  size: number; depthFrac: number;
  n: number;
  off: { x: number; y: number; z: number; p: number; k: number }[];
}

function newSchool(rnd: () => number, n: number): School {
  const off: School['off'] = [];
  for (let i = 0; i < n; i++) off.push({ x: (rnd() - 0.5) * 3.2, y: (rnd() - 0.5) * 0.8, z: (rnd() - 0.5) * 4, p: rnd() * 6.28, k: 0.8 + rnd() * 0.4 });
  return { alive: false, x: 0, y: 0, z: 0, heading: 0, speed: 1, turn: 0, timer: 0, size: 0.4, depthFrac: 0.3, n, off };
}
