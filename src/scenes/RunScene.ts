import Phaser from 'phaser';
import { ambience, groundDecor } from '../gfx/scenery.ts';
import type { Arena, HitSource, PlayerWorld, ShotSpec } from '../entities/arena.ts';
import { Boss } from '../entities/Boss.ts';
import { INTROS, invasionBanner } from '../entities/invasions.ts';
import { createEnemy, Enemy } from '../entities/Enemy.ts';
import { Player } from '../entities/Player.ts';
import { ring, SKILLS, sparks } from '../entities/skills.ts';
import { CHARGED } from '../entities/charged/index.ts';
import { PASSIVES, type PassiveCtx } from '../entities/passives.ts';
import { SUPPORTS, type Support, type SupportCtx } from '../entities/supports.ts';
import { SIGNATURES } from '../entities/signatures.ts';
import { padConnected } from '../gamepad.ts';
import { duckMusic, playMusic, sfx, soundLabel, stopMusic, toggleSound } from '../audio.ts';
import { COLOR, PALETTE } from '../gfx/sprites.ts';
import { burst, cutMark, flash, floatText, FLOOR_Y, H, text, TILE, W } from '../gfx/ui.ts';
import {
  activeTiers,
  ITEM_TAGS,
  ITEMS,
  MAX_ITEMS,
  RARITY_COLOR,
  takeItem,
  rewardInfo,
  rewardRarity,
  rollHeroes,
  rollRewards,
  rollShop,
  coinReward,
  rerollCost,
  runStats,
  HITSTOP,
  hitstopMs,
  tagCounts,
  TAG_TIERS,
  TAGS,
  tierOf,
  TIER_MARK,
  ULT_GAIN,
  WEAPONS,
  type ItemId,
  type Move,
  type Reward,
  type Status,
  type Tag,
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
  CURSE,
  GATES,
  isBossRound,
  rollGates,
  rollSpecials,
  rollInvasion,
  type Gate,
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
  /** The door taken into this round: what it pays when cleared (and KUTUKAN's curse while it lasts). */
  gate?: Gate;
  /** The second hero of the party, off the field until swapped in (U). */
  bench?: ClassId;
  /** NYAWA KEDUA already spent this run. */
  revived?: boolean;
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
/** Asleep (Oberon's sleep dust): dimmed into the blue of a dream. */
const SLEEP_TINT = 0x8a90c8;
/** Top speed (px/s) of a slowed enemy or boss; falling stays normal. */
const CHILL_SPEED = 30;
const NO_CAP = 10000;
const REWARD_Y = 56;
const REWARD_H = 24;
/** Shop panels have more rows: smaller and starting higher. */
const SHOP_Y = 46;
const SHOP_H = 16;
/** Time between hero swaps (ms). */
const SWAP_MS = 6000;
/** DARAH II: chance a kill leaves a blood orb, the share of max HP it heals, how long it lies there (ms). */
const BLOOD_ORB = { chance: 0.4, heal: 0.04, ms: 7000 } as const;
/** ARCANA II: empowered basic hits after a skill, and their damage multiplier. */
const SPELLBLADE = { hits: 3, mult: 1.6 } as const;
/** PETIR II: every n-th basic hit calls the strike. */
const STORM_EVERY = 5;

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
  /** Doors out of a cleared round (one when a boss is next), each with the gate it leads to. */
  private doors: { img: Phaser.Physics.Arcade.Image; gate?: Gate }[] = [];
  private doorsArmAt = 0;
  /** Bonus bosses already rolled for the next round (the door shows them). */
  private nextSpecials: SpecialBoss[] = [];
  private gate: Gate = 'item';
  /** Relic slots this run (MAX_ITEMS + SLOT RELIK perk). */
  private slots = MAX_ITEMS;
  /** The party's second hero (class), its Player once it has been on the field this round, and the swap cooldown. */
  private bench?: ClassId;
  private benchPlayer?: Player;
  private swapReadyAt = 0;
  private benchIcon?: Phaser.GameObjects.Image;
  /** Per-round state of each DUKUNGAN / PASIF II in play, by `kind:class` (dropped when that hero leaves its slot). */
  private supportState: Record<string, Record<string, unknown>> = {};
  /** KUTUKAN kills still needed to lift the curse (0 = not cursed). */
  private curseLeft = 0;
  private revived = false;
  /** Tag mechanics: PETIR's hit counter, ARCANA's empowered hits left, BESI's quake cooldown, DARAH's orbs. */
  private stormHits = 0;
  private spellCharges = 0;
  private quakeReady = 0;
  private orbs: { obj: Phaser.GameObjects.Container; until: number }[] = [];
  /** Open panel kind, and the shop rows already bought. */
  private panel: 'reward' | 'shop' | 'hero' = 'reward';
  private sold = new Set<number>();
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
  private platforms: Phaser.GameObjects.GameObject[] = [];
  private over = false;
  private paused = false;
  private rewards?: Reward[];
  private rewardSel = 0;
  /** Replace step of the reward panel: the item waiting for a relic slot (and its row, for the shop). */
  private replacing?: ItemId;
  private replacingRow = 0;
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
    this.rewards = this.rewardUi = this.inventory = this.elite = this.eliteTitle = this.replacing = undefined;
    this.doors = [];
    this.nextSpecials = [];
    this.gate = data.gate ?? 'item';
    this.slots = MAX_ITEMS + this.save.perks.slot;
    this.bench = data.bench;
    this.benchPlayer = this.benchIcon = undefined;
    this.swapReadyAt = this.stormHits = this.spellCharges = this.quakeReady = 0;
    this.orbs = [];
    this.supportState = {};
    this.curseLeft = this.gate === 'kutukan' && !this.cfg.boss ? CURSE.kills : 0;
    this.revived = !!data.revived;
    this.panel = 'reward';
    this.sold = new Set();
    if (data.round > this.save.bestRound) {
      this.save.bestRound = data.round;
      writeSave(this.save);
    }

    this.add.image(0, 0, 'bg').setOrigin(0);
    ambience(this);
    // World floor = ground top: anything that tunnels through the thin floor body is still stopped here.
    this.physics.world.setBounds(0, -100, W, FLOOR_Y + 100);
    this.physics.world.setBoundsCollision(true, true, false, true);

    const floor = this.solid(0, FLOOR_Y, W, TILE, 'ground');
    this.floorBody = floor;
    this.add
      .tileSprite(0, FLOOR_Y + TILE, W, H - FLOOR_Y - TILE, 'dirt')
      .setOrigin(0)
      .setDepth(2);
    groundDecor(this);
    const layout = this.cfg.boss ? BOSS_LAYOUT : Phaser.Utils.Array.GetRandom([...LAYOUTS]);
    const platforms = layout.map((p) => {
      const body = this.solid(p.x * TILE, p.y * TILE, p.w * TILE, 4, 'plat').body as Phaser.Physics.Arcade.StaticBody;
      // One-way: land from above, pass through from below and the sides.
      body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
      return body.gameObject;
    });

    const stats = this.currentStats();
    // God Hand (Heracles): one count per round for the party, only usable while he is the one on the field.
    this.godHandLeft = Math.max(stats.godHand, this.bench ? this.heroStats(this.bench).godHand : 0);
    this.platforms = platforms;
    this.enemies = this.physics.add.group();
    this.hazards = this.physics.add.group({ allowGravity: false });
    this.shots = this.physics.add.group({ allowGravity: false });
    this.player = new Player(this, this, 24, FLOOR_Y - 10, stats, WEAPONS[this.weaponId], data.hp ?? stats.maxHp, data.ult ?? 0, this.cls);
    this.wirePlayer(this.player);

    // Phaser may pass (floor, enemy) here, so find the enemy in either slot.
    this.physics.add.collider(this.enemies, [floor, ...platforms], undefined, (a, b) => !(a instanceof Enemy ? a : (b as Enemy)).flying);
    this.physics.add.overlap(this.shots, this.enemies, (a, b) => this.shotHit(a, b));
    // Item tags that answer the hero's own moves (BAYANG's shadow on a dash, ARCANA's charged blade on a cast).
    const onDash = (p: Player) => {
      if (this.stats.shadowClone) this.shadowClone(p.x, p.y, p);
      for (const { sup, c } of this.effects) sup.onDash?.(c);
    };
    const onJump = () => {
      for (const { sup, c } of this.effects) sup.onJump?.(c);
    };
    const onAttack = (m: Move) => {
      for (const { sup, c } of this.effects) sup.onAttack?.(c, m);
    };
    const onCast = (kind: 'skill' | 'fusion' | 'ult') => {
      for (const { sup, c } of this.effects) sup.onCast?.(c, kind);
      if (!this.stats.spellblade || kind === 'ult') return;
      this.spellCharges = SPELLBLADE.hits;
      ring(this, this.player.x, this.player.y, 0xc080ff, 3, 18, 260);
      sparks(this, this.player.x, this.player.y, [0xc080ff, 0xfff1e8], 8, 14);
    };
    this.events.on('hero-dash', onDash);
    this.events.on('hero-cast', onCast);
    this.events.on('hero-jump', onJump);
    this.events.on('hero-attack', onAttack);
    this.events.once('shutdown', () => {
      this.events.off('hero-attack', onAttack);
      this.events.off('hero-jump', onJump);
      this.events.off('hero-dash', onDash);
      this.events.off('hero-cast', onCast);
    });

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
      if (this.curseLeft) {
        this.cameras.main.flash(400, 126, 37, 83);
        const intro = text(this, W / 2, 44, 'KUTUKAN!', COLOR.red, 16).setOrigin(0.5);
        const sub = text(this, W / 2, 56, `DAMAGE DITERIMA X${CURSE.taken} SAMPAI ${CURSE.kills} KILL`, COLOR.red, 6).setOrigin(0.5);
        this.tweens.add({
          targets: [intro, sub],
          alpha: 0,
          delay: 1800,
          duration: 500,
          onComplete: () => [intro, sub].forEach((o) => o.destroy()),
        });
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
    kb.on('keydown-U', () => this.swap());
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
    // The benched hero stays out of sight whatever its leftover effects do to it.
    this.benchPlayer?.hideGear();
    if (this.rewards) {
      this.player.setVelocityX(0);
      return;
    }
    this.player.update(time);
    this.tickOrbs(time);
    if (!this.cleared) this.passive.tick?.(this.pctx, time, delta);
    if (!this.cleared) for (const { sup, c } of this.effects) sup.tick?.(c, time, delta);
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
    if (time >= this.doorsArmAt) for (const d of this.doors) if (this.physics.overlap(this.player, d.img)) return this.nextRound(d.gate);
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

  /** Stats of a party hero with its own weapon. */
  private heroStats(cls: ClassId): Derived {
    return runStats(this.base, WEAPONS[CLASSES[cls].weapon], this.items, cls);
  }

  /** Floor, platforms, and what hurts the hero (each hero of the party gets its own; a benched one has no body). */
  private wirePlayer(p: Player): void {
    this.physics.add.collider(p, this.floorBody);
    this.physics.add.collider(p, this.platforms, undefined, () => this.time.now >= p.dropUntil);
    this.physics.add.overlap(p, this.enemies, (_p, e) => {
      const en = e as Enemy;
      const affix = en.getData('elite') as EliteAffix | undefined;
      const debuff = (affix && ELITE_AFFIXES[affix].debuff) ?? ENEMIES[en.kind].debuff;
      if (!en.untargetable && !this.frozen(en)) this.hurtPlayer(en.damage, en.x, en, debuff);
    });
    this.physics.add.overlap(p, this.hazards, (_p, h) => {
      const hz = h as Phaser.Physics.Arcade.Image;
      this.hurtPlayer(hz.getData('dmg') as number, hz.x, undefined, hz.getData('debuff') as Debuff | undefined);
      if (hz.texture.key !== 'wave') hz.destroy();
    });
    for (const boss of this.bosses) this.wireBossTo(p, boss);
  }

  /**
   * Hero swap (Skul): the benched hero bursts in with its own class dash and an entrance blow in its color; HP keeps
   * its share of max HP, the ult meter carries over. The one leaving goes to sleep and takes its passive with it.
   */
  private swap(): void {
    const out = this.player;
    if (!this.bench || this.rewards || this.paused || this.over || out.hp <= 0) return;
    const now = this.time.now;
    if (now < this.swapReadyAt || out.busy) {
      sfx('deny');
      return;
    }
    const cls = this.bench;
    const weapon = WEAPONS[CLASSES[cls].weapon];
    const stats = this.heroStats(cls);
    const hp = Math.max(1, Math.round((out.hp / out.stats.maxHp) * stats.maxHp));
    let p = this.benchPlayer;
    if (p) p.equip(stats, weapon);
    else {
      p = new Player(this, this, out.x, out.y, stats, weapon, hp, out.ult, cls);
      this.wirePlayer(p);
    }
    p.hp = hp;
    p.ult = out.ult;
    out.sleep();
    this.benchPlayer = out;
    this.bench = this.cls;
    this.cls = cls;
    this.weaponId = weapon.id;
    this.player = p;
    // The one leaving the field takes its PASIF II with it; its DUKUNGAN keeps working from the bench.
    this.dropSupport(`sig:${this.bench}`);
    out.body.setGravityY(0);
    p.wake(out.x, out.y, out.facing);
    this.swapReadyAt = now + SWAP_MS;
    this.spellCharges = 0;
    const color = PALETTE[CLASSES[cls].color];
    ring(this, p.x, p.y, color, 4, 34, 320, 2);
    ring(this, p.x, p.y, 0xfff1e8, 2, 20, 220);
    sparks(this, p.x, p.y, [color, 0xfff1e8], 12, 22);
    this.cameras.main.shake(90, 0.006);
    this.area(p.x, p.y, 30, 1.5, 160, 'skill');
    const half = (CLASSES[cls].name.length + 1) * 4;
    floatText(this, Phaser.Math.Clamp(p.x, half, W - half), p.y - 22, CLASSES[cls].name, COLOR.gold);
    this.drawInventory();
  }

  /** A hero joins the party from a PAHLAWAN reward: the benched one (if any) leaves for it. */
  private recruit(cls: ClassId): void {
    const old = this.bench;
    this.benchPlayer?.destroy();
    this.benchPlayer = undefined;
    if (old) this.dropSupport(`sup:${old}`);
    this.bench = cls;
    this.godHandLeft = Math.max(this.godHandLeft, this.heroStats(cls).godHand);
    floatText(this, this.player.x, this.player.y - 28, old ? `${CLASSES[old].name} PERGI` : 'PARTAI 2 HERO!', COLOR.blue);
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
        'tombakCahaya',
        'batangCakra',
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
    // Asleep: held like frozen (half as long on bosses and elites); Oberon's passive wakes it on the next blow.
    if (s.sleep)
      t.setData('sleepUntil', Math.max(t.getData('sleepUntil') ?? 0, now + s.sleep * (t instanceof Boss || t.getData('elite') ? 0.5 : 1)));
  }

  private frozen(t: Hittable): boolean {
    const now = this.time.now;
    return now < (t.getData('freezeUntil') ?? 0) || now < (t.getData('sleepUntil') ?? 0);
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
      t.setTint(time < (t.getData('freezeUntil') ?? 0) ? ICE_TINT : SLEEP_TINT);
      return true;
    }
    if (t.getData('freezeUntil') || t.getData('sleepUntil')) {
      t.setData({ freezeUntil: 0, sleepUntil: 0 });
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

  /**
   * Hero techniques in play beside the class passive: the hero's own DUKUNGAN (on itself) and PASIF II, and the bench
   * hero's DUKUNGAN (on the hero on the field).
   */
  private get effects(): { sup: Support; c: SupportCtx }[] {
    const list: [string, ClassId, Support][] = [
      ['sup', this.cls, SUPPORTS[this.cls]],
      ['sig', this.cls, SIGNATURES[this.cls]],
    ];
    if (this.bench) list.push(['sup', this.bench, SUPPORTS[this.bench]]);
    return list.map(([kind, cls, sup]) => ({
      sup,
      c: {
        p: this.player,
        world: this,
        scene: this,
        bench: cls,
        self: cls === this.cls,
        s: (this.supportState[`${kind}:${cls}`] ??= {}),
        coins: (n: number) => {
          this.coins += n;
          sfx('coin');
        },
      },
    }));
  }

  /** One technique leaves play: its drawings go, its state starts over (the moon's lightness lets go too). */
  private dropSupport(key: string): void {
    const drop = (v: unknown) => {
      if (v instanceof Phaser.GameObjects.GameObject && !v.body) v.destroy();
    };
    for (const v of Object.values(this.supportState[key] ?? {})) {
      drop(v);
      if (v && typeof v === 'object' && !(v instanceof Phaser.GameObjects.GameObject)) Object.values(v).forEach(drop);
    }
    delete this.supportState[key];
    if (key === 'sup:candra') for (const p of [this.player, this.benchPlayer]) p?.body.setGravityY(0);
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
    spec.onHit?.(shot.x, shot.y, t);
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
    if (source !== 'ult' && t instanceof Enemy && t.blocks(fromX, fromY) && !this.effects.some((e) => e.sup.pierceGuard)) {
      mult *= 0.2;
      knockback = 0;
      floatText(this, t.x, t.y - 18, 'TAHAN', COLOR.gray);
      burst(this, t.x + Math.sign(fromX - t.x) * 5, t.y, 0xffa300, 4);
    }
    // The class passive may sharpen this hit (marked prey, a drawn iai, a gravity well).
    const mod = this.passive.modify?.(this.pctx, t, source);
    if (mod?.mult) mult *= mod.mult;
    // DUKUNGAN and PASIF II too (only the hero's own blows, never procs).
    let scrit = false;
    if (source !== 'proc') {
      for (const { sup, c } of this.effects) {
        const m = sup.modify?.(c, t, source);
        if (m?.mult) mult *= m.mult;
        scrit ||= !!m?.crit;
      }
    }
    mult *= this.tagMult(t, source);
    const crit =
      forceCrit ||
      !!mod?.crit ||
      scrit ||
      (source === 'basic' && st.dashCrit > 0 && this.player.takeDashCrit()) ||
      Math.random() < st.critChance;
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
    if (source !== 'proc') for (const { sup, c } of this.effects) sup.onHit?.(c, t, { source, crit, killed, dmg });
    if (source === 'basic' || source === 'skill') this.player.addUlt((ULT_GAIN[source] + (killed ? ULT_GAIN.kill : 0)) * st.ultGainMult);
    // PETIR II: every 5th basic hit, the sky answers.
    if (source === 'basic' && st.storm && ++this.stormHits % STORM_EVERY === 0) this.skyStrike(x, y);
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
    this.attack(t, 1.2 * (1 + this.stats.boltPower), 'proc', 60);
  }

  /**
   * Tag multipliers on one hit: API III (burning foes take more), ES II (a basic blow on ice shatters it), ARCANA II
   * (empowered blows after a skill), HARTA III (coins held). Side effects (the shatter, the spent charge) happen here.
   */
  private tagMult(t: Hittable, source: HitSource): number {
    const st = this.stats;
    const now = this.time.now;
    let k = 1;
    if (st.burnVuln && now < (t.getData('burnUntil') ?? 0)) k *= 1 + st.burnVuln;
    if (st.greed) k *= 1 + Math.min(0.4, this.coins * 0.01);
    if (source !== 'basic') return k;
    if (st.shatter && now < (t.getData('freezeUntil') ?? 0)) {
      k *= t instanceof Boss ? 1.5 : 2;
      // Truthy but past: statusTick lets go and clears the ice tint next frame.
      t.setData('freezeUntil', 1);
      this.shatterFx(t);
    }
    if (this.spellCharges > 0) {
      this.spellCharges--;
      k *= SPELLBLADE.mult;
      sparks(this, t.x, t.y, [0xc080ff, 0xff77a8, 0xfff1e8], 8, 14);
      ring(this, t.x, t.y, 0xc080ff, 2, 12, 200);
    }
    return k;
  }

  /** ES II: the ice bursts into shards that pin the enemies beside it. */
  private shatterFx(t: Hittable): void {
    const { x, y } = t;
    floatText(this, x, y - 22, 'PECAH!', '#29adff');
    sfx('block');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const shard = this.add
        .triangle(x, y, 0, 0, 2, 5, 4, 0, i % 2 ? 0xc2f0ff : 0x29adff)
        .setDepth(13)
        .setRotation(a + Math.PI / 2);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        alpha: 0,
        duration: 320,
        ease: 'Quad.Out',
        onComplete: () => shard.destroy(),
      });
    }
    for (const o of this.hittables())
      if (o !== t && Phaser.Math.Distance.Between(x, y, o.x, o.y) < 26) this.applyStatus(o, { freeze: 400 });
  }

  /** PETIR II: a bolt from the top of the screen onto (x, y), then it forks to the two nearest other enemies. */
  private skyStrike(x: number, y: number): void {
    const near = this.targets(x, y) as Hittable[];
    const first = near[0];
    if (!first || this.over) return;
    const g = this.add.graphics().setDepth(14);
    const jag = (x0: number, y0: number, x1: number, y1: number, w: number, c: number) => {
      g.lineStyle(w, c).beginPath().moveTo(x0, y0);
      for (let i = 1; i < 6; i++) g.lineTo(x0 + ((x1 - x0) * i) / 6 + Phaser.Math.Between(-4, 4), y0 + ((y1 - y0) * i) / 6);
      g.lineTo(x1, y1).strokePath();
    };
    jag(first.x, 0, first.x, first.y, 3, 0x83769c);
    jag(first.x, 0, first.x, first.y, 1, 0xffec27);
    burst(this, first.x, first.y, 0xffec27, 8);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    sfx('hit');
    const k = 1 + this.stats.boltPower;
    this.attack(first, 1.5 * k, 'proc', 80);
    for (const o of near.slice(1, 3)) {
      if (!o.active || Phaser.Math.Distance.Between(first.x, first.y, o.x, o.y) > 90) continue;
      const fork = this.add.graphics().setDepth(14).lineStyle(1, 0xffec27).lineBetween(first.x, first.y, o.x, o.y);
      this.tweens.add({ targets: fork, alpha: 0, duration: 220, onComplete: () => fork.destroy() });
      this.attack(o, 0.8 * k, 'proc', 50);
    }
  }

  /** BAYANG II: a shadow of the hero stays where the dash began and bursts a beat later. */
  private shadowClone(x: number, y: number, p: Player): void {
    const shade = this.add.image(x, y, p.texture.key).setFlipX(p.flipX).setTint(0x1d1d3a).setAlpha(0.85).setDepth(9);
    this.tweens.add({ targets: shade, alpha: 0.55, yoyo: true, repeat: 2, duration: 70 });
    this.time.delayedCall(420, () => {
      shade.destroy();
      if (this.over) return;
      ring(this, x, y, 0x83769c, 3, 26, 260, 2);
      sparks(this, x, y, [0x1d1d3a, 0x83769c, 0xfff1e8], 10, 18);
      this.area(x, y, 26, 1.2 * this.stats.dashPower, 140, 'proc');
    });
  }

  /** DARAH II: a drop of blood falls from the kill and heals whoever picks it up. */
  private dropOrb(x: number, y: number): void {
    const obj = this.add
      .container(x, y, [this.add.circle(0, 0, 3, 0x7e2553), this.add.circle(0, 0, 2, 0xff004d), this.add.rectangle(-1, -1, 1, 1, 0xffccaa)])
      .setDepth(6);
    this.tweens.add({ targets: obj, y: FLOOR_Y - 4, duration: 380, ease: 'Bounce.Out' });
    this.orbs.push({ obj, until: this.time.now + BLOOD_ORB.ms });
  }

  private tickOrbs(time: number): void {
    const p = this.player;
    this.orbs = this.orbs.filter(({ obj, until }) => {
      if (time >= until) return void obj.destroy();
      obj.setAlpha(until - time < 1500 && Math.floor(time / 100) % 2 ? 0.3 : 1);
      if (Phaser.Math.Distance.Between(p.x, p.y, obj.x, obj.y) > 14) return true;
      const amt = Math.max(2, Math.round(this.stats.maxHp * BLOOD_ORB.heal));
      p.heal(amt);
      floatText(this, p.x, p.y - 18, `+${amt}`, COLOR.red);
      sparks(this, obj.x, obj.y, [0xff004d, 0xffccaa], 6, 10);
      obj.destroy();
      return false;
    });
  }

  /** API II: a burning enemy that dies bursts into flame; the blast sets its neighbors alight (and may chain on). */
  private fireBurst(x: number, y: number): void {
    this.time.delayedCall(90, () => {
      if (this.over) return;
      ring(this, x, y, 0xffa300, 4, 28, 280, 2);
      sparks(this, x, y, [0xff004d, 0xffa300, 0xffec27], 14, 22);
      this.cameras.main.shake(70, 0.005);
      this.area(x, y, 28, 0.8, 120, 'proc', { burn: 0.15 });
    });
  }

  /** ES III: every kill breathes frost over the enemies around it. */
  private frostNova(x: number, y: number): void {
    ring(this, x, y, 0x29adff, 3, 30, 300, 2);
    ring(this, x, y, 0xc2f0ff, 2, 18, 220);
    for (const o of this.hittables()) if (Phaser.Math.Distance.Between(x, y, o.x, o.y) < 32) this.applyStatus(o, { freeze: 900 });
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
    // Item tags on a kill: API's burst from a burning body, ES's nova, DARAH's orb; KUTUKAN counts down.
    const burning = this.time.now < (t.getData('burnUntil') ?? 0);
    if (this.stats.burnBurst && burning) this.fireBurst(t.x, t.y);
    if (this.stats.frostNova) this.frostNova(t.x, t.y);
    if (this.stats.bloodOrb && !(t instanceof Boss) && Math.random() < BLOOD_ORB.chance) this.dropOrb(t.x, t.y);
    if (this.curseLeft && --this.curseLeft === 0) {
      floatText(this, this.player.x, this.player.y - 28, 'KUTUKAN LEPAS!', COLOR.gold);
      sparks(this, this.player.x, this.player.y, [0x7e2553, 0xfff1e8], 14, 20);
    }
    // Any death counts for the passive (burn ticks and passive procs too); the target is still readable here.
    if (!this.over) this.passive.onKill?.(this.pctx, t);
    if (!this.over) for (const { sup, c } of this.effects) sup.onKill?.(c, t);
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
    const effects = this.effects;
    if (!this.player.invulnerable && effects.some(({ sup, c }) => sup.guard?.(c, dmg, fromX, source))) return;
    let taken = this.curseLeft ? CURSE.taken : 1;
    for (const { sup, c } of effects) taken *= typeof sup.taken === 'function' ? sup.taken(c, source) : (sup.taken ?? 1);
    const result = this.player.hurt(dmg * taken, fromX);
    this.passive.onAttacked?.(this.pctx, result, source);
    if (result === 'hit') for (const { sup, c } of effects) sup.onHurt?.(c, dmg, fromX, source);
    if (result === 'hit' && this.stats.ironQuake && this.time.now >= this.quakeReady) this.ironQuake();
    if (result === 'dead') return this.playerDown();
    if (result === 'hit' && debuff) this.player.afflict(debuff, dmg);
    if (result === 'hit' && source?.active && this.stats.thorns) this.damage(source, this.stats.thorns, COLOR.gray, 80);
  }

  /** BESI III: a hit taken shakes the ground around the hero (once a second). */
  private ironQuake(): void {
    const p = this.player;
    this.quakeReady = this.time.now + 1000;
    ring(this, p.x, p.y + 6, 0xc2c3c7, 4, 42, 300, 3);
    ring(this, p.x, p.y + 6, 0x5f574f, 2, 30, 240, 2);
    burst(this, p.x, FLOOR_Y, 0xc2c3c7, 10);
    this.cameras.main.shake(140, 0.012);
    this.area(p.x, p.y, 42, 2, 220, 'proc');
  }

  private playerDown(): void {
    if (this.godHandLeft > 0 && this.stats.godHand) {
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
    else if (this.save.perks.nyawa && !this.revived) this.secondLife();
    else this.die();
  }

  /** NYAWA KEDUA (hub perk): once per run, the hero gets back up. */
  private secondLife(): void {
    this.revived = true;
    this.player.clearDebuffs();
    this.player.hp = Math.round(this.stats.maxHp * 0.4);
    this.player.invuln(2000);
    sfx('revive');
    ring(this, this.player.x, this.player.y, 0x29adff, 4, 40, 400, 2);
    sparks(this, this.player.x, this.player.y, [0x29adff, 0xfff1e8], 18, 26);
    this.cameras.main.flash(300, 41, 173, 255);
    floatText(this, this.player.x, this.player.y - 16, 'NYAWA KEDUA!', COLOR.blue);
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
    for (const p of [this.player, this.benchPlayer]) if (p) this.wireBossTo(p, boss);
    this.physics.add.overlap(this.shots, boss, (a, b) => this.shotHit(a, b));
  }

  private wireBossTo(p: Player, boss: Boss): void {
    this.physics.add.overlap(
      p,
      boss,
      () => boss.active && !boss.untargetable && !this.frozen(boss) && this.hurtPlayer(boss.damage, boss.x, boss),
    );
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

  /** What the door taken into this round pays: a shop, heroes, a cursed (legend+) pick, or the usual reward. */
  private rollPanel(): Reward[] {
    const owned = [...this.items, ...this.spent];
    const plain = !this.cfg.boss && !this.invaded && !this.bossLeft;
    this.panel = plain && this.gate === 'toko' ? 'shop' : plain && this.gate === 'pahlawan' ? 'hero' : 'reward';
    if (this.panel === 'shop') return rollShop(this.cfg.round, owned);
    if (this.panel === 'hero') return rollHeroes(this.bench ? [this.cls, this.bench] : [this.cls]);
    // KUTUKAN pays like a boss two tiers on.
    const round = plain && this.gate === 'kutukan' ? (Math.ceil(this.cfg.round / BOSS_EVERY) + 2) * BOSS_EVERY : this.rewardRound;
    return rollRewards(round, owned, Math.random, this.items);
  }

  private showRewards(): void {
    this.rewards = this.rollPanel();
    this.rewardSel = 0;
    this.rerolls = 0;
    this.sold = new Set();
    this.buildRewardUi();
  }

  /** The "take nothing" / "leave the shop" row comes after the rewards. */
  private get skipRow(): number {
    return this.rewards?.length ?? 0;
  }

  private buildRewardUi(): void {
    this.rewardUi?.destroy();
    const rewards = this.rewards ?? [];
    const shop = this.panel === 'shop';
    const top = shop ? SHOP_Y : REWARD_Y;
    const rowH = shop ? SHOP_H : REWARD_H;
    const ui = this.add.container(0, 0).setDepth(200);
    ui.add(this.add.rectangle(W / 2, H / 2 + 12, 290, 146, 0x000000, 0.85).setStrokeStyle(1, 0x83769c));
    const title = shop
      ? 'TOKO'
      : this.panel === 'hero'
        ? 'PILIH PAHLAWAN'
        : this.cfg.boss
          ? 'HADIAH BOSS!'
          : this.cfg.eliteRound
            ? 'HADIAH ELIT!'
            : this.gate === 'kutukan'
              ? 'HADIAH KUTUKAN!'
              : 'PILIH HADIAH';
    ui.add(text(this, W / 2, top - 16, title, COLOR.gold).setOrigin(0.5, 0));
    ui.add([this.add.image(W - 50, top - 12, 'coin'), text(this, W - 44, top - 16, `${this.coins}`, COLOR.gold)]);
    const full = this.items.length >= this.slots;
    ui.add(text(this, 20, top - 16, `RELIK ${this.items.length}/${this.slots}`, full ? COLOR.red : COLOR.gray));
    rewards.forEach((r, i) => {
      const info = rewardInfo(r);
      const rarity = rewardRarity(r);
      const y = top + i * rowH;
      const sold = this.sold.has(i);
      const row = this.add.zone(W / 2, y + rowH / 2 - 4, 280, rowH - 2).setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => {
        this.rewardSel = i;
        this.takeReward();
      });
      ui.add([
        row,
        text(this, 20, y + (shop ? 1 : 3), '>', COLOR.gold).setName(`sel${i}`),
        this.add.image(34, y + (shop ? 5 : 7), info.icon).setScale(r.type === 'hero' ? 0.9 : 1),
        text(this, 50, y, info.name, sold ? COLOR.gray : RARITY_COLOR[rarity]),
        text(this, 50, y + (shop ? 8 : 10), sold ? 'TERJUAL' : info.desc, COLOR.gray, shop ? 6 : 8),
      ]);
      if (shop && !sold) {
        ui.add([
          this.add.image(W - 30, y + 4, 'coin'),
          text(this, W - 24, y, `${r.price ?? 0}`, (r.price ?? 0) <= this.coins ? COLOR.gold : COLOR.red),
        ]);
      }
      // Tags, right-aligned, each in its own color.
      let x = shop ? W - 36 : W - 20;
      for (const tag of r.type === 'item' && !sold ? [...ITEM_TAGS[r.id]].reverse() : []) {
        const label = text(this, x, y + 1, TAGS[tag].name, TAGS[tag].color, 6).setOrigin(1, 0);
        ui.add(label);
        x -= label.width + 4;
      }
      if (r.type === 'hero') ui.add(text(this, W - 20, y + 1, 'HERO', COLOR.blue, 6).setOrigin(1, 0));
    });
    const skipY = top + this.skipRow * rowH;
    const skip = this.add.zone(W / 2, skipY + 4, 280, 12).setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => {
      this.rewardSel = this.skipRow;
      this.takeReward();
    });
    const cost = this.rerollCost;
    const refresh = text(
      this,
      W / 2,
      skipY + 14,
      `${padConnected() ? 'D-PAD PILIH  A' : 'W/S PILIH  J'} ${shop ? 'BELI' : 'AMBIL'}  ${padConnected() ? 'Y' : 'R'} REFRESH ${cost || 'GRATIS'}`,
      this.coins >= cost ? COLOR.blue : COLOR.gray,
    )
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.reroll());
    ui.add([
      skip,
      text(this, 20, skipY, '>', COLOR.gold).setName(`sel${this.skipRow}`),
      text(this, 50, skipY, shop ? 'SELESAI (KELUAR TOKO)' : 'LEWATI (TIDAK AMBIL APA-APA)', COLOR.gray),
      refresh,
      text(this, 20, skipY + 26, '', COLOR.gray).setName('setName'),
      text(this, 20, skipY + 36, '', COLOR.gray).setName('setDesc'),
    ]);
    this.rewardUi = ui;
    this.refreshRewards();
  }

  private get rerollCost(): number {
    return rerollCost(this.rerolls, !!this.save.perks.refresh);
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
      text(this, W / 2, 33, `RELIK PENUH ${this.items.length}/${this.slots}`, COLOR.red).setOrigin(0.5, 0),
      text(this, W / 2, 43, `GANTI: ${ITEMS[neu].name}`, RARITY_COLOR[ITEMS[neu].rarity]).setOrigin(0.5, 0),
    ]);
    // Ten slots need tighter rows.
    const step = this.items.length > 8 ? 8 : 10;
    const rowY = (i: number) => 55 + i * step;
    const row = (i: number) =>
      this.add
        .zone(W / 2, rowY(i) + 4, 280, step)
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
        text(this, W - 20, y + 1, ITEM_TAGS[id].map((t) => TAGS[t].name).join(' '), COLOR.gray, 6).setOrigin(1, 0),
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
    const cost = this.rerollCost;
    if (this.coins < cost) {
      sfx('deny');
      this.cameras.main.shake(80, 0.005);
      floatText(this, W / 2, REWARD_Y - 24, 'KOIN KURANG', COLOR.red);
      return;
    }
    this.coins -= cost;
    sfx('coin');
    this.rerolls++;
    this.rewards = this.rollPanel();
    this.sold = new Set();
    this.buildRewardUi();
  }

  private moveReward(d: number): void {
    if (!this.rewards) return;
    sfx('move');
    this.rewardSel = Phaser.Math.Wrap(this.rewardSel + d, 0, this.rewardRows);
    this.refreshRewards();
  }

  /** Rows of the open panel: the rewards + skip, or the owned items + cancel in the replace step. */
  private get rewardRows(): number {
    return this.replacing ? this.items.length + 1 : this.skipRow + 1;
  }

  private refreshRewards(): void {
    for (let i = 0; i < this.rewardRows; i++) {
      (this.rewardUi?.getByName(`sel${i}`) as Phaser.GameObjects.Text | null)?.setVisible(i === this.rewardSel);
    }
    const name = this.rewardUi?.getByName('setName') as Phaser.GameObjects.Text | null;
    const desc = this.rewardUi?.getByName('setDesc') as Phaser.GameObjects.Text | null;
    if (!name || !desc) return;
    name.setText('').setColor(COLOR.gray);
    desc.setText('').setColor(COLOR.gray);
    if (this.replacing) {
      // Replace step: what the highlighted item does, and the tag tiers lost without it.
      const id = this.items[this.rewardSel];
      if (!id) return;
      name.setText(ITEMS[id].desc);
      const lost = this.tierChanges(this.items.filter((x) => x !== id));
      desc.setText(lost.length ? `HILANG: ${lost.join(' ')}` : '');
      return;
    }
    const r = this.rewards?.[this.rewardSel];
    if (r?.type === 'hero') {
      name.setText(this.bench ? `GANTI ${CLASSES[this.bench].name} (CADANGAN)` : 'JADI HERO CADANGAN').setColor(COLOR.blue);
      desc.setText(`DUKUNGAN: ${CLASSES[r.cls].support.name}`).setColor(COLOR.gold);
      return;
    }
    if (r?.type !== 'item') return;
    // Tag progress if taken: the tier it would reach, or how far the next one is.
    const after = [...this.items, r.id];
    const gained = this.tierChanges(this.items, after);
    const n = tagCounts(after);
    name.setText(ITEM_TAGS[r.id].map((t) => `${TAGS[t].name} ${n[t]}/${TAG_TIERS[Math.min(2, tierOf(n[t]))]}`).join('  '));
    if (gained.length) {
      name.setColor(COLOR.gold);
      desc.setText(`BARU: ${gained[0]} ${this.tierDesc(gained[0])}`).setColor(COLOR.gold);
      return;
    }
    const tag = ITEM_TAGS[r.id].find((t) => tierOf(n[t]) < 3);
    if (tag) desc.setText(`${TAGS[tag].name} ${TIER_MARK[tierOf(n[tag]) + 1]}: ${TAGS[tag].tiers[tierOf(n[tag])].desc}`);
  }

  /** Tag tiers held by `after` but not by `before`, as "API II" labels. */
  private tierChanges(before: readonly ItemId[], after: readonly ItemId[] = this.items): string[] {
    const label = (x: { tag: Tag; tier: number }) => `${TAGS[x.tag].name} ${TIER_MARK[x.tier]}`;
    const had = new Set(activeTiers(before).map(label));
    return activeTiers(after)
      .map(label)
      .filter((l) => !had.has(l));
  }

  /** "API II" -> that tier's description. */
  private tierDesc(label: string): string {
    const [name, mark] = label.split(' ');
    const tag = (Object.keys(TAGS) as Tag[]).find((t) => TAGS[t].name === name)!;
    return TAGS[tag].tiers[TIER_MARK.indexOf(mark as (typeof TIER_MARK)[number]) - 1].desc;
  }

  private takeReward(): void {
    if (!this.rewards || this.paused) return;
    const shop = this.panel === 'shop';
    let drop: number | undefined;
    let r: Reward | undefined;
    let row = this.rewardSel;
    if (this.replacing) {
      const id = this.replacing;
      this.replacing = undefined;
      // Cancel row: back to the panel, on the item that was picked.
      if (this.rewardSel >= this.items.length) {
        sfx('back');
        this.rewardSel = this.replacingRow;
        return this.buildRewardUi();
      }
      drop = this.rewardSel;
      row = this.replacingRow;
      r = this.rewards[row];
      if (r?.type !== 'item' || r.id !== id) return this.buildRewardUi();
    } else {
      r = this.rewardSel === this.skipRow ? undefined : this.rewards[this.rewardSel];
      if (r && shop && (this.sold.has(row) || this.coins < (r.price ?? 0))) {
        sfx('deny');
        this.cameras.main.shake(80, 0.005);
        if (!this.sold.has(row)) floatText(this, W / 2, SHOP_Y - 24, 'KOIN KURANG', COLOR.red);
        return;
      }
      // All relic slots taken: first choose which owned item makes room. Potions and heroes never need a slot.
      if (r?.type === 'item' && !takeItem(this.items, r.id, undefined, this.slots)) {
        sfx('move');
        this.replacing = r.id;
        this.replacingRow = row;
        this.rewardSel = 0;
        return this.buildReplaceUi();
      }
    }
    // The shop stays open until SELESAI: each buy marks its row sold.
    if (shop && r) {
      this.coins -= r.price ?? 0;
      this.sold.add(row);
      sfx('coin');
      this.applyReward(r, drop);
      this.rewardSel = row;
      return this.buildRewardUi();
    }
    this.rewards = undefined;
    this.rewardUi?.destroy();
    // The J/W presses used in the menu must not leak into a swing or jump.
    this.input.keyboard!.resetKeys();
    sfx(r ? 'reward' : 'back');
    if (r) this.applyReward(r, drop);
    else floatText(this, this.player.x, this.player.y - 16, shop ? 'SAMPAI JUMPA' : 'DILEWATI', COLOR.gray);
    this.openDoors();
  }

  /** `drop`: index of the owned item discarded to make room (it may be offered again later). */
  private applyReward(r: Reward, drop?: number): void {
    if (r.type === 'hero') {
      this.recruit(r.cls);
      return this.drawInventory();
    }
    const oldMax = this.stats.maxHp;
    if (r.type === 'potion') this.player.heal(Math.round(this.stats.maxHp * 0.5));
    const dropped = drop === undefined ? undefined : this.items[drop];
    const before = this.items;
    if (r.type === 'item') this.items = takeItem(this.items, r.id, drop, this.slots) ?? this.items;
    const gained = this.tierChanges(before, this.items);
    this.player.equip(this.currentStats(), WEAPONS[this.weaponId]);
    if (this.stats.maxHp > oldMax) this.player.heal(this.stats.maxHp - oldMax);
    floatText(this, this.player.x, this.player.y - 16, rewardInfo(r).name, COLOR.gold);
    if (dropped) floatText(this, this.player.x, this.player.y - 40, `BUANG ${ITEMS[dropped].name}`, COLOR.gray);
    if (gained.length) {
      floatText(this, this.player.x, this.player.y - 28, `${gained.join(' ')}!`, COLOR.gold);
      sfx('set');
      this.cameras.main.flash(200, 255, 236, 39);
    }
    this.drawInventory();
  }

  /**
   * Doors out of the round: one to the boss when a boss (or bonus bosses) is next; else two (three with MATA GERBANG),
   * each labelled with the gate it leads to. They take a moment to open, so the hero is not pulled in on the spot.
   */
  private openDoors(): void {
    sfx('portal');
    const round = this.cfg.round + 1;
    this.nextSpecials = rollSpecials(round);
    const boss = this.nextSpecials.length > 0 || isBossRound(round);
    const gates: (Gate | undefined)[] = boss ? [undefined] : Phaser.Utils.Array.Shuffle(rollGates(round, this.save.perks.gerbang ? 3 : 2));
    const gap = gates.length === 3 ? 92 : 112;
    this.doorsArmAt = this.time.now + 600;
    this.doors = gates.map((gate, i) => {
      const x = W / 2 + (i - (gates.length - 1) / 2) * gap;
      const color = gate ? GATES[gate].color : 0xff004d;
      const img = this.physics.add
        .staticImage(x, FLOOR_Y - 8, 'portal')
        .setDepth(3)
        .setAlpha(0)
        .setTint(color);
      this.tweens.add({ targets: img, alpha: 1, duration: 400 });
      this.tweens.add({ targets: img, scaleX: 0.85, yoyo: true, repeat: -1, duration: 300 });
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      const name = gate ? GATES[gate].name : this.nextSpecials.length ? 'BONUS' : 'BOS';
      const hint = gate ? GATES[gate].hint : this.nextSpecials.map((k) => BOSSES[k].name).join('+') || `ROUND ${round}`;
      const labels = [
        text(this, x, FLOOR_Y - 34, name, hex).setOrigin(0.5, 0),
        text(this, x, FLOOR_Y - 25, hint, COLOR.gray, 6).setOrigin(0.5, 0),
      ];
      labels.forEach((l) => l.setDepth(5).setAlpha(0).setStroke('#000000', 3));
      this.tweens.add({ targets: labels, alpha: 1, duration: 400 });
      sparks(this, x, FLOOR_Y - 8, [color, 0xfff1e8], 8, 14);
      return { img, gate };
    });
  }

  private nextRound(gate?: Gate): void {
    this.doors = [];
    const round = this.cfg.round + 1;
    const specials = this.nextSpecials;
    const eliteRound = gate === 'elit';
    this.scene.restart({
      round,
      specials,
      eliteRound,
      gate,
      // Hidden bosses only crash into plain rounds.
      invasion: specials.length || eliteRound || gate === 'kutukan' ? undefined : rollInvasion(round),
      hp: this.player.hp,
      runSouls: this.runSouls,
      weapon: this.weaponId,
      cls: this.cls,
      bench: this.bench,
      revived: this.revived,
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
    const n = tagCounts(this.items);
    const tags = (Object.keys(TAGS) as Tag[]).filter((t) => tierOf(n[t])).map((t) => `${TAGS[t].name} ${TIER_MARK[tierOf(n[t])]}`);
    const sound = `${padConnected() ? 'Y' : 'M'} ${soundLabel()}`;
    this.pauseText
      .setText(
        [
          'PAUSE',
          '',
          `PASIF: ${CLASSES[this.cls].passive.name}`,
          `PASIF II: ${CLASSES[this.cls].passive2.name}`,
          `DUKUNGAN: ${CLASSES[this.cls].support.name}`,
          `TAHAN ${padConnected() ? 'X' : 'J'}: ${CHARGED[this.cls].name}`,
          '',
          ...(tags.length ? [`TAG: ${tags.join('  ')}`] : []),
          ...(this.bench
            ? [`CADANGAN (${padConnected() ? 'LB' : 'U'}): ${CLASSES[this.bench].name}`, `+ DUKUNGAN: ${CLASSES[this.bench].support.name}`]
            : []),
          ...(tags.length || this.bench ? [''] : []),
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
    const n = tagCounts(this.items);
    this.items.forEach((id, i) => {
      const x = 30 + i * 9;
      const rarity = ITEMS[id].rarity;
      // Colored frame marks rare+ items.
      if (rarity !== 'biasa')
        inv.add(this.add.rectangle(x, H - 6, 9, 9).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(RARITY_COLOR[rarity]).color));
      inv.add(this.add.image(x, H - 6, `i_${id}`));
      // Underline in the color of its tag that has reached a tier.
      const lit = ITEM_TAGS[id].find((t) => tierOf(n[t]));
      if (lit) inv.add(this.add.rectangle(x, H - 1, 7, 1, Phaser.Display.Color.HexStringToColor(TAGS[lit].color).color));
    });
    // The benched hero, after the relic slots; it dims while the swap recharges (drawHud).
    this.benchIcon = this.bench
      ? this.add
          .image(30 + this.slots * 9 + 4, H - 8, `hero_idle_${this.bench}`)
          .setScale(0.8)
          .setDepth(100)
      : undefined;
    if (this.benchIcon) inv.add([this.benchIcon, text(this, this.benchIcon.x + 6, H - 9, padConnected() ? 'LB' : 'U', COLOR.gray, 6)]);
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
    this.debuffText.setText(
      [
        this.curseLeft ? `KUTUKAN ${this.curseLeft}` : '',
        this.spellCharges ? `ARCANA ${this.spellCharges}` : '',
        p.fury ? `AMARAH ${p.fury}` : '',
        p.debuffNames,
      ]
        .filter(Boolean)
        .join(' '),
    );
    this.benchIcon?.setAlpha(this.time.now < this.swapReadyAt ? 0.35 : 1);
    this.soulText.setText(`${this.runSouls}`);
    this.coinText.setText(`${this.coins}`);
    // Small bars over hurt enemies; gold for elites.
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active || !e.visible || e.hp >= e.maxHp) continue;
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
