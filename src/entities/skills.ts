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

const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

type Living = Phaser.GameObjects.Sprite & { hp: number; maxHp: number };
/** King Hassan's verdict: non-boss enemies under 30% HP are executed outright. */
const doomed = (t: Phaser.GameObjects.Sprite) => !('tier' in t) && (t as Living).hp / (t as Living).maxHp < 0.3;

export const SKILLS: Record<WeaponId, { skill: SkillFn; ult: SkillFn }> = {
  pedang: {
    // Strike Air: the wind hiding the blade bursts out as a tall wall that pierces and throws enemies back.
    skill: ({ p, world, scene, power }) => {
      for (const dy of [-12, -4, 4]) {
        world.shot({
          x: p.x + p.facing * 10,
          y: p.y + dy,
          vx: p.facing * 250,
          vy: 0,
          texture: 'slash',
          tint: 0xc2f0ff,
          mult: 1.2 * power,
          source: 'skill',
          pierce: true,
          knockback: 260,
        });
      }
      scene.cameras.main.shake(120, 0.008);
    },
    // Excalibur: gather light, then a golden beam across the arena in front.
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(1800);
      p.lock(1500);
      p.setVelocityX(0);
      const glow = scene.add.circle(p.x + f * 8, p.y - 6, 3, 0xffec27).setDepth(13);
      scene.tweens.add({ targets: glow, radius: 14, alpha: 0.5, duration: 700 });
      const inBeam = (t: Phaser.GameObjects.Sprite) => Math.sign(t.x - p.x) === f && Math.abs(t.y - p.y) < 24;
      later(scene, 700, () => {
        glow.destroy();
        const x0 = p.x + f * 8;
        const len = f > 0 ? W - x0 : x0;
        const beam = scene.add
          .rectangle(x0, p.y, len, 30, 0xffec27, 0.85)
          .setOrigin(f > 0 ? 0 : 1, 0.5)
          .setDepth(13);
        const core = scene.add
          .rectangle(x0, p.y, len, 10, 0xfff1e8)
          .setOrigin(f > 0 ? 0 : 1, 0.5)
          .setDepth(14);
        scene.tweens.add({
          targets: [beam, core],
          scaleY: 0,
          alpha: 0,
          delay: 350,
          duration: 400,
          onComplete: () => (beam.destroy(), core.destroy()),
        });
        scene.cameras.main.flash(300, 255, 236, 39);
        scene.cameras.main.shake(400, 0.02);
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
    // Enkidu: golden chains drop from portals and bind the three nearest enemies.
    skill: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 3);
      if (!targets.length) return false;
      for (const t of targets) {
        const gx = t.x + Phaser.Math.Between(-30, 30);
        const gy = Math.max(10, t.y - 50);
        p.gatePortal(gx, gy);
        const chain = scene.add.graphics().setDepth(13).lineStyle(1, 0xffec27).lineBetween(gx, gy, t.x, t.y);
        scene.tweens.add({ targets: chain, alpha: 0, delay: 1600, duration: 400, onComplete: () => chain.destroy() });
        world.strike(t, 0.8 * power, 'skill', false, { freeze: 2000 });
      }
    },
    // Enuma Elish: Ea spins up a red storm, then space itself cracks open in front.
    ult: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.invuln(2000);
      p.lock(1500);
      p.setVelocityX(0);
      const ea = [0xff004d, 0x000000].map((c) => scene.add.rectangle(p.x + f * 12, p.y, 3, 22, c).setDepth(13));
      scene.tweens.add({ targets: ea, angle: 1080, scaleY: 1.6, duration: 900, onComplete: () => ea.forEach((r) => r.destroy()) });
      later(scene, 900, () => {
        scene.cameras.main.flash(400, 255, 0, 77);
        scene.cameras.main.shake(500, 0.025);
        for (let i = 0; i < 12; i++) {
          const y = p.y + Phaser.Math.Between(-60, 30);
          const crack = scene.add
            .rectangle(p.x + f * 12, y, 4, 2, i % 3 ? 0xff004d : 0x000000)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setRotation(Phaser.Math.FloatBetween(-0.25, 0.25))
            .setDepth(13);
          scene.tweens.add({ targets: crack, width: W, alpha: 0, duration: 600, onComplete: () => crack.destroy() });
        }
        for (const t of world.targets(p.x, p.y)) if (Math.sign(t.x - p.x) === f) world.strike(t, 6 * power, 'ult', true);
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
