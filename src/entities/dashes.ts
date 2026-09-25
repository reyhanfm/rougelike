import Phaser from 'phaser';
import { FLOOR_Y, W } from '../gfx/ui.ts';
import type { ClassId } from '../logic/classes.ts';
import type { Status } from '../logic/loot.ts';
import type { SkillCtx } from './skills.ts';

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
  /** Hits each enemy touched during the dash once (mult on the damage stat, times dashPower). */
  hit?: { mult: number; radius: number; crit?: boolean; status?: Status; heal?: number };
  start?(c: SkillCtx): void;
}

export const DASHES: Record<ClassId, DashStyle> = {
  ksatria: {
    name: 'MANA BURST',
    desc: 'LEDAKAN PRANA BIRU MELONTARKAN KE DEPAN, MENEBAS',
    speed: 340,
    ms: 170,
    tint: 0x29adff,
    hit: { mult: 0.9, radius: 14 },
    start: ({ p, world, scene, power }) => {
      const flare = scene.add.circle(p.x, p.y, 6, 0x29adff, 0.5).setStrokeStyle(2, 0xc2f0ff).setDepth(12);
      scene.tweens.add({ targets: flare, radius: 26, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
      world.area(p.x, p.y, 18, 0.5 * power, 150, 'skill');
    },
  },
  pembunuh: {
    name: 'KABUT AZRAEL',
    desc: 'MUNCUL DI BELAKANG MUSUH, TEBASAN KRITIS',
    speed: 0,
    ms: 120,
    tint: 0x7e2553,
    start: ({ p, world, power }) => {
      const t = world.targets(p.x, p.y).find((e) => Math.abs(e.x - p.x) < 130 && Math.abs(e.y - p.y) < 50);
      if (!t) return void p.setVelocityX(p.facing * 300);
      p.ghost(0x7e2553);
      const side = t.x >= p.x ? 1 : -1;
      p.body.reset(Phaser.Math.Clamp(t.x + side * 12, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
      p.facing = -side;
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
    start: ({ p, world, scene, power }) =>
      p.onLand(() => {
        world.area(p.x, p.y + 4, 24, 0.8 * power, 150, 'skill');
        scene.cameras.main.shake(80, 0.008);
      }),
  },
  berserker: {
    name: 'TERJANG RAKSASA',
    desc: 'TERJANGAN PANJANG, HANTAMAN BERAT',
    speed: 240,
    ms: 320,
    cd: 1.2,
    tint: 0xff004d,
    hit: { mult: 1.3, radius: 14 },
  },
  pemburu: {
    name: 'LOMPAT MUNDUR',
    desc: 'SALTO KE BELAKANG SAMBIL MEMANAH',
    speed: -220,
    vy: -200,
    ms: 200,
    gravity: true,
    tint: 0xff004d,
    start: ({ p, world, power }) => {
      for (const a of [-0.1, 0, 0.1]) {
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 260 * p.facing,
          vy: Math.sin(a) * 260,
          texture: 'arrow',
          mult: 0.7 * power,
          source: 'skill',
        });
      }
    },
  },
  magicArcher: {
    name: 'KEDIP ARKANA',
    desc: 'TELEPORT KE DEPAN, LEDAKAN DI TEMPAT ASAL',
    speed: 0,
    ms: 100,
    tint: 0xff77a8,
    start: ({ p, world, power }) => {
      world.area(p.x, p.y, 22, 0.8 * power, 120, 'skill');
      p.ghost(0xff77a8);
      p.body.reset(Phaser.Math.Clamp(p.x + p.facing * 80, 8, W - 8), p.y);
    },
  },
  reaper: {
    name: 'LANGKAH HANTU',
    desc: 'MELAYANG MENEMBUS MUSUH, PULIH TIAP KENA',
    speed: 200,
    ms: 320,
    tint: 0xc2c3c7,
    hit: { mult: 0.6, radius: 14, heal: 3 },
  },
  gunners: {
    name: 'LOMPAT ROKET',
    desc: 'LEDAKAN DI KAKI MELONTARKAN KE ATAS',
    speed: -120,
    vy: -340,
    ms: 200,
    gravity: true,
    tint: 0xffa300,
    start: ({ p, world, scene, power }) => {
      world.area(p.x, p.y + 6, 26, 1 * power, 160, 'skill');
      scene.cameras.main.shake(80, 0.008);
    },
  },
  cultivator: {
    name: 'TERBANG PEDANG',
    desc: 'MELUNCUR DI ATAS PEDANG, MENEBAS YANG DILEWATI',
    speed: 210,
    vy: -50,
    ms: 420,
    tint: 0x29adff,
    hit: { mult: 0.5, radius: 12 },
  },
  elementalis: {
    name: 'LANGKAH API',
    desc: 'DASH MEMBAKAR MUSUH YANG DILEWATI',
    speed: 260,
    ms: 200,
    tint: 0xffa300,
    hit: { mult: 0.4, radius: 14, status: { burn: 0.2 } },
  },
  samurai: {
    name: 'SHUKUCHI',
    desc: 'DASH KILAT, TEBASAN KRITIS',
    speed: 480,
    ms: 110,
    cd: 0.85,
    tint: 0xfff1e8,
    hit: { mult: 0.8, radius: 14, crit: true },
  },
  darkAvenger: {
    name: 'LANGKAH KEGELAPAN',
    desc: 'DASH GELAP MENEBAS YANG DILEWATI',
    speed: 300,
    ms: 160,
    tint: 0x7e2553,
    hit: { mult: 0.7, radius: 14 },
  },
  ashura: {
    name: 'LANGKAH ASURA',
    desc: 'DASH MENGHANTAM, +2 AMARAH',
    speed: 280,
    ms: 150,
    tint: 0xffec27,
    hit: { mult: 0.6, radius: 14 },
    start: ({ p }) => p.gainFury(2),
  },
  antares: {
    name: 'SAYAP NAGA',
    desc: 'KEPAKAN SAYAP KE ATAS, SEMBURAN API DI KAKI',
    speed: 200,
    vy: -240,
    ms: 200,
    gravity: true,
    tint: 0xff004d,
    start: ({ p, world, power }) => world.area(p.x, p.y + 6, 22, 0.6 * power, 120, 'skill', { burn: 0.2 }),
  },
  gilgamesh: {
    name: 'VIMANA',
    desc: 'MELUNCUR DENGAN VIMANA, MENGHUJANI SENJATA',
    speed: 240,
    vy: -60,
    ms: 320,
    tint: 0xffec27,
    start: ({ p, world, power }) => {
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
    hit: { mult: 0.7, radius: 14 },
    start: ({ p, world, power }) =>
      void world.shot({
        x: p.x,
        y: p.y,
        vx: p.facing * 280,
        vy: 0,
        texture: 'kai',
        mult: 0.6 * power,
        source: 'skill',
        pierce: true,
      }),
  },
  gojo: {
    name: 'SHUNKAN IDO',
    desc: 'TELEPORTASI KE DEPAN, AO MENARIK MUSUH SEKITAR',
    speed: 0,
    ms: 100,
    tint: 0x29adff,
    start: ({ p, world, power }) => {
      p.ghost(0x29adff);
      p.body.reset(Phaser.Math.Clamp(p.x + p.facing * 90, 8, W - 8), p.y);
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
    hit: { mult: 0.6, radius: 12 },
  },
  madara: {
    name: 'LIMBO HENGOKU',
    desc: 'BAYANGAN TAK TERLIHAT MENGHANTAM MUSUH SEKITAR',
    speed: 260,
    ms: 180,
    tint: 0x8a3fd1,
    hit: { mult: 0.5, radius: 16 },
    start: ({ p, world, power }) => world.area(p.x, p.y, 40, 0.7 * power, 120, 'skill'),
  },
  hashirama: {
    name: 'TUNAS KAYU',
    desc: 'MELESAT, AKAR MENGIKAT YANG DILEWATI',
    speed: 250,
    ms: 180,
    tint: 0xab5236,
    hit: { mult: 0.6, radius: 14, status: { freeze: 500 } },
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
    start: ({ p, world, power }) => world.area(p.x, p.y + 4, 20, 0.4 * power, 60, 'skill', { freeze: 600 }),
  },
};
