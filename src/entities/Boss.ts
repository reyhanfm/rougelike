import Phaser from 'phaser';
import { FLOOR_Y, W, floatText } from '../gfx/ui.ts';
import {
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
const BODY: Record<BossKind, { texture: string; w: number; h: number; ox: number; oy: number }> = {
  knight: { texture: 'boss', w: 16, h: 22, ox: 2, oy: 2 },
  slimeKing: { texture: 'slimeKing', w: 24, h: 13, ox: 2, oy: 4 },
  lich: { texture: 'lich', w: 10, h: 18, ox: 3, oy: 2 },
  demonLord: { texture: 'demonLord', w: 16, h: 18, ox: 2, oy: 0 },
};
/** Wide attacks: they stay dangerous until the warning ends, so the boss waits longer after them. */
const WIDE: readonly BossPattern[] = ['pillars', 'laser', 'quake', 'sweep'];
const PHASE_TINTS = [0xffffff, 0xffb0b0, 0xff6060];

export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly tier: number;
  readonly kind: BossKind;
  baseTint: number;
  /** Raja Iblis: 1-3, from remaining HP; 0 for single-phase bosses. */
  private phase = 0;
  private readonly arena: Arena;
  private patterns: readonly BossPattern[];
  /** Completed rotations: more projectiles and shorter pauses each loop. */
  private readonly loop: number;
  private mode: Mode = 'idle';
  private modeAt: number;
  private next: BossPattern;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, cfg: RoundConfig) {
    const kind = bossKind(cfg.bossTier);
    super(scene, x, y, BODY[kind].texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arena = arena;
    this.kind = kind;
    this.tier = cfg.bossTier;
    this.loop = bossLoop(this.tier);
    this.patterns = bossPatterns(kind, this.tier);
    this.next = this.patterns[0];
    this.hp = this.maxHp = cfg.bossHp;
    this.damage = cfg.bossDamage;
    this.baseTint = LOOP_TINTS[this.loop % LOOP_TINTS.length];
    const b = BODY[kind];
    this.setTint(this.baseTint).setDepth(8).setCollideWorldBounds(true);
    this.body.setSize(b.w, b.h).setOffset(b.ox, b.oy);
    this.body.setAllowGravity(kind !== 'lich');
    this.modeAt = scene.time.now + 800;
    if (kind === 'demonLord') {
      this.phase = 1;
      this.patterns = DEMON_PHASES[0];
    }
  }

  get title(): string {
    const name = this.loop ? `${BOSSES[this.kind].name} +${this.loop}` : BOSSES[this.kind].name;
    return this.phase ? `${name} - FASE ${this.phase}` : name;
  }

  private get idleMs(): number {
    // Later phases barely pause.
    return Math.max(350, 1300 - 120 * (this.tier - 1)) * (this.phase ? 1 - 0.2 * (this.phase - 1) : 1);
  }

  /** Warning time before a wide attack lands: shorter every phase and every return of the boss. */
  private get warnMs(): number {
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
          this.next = Phaser.Utils.Array.GetRandom([...this.patterns]);
          if (this.kind === 'lich') this.teleport();
          this.enter('windup', time);
        }
        break;
      case 'windup':
        this.setVelocityX(0);
        if (this.kind === 'lich') this.setVelocityY(0);
        this.setTint(Math.floor(elapsed / 75) % 2 ? 0xff004d : this.baseTint);
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
        if (elapsed > (WIDE.includes(this.mode) ? 1100 : 600)) this.rest(time);
    }
  }

  private idleMove(time: number, toward: number): void {
    this.setFlipX(toward < 0);
    if (this.kind === 'knight' || this.kind === 'demonLord')
      this.setVelocityX(this.grounded ? toward * (this.phase ? 20 + 10 * this.phase : 25) : this.body.velocity.x);
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
        this.setVelocityX(toward * Math.min(260, 170 + 10 * this.tier));
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
        const n = 8 + 4 * this.loop;
        const offset = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) this.shoot(offset + (i / n) * Math.PI * 2, 75, 'orb', shotDmg);
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
