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
}

export function isBossRound(round: number): boolean {
  return round > 0 && round % BOSS_EVERY === 0;
}

export function roundConfig(round: number): RoundConfig {
  const progress = Math.max(0, round - 1);
  const scale = 1 + 0.16 * progress + 0.012 * progress ** 2;
  const boss = isBossRound(round);
  const tier = boss ? round / BOSS_EVERY : 0;
  return {
    round,
    boss,
    bossTier: tier,
    enemyCount: boss ? 0 : Math.min(8, 2 + Math.floor(round / 2)),
    enemyHp: Math.round(20 * scale),
    enemyDamage: Math.round(8 * (1 + 0.065 * progress)),
    bossHp: boss ? Math.round(260 * (1 + 0.65 * (tier - 1) + 0.18 * (tier - 1) ** 2)) : 0,
    bossDamage: boss ? 14 + 4 * (tier - 1) : 0,
  };
}

/** `weight` is the per-enemy-kind soul multiplier (ENEMIES[kind].soul). */
export function soulReward(kind: 'enemy' | 'boss', round: number, soulMult: number, weight = 1): number {
  const base = kind === 'boss' ? 25 * (round / BOSS_EVERY) : 2 + Math.floor(round / 2);
  return Math.round(base * soulMult * weight);
}

export type EnemyKind = 'slime' | 'bat' | 'boar' | 'archer' | 'eye' | 'ghost' | 'bomber' | 'shield';

/** hp/dmg/soul are multipliers on the round's base values; `from` is the first round it appears. */
export const ENEMIES: Record<EnemyKind, { name: string; hp: number; dmg: number; soul: number; from: number; flying: boolean }> = {
  slime: { name: 'SLIME', hp: 1, dmg: 1, soul: 1, from: 1, flying: false },
  bat: { name: 'KELELAWAR', hp: 0.6, dmg: 0.8, soul: 1, from: 2, flying: true },
  boar: { name: 'BABI HUTAN', hp: 1.4, dmg: 1.2, soul: 1.5, from: 3, flying: false },
  archer: { name: 'PEMANAH TULANG', hp: 0.8, dmg: 1, soul: 1.5, from: 4, flying: false },
  eye: { name: 'MATA IBLIS', hp: 1.2, dmg: 1, soul: 2, from: 6, flying: true },
  ghost: { name: 'HANTU', hp: 0.9, dmg: 1.1, soul: 2, from: 7, flying: true },
  bomber: { name: 'GOBLIN BOM', hp: 0.9, dmg: 1.3, soul: 2, from: 8, flying: false },
  shield: { name: 'PRAJURIT PERISAI', hp: 1.8, dmg: 1.1, soul: 2.5, from: 10, flying: false },
};

const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];

export function pickEnemies(round: number, count: number, rand: () => number = Math.random): EnemyKind[] {
  const pool = ENEMY_KINDS.filter((k) => ENEMIES[k].from <= round);
  return Array.from({ length: count }, () => pool[Math.floor(rand() * pool.length)]);
}

export type BossKind = 'knight' | 'slimeKing' | 'lich';
export type BossPattern = 'charge' | 'slam' | 'fan' | 'hop' | 'spit' | 'summon' | 'ring' | 'meteor' | 'bats';

const BOSS_ORDER: readonly BossKind[] = ['knight', 'slimeKing', 'lich'];

export const BOSSES: Record<BossKind, { name: string; patterns: readonly BossPattern[] }> = {
  knight: { name: 'KSATRIA KELAM', patterns: ['charge', 'slam', 'fan'] },
  slimeKing: { name: 'RAJA SLIME', patterns: ['hop', 'spit', 'summon'] },
  lich: { name: 'LICH', patterns: ['ring', 'meteor', 'bats'] },
};

/** Bosses rotate each tier: 5 knight, 10 slime king, 15 lich, 20 knight again... */
export function bossKind(tier: number): BossKind {
  return BOSS_ORDER[(tier - 1) % BOSS_ORDER.length];
}

/** Completed boss rotations; each one unlocks one more pattern and a new color. */
export function bossLoop(tier: number): number {
  return Math.floor((tier - 1) / BOSS_ORDER.length);
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
