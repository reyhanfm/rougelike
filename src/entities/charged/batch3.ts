import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark, floatText } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import {
  FIRE,
  TREASURES,
  afterimage,
  bladeLine,
  explosion,
  flameTongue,
  jag,
  later,
  onLine,
  ring,
  rocks,
  sparks,
  whileAlive,
} from '../skills.ts';
import type { ChargedAttack } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Small fry are thrown into the air; bosses and elites are too heavy. */
function launch(t: Foe, vy: number): void {
  if (t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-vy);
}

/** Bearing of t from (x, y) relative to facing f (0 = straight ahead, positive = down) and its distance. */
function bearing(f: number, x: number, y: number, t: Foe): { a: number; d: number } {
  return { a: Math.atan2(t.y - y, (t.x - x) * f), d: Phaser.Math.Distance.Between(x, y, t.x, t.y) };
}

/** World angle of a facing-relative angle. */
const wa = (f: number, a: number) => (f > 0 ? a : Math.PI - a);

/** A filled crescent along the circle of radius r around (cx, cy) from angle a0 to a1, w px thick in the middle. */
function crescent(g: G, cx: number, cy: number, r: number, a0: number, a1: number, w: number, color: number, alpha = 1): void {
  const pts: Phaser.Math.Vector2[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const a = a0 + (a1 - a0) * u;
    const rr = r - w * Math.sin(Math.PI * u);
    pts.push(V(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

/** A lens (pointed at both ends, w px from the axis at its widest) from (x1, y1) to (x2, y2). */
function lens(g: G, x1: number, y1: number, x2: number, y2: number, w: number, color: number, alpha = 1): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const pts: Phaser.Math.Vector2[] = [];
  const N = 12;
  for (let s = 1; s >= -1; s -= 2)
    for (let i = 0; i <= N; i++) {
      const u = s > 0 ? i / N : 1 - i / N;
      const h = s * w * Math.sin(Math.PI * u);
      pts.push(V(x1 + dx * u + nx * h, y1 + dy * u + ny * h));
    }
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

/** A tear in space: violet glow, a lit rim, the void inside and a crimson vein down its middle. */
function rift(g: G, x1: number, y1: number, x2: number, y2: number, w: number, hot = false): void {
  if (w <= 0.2 || Math.hypot(x2 - x1, y2 - y1) < 1) return;
  lens(g, x1, y1, x2, y2, w + 2.5, 0x8a3fd1, 0.3);
  lens(g, x1, y1, x2, y2, w + 1, hot ? 0xff004d : 0xc080ff, 0.95);
  lens(g, x1, y1, x2, y2, w, 0x000000);
  lens(g, x1, y1, x2, y2, Math.max(0.4, w * 0.22), 0x7e2553);
}

/** Antares' half-transformed arm: the Dragon of Destruction's foreleg, shoulder at the origin, talons reaching +x to 64. */
function dragonArm(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  // Heat haze around the claw.
  g.fillStyle(0xff004d, 0.22).fillEllipse(52, 0, 30, 22);
  // Forearm: black outline, crimson scale, lit top edge, darker scale rows.
  g.fillStyle(0x1d0f0a).fillPoints([V(-2, -7), V(44, -6), V(44, 6), V(-2, 7)], true);
  g.fillStyle(0xb3122e).fillPoints([V(0, -5), V(43, -4.5), V(43, 4.5), V(0, 5)], true);
  g.fillStyle(0xff004d).fillRect(2, -4, 40, 1);
  g.fillStyle(0x7e2553);
  for (let i = 0; i < 6; i++) g.fillTriangle(4 + i * 6.5, 0, 7 + i * 6.5, 3, 10 + i * 6.5, 0);
  // Dorsal spikes along the top.
  for (let i = 0; i < 4; i++) {
    const sx = 6 + i * 9;
    g.fillStyle(0x1d0f0a).fillTriangle(sx - 1, -5, sx + 3, -12, sx + 6, -5);
    g.fillStyle(0xb3122e).fillTriangle(sx + 1, -5, sx + 3, -10, sx + 4, -5);
  }
  // The hand.
  g.fillStyle(0x1d0f0a).fillRect(41, -8, 12, 16);
  g.fillStyle(0xb3122e).fillRect(42, -7, 10, 14);
  g.fillStyle(0xff004d).fillRect(42, -7, 10, 1);
  // Three hooked talons, black with a red-hot tip.
  for (const ty of [-5, 0, 5]) {
    g.fillStyle(0x000000).fillTriangle(50, ty - 3, 50, ty + 3, 66, ty + 3);
    g.fillStyle(0x3b3b4f).fillTriangle(51, ty - 1.5, 51, ty + 1.5, 62, ty + 2);
    g.fillStyle(0xffa300).fillRect(61, ty + 1, 4, 1);
  }
  return scene.add.container(x, y, [g]).setDepth(12);
}

/** Merodach, the golden original of all swords: hilt at the origin, blade along +x for `len` px. */
function merodach(scene: Phaser.Scene, x: number, y: number, len: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0xffec27, 0.25).fillRect(4, -5, len, 10);
  // Grip and pommel.
  g.fillStyle(0x3b2418).fillRect(-6, -1.5, 8, 3);
  g.fillStyle(0xd4a017).fillRect(-8, -2, 2, 4);
  // Guard with a red gem.
  g.fillStyle(0x5f3a00).fillRect(1, -6, 4, 12);
  g.fillStyle(0xd4a017).fillRect(2, -5, 2, 10);
  g.fillStyle(0xff004d).fillRect(2, -1, 2, 2);
  // Blade: dark outline, gold body, white fuller, a point.
  g.fillStyle(0x5f3a00)
    .fillRect(5, -3, len - 6, 6)
    .fillTriangle(len - 1, -3, len - 1, 3, len + 6, 0);
  g.fillStyle(0xffec27)
    .fillRect(5, -2, len - 6, 4)
    .fillTriangle(len - 1, -2, len - 1, 2, len + 4, 0);
  g.fillStyle(0xfff1e8).fillRect(6, -0.5, len - 8, 1);
  return scene.add.container(x, y, [g]).setDepth(13);
}

/** Charged attacks (TAHAN J) of: samurai, darkAvenger, ashura, antares, gilgamesh. Contract and damage budget: see types.ts. */
export const BATCH_3: Partial<Record<ClassId, ChargedAttack>> = {
  // Amakakeru Ryu no Hirameki, the ougi of Hiten Mitsurugi-ryu. He settles into the battojutsu stance while the air
  // around him is drawn in. On release his left foot steps in and the draw comes at godspeed: one wide crescent of
  // steel. The blade moved so fast it leaves a hole in the air, and the air rushes back in, dragging everything
  // around into the cut. He spins through on the planted foot and, carried by that inrush, the second strike lands
  // on everything that was sucked in. Full: the vacuum reaches far (flyers too) and the second strike is the
  // heavenly dragon itself, a spiral of steel that throws its victims into the sky.
  samurai: {
    name: 'AMAKAKERU RYU',
    desc: 'IAI SECEPAT DEWA, VAKUM MENARIK MUSUH KE TEBASAN KEDUA; PENUH: VAKUM LUAS, NAGA MELEMPAR',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      // The air is drawn in from both sides along the floor, quicker with every level.
      const period = level === 2 ? 220 : level ? 320 : 460;
      for (let i = 0; i < 8; i++) {
        const u = (now / period + i / 8) % 1;
        const side = i % 2 ? 1 : -1;
        const d = 6 + 44 * (1 - u);
        const y = p.y + 6 - (i % 4) * 5;
        g.lineStyle(1, level === 2 ? 0xfff1e8 : 0xc2c3c7, 0.2 + 0.55 * u).lineBetween(p.x + side * d, y, p.x + side * (d + 4 + 8 * u), y);
      }
      // The dragon coils: an indigo arc circling him, tightening as the charge grows.
      const r = 20 - 8 * t01;
      const a = (now / 140) * f;
      g.lineStyle(3, 0x29adff, 0.15 + 0.2 * t01)
        .beginPath()
        .arc(p.x, p.y, r, a, a + 2.2)
        .strokePath();
      g.lineStyle(1, level === 2 ? 0xfff1e8 : 0x37479e, 0.5 + 0.4 * t01)
        .beginPath()
        .arc(p.x, p.y, r, a, a + 2.2)
        .strokePath();
      // Full: a red glint at his hand on the hilt, the blade ready to leave the scabbard.
      if (level === 2) {
        const s = 2 + Math.sin(now / 40);
        const hx = p.x + f * 4;
        const hy = p.y + 2;
        g.fillStyle(0xff004d)
          .fillRect(hx - s, hy, s * 2 + 1, 1)
          .fillRect(hx, hy - s, 1, s * 2 + 1);
      }
    },
    fire({ p, world, scene }, level) {
      if (!world.targets(p.x, p.y).length) return false;
      const full = level === 2;
      const f = p.facing;
      // The left foot steps in at godspeed: a short lunge, untouchable.
      p.lock(full ? 560 : 440);
      p.invuln(full ? 600 : 460);
      p.setVelocityX(f * (full ? 300 : 220));
      afterimage(scene, p, p.x, p.y, 0.55, 0x29adff);
      later(scene, 80, () => {
        if (!p.active) return;
        p.setVelocityX(0);
        const ox = p.x;
        const oy = p.y;
        const R = full ? 72 : 54;
        // 1. The draw: a wide crescent of steel in front of him, from low to high, gone as soon as it is seen.
        const cut = scene.add.container(ox, oy).setDepth(13).setScale(f, 1);
        const cg = scene.add.graphics();
        crescent(cg, 0, 0, R + 2, 1.0, -0.95, 10, 0x29adff, 0.3);
        crescent(cg, 0, 0, R, 1.0, -0.95, 6, 0x37479e, 0.85);
        crescent(cg, 0, 0, R - 1, 0.9, -0.85, 2, 0xfff1e8);
        cut.add(cg);
        scene.tweens.add({ targets: cut, alpha: 0, delay: 90, duration: 200, onComplete: () => cut.destroy() });
        scene.cameras.main.shake(90, 0.006);
        for (const t of world.targets(ox, oy)) {
          const dx = (t.x - ox) * f;
          if (dx < -6 || dx > R + 6 || Math.abs(t.y - oy) > (full ? 46 : 30)) continue;
          later(scene, Math.max(0, (dx / R) * 40), () => {
            if (!t.active) return;
            cutMark(scene, t.x, t.y, 0xfff1e8, 26);
            // A light knockback: the vacuum is about to drag them back in.
            world.strike(t, full ? 2 : 1.6, 'basic', false, undefined, 40);
          });
        }
        // 2. The vacuum: the air rushes back into the hole the blade left, dragging everything into it.
        const vx = Phaser.Math.Clamp(ox + f * R * 0.5, 4, W - 4);
        const vy = oy - (full ? 10 : 4);
        const reach = full ? 120 : 72;
        ring(scene, vx, vy, 0xc2c3c7, reach * 0.6, 2, 240);
        for (let i = 0; i < (full ? 16 : 10); i++) {
          const a = (i / (full ? 16 : 10)) * Math.PI * 2 + Math.random() * 0.3;
          const d = reach * (0.6 + Math.random() * 0.4);
          const streak = scene.add
            .rectangle(vx + Math.cos(a) * d, vy + Math.sin(a) * d, 8, 1, i % 3 ? 0xc2c3c7 : 0xfff1e8, 0.8)
            .setRotation(a)
            .setDepth(12);
          scene.tweens.add({
            targets: streak,
            x: vx,
            y: vy,
            scaleX: 0.3,
            alpha: 0.2,
            duration: 200,
            ease: 'Quad.In',
            onComplete: () => streak.destroy(),
          });
        }
        for (let k = 0; k < 4; k++) later(scene, 20 + k * 50, () => world.pull(vx, vy, reach, full ? 240 : 160));
        // 3. The second strike: he spins through on the planted foot and the inrushing air carries the blade round.
        later(scene, full ? 280 : 230, () => {
          if (!p.active) return;
          const sx = p.x + f * 6;
          const sy = p.y - 4;
          const r2 = full ? 54 : 36;
          afterimage(scene, p, p.x - f * 3, p.y, 0.5, 0x37479e);
          const spin = scene.add.container(sx, sy).setDepth(13).setScale(f, 1);
          const sg = scene.add.graphics();
          if (full) {
            // The heavenly dragon: a spiral of steel winding out from him, its head at the outer end.
            const pts: Phaser.Math.Vector2[] = [];
            for (let i = 0; i <= 40; i++) {
              const u = i / 40;
              const a = u * Math.PI * 3.4 - Math.PI / 2;
              pts.push(V(Math.cos(a) * (6 + (r2 - 6) * u), Math.sin(a) * (6 + (r2 - 6) * u)));
            }
            for (const [w, c, al] of [
              [6, 0x29adff, 0.3],
              [3, 0x37479e, 0.9],
              [1, 0xfff1e8, 1],
            ] as const)
              sg.lineStyle(w, c, al).strokePoints(pts);
            const hd = pts[pts.length - 1];
            sg.fillStyle(0xfff1e8).fillTriangle(hd.x - 3, hd.y - 4, hd.x - 3, hd.y + 4, hd.x + 5, hd.y);
            sg.fillStyle(0xff004d).fillRect(hd.x - 1, hd.y - 1, 2, 2);
          } else {
            crescent(sg, 0, 0, r2, -Math.PI, 0, 5, 0x37479e, 0.85);
            crescent(sg, 0, 0, r2, 0, Math.PI, 5, 0x37479e, 0.85);
            crescent(sg, 0, 0, r2 - 1, -Math.PI, 0, 1.5, 0xfff1e8);
            crescent(sg, 0, 0, r2 - 1, 0, Math.PI, 1.5, 0xfff1e8);
          }
          spin.add(sg);
          scene.tweens.add({ targets: spin, angle: f * 120, alpha: 0, duration: 300, ease: 'Quad.Out', onComplete: () => spin.destroy() });
          sparks(scene, sx, sy, [0xfff1e8, 0x29adff, 0xff77a8], full ? 16 : 8, r2);
          for (const t of world.targets(sx, sy)) {
            if (Phaser.Math.Distance.Between(sx, sy, t.x, t.y) > r2 + 6) continue;
            cutMark(scene, t.x, t.y, full ? 0xff004d : 0xfff1e8, 30);
            world.strike(t, full ? 3.4 : 1.4, 'basic', false, undefined, full ? 300 : 180);
            if (full) launch(t, 240);
          }
          if (full) {
            scene.cameras.main.flash(120, 200, 230, 255);
            scene.cameras.main.shake(220, 0.016);
            floatText(scene, p.x, p.y - 44, 'HIRAMEKI!', '#29adff');
          } else scene.cameras.main.shake(120, 0.008);
        });
      });
    },
  },

  // Robekan Jurang (Abyss Rend): the Dark Avenger's hatred cuts deeper than flesh. While he charges, his shadow pools
  // under him, its tendrils climb into the greatsword and the air in front of him starts to split. On release he
  // sweeps the blade flat through the space ahead and the cut does not close: a tear into the abyss hangs there,
  // burning violet at its edges, until it snaps shut and cuts everything in it a second time. Full: two great
  // diagonal sweeps carve an X of tears across the air in front of him (high enough for flyers), the tears collapse
  // into the black point where they cross, and the abyss bursts out of it, throwing everything around.
  darkAvenger: {
    name: 'ROBEKAN JURANG',
    desc: 'TEBASAN DATAR MEROBEK RUANG, CELAHNYA MENUTUP & MENEBAS LAGI; PENUH: SILANG X MELEDAK',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      // His shadow pools under him and spreads as the darkness gathers.
      const pw = 8 + 14 * t01;
      g.fillStyle(0x000000, 0.55).fillEllipse(p.x, p.y + 8, pw * 2, 4);
      g.lineStyle(1, 0x8a3fd1, 0.7).strokeEllipse(p.x, p.y + 8, pw * 2, 4);
      // Tendrils of shadow climb out of the pool into the raised greatsword.
      const hx = p.x + f * 6;
      const hy = p.y - 3;
      for (let i = 0; i < 4; i++) {
        const u = (now / (level ? 380 : 560) + i / 4) % 1;
        const bx = p.x + (i - 1.5) * pw * 0.5;
        const ex = bx + (hx - bx) * u + Math.sin(now / 70 + i) * 2;
        const ey = p.y + 8 + (hy - p.y - 8) * u;
        g.lineStyle(2, 0x2a0a2a, 0.85 - 0.4 * u).lineBetween(bx, p.y + 7, ex, ey);
        g.lineStyle(1, 0x8a3fd1, 0.85 - 0.4 * u).lineBetween(bx, p.y + 7, ex, ey);
      }
      // The air in front of him begins to split: a tear that lengthens with the charge (crimson-edged once full).
      const x1 = p.x + f * 12;
      const x2 = x1 + f * (6 + 30 * t01);
      rift(g, x1, p.y - 2, x2, p.y - 2, 0.6 + 1.6 * t01 + (level === 2 ? Math.sin(now / 40) * 0.4 : 0), level === 2);
    },
    fire({ p, world, scene }, level) {
      if (!world.targets(p.x, p.y).length) return false;
      const full = level === 2;
      const f = p.facing;
      p.lock(full ? 560 : 380);
      p.invuln(full ? 520 : 340);
      p.setVelocityX(f * 90);
      const ox = p.x;
      const oy = p.y;
      const g = scene.add.graphics().setDepth(12);
      // Shadow drips from the lower lip of an open tear, cracks spark off its ends.
      const drip = (x1: number, y1: number, x2: number, y2: number) => {
        const u = Math.random();
        const d = scene.add.rectangle(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u + 2, 1, 2, u < 0.5 ? 0x8a3fd1 : 0x2a0a2a).setDepth(12);
        scene.tweens.add({ targets: d, y: d.y + 10, alpha: 0, duration: 300, onComplete: () => d.destroy() });
      };
      const cracks = (x: number, y: number) => {
        const c = scene.add.graphics().setDepth(12);
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2;
          const pts = jag(x, y, x + Math.cos(a) * 10, y + Math.sin(a) * 10, 2);
          c.lineStyle(1, 0xc080ff).strokePoints(pts.map(([px, py]) => V(px, py)));
        }
        scene.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
      };

      if (!full) {
        // 1. The rend: one flat sweep of the greatsword through the space in front of him.
        const sw = scene.add
          .container(ox, oy - 2)
          .setDepth(13)
          .setScale(f, 0.45);
        const sg = scene.add.graphics();
        crescent(sg, 0, 0, 52, -1.4, 1.4, 12, 0x2a0a2a, 0.9);
        crescent(sg, 0, 0, 50, -1.3, 1.3, 7, 0x8a3fd1, 0.9);
        crescent(sg, 0, 0, 50, -1.2, 1.2, 2, 0xc080ff);
        sw.add(sg);
        scene.tweens.add({ targets: sw, alpha: 0, delay: 80, duration: 180, onComplete: () => sw.destroy() });
        for (const t of world.targets(ox, oy)) {
          const dx = (t.x - ox) * f;
          if (dx < -8 || dx > 58 || Math.abs(t.y - oy) > 22) continue;
          cutMark(scene, t.x, t.y, 0xc080ff, 26, 0);
          world.strike(t, 1.8, 'basic', false, undefined, 40);
        }
        scene.cameras.main.shake(100, 0.008);
        // 2. The cut does not close: a tear into the abyss hangs where the blade passed, then snaps shut.
        const x1 = ox + f * 8;
        const x2 = ox + f * 62;
        const y = oy - 2;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 420,
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 1;
            // Opens in the first quarter, gapes, then shuts in the last 20%.
            const w = 5 * (k < 0.25 ? k / 0.25 : k < 0.8 ? 1 + Math.sin(k * 60) * 0.12 : (1 - k) / 0.2);
            g.clear();
            rift(g, x1, y, x2, y, w);
            if (Math.random() < 0.4) drip(x1, y, x2, y);
          },
          onComplete: () => {
            g.destroy();
            bladeLine(scene, x1, y, x2, y, 0x8a3fd1, 40);
            cracks(x2, y);
            for (const t of world.targets(ox, oy)) {
              const dx = (t.x - ox) * f;
              if (dx < 2 || dx > 68 || Math.abs(t.y - y) > 16) continue;
              sparks(scene, t.x, t.y, [0x8a3fd1, 0xff004d], 5, 12);
              world.strike(t, 1.2, 'basic', false, { slow: 600 }, 120);
            }
          },
        });
        return;
      }

      // Full: two great diagonal sweeps carve an X of tears, crossing ahead of him at chest height and above.
      const cx = Phaser.Math.Clamp(ox + f * 54, 10, W - 10);
      const cy = oy - 22;
      const half = 54;
      const lines = [-0.62, 0.62].map((a) => {
        const ang = wa(f, a);
        return {
          ang,
          x1: cx - Math.cos(ang) * half,
          y1: cy - Math.sin(ang) * half,
          x2: cx + Math.cos(ang) * half,
          y2: cy + Math.sin(ang) * half,
        };
      });
      const opened = [0, 0];
      let collapse = 0;
      const draw = () => {
        g.clear();
        lines.forEach((l, i) => {
          if (!opened[i]) return;
          const k = 1 - collapse;
          rift(
            g,
            cx + (l.x1 - cx) * k,
            cy + (l.y1 - cy) * k,
            cx + (l.x2 - cx) * k,
            cy + (l.y2 - cy) * k,
            opened[i] * 5 * (0.5 + 0.5 * k),
            true,
          );
        });
      };
      lines.forEach((l, i) =>
        later(scene, i * 160, () => {
          // A sweep: the greatsword's wake, then the tear opening along it; everything on it is cut.
          bladeLine(scene, l.x1, l.y1, l.x2, l.y2, 0x8a3fd1, 50);
          scene.tweens.addCounter({ from: 0, to: 1, duration: 110, onUpdate: (tw) => (opened[i] = tw.getValue() ?? 1) });
          cracks(l.x1, l.y1);
          cracks(l.x2, l.y2);
          scene.cameras.main.shake(100, 0.01);
          for (const t of world.targets(cx, cy)) {
            if (!onLine(l.x1, l.y1, l.ang, half * 2, t, 14)) continue;
            cutMark(scene, t.x, t.y, 0xc080ff, 28, l.ang);
            world.strike(t, 1.4, 'basic', false, undefined, 30);
          }
        }),
      );
      // The X gapes, shadow dripping, while the abyss pulls at its edges.
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 520,
        onUpdate: () => {
          draw();
          for (const l of lines) if (Math.random() < 0.3) drip(l.x1, l.y1, l.x2, l.y2);
        },
        onComplete: () =>
          // 3. The tears collapse into the black point where they cross...
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 130,
            ease: 'Quad.In',
            onUpdate: (tw) => {
              collapse = tw.getValue() ?? 1;
              draw();
            },
            onComplete: () => {
              g.destroy();
              // ...and the abyss bursts out of it.
              const core = scene.add.circle(cx, cy, 4, 0x000000).setStrokeStyle(2, 0xc080ff).setDepth(13);
              scene.tweens.add({ targets: core, radius: 20, duration: 90, ease: 'Quad.Out' });
              scene.tweens.add({ targets: core, alpha: 0, delay: 90, duration: 220, onComplete: () => core.destroy() });
              ring(scene, cx, cy, 0x8a3fd1, 10, 64, 360, 3);
              ring(scene, cx, cy, 0xff004d, 6, 46, 280, 1);
              for (let k = 0; k < 10; k++) {
                const a = (k / 10) * Math.PI * 2;
                const spike = scene.add
                  .triangle(cx, cy, 0, -2, 0, 2, 18, 0, 0x2a0a2a)
                  .setOrigin(0)
                  .setStrokeStyle(1, 0x8a3fd1)
                  .setRotation(a)
                  .setScale(0.2, 1)
                  .setDepth(13);
                scene.tweens.add({
                  targets: spike,
                  scaleX: 2.6,
                  alpha: 0,
                  duration: 260,
                  ease: 'Quad.Out',
                  onComplete: () => spike.destroy(),
                });
              }
              sparks(scene, cx, cy, [0x8a3fd1, 0xc080ff, 0xff004d], 18, 50);
              scene.cameras.main.flash(140, 90, 30, 140);
              scene.cameras.main.shake(240, 0.02);
              for (const t of world.targets(cx, cy)) {
                if (Phaser.Math.Distance.Between(cx, cy, t.x, t.y) > 56) continue;
                world.strike(t, 2.8, 'basic', false, { slow: 900 }, 260);
                launch(t, 230);
              }
            },
          }),
      });
    },
  },

  // Tepukan Asura (the Asura's thunderclap): six phantom arms tear half out of his back while he charges, palms open
  // and trembling. On release they reach out in three pairs and clap, one pair after another, on the nearest enemy
  // ahead (re-aimed at it each time, so a flyer is caught in the air): one palm from above, one from below, the air
  // between them crushed with a crack. Full: after the three claps all six arms swing back and all six palms come
  // together on it at once, a giant clap whose pressure wave blasts out through everything around and throws it.
  ashura: {
    name: 'TEPUKAN ASURA',
    desc: '3 PASANG TANGAN BERTEPUK MENGHIMPIT MUSUH TERDEKAT; PENUH: TEPUKAN RAKSASA MELEMPAR',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      // Six arms half out of his back, fanned like a halo, open palms trembling; gold-lit once full.
      const k = 0.35 + 0.65 * t01;
      for (let i = 0; i < 6; i++) {
        const a = (f > 0 ? Math.PI : 0) + (i - 2.5) * 0.42 * f;
        const shake = level ? Math.sin(now / 25 + i) * 0.8 : 0;
        const ex = p.x + Math.cos(a) * 14 * k + shake;
        const ey = p.y - 4 + Math.sin(a) * 12 * k;
        g.lineStyle(4, 0x4a1a1a).lineBetween(p.x, p.y - 3, ex, ey);
        g.lineStyle(2, 0xb3122e).lineBetween(p.x, p.y - 3, ex, ey);
        g.fillStyle(0x4a1a1a).fillRect(ex - 2.5, ey - 2.5, 5, 5);
        g.fillStyle(level === 2 ? 0xffec27 : 0xff004d).fillRect(ex - 1.5, ey - 1.5, 3, 3);
      }
      if (level === 2) g.lineStyle(1, 0xffec27, 0.4 + 0.3 * Math.sin(now / 35)).strokeCircle(p.x, p.y - 4, 16 + Math.sin(now / 35));
    },
    fire({ p, world, scene }, level) {
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const full = level === 2;
      const f = p.facing;
      const R = full ? 120 : 90;
      const ahead = (t: Foe) => (t.x - p.x) * f > -6 && (t.x - p.x) * f < R && Math.abs(t.y - p.y) < 80;
      let mark: Foe | undefined = foes.find(ahead);
      // Where the claps land: on the mark where it is now, or in the air ahead of him if nothing is in reach.
      let pt = { x: Phaser.Math.Clamp(p.x + f * 40, 4, W - 4), y: p.y - 6 };
      const aim = () => {
        if (mark && !mark.active) mark = world.targets(p.x, p.y).find(ahead);
        if (mark?.active) pt = { x: mark.x, y: mark.y };
        return { ...pt };
      };
      p.lock(full ? 600 : 440);
      p.invuln(full ? 600 : 440);
      p.setVelocityX(0);

      // Each clap: which arms, when it starts, where it lands (set when it starts), how big.
      type Clap = { arms: number[]; at: number; pt?: { x: number; y: number }; gap: number; big: boolean };
      const claps: Clap[] = [0, 1, 2].map((k) => ({ arms: [k * 2, k * 2 + 1], at: k * 130, gap: 14, big: false }));
      if (full) claps.push({ arms: [0, 1, 2, 3, 4, 5], at: 420, gap: 30, big: true });
      const total = claps[claps.length - 1].at + 240;
      const g = scene.add.graphics().setDepth(12);

      const palm = (x: number, y: number, top: boolean, s: number) => {
        const w = 6 * s;
        const h = 4 * s;
        const py = top ? y - h : y;
        g.fillStyle(0x4a1a1a).fillRect(x - w / 2 - 1, py - 1, w + 2, h + 2);
        g.fillStyle(0xb3122e).fillRect(x - w / 2, py, w, h);
        // The lit striking face of the palm.
        g.fillStyle(0xff004d).fillRect(x - w / 2, top ? py + h - 1 : py, w, 1);
        // Fingers pointing ahead, a gold band at the wrist behind.
        for (let i = 0; i < 3; i++)
          g.fillStyle(0xb3122e).fillRect(f > 0 ? x + w / 2 : x - w / 2 - 3 * s, py + (h / 3) * i, 3 * s, Math.max(1, s * 0.8));
        g.fillStyle(0xffec27).fillRect(f > 0 ? x - w / 2 - 2 : x + w / 2, py, 2, h);
      };
      const arm = (sx: number, sy: number, hx: number, hy: number, top: boolean, s: number) => {
        // The arm bows out away from the clap, like a wing.
        const mx = (sx + hx) / 2 - f * 6;
        const my = (sy + hy) / 2 + (top ? -10 : 10);
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= 8; i++) {
          const u = i / 8;
          pts.push(
            V((1 - u) * (1 - u) * sx + 2 * u * (1 - u) * mx + u * u * hx, (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * my + u * u * hy),
          );
        }
        g.lineStyle(4 * s, 0x4a1a1a).strokePoints(pts);
        g.lineStyle(2 * s, 0xb3122e).strokePoints(pts);
        palm(hx, hy, top, s);
      };
      // One counter drives every arm: reach (0-60 ms after its clap starts), close (60-90), hold, then retract.
      scene.tweens.addCounter({
        from: 0,
        to: total,
        duration: total,
        onUpdate: (tw) => {
          const ms = tw.getValue() ?? total;
          g.clear();
          const sx = p.x - f * 2;
          const sy = p.y - 5;
          for (const c of claps) {
            const e = ms - c.at;
            if (e < 0 || !c.pt || e > 240) continue;
            const reach = e < 60 ? e / 60 : e < 160 ? 1 : 1 - (e - 160) / 80;
            const gap = e < 60 ? c.gap : e < 90 ? c.gap * (1 - (e - 60) / 30) + 2 * ((e - 60) / 30) : 2;
            const s = c.big ? 2 : 1;
            for (let j = 0; j < c.arms.length; j++) {
              const top = j % 2 === 0;
              const spread = c.big ? (Math.floor(j / 2) - 1) * 5 : 0;
              const hx = sx + (c.pt.x - f * spread - sx) * reach;
              const hy = sy + (c.pt.y + (top ? -gap : gap) - sy) * reach;
              arm(sx, sy - 2 + c.arms[j] * 1.2, hx, hy, top, s * (0.6 + 0.4 * reach));
            }
          }
        },
        onComplete: () => g.destroy(),
      });
      for (const c of claps) {
        later(scene, c.at, () => (c.pt = aim()));
        // The palms meet: the air between them cracks.
        later(scene, c.at + 90, () => {
          if (!p.active || !c.pt) return;
          const { x, y } = c.pt;
          if (!c.big) {
            const flash = scene.add.ellipse(x, y, 4, 14, 0xfff1e8).setDepth(14);
            scene.tweens.add({ targets: flash, scaleX: 3, scaleY: 0.3, alpha: 0, duration: 140, onComplete: () => flash.destroy() });
            ring(scene, x, y, 0xffec27, 2, 16, 200);
            sparks(scene, x, y, [0xffec27, 0xfff1e8], 6, 14);
            scene.cameras.main.shake(80, 0.007);
            world.area(x, y, 16, 1, 60, 'basic');
            return;
          }
          // The giant clap: a pressure wave blasts out of the palms, dust torn off the floor under it.
          const flash = scene.add.ellipse(x, y, 8, 40, 0xfff1e8).setDepth(14);
          scene.tweens.add({ targets: flash, scaleX: 4, scaleY: 0.2, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
          // Three pressure fronts, tall ovals swelling out of the palms (redrawn, so the line stays thin).
          const waves = scene.add.graphics().setDepth(13);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 460,
            onUpdate: (tw) => {
              const v = tw.getValue() ?? 1;
              waves.clear();
              for (let k = 0; k < 3; k++) {
                const u = Phaser.Math.Clamp((v * 460 - k * 50) / 360, 0, 1);
                if (u <= 0 || u >= 1) continue;
                waves.lineStyle(k === 1 ? 1 : 2, k === 1 ? 0xfff1e8 : 0xffec27, 1 - u).strokeEllipse(x, y, 10 + 90 * u, 30 + 60 * u);
              }
            },
            onComplete: () => waves.destroy(),
          });
          for (let k = 0; k < 10; k++) {
            const ly = y + Phaser.Math.Between(-30, 30);
            const line = scene.add.rectangle(x, ly, 14, 1, 0xfff1e8, 0.8).setDepth(12);
            const dir = k % 2 ? 1 : -1;
            scene.tweens.add({ targets: line, x: x + dir * 60, alpha: 0, duration: 220, onComplete: () => line.destroy() });
          }
          rocks(scene, x, FLOOR_Y - 2, 8);
          sparks(scene, x, y, [0xffec27, 0xffa300, 0xfff1e8], 18, 44);
          scene.cameras.main.flash(120, 255, 236, 39);
          scene.cameras.main.shake(260, 0.022);
          for (const t of world.targets(x, y)) {
            if (Phaser.Math.Distance.Between(x, y, t.x, t.y) > 44) continue;
            world.strike(t, 2.6, 'basic', false, undefined, 300);
            launch(t, 230);
          }
        });
      }
    },
  },

  // Cakar Kehancuran (Claw of Destruction): the Monarch lets his arm remember what it is. While he charges, crimson
  // scales crawl over his hand and black talons grow out of his fingers. On release the arm becomes the foreleg of
  // the Dragon of Destruction and rakes down through the air in front of him, from high over his head to the floor,
  // tearing three burning gashes into the air; the wounds it left ignite a beat later. Full: the foreleg is bigger
  // (reaching high into the air), rakes down and then back up through a second, crossing set of gashes, and every
  // wound bursts in dragon fire at once, throwing its victims up.
  antares: {
    name: 'CAKAR KEHANCURAN',
    desc: 'LENGAN NAGA MENCAKAR, LUKANYA TERBAKAR LALU MELEDAK; PENUH: CAKAR BOLAK-BALIK, MELEMPAR',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      const hx = p.x + f * 5;
      const hy = p.y + 2;
      // Scales crawl up the forearm from the hand.
      g.fillStyle(0xb3122e, 0.9);
      for (let i = 0; i < Math.round(1 + t01 * 4); i++) g.fillRect(hx - f * (i * 2 + 1) - 1, hy - 1 - (i % 2), 2, 2);
      // Talons grow out of his fingers, red-hot at the tips once full.
      const len = 2 + 7 * t01;
      for (const o of [-2, 0, 2]) {
        g.lineStyle(2, 0x000000).lineBetween(hx, hy + o, hx + f * len, hy + o + len * 0.3);
        g.lineStyle(1, 0x5f574f).lineBetween(hx, hy + o, hx + f * len * 0.8, hy + o + len * 0.25);
        if (level === 2) g.fillStyle(0xffa300).fillRect(hx + f * len - 1, hy + o + len * 0.3 - 0.5, 2, 1);
      }
      // Embers rising off the claw, and a heat glow that swells with the charge.
      g.fillStyle(0xff004d, 0.15 + 0.2 * t01).fillCircle(hx + f * 3, hy, 4 + 4 * t01);
      for (let i = 0; i < 5; i++) {
        const u = (now / 400 + i / 5) % 1;
        g.fillStyle(i % 2 ? 0xffa300 : 0xff004d, 1 - u).fillRect(hx + f * 3 + Math.sin(i * 2.3 + now / 120) * 4, hy - u * 16, 1, 1);
      }
    },
    fire({ p, world, scene }, level) {
      if (!world.targets(p.x, p.y).length) return false;
      const full = level === 2;
      const f = p.facing;
      const s = full ? 1.5 : 1;
      const R = 64 * s;
      p.lock(full ? 580 : 420);
      p.invuln(full ? 580 : 420);
      p.setVelocityX(0);
      const sx = p.x;
      const sy = p.y - 4;
      const deg = Phaser.Math.DegToRad;
      // The swings: [pivot shift ahead, from, to] in facing-relative angles. The backhand pivots further out, so its
      // gashes cross the first set instead of lying on top of it.
      // The rake ends level with the floor (A1); anything low in front of him is caught where the claw lands.
      const A1 = deg(8);
      const swings: [number, number, number][] = [[0, deg(-120), A1]];
      if (full) swings.push([f * 16, A1, deg(-100)]);
      const arm = dragonArm(scene, sx, sy)
        .setScale(f * 0.3 * s, 0.3 * s)
        .setRotation(f * swings[0][1]);
      scene.tweens.add({ targets: arm, scaleX: f * s, scaleY: s, duration: 120, ease: 'Back.Out' });
      const gash = scene.add.graphics().setDepth(12);
      const struck = new Set<Foe>();
      const done: [number, number, number][] = [];
      const drawGashes = (cur?: [number, number, number, number]) => {
        gash.clear();
        const all: [number, number, number][] = cur ? [...done, [cur[0], cur[1], cur[3]]] : done;
        for (const [dx, a0, a1] of all)
          for (const o of [-8, 0, 8]) {
            const r = R - 4 + o;
            crescent(gash, sx + dx, sy, r + 1.5, wa(f, a0), wa(f, a1), 5, 0x1d0f0a, 0.9);
            crescent(gash, sx + dx, sy, r, wa(f, a0), wa(f, a1), 3, 0xb3122e);
            crescent(gash, sx + dx, sy, r - 0.5, wa(f, a0), wa(f, a1), 1.2, 0xffa300);
          }
      };
      const swing = (i: number) => {
        const [dx, a0, a1] = swings[i];
        arm.setX(sx + dx);
        let prev = a0;
        const hitNow = new Set<Foe>();
        scene.tweens.addCounter({
          from: a0,
          to: a1,
          duration: 170,
          ease: 'Quad.In',
          onUpdate: (tw) => {
            const cur = tw.getValue() ?? a1;
            arm.setRotation(f * cur);
            drawGashes([dx, a0, a1, cur]);
            const [lo, hi] = [Math.min(prev, cur) - 0.15, Math.max(prev, cur) + 0.15];
            prev = cur;
            for (const t of world.targets(sx, sy)) {
              const b = bearing(f, sx + dx, sy, t);
              const ba = b.a > A1 && b.a < 1.6 ? A1 : b.a;
              if (hitNow.has(t) || b.d > R + 10 || ba < lo || ba > hi) continue;
              hitNow.add(t);
              struck.add(t);
              cutMark(scene, t.x, t.y, 0xff004d, 30, wa(f, cur + Math.PI / 2));
              sparks(scene, t.x, t.y, [0xff004d, 0xffa300], 5, 12);
              world.strike(t, i === 0 ? 2 : 1.6, 'basic', false, { burn: full ? 0.25 : 0.2 }, 160);
            }
          },
          onComplete: () => {
            done.push(swings[i]);
            drawGashes();
            scene.cameras.main.shake(140, 0.012);
            if (i + 1 < swings.length) later(scene, 50, () => swing(i + 1));
            else erupt();
          },
        });
      };
      // The wounds burn, then burst: everything the claw opened takes the fire inside it.
      const erupt = () => {
        scene.tweens.add({ targets: arm, alpha: 0, scaleY: 0.2 * s, duration: 180, onComplete: () => arm.destroy() });
        for (const [dx, a0, a1] of done)
          for (let k = 0; k <= 4; k++) {
            const a = wa(f, a0 + ((a1 - a0) * k) / 4);
            const x = sx + dx + Math.cos(a) * R;
            const y = Math.min(FLOOR_Y, sy + Math.sin(a) * R + 6);
            later(scene, k * 30, () => flameTongue(scene, x, y, 12 * s, 360, FIRE));
          }
        later(scene, full ? 220 : 260, () => {
          scene.tweens.add({ targets: gash, alpha: 0, duration: 200, onComplete: () => gash.destroy() });
          if (full) {
            scene.cameras.main.flash(150, 179, 18, 46);
            floatText(scene, p.x, p.y - 44, 'HANCUR!', '#ff004d');
          }
          scene.cameras.main.shake(full ? 260 : 120, full ? 0.02 : 0.01);
          for (const t of struck) {
            if (!t.active) continue;
            explosion(scene, t.x, t.y, full ? 16 : 10);
            world.strike(t, full ? 2.2 : 1, 'basic', false, { burn: full ? 0.4 : 0.2 }, full ? 220 : 100);
            if (full) launch(t, 220);
          }
        });
      };
      later(scene, 120, () => swing(0));
    },
  },

  // Merodach, the original of all swords (the prototype of Gram), taken from the treasury: the King rarely deigns to
  // hold a blade himself, so the charge is a gate rippling wider at his shoulder with a golden hilt rising out of it.
  // On release he draws it and swings it once, one-handed and bored, in a rising cut from the floor in front of him up
  // over his head; a golden crescent flies on from the edge. Full: the cut is longer and the crescent bigger, and behind
  // him a wall of gates opens from the floor to the sky and fires two volleys of treasures straight ahead, a sheet of
  // Noble Phantasms that nothing in front of him (on the ground or in the air) can stay out of.
  gilgamesh: {
    name: 'PEDANG MERODACH',
    desc: 'TEBASAN NAIK MERODACH + GELOMBANG EMAS; PENUH: DINDING GERBANG MENEMBAK DARI LANTAI-LANGIT',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const now = scene.time.now;
      // The gate at his shoulder, rippling wider with the charge; Merodach's hilt rises out of it.
      const gx = p.x - f * 7;
      const gy = p.y - 10;
      const r = 3 + 5 * t01;
      g.fillStyle(0xffec27, 0.25).fillEllipse(gx, gy, r * 2.4, r * 1.2);
      g.lineStyle(1, 0xffa300).strokeEllipse(gx, gy, r * 2.4, r * 1.2);
      g.fillStyle(0xfff1e8, 0.8).fillEllipse(gx, gy, r * 1.2, r * 0.6);
      const rip = (now / 300) % 1;
      g.lineStyle(1, 0xffec27, 1 - rip).strokeEllipse(gx, gy, r * 2.4 * (1 + rip), r * 1.2 * (1 + rip));
      const hl = 2 + 7 * t01;
      g.lineStyle(3, 0x5f3a00).lineBetween(gx, gy, gx, gy - hl);
      g.lineStyle(1, 0xd4a017).lineBetween(gx, gy, gx, gy - hl);
      g.fillStyle(0xff004d).fillRect(gx - 1, gy - hl - 1, 2, 2);
      // Full: the wall of gates behind him already shimmers into being.
      if (level === 2)
        for (let i = 0; i < 6; i++) {
          const y = FLOOR_Y - 8 - i * 16;
          g.lineStyle(1, 0xffec27, 0.3 + 0.2 * Math.sin(now / 60 + i)).strokeEllipse(p.x - f * 14, y, 4, 10);
        }
    },
    fire({ p, world, scene }, level) {
      if (!world.targets(p.x, p.y).length) return false;
      const full = level === 2;
      const f = p.facing;
      p.lock(full ? 520 : 360);
      p.invuln(full ? 420 : 300);
      p.setVelocityX(0);
      const hx = p.x + f * 3;
      const hy = p.y + 1;
      const len = full ? 40 : 30;
      const R = len + 12;
      const deg = Phaser.Math.DegToRad;
      const a0 = deg(15);
      const a1 = deg(-115);
      // 1. The gate opens at his shoulder and he draws Merodach out of it.
      p.gatePortal(p.x - f * 7, p.y - 10, wa(f, 0.6));
      const sword = merodach(scene, hx, hy, len)
        .setScale(f * 0.4, 1)
        .setRotation(f * a0);
      scene.tweens.add({ targets: sword, scaleX: f, duration: 90, ease: 'Quad.Out' });
      const trail = scene.add.container(hx, hy).setDepth(12).setScale(f, 1);
      const tg = scene.add.graphics();
      trail.add(tg);
      const hit = new Set<Foe>();
      let prev = a0;
      // 2. The rising cut: from low ahead of him, skimming the floor, up through the sky and over his head.
      scene.tweens.addCounter({
        from: a0,
        to: a1,
        delay: 100,
        duration: 160,
        ease: 'Quad.Out',
        onUpdate: (tw) => {
          const cur = tw.getValue() ?? a1;
          sword.setRotation(f * cur);
          tg.clear();
          crescent(tg, 0, 0, R + 2, a0, cur, 9, 0xffec27, 0.3);
          crescent(tg, 0, 0, R, a0, cur, 5, 0xd4a017, 0.9);
          crescent(tg, 0, 0, R - 1, a0, cur, 1.5, 0xfff1e8);
          const [lo, hi] = [Math.min(prev, cur) - 0.15, Math.max(prev, cur) + 0.15];
          prev = cur;
          for (const t of world.targets(hx, hy)) {
            const b = bearing(f, hx, hy, t);
            // Anything low in front of him is caught as the blade leaves the floor.
            const ba = b.a > a0 && b.a < 1.6 ? a0 : b.a;
            if (hit.has(t) || b.d > R + 8 || ba < lo || ba > hi) continue;
            hit.add(t);
            cutMark(scene, t.x, t.y, 0xffec27, 28);
            sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 5, 12);
            world.strike(t, full ? 2.2 : 1.8, 'basic', false, undefined, full ? 220 : 160);
          }
        },
        onComplete: () => {
          scene.cameras.main.shake(110, 0.01);
          scene.tweens.add({
            targets: [sword, trail],
            alpha: 0,
            delay: 60,
            duration: 200,
            onComplete: () => {
              sword.destroy();
              trail.destroy();
            },
          });
          // 3. A golden crescent flies on from the edge of the cut.
          const wave = world.shot({
            x: hx + f * 16,
            y: hy - 8,
            vx: f * 300,
            vy: 0,
            texture: 'slashMoon',
            tint: 0xffec27,
            mult: full ? 1.6 : 1.2,
            source: 'basic',
            pierce: true,
            knockback: full ? 200 : 120,
          }) as Phaser.GameObjects.Image;
          wave.setScale(full ? 2.2 : 1.5, full ? 2.8 : 2);
          whileAlive(scene, wave, 30, () => {
            const d = scene.add.rectangle(wave.x - f * 6, wave.y + Phaser.Math.Between(-10, 10), 2, 1, 0xfff1e8).setDepth(11);
            scene.tweens.add({ targets: d, x: d.x - f * 8, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          });
          later(scene, full ? 700 : 380, () => wave.active && wave.destroy());
        },
      });
      if (!full) return;
      // 4. Full: a wall of gates from the floor to the sky behind him, two volleys straight ahead (the second offset
      // half a row, so the sheet has no gaps).
      const gx = Phaser.Math.Clamp(p.x - f * 14, 4, W - 4);
      for (let v = 0; v < 2; v++)
        for (let i = 0; i < 9; i++) {
          const gy = FLOOR_Y - 7 - i * 14 - v * 7;
          later(scene, 260 + v * 140 + i * 18, () => {
            if (!p.active) return;
            p.gatePortal(gx, gy, f > 0 ? 0 : Math.PI);
            later(scene, 60, () => {
              if (!p.active) return;
              world.shot({
                x: gx,
                y: gy,
                vx: f * 340,
                vy: 0,
                texture: Phaser.Math.RND.pick(TREASURES),
                tint: 0xfff0a0,
                mult: 1.2,
                source: 'basic',
                pierce: true,
                knockback: 160,
              });
            });
          });
        }
    },
  },
};
