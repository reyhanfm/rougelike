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
  | 'tongkatFrost'
  | 'rasengan'
  | 'kusanagi'
  | 'gravitasi'
  | 'halilintar'
  | 'surgaNeraka'
  | 'foton'
  | 'pedangSurya'
  | 'sabitCandra';

/** Elemental effects on hit. burn: damage mult per tick for a few seconds; freeze: ms without moving or acting; slow: ms at a crawl. */
export interface Status {
  burn?: number;
  freeze?: number;
  /** ms moving at a crawl (gravity, blizzards). */
  slow?: number;
}

/** cross: a down cut and an up cut in one move, each hitting (Tsubame Gaeshi). */
export type MoveAnim = 'down' | 'up' | 'overhead' | 'thrust' | 'shoot' | 'spin' | 'plunge' | 'jab' | 'hook' | 'uppercut' | 'cross';

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
  /** A thin cut of this color flashes across each enemy hit (and along the path of a lunge). */
  cut?: number;
  /** Projectile texture for this move instead of the weapon's. */
  shot?: string;
  /** This move's projectiles pass through enemies (even if the weapon's do not). */
  pierce?: boolean;
  /** This move's projectiles vanish after this many px (shotgun pellets). */
  range?: number;
  /** A flurry: the hitbox strikes each enemy this many times over the move (dmg is per hit). */
  hits?: number;
  /** Throws non-boss enemies it hits upward at this speed, px/s (a launcher). */
  launch?: number;
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
  /** spin: thrown blades turn end over end in flight. */
  projectile?: { texture: string; speed: number; homing?: boolean; returning?: boolean; gate?: boolean; pierce?: boolean; spin?: boolean };
  /** Second blade in the off hand (twin swords); it mirrors the main blade's swing and alternates in throws. */
  twin?: string;
  automatic?: boolean;
  /** Fists: held upright at the hand instead of as a blade. */
  fist?: boolean;
  /** The attack key casts a technique (SKILLS[id].basic) instead of swinging; combo[0] describes one cast for balance. */
  cast?: boolean;
  /** Texture of the swing arc instead of the broad 'slash'. */
  arc?: string;
  /** Tint of the swing arc. */
  arcTint?: number;
  /** Cut mark color on every melee hit (a move's own `cut` wins). */
  cut?: number;
  /** Fists: a burst of this color on every melee hit. */
  impact?: number;
  /** Attack and skill pressed together cast this instead (SKILLS[id].fusion). cd in seconds. */
  fusion?: { name: string; desc: string; cd: number };
  combo: Move[];
  /** The mid-air combo (attack in the air): chained like the ground combo, each move a small lift so it can reach
   * and keep up with flyers. */
  air: Move[];
  /** Down + attack in the air: the dive (a plunge, usually a slam on landing). */
  dive: Move & { name: string };
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
    desc: 'PEDANG SUCI BERSELUBUNG ANGIN, COMBO 4, J+L: RHONGOMYNIAD',
    dmg: 1,
    cd: 1,
    crit: 0,
    cut: 0xc2f0ff,
    combo: [
      { anim: 'down', dmg: 1, cd: 1, ms: 110, reach: box(22, 20), knockback: 100 },
      { anim: 'up', dmg: 1, cd: 1, ms: 110, reach: box(22, 22), knockback: 100 },
      // Mana Burst: a blue flare of prana hurls her forward through the enemy.
      { anim: 'thrust', dmg: 1.3, cd: 1.1, ms: 160, reach: box(30, 12), knockback: 180, lunge: 280, trail: 0x29adff },
      // Invisible Air falls away for one heavy downward cut.
      { anim: 'overhead', dmg: 1.9, cd: 1.5, ms: 200, reach: box(30, 32), knockback: 260 },
    ],
    air: [
      // Wind-wrapped cuts that keep her aloft: down, up, then the whirling Invisible Air.
      { anim: 'down', dmg: 0.9, cd: 1, ms: 110, reach: box(24, 22), knockback: 100, hover: 70, cut: 0xc2f0ff },
      { anim: 'up', dmg: 0.9, cd: 1, ms: 110, reach: box(24, 26), knockback: 100, hover: 70, cut: 0xc2f0ff },
      { anim: 'spin', dmg: 1.1, cd: 1.3, ms: 220, reach: box(30, 30), knockback: 140, hitbox: 'around', hover: 60 },
    ],
    dive: {
      name: 'MANA BURST JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 60, vy: 400 },
      slam: 28,
      trail: 0x29adff,
      cut: 0xc2f0ff,
    },
    skill: { name: 'STRIKE AIR', desc: 'PALU ANGIN: EXCALIBUR TERBUKA 8 DTK, SERANGAN JADI CAHAYA, SKILL JADI KILAU EXCALIBUR', cd: 6 },
    fusion: { name: 'RHONGOMYNIAD', desc: 'J+L: TOMBAK SUCI JADI PUSARAN CAHAYA MENEMBUS BARISAN, LALU MENARA CAHAYA JATUH', cd: 12 },
    ult: { name: 'EXCALIBUR', desc: '13 SEGEL DILEPAS: CAHAYA EMAS MENYAPU DARI LANGIT, LALU MEMBANJIRI SELURUH MEDAN' },
  },
  belati: {
    id: 'belati',
    name: 'AZRAEL',
    desc: 'PEDANG BESAR MALAIKAT MAUT, COMBO 3',
    dmg: 1.3,
    cd: 1.3,
    crit: 0.1,
    arc: 'slashWide',
    arcTint: 0x9aa0c8,
    cut: 0x29adff,
    combo: [
      // An executioner's rhythm: one heavy chop straight down, then a cross cut both ways.
      { anim: 'overhead', dmg: 1.2, cd: 1.2, ms: 170, reach: box(26, 30), knockback: 160 },
      { anim: 'cross', dmg: 0.8, cd: 1.1, ms: 200, reach: box(28, 26), knockback: 120 },
      // PENGGAL (the beheading): he glides through in one azure stroke; a life nearly spent is taken outright
      // (SKILLS.belati.onHit).
      {
        anim: 'down',
        dmg: 1.6,
        cd: 1.6,
        ms: 200,
        reach: box(34, 22),
        knockback: 220,
        lunge: 220,
        trail: 0x29adff,
        cut: 0x7fe6ff,
        status: { burn: 0.15 },
      },
    ],
    air: [
      // Azrael swung in the air: a heavy chop, then a cross cut both ways.
      { anim: 'overhead', dmg: 1.1, cd: 1.2, ms: 170, reach: box(26, 28), knockback: 160, hover: 60, cut: 0x29adff },
      { anim: 'cross', dmg: 0.7, cd: 1.2, ms: 200, reach: box(28, 26), knockback: 120, hover: 60, cut: 0x7fe6ff },
    ],
    dive: {
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
    skill: { name: 'LONCENG SENJA', desc: 'LONCENG MEMANGGIL NAMA MUSUH, AZRAEL JATUH BERAPI BIRU (EKSEKUSI HP < 30%)', cd: 6 },
    fusion: { name: 'API BIRU KUBUR', desc: 'J+L: TEBASAN BULAN SABIT API BIRU SETINGGI ARENA, MEMBAKAR', cd: 9 },
    ult: { name: 'AZRAEL', desc: 'LONCENG BERBUNYI 3 KALI, BAYANGAN HASSAN MEMENGGAL SEMUA MUSUH' },
  },

  tombak: {
    id: 'tombak',
    name: 'GAE BOLG',
    desc: 'TOMBAK KUTUKAN MERAH, TUSUKAN JAUH',
    dmg: 1.1,
    cd: 1.1,
    crit: 0,
    arc: 'slashMoon',
    arcTint: 0xff4a6e,
    cut: 0xff004d,
    combo: [
      // A long poke at the very tip of the spear's reach.
      { anim: 'thrust', dmg: 1, cd: 1, ms: 140, reach: box(40, 8), knockback: 150 },
      // The spear twirled around him, the shaft and the point both striking (two hits).
      { anim: 'spin', dmg: 0.6, cd: 1.1, ms: 240, reach: box(40, 24), knockback: 120, hitbox: 'around', hits: 2 },
      // Gae Bolg driven home on a charge, the curse's barbs bursting out (SKILLS.tombak.onHit).
      { anim: 'thrust', dmg: 1.3, cd: 1.4, ms: 180, reach: box(36, 10), knockback: 240, lunge: 220, trail: 0xff004d },
    ],
    air: [
      // A long aerial poke, then the spear twirled around him (two hits).
      { anim: 'thrust', dmg: 1, cd: 1, ms: 140, reach: box(38, 8), knockback: 150, hover: 60 },
      { anim: 'spin', dmg: 0.6, cd: 1.2, ms: 240, reach: box(36, 24), knockback: 120, hitbox: 'around', hover: 60, hits: 2 },
    ],
    dive: {
      // Spear point first, straight down; it pogos off whatever it skewers (and he can go again).
      name: 'TUSUKAN BAWAH',
      anim: 'plunge',
      dmg: 1.2,
      cd: 0.8,
      ms: 700,
      reach: box(8, 24),
      knockback: 60,
      hitbox: 'below',
      dive: { vx: 30, vy: 380 },
      bounce: 240,
    },
    skill: { name: 'GAE BOLG', desc: 'TUSUKAN YANG PASTI MENGENAI JANTUNG, KRITIS', cd: 5 },
    fusion: { name: 'ANSUZ', desc: 'J+L: RUNE API DIUKIR DI UDARA, MENCAP & MEMBAKAR SEMUA MUSUH', cd: 10 },
    ult: { name: 'TOMBAK TERBANG PEMBUNUH', desc: 'ANCANG-ANCANG, LOMPAT, TOMBAK PECAH JADI BADAI TOMBAK KE TIAP MUSUH' },
  },
  kapak: {
    id: 'kapak',
    name: 'PEDANG BATU',
    desc: 'KAPAK-PEDANG BATU, TEBASAN LEBAR',
    dmg: 1.8,
    cd: 1.7,
    crit: 0,
    arc: 'slashWide',
    arcTint: 0xd08a50,
    cut: 0xffa300,
    combo: [
      { anim: 'down', dmg: 1.1, cd: 1.1, ms: 200, reach: box(26, 30), knockback: 240 },
      // The stone axe-sword whirled all the way around him.
      { anim: 'spin', dmg: 1, cd: 1.2, ms: 260, reach: box(44, 30), knockback: 200, hitbox: 'around' },
      // Brought down so hard the floor heaves: a wave of rock runs on ahead (SKILLS.kapak.onSwing).
      { anim: 'overhead', dmg: 1.5, cd: 1.6, ms: 260, reach: box(28, 34), knockback: 300, lunge: 60 },
    ],
    air: [
      // The stone axe-sword chopped down, then whirled all the way round.
      { anim: 'down', dmg: 1.1, cd: 1.2, ms: 200, reach: box(26, 30), knockback: 220, hover: 50 },
      { anim: 'spin', dmg: 1, cd: 1.3, ms: 240, reach: box(40, 30), knockback: 200, hitbox: 'around', hover: 50 },
    ],
    dive: {
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
    skill: { name: 'SINGA NEMEA', desc: 'ROH SINGA NEMEA MENERKAM 3 MUSUH (UDARA JUGA), MENCAKAR, LALU MENGAUM', cd: 6 },
    fusion: { name: 'GOD HAND', desc: 'J+L: KEBAL, MENERJANG ARENA, MELOMPAT KE MUSUH UDARA, MENGHANTAM BUMI', cd: 11 },
    ult: { name: 'NINE LIVES', desc: 'SEMBILAN PUKULAN KE MUSUH YANG DITANDAI, LALU JATUH MENGHANCURKAN ARENA' },
  },
  busur: {
    id: 'busur',
    name: 'KANSHOU & BAKUYA',
    desc: 'PEDANG KEMBAR, DILEMPAR KEMBALI KE TANGAN',
    // The pair are drawn to each other: thrown, they spin out and fly back to his hands.
    projectile: { texture: 'w_busur', speed: 240, returning: true, spin: true },
    twin: 'w_bakuya',
    dmg: 1,
    cd: 0.8,
    crit: 0.05,
    arc: 'slashTwin',
    cut: 0xfff1e8,
    combo: [
      // Kanshou: the black blade cuts down while Bakuya sweeps up behind it.
      { anim: 'down', dmg: 0.9, cd: 0.8, ms: 80, reach: box(22, 18), knockback: 70 },
      // Bakuya answers: the white blade rises.
      { anim: 'up', dmg: 0.9, cd: 0.8, ms: 80, reach: box(22, 20), knockback: 70 },
      // Both blades together, crossing: two hits.
      { anim: 'cross', dmg: 0.7, cd: 1, ms: 150, reach: box(26, 22), knockback: 110, cut: 0xff004d },
      // Throw the pair; they curve back to him.
      { anim: 'shoot', dmg: 1.1, cd: 1.3, ms: 120, reach: box(0, 0), knockback: 90, angles: [-0.15, 0.15] },
    ],
    air: [
      // Crane's Wings: both blades crossing around him, then the pair thrown level and caught again.
      { anim: 'cross', dmg: 0.7, cd: 1.1, ms: 180, reach: box(28, 28), knockback: 100, hitbox: 'around', hover: 100 },
      { anim: 'shoot', dmg: 0.9, cd: 1.3, ms: 120, reach: box(0, 0), knockback: 90, angles: [-0.15, 0.15], hover: 60 },
    ],
    dive: {
      name: 'TERJUNAN BANGAU',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 80, vy: 400 },
      slam: 26,
      cut: 0xfff1e8,
    },
    skill: { name: 'CALADBOLG II', desc: 'PANAH SPIRAL YANG MELEDAK SAAT KENA', cd: 5 },
    fusion: { name: 'KAKUYOKU SANREN', desc: 'J+L: TIGA PASANG KANSHOU & BAKUYA MENGAPIT MUSUH, LALU OVEREDGE', cd: 9 },
    ult: { name: 'UNLIMITED BLADE WORKS', desc: 'DUNIA PEDANG: HUJAN PEDANG KE SEMUA MUSUH' },
  },
  sabit: {
    id: 'sabit',
    name: 'SABIT MAUT',
    desc: 'SAPUAN LEBAR, COMBO 3',
    dmg: 1.3,
    cd: 1.3,
    crit: 0.05,
    arc: 'slashMoon',
    arcTint: 0xc2c3c7,
    cut: 0x29adff,
    combo: [
      // The scythe's hooked blade drags its victims in (negative knockback) for the reap.
      { anim: 'down', dmg: 1, cd: 1, ms: 160, reach: box(32, 22), knockback: -110 },
      { anim: 'up', dmg: 1, cd: 1, ms: 160, reach: box(32, 24), knockback: -90 },
      // The reap: a full turn of the blade; every soul it cuts feeds him (SKILLS.sabit.onHit).
      { anim: 'spin', dmg: 1.6, cd: 1.5, ms: 260, reach: box(44, 32), knockback: 200, hitbox: 'around' },
    ],
    air: [
      // A hooking cut that drags the enemy in, then the full moon of the blade around him.
      { anim: 'down', dmg: 1, cd: 1, ms: 160, reach: box(32, 24), knockback: -90, hover: 70 },
      { anim: 'spin', dmg: 1.2, cd: 1.2, ms: 220, reach: box(32, 32), knockback: 140, hitbox: 'around', hover: 60 },
    ],
    dive: {
      name: 'SABIT JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 40, vy: 400 },
      slam: 30,
      cut: 0x29adff,
    },
    skill: { name: 'GERBANG ALAM BAKA', desc: 'LANTAI TERBELAH: TANGAN TULANG & RANTAI JIWA MENYERET MUSUH, LALU MENGGIGIT', cd: 6 },
    fusion: { name: 'JAM PASIR AJAL', desc: 'J+L: JAM PASIR DI ATAS TIAP MUSUH, SAAT HABIS SABIT MENEBAS (HP RENDAH X2)', cd: 10 },
    ult: { name: 'PANEN MAUT', desc: 'WUJUD ASLI MALAIKAT MAUT MENUAI DARAT & LANGIT; TIAP JIWA DIPANEN JADI HP' },
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
      // Every third pull is the underbarrel shotgun: five pellets that spread and die out at short range.
      {
        anim: 'shoot',
        dmg: 0.45,
        cd: 1.4,
        ms: 120,
        reach: box(0, 0),
        knockback: 40,
        angles: [-0.2, -0.1, 0, 0.1, 0.2],
        range: 80,
        shot: 'pellet',
      },
    ],
    air: [
      // Strafing fire from the air: level, raised, then a spread.
      { anim: 'shoot', dmg: 1, cd: 1, ms: 70, reach: box(0, 0), knockback: 12, angles: [0], hover: 40 },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 70, reach: box(0, 0), knockback: 12, angles: [-0.35], hover: 40 },
      { anim: 'shoot', dmg: 0.6, cd: 1.2, ms: 90, reach: box(0, 0), knockback: 20, angles: [-0.3, 0, 0.3], hover: 40 },
    ],
    dive: {
      name: 'INJAKAN TEMPUR',
      anim: 'plunge',
      dmg: 1.1,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 80, vy: 420 },
      slam: 26,
    },
    skill: { name: 'TEMBAKAN SNIPER', desc: 'BIDIK MUSUH TERKUAT (UDARA JUGA), PELURU ANTI-TANK MENEMBUS SEGARIS', cd: 5 },
    fusion: { name: 'SERANGAN UDARA', desc: 'J+L: SUAR MERAH, PESAWAT MEMBOM DARAT & MEMBERONDONG MUSUH UDARA', cd: 12 },
    ult: { name: 'BADAI TIMAH', desc: 'SENAPAN MESIN 6 LARAS MENYAPU DARAT & LANGIT, DITUTUP ROKET KE KERUMUNAN' },
  },
  pedangTerbang: {
    id: 'pedangTerbang',
    name: 'PEDANG TERBANG',
    desc: 'PEDANG QI BERBURU SENDIRI: 1, 2, LALU 3 PEDANG SEKALIGUS',
    dmg: 1,
    cd: 1,
    crit: 0.05,
    // Swords of qi that hunt on their own: nothing to catch, so he can keep sending them.
    projectile: { texture: 'w_pedangTerbang', speed: 260, homing: true },
    combo: [
      // The sword formation grows with the combo: one sword, then a pair, then three in a fan.
      { anim: 'shoot', dmg: 1, cd: 0.9, ms: 90, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 0.75, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [-0.15, 0.15] },
      { anim: 'shoot', dmg: 0.75, cd: 1.3, ms: 140, reach: box(0, 0), knockback: 110, angles: [-0.3, 0, 0.3] },
    ],
    air: [
      // From the air: one sword level, then a pair sent up at the sky.
      { anim: 'shoot', dmg: 1, cd: 0.9, ms: 90, reach: box(0, 0), knockback: 60, angles: [0], hover: 60 },
      { anim: 'shoot', dmg: 0.75, cd: 1.1, ms: 100, reach: box(0, 0), knockback: 60, angles: [-0.5, -0.15], hover: 60 },
    ],
    dive: {
      name: 'PEDANG JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 0, vy: 440 },
      slam: 30,
      trail: 0x29adff,
    },
    skill: {
      name: 'FORMASI ENAM PEDANG',
      desc: 'ENAM PEDANG MENGUNCI KERUMUNAN DALAM SEGEL, MENEBAS SILANG, LALU MENUTUP; SEGEL MELUAS TIAP ALAM',
      cd: 5,
    },
    fusion: { name: 'PEDANG LANGIT', desc: 'J+L: PEDANG RAKSASA MENGHUNJAM, LALU PECAH JADI PEDANG PEMBURU', cd: 10 },
    ult: { name: 'SUNGAI SERIBU PEDANG', desc: 'SUNGAI PEDANG MENGALIR MENEMBUS TIAP MUSUH, LALU MEKAR JADI BUNGA PEDANG' },
  },
  tongkat: {
    id: 'tongkat',
    name: 'TONGKAT ELEMEN',
    desc: 'API, ES, PETIR, LALU BATU BESAR: EMPAT ELEMEN BERGANTIAN',
    dmg: 0.9,
    cd: 1.1,
    crit: 0,
    projectile: { texture: 'fireball', speed: 200 },
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0], status: { burn: 0.15 } },
      { anim: 'shoot', dmg: 0.9, cd: 1, ms: 100, reach: box(0, 0), knockback: 30, angles: [0], shot: 'iceshard', status: { freeze: 350 } },
      // Twin sparks of lightning, fast and stunning.
      {
        anim: 'shoot',
        dmg: 0.8,
        cd: 1,
        ms: 100,
        reach: box(0, 0),
        knockback: 40,
        angles: [-0.08, 0.08],
        shot: 'boltShot',
        status: { freeze: 200 },
      },
      // A boulder wrenched up and flung: the heavy finisher.
      { anim: 'shoot', dmg: 1.8, cd: 1.5, ms: 160, reach: box(0, 0), knockback: 220, angles: [0], shot: 'boulder', status: { slow: 900 } },
    ],
    air: [
      // The element cycle in the air: a fireball, twin ice shards, then sparks of lightning arcing up.
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0], status: { burn: 0.15 }, hover: 60 },
      {
        anim: 'shoot',
        dmg: 0.8,
        cd: 1,
        ms: 100,
        reach: box(0, 0),
        knockback: 30,
        angles: [-0.25, 0.25],
        shot: 'iceshard',
        status: { freeze: 350 },
        hover: 60,
      },
      {
        anim: 'shoot',
        dmg: 0.8,
        cd: 1.2,
        ms: 100,
        reach: box(0, 0),
        knockback: 40,
        angles: [-0.5, -0.2],
        shot: 'boltShot',
        status: { freeze: 200 },
        hover: 50,
      },
    ],
    dive: {
      name: 'METEOR KECIL',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 30,
      trail: 0xffa300,
      status: { burn: 0.2 },
    },
    skill: { name: 'SIKLUS ELEMEN', desc: 'TIAP CAST GANTI ELEMEN: INFERNO, GLACIER, THUNDER, QUAKE', cd: 5 },
    fusion: { name: 'REAKSI ELEMEN', desc: 'J+L: ELEMEN KINI + BERIKUTNYA BERTABRAKAN: UAP/KRISTAL/PLASMA/MAGMA', cd: 10 },
    ult: { name: 'KIAMAT ELEMEN', desc: 'LINGKARAN SIHIR RAKSASA: METEOR, PETIR, ES, BUMI, LALU LEDAKAN PRISMA' },
  },
  katana: {
    id: 'katana',
    name: 'KATANA',
    desc: 'TEBASAN KILAT, FINISHER IAI MENEMBUS',
    dmg: 1,
    cd: 0.8,
    crit: 0.1,
    arc: 'slashKatana',
    combo: [
      // Every cut is a step in: kiri-age, the draw-cut rising out of the scabbard, then kesa-giri back down across
      // the shoulder; the blade clicks home in its scabbard after each (SKILLS.katana.onSwing).
      { anim: 'up', dmg: 1, cd: 0.9, ms: 90, reach: box(26, 22), knockback: 90, lunge: 110, cut: 0xfff1e8 },
      { anim: 'down', dmg: 1, cd: 0.9, ms: 90, reach: box(26, 22), knockback: 90, lunge: 110, cut: 0xfff1e8 },
      // Iai: a flash-draw straight through the enemy.
      { anim: 'thrust', dmg: 2, cd: 1.6, ms: 150, reach: box(32, 12), knockback: 200, lunge: 320, trail: 0xfff1e8, cut: 0xff004d },
    ],
    air: [
      // Tsubame Gaeshi, then an aerial iai that carries him forward through the enemy.
      { anim: 'cross', dmg: 0.7, cd: 1.1, ms: 200, reach: box(28, 26), knockback: 100, hover: 110, cut: 0xfff1e8 },
      {
        anim: 'thrust',
        dmg: 1.2,
        cd: 1.3,
        ms: 140,
        reach: box(30, 12),
        knockback: 180,
        lunge: 260,
        hover: 40,
        trail: 0xfff1e8,
        cut: 0xff004d,
      },
    ],
    dive: {
      name: 'OTOSHI GIRI',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 60, vy: 420 },
      slam: 26,
      cut: 0xfff1e8,
    },
    skill: { name: 'MIKIRI', desc: 'KUDA-KUDA MENANGKIS: MUSUH ATAU PROYEKTIL MENDEKAT DIBALAS TEBASAN KILAT KRITIS', cd: 5 },
    fusion: { name: 'KUZURYUSEN', desc: 'J+L: SEMBILAN TEBASAN SERENTAK DARI SEMBILAN ARAH', cd: 9 },
    ult: { name: 'MUSOU ISSEN', desc: 'WAKTU BERHENTI, KILAT PEDANG MENEBAS SEMUA MUSUH, SARUNG = LEDAK' },
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
      // A charged star-arrow: one bright shaft that pierces the whole line (SKILLS.busurArkana.onSwing flares it).
      { anim: 'shoot', dmg: 2.2, cd: 1.5, ms: 160, reach: box(0, 0), knockback: 140, angles: [0], pierce: true, shot: 'panahBintang' },
    ],
    air: [
      // Arcane arrows from the air: one level, then three fanned up into the sky.
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 60, angles: [0], hover: 60 },
      { anim: 'shoot', dmg: 0.7, cd: 1.3, ms: 120, reach: box(0, 0), knockback: 60, angles: [-0.45, -0.15, 0.15], hover: 50 },
    ],
    dive: {
      name: 'BINTANG JATUH',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 30,
      trail: 0xff77a8,
    },
    skill: { name: 'PANAH PRISMA', desc: 'PANAH CAHAYA MENEMBUS, TIAP MUSUH MEMBIASKANNYA JADI 3 SINAR WARNA', cd: 5 },
    fusion: { name: 'RASI PENGIKAT', desc: 'J+L: PANAH JADI BINTANG, RASI MENGIKAT SEMUA MUSUH LALU MELEDAK', cd: 10 },
    ult: { name: 'SUPERNOVA', desc: 'BINTANG BARU LAHIR DI LANGIT, MENEMBAKKAN CAHAYA KE TIAP MUSUH, LALU MELEDAK' },
  },
  pedangGelap: {
    id: 'pedangGelap',
    name: 'PEDANG KEGELAPAN',
    desc: 'PEDANG BESAR, TEBASAN BERAT',
    dmg: 1.3,
    cd: 1.3,
    crit: 0,
    arc: 'slashMoon',
    arcTint: 0xa860f0,
    cut: 0x7e2553,
    combo: [
      // A lunging stab, then a rising cut that throws the enemy into the air (SKILLS.pedangGelap.onHit), then the
      // greatsword comes down and a crescent of darkness flies on from it (onSwing).
      { anim: 'thrust', dmg: 1, cd: 1, ms: 140, reach: box(30, 10), knockback: 120, lunge: 140 },
      { anim: 'up', dmg: 1.1, cd: 1.1, ms: 160, reach: box(24, 30), knockback: 60, trail: 0x8a3fd1 },
      { anim: 'overhead', dmg: 1.7, cd: 1.5, ms: 220, reach: box(30, 30), knockback: 260, lunge: 80 },
    ],
    air: [
      // A chop, then the Dark Moon: a rising cut that lifts him on its momentum.
      { anim: 'down', dmg: 1, cd: 1.1, ms: 150, reach: box(26, 26), knockback: 140, hover: 60 },
      { anim: 'up', dmg: 1.2, cd: 1.2, ms: 200, reach: box(28, 34), knockback: 220, hover: 120, trail: 0x8a3fd1 },
    ],
    dive: {
      name: 'TUSUKAN GERHANA',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.3,
      ms: 900,
      reach: box(16, 18),
      knockback: 200,
      hitbox: 'below',
      dive: { vx: 40, vy: 420 },
      slam: 32,
      trail: 0x8a3fd1,
    },
    skill: { name: 'PERJANJIAN GELAP', desc: 'BAYAR 8% HP: PEDANG BAYANGAN RAKSASA MEMBELAH SETENGAH LINGKARAN, HP KEMBALI X2', cd: 5 },
    fusion: { name: 'GERHANA TOTAL', desc: 'J+L: BULAN HITAM, TANAH TERBELAH, TOMBAK GELAP JATUH (X2 AVENGER)', cd: 10 },
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
    impact: 0xffec27,
    fist: true,
    combo: [
      // Two arms jab at once, then all six in a flurry, then an uppercut that throws the enemy up.
      { anim: 'jab', dmg: 0.55, cd: 1, ms: 100, reach: box(18, 14), knockback: 40, extra: 1, hits: 2 },
      { anim: 'jab', dmg: 0.4, cd: 1.1, ms: 150, reach: box(20, 18), knockback: 40, extra: 1, hits: 3 },
      { anim: 'uppercut', dmg: 1.1, cd: 1, ms: 110, reach: box(16, 24), knockback: 80, extra: 1, launch: 220 },
      { anim: 'jab', dmg: 1.5, cd: 1.6, ms: 180, reach: box(30, 24), knockback: 180, lunge: 140, extra: 2 },
    ],
    air: [
      // Twin jabs, then the Asura Wheel: all six arms spun around him.
      { anim: 'jab', dmg: 0.5, cd: 1, ms: 100, reach: box(18, 14), knockback: 40, hover: 60, extra: 1, hits: 2 },
      { anim: 'hook', dmg: 0.8, cd: 1.2, ms: 220, reach: box(30, 26), knockback: 100, hitbox: 'around', hover: 90, extra: 3 },
    ],
    dive: {
      name: 'TINJU METEOR',
      anim: 'jab',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 100, vy: 380 },
      slam: 30,
      extra: 2,
    },
    skill: { name: 'TINJU SERIBU', desc: 'ENAM LENGAN MENGHUJANI 3 JALUR (DARAT-LANGIT), DITUTUP TINJU RAKSASA', cd: 5 },
    fusion: { name: 'GENGGAMAN ASURA', desc: 'J+L: ENAM LENGAN GAIB MENCENGKERAM 6 MUSUH, MEREMAS & MEMBANTING', cd: 9 },
    ult: { name: 'CAKRA ASURA', desc: 'AMARAH PENUH: RODA ENAM LENGAN MENGGILAS KELILING ARENA, LALU ENAM TINJU MENGHANTAM' },
  },
  cakarNaga: {
    id: 'cakarNaga',
    name: 'CAKAR NAGA',
    desc: 'CAKAR API KEHANCURAN, COMBO 4, J+L: NAPAS KEHANCURAN',
    dmg: 1.1,
    cd: 1,
    crit: 0.05,
    arc: 'slashClaw',
    arcTint: 0xff004d,
    cut: 0xb3122e,
    combo: [
      // Dragon claws, not a blade: a three-stroke rake (SKILLS.cakarNaga.onSwing draws the gashes), then a rising
      // claw that throws the enemy up, then the tearing charge.
      { anim: 'hook', dmg: 0.45, cd: 1, ms: 150, reach: box(22, 20), knockback: 60, hits: 3, status: { burn: 0.1 } },
      { anim: 'uppercut', dmg: 1.1, cd: 1, ms: 120, reach: box(20, 26), knockback: 80, launch: 200, status: { burn: 0.15 } },
      // Claw of Destruction: he tears forward through the enemy, a crimson wake behind him.
      {
        anim: 'thrust',
        dmg: 1.7,
        cd: 1.6,
        ms: 170,
        reach: box(32, 24),
        knockback: 240,
        lunge: 260,
        trail: 0xb3122e,
        cut: 0xff004d,
        status: { burn: 0.3 },
      },
    ],
    air: [
      // A three-stroke rake, then a rising claw.
      { anim: 'hook', dmg: 0.4, cd: 1, ms: 150, reach: box(22, 20), knockback: 60, hover: 70, hits: 3, status: { burn: 0.1 } },
      { anim: 'uppercut', dmg: 1, cd: 1.2, ms: 120, reach: box(20, 28), knockback: 120, hover: 70, status: { burn: 0.15 } },
    ],
    dive: {
      name: 'TERKAMAN NAGA',
      anim: 'thrust',
      dmg: 1.2,
      cd: 1.2,
      ms: 260,
      reach: box(24, 22),
      knockback: 160,
      dive: { vx: 200, vy: 240 },
      trail: 0xff004d,
      status: { burn: 0.2 },
    },
    skill: { name: "DRAGON'S FEAR", desc: 'MATA NAGA TERBUKA DI LANGIT: TEROR MELUMPUHKAN SEMUA MUSUH DI SEKITAR', cd: 6 },
    fusion: { name: 'NAPAS KEHANCURAN', desc: 'J+L: KEPALA NAGA MENYEMBURKAN SINAR API KE MUSUH (UDARA JUGA)', cd: 9 },
    ult: { name: 'MONARCH OF DESTRUCTION', desc: 'PASUKAN NAGA MENGHUJANI API, LALU BERUBAH JADI NAGA KEHANCURAN' },
  },
  gerbangBabilonia: {
    id: 'gerbangBabilonia',
    name: 'GERBANG BABILONIA',
    desc: 'GERBANG EMAS MENGHADAP MUSUH: 5, 5, LALU 9 HARTA SEKALIGUS',
    projectile: { texture: 'w_pedang', speed: 260, gate: true },
    dmg: 0.8,
    cd: 1.1,
    crit: 0.05,
    // One gate per angle: 5, 5, then a volley of 9.
    combo: [
      { anim: 'shoot', dmg: 0.32, cd: 1, ms: 100, reach: box(0, 0), knockback: 50, angles: [-0.1, -0.05, 0, 0.05, 0.1] },
      { anim: 'shoot', dmg: 0.32, cd: 1, ms: 100, reach: box(0, 0), knockback: 50, angles: [-0.1, -0.05, 0, 0.05, 0.1] },
      {
        anim: 'shoot',
        dmg: 0.26,
        cd: 1.5,
        ms: 150,
        reach: box(0, 0),
        knockback: 70,
        angles: [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
      },
    ],
    air: [
      // Gates open around him in the air too, each turned on an enemy: four, then six.
      { anim: 'shoot', dmg: 0.34, cd: 1, ms: 100, reach: box(0, 0), knockback: 50, angles: [-0.08, -0.03, 0.03, 0.08], hover: 50 },
      {
        anim: 'shoot',
        dmg: 0.3,
        cd: 1.3,
        ms: 120,
        reach: box(0, 0),
        knockback: 50,
        angles: [-0.12, -0.07, -0.02, 0.02, 0.07, 0.12],
        hover: 50,
      },
    ],
    dive: {
      name: 'TURUN TAHTA',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 28,
      trail: 0xffec27,
    },
    skill: { name: 'ENKIDU', desc: 'RANTAI LANGIT DARI GERBANG MELILIT & MENGIKAT 3 MUSUH 2 DTK', cd: 6 },
    fusion: { name: 'GATE OF BABYLON', desc: 'J+L: 36 GERBANG EMAS MEMENUHI LANGIT, HUJAN 48 HARTA KE SEMUA MUSUH', cd: 10 },
    ult: { name: 'ENUMA ELISH', desc: 'EA DISAPUKAN SATU PUTARAN PENUH: BADAI RUPTUR MENYAPU SELURUH ARENA, LANGIT ROBEK' },
  },
  shrine: {
    id: 'shrine',
    name: 'SHRINE',
    desc: 'KAI: TEBASAN TERBANG MENEMBUS, FINISHER HACHI',
    projectile: { texture: 'kai', speed: 360, pierce: true },
    dmg: 0.95,
    cd: 0.9,
    crit: 0.1,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [0] },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [0] },
      // Hachi (Cleave): a crossed cut that hits harder.
      { anim: 'shoot', dmg: 1.8, cd: 1.5, ms: 150, reach: box(0, 0), knockback: 180, angles: [0], shot: 'hachi' },
    ],
    air: [
      // Kai level, Kai up into the air, then Hachi.
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [0], hover: 40 },
      { anim: 'shoot', dmg: 1, cd: 1, ms: 90, reach: box(0, 0), knockback: 60, angles: [-0.4], hover: 40 },
      { anim: 'shoot', dmg: 1.5, cd: 1.4, ms: 140, reach: box(0, 0), knockback: 160, angles: [0], shot: 'hachi', hover: 40 },
    ],
    dive: {
      name: 'DISMANTLE JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 40, vy: 420 },
      slam: 28,
      cut: 0xff004d,
    },
    skill: { name: 'FUGA', desc: 'BUSUR API: PANAH API MELEDAK JADI PILAR API + 2 PILAR SUSULAN, MEMBAKAR', cd: 7 },
    fusion: { name: 'WORLD CUTTING SLASH', desc: 'J+L: MANTRA, LALU DUNIA TERBELAH DI GARIS PALING BANYAK MUSUH', cd: 12 },
    ult: { name: 'MALEVOLENT SHRINE', desc: 'DOMAIN: KUIL MUNCUL, KAI & HACHI PASTI KENA SEMUA MUSUH DI ARENA' },
  },
  mugen: {
    id: 'mugen',
    name: 'MUGEN',
    desc: 'J: AO MENARIK KE KERUMUNAN, L: AKA MENGHEMPAS, J+L: MURASAKI',
    cast: true,
    dmg: 1.1,
    cd: 2.2,
    crit: 0.05,
    // One Blue cast: four crushing ticks of 0.6.
    combo: [{ anim: 'thrust', dmg: 2.4, cd: 1, ms: 0, reach: box(40, 40), knockback: 0 }],
    air: [
      // (Cast weapon: the attack key always casts Ao; these describe the cast for balance.)
      { anim: 'thrust', dmg: 2.4, cd: 1, ms: 0, reach: box(40, 40), knockback: 0 },
    ],
    dive: {
      name: 'AO JATUH',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.2,
      ms: 900,
      reach: box(18, 18),
      knockback: 120,
      hitbox: 'below',
      dive: { vx: 0, vy: 440 },
      slam: 36,
      trail: 0x29adff,
      status: { slow: 900 },
    },
    skill: { name: 'JUTSUSHIKI HANTEN: AKA', desc: 'MERAH DIBIDIK KE GARIS TERPADAT (UDARA JUGA), MENGHEMPAS & MELEDAK', cd: 3 },
    fusion: { name: 'KYOSHIKI: MURASAKI', desc: 'J+L: AO & AKA BERTABRAKAN, UNGU HAMPA DIBIDIK, MENGHAPUS RUANG DI JALURNYA', cd: 7 },
    ult: { name: 'MURYOKUSHO', desc: 'DOMAIN HAMPA: SEMUA MUSUH BEKU TENGGELAM INFORMASI, DIPUKUL SATU-SATU, LALU PECAH' },
  },
  sakahoko: {
    id: 'sakahoko',
    name: 'AMA NO SAKAHOKO',
    desc: 'BELATI PEMBATAL, TUSUKAN CEPAT',
    dmg: 0.9,
    cd: 0.75,
    crit: 0.1,
    arc: 'slashThin',
    arcTint: 0xe8e8f0,
    cut: 0xc2c3c7,
    combo: [
      // Heavenly Restriction speed: three stabs in the time of one, a cut down, then a dash so fast it leaves him on
      // the far side of the enemy, a white streak behind (SKILLS.sakahoko.onSwing).
      { anim: 'thrust', dmg: 0.4, cd: 1.1, ms: 150, reach: box(28, 10), knockback: 40, hits: 3 },
      { anim: 'down', dmg: 1, cd: 1, ms: 110, reach: box(24, 22), knockback: 120 },
      { anim: 'thrust', dmg: 1.8, cd: 1.5, ms: 160, reach: box(32, 12), knockback: 240, lunge: 340, trail: 0xfff1e8 },
    ],
    air: [
      // Two stabs in the time of one, then a cut down.
      { anim: 'thrust', dmg: 0.5, cd: 1, ms: 120, reach: box(28, 10), knockback: 40, hover: 60, hits: 2 },
      { anim: 'down', dmg: 1, cd: 1.1, ms: 110, reach: box(24, 24), knockback: 120, hover: 60 },
    ],
    dive: {
      name: 'TIKAMAN KILAT',
      anim: 'thrust',
      dmg: 1.2,
      cd: 1.1,
      ms: 280,
      reach: box(30, 14),
      knockback: 200,
      dive: { vx: 220, vy: 360 },
      trail: 0xfff1e8,
    },
    skill: { name: 'PLAYFUL CLOUD', desc: 'TONGKAT 3 RUAS DICAMBUKKAN: SAPU KE ATAS, LECUT LURUS, HANTAM TANAH', cd: 5 },
    fusion: { name: 'SPLIT SOUL KATANA', desc: 'J+L: MEMANTUL DINDING KE DINDING MENEBAS SEMUA, LALU JIWANYA TERBELAH', cd: 10 },
    ult: { name: 'RANTAI SERIBU MIL', desc: 'TOMBAK BERANTAI MEMANTUL KE TIAP MUSUH, DITARIK, LALU DIHANTAM' },
  },
  gunbai: {
    id: 'gunbai',
    name: 'GUNBAI & KAMA',
    desc: 'KIPAS PERANG UCHIHA, LEMPAR KAMA, HEMPASAN ANGIN',
    projectile: { texture: 'kama', speed: 260 },
    dmg: 1.1,
    cd: 1.1,
    crit: 0.05,
    arc: 'slashFan',
    arcTint: 0xd0b0ff,
    cut: 0xfff1e8,
    combo: [
      // Gunbai shove: the war fan held up as a shield and rammed forward; it turns blows aside while it moves
      // (SKILLS.gunbai.onSwing) and throws the enemy back.
      { anim: 'thrust', dmg: 1, cd: 1, ms: 140, reach: box(22, 26), knockback: 300 },
      // Kama: the chained sickle is thrown ahead.
      { anim: 'shoot', dmg: 1.1, cd: 1, ms: 120, reach: box(0, 0), knockback: 90, angles: [0] },
      // Gunbai gust: a great sweep blows everything around away.
      { anim: 'spin', dmg: 1.6, cd: 1.5, ms: 220, reach: box(44, 32), knockback: 280, hitbox: 'around' },
    ],
    air: [
      // The storm fan swept down, then the kama thrown level.
      { anim: 'overhead', dmg: 1.2, cd: 1.2, ms: 220, reach: box(34, 34), knockback: 280, hover: 90 },
      { anim: 'shoot', dmg: 1.1, cd: 1.1, ms: 120, reach: box(0, 0), knockback: 90, angles: [-0.1], hover: 50 },
    ],
    dive: {
      name: 'GUNBAI JATUH',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.3,
      ms: 900,
      reach: box(18, 18),
      knockback: 280,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 36,
    },
    skill: { name: 'KATON: GOKA MEKKYAKU', desc: 'LAUTAN API MENGGULUNG KE DEPAN DARI TANAH HINGGA LANGIT, MEMBAKAR', cd: 6 },
    fusion: { name: 'TENGAI SHINSEI', desc: 'J+L: DUA METEOR RAKSASA JATUH KE KERUMUNAN MUSUH, TANAH HANCUR', cd: 12 },
    ult: { name: 'SUSANOO SEMPURNA', desc: 'SUSANOO BERSAYAP BANGKIT: SABET DARAT, SABET LANGIT, LALU SILANG MEMBELAH ARENA' },
  },
  mokuton: {
    id: 'mokuton',
    name: 'MOKUTON',
    desc: 'ELEMEN KAYU: TUSUKAN AKAR, LEDAKAN HUTAN, J+L: MOKURYU',
    dmg: 1.2,
    cd: 1.2,
    crit: 0,
    arc: 'slashBranch',
    cut: 0x00e436,
    combo: [
      { anim: 'thrust', dmg: 1, cd: 1, ms: 130, reach: box(40, 10), knockback: 150 },
      // He brings his hand down and roots spear up out of the floor ahead of him (SKILLS.mokuton.onSwing).
      { anim: 'overhead', dmg: 1, cd: 1, ms: 130, reach: box(26, 26), knockback: 140 },
      // Wood bursts out all around and snags whatever it hits.
      { anim: 'spin', dmg: 1.5, cd: 1.5, ms: 220, reach: box(44, 32), knockback: 220, hitbox: 'around', status: { freeze: 300 } },
    ],
    air: [
      // The root whip, then a long root spear stabbed out level.
      { anim: 'down', dmg: 1.1, cd: 1.1, ms: 200, reach: box(32, 28), knockback: 120, hover: 60, status: { freeze: 400 } },
      { anim: 'thrust', dmg: 1, cd: 1.2, ms: 140, reach: box(40, 10), knockback: 150, hover: 50 },
    ],
    dive: {
      name: 'HUTAN JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 32,
      status: { freeze: 400 },
    },
    skill: { name: 'JUKAI KOTAN', desc: 'HUTAN MELEDAK TUMBUH BERUNTUN, CABANG MENJERAT MUSUH (UDARA JUGA)', cd: 6 },
    fusion: { name: 'MOKURYU', desc: 'J+L: NAGA KAYU MENERJANG ARENA, MENGGIGIT & MENYERAP CHAKRA', cd: 9 },
    ult: { name: 'MOKUTON: SHIN SUSENJU', desc: 'BUDDHA SERIBU LENGAN MENGHUJANI MUSUH, LALU GASSHO MENGHANCURKAN ARENA' },
  },
  kunai: {
    id: 'kunai',
    name: 'KUNAI & SHURIKEN',
    desc: 'TEBAS KUNAI, LEMPAR SHURIKEN, KATON: HOSENKA',
    projectile: { texture: 'shuriken', speed: 280 },
    dmg: 0.9,
    cd: 0.9,
    crit: 0.05,
    arc: 'slashThin',
    arcTint: 0xff6060,
    cut: 0xff004d,
    combo: [
      // Shunshin: he is suddenly in front of the enemy with the kunai in it, leaving crows behind (onSwing).
      { anim: 'thrust', dmg: 1.1, cd: 1, ms: 100, reach: box(24, 12), knockback: 90, lunge: 180, trail: 0x1c1c28 },
      // Shurikenjutsu: three shuriken in a tight fan.
      { anim: 'shoot', dmg: 0.7, cd: 1.1, ms: 110, reach: box(0, 0), knockback: 50, angles: [-0.12, 0, 0.12] },
      // Katon: Hosenka: a spray of small fireballs.
      {
        anim: 'shoot',
        dmg: 0.5,
        cd: 1.5,
        ms: 150,
        reach: box(0, 0),
        knockback: 60,
        angles: [-0.3, -0.1, 0.1, 0.3],
        shot: 'fireball',
        status: { burn: 0.15 },
      },
    ],
    air: [
      // Shuriken fanned level, then a fireball.
      { anim: 'shoot', dmg: 0.7, cd: 1.1, ms: 110, reach: box(0, 0), knockback: 50, angles: [-0.12, 0, 0.12], hover: 60 },
      {
        anim: 'shoot',
        dmg: 1.1,
        cd: 1.2,
        ms: 120,
        reach: box(0, 0),
        knockback: 60,
        angles: [-0.1],
        shot: 'fireball',
        status: { burn: 0.15 },
        hover: 50,
      },
    ],
    dive: {
      name: 'KUNAI JATUH',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 60, vy: 420 },
      slam: 24,
      cut: 0xff004d,
    },
    skill: { name: 'AMATERASU', desc: 'API HITAM ABADI MEMBAKAR MUSUH & MENJALAR', cd: 7 },
    fusion: { name: 'TOTSUKA NO TSURUGI', desc: 'J+L: SUSANOO MERAH, PEDANG TOTSUKA MENUSUK TIAP MUSUH LALU MENYEGELNYA', cd: 11 },
    ult: { name: 'TSUKUYOMI', desc: 'DUNIA MERAH: TIAP MUSUH DISALIB & DITUSUK 72 JAM DALAM SEDETIK, LALU AMBRUK' },
  },
  tongkatFrost: {
    id: 'tongkatFrost',
    name: 'TONGKAT GEMBALA',
    desc: 'SEMBURAN ES PENGEJAR, PUTARAN TONGKAT BERSALJU, FINISHER BOLA SALJU',
    projectile: { texture: 'iceshard', speed: 240, homing: true },
    dmg: 0.9,
    cd: 1,
    crit: 0.05,
    arcTint: 0xc2f0ff,
    cut: 0xc2f0ff,
    combo: [
      { anim: 'shoot', dmg: 1, cd: 0.9, ms: 100, reach: box(0, 0), knockback: 40, angles: [0], status: { freeze: 250 } },
      { anim: 'shoot', dmg: 1, cd: 0.9, ms: 100, reach: box(0, 0), knockback: 40, angles: [-0.12, 0.12], status: { freeze: 250 } },
      // He twirls the crook overhead; frost sprays off it all around him.
      {
        anim: 'spin',
        dmg: 1.1,
        cd: 1.1,
        ms: 200,
        reach: box(40, 30),
        knockback: 130,
        hitbox: 'around',
        trail: 0xc2f0ff,
        status: { slow: 900 },
      },
      // Snowball of fun: a big hit that knocks back and freezes longer.
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
    air: [
      // The Night Wind carries him: an ice shard level, then two fanned up.
      { anim: 'shoot', dmg: 1, cd: 1, ms: 100, reach: box(0, 0), knockback: 40, angles: [0], status: { freeze: 250 }, hover: 80 },
      {
        anim: 'shoot',
        dmg: 0.9,
        cd: 1.2,
        ms: 120,
        reach: box(0, 0),
        knockback: 40,
        angles: [-0.45, -0.1],
        status: { freeze: 250 },
        hover: 80,
      },
    ],
    dive: {
      name: 'SALJU JATUH',
      anim: 'plunge',
      dmg: 1.2,
      cd: 1.2,
      ms: 900,
      reach: box(16, 18),
      knockback: 140,
      hitbox: 'below',
      dive: { vx: 0, vy: 420 },
      slam: 32,
      trail: 0xc2f0ff,
      status: { freeze: 400 },
    },
    skill: {
      name: 'BLIZZARD VORTEX',
      desc: 'ANGIN MEMUTAR PUTING BELIUNG SALJU SETINGGI LANGIT: MENYEDOT MUSUH DARAT & UDARA, LALU MEMBEKUKAN',
      cd: 6,
    },
    fusion: { name: 'FROST FERN', desc: 'J+L: POLA ES MENJALAR DI LANTAI & MENJULANG KE MUSUH (UDARA JUGA), LALU PECAH', cd: 9 },
    ult: { name: 'ETERNAL WINTER', desc: 'BADAI SALJU & HUJAN ES RAKSASA, MUSUH TERKURUNG KRISTAL LALU PECAH' },
  },
  rasengan: {
    id: 'rasengan',
    name: 'SENJUTSU RIKUDO',
    desc: 'TAIJUTSU SENNIN, FINISHER RASENGAN',
    fist: true,
    projectile: { texture: 'rasenganShot', speed: 190, pierce: true },
    dmg: 1,
    cd: 0.85,
    crit: 0.05,
    impact: 0xffa300,
    combo: [
      // Sage-mode jab: nature energy lands even a hair off target.
      { anim: 'jab', dmg: 0.9, cd: 0.8, ms: 80, reach: box(20, 14), knockback: 70 },
      { anim: 'hook', dmg: 0.9, cd: 0.8, ms: 90, reach: box(20, 16), knockback: 80 },
      // Uzumaki Naruto Rendan: the rising blow that launches.
      { anim: 'uppercut', dmg: 1.1, cd: 1, ms: 110, reach: box(18, 26), knockback: 140 },
      // A Rasengan hurled forward, grinding through everything.
      { anim: 'shoot', dmg: 1.6, cd: 1.4, ms: 140, reach: box(0, 0), knockback: 200, angles: [0] },
    ],
    air: [
      // Sage-mode jab and hook in the air, then a Rasengan thrown level.
      { anim: 'jab', dmg: 0.9, cd: 0.9, ms: 80, reach: box(20, 14), knockback: 70, hover: 60 },
      { anim: 'hook', dmg: 0.9, cd: 0.9, ms: 90, reach: box(20, 16), knockback: 80, hover: 60 },
      { anim: 'shoot', dmg: 1.4, cd: 1.4, ms: 140, reach: box(0, 0), knockback: 200, angles: [0], hover: 40 },
    ],
    dive: {
      name: 'ODAMA RASENGAN',
      anim: 'jab',
      dmg: 1.3,
      cd: 1.2,
      ms: 700,
      reach: box(16, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 150, vy: 280 },
      slam: 34,
    },
    skill: { name: 'TAJUU KAGE BUNSHIN', desc: 'BELASAN BUNSHIN MENGEROYOK TIAP MUSUH (UDARA JUGA), DITUTUP UZUMAKI NARUTO RENDAN', cd: 7 },
    fusion: {
      name: 'SENPO: RASENSHURIKEN',
      desc: 'J+L: DIBENTUK BERSAMA BUNSHIN, DIBIDIK KE KERUMUNAN, BOLA JARUM ANGIN MENYEDOT',
      cd: 10,
    },
    ult: {
      name: 'CHOCHO ODAMA RASENSHURIKEN',
      desc: 'KURAMA RIKUDO 6 LENGAN MELEMPAR 2 RASENSHURIKEN RAKSASA (RIKUDO & BIJUDAMA) YANG MENYATU',
    },
  },
  kusanagi: {
    id: 'kusanagi',
    name: 'KUSANAGI',
    desc: 'PEDANG BERALIR CHIDORI, SENBON PETIR DI UDARA',
    projectile: { texture: 'senbon', speed: 320 },
    dmg: 1,
    cd: 0.85,
    crit: 0.1,
    arc: 'slashBolt',
    cut: 0x29adff,
    combo: [
      // A quick Chidori-charged stab.
      { anim: 'thrust', dmg: 0.9, cd: 0.8, ms: 90, reach: box(28, 10), knockback: 80 },
      // Kusanagi flicks both ways in a flash, the current locking up what it touches.
      { anim: 'cross', dmg: 0.8, cd: 1, ms: 160, reach: box(26, 24), knockback: 100, cut: 0x29adff, status: { freeze: 120 } },
      // Chidori Katana: a lunge with the lightning-sheathed blade that paralyzes.
      {
        anim: 'thrust',
        dmg: 1.8,
        cd: 1.5,
        ms: 150,
        reach: box(32, 12),
        knockback: 220,
        lunge: 300,
        trail: 0x29adff,
        status: { freeze: 250 },
      },
    ],
    air: [
      // A Chidori stab, then senbon of lightning fanned level.
      { anim: 'thrust', dmg: 0.9, cd: 0.9, ms: 90, reach: box(28, 10), knockback: 80, hover: 60 },
      {
        anim: 'shoot',
        dmg: 0.6,
        cd: 1.1,
        ms: 110,
        reach: box(0, 0),
        knockback: 30,
        angles: [-0.2, 0, 0.2],
        status: { freeze: 150 },
        hover: 60,
      },
    ],
    dive: {
      name: 'CHIDORI JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 160,
      hitbox: 'below',
      dive: { vx: 60, vy: 420 },
      slam: 30,
      trail: 0x29adff,
      status: { freeze: 250 },
    },
    skill: { name: 'KIRIN', desc: 'AWAN BADAI, PETIR BERWUJUD KIRIN MENUKIK KE KERUMUNAN & MENYAMBAR SEMUA', cd: 8 },
    fusion: {
      name: 'ENTON: KAGUTSUCHI',
      desc: 'J+L: RINNEGAN MENARIK SEMUA MUSUH, DURI API HITAM AMATERASU MENUSUK DARI SEKELILINGNYA',
      cd: 11,
    },
    ult: { name: 'INDRA NO YA', desc: 'SUSANOO PENUH + CHAKRA 9 BIJU: PANAH PETIR KE BARISAN TERPADAT, ARENA MELEDAK' },
  },
  gravitasi: {
    id: 'gravitasi',
    name: 'TONGKAT HORIZON',
    desc: 'BOLA GRAVITASI MEMBERATKAN MUSUH, FINISHER TIGA ORBIT',
    projectile: { texture: 'gravOrb', speed: 200 },
    dmg: 1,
    cd: 0.9,
    crit: 0.05,
    combo: [
      // Small singularities: every hit drags the target down to a crawl.
      { anim: 'shoot', dmg: 0.9, cd: 0.9, ms: 100, reach: box(0, 0), knockback: 30, angles: [0], status: { slow: 500 } },
      { anim: 'shoot', dmg: 0.9, cd: 0.9, ms: 100, reach: box(0, 0), knockback: 30, angles: [0], status: { slow: 500 } },
      // Three orbs fanned out like planets on their orbits.
      {
        anim: 'shoot',
        dmg: 0.7,
        cd: 1.4,
        ms: 140,
        reach: box(0, 0),
        knockback: 90,
        angles: [-0.2, 0, 0.2],
        status: { slow: 900 },
      },
    ],
    air: [
      // Singularities from the air: one level, then three fanned.
      { anim: 'shoot', dmg: 0.9, cd: 1, ms: 100, reach: box(0, 0), knockback: 30, angles: [0], status: { slow: 500 }, hover: 60 },
      {
        anim: 'shoot',
        dmg: 0.7,
        cd: 1.3,
        ms: 140,
        reach: box(0, 0),
        knockback: 90,
        angles: [-0.35, -0.1, 0.15],
        status: { slow: 900 },
        hover: 50,
      },
    ],
    dive: {
      // He makes himself a hundred times heavier and drops like a meteor; the landing caves the ground in.
      name: 'JATUH BINTANG',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.2,
      ms: 700,
      reach: box(18, 18),
      knockback: 120,
      hitbox: 'below',
      dive: { vx: 0, vy: 460 },
      slam: 40,
      trail: 0x8a3fd1,
      status: { slow: 1200 },
    },
    skill: { name: 'GRAVITY ORDER', desc: 'GRAVITASI SATU MAP NAIK x10, x100, x1000: SEMUA MUSUH DITEKAN KE TANAH SAMPAI REMUK', cd: 8 },
    fusion: { name: 'ORBIT PLANET', desc: 'J+L: ENAM PLANET MENGORBIT KE SELURUH ARENA, LALU SEJAJAR MENGHANTAM BERTURUT-TURUT', cd: 11 },
    ult: { name: 'BLACK HOLE', desc: 'LUBANG HITAM MENCABIK ARENA & MENYEDOT SEMUA MUSUH, RUNTUH, LALU MELEDAK JADI LUBANG PUTIH' },
  },
  halilintar: {
    id: 'halilintar',
    name: 'VAJRA BADAI',
    desc: 'HALBERD PETIR EMAS: TIAP HIT MENGISI STATIK, KE-6 MEMANGGIL PETIR',
    dmg: 1.1,
    cd: 1.05,
    crit: 0.05,
    arc: 'slashStorm',
    arcTint: 0xffec27,
    cut: 0xffec27,
    combo: [
      // A royal thrust, then a rising sweep that trails sparks.
      { anim: 'thrust', dmg: 1, cd: 1, ms: 120, reach: box(32, 10), knockback: 120, lunge: 90 },
      { anim: 'up', dmg: 1.1, cd: 1, ms: 150, reach: box(28, 26), knockback: 150, trail: 0x7fe6ff },
      // The judgement: an overhead slam that cracks a bolt down onto whatever it hits (see SKILLS.halilintar.onHit).
      { anim: 'overhead', dmg: 1.5, cd: 1.5, ms: 220, reach: box(30, 30), knockback: 240, status: { freeze: 250 } },
    ],
    air: [
      // A royal thrust, then the rising sweep trailing sparks.
      { anim: 'thrust', dmg: 1, cd: 1, ms: 120, reach: box(32, 10), knockback: 120, hover: 60 },
      { anim: 'up', dmg: 1.1, cd: 1.2, ms: 150, reach: box(28, 28), knockback: 150, hover: 60, trail: 0x7fe6ff },
    ],
    dive: {
      // He falls like a lightning strike, the halberd point-first; the landing discharges into the ground.
      name: 'SAMBARAN JATUH',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.1,
      ms: 600,
      reach: box(14, 18),
      knockback: 120,
      hitbox: 'below',
      dive: { vx: 60, vy: 420 },
      slam: 36,
      trail: 0xffec27,
      status: { freeze: 300 },
    },
    skill: { name: 'TOMBAK HALILINTAR', desc: 'TOMBAK PETIR DIBIDIK KE KERUMUNAN, MENANCAP & MELOMPAT KE MUSUH LAIN', cd: 6 },
    fusion: { name: 'MAHKOTA BADAI', desc: 'J+L: MAHKOTA BOLA PETIR MENGORBIT, LALU MENYAMBAR TIAP MUSUH DARI LANGIT', cd: 11 },
    ult: { name: 'PENGHAKIMAN GUNTUR', desc: 'LANGIT BADAI, JARING PETIR MENGIKAT SEMUA MUSUH, LALU SAMBARAN RAKSASA' },
  },
  surgaNeraka: {
    id: 'surgaNeraka',
    name: 'SURGA & NERAKA',
    desc: 'PEDANG SUCI & PEDANG NERAKA: TEBASAN EMAS, MERAH, LALU SILANG SENJA',
    twin: 'w_neraka',
    dmg: 1,
    cd: 0.95,
    crit: 0.08,
    arc: 'slashDual',
    arcTint: 0xffffff,
    cut: 0xc080ff,
    combo: [
      // The holy blade (gold cut: CAHAYA), then the hellblade (crimson cut, burns: KEGELAPAN).
      { anim: 'down', dmg: 1, cd: 0.9, ms: 120, reach: box(24, 22), knockback: 110, cut: 0xffec27 },
      { anim: 'up', dmg: 1, cd: 0.9, ms: 120, reach: box(24, 24), knockback: 110, cut: 0xff004d, status: { burn: 0.1 } },
      // Both blades at once in a cross: the twilight cut that feeds both halves.
      { anim: 'cross', dmg: 1.2, cd: 1.5, ms: 240, reach: box(28, 28), knockback: 220, cut: 0xc080ff },
    ],
    air: [
      // The holy blade, the hellblade, then the wing dance with both.
      { anim: 'down', dmg: 0.9, cd: 1, ms: 120, reach: box(24, 22), knockback: 110, hover: 60, cut: 0xffec27 },
      { anim: 'up', dmg: 0.9, cd: 1, ms: 120, reach: box(24, 24), knockback: 110, hover: 60, cut: 0xff004d, status: { burn: 0.1 } },
      { anim: 'spin', dmg: 1.1, cd: 1.2, ms: 260, reach: box(22, 22), knockback: 140, hitbox: 'around', hover: 80, cut: 0xc080ff },
    ],
    dive: {
      name: 'PENGHAKIMAN SENJA',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 900,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 40, vy: 420 },
      slam: 30,
      cut: 0xc080ff,
    },
    skill: { name: 'SAYAP SENJA', desc: 'SAYAP MENGEPAK: TOMBAK CAHAYA KE SISI MALAIKAT, API NERAKA KE SISI IBLIS', cd: 6 },
    fusion: { name: 'GERBANG SURGA & NERAKA', desc: 'J+L: CAHAYA DARI LANGIT & API DARI BUMI BERTEMU MENYILANG DI TIAP MUSUH', cd: 11 },
    ult: { name: 'SENJAKALA', desc: 'LANGIT TERBELAH, SAYAP RAKSASA MENGHAKIMI TIAP MUSUH, LALU GELOMBANG SENJA' },
  },
  foton: {
    id: 'foton',
    name: 'PEDANG FOTON',
    desc: 'PEDANG CAHAYA PADAT: TUSUKAN SECEPAT CAHAYA, PUSARAN, LALU SINAR',
    dmg: 1,
    cd: 0.95,
    crit: 0.1,
    arc: 'slashFoton',
    arcTint: 0xffffff,
    cut: 0xc2f0ff,
    combo: [
      // A thrust at the speed of light: she is already through, a white streak behind her.
      { anim: 'thrust', dmg: 1, cd: 0.9, ms: 110, reach: box(30, 12), knockback: 80, lunge: 320, trail: 0xfff1e8, cut: 0xc2f0ff },
      // A whirl of light blades all around her, four cuts in one turn.
      { anim: 'spin', dmg: 0.35, cd: 1, ms: 220, reach: box(30, 26), knockback: 40, hitbox: 'around', hits: 4, cut: 0xffec27 },
      // A rising cut that throws its target up and fires a ray of light (SKILLS.foton.onSwing).
      { anim: 'up', dmg: 1.2, cd: 1.5, ms: 200, reach: box(26, 30), knockback: 60, launch: 220, cut: 0xffffff },
    ],
    air: [
      // In the air: a falling cut of light, then a whirl that lifts her.
      { anim: 'down', dmg: 0.9, cd: 1, ms: 120, reach: box(24, 24), knockback: 100, hover: 70, cut: 0xc2f0ff },
      { anim: 'spin', dmg: 0.4, cd: 1.2, ms: 240, reach: box(28, 28), knockback: 50, hitbox: 'around', hover: 90, hits: 3, cut: 0xffec27 },
    ],
    dive: {
      // She falls as a spear of sunlight (SKILLS.foton.onDiveLand: a sun pillar and rays along the floor).
      name: 'TOMBAK MATAHARI',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 800,
      reach: box(14, 18),
      knockback: 150,
      hitbox: 'below',
      dive: { vx: 0, vy: 520 },
      slam: 34,
      trail: 0xffec27,
      cut: 0xffec27,
    },
    skill: { name: 'JARING CERMIN', desc: 'CERMIN CAHAYA DI TIAP MUSUH, LASER MEMANTUL BERWARNA PELANGI', cd: 6 },
    fusion: { name: 'TIRAI AURORA', desc: 'J+L: TIGA TIRAI AURORA TURUN MENYAPU SELURUH ARENA, LALU MELEDAK', cd: 10 },
    ult: { name: 'FAJAR SEMESTA', desc: 'SEMUA CAHAYA DISERAP, LENSA RAKSASA MEMBAKAR TIAP MUSUH, LALU FAJAR' },
  },
  pedangSurya: {
    id: 'pedangSurya',
    name: 'BILAH SURYA',
    desc: 'PEDANG EMAS MEMBARA: TEBASAN BERAT, TUSUKAN API, PUSARAN KORONA',
    dmg: 1,
    cd: 0.95,
    crit: 0.08,
    arc: 'slashWide',
    arcTint: 0xffa300,
    cut: 0xffa300,
    combo: [
      // A heavy overhead cut that carries him a step forward, sparks of gold at the edge.
      { anim: 'overhead', dmg: 1, cd: 1, ms: 130, reach: box(30, 22), knockback: 90, lunge: 120, cut: 0xffec27 },
      // A thrust that trails fire.
      {
        anim: 'thrust',
        dmg: 1.1,
        cd: 1,
        ms: 120,
        reach: box(34, 12),
        knockback: 100,
        lunge: 260,
        trail: 0xffa300,
        cut: 0xffa300,
        status: { burn: 0.1 },
      },
      // The finisher spins a ring of corona around him and flings two waves of fire out to both sides (onSwing).
      {
        anim: 'spin',
        dmg: 0.5,
        cd: 1.5,
        ms: 240,
        reach: box(34, 28),
        knockback: 200,
        hitbox: 'around',
        hits: 3,
        cut: 0xff004d,
        status: { burn: 0.15 },
      },
    ],
    air: [
      { anim: 'down', dmg: 1, cd: 1, ms: 120, reach: box(26, 26), knockback: 100, hover: 60, cut: 0xffec27 },
      {
        anim: 'spin',
        dmg: 0.4,
        cd: 1.2,
        ms: 240,
        reach: box(30, 30),
        knockback: 60,
        hitbox: 'around',
        hover: 80,
        hits: 3,
        cut: 0xffa300,
        status: { burn: 0.1 },
      },
    ],
    dive: {
      // He falls as a meteor (SKILLS.pedangSurya.onDiveLand: a crater of flame and a ring of fire).
      name: 'METEOR SURYA',
      anim: 'plunge',
      dmg: 1.4,
      cd: 1.2,
      ms: 800,
      reach: box(14, 18),
      knockback: 180,
      hitbox: 'below',
      dive: { vx: 0, vy: 540 },
      slam: 36,
      trail: 0xffa300,
      cut: 0xff004d,
    },
    skill: { name: 'SURYA TERBIT', desc: 'MATAHARI TERBIT DI LANGIT, MEMANCARKAN SINAR API KE LIMA MUSUH', cd: 6 },
    fusion: { name: 'CINCIN BERLIAN', desc: 'J+L: BULAN MENUTUP MATAHARI, LALU CINCIN BERLIAN MELEDAK KE SEMUA MUSUH', cd: 11 },
    ult: { name: 'SOLARIS', desc: 'MATAHARI TURUN KE ARENA, LIDAH API MENYAMBAR TIAP MUSUH, LALU JATUH MENGHANCURKAN' },
  },
  sabitCandra: {
    id: 'sabitCandra',
    name: 'SABIT CANDRA',
    desc: 'GLAIVE BULAN SABIT: SAPUAN SILANG, AYUNAN PENGANGKAT, LALU LEMPAR SABIT',
    dmg: 1,
    cd: 0.95,
    crit: 0.08,
    arc: 'slashCandra',
    arcTint: 0xffffff,
    cut: 0xc2d4ff,
    combo: [
      // A crossing sweep of the glaive, both blades of the crescent cutting in turn.
      { anim: 'cross', dmg: 0.9, cd: 1, ms: 180, reach: box(30, 24), knockback: 60, lunge: 80, cut: 0xc2d4ff },
      // A rising cut under the moon's pull: the enemy floats up as if gravity were a sixth of itself.
      { anim: 'up', dmg: 1, cd: 1, ms: 170, reach: box(26, 30), knockback: 40, launch: 200, cut: 0xfff1e8 },
      // A thrust that lets the crescent go: two moon blades fly out, level and rising (SKILLS.sabitCandra.onSwing).
      { anim: 'thrust', dmg: 1.3, cd: 1.5, ms: 150, reach: box(32, 14), knockback: 140, lunge: 200, cut: 0x9fb4ff },
    ],
    air: [
      { anim: 'down', dmg: 0.9, cd: 1, ms: 130, reach: box(26, 26), knockback: 90, hover: 70, cut: 0xc2d4ff },
      { anim: 'cross', dmg: 0.8, cd: 1.2, ms: 190, reach: box(30, 28), knockback: 70, hover: 80, cut: 0x9fb4ff },
    ],
    dive: {
      // He falls like a moon setting (SKILLS.sabitCandra.onDiveLand: two crescents run out along the floor).
      name: 'BULAN TERBENAM',
      anim: 'plunge',
      dmg: 1.3,
      cd: 1.2,
      ms: 850,
      reach: box(14, 18),
      knockback: 150,
      hitbox: 'below',
      dive: { vx: 30, vy: 460 },
      slam: 30,
      trail: 0x9fb4ff,
      cut: 0xfff1e8,
    },
    skill: { name: 'SABIT CANDRA', desc: 'SABIT BERPUTAR MENGELILINGI ARENA, JUMLAH = FASE BULAN; PURNAMA MENJATUHKAN BULAN', cd: 5 },
    fusion: { name: 'PASANG BULAN', desc: 'J+L: BULAN MENGANGKAT SEMUA MUSUH KE LANGIT, LALU AIR PASANG MENGHEMPAS MEREKA', cd: 11 },
    ult: { name: 'MALAM SERIBU BULAN', desc: 'MALAM TURUN, BULAN RAKSASA BERGANTI FASE, TIAP FASE MENJATUHKAN SABIT, LALU TERBENAM' },
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

/**
 * Hitstop: the fight holds still for a few ms so a heavy blow lands with weight. `heavy` is the |knockback| from which
 * a basic move counts as a finisher; `gap` is the quiet time after a freeze so multi-kills and flurries do not stutter.
 */
export const HITSTOP = { finisher: 60, crit: 45, kill: 50, elite: 100, boss: 180, heavy: 200, gap: 200 } as const;

/** How long one hit freezes the fight (0 = no hitstop). Ult set pieces and procs hit too often; only a boss kill stops them. */
export function hitstopMs(h: {
  source: 'basic' | 'skill' | 'ult' | 'proc';
  crit: boolean;
  killed: boolean;
  knockback: number;
  big?: 'elite' | 'boss';
}): number {
  if (h.killed && h.big === 'boss') return HITSTOP.boss;
  if (h.source === 'ult' || h.source === 'proc') return 0;
  const basic = h.source === 'basic';
  return Math.max(
    h.killed ? (h.big === 'elite' ? HITSTOP.elite : HITSTOP.kill) : 0,
    basic && h.crit ? HITSTOP.crit : 0,
    basic && Math.abs(h.knockback) >= HITSTOP.heavy ? HITSTOP.finisher : 0,
  );
}

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
    desc: 'MAX HP +100, PULIH 1 HP/DTK',
    rarity: 'godly',
    apply: (s) => {
      s.maxHp += 100;
      s.regen += 1;
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
    desc: 'CURI 5% DAMAGE, +5 HP TIAP BUNUH',
    rarity: 'godly',
    apply: (s) => {
      s.lifesteal += 0.05;
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
  // Both items already reach the regen and lifesteal caps, so the set gives what they cannot.
  pair('hatiDewa', 'cawanDewa', 'KEABADIAN', 'MAX HP +50, KEBAL +0.4 DTK', (s) => {
    s.maxHp += 50;
    s.iframes += 400;
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
  pair('jamDewa', 'perisaiDewa', 'KEKEKALAN', 'DAMAGE +20%, PULIH 1 HP/DTK', (s) => {
    s.damage *= 1.2;
    s.regen += 1;
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

/** Relic slots: items held at once. A new one past this replaces an owned one (see takeItem). */
export const MAX_ITEMS = 8;

/**
 * Inventory after taking item `id`. With all MAX_ITEMS slots full it needs `drop` (index of the owned item to discard,
 * replaced in place); undefined = not allowed. A discarded item is simply gone, so it may be offered again later.
 */
export function takeItem(items: readonly ItemId[], id: ItemId, drop?: number): ItemId[] | undefined {
  if (items.includes(id)) return undefined;
  if (items.length < MAX_ITEMS) return [...items, id];
  if (drop === undefined || drop < 0 || drop >= items.length) return undefined;
  return items.map((x, i) => (i === drop ? id : x));
}

type StatKey = keyof Derived;
/** Item multipliers that add up instead of compounding: +15% and +20% make +35%. */
const ADD_UP: readonly StatKey[] = ['damage', 'maxHp', 'speed', 'skillPower', 'ultGainMult', 'soulMult', 'dashPower'];
/** Lower is better: their speed-ups add up (x0.8 and x0.75 = 25% + 33% faster); a curse (x1.15) counts against them. */
const ADD_DOWN: readonly StatKey[] = ['damageTaken', 'swingCooldown', 'dashCooldown', 'skillCdMult'];
/** Diminishing returns: of a total bonus above `knee`, only `rate` counts. */
const SOFT: Partial<Record<StatKey, { knee: number; rate: number }>> = {
  damage: { knee: 1, rate: 0.5 },
  skillPower: { knee: 1, rate: 0.5 },
  maxHp: { knee: 1, rate: 0.15 },
};
/** Soulslike: items never push sustain/defense past these (a class or permanent stat already above one keeps its value). */
const ITEM_CAP: Partial<Record<StatKey, number>> = {
  dodge: 0.15,
  lifesteal: 0.05,
  regen: 1,
  healOnKill: 5,
  critChance: 0.5,
  critMult: 2.5,
  echo: 0.4,
  ultGainMult: 2,
  iframes: 1000,
};
const ITEM_FLOOR: Partial<Record<StatKey, number>> = { damageTaken: 0.65, skillCdMult: 0.5 };

/** Permanent stats + class + current weapon + items picked up this run. */
export function runStats(base: Derived, weapon: Weapon, items: readonly ItemId[], cls?: ClassId): Derived {
  const s = { ...base };
  if (cls) {
    CLASSES[cls].apply(s);
    if (hasSynergy(cls, weapon.id)) CLASSES[cls].synergy.apply(s);
  }
  const s0 = { ...s };
  // Items are unique; fixed order so pickup order does not change an identical build. Applied in turn so the special
  // rules (fastest block, highest execute, switches) hold; the multipliers are then redone additively below.
  const effects = [...ITEM_IDS.filter((id) => items.includes(id)).map((id) => ITEMS[id].apply), ...activePairs(items).map((p) => p.apply)];
  for (const fx of effects) fx(s);
  // Probe: what each item / set does alone on top of the class, summed instead of multiplied.
  const probes = effects.map((fx) => {
    const p = { ...s0 };
    fx(p);
    return p;
  });
  for (const f of ADD_UP) s[f] = s0[f] + probes.reduce((sum, p) => sum + p[f] - s0[f], 0);
  for (const f of ADD_DOWN) s[f] = s0[f] / Math.max(0.5, 1 + probes.reduce((sum, p) => sum + s0[f] / p[f] - 1, 0));
  for (const [f, { knee, rate }] of Object.entries(SOFT) as [StatKey, { knee: number; rate: number }][]) {
    const bonus = s[f] / s0[f] - 1;
    if (bonus > knee) s[f] = s0[f] * (1 + knee + (bonus - knee) * rate);
  }
  for (const [f, cap] of Object.entries(ITEM_CAP) as [StatKey, number][]) s[f] = Math.min(s[f], Math.max(cap, s0[f]));
  for (const [f, floor] of Object.entries(ITEM_FLOOR) as [StatKey, number][]) s[f] = Math.max(s[f], Math.min(floor, s0[f]));
  // Flat damage items scale with the weapon too, so rapid fire does not multiply their value.
  s.damage *= weapon.dmg;
  s.swingCooldown *= weapon.cd;
  s.critChance += weapon.crit;
  s.damage = Math.max(1, Math.round(s.damage));
  s.maxHp = Math.round(s.maxHp);
  s.critChance = Math.min(0.9, s.critChance);
  s.swingCooldown = Math.max(0.1, s.swingCooldown);
  s.dashCooldown = Math.max(0.35, s.dashCooldown);
  s.speed = Math.min(190, s.speed);
  s.extraJumps = Math.min(3, s.extraJumps);
  s.killSouls = Math.min(3, s.killSouls);
  s.killBolt = Math.min(3, s.killBolt);
  s.ultRegen = Math.min(8, s.ultRegen);
  s.dashPower = Math.min(4, s.dashPower);
  s.elemental = Math.min(3, s.elemental);
  s.burnChance = Math.min(0.6, s.burnChance);
  s.freezeChance = Math.min(0.4, s.freezeChance);
  s.barrier = s.barrier && Math.max(4, s.barrier);
  s.goldChance = Math.min(0.8, s.goldChance);
  s.bossDamage = Math.min(1.5, s.bossDamage);
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
