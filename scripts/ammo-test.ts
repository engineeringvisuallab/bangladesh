// Ammo / reload test (headless, no Three.js): npx tsx scripts/ammo-test.ts
import { Ammo } from '../src/combat/Ammo';
import { weaponSpec, WEAPON_ORDER } from '../src/combat/Weapons';
import { bn } from '../src/i18n/bn';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const a = new Ammo();
const p = weaponSpec('pistol');
ok(WEAPON_ORDER.every((w) => a.mag(w) === weaponSpec(w).magazine && a.reserve(w) > 0), 'every gun starts with a full magazine and spare bullets');
ok(a.canFire('pistol'), 'full pistol can fire');

for (let i = 0; i < p.magazine; i++) a.consume('pistol');
ok(a.mag('pistol') === 0 && !a.canFire('pistol'), 'empty magazine cannot fire');
ok(!a.isDry('pistol'), 'spare bullets left -> not dry');
ok(a.startReload('pistol') && a.isReloading('pistol'), 'reload starts');
ok(!a.startReload('pistol'), 'cannot start a second reload');
ok(!a.canFire('pistol'), 'cannot fire while reloading');
a.update(p.reload / 2);
ok(a.isReloading() && Math.abs(a.reloadProgress() - 0.5) < 0.01, 'half way: progress about 50%');
ok(a.update(p.reload) === 'pistol', 'reload finishes and reports the weapon');
ok(a.mag('pistol') === p.magazine && a.reserve('pistol') > 0, 'magazine refilled; reserve is unlimited');
ok(a.canFire('pistol'), 'can fire again after reload');
ok(!a.startReload('pistol'), 'full magazine: reload is pointless');

// reload interrupted by a weapon switch
a.consume('smg');
ok(a.startReload('smg'), 'smg reload starts');
a.cancelReload();
ok(!a.isReloading() && a.mag('smg') === weaponSpec('smg').magazine - 1, 'cancelled reload gives no bullets');

// partial reload takes only what is missing
a.consume('shotgun');
a.consume('shotgun');
a.startReload('shotgun');
a.update(10);
ok(a.mag('shotgun') === weaponSpec('shotgun').magazine, 'partial reload refills the magazine');

// unlimited ammo: no matter how many shots, the gun can always be reloaded
const b = new Ammo();
const sg = weaponSpec('shotgun');
let shots = 0;
for (let guard = 0; guard < 5000; guard++) {
  if (!b.canFire('shotgun')) {
    if (!b.startReload('shotgun')) break;
    b.update(100);
    continue;
  }
  b.consume('shotgun');
  shots++;
  if (shots >= 1000) break;
}
ok(shots >= 1000 && shots > sg.magazine + sg.reserve, `shotgun never runs out (fired ${shots} > old total ${sg.magazine + sg.reserve})`);
ok(!b.isDry('shotgun'), 'never dry');

// loot pickups are harmless in unlimited mode
const c = new Ammo();
ok(c.addReserve('pistol', 10) === 10 && c.reserve('pistol') > 0, 'loot pickup still reports bullets, reserve stays unlimited');

ok(!!bn.combat.reloading && !!bn.combat.noAmmo, 'Bangla texts for reload / no ammo exist');

console.log(fails ? `\n${fails} FAILED` : '\nall ammo tests passed');
process.exit(fails ? 1 : 0);
