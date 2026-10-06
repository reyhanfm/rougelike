import Phaser from 'phaser';
import { cutMark, FLOOR_Y, floatText, W } from '../gfx/ui.ts';
import type { ClassId } from '../logic/classes.ts';
import type { Move } from '../logic/loot.ts';
import type { HitSource, PlayerWorld } from './arena.ts';
import type { HurtResult, Player } from './Player.ts';
import {
  afterimage,
  bladeLine,
  bolt,
  explosion,
  eveningBell,
  FIRE,
  flameTongue,
  glint,
  HELL,
  HOLY,
  leafBurst,
  ring,
  rocks,
  sparks,
  stormArc,
  thorns,
  hexMirror,
  lightRay,
  moonPhase,
} from './skills.ts';

export interface PassiveCtx {
  p: Player;
  world: PlayerWorld;
  scene: Phaser.Scene;
}

export interface HitInfo {
  source: HitSource;
  crit: boolean;
  killed: boolean;
  dmg: number;
}

type Foe = Phaser.GameObjects.Sprite;

/**
 * A class passive: the character's own always-on technique. Every hook is optional. Hits a passive deals are
 * 'proc' hits, and proc hits never run `onHit` again, so passives cannot feed each other in a loop.
 */
export interface Passive {
  /** Every frame of the round. */
  tick?(c: PassiveCtx, time: number, delta: number): void;
  /** A basic attack starts (melee swing, volley or cast), after the move is chosen. */
  onAttack?(c: PassiveCtx, m: Move): void;
  /** One of the player's own hits landed (never 'proc' hits). */
  onHit?(c: PassiveCtx, t: Foe, h: HitInfo): void;
  /** Something died, from any source (burn ticks too); `t` is about to be destroyed but still readable. */
  onKill?(c: PassiveCtx, t: Foe): void;
  /** Sharpen a hit before damage is rolled. */
  modify?(c: PassiveCtx, t: Foe, source: HitSource): { mult?: number; crit?: boolean } | void;
  /** A hit is about to land on the (vulnerable) player; true turns it away completely. */
  guard?(c: PassiveCtx, dmg: number, fromX: number, from?: Foe): boolean;
  /** After an attack reached the player (also when it was ignored: invulnerable, dashing). `from` = touching enemy. */
  onAttacked?(c: PassiveCtx, result: HurtResult, from?: Foe): void;
  /** The class dash starts. */
  onDash?(c: PassiveCtx): void;
}

type Living = Foe & { hp: number; maxHp: number };

const isBoss = (t: Foe) => 'tier' in t;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
const later = (scene: Phaser.Scene, ms: number, fn: () => void) => scene.time.delayedCall(ms, fn);
const burning = (c: PassiveCtx, t: Foe) => c.scene.time.now < ((t.getData('burnUntil') as number | undefined) ?? 0);
const frozen = (c: PassiveCtx, t: Foe) => c.scene.time.now < ((t.getData('freezeUntil') as number | undefined) ?? 0);
const slowed = (c: PassiveCtx, t: Foe) => c.scene.time.now < ((t.getData('slowUntil') as number | undefined) ?? 0);
/** Damage the player would actually take from a hit of `dmg`. */
const incoming = (p: Player, dmg: number) => Math.round(dmg * p.stats.damageTaken);

/** Per-round passive state, kept on the player (a new player every round, so it resets with the round). */
function state<T extends object>(p: Player, init: () => T): T {
  let s = p.getData('passive') as T | undefined;
  if (!s) {
    s = init();
    p.setData('passive', s);
  }
  return s;
}

/** A graphics layer the passive redraws every frame (marks over enemies, auras). */
function overlay(c: PassiveCtx, depth = 15): Phaser.GameObjects.Graphics {
  let g = c.p.getData('passiveLayer') as Phaser.GameObjects.Graphics | undefined;
  if (!g?.active) {
    g = c.scene.add.graphics().setDepth(depth);
    c.p.setData('passiveLayer', g);
  }
  return g;
}

/** An enemy showing its "about to attack" cue (bosses telegraph their own way and are never read). */
const windingUp = (t: Foe): t is Foe & { interrupt(ms: number): void } => 'windingUp' in t && !!(t as { windingUp: boolean }).windingUp;

/** Top of an enemy's head. */
const head = (t: Foe) => t.y - t.displayHeight / 2;

/** Puffs of smoke rising from (x, y). */
function smoke(scene: Phaser.Scene, x: number, y: number, n: number, colors: number[], spread = 6): void {
  for (let i = 0; i < n; i++) {
    const s = scene.add
      .circle(
        x + Phaser.Math.Between(-spread, spread),
        y + Phaser.Math.Between(-3, 3),
        Phaser.Math.Between(2, 4),
        colors[i % colors.length],
        0.8,
      )
      .setDepth(14);
    scene.tweens.add({
      targets: s,
      y: s.y - Phaser.Math.Between(6, 16),
      scale: 1.8,
      alpha: 0,
      duration: Phaser.Math.Between(300, 550),
      onComplete: () => s.destroy(),
    });
  }
}

/** Lumina's floating light crystals (also read by Jaring Cermin as extra mirrors). */
const crystalState = () => ({ hits: 0, crystals: [] as { x: number; y: number; born: number; next: number }[] });

/** The Cultivator's realms: qi needed to break through to each, and the swords of his guard there. */
const REALMS = [
  { name: 'PEMURNIAN QI', qi: 0, swords: 2 },
  { name: 'PONDASI', qi: 10, swords: 3 },
  { name: 'INTI EMAS', qi: 25, swords: 4 },
  { name: 'JIWA BARU', qi: 45, swords: 6 },
] as const;

const cultState = () => ({
  qi: 0,
  realm: 0,
  swords: [] as Phaser.GameObjects.Image[],
  last: new Map<object, number>(),
  trail: 0,
  soulAt: 0,
  soul: undefined as Phaser.GameObjects.Image | undefined,
});

/** Qi gathered; enough of it and he breaks through. */
function gainQi(c: PassiveCtx, n: number): void {
  const s = state(c.p, cultState);
  s.qi += n;
  const next = REALMS[s.realm + 1];
  if (next && s.qi >= next.qi) breakthrough(c, s);
}

/** Breakthrough: the heavenly tribulation falls on him, then on the enemies nearest him. */
function breakthrough({ p, world, scene }: PassiveCtx, s: ReturnType<typeof cultState>): void {
  s.realm++;
  p.setData('realm', s.realm);
  const cx = p.x;
  const cy = Math.max(16, p.y - 64);
  const cloud = scene.add.graphics().setDepth(9).setAlpha(0);
  for (let i = 0; i < 9; i++)
    cloud.fillStyle(i % 2 ? 0x1d2b53 : 0x2b2f6b, 0.9).fillCircle(cx + (i - 4) * 8, cy + (i % 3) * 2, 7 + (i % 3) * 2);
  cloud.lineStyle(1, 0xc080ff, 0.6).lineBetween(cx - 30, cy + 8, cx + 30, cy + 8);
  scene.tweens.add({ targets: cloud, alpha: 1, duration: 150 });
  scene.tweens.add({ targets: cloud, alpha: 0, delay: 900, duration: 300, onComplete: () => cloud.destroy() });
  later(scene, 200, () => {
    if (!p.active) return;
    bolt(scene, cx, cy + 6, p.x, p.y, 0xc080ff);
    ring(scene, p.x, p.y, 0xc2f0ff, 4, 34, 320, 2);
    ring(scene, p.x, p.y, 0xc080ff, 2, 22, 260);
    sparks(scene, p.x, p.y, [0xc080ff, 0xc2f0ff, 0xfff1e8], 14, 26);
    scene.cameras.main.flash(120, 192, 128, 255);
    floatText(scene, Phaser.Math.Clamp(p.x, 50, W - 50), p.y - 26, REALMS[s.realm].name, s.realm >= 2 ? '#ffec27' : '#c2f0ff');
  });
  world
    .targets(p.x, p.y)
    .slice(0, 1 + s.realm)
    .forEach((t, i) =>
      later(scene, 340 + i * 110, () => {
        if (!t.active) return;
        bolt(scene, t.x + Phaser.Math.Between(-10, 10), 0, t.x, t.y, 0xc080ff);
        sparks(scene, t.x, t.y, [0xc080ff, 0xfff1e8], 8, 14);
        scene.cameras.main.shake(100, 0.008);
        world.strike(t, 1.2 + 0.4 * s.realm, 'proc', true, { slow: 800 });
      }),
    );
}

export const PASSIVES: Record<ClassId, Passive> = {
  // AVALON, the Everdistant Utopia: the scabbard of Excalibur sleeps inside her body (a little gold-and-blue scabbard
  // hangs at her hip while it is ready). A heavy blow (12% of her HP or more) never lands: the scabbard comes apart
  // into plates of light that lock into a curved wall on the side of the blow, her wounds close (6% HP), and the
  // blow is turned back on its source as a lance of light. Then it needs 10 s to gather again.
  ksatria: {
    tick: (c, time) => {
      const { p } = c;
      const s = state(p, () => ({ ready: 0 }));
      const g = overlay(c, 9.5);
      g.clear();
      if (time < s.ready || !p.visible) return;
      const x = p.x - p.facing * 4;
      const y = p.y + 1;
      g.fillStyle(0x1d2b53).fillRect(x - 1.5, y - 1, 3, 9);
      g.fillStyle(0x2a4bd7).fillRect(x - 0.5, y, 1, 7);
      g.fillStyle(0xffec27)
        .fillRect(x - 1.5, y - 1, 3, 1)
        .fillRect(x - 1.5, y + 3, 3, 1)
        .fillRect(x - 0.5, y + 8, 1, 1);
      // A glint runs down it now and then.
      const k = (time % 1600) / 400;
      if (k < 1) g.fillStyle(0xfff1e8).fillRect(x - 0.5, y + k * 7, 1, 1);
    },
    guard: ({ p, world, scene }, dmg, fromX, from) => {
      const s = state(p, () => ({ ready: 0 }));
      const time = scene.time.now;
      if (time < s.ready || incoming(p, dmg) < p.stats.maxHp * 0.12) return false;
      s.ready = time + 10000;
      p.parry('AVALON', '#ffec27');
      p.heal(Math.ceil(p.stats.maxHp * 0.06));
      const side = Math.sign(fromX - p.x) || p.facing;
      const base = side > 0 ? 0 : Math.PI;
      for (let i = 0; i < 10; i++) {
        const a = base + (i - 4.5) * 0.24;
        const pl = scene.add
          .rectangle(p.x - p.facing * 4, p.y + 3, 5, 2, i % 3 ? 0xffec27 : 0xfff1e8)
          .setStrokeStyle(1, 0x2a4bd7)
          .setDepth(14);
        scene.tweens.add({
          targets: pl,
          x: p.x + Math.cos(a) * 14,
          y: p.y - 2 + Math.sin(a) * 14,
          rotation: a + Math.PI / 2,
          duration: 90,
          ease: 'Back.Out',
          onComplete: () =>
            scene.tweens.add({ targets: pl, alpha: 0, scale: 1.5, delay: 350, duration: 200, onComplete: () => pl.destroy() }),
        });
      }
      ring(scene, p.x + side * 14, p.y - 2, 0xffec27, 2, 18, 260, 2);
      sparks(scene, p.x + side * 14, p.y - 2, [0xffec27, 0xfff1e8], 10, 16);
      if (from?.active)
        later(scene, 140, () => {
          if (!from.active) return;
          bladeLine(scene, p.x + side * 14, p.y - 2, from.x, from.y, 0xffec27, 80);
          world.strike(from, 0.8, 'proc', false, undefined, isBoss(from) ? 0 : 240);
        });
      return true;
    },
  },

  // LONCENG PENANDA (the bell tolls): the evening bell names the enemy whose time is nearest (lowest HP left); an
  // azure grave-flame burns over its head and the First Hassan cuts it deeper. When it dies the bell tolls: azure fire
  // bursts up around the body and burns all near it.
  pembunuh: {
    tick: (c, time) => {
      const { p, world, scene } = c;
      const s = state(p, () => ({ mark: undefined as Foe | undefined, next: 0 }));
      if (s.mark && !s.mark.active) s.mark = undefined;
      if (!s.mark && time >= s.next) {
        const foes = world.targets(p.x, p.y) as Living[];
        s.mark = foes.reduce<Living | undefined>((b, t) => (!b || t.hp / t.maxHp < b.hp / b.maxHp ? t : b), undefined);
        if (s.mark) {
          ring(scene, s.mark.x, s.mark.y, 0x29adff, 16, 4, 260);
          s.next = time + 1500;
        }
      }
      const g = overlay(c).clear();
      const t = s.mark;
      if (!t) return;
      // The grave-flame: a flickering azure tongue with a pale core over its head.
      const x = t.x;
      const y = head(t) - 10;
      const h = 6 + Math.sin(time / 70) * 1.5;
      g.fillStyle(0x2a4bd7)
        .fillCircle(x, y, 3)
        .fillTriangle(x - 3, y, x + 3, y, x + Math.sin(time / 90), y - h);
      g.fillStyle(0x29adff)
        .fillCircle(x, y, 2)
        .fillTriangle(x - 2, y, x + 2, y, x, y - h * 0.7);
      g.fillStyle(0xc2f0ff).fillRect(x, y - 1, 1, 2);
    },
    modify: ({ p }, t) => {
      const s = state(p, () => ({ mark: undefined as Foe | undefined, next: 0 }));
      return t === s.mark ? { mult: 1.5 } : undefined;
    },
    onKill: ({ p, world, scene }, t) => {
      const s = state(p, () => ({ mark: undefined as Foe | undefined, next: 0 }));
      if (t !== s.mark) return;
      s.mark = undefined;
      s.next = scene.time.now + 1500;
      const { x, y } = t;
      // The bell appears over the body and swings: one toll.
      const bell = eveningBell(scene, x, Math.max(14, y - 34), 0.8).setAlpha(0);
      scene.tweens.add({ targets: bell, alpha: 1, duration: 90 });
      scene.tweens.add({ targets: bell, angle: 24, duration: 120, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
      scene.tweens.add({ targets: bell, alpha: 0, delay: 520, duration: 250, onComplete: () => bell.destroy() });
      later(scene, 120, () => {
        ring(scene, x, y, 0x29adff, 4, 44, 380, 2);
        ring(scene, x, y, 0xc2f0ff, 2, 30, 300);
        for (const dx of [-14, -6, 0, 7, 15]) flameTongue(scene, x + dx, y + 8, 14 + Math.abs(dx) * -0.4 + 8, 380);
        world.area(x, y, 40, 1.5, 120, 'proc', { burn: 0.2 });
        p.heal(3);
        floatText(scene, x, y - 24, 'LONCENG!', '#7fe6ff');
      });
    },
  },

  // KUTUKAN GAE BOLG: a wound from the cursed spear never closes. Every hit plants a barb (up to five, red ticks over
  // the head); the barbs bleed the enemy every half second, and its allies' healing cannot close the wound.
  dragoon: {
    onHit: ({ scene }, t, h) => {
      if (h.killed || (h.source !== 'basic' && h.source !== 'skill')) return;
      t.setData('bleed', Math.min(5, ((t.getData('bleed') as number | undefined) ?? 0) + 1));
      t.setData('bleedUntil', scene.time.now + 3000);
      thorns(scene, t.x, t.y, 0xff004d, 3, 8);
    },
    tick: (c, time) => {
      const { p, world, scene } = c;
      const s = state(p, () => ({ next: 0 }));
      const g = overlay(c).clear();
      const foes = world.targets(p.x, p.y);
      const tickNow = time >= s.next;
      if (tickNow) s.next = time + 500;
      for (const t of foes) {
        const n = (t.getData('bleed') as number | undefined) ?? 0;
        if (!n) continue;
        if (time >= ((t.getData('bleedUntil') as number | undefined) ?? 0)) {
          t.setData('bleed', 0);
          continue;
        }
        // Barbs over the head: one red tick per stack.
        for (let i = 0; i < n; i++) {
          const x = t.x - (n - 1) * 2 + i * 4;
          g.fillStyle(0x7e2553).fillRect(x - 1, head(t) - 12, 3, 3);
          g.fillStyle(0xff004d).fillRect(x, head(t) - 12, 1, 3);
        }
        if (!tickNow) continue;
        const drip = scene.add.rectangle(t.x + Phaser.Math.Between(-3, 3), t.y, 1, 2, 0xff004d).setDepth(14);
        scene.tweens.add({ targets: drip, y: drip.y + 10, alpha: 0, duration: 350, onComplete: () => drip.destroy() });
        world.strike(t, 0.06 * n, 'proc', false, undefined, 0);
      }
    },
  },

  // TUBUH SETENGAH DEWA (God Hand): a body tempered by the Twelve Labours. Every 4 s, a blow under 20% of his HP
  // does not even scratch it: it bounces off with a clang and he shoves the attacker away.
  berserker: {
    guard: ({ p, world, scene }, dmg, fromX, from) => {
      const s = state(p, () => ({ ready: 0 }));
      const time = scene.time.now;
      if (time < s.ready || incoming(p, dmg) >= p.stats.maxHp * 0.2) return false;
      s.ready = time + 4000;
      p.parry('TIDAK MEMPAN', '#ffa300');
      const side = Math.sign(fromX - p.x) || p.facing;
      sparks(scene, p.x + side * 4, p.y - 2, [0xffa300, 0xfff1e8, 0xd08a50], 10, 16);
      ring(scene, p.x, p.y, 0xd08a50, 4, 20, 240, 2);
      smoke(scene, p.x, p.y - 4, 6, [0xb3122e, 0x5f574f]);
      if (from?.active && !isBoss(from)) world.strike(from, 0.5, 'proc', false, undefined, 260);
      return true;
    },
  },

  // TRACE ON: EMIYA projects a blade every 3.5 s and holds it hanging behind his shoulder (up to three). Each attack
  // looses one of them at the nearest enemy.
  pemburu: {
    tick: ({ p, scene }, time) => {
      const s = state(p, () => ({ swords: [] as Phaser.GameObjects.Image[], next: time + 1500, said: false }));
      if (s.swords.length < 3 && time >= s.next) {
        s.next = time + 3500;
        const key = ['w_busur', 'w_bakuya', 'w_pedang'][s.swords.length % 3];
        const sw = scene.add
          .image(p.x, p.y - 10, key)
          .setDepth(9)
          .setScale(0);
        // Projected: a wireframe flash, then the blade fills in.
        scene.tweens.add({ targets: sw, scale: 1, duration: 160, ease: 'Back.Out' });
        sw.setTint(0x29adff);
        later(scene, 160, () => sw.active && sw.clearTint());
        sparks(scene, p.x - p.facing * 6, p.y - 10, [0x29adff, 0xc2f0ff], 6, 10);
        s.swords.push(sw);
        if (!s.said) {
          s.said = true;
          floatText(scene, p.x, p.y - 22, 'TRACE ON', '#29adff');
        }
      }
      s.swords.forEach((sw, i) => {
        sw.setPosition(p.x - p.facing * (5 + i * 4), p.y - 9 - i * 3 + Math.sin(time / 200 + i) * 1.2);
        sw.setRotation(-Math.PI / 2 + p.facing * (0.35 - i * 0.2));
      });
    },
    onAttack: ({ p, world, scene }) => {
      const s = state(p, () => ({ swords: [] as Phaser.GameObjects.Image[], next: 0, said: true }));
      const t = world.targets(p.x, p.y)[0];
      const sw = s.swords[0];
      if (!t || !sw) return;
      s.swords.shift();
      const a = Phaser.Math.Angle.Between(sw.x, sw.y, t.x, t.y);
      glint(scene, sw.x, sw.y);
      const shot = world.shot({
        x: sw.x,
        y: sw.y,
        vx: Math.cos(a) * 320,
        vy: Math.sin(a) * 320,
        texture: sw.texture.key,
        mult: 0.9,
        source: 'proc',
        pierce: true,
        knockback: 90,
      }) as Phaser.GameObjects.Image;
      shot.setFlipX(false).setRotation(a);
      sw.destroy();
    },
  },

  // TANDA BINTANG: each arcane arrow leaves a star on its target (they circle its head); the third star turns it into
  // a nova that bursts on everything around.
  magicArcher: {
    onHit: ({ world, scene }, t, h) => {
      if (h.killed || h.source !== 'basic') return;
      const n = ((t.getData('stars') as number | undefined) ?? 0) + 1;
      if (n < 3) return void t.setData('stars', n);
      t.setData('stars', 0);
      const { x, y } = t;
      // The nova: a four-point star flares and spins out, pink and gold.
      const g = scene.add.graphics().setPosition(x, y).setDepth(14);
      for (const [r, c] of [
        [14, 0xff77a8],
        [9, 0xffec27],
        [4, 0xfff1e8],
      ] as const) {
        g.fillStyle(c).fillPoints(
          Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const k = i % 2 ? r * 0.25 : r;
            return new Phaser.Math.Vector2(Math.cos(a) * k, Math.sin(a) * k);
          }),
          true,
        );
      }
      g.setScale(0.2);
      scene.tweens.add({ targets: g, scale: 1.4, angle: 45, alpha: 0, duration: 360, ease: 'Quad.Out', onComplete: () => g.destroy() });
      ring(scene, x, y, 0xff77a8, 4, 28, 300, 2);
      sparks(scene, x, y, [0xff77a8, 0xffec27, 0x83769c], 12, 24);
      world.strike(t, 1.5, 'proc', true);
      world.area(x, y, 28, 0.6, 100, 'proc');
      floatText(scene, x, y - 22, 'NOVA!', '#ff77a8');
    },
    tick: (c, time) => {
      const g = overlay(c).clear();
      for (const t of c.world.targets(c.p.x, c.p.y)) {
        const n = (t.getData('stars') as number | undefined) ?? 0;
        for (let i = 0; i < n; i++) {
          const a = time / 260 + (i * Math.PI * 2) / 3;
          const x = t.x + Math.cos(a) * 7;
          const y = head(t) - 10 + Math.sin(a) * 2;
          g.fillStyle(0xff77a8)
            .fillRect(x - 1, y, 3, 1)
            .fillRect(x, y - 1, 1, 3);
          g.fillStyle(0xffec27).fillRect(x, y, 1, 1);
        }
      }
    },
  },

  // LANGKAH MAUT: every life he takes lets the Reaper slip into shadow for a moment: untouchable, trailing black
  // mist, and his next swing comes out of the dark as a sure critical.
  reaper: {
    onKill: ({ p, scene }) => {
      const s = state(p, () => ({ until: 0, ready: 0, critUntil: 0, wisp: 0 }));
      const time = scene.time.now;
      if (time < s.ready) return;
      s.until = time + 1200;
      s.ready = time + 3000;
      s.critUntil = time + 3000;
      p.invuln(1200);
      smoke(scene, p.x, p.y, 10, [0x1c1c28, 0x7e2553, 0x2a0a2a], 8);
      floatText(scene, p.x, p.y - 20, 'BAYANGAN', '#83769c');
    },
    tick: ({ p, scene }, time) => {
      const s = state(p, () => ({ until: 0, ready: 0, critUntil: 0, wisp: 0 }));
      if (time >= s.until || time < s.wisp) return;
      s.wisp = time + 60;
      afterimage(scene, p, p.x, p.y, 0.55, 0x2a0a2a);
      smoke(scene, p.x, p.y + 5, 1, [0x1c1c28, 0x7e2553], 4);
    },
    modify: ({ p, scene }, t, source) => {
      const s = state(p, () => ({ until: 0, ready: 0, critUntil: 0, wisp: 0 }));
      if (source !== 'basic' || scene.time.now >= s.critUntil) return;
      s.critUntil = 0;
      cutMark(scene, t.x, t.y, 0x7e2553, 30);
      return { crit: true, mult: 1.3 };
    },
  },

  // TURET OTOMATIS: every 12 s he drops a sentry gun beside him (it thuds onto the floor) that turns toward the
  // nearest enemy and fires on its own for 7 s, then breaks down in smoke.
  gunners: {
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({ next: time + 2500 }));
      if (time < s.next || !world.targets(p.x, p.y).length) return;
      s.next = time + 12000;
      const x = Phaser.Math.Clamp(p.x - p.facing * 10, 10, W - 10);
      const legs = scene.add.graphics();
      legs.lineStyle(1, 0x1c1c28).lineBetween(0, -5, -5, 0).lineBetween(0, -5, 5, 0).lineBetween(0, -5, 0, 0);
      legs.fillStyle(0x3b3b4f).fillRect(-3, -8, 6, 4);
      legs.fillStyle(0x5f574f).fillRect(-2, -8, 4, 1);
      const gunG = scene.add.graphics();
      gunG.fillStyle(0x1c1c28).fillRect(-2, -2, 11, 3);
      gunG.fillStyle(0x5f574f).fillRect(-2, -2, 6, 3);
      gunG.fillStyle(0xc2c3c7).fillRect(0, -2, 9, 1);
      gunG.fillStyle(0xff004d).fillRect(1, 0, 1, 1);
      const gun = scene.add.container(0, -8, [gunG]);
      const turret = scene.add.container(x, FLOOR_Y - 30, [legs, gun]).setDepth(9);
      scene.tweens.add({
        targets: turret,
        y: FLOOR_Y,
        duration: 220,
        ease: 'Bounce.Out',
        onComplete: () => {
          rocks(scene, x, FLOOR_Y - 2, 4);
          scene.cameras.main.shake(60, 0.004);
        },
      });
      const fire = scene.time.addEvent({
        delay: 330,
        startAt: -150,
        loop: true,
        callback: () => {
          if (!turret.active) return fire.remove();
          const mx = turret.x;
          const my = turret.y - 8;
          const t = world.targets(mx, my).find((o) => dist(o, { x: mx, y: my }) < 170);
          if (!t) return;
          const a = Phaser.Math.Angle.Between(mx, my, t.x, t.y);
          gun.setRotation(a);
          const tip = { x: mx + Math.cos(a) * 10, y: my + Math.sin(a) * 10 };
          const flash = scene.add.circle(tip.x, tip.y, 2, 0xffec27).setDepth(13);
          scene.tweens.add({ targets: flash, radius: 0.5, alpha: 0, duration: 60, onComplete: () => flash.destroy() });
          const shell = scene.add.rectangle(mx, my, 1, 1, 0xffa300).setDepth(10);
          scene.tweens.add({ targets: shell, x: mx - Math.cos(a) * 6, y: FLOOR_Y, duration: 300, onComplete: () => shell.destroy() });
          world.shot({
            ...tip,
            vx: Math.cos(a) * 340,
            vy: Math.sin(a) * 340,
            texture: 'bullet',
            tint: 0xffec27,
            mult: 0.6,
            source: 'proc',
            knockback: 10,
          });
        },
      });
      later(scene, 7000, () => {
        fire.remove();
        smoke(scene, turret.x, turret.y - 6, 8, [0x5f574f, 0x83769c]);
        sparks(scene, turret.x, turret.y - 6, [0xffa300, 0xc2c3c7], 6, 10);
        scene.tweens.add({ targets: turret, alpha: 0, scaleY: 0.3, duration: 250, onComplete: () => turret.destroy() });
      });
    },
  },

  // JALAN KULTIVASI (the Path of Cultivation): every blow he lands gathers qi (a kill gathers more), and with enough
  // of it he breaks through to the next realm: Qi Refining, Foundation Establishment, Golden Core, Nascent Soul.
  // Heaven answers each breakthrough with a tribulation: dark clouds gather over him, violet lightning strikes him (he
  // takes it into his body in a flare of qi), then the enemies nearest him. Each realm adds swords to the guard that
  // wheels around him (cutting whatever comes close and cutting projectiles out of the air) and makes all his blows
  // heavier; at Golden Core a golden core glows in his chest; at Nascent Soul his nascent soul, a small luminous self,
  // sits at his shoulder and looses hunting swords of its own. The realm is kept on the player (`realm`), so the sword
  // arts grow with it. Every round starts again from Qi Refining.
  cultivator: {
    tick: (c, time) => {
      const { p, world, scene } = c;
      const s = state(p, cultState);
      const realm = REALMS[s.realm];
      const gold = s.realm >= 2;
      if (s.swords.length !== realm.swords) {
        s.swords.forEach((sw) => sw.destroy());
        s.swords = Array.from({ length: realm.swords }, (_, i) =>
          scene.add
            .image(p.x, p.y, 'w_pedangTerbang')
            .setTint(gold && i % 2 ? 0xffec27 : 0x9fe8ff)
            .setScale(0.8),
        );
      }
      const trail = time >= s.trail;
      if (trail) s.trail = time + 50;
      const R = 18 + 2 * s.realm;
      const foes = world.targets(p.x, p.y).filter((t) => dist(t, p) < R + 26);
      const shots = world.hostiles().filter((h) => dist(h, p) < R + 12);
      s.swords.forEach((sw, i) => {
        const a = time / (220 - 20 * s.realm) + (i * Math.PI * 2) / s.swords.length;
        sw.setPosition(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.5)
          .setRotation(a + Math.PI / 2)
          .setDepth(Math.sin(a) > 0 ? 11 : 9);
        if (trail) {
          const d = scene.add.rectangle(sw.x, sw.y, 1, 1, gold ? 0xffec27 : 0xc2f0ff).setDepth(10);
          scene.tweens.add({ targets: d, alpha: 0, duration: 180, onComplete: () => d.destroy() });
        }
        for (const t of foes) {
          if (dist(t, sw) > 8 + t.displayWidth / 2 || time - (s.last.get(t) ?? 0) < 450) continue;
          s.last.set(t, time);
          cutMark(scene, t.x, t.y, gold ? 0xffec27 : 0x29adff, 14);
          world.strike(t, 0.5 + 0.15 * s.realm, 'proc', false, undefined, 40);
        }
        // A sword that crosses an enemy projectile cuts it out of the air.
        for (const h of shots) {
          if (!h.active || dist(h, sw) > 7) continue;
          cutMark(scene, h.x, h.y, 0xc2f0ff, 10);
          sparks(scene, h.x, h.y, [0x29adff, 0xfff1e8], 4, 8);
          h.destroy();
        }
      });
      // Golden Core: a gold core pulses in his chest.
      const g = overlay(c, 11.5);
      g.clear();
      if (gold && p.visible) {
        const pulse = 2 + Math.sin(time / 150);
        g.fillStyle(0xffec27, 0.3).fillCircle(p.x, p.y - 1, pulse + 2);
        g.fillStyle(0xffec27).fillCircle(p.x, p.y - 1, 1.2);
      }
      // Nascent Soul: a small luminous self at his shoulder, loosing a hunting sword every 1.3 s.
      if (s.realm < 3) return;
      const sx = p.x - p.facing * 11;
      const sy = p.y - 13 + Math.sin(time / 300) * 2;
      if (!s.soul?.active)
        s.soul = scene.add
          .image(sx, sy, p.texture.key)
          .setTint(0xc2f0ff)
          .setTintMode(Phaser.TintModes.FILL)
          .setScale(0.6)
          .setAlpha(0.55)
          .setDepth(9);
      s.soul.setTexture(p.texture.key).setPosition(sx, sy).setFlipX(p.flipX);
      g.lineStyle(1, 0xffec27, 0.8).strokeEllipse(sx, sy - 6, 6, 2);
      if (time < s.soulAt) return;
      const t = world.targets(sx, sy)[0];
      if (!t) return;
      s.soulAt = time + 1300;
      const a = Phaser.Math.Angle.Between(sx, sy, t.x, t.y);
      ring(scene, sx, sy, 0xc2f0ff, 2, 10, 160);
      world.shot({
        x: sx,
        y: sy,
        vx: Math.cos(a) * 240,
        vy: Math.sin(a) * 240,
        texture: 'w_pedangTerbang',
        tint: 0xfff1e8,
        mult: 0.6,
        source: 'proc',
        homing: true,
      });
    },
    onHit: (c, _t, h) => gainQi(c, h.source === 'basic' ? 1 : 2),
    onKill: (c) => gainQi(c, 3),
    modify: ({ p }) => ({ mult: 1 + 0.1 * state(p, cultState).realm }),
  },

  // RESONANSI ELEMEN: two elements meeting in one enemy react. A burning enemy struck by ice explodes in scalding
  // steam; a burning enemy weighed down by stone erupts in magma. Both statuses are spent by the reaction.
  elementalis: {
    onHit: (c, t, h) => {
      const { world, scene } = c;
      if (h.killed || !burning(c, t)) return;
      const ice = frozen(c, t);
      if (!ice && !slowed(c, t)) return;
      const now = scene.time.now;
      if (now < ((t.getData('reactUntil') as number | undefined) ?? 0)) return;
      t.setData({ reactUntil: now + 900, burnUntil: now, burn: 0 });
      if (ice) t.setData('freezeUntil', now);
      else t.setData('slowUntil', now);
      const { x, y } = t;
      if (ice) {
        // Steam: white clouds billow up and out.
        smoke(scene, x, y, 12, [0xfff1e8, 0xc2c3c7, 0xc2f0ff], 10);
        ring(scene, x, y, 0xc2f0ff, 4, 30, 300, 2);
        floatText(scene, x, y - 22, 'UAP!', '#c2f0ff');
      } else {
        // Magma: molten rock bursts from the ground under it.
        flameTongue(scene, x, y + 8, 22, 400, FIRE);
        rocks(scene, x, Math.min(FLOOR_Y - 2, y + 6), 8);
        ring(scene, x, y, 0xff004d, 4, 30, 300, 2);
        floatText(scene, x, y - 22, 'MAGMA!', '#ffa300');
      }
      world.strike(t, 1.6, 'proc', true);
      world.area(x, y, 26, 0.6, 140, 'proc', ice ? { slow: 800 } : { burn: 0.15 });
    },
  },

  // KUDA-KUDA IAI: standing still, the samurai settles into a draw stance (a glint runs along the scabbard). His next
  // swing is a flash-draw: one white line through everything in front of him, every cut a critical.
  samurai: {
    tick: ({ p, scene }, time, delta) => {
      const s = state(p, () => ({ still: 0, ready: false, shine: 0 }));
      const standing = p.grounded && p.body.velocity.x === 0 && !p.swinging && !p.dashing;
      if (!standing) {
        if (s.ready && !p.swinging) s.ready = false;
        s.still = 0;
        return;
      }
      s.still += delta;
      if (!s.ready && s.still >= 700) {
        s.ready = true;
        s.shine = 0;
      }
      if (s.ready && time >= s.shine) {
        s.shine = time + 600;
        glint(scene, p.x + p.facing * 5, p.y + 1);
      }
    },
    onAttack: ({ p, world, scene }, m) => {
      const s = state(p, () => ({ still: 0, ready: false, shine: 0 }));
      if (!s.ready || m.anim === 'shoot') return;
      s.ready = false;
      s.still = 0;
      const f = p.facing;
      const reach = 60;
      bladeLine(scene, p.x, p.y, Phaser.Math.Clamp(p.x + f * reach, 0, W), p.y, 0xfff1e8, 120);
      scene.cameras.main.shake(80, 0.006);
      floatText(scene, p.x, p.y - 20, 'IAI!', '#fff1e8');
      for (const t of world.targets(p.x, p.y)) {
        const dx = (t.x - p.x) * f;
        if (dx < -4 || dx > reach || Math.abs(t.y - p.y) > 14) continue;
        later(scene, 60 + dx, () => {
          if (!t.active) return;
          cutMark(scene, t.x, t.y, 0xff004d, 26, 0);
          world.strike(t, 1.3, 'proc', true);
        });
      }
    },
  },

  // BAYANGAN DENDAM: the avenger's own shadow hates as he does. A beat after every swing, a black copy of him repeats
  // it where he stood, cutting whatever is there again (harder while MODE AVENGER burns).
  darkAvenger: {
    onAttack: ({ p, world, scene }, m) => {
      if (m.anim === 'shoot') return;
      const box = p.swingHitbox();
      const { x, y, flipX } = p;
      const key = p.texture.key;
      const f = p.facing;
      const mult = m.dmg * (p.awakened ? 0.7 : 0.4);
      later(scene, 200, () => {
        if (!p.active) return;
        const shade = scene.add
          .image(x - f * 2, y, key)
          .setFlipX(flipX)
          .setTint(0x2a0a2a)
          .setTintMode(Phaser.TintModes.FILL)
          .setAlpha(0.8)
          .setDepth(9);
        scene.tweens.add({ targets: shade, alpha: 0, x: shade.x - f * 4, duration: 320, onComplete: () => shade.destroy() });
        const arc = scene.add
          .image(box.centerX, box.centerY, 'slashMoon')
          .setTint(0x8a3fd1)
          .setScale((f * box.width) / 14, box.height / 16)
          .setAlpha(0.8)
          .setDepth(12);
        scene.tweens.add({ targets: arc, alpha: 0, duration: 220, onComplete: () => arc.destroy() });
        for (const t of world.targets(box.centerX, box.centerY)) {
          if (!Phaser.Geom.Intersects.RectangleToRectangle(box, t.getBounds())) continue;
          cutMark(scene, t.x, t.y, 0x8a3fd1, 20);
          world.strike(t, mult, 'proc', false, undefined, 60);
        }
      });
    },
  },

  // LEDAKAN AMARAH: when Ashura's fury fills, it will not stay inside him: a golden halo bursts out with six phantom
  // fists punching outward all around, and half the fury burns on.
  ashura: {
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({ ready: 0 }));
      if (!p.stats.furyMax || p.fury < p.stats.furyMax || time < s.ready) return;
      s.ready = time + 1500;
      p.fury = Math.floor(p.stats.furyMax / 2);
      const halo = scene.add
        .circle(p.x, p.y - 2, 8)
        .setStrokeStyle(2, 0xffec27)
        .setDepth(13);
      scene.tweens.add({ targets: halo, radius: 40, alpha: 0, duration: 320, onComplete: () => halo.destroy() });
      ring(scene, p.x, p.y, 0xffa300, 4, 46, 380, 2);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
        const fist = scene.add.image(p.x, p.y, 'w_enamLengan').setTint(0xffec27).setRotation(a).setDepth(13);
        scene.tweens.add({
          targets: fist,
          x: p.x + Math.cos(a) * 40,
          y: p.y + Math.sin(a) * 40,
          alpha: 0,
          duration: 260,
          ease: 'Quad.Out',
          onComplete: () => fist.destroy(),
        });
      }
      scene.cameras.main.shake(140, 0.012);
      floatText(scene, p.x, p.y - 22, 'MURKA!', '#ffec27');
      world.area(p.x, p.y, 42, 1.3, 220, 'proc');
    },
  },

  // BARA KEHANCURAN: anything that dies burning near the dragon king does not just fall: it bursts in a ball of fire
  // that sets everything around it alight, so one burning kill can chain through a crowd.
  antares: {
    onKill: (c, t) => {
      if (!burning(c, t)) return;
      const { world, scene } = c;
      const { x, y } = t;
      explosion(scene, x, y, 18);
      flameTongue(scene, x, y + 6, 18, 360, FIRE);
      later(scene, 60, () => world.area(x, y, 30, 0.7, 140, 'proc', { burn: 0.2 }));
    },
  },

  // TAK LAYAK ("you are not worthy to approach the king"): an enemy that comes within arm's reach of Gilgamesh has a
  // golden gate open over its head and a treasure driven down into it.
  gilgamesh: {
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({ ready: 0, said: false }));
      if (time < s.ready) return;
      const t = world.targets(p.x, p.y)[0];
      if (!t || dist(t, p) > 30) return;
      s.ready = time + 1100;
      const gx = t.x;
      const gy = Math.max(10, t.y - 28);
      p.gatePortal(gx, gy, Math.PI / 2);
      if (!s.said) {
        s.said = true;
        floatText(scene, p.x, p.y - 22, 'TAK LAYAK!', '#ffec27');
      }
      const blade = scene.add
        .image(gx, gy, Phaser.Math.RND.pick(['w_pedang', 'w_tombak', 'w_kapak', 'w_katana']))
        .setTint(0xfff0a0)
        .setRotation(Math.PI / 2)
        .setDepth(12);
      scene.tweens.add({
        targets: blade,
        y: t.y,
        delay: 70,
        duration: 80,
        ease: 'Quad.In',
        onComplete: () => {
          scene.tweens.add({ targets: blade, alpha: 0, duration: 160, onComplete: () => blade.destroy() });
          if (!t.active) return;
          sparks(scene, t.x, t.y, [0xffec27, 0xfff1e8], 8, 14);
          world.strike(t, 1, 'proc', false, undefined, 200);
        },
      });
    },
  },

  // DISMANTLE: Sukuna does not need to look. Every 1.3 s two unseen Kai open cuts on enemies anywhere on the field;
  // every third volley is Hachi, a crossed cleave that cuts deeper and sprays blood that heals him.
  sukuna: {
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({ next: time + 1300, n: 0 }));
      if (time < s.next) return;
      const foes = world.targets(p.x, p.y);
      if (!foes.length) return;
      s.next = time + 1300;
      s.n++;
      const picks = Phaser.Math.RND.shuffle([...foes]).slice(0, 2);
      for (const t of picks) {
        if (s.n % 3) {
          cutMark(scene, t.x, t.y, 0xfff1e8, 26);
          sparks(scene, t.x, t.y, [0xff004d, 0xfff1e8], 5, 12);
          world.strike(t, 0.9, 'proc', false);
          continue;
        }
        cutMark(scene, t.x, t.y, 0xff004d, 34, 0.8);
        later(scene, 70, () => cutMark(scene, t.x, t.y, 0xff004d, 34, -0.8));
        later(scene, 70, () => t.active && world.strike(t, 1.8, 'proc', true));
        sparks(scene, t.x, t.y, [0xff004d, 0x7e2553, 0xfff1e8], 12, 20);
        floatText(scene, t.x, t.y - 22, 'HACHI', '#ff004d');
        p.heal(1);
      }
    },
  },

  // INFINITY: between Gojo and everything else lies an infinity that never ends. A hostile projectile that comes near
  // slows, slows, and stops in the air a hand's breadth from him, trembling in a blue shimmer, then comes apart.
  gojo: {
    tick: ({ p, world, scene }, time, delta) => {
      const s = state(p, () => ({ held: new Map<Phaser.GameObjects.GameObject, number>() }));
      for (const h of world.hostiles()) {
        if (dist(h, p) > 34) continue;
        const since = s.held.get(h);
        const body = h.body as Phaser.Physics.Arcade.Body;
        if (since === undefined) {
          s.held.set(h, time);
          body.setAllowGravity(false);
          ring(scene, h.x, h.y, 0x29adff, 10, 2, 240);
        }
        body.velocity.scale(Math.max(0, 1 - delta * 0.014));
        if (Math.floor(time / 50) % 2) {
          const d = scene.add.rectangle(h.x + Phaser.Math.Between(-5, 5), h.y + Phaser.Math.Between(-5, 5), 1, 1, 0xc2f0ff).setDepth(13);
          scene.tweens.add({ targets: d, alpha: 0, duration: 150, onComplete: () => d.destroy() });
        }
        if (time - (since ?? time) > 600) {
          s.held.delete(h);
          sparks(scene, h.x, h.y, [0x29adff, 0xfff1e8], 6, 10);
          ring(scene, h.x, h.y, 0xc2f0ff, 2, 10, 200);
          h.destroy();
        }
      }
      for (const h of s.held.keys()) if (!h.active) s.held.delete(h);
    },
  },

  // REFLEKS SURGAWI: Heavenly Restriction's body reads an attack before it lands. Dashing straight through one, Toji
  // sees the world slow down around him: nearby enemies crawl, and his next blow is a sure critical.
  toji: {
    onAttacked: ({ p, world, scene }, result) => {
      const s = state(p, () => ({ ready: 0, critUntil: 0 }));
      const time = scene.time.now;
      if (result !== 'ignored' || !p.dashing || time < s.ready) return;
      s.ready = time + 4000;
      s.critUntil = time + 2500;
      const veil = scene.add
        .rectangle(0, 0, W, FLOOR_Y + 20, 0xc2c3c7, 0.22)
        .setOrigin(0)
        .setDepth(8);
      scene.tweens.add({ targets: veil, alpha: 0, duration: 500, onComplete: () => veil.destroy() });
      for (const t of world.targets(p.x, p.y)) if (dist(t, p) < 140) world.afflict(t, { slow: 1500 });
      afterimage(scene, p, p.x, p.y, 0.8);
      ring(scene, p.x, p.y, 0xfff1e8, 4, 30, 260);
      floatText(scene, p.x, p.y - 20, 'REFLEKS!', '#fff1e8');
    },
    modify: ({ p, scene }, _t, source) => {
      const s = state(p, () => ({ ready: 0, critUntil: 0 }));
      if (source !== 'basic' || scene.time.now >= s.critUntil) return;
      s.critUntil = 0;
      return { crit: true, mult: 1.5 };
    },
  },

  // SUSANOO: RUSUK: once a round, the blow that would drop Madara under 40% HP meets a blue ribcage of Susanoo that
  // forms around him in an instant. For 4 s nothing gets through it, and the ribs shove away whatever crowds him.
  madara: {
    guard: ({ p, scene }, dmg) => {
      const s = state(p, () => ({ used: false, until: 0, next: 0, cage: undefined as Phaser.GameObjects.Container | undefined }));
      if (s.used || p.hp - incoming(p, dmg) > p.stats.maxHp * 0.4) return false;
      s.used = true;
      s.until = scene.time.now + 4000;
      p.parry('SUSANOO!', '#29adff');
      p.invuln(4000);
      const g = scene.add.graphics();
      // Spine and four pairs of ribs curving around him: dark outline, blue body, pale edge.
      for (const [w, c, a] of [
        [3, 0x1d2b53, 0.9],
        [2, 0x29adff, 0.8],
        [1, 0xc2f0ff, 0.9],
      ] as const) {
        g.lineStyle(w, c, a).lineBetween(0, -14, 0, 8);
        for (let i = 0; i < 4; i++) {
          const y = -11 + i * 5;
          const r = 9 - i;
          for (const side of [-1, 1]) {
            g.beginPath();
            g.arc(0, y + 3, r, side > 0 ? -Math.PI / 2 : Math.PI * 1.5, side > 0 ? 0.6 : Math.PI - 0.6, side < 0);
            g.strokePath();
          }
        }
      }
      g.fillStyle(0x29adff, 0.15).fillEllipse(0, -2, 26, 30);
      const cage = scene.add.container(p.x, p.y, [g]).setDepth(11).setScale(0.2, 0);
      scene.tweens.add({ targets: cage, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' });
      s.cage = cage;
      scene.cameras.main.flash(120, 41, 173, 255);
      return true;
    },
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({ used: false, until: 0, next: 0, cage: undefined as Phaser.GameObjects.Container | undefined }));
      const cage = s.cage;
      if (!cage) return;
      if (time >= s.until) {
        s.cage = undefined;
        sparks(scene, cage.x, cage.y, [0x29adff, 0xc2f0ff], 14, 24);
        scene.tweens.add({ targets: cage, alpha: 0, scaleY: 1.3, duration: 250, onComplete: () => cage.destroy() });
        return;
      }
      cage.setPosition(p.x, p.y).setAlpha(0.75 + Math.sin(time / 80) * 0.2);
      if (time >= s.next) {
        s.next = time + 500;
        world.area(p.x, p.y, 24, 0.5, 220, 'proc');
      }
    },
  },

  // BENIH KEHIDUPAN: where an enemy falls, Hashirama's wood takes root. A sapling bursts up out of the floor; its roots
  // snare enemies standing near it, and touching it heals him (the sapling is spent).
  hashirama: {
    onKill: ({ p, world, scene }, t) => {
      const s = state(p, () => ({ trees: [] as { x: number; y: number; obj: Phaser.GameObjects.Container; born: number }[] }));
      if (s.trees.length >= 4) return;
      const x = Phaser.Math.Clamp(t.x, 8, W - 8);
      const y = FLOOR_Y;
      const g = scene.add.graphics();
      g.fillStyle(0x4a2a1a).fillRect(-2, -10, 4, 10);
      g.fillStyle(0xab5236).fillRect(-1, -10, 2, 10);
      g.fillStyle(0x003b1f).fillCircle(0, -13, 6).fillCircle(-4, -10, 4).fillCircle(4, -10, 4);
      g.fillStyle(0x008751).fillCircle(0, -13, 5).fillCircle(-4, -10, 3).fillCircle(4, -10, 3);
      g.fillStyle(0x00e436).fillCircle(-1, -15, 2).fillRect(2, -12, 1, 1);
      const obj = scene.add.container(x, y, [g]).setDepth(4).setScale(0.2, 0);
      scene.tweens.add({ targets: obj, scaleX: 1, scaleY: 1, duration: 450, ease: 'Back.Out' });
      leafBurst(scene, x, y - 6, 6);
      s.trees.push({ x, y, obj, born: scene.time.now });
      // In bloom, its roots snatch at the feet of enemies close to it.
      later(scene, 450, () => {
        if (!obj.active) return;
        for (const o of world.targets(x, y)) {
          if (Math.abs(o.x - x) > 28 || o.y < FLOOR_Y - 30) continue;
          const root = scene.add
            .graphics()
            .setDepth(5)
            .lineStyle(1, 0x4a2a1a)
            .lineBetween(x, y - 1, o.x, o.y + 4);
          scene.tweens.add({ targets: root, alpha: 0, delay: 300, duration: 300, onComplete: () => root.destroy() });
          world.afflict(o, { freeze: 700 });
        }
      });
    },
    tick: ({ p, scene }, time) => {
      const s = state(p, () => ({ trees: [] as { x: number; y: number; obj: Phaser.GameObjects.Container; born: number }[] }));
      s.trees = s.trees.filter((tr) => {
        if (time - tr.born > 9000) {
          scene.tweens.add({ targets: tr.obj, alpha: 0, scaleY: 0.4, duration: 400, onComplete: () => tr.obj.destroy() });
          return false;
        }
        if (time - tr.born < 450 || Math.abs(p.x - tr.x) > 9 || Math.abs(p.y - (tr.y - 8)) > 14) return true;
        const amt = Math.ceil(p.stats.maxHp * 0.05);
        p.heal(amt);
        leafBurst(scene, tr.x, tr.y - 10, 12);
        floatText(scene, p.x, p.y - 18, `+${amt}`, '#00e436');
        scene.tweens.add({ targets: tr.obj, alpha: 0, scale: 1.4, duration: 250, onComplete: () => tr.obj.destroy() });
        return false;
      });
    },
  },

  // KAWARIMI GAGAK: every 9 s, the Itachi that gets hit was never there: he comes apart into a flock of crows and
  // steps out behind his attacker, who is left caught in a genjutsu.
  itachi: {
    guard: ({ p, world, scene }, _dmg, fromX, from) => {
      const s = state(p, () => ({ ready: 0 }));
      const time = scene.time.now;
      if (time < s.ready) return false;
      s.ready = time + 9000;
      const ox = p.x;
      const oy = p.y;
      // The crows: little black wings flapping up and away.
      for (let i = 0; i < 12; i++) {
        const crow = scene.add.graphics().setDepth(14).fillStyle(0x1c1c28);
        crow.fillTriangle(-3, 0, 0, -2, 0, 1).fillTriangle(3, 0, 0, -2, 0, 1);
        crow.fillStyle(0xff004d).fillRect(0, -1, 1, 1);
        crow.setPosition(ox + Phaser.Math.Between(-5, 5), oy + Phaser.Math.Between(-6, 6));
        const a = -Math.PI / 2 + Phaser.Math.FloatBetween(-1.3, 1.3);
        const d = Phaser.Math.Between(20, 44);
        scene.tweens.add({ targets: crow, scaleY: -1, duration: 90, yoyo: true, repeat: 3 });
        scene.tweens.add({
          targets: crow,
          x: crow.x + Math.cos(a) * d,
          y: crow.y + Math.sin(a) * d,
          alpha: 0,
          duration: 600,
          onComplete: () => crow.destroy(),
        });
      }
      const behind = from?.active ? from.x + (Math.sign(from.x - ox) || 1) * 16 : ox - (Math.sign(fromX - ox) || p.facing) * 40;
      p.body.reset(Phaser.Math.Clamp(behind, 8, W - 8), oy);
      p.facing = from?.active ? (from.x >= p.x ? 1 : -1) : p.facing;
      p.parry('GAGAK', '#ff004d');
      if (from?.active && !isBoss(from)) {
        world.afflict(from, { freeze: 1000 });
        ring(scene, from.x, from.y, 0xff004d, 12, 2, 300, 2);
      }
      return true;
    },
  },

  // JEJAK BEKU: frost spreads from Jack Frost's feet. Running leaves a trail of ice and every landing a wide patch;
  // enemies on it slip and slow down, and the first step onto a patch freezes them fast.
  jackFrost: {
    tick: ({ p, world, scene }, time) => {
      const s = state(p, () => ({
        patches: [] as { x: number; y: number; w: number; until: number; g: Phaser.GameObjects.Graphics; hit: Set<object> }[],
        air: false,
        next: 0,
        check: 0,
      }));
      const lay = (w: number) => {
        const x = p.x;
        const y = p.y + 7;
        const g = scene.add.graphics().setDepth(4);
        g.fillStyle(0x29adff, 0.45).fillEllipse(x, y, w + 4, 4);
        g.fillStyle(0xc2f0ff, 0.8).fillEllipse(x, y, w, 2);
        for (let i = 0; i < w / 5; i++)
          g.fillStyle(0xfff1e8).fillRect(x - w / 2 + Phaser.Math.Between(0, w), y - Phaser.Math.Between(1, 3), 1, 2);
        s.patches.push({ x, y, w, until: time + 3500, g, hit: new Set() });
        if (s.patches.length > 8) s.patches.shift()!.g.destroy();
      };
      if (p.grounded && s.air) {
        lay(30);
        sparks(scene, p.x, p.y + 6, [0xc2f0ff, 0xfff1e8], 6, 12);
      } else if (p.grounded && p.body.velocity.x !== 0 && time >= s.next) {
        s.next = time + 260;
        lay(14);
      }
      s.air = !p.grounded;
      s.patches = s.patches.filter((pt) => {
        if (time < pt.until) {
          pt.g.setAlpha(Math.min(1, (pt.until - time) / 800));
          return true;
        }
        pt.g.destroy();
        return false;
      });
      if (time < s.check) return;
      s.check = time + 100;
      for (const t of world.targets(p.x, p.y)) {
        const pt = s.patches.find((q) => Math.abs(t.x - q.x) < q.w / 2 + 3 && Math.abs(t.y + t.displayHeight / 2 - q.y) < 8);
        if (!pt) continue;
        world.afflict(t, { slow: 600 });
        if (pt.hit.has(t)) continue;
        pt.hit.add(t);
        world.afflict(t, { freeze: 450 });
        sparks(scene, t.x, pt.y, [0xc2f0ff, 0xfff1e8], 5, 10);
      }
    },
  },

  // SENSOR KURAMA: Kurama feels negative emotion. Any enemy gathering itself to attack is marked with the fox's slit
  // eye over its head, a thread of orange chakra running to it from Naruto. A hit on a marked enemy reads the attack
  // before it comes: the blow is a crit, the attack is cancelled and the enemy staggers under a fox-claw rake.
  naruto: {
    tick: (c, time) => {
      const g = overlay(c, 14);
      g.clear();
      const marked = c.world.targets(c.p.x, c.p.y).filter(windingUp);
      for (const t of marked) {
        const [x, y] = [t.x, head(t) - 6];
        g.lineStyle(1, 0xffa300, 0.25 + 0.2 * Math.sin(time / 60)).lineBetween(c.p.x, c.p.y - 4, x, y + 3);
        g.fillStyle(0xab5236).fillEllipse(x, y, 12, 7);
        g.fillStyle(0xffa300).fillEllipse(x, y, 10, 5);
        g.fillStyle(0xffec27).fillEllipse(x - 1, y - 1, 4, 2);
        g.fillStyle(0x000000).fillRect(x - 0.5, y - 2.5, 1.5, 5);
      }
      // While he senses something, a flicker of Kurama's chakra round him.
      if (marked.length) g.lineStyle(1, 0xffa300, 0.4 + 0.3 * Math.sin(time / 50)).strokeEllipse(c.p.x, c.p.y, 16, 20);
    },
    modify: (_c, t, source) => (source !== 'proc' && windingUp(t) ? { crit: true } : undefined),
    onHit: ({ scene }, t) => {
      if (!t.active || !windingUp(t)) return;
      t.interrupt(700);
      // The fox's claw: three orange rakes across it.
      for (const d of [-4, 0, 4]) cutMark(scene, t.x + d, t.y, 0xffa300, 14, -0.9);
      sparks(scene, t.x, t.y, [0xffa300, 0xffec27, 0xfff1e8], 8, 14);
      floatText(scene, t.x, t.y - 20, 'TERBACA', '#ffa300');
    },
  },

  // CHIDORI NAGASHI: chakra-lightning runs over Sasuke's whole body. Anything that touches him gets the current: it
  // jumps from him into every enemy close by and locks them up.
  sasuke: {
    onAttacked: ({ p, world, scene }, _r, from) => {
      const s = state(p, () => ({ ready: 0 }));
      const time = scene.time.now;
      if (!from || time < s.ready) return;
      s.ready = time + 2000;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        stormArc(scene, p.x, p.y, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 12, 160, 1, 0);
      }
      ring(scene, p.x, p.y, 0x29adff, 4, 32, 240, 2);
      floatText(scene, p.x, p.y - 20, 'NAGASHI!', '#29adff');
      for (const t of world.targets(p.x, p.y)) {
        if (dist(t, p) > 34) continue;
        stormArc(scene, p.x, p.y, t.x, t.y, 200, 1, 1);
        world.strike(t, 0.6, 'proc', false, { freeze: 500 }, 160);
      }
    },
  },

  // MEDAN GRAVITASI: space bends around the Gravity Master. Enemies close to him are pressed down (slowed) and every
  // blow lands heavier on them; motes of dust spiral into him along the well.
  gravityMaster: {
    tick: (c, time) => {
      const { p, world } = c;
      const s = state(p, () => ({ next: 0 }));
      const R = 50;
      const g = overlay(c, 4).clear();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + time / 900;
        g.fillStyle(i % 2 ? 0x8a3fd1 : 0x241a3d, 0.6).fillRect(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.6, 1, 1);
      }
      for (let i = 0; i < 6; i++) {
        const k = ((time / 900 + i / 6) % 1) as number;
        const a = i * 1.7 + time / 400;
        const r = R * (1 - k);
        g.fillStyle(0xc080ff, k).fillRect(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.6, 1, 1);
      }
      if (time < s.next) return;
      s.next = time + 250;
      for (const t of world.targets(p.x, p.y)) if (dist(t, p) < R) world.afflict(t, { slow: 400 });
    },
    modify: ({ p }, t) => (dist(t, p) < 50 ? { mult: 1.15 } : undefined),
  },

  // KILAT BERANTAI: when the Lightning Lord lands a critical, the blow is too much for one body: the lightning leaps
  // on to the two nearest enemies.
  lightningLord: {
    onHit: ({ p, world, scene }, t, h) => {
      const s = state(p, () => ({ ready: 0 }));
      if (!h.crit || scene.time.now < s.ready) return;
      s.ready = scene.time.now + 250;
      const { x, y } = t;
      world
        .targets(x, y)
        .filter((o) => o !== t && dist(o, { x, y }) < 90)
        .slice(0, 2)
        .forEach((o, i) =>
          later(scene, 50 + i * 60, () => {
            if (!o.active) return;
            stormArc(scene, x, y, o.x, o.y, 200, 1, 1);
            world.strike(o, 0.6, 'proc', false, { freeze: 150 });
          }),
        );
    },
  },

  // LAYANG SENJA: holding jump while falling spreads the Nephalem's wings into a glide, and as he sails he sheds
  // feathers: gold ones of light that pin, crimson ones of hellfire that burn.
  nephalem: {
    tick: ({ p, world }, time) => {
      const s = state(p, () => ({ next: 0, n: 0 }));
      if (p.grounded || p.dashing || !p.jumpHeld || p.body.velocity.y < 20) return;
      p.setVelocityY(30);
      if (time < s.next) return;
      s.next = time + 170;
      const holy = s.n++ % 2 === 0;
      world.shot({
        x: p.x + Phaser.Math.Between(-5, 5),
        y: p.y + 6,
        vx: Phaser.Math.Between(-20, 20),
        vy: 170,
        texture: 'featherShot',
        tint: holy ? HOLY : HELL,
        mult: 0.35,
        source: 'proc',
        knockback: 20,
        status: holy ? { slow: 500 } : { burn: 0.1 },
      });
    },
  },

  // KRISTAL CAHAYA: every third hit (and every critical one) leaves a hexagonal crystal of hard light floating above
  // the enemy (at most four, each lasting 8 s). The crystals bob in the air and each fires a ray of light at the
  // nearest enemy every 0.9 s. They are also the extra mirrors of Jaring Cermin, which uses them up
  // (SKILLS.foton.skill reads `crystals` from this passive's state).
  lumina: {
    onHit: ({ p, scene }, t, h) => {
      const s = state(p, crystalState);
      if (++s.hits % 3 && !h.crit) return;
      if (s.crystals.length >= 4) s.crystals.shift();
      const x = Phaser.Math.Clamp(t.x + Phaser.Math.Between(-18, 18), 10, W - 10);
      const y = Math.max(20, head(t) - Phaser.Math.Between(10, 22));
      s.crystals.push({ x, y, born: scene.time.now, next: scene.time.now + 500 });
      glint(scene, x, y);
      ring(scene, x, y, 0xc2f0ff, 2, 12, 200, 1);
    },
    tick: (c, time) => {
      const s = state(c.p, crystalState);
      s.crystals = s.crystals.filter((k) => time - k.born < 8000);
      const g = overlay(c, 12);
      g.clear();
      for (const k of s.crystals) {
        const by = k.y + Math.sin(time / 300 + k.born) * 2;
        g.save();
        g.translateCanvas(k.x, by);
        hexMirror(g, 4, 0x29adff);
        g.restore();
        if (time < k.next) continue;
        k.next = time + 900;
        const t = c.world.targets(k.x, by).find((e) => dist(e, { x: k.x, y: by }) < 150);
        if (!t) continue;
        const a = Phaser.Math.Angle.Between(k.x, by, t.x, t.y);
        lightRay(c.scene, k.x, by, a, dist(t, { x: k.x, y: by }), 0, 140);
        c.world.strike(t, 0.35, 'proc', false, undefined, 20);
      }
    },
  },

  // KORONA: a ring of living flame circles Surya, six flares chasing each other. Whatever comes within reach of it
  // burns (a pulse every 0.45 s), and when something dies near him the corona flares out in a burst that scorches
  // everything around the body.
  surya: {
    tick: (c, time) => {
      const { p, world, scene } = c;
      const g = overlay(c, 11);
      g.clear();
      g.setPosition(p.x, p.y - 2);
      g.lineStyle(1, 0xff8a1f, 0.3).strokeCircle(0, 0, 22);
      for (let i = 0; i < 6; i++) {
        const a = time / 350 + (i / 6) * Math.PI * 2;
        const [x, y] = [Math.cos(a) * 22, Math.sin(a) * 20];
        g.fillStyle(0xff004d, 0.5).fillCircle(x, y, 3);
        g.fillStyle(0xffa300).fillCircle(x, y, 2);
        g.fillStyle(0xffec27).fillCircle(x, y, 1);
      }
      const s = state(p, () => ({ next: 0 }));
      if (time < s.next) return;
      s.next = time + 450;
      for (const t of world.targets(p.x, p.y)) {
        if (dist(t, p) > 30) continue;
        sparks(scene, t.x, t.y, [0xffa300, 0xffec27], 3, 8);
        world.strike(t, 0.35, 'proc', false, { burn: 0.1 }, 0);
      }
    },
    onKill: ({ p, world, scene }, t) => {
      // Kills the burst itself causes must not burst again (area -> kill -> onKill -> area ...).
      if (dist(t, p) > 70 || p.getData('koronaBurst')) return;
      p.setData('koronaBurst', true);
      ring(scene, p.x, p.y, 0xffec27, 8, 46, 320, 2);
      ring(scene, p.x, p.y, 0xff8a1f, 4, 34, 260, 1);
      sparks(scene, p.x, p.y, [0xffec27, 0xffa300, 0xff004d], 10, 30);
      world.area(p.x, p.y, 40, 0.8, 120, 'proc', { burn: 0.15 });
      p.setData('koronaBurst', false);
    },
  },

  // FASE BULAN: a small moon floats over Candra's head and waxes with the fight, one phase every two hits: new,
  // crescent, half, gibbous, full. At the full moon (PURNAMA) its gravity takes hold: everything near him is lifted
  // off its feet and slowed, and the moon stays full, glowing, until his skill spends it (SKILLS.sabitCandra.skill
  // reads and resets p.getData('moon') and grows with it).
  candra: {
    onHit: ({ p, world, scene }, _t, h) => {
      // Only his own blows wax it: the skill's crescents must not refill the moon they just spent.
      if (h.source !== 'basic') return;
      const s = state(p, () => ({ hits: 0 }));
      const phase = (p.getData('moon') as number | undefined) ?? 0;
      if (++s.hits % 2 || phase >= 4) return;
      p.setData('moon', phase + 1);
      sparks(scene, p.x, p.y - 22, [0xfff1e8, 0x9fb4ff], 4, 8);
      if (phase + 1 < 4) return;
      floatText(scene, p.x, p.y - 34, 'PURNAMA', '#c2d4ff');
      ring(scene, p.x, p.y - 22, 0xfff1e8, 4, 20, 300, 1);
      ring(scene, p.x, p.y, 0x9fb4ff, 10, 70, 450, 2);
      world.pull(p.x, p.y - 40, 70, 130);
      for (const t of world.targets(p.x, p.y)) if (dist(t, p) < 70) world.afflict(t, { slow: 1500 });
    },
    tick: (c, time) => {
      const phase = (c.p.getData('moon') as number | undefined) ?? 0;
      const g = overlay(c, 12);
      g.clear();
      g.setPosition(c.p.x, c.p.y - 22 + Math.sin(time / 300));
      moonPhase(g, 4, phase / 4);
      // The full moon breathes a soft halo.
      if (phase >= 4) g.lineStyle(1, 0xc2d4ff, 0.4 + Math.sin(time / 150) * 0.3).strokeCircle(0, 0, 7);
    },
  },
};
