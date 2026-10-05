import type Phaser from 'phaser';
import type { Status } from '../logic/loot.ts';
import type { Debuff, EnemyKind } from '../logic/stages.ts';

/** What enemies and bosses may do to the world. RunScene implements it. */
export interface Arena {
  readonly player: Phaser.GameObjects.Sprite;
  /** Bosses and elites bite a share of it (bossBite, ELITE.bite). */
  readonly playerMaxHp: number;
  /** Multiplier on enemy pauses between actions (enemyPace). */
  readonly pace: number;
  /** Hostile projectile. */
  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity?: boolean, debuff?: Debuff): void;
  shockwave(x: number, y: number, damage: number, debuff?: Debuff): void;
  meteors(count: number, damage: number): void;
  /** Wide attack: a red warning box for `warnMs`, then it strikes once (hurts the player if inside); `color` of the blast. */
  zone(x: number, y: number, w: number, h: number, warnMs: number, damage: number, color?: number): void;
  /** A boss leaves the fight without being beaten (Mahoraga's time runs out). */
  bossLeaves(boss: Phaser.GameObjects.Sprite): void;
  summon(kind: EnemyKind, x: number, y: number): void;
  /** Heal enemies near (x, y) by a fraction of their max HP (support enemies). */
  healAllies(x: number, y: number, radius: number, fraction: number, except: Phaser.GameObjects.GameObject): void;
}

export type HitSource = 'basic' | 'skill' | 'ult' | 'proc';

export interface ShotSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  texture: string;
  /** Damage multiplier on the player's damage stat. */
  mult: number;
  source: HitSource;
  /** Passes through enemies, hitting each once. */
  pierce?: boolean;
  knockback?: number;
  tint?: number;
  /** Steers toward the nearest enemy (Magic Archer lead arrow, flying swords). */
  homing?: boolean;
  /** Turns back after a hit (or a timeout, or the arena edge) and is gone once it reaches the player. */
  returning?: boolean;
  status?: Status;
  /** Turns end over end in flight (thrown blades). */
  spin?: boolean;
  /** Blows up on the first hit: area damage of this radius (80% of mult). */
  explode?: number;
}

/** What the player's attacks and skills may do to the world. RunScene implements it. */
export interface PlayerWorld {
  shot(s: ShotSpec): Phaser.GameObjects.GameObject;
  /** Drag every enemy (not bosses) within `radius` toward (x, y) at `speed` px/s. */
  pull(x: number, y: number, radius: number, speed: number): void;
  /** Hurl every enemy (not bosses) within `radius` of (x, y) straight down at `speed` px/s. */
  slam(x: number, y: number, radius: number, speed: number): void;
  /** Hit every enemy within `radius` of (x, y) once. */
  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource, status?: Status): void;
  /** Living enemies and boss, nearest to (x, y) first. */
  targets(x: number, y: number): Phaser.GameObjects.Sprite[];
  /** `knockback` defaults to a light push; 0 for damage that must not move the target (bleed ticks). */
  strike(target: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean, status?: Status, knockback?: number): void;
  /** Apply a status (slow/freeze/burn) without a hit. */
  afflict(target: Phaser.GameObjects.Sprite, status: Status): void;
  /** Hostile projectiles in flight (Gojo's Infinity stops them). */
  hostiles(): Phaser.Physics.Arcade.Image[];
}
