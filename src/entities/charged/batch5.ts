import Phaser from 'phaser';
import type { ClassId } from '../../logic/classes.ts';
import { FLOOR_Y, W, cutMark } from '../../gfx/ui.ts';
import { bez, glint, jag, later, onLine, ring, rocks, sparks } from '../skills.ts';
import type { ChargedAttack, ChargedCtx } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
type Mover = Phaser.Physics.Arcade.Sprite & { body: Phaser.Physics.Arcade.Body };

const dist = (x: number, y: number, t: { x: number; y: number }) => Phaser.Math.Distance.Between(x, y, t.x, t.y);
/** Small fry: not a boss, not an elite (those are too heavy to throw around). */
const light = (t: Foe) => !('tier' in t) && !t.getData('elite');
/** Runs `fn(k)` every frame for `ms` (k 0 → 1), then `done`. A tween, so it dies with the scene. */
const frames = (scene: Phaser.Scene, ms: number, fn: (k: number) => void, done?: () => void) =>
  scene.tweens.addCounter({ from: 0, to: 1, duration: ms, onUpdate: (tw) => fn(tw.getValue() ?? 0), onComplete: done });
/** Distance from `t` to the segment from (x, y) along `a` for `len` px. */
function segDist(x: number, y: number, a: number, len: number, t: { x: number; y: number }): number {
  const along = Phaser.Math.Clamp((t.x - x) * Math.cos(a) + (t.y - y) * Math.sin(a), 0, len);
  return Phaser.Math.Distance.Between(x + Math.cos(a) * along, y + Math.sin(a) * along, t.x, t.y);
}

// ---------------------------------------------------------------------------------------------------------------- Itachi

const RED = 0xff004d;

/** A kunai in flight along `at(k)`, turned along its path and trailing a dark-red streak; `done` on arrival. */
function kunaiFlight(scene: Phaser.Scene, ms: number, at: (k: number) => [number, number], done: () => void): void {
  let [px, py] = at(0);
  const img = scene.add.image(px, py, 'w_kunai').setDepth(13);
  frames(
    scene,
    ms,
    (k) => {
      const [x, y] = at(k);
      if (x !== px || y !== py) img.setRotation(Math.atan2(y - py, x - px));
      img.setPosition(x, y);
      const s = scene.add
        .rectangle(px, py, 2, 1, Math.random() < 0.5 ? RED : 0x5f574f, 0.8)
        .setRotation(img.rotation)
        .setDepth(12);
      scene.tweens.add({ targets: s, alpha: 0, scaleX: 0.3, duration: 140, onComplete: () => s.destroy() });
      [px, py] = [x, y];
    },
    () => {
      img.destroy();
      done();
    },
  );
}

/** A Sharingan reticle on a target: red iris, black rim, three tomoe turning. */
function sharinganMark(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, spin: number, alpha: number): void {
  g.lineStyle(3, 0x1c1c28, 0.5 * alpha).strokeCircle(x, y, r);
  g.lineStyle(1, RED, alpha).strokeCircle(x, y, r);
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI * 2) / 3;
    const [tx, ty] = [x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)];
    g.fillStyle(0x1c1c28, alpha).fillCircle(tx, ty, 1.5);
    // The tomoe's tail, curling after it.
    g.fillRect(x + Math.cos(a - 0.5) * (r - 2) - 0.5, y + Math.sin(a - 0.5) * (r - 2) - 0.5, 1, 1);
  }
  g.fillStyle(0x1c1c28, alpha).fillCircle(x, y, 1);
}

/** Who the Sharingan reads: the three nearest within reach, or six anywhere once fully charged. */
const itachiMarks = ({ p, world }: ChargedCtx, full: boolean) =>
  world
    .targets(p.x, p.y)
    .filter((t) => full || dist(p.x, p.y, t) <= 150)
    .slice(0, full ? 6 : 3);

// ------------------------------------------------------------------------------------------------------------ Jack Frost

/** A six-armed snowflake at (x, y): every arm forked twice like real frost, dark-blue rim, ice-blue body, white core. */
function snowflake(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot: number, alpha = 1): void {
  for (const [w, c, al] of [
    [3, 0x1d2b53, 0.7],
    [2, 0x29adff, 0.9],
    [1, 0xfff1e8, 1],
  ] as const) {
    g.lineStyle(w, c, al * alpha);
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * Math.PI) / 3;
      const [ex, ey] = [x + Math.cos(a) * r, y + Math.sin(a) * r];
      g.lineBetween(x, y, ex, ey);
      for (const at of [0.45, 0.72]) {
        const [bx, by] = [x + Math.cos(a) * r * at, y + Math.sin(a) * r * at];
        const bl = r * (at < 0.5 ? 0.38 : 0.24);
        for (const s of [-1, 1]) g.lineBetween(bx, by, bx + Math.cos(a + s * 1.05) * bl, by + Math.sin(a + s * 1.05) * bl);
      }
    }
  }
  g.fillStyle(0xc2f0ff, alpha).fillCircle(x, y, Math.max(1, r * 0.18));
  g.fillStyle(0xfff1e8, alpha).fillRect(x - 0.5, y - 0.5, 1, 1);
}

/** A spinning snowflake object (container at its center), with a pale halo. */
function flakeObject(scene: Phaser.Scene, x: number, y: number, r: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  snowflake(g, 0, 0, r, 0);
  const halo = scene.add.circle(0, 0, r + 2, 0xc2f0ff, 0.22);
  return scene.add.container(x, y, [halo, g]).setDepth(13);
}

/** Where a flake lands, the cold blooms: icicles stab out in a star (outlined, lit on one side), with frost on the floor. */
function frostBloom(scene: Phaser.Scene, x: number, y: number, r: number): void {
  const g = scene.add.graphics();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const [ex, ey] = [Math.cos(a) * r, Math.sin(a) * r];
    const [nx, ny] = [-Math.sin(a) * 2.5, Math.cos(a) * 2.5];
    g.fillStyle(0x1d2b53, 0.8).fillTriangle(nx * 1.4, ny * 1.4, -nx * 1.4, -ny * 1.4, ex * 1.08, ey * 1.08);
    g.fillStyle(0x29adff).fillTriangle(nx, ny, -nx, -ny, ex, ey);
    g.fillStyle(0xc2f0ff).fillTriangle(nx, ny, 0, 0, ex, ey);
  }
  g.fillStyle(0xfff1e8).fillCircle(0, 0, 3);
  const c = scene.add.container(x, y, [g]).setDepth(13).setScale(0.2);
  scene.tweens.add({ targets: c, scale: 1, angle: 15, duration: 130, ease: 'Back.Out' });
  scene.tweens.add({ targets: c, alpha: 0, scale: 1.15, delay: 260, duration: 220, onComplete: () => c.destroy() });
  ring(scene, x, y, 0xc2f0ff, 3, r + 6, 320, 2);
  sparks(scene, x, y, [0xfff1e8, 0xc2f0ff, 0x29adff], 12, r + 10);
  // Close to the floor, the frost runs along it both ways and fades.
  if (y > FLOOR_Y - 32) {
    const frost = scene.add.rectangle(x, FLOOR_Y, 4, 2, 0xc2f0ff, 0.9).setDepth(6);
    scene.tweens.add({ targets: frost, width: r * 3, alpha: 0, duration: 650, ease: 'Quad.Out', onComplete: () => frost.destroy() });
  }
}

// -------------------------------------------------------------------------------------------------------------- Naruto

/**
 * A blow of the Frog Kata: the fist (or foot) stops at arm's length, but the nature energy around it carries on: a
 * translucent orange streak and a phantom fist (dark rim, orange body, yellow knuckles) far ahead of the real one.
 */
function sageBlow(scene: Phaser.Scene, x: number, y: number, a: number, len: number, size: number): void {
  const g = scene.add.graphics();
  g.lineStyle(size + 2, 0xffa300, 0.25).lineBetween(0, 0, len, 0);
  g.lineStyle(Math.max(1, size - 2), 0xffec27, 0.5).lineBetween(len * 0.25, 0, len, 0);
  g.lineStyle(1, 0xfff1e8, 0.9).lineBetween(len * 0.5, 0, len - size, 0);
  // Air pressure lines peeling off the blow.
  for (const s of [-1, 1]) g.lineStyle(1, 0xffec27, 0.6).lineBetween(len * 0.6, s * (size + 2), len * 0.9, s * (size + 1));
  // The phantom fist.
  const h = size + 2;
  g.fillStyle(0xab5236, 0.85).fillRoundedRect(len - h, -h, h * 1.6, h * 2, 3);
  g.fillStyle(0xffa300, 0.9).fillRoundedRect(len - h + 1, -h + 1, h * 1.6 - 2, h * 2 - 2, 2);
  g.fillStyle(0xffec27).fillRect(len + h * 0.6 - 2, -h + 2, 1, h * 2 - 4);
  g.fillStyle(0xfff1e8, 0.9).fillRect(len - h + 2, -h + 2, h * 0.8, 1);
  const c = scene.add.container(x, y, [g]).setRotation(a).setDepth(13).setScale(0.3, 0.8);
  scene.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 60, ease: 'Quad.Out' });
  scene.tweens.add({ targets: c, alpha: 0, delay: 90, duration: 180, onComplete: () => c.destroy() });
  ring(scene, x + Math.cos(a) * len, y + Math.sin(a) * len, 0xffa300, 2, size + 8, 220);
}

// -------------------------------------------------------------------------------------------------------------- Sasuke

const BLUE = 0x29adff;

/** Lightning shaped into a blade from (x, y) along `a` for `len` px: kinked anew every frame, so it crackles. */
function lightningBlade(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, len: number, width: number): void {
  if (len < 2) return;
  const [ex, ey] = [x + Math.cos(a) * len, y + Math.sin(a) * len];
  const pts = jag(x, y, ex, ey, 1.5);
  for (const [w, c, al] of [
    [width + 4, 0x1d2b53, 0.45],
    [width + 2, BLUE, 0.9],
    [1, 0xfff1e8, 1],
  ] as const) {
    g.lineStyle(w, c, al).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.strokePath();
  }
  // The spear point.
  const [nx, ny] = [-Math.sin(a) * (width + 1), Math.cos(a) * (width + 1)];
  g.fillStyle(BLUE).fillTriangle(ex + nx, ey + ny, ex - nx, ey - ny, ex + Math.cos(a) * 7, ey + Math.sin(a) * 7);
  g.fillStyle(0xfff1e8).fillTriangle(
    ex + nx * 0.4,
    ey + ny * 0.4,
    ex - nx * 0.4,
    ey - ny * 0.4,
    ex + Math.cos(a) * 5,
    ey + Math.sin(a) * 5,
  );
}

/** Crackling arcs around a point (the Chidori in his hand). */
function chidoriArcs(g: Phaser.GameObjects.Graphics, x: number, y: number, n: number, reach: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const pts = jag(x, y, x + Math.cos(a) * reach * (0.5 + Math.random() * 0.5), y + Math.sin(a) * reach * (0.5 + Math.random() * 0.5), 2);
    for (const [w, c] of [
      [2, BLUE],
      [1, 0xfff1e8],
    ] as const) {
      g.lineStyle(w, c, 0.9).beginPath().moveTo(x, y);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.strokePath();
    }
  }
}

// ------------------------------------------------------------------------------------------------------- Gravity Master

const VIOLET = 0x8a3fd1;
const VOID = 0x241a3d;
const PALE = 0xc080ff;

/** Enemy.knockback stuns briefly; refreshed every frame, it keeps the enemy's own AI from fighting the lift. */
const stun = (t: Foe) => (t as unknown as { knockback(dir: number, force: number): void }).knockback(0, 84);

/** The reversed field: a tilted ring of violet around (x, y), arcs of pale light running round it, chevrons rising. */
function gravityField(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, time: number, alpha: number): void {
  g.lineStyle(3, VOID, 0.5 * alpha).strokeEllipse(x, y, r * 2, r * 1.3);
  g.lineStyle(1, VIOLET, 0.8 * alpha).strokeEllipse(x, y, r * 2, r * 1.3);
  for (let i = 0; i < 3; i++) {
    const a0 = time / 300 + (i * Math.PI * 2) / 3;
    g.lineStyle(1, PALE, alpha).beginPath();
    for (let s = 0; s <= 6; s++) g.lineTo(x + Math.cos(a0 + s * 0.12) * r, y + Math.sin(a0 + s * 0.12) * r * 0.65);
    g.strokePath();
  }
  // Up-pointing chevrons climbing through the field: here, down is up.
  for (let i = -2; i <= 2; i++) {
    const cx = x + i * r * 0.32;
    const cy = y + r * 0.3 - ((time / 8 + i * 17) % (r * 0.8));
    g.lineStyle(1, PALE, 0.7 * alpha).lineBetween(cx - 3, cy + 2, cx, cy - 1);
    g.lineBetween(cx, cy - 1, cx + 3, cy + 2);
  }
}

/** A crater where a hurled body hits: cracks fanning out of the floor, dust, rock chunks and a violet shock ring. */
function crater(scene: Phaser.Scene, x: number, big: boolean): void {
  const g = scene.add.graphics().setDepth(6);
  for (const [w, c] of [
    [2, VOID],
    [1, PALE],
  ] as const) {
    g.lineStyle(w, c);
    for (const s of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const pts = jag(x, FLOOR_Y, x + s * (big ? 22 : 14) * (1 + i * 0.5), FLOOR_Y + 2 + i * 3, 2);
        g.beginPath().moveTo(x, FLOOR_Y);
        for (const [px, py] of pts) g.lineTo(px, py);
        g.strokePath();
      }
  }
  scene.tweens.add({ targets: g, alpha: 0, delay: 350, duration: 400, onComplete: () => g.destroy() });
  rocks(scene, x, FLOOR_Y - 2, big ? 8 : 5);
  const dust = scene.add.ellipse(x, FLOOR_Y - 2, 10, 4, 0x5f574f, 0.7).setDepth(12);
  scene.tweens.add({ targets: dust, scaleX: big ? 5 : 3, scaleY: 2, alpha: 0, duration: 420, onComplete: () => dust.destroy() });
  ring(scene, x, FLOOR_Y - 3, VIOLET, 4, big ? 34 : 22, 300, 2);
}

/** Charged attacks (TAHAN J) of: itachi, jackFrost, naruto, sasuke, gravityMaster. Contract and damage budget: see types.ts. */
export const BATCH_5: Partial<Record<ClassId, ChargedAttack>> = {
  // Shurikenjutsu, the blind-spot throw (Amaterasu and Izanami are already his skill and fusion): the Sharingan reads
  // every target while he holds still. He throws kunai in pairs on two diverging arcs; each pair meets past its target
  // with a CLANG, and the collision bends both into the target from behind, where it is not looking. Full charge: the
  // Sharingan reads six targets anywhere on the field and a second pair meets low behind each, the last one pinning
  // it in genjutsu (frozen) and throwing small fry up.
  itachi: {
    name: 'KUNAI TITIK BUTA',
    desc: 'KUNAI BERTUBRUKAN & MEMANTUL KE TITIK BUTA 3 MUSUH; PENUH: 6 MUSUH, 4 KUNAI, GENJUTSU',
    charging(c, t01, level, g) {
      const { p, scene } = c;
      const spin = scene.time.now / 160;
      // The Sharingan marks what it has read; at full charge it reads twice as many, anywhere.
      for (const t of itachiMarks(c, level === 2)) sharinganMark(g, t.x, t.y, 6 + (level === 2 ? 2 : 0), spin, 0.35 + 0.6 * t01);
      // Kunai fanned between his fingers, opening as the charge grows.
      const [hx, hy] = [p.x + p.facing * 4, p.y];
      for (let i = 0; i < 2 + level; i++) {
        const a = (p.facing > 0 ? 0 : Math.PI) + (i - (1 + level) / 2) * (0.25 + 0.25 * t01);
        const [ex, ey] = [hx + Math.cos(a) * 6, hy + Math.sin(a) * 6];
        g.lineStyle(1, 0x5f574f).lineBetween(hx, hy, ex, ey);
        g.fillStyle(0xfff1e8).fillRect(ex - 0.5, ey - 0.5, 1, 1);
      }
    },
    fire(c, level) {
      const { p, world, scene } = c;
      const full = level === 2;
      // Read the field now, as he throws.
      const foes = itachiMarks(c, full);
      if (!foes.length) return false;
      p.lock(240);
      p.invuln(240);
      p.setVelocityX(0);
      const [hx, hy] = [p.x + p.facing * 4, p.y];
      foes.forEach((t, i) =>
        later(scene, i * 70, () => {
          if (!t.active) return;
          let hits = 0;
          const away = Math.sign(t.x - hx) || p.facing;
          // Where each pair meets: just past the target, high (and, full, low): its blind spot.
          const meets: [number, number][] = full
            ? [
                [away * 16, -22],
                [away * 18, 12],
              ]
            : [[away * 16, -22]];
          meets.forEach(([dx, dy], j) => {
            const mx = Phaser.Math.Clamp(t.x + dx, 4, W - 4);
            const my = Phaser.Math.Clamp(t.y + dy, 8, FLOOR_Y - 4);
            let clanged = false;
            // Two kunai on diverging arcs, one bowed high and one low, timed to arrive together.
            for (const s of [-1, 1]) {
              const [cx, cy] = [(hx + mx) / 2, (hy + my) / 2 + s * 30];
              kunaiFlight(
                scene,
                170 + j * 50,
                (k) => bez(hx, hy, cx, cy, mx, my, k),
                () => {
                  if (!clanged) {
                    // CLANG: steel on steel, both kunai bent toward the target.
                    clanged = true;
                    glint(scene, mx, my);
                    sparks(scene, mx, my, [0xfff1e8, 0xffa300], 8, 10);
                    ring(scene, mx, my, 0xfff1e8, 1, 7, 160);
                  }
                  let [lx, ly] = [t.x, t.y];
                  kunaiFlight(
                    scene,
                    80,
                    (k) => {
                      if (t.active) [lx, ly] = [t.x + s * 2, t.y];
                      return [mx + (lx - mx) * k, my + (ly - my) * k];
                    },
                    () => {
                      if (!t.active) return;
                      hits++;
                      const last = full && hits === 4;
                      world.strike(t, full ? 1.4 : 1.5, 'basic', false, full ? { freeze: last ? 500 : 200 } : undefined, last ? 160 : 70);
                      cutMark(scene, t.x, t.y, RED, 14, Math.atan2(t.y - my, t.x - mx));
                      scene.cameras.main.shake(40, 0.003);
                      if (last && t.active && light(t)) (t as Mover).setVelocityY(-200);
                    },
                  );
                },
              );
            }
          });
        }),
      );
    },
  },

  // A snowflake of fun: Jack spins his crook and a big, perfect snowflake grows at its tip. He flicks it at the nearest
  // enemy (in the air too); it sails over in a lazy arc, spinning, and where it lands the cold blooms into a star of
  // icicles that freezes everything around. Full charge: a giant flake from across the arena; its bloom is twice as
  // wide, and it shatters into six little snowflakes that each find someone nearby (no more than two each).
  // (Ice Coffin would repeat the sealed crystals of his Frost Fern and Eternal Winter.)
  jackFrost: {
    name: 'KEPING SALJU AJAIB',
    desc: 'KEPING SALJU DILEMPAR, MEKAR JADI BINTANG ES; PENUH: RAKSASA, PECAH JADI 6 PENGEJAR',
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const [x, y] = [p.x + p.facing * 6, p.y - 12];
      const r = 2 + 6 * t01 + (level === 2 ? Math.sin(now / 40) * 0.6 : 0);
      g.fillStyle(0xc2f0ff, 0.12 + 0.15 * t01).fillCircle(x, y, r + 3);
      snowflake(g, x, y, r, now / 300, 0.5 + 0.5 * t01);
      if (level === 2) g.lineStyle(1, 0xfff1e8, 0.6).strokeCircle(x, y, r + 4);
      // Snow drawn in on the Wind, spiralling into the flake.
      if (now < (p.getData('frostMote') ?? 0)) return;
      p.setData('frostMote', now + (level ? 40 : 70));
      const a = Math.random() * Math.PI * 2;
      const m = scene.add.rectangle(x + Math.cos(a) * 18, y + Math.sin(a) * 14, 1, 1, 0xfff1e8).setDepth(12);
      scene.tweens.add({ targets: m, x, y, alpha: 0.2, duration: 260, ease: 'Quad.In', onComplete: () => m.destroy() });
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const [sx, sy] = [p.x + p.facing * 6, p.y - 12];
      // Aim now: the nearest enemy within reach (anywhere when full).
      const t = world.targets(sx, sy).find((e) => dist(sx, sy, e) <= (full ? 400 : 150));
      if (!t) return false;
      p.lock(160);
      const r = full ? 10 : 6;
      const flake = flakeObject(scene, sx, sy, r);
      let [tx, ty] = [t.x, t.y];
      const ms = Phaser.Math.Clamp(dist(sx, sy, t) / 0.28, 220, 700);
      frames(
        scene,
        ms,
        (k) => {
          if (t.active) [tx, ty] = [t.x, t.y];
          flake.setPosition(...bez(sx, sy, (sx + tx) / 2, Math.min(sy, ty) - 30, tx, ty, k));
          flake.rotation += 0.25;
          if (Math.random() < 0.5) {
            const m = scene.add.rectangle(flake.x, flake.y, 1, 1, 0xfff1e8).setDepth(12);
            scene.tweens.add({ targets: m, y: m.y + 8, alpha: 0, duration: 400, onComplete: () => m.destroy() });
          }
        },
        () => {
          flake.destroy();
          // The cold blooms where it lands.
          if (t.active) world.strike(t, full ? 2.4 : 1.6, 'basic', false, { freeze: full ? 600 : 400 }, 80);
          frostBloom(scene, tx, ty, full ? 30 : 16);
          world.area(tx, ty, full ? 40 : 22, full ? 1.6 : 1.4, 60, 'basic', { freeze: full ? 900 : 500 });
          scene.cameras.main.shake(full ? 120 : 70, full ? 0.008 : 0.004);
          if (!full) return;
          // It shatters into six small flakes, each flung out in a star and then curving into someone nearby.
          const near = world.targets(tx, ty).filter((e) => dist(tx, ty, e) <= 150);
          if (!near.length) return;
          const n = Math.min(6, near.length * 2);
          for (let k = 0; k < n; k++) {
            const e = near[k % near.length];
            const a = (k * Math.PI * 2) / n;
            const [cx, cy] = [tx + Math.cos(a) * 34, ty + Math.sin(a) * 34];
            const small = flakeObject(scene, tx, ty, 3);
            let [ex, ey] = [e.x, e.y];
            frames(
              scene,
              300 + k * 25,
              (q) => {
                if (e.active) [ex, ey] = [e.x, e.y];
                small.setPosition(...bez(tx, ty, cx, cy, ex, ey, q));
                small.rotation -= 0.3;
              },
              () => {
                small.destroy();
                if (!e.active) return;
                world.strike(e, 1, 'basic', false, { freeze: 300 }, 40);
                sparks(scene, ex, ey, [0xfff1e8, 0xc2f0ff], 6, 8);
                ring(scene, ex, ey, 0xc2f0ff, 2, 9, 200);
              },
            );
          }
        },
      );
    },
  },

  // Senpo: Kawazu Kumite, the Frog Kata: in Sage Mode Naruto's blows are wrapped in nature energy, so they hit far
  // beyond his fist; the enemy is struck by a punch that stopped well short of it. He drops into the toad's crouch
  // while nature energy spirals into him, then lets go: jab, hook and a rising kick that reaches flyers. Full charge:
  // five blows reaching twice as far, ending in a two-palm toad push that blasts everything ahead into the air.
  // (The suggested Rendan ending is already his combo's launcher, so the kata ends on the toad push instead.)
  naruto: {
    name: 'SENPO: KAWAZU KUMITE',
    desc: 'KATA KATAK: 3 PUKULAN ENERGI ALAM MENJANGKAU JAUH; PENUH: 5 PUKULAN + DORONGAN KATAK',
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      // Nature energy drawn in from all around: three spiral arms of orange and gold winding into him.
      const R = 24 - 8 * t01;
      for (let arm = 0; arm < 3; arm++)
        for (let s = 0; s < 9; s++) {
          const a = now / (level === 2 ? 120 : 220) + (arm * Math.PI * 2) / 3 + s * 0.35;
          const rad = R * (1 - s / 11);
          g.fillStyle(s % 2 ? 0xffa300 : 0xffec27, (0.2 + 0.6 * t01) * (1 - s / 12));
          g.fillRect(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad * 0.75, 1 + (s < 3 ? 1 : 0), 1);
        }
      // The toad's crouch: energy pooling flat on the ground at his feet.
      g.fillStyle(0xffa300, 0.25 + 0.3 * t01).fillEllipse(p.x, p.y + 8, 10 + 10 * t01, 3);
      if (level) g.lineStyle(1, 0xffec27, 0.7).strokeEllipse(p.x, p.y + 8, 12 + 10 * t01 + Math.sin(now / 60) * 2, 4);
    },
    fire({ p, world, scene }, level) {
      if (!world.targets(p.x, p.y).length) return false;
      const full = level === 2;
      const f = p.facing;
      const base = f > 0 ? 0 : Math.PI;
      // [tilt up (rad), reach px, blow size, mult]: jab, hook, rising kick (L1); full adds a second jab and a higher kick.
      const kata: [number, number, number, number][] = full
        ? [
            [0, 80, 4, 0.9],
            [-0.2, 80, 4, 0.9],
            [0.12, 80, 4, 0.9],
            [-0.7, 90, 5, 0.9],
          ]
        : [
            [0, 56, 3, 1.3],
            [-0.22, 56, 3, 1.3],
            [-0.6, 64, 4, 1],
          ];
      const STEP = full ? 100 : 120;
      p.lock(kata.length * STEP + (full ? 160 : 40));
      p.invuln(kata.length * STEP + (full ? 160 : 40));
      kata.forEach(([tilt, reach, size, mult], i) =>
        later(scene, i * STEP, () => {
          if (!p.active) return;
          p.setVelocityX(f * 70);
          // The blow is aimed as it is thrown, from wherever he stands now.
          const [ox, oy] = [p.x + f * 4, p.y];
          const kick = tilt <= -0.6;
          // The rising kick goes for the nearest flyer ahead within reach (they hover higher than its default tilt).
          const up = kick
            ? world
                .targets(ox, oy)
                .filter((t) => t.active && (t.x - ox) * f > 0 && t.y < oy - 24 && dist(ox, oy, t) < reach + 10)
                .sort((m, n) => dist(ox, oy, m) - dist(ox, oy, n))[0]
            : undefined;
          const a = up ? Phaser.Math.Angle.Between(ox, oy, up.x, up.y) : base - f * tilt;
          sageBlow(scene, ox, oy, a, reach, size);
          for (const t of world.targets(ox, oy)) {
            if (!t.active || !onLine(ox, oy, a, reach, t, 14)) continue;
            world.strike(t, mult, 'basic', false, undefined, kick ? 150 : 100);
            sparks(scene, t.x, t.y, [0xffa300, 0xffec27, 0xfff1e8], 6, 10);
            // Full: the rising kick throws small fry up.
            if (full && kick && t.active && light(t)) (t as Mover).setVelocityY(-180);
          }
          scene.cameras.main.shake(40, 0.003);
        }),
      );
      if (!full) return;
      // The two-palm toad push: both hands thrust out together and the nature energy goes with them in a cone of force,
      // two giant phantom palms and a wall of air that blasts everything ahead off its feet.
      later(scene, kata.length * STEP + 30, () => {
        if (!p.active) return;
        const [ox, oy] = [p.x + f * 4, p.y];
        for (const s of [-1, 1]) sageBlow(scene, ox, oy + s * 4, base - f * s * 0.18, 96, 7);
        const wave = scene.add.graphics().setDepth(12);
        frames(
          scene,
          260,
          (k) => {
            wave.clear();
            const r = 20 + 92 * k;
            for (const [w, c, al] of [
              [5, 0xab5236, 0.4],
              [3, 0xffa300, 0.7],
              [1, 0xffec27, 1],
            ] as const) {
              wave.lineStyle(w, c, al * (1 - k)).beginPath();
              wave.arc(ox, oy, r, base - 0.55, base + 0.55);
              wave.strokePath();
            }
          },
          () => wave.destroy(),
        );
        rocks(scene, ox + f * 10, FLOOR_Y - 2, 6);
        scene.cameras.main.shake(160, 0.012);
        for (const t of world.targets(ox, oy)) {
          const rel = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(ox, oy, t.x, t.y) - base);
          if (!t.active || dist(ox, oy, t) > 112 || Math.abs(rel) > 0.6) continue;
          world.strike(t, 2.4, 'basic', false, undefined, 320);
          if (t.active && light(t)) (t as Mover).setVelocityY(-240);
        }
      });
    },
  },

  // Chidori Eiso, the Chidori Sharp Spear: Sasuke's Chidori crackles in his hand while he charges; on release he
  // shapes it into a blade of lightning that shoots out to the enemy ahead (picked as it fires, flyers too), running
  // through everything on the line, then the current discharges back down the blade and locks them up. Full charge:
  // the spear reaches across most of the arena, forks into branches that skewer every enemy near the line, and then
  // bursts into Chidori Senbon: needles of lightning flying from all along it into everything close.
  sasuke: {
    name: 'CHIDORI EISO',
    desc: 'TOMBAK PETIR MEMANJANG MENEMBUS SATU GARIS; PENUH: 2X PANJANG, BERCABANG, JADI SENBON',
    charging({ p }, t01, level, g) {
      const [x, y] = [p.x + p.facing * 6, p.y + 1];
      g.fillStyle(BLUE, 0.2 + 0.2 * t01).fillCircle(x, y, 3 + 4 * t01);
      chidoriArcs(g, x, y, 3 + level * 2, 5 + 8 * t01 + level * 2);
      g.fillStyle(0xfff1e8).fillCircle(x, y, 1 + t01 * 1.5);
      // Full: the current spills into the ground and scores it.
      if (level === 2) {
        const fy = p.y + 8;
        for (const s of [-1, 1]) {
          const pts = jag(p.x, fy, p.x + s * Phaser.Math.Between(10, 18), fy, 1.5);
          g.lineStyle(1, BLUE, 0.8).beginPath().moveTo(p.x, fy);
          for (const [px, py] of pts) g.lineTo(px, py);
          g.strokePath();
        }
      }
    },
    fire({ p, world, scene }, level) {
      const all = world.targets(p.x, p.y);
      if (!all.length) return false;
      const full = level === 2;
      const f = p.facing;
      const LEN = full ? 230 : 130;
      const W2 = full ? 12 : 9;
      const [hx, hy] = [p.x + f * 6, p.y];
      // Aim now: at the nearest enemy ahead within reach and +-0.6 rad, else straight ahead.
      const aim = all.find((e) => dist(hx, hy, e) <= LEN && Math.abs(Math.atan2(e.y - hy, (e.x - hx) * f)) <= 0.6);
      const a = aim ? Phaser.Math.Angle.Between(hx, hy, aim.x, aim.y) : f > 0 ? 0 : Math.PI;
      const HOLD = full ? 320 : 220;
      p.lock(80 + HOLD + 80);
      p.invuln(80 + HOLD + 80);
      p.setVelocityX(0);
      const g = scene.add.graphics().setDepth(13);
      const onSpear = () => world.targets(hx, hy).filter((e) => e.active && onLine(hx, hy, a, LEN, e, W2));
      // The blade shoots out.
      frames(
        scene,
        80,
        (k) => {
          g.clear();
          lightningBlade(g, hx, hy, a, LEN * k, full ? 3 : 2);
        },
        () => {
          const run = onSpear();
          for (const t of run) {
            world.strike(t, full ? 2.2 : 1.6, 'basic', false, { freeze: 250 }, 60);
            sparks(scene, t.x, t.y, [BLUE, 0xfff1e8], 8, 12);
          }
          scene.cameras.main.shake(70, 0.006);
          // Full: branches fork off the spear and skewer every enemy near the line but off it.
          if (full)
            for (const t of world.targets(hx, hy)) {
              if (!t.active || run.includes(t) || segDist(hx, hy, a, LEN, t) > 70) continue;
              const along = Phaser.Math.Clamp((t.x - hx) * Math.cos(a) + (t.y - hy) * Math.sin(a), 10, LEN);
              const [bx, by] = [hx + Math.cos(a) * along, hy + Math.sin(a) * along];
              const ba = Phaser.Math.Angle.Between(bx, by, t.x, t.y);
              const bl = dist(bx, by, t);
              const bg = scene.add.graphics().setDepth(13);
              frames(
                scene,
                HOLD,
                (k) => {
                  bg.clear();
                  lightningBlade(bg, bx, by, ba, bl * Math.min(1, k * 5), 1);
                },
                () => bg.destroy(),
              );
              later(scene, 60, () => {
                if (!t.active) return;
                world.strike(t, 2, 'basic', false, { freeze: 400 }, 60);
                sparks(scene, t.x, t.y, [BLUE, 0xfff1e8], 6, 10);
              });
            }
          // It holds, crackling; then the current discharges back down the blade.
          frames(
            scene,
            HOLD,
            () => {
              g.clear();
              lightningBlade(g, hx, hy, a, LEN, full ? 3 : 2);
            },
            () => {
              for (const t of onSpear()) {
                world.strike(t, full ? 1.8 : 1.4, 'basic', false, { freeze: full ? 600 : 300 }, full ? 200 : 100);
                chidoriPop(scene, t.x, t.y);
              }
              scene.cameras.main.shake(90, 0.008);
              if (full) senbon(scene, world, hx, hy, a, LEN);
              frames(
                scene,
                80,
                (k) => {
                  g.clear();
                  if (!full) lightningBlade(g, hx, hy, a, LEN * (1 - k), 2);
                },
                () => g.destroy(),
              );
            },
          );
        },
      );
    },
  },

  // Gravity reversed: he lifts the scepter and turns "down" upside down in a field around him. Every enemy inside
  // falls UP, wrenched off the floor (or out of its flight) and pinned against the top of the arena, the field
  // ring blazing and pebbles raining upward. Then he brings the scepter down and gravity comes back a hundredfold:
  // they are hurled into the floor, each leaving a crater. Bosses are too heavy to lift; they take the strain and
  // the crush where they stand. Full charge: a much wider field, a harder throw and each impact quakes the floor
  // around it, pinning whatever is caught in the crater.
  gravityMaster: {
    name: 'ANGKAT & HEMPAS',
    desc: 'GRAVITASI DIBALIK: MUSUH SEKITAR TERANGKAT LALU DIHEMPAS; PENUH: LEBIH LUAS + GEMPA',
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const [x, y] = [p.x + p.facing * 20, p.y];
      const r = level === 2 ? 110 : 70 * Math.min(1, t01 / 0.375);
      if (r < 4) return;
      gravityField(g, x, y, r, now, 0.35 + 0.5 * t01);
      // Pebbles falling upward out of the field.
      if (now < (p.getData('gravMote') ?? 0)) return;
      p.setData('gravMote', now + (level ? 50 : 90));
      const px = x + Phaser.Math.FloatBetween(-r, r) * 0.9;
      const peb = scene.add.rectangle(px, FLOOR_Y - 2, 2, 2, Math.random() < 0.5 ? 0x5f574f : PALE).setDepth(12);
      scene.tweens.add({
        targets: peb,
        y: FLOOR_Y - 30 - Math.random() * 30,
        angle: 180,
        alpha: 0,
        duration: 500,
        onComplete: () => peb.destroy(),
      });
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const R = full ? 110 : 70;
      const [cx, cy] = [p.x + p.facing * 20, p.y];
      const foes = world.targets(cx, cy).filter((t) => dist(cx, cy, t) <= R);
      if (!foes.length) return false;
      const LIFT = full ? 420 : 340;
      p.lock(LIFT + 120);
      p.invuln(LIFT + 120);
      p.setVelocityX(0);
      const CEIL = 18;
      // The field flips: a ring bursts out, and everything inside takes the wrench of falling up.
      ring(scene, cx, cy, VIOLET, 6, R, 300, 2);
      ring(scene, cx, cy, PALE, 4, R * 0.7, 260);
      for (const t of foes) {
        world.strike(t, full ? 1.5 : 1, 'basic', false, undefined, 0);
        sparks(scene, t.x, t.y, [VIOLET, PALE], 6, 10);
      }
      const lifted = foes.filter((t) => !('tier' in t));
      const heavy = foes.filter((t) => 'tier' in t);
      const aura = scene.add.graphics().setDepth(12);
      const now = () => scene.time.now;
      frames(
        scene,
        LIFT,
        () => {
          aura.clear();
          gravityField(aura, cx, cy, R, now(), 0.6);
          for (const t of lifted) {
            if (!t.active) continue;
            stun(t);
            const b = (t as Mover).body;
            (t as Mover).setVelocity(b.velocity.x * 0.8, Math.max(-480, (CEIL - t.y) * 8));
            // Violet streaks rising off the body as it falls up.
            aura.lineStyle(1, PALE, 0.8).lineBetween(t.x - 4, t.y + 8, t.x - 4, t.y + 18);
            aura.lineBetween(t.x + 4, t.y + 6, t.x + 4, t.y + 14);
            aura.lineStyle(1, VIOLET, 0.8).strokeEllipse(t.x, t.y, 16, 6);
          }
          // Bosses strain against it: a violet column hauling at them that cannot lift them.
          for (const t of heavy) {
            if (!t.active) continue;
            aura.lineStyle(3, VOID, 0.5).lineBetween(t.x, t.y, t.x, CEIL);
            aura.lineStyle(1, VIOLET, 0.9).lineBetween(t.x, t.y, t.x, CEIL);
          }
        },
        () => {
          aura.clear();
          // The scepter comes down: gravity returns a hundredfold.
          if (full) scene.cameras.main.flash(90, 138, 63, 209);
          scene.cameras.main.shake(100, 0.006);
          const V = full ? 640 : 520;
          const landed = new Set<Foe>();
          const quaked = new Set<Foe>();
          const land = (t: Foe) => {
            if (landed.has(t)) return;
            landed.add(t);
            if (!t.active) return;
            if ((t as Mover).body.allowGravity === false) (t as Mover).setVelocity(0, 0);
            world.strike(t, full ? 3 : 2, 'basic', false, full ? { freeze: 500, slow: 1500 } : { slow: 1200 }, 0);
            crater(scene, t.x, full);
            scene.cameras.main.shake(80, full ? 0.012 : 0.008);
            if (!full) return;
            // The quake: the floor heaves around the crater, once per enemy however many land near it.
            for (const e of world.targets(t.x, FLOOR_Y)) {
              if (!e.active || quaked.has(e) || Math.abs(e.x - t.x) > 34 || e.y < FLOOR_Y - 40) continue;
              quaked.add(e);
              world.strike(e, 1.5, 'basic', false, undefined, 160);
            }
          };
          frames(
            scene,
            700,
            () => {
              aura.clear();
              for (const t of lifted) {
                if (landed.has(t)) continue;
                if (!t.active) {
                  landed.add(t);
                  continue;
                }
                stun(t);
                (t as Mover).setVelocity(0, V);
                // The downward rush: streaks above the falling body.
                aura.lineStyle(1, PALE, 0.9).lineBetween(t.x - 3, t.y - 20, t.x - 3, t.y - 8);
                aura.lineStyle(1, VIOLET, 0.9).lineBetween(t.x + 3, t.y - 16, t.x + 3, t.y - 6);
                if ((t as Mover).body.blocked.down || t.y >= FLOOR_Y - 10) land(t);
              }
            },
            () => {
              aura.destroy();
              for (const t of lifted) land(t);
            },
          );
          // The heavy ones are crushed where they stand, a column of force slamming down on them.
          later(scene, 220, () => {
            for (const t of heavy) {
              if (!t.active) continue;
              const col = scene.add.rectangle(t.x, t.y / 2, 14, t.y, VIOLET, 0.5).setDepth(12);
              scene.tweens.add({ targets: col, scaleX: 0, alpha: 0, duration: 260, onComplete: () => col.destroy() });
              land(t);
            }
          });
        },
      );
    },
  },
};

/** Where the Chidori discharges through a body: a white pop and short arcs snapping out of it. */
function chidoriPop(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(14);
  chidoriArcs(g, x, y, 5, 12);
  g.fillStyle(0xfff1e8).fillCircle(x, y, 3);
  scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
}

/**
 * Chidori Senbon: the spear bursts into needles of lightning that fly from all along it into every enemy within 110 px
 * of the line: four needles each (0.5 apiece), the last throwing small fry up.
 */
function senbon(scene: Phaser.Scene, world: ChargedCtx['world'], hx: number, hy: number, a: number, len: number): void {
  for (let i = 0; i < 10; i++) sparks(scene, hx + Math.cos(a) * len * (i / 9), hy + Math.sin(a) * len * (i / 9), [BLUE, 0xfff1e8], 3, 8);
  for (const t of world.targets(hx, hy)) {
    if (!t.active || segDist(hx, hy, a, len, t) > 110) continue;
    for (let i = 0; i < 4; i++) {
      const s = Phaser.Math.FloatBetween(0.1, 1) * len;
      const [sx, sy] = [hx + Math.cos(a) * s, hy + Math.sin(a) * s];
      const n = scene.add.image(sx, sy, 'senbon').setDepth(14).setTint(0xc2f0ff);
      let [tx, ty] = [t.x, t.y];
      frames(
        scene,
        120 + i * 40,
        (k) => {
          if (t.active) [tx, ty] = [t.x, t.y];
          n.setPosition(sx + (tx - sx) * k, sy + (ty - sy) * k).setRotation(Math.atan2(ty - sy, tx - sx));
        },
        () => {
          n.destroy();
          if (!t.active) return;
          world.strike(t, 0.5, 'basic', false, undefined, i === 3 ? 140 : 30);
          if (i === 3 && t.active && light(t)) (t as Mover).setVelocityY(-160);
        },
      );
    }
  }
}
