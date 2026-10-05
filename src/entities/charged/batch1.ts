import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import {
  azraelBlade,
  bestLine,
  bez,
  crimsonSpear,
  eveningBell,
  explosion,
  feathers,
  flameTongue,
  jag,
  later,
  onLine,
  ring,
  rocks,
  sparks,
  thorns,
} from '../skills.ts';
import type { ChargedAttack, ChargedCtx } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;

/** Bosses and elites are too heavy to throw around. */
const heavy = (t: Foe) => 'tier' in t || !!t.getData('elite');
/** Throw small fry into the air. */
const launch = (t: Foe, v: number) => t.active && !heavy(t) && (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-v);
/** The floor under the hero (the platform he stands on), or the arena floor while airborne. */
const groundY = (c: ChargedCtx) => (c.p.grounded ? c.p.y + 8 : FLOOR_Y);
/** Distance from (px, py) to the segment (x0, y0)-(x1, y1). */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const [dx, dy] = [x1 - x0, y1 - y0];
  const k = Phaser.Math.Clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k));
}

/** EMIYA's black bow, drawn at (x, y) facing `f`: `pull` 0..1 is how far the string (and Hrunting on it) is drawn. */
function drawBow(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, pull: number, arrow: boolean): void {
  const cx = x - f * 6;
  const base = f > 0 ? 0 : Math.PI;
  const [a0, a1] = [base - 1.05, base + 1.05];
  const tip = (a: number) => [cx + Math.cos(a) * 9, y + Math.sin(a) * 9] as const;
  const [t0, t1] = [tip(a0), tip(a1)];
  const nock = x - f * (1 + pull * 7);
  // The limbs: a black outline, a dark steel body, and a red glint on the grip.
  g.lineStyle(3, 0x000000).beginPath().arc(cx, y, 9, a0, a1).strokePath();
  g.lineStyle(1, 0x5f574f)
    .beginPath()
    .arc(cx, y, 9, a0 + 0.1, a1 - 0.1)
    .strokePath();
  g.fillStyle(0xff004d).fillRect(x + f * 3 - 0.5, y - 1, 1, 2);
  g.lineStyle(1, 0xc2c3c7, 0.9).lineBetween(t0[0], t0[1], nock, y).lineBetween(nock, y, t1[0], t1[1]);
  if (!arrow) return;
  // Hrunting nocked: a black sword-arrow with a red edge, its head past the bow.
  const head = nock + f * 18;
  g.lineStyle(2, 0x000000).lineBetween(nock, y, head - f * 4, y);
  g.lineStyle(1, 0x7e2553).lineBetween(nock + f * 3, y, head - f * 4, y);
  g.fillStyle(0x000000).fillTriangle(head - f * 5, y - 2.5, head - f * 5, y + 2.5, head + f, y);
  g.fillStyle(0xff004d).fillTriangle(head - f * 4, y - 1, head - f * 4, y + 1, head - f, y);
}

/** Hrunting in flight, pointing right: a black blade-arrow with a red edge inside a crimson haze. */
function houndTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('hrunting')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xff004d, 0.35).fillEllipse(9, 2.5, 18, 5);
  g.fillStyle(0x000000).fillRect(0, 1, 3, 3).fillRect(2, 2, 10, 1).fillTriangle(10, 0, 17, 2.5, 10, 5);
  g.fillStyle(0x7e2553).fillRect(4, 2, 6, 1);
  g.fillStyle(0xff004d).fillTriangle(11, 1, 15, 2.5, 11, 4);
  g.generateTexture('hrunting', 18, 5);
  g.destroy();
}

/** Charged attacks (TAHAN J) of: ksatria, pembunuh, dragoon, berserker, pemburu. Contract and damage budget: see types.ts. */
export const BATCH_1: Partial<Record<ClassId, ChargedAttack>> = {
  // Caliburn, the Sword of Selection (the golden sword Artoria drew from the stone): golden light rises out of the
  // ground around her while she holds. On release she brings the sword down from overhead and plants it in the earth;
  // the selection answers: a row of golden swords, each a copy of the one in the stone, bursts point-up out of the
  // floor and marches away from her. Full: more, taller swords (they reach flyers) that throw the small fry up.
  ksatria: {
    name: 'CALIBURN',
    desc: 'TEBAS & TANCAP PEDANG: 3 PEDANG EMAS MUNCUL BERBARIS; PENUH: 5 PEDANG TINGGI, MELONTARKAN',
    charging({ p, scene }, t01, level, g) {
      const time = scene.time.now;
      const gy = p.y + 8;
      // The stone's circle: a golden ellipse spreading at her feet.
      const rx = 6 + 10 * t01;
      g.fillStyle(0xffec27, 0.1 + 0.15 * t01).fillEllipse(p.x, gy, rx * 2, 4 + 2 * t01);
      g.lineStyle(1, 0xffec27, 0.5 + 0.4 * t01).strokeEllipse(p.x, gy, rx * 2, 4 + 2 * t01);
      // Threads of light rising out of the ground around her, taller as the charge grows.
      for (let i = 0; i < 6; i++) {
        const x = p.x + Math.cos(time / 260 + i * 1.05) * rx;
        const h = (5 + 12 * t01) * (0.55 + 0.45 * Math.sin(time / 70 + i * 2));
        g.lineStyle(1, 0xffec27, 0.7).lineBetween(x, gy, x, gy - h);
        g.fillStyle(0xfff1e8).fillRect(x, gy - h - 1, 1, 1);
      }
      if (level < 2) return;
      // Full: a four-point star blazes at the raised blade.
      const s = 3 + Math.sin(time / 40) * 1.5;
      const [sx, sy] = [p.x + p.facing * 5, p.y - 10];
      g.fillStyle(0xfff1e8)
        .fillRect(sx - s, sy, s * 2 + 1, 1)
        .fillRect(sx, sy - s, 1, s * 2 + 1);
    },
    fire(c, level) {
      const { p, world, scene } = c;
      const full = level === 2;
      const f = p.facing;
      const gy = groundY(c);
      const n = full ? 5 : 3;
      const x1 = p.x + f * 16;
      const blades = Array.from({ length: n }, (_, i) => ({ x: x1 + f * (22 + i * 24), h: full ? 30 + i * 6 : 22 + i * 2 }));
      const far = blades[n - 1].x + f * 12;
      const [lo, hi] = [Math.min(p.x - f * 8, far), Math.max(p.x - f * 8, far)];
      const top = gy - (full ? 64 : 40);
      if (!world.targets(p.x, p.y).some((t) => t.x >= lo && t.x <= hi && t.y >= top && t.y <= gy + 8)) return false;
      p.lock(full ? 380 : 300);
      p.invuln(full ? 420 : 300);
      p.setVelocityX(0);

      // 1. The cleave: from over her head down into the ground in front, a golden arc (glow, body, white core).
      const arc = scene.add.graphics();
      const cleave = scene.add
        .container(p.x, p.y - 2, [arc])
        .setScale(f, 1)
        .setDepth(13);
      const r = full ? 26 : 20;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 90,
        onUpdate: (tw) => {
          const end = -1.9 + 2.5 * (tw.getValue() ?? 0);
          arc.clear();
          for (const [w, col, al] of [
            [7, 0xffec27, 0.3],
            [3, 0xffec27, 1],
            [1, 0xfff1e8, 1],
          ] as const)
            arc.lineStyle(w, col, al).beginPath().arc(0, 0, r, -1.9, end).strokePath();
        },
        onComplete: () => scene.tweens.add({ targets: cleave, alpha: 0, scaleY: 0.6, duration: 200, onComplete: () => cleave.destroy() }),
      });
      later(scene, 80, () => {
        // The blade bites the earth: a flare along the floor, fractures, chips of stone.
        const flare = scene.add.ellipse(x1, gy, 10, 4, 0xffec27, 0.7).setDepth(12);
        scene.tweens.add({ targets: flare, scaleX: full ? 5 : 3.5, alpha: 0, duration: 300, onComplete: () => flare.destroy() });
        const crack = scene.add.graphics().setDepth(12);
        for (const dx of [-14, 10, 18])
          crack.lineStyle(1, 0x000000).strokePoints(jag(x1, gy, x1 + f * dx, gy + 3, 2).map(([x, y]) => new Phaser.Math.Vector2(x, y)));
        scene.tweens.add({ targets: crack, alpha: 0, delay: 300, duration: 300, onComplete: () => crack.destroy() });
        sparks(scene, x1, gy - 2, [0xffec27, 0xfff1e8], 10, 18);
        rocks(scene, x1, gy - 1, 5);
        scene.cameras.main.shake(110, full ? 0.012 : 0.008);
        for (const t of world.targets(p.x, p.y)) {
          const dx = (t.x - p.x) * f;
          if (!t.active || dx < -6 || dx > (full ? 44 : 34) || t.y < p.y - 40 || t.y > p.y + 12) continue;
          world.strike(t, full ? 2.5 : 1.5, 'basic', false, undefined, full ? 260 : 200);
          cutMark(scene, t.x, t.y, 0xffec27, 22, f * 1.2);
        }
      });

      // 2. The selection: golden swords burst point-up out of the floor one after another, marching away from her.
      const struck = new Set<Foe>();
      blades.forEach(({ x, h }, i) =>
        later(scene, 140 + i * (full ? 60 : 70), () => {
          if (x < 4 || x > W - 4) return;
          const g = scene.add.graphics();
          // Glow, black outline, gold body, white edge; the crossguard at the floor like the hilt in the stone.
          g.fillStyle(0xffec27, 0.25).fillRect(-5, -h - 3, 10, h + 3);
          g.fillStyle(0x000000)
            .fillTriangle(-3, -h + 5, 3, -h + 5, 0, -h - 1)
            .fillRect(-3, -h + 5, 6, h - 5)
            .fillRect(-6, -3, 12, 3);
          g.fillStyle(0xffec27)
            .fillTriangle(-2, -h + 5, 2, -h + 5, 0, -h + 1)
            .fillRect(-2, -h + 5, 4, h - 7)
            .fillRect(-5, -2, 10, 1);
          g.fillStyle(0xfff1e8).fillRect(-2, -h + 5, 1, h - 8);
          g.fillStyle(0x29adff).fillRect(0, -h + 8, 1, h - 12);
          const sword = scene.add.container(x, gy, [g]).setScale(1, 0).setDepth(13);
          scene.tweens.add({ targets: sword, scaleY: 1, duration: 80, ease: 'Back.Out' });
          scene.tweens.add({ targets: sword, scaleX: 0, alpha: 0, delay: 260, duration: 200, onComplete: () => sword.destroy() });
          const base = scene.add.ellipse(x, gy, 14, 4, 0xfff1e8, 0.8).setDepth(12);
          scene.tweens.add({ targets: base, scaleX: 2.2, alpha: 0, duration: 260, onComplete: () => base.destroy() });
          sparks(scene, x, gy - h / 2, [0xffec27, 0xfff1e8], 6, h * 0.6);
          rocks(scene, x, gy - 1, 3);
          const last = full && i === n - 1;
          // The climax (full only): the last, tallest sword blazes.
          if (last) scene.cameras.main.flash(120, 255, 236, 39);
          scene.cameras.main.shake(last ? 160 : 60, last ? 0.014 : 0.005);
          for (const t of world.targets(x, gy)) {
            if (!t.active || struck.has(t) || Math.abs(t.x - x) > 12 || t.y < gy - h - 8 || t.y > gy + 6) continue;
            struck.add(t);
            world.strike(t, full ? 2.5 : 1.5, 'basic', false, undefined, full ? 200 : 140);
            cutMark(scene, t.x, t.y, 0xffec27, 20, -Math.PI / 2 + Phaser.Math.FloatBetween(-0.2, 0.2));
            if (full) launch(t, 220);
          }
        }),
      );
    },
  },

  // Bandul Maut (the pendulum of death): the evening bell's clapper is Azrael itself. Over the enemy ahead, the bell
  // appears in the sky on its chain with the great sword hanging from it point-down, raised behind; the bell tolls and
  // the sword swings through like a pendulum, ground and air alike, setting what it cuts alight with azure fire.
  // Full: a longer pendulum swinging from higher, and it swings back for a second pass that throws them up.
  // (The suggested "vanish and backstab each marked enemy" is already his dash KABUT AZRAEL and his ult AZRAEL.)
  pembunuh: {
    name: 'BANDUL MAUT',
    desc: 'AZRAEL BERAYUN DARI LONCENG DI LANGIT, MEMBAKAR; PENUH: LEBIH PANJANG, BERAYUN BALIK',
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const foes = world.targets(p.x, p.y).filter((t) => Math.abs(t.x - p.x) < (full ? 150 : 110) && Math.abs(t.y - p.y) < 90);
      // Aimed now: the nearest enemy ahead, else the nearest one behind (he turns to it).
      const foe = foes.find((t) => Math.sign(t.x - p.x) === p.facing) ?? foes[0];
      if (!foe) return false;
      const f = Math.sign(foe.x - p.x) || p.facing;
      p.facing = f;
      p.lock(260);
      p.setVelocityX(0);
      const px = p.x + f * Phaser.Math.Clamp(Math.abs(foe.x - p.x), 24, full ? 72 : 50);
      const py = Math.max(full ? 12 : 22, p.y - (full ? 84 : 64));
      const L = p.y + 8 - py;
      const A = full ? 1.25 : 1.1;
      // Pendulum angle th from straight down (positive = toward where he faces) as the blade container's rotation.
      const rot = (th: number) => Math.PI - f * th;
      const tipOf = (th: number) => [px + Math.sin(th) * f * L, py + Math.cos(th) * L] as const;

      // The chain from the dark above, the bell on it, the blade hanging raised behind.
      const chain = scene.add.graphics().setDepth(13);
      for (let y = Math.max(0, py - 70); y < py - 20; y += 4) {
        chain.fillStyle(0x000000).fillRect(px - 1.5, y, 3, 3);
        chain.fillStyle(0x83769c).fillRect(px - 0.5, y, 1, 2);
      }
      const bell = eveningBell(scene, px, py - 20, 0.8).setAlpha(0);
      const blade = azraelBlade(scene, px, py, L - 4)
        .setRotation(rot(-A))
        .setAlpha(0);
      chain.setAlpha(0);
      scene.tweens.add({ targets: [bell, blade, chain], alpha: 1, duration: 140 });
      ring(scene, px, py, 0x29adff, 20, 4, 200);
      feathers(scene, px, py, 5, 20, 30);

      const swing = (from: number, to: number, second: boolean) => {
        const trail = scene.add.graphics().setDepth(12);
        // The toll: the bell rocks and a ring of sound rolls out of its mouth.
        scene.tweens.add({ targets: bell, angle: (to > from ? -14 : 14) * f, duration: 120, yoyo: true, ease: 'Sine.InOut' });
        ring(scene, px, py - 6, 0x29adff, 6, second ? 46 : 32, 360, 2);
        ring(scene, px, py - 6, 0xc2f0ff, 4, second ? 30 : 22, 280);
        if (second) scene.cameras.main.flash(110, 41, 173, 255);
        const struck = new Set<Foe>();
        scene.tweens.addCounter({
          from,
          to,
          duration: 280,
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            const th = tw.getValue() ?? 0;
            blade.setRotation(rot(th));
            const [tx, ty] = tipOf(th);
            // The swept arc: a pale wake of blue fire and a bright rim where the point has passed.
            const [s, e] = [Math.PI / 2 - f * from, Math.PI / 2 - f * th];
            const anti = (to > from ? f : -f) > 0;
            trail.clear();
            trail.fillStyle(0x29adff, 0.14).slice(px, py, L, s, e, anti).fillPath();
            trail
              .lineStyle(3, 0x2a4bd7, 0.7)
              .beginPath()
              .arc(px, py, L - 2, s, e, anti)
              .strokePath();
            trail
              .lineStyle(1, 0xc2f0ff)
              .beginPath()
              .arc(px, py, L - 2, s, e, anti)
              .strokePath();
            for (const t of world.targets(tx, ty)) {
              if (!t.active || struck.has(t) || segDist(t.x, t.y, px, py, tx, ty) > (full ? 11 : 9)) continue;
              struck.add(t);
              world.strike(t, 2.8, 'basic', false, { burn: 0.15 }, second ? 280 : 200);
              cutMark(scene, t.x, t.y, 0x29adff, 26, rot(th));
              flameTongue(scene, t.x, t.y + 6, 14);
              sparks(scene, t.x, t.y, [0x29adff, 0xc2f0ff], 6, 14);
              scene.cameras.main.shake(70, 0.007);
              if (second) launch(t, 220);
            }
          },
          onComplete: () => scene.tweens.add({ targets: trail, alpha: 0, duration: 160, onComplete: () => trail.destroy() }),
        });
      };
      later(scene, 150, () => swing(-A, A, false));
      const end = full ? 800 : 450;
      if (full) later(scene, 500, () => swing(A, -A, true));
      // The bell fades into the dark, shedding the omen's feathers.
      later(scene, end, () => {
        feathers(scene, px, py + L / 2, 6, 24, 30);
        scene.tweens.add({
          targets: [bell, blade, chain],
          alpha: 0,
          duration: 220,
          onComplete: () => [bell, blade, chain].forEach((o) => o.destroy()),
        });
      });
    },
  },

  // Seribu Tusukan: Lancer's flurry from his duel with Archer, too fast for the eye. Gae Bolg stabs out again and
  // again, each thrust aimed at an enemy within reach (up into the air too), every one planting the curse's barb.
  // Full: a longer, faster flurry, then he drives the spear home in one long thrust down the most crowded line that
  // pierces everything on it and throws the small fry into the air.
  // (The suggested wind-dragon drill is not his: a dragoon's move. Cu Chulainn's own flurry is used instead.)
  dragoon: {
    name: 'SERIBU TUSUKAN',
    desc: 'RENTETAN 6 TUSUKAN KILAT KE MUSUH DI JANGKAUAN (UDARA JUGA); PENUH: 8 + TUSUKAN TEMBUS',
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const base = f > 0 ? 0 : Math.PI;
      const reach = full ? 58 : 46;
      // Offset of an angle from straight ahead, negative = upward.
      const off = (a: number) => Phaser.Math.Angle.Wrap(a - base) * f;
      const inCone = (t: Foe, ox: number, oy: number, r: number) => {
        const o = off(Phaser.Math.Angle.Between(ox, oy, t.x, t.y));
        return t.active && o > -1.1 && o < 0.45 && Phaser.Math.Distance.Between(ox, oy, t.x, t.y) <= r;
      };
      const near = (r: number) => world.targets(p.x, p.y).filter((t) => inCone(t, p.x + f * 4, p.y - 1, r));
      if (!near(full ? 130 : reach + 6).length) return false;
      const n = full ? 8 : 6;
      const step = full ? 48 : 60;
      p.lock(full ? 560 : 400);
      p.invuln(full ? 560 : 400);
      p.setVelocityX(0);

      for (let i = 0; i < n; i++)
        later(scene, i * step, () => {
          if (!p.active) return;
          const [ox, oy] = [p.x + f * 4, p.y - 1];
          // Each thrust picks its own target as it goes out (round robin), else a stab into the air ahead.
          const foes = near(reach + 6);
          const t = foes[i % Math.max(1, foes.length)];
          const raw = t ? off(Phaser.Math.Angle.Between(ox, oy, t.x, t.y)) : Phaser.Math.FloatBetween(-0.6, 0.25);
          const a = base + f * (Phaser.Math.Clamp(raw, -1.05, 0.4) + Phaser.Math.FloatBetween(-0.04, 0.04));
          const [cx, cy] = [Math.cos(a), Math.sin(a)];
          // The spear snaps out to full reach and back (its tip ends `reach` px out), with a crimson streak.
          const len = reach - 14;
          const out = reach - len / 2 - 13;
          const spear = crimsonSpear(scene, len).setRotation(a);
          spear.setPosition(ox + cx * (out - 16), oy + cy * (out - 16));
          scene.tweens.add({ targets: spear, x: ox + cx * out, y: oy + cy * out, duration: 35, ease: 'Quad.Out' });
          scene.tweens.add({
            targets: spear,
            alpha: 0,
            x: ox + cx * (out - 10),
            y: oy + cy * (out - 10),
            delay: 45,
            duration: 60,
            onComplete: () => spear.destroy(),
          });
          const streak = scene.add.graphics().setDepth(13);
          streak.lineStyle(3, 0xff004d, 0.35).lineBetween(ox, oy, ox + cx * reach, oy + cy * reach);
          streak.lineStyle(1, 0xff77a8, 0.9).lineBetween(ox + cx * 10, oy + cy * 10, ox + cx * reach, oy + cy * reach);
          scene.tweens.add({ targets: streak, alpha: 0, duration: 140, onComplete: () => streak.destroy() });
          let hit = false;
          for (const e of world.targets(ox, oy)) {
            if (!e.active || !onLine(ox, oy, a, reach, e, 7)) continue;
            hit = true;
            world.strike(e, full ? 0.45 : 0.5, 'basic', false, undefined, 50);
            sparks(scene, e.x, e.y, [0xff004d, 0xfff1e8], 3, 8);
          }
          if (hit) scene.cameras.main.shake(40, 0.003);
        });
      if (!full) return;

      // Full: the spear driven home down the most crowded line, through everything on it.
      later(scene, n * step + 40, () => {
        if (!p.active) return;
        const [ox, oy] = [p.x + f * 4, p.y - 1];
        const foes = near(140);
        const a = base + f * Phaser.Math.Clamp(off(bestLine(foes, ox, oy, 10, base)), -1.05, 0.4);
        const [cx, cy] = [Math.cos(a), Math.sin(a)];
        const R = 130;
        p.setVelocityX(f * 220);
        later(scene, 90, () => p.active && p.setVelocityX(0));
        ring(scene, ox, oy, 0xff004d, 4, 22, 220, 2);
        const spear = crimsonSpear(scene, 90).setRotation(a);
        spear.setPosition(ox + cx * 20, oy + cy * 20);
        scene.tweens.add({ targets: spear, x: ox + cx * (R - 58), y: oy + cy * (R - 58), duration: 70, ease: 'Quad.Out' });
        scene.tweens.add({ targets: spear, alpha: 0, delay: 200, duration: 160, onComplete: () => spear.destroy() });
        const lane = scene.add.graphics().setDepth(12);
        lane.lineStyle(9, 0xff004d, 0.25).lineBetween(ox, oy, ox + cx * R, oy + cy * R);
        lane.lineStyle(3, 0xff004d, 0.8).lineBetween(ox, oy, ox + cx * R, oy + cy * R);
        lane.lineStyle(1, 0xfff1e8).lineBetween(ox, oy, ox + cx * R, oy + cy * R);
        scene.tweens.add({ targets: lane, alpha: 0, delay: 140, duration: 220, onComplete: () => lane.destroy() });
        scene.cameras.main.flash(100, 255, 0, 77);
        scene.cameras.main.shake(160, 0.012);
        for (const e of world.targets(ox, oy)) {
          if (!e.active || !onLine(ox, oy, a, R, e, 10)) continue;
          world.strike(e, 2.2, 'basic', false, undefined, 300);
          thorns(scene, e.x, e.y, 0xff004d, 7, 14);
          cutMark(scene, e.x, e.y, 0xff004d, 28, a);
          launch(e, 200);
        }
      });
    },
  },

  // Pusaran Raksasa: Heracles whirls the stone axe-sword around himself like a storm and wades forward in it, the
  // wind of the blade sucking enemies into the blades; it ends in one overhead chop. Full: a longer, taller whirlwind
  // (a dust funnel that drags flyers down into it), and the chop splits the floor: a molten fissure runs ahead and
  // bursts, throwing everything over it into the air.
  berserker: {
    name: 'PUSARAN RAKSASA',
    desc: 'BERPUTAR MAJU MENARIK MUSUH, LALU MEMBACOK; PENUH: LEBIH TINGGI & LANTAI TERBELAH',
    fire(c, level) {
      const { p, world, scene } = c;
      const full = level === 2;
      const f = p.facing;
      const T = full ? 520 : 360;
      // Slow enough that the wind of the blade keeps the ones it drags in around him (they used to fall behind).
      const spd = full ? 130 : 100;
      const R = full ? 34 : 28;
      const travel = (spd * T) / 1000;
      const [lo, hi] = [Math.min(p.x - f * 40, p.x + f * (travel + 70)), Math.max(p.x - f * 40, p.x + f * (travel + 70))];
      if (!world.targets(p.x, p.y).some((t) => t.x >= lo && t.x <= hi && Math.abs(t.y - p.y) < (full ? 85 : 45))) return false;
      p.lock(T + (full ? 200 : 150));
      p.invuln(T + (full ? 200 : 150));

      // The whirl, redrawn every frame around him: dust rings, the blade going round, and its ghost behind it.
      const g = scene.add.graphics().setDepth(12);
      const n = full ? 4 : 3;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: T,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          if (!p.active) return;
          p.setVelocityX(f * spd);
          g.clear();
          const rings = full ? [4, -10, -24] : [4, -4];
          rings.forEach((dy, i) => {
            const rx = R + i * 4;
            g.lineStyle(2, i % 2 ? 0xab5236 : 0xd08a50, 0.55).strokeEllipse(p.x, p.y + dy, rx * 2, 8 + i * 2);
          });
          const phi = v * n * Math.PI * 2 * f;
          for (let k = 3; k >= 0; k--) {
            const a = phi - k * 0.35 * f;
            const [bx, by] = [p.x + Math.cos(a) * R, p.y + Math.sin(a) * 4];
            const [hx, hy] = [p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 1.5];
            if (k) {
              g.lineStyle(4 - k, 0xfff1e8, 0.35 - k * 0.08).lineBetween(hx, hy, bx, by);
              continue;
            }
            // The stone axe-sword itself: black outline, grey stone, a lit edge.
            g.lineStyle(5, 0x000000).lineBetween(hx, hy, bx, by);
            g.lineStyle(3, 0x5f574f).lineBetween(hx, hy, bx, by);
            g.lineStyle(1, 0xc2c3c7).lineBetween(hx, hy - 1, bx, by - 1);
          }
          // Dust torn up into the whirl.
          if (Math.random() < 0.5) {
            const a = Math.random() * Math.PI * 2;
            const d = scene.add.rectangle(p.x + Math.cos(a) * R, p.y + 6, 2, 1, Math.random() < 0.5 ? 0xd08a50 : 0x5f574f).setDepth(12);
            scene.tweens.add({ targets: d, x: p.x, y: p.y - (full ? 30 : 12), alpha: 0, duration: 260, onComplete: () => d.destroy() });
          }
        },
        onComplete: () => g.destroy(),
      });
      // The wind of the blade drags them in; each turn of the blade cuts everything inside it.
      for (let k = 0; k * 40 < T; k++) later(scene, k * 40, () => p.active && world.pull(p.x, p.y, full ? 80 : 52, full ? 170 : 130));
      for (let k = 0; k < n; k++)
        later(scene, ((k + 0.5) * T) / n, () => {
          if (!p.active) return;
          rocks(scene, p.x, groundY(c) - 1, 3);
          scene.cameras.main.shake(50, 0.005);
          for (const t of world.targets(p.x, p.y)) {
            if (!t.active || Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y - (full ? 8 : 2)) > R + 6) continue;
            world.strike(t, 0.6, 'basic', false, undefined, 0);
            cutMark(scene, t.x, t.y, 0xffa300, 20, Phaser.Math.FloatBetween(-0.3, 0.3));
          }
        });

      // The chop: the axe-sword brought down in front of him.
      later(scene, T, () => {
        if (!p.active) return;
        p.setVelocityX(0);
        const gy = groundY(c);
        const x = p.x + f * 16;
        const arc = scene.add.graphics();
        for (const [w, col, al] of [
          [8, 0xab5236, 0.35],
          [4, 0xd08a50, 1],
          [1, 0xfff1e8, 1],
        ] as const)
          arc.lineStyle(w, col, al).beginPath().arc(0, 0, 24, -2.2, 0.6).strokePath();
        const chop = scene.add
          .container(p.x, p.y - 4, [arc])
          .setScale(f, 1)
          .setDepth(13);
        scene.tweens.add({ targets: chop, alpha: 0, duration: 220, onComplete: () => chop.destroy() });
        ring(scene, x, gy - 2, 0xab5236, 4, 30, 260, 3);
        rocks(scene, x, gy - 1, 8);
        scene.cameras.main.shake(140, 0.014);
        for (const t of world.targets(x, gy)) {
          const dx = (t.x - p.x) * f;
          // The chop also takes the ones the whirl dragged in around him, not only the ones ahead.
          if (!t.active || dx < -R || dx > 38 || t.y < p.y - 36 || t.y > p.y + 12) continue;
          // Full: a light knock only, so the fissure that follows still finds them (it throws them up itself).
          world.strike(t, 1.2, 'basic', false, undefined, full ? 60 : 280);
          cutMark(scene, t.x, t.y, 0xffa300, 26, f * 1.3);
        }
        if (!full) return;
        // Full: the floor splits from under him (where the whirl left them) out ahead of the blade, then it bursts.
        const xs = Phaser.Math.Clamp(p.x - f * R, 4, W - 4);
        const x2 = Phaser.Math.Clamp(x + f * 120, 4, W - 4);
        const pts = jag(xs, gy, x2, gy, 2).map(([px, py]) => new Phaser.Math.Vector2(px, py));
        const crack = scene.add.graphics().setDepth(12);
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 160,
          onUpdate: (tw) => {
            const k = Math.max(2, Math.ceil((tw.getValue() ?? 0) * pts.length));
            const seen = pts.slice(0, k);
            crack.clear();
            crack.lineStyle(6, 0xff004d, 0.3).strokePoints(seen);
            crack.lineStyle(3, 0x000000).strokePoints(seen);
            crack.lineStyle(1, 0xffa300).strokePoints(seen);
          },
        });
        scene.tweens.add({ targets: crack, alpha: 0, delay: 500, duration: 400, onComplete: () => crack.destroy() });
        later(scene, 170, () => {
          scene.cameras.main.flash(120, 255, 163, 0);
          scene.cameras.main.shake(220, 0.02);
          // Shafts of molten light tear up out of the whole fissure.
          for (let sx = Math.min(xs, x2); sx <= Math.max(xs, x2); sx += 14) {
            const h = Phaser.Math.Between(26, 44);
            const shaft = [scene.add.rectangle(sx, gy, 8, h, 0xff004d, 0.45), scene.add.rectangle(sx, gy, 3, h, 0xffec27)].map((s) =>
              s.setOrigin(0.5, 1).setScale(1, 0).setDepth(13),
            );
            scene.tweens.add({ targets: shaft, scaleY: 1, duration: 90, ease: 'Quad.Out' });
            scene.tweens.add({
              targets: shaft,
              scaleX: 0,
              alpha: 0,
              delay: 150,
              duration: 220,
              onComplete: () => shaft.forEach((s) => s.destroy()),
            });
            rocks(scene, sx, gy - 1, 2);
          }
          for (const t of world.targets(x, gy)) {
            if (!t.active || t.x < Math.min(xs, x2) - 6 || t.x > Math.max(xs, x2) + 6 || t.y < gy - 50 || t.y > gy + 6) continue;
            world.strike(t, 1.8, 'basic', false, undefined, 200);
            sparks(scene, t.x, t.y, [0xffa300, 0xff004d], 6, 14);
            launch(t, 260);
          }
        });
      });
    },
  },

  // Hrunting, the Red Hound: "Trace on": the black bow and the black sword-arrow are projected, drawn to the full. Let
  // go, Hrunting chases its prey as long as he wills it: it streaks to the target (wherever it is, in the air too),
  // tears through, loops round and bites again. Full: it hunts on, swerving from enemy to enemy four times, and
  // ends as a Broken Phantasm: the arrow blows itself up on its last prey and throws the ones around it up.
  // (Caladbolg II is his skill already, so the full shot is Hrunting's own chase, not another straight arrow.)
  pemburu: {
    name: 'HRUNTING',
    desc: 'PANAH ANJING MERAH MENGEJAR MUSUH, MENGGIGIT 2X; PENUH: MEMBURU 4X LALU MELEDAK',
    charging({ p, scene }, t01, level, g) {
      const time = scene.time.now;
      const [x, y] = [p.x + p.facing * 5, p.y - 1];
      // Crimson haze gathering around the drawn arrow, thicker as the charge grows.
      g.fillStyle(0xff004d, 0.08 + 0.18 * t01).fillEllipse(x + p.facing * 8, y, 18 + 10 * t01, 6 + 3 * t01);
      drawBow(g, x, y, p.facing, t01, true);
      if (level < 1) return;
      // Red wisps flicker along Hrunting: the hound straining at the leash.
      for (let i = 0; i < (level === 2 ? 4 : 2); i++) {
        const k = (time / 50 + i * 7) % 16;
        g.fillStyle(i % 2 ? 0xff77a8 : 0xff004d).fillRect(x + p.facing * (k - 4), y + (Math.sin(time / 30 + i) > 0 ? -2 : 2), 2, 1);
      }
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const foes = world.targets(p.x, p.y);
      const first = foes.find((t) => Math.sign(t.x - p.x) === f) ?? foes[0];
      if (!first) return false;
      houndTexture(scene);
      p.lock(160);
      const [x0, y0] = [p.x + f * 8, p.y - 1];
      // The bow fades once the arrow is loosed; the string snaps.
      const bow = scene.add.graphics().setDepth(11);
      drawBow(bow, p.x + f * 5, p.y - 1, f, 0, false);
      scene.tweens.add({ targets: bow, alpha: 0, duration: 260, onComplete: () => bow.destroy() });
      ring(scene, x0, y0, 0xff004d, 2, 14, 200);

      const mults = full ? [1.1, 1.1, 1.1, 1.1] : [1.6, 1.4];
      const hound = scene.add
        .image(x0, y0, 'hrunting')
        .setRotation(f > 0 ? 0 : Math.PI)
        .setDepth(14);
      const finish = () => {
        const { x, y } = hound;
        hound.destroy();
        if (!full) {
          sparks(scene, x, y, [0xff004d, 0x000000, 0xff77a8], 8, 12);
          return;
        }
        // Broken Phantasm: the arrow blows itself up on its last prey.
        explosion(scene, x, y, 22);
        ring(scene, x, y, 0xff004d, 6, 40, 320, 2);
        scene.cameras.main.flash(110, 255, 163, 0);
        scene.cameras.main.shake(200, 0.016);
        world.area(x, y, 30, 1.5, 240, 'basic');
        for (const t of world.targets(x, y)) if (Phaser.Math.Distance.Between(t.x, t.y, x, y) < 30) launch(t, 200);
      };
      const bitten = new Set<Foe>();
      const hop = (k: number, t: Foe) => {
        const [sx, sy] = [hound.x, hound.y];
        let [lx, ly] = [t.x, t.y];
        const d = Phaser.Math.Distance.Between(sx, sy, lx, ly);
        const side = k % 2 ? 1 : -1;
        // It swerves on the way like a hound on the scent; at the same prey again it loops out and comes back round.
        const h = d < 16 ? hound.rotation : Phaser.Math.Angle.Between(sx, sy, lx, ly);
        const [ax, ay] = d < 16 ? [sx + Math.cos(h) * 56, sy + Math.sin(h) * 56] : [(sx + lx) / 2, (sy + ly) / 2];
        const bend = d < 16 ? 36 : Math.min(36, d * 0.35);
        const [cx, cy] = [ax + Math.cos(h + Math.PI / 2) * side * bend, ay + Math.sin(h + Math.PI / 2) * side * bend];
        let n = 0;
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 150 + Math.min(110, d * 0.6) + (d < 16 ? 60 : 0),
          onUpdate: (tw) => {
            if (t.active) [lx, ly] = [t.x, t.y];
            const [bx, by] = bez(sx, sy, cx, cy, lx, ly, tw.getValue() ?? 0);
            if (bx !== hound.x || by !== hound.y) hound.setRotation(Phaser.Math.Angle.Between(hound.x, hound.y, bx, by));
            hound.setPosition(bx, by);
            // The red trail it leaves in the air.
            const s = scene.add
              .rectangle(bx, by, 4, n++ % 3 ? 1 : 2, n % 3 ? 0xff004d : 0x7e2553)
              .setRotation(hound.rotation)
              .setDepth(13);
            scene.tweens.add({ targets: s, alpha: 0, scaleX: 0.3, duration: 200, onComplete: () => s.destroy() });
          },
          onComplete: () => {
            if (t.active) {
              world.strike(t, mults[k], 'basic', false, undefined, 120);
              cutMark(scene, t.x, t.y, 0xff004d, 22, hound.rotation);
              sparks(scene, t.x, t.y, [0xff004d, 0xfff1e8], 6, 12);
              scene.cameras.main.shake(60, 0.006);
            }
            if (k + 1 >= mults.length) return finish();
            // On to the nearest other prey within reach (one not bitten yet first), else back at the same one, else
            // whoever is left.
            bitten.add(t);
            const d = (e: Foe) => Phaser.Math.Distance.Between(e.x, e.y, hound.x, hound.y);
            const all = world.targets(hound.x, hound.y).filter((e) => e.active);
            const near = all
              .filter((e) => e !== t && d(e) < 170)
              .sort((a, b) => Number(bitten.has(a)) - Number(bitten.has(b)) || d(a) - d(b));
            const next = near[0] ?? (t.active ? t : all[0]);
            if (!next) return finish();
            hop(k + 1, next);
          },
        });
      };
      hop(0, first);
    },
  },
};
