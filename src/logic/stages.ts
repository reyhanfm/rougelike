export const BOSS_EVERY = 5;

export interface RoundConfig {
  round: number;
  boss: boolean;
  /** 0 on normal rounds, 1 on round 5, 2 on round 10, ... */
  bossTier: number;
  enemyCount: number;
  enemyHp: number;
  enemyDamage: number;
  bossHp: number;
  bossDamage: number;
  /** Bonus round: special bosses (any mix of Mahoraga, Leviathan, Godzilla) instead of the round's enemies. */
  specials?: SpecialBoss[];
  /** Elite round: every enemy is an elite. */
  eliteRound?: boolean;
}

/** Regular boss HP and damage for a boss tier (1 = round 5). */
function bossBase(tier: number): { hp: number; dmg: number } {
  return { hp: 550 * (1 + 0.7 * (tier - 1) + 0.2 * (tier - 1) ** 2), dmg: 20 + 5 * (tier - 1) };
}

export function isBossRound(round: number): boolean {
  return round > 0 && round % BOSS_EVERY === 0;
}

/** Every 10th round: the multi-phase boss with wide, telegraphed attacks. */
export function isPhaseBossRound(round: number): boolean {
  return round > 0 && round % (BOSS_EVERY * 2) === 0;
}

export function roundConfig(round: number): RoundConfig {
  const progress = Math.max(0, round - 1);
  const scale = 1 + 0.24 * progress + 0.018 * progress ** 2;
  const phase = isPhaseBossRound(round);
  const boss = isBossRound(round);
  const tier = boss ? round / BOSS_EVERY : 0;
  return {
    round,
    boss,
    bossTier: tier,
    enemyCount: boss ? 0 : Math.min(12, 4 + Math.floor(round / 2)),
    enemyHp: Math.round(80 * scale),
    enemyDamage: Math.round(14 * (1 + 0.1 * progress)),
    // Every 10th round is the super boss: double HP and hits 30% harder than a regular boss of the same tier.
    bossHp: boss ? Math.round(bossBase(tier).hp * (phase ? 2 : 1)) : 0,
    bossDamage: boss ? Math.round(bossBase(tier).dmg * (phase ? 1.3 : 1)) : 0,
  };
}

export type SpecialBoss = 'mahoraga' | 'leviathan' | 'godzilla';

/**
 * Bonus rounds: from round `from`, a normal round becomes a special boss round with `chance`. It brings three special
 * bosses with chance `three`, two with `two`, else one; `hpShare[n - 1]` of its HP each when n come together.
 */
export const SPECIAL = { from: 4, chance: 0.22, two: 0.28, three: 0.1, hpShare: [1, 0.75, 0.6] } as const;

/** Fixed order: the HUD stacks their bars this way. */
const SPECIAL_KINDS: readonly SpecialBoss[] = ['mahoraga', 'leviathan', 'godzilla'];

/** hp/dmg: multipliers on the regular boss of the coming boss tier. A kill pays souls x`soul` and +`coins`. */
export const SPECIAL_STATS: Record<SpecialBoss, { hp: number; dmg: number; soul: number; coins: number }> = {
  // Low HP for a special: it has to fall before it adapts to everything.
  mahoraga: { hp: 0.8, dmg: 1.4, soul: 4, coins: 15 },
  leviathan: { hp: 2, dmg: 1.3, soul: 4, coins: 15 },
  godzilla: { hp: 3, dmg: 1.6, soul: 8, coins: 40 },
};

/**
 * Mahoraga: every `turnMs` the wheel turns and it adapts one step to every kind of attack that hit it since the last
 * turn (ADAPT_MULT: share of damage that still lands; the last step is immunity). From `barrageAt` turns it adds a
 * follow-up attack. Not beaten within `leaveMs`, it goes back into the shadows.
 */
export const MAHORAGA = { turnMs: 4000, barrageAt: 3, leaveMs: 75000 } as const;

/** Godzilla: regenerates `regen` of its max HP per second; below `enrage` it releases one nuclear pulse and fights faster. */
export const GODZILLA = { regen: 0.008, enrage: 0.3 } as const;

/**
 * Leviathan: its scales (`armor` x max HP, +`armorGrowth` per break) take each hit in full while its HP takes only
 * `armored`. Broken scales stun it for `stunMs` and leave it `exposed` (damage multiplier) for `exposedMs`, then they
 * grow back. Diving heals `diveHeal`. Below `enrage` of its HP it attacks faster and floods the floor.
 */
export const LEVIATHAN = {
  armor: 0.25,
  armorGrowth: 0.15,
  armored: 0.25,
  exposed: 1.5,
  stunMs: 2500,
  exposedMs: 6000,
  diveHeal: 0.04,
  enrage: 0.35,
} as const;

/** What Mahoraga adapts to: each kind of player hit, plus burn and freeze. */
export type AdaptKind = 'basic' | 'skill' | 'ult' | 'proc' | 'burn' | 'freeze';

/** Damage (or freeze time) that still lands after 0, 1, 2... adaptation steps to one kind; the last step is immunity. */
export const ADAPT_MULT = [1, 0.6, 0.3, 0.1, 0] as const;

/** Which special bosses (if any) turn this round into a bonus round: one, two or all three of them. */
export function rollSpecials(round: number, rand: () => number = Math.random): SpecialBoss[] {
  if (round < SPECIAL.from || isBossRound(round) || rand() >= SPECIAL.chance) return [];
  const r = rand();
  const n = r < SPECIAL.three ? 3 : r < SPECIAL.three + SPECIAL.two ? 2 : 1;
  const pool = [...SPECIAL_KINDS];
  const picked: SpecialBoss[] = [];
  while (picked.length < n) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return SPECIAL_KINDS.filter((k) => picked.includes(k));
}

export function specialConfig(round: number, specials: SpecialBoss[]): RoundConfig {
  return { ...roundConfig(round), boss: true, specials, bossTier: Math.max(1, Math.ceil(round / BOSS_EVERY)), enemyCount: 0 };
}

/** HP and damage of one special boss; the more come together, the less HP each. */
export function specialStats(kind: SpecialBoss, cfg: RoundConfig): { hp: number; dmg: number } {
  const b = bossBase(cfg.bossTier);
  const share = SPECIAL.hpShare[Math.max(1, cfg.specials?.length ?? 1) - 1];
  return { hp: Math.round(b.hp * SPECIAL_STATS[kind].hp * share), dmg: Math.round(b.dmg * SPECIAL_STATS[kind].dmg) };
}

/** Elite = mini boss: at most one per normal round, any round (even the first). Big, tough, pays out. */
export const ELITE = { chance: 0.45, hp: 6, dmg: 1.7, soul: 5, coins: 3, scale: 1.5 } as const;

/** Elite round: from round `from`, `chance` per normal round (when no bonus boss came); `share` of the usual count, all elites. */
export const ELITE_ROUND = { from: 3, chance: 0.12, share: 0.5 } as const;

export function rollEliteRound(round: number, rand: () => number = Math.random): boolean {
  return round >= ELITE_ROUND.from && !isBossRound(round) && rand() < ELITE_ROUND.chance;
}

export function eliteRoundConfig(round: number): RoundConfig {
  const c = roundConfig(round);
  return { ...c, eliteRound: true, enemyCount: Math.max(3, Math.ceil(c.enemyCount * ELITE_ROUND.share)) };
}

export type EliteAffix = 'api' | 'es' | 'petir' | 'pemanggil';

/** Each elite rolls one affix: its touch debuff and an extra attack every `every` ms. */
export const ELITE_AFFIXES: Record<EliteAffix, { name: string; debuff?: Debuff; every: number }> = {
  api: { name: 'BERAPI', debuff: 'burn', every: 3500 },
  es: { name: 'BEKU', debuff: 'freeze', every: 4000 },
  petir: { name: 'PETIR', debuff: 'shock', every: 2800 },
  pemanggil: { name: 'PEMANGGIL', every: 6000 },
};

/** Multiplier on enemy pauses between actions: already quicker in round 1, then faster each round, down to 40%. */
export function enemyPace(round: number): number {
  return Math.max(0.4, 0.8 - 0.03 * (round - 1));
}

/** `weight` is the per-enemy-kind soul multiplier (ENEMIES[kind].soul). */
export function soulReward(kind: 'enemy' | 'boss', round: number, soulMult: number, weight = 1): number {
  const base = kind === 'boss' ? 25 * (round / BOSS_EVERY) : 2 + Math.floor(round / 2);
  return Math.round(base * soulMult * weight);
}

export type Debuff = 'burn' | 'freeze' | 'shock' | 'stun' | 'slow' | 'weak' | 'silence';

/** Player debuffs from enemies. burn/shock tick damage; freeze/stun lock; slow halves speed; weak cuts damage; silence blocks skill+ult. */
export const DEBUFFS: Record<Debuff, { name: string; ms: number; color: string }> = {
  burn: { name: 'TERBAKAR', ms: 3000, color: '#ffa300' },
  freeze: { name: 'BEKU', ms: 900, color: '#29adff' },
  shock: { name: 'KESETRUM', ms: 2400, color: '#ffec27' },
  stun: { name: 'PUSING', ms: 700, color: '#fff1e8' },
  slow: { name: 'LAMBAT', ms: 3000, color: '#83769c' },
  weak: { name: 'LEMAH', ms: 4000, color: '#ff77a8' },
  silence: { name: 'BISU', ms: 3000, color: '#c2c3c7' },
};

/** Share of the hit's damage that burn/shock deal again every tick. */
export const DOT_SHARE = 0.1;
export const DOT_TICK_MS = 500;
/** Player damage multiplier while weakened, and speed multiplier while slowed. */
export const WEAK_MULT = 0.7;
export const SLOW_MULT = 0.5;

export type EnemyKind =
  | 'slime'
  | 'bat'
  | 'boar'
  | 'archer'
  | 'eye'
  | 'ghost'
  | 'bomber'
  | 'shield'
  | 'spider'
  | 'beetle'
  | 'imp'
  | 'wraith'
  | 'golem'
  | 'shaman'
  | 'splitter'
  | 'mimic'
  | 'ninja'
  | 'totem'
  | 'worm';

/**
 * hp/dmg/soul are multipliers on the round's base values; `from` is the first round it appears.
 * `debuff` is applied when its touch (or its projectile, unless it casts several) hits the player.
 */
export const ENEMIES: Record<
  EnemyKind,
  { name: string; hp: number; dmg: number; soul: number; from: number; flying: boolean; debuff?: Debuff }
> = {
  slime: { name: 'SLIME', hp: 1, dmg: 1, soul: 1, from: 1, flying: false },
  bat: { name: 'KELELAWAR', hp: 0.6, dmg: 0.8, soul: 1, from: 2, flying: true },
  boar: { name: 'BABI HUTAN', hp: 1.4, dmg: 1.2, soul: 1.5, from: 3, flying: false },
  archer: { name: 'PEMANAH TULANG', hp: 0.8, dmg: 1, soul: 1.5, from: 4, flying: false },
  eye: { name: 'MATA IBLIS', hp: 1.2, dmg: 1, soul: 2, from: 6, flying: true },
  ghost: { name: 'HANTU', hp: 0.9, dmg: 1.1, soul: 2, from: 7, flying: true },
  bomber: { name: 'GOBLIN BOM', hp: 0.9, dmg: 1.3, soul: 2, from: 8, flying: false },
  shield: { name: 'PRAJURIT PERISAI', hp: 1.8, dmg: 1.1, soul: 2.5, from: 10, flying: false },
  spider: { name: 'LABA-LABA', hp: 0.9, dmg: 0.8, soul: 1.5, from: 5, flying: false, debuff: 'slow' },
  beetle: { name: 'KUMBANG PETIR', hp: 0.7, dmg: 0.9, soul: 1.5, from: 6, flying: false, debuff: 'shock' },
  imp: { name: 'IMP API', hp: 0.8, dmg: 0.9, soul: 2, from: 7, flying: true, debuff: 'burn' },
  wraith: { name: 'ARWAH ES', hp: 1, dmg: 0.9, soul: 2, from: 9, flying: true, debuff: 'freeze' },
  golem: { name: 'GOLEM BATU', hp: 2.4, dmg: 1.4, soul: 3, from: 11, flying: false, debuff: 'stun' },
  shaman: { name: 'DUKUN KUTUK', hp: 1, dmg: 0.8, soul: 2.5, from: 12, flying: false, debuff: 'weak' },
  splitter: { name: 'SLIME RAKSASA', hp: 1.6, dmg: 1, soul: 1.5, from: 4, flying: false },
  mimic: { name: 'PETI MIMIC', hp: 1.3, dmg: 1.3, soul: 3, from: 6, flying: false },
  ninja: { name: 'NINJA BAYANGAN', hp: 0.9, dmg: 1.2, soul: 2, from: 8, flying: false },
  totem: { name: 'TOTEM ARWAH', hp: 1.5, dmg: 0.5, soul: 2.5, from: 10, flying: false },
  worm: { name: 'CACING PASIR', hp: 1.2, dmg: 1.2, soul: 2, from: 12, flying: false, debuff: 'slow' },
};

const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];

export function pickEnemies(round: number, count: number, rand: () => number = Math.random): EnemyKind[] {
  const pool = ENEMY_KINDS.filter((k) => ENEMIES[k].from <= round);
  return Array.from({ length: count }, () => pool[Math.floor(rand() * pool.length)]);
}

export type BossKind = 'knight' | 'slimeKing' | 'lich' | 'demonLord' | 'mahoraga' | 'leviathan' | 'godzilla';
export type BossPattern =
  | 'charge'
  | 'slam'
  | 'fan'
  | 'hop'
  | 'spit'
  | 'summon'
  | 'ring'
  | 'meteor'
  | 'bats'
  // Phase boss: wide area attacks with a warning first.
  | 'pillars'
  | 'laser'
  | 'quake'
  | 'sweep'
  | 'legion'
  // Mahoraga: Sword of Extermination, and a chase of strikes once it has adapted.
  | 'exterminate'
  | 'barrage'
  // Leviathan: submerge, then erupt under the player.
  | 'dive'
  // Godzilla: atomic breath, tail swipe, roar.
  | 'breath'
  | 'tail'
  | 'roar';

const BOSS_ORDER: readonly BossKind[] = ['knight', 'slimeKing', 'lich'];

export const BOSSES: Record<BossKind, { name: string; patterns: readonly BossPattern[] }> = {
  knight: { name: 'KSATRIA KELAM', patterns: ['charge', 'slam', 'fan'] },
  slimeKing: { name: 'RAJA SLIME', patterns: ['hop', 'spit', 'summon'] },
  lich: { name: 'LICH', patterns: ['ring', 'meteor', 'bats'] },
  demonLord: { name: 'RAJA IBLIS', patterns: ['pillars', 'laser', 'quake', 'sweep', 'fan', 'charge', 'meteor', 'legion'] },
  mahoraga: { name: 'MAHORAGA', patterns: ['charge', 'slam', 'exterminate'] },
  leviathan: { name: 'LEVIATHAN', patterns: ['charge', 'ring', 'laser', 'sweep', 'dive'] },
  godzilla: { name: 'GODZILLA', patterns: ['charge', 'quake', 'tail', 'breath', 'roar'] },
};

/** Raja Iblis patterns per phase (HP above 66%, above 33%, below). */
export const DEMON_PHASES: readonly (readonly BossPattern[])[] = [
  ['pillars', 'fan', 'charge'],
  ['pillars', 'laser', 'quake', 'fan'],
  ['pillars', 'laser', 'quake', 'sweep', 'meteor', 'legion'],
];

/** Phase (1-3) from remaining HP. */
export function bossPhase(hp: number, maxHp: number): number {
  const f = hp / maxHp;
  return f > 2 / 3 ? 1 : f > 1 / 3 ? 2 : 3;
}

/** Round 10, 20, 30... is Raja Iblis; 5, 15, 25... rotate knight, slime king, lich. */
export function bossKind(tier: number): BossKind {
  if (tier % 2 === 0) return 'demonLord';
  return BOSS_ORDER[((tier - 1) / 2) % BOSS_ORDER.length];
}

/** How many times this boss has been met before; each unlocks one more pattern and a new color. */
export function bossLoop(tier: number): number {
  return tier % 2 === 0 ? tier / 2 - 1 : Math.floor((tier - 1) / 2 / BOSS_ORDER.length);
}

export function bossPatterns(kind: BossKind, tier: number): readonly BossPattern[] {
  const all = BOSSES[kind].patterns;
  return all.slice(0, Math.min(all.length, 2 + bossLoop(tier)));
}

/** One-way platforms in tile units (8px). Arena is 40x22 tiles, floor at row 21. */
export type Platform = { x: number; y: number; w: number };

export const LAYOUTS: readonly (readonly Platform[])[] = [
  [
    { x: 4, y: 16, w: 8 },
    { x: 28, y: 16, w: 8 },
    { x: 15, y: 11, w: 10 },
  ],
  [
    { x: 2, y: 13, w: 10 },
    { x: 16, y: 16, w: 8 },
    { x: 28, y: 13, w: 10 },
    { x: 16, y: 8, w: 8 },
  ],
  [
    { x: 6, y: 17, w: 6 },
    { x: 13, y: 13, w: 6 },
    { x: 21, y: 13, w: 6 },
    { x: 28, y: 17, w: 6 },
  ],
  [
    { x: 0, y: 15, w: 12 },
    { x: 28, y: 15, w: 12 },
    { x: 14, y: 10, w: 12 },
  ],
];

/** Boss arena: few platforms so the fight stays readable. */
export const BOSS_LAYOUT: readonly Platform[] = [
  { x: 3, y: 15, w: 7 },
  { x: 30, y: 15, w: 7 },
];
