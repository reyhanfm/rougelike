import Phaser from 'phaser';
import { FLOOR_Y, W, floatText } from '../gfx/ui.ts';
import type { WeaponId } from '../logic/loot.ts';
import type { PlayerWorld } from './arena.ts';
import type { Player } from './Player.ts';

export interface SkillCtx {
  p: Player;
  world: PlayerWorld;
  scene: Phaser.Scene;
  /** stats.skillPower, already folded into every mult below. */
  power: number;
}

/** Return false when the skill could not fire (e.g. no targets) so nothing is spent. */
type SkillFn = (c: SkillCtx) => boolean | void;

/** basic: what the attack key casts for Weapon.cast weapons; fusion: attack + skill together (Weapon.fusion). */
type WeaponSkills = { skill: SkillFn; ult: SkillFn; basic?: SkillFn; fusion?: SkillFn };

const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

type Living = Phaser.GameObjects.Sprite & { hp: number; maxHp: number };
/** King Hassan's verdict: non-boss enemies under 30% HP are executed outright. */
const doomed = (t: Phaser.GameObjects.Sprite) => !('tier' in t) && (t as Living).hp / (t as Living).maxHp < 0.3;

export const SKILLS: Record<WeaponId, WeaponSkills> = {
  pedang: {
    // Strike Air: the wind barrier hiding Excalibur is released as a spinning tornado that pierces and hurls enemies away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const gust = world.shot({
        x: p.x + f * 16,
        y: p.y - 8,
        vx: f * 260,
        vy: 0,
        texture: 'angin',
        mult: 3 * power,
        source: 'skill',
        pierce: true,
        knockback: 300,
      }) as Phaser.GameObjects.Image;
      gust.setScale(2.5);
      scene.tweens.add({ targets: gust, angle: f * 1080, duration: 1500 });
      for (let i = 0; i < 10; i++) {
        later(scene, i * 50, () => {
          if (!gust.active) return;
          const streak = scene.add.rectangle(gust.x - f * 20, gust.y + Phaser.Math.Between(-18, 18), 10, 1, 0xc2f0ff).setDepth(12);
          scene.tweens.add({ targets: streak, x: streak.x - f * 24, alpha: 0, duration: 250, onComplete: () => streak.destroy() });
        });
      }
      scene.cameras.main.shake(150, 0.01);
    },
    // Excalibur: the sword is raised, a pillar of golden light rises from it while motes of light gather ("EX..."),
    // then the cut releases a golden beam across the arena in front ("...CALIBUR!").
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(2200);
      p.lock(1700);
      p.setVelocityX(0);
      const tipY = p.y - 16;
      const pillar = scene.add
        .rectangle(p.x + f * 3, tipY, 6, tipY + 10, 0xffec27, 0.8)
        .setOrigin(0.5, 1)
        .setScale(1, 0)
        .setDepth(13);
      scene.tweens.add({ targets: pillar, scaleY: 1, duration: 500, ease: 'Quad.Out' });
      for (let i = 0; i < 24; i++) {
        later(scene, i * 28, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Phaser.Math.Between(50, 90);
          const mote = scene.add.rectangle(p.x + Math.cos(a) * r, tipY + Math.sin(a) * r, 2, 2, i % 3 ? 0xffec27 : 0xfff1e8).setDepth(13);
          scene.tweens.add({ targets: mote, x: p.x + f * 3, y: tipY, duration: 300, onComplete: () => mote.destroy() });
        });
      }
      floatText(scene, W / 2, 40, 'EX...', '#ffec27');
      const inBeam = (t: Phaser.GameObjects.Sprite) => Math.sign(t.x - p.x) === f && Math.abs(t.y - p.y) < 32;
      later(scene, 800, () => {
        pillar.destroy();
        floatText(scene, W / 2, 52, 'CALIBUR!', '#ffec27');
        const x0 = p.x + f * 8;
        const len = f > 0 ? W - x0 : x0;
        const beam = (
          [
            [60, 0xffec27, 0.55],
            [34, 0xffec27, 0.9],
            [12, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, a]) =>
          scene.add
            .rectangle(x0, p.y, len, h, c, a)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setScale(0, 1)
            .setDepth(13),
        );
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120 });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 450,
          duration: 400,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        for (let i = 0; i < 16; i++) {
          const spark = scene.add
            .rectangle(x0 + f * Phaser.Math.Between(0, len), p.y + Phaser.Math.Between(-26, 26), 3, 1, 0xfff1e8)
            .setDepth(14);
          scene.tweens.add({ targets: spark, x: spark.x + f * 40, alpha: 0, duration: 400, onComplete: () => spark.destroy() });
        }
        scene.cameras.main.flash(300, 255, 236, 39);
        scene.cameras.main.shake(450, 0.025);
        for (const t of world.targets(p.x, p.y)) if (inBeam(t)) world.strike(t, 5 * power, 'ult', true);
        // The light lingers for two more pulses.
        for (const k of [1, 2])
          later(scene, k * 150, () =>
            world
              .targets(p.x, p.y)
              .filter(inBeam)
              .forEach((t) => world.strike(t, 1 * power, 'ult', false)),
          );
      });
    },
  },

  belati: {
    // Evening bell: mark the nearest enemy; a moment later Azrael falls (executes the weak).
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      floatText(scene, t.x, t.y - 18, 'DONG', '#fff1e8');
      later(scene, 600, () => {
        if (!t.active) return;
        const cut = scene.add.rectangle(t.x, t.y, 2, 40, 0xfff1e8).setRotation(0.3).setDepth(13);
        scene.tweens.add({ targets: cut, alpha: 0, scaleX: 4, duration: 250, onComplete: () => cut.destroy() });
        world.strike(t, (doomed(t) ? 50 : 3) * power, 'skill', true);
      });
    },
    // Azrael: the world darkens, the bell tolls, every enemy is sentenced at once.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(1600);
      p.lock(1300);
      p.setVelocityX(0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x000000, 0)
        .setOrigin(0)
        .setDepth(12);
      scene.tweens.add({ targets: dark, fillAlpha: 0.6, duration: 500, yoyo: true, hold: 500, onComplete: () => dark.destroy() });
      floatText(scene, p.x, p.y - 24, 'DONG...', '#fff1e8');
      later(scene, 1200, () => {
        scene.cameras.main.shake(300, 0.02);
        for (const t of targets) if (t.active) world.strike(t, (doomed(t) ? 50 : 4) * power, 'ult', true);
      });
    },
  },

  tombak: {
    // Gae Bolg: the thrust that has already pierced the heart; lands on the nearest enemy, always a crit.
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.facing = t.x >= p.x ? 1 : -1;
      const g = scene.add.graphics().setDepth(13).lineStyle(2, 0xff004d).lineBetween(p.x, p.y, t.x, t.y);
      scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
      world.strike(t, 3 * power, 'skill', true);
    },
    // Soaring spear: leap high, then the thrown Gae Bolg splits into red spears hunting every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1500);
      p.setVelocity(0, -380);
      later(scene, 400, () => {
        scene.cameras.main.flash(200, 255, 0, 77);
        world.targets(p.x, p.y).forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            later(scene, i * 50 + k * 90, () => {
              if (!t.active) return;
              // Aimed straight at this target (a little spread), piercing whatever is in the way.
              const a = Phaser.Math.Angle.Between(p.x, p.y, t.x, t.y) + Phaser.Math.FloatBetween(-0.08, 0.08);
              world.shot({
                x: p.x,
                y: p.y,
                vx: Math.cos(a) * 280,
                vy: Math.sin(a) * 280,
                texture: 'w_tombak',
                tint: 0xff004d,
                mult: 1.8 * power,
                source: 'ult',
                pierce: true,
              });
            });
          }
        });
      });
    },
  },

  kapak: {
    // Mad roar: blasts everything nearby away and staggers it.
    skill: ({ p, world, scene, power }) => {
      scene.cameras.main.shake(250, 0.015);
      floatText(scene, p.x, p.y - 20, 'GRAAAH!', '#ff004d');
      world.area(p.x, p.y, 70, 0.8 * power, 300, 'skill', { freeze: 600 });
    },
    // Nine Lives: close in on the nearest enemy and strike nine times, the last one crushing.
    ult: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.invuln(1600);
      p.lock(1300);
      p.facing = t.x >= p.x ? 1 : -1;
      p.body.reset(Phaser.Math.Clamp(t.x - p.facing * 14, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
      for (let i = 0; i < 9; i++) {
        later(scene, i * 110, () => {
          if (!t.active) return;
          const last = i === 8;
          const cut = scene.add
            .rectangle(t.x, t.y, 30, last ? 3 : 1, 0xfff1e8)
            .setRotation(Phaser.Math.FloatBetween(-1.2, 1.2))
            .setDepth(13);
          scene.tweens.add({ targets: cut, alpha: 0, duration: 200, onComplete: () => cut.destroy() });
          world.strike(t, (last ? 3 : 0.9) * power, 'ult', last);
          world.area(t.x, t.y, 26, 0.3 * power, last ? 260 : 30, 'ult');
          if (last) scene.cameras.main.shake(250, 0.02);
        });
      }
    },
  },

  busur: {
    // Caladbolg II: a spiral sword fired as an arrow; it detonates on the first thing it hits.
    skill: ({ p, world, power }) => {
      world.shot({
        x: p.x + p.facing * 8,
        y: p.y,
        vx: p.facing * 320,
        vy: 0,
        texture: 'arrow',
        tint: 0x29adff,
        mult: 2 * power,
        source: 'skill',
        explode: 32,
      });
    },
    // Unlimited Blade Works: the world turns to a field of swords that rain on every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const field = scene.add.rectangle(0, 0, W, FLOOR_Y, 0xffa300, 0).setOrigin(0).setDepth(3);
      scene.tweens.add({ targets: field, fillAlpha: 0.2, duration: 300, yoyo: true, hold: 2400, onComplete: () => field.destroy() });
      floatText(scene, p.x, p.y - 24, 'I AM THE BONE OF MY SWORD', '#ffa300');
      for (let i = 0; i < 28; i++) {
        later(scene, 300 + i * 90, () => {
          const live = world.targets(p.x, p.y);
          if (!live.length) return;
          const t = live[i % live.length];
          world.shot({
            x: t.x + Phaser.Math.Between(-6, 6),
            y: -10,
            vx: 0,
            vy: 320,
            texture: Phaser.Math.RND.pick(['w_pedang', 'w_katana', 'w_belati']),
            tint: 0xfff1e8,
            mult: 0.9 * power,
            source: 'ult',
          });
        });
      }
    },
  },

  sabit: {
    // Pull everything nearby in (negative knockback), then reap it.
    skill: ({ p, world, scene, power }) => {
      p.spin(400);
      world.area(p.x, p.y, 80, 0.4 * power, -230, 'skill');
      // Small push so reaped enemies stay in reach of the next swing.
      later(scene, 250, () => world.area(p.x, p.y, 34, 1.4 * power, 40, 'skill'));
    },
    // Cut every enemy on screen, healing for each one hit.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(targets.length * 70 + 500);
      p.spin(600);
      scene.cameras.main.flash(200, 60, 0, 60);
      targets.forEach((t, i) =>
        later(scene, 150 + i * 70, () => {
          if (!t.active) return;
          world.strike(t, 2.2 * power, 'ult', false);
          p.heal(5);
        }),
      );
    },
  },

  senapan: {
    skill: ({ p, world, scene, power }) => {
      const target = world.targets(p.x, p.y).find((t) => Math.sign(t.x - p.x) === p.facing && Math.abs(t.x - p.x) <= 120);
      const x = Phaser.Math.Clamp(target?.x ?? p.x + p.facing * 90, 8, W - 8);
      const y = target?.y ?? FLOOR_Y - 5;
      const fromX = p.x;
      const fromY = p.y;
      const grenade = scene.add.image(fromX, fromY, 'grenade').setDepth(12);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 500,
        onUpdate: (tween) => {
          const progress = tween.getValue() ?? 0;
          grenade.setPosition(fromX + (x - fromX) * progress, fromY + (y - fromY) * progress - Math.sin(progress * Math.PI) * 36);
          grenade.setRotation(progress * Math.PI * 3);
        },
        onComplete: () => {
          grenade.destroy();
          world.area(x, y, 34, 3.8 * power, 140, 'skill');
          scene.cameras.main.shake(100, 0.008);
        },
      });
    },
    ult: ({ p, world, scene, power }) => {
      const facing = p.facing;
      p.lock(950);
      p.invuln(350);
      p.setVelocityX(0);
      for (let i = 0; i < 12; i++)
        later(scene, i * 75, () => {
          if (!p.active || p.hp <= 0) return;
          world.shot({
            x: p.x + facing * 10,
            y: p.y + 1,
            vx: facing * 360,
            vy: ((i % 3) - 1) * 24,
            texture: 'bullet',
            tint: 0xffa300,
            mult: 0.9 * power,
            source: 'ult',
            pierce: true,
            knockback: 12,
          });
        });
    },
  },

  pedangTerbang: {
    // Sword formation: six qi swords fan out over the head, then fly off one by one to hunt.
    skill: ({ p, world, scene, power }) => {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + ((i + 0.5) / 6) * Math.PI;
        const sword = scene.add
          .image(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 'w_pedangTerbang')
          .setRotation(a)
          .setTint(0x29adff)
          .setDepth(12);
        later(scene, 250 + i * 90, () => {
          world.shot({
            x: sword.x,
            y: sword.y,
            vx: Math.cos(a) * 200,
            vy: Math.sin(a) * 200,
            texture: 'w_pedangTerbang',
            tint: 0x29adff,
            mult: 0.9 * power,
            source: 'skill',
            homing: true,
          });
          sword.destroy();
        });
      }
    },
    // Ten thousand swords return: golden swords converge on every enemy from above, then a qi burst.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1900);
      p.lock(1800);
      p.setVelocity(0, -60);
      p.ghost(0xffec27);
      scene.cameras.main.flash(250, 255, 236, 39);
      for (let i = 0; i < 24; i++) {
        later(scene, 200 + i * 55, () => {
          const live = world.targets(p.x, p.y);
          if (!live.length) return;
          const t = live[i % live.length];
          const a = Math.PI + 0.3 + Math.random() * (Math.PI - 0.6);
          world.shot({
            x: Phaser.Math.Clamp(t.x + Math.cos(a) * 90, -15, W + 15),
            y: t.y + Math.sin(a) * 90,
            vx: -Math.cos(a) * 340,
            vy: -Math.sin(a) * 340,
            texture: 'w_pedangTerbang',
            tint: 0xffec27,
            mult: 0.8 * power,
            source: 'ult',
            pierce: true,
          });
        });
      }
      later(scene, 1700, () => {
        world.area(p.x, p.y, 60, 2 * power, 220, 'ult');
        scene.cameras.main.shake(200, 0.015);
      });
    },
  },

  tongkat: {
    // Frost nova: freezes everything close.
    skill: ({ p, world, scene, power }) => {
      scene.cameras.main.flash(120, 41, 173, 255);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const shard = scene.add.image(p.x, p.y, 'iceshard').setRotation(a).setDepth(12);
        scene.tweens.add({
          targets: shard,
          x: p.x + Math.cos(a) * 40,
          y: p.y + Math.sin(a) * 40,
          alpha: 0,
          duration: 250,
          onComplete: () => shard.destroy(),
        });
      }
      world.area(p.x, p.y, 44, 1.2 * power, 60, 'skill', { freeze: 1800 });
    },
    // Meteors burn every enemy, then a blizzard freezes the whole arena.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(1800);
      for (let i = 0; i < 8; i++) {
        const t = targets[i % targets.length];
        later(scene, i * 140, () => {
          if (!t.active) return;
          const { x, y } = t;
          const meteor = scene.add.image(x - 30, -10, 'meteor').setDepth(12);
          scene.tweens.add({
            targets: meteor,
            x,
            y,
            duration: 300,
            onComplete: () => {
              meteor.destroy();
              world.area(x, y, 26, 1.8 * power, 120, 'ult', { burn: 0.4 });
              scene.cameras.main.shake(80, 0.008);
            },
          });
        });
      }
      later(scene, 1500, () => {
        scene.cameras.main.flash(250, 41, 173, 255);
        world.area(p.x, p.y, 400, 0.5 * power, 0, 'ult', { freeze: 2000 });
      });
    },
  },

  busurArkana: {
    // Arcane ring: eight magic arrows burst outward, then each hunts an enemy.
    skill: ({ p, world, power }) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 180,
          vy: Math.sin(a) * 180,
          texture: 'panahArkana',
          mult: 0.7 * power,
          source: 'skill',
          homing: true,
        });
      }
    },
    // Starfall: sixteen golden arcane arrows fall from the sky and home in.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      for (let i = 0; i < 16; i++) {
        later(scene, i * 70, () =>
          world.shot({
            x: Phaser.Math.Between(10, W - 10),
            y: -8,
            vx: 0,
            vy: 170,
            texture: 'panahArkana',
            tint: 0xffec27,
            mult: 1 * power,
            source: 'ult',
            homing: true,
          }),
        );
      }
    },
  },

  pedangGelap: {
    // Dark crescent; three of them while awakened.
    skill: ({ p, world, power }) => {
      for (const a of p.awakened ? [-0.2, 0, 0.2] : [0]) {
        world.shot({
          x: p.x + p.facing * 10,
          y: p.y,
          vx: Math.cos(a) * 220 * p.facing,
          vy: Math.sin(a) * 220,
          texture: 'slash',
          tint: 0x7e2553,
          mult: 1.8 * power,
          source: 'skill',
          pierce: true,
        });
      }
    },
    ult: () => false,
  },

  enamLengan: {
    // Thousand fists: a rapid barrage of small hits in front.
    skill: ({ p, world, scene, power }) => {
      p.lock(1000);
      p.setVelocityX(0);
      for (let i = 0; i < 10; i++) {
        later(scene, i * 90, () => {
          const x = p.x + p.facing * 18;
          world.area(x, p.y + Phaser.Math.Between(-4, 4), 20, 0.35 * power, 30, 'skill');
          const fist = scene.add
            .image(p.x + p.facing * 6, p.y + Phaser.Math.Between(-7, 7), 'w_enamLengan')
            .setTint(i % 2 ? 0xffec27 : 0xfff1e8)
            .setDepth(13)
            .setFlipX(p.facing < 0);
          scene.tweens.add({ targets: fist, x: x + p.facing * 6, alpha: 0, duration: 110, onComplete: () => fist.destroy() });
        });
      }
    },
    // Ashura form: fury maxed, invulnerable, six waves of phantom fists bursting outward.
    ult: ({ p, world, scene, power }) => {
      p.gainFury(99);
      p.invuln(1500);
      p.lock(1200);
      p.setVelocityX(0);
      scene.cameras.main.flash(150, 255, 236, 39);
      for (let i = 0; i < 6; i++) {
        later(scene, i * 180, () => {
          // Six fists in a ring, turned half a step each wave.
          for (let k = 0; k < 6; k++) {
            const a = ((k + i * 0.5) / 6) * Math.PI * 2;
            const fist = scene.add.image(p.x, p.y, 'w_enamLengan').setTint(0xffec27).setRotation(a).setDepth(13);
            scene.tweens.add({
              targets: fist,
              x: p.x + Math.cos(a) * 44,
              y: p.y + Math.sin(a) * 44,
              alpha: 0,
              duration: 200,
              onComplete: () => fist.destroy(),
            });
          }
          world.area(p.x, p.y, 48, 1.2 * power, 160, 'ult');
        });
      }
    },
  },

  cakarNaga: {
    // Fire breath: seven piercing fireballs in a cone.
    skill: ({ p, world, power }) => {
      for (let i = 0; i < 7; i++) {
        const a = -0.45 + i * 0.15;
        world.shot({
          x: p.x + p.facing * 8,
          y: p.y,
          vx: Math.cos(a) * 200 * p.facing,
          vy: Math.sin(a) * 200,
          texture: 'fireball',
          mult: 0.7 * power,
          source: 'skill',
          status: { burn: 0.3 },
          pierce: true,
        });
      }
    },
    // Dragon form: a burning roar that throws everything back, then fly and breathe fire.
    ult: ({ p, world, scene, power }) => {
      p.transform(7000);
      p.invuln(800);
      scene.cameras.main.flash(250, 255, 0, 77);
      scene.cameras.main.shake(300, 0.02);
      world.area(p.x, p.y, 90, 1.5 * power, 250, 'ult', { burn: 0.4 });
    },
  },

  gerbangBabilonia: {
    // Enkidu: gates open near the three nearest enemies; golden chains shoot out link by link and bind them.
    skill: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 3);
      if (!targets.length) return false;
      for (const t of targets) {
        const gx = Phaser.Math.Clamp(t.x + Phaser.Math.Between(-40, 40), 8, W - 8);
        const gy = Math.max(12, t.y - 50);
        const a = Phaser.Math.Angle.Between(gx, gy, t.x, t.y);
        p.gatePortal(gx, gy, a);
        const n = Math.ceil(Phaser.Math.Distance.Between(gx, gy, t.x, t.y) / 5);
        for (let i = 1; i <= n; i++) {
          const link = scene.add
            .rectangle(gx + Math.cos(a) * i * 5, gy + Math.sin(a) * i * 5, 4, 2, i % 2 ? 0xffec27 : 0xffa300)
            .setRotation(a + (i % 2 ? 0 : Math.PI / 2))
            .setAlpha(0)
            .setDepth(13);
          scene.tweens.add({ targets: link, alpha: 1, delay: i * 12, duration: 40 });
          scene.tweens.add({ targets: link, alpha: 0, delay: 1800, duration: 400, onComplete: () => link.destroy() });
        }
        later(scene, n * 12, () => t.active && world.strike(t, 0.8 * power, 'skill', false, { freeze: 2000 }));
      }
    },
    // Enuma Elish: a great gate opens and Ea slides out; its three cylinders spin, drawing a red wind into the tip,
    // then a spiral storm tears across the arena in front (heaven and earth split).
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(2600);
      p.lock(1900);
      p.setVelocityX(0);
      const ey = p.y - 2;
      const ex = p.x + f * 14;
      p.gatePortal(p.x - f * 4, ey, f > 0 ? 0 : Math.PI);
      const ea = scene.add
        .image(p.x, ey, 'ea0')
        .setOrigin(f > 0 ? 0.1 : 0.9, 0.5)
        .setFlipX(f < 0)
        .setScale(2)
        .setDepth(13);
      scene.tweens.add({ targets: ea, x: ex, duration: 250 });
      const spin = scene.time.addEvent({ delay: 60, loop: true, callback: () => ea.setTexture(ea.texture.key === 'ea0' ? 'ea1' : 'ea0') });
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x000000, 0)
        .setOrigin(0)
        .setDepth(3);
      scene.tweens.add({ targets: dark, fillAlpha: 0.55, duration: 800, yoyo: true, hold: 700, onComplete: () => dark.destroy() });
      floatText(scene, W / 2, 40, 'ENUMA ELISH', '#ff004d');
      const tipX = ex + f * 40;
      // A red vortex spins up at Ea's tip while wind streaks spiral into it.
      const vortex = scene.add.circle(tipX, ey, 4, 0xff004d, 0.35).setStrokeStyle(2, 0xff004d).setDepth(13);
      scene.tweens.add({ targets: vortex, radius: 26, duration: 850, onComplete: () => vortex.destroy() });
      for (let i = 0; i < 36; i++) {
        later(scene, i * 24, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Phaser.Math.Between(40, 70);
          const wind = scene.add
            .rectangle(tipX + Math.cos(a) * r, ey + Math.sin(a) * r, 9, 2, i % 3 ? 0xff004d : 0x000000)
            .setRotation(a + Math.PI / 2)
            .setDepth(13);
          scene.tweens.add({
            targets: wind,
            x: tipX,
            y: ey,
            rotation: a + Math.PI,
            alpha: 0.3,
            duration: 280,
            onComplete: () => wind.destroy(),
          });
        });
      }
      later(scene, 900, () => {
        spin.remove();
        scene.tweens.add({ targets: ea, alpha: 0, delay: 600, duration: 300, onComplete: () => ea.destroy() });
        scene.cameras.main.flash(300, 255, 0, 77);
        scene.cameras.main.shake(600, 0.03);
        const len = f > 0 ? W - tipX : tipX;
        const beam = (
          [
            [40, 0xff004d, 0.55],
            [22, 0x000000, 0.85],
            [6, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, a]) =>
          scene.add
            .rectangle(tipX, ey, len, h, c, a)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setScale(0, 1)
            .setDepth(13),
        );
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 150 });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 650,
          duration: 350,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        // Spiral bands race along the storm.
        for (let k = 0; k < 10; k++) {
          const band = scene.add
            .rectangle(tipX, ey, 3, 44, k % 2 ? 0xff004d : 0x7e2553)
            .setRotation(0.5 * f)
            .setDepth(14);
          scene.tweens.add({ targets: band, x: tipX + f * len, delay: k * 60, duration: 400, onComplete: () => band.destroy() });
        }
        // Space itself cracks above and below.
        for (let i = 0; i < 12; i++) {
          const crack = scene.add
            .rectangle(tipX, ey + Phaser.Math.Between(-60, 30), 4, 2, i % 3 ? 0xff004d : 0x000000)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setRotation(Phaser.Math.FloatBetween(-0.25, 0.25))
            .setDepth(13);
          scene.tweens.add({ targets: crack, width: W, alpha: 0, duration: 600, onComplete: () => crack.destroy() });
        }
        for (const t of world.targets(p.x, p.y))
          if (Math.sign(t.x - p.x) === f) world.strike(t, (Math.abs(t.y - ey) < 34 ? 7 : 3) * power, 'ult', true);
      });
    },
  },

  shrine: {
    // Malevolent Shrine: the shrine rises behind Sukuna. Slashes fly out in every direction, and every enemy inside
    // the domain is cut again and again (a sure hit).
    skill: ({ p, world, scene, power }) => {
      const { x, y } = p;
      const r = 110;
      p.lock(500);
      p.setVelocityX(0);
      const shrine = scene.add.image(x, FLOOR_Y, 'shrine').setOrigin(0.5, 1).setScale(4).setAlpha(0).setDepth(3);
      const domain = scene.add.circle(x, y, r, 0x3a0010, 0).setStrokeStyle(1, 0xff004d).setDepth(3);
      scene.tweens.add({ targets: shrine, alpha: 1, duration: 250, yoyo: true, hold: 2300, onComplete: () => shrine.destroy() });
      scene.tweens.add({ targets: domain, fillAlpha: 0.35, duration: 250, yoyo: true, hold: 2300, onComplete: () => domain.destroy() });
      floatText(scene, Phaser.Math.Clamp(x, 72, W - 72), y - 24, 'MALEVOLENT SHRINE', '#ff004d');
      for (let i = 0; i < 20; i++) {
        later(scene, 200 + i * 120, () => {
          for (let k = 0; k < 3; k++) {
            const a = Math.random() * Math.PI * 2;
            world.shot({
              x,
              y,
              vx: Math.cos(a) * 300,
              vy: Math.sin(a) * 300,
              texture: 'kai',
              mult: 0.3 * power,
              source: 'skill',
              pierce: true,
            });
          }
          if (i % 2) return;
          for (const t of world.targets(x, y)) {
            if (Phaser.Math.Distance.Between(x, y, t.x, t.y) > r) continue;
            const cut = scene.add.rectangle(t.x, t.y, 20, 1, 0xfff1e8).setRotation(Phaser.Math.FloatBetween(-1.5, 1.5)).setDepth(13);
            scene.tweens.add({ targets: cut, alpha: 0, duration: 150, onComplete: () => cut.destroy() });
            world.strike(t, 0.35 * power, 'skill', false);
          }
        });
      }
    },
    // World Cutting Slash: after the chant, Sukuna cuts the world itself. The split runs through the nearest enemy
    // (crushing damage), and everything else on screen is cut too.
    ult: ({ p, world, scene, power }) => {
      const first = world.targets(p.x, p.y)[0];
      if (!first) return false;
      p.invuln(2200);
      p.lock(1500);
      p.setVelocityX(0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x000000, 0)
        .setOrigin(0)
        .setDepth(3);
      scene.tweens.add({ targets: dark, fillAlpha: 0.5, duration: 900, yoyo: true, hold: 300, onComplete: () => dark.destroy() });
      ['SISIK NAGA', 'TOLAKAN', 'METEOR KEMBAR'].forEach((w, i) =>
        later(scene, i * 300, () => floatText(scene, p.x, p.y - 22 - i * 8, w, '#ff004d')),
      );
      later(scene, 1000, () => {
        const t = first.active ? first : world.targets(p.x, p.y)[0];
        const cx = t?.x ?? p.x + p.facing * 60;
        const cy = t?.y ?? p.y;
        const a = -0.35 * p.facing;
        // The cut: a white line with a red glow, then the world gapes open along it.
        const glow = scene.add
          .rectangle(cx, cy, W * 2, 9, 0xff004d, 0.6)
          .setRotation(a)
          .setDepth(14);
        const line = scene.add
          .rectangle(cx, cy, W * 2, 3, 0xfff1e8)
          .setRotation(a)
          .setDepth(15);
        const gap = scene.add
          .rectangle(cx, cy, W * 2, 2, 0x000000)
          .setRotation(a)
          .setDepth(16)
          .setAlpha(0);
        scene.tweens.add({
          targets: [glow, line],
          alpha: 0,
          delay: 400,
          duration: 500,
          onComplete: () => (glow.destroy(), line.destroy()),
        });
        scene.tweens.add({
          targets: gap,
          alpha: 1,
          scaleY: 3,
          delay: 150,
          duration: 250,
          yoyo: true,
          hold: 200,
          onComplete: () => gap.destroy(),
        });
        scene.cameras.main.flash(120, 255, 0, 77);
        scene.cameras.main.shake(500, 0.03);
        floatText(scene, W / 2, 40, 'WORLD CUTTING SLASH', '#fff1e8');
        for (const e of world.targets(cx, cy)) {
          const onCut = Math.abs(-(e.x - cx) * Math.sin(a) + (e.y - cy) * Math.cos(a)) < 16;
          world.strike(e, (onCut ? 9 : 3) * power, 'ult', true);
        }
      });
    },
  },

  mugen: {
    // Blue (Ao): a point of attraction opens in front of Gojo, drags enemies in and crushes them.
    basic: ({ p, world, scene, power }) => {
      const x = Phaser.Math.Clamp(p.x + p.facing * 56, 10, W - 10);
      const y = p.y - 10;
      const orb = scene.add.image(x, y, 'ao').setScale(0.6).setDepth(12);
      scene.tweens.add({ targets: orb, scale: 3, angle: 720, duration: 500, yoyo: true, onComplete: () => orb.destroy() });
      const glow = scene.add.circle(x, y, 30, 0x29adff, 0.2).setDepth(11);
      scene.tweens.add({ targets: glow, radius: 8, alpha: 0, duration: 1000, onComplete: () => glow.destroy() });
      const ring = scene.add.circle(x, y, 46).setStrokeStyle(2, 0x29adff, 0.8).setDepth(12);
      scene.tweens.add({ targets: ring, radius: 4, alpha: 0.2, duration: 450, repeat: 1, onComplete: () => ring.destroy() });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const mote = scene.add.rectangle(x + Math.cos(a) * 66, y + Math.sin(a) * 66, 2, 2, 0xc2f0ff).setDepth(12);
        scene.tweens.add({ targets: mote, x, y, delay: i * 30, duration: 400, onComplete: () => mote.destroy() });
      }
      for (let i = 0; i < 4; i++) {
        later(scene, i * 250, () => {
          world.pull(x, y, 72, 130);
          world.area(x, y, 32, 0.5 * power, 0, 'basic');
        });
      }
    },
    // Red (Aka): reversed cursed energy fired forward; it blasts everything in its path away.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x = p.x + f * 14;
      const flare = scene.add
        .image(x, p.y - 4, 'aka')
        .setScale(2)
        .setDepth(12);
      scene.tweens.add({ targets: flare, scale: 6, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
      scene.cameras.main.shake(150, 0.012);
      const red = world.shot({
        x,
        y: p.y - 4,
        vx: f * 300,
        vy: 0,
        texture: 'aka',
        mult: 1.8 * power,
        source: 'skill',
        pierce: true,
        knockback: 320,
      });
      // Three times the orb (and its hitbox).
      (red as Phaser.GameObjects.Image).setScale(3);
    },
    // Hollow Purple (Murasaki): Blue and Red collide in front of Gojo; the imaginary mass erases everything in its path.
    fusion: ({ p, world, scene, power }) => {
      const f = p.facing;
      const x = p.x + f * 30;
      // Centered high enough that the huge sphere sweeps the floor and the air above it.
      const y = FLOOR_Y - 42;
      p.lock(500);
      p.invuln(500);
      p.setVelocityX(0);
      const orbs = [scene.add.image(x - 26, y - 20, 'ao'), scene.add.image(x + 26, y - 20, 'aka')].map((o) => o.setScale(2.5).setDepth(13));
      scene.tweens.add({
        targets: orbs,
        x,
        y,
        duration: 400,
        ease: 'Quad.In',
        onComplete: () => {
          orbs.forEach((o) => o.destroy());
          scene.cameras.main.flash(250, 138, 63, 209);
          scene.cameras.main.shake(500, 0.03);
          const sphere = world.shot({
            x,
            y,
            vx: f * 140,
            vy: 0,
            texture: 'murasaki',
            mult: 4 * power,
            source: 'skill',
            pierce: true,
            knockback: 200,
          });
          // A huge sphere (about 90px): six times the sprite, and its hitbox with it.
          (sphere as Phaser.GameObjects.Image).setScale(6);
          // The erased path: purple afterimages trail behind it.
          for (let i = 1; i <= 20; i++) {
            later(scene, i * 60, () => {
              if (!sphere.active) return;
              const { x: gx, y: gy } = sphere as Phaser.GameObjects.Image;
              const ghost = scene.add.image(gx, gy, 'murasaki').setScale(6).setAlpha(0.35).setDepth(8);
              scene.tweens.add({ targets: ghost, alpha: 0, scale: 4, duration: 350, onComplete: () => ghost.destroy() });
            });
          }
        },
      });
    },
    // Unlimited Void: infinite information freezes every enemy in place, then Gojo lands the blow.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(2200);
      p.lock(1600);
      p.setVelocityX(0);
      const domain = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x000000, 0)
        .setOrigin(0)
        .setDepth(3);
      scene.tweens.add({ targets: domain, fillAlpha: 0.75, duration: 300, yoyo: true, hold: 1300, onComplete: () => domain.destroy() });
      for (let i = 0; i < 30; i++) {
        const star = scene.add
          .rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, FLOOR_Y), 1, 1, i % 3 ? 0xfff1e8 : 0x29adff)
          .setAlpha(0)
          .setDepth(4);
        scene.tweens.add({ targets: star, alpha: 1, duration: 300, yoyo: true, hold: 1300, onComplete: () => star.destroy() });
      }
      floatText(scene, Phaser.Math.Clamp(p.x, 56, W - 56), p.y - 30, 'RYOIKI TENKAI', '#29adff');
      for (const t of targets) world.strike(t, 0.5 * power, 'ult', false, { freeze: 3000 });
      later(scene, 1500, () => {
        scene.cameras.main.shake(200, 0.015);
        for (const t of targets) if (t.active) world.strike(t, 3 * power, 'ult', true);
      });
    },
  },

  sakahoko: {
    // Playful Cloud: the three-section staff whirls around Toji, three blows, the last one throwing enemies away.
    skill: ({ p, world, scene, power }) => {
      p.spin(450);
      const staff = scene.add.image(p.x, p.y, 'w_awan').setDepth(13);
      scene.tweens.add({
        targets: staff,
        angle: 720,
        duration: 450,
        onUpdate: () => staff.setPosition(p.x, p.y),
        onComplete: () => staff.destroy(),
      });
      for (const k of [0, 1, 2])
        later(scene, k * 150, () => world.area(p.x, p.y, 34, (k === 2 ? 1.4 : 0.8) * power, k === 2 ? 260 : 60, 'skill'));
      later(scene, 300, () => scene.cameras.main.shake(120, 0.01));
    },
    // Split Soul Katana: Toji vanishes and appears behind each enemy in turn with a crit that cuts the soul.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 8);
      if (!targets.length) return false;
      p.invuln(targets.length * 130 + 500);
      p.lock(targets.length * 130 + 100);
      targets.forEach((t, i) =>
        later(scene, i * 130, () => {
          if (!t.active) return;
          p.ghost(0xfff1e8);
          const side = t.x >= p.x ? 1 : -1;
          p.body.reset(Phaser.Math.Clamp(t.x + side * 14, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
          p.facing = -side;
          const cut = scene.add.rectangle(t.x, t.y, 30, 2, 0xfff1e8).setRotation(Phaser.Math.FloatBetween(-0.8, 0.8)).setDepth(13);
          scene.tweens.add({ targets: cut, alpha: 0, scaleY: 3, duration: 200, onComplete: () => cut.destroy() });
          world.strike(t, 3 * power, 'ult', true);
        }),
      );
    },
  },

  gunbai: {
    // Katon: Gokakyu: a giant fireball rolls forward, burning through everything in its way.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(250);
      p.setVelocityX(0);
      const ball = world.shot({
        x: p.x + f * 16,
        y: p.y - 10,
        vx: f * 150,
        vy: 0,
        texture: 'gokakyu',
        mult: 2.5 * power,
        source: 'skill',
        pierce: true,
        knockback: 160,
        status: { burn: 0.4 },
      }) as Phaser.GameObjects.Image;
      // Twice the sprite: a truly giant fireball (the body scales with it).
      ball.setScale(2);
      scene.cameras.main.shake(150, 0.01);
      for (let i = 1; i <= 25; i++) {
        later(scene, i * 70, () => {
          if (!ball.active) return;
          const ember = scene.add
            .circle(ball.x - f * 18, ball.y + Phaser.Math.Between(-10, 10), 3, i % 2 ? 0xffa300 : 0xff004d)
            .setDepth(8);
          scene.tweens.add({ targets: ember, alpha: 0, y: ember.y - 6, duration: 300, onComplete: () => ember.destroy() });
        });
      }
    },
    // Perfect Susanoo: the blue armored giant rises around Madara and cuts the monsters down with its sword:
    // two sweeps in front, then a final cut across the whole arena.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(3000);
      p.lock(2700);
      p.setVelocityX(0);
      const sx = Phaser.Math.Clamp(p.x, 40, W - 40);
      const giant = scene.add
        .image(sx, FLOOR_Y + 40, 'susanoo')
        .setOrigin(0.5, 1)
        .setScale(4.5)
        .setFlipX(f < 0)
        .setAlpha(0)
        .setDepth(9);
      scene.tweens.add({ targets: giant, alpha: 0.85, y: FLOOR_Y, duration: 400, ease: 'Quad.Out' });
      scene.tweens.add({ targets: giant, alpha: 0, delay: 2600, duration: 400, onComplete: () => giant.destroy() });
      scene.cameras.main.flash(200, 41, 173, 255);
      const hx = sx + f * 30;
      const hy = FLOOR_Y - 60;
      const sword = scene.add
        .image(hx, hy, 'susanooSword')
        .setOrigin(f > 0 ? 0 : 1, 0.5)
        .setFlipX(f < 0)
        .setScale(3)
        .setAlpha(0)
        .setDepth(9);
      later(scene, 2700, () => sword.destroy());
      [500, 1200, 1900].forEach((at, i) => {
        const last = i === 2;
        later(scene, at, () => {
          sword.setAlpha(0.95).setAngle(f * -110);
          scene.tweens.add({
            targets: sword,
            angle: f * 50,
            duration: 220,
            ease: 'Quad.In',
            onComplete: () => {
              scene.cameras.main.shake(250, last ? 0.03 : 0.015);
              world.shot({
                x: hx + f * 40,
                y: FLOOR_Y - 30,
                vx: f * 280,
                vy: 0,
                texture: 'slash',
                tint: 0x29adff,
                mult: 1 * power,
                source: 'ult',
                pierce: true,
                knockback: 200,
              });
              for (const t of world.targets(hx, hy)) {
                const inFront = (Math.sign(t.x - sx) === f || Math.abs(t.x - sx) < 30) && Math.abs(t.x - sx) < 190;
                if (last || inFront) world.strike(t, (last ? 3 : 2) * power, 'ult', last);
              }
            },
          });
        });
      });
    },
  },

  mokuton: {
    // Deep Forest Emergence: a giant tree bursts up in front; trunk and canopy strike everything in its reach (air included)
    // and the branches bind it.
    skill: ({ p, world, scene, power }) => {
      const x = Phaser.Math.Clamp(p.x + p.facing * 44, 24, W - 24);
      const top = 30;
      const trunk = scene.add
        .rectangle(x, FLOOR_Y, 14, FLOOR_Y - top, 0x7a4a2a)
        .setOrigin(0.5, 1)
        .setScale(1, 0)
        .setDepth(4);
      const leaves = [-26, 0, 26, -13, 13].map((dx, i) =>
        scene.add
          .circle(x + dx, top + (i < 3 ? 6 : -8), 18, i % 2 ? 0x00e436 : 0x008751)
          .setScale(0)
          .setDepth(4),
      );
      const tree = [trunk, ...leaves];
      scene.tweens.add({ targets: trunk, scaleY: 1, duration: 200 });
      scene.tweens.add({ targets: leaves, scale: 1, delay: 180, duration: 180 });
      scene.tweens.add({ targets: tree, alpha: 0, delay: 1800, duration: 400, onComplete: () => tree.forEach((o) => o.destroy()) });
      scene.cameras.main.shake(200, 0.012);
      later(scene, 150, () => {
        for (const t of world.targets(x, FLOOR_Y))
          if (Math.abs(t.x - x) < 44) world.strike(t, 1.4 * power, 'skill', false, { freeze: 1200 });
      });
    },
    // Mokuton: Shin Susenju: the wooden thousand-armed Buddha rises behind the arena, its hands crash down on every
    // enemy, then it slams the whole field.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(3200);
      p.lock(800);
      p.setVelocityX(0);
      floatText(scene, p.x, p.y - 24, 'MOKUTON: SHIN SUSENJU', '#ffa300');
      const buddha = scene.add
        .image(W / 2, FLOOR_Y + 120, 'buddha')
        .setOrigin(0.5, 1)
        .setScale(6)
        .setAlpha(0.75)
        .setDepth(3);
      scene.tweens.add({ targets: buddha, y: FLOOR_Y, duration: 500, ease: 'Back.Out' });
      scene.tweens.add({ targets: buddha, alpha: 0, delay: 2900, duration: 400, onComplete: () => buddha.destroy() });
      scene.cameras.main.shake(500, 0.01);
      for (let i = 0; i < 18; i++) {
        later(scene, 500 + i * 100, () => {
          const live = world.targets(p.x, p.y);
          if (!live.length) return;
          const { x, y } = live[i % live.length];
          const hand = scene.add.image(x, -12, 'w_telapak').setScale(2).setDepth(13);
          scene.tweens.add({
            targets: hand,
            y,
            duration: 180,
            onComplete: () => {
              hand.destroy();
              world.area(x, y, 20, 1.2 * power, 120, 'ult');
              scene.cameras.main.shake(60, 0.006);
            },
          });
        });
      }
      later(scene, 2500, () => {
        scene.cameras.main.flash(250, 255, 163, 0);
        scene.cameras.main.shake(400, 0.03);
        world.area(W / 2, FLOOR_Y, 400, 2 * power, 200, 'ult');
      });
    },
  },

  kunai: {
    // Amaterasu: black flames cling to the nearest enemy and burn for five seconds, leaping to anything that comes close.
    skill: ({ p, world, scene, power }) => {
      const first = world.targets(p.x, p.y)[0];
      if (!first) return false;
      // Mangekyo: a red glint in Itachi's eye.
      const glint = scene.add.circle(p.x + p.facing * 2, p.y - 3, 2, 0xff004d).setDepth(13);
      scene.tweens.add({ targets: glint, scale: 3, alpha: 0, duration: 300, onComplete: () => glint.destroy() });
      const burning = new Set<Phaser.GameObjects.Sprite>();
      const ignite = (t: Phaser.GameObjects.Sprite) => {
        if (burning.has(t) || burning.size >= 6) return;
        burning.add(t);
        const flame = scene.add.image(t.x, t.y, 'amaterasu').setScale(1.5).setDepth(13);
        scene.tweens.add({ targets: flame, scaleY: 2, yoyo: true, repeat: -1, duration: 150 });
        const follow = () => (t.active ? flame.setPosition(t.x, t.y - 2) : flame.setVisible(false));
        scene.events.on('update', follow);
        const out = () => {
          scene.events.off('update', follow);
          flame.destroy();
        };
        for (let i = 0; i < 12; i++) {
          later(scene, i * 400, () => {
            if (!t.active) return;
            world.strike(t, 0.35 * power, 'skill', false);
            // The black flames leap to anything that comes close, any time while they burn.
            for (const o of world.targets(t.x, t.y)) if (o !== t && Phaser.Math.Distance.Between(o.x, o.y, t.x, t.y) < 36) ignite(o);
          });
        }
        later(scene, 12 * 400, out);
      };
      world.strike(first, 1 * power, 'skill', false);
      ignite(first);
    },
    // Tsukuyomi: the Mangekyo fills the view, then every enemy is dragged into a red world under a black moon,
    // held still and stabbed over and over ("72 hours"), until they collapse.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(2800);
      p.lock(1800);
      p.setVelocityX(0);
      const eye = scene.add
        .image(W / 2, FLOOR_Y / 2, 'mangekyo')
        .setScale(0.5)
        .setDepth(15);
      scene.tweens.add({ targets: eye, scale: 7, angle: 120, duration: 400, ease: 'Quad.Out' });
      scene.tweens.add({ targets: eye, alpha: 0, delay: 400, duration: 200, onComplete: () => eye.destroy() });
      later(scene, 500, () => {
        const red = scene.add
          .rectangle(0, 0, W, FLOOR_Y + 20, 0xb3122e, 0)
          .setOrigin(0)
          .setDepth(3);
        const moon = scene.add
          .circle(W * 0.72, 38, 22, 0x000000, 0)
          .setStrokeStyle(2, 0xff004d, 0)
          .setDepth(4);
        scene.tweens.add({ targets: red, fillAlpha: 0.65, duration: 200, yoyo: true, hold: 1700, onComplete: () => red.destroy() });
        scene.tweens.add({
          targets: moon,
          fillAlpha: 1,
          strokeAlpha: 1,
          duration: 200,
          yoyo: true,
          hold: 1700,
          onComplete: () => moon.destroy(),
        });
        floatText(scene, W / 2, 60, '72 JAM...', '#fff1e8');
        for (const t of targets) if (t.active) world.strike(t, 0.3 * power, 'ult', false, { freeze: 3500 });
      });
      for (let i = 0; i < 16; i++) {
        later(scene, 600 + i * 90, () => {
          for (const t of targets) {
            if (!t.active) continue;
            const a = Math.random() * Math.PI * 2;
            const blade = scene.add
              .rectangle(t.x + Math.cos(a) * 16, t.y + Math.sin(a) * 16, 12, 1, 0xfff1e8)
              .setRotation(a)
              .setDepth(13);
            scene.tweens.add({ targets: blade, x: t.x, y: t.y, alpha: 0, duration: 120, onComplete: () => blade.destroy() });
            world.strike(t, 0.2 * power, 'ult', false);
          }
        });
      }
      later(scene, 2200, () => {
        scene.cameras.main.flash(200, 179, 18, 46);
        for (const t of targets) if (t.active) world.strike(t, 2 * power, 'ult', true);
      });
    },
  },

  tongkatFrost: {
    // Frost Nova: a wide burst of cold around Jack freezes everything close.
    skill: ({ p, world, scene, power }) => {
      const r = 70;
      scene.cameras.main.flash(120, 194, 240, 255);
      const ring = scene.add.circle(p.x, p.y, 6, 0xc2f0ff, 0.35).setStrokeStyle(2, 0xfff1e8).setDepth(12);
      scene.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const shard = scene.add.image(p.x, p.y, 'iceshard').setRotation(a).setDepth(12);
        scene.tweens.add({
          targets: shard,
          x: p.x + Math.cos(a) * r,
          y: p.y + Math.sin(a) * r,
          alpha: 0,
          duration: 350,
          onComplete: () => shard.destroy(),
        });
      }
      world.area(p.x, p.y, r, 1.3 * power, 120, 'skill', { freeze: 1500 });
    },
    // Absolute Zero: the arena freezes over for five seconds. Every half second each enemy loses HP and slows down;
    // every fourth tick it freezes solid. It ends in one shattering blast.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1200);
      floatText(scene, p.x, p.y - 24, 'ABSOLUTE ZERO', '#c2f0ff');
      const cold = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x9fd8ff, 0)
        .setOrigin(0)
        .setDepth(3);
      const frost = scene.add
        .rectangle(0, FLOOR_Y - 2, W, 3, 0xfff1e8, 0)
        .setOrigin(0)
        .setDepth(4);
      scene.tweens.add({
        targets: [cold, frost],
        fillAlpha: { from: 0, to: 0.3 },
        duration: 400,
        yoyo: true,
        hold: 4600,
        onComplete: () => (cold.destroy(), frost.destroy()),
      });
      const chill = new Map<Phaser.GameObjects.Sprite, number>();
      for (let i = 0; i < 10; i++) {
        later(scene, 300 + i * 500, () => {
          for (let k = 0; k < 6; k++) {
            const flake = scene.add.rectangle(Phaser.Math.Between(0, W), -2, 1, 1, 0xfff1e8).setDepth(13);
            scene.tweens.add({ targets: flake, y: FLOOR_Y, x: flake.x - 20, duration: 900, onComplete: () => flake.destroy() });
          }
          for (const t of world.targets(p.x, p.y)) {
            const n = (chill.get(t) ?? 0) + 1;
            chill.set(t, n % 4);
            world.strike(t, 0.4 * power, 'ult', false, n === 4 ? { freeze: 1500 } : { slow: 700 });
          }
        });
      }
      later(scene, 5300, () => {
        scene.cameras.main.flash(250, 194, 240, 255);
        scene.cameras.main.shake(300, 0.02);
        world.area(p.x, p.y, 400, 1.5 * power, 0, 'ult', { freeze: 2000 });
      });
    },
  },

  katana: {
    // Iai: blink forward; every enemy along the path takes a guaranteed crit.
    skill: ({ p, world, scene, power }) => {
      const fromX = p.x;
      const toX = Phaser.Math.Clamp(p.x + p.facing * 110, 8, W - 8);
      const y = p.y;
      p.invuln(350);
      p.ghost(0xfff1e8);
      p.body.reset(toX, y);
      const line = scene.add.rectangle((fromX + toX) / 2, y, Math.abs(toX - fromX) || 1, 1, 0xfff1e8).setDepth(13);
      scene.tweens.add({ targets: line, alpha: 0, scaleY: 3, duration: 250, onComplete: () => line.destroy() });
      const lo = Math.min(fromX, toX) - 6;
      const hi = Math.max(fromX, toX) + 6;
      for (const t of world.targets(p.x, y)) {
        if (Math.abs(t.y - y) < 18 && t.x >= lo && t.x <= hi) later(scene, 120, () => world.strike(t, 1.6 * power, 'skill', true));
      }
    },
    // Issen: time stops (everything freezes), slashes flash over each enemy, then all land at once.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(1600);
      p.lock(1100);
      p.setVelocityX(0);
      scene.cameras.main.flash(150, 255, 255, 255);
      for (const t of targets) world.strike(t, 0.3 * power, 'ult', false, { freeze: 1200 });
      targets.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          later(scene, 150 + i * 60 + k * 90, () => {
            if (!t.active) return;
            const cut = scene.add
              .rectangle(t.x, t.y, 34, 1, 0xfff1e8)
              .setRotation(Phaser.Math.FloatBetween(-1, 1) + ((k % 2) * Math.PI) / 2)
              .setDepth(13);
            scene.tweens.add({ targets: cut, alpha: 0, duration: 300, onComplete: () => cut.destroy() });
          });
        }
      });
      later(scene, 1000, () => {
        scene.cameras.main.shake(150, 0.012);
        for (const t of targets) if (t.active) world.strike(t, 3 * power, 'ult', true);
      });
    },
  },
};
