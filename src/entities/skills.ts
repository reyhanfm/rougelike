import Phaser from 'phaser';
import { FLOOR_Y, W } from '../gfx/ui.ts';
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

export const SKILLS: Record<WeaponId, { skill: SkillFn; ult: SkillFn }> = {
  pedang: {
    // Piercing blue crescent.
    skill: ({ p, world, power }) => {
      world.shot({
        x: p.x + p.facing * 10,
        y: p.y,
        vx: p.facing * 230,
        vy: 0,
        texture: 'slash',
        tint: 0x29adff,
        mult: 1.6 * power,
        source: 'skill',
        pierce: true,
      });
    },
    // Invulnerable blade storm around the player.
    ult: ({ p, world, scene, power }) => {
      p.invuln(1400);
      p.lock(1400);
      p.spin(1400);
      p.setVelocityX(0);
      for (let i = 0; i < 8; i++) later(scene, i * 170, () => world.area(p.x, p.y, 40, 0.8 * power, 60, 'ult'));
    },
  },

  belati: {
    skill: ({ p, world, power }) => {
      for (const a of [-0.15, 0, 0.15]) {
        world.shot({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * 240 * p.facing,
          vy: Math.sin(a) * 240,
          texture: 'w_belati',
          mult: 0.9 * power,
          source: 'skill',
        });
      }
    },
    // Blink from enemy to enemy, each strike a guaranteed crit.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 6);
      if (!targets.length) return false;
      const ms = 6 * 130 + 300;
      p.invuln(ms);
      p.lock(ms);
      Array.from({ length: 6 }, (_, i) => targets[i % targets.length]).forEach((t, i) =>
        later(scene, i * 130, () => {
          if (!t.active) return;
          p.ghost(0x7e2553);
          p.facing = t.x >= p.x ? 1 : -1;
          p.body.reset(Phaser.Math.Clamp(t.x - p.facing * 12, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
          world.strike(t, 1.2 * power, 'ult', true);
        }),
      );
    },
  },

  tombak: {
    // Leap, dive, and slam on landing.
    skill: ({ p, world, scene, power }) => {
      p.invuln(700);
      p.lock(1500);
      p.setVelocity(p.facing * 60, -300);
      later(scene, 350, () => {
        p.setVelocity(p.facing * 140, 420);
        p.onLand(() => {
          world.area(p.x, p.y + 4, 34, 2 * power, 200, 'skill');
          scene.cameras.main.shake(120, 0.012);
          p.lock(0);
        });
      });
    },
    ult: ({ p, world, scene, power }) => {
      const n = 14;
      const targets = world.targets(p.x, p.y);
      for (let i = 0; i < n; i++) {
        // Four spears aim at current target positions; the rest cover the arena.
        const x = i < 4 && targets.length ? targets[i % targets.length].x : 12 + (i * (W - 24)) / (n - 1) + Phaser.Math.Between(-6, 6);
        later(scene, Phaser.Math.Between(0, 900), () =>
          world.shot({ x, y: -12, vx: 0, vy: 320, texture: 'w_tombak', mult: 1.4 * power, source: 'ult', pierce: true }),
        );
      }
    },
  },

  kapak: {
    // Spin while moving, hitting everything close several times.
    skill: ({ p, world, scene, power }) => {
      p.spin(1000);
      for (let i = 0; i < 6; i++) later(scene, i * 170, () => world.area(p.x, p.y, 26, 0.8 * power, 120, 'skill'));
    },
    // Jump, slam, send ground waves both ways.
    ult: ({ p, world, scene, power }) => {
      p.invuln(1200);
      p.lock(1200);
      p.setVelocity(0, -260);
      p.onLand(() => {
        world.area(p.x, p.y, 50, 3 * power, 300, 'ult');
        for (const dir of [-1, 1]) {
          world.shot({
            x: p.x + dir * 10,
            y: FLOOR_Y - 3,
            vx: dir * 170,
            vy: 0,
            texture: 'wave',
            tint: 0xffa300,
            mult: 2 * power,
            source: 'ult',
            pierce: true,
          });
        }
        scene.cameras.main.shake(300, 0.03);
        p.lock(0);
      });
    },
  },

  busur: {
    skill: ({ p, world, power }) => {
      for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) {
        world.shot({
          x: p.x + p.facing * 6,
          y: p.y,
          vx: Math.cos(a) * 260 * p.facing,
          vy: Math.sin(a) * 260,
          texture: 'arrow',
          mult: 0.9 * power,
          source: 'skill',
        });
      }
    },
    // Three arrows fall on every enemy.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      targets.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          later(scene, i * 60 + k * 140, () => {
            if (t.active)
              world.shot({
                x: t.x + Phaser.Math.Between(-4, 4),
                y: -10,
                vx: 0,
                vy: 300,
                texture: 'arrow',
                mult: 1.3 * power,
                source: 'ult',
              });
          });
        }
      });
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
};
