// Guns test (headless, no Rapier needed): npx tsx scripts/combat-test.ts
import { rayVsPerson } from '../src/combat/Hit';
import { Wanted } from '../src/combat/Wanted';
import { weaponSpec, WEAPON_ORDER } from '../src/combat/Weapons';
import { Config } from '../src/core/Config';
import { bn } from '../src/i18n/bn';

import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { PeopleManager } from '../src/people/PeopleManager';
import { Person } from '../src/people/Person';
import { CombatEffects } from '../src/combat/CombatEffects';
import type { CombatHooks } from '../src/combat/CombatHooks';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const C = Config.combat;

// --- ray vs person (cylinder, feet at y=0, 1.8 m tall, person at x=10) ---
const hit = (oy: number, dy = 0, dz = 0) => {
  const len = Math.hypot(1, dy, dz);
  return rayVsPerson(0, oy, 0, 1 / len, dy / len, dz / len, 10, 0, 0, 1.8, C.bodyRadius, C.headFrom, 100);
};
const body = hit(1.0);
ok(!!body && !body.head && Math.abs(body.t - (10 - C.bodyRadius)) < 0.01, `chest-height ray hits the body at ${body?.t.toFixed(2)} m`);
const head = hit(1.7);
ok(!!head && head.head, 'head-height ray is a headshot');
ok(hit(2.2) === null, 'ray over the head misses');
ok(hit(-0.5) === null, 'ray under the feet misses');
ok(hit(1.0, 0, 1.2) === null, 'ray passing 1.2 m beside the person misses');
ok(rayVsPerson(0, 1, 0, 1, 0, 0, 10, 0, 0, 1.8, C.bodyRadius, C.headFrom, 5) === null, 'target farther than maxT is not hit');
ok(rayVsPerson(0, 1, 0, -1, 0, 0, 10, 0, 0, 1.8, C.bodyRadius, C.headFrom, 100) === null, 'person behind the shooter is not hit');
ok(rayVsPerson(10, 5, 0, 0, -1, 0, 10, 0, 0, 1.8, C.bodyRadius, C.headFrom, 100)?.head === true, 'ray straight down onto the head hits the head');

// --- damage numbers ---
const pistol = weaponSpec('pistol');
ok(Math.ceil(C.personHealth / pistol.damage) === 3, `pistol: 3 body shots kill (${pistol.damage} dmg)`);
ok(pistol.damage * C.headshotMultiplier >= C.personHealth, 'pistol: 1 headshot kills');
const sg = weaponSpec('shotgun');
ok(sg.pellets > 1 && sg.pellets * sg.damage >= C.personHealth, 'shotgun: close-range volley kills');
ok(WEAPON_ORDER.every((w) => bn.combat.weapon[w]), 'every weapon has a Bangla name');

// --- wanted level ---
const w = new Wanted();
ok(w.stars === 0 && w.policeTarget === 0, 'no crime -> 0 stars, no police');
w.add(C.wanted.killCivilian);
ok(w.stars === 1 && w.policeTarget === C.wanted.policePerStar, 'one killing -> 1 star, 1 police per star');
w.add(C.wanted.killPolice);
ok(w.stars >= 3, `killing a policeman -> ${w.stars} stars`);
for (let i = 0; i < 100; i++) w.add(1);
ok(w.stars === 5 && w.policeTarget === 5 * C.wanted.policePerStar, '5 stars max, 5 x policePerStar police');
for (let i = 0; i < 600; i++) w.update(1); // 10 minutes
ok(w.stars === 0, 'wanted level fades to 0 with time');

// --- people + guns (real PeopleManager, stub world) ---
{
  const gen = new TerrainGenerator(Config.world.seed);
  const graph = new RoadGraph(gen.roads);
  const scene = new THREE.Scene();
  const playerPos = new THREE.Vector3(0, gen.heightAt(0, 0) + 1, 0);
  const fakePlayer = { active: true, inVehicle: false, vel: new THREE.Vector3(), getWorldPosition: (o: THREE.Vector3) => o.copy(playerPos) };
  const people = new PeopleManager({ scene, terrain: gen, origin: { origin: new THREE.Vector3() } as never, graph, vehicles: { vehicles: [] } as never, player: fakePlayer as never });
  const wanted = new Wanted();
  let hits = 0;
  let shots = 0;
  const effects = new CombatEffects(scene);
  const hooks: CombatHooks = {
    wanted,
    effects: Object.assign(effects, { tracer: () => { shots++; } }),
    audio: { shot: () => undefined, thud: () => undefined, setMuted: () => undefined } as never,
    playerWorld: (o) => o.copy(playerPos),
    playerHit: () => { hits++; },
    blocked: () => false,
  };
  people.setCombat(hooks);
  const place = (x: number, z: number, role: 'civilian' | 'thug') => {
    const p = new Person();
    people.adopt(p, new THREE.Vector3(x, gen.heightAt(x, z), z), 'idle');
    p.timer = 99;
    if (role === 'thug') {
      p.role = 'thug';
      p.weapon = 'pistol';
    }
    return p;
  };
  const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) { people.update(1 / 30, playerPos); } };

  const civ = place(8, 4, 'civilian');
  ok(people.rayHit(0, civ.world.y + 1, 0, 0.894, 0, 0.447, 30)?.person === civ, 'rayHit finds the person the ray points at');
  ok(people.damage(civ, 34, false, true) === false && civ.task === 'flee', 'a wounded civilian runs away');
  ok(wanted.stars === 1, 'wounding a civilian gives a wanted star (0.4 heat -> 1 star)');
  ok(people.damage(civ, 34, false, true) === false, 'second hit: still alive (68 dmg)');
  ok(people.damage(civ, 34, false, true) === true && civ.dead, 'third hit: the person dies');
  ok(people.rayHit(0, civ.world.y + 1, 0, 0.894, 0, 0.447, 30) === null, 'a dead body is no longer a target');
  run(1);
  ok(civ.dead && civ.speed === 0, 'dead person does not move');

  // an armed person (thug) attacks the player and shoots; the player cannot die
  wanted.clear();
  const thug = place(25, 6, 'thug');
  hits = 0; shots = 0;
  run(12);
  // hit chance is random (and low by design): keep shooting a while longer so the test is not flaky
  for (let k = 0; k < 8 && hits === 0; k++) run(12);
  ok(thug.task === 'attack', 'armed person starts attacking when he sees the player');
  ok(shots > 3, `he fires at the player (${shots} bullets)`);
  ok(hits > 0, `some bullets hit the player (${hits} hits) - the player only flashes red`);
  const d = Math.hypot(thug.world.x - playerPos.x, thug.world.z - playerPos.z);
  ok(d < 30, `he came closer / keeps a shooting distance (${d.toFixed(0)} m)`);
  ok(people.damage(thug, 34, false, true) === false && wanted.stars === 0, 'shooting a gunman is not a crime (no wanted star)');
  ok(people.damage(thug, 200, true, true) === true && thug.dead, 'a headshot kills');

  // police come when wanted
  wanted.add(3);
  run(8);
  const police = people.onFoot.filter((p) => p.role === 'police' && !p.dead);
  ok(police.length >= 2, `police appear when the player is wanted (${police.length})`);
  ok(police.every((p) => p.task === 'attack' && p.weapon), 'police are armed and attack');
  wanted.clear();
  run(Config.combat.wanted.leaveAfter + 3);
  ok(people.onFoot.every((p) => p.role !== 'police' || p.dead), 'police leave when nobody is wanted any more');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
