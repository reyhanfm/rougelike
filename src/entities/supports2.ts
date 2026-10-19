import Phaser from 'phaser';
import type { ClassId } from '../logic/classes.ts';
import { burst, cutMark, floatText, FLOOR_Y, W } from '../gfx/ui.ts';
import { bladeLine, bolt, explosion, leafBurst, prominence, ring, sparks } from './skills.ts';
import { apparition, body, dist, every, flat, foes, hold, hpOf, isBoss, later, st, type Support, type SupportCtx } from './supports.ts';

/**
 * DUKUNGAN II: each hero's second support technique from its own lore. Like the first DUKUNGAN it works on the hero
 * itself while it fights and on the hero on the field while it sits on the bench (RunScene keeps its state under
 * `sup2:<class>`). None repeats the trigger and effect of another hero's PASIF, PASIF II or DUKUNGAN.
 */
type Foe = Phaser.GameObjects.Sprite;

const flying = (t: Foe) => !!(t as unknown as { flying?: boolean }).flying;
/** The enemy with the most others within `r` px (where a blast does the most). */
const densest = (c: SupportCtx, r = 32): Foe | undefined => {
  const all = foes(c);
  let best: Foe | undefined;
  let most = -1;
  for (const t of all) {
    const n = all.filter((o) => dist(o, t) < r).length;
    if (n > most) [best, most] = [t, n];
  }
  return best;
};
/** A graphics layer kept in the support state and cleared every frame. */
const layer = (c: SupportCtx, key: string, depth: number): Phaser.GameObjects.Graphics => {
  const g = ((c.s[key] as Phaser.GameObjects.Graphics | undefined) ??= c.scene.add.graphics().setDepth(depth));
  return g.clear();
};

export const SUPPORTS2: Record<ClassId, Support> = {
  // BARIER RAJA ANGIN: Invisible Air, the Wind King's barrier wrapped around the blade, wraps the dashing hero instead;
  // the gale it drags along tears the enemies it passes off their feet and throws them into the air.
  ksatria: {
    onDash: (c) => {
      const { p, scene, world } = c;
      const [x0, y0] = [p.x, p.y];
      apparition(c, x0, y0, p.facing, 400);
      // Spiral streaks of wind along the path, pale blue and white.
      for (let i = 0; i < 8; i++) {
        later(scene, i * 25, () => {
          const w = scene.add
            .ellipse(p.x - p.facing * 4, p.y + Phaser.Math.Between(-5, 5), 14, 3, i % 2 ? 0xc2f0ff : 0xfff1e8, 0.7)
            .setDepth(11);
          scene.tweens.add({ targets: w, scaleX: 0.2, alpha: 0, x: w.x - p.facing * 12, duration: 260, onComplete: () => w.destroy() });
        });
      }
      later(scene, 200, () => {
        const [a, b] = [Math.min(x0, p.x) - 8, Math.max(x0, p.x) + 8];
        for (const t of foes(c)) {
          if (t.x < a || t.x > b || Math.abs(t.y - y0) > 24) continue;
          ring(scene, t.x, t.y, 0xc2f0ff, 3, 14, 240);
          if (!isBoss(t)) body(t).setVelocity(Math.sign(t.x - x0) * 40, -280);
          world.strike(t, 0.9, 'proc', false, undefined, 0);
        }
      });
    },
  },

  // PEWARIS ZABANIYA: the Old Man of the Mountain judges the Hassans who took his name; their Noble Phantasm answers
  // him. Every third crit, a cursed arm reaches out of the hero's shadow, closes on a copy of the victim's heart and
  // crushes it: triple damage, the body seizing up for a moment.
  pembunuh: {
    onHit: (c, t, h) => {
      if (!h.crit || h.killed || !t.active) return;
      const s = st(c, () => ({ n: 0 }));
      if (++s.n % 3) return;
      const { scene, p, world } = c;
      const [x0, y0] = [p.x, FLOOR_Y - 2];
      const arm = scene.add.graphics().setDepth(13);
      const heart = scene.add
        .graphics()
        .setDepth(14)
        .setPosition(t.x, t.y - 4);
      heart.fillStyle(0xff004d).fillCircle(-1.5, -1, 2).fillCircle(1.5, -1, 2).fillTriangle(-3.5, 0, 3.5, 0, 0, 4);
      heart.fillStyle(0xfff1e8).fillRect(-2, -2, 1, 1);
      apparition(c, p.x - p.facing * 8, p.y, p.facing, 600);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 220,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          // The arm: a long black limb wrapped in violet bandage, reaching from the floor to the heart.
          const [x1, y1] = [x0 + (t.x - x0) * k, y0 + (t.y - 4 - y0) * k];
          arm.clear().lineStyle(4, 0x1d1d3a).lineBetween(x0, y0, x1, y1).lineStyle(1, 0x7e2553).lineBetween(x0, y0, x1, y1);
          arm.fillStyle(0x1d1d3a).fillCircle(x1, y1, 3);
        },
        onComplete: () => {
          scene.tweens.add({ targets: heart, scale: 0.2, duration: 120, onComplete: () => heart.destroy() });
          sparks(scene, t.x, t.y - 4, [0xff004d, 0x7e2553, 0x000000], 12, 14);
          floatText(scene, t.x, t.y - 24, 'ZABANIYA', '#ff004d');
          if (t.active) {
            hold(c, t, 700);
            world.strike(t, 3, 'proc', true, undefined, 0);
          }
          scene.tweens.add({ targets: arm, alpha: 0, duration: 200, onComplete: () => arm.destroy() });
        },
      });
    },
  },

  // ANJING CULANN: the boy who killed Culann's hound swore to guard in its place, and took its name. Every 10 s a
  // spectral hound bounds out from the hero, sinks its teeth into the nearest enemy and drags it back to the hero.
  dragoon: {
    tick: (c, time) => {
      if (!every(c, 'hound', 10000, time)) return;
      const { scene, p, world } = c;
      const t = foes(c)[0];
      if (!t) return;
      const dir = Math.sign(t.x - p.x) || p.facing;
      const hound = scene.add
        .graphics()
        .setDepth(12)
        .setPosition(p.x, p.y + 2);
      // A lean wolfhound mid-leap, ink-blue with a red eye and a streaming tail.
      hound
        .fillStyle(0x2a4bd7)
        .fillEllipse(0, 0, 14, 5)
        .fillTriangle(dir * 6, -2, dir * 11, -5, dir * 11, 1);
      hound
        .fillTriangle(-dir * 6, -1, -dir * 13, -4, -dir * 7, 1)
        .fillRect(-dir * 4, 2, 1, 3)
        .fillRect(dir * 3, 2, 1, 3);
      hound
        .fillStyle(0x29adff, 0.6)
        .fillEllipse(0, -1, 10, 2)
        .fillStyle(0xff004d)
        .fillRect(dir * 9, -4, 1, 1);
      hound.setAlpha(0.9);
      scene.tweens.add({
        targets: hound,
        x: t.x - dir * 4,
        y: t.y,
        duration: Math.min(500, 120 + dist(p, t) * 2),
        ease: 'Quad.Out',
        onComplete: () => {
          if (t.active) {
            sparks(scene, t.x, t.y, [0xff004d, 0x2a4bd7], 8, 10);
            floatText(scene, t.x, t.y - 20, 'GIGIT', '#29adff');
            world.strike(t, 1.3, 'proc', false, undefined, 0);
            if (t.active && !isBoss(t)) {
              hold(c, t, 500);
              body(t).setVelocity(Math.sign(p.x - t.x) * Math.min(300, Math.abs(p.x - t.x) * 3), flying(t) ? (p.y - t.y) * 2 : -60);
            }
          }
          scene.tweens.add({ targets: hound, x: p.x, alpha: 0, duration: 300, onComplete: () => hound.destroy() });
        },
      });
    },
  },

  // RACUN HYDRA: Heracles dipped his arrows in the Lernaean Hydra's blood. A crit smears the venom into the wound: four
  // ticks of green poison over 4 s, each one twice the last, as the Hydra's heads grow back two for one.
  berserker: {
    onHit: (c, t, h) => {
      if (!h.crit || h.killed || !t.active || t.getData('hydra')) return;
      t.setData('hydra', { n: 0, next: c.scene.time.now + 1000 });
      floatText(c.scene, t.x, t.y - 22, 'RACUN HYDRA', '#00e436');
    },
    tick: (c, time) => {
      const g = layer(c, 'g', 13);
      for (const t of foes(c)) {
        const v = t.getData('hydra') as { n: number; next: number } | undefined;
        if (!v) continue;
        // Green drops weeping off the poisoned body.
        if (Math.floor(time / 100) % 3 === 0) {
          const d = c.scene.add.rectangle(t.x + Phaser.Math.Between(-4, 4), t.y, 1, 2, 0x00e436).setDepth(12);
          c.scene.tweens.add({ targets: d, y: d.y + 8, alpha: 0, duration: 400, onComplete: () => d.destroy() });
        }
        g.lineStyle(1, 0x00e436, 0.6).strokeEllipse(t.x, t.y, t.displayWidth + 4, t.displayHeight + 2);
        if (time < v.next) continue;
        v.next = time + 1000;
        sparks(c.scene, t.x, t.y, [0x00e436, 0x008751], 4 + v.n * 2, 8);
        c.world.strike(t, 0.3 * 2 ** v.n, 'proc', false, undefined, 0);
        if (++v.n >= 4 && t.active) t.setData('hydra', undefined);
      }
    },
  },

  // RHO AIAS: the seven-petalled shield that stopped a thrown Gae Bolg. Seven petals of light stand in front of the hero
  // and each turns one shot or blast away; a broken petal grows back 4 s later.
  pemburu: {
    guard: (c, _dmg, fromX, from) => {
      if (from) return false;
      const { scene, p } = c;
      const s = st(c, () => ({ petals: 7, next: 0 }));
      if (!s.petals) return false;
      s.petals--;
      if (!s.next) s.next = scene.time.now + 4000;
      p.parry('RHO AIAS', '#ff77a8');
      const side = Math.sign(fromX - p.x) || p.facing;
      const g = scene.add
        .graphics()
        .setDepth(13)
        .setPosition(p.x + side * 10, p.y - 2);
      // The flower face-on: seven pink petals around a white core, one cracking away.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.fillStyle(i < s.petals ? 0xff77a8 : 0x5f574f, 0.85).fillEllipse(Math.cos(a) * 5, Math.sin(a) * 7, 5, 7);
      }
      g.fillStyle(0xfff1e8).fillCircle(0, 0, 2);
      scene.tweens.add({ targets: g, alpha: 0, scaleX: 0.6, delay: 250, duration: 250, onComplete: () => g.destroy() });
      sparks(scene, p.x + side * 10, p.y - 2, [0xff77a8, 0xfff1e8], 8, 10);
      apparition(c, p.x - side * 8, p.y, side, 400);
      return true;
    },
    tick: (c, time) => {
      const s = st(c, () => ({ petals: 7, next: 0 }));
      if (s.next && time >= s.next) {
        s.petals = Math.min(7, s.petals + 1);
        s.next = s.petals < 7 ? time + 4000 : 0;
      }
      const g = layer(c, 'g', 12);
      if (!c.p.active) return;
      // Seven dots under the hero's feet, pink for each petal standing.
      for (let i = 0; i < 7; i++) g.fillStyle(i < s.petals ? 0xff77a8 : 0x1d2b53).fillRect(c.p.x - 7 + i * 2, c.p.y + 9, 1, 1);
    },
  },

  // GEMA ARKANA: the stars remember every arrow. Every fifth blow, a rune opens behind the enemy that was hit and the
  // arrow's echo flies back out of it, through the enemy and on through everything behind it.
  magicArcher: {
    onHit: (c, t, h) => {
      if (h.source === 'ult' || !t.active) return;
      const s = st(c, () => ({ n: 0 }));
      if (++s.n % 5) return;
      const { scene, p, world } = c;
      const dir = Math.sign(t.x - p.x) || p.facing;
      const [x, y] = [Phaser.Math.Clamp(t.x + dir * 34, 4, W - 4), t.y];
      const g = scene.add.graphics().setDepth(13).setPosition(x, y);
      g.lineStyle(1, 0xc080ff).strokeCircle(0, 0, 6).lineStyle(1, 0x29adff).strokeCircle(0, 0, 3);
      for (let i = 0; i < 4; i++) g.fillStyle(0xfff1e8).fillRect(Math.cos(i * 1.57) * 6 - 0.5, Math.sin(i * 1.57) * 6 - 0.5, 1, 1);
      scene.tweens.add({ targets: g, angle: 180, alpha: 0, duration: 450, onComplete: () => g.destroy() });
      // Aimed when it flies, at where the enemy is by then, and on through the line behind it.
      later(scene, 120, () => {
        const a = t.active ? Phaser.Math.Angle.Between(x, y, t.x, t.y) : dir > 0 ? Math.PI : 0;
        const [vx, vy] = [Math.cos(a) * 320, Math.sin(a) * 320];
        world.shot({ x, y, vx, vy, texture: 'panahArkana', tint: 0xc080ff, mult: 0.9, source: 'proc', pierce: true });
      });
    },
  },

  // TAWAR DENGAN MAUT: Death is open to a bargain, for a price. A blow that would drop the hero under 20% HP is paid with
  // a quarter of the ult meter instead of life (an hourglass turns over the hero), once every 4 s.
  reaper: {
    guard: (c, dmg) => {
      const { scene, p } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready || p.ult < 25 || p.hp - dmg * p.stats.damageTaken >= p.stats.maxHp * 0.2) return false;
      s.ready = scene.time.now + 4000;
      p.ult -= 25;
      p.parry('TAWAR', '#7cf0c0');
      const g = scene.add
        .graphics()
        .setDepth(14)
        .setPosition(p.x, p.y - 22);
      g.fillStyle(0x5f574f).fillRect(-4, -6, 8, 1).fillRect(-4, 5, 8, 1);
      g.fillStyle(0x7cf0c0).fillTriangle(-3, -5, 3, -5, 0, 0).fillTriangle(-3, 5, 3, 5, 0, 0);
      scene.tweens.add({ targets: g, angle: 180, duration: 400 });
      scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() });
      apparition(c, p.x + p.facing * 10, p.y, -p.facing, 600);
      return true;
    },
  },

  // MORTIR: the gunners call in fire support. Every 10 s three mortar shells whistle down on the thickest knot of
  // enemies (in the air they burst where the flyers are) and blow it apart.
  gunners: {
    tick: (c, time) => {
      if (!every(c, 'mortar', 10000, time)) return;
      const { scene, world } = c;
      const t = densest(c);
      if (!t) return;
      apparition(c, c.p.x, c.p.y, c.p.facing, 400);
      floatText(scene, c.p.x, c.p.y - 26, 'MORTIR!', '#ffa300');
      for (let i = 0; i < 3; i++) {
        later(scene, 300 + i * 220, () => {
          const x = Phaser.Math.Clamp((t.active ? t.x : c.p.x) + (i - 1) * 18, 6, W - 6);
          const y = t.active ? Math.min(t.y, FLOOR_Y - 4) : FLOOR_Y - 4;
          const shell = scene.add.rectangle(x, -6, 2, 5, 0x5f574f).setStrokeStyle(1, 0x000000).setDepth(13);
          const trail = scene.add.graphics().setDepth(12);
          scene.tweens.add({
            targets: shell,
            y,
            duration: 300,
            ease: 'Quad.In',
            onUpdate: () =>
              trail
                .clear()
                .lineStyle(1, 0xc2c3c7, 0.4)
                .lineBetween(x, Math.max(0, shell.y - 20), x, shell.y),
            onComplete: () => {
              [shell, trail].forEach((o) => o.destroy());
              explosion(scene, x, y, 18);
              burst(scene, x, y, 0x5f574f, 6);
              scene.cameras.main.shake(80, 0.006);
              world.area(x, y, 24, 1.4, 140, 'proc');
            },
          });
        });
      }
    },
  },

  // TUNGKU ALKIMIA: a cultivator never fights without pills. Every 5 kills the cauldron refines one (3 at most, shown
  // over the hero); when HP falls under 40%, one is swallowed and heals 20%.
  cultivator: {
    onKill: (c) => {
      const s = st(c, () => ({ kills: 0, pills: 0, ready: 0 }));
      if (s.pills >= 3 || ++s.kills % 5) return;
      s.pills++;
      const { scene, p } = c;
      // The cauldron: a small bronze ding with three legs, smoke curling out as the pill forms.
      const g = scene.add
        .graphics()
        .setDepth(13)
        .setPosition(p.x - p.facing * 10, p.y - 6);
      g.fillStyle(0xab5236).fillEllipse(0, 0, 10, 6).fillRect(-4, 2, 1, 3).fillRect(3, 2, 1, 3).fillRect(-1, 3, 1, 2);
      g.fillStyle(0xffa300).fillRect(-5, -2, 10, 1);
      scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() });
      for (let i = 0; i < 3; i++) {
        const m = scene.add.circle(g.x, g.y - 3, 1.5, 0xc2c3c7, 0.6).setDepth(13);
        scene.tweens.add({
          targets: m,
          y: m.y - 12,
          x: m.x + (i - 1) * 4,
          alpha: 0,
          delay: i * 100,
          duration: 500,
          onComplete: () => m.destroy(),
        });
      }
      floatText(scene, p.x, p.y - 26, `PIL ${s.pills}/3`, '#ffec27');
    },
    onHurt: (c) => {
      const { scene, p } = c;
      const s = st(c, () => ({ kills: 0, pills: 0, ready: 0 }));
      if (!s.pills || p.hp >= p.stats.maxHp * 0.4 || scene.time.now < s.ready) return;
      s.pills--;
      s.ready = scene.time.now + 3000;
      p.heal(Math.round(p.stats.maxHp * 0.2));
      floatText(scene, p.x, p.y - 26, 'PIL ABADI', '#ffec27');
      ring(scene, p.x, p.y, 0xffec27, 16, 3, 300);
      sparks(scene, p.x, p.y, [0xffec27, 0x00e436, 0xfff1e8], 10, 12);
      apparition(c, p.x - p.facing * 9, p.y, p.facing, 500);
    },
    tick: (c) => {
      const s = st(c, () => ({ kills: 0, pills: 0, ready: 0 }));
      const g = layer(c, 'g', 12);
      if (!c.p.active) return;
      for (let i = 0; i < s.pills; i++) g.fillStyle(0xffec27).fillCircle(c.p.x - 3 + i * 3, c.p.y - 16, 1);
    },
  },

  // AWAN ELEMEN: the sky answers the one who commands the elements. After every skill, fusion or ult a storm cloud
  // follows the hero for 4 s and drops fire, ice or lightning on the enemies below it.
  elementalis: {
    onCast: (c) => {
      st(c, () => ({ until: 0, next: 0 })).until = c.scene.time.now + 4000;
      apparition(c, c.p.x, c.p.y - 30, c.p.facing, 500);
    },
    tick: (c, time) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ until: 0, next: 0 }));
      const g = layer(c, 'g', 13);
      if (time >= s.until || !p.active) return;
      const [x, y] = [p.x, Math.max(14, p.y - 44)];
      // The cloud: three grey puffs with a dark underside, flickering with the colors of the elements.
      const tint = [0xff004d, 0x29adff, 0xffec27][Math.floor(time / 200) % 3];
      g.fillStyle(0x5f574f)
        .fillEllipse(x - 7, y + 1, 12, 7)
        .fillEllipse(x + 6, y + 1, 12, 7)
        .fillEllipse(x, y - 2, 14, 9);
      g.fillStyle(0xc2c3c7, 0.6).fillEllipse(x - 2, y - 4, 8, 3);
      g.fillStyle(tint, 0.5).fillRect(x - 9, y + 4, 18, 1);
      if (time < s.next) return;
      s.next = time + 450;
      const t = foes(c).find((o) => Math.abs(o.x - x) < 46 && o.y > y);
      if (!t) return;
      const kind = Phaser.Math.Between(0, 2);
      if (kind === 2) bolt(scene, x, y + 4, t.x, t.y);
      else {
        const drop = scene.add.circle(x + Phaser.Math.Between(-6, 6), y + 4, 2, kind ? 0xc2f0ff : 0xffa300).setDepth(13);
        scene.tweens.add({ targets: drop, x: t.x, y: t.y, duration: 160, onComplete: () => drop.destroy() });
      }
      later(scene, kind === 2 ? 0 : 160, () => {
        if (!t.active) return;
        sparks(scene, t.x, t.y, [tint, 0xfff1e8], 5, 8);
        world.strike(t, kind === 2 ? 1 : 0.7, 'proc', false, kind === 0 ? { burn: 0.15 } : kind === 1 ? { freeze: 600 } : undefined, 30);
      });
    },
  },

  // CHIBURI: after the kill the samurai flicks the blood off his blade before it goes back in the scabbard. The flicked
  // blood flies on as a red crescent and cuts the next enemy.
  samurai: {
    onKill: (c, t) => {
      const { scene, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready) return;
      const o = foes(c)
        .filter((x) => x !== t)
        .sort((a, b) => dist(a, t) - dist(b, t))[0];
      if (!o) return;
      s.ready = scene.time.now + 600;
      const a = Phaser.Math.Angle.Between(t.x, t.y, o.x, o.y);
      for (let i = 0; i < 5; i++) {
        const d = scene.add.rectangle(t.x, t.y, 1, 1, 0xff004d).setDepth(13);
        scene.tweens.add({
          targets: d,
          x: t.x + Phaser.Math.Between(-8, 8),
          y: FLOOR_Y,
          alpha: 0,
          duration: 400,
          onComplete: () => d.destroy(),
        });
      }
      world.shot({
        x: t.x,
        y: t.y,
        vx: Math.cos(a) * 280,
        vy: Math.sin(a) * 280,
        texture: 'slash',
        tint: 0xff004d,
        mult: 1.2,
        source: 'proc',
      });
    },
  },

  // LUKA JADI BILAH: the Avenger forgets no wound. Damage the hero takes is stored as black blood (drops at its side);
  // the next skill throws all of it back threefold as a shadow blade into the nearest enemy.
  darkAvenger: {
    onHurt: (c, dmg) => {
      const s = st(c, () => ({ pain: 0 }));
      s.pain = Math.min(80, s.pain + dmg);
    },
    onCast: (c, kind) => {
      const s = st(c, () => ({ pain: 0 }));
      const t = foes(c)[0];
      if (kind !== 'skill' || s.pain < 1 || !t) return;
      const { scene, p, world } = c;
      const amount = s.pain * 3;
      s.pain = 0;
      apparition(c, p.x - p.facing * 8, p.y, p.facing, 500);
      bladeLine(scene, p.x, p.y - 2, t.x, t.y, 0x7e2553, 180);
      bladeLine(scene, p.x, p.y, t.x, t.y + 2, 0x000000, 140);
      later(scene, 120, () => {
        if (!t.active) return;
        sparks(scene, t.x, t.y, [0x7e2553, 0xc080ff, 0x000000], 12, 16);
        floatText(scene, t.x, t.y - 24, 'BALAS!', '#c080ff');
        world.strike(t, flat(c, amount), 'proc', true, undefined, 160);
      });
    },
    tick: (c) => {
      const s = st(c, () => ({ pain: 0 }));
      const g = layer(c, 'g', 12);
      if (!c.p.active || s.pain < 1) return;
      const n = Math.min(8, Math.ceil(s.pain / 10));
      for (let i = 0; i < n; i++) g.fillStyle(i % 2 ? 0x7e2553 : 0x000000).fillRect(c.p.x - c.p.facing * 7, c.p.y + 6 - i * 2, 1, 1);
    },
  },

  // YASHA: Asura's rival and brother-in-law fights beside him again. Every 12 s Yasha streaks through the arena in a
  // blur of blue afterimages, cutting four enemies one after another.
  ashura: {
    tick: (c, time) => {
      if (!every(c, 'yasha', 12000, time)) return;
      const { scene, p, world } = c;
      const prey = foes(c).slice(0, 4);
      if (!prey.length) return;
      floatText(scene, p.x, p.y - 26, 'YASHA!', '#29adff');
      let [x, y] = [p.facing > 0 ? 0 : W, p.y];
      prey.forEach((t, i) => {
        const [fx, fy] = [x, y];
        later(scene, 120 + i * 130, () => {
          if (!t.active) return;
          const [tx, ty] = [t.x + (t.x > fx ? 10 : -10), t.y];
          // The streak: a blue band with a white core, and the cut a moment later.
          const g = scene.add.graphics().setDepth(13);
          g.lineStyle(3, 0x1d2b53, 0.6).lineBetween(fx, fy, tx, ty).lineStyle(1, 0x29adff).lineBetween(fx, fy, tx, ty);
          scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
          const ghost = scene.add
            .image(tx, ty, 'hero_idle_ashura')
            .setTint(0x29adff)
            .setAlpha(0.6)
            .setFlipX(tx < fx)
            .setDepth(12);
          scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
          cutMark(scene, t.x, t.y, 0x29adff);
          world.strike(t, 1.3, 'proc', false, undefined, 90);
        });
        [x, y] = [t.x, t.y];
      });
    },
  },

  // EKOR NAGA: the Monarch's dragon tail. Each combo finisher sweeps the tail behind the hero, smashing whatever was
  // creeping up on its back and throwing it into the air.
  antares: {
    onAttack: (c) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (p.comboStep !== p.weapon.combo.length - 1 || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 1000;
      const back = -p.facing;
      const g = scene.add
        .graphics()
        .setDepth(11)
        .setPosition(p.x, p.y + 4);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 220,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          // The tail curls out behind in an arc: crimson scales, a dark spined edge, a barbed tip.
          g.clear();
          const pts = Array.from({ length: 8 }, (_, i) => {
            const a = Math.PI / 2 + back * (0.3 + k * 1.6) * (i / 7);
            return new Phaser.Math.Vector2(back * Math.abs(Math.cos(a)) * i * 4, Math.sin(a) * i * 2 - i);
          });
          g.lineStyle(4, 0x7e2553).strokePoints(pts).lineStyle(2, 0xb3122e).strokePoints(pts);
          const tip = pts[pts.length - 1];
          g.fillStyle(0xff004d).fillTriangle(tip.x, tip.y - 3, tip.x + back * 4, tip.y, tip.x, tip.y + 3);
        },
        onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 150, onComplete: () => g.destroy() }),
      });
      later(scene, 110, () => {
        for (const t of foes(c)) {
          if (Math.sign(t.x - p.x) !== back || Math.abs(t.x - p.x) > 38 || Math.abs(t.y - p.y) > 22) continue;
          sparks(scene, t.x, t.y, [0xff004d, 0xffa300], 6, 10);
          if (!isBoss(t)) body(t).setVelocity(back * 120, -240);
          world.strike(t, 1.4, 'proc', false, undefined, 0);
        }
      });
    },
  },

  // SHA NAQBA IMURU: "he who saw the deep". Every 10 s the king reads the strongest enemy to the bottom of its soul;
  // for 5 s a golden eye hangs over it and every one of the hero's blows on it is a crit.
  gilgamesh: {
    tick: (c, time) => {
      const s = st(c, () => ({ mark: undefined as Foe | undefined, until: 0 }));
      if (every(c, 'read', 10000, time)) {
        const t = foes(c).sort((a, b) => hpOf(b).hp - hpOf(a).hp)[0];
        if (t) {
          Object.assign(s, { mark: t, until: time + 5000 });
          floatText(c.scene, t.x, t.y - 26, 'TERBACA', '#ffec27');
          apparition(c, c.p.x, c.p.y, c.p.facing, 500);
        }
      }
      const g = layer(c, 'g', 13);
      const t = s.mark;
      if (!t?.active || time >= s.until) return;
      const [x, y] = [t.x, t.y - t.displayHeight / 2 - 8];
      g.fillStyle(0xd4a017).fillEllipse(x, y, 10, 5).fillStyle(0xfff1e8).fillEllipse(x, y, 7, 3);
      g.fillStyle(0xff004d).fillCircle(x, y, 1.3);
      g.lineStyle(1, 0xffec27, 0.5 + Math.sin(time / 80) * 0.3).strokeEllipse(x, y, 14, 8);
    },
    modify: (c, t) => {
      const s = st(c, () => ({ mark: undefined as Foe | undefined, until: 0 }));
      return t === s.mark && c.scene.time.now < s.until ? { crit: true } : undefined;
    },
  },

  // RODA MAHORAGA: Sukuna once called up the Ten Shadows' strongest shikigami to adapt to what he could not touch. Hurt
  // twice by the same kind of enemy (or by shots), the eight-handled wheel over the hero turns, and for 8 s that kind
  // can no longer hurt it.
  sukuna: {
    guard: (c, _dmg, _fromX, from) => {
      const s = st(c, () => ({ count: {} as Record<string, number>, immune: {} as Record<string, number>, turn: 0 }));
      const kind = from ? from.texture.key : 'shot';
      if (c.scene.time.now >= (s.immune[kind] ?? 0)) return false;
      sparks(c.scene, c.p.x, c.p.y, [0xffec27, 0xfff1e8], 5, 8);
      c.p.parry('ADAPTASI', '#ffec27');
      return true;
    },
    onHurt: (c, _dmg, _fromX, from) => {
      const s = st(c, () => ({ count: {} as Record<string, number>, immune: {} as Record<string, number>, turn: 0 }));
      const kind = from ? from.texture.key : 'shot';
      s.count[kind] = (s.count[kind] ?? 0) + 1;
      if (s.count[kind] < 2) return;
      s.count[kind] = 0;
      s.immune[kind] = c.scene.time.now + 8000;
      s.turn = c.scene.time.now;
      floatText(c.scene, c.p.x, c.p.y - 30, 'ADAPTASI', '#ffec27');
      apparition(c, c.p.x, c.p.y, c.p.facing, 500);
    },
    tick: (c, time) => {
      const s = st(c, () => ({ count: {} as Record<string, number>, immune: {} as Record<string, number>, turn: 0 }));
      const g = layer(c, 'g', 13);
      if (!c.p.active || !Object.values(s.immune).some((u) => time < u)) return;
      // The wheel: a gold ring with eight handles, turning one eighth after each adaptation.
      const [x, y] = [c.p.x, c.p.y - 20];
      const rot = Math.min(1, (time - s.turn) / 300) * (Math.PI / 4);
      g.lineStyle(1, 0xd4a017).strokeCircle(x, y, 4);
      for (let i = 0; i < 8; i++) {
        const a = rot + (i / 8) * Math.PI * 2;
        g.lineBetween(x + Math.cos(a) * 4, y + Math.sin(a) * 4, x + Math.cos(a) * 7, y + Math.sin(a) * 7);
        g.fillStyle(0xffec27).fillRect(x + Math.cos(a) * 7 - 0.5, y + Math.sin(a) * 7 - 0.5, 1, 1);
      }
    },
  },

  // KOKUSEN: the Black Flash, cursed energy landing within a millionth of a second of the blow. One basic blow in eight
  // sparks black lightning: two and a half times the damage and a jolt of ult meter.
  gojo: {
    modify: (c, t, source) => {
      if (source !== 'basic' || Math.random() >= 0.125) return;
      const { scene } = c;
      // Black sparks crackling outward, edged in red: the space bends where the flash lands.
      for (let i = 0; i < 4; i++) {
        const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
        bolt(scene, t.x, t.y, t.x + Math.cos(a) * 16, t.y + Math.sin(a) * 16, i % 2 ? 0x000000 : 0xff004d);
      }
      ring(scene, t.x, t.y, 0x000000, 2, 18, 220, 2);
      floatText(scene, t.x, t.y - 22, 'KOKUSEN!', '#ff004d');
      c.p.addUlt(5);
      return { mult: 2.5 };
    },
  },

  // ROH CACING GUDANG: Toji's inventory curse, the worm he wears around his body that keeps his arsenal in its belly.
  // Every 9 s it coughs up one weapon: a spear that runs the line through, a chain that drags an enemy in, or three
  // knives thrown at the nearest enemies.
  toji: {
    tick: (c, time) => {
      if (!every(c, 'worm', 9000, time)) return;
      const { scene, p, world } = c;
      const near = foes(c);
      if (!near.length) return;
      // The worm's head rearing over the shoulder, mouth open.
      const w = scene.add
        .graphics()
        .setDepth(12)
        .setPosition(p.x - p.facing * 5, p.y - 10);
      w.fillStyle(0x83769c)
        .fillCircle(0, 0, 3)
        .fillCircle(-p.facing * 3, 3, 2.5)
        .fillStyle(0x7e2553)
        .fillCircle(p.facing, -1, 1.5);
      scene.tweens.add({ targets: w, y: w.y - 4, alpha: 0, delay: 300, duration: 300, onComplete: () => w.destroy() });
      const pick = Phaser.Math.Between(0, 2);
      if (pick === 0) {
        floatText(scene, p.x, p.y - 26, 'TOMBAK', '#c2c3c7');
        const end = Phaser.Math.Clamp(p.x + p.facing * 110, 0, W);
        bladeLine(scene, p.x, p.y, end, p.y, 0xc2c3c7, 160);
        for (const t of near)
          if (Math.sign(t.x - p.x) === p.facing && Math.abs(t.x - p.x) < 110 && Math.abs(t.y - p.y) < 14)
            world.strike(t, 1.8, 'proc', false, undefined, 120);
      } else if (pick === 1) {
        const t = near.find((o) => !isBoss(o)) ?? near[0];
        floatText(scene, p.x, p.y - 26, 'RANTAI', '#c2c3c7');
        const g = scene.add.graphics().setDepth(12).lineStyle(1, 0xc2c3c7).lineBetween(p.x, p.y, t.x, t.y);
        scene.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
        if (!isBoss(t)) {
          hold(c, t, 400);
          body(t).setVelocity(Math.sign(p.x - t.x) * Math.min(320, Math.abs(p.x - t.x) * 3.5), (p.y - t.y) * 2);
        }
        world.strike(t, 1.2, 'proc', false, undefined, 0);
      } else {
        floatText(scene, p.x, p.y - 26, 'PISAU', '#c2c3c7');
        near.slice(0, 3).forEach((t, i) =>
          later(scene, i * 70, () => {
            const a = Phaser.Math.Angle.Between(p.x, p.y, t.x, t.y);
            world.shot({ x: p.x, y: p.y - 2, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, texture: 'w_belati', mult: 1, source: 'proc' });
          }),
        );
      }
    },
  },

  // GUDODAMA: as the Ten-Tails' jinchuriki Madara floats the truth-seeking balls at his back. Up to six black orbs hang
  // behind the hero; each combo finisher shapes one into a black rod and fires it, and a new one forms every 4 s.
  madara: {
    onAttack: (c) => {
      const { p, world, scene } = c;
      const s = st(c, () => ({ orbs: 6, next: 0 }));
      if (p.comboStep !== p.weapon.combo.length - 1 || !s.orbs) return;
      s.orbs--;
      if (!s.next) s.next = scene.time.now + 4000;
      sparks(scene, p.x - p.facing * 6, p.y - 8, [0x000000, 0x83769c], 4, 6);
      // Aimed at the nearest enemy ahead (within ±0.6 rad), else straight out.
      const ahead = foes(c).find((t) => {
        const a = Phaser.Math.Angle.Between(p.x, p.y - 4, t.x, t.y);
        return Math.abs(Phaser.Math.Angle.Wrap(a - (p.facing > 0 ? 0 : Math.PI))) < 0.6;
      });
      const a = ahead ? Phaser.Math.Angle.Between(p.x, p.y - 4, ahead.x, ahead.y) : p.facing > 0 ? 0 : Math.PI;
      world.shot({
        x: p.x,
        y: p.y - 4,
        vx: Math.cos(a) * 300,
        vy: Math.sin(a) * 300,
        texture: 'gudodamaRod',
        mult: 1.6,
        source: 'proc',
        pierce: true,
        knockback: 140,
      });
    },
    tick: (c, time) => {
      const s = st(c, () => ({ orbs: 6, next: 0 }));
      if (s.next && time >= s.next) {
        s.orbs = Math.min(6, s.orbs + 1);
        s.next = s.orbs < 6 ? time + 4000 : 0;
      }
      const g = layer(c, 'g', 9);
      if (!c.p.active) return;
      // A halo arc of black orbs behind the shoulders, bobbing, with a dull violet sheen.
      for (let i = 0; i < s.orbs; i++) {
        const a = Math.PI + (i / 5) * Math.PI;
        const [x, y] = [c.p.x - c.p.facing * 3 + Math.cos(a) * 9, c.p.y - 4 + Math.sin(a) * 6 + Math.sin(time / 200 + i) * 0.8];
        g.fillStyle(0x000000)
          .fillCircle(x, y, 1.6)
          .fillStyle(0x83769c)
          .fillRect(x - 1, y - 1, 1, 1);
      }
    },
  },

  // MOKUJIN: Hashirama's wooden giant. Every 15 s one of its arms bursts out of the floor under the nearest enemy and
  // drives a fist straight up, throwing the enemy high (it reaches flyers too).
  hashirama: {
    tick: (c, time) => {
      if (!every(c, 'golem', 15000, time)) return;
      const { scene, world } = c;
      const t = foes(c)[0];
      if (!t) return;
      apparition(c, c.p.x, c.p.y, c.p.facing, 500);
      const x = t.x;
      const top = Math.min(FLOOR_Y - 14, t.y + 6);
      const g = scene.add.graphics().setDepth(10);
      leafBurst(scene, x, FLOOR_Y, 6);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 220,
        ease: 'Quad.Out',
        onUpdate: (tw) => {
          const y = FLOOR_Y - (FLOOR_Y - top) * (tw.getValue() ?? 0);
          // The arm: a thick trunk of brown wood with darker grain and a lit edge, a wrist band of bark, leaves
          // sprouting off it, and the fist: four knuckles of knotted wood with the thumb folded across.
          const h = FLOOR_Y - y;
          g.clear()
            .fillStyle(0x3b2418)
            .fillRect(x - 8, y + 4, 16, h)
            .fillStyle(0xa0522d)
            .fillRect(x - 7, y + 4, 13, h);
          g.fillStyle(0xd27a4a).fillRect(x - 7, y + 4, 2, h);
          g.lineStyle(1, 0x3b2418);
          for (let k = y + 12; k < FLOOR_Y; k += 8) g.lineBetween(x - 4, k, x + 3, k + 3);
          g.fillStyle(0x3b2418).fillRect(x - 9, y + 4, 18, 3);
          for (let k = y + 16; k < FLOOR_Y - 4; k += 14)
            g.fillStyle(0x008751)
              .fillEllipse(x + 9, k, 5, 3)
              .fillEllipse(x - 9, k + 6, 5, 3);
          g.fillStyle(0x3b2418)
            .fillRect(x - 11, y - 12, 22, 17)
            .fillStyle(0xa0522d)
            .fillRect(x - 10, y - 11, 20, 15);
          g.fillStyle(0xd27a4a);
          for (let i = 0; i < 4; i++) g.fillRect(x - 9 + i * 5, y - 11, 4, 3);
          g.fillStyle(0x3b2418);
          for (let i = 1; i < 4; i++) g.fillRect(x - 10 + i * 5, y - 11, 1, 7);
          g.fillStyle(0x8a4a24)
            .fillRect(x - 10, y - 3, 13, 4)
            .fillStyle(0x3b2418)
            .fillRect(x - 10, y + 1, 13, 1);
        },
        onComplete: () => {
          if (t.active) {
            sparks(scene, t.x, t.y, [0xa0522d, 0x00e436], 10, 14);
            if (!isBoss(t)) body(t).setVelocity(0, -320);
            world.strike(t, 2, 'proc', false, undefined, 0);
          }
          scene.cameras.main.shake(100, 0.006);
          scene.tweens.add({ targets: g, alpha: 0, delay: 300, duration: 300, onComplete: () => g.destroy() });
        },
      });
    },
  },

  // TOTSUKA NO TSURUGI: the Susanoo's sword of sake that seals whatever it pierces in the Yata gourd. Every 14 s it
  // stabs the toughest small enemy and seals it away for good; elites lose 40% of their life, bosses 6%.
  itachi: {
    tick: (c, time) => {
      if (!every(c, 'seal', 14000, time)) return;
      const { scene, p, world } = c;
      const t = foes(c).sort((a, b) => (isBoss(a) ? 1 : 0) - (isBoss(b) ? 1 : 0) || hpOf(b).hp - hpOf(a).hp)[0];
      if (!t) return;
      apparition(c, p.x - p.facing * 8, p.y, p.facing, 700);
      // The gourd high over the enemy, and the blade: a stream of red-orange liquid hardening into a long sword.
      const [x, y] = [t.x, Math.max(14, t.y - 46)];
      const gourd = scene.add.graphics().setDepth(14).setPosition(x, y);
      gourd.fillStyle(0xab5236).fillCircle(0, 4, 5).fillCircle(0, -3, 3.5).fillStyle(0xff004d).fillRect(-1, -8, 2, 2);
      gourd.fillStyle(0x7e2553).fillRect(-5, 1, 10, 1);
      const blade = scene.add.graphics().setDepth(14);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 260,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const tip = y + 9 + (t.y - y - 9) * k;
          // A blade of liquid fire poured from the gourd's mouth: crimson glow, orange body, a white edge, a sharp
          // point, drops spilling off it as it runs down.
          blade
            .clear()
            .fillStyle(0xff004d, 0.35)
            .fillRect(x - 4, y + 8, 8, tip - y - 8);
          blade
            .fillStyle(0xff004d)
            .fillRect(x - 2, y + 8, 5, tip - y - 12)
            .fillStyle(0xffa300)
            .fillRect(x - 1, y + 8, 3, tip - y - 12);
          blade.fillStyle(0xfff1e8).fillRect(x, y + 8, 1, tip - y - 12);
          blade.fillStyle(0xffa300).fillTriangle(x - 2, tip - 4, x + 3, tip - 4, x, tip + 2);
          if (Math.random() < 0.5) burst(scene, x, tip - 6, 0xff004d, 1);
        },
        onComplete: () => {
          blade.destroy();
          if (t.active) {
            const h = hpOf(t);
            sparks(scene, t.x, t.y, [0xff004d, 0xffa300, 0x000000], 12, 14);
            const sealed = !isBoss(t) && !t.getData('elite');
            floatText(scene, t.x, t.y - 22, sealed ? 'TERSEGEL' : 'TOTSUKA', '#ff004d');
            world.strike(t, flat(c, sealed ? h.hp + 1 : h.maxHp * (isBoss(t) ? 0.06 : 0.4)), 'proc', true, undefined, 0);
            if (sealed) {
              const wisp = scene.add.circle(x, t.y, 3, 0xff004d, 0.7).setDepth(14);
              scene.tweens.add({ targets: wisp, y: y + 4, scale: 0.3, duration: 300, onComplete: () => wisp.destroy() });
            }
          }
          scene.tweens.add({ targets: gourd, alpha: 0, delay: 350, duration: 250, onComplete: () => gourd.destroy() });
        },
      });
    },
  },

  // DANAU BEKU: Jack drowned under the ice of a frozen pond and woke from it as Jack Frost. When the hero falls under
  // 30% HP it freezes into a block of clear ice for 1.5 s (untouchable), then bursts out, freezing everything near.
  jackFrost: {
    onHurt: (c) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (p.hp >= p.stats.maxHp * 0.3 || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 25000;
      p.invuln(1600);
      p.lock(1500);
      p.setVelocity(0, 0);
      apparition(c, p.x + p.facing * 10, p.y, -p.facing, 800);
      // The block: a pale blue box with white facets and a glint running across it.
      const g = scene.add.graphics().setDepth(12).setPosition(p.x, p.y);
      g.fillStyle(0xc2f0ff, 0.45).fillRect(-8, -11, 16, 22).lineStyle(1, 0xfff1e8).strokeRect(-8, -11, 16, 22);
      g.lineStyle(1, 0x29adff, 0.8).lineBetween(-8, -2, 0, -11).lineBetween(2, 11, 8, 2);
      floatText(scene, p.x, p.y - 26, 'DANAU BEKU', '#c2f0ff');
      later(scene, 1500, () => {
        g.destroy();
        if (!p.active) return;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const sh = scene.add.rectangle(p.x, p.y, 2, 4, 0xc2f0ff).setRotation(a).setDepth(13);
          scene.tweens.add({
            targets: sh,
            x: p.x + Math.cos(a) * 30,
            y: p.y + Math.sin(a) * 30,
            alpha: 0,
            duration: 350,
            onComplete: () => sh.destroy(),
          });
        }
        ring(scene, p.x, p.y, 0xc2f0ff, 6, 60, 400, 2);
        scene.cameras.main.shake(120, 0.008);
        for (const t of foes(c)) if (dist(t, p) < 60) world.strike(t, 1.2, 'proc', false, { freeze: 2000 }, 80);
      });
    },
  },

  // GAMABUNTA: the chief toad answers the summoning. Every 20 s a cloud of smoke opens over the thickest crowd and
  // Gamabunta drops out of it, flattening everything under his belly and shaking the whole floor.
  naruto: {
    tick: (c, time) => {
      if (!every(c, 'toad', 20000, time)) return;
      const { scene, world } = c;
      const t = densest(c, 48);
      if (!t) return;
      const x = Phaser.Math.Clamp(t.x, 30, W - 30);
      apparition(c, c.p.x, c.p.y, c.p.facing, 600);
      floatText(scene, c.p.x, c.p.y - 26, 'KUCHIYOSE!', '#ffa300');
      const shade = scene.add.ellipse(x, FLOOR_Y - 1, 10, 3, 0x000000, 0.4).setDepth(3);
      scene.tweens.add({ targets: shade, scaleX: 6, scaleY: 2, duration: 600 });
      const toad = scene.add.graphics().setDepth(13).setPosition(x, -30);
      // Gamabunta: a squat red-brown toad in a blue happi coat, pale belly, yellow eyes, the pipe in his mouth.
      toad.fillStyle(0x7e2553).fillEllipse(0, 0, 58, 34).fillStyle(0xb3122e).fillEllipse(0, -2, 54, 30);
      toad.fillStyle(0xffccaa).fillEllipse(0, 8, 34, 14);
      toad.fillStyle(0x2a4bd7).fillRect(-27, -6, 10, 16).fillRect(17, -6, 10, 16);
      toad
        .fillStyle(0xffec27)
        .fillCircle(-12, -15, 5)
        .fillCircle(12, -15, 5)
        .fillStyle(0x000000)
        .fillRect(-14, -15, 4, 1)
        .fillRect(10, -15, 4, 1);
      // The wide mouth, and the old scar across his left eye.
      toad.lineStyle(1, 0x3b2418).beginPath().moveTo(-20, -5).lineTo(-8, -2).lineTo(8, -2).lineTo(20, -5).strokePath();
      toad.lineStyle(1, 0x3b2418).lineBetween(-17, -21, -8, -10);
      toad.fillStyle(0x5f574f).fillRect(14, -4, 14, 2).fillStyle(0xab5236).fillRect(26, -7, 4, 4);
      toad.fillStyle(0x7e2553).fillEllipse(-24, 14, 14, 6).fillEllipse(24, 14, 14, 6);
      scene.tweens.add({
        targets: toad,
        y: FLOOR_Y - 16,
        delay: 450,
        duration: 260,
        ease: 'Quad.In',
        onComplete: () => {
          shade.destroy();
          scene.cameras.main.shake(260, 0.016);
          for (let i = 0; i < 8; i++) {
            const sm = scene.add
              .circle(x + Phaser.Math.Between(-34, 34), FLOOR_Y - 4, Phaser.Math.Between(4, 8), 0xc2c3c7, 0.7)
              .setDepth(14);
            scene.tweens.add({ targets: sm, scale: 2, alpha: 0, y: sm.y - 10, duration: 500, onComplete: () => sm.destroy() });
          }
          world.area(x, FLOOR_Y - 14, 46, 2.6, 220, 'proc');
          later(scene, 700, () => {
            ring(scene, toad.x, toad.y, 0xc2c3c7, 10, 40, 300, 3);
            floatText(scene, toad.x, toad.y - 20, 'BOFF', '#c2c3c7');
            toad.destroy();
          });
        },
      });
    },
  },

  // GARUDA: Sasuke's summoned hawk. Every 10 s it stoops out of the sky on a flyer (or the highest enemy it can lift),
  // carries it up in its talons and lets it fall onto the floor.
  sasuke: {
    tick: (c, time) => {
      if (!every(c, 'hawk', 10000, time)) return;
      const { scene, world } = c;
      const pool = foes(c).filter((t) => !isBoss(t));
      const t = pool.find(flying) ?? pool.sort((a, b) => a.y - b.y)[0];
      if (!t) return;
      apparition(c, c.p.x, c.p.y, c.p.facing, 500);
      const from = t.x < W / 2 ? W + 20 : -20;
      const d = Math.sign(t.x - from);
      const hawk = scene.add.graphics().setDepth(14).setPosition(from, 10);
      // The hawk: wide brown wings outlined in pale grey (so they read on the night sky), barred feathers, a white
      // head, a hooked yellow beak and yellow talons hanging open.
      hawk
        .fillStyle(0xc2c3c7)
        .fillTriangle(-d * 1, 1, -d * 13, -10, -d * 20, 2)
        .fillTriangle(-d * 1, 1, d * 3, -12, -d * 7, -1);
      hawk
        .fillStyle(0x7a5c44)
        .fillTriangle(-d * 2, 0, -d * 12, -8, -d * 18, 1)
        .fillTriangle(-d * 2, 0, d * 2, -10, -d * 6, -2);
      hawk.fillStyle(0x3a3450);
      for (const k of [6, 10, 14]) hawk.fillRect(-d * k, -2, 1, 2);
      hawk.fillStyle(0x7a5c44).fillEllipse(0, 1, 10, 4);
      hawk
        .fillStyle(0xfff1e8)
        .fillCircle(d * 5, -1, 2.5)
        .fillStyle(0x000000)
        .fillRect(d * 5, -2, 1, 1);
      hawk
        .fillStyle(0xffec27)
        .fillTriangle(d * 7, -2, d * 10, 0, d * 7, 0)
        .fillRect(-1, 3, 1, 2)
        .fillRect(1, 3, 1, 2);
      hawk.setScale(1.6);
      scene.tweens.add({
        targets: hawk,
        x: t.x,
        y: t.y - 6,
        duration: 380,
        ease: 'Quad.In',
        onComplete: () => {
          if (!t.active) return void hawk.destroy();
          hold(c, t, 1200);
          world.strike(t, 0.8, 'proc', false, undefined, 0);
          const [x0, y0] = [t.x, t.y];
          scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 450,
            onUpdate: (tw) => {
              const k = tw.getValue() ?? 0;
              // Up to just under the HUD, never into it.
              const [x, y] = [x0 + d * 20 * k, y0 + (Math.min(y0, 44) - y0) * k];
              hawk.setPosition(x, y - 6);
              if (t.active) body(t).reset(x, y);
            },
            onComplete: () => {
              floatText(scene, hawk.x, hawk.y + 6, 'JATUH!', '#29adff');
              scene.tweens.add({ targets: hawk, x: hawk.x + d * 80, y: -30, duration: 400, onComplete: () => hawk.destroy() });
              if (!t.active) return;
              body(t).setVelocity(0, 460);
              later(scene, 320, () => {
                if (!t.active) return;
                burst(scene, t.x, Math.min(t.y + 6, FLOOR_Y), 0x3a3450, 8);
                scene.cameras.main.shake(90, 0.006);
                world.strike(t, 2.2, 'proc', false, undefined, 0);
              });
            },
          });
        },
      });
    },
  },

  // KATAPEL GRAVITASI: a gravity assist. The dash hooks every enemy near its path with gravity and drags it along to
  // where the hero stops, where they are all slammed into the floor together.
  gravityMaster: {
    onDash: (c) => {
      const { scene, p, world } = c;
      const [x0, y0] = [p.x, p.y];
      const caught = foes(c).filter(
        (t) => !isBoss(t) && Math.abs(t.y - y0) < 30 && Math.sign(t.x - x0) === p.facing && Math.abs(t.x - x0) < 90,
      );
      if (!caught.length) return;
      apparition(c, x0, y0, p.facing, 400);
      for (const t of caught) hold(c, t, 500);
      later(scene, 180, () => {
        const [x1, y1] = [p.x, p.y];
        const g = scene.add.graphics().setDepth(12);
        for (const t of caught) {
          if (!t.active) continue;
          g.lineStyle(1, 0x8a3fd1, 0.7).lineBetween(t.x, t.y, x1, y1);
          body(t).setVelocity((x1 - t.x) * 4, (y1 - t.y) * 4);
        }
        scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
        later(scene, 230, () => {
          ring(scene, x1, FLOOR_Y, 0x8a3fd1, 4, 30, 300, 2);
          burst(scene, x1, FLOOR_Y, 0x241a3d, 10);
          scene.cameras.main.shake(100, 0.008);
          world.slam(x1, y1, 40, 420);
          for (const t of caught) if (t.active && dist(t, { x: x1, y: y1 }) < 50) world.strike(t, 1.6, 'proc', false, undefined, 0);
        });
      });
    },
  },

  // FUJIN: Raijin's brother the wind god opens his bag of winds. Every 11 s a gale blows across the whole arena from
  // behind the hero, shoving every enemy (flyers too) toward the far wall.
  lightningLord: {
    tick: (c, time) => {
      if (!every(c, 'wind', 11000, time)) return;
      const { scene, p, world } = c;
      const dir = p.facing;
      const x0 = dir > 0 ? 10 : W - 10;
      const fujin = scene.add.graphics().setDepth(14).setPosition(x0, 40);
      // Fujin: green-skinned, red hair streaming, the bag of winds over his shoulders swelling open.
      fujin.fillStyle(0xfff1e8, 0.8).fillEllipse(0, -6, 26, 8).fillStyle(0xc2c3c7).fillEllipse(0, -6, 20, 5);
      fujin
        .fillStyle(0x008751)
        .fillCircle(0, 4, 5)
        .fillStyle(0xff004d)
        .fillTriangle(-4, 0, 4, 0, -dir * 6, -6);
      fujin.fillStyle(0xffec27).fillRect(-2, 3, 1, 1).fillRect(1, 3, 1, 1).setAlpha(0);
      scene.tweens.add({ targets: fujin, alpha: 0.9, duration: 150, yoyo: true, hold: 800, onComplete: () => fujin.destroy() });
      for (let i = 0; i < 14; i++) {
        later(scene, i * 50, () => {
          const y = Phaser.Math.Between(20, FLOOR_Y - 4);
          const s = scene.add.rectangle(x0, y, 18, 1, 0xc2f0ff, 0.6).setDepth(13);
          scene.tweens.add({ targets: s, x: x0 + dir * W, duration: 500, onComplete: () => s.destroy() });
        });
      }
      for (const t of foes(c)) {
        world.strike(t, 0.5, 'proc', false, undefined, 0);
        if (isBoss(t) || !t.active) continue;
        hold(c, t, 700);
        body(t).setVelocity(dir * 260, flying(t) ? 0 : -60);
      }
    },
  },

  // GLORI NEPHALEM: the power the Worldstone held down wakes in the blood. Every 6th kill (and every elite) leaves a
  // glory globe; the hero picks it up to stack glory for the rest of the round (+6% damage each, 5 at most).
  nephalem: {
    onKill: (c, t) => {
      const s = st(c, () => ({ kills: 0, stacks: 0, globes: [] as Phaser.GameObjects.Arc[] }));
      if (++s.kills % 6 && !t.getData('elite')) return;
      const orb = c.scene.add
        .circle(t.x, Math.min(t.y, FLOOR_Y - 5), 3, 0xffec27)
        .setStrokeStyle(1, 0xff004d)
        .setDepth(11);
      c.scene.tweens.add({ targets: orb, y: orb.y - 2, yoyo: true, repeat: -1, duration: 400 });
      s.globes.push(orb);
    },
    tick: (c) => {
      const { scene, p } = c;
      const s = st(c, () => ({ kills: 0, stacks: 0, globes: [] as Phaser.GameObjects.Arc[] }));
      s.globes = s.globes.filter((o) => {
        if (!o.active) return false;
        if (dist(o, p) > 12 || s.stacks >= 5) return true;
        s.stacks++;
        floatText(scene, p.x, p.y - 26, `GLORI ${s.stacks}`, '#ffec27');
        ring(scene, p.x, p.y, 0xffec27, 3, 16, 260);
        sparks(scene, p.x, p.y, [0xffec27, 0xff004d], 8, 10);
        o.destroy();
        return false;
      });
      const g = layer(c, 'g', 9);
      if (!p.active || !s.stacks) return;
      g.lineStyle(1, 0xffec27, 0.15 + 0.07 * s.stacks).strokeEllipse(p.x, p.y + 1, 12 + s.stacks * 2, 18 + s.stacks * 2);
    },
    modify: (c) => ({ mult: 1 + 0.06 * st(c, () => ({ kills: 0, stacks: 0, globes: [] as Phaser.GameObjects.Arc[] })).stacks }),
  },

  // FATAMORGANA: light bent by heat shows what is not there. Every 10 s a mirage of the hero stands nearby for 3 s;
  // every small enemy runs at it instead, and then it bursts into light in their faces.
  lumina: {
    tick: (c, time) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ x: 0, y: 0, until: 0, img: undefined as Phaser.GameObjects.Image | undefined }));
      if (every(c, 'mirage', 10000, time) && foes(c).length) {
        const x = Phaser.Math.Clamp(p.x - p.facing * 40, 12, W - 12);
        Object.assign(s, { x, y: p.y, until: time + 3000 });
        s.img?.destroy();
        s.img = scene.add.image(x, p.y, p.texture.key).setFlipX(p.flipX).setAlpha(0.6).setTint(0xdfe9f5).setDepth(9);
        floatText(scene, x, p.y - 22, 'FATAMORGANA', '#dfe9f5');
        later(scene, 3000, () => {
          if (!s.img?.active) return;
          s.img.destroy();
          ring(scene, s.x, s.y, 0xfff1e8, 4, 40, 300, 2);
          sparks(scene, s.x, s.y, [0xff77a8, 0x29adff, 0xffec27, 0xfff1e8], 14, 20);
          world.area(s.x, s.y, 40, 1.8, 140, 'proc');
        });
      }
      if (time >= s.until || !s.img?.active) return;
      s.img.setAlpha(0.45 + Math.sin(time / 60) * 0.15).setX(s.x + Math.sin(time / 40));
      for (const t of foes(c)) {
        if (isBoss(t)) continue;
        hold(c, t, 60);
        const dx = s.x - t.x;
        if (Math.abs(dx) < 6) continue;
        if (flying(t)) body(t).setVelocity(Math.sign(dx) * 70, Math.sign(s.y - t.y) * 40);
        else body(t).setVelocityX(Math.sign(dx) * 80);
      }
    },
  },

  // PROMINENSA: plasma leaps between sunspots along the field lines. Every third kill, a loop of solar flame arcs off the
  // body to the nearest enemy and sets it (and whatever stands beside it) burning.
  surya: {
    onKill: (c, t) => {
      const s = st(c, () => ({ n: 0 }));
      if (++s.n % 3) return;
      const o = foes(c)
        .filter((x) => x !== t)
        .sort((a, b) => dist(a, t) - dist(b, t))[0];
      if (!o) return;
      prominence(c.scene, t.x, t.y, o.x, o.y);
      later(c.scene, 90, () => {
        if (!o.active) return;
        sparks(c.scene, o.x, o.y, [0xff004d, 0xffa300, 0xffec27], 10, 12);
        c.world.strike(o, 1.6, 'proc', false, { burn: 0.25 }, 60);
        for (const n of foes(c)) if (n !== o && dist(n, o) < 22) c.world.afflict(n, { burn: 0.15 });
      });
    },
  },

  // SERIGALA BULAN: the moon calls its wolves. Every 15 s two silver wolves leap out of the moonlight around the hero and
  // hunt for 5 s, biting whatever they reach (they bound up to flyers too).
  candra: {
    tick: (c, time, delta) => {
      const { scene, p, world } = c;
      type Wolf = { x: number; y: number; t?: Foe; bite: number };
      const s = st(c, () => ({ wolves: [] as Wolf[], until: 0 }));
      if (every(c, 'howl', 15000, time) && foes(c).length) {
        s.until = time + 5000;
        s.wolves = [-1, 1].map((d) => ({ x: p.x + d * 8, y: p.y, bite: 0 }));
        floatText(scene, p.x, p.y - 26, 'AUUU!', '#9fb4ff');
        apparition(c, p.x, p.y, p.facing, 500);
      }
      const g = layer(c, 'g', 11);
      if (time >= s.until) return;
      const fade = Math.min(1, (s.until - time) / 400);
      for (const w of s.wolves) {
        // Each wolf takes its own prey when there is more than one enemy.
        if (!w.t?.active) {
          const pool = foes(c).sort((a, b) => dist(a, w) - dist(b, w));
          w.t = pool.find((o) => !s.wolves.some((x) => x !== w && x.t === o)) ?? pool[0];
        }
        const t = w.t;
        if (!t) continue;
        const [dx, dy] = [t.x - w.x, t.y - w.y];
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, (delta / 1000) * 140);
        w.x += (dx / d) * step;
        w.y += (dy / d) * step;
        const f = Math.sign(dx) || 1;
        // A running wolf in moon silver: long body, pointed ears, bushy tail, a pale blue eye.
        g.fillStyle(0xc2c3c7, fade)
          .fillEllipse(w.x, w.y, 12, 5)
          .fillTriangle(w.x + f * 5, w.y - 2, w.x + f * 9, w.y - 1, w.x + f * 6, w.y - 6);
        g.fillTriangle(w.x - f * 5, w.y - 1, w.x - f * 11, w.y - 4, w.x - f * 6, w.y + 1);
        g.fillStyle(0x9fb4ff, fade).fillRect(w.x + f * 7, w.y - 3, 1, 1);
        if (d < 10 && time >= w.bite) {
          w.bite = time + 600;
          sparks(scene, t.x, t.y, [0xc2c3c7, 0x9fb4ff], 4, 8);
          world.strike(t, 0.6, 'proc', false, undefined, 30);
        }
      }
    },
  },

  // PENJARA TULANG: the dead king's bone prison. When three enemies close in around the hero, ribs of bone burst out of
  // the floor around each of them, caging and piercing them for 2 s (once every 10 s).
  darkLord: {
    tick: (c, time) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (time < s.ready || !every(c, 'look', 250, time)) return;
      const near = foes(c).filter((t) => dist(t, p) < 44);
      if (near.length < 3) return;
      s.ready = time + 10000;
      floatText(scene, p.x, p.y - 26, 'PENJARA TULANG', '#00e436');
      apparition(c, p.x, p.y, p.facing, 600);
      for (const t of near) {
        hold(c, t, 2000);
        const g = scene.add
          .graphics()
          .setDepth(12)
          .setPosition(t.x, t.y + t.displayHeight / 2);
        // Curved ribs closing over the enemy: bone white with a dark outline and a green soul-glow at the tips.
        for (let i = 0; i < 6; i++) {
          const x = -9 + i * 3.6;
          const h = 10 + (i % 2) * 4;
          g.lineStyle(3, 0x2b2238)
            .lineBetween(x, 0, x * 0.4, -h)
            .lineStyle(1, 0xfff1e8)
            .lineBetween(x, 0, x * 0.4, -h);
          g.fillStyle(0x00e436).fillRect(x * 0.4 - 0.5, -h - 1, 1, 1);
        }
        g.setScale(1, 0.1);
        scene.tweens.add({ targets: g, scaleY: 1, duration: 140, ease: 'Back.Out' });
        scene.tweens.add({ targets: g, alpha: 0, delay: 1800, duration: 250, onComplete: () => g.destroy() });
        for (let k = 0; k < 4; k++) later(scene, 100 + k * 500, () => t.active && world.strike(t, 0.5, 'proc', false, undefined, 0));
      }
    },
  },

  // TRISAGION: the seraphim's hymn, "holy, holy, holy". A full combo carried to its finisher is sung back as a hymn:
  // a halo of light settles on the hero and turns away the next blow (once every 3 s).
  lightLord: {
    onHit: (c, _t, h) => {
      const { p, scene } = c;
      const s = st(c, () => ({ shield: false, ready: 0 }));
      if (h.source !== 'basic' || s.shield || scene.time.now < s.ready || p.comboStep !== p.weapon.combo.length - 1) return;
      s.shield = true;
      floatText(scene, p.x, p.y - 26, 'KUDUS!', '#ffec27');
      ring(scene, p.x, p.y - 14, 0xffec27, 12, 4, 300);
    },
    guard: (c) => {
      const s = st(c, () => ({ shield: false, ready: 0 }));
      if (!s.shield) return false;
      s.shield = false;
      s.ready = c.scene.time.now + 3000;
      c.p.parry('TRISAGION', '#ffec27');
      ring(c.scene, c.p.x, c.p.y, 0xfff1e8, 6, 24, 260, 2);
      sparks(c.scene, c.p.x, c.p.y, [0xffec27, 0xfff1e8], 10, 12);
      apparition(c, c.p.x, c.p.y - 6, c.p.facing, 500);
      return true;
    },
    tick: (c, time) => {
      const s = st(c, () => ({ shield: false, ready: 0 }));
      const g = layer(c, 'g', 12);
      if (!s.shield || !c.p.active) return;
      g.lineStyle(1, 0xffec27, 0.7 + Math.sin(time / 90) * 0.3).strokeEllipse(c.p.x, c.p.y - 13, 10, 3);
    },
  },

  // ZETSU PUTIH: the White Zetsu that Obito wore as a second body. Every 12 s two of them grow out of the floor, latch
  // onto the nearest enemies and drink their chakra for 3 s: the enemy crawls and the stolen chakra heals the hero.
  obito: {
    tick: (c, time) => {
      const { scene, p, world } = c;
      type Leech = { t: Foe; until: number; next: number };
      const s = st(c, () => ({ on: [] as Leech[] }));
      if (every(c, 'zetsu', 12000, time)) {
        const pick = foes(c).slice(0, 2);
        s.on = pick.map((t) => ({ t, until: time + 3000, next: time + 500 }));
        for (const t of pick) burst(scene, t.x, FLOOR_Y, 0xfff1e8, 6);
        if (pick.length) apparition(c, p.x, p.y, p.facing, 500);
      }
      const g = layer(c, 'g', 13);
      s.on = s.on.filter((l) => l.t.active && time < l.until);
      for (const l of s.on) {
        const t = l.t;
        // A small white figure clinging to the enemy's back: round head, the green leaf collar of Zetsu's flytrap.
        const [x, y] = [t.x - 3, t.y - 3];
        g.fillStyle(0xfff1e8)
          .fillCircle(x, y - 3, 2.5)
          .fillRect(x - 2, y - 1, 4, 5);
        g.fillStyle(0x008751)
          .fillTriangle(x - 4, y - 2, x - 1, y - 6, x - 1, y)
          .fillTriangle(x + 4, y - 2, x + 1, y - 6, x + 1, y);
        if (time < l.next) continue;
        l.next = time + 500;
        world.strike(t, 0.35, 'proc', false, { slow: 600 }, 0);
        p.heal(1);
        const mote = scene.add.circle(t.x, t.y, 1.5, 0x29adff).setDepth(13);
        scene.tweens.add({ targets: mote, x: p.x, y: p.y, duration: 300, onComplete: () => mote.destroy() });
      }
    },
  },

  // KERTAS KONAN: Konan, the angel of Amegakure, at Nagato's side. Every 12 s her paper wraps the three nearest enemies
  // tight; the sheets turn into explosive tags, flare and blow up.
  pain: {
    tick: (c, time) => {
      if (!every(c, 'paper', 12000, time)) return;
      const { scene, p, world } = c;
      const prey = foes(c).slice(0, 3);
      if (!prey.length) return;
      apparition(c, p.x - p.facing * 10, p.y - 4, p.facing, 800);
      for (const t of prey) {
        hold(c, t, 1300);
        const g = scene.add.graphics().setDepth(13);
        const draw = (tags: boolean) => {
          if (!t.active) return;
          g.clear().setPosition(t.x, t.y);
          // Sheets of lavender-white paper wound around the body, then the red script of explosive tags.
          for (let i = -2; i <= 2; i++) {
            g.fillStyle(i % 2 ? 0xdfe9f5 : 0xc2c3c7).fillRect(-t.displayWidth / 2 - 1, i * 3 - 1, t.displayWidth + 2, 2);
            if (tags) g.fillStyle(0xff004d).fillRect(-1, i * 3 - 1, 2, 2);
          }
        };
        for (let k = 0; k < 6; k++) later(scene, k * 100, () => draw(false));
        later(scene, 700, () => draw(true));
        later(scene, 1250, () => {
          g.destroy();
          if (!t.active) return;
          explosion(scene, t.x, t.y, 16);
          world.strike(t, 1.8, 'proc', false, undefined, 120);
        });
        for (let i = 0; i < 4; i++) {
          const sheet = scene.add.rectangle(p.x, p.y - 8, 3, 2, 0xdfe9f5).setDepth(13);
          scene.tweens.add({ targets: sheet, x: t.x, y: t.y, duration: 250 + i * 40, onComplete: () => sheet.destroy() });
        }
      }
    },
  },

  // SARI BUNGA CINTA: as Oberon once sent Puck with the love flower, the juice is dropped in two enemies' eyes. For 4 s
  // they only have eyes for each other: they stop fighting and run into each other's arms (where they make one target).
  oberon: {
    tick: (c, time) => {
      const { scene, p } = c;
      const s = st(c, () => ({ pair: [] as Foe[], until: 0 }));
      if (every(c, 'love', 14000, time)) {
        const pool = foes(c).filter((t) => !isBoss(t));
        const a = pool[0];
        const b = pool.filter((t) => t !== a).sort((x, y) => (a ? dist(x, a) - dist(y, a) : 0))[0];
        if (a && b) {
          s.pair = [a, b];
          s.until = time + 4000;
          // Puck: a little bright fairy darting from the hero to each enemy in turn, leaving pink sparkle.
          const puck = scene.add.circle(p.x, p.y - 12, 2, 0xffccaa).setDepth(14);
          scene.tweens.chain({
            targets: puck,
            tweens: [
              { x: a.x, y: a.y - 10, duration: 200 },
              { x: b.x, y: b.y - 10, duration: 200 },
              { y: -10, alpha: 0, duration: 300 },
            ],
            onComplete: () => puck.destroy(),
          });
          floatText(scene, p.x, p.y - 26, 'PUCK!', '#ff77a8');
          apparition(c, p.x - p.facing * 8, p.y, p.facing, 500);
        }
      }
      const g = layer(c, 'g', 13);
      if (time >= s.until) return;
      const [a, b] = s.pair;
      if (!a?.active || !b?.active) return;
      for (const [t, o] of [
        [a, b],
        [b, a],
      ]) {
        hold(c, t, 80);
        const dx = o.x - t.x;
        if (Math.abs(dx) > 8) body(t).setVelocity(Math.sign(dx) * 70, flying(t) ? Math.sign(o.y - t.y) * 40 : body(t).velocity.y);
        // A pink heart over each of the lovers.
        const [x, y] = [t.x, t.y - t.displayHeight / 2 - 6 + Math.sin(time / 120)];
        g.fillStyle(0xff77a8)
          .fillCircle(x - 1, y, 1.5)
          .fillCircle(x + 1, y, 1.5)
          .fillTriangle(x - 2.5, y + 0.5, x + 2.5, y + 0.5, x, y + 3.5);
      }
    },
  },
};
