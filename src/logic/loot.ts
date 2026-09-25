import type { Derived } from './stats.ts';
import { CLASSES, hasSynergy, type ClassId } from './classes.ts';

export type WeaponId =
  | 'pedang'
  | 'belati'
  | 'tombak'
  | 'kapak'
  | 'busur'
  | 'sabit'
  | 'senapan'
  | 'pedangTerbang'
  | 'tongkat'
  | 'katana'
  | 'busurArkana'
  | 'pedangGelap'
  | 'enamLengan'
  | 'cakarNaga'
  | 'gerbangBabilonia'
  | 'shrine'
  | 'mugen'
  | 'sakahoko'
  | 'gunbai'
  | 'mokuton'
  | 'kunai'
  | 'tongkatFrost';

/** Elemental effects on hit. burn: damage mult per tick for a few seconds; freeze: ms without moving or acting; slow: ms at a crawl. */
export interface Status {
  burn?: number;
  freeze?: number;
  /** ms moving at a crawl (Absolute Zero). */
  slow?: number;
}

export type MoveAnim = 'down' | 'up' | 'overhead' | 'thrust' | 'shoot' | 'spin' | 'plunge' | 'jab' | 'hook' | 'uppercut';

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
  /** Phantom-arm follow-up hits (40% damage each) after the move connects. */
  extra?: number;
  /** Afterimages of this tint trail the player during the move (Artoria's Mana Burst). */
  trail?: number;
  /** Projectile texture for this move instead of the weapon's. */
  shot?: string;
  status?: Status;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  desc: string;
  dmg: number;
  cd: number;
  crit: number;
  /** Ranged weapons use the same shot pipeline with their own texture and speed. */
  /** returning: one projectile at a time; it flies back and must be caught before the next attack. */
  /** gate: shots come out of golden portals behind the player as random treasure weapons (Gilgamesh). */
  /** pierce: every shot passes through enemies (Sukuna's Kai). */
  projectile?: { texture: string; speed: number; homing?: boolean; returning?: boolean; gate?: boolean; pierce?: boolean };
  automatic?: boolean;
  /** Fists: held upright at the hand instead of as a blade. */
  fist?: boolean;
  /** The attack key casts a technique (SKILLS[id].basic) instead of swinging; combo[0] describes one cast for balance. */
  cast?: boolean;
  /** Attack and skill pressed together cast this instead (SKILLS[id].fusion). cd in seconds. */
  fusion?: { name: string; desc: string; cd: number };
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
    name: 'EXCALIBUR',
    desc: 'PEDANG SUCI BERSELUBUNG ANGIN, COMBO 4',
    dmg: 1,
    cd: 1,
    crit: 0,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 110, reach: box(22, 20), knockback: 100 },
      { anim: 'up', dmg: 1, cd: 1, ms: 110, reach: box(22, 22), knockback: 100 },
      // Mana Burst: a blue flare of prana hurls her forward through the enemy.
      { anim: 'thrust', dmg: 1.3, cd: 1.1, ms: 160, reach: box(30, 12), knockback: 180, lunge: 280, trail: 0x29adff },
      // Invisible Air falls away for one heavy downward cut.
      { anim: 'overhead', dmg: 1.9, cd: 1.5, ms: 200, reach: box(30, 32), knockback: 260 },
    ],
    air: {
      name: 'TEBASAN ANGIN',
      anim: 'spin',
      dmg: 1.1,
      cd: 1.2,
      ms: 220,
      reach: box(30, 30),
      knockback: 140,
      hitbox: 'around',
      hover: 90,
    },
    skill: { name: 'STRIKE AIR', desc: 'SELUBUNG ANGIN DILEPAS: PUSARAN MENEMBUS & MENGHEMPAS', cd: 5 },
    ult: { name: 'EXCALIBUR', desc: 'PEDANG DIANGKAT, CAHAYA EMAS MEMBELAH ARENA' },
  },
  belati: {
    id: 'belati',
    name: 'AZRAEL',
    desc: 'PEDANG BESAR KEMATIAN, COMBO 3',
    dmg: 1.3,
    cd: 1.3,
    crit: 0.1,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 130, reach: box(24, 22), knockback: 130 },
      { anim: 'up', dmg: 1, cd: 1, ms: 130, reach: box(24, 24), knockback: 130 },
      { anim: 'overhead', dmg: 1.7, cd: 1.5, ms: 200, reach: box(30, 30), knockback: 240, lunge: 60 },
    ],
    air: {
      name: 'JATUH AZRAEL',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 1200,
      reach: box(14, 18),
      knockback: 200,
      hitbox: 'below',
      dive: { vx: 60, vy: 380 },
      slam: 26,
    },
    skill: { name: 'LONCENG SENJA', desc: 'TANDAI MUSUH, TEBASAN MAUT (EKSEKUSI HP < 30%)', cd: 6 },
    ult: { name: 'AZRAEL', desc: 'LONCENG BERBUNYI: SEMUA MUSUH DIVONIS MATI' },
  },

  tombak: {
    id: 'tombak',
    name: 'GAE BOLG',
    desc: 'TOMBAK KUTUKAN MERAH, TUSUKAN JAUH',
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
    skill: { name: 'GAE BOLG', desc: 'TUSUKAN YANG PASTI MENGENAI JANTUNG, KRITIS', cd: 5 },
    ult: { name: 'TOMBAK TERBANG PEMBUNUH', desc: 'LOMPAT TINGGI, LEMPAR TOMBAK YANG MEMBELAH' },
  },
  kapak: {
    id: 'kapak',
    name: 'PEDANG BATU',
    desc: 'KAPAK-PEDANG BATU, TEBASAN LEBAR',
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
    skill: { name: 'RAUNGAN GILA', desc: 'RAUNGAN MENGHEMPAS DAN MEMBEKUKAN SEKITAR', cd: 6 },
    ult: { name: 'NINE LIVES', desc: '9 TEBASAN BERUNTUN KE MUSUH TERDEKAT' },
  },
  busur: {
    id: 'busur',
    name: 'BUSUR HITAM',
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
    skill: { name: 'CALADBOLG II', desc: 'PANAH SPIRAL YANG MELEDAK SAAT KENA', cd: 5 },
    ult: { name: 'UNLIMITED BLADE WORKS', desc: 'DUNIA PEDANG: HUJAN PEDANG KE SEMUA MUSUH' },
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
  pedangTerbang: {
    id: 'pedangTerbang',
    name: 'PEDANG TERBANG',
    desc: 'PEDANG DILEMPAR, KEMBALI KE TANGAN',
    dmg: 0.9,
    cd: 1.1,
    crit: 0.05,
    projectile: { texture: 'w_pedangTerbang', speed: 240, homing: true, returning: true },
    combo: [
      { anim: 'shoot', dmg: 1.2, cd: 1, ms: 100, reach: box(0, 0), knockback: 70, angles: [0] },
      { anim: 'shoot', dmg: 1.2, cd: 1, ms: 100, reach: box(0, 0), knockback: 70, angles: [0] },
      { anim: 'shoot', dmg: 1.8, cd: 1.3, ms: 150, reach: box(0, 0), knockback: 140, angles: [0] },
    ],
    air: {
      name: 'PEDANG JATUH',
      anim: 'shoot',
      dmg: 0.9,
      cd: 1.2,
      ms: 120,
      reach: box(0, 0),
      knockback: 60,
      angles: [0.8],
      hover: 80,
    },
    skill: { name: 'FORMASI PEDANG', desc: '6 PEDANG MELINGKAR LALU MEMBURU', cd: 5 },
    ult: { name: 'SERIBU PEDANG', desc: 'PEDANG DARI SEGALA ARAH, KEBAL' },
  },
  tongkat: {
    id: 'tongkat',
    name: 'TONGKAT ELEMEN',
    desc: 'BOLA API MEMBAKAR, ES MEMBEKUKAN',
    dmg: 0.9,
    cd: 1.1,
    crit: 0,
    projectile: { texture: 'fireball', speed: 200 },
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0], status: { burn: 0.15 } },
      { anim: 'shoot', dmg: 0.9, cd: 1, ms: 100, reach: box(0, 0), knockback: 30, angles: [0], shot: 'iceshard', status: { freeze: 350 } },
      { anim: 'shoot', dmg: 1.4, cd: 1.5, ms: 150, reach: box(0, 0), knockback: 120, angles: [-0.1, 0.1], status: { burn: 0.25 } },
    ],
    air: {
      name: 'HUJAN ES',
      anim: 'shoot',
      dmg: 0.8,
      cd: 1.2,
      ms: 120,
      reach: box(0, 0),
      knockback: 30,
      angles: [0.5, 0.9],
      shot: 'iceshard',
      status: { freeze: 350 },
      hover: 70,
    },
    skill: { name: 'NOVA ES', desc: 'LEDAKAN ES, BEKUKAN MUSUH SEKITAR', cd: 6 },
    ult: { name: 'BADAI ELEMEN', desc: 'HUJAN METEOR MEMBAKAR, LALU BADAI ES' },
  },
  katana: {
    id: 'katana',
    name: 'KATANA',
    desc: 'TEBASAN CEPAT, FINISHER MELESAT',
    dmg: 1,
    cd: 0.8,
    crit: 0.1,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 90, reach: box(22, 18), knockback: 90 },
      { anim: 'up', dmg: 1, cd: 1, ms: 90, reach: box(22, 20), knockback: 90 },
      { anim: 'thrust', dmg: 1.8, cd: 1.6, ms: 160, reach: box(30, 10), knockback: 200, lunge: 260 },
    ],
    air: {
      name: 'TEBASAN WALET',
      anim: 'spin',
      dmg: 1,
      cd: 1,
      ms: 180,
      reach: box(26, 26),
      knockback: 120,
      hitbox: 'around',
      hover: 110,
    },
    skill: { name: 'IAI', desc: 'MELESAT, TEBAS SEMUA DI JALUR, PASTI KRITIS', cd: 4 },
    ult: { name: 'ISSEN', desc: 'WAKTU BERHENTI, TEBASAN KE SEMUA MUSUH' },
  },
  busurArkana: {
    id: 'busurArkana',
    name: 'BUSUR ARKANA',
    desc: 'PANAH SIHIR, SATU MELACAK',
    projectile: { texture: 'panahArkana', speed: 230 },
    dmg: 0.8,
    cd: 1.1,
    crit: 0.05,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 0.9, cd: 1.5, ms: 140, reach: box(0, 0), knockback: 80, angles: [-0.12, 0, 0.12] },
    ],
    air: {
      name: 'PANAH BINTANG',
      anim: 'shoot',
      dmg: 0.9,
      cd: 1.3,
      ms: 120,
      reach: box(0, 0),
      knockback: 60,
      angles: [0.45, 0.8, 1.15],
      hover: 70,
    },
    skill: { name: 'LINGKARAN ARKANA', desc: '8 PANAH SIHIR MELINGKAR LALU MEMBURU', cd: 5 },
    ult: { name: 'HUJAN BINTANG', desc: 'BINTANG ARKANA JATUH MEMBURU MUSUH' },
  },
  pedangGelap: {
    id: 'pedangGelap',
    name: 'PEDANG KEGELAPAN',
    desc: 'PEDANG BESAR, TEBASAN BERAT',
    dmg: 1.3,
    cd: 1.3,
    crit: 0,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 140, reach: box(24, 22), knockback: 140 },
      { anim: 'up', dmg: 1, cd: 1, ms: 140, reach: box(24, 24), knockback: 140 },
      { anim: 'overhead', dmg: 1.7, cd: 1.5, ms: 220, reach: box(30, 30), knockback: 260, lunge: 80 },
    ],
    air: {
      name: 'JATUH KEGELAPAN',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 1200,
      reach: box(14, 18),
      knockback: 200,
      hitbox: 'below',
      dive: { vx: 120, vy: 340 },
      slam: 26,
    },
    skill: { name: 'TEBASAN GELAP', desc: 'GELOMBANG GELAP MENEMBUS, X3 SAAT MODE AVENGER', cd: 5 },
    // Never cast: the Dark Avenger awakens instead of using an ult.
    ult: { name: 'MODE AVENGER', desc: 'OTOMATIS SAAT METER PENUH' },
  },
  enamLengan: {
    id: 'enamLengan',
    name: 'ENAM LENGAN',
    desc: 'TINJU COMBO 4, TIAP HIT + TINJU BAYANGAN',
    dmg: 0.7,
    cd: 0.6,
    crit: 0.05,
    fist: true,
    combo: [
      { anim: 'jab', dmg: 1, cd: 1, ms: 80, reach: box(16, 12), knockback: 60, extra: 1 },
      { anim: 'hook', dmg: 1, cd: 1, ms: 90, reach: box(18, 16), knockback: 70, extra: 1 },
      { anim: 'uppercut', dmg: 1.1, cd: 1, ms: 100, reach: box(16, 22), knockback: 90, extra: 1 },
      { anim: 'jab', dmg: 1.5, cd: 1.6, ms: 180, reach: box(30, 24), knockback: 180, lunge: 140, extra: 2 },
    ],
    air: {
      name: 'TINJU MENUKIK',
      anim: 'plunge',
      dmg: 1.1,
      cd: 1.1,
      ms: 700,
      reach: box(12, 14),
      knockback: 120,
      hitbox: 'below',
      dive: { vx: 100, vy: 320 },
      bounce: 180,
      extra: 2,
    },
    skill: { name: 'TINJU SERIBU', desc: 'RENTETAN PUKULAN KE DEPAN', cd: 5 },
    ult: { name: 'WUJUD ASHURA', desc: 'ENAM GELOMBANG TINJU, AMARAH PENUH, KEBAL' },
  },
  cakarNaga: {
    id: 'cakarNaga',
    name: 'CAKAR NAGA',
    desc: 'CAKAR MEMBAKAR, COMBO 3',
    dmg: 1.1,
    cd: 1,
    crit: 0.05,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 110, reach: box(22, 20), knockback: 110, status: { burn: 0.15 } },
      { anim: 'up', dmg: 1, cd: 1, ms: 110, reach: box(22, 22), knockback: 110, status: { burn: 0.15 } },
      { anim: 'overhead', dmg: 1.6, cd: 1.5, ms: 180, reach: box(28, 28), knockback: 220, lunge: 100, status: { burn: 0.25 } },
    ],
    air: {
      name: 'SAYAP API',
      anim: 'spin',
      dmg: 1,
      cd: 1.1,
      ms: 200,
      reach: box(28, 28),
      knockback: 120,
      hitbox: 'around',
      hover: 80,
      status: { burn: 0.15 },
    },
    skill: { name: 'SEMBURAN API', desc: '7 BOLA API MENYEMBUR, MEMBAKAR', cd: 5 },
    ult: { name: 'WUJUD NAGA', desc: 'JADI NAGA: TERBANG, NAPAS API, TAHAN BANTING' },
  },
  gerbangBabilonia: {
    id: 'gerbangBabilonia',
    name: 'GERBANG BABILONIA',
    desc: 'GERBANG EMAS MENGHADAP MUSUH, MENEMBAKKAN HARTA',
    projectile: { texture: 'w_pedang', speed: 260, gate: true },
    dmg: 0.8,
    cd: 1.1,
    crit: 0.05,
    // One gate per angle: 3, 3, then a volley of 6.
    combo: [
      { anim: 'shoot', dmg: 0.45, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [-0.06, 0, 0.06] },
      { anim: 'shoot', dmg: 0.45, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [-0.06, 0, 0.06] },
      { anim: 'shoot', dmg: 0.35, cd: 1.5, ms: 150, reach: box(0, 0), knockback: 80, angles: [-0.15, -0.09, -0.03, 0.03, 0.09, 0.15] },
    ],
    air: {
      name: 'HUJAN HARTA',
      anim: 'shoot',
      dmg: 0.45,
      cd: 1.3,
      ms: 120,
      reach: box(0, 0),
      knockback: 60,
      angles: [0.5, 0.65, 0.8, 1],
    },
    skill: { name: 'RANTAI ENKIDU', desc: 'RANTAI EMAS MENGIKAT 3 MUSUH 2 DTK', cd: 6 },
    ult: { name: 'ENUMA ELISH', desc: 'EA BERPUTAR, BADAI MERAH MEMBELAH LANGIT & BUMI' },
  },
  shrine: {
    id: 'shrine',
    name: 'SHRINE',
    desc: 'KAI: TEBASAN TERBANG MENEMBUS, FINISHER HACHI',
    projectile: { texture: 'kai', speed: 320, pierce: true },
    dmg: 0.9,
    cd: 0.9,
    crit: 0.05,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [0] },
      // Hachi (Cleave): a crossed cut that hits harder.
      { anim: 'shoot', dmg: 1.8, cd: 1.5, ms: 150, reach: box(0, 0), knockback: 180, angles: [0], shot: 'hachi' },
    ],
    air: { name: 'KAI UDARA', anim: 'shoot', dmg: 1, cd: 1.1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0.45] },
    skill: { name: 'MALEVOLENT SHRINE', desc: 'DOMAIN: TEBASAN KE SEGALA ARAH, PASTI KENA DI DALAM', cd: 9 },
    ult: { name: 'WORLD CUTTING SLASH', desc: 'MANTRA, LALU DUNIA TERBELAH: TIDAK ADA YANG LOLOS' },
  },
  mugen: {
    id: 'mugen',
    name: 'MUGEN',
    desc: 'J: AO MENARIK, L: AKA MENGHEMPAS, J+L: MURASAKI',
    cast: true,
    dmg: 1.1,
    cd: 2.2,
    crit: 0.05,
    // One Blue cast: four crushing ticks of 0.5.
    combo: [{ anim: 'thrust', dmg: 2, cd: 1, ms: 0, reach: box(40, 40), knockback: 0 }],
    air: { name: 'AO', anim: 'thrust', dmg: 2, cd: 1, ms: 0, reach: box(40, 40), knockback: 0 },
    skill: { name: 'AKA', desc: 'MERAH: TOLAKAN MENGHEMPAS SEMUA DI DEPAN', cd: 3 },
    fusion: { name: 'MURASAKI', desc: 'J+L: UNGU HAMPA MENGHAPUS SEMUA DI JALURNYA', cd: 8 },
    ult: { name: 'MURYOKUSHO', desc: 'DOMAIN: SEMUA MUSUH BEKU, LALU DIHANTAM' },
  },
  sakahoko: {
    id: 'sakahoko',
    name: 'AMA NO SAKAHOKO',
    desc: 'BELATI PEMBATAL, TUSUKAN CEPAT',
    dmg: 0.9,
    cd: 0.75,
    crit: 0.1,
    combo: [
      { anim: 'thrust', dmg: 1, cd: 1, ms: 90, reach: box(26, 10), knockback: 90 },
      { anim: 'thrust', dmg: 1, cd: 1, ms: 90, reach: box(26, 10), knockback: 90, lunge: 120 },
      { anim: 'down', dmg: 1.1, cd: 1, ms: 110, reach: box(24, 22), knockback: 120 },
      { anim: 'thrust', dmg: 1.7, cd: 1.5, ms: 160, reach: box(32, 12), knockback: 220, lunge: 300 },
    ],
    air: {
      name: 'TIKAMAN LANGIT',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.1,
      ms: 900,
      reach: box(12, 16),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 140, vy: 360 },
      slam: 22,
    },
    skill: { name: 'PLAYFUL CLOUD', desc: 'TONGKAT 3 RUAS BERPUTAR, HANTAM 3X', cd: 5 },
    ult: { name: 'PEMBELAH JIWA', desc: 'MUNCUL DI BELAKANG TIAP MUSUH, TEBASAN KRITIS' },
  },
  gunbai: {
    id: 'gunbai',
    name: 'GUNBAI & KAMA',
    desc: 'KIPAS PERANG UCHIHA, LEMPAR KAMA, HEMPASAN ANGIN',
    projectile: { texture: 'kama', speed: 260 },
    dmg: 1.1,
    cd: 1.1,
    crit: 0.05,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 130, reach: box(26, 24), knockback: 140 },
      { anim: 'up', dmg: 1, cd: 1, ms: 130, reach: box(26, 26), knockback: 140 },
      // Kama: the chained sickle is thrown ahead.
      { anim: 'shoot', dmg: 1.1, cd: 1, ms: 120, reach: box(0, 0), knockback: 90, angles: [0] },
      // Gunbai gust: a great sweep blows everything around away.
      { anim: 'spin', dmg: 1.6, cd: 1.5, ms: 220, reach: box(44, 32), knockback: 280, hitbox: 'around' },
    ],
    air: {
      name: 'KIPASAN BADAI',
      anim: 'spin',
      dmg: 1.1,
      cd: 1.2,
      ms: 220,
      reach: box(30, 30),
      knockback: 180,
      hitbox: 'around',
      hover: 90,
    },
    skill: { name: 'KATON: GOKAKYU', desc: 'BOLA API RAKSASA MENEMBUS & MEMBAKAR', cd: 6 },
    ult: { name: 'SUSANOO SEMPURNA', desc: 'SUSANOO BIRU BANGKIT, PEDANGNYA MEMBELAH MUSUH' },
  },
  mokuton: {
    id: 'mokuton',
    name: 'MOKUTON',
    desc: 'ELEMEN KAYU: TUSUKAN AKAR, LEDAKAN HUTAN',
    dmg: 1.2,
    cd: 1.2,
    crit: 0,
    combo: [
      { anim: 'thrust', dmg: 1, cd: 1, ms: 130, reach: box(34, 10), knockback: 150 },
      { anim: 'up', dmg: 1, cd: 1, ms: 130, reach: box(26, 26), knockback: 140 },
      // Wood bursts out all around and snags whatever it hits.
      { anim: 'spin', dmg: 1.5, cd: 1.5, ms: 220, reach: box(44, 32), knockback: 220, hitbox: 'around', status: { freeze: 300 } },
    ],
    air: {
      name: 'PILAR KAYU',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.3,
      ms: 1200,
      reach: box(14, 18),
      knockback: 200,
      hitbox: 'below',
      dive: { vx: 40, vy: 400 },
      slam: 30,
    },
    skill: { name: 'JUKAI KOTAN', desc: 'POHON RAKSASA TUMBUH, CABANG MENGIKAT (UDARA JUGA)', cd: 6 },
    ult: { name: 'MOKUTON: SHIN SUSENJU', desc: 'BUDDHA KAYU SERIBU TANGAN MENGHANTAM SEMUA MUSUH' },
  },
  kunai: {
    id: 'kunai',
    name: 'KUNAI & SHURIKEN',
    desc: 'TEBAS KUNAI, LEMPAR SHURIKEN, KATON: HOSENKA',
    projectile: { texture: 'shuriken', speed: 280 },
    dmg: 0.9,
    cd: 0.9,
    crit: 0.05,
    combo: [
      // Close in: two quick kunai cuts.
      { anim: 'down', dmg: 1, cd: 1, ms: 90, reach: box(22, 18), knockback: 90 },
      { anim: 'up', dmg: 1, cd: 1, ms: 90, reach: box(22, 20), knockback: 90 },
      // Shurikenjutsu: three shuriken in a tight fan.
      { anim: 'shoot', dmg: 0.7, cd: 1.1, ms: 110, reach: box(0, 0), knockback: 50, angles: [-0.12, 0, 0.12] },
      // Katon: Hosenka: a spray of small fireballs.
      {
        anim: 'shoot',
        dmg: 0.6,
        cd: 1.5,
        ms: 150,
        reach: box(0, 0),
        knockback: 60,
        angles: [-0.3, -0.1, 0.1, 0.3],
        shot: 'fireball',
        status: { burn: 0.15 },
      },
    ],
    air: {
      name: 'HUJAN SHURIKEN',
      anim: 'shoot',
      dmg: 0.8,
      cd: 1.2,
      ms: 110,
      reach: box(0, 0),
      knockback: 50,
      angles: [0.5, 0.8, 1.1],
      hover: 70,
    },
    skill: { name: 'AMATERASU', desc: 'API HITAM ABADI MEMBAKAR MUSUH & MENJALAR', cd: 7 },
    ult: { name: 'TSUKUYOMI', desc: 'DUNIA MERAH: SEMUA MUSUH TERJEBAK 72 JAM DALAM SEDETIK' },
  },
  tongkatFrost: {
    id: 'tongkatFrost',
    name: 'TONGKAT GEMBALA',
    desc: 'SEMBURAN ES, FINISHER BOLA SALJU',
    projectile: { texture: 'iceshard', speed: 240 },
    dmg: 0.9,
    cd: 1,
    crit: 0.05,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 40, angles: [0], status: { freeze: 250 } },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 40, angles: [0], status: { freeze: 250 } },
      // Snowball: a big hit that knocks back and freezes longer.
      {
        anim: 'shoot',
        dmg: 1.6,
        cd: 1.4,
        ms: 140,
        reach: box(0, 0),
        knockback: 160,
        angles: [0],
        shot: 'snowball',
        status: { freeze: 600 },
      },
    ],
    air: {
      name: 'ANGIN MALAM',
      anim: 'shoot',
      dmg: 0.9,
      cd: 1.2,
      ms: 120,
      reach: box(0, 0),
      knockback: 40,
      angles: [0.4, 0.8],
      status: { freeze: 250 },
      hover: 120,
    },
    skill: { name: 'FROST NOVA', desc: 'LEDAKAN DINGIN DI SEKITAR, BEKUKAN MUSUH', cd: 5 },
    ult: { name: 'ABSOLUTE ZERO', desc: 'ARENA MEMBEKU: MUSUH MELAMBAT, BEKU, HP TERKIKIS' },
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
  | 'jiwaAbadi'
  | 'cawan'
  | 'bara'
  | 'topeng'
  | 'bulu'
  | 'koin'
  | 'sisik'
  | 'tanduk'
  | 'racun'
  | 'cermin'
  | 'keris'
  | 'badai'
  | 'jangkar'
  | 'pedangDewa'
  | 'kitabDewa'
  | 'cawanDewa'
  | 'sandal'
  | 'syal'
  | 'korek'
  | 'kompas'
  | 'plester'
  | 'arang'
  | 'teh'
  | 'lilin'
  | 'rantai'
  | 'kacamata'
  | 'ninja'
  | 'cambuk'
  | 'intiEs'
  | 'palu'
  | 'naga'
  | 'dupa'
  | 'topan'
  | 'bintang'
  | 'jubahDewa'
  | 'kendiDewa'
  | 'daun'
  | 'kelereng'
  | 'pisau'
  | 'gelang'
  | 'madu'
  | 'peluit'
  | 'tali'
  | 'garam'
  | 'kerang'
  | 'tanah'
  | 'topengPerak'
  | 'perisaiCahaya'
  | 'taringSerigala'
  | 'kantongEmas'
  | 'bayangan'
  | 'mahkotaEmas'
  | 'pedangNaga'
  | 'aegis'
  | 'jamDewa'
  | 'perisaiDewa';

export interface Item {
  name: string;
  desc: string;
  rarity: Rarity;
  apply(s: Derived): void;
}

/** Block items: the fastest block wins (they do not add up; set bonuses shorten it). */
const guard = (s: Derived, seconds: number) => void (s.barrier = s.barrier ? Math.min(s.barrier, seconds) : seconds);

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
  cawan: { name: 'CAWAN DARAH', desc: 'CURI 2% DAMAGE JADI HP', rarity: 'biasa', apply: (s) => void (s.lifesteal += 0.02) },
  bara: { name: 'BARA AMARAH', desc: 'DAMAGE +20% SAAT HP < 50%', rarity: 'biasa', apply: (s) => void (s.rage += 0.2) },
  topeng: {
    name: 'TOPENG ORC',
    desc: 'MAX HP +20, DAMAGE +5%',
    rarity: 'biasa',
    apply: (s) => {
      s.maxHp += 20;
      s.damage *= 1.05;
    },
  },
  bulu: {
    name: 'BULU GAGAK',
    desc: 'LARI +8%, KEBAL +0.2 DTK',
    rarity: 'biasa',
    apply: (s) => {
      s.speed *= 1.08;
      s.iframes += 200;
    },
  },
  koin: { name: 'KOIN KERAMAT', desc: '+2 KOIN TIAP ROUND', rarity: 'biasa', apply: (s) => void (s.coinBonus += 2) },
  sisik: { name: 'SISIK KURA', desc: 'DAMAGE DITERIMA -8%', rarity: 'biasa', apply: (s) => void (s.damageTaken *= 0.92) },

  tanduk: {
    name: 'TANDUK BANTENG',
    desc: 'DAMAGE +20%, MAX HP +10',
    rarity: 'rare',
    apply: (s) => {
      s.damage *= 1.2;
      s.maxHp += 10;
    },
  },
  racun: { name: 'BOTOL RACUN', desc: '20% HIT: ECHO 50% DAMAGE', rarity: 'rare', apply: (s) => void (s.echo += 0.2) },
  cermin: {
    name: 'CERMIN RETAK',
    desc: 'PANTUL 20 DAMAGE, KEBAL +0.2 DTK',
    rarity: 'rare',
    apply: (s) => {
      s.thorns += 20;
      s.iframes += 200;
    },
  },

  keris: {
    name: 'KERIS IBLIS',
    desc: 'CURI 5% DAMAGE, DAMAGE +10%',
    rarity: 'legend',
    apply: (s) => {
      s.lifesteal += 0.05;
      s.damage *= 1.1;
    },
  },
  badai: {
    name: 'AWAN BADAI',
    desc: 'ULTI +40% CEPAT, SKILL CD -15%',
    rarity: 'legend',
    apply: (s) => {
      s.ultGainMult *= 1.4;
      s.skillCdMult *= 0.85;
    },
  },
  jangkar: {
    name: 'JANGKAR RAKSASA',
    desc: 'MAX HP +40, DITERIMA -10%',
    rarity: 'legend',
    apply: (s) => {
      s.maxHp += 40;
      s.damageTaken *= 0.9;
    },
  },

  pedangDewa: { name: 'PEDANG DEWA', desc: 'DAMAGE +50%', rarity: 'godly', apply: (s) => void (s.damage *= 1.5) },
  kitabDewa: {
    name: 'KITAB DEWA',
    desc: 'SKILL X1.6, COOLDOWN SKILL -30%',
    rarity: 'godly',
    apply: (s) => {
      s.skillPower *= 1.6;
      s.skillCdMult *= 0.7;
    },
  },
  cawanDewa: {
    name: 'CAWAN DEWA',
    desc: 'CURI 8% DAMAGE, +5 HP TIAP BUNUH',
    rarity: 'godly',
    apply: (s) => {
      s.lifesteal += 0.08;
      s.healOnKill += 5;
    },
  },

  sandal: { name: 'SANDAL KILAT', desc: 'DAMAGE DASH +30%', rarity: 'biasa', apply: (s) => void (s.dashPower += 0.3) },
  syal: {
    name: 'SYAL MERAH',
    desc: 'DASH CD -12%, LARI +5%',
    rarity: 'biasa',
    apply: (s) => {
      s.dashCooldown *= 0.88;
      s.speed *= 1.05;
    },
  },
  korek: { name: 'KOREK API', desc: '10% HIT MEMBAKAR MUSUH', rarity: 'biasa', apply: (s) => void (s.burnChance += 0.1) },
  kompas: {
    name: 'KOMPAS TUA',
    desc: '+1 KOIN TIAP ROUND, KRITIS +4%',
    rarity: 'biasa',
    apply: (s) => {
      s.coinBonus += 1;
      s.critChance += 0.04;
    },
  },
  plester: {
    name: 'PLESTER SAKTI',
    desc: 'MAX HP +15, PULIH 0.3 HP/DTK',
    rarity: 'biasa',
    apply: (s) => {
      s.maxHp += 15;
      s.regen += 0.3;
    },
  },
  arang: {
    name: 'ARANG MEMBARA',
    desc: 'DAMAGE +8%, BURN/BEKU +20%',
    rarity: 'biasa',
    apply: (s) => {
      s.damage *= 1.08;
      s.elemental += 0.2;
    },
  },
  teh: { name: 'TEH HIJAU', desc: 'COOLDOWN SKILL -10%', rarity: 'biasa', apply: (s) => void (s.skillCdMult *= 0.9) },
  lilin: {
    name: 'LILIN ARWAH',
    desc: 'SOUL +20%, ULTI +10% CEPAT',
    rarity: 'biasa',
    apply: (s) => {
      s.soulMult *= 1.2;
      s.ultGainMult *= 1.1;
    },
  },
  rantai: {
    name: 'RANTAI BESI',
    desc: 'DITERIMA -6%, PANTUL 6',
    rarity: 'biasa',
    apply: (s) => {
      s.damageTaken *= 0.94;
      s.thorns += 6;
    },
  },
  kacamata: {
    name: 'KACAMATA BULAT',
    desc: 'KRITIS +6%, ECHO +5%',
    rarity: 'biasa',
    apply: (s) => {
      s.critChance += 0.06;
      s.echo += 0.05;
    },
  },

  ninja: {
    name: 'IKAT NINJA',
    desc: 'DAMAGE DASH +50%, KRITIS +5%',
    rarity: 'rare',
    apply: (s) => {
      s.dashPower += 0.5;
      s.critChance += 0.05;
    },
  },
  cambuk: {
    name: 'CAMBUK DURI',
    desc: 'ECHO +15%, PANTUL 10',
    rarity: 'rare',
    apply: (s) => {
      s.echo += 0.15;
      s.thorns += 10;
    },
  },
  intiEs: { name: 'INTI ES', desc: '10% HIT MEMBEKUKAN MUSUH', rarity: 'rare', apply: (s) => void (s.freezeChance += 0.1) },
  palu: {
    name: 'PALU GODAM',
    desc: 'DAMAGE +30%, JEDA SERANG +10%',
    rarity: 'rare',
    apply: (s) => {
      s.damage *= 1.3;
      s.swingCooldown *= 1.1;
    },
  },

  naga: {
    name: 'SISIK NAGA',
    desc: 'MAX HP +50, DITERIMA -8%',
    rarity: 'legend',
    apply: (s) => {
      s.maxHp += 50;
      s.damageTaken *= 0.92;
    },
  },
  dupa: {
    name: 'DUPA ARWAH',
    desc: '15% HIT MEMBAKAR, SKILL +20%',
    rarity: 'legend',
    apply: (s) => {
      s.burnChance += 0.15;
      s.skillPower *= 1.2;
    },
  },
  topan: {
    name: 'JUBAH TOPAN',
    desc: 'DASH CD -35%, LARI +15%',
    rarity: 'legend',
    apply: (s) => {
      s.dashCooldown *= 0.65;
      s.speed *= 1.15;
    },
  },
  bintang: {
    name: 'PECAHAN BINTANG',
    desc: '+1 PETIR TIAP BUNUH, KRITIS +8%',
    rarity: 'legend',
    apply: (s) => {
      s.killBolt += 1;
      s.critChance += 0.08;
    },
  },

  jubahDewa: {
    name: 'JUBAH DEWA',
    desc: 'DAMAGE DASH X2, DASH CD -30%',
    rarity: 'godly',
    apply: (s) => {
      s.dashPower *= 2;
      s.dashCooldown *= 0.7;
    },
  },
  kendiDewa: {
    name: 'KENDI DEWA',
    desc: '20% HIT MEMBEKUKAN, SKILL X1.4',
    rarity: 'godly',
    apply: (s) => {
      s.freezeChance += 0.2;
      s.skillPower *= 1.4;
    },
  },
  daun: {
    name: 'DAUN KELOR',
    desc: 'HINDAR SERANGAN 5%',
    rarity: 'biasa',
    apply: (s) => {
      s.dodge += 0.05;
    },
  },
  kelereng: {
    name: 'KELERENG',
    desc: '10% BUNUH = +1 KOIN',
    rarity: 'biasa',
    apply: (s) => {
      s.goldChance += 0.1;
    },
  },
  pisau: {
    name: 'PISAU DAGING',
    desc: 'DAMAGE KE BOSS/ELIT +15%',
    rarity: 'biasa',
    apply: (s) => {
      s.bossDamage += 0.15;
    },
  },
  gelang: {
    name: 'GELANG KAYU',
    desc: 'BLOK 1 SERANGAN TIAP 15 DTK',
    rarity: 'biasa',
    apply: (s) => {
      guard(s, 15);
    },
  },
  madu: {
    name: 'MADU HUTAN',
    desc: 'PULIH 0.4 HP/DTK, MAX HP +10',
    rarity: 'biasa',
    apply: (s) => {
      s.regen += 0.4;
      s.maxHp += 10;
    },
  },
  peluit: {
    name: 'PELUIT',
    desc: 'DASH CD -10%, HINDAR 3%',
    rarity: 'biasa',
    apply: (s) => {
      s.dashCooldown *= 0.9;
      s.dodge += 0.03;
    },
  },
  tali: {
    name: 'TALI BUSUR',
    desc: 'KRITIS +5%, JEDA SERANG -5%',
    rarity: 'biasa',
    apply: (s) => {
      s.critChance += 0.05;
      s.swingCooldown *= 0.95;
    },
  },
  garam: {
    name: 'GARAM SAKTI',
    desc: 'DAMAGE +6%, SOUL +10%',
    rarity: 'biasa',
    apply: (s) => {
      s.damage *= 1.06;
      s.soulMult *= 1.1;
    },
  },
  kerang: {
    name: 'KERANG LAUT',
    desc: 'DITERIMA -5%, +1 KOIN TIAP ROUND',
    rarity: 'biasa',
    apply: (s) => {
      s.damageTaken *= 0.95;
      s.coinBonus += 1;
    },
  },
  tanah: {
    name: 'GUCI TANAH',
    desc: 'MAX HP +25',
    rarity: 'biasa',
    apply: (s) => {
      s.maxHp += 25;
    },
  },
  topengPerak: {
    name: 'TOPENG PERAK',
    desc: 'HINDAR SERANGAN 10%',
    rarity: 'rare',
    apply: (s) => {
      s.dodge += 0.1;
    },
  },
  perisaiCahaya: {
    name: 'PERISAI CAHAYA',
    desc: 'BLOK 1 SERANGAN TIAP 8 DTK',
    rarity: 'rare',
    apply: (s) => {
      guard(s, 8);
    },
  },
  taringSerigala: {
    name: 'TARING SERIGALA',
    desc: 'DMG BOSS/ELIT +30%, KRITIS +5%',
    rarity: 'rare',
    apply: (s) => {
      s.bossDamage += 0.3;
      s.critChance += 0.05;
    },
  },
  kantongEmas: {
    name: 'KANTONG EMAS',
    desc: '25% BUNUH = +1 KOIN',
    rarity: 'rare',
    apply: (s) => {
      s.goldChance += 0.25;
    },
  },
  bayangan: {
    name: 'JUBAH BAYANGAN',
    desc: 'HINDAR 15%, LARI +10%',
    rarity: 'legend',
    apply: (s) => {
      s.dodge += 0.15;
      s.speed *= 1.1;
    },
  },
  mahkotaEmas: {
    name: 'MAHKOTA EMAS',
    desc: '40% BUNUH = +1 KOIN',
    rarity: 'legend',
    apply: (s) => {
      s.goldChance += 0.4;
    },
  },
  pedangNaga: {
    name: 'PEDANG NAGA',
    desc: 'DAMAGE KE BOSS/ELIT +50%',
    rarity: 'legend',
    apply: (s) => {
      s.bossDamage += 0.5;
    },
  },
  aegis: {
    name: 'AEGIS',
    desc: 'BLOK TIAP 6 DTK, DITERIMA -10%',
    rarity: 'legend',
    apply: (s) => {
      guard(s, 6);
      s.damageTaken *= 0.9;
    },
  },
  jamDewa: {
    name: 'JAM DEWA',
    desc: 'SKILL & DASH CD -35%',
    rarity: 'godly',
    apply: (s) => {
      s.skillCdMult *= 0.65;
      s.dashCooldown *= 0.65;
    },
  },
  perisaiDewa: {
    name: 'PERISAI DEWA',
    desc: 'BLOK TIAP 4 DTK, HINDAR 10%',
    rarity: 'godly',
    apply: (s) => {
      guard(s, 4);
      s.dodge += 0.1;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export interface ItemPair {
  items: readonly [ItemId, ItemId];
  name: string;
  desc: string;
  apply(s: Derived): void;
}

const pair = (a: ItemId, b: ItemId, name: string, desc: string, apply: (s: Derived) => void): ItemPair => ({
  items: [a, b],
  name,
  desc,
  apply,
});

/** Every item has exactly one partner; owning both unlocks the set bonus. */
export const PAIRS: readonly ItemPair[] = [
  pair('batu', 'lonceng', 'TEMPAAN PERANG', 'FINISHER COMBO = GELOMBANG', (s) => void (s.finisherWave = 1)),
  pair('sepatu', 'jubah', 'LANGKAH BAYANG', 'KRITIS ISI DASH, LARI +10%', (s) => {
    s.critResetsDash = 1;
    s.speed *= 1.1;
  }),
  pair('jantung', 'roti', 'PESTA NAGA', 'MAX HP +25, PULIH +1 HP/DTK', (s) => {
    s.maxHp += 25;
    s.regen += 1;
  }),
  pair('taring', 'cawan', 'HAUS DARAH', 'CURI 3% DMG, +3 HP TIAP BUNUH', (s) => {
    s.lifesteal += 0.03;
    s.healOnKill += 3;
  }),
  pair('mata', 'tulang', 'BIDIKAN TULANG', 'KRITIS +8%, PENGALI KRITIS +0.3', (s) => {
    s.critChance += 0.08;
    s.critMult += 0.3;
  }),
  pair('sarung', 'bara', 'TINJU MEMBARA', 'AMARAH +20%, JEDA SERANG -8%', (s) => {
    s.rage += 0.2;
    s.swingCooldown *= 0.92;
  }),
  pair('sayap', 'bulu', 'SAYAP GAGAK', '+1 LOMPAT UDARA, DASH CD -15%', (s) => {
    s.extraJumps += 1;
    s.dashCooldown *= 0.85;
  }),
  pair('kantong', 'koin', 'SERAKAH', '+2 KOIN TIAP ROUND, SOUL +25%', (s) => {
    s.coinBonus += 2;
    s.soulMult *= 1.25;
  }),
  pair('duri', 'sisik', 'KULIT BAJA', 'PANTUL +15, DITERIMA -8%', (s) => {
    s.thorns += 15;
    s.damageTaken *= 0.92;
  }),
  pair('cincin', 'sabuk', 'PENJAGA', 'KEBAL +0.4 DTK, MAX HP +20', (s) => {
    s.iframes += 400;
    s.maxHp += 20;
  }),
  pair('gulungan', 'jimat', 'MANTRA KILAT', 'ULTI ISI SENDIRI, SKILL CD -15%', (s) => {
    s.ultRegen += 2;
    s.skillCdMult *= 0.85;
  }),
  pair('tapal', 'topeng', 'KELANA', 'DAMAGE +12%, +1 KOIN TIAP ROUND', (s) => {
    s.damage *= 1.12;
    s.coinBonus += 1;
  }),
  pair('jam', 'kristal', 'WAKTU JIWA', 'SKILL CD -20%, ULTI +30% CEPAT', (s) => {
    s.skillCdMult *= 0.8;
    s.ultGainMult *= 1.3;
  }),
  pair('perisai', 'cermin', 'BENTENG CERMIN', 'PANTUL +25, DITERIMA -10%', (s) => {
    s.thorns += 25;
    s.damageTaken *= 0.9;
  }),
  pair('kalung', 'racun', 'RACUN TAJAM', 'ECHO +20%, PENGALI KRITIS +0.3', (s) => {
    s.echo += 0.2;
    s.critMult += 0.3;
  }),
  pair('tengkorak', 'tanduk', 'AMUK BANTENG', 'AMARAH +35%, CURI 3% DAMAGE', (s) => {
    s.rage += 0.35;
    s.lifesteal += 0.03;
  }),
  pair('mahkota', 'jangkar', 'RAJA LAUT', 'MAX HP +30, DITERIMA -15%', (s) => {
    s.maxHp += 30;
    s.damageTaken *= 0.85;
  }),
  pair('phoenix', 'lentera', 'API ARWAH', '+1 JIWA PEMBURU, PULIH 1 HP/DTK', (s) => {
    s.killSouls += 1;
    s.regen += 1;
  }),
  pair('gema', 'keris', 'GEMA IBLIS', 'ECHO +25%, CURI 3% DAMAGE', (s) => {
    s.echo += 0.25;
    s.lifesteal += 0.03;
  }),
  pair('petir', 'badai', 'AMUKAN BADAI', '+2 PETIR TIAP BUNUH, ULTI +30%', (s) => {
    s.killBolt += 2;
    s.ultGainMult *= 1.3;
  }),
  pair('hatiDewa', 'cawanDewa', 'KEABADIAN', 'PULIH +3 HP/DTK, CURI 5% DAMAGE', (s) => {
    s.regen += 3;
    s.lifesteal += 0.05;
  }),
  pair('mataDewa', 'pedangDewa', 'MURKA DEWA', 'DAMAGE +30%, ECHO +30%', (s) => {
    s.damage *= 1.3;
    s.echo += 0.3;
  }),
  pair('sayapDewa', 'mahkotaMaut', 'MALAIKAT MAUT', 'EKSEKUSI HP < 30%, KRITIS ISI DASH', (s) => {
    s.execute = Math.max(s.execute, 0.3);
    s.critResetsDash = 1;
  }),
  pair('jiwaAbadi', 'kitabDewa', 'KITAB ABADI', 'SKILL X1.5, SKILL CD -30%', (s) => {
    s.skillPower *= 1.5;
    s.skillCdMult *= 0.7;
  }),
  pair('sandal', 'syal', 'KAKI ANGIN', 'DAMAGE DASH +40%, DASH CD -10%', (s) => {
    s.dashPower += 0.4;
    s.dashCooldown *= 0.9;
  }),
  pair('korek', 'arang', 'UNGGUN', 'BURN +50%, +10% HIT MEMBAKAR', (s) => {
    s.elemental += 0.5;
    s.burnChance += 0.1;
  }),
  pair('kompas', 'kacamata', 'PENJELAJAH', 'KRITIS +6%, +1 KOIN TIAP ROUND', (s) => {
    s.critChance += 0.06;
    s.coinBonus += 1;
  }),
  pair('plester', 'rantai', 'PERBAN BAJA', 'MAX HP +20, DITERIMA -6%', (s) => {
    s.maxHp += 20;
    s.damageTaken *= 0.94;
  }),
  pair('teh', 'lilin', 'MEDITASI', 'ULTI ISI SENDIRI, SKILL CD -10%', (s) => {
    s.ultRegen += 1.5;
    s.skillCdMult *= 0.9;
  }),
  pair('ninja', 'cambuk', 'PEMBURU BAYANG', 'DAMAGE DASH +50%, ECHO +10%', (s) => {
    s.dashPower += 0.5;
    s.echo += 0.1;
  }),
  pair('intiEs', 'palu', 'PALU ES', '+10% HIT BEKU, DAMAGE +10%', (s) => {
    s.freezeChance += 0.1;
    s.damage *= 1.1;
  }),
  pair('naga', 'dupa', 'NAFAS NAGA', '+15% HIT MEMBAKAR, DAMAGE +15%', (s) => {
    s.burnChance += 0.15;
    s.damage *= 1.15;
  }),
  pair('topan', 'bintang', 'BADAI BINTANG', 'DAMAGE DASH +80%, +1 PETIR', (s) => {
    s.dashPower += 0.8;
    s.killBolt += 1;
  }),
  pair('jubahDewa', 'kendiDewa', 'RESTU LANGIT', 'DAMAGE +25%, DITERIMA -20%', (s) => {
    s.damage *= 1.25;
    s.damageTaken *= 0.8;
  }),
  pair('daun', 'peluit', 'LINCAH', 'HINDAR +5%, LARI +8%', (s) => {
    s.dodge += 0.05;
    s.speed *= 1.08;
  }),
  pair('kelereng', 'kerang', 'HARTA KARUN', '+10% KOIN BUNUH, +1 KOIN/ROUND', (s) => {
    s.goldChance += 0.1;
    s.coinBonus += 1;
  }),
  pair('pisau', 'garam', 'PEMBURU BESAR', 'DAMAGE KE BOSS/ELIT +20%', (s) => {
    s.bossDamage += 0.2;
  }),
  pair('gelang', 'tanah', 'BENTENG TANAH', 'BLOK CD -30%, MAX HP +15', (s) => {
    s.barrier *= 0.7;
    s.maxHp += 15;
  }),
  pair('madu', 'tali', 'BEKAL', 'PULIH +0.5 HP/DTK, KRITIS +4%', (s) => {
    s.regen += 0.5;
    s.critChance += 0.04;
  }),
  pair('topengPerak', 'perisaiCahaya', 'PENGAWAL', 'HINDAR +5%, BLOK CD -25%', (s) => {
    s.dodge += 0.05;
    s.barrier *= 0.75;
  }),
  pair('taringSerigala', 'kantongEmas', 'BURU HADIAH', 'BOSS/ELIT +20%, +10% KOIN BUNUH', (s) => {
    s.bossDamage += 0.2;
    s.goldChance += 0.1;
  }),
  pair('bayangan', 'aegis', 'TAK TERSENTUH', 'HINDAR +10%, BLOK CD -30%', (s) => {
    s.dodge += 0.1;
    s.barrier *= 0.7;
  }),
  pair('mahkotaEmas', 'pedangNaga', 'RAJA PEMBURU', 'BOSS/ELIT +30%, DAMAGE +10%', (s) => {
    s.bossDamage += 0.3;
    s.damage *= 1.1;
  }),
  pair('jamDewa', 'perisaiDewa', 'KEKEKALAN', 'DAMAGE +20%, PULIH 2 HP/DTK', (s) => {
    s.damage *= 1.2;
    s.regen += 2;
  }),
];

/** The set an item belongs to, and the item that completes it. */
export function pairOf(id: ItemId): { pair: ItemPair; partner: ItemId } {
  const p = PAIRS.find((x) => x.items.includes(id))!;
  return { pair: p, partner: p.items[0] === id ? p.items[1] : p.items[0] };
}

export function activePairs(items: readonly ItemId[]): ItemPair[] {
  return PAIRS.filter((p) => p.items.every((id) => items.includes(id)));
}

/** Permanent stats + class + current weapon + items picked up this run. */
export function runStats(base: Derived, weapon: Weapon, items: readonly ItemId[], cls?: ClassId): Derived {
  const s = { ...base };
  if (cls) {
    CLASSES[cls].apply(s);
    if (hasSynergy(cls, weapon.id)) CLASSES[cls].synergy.apply(s);
  }
  // Items are unique; fixed order so pickup order does not change an identical build.
  for (const id of ITEM_IDS) if (items.includes(id)) ITEMS[id].apply(s);
  for (const p of activePairs(items)) p.apply(s);
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
  s.dashPower = Math.min(4, s.dashPower);
  s.elemental = Math.min(3, s.elemental);
  s.burnChance = Math.min(0.6, s.burnChance);
  s.freezeChance = Math.min(0.4, s.freezeChance);
  s.dodge = Math.min(0.4, s.dodge);
  s.barrier = s.barrier && Math.max(3, s.barrier);
  s.goldChance = Math.min(0.8, s.goldChance);
  s.bossDamage = Math.min(1.5, s.bossDamage);
  s.lifesteal = Math.min(0.2, s.lifesteal);
  s.rage = Math.min(0.8, s.rage);
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

/**
 * Up to three distinct choices. Items are unique per run: owned (or spent) ones never come back.
 * Boss rounds (every 5th) offer only rare/legend/godly items.
 */
export function rollRewards(round = 1, owned: readonly ItemId[] = [], rand: () => number = Math.random): Reward[] {
  const take = <T>(pool: T[]): T => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const fresh = (rarity: Rarity) => ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity && !owned.includes(id));
  const item = (id: ItemId): Reward => ({ type: 'item', id });
  const picks: Reward[] = [];
  if (round % 5 === 0) {
    const pools = { rare: fresh('rare'), legend: fresh('legend'), godly: fresh('godly') };
    // An emptied pool just rerolls the rarity.
    while (picks.length < 3 && pools.rare.length + pools.legend.length + pools.godly.length) {
      const pool = pools[rollRarity(round / 5, rand())];
      if (pool.length) picks.push(item(take(pool)));
    }
  } else {
    const pool: Reward[] = [...fresh('biasa').map(item), { type: 'potion' }];
    while (picks.length < 3 && pool.length) picks.push(take(pool));
    // Commons run out late in a run: top up with rare ones.
    const extra = fresh('rare');
    while (picks.length < 3 && extra.length) picks.push(item(take(extra)));
  }
  if (picks.length < 3 && !picks.some((r) => r.type === 'potion')) picks.push({ type: 'potion' });
  return picks;
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
