import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import {
  RADIANT,
  SOUL,
  glint,
  jag,
  kamuiSwirl,
  receiverRod,
  rinnegan,
  later,
  ring,
  rocks,
  soulGeyser,
  sparks,
  starPts,
} from '../skills.ts';
import { dist, lift, rel, wa } from './batch6.ts';
import type { ChargedAttack } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
type G = Phaser.GameObjects.Graphics;

/**
 * A blade of soul fire `len` px long drawn into `g` from its hilt at (x, y) along world angle `a`: a green glow, a
 * black body with green edges and a pale fuller, flames licking off both edges, a horned guard with a crimson gem.
 */
function soulBlade(g: G, x: number, y: number, a: number, len: number, now: number): void {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const P = (u: number, v: number) => new Phaser.Math.Vector2(x + c * u - s * v, y + s * u + c * v);
  const hw = Math.max(2.5, len * 0.06);
  g.lineStyle(hw * 3.4, SOUL[1], 0.16).lineBetween(P(2, 0).x, P(2, 0).y, P(len, 0).x, P(len, 0).y);
  g.fillStyle(0x000000).fillPoints([P(2, -hw - 1), P(len - hw * 2, -hw - 1), P(len + 2, 0), P(len - hw * 2, hw + 1), P(2, hw + 1)], true);
  g.fillStyle(0x0a0612).fillPoints([P(3, -hw), P(len - hw * 2, -hw), P(len, 0), P(len - hw * 2, hw), P(3, hw)], true);
  g.lineStyle(1, SOUL[1]).strokePoints([P(3, -hw), P(len - hw * 2, -hw), P(len, 0), P(len - hw * 2, hw), P(3, hw)]);
  g.lineStyle(1, SOUL[2], 0.85).lineBetween(P(5, 0).x, P(5, 0).y, P(len * 0.8, 0).x, P(len * 0.8, 0).y);
  // Flames licking off both edges, flickering.
  for (let i = 1; i < 8; i++) {
    const u = (i / 8) * (len - 4);
    for (const side of [-1, 1]) {
      const h = 2 + Math.abs(Math.sin(now / 70 + i * 1.7 + side)) * (2 + len * 0.03);
      const [b0, b1, tip] = [P(u - 1.5, side * hw), P(u + 1.5, side * hw), P(u - 2, side * (hw + h))];
      g.fillStyle(i % 2 ? SOUL[1] : SOUL[0], 0.85).fillTriangle(b0.x, b0.y, b1.x, b1.y, tip.x, tip.y);
    }
  }
  // The guard: horns sweeping back, a crimson gem.
  const [g0, g1, h0, h1] = [P(0, -6), P(0, 6), P(-3, -8), P(-3, 8)];
  g.lineStyle(2, 0x000000).lineBetween(g0.x, g0.y, g1.x, g1.y).lineBetween(g0.x, g0.y, h0.x, h0.y).lineBetween(g1.x, g1.y, h1.x, h1.y);
  g.lineStyle(1, 0x83769c).lineBetween(g0.x, g0.y, g1.x, g1.y);
  g.fillStyle(0xb3122e).fillCircle(x, y, 1.5);
  g.fillStyle(0xfff1e8).fillRect(P(len, 0).x - 0.5, P(len, 0).y - 0.5, 1, 1);
}

/** A Katon fireball of radius `r` at (x, y), flickering with `now`: a dark-red rim, orange body, yellow heart, white core. */
function fireball(g: G, x: number, y: number, r: number, now: number): void {
  for (let i = 0; i < 5; i++) {
    const a = now / 90 + i * 1.3;
    g.fillStyle(0xb3122e, 0.7).fillCircle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.6);
  }
  g.fillStyle(0xb3122e).fillCircle(x, y, r + 1);
  g.fillStyle(0xffa300).fillCircle(x, y, r);
  g.fillStyle(0xffec27).fillCircle(x - r * 0.15, y - r * 0.15, r * 0.6);
  g.fillStyle(0xfff1e8).fillCircle(x - r * 0.2, y - r * 0.2, Math.max(1, r * 0.25));
}

/** Charged attacks (TAHAN J) of: darkLord, lightLord, obito, pain. Contract and damage budget: see types.ts. */
export const BATCH_7: Partial<Record<ClassId, ChargedAttack>> = {
  // Titah Pancung (The Beheading Decree): the Dark Lord raises Nokturna and soul fire builds it into a giant blade over
  // his head, taller the longer he holds. On release he brings it down ahead of him like an executioner's axe: it
  // sweeps from straight up to the floor, cutting everything it passes through, flyers above him first, and splits
  // the floor where it lands in a seam of soul fire.
  // Full charge: a far longer blade, and the seam erupts: geysers of soul fire burst up along it one after another,
  // throwing what stands there into the air.
  darkLord: {
    name: 'TITAH PANCUNG',
    desc: 'BILAH JIWA RAKSASA DIHANTAMKAN DARI ATAS KE DEPAN; PENUH: LEBIH PANJANG, LANTAI MELETUS',
    // The blade of soul fire grows straight up out of his raised sword, embers drawn up into it.
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const [bx, by] = [p.x - p.facing * 2, p.y - 8];
      const len = 10 + t01 * 46 + (level === 2 ? Math.sin(now / 40) : 0);
      soulBlade(g, bx, by, -Math.PI / 2, len, now);
      for (let i = 0; i < 6; i++) {
        const k = (now / 450 + i / 6) % 1;
        const [ex, ey] = [bx + Math.sin(i * 2.1) * (14 - k * 12), by + 6 - k * (len + 4)];
        g.fillStyle(i % 2 ? SOUL[1] : SOUL[2], 1 - k * 0.5).fillRect(ex, ey, 1, 1);
      }
      if (level === 2) g.lineStyle(1, SOUL[2], 0.5 + Math.sin(now / 40) * 0.3).strokeCircle(bx, by, 6);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const len = full ? 100 : 66;
      const [ox, oy] = [p.x, p.y - 6];
      // Everything inside the quarter it sweeps: from straight above him down to the floor ahead.
      const end = 0.14;
      const inArc = (t: Foe) => {
        const a = rel(ox, oy, f, t.x, t.y);
        return a >= -Math.PI / 2 - 0.15 && a <= 0.6 && dist(ox, oy, t) <= len + 8;
      };
      const foes = world.targets(ox, oy).filter(inArc);
      if (!foes.length) return false;
      p.setVelocityX(0);
      p.lock(full ? 380 : 280);
      p.invuln(full ? 380 : 280);
      const cam = scene.cameras.main;
      const g = scene.add.graphics().setDepth(13);
      const struck = new Set<Foe>();
      const cut = (t: Foe) => {
        if (struck.has(t) || !t.active) return;
        struck.add(t);
        world.strike(t, full ? 3.4 : 3, 'basic', false, { slow: 600 }, full ? 200 : 140);
        cutMark(scene, t.x, t.y, SOUL[1], 22, wa(f, rel(ox, oy, f, t.x, t.y)) + Math.PI / 2);
        sparks(scene, t.x, t.y, [SOUL[1], SOUL[2], 0x0a0612], 7, 14);
      };
      let prev = -Math.PI / 2;
      scene.tweens.addCounter({
        from: -Math.PI / 2,
        to: end,
        duration: full ? 200 : 170,
        ease: 'Quad.In',
        onUpdate: (tw) => {
          const a = tw.getValue() ?? end;
          const now = scene.time.now;
          g.clear();
          // The smear of its passing, then the blade itself.
          const tip = (b: number) => [ox + Math.cos(wa(f, b)) * len, oy + Math.sin(wa(f, b)) * len] as const;
          const tail = Math.max(-Math.PI / 2, prev - 0.35);
          g.fillStyle(SOUL[1], 0.18).fillTriangle(ox, oy, ...tip(tail), ...tip(a));
          g.fillStyle(SOUL[2], 0.25).fillTriangle(ox, oy, ...tip((tail + a) / 2), ...tip(a));
          soulBlade(g, ox, oy, wa(f, a), len, now);
          for (const t of foes) if (rel(ox, oy, f, t.x, t.y) <= a + 0.05) cut(t);
          prev = a;
        },
        onComplete: () => {
          // Whatever was still under it at the end (close to the floor) is cut as it lands.
          foes.forEach(cut);
          cam.shake(full ? 220 : 140, full ? 0.016 : 0.01);
          const x1 = ox + f * len * Math.cos(end);
          rocks(scene, x1, FLOOR_Y, full ? 8 : 5);
          ring(scene, x1, FLOOR_Y - 2, SOUL[1], 3, full ? 30 : 20, 280, 2);
          // The seam of soul fire it splits in the floor.
          const seam = scene.add.graphics().setDepth(12);
          const pts = jag(ox + f * 6, FLOOR_Y, x1, FLOOR_Y, 2).map(([x, y]) => new Phaser.Math.Vector2(x, y));
          seam.lineStyle(4, SOUL[1], 0.3).strokePoints(pts);
          seam.lineStyle(1, SOUL[2]).strokePoints(pts);
          scene.tweens.add({
            targets: [g, seam],
            alpha: 0,
            delay: 120,
            duration: full ? 500 : 300,
            onComplete: () => (g.destroy(), seam.destroy()),
          });
          if (!full) return;
          // Full: the seam erupts, geyser after geyser, out to the tip.
          const blown = new Set<Foe>();
          const n = Math.floor(len / 18);
          for (let i = 1; i <= n; i++)
            later(scene, i * 45, () => {
              const gx = ox + f * i * 18;
              soulGeyser(scene, gx, FLOOR_Y, 26);
              for (const t of world.targets(gx, FLOOR_Y)) {
                if (blown.has(t) || !t.active || Math.abs(t.x - gx) > 11 || t.y < FLOOR_Y - 60) continue;
                blown.add(t);
                world.strike(t, 2.4, 'basic', false, undefined, 60);
                lift(t, 230);
              }
              if (i === n) cam.shake(120, 0.008);
            });
        },
      });
    },
  },

  // Bintang Memantul (Rebounding Star): the Light Lord swings the morning star round and round over his head as it
  // charges, its head burning brighter. On release the head breaks loose as a star of light and flies at the nearest
  // enemy ahead (in the air too), and then it rebounds: off walls, floor, ceiling and every enemy it strikes, a gold
  // trail behind it, until its bounces are spent and it bursts. An enemy can be struck by it twice.
  // Full charge: a bigger star with eight bounces that bends toward the nearest enemy after each one, three strikes each.
  lightLord: {
    name: 'BINTANG MEMANTUL',
    desc: 'KEPALA GADA JADI BINTANG YANG MEMANTUL DINDING & MUSUH; PENUH: LEBIH BESAR, 8 PANTULAN',
    // The star whirls in a circle over his head, faster and brighter as the charge grows.
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const a = now / (level === 2 ? 60 : 110);
      const [cx, cy] = [p.x, p.y - 14];
      const [sx, sy] = [cx + Math.cos(a) * 10, cy + Math.sin(a) * 4];
      g.lineStyle(1, RADIANT.deep).lineBetween(p.x, p.y - 4, sx, sy);
      g.lineStyle(1, RADIANT.gold, 0.35).strokeEllipse(cx, cy, 20, 8);
      const r = 3 + t01 * 3;
      g.fillStyle(RADIANT.ivory, 0.3 + 0.3 * t01).fillCircle(sx, sy, r + 3);
      g.fillStyle(RADIANT.gold).fillPoints(
        starPts(r, a).map((v) => new Phaser.Math.Vector2(v.x + sx, v.y + sy)),
        true,
      );
      g.fillStyle(RADIANT.white).fillCircle(sx, sy, r * 0.35);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x + f * 8, p.y - 8];
      const ahead = world.targets(ox, oy).filter((t) => (t.x - ox) * f > -4 && dist(ox, oy, t) < 220);
      if (!ahead.length) return false;
      p.setVelocityX(0);
      p.lock(220);
      p.invuln(220);
      const cam = scene.cameras.main;
      const R = full ? 7 : 5;
      const speed = full ? 340 : 300;
      const max = full ? 8 : 4;
      const cap = full ? 3 : 2;
      let a = Phaser.Math.Angle.Between(ox, oy, ahead[0].x, ahead[0].y);
      let [x, y, vx, vy] = [ox, oy, Math.cos(a) * speed, Math.sin(a) * speed];
      let bounces = 0;
      const struck = new Map<Foe, number>();
      let lastHit: Foe | undefined;
      const star = scene.add.graphics().setDepth(14);
      const trail = scene.add.graphics().setDepth(13);
      let prev = { x, y };
      glint(scene, ox, oy);
      const bounce = () => {
        bounces++;
        cam.shake(40, 0.004);
        ring(scene, x, y, RADIANT.gold, 2, 12, 200, 1);
        if (!full) return;
        // Full: it bends toward the nearest enemy it may still strike.
        const next = world.targets(x, y).find((t) => t !== lastHit && (struck.get(t) ?? 0) < cap);
        if (!next) return;
        a = Phaser.Math.Angle.Between(x, y, next.x, next.y);
        [vx, vy] = [Math.cos(a) * speed, Math.sin(a) * speed];
      };
      const loop = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          x += vx * 0.016;
          y += vy * 0.016;
          if (x < R || x > W - R) {
            vx = -vx;
            x = Phaser.Math.Clamp(x, R, W - R);
            bounce();
          }
          if (y < R + 4 || y > FLOOR_Y - R) {
            vy = -vy;
            y = Phaser.Math.Clamp(y, R + 4, FLOOR_Y - R);
            bounce();
          }
          for (const t of world.targets(x, y)) {
            if (!t.active || t === lastHit || (struck.get(t) ?? 0) >= cap || dist(x, y, t) > R + t.displayWidth / 2) continue;
            struck.set(t, (struck.get(t) ?? 0) + 1);
            lastHit = t;
            world.strike(t, full ? 2 : 1.5, 'basic', false, undefined, 140);
            sparks(scene, t.x, t.y, [RADIANT.gold, RADIANT.white], 8, 14);
            // Rebound off the body, away from its center.
            const b = Phaser.Math.Angle.Between(t.x, t.y, x, y);
            [vx, vy] = [Math.cos(b) * speed, Math.sin(b) * speed];
            bounce();
            break;
          }
          trail.lineStyle(R, RADIANT.ivory, 0.25).lineBetween(prev.x, prev.y, x, y);
          trail.lineStyle(1, RADIANT.gold).lineBetween(prev.x, prev.y, x, y);
          prev = { x, y };
          star.clear();
          star.fillStyle(RADIANT.ivory, 0.35).fillCircle(x, y, R + 3);
          star.fillStyle(RADIANT.gold).fillPoints(
            starPts(R + 1, scene.time.now / 60).map((v) => new Phaser.Math.Vector2(v.x + x, v.y + y)),
            true,
          );
          star.fillStyle(RADIANT.white).fillCircle(x, y, R * 0.4);
          if (bounces < max) return;
          loop.remove();
          star.destroy();
          ring(scene, x, y, RADIANT.white, 3, full ? 26 : 18, 260, 2);
          sparks(scene, x, y, [RADIANT.gold, RADIANT.white, RADIANT.ivory], 12, 18);
          scene.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
        },
      });
    },
  },
  // Katon: Gokakyu no Jutsu, through Kamui: Obito draws breath and a fireball swells at the mouth of his mask while a
  // warp turns in front of him. On release he blows it into the warp, and it comes out of another warp that opens
  // above and behind the nearest enemy ahead, dropping onto it where it is not looking. Full charge: three warps over
  // up to three enemies (the same one more than once if fewer), the fireballs burning and throwing small fry up.
  obito: {
    name: 'KATON: GOKAKYU',
    desc: 'BOLA API DITIUP KE PUSARAN KAMUI, KELUAR DARI PUSARAN DI ATAS MUSUH; PENUH: 3 PUSARAN',
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const f = p.facing;
      const r = 1.5 + t01 * 3.5;
      fireball(g, p.x + f * (5 + r), p.y - 3, r, now);
      kamuiSwirl(g, p.x + f * 20, p.y - 4, 3 + t01 * 5 + (level === 2 ? 1 : 0), now / 90, 0.5 + 0.5 * t01);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const foes = world
        .targets(p.x, p.y)
        .filter((t) => (t.x - p.x) * f > -6 && dist(p.x, p.y, t) < 240)
        .slice(0, full ? 3 : 1);
      if (!foes.length) return false;
      p.lock(260);
      p.invuln(260);
      p.setVelocityX(0);
      const [ix, iy] = [p.x + f * 20, p.y - 4];
      const R = full ? 5 : 4;
      // Blown into the warp in front of him.
      const g = scene.add.graphics().setDepth(13);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 300,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          g.clear();
          kamuiSwirl(g, ix, iy, 9 * Math.sin(Math.min(1, k * 1.2) * Math.PI * 0.5 + (k > 0.5 ? (k - 0.5) * 3 : 0)), k * 14);
          if (k < 0.4) fireball(g, p.x + f * 6 + (ix - p.x - f * 6) * (k / 0.4), iy, R * (1 - k), scene.time.now);
        },
        onComplete: () => g.destroy(),
      });
      for (let i = 0; i < (full ? 3 : 1); i++)
        later(scene, 170 + i * 140, () => {
          const t = foes[i % foes.length];
          if (!t.active) return;
          // The exit warp, above and behind it.
          const [wx, wy] = [Phaser.Math.Clamp(t.x - f * 22, 6, W - 6), Math.max(10, t.y - 36)];
          const [tx, ty] = [t.x, t.y];
          const w = scene.add.graphics().setDepth(13);
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 260,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              w.clear();
              kamuiSwirl(w, wx, wy, 9 * Math.sin(k * Math.PI), -k * 14);
              if (k > 0.25 && k < 0.7) {
                const q = (k - 0.25) / 0.45;
                fireball(w, wx + (tx - wx) * q, wy + (ty - wy) * q, R, scene.time.now);
              }
            },
            onComplete: () => w.destroy(),
          });
          later(scene, 185, () => {
            ring(scene, tx, ty, 0xffa300, 3, full ? 20 : 16, 260, 2);
            sparks(scene, tx, ty, [0xffec27, 0xffa300, 0xb3122e], 12, 16);
            scene.cameras.main.shake(80, 0.006);
            if (t.active) world.strike(t, full ? 1.6 : 2.8, 'basic', false, full ? { burn: 0.15 } : undefined, 140);
            world.area(tx, ty, full ? 18 : 14, 0.5, 80, 'basic');
            if (full) lift(t, 160);
          });
        });
    },
  },
  // Paku Cakra (the receiver nail): Pain draws a long chakra receiver from his sleeve, longer the longer he holds. On
  // release he hurls it at the nearest enemy ahead: it runs through everything along its line and carries what it
  // skewers with it until it strikes a wall (or has flown 220 px), where it nails them all in place. A boss or an elite
  // stops it dead: it lodges there. Full charge: a second rod at the next enemy, nailed longer and harder.
  pain: {
    name: 'PAKU CAKRA',
    desc: 'BATANG CAKRA MENUSUK SEGARIS, MEMBAWA MUSUH & MEMAKUNYA KE DINDING; PENUH: 2 BATANG',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const len = 6 + t01 * 22;
      receiverRod(g, p.x - f * 4, p.y - 3, p.x + f * (len - 4), p.y - 5);
      if (level === 2) rinnegan(g, p.x + f * 2, p.y - 12, 2 + Math.sin(scene.time.now / 60) * 0.5);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const ahead = world.targets(p.x, p.y).filter((t) => (t.x - p.x) * f > 0 && Math.abs(rel(p.x, p.y - 4, f, t.x, t.y)) < 0.6);
      if (!ahead.length) return false;
      p.lock(240);
      p.invuln(240);
      p.setVelocityX(0);
      const pin = (c: Foe, x: number, y: number) => {
        (c as Foe & { stunUntil: number }).stunUntil = scene.time.now + 100;
        (c.body as Phaser.Physics.Arcade.Body).reset(x, y);
      };
      const throwRod = (t: Foe, delay: number) =>
        later(scene, delay, () => {
          // Level with a target on its own height (so it flies on to the wall, not into the floor), else aimed at it.
          const flat = !t.active || Math.abs(t.y - (p.y - 4)) < 14;
          const [ox, oy] = [p.x + f * 6, flat && t.active ? t.y : p.y - 4];
          const a = flat ? (f > 0 ? 0 : Math.PI) : Math.atan2(t.y - oy, t.x - ox);
          const [ux, uy] = [Math.cos(a), Math.sin(a)];
          const carried: Foe[] = [];
          const g = scene.add.graphics().setDepth(12);
          let [tx, ty] = [ox, oy];
          let stuck = false;
          // Nailed: whatever it carries is held at its point for a while, the rod buried in the wall.
          const nail = () => {
            stuck = true;
            const until = scene.time.now + (full ? 1500 : 900);
            scene.cameras.main.shake(120, 0.012);
            sparks(scene, tx, ty, [0xfff1e8, 0x5f574f, 0xb39ddb], 10, 12);
            ring(scene, tx, ty, 0xb39ddb, 2, 14, 220, 2);
            for (const c of carried) if (c.active) world.strike(c, full ? 2.2 : 1.4, 'basic', full, undefined, 0);
            const hold = () => {
              g.clear();
              if (scene.time.now >= until) {
                scene.events.off('update', hold);
                scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
                return;
              }
              receiverRod(g, tx - ux * 30, ty - uy * 30, tx, ty);
              carried.forEach((c, i) => c.active && pin(c, tx - ux * (6 + i * 8), ty - uy * (6 + i * 8)));
            };
            scene.events.on('update', hold);
          };
          scene.tweens.addCounter({
            from: 0,
            to: 220,
            duration: 380,
            onUpdate: (tw) => {
              if (stuck) return;
              const d = tw.getValue() ?? 0;
              [tx, ty] = [ox + ux * d, oy + uy * d];
              g.clear();
              receiverRod(g, tx - ux * 30, ty - uy * 30, tx, ty);
              for (const o of world.targets(tx, ty)) {
                if (carried.includes(o) || dist(tx, ty, o) > 9) continue;
                world.strike(o, full ? 1.2 : 1.6, 'basic', false, undefined, 0);
                if (!o.active) continue;
                if ('tier' in o || o.getData('elite')) return nail();
                carried.push(o);
              }
              carried.forEach((c, i) => c.active && pin(c, tx - ux * (6 + i * 8), ty - uy * (6 + i * 8)));
              if (tx < 6 || tx > W - 6 || ty < 8 || ty > FLOOR_Y) nail();
            },
            onComplete: () => !stuck && nail(),
          });
        });
      throwRod(ahead[0], 0);
      if (full) throwRod(ahead[1] ?? ahead[0], 140);
    },
  },
};
