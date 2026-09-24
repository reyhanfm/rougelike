import Phaser from 'phaser';
import type { Arena, HitSource, PlayerWorld, ShotSpec } from '../entities/arena.ts';
import { Boss } from '../entities/Boss.ts';
import { createEnemy, Enemy } from '../entities/Enemy.ts';
import { Player } from '../entities/Player.ts';
import { COLOR } from '../gfx/sprites.ts';
import { burst, flash, floatText, FLOOR_Y, H, text, TILE, W } from '../gfx/ui.ts';
import {
  ITEMS,
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
  type WeaponId,
} from '../logic/loot.ts';
import { loadSave, writeSave, type SaveData } from '../logic/save.ts';
import { BOSS_LAYOUT, ENEMIES, LAYOUTS, pickEnemies, roundConfig, soulReward, type EnemyKind, type RoundConfig } from '../logic/stages.ts';
import { derive, type Derived } from '../logic/stats.ts';
import type { HubData } from './HubScene.ts';
import { CLASSES, hasSynergy, type ClassId } from '../logic/classes.ts';

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
}

type Hittable = Enemy | Boss;

const MAX_SUMMONS = 6;
/** Homing arrows: max turn rate (rad/s) and lifetime (ms). */
const HOMING_TURN = 8;
const HOMING_LIFE = 2500;
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
  private enemies!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private shots!: Phaser.Physics.Arcade.Group;
  private boss?: Boss;
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
  private bossTitle?: Phaser.GameObjects.Text;

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
    this.cfg = roundConfig(data.round);
    this.cls = data.cls ?? this.save.cls;
    this.weaponId = data.weapon ?? CLASSES[this.cls].weapon;
    this.items = [...(data.items ?? [])];
    this.runSouls = data.runSouls ?? 0;
    this.coins = data.coins ?? 0;
    this.cleared = this.over = this.paused = false;
    this.regenAcc = this.lifestealAcc = 0;
    this.boss = this.portal = this.rewards = this.rewardUi = this.inventory = undefined;
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
      if (!en.untargetable) this.hurtPlayer(en.damage, en.x, en);
    });
    this.physics.add.overlap(this.player, this.hazards, (_p, h) => {
      const hz = h as Phaser.Physics.Arcade.Image;
      this.hurtPlayer(hz.getData('dmg') as number, hz.x);
      if (hz.texture.key !== 'wave') hz.destroy();
    });
    this.physics.add.overlap(this.shots, this.enemies, (a, b) => this.shotHit(a, b));

    if (this.cfg.boss) {
      this.boss = new Boss(this, this, W - 40, FLOOR_Y - 40, this.cfg);
      this.physics.add.collider(this.boss, floor);
      this.physics.add.overlap(this.player, this.boss, () => this.boss && this.hurtPlayer(this.boss.damage, this.boss.x, this.boss));
      this.physics.add.overlap(this.shots, this.boss, (a, b) => this.shotHit(a, b));
    } else {
      pickEnemies(this.cfg.round, this.cfg.enemyCount).forEach((kind, i) => {
        const flying = ENEMIES[kind].flying;
        const x = Phaser.Math.Between(flying ? 60 : 90, W - 16);
        this.spawnEnemy(kind, x, flying ? Phaser.Math.Between(24, 60) : -10 - i * 24);
      });
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
    this.regenerate(delta);
    for (const e of this.enemies.getChildren() as Enemy[]) e.tick(time);
    this.boss?.tick(time);
    if (this.player.swinging) this.swordHits();
    for (const h of this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const landed = h.texture.key !== 'wave' && h.y > FLOOR_Y;
      if (landed && h.texture.key === 'bomb') this.explode(h.x, h.getData('dmg') as number);
      if (landed) burst(this, h.x, FLOOR_Y, h.texture.key === 'meteor' ? 0xffa300 : 0x00e436, 5);
      if (landed || h.x < -10 || h.x > W + 10 || h.y > H + 10 || h.y < -40) h.destroy();
    }
    for (const s of this.shots.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if ((s.getData('shot') as ShotSpec).homing) this.steer(s, delta);
      const landed = s.texture.key !== 'wave' && s.y > FLOOR_Y;
      if (landed) burst(this, s.x, FLOOR_Y, 0xc2c3c7, 3);
      if (landed || s.x < -20 || s.x > W + 20) s.destroy();
    }

    if (!this.cleared && this.enemies.countActive() === 0 && !this.boss) this.clearRound();
    if (this.portal && this.physics.overlap(this.player, this.portal)) this.nextRound();
    this.drawHud();
  }

  // --- Arena: what enemies and bosses may do ---

  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity = false): void {
    const h = this.physics.add.image(x, y, texture).setDepth(6);
    this.hazards.add(h);
    h.setData('dmg', damage)
      .setVelocity(vx, vy)
      .setRotation(texture === 'arrow' ? Math.atan2(vy, vx) : 0);
    (h.body as Phaser.Physics.Arcade.Body).setAllowGravity(gravity);
  }

  shockwave(x: number, y: number, damage: number): void {
    for (const dir of [-1, 1]) this.fire(x + dir * 8, y - 3, dir * 130, 0, 'wave', damage);
  }

  private explode(x: number, damage: number): void {
    const y = FLOOR_Y - 6;
    burst(this, x, y, 0xffa300, 14);
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xff004d).setDepth(12);
    this.tweens.add({ targets: ring, radius: 24, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
    this.cameras.main.shake(80, 0.006);
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 24) this.hurtPlayer(damage, x);
  }

  meteors(count: number, damage: number): void {
    for (let i = 0; i < count; i++) {
      // First one always targets the player; the rest scatter.
      const x = i === 0 ? this.player.x : Phaser.Math.Between(16, W - 16);
      const warn = this.add.rectangle(x, FLOOR_Y - 1, 10, 2, 0xff004d).setDepth(4);
      this.tweens.add({ targets: warn, alpha: 0.2, yoyo: true, repeat: -1, duration: 80 });
      this.time.delayedCall(700 + i * 150, () => {
        warn.destroy();
        if (this.boss && !this.over) this.fire(x, -10, 0, 260, 'meteor', damage);
      });
    }
  }

  summon(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.countActive() >= MAX_SUMMONS) return;
    burst(this, x, y, 0x7e2553, 6);
    this.spawnEnemy(kind, Phaser.Math.Clamp(x, 16, W - 16), y);
  }

  // --- internals ---

  private spawnEnemy(kind: EnemyKind, x: number, y: number): void {
    const e = createEnemy(this, this, kind, x, y, this.cfg.enemyHp, this.cfg.enemyDamage);
    this.enemies.add(e);
    e.setup();
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

  shot(spec: ShotSpec): void {
    const homing = spec.homing ?? (spec.texture === 'arrow' && this.stats.homingArrows > 0);
    spec = { ...spec, homing, tint: spec.tint ?? (homing ? 0xff77a8 : undefined) };
    const img = this.physics.add.image(spec.x, spec.y, spec.texture).setDepth(9);
    this.shots.add(img);
    img.setVelocity(spec.vx, spec.vy).setData('shot', spec).setData('hits', new Set<object>()).setData('born', this.time.now);
    // Long thin projectiles point along their path; the rest just face their direction.
    if (['arrow', 'bullet', 'w_belati', 'w_tombak'].includes(spec.texture)) img.setRotation(Math.atan2(spec.vy, spec.vx));
    else img.setFlipX(spec.vx < 0);
    if (spec.tint !== undefined) img.setTint(spec.tint);
  }

  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource): void {
    if (this.over) return;
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xfff1e8).setDepth(12);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
    for (const t of this.hittables()) {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) <= radius) this.attack(t, mult, source, knockback, false, x, y);
    }
  }

  targets(x: number, y: number): Phaser.GameObjects.Sprite[] {
    return this.hittables().sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y));
  }

  strike(t: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean): void {
    if (!this.over && t.active) this.attack(t as Hittable, mult, source, 120, crit);
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
      (HOMING_TURN * delta) / 1000,
    );
    body.velocity.setToPolar(next, speed);
    shot.setRotation(next);
  }

  private hittables(): Hittable[] {
    const list: Hittable[] = (this.enemies.getChildren() as Enemy[]).filter((e) => e.active && !e.untargetable);
    if (this.boss?.active) list.push(this.boss);
    return list;
  }

  /** Phaser passes (sprite, groupChild) for group-vs-sprite overlaps, so sort the pair out here. */
  private shotHit(a: unknown, b: unknown): void {
    const aIsShot = this.shots.contains(a as Phaser.GameObjects.GameObject);
    const shot = (aIsShot ? a : b) as Phaser.Physics.Arcade.Image;
    const t = (aIsShot ? b : a) as Hittable;
    if (!shot.active || !t.active) return;
    const hits = shot.getData('hits') as Set<object>;
    if (hits.has(t)) return;
    hits.add(t);
    const spec = shot.getData('shot') as ShotSpec;
    if (!spec.pierce) shot.destroy();
    this.attack(t, spec.mult, spec.source, spec.knockback ?? 80, false, shot.x, shot.y);
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
    const crit = forceCrit || Math.random() < st.critChance;
    const enraged = st.rage > 0 && this.player.hp < st.maxHp / 2;
    const dmg = Math.max(1, Math.round(st.damage * mult * (crit ? st.critMult : 1) * (enraged ? 1 + st.rage : 1)));
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
    const execute = t instanceof Boss ? this.stats.execute / 2 : this.stats.execute;
    if (t.hp > 0 && t.hp <= t.maxHp * execute) {
      t.hp = 0;
      floatText(this, t.x, t.y - 20, 'EKSEKUSI', COLOR.red);
    }
    flash(t, 0xffffff, t instanceof Boss ? t.baseTint : 0xffffff);
    burst(this, t.x, t.y, 0xfff1e8, 4);
    if (!(t instanceof Boss)) t.knockback(Math.sign(t.x - this.player.x) || this.player.facing, knockback);
    if (t.hp > 0) return false;
    const souls =
      t instanceof Boss
        ? soulReward('boss', this.cfg.round, this.stats.soulMult)
        : soulReward('enemy', this.cfg.round, this.stats.soulMult, ENEMIES[t.kind].soul);
    this.save.souls += souls;
    this.runSouls += souls;
    writeSave(this.save);
    floatText(this, t.x, t.y - 20, `+${souls}`, COLOR.blue);
    if (this.stats.healOnKill) this.player.heal(this.stats.healOnKill);
    if (t instanceof Boss) {
      burst(this, t.x, t.y, 0xff004d, 24);
      this.cameras.main.shake(400, 0.02);
      this.hazards.clear(true, true);
      // Summons vanish with their master (no souls).
      for (const e of this.enemies.getChildren() as Enemy[]) burst(this, e.x, e.y, 0x7e2553, 6);
      this.enemies.clear(true, true);
      this.boss = undefined;
      this.bossTitle?.setVisible(false);
    } else {
      burst(this, t.x, t.y, 0x00e436, 10);
    }
    t.destroy();
    return true;
  }

  private hurtPlayer(dmg: number, fromX: number, source?: Hittable): void {
    if (this.over || this.cleared) return;
    const result = this.player.hurt(dmg, fromX);
    if (result === 'dead') return this.items.includes('phoenix') ? this.revive() : this.die();
    if (result === 'hit' && source?.active && this.stats.thorns) this.damage(source, this.stats.thorns, COLOR.gray, 80);
  }

  /** Bulu Phoenix: consumed instead of dying. */
  private revive(): void {
    this.items.splice(this.items.indexOf('phoenix'), 1);
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
    const msg = this.cfg.boss ? 'BOSS KALAH!' : 'ROUND BERSIH';
    const banner = text(this, W / 2, 30, msg, COLOR.gold, this.cfg.boss ? 16 : 8).setOrigin(0.5);
    const earned = coinReward(this.cfg.round, this.stats.coinBonus);
    this.coins += earned;
    floatText(this, this.player.x, this.player.y - 28, `+${earned} KOIN`, COLOR.gold);
    this.tweens.add({ targets: banner, alpha: 0, delay: 1200, duration: 400 });
    this.time.delayedCall(500, () => this.showRewards());
  }

  private showRewards(): void {
    this.rewards = rollRewards(this.cfg.round);
    this.rewardSel = 0;
    this.rerolls = 0;
    this.buildRewardUi();
  }

  private buildRewardUi(): void {
    this.rewardUi?.destroy();
    const rewards = this.rewards ?? [];
    const ui = this.add.container(0, 0).setDepth(200);
    ui.add(this.add.rectangle(W / 2, H / 2 + 6, 290, 132, 0x000000, 0.85).setStrokeStyle(1, 0x83769c));
    ui.add(text(this, W / 2, REWARD_Y - 16, this.cfg.boss ? 'HADIAH BOSS!' : 'PILIH HADIAH', COLOR.gold).setOrigin(0.5, 0));
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
        text(this, W - 20, y, rarity === 'biasa' ? '' : rarity.toUpperCase(), RARITY_COLOR[rarity]).setOrigin(1, 0),
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
    this.rewards = rollRewards(this.cfg.round);
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
    if (r.type === 'item') this.items.push(r.id);
    this.player.equip(this.currentStats(), WEAPONS[this.weaponId]);
    if (this.stats.maxHp > oldMax) this.player.heal(this.stats.maxHp - oldMax);
    floatText(this, this.player.x, this.player.y - 16, rewardInfo(r).name, COLOR.gold);
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
    this.scene.restart({
      round: this.cfg.round + 1,
      hp: this.player.hp,
      runSouls: this.runSouls,
      weapon: this.weaponId,
      cls: this.cls,
      coins: this.coins,
      items: this.items,
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
    this.pauseText.setVisible(this.paused);
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
    const label = this.cfg.boss ? `ROUND ${this.cfg.round} BOSS` : `ROUND ${this.cfg.round}`;
    text(this, W / 2, 3, label, this.cfg.boss ? COLOR.red : COLOR.text).setOrigin(0.5, 0);
    this.bossTitle = this.boss ? text(this, W / 2, 14, this.boss.title, COLOR.red).setOrigin(0.5, 0) : undefined;
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
    this.ultText.setVisible(ultFull);
    this.hpText.setText(`${p.hp}`);
    this.soulText.setText(`${this.runSouls}`);
    this.coinText.setText(`${this.coins}`);
    if (this.boss) {
      g.fillStyle(0x000000).fillRect(W / 2 - 81, 24, 162, 6);
      g.fillStyle(0x5f574f).fillRect(W / 2 - 80, 25, 160, 4);
      g.fillStyle(COLOR.hp).fillRect(W / 2 - 80, 25, Math.ceil((160 * Math.max(0, this.boss.hp)) / this.boss.maxHp), 4);
    }
  }
}
