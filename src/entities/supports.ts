import Phaser from 'phaser';
import type { ClassId } from '../logic/classes.ts';
import { burst, cutMark, floatText, FLOOR_Y, W } from '../gfx/ui.ts';
import { COLOR, PALETTE } from '../gfx/sprites.ts';
import { CLASSES } from '../logic/classes.ts';
import type { HitSource, PlayerWorld } from './arena.ts';
import type { Player } from './Player.ts';
import { bladeLine, bolt, eveningBell, explosion, feathers, glint, kamuiSwirl, lightRay, rinnegan, ring, sparks, taiko } from './skills.ts';

/**
 * DUKUNGAN: what the benched hero of the party does for the one on the field (RunScene calls these hooks for
 * `bench`). Each one is that hero's own lore, a mechanic no other hero has, drawn in its own colors; the hero itself
 * shows up as a ghost (`apparition`) when it steps in. Hits are 'proc' (they never re-trigger hit effects).
 */
export interface SupportCtx {
  p: Player;
  world: PlayerWorld;
  scene: Phaser.Scene;
  /** The benched hero giving the support. */
  bench: ClassId;
  /** Per-round state of this support (fresh when the bench hero changes). */
  s: Record<string, unknown>;
  /** Run coins (Toji's bounty pays out). */
  coins(n: number): void;
}

type Foe = Phaser.GameObjects.Sprite;

export interface Support {
  /** Every frame of the round. */
  tick?(c: SupportCtx, time: number, delta: number): void;
  /** One of the hero's own hits landed (never 'proc'). */
  onHit?(c: SupportCtx, t: Foe, h: { source: HitSource; crit: boolean; killed: boolean; dmg: number }): void;
  onKill?(c: SupportCtx, t: Foe): void;
  /** A hit is about to land on the hero (after the class passive had its chance); true turns it away. */
  guard?(c: SupportCtx, dmg: number, fromX: number, from?: Foe): boolean;
  /** The hero took a hit (`dmg` before damage taken), `from` = the enemy touching, if any. */
  onHurt?(c: SupportCtx, dmg: number, fromX: number, from?: Foe): void;
  onDash?(c: SupportCtx): void;
  onJump?(c: SupportCtx): void;
  onCast?(c: SupportCtx, kind: 'skill' | 'fusion' | 'ult'): void;
  /** Sharpen one of the hero's hits. */
  modify?(c: SupportCtx, t: Foe, source: HitSource): { mult?: number; crit?: boolean } | void;
  /** Multiplier on damage the hero takes (Sukuna's binding vow). */
  taken?: number;
}

const isBoss = (t: Foe) => 'tier' in t;
const hpOf = (t: Foe) => t as unknown as { hp: number; maxHp: number };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);
const body = (t: Foe) => t.body as Phaser.Physics.Arcade.Body;
/** Damage multiplier that lands `amount` HP on its own (strike scales by the hero's damage stat). */
const flat = (c: SupportCtx, amount: number) => amount / Math.max(1, c.p.stats.damage);

/** Per-round state of the support, created on first use. */
function st<T extends object>(c: SupportCtx, init: () => T): T {
  return (c.s.v ??= init()) as T;
}

/** True once every `ms` (the first time `ms` after the round starts). */
function every(c: SupportCtx, key: string, ms: number, time: number): boolean {
  const next = (c.s[key] as number | undefined) ?? time + ms;
  c.s[key] = next;
  if (time < next) return false;
  c.s[key] = time + ms;
  return true;
}

/** Hold an enemy in place (bosses are too heavy and only take the damage). */
function hold(c: SupportCtx, t: Foe, ms: number): void {
  if (isBoss(t) || !t.active) return;
  const e = t as unknown as { stunUntil: number };
  e.stunUntil = Math.max(e.stunUntil ?? 0, c.scene.time.now + ms);
  body(t).setVelocityX(0);
}

/** The benched hero, as a ghost in its own color: it steps in, does its part, and fades. */
function apparition(c: SupportCtx, x: number, y: number, facing = c.p.facing, ms = 450): void {
  const color = PALETTE[CLASSES[c.bench].color];
  const g = c.scene.add
    .image(x, y, `hero_idle_${c.bench}`)
    .setFlipX(facing < 0)
    .setTint(color)
    .setAlpha(0)
    .setDepth(12);
  c.scene.tweens.add({ targets: g, alpha: 0.75, duration: 90, yoyo: true, hold: ms - 180, onComplete: () => g.destroy() });
}

/** Enemies (and bosses) still standing. */
const foes = (c: SupportCtx) => c.world.targets(c.p.x, c.p.y).filter((t) => t.active);

export const SUPPORTS: Record<ClassId, Support> = {
  // AVALON TERTANAM: as Avalon once lay sealed in Shirou's body, the sheath closes the hero's wounds: golden
  // plates of the scabbard fold over them and the HP flows back over a moment and a half.
  ksatria: {
    onHurt: (c) => {
      const { p, scene } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (p.hp >= p.stats.maxHp * 0.5 || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 20000;
      const total = Math.round(p.stats.maxHp * 0.15);
      const sheath = scene.add.graphics().setDepth(12);
      const draw = (k: number) => {
        sheath.clear().setPosition(p.x, p.y);
        // The scabbard: a long gold body with blue enamel panels, unfolding around the hero.
        for (const side of [-1, 1]) {
          const a = side * (0.4 + 0.9 * k);
          const [dx, dy] = [Math.sin(a) * 9, -Math.cos(a) * 9];
          sheath.fillStyle(0xab5236).fillRect(dx - 2, dy - 6, 4, 12);
          sheath.fillStyle(0xffec27).fillRect(dx - 1, dy - 6, 2, 12);
          sheath.fillStyle(0x29adff).fillRect(dx - 1, dy - 3, 2, 3);
        }
        sheath.lineStyle(1, 0xfff1e8, 0.6 * (1 - k)).strokeCircle(0, 0, 6 + 8 * k);
      };
      floatText(scene, p.x, p.y - 26, 'AVALON', COLOR.gold);
      apparition(c, p.x - p.facing * 10, p.y, p.facing, 700);
      for (let i = 0; i < 6; i++) {
        later(scene, i * 250, () => {
          if (!p.active) return;
          draw(i / 5);
          p.heal(Math.ceil(total / 6));
          sparks(scene, p.x, p.y, [0xffec27, 0x29adff, 0xfff1e8], 4, 10);
        });
      }
      later(scene, 1600, () => sheath.destroy());
    },
  },

  // LONCENG AZRAEL: the Old Man of the Mountain rings the evening bell; whoever's hour has come hears it. Every 12 s
  // the bell tolls over the arena, and each enemy below 15% HP is beheaded by a blue-flamed cut; bosses lose 4%.
  pembunuh: {
    tick: (c, time) => {
      if (!every(c, 'bell', 12000, time)) return;
      const { scene, world } = c;
      const bell = eveningBell(scene, W / 2, 24, 0.8)
        .setDepth(14)
        .setAlpha(0);
      scene.tweens.add({ targets: bell, alpha: 1, duration: 200 });
      scene.tweens.add({ targets: bell, angle: { from: -14, to: 14 }, yoyo: true, repeat: 2, duration: 220 });
      later(scene, 1300, () => scene.tweens.add({ targets: bell, alpha: 0, duration: 300, onComplete: () => bell.destroy() }));
      for (let i = 0; i < 3; i++) later(scene, i * 220, () => ring(scene, W / 2, 30, 0x29adff, 6, 160, 700, 1));
      later(scene, 600, () => {
        for (const t of foes(c)) {
          const h = hpOf(t);
          if (!isBoss(t) && h.hp > h.maxHp * 0.15) continue;
          // A vertical blade of blue grave-fire through the neck.
          bladeLine(scene, t.x - 10, t.y - 14, t.x + 10, t.y - 2, 0x29adff, 160);
          sparks(scene, t.x, t.y - 6, [0x29adff, 0x1d2b53, 0xfff1e8], 10, 14);
          if (isBoss(t)) world.strike(t, flat(c, h.maxHp * 0.04), 'proc', false, undefined, 0);
          else {
            floatText(scene, t.x, t.y - 22, 'PENGGAL', '#29adff');
            world.strike(t, flat(c, h.hp + 1), 'proc', true, undefined, 0);
          }
        }
      });
    },
  },

  // RIASTRAD: Cu Chulainn's warp spasm. Fifteen blows in a row without being hurt and the frenzy takes the hero: a
  // red heat-haze, blows half again as hard that hurl enemies away. Getting hit breaks the count.
  dragoon: {
    onHit: (c, t, h) => {
      if (h.source !== 'basic') return;
      const s = st(c, () => ({ n: 0, until: 0 }));
      const now = c.scene.time.now;
      if (now < s.until) {
        if (t.active && !isBoss(t)) body(t).setVelocity(Math.sign(t.x - c.p.x) * 220, -160);
        return;
      }
      if (++s.n < 15) return;
      s.n = 0;
      s.until = now + 5000;
      floatText(c.scene, c.p.x, c.p.y - 26, 'RIASTRAD!', '#ff004d');
      c.scene.cameras.main.shake(150, 0.008);
      apparition(c, c.p.x, c.p.y - 4, c.p.facing, 500);
      ring(c.scene, c.p.x, c.p.y, 0xff004d, 4, 30, 300, 2);
    },
    onHurt: (c) => void (st(c, () => ({ n: 0, until: 0 })).n = 0),
    modify: (c) => (c.scene.time.now < st(c, () => ({ n: 0, until: 0 })).until ? { mult: 1.5 } : undefined),
    tick: (c, time) => {
      const s = st(c, () => ({ n: 0, until: 0 }));
      if (time >= s.until || Math.floor(time / 60) % 2) return;
      // Steam of the frenzy rising off the body.
      const puff = c.scene.add.circle(c.p.x + Phaser.Math.Between(-4, 4), c.p.y, 2, 0xff004d, 0.5).setDepth(11);
      c.scene.tweens.add({ targets: puff, y: puff.y - 14, alpha: 0, scale: 2, duration: 400, onComplete: () => puff.destroy() });
    },
  },

  // DUA BELAS TUGAS: the Twelve Labors. Every six kills one labor is done (a laurel leaf lights in the ring over the
  // hero's head) and each finished labor adds 4% damage for the rest of the round.
  berserker: {
    onKill: (c) => {
      const s = st(c, () => ({ kills: 0, labors: 0 }));
      if (s.labors >= 12 || ++s.kills % 6) return;
      s.labors++;
      floatText(c.scene, c.p.x, c.p.y - 26, `TUGAS ${s.labors}/12`, '#ffec27');
      ring(c.scene, c.p.x, c.p.y - 12, 0xffec27, 3, 16, 300);
      apparition(c, c.p.x + c.p.facing * 10, c.p.y, -c.p.facing, 500);
    },
    modify: (c) => ({ mult: 1 + 0.04 * st(c, () => ({ kills: 0, labors: 0 })).labors }),
    tick: (c) => {
      const s = st(c, () => ({ kills: 0, labors: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      const g = (s.g ??= c.scene.add.graphics().setDepth(12));
      g.clear();
      if (!s.labors || !c.p.active) return;
      // The laurel: twelve leaves in a crown over the head, gold for each labor finished.
      for (let i = 0; i < 12; i++) {
        const a = Math.PI + (i / 11) * Math.PI;
        g.fillStyle(i < s.labors ? 0xffec27 : 0x5f574f).fillRect(c.p.x + Math.cos(a) * 7 - 0.5, c.p.y - 12 + Math.sin(a) * 3, 1, 1);
      }
    },
  },

  // BROKEN PHANTASM: every 8 s Archer traces a blade over whatever the hero strikes next; it falls point-first and
  // he breaks it, the Noble Phantasm bursting like a bomb.
  pemburu: {
    tick: (c, time) => {
      if (!c.s.armed && every(c, 'trace', 8000, time)) {
        c.s.armed = true;
        glint(c.scene, c.p.x, c.p.y - 14);
      }
    },
    onHit: (c, t) => {
      if (!c.s.armed || !t.active) return;
      c.s.armed = false;
      const { scene, world } = c;
      const [x, y] = [t.x, t.y];
      const blade = scene.add
        .image(x, y - 90, 'w_bakuya')
        .setRotation(Math.PI / 2)
        .setTint(0x29adff)
        .setScale(1.6)
        .setDepth(13);
      later(scene, 80, () => blade.active && blade.clearTint());
      apparition(c, Phaser.Math.Clamp(x - c.p.facing * 30, 8, W - 8), FLOOR_Y - 8, c.p.facing, 600);
      scene.tweens.add({
        targets: blade,
        y,
        duration: 220,
        ease: 'Quad.In',
        onComplete: () => {
          blade.destroy();
          floatText(scene, x, y - 24, 'BROKEN PHANTASM', '#29adff');
          explosion(scene, x, y, 26);
          scene.cameras.main.shake(140, 0.01);
          world.area(x, y, 30, 2.2, 180, 'proc');
        },
      });
    },
  },

  // PANAH PENUNTUN: a crit marks the prey; from the edge of the screen behind the hero, three arcane arrows come
  // looking for it.
  magicArcher: {
    onHit: (c, t, h) => {
      if (!h.crit || h.killed || !t.active) return;
      const s = st(c, () => ({ ready: 0 }));
      if (c.scene.time.now < s.ready) return;
      s.ready = c.scene.time.now + 3000;
      const from = c.p.facing > 0 ? 6 : W - 6;
      apparition(c, from, 60, c.p.facing, 600);
      for (let i = 0; i < 3; i++) {
        later(c.scene, 120 + i * 90, () => {
          const y = 40 + i * 18;
          const a = Phaser.Math.Angle.Between(from, y, t.x, t.y);
          sparks(c.scene, from, y, [0xc080ff, 0x29adff], 4, 8);
          c.world.shot({
            x: from,
            y,
            vx: Math.cos(a) * 260,
            vy: Math.sin(a) * 260,
            texture: 'panahArkana',
            tint: 0xc080ff,
            mult: 0.7,
            source: 'proc',
            homing: true,
          });
        });
      }
    },
  },

  // LENTERA ARWAH: each soul freed by a kill drifts into the reaper's lantern; at eight it wails, and every enemy
  // runs from the hero in terror for a moment.
  reaper: {
    onKill: (c, t) => {
      const { scene, p } = c;
      const s = st(c, () => ({ souls: 0, fleeUntil: 0, from: 0 }));
      const soul = scene.add.image(t.x, t.y, 'soul').setTint(0x7cf0c0).setDepth(13);
      scene.tweens.add({
        targets: soul,
        x: p.x - p.facing * 8,
        y: p.y - 14,
        alpha: 0.4,
        duration: 500,
        ease: 'Sine.In',
        onComplete: () => soul.destroy(),
      });
      if (++s.souls < 8) return;
      s.souls = 0;
      later(scene, 500, () => {
        s.fleeUntil = scene.time.now + 2500;
        s.from = p.x;
        floatText(scene, p.x, p.y - 26, 'RATAPAN', '#7cf0c0');
        apparition(c, p.x - p.facing * 10, p.y, p.facing, 900);
        for (let i = 0; i < 3; i++) later(scene, i * 150, () => ring(scene, p.x, p.y, 0x7cf0c0, 6, 120, 600, 1));
        for (const o of foes(c)) c.world.strike(o, 0.8, 'proc', false, undefined, 0);
      });
    },
    tick: (c, time) => {
      const s = st(c, () => ({ souls: 0, fleeUntil: 0, from: 0 }));
      // The lantern at the hero's shoulder, fuller with each soul.
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= c.scene.add.graphics().setDepth(12));
      g.clear();
      if (c.p.active && s.souls) {
        const [x, y] = [c.p.x - c.p.facing * 6, c.p.y - 12];
        g.lineStyle(1, 0x5f574f).strokeRect(x - 2, y - 2, 4, 5);
        g.fillStyle(0x7cf0c0, 0.3 + 0.08 * s.souls).fillRect(x - 1, y - 1, 2, 3);
      }
      if (time >= s.fleeUntil) return;
      for (const t of foes(c)) {
        if (isBoss(t)) continue;
        hold(c, t, 60);
        const dir = Math.sign(t.x - s.from) || 1;
        const b = body(t);
        if ((t as unknown as { flying: boolean }).flying) b.setVelocity(dir * 80, -30);
        else b.setVelocityX(b.blocked.left || b.blocked.right ? 0 : dir * 90);
      }
    },
  },

  // TEMBAKAN PELINDUNG: covering fire. Whoever hurts the hero gets a sniper round from the edge of the screen: a
  // tracer, the muzzle flash, a heavy knock-back.
  gunners: {
    onHurt: (c, _dmg, fromX, from) => {
      const s = st(c, () => ({ ready: 0 }));
      if (c.scene.time.now < s.ready) return;
      const t = from?.active ? from : foes(c).find((o) => Math.abs(o.x - fromX) < 30);
      if (!t) return;
      s.ready = c.scene.time.now + 4000;
      const sx = t.x < W / 2 ? W - 4 : 4;
      const sy = 30;
      apparition(c, sx, sy + 4, sx > W / 2 ? -1 : 1, 500);
      later(c.scene, 250, () => {
        if (!t.active) return;
        const g = c.scene.add.graphics().setDepth(14);
        g.lineStyle(2, 0xffa300, 0.5).lineBetween(sx, sy, t.x, t.y).lineStyle(1, 0xfff1e8).lineBetween(sx, sy, t.x, t.y);
        c.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        burst(c.scene, sx, sy, 0xffec27, 5);
        burst(c.scene, t.x, t.y, 0xff004d, 8);
        c.world.strike(t, 2.5, 'proc', true, undefined, 260);
      });
    },
  },

  // FORMASI PENGUMPUL QI: every 12 s the Cultivator inscribes a qi-gathering array at the hero's feet for 4 s;
  // inside it, cooldowns come back three times as fast.
  cultivator: {
    tick: (c, time, delta) => {
      const { scene, p } = c;
      const s = st(c, () => ({ x: 0, y: 0, until: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      if (every(c, 'array', 12000, time)) {
        Object.assign(s, { x: p.x, y: FLOOR_Y, until: time + 4000 });
        apparition(c, p.x, p.y, p.facing, 500);
      }
      const g = (s.g ??= scene.add.graphics().setDepth(3));
      g.clear();
      if (time >= s.until) return;
      // The array: two counter-turning rings of runes on the floor (squashed into perspective) with a trigram star.
      const k = Math.min(1, (s.until - time) / 400);
      g.setPosition(s.x, s.y);
      for (const [r, dir, col] of [
        [30, 1, 0x00e436],
        [20, -1, 0xffec27],
      ] as const) {
        g.lineStyle(1, col, 0.8 * k).strokeEllipse(0, 0, r * 2, r * 0.5);
        for (let i = 0; i < 8; i++) {
          const a = (time / 600) * dir + (i / 8) * Math.PI * 2;
          g.fillStyle(col, k).fillRect(Math.cos(a) * r - 1, Math.sin(a) * r * 0.25 - 1, 2, 2);
        }
      }
      const inside = Math.abs(p.x - s.x) < 30 && p.y > s.y - 40;
      if (!inside) return;
      p.hasten(delta * 2);
      if (Math.floor(time / 90) % 2) {
        const mote = scene.add.rectangle(p.x + Phaser.Math.Between(-6, 6), p.y + 6, 1, 1, 0x00e436).setDepth(12);
        scene.tweens.add({ targets: mote, y: p.y - 12, alpha: 0, duration: 400, onComplete: () => mote.destroy() });
      }
    },
  },

  // ORBIT ELEMEN: four elemental spheres circle the hero; an enemy that touches one gets its element (fire burns, ice
  // freezes, lightning strikes, stone knocks it flying) and that sphere forms again 5 s later.
  elementalis: {
    tick: (c, time) => {
      const { scene, p, world } = c;
      const ELEMENTS = [
        { color: 0xff004d, glow: 0xffa300 },
        { color: 0x29adff, glow: 0xc2f0ff },
        { color: 0xffec27, glow: 0xfff1e8 },
        { color: 0xab5236, glow: 0xffccaa },
      ];
      const s = st(c, () => ({ back: [0, 0, 0, 0], g: undefined as Phaser.GameObjects.Graphics | undefined }));
      const g = (s.g ??= scene.add.graphics().setDepth(11));
      g.clear();
      if (!p.active) return;
      ELEMENTS.forEach((e, i) => {
        if (time < s.back[i]) return;
        const a = time / 400 + (i / 4) * Math.PI * 2;
        const [x, y] = [p.x + Math.cos(a) * 16, p.y - 2 + Math.sin(a) * 9];
        g.fillStyle(e.glow, 0.35)
          .fillCircle(x, y, 3.5)
          .fillStyle(e.color)
          .fillCircle(x, y, 2)
          .fillStyle(0xfff1e8)
          .fillRect(x - 1, y - 1, 1, 1);
        const t = foes(c).find((o) => Math.abs(o.x - x) < o.displayWidth / 2 + 2 && Math.abs(o.y - y) < o.displayHeight / 2 + 2);
        if (!t) return;
        s.back[i] = time + 5000;
        sparks(scene, x, y, [e.color, e.glow], 8, 12);
        if (i === 0) world.strike(t, 0.6, 'proc', false, { burn: 0.2 }, 40);
        if (i === 1) world.strike(t, 0.5, 'proc', false, { freeze: 1000 }, 0);
        if (i === 2) {
          bolt(scene, t.x, 0, t.x, t.y);
          world.strike(t, 1.2, 'proc', false, undefined, 60);
        }
        if (i === 3) world.strike(t, 0.9, 'proc', false, undefined, 260);
      });
    },
  },

  // TANGKISAN BAYANG: the samurai keeps watch over the hero's back. A blow from behind meets his ghost's blade instead,
  // and the answer is one iai cut through the attacker.
  samurai: {
    guard: (c, _dmg, fromX, from) => {
      const { scene, p } = c;
      const s = st(c, () => ({ ready: 0 }));
      const behind = Math.sign(fromX - p.x) === -p.facing;
      if (!behind || scene.time.now < s.ready) return false;
      s.ready = scene.time.now + 6000;
      const side = -p.facing;
      apparition(c, p.x + side * 7, p.y, side, 500);
      p.parry('TANGKIS', '#fff1e8');
      sparks(scene, p.x + side * 9, p.y - 2, [0xfff1e8, 0xffec27], 8, 10);
      const t = from?.active ? from : foes(c).find((o) => Math.sign(o.x - p.x) === side && dist(o, p) < 50);
      if (t) {
        later(scene, 120, () => {
          if (!t.active) return;
          bladeLine(scene, p.x + side * 4, p.y, t.x + side * 14, t.y, 0xfff1e8, 120);
          cutMark(scene, t.x, t.y, 0xfff1e8);
          c.world.strike(t, 2.2, 'proc', true, undefined, 180);
        });
      }
      return true;
    },
  },

  // CAP DENDAM: whoever draws the hero's blood is branded for vengeance (a black-violet sigil over it); the next three
  // blows on it hit 60% harder and drink its life.
  darkAvenger: {
    onHurt: (c, _dmg, fromX, from) => {
      const t = from?.active ? from : foes(c).find((o) => Math.abs(o.x - fromX) < 30);
      if (!t) return;
      t.setData('vendetta', 3);
      floatText(c.scene, t.x, t.y - 22, 'DENDAM', '#c080ff');
      apparition(c, c.p.x - c.p.facing * 8, c.p.y, c.p.facing, 400);
    },
    modify: (c, t) => {
      const n = (t.getData('vendetta') as number | undefined) ?? 0;
      if (!n) return;
      t.setData('vendetta', n - 1);
      c.p.heal(2);
      sparks(c.scene, t.x, t.y, [0x7e2553, 0xc080ff, 0x000000], 6, 10);
      return { mult: 1.6 };
    },
    tick: (c) => {
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= c.scene.add.graphics().setDepth(13));
      g.clear();
      for (const t of foes(c)) {
        const n = (t.getData('vendetta') as number | undefined) ?? 0;
        if (!n) continue;
        const [x, y] = [t.x, t.y - t.displayHeight / 2 - 6];
        g.lineStyle(1, 0xc080ff)
          .strokeCircle(x, y, 3)
          .lineBetween(x - 3, y - 3, x + 3, y + 3)
          .lineBetween(x + 3, y - 3, x - 3, y + 3);
        for (let i = 0; i < n; i++) g.fillStyle(0x7e2553).fillRect(x - 3 + i * 3, y + 5, 2, 1);
      }
    },
  },

  // MANTRA DOA: in Asura's world, prayer is power. Each kill frees a golden glyph that flies to the hero; ten of them
  // and the mandala turns once around him, filling a quarter of the ult meter.
  ashura: {
    onKill: (c, t) => {
      const { scene, p } = c;
      const s = st(c, () => ({ n: 0 }));
      // The glyph: a little gold diamond with a bindu dot and a crescent over it.
      const glyph = scene.add.graphics().setPosition(t.x, t.y).setDepth(13);
      glyph.fillStyle(0xffa300).fillTriangle(0, -4, 3, 0, -3, 0).fillTriangle(0, 4, 3, 0, -3, 0);
      glyph.fillStyle(0xffec27).fillRect(-1, -1, 2, 2).fillRect(-2, -7, 4, 1).fillRect(0, -9, 1, 1);
      scene.tweens.add({
        targets: glyph,
        x: p.x,
        y: p.y - 6,
        scale: 0.6,
        duration: 450,
        ease: 'Sine.In',
        onComplete: () => glyph.destroy(),
      });
      if (++s.n < 10) return;
      s.n = 0;
      later(scene, 450, () => {
        p.addUlt(25);
        floatText(scene, p.x, p.y - 26, 'MANTRA!', '#ffec27');
        apparition(c, p.x, p.y - 4, p.facing, 600);
        const g = scene.add.graphics().setDepth(12).setPosition(p.x, p.y);
        g.lineStyle(1, 0xffec27).strokeCircle(0, 0, 14).strokeCircle(0, 0, 9);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.fillStyle(0xffa300).fillTriangle(
            Math.cos(a) * 9,
            Math.sin(a) * 9,
            Math.cos(a + 0.2) * 14,
            Math.sin(a + 0.2) * 14,
            Math.cos(a - 0.2) * 14,
            Math.sin(a - 0.2) * 14,
          );
        }
        scene.tweens.add({ targets: g, angle: 180, scale: 1.6, alpha: 0, duration: 700, onComplete: () => g.destroy() });
      });
    },
  },

  // BAYANG NAGA: every 15 s the monarch's dragon form passes across the sky; its shadow sweeps the arena and everything
  // under it burns and freezes in fear.
  antares: {
    tick: (c, time) => {
      if (!every(c, 'flight', 15000, time)) return;
      const { scene, world } = c;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x0 = dir > 0 ? -50 : W + 50;
      const dragon = scene.add.graphics().setDepth(14).setPosition(x0, 56);
      // A dark winged silhouette against the moonlit sky: swept-back bat wings with finger bones, a long neck and
      // horned head forward, a whip tail behind, an ember of an eye; a dull crimson rim catches the light.
      const d = dir;
      const wing = (up: number, col: number) => {
        dragon.fillStyle(col).fillTriangle(d * 4, 0, -d * 6, up * 24, -d * 16, 0);
        dragon.fillTriangle(-d * 6, up * 24, -d * 12, up * 18, -d * 16, 0);
      };
      wing(-1, 0x7e2553);
      wing(1, 0x7e2553);
      dragon.setScale(1.4);
      const inner = (up: number) => {
        dragon.fillStyle(0x1d0a1a).fillTriangle(d * 3, 0, -d * 6, up * 22, -d * 14, 0);
        dragon.lineStyle(1, 0x3a1a2a);
        for (const k of [0.35, 0.65]) dragon.lineBetween(-d * 6, up * 22, -d * 14 * k - d * 2, 0);
      };
      inner(-1);
      inner(1);
      dragon.fillStyle(0x1d0a1a).fillEllipse(0, 0, 26, 7);
      dragon.fillTriangle(d * 10, -2, d * 20, -6, d * 18, 1).fillTriangle(d * 18, -6, d * 26, -5, d * 20, -2);
      dragon.fillTriangle(d * 20, -6, d * 18, -10, d * 22, -6);
      dragon.fillTriangle(-d * 12, -1, -d * 34, 2, -d * 12, 2).fillTriangle(-d * 34, 2, -d * 38, -1, -d * 36, 4);
      dragon.fillStyle(0xff004d).fillRect(d * 22 - 1, -5, 2, 1);
      const shade = scene.add.ellipse(x0, FLOOR_Y - 1, 46, 6, 0x000000, 0.35).setDepth(3);
      const hit = new Set<Foe>();
      scene.cameras.main.shake(1200, 0.003);
      apparition(c, c.p.x, c.p.y, dir, 500);
      scene.tweens.add({
        targets: [dragon, shade],
        x: x0 + dir * (W + 100),
        duration: 1300,
        onUpdate: () => {
          for (const t of foes(c)) {
            if (hit.has(t) || Math.abs(t.x - dragon.x) > 16) continue;
            hit.add(t);
            sparks(scene, t.x, t.y, [0xff004d, 0xffa300], 6, 10);
            hold(c, t, 1500);
            world.strike(t, 1, 'proc', false, { burn: 0.2 }, 0);
          }
        },
        onComplete: () => [dragon, shade].forEach((o) => o.destroy()),
      });
    },
  },

  // HADIAH RAJA: the king is generous today. Every 25 s a golden gate opens over the hero and lets fall one treasure:
  // a potion (HP), a golden aegis (a few seconds untouchable) or a sip of mana (ult meter).
  gilgamesh: {
    tick: (c, time) => {
      if (!every(c, 'gift', 25000, time)) return;
      const { scene, p } = c;
      const [x, y] = [p.x, Math.max(16, p.y - 40)];
      p.gatePortal(x, y, Math.PI / 2);
      const gift = Phaser.Math.Between(0, 2);
      const icon = scene.add.image(x, y, ['i_ramuan', 'i_perisaiDewa', 'i_kristal'][gift]).setDepth(13);
      scene.tweens.add({
        targets: icon,
        y: p.y - 4,
        duration: 380,
        ease: 'Quad.In',
        onComplete: () => {
          icon.destroy();
          ring(scene, p.x, p.y, 0xffec27, 3, 20, 260);
          sparks(scene, p.x, p.y, [0xffec27, 0xfff1e8], 10, 14);
          if (gift === 0) p.heal(Math.round(p.stats.maxHp * 0.15));
          if (gift === 1) p.invuln(3000);
          if (gift === 2) p.addUlt(30);
          floatText(scene, p.x, p.y - 26, ['RAMUAN RAJA', 'AEGIS EMAS', 'MANA RAJA'][gift], COLOR.gold);
        },
      });
    },
  },

  // SUMPAH TERIKAT: a binding vow. The hero accepts 20% more damage taken; in exchange every tenth hit is Cleave, which
  // adjusts itself to the target's toughness: 8% of its max HP (3% on bosses), cut in a cross.
  sukuna: {
    taken: 1.2,
    onHit: (c, t, h) => {
      if (h.killed || !t.active) return;
      const s = st(c, () => ({ n: 0 }));
      if (++s.n % 10) return;
      const m = hpOf(t).maxHp * (isBoss(t) ? 0.03 : 0.08);
      bladeLine(c.scene, t.x - 12, t.y - 12, t.x + 12, t.y + 12, 0xff004d, 120);
      bladeLine(c.scene, t.x + 12, t.y - 12, t.x - 12, t.y + 12, 0xff004d, 120);
      floatText(c.scene, t.x, t.y - 24, 'CLEAVE', '#ff004d');
      c.world.strike(t, flat(c, m), 'proc', false, undefined, 60);
    },
  },

  // ENAM MATA: the Six Eyes waste no cursed energy. Every third skill the hero casts comes back at once; a pair of
  // blue eyes opens over the hero to show it.
  gojo: {
    onCast: (c, kind) => {
      if (kind !== 'skill') return;
      const s = st(c, () => ({ n: 0 }));
      if (++s.n % 3) return;
      c.p.resetSkill();
      const g = c.scene.add
        .graphics()
        .setDepth(14)
        .setPosition(c.p.x, c.p.y - 20);
      for (const dx of [-4, 4]) g.fillStyle(0xfff1e8).fillEllipse(dx, 0, 6, 3).fillStyle(0x29adff).fillCircle(dx, 0, 1.2);
      c.scene.tweens.add({ targets: g, alpha: 0, y: g.y - 6, delay: 400, duration: 300, onComplete: () => g.destroy() });
      floatText(c.scene, c.p.x, c.p.y - 30, 'ENAM MATA', '#29adff');
    },
  },

  // BURUAN BERHADIAH: Toji works for money. One enemy carries a price (a gold mark over it); killing it pays six coins
  // and the next blow lands double. Then a new name goes on the list.
  toji: {
    tick: (c) => {
      const s = st(c, () => ({
        mark: undefined as Foe | undefined,
        double: false,
        g: undefined as Phaser.GameObjects.Graphics | undefined,
      }));
      if (!s.mark?.active) {
        const pool = foes(c).filter((t) => !isBoss(t));
        s.mark = pool.find((t) => t.getData('elite')) ?? pool[Phaser.Math.Between(0, Math.max(0, pool.length - 1))];
      }
      const g = (s.g ??= c.scene.add.graphics().setDepth(13));
      g.clear();
      const t = s.mark;
      if (!t?.active) return;
      const [x, y] = [t.x, t.y - t.displayHeight / 2 - 7];
      g.fillStyle(0x000000)
        .fillRect(x - 4, y - 3, 9, 7)
        .fillStyle(0xffec27)
        .fillRect(x - 3, y - 2, 7, 5);
      g.fillStyle(0x000000)
        .fillRect(x, y - 2, 1, 5)
        .fillRect(x - 2, y - 1, 5, 1);
    },
    onKill: (c, t) => {
      const s = st(c, () => ({ mark: undefined as Foe | undefined, double: false }));
      if (t !== s.mark) return;
      s.mark = undefined;
      s.double = true;
      c.coins(6);
      floatText(c.scene, t.x, t.y - 30, '+6 KOIN HADIAH', COLOR.gold);
      apparition(c, t.x, Math.min(t.y, FLOOR_Y - 8), -c.p.facing, 500);
      burst(c.scene, t.x, t.y, 0xffec27, 12);
    },
    modify: (c, _t, source) => {
      const s = st(c, () => ({ mark: undefined as Foe | undefined, double: false }));
      if (!s.double || source === 'proc') return;
      s.double = false;
      return { mult: 2 };
    },
  },

  // RINBO HENGOKU: Madara's shadows in Limbo cannot be seen; every 10 s the three enemies nearest the hero are struck
  // by nothing at all. Only the ripples of the other world show where the blows land.
  madara: {
    tick: (c, time) => {
      if (!every(c, 'limbo', 10000, time)) return;
      const { scene, p, world } = c;
      const g = scene.add.graphics().setDepth(14);
      rinnegan(g, p.x, p.y - 22, 4);
      scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() });
      foes(c)
        .slice(0, 3)
        .forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            later(scene, 150 + i * 200 + k * 70, () => {
              if (!t.active) return;
              ring(scene, t.x + Phaser.Math.Between(-4, 4), t.y + Phaser.Math.Between(-6, 4), 0x2a1a3a, 1, 10, 220, 2);
              world.strike(t, 0.7, 'proc', false, undefined, 70);
            });
          }
        });
    },
  },

  // KAJUKAI KORIN: a forest of flowering trees in miniature. Every 14 s blossoms open along the floor around the
  // hero, and their pollen puts the enemies standing there to sleep.
  hashirama: {
    tick: (c, time) => {
      if (!every(c, 'bloom', 14000, time)) return;
      const { scene, p, world } = c;
      apparition(c, p.x, p.y, p.facing, 600);
      for (let i = 0; i < 12; i++) {
        const x = Phaser.Math.Clamp(p.x + (i - 5.5) * 12 + Phaser.Math.Between(-3, 3), 4, W - 4);
        later(scene, Math.abs(i - 5.5) * 40, () => {
          const f = scene.add.graphics().setDepth(4).setPosition(x, FLOOR_Y);
          f.fillStyle(0x008751).fillRect(0, -6, 1, 6);
          f.fillStyle(i % 2 ? 0xff77a8 : 0xfff1e8)
            .fillCircle(-1, -7, 2)
            .fillCircle(2, -7, 2)
            .fillCircle(0, -9, 2)
            .fillCircle(0, -5, 2);
          f.fillStyle(0xffec27).fillRect(0, -7, 1, 1);
          f.setScale(0.2);
          scene.tweens.add({ targets: f, scale: 1, duration: 300, ease: 'Back.Out' });
          scene.tweens.add({ targets: f, alpha: 0, delay: 2400, duration: 500, onComplete: () => f.destroy() });
          for (let k = 0; k < 3; k++) {
            const dot = scene.add.rectangle(x, FLOOR_Y - 8, 1, 1, 0xffec27).setDepth(12);
            scene.tweens.add({
              targets: dot,
              x: x + Phaser.Math.Between(-10, 10),
              y: FLOOR_Y - Phaser.Math.Between(16, 30),
              alpha: 0,
              duration: 1200,
              onComplete: () => dot.destroy(),
            });
          }
        });
      }
      later(scene, 500, () => {
        for (const t of foes(c)) if (Math.abs(t.x - p.x) < 72 && t.y > FLOOR_Y - 40) world.afflict(t, { sleep: 2500 });
      });
    },
  },

  // GENJUTSU SHARINGAN: one look is enough. Every 8 s the enemies in front of the hero, looking at it, meet Itachi's
  // eyes and stand caught in an illusion for 1.5 s (three tomoe turn over each).
  itachi: {
    tick: (c, time) => {
      const { scene, p } = c;
      const s = st(c, () => ({ caught: [] as Foe[], until: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      if (every(c, 'gaze', 8000, time)) {
        s.caught = foes(c).filter((t) => Math.sign(t.x - p.x) === p.facing && Math.abs(t.x - p.x) < 110 && Math.abs(t.y - p.y) < 50);
        s.until = time + 1500;
        for (const t of s.caught) hold(c, t, 1500);
        if (s.caught.length) apparition(c, p.x - p.facing * 6, p.y - 2, p.facing, 600);
      }
      const g = (s.g ??= scene.add.graphics().setDepth(13));
      g.clear();
      if (time >= s.until) return;
      for (const t of s.caught) {
        if (!t.active) continue;
        const [x, y] = [t.x, t.y - t.displayHeight / 2 - 7];
        g.fillStyle(0xff004d).fillCircle(x, y, 4).fillStyle(0x000000).fillCircle(x, y, 1.2);
        for (let i = 0; i < 3; i++) {
          const a = time / 120 + (i / 3) * Math.PI * 2;
          g.fillCircle(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 0.9);
        }
      }
    },
  },

  // BOLA SALJU: Jack's snowballs are pure fun, except to whoever they hit. Every 3 s one arcs at a random enemy: it
  // bursts in powder, the enemy reels dizzy for a blink and stays sluggish with cold.
  jackFrost: {
    tick: (c, time) => {
      if (!every(c, 'snow', 3000, time)) return;
      const { scene, p, world } = c;
      const pool = foes(c);
      const t = pool[Phaser.Math.Between(0, pool.length - 1)];
      if (!t) return;
      const ball = scene.add
        .circle(p.x, p.y - 10, 2.5, 0xfff1e8)
        .setStrokeStyle(1, 0xc2f0ff)
        .setDepth(13);
      const [x0, y0, x1, y1] = [p.x, p.y - 10, t.x, t.y];
      const peak = Math.min(y0, y1) - 40;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 500,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          ball.setPosition(x0 + (x1 - x0) * k, (1 - k) ** 2 * y0 + 2 * (1 - k) * k * peak + k ** 2 * y1);
        },
        onComplete: () => {
          ball.destroy();
          sparks(scene, x1, y1, [0xfff1e8, 0xc2f0ff, 0x29adff], 10, 12);
          if (!t.active) return;
          hold(c, t, 500);
          world.strike(t, 0.5, 'proc', false, { slow: 2000 }, 30);
        },
      });
    },
  },

  // JUBAH CAKRA KURAMA: when the hero is nearly down, Naruto shares Kurama's chakra as he did with the whole Alliance:
  // an orange flame-cloak for 6 s, harder blows, wounds closing.
  naruto: {
    onHurt: (c) => {
      const { scene, p } = c;
      const s = st(c, () => ({ ready: 0, until: 0 }));
      if (p.hp >= p.stats.maxHp * 0.3 || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 30000;
      s.until = scene.time.now + 6000;
      floatText(scene, p.x, p.y - 26, 'CAKRA KURAMA!', '#ffa300');
      apparition(c, p.x + p.facing * 8, p.y, -p.facing, 600);
      ring(scene, p.x, p.y, 0xffa300, 4, 26, 300, 2);
    },
    modify: (c) => (c.scene.time.now < st(c, () => ({ ready: 0, until: 0 })).until ? { mult: 1.3 } : undefined),
    tick: (c, time, delta) => {
      const s = st(c, () => ({ ready: 0, until: 0, acc: 0 }));
      if (time >= s.until) return;
      s.acc += (delta / 1000) * c.p.stats.maxHp * 0.03;
      if (s.acc >= 1) {
        c.p.heal(Math.floor(s.acc));
        s.acc %= 1;
      }
      if (Math.floor(time / 40) % 2) return;
      // Chakra flames licking up off the cloak.
      const f = c.scene.add
        .triangle(c.p.x + Phaser.Math.Between(-5, 5), c.p.y + 4, 0, 4, 2, 0, 4, 4, Math.random() < 0.5 ? 0xffa300 : 0xffec27)
        .setDepth(11)
        .setAlpha(0.8);
      c.scene.tweens.add({ targets: f, y: f.y - 12, alpha: 0, scaleY: 1.6, duration: 300, onComplete: () => f.destroy() });
    },
  },

  // AMENOTEJIKARA: the Rinnegan swaps places. A dash pulls the nearest enemy ahead into the hero's spot and puts the
  // hero where it stood; the enemy arrives stunned by a Chidori jolt.
  sasuke: {
    onDash: (c) => {
      const { scene, p } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready) return;
      const t = foes(c).find(
        (o) => !isBoss(o) && Math.sign(o.x - p.x) === p.facing && Math.abs(o.x - p.x) < 130 && Math.abs(o.y - p.y) < 50,
      );
      if (!t) return;
      s.ready = scene.time.now + 5000;
      const [px, py, tx, ty] = [p.x, p.y, t.x, t.y];
      const v = { x: p.body.velocity.x, y: p.body.velocity.y };
      for (const [x, y] of [
        [px, py],
        [tx, ty],
      ])
        ring(scene, x, y, 0x8a3fd1, 2, 14, 220, 2);
      p.body.reset(tx, ty);
      p.setVelocity(v.x, v.y);
      body(t).reset(px, py);
      apparition(c, px, py - 2, p.facing, 400);
      bolt(scene, px, py - 4, px, py + 6, 0x29adff);
      hold(c, t, 900);
      c.world.strike(t, 1, 'proc', false, undefined, 0);
    },
  },

  // TARIKAN BUMI: every 6 s gravity reaches up and drags every flying enemy down to crash on the floor, where it lies
  // pinned for a moment.
  gravityMaster: {
    tick: (c, time) => {
      if (!every(c, 'pull', 6000, time)) return;
      const { scene, world } = c;
      const flyers = foes(c).filter((t) => !isBoss(t) && (t as unknown as { flying: boolean }).flying);
      if (!flyers.length) return;
      apparition(c, c.p.x, c.p.y, c.p.facing, 500);
      for (const t of flyers) {
        const g = scene.add.graphics().setDepth(12);
        for (let i = 0; i < 3; i++) g.lineStyle(1, 0x8a3fd1, 0.6 - i * 0.15).lineBetween(t.x - 4 + i * 4, t.y, t.x - 4 + i * 4, FLOOR_Y);
        scene.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
        hold(c, t, 1500);
        body(t).setVelocity(0, 420);
        later(scene, 260, () => {
          if (!t.active) return;
          burst(scene, t.x, FLOOR_Y, 0x8a3fd1, 8);
          ring(scene, t.x, FLOOR_Y, 0x8a3fd1, 3, 16, 260);
          world.strike(t, 1.5, 'proc', false, undefined, 0);
        });
      }
      scene.cameras.main.shake(120, 0.006);
    },
  },

  // GUNTUR MENGGELEGAR: Raijin's great drum is struck once; the thunder rolls over the whole arena, every enemy flinches
  // and whatever attack it was winding up is lost.
  lightningLord: {
    tick: (c, time) => {
      if (!every(c, 'clap', 8000, time)) return;
      const { scene, p } = c;
      const g = scene.add.graphics().setDepth(13);
      taiko(g, p.x, p.y - 26, 6, 0, 1);
      scene.tweens.add({ targets: g, alpha: 0, delay: 300, duration: 300, onComplete: () => g.destroy() });
      for (let i = 0; i < 3; i++) later(scene, i * 90, () => ring(scene, p.x, p.y - 26, 0x8a3fd1, 6, 200, 500, 2));
      scene.cameras.main.shake(180, 0.008);
      for (const t of foes(c)) {
        (t as unknown as { interrupt?: (ms: number) => void }).interrupt?.(600);
        hold(c, t, 600);
        floatText(scene, t.x, t.y - 18, '!', '#ffec27');
      }
    },
  },

  // BULU SENJA: every jump shakes loose feathers from the Nephalem's twilight wings: gold ones of heaven and red ones of
  // hell rain straight down on what lies below.
  nephalem: {
    onJump: (c) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready) return;
      s.ready = scene.time.now + 400;
      feathers(scene, p.x, p.y - 4, 4, 12, 20);
      for (let i = 0; i < 4; i++) {
        const holy = i % 2 === 0;
        world.shot({
          x: p.x - 9 + i * 6,
          y: p.y,
          vx: 0,
          vy: 200,
          texture: 'featherShot',
          tint: holy ? 0xffec27 : 0xff004d,
          mult: 0.45,
          source: 'proc',
          status: holy ? undefined : { burn: 0.1 },
        });
      }
    },
  },

  // SPEKTRUM: each blow of the hero lights one more color of the rainbow; with all seven lit, the spectrum is fired as
  // a straight beam ahead through everything in line.
  lumina: {
    onHit: (c, _t, h) => {
      if (h.source !== 'basic') return;
      const s = st(c, () => ({ n: 0 }));
      if (++s.n < 7) return;
      s.n = 0;
      const { scene, p, world } = c;
      const COLORS = [0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x83769c, 0xff77a8];
      const a = p.facing > 0 ? 0 : Math.PI;
      // Seven bands, one per color, then a white core down the middle.
      const g = scene.add.graphics().setDepth(13);
      const end = p.facing > 0 ? W : 0;
      COLORS.forEach((col, i) => g.lineStyle(1, col).lineBetween(p.x, p.y - 3 + i, end, p.y - 3 + i));
      lightRay(scene, p.x, p.y, a, W, 1, 260);
      scene.tweens.add({ targets: g, alpha: 0, duration: 320, onComplete: () => g.destroy() });
      sparks(scene, p.x + p.facing * 8, p.y, COLORS, 10, 12);
      for (const t of foes(c))
        if (Math.sign(t.x - p.x) === p.facing && Math.abs(t.y - p.y) < 12) world.strike(t, 1.6, 'proc', false, undefined, 90);
    },
    tick: (c) => {
      const n = st(c, () => ({ n: 0 })).n;
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= c.scene.add.graphics().setDepth(12));
      g.clear();
      const COLORS = [0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x83769c, 0xff77a8];
      for (let i = 0; i < n; i++) g.fillStyle(COLORS[i]).fillRect(c.p.x - 4 + i, c.p.y - 13, 1, 1);
    },
  },

  // BERKAS MATAHARI: every 9 s a shaft of sunlight comes down near the hero for 4 s. Standing in it, the hero hits a
  // quarter harder; enemies caught in it burn.
  surya: {
    tick: (c, time) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ x: 0, until: 0, next: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      if (every(c, 'sun', 9000, time)) {
        s.x = Phaser.Math.Clamp(p.x + p.facing * 20, 16, W - 16);
        s.until = time + 4000;
        apparition(c, s.x, FLOOR_Y - 8, p.facing, 500);
      }
      const g = (s.g ??= scene.add.graphics().setDepth(2.5));
      g.clear();
      if (time >= s.until) return;
      const k = Math.min(1, (s.until - time) / 400, (time - s.until + 4000) / 200);
      const flick = 0.85 + Math.sin(time / 70) * 0.15;
      g.fillStyle(0xffa300, 0.16 * k * flick).fillRect(s.x - 16, 0, 32, FLOOR_Y);
      g.fillStyle(0xffec27, 0.22 * k * flick).fillRect(s.x - 10, 0, 20, FLOOR_Y);
      g.fillStyle(0xfff1e8, 0.3 * k * flick).fillRect(s.x - 4, 0, 8, FLOOR_Y);
      // Dust glittering in the shaft.
      for (let i = 0; i < 6; i++)
        g.fillStyle(0xfff1e8, k).fillRect(s.x - 12 + ((i * 37 + time / 30) % 24), (i * 53 + time / 12) % FLOOR_Y, 1, 1);
      g.fillStyle(0xffa300, 0.4 * k).fillEllipse(s.x, FLOOR_Y, 36, 4);
      if (time >= s.next) {
        s.next = time + 500;
        for (const t of foes(c)) if (Math.abs(t.x - s.x) < 16) world.afflict(t, { burn: 0.15 });
      }
    },
    modify: (c) => {
      const s = st(c, () => ({ x: 0, until: 0, next: 0 }));
      return c.scene.time.now < s.until && Math.abs(c.p.x - s.x) < 16 ? { mult: 1.25 } : undefined;
    },
  },

  // GRAVITASI BULAN: under Candra's moon the hero weighs less: higher jumps, a slow fall, and blows struck in the air
  // land 30% harder. A faint moon disc follows overhead.
  candra: {
    tick: (c) => {
      const { scene, p } = c;
      p.body.setGravityY(-scene.physics.world.gravity.y * 0.4);
      const g = ((c.s.g as Phaser.GameObjects.Graphics | undefined) ??= scene.add.graphics().setDepth(1.5));
      g.clear();
      if (!p.active) return;
      g.fillStyle(0xfff1e8, 0.08)
        .fillCircle(p.x, p.y - 30, 8)
        .fillStyle(0xc2c3c7, 0.1)
        .fillCircle(p.x + 2, p.y - 31, 6);
    },
    modify: (c, _t, source) => (source === 'basic' && !c.p.grounded ? { mult: 1.3 } : undefined),
  },

  // TEROR SANG RAJA: the Dark Lord's dread. Enemies close to the hero with under 30% HP left drop to their knees for
  // 2 s (a black crown flickers over them) and take half again as much while they kneel.
  darkLord: {
    tick: (c, time) => {
      const { scene, p } = c;
      const s = st(c, () => ({ next: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      if (time >= s.next) {
        s.next = time + 300;
        for (const t of foes(c)) {
          const h = hpOf(t);
          if (isBoss(t) || t.getData('kneel') || h.hp > h.maxHp * 0.3 || dist(t, p) > 56) continue;
          t.setData('kneel', time + 2000);
          hold(c, t, 2000);
          floatText(scene, t.x, t.y - 20, 'BERLUTUT', '#00e436');
        }
      }
      const g = (s.g ??= scene.add.graphics().setDepth(13));
      g.clear();
      for (const t of foes(c)) {
        const until = (t.getData('kneel') as number | undefined) ?? 0;
        if (time >= until) continue;
        const [x, y] = [t.x, t.y - t.displayHeight / 2 - 5];
        g.fillStyle(0x000000)
          .fillRect(x - 3, y, 7, 2)
          .fillTriangle(x - 3, y, x - 3, y - 3, x - 1, y)
          .fillTriangle(x, y, x + 1, y - 4, x + 2, y)
          .fillTriangle(x + 3, y, x + 3, y - 3, x + 1, y);
        g.fillStyle(0x00e436).fillRect(x, y - 1, 1, 1);
      }
    },
    modify: (c, t) => (c.scene.time.now < ((t.getData('kneel') as number | undefined) ?? 0) ? { mult: 1.5 } : undefined),
  },

  // PENGHAKIMAN: whoever wounds the one under the Light Lord's eyes is judged. Pillars of light fall on every enemy near
  // the hero, each dealing half again the wound it took.
  lightLord: {
    onHurt: (c, dmg) => {
      const { scene, p, world } = c;
      const s = st(c, () => ({ ready: 0 }));
      if (scene.time.now < s.ready) return;
      s.ready = scene.time.now + 1500;
      apparition(c, p.x, p.y - 6, p.facing, 500);
      for (const t of foes(c)) {
        if (dist(t, p) > 80) continue;
        const g = scene.add.graphics().setDepth(13);
        g.fillStyle(0xffec27, 0.35)
          .fillRect(t.x - 5, 0, 10, t.y)
          .fillStyle(0xfff1e8, 0.8)
          .fillRect(t.x - 1, 0, 2, t.y);
        scene.tweens.add({ targets: g, alpha: 0, scaleX: 0.2, duration: 350, onComplete: () => g.destroy() });
        sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 6, 10);
        world.strike(t, flat(c, dmg * 1.5), 'proc', false, undefined, 60);
      }
    },
  },

  // IZANAGI: once a round, a wound that would kill the hero is rewritten as a dream: its HP goes back to what it was
  // 4 s ago, and one of Obito's Sharingan closes for good (shown over the hero).
  obito: {
    tick: (c, time) => {
      const s = st(c, () => ({ used: false, log: [] as [number, number][] }));
      s.log.push([time, c.p.hp]);
      while (s.log.length && s.log[0][0] < time - 4000) s.log.shift();
    },
    guard: (c, dmg) => {
      const { scene, p } = c;
      const s = st(c, () => ({ used: false, log: [] as [number, number][] }));
      if (s.used || p.hp - Math.round(dmg * p.stats.damageTaken) > 0) return false;
      s.used = true;
      p.hp = Math.max(p.hp, s.log[0]?.[1] ?? p.hp, Math.round(p.stats.maxHp * 0.2));
      p.parry('IZANAGI', '#ff004d');
      p.invuln(1200);
      const g = scene.add.graphics().setDepth(14);
      kamuiSwirl(g, p.x, p.y, 12, 0, 0.8);
      g.fillStyle(0xff004d)
        .fillCircle(p.x, p.y - 22, 3)
        .fillStyle(0x000000)
        .fillRect(p.x - 4, p.y - 22, 8, 1);
      scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 400, onComplete: () => g.destroy() });
      apparition(c, p.x - p.facing * 10, p.y, p.facing, 700);
      return true;
    },
  },

  // JALAN PRETA: the Preta Path drinks chakra. Enemy shots that come near the hero are pulled into its palm and absorbed,
  // each one healing it a little.
  pain: {
    tick: (c) => {
      const { scene, p } = c;
      for (const h of c.world.hostiles()) {
        if (dist(h, p) > 26) continue;
        const [x, y] = [h.x, h.y];
        h.destroy();
        p.heal(2);
        const g = scene.add.graphics().setDepth(13);
        rinnegan(g, p.x + p.facing * 6, p.y, 3, 0.9);
        scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
        const mote = scene.add.circle(x, y, 2, 0x8a3fd1).setDepth(13);
        scene.tweens.add({ targets: mote, x: p.x, y: p.y, scale: 0.3, duration: 180, onComplete: () => mote.destroy() });
        floatText(scene, p.x, p.y - 18, '+2', '#00e436');
      }
    },
  },

  // MIMPI MALAM PANJANG: Oberon's gift is a long night's dream. Every 20 s a white moth settles on the hero; the next
  // skill, fusion or ult then hits twice as hard, and when the dream fades the hero nods off for a moment.
  oberon: {
    tick: (c, time) => {
      const s = st(c, () => ({ armed: false, until: 0, g: undefined as Phaser.GameObjects.Graphics | undefined }));
      if (!s.armed && time >= s.until && every(c, 'dream', 20000, time)) {
        s.armed = true;
        apparition(c, c.p.x + c.p.facing * 10, c.p.y - 4, -c.p.facing, 600);
      }
      const g = (s.g ??= c.scene.add.graphics().setDepth(12));
      g.clear();
      if (!s.armed || !c.p.active) return;
      // The moth on the hero's shoulder, wings opening and closing.
      const w = 2 + Math.abs(Math.sin(time / 150)) * 2;
      const [x, y] = [c.p.x - c.p.facing * 4, c.p.y - 10];
      g.fillStyle(0xfff1e8, 0.9)
        .fillTriangle(x, y, x - w, y - 2, x - w, y + 2)
        .fillTriangle(x, y, x + w, y - 2, x + w, y + 2);
    },
    onCast: (c) => {
      const s = st(c, () => ({ armed: false, until: 0 }));
      if (!s.armed) return;
      s.armed = false;
      s.until = c.scene.time.now + 2500;
      floatText(c.scene, c.p.x, c.p.y - 30, 'MIMPI!', '#c2c3c7');
      later(c.scene, 2500, () => {
        if (!c.p.active) return;
        c.p.lock(700);
        floatText(c.scene, c.p.x, c.p.y - 20, 'ZZZ', '#8a90c8');
      });
    },
    modify: (c, _t, source) => {
      const s = st(c, () => ({ armed: false, until: 0 }));
      return (source === 'skill' || source === 'ult') && c.scene.time.now < s.until ? { mult: 2 } : undefined;
    },
  },
};
