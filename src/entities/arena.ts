import type Phaser from 'phaser';
import type { EnemyKind } from '../logic/stages.ts';

/** What enemies and bosses may do to the world. RunScene implements it. */
export interface Arena {
  readonly player: Phaser.GameObjects.Sprite;
  /** Hostile projectile. */
  fire(x: number, y: number, vx: number, vy: number, texture: string, damage: number, gravity?: boolean): void;
  shockwave(x: number, y: number, damage: number): void;
  meteors(count: number, damage: number): void;
  summon(kind: EnemyKind, x: number, y: number): void;
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
  /** Steers toward the nearest enemy. Defaults to on for player arrows when the class has homing. */
  homing?: boolean;
}

/** What the player's attacks and skills may do to the world. RunScene implements it. */
export interface PlayerWorld {
  shot(s: ShotSpec): void;
  /** Hit every enemy within `radius` of (x, y) once. */
  area(x: number, y: number, radius: number, mult: number, knockback: number, source: HitSource): void;
  /** Living enemies and boss, nearest to (x, y) first. */
  targets(x: number, y: number): Phaser.GameObjects.Sprite[];
  strike(target: Phaser.GameObjects.Sprite, mult: number, source: HitSource, crit: boolean): void;
}
