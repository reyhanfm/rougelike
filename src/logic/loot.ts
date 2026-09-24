import type { Derived } from './stats.ts';
import { CLASSES, hasSynergy, type ClassId } from './classes.ts';

export type WeaponId = 'pedang' | 'belati' | 'tombak' | 'kapak' | 'busur' | 'sabit' | 'senapan';

export type MoveAnim = 'down' | 'up' | 'overhead' | 'thrust' | 'shoot' | 'spin' | 'plunge';

/** One step of a weapon's attack combo. dmg/cd are relative to the weapon. */
export interface Move {
  anim: MoveAnim;
  dmg: number;
  /** Recovery multiplier after this move (finishers recover slower). */
  cd: number;
  ms: number;
  /** Melee hitbox in px, in front of the player. */
  reach: { w: number; h: number };
  knockback: number;
  /** Forward push during the move, px/s. */
  lunge?: number;
  /** Ranged attack: projectile angles (radians) relative to facing. */
  angles?: number[];
  /** Where the hitbox sits: in front (default), centered on the player, or under the feet. */
  hitbox?: 'front' | 'around' | 'below';
  /** Air moves: velocity forced for the move (vx is multiplied by facing). */
  dive?: { vx: number; vy: number };
  /** Upward velocity on the first hit (pogo). */
  bounce?: number;
  /** Air moves: small upward push when used. */
  hover?: number;
  /** Hitbox stays live until landing; then an area slam of this radius. */
  slam?: number;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  desc: string;
  dmg: number;
  cd: number;
  crit: number;
  /** Ranged weapons use the same shot pipeline with their own texture and speed. */
  projectile?: { texture: string; speed: number };
  automatic?: boolean;
  combo: Move[];
  /** Used instead of the combo when attacking in mid-air. */
  air: Move & { name: string };
  /** Cooldown skill (key L). cd in seconds. */
  skill: { name: string; desc: string; cd: number };
  /** Ultimate (key I), spends a full ult meter. */
  ult: { name: string; desc: string };
}

const box = (w: number, h: number) => ({ w, h });

export const WEAPONS: Record<WeaponId, Weapon> = {
  pedang: {
    id: 'pedang',
    name: 'PEDANG',
    desc: 'SEIMBANG, COMBO 3',
    dmg: 1,
    cd: 1,
    crit: 0,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 120, reach: box(20, 20), knockback: 100 },
      { anim: 'up', dmg: 1, cd: 1, ms: 120, reach: box(20, 22), knockback: 100 },
      { anim: 'thrust', dmg: 1.6, cd: 1.4, ms: 160, reach: box(28, 10), knockback: 220, lunge: 160 },
    ],
    air: {
      name: 'TEBASAN PUTAR',
      anim: 'spin',
      dmg: 1.1,
      cd: 1.2,
      ms: 220,
      reach: box(28, 28),
      knockback: 140,
      hitbox: 'around',
      hover: 90,
    },
    skill: { name: 'TEBASAN ANGIN', desc: 'GELOMBANG PEDANG MENEMBUS', cd: 4 },
    ult: { name: 'BADAI PEDANG', desc: 'PUTARAN PEDANG, KEBAL' },
  },
  belati: {
    id: 'belati',
    name: 'BELATI',
    desc: 'CEPAT, KRITIS +15%, COMBO 4',
    dmg: 0.6,
    cd: 0.5,
    crit: 0.15,
    combo: [
      { anim: 'thrust', dmg: 1, cd: 1, ms: 70, reach: box(14, 10), knockback: 40 },
      { anim: 'thrust', dmg: 1, cd: 1, ms: 70, reach: box(14, 10), knockback: 40 },
      { anim: 'down', dmg: 1.2, cd: 1, ms: 80, reach: box(16, 16), knockback: 60 },
      { anim: 'up', dmg: 1.8, cd: 1.8, ms: 110, reach: box(18, 20), knockback: 160, lunge: 140 },
    ],
    air: {
      name: 'TIKAMAN MENUKIK',
      anim: 'plunge',
      dmg: 1.5,
      cd: 1.3,
      ms: 260,
      reach: box(12, 14),
      knockback: 80,
      hitbox: 'below',
      dive: { vx: 150, vy: 300 },
      bounce: 200,
    },
    skill: { name: 'LEMPAR BELATI', desc: '3 BELATI TERBANG', cd: 3 },
    ult: { name: 'TARIAN BAYANGAN', desc: 'TELEPORT MENEBAS 6 MUSUH' },
  },
  tombak: {
    id: 'tombak',
    name: 'TOMBAK',
    desc: 'TUSUKAN JAUH, COMBO 3',
    dmg: 1.1,
    cd: 1.1,
    crit: 0,
    combo: [
      { anim: 'thrust', dmg: 1, cd: 1, ms: 140, reach: box(34, 8), knockback: 150 },
      { anim: 'thrust', dmg: 1.1, cd: 1, ms: 140, reach: box(34, 8), knockback: 150, lunge: 110 },
      { anim: 'down', dmg: 1.3, cd: 1.4, ms: 200, reach: box(30, 26), knockback: 200 },
    ],
    air: {
      name: 'TUSUKAN BAWAH',
      anim: 'plunge',
      dmg: 1.2,
      cd: 0.8,
      ms: 220,
      reach: box(8, 24),
      knockback: 60,
      hitbox: 'below',
      bounce: 240,
    },
    skill: { name: 'LOMPATAN NAGA', desc: 'LOMPAT, MENUKIK, HANTAM', cd: 5 },
    ult: { name: 'HUJAN TOMBAK', desc: 'TOMBAK JATUH DI SELURUH ARENA' },
  },
  kapak: {
    id: 'kapak',
    name: 'KAPAK',
    desc: 'BERAT, TEBASAN LEBAR',
    dmg: 1.8,
    cd: 1.7,
    crit: 0,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 180, reach: box(24, 30), knockback: 220 },
      { anim: 'up', dmg: 0.9, cd: 1, ms: 180, reach: box(24, 30), knockback: 180 },
      { anim: 'overhead', dmg: 1.5, cd: 1.5, ms: 260, reach: box(28, 34), knockback: 300, lunge: 60 },
    ],
    air: {
      name: 'HANTAMAN METEOR',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.5,
      ms: 1500,
      reach: box(14, 18),
      knockback: 250,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 32,
    },
    skill: { name: 'PUTARAN KAPAK', desc: 'BERPUTAR MENGHANTAM SEKITAR', cd: 6 },
    ult: { name: 'GEMPA BUMI', desc: 'HANTAMAN + GELOMBANG TANAH' },
  },
  busur: {
    id: 'busur',
    name: 'BUSUR',
    desc: 'PANAH JARAK JAUH',
    projectile: { texture: 'arrow', speed: 260 },
    dmg: 0.8,
    cd: 1.1,
    crit: 0.05,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 0.9, cd: 1.5, ms: 140, reach: box(0, 0), knockback: 80, angles: [-0.12, 0, 0.12] },
    ],
    air: {
      name: 'PANAH MIRING',
      anim: 'shoot',
      dmg: 0.9,
      cd: 1.3,
      ms: 120,
      reach: box(0, 0),
      knockback: 60,
      angles: [0.45, 0.8, 1.15],
      hover: 70,
    },
    skill: { name: 'PANAH KIPAS', desc: '5 PANAH MENYEBAR', cd: 4 },
    ult: { name: 'HUJAN PANAH', desc: 'PANAH JATUH KE SEMUA MUSUH' },
  },
  sabit: {
    id: 'sabit',
    name: 'SABIT MAUT',
    desc: 'SAPUAN LEBAR, COMBO 3',
    dmg: 1.3,
    cd: 1.3,
    crit: 0.05,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 150, reach: box(30, 22), knockback: 120 },
      { anim: 'up', dmg: 1, cd: 1, ms: 150, reach: box(30, 22), knockback: 120 },
      { anim: 'spin', dmg: 1.6, cd: 1.5, ms: 240, reach: box(40, 30), knockback: 180, hitbox: 'around' },
    ],
    air: {
      name: 'TEBASAN BULAN',
      anim: 'spin',
      dmg: 1.2,
      cd: 1.2,
      ms: 220,
      reach: box(32, 32),
      knockback: 140,
      hitbox: 'around',
      hover: 60,
    },
    skill: { name: 'TUAI JIWA', desc: 'TARIK MUSUH SEKITAR LALU TEBAS', cd: 5 },
    ult: { name: 'PANEN MAUT', desc: 'TEBAS SEMUA MUSUH, PULIH TIAP KENA' },
  },
  senapan: {
    id: 'senapan',
    name: 'SENAPAN',
    desc: 'OTOMATIS, TAHAN SERANG',
    dmg: 0.6,
    cd: 0.65,
    crit: 0.05,
    projectile: { texture: 'bullet', speed: 360 },
    automatic: true,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 65, reach: box(0, 0), knockback: 12, angles: [0] },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 65, reach: box(0, 0), knockback: 12, angles: [0] },
      { anim: 'shoot', dmg: 1.25, cd: 1.25, ms: 90, reach: box(0, 0), knockback: 18, angles: [0] },
    ],
    air: { name: 'TEMBAK MENUKIK', anim: 'shoot', dmg: 1, cd: 1.1, ms: 80, reach: box(0, 0), knockback: 12, angles: [0.35] },
    skill: { name: 'GRANAT', desc: 'LEMPAR GRANAT, LEDAKAN AREA', cd: 5 },
    ult: { name: 'TEMBAKAN PENEKAN', desc: '12 PELURU MENEMBUS, ARAH TERKUNCI' },
  },
};

/** How long after an attack becomes ready the next press still continues the combo. */
export const COMBO_WINDOW_MS = 400;

/** Next combo step: continue if pressed within the window, else restart at 0. */
export function nextCombo(prev: number, msSinceReady: number, length: number): number {
  return prev >= 0 && msSinceReady <= COMBO_WINDOW_MS ? (prev + 1) % length : 0;
}

/** Hitbox rectangle (top-left + size) for a move, for a player at (x, y) facing +-1. */
export function moveHitbox(m: Move, x: number, y: number, facing: number): { x: number; y: number; w: number; h: number } {
  const { w, h } = m.reach;
  if (m.hitbox === 'around') return { x: x - w / 2, y: y - h / 2, w, h };
  if (m.hitbox === 'below') return { x: x - w / 2, y: y + 2, w, h };
  return { x: facing > 0 ? x + 2 : x - 2 - w, y: y - h / 2 - 1, w, h };
}

/** Ult meter gains (out of 100). */
export const ULT_GAIN = { basic: 4, skill: 2, kill: 6 } as const;

export type Rarity = 'biasa' | 'rare' | 'legend' | 'godly';

export const RARITY_COLOR: Record<Rarity, string> = {
  biasa: '#fff1e8',
  rare: '#29adff',
  legend: '#ff77a8',
  godly: '#ffec27',
};

export type ItemId =
  | 'batu'
  | 'sepatu'
  | 'jantung'
  | 'taring'
  | 'mata'
  | 'sarung'
  | 'jubah'
  | 'sayap'
  | 'kantong'
  | 'duri'
  | 'cincin'
  | 'sabuk'
  | 'gulungan'
  | 'jimat'
  | 'lonceng'
  | 'tapal'
  | 'roti'
  | 'tulang'
  | 'tengkorak'
  | 'lentera'
  | 'mahkotaMaut'
  | 'jam'
  | 'kristal'
  | 'perisai'
  | 'kalung'
  | 'mahkota'
  | 'phoenix'
  | 'gema'
  | 'petir'
  | 'hatiDewa'
  | 'mataDewa'
  | 'sayapDewa'
  | 'jiwaAbadi';

export interface Item {
  name: string;
  desc: string;
  rarity: Rarity;
  apply(s: Derived): void;
}

export const ITEMS: Record<ItemId, Item> = {
  batu: { name: 'BATU ASAH', desc: 'DAMAGE +15%', rarity: 'biasa', apply: (s) => void (s.damage *= 1.15) },
  sepatu: { name: 'SEPATU ANGIN', desc: 'LARI +15%', rarity: 'biasa', apply: (s) => void (s.speed *= 1.15) },
  jantung: { name: 'JANTUNG NAGA', desc: 'MAX HP +30', rarity: 'biasa', apply: (s) => void (s.maxHp += 30) },
  taring: { name: 'TARING VAMPIR', desc: '+2 HP TIAP MEMBUNUH', rarity: 'biasa', apply: (s) => void (s.healOnKill += 2) },
  mata: { name: 'MATA ELANG', desc: 'KRITIS +10%', rarity: 'biasa', apply: (s) => void (s.critChance += 0.1) },
  sarung: { name: 'SARUNG BESI', desc: 'JEDA SERANG -12%', rarity: 'biasa', apply: (s) => void (s.swingCooldown *= 0.88) },
  jubah: { name: 'JUBAH BAYANG', desc: 'COOLDOWN DASH -20%', rarity: 'biasa', apply: (s) => void (s.dashCooldown *= 0.8) },
  sayap: { name: 'SAYAP PERI', desc: '+1 LOMPAT DI UDARA', rarity: 'biasa', apply: (s) => void (s.extraJumps += 1) },
  kantong: { name: 'KANTONG JIWA', desc: 'SOUL +30%', rarity: 'biasa', apply: (s) => void (s.soulMult *= 1.3) },
  duri: { name: 'BAJU DURI', desc: 'PANTUL 8 DAMAGE', rarity: 'biasa', apply: (s) => void (s.thorns += 8) },
  cincin: { name: 'CINCIN KEBAL', desc: 'KEBAL +0.3 DTK SETELAH KENA', rarity: 'biasa', apply: (s) => void (s.iframes += 300) },
  sabuk: {
    name: 'SABUK TITAN',
    desc: 'MAX HP +15, DAMAGE DITERIMA -5%',
    rarity: 'biasa',
    apply: (s) => {
      s.maxHp += 15;
      s.damageTaken *= 0.95;
    },
  },
  gulungan: { name: 'GULUNGAN MANTRA', desc: 'DAMAGE SKILL & ULTI +20%', rarity: 'biasa', apply: (s) => void (s.skillPower *= 1.2) },
  jimat: { name: 'JIMAT KILAT', desc: 'METER ULTI +20% CEPAT', rarity: 'biasa', apply: (s) => void (s.ultGainMult *= 1.2) },
  lonceng: {
    name: 'LONCENG PERANG',
    desc: 'DAMAGE +10%, KRITIS +5%',
    rarity: 'biasa',
    apply: (s) => {
      s.damage *= 1.1;
      s.critChance += 0.05;
    },
  },
  tapal: {
    name: 'TAPAL KUDA',
    desc: '+1 KOIN TIAP ROUND, SOUL +10%',
    rarity: 'biasa',
    apply: (s) => {
      s.coinBonus += 1;
      s.soulMult *= 1.1;
    },
  },

  jam: { name: 'JAM PASIR', desc: 'COOLDOWN SKILL -25%', rarity: 'rare', apply: (s) => void (s.skillCdMult *= 0.75) },
  kristal: { name: 'KRISTAL JIWA', desc: 'METER ULTI +50% CEPAT', rarity: 'rare', apply: (s) => void (s.ultGainMult *= 1.5) },
  perisai: { name: 'PERISAI TUA', desc: 'DAMAGE DITERIMA -15%', rarity: 'rare', apply: (s) => void (s.damageTaken *= 0.85) },
  kalung: { name: 'KALUNG TAJAM', desc: 'PENGALI KRITIS +0.5', rarity: 'rare', apply: (s) => void (s.critMult += 0.5) },

  mahkota: {
    name: 'MAHKOTA RAJA',
    desc: 'DAMAGE, HP +20%, LARI +10%',
    rarity: 'legend',
    apply: (s) => {
      s.damage *= 1.2;
      s.maxHp *= 1.2;
      s.speed *= 1.1;
    },
  },
  // Consumed by RunScene when the player would die.
  phoenix: { name: 'BULU PHOENIX', desc: 'BANGKIT SEKALI, 50% HP', rarity: 'legend', apply: () => undefined },
  gema: { name: 'GEMA PEDANG', desc: '30% HIT: ECHO 50% DAMAGE', rarity: 'legend', apply: (s) => void (s.echo += 0.3) },
  petir: { name: 'SEGEL PETIR', desc: 'MEMBUNUH = PETIR MENYAMBAR', rarity: 'legend', apply: (s) => void (s.killBolt += 1) },

  hatiDewa: {
    name: 'HATI DEWA',
    desc: 'MAX HP +100, PULIH 2 HP/DTK',
    rarity: 'godly',
    apply: (s) => {
      s.maxHp += 100;
      s.regen += 2;
    },
  },
  mataDewa: {
    name: 'MATA DEWA',
    desc: 'KRITIS +30%, PENGALI KRITIS +1',
    rarity: 'godly',
    apply: (s) => {
      s.critChance += 0.3;
      s.critMult += 1;
    },
  },
  sayapDewa: {
    name: 'SAYAP DEWA',
    desc: '+2 LOMPAT UDARA, DASH X3',
    rarity: 'godly',
    apply: (s) => {
      s.extraJumps += 2;
      s.dashCooldown *= 0.3;
      s.iframes += 400;
    },
  },
  roti: { name: 'ROTI HANGAT', desc: 'PULIH 0.5 HP/DTK', rarity: 'biasa', apply: (s) => void (s.regen += 0.5) },
  tulang: { name: 'KALUNG TULANG', desc: 'DAMAGE +3', rarity: 'biasa', apply: (s) => void (s.damage += 3) },
  tengkorak: {
    name: 'TENGKORAK KUTUK',
    desc: 'DAMAGE +35%, DITERIMA +15%',
    rarity: 'rare',
    apply: (s) => {
      s.damage *= 1.35;
      s.damageTaken *= 1.15;
    },
  },
  lentera: { name: 'LENTERA JIWA', desc: 'MEMBUNUH = JIWA PEMBURU', rarity: 'legend', apply: (s) => void (s.killSouls += 1) },
  mahkotaMaut: {
    name: 'MAHKOTA MAUT',
    desc: 'EKSEKUSI MUSUH HP < 20%',
    rarity: 'godly',
    apply: (s) => void (s.execute = Math.max(s.execute, 0.2)),
  },
  jiwaAbadi: {
    name: 'JIWA ABADI',
    desc: 'ULTI TERISI SENDIRI, SKILL X1.5',
    rarity: 'godly',
    apply: (s) => {
      s.ultRegen += 5;
      s.skillPower *= 1.5;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Permanent stats + class + current weapon + items picked up this run. */
export function runStats(base: Derived, weapon: Weapon, items: readonly ItemId[], cls?: ClassId): Derived {
  const s = { ...base };
  if (cls) {
    CLASSES[cls].apply(s);
    if (hasSynergy(cls, weapon.id)) CLASSES[cls].synergy.apply(s);
  }
  // Fixed item order: pickup order must not change an identical build.
  const counts = new Map<ItemId, number>();
  for (const id of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of ITEM_IDS) for (let i = 0; i < (counts.get(id) ?? 0); i++) ITEMS[id].apply(s);
  // Flat damage items scale with the weapon too, so rapid fire does not multiply their value.
  s.damage *= weapon.dmg;
  s.swingCooldown *= weapon.cd;
  s.critChance += weapon.crit;
  s.damage = Math.max(1, Math.round(s.damage));
  s.maxHp = Math.round(s.maxHp);
  s.critChance = Math.min(0.9, s.critChance);
  s.swingCooldown = Math.max(0.1, s.swingCooldown);
  s.dashCooldown = Math.max(0.35, s.dashCooldown);
  s.skillCdMult = Math.max(0.3, s.skillCdMult);
  s.damageTaken = Math.max(0.4, s.damageTaken);
  s.echo = Math.min(0.9, s.echo);
  s.speed = Math.min(190, s.speed);
  s.extraJumps = Math.min(3, s.extraJumps);
  s.killSouls = Math.min(3, s.killSouls);
  s.killBolt = Math.min(3, s.killBolt);
  s.iframes = Math.min(1400, s.iframes);
  s.regen = Math.min(5, s.regen);
  s.healOnKill = Math.min(12, s.healOnKill);
  s.ultGainMult = Math.min(3, s.ultGainMult);
  s.ultRegen = Math.min(8, s.ultRegen);
  s.critMult = Math.min(3, s.critMult);
  return s;
}

/** Weapons are tied to the class, so rewards are only items or a potion. */
export type Reward = { type: 'item'; id: ItemId } | { type: 'potion' };

export function rewardInfo(r: Reward): { name: string; desc: string; icon: string } {
  if (r.type === 'item') return { name: ITEMS[r.id].name, desc: ITEMS[r.id].desc, icon: `i_${r.id}` };
  return { name: 'RAMUAN', desc: 'PULIHKAN 50% HP', icon: 'i_ramuan' };
}

/** Chance of each rarity for a boss reward slot; rises with boss tier (round 5 = tier 1). */
export function rarityWeights(tier: number): Record<Exclude<Rarity, 'biasa'>, number> {
  const godly = Math.min(0.4, 0.03 + 0.07 * (tier - 1));
  const legend = Math.min(0.45, 0.22 + 0.08 * (tier - 1));
  return { rare: 1 - legend - godly, legend, godly };
}

export function rollRarity(tier: number, r: number): Exclude<Rarity, 'biasa'> {
  const w = rarityWeights(tier);
  if (r < w.godly) return 'godly';
  if (r < w.godly + w.legend) return 'legend';
  return 'rare';
}

const itemsOf = (rarity: Rarity) => ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity);

/**
 * Three distinct choices.
 * Boss rounds (every 5th) offer only rare/legend/godly items.
 */
export function rollRewards(round = 1, rand: () => number = Math.random): Reward[] {
  const take = <T>(pool: T[]): T => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  if (round % 5 === 0) {
    const pools = { rare: itemsOf('rare'), legend: itemsOf('legend'), godly: itemsOf('godly') };
    const picks: Reward[] = [];
    // Each pool has 4 items, so 3 picks always succeed; an emptied pool just rerolls the rarity.
    while (picks.length < 3) {
      const pool = pools[rollRarity(round / 5, rand())];
      if (pool.length) picks.push({ type: 'item', id: take(pool) });
    }
    return picks;
  }
  const pool: Reward[] = [...itemsOf('biasa').map((id): Reward => ({ type: 'item', id })), { type: 'potion' }];
  return [take(pool), take(pool), take(pool)];
}

/** Coins for clearing a round (reset every run): more on boss rounds and later rounds. */
export function coinReward(round: number, bonus = 0): number {
  const base = round % 5 === 0 ? 5 + 2 * (round / 5) : 2 + Math.floor(round / 5);
  return base + bonus;
}

/** Cost of the n-th refresh (0-based) of the same reward panel. */
export function rerollCost(n: number): number {
  return 2 + n;
}

export function rewardRarity(r: Reward): Rarity {
  return r.type === 'item' ? ITEMS[r.id].rarity : 'biasa';
}
