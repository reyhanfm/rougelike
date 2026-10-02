import Phaser from 'phaser';
import { sfx } from '../audio.ts';
import { FLOOR_Y, H, W, floatText } from '../gfx/ui.ts';
import type { SpecialBoss } from '../logic/stages.ts';
import { ring, rocks, sparks } from './skills.ts';

/**
 * Entrance cinematics for a hidden boss that crashes into a normal round. Each one plays around `x` (where the boss
 * will stand) and returns how many ms until the boss should appear; it cleans up after itself.
 */
export type Intro = (scene: Phaser.Scene, x: number) => number;

const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);

/** Fade a set of objects out and destroy them. */
function fadeOut(scene: Phaser.Scene, objs: Phaser.GameObjects.GameObject[], delay: number, ms = 300): void {
  scene.tweens.add({ targets: objs, alpha: 0, delay, duration: ms, onComplete: () => objs.forEach((o) => o.destroy()) });
}

/** A dark overlay over the arena (under the HUD) that fades in. */
function dim(scene: Phaser.Scene, color: number, alpha: number, depth = 8): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(depth).setAlpha(0);
  scene.tweens.add({ targets: r, alpha: 1, duration: 350 });
  return r;
}

/** Shared by every intro: cinematic letterbox bars and the "PENYUSUP!" warning, then the boss name. */
export function invasionBanner(scene: Phaser.Scene, name: string, ms: number): void {
  const bars = [0, H].map((y, i) =>
    scene.add
      .rectangle(0, y, W, 10, 0x000000)
      .setOrigin(0, i ? 1 : 0)
      .setDepth(90)
      .setScale(1, 0),
  );
  scene.tweens.add({ targets: bars, scaleY: 1, duration: 300, ease: 'Quad.Out' });
  const warn = scene.add
    .text(W / 2, 44, '!! PENYUSUP !!', { fontFamily: '"Press Start 2P", monospace', fontSize: '12px', color: '#ff004d' })
    .setOrigin(0.5)
    .setDepth(95);
  scene.tweens.add({ targets: warn, alpha: 0.2, yoyo: true, repeat: 5, duration: 120 });
  later(scene, 1100, () => {
    warn.setText(name).setColor('#ffec27').setAlpha(0).setScale(1.6);
    scene.tweens.add({ targets: warn, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
  });
  fadeOut(scene, [warn], ms + 400, 400);
  scene.tweens.add({
    targets: bars,
    scaleY: 0,
    delay: ms + 200,
    duration: 300,
    onComplete: () => bars.forEach((b) => b.destroy()),
  });
}

export const INTROS: Record<SpecialBoss, Intro> = {
  // Mahoraga, summoned by the Ten Shadows: the light drains away, a pool of shadow spreads over the floor and the
  // incantation is spoken ("Furube yura yura... Yatsuka no Tsurugi Ikai Shinsho"). The eight-handled Dharma wheel
  // rises out of the shadow and turns once with a heavy clunk, then the general rises up through the pool.
  mahoraga: (scene, x) => {
    const shade = dim(scene, 0x05030a, 0.55);
    const pool = scene.add.graphics().setDepth(9);
    const drawPool = (r: number) => {
      pool.clear();
      pool.fillStyle(0x000000).fillEllipse(x, FLOOR_Y + 1, r * 2, r * 0.3);
      pool.lineStyle(1, 0x8a3fd1, 0.8).strokeEllipse(x, FLOOR_Y + 1, r * 2, r * 0.3);
      pool.lineStyle(1, 0x1d0f2e).strokeEllipse(x, FLOOR_Y + 1, r * 1.5, r * 0.2);
    };
    scene.tweens.addCounter({ from: 2, to: 46, duration: 700, ease: 'Quad.Out', onUpdate: (tw) => drawPool(tw.getValue() ?? 0) });
    // Shadow tendrils licking up out of the pool.
    for (let i = 0; i < 14; i++)
      later(scene, 200 + i * 70, () => {
        const tx = x + Phaser.Math.Between(-40, 40);
        const t = scene.add
          .rectangle(tx, FLOOR_Y, 2, Phaser.Math.Between(8, 22), i % 3 ? 0x1d0f2e : 0x8a3fd1)
          .setOrigin(0.5, 1)
          .setDepth(9)
          .setScale(1, 0);
        scene.tweens.add({ targets: t, scaleY: 1, yoyo: true, duration: 260, onComplete: () => t.destroy() });
      });
    later(scene, 250, () => floatText(scene, x, FLOOR_Y - 70, 'FURUBE YURA YURA...', '#c080ff'));
    later(scene, 900, () => floatText(scene, x, FLOOR_Y - 80, 'YATSUKA NO TSURUGI IKAI SHINSHO', '#c080ff'));
    // The wheel rises and turns: a quarter turn per clunk, the last one with a ring of light.
    const wheel = scene.add
      .image(x, FLOOR_Y + 10, 'mWheel')
      .setScale(3)
      .setDepth(9.5)
      .setAlpha(0);
    scene.tweens.add({ targets: wheel, y: FLOOR_Y - 58, alpha: 1, delay: 700, duration: 700, ease: 'Quad.Out' });
    for (let k = 0; k < 3; k++)
      later(scene, 1450 + k * 230, () => {
        scene.tweens.add({ targets: wheel, angle: wheel.angle + 45, duration: 90, ease: 'Back.Out' });
        scene.cameras.main.shake(90, 0.008);
        sparks(scene, wheel.x, wheel.y, [0xffec27, 0xfff1e8], 5, 20);
        if (k === 2) ring(scene, wheel.x, wheel.y, 0xffec27, 10, 60, 400, 2);
      });
    // The general rises through the pool as a silhouette, lit at the end.
    const body = scene.add
      .image(x, FLOOR_Y + 40, 'mahoraga')
      .setOrigin(0.5, 1)
      .setScale(1.4)
      .setTint(0x8a3fd1)
      .setDepth(9.6);
    scene.tweens.add({ targets: body, y: FLOOR_Y, delay: 1700, duration: 700, ease: 'Quad.Out' });
    later(scene, 2350, () => {
      scene.cameras.main.flash(200, 192, 128, 255);
      sfx('boss');
    });
    fadeOut(scene, [shade, pool, wheel, body], 2450);
    return 2500;
  },

  // Leviathan, from the deep: the arena floods, a vast serpent's back arcs through the water behind everything, its
  // eye opens under the surface, and it bursts out in a column of water.
  leviathan: (scene, x) => {
    const shade = dim(scene, 0x0a1a3a, 0.35);
    const SURF = FLOOR_Y - 14;
    const water = scene.add.graphics().setDepth(9);
    let level = H;
    const drawWater = (time: number) => {
      water.clear();
      water.fillStyle(0x1d2b53, 0.7).fillRect(0, level, W, H - level);
      water.fillStyle(0x29adff, 0.25).fillRect(0, level + 3, W, 2);
      for (let wx = 0; wx < W; wx += 4) {
        const wy = level + Math.sin(wx * 0.09 + time * 0.006) * 1.5;
        water.fillStyle(0xc2f0ff).fillRect(wx, wy, 3, 1);
      }
    };
    scene.tweens.addCounter({
      from: H,
      to: SURF,
      duration: 700,
      ease: 'Quad.Out',
      onUpdate: (tw) => {
        level = tw.getValue() ?? H;
      },
    });
    const ripple = scene.time.addEvent({ delay: 16, loop: true, callback: () => drawWater(scene.time.now) });
    // Bubbles rising everywhere.
    for (let i = 0; i < 26; i++)
      later(scene, i * 70, () => {
        const b = scene.add.circle(Phaser.Math.Between(4, W - 4), H - 2, Phaser.Math.Between(1, 2), 0xc2f0ff, 0.8).setDepth(9.1);
        scene.tweens.add({ targets: b, y: level + 2, duration: 600, onComplete: () => b.destroy() });
      });
    // The serpent's back: a dark silhouette sweeping across behind the arena in a long arc.
    const back = scene.add
      .image(-80, FLOOR_Y + 30, 'leviathan')
      .setScale(5)
      .setTint(0x29adff)
      .setAlpha(0.4)
      .setDepth(8.6);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      delay: 500,
      duration: 1300,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        back.setPosition(-80 + t * (W + 160), FLOOR_Y + 30 - Math.sin(t * Math.PI) * 55);
        back.setRotation(Math.cos(t * Math.PI) * -0.35);
      },
    });
    // The eye opens under the surface where it will rise.
    const eye = scene.add
      .ellipse(x, SURF + 6, 2, 1, 0xff004d)
      .setDepth(9.2)
      .setAlpha(0);
    scene.tweens.add({ targets: eye, alpha: 1, scaleX: 5, scaleY: 3, delay: 1500, duration: 300, yoyo: true, hold: 200 });
    // The eruption: a column of water, spray and a shock ring.
    later(scene, 2100, () => {
      sfx('explode');
      scene.cameras.main.shake(400, 0.025);
      ring(scene, x, SURF, 0xc2f0ff, 6, 70, 450, 2);
      for (const [w, c] of [
        [26, 0x29adff],
        [16, 0xc2f0ff],
        [6, 0xfff1e8],
      ] as const) {
        const col = scene.add.rectangle(x, SURF, w, 1, c, 0.85).setOrigin(0.5, 1).setDepth(9.3);
        scene.tweens.add({ targets: col, scaleY: 120, duration: 180, ease: 'Quad.Out' });
        scene.tweens.add({ targets: col, alpha: 0, delay: 350, duration: 300, onComplete: () => col.destroy() });
      }
      for (let i = 0; i < 18; i++) {
        const d = scene.add.circle(x, SURF - 20, 2, 0xc2f0ff).setDepth(9.3);
        scene.tweens.add({
          targets: d,
          x: x + Phaser.Math.Between(-70, 70),
          y: SURF - Phaser.Math.Between(0, 30),
          alpha: 0,
          duration: 600,
          ease: 'Quad.Out',
          onComplete: () => d.destroy(),
        });
      }
    });
    // The flood drains back away.
    later(scene, 2300, () =>
      scene.tweens.addCounter({
        from: SURF,
        to: H + 4,
        duration: 500,
        onUpdate: (tw) => {
          level = tw.getValue() ?? H;
        },
        onComplete: () => {
          ripple.remove();
          water.destroy();
        },
      }),
    );
    fadeOut(scene, [shade, back, eye], 2300);
    return 2300;
  },

  // Godzilla makes landfall: the ground shakes to three ever-closer footsteps as its silhouette looms over the
  // horizon, its dorsal plates light up blue one row at a time, and it roars before stomping into the arena.
  godzilla: (scene, x) => {
    const shade = dim(scene, 0x1a0e08, 0.45);
    const far = scene.add
      .image(x, FLOOR_Y + 80, 'godzilla')
      .setOrigin(0.5, 1)
      .setScale(4)
      .setTint(0x1d1d2b)
      .setAlpha(0.85)
      .setDepth(3)
      .setFlipX(x > W / 2);
    // Each step brings it closer and higher; the arena shakes harder each time.
    for (let k = 0; k < 3; k++)
      later(scene, 150 + k * 550, () => {
        sfx('explode');
        scene.cameras.main.shake(260, 0.01 + k * 0.008);
        for (let i = 0; i < 4 + k * 2; i++) rocks(scene, Phaser.Math.Between(10, W - 10), FLOOR_Y, 2);
        scene.tweens.add({ targets: far, y: FLOOR_Y + 50 - k * 22, scale: 4 + k * 0.4, duration: 260, ease: 'Quad.Out' });
        // Dust rolling along the floor.
        for (const s of [-1, 1]) {
          const dust = scene.add.ellipse(x, FLOOR_Y - 2, 20, 6, 0x83769c, 0.6).setDepth(9);
          scene.tweens.add({ targets: dust, x: x + s * 90, scaleX: 3, alpha: 0, duration: 600, onComplete: () => dust.destroy() });
        }
      });
    // The plates glow: a blue copy of the silhouette fades in, flickering brighter.
    const glow = scene.add
      .image(far.x, far.y, 'godzilla')
      .setOrigin(0.5, 1)
      .setScale(far.scale)
      .setTint(0x29adff)
      .setAlpha(0)
      .setDepth(3.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setFlipX(far.flipX);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0, to: 0.4 },
      delay: 1400,
      duration: 500,
      onUpdate: () => glow.setPosition(far.x, far.y).setScale(far.scale),
    });
    // The roar.
    later(scene, 2000, () => {
      floatText(scene, x, FLOOR_Y - 90, 'GYAOOOON!', '#29adff');
      scene.cameras.main.shake(600, 0.03);
      const hy = far.y - far.displayHeight * 0.8;
      for (let k = 0; k < 4; k++) later(scene, k * 110, () => ring(scene, far.x, hy, 0x29adff, 10, 180, 500, 3));
    });
    fadeOut(scene, [shade, far, glow], 2600);
    return 2700;
  },

  // Otsutsuki Kaguya descends: the sky turns the violet of the moon's dimension, a giant moon rises and the Rinne
  // Sharingan opens on it, a pillar of moonlight falls onto the arena with drifting feathers, and she floats down it.
  kaguya: (scene, x) => {
    const shade = dim(scene, 0x12062a, 0.6);
    const moon = scene.add
      .container(W / 2, 46)
      .setDepth(8.5)
      .setScale(0.2)
      .setAlpha(0);
    const mg = scene.add.graphics();
    mg.fillStyle(0xfff1e8, 0.15).fillCircle(0, 0, 40);
    mg.fillStyle(0xc2c3c7).fillCircle(0, 0, 32);
    mg.fillStyle(0xfff1e8).fillCircle(-4, -4, 27);
    mg.fillStyle(0xc2c3c7).fillCircle(-12, 6, 4).fillCircle(9, -12, 3).fillCircle(12, 10, 5);
    moon.add(mg);
    scene.tweens.add({ targets: moon, scale: 1, alpha: 1, duration: 700, ease: 'Quad.Out' });
    // The Rinne Sharingan: red iris, three black rings and nine tomoe, opening from the center.
    const eye = scene.add.graphics();
    eye.fillStyle(0xb3122e).fillCircle(0, 0, 22);
    eye.fillStyle(0xff004d).fillCircle(0, 0, 19);
    for (const r of [5, 11, 17]) eye.lineStyle(1, 0x1d0f2e).strokeCircle(0, 0, r);
    for (const [r, n] of [
      [8, 3],
      [14, 3],
      [20, 3],
    ] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.3;
        eye.fillStyle(0x1d0f2e).fillCircle(Math.cos(a) * r, Math.sin(a) * r, 1.5);
      }
    eye.fillStyle(0x1d0f2e).fillCircle(0, 0, 2);
    const eyeC = scene.add.container(0, 0, [eye]).setScale(1, 0);
    moon.add(eyeC);
    scene.tweens.add({ targets: eyeC, scaleY: 1, delay: 800, duration: 350, ease: 'Back.Out' });
    scene.tweens.add({ targets: eyeC, angle: 120, delay: 800, duration: 1700 });
    later(scene, 900, () => {
      scene.cameras.main.flash(180, 255, 0, 77);
      floatText(scene, W / 2, 96, 'KEMBALIKAN CHAKRAKU!', '#ff77a8');
    });
    // The pillar of moonlight and the feathers drifting down it.
    const pillar = [scene.add.rectangle(x, 0, 30, FLOOR_Y, 0xc080ff, 0.25), scene.add.rectangle(x, 0, 10, FLOOR_Y, 0xfff1e8, 0.6)].map(
      (r) => r.setOrigin(0.5, 0).setDepth(9).setScale(1, 0),
    );
    scene.tweens.add({ targets: pillar, scaleY: 1, delay: 1300, duration: 300, ease: 'Quad.In' });
    later(scene, 1600, () => ring(scene, x, FLOOR_Y - 2, 0xc080ff, 4, 50, 400, 2));
    for (let i = 0; i < 20; i++)
      later(scene, 1300 + i * 50, () => {
        const f = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), -4, 3, 1, 0xfff1e8).setDepth(9.2);
        scene.tweens.add({
          targets: f,
          y: FLOOR_Y - Phaser.Math.Between(0, 40),
          x: f.x + Phaser.Math.Between(-20, 20),
          angle: 360,
          alpha: 0,
          duration: 1100,
          onComplete: () => f.destroy(),
        });
      });
    // She floats down the pillar.
    const her = scene.add.image(x, -30, 'kaguya').setScale(1.5).setDepth(9.3).setTint(0xfff1e8);
    scene.tweens.add({ targets: her, y: FLOOR_Y - 60, delay: 1500, duration: 900, ease: 'Sine.Out' });
    fadeOut(scene, [shade, moon, ...pillar, her], 2450);
    return 2500;
  },
};
