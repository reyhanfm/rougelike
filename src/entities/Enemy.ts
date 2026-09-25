import Phaser from 'phaser';
import { ENEMIES, type Debuff, type EnemyKind } from '../logic/stages.ts';
import type { Arena } from './arena.ts';
import { W } from '../gfx/ui.ts';

export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  /** Phased out (ghost): can neither hit nor be hit. */
  untargetable = false;
  readonly kind: EnemyKind;
  readonly flying: boolean;
  protected readonly arena: Arena;
  protected stunUntil = 0;
  /** Next time this enemy may act (hop, swoop, shoot...). */
  protected nextAct: number;
  private windupUntil = 0;
  /** Personal offset so enemies of one kind don't stack on the same hover spot. */
  protected readonly jitter = Phaser.Math.Between(-20, 20);

  constructor(scene: Phaser.Scene, arena: Arena, kind: EnemyKind, x: number, y: number, hp: number, damage: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arena = arena;
    this.kind = kind;
    this.hp = this.maxHp = Math.round(hp * ENEMIES[kind].hp);
    this.damage = Math.round(damage * ENEMIES[kind].dmg);
    this.flying = ENEMIES[kind].flying;
    this.setDepth(5);
    this.nextAct = scene.time.now + Phaser.Math.Between(400, 1000);
  }

  /** Call after adding to a physics group (group.add resets body defaults). */
  setup(): this {
    this.setCollideWorldBounds(true);
    this.body.setAllowGravity(!this.flying);
    return this;
  }

  abstract tick(time: number): void;

  /** Pause before the next action, shortened as rounds go on. */
  protected cd(min: number, max: number): number {
    return Phaser.Math.Between(min, max) * this.arena.pace;
  }

  /** True when a hit coming from (x, y) is stopped by this enemy's guard. */
  blocks(_x: number, _y: number): boolean {
    return false;
  }

  knockback(dir: number, force: number): void {
    this.setVelocity(dir * force, this.flying ? 0 : -force * 0.8);
    // Light bullets interrupt briefly; rapid fire must not permanently stun a target.
    this.stunUntil = this.scene.time.now + Math.min(250, Math.abs(force) * 3);
  }

  protected get target(): Phaser.GameObjects.Sprite {
    return this.arena.player;
  }

  protected get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  protected stunned(time: number): boolean {
    return time < this.stunUntil;
  }

  /** Start a red-blink "about to attack" cue lasting `ms`. */
  protected startWindup(time: number, ms: number): void {
    this.windupUntil = time + ms;
  }

  /** 'hold' while the cue blinks, 'go' on the single frame it ends, else 'idle'. */
  protected windup(time: number): 'idle' | 'hold' | 'go' {
    if (!this.windupUntil) return 'idle';
    if (time < this.windupUntil) {
      this.setTint(Math.floor(time / 70) % 2 ? 0xff004d : 0xffffff);
      return 'hold';
    }
    this.windupUntil = 0;
    this.setTint(0xffffff);
    return 'go';
  }
}

class Slime extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'slime', x, y, hp, dmg, 'slime1');
    this.body.setSize(10, 7).setOffset(1, 2);
  }

  tick(time: number): void {
    if (this.grounded && !this.stunned(time)) {
      this.setVelocityX(0);
      if (time > this.nextAct) {
        const dir = Math.sign(this.target.x - this.x) || 1;
        this.setVelocity(dir * Phaser.Math.Between(55, 90), -Phaser.Math.Between(150, 220));
        this.nextAct = time + this.cd(455, 845);
      }
    }
    // Squash just before a hop so the player can read it.
    this.setTexture(!this.grounded || this.nextAct - time < 150 ? 'slime1' : 'slime0');
  }
}

/** Hovers above the player, then swoops at where the player was. */
class Bat extends Enemy {
  private swoopUntil = 0;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'bat', x, y, hp, dmg, 'bat0');
    this.body.setSize(10, 6).setOffset(1, 1);
  }

  tick(time: number): void {
    this.setTexture(Math.floor(time / 110) % 2 ? 'bat1' : 'bat0');
    if (this.stunned(time) || time < this.swoopUntil) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocity(0, 0);
    if (w === 'go') {
      this.scene.physics.moveToObject(this, this.target, 190);
      this.swoopUntil = time + 700;
      return;
    }
    const side = this.x < this.target.x ? -30 : 30;
    const goalY = this.target.y - 45 + this.jitter / 2 + Math.sin(time / 300) * 8;
    this.scene.physics.moveTo(this, this.target.x + side + this.jitter, goalY, 70);
    if (time > this.nextAct) {
      this.startWindup(time, 300);
      this.nextAct = time + this.cd(1170, 1820);
    }
  }
}

/** Patrols; charges when the player is level with it and in front. */
class Boar extends Enemy {
  private dir = 1;
  private chargeUntil = 0;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'boar', x, y, hp, dmg, 'boar0');
    this.body.setSize(12, 8).setOffset(1, 1);
  }

  tick(time: number): void {
    this.setTexture(Math.floor(time / (time < this.chargeUntil ? 60 : 160)) % 2 ? 'boar1' : 'boar0');
    this.setFlipX(this.dir < 0);
    if (this.stunned(time) || !this.grounded) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') this.chargeUntil = time + 1000;
    if (time < this.chargeUntil) {
      this.setVelocityX(this.dir * 200);
      if (this.body.blocked.left || this.body.blocked.right) {
        this.chargeUntil = 0;
        this.stunUntil = time + 600;
        this.dir *= -1;
      }
      return;
    }
    const dx = this.target.x - this.x;
    if (Math.abs(this.target.y - this.y) < 14 && Math.abs(dx) < 170 && time > this.nextAct) {
      this.dir = Math.sign(dx) || 1;
      this.startWindup(time, 400);
      this.nextAct = time + this.cd(1430, 1430);
      return;
    }
    if (this.body.blocked.left) this.dir = 1;
    if (this.body.blocked.right) this.dir = -1;
    this.setVelocityX(this.dir * 40);
  }
}

/** Keeps its distance and shoots arrows at the player. */
class Archer extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'archer', x, y, hp, dmg, 'archer');
    this.body.setSize(6, 13).setOffset(1, 0);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    this.setFlipX(dx < 0);
    if (this.stunned(time) || !this.grounded) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      const a = Phaser.Math.Angle.Between(this.x, this.y - 2, this.target.x, this.target.y);
      this.arena.fire(this.x, this.y - 2, Math.cos(a) * 180, Math.sin(a) * 180, 'arrow', this.damage);
      return;
    }
    const dist = Math.abs(dx);
    this.setVelocityX(dist < 60 ? -Math.sign(dx) * 45 : dist > 140 ? Math.sign(dx) * 45 : 0);
    if (time > this.nextAct && dist < 220) {
      this.startWindup(time, 350);
      this.nextAct = time + this.cd(1170, 1690);
    }
  }
}

/** Floats high on the player's flank and fires slow orbs. */
class Eye extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'eye', x, y, hp, dmg, 'eye0');
    this.body.setSize(8, 8).setOffset(1, 1);
  }

  tick(time: number): void {
    this.setTexture(time % 2400 < 120 ? 'eye1' : 'eye0');
    if (this.stunned(time)) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocity(0, 0);
    if (w === 'go') {
      const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
      this.arena.fire(this.x, this.y, Math.cos(a) * 110, Math.sin(a) * 110, 'orb', this.damage);
      return;
    }
    const side = this.x < this.target.x ? -70 : 70;
    this.scene.physics.moveTo(this, this.target.x + side + this.jitter, 45 + this.jitter + Math.sin(time / 500) * 10, 45);
    if (time > this.nextAct) {
      this.startWindup(time, 400);
      this.nextAct = time + this.cd(1560, 2080);
    }
  }
}

/** Drifts straight at the player through walls; fades out (untouchable, harmless) part of the time. */
class Ghost extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'ghost', x, y, hp, dmg, 'ghost0');
    this.body.setSize(8, 9).setOffset(1, 1);
  }

  tick(time: number): void {
    this.setTexture(Math.floor(time / 200) % 2 ? 'ghost1' : 'ghost0');
    // 3s cycle, offset per ghost: 2s solid, 1s phased.
    this.untargetable = (time + this.jitter * 100) % 3000 > 2000;
    this.setAlpha(this.untargetable ? 0.25 : 0.85);
    if (this.stunned(time)) return;
    this.setFlipX(this.target.x < this.x);
    this.scene.physics.moveToObject(this, this.target, this.untargetable ? 70 : 45);
  }
}

/** Keeps its distance and lobs bombs that explode where they land. */
class Bomber extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'bomber', x, y, hp, dmg, 'bomber');
    this.body.setSize(8, 12).setOffset(1, 0);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    this.setFlipX(dx < 0);
    if (this.stunned(time) || !this.grounded) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      // Arc: ~0.8s flight toward where the player stands now.
      this.arena.fire(this.x, this.y - 4, Phaser.Math.Clamp(dx / 0.8, -150, 150), -220, 'bomb', this.damage, true);
      return;
    }
    const dist = Math.abs(dx);
    this.setVelocityX(dist < 70 ? -Math.sign(dx) * 40 : dist > 150 ? Math.sign(dx) * 40 : 0);
    if (time > this.nextAct && dist < 200) {
      this.startWindup(time, 400);
      this.nextAct = time + this.cd(1430, 1950);
    }
  }
}

/** Advances behind a shield that stops frontal hits; hit it from behind or from above. */
class ShieldKnight extends Enemy {
  private facing = 1;
  private bashUntil = 0;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'shield', x, y, hp, dmg, 'shield');
    this.body.setSize(8, 13).setOffset(1, 0);
  }

  blocks(x: number, y: number): boolean {
    const inFront = Math.sign(x - this.x) === this.facing;
    const level = y > this.y - 10;
    return inFront && level;
  }

  tick(time: number): void {
    if (time >= this.bashUntil) this.facing = Math.sign(this.target.x - this.x) || this.facing;
    this.setFlipX(this.facing < 0);
    if (this.stunned(time) || !this.grounded || time < this.bashUntil) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      this.setVelocityX(this.facing * 200);
      this.bashUntil = time + 300;
      return;
    }
    this.setVelocityX(this.facing * 35);
    if (time > this.nextAct && Math.abs(this.target.x - this.x) < 60 && Math.abs(this.target.y - this.y) < 16) {
      this.startWindup(time, 350);
      this.nextAct = time + this.cd(1625, 1625);
    }
  }
}

type CasterKind = 'spider' | 'imp' | 'wraith' | 'shaman';

/** Projectile casters: shot texture, speed, the debuffs a shot may carry, and hitbox (w, h, ox, oy). */
const CASTERS: Record<
  CasterKind,
  { shot: string; speed: number; debuffs: readonly Debuff[]; body: readonly [number, number, number, number] }
> = {
  spider: { shot: 'web', speed: 110, debuffs: ['slow'], body: [10, 6, 1, 2] },
  imp: { shot: 'fireball', speed: 110, debuffs: ['burn'], body: [8, 8, 1, 1] },
  wraith: { shot: 'iceshard', speed: 120, debuffs: ['freeze'], body: [8, 8, 1, 0] },
  shaman: { shot: 'curse', speed: 80, debuffs: ['weak', 'silence'], body: [8, 11, 1, 0] },
};

/** Flying casters hover on the player's flank; ground ones keep their distance. Shots carry a debuff. */
class Caster extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, kind: CasterKind, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, kind, x, y, hp, dmg, kind);
    const [w, h, ox, oy] = CASTERS[kind].body;
    this.body.setSize(w, h).setOffset(ox, oy);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    this.setFlipX(dx < 0);
    if (this.stunned(time) || (!this.flying && !this.grounded)) return;
    const w = this.windup(time);
    if (w === 'hold') return void (this.flying ? this.setVelocity(0, 0) : this.setVelocityX(0));
    if (w === 'go') {
      const c = CASTERS[this.kind as CasterKind];
      const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
      this.arena.fire(
        this.x,
        this.y,
        Math.cos(a) * c.speed,
        Math.sin(a) * c.speed,
        c.shot,
        this.damage,
        false,
        Phaser.Utils.Array.GetRandom([...c.debuffs]),
      );
      return;
    }
    if (this.flying) {
      const side = this.x < this.target.x ? -60 : 60;
      this.scene.physics.moveTo(this, this.target.x + side + this.jitter, 50 + this.jitter + Math.sin(time / 400) * 10, 55);
    } else {
      const dist = Math.abs(dx);
      this.setVelocityX(dist < 60 ? -Math.sign(dx) * 40 : dist > 140 ? Math.sign(dx) * 40 : 0);
    }
    if (time > this.nextAct && Math.abs(dx) < 220) {
      this.startWindup(time, 400);
      this.nextAct = time + this.cd(1300, 1820);
    }
  }
}

/** Scuttles straight at the player; its touch shocks. */
class Beetle extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'beetle', x, y, hp, dmg, 'beetle');
    this.body.setSize(10, 6).setOffset(0, 1);
  }

  tick(time: number): void {
    if (this.stunned(time) || !this.grounded) return;
    const dir = Math.sign(this.target.x - this.x) || 1;
    this.setFlipX(dir < 0);
    this.setVelocityX(dir * 60);
    // Crackle so the player can tell it apart from harmless bugs.
    this.setTint(Math.floor(time / 90) % 7 ? 0xffffff : 0xffec27);
  }
}

/** Lumbers closer, then slams the ground: shockwaves that stun. */
class Golem extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'golem', x, y, hp, dmg, 'golem');
    this.body.setSize(10, 14).setOffset(1, 0);
  }

  knockback(dir: number, force: number): void {
    // Heavy: shrugs off most of the push.
    super.knockback(dir, force * 0.3);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    this.setFlipX(dx < 0);
    if (this.stunned(time) || !this.grounded) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      this.arena.shockwave(this.x, this.body.bottom, this.damage, 'stun');
      this.scene.cameras.main.shake(120, 0.01);
      return;
    }
    this.setVelocityX(Math.abs(dx) > 30 ? Math.sign(dx) * 25 : 0);
    if (time > this.nextAct && Math.abs(dx) < 110 && Math.abs(this.target.y - this.y) < 20) {
      this.startWindup(time, 600);
      this.nextAct = time + this.cd(1690, 2210);
    }
  }
}

/** Big slime: hops at the player; splits into two slimes when it dies (RunScene). */
class Splitter extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'splitter', x, y, hp, dmg, 'splitter');
    this.body.setSize(12, 9).setOffset(1, 1);
  }

  tick(time: number): void {
    if (!this.grounded || this.stunned(time)) return;
    this.setVelocityX(0);
    if (time > this.nextAct) {
      const dir = Math.sign(this.target.x - this.x) || 1;
      this.setVelocity(dir * Phaser.Math.Between(50, 80), -Phaser.Math.Between(160, 230));
      this.nextAct = time + this.cd(600, 1000);
    }
  }
}

/** Sits still as a chest; springs to life when the player comes close (or hits it), then leaps relentlessly. */
class Mimic extends Enemy {
  private awake = false;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'mimic', x, y, hp, dmg, 'mimic0');
    this.body.setSize(12, 8).setOffset(0, 0);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    if (!this.awake) {
      this.setVelocityX(0);
      if ((Math.abs(dx) < 50 && Math.abs(this.target.y - this.y) < 30) || this.hp < this.maxHp) {
        this.awake = true;
        this.startWindup(time, 300);
      }
      return;
    }
    this.setTexture(Math.floor(time / 150) % 2 ? 'mimic1' : 'mimic0');
    this.setFlipX(dx < 0);
    if (this.stunned(time) || !this.grounded) return;
    if (this.windup(time) === 'hold') return void this.setVelocityX(0);
    this.setVelocityX(0);
    if (time > this.nextAct) {
      this.setVelocity((Math.sign(dx) || 1) * Phaser.Math.Between(90, 130), -Phaser.Math.Between(180, 240));
      this.nextAct = time + this.cd(350, 650);
    }
  }
}

/** Stalks the player, then vanishes and reappears behind them with a dashing slash. */
class Ninja extends Enemy {
  private slashUntil = 0;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'ninja', x, y, hp, dmg, 'ninja');
    this.body.setSize(6, 12).setOffset(1, 0);
  }

  tick(time: number): void {
    const dx = this.target.x - this.x;
    if (time >= this.slashUntil) this.setFlipX(dx < 0);
    if (this.stunned(time) || time < this.slashUntil) return;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      // Behind = opposite of where the player faces (the player sprite flips when facing left).
      const side = this.target.flipX ? 1 : -1;
      this.body.reset(Phaser.Math.Clamp(this.target.x + side * 18, 8, W - 8), this.target.y);
      const dir = Math.sign(this.target.x - this.x) || 1;
      this.setFlipX(dir < 0);
      this.setVelocityX(dir * 220);
      this.slashUntil = time + 250;
      return;
    }
    if (this.grounded) this.setVelocityX(Math.abs(dx) > 40 ? Math.sign(dx) * 50 : 0);
    if (time > this.nextAct && Math.abs(dx) < 160) {
      this.startWindup(time, 450);
      this.nextAct = time + this.cd(1800, 2600);
    }
  }
}

/** Rooted support: every few seconds heals the enemies around it. Kill it first. */
class Totem extends Enemy {
  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'totem', x, y, hp, dmg, 'totem');
    this.body.setSize(8, 16).setOffset(1, 0);
  }

  knockback(): void {
    // Rooted: no push, no stagger.
  }

  tick(time: number): void {
    this.setVelocityX(0);
    const w = this.windup(time);
    if (w === 'go') return this.arena.healAllies(this.x, this.y, 80, 0.2, this);
    if (w === 'idle' && time > this.nextAct) {
      this.startWindup(time, 500);
      this.nextAct = time + this.cd(3000, 4000);
    }
  }
}

/** Burrows (untouchable, faint), tunnels under the player, then bursts out upward. */
class Worm extends Enemy {
  private surfacedUntil = 0;

  constructor(scene: Phaser.Scene, arena: Arena, x: number, y: number, hp: number, dmg: number) {
    super(scene, arena, 'worm', x, y, hp, dmg, 'worm');
    this.body.setSize(10, 7).setOffset(1, 1);
    this.burrow();
  }

  private burrow(): void {
    this.untargetable = true;
    this.setAlpha(0.2);
  }

  tick(time: number): void {
    if (!this.untargetable) {
      if (time > this.surfacedUntil && this.grounded) this.burrow();
      return;
    }
    const dx = this.target.x - this.x;
    const w = this.windup(time);
    if (w === 'hold') return void this.setVelocityX(0);
    if (w === 'go') {
      this.untargetable = false;
      this.setAlpha(1).setVelocity(0, -280);
      this.surfacedUntil = time + 1600;
      return;
    }
    if (!this.grounded) return;
    this.setVelocityX(Math.abs(dx) > 6 ? Math.sign(dx) * 70 : 0);
    if (Math.abs(dx) < 10 && time > this.nextAct) {
      this.startWindup(time, 450);
      this.nextAct = time + this.cd(2000, 2600);
    }
  }
}

const CLASSES = {
  slime: Slime,
  bat: Bat,
  boar: Boar,
  archer: Archer,
  eye: Eye,
  ghost: Ghost,
  bomber: Bomber,
  shield: ShieldKnight,
  beetle: Beetle,
  golem: Golem,
  splitter: Splitter,
  mimic: Mimic,
  ninja: Ninja,
  totem: Totem,
  worm: Worm,
} satisfies Record<Exclude<EnemyKind, CasterKind>, unknown>;

export function createEnemy(scene: Phaser.Scene, arena: Arena, kind: EnemyKind, x: number, y: number, hp: number, dmg: number): Enemy {
  if (kind in CASTERS) return new Caster(scene, arena, kind as CasterKind, x, y, hp, dmg);
  return new CLASSES[kind as Exclude<EnemyKind, CasterKind>](scene, arena, x, y, hp, dmg);
}
