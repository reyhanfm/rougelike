import type { WeaponId } from './loot.ts';
import type { Derived } from './stats.ts';

export type ClassId =
  | 'ksatria'
  | 'pembunuh'
  | 'dragoon'
  | 'berserker'
  | 'pemburu'
  | 'magicArcher'
  | 'reaper'
  | 'gunners'
  | 'cultivator'
  | 'elementalis'
  | 'samurai'
  | 'darkAvenger'
  | 'ashura'
  | 'antares'
  | 'gilgamesh';

/** AMARAH (fury): each stack adds `step` damage and attack speed; all stacks drop after `decayMs` without a hit. */
export const FURY = { step: 0.05, decayMs: 2500 } as const;

export interface GameClass {
  id: ClassId;
  name: string;
  /** Starting weapon, and the weapon that unlocks the synergy. */
  weapon: WeaponId;
  /** Palette char that replaces the hero's blue clothes. */
  color: string;
  trait: string;
  apply(s: Derived): void;
  synergy: { name: string; desc: string; apply(s: Derived): void };
  /** Palette char for the hair (top rows of the hero); defaults to the class color. */
  hair?: string;
  /**
   * Replaces the ult: when the meter is full the class awakens on its own, boosting its stats
   * and melee reach while the meter drains to empty over `ms` (times stats.awakenTime).
   */
  awaken?: { name: string; ms: number; reach: number; apply(s: Derived): void };
}

export const CLASSES: Record<ClassId, GameClass> = {
  ksatria: {
    id: 'ksatria',
    name: 'KSATRIA',
    weapon: 'pedang',
    color: 'c',
    hair: 'a',
    trait: 'AVALON: PULIH 1 HP/DTK, HP +10%, DITERIMA -10%',
    apply: (s) => {
      s.regen += 1;
      s.maxHp *= 1.1;
      s.damageTaken *= 0.9;
    },
    synergy: {
      name: 'RAJA PARA KSATRIA',
      desc: 'FINISHER MELEPAS GELOMBANG CAHAYA, SKILL +20%',
      apply: (s) => {
        s.finisherWave = 1;
        s.skillPower *= 1.2;
      },
    },
  },
  pembunuh: {
    id: 'pembunuh',
    name: 'KING HASSAN',
    weapon: 'belati',
    color: 'j',
    hair: '7',
    trait: 'PAK TUA GUNUNG: EKSEKUSI MUSUH HP < 12%, KRITIS +10%',
    apply: (s) => {
      s.execute = Math.max(s.execute, 0.12);
      s.critChance += 0.1;
    },
    synergy: {
      name: 'LONCENG MALAM',
      desc: 'EKSEKUSI HP < 20%, KRITIS X2, KRITIS ISI DASH',
      apply: (s) => {
        s.execute = Math.max(s.execute, 0.2);
        s.critMult += 0.5;
        s.critResetsDash = 1;
      },
    },
  },

  dragoon: {
    id: 'dragoon',
    name: 'CU CHULAINN',
    weapon: 'tombak',
    color: 'k',
    hair: '1',
    trait: 'PERLINDUNGAN PANAH: HINDAR 15%, +1 LOMPAT UDARA, LARI +10%',
    apply: (s) => {
      s.dodge += 0.15;
      s.extraJumps += 1;
      s.speed *= 1.1;
    },
    synergy: {
      name: 'SIHIR RUNE',
      desc: 'TUSUKAN BAWAH MEMICU GEMPA, KRITIS +10%',
      apply: (s) => {
        s.pogoQuake = 1;
        s.critChance += 0.1;
      },
    },
  },

  berserker: {
    id: 'berserker',
    name: 'HERACLES',
    weapon: 'kapak',
    color: 'l',
    hair: '0',
    trait: 'GOD HAND: BANGKIT 1X TIAP ROUND (30% HP), DAMAGE +20%, +25% SAAT HP < 50%',
    apply: (s) => {
      s.godHand += 1;
      s.damage *= 1.2;
      s.rage += 0.25;
    },
    synergy: {
      name: 'DUA BELAS UJIAN',
      desc: 'GOD HAND +1 (BANGKIT 2X/ROUND), CURI 4% DAMAGE',
      apply: (s) => {
        s.godHand += 1;
        s.lifesteal += 0.04;
      },
    },
  },

  pemburu: {
    id: 'pemburu',
    name: 'ARCHER',
    weapon: 'busur',
    color: '8',
    hair: '7',
    trait: 'MATA ELANG: KRITIS +10%, SOUL +20%, COOLDOWN SKILL -15%',
    apply: (s) => {
      s.critChance += 0.1;
      s.soulMult *= 1.2;
      s.skillCdMult *= 0.85;
    },
    synergy: {
      name: 'BROKEN PHANTASM',
      desc: 'PANAH BIASA MENEMBUS MUSUH',
      apply: (s) => void (s.pierceArrows = 1),
    },
  },

  magicArcher: {
    id: 'magicArcher',
    name: 'MAGIC ARCHER',
    weapon: 'busurArkana',
    color: 'e',
    trait: '1 PANAH/TEMBAKAN MELACAK, DMG -15%, HP -10%',
    apply: (s) => {
      s.homingArrows = 1;
      s.damage *= 0.85;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'PANAH ARKANA',
      desc: 'TIAP TEMBAKAN +1 PANAH (LURUS)',
      apply: (s) => void (s.extraArrows += 1),
    },
  },
  reaper: {
    id: 'reaper',
    name: 'GRIM REAPER',
    weapon: 'sabit',
    color: '6',
    trait: 'SOUL +20%, +2 HP/KILL, HP -10%',
    apply: (s) => {
      s.soulMult *= 1.2;
      s.healOnKill += 2;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'JIWA TERKUTUK',
      desc: 'TIAP KILL MELEPAS JIWA YANG MEMBURU MUSUH',
      apply: (s) => void (s.killSouls += 1),
    },
  },
  gunners: {
    id: 'gunners',
    name: 'GUNNERS',
    weapon: 'senapan',
    color: '3',
    trait: 'HP +10%, LARI -5%; TAHAN SERANG',
    apply: (s) => {
      s.maxHp *= 1.1;
      s.speed *= 0.95;
    },
    synergy: {
      name: 'DISIPLIN TEMPUR',
      desc: 'JEDA TEMBAK -15%, SKILL GRANAT',
      apply: (s) => void (s.swingCooldown *= 0.85),
    },
  },
  cultivator: {
    id: 'cultivator',
    name: 'CULTIVATOR',
    weapon: 'pedangTerbang',
    color: '7',
    trait: 'QI: SKILL +20%, PULIH 0.5 HP/DTK, HP -10%',
    apply: (s) => {
      s.skillPower *= 1.2;
      s.regen += 0.5;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'JIWA PEDANG',
      desc: 'PEDANG TERBANG MENEMBUS MUSUH, ULTI +20% CEPAT',
      apply: (s) => {
        s.pierceArrows = 1;
        s.ultGainMult *= 1.2;
      },
    },
  },
  elementalis: {
    id: 'elementalis',
    name: 'ELEMENTALIS',
    weapon: 'tongkat',
    color: '2',
    trait: 'SKILL +15%, SKILL CD -10%, HP -15%',
    apply: (s) => {
      s.skillPower *= 1.15;
      s.skillCdMult *= 0.9;
      s.maxHp *= 0.85;
    },
    synergy: {
      name: 'PENGUASA ELEMEN',
      desc: 'BURN +50% DAMAGE, BEKU +50% LEBIH LAMA',
      apply: (s) => void (s.elemental += 0.5),
    },
  },
  samurai: {
    id: 'samurai',
    name: 'SAMURAI',
    weapon: 'katana',
    color: '5',
    trait: 'KRITIS +10%, PENGALI KRITIS +0.25, HP -5%',
    apply: (s) => {
      s.critChance += 0.1;
      s.critMult += 0.25;
      s.maxHp *= 0.95;
    },
    synergy: {
      name: 'BUSHIDO',
      desc: 'SERANGAN PERTAMA SETELAH DASH PASTI KRITIS',
      apply: (s) => void (s.dashCrit = 1),
    },
  },
  darkAvenger: {
    id: 'darkAvenger',
    name: 'DARK AVENGER',
    weapon: 'pedangGelap',
    color: 'g',
    trait: 'TANPA ULTI: METER PENUH = MODE AVENGER. METER +25%, HP +10%',
    apply: (s) => {
      s.ultGainMult *= 1.25;
      s.maxHp *= 1.1;
    },
    synergy: {
      name: 'DENDAM ABADI',
      desc: 'MODE AVENGER 50% LEBIH LAMA',
      apply: (s) => void (s.awakenTime += 0.5),
    },
    awaken: {
      name: 'MODE AVENGER',
      ms: 8000,
      reach: 1.6,
      apply: (s) => {
        s.damage *= 1.4;
        s.speed *= 1.3;
        s.swingCooldown *= 0.7;
        s.damageTaken *= 0.75;
        s.dashCooldown *= 0.6;
        s.critChance += 0.1;
      },
    },
  },
  ashura: {
    id: 'ashura',
    name: 'ASHURA',
    weapon: 'enamLengan',
    color: 'a',
    trait: 'AMARAH: TIAP HIT +1 STACK (MAX 6), +5% DAMAGE & SERANG CEPAT PER STACK',
    apply: (s) => {
      s.furyMax = 6;
      s.maxHp *= 1.05;
    },
    synergy: {
      name: 'MURKA ASURA',
      desc: 'MAX AMARAH 10 STACK',
      apply: (s) => void (s.furyMax += 4),
    },
  },
  antares: {
    id: 'antares',
    name: 'ANTARES',
    weapon: 'cakarNaga',
    color: 'h',
    trait: 'RAJA NAGA: KEBAL TERBAKAR, HP +15%, DITERIMA -5%',
    apply: (s) => {
      s.fireImmune = 1;
      s.maxHp *= 1.15;
      s.damageTaken *= 0.95;
    },
    synergy: {
      name: 'MONARCH KEHANCURAN',
      desc: 'WUJUD NAGA 10 DTK, BURN +50%',
      apply: (s) => {
        s.formTime += 3 / 7;
        s.elemental += 0.5;
      },
    },
  },
  gilgamesh: {
    id: 'gilgamesh',
    name: 'GILGAMESH',
    weapon: 'gerbangBabilonia',
    color: 'i',
    hair: 'a',
    trait: 'RAJA PARA PAHLAWAN: +2 KOIN/ROUND, 15% BUNUH = KOIN, KRITIS +5%',
    apply: (s) => {
      s.coinBonus += 2;
      s.goldChance += 0.15;
      s.critChance += 0.05;
    },
    synergy: {
      name: 'HARTA TAK TERBATAS',
      desc: 'TIAP SERANGAN +1 SENJATA DARI GERBANG',
      apply: (s) => void (s.extraArrows += 1),
    },
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function hasSynergy(cls: ClassId, weapon: WeaponId): boolean {
  return CLASSES[cls].weapon === weapon;
}

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && v in CLASSES;
}
