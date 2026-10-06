import Phaser from 'phaser';
import type { Arena, HitSource, PlayerWorld, ShotSpec } from '../entities/arena.ts';
import { Boss } from '../entities/Boss.ts';
import { INTROS, invasionBanner } from '../entities/invasions.ts';
import { createEnemy, Enemy } from '../entities/Enemy.ts';
import { Player } from '../entities/Player.ts';
import { SKILLS } from '../entities/skills.ts';
import { CHARGED } from '../entities/charged/index.ts';
import { PASSIVES, type PassiveCtx } from '../entities/passives.ts';
import { padConnected } from '../gamepad.ts';
import { duckMusic, playMusic, sfx, soundLabel, stopMusic, toggleSound } from '../audio.ts';
import { COLOR } from '../gfx/sprites.ts';
import { burst, cutMark, flash, floatText, FLOOR_Y, H, text, TILE, W } from '../gfx/ui.ts';
import {
  activePairs,
  ITEMS,
  MAX_ITEMS,
  pairOf,
  RARITY_COLOR,
  takeItem,
  rewardInfo,
  rewardRarity,
  rollRewards,
  coinReward,
  rerollCost,
  runStats,
  HITSTOP,
  hitstopMs,
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
  rollInvasion,
  INVASION,
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
  /** Invasion: this hidden boss crashes into the (normal) round partway through. */
  invasion?: SpecialBoss;
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

const pauseHint = (): string => (padConnected() ? 'START LANJUT  SELECT MENYERAH' : 'ESC LANJUT  Q MENYERAH');

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
  /** Invasion still to come (cleared once its boss is on the field); `invaded` remembers who came. */
  private invasion?: SpecialBoss;
  private invaded?: SpecialBoss;
  private invadeAt = 0;
  private waveSize = 0;
  private invading = false;
  private floorBody!: Phaser.GameObjects.TileSprite;
  private over = false;
  private paused = false;
  private rewards?: Reward[];
  private rewardSel = 0;
  /** Replace step of the reward panel: the item waiting for a relic slot. */
  private replacing?: ItemId;
  private regenAcc = 0;
  private lifestealAcc = 0;
  /** Hitstop (game-loop ms): the fight holds still until `hitstopUntil`, and may not freeze again before `hitstopReady`. */
  private hitstopUntil = 0;
  private hitstopReady = 0;
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

  get playerMaxHp(): number {
    return this.stats.maxHp;
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
    this.cleared = this.over = this.paused = this.invading = false;
    this.invasion = this.invaded = undefined;
    this.regenAcc = this.lifestealAcc = this.hitstopUntil = this.hitstopReady = 0;
    this.bosses = [];
    this.bossLeft = false;
    this.portal = this.rewards = this.rewardUi = this.inventory = this.elite = this.eliteTitle = this.replacing = undefined;
    if (data.round > this.save.bestRound) {
      this.save.bestRound = data.round;
      writeSave(this.save);
    }

    this.add.image(0, 0, 'bg').setOrigin(0);
    // World floor = ground top: anything that tunnels through the thin floor body is still stopped here.
    this.physics.world.setBounds(0, -100, W, FLOOR_Y + 100);
    this.physics.world.setBoundsCollision(true, true, false, true);

    const floor = this.solid(0, FLOOR_Y, W, TILE, 'ground');
    this.floorBody = floor;
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

    playMusic(this.cfg.specials?.length ? 'special' : this.cfg.boss ? 'boss' : 'run');
    duckMusic(false);
    if (this.cfg.boss) {
      this.time.delayedCall(150, () => sfx('boss'));
      const kinds: (SpecialBoss | undefined)[] = this.cfg.specials ?? [undefined];
      this.bosses = kinds.map((k, i) => new Boss(this, this, W - 40 - i * 60, FLOOR_Y - 40, this.cfg, k));
      for (const boss of this.bosses) this.wireBoss(boss);
      const sp = this.cfg.specials;
      if (sp) {
        this.cameras.main.flash(600, 255, 255, 255);
        const title =
          sp.length === 4
            ? 'SEMUA BOS BONUS!'
            : sp.length === 3
              ? 'BONUS TRIPEL!'
              : sp.length === 2
                ? 'BONUS GANDA!'
                : `BONUS: ${BOSSES[sp[0]].name}`;
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
      // A hidden boss may crash in once enough of the wave has fallen (or after a while).
      if (data.invasion && !all) {
        this.invasion = data.invasion;
        this.waveSize = this.cfg.enemyCount;
        this.invadeAt = this.time.now + INVASION.afterMs;
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
    kb.on('keydown-M', () => {
      const label = toggleSound();
      // Paused: time is frozen, so the label goes into the pause box instead of floating.
      if (this.paused) this.showPauseText();
      else floatText(this, this.player.x, this.player.y - 16, label, COLOR.gray);
    });
    this.cameras.main.fadeIn(200);
  }

  update(time: number, delta: number): void {
    if (this.paused || this.over) return;
    if (this.hitstopUntil) {
      if (time < this.hitstopUntil) return;
      this.hitstopUntil = 0;
      this.time.paused = false;
      this.tweens.resumeAll();
      this.physics.resume();
    }
    if (this.rewards) {
      this.player.setVelocityX(0);
      return;
    }
    this.player.update(time);
    if (!this.cleared) this.passive.tick?.(this.pctx, time, delta);
    if (!this.cleared && this.player.tickDebuffs(time) && this.player.hp <= 0) return this.playerDown();
    this.regenerate(delta);
    // Copy: a burn tick may kill (and remove) an enemy mid-loop, and that kill can chain (an onKill burst, a boss
    // falling and clearing its summons) into enemies further down the list, so skip anything already gone.
    for (const e of [...this.enemies.getChildren()] as Enemy[]) {
      if (!e.active || this.statusTick(e, time)) continue;
      e.tick(time);
      if (e.active) this.eliteAct(e, time);
    }
    for (const b of [...this.bosses]) if (b.active && !this.statusTick(b, time)) b.tick(time);
    if (this.player.swinging) this.swordHits();
    for (const h of [...this.hazards.getChildren()] as Phaser.Physics.Arcade.Image[]) {
      const landed = h.texture.key !== 'wave' && h.y > FLOOR_Y;
      if (landed && h.texture.key === 'bomb') this.explode(h.x, h.getData('dmg') as number);
      if (landed) burst(this, h.x, FLOOR_Y, h.texture.key === 'meteor' ? 0xffa300 : 0x00e436, 5);
      if (landed || h.x < -10 || h.x > W + 10 || h.y > H + 10 || h.y < -40) h.destroy();
    }
    for (const s of [...this.shots.getChildren()] as Phaser.Physics.Arcade.Image[]) {
      if (!s.active) continue;
      if ((s.getData('shot') as ShotSpec).spin) s.rotation += delta * 0.03;
      if ((s.getData('shot') as ShotSpec).returning) {
        this.boomerang(s, delta);
        continue;
      }
      if ((s.getData('shot') as ShotSpec).homing) this.steer(s, delta);
      const landed = s.texture.key !== 'wave' && s.y > FLOOR_Y;
      if (landed) burst(this, s.x, FLOOR_Y, 0xc2c3c7, 3);
      if (landed || s.x < -20 || s.x > W + 20 || s.y < -40) s.destroy();
    }

    if (
      this.invasion &&
      !this.invading &&
      (this.enemies.countActive() <= Math.floor(this.waveSize * (1 - INVASION.afterKills)) || time >= this.invadeAt)
    )
      this.invade(this.invasion);
    if (!this.cleared && this.enemies.countActive() === 0 && !this.bosses.length && !this.invasion) this.clearRound();
    if (this.portal && this.physics.overlap(this.player, this.portal)) this.nextRound();
    this.drawHud();
  }

  // --- Arena: what enemies and bosses may do ---

  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity = false, debuff?: Debuff): void {
    const h = this.physics.add.image(x, y, texture).setDepth(6);
    sfx('enemyShot');
    this.hazards.add(h);
    h.setData({ dmg: damage, debuff })
      .setVelocity(vx, vy)
      .setRotation(['arrow', 'fireball', 'iceshard', 'bone', 'hairNeedle'].includes(texture) ? Math.atan2(vy, vx) : 0);
    (h.body as Phaser.Physics.Arcade.Body).setAllowGravity(gravity);
  }

  shockwave(x: number, y: number, damage: number, debuff?: Debuff): void {
    for (const dir of [-1, 1]) this.fire(x + dir * 8, y - 3, dir * 130, 0, 'wave', damage, false, debuff);
  }

  private explode(x: number, damage: number): void {
    const y = FLOOR_Y - 6;
    sfx('explode');
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
      // Cu Chulainn's cursed wounds do not close.
      if (this.time.now < (e.getData('bleedUntil') ?? 0)) continue;
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
    // From ELITE.twoAffixFrom an elite carries two different affixes, each on its own timer.
    const [affix, second] = Phaser.Utils.Array.Shuffle(Object.keys(ELITE_AFFIXES) as EliteAffix[]);
    const two = this.cfg.round >= ELITE.twoAffixFrom;
    e.setScale(ELITE.scale).setData({
      elite: affix,
      eliteNext: this.time.now + 2500,
      elite2: two ? second : undefined,
      elite2Next: this.time.now + 3700,
    });
    if (!announce) return;
    this.elite = e;
    const names = two ? `${ELITE_AFFIXES[affix].name}+${ELITE_AFFIXES[second].name}` : ELITE_AFFIXES[affix].name;
    this.eliteTitle = text(this, W / 2, 14, `ELIT ${ENEMIES[kind].name} ${names}`, COLOR.gold, 7).setOrigin(0.5, 0);
  }

  /** Mini boss affix attacks: fire/ice rings, lightning strikes at the player, or minions. */
  private eliteAct(e: Enemy, time: number): void {
    for (const key of ['elite', 'elite2'] as const) {
      const affix = e.getData(key) as EliteAffix | undefined;
      if (!affix || time < (e.getData(`${key}Next`) as number)) continue;
      e.setData(`${key}Next`, time + ELITE_AFFIXES[affix].every * this.pace);
      this.eliteAffix(e, affix);
    }
  }

  private eliteAffix(e: Enemy, affix: EliteAffix): void {
    const a = ELITE_AFFIXES[affix];
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
    // A ring of 10, turned a little each time so the gaps move.
    const turn = Math.random() * Math.PI;
    for (let i = 0; i < 10; i++) {
      const ang = turn + (i / 10) * Math.PI * 2;
      this.fire(e.x, e.y, Math.cos(ang) * 105, Math.sin(ang) * 105, texture, Math.round(e.damage * 0.6), false, a.debuff);
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
        'panahBintang',
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

  slam(x: number, y: number, radius: number, speed: number): void {
    for (const t of this.hittables()) {
      if (t instanceof Boss || Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius) continue;
      // The knockback stun keeps the enemy from walking or flying out of the fall.
      t.knockback(0, speed);
      t.setVelocity(0, speed);
    }
  }

  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource, status?: Status): void {
    if (this.over) return;
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xfff1e8).setDepth(12);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
    for (const t of this.hittables()) {
      // An earlier hit in this blast may have killed it (or chained into it).
      if (!t.active || Phaser.Math.Distance.Between(x, y, t.x, t.y) > radius) continue;
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

  strike(t: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean, status?: Status, knockback = 120): void {
    if (this.over || !t.active) return;
    this.attack(t as Hittable, mult, source, knockback, crit);
    this.applyStatus(t as Hittable, status);
  }

  afflict(t: Phaser.GameObjects.Sprite, status: Status): void {
    if (!this.over && t.active) this.applyStatus(t as Hittable, status);
  }

  hostiles(): Phaser.Physics.Arcade.Image[] {
    return (this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]).filter((h) => h.active);
  }

  /** The class passive's hooks, with what they may touch. */
  private get passive() {
    return PASSIVES[this.cls];
  }

  private get pctx(): PassiveCtx {
    return { p: this.player, world: this, scene: this };
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
    if (!(s.getData('shot') as ShotSpec).spin) s.setRotation(Phaser.Math.Angle.Between(p.x, p.y, s.x, s.y));
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
    // Read before a destroy below drops the body.
    const vx = (shot.body as Phaser.Physics.Arcade.Body).velocity.x;
    if (spec.returning && !spec.pierce) shot.setData('back', true);
    else if (!spec.pierce) shot.destroy();
    // The blow comes from behind the shot along its flight (a fast shot may already overlap the target's center).
    this.attack(t, spec.mult, spec.source, spec.knockback ?? 80, false, shot.x - Math.sign(vx) * 8, shot.y);
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
      if (!t.active || this.player.hitThisSwing.has(t)) continue;
      const b = t.body as Phaser.Physics.Arcade.Body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(box, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) continue;
      this.player.hitThisSwing.add(t);
      this.attack(t, move.dmg, 'basic', move.knockback);
      this.applyStatus(t, move.status);
      // Launchers throw small fry into the air (not bosses or elites, which are too heavy).
      if (move.launch && t.active && t instanceof Enemy && !t.getData('elite')) t.setVelocityY(-move.launch);
      // The weapon's own on-hit mechanic (Lightning Lord's STATIK).
      if (t.active) SKILLS[this.weaponId].onHit?.({ p: this.player, world: this, scene: this, power: this.stats.skillPower }, t);
      // Ashura phantom arms: golden fists fly in from beside the player, each a follow-up hit for 40%.
      for (let i = 1; i <= (move.extra ?? 0); i++) this.phantomFist(t, move.dmg * 0.4, 70 * i);
      if (move.anim === 'overhead') this.cameras.main.shake(80, 0.008);
      const cut = move.cut ?? this.player.weapon.cut;
      if (cut) cutMark(this, t.x, t.y, cut);
      if (this.player.weapon.impact) burst(this, t.x, t.y, this.player.weapon.impact, 6);
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
    if (!t.active) return;
    const st = this.stats;
    if (source !== 'ult' && t instanceof Enemy && t.blocks(fromX, fromY)) {
      mult *= 0.2;
      knockback = 0;
      floatText(this, t.x, t.y - 18, 'TAHAN', COLOR.gray);
      burst(this, t.x + Math.sign(fromX - t.x) * 5, t.y, 0xffa300, 4);
    }
    // The class passive may sharpen this hit (marked prey, a drawn iai, a gravity well).
    const mod = this.passive.modify?.(this.pctx, t, source);
    if (mod?.mult) mult *= mod.mult;
    const crit =
      forceCrit || !!mod?.crit || (source === 'basic' && st.dashCrit > 0 && this.player.takeDashCrit()) || Math.random() < st.critChance;
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
    const heft = t instanceof Boss ? 'boss' : t.getData('elite') ? 'elite' : undefined;
    const killed = this.damage(t, dmg, crit ? COLOR.gold : COLOR.text, knockback, fromX);
    this.hitstop(hitstopMs({ source, crit, killed, knockback, big: heft }));
    // Passive procs never feed passives again (no loops).
    if (source !== 'proc') this.passive.onHit?.(this.pctx, t, { source, crit, killed, dmg });
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

  /** Freeze clock, tweens and physics for a blink; `update` lets go once the game-loop time passes `hitstopUntil`. */
  private hitstop(ms: number): void {
    const now = this.game.loop.time;
    if (!ms || this.paused || this.over || now < this.hitstopReady) return;
    this.hitstopUntil = now + ms;
    this.hitstopReady = this.hitstopUntil + HITSTOP.gap;
    this.time.paused = true;
    this.tweens.pauseAll();
    this.physics.pause();
  }

  /** A slain small fry tumbles away from the blow and fades: only a picture, the enemy itself is already gone. */
  private fling(t: Enemy, dir: number, knockback: number): void {
    // A pulling blow (negative knockback) throws the body toward the player instead.
    const s = knockback < 0 ? -dir : dir;
    const d = 16 + Math.min(Math.abs(knockback), 300) / 10;
    const body = this.add
      .image(t.x, t.y, t.texture.key, t.frame.name)
      .setScale(t.scaleX, t.scaleY)
      .setFlipX(t.flipX)
      .setDepth(t.depth)
      .setTint(0xc2c3c7);
    this.tweens.add({
      targets: body,
      x: { value: Phaser.Math.Clamp(t.x + s * d, 4, W - 4), ease: 'Quad.Out' },
      y: { value: t.y - 10 - d / 4, ease: 'Sine.Out', yoyo: true, duration: 220 },
      angle: s * 300,
      alpha: { value: 0, ease: 'Quad.In' },
      duration: 440,
      onComplete: () => body.destroy(),
    });
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
  /** `fromX`: where the blow comes from; the target is pushed (and a corpse flung) away from it. */
  private damage(t: Hittable, dmg: number, color: string, knockback: number, fromX = this.player.x): boolean {
    // Dead (or dying: see setActive below) targets take no more hits, so nothing dies twice.
    if (!t.active) return false;
    t.hp -= dmg;
    sfx('hit');
    floatText(this, t.x, t.y - 10, `${dmg}`, color);
    const execute = t instanceof Boss || t.getData('elite') ? this.stats.execute / 2 : this.stats.execute;
    if (t.hp > 0 && t.hp <= t.maxHp * execute) {
      t.hp = 0;
      floatText(this, t.x, t.y - 20, 'EKSEKUSI', COLOR.red);
    }
    flash(t, 0xffffff, t instanceof Boss ? t.baseTint : 0xffffff);
    burst(this, t.x, t.y, 0xfff1e8, 4);
    // Away from the blow (a blast behind the target throws it toward the player); straight on, away from the player.
    const dir = Math.sign(t.x - fromX) || Math.sign(t.x - this.player.x) || this.player.facing;
    // No push at 0 (burn ticks, blocked hits) so the enemy keeps its own movement.
    // Mini bosses shrug off most of the push; bosses only jolt.
    if (t instanceof Boss) {
      if (knockback) t.flinch(dir);
    } else if (knockback) t.knockback(dir, t.getData('elite') ? knockback * 0.3 : knockback);
    if (t.hp > 0) return false;
    // Out of play from here on: kill effects below (onKill bursts, kill bolts) must not find and hit it again.
    t.setActive(false);
    sfx(t instanceof Boss ? 'bossKill' : 'kill');
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
      sfx('coin');
      floatText(this, t.x, t.y - 30, `+${ELITE.coins} KOIN`, COLOR.gold);
      burst(this, t.x, t.y, 0xffec27, 16);
      this.cameras.main.shake(200, 0.012);
    }
    if (this.stats.healOnKill) this.player.heal(this.stats.healOnKill);
    // Any death counts for the passive (burn ticks and passive procs too); the target is still readable here.
    if (!this.over) this.passive.onKill?.(this.pctx, t);
    if (Math.random() < this.stats.goldChance) {
      this.coins++;
      sfx('coin');
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
      this.fling(t, dir, knockback);
      // Big slime splits in two: spawned now (not a capped summon), so the round cannot count as cleared in between.
      if (t.kind === 'splitter') for (const dx of [-8, 8]) this.spawnEnemy('slime', Phaser.Math.Clamp(t.x + dx, 16, W - 16), t.y - 6);
    }
    t.destroy();
    return true;
  }

  private hurtPlayer(dmg: number, fromX: number, source?: Hittable, debuff?: Debuff): void {
    if (this.over || this.cleared) return;
    // The passive may turn the hit away entirely (God Hand, crow substitution, Susanoo).
    if (!this.player.invulnerable && this.passive.guard?.(this.pctx, dmg, fromX, source)) return;
    const result = this.player.hurt(dmg, fromX);
    this.passive.onAttacked?.(this.pctx, result, source);
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
      sfx('revive');
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
    sfx('revive');
    burst(this, this.player.x, this.player.y, 0xffa300, 24);
    this.cameras.main.flash(300, 255, 163, 0);
    floatText(this, this.player.x, this.player.y - 16, 'BANGKIT!', COLOR.gold);
    this.drawInventory();
  }

  /** Colliders and hit checks for a boss on the field. */
  private wireBoss(boss: Boss): void {
    this.physics.add.collider(boss, this.floorBody);
    this.physics.add.overlap(
      this.player,
      boss,
      () => boss.active && !boss.untargetable && !this.frozen(boss) && this.hurtPlayer(boss.damage, boss.x, boss),
    );
    this.physics.add.overlap(this.shots, boss, (a, b) => this.shotHit(a, b));
  }

  /**
   * A hidden boss crashes into the round: its own entrance cinematic (the player cannot be hurt while it plays), then
   * it joins the fight with its own HP bar. It is as strong as a lone bonus boss of the coming tier.
   */
  private invade(kind: SpecialBoss): void {
    this.invading = true;
    // Opposite side from the player, so it does not land on them.
    const x = this.player.x < W / 2 ? W - 60 : 60;
    const ms = INTROS[kind](this, x);
    invasionBanner(this, BOSSES[kind].name, ms);
    this.player.invuln(ms + 800);
    playMusic('special');
    sfx('boss');
    this.time.delayedCall(ms, () => {
      if (this.over) return;
      const boss = new Boss(this, this, x, FLOOR_Y - 40, specialConfig(this.cfg.round, [kind]), kind);
      this.bosses.push(boss);
      this.wireBoss(boss);
      this.bossHud.push({ boss, title: text(this, W / 2, 14 + this.bossHud.length * 17, boss.title, COLOR.red).setOrigin(0.5, 0) });
      this.invaded = kind;
      this.invasion = undefined;
    });
  }

  private clearRound(): void {
    this.cleared = true;
    sfx('clear');
    playMusic('run');
    const heal = this.cfg.boss || this.invaded ? this.stats.maxHp : Math.round(this.stats.maxHp * 0.25);
    this.player.heal(heal);
    floatText(this, this.player.x, this.player.y - 16, `+${heal} HP`, COLOR.red);
    const sp = this.cfg.specials ?? (this.invaded ? [this.invaded] : undefined);
    const msg = this.bossLeft
      ? 'BERTAHAN HIDUP!'
      : sp
        ? sp.length > 1
          ? ['', '', 'KEDUANYA TUMBANG!', 'KETIGANYA TUMBANG!', 'KEEMPATNYA TUMBANG!'][sp.length]
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
   * A bonus round pays like the boss one tier past the coming one per special boss, one more each with Godzilla and
   * Kaguya; an elite
   * round like the coming boss. Outlasting Mahoraga (it left) pays like a normal round.
   */
  private get rewardRound(): number {
    const sp = this.cfg.specials ?? (this.invaded ? [this.invaded] : undefined);
    if (this.cfg.eliteRound) return (Math.floor(this.cfg.round / BOSS_EVERY) + 1) * BOSS_EVERY;
    if (!sp || this.bossLeft) return this.cfg.round;
    const tier = this.cfg.bossTier || Math.max(1, Math.ceil(this.cfg.round / BOSS_EVERY));
    return (tier + sp.length + (sp.includes('godzilla') ? 1 : 0) + (sp.includes('kaguya') ? 1 : 0)) * BOSS_EVERY;
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
    const full = this.items.length >= MAX_ITEMS;
    ui.add(text(this, 20, REWARD_Y - 16, `RELIK ${this.items.length}/${MAX_ITEMS}`, full ? COLOR.red : COLOR.gray));
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
    const refresh = text(
      this,
      W / 2,
      skipY + 14,
      `${padConnected() ? 'D-PAD PILIH  A AMBIL  Y' : 'W/S PILIH  J AMBIL  R'} REFRESH ${cost}`,
      this.coins >= cost ? COLOR.blue : COLOR.gray,
    )
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

  /**
   * Relic slots full: list the owned items (plus a cancel row); the chosen one is discarded for `this.replacing`.
   * Same rows and keys as the reward panel (W/S, J, tap), so keyboard, touch and controller all work.
   */
  private buildReplaceUi(): void {
    this.rewardUi?.destroy();
    const ui = this.add.container(0, 0).setDepth(200);
    const neu = this.replacing!;
    ui.add(this.add.rectangle(W / 2, H / 2 + 12, 290, 146, 0x000000, 0.85).setStrokeStyle(1, 0x83769c));
    ui.add([
      text(this, W / 2, 33, `RELIK PENUH ${this.items.length}/${MAX_ITEMS}`, COLOR.red).setOrigin(0.5, 0),
      text(this, W / 2, 43, `GANTI: ${ITEMS[neu].name}`, RARITY_COLOR[ITEMS[neu].rarity]).setOrigin(0.5, 0),
    ]);
    const rowY = (i: number) => 55 + i * 10;
    const row = (i: number) =>
      this.add
        .zone(W / 2, rowY(i) + 4, 280, 10)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.rewardSel = i;
          this.takeReward();
        });
    this.items.forEach((id, i) => {
      const y = rowY(i);
      ui.add([
        row(i),
        text(this, 20, y, '>', COLOR.gold).setName(`sel${i}`),
        this.add.image(34, y + 4, `i_${id}`),
        text(this, 44, y, ITEMS[id].name, RARITY_COLOR[ITEMS[id].rarity]),
        text(this, W - 20, y, this.items.includes(pairOf(id).partner) ? 'SET' : '', COLOR.gold).setOrigin(1, 0),
      ]);
    });
    const back = this.items.length;
    ui.add([
      row(back),
      text(this, 20, rowY(back), '>', COLOR.gold).setName(`sel${back}`),
      text(this, 44, rowY(back), 'BATAL (KEMBALI)', COLOR.gray),
      text(this, 20, 147, '', COLOR.gray).setName('setName'),
      text(this, 20, 157, '', COLOR.red).setName('setDesc'),
      text(this, W / 2, 166, padConnected() ? 'D-PAD PILIH  A BUANG' : 'W/S PILIH  J BUANG', COLOR.blue).setOrigin(0.5, 0),
    ]);
    this.rewardUi = ui;
    this.refreshRewards();
  }

  /** Spend coins to roll a new set of rewards; each refresh on the same panel costs 1 more. */
  private reroll(): void {
    if (!this.rewards || this.paused || this.replacing) return;
    const cost = rerollCost(this.rerolls);
    if (this.coins < cost) {
      sfx('deny');
      this.cameras.main.shake(80, 0.005);
      floatText(this, W / 2, REWARD_Y - 24, 'KOIN KURANG', COLOR.red);
      return;
    }
    this.coins -= cost;
    sfx('coin');
    this.rerolls++;
    this.rewards = rollRewards(this.rewardRound, [...this.items, ...this.spent]);
    this.buildRewardUi();
  }

  private moveReward(d: number): void {
    if (!this.rewards) return;
    sfx('move');
    this.rewardSel = Phaser.Math.Wrap(this.rewardSel + d, 0, this.rewardRows);
    this.refreshRewards();
  }

  /** Rows of the open panel: three rewards + skip, or the owned items + cancel in the replace step. */
  private get rewardRows(): number {
    return this.replacing ? this.items.length + 1 : SKIP_ROW + 1;
  }

  private refreshRewards(): void {
    for (let i = 0; i < this.rewardRows; i++) {
      (this.rewardUi?.getByName(`sel${i}`) as Phaser.GameObjects.Text | null)?.setVisible(i === this.rewardSel);
    }
    // Set info of the highlighted item: its partner and the bonus both give.
    const name = this.rewardUi?.getByName('setName') as Phaser.GameObjects.Text | null;
    const desc = this.rewardUi?.getByName('setDesc') as Phaser.GameObjects.Text | null;
    const r = this.rewards?.[this.rewardSel];
    if (!name || !desc) return;
    if (this.replacing) {
      // Replace step: what the highlighted item does, and the set that breaks without it.
      const id = this.items[this.rewardSel];
      name.setText(id ? ITEMS[id].desc : '');
      desc.setText(id && this.items.includes(pairOf(id).partner) ? `SET ${pairOf(id).pair.name} PUTUS` : '');
      return;
    }
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
    let drop: number | undefined;
    let r: Reward | undefined;
    if (this.replacing) {
      const id = this.replacing;
      this.replacing = undefined;
      // Cancel row: back to the rewards, on the item that was picked.
      if (this.rewardSel >= this.items.length) {
        sfx('back');
        this.rewardSel = Math.max(
          0,
          this.rewards.findIndex((x) => x.type === 'item' && x.id === id),
        );
        return this.buildRewardUi();
      }
      drop = this.rewardSel;
      r = { type: 'item', id };
    } else {
      r = this.rewardSel === SKIP_ROW ? undefined : this.rewards[this.rewardSel];
      // All relic slots taken: first choose which owned item makes room. Potions never need a slot.
      if (r?.type === 'item' && !takeItem(this.items, r.id)) {
        sfx('move');
        this.replacing = r.id;
        this.rewardSel = 0;
        return this.buildReplaceUi();
      }
    }
    this.rewards = undefined;
    this.rewardUi?.destroy();
    // The J/W presses used in the menu must not leak into a swing or jump.
    this.input.keyboard!.resetKeys();
    sfx(r ? 'reward' : 'back');
    if (r) this.applyReward(r, drop);
    else floatText(this, this.player.x, this.player.y - 16, 'DILEWATI', COLOR.gray);
    this.openPortal();
  }

  /** `drop`: index of the owned item discarded to make room (it may be offered again later). */
  private applyReward(r: Reward, drop?: number): void {
    const oldMax = this.stats.maxHp;
    if (r.type === 'potion') this.player.heal(Math.round(this.stats.maxHp * 0.5));
    const dropped = drop === undefined ? undefined : this.items[drop];
    if (r.type === 'item') this.items = takeItem(this.items, r.id, drop) ?? this.items;
    const completes = r.type === 'item' && this.items.includes(pairOf(r.id).partner);
    this.player.equip(this.currentStats(), WEAPONS[this.weaponId]);
    if (this.stats.maxHp > oldMax) this.player.heal(this.stats.maxHp - oldMax);
    floatText(this, this.player.x, this.player.y - 16, rewardInfo(r).name, COLOR.gold);
    if (dropped) floatText(this, this.player.x, this.player.y - 40, `BUANG ${ITEMS[dropped].name}`, COLOR.gray);
    if (completes && r.type === 'item') {
      floatText(this, this.player.x, this.player.y - 28, `SET ${pairOf(r.id).pair.name}!`, COLOR.gold);
      sfx('set');
      this.cameras.main.flash(200, 255, 236, 39);
    }
    this.drawInventory();
  }

  private openPortal(): void {
    sfx('portal');
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
    const eliteRound = !specials.length && rollEliteRound(round);
    this.scene.restart({
      round,
      specials,
      eliteRound,
      invasion: specials.length || eliteRound ? undefined : rollInvasion(round),
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
    stopMusic();
    sfx('gameover');
    text(this, W / 2, H / 2 - 10, 'GUGUR', COLOR.red, 16).setOrigin(0.5);
    this.time.delayedCall(1500, () => {
      this.scene.start('hub', { died: true, round: this.cfg.round, runSouls: this.runSouls } satisfies HubData);
    });
  }

  private togglePause(): void {
    if (this.over) return;
    this.paused = !this.paused;
    this.time.paused = this.paused;
    sfx('pause');
    duckMusic(this.paused);
    if (this.paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
    if (this.paused) this.physics.pause();
    else this.physics.resume();
    this.showPauseText();
  }

  private showPauseText(): void {
    const sets = activePairs(this.items).map((p) => p.name);
    const sound = `${padConnected() ? 'Y' : 'M'} ${soundLabel()}`;
    this.pauseText
      .setText(
        [
          'PAUSE',
          '',
          `PASIF: ${CLASSES[this.cls].passive.name}`,
          `${padConnected() ? 'BAWAH+X' : 'S+J'} DI UDARA: MENUKIK`,
          `TAHAN ${padConnected() ? 'X' : 'J'}: ${CHARGED[this.cls].name}`,
          CHARGED[this.cls].desc,
          '',
          ...(sets.length ? ['SET AKTIF:', ...sets, ''] : []),
          pauseHint(),
          sound,
        ].join('\n'),
      )
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
    this.ultText = text(this, 76, 12, '', COLOR.gold);
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
    this.pauseText = text(this, W / 2, H / 2, `PAUSE\n\n${pauseHint()}`, COLOR.text)
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(W - 28)
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
    this.ultText.setText(p.awakened ? 'AVENGER' : padConnected() ? 'RB ULTI!' : 'I ULTI!').setVisible(ultFull || p.awakened);
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
