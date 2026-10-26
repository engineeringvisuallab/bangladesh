// Wanted level is TIME based: 2 min of crime = 1 star, 5 min = 2, 7 min = 3, 8.5 min = 4, 10 min = 5. Run: npx tsx scripts/wanted-test.ts
import { Wanted } from '../src/combat/Wanted';
import { Config } from '../src/core/Config';
let bad = 0;
const check = (name: string, got: number, want: number) => { const ok = got === want; if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name, 'stars', got, 'want', want); };
// non-stop fighting: a civilian is shot every 4 s
{
  const w = new Wanted();
  const at: Record<number, number> = {};
  for (let t = 0; t <= 720; t += 0.5) {
    if (t % 4 === 0) w.add(Config.combat.wanted.killCivilian);
    w.update(0.5);
    for (const m of [60, 119, 125, 299, 305, 600, 660]) if (t === m) at[m] = w.stars;
  }
  check('1 min of fighting', at[60], 0);
  check('just under 2 min', at[119], 0);
  check('2 min of fighting', at[125], 1);
  check('under 5 min', at[299], 1);
  check('5 min of fighting', at[305], 2);
  check('10 min of fighting', at[600], 5);
  check('11 min (cannot exceed 5)', at[660], 5);
}
// a single crime must not make police come, and the star fades quickly after the fighting stops
{
  const w = new Wanted();
  w.add(Config.combat.wanted.killPolice);
  for (let t = 0; t < 30; t += 0.5) w.update(0.5);
  check('one police kill = still 0 stars', w.stars, 0);
}
{
  const w = new Wanted();
  for (let t = 0; t <= 310; t += 0.5) { if (t % 4 === 0) w.add(1); w.update(0.5); }
  check('2 stars after 5 min', w.stars, 2);
  for (let t = 0; t < 120; t += 0.5) w.update(0.5);
  check('2 minutes after stopping: down to 1 star or less', Math.min(w.stars, 1), w.stars <= 1 ? w.stars : 99);
  for (let t = 0; t < 200; t += 0.5) w.update(0.5);
  check('fully calm again', w.stars, 0);
}
console.log(bad ? 'FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);
