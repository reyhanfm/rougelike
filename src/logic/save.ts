import { STAT_KEYS, type StatLevels } from './stats.ts';
import { isClassId, type ClassId } from './classes.ts';

const KEY = 'rougelike:save';

/**
 * WARISAN: permanent unlocks bought with souls in the hub (Dead Cells style). Stats stop at MAX_STAT_LV, so late souls
 * buy new ways to start a run instead of raw power. `costs[lv]` = price of the next level; its length is the max level.
 */
export type PerkId = 'modal' | 'bekal' | 'sahabat' | 'slot' | 'refresh' | 'gerbang' | 'nyawa';

export const PERKS: Record<PerkId, { name: string; desc: string; costs: readonly number[] }> = {
  modal: { name: 'MODAL AWAL', desc: '+5 KOIN DI AWAL RUN TIAP LEVEL', costs: [40, 90, 180] },
  bekal: { name: 'BEKAL RELIK', desc: 'MULAI DENGAN RELIK BIASA, LV2 + RARE', costs: [60, 160] },
  sahabat: { name: 'SAHABAT JIWA', desc: 'MULAI DENGAN HERO KEDUA ACAK', costs: [150] },
  slot: { name: 'SLOT RELIK', desc: '+1 SLOT RELIK TIAP LEVEL', costs: [120, 300] },
  refresh: { name: 'REFRESH GRATIS', desc: 'REFRESH PERTAMA TIAP HADIAH GRATIS', costs: [80] },
  gerbang: { name: 'MATA GERBANG', desc: '3 PINTU SETELAH ROUND, BUKAN 2', costs: [140] },
  nyawa: { name: 'NYAWA KEDUA', desc: 'SEKALI TIAP RUN BANGKIT 40% HP', costs: [350] },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export interface SaveData {
  souls: number;
  stats: StatLevels;
  perks: Record<PerkId, number>;
  bestRound: number;
  /** Last class picked, preselected next time. */
  cls: ClassId;
}

export function defaultSave(): SaveData {
  return {
    souls: 0,
    stats: { str: 0, int: 0, agi: 0, dex: 0 },
    perks: Object.fromEntries(PERK_IDS.map((k) => [k, 0])) as Record<PerkId, number>,
    bestRound: 0,
    cls: 'ksatria',
  };
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function loadSave(): SaveData {
  const save = defaultSave();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return save;
    const r = raw as Partial<Record<keyof SaveData, unknown>>;
    save.souls = count(r.souls);
    save.bestRound = count(r.bestRound);
    if (isClassId(r.cls)) save.cls = r.cls;
    const stats = (r.stats ?? {}) as Partial<Record<string, unknown>>;
    for (const k of STAT_KEYS) save.stats[k] = count(stats[k]);
    const perks = (r.perks ?? {}) as Partial<Record<string, unknown>>;
    for (const k of PERK_IDS) save.perks[k] = Math.min(PERKS[k].costs.length, count(perks[k]));
  } catch {
    // corrupt JSON or storage blocked: start fresh
  }
  return save;
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: progress for this session only
  }
}
