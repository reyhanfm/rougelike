import { STAT_KEYS, type StatLevels } from './stats.ts';
import { isClassId, type ClassId } from './classes.ts';

const KEY = 'rougelike:save';

export interface SaveData {
  souls: number;
  stats: StatLevels;
  bestRound: number;
  /** Last class picked, preselected next time. */
  cls: ClassId;
}

export function defaultSave(): SaveData {
  return { souls: 0, stats: { str: 0, int: 0, agi: 0, dex: 0 }, bestRound: 0, cls: 'ksatria' };
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
