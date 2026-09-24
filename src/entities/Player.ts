import Phaser from 'phaser';
import type { Derived } from '../logic/stats.ts';
import { moveHitbox, nextCombo, type Move, type Weapon } from '../logic/loot.ts';
import { COLOR } from '../gfx/sprites.ts';
import { flash, floatText } from '../gfx/ui.ts';
import type { PlayerWorld } from './arena.ts';
import type { ClassId } from '../logic/classes.ts';
import { SKILLS } from './skills.ts';

const JUMP_VELOCITY = -250;
const DASH_SPEED = 280;
const DASH_MS = 150;
const COYOTE_MS = 80;
const JUMP_BUFFER_MS = 100;
const ARROW_SPEED = 260;

type KeyName = 'left' | 'right' | 'a' | 'd' | 'up' | 'w' | 'space' | 'down' | 's' | 'attack' | 'dash' | 'skill' | 'ult';
type Keys = Record<KeyName, Phaser.Input.Keyboard.Key>;

export type HurtResult = 'ignored' | 'hit' | 'dead';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  stats: Derived;
  weapon: Weapon;
  hp: number;
  /** Ultimate meter, 0..100. */
  ult: number;
  facing = 1;
  dropUntil = 0;
  /** Current combo step (index into weapon.combo). */
  move: Move;
  /** Enemies already hit by the current swing, so one swing hits each target once. */
  readonly hitThisSwing = new Set<object>();
  private readonly world: PlayerWorld;
  /** Texture suffix: hero frames are recolored per class. */
  private readonly skin: ClassId;
  private readonly keys: Keys;
  private readonly held: Phaser.GameObjects.Image;
  private readonly slash: Phaser.GameObjects.Image;
  private comboIndex = -1;
  private coyoteUntil = 0;
  private jumpBufferUntil = 0;
  private airJumps = 0;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private swingReadyAt = 0;
  private swingUntil = 0;
  private invulnUntil = 0;
  /** Input ignored until then (lunges, skills). */
  private lockUntil = 0;
  private spinUntil = 0;
  private skillReadyAt = 0;
  private landArmAt = 0;
  private landFn?: () => void;
  /** A jump is rising and may still be cut short by releasing the key. */
  private jumpCut = false;

  constructor(
    scene: Phaser.Scene,
    world: PlayerWorld,
    x: number,
    y: number,
    stats: Derived,
    weapon: Weapon,
    hp: number,
    ult: number,
    skin: ClassId,
  ) {
    super(scene, x, y, `hero_idle_${skin}`);
    this.skin = skin;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.world = world;
    this.stats = stats;
    this.weapon = weapon;
    this.move = weapon.combo[0];
    this.hp = hp;
    this.ult = ult;
    this.setDepth(10).setCollideWorldBounds(true);
    this.body.setSize(6, 13).setOffset(2, 1);
    this.held = scene.add.image(x, y, `w_${weapon.id}`).setDepth(11);
    this.slash = scene.add.image(x, y, 'slash').setDepth(12).setVisible(false);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = scene.input.keyboard!.addKeys({
      left: K.LEFT,
      right: K.RIGHT,
      a: K.A,
      d: K.D,
      up: K.UP,
      w: K.W,
      space: K.SPACE,
      down: K.DOWN,
      s: K.S,
      attack: K.J,
      dash: K.K,
      skill: K.L,
      ult: K.I,
    }) as Keys;
    this.equip(stats, weapon);
  }

  equip(stats: Derived, weapon: Weapon): void {
    this.stats = stats;
    this.weapon = weapon;
    this.move = weapon.combo[0];
    this.comboIndex = -1;
    this.hp = Math.min(this.hp, stats.maxHp);
    this.held.setTexture(`w_${weapon.id}`).setOrigin(weapon.id === 'busur' ? 0.2 : 0.15, 0.5);
  }

  /** Melee hitbox is live. */
  get swinging(): boolean {
    return this.move.anim !== 'shoot' && this.scene.time.now < this.swingUntil;
  }

  get dashReady(): number {
    return this.readiness(this.dashReadyAt, this.stats.dashCooldown);
  }

  get skillReady(): number {
    return this.readiness(this.skillReadyAt, this.weapon.skill.cd * this.stats.skillCdMult);
  }

  private readiness(readyAt: number, cdSeconds: number): number {
    return Phaser.Math.Clamp(1 - (readyAt - this.scene.time.now) / (cdSeconds * 1000), 0, 1);
  }

  swingHitbox(): Phaser.Geom.Rectangle {
    const r = moveHitbox(this.move, this.x, this.y, this.facing);
    return new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h);
  }

  /** Pembunuh synergy: a crit makes dash ready again. */
  resetDash(): void {
    this.dashReadyAt = 0;
  }

  /** Pogo off an enemy after an air move with `bounce` connects. */
  pogo(): void {
    if (!this.move.bounce) return;
    this.setVelocityY(-this.move.bounce);
    this.swingUntil = 0;
    this.lock(0);
  }

  // --- used by skills ---

  invuln(ms: number): void {
    this.invulnUntil = Math.max(this.invulnUntil, this.scene.time.now + ms);
  }

  lock(ms: number): void {
    this.lockUntil = this.scene.time.now + ms;
  }

  spin(ms: number): void {
    this.spinUntil = this.scene.time.now + ms;
  }

  /** Run `fn` the next time the player touches ground (after leaving it). */
  onLand(fn: () => void): void {
    this.landFn = fn;
    this.landArmAt = this.scene.time.now + 120;
  }

  addUlt(n: number): void {
    this.ult = Math.min(100, this.ult + n);
  }

  ghost(tint: number): void {
    const g = this.scene.add.image(this.x, this.y, this.texture.key).setFlipX(this.flipX).setTint(tint).setAlpha(0.5).setDepth(9);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  update(time: number): void {
    const k = this.keys;
    const b = this.body;
    const grounded = b.blocked.down || b.touching.down;
    if (grounded) {
      this.coyoteUntil = time + COYOTE_MS;
      this.airJumps = this.stats.extraJumps;
      if (this.landFn && time >= this.landArmAt) {
        const fn = this.landFn;
        this.landFn = undefined;
        fn();
      }
    }

    const locked = time < this.lockUntil;
    const dashing = time < this.dashUntil;
    if (!dashing) b.setAllowGravity(true);
    if (!dashing && !locked) {
      const dir = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      if (dir) this.facing = dir;
      this.setVelocityX(dir * this.stats.speed);
    }

    if (!locked) this.handleJump(time, k);
    // Releasing jump early cuts the arc short (only real jumps, not pogo/hover pushes).
    if (b.velocity.y >= 0) this.jumpCut = false;
    if (this.jumpCut && !(k.space.isDown || k.w.isDown || k.up.isDown) && b.velocity.y < -80) {
      this.setVelocityY(b.velocity.y * 0.5);
      this.jumpCut = false;
    }

    if (!locked && Phaser.Input.Keyboard.JustDown(k.dash) && time >= this.dashReadyAt) {
      this.dashUntil = time + DASH_MS;
      this.dashReadyAt = time + this.stats.dashCooldown * 1000;
      this.invuln(DASH_MS);
      b.setAllowGravity(false);
      this.setVelocity(this.facing * DASH_SPEED, 0);
    }
    if (dashing) this.ghost(0x29adff);

    if (!locked && Phaser.Input.Keyboard.JustDown(k.attack) && time >= this.swingReadyAt) this.attack(time);
    if (!locked && Phaser.Input.Keyboard.JustDown(k.skill) && time >= this.skillReadyAt) this.useSkill(time, 'skill');
    if (!locked && Phaser.Input.Keyboard.JustDown(k.ult) && this.ult >= 100) this.useSkill(time, 'ult');

    const running = grounded && b.velocity.x !== 0;
    const frame = !grounded ? 'jump' : running ? (Math.floor(time / 120) % 2 ? 'run1' : 'run0') : 'idle';
    this.setTexture(`hero_${frame}_${this.skin}`);
    this.setFlipX(this.facing < 0);
    this.setAlpha(time < this.invulnUntil && !dashing && Math.floor(time / 60) % 2 ? 0.3 : 1);
    this.poseWeapon(time);
  }

  private handleJump(time: number, k: Keys): void {
    const pressed = [k.space, k.w, k.up].some((key) => Phaser.Input.Keyboard.JustDown(key));
    if (pressed && (k.down.isDown || k.s.isDown)) {
      this.dropUntil = time + 250;
      return;
    }
    if (pressed) this.jumpBufferUntil = time + JUMP_BUFFER_MS;
    if (time < this.jumpBufferUntil && time < this.coyoteUntil) {
      this.jump();
    } else if (pressed && time >= this.coyoteUntil && this.airJumps > 0) {
      this.airJumps--;
      this.jump();
      this.ghost(0xfff1e8);
    }
  }

  private attack(time: number): void {
    const grounded = this.body.blocked.down || this.body.touching.down;
    let m: Move;
    if (grounded) {
      const combo = this.weapon.combo;
      this.comboIndex = nextCombo(this.comboIndex, time - this.swingReadyAt, combo.length);
      m = combo[this.comboIndex];
    } else {
      // Mid-air: the weapon's aerial move; the ground combo restarts after it.
      m = this.weapon.air;
      this.comboIndex = -1;
    }
    this.move = m;
    this.swingUntil = time + m.ms;
    this.swingReadyAt = time + this.stats.swingCooldown * m.cd * 1000;
    this.hitThisSwing.clear();
    if (m.lunge) {
      this.setVelocityX(this.facing * m.lunge);
      this.lock(m.ms);
    }
    if (m.hover) this.setVelocityY(Math.min(this.body.velocity.y, -m.hover));
    if (m.dive) {
      this.setVelocity(this.facing * m.dive.vx, m.dive.vy);
      this.lock(m.ms);
    }
    if (m.slam) {
      const radius = m.slam;
      this.onLand(() => {
        this.world.area(this.x, this.y, radius, m.dmg * 1.2, m.knockback, 'basic');
        this.scene.cameras.main.shake(150, 0.015);
        this.swingUntil = 0;
        this.lock(0);
      });
    }
    // Extra arrows (Magic Archer synergy) fan out alongside the move's own.
    const extra = m.arrows?.length ? Array.from({ length: this.stats.extraArrows }, (_, i) => (i % 2 ? -1 : 1) * 0.2 * (1 + (i >> 1))) : [];
    for (const a of [...(m.arrows ?? []), ...extra]) {
      this.world.shot({
        x: this.x + this.facing * 6,
        y: this.y + 1,
        vx: Math.cos(a) * ARROW_SPEED * this.facing,
        vy: Math.sin(a) * ARROW_SPEED,
        texture: 'arrow',
        mult: m.dmg,
        source: 'basic',
        pierce: this.stats.pierceArrows > 0,
      });
    }
    // Ksatria synergy: the last hit of the ground combo throws a sword wave.
    if (grounded && this.stats.finisherWave && this.comboIndex === this.weapon.combo.length - 1) {
      this.world.shot({
        x: this.x + this.facing * 10,
        y: this.y,
        vx: this.facing * 200,
        vy: 0,
        texture: 'slash',
        tint: 0xfff1e8,
        mult: 0.8,
        source: 'skill',
        pierce: true,
      });
    }
  }

  private useSkill(time: number, kind: 'skill' | 'ult'): void {
    const fired = SKILLS[this.weapon.id][kind]({ p: this, world: this.world, scene: this.scene, power: this.stats.skillPower });
    if (fired === false) {
      floatText(this.scene, this.x, this.y - 16, 'TIDAK ADA TARGET', COLOR.gray);
      return;
    }
    const info = this.weapon[kind];
    if (kind === 'skill') this.skillReadyAt = time + this.weapon.skill.cd * this.stats.skillCdMult * 1000;
    else {
      this.ult = 0;
      this.scene.cameras.main.flash(120, 255, 236, 39);
    }
    floatText(this.scene, this.x, this.y - 18, `${info.name}!`, kind === 'ult' ? COLOR.gold : COLOR.blue);
  }

  hurt(damage: number, fromX: number): HurtResult {
    const time = this.scene.time.now;
    if (time < this.invulnUntil || this.hp <= 0) return 'ignored';
    this.hp = Math.max(0, this.hp - Math.max(1, Math.round(damage * this.stats.damageTaken)));
    this.invulnUntil = time + this.stats.iframes;
    this.setVelocity((this.x < fromX ? -1 : 1) * 140, -150);
    flash(this, 0xff004d);
    this.scene.cameras.main.shake(100, 0.01);
    return this.hp <= 0 ? 'dead' : 'hit';
  }

  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  private jump(): void {
    this.setVelocityY(JUMP_VELOCITY);
    this.jumpCut = true;
    this.jumpBufferUntil = 0;
    this.coyoteUntil = 0;
  }

  private poseWeapon(time: number): void {
    const m = this.move;
    const f = this.facing;
    const active = time < this.swingUntil;
    const p = active ? 1 - (this.swingUntil - time) / m.ms : 1;
    let x = this.x + f * 3;
    let angle = this.weapon.id === 'busur' ? 0 : this.weapon.id === 'tombak' ? 20 : 45;
    if (active) {
      if (m.anim === 'down') angle = -100 + 150 * p;
      if (m.anim === 'up') angle = 60 - 160 * p;
      if (m.anim === 'overhead') angle = -150 + 220 * p;
      if (m.anim === 'thrust') {
        angle = 0;
        x += f * Math.sin(p * Math.PI) * 10;
      }
      if (m.anim === 'shoot') x += f * 2 * (1 - p);
      if (m.anim === 'plunge') {
        angle = 90;
        x = this.x;
      }
    }
    const spinning = time < this.spinUntil || (active && m.anim === 'spin');
    if (spinning) angle = (time * 1.6) % 360;
    // Right-facing angles; mirrored by scaleX for the left side.
    this.held
      .setPosition(x, this.y + 2)
      .setScale(f, 1)
      .setAngle(angle * f)
      .setAlpha(this.alpha);

    if (spinning) {
      this.slash
        .setVisible(true)
        .setPosition(this.x, this.y)
        .setScale(active && m.anim === 'spin' ? m.reach.w / 16 : 2)
        .setAngle((time * 1.6) % 360)
        .setAlpha(0.7);
      return;
    }
    const showSlash = active && (m.anim === 'down' || m.anim === 'up' || m.anim === 'overhead');
    this.slash
      .setVisible(showSlash)
      .setAngle(0)
      .setPosition(this.x + f * (2 + m.reach.w / 2), this.y - 1)
      // Upswings draw the arc flipped vertically.
      .setScale((f * m.reach.w) / 14, ((m.anim === 'up' ? -1 : 1) * m.reach.h) / 16)
      .setAlpha(1 - p * 0.6);
  }

  destroy(fromScene?: boolean): void {
    this.held?.destroy();
    this.slash?.destroy();
    super.destroy(fromScene);
  }
}
