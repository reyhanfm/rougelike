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
  | 'gilgamesh'
  | 'sukuna'
  | 'gojo'
  | 'toji'
  | 'madara'
  | 'hashirama'
  | 'itachi'
  | 'jackFrost'
  | 'naruto'
  | 'sasuke'
  | 'gravityMaster'
  | 'lightningLord'
  | 'nephalem'
  | 'lumina'
  | 'surya'
  | 'candra';

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
  /** The class's own passive skill (behavior in entities/passives.ts): a real effect, not just stats. */
  passive: { name: string; desc: string };
  apply(s: Derived): void;
  synergy: { name: string; desc: string; apply(s: Derived): void };
  /** Palette char for the hair (top rows of the hero); defaults to the class color. */
  hair?: string;
  /** Own head and torso rows (palette chars) instead of the shared hero's; 'c' still takes the class color. */
  head?: string[];
  /** Costume below the waist: a LEGS template in sprites.ts, with its cloth ('P') and boot ('B') palette chars. */
  legs: { kind: 'pants' | 'robe' | 'armor' | 'coat' | 'float'; pant: string; boot: string };
  /**
   * Replaces the ult: when the meter is full the class awakens on its own, boosting its stats
   * and melee reach while the meter drains to empty over `ms` (times stats.awakenTime).
   */
  awaken?: { name: string; ms: number; reach: number; apply(s: Derived): void };
}

export const CLASSES: Record<ClassId, GameClass> = {
  ksatria: {
    id: 'ksatria',
    name: 'ARTORIA',
    weapon: 'pedang',
    color: 'c',
    legs: { kind: 'robe', pant: 'c', boot: '6' },
    hair: 'a',
    // Artoria Pendragon: blonde hair with its ahoge, green eyes, blue dress under a silver breastplate, gold belt.
    head: [
      '.....a....',
      '..0aaaa0..',
      '.0aaaaaa0.',
      '.0affffa0.',
      '.0fbffbf0.',
      '.0ffffff0.',
      '..066660..',
      '.0c6666c0.',
      '0fc6666cf0',
      '0f0cccc0f0',
      '..0a66a0..',
    ],
    passive: { name: 'SELUBUNG ANGIN', desc: 'BERLARI MENGUMPULKAN ANGIN DI PEDANG; SERANGAN BERIKUTNYA MELEPAS BOR ANGIN MENEMBUS' },
    trait: 'AVALON: PULIH 1 HP/DTK, HP +10%, DITERIMA -10%',
    apply: (s) => {
      s.regen += 1;
      s.maxHp *= 1.1;
      s.damageTaken *= 0.9;
    },
    synergy: {
      name: 'RAJA KSATRIA',
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
    legs: { kind: 'coat', pant: 'j', boot: '0' },
    // The First Hassan: a horned skull helm (the horns sweep out and up like a bull's) with azure flame burning in
    // its sockets, framed by the black mantle; dark steel pauldrons and gauntlets, a bone clasp at the belt.
    head: [
      '7........7',
      '67..00..76',
      '.67077076.',
      'j06777760j',
      'j00y77y00j',
      'j07700770j',
      'jj070070jj',
      '05jj66jj50',
      '06jj55jj60',
      '060jjjj060',
      '..0j66j0..',
    ],
    hair: '7',
    passive: { name: 'LONCENG PENANDA', desc: 'LONCENG MENANDAI MUSUH TERLEMAH (+50% DMG); SAAT MATI, API BIRU MEMBAKAR SEKITARNYA' },
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
    legs: { kind: 'pants', pant: 'k', boot: '6' },
    // Blue hair with its long tail behind, red eyes, blue bodysuit with silver pauldrons.
    head: [
      '...1111...',
      '..111111..',
      '.11111111.',
      '.1ffffff1.',
      '.1f8ff8f1.',
      '.0ffffff0.',
      '1.0kkkk0..',
      '1066kk660.',
      '0fk6kk6kf0',
      '0f0kkkk0f0',
      '..066660..',
    ],
    hair: '1',
    passive: { name: 'KUTUKAN GAE BOLG', desc: 'TIAP TUSUKAN MENANAM DURI: MUSUH BERDARAH (TUMPUK 5), LUKANYA TAK BISA DISEMBUHKAN' },
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
    legs: { kind: 'pants', pant: '5', boot: '5' },
    // Wild black mane, burning red eyes, huge grey-skinned body, bronze loincloth.
    head: [
      '0.0.00.0.0',
      '.00000000.',
      '0000000000',
      '.05555550.',
      '.05855850.',
      '.05555550.',
      '0555555550',
      '55l5555l55',
      '5555005555',
      '55.5555.55',
      '..0llll0..',
    ],
    hair: '0',
    passive: { name: 'TUBUH SETENGAH DEWA', desc: 'TIAP 4 DTK, SERANGAN DI BAWAH 20% HP TIDAK MEMPAN & PENYERANGNYA TERPENTAL' },
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
    legs: { kind: 'coat', pant: '8', boot: '0' },
    // White hair swept back, grey eyes, black armor under a red mantle.
    head: [
      '....777...',
      '.7777777..',
      '777777777.',
      '.07ffff70.',
      '.0f5ff5f0.',
      '.0ffffff0.',
      '..088880..',
      '.88000088.',
      '8f000000f8',
      '8f008800f8',
      '..066660..',
    ],
    hair: '7',
    passive: { name: 'TRACE ON', desc: 'TIAP 3.5 DTK MEMPROYEKSIKAN PEDANG DI PUNGGUNG (MAKS 3), MELESAT SAAT MENYERANG' },
    trait: 'MATA ELANG: KRITIS +10%, SOUL +20%, COOLDOWN SKILL -15%',
    apply: (s) => {
      s.critChance += 0.1;
      s.soulMult *= 1.2;
      s.skillCdMult *= 0.85;
    },
    synergy: {
      name: 'BROKEN PHANTASM',
      desc: 'LEMPARAN KANSHOU & BAKUYA MENEMBUS MUSUH',
      apply: (s) => void (s.pierceArrows = 1),
    },
  },

  magicArcher: {
    id: 'magicArcher',
    name: 'MAGIC ARCHER',
    weapon: 'busurArkana',
    color: 'e',
    legs: { kind: 'robe', pant: 'e', boot: 'd' },
    // Pink hood over silver bangs, violet eyes, gold star clasp.
    head: [
      '....ee....',
      '...eeee...',
      '..eeeeee..',
      '.ee6666ee.',
      '.efdffdfe.',
      '.eeffffee.',
      '..0eaae0..',
      '.0eeeeee0.',
      '0feeaeeef0',
      '0f0eeee0f0',
      '..0d66d0..',
    ],
    passive: { name: 'TANDA BINTANG', desc: 'TIAP PANAH MENANDAI BINTANG; 3 BINTANG DI SATU MUSUH MELEDAK JADI NOVA' },
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
    legs: { kind: 'float', pant: '5', boot: '5' },
    // Black hood, bare skull with red sockets, bony hands, tattered robe.
    head: [
      '...0000...',
      '..055550..',
      '.05555550.',
      '.05777750.',
      '.05877850.',
      '.05707750.',
      '..055550..',
      '.05555550.',
      '0755555570',
      '0705555070',
      '..055550..',
    ],
    passive: { name: 'LANGKAH MAUT', desc: 'TIAP MEMBUNUH: JADI BAYANGAN 1.2 DTK (KEBAL), TEBASAN BERIKUTNYA PASTI KRITIS' },
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
    legs: { kind: 'pants', pant: '3', boot: '4' },
    // Green helmet with goggles up, stubble, webbing straps, pouch belt.
    head: [
      '...3333...',
      '..333333..',
      '.33333333.',
      '.00a00a00.',
      '.0f0ff0f0.',
      '.0f4444f0.',
      '..033330..',
      '.03533530.',
      '0f353353f0',
      '0f033330f0',
      '..049940..',
    ],
    passive: { name: 'TURET OTOMATIS', desc: 'TIAP 12 DTK MEMASANG TURET 7 DTK YANG MENEMBAKI MUSUH TERDEKAT' },
    trait: 'HP +10%, LARI -5%; TAHAN SERANG',
    apply: (s) => {
      s.maxHp *= 1.1;
      s.speed *= 0.95;
    },
    synergy: {
      name: 'DISIPLIN TEMPUR',
      desc: 'JEDA TEMBAK -15%, SKILL SNIPER',
      apply: (s) => void (s.swingCooldown *= 0.85),
    },
  },
  cultivator: {
    id: 'cultivator',
    name: 'CULTIVATOR',
    weapon: 'pedangTerbang',
    color: '7',
    legs: { kind: 'robe', pant: '7', boot: '0' },
    // Long black hair under a gold crown, white robe with blue lapels and sash.
    head: [
      '...0aa0...',
      '..000000..',
      '.00000000.',
      '000ffff000',
      '00f0ff0f00',
      '00ffffff00',
      '0.0k77k0.0',
      '.07k77k70.',
      '7f777k77f7',
      '7f077770f7',
      '..0kkkk0..',
    ],
    passive: { name: 'PEDANG PENJAGA', desc: 'EMPAT PEDANG QI MENGORBIT TUBUH, MENEBAS MUSUH YANG MENDEKAT & MENANGKIS PROYEKTIL' },
    trait: 'QI: SKILL +20%, PULIH 1 HP/DTK, SKILL CD -10%',
    apply: (s) => {
      s.skillPower *= 1.2;
      s.regen += 1;
      s.skillCdMult *= 0.9;
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
    legs: { kind: 'robe', pant: '2', boot: '4' },
    // A tall wizard's hat with its tip bent back and a gold band set with a fire gem, a purple robe with the four
    // element gems (fire, ice, lightning, earth) across the chest, a gold hem.
    head: [
      '.......22.',
      '......22..',
      '...2a9a22.',
      '2222222222',
      '.0f0ff0f0.',
      '.0ffffff0.',
      '..0a22a0..',
      '.028kab20.',
      '0f222222f0',
      '0f022220f0',
      '..0a99a0..',
    ],
    passive: { name: 'RESONANSI ELEMEN', desc: 'MUSUH TERBAKAR YANG KENA ES/BATU BEREAKSI: UAP ATAU MAGMA MELEDAK' },
    trait: 'PENYIHIR EMPAT ELEMEN: SKILL +15%, SKILL CD -10%, HP -15%',
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
    color: 'v',
    legs: { kind: 'robe', pant: 'v', boot: '7' },
    hair: '0',
    // Black topknot, red hachimaki with its tail flying behind, stern eyes, indigo kimono with a crossed white collar, red obi.
    head: [
      '....00....',
      '..000000..',
      '8.0000000.',
      '.88888888.',
      '.0f0ff0f0.',
      '.0ffffff0.',
      '..07cc70..',
      '.0cc77cc0.',
      '0fccc7ccf0',
      '0f0cccc0f0',
      '..088880..',
    ],
    passive: { name: 'KUDA-KUDA IAI', desc: 'DIAM SEJENAK = KUDA-KUDA; SERANGAN BERIKUTNYA IAI KILAT, KRITIS SEMUA DI DEPAN' },
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
    legs: { kind: 'armor', pant: '5', boot: '0' },
    // Horned black helm with a glowing violet visor, violet-trimmed dark plate.
    head: [
      '5........5',
      '.5.5555.5.',
      '..555555..',
      '.55555555.',
      '.50gg0gg5.',
      '.55555555.',
      '..05gg50..',
      '.0g5555g0.',
      '05g5gg5g50',
      '050gggg050',
      '..055550..',
    ],
    passive: { name: 'BAYANGAN DENDAM', desc: 'BAYANGANNYA MENGULANG TIAP TEBASAN SESAAT KEMUDIAN (LEBIH KUAT SAAT AVENGER)' },
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
    legs: { kind: 'pants', pant: '8', boot: 'a' },
    // Gold crown, red skin, gold eyes, two extra arms raised at the shoulders.
    head: [
      '..a.aa.a..',
      '..aaaaaa..',
      '.0a9aa9a0.',
      '.08888880.',
      '.08a88a80.',
      '.08888880.',
      '8.0aaaa0.8',
      '808a88a808',
      '08a8888a80',
      '8.0aaaa0.8',
      '..099990..',
    ],
    passive: { name: 'LEDAKAN AMARAH', desc: 'AMARAH PENUH MELEDAK: LINGKAR TINJU EMAS MENGHANTAM SEMUA DI SEKITAR' },
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
    legs: { kind: 'armor', pant: 'j', boot: 'h' },
    // The Monarch of Destruction in human form: long black hair falling past his shoulders, glowing red eyes, a black
    // armored coat with a high collar, crimson trim and a crimson gem at the chest.
    head: [
      '...ssss...',
      '..ssssss..',
      '.ssssssss.',
      '.sssffsss.',
      '.sf8ff8fs.',
      'ssffffffss',
      'shsjjjjshs',
      's0jhjjhj0s',
      '0fjj88jjf0',
      '0f0jhhj0f0',
      '..0h99h0..',
    ],
    passive: { name: 'BARA KEHANCURAN', desc: 'MUSUH YANG MATI TERBAKAR MELEDAK, MENYEBARKAN API KE SEKITARNYA' },
    trait: 'RAJA NAGA KEHANCURAN: KEBAL TERBAKAR, HP +15%, DITERIMA -5%',
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
    legs: { kind: 'armor', pant: 'i', boot: 'a' },
    hair: 'a',
    // Golden hair swept up and back, red eyes, golden armor with white shine and orange trim, red cloth at the waist.
    head: [
      '.a.aaaa.a.',
      '.0aaaaaa0.',
      '0aaaaaaaa0',
      '.0ffffff0.',
      '.0f8ff8f0.',
      '.0ffffff0.',
      '..0cccc0..',
      '.0c7cc7c0.',
      '0fc9cc9cf0',
      '0f0cccc0f0',
      '..08aa80..',
    ],
    passive: { name: 'TAK LAYAK', desc: 'MUSUH YANG BERANI MENDEKAT DIHUJAM HARTA DARI GERBANG DI ATASNYA' },
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
  sukuna: {
    id: 'sukuna',
    name: 'SUKUNA',
    weapon: 'shrine',
    color: 'm',
    legs: { kind: 'robe', pant: 'm', boot: '0' },
    hair: 'e',
    // Ryomen Sukuna: spiky pink hair, two pairs of red eyes (the second pair opened under the first), the black
    // curse markings on brow and cheeks, white kimono with a dark sash.
    head: [
      'e.e0ee0e.e',
      '..0eeee0..',
      '.0eeeeee0.',
      '.0e0ff0e0.',
      '.0f8ff8f0.',
      '.008ff800.',
      '..0cccc0..',
      '.0c0cc0c0.',
      '00c0cc0c00',
      '0f0cccc0f0',
      '..022220..',
    ],
    passive: { name: 'DISMANTLE', desc: 'TIAP 1.3 DTK KAI TAK TERLIHAT MENEBAS 2 MUSUH; TIAP KETIGA, HACHI + DARAH' },
    trait: 'RAJA KUTUKAN: DAMAGE +25%, PULIH 2 HP/DTK, KRITIS +8%',
    apply: (s) => {
      s.damage *= 1.25;
      s.regen += 2;
      s.critChance += 0.08;
    },
    synergy: {
      name: 'KAI & HACHI',
      desc: '35% HIT MENEBAS LAGI, CURI 3% DAMAGE',
      apply: (s) => {
        s.echo += 0.35;
        s.lifesteal += 0.03;
      },
    },
  },
  gojo: {
    id: 'gojo',
    name: 'GOJO SATORU',
    weapon: 'mugen',
    color: 'n',
    legs: { kind: 'pants', pant: 'n', boot: '0' },
    hair: '7',
    // Spiky white hair, black blindfold over the Six Eyes, high-collared navy uniform.
    head: [
      '..7.77.7..',
      '.07777770.',
      '0777777770',
      '.07ffff70.',
      '.00000000.',
      '.0ffffff0.',
      '..0cccc0..',
      '.0c1cc1c0.',
      '0fccccccf0',
      '0f0cccc0f0',
      '..0c11c0..',
    ],
    passive: { name: 'INFINITY', desc: 'PROYEKTIL MUSUH MELAMBAT & BERHENTI SEBELUM MENYENTUH, LALU LENYAP' },
    trait: 'MUGEN: TAHAN 1 SERANGAN TIAP 6 DTK, HINDAR 15%',
    apply: (s) => {
      s.barrier = 6;
      s.dodge += 0.15;
    },
    synergy: {
      name: 'ENAM MATA',
      desc: 'COOLDOWN SKILL -30%, KRITIS +10%',
      apply: (s) => {
        s.skillCdMult *= 0.7;
        s.critChance += 0.1;
      },
    },
  },
  toji: {
    id: 'toji',
    name: 'TOJI',
    weapon: 'sakahoko',
    color: 'o',
    legs: { kind: 'pants', pant: '7', boot: '0' },
    // Short black hair, green eyes, scar at the lip, tight dark shirt, the storage curse around his waist.
    head: [
      '..0.00.0..',
      '.00000000.',
      '.00000000.',
      '.0ffffff0.',
      '.0fbffbf0.',
      '.0ff6fff0.',
      '..0oooo0..',
      '.0oo55oo0.',
      '0foo55oof0',
      '0f0oooo0f0',
      '..0dddd0..',
    ],
    hair: '0',
    passive: { name: 'REFLEKS SURGAWI', desc: 'DASH MENEMBUS SERANGAN: MUSUH SEKITAR MELAMBAT, HIT BERIKUTNYA KRITIS' },
    trait: 'RESTRIKSI SURGAWI: DAMAGE & LARI +15%, HINDAR 10%, SKILL -25%',
    apply: (s) => {
      s.damage *= 1.15;
      s.speed *= 1.15;
      s.dodge += 0.1;
      s.skillPower *= 0.75;
    },
    synergy: {
      name: 'PEMBUNUH PENYIHIR',
      desc: 'DAMAGE KE BOS/ELIT +40%, KRITIS +10%',
      apply: (s) => {
        s.bossDamage += 0.4;
        s.critChance += 0.1;
      },
    },
  },
  madara: {
    id: 'madara',
    name: 'MADARA',
    weapon: 'gunbai',
    color: 'p',
    legs: { kind: 'armor', pant: 'p', boot: '1' },
    hair: '0',
    // Long spiky black mane with a blue sheen, red Sharingan eyes, Uchiha war armor.
    head: [
      '.0.0110.0.',
      '0011111100',
      '0111111110',
      '011ffff110',
      '01f8ff8f10',
      '11ffffff11',
      '1.0cccc0.1',
      '10c1cc1c01',
      '0fc1cc1cf0',
      '0f0cccc0f0',
      '..055550..',
    ],
    passive: { name: 'SUSANOO: RUSUK', desc: 'SEKALI TIAP RONDE, HIT YANG MEMBUAT HP < 40% DITAHAN RUSUK SUSANOO 4 DTK' },
    trait: 'SHARINGAN: HINDAR 15%, KRITIS +10%, SKILL +10%',
    apply: (s) => {
      s.dodge += 0.15;
      s.critChance += 0.1;
      s.skillPower *= 1.1;
    },
    synergy: {
      name: 'UCHIHA GAESHI',
      desc: 'GUNBAI MENAHAN: DITERIMA -20%, PANTUL 15, SKILL +15%',
      apply: (s) => {
        s.damageTaken *= 0.8;
        s.thorns += 15;
        s.skillPower *= 1.15;
      },
    },
  },
  hashirama: {
    id: 'hashirama',
    name: 'HASHIRAMA',
    weapon: 'mokuton',
    color: 'q',
    legs: { kind: 'armor', pant: 'q', boot: '0' },
    // Sage Mode: long dark hair falling past his shoulders, the forehead protector, the red kumadori lines under his
    // eyes and on his brow, red Senju plate armor.
    head: [
      '..rrrrrr..',
      '.rrrrrrrr.',
      'rrrrrrrrrr',
      'r56666665r',
      'rrf0ff0frr',
      'rr8ffff8rr',
      'r.0qqqq0.r',
      'r0q4qq4q0r',
      '0fqq44qqf0',
      '0f0qqqq0f0',
      '..044440..',
    ],
    hair: 'r',
    passive: { name: 'BENIH KEHIDUPAN', desc: 'MUSUH TEWAS MENUMBUHKAN POHON: AKARNYA MENJERAT, DISENTUH = PULIH 5% HP' },
    trait: 'SEL HASHIRAMA: PULIH 2 HP/DTK, HP +20%, LARI -5%',
    apply: (s) => {
      s.regen += 2;
      s.maxHp *= 1.2;
      s.speed *= 0.95;
    },
    synergy: {
      name: 'MODE SENNIN',
      desc: 'SKILL & ULTI +25%, ULTI +25% CEPAT',
      apply: (s) => {
        s.skillPower *= 1.25;
        s.ultGainMult *= 1.25;
      },
    },
  },
  itachi: {
    id: 'itachi',
    name: 'ITACHI',
    weapon: 'kunai',
    color: 's',
    legs: { kind: 'coat', pant: 's', boot: '1' },
    hair: '0',
    // Black hair, scratched Konoha headband, Sharingan, tear-trough lines, Akatsuki cloak with red clouds.
    head: [
      '...0000...',
      '..011110..',
      '.00656600.',
      '.00ffff00.',
      '.0f8ff8f0.',
      '.0f5ff5f0.',
      '..0cccc0..',
      '.0c87ccc0.',
      '0fccc78cf0',
      '0f0cccc0f0',
      '..0c78c0..',
    ],
    passive: { name: 'KAWARIMI GAGAK', desc: 'TIAP 9 DTK, HIT JADI KAWANAN GAGAK: MUNCUL DI BELAKANG PENYERANG + GENJUTSU' },
    trait: 'GENJUTSU: 15% HIT MEMBEKUKAN, KRITIS +10%, HP -10%',
    apply: (s) => {
      s.freezeChance += 0.15;
      s.critChance += 0.1;
      s.maxHp *= 0.9;
    },
    synergy: {
      name: 'MANGEKYO SHARINGAN',
      desc: '20% HIT MEMBAKAR API HITAM, BURN +50%',
      apply: (s) => {
        s.burnChance += 0.2;
        s.elemental += 0.5;
      },
    },
  },
  jackFrost: {
    id: 'jackFrost',
    name: 'JACK FROST',
    weapon: 'tongkatFrost',
    color: 'u',
    legs: { kind: 'pants', pant: '4', boot: 'f' },
    // Wild frost-white hair swept to one side with bangs over the brow, icy eyes and a smirk, a blue hoodie rimed with
    // frost at the collar and chest, its white laces hanging.
    head: [
      '..7.7..7..',
      '.7777777.7',
      '7777777777',
      '.07f7ff770',
      '.0fuffuf0.',
      '.0ffff0f0.',
      '.60uuuu06.',
      '.0u7uu7u0.',
      '0fu6uu6uf0',
      '0f0uuuu0f0',
      '..0u66u0..',
    ],
    hair: '7',
    passive: { name: 'JEJAK BEKU', desc: 'LARI & MENDARAT MENINGGALKAN ES: MUSUH DI ATASNYA TERPELESET, MELAMBAT & BEKU' },
    trait: 'ANGIN MEMBAWAKU: +2 LOMPAT UDARA, LARI +10%, BEKU/BURN +30%',
    apply: (s) => {
      s.extraJumps += 2;
      s.speed *= 1.1;
      s.elemental += 0.3;
    },
    synergy: {
      name: 'PENJAGA KESENANGAN',
      desc: '20% HIT MEMBEKUKAN, SOUL +25%',
      apply: (s) => {
        s.freezeChance += 0.2;
        s.soulMult *= 1.25;
      },
    },
  },
  naruto: {
    id: 'naruto',
    name: 'NARUTO',
    weapon: 'rasengan',
    color: '9',
    legs: { kind: 'coat', pant: '9', boot: '0' },
    hair: 'a',
    // Six Paths Sage Mode: spiky blond hair, forehead protector, orange sage eyes and whisker marks, a glowing cloak
    // with black magatama at the collar.
    head: [
      '.a.aa.a.a.',
      '.aaaaaaaa.',
      'aaaaaaaaaa',
      '.a066660a.',
      '.0f9ff9f0.',
      '.05ffff50.',
      '..090090..',
      '.0a9aa9a0.',
      '0f9a99a9f0',
      '0f099990f0',
      '..055550..',
    ],
    passive: { name: 'KAGE BUNSHIN', desc: 'DASH MENINGGALKAN BUNSHIN YANG MELOMPAT & MEMUKUL MUSUH 2.6 DTK (CD 5 DTK)' },
    trait: 'CHAKRA KURAMA: HP +20%, PULIH 1 HP/DTK, ULTI +15% CEPAT',
    apply: (s) => {
      s.maxHp *= 1.2;
      s.regen += 1;
      s.ultGainMult *= 1.15;
    },
    synergy: {
      name: 'MODE RIKUDO SENNIN',
      desc: 'KLON: 30% HIT MEMUKUL LAGI, SKILL +20%',
      apply: (s) => {
        s.echo += 0.3;
        s.skillPower *= 1.2;
      },
    },
  },
  sasuke: {
    id: 'sasuke',
    name: 'SASUKE',
    weapon: 'kusanagi',
    color: 'w',
    legs: { kind: 'coat', pant: 'w', boot: '0' },
    hair: '0',
    // Black hair swept back with bangs over the Rinnegan (violet, left) and the Sharingan (red, right), grey shirt under
    // a dark cape, purple rope belt.
    head: [
      '..0.00....',
      '.0000000..',
      '000000000.',
      '.0000ff00.',
      '.0fdff8f0.',
      '.0ffffff0.',
      '.w066660w.',
      'ww066660ww',
      'wf666666fw',
      'wf0gggg0fw',
      '..055550..',
    ],
    passive: { name: 'CHIDORI NAGASHI', desc: 'DISENTUH MUSUH: PETIR MENGALIR DARI TUBUH, MENYENGAT & MELUMPUHKAN SEKITAR' },
    trait: 'RINNEGAN: HINDAR 15%, KRITIS +10%, SKILL CD -15%',
    apply: (s) => {
      s.dodge += 0.15;
      s.critChance += 0.1;
      s.skillCdMult *= 0.85;
    },
    synergy: {
      name: 'CHIDORI',
      desc: '20% HIT MELUMPUHKAN (BEKU), PENGALI KRITIS +0.3',
      apply: (s) => {
        s.freezeChance += 0.2;
        s.critMult += 0.3;
      },
    },
  },
  gravityMaster: {
    id: 'gravityMaster',
    name: 'GRAV. MASTER',
    weapon: 'gravitasi',
    color: 'x',
    legs: { kind: 'float', pant: 'x', boot: 'g' },
    hair: '6',
    // Silver hair lifted by his own field, violet event-horizon eyes, a high-collared void robe with a singularity core
    // glowing at the chest and a star-white clasp at the belt. He never touches the ground.
    head: [
      '.6..66..6.',
      '.06666660.',
      '0666666660',
      '.06ffff60.',
      '.0fgffgf0.',
      '.0ffffff0.',
      '.x0gggg0x.',
      '.0xgxxgx0.',
      '0fxx00xxf0',
      '0f0xggx0f0',
      '..0g77g0..',
    ],
    passive: { name: 'MEDAN GRAVITASI', desc: 'MUSUH DI DEKAT TUBUHNYA TERTEKAN: MELAMBAT & MENERIMA +15% DAMAGE' },
    trait: 'MASSA SINGULAR: DITERIMA -15%, HP +10%, ULTI +10% CEPAT',
    apply: (s) => {
      s.damageTaken *= 0.85;
      s.maxHp *= 1.1;
      s.ultGainMult *= 1.1;
    },
    synergy: {
      name: 'CAKRAWALA PERISTIWA',
      desc: '15% HIT MENGUNCI MUSUH (BEKU), SKILL +20%',
      apply: (s) => {
        s.freezeChance += 0.15;
        s.skillPower *= 1.2;
      },
    },
  },
  lightningLord: {
    id: 'lightningLord',
    name: 'LIGHTN. LORD',
    weapon: 'halilintar',
    color: 'z',
    legs: { kind: 'coat', pant: 'z', boot: '0' },
    hair: '7',
    // The Lightning Lord: a jagged gold crown of lightning on storm-white hair streaked electric cyan, burning gold eyes,
    // a storm-blue royal coat with gold trim and a charged core glowing at the belt.
    head: [
      '.a.a..a.a.',
      '.aa7777aa.',
      '7777y77777',
      '.07y77y70.',
      '.0faffaf0.',
      '.0ffffff0.',
      '.z0aaaa0z.',
      '.0zazzaz0.',
      '0fzz00zzf0',
      '0f0zaaz0f0',
      '..0ayya0..',
    ],
    passive: { name: 'KILAT BERANTAI', desc: 'TIAP SERANGAN KRITIS MELOMPATKAN PETIR KE 2 MUSUH TERDEKAT' },
    trait: 'TUBUH PETIR: GERAK +10%, KRITIS +5%, DASH -15% CD',
    apply: (s) => {
      s.speed *= 1.1;
      s.critChance += 0.05;
      s.dashCooldown *= 0.85;
    },
    synergy: {
      name: 'TAHTA BADAI',
      desc: 'TIAP KILL MENYAMBARKAN PETIR, SKILL +20%',
      apply: (s) => {
        s.killBolt += 1;
        s.skillPower *= 1.2;
      },
    },
  },
  nephalem: {
    id: 'nephalem',
    name: 'NEPHALEM',
    weapon: 'surgaNeraka',
    color: 'N',
    legs: { kind: 'robe', pant: 'N', boot: '0' },
    hair: '7',
    // Split down the middle: on the angel's side white hair, a gold eye and a white robe with gold; on the demon's
    // side black hair with a horn, a red eye and a wine-dark robe with crimson; a twilight-violet clasp where they meet.
    head: [
      '.77.....2.',
      '.7777ss22.',
      '7777ssssss',
      '.07777ss0.',
      '.0faff8f0.',
      '.0ffffff0.',
      '..077NN0..',
      '.07a7NhN0.',
      '0f777NNNf0',
      '0f07aN80f0',
      '..0agg80..',
    ],
    passive: { name: 'LAYANG SENJA', desc: 'TAHAN LOMPAT SAAT JATUH = MELAYANG; BULU CAHAYA & API NERAKA BERJATUHAN' },
    trait: 'DARAH GANDA: HP +10%, CURI NYAWA 3%, KRITIS +5%',
    apply: (s) => {
      s.maxHp *= 1.1;
      s.lifesteal += 0.03;
      s.critChance += 0.05;
    },
    synergy: {
      name: 'KESEIMBANGAN SEMPURNA',
      desc: '15% HIT MEMBAKAR, SKILL +20%',
      apply: (s) => {
        s.burnChance += 0.15;
        s.skillPower *= 1.2;
      },
    },
  },
  lumina: {
    id: 'lumina',
    name: 'LUMINA',
    weapon: 'foton',
    color: 'L',
    legs: { kind: 'coat', pant: 'L', boot: 'a' },
    hair: '7',
    // Lumina, the one who commands light: glowing white-gold hair, eyes lit cyan, a pearl-white coat traced with lines
    // of cyan light and trimmed in gold, a white-hot core at the belt.
    head: [
      '..7.a7.7..',
      '.0777a770.',
      '0777a77770',
      '.07777770.',
      '.0fyffyf0.',
      '.0ffffff0.',
      '..0aLLa0..',
      '.0LyLLyL0.',
      '0fLLaaLLf0',
      '0f0LyyL0f0',
      '..0a77a0..',
    ],
    passive: { name: 'KRISTAL CAHAYA', desc: 'TIAP 3 HIT / KRITIS MEMUNCULKAN KRISTAL CAHAYA YANG MENEMBAK SINAR; JADI CERMIN SKILL' },
    trait: 'TUBUH FOTON: GERAK +15%, KRITIS +5%, DASH -10% CD',
    apply: (s) => {
      s.speed *= 1.15;
      s.critChance += 0.05;
      s.dashCooldown *= 0.9;
    },
    synergy: {
      name: 'SPEKTRUM PENUH',
      desc: 'KRITIS +8%, SKILL +20%',
      apply: (s) => {
        s.critChance += 0.08;
        s.skillPower *= 1.2;
      },
    },
  },
  surya: {
    id: 'surya',
    name: 'SURYA',
    weapon: 'pedangSurya',
    color: 'S',
    legs: { kind: 'armor', pant: 'i', boot: 'S' },
    hair: 'S',
    // Surya, the Solar Knight: a golden helm with a plume of living flame, eyes lit like two small suns, gold plate
    // over a sun-orange surcoat, and a sun-disc halo burning behind him.
    head: [
      '...SaaS...',
      '.0SSaaSS0.',
      '.0iiiiii0.',
      '.0ia00ai0.',
      '.0faffaf0.',
      '.0ffffff0.',
      '..0iiii0..',
      '.0iSiiSi0.',
      '0fiSaaSif0',
      '0f0iSSi0f0',
      '..0aSSa0..',
    ],
    passive: { name: 'KORONA', desc: 'CINCIN API MENGELILINGI; MUSUH DEKAT TERBAKAR, TIAP KILL MELEDAKKAN KORONA' },
    trait: 'BERKAT MATAHARI: DAMAGE +10%, DAMAGE DITERIMA -10%, HP MAKS +15%',
    apply: (s) => {
      s.damage *= 1.1;
      s.damageTaken *= 0.9;
      s.maxHp *= 1.15;
    },
    synergy: {
      name: 'MAHKOTA SURYA',
      desc: 'SKILL +25%, DAMAGE +5%',
      apply: (s) => {
        s.skillPower *= 1.25;
        s.damage *= 1.05;
      },
    },
  },
  candra: {
    id: 'candra',
    name: 'CANDRA',
    weapon: 'sabitCandra',
    color: 'M',
    legs: { kind: 'robe', pant: 'M', boot: 'd' },
    hair: 'M',
    // Candra, the Moon Knight: a crescent crest over a lunar hood, a white mask with black eye slits, a pale cloak
    // with a white crescent on the chest, a silver belt.
    head: [
      '...7..7...',
      '..077770..',
      '.0MMMMMM0.',
      '.0M7777M0.',
      '.0M0770M0.',
      '.0MM77MM0.',
      '..0M77M0..',
      '.0M7MM7M0.',
      '0fM7MM7Mf0',
      '0f0MMMM0f0',
      '..0d77d0..',
    ],
    passive: { name: 'FASE BULAN', desc: 'BULAN DI ATAS KEPALA MEMBESAR TIAP 2 HIT; PURNAMA MENARIK GRAVITASI, SKILL MAKIN KUAT' },
    trait: 'GRAVITASI BULAN: +1 LOMPAT UDARA, KRITIS +6%, DAMAGE +8%',
    apply: (s) => {
      s.extraJumps += 1;
      s.critChance += 0.06;
      s.damage *= 1.08;
    },
    synergy: {
      name: 'MALAM PURNAMA',
      desc: 'KRITIS +6%, SKILL +20%',
      apply: (s) => {
        s.critChance += 0.06;
        s.skillPower *= 1.2;
      },
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
