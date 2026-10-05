import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import type { Status } from '../../logic/loot.ts';
import { FIRE, bez, explosion, flameTongue, glint, jag, later, ring, rocks, smoke2, smokePuff, soulTo, sparks } from '../skills.ts';
import type { ChargedAttack } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
/** Small fry: neither a boss nor an elite, so it can be thrown about. */
const light = (t: Foe) => t.active && !('tier' in t) && !t.getData('elite');
const toss = (t: Foe, vy: number) => light(t) && (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-vy);
/** The nearest enemy in front of (x, y) facing f, or the nearest at all. */
const aheadOf = (foes: Foe[], x: number, f: number) => foes.find((t) => (t.x - x) * f > -4) ?? foes[0];

// ---------------------------------------------------------------------------------------------------------------
// Grim Reaper: the spectral scythe, drawn straight into a Graphics so the charge and the swing share one shape.
// Grip at (x, y), snath `len` px pointing up at th = 0, turning forward (toward f) as th grows; the blade curls
// forward off the top and hooks down, `k` its size.
// ---------------------------------------------------------------------------------------------------------------
const BLADE = [
  [0, -2],
  [18, -6],
  [36, 0],
  [50, 14],
  [40, 8],
  [24, 2],
  [0, 4],
];
function drawScythe(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, th: number, len: number, k: number, a = 1): void {
  const [c, s] = [Math.cos(th), Math.sin(th)];
  // Local (lx, ly) mirrored by f, then turned by th about the grip.
  const T = (lx: number, ly: number) => V(x + f * (lx * c - ly * s), y + lx * s + ly * c);
  const blade = (m: number) => BLADE.map(([bx, by]) => T(bx * k * m, -len + by * k * m));
  const [b0, b1] = [T(0, 8), T(0, -len)];
  g.lineStyle(5, 0x29adff, 0.25 * a).lineBetween(b0.x, b0.y, b1.x, b1.y);
  g.lineStyle(3, 0x1c1c28, a).lineBetween(b0.x, b0.y, b1.x, b1.y);
  g.lineStyle(1, 0x83769c, a).lineBetween(b0.x, b0.y, b1.x, b1.y);
  // Soul-fire glow, the dark outline, the pale steel, a white cutting edge and a blue vein along the spine.
  g.fillStyle(0x29adff, 0.3 * a).fillPoints(blade(1.18), true);
  g.fillStyle(0x1c1c28, a).fillPoints(blade(1.06), true);
  g.fillStyle(0xc2c3c7, a).fillPoints(blade(1), true);
  g.lineStyle(1, 0xfff1e8, a).strokePoints(blade(1).slice(0, 4));
  g.lineStyle(1, 0x29adff, 0.8 * a).strokePoints(blade(0.7).slice(4));
}

// ---------------------------------------------------------------------------------------------------------------
// Elementalis: what each element of her cycle sprays like: [rim, body, light] colors and what it does to a hit.
// ---------------------------------------------------------------------------------------------------------------
const ELEMENTS: { c: [number, number, number]; status: Status; full: Status }[] = [
  { c: [0xff004d, 0xffa300, 0xffec27], status: { burn: 0.15 }, full: { burn: 0.3 } },
  { c: [0x29adff, 0xc2f0ff, 0xfff1e8], status: { freeze: 250 }, full: { freeze: 900 } },
  { c: [0x29adff, 0xffec27, 0xfff1e8], status: { freeze: 150 }, full: { freeze: 500 } },
  { c: [0x5f574f, 0xab5236, 0xffccaa], status: { slow: 800 }, full: { slow: 1800 } },
];
const element = (p: Phaser.GameObjects.Sprite) => ((p.getData('element') as number | undefined) ?? 0) % 4;

/** Charged attacks (TAHAN J) of: magicArcher, reaper, gunners, cultivator, elementalis. Contract and damage budget: see types.ts. */
export const BATCH_2: Partial<Record<ClassId, ChargedAttack>> = {
  // ---------------------------------------------------------------------------------------------------------------
  // Pusaran Galaksi (Galaxy Whirl): while she draws, arcane arrows take shape one by one in a turning wheel around
  // her, points outward. On release the wheel spins open like a galaxy: the arrows spiral out from her, then each one
  // bends and homes in on an enemy (in the air too), the nearest ones shared out in turn. Level 1: six arrows, three
  // nearest enemies. Full: ten star-arrows, five enemies, a two-armed galaxy turning under her, heavier hits that
  // knock the small ones into the air.
  // ---------------------------------------------------------------------------------------------------------------
  magicArcher: {
    name: 'PUSARAN GALAKSI',
    desc: 'RODA 6 PANAH BERPUTAR KELUAR LALU MEMBURU MUSUH; PENUH: 10 PANAH BINTANG, MUSUH TERLEMPAR',
    charging({ p, scene }, t01, level, g) {
      const n = level === 2 ? 10 : level === 1 ? 5 + Math.floor(((t01 - 0.375) / 0.625) * 5) : 1 + Math.floor((t01 / 0.375) * 4);
      const [cx, cy] = [p.x, p.y - 2];
      const spin = scene.time.now / 500;
      const r = 13 + t01 * 3;
      g.fillStyle(0xff77a8, 0.08 + 0.1 * t01).fillCircle(cx, cy, r + 4);
      g.lineStyle(1, 0x83769c, 0.5).strokeCircle(cx, cy, r);
      // The arrows of the wheel: a violet fletching inside, a pink shaft, a gold head (white once full).
      for (let i = 0; i < n; i++) {
        const a = spin + (i / n) * Math.PI * 2;
        const [ca, sa] = [Math.cos(a), Math.sin(a)];
        const at = (d: number) => [cx + ca * d, cy + sa * d] as const;
        g.lineStyle(1, 0x83769c).lineBetween(...at(r - 5), ...at(r - 3));
        g.lineStyle(1, 0xff77a8).lineBetween(...at(r - 3), ...at(r + 3));
        g.fillStyle(level === 2 ? 0xfff1e8 : 0xffec27).fillRect(at(r + 4)[0] - 1, at(r + 4)[1] - 1, 2, 2);
      }
      if (level === 2) g.lineStyle(1, 0xffec27, 0.4 + 0.3 * Math.sin(scene.time.now / 40)).strokeCircle(cx, cy, r + 7);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const n = full ? 10 : 6;
      const marks = foes.slice(0, full ? 5 : 3);
      const [cx, cy] = [p.x, p.y - 2];
      p.lock(200);
      p.setVelocityX(0);
      ring(scene, cx, cy, 0xff77a8, 6, full ? 34 : 24, 300, 2);
      // Full: the galaxy itself, two spiral arms of pink and violet around a gold heart, turning open under her.
      if (full) {
        const gal = scene.add.graphics();
        for (const [arm, col] of [
          [0, 0xff77a8],
          [Math.PI, 0x83769c],
        ] as const)
          for (const [w, a] of [
            [3, 0.35],
            [1, 1],
          ] as const) {
            gal.lineStyle(w, col, a).beginPath();
            for (let i = 0; i <= 14; i++) {
              const [d, an] = [3 + i * 2.4, arm + i * 0.32];
              if (i) gal.lineTo(Math.cos(an) * d, Math.sin(an) * d * 0.55);
              else gal.moveTo(Math.cos(an) * d, Math.sin(an) * d * 0.55);
            }
            gal.strokePath();
          }
        gal.fillStyle(0xffec27).fillCircle(0, 0, 3).fillStyle(0xfff1e8).fillCircle(0, 0, 1.5);
        const c = scene.add.container(cx, cy, [gal]).setDepth(11).setScale(0.3);
        scene.tweens.add({ targets: c, scale: 1.3, angle: 200, alpha: 0, duration: 650, ease: 'Quad.Out', onComplete: () => c.destroy() });
      }
      const hits = new Map<Foe, number>();
      for (let i = 0; i < n; i++) hits.set(marks[i % marks.length], i);
      for (let i = 0; i < n; i++) {
        const t = marks[i % marks.length];
        const a0 = (i / n) * Math.PI * 2;
        const arrow = scene.add.image(cx, cy, full ? 'panahBintang' : 'panahArkana').setDepth(13);
        const out = 24 + (i % 2) * 6;
        const spinMs = 200;
        const homeMs = 240 + (i % marks.length) * 40;
        let [px, py] = [cx, cy];
        let [ex, ey] = [0, 0];
        scene.tweens.addCounter({
          from: 0,
          to: spinMs + homeMs,
          duration: spinMs + homeMs,
          onUpdate: (tw) => {
            const ms = tw.getValue() ?? 0;
            let x: number;
            let y: number;
            if (ms < spinMs) {
              // The spiral out: radius grows while the whole wheel keeps turning.
              const k = ms / spinMs;
              const an = a0 + k * 1.6;
              [x, y] = [cx + Math.cos(an) * out * k, cy + Math.sin(an) * out * k];
              [ex, ey] = [x, y];
            } else {
              // Then it bends toward its mark (where the mark is now), swinging wide along the turn of the galaxy.
              const k = (ms - spinMs) / homeMs;
              const an = a0 + 1.6;
              const [tx, ty] = t.active ? [t.x, t.y] : [px, py];
              [x, y] = bez(ex, ey, ex + Math.cos(an + 1.2) * 40, ey + Math.sin(an + 1.2) * 40, tx, ty, k * k);
            }
            if (x !== px || y !== py) arrow.setRotation(Math.atan2(y - py, x - px));
            arrow.setPosition(x, y);
            const tr = scene.add.rectangle(px, py, 1, 1, i % 2 ? 0xff77a8 : 0xffec27).setDepth(12);
            scene.tweens.add({ targets: tr, alpha: 0, duration: 220, onComplete: () => tr.destroy() });
            [px, py] = [x, y];
          },
          onComplete: () => {
            arrow.destroy();
            sparks(scene, px, py, [0xff77a8, 0xffec27, 0xfff1e8], full ? 8 : 5, full ? 16 : 10);
            if (!t.active) return;
            glint(scene, t.x, t.y);
            world.strike(t, full ? 0.6 : 0.5, 'basic', false, undefined, full ? 140 : 60);
            if (full) scene.cameras.main.shake(50, 0.004);
            // The last arrow into each enemy of a full whirl throws it up.
            if (full && hits.get(t) === i) toss(t, 170);
          },
        });
      }
    },
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Tuai Jiwa (Soul Reaping): while he gathers, a spectral scythe of soul-fire forms over his own, raised high behind
  // his head. Level 1: the great blade comes over and down in front of him, hooking everything in its sweep (flyers
  // over his head too) and dragging it to his feet; then he rips it free, a second cut, and their souls bleed into
  // him. Full: a longer blade, and after the hook he whirls it twice around himself in a full circle of soul-fire,
  // the second turn hurling the small ones up and away.
  // ---------------------------------------------------------------------------------------------------------------
  reaper: {
    name: 'TUAI JIWA',
    desc: 'SABIT ARWAH RAKSASA MENGAIT & MENYERET MUSUH; PENUH: LALU BERPUTAR 2X 360, MUSUH TERLEMPAR',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const len = 24 + t01 * 14;
      const th = -0.75 - t01 * 0.25 + Math.sin(scene.time.now / 120) * 0.04;
      // Soul-light wisps rising around him, then the scythe being raised.
      for (let i = 0; i < 5; i++) {
        const k = (scene.time.now / 700 + i / 5) % 1;
        g.fillStyle(i % 2 ? 0x29adff : 0xc2f0ff, (1 - k) * 0.8).fillRect(p.x + Math.sin(i * 2.3 + k * 4) * 10, p.y + 8 - k * 24, 1, 2);
      }
      drawScythe(g, p.x - f * 2, p.y, f, th, len, 0.45 + t01 * 0.4, 0.35 + 0.55 * t01);
      if (level === 2) g.lineStyle(1, 0x29adff, 0.5).strokeCircle(p.x, p.y, 10 + Math.sin(scene.time.now / 40));
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      if (!world.targets(p.x, p.y).length) return false;
      const f = p.facing;
      const [x0, y0] = [p.x, p.y];
      const [len, k, R] = full ? [44, 1.1, 86] : [36, 0.85, 66];
      p.lock(full ? 600 : 340);
      p.setVelocityX(0);
      if (full) p.invuln(560);
      const g = scene.add.graphics().setDepth(13);
      const trail = scene.add.graphics().setDepth(12);
      // The sweep's track: a band of soul-light following the blade tip from where it started.
      const track = (from: number, to: number, alpha: number) => {
        const pts: Phaser.Math.Vector2[] = [];
        const n = Math.max(2, Math.ceil(Math.abs(to - from) / 0.15));
        for (let i = 0; i <= n; i++) {
          const a = from + ((to - from) * i) / n;
          pts.push(V(x0 + f * Math.sin(a) * (R - 6), y0 - Math.cos(a) * (R - 6)));
        }
        trail.clear();
        trail.lineStyle(9, 0x29adff, 0.25 * alpha).strokePoints(pts);
        trail.lineStyle(3, 0xc2f0ff, 0.6 * alpha).strokePoints(pts);
        trail.lineStyle(1, 0xfff1e8, alpha).strokePoints(pts);
      };
      const inReach = (t: Foe) => t.active && Phaser.Math.Distance.Between(x0, y0, t.x, t.y) <= R;
      const hooked: Foe[] = [];
      // The hook: from high behind his head, over and down in front, curling back toward his feet.
      const [h0, h1] = [-1.1, 2.5];
      scene.tweens.addCounter({
        from: h0,
        to: h1,
        duration: 220,
        ease: 'Cubic.In',
        onUpdate: (tw) => {
          const th = tw.getValue() ?? h0;
          g.clear();
          drawScythe(g, p.x, p.y, f, th, len, k);
          track(h0, th, 1);
        },
        onComplete: () => {
          scene.cameras.main.shake(110, 0.012);
          smoke2(scene, x0 + f * 20, FLOOR_Y - 2, 5);
          for (const t of world.targets(x0, y0)) {
            if (!inReach(t) || (t.x - x0) * f < -14) continue;
            hooked.push(t);
            world.strike(t, full ? 2 : 1.5, 'basic', false, undefined, -120);
            cutMark(scene, t.x, t.y, 0x29adff, 26, f * 0.9);
          }
          // Everything hooked is dragged in to his feet (bosses are too heavy).
          world.pull(x0 + f * 8, y0, R + 4, 240);
          if (!full) {
            // The rip: he wrenches the blade back out through them, and their souls follow it to him.
            later(scene, 120, () => {
              g.clear();
              for (const t of hooked) {
                if (!t.active) continue;
                world.strike(t, 1.5, 'basic', false, { slow: 600 }, 80);
                cutMark(scene, t.x, t.y, 0xc2f0ff, 22, -f * 0.6);
                soulTo(scene, t.x, t.y, p, 0x29adff);
              }
              scene.tweens.add({ targets: trail, alpha: 0, duration: 220, onComplete: () => (trail.destroy(), g.destroy()) });
            });
            return;
          }
          // Full: the harvest, two whole turns of the blade around him, reaping whatever is in the circle.
          const w0 = h1;
          scene.tweens.addCounter({
            from: w0,
            to: w0 + Math.PI * 4,
            delay: 60,
            duration: 300,
            onUpdate: (tw) => {
              const th = tw.getValue() ?? w0;
              g.clear();
              drawScythe(g, p.x, p.y, f, th, len, k);
              track(Math.max(w0, th - Math.PI * 1.6), th, 1);
            },
          });
          for (const turn of [0, 1])
            later(scene, 60 + 150 * (turn + 1), () => {
              ring(scene, x0, y0, turn ? 0xc2f0ff : 0x29adff, R * 0.4, R, 260, 2);
              scene.cameras.main.shake(turn ? 200 : 100, turn ? 0.018 : 0.01);
              for (const t of world.targets(x0, y0)) {
                if (!inReach(t)) continue;
                world.strike(t, 2, 'basic', false, turn ? { slow: 1200 } : undefined, turn ? 260 : 40);
                cutMark(scene, t.x, t.y, 0x29adff, 28);
                if (turn) {
                  toss(t, 230);
                  soulTo(scene, t.x, t.y, p, 0xc2f0ff);
                }
              }
              if (turn) {
                smoke2(scene, x0, FLOOR_Y - 2, 8);
                g.clear();
                scene.tweens.add({ targets: trail, alpha: 0, duration: 260, onComplete: () => (trail.destroy(), g.destroy()) });
              }
            });
        },
      });
    },
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Pelontar Granat (Grenade Launcher): the rifle keeps chattering while he thumbs fat 40 mm rounds into the
  // underbarrel launcher (the loaded rounds show over his helmet). On release it goes THOOMP: a heavy round lobbed
  // in an arc onto the nearest enemy ahead (in the air too), the recoil skidding him back; it airbursts on the
  // target in a fireball and a ring of shrapnel. Full: three rounds pumped out one after another at up to three
  // enemies, each blast bigger, concussing (slow) and blowing the small ones into the air.
  // ---------------------------------------------------------------------------------------------------------------
  gunners: {
    name: 'PELONTAR GRANAT',
    desc: 'GRANAT 40MM MELENGKUNG & MELEDAK DI UDARA; PENUH: 3 GRANAT BERUNTUN, MUSUH TERLEMPAR',
    charging({ p, scene }, t01, level, g) {
      // The rounds loaded so far, as brass shells over his helmet; the launcher's breech glows under the barrel.
      const fill = [Math.min(1, t01 / 0.375), Phaser.Math.Clamp((t01 - 0.375) / 0.31, 0, 1), Phaser.Math.Clamp((t01 - 0.69) / 0.31, 0, 1)];
      for (let i = 0; i < 3; i++) {
        const [x, y] = [p.x - 6 + i * 5, p.y - 22];
        g.fillStyle(0x1d2b53, 0.6).fillRect(x - 1, y - 1, 5, 7);
        const h = Math.round(fill[i] * 5);
        if (h) {
          g.fillStyle(0xd4a017).fillRect(x, y + 5 - h, 3, h);
          if (h === 5) g.fillStyle(level === 2 ? 0xfff1e8 : 0x008751).fillRect(x, y, 3, 2);
        }
      }
      const pulse = 0.5 + 0.5 * Math.sin(scene.time.now / (level === 2 ? 40 : 90));
      g.fillStyle(0xffa300, 0.3 + 0.4 * t01 * pulse).fillCircle(p.x + p.facing * 9, p.y + 2, 1.5 + t01 * 1.5);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const first = aheadOf(foes, p.x, p.facing);
      p.facing = first.x >= p.x ? 1 : -1;
      const f = p.facing;
      const ahead = foes.filter((t) => (t.x - p.x) * f > -4);
      const marks = [first, ...ahead.filter((t) => t !== first)].slice(0, full ? 3 : 1);
      p.lock(full ? 380 : 180);
      const rounds = full ? 3 : 1;
      for (let i = 0; i < rounds; i++)
        later(scene, i * 120, () => {
          if (!p.active) return;
          const t = marks[i % marks.length];
          const [mx, my] = [p.x + f * 12, p.y + 1];
          // THOOMP: a fat muzzle bloom, a ring of smoke, the big brass case kicked out, and the kick on his shoulder.
          const bloom = scene.add.circle(mx, my, 6, 0xffec27).setStrokeStyle(2, 0xffa300).setDepth(14);
          scene.tweens.add({ targets: bloom, radius: 1, alpha: 0, duration: 110, onComplete: () => bloom.destroy() });
          ring(scene, mx, my, 0xc2c3c7, 2, 12, 260, 2);
          smokePuff(scene, mx + f * 2, my);
          const caseG = scene.add
            .rectangle(p.x, p.y - 2, 2, 4, 0xd4a017)
            .setStrokeStyle(1, 0x7a5c44)
            .setDepth(13);
          scene.tweens.add({
            targets: caseG,
            x: p.x - f * Phaser.Math.Between(10, 18),
            y: FLOOR_Y,
            angle: 400,
            duration: 420,
            ease: 'Quad.In',
            onComplete: () => scene.tweens.add({ targets: caseG, alpha: 0, delay: 300, duration: 200, onComplete: () => caseG.destroy() }),
          });
          p.setVelocityX(-f * (full ? 110 : 140));
          scene.cameras.main.shake(70, 0.006);
          // The round: olive body, a gold driving band, a dark outline, tumbling as it arcs.
          const shell = scene.add.graphics();
          shell.fillStyle(0x1d2b53).fillEllipse(0, 0, 8, 6);
          shell.fillStyle(0x008751).fillEllipse(0, 0, 6, 4);
          shell.fillStyle(0xd4a017).fillRect(-1, -2, 1, 4);
          shell.fillStyle(0xb4f080).fillRect(1, -1, 2, 1);
          const round = scene.add.container(mx, my, [shell]).setDepth(13);
          let [tx, ty] = [t.x, t.y];
          const d = Phaser.Math.Distance.Between(mx, my, tx, ty);
          const lift = 26 + d * 0.22;
          let last = 0;
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 260 + d * 0.9,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              if (t.active) [tx, ty] = [t.x, t.y];
              const [x, y] = bez(mx, my, (mx + tx) / 2, Math.min(my, ty) - lift, tx, ty, k);
              round.setPosition(x, y).setAngle(k * 720 * f);
              if (k - last > 0.08) {
                last = k;
                const puff = scene.add.circle(x, y, 1.5, 0xc2c3c7, 0.6).setDepth(12);
                scene.tweens.add({ targets: puff, scale: 2.5, alpha: 0, duration: 320, onComplete: () => puff.destroy() });
              }
            },
            onComplete: () => {
              round.destroy();
              const R = full ? 38 : 30;
              // The airburst: a white-hot heart, a layered fireball, shrapnel streaking out, smoke rolling up.
              const fireball = scene.add.graphics();
              fireball.fillStyle(0xff004d, 0.7).fillCircle(0, 0, R * 0.55);
              fireball.fillStyle(0xffa300).fillCircle(0, 0, R * 0.4);
              fireball.fillStyle(0xffec27).fillCircle(0, 0, R * 0.25);
              fireball.fillStyle(0xfff1e8).fillCircle(0, 0, R * 0.12);
              const fb = scene.add.container(tx, ty, [fireball]).setDepth(13).setScale(0.3);
              scene.tweens.add({ targets: fb, scale: 1, duration: 90, ease: 'Quad.Out' });
              scene.tweens.add({ targets: fb, alpha: 0, scale: 1.25, delay: 90, duration: 240, onComplete: () => fb.destroy() });
              ring(scene, tx, ty, 0xfff1e8, 3, R, 200, 2);
              for (let j = 0; j < 14; j++) {
                const a = (j / 14) * Math.PI * 2 + Math.random() * 0.2;
                const frag = scene.add
                  .rectangle(tx, ty, 5, 1, j % 2 ? 0xffec27 : 0xfff1e8)
                  .setRotation(a)
                  .setDepth(14);
                scene.tweens.add({
                  targets: frag,
                  x: tx + Math.cos(a) * R * 1.3,
                  y: ty + Math.sin(a) * R * 1.3,
                  alpha: 0,
                  duration: 260,
                  ease: 'Quad.Out',
                  onComplete: () => frag.destroy(),
                });
              }
              for (let j = 0; j < 4; j++) {
                const s = scene.add
                  .circle(tx + Phaser.Math.Between(-R / 3, R / 3), ty, Phaser.Math.Between(3, 5), 0x5f574f, 0.7)
                  .setDepth(12);
                scene.tweens.add({
                  targets: s,
                  y: s.y - Phaser.Math.Between(12, 24),
                  scale: 2,
                  alpha: 0,
                  duration: 650,
                  onComplete: () => s.destroy(),
                });
              }
              // Close to the floor: dirt kicked up and a scorch mark left behind.
              if (ty > FLOOR_Y - 26) {
                rocks(scene, tx, FLOOR_Y, 6);
                const scorch = scene.add.ellipse(tx, FLOOR_Y, R * 1.4, 4, 0x1c1c28, 0.7).setDepth(3);
                scene.tweens.add({ targets: scorch, alpha: 0, delay: 500, duration: 500, onComplete: () => scorch.destroy() });
              }
              scene.cameras.main.shake(full ? 130 : 110, full ? 0.014 : 0.011);
              // Direct hit on the mark, then the blast and its shrapnel on everything around (the mark too).
              if (t.active) world.strike(t, full ? 1.2 : 1.8, 'basic', false, undefined, 60);
              const near = world.targets(tx, ty).filter((o) => Phaser.Math.Distance.Between(tx, ty, o.x, o.y) <= R);
              world.area(tx, ty, R, full ? 0.8 : 1.2, full ? 200 : 140, 'basic', full ? { slow: 900 } : undefined);
              if (full) near.forEach((o) => toss(o, 180));
            },
          });
        });
    },
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Pedang Seribu Li (Thousand-Li Sword): he raises two fingers in the sword seal and his own sword hangs before
  // him, drinking in qi until it hums. Released, it becomes a streak of light that leaps from enemy to enemy (the
  // nearest next, flyers too), running each one through and leaving a line of qi hanging in the air behind it;
  // a lone enemy is run through again and again, back and forth. Level 1: three passes. Full: five passes, then every
  // line of qi it left flares and cuts again at once, throwing the small ones into the air, and the sword returns.
  // ---------------------------------------------------------------------------------------------------------------
  cultivator: {
    name: 'PEDANG SERIBU LI',
    desc: 'PEDANG QI MELESAT ZIGZAG MENEMBUS MUSUH 3X; PENUH: 5X, LALU JEJAK QI MENEBAS ULANG',
    charging({ p, scene }, t01, level, g) {
      const f = p.facing;
      const jit = level === 2 ? (Math.floor(scene.time.now / 40) % 2 ? 1 : -1) * 0.6 : 0;
      const [hx, hy] = [p.x + f * 6, p.y - 12 + jit];
      const len = 12 + t01 * 6;
      // Qi drawn in from around him along short streaks that converge on the blade.
      for (let i = 0; i < 6; i++) {
        const k = (scene.time.now / 400 + i / 6) % 1;
        const a = i * 1.05 + 0.4;
        const d = 22 * (1 - k);
        const [qx, qy] = [hx + f * len * 0.5 + Math.cos(a) * d, hy + Math.sin(a) * d];
        g.lineStyle(1, i % 2 ? 0x29adff : 0xfff1e8, 0.8 * k).lineBetween(qx, qy, qx - Math.cos(a) * 3, qy - Math.sin(a) * 3);
      }
      // The sword, level and point forward: qi glow, dark outline, steel, a lit edge, a gold guard, a red tassel.
      const x1 = hx + f * len;
      const lo = Math.min(hx, x1);
      g.fillStyle(0x29adff, 0.2 + 0.25 * t01).fillRect(lo - 2, hy - 3, len + 4, 6);
      g.fillStyle(0x1d2b53).fillRect(lo, hy - 1.5, len, 3);
      g.fillStyle(0xc2c3c7).fillRect(lo, hy - 0.5, len, 1.5);
      g.fillStyle(0xfff1e8).fillRect(lo, hy - 0.5, len, 0.5);
      g.fillStyle(0x1d2b53).fillTriangle(x1, hy - 1.5, x1, hy + 1.5, x1 + f * 3, hy);
      g.fillStyle(0xffec27).fillRect(hx - 1, hy - 3, 2, 6);
      g.fillStyle(0xff004d).fillRect(hx - f * 3, hy + 1, 1, 3);
      if (level >= 1) g.lineStyle(1, 0x29adff, 0.5).strokeCircle(p.x, p.y - 4, 12 + (level === 2 ? Math.sin(scene.time.now / 40) : 0));
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const hops = full ? 5 : 3;
      // The course: the nearest enemy ahead first, then always the nearest one not yet run through; when they run
      // out it goes back over the same ones in turn.
      const order: Foe[] = [aheadOf(foes, p.x, p.facing)];
      const left = foes.filter((t) => t !== order[0]);
      while (left.length && order.length < hops) {
        const at = order[order.length - 1];
        left.sort((a, b) => Phaser.Math.Distance.Between(at.x, at.y, a.x, a.y) - Phaser.Math.Distance.Between(at.x, at.y, b.x, b.y));
        order.push(left.shift()!);
      }
      const course = Array.from({ length: hops }, (_, i) => order[i % order.length]);
      p.facing = order[0].x >= p.x ? 1 : -1;
      p.lock(160);
      p.setVelocityX(0);
      const sword = scene.add
        .image(p.x + p.facing * 6, p.y - 12, 'w_pedangTerbang')
        .setScale(1.5)
        .setDepth(14);
      const glow = scene.add.ellipse(sword.x, sword.y, 26, 6, 0x29adff, 0.35).setDepth(13);
      const lines = scene.add.graphics().setDepth(12);
      const segs: [number, number, number, number][] = [];
      const struck = new Set<Foe>();
      ring(scene, sword.x, sword.y, 0x29adff, 3, 16, 220, 2);
      const hopMs = full ? 80 : 95;
      const fly = (i: number) => {
        if (i >= hops) return finish();
        const t = course[i];
        const [sx, sy] = [sword.x, sword.y];
        // Aim at where it is now, and run on past it.
        const [tx, ty] = t.active ? [t.x, t.y] : [sx + p.facing * 40, sy];
        const a = Phaser.Math.Angle.Between(sx, sy, tx, ty) || 0;
        const [ex, ey] = [Phaser.Math.Clamp(tx + Math.cos(a) * 24, 4, W - 4), Phaser.Math.Clamp(ty + Math.sin(a) * 24, 6, FLOOR_Y - 2)];
        sword.setRotation(a);
        glow.setRotation(a);
        scene.tweens.add({
          targets: [sword, glow],
          x: ex,
          y: ey,
          duration: hopMs,
          onComplete: () => {
            segs.push([sx, sy, ex, ey]);
            lines.lineStyle(3, 0x29adff, 0.45).lineBetween(sx, sy, ex, ey);
            lines.lineStyle(1, 0xfff1e8).lineBetween(sx, sy, ex, ey);
            if (t.active) {
              world.strike(t, full ? 0.8 : 1, 'basic', false, undefined, 50);
              cutMark(scene, t.x, t.y, 0x29adff, 22, a);
              ring(scene, t.x, t.y, 0xc2f0ff, 2, 12, 180);
              struck.add(t);
            }
            scene.cameras.main.shake(40, 0.004);
            fly(i + 1);
          },
        });
      };
      const finish = () => {
        // The sword flies home to his hand and fades.
        scene.tweens.add({
          targets: [sword, glow],
          x: p.x,
          y: p.y - 10,
          alpha: 0,
          duration: 200,
          ease: 'Quad.In',
          onComplete: () => (sword.destroy(), glow.destroy()),
        });
        if (!full) return void scene.tweens.add({ targets: lines, alpha: 0, delay: 120, duration: 260, onComplete: () => lines.destroy() });
        // Full: every line of qi left hanging in the air flares white and cuts again, all at once.
        later(scene, 140, () => {
          lines.clear();
          for (const [x1, y1, x2, y2] of segs) {
            lines.lineStyle(7, 0x29adff, 0.35).lineBetween(x1, y1, x2, y2);
            lines.lineStyle(3, 0xc2f0ff).lineBetween(x1, y1, x2, y2);
            lines.lineStyle(1, 0xfff1e8).lineBetween(x1, y1, x2, y2);
            sparks(scene, (x1 + x2) / 2, (y1 + y2) / 2, [0x29adff, 0xfff1e8], 4, 14);
          }
          scene.cameras.main.shake(160, 0.014);
          for (const t of struck) {
            if (!t.active) continue;
            world.strike(t, 2, 'basic', false, { freeze: 300 }, 160);
            cutMark(scene, t.x, t.y, 0xfff1e8, 30, 0.8);
            cutMark(scene, t.x, t.y, 0x29adff, 30, -0.8);
            toss(t, 200);
          }
          scene.tweens.add({ targets: lines, alpha: 0, delay: 140, duration: 260, onComplete: () => lines.destroy() });
        });
      };
      fly(0);
    },
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Semburan Elemen (Elemental Torrent): an orb of whatever element her cycle is on swells at the tip of her staff
  // while she holds (embers rising, frost points, crackling sparks, orbiting pebbles). Released, it bursts into a
  // roaring cone of that element aimed at the nearest enemy ahead (tilted up to reach flyers): a flamethrower of
  // fire, a frost-breath of ice shards, a fan of forked lightning, or a sandblast of gravel, scorching, frosting,
  // sparking or pitting the floor where it sweeps. Level 1: a short, narrow torrent. Full: a longer, wider one, and
  // at its end the element blooms (fireball, ice burst, a bolt from the sky, a ring of rock spikes), throwing the
  // small ones up. Her cycle does not move.
  // ---------------------------------------------------------------------------------------------------------------
  elementalis: {
    name: 'SEMBURAN ELEMEN',
    desc: 'KERUCUT ELEMEN AKTIF DARI TONGKAT; PENUH: LEBIH JAUH & LEBAR, UJUNGNYA MEKAR MELEDAK',
    charging({ p, scene }, t01, level, g) {
      const e = element(p);
      const [rim, body, lit] = ELEMENTS[e].c;
      const [ox, oy] = [p.x + p.facing * 9, p.y - 11];
      const now = scene.time.now;
      const r = 2 + t01 * 4 + (level === 2 ? Math.sin(now / 40) * 0.6 : 0);
      g.fillStyle(body, 0.2 + 0.15 * t01).fillCircle(ox, oy, r * 2);
      g.fillStyle(rim).fillCircle(ox, oy, r + 1);
      g.fillStyle(body).fillCircle(ox, oy, r);
      g.fillStyle(lit).fillCircle(ox - r * 0.3, oy - r * 0.3, r * 0.5);
      // The element gathering into it, each in its own way.
      for (let i = 0; i < 6; i++) {
        const k = (now / 500 + i / 6) % 1;
        const a = (i / 6) * Math.PI * 2 + now / 300;
        if (e === 0) g.fillStyle(i % 2 ? rim : body, 1 - k).fillRect(ox + Math.sin(i * 1.7 + k * 5) * (r + 2), oy - r - k * 14, 1, 1);
        else if (e === 1) g.fillStyle(lit, k).fillRect(ox + Math.cos(a) * (r + 10 * (1 - k)), oy + Math.sin(a) * (r + 10 * (1 - k)), 1, 1);
        else if (e === 2) {
          if (i < 3 && Math.random() < 0.6) {
            const pts = jag(ox, oy, ox + Math.cos(a * 3) * (r + 8), oy + Math.sin(a * 3) * (r + 8), 2);
            g.lineStyle(1, i % 2 ? lit : body).strokePoints(pts.map(([x, y]) => V(x, y)));
          }
        } else g.fillStyle(i % 2 ? rim : body).fillRect(ox + Math.cos(a) * (r + 5) - 1, oy + Math.sin(a) * (r + 3) - 1, 2, 2);
      }
      if (level >= 1) g.lineStyle(1, body, 0.6).strokeCircle(ox, oy, r + 5 + (level === 2 ? 2 : 0));
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return false;
      const e = element(p);
      const { c, status } = ELEMENTS[e];
      const [rim, body, lit] = c;
      const [range, half] = full ? [108, 0.46] : [72, 0.32];
      const f = p.facing;
      const [ox, oy] = [p.x + f * 9, p.y - 6];
      // Aim now: toward the nearest enemy ahead and in reach, tilted up (for flyers) or a little down.
      const mark = foes.find((t) => (t.x - ox) * f > 0 && Phaser.Math.Distance.Between(ox, oy, t.x, t.y) < range + 20);
      const tilt = mark ? Phaser.Math.Clamp(Math.atan2(mark.y - oy, Math.abs(mark.x - ox)), -1, 0.4) : 0;
      const a = f > 0 ? tilt : Math.PI - tilt;
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      const inCone = (t: Foe) => {
        const [vx, vy] = [t.x - ox, t.y - oy];
        const along = vx * dx + vy * dy;
        const side = Math.abs(-vx * dy + vy * dx);
        return t.active && along > -4 && along <= range + 6 && side <= Math.max(8, along * Math.tan(half));
      };
      const ticks = full ? 4 : 3;
      const lastMs = (ticks - 1) * 120;
      p.lock(lastMs + (full ? 240 : 140));
      p.setVelocityX(0);
      ring(scene, ox, oy, body, 3, 14, 240, 2);
      if (full) ring(scene, ox, oy, lit, 5, 22, 320);
      // The cone itself: a soft fan of the element over the spray, a brighter core, flickering.
      const cone = scene.add.graphics().setDepth(12);
      const fan = (r: number, h: number) => [
        V(ox, oy),
        ...Array.from({ length: 7 }, (_, i) => V(ox + Math.cos(a - h + (i / 6) * 2 * h) * r, oy + Math.sin(a - h + (i / 6) * 2 * h) * r)),
      ];
      const drawCone = () => {
        const fl = 0.85 + Math.random() * 0.3;
        cone.clear();
        cone.fillStyle(rim, 0.16).fillPoints(fan(range * fl, half), true);
        cone.fillStyle(body, 0.2).fillPoints(fan(range * 0.8 * fl, half * 0.6), true);
        cone.fillStyle(lit, 0.3).fillPoints(fan(range * 0.45, half * 0.3), true);
      };
      const until = scene.time.now + lastMs + 120;
      const spray = scene.time.addEvent({
        delay: 30,
        loop: true,
        callback: () => {
          if (scene.time.now > until) {
            spray.remove();
            return void scene.tweens.add({ targets: cone, alpha: 0, duration: 140, onComplete: () => cone.destroy() });
          }
          drawCone();
          // A burst of the element along a random line in the cone.
          for (let j = 0; j < 2; j++) {
            const pa = a + Phaser.Math.FloatBetween(-half, half);
            const d = range * Phaser.Math.FloatBetween(0.6, 1.05);
            const [ex, ey] = [ox + Math.cos(pa) * d, Math.min(FLOOR_Y - 1, oy + Math.sin(pa) * d)];
            if (e === 0) {
              // Fire: a flame blob, red rim over an orange body, swelling as it goes.
              for (const [col, r0] of [
                [rim, 3],
                [j ? body : lit, 1.5],
              ] as const) {
                const b = scene.add.circle(ox, oy, r0, col, col === rim ? 0.6 : 1).setDepth(13);
                scene.tweens.add({ targets: b, x: ex, y: ey, scale: 2.4, alpha: 0, duration: 280, onComplete: () => b.destroy() });
              }
            } else if (e === 1) {
              // Ice: a shard flung along the breath, trailing frost mist.
              const s = scene.add.image(ox, oy, 'iceshard').setRotation(pa).setDepth(13);
              scene.tweens.add({ targets: s, x: ex, y: ey, alpha: 0.2, duration: 240, onComplete: () => s.destroy() });
              const m = scene.add.circle(ox, oy, 2, lit, 0.4).setDepth(12);
              scene.tweens.add({
                targets: m,
                x: (ox + ex) / 2,
                y: (oy + ey) / 2,
                scale: 3,
                alpha: 0,
                duration: 300,
                onComplete: () => m.destroy(),
              });
            } else if (e === 2) {
              // Lightning: a forked arc, a blue glow under a white core, gone in a flicker.
              if (j) continue;
              const pts = jag(ox, oy, ex, ey, 5).map(([x, y]) => V(x, y));
              const bg = scene.add.graphics().setDepth(14);
              bg.lineStyle(3, rim, 0.45).strokePoints(pts);
              bg.lineStyle(1, Math.random() < 0.5 ? body : lit).strokePoints(pts);
              scene.tweens.add({ targets: bg, alpha: 0, duration: 110, onComplete: () => bg.destroy() });
            } else {
              // Earth: gravel and grit blasted out, with a plume of dust.
              const s = scene.add.rectangle(ox, oy, 2, 2, j ? rim : body).setDepth(13);
              scene.tweens.add({ targets: s, x: ex, y: ey, angle: 360, alpha: 0.3, duration: 220, onComplete: () => s.destroy() });
              const dust = scene.add.circle(ox, oy, 2, 0x5f574f, 0.35).setDepth(12);
              scene.tweens.add({ targets: dust, x: ex, y: ey, scale: 3, alpha: 0, duration: 320, onComplete: () => dust.destroy() });
            }
          }
        },
      });
      // The floor under the cone reacts where the torrent reaches it.
      const floorFx = (gx: number) => {
        if (e === 0) flameTongue(scene, gx, FLOOR_Y, Phaser.Math.Between(8, 14), 360, FIRE);
        else if (e === 1) {
          const sp = scene.add
            .triangle(gx, FLOOR_Y, -3, 0, 0, -8, 3, 0, 0xc2f0ff)
            .setOrigin(0)
            .setStrokeStyle(1, 0x29adff)
            .setScale(1, 0)
            .setDepth(9);
          scene.tweens.add({ targets: sp, scaleY: 1, duration: 90, yoyo: true, hold: 350, onComplete: () => sp.destroy() });
        } else if (e === 2) sparks(scene, gx, FLOOR_Y - 1, [0xffec27, 0xfff1e8], 5, 10);
        else rocks(scene, gx, FLOOR_Y, 2);
      };
      const reachesFloor = oy + Math.sin(a + half) * range > FLOOR_Y - 4;
      for (let i = 0; i < ticks; i++)
        later(scene, i * 120, () => {
          if (reachesFloor) floorFx(ox + f * Phaser.Math.Between(20, range - 8));
          for (const t of world.targets(ox, oy)) if (inCone(t)) world.strike(t, 1, 'basic', false, status, 70);
          scene.cameras.main.shake(50, 0.004);
        });
      if (!full) return;
      // Full: at the end of the torrent the element blooms.
      later(scene, lastMs + 100, () => {
        const [bx, by] = [Phaser.Math.Clamp(ox + dx * range, 6, W - 6), Math.min(FLOOR_Y - 6, oy + dy * range)];
        if (e === 0) {
          explosion(scene, bx, by, 24);
          for (const s of [-12, 0, 12]) flameTongue(scene, bx + s, Math.min(FLOOR_Y, by + 10), 18, 420, FIRE);
        } else if (e === 1) {
          for (let i = 0; i < 12; i++) {
            const sa = (i / 12) * Math.PI * 2;
            const s = scene.add.image(bx, by, 'iceshard').setRotation(sa).setDepth(13);
            scene.tweens.add({
              targets: s,
              x: bx + Math.cos(sa) * 34,
              y: by + Math.sin(sa) * 34,
              alpha: 0,
              duration: 340,
              onComplete: () => s.destroy(),
            });
          }
          const dome = scene.add.circle(bx, by, 4, 0xc2f0ff, 0.4).setStrokeStyle(2, 0xfff1e8).setDepth(12);
          scene.tweens.add({ targets: dome, radius: 32, alpha: 0, duration: 340, onComplete: () => dome.destroy() });
        } else if (e === 2) {
          const pts = jag(bx + Phaser.Math.Between(-10, 10), 0, bx, by, 6).map(([x, y]) => V(x, y));
          const bg = scene.add.graphics().setDepth(14);
          bg.lineStyle(7, 0x29adff, 0.35).strokePoints(pts);
          bg.lineStyle(3, 0xffec27).strokePoints(pts);
          bg.lineStyle(1, 0xfff1e8).strokePoints(pts);
          scene.tweens.add({ targets: bg, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => bg.destroy() });
          sparks(scene, bx, by, [0xffec27, 0xfff1e8, 0x29adff], 14, 30);
          scene.cameras.main.flash(60, 255, 241, 232);
        } else {
          // A crown of rock spikes bursts up out of the floor below the blast.
          for (const s of [-24, -14, -5, 5, 14, 24]) {
            const h = 20 - Math.abs(s) / 2;
            const sp = scene.add
              .triangle(bx + s, FLOOR_Y, -4, 0, Math.sign(s) * 2, -h, 4, 0, Math.abs(s) % 2 ? 0xab5236 : 0x5f574f)
              .setOrigin(0)
              .setStrokeStyle(1, 0x3b2418)
              .setScale(1, 0)
              .setDepth(9);
            scene.tweens.add({ targets: sp, scaleY: 1, duration: 90, yoyo: true, hold: 420, onComplete: () => sp.destroy() });
          }
          rocks(scene, bx, FLOOR_Y, 10);
        }
        ring(scene, bx, by, body, 6, 34, 300, 2);
        scene.cameras.main.shake(160, 0.016);
        const near = world.targets(bx, by).filter((o) => Phaser.Math.Distance.Between(bx, by, o.x, o.y) <= 32);
        world.area(bx, by, 32, 2, 220, 'basic', ELEMENTS[e].full);
        near.forEach((o) => toss(o, 190));
      });
    },
  },
};
