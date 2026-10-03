import Phaser from 'phaser';
import type { ClassId } from '../logic/classes.ts';
import type { Player } from './Player.ts';
import { HELL, HOLY, twilightWings } from './skills.ts';

/**
 * Airborne body motion. flip/backflip: one somersault; roll: two quick ones; spin: a pirouette (turns to face each way);
 * arch: bends back gracefully; dive: pitches nose-down as it falls; lift: leans back rising, forward falling;
 * sway: floats, rocking gently; none: stays upright.
 */
export type JumpStyle = 'flip' | 'backflip' | 'roll' | 'spin' | 'arch' | 'dive' | 'lift' | 'sway' | 'none';

/** Particles a class leaves: puff (dust), spark (flies up), streak (speed lines), flake (drifts down), leaf (tumbles), wisp (rises). */
export interface Trail {
  shape: 'puff' | 'spark' | 'streak' | 'flake' | 'leaf' | 'wisp';
  colors: number[];
}

/** How a class moves and carries its weapon when not attacking. */
export interface MoveStyle {
  /** ms per run frame: short = quick steps, long = heavy or gliding. */
  stride: number;
  /** Forward tilt while running, degrees (negative leans back). */
  lean: number;
  jump: JumpStyle;
  /** Left while running, on landing and on air jumps. */
  trail: Trail;
  /** Resting weapon angle in degrees for a right-facing hero (negative = raised), and offset from the hand. */
  hold: { angle: number; dx?: number; dy?: number };
  /** Landing shakes the camera (heavy classes). */
  heavy?: boolean;
  /** Draws something that is always part of the body (wings, a halo), once per run scene. */
  attach?(scene: Phaser.Scene, p: Player): void;
}

export const STYLES: Record<ClassId, MoveStyle> = {
  // Artoria: composed stride, prana sparks at her heels, sword held forward and low.
  ksatria: { stride: 110, lean: 6, jump: 'lift', trail: { shape: 'spark', colors: [0x29adff, 0xc2f0ff] }, hold: { angle: 40 } },
  // King Hassan: slow, inevitable steps; black smoke and azure embers rise where he walks; Azrael stands planted
  // point-down in front of him, the pommel at his chest, as in his saint graph.
  pembunuh: {
    stride: 160,
    lean: 0,
    jump: 'none',
    trail: { shape: 'wisp', colors: [0x1c1c28, 0x3b3b4f, 0x29adff] },
    hold: { angle: 90, dx: 4, dy: -8 },
    heavy: true,
  },
  // Cu Chulainn: the fastest runner, blue speed lines, somersaults, spear level.
  dragoon: { stride: 75, lean: 12, jump: 'flip', trail: { shape: 'streak', colors: [0x2a4bd7, 0x29adff] }, hold: { angle: 15 } },
  // Heracles: stomping gait, dirt kicked up, axe-sword on the shoulder, the ground shakes when he lands.
  berserker: {
    stride: 170,
    lean: 4,
    jump: 'dive',
    trail: { shape: 'puff', colors: [0x7a5c44, 0x5f574f] },
    hold: { angle: -120, dx: -2, dy: -3 },
    heavy: true,
  },
  // EMIYA: backflips, red after-streaks, Kanshou and Bakuya held low and crossed.
  pemburu: { stride: 95, lean: 8, jump: 'backflip', trail: { shape: 'streak', colors: [0xff004d, 0xc2c3c7] }, hold: { angle: 35 } },
  // Magic Archer: light on her feet, arcane motes, floats in the air.
  magicArcher: { stride: 120, lean: 3, jump: 'sway', trail: { shape: 'spark', colors: [0xff77a8, 0x83769c] }, hold: { angle: 0 } },
  // Grim Reaper: glides, souls rise from its hem, scythe held upright behind.
  reaper: {
    stride: 190,
    lean: 0,
    jump: 'sway',
    trail: { shape: 'wisp', colors: [0xc2c3c7, 0x29adff] },
    hold: { angle: -95, dx: -5, dy: -2 },
  },
  // Gunners: tactical crouch-run, grey dust, rifle level.
  gunners: { stride: 100, lean: 10, jump: 'none', trail: { shape: 'puff', colors: [0xc2c3c7, 0x5f574f] }, hold: { angle: 0 } },
  // Cultivator: flowing steps, qi rising, arches in flight, sword floating raised.
  cultivator: { stride: 135, lean: 2, jump: 'arch', trail: { shape: 'wisp', colors: [0x29adff, 0xfff1e8] }, hold: { angle: -35, dy: -3 } },
  // Elementalis: sparks of all four elements trail her, staff upright.
  elementalis: {
    stride: 125,
    lean: 3,
    jump: 'lift',
    trail: { shape: 'spark', colors: [0xff004d, 0x29adff, 0xffec27, 0x00e436] },
    hold: { angle: -80 },
  },
  // Samurai: low fast run, sakura petals, katana held low and forward.
  samurai: { stride: 90, lean: 14, jump: 'flip', trail: { shape: 'leaf', colors: [0xff77a8, 0xfff1e8] }, hold: { angle: 20, dy: 1 } },
  // Dark Avenger: dark mist, dives down on enemies, blade raised.
  darkAvenger: { stride: 110, lean: 8, jump: 'dive', trail: { shape: 'wisp', colors: [0x7e2553, 0x8a3fd1] }, hold: { angle: -45 } },
  // Ashura: golden sparks, spins in the air, fists ready.
  ashura: { stride: 100, lean: 10, jump: 'spin', trail: { shape: 'spark', colors: [0xffec27, 0xffa300] }, hold: { angle: 0 } },
  // Antares: the unhurried stride of a Monarch, crimson embers underfoot, leans back on wing-like leaps, claw forward.
  antares: { stride: 125, lean: 4, jump: 'lift', trail: { shape: 'spark', colors: [0xff004d, 0xb3122e] }, hold: { angle: 30 } },
  // Gilgamesh: slow, arrogant, leaning back; gold dust.
  gilgamesh: { stride: 145, lean: -5, jump: 'none', trail: { shape: 'flake', colors: [0xffec27, 0xfff1e8] }, hold: { angle: 0 } },
  // Sukuna: unhurried, cursed energy rolls off him, rolls through the air.
  sukuna: { stride: 125, lean: -2, jump: 'roll', trail: { shape: 'wisp', colors: [0xff004d, 0x7e2553] }, hold: { angle: 0 } },
  // Gojo: casual, leaning back, arches lazily through the air, faint blue glints.
  gojo: { stride: 130, lean: -4, jump: 'arch', trail: { shape: 'flake', colors: [0x29adff, 0xfff1e8] }, hold: { angle: 0 } },
  // Toji: blur-fast sprint, white speed lines, double roll.
  toji: { stride: 65, lean: 18, jump: 'roll', trail: { shape: 'streak', colors: [0xfff1e8, 0xc2c3c7] }, hold: { angle: -20 } },
  // Madara: war-march, violet chakra, gunbai raised.
  madara: { stride: 120, lean: 10, jump: 'lift', trail: { shape: 'wisp', colors: [0x8a3fd1, 0x29adff] }, hold: { angle: -70, dy: -2 } },
  // Hashirama: steady, leaves fall around him, spins in the air.
  hashirama: { stride: 115, lean: 6, jump: 'spin', trail: { shape: 'leaf', colors: [0x00e436, 0x008751] }, hold: { angle: 10 } },
  // Itachi: ninja lean, black feathers, drops nose-down.
  itachi: { stride: 105, lean: 16, jump: 'dive', trail: { shape: 'leaf', colors: [0x000000, 0x5f574f] }, hold: { angle: 0 } },
  // Jack Frost: carried by the wind, frost flakes, pirouettes, staff slung.
  // Naruto: the arms-back ninja run at full tilt, orange chakra flaring off him, somersaults.
  naruto: { stride: 80, lean: 22, jump: 'flip', trail: { shape: 'wisp', colors: [0xffa300, 0xffec27] }, hold: { angle: 0 } },
  // Sasuke: composed, lightning crackling at his feet, arches through the air, Kusanagi held low.
  sasuke: { stride: 105, lean: 12, jump: 'arch', trail: { shape: 'spark', colors: [0x29adff, 0x8a3fd1] }, hold: { angle: 30 } },
  // Gravity Master: never touches the ground, drifts unhurried, rocking weightless in the air; pebbles fall upward
  // in his wake; the scepter raised.
  gravityMaster: {
    stride: 140,
    lean: -3,
    jump: 'sway',
    trail: { shape: 'wisp', colors: [0xc080ff, 0xfff1e8] },
    hold: { angle: -45, dx: -1 },
  },
  // Lightning Lord: a king's quick, upright stride, gold sparks and cyan crackle at his heels, rising regally into his
  // jumps; Vajra Badai held raised across his body.
  lightningLord: {
    stride: 90,
    lean: 8,
    jump: 'lift',
    trail: { shape: 'spark', colors: [0xffec27, 0x7fe6ff] },
    hold: { angle: -30, dx: 1 },
  },
  // Nephalem: half angel, half demon. A light, gliding step; white feathers and crimson embers drift from him; he rises
  // into his jumps on his wings. Small wings (white feathered on the angel's side, black bat wing on the demon's) and a
  // half halo are always on him; over his head, gold pips count CAHAYA and crimson pips KEGELAPAN.
  nephalem: {
    stride: 100,
    lean: 6,
    jump: 'lift',
    trail: { shape: 'flake', colors: [0xfff1e8, 0xff004d] },
    hold: { angle: 25 },
    attach: (scene, p) => {
      const g = scene.add.graphics().setDepth(9.6);
      const draw = () => {
        g.clear();
        if (!p.active) return;
        const angel = p.flipX ? 1 : -1;
        g.setPosition(p.x, p.y - 4);
        twilightWings(g, angel, 9, Math.sin(scene.time.now / 240) * 0.25);
        // The half halo over the angel's half of the head.
        g.lineStyle(1, HOLY).beginPath();
        for (let i = 0; i <= 6; i++) {
          const t = Math.PI / 2 + (i / 6) * Math.PI;
          const [x, y] = [-angel * Math.cos(t) * 4, Math.sin(t) * 1.3 - 9];
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.strokePath();
        // The balance: CAHAYA pips on the angel's side, KEGELAPAN pips on the demon's.
        const light = (p.getData('light') as number | undefined) ?? 0;
        const dark = (p.getData('dark') as number | undefined) ?? 0;
        for (let i = 0; i < light; i++) g.fillStyle(HOLY).fillRect(angel * (6 + i * 3) - 1, -13, 2, 2);
        for (let i = 0; i < dark; i++) g.fillStyle(HELL).fillRect(-angel * (6 + i * 3) - 1, -13, 2, 2);
      };
      scene.events.on('update', draw);
      scene.events.once('shutdown', () => {
        scene.events.off('update', draw);
        g.destroy();
      });
    },
  },
  jackFrost: { stride: 105, lean: 6, jump: 'spin', trail: { shape: 'flake', colors: [0xc2f0ff, 0xfff1e8] }, hold: { angle: -70, dx: -2 } },
};

/** Body angle in the air, `t` ms after the jump, falling at `vy`. */
export function airTilt(style: JumpStyle, t: number, vy: number, time: number): number {
  const p = (d: number) => Phaser.Math.Clamp(t / d, 0, 1);
  switch (style) {
    case 'flip':
      return 360 * Phaser.Math.Easing.Quadratic.Out(p(420));
    case 'backflip':
      return -360 * Phaser.Math.Easing.Quadratic.Out(p(450));
    case 'roll':
      return 720 * Phaser.Math.Easing.Cubic.Out(p(520));
    case 'arch':
      return -28 * Math.sin(p(600) * Math.PI);
    case 'dive':
      return vy > 0 ? Phaser.Math.Clamp(vy / 6, 0, 40) : -8;
    case 'lift':
      return Phaser.Math.Clamp(vy / 18, -14, 14);
    case 'sway':
      return Math.sin(time / 140) * 10;
    default:
      return 0;
  }
}

/** Pirouette styles turn the hero to face each way in turn for a moment after the jump. */
export function pirouette(style: JumpStyle, t: number): boolean {
  return style === 'spin' && t < 480 && Math.floor(t / 60) % 2 === 1;
}

/** Emit `n` trail particles at (x, y); `back` is the direction behind the hero. */
export function emitTrail(scene: Phaser.Scene, x: number, y: number, back: number, trail: Trail, n = 1): void {
  for (let i = 0; i < n; i++) {
    const color = trail.colors[(Math.random() * trail.colors.length) | 0];
    const jx = x + Phaser.Math.Between(-3, 3);
    const jy = y + Phaser.Math.Between(-2, 1);
    const rng = Phaser.Math.Between;
    switch (trail.shape) {
      case 'puff': {
        const o = scene.add.rectangle(jx, jy, 2, 2, color, 0.8).setDepth(9);
        scene.tweens.add({
          targets: o,
          x: jx + back * rng(3, 8),
          y: jy - rng(1, 4),
          scale: 2,
          alpha: 0,
          duration: 320,
          onComplete: () => o.destroy(),
        });
        break;
      }
      case 'spark': {
        const o = scene.add.rectangle(jx, jy, 1, 1, color).setDepth(9);
        scene.tweens.add({
          targets: o,
          x: jx + back * rng(2, 6),
          y: jy - rng(4, 10),
          alpha: 0,
          duration: 260,
          onComplete: () => o.destroy(),
        });
        break;
      }
      case 'streak': {
        const o = scene.add.rectangle(jx, jy - rng(2, 10), rng(4, 7), 1, color, 0.9).setDepth(9);
        scene.tweens.add({ targets: o, x: o.x + back * 10, scaleX: 0.2, alpha: 0, duration: 160, onComplete: () => o.destroy() });
        break;
      }
      case 'flake': {
        const o = scene.add.rectangle(jx, jy - rng(0, 10), 1, 1, color).setDepth(9);
        scene.tweens.add({
          targets: o,
          x: o.x + back * rng(2, 6) + rng(-2, 2),
          y: o.y + rng(3, 8),
          alpha: 0,
          duration: 600,
          onComplete: () => o.destroy(),
        });
        break;
      }
      case 'leaf': {
        const o = scene.add.rectangle(jx, jy - rng(2, 10), 2, 1, color).setDepth(9);
        scene.tweens.add({
          targets: o,
          x: o.x + back * rng(6, 14),
          y: o.y + rng(2, 8),
          angle: rng(180, 420),
          alpha: 0,
          duration: 700,
          onComplete: () => o.destroy(),
        });
        break;
      }
      case 'wisp': {
        const o = scene.add.rectangle(jx, jy - rng(0, 8), 1, 2, color, 0.8).setDepth(9);
        scene.tweens.add({ targets: o, x: o.x + rng(-2, 2), y: o.y - rng(6, 14), alpha: 0, duration: 520, onComplete: () => o.destroy() });
        break;
      }
    }
  }
}
