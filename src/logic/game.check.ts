import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
  configurable: true,
});

const { derive, upgradeCost } = await import('./stats.ts');
const { isBossRound, roundConfig, soulReward, LAYOUTS, ENEMIES, pickEnemies, bossKind, bossPatterns, BOSSES } = await import('./stages.ts');
const {
  WEAPONS,
  ITEMS,
  runStats,
  rollRewards,
  rewardInfo,
  nextCombo,
  COMBO_WINDOW_MS,
  rarityWeights,
  rollRarity,
  moveHitbox,
  coinReward,
  rerollCost,
  PAIRS,
  pairOf,
  activePairs,
} = await import('./loot.ts');
const { loadSave, writeSave, defaultSave } = await import('./save.ts');
const { PALETTE: PALETTE_CHECK } = await import('../gfx/sprites.ts');

// Boss every 5th round, stronger each tier.
assert.deepEqual([1, 4, 5, 6, 10, 15].map(isBossRound), [false, false, true, false, true, true]);
const b1 = roundConfig(5);
const b2 = roundConfig(10);
const b3 = roundConfig(15);
assert.equal(b1.bossTier, 1);
assert.equal(b1.enemyCount, 0);
assert.ok(b2.bossHp > b1.bossHp && b3.bossHp > b1.bossHp && roundConfig(20).bossHp > b2.bossHp);
assert.ok(b2.bossDamage > b1.bossDamage);
assert.equal(roundConfig(4).boss, false);
assert.ok(roundConfig(4).enemyCount > roundConfig(1).enemyCount);
assert.ok(roundConfig(40).enemyCount <= 8);
assert.ok(soulReward('boss', 5, 1) > soulReward('enemy', 5, 1));
assert.ok(soulReward('enemy', 1, 2) > soulReward('enemy', 1, 1));

// Stats: every level helps, caps hold.
const base = derive({ str: 0, int: 0, agi: 0, dex: 0 });
const up = derive({ str: 5, int: 5, agi: 5, dex: 5 });
assert.ok(up.damage > base.damage && up.maxHp > base.maxHp && up.soulMult > base.soulMult);
assert.ok(up.speed > base.speed && up.dashCooldown < base.dashCooldown);
assert.ok(up.swingCooldown < base.swingCooldown && up.critChance > base.critChance);
const maxed = derive({ str: 999, int: 999, agi: 999, dex: 999 });
assert.equal(maxed.swingCooldown, 0.18);
assert.equal(maxed.dashCooldown, 0.4);
assert.equal(maxed.critChance, 0.5);
for (let l = 0; l < 30; l++) assert.ok(upgradeCost(l + 1) >= upgradeCost(l));
assert.equal(upgradeCost(0), 10);

// Layouts stay inside the 40-tile arena and above the floor.
for (const layout of LAYOUTS) for (const p of layout) assert.ok(p.x >= 0 && p.x + p.w <= 40 && p.y > 0 && p.y < 21);

// Save: roundtrip, corrupt data falls back to defaults.
assert.deepEqual(loadSave(), defaultSave());
const s = defaultSave();
s.souls = 42;
s.stats.dex = 3;
writeSave(s);
assert.deepEqual(loadSave(), s);
store.set('rougelike:save', '{not json');
assert.deepEqual(loadSave(), defaultSave());
store.set('rougelike:save', JSON.stringify({ souls: -5, stats: { str: 'x', agi: 2.7 } }));
assert.deepEqual(loadSave(), { souls: 0, bestRound: 0, cls: 'ksatria', stats: { str: 0, int: 0, agi: 2, dex: 0 } });
store.set('rougelike:save', JSON.stringify({ cls: 'berserker' }));
assert.equal(loadSave().cls, 'berserker');
store.set('rougelike:save', JSON.stringify({ cls: 'naga' }));
assert.equal(loadSave().cls, 'ksatria');

// Enemy variety unlocks by round.
const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
assert.deepEqual(new Set(pickEnemies(1, 20)), new Set(['slime']));
const late = pickEnemies(12, 600);
for (const k of Object.keys(ENEMIES)) assert.ok(late.includes(k as never), `${k} never spawns by round 12`);
// Debuff enemies: every debuff has at least one source, each with a sprite.
const { DEBUFFS } = await import('./stages.ts');
const sources = new Set(Object.values(ENEMIES).map((e) => e.debuff));
for (const d of Object.keys(DEBUFFS)) assert.ok(sources.has(d as never) || d === 'silence', `no enemy inflicts ${d}`);
for (const d of Object.values(DEBUFFS)) assert.ok(d.ms > 0 && d.ms <= 4000, 'debuffs stay short');
for (const k of pickEnemies(3, 100)) assert.ok(ENEMIES[k].from <= 3);
assert.deepEqual(pickEnemies(3, 3, seq([0, 0.5, 0.99])), ['slime', 'bat', 'boar']);

// Bosses rotate kinds; later loops unlock their third pattern.
// Boss every 5 rounds; every 10th is Raja Iblis (phases), the others rotate.
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(bossKind), [
  'knight',
  'demonLord',
  'slimeKing',
  'demonLord',
  'lich',
  'demonLord',
  'knight',
  'demonLord',
]);
{
  const { isPhaseBossRound, bossPhase, DEMON_PHASES, bossLoop } = await import('./stages.ts');
  assert.deepEqual([5, 10, 15, 20].map(isPhaseBossRound), [false, true, false, true]);
  assert.deepEqual(
    [100, 67, 66, 34, 33, 1].map((hp) => bossPhase(hp, 100)),
    [1, 1, 2, 2, 3, 3],
  );
  assert.equal(DEMON_PHASES.length, 3);
  assert.ok(DEMON_PHASES[2].length > DEMON_PHASES[0].length, 'later phases add attacks');
  assert.deepEqual([2, 4, 6].map(bossLoop), [0, 1, 2]);
  assert.ok(roundConfig(10).bossHp > roundConfig(5).bossHp * 1.5, 'phase boss is a real step up');
}
assert.equal(bossPatterns('knight', 1).length, 2);
assert.deepEqual(bossPatterns('knight', 7), BOSSES.knight.patterns);
assert.deepEqual(bossPatterns('lich', 30), BOSSES.lich.patterns);

// Loot: weapon + items change stats; caps hold.
const plain = runStats(base, WEAPONS.pedang, []);
assert.equal(plain.damage, base.damage);
assert.ok(runStats(base, WEAPONS.kapak, []).damage > plain.damage);
assert.ok(runStats(base, WEAPONS.katana, []).swingCooldown < plain.swingCooldown);
// Items are unique: a duplicate id never stacks.
const stacked = runStats(base, WEAPONS.pedang, ['batu', 'batu', 'jantung', 'sayap', 'sayap', 'duri']);
assert.equal(stacked.damage, Math.round(base.damage * 1.15));
assert.equal(stacked.maxHp, base.maxHp + 30);
assert.equal(stacked.extraJumps, 1);
assert.equal(stacked.thorns, 8);
assert.equal(runStats(maxed, WEAPONS.belati, ['mata', 'mataDewa', 'tulang']).critChance, 0.9);

// Sets: every item has exactly one partner; the bonus needs both.
const paired = PAIRS.flatMap((x) => [...x.items]);
assert.equal(paired.length, Object.keys(ITEMS).length, 'every item is in a set');
assert.equal(new Set(paired).size, paired.length, 'no item in two sets');
assert.ok(Object.keys(ITEMS).length >= 48);
for (const x of PAIRS) assert.ok(x.desc.length <= 35 && `SET ${x.name}`.length <= 20, `${x.name}: text too long`);
assert.equal(pairOf('sepatu').partner, 'jubah');
assert.equal(runStats(base, WEAPONS.pedang, ['sepatu']).critResetsDash, 0);
assert.equal(runStats(base, WEAPONS.pedang, ['sepatu', 'jubah']).critResetsDash, 1);
assert.equal(runStats(base, WEAPONS.pedang, ['batu', 'lonceng']).finisherWave, 1);
assert.deepEqual(
  activePairs(['batu', 'jubah', 'lonceng']).map((x) => x.name),
  ['TEMPAAN PERANG'],
);
const all = runStats(base, WEAPONS.pedang, Object.keys(ITEMS));
assert.ok(all.lifesteal <= 0.2 && all.rage <= 0.8 && all.skillCdMult >= 0.3);

// Unique rewards: owned items are never offered; pools drain into potion.
const ownAll = Object.keys(ITEMS).filter((id) => id !== 'batu');
for (let i = 0; i < 100; i++) {
  const owned = ['batu', 'sepatu', 'mahkota', 'hatiDewa'];
  for (const round of [3, 5, 10]) assert.ok(rollRewards(round, owned).every((x) => x.type !== 'item' || !owned.includes(x.id)));
}
assert.deepEqual(
  rollRewards(3, ownAll)
    .map((x) => x.type)
    .sort(),
  ['item', 'potion'],
);
assert.deepEqual(rollRewards(5, Object.keys(ITEMS)), [{ type: 'potion' }]);

// INT powers skills.
assert.ok(up.skillCdMult < base.skillCdMult && up.skillPower > base.skillPower);
assert.equal(maxed.skillCdMult, 0.5);

// Combos: chain within the window, restart after it, wrap at the end.
assert.equal(nextCombo(-1, 0, 3), 0);
assert.equal(nextCombo(0, 100, 3), 1);
assert.equal(nextCombo(1, COMBO_WINDOW_MS, 3), 2);
assert.equal(nextCombo(2, 0, 3), 0);
assert.equal(nextCombo(1, COMBO_WINDOW_MS + 1, 3), 0);

// Every weapon: a varied combo (cast weapons: one move per cast), a skill with a cooldown, an ultimate.
assert.ok(WEAPONS.mugen.cast && WEAPONS.mugen.fusion && WEAPONS.mugen.combo.length === 1, 'Gojo casts Blue, Red and Purple');
for (const w of Object.values(WEAPONS).filter((w) => !w.cast)) {
  assert.ok(w.combo.length >= 2, `${w.id}: combo too short`);
  assert.ok(new Set(w.combo.map((m) => JSON.stringify(m))).size >= 2, `${w.id}: combo is one repeated move`);
  assert.ok(w.skill.cd > 0 && w.skill.name && w.ult.name, `${w.id}: missing skill/ult`);
  for (const m of w.combo) assert.ok(m.anim === 'shoot' ? m.angles?.length : m.reach.w > 0, `${w.id}: move without a hit`);
}

// Air moves: every weapon has one, and hitboxes sit where the move says.
for (const w of Object.values(WEAPONS)) assert.ok(w.air.name && (w.air.angles?.length || w.air.reach.w > 0), `${w.id}: no air move`);
const below = moveHitbox(WEAPONS.tombak.air, 100, 50, 1);
assert.ok(below.y > 50 && below.x < 100 && below.x + below.w > 100, 'below hitbox must be under the player');
const around = moveHitbox(WEAPONS.pedang.air, 100, 50, -1);
assert.ok(
  around.x < 100 && around.x + around.w > 100 && around.y < 50 && around.y + around.h > 50,
  'around hitbox must contain the player',
);
const front = moveHitbox(WEAPONS.pedang.combo[0], 100, 50, -1);
assert.ok(front.x + front.w <= 100, 'front hitbox faces left when facing -1');

// Rarity: weights are a distribution, godly gets likelier with boss tier.
for (const tier of [1, 2, 5, 20]) {
  const w = rarityWeights(tier);
  assert.ok(Math.abs(w.rare + w.legend + w.godly - 1) < 1e-9 && w.rare > 0, `tier ${tier} weights`);
}
assert.ok(rarityWeights(4).godly > rarityWeights(1).godly);
assert.equal(rollRarity(1, 0), 'godly');
assert.equal(rollRarity(1, 0.999), 'rare');

// Boss rounds give only rare+ items; normal rounds never do.
for (let i = 0; i < 200; i++) {
  const boss = rollRewards(10);
  assert.equal(boss.length, 3);
  assert.equal(new Set(boss.map((x) => JSON.stringify(x))).size, 3);
  assert.ok(
    boss.every((x) => x.type === 'item' && ITEMS[x.id].rarity !== 'biasa'),
    'boss reward must be rare+',
  );
  const normal = rollRewards(7);
  assert.ok(
    normal.every((x) => x.type !== 'item' || ITEMS[x.id].rarity === 'biasa'),
    'normal reward must be common',
  );
}

// Godly/legend effects and caps.
const god = runStats(base, WEAPONS.pedang, [
  'mataDewa',
  'kalung',
  'racun',
  'hatiDewa',
  'sayapDewa',
  'sayap',
  'bulu',
  'perisai',
  'cermin',
  'sisik',
]);
assert.equal(god.critMult, 3);
assert.equal(god.maxHp, base.maxHp + 100);
assert.equal(god.regen, 2);
assert.equal(god.extraJumps, 3);
assert.ok(god.damageTaken < 0.75, 'set bonus stacks with its items');

// Classes: each has its own weapon; the synergy only applies with that weapon.
const { CLASSES, CLASS_IDS, hasSynergy } = await import('./classes.ts');
assert.equal(new Set(CLASS_IDS.map((c) => CLASSES[c].color)).size, CLASS_IDS.length, 'each class has its own color');
for (const c of CLASS_IDS) assert.ok(CLASSES[c].weapon in WEAPONS && CLASSES[c].color in PALETTE_CHECK, `${c}: bad weapon/color`);
assert.ok(hasSynergy('berserker', 'kapak') && !hasSynergy('berserker', 'pedang'));
assert.equal(runStats(base, WEAPONS.kapak, [], 'berserker').lifesteal, 0.04);
assert.equal(runStats(base, WEAPONS.pedang, [], 'berserker').lifesteal, 0);
assert.equal(runStats(base, WEAPONS.pedang, [], 'berserker').rage, 0.25, 'class trait applies with any weapon');
assert.equal(runStats(base, WEAPONS.busur, [], 'pemburu').pierceArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'ksatria').maxHp, Math.round(base.maxHp * 1.1));
assert.equal(runStats(base, WEAPONS.pedang, [], 'ksatria').regen, 1, 'Avalon heals over time');
assert.ok(WEAPONS.pedang.combo.length === 4 && WEAPONS.pedang.ult.name === 'EXCALIBUR');
assert.equal(runStats(base, WEAPONS.belati, [], 'pembunuh').critMult, 2);
// Fate reworks: Hassan executes, Heracles revives (twice with his weapon), Cu Chulainn dodges.
assert.equal(runStats(base, WEAPONS.pedang, [], 'pembunuh').execute, 0.12);
assert.equal(runStats(base, WEAPONS.belati, [], 'pembunuh').execute, 0.2);
assert.equal(runStats(base, WEAPONS.pedang, [], 'berserker').godHand, 1);
assert.equal(runStats(base, WEAPONS.kapak, [], 'berserker').godHand, 2);
assert.equal(runStats(base, WEAPONS.pedang, [], 'ksatria').godHand, 0);
assert.equal(runStats(base, WEAPONS.pedang, [], 'dragoon').dodge, 0.15);
// Magic Archer: homing is the class trait (any weapon), the extra arrow needs the bow.
assert.equal(runStats(base, WEAPONS.pedang, [], 'magicArcher').homingArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'magicArcher').extraArrows, 0);
assert.equal(runStats(base, WEAPONS.busurArkana, [], 'magicArcher').extraArrows, 1);
assert.notEqual(CLASSES.magicArcher.weapon, CLASSES.pemburu.weapon, 'every class has its own weapon');
assert.equal(new Set(CLASS_IDS.map((c) => CLASSES[c].weapon)).size, CLASS_IDS.length, 'no two classes share a weapon');
assert.equal(runStats(base, WEAPONS.busur, [], 'pemburu').homingArrows, 0);
// Grim Reaper: kill heal anywhere, hunting souls only with the scythe; items stack souls but capped.
assert.equal(runStats(base, WEAPONS.pedang, [], 'reaper').healOnKill, 2);
assert.equal(runStats(base, WEAPONS.pedang, [], 'reaper').killSouls, 0);
assert.equal(runStats(base, WEAPONS.sabit, [], 'reaper').killSouls, 1);
assert.equal(runStats(base, WEAPONS.sabit, ['lentera', 'phoenix'], 'reaper').killSouls, 3);
assert.equal(runStats(base, WEAPONS.pedang, ['mahkotaMaut', 'mahkotaMaut']).execute, 0.2);

// Rewards: 3 distinct items/potion, never a weapon (weapons belong to the class).
for (let i = 0; i < 200; i++) {
  for (const round of [1, 4, 5, 13]) {
    const r = rollRewards(round);
    assert.equal(r.length, 3);
    assert.equal(new Set(r.map((x) => JSON.stringify(x))).size, 3);
    assert.ok(
      r.every((x) => x.type === 'item' || x.type === 'potion'),
      'reward must not be a weapon',
    );
  }
}

// Coins: every round pays, boss rounds pay more, later rounds pay more; refresh gets pricier.
assert.ok(coinReward(1) > 0);
assert.ok(coinReward(5) > coinReward(4) && coinReward(6) >= coinReward(1));
assert.ok(coinReward(10) > coinReward(5));
assert.equal(coinReward(1, 2), coinReward(1) + 2);
assert.ok(rerollCost(1) > rerollCost(0) && rerollCost(0) > 0);
assert.equal(runStats(base, WEAPONS.pedang, ['tapal', 'koin']).coinBonus, 3);
assert.equal(runStats(base, WEAPONS.pedang, ['kantong', 'koin']).coinBonus, 4);
const { SPRITES: S } = await import('../gfx/sprites.ts');
for (const id of Object.keys(WEAPONS)) assert.ok(`w_${id}` in S, `missing w_${id}`);
for (const id of Object.keys(ITEMS)) assert.ok(`i_${id}` in S, `missing i_${id}`);
assert.ok(rewardInfo({ type: 'potion' }).icon in S);

// Sprites: rectangular grids using only palette colors.
const { SPRITES, PALETTE } = await import('../gfx/sprites.ts');
for (const [name, rows] of Object.entries(SPRITES)) {
  assert.ok(
    rows.every((r) => r.length === rows[0].length),
    `${name}: ragged rows`,
  );
  assert.ok(
    [...rows.join('')].every((c) => c === '.' || c in PALETTE),
    `${name}: unknown color`,
  );
}

// Balance regression: same inventory in any pickup order gives the same stats.
const build = ['tulang', 'batu', 'mahkota', 'jantung', 'lonceng', 'mata'] as const;
assert.deepEqual(runStats(base, WEAPONS.senapan, build, 'gunners'), runStats(base, WEAPONS.senapan, [...build].reverse(), 'gunners'));
const capped = runStats(base, WEAPONS.senapan, Object.keys(ITEMS));
assert.ok(capped.dashCooldown > 0.15, 'dash recovery must outlast its invulnerability');
assert.ok(capped.iframes <= 1400 && capped.regen <= 5 && capped.killBolt <= 3 && capped.critMult <= 3);
assert.equal(runStats(base, WEAPONS.senapan, ['tulang'], 'gunners').damage, 8, 'flat damage must respect the rifle multiplier');
const gunner = runStats(base, WEAPONS.senapan, [], 'gunners');
assert.equal(gunner.maxHp, 110);
assert.ok(gunner.swingCooldown < runStats(base, WEAPONS.senapan, []).swingCooldown);
assert.ok(WEAPONS.senapan.automatic && WEAPONS.senapan.projectile?.texture === 'bullet');
// Cultivator: flying swords home in; the synergy makes them pierce.
assert.ok(WEAPONS.pedangTerbang.projectile?.homing && WEAPONS.pedangTerbang.projectile.returning);
for (const m of [...WEAPONS.pedangTerbang.combo, WEAPONS.pedangTerbang.air])
  assert.equal(m.angles?.length, 1, 'one sword in flight at a time');
assert.equal(runStats(base, WEAPONS.pedangTerbang, [], 'cultivator').pierceArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'cultivator').pierceArrows, 0);
assert.equal(runStats(base, WEAPONS.pedang, [], 'cultivator').regen, 0.5);
// Elementalis: fire moves burn, ice moves freeze; the synergy strengthens both.
assert.ok(WEAPONS.tongkat.combo.some((m) => m.status?.burn) && WEAPONS.tongkat.combo.some((m) => m.status?.freeze));
assert.equal(runStats(base, WEAPONS.tongkat, [], 'elementalis').elemental, 1.5);
assert.equal(runStats(base, WEAPONS.pedang, [], 'elementalis').elemental, 1);
for (const w of Object.values(WEAPONS)) for (const m of [...w.combo, w.air]) if (m.shot) assert.ok(m.shot in S, `missing ${m.shot}`);
for (const k of [
  'spider',
  'beetle',
  'imp',
  'wraith',
  'golem',
  'shaman',
  'web',
  'curse',
  'splitter',
  'mimic0',
  'mimic1',
  'ninja',
  'totem',
  'worm',
])
  assert.ok(k in S, `missing sprite ${k}`);
for (const w of Object.values(WEAPONS)) {
  if (w.projectile) assert.ok(w.projectile.texture in S && w.projectile.speed > 0);
  for (const m of [...w.combo, w.air]) if (m.anim === 'shoot') assert.ok(w.projectile && m.angles?.length);
}
for (const cls of CLASS_IDS) {
  const w = WEAPONS[CLASSES[cls].weapon];
  const st = runStats(base, w, [], cls);
  // Ideal full-combo DPS, all projectiles connect; excludes skills, rage and kill effects.
  const hits = w.combo.reduce((sum, m) => sum + m.dmg * (m.angles ? m.angles.length + st.extraArrows : 1), 0) + st.finisherWave;
  const seconds = st.swingCooldown * w.combo.reduce((sum, m) => sum + m.cd, 0);
  const dps = (st.damage * hits * (1 + st.critChance * (st.critMult - 1))) / seconds;
  assert.ok(dps >= 20 && dps <= 38, `${cls}: baseline combo DPS outside budget: ${dps}`);
}
for (let round = 2; round <= 40; round++) {
  const prev = roundConfig(round - 1),
    current = roundConfig(round);
  assert.ok(current.enemyHp >= prev.enemyHp && current.enemyDamage >= prev.enemyDamage);
}
// Quadratic, not exponential: round 40 enemies stay within reach of a strong build.
assert.ok(roundConfig(20).enemyDamage < 45 && roundConfig(40).enemyHp < 3500, 'late enemies must not return to exponential scaling');
assert.ok(roundConfig(1).enemyHp >= 2 * derive({ str: 0, int: 0, agi: 0, dex: 0 }).damage, 'a fresh hero needs several hits per enemy');
assert.ok(roundConfig(5).bossHp >= 500 && roundConfig(5).bossHp <= 600, 'first boss health budget');
assert.ok(roundConfig(10).bossDamage > roundConfig(15).bossDamage, 'the super boss hits harder than the next regular boss');
// Mini bosses and pace: elites can show up from round 1; enemies act faster each round, with a floor.
const { ELITE, ELITE_AFFIXES, enemyPace } = await import('./stages.ts');
assert.ok(ELITE.chance > 0 && ELITE.chance < 1 && ELITE.hp > 1);
for (const a of Object.values(ELITE_AFFIXES)) assert.ok(a.every >= 2000 && (!a.debuff || a.debuff in DEBUFFS));
assert.equal(enemyPace(1), 0.8);
assert.ok(enemyPace(10) < enemyPace(2) && enemyPace(200) === 0.4);
// New items: dash power / on-hit burn and freeze stack but stay capped.
const everything = runStats(base, WEAPONS.pedang, Object.keys(ITEMS) as never[]);
assert.ok(everything.dashPower > 1 && everything.dashPower <= 4);
assert.ok(everything.burnChance > 0 && everything.burnChance <= 0.6 && everything.freezeChance <= 0.4);
for (const x of PAIRS)
  for (const id of x.items) {
    const other = pairOf(id).partner;
    assert.ok(`SET ${x.name} + ${ITEMS[other].name}`.length <= 35, `${x.name}: set line too wide`);
  }
for (const [id, it] of Object.entries(ITEMS)) assert.ok(it.name.length <= 16 && it.desc.length <= 32, `${id}: text too long`);
// Dodge / block / gold / boss damage items: capped; block keeps the fastest item, sets shorten it.
assert.equal(runStats(base, WEAPONS.pedang, ['gelang']).barrier, 15);
assert.equal(runStats(base, WEAPONS.pedang, ['gelang', 'perisaiCahaya']).barrier, 8);
assert.ok(Math.abs(runStats(base, WEAPONS.pedang, ['gelang', 'tanah']).barrier - 10.5) < 1e-9);
assert.equal(runStats(base, WEAPONS.pedang, ['tanah']).barrier, 0, 'set bonus alone never grants a block');
assert.ok(everything.dodge <= 0.4 && everything.barrier >= 3 && everything.goldChance <= 0.8 && everything.bossDamage <= 1.5);
assert.ok(Object.keys(ITEMS).length >= 88);
// Dark Avenger: awakening instead of an ult; the synergy makes it last longer.
assert.ok(CLASSES.darkAvenger.awaken && !Object.values(CLASSES).some((c) => c !== CLASSES.darkAvenger && c.awaken));
assert.equal(runStats(base, WEAPONS.pedangGelap, [], 'darkAvenger').awakenTime, 1.5);
assert.equal(runStats(base, WEAPONS.pedang, [], 'darkAvenger').awakenTime, 1);
{
  const s = runStats(base, WEAPONS.pedangGelap, [], 'darkAvenger');
  const b = { ...s };
  CLASSES.darkAvenger.awaken!.apply(b);
  assert.ok(b.damage > s.damage && b.speed > s.speed && b.swingCooldown < s.swingCooldown && b.damageTaken < s.damageTaken);
  assert.equal(b.maxHp, s.maxHp, 'awakening must not change max HP');
}
// Ashura: fury only for the class, synergy raises the cap; every combo move has phantom arms.
assert.equal(runStats(base, WEAPONS.enamLengan, [], 'ashura').furyMax, 10);
assert.equal(runStats(base, WEAPONS.pedang, [], 'ashura').furyMax, 6);
assert.equal(runStats(base, WEAPONS.pedang, [], 'ksatria').furyMax, 0);
assert.ok([...WEAPONS.enamLengan.combo, WEAPONS.enamLengan.air].every((m) => (m.extra ?? 0) >= 1));
assert.ok(WEAPONS.enamLengan.fist && WEAPONS.enamLengan.combo.every((m) => ['jab', 'hook', 'uppercut'].includes(m.anim)), 'Ashura punches');
// Antares: fire immune everywhere; the synergy stretches dragon form to 10 s.
assert.equal(runStats(base, WEAPONS.pedang, [], 'antares').fireImmune, 1);
assert.ok(Math.abs(runStats(base, WEAPONS.cakarNaga, [], 'antares').formTime * 7 - 10) < 1e-9);
assert.ok(
  WEAPONS.cakarNaga.combo.every((m) => m.status?.burn),
  'dragon claws burn',
);
// Gilgamesh: rich king; the synergy adds a treasure to every volley.
assert.equal(runStats(base, WEAPONS.gerbangBabilonia, [], 'gilgamesh').extraArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'gilgamesh').extraArrows, 0);
assert.ok(runStats(base, WEAPONS.pedang, [], 'gilgamesh').coinBonus >= 2 && WEAPONS.gerbangBabilonia.projectile?.gate);
// Jujutsu: Gojo's Infinity blocks, Sukuna's Kai & Hachi echo with his technique, Toji trades skill power for body.
assert.equal(runStats(base, WEAPONS.pedang, [], 'gojo').barrier, 8);
assert.ok(runStats(base, WEAPONS.shrine, [], 'sukuna').echo >= 0.35 && runStats(base, WEAPONS.pedang, [], 'sukuna').echo === 0);
assert.ok(runStats(base, WEAPONS.pedang, [], 'toji').skillPower < base.skillPower);
// Custom hero heads replace rows of the same width.
for (const c of CLASS_IDS) assert.ok(CLASSES[c].head?.every((r) => r.length === 10) ?? true, `${c}: head rows must be 10 wide`);
assert.ok(WEAPONS.shrine.projectile?.pierce, 'Kai cuts through');
// Class names fit their cell in the class grid (7px font).
for (const c of CLASS_IDS) assert.ok(CLASSES[c].name.length <= 12, `${c}: name too wide`);
// Madara: Susanoo armor only with the war fan.
assert.ok(runStats(base, WEAPONS.gunbai, [], 'madara').damageTaken < runStats(base, WEAPONS.pedang, [], 'madara').damageTaken);
// Hashirama heals on his own; Itachi's Tsukuyomi freezes with any weapon, Amaterasu burns only with his kunai.
assert.equal(runStats(base, WEAPONS.pedang, [], 'hashirama').regen, 2);
assert.ok(runStats(base, WEAPONS.pedang, [], 'itachi').freezeChance > 0);
assert.ok(runStats(base, WEAPONS.kunai, [], 'itachi').burnChance > runStats(base, WEAPONS.pedang, [], 'itachi').burnChance);
// Jack Frost rides the wind; his staff makes hits freeze.
assert.equal(runStats(base, WEAPONS.pedang, [], 'jackFrost').extraJumps, 2);
assert.ok(
  runStats(base, WEAPONS.tongkatFrost, [], 'jackFrost').freezeChance > runStats(base, WEAPONS.pedang, [], 'jackFrost').freezeChance,
);
// Bonus rounds: any mix of Mahoraga, Leviathan and Godzilla (up to all three); never on boss rounds or too early; each
// outclasses the regular boss. Elite rounds: every enemy an elite.
{
  const { SPECIAL, LEVIATHAN, rollSpecials, specialConfig, specialStats, ADAPT_MULT, rollEliteRound, eliteRoundConfig, ELITE_ROUND } =
    await import('./stages.ts');
  const seq =
    (...xs: number[]) =>
    () =>
      xs.shift()!;
  assert.ok(SPECIAL.from <= 7);
  assert.deepEqual(
    rollSpecials(7, () => 0),
    ['mahoraga', 'leviathan', 'godzilla'],
    'all three can come together',
  );
  assert.deepEqual(rollSpecials(7, seq(0, SPECIAL.three, 0, 0)), ['mahoraga', 'leviathan']);
  assert.deepEqual(rollSpecials(7, seq(0, 0.99, 0.2)), ['mahoraga']);
  assert.deepEqual(rollSpecials(7, seq(0, 0.99, 0.5)), ['leviathan']);
  assert.deepEqual(rollSpecials(7, seq(0, 0.99, 0.8)), ['godzilla']);
  assert.equal(rollSpecials(7, () => 0.99).length, 0);
  assert.ok(!rollSpecials(SPECIAL.from - 1, () => 0).length && !rollSpecials(10, () => 0).length && !rollSpecials(15, () => 0).length);
  const one = specialConfig(7, ['leviathan']);
  const two = specialConfig(7, ['mahoraga', 'leviathan']);
  const three = specialConfig(7, ['mahoraga', 'leviathan', 'godzilla']);
  assert.ok(one.boss && one.enemyCount === 0 && one.round === 7);
  for (const k of ['mahoraga', 'leviathan', 'godzilla'] as const)
    assert.ok(
      specialStats(k, one).hp > roundConfig(5).bossHp && specialStats(k, one).dmg > roundConfig(5).bossDamage,
      `${k} outclasses the regular boss`,
    );
  assert.ok(
    specialStats('leviathan', three).hp < specialStats('leviathan', two).hp &&
      specialStats('leviathan', two).hp < specialStats('leviathan', one).hp,
    'the more come together, the less HP each',
  );
  assert.ok(specialStats('godzilla', one).hp > specialStats('leviathan', one).hp, 'Godzilla is the toughest');
  assert.ok(LEVIATHAN.armored < 1 && LEVIATHAN.exposed > 1 && LEVIATHAN.stunMs < LEVIATHAN.exposedMs);
  assert.ok(
    ADAPT_MULT[0] === 1 && ADAPT_MULT.every((x, i) => i === 0 || x < ADAPT_MULT[i - 1]) && ADAPT_MULT.at(-1) === 0,
    'each wheel turn resists more, until Mahoraga is immune',
  );
  assert.ok(rollEliteRound(7, () => 0) && !rollEliteRound(7, () => 0.99));
  assert.ok(!rollEliteRound(10, () => 0) && !rollEliteRound(ELITE_ROUND.from - 1, () => 0), 'no elite round on boss rounds or too early');
  const er = eliteRoundConfig(7);
  assert.ok(er.eliteRound && !er.boss && er.enemyCount >= 3 && er.enemyCount < roundConfig(7).enemyCount);
}
// Samurai: Bushido only with the katana.
assert.equal(runStats(base, WEAPONS.katana, [], 'samurai').dashCrit, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'samurai').dashCrit, 0);
const soldierSave = { ...defaultSave(), cls: 'gunners' as const };
writeSave(soldierSave);
assert.deepEqual(loadSave(), soldierSave);
console.log('game.check ok');
