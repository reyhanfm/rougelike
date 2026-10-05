import Phaser from 'phaser';
import { FLOOR_Y, H, W, cutMark, floatText } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import { LEVIATHAN } from '../../logic/stages.ts';
import { afterimage, glint, jag, later, leafBurst, ring, rocks, sparks } from '../skills.ts';
import type { ChargedAttack } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
type Pt = { x: number; y: number };

/** Bosses and elites are too heavy to be thrown into the air. */
const heavy = (t: Foe) => 'tier' in t || !!t.getData('elite');
const launch = (t: Foe, v: number) => {
  if (t.active && !heavy(t)) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-v);
};
const dist = (a: Pt, x: number, y: number) => Phaser.Math.Distance.Between(a.x, a.y, x, y);
/** A fixed pseudo-random 0..1 per index, so a shape drawn every frame does not flicker. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
/** Distance from (x, y) to the segment (x1, y1)-(x2, y2). */
function segDist(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const k = Phaser.Math.Clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Phaser.Math.Distance.Between(x, y, x1 + dx * k, y1 + dy * k);
}
/** The point under the hero's feet (the floor, or the platform he stands on). */
const feet = (p: Pt) => Math.min(FLOOR_Y - 1, p.y + 7);
const v2 = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

// ---------------------------------------------------------------- Sukuna

/** The strands of the web: a fan over the floor (left wall to right wall through straight up), a full wheel in the air. */
function webAngles(air: boolean, full: boolean): number[] {
  const n = full ? 11 : 9;
  if (air) return Array.from({ length: n + 3 }, (_, i) => (i / (n + 3)) * Math.PI * 2);
  return Array.from({ length: n }, (_, i) => -Math.PI + 0.05 + (i / (n - 1)) * (Math.PI - 0.1));
}

/**
 * Draws the Dismantle web centred on (cx, cy): strands out to `reach` px, and the first `rings` of `ringAt` (fractions of
 * the radius R) strung between them, each sagging toward the palm like real silk. `hot` = the moment it snaps tight.
 */
function drawWeb(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  angles: number[],
  closed: boolean,
  reach: number,
  R: number,
  ringAt: number[],
  rings: number,
  hot: boolean,
  alpha = 1,
): void {
  const layers = hot
    ? ([
        [6, 0xff004d, 0.35],
        [3, 0xff77a8, 0.8],
        [1, 0xfff1e8, 1],
      ] as const)
    : ([
        [4, 0x7e2553, 0.35],
        [2, 0xff004d, 0.8],
        [1, 0xfff1e8, 0.85],
      ] as const);
  const at = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  for (const [w, c, a] of layers) {
    g.lineStyle(w, c, a * alpha);
    for (const a0 of angles) g.lineBetween(cx, cy, ...at(a0, reach));
    for (let k = 0; k < rings; k++) {
      const r = ringAt[k] * R;
      if (r > reach) continue;
      const n = closed ? angles.length : angles.length - 1;
      for (let i = 0; i < n; i++) {
        const [a1, a2] = [angles[i], angles[(i + 1) % angles.length] + (closed && i === angles.length - 1 ? Math.PI * 2 : 0)];
        const [x1, y1] = at(a1, r);
        const [mx, my] = at((a1 + a2) / 2, r * 0.86);
        const [x2, y2] = at(a2, r);
        g.beginPath().moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).strokePath();
      }
    }
  }
}

// ---------------------------------------------------------------- Gojo

/** Space struck by Gojo's fist: crescents of folded space thrown ahead, a pinch that bursts, and cracks like glass. */
function spaceFold(scene: Phaser.Scene, x: number, y: number, side: number, full: boolean): void {
  const g = scene.add.graphics();
  for (let k = 0; k < 3; k++)
    for (const [w, c, a] of [
      [3, 0x1d2b53, 0.8],
      [2, 0x29adff, 0.9],
      [1, 0xc2f0ff, 1],
    ] as const)
      g.lineStyle(w, c, a)
        .beginPath()
        .arc(0, 0, 6 + k * 7, -0.9, 0.9)
        .strokePath();
  const lens = scene.add
    .container(x, y, [g])
    .setDepth(14)
    .setScale(side * 0.4, 0.6);
  scene.tweens.add({
    targets: lens,
    x: x + side * (full ? 46 : 26),
    scaleX: side * (full ? 2.2 : 1.5),
    scaleY: full ? 1.7 : 1.2,
    alpha: 0,
    duration: 280,
    ease: 'Quad.Out',
    onComplete: () => lens.destroy(),
  });
  // Space pinched to a point at the knuckles, then let go.
  ring(scene, x, y, 0xc2f0ff, 16, 1, 90);
  later(scene, 80, () => ring(scene, x, y, 0x29adff, 2, full ? 36 : 22, 260, 2));
  // Cracks run out of the impact as if the air itself were glass.
  const cr = scene.add.graphics().setDepth(14);
  for (let i = 0; i < (full ? 8 : 5); i++) {
    const a = (side > 0 ? 0 : Math.PI) + (i / ((full ? 8 : 5) - 1) - 0.5) * 2.6;
    const l = Phaser.Math.Between(10, full ? 30 : 18);
    const pts = jag(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 2);
    for (const [w, c, al] of [
      [2, 0x29adff, 0.5],
      [1, 0xfff1e8, 1],
    ] as const) {
      cr.lineStyle(w, c, al).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts) cr.lineTo(px, py);
      cr.strokePath();
    }
  }
  scene.tweens.add({ targets: cr, alpha: 0, delay: 120, duration: 220, onComplete: () => cr.destroy() });
  // The torn air streams on along the punch.
  for (let i = 0; i < 6; i++) {
    const l = scene.add.rectangle(x, y + Phaser.Math.Between(-8, 8), 10, 1, i % 2 ? 0xc2f0ff : 0xfff1e8).setDepth(13);
    scene.tweens.add({
      targets: l,
      x: x + side * Phaser.Math.Between(30, 60),
      scaleX: 0.2,
      alpha: 0,
      duration: 220,
      onComplete: () => l.destroy(),
    });
  }
}

/** Kokusen (Black Flash): the world goes dark for a blink and black lightning rimmed in red tears out of the impact. */
function blackFlash(scene: Phaser.Scene, x: number, y: number): void {
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(8);
  scene.tweens.add({ targets: dim, alpha: 0, delay: 60, duration: 160, onComplete: () => dim.destroy() });
  const g = scene.add.graphics().setDepth(15);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
    const l = Phaser.Math.Between(16, 38);
    const pts = jag(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 4);
    for (const [w, c, al] of [
      [5, 0xff004d, 0.5],
      [2, 0x000000, 1],
    ] as const) {
      g.lineStyle(w, c, al).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.strokePath();
    }
  }
  scene.tweens.add({ targets: g, alpha: 0.2, duration: 50, yoyo: true, repeat: 2, onComplete: () => g.destroy() });
  sparks(scene, x, y, [0x000000, 0xff004d, 0x000000], 14, 30);
}

// ---------------------------------------------------------------- Toji

/** A pane of barrier (a technique, a shield, a scale) shows up across the spear's path and breaks into shards. */
function shatter(scene: Phaser.Scene, x: number, y: number, a: number): void {
  const g = scene.add.graphics();
  const hex = Array.from({ length: 6 }, (_, i) => v2(Math.cos((i / 6) * Math.PI * 2) * 9, Math.sin((i / 6) * Math.PI * 2) * 9));
  g.fillStyle(0xc2c3ff, 0.3).fillPoints(hex, true);
  g.lineStyle(2, 0x83769c).strokePoints(hex, true);
  g.lineStyle(1, 0xfff1e8).strokePoints(hex, true);
  const pane = scene.add.container(x, y, [g]).setDepth(14).setScale(0.35, 1).setRotation(a);
  later(scene, 70, () => {
    pane.destroy();
    for (let i = 0; i < 7; i++) {
      const s = scene.add
        .triangle(x, y, 0, 0, 5, 1, 1, 5, i % 2 ? 0xc2c3ff : 0xfff1e8)
        .setStrokeStyle(1, 0x83769c)
        .setDepth(14);
      const d = a + Phaser.Math.FloatBetween(-1, 1);
      scene.tweens.add({
        targets: s,
        x: x + Math.cos(d) * Phaser.Math.Between(10, 24),
        y: y + Math.sin(d) * Phaser.Math.Between(10, 24) + 8,
        angle: Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: 380,
        onComplete: () => s.destroy(),
      });
    }
  });
}

/**
 * The Inverted Spear nullifies what guards its target: Leviathan's scales soak a hit down to a quarter (Boss.resist),
 * so against armor the spear is sharpened back to the full blow (the scales still take it, and crack all the faster).
 */
const pierce = (t: Foe, mult: number) => (((t as unknown as { armorFrac?: number }).armorFrac ?? 0) > 0 ? mult / LEVIATHAN.armored : mult);

// ---------------------------------------------------------------- Hashirama

/** A wooden lance growing from (x0, y0) toward (x1, y1) (and a little past it): barked, tapering, with a leaf. */
function lance(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, thick: number, onReach: () => void): void {
  const a = Phaser.Math.Angle.Between(x0, y0, x1, y1);
  const L = Phaser.Math.Distance.Between(x0, y0, x1, y1) + 10;
  const g = scene.add.graphics();
  const wood = scene.add.container(x0, y0, [g]).setDepth(12).setRotation(a);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 90,
    ease: 'Quad.Out',
    onUpdate: (tw) => {
      const l = L * (tw.getValue() ?? 0);
      g.clear();
      g.fillStyle(0x4a2a1a).fillTriangle(-1, -thick - 1, -1, thick + 1, l + 2, 0);
      g.fillStyle(0x7a4a2a).fillTriangle(0, -thick, 0, thick, l, 0);
      g.fillStyle(0xab5236).fillTriangle(0, -thick, 0, -thick * 0.3, l * 0.9, -0.5);
      // Bark rings, and a twig with leaves halfway up.
      for (let d = 6; d < l - 6; d += 7) g.fillStyle(0x4a2a1a).fillRect(d, -thick * (1 - d / l) * 0.8, 1, thick * (1 - d / l) * 1.6);
      if (l > 24) {
        g.lineStyle(1, 0x7a4a2a).lineBetween(l * 0.45, -1, l * 0.45 + 5, -6);
        g.fillStyle(0x00e436).fillRect(l * 0.45 + 4, -8, 2, 2);
        g.fillStyle(0x008751).fillRect(l * 0.45 + 6, -7, 2, 1);
      }
    },
    onComplete: onReach,
  });
  // It holds the enemy run through, then dries out and crumbles.
  scene.tweens.add({ targets: wood, alpha: 0, scaleY: 0.3, delay: 380, duration: 260, onComplete: () => wood.destroy() });
}

/** Stakes splitting out of a run-through enemy at (x, y): `n` wooden spikes of length `len` bursting outward. */
function stakeBurst(scene: Phaser.Scene, x: number, y: number, n: number, len: number): void {
  const g = scene.add.graphics();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(i + x) * 0.5;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const l = len * (0.75 + rnd(i * 3 + y) * 0.25);
    const tri = (w: number, k: number, col: number) => g.fillStyle(col).fillTriangle(-s * w, c * w, s * w, -c * w, c * l * k, s * l * k);
    tri(2.5, 1.05, 0x4a2a1a);
    tri(1.6, 1, 0x7a4a2a);
    tri(0.6, 0.9, 0xab5236);
  }
  const c = scene.add.container(x, y, [g]).setDepth(13).setScale(0);
  scene.tweens.add({ targets: c, scale: 1, duration: 90, ease: 'Back.Out' });
  scene.tweens.add({ targets: c, alpha: 0, scale: 0.8, delay: 320, duration: 240, onComplete: () => c.destroy() });
  leafBurst(scene, x, y, 6);
}

/** Charged attacks (TAHAN J) of: sukuna, gojo, toji, madara, hashirama. Contract and damage budget: see types.ts. */
export const BATCH_4: Partial<Record<ClassId, ChargedAttack>> = {
  // Dismantle: Spiderweb (Kumo no Su). Hachi is already his combo finisher and his passive, so the hold is the web he
  // used to bring the ground down under Gojo in Shinjuku: he sets his palm to the floor and Dismantle spreads out of
  // it as a spider's web. Strands race out from the palm along the floor and up into the air (each enemy they reach
  // is cut along the strand), the rings are strung between them, then the whole web snaps tight and cuts across.
  // Full: a wider web, and the floor it is cut into caves in, throwing everything on it up into the air.
  sukuna: {
    name: 'JARING DISMANTLE',
    desc: 'TELAPAK KE TANAH: JARING DISMANTLE MENCABIK SEKITAR; PENUH: JARING LEBAR, LANTAI AMBRUK',
    charging({ p, scene }, t01, level, g) {
      // Cursed energy pools under his palm, and hairline cracks feel their way out of it: the web being laid.
      const cx = Phaser.Math.Clamp(p.x + p.facing * 8, 4, W - 4);
      const cy = feet(p);
      const pulse = Math.sin(scene.time.now / (level === 2 ? 40 : 90));
      g.fillStyle(0x7e2553, 0.25 + 0.2 * t01).fillEllipse(cx, cy, 10 + 26 * t01 + pulse * 2, 3 + 2 * t01);
      g.fillStyle(0xff004d, 0.5).fillEllipse(cx, cy, 4 + 6 * t01, 2);
      const angles = webAngles(!p.grounded, level === 2);
      g.lineStyle(1, 0xff004d, 0.25 + 0.45 * t01);
      angles.forEach((a, i) => {
        const l = (10 + 46 * t01) * (0.6 + 0.4 * rnd(i));
        g.lineBetween(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      });
      if (level) drawWeb(g, cx, cy, angles, !p.grounded, 10 + 46 * t01, 56, [0.35, 0.7], level, false, 0.25 + 0.15 * pulse);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const R = full ? 100 : 60;
      const air = !p.grounded;
      const cx = Phaser.Math.Clamp(p.x + p.facing * 8, 4, W - 4);
      const cy = feet(p);
      const inWeb = (t: Foe) => dist(t, cx, cy) <= R + 6 && (air || t.y <= cy + 4);
      const caught = world.targets(cx, cy).filter(inWeb);
      if (!caught.length) return false;
      const cam = scene.cameras.main;
      p.lock(full ? 560 : 420);
      p.invuln(full ? 560 : 360);
      p.setVelocityX(0);
      const angles = webAngles(air, full);
      const ringAt = full ? [0.28, 0.52, 0.76, 1] : [0.36, 0.7, 1];
      // 1. The palm meets the floor: a red pulse and grit thrown up.
      glint(scene, cx, cy - 2);
      ring(scene, cx, cy, 0xff004d, 2, 18, 220, 2);
      if (!air) rocks(scene, cx, cy, 4);
      // 2. The strands race out from the palm; whoever a strand reaches is cut along it.
      const SPOKE = 150;
      const g = scene.add.graphics().setDepth(12);
      let shown = 0;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: SPOKE,
        ease: 'Quad.Out',
        onUpdate: (tw) => {
          g.clear();
          drawWeb(g, cx, cy, angles, air, R * (tw.getValue() ?? 0), R, ringAt, 0, false);
        },
      });
      for (const t of caught)
        later(scene, SPOKE * Math.min(1, dist(t, cx, cy) / R), () => {
          if (!t.active) return;
          cutMark(scene, t.x, t.y, 0xff004d, 26, Phaser.Math.Angle.Between(cx, cy, t.x, t.y));
          sparks(scene, t.x, t.y, [0xff004d, 0xfff1e8], 5, 12);
          world.strike(t, full ? 2 : 1.5, 'basic', false, undefined, 40);
        });
      // 3. The rings are strung one by one, inner to outer.
      ringAt.forEach((_, k) =>
        later(scene, SPOKE + k * 50, () => {
          shown = k + 1;
          g.clear();
          drawWeb(g, cx, cy, angles, air, R, R, ringAt, shown, false);
        }),
      );
      // 4. The web snaps tight: every strand flares and everything in it is cut across.
      const SNAP = SPOKE + ringAt.length * 50 + 80;
      later(scene, SNAP, () => {
        g.clear();
        drawWeb(g, cx, cy, angles, air, R, R, ringAt, shown, true);
        cam.shake(140, 0.012);
        for (const t of caught) {
          if (!t.active) continue;
          cutMark(scene, t.x, t.y, 0xff77a8, 30, Phaser.Math.Angle.Between(cx, cy, t.x, t.y) + Math.PI / 2);
          sparks(scene, t.x, t.y, [0xff004d, 0x7e2553, 0xfff1e8], 8, 16);
          world.strike(t, full ? 2 : 1.5, 'basic', false, { slow: 900 }, 0);
        }
      });
      // 5. Full: the floor cut into a web gives way; the ground caves in and throws everyone on it into the air.
      if (full)
        later(scene, SNAP + 160, () => {
          cam.flash(120, 255, 0, 77);
          cam.shake(300, 0.022);
          if (!air) {
            const crater = scene.add.graphics().setDepth(5);
            crater.fillStyle(0x1d0f0a).fillEllipse(cx, FLOOR_Y + 1, R * 1.8, 6);
            crater.fillStyle(0x7e2553, 0.8).fillEllipse(cx, FLOOR_Y, R * 1.2, 2);
            const cracks = scene.add.graphics().setDepth(5);
            for (const s of [-1, 1]) {
              const pts = jag(cx, FLOOR_Y - 1, cx + s * R, FLOOR_Y - 1, 2);
              cracks.lineStyle(2, 0xff004d, 0.7).beginPath().moveTo(pts[0][0], pts[0][1]);
              for (const [x, y] of pts) cracks.lineTo(x, y);
              cracks.strokePath();
            }
            scene.tweens.add({
              targets: [crater, cracks],
              alpha: 0,
              delay: 600,
              duration: 500,
              onComplete: () => (crater.destroy(), cracks.destroy()),
            });
            for (let i = -3; i <= 3; i++) rocks(scene, Phaser.Math.Clamp(cx + i * R * 0.28, 4, W - 4), FLOOR_Y - 1, 3);
          }
          for (const t of caught) {
            if (!t.active) continue;
            cutMark(scene, t.x, t.y, 0xff004d, 36, 0.8);
            cutMark(scene, t.x, t.y, 0xff004d, 36, -0.8);
            world.strike(t, 2, 'basic', true, undefined, 160);
            launch(t, 230);
          }
        });
      scene.tweens.add({ targets: g, alpha: 0, delay: SNAP + (full ? 260 : 120), duration: 260, onComplete: () => g.destroy() });
    },
  },

  // Infinity in his fist: Gojo folds the space in front of his knuckles while he holds. On release he is at the side of
  // the nearest enemy ahead (in the air too) before it can move, and the punch lands with the folded space behind it:
  // crescents of compressed space are thrown out the far side and hit everything in a cone behind the target, and the
  // air around the impact cracks like glass. Full: Kokusen (Black Flash), the blow landing within a millionth of a
  // second of the cursed energy: the world blinks black, black lightning rimmed in red, a far wider cone, all launched.
  gojo: {
    name: 'TINJU TAK TERBATAS',
    desc: 'MUNCUL DI SISI MUSUH DEPAN, PUKULAN MELIPAT RUANG; PENUH: KOKUSEN, KILAT HITAM MELONTARKAN',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      const [fx, fy] = [p.x + f * 6, p.y - 1];
      // Infinity: a faint shell of slowed space around him.
      g.lineStyle(1, 0x29adff, 0.12 + 0.2 * t01).strokeCircle(p.x, p.y, 13 + Math.sin(now / 120));
      // Space folding into his fist: lens rings squeezed flat along the punch, contracting into the knuckles.
      for (let k = 0; k < 3; k++) {
        const ph = (((now / 400 + k / 3) % 1) + 1) % 1;
        const r = (6 + 12 * t01) * (1 - ph);
        g.lineStyle(1, k % 2 ? 0xc2f0ff : 0x29adff, 0.2 + 0.6 * ph * (0.4 + t01)).strokeEllipse(fx, fy, r * 0.9, r * 2);
      }
      g.fillStyle(0x29adff, 0.25 + 0.25 * t01).fillCircle(fx, fy, 2 + 2 * t01);
      g.fillStyle(0xfff1e8).fillRect(fx - 1, fy - 1, 2, 2);
      // Full: black sparks crackling off the fist, the Black Flash a hair away.
      if (level === 2)
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const pts = jag(fx, fy, fx + Math.cos(a) * 9, fy + Math.sin(a) * 9, 2);
          for (const [w, c] of [
            [3, 0xff004d],
            [1, 0x000000],
          ] as const) {
            g.lineStyle(w, c, w === 3 ? 0.5 : 1)
              .beginPath()
              .moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) g.lineTo(x, y);
            g.strokePath();
          }
        }
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const reach = full ? 130 : 85;
      const t = world.targets(p.x, p.y).find((e) => f * (e.x - p.x) > -6 && dist(e, p.x, p.y) <= reach);
      if (!t) return false;
      const side = t.x >= p.x ? 1 : -1;
      p.invuln(full ? 560 : 400);
      p.lock(full ? 420 : 300);
      // 1. He is simply there: a blue afterimage left behind, space closing where he stood.
      afterimage(scene, p, p.x, p.y, 0.6, 0x29adff);
      ring(scene, p.x, p.y, 0x29adff, 18, 2, 160);
      p.body.reset(Phaser.Math.Clamp(t.x - side * 11, 6, W - 6), Math.min(t.y, FLOOR_Y - 8));
      p.facing = side;
      // 2. The fist lands (full: a held beat first, the zone, then the Black Flash).
      later(scene, full ? 120 : 60, () => {
        if (!p.active) return;
        const [ix, iy] = t.active ? [t.x - side * 4, t.y] : [p.x + side * 8, p.y];
        const len = full ? 100 : 60;
        // Everyone in the cone behind the target, taken now, before the punch moves anyone.
        const cone = world.targets(ix, iy).filter((o) => {
          const dx = (o.x - ix) * side;
          return o !== t && dx > -4 && dx < len && Math.abs(o.y - iy) < 10 + dx * 0.45;
        });
        spaceFold(scene, ix, iy, side, full);
        if (full) {
          blackFlash(scene, ix, iy);
          floatText(scene, Phaser.Math.Clamp(ix, 30, W - 30), Math.max(34, Math.min(iy, p.y) - 44), 'KOKUSEN!', '#ff004d');
        }
        scene.cameras.main.shake(full ? 240 : 120, full ? 0.022 : 0.01);
        if (t.active) {
          world.strike(t, full ? 3.5 : 2, 'basic', full, undefined, full ? 340 : 240);
          if (full) launch(t, 220);
        }
        // 3. The folded space springs back through the cone, the target included, nearest first.
        for (const o of [t, ...cone])
          later(scene, 60 + Math.abs(o.x - ix) * 1.5, () => {
            if (!o.active) return;
            sparks(scene, o.x, o.y, full ? [0x000000, 0xff004d, 0xc2f0ff] : [0x29adff, 0xc2f0ff, 0xfff1e8], 7, 14);
            world.strike(o, full ? 2.5 : 1, 'basic', false, undefined, full ? 280 : 200);
            if (full) launch(o, 200);
          });
      });
    },
  },

  // Ama no Sakahoko, the Inverted Spear of Heaven, the blade that cancels any cursed technique it touches. Toji has
  // no cursed energy at all, so his charge is only a body coiling: the floor cracks under his back foot. Released, he
  // crosses the ground in a blink, spear first; the air tears in a lance-shaped wake and a sonic ring is left at the
  // kick-off. Everything on the line finds its guard nullified as he passes (a barrier pane breaks over each one) and
  // takes the thrust from behind (shields face the wrong way by then; Leviathan's scales are run through). Full: aimed
  // as he leaves at the nearest enemy ahead, flyers too, farther; then he wrenches the spear out and throws them up.
  toji: {
    name: 'TUSUKAN PEMBATAL',
    desc: 'MELESAT MENUSUK SEBARIS, TEMBUS PERISAI & SISIK; PENUH: BIDIK KE UDARA, DICABUT, TERLEMPAR',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const [fx, fy] = [p.x - f * 3, feet(p)];
      // Dust pressed out from under his feet, cracks spreading back from the heel.
      g.fillStyle(0xc2c3c7, 0.15 + 0.25 * t01).fillEllipse(fx, fy, 8 + 12 * t01, 2);
      for (let i = 0; i < 4; i++) {
        const l = (3 + 14 * t01) * (0.6 + 0.4 * rnd(i));
        const [ex, ey] = [fx - f * l, fy + (rnd(i + 9) - 0.5) * 2];
        g.lineStyle(2, 0x1d1d2b, 0.8).lineBetween(fx, fy, ex, ey);
        g.lineStyle(1, 0x83769c).lineBetween(fx, fy, ex, ey);
      }
      // Tension: speed lines drawn in behind him, faster once full.
      const now = scene.time.now;
      for (let i = 0; i < 3; i++) {
        const ph = (((now / (level === 2 ? 120 : 240) + i / 3) % 1) + 1) % 1;
        const x = p.x - f * (8 + 16 * (1 - ph));
        g.lineStyle(1, 0xfff1e8, t01 * ph * 0.8).lineBetween(x, p.y - 5 + i * 5, x - f * 6, p.y - 5 + i * 5);
      }
      // Full: grit hops off the floor around his feet.
      if (level === 2 && Math.random() < 0.3) {
        const r = scene.add.rectangle(fx + Phaser.Math.Between(-8, 8), fy, 1, 1, 0x83769c).setDepth(12);
        scene.tweens.add({
          targets: r,
          y: fy - Phaser.Math.Between(3, 8),
          alpha: 0,
          duration: 200,
          yoyo: false,
          onComplete: () => r.destroy(),
        });
      }
    },
    fire({ p, world, scene }, level) {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const full = level === 2;
      const f = p.facing;
      // Aim as he leaves: level ahead, or (full) at the nearest enemy ahead within a steep cone.
      let a = f > 0 ? 0 : Math.PI;
      const mark = full
        ? foes.find((e) => f * (e.x - p.x) > 4 && Math.abs(Math.atan2(e.y - p.y, Math.abs(e.x - p.x))) < 0.8 && dist(e, p.x, p.y) < 170)
        : undefined;
      if (mark) a = Phaser.Math.Angle.Between(p.x, p.y, mark.x, mark.y);
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      // Run the line out, stopping at the walls, the ceiling and the floor.
      const lim = (v: number, lo: number, hi: number, d: number) => (d > 0.01 ? (hi - v) / d : d < -0.01 ? (lo - v) / d : Infinity);
      const len = Math.max(10, Math.min(full ? 150 : 96, lim(p.x, 8, W - 8, dx), lim(p.y, 30, FLOOR_Y - 7, dy)));
      const [x0, y0] = [p.x, p.y];
      const [x1, y1] = [x0 + dx * len, y0 + dy * len];
      const MS = full ? 140 : 110;
      p.invuln(MS + 260);
      p.lock(MS + 80);
      p.facing = dx >= 0 ? 1 : -1;
      // 1. The kick-off: the floor craters, a sonic ring is left hanging where he stood.
      if (p.grounded) rocks(scene, x0, FLOOR_Y - 2, 5);
      ring(scene, x0, y0, 0xfff1e8, 3, 20, 200, 2);
      ring(scene, x0, y0, 0x83769c, 6, 28, 260);
      // 2. Spear first, a blink across: afterimages and the spear held out ahead of him.
      const spear = scene.add.image(x0, y0, 'w_sakahoko').setRotation(a).setScale(1.4).setDepth(13);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: MS,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          if (!p.active) return;
          p.body.reset(x0 + dx * len * k, y0 + dy * len * k);
          spear.setPosition(p.x + dx * 10, p.y + dy * 10);
          afterimage(scene, p, p.x, p.y, 0.35, 0x83769c);
        },
        onComplete: () => {
          spear.destroy();
          if (p.active) p.setVelocity(0, 0);
        },
      });
      // The wake: a long lance of torn air along the whole line, dark edge, steel body, white core.
      const wk = scene.add.graphics();
      wk.fillStyle(0x3b3b4f, 0.4).fillPoints([v2(0, 0), v2(len, -6), v2(len + 10, 0), v2(len, 6)], true);
      wk.fillStyle(0xc2c3c7, 0.7).fillPoints([v2(0, 0), v2(len, -3), v2(len + 7, 0), v2(len, 3)], true);
      wk.lineStyle(1, 0xfff1e8).lineBetween(0, 0, len + 7, 0);
      const wake = scene.add.container(x0, y0, [wk]).setDepth(12).setRotation(a).setScale(0, 1);
      scene.tweens.add({ targets: wake, scaleX: 1, duration: MS });
      scene.tweens.add({ targets: wake, scaleY: 0, alpha: 0, delay: MS + 120, duration: 220, onComplete: () => wake.destroy() });
      // 3. He is past them: every guard on the line breaks and the thrust lands from behind.
      later(scene, MS, () => {
        const run = world.targets(x0, y0).filter((t) => segDist(t.x, t.y, x0, y0, x1, y1) <= 12 + t.displayHeight / 3);
        scene.cameras.main.shake(140, 0.012);
        ring(scene, x1, y1, 0xfff1e8, 2, 16, 160);
        for (const t of run) {
          shatter(scene, t.x, t.y, a);
          cutMark(scene, t.x, t.y, 0xc2c3c7, 30, a);
          world.strike(t, pierce(t, full ? 3.2 : 3), 'basic', false, undefined, 200);
        }
        if (!full) return;
        // 4. Full: the spear is wrenched back out; they are torn loose and thrown up.
        later(scene, 160, () => {
          const left = run.filter((t) => t.active);
          if (!left.length) return;
          scene.cameras.main.flash(90, 194, 195, 255);
          scene.cameras.main.shake(200, 0.018);
          for (const t of left) {
            cutMark(scene, t.x, t.y, 0xfff1e8, 34, a + Math.PI / 2);
            sparks(scene, t.x, t.y, [0xfff1e8, 0xc2c3ff, 0xb3122e], 10, 18);
            world.strike(t, pierce(t, 2.8), 'basic', true, undefined, 260);
            launch(t, 240);
          }
        });
      });
    },
  },

  // Uchiha Gaeshi (Uchiha Return): Madara raises the gunbai and holds it up; its chakra film swallows every enemy
  // projectile that reaches it while he holds (they swirl on its face). On release he swings it: the stored force comes
  // back out as a wall of pressure bowed forward that rolls ahead, hurling back everything it meets, and each swallowed
  // projectile is returned at the nearest enemies, tinted with his chakra. Full: the wall rises from the floor to the
  // sky and travels much farther, staggering and throwing up what it hits; more of the swallowed shots come back.
  madara: {
    name: 'UCHIHA GAESHI',
    desc: 'GUNBAI MENYERAP PELURU SAAT DITAHAN, DINDING TEKANAN & PELURU BALIK; PENUH: SAMPAI LANGIT',
    charging({ p, world, scene }, t01, level, g) {
      const now = scene.time.now;
      // What the fan has swallowed during this charge (a gap of a few frames means a new charge).
      let s = p.getData('gaeshi') as { at: number; shots: string[] } | undefined;
      if (!s || now - s.at > 150) s = { at: now, shots: [] };
      s.at = now;
      p.setData('gaeshi', s);
      const f = p.facing;
      const [fx, fy] = [p.x + f * 9, p.y - 3];
      const r = 6 + 3 * t01;
      const pulse = Math.sin(now / (level === 2 ? 50 : 110));
      // The chakra film over the fan, and the war fan itself held up: handle, dark rim, pale face, the Uchiha mark.
      g.fillStyle(0x8a3fd1, 0.15 + 0.15 * t01).fillEllipse(fx, fy, r * 1.4 + 6 + pulse, r * 2 + 8 + pulse * 2);
      g.lineStyle(2, 0x3b2418).lineBetween(fx, fy + r, p.x + f * 4, p.y + 5);
      g.fillStyle(0x1d0f2e).fillEllipse(fx, fy, r * 1.1 + 2, r * 2 + 2);
      g.fillStyle(0xfff1e8).fillEllipse(fx, fy, r * 1.1, r * 2);
      g.fillStyle(0xc2c3c7).fillEllipse(fx + f * r * 0.15, fy + r * 0.2, r * 0.7, r * 1.4);
      g.fillStyle(0xff004d).fillEllipse(fx, fy - r * 0.35, r * 0.7, r * 0.7);
      g.fillStyle(0xfff1e8).fillEllipse(fx, fy + r * 0.35, r * 0.7, r * 0.7);
      g.lineStyle(1, 0x1d0f2e).strokeEllipse(fx, fy, r * 0.7, r * 1.4);
      if (level) g.lineStyle(1, 0xd0b0ff, 0.6 + 0.3 * pulse).strokeEllipse(fx, fy, r * 1.4 + 6, r * 2 + 8);
      // The swallowed shots circle on the fan's face.
      s.shots.forEach((_, i) => {
        const a = now / 140 + (i / s.shots.length) * Math.PI * 2;
        g.fillStyle(0xd0b0ff).fillRect(fx + Math.cos(a) * r * 0.5 - 1, fy + Math.sin(a) * r - 1, 2, 2);
      });
      // Absorb: any hostile projectile reaching the fan from the front is drawn into it.
      for (const h of world.hostiles()) {
        if (f * (h.x - p.x) < -2 || dist(h, fx, fy) > r + 16) continue;
        s.shots.push(h.texture.key);
        ring(scene, h.x, h.y, 0xd0b0ff, 8, 1, 160);
        const m = scene.add.rectangle(h.x, h.y, 2, 2, 0xd0b0ff).setDepth(13);
        scene.tweens.add({ targets: m, x: fx, y: fy, duration: 120, onComplete: () => m.destroy() });
        h.destroy();
      }
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const now = scene.time.now;
      const s = p.getData('gaeshi') as { at: number; shots: string[] } | undefined;
      const shots = s && now - s.at < 200 ? s.shots.slice(0, full ? 4 : 2) : [];
      p.setData('gaeshi', undefined);
      if (!world.targets(p.x, p.y).length && !shots.length) return false;
      p.lock(280);
      p.invuln(320);
      p.setVelocityX(0);
      const [fx, fy] = [p.x + f * 9, p.y - 3];
      // 1. The swing: the fan sweeps through and the stored force leaves it.
      ring(scene, fx, fy, 0xd0b0ff, 4, 24, 220, 2);
      sparks(scene, fx, fy, [0xd0b0ff, 0x8a3fd1, 0xfff1e8], 10, 18);
      if (full) scene.cameras.main.flash(120, 138, 63, 209);
      scene.cameras.main.shake(full ? 260 : 140, full ? 0.016 : 0.01);
      // 2. The wall of pressure: a crescent bowed forward, layered violet glow, pale body and a white front edge.
      const top = full ? 22 : p.y - 26;
      const bot = full ? FLOOR_Y : Math.min(FLOOR_Y, p.y + 16);
      const h = bot - top;
      const B = full ? 14 : 10;
      const edge = (back: number) =>
        Array.from({ length: 13 }, (_, i) => {
          const v = (i / 12) * 2 - 1;
          return v2((B - back) * (1 - v * v) - (back ? 1 : 0), (v * h) / 2);
        });
      const shape = (pad: number, back: number) => [...edge(0).map((q) => v2(q.x + pad, q.y * (1 + pad / h))), ...edge(back).reverse()];
      const wg = scene.add.graphics();
      wg.fillStyle(0x8a3fd1, 0.35).fillPoints(shape(3, B + 4), true);
      wg.fillStyle(0xd0b0ff, 0.75).fillPoints(shape(0, B - 2), true);
      wg.lineStyle(1, 0xfff1e8).strokePoints(edge(0));
      for (let i = 0; i < 5; i++)
        wg.lineStyle(1, 0xd0b0ff, 0.5).lineBetween(-24 + i * 3, (i / 4 - 0.5) * h * 0.7, -6, (i / 4 - 0.5) * h * 0.7);
      const x0 = p.x + f * 8;
      const LEN = full ? 220 : 120;
      const wall = scene.add
        .container(x0, top + h / 2, [wg])
        .setDepth(12)
        .setScale(f, 1);
      const hit = new Set<Foe>();
      scene.tweens.add({
        targets: wall,
        x: x0 + f * LEN,
        duration: full ? 440 : 300,
        ease: 'Quad.Out',
        onUpdate: () => {
          const front = wall.x + f * B * 0.6;
          if (bot >= FLOOR_Y - 2 && Math.random() < 0.35) rocks(scene, front, FLOOR_Y - 1, 1);
          for (const t of world.targets(front, wall.y)) {
            if (hit.has(t) || Math.abs(t.x - front) > 12 || t.y < top - 6 || t.y > bot + 6) continue;
            hit.add(t);
            sparks(scene, t.x, t.y, [0xd0b0ff, 0xfff1e8], 6, 14);
            world.strike(t, full ? 5 : 2.5, 'basic', false, full ? { slow: 900 } : undefined, full ? 420 : 320);
            if (full) launch(t, 200);
          }
        },
        onComplete: () => scene.tweens.add({ targets: wall, alpha: 0, scaleX: f * 0.4, duration: 140, onComplete: () => wall.destroy() }),
      });
      // 3. What the fan swallowed goes back where it came from: at the nearest enemies, in his chakra's color.
      shots.forEach((key, i) =>
        later(scene, 80 + i * 70, () => {
          if (!p.active) return;
          const foes = world.targets(fx, fy);
          const t = foes[i % Math.max(1, foes.length)];
          const a = t ? Phaser.Math.Angle.Between(fx, fy, t.x, t.y) : f > 0 ? 0 : Math.PI;
          ring(scene, fx, fy, 0xfff1e8, 2, 10, 140);
          world.shot({
            x: fx,
            y: fy,
            vx: Math.cos(a) * 260,
            vy: Math.sin(a) * 260,
            texture: key,
            mult: 0.5,
            source: 'basic',
            tint: 0xd0b0ff,
          });
        }),
      );
    },
  },

  // Mokuton: Sashiki no Jutsu (Wood Release: Cutting Technique): wood creeps over Hashirama's forearm while he holds,
  // stakes pushing out of it. Released, he thrusts his arm out and the wood shoots from it as long barked lances, one
  // to each of the nearest enemies ahead, each aimed at where its enemy is as it grows (the air too), running them
  // through and binding them; barbs split out of the wood inside them. Full: five lances that reach farther, and stakes
  // burst out of every impaled enemy in all directions, spearing whatever stands close to it as well.
  hashirama: {
    name: 'MOKUTON: SASHIKI',
    desc: 'TOMBAK KAYU DARI LENGAN MENUSUK 3 MUSUH DEPAN; PENUH: 5 TOMBAK, DURI MEKAR DI TUBUH MUSUH',
    charging({ p }, t01, level, g) {
      const f = p.facing;
      const [sx, sy] = [p.x + f, p.y - 2];
      const len = 5 + 9 * t01;
      // Bark wrapping the forearm.
      g.lineStyle(4, 0x4a2a1a).lineBetween(sx, sy, sx + f * len, sy);
      g.lineStyle(2, 0x7a4a2a).lineBetween(sx, sy, sx + f * len, sy);
      g.lineStyle(1, 0xab5236).lineBetween(sx, sy - 1, sx + f * len, sy - 1);
      // Stakes pushing out of it, pointing forward and out, more and longer as the charge grows.
      const n = 1 + Math.floor(t01 * 4);
      for (let i = 0; i < n; i++) {
        const bx = sx + f * len * ((i + 1) / (n + 1));
        const up = i % 2 ? 1 : -1;
        const [tx, ty] = [bx + f * (3 + 4 * t01), sy + up * (2 + 3 * t01)];
        g.fillStyle(0x4a2a1a).fillTriangle(bx, sy - 1.5, bx, sy + 1.5, tx, ty);
        g.fillStyle(0xab5236).fillTriangle(bx, sy - 0.5, bx, sy + 0.5, tx, ty);
      }
      // The point at the fist.
      g.fillStyle(0x4a2a1a).fillTriangle(sx + f * len, sy - 2, sx + f * len, sy + 2, sx + f * (len + 4 + 3 * t01), sy);
      if (level) {
        g.fillStyle(0x00e436).fillRect(sx + f * len * 0.5, sy - 4, 2, 1);
        g.fillStyle(0x008751).fillRect(sx + f * len * 0.8, sy + 3, 2, 1);
      }
      // Full: roots creep out over the floor around his feet.
      if (level === 2) {
        const fy = feet(p);
        g.lineStyle(1, 0x7a4a2a);
        for (const s of [-1, 1])
          g.beginPath()
            .moveTo(p.x, fy)
            .lineTo(p.x + s * 5, fy - 1)
            .lineTo(p.x + s * 10, fy)
            .strokePath();
      }
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x + f * 6, p.y - 2];
      const reach = full ? 170 : 110;
      const prey = world
        .targets(ox, oy)
        .filter((t) => f * (t.x - ox) > -4 && dist(t, ox, oy) <= reach)
        .slice(0, full ? 5 : 3);
      if (!prey.length) return false;
      p.lock(full ? 480 : 360);
      p.invuln(240);
      p.setVelocityX(0);
      // The arm thrust out: splinters and leaves off the wood as it bursts.
      leafBurst(scene, ox, oy, 6);
      ring(scene, ox, oy, 0xab5236, 2, 14, 180);
      prey.forEach((t, i) =>
        later(scene, i * 45, () => {
          if (!t.active || !p.active) return;
          // Each lance takes its line now, at the enemy where it is.
          lance(scene, p.x + f * 6, p.y - 2, t.x, t.y, full ? 4 : 3, () => {
            if (!t.active) return;
            sparks(scene, t.x, t.y, [0xab5236, 0x7a4a2a, 0x00e436], 6, 12);
            scene.cameras.main.shake(70, 0.008);
            world.strike(t, full ? 3 : 1.8, 'basic', false, { freeze: full ? 900 : 450 }, 60);
          });
          // The barbs: wood splitting out inside them.
          later(scene, 220, () => {
            if (!t.active) return;
            stakeBurst(scene, t.x, t.y, full ? 7 : 4, full ? 22 : 11);
            world.strike(t, full ? 2.6 : 1.2, 'basic', false, undefined, 80);
            // Full: the stakes reach whoever stands close to the impaled one too.
            if (full)
              for (const o of world.targets(t.x, t.y))
                if (o !== t && !prey.includes(o) && dist(o, t.x, t.y) < 26) world.strike(o, 1.5, 'basic', false, { freeze: 600 }, 120);
          });
        }),
      );
    },
  },
};
