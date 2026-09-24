import type { WeaponId } from './loot.ts';
import type { Derived } from './stats.ts';

export type ClassId = 'ksatria' | 'pembunuh' | 'dragoon' | 'berserker' | 'pemburu' | 'magicArcher' | 'reaper' | 'gunners';

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
}

export const CLASSES: Record<ClassId, GameClass> = {
  ksatria: {
    id: 'ksatria',
    name: 'KSATRIA',
    weapon: 'pedang',
    color: 'c',
    trait: 'HP +20%, DAMAGE DITERIMA -10%',
    apply: (s) => {
      s.maxHp *= 1.2;
      s.damageTaken *= 0.9;
    },
    synergy: {
      name: 'SUMPAH PEDANG',
      desc: 'FINISHER COMBO MELEPAS GELOMBANG PEDANG',
      apply: (s) => void (s.finisherWave = 1),
    },
  },
  pembunuh: {
    id: 'pembunuh',
    name: 'PEMBUNUH',
    weapon: 'belati',
    color: 'd',
    trait: 'KRITIS +15%, LARI +10%, HP -15%',
    apply: (s) => {
      s.critChance += 0.15;
      s.speed *= 1.1;
      s.maxHp *= 0.85;
    },
    synergy: {
      name: 'BAYANG MAUT',
      desc: 'KRITIS X2 & TIAP KRITIS MEMULIHKAN DASH',
      apply: (s) => {
        s.critMult += 0.5;
        s.critResetsDash = 1;
      },
    },
  },
  dragoon: {
    id: 'dragoon',
    name: 'DRAGOON',
    weapon: 'tombak',
    color: '9',
    trait: '+1 LOMPAT UDARA, KEBAL +0.2 DTK',
    apply: (s) => {
      s.extraJumps += 1;
      s.iframes += 200;
    },
    synergy: {
      name: 'CAKAR NAGA',
      desc: 'TUSUKAN BAWAH MEMICU GEMPA KECIL',
      apply: (s) => void (s.pogoQuake = 1),
    },
  },
  berserker: {
    id: 'berserker',
    name: 'BERSERKER',
    weapon: 'kapak',
    color: '8',
    trait: 'DAMAGE +20%, +25% SAAT HP < 50%',
    apply: (s) => {
      s.damage *= 1.2;
      s.rage += 0.25;
    },
    synergy: {
      name: 'HAUS DARAH',
      desc: 'PULIH 4% DARI DAMAGE YANG DIBERIKAN',
      apply: (s) => void (s.lifesteal += 0.04),
    },
  },
  pemburu: {
    id: 'pemburu',
    name: 'PEMBURU',
    weapon: 'busur',
    color: 'b',
    trait: 'SOUL +20%, COOLDOWN SKILL -15%, KRITIS +5%',
    apply: (s) => {
      s.soulMult *= 1.2;
      s.skillCdMult *= 0.85;
      s.critChance += 0.05;
    },
    synergy: {
      name: 'MATA PEMBURU',
      desc: 'PANAH BIASA MENEMBUS MUSUH',
      apply: (s) => void (s.pierceArrows = 1),
    },
  },
  magicArcher: {
    id: 'magicArcher',
    name: 'MAGIC ARCHER',
    weapon: 'busur',
    color: 'e',
    trait: 'PANAH PELACAK, DMG -15%, HP -10%',
    apply: (s) => {
      s.homingArrows = 1;
      s.damage *= 0.85;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'PANAH ARKANA',
      desc: 'TIAP TEMBAKAN +1 PANAH PELACAK',
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
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function hasSynergy(cls: ClassId, weapon: WeaponId): boolean {
  return CLASSES[cls].weapon === weapon;
}

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && v in CLASSES;
}
