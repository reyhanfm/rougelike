import Phaser from 'phaser';
import type { Derived } from '../logic/stats.ts';
import { moveHitbox, nextCombo, type Move, type Weapon } from '../logic/loot.ts';
import { COLOR } from '../gfx/sprites.ts';
import { cutMark, flash, floatText, W } from '../gfx/ui.ts';
import type { PlayerWorld } from './arena.ts';
import type { ClassId } from '../logic/classes.ts';
import { SKILLS, TREASURES } from './skills.ts';
import { CLASSES, FURY } from '../logic/classes.ts';
import { DASHES } from './dashes.ts';
import { PASSIVES } from './passives.ts';
import { STYLES, airTilt, emitTrail, pirouette } from './styles.ts';
import { rumble } from '../gamepad.ts';
import { sfx } from '../audio.ts';
import { DEBUFFS, DOT_SHARE, DOT_TICK_MS, SLOW_MULT, type Debuff } from '../logic/stages.ts';

const JUMP_VELOCITY = -250;
const COYOTE_MS = 80;
/** Weapons the Gate of Babylon fires. */
const JUMP_BUFFER_MS = 100;

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
  /** Active debuffs: end time and the damage of the hit that caused it (for burn/shock ticks). */
  private readonly debuffs = new Map<Debuff, { until: number; power: number }>();
  private nextDot = 0;
  /** Bushido window: a basic hit before this time is a guaranteed crit. */
  private dashCritUntil = 0;
  /** Air-combo lifts used since the last landing (at most one per move of the air combo). */
  private airLifts = 0;
  /** Current step of the mid-air combo (index into weapon.air). */
  private airIndex = -1;
  /** Stats without the awakening boost. */
  private baseStats!: Derived;
  /** Dark Avenger mode is on (ult meter draining). */
  awakened = false;
  /** AMARAH stacks (Ashura). */
  fury = 0;
  /** Dragon form (Antares ult) lasts until this time. */
  private formUntil = 0;
  private furyUntil = 0;
  private awakenAt = 0;
  private nextAura = 0;
  private barrierReadyAt = 0;
  /** Enemies already hit by the current dash. */
  private readonly dashHits = new Set<object>();
  private tinted = false;
  /** Returning projectile still in flight; no new attack until it is caught. */
  private thrown?: Phaser.GameObjects.GameObject;
  private readonly world: PlayerWorld;
  /** Texture suffix: hero frames are recolored per class. */
  private readonly skin: ClassId;
  private readonly keys: Keys;
  private readonly held: Phaser.GameObjects.Image;
  /** Off-hand blade for twin-sword weapons. */
  private readonly twin: Phaser.GameObjects.Image;
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
  private fusionReadyAt = 0;
  private landArmAt = 0;
  private landFn?: () => void;
  /** A jump is rising and may still be cut short by releasing the key. */
  private jumpCut = false;
  /** Last jump (for the class's airborne flip/roll), next running footstep particle, and when the hero left the ground. */
  private jumpAt = 0;
  private nextStep = 0;
  private airSince = 0;
  /** The current 'cross' move already turned into its return cut. */
  private crossed = false;
  /** Strikes of the current flurry (Move.hits) already started. */
  private flurry = 0;

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
    this.twin = scene.add.image(x, y, 'w_bakuya').setDepth(9).setOrigin(0.15, 0.5).setVisible(false);
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
    // Always-on body parts of some classes (Nephalem's wings and half halo).
    STYLES[skin].attach?.(scene, this);
  }

  equip(stats: Derived, weapon: Weapon): void {
    this.baseStats = stats;
    this.stats = this.awakened ? this.boosted(stats) : stats;
    this.weapon = weapon;
    this.move = weapon.combo[0];
    this.comboIndex = -1;
    this.hp = Math.min(this.hp, stats.maxHp);
    this.slash.setTexture(weapon.arc ?? 'slash').setTint(weapon.arcTint ?? 0xffffff);
    this.held.setTexture(`w_${weapon.id}`).setOrigin(weapon.id === 'busurArkana' ? 0.2 : weapon.fist ? 0.5 : 0.15, 0.5);
    if (weapon.twin) this.twin.setTexture(weapon.twin);
  }

  /** Melee hitbox is live. */
  get swinging(): boolean {
    return this.move.anim !== 'shoot' && this.scene.time.now < this.swingUntil;
  }

  get dashReady(): number {
    return this.readiness(this.dashReadyAt, this.stats.dashCooldown * (DASHES[this.skin].cd ?? 1));
  }

  get skillReady(): number {
    return this.readiness(this.skillReadyAt, this.weapon.skill.cd * this.stats.skillCdMult);
  }

  get fusionReady(): number {
    const f = this.weapon.fusion;
    return f ? this.readiness(this.fusionReadyAt, f.cd * this.stats.skillCdMult) : 0;
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

  // --- used by skills and passives ---

  /** Step of the ground combo the current move is (0-based); -1 for an air move. */
  get comboStep(): number {
    return this.comboIndex;
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  get dashing(): boolean {
    return this.scene.time.now < this.dashUntil;
  }

  get invulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil || this.hp <= 0;
  }

  /** A jump key is held (Nephalem glides on it). */
  get jumpHeld(): boolean {
    const k = this.keys;
    return k.space.isDown || k.w.isDown || k.up.isDown;
  }

  /** A hit turned away by a passive: a short grace, a sound and a label. */
  parry(label: string, color: string): void {
    this.avoid(this.scene.time.now, label, color);
  }

  private get passiveCtx() {
    return { p: this, world: this.world, scene: this.scene };
  }

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
    // While awakened the meter only drains.
    if (this.awakened) return;
    this.ult = Math.min(100, this.ult + n);
  }

  ghost(tint: number): void {
    const g = this.scene.add
      .image(this.x, this.y, this.texture.key)
      .setFlipX(this.flipX)
      .setAngle(this.angle)
      .setTint(tint)
      .setAlpha(0.5)
      .setDepth(9);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  update(time: number): void {
    const k = this.keys;
    const b = this.body;
    const grounded = b.blocked.down || b.touching.down;
    const style = STYLES[this.skin];
    // Landing after real airtime: a burst of the class's trail (and a thud for heavy classes).
    if (grounded && this.airSince && time - this.airSince > 250) {
      emitTrail(this.scene, this.x, this.y + 6, -this.facing, style.trail, 5);
      if (style.heavy) this.scene.cameras.main.shake(70, 0.004);
    }
    this.airSince = grounded ? 0 : this.airSince || time;
    if (grounded) {
      this.coyoteUntil = time + COYOTE_MS;
      this.airJumps = this.stats.extraJumps;
      this.airLifts = 0;
      this.airIndex = -1;
      if (this.landFn && time >= this.landArmAt) {
        const fn = this.landFn;
        this.landFn = undefined;
        fn();
      }
    }

    this.updateAwaken(time);
    if (this.fury && time > this.furyUntil) this.fury = 0;
    const locked = time < this.lockUntil;
    const dashing = time < this.dashUntil;
    const dragon = this.dragon;
    if (!dashing) b.setAllowGravity(!dragon);
    if (!dashing && !locked) {
      const dir = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      if (dir) this.facing = dir;
      this.setVelocityX(dir * this.stats.speed * (this.has('slow') ? SLOW_MULT : 1));
      // Dragon form flies: up/down steer freely, kept below the HUD.
      if (dragon) {
        const up = k.up.isDown || k.w.isDown || k.space.isDown ? 1 : 0;
        const down = k.down.isDown || k.s.isDown ? 1 : 0;
        this.setVelocityY((down - up) * this.stats.speed * 0.8);
        if (this.y < 24 && b.velocity.y < 0) this.setVelocityY(0);
      }
    }
    if (this.has('freeze')) this.setVelocityX(0);

    if (!locked && !dragon) this.handleJump(time, k);
    // Releasing jump early cuts the arc short (only real jumps, not pogo/hover pushes).
    if (b.velocity.y >= 0) this.jumpCut = false;
    if (this.jumpCut && !(k.space.isDown || k.w.isDown || k.up.isDown) && b.velocity.y < -80) {
      this.setVelocityY(b.velocity.y * 0.5);
      this.jumpCut = false;
    }

    if (!locked && Phaser.Input.Keyboard.JustDown(k.dash) && time >= this.dashReadyAt) this.dash(time);
    if (dashing) {
      this.ghost(DASHES[this.skin].tint);
      if (Math.floor(time / 32) % 2) emitTrail(this.scene, this.x, this.y + 2, -this.facing, style.trail);
      this.dashHit();
    }
    if (time < this.swingUntil && this.move.trail && Math.floor(time / 32) % 2) this.ghost(this.move.trail);
    // Tsubame Gaeshi: the return cut halfway through is a second hit.
    if (this.move.anim === 'cross' && !this.crossed && time >= this.swingUntil - this.move.ms / 2) {
      this.crossed = true;
      this.hitThisSwing.clear();
    }
    // Flurries: every 1/hits of the move the hitbox may strike everyone again.
    const hits = this.move.hits ?? 1;
    if (hits > 1 && time < this.swingUntil) {
      const k = Math.floor(((time - (this.swingUntil - this.move.ms)) / this.move.ms) * hits);
      if (k > this.flurry) {
        this.flurry = k;
        this.hitThisSwing.clear();
      }
    }

    const attackPressed = Phaser.Input.Keyboard.JustDown(k.attack);
    const skillPressed = Phaser.Input.Keyboard.JustDown(k.skill);
    const silenced = this.has('silence');
    // Fusion (Gojo's Purple): attack and skill together, i.e. one pressed while the other is held.
    const fuse =
      !!this.weapon.fusion &&
      !locked &&
      !silenced &&
      time >= this.fusionReadyAt &&
      ((attackPressed && k.skill.isDown) || (skillPressed && k.attack.isDown));
    if (fuse) this.useSkill(time, 'fusion');
    if (
      !fuse &&
      !locked &&
      !dashing &&
      (attackPressed || ((this.weapon.automatic || dragon) && k.attack.isDown)) &&
      time >= this.swingReadyAt &&
      !this.thrown?.active
    )
      this.attack(time);
    if (!fuse && !locked && !silenced && skillPressed && time >= this.skillReadyAt) this.useSkill(time, 'skill');
    if (!locked && !silenced && !this.awakening && Phaser.Input.Keyboard.JustDown(k.ult) && this.ult >= 100) this.useSkill(time, 'ult');

    const running = grounded && b.velocity.x !== 0;
    const frame = !grounded ? 'jump' : running ? (Math.floor(time / style.stride) % 2 ? 'run1' : 'run0') : 'idle';
    this.setTexture(dragon ? 'dragon' : `hero_${frame}_${this.skin}`);
    // Keep the hitbox centered on the (wider) dragon sprite.
    this.body.setOffset(dragon ? 8 : 2, dragon ? 0 : 1);
    const sinceJump = time - this.jumpAt;
    this.setFlipX(this.facing < 0 !== (!grounded && !dragon && pirouette(style.jump, sinceJump)));
    // Class body language: lean into the run, flip/roll/dive/float in the air.
    const tilt = dragon || dashing ? 0 : !grounded ? airTilt(style.jump, sinceJump, b.velocity.y, time) : running ? style.lean : 0;
    this.setAngle(tilt * this.facing);
    if (running && !dragon && time >= this.nextStep) {
      this.nextStep = time + style.stride;
      emitTrail(this.scene, this.x - this.facing * 3, this.y + 6, -this.facing, style.trail);
    }
    this.setAlpha(time < this.invulnUntil && !dashing && Math.floor(time / 60) % 2 ? 0.3 : 1);
    this.poseWeapon(time);
    this.tintDebuffs(time);
  }

  /** The class dash: its own movement, then its own start effect. */
  private dash(time: number): void {
    const d = DASHES[this.skin];
    this.dashUntil = time + d.ms;
    this.dashCritUntil = time + d.ms + 500;
    this.dashReadyAt = time + this.stats.dashCooldown * (d.cd ?? 1) * 1000;
    this.invuln(d.ms);
    this.dashHits.clear();
    this.body.setAllowGravity(!!d.gravity);
    this.setVelocity(this.facing * d.speed, d.vy ?? 0);
    sfx('dash');
    d.start?.({ p: this, world: this.world, scene: this.scene, power: this.stats.dashPower });
    PASSIVES[this.skin].onDash?.(this.passiveCtx);
  }

  /** Dashes with a hit strike every enemy they touch, once per dash. */
  private dashHit(): void {
    const h = DASHES[this.skin].hit;
    if (!h) return;
    for (const t of this.world.targets(this.x, this.y)) {
      if (this.dashHits.has(t) || Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) > h.radius + t.displayWidth / 2) continue;
      this.dashHits.add(t);
      this.world.strike(t, h.mult * this.stats.dashPower, 'skill', !!h.crit, h.status);
      if (h.cut) cutMark(this.scene, t.x, t.y, h.cut);
      if (h.heal) this.heal(h.heal);
    }
  }

  private avoid(time: number, label: string, color: string): 'ignored' {
    this.invulnUntil = time + 400;
    sfx('block');
    floatText(this.scene, this.x, this.y - 18, label, color);
    return 'ignored';
  }

  /** A golden ripple where a treasure comes through. */
  gatePortal(x: number, y: number, angle: number): void {
    const s = this.scene;
    // The gate's face is turned along `angle` (where the treasure flies): a thin golden oval, bright center, ripples, sparks.
    const outer = s.add.ellipse(x, y, 5, 16, 0xffec27, 0.35).setStrokeStyle(1, 0xffa300).setRotation(angle).setDepth(10);
    const inner = s.add.ellipse(x, y, 3, 10, 0xfff1e8, 0.8).setRotation(angle).setDepth(10);
    const gate = [outer, inner];
    gate.forEach((o) => o.setScale(0.2));
    s.tweens.add({ targets: gate, scale: 1, duration: 90, ease: 'Back.Out' });
    s.tweens.add({ targets: gate, scaleY: 0, alpha: 0, delay: 260, duration: 180, onComplete: () => gate.forEach((o) => o.destroy()) });
    const ripple = s.add.ellipse(x, y, 4, 12).setStrokeStyle(1, 0xffec27).setRotation(angle).setDepth(10);
    s.tweens.add({ targets: ripple, scaleX: 2, scaleY: 1.8, alpha: 0, duration: 350, onComplete: () => ripple.destroy() });
    for (let i = 0; i < 3; i++) {
      const spark = s.add.rectangle(x + Phaser.Math.Between(-3, 3), y + Phaser.Math.Between(-7, 7), 1, 1, 0xfff1e8).setDepth(10);
      s.tweens.add({ targets: spark, y: spark.y - 6, alpha: 0, duration: 300, onComplete: () => spark.destroy() });
    }
  }

  /** One Gate of Babylon shot: a gate behind and above the player turns toward `foe` (or ahead) and fires a treasure straight out. */
  private openGate(i: number, spread: number, m: Move, foe?: Phaser.GameObjects.Sprite): void {
    const x = this.x - this.facing * Phaser.Math.Between(0, 26);
    const y = this.y - Phaser.Math.Between(4, 40);
    const dir = foe ? Phaser.Math.Angle.Between(x, y, foe.x, foe.y) + spread * 0.5 : this.facing > 0 ? spread : Math.PI - spread;
    this.gatePortal(x, y, dir);
    const speed = this.weapon.projectile!.speed;
    // The gate opens first; its treasure comes through a beat later, one gate after another.
    this.scene.time.delayedCall(60 + i * 35, () => {
      if (!this.active) return;
      this.world.shot({
        x,
        y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        texture: Phaser.Math.RND.pick(TREASURES),
        tint: 0xfff0a0,
        status: m.status,
        mult: m.dmg,
        source: 'basic',
        knockback: m.knockback,
      });
    });
  }

  /** Iai flash: once the lunge ends, a thin line of `color` hangs along the path from `fromX`, then snaps shut. */
  private streak(fromX: number, ms: number, color: number): void {
    this.scene.time.delayedCall(ms, () => {
      if (!this.active) return;
      const x = (fromX + this.x) / 2;
      const w = Math.abs(this.x - fromX) + 16;
      const line = [this.scene.add.rectangle(x, this.y, w, 3, color, 0.45), this.scene.add.rectangle(x, this.y, w, 1, 0xfff1e8)];
      line.forEach((l) => l.setDepth(13));
      this.scene.tweens.add({
        targets: line,
        scaleY: 0,
        alpha: 0,
        delay: 80,
        duration: 220,
        onComplete: () => line.forEach((l) => l.destroy()),
      });
    });
  }

  /** Consumes the Bushido window (first basic hit after a dash). */
  takeDashCrit(): boolean {
    if (this.scene.time.now >= this.dashCritUntil) return false;
    this.dashCritUntil = 0;
    return true;
  }

  has(d: Debuff): boolean {
    return this.scene.time.now < (this.debuffs.get(d)?.until ?? 0);
  }

  /** Names of active debuffs, for the HUD. */
  get debuffNames(): string {
    return [...this.debuffs.keys()]
      .filter((d) => this.has(d))
      .map((d) => DEBUFFS[d].name)
      .join(' ');
  }

  /** Apply (or refresh) a debuff from a hit that dealt `power` damage. */
  afflict(d: Debuff, power: number): void {
    if (d === 'burn' && this.stats.fireImmune) return;
    const now = this.scene.time.now;
    if (!this.has(d)) floatText(this.scene, this.x, this.y - 22, `${DEBUFFS[d].name}!`, DEBUFFS[d].color);
    this.debuffs.set(d, { until: now + DEBUFFS[d].ms, power: Math.max(1, Math.round(power * DOT_SHARE)) });
    // Never shortens a longer lock already running.
    if (d === 'freeze' || d === 'stun') this.lockUntil = Math.max(this.lockUntil, now + DEBUFFS[d].ms);
  }

  clearDebuffs(): void {
    this.debuffs.clear();
  }

  /** Burn and shock damage over time (ignores invulnerability). Returns the damage dealt this frame. */
  tickDebuffs(time: number): number {
    if (time < this.nextDot || this.hp <= 0) return 0;
    const dmg = (['burn', 'shock'] as const).reduce((sum, d) => sum + (this.has(d) ? this.debuffs.get(d)!.power : 0), 0);
    if (!dmg) return 0;
    this.nextDot = time + DOT_TICK_MS;
    this.hp = Math.max(0, this.hp - dmg);
    floatText(this.scene, this.x, this.y - 10, `${dmg}`, this.has('shock') ? DEBUFFS.shock.color : DEBUFFS.burn.color);
    // Shock jolts: a short lock on every tick.
    if (this.has('shock')) this.lockUntil = Math.max(this.lockUntil, time + 120);
    return dmg;
  }

  /** Add AMARAH stacks (only classes with furyMax) and refresh their timer. */
  gainFury(n = 1): void {
    if (!this.stats.furyMax) return;
    this.fury = Math.min(this.stats.furyMax, this.fury + n);
    this.furyUntil = this.scene.time.now + FURY.decayMs;
  }

  /** This class's awakening, if it has one instead of an ult. */
  private get awakening() {
    return CLASSES[this.skin].awaken;
  }

  private boosted(s: Derived): Derived {
    const b = { ...s };
    this.awakening?.apply(b);
    return b;
  }

  /** Full meter awakens the class; the meter then drains and the mode ends when it is empty. */
  private updateAwaken(time: number): void {
    const aw = this.awakening;
    if (!aw) return;
    if (!this.awakened && this.ult >= 100) {
      this.awakened = true;
      this.awakenAt = time;
      this.stats = this.boosted(this.baseStats);
      this.scene.cameras.main.flash(200, 126, 37, 83);
      floatText(this.scene, this.x, this.y - 22, `${aw.name}!`, '#ff77a8');
    }
    if (!this.awakened) return;
    this.ult = Math.max(0, 100 * (1 - (time - this.awakenAt) / (aw.ms * this.baseStats.awakenTime)));
    if (this.ult <= 0) {
      this.awakened = false;
      this.stats = this.baseStats;
      floatText(this.scene, this.x, this.y - 22, 'MODE BERAKHIR', COLOR.gray);
    } else if (time >= this.nextAura) {
      this.nextAura = time + 90;
      this.ghost(0x7e2553);
    }
  }

  private tintDebuffs(time: number): void {
    const blink = Math.floor(time / 100) % 2 === 0;
    const tint = this.has('freeze')
      ? 0x29adff
      : this.has('shock') && blink
        ? 0xffec27
        : this.has('burn') && blink
          ? 0xffa300
          : this.has('stun')
            ? 0xfff1e8
            : this.has('slow')
              ? 0x83769c
              : this.has('weak') || this.has('silence')
                ? 0xff77a8
                : this.awakened
                  ? 0xc080ff
                  : undefined;
    if (tint !== undefined) this.setTint(tint);
    // Only clear our own tint, so hurt flashes still show.
    else if (this.tinted) this.setTint(0xffffff);
    this.tinted = tint !== undefined;
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
      emitTrail(this.scene, this.x, this.y + 6, -this.facing, STYLES[this.skin].trail, 6);
    }
  }

  get dragon(): boolean {
    return this.scene.time.now < this.formUntil;
  }

  /** Turn into the dragon for `ms` (times stats.formTime). */
  transform(ms: number): void {
    this.formUntil = this.scene.time.now + ms * this.stats.formTime;
  }

  private attack(time: number): void {
    // Dragon form: the attack is a stream of fire (hold to keep breathing).
    if (this.dragon) {
      this.swingReadyAt = time + this.stats.swingCooldown * 800;
      sfx('shoot');
      for (const a of [-0.15, 0, 0.15]) {
        this.world.shot({
          x: this.x + this.facing * 10,
          y: this.y,
          vx: Math.cos(a) * 240 * this.facing,
          vy: Math.sin(a) * 240,
          texture: 'fireball',
          mult: 0.8,
          source: 'basic',
          status: { burn: 0.25 },
          knockback: 40,
        });
      }
      return;
    }
    const grounded = this.body.blocked.down || this.body.touching.down;
    // Down + attack in the air is the dive, for every class (even Gojo, whose attack key otherwise casts).
    const diving = !grounded && (this.keys.down.isDown || this.keys.s.isDown);
    // Cast weapons (Gojo): the attack key is a technique, not a swing.
    if (this.weapon.cast && !diving) {
      sfx('shoot');
      this.swingReadyAt = time + this.stats.swingCooldown * 1000 * (1 - FURY.step * this.fury);
      SKILLS[this.weapon.id].basic?.({ p: this, world: this.world, scene: this.scene, power: 1 });
      PASSIVES[this.skin].onAttack?.(this.passiveCtx, this.move);
      return;
    }
    let m: Move;
    if (grounded) {
      const combo = this.weapon.combo;
      this.comboIndex = nextCombo(this.comboIndex, time - this.swingReadyAt, combo.length);
      m = combo[this.comboIndex];
    } else if (diving) {
      m = this.weapon.dive;
      this.comboIndex = this.airIndex = -1;
    } else {
      // Mid-air: the weapon's own air combo; the ground combo restarts after it.
      const air = this.weapon.air;
      this.airIndex = nextCombo(this.airIndex, time - this.swingReadyAt, air.length);
      m = air[this.airIndex];
      this.comboIndex = -1;
    }
    // Awakened: every melee move reaches further.
    const k = this.awakened ? this.awakening!.reach : 1;
    this.move = k === 1 ? m : { ...m, reach: { w: m.reach.w * k, h: m.reach.h * k } };
    this.swingUntil = time + m.ms;
    // Finishers (the slowest move of the combo) and air slams get the heavy sound; ranged weapons a shot.
    sfx(this.weapon.projectile ? 'shoot' : m.cd >= 1.3 || m.slam || m.dive ? 'heavy' : 'swing');
    this.swingReadyAt = time + this.stats.swingCooldown * m.cd * 1000 * (1 - FURY.step * this.fury);
    this.hitThisSwing.clear();
    this.crossed = false;
    this.flurry = 0;
    if (m.lunge) {
      this.setVelocityX(this.facing * m.lunge);
      this.lock(m.ms);
      if (m.cut) this.streak(this.x, m.ms, m.cut);
    }
    // Each air-combo move may lift once per airtime (so a full air combo can chase a flyer), but spamming air
    // attacks must not keep the player flying.
    if (m.hover && this.airLifts < this.weapon.air.length) {
      this.setVelocityY(Math.min(this.body.velocity.y, -m.hover));
      this.airLifts++;
    }
    if (m.dive) {
      this.setVelocity(this.facing * m.dive.vx, m.dive.vy);
      this.lock(m.ms);
    }
    if (m.slam) {
      const radius = m.slam;
      this.onLand(() => {
        this.world.area(this.x, this.y, radius, m.dmg * 1.2, m.knockback, 'basic', m.status);
        this.scene.cameras.main.shake(150, 0.015);
        // Each class's dive lands its own way (rock walls, a pillar of lightning, hands from the underworld...).
        if (m === this.weapon.dive)
          SKILLS[this.weapon.id].onDiveLand?.(
            { p: this, world: this.world, scene: this.scene, power: this.stats.skillPower },
            this.x,
            this.y + 7,
          );
        this.swingUntil = 0;
        this.lock(0);
      });
    }
    // Extra arrows (Magic Archer synergy) fan out alongside the move's own.
    const extra =
      (this.weapon.id === 'busur' || this.weapon.id === 'busurArkana' || this.weapon.projectile?.gate) && m.angles?.length
        ? Array.from({ length: this.stats.extraArrows }, (_, i) => (i % 2 ? -1 : 1) * 0.2 * (1 + (i >> 1)))
        : [];
    const projectile = this.weapon.projectile;
    // Magic Archer: only the lead (middle) arrow of the move homes; the rest fly straight.
    const lead = Math.floor((m.angles?.length ?? 0) / 2);
    const gate = projectile?.gate;
    // Gate of Babylon: the volley's gates are spread over the nearest enemies (aimed gates, not homing treasures).
    const foes = gate ? this.world.targets(this.x, this.y) : [];
    for (const [i, a] of (projectile ? [...(m.angles ?? []), ...extra] : []).entries()) {
      if (gate) {
        this.openGate(i, a, m, foes[i % Math.max(1, foes.length)]);
        continue;
      }
      this.thrown = this.world.shot({
        x: this.x + this.facing * 6,
        y: this.y + 1,
        vx: Math.cos(a) * projectile!.speed * this.facing,
        vy: Math.sin(a) * projectile!.speed,
        // Twin blades: every other throw is the off-hand blade.
        texture: m.shot ?? (this.weapon.twin && i % 2 ? this.weapon.twin : projectile!.texture),
        status: m.status,
        mult: m.dmg,
        source: 'basic',
        pierce:
          !!projectile!.pierce ||
          !!m.pierce ||
          ((this.weapon.id === 'busur' || this.weapon.id === 'pedangTerbang') && this.stats.pierceArrows > 0),
        knockback: m.knockback,
        homing: projectile!.homing || (this.stats.homingArrows > 0 && i === lead),
        returning: projectile!.returning,
        spin: projectile!.spin,
      });
      // Short-range moves (shotgun pellets) die out after `range` px.
      if (m.range) {
        const shot = this.thrown;
        this.scene.time.delayedCall((m.range / projectile!.speed) * 1000, () => shot?.active && shot.destroy());
      }
      if (!projectile!.returning) this.thrown = undefined;
    }
    // The weapon's own move effects (Heracles' rock wave, the Avenger's dark crescent...).
    SKILLS[this.weapon.id].onSwing?.({ p: this, world: this.world, scene: this.scene, power: this.stats.skillPower }, m, this.comboIndex);
    // Ksatria synergy: the last hit of the ground combo throws a golden wave of light.
    if (grounded && this.stats.finisherWave && this.comboIndex === this.weapon.combo.length - 1) {
      this.world.shot({
        x: this.x + this.facing * 10,
        y: this.y,
        vx: this.facing * 200,
        vy: 0,
        texture: 'slash',
        tint: 0xffec27,
        mult: 1,
        source: 'skill',
        pierce: true,
      });
    }
    PASSIVES[this.skin].onAttack?.(this.passiveCtx, this.move);
  }

  private useSkill(time: number, kind: 'skill' | 'ult' | 'fusion'): void {
    const fired = SKILLS[this.weapon.id][kind]?.({ p: this, world: this.world, scene: this.scene, power: this.stats.skillPower });
    if (fired === false) {
      floatText(this.scene, this.x, this.y - 16, 'TIDAK ADA TARGET', COLOR.gray);
      return;
    }
    const info = this.weapon[kind]!;
    sfx(kind);
    if (kind === 'skill') this.skillReadyAt = time + this.weapon.skill.cd * this.stats.skillCdMult * 1000;
    else if (kind === 'fusion') this.fusionReadyAt = time + this.weapon.fusion!.cd * this.stats.skillCdMult * 1000;
    else {
      this.ult = 0;
      this.scene.cameras.main.flash(120, 255, 236, 39);
    }
    // Long names stay on screen near the edges (8px per character, centered).
    const half = (info.name.length + 1) * 4;
    const color = kind === 'ult' ? COLOR.gold : kind === 'fusion' ? '#c080ff' : COLOR.blue;
    floatText(this.scene, Phaser.Math.Clamp(this.x, half, W - half), this.y - 18, `${info.name}!`, color);
  }

  hurt(damage: number, fromX: number): HurtResult {
    const time = this.scene.time.now;
    if (time < this.invulnUntil || this.hp <= 0) return 'ignored';
    // Dodge and block both cancel the hit (and its debuff), with a short grace.
    if (Math.random() < this.stats.dodge) return this.avoid(time, 'HINDAR', COLOR.gray);
    if (this.stats.barrier && time >= this.barrierReadyAt) {
      this.barrierReadyAt = time + this.stats.barrier * 1000;
      return this.avoid(time, 'BLOK', COLOR.gold);
    }
    this.hp = Math.max(0, this.hp - Math.max(1, Math.round(damage * this.stats.damageTaken * (this.dragon ? 0.6 : 1))));
    this.invulnUntil = time + this.stats.iframes;
    this.setVelocity((this.x < fromX ? -1 : 1) * 140, -150);
    flash(this, 0xff004d);
    this.scene.cameras.main.shake(100, 0.01);
    rumble(this.hp <= 0 ? 400 : 120, this.hp <= 0 ? 1 : 0.5);
    sfx('hurt');
    return this.hp <= 0 ? 'dead' : 'hit';
  }

  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  private jump(): void {
    this.setVelocityY(JUMP_VELOCITY);
    sfx('jump');
    this.jumpAt = this.scene.time.now;
    this.jumpCut = true;
    this.jumpBufferUntil = 0;
    this.coyoteUntil = 0;
  }

  private poseWeapon(time: number): void {
    const m = this.move;
    const f = this.facing;
    const active = time < this.swingUntil;
    const p = active ? 1 - (this.swingUntil - time) / m.ms : 1;
    // At rest the class carries its own weapon its own way; other weapons get the plain grip.
    const hold =
      CLASSES[this.skin].weapon === this.weapon.id
        ? STYLES[this.skin].hold
        : { angle: this.weapon.projectile || this.weapon.fist ? 0 : this.weapon.id === 'tombak' ? 20 : 45 };
    let x = this.x + f * ((this.weapon.fist ? 5 : 3) + (active ? 0 : (hold.dx ?? 0)));
    let y = this.y + 2 + (active ? 0 : (hold.dy ?? 0));
    let angle = hold.angle;
    if (active) {
      // Fists: jab straight out and back, hook in a forward arc, uppercut rising from the hip.
      if (m.anim === 'jab') x += f * Math.sin(p * Math.PI) * (m.lunge ? 14 : 9);
      if (m.anim === 'hook') {
        const a = Math.PI * (p - 0.5);
        x += f * (Math.cos(a) * 9 - 2);
        y += Math.sin(a) * 5;
        angle = 35 * (p - 0.5);
      }
      if (m.anim === 'uppercut') {
        x += f * 4;
        y += 5 - 16 * p;
        angle = -60 * p;
      }
      if (m.anim === 'down') angle = -100 + 150 * p;
      if (m.anim === 'up') angle = 60 - 160 * p;
      if (m.anim === 'overhead') angle = -150 + 220 * p;
      if (m.anim === 'cross') angle = p < 0.5 ? -100 + 300 * p : 60 - 320 * (p - 0.5);
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
      .setPosition(x, y)
      .setScale(f * (this.awakened ? 1.3 : 1), this.awakened ? 1.3 : 1)
      .setAngle(angle * f)
      .setAlpha(this.alpha)
      // A thrown sword is out of the hand until it comes back.
      .setVisible(!this.thrown?.active && !this.dragon);
    // The off-hand blade mirrors the swing (a scissor motion; crossed at rest) from just behind the body.
    this.twin
      .setPosition(x - f * 4, y + 1)
      .setScale(f, 1)
      .setAngle(-angle * f)
      .setAlpha(this.alpha)
      .setVisible(!!this.weapon.twin && this.held.visible);

    if (spinning) {
      this.slash
        .setVisible(true)
        .setPosition(this.x, this.y)
        .setScale(active && m.anim === 'spin' ? m.reach.w / 16 : 2)
        .setAngle((time * 1.6) % 360)
        .setAlpha(0.7);
      return;
    }
    const showSlash = active && (m.anim === 'down' || m.anim === 'up' || m.anim === 'overhead' || m.anim === 'cross');
    // Upswings (and the second half of a cross) draw the arc flipped vertically; a cross's arc fades in each half.
    const rising = m.anim === 'up' || (m.anim === 'cross' && p >= 0.5);
    const fade = m.anim === 'cross' ? (p % 0.5) * 2 : p;
    this.slash
      .setVisible(showSlash)
      .setAngle(0)
      .setPosition(this.x + f * (2 + m.reach.w / 2), this.y - 1)
      .setScale((f * m.reach.w) / 14, ((rising ? -1 : 1) * m.reach.h) / 16)
      .setAlpha(1 - fade * 0.6);
  }

  destroy(fromScene?: boolean): void {
    this.held?.destroy();
    this.twin?.destroy();
    this.slash?.destroy();
    super.destroy(fromScene);
  }
}
