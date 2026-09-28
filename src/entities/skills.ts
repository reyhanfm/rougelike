import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark, floatText } from '../gfx/ui.ts';
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

/** An expanding (or closing, when to < from) ring outline that fades. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, from: number, to: number, ms: number, width = 1): void {
  const c = scene.add.circle(x, y, from).setStrokeStyle(width, color).setDepth(13);
  scene.tweens.add({ targets: c, radius: to, alpha: 0, duration: ms, onComplete: () => c.destroy() });
}

/** `n` 1px sparks flung outward from (x, y) up to `dist` px. */
export function sparks(scene: Phaser.Scene, x: number, y: number, colors: number[], n: number, dist: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = dist * (0.4 + Math.random() * 0.6);
    const s = scene.add.rectangle(x, y, 1, 1, colors[i % colors.length]).setDepth(14);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      duration: 300,
      onComplete: () => s.destroy(),
    });
  }
}

/** Thorns bursting out of (x, y): `n` lines snapping outward (Gae Bolg's barbs). */
export function thorns(scene: Phaser.Scene, x: number, y: number, color: number, n: number, len: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const t = scene.add
      .rectangle(x + (Math.cos(a) * len) / 2, y + (Math.sin(a) * len) / 2, len, 1, color)
      .setRotation(a)
      .setScale(0, 1)
      .setDepth(14);
    scene.tweens.add({ targets: t, scaleX: 1, duration: 70, yoyo: true, hold: 120, onComplete: () => t.destroy() });
  }
}

/** Chunks of rock thrown up from the ground at x that fall back down. */
export function rocks(scene: Phaser.Scene, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = scene.add.rectangle(x, y, 2, 2, i % 2 ? 0xab5236 : 0x5f574f).setDepth(13);
    const dx = Phaser.Math.Between(-40, 40);
    const up = Phaser.Math.Between(14, 34);
    scene.tweens.add({
      targets: r,
      x: x + dx,
      y: y - up,
      angle: 180,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () =>
        scene.tweens.add({ targets: r, x: x + dx * 1.3, y, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => r.destroy() }),
    });
  }
}

/** A fireball blast of radius r: a flash, a ring, smoke drifting up and debris. */
export function explosion(scene: Phaser.Scene, x: number, y: number, r: number): void {
  const core = scene.add.circle(x, y, r * 0.3, 0xffec27).setDepth(13);
  const fire = scene.add.circle(x, y, r * 0.5, 0xffa300, 0.8).setDepth(12);
  scene.tweens.add({ targets: core, radius: r * 0.7, alpha: 0, duration: 180, onComplete: () => core.destroy() });
  scene.tweens.add({ targets: fire, radius: r, alpha: 0, duration: 320, onComplete: () => fire.destroy() });
  ring(scene, x, y, 0xff004d, r * 0.5, r * 1.3, 350, 2);
  for (let i = 0; i < 6; i++) {
    const s = scene.add.circle(x + Phaser.Math.Between(-r / 2, r / 2), y, Phaser.Math.Between(3, 5), 0x5f574f, 0.7).setDepth(12);
    scene.tweens.add({
      targets: s,
      y: y - Phaser.Math.Between(14, 30),
      scale: 1.8,
      alpha: 0,
      duration: 700,
      onComplete: () => s.destroy(),
    });
  }
  sparks(scene, x, y, [0xffa300, 0xffec27], 10, r * 1.4);
}

/** A soul-light wisp that flies from (x, y) into the player. */
function soulTo(scene: Phaser.Scene, x: number, y: number, p: Player, color: number): void {
  const w = scene.add.rectangle(x, y, 2, 2, color).setDepth(14);
  const cx = (x + p.x) / 2;
  const cy = Math.min(y, p.y) - 30;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 400,
    onUpdate: (tw) => {
      const [bx, by] = bez(x, y, cx, cy, p.x, p.y, tw.getValue() ?? 0);
      w.setPosition(bx, by);
    },
    onComplete: () => w.destroy(),
  });
}

/** Point `t` (0..1) along the quadratic curve from (x0, y0) bent toward (cx, cy) to (x1, y1). */
function bez(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** Calls `fn` every `ms` while `obj` is alive (for projectile trails). */
function whileAlive(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject, ms: number, fn: (k: number) => void): void {
  let k = 0;
  const ev = scene.time.addEvent({ delay: ms, loop: true, callback: () => (obj.active ? fn(k++) : ev.remove()) });
}

/** Four-point star flash on a blade (the samurai's stance before a draw). */
export function glint(scene: Phaser.Scene, x: number, y: number): void {
  const star = [scene.add.rectangle(x, y, 9, 1, 0xfff1e8), scene.add.rectangle(x, y, 1, 9, 0xfff1e8)];
  star.forEach((r) => r.setDepth(14).setScale(0));
  scene.tweens.add({ targets: star, scale: 1, angle: 45, duration: 120, yoyo: true, onComplete: () => star.forEach((r) => r.destroy()) });
}

/** A fading solid-color copy of the player at (x, y). */
export function afterimage(scene: Phaser.Scene, p: Player, x: number, y: number, alpha: number, color = 0xfff1e8): void {
  const g = scene.add
    .image(x, y, p.texture.key)
    .setFlipX(p.flipX)
    .setTint(color)
    .setTintMode(Phaser.TintModes.FILL)
    .setAlpha(alpha)
    .setDepth(9);
  scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
}

/** A flash-step's path: a white core over a colored glow from (x1, y1) to (x2, y2) that hangs for `hold` ms, then snaps shut. */
export function bladeLine(scene: Phaser.Scene, x1: number, y1: number, x2: number, y2: number, color: number, hold: number): void {
  const len = Phaser.Math.Distance.Between(x1, y1, x2, y2) + 16;
  const a = Phaser.Math.Angle.Between(x1, y1, x2, y2);
  const line = [scene.add.rectangle(0, 0, len, 5, color, 0.35), scene.add.rectangle(0, 0, len, 1, 0xfff1e8)];
  line.forEach((l) =>
    l
      .setPosition((x1 + x2) / 2, (y1 + y2) / 2)
      .setRotation(a)
      .setDepth(13),
  );
  scene.tweens.add({ targets: line, scaleY: 0, alpha: 0, delay: hold, duration: 220, onComplete: () => line.forEach((l) => l.destroy()) });
}

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
    // Evening bell: a spectral bell swings over the nearest enemy, three rings of sound close in on it, then
    // Azrael's greatsword drops from above in blue flame (executes the weak).
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      const bell = scene.add
        .image(t.x, t.y - 26, 'i_lonceng')
        .setScale(1.5)
        .setAlpha(0)
        .setDepth(13);
      scene.tweens.add({ targets: bell, alpha: 0.9, duration: 150 });
      scene.tweens.add({ targets: bell, angle: { from: -25, to: 25 }, duration: 140, yoyo: true, repeat: 1 });
      floatText(scene, t.x, t.y - 40, 'DONG', '#c2c3c7');
      for (let i = 0; i < 3; i++) later(scene, i * 120, () => t.active && ring(scene, t.x, t.y, 0x29adff, 30, 3, 250));
      later(scene, 450, () => {
        scene.tweens.add({ targets: bell, alpha: 0, duration: 150, onComplete: () => bell.destroy() });
        if (!t.active) return;
        const sword = scene.add
          .image(t.x, t.y - 60, 'w_belati')
          .setAngle(90)
          .setScale(2)
          .setTint(0xc2f0ff)
          .setDepth(14);
        scene.tweens.add({
          targets: sword,
          y: t.y,
          duration: 120,
          ease: 'Quad.In',
          onComplete: () => {
            scene.tweens.add({ targets: sword, alpha: 0, duration: 250, onComplete: () => sword.destroy() });
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0x29adff, 36, Math.PI / 2);
            sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 12, 30);
            scene.cameras.main.shake(120, 0.012);
            world.strike(t, (doomed(t) ? 50 : 3) * power, 'skill', true);
          },
        });
      });
    },
    // Azrael: the world goes black under a giant skull mask, the bell tolls three times (rings sweep the arena and
    // blue flame catches every enemy), then the greatsword falls on each one at once.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      p.invuln(2000);
      p.lock(1600);
      p.setVelocityX(0);
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x05050f, 0.7)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      const skull = scene.add
        .image(W / 2, 60, 'i_tengkorak')
        .setScale(8)
        .setTint(0xc2c3c7)
        .setAlpha(0)
        .setDepth(8);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 300 });
      scene.tweens.add({ targets: skull, alpha: 0.35, duration: 600 });
      for (let i = 0; i < 3; i++)
        later(scene, 200 + i * 350, () => {
          floatText(scene, W / 2, 30, 'DONG', '#c2c3c7');
          ring(scene, p.x, p.y, 0xc2c3c7, 4, 220, 500);
          scene.cameras.main.shake(100, 0.006);
          for (const t of targets) if (t.active) sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 5, 12);
        });
      later(scene, 1250, () => {
        for (const t of targets) {
          if (!t.active) continue;
          const sword = scene.add
            .image(t.x, t.y - 50, 'w_belati')
            .setAngle(90)
            .setScale(2)
            .setTint(0xc2f0ff)
            .setDepth(14);
          scene.tweens.add({
            targets: sword,
            y: t.y,
            duration: 100,
            onComplete: () => scene.tweens.add({ targets: sword, alpha: 0, duration: 300, onComplete: () => sword.destroy() }),
          });
          cutMark(scene, t.x, t.y, 0x29adff, 40, Math.PI / 2);
          world.strike(t, (doomed(t) ? 50 : 4) * power, 'ult', true);
        }
        scene.cameras.main.flash(200, 41, 173, 255);
        scene.cameras.main.shake(300, 0.02);
        scene.tweens.add({ targets: [dark, skull], alpha: 0, duration: 500, onComplete: () => (dark.destroy(), skull.destroy()) });
      });
    },
  },

  tombak: {
    // Gae Bolg: causality reversed. The heart is pierced first (red barbs burst out of the target), then the spear
    // arrives after it along a bent crimson path.
    skill: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.facing = t.x >= p.x ? 1 : -1;
      p.lock(250);
      p.setVelocityX(0);
      world.strike(t, 3 * power, 'skill', true);
      thorns(scene, t.x, t.y, 0xff004d, 8, 18);
      const [x0, y0, x1, y1] = [p.x, p.y, t.x, t.y];
      const cx = (x0 + x1) / 2;
      const cy = Math.min(y0, y1) - 50;
      const path = scene.add.graphics().setDepth(13).lineStyle(2, 0xff004d);
      path.beginPath().moveTo(x0, y0);
      for (let i = 1; i <= 16; i++) path.lineTo(...bez(x0, y0, cx, cy, x1, y1, i / 16));
      path.strokePath();
      scene.tweens.add({ targets: path, alpha: 0, duration: 450, onComplete: () => path.destroy() });
      const spear = scene.add.image(x0, y0, 'w_tombak').setDepth(14);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 170,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          const [ax, ay] = bez(x0, y0, cx, cy, x1, y1, v);
          const [bx, by] = bez(x0, y0, cx, cy, x1, y1, Math.min(1, v + 0.05));
          spear.setPosition(ax, ay).setRotation(Math.atan2(by - ay, bx - ax));
        },
        onComplete: () => scene.tweens.add({ targets: spear, alpha: 0, duration: 200, onComplete: () => spear.destroy() }),
      });
    },
    // Gae Bolg, soaring: a crimson circle at his feet, he leaps and the spear spins up in his hand gathering power,
    // then the throw splits into red spears hunting every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1500);
      ring(scene, p.x, p.y + 6, 0xff004d, 4, 40, 400, 2);
      p.setVelocity(0, -380);
      const spear = scene.add
        .image(p.x, p.y - 12, 'w_tombak')
        .setTint(0xff004d)
        .setScale(1.5)
        .setDepth(14);
      scene.tweens.add({ targets: spear, angle: -450, duration: 380, onUpdate: () => spear.setPosition(p.x, p.y - 12) });
      later(scene, 400, () => {
        spear.destroy();
        floatText(scene, W / 2, 40, 'GAE BOLG!', '#ff004d');
        thorns(scene, p.x, p.y, 0xff004d, 12, 30);
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
    // Mad roar: the sky flashes red, two shockwave rings and flying rocks blow everything away and stagger it.
    skill: ({ p, world, scene, power }) => {
      scene.cameras.main.shake(300, 0.018);
      scene.cameras.main.flash(120, 255, 0, 77);
      floatText(scene, p.x, p.y - 20, 'GRAAAH!', '#ff004d');
      ring(scene, p.x, p.y, 0xff004d, 6, 70, 300, 3);
      later(scene, 100, () => ring(scene, p.x, p.y, 0xab5236, 6, 90, 400, 2));
      rocks(scene, p.x, FLOOR_Y - 2, 10);
      world.area(p.x, p.y, 70, 0.8 * power, 300, 'skill', { freeze: 600 });
    },
    // Nine Lives: Heracles closes in and strikes nine times from alternating sides, counting each blow;
    // the ninth craters the ground.
    ult: ({ p, world, scene, power }) => {
      const t = world.targets(p.x, p.y)[0];
      if (!t) return false;
      p.invuln(1600);
      p.lock(1300);
      for (let i = 0; i < 9; i++) {
        later(scene, i * 110, () => {
          if (!t.active) return;
          const last = i === 8;
          const side = i % 2 ? 1 : -1;
          p.ghost(0xff004d);
          p.body.reset(Phaser.Math.Clamp(t.x + side * 14, 8, W - 8), Math.min(t.y, FLOOR_Y - 8));
          p.facing = -side;
          cutMark(scene, t.x, t.y, last ? 0xff004d : 0xffa300, last ? 40 : 28);
          ring(scene, t.x, t.y, 0xab5236, 2, last ? 50 : 14, 220, last ? 3 : 1);
          floatText(scene, t.x, t.y - 26, `${i + 1}`, last ? '#ff004d' : '#ffa300');
          world.strike(t, (last ? 3 : 0.9) * power, 'ult', last);
          world.area(t.x, t.y, 26, 0.3 * power, last ? 260 : 30, 'ult');
          if (last) {
            scene.cameras.main.shake(250, 0.02);
            rocks(scene, t.x, FLOOR_Y - 2, 14);
          }
        });
      }
    },
  },

  busur: {
    // Caladbolg II: he traces his black bow, blue light spirals into it, then the twisted sword flies as an arrow, drilling the air with a
    // double helix behind it; it detonates on the first thing it hits.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(240);
      p.setVelocityX(0);
      // Trace on: the black bow materializes in his hand from white outline to solid, and fades once the shot is loosed.
      const bow = scene.add
        .image(p.x + f * 7, p.y, 'busurHitam')
        .setFlipX(f < 0)
        .setTint(0xfff1e8)
        .setTintMode(Phaser.TintModes.FILL)
        .setDepth(12);
      later(scene, 90, () => bow.active && bow.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY));
      scene.tweens.add({ targets: bow, alpha: 0, delay: 300, duration: 200, onComplete: () => bow.destroy() });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const m = scene.add.rectangle(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26, 1, 1, 0x29adff).setDepth(13);
        scene.tweens.add({ targets: m, x: p.x + f * 6, y: p.y, duration: 200, onComplete: () => m.destroy() });
      }
      later(scene, 220, () => {
        if (!p.active) return;
        const arrow = world.shot({
          x: p.x + f * 8,
          y: p.y,
          vx: f * 320,
          vy: 0,
          texture: 'arrow',
          tint: 0x29adff,
          mult: 2 * power,
          source: 'skill',
          explode: 32,
        }) as Phaser.GameObjects.Image;
        arrow.setScale(1.6);
        whileAlive(scene, arrow, 25, (k) => {
          for (const s of [1, -1]) {
            const d = scene.add.rectangle(arrow.x, arrow.y + s * Math.sin(k * 0.9) * 4, 1, 1, s > 0 ? 0x29adff : 0xfff1e8).setDepth(12);
            scene.tweens.add({ targets: d, alpha: 0, duration: 220, onComplete: () => d.destroy() });
          }
        });
        arrow.once('destroy', () => {
          if (arrow.x > 0 && arrow.x < W) {
            ring(scene, arrow.x, arrow.y, 0x29adff, 6, 36, 300, 2);
            sparks(scene, arrow.x, arrow.y, [0x29adff, 0xfff1e8], 12, 34);
          }
        });
      });
    },
    // Unlimited Blade Works: a ring of fire sweeps out from him, the sky turns to rust with great gears turning in it,
    // a field of swords rises out of the ground, and then they rain down on every enemy.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      floatText(scene, W / 2, 30, 'I AM THE BONE OF MY SWORD', '#ffa300');
      ring(scene, p.x, p.y, 0xffa300, 4, 360, 600, 3);
      const field = scene.add.rectangle(0, 0, W, FLOOR_Y, 0xab5236, 0.3).setOrigin(0).setDepth(3).setAlpha(0);
      const gears = [
        [60, 36, 26],
        [250, 50, 34],
        [160, 20, 16],
      ].map(([x, y, r], i) => {
        const g = scene.add
          .star(x, y, 10, r * 0.8, r, 0x5f574f, 0.5)
          .setDepth(3)
          .setAlpha(0);
        scene.tweens.add({ targets: g, angle: i % 2 ? -360 : 360, duration: 3000 });
        return g;
      });
      const planted = Array.from({ length: 18 }, (_, i) =>
        scene.add
          .image(
            8 + (i * (W - 16)) / 17 + Phaser.Math.Between(-4, 4),
            FLOOR_Y + 8,
            Phaser.Math.RND.pick(['w_pedang', 'w_katana', 'w_belati', 'w_tombak']),
          )
          .setAngle(-90 + Phaser.Math.Between(-15, 15))
          .setTint(0xc2c3c7)
          .setDepth(4),
      );
      scene.tweens.add({ targets: [field, ...gears], alpha: 1, duration: 400 });
      scene.tweens.add({ targets: planted, y: FLOOR_Y - 6, duration: 300, delay: 300, ease: 'Back.Out' });
      for (let i = 0; i < 28; i++) {
        later(scene, 500 + i * 90, () => {
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
      later(scene, 3200, () =>
        scene.tweens.add({
          targets: [field, ...gears, ...planted],
          alpha: 0,
          duration: 500,
          onComplete: () => [field, ...gears, ...planted].forEach((o) => o.destroy()),
        }),
      );
    },
  },

  sabit: {
    // Soul harvest: pale chains of soul-light hook everything nearby and drag it in, while a phantom scythe blade
    // circles him once; then the reap.
    skill: ({ p, world, scene, power }) => {
      p.spin(400);
      for (const t of world.targets(p.x, p.y).filter((t) => Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 80)) {
        const g = scene.add.graphics().setDepth(12).lineStyle(1, 0x29adff, 0.8).lineBetween(t.x, t.y, p.x, p.y);
        scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
      }
      const arc = scene.add.image(p.x, p.y, 'slashMoon').setTint(0xc2c3c7).setScale(3.5).setAlpha(0.85).setDepth(13);
      scene.tweens.add({
        targets: arc,
        angle: 360 * p.facing,
        alpha: 0,
        duration: 420,
        onUpdate: () => arc.setPosition(p.x, p.y),
        onComplete: () => arc.destroy(),
      });
      world.area(p.x, p.y, 80, 0.4 * power, -230, 'skill');
      // Small push so reaped enemies stay in reach of the next swing.
      later(scene, 250, () => {
        world.area(p.x, p.y, 34, 1.4 * power, 40, 'skill');
        sparks(scene, p.x, p.y, [0x29adff, 0xc2c3c7], 10, 34);
      });
    },
    // Harvest of death: the arena dims to violet and a giant scythe blade sweeps across it. Each enemy it passes is cut
    // and its soul flies into the reaper, healing him.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y);
      if (!targets.length) return false;
      const f = p.facing;
      p.invuln(1400);
      p.lock(900);
      p.setVelocityX(0);
      const dusk = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0x2a0a2a, 0.55)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      scene.tweens.add({ targets: dusk, alpha: 1, duration: 200, yoyo: true, hold: 800, onComplete: () => dusk.destroy() });
      const blade = scene.add
        .image(f > 0 ? -40 : W + 40, p.y - 20, 'slashMoon')
        .setTint(0xc2c3c7)
        .setScale(f * 6, 9)
        .setAlpha(0.85)
        .setDepth(13);
      scene.tweens.add({
        targets: blade,
        x: f > 0 ? W + 40 : -40,
        duration: 700,
        delay: 200,
        ease: 'Sine.InOut',
        onComplete: () => blade.destroy(),
      });
      for (const t of targets) {
        const frac = f > 0 ? t.x / W : 1 - t.x / W;
        later(scene, 200 + Phaser.Math.Clamp(frac, 0, 1) * 700, () => {
          if (!t.active) return;
          cutMark(scene, t.x, t.y, 0x29adff, 30);
          world.strike(t, 2.2 * power, 'ult', false);
          soulTo(scene, t.x, t.y, p, 0x29adff);
          p.heal(5);
        });
      }
    },
  },

  senapan: {
    // Grenade: lobbed in an arc, spinning, then a fireball blast with smoke and debris.
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
          explosion(scene, x, y, 34);
          world.area(x, y, 34, 3.8 * power, 140, 'skill');
          scene.cameras.main.shake(140, 0.012);
        },
      });
    },
    // Suppressing fire: a laser sight locks on, then twelve piercing rounds, each with a muzzle flash and a spent
    // casing ejected behind.
    ult: ({ p, world, scene, power }) => {
      const facing = p.facing;
      p.lock(1150);
      p.invuln(350);
      p.setVelocityX(0);
      const laser = scene.add
        .rectangle(p.x + facing * 10, p.y + 1, W, 1, 0xff004d, 0.7)
        .setOrigin(facing > 0 ? 0 : 1, 0.5)
        .setDepth(12);
      scene.tweens.add({ targets: laser, alpha: 0, duration: 200, delay: 150, onComplete: () => laser.destroy() });
      for (let i = 0; i < 12; i++)
        later(scene, 200 + i * 75, () => {
          if (!p.active || p.hp <= 0) return;
          const mx = p.x + facing * 12;
          const flash = scene.add.circle(mx, p.y + 1, 3, 0xffec27).setDepth(13);
          scene.tweens.add({ targets: flash, radius: 1, alpha: 0, duration: 60, onComplete: () => flash.destroy() });
          const shell = scene.add.rectangle(p.x, p.y - 2, 1, 2, 0xffa300).setDepth(13);
          scene.tweens.add({
            targets: shell,
            x: p.x - facing * Phaser.Math.Between(6, 14),
            y: FLOOR_Y,
            angle: 360,
            duration: 380,
            ease: 'Quad.In',
            onComplete: () => shell.destroy(),
          });
          scene.cameras.main.shake(40, 0.004);
          world.shot({
            x: mx,
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
    // Sword formation: a qi seal turns behind him, six swords flash into being in a fan over his head, then fly off one
    // by one to hunt, each trailing qi.
    skill: ({ p, world, scene, power }) => {
      const seal = scene.add
        .circle(p.x, p.y - 6, 22)
        .setStrokeStyle(1, 0x29adff)
        .setDepth(9);
      const inner = scene.add
        .star(p.x, p.y - 6, 6, 8, 18)
        .setStrokeStyle(1, 0xc2f0ff)
        .setDepth(9);
      scene.tweens.add({
        targets: [seal, inner],
        angle: 120,
        alpha: 0,
        duration: 800,
        onComplete: () => (seal.destroy(), inner.destroy()),
      });
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + ((i + 0.5) / 6) * Math.PI;
        const sword = scene.add
          .image(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 'w_pedangTerbang')
          .setRotation(a)
          .setTint(0x29adff)
          .setScale(0)
          .setDepth(12);
        scene.tweens.add({ targets: sword, scale: 1, duration: 120, delay: i * 30, ease: 'Back.Out' });
        later(scene, 250 + i * 90, () => {
          const shot = world.shot({
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
          whileAlive(scene, shot, 40, () => {
            const q = shot as Phaser.GameObjects.Image;
            const d = scene.add.rectangle(q.x, q.y, 1, 1, 0xc2f0ff).setDepth(11);
            scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          });
          sword.destroy();
        });
      }
    },
    // Ten thousand swords return: a golden ring of swords wheels above him, then golden swords converge on every
    // enemy from all sides, and the formation closes in one qi burst.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      p.invuln(1900);
      p.lock(1800);
      p.setVelocity(0, -60);
      p.ghost(0xffec27);
      scene.cameras.main.flash(250, 255, 236, 39);
      const wheel = Array.from({ length: 12 }, () => scene.add.image(p.x, p.y, 'w_pedangTerbang').setTint(0xffec27).setDepth(12));
      scene.tweens.addCounter({
        from: 0,
        to: Math.PI * 4,
        duration: 1700,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          wheel.forEach((s, i) => {
            const a = v + (i / 12) * Math.PI * 2;
            s.setPosition(p.x + Math.cos(a) * 30, p.y - 30 + Math.sin(a) * 10).setRotation(a + Math.PI / 2);
          });
        },
        onComplete: () => wheel.forEach((s) => s.destroy()),
      });
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
        ring(scene, p.x, p.y, 0xffec27, 6, 70, 350, 3);
        sparks(scene, p.x, p.y, [0xffec27, 0x29adff], 16, 60);
        world.area(p.x, p.y, 60, 2 * power, 220, 'ult');
        scene.cameras.main.shake(200, 0.015);
      });
    },
  },

  tongkat: {
    // Frost nova: a ring of cold bursts out, ice shards fly and crystals crack up from the ground around him.
    skill: ({ p, world, scene, power }) => {
      scene.cameras.main.flash(120, 41, 173, 255);
      ring(scene, p.x, p.y, 0xc2f0ff, 4, 46, 300, 2);
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
      for (const dx of [-30, -18, 18, 30]) {
        const c = scene.add
          .triangle(p.x + dx, FLOOR_Y, 0, 0, 3, -10, 6, 0, 0xc2f0ff)
          .setOrigin(0.5, 1)
          .setScale(1, 0)
          .setDepth(9);
        scene.tweens.add({ targets: c, scaleY: 1, duration: 120, yoyo: true, hold: 400, onComplete: () => c.destroy() });
      }
      world.area(p.x, p.y, 44, 1.2 * power, 60, 'skill', { freeze: 1800 });
    },
    // Meteors streak down trailing fire and burst on every enemy, then a blizzard of snow sweeps the arena and freezes it.
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
          whileAlive(scene, meteor, 30, () => {
            const e = scene.add.rectangle(meteor.x, meteor.y, 2, 2, Phaser.Math.RND.pick([0xff004d, 0xffa300])).setDepth(11);
            scene.tweens.add({ targets: e, alpha: 0, y: e.y - 4, duration: 200, onComplete: () => e.destroy() });
          });
          scene.tweens.add({
            targets: meteor,
            x,
            y,
            duration: 300,
            onComplete: () => {
              meteor.destroy();
              explosion(scene, x, y, 22);
              world.area(x, y, 26, 1.8 * power, 120, 'ult', { burn: 0.4 });
              scene.cameras.main.shake(80, 0.008);
            },
          });
        });
      }
      later(scene, 1300, () => {
        for (let i = 0; i < 40; i++) {
          const f = scene.add.rectangle(W + Phaser.Math.Between(0, 60), Phaser.Math.Between(0, FLOOR_Y), 2, 1, 0xfff1e8).setDepth(13);
          scene.tweens.add({ targets: f, x: -10, y: f.y + 30, duration: Phaser.Math.Between(400, 700), onComplete: () => f.destroy() });
        }
      });
      later(scene, 1500, () => {
        scene.cameras.main.flash(250, 41, 173, 255);
        world.area(p.x, p.y, 400, 0.5 * power, 0, 'ult', { freeze: 2000 });
      });
    },
  },

  busurArkana: {
    // Arcane ring: a magic circle turns under her, then eight magic arrows burst outward and each hunts an enemy.
    skill: ({ p, world, scene, power }) => {
      const circle = [
        scene.add.circle(p.x, p.y, 20).setStrokeStyle(1, 0xff77a8),
        scene.add.star(p.x, p.y, 8, 9, 18).setStrokeStyle(1, 0x83769c),
      ];
      circle.forEach((c) => c.setDepth(9));
      scene.tweens.add({ targets: circle, angle: 90, alpha: 0, duration: 600, onComplete: () => circle.forEach((c) => c.destroy()) });
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
    // Starfall: a constellation lights up across the sky, its lines drawn star to star, and golden arcane arrows fall
    // from each star and home in.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const stars = Array.from({ length: 7 }, (_, i) => ({
        x: 20 + i * 46 + Phaser.Math.Between(-10, 10),
        y: Phaser.Math.Between(12, 44),
      }));
      const sky = scene.add.graphics().setDepth(4).lineStyle(1, 0xff77a8, 0.6);
      sky.beginPath().moveTo(stars[0].x, stars[0].y);
      for (const s of stars) sky.lineTo(s.x, s.y);
      sky.strokePath();
      sky.setAlpha(0);
      const dots = stars.map((s) => scene.add.star(s.x, s.y, 4, 1, 4, 0xffec27).setDepth(5).setScale(0));
      scene.tweens.add({ targets: sky, alpha: 1, duration: 400 });
      scene.tweens.add({ targets: dots, scale: 1, angle: 90, duration: 300, ease: 'Back.Out' });
      for (let i = 0; i < 16; i++) {
        later(scene, 350 + i * 70, () => {
          const s = stars[i % stars.length];
          world.shot({
            x: s.x,
            y: s.y,
            vx: 0,
            vy: 170,
            texture: 'panahArkana',
            tint: 0xffec27,
            mult: 1 * power,
            source: 'ult',
            homing: true,
          });
        });
      }
      later(scene, 1700, () =>
        scene.tweens.add({
          targets: [sky, ...dots],
          alpha: 0,
          duration: 400,
          onComplete: () => [sky, ...dots].forEach((o) => o.destroy()),
        }),
      );
    },
  },

  pedangGelap: {
    // Dark crescent (three while awakened): each trails violet smoke as it cuts through the line.
    skill: ({ p, world, scene, power }) => {
      ring(scene, p.x, p.y, 0x8a3fd1, 18, 4, 150);
      for (const a of p.awakened ? [-0.2, 0, 0.2] : [0]) {
        const wave = world.shot({
          x: p.x + p.facing * 10,
          y: p.y,
          vx: Math.cos(a) * 220 * p.facing,
          vy: Math.sin(a) * 220,
          texture: 'slashMoon',
          tint: 0x8a3fd1,
          mult: 1.8 * power,
          source: 'skill',
          pierce: true,
        }) as Phaser.GameObjects.Image;
        wave.setScale(p.facing * 1.3, 1.3);
        whileAlive(scene, wave, 35, () => {
          const s = scene.add.rectangle(wave.x - p.facing * 4, wave.y + Phaser.Math.Between(-8, 8), 2, 2, 0x7e2553, 0.8).setDepth(11);
          scene.tweens.add({ targets: s, y: s.y - 6, alpha: 0, duration: 300, onComplete: () => s.destroy() });
        });
      }
    },
    ult: () => false,
  },

  enamLengan: {
    // Thousand fists: speed lines stream past as a barrage of golden fists hammers the front, each landing in a burst.
    skill: ({ p, world, scene, power }) => {
      p.lock(1000);
      p.setVelocityX(0);
      for (let i = 0; i < 10; i++) {
        later(scene, i * 90, () => {
          const x = p.x + p.facing * 18;
          world.area(x, p.y + Phaser.Math.Between(-4, 4), 20, 0.35 * power, 30, 'skill');
          const y = p.y + Phaser.Math.Between(-7, 7);
          const fist = scene.add
            .image(p.x + p.facing * 6, y, 'w_enamLengan')
            .setTint(i % 2 ? 0xffec27 : 0xfff1e8)
            .setDepth(13)
            .setFlipX(p.facing < 0);
          scene.tweens.add({ targets: fist, x: x + p.facing * 6, alpha: 0, duration: 110, onComplete: () => fist.destroy() });
          const line = scene.add.rectangle(x, y + Phaser.Math.Between(-3, 3), 10, 1, 0xfff1e8, 0.8).setDepth(12);
          scene.tweens.add({ targets: line, x: x + p.facing * 14, alpha: 0, duration: 120, onComplete: () => line.destroy() });
          later(scene, 80, () => sparks(scene, x + p.facing * 6, y, [0xffec27, 0xffa300], 4, 10));
        });
      }
    },
    // Ashura form: a golden halo blazes behind him with six phantom arms fanned around it, fury maxed, invulnerable,
    // and six waves of phantom fists burst outward.
    ult: ({ p, world, scene, power }) => {
      p.gainFury(99);
      p.invuln(1500);
      p.lock(1200);
      p.setVelocityX(0);
      scene.cameras.main.flash(150, 255, 236, 39);
      floatText(scene, p.x, p.y - 30, 'ASHURA!', '#ffec27');
      const halo = scene.add
        .circle(p.x, p.y - 4, 18)
        .setStrokeStyle(2, 0xffec27)
        .setDepth(9);
      const arms = Array.from({ length: 6 }, (_, k) => {
        const a = -Math.PI / 2 + (k - 2.5) * 0.45;
        return scene.add
          .image(p.x + Math.cos(a) * 16, p.y - 4 + Math.sin(a) * 16, 'w_enamLengan')
          .setRotation(a)
          .setTint(0xffec27)
          .setAlpha(0.8)
          .setDepth(9);
      });
      scene.tweens.add({
        targets: [halo, ...arms],
        alpha: 0,
        delay: 1100,
        duration: 300,
        onComplete: () => [halo, ...arms].forEach((o) => o.destroy()),
      });
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
          ring(scene, p.x, p.y, 0xffa300, 6, 48, 200);
          world.area(p.x, p.y, 48, 1.2 * power, 160, 'ult');
        });
      }
    },
  },

  cakarNaga: {
    // Fire breath: a cone of flame and smoke with seven piercing fireballs inside it.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      for (let i = 0; i < 18; i++) {
        later(scene, i * 15, () => {
          const a = Phaser.Math.FloatBetween(-0.45, 0.45);
          const d = Phaser.Math.Between(30, 70);
          const fl = scene.add.circle(p.x + f * 8, p.y, 2, Phaser.Math.RND.pick([0xff004d, 0xffa300, 0xffec27])).setDepth(12);
          scene.tweens.add({
            targets: fl,
            x: p.x + f * (8 + Math.cos(a) * d),
            y: p.y + Math.sin(a) * d,
            radius: 5,
            alpha: 0,
            duration: 300,
            onComplete: () => fl.destroy(),
          });
        });
      }
      for (let i = 0; i < 7; i++) {
        const a = -0.45 + i * 0.15;
        world.shot({
          x: p.x + f * 8,
          y: p.y,
          vx: Math.cos(a) * 200 * f,
          vy: Math.sin(a) * 200,
          texture: 'fireball',
          mult: 0.7 * power,
          source: 'skill',
          status: { burn: 0.3 },
          pierce: true,
        });
      }
    },
    // Dragon form: a pillar of fire engulfs him, a roar rings out in waves, everything nearby is thrown back burning,
    // and the dragon rises from the flames.
    ult: ({ p, world, scene, power }) => {
      p.transform(7000);
      p.invuln(800);
      const pillar = scene.add.rectangle(p.x, FLOOR_Y, 20, FLOOR_Y, 0xff004d, 0.7).setOrigin(0.5, 1).setScale(0.2, 1).setDepth(9);
      scene.tweens.add({ targets: pillar, scaleX: 1.4, alpha: 0, duration: 500, onComplete: () => pillar.destroy() });
      floatText(scene, p.x, p.y - 30, 'ROAAAR!', '#ff004d');
      for (let i = 0; i < 3; i++) later(scene, i * 120, () => ring(scene, p.x, p.y, 0xffa300, 6, 90, 350, 2));
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
    // Chain of a Thousand Miles: Toji hurls the Inverted Spear of Heaven on its endless chain. It ricochets from enemy
    // to enemy with the chain strung out behind it, then he yanks it back, dragging everything toward him, and ends it
    // with one crushing swing of Playful Cloud.
    ult: ({ p, world, scene, power }) => {
      const targets = world.targets(p.x, p.y).slice(0, 8);
      if (!targets.length) return false;
      p.invuln(targets.length * 110 + 900);
      p.lock(targets.length * 110 + 700);
      p.setVelocityX(0);
      const chain = scene.add.graphics().setDepth(12);
      const pts = [{ x: p.x, y: p.y }];
      const drawChain = () => {
        chain.clear();
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const n = Math.max(1, Math.floor(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 3));
          for (let k = 0; k < n; k++) {
            chain.fillStyle(k % 2 ? 0x5f574f : 0xc2c3c7);
            chain.fillRect(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 2, 1);
          }
        }
      };
      const spear = scene.add.image(p.x, p.y, 'w_sakahoko').setDepth(13);
      targets.forEach((t, i) =>
        later(scene, i * 110, () => {
          if (!t.active) return;
          const prev = pts[pts.length - 1];
          spear.setRotation(Phaser.Math.Angle.Between(prev.x, prev.y, t.x, t.y));
          scene.tweens.add({ targets: spear, x: t.x, y: t.y, duration: 90 });
          pts.push({ x: t.x, y: t.y });
          later(scene, 90, () => {
            drawChain();
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0xc2c3c7, 26);
            sparks(scene, t.x, t.y, [0xfff1e8, 0x83769c], 6, 14);
            world.strike(t, 1.2 * power, 'ult', true);
          });
        }),
      );
      const back = targets.length * 110 + 200;
      later(scene, back, () => {
        floatText(scene, p.x, p.y - 24, 'TARIK!', '#fff1e8');
        pts.length = 1;
        pts[0] = { x: p.x, y: p.y };
        scene.tweens.add({ targets: spear, x: p.x, y: p.y, duration: 200, onComplete: () => spear.destroy() });
        scene.tweens.add({ targets: chain, alpha: 0, duration: 200, onComplete: () => chain.destroy() });
        world.pull(p.x, p.y, 400, 260);
      });
      later(scene, back + 380, () => {
        const staff = scene.add.image(p.x, p.y, 'w_awan').setScale(2).setDepth(13);
        scene.tweens.add({ targets: staff, angle: 540, alpha: 0, duration: 320, onComplete: () => staff.destroy() });
        ring(scene, p.x, p.y, 0xfff1e8, 6, 56, 300, 2);
        scene.cameras.main.shake(220, 0.02);
        world.area(p.x, p.y, 50, 2.5 * power, 280, 'ult');
      });
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
    // Iaido: a beat in stance while a glint runs down the sheathed blade, then one flash-draw straight through
    // everything ahead. Enemies on the path freeze mid-step and only fall apart when the blade clicks back home.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const y = p.y;
      p.invuln(650);
      p.lock(430);
      p.setVelocityX(0);
      glint(scene, p.x + f * 6, y - 1);
      later(scene, 170, () => {
        if (!p.active) return;
        const fromX = p.x;
        const toX = Phaser.Math.Clamp(fromX + f * 130, 8, W - 8);
        for (let i = 1; i <= 5; i++) afterimage(scene, p, fromX + ((toX - fromX) * i) / 6, y, 0.12 + i * 0.07);
        p.body.reset(toX, y);
        bladeLine(scene, fromX, y, toX, y, 0xff004d, 200);
        scene.cameras.main.shake(90, 0.008);
        const lo = Math.min(fromX, toX) - 8;
        const hi = Math.max(fromX, toX) + 8;
        const cut = world.targets(toX, y).filter((t) => Math.abs(t.y - y) < 20 && t.x >= lo && t.x <= hi);
        for (const t of cut) world.strike(t, 0.2 * power, 'skill', false, { freeze: 400 });
        // Chin: the blade is sheathed and every cut opens at once.
        later(scene, 320, () => {
          floatText(scene, Phaser.Math.Clamp(p.x, 20, W - 20), p.y - 20, 'CHIN', '#fff1e8');
          for (const t of cut) {
            if (!t.active) continue;
            cutMark(scene, t.x, t.y, 0xff004d, 30, -0.6);
            cutMark(scene, t.x, t.y, 0xff004d, 30, 0.6);
            world.strike(t, 1.6 * power, 'skill', true);
          }
          if (cut.length) scene.cameras.main.shake(140, 0.014);
        });
      });
    },
    // Musou Issen: the world goes dark under a red sun and falling sakura, and everything stops. The samurai becomes
    // a streak of light bouncing between every enemy, cutting each on the way, then stands back where he began and
    // slowly sheathes the katana. On the click, every cut opens at once.
    ult: ({ p, world, scene, power }) => {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const ox = p.x;
      const oy = p.y;
      const f = p.facing;
      p.invuln(3000);
      p.lock(2500);
      p.setVelocity(0, 0);
      const cam = scene.cameras.main;
      cam.flash(150, 255, 255, 255);
      // Stage: dark sky, a red sun behind him, sakura drifting down for the whole technique.
      const dark = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 40, 0x05050f, 0.6)
        .setOrigin(0)
        .setDepth(8)
        .setAlpha(0);
      const sun = scene.add.circle(ox, oy - 16, 1, 0xff004d, 0.85).setDepth(8);
      scene.tweens.add({ targets: dark, alpha: 1, duration: 300 });
      scene.tweens.add({ targets: sun, radius: 36, duration: 500, ease: 'Back.Out' });
      for (let i = 0; i < 40; i++) {
        later(scene, i * 55, () => {
          const petal = scene.add.rectangle(Phaser.Math.Between(0, W + 60), -4, 2, 1, i % 3 ? 0xff77a8 : 0xfff1e8).setDepth(14);
          scene.tweens.add({
            targets: petal,
            x: petal.x - Phaser.Math.Between(60, 120),
            y: FLOOR_Y,
            angle: Phaser.Math.Between(180, 540),
            duration: Phaser.Math.Between(1400, 2200),
            onComplete: () => petal.destroy(),
          });
        });
      }
      floatText(scene, W / 2, 40, 'MUSOU...', '#ff77a8');
      glint(scene, ox + f * 6, oy - 1);
      // Time stops.
      for (const t of foes) world.strike(t, 0.2 * power, 'ult', false, { freeze: 2400 });
      // The flurry: 12 blinks cycling through (up to 12) enemies; each enemy's share adds up to about 2.4x.
      const n = Math.min(foes.length, 12);
      const hops = 12;
      let px = ox;
      let py = oy;
      for (let i = 0; i < hops; i++) {
        later(scene, 450 + i * 70, () => {
          const t = foes[i % n];
          if (!p.active || !t.active) return;
          const dir = Math.sign(t.x - px) || f;
          const nx = Phaser.Math.Clamp(t.x + dir * 16, 8, W - 8);
          const ny = Math.min(t.y, FLOOR_Y - 8);
          bladeLine(scene, px, py, nx, ny, i % 2 ? 0xff004d : 0xff77a8, 120);
          afterimage(scene, p, px, py, 0.4);
          p.body.reset(nx, ny);
          p.facing = dir;
          cutMark(scene, t.x, t.y, 0xff004d, 26);
          world.strike(t, 0.2 * n * power, 'ult', false);
          cam.shake(50, 0.006);
          px = nx;
          py = ny;
        });
      }
      // He returns to where he started and sheathes the blade slowly.
      const back = 450 + hops * 70 + 60;
      later(scene, back, () => {
        if (!p.active) return;
        bladeLine(scene, px, py, ox, oy, 0xfff1e8, 160);
        p.body.reset(ox, oy);
        p.facing = f;
        floatText(scene, ox, oy - 22, '...', '#fff1e8');
      });
      later(scene, back + 500, () => {
        floatText(scene, W / 2, 52, 'ISSEN!', '#ff004d');
        cam.flash(250, 255, 241, 232);
        cam.shake(450, 0.03);
        for (const t of foes) {
          if (!t.active) continue;
          for (const a of [-0.7, 0, 0.7]) cutMark(scene, t.x, t.y, 0xff004d, 44, a);
          world.strike(t, 2.5 * power, 'ult', true);
        }
        // Petals scatter from the shockwave; the sky and sun fade back.
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const petal = scene.add.rectangle(ox, oy, 2, 1, i % 2 ? 0xff77a8 : 0xfff1e8).setDepth(14);
          scene.tweens.add({
            targets: petal,
            x: ox + Math.cos(a) * Phaser.Math.Between(40, 90),
            y: oy + Math.sin(a) * Phaser.Math.Between(20, 50),
            angle: 360,
            alpha: 0,
            duration: 700,
            onComplete: () => petal.destroy(),
          });
        }
        scene.tweens.add({ targets: [dark, sun], alpha: 0, duration: 500, onComplete: () => (dark.destroy(), sun.destroy()) });
      });
    },
  },
  rasengan: {
    // Rasenshuriken: a ball of wind chakra with four screaming blades flies ahead; on the first enemy (or at range) it
    // swells into a dome of countless tiny cuts that hits everything inside again and again.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      p.lock(200);
      p.setVelocityX(0);
      const orb = scene.add.container(p.x + f * 10, p.y - 4).setDepth(13);
      orb.add([
        scene.add.circle(0, 0, 9, 0xc2f0ff, 0.35),
        ...[0, 1, 2, 3].map((k) =>
          scene.add
            .triangle(0, 0, 0, -2, 16, 0, 0, 2, 0xfff1e8)
            .setOrigin(0, 0.5)
            .setRotation((k * Math.PI) / 2),
        ),
        scene.add.circle(0, 0, 4, 0x29adff).setStrokeStyle(1, 0xfff1e8),
      ]);
      scene.tweens.add({ targets: orb, angle: f * 2000, duration: 2000 });
      let exploded = false;
      let fly: Phaser.Tweens.Tween | undefined;
      const boom = () => {
        if (exploded) return;
        exploded = true;
        fly?.stop();
        const { x, y } = orb;
        orb.destroy();
        const dome = scene.add.circle(x, y, 6, 0xc2f0ff, 0.45).setStrokeStyle(1, 0xfff1e8).setDepth(13);
        scene.tweens.add({ targets: dome, radius: 38, duration: 200, ease: 'Quad.Out' });
        scene.tweens.add({ targets: dome, alpha: 0, delay: 900, duration: 300, onComplete: () => dome.destroy() });
        scene.cameras.main.shake(300, 0.012);
        for (let i = 0; i < 6; i++)
          later(scene, i * 150, () => {
            for (let k = 0; k < 6; k++) cutMark(scene, x + Phaser.Math.Between(-28, 28), y + Phaser.Math.Between(-28, 28), 0xc2f0ff, 12);
            world.area(x, y, 38, 0.6 * power, 20, 'skill');
          });
      };
      fly = scene.tweens.add({
        targets: orb,
        x: Phaser.Math.Clamp(p.x + f * 150, 10, W - 10),
        duration: 600,
        onUpdate: () => {
          if (world.targets(orb.x, orb.y).some((t) => Phaser.Math.Distance.Between(orb.x, orb.y, t.x, t.y) < 14)) boom();
        },
        onComplete: boom,
      });
    },
    // Tailed Beast Ball: Kurama rises behind him in orange chakra, gathers black and violet chakra into a ball at its
    // jaws, and fires it across the arena: everything in front is blown apart, the tails lash whatever is behind.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      p.invuln(2600);
      p.lock(2200);
      p.setVelocity(0, 0);
      const fox = scene.add
        .image(p.x - f * 4, p.y - 22, 'kurama')
        .setFlipX(f < 0)
        .setScale(0)
        .setAlpha(0.85)
        .setDepth(8);
      scene.tweens.add({ targets: fox, scale: 3, duration: 400, ease: 'Back.Out' });
      scene.cameras.main.flash(200, 255, 163, 0);
      floatText(scene, W / 2, 36, 'KURAMA!', '#ffa300');
      for (let i = 0; i < 30; i++)
        later(scene, i * 50, () => {
          const fl = scene.add
            .circle(fox.x + Phaser.Math.Between(-30, 30), fox.y + Phaser.Math.Between(-10, 22), 3, 0xffa300, 0.6)
            .setDepth(8);
          scene.tweens.add({ targets: fl, y: fl.y - 14, scale: 0.3, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
        });
      const mx = p.x + f * 22;
      const my = p.y - 24;
      const ball = scene.add.circle(mx, my, 1, 0x1d0f2e).setStrokeStyle(2, 0x8a3fd1).setDepth(12);
      scene.tweens.add({ targets: ball, radius: 14, duration: 900, delay: 400 });
      for (let i = 0; i < 30; i++)
        later(scene, 400 + i * 30, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(mx + Math.cos(a) * 50, my + Math.sin(a) * 50, 2, 2, i % 3 ? 0x8a3fd1 : 0xfff1e8).setDepth(12);
          scene.tweens.add({ targets: m, x: mx, y: my, duration: 250, onComplete: () => m.destroy() });
        });
      later(scene, 1400, () => {
        floatText(scene, W / 2, 48, 'BIJUDAMA!', '#8a3fd1');
        scene.cameras.main.shake(600, 0.03);
        scene.tweens.add({
          targets: ball,
          x: f > 0 ? W + 30 : -30,
          y: p.y,
          duration: 500,
          ease: 'Quad.In',
          onComplete: () => ball.destroy(),
        });
        for (const t of world.targets(p.x, p.y)) {
          const ahead = Math.sign(t.x - p.x) === f;
          const frac = Phaser.Math.Clamp(Math.abs(t.x - p.x) / W, 0, 1);
          later(scene, ahead ? 150 + frac * 400 : 100, () => {
            if (!t.active) return;
            if (!ahead) return void world.strike(t, 1.5 * power, 'ult', false);
            const blast = scene.add.circle(t.x, t.y, 6, 0x1d0f2e, 0.9).setStrokeStyle(2, 0x8a3fd1).setDepth(13);
            scene.tweens.add({ targets: blast, radius: 34, alpha: 0, duration: 400, onComplete: () => blast.destroy() });
            ring(scene, t.x, t.y, 0xfff1e8, 8, 44, 350, 2);
            world.strike(t, 4 * power, 'ult', true);
          });
        }
        scene.tweens.add({ targets: fox, alpha: 0, delay: 500, duration: 400, onComplete: () => fox.destroy() });
      });
    },
  },

  kusanagi: {
    // Chidori Eiso: the Chidori in his hand stretches into a spear of lightning that lances through every enemy in the
    // line and paralyzes it, crackling as it flickers out.
    skill: ({ p, world, scene, power }) => {
      const f = p.facing;
      const y = p.y;
      const len = 150;
      const x0 = p.x + f * 6;
      p.lock(300);
      p.setVelocityX(0);
      const bolt = scene.add.graphics().setDepth(13);
      const draw = () => {
        bolt.clear();
        for (const [w, c] of [
          [3, 0x29adff],
          [1, 0xfff1e8],
        ] as const) {
          bolt.lineStyle(w, c).beginPath().moveTo(x0, y);
          for (let i = 1; i <= 10; i++) bolt.lineTo(x0 + (f * len * i) / 10, y + (i < 10 ? Phaser.Math.Between(-4, 4) : 0));
          bolt.strokePath();
        }
      };
      for (let k = 0; k < 5; k++) later(scene, k * 50, draw);
      scene.tweens.add({ targets: bolt, alpha: 0, delay: 250, duration: 150, onComplete: () => bolt.destroy() });
      sparks(scene, x0, y, [0x29adff, 0xfff1e8], 8, 12);
      scene.cameras.main.shake(120, 0.008);
      for (const t of world.targets(p.x, y)) {
        if (Math.sign(t.x - p.x) !== f || Math.abs(t.x - p.x) > len + 6 || Math.abs(t.y - y) > 16) continue;
        world.strike(t, 2.2 * power, 'skill', true, { freeze: 700 });
        sparks(scene, t.x, t.y, [0x29adff, 0xfff1e8], 6, 14);
      }
    },
    // Indra's Arrow: the complete violet Susanoo rises around him and draws a bow of lightning; the arrow soaks up the
    // chakra of all nine tailed beasts, then looses as a beam of black-violet lightning that splits the arena. Anything
    // off the line is caught by branching bolts.
    ult: ({ p, world, scene, power }) => {
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const { x, y } = p;
      p.invuln(2600);
      p.lock(2200);
      p.setVelocity(0, 0);
      const sus = scene.add.container(x, y).setDepth(7).setAlpha(0);
      sus.add([
        scene.add.triangle(0, -14, 0, 0, -f * 40, -26, -f * 14, 18, 0x8a3fd1, 0.4),
        scene.add.ellipse(0, -10, 44, 58, 0x8a3fd1, 0.35),
        scene.add.circle(0, -44, 11, 0x8a3fd1, 0.5),
        scene.add.rectangle(f * 3, -46, 6, 2, 0xffec27),
      ]);
      scene.tweens.add({ targets: sus, alpha: 1, duration: 400 });
      floatText(scene, W / 2, 36, 'SUSANOO!', '#c080ff');
      const bow = scene.add.graphics().setDepth(12);
      const drawBow = (pull: number) => {
        bow.clear().lineStyle(2, 0xc080ff).beginPath();
        const [tx, ty, bx, by] = [x + f * 16, y - 30, x + f * 16, y + 30];
        bow.moveTo(tx, ty);
        for (let i = 1; i <= 12; i++) bow.lineTo(...bez(tx, ty, x + f * 40, y, bx, by, i / 12));
        bow
          .strokePath()
          .lineStyle(1, 0xfff1e8)
          .beginPath()
          .moveTo(tx, ty)
          .lineTo(x + f * (14 - pull), y)
          .lineTo(bx, by)
          .strokePath();
        bow.lineStyle(2, 0x1d0f2e).lineBetween(x + f * (14 - pull), y, x + f * 44, y);
      };
      scene.tweens.addCounter({ from: 0, to: 18, duration: 900, delay: 300, onUpdate: (tw) => drawBow(tw.getValue() ?? 0) });
      const beasts = [0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x8a3fd1, 0xff77a8, 0xc2c3c7, 0xab5236];
      for (let i = 0; i < 27; i++)
        later(scene, 350 + i * 35, () => {
          const a = Math.random() * Math.PI * 2;
          const m = scene.add.rectangle(x + f * 44 + Math.cos(a) * 60, y + Math.sin(a) * 60, 2, 2, beasts[i % 9]).setDepth(13);
          scene.tweens.add({ targets: m, x: x + f * 44, y, duration: 260, onComplete: () => m.destroy() });
        });
      later(scene, 1400, () => {
        bow.destroy();
        floatText(scene, W / 2, 48, 'INDRA NO YA!', '#c080ff');
        scene.cameras.main.flash(250, 192, 128, 255);
        scene.cameras.main.shake(500, 0.03);
        const x0 = x + f * 20;
        const len = f > 0 ? W - x0 : x0;
        const beam = (
          [
            [34, 0x1d0f2e, 0.8],
            [18, 0x8a3fd1, 0.9],
            [4, 0xfff1e8, 1],
          ] as const
        ).map(([h, c, a]) =>
          scene.add
            .rectangle(x0, y, len, h, c, a)
            .setOrigin(f > 0 ? 0 : 1, 0.5)
            .setScale(0, 1)
            .setDepth(13),
        );
        scene.tweens.add({ targets: beam, scaleX: 1, duration: 120 });
        scene.tweens.add({
          targets: beam,
          scaleY: 0,
          alpha: 0,
          delay: 500,
          duration: 350,
          onComplete: () => beam.forEach((b) => b.destroy()),
        });
        const zap = scene.add.graphics().setDepth(14);
        for (const t of world.targets(x, y)) {
          const inLine = Math.sign(t.x - x) === f && Math.abs(t.y - y) < 30;
          if (inLine) {
            world.strike(t, 5.5 * power, 'ult', true);
            continue;
          }
          // A branch of the arrow's lightning jumps from the beam to everyone else.
          const bx = Phaser.Math.Clamp(t.x, Math.min(x0, x0 + f * len), Math.max(x0, x0 + f * len));
          zap.lineStyle(1, 0xc080ff).beginPath().moveTo(bx, y);
          for (let i = 1; i < 5; i++) zap.lineTo(bx + ((t.x - bx) * i) / 5 + Phaser.Math.Between(-4, 4), y + ((t.y - y) * i) / 5);
          zap.lineTo(t.x, t.y).strokePath();
          world.strike(t, 1.5 * power, 'ult', false, { freeze: 400 });
        }
        scene.tweens.add({ targets: zap, alpha: 0, duration: 400, onComplete: () => zap.destroy() });
        scene.tweens.add({ targets: sus, alpha: 0, delay: 400, duration: 400, onComplete: () => sus.destroy() });
      });
    },
  },
};
