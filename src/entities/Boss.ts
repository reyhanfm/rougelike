import Phaser from 'phaser';
import { FLOOR_Y, W, burst, floatText } from '../gfx/ui.ts';
import {
  ADAPT_MULT,
  GODZILLA,
  KAGUYA,
  LEVIATHAN,
  MAHORAGA,
  specialStats,
  type AdaptKind,
  type SpecialBoss,
  BOSSES,
  bossKind,
  bossLoop,
  bossPatterns,
  bossPhase,
  bossBite,
  DEMON_PHASES,
  type BossKind,
  type BossPattern,
  type RoundConfig,
} from '../logic/stages.ts';
import type { Arena } from './arena.ts';
import { glint, ring, rocks, sparks } from './skills.ts';

type Mode = 'idle' | 'windup' | BossPattern;

// Each completed boss rotation recolors the bosses; cycles after the last one.
const LOOP_TINTS = [0xffffff, 0xff77a8, 0x83769c, 0xffa300];
const WINDUP_MS = 450;
/** Body box in texture pixels; `scale` enlarges sprite and body together. */
const BODY: Record<BossKind, { texture: string; w: number; h: number; ox: number; oy: number; scale?: number }> = {
  knight: { texture: 'boss', w: 16, h: 22, ox: 2, oy: 2 },
  slimeKing: { texture: 'slimeKing', w: 24, h: 13, ox: 2, oy: 4 },
  lich: { texture: 'lich', w: 10, h: 18, ox: 3, oy: 2 },
  demonLord: { texture: 'demonLord', w: 16, h: 18, ox: 2, oy: 0 },
  mahoraga: { texture: 'mahoraga', w: 14, h: 22, ox: 3, oy: 2 },
  leviathan: { texture: 'leviathan', w: 34, h: 14, ox: 4, oy: 10, scale: 1.6 },
  godzilla: { texture: 'godzilla', w: 18, h: 22, ox: 8, oy: 5, scale: 2 },
  kaguya: { texture: 'kaguya', w: 12, h: 20, ox: 2, oy: 2, scale: 1.5 },
};
/** Wide attacks: they stay dangerous until the warning ends, so the boss waits longer after them. */
const WIDE: readonly BossPattern[] = ['pillars', 'laser', 'quake', 'sweep'];
/** Patterns followed by the long recovery. */
const LONG: readonly BossPattern[] = [...WIDE, 'exterminate', 'blitz', 'barrage', 'dive', 'breath', 'tail', 'truth', 'portal', 'dimension'];
const ADAPT_LABEL: Record<AdaptKind, string> = { basic: 'SERANGAN', skill: 'SKILL', ult: 'ULTI', proc: 'EFEK', burn: 'API', freeze: 'ES' };
const PHASE_TINTS = [0xffffff, 0xffb0b0, 0xff6060];

export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  private readonly flatDamage: number;
  readonly tier: number;
  readonly kind: BossKind;
  /** Mahoraga or Leviathan (bonus round); undefined for the regular bosses. */
  readonly special?: SpecialBoss;
  baseTint: number;
  /** Leviathan while submerged: no hits land and it touches nothing. */
  untargetable = false;
  /** Raja Iblis: 1-3, from remaining HP; 0 for single-phase bosses. */
  private phase = 0;
  private readonly arena: Arena;
  private patterns: readonly BossPattern[];
  /** Completed rotations: more projectiles and shorter pauses each loop. */
  private readonly loop: number;
  private mode: Mode = 'idle';
  private modeAt: number;
  private next: BossPattern;
  /** Mahoraga: adaptation steps per kind of attack (index into ADAPT_MULT). */
  private readonly adaptation = new Map<AdaptKind, number>();
  /** Mahoraga: kinds of attack that hit it since the last wheel turn. */
  private readonly felt = new Set<AdaptKind>();
  /** Mahoraga: wheel turns so far; each one makes it faster. */
  private turns = 0;
  private wheel?: Phaser.GameObjects.Image;
  /** Mahoraga: the wheel's resting angle (45 degrees a turn); it rocks around it. Tweened, so it is public. */
  wheelAngle = 0;
  /** Mahoraga: below MAHORAGA.frenzy of its HP it rages for the rest of the fight. */
  private raging = false;
  private nextMoteAt = 0;
  private nextGhostAt = 0;
  /** Own clock (ms of frames lived): it stops while the game is paused and never reads a stale scene clock. */
  private clock = 0;
  private nextTurnAt: number = MAHORAGA.turnMs;
  private leaveAt: number = MAHORAGA.leaveMs;
  private leaving = false;
  private immuneShownAt = 0;
  /** Godzilla: next regeneration tick, and whether the nuclear pulse has gone off. */
  private nextRegenAt = 1000;
  private pulsed = false;
  /** Kaguya: Infinite Tsukuyomi has been cast. */
  private tsukuyomi = false;
  /** Leviathan's scales: they soak hits until they break. */
  private armor = 0;
  private maxArmor = 0;
  private breaks = 0;
  private exposedUntil = 0;
  /** Mid-jolt from `flinch`: one at a time, so the restore always undoes exactly one shift. */
  private flinching = false;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, cfg: RoundConfig, special?: SpecialBoss) {
    const kind = special ?? bossKind(cfg.bossTier);
    super(scene, x, y, BODY[kind].texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arena = arena;
    this.kind = kind;
    this.special = special;
    this.tier = cfg.bossTier;
    this.loop = special ? 0 : bossLoop(this.tier);
    this.patterns = special ? BOSSES[kind].patterns : bossPatterns(kind, this.tier);
    this.next = this.patterns[0];
    const stats = special ? specialStats(special, cfg) : { hp: cfg.bossHp, dmg: cfg.bossDamage };
    this.hp = this.maxHp = stats.hp;
    this.flatDamage = stats.dmg;
    this.armor = this.maxArmor = kind === 'leviathan' ? Math.round(this.maxHp * LEVIATHAN.armor) : 0;
    this.baseTint = LOOP_TINTS[this.loop % LOOP_TINTS.length];
    const b = BODY[kind];
    this.setTint(this.baseTint).setDepth(8).setCollideWorldBounds(true);
    this.body.setSize(b.w, b.h).setOffset(b.ox, b.oy);
    if (b.scale) this.setScale(b.scale);
    this.body.setAllowGravity(kind !== 'lich' && kind !== 'kaguya');
    this.modeAt = scene.time.now + 800;
    if (kind === 'demonLord') {
      this.phase = 1;
      this.patterns = DEMON_PHASES[0];
    }
    if (kind === 'mahoraga') {
      this.wheel = scene.add.image(x, y - 19, 'mWheel').setDepth(8);
      this.once(Phaser.GameObjects.Events.DESTROY, () => this.wheel?.destroy());
    }
    if (kind === 'leviathan' || kind === 'godzilla') scene.cameras.main.shake(800, 0.012);
    if (kind === 'kaguya') scene.cameras.main.flash(500, 192, 128, 255);
  }

  /** Flat damage plus a bite of the player's max HP; every attack scales this (shots x0.6 ... laser x1.6). */
  get damage(): number {
    return Math.round(this.flatDamage + bossBite(this.tier) * this.arena.playerMaxHp);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.clock += delta;
    const now = this.clock;
    if (this.kind === 'mahoraga') this.mahoragaTick(now);
    if (this.kind === 'godzilla') this.godzillaTick(now);
    if (this.kind === 'kaguya') this.kaguyaTick();
  }

  /**
   * Special bosses reshape what hits them (damage, freeze ms). Mahoraga: whatever share its adaptation to that kind
   * still lets through (0 once immune); the kind counts toward the next wheel turn. Leviathan's scales soak it until
   * they break. Other bosses take everything unchanged.
   */
  resist(kind: AdaptKind, value: number): number {
    if (this.kind === 'leviathan') return this.scales(kind, value);
    if (this.kind !== 'mahoraga') return value;
    this.felt.add(kind);
    const share = ADAPT_MULT[this.adaptation.get(kind) ?? 0];
    if (share) return Math.max(1, Math.round(value * share));
    const now = this.scene.time.now;
    if (now - this.immuneShownAt > 500) {
      this.immuneShownAt = now;
      floatText(this.scene, this.x, this.y - 22, 'KEBAL', '#ffec27');
      // The blow glances off: a gold ring snaps shut around it.
      ring(this.scene, this.x, this.y, 0xffec27, 20, 9, 180, 2);
      sparks(this.scene, this.x, this.y, [0xffec27, 0xfff1e8], 6, 16);
    }
    return 0;
  }

  /**
   * Hit reaction: bosses are too heavy to push, so only the picture jolts 2 screen px away from the blow. Display
   * origin and body offset shift by the same amount, which leaves the physics body where it was.
   */
  flinch(dir: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (this.flinching || !dir || !body) return;
    this.flinching = true;
    const ox = this.originX;
    const d = (dir * 2) / this.scaleX;
    this.displayOriginX -= d;
    body.offset.x -= d;
    // Absolute restore (setOrigin), so a texture swap during the jolt cannot leave the picture off-center.
    this.scene.time.delayedCall(70, () => {
      this.flinching = false;
      if (!this.active || !this.body) return;
      this.setOrigin(ox, this.originY);
      body.offset.x += d;
    });
  }

  /**
   * Mahoraga's own frame: the wheel bobs and rocks over its head, pale motes rise off the body (gold and red once it
   * rages), it leaves afterimages when it moves fast, the wheel turns on its clock, and in time it leaves.
   */
  private mahoragaTick(now: number): void {
    const s = this.scene;
    this.wheel?.setPosition(this.x, this.y - 19 + Math.sin(now / 260)).setAngle(this.wheelAngle + Math.sin(now / 420) * 4);
    if (!this.raging && this.hp < this.maxHp * MAHORAGA.frenzy) this.rage();
    if (now >= this.nextTurnAt) {
      this.nextTurnAt = now + MAHORAGA.turnMs * (this.raging ? MAHORAGA.frenzyTurn : 1);
      if (this.felt.size) this.turnWheel();
    }
    if (now >= this.nextMoteAt) {
      this.nextMoteAt = now + (this.raging ? 45 : 110);
      const color = this.raging ? Phaser.Math.RND.pick([0xffec27, 0xff004d]) : 0xfff1e8;
      const m = s.add
        .rectangle(this.x + Phaser.Math.Between(-8, 8), this.y + Phaser.Math.Between(-6, 10), 1, 2, color)
        .setDepth(7)
        .setAlpha(0.8);
      s.tweens.add({ targets: m, y: m.y - Phaser.Math.Between(10, 18), alpha: 0, duration: 520, onComplete: () => m.destroy() });
    }
    if (Math.abs(this.body.velocity.x) > 160 && now >= this.nextGhostAt) {
      this.nextGhostAt = now + 35;
      this.ghost(0.45, this.raging ? 0xff004d : 0xfff1e8);
    }
    if (now >= this.leaveAt && !this.leaving) {
      this.leaving = true;
      s.time.delayedCall(0, () => this.active && this.arena.bossLeaves(this));
    }
  }

  /** A fading solid-color copy of Mahoraga where it stands (fast moves, blinks). */
  private ghost(alpha: number, color: number): void {
    const g = this.scene.add
      .image(this.x, this.y, this.texture.key)
      .setFlipX(this.flipX)
      .setScale(this.scaleX, this.scaleY)
      .setTint(color)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(alpha)
      .setDepth(7);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() });
  }

  /**
   * The wheel turns: one more step of adaptation to every kind that hit it since the last turn. The clunk heals it
   * (adapting mends the wound), shakes off burn and freeze and throws a shockwave out both ways: the eight spokes
   * flare, a gold ring rolls out and light is drawn back into the body.
   */
  private turnWheel(): void {
    const s = this.scene;
    this.turns++;
    const adapted: string[] = [];
    const immune: string[] = [];
    for (const k of this.felt) {
      const step = Math.min(ADAPT_MULT.length - 1, (this.adaptation.get(k) ?? 0) + 1);
      this.adaptation.set(k, step);
      (ADAPT_MULT[step] ? adapted : immune).push(ADAPT_LABEL[k]);
    }
    this.felt.clear();
    this.setData({ burnUntil: 0, burn: 0, freezeUntil: s.time.now });
    const heal = Math.min(this.maxHp - this.hp, Math.round(this.maxHp * MAHORAGA.heal));
    this.hp += heal;
    if (heal > 0) floatText(s, this.x, this.y - 32, `+${heal}`, '#00e436');

    // The clunk: a 45-degree turn that overshoots and settles, the wheel swelling for a beat.
    s.tweens.add({ targets: this, wheelAngle: this.turns * 45, duration: 260, ease: 'Back.Out' });
    if (this.wheel) {
      this.wheel.setScale(1.8);
      s.tweens.add({ targets: this.wheel, scale: 1, duration: 300, ease: 'Quad.Out' });
    }
    const wx = this.x;
    const wy = this.y - 19;
    for (let i = 0; i < 8; i++) {
      const ray = s.add
        .rectangle(wx, wy, 34, i % 2 ? 1 : 2, i % 2 ? 0xfff1e8 : 0xffec27)
        .setOrigin(0, 0.5)
        .setRotation(Phaser.Math.DegToRad(this.turns * 45 + i * 45))
        .setDepth(13)
        .setScale(0, 1);
      s.tweens.add({ targets: ray, scaleX: 1, alpha: 0, duration: 320, ease: 'Quad.Out', onComplete: () => ray.destroy() });
    }
    ring(s, wx, wy, 0xffec27, 6, 48, 420, 2);
    ring(s, this.x, this.body.bottom - 2, 0xfff1e8, 4, 70, 380);
    // Light drawn back in from all round: the wound closing.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = s.add.rectangle(this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30, 2, 2, i % 2 ? 0x00e436 : 0xffec27).setDepth(13);
      s.tweens.add({ targets: m, x: this.x, y: this.y, alpha: 0.2, duration: 380, ease: 'Quad.In', onComplete: () => m.destroy() });
    }
    s.cameras.main.flash(150, 255, 236, 39);
    s.cameras.main.shake(160, 0.01);
    this.arena.shockwave(this.x, this.body.bottom, Math.round(this.damage * 0.6));
    if (adapted.length) floatText(s, W / 2, 56, `ADAPTASI: ${adapted.join(' ')}`, '#ffec27');
    if (immune.length) floatText(s, W / 2, 68, `KEBAL: ${immune.join(' ')}`, '#ff004d');
    for (const [p, at] of [
      ['blitz', MAHORAGA.blitzAt],
      ['barrage', MAHORAGA.barrageAt],
    ] as const)
      if (this.turns >= at && !this.patterns.includes(p)) this.patterns = [...this.patterns, p];
  }

  /** Below MAHORAGA.frenzy of its HP: a roar, the body flushes red, the wheel spins round and turns faster from now on. */
  private rage(): void {
    const s = this.scene;
    this.raging = true;
    this.baseTint = 0xffb0b0;
    this.setTint(this.baseTint);
    s.cameras.main.shake(450, 0.018);
    floatText(s, W / 2, 80, 'MAHORAGA MENGAMUK!', '#ff004d');
    ring(s, this.x, this.y, 0xff004d, 8, 90, 600, 3);
    ring(s, this.x, this.y, 0xffec27, 4, 60, 450);
    rocks(s, this.x, this.body.bottom, 10);
    s.tweens.add({ targets: this, wheelAngle: this.wheelAngle + 360, duration: 700, ease: 'Cubic.Out' });
  }

  /**
   * The Sword of Extermination's cut: a crescent of positive energy at (x, y) opening toward `dir` (white core over a
   * gold glow, a thin inner edge), sparks thrown off its tip.
   */
  private swordArc(x: number, y: number, dir: number, r: number): void {
    const s = this.scene;
    const c = s.add
      .container(x, y)
      .setDepth(13)
      .setScale(0.5 * dir, 0.5);
    const g = s.add.graphics();
    const arc = (w: number, color: number, alpha: number, rr: number) => {
      g.lineStyle(w, color, alpha);
      g.beginPath();
      g.arc(0, 0, rr, -1.25, 1.25);
      g.strokePath();
    };
    arc(9, 0xffec27, 0.25, r);
    arc(5, 0xfff1e8, 0.5, r);
    arc(2, 0xffffff, 1, r);
    arc(1, 0xffec27, 0.8, r - 6);
    c.add(g);
    s.tweens.add({ targets: c, scaleX: 1.1 * dir, scaleY: 1.1, alpha: 0, duration: 300, ease: 'Quad.Out', onComplete: () => c.destroy() });
    sparks(s, x + dir * r, y, [0xfff1e8, 0xffec27], 8, 24);
  }

  /** A fist landing at (x, y): a white shock ring, dust and rocks off the floor, a hard shake. */
  private impact(x: number, y: number): void {
    const s = this.scene;
    ring(s, x, y, 0xfff1e8, 4, 26, 220, 2);
    ring(s, x, y, 0xffec27, 2, 16, 160);
    burst(s, x, y, 0xfff1e8, 10);
    rocks(s, x, FLOOR_Y, 5);
    s.cameras.main.shake(140, 0.014);
  }

  /** Godzilla regenerates, and once it is badly hurt it releases a nuclear pulse all around. */
  private godzillaTick(now: number): void {
    if (now >= this.nextRegenAt) {
      this.nextRegenAt = now + 1000;
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * GODZILLA.regen));
    }
    if (this.pulsed || this.hp >= this.maxHp * GODZILLA.enrage) return;
    this.pulsed = true;
    this.scene.cameras.main.flash(300, 41, 173, 255);
    floatText(this.scene, W / 2, 56, 'NUCLEAR PULSE', '#29adff');
    this.arena.zone(this.x - 100, this.y - 100, 200, 200, 800, Math.round(this.damage * 1.5), 0x29adff);
  }

  /** Infinite Tsukuyomi, once, when Kaguya is first pushed below half HP: a red moon, she withdraws out of reach while White Zetsu come out of the moonlight. */
  private kaguyaTick(): void {
    if (this.tsukuyomi || this.hp >= this.maxHp * KAGUYA.tsukuyomiAt) return;
    this.tsukuyomi = true;
    const s = this.scene;
    s.cameras.main.flash(400, 255, 0, 77);
    floatText(s, W / 2, 56, 'MUGEN TSUKUYOMI', '#ff004d');
    const moon = [
      s.add.circle(W / 2, 34, 22, 0xff004d, 0.85),
      s.add.circle(W / 2, 34, 14).setStrokeStyle(1, 0x000000),
      s.add.circle(W / 2, 34, 7).setStrokeStyle(1, 0x000000),
      s.add.circle(W / 2, 34, 2, 0x000000),
    ];
    moon.forEach((m) => m.setDepth(1));
    s.tweens.add({ targets: moon, alpha: 0, delay: KAGUYA.hideMs, duration: 600, onComplete: () => moon.forEach((m) => m.destroy()) });
    this.untargetable = true;
    this.setAlpha(0.4);
    for (let i = 0; i < 3; i++) this.arena.summon('ninja', Phaser.Math.Between(40, W - 40), 40);
    s.time.delayedCall(KAGUYA.hideMs, () => {
      if (!this.active) return;
      this.untargetable = false;
      this.setAlpha(1);
    });
  }

  /** Amenominaka: she drags the fight into another dimension (lava floor, falling ice, or a desert half) and reappears elsewhere. */
  private shiftDimension(): void {
    const s = this.scene;
    const dim = Phaser.Math.RND.pick(['lava', 'ice', 'sand'] as const);
    const color = { lava: 0xff004d, ice: 0x29adff, sand: 0xffa300 }[dim];
    const veil = s.add
      .rectangle(0, 0, W, FLOOR_Y + 20, color, 0.25)
      .setOrigin(0)
      .setDepth(3);
    s.tweens.add({ targets: veil, alpha: 0, delay: 1200, duration: 400, onComplete: () => veil.destroy() });
    s.cameras.main.flash(250, (color >> 16) & 255, (color >> 8) & 255, color & 255);
    floatText(s, W / 2, 56, { lava: 'DIMENSI LAVA', ice: 'DIMENSI ES', sand: 'DIMENSI PASIR' }[dim], '#c080ff');
    this.teleport();
    if (dim === 'lava') this.arena.zone(0, FLOOR_Y - 12, W, 12, this.warnMs, this.damage, 0xff004d);
    if (dim === 'ice')
      for (let i = 0; i < 8; i++)
        this.arena.fire(Phaser.Math.Between(10, W - 10), -8 - i * 14, 0, 160, 'iceshard', Math.round(this.damage * 0.6), false, 'freeze');
    if (dim === 'sand') {
      const left = this.arena.player.x < W / 2;
      this.arena.zone(left ? 0 : W / 2, 0, W / 2, FLOOR_Y, this.warnMs, this.damage, 0xffa300);
    }
  }

  /** A Yomotsu Hirasaka portal: a violet rift swirling open beside (x, y). */
  private portalFx(x: number, y: number): void {
    for (const side of [-1, 1]) {
      const rift = this.scene.add
        .ellipse(x + side * 22, y, 4, 22, 0x1d0f2e)
        .setStrokeStyle(1, 0xc080ff)
        .setDepth(12)
        .setScale(0.2, 1);
      this.scene.tweens.add({ targets: rift, scaleX: 1.6, duration: 150, yoyo: true, hold: 350, onComplete: () => rift.destroy() });
    }
  }

  /** Leviathan: armored, the scales take the hit and its HP only a sliver; exposed, it takes extra. */
  private scales(kind: AdaptKind, value: number): number {
    if (this.exposed) return Math.round(value * LEVIATHAN.exposed);
    if (kind !== 'freeze') this.armor -= value;
    if (this.armor <= 0) this.breakScales();
    return Math.max(1, Math.round(value * LEVIATHAN.armored));
  }

  /** Scales shatter: stunned, then exposed for a while; they grow back thicker. */
  private breakScales(): void {
    const now = this.scene.time.now;
    this.armor = 0;
    this.breaks++;
    this.exposedUntil = now + LEVIATHAN.exposedMs;
    // The scene holds a frozen boss still: that is the stun.
    this.setData('freezeUntil', now + LEVIATHAN.stunMs);
    this.baseTint = 0xff9090;
    this.scene.cameras.main.shake(250, 0.015);
    floatText(this.scene, this.x, this.y - 30, 'SISIK PECAH!', '#ffec27');
    this.scene.time.delayedCall(LEVIATHAN.exposedMs, () => {
      if (!this.active) return;
      this.armor = this.maxArmor = Math.round(this.maxHp * LEVIATHAN.armor * (1 + LEVIATHAN.armorGrowth * this.breaks));
      this.baseTint = 0xffffff;
      this.setTint(this.baseTint);
      floatText(this.scene, this.x, this.y - 30, 'SISIK TUMBUH', '#29adff');
    });
  }

  private get exposed(): boolean {
    return this.scene.time.now < this.exposedUntil;
  }

  private get enraged(): boolean {
    if (this.kind === 'godzilla') return this.hp < this.maxHp * GODZILLA.enrage;
    if (this.kind === 'kaguya') return this.hp < this.maxHp * KAGUYA.enrage;
    return this.kind === 'leviathan' && this.hp < this.maxHp * LEVIATHAN.enrage;
  }

  /** Leviathan's scales left, 0..1 (0 for every other boss), for the HUD. */
  get armorFrac(): number {
    return this.maxArmor ? Math.max(0, this.armor) / this.maxArmor : 0;
  }

  get title(): string {
    if (this.kind === 'mahoraga') {
      const left = `${Math.max(0, Math.ceil((this.leaveAt - this.clock) / 1000))}S`;
      return this.turns ? `MAHORAGA - RODA ${this.turns} - ${left}` : `MAHORAGA - ${left}`;
    }
    if (this.kind === 'godzilla') return this.enraged ? 'GODZILLA - MURKA' : 'GODZILLA';
    if (this.kind === 'kaguya') return this.untargetable ? 'KAGUYA - TSUKUYOMI' : this.enraged ? 'KAGUYA - MURKA' : 'OTSUTSUKI KAGUYA';
    if (this.kind === 'leviathan') return this.exposed ? 'LEVIATHAN - TERBUKA' : this.enraged ? 'LEVIATHAN - MURKA' : 'LEVIATHAN';
    const name = this.loop ? `${BOSSES[this.kind].name} +${this.loop}` : BOSSES[this.kind].name;
    return this.phase ? `${name} - FASE ${this.phase}` : name;
  }

  private get idleMs(): number {
    if (this.kind === 'mahoraga') return Math.max(200, 800 - 70 * this.turns) * (this.raging ? 0.7 : 1);
    if (this.kind === 'leviathan' || this.kind === 'godzilla' || this.kind === 'kaguya') return this.enraged ? 480 : 800;
    // Later phases barely pause.
    return Math.max(300, 1100 - 130 * (this.tier - 1)) * (this.phase ? 1 - 0.2 * (this.phase - 1) : 1);
  }

  /** Warning time before a wide attack lands: shorter every phase and every return of the boss. */
  private get warnMs(): number {
    if (this.kind === 'leviathan' || this.kind === 'godzilla' || this.kind === 'kaguya') return this.enraged ? 600 : 780;
    return Math.max(500, 850 - 120 * (this.phase - 1) - 40 * this.loop);
  }

  /** Raja Iblis enters the next phase: roar, shockwaves, new tint and patterns, short pause. */
  private checkPhase(time: number): void {
    if (!this.phase) return;
    const next = bossPhase(this.hp, this.maxHp);
    if (next <= this.phase) return;
    this.phase = next;
    this.patterns = DEMON_PHASES[next - 1];
    this.baseTint = PHASE_TINTS[next - 1];
    this.setTint(this.baseTint).setVelocityX(0);
    this.scene.cameras.main.flash(300, 255, 0, 77);
    this.scene.cameras.main.shake(400, 0.02);
    floatText(this.scene, this.x, this.y - 24, `FASE ${next}!`, '#ff004d');
    this.arena.shockwave(this.x, this.body.bottom, Math.round(this.damage * 0.7));
    this.mode = 'idle';
    this.modeAt = time + 1200;
  }

  private get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  tick(time: number): void {
    const target = this.arena.player;
    const toward = Math.sign(target.x - this.x) || 1;
    this.checkPhase(time);
    const elapsed = time - this.modeAt;

    switch (this.mode) {
      case 'idle':
        this.idleMove(time, toward);
        if (elapsed > 0) {
          // Enraged Leviathan also floods the floor.
          this.next = Phaser.Utils.Array.GetRandom([...this.patterns, ...(this.enraged ? (['quake'] as const) : [])]);
          if (this.kind === 'lich') this.teleport();
          this.enter('windup', time);
        }
        break;
      case 'windup':
        this.setVelocityX(0);
        if (this.kind === 'lich' || this.kind === 'kaguya') this.setVelocityY(0);
        // Godzilla's dorsal plates glow blue before the atomic breath.
        this.setTint(
          Math.floor(elapsed / 75) % 2
            ? this.kind === 'godzilla' && this.next === 'breath'
              ? 0x29adff
              : this.kind === 'kaguya'
                ? 0xc080ff
                : 0xff004d
            : this.baseTint,
        );
        if (elapsed > WINDUP_MS) {
          this.setTint(this.baseTint);
          this.enter(this.next, time);
          this.begin(this.next, target, toward);
          // Super boss from phase 2: wide attacks sometimes come in pairs (dodge both at once).
          if (this.phase >= 2 && WIDE.includes(this.next) && Math.random() < (this.phase >= 3 ? 0.6 : 0.35)) {
            const other = this.patterns.filter((p) => WIDE.includes(p) && p !== this.next);
            if (other.length) this.begin(Phaser.Math.RND.pick(other), target, toward);
          }
        }
        break;
      case 'charge':
        if (this.body.blocked.left || this.body.blocked.right) {
          this.scene.cameras.main.shake(150, 0.015);
          this.rest(time);
        } else if (elapsed > 1400) {
          this.rest(time);
        }
        break;
      case 'slam':
      case 'hop':
        if (this.grounded && elapsed > 200) {
          this.arena.shockwave(this.x, this.body.bottom, Math.round(this.damage * 0.7));
          this.scene.cameras.main.shake(200, 0.02);
          if (this.kind === 'mahoraga') {
            rocks(this.scene, this.x, this.body.bottom, 8);
            ring(this.scene, this.x, this.body.bottom, 0xfff1e8, 4, 40, 300);
          }
          this.rest(time);
        }
        break;
      default:
        // One-shot patterns: fired in begin(), then a short recovery (longer after wide attacks).
        if (elapsed > (LONG.includes(this.mode) ? 1100 : 600)) this.rest(time);
    }
  }

  private idleMove(time: number, toward: number): void {
    this.setFlipX(toward < 0);
    if (this.kind === 'knight' || this.kind === 'demonLord' || this.special) {
      const speed =
        this.kind === 'mahoraga'
          ? (40 + 7 * this.turns) * (this.raging ? 1.3 : 1)
          : this.enraged
            ? 45
            : this.kind === 'godzilla'
              ? 22
              : this.special
                ? 30
                : this.phase
                  ? 20 + 10 * this.phase
                  : 25;
      this.setVelocityX(this.grounded ? toward * speed : this.body.velocity.x);
    }
    if (this.kind === 'slimeKing' && this.grounded) this.setVelocityX(0);
    if (this.kind === 'lich') {
      // Drift above the player with a slow bob.
      const vx = Phaser.Math.Clamp(this.arena.player.x - this.x, -30, 30);
      this.setVelocity(vx, (50 + Math.sin(time / 400) * 10 - this.y) * 2);
    }
    if (this.kind === 'kaguya') {
      // She floats at a distance from the player, swaying slowly, below the boss bars.
      const px = this.arena.player.x;
      const want = px + (this.x < px ? -80 : 80);
      this.setVelocity(Phaser.Math.Clamp(want - this.x, -40, 40), (90 + Math.sin(time / 500) * 12 - this.y) * 2);
    }
  }

  private begin(p: BossPattern, target: Phaser.GameObjects.Sprite, toward: number): void {
    const shotDmg = Math.round(this.damage * 0.6);
    switch (p) {
      case 'charge':
        this.setVelocityX(toward * Math.min(this.kind === 'mahoraga' ? 380 : 260, 170 + 10 * this.tier + 20 * this.turns));
        break;
      case 'slam':
        this.setVelocity(Phaser.Math.Clamp((target.x - this.x) / 0.9, -220, 220), -320);
        break;
      case 'hop':
        this.setVelocity(Phaser.Math.Clamp((target.x - this.x) / 1.1, -160, 160), -280);
        break;
      case 'fan': {
        const n = 3 + 2 * this.loop;
        const base = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        for (let i = 0; i < n; i++) this.shoot(base + (i - (n - 1) / 2) * 0.25, 110, 'orb', shotDmg);
        break;
      }
      case 'spit':
        for (let i = 0; i < 4 + this.loop; i++) {
          const vx = toward * Phaser.Math.Between(30, 150);
          this.arena.fire(this.x, this.y - 6, vx, -Phaser.Math.Between(180, 260), 'blob', shotDmg, true);
        }
        break;
      case 'summon':
        for (let i = 0; i < 2 + this.loop; i++) this.arena.summon('slime', this.x + (i % 2 ? 16 : -16), this.y - 10);
        break;
      case 'ring': {
        const n = 8 + 4 * this.loop + (this.enraged ? 4 : 0);
        const offset = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) this.shoot(offset + (i / n) * Math.PI * 2, 75, this.kind === 'leviathan' ? 'bubble' : 'orb', shotDmg);
        break;
      }
      case 'meteor':
        this.arena.meteors(4 + this.loop * 2, shotDmg);
        break;
      case 'bats':
        for (let i = 0; i < 2 + this.loop; i++) this.arena.summon('bat', this.x + (i % 2 ? 20 : -20), this.y);
        break;
      case 'pillars': {
        // Fire columns on most 32px lanes; the rest are the safe gaps. Phase 3 follows up on the gaps.
        const lanes = Phaser.Utils.Array.Shuffle([...Array(W / 32).keys()]);
        const safe = new Set(lanes.slice(0, Math.max(2, 4 - this.phase - this.loop)));
        for (let i = 0; i < W / 32; i++) if (!safe.has(i)) this.arena.zone(i * 32 + 3, 0, 26, FLOOR_Y, this.warnMs, this.damage);
        // Phase 3: once the first wave lands, the gaps get their own warning (so the safe lanes are readable first).
        if (this.phase >= 3)
          this.scene.time.delayedCall(this.warnMs, () => {
            if (this.active) for (const i of safe) this.arena.zone(i * 32 + 3, 0, 26, FLOOR_Y, this.warnMs, this.damage);
          });
        break;
      }
      case 'laser': {
        // Full-width beam at the player's height (a second one in phase 3): drop down or jump over.
        const ys = [target.y, ...(this.phase >= 3 ? [target.y + Phaser.Math.RND.pick([-40, 40])] : [])];
        for (const y of ys) this.arena.zone(0, Phaser.Math.Clamp(y - 7, 20, FLOOR_Y - 14), W, 14, this.warnMs, this.damage);
        break;
      }
      case 'legion':
        // Phase 3: calls in its guard of imps, ninjas and ice wraiths.
        for (let i = 0; i < 2 + this.loop; i++)
          this.arena.summon(Phaser.Math.RND.pick(['imp', 'ninja', 'wraith'] as const), this.x + (i % 2 ? 24 : -24), this.y - 10);
        break;
      case 'quake':
        // The whole floor erupts: be in the air (or on a platform) when it hits.
        this.arena.zone(0, FLOOR_Y - 12, W, 12, this.warnMs, this.damage);
        this.scene.cameras.main.shake(this.warnMs, 0.004);
        break;
      case 'exterminate': {
        // Sword of Extermination: the blade glints, a wide cut of positive energy opens in front, then Mahoraga charges
        // through it. Once it has adapted enough it wheels round and cuts again where the player went.
        const s = this.scene;
        const w = 96;
        const warn = Math.max(260, 480 - 35 * this.turns);
        glint(s, this.x + toward * 10, this.y + 4);
        this.arena.zone(
          Phaser.Math.Clamp(toward > 0 ? this.x : this.x - w, 0, W - w),
          this.y - 32,
          w,
          48,
          warn,
          Math.round(this.damage * 1.3),
        );
        s.time.delayedCall(warn, () => {
          if (!this.active) return;
          this.swordArc(this.x + toward * 8, this.y - 8, toward, 44);
          s.cameras.main.shake(120, 0.012);
          this.setVelocityX(toward * 340);
        });
        if (this.turns >= MAHORAGA.doubleCutAt)
          s.time.delayedCall(warn + 380, () => {
            if (!this.active) return;
            const { x: px, y: py } = this.arena.player;
            const back = Math.sign(px - this.x) || -toward;
            this.setVelocityX(0).setFlipX(back < 0);
            glint(s, this.x + back * 10, this.y + 4);
            const zy = Phaser.Math.Clamp(py - 28, 0, FLOOR_Y - 48);
            this.arena.zone(Phaser.Math.Clamp(back > 0 ? this.x : this.x - w, 0, W - w), zy, w, 48, 300, Math.round(this.damage * 1.3));
            s.time.delayedCall(300, () => this.active && this.swordArc(this.x + back * 8, zy + 24, back, 44));
          });
        break;
      }
      case 'blitz': {
        // Adapted to the player's footwork: it melts into its own shadow, comes out right behind them with the fist
        // already drawn back, and the punch lands an instant later.
        const s = this.scene;
        const p = this.arena.player;
        const behind = p.flipX ? 1 : -1;
        const x = Phaser.Math.Clamp(p.x + behind * 28, 16, W - 16);
        this.ghost(0.8, 0x8a3fd1);
        burst(s, this.x, this.y, 0x1d0f2e, 12);
        this.body.reset(x, this.y);
        const dir = Math.sign(p.x - x) || -behind;
        this.setFlipX(dir < 0);
        ring(s, x, this.y, 0x8a3fd1, 18, 4, 160, 2);
        const warn = Math.max(200, 340 - 25 * this.turns);
        const zx = Phaser.Math.Clamp(dir > 0 ? x : x - 44, 0, W - 44);
        this.arena.zone(zx, this.y - 22, 44, 36, warn, Math.round(this.damage * 1.1));
        s.time.delayedCall(warn, () => this.active && this.impact(zx + 22, this.y - 4));
        break;
      }
      case 'dive': {
        // Leviathan submerges (cannot be hit, heals), then erupts under the player.
        const x = Phaser.Math.Clamp(this.arena.player.x, 20, W - 20);
        this.untargetable = true;
        this.setVisible(false);
        this.body.enable = false;
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * LEVIATHAN.diveHeal));
        this.arena.zone(x - 24, FLOOR_Y - 70, 48, 70, 900, Math.round(this.damage * 1.4));
        this.scene.time.delayedCall(900, () => {
          if (!this.active) return;
          this.body.enable = true;
          this.body.reset(x, FLOOR_Y - 20);
          this.setVisible(true).setVelocityY(-300);
          this.untargetable = false;
          this.scene.cameras.main.shake(250, 0.02);
        });
        break;
      }
      case 'breath': {
        // Atomic breath: a thick blue beam from the mouth to the edge, at the player's height.
        const y = Phaser.Math.Clamp(target.y - 10, 20, FLOOR_Y - 20);
        const x0 = toward > 0 ? this.x : 0;
        this.arena.zone(x0, y, toward > 0 ? W - this.x : this.x, 20, 900, Math.round(this.damage * 1.6), 0x29adff);
        this.setTint(0x29adff);
        this.scene.time.delayedCall(900, () => this.active && this.setTint(this.baseTint));
        break;
      }
      case 'tail':
        // Tail swipe: everything close on both sides.
        this.arena.zone(this.x - 80, this.body.bottom - 30, 160, 30, 500, this.damage);
        break;
      case 'roar':
        // Roar: shockwaves both ways that stun.
        floatText(this.scene, this.x, this.y - 40, 'GRRAAAHH!', '#ff004d');
        this.scene.cameras.main.shake(500, 0.02);
        this.arena.shockwave(this.x, this.body.bottom, Math.round(this.damage * 0.7), 'stun');
        break;
      case 'barrage': {
        // Adapted to the player's movement: a chase of strikes that follow them (one more each turn, up to six), each
        // a fist slamming down where they stood.
        const n = 3 + Math.min(3, this.turns - MAHORAGA.barrageAt);
        for (let i = 0; i < n; i++)
          this.scene.time.delayedCall(i * 340, () => {
            if (!this.active) return;
            const x = Phaser.Math.Clamp(this.arena.player.x - 20, 0, W - 40);
            this.arena.zone(x, FLOOR_Y - 64, 40, 64, 400, this.damage);
            this.scene.time.delayedCall(400, () => this.active && this.impact(x + 20, FLOOR_Y - 4));
          });
        break;
      }
      case 'bones': {
        // All-Killing Ash Bones: a spread of bones shot at the player; a hit leaves them weakened.
        const base = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const n = this.enraged ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.13;
          this.arena.fire(this.x, this.y, Math.cos(a) * 170, Math.sin(a) * 170, 'bone', shotDmg, false, 'weak');
        }
        break;
      }
      case 'hair':
        // Hair needles: two rings of hardened hair burst out all around her.
        for (const k of [0, 1])
          this.scene.time.delayedCall(k * 250, () => {
            if (!this.active) return;
            const n = this.enraged ? 20 : 14;
            for (let i = 0; i < n; i++) this.shoot(k * (Math.PI / n) + (i / n) * Math.PI * 2, 95, 'hairNeedle', shotDmg);
          });
        break;
      case 'truth': {
        // Expansive Truth-Seeking Ball: a giant black ball falls on the player's spot; get out from under it.
        const x = Phaser.Math.Clamp(target.x - 36, 0, W - 72);
        this.arena.zone(x, 0, 72, FLOOR_Y, 1000, Math.round(this.damage * 1.5), 0x8a3fd1);
        // Keep the scene: the boss may be dead (and its own `scene` cleared) before the ball lands.
        const scene = this.scene;
        const ball = scene.add
          .image(x + 36, -30, 'gudodama')
          .setScale(6)
          .setDepth(12);
        scene.tweens.add({
          targets: ball,
          y: FLOOR_Y - 26,
          duration: 1000,
          ease: 'Quad.In',
          onComplete: () => {
            scene.cameras.main.shake(300, 0.02);
            scene.tweens.add({ targets: ball, alpha: 0, scale: 8, duration: 250, onComplete: () => ball.destroy() });
          },
        });
        break;
      }
      case 'portal':
        // Yomotsu Hirasaka: rifts open beside the player and her palms strike through them, following them.
        for (let k = 0; k < (this.enraged ? 3 : 2); k++)
          this.scene.time.delayedCall(k * 450, () => {
            if (!this.active) return;
            const { x, y } = this.arena.player;
            this.portalFx(x, y);
            this.arena.zone(Phaser.Math.Clamp(x - 18, 0, W - 36), y - 18, 36, 36, 500, this.damage, 0xc080ff);
          });
        break;
      case 'dimension':
        this.shiftDimension();
        break;
      case 'sweep': {
        // A low wall of fire sweeps across the floor from the boss's side: jump it.
        const dir = this.x < W / 2 ? 1 : -1;
        for (let i = 0; i < 8; i++) {
          const x = dir > 0 ? i * 40 : W - (i + 1) * 40;
          this.arena.zone(x, FLOOR_Y - 26, 40, 26, this.warnMs * 0.65 + i * 100, this.damage);
        }
        break;
      }
    }
  }

  private shoot(angle: number, speed: number, texture: string, dmg: number): void {
    this.arena.fire(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, texture, dmg);
  }

  /** Lich (and Kaguya) blinks to a new spot on the far side of the player. */
  private teleport(): void {
    const px = this.arena.player.x;
    const x = Phaser.Math.Clamp(px + (px > W / 2 ? -1 : 1) * Phaser.Math.Between(60, 110), 20, W - 20);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 120,
      yoyo: true,
      // The boss may die mid-blink; its body is gone by then.
      onYoyo: () => this.active && this.body.reset(x, this.kind === 'kaguya' ? 90 : 50),
    });
  }

  private enter(mode: Mode, time: number): void {
    this.mode = mode;
    this.modeAt = time;
  }

  /** Back to idle; modeAt in the future means "wait this long". */
  private rest(time: number): void {
    if (this.kind !== 'lich') this.setVelocityX(0);
    this.mode = 'idle';
    this.modeAt = time + this.idleMs;
  }
}
