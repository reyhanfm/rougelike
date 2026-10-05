import Phaser from 'phaser';
import { FLOOR_Y, W, cutMark } from '../../gfx/ui.ts';
import type { ClassId } from '../../logic/classes.ts';
import {
  HELL,
  HOLY,
  SPECTRUM,
  TWILIGHT,
  bestLine,
  explosion,
  glint,
  jag,
  later,
  moonPhase,
  onLine,
  solarBeam,
  ring,
  rocks,
  sparks,
  sunDisc,
  twilightWings,
} from '../skills.ts';
import type { ChargedAttack } from './types.ts';

type Foe = Phaser.GameObjects.Sprite;
type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
const dist = (x: number, y: number, t: { x: number; y: number }) => Phaser.Math.Distance.Between(x, y, t.x, t.y);
/** Angle of (x, y) seen from (ox, oy), mirrored so 0 is straight ahead for a hero facing `f` and negative is up. */
const rel = (ox: number, oy: number, f: number, x: number, y: number) => Math.atan2(y - oy, (x - ox) * f);
/** World angle of a mirrored angle `a` (the inverse of `rel`). */
const wa = (f: number, a: number) => (f > 0 ? a : Math.PI - a);
/** Throws small fry up; bosses and elites are too heavy. */
function lift(t: Foe, v: number): void {
  if (t.active && !('tier' in t) && !t.getData('elite')) (t as Phaser.Physics.Arcade.Sprite).setVelocityY(-v);
}
/** How far a ray from (x, y) along `a` runs before it meets a wall, the ceiling or the floor. */
function toEdge(x: number, y: number, a: number): number {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  let d = 600;
  if (c > 1e-3) d = Math.min(d, (W - x) / c);
  else if (c < -1e-3) d = Math.min(d, -x / c);
  if (s > 1e-3) d = Math.min(d, (FLOOR_Y - y) / s);
  else if (s < -1e-3) d = Math.min(d, -y / s);
  return d;
}

/** Lightning drawn into `g` along `pts`: a cyan fringe, a gold body and (width >= 1) a white-hot core. */
function crackle(g: G, pts: [number, number][], width: number, alpha = 1): void {
  for (const [w, c, a] of [
    [2 + width * 2, 0x7fe6ff, 0.35],
    [1 + width, 0xffec27, 1],
    [width, 0xfff1e8, 1],
  ] as const) {
    if (!w) continue;
    g.lineStyle(w, c, a * alpha)
      .beginPath()
      .moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.strokePath();
  }
}

/** A blade-feather of the Nephalem flying from (x, y) along `a` for `d` px: white and gold (holy) or crimson (hell). */
function featherBlade(scene: Phaser.Scene, x: number, y: number, a: number, d: number, holy: boolean, big: boolean): void {
  const L = big ? 11 : 7;
  const [rim, body, edge] = holy ? [0x83769c, 0xfff1e8, HOLY] : [0x1d0f2e, 0x7a2230, HELL];
  const leaf = (k: number) => [V(-L / 2, 0), V(-L / 4, -2 * k), V(L / 4, -2 * k), V(L / 2 + k - 1, 0), V(L / 4, 2 * k), V(-L / 4, 2 * k)];
  const g = scene.add.graphics();
  // A glowing streak behind, the outlined vane, the rachis in its color and a hot white point.
  g.fillStyle(edge, 0.35).fillRect(-L / 2 - 9, -0.5, 9, 1);
  g.fillStyle(rim).fillPoints(leaf(1.4), true);
  g.fillStyle(body).fillPoints(leaf(1), true);
  g.lineStyle(1, edge).lineBetween(-L / 2 - 1, 0, L / 2, 0);
  g.fillStyle(0xfff1e8).fillRect(L / 2 - 1, -0.5, 1, 1);
  const c = scene.add.container(x, y, [g]).setRotation(a).setDepth(14);
  const ms = (d / FEATHER_SPEED) * 1000;
  scene.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, duration: ms });
  scene.tweens.add({ targets: c, alpha: 0, delay: ms - 60, duration: 120, onComplete: () => c.destroy() });
}
const FEATHER_SPEED = 420;

/**
 * One of the Nephalem's wings drawn huge along +x from its root: the angel's (six white primaries with gold tips fanned
 * under a gold arm) or the demon's (three finger bones, a scalloped crimson membrane, a white claw).
 */
function greatWing(g: G, holy: boolean, L: number): void {
  if (holy) {
    for (let k = 5; k >= 0; k--) {
      const a = -0.08 + k * 0.08;
      const l = L * (1 - k * 0.11);
      const [tx, ty] = [Math.cos(a) * l, Math.sin(a) * l];
      g.fillStyle(0x83769c).fillTriangle(0, -3.5, 0, 3.5, tx * 1.04, ty * 1.04 + 0.5);
      g.fillStyle(0xfff1e8).fillTriangle(0, -2.5, 0, 2.5, tx, ty);
      g.fillStyle(HOLY).fillCircle(tx * 0.93, ty * 0.93, 1.5);
    }
    g.lineStyle(2, HOLY).lineBetween(0, -1, L * 0.55, -3);
    g.fillStyle(HOLY, 0.25).fillEllipse(L * 0.5, 2, L * 1.1, 14);
    return;
  }
  const bones = [-0.12, 0.12, 0.38].map((b, i) => V(Math.cos(b) * L * [1, 0.82, 0.6][i], Math.sin(b) * L * [1, 0.82, 0.6][i]));
  const pts = [V(0, -2)];
  bones.forEach((b, i) => {
    pts.push(b);
    const n = bones[i + 1];
    if (n) pts.push(V((b.x + n.x) * 0.4, (b.y + n.y) * 0.4));
  });
  pts.push(V(2, 5));
  g.fillStyle(HELL, 0.25).fillPoints(
    pts.map((v) => V(v.x * 1.08, v.y * 1.25)),
    true,
  );
  g.fillStyle(0x7a2230).fillPoints(pts, true);
  g.lineStyle(1, 0x1d0f2e).strokePoints(pts, true);
  for (const b of bones) g.lineStyle(1, 0x3b1a2a).lineBetween(0, 0, b.x, b.y);
  g.lineStyle(1, HELL).lineBetween(0, -2, bones[0].x, bones[0].y);
  g.fillStyle(0xfff1e8).fillRect(bones[0].x, bones[0].y - 1, 2, 1);
}

/** Charged attacks (TAHAN J) of: lightningLord, nephalem, lumina, surya, candra. Contract and damage budget: see types.ts. */
export const BATCH_6: Partial<Record<ClassId, ChargedAttack>> = {
  // Tebasan Plasma (Plasma Cleave): the Lightning Lord raises Vajra Badai as a lightning rod and lets the storm feed it
  // until the halberd's head is a knot of white plasma. On release the plasma runs out along the blade into an edge of
  // living lightning several times the halberd's length, and he brings it round in one great arc from behind his
  // shoulder, over his head (flyers too), down into the floor ahead, which it splits in sparks and stone.
  // Full charge: his stored STATIK is poured into the blade (each charge makes it longer), and after the downstroke
  // he rips it back up through the same arc, hurling everything it catches into the air.
  // Not the suggested hammer slam: his dive already drops a lightning pillar with arcs running both ways along the
  // floor, and his ult ends in floor cracks to both walls, so his hold attack is a sweep through the air instead.
  lightningLord: {
    name: 'TEBASAN PLASMA',
    desc: 'BILAH PETIR RAKSASA MENYAPU DARI BELAKANG, ATAS, KE LANTAI; PENUH: STATIK + SAPUAN BALIK',
    // The storm answers the raised halberd: leaders crackle down out of the sky onto its head, more and more often,
    // and the head swells into a knot of plasma; at full charge arcs also run down the shaft to the floor.
    charging({ p, scene }, t01, level, g) {
      const [hx, hy] = [p.x + p.facing * 5, p.y - 16];
      const r = 2 + t01 * 3 + Math.sin(scene.time.now / (level === 2 ? 30 : 70)) * 0.6;
      g.fillStyle(0x7fe6ff, 0.25).fillCircle(hx, hy, r + 3);
      g.fillStyle(0xffec27).fillCircle(hx, hy, r);
      g.fillStyle(0xfff1e8).fillCircle(hx, hy, r * 0.5);
      if (Math.random() < 0.15 + 0.45 * t01) crackle(g, jag(hx + Phaser.Math.Between(-40, 40), 0, hx, hy - r, 6), level ? 1 : 0, 0.9);
      if (level === 2 && Math.random() < 0.5) crackle(g, jag(hx, hy, hx + Phaser.Math.Between(-8, 8), FLOOR_Y, 3), 0, 0.8);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x, p.y - 3];
      const stat = full ? ((p.getData('static') as number | undefined) ?? 0) : 0;
      const R = (full ? 92 : 64) + stat * 6;
      const [A0, A1] = [-2.3, 0.75];
      const ahead = (t: Foe) => dist(ox, oy, t) < 16 && (t.x - ox) * f > -4;
      const inArc = (t: Foe) => {
        const a = rel(ox, oy, f, t.x, t.y);
        return (a >= A0 - 0.1 && a <= A1 && dist(ox, oy, t) <= R + 6) || ahead(t);
      };
      if (!world.targets(ox, oy).some(inArc)) return false;
      // The STATIK pours into the blade: the pips over his crown are spent (staticCrown redraws from this).
      if (stat) {
        p.setData('static', 0);
        sparks(scene, ox, oy - 12, [0xffec27, 0x7fe6ff, 0xfff1e8], stat * 2, 14);
      }
      p.setVelocityX(0);
      p.lock(full ? 560 : 300);
      p.invuln(full ? 560 : 300);
      const cam = scene.cameras.main;
      const reach = (a: number) => (Math.sin(a) > 0 ? Math.min(R, (FLOOR_Y - 1 - oy) / Math.sin(a)) : R);
      const at = (a: number, d: number): [number, number] => [ox + f * Math.cos(a) * d, oy + Math.sin(a) * d];

      // One stroke of the plasma blade from angle `from` to `to`: the blade is redrawn every frame with the arc it
      // has just swept glowing behind it, and whatever the arc passes is struck once.
      const stroke = (from: number, to: number, ms: number, ease: string, hit: (t: Foe) => void, done: () => void) => {
        const g = scene.add.graphics().setDepth(14);
        const struck = new Set<Foe>();
        const dir = Math.sign(to - from);
        scene.tweens.addCounter({
          from,
          to,
          duration: ms,
          ease,
          onUpdate: (tw) => {
            const a = tw.getValue() ?? from;
            const tail = Phaser.Math.Clamp(a - dir * 1.1, Math.min(from, to), Math.max(from, to));
            const arc = Array.from({ length: 11 }, (_, i) => V(...at(tail + ((a - tail) * i) / 10, reach(tail + ((a - tail) * i) / 10))));
            g.clear();
            g.fillStyle(0x7fe6ff, 0.14).fillPoints([V(ox, oy), ...arc], true);
            g.lineStyle(1, 0xffec27, 0.6).strokePoints(arc);
            crackle(g, jag(...at(a, 6), ...at(a, reach(a)), 3), 2);
            g.fillStyle(0xfff1e8).fillCircle(...at(a, reach(a)), 2);
            for (const t of world.targets(ox, oy)) {
              if (struck.has(t) || !t.active) continue;
              const ta = rel(ox, oy, f, t.x, t.y);
              const swept = dir > 0 ? ta >= from - 0.1 && ta <= a : ta <= from + 0.1 && ta >= a;
              if ((swept && dist(ox, oy, t) <= R + 6) || ahead(t)) {
                struck.add(t);
                hit(t);
              }
            }
          },
          onComplete: () => {
            scene.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
            done();
          },
        });
      };

      // The downstroke: from behind his shoulder, over his head, into the floor ahead.
      stroke(
        A0,
        A1,
        full ? 240 : 270,
        'Quad.In',
        (t) => {
          world.strike(t, full ? 2.7 : 3, 'basic', false, { freeze: full ? 300 : 250 }, 160);
          cutMark(scene, t.x, t.y, 0xffec27);
          sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8, 0x7fe6ff], 6, 14);
          cam.shake(50, 0.005);
        },
        () => {
          // The blade bites the floor: stone and sparks fly and the crack glows.
          const [fx] = at(A1, reach(A1));
          rocks(scene, fx, FLOOR_Y, full ? 6 : 4);
          sparks(scene, fx, FLOOR_Y - 2, [0xffec27, 0xfff1e8, 0x7fe6ff], 12, 22);
          ring(scene, fx, FLOOR_Y - 2, 0xffec27, 3, 20, 220, 2);
          cam.shake(90, 0.008);
          if (!full) return;
          // Full: the blade is ripped back up through the same arc, hurling everything it meets skyward.
          let first = true;
          later(scene, 40, () =>
            stroke(
              A1,
              -1.9,
              230,
              'Quad.Out',
              (t) => {
                if (first) cam.flash(70, 255, 236, 39);
                first = false;
                world.strike(t, 2.7, 'basic', false, { freeze: 200 }, 120);
                lift(t, 240);
                cutMark(scene, t.x, t.y, 0x7fe6ff);
                ring(scene, t.x, t.y, 0xfff1e8, 3, 18, 200, 1);
                cam.shake(60, 0.006);
              },
              () => undefined,
            ),
          );
        },
      );
    },
  },

  // Badai Bulu Senja (Twilight Feather Storm): the Nephalem folds both wings around himself, the white and the black,
  // and twilight light leaks out between them as he gathers. On release they burst open and loose a fan of blade-
  // feathers: gold feathers of light that slow and crimson feathers of hellfire that burn, one of them aimed true at
  // each enemy in the fan, flyers above him included.
  // Full charge: a wider, longer storm, and then the wings themselves come forward as giant blades and shut on each
  // other in front of him like shears, the angel's wing chopping down onto the demon's, throwing what is caught up.
  nephalem: {
    name: 'BADAI BULU SENJA',
    desc: 'SAYAP TERBUKA, KIPAS BULU CAHAYA & API MENEBAS KE DEPAN; PENUH: SAYAP RAKSASA MENGGUNTING',
    // The wings fold around him, closing tighter as the charge grows, with twilight seeping out of the seam.
    charging({ p, scene }, t01, level, g) {
      const pulse = Math.sin(scene.time.now / (level === 2 ? 40 : 90));
      g.fillStyle(TWILIGHT, 0.15 + 0.2 * t01).fillEllipse(p.x, p.y - 2, 12 + pulse, 20 + 4 * t01);
      g.save();
      g.translateCanvas(p.x, p.y - 4);
      g.scaleCanvas(1 - 0.55 * t01, 1);
      twilightWings(g, p.flipX ? 1 : -1, 10 + t01 * 5, -0.6 * t01);
      g.restore();
      if (level) g.lineStyle(1, 0xfff1e8, 0.4 + 0.3 * pulse).lineBetween(p.x, p.y - 12, p.x, p.y + 6);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x, p.y - 4];
      const range = full ? 170 : 115;
      const [lo, hi] = full ? [-0.85, 0.5] : [-0.55, 0.4];
      const inFan = (t: Foe) => {
        const a = rel(ox, oy, f, t.x, t.y);
        return a >= lo && a <= hi && dist(ox, oy, t) <= range;
      };
      const inShears = (t: Foe) => (t.x - ox) * f >= -6 && (t.x - ox) * f <= 54 && t.y - oy >= -34 && t.y - oy <= 16;
      const foes = world.targets(ox, oy).filter(inFan);
      if (!foes.length && !(full && world.targets(ox, oy).some(inShears))) return false;
      p.setVelocityX(0);
      p.lock(full ? 480 : 220);
      p.invuln(full ? 480 : 220);
      const cam = scene.cameras.main;
      // The wings burst open.
      ring(scene, ox, oy, TWILIGHT, 4, 28, 260, 2);
      sparks(scene, ox, oy, [HOLY, HELL, 0xfff1e8], 12, 24);
      // The storm: an even fan of feathers, gold and crimson in turn...
      const n = full ? 15 : 9;
      // (the low ones stop at the floor instead of flying on through the ground)
      for (let i = 0; i < n; i++) {
        const a = wa(f, lo + ((hi - lo) * i) / (n - 1));
        featherBlade(scene, ox, oy, a, Math.min(range, toEdge(ox, oy, a)), i % 2 === 0, false);
      }
      // ...and one great feather aimed at each enemy, which is what cuts it.
      foes.forEach((t, i) => {
        const holy = i % 2 === 0;
        const d = dist(ox, oy, t);
        featherBlade(scene, ox, oy, Phaser.Math.Angle.Between(ox, oy, t.x, t.y), d, holy, true);
        later(scene, (d / FEATHER_SPEED) * 1000, () => {
          if (!t.active) return;
          world.strike(t, 3, 'basic', false, holy ? { slow: 800 } : { burn: 0.15 }, 120);
          cutMark(scene, t.x, t.y, holy ? HOLY : HELL);
          cam.shake(40, 0.004);
        });
      });
      if (!full) return;
      // The shears: both wings, huge, swing forward and shut in front of him.
      const [px, py] = [p.x, p.y - 6];
      const wings = ([true, false] as const).map((holy) => {
        const g = scene.add.graphics();
        greatWing(g, holy, 50);
        return scene.add
          .container(px, py, [g])
          .setDepth(13)
          .setScale(1, holy ? f : -f)
          .setRotation(wa(f, holy ? -1.25 : 0.1));
      });
      const SHUT = 300;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: 140,
        duration: SHUT - 140,
        ease: 'Cubic.In',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          wings[0].setRotation(wa(f, -1.25 + 1.19 * k));
          wings[1].setRotation(wa(f, 0.1 - 0.04 * k));
        },
      });
      later(scene, SHUT, () => {
        // They meet: a twilight cut along the seam, and everything between them is thrown up.
        cam.flash(70, 192, 128, 255);
        cam.shake(120, 0.01);
        const [sx, sy] = [px + f * 28, py];
        const seam = [scene.add.rectangle(sx, sy, 56, 5, TWILIGHT, 0.5), scene.add.rectangle(sx, sy, 56, 1, 0xfff1e8)];
        seam.forEach((r) => r.setDepth(14));
        scene.tweens.add({
          targets: seam,
          scaleY: 0,
          alpha: 0,
          delay: 80,
          duration: 220,
          onComplete: () => seam.forEach((r) => r.destroy()),
        });
        sparks(scene, sx, sy, [HOLY, HELL, TWILIGHT, 0xfff1e8], 16, 30);
        for (const t of world.targets(ox, oy)) {
          if (!t.active || !inShears(t)) continue;
          world.strike(t, 2.8, 'basic', false, { burn: 0.15 }, 200);
          lift(t, 240);
          cutMark(scene, t.x, t.y, TWILIGHT, 30, 0);
        }
        scene.tweens.add({ targets: wings, alpha: 0, scaleX: 1.15, duration: 260, onComplete: () => wings.forEach((w) => w.destroy()) });
      });
    },
  },

  // Sinar Prisma (Prism Ray): Lumina runs dispersion backwards. Seven rays, red through violet, bend in from behind her
  // into a small prism of hard light at her hand and recombine there into one coherent white laser, which she fires
  // along the line that crosses the most enemies ahead (air or ground) and which pierces to the wall.
  // Full charge: a thick laser that she sweeps from high in the sky down to the floor ahead, cutting everything in
  // front of her; then the prism overloads and every enemy it crossed bursts in refracted light and is thrown up.
  // Changed from the suggested lens: her ult (Fajar Semesta) already focuses light through a giant lens, so the hold
  // attack recombines it through a prism instead (her mirrors split light, this gathers it).
  lumina: {
    name: 'SINAR PRISMA',
    desc: 'PELANGI DISATUKAN PRISMA JADI LASER MENEMBUS BARISAN; PENUH: LASER TEBAL MENYAPU & MELEDAK',
    // The spectrum converging: seven colored rays bend in from behind her into the prism at her hand, photons running
    // along them; once charged a white stub of the laser already flickers out of its point.
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const f = p.facing;
      const [px, py] = [p.x + f * 9, p.y - 3];
      const R = 30 - t01 * 12;
      SPECTRUM.forEach((c, i) => {
        const b = wa(f, Math.PI + (i - 3) * 0.38);
        const [sx, sy] = [px + Math.cos(b) * R, py + Math.sin(b) * R + Math.sin(now / 120 + i) * 2];
        g.lineStyle(1, c, 0.35 + 0.5 * t01).lineBetween(sx, sy, px, py);
        const k = (now / 300 + i / 7) % 1;
        g.fillStyle(0xfff1e8).fillRect(sx + (px - sx) * k, sy + (py - sy) * k, 1, 1);
      });
      g.fillStyle(0xc2f0ff, 0.75).fillTriangle(px - f * 3, py - 4, px - f * 3, py + 4, px + f * 4, py);
      g.lineStyle(1, 0x29adff).strokeTriangle(px - f * 3, py - 4, px - f * 3, py + 4, px + f * 4, py);
      g.lineStyle(1, 0xffffff).lineBetween(px - f * 2, py - 2, px, py + 1);
      if (level)
        g.lineStyle(level === 2 ? 2 : 1, 0xfff1e8, 0.6 + Math.random() * 0.4).lineBetween(px + f * 4, py, px + f * (8 + 8 * t01), py);
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x + f * 9, p.y - 3];
      const cam = scene.cameras.main;
      const ahead = world.targets(ox, oy).filter((t) => (t.x - ox) * f > -4);
      if (!full) {
        const cone = ahead.filter((t) => Math.abs(rel(ox, oy, f, t.x, t.y)) <= 0.6);
        if (!cone.length) return false;
        glint(scene, ox, oy);
        p.setVelocityX(0);
        p.lock(260);
        // Aimed as it fires, along the line through the most enemies.
        const a = bestLine(cone, ox, oy, 7, wa(f, 0));
        const len = toEdge(ox, oy, a);
        // The laser: a cyan glow, a red and a violet fringe, a pale body and a white core, with a flare at the prism.
        const g = scene.add.graphics();
        g.fillStyle(0x7fe6ff, 0.22).fillRect(0, -6, len, 12);
        g.fillStyle(0xff004d).fillRect(0, -3, len, 1);
        g.fillStyle(0x8a3fd1).fillRect(0, 2, len, 1);
        g.fillStyle(0xc2f0ff).fillRect(0, -2, len, 4);
        g.fillStyle(0xfff1e8).fillRect(0, -1, len, 2);
        g.fillStyle(0x7fe6ff, 0.4).fillCircle(0, 0, 7);
        g.fillStyle(0xfff1e8).fillCircle(0, 0, 4);
        const beam = scene.add.container(ox, oy, [g]).setRotation(a).setDepth(13).setScale(1, 0.2);
        scene.tweens.add({ targets: beam, scaleY: 1, duration: 60 });
        scene.tweens.add({ targets: beam, scaleY: 0, alpha: 0, delay: 240, duration: 200, onComplete: () => beam.destroy() });
        const [ex, ey] = [ox + Math.cos(a) * len, oy + Math.sin(a) * len];
        sparks(scene, ex, ey, [...SPECTRUM], 10, 18);
        ring(scene, ex, ey, 0xc2f0ff, 3, 16, 220, 1);
        cam.shake(80, 0.005);
        for (const t of world.targets(ox, oy)) {
          if (!onLine(ox, oy, a, len, t, 8)) continue;
          world.strike(t, 3, 'basic', false, undefined, 140);
          sparks(scene, t.x, t.y, [...SPECTRUM], 7, 14);
        }
        return;
      }
      if (!ahead.length) return false;
      glint(scene, ox, oy);
      p.setVelocityX(0);
      p.lock(540);
      p.invuln(540);
      // The sweep: the thick laser comes down from high in the sky to the floor ahead, striking what it crosses.
      const g = scene.add.graphics().setDepth(13);
      const struck: Foe[] = [];
      let prev = -1.05;
      const trail: number[] = [];
      scene.tweens.addCounter({
        from: -1.05,
        to: 0.55,
        duration: 480,
        ease: 'Sine.InOut',
        onUpdate: (tw) => {
          const r = tw.getValue() ?? 0;
          const a = wa(f, r);
          const len = toEdge(ox, oy, a);
          const [ex, ey] = [ox + Math.cos(a) * len, oy + Math.sin(a) * len];
          const [nx, ny] = [-Math.sin(a) * 4, Math.cos(a) * 4];
          g.clear();
          for (const [k, tr] of trail.entries()) {
            const ta = wa(f, tr);
            const tl = toEdge(ox, oy, ta);
            g.lineStyle(3, 0x7fe6ff, 0.12 + k * 0.06).lineBetween(ox, oy, ox + Math.cos(ta) * tl, oy + Math.sin(ta) * tl);
          }
          g.lineStyle(14, 0x7fe6ff, 0.22).lineBetween(ox, oy, ex, ey);
          g.lineStyle(1, 0xff004d).lineBetween(ox + nx, oy + ny, ex + nx, ey + ny);
          g.lineStyle(1, 0x8a3fd1).lineBetween(ox - nx, oy - ny, ex - nx, ey - ny);
          g.lineStyle(6, 0xc2f0ff).lineBetween(ox, oy, ex, ey);
          g.lineStyle(2, 0xfff1e8).lineBetween(ox, oy, ex, ey);
          g.fillStyle(0xfff1e8).fillCircle(ox, oy, 4).fillCircle(ex, ey, 3);
          if (Math.random() < 0.4) sparks(scene, ex, ey, [...SPECTRUM], 3, 10);
          trail.push(r);
          if (trail.length > 3) trail.shift();
          // Whatever lies between the last frame's angle and this one is crossed by the beam.
          for (const t of world.targets(ox, oy)) {
            if (!t.active || struck.includes(t)) continue;
            const d = dist(ox, oy, t);
            const ta = rel(ox, oy, f, t.x, t.y);
            const tol = 10 / Math.max(d, 10);
            if (ta < prev - tol || ta > r + tol || d > toEdge(ox, oy, wa(f, ta)) + 8) continue;
            struck.push(t);
            world.strike(t, 3, 'basic', false, undefined, 60);
            sparks(scene, t.x, t.y, [...SPECTRUM], 7, 14);
            cam.shake(40, 0.004);
          }
          prev = r;
        },
        onComplete: () => {
          scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
          if (!struck.length) return;
          // The prism overloads: every enemy the beam crossed bursts in refracted light, one after another.
          cam.flash(80, 255, 255, 255);
          struck.forEach((t, i) =>
            later(scene, 60 + i * 45, () => {
              if (!t.active) return;
              [0xff004d, 0x00e436, 0x8a3fd1].forEach((c, k) => ring(scene, t.x, t.y, c, 2 + k * 2, 14 + k * 6, 260, 1));
              sparks(scene, t.x, t.y, [...SPECTRUM], 12, 20);
              world.strike(t, 2.6, 'basic', false, undefined, 160);
              lift(t, 220);
              cam.shake(60, 0.006);
            }),
          );
        },
      });
    },
  },

  // Piringan Surya (Sun Disc): the sun-disc halo that always turns behind Surya's head is the sun's own fire. As he
  // charges it spins faster and swells, its rays lengthening, embers drawn into it. On release he tears it free and
  // flings it, a spinning saw of sunfire, at the nearest enemy ahead (in the air too): it saws through every body on
  // its line, setting each alight, and burns out in a shower of embers.
  // Full charge: a disc twice the size, flung at the thickest crowd ahead. It sets down on them and grinds there,
  // spinning, dragging small fry in under its teeth, until it can hold no more and bursts like a little sun: rays
  // shoot out all around and everything caught is blown into the air.
  // Changed from the suggested planted sword + marching flare columns: Ksatria's CALIBURN (batch 1) already plants a
  // sword and marches blades along the floor, so Surya throws his halo instead.
  surya: {
    name: 'PIRINGAN SURYA',
    desc: 'HALO MATAHARI DILEMPAR, BERPUTAR MENGGERGAJI; PENUH: MENGGILAS KERUMUNAN LALU MELEDAK',
    // The halo behind his head spins up and swells, rays lengthening, embers streaming into it.
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const [hx, hy] = [p.x, p.y - 6];
      const r = 8 + t01 * 4;
      const spin = now / (level === 2 ? 90 : 160);
      g.fillStyle(0xff004d, 0.12 + 0.12 * t01).fillCircle(hx, hy, r * 1.6);
      for (let i = 0; i < 12; i++) {
        const a = spin + (i / 12) * Math.PI * 2;
        const l = r + (i % 2 ? 4 : 7) * (1 + t01) + (level === 2 ? Math.sin(now / 40 + i) : 0);
        g.fillStyle(i % 2 ? 0xffa300 : 0xffec27).fillTriangle(
          hx + Math.cos(a - 0.16) * r,
          hy + Math.sin(a - 0.16) * r,
          hx + Math.cos(a + 0.16) * r,
          hy + Math.sin(a + 0.16) * r,
          hx + Math.cos(a) * l,
          hy + Math.sin(a) * l,
        );
      }
      g.lineStyle(1, 0x7e2553).strokeCircle(hx, hy, r);
      g.lineStyle(1, 0xff8a1f).strokeCircle(hx, hy, r - 1);
      if (level) g.lineStyle(1, 0xfff1e8, 0.4 + 0.3 * t01).strokeCircle(hx, hy, r - 2);
      for (let i = 0; i < 6; i++) {
        const k = (now / 400 + i / 6) % 1;
        const [a, d] = [i * 1.3 + 0.7, r + 24 * (1 - k)];
        g.fillStyle(i % 2 ? 0xffec27 : 0xff8a1f, k).fillRect(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 1, 1);
      }
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const [ox, oy] = [p.x, p.y - 6];
      const cam = scene.cameras.main;
      const range = full ? 230 : 170;
      const ahead = world.targets(ox, oy).filter((t) => {
        const a = rel(ox, oy, f, t.x, t.y);
        return a >= (full ? -1.2 : -0.7) && a <= 0.6 && dist(ox, oy, t) <= range;
      });
      if (!ahead.length) return false;
      p.setVelocityX(0);
      p.lock(full ? 300 : 200);
      p.invuln(full ? 300 : 200);
      // Aimed as it leaves: the nearest enemy ahead, or (full) the one with the most others around it.
      const crowd = (t: Foe) => ahead.filter((o) => dist(t.x, t.y, o) < 40).length;
      const mark = full ? ahead.reduce((b, t) => (crowd(t) > crowd(b) ? t : b)) : ahead[0];
      const a = Phaser.Math.Angle.Between(ox, oy, mark.x, mark.y);
      const len = full ? dist(ox, oy, mark) : Math.min(toEdge(ox, oy, a), range);
      const R = full ? 14 : 10;
      // The halo tears free with a flare.
      const disc = sunDisc(scene, ox, oy, full ? 10 : 6)
        .setDepth(14)
        .setScale(0.5);
      scene.tweens.add({ targets: disc, angle: f * 360, duration: full ? 260 : 380, repeat: -1 });
      ring(scene, ox, oy, 0xffec27, 4, 20, 220, 2);
      sparks(scene, ox, oy, [0xffec27, 0xffa300, 0xfff1e8], 8, 16);
      const gone = (ms: number) =>
        scene.tweens.add({
          targets: disc,
          alpha: 0,
          scale: 0.3,
          duration: ms,
          onComplete: () => (scene.tweens.killTweensOf(disc), disc.destroy()),
        });
      // The saw: whatever the disc's teeth pass through is cut once and set alight.
      const struck = new Set<Foe>();
      const saw = (x: number, y: number) => {
        for (const t of world.targets(x, y)) {
          if (struck.has(t) || !t.active || dist(x, y, t) > R) continue;
          struck.add(t);
          world.strike(t, 3, 'basic', false, { burn: 0.25 }, 80);
          cutMark(scene, t.x, t.y, 0xffa300);
          sparks(scene, t.x, t.y, [0xffec27, 0xffa300, 0xff004d], 6, 14);
          cam.shake(40, 0.004);
        }
      };
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: (len / (full ? 600 : 450)) * 1000,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const [x, y] = [ox + Math.cos(a) * len * k, oy + Math.sin(a) * len * k];
          disc.setPosition(x, y).setScale(Math.min(1, 0.5 + k * 3));
          sparks(scene, x, y, [0xffa300, 0xff004d], 1, 6);
          saw(x, y);
        },
        onComplete: () => {
          if (!full) {
            sparks(scene, disc.x, disc.y, [0xffec27, 0xffa300, 0xff004d], 10, 18);
            return void gone(200);
          }
          // Full: it sets down on the crowd and grinds, dragging small fry in under its teeth.
          const [mx, my] = [disc.x, disc.y];
          world.pull(mx, my, 44, 90);
          cam.shake(380, 0.004);
          const grind = scene.time.addEvent({
            delay: 50,
            loop: true,
            callback: () => {
              disc.setPosition(mx + Phaser.Math.Between(-1, 1), my + Phaser.Math.Between(-1, 1));
              sparks(scene, mx, my, [0xffec27, 0xffa300, 0xfff1e8], 3, 18);
            },
          });
          later(scene, 380, () => {
            // It bursts like a little sun: rays all around, and everything caught is blown into the air.
            grind.remove();
            cam.flash(90, 255, 163, 0);
            cam.shake(160, 0.012);
            for (let i = 0; i < 12; i++) {
              const b = (i / 12) * Math.PI * 2;
              solarBeam(scene, mx, my, mx + Math.cos(b) * 46, my + Math.sin(b) * 46, 300);
            }
            explosion(scene, mx, my, 18);
            ring(scene, mx, my, 0xffec27, 8, 50, 360, 2);
            ring(scene, mx, my, 0xff8a1f, 4, 38, 300, 1);
            for (const t of world.targets(mx, my)) {
              if (!t.active || dist(mx, my, t) > 46) continue;
              world.strike(t, 2.8, 'basic', false, { burn: 0.3 }, 180);
              lift(t, 240);
            }
            gone(120);
          });
        },
      });
    },
  },

  // Pilar Rembulan (Moonbeam Pillar): Candra calls down the light of the moon over his head. A thread of moonlight
  // reaches down to him while he charges; on release a moon rises high in the sky, in the same phase as his own, and
  // drops a pillar of silver light to the floor that sweeps ahead of him, top to bottom, striking and chilling
  // everything it passes (flyers too). FASE BULAN sets its strength: the fuller his moon, the wider and harder the
  // pillar. It only reads the phase; spending the moon is Sabit Candra's (his skill).
  // Full charge: the pillar sweeps all the way to the wall, lifting what it touches as the moon's pull takes hold,
  // then comes back to him, cutting a second time.
  candra: {
    name: 'PILAR REMBULAN',
    desc: 'PILAR CAHAYA BULAN MENYAPU MAJU, MAKIN PURNAMA MAKIN KUAT; PENUH: KE DINDING & KEMBALI',
    // A thread of moonlight from the top of the sky onto the moon over his head, widening, with silver motes drifting
    // down along it, and the halo of his moon growing.
    charging({ p, scene }, t01, level, g) {
      const now = scene.time.now;
      const [mx, my] = [p.x, p.y - 22];
      const w = 1 + t01 * 4;
      g.fillStyle(0x9fb4ff, 0.12 + 0.15 * t01).fillRect(mx - w - 2, 0, (w + 2) * 2, my - 6);
      g.fillStyle(0xe6ecff, 0.35 + 0.4 * t01).fillRect(mx - w / 2, 0, w, my - 6);
      for (let i = 0; i < 6; i++) {
        const k = (now / 700 + i / 6) % 1;
        g.fillStyle(0xfff1e8, 1 - k * 0.6).fillRect(mx + Math.sin(now / 150 + i) * w, k * (my - 6), 1, 1);
      }
      g.lineStyle(1, 0xc2d4ff, 0.3 + 0.5 * t01).strokeCircle(mx, my, 6 + t01 * 4 + Math.sin(now / (level === 2 ? 40 : 100)));
      if (level === 2) g.lineStyle(1, 0xfff1e8, 0.5).strokeCircle(mx, my, 12 + Math.sin(now / 40));
    },
    fire({ p, world, scene }, level) {
      const full = level === 2;
      const f = p.facing;
      const phase = (p.getData('moon') as number | undefined) ?? 0;
      const w = 10 + phase * 3 + (full ? 4 : 0);
      const x0 = Phaser.Math.Clamp(p.x + f * 14, 6, W - 6);
      const x1 = full ? (f > 0 ? W - 10 : 10) : Phaser.Math.Clamp(p.x + f * 120, 6, W - 6);
      const [lo, hi] = [Math.min(x0, x1) - w / 2 - 3, Math.max(x0, x1) + w / 2 + 3];
      if (!world.targets(p.x, p.y).some((t) => t.x >= lo && t.x <= hi)) return false;
      p.setVelocityX(0);
      p.lock(full ? 320 : 220);
      p.invuln(full ? 320 : 220);
      const cam = scene.cameras.main;
      // The moon in the sky, in his moon's phase (never quite dark: even a new moon gives a sliver of light).
      const r = full ? 11 : 8;
      // Low enough to stay clear of the HUD (round title and bars) as it crosses the sky.
      const moon = scene.add.graphics().setDepth(12).setPosition(x0, 32).setAlpha(0);
      moonPhase(moon, r, (phase + 1) / 5);
      scene.tweens.add({ targets: moon, alpha: 1, duration: 120 });
      ring(scene, x0, 32, 0xc2d4ff, r, r + 12, 300, 1);
      const beam = scene.add.graphics().setDepth(13);
      let rising = full;
      const draw = (x: number) => {
        const now = scene.time.now;
        const top = moon.y + r;
        const hgt = FLOOR_Y - top;
        beam.clear();
        beam.fillStyle(0x9fb4ff, 0.18).fillRect(x - w / 2 - 4, top, w + 8, hgt);
        beam.fillStyle(0xc2d4ff, 0.42).fillRect(x - w / 2, top, w, hgt);
        beam
          .lineStyle(1, 0xe6ecff, 0.7)
          .lineBetween(x - w / 2, top, x - w / 2, FLOOR_Y)
          .lineBetween(x + w / 2, top, x + w / 2, FLOOR_Y);
        beam.fillStyle(0xfff1e8, 0.85).fillRect(x - w * 0.15, top, w * 0.3, hgt);
        // The pool where it meets the floor, with ripples spreading from it.
        beam.fillStyle(0xc2d4ff, 0.5).fillEllipse(x, FLOOR_Y, w * 2.2, 5);
        beam.fillStyle(0xfff1e8).fillEllipse(x, FLOOR_Y, w, 2);
        const k2 = (now / 400) % 1;
        beam.lineStyle(1, 0xe6ecff, 1 - k2).strokeEllipse(x, FLOOR_Y, w * (1 + 2 * k2), 4 * (1 + k2));
        // Motes in the light: drifting down, or rising while the moon's pull lifts (the full charge's outward sweep).
        for (let i = 0; i < 8; i++) {
          const k = (now / 500 + i / 8) % 1;
          const y = rising ? FLOOR_Y - k * hgt : top + k * hgt;
          beam.fillStyle(0xfff1e8, 0.9).fillRect(x + Math.sin(now / 130 + i * 2) * w * 0.4, y, 1, 1);
        }
      };
      const sweep = (from: number, to: number, ms: number, hit: (t: Foe) => void, done: () => void) => {
        const struck = new Set<Foe>();
        scene.tweens.addCounter({
          from,
          to,
          duration: ms,
          ease: 'Sine.InOut',
          onUpdate: (tw) => {
            const x = tw.getValue() ?? from;
            moon.x = x;
            draw(x);
            for (const t of world.targets(x, FLOOR_Y)) {
              if (struck.has(t) || !t.active || Math.abs(t.x - x) > w / 2 + 3) continue;
              struck.add(t);
              hit(t);
            }
          },
          onComplete: done,
        });
      };
      const end = () =>
        scene.tweens.add({ targets: [moon, beam], alpha: 0, duration: 220, onComplete: () => (moon.destroy(), beam.destroy()) });
      const cut = (t: Foe, mult: number, kb: number) => {
        world.strike(t, mult, 'basic', false, { slow: full ? 1200 : 900 }, kb);
        sparks(scene, t.x, t.y, [0xfff1e8, 0xc2d4ff, 0x9fb4ff], 7, 14);
        cutMark(scene, t.x, t.y, 0xc2d4ff, 22, Math.PI / 2);
        cam.shake(40, 0.004);
      };
      if (!full) {
        sweep(x0, x1, 420, (t) => cut(t, 2.6 + phase * 0.2, 60), end);
        return;
      }
      // Out to the wall, lifting; then back to him.
      sweep(
        x0,
        x1,
        460,
        (t) => {
          cut(t, 2.8 + phase * 0.15, 40);
          lift(t, 200);
        },
        () => {
          rising = false;
          ring(scene, x1, FLOOR_Y - 2, 0xe6ecff, 4, 30, 300, 2);
          cam.shake(90, 0.007);
          sweep(x1, x0, 400, (t) => cut(t, 2.4 + phase * 0.15, 140), end);
        },
      );
    },
  },
};
