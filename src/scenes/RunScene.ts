import Phaser from 'phaser';
import type { Arena, HitSource, PlayerWorld, ShotSpec } from '../entities/arena.ts';
import { Boss } from '../entities/Boss.ts';
import { createEnemy, Enemy } from '../entities/Enemy.ts';
import { Player } from '../entities/Player.ts';
import { COLOR } from '../gfx/sprites.ts';
import { burst, flash, floatText, FLOOR_Y, H, text, TILE, W } from '../gfx/ui.ts';
import {
  activePairs,
  ITEMS,
  pairOf,
  RARITY_COLOR,
  rewardInfo,
  rewardRarity,
  rollRewards,
  coinReward,
  rerollCost,
  runStats,
  ULT_GAIN,
  WEAPONS,
  type ItemId,
  type Reward,
  type Status,
  type WeaponId,
} from '../logic/loot.ts';
import { loadSave, writeSave, type SaveData } from '../logic/save.ts';
import {
  BOSS_LAYOUT,
  ELITE,
  ELITE_AFFIXES,
  enemyPace,
  type EliteAffix,
  WEAK_MULT,
  type Debuff,
  ENEMIES,
  LAYOUTS,
  BOSS_EVERY,
  BOSSES,
  rollSpecials,
  rollEliteRound,
  eliteRoundConfig,
  SPECIAL_STATS,
  specialConfig,
  type SpecialBoss,
  pickEnemies,
  roundConfig,
  soulReward,
  type EnemyKind,
  type RoundConfig,
} from '../logic/stages.ts';
import { derive, type Derived } from '../logic/stats.ts';
import type { HubData } from './HubScene.ts';
import { CLASSES, FURY, hasSynergy, type ClassId } from '../logic/classes.ts';

/** Everything that carries from one round to the next within a run. */
export interface RunData {
  round: number;
  hp?: number;
  runSouls?: number;
  weapon?: WeaponId;
  items?: ItemId[];
  ult?: number;
  cls?: ClassId;
  /** Run currency; starts at 0 every run. */
  coins?: number;
  /** Consumed items (phoenix): gone from the inventory but never offered again. */
  spent?: ItemId[];
  /** Bonus round: special bosses instead of this round's enemies. */
  specials?: SpecialBoss[];
  /** Elite round: every enemy is an elite. */
  eliteRound?: boolean;
}

type Hittable = Enemy | Boss;

const MAX_SUMMONS = 6;
/** Homing arrows: max turn rate (rad/s) and lifetime (ms). */
const HOMING_TURN = 8;
/** Homing arrows turn slower, so a dodging enemy can still make them miss. */
const ARROW_TURN = 3.5;
const HOMING_LIFE = 2500;
/** Returning swords: max time out before turning back (ms), and return speed (px/s). */
const RETURN_MS = 700;
const RETURN_SPEED = 300;
const BURN_MS = 3000;
const BURN_TICK_MS = 500;
const ICE_TINT = 0x29adff;
/** Top speed (px/s) of a slowed enemy or boss; falling stays normal. */
const CHILL_SPEED = 30;
const NO_CAP = 10000;
const REWARD_Y = 56;
const REWARD_H = 24;
/** Index of the extra "take nothing" row after the three rewards. */
const SKIP_ROW = 3;

export class RunScene extends Phaser.Scene implements Arena, PlayerWorld {
  player!: Player;
  private save!: SaveData;
  private base!: Derived;
  private cfg!: RoundConfig;
  private weaponId: WeaponId = 'pedang';
  private cls: ClassId = 'ksatria';
  private items: ItemId[] = [];
  private spent: ItemId[] = [];
  /** God Hand revives left this round. */
  private godHandLeft = 0;
  private enemies!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private shots!: Phaser.Physics.Arcade.Group;
  /** Living bosses; a bonus round may bring two. */
  private bosses: Boss[] = [];
  private portal?: Phaser.Physics.Arcade.Image;
  private runSouls = 0;
  private coins = 0;
  /** Refreshes bought on the current reward panel. */
  private rerolls = 0;
  private cleared = false;
  private over = false;
  private paused = false;
  private rewards?: Reward[];
  private rewardSel = 0;
  private regenAcc = 0;
  private lifestealAcc = 0;
  private rewardUi?: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private soulText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private inventory?: Phaser.GameObjects.Container;
  private ultText!: Phaser.GameObjects.Text;
  private debuffText!: Phaser.GameObjects.Text;
  private bossHud: { boss: Boss; title: Phaser.GameObjects.Text }[] = [];
  /** A boss left without being beaten this round (Mahoraga's time ran out). */
  private bossLeft = false;
  /** This round's mini boss, if one spawned. */
  private elite?: Enemy;
  private eliteTitle?: Phaser.GameObjects.Text;

  constructor() {
    super('run');
  }

  private get stats(): Derived {
    return this.player.stats;
  }

  get touchMode(): 'play' | 'paused' | 'menu' {
    return this.over ? 'menu' : this.paused ? 'paused' : this.rewards ? 'menu' : 'play';
  }

  create(data: RunData): void {
    this.save = loadSave();
    this.base = derive(this.save.stats);
    this.cfg = data.specials?.length
      ? specialConfig(data.round, data.specials)
      : data.eliteRound
        ? eliteRoundConfig(data.round)
        : roundConfig(data.round);
    this.cls = data.cls ?? this.save.cls;
    this.weaponId = data.weapon ?? CLASSES[this.cls].weapon;
    this.items = [...(data.items ?? [])];
    this.spent = [...(data.spent ?? [])];
    this.runSouls = data.runSouls ?? 0;
    this.coins = data.coins ?? 0;
    this.cleared = this.over = this.paused = false;
    this.regenAcc = this.lifestealAcc = 0;
    this.bosses = [];
    this.bossLeft = false;
    this.portal = this.rewards = this.rewardUi = this.inventory = this.elite = this.eliteTitle = undefined;
    if (data.round > this.save.bestRound) {
      this.save.bestRound = data.round;
      writeSave(this.save);
    }

    this.add.image(0, 0, 'bg').setOrigin(0);
    // World floor = ground top: anything that tunnels through the thin floor body is still stopped here.
    this.physics.world.setBounds(0, -100, W, FLOOR_Y + 100);
    this.physics.world.setBoundsCollision(true, true, false, true);

    const floor = this.solid(0, FLOOR_Y, W, TILE, 'ground');
    this.add
      .tileSprite(0, FLOOR_Y + TILE, W, H - FLOOR_Y - TILE, 'dirt')
      .setOrigin(0)
      .setDepth(2);
    const layout = this.cfg.boss ? BOSS_LAYOUT : Phaser.Utils.Array.GetRandom([...LAYOUTS]);
    const platforms = layout.map((p) => {
      const body = this.solid(p.x * TILE, p.y * TILE, p.w * TILE, 4, 'plat').body as Phaser.Physics.Arcade.StaticBody;
      // One-way: land from above, pass through from below and the sides.
      body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
      return body.gameObject;
    });

    const stats = this.currentStats();
    this.godHandLeft = stats.godHand;
    this.player = new Player(this, this, 24, FLOOR_Y - 10, stats, WEAPONS[this.weaponId], data.hp ?? stats.maxHp, data.ult ?? 0, this.cls);
    this.enemies = this.physics.add.group();
    this.hazards = this.physics.add.group({ allowGravity: false });
    this.shots = this.physics.add.group({ allowGravity: false });

    this.physics.add.collider(this.player, floor);
    this.physics.add.collider(this.player, platforms, undefined, () => this.time.now >= this.player.dropUntil);
    // Phaser may pass (floor, enemy) here, so find the enemy in either slot.
    this.physics.add.collider(this.enemies, [floor, ...platforms], undefined, (a, b) => !(a instanceof Enemy ? a : (b as Enemy)).flying);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      const en = e as Enemy;
      const affix = en.getData('elite') as EliteAffix | undefined;
      const debuff = (affix && ELITE_AFFIXES[affix].debuff) ?? ENEMIES[en.kind].debuff;
      if (!en.untargetable && !this.frozen(en)) this.hurtPlayer(en.damage, en.x, en, debuff);
    });
    this.physics.add.overlap(this.player, this.hazards, (_p, h) => {
      const hz = h as Phaser.Physics.Arcade.Image;
      this.hurtPlayer(hz.getData('dmg') as number, hz.x, undefined, hz.getData('debuff') as Debuff | undefined);
      if (hz.texture.key !== 'wave') hz.destroy();
    });
    this.physics.add.overlap(this.shots, this.enemies, (a, b) => this.shotHit(a, b));

    if (this.cfg.boss) {
      const kinds: (SpecialBoss | undefined)[] = this.cfg.specials ?? [undefined];
      this.bosses = kinds.map((k, i) => new Boss(this, this, W - 40 - i * 60, FLOOR_Y - 40, this.cfg, k));
      for (const boss of this.bosses) {
        this.physics.add.collider(boss, floor);
        this.physics.add.overlap(
          this.player,
          boss,
          () => boss.active && !boss.untargetable && !this.frozen(boss) && this.hurtPlayer(boss.damage, boss.x, boss),
        );
        this.physics.add.overlap(this.shots, boss, (a, b) => this.shotHit(a, b));
      }
      const sp = this.cfg.specials;
      if (sp) {
        this.cameras.main.flash(600, 255, 255, 255);
        const title = sp.length === 3 ? 'BONUS TRIPEL!' : sp.length === 2 ? 'BONUS GANDA!' : `BONUS: ${BOSSES[sp[0]].name}`;
        const intro = text(this, W / 2, 44, title, COLOR.gold, 16).setOrigin(0.5);
        this.tweens.add({ targets: intro, alpha: 0, delay: 1500, duration: 500, onComplete: () => intro.destroy() });
      }
    } else {
      // Mini boss: sometimes the first enemy of the wave is an elite; an elite round is nothing but elites.
      const all = !!this.cfg.eliteRound;
      const elite = Math.random() < ELITE.chance;
      pickEnemies(this.cfg.round, this.cfg.enemyCount).forEach((kind, i) => {
        const flying = ENEMIES[kind].flying;
        const x = Phaser.Math.Between(flying ? 60 : 90, W - 16);
        this.spawnEnemy(kind, x, flying ? Phaser.Math.Between(24, 60) : -10 - i * 24, all || (elite && i === 0), !all);
      });
      if (all) {
        this.cameras.main.flash(400, 255, 236, 39);
        const intro = text(this, W / 2, 44, 'RONDE ELIT!', COLOR.gold, 16).setOrigin(0.5);
        this.tweens.add({ targets: intro, alpha: 0, delay: 1500, duration: 500, onComplete: () => intro.destroy() });
      }
    }

    this.createHud();
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-Q', () => this.paused && this.die());
    kb.on('keydown-W', () => this.moveReward(-1));
    kb.on('keydown-UP', () => this.moveReward(-1));
    kb.on('keydown-S', () => this.moveReward(1));
    kb.on('keydown-DOWN', () => this.moveReward(1));
    kb.on('keydown-J', () => this.takeReward());
    kb.on('keydown-ENTER', () => this.takeReward());
    kb.on('keydown-R', () => this.reroll());
    this.cameras.main.fadeIn(200);
  }

  update(time: number, delta: number): void {
    if (this.paused || this.over) return;
    if (this.rewards) {
      this.player.setVelocityX(0);
      return;
    }
    this.player.update(time);
    if (!this.cleared && this.player.tickDebuffs(time) && this.player.hp <= 0) return this.playerDown();
    this.regenerate(delta);
    // Copy: a burn tick may kill (and remove) an enemy mid-loop.
    for (const e of [...this.enemies.getChildren()] as Enemy[]) {
      if (this.statusTick(e, time)) continue;
      e.tick(time);
      this.eliteAct(e, time);
    }
    for (const b of [...this.bosses]) if (!this.statusTick(b, time)) b.tick(time);
    if (this.player.swinging) this.swordHits();
    for (const h of this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const landed = h.texture.key !== 'wave' && h.y > FLOOR_Y;
      if (landed && h.texture.key === 'bomb') this.explode(h.x, h.getData('dmg') as number);
      if (landed) burst(this, h.x, FLOOR_Y, h.texture.key === 'meteor' ? 0xffa300 : 0x00e436, 5);
      if (landed || h.x < -10 || h.x > W + 10 || h.y > H + 10 || h.y < -40) h.destroy();
    }
    for (const s of this.shots.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if ((s.getData('shot') as ShotSpec).returning) {
        this.boomerang(s, delta);
        continue;
      }
      if ((s.getData('shot') as ShotSpec).homing) this.steer(s, delta);
      const landed = s.texture.key !== 'wave' && s.y > FLOOR_Y;
      if (landed) burst(this, s.x, FLOOR_Y, 0xc2c3c7, 3);
      if (landed || s.x < -20 || s.x > W + 20 || s.y < -40) s.destroy();
    }

    if (!this.cleared && this.enemies.countActive() === 0 && !this.bosses.length) this.clearRound();
    if (this.portal && this.physics.overlap(this.player, this.portal)) this.nextRound();
    this.drawHud();
  }

  // --- Arena: what enemies and bosses may do ---

  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity = false, debuff?: Debuff): void {
    const h = this.physics.add.image(x, y, texture).setDepth(6);
    this.hazards.add(h);
    h.setData({ dmg: damage, debuff })
      .setVelocity(vx, vy)
      .setRotation(['arrow', 'fireball', 'iceshard'].includes(texture) ? Math.atan2(vy, vx) : 0);
    (h.body as Phaser.Physics.Arcade.Body).setAllowGravity(gravity);
  }

  shockwave(x: number, y: number, damage: number, debuff?: Debuff): void {
    for (const dir of [-1, 1]) this.fire(x + dir * 8, y - 3, dir * 130, 0, 'wave', damage, false, debuff);
  }

  private explode(x: number, damage: number): void {
    const y = FLOOR_Y - 6;
    burst(this, x, y, 0xffa300, 14);
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xff004d).setDepth(12);
    this.tweens.add({ targets: ring, radius: 24, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
    this.cameras.main.shake(80, 0.006);
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 24) this.hurtPlayer(damage, x);
  }

  zone(x: number, y: number, w: number, h: number, warnMs: number, damage: number, color = 0xffa300): void {
    const warn = this.add.rectangle(x, y, w, h, 0xff004d, 0.2).setOrigin(0).setStrokeStyle(1, 0xff004d).setDepth(4);
    this.tweens.add({ targets: warn, alpha: 0.55, yoyo: true, repeat: -1, duration: 90 });
    this.time.delayedCall(warnMs, () => {
      warn.destroy();
      // The boss died meanwhile: its attacks fizzle.
      if (this.over || !this.bosses.length) return;
      const blast = this.add.rectangle(x, y, w, h, color, 0.85).setOrigin(0).setDepth(11);
      this.tweens.add({ targets: blast, alpha: 0, duration: 300, onComplete: () => blast.destroy() });
      const b = this.player.body as Phaser.Physics.Arcade.Body;
      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          new Phaser.Geom.Rectangle(x, y, w, h),
          new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height),
        )
      )
        this.hurtPlayer(damage, x + w / 2);
    });
  }

  meteors(count: number, damage: number): void {
    for (let i = 0; i < count; i++) {
      // First one always targets the player; the rest scatter.
      const x = i === 0 ? this.player.x : Phaser.Math.Between(16, W - 16);
      const warn = this.add.rectangle(x, FLOOR_Y - 1, 10, 2, 0xff004d).setDepth(4);
      this.tweens.add({ targets: warn, alpha: 0.2, yoyo: true, repeat: -1, duration: 80 });
      this.time.delayedCall(700 + i * 150, () => {
        warn.destroy();
        if (this.bosses.length && !this.over) this.fire(x, -10, 0, 260, 'meteor', damage);
      });
    }
  }

  healAllies(x: number, y: number, radius: number, fraction: number, except: Phaser.GameObjects.GameObject): void {
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0x00e436).setDepth(12);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (e === except || !e.active || e.hp >= e.maxHp || Phaser.Math.Distance.Between(x, y, e.x, e.y) > radius) continue;
      const amount = Math.round(e.maxHp * fraction);
      e.hp = Math.min(e.maxHp, e.hp + amount);
      floatText(this, e.x, e.y - 12, `+${amount}`, '#00e436');
    }
  }

  summon(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.countActive() >= MAX_SUMMONS) return;
    burst(this, x, y, 0x7e2553, 6);
    this.spawnEnemy(kind, Phaser.Math.Clamp(x, 16, W - 16), y);
  }

  // --- internals ---

  get pace(): number {
    return enemyPace(this.cfg.round);
  }

  /** `announce`: the elite gets the name and bar under the round title (not in an elite round, where all are). */
  private spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false, announce = true): void {
    const k = elite ? ELITE : { hp: 1, dmg: 1 };
    const e = createEnemy(this, this, kind, x, y, this.cfg.enemyHp * k.hp, this.cfg.enemyDamage * k.dmg);
    this.enemies.add(e);
    e.setup();
    if (!elite) return;
    const affix = Phaser.Utils.Array.GetRandom(Object.keys(ELITE_AFFIXES)) as EliteAffix;
    e.setScale(ELITE.scale).setData({ elite: affix, eliteNext: this.time.now + 2500 });
    if (!announce) return;
    this.elite = e;
    this.eliteTitle = text(this, W / 2, 14, `ELIT ${ENEMIES[kind].name} ${ELITE_AFFIXES[affix].name}`, COLOR.gold, 7).setOrigin(0.5, 0);
  }

  /** Mini boss affix attacks: fire/ice rings, lightning strikes at the player, or minions. */
  private eliteAct(e: Enemy, time: number): void {
    const affix = e.getData('elite') as EliteAffix | undefined;
    if (!affix || time < (e.getData('eliteNext') as number)) return;
    const a = ELITE_AFFIXES[affix];
    e.setData('eliteNext', time + a.every * this.pace);
    if (affix === 'pemanggil') {
      for (const dx of [-16, 16]) this.summon(Phaser.Math.RND.pick(['slime', 'bat'] as const), e.x + dx, e.y - 8);
      return;
    }
    if (affix === 'petir') {
      const x = this.player.x;
      const warn = this.add.rectangle(x, FLOOR_Y - 1, 12, 2, 0xffec27).setDepth(4);
      this.tweens.add({ targets: warn, alpha: 0.2, yoyo: true, repeat: -1, duration: 80 });
      this.time.delayedCall(650, () => {
        warn.destroy();
        if (this.over || !e.active) return;
        const g = this.add.graphics().setDepth(60).lineStyle(2, 0xffec27).lineBetween(x, 0, x, FLOOR_Y);
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        if (Math.abs(this.player.x - x) < 10) this.hurtPlayer(e.damage, x, undefined, a.debuff);
      });
      return;
    }
    const texture = affix === 'api' ? 'fireball' : 'iceshard';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.fire(e.x, e.y, Math.cos(ang) * 90, Math.sin(ang) * 90, texture, Math.round(e.damage * 0.6), false, a.debuff);
    }
  }

  /** Tiled visual plus a matching static body. */
  private solid(x: number, y: number, w: number, h: number, tile: string): Phaser.GameObjects.TileSprite {
    const ts = this.add.tileSprite(x, y, w, h, tile).setOrigin(0).setDepth(2);
    this.physics.add.existing(ts, true);
    return ts;
  }

  private currentStats(): Derived {
    return runStats(this.base, WEAPONS[this.weaponId], this.items, this.cls);
  }

  // --- PlayerWorld: what the player's attacks and skills may do ---

  shot(spec: ShotSpec): Phaser.GameObjects.GameObject {
    const homing = !!spec.homing;
    spec = { ...spec, homing, tint: spec.tint ?? (homing && spec.texture === 'arrow' ? 0xff77a8 : undefined) };
    const img = this.physics.add.image(spec.x, spec.y, spec.texture).setDepth(9);
    this.shots.add(img);
    img.setVelocity(spec.vx, spec.vy).setData('shot', spec).setData('hits', new Set<object>()).setData('born', this.time.now);
    // Long thin projectiles point along their path; the rest just face their direction.
    if (
      [
        'arrow',
        'bullet',
        'kai',
        'w_belati',
        'w_tombak',
        'w_pedangTerbang',
        'iceshard',
        'panahArkana',
        'w_pedang',
        'w_kapak',
        'w_katana',
        'w_sabit',
      ].includes(spec.texture)
    )
      img.setRotation(Math.atan2(spec.vy, spec.vx));
    else img.setFlipX(spec.vx < 0);
    if (spec.tint !== undefined) img.setTint(spec.tint);
    return img;
  }

  pull(x: number, y: number, radius: number, speed: number): void {
    for (const t of this.hittables()) {
      if (t instanceof Boss || Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius) continue;
      // knockback() stuns briefly, so the enemy's own movement does not undo the pull.
      t.knockback(Math.sign(x - t.x) || 1, speed);
      // Never faster than reaching the center within the stun, so it lands there instead of flying past.
      const d = Phaser.Math.Distance.Between(t.x, t.y, x, y);
      const v = Math.min(speed, d * 4);
      const a = Phaser.Math.Angle.Between(t.x, t.y, x, y);
      t.setVelocity(Math.cos(a) * v, Math.sin(a) * v);
    }
  }

  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource, status?: Status): void {
    if (this.over) return;
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xfff1e8).setDepth(12);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
    for (const t of this.hittables()) {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius) continue;
      this.attack(t, mult, source, knockback, false, x, y);
      this.applyStatus(t, status);
    }
  }

  /** Burn refreshes (strongest wins); freeze extends. Bosses freeze half as long. */
  private applyStatus(t: Hittable, s: Status | undefined): void {
    if (!s || !t.active) return;
    const now = this.time.now;
    if (s.burn) {
      t.setData('burnUntil', now + BURN_MS);
      t.setData('burn', Math.max(t.getData('burn') ?? 0, s.burn * this.stats.elemental));
    }
    if (s.freeze) {
      const ms = s.freeze * this.stats.elemental * (t instanceof Boss || t.getData('elite') ? 0.5 : 1);
      // Mahoraga adapts to freeze too.
      t.setData('freezeUntil', Math.max(t.getData('freezeUntil') ?? 0, now + (t instanceof Boss ? t.resist('freeze', ms) : ms)));
    }
    if (s.slow) t.setData('slowUntil', Math.max(t.getData('slowUntil') ?? 0, now + s.slow));
  }

  private frozen(t: Hittable): boolean {
    return this.time.now < (t.getData('freezeUntil') ?? 0);
  }

  /** Burn ticks and freeze hold. True when the target must skip its AI this frame (frozen or dead). */
  private statusTick(t: Hittable, time: number): boolean {
    const burnUntil = t.getData('burnUntil') ?? 0;
    if (time < burnUntil && time >= (t.getData('burnNext') ?? 0)) {
      t.setData('burnNext', time + BURN_TICK_MS);
      burst(this, t.x, t.y - 4, 0xffa300, 2);
      const burn = Math.max(1, Math.round(this.stats.damage * t.getData('burn')));
      const landed = t instanceof Boss ? t.resist('burn', burn) : burn;
      if (landed > 0) this.damage(t, landed, '#ffa300', 0);
      if (!t.active) return true;
    } else if (burnUntil && time >= burnUntil) t.setData({ burnUntil: 0, burn: 0 });
    // Slow caps top speed while it lasts, so whatever moves the target (walking, charging, knockback) crawls.
    const slowed = time < (t.getData('slowUntil') ?? 0);
    if (slowed !== !!t.getData('slowed')) {
      t.setData('slowed', slowed);
      t.body.maxVelocity.set(slowed ? CHILL_SPEED : NO_CAP, slowed && !t.body.allowGravity ? CHILL_SPEED : NO_CAP);
    }
    if (this.frozen(t)) {
      t.setVelocityX(0);
      if (!t.body.allowGravity) t.setVelocityY(0);
      t.setTint(ICE_TINT);
      return true;
    }
    if (t.getData('freezeUntil')) {
      t.setData('freezeUntil', 0);
      t.setTint(t instanceof Boss ? t.baseTint : 0xffffff);
    }
    return false;
  }

  targets(x: number, y: number): Phaser.GameObjects.Sprite[] {
    return this.hittables().sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y));
  }

  strike(t: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean, status?: Status): void {
    if (this.over || !t.active) return;
    this.attack(t as Hittable, mult, source, 120, crit);
    this.applyStatus(t as Hittable, status);
  }

  /** Turn a homing shot toward the nearest enemy it has not hit yet, keeping its speed. */
  private steer(shot: Phaser.Physics.Arcade.Image, delta: number): void {
    if (this.time.now - (shot.getData('born') as number) > HOMING_LIFE) return void shot.destroy();
    const hits = shot.getData('hits') as Set<object>;
    const t = this.targets(shot.x, shot.y).find((x) => !hits.has(x));
    if (!t) return;
    const body = shot.body as Phaser.Physics.Arcade.Body;
    const speed = body.velocity.length();
    const next = Phaser.Math.Angle.RotateTo(
      body.velocity.angle(),
      Phaser.Math.Angle.Between(shot.x, shot.y, t.x, t.y),
      ((['arrow', 'panahArkana'].includes(shot.texture.key) ? ARROW_TURN : HOMING_TURN) * delta) / 1000,
    );
    body.velocity.setToPolar(next, speed);
    shot.setRotation(next);
  }

  /** Returning shot: hunts until a hit, a timeout or the arena edge, then flies back into the player's hand. */
  private boomerang(s: Phaser.Physics.Arcade.Image, delta: number): void {
    const out = this.time.now - (s.getData('born') as number) > RETURN_MS || s.y > FLOOR_Y || s.x < 4 || s.x > W - 4;
    if (out) s.setData('back', true);
    if (!s.getData('back')) {
      if ((s.getData('shot') as ShotSpec).homing) this.steer(s, delta);
      return;
    }
    const p = this.player;
    if (Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y) < 10) return void s.destroy();
    this.physics.moveToObject(s, p, RETURN_SPEED);
    s.setRotation(Phaser.Math.Angle.Between(p.x, p.y, s.x, s.y));
  }

  private hittables(): Hittable[] {
    const list: Hittable[] = (this.enemies.getChildren() as Enemy[]).filter((e) => e.active && !e.untargetable);
    list.push(...this.bosses.filter((b) => b.active && !b.untargetable));
    return list;
  }

  /** Phaser passes (sprite, groupChild) for group-vs-sprite overlaps, so sort the pair out here. */
  private shotHit(a: unknown, b: unknown): void {
    const aIsShot = this.shots.contains(a as Phaser.GameObjects.GameObject);
    const shot = (aIsShot ? a : b) as Phaser.Physics.Arcade.Image;
    const t = (aIsShot ? b : a) as Hittable;
    if (!shot.active || !t.active || (t instanceof Boss && t.untargetable)) return;
    const hits = shot.getData('hits') as Set<object>;
    if (hits.has(t)) return;
    hits.add(t);
    const spec = shot.getData('shot') as ShotSpec;
    if (spec.returning && !spec.pierce) shot.setData('back', true);
    else if (!spec.pierce) shot.destroy();
    this.attack(t, spec.mult, spec.source, spec.knockback ?? 80, false, shot.x, shot.y);
    this.applyStatus(t, spec.status);
    if (spec.explode) {
      shot.destroy();
      burst(this, shot.x, shot.y, 0x29adff, 14);
      this.cameras.main.shake(120, 0.01);
      this.area(shot.x, shot.y, spec.explode, spec.mult * 0.8, 160, spec.source);
    }
  }

  private phantomFist(t: Hittable, mult: number, delay: number): void {
    const p = this.player;
    const fist = this.add
      .image(p.x - p.facing * 4, p.y + Phaser.Math.Between(-8, 8), `w_${this.weaponId}`)
      .setTint(0xffec27)
      .setAlpha(0.7)
      .setFlipX(p.facing < 0)
      .setDepth(13);
    this.tweens.add({
      targets: fist,
      x: t.x,
      y: t.y + Phaser.Math.Between(-4, 4),
      delay: delay - 60,
      duration: 60,
      onComplete: () => {
        fist.destroy();
        if (t.active) this.attack(t, mult, 'proc', 20);
      },
    });
  }

  private swordHits(): void {
    const box = this.player.swingHitbox();
    const move = this.player.move;
    for (const t of this.hittables()) {
      if (this.player.hitThisSwing.has(t)) continue;
      const b = t.body as Phaser.Physics.Arcade.Body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(box, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) continue;
      this.player.hitThisSwing.add(t);
      this.attack(t, move.dmg, 'basic', move.knockback);
      this.applyStatus(t, move.status);
      // Ashura phantom arms: golden fists fly in from beside the player, each a follow-up hit for 40%.
      for (let i = 1; i <= (move.extra ?? 0); i++) this.phantomFist(t, move.dmg * 0.4, 70 * i);
      if (move.anim === 'overhead') this.cameras.main.shake(80, 0.008);
      if (move.bounce) {
        this.player.pogo();
        if (this.stats.pogoQuake) {
          this.area(this.player.x, this.player.y + 12, 24, 0.8, 120, 'skill');
          this.cameras.main.shake(100, 0.01);
        }
        return;
      }
    }
  }

  /**
   * Any player hit: rolls crit (unless forced), feeds the ult meter, triggers item effects.
   * (fromX, fromY) is where the hit comes from, for shields; defaults to the player. Ultimates ignore shields.
   */
  private attack(
    t: Hittable,
    mult: number,
    source: HitSource,
    knockback: number,
    forceCrit = false,
    fromX = this.player.x,
    fromY = this.player.y,
  ): void {
    const st = this.stats;
    if (source !== 'ult' && t instanceof Enemy && t.blocks(fromX, fromY)) {
      mult *= 0.2;
      knockback = 0;
      floatText(this, t.x, t.y - 18, 'TAHAN', COLOR.gray);
      burst(this, t.x + Math.sign(fromX - t.x) * 5, t.y, 0xffa300, 4);
    }
    const crit = forceCrit || (source === 'basic' && st.dashCrit > 0 && this.player.takeDashCrit()) || Math.random() < st.critChance;
    const enraged = st.rage > 0 && this.player.hp < st.maxHp / 2;
    const weak = this.player.has('weak') ? WEAK_MULT : 1;
    const big = t instanceof Boss || t.getData('elite') ? 1 + st.bossDamage : 1;
    const fury = 1 + FURY.step * this.player.fury;
    const raw = Math.max(1, Math.round(st.damage * mult * weak * big * fury * (crit ? st.critMult : 1) * (enraged ? 1 + st.rage : 1)));
    // Special bosses: Mahoraga adapts to each kind of attack, Leviathan's scales soak it.
    const dmg = t instanceof Boss ? t.resist(source, raw) : raw;
    // Mahoraga has fully adapted to this kind: nothing lands.
    if (dmg <= 0) return;
    if (source === 'basic') this.player.gainFury();
    if (crit) this.cameras.main.shake(60, 0.006);
    if (crit && st.critResetsDash) this.player.resetDash();
    if (st.lifesteal && source !== 'proc') {
      this.lifestealAcc += Math.min(t.hp, dmg) * st.lifesteal;
      if (this.lifestealAcc >= 1) {
        this.player.heal(Math.floor(this.lifestealAcc));
        this.lifestealAcc %= 1;
      }
    }
    const x = t.x;
    const y = t.y;
    const killed = this.damage(t, dmg, crit ? COLOR.gold : COLOR.text, knockback);
    if (source === 'basic' || source === 'skill') this.player.addUlt((ULT_GAIN[source] + (killed ? ULT_GAIN.kill : 0)) * st.ultGainMult);
    // Korek Api / Inti Es and friends: basic hits may set the target burning or frozen.
    if (source === 'basic' && !killed) {
      if (Math.random() < st.burnChance) this.applyStatus(t, { burn: 0.15 });
      if (Math.random() < st.freezeChance) this.applyStatus(t, { freeze: 500 });
    }
    // Gema Pedang: a basic hit may strike again for half damage.
    if (source === 'basic' && !killed && Math.random() < st.echo) {
      this.time.delayedCall(90, () => t.active && this.damage(t, Math.max(1, Math.round(dmg / 2)), RARITY_COLOR.legend, 40));
    }
    // Segel Petir: each kill throws bolts at the nearest enemies.
    if (killed && source !== 'proc') for (let i = 0; i < st.killBolt; i++) this.time.delayedCall(100 + i * 80, () => this.bolt(x, y));
    // Grim Reaper synergy / Lentera Jiwa: kills release souls that hunt the next enemy.
    if (killed && source !== 'proc') {
      for (let i = 0; i < st.killSouls; i++) {
        this.shot({
          x,
          y,
          vx: Phaser.Math.Between(-60, 60),
          vy: -90,
          texture: 'soul',
          tint: 0xc2c3c7,
          mult: 1,
          source: 'proc',
          homing: true,
        });
      }
    }
  }

  private bolt(x: number, y: number): void {
    const t = this.targets(x, y)[0] as Hittable | undefined;
    if (!t || this.over) return;
    const g = this.add.graphics().setDepth(60).lineStyle(1, 0xffec27);
    // Jagged line from the kill spot to the target.
    const steps = 5;
    g.beginPath().moveTo(x, y);
    for (let i = 1; i < steps; i++) {
      g.lineTo(x + ((t.x - x) * i) / steps + Phaser.Math.Between(-4, 4), y + ((t.y - y) * i) / steps + Phaser.Math.Between(-4, 4));
    }
    g.lineTo(t.x, t.y).strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
    this.attack(t, 1.2, 'proc', 60);
  }

  /** Hati Dewa / Jiwa Abadi: HP and ult meter over time. */
  private regenerate(delta: number): void {
    const st = this.stats;
    if (st.ultRegen) this.player.addUlt((st.ultRegen * delta) / 1000);
    if (!st.regen || this.player.hp >= st.maxHp) return;
    this.regenAcc += (st.regen * delta) / 1000;
    if (this.regenAcc >= 1) {
      this.player.heal(Math.floor(this.regenAcc));
      this.regenAcc %= 1;
    }
  }

  /** Returns true when this killed the target. */
  private damage(t: Hittable, dmg: number, color: string, knockback: number): boolean {
    t.hp -= dmg;
    floatText(this, t.x, t.y - 10, `${dmg}`, color);
    const execute = t instanceof Boss || t.getData('elite') ? this.stats.execute / 2 : this.stats.execute;
    if (t.hp > 0 && t.hp <= t.maxHp * execute) {
      t.hp = 0;
      floatText(this, t.x, t.y - 20, 'EKSEKUSI', COLOR.red);
    }
    flash(t, 0xffffff, t instanceof Boss ? t.baseTint : 0xffffff);
    burst(this, t.x, t.y, 0xfff1e8, 4);
    // No push at 0 (burn ticks, blocked hits) so the enemy keeps its own movement.
    // Mini bosses shrug off most of the push.
    if (!(t instanceof Boss) && knockback)
      t.knockback(Math.sign(t.x - this.player.x) || this.player.facing, t.getData('elite') ? knockback * 0.3 : knockback);
    if (t.hp > 0) return false;
    const souls =
      t instanceof Boss
        ? soulReward('boss', this.cfg.round, this.stats.soulMult) * (t.special ? SPECIAL_STATS[t.special].soul : 1)
        : soulReward('enemy', this.cfg.round, this.stats.soulMult, ENEMIES[t.kind].soul * (t.getData('elite') ? ELITE.soul : 1));
    this.save.souls += souls;
    this.runSouls += souls;
    writeSave(this.save);
    floatText(this, t.x, t.y - 20, `+${souls}`, COLOR.blue);
    if (!(t instanceof Boss) && t.getData('elite')) {
      this.coins += ELITE.coins;
      floatText(this, t.x, t.y - 30, `+${ELITE.coins} KOIN`, COLOR.gold);
      burst(this, t.x, t.y, 0xffec27, 16);
      this.cameras.main.shake(200, 0.012);
    }
    if (this.stats.healOnKill) this.player.heal(this.stats.healOnKill);
    if (Math.random() < this.stats.goldChance) {
      this.coins++;
      floatText(this, t.x, t.y - 28, '+1 KOIN', COLOR.gold);
    }
    if (t instanceof Boss) {
      if (t.special) {
        const { coins } = SPECIAL_STATS[t.special];
        this.coins += coins;
        floatText(this, t.x, t.y - 30, `+${coins} KOIN`, COLOR.gold);
      }
      burst(this, t.x, t.y, 0xff004d, 24);
      this.cameras.main.shake(400, 0.02);
      this.bosses = this.bosses.filter((b) => b !== t);
      // Once the last boss falls, its attacks and summons vanish with it (no souls).
      if (!this.bosses.length) {
        this.hazards.clear(true, true);
        for (const e of this.enemies.getChildren() as Enemy[]) burst(this, e.x, e.y, 0x7e2553, 6);
        this.enemies.clear(true, true);
      }
    } else {
      burst(this, t.x, t.y, 0x00e436, 10);
      // Big slime splits in two: spawned now (not a capped summon), so the round cannot count as cleared in between.
      if (t.kind === 'splitter') for (const dx of [-8, 8]) this.spawnEnemy('slime', Phaser.Math.Clamp(t.x + dx, 16, W - 16), t.y - 6);
    }
    t.destroy();
    return true;
  }

  private hurtPlayer(dmg: number, fromX: number, source?: Hittable, debuff?: Debuff): void {
    if (this.over || this.cleared) return;
    const result = this.player.hurt(dmg, fromX);
    if (result === 'dead') return this.playerDown();
    if (result === 'hit' && debuff) this.player.afflict(debuff, dmg);
    if (result === 'hit' && source?.active && this.stats.thorns) this.damage(source, this.stats.thorns, COLOR.gray, 80);
  }

  private playerDown(): void {
    if (this.godHandLeft > 0) {
      this.godHandLeft--;
      this.player.clearDebuffs();
      this.player.hp = Math.round(this.stats.maxHp * 0.3);
      this.player.invuln(1500);
      this.cameras.main.flash(300, 255, 236, 39);
      floatText(this, this.player.x, this.player.y - 16, 'GOD HAND!', COLOR.gold);
      return;
    }
    if (this.items.includes('phoenix')) this.revive();
    else this.die();
  }

  /** Bulu Phoenix: consumed instead of dying. */
  private revive(): void {
    this.player.clearDebuffs();
    this.items.splice(this.items.indexOf('phoenix'), 1);
    this.spent.push('phoenix');
    this.player.equip(this.currentStats(), WEAPONS[this.weaponId]);
    this.player.hp = Math.round(this.stats.maxHp * 0.5);
    this.player.invuln(2000);
    burst(this, this.player.x, this.player.y, 0xffa300, 24);
    this.cameras.main.flash(300, 255, 163, 0);
    floatText(this, this.player.x, this.player.y - 16, 'BANGKIT!', COLOR.gold);
    this.drawInventory();
  }

  private clearRound(): void {
    this.cleared = true;
    const heal = this.cfg.boss ? this.stats.maxHp : Math.round(this.stats.maxHp * 0.25);
    this.player.heal(heal);
    floatText(this, this.player.x, this.player.y - 16, `+${heal} HP`, COLOR.red);
    const sp = this.cfg.specials;
    const msg = this.bossLeft
      ? 'BERTAHAN HIDUP!'
      : sp
        ? sp.length > 1
          ? sp.length === 3
            ? 'KETIGANYA TUMBANG!'
            : 'KEDUANYA TUMBANG!'
          : `${BOSSES[sp[0]].name} TUMBANG!`
        : this.cfg.boss
          ? 'BOSS KALAH!'
          : this.cfg.eliteRound
            ? 'RONDE ELIT BERSIH!'
            : 'ROUND BERSIH';
    const banner = text(this, W / 2, 30, msg, COLOR.gold, this.cfg.boss ? 16 : 8).setOrigin(0.5);
    const earned = coinReward(this.cfg.round, this.stats.coinBonus);
    this.coins += earned;
    floatText(this, this.player.x, this.player.y - 28, `+${earned} KOIN`, COLOR.gold);
    this.tweens.add({ targets: banner, alpha: 0, delay: 1200, duration: 400 });
    this.time.delayedCall(500, () => this.showRewards());
  }

  /**
   * A bonus round pays like the boss one tier past the coming one per special boss, one more with Godzilla; an elite
   * round like the coming boss. Outlasting Mahoraga (it left) pays like a normal round.
   */
  private get rewardRound(): number {
    const sp = this.cfg.specials;
    if (this.cfg.eliteRound) return (Math.floor(this.cfg.round / BOSS_EVERY) + 1) * BOSS_EVERY;
    if (!sp || this.bossLeft) return this.cfg.round;
    return (this.cfg.bossTier + sp.length + (sp.includes('godzilla') ? 1 : 0)) * BOSS_EVERY;
  }

  bossLeaves(b: Phaser.GameObjects.Sprite): void {
    const boss = b as Boss;
    if (!this.bosses.includes(boss)) return;
    floatText(this, boss.x, boss.y - 30, `${BOSSES[boss.kind].name} PERGI`, COLOR.gray);
    burst(this, boss.x, boss.y, 0x000000, 20);
    this.bosses = this.bosses.filter((x) => x !== boss);
    this.bossLeft = true;
    boss.destroy();
    if (!this.bosses.length) {
      this.hazards.clear(true, true);
      this.enemies.clear(true, true);
    }
  }

  private showRewards(): void {
    this.rewards = rollRewards(this.rewardRound, [...this.items, ...this.spent]);
    this.rewardSel = 0;
    this.rerolls = 0;
    this.buildRewardUi();
  }

  private buildRewardUi(): void {
    this.rewardUi?.destroy();
    const rewards = this.rewards ?? [];
    const ui = this.add.container(0, 0).setDepth(200);
    ui.add(this.add.rectangle(W / 2, H / 2 + 12, 290, 146, 0x000000, 0.85).setStrokeStyle(1, 0x83769c));
    ui.add(
      text(
        this,
        W / 2,
        REWARD_Y - 16,
        this.cfg.boss ? 'HADIAH BOSS!' : this.cfg.eliteRound ? 'HADIAH ELIT!' : 'PILIH HADIAH',
        COLOR.gold,
      ).setOrigin(0.5, 0),
    );
    ui.add([this.add.image(W - 50, REWARD_Y - 12, 'coin'), text(this, W - 44, REWARD_Y - 16, `${this.coins}`, COLOR.gold)]);
    rewards.forEach((r, i) => {
      const info = rewardInfo(r);
      const rarity = rewardRarity(r);
      const y = REWARD_Y + i * REWARD_H;
      const row = this.add.zone(W / 2, y + 8, 280, REWARD_H - 2).setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => {
        this.rewardSel = i;
        this.takeReward();
      });
      ui.add([
        row,
        text(this, 20, y + 3, '>', COLOR.gold).setName(`sel${i}`),
        this.add.image(34, y + 7, info.icon),
        text(this, 50, y, info.name, RARITY_COLOR[rarity]),
        this.completesSet(r)
          ? text(this, W - 20, y, 'SET!', COLOR.gold).setOrigin(1, 0)
          : text(this, W - 20, y, rarity === 'biasa' ? '' : rarity.toUpperCase(), RARITY_COLOR[rarity]).setOrigin(1, 0),
        text(this, 50, y + 10, info.desc, COLOR.gray),
      ]);
    });
    const skipY = REWARD_Y + SKIP_ROW * REWARD_H;
    const skip = this.add.zone(W / 2, skipY + 4, 280, 12).setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => {
      this.rewardSel = SKIP_ROW;
      this.takeReward();
    });
    const cost = rerollCost(this.rerolls);
    const refresh = text(this, W / 2, skipY + 14, `W/S PILIH  J AMBIL  R REFRESH ${cost}`, this.coins >= cost ? COLOR.blue : COLOR.gray)
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.reroll());
    ui.add([
      skip,
      text(this, 20, skipY, '>', COLOR.gold).setName(`sel${SKIP_ROW}`),
      text(this, 50, skipY, 'LEWATI (TIDAK AMBIL APA-APA)', COLOR.gray),
      refresh,
      text(this, 20, skipY + 26, '', COLOR.gray).setName('setName'),
      text(this, 20, skipY + 36, '', COLOR.gray).setName('setDesc'),
    ]);
    this.rewardUi = ui;
    this.refreshRewards();
  }

  /** Spend coins to roll a new set of rewards; each refresh on the same panel costs 1 more. */
  private reroll(): void {
    if (!this.rewards || this.paused) return;
    const cost = rerollCost(this.rerolls);
    if (this.coins < cost) {
      this.cameras.main.shake(80, 0.005);
      floatText(this, W / 2, REWARD_Y - 24, 'KOIN KURANG', COLOR.red);
      return;
    }
    this.coins -= cost;
    this.rerolls++;
    this.rewards = rollRewards(this.rewardRound, [...this.items, ...this.spent]);
    this.buildRewardUi();
  }

  private moveReward(d: number): void {
    if (!this.rewards) return;
    this.rewardSel = Phaser.Math.Wrap(this.rewardSel + d, 0, SKIP_ROW + 1);
    this.refreshRewards();
  }

  private refreshRewards(): void {
    for (let i = 0; i <= SKIP_ROW; i++) {
      (this.rewardUi?.getByName(`sel${i}`) as Phaser.GameObjects.Text | null)?.setVisible(i === this.rewardSel);
    }
    // Set info of the highlighted item: its partner and the bonus both give.
    const name = this.rewardUi?.getByName('setName') as Phaser.GameObjects.Text | null;
    const desc = this.rewardUi?.getByName('setDesc') as Phaser.GameObjects.Text | null;
    const r = this.rewards?.[this.rewardSel];
    if (!name || !desc) return;
    if (r?.type !== 'item') {
      name.setText('');
      desc.setText('');
      return;
    }
    const { pair, partner } = pairOf(r.id);
    const color = this.completesSet(r) ? COLOR.gold : COLOR.gray;
    name.setText(`SET ${pair.name} + ${ITEMS[partner].name}`).setColor(color);
    desc.setText(pair.desc).setColor(color);
  }

  /** Taking this reward completes an item set. */
  private completesSet(r: Reward): boolean {
    return r.type === 'item' && this.items.includes(pairOf(r.id).partner);
  }

  private takeReward(): void {
    if (!this.rewards || this.paused) return;
    const r = this.rewardSel === SKIP_ROW ? undefined : this.rewards[this.rewardSel];
    this.rewards = undefined;
    this.rewardUi?.destroy();
    // The J/W presses used in the menu must not leak into a swing or jump.
    this.input.keyboard!.resetKeys();
    if (r) this.applyReward(r);
    else floatText(this, this.player.x, this.player.y - 16, 'DILEWATI', COLOR.gray);
    this.openPortal();
  }

  private applyReward(r: Reward): void {
    const oldMax = this.stats.maxHp;
    if (r.type === 'potion') this.player.heal(Math.round(this.stats.maxHp * 0.5));
    const completes = this.completesSet(r);
    if (r.type === 'item') this.items.push(r.id);
    this.player.equip(this.currentStats(), WEAPONS[this.weaponId]);
    if (this.stats.maxHp > oldMax) this.player.heal(this.stats.maxHp - oldMax);
    floatText(this, this.player.x, this.player.y - 16, rewardInfo(r).name, COLOR.gold);
    if (completes && r.type === 'item') {
      floatText(this, this.player.x, this.player.y - 28, `SET ${pairOf(r.id).pair.name}!`, COLOR.gold);
      this.cameras.main.flash(200, 255, 236, 39);
    }
    this.drawInventory();
  }

  private openPortal(): void {
    this.portal = this.physics.add
      .staticImage(W / 2, FLOOR_Y - 8, 'portal')
      .setDepth(3)
      .setAlpha(0);
    this.tweens.add({ targets: this.portal, alpha: 1, duration: 400 });
    this.tweens.add({ targets: this.portal, scaleX: 0.85, yoyo: true, repeat: -1, duration: 300 });
  }

  private nextRound(): void {
    this.portal = undefined;
    const round = this.cfg.round + 1;
    const specials = rollSpecials(round);
    this.scene.restart({
      round,
      specials,
      eliteRound: !specials.length && rollEliteRound(round),
      hp: this.player.hp,
      runSouls: this.runSouls,
      weapon: this.weaponId,
      cls: this.cls,
      coins: this.coins,
      items: this.items,
      spent: this.spent,
      ult: this.player.ult,
    } satisfies RunData);
  }

  private die(): void {
    if (this.over) return;
    this.over = true;
    this.paused = false;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.pauseText.setVisible(false);
    this.physics.pause();
    this.player.setTint(0xff004d);
    text(this, W / 2, H / 2 - 10, 'GUGUR', COLOR.red, 16).setOrigin(0.5);
    this.time.delayedCall(1500, () => {
      this.scene.start('hub', { died: true, round: this.cfg.round, runSouls: this.runSouls } satisfies HubData);
    });
  }

  private togglePause(): void {
    if (this.over) return;
    this.paused = !this.paused;
    this.time.paused = this.paused;
    if (this.paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
    if (this.paused) this.physics.pause();
    else this.physics.resume();
    const sets = activePairs(this.items).map((p) => p.name);
    this.pauseText
      .setText(['PAUSE', '', ...(sets.length ? ['SET AKTIF:', ...sets, ''] : []), 'ESC LANJUT  Q MENYERAH'].join('\n'))
      .setVisible(this.paused);
  }

  private createHud(): void {
    this.hud = this.add.graphics().setDepth(99);
    this.add.image(6, 6, 'heart').setDepth(100);
    this.hpText = text(this, 76, 3, '');
    this.add.image(W - 50, 7, 'soul').setDepth(100);
    this.soulText = text(this, W - 44, 3, '');
    this.add.image(W - 50, 17, 'coin').setDepth(100);
    this.coinText = text(this, W - 44, 13, '', COLOR.gold);
    this.ultText = text(this, 76, 12, 'I ULTI!', COLOR.gold);
    this.debuffText = text(this, 4, 21, '', COLOR.red);
    const label = this.cfg.specials
      ? `ROUND ${this.cfg.round} BONUS`
      : this.cfg.boss
        ? `ROUND ${this.cfg.round} BOSS`
        : this.cfg.eliteRound
          ? `ROUND ${this.cfg.round} ELIT`
          : `ROUND ${this.cfg.round}`;
    text(this, W / 2, 3, label, this.cfg.boss ? COLOR.red : this.cfg.eliteRound ? COLOR.gold : COLOR.text).setOrigin(0.5, 0);
    this.bossHud = this.bosses.map((boss, i) => ({ boss, title: text(this, W / 2, 14 + i * 17, boss.title, COLOR.red).setOrigin(0.5, 0) }));
    this.pauseText = text(this, W / 2, H / 2, 'PAUSE\n\nESC LANJUT  Q MENYERAH', COLOR.text)
      .setOrigin(0.5)
      .setAlign('center')
      .setBackgroundColor('#000000')
      .setPadding(6)
      .setDepth(300)
      .setVisible(false);
    this.drawInventory();
  }

  /** Weapon + item icons along the dirt strip at the bottom. */
  private drawInventory(): void {
    this.inventory?.destroy();
    const inv = this.add.container(0, 0).setDepth(100);
    // Gold frame around the weapon while the class synergy is active.
    if (hasSynergy(this.cls, this.weaponId))
      inv.add(
        this.add
          .rectangle(2, H - 6, 24, 9)
          .setOrigin(0, 0.5)
          .setStrokeStyle(1, 0xffec27),
      );
    inv.add(this.add.image(4, H - 6, `w_${this.weaponId}`).setOrigin(0, 0.5));
    this.items.forEach((id, i) => {
      const x = 30 + i * 9;
      const rarity = ITEMS[id].rarity;
      // Colored frame marks rare+ items.
      if (rarity !== 'biasa')
        inv.add(this.add.rectangle(x, H - 6, 9, 9).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(RARITY_COLOR[rarity]).color));
      inv.add(this.add.image(x, H - 6, `i_${id}`));
      // Gold underline: this item's set is complete.
      if (this.items.includes(pairOf(id).partner)) inv.add(this.add.rectangle(x, H - 1, 7, 1, 0xffec27));
    });
    this.inventory = inv;
  }

  private drawHud(): void {
    const g = this.hud.clear();
    const p = this.player;
    g.fillStyle(0x000000).fillRect(12, 3, 62, 7);
    g.fillStyle(0x7e2553).fillRect(13, 4, 60, 5);
    g.fillStyle(COLOR.hp).fillRect(13, 4, Math.ceil((60 * p.hp) / p.stats.maxHp), 5);
    // Cooldown strips under the HP bar: dash (blue), skill (yellow), ult meter (pink, blinks gold when full).
    g.fillStyle(COLOR.soul).fillRect(13, 11, Math.round(60 * p.dashReady), 1);
    g.fillStyle(0xffec27).fillRect(13, 13, Math.round(60 * p.skillReady), 1);
    const ultFull = p.ult >= 100;
    g.fillStyle(ultFull && Math.floor(this.time.now / 150) % 2 ? 0xffec27 : 0xff77a8).fillRect(13, 15, Math.round(0.6 * p.ult), 2);
    if (p.weapon.fusion) g.fillStyle(0x8a3fd1).fillRect(13, 18, Math.round(60 * p.fusionReady), 1);
    // Dark Avenger: the meter is the mode's timer, so label it instead of "I ULTI!".
    this.ultText.setText(p.awakened ? 'AVENGER' : 'I ULTI!').setVisible(ultFull || p.awakened);
    this.hpText.setText(`${p.hp}`);
    this.debuffText.setText([p.fury ? `AMARAH ${p.fury}` : '', p.debuffNames].filter(Boolean).join(' '));
    this.soulText.setText(`${this.runSouls}`);
    this.coinText.setText(`${this.coins}`);
    // Small bars over hurt enemies; gold for elites.
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active || e.hp >= e.maxHp) continue;
      const y = e.y - e.displayHeight / 2 - 4;
      g.fillStyle(0x000000).fillRect(e.x - 7, y, 14, 3);
      g.fillStyle(e.getData('elite') ? 0xffec27 : COLOR.hp).fillRect(e.x - 6, y + 1, Math.ceil((12 * Math.max(0, e.hp)) / e.maxHp), 1);
    }
    // Mini boss bar under its name, like the boss bar but gold.
    const elite = this.elite?.active ? this.elite : undefined;
    this.eliteTitle?.setVisible(!!elite);
    if (elite && !this.bosses.length) {
      g.fillStyle(0x000000).fillRect(W / 2 - 61, 24, 122, 5);
      g.fillStyle(0x5f574f).fillRect(W / 2 - 60, 25, 120, 3);
      g.fillStyle(0xffec27).fillRect(W / 2 - 60, 25, Math.ceil((120 * Math.max(0, elite.hp)) / elite.maxHp), 3);
    }
    // One bar per boss, stacked; Leviathan's scales show as a blue line along the bottom of its bar.
    this.bossHud.forEach(({ boss, title }, i) => {
      title.setVisible(boss.active);
      if (!boss.active) return;
      title.setText(boss.title);
      const y = 25 + i * 17;
      g.fillStyle(0x000000).fillRect(W / 2 - 81, y - 1, 162, 6);
      g.fillStyle(0x5f574f).fillRect(W / 2 - 80, y, 160, 4);
      g.fillStyle(COLOR.hp).fillRect(W / 2 - 80, y, Math.ceil((160 * Math.max(0, boss.hp)) / boss.maxHp), 4);
      if (boss.armorFrac) g.fillStyle(COLOR.soul).fillRect(W / 2 - 80, y + 3, Math.ceil(160 * boss.armorFrac), 1);
    });
  }
}
