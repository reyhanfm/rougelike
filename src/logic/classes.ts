import type { WeaponId } from './loot.ts';
import type { Derived } from './stats.ts';

export type ClassId = 'ksatria' | 'pembunuh' | 'dragoon' | 'berserker' | 'pemburu' | 'magicArcher';

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
    trait: 'HP +30%, DAMAGE DITERIMA -10%',
    apply: (s) => {
      s.maxHp *= 1.3;
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
    trait: 'DAMAGE +20%, +30% LAGI SAAT HP < 50%',
    apply: (s) => {
      s.damage *= 1.2;
      s.rage += 0.3;
    },
    synergy: {
      name: 'HAUS DARAH',
      desc: 'PULIH 6% DARI DAMAGE YANG DIBERIKAN',
      apply: (s) => void (s.lifesteal += 0.06),
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
    trait: 'SEMUA PANAH MENGEJAR MUSUH, SKILL +20%, HP -10%',
    apply: (s) => {
      s.homingArrows = 1;
      s.skillPower *= 1.2;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'PANAH ARKANA',
      desc: 'TIAP TEMBAKAN +1 PANAH PELACAK',
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
