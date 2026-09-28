import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark, floatText } from '../gfx/ui.ts';
import type { ClassId } from '../logic/classes.ts';
import type { Status } from '../logic/loot.ts';
import { afterimage, bladeLine, explosion, glint, ring, rocks, sparks, thorns, type SkillCtx } from './skills.ts';

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
    start: ({ p, world, scene, power }) => {
      const f = p.facing;
      const flare = scene.add.circle(p.x, p.y, 6, 0x29adff, 0.5).setStrokeStyle(2, 0xc2f0ff).setDepth(12);
      scene.tweens.add({ targets: flare, radius: 26, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
      ring(scene, p.x - f * 4, p.y, 0xc2f0ff, 4, 20, 220, 2);
      world.area(p.x, p.y, 18, 0.5 * power, 150, 'skill');
      during(scene, 170, 25, () => {
        for (const dy of [-3, 3]) {
          const jet = scene.add.rectangle(p.x - f * 6, p.y + dy, 6, 2, 0x29adff).setDepth(11);
          scene.tweens.add({ targets: jet, x: jet.x - f * 14, scaleX: 0.2, alpha: 0, duration: 180, onComplete: () => jet.destroy() });
        }
      });
    },
  },
  pembunuh: {
    name: 'KABUT AZRAEL',
    desc: 'MUNCUL DI BELAKANG MUSUH, TEBASAN KRITIS',
    speed: 0,
    ms: 120,
    tint: 0x7e2553,
    // He dissolves into black smoke and re-forms behind the enemy; blue flame flickers in the cut.
    start: ({ p, world, scene, power }) => {
      for (let i = 0; i < 6; i++) puff(scene, p.x + Phaser.Math.Between(-5, 5), p.y + Phaser.Math.Between(-6, 6), 0x3b3b4f, 3, 10, 500);
      const t = world.targets(p.x, p.y).find((e) => Math.abs(e.x - p.x) < 130 && Math.abs(e.y - p.y) < 50);
      if (!t) return void p.setVelocityX(p.facing * 300);
      p.ghost(0x7e2553);
      const side = t.x >= p.x ? 1 : -1;
      p.body.reset(Phaser.Math.Clamp(t.x + side * 12, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
      p.facing = -side;
      for (let i = 0; i < 6; i++) puff(scene, p.x + Phaser.Math.Between(-5, 5), p.y + Phaser.Math.Between(-6, 6), 0x3b3b4f, 3, 10, 500);
      cutMark(scene, t.x, t.y, 0x29adff, 28, 0.9);
      sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 8, 16);
      world.strike(t, 1 * power, 'skill', true);
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
    name: 'KEDIP ARKANA',
    desc: 'TELEPORT KE DEPAN, LEDAKAN DI TEMPAT ASAL',
    speed: 0,
    ms: 100,
    tint: 0xff77a8,
    // A magic circle opens under her and blows up as she blinks out; she reappears in a burst of stars.
    start: ({ p, world, scene, power }) => {
      const circle = [
        scene.add.circle(p.x, p.y, 14).setStrokeStyle(1, 0xff77a8),
        scene.add.star(p.x, p.y, 6, 6, 13).setStrokeStyle(1, 0x83769c),
      ];
      circle.forEach((c) => c.setDepth(9));
      scene.tweens.add({
        targets: circle,
        angle: 120,
        scale: 1.8,
        alpha: 0,
        duration: 350,
        onComplete: () => circle.forEach((c) => c.destroy()),
      });
      world.area(p.x, p.y, 22, 0.8 * power, 120, 'skill');
      sparks(scene, p.x, p.y, [0xff77a8, 0x83769c], 10, 24);
      p.ghost(0xff77a8);
      p.body.reset(Phaser.Math.Clamp(p.x + p.facing * 80, 8, W - 8), p.y);
      const star = scene.add.star(p.x, p.y, 5, 3, 9, 0xffec27).setDepth(13);
      scene.tweens.add({ targets: star, angle: 144, scale: 0, duration: 300, onComplete: () => star.destroy() });
      sparks(scene, p.x, p.y, [0xffec27, 0xff77a8], 8, 16);
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
    hit: { mult: 0.5, radius: 12, cut: 0xc2f0ff },
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
    name: 'LANGKAH API',
    desc: 'DASH MEMBAKAR, JEJAK API DI TANAH',
    speed: 260,
    ms: 200,
    tint: 0xffa300,
    hit: { mult: 0.4, radius: 14, status: { burn: 0.2 }, cut: 0xffa300 },
    // Every step leaves a flame on the ground that flickers a moment and scorches whoever stands in it.
    start: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y, 0xffa300, 3, 16, 200);
      during(scene, 200, 40, () => {
        const x = p.x;
        const y = p.y + 4;
        for (let k = 0; k < 3; k++)
          later(scene, k * 120, () => puff(scene, x + Phaser.Math.Between(-3, 3), y, k % 2 ? 0xffa300 : 0xff004d, 2, 10, 350));
        later(scene, 200, () => world.area(x, y, 10, 0.15 * power, 0, 'skill', { burn: 0.1 }));
      });
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
    name: 'LANGKAH KEGELAPAN',
    desc: 'DASH GELAP MENEBAS YANG DILEWATI',
    speed: 300,
    ms: 160,
    tint: 0x7e2553,
    hit: { mult: 0.7, radius: 14, cut: 0x8a3fd1 },
    // He bursts out of a pool of darkness and a violet crescent tears along with him.
    start: ({ p, scene }) => {
      const pool = scene.add.ellipse(p.x, p.y + 7, 24, 5, 0x000000, 0.8).setDepth(8);
      scene.tweens.add({ targets: pool, scaleX: 1.6, alpha: 0, duration: 400, onComplete: () => pool.destroy() });
      for (let i = 0; i < 5; i++) puff(scene, p.x + Phaser.Math.Between(-6, 6), p.y + 4, 0x7e2553, 2, 12, 450);
      const arc = scene.add
        .image(p.x, p.y, 'slashMoon')
        .setTint(0x8a3fd1)
        .setScale(p.facing * 1.6, 1.6)
        .setDepth(12);
      during(scene, 160, 16, () => arc.setPosition(p.x + p.facing * 10, p.y));
      later(scene, 170, () => scene.tweens.add({ targets: arc, alpha: 0, duration: 150, onComplete: () => arc.destroy() }));
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
    name: 'SAYAP NAGA',
    desc: 'KEPAKAN SAYAP KE ATAS, SEMBURAN API DI KAKI',
    speed: 200,
    vy: -240,
    ms: 200,
    gravity: true,
    tint: 0xff004d,
    // Crimson wings snap open for one beat, and a gout of dragonfire bursts beneath him.
    start: ({ p, world, scene, power }) => {
      const wings = [-1, 1].map((s) =>
        scene.add
          .triangle(p.x + s * 5, p.y - 2, 0, 0, s * 14, -10, s * 10, 6, 0xb3122e)
          .setOrigin(0, 0)
          .setDepth(9),
      );
      scene.tweens.add({
        targets: wings,
        scaleY: { from: 1, to: 0.2 },
        alpha: 0,
        duration: 300,
        onUpdate: () => wings.forEach((w, k) => w.setPosition(p.x + (k ? 5 : -5), p.y - 2)),
        onComplete: () => wings.forEach((w) => w.destroy()),
      });
      for (let i = 0; i < 8; i++) puff(scene, p.x + Phaser.Math.Between(-8, 8), p.y + 8, i % 2 ? 0xffa300 : 0xff004d, 3, -4, 350);
      world.area(p.x, p.y + 6, 22, 0.6 * power, 120, 'skill', { burn: 0.2 });
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
    desc: 'DASH MENEBAS, MELEPAS TEBASAN KAI',
    speed: 320,
    ms: 160,
    tint: 0xff004d,
    hit: { mult: 0.7, radius: 14, cut: 0xff004d },
    // The King walks through: a flick of the hand sends Kai ahead, cleaves criss-cross the air he passed.
    start: ({ p, world, scene, power }) => {
      const fromX = p.x;
      const y = p.y;
      world.shot({ x: p.x, y: p.y, vx: p.facing * 280, vy: 0, texture: 'kai', mult: 0.6 * power, source: 'skill', pierce: true });
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
    name: 'TUNAS KAYU',
    desc: 'MELESAT, AKAR MENCUAT & MENGIKAT YANG DILEWATI',
    speed: 250,
    ms: 180,
    tint: 0xab5236,
    hit: { mult: 0.6, radius: 14, status: { freeze: 500 }, cut: 0x00e436 },
    // Roots burst out of the ground along his path, leaves scattering off their tips, then sink back.
    start: ({ p, scene }) => {
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
    name: 'KAGE BUNSHIN',
    desc: 'KLON MELEMPAR KE DEPAN, LALU MENINJU MUSUH TERDEKAT',
    speed: 320,
    ms: 170,
    tint: 0xffa300,
    hit: { mult: 0.6, radius: 14, cut: 0xffa300 },
    // POF: a shadow clone appears in a puff of smoke and flings him forward, then charges the nearest enemy and bursts.
    start: ({ p, world, scene, power }) => {
      const { x, y } = p;
      for (let i = 0; i < 6; i++) puff(scene, x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-6, 6), 0xc2c3c7, 3, 6, 400);
      floatText(scene, x, y - 16, 'POF', '#c2c3c7');
      const clone = scene.add.image(x, y, p.texture.key).setFlipX(p.flipX).setDepth(9);
      const t = world.targets(x, y).find((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < 90);
      const burstClone = () => {
        for (let i = 0; i < 5; i++)
          puff(scene, clone.x + Phaser.Math.Between(-5, 5), clone.y + Phaser.Math.Between(-5, 5), 0xc2c3c7, 3, 6, 400);
        clone.destroy();
      };
      if (!t) return void later(scene, 250, burstClone);
      scene.tweens.add({
        targets: clone,
        x: t.x - Math.sign(t.x - x) * 8,
        y: t.y,
        duration: 160,
        onComplete: () => {
          if (t.active) {
            world.strike(t, 0.8 * power, 'skill', false);
            sparks(scene, t.x, t.y, [0xffa300, 0xffec27], 6, 12);
          }
          burstClone();
        },
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
};
