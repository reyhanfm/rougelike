import Phaser from 'phaser';
import { FLOOR_Y, W, floatText } from '../gfx/ui.ts';
import {
  ADAPT_MULT,
  GODZILLA,
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
  DEMON_PHASES,
  type BossKind,
  type BossPattern,
  type RoundConfig,
} from '../logic/stages.ts';
import type { Arena } from './arena.ts';

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
};
/** Wide attacks: they stay dangerous until the warning ends, so the boss waits longer after them. */
const WIDE: readonly BossPattern[] = ['pillars', 'laser', 'quake', 'sweep'];
/** Patterns followed by the long recovery. */
const LONG: readonly BossPattern[] = [...WIDE, 'exterminate', 'barrage', 'dive', 'breath', 'tail'];
const ADAPT_LABEL: Record<AdaptKind, string> = { basic: 'SERANGAN', skill: 'SKILL', ult: 'ULTI', proc: 'EFEK', burn: 'API', freeze: 'ES' };
const PHASE_TINTS = [0xffffff, 0xffb0b0, 0xff6060];

export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  readonly damage: number;
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
  /** Own clock (ms of frames lived): it stops while the game is paused and never reads a stale scene clock. */
  private clock = 0;
  private nextTurnAt: number = MAHORAGA.turnMs;
  private leaveAt: number = MAHORAGA.leaveMs;
  private leaving = false;
  private immuneShownAt = 0;
  /** Godzilla: next regeneration tick, and whether the nuclear pulse has gone off. */
  private nextRegenAt = 1000;
  private pulsed = false;
  /** Leviathan's scales: they soak hits until they break. */
  private armor = 0;
  private maxArmor = 0;
  private breaks = 0;
  private exposedUntil = 0;

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
    this.damage = stats.dmg;
    this.armor = this.maxArmor = kind === 'leviathan' ? Math.round(this.maxHp * LEVIATHAN.armor) : 0;
    this.baseTint = LOOP_TINTS[this.loop % LOOP_TINTS.length];
    const b = BODY[kind];
    this.setTint(this.baseTint).setDepth(8).setCollideWorldBounds(true);
    this.body.setSize(b.w, b.h).setOffset(b.ox, b.oy);
    if (b.scale) this.setScale(b.scale);
    this.body.setAllowGravity(kind !== 'lich');
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
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.wheel?.setPosition(this.x, this.y - 19);
    this.clock += delta;
    const now = this.clock;
    if (this.kind === 'mahoraga') {
      if (now >= this.nextTurnAt) {
        this.nextTurnAt = now + MAHORAGA.turnMs;
        if (this.felt.size) this.turnWheel();
      }
      if (now >= this.leaveAt && !this.leaving) {
        this.leaving = true;
        this.scene.time.delayedCall(0, () => this.active && this.arena.bossLeaves(this));
      }
    }
    if (this.kind === 'godzilla') this.godzillaTick(now);
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
    }
    return 0;
  }

  /** The wheel turns: one more step of adaptation to every kind that hit it since the last turn; it shakes off burn and freeze. */
  private turnWheel(): void {
    this.turns++;
    const adapted: string[] = [];
    const immune: string[] = [];
    for (const k of this.felt) {
      const step = Math.min(ADAPT_MULT.length - 1, (this.adaptation.get(k) ?? 0) + 1);
      this.adaptation.set(k, step);
      (ADAPT_MULT[step] ? adapted : immune).push(ADAPT_LABEL[k]);
    }
    this.felt.clear();
    this.setData({ burnUntil: 0, burn: 0, freezeUntil: this.scene.time.now });
    this.scene.tweens.add({ targets: this.wheel, angle: this.turns * 45, duration: 250 });
    this.scene.cameras.main.flash(150, 255, 236, 39);
    if (adapted.length) floatText(this.scene, W / 2, 56, `ADAPTASI: ${adapted.join(' ')}`, '#ffec27');
    if (immune.length) floatText(this.scene, W / 2, 68, `KEBAL: ${immune.join(' ')}`, '#ff004d');
    if (this.turns >= MAHORAGA.barrageAt && !this.patterns.includes('barrage')) this.patterns = [...this.patterns, 'barrage'];
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
    if (this.kind === 'leviathan') return this.exposed ? 'LEVIATHAN - TERBUKA' : this.enraged ? 'LEVIATHAN - MURKA' : 'LEVIATHAN';
    const name = this.loop ? `${BOSSES[this.kind].name} +${this.loop}` : BOSSES[this.kind].name;
    return this.phase ? `${name} - FASE ${this.phase}` : name;
  }

  private get idleMs(): number {
    if (this.kind === 'mahoraga') return Math.max(300, 1000 - 70 * this.turns);
    if (this.kind === 'leviathan' || this.kind === 'godzilla') return this.enraged ? 600 : 950;
    // Later phases barely pause.
    return Math.max(350, 1300 - 120 * (this.tier - 1)) * (this.phase ? 1 - 0.2 * (this.phase - 1) : 1);
  }

  /** Warning time before a wide attack lands: shorter every phase and every return of the boss. */
  private get warnMs(): number {
    if (this.kind === 'leviathan' || this.kind === 'godzilla') return this.enraged ? 650 : 850;
    return Math.max(550, 900 - 120 * (this.phase - 1) - 40 * this.loop);
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
        if (this.kind === 'lich') this.setVelocityY(0);
        // Godzilla's dorsal plates glow blue before the atomic breath.
        this.setTint(
          Math.floor(elapsed / 75) % 2 ? (this.kind === 'godzilla' && this.next === 'breath' ? 0x29adff : 0xff004d) : this.baseTint,
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
          ? 35 + 6 * this.turns
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
  }

  private begin(p: BossPattern, target: Phaser.GameObjects.Sprite, toward: number): void {
    const shotDmg = Math.round(this.damage * 0.6);
    switch (p) {
      case 'charge':
        this.setVelocityX(toward * Math.min(this.kind === 'mahoraga' ? 340 : 260, 170 + 10 * this.tier + 15 * this.turns));
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
        // Sword of Extermination: a wide cut in front, then Mahoraga charges through it.
        const w = 96;
        const warn = Math.max(300, 500 - 30 * this.turns);
        this.arena.zone(
          Phaser.Math.Clamp(toward > 0 ? this.x : this.x - w, 0, W - w),
          this.y - 32,
          w,
          48,
          warn,
          Math.round(this.damage * 1.3),
        );
        this.scene.time.delayedCall(warn, () => this.active && this.setVelocityX(toward * 320));
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
      case 'barrage':
        // Adapted to the player's movement: three quick strikes that follow them.
        for (let i = 0; i < 3; i++)
          this.scene.time.delayedCall(i * 380, () => {
            if (!this.active) return;
            this.arena.zone(Phaser.Math.Clamp(this.arena.player.x - 20, 0, W - 40), FLOOR_Y - 64, 40, 64, 420, this.damage);
          });
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

  /** Lich blinks to a new spot on the far side of the player. */
  private teleport(): void {
    const px = this.arena.player.x;
    const x = Phaser.Math.Clamp(px + (px > W / 2 ? -1 : 1) * Phaser.Math.Between(60, 110), 20, W - 20);
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 120, yoyo: true, onYoyo: () => this.body.reset(x, 50) });
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
