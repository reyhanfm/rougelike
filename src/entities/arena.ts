import type Phaser from 'phaser';
import type { Status } from '../logic/loot.ts';
import type { Debuff, EnemyKind } from '../logic/stages.ts';

/** What enemies and bosses may do to the world. RunScene implements it. */
export interface Arena {
  readonly player: Phaser.GameObjects.Sprite;
  /** Multiplier on enemy pauses between actions (enemyPace). */
  readonly pace: number;
  /** Hostile projectile. */
  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity?: boolean, debuff?: Debuff): void;
  shockwave(x: number, y: number, damage: number, debuff?: Debuff): void;
  meteors(count: number, damage: number): void;
  /** Wide attack: a red warning box for `warnMs`, then it strikes once (hurts the player if inside). */
  zone(x: number, y: number, w: number, h: number, warnMs: number, damage: number): void;
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
  /** Blows up on the first hit: area damage of this radius (80% of mult). */
  explode?: number;
}

/** What the player's attacks and skills may do to the world. RunScene implements it. */
export interface PlayerWorld {
  shot(s: ShotSpec): Phaser.GameObjects.GameObject;
  /** Hit every enemy within `radius` of (x, y) once. */
  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource, status?: Status): void;
  /** Living enemies and boss, nearest to (x, y) first. */
  targets(x: number, y: number): Phaser.GameObjects.Sprite[];
  strike(target: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean, status?: Status): void;
}
