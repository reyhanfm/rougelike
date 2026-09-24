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
assert.ok(b2.bossHp > b1.bossHp && b3.bossHp > b2.bossHp);
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
const late = pickEnemies(10, 200);
for (const k of Object.keys(ENEMIES)) assert.ok(late.includes(k as never), `${k} never spawns by round 10`);
for (const k of pickEnemies(3, 100)) assert.ok(ENEMIES[k].from <= 3);
assert.deepEqual(pickEnemies(3, 3, seq([0, 0.5, 0.99])), ['slime', 'bat', 'boar']);

// Bosses rotate kinds; later loops unlock their third pattern.
assert.deepEqual([1, 2, 3, 4].map(bossKind), ['knight', 'slimeKing', 'lich', 'knight']);
assert.equal(bossPatterns('knight', 1).length, 2);
assert.deepEqual(bossPatterns('knight', 4), BOSSES.knight.patterns);
assert.deepEqual(bossPatterns('lich', 30), BOSSES.lich.patterns);

// Loot: weapon + items change stats; caps hold.
const plain = runStats(base, WEAPONS.pedang, []);
assert.equal(plain.damage, base.damage);
assert.ok(runStats(base, WEAPONS.kapak, []).damage > plain.damage);
assert.ok(runStats(base, WEAPONS.belati, []).swingCooldown < plain.swingCooldown);
const stacked = runStats(base, WEAPONS.pedang, ['batu', 'batu', 'jantung', 'sayap', 'sayap', 'sayap', 'duri']);
assert.equal(stacked.damage, Math.round(base.damage * 1.25 * 1.25));
assert.equal(stacked.maxHp, base.maxHp + 30);
assert.equal(stacked.extraJumps, 3);
assert.equal(stacked.thorns, 15);
assert.equal(runStats(base, WEAPONS.belati, Array(20).fill('sarung')).swingCooldown, 0.1);
assert.equal(runStats(maxed, WEAPONS.belati, Array(10).fill('mata')).critChance, 0.9);

// INT powers skills.
assert.ok(up.skillCdMult < base.skillCdMult && up.skillPower > base.skillPower);
assert.equal(maxed.skillCdMult, 0.5);

// Combos: chain within the window, restart after it, wrap at the end.
assert.equal(nextCombo(-1, 0, 3), 0);
assert.equal(nextCombo(0, 100, 3), 1);
assert.equal(nextCombo(1, COMBO_WINDOW_MS, 3), 2);
assert.equal(nextCombo(2, 0, 3), 0);
assert.equal(nextCombo(1, COMBO_WINDOW_MS + 1, 3), 0);

// Every weapon: a varied combo, a skill with a cooldown, an ultimate.
for (const w of Object.values(WEAPONS)) {
  assert.ok(w.combo.length >= 2, `${w.id}: combo too short`);
  assert.ok(new Set(w.combo.map((m) => JSON.stringify(m))).size >= 2, `${w.id}: combo is one repeated move`);
  assert.ok(w.skill.cd > 0 && w.skill.name && w.ult.name, `${w.id}: missing skill/ult`);
  for (const m of w.combo) assert.ok(m.anim === 'shoot' ? m.arrows?.length : m.reach.w > 0, `${w.id}: move without a hit`);
}

// Air moves: every weapon has one, and hitboxes sit where the move says.
for (const w of Object.values(WEAPONS)) assert.ok(w.air.name && (w.air.arrows?.length || w.air.reach.w > 0), `${w.id}: no air move`);
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
  'hatiDewa',
  'sayapDewa',
  'sayap',
  'sayap',
  'perisai',
  'perisai',
  'perisai',
  'perisai',
  'perisai',
  'perisai',
]);
assert.equal(god.critMult, 3);
assert.equal(god.maxHp, base.maxHp + 100);
assert.equal(god.regen, 2);
assert.equal(god.extraJumps, 3);
assert.equal(god.damageTaken, 0.4);

// Classes: each has its own weapon; the synergy only applies with that weapon.
const { CLASSES, CLASS_IDS, hasSynergy } = await import('./classes.ts');
assert.equal(new Set(CLASS_IDS.map((c) => CLASSES[c].color)).size, CLASS_IDS.length, 'each class has its own color');
for (const c of CLASS_IDS) assert.ok(CLASSES[c].weapon in WEAPONS && CLASSES[c].color in PALETTE_CHECK, `${c}: bad weapon/color`);
assert.ok(hasSynergy('berserker', 'kapak') && !hasSynergy('berserker', 'pedang'));
assert.equal(runStats(base, WEAPONS.kapak, [], 'berserker').lifesteal, 0.06);
assert.equal(runStats(base, WEAPONS.pedang, [], 'berserker').lifesteal, 0);
assert.equal(runStats(base, WEAPONS.pedang, [], 'berserker').rage, 0.3, 'class trait applies with any weapon');
assert.equal(runStats(base, WEAPONS.busur, [], 'pemburu').pierceArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'ksatria').maxHp, Math.round(base.maxHp * 1.3));
assert.equal(runStats(base, WEAPONS.belati, [], 'pembunuh').critMult, 2);
// Magic Archer: homing is the class trait (any weapon), the extra arrow needs the bow.
assert.equal(runStats(base, WEAPONS.pedang, [], 'magicArcher').homingArrows, 1);
assert.equal(runStats(base, WEAPONS.pedang, [], 'magicArcher').extraArrows, 0);
assert.equal(runStats(base, WEAPONS.busur, [], 'magicArcher').extraArrows, 1);
assert.equal(runStats(base, WEAPONS.busur, [], 'pemburu').homingArrows, 0);

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
assert.equal(runStats(base, WEAPONS.pedang, ['tapal', 'tapal']).coinBonus, 2);
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

console.log('game.check ok');
