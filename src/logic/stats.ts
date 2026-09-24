export type StatKey = 'str' | 'int' | 'agi' | 'dex';
export type StatLevels = Record<StatKey, number>;

export const STAT_KEYS: readonly StatKey[] = ['str', 'int', 'agi', 'dex'];

export const STAT_INFO: Record<StatKey, { label: string; desc: string }> = {
  str: { label: 'STR', desc: 'Damage senjata & max HP' },
  int: { label: 'INT', desc: 'Skill kuat, cooldown & soul' },
  agi: { label: 'AGI', desc: 'Lari cepat & dash sering' },
  dex: { label: 'DEX', desc: 'Serang cepat & peluang kritis' },
};

export interface Derived {
  damage: number;
  maxHp: number;
  soulMult: number;
  /** Invulnerability after taking a hit, ms. */
  iframes: number;
  /** Horizontal run speed, px/s (arena is 320px wide). */
  speed: number;
  /** Seconds. */
  dashCooldown: number;
  /** Seconds between sword swings. */
  swingCooldown: number;
  critChance: number;
  /** Mid-air jumps (items only). */
  extraJumps: number;
  healOnKill: number;
  /** Damage dealt back to enemies that touch the player. */
  thorns: number;
  /** Multiplier on skill cooldowns. */
  skillCdMult: number;
  /** Multiplier on skill and ultimate damage. */
  skillPower: number;
  /** Multiplier on damage the player takes. */
  damageTaken: number;
  /** Damage multiplier of a critical hit. */
  critMult: number;
  ultGainMult: number;
  /** HP and ult meter regained per second. */
  regen: number;
  ultRegen: number;
  /** Chance a basic hit strikes again for half damage. */
  echo: number;
  /** Lightning bolts that jump to the nearest enemy on each kill. */
  killBolt: number;
  /** Fraction of damage dealt returned as HP. */
  lifesteal: number;
  /** Extra damage multiplier while below half HP. */
  rage: number;
  // Class synergy switches (0 = off, 1 = on).
  finisherWave: number;
  critResetsDash: number;
  pogoQuake: number;
  pierceArrows: number;
  /** Player arrows steer toward the nearest enemy. */
  homingArrows: number;
  /** Extra arrows per basic bow shot. */
  extraArrows: number;
  /** Extra coins per cleared round. */
  coinBonus: number;
  /** Homing souls released on each kill. */
  killSouls: number;
  /** Enemies left below this fraction of max HP die instantly (half for bosses). */
  execute: number;
}

export function derive(s: StatLevels): Derived {
  return {
    damage: 10 + 2 * s.str,
    maxHp: 100 + 5 * s.str,
    soulMult: 1 + 0.05 * s.int,
    iframes: Math.min(1500, 600 + 20 * s.int),
    speed: Math.min(150, 90 + 3 * s.agi),
    dashCooldown: Math.max(0.4, 1.2 - 0.04 * s.agi),
    swingCooldown: Math.max(0.18, 0.45 - 0.01 * s.dex),
    critChance: Math.min(0.5, 0.02 * s.dex),
    extraJumps: 0,
    healOnKill: 0,
    thorns: 0,
    skillCdMult: Math.max(0.5, 1 - 0.02 * s.int),
    skillPower: 1 + 0.03 * s.int,
    damageTaken: 1,
    critMult: 1.5,
    ultGainMult: 1,
    regen: 0,
    ultRegen: 0,
    echo: 0,
    killBolt: 0,
    lifesteal: 0,
    rage: 0,
    finisherWave: 0,
    critResetsDash: 0,
    pogoQuake: 0,
    pierceArrows: 0,
    homingArrows: 0,
    extraArrows: 0,
    coinBonus: 0,
    killSouls: 0,
    execute: 0,
  };
}

export function upgradeCost(level: number): number {
  return Math.floor(10 * 1.15 ** level);
}
