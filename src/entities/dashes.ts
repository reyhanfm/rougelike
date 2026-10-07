import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark, floatText } from '../gfx/ui.ts';
import type { ClassId } from '../logic/classes.ts';
import type { Status } from '../logic/loot.ts';
import {
  afterimage,
  bladeLine,
  flameTongue,
  explosion,
  feathers,
  glint,
  ring,
  rocks,
  sparks,
  stormArc,
  thorns,
  FIRE,
  HOLY,
  HELL,
  type SkillCtx,
  SPECTRUM,
  SOUL,
  RADIANT,
  KAMUI,
  kamuiSwirl,
  RIKUDO,
  summonBird,
} from './skills.ts';

/** A class's dash (K): its own movement plus its own hit. ctx.power is stats.dashPower. */
export interface DashStyle {
  name: string;
  desc: string;
  /** Speed along facing (negative = backwards), px/s; vy is vertical. */
  speed: number;
  vy?: number;
  /** Duration: no steering and invulnerable for this long. */
  ms: number;
  /** Keep gravity (leaps). */
  gravity?: boolean;
  /** Cooldown multiplier. */
  cd?: number;
  tint: number;
  /** Hits each enemy touched during the dash once (mult on the damage stat, times dashPower); `cut` marks each hit. */
  hit?: { mult: number; radius: number; crit?: boolean; status?: Status; heal?: number; cut?: number };
  start?(c: SkillCtx): void;
}

/** Runs `fn` every `step` ms for `ms` ms (effects that follow the hero through the dash). */
const during = (scene: Phaser.Scene, ms: number, step: number, fn: (i: number) => void) => {
  for (let i = 0; i * step < ms; i++) scene.time.delayedCall(i * step, () => fn(i));
};
const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

/** A short-lived colored puff (smoke, flame, mist) that swells and fades. */
const puff = (scene: Phaser.Scene, x: number, y: number, color: number, r = 3, rise = 6, ms = 400) => {
  const c = scene.add.circle(x, y, r, color, 0.7).setDepth(11);
  scene.tweens.add({ targets: c, y: y - rise, scale: 2, alpha: 0, duration: ms, onComplete: () => c.destroy() });
};

export const DASHES: Record<ClassId, DashStyle> = {
  ksatria: {
    name: 'MANA BURST',
    desc: 'LEDAKAN PRANA BIRU MELONTARKAN KE DEPAN, MENEBAS',
    speed: 340,
    ms: 170,
    tint: 0x29adff,
    hit: { mult: 0.9, radius: 14, cut: 0xc2f0ff },
    // Prana erupts behind her like a jet: a blue flare, a cone of mana flames trailing, and a ring where she launched.
    // Where the burst spends itself she cuts through: a line of blue prana along her path snaps shut behind her and the
    // air bursts in a ring.
    start: ({ p, world, scene, power }) => {
      const f = p.facing;
      const sx = p.x;
      later(scene, 170, () => {
        if (!p.active) return;
        bladeLine(scene, sx, p.y, p.x, p.y, 0x29adff, 60);
        ring(scene, p.x, p.y, 0xc2f0ff, 2, 16, 200, 2);
        sparks(scene, p.x + f * 6, p.y, [0x29adff, 0xc2f0ff, 0xfff1e8], 8, 14);
      });
      const flare = scene.add.circle(p.x, p.y, 6, 0x29adff, 0.5).setStrokeStyle(2, 0xc2f0ff).setDepth(12);
      scene.tweens.add({ targets: flare, radius: 26, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
      ring(scene, p.x - f * 4, p.y, 0xc2f0ff, 4, 20, 220, 2);
      world.area(p.x, p.y, 18, 0.5 * power, 150, 'skill');
      during(scene, 170, 25, (i) => {
        for (const dy of [-3, 3]) {
          const jet = scene.add.rectangle(p.x - f * 6, p.y + dy, 6, 2, i % 2 ? 0xc2f0ff : 0x29adff).setDepth(11);
          scene.tweens.add({ targets: jet, x: jet.x - f * 14, scaleX: 0.2, alpha: 0, duration: 180, onComplete: () => jet.destroy() });
        }
        // A blue flame tongue at the core of the jet.
        const core = scene.add
          .triangle(p.x - f * 5, p.y, 0, -3, 0, 3, -f * 12, 0, 0x7fe6ff, 0.8)
          .setOrigin(0)
          .setDepth(11);
        scene.tweens.add({ targets: core, alpha: 0, scaleX: 0.3, duration: 140, onComplete: () => core.destroy() });
      });
    },
  },
  pembunuh: {
    name: 'KABUT AZRAEL',
    desc: 'LENYAP JADI KABUT & BULU HITAM, MUNCUL DI BELAKANG MUSUH, TEBASAN API BIRU',
    speed: 0,
    ms: 120,
    tint: 0x29adff,
    // Presence Concealment: he comes apart into black smoke and feathers and re-forms out of the dark behind the
    // nearest enemy, already cutting; azure fire catches in the wound.
    start: ({ p, world, scene, power }) => {
      const vanish = () => {
        for (let i = 0; i < 6; i++) puff(scene, p.x + Phaser.Math.Between(-5, 5), p.y + Phaser.Math.Between(-6, 6), 0x1c1c28, 3, 10, 500);
        feathers(scene, p.x, p.y - 4, 5, 6, 18);
      };
      vanish();
      const t = world.targets(p.x, p.y).find((e) => Math.abs(e.x - p.x) < 130 && Math.abs(e.y - p.y) < 50);
      if (!t) return void p.setVelocityX(p.facing * 300);
      p.ghost(0x29adff);
      const side = t.x >= p.x ? 1 : -1;
      p.body.reset(Phaser.Math.Clamp(t.x + side * 12, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
      p.facing = -side;
      vanish();
      cutMark(scene, t.x, t.y, 0x29adff, 28, 0.9 * side);
      flameTongue(scene, t.x, t.y + 6, 12);
      sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 8, 16);
      world.strike(t, 1 * power, 'skill', true, { burn: 0.2 });
    },
  },
  dragoon: {
    name: 'LOMPATAN CULANN',
    desc: 'LOMPATAN TINGGI, MENDARAT MENGHANTAM',
    speed: 130,
    vy: -380,
    ms: 250,
    gravity: true,
    tint: 0x2a4bd7,
    // A crimson rune flashes where he kicks off; he comes down spear-first and red barbs burst from the impact.
    start: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y + 6, 0xff004d, 3, 18, 250, 2);
      rocks(scene, p.x, FLOOR_Y - 2, 4);
      p.onLand(() => {
        world.area(p.x, p.y + 4, 24, 0.8 * power, 150, 'skill');
        thorns(scene, p.x, p.y + 4, 0xff004d, 7, 16);
        ring(scene, p.x, p.y + 6, 0x2a4bd7, 4, 30, 300, 2);
        rocks(scene, p.x, FLOOR_Y - 2, 8);
        scene.cameras.main.shake(80, 0.008);
      });
    },
  },
  berserker: {
    name: 'TERJANG RAKSASA',
    desc: 'TERJANGAN PANJANG, HANTAMAN BAHU MENGGEMPA',
    speed: 240,
    ms: 320,
    cd: 1.2,
    tint: 0xff004d,
    hit: { mult: 1.3, radius: 14, cut: 0xffa300 },
    // A roaring bull charge: the ground tears up under each step, and it ends in a shoulder slam that quakes.
    start: ({ p, world, scene, power }) => {
      floatText(scene, p.x, p.y - 20, 'RRAAH!', '#ff004d');
      ring(scene, p.x, p.y, 0xff004d, 4, 24, 200, 2);
      during(scene, 320, 60, () => rocks(scene, p.x, FLOOR_Y - 2, 2));
      later(scene, 320, () => {
        if (!p.active) return;
        world.area(p.x + p.facing * 10, p.y, 26, 0.6 * power, 260, 'skill');
        ring(scene, p.x + p.facing * 10, p.y, 0xab5236, 4, 32, 260, 3);
        rocks(scene, p.x, FLOOR_Y - 2, 8);
        scene.cameras.main.shake(140, 0.015);
      });
    },
  },
  pemburu: {
    name: 'LOMPAT MUNDUR',
    desc: 'SALTO KE BELAKANG SAMBIL MEMANAH',
    speed: -220,
    vy: -200,
    ms: 200,
    gravity: true,
    tint: 0xff004d,
    // A backflip with a three-arrow volley loosed mid-air, the bowstring flashing; red streaks mark the shots.
    start: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y + 6, 0xc2c3c7, 3, 14, 200);
      const flash = scene.add.rectangle(p.x + p.facing * 4, p.y, 1, 14, 0xfff1e8).setDepth(13);
      scene.tweens.add({ targets: flash, alpha: 0, scaleX: 3, duration: 150, onComplete: () => flash.destroy() });
      for (const a of [-0.1, 0, 0.1]) {
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 260 * p.facing,
          vy: Math.sin(a) * 260,
          texture: 'arrow',
          tint: 0xff6a6a,
          mult: 0.7 * power,
          source: 'skill',
        });
        const streak = scene.add
          .rectangle(p.x + p.facing * 20, p.y + Math.sin(a) * 20, 30, 1, 0xff004d, 0.8)
          .setRotation(a * p.facing)
          .setDepth(12);
        scene.tweens.add({ targets: streak, x: streak.x + p.facing * 30, alpha: 0, duration: 200, onComplete: () => streak.destroy() });
      }
    },
  },
  magicArcher: {
    name: 'JEJAK BINTANG',
    desc: 'MELESAT RENDAH, MENJATUHKAN 3 RANJAU BINTANG YANG MELEDAK SESAAT KEMUDIAN',
    speed: 300,
    ms: 170,
    tint: 0xff77a8,
    // She darts away low and drops three little stars behind her as she goes; they hang there pulsing, then go off one
    // after another, a pink burst each (a trap for whatever follows her).
    start: ({ p, world, scene, power }) => {
      for (let i = 0; i < 3; i++)
        later(scene, i * 55, () => {
          const x = p.x;
          const y = p.y;
          const star = scene.add.star(x, y, 4, 2, 6, 0xffec27).setStrokeStyle(1, 0xff77a8).setDepth(12);
          scene.tweens.add({ targets: star, scale: 1.4, angle: 90, yoyo: true, repeat: 2, duration: 100 });
          later(scene, 550 + i * 90, () => {
            star.destroy();
            const b = scene.add.star(x, y, 4, 4, 16, 0xff77a8).setDepth(13);
            scene.tweens.add({ targets: b, scale: 1.5, angle: 45, alpha: 0, duration: 260, onComplete: () => b.destroy() });
            sparks(scene, x, y, [0xff77a8, 0xffec27], 8, 16);
            world.area(x, y, 22, 0.7 * power, 120, 'skill', { slow: 500 });
          });
        });
    },
  },
  reaper: {
    name: 'LANGKAH HANTU',
    desc: 'MELAYANG MENEMBUS MUSUH, PULIH TIAP KENA',
    speed: 200,
    ms: 320,
    tint: 0xc2c3c7,
    hit: { mult: 0.6, radius: 14, heal: 3, cut: 0x29adff },
    // It fades to a wraith drifting through enemies, souls peeling off behind, and reaps with one scythe sweep at the end.
    start: ({ p, world, scene, power }) => {
      during(scene, 320, 40, () => {
        const w = scene.add.rectangle(p.x + Phaser.Math.Between(-4, 4), p.y + Phaser.Math.Between(-6, 6), 1, 2, 0x29adff).setDepth(11);
        scene.tweens.add({ targets: w, y: w.y - 14, alpha: 0, duration: 500, onComplete: () => w.destroy() });
      });
      later(scene, 320, () => {
        if (!p.active) return;
        const arc = scene.add
          .image(p.x + p.facing * 8, p.y, 'slashMoon')
          .setTint(0xc2c3c7)
          .setScale(p.facing * 2, 2)
          .setDepth(13);
        scene.tweens.add({ targets: arc, alpha: 0, x: arc.x + p.facing * 8, duration: 220, onComplete: () => arc.destroy() });
        world.area(p.x + p.facing * 12, p.y, 18, 0.5 * power, 80, 'skill');
      });
    },
  },
  gunners: {
    name: 'LOMPAT ROKET',
    desc: 'LEDAKAN DI KAKI MELONTARKAN KE ATAS',
    speed: -120,
    vy: -340,
    ms: 200,
    gravity: true,
    tint: 0xffa300,
    // A charge goes off underfoot: fireball, smoke and debris, and a smoke trail behind the rising soldier.
    start: ({ p, world, scene, power }) => {
      explosion(scene, p.x, p.y + 6, 22);
      world.area(p.x, p.y + 6, 26, 1 * power, 160, 'skill');
      scene.cameras.main.shake(100, 0.01);
      during(scene, 300, 40, () => puff(scene, p.x, p.y + 6, 0x5f574f, 2, 2, 450));
    },
  },
  cultivator: {
    name: 'TERBANG PEDANG',
    desc: 'MELUNCUR DI ATAS PEDANG, MENEBAS YANG DILEWATI',
    speed: 210,
    vy: -50,
    ms: 420,
    tint: 0x29adff,
    hit: { mult: 0.8, radius: 14, cut: 0xc2f0ff },
    // He rides his flying sword: it appears under his feet, glowing, a ribbon of qi streaming behind until he steps off.
    start: ({ p, scene }) => {
      const sword = scene.add
        .image(p.x, p.y + 8, 'w_pedangTerbang')
        .setTint(0xc2f0ff)
        .setScale(p.facing * 1.4, 1.4)
        .setDepth(9);
      during(scene, 420, 16, () => {
        sword.setPosition(p.x, p.y + 8);
        if (Math.random() < 0.5) {
          const q = scene.add.rectangle(p.x - p.facing * 8, p.y + 8, 3, 1, 0x29adff).setDepth(8);
          scene.tweens.add({ targets: q, x: q.x - p.facing * 10, alpha: 0, duration: 300, onComplete: () => q.destroy() });
        }
      });
      later(scene, 440, () =>
        scene.tweens.add({ targets: sword, alpha: 0, y: sword.y + 6, duration: 200, onComplete: () => sword.destroy() }),
      );
    },
  },
  elementalis: {
    name: 'BLINK ELEMEN',
    desc: 'TELEPORT LEWAT LINGKARAN SIHIR, LEDAKAN ELEMEN SIKLUS DI TUJUAN',
    speed: 0,
    ms: 90,
    tint: 0xc080ff,
    // A magic circle opens under her feet and another ahead; she steps through and arrives in a burst of whichever
    // element her cycle is on.
    start: ({ p, world, scene, power }) => {
      const k = (p.getData('element') as number | undefined) ?? 0;
      const [color, status] = (
        [
          [0xff004d, { burn: 0.3 }],
          [0x29adff, { freeze: 600 }],
          [0xffec27, { freeze: 300 }],
          [0x00e436, { slow: 1200 }],
        ] as const
      )[k];
      const fromX = p.x;
      const y = p.y;
      const toX = Phaser.Math.Clamp(p.x + p.facing * 90, 8, W - 8);
      for (const x of [fromX, toX]) {
        const rune = scene.add
          .ellipse(x, y + 7, 26, 7)
          .setStrokeStyle(1, color)
          .setDepth(9);
        const inner = scene.add
          .ellipse(x, y + 7, 16, 4)
          .setStrokeStyle(1, 0xfff1e8)
          .setDepth(9);
        scene.tweens.add({
          targets: [rune, inner],
          scaleX: 1.4,
          alpha: 0,
          delay: 150,
          duration: 300,
          onComplete: () => (rune.destroy(), inner.destroy()),
        });
        const col = scene.add
          .rectangle(x, y + 7, 14, 24, color, 0.35)
          .setOrigin(0.5, 1)
          .setDepth(9);
        scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, duration: 300, onComplete: () => col.destroy() });
      }
      afterimage(scene, p, fromX, y, 0.5, color);
      p.body.reset(toX, y);
      sparks(scene, toX, y, [color, 0xfff1e8], 12, 20);
      world.area(toX, y, 22, 0.6 * power, 80, 'skill', status);
    },
  },
  samurai: {
    name: 'SHUKUCHI',
    desc: 'LANGKAH KILAT, TEBASAN KRITIS DI SEPANJANG JALUR',
    speed: 480,
    ms: 110,
    cd: 0.85,
    tint: 0xfff1e8,
    hit: { mult: 0.8, radius: 14, crit: true, cut: 0xff004d },
    // Shukuchi: a glint, then he is simply somewhere else; the air he crossed hangs cut in a thin line, petals scatter.
    start: ({ p, scene }) => {
      const fromX = p.x;
      const y = p.y;
      glint(scene, p.x + p.facing * 6, y - 1);
      later(scene, 110, () => {
        if (!p.active) return;
        bladeLine(scene, fromX, y, p.x, y, 0xff004d, 120);
        for (let i = 0; i < 6; i++) {
          const petal = scene.add
            .rectangle(Phaser.Math.Linear(fromX, p.x, Math.random()), y + Phaser.Math.Between(-6, 6), 2, 1, 0xff77a8)
            .setDepth(12);
          scene.tweens.add({ targets: petal, y: petal.y + 12, angle: 270, alpha: 0, duration: 600, onComplete: () => petal.destroy() });
        }
      });
    },
  },
  darkAvenger: {
    name: 'TENGGELAM BAYANGAN',
    desc: 'TENGGELAM KE BAYANGAN SENDIRI, MELUNCUR DI LANTAI, LALU MELEDAK KE ATAS MELEMPAR MUSUH',
    speed: 260,
    ms: 220,
    tint: 0x2a0a2a,
    // He sinks into his own shadow: only a black pool slides along the floor, bubbling violet. At the end he erupts
    // out of it in a pillar of darkness that throws everything above it into the air.
    start: ({ p, world, scene, power }) => {
      const pool = scene.add
        .ellipse(p.x, p.y + 7, 16, 4, 0x000000, 0.85)
        .setStrokeStyle(1, 0x8a3fd1)
        .setDepth(11);
      const follow = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          pool.setPosition(p.x, p.y + 7);
          if (Math.random() < 0.4) puff(scene, p.x + Phaser.Math.Between(-6, 6), p.y + 5, 0x8a3fd1, 1.5, 6, 300);
        },
      });
      later(scene, 220, () => {
        follow.remove();
        pool.destroy();
        const { x, y } = p;
        const pillar = scene.add
          .rectangle(x, y + 8, 14, 50, 0x2a0a2a, 0.85)
          .setOrigin(0.5, 1)
          .setStrokeStyle(1, 0x8a3fd1)
          .setDepth(12);
        pillar.setScale(1, 0);
        scene.tweens.add({ targets: pillar, scaleY: 1, duration: 90, ease: 'Quad.Out' });
        scene.tweens.add({ targets: pillar, scaleX: 0, alpha: 0, delay: 160, duration: 200, onComplete: () => pillar.destroy() });
        sparks(scene, x, y, [0x8a3fd1, 0xc080ff, 0x2a0a2a], 12, 20);
        scene.cameras.main.shake(100, 0.01);
        for (const t of world.targets(x, y)) {
          if (Math.abs(t.x - x) > 18 || t.y > y + 10 || t.y < y - 50) continue;
          world.strike(t, 1 * power, 'skill', false, undefined, 60);
          if (!('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-220);
          cutMark(scene, t.x, t.y, 0x8a3fd1);
        }
      });
    },
  },
  ashura: {
    name: 'LANGKAH ASURA',
    desc: 'DASH MENGHANTAM, +2 AMARAH',
    speed: 280,
    ms: 150,
    tint: 0xffec27,
    hit: { mult: 0.6, radius: 14 },
    // Six phantom fists drive him forward, a gold ring blasting out where he started.
    start: ({ p, scene }) => {
      p.gainFury(2);
      ring(scene, p.x, p.y, 0xffec27, 4, 22, 220, 2);
      during(scene, 150, 25, (i) => {
        const fist = scene.add
          .image(p.x - p.facing * 4, p.y + (i % 3) * 5 - 5, 'w_enamLengan')
          .setTint(0xffec27)
          .setFlipX(p.facing < 0)
          .setAlpha(0.8)
          .setDepth(12);
        scene.tweens.add({ targets: fist, x: fist.x + p.facing * 24, alpha: 0, duration: 150, onComplete: () => fist.destroy() });
      });
    },
  },
  antares: {
    name: 'LANGKAH NAGA',
    desc: 'BERUBAH SETENGAH NAGA SESAAT, MENERJANG RENDAH SAMBIL MENYEMBURKAN API',
    speed: 300,
    ms: 200,
    tint: 0xb3122e,
    hit: { mult: 0.7, radius: 16, status: { burn: 0.2 }, cut: 0xff004d },
    // For a heartbeat the dragon shows through: the shadow of a crimson dragon surges forward with him, its jaws open,
    // fire pouring out ahead of it; it roars as it fades back into him.
    start: ({ p, scene }) => {
      const f = p.facing;
      const dragon = scene.add
        .image(p.x, p.y - 2, 'dragon')
        .setFlipX(f < 0)
        .setTint(0xb3122e)
        .setAlpha(0.7)
        .setDepth(9);
      const follow = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          dragon.setPosition(p.x - f * 2, p.y - 2);
          const fb = scene.add
            .circle(
              p.x + f * 12,
              p.y - 2 + Phaser.Math.Between(-3, 3),
              Phaser.Math.Between(2, 3),
              Math.random() < 0.5 ? 0xffa300 : 0xff004d,
            )
            .setDepth(12);
          scene.tweens.add({ targets: fb, x: fb.x + f * 24, scale: 2, alpha: 0, duration: 220, onComplete: () => fb.destroy() });
        },
      });
      later(scene, 200, () => {
        follow.remove();
        ring(scene, p.x, p.y, 0xff004d, 4, 22, 240, 2);
        scene.tweens.add({ targets: dragon, alpha: 0, scale: 1.3, duration: 200, onComplete: () => dragon.destroy() });
      });
    },
  },
  gilgamesh: {
    name: 'VIMANA',
    desc: 'MELUNCUR DENGAN VIMANA, MENGHUJANI SENJATA',
    speed: 240,
    vy: -60,
    ms: 320,
    tint: 0xffec27,
    // The golden flying throne carries him forward while gates above rain spears on everything below.
    start: ({ p, world, scene, power }) => {
      const craft = [
        scene.add.ellipse(p.x, p.y + 9, 24, 5, 0xd4a017).setStrokeStyle(1, 0xffec27),
        scene.add.rectangle(p.x, p.y + 11, 10, 2, 0x29adff),
      ];
      craft.forEach((c) => c.setDepth(9));
      during(scene, 320, 16, () => {
        craft[0].setPosition(p.x, p.y + 9);
        craft[1].setPosition(p.x, p.y + 11);
      });
      later(scene, 340, () =>
        scene.tweens.add({ targets: craft, alpha: 0, duration: 200, onComplete: () => craft.forEach((c) => c.destroy()) }),
      );
      for (let i = 0; i < 3; i++) {
        const x = p.x + p.facing * (i * 14 - 8);
        p.gatePortal(x, p.y - 30, Math.atan2(240, p.facing * 60));
        world.shot({ x, y: p.y - 30, vx: p.facing * 60, vy: 240, texture: 'w_tombak', tint: 0xffec27, mult: 0.6 * power, source: 'skill' });
      }
    },
  },
  sukuna: {
    name: 'LANGKAH RAJA',
    desc: 'DASH MENEBAS, 2 TEBASAN KAI (LURUS & NAIK)',
    speed: 320,
    ms: 160,
    tint: 0xff004d,
    hit: { mult: 1, radius: 16, cut: 0xff004d },
    // The King walks through: a flick of the hand sends Kai ahead (and one angled up for flyers), cleaves
    // criss-cross the air he passed.
    start: ({ p, world, scene, power }) => {
      const fromX = p.x;
      const y = p.y;
      world.shot({ x: p.x, y: p.y, vx: p.facing * 320, vy: 0, texture: 'kai', mult: 0.9 * power, source: 'skill', pierce: true });
      world.shot({ x: p.x, y: p.y, vx: p.facing * 260, vy: -150, texture: 'kai', mult: 0.7 * power, source: 'skill', pierce: true });
      during(scene, 160, 30, () => afterimage(scene, p, p.x, p.y, 0.4, 0xff004d));
      later(scene, 160, () => {
        for (let i = 0; i < 4; i++) cutMark(scene, Phaser.Math.Linear(fromX, p.x, (i + 0.5) / 4), y, 0xff004d, 20, i % 2 ? 0.8 : -0.8);
      });
    },
  },
  gojo: {
    name: 'SHUNKAN IDO',
    desc: 'TELEPORTASI KE DEPAN, AO MENARIK MUSUH SEKITAR',
    speed: 0,
    ms: 100,
    tint: 0x29adff,
    // He is gone mid-step; a blue Ao implodes where he lands, space folding inward.
    start: ({ p, world, scene, power }) => {
      afterimage(scene, p, p.x, p.y, 0.6, 0x29adff);
      p.body.reset(Phaser.Math.Clamp(p.x + p.facing * 90, 8, W - 8), p.y);
      ring(scene, p.x, p.y, 0x29adff, 36, 2, 250, 2);
      ring(scene, p.x, p.y, 0xfff1e8, 24, 2, 200);
      const orb = scene.add.image(p.x, p.y, 'ao').setScale(0).setDepth(12);
      scene.tweens.add({ targets: orb, scale: 1.4, angle: 180, duration: 150, yoyo: true, onComplete: () => orb.destroy() });
      world.area(p.x, p.y, 36, 0.5 * power, -150, 'skill');
    },
  },
  toji: {
    name: 'LANGKAH SURGAWI',
    desc: 'DASH SUPER CEPAT, JEDA SANGAT PENDEK',
    speed: 440,
    ms: 130,
    cd: 0.6,
    tint: 0xfff1e8,
    hit: { mult: 0.6, radius: 12, cut: 0xc2c3c7 },
    // Pure physical speed: the floor cracks at the kick-off, a chain of afterimages, and a sonic ring behind him.
    start: ({ p, scene }) => {
      const f = p.facing;
      rocks(scene, p.x, FLOOR_Y - 2, 4);
      ring(scene, p.x - f * 4, p.y, 0xfff1e8, 2, 18, 180);
      during(scene, 130, 20, () => afterimage(scene, p, p.x, p.y, 0.35, 0x3a4232));
      for (let i = 0; i < 5; i++) {
        const l = scene.add.rectangle(p.x, p.y + Phaser.Math.Between(-7, 7), 16, 1, 0xfff1e8).setDepth(12);
        scene.tweens.add({ targets: l, x: l.x + f * 50, scaleX: 0.1, alpha: 0, duration: 180, onComplete: () => l.destroy() });
      }
    },
  },
  madara: {
    name: 'LIMBO HENGOKU',
    desc: 'BAYANGAN TAK TERLIHAT MENGHANTAM MUSUH SEKITAR',
    speed: 260,
    ms: 180,
    tint: 0x8a3fd1,
    hit: { mult: 0.5, radius: 16, cut: 0x8a3fd1 },
    // Limbo: his invisible shadow clones step out of the dark beside each nearby enemy and strike at once.
    start: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y, 0x8a3fd1, 6, 40, 300);
      for (const t of world.targets(p.x, p.y).filter((e) => Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < 40)) {
        const side = t.x >= p.x ? -1 : 1;
        const clone = scene.add
          .image(t.x + side * 10, t.y, p.texture.key)
          .setFlipX(side > 0)
          .setTint(0x1d0f2e)
          .setAlpha(0)
          .setDepth(11);
        scene.tweens.add({ targets: clone, alpha: 0.8, duration: 80, yoyo: true, hold: 120, onComplete: () => clone.destroy() });
        later(scene, 90, () => t.active && sparks(scene, t.x, t.y, [0x8a3fd1, 0x1d2b53], 6, 14));
      }
      world.area(p.x, p.y, 40, 0.7 * power, 120, 'skill');
    },
  },
  hashirama: {
    name: 'MOKU BUNSHIN',
    desc: 'MELESAT DI ATAS AKAR, KLON KAYU TERTINGGAL & MELEDAK JADI DURI',
    speed: 270,
    ms: 180,
    tint: 0xab5236,
    hit: { mult: 0.6, radius: 14, status: { freeze: 500 }, cut: 0x00e436 },
    // A wood clone takes his place while he surges ahead on roots bursting out of the ground; a moment later the clone
    // splits open into a burst of wooden stakes that bind everything around it.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      const clone = scene.add.image(x, y, p.texture.key).setFlipX(p.flipX).setTint(0xab5236).setDepth(9);
      later(scene, 350, () => {
        clone.destroy();
        thorns(scene, x, y, 0xab5236, 10, 22);
        sparks(scene, x, y, [0x00e436, 0x008751], 10, 18);
        world.area(x, y, 24, 0.7 * power, 80, 'skill', { freeze: 900 });
        scene.cameras.main.shake(80, 0.006);
      });
      during(scene, 180, 30, () => {
        const root = scene.add
          .rectangle(p.x + Phaser.Math.Between(-4, 4), FLOOR_Y, 3, Phaser.Math.Between(8, 16), 0xab5236)
          .setOrigin(0.5, 1)
          .setScale(1, 0)
          .setDepth(9);
        scene.tweens.add({ targets: root, scaleY: 1, duration: 90, yoyo: true, hold: 250, onComplete: () => root.destroy() });
        const leaf = scene.add.rectangle(root.x, FLOOR_Y - root.height, 2, 1, 0x00e436).setDepth(10);
        scene.tweens.add({
          targets: leaf,
          x: leaf.x - p.facing * 8,
          y: leaf.y + 10,
          angle: 300,
          alpha: 0,
          duration: 600,
          onComplete: () => leaf.destroy(),
        });
      });
    },
  },
  itachi: {
    name: 'BUNSHIN GAGAK',
    desc: 'PECAH JADI KAWANAN GAGAK YANG MENYERANG, MUNCUL DI DEPAN',
    speed: 0,
    ms: 110,
    tint: 0x7e2553,
    // Crow clone: Itachi bursts into a flock that pecks everything around him, flies ahead, and he reforms there.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      const tx = Phaser.Math.Clamp(x + p.facing * 80, 8, W - 8);
      world.area(x, y, 26, 0.6 * power, 100, 'skill');
      p.ghost(0x000000);
      p.body.reset(tx, y);
      for (let i = 0; i < 10; i++) {
        const crow = scene.add
          .image(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-8, 6), 'gagak0')
          .setFlipX(p.facing < 0)
          .setScale(1.5)
          .setDepth(12);
        const flap = () => crow.setTexture(Math.floor(scene.time.now / 80 + i) % 2 ? 'gagak1' : 'gagak0');
        // Arc to the new spot, then scatter up and fade.
        scene.tweens.add({
          targets: crow,
          x: tx + Phaser.Math.Between(-8, 8),
          y: y - Phaser.Math.Between(4, 20),
          duration: 180 + i * 12,
          ease: 'Sine.Out',
          onUpdate: flap,
          onComplete: () =>
            scene.tweens.add({
              targets: crow,
              x: crow.x + Phaser.Math.Between(-30, 30),
              y: crow.y - Phaser.Math.Between(20, 40),
              alpha: 0,
              duration: 350,
              onUpdate: flap,
              onComplete: () => crow.destroy(),
            }),
        });
      }
      scene.time.delayedCall(200, () => world.area(tx, y, 22, 0.4 * power, 60, 'skill'));
    },
  },
  jackFrost: {
    name: 'ANGIN, BAWA AKU!',
    desc: 'ANGIN MENERBANGKAN KE ATAS, LEDAKAN ES DI BAWAH',
    speed: 220,
    vy: -300,
    ms: 250,
    gravity: true,
    tint: 0xc2f0ff,
    // The Wind lifts him in a swirl of snow; frost bursts where he stood and ice spikes crack up from the ground.
    start: ({ p, world, scene, power }) => {
      world.area(p.x, p.y + 4, 20, 0.4 * power, 60, 'skill', { freeze: 600 });
      ring(scene, p.x, p.y + 4, 0xc2f0ff, 3, 22, 260, 2);
      for (const dx of [-10, 0, 10]) {
        const spike = scene.add
          .triangle(p.x + dx, FLOOR_Y, 0, 0, 3, -9, 6, 0, 0xc2f0ff)
          .setOrigin(0.5, 1)
          .setScale(1, 0)
          .setDepth(9);
        scene.tweens.add({ targets: spike, scaleY: 1, duration: 100, yoyo: true, hold: 300, onComplete: () => spike.destroy() });
      }
      during(scene, 250, 25, (i) => {
        const a = i * 1.2;
        const flake = scene.add.rectangle(p.x + Math.cos(a) * 8, p.y + 6 + Math.sin(a) * 3, 1, 1, 0xfff1e8).setDepth(12);
        scene.tweens.add({
          targets: flake,
          y: flake.y + 10,
          x: flake.x - p.facing * 6,
          alpha: 0,
          duration: 400,
          onComplete: () => flake.destroy(),
        });
      });
    },
  },
  naruto: {
    name: 'RASENGAN TERJANG',
    desc: 'MENERJANG DENGAN RASENGAN DI TANGAN, MENGGILING SEMUA YANG DITABRAK',
    speed: 320,
    ms: 200,
    tint: 0x29adff,
    hit: { mult: 0.9, radius: 16, cut: 0x29adff },
    // A Rasengan spins up in his palm in a blink and he charges with it held out in front, grinding through whatever
    // he runs into; it bursts in a ring of wind as he stops.
    start: ({ p, scene }) => {
      const f = p.facing;
      const g = scene.add.graphics().setDepth(12);
      g.fillStyle(0x29adff, 0.6).fillCircle(0, 0, 7);
      g.lineStyle(1, 0xc2f0ff).beginPath().arc(0, 0, 5, 0, 4).strokePath();
      g.fillStyle(0xfff1e8).fillCircle(0, 0, 2);
      const follow = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          g.setPosition(p.x + f * 9, p.y).setRotation(g.rotation + 0.6);
          if (Math.random() < 0.5) {
            const s = scene.add.rectangle(p.x + f * 9, p.y + Phaser.Math.Between(-6, 6), 4, 1, 0xc2f0ff).setDepth(11);
            scene.tweens.add({ targets: s, x: s.x - f * 14, alpha: 0, duration: 160, onComplete: () => s.destroy() });
          }
        },
      });
      later(scene, 200, () => {
        follow.remove();
        ring(scene, g.x, g.y, 0x29adff, 4, 22, 240, 2);
        sparks(scene, g.x, g.y, [0x29adff, 0xc2f0ff], 8, 16);
        g.destroy();
      });
    },
  },
  sasuke: {
    name: 'AMENOTEJIKARA',
    desc: 'RINNEGAN: BERTUKAR TEMPAT DENGAN BATU DI DEPAN, CHIDORI TERTINGGAL',
    speed: 0,
    ms: 90,
    tint: 0x8a3fd1,
    // Amenotejikara: the Rinnegan ripples and he swaps places with a pebble ahead; the pebble drops where he stood, with
    // the Chidori he held still crackling there.
    start: ({ p, world, scene, power }) => {
      const fromX = p.x;
      const y = p.y;
      const toX = Phaser.Math.Clamp(p.x + p.facing * 100, 8, W - 8);
      for (const x of [fromX, toX]) for (let k = 0; k < 3; k++) later(scene, k * 60, () => ring(scene, x, y, 0x8a3fd1, 2, 14, 240));
      p.body.reset(toX, y);
      const pebble = scene.add.rectangle(fromX, y, 3, 2, 0x5f574f).setDepth(9);
      scene.tweens.add({ targets: pebble, y: FLOOR_Y - 1, duration: 300, ease: 'Quad.In' });
      scene.tweens.add({ targets: pebble, alpha: 0, delay: 900, duration: 200, onComplete: () => pebble.destroy() });
      sparks(scene, fromX, y, [0x29adff, 0xfff1e8], 10, 20);
      world.area(fromX, y, 20, 0.6 * power, 60, 'skill', { freeze: 300 });
    },
  },
  gravityMaster: {
    name: 'INVERSI GRAVITASI',
    desc: 'MELAYANG TANPA BOBOT, SUMUR GRAVITASI MENARIK MUSUH KE TITIK AWAL',
    speed: 260,
    vy: -130,
    ms: 230,
    tint: 0x8a3fd1,
    hit: { mult: 0.6, radius: 16, status: { slow: 800 }, cut: 0xc080ff },
    // He flips his own gravity and glides off weightless; pebbles fall upward around him, and a small gravity well
    // left where he stood drags nearby enemies in and crushes them.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      const well = scene.add.circle(x, y, 6, 0x000000).setStrokeStyle(1, 0xc080ff).setDepth(12);
      scene.tweens.add({ targets: well, scale: 0, delay: 450, duration: 150, onComplete: () => well.destroy() });
      for (let k = 0; k < 3; k++) later(scene, k * 120, () => ring(scene, x, y, 0x8a3fd1, 40, 4, 260));
      for (const k of [0, 1, 2]) later(scene, k * 150, () => world.pull(x, y, 50, 180));
      later(scene, 450, () => world.area(x, y, 20, 0.5 * power, 40, 'skill', { slow: 1000 }));
      during(scene, 230, 25, () => {
        const r = scene.add.rectangle(p.x + Phaser.Math.Between(-8, 8), FLOOR_Y - 1, 1, 2, 0xc080ff).setDepth(9);
        scene.tweens.add({
          targets: r,
          y: r.y - Phaser.Math.Between(20, 40),
          alpha: 0,
          duration: 500,
          ease: 'Quad.In',
          onComplete: () => r.destroy(),
        });
        const halo = scene.add.ellipse(p.x, p.y, 18, 5).setStrokeStyle(1, 0x8a3fd1).setDepth(10);
        scene.tweens.add({ targets: halo, scale: 1.6, alpha: 0, duration: 250, onComplete: () => halo.destroy() });
      });
    },
  },
  lightningLord: {
    name: 'LANGKAH KILAT',
    desc: 'MENJADI KILAT: MELESAT RENDAH, JEJAK PETIR MENYETRUM MUSUH DI JALUR',
    speed: 560,
    ms: 130,
    cd: 0.9,
    tint: 0xffec27,
    hit: { mult: 0.6, radius: 14, status: { freeze: 300 }, cut: 0xffec27 },
    // He becomes the lightning: a thunderclap where he stood, then he is simply further on, a gold bolt laid along the
    // ground behind him. The path stays charged for a heartbeat and zaps whatever is still standing on it.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      ring(scene, x, y, 0xffec27, 4, 22, 220, 2);
      sparks(scene, x, y, [0xffec27, 0x7fe6ff, 0xfff1e8], 8, 14);
      glint(scene, x, y - 4);
      later(scene, 130, () => {
        const [ex, ey] = [p.x, p.y];
        stormArc(scene, x, y + 2, ex, ey + 2, 420, 2, 3);
        const lo = Math.min(x, ex);
        const hi = Math.max(x, ex);
        later(scene, 160, () => {
          for (const t of world.targets(ex, ey)) {
            if (t.x < lo - 6 || t.x > hi + 6 || Math.abs(t.y - y) > 18) continue;
            sparks(scene, t.x, t.y, [0xffec27, 0x7fe6ff], 5, 10);
            world.strike(t, 0.3 * power, 'skill', false, { freeze: 250 });
          }
        });
      });
    },
  },
  nephalem: {
    name: 'BELAH SENJA',
    desc: 'TERBELAH JADI CAHAYA & API YANG MENYILANG, LALU BERSATU LAGI DENGAN TEBASAN SILANG',
    speed: 340,
    ms: 200,
    tint: 0xc080ff,
    // He splits in two: his angel half arcs ahead high in a trail of gold light, his demon half low in a trail of
    // hellfire. Where they meet again, he is whole, and the two trails close on that spot as a gold-and-crimson cross.
    start: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x0 = p.x;
      const y0 = p.y;
      const x1 = Phaser.Math.Clamp(x0 + f * 68, 8, W - 8);
      const trail = scene.add.graphics().setDepth(11);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 200,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const x = x0 + (x1 - x0) * v;
          const off = Math.sin(v * Math.PI) * 16;
          trail.fillStyle(HOLY).fillRect(x, y0 - off, 2, 2);
          trail.fillStyle(HELL).fillRect(x, y0 + off * 0.6, 2, 2);
        },
      });
      scene.tweens.add({ targets: trail, alpha: 0, delay: 260, duration: 240, onComplete: () => trail.destroy() });
      later(scene, 200, () => {
        const { x, y } = p;
        bladeLine(scene, x - 12, y - 12, x + 12, y + 12, HOLY, 80);
        bladeLine(scene, x - 12, y + 12, x + 12, y - 12, HELL, 80);
        feathers(scene, x, y - 6, 3, 10, 12);
        world.area(x, y, 26, 1 * power, 140, 'skill', { burn: 0.1, slow: 500 });
      });
    },
  },
  lumina: {
    name: 'LANGKAH FOTON',
    desc: 'MELESAT SECEPAT CAHAYA, BAYANGAN PELANGI TERTINGGAL, MUSUH DI JALUR TERSILAU',
    speed: 620,
    ms: 140,
    cd: 0.9,
    tint: 0xfff1e8,
    hit: { mult: 0.7, radius: 14, status: { freeze: 250 }, cut: 0xc2f0ff },
    // She becomes light: a flash where she stood, then a chain of afterimages that runs through the spectrum, red to
    // violet, as she crosses the arena, and a spark where she stops.
    start: ({ p, scene }) => {
      glint(scene, p.x, p.y - 4);
      ring(scene, p.x, p.y, 0xfff1e8, 2, 16, 180, 1);
      during(scene, 140, 20, (i) => afterimage(scene, p, p.x, p.y, 0.55, SPECTRUM[i % SPECTRUM.length]));
      later(scene, 140, () => sparks(scene, p.x, p.y, [0xfff1e8, 0x7fe6ff, 0xffec27], 6, 10));
    },
  },
  surya: {
    name: 'LANGKAH FAJAR',
    desc: 'MENERJANG SEPERTI KOMET, JALUR API MEMBARA DI BELAKANG',
    speed: 400,
    ms: 150,
    cd: 0.9,
    tint: 0xffa300,
    hit: { mult: 0.8, radius: 16, status: { burn: 0.15 }, cut: 0xffa300 },
    // He charges as a comet: a flash of dawn at the kick-off, afterimages in sun-orange, and tongues of flame left
    // burning along the path he crossed.
    start: ({ p, scene }) => {
      glint(scene, p.x, p.y - 4);
      ring(scene, p.x, p.y, 0xffec27, 2, 18, 200, 2);
      during(scene, 150, 25, (i) => {
        afterimage(scene, p, p.x, p.y, 0.5, i % 2 ? 0xffa300 : 0xffec27);
        flameTongue(scene, p.x, p.y + 6, 11, 450, FIRE);
      });
      later(scene, 150, () => sparks(scene, p.x, p.y, [0xffec27, 0xffa300, 0xff004d], 8, 14));
    },
  },
  candra: {
    name: 'LOMPATAN BULAN',
    desc: 'LOMPATAN MELENGKUNG SEPERTI DI BULAN, JALUR PERAK MEMPERLAMBAT MUSUH',
    speed: 230,
    vy: -270,
    gravity: true,
    ms: 380,
    tint: 0x9fb4ff,
    hit: { mult: 0.7, radius: 16, status: { slow: 700 }, cut: 0xc2d4ff },
    // Gravity lets go of him: he arcs over the field in one slow, high bound like a man on the moon, and the arc he
    // draws hangs behind him as a silver crescent of light; where he comes down, a ring of moonlight spreads.
    start: ({ p, scene }) => {
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(p.x, p.y)];
      const arc = scene.add.graphics().setDepth(11);
      during(scene, 380, 30, () => {
        pts.push(new Phaser.Math.Vector2(p.x, p.y));
        arc.clear();
        arc.lineStyle(5, 0x9fb4ff, 0.3).strokePoints(pts);
        arc.lineStyle(2, 0xc2d4ff, 0.8).strokePoints(pts);
        arc.lineStyle(1, 0xfff1e8).strokePoints(pts);
        if (pts.length % 3 === 0) sparks(scene, p.x, p.y, [0xfff1e8, 0x9fb4ff], 2, 8);
      });
      scene.tweens.add({ targets: arc, alpha: 0, delay: 380, duration: 400, onComplete: () => arc.destroy() });
      later(scene, 380, () => {
        ring(scene, p.x, p.y + 6, 0xc2d4ff, 4, 28, 320, 1);
        glint(scene, p.x, p.y - 4);
      });
    },
  },
  darkLord: {
    name: 'JUBAH MALAM',
    desc: 'LENYAP KE DALAM JUBAH YANG TERBANG MAJU; MUSUH DI JALURNYA DITELAN & MELAMBAT',
    speed: 300,
    ms: 200,
    tint: 0x2b2238,
    hit: { mult: 0.8, radius: 14, status: { slow: 700 }, cut: SOUL[1] },
    // He sweeps his cloak shut around himself and is gone: only the cloak flies on, a black manta with a crimson
    // lining and two green eyes in its folds, trailing dark smoke and embers of soul fire. Where it stops it opens
    // wide like wings, and he steps out of it.
    start: ({ p, scene }) => {
      const f = p.facing;
      const t0 = scene.time.now;
      const g = scene.add.graphics().setDepth(11);
      ring(scene, p.x, p.y, SOUL[1], 2, 14, 180, 1);
      const draw = () => {
        if (!p.active) return;
        // Hidden inside it (Player.update shows him again each frame, so this runs after it).
        p.setAlpha(0);
        p.held.setAlpha(0);
        const k = Phaser.Math.Clamp((scene.time.now - t0) / 200, 0, 1);
        const flap = Math.sin(k * Math.PI * 5) * 3;
        const [x, y] = [p.x, p.y];
        const P = (dx: number, dy: number) => new Phaser.Math.Vector2(x + f * dx, y + dy);
        const Q = (dx: number, dy: number): [number, number] => [x + f * dx, y + dy];
        const body = [P(9, -1), P(1, -9 - flap), P(-6, -6), P(-13, -1 + flap * 0.3), P(-6, 4), P(1, 7 + flap)];
        g.clear();
        g.fillStyle(0x000000).fillPoints(
          body.map((v) => new Phaser.Math.Vector2(x + (v.x - x) * 1.12, y + (v.y - y) * 1.15)),
          true,
        );
        g.fillStyle(0x2b2238).fillPoints(body, true);
        g.fillStyle(0xb3122e).fillTriangle(...Q(1, 7 + flap), ...Q(-6, 4), ...Q(3, 3));
        g.lineStyle(1, 0x4a3d5c).lineBetween(...Q(9, -1), ...Q(1, -9 - flap));
        g.fillStyle(SOUL[1])
          .fillRect(x + f * 3, y - 2, 1, 1)
          .fillRect(x + f * 6, y - 2, 1, 1);
      };
      scene.events.on('postupdate', draw);
      during(scene, 200, 30, (i) => {
        puff(scene, p.x - f * 10, p.y + Phaser.Math.Between(-3, 3), 0x1a1424, 3, 4, 380);
        if (i % 2) puff(scene, p.x - f * 8, p.y, SOUL[1], 1, 6, 300);
      });
      later(scene, 200, () => {
        scene.events.off('postupdate', draw);
        g.destroy();
        if (!p.active) return;
        // The cloak opens like wings, and he is there.
        const open = scene.add.graphics().setPosition(p.x, p.y).setDepth(11);
        for (const s of [-1, 1]) {
          open.fillStyle(0x000000).fillTriangle(0, -8, s * 18, -12, s * 12, 8);
          open.fillStyle(0x2b2238).fillTriangle(0, -7, s * 16, -11, s * 11, 7);
          open.fillStyle(0xb3122e).fillTriangle(0, -4, s * 10, -6, s * 8, 5);
        }
        scene.tweens.add({ targets: open, scaleX: 1.6, scaleY: 0.4, alpha: 0, duration: 260, onComplete: () => open.destroy() });
        ring(scene, p.x, p.y, SOUL[1], 3, 20, 240, 1);
        sparks(scene, p.x, p.y, [SOUL[1], SOUL[2], 0xb3122e], 8, 14);
      });
    },
  },
  lightLord: {
    name: 'TANGGA CAHAYA',
    desc: 'BERLARI NAIK DI ATAS ANAK TANGGA CAHAYA KE UDARA, MENYILAUKAN YANG DILEWATI',
    speed: 250,
    vy: -230,
    ms: 230,
    tint: 0xffe9a8,
    hit: { mult: 0.8, radius: 14, status: { freeze: 300 }, cut: 0xffec27 },
    // He runs up into the air on a stair of light: under each stride a step of gold appears beneath his feet, lit on its
    // tread, and stays a moment after he has passed, so the stair he climbed hangs in the air behind him, fading step by
    // step from the bottom.
    start: ({ p, scene }) => {
      glint(scene, p.x, p.y + 6);
      during(scene, 230, 38, (i) => {
        const step = scene.add
          .graphics()
          .setPosition(p.x, p.y + 8)
          .setDepth(9);
        step.fillStyle(RADIANT.ivory, 0.3).fillRect(-6, -1, 12, 5);
        step.fillStyle(RADIANT.deep).fillRect(-5, 0, 10, 3);
        step.fillStyle(RADIANT.gold).fillRect(-5, 0, 10, 1);
        step.fillStyle(RADIANT.white).fillRect(-4, 0, 3, 1);
        step.setScale(0.3, 1);
        scene.tweens.add({ targets: step, scaleX: 1, duration: 80, ease: 'Back.Out' });
        scene.tweens.add({ targets: step, alpha: 0, delay: 320 + i * 40, duration: 260, onComplete: () => step.destroy() });
        sparks(scene, p.x, p.y + 8, [RADIANT.gold, RADIANT.white], 2, 6);
      });
      later(scene, 230, () => ring(scene, p.x, p.y, RADIANT.gold, 2, 16, 200, 1));
    },
  },
  obito: {
    name: 'LOMPATAN KAMUI',
    desc: 'TERSEDOT KE PUSARAN MATANYA, MUNCUL DARI PUSARAN DI DEPAN; PUSARAN ASAL MEMELINTIR MUSUH',
    speed: 0,
    ms: 160,
    tint: KAMUI.mid,
    // Kamui warp: Obito's body twists into the swirl of his own mask and is gone, and he steps out of a warp ahead. The
    // warp he left behind stays open a moment, dragging what is near into its eye, then closes on it and wrings it.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      const f = p.facing;
      const tx = Phaser.Math.Clamp(x + f * 84, 8, W - 8);
      const pic = scene.add.image(x, y, p.texture.key).setFlipX(p.flipX).setDepth(12);
      scene.tweens.add({ targets: pic, angle: f * 360, scale: 0, duration: 200, ease: 'Quad.In', onComplete: () => pic.destroy() });
      p.body.reset(tx, y);
      const g = scene.add.graphics().setDepth(12);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 560,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          g.clear();
          kamuiSwirl(g, x, y, 14 * Math.sin(Math.min(1, k * 1.15) * Math.PI), k * 16);
          if (k < 0.45) kamuiSwirl(g, tx, y, 11 * Math.sin((k / 0.45) * Math.PI), -k * 20, 0.9);
        },
        onComplete: () => g.destroy(),
      });
      world.pull(x, y, 36, 90);
      later(scene, 430, () => {
        world.area(x, y, 26, 0.8 * power, 0, 'skill', { slow: 600 });
        sparks(scene, x, y, [KAMUI.pale, KAMUI.mid, KAMUI.mask], 8, 14);
      });
    },
  },
  pain: {
    name: 'JALAN HEWAN',
    desc: 'BURUNG PANGGILAN BERMATA RINNEGAN MENYAMBAR & MEMBAWANYA MELAYANG KE DEPAN',
    speed: 270,
    vy: -150,
    ms: 280,
    tint: RIKUDO.lilac,
    hit: { mult: 0.8, radius: 14, cut: RIKUDO.lilac },
    // Animal Path: a summoning cloud bursts under him and a giant bird with the Rinnegan for eyes swoops in beneath his
    // feet and carries him off, wings beating, its beak tearing what it passes; when the dash ends he steps off and
    // it wheels away up into the sky.
    start: ({ p, scene }) => {
      for (let i = 0; i < 8; i++) puff(scene, p.x + Phaser.Math.Between(-8, 8), p.y + 6 + Phaser.Math.Between(-3, 3), 0xfff1e8, 4, 4, 380);
      const f = p.facing;
      const g = scene.add.graphics().setDepth(9.5);
      let [bx, by] = [p.x, p.y + 9];
      scene.tweens.addCounter({
        from: 0,
        to: 880,
        duration: 880,
        onUpdate: (tw) => {
          const ms = tw.getValue() ?? 0;
          g.clear();
          if (ms < 280 && p.active) [bx, by] = [p.x, p.y + 9];
          else [bx, by] = [bx + f * 2.4, by - 1.5];
          summonBird(g, bx, by, f, (Math.sin(scene.time.now / 45) + 1) / 2);
          g.setAlpha(ms > 700 ? 1 - (ms - 700) / 180 : 1);
        },
        onComplete: () => g.destroy(),
      });
    },
  },
};
