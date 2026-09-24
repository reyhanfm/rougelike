import Phaser from 'phaser';
import { ENEMIES, type EnemyKind } from '../logic/stages.ts';
import type { Arena } from './arena.ts';

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
    this.nextAct = scene.time.now + Phaser.Math.Between(600, 1400);
  }

  /** Call after adding to a physics group (group.add resets body defaults). */
  setup(): this {
    this.setCollideWorldBounds(true);
    this.body.setAllowGravity(!this.flying);
    return this;
  }

  abstract tick(time: number): void;

  /** True when a hit coming from (x, y) is stopped by this enemy's guard. */
  blocks(_x: number, _y: number): boolean {
    return false;
  }

  knockback(dir: number, force: number): void {
    this.setVelocity(dir * force, this.flying ? 0 : -force * 0.8);
    this.stunUntil = this.scene.time.now + 250;
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
        this.setVelocity(dir * Phaser.Math.Between(40, 70), -Phaser.Math.Between(150, 220));
        this.nextAct = time + Phaser.Math.Between(700, 1300);
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
      this.scene.physics.moveToObject(this, this.target, 150);
      this.swoopUntil = time + 700;
      return;
    }
    const side = this.x < this.target.x ? -30 : 30;
    const goalY = this.target.y - 45 + this.jitter / 2 + Math.sin(time / 300) * 8;
    this.scene.physics.moveTo(this, this.target.x + side + this.jitter, goalY, 55);
    if (time > this.nextAct) {
      this.startWindup(time, 300);
      this.nextAct = time + Phaser.Math.Between(1800, 2800);
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
      this.setVelocityX(this.dir * 170);
      if (this.body.blocked.left || this.body.blocked.right) {
        this.chargeUntil = 0;
        this.stunUntil = time + 600;
        this.dir *= -1;
      }
      return;
    }
    const dx = this.target.x - this.x;
    if (Math.abs(this.target.y - this.y) < 14 && Math.abs(dx) < 130 && time > this.nextAct) {
      this.dir = Math.sign(dx) || 1;
      this.startWindup(time, 400);
      this.nextAct = time + 2200;
      return;
    }
    if (this.body.blocked.left) this.dir = 1;
    if (this.body.blocked.right) this.dir = -1;
    this.setVelocityX(this.dir * 30);
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
      this.arena.fire(this.x, this.y - 2, Math.cos(a) * 150, Math.sin(a) * 150, 'arrow', this.damage);
      return;
    }
    const dist = Math.abs(dx);
    this.setVelocityX(dist < 60 ? -Math.sign(dx) * 35 : dist > 140 ? Math.sign(dx) * 35 : 0);
    if (time > this.nextAct && dist < 220) {
      this.startWindup(time, 350);
      this.nextAct = time + Phaser.Math.Between(1800, 2600);
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
      this.arena.fire(this.x, this.y, Math.cos(a) * 90, Math.sin(a) * 90, 'orb', this.damage);
      return;
    }
    const side = this.x < this.target.x ? -70 : 70;
    this.scene.physics.moveTo(this, this.target.x + side + this.jitter, 45 + this.jitter + Math.sin(time / 500) * 10, 35);
    if (time > this.nextAct) {
      this.startWindup(time, 400);
      this.nextAct = time + Phaser.Math.Between(2400, 3200);
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
    this.scene.physics.moveToObject(this, this.target, this.untargetable ? 55 : 35);
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
    this.setVelocityX(dist < 70 ? -Math.sign(dx) * 30 : dist > 150 ? Math.sign(dx) * 30 : 0);
    if (time > this.nextAct && dist < 200) {
      this.startWindup(time, 400);
      this.nextAct = time + Phaser.Math.Between(2200, 3000);
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
      this.setVelocityX(this.facing * 170);
      this.bashUntil = time + 300;
      return;
    }
    this.setVelocityX(this.facing * 25);
    if (time > this.nextAct && Math.abs(this.target.x - this.x) < 60 && Math.abs(this.target.y - this.y) < 16) {
      this.startWindup(time, 350);
      this.nextAct = time + 2500;
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
} satisfies Record<EnemyKind, unknown>;

export function createEnemy(scene: Phaser.Scene, arena: Arena, kind: EnemyKind, x: number, y: number, hp: number, dmg: number): Enemy {
  return new CLASSES[kind](scene, arena, x, y, hp, dmg);
}
